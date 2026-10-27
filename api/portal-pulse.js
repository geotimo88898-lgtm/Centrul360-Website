// GET /api/portal-pulse, the live-sync heartbeat. Returns the current data revision (bumped on
// every save, see _lib/store.js); the portal polls it and refreshes only when it moves. It also
// drives the automations (Admin → Automatizări), throttled inside tick(), and the reading of new
// Facebook leads (_lib/fb-leads.js, at most once a minute). And which version of the portal is live (the
// deploy's commit), so a portal left open loads the new one by itself.

const { readRev } = require('./_lib/store');
const { requireAuth } = require('./_lib/auth');
const { tick } = require('./_lib/workflows');
const { pollLeads } = require('./_lib/fb-leads');

const ADS_EVERY = 10 * 60e3;
let lastAds = 0;

// Vercel keeps the function alive for work after the answer (its request context's waitUntil)
function waitUntil() {
  try {
    const c = globalThis[Symbol.for('@vercel/request-context')];
    const ctx = c && typeof c.get === 'function' ? c.get() : null;
    return ctx && typeof ctx.waitUntil === 'function' ? (p) => ctx.waitUntil(p) : null;
  } catch (e) { return null; }
}

module.exports = async (req, res) => {
  if (req.method !== 'GET') {
    res.status(405).json({ error: 'method_not_allowed' });
    return;
  }
  if (!(await requireAuth(req, res))) return;
  res.setHeader('Cache-Control', 'no-store');
  // Open portals are the automations' clock (due steps: reminders, waits) and the clock for reading new leads from
  // the Facebook forms (at most once a minute). That runs after the answer, so the revision comes back at once.
  // The ads' guard and the owners' one-off changes ride along too (api/automation-tick.js runs them hourly; a clock
  // that skips an hour costs nothing while a portal is open): looked at by this instance at most every 10 minutes, and
  // each keeps its own claim (the guard's 30 minutes, the changes' done list), so nothing runs twice.
  const adsToo = Date.now() - lastAds > ADS_EVERY ? (lastAds = Date.now(), () => require('./_lib/ads-guard').guard().catch(() => 0).then(() => require('./_lib/ads-once').run()).catch(() => 0)) : () => Promise.resolve();
  const chores = () => tick().catch(() => 0).then(() => pollLeads()).catch(() => 0).then(adsToo);
  const wu = waitUntil();
  if (wu) wu(chores());
  else await chores();
  const r = await readRev();
  const build = String(process.env.VERCEL_GIT_COMMIT_SHA || process.env.VERCEL_DEPLOYMENT_ID || process.env.VERCEL_URL || '').slice(0, 40);
  res.status(200).json({ rev: r.rev, changed: r.changed, build });
};
