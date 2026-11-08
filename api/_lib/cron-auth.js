// Who may start the clock's endpoints (api/automation-tick.js, api/daily-report.js): the request carries
// "Authorization: Bearer <CRON_SECRET>" (when that secret is set), or the random key the Worker's own Cron makes for
// its run (cf/worker.js scheduled, never sent over the internet). A user-agent alone is never enough.
const crypto = require('crypto');
function same(a, b) {
  const x = crypto.createHash('sha256').update(String(a)).digest(), y = crypto.createHash('sha256').update(String(b)).digest();
  return crypto.timingSafeEqual(x, y);
}
function isCron(req) {
  const h = String((req.headers && req.headers.authorization) || '');
  if (!h.startsWith('Bearer ')) return false;
  const got = h.slice(7);
  if (!got) return false;
  const secret = process.env.CRON_SECRET || '', inner = globalThis.__C360_CRON_TOKEN || '';
  return (!!secret && same(got, secret)) || (inner.length >= 32 && same(got, inner));
}
module.exports = { isCron };
