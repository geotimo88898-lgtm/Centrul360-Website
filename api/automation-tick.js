// GET /api/automation-tick, runs the automation steps that are due (reminders, waits …).
// Called by the Vercel cron in vercel.json (daily, the portal heartbeat covers the rest of the day)
// and can be pinged by any external scheduler. With CRON_SECRET set in Vercel, only requests that
// carry it (Vercel's own cron sends it automatically) are accepted.
// The GitHub clock (.github/workflows/automations-clock.yml) calls it once an hour with ?light=1: the due steps and
// the new Facebook leads, without the myPOS reading (that stays with the daily cron and the webhook).

const { tick } = require('./_lib/workflows');
const { pollLeads } = require('./_lib/fb-leads');
const { readJSON, writeJSON } = require('./_lib/store');
const mypos = require('./_lib/mypos');

module.exports = async (req, res) => {
  const secret = process.env.CRON_SECRET;
  if (secret && req.headers.authorization !== 'Bearer ' + secret) {
    res.status(401).json({ error: 'unauthorized' });
    return;
  }
  const leads = await pollLeads(true); // new Facebook leads first, so their automations run now too
  const ran = await tick(true);
  // myPOS: the POS payments of the last days (the live ones come by webhook; this catches what it missed)
  const pos = req.query && req.query.light ? { ok: true, added: 'skipped' } : await mypos.sync({ readJSON, writeJSON }, {}).catch((e) => ({ ok: false, error: e.message }));
  // the ads that don't bring leads go off (every 30 minutes, api/_lib/ads-guard.js)
  const ads = await require('./_lib/ads-guard').guard().catch((e) => ({ error: e.message }));
  // the budget changes the owners asked for once (api/_lib/ads-once.js)
  const once = await require('./_lib/ads-once').run().catch((e) => ({ error: e.message }));
  // the creative orders asked for in chat (api/_lib/creative-once.js)
  const creative = await require('./_lib/creative-once').run().catch((e) => ({ error: e.message }));
  // the job ads asked for in chat (api/_lib/hire-once.js)
  const hire = await require('./_lib/hire-once').run().catch((e) => ({ error: e.message }));
  // the ads report for Claude (api/_lib/ads-report.js): only with its key (the clock's address has no password)
  const key = String((req.query && req.query.report) || '');
  const report = key && require('crypto').createHash('sha256').update(key).digest('hex') === 'e5677ffcb33269c8376ad2711d5b236c464b43dcd91656b11e2d22b495f9dd86'
    ? await require('./_lib/ads-report').report().catch((e) => ({ error: e.message })) : undefined;
  // a client's appointments and whether each points at her sheet (Claude, with the report's key: ?report=…&who=<name>)
  const who = report && req.query.who ? await (async () => {
    const q = String(req.query.who).toLowerCase();
    const [appts, clients, emps] = await Promise.all([require('./_lib/store').readJSON('data/appointments.json', []), require('./_lib/store').readJSON('data/clients.json', []), require('./_lib/store').readJSON('data/employees.json', [])]);
    const ids = new Set(clients.map((c) => c.id));
    return { appts: appts.filter((x) => String(x.clientName || '').toLowerCase().includes(q)).slice(-8).map((x) => ({ date: x.date, time: x.time, loc: x.location, clientId: x.clientId || '', found: ids.has(x.clientId), by: x.createdBy || '', ghl: !!x.ghlId })),
      clients: clients.filter((c) => String(c.name || '').toLowerCase().includes(q)).map((c) => ({ id: c.id, name: c.name, loc: c.location || '' })),
      staff: emps.filter((e) => /m[aă]d[aă]lin/i.test(e.name || e.username || '')).map((e) => ({ name: e.name, role: e.role, location: e.location, active: e.active !== false })) };
  })().catch((e) => ({ error: e.message })) : undefined;
  const dry = report ? await require('./_lib/ads-guard').guard({ dry: true, force: true }).catch((e) => ({ error: e.message })) : undefined;
  // reminders stopped by a flow saved again get started back (api/_lib/workflows.js repairReminders)
  const reminders = { repaired: await require('./_lib/workflows').repairReminders().catch((e) => 'error: ' + e.message) };
  res.setHeader('Cache-Control', 'no-store');
  res.status(200).json({ ok: true, ran, leads, pos: pos && pos.ok ? pos.added : pos && pos.error, ads, once, creative, hire, reminders, report, dry, who });
};
