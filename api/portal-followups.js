// POST /api/portal-followups, the clinic's follow-ups (the owner, 16.11): the free hours and who to call, the packages
// started without a next booking, the re-contact of who didn't answer, the monthly 1:1 sheet of a cosmetician. For the
// owner (both clinics) and the manager (only her clinics), checked here on every call; never the cosmeticians or
// reception. No profit, costs, salaries or ad spend. The logic: api/_lib/followups.js.
//
//   { action: 'free' }                               the next 7 days per clinic and cosmetician, with the call list
//   { action: 'packages' }                           the open ones and the ones marked „Rezolvat”
//   { action: 'counts' }                             how many packages without a booking, how many to call again now
//   { action: 'resolve', key, reason, until?, note? }  reason: nu_mai_vrea | revine_ea | amanat (until a date) | altul (note)
//   { action: 'unresolve', key }                     back on the list
//   { action: 'recontact' }                          leads and clients who didn't answer, in the call queue's order
//   { action: 'attempt', key, outcome }              outcome: nu_raspunde | raspuns | reset (try again after a stop)
//   { action: 'people' }                             the cosmeticians of her clinics
//   { action: 'sheet', employeeId, month }           the 1:1 sheet: this month, the month before, the notes
//   { action: 'sheet_save', employeeId, month, good, improve, agree }

const { readJSON } = require('./_lib/store');
const { requireManage, managesOf, CLINICS } = require('./_lib/roles');
const F = require('./_lib/followups');

const ERR = { invalid_reason: 400, invalid_until: 400, missing_note: 400, invalid_month: 400, not_found: 404, forbidden: 403 };

module.exports = async (req, res) => {
  if (req.method !== 'POST') { res.status(405).json({ error: 'method_not_allowed' }); return; }
  const session = await requireManage(req, res);
  if (!session) return;
  const b = req.body || {};
  const send = (r) => (r && r.error ? res.status(ERR[r.error] || 400).json({ error: r.error }) : res.status(200).json(r));
  try {
    const emps = await readJSON('data/employees.json', []);
    const me = emps.find((e) => e && e.id === session.employeeId);
    // the owner: both clinics; the manager: hers
    const clinics = session.role === 'admin' ? CLINICS.slice() : managesOf(me);
    const who = { id: session.employeeId, name: session.employeeId === 'admin' ? 'Admin' : (me && me.name) || '' };
    const key = String(b.key || '').slice(0, 300);
    switch (b.action) {
      case 'free': return send(await F.free(clinics));
      case 'packages': return send(await F.packages(clinics));
      case 'counts': return send(await F.counts(clinics));
      case 'resolve': return send(await F.resolve(key, b, who, clinics));
      case 'unresolve': return send(await F.unresolve(key, who, clinics));
      case 'recontact': return send(await F.recontact(clinics));
      case 'attempt': return send(await F.attempt({ key, outcome: b.outcome }, who, clinics));
      case 'people': return send({ ok: true, people: await F.people(clinics) });
      case 'sheet': return send(await F.sheet(String(b.employeeId || ''), String(b.month || ''), clinics));
      case 'sheet_save': return send(await F.sheetSave(String(b.employeeId || ''), String(b.month || ''), b, who, clinics));
      default: res.status(400).json({ error: 'invalid_action' });
    }
  } catch (err) {
    console.error('portal-followups error:', err.message);
    res.status(500).json({ error: 'followups_failed' });
  }
};
