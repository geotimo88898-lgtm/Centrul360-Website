// /api/portal-salariu, the manager's pay (api/_lib/manager-pay.js) and the owner's Costuri lunare.
// Checked here on every call: the costs, the collections and the profit's lines go to the owner only; the manager gets
// her own month (the condition, the profit and the bonus estimated from it, the final bonus) and nobody else's pay.
//
//   GET  ?view=manager&month=YYYY-MM[&employeeId=]   the manager: her own; the owner: any manager, with the costs
//   GET  ?view=managers                              the owner: every manager's probation and this month (Echipa)
//   GET  ?view=costs&month=YYYY-MM                   the owner: the month's lines, what is read by itself, last month's
//   POST { action: 'costs_save', month, eurRate, lines: { key: lei|eur }, over: { ads, commissions, overtime } }  owner
//   POST { action: 'final_set', employeeId, month, lei }   owner: the bonus he pays at month close (lei '' takes it back)
//   POST { action: 'propose', month, consumables, other, note }   the manager: her month-close costs, a proposal
//   POST { action: 'proposal_decide', month, decision: 'accept'|'decline' }   owner (accepted: into the month's records,
//                                                                            api/_lib/expenses.js)

const { readJSON, writeJSON } = require('./_lib/store');
const { requireRole } = require('./_lib/auth');
const MP = require('./_lib/manager-pay');
const N = require('./_lib/notify');

const store = { readJSON, writeJSON };
const clip = (v, n) => String(v == null ? '' : v).trim().slice(0, n);

module.exports = async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  const session = await requireRole(req, res, ['admin', 'manager']);
  if (!session) return;
  const owner = session.role === 'admin';
  const fail = (code, error) => { res.status(code).json({ error }); };
  try {
    if (req.method === 'GET') {
      const q = req.query || {};
      const month = MP.isMonth(q.month) ? q.month : MP.today().slice(0, 7);
      if (q.view === 'manager') {
        const id = owner ? String(q.employeeId || '') : session.employeeId;
        const v = await MP.view(readJSON, id, month, { full: owner });
        if (!v) return fail(404, 'employee_not_found');
        res.status(200).json(v);
        return;
      }
      if (!owner) return fail(403, 'forbidden');
      if (q.view === 'managers') {
        const ctx = await MP.loadCtx(readJSON);
        const day = MP.today(), cur = day.slice(0, 7);
        const out = [];
        for (const e of ctx.employees.filter((x) => x && x.role === 'manager' && x.active !== false)) {
          const r = await MP.monthOf(readJSON, ctx, e, cur, null);
          out.push({ id: e.id, probation: MP.probationOf(e, day), month: cur, final: r.final, estimate: r.estimate, ok: r.condition.ok, filled: r.filled });
        }
        res.status(200).json({ ok: true, managers: out });
        return;
      }
      if (q.view === 'costs') {
        const ctx = await MP.loadCtx(readJSON);
        const day = MP.today(), isCurrent = month === day.slice(0, 7);
        const entry = MP.withEur(MP.cleanEntry(ctx.costs.months[month]), ctx.eur);
        const all = ['Timișoara', 'Arad'];
        const autos = await MP.payrollAutos(ctx, all, month, isCurrent);
        const ad = await MP.adsOf(readJSON, all, month, day, { detail: true });
        autos.ads = ad ? ad.lei : null;
        const adsRead = autos.ads != null;
        if (autos.ads == null && entry.adsAuto) autos.ads = entry.adsAuto.lei;
        // the WhatsApp messages, from Meta (api/_lib/wa-cost.js); refused: what it said when the month was saved
        const wa = await MP.waOf(readJSON, all, month, day);
        autos.whatsapp = wa.error ? (entry.waAuto ? entry.waAuto.lei : null) : wa.lei;
        const costs = MP.costsOf(entry, autos, all, require('./_lib/expenses').recCosts(ctx.exp, month));
        const collections = MP.collectionsOf(ctx.sales, ctx.appointments, ctx.employees, all, month, isCurrent ? day : MP.lastDay(month));
        const pm = MP.prevMonth(month), prev = ctx.costs.months[pm] ? MP.cleanEntry(ctx.costs.months[pm]) : null;
        res.status(200).json({
          ok: true, month, current: isCurrent, lines: MP.LINES, entry, autos, adsRead, adsSavedAt: entry.adsAuto ? entry.adsAuto.at : '', costs,
          read: { ads: { ok: adsRead, at: adsRead ? ad.at : (entry.adsAuto ? entry.adsAuto.at : ''), saved: !adsRead && !!entry.adsAuto },
            whatsapp: { ok: !wa.error, at: wa.error ? (entry.waAuto ? entry.waAuto.at : '') : wa.at, saved: !!wa.error && !!entry.waAuto, error: wa.error || '' } }, collections, profit: Math.round((collections - costs.total) * 100) / 100,
          prev: prev && prev.savedAt ? { month: pm, eurRate: prev.eurRate, lines: prev.lines } : null,
          // the bonus condition of the managers this month so far (every trained cosmetician of her clinics over the
          // daily minimum): on track or not, no names
          bonusOk: (() => { const ms = ctx.employees.filter((e) => e && e.role === 'manager' && e.active !== false); if (!ms.length) return null;
            const upto = isCurrent ? day : MP.lastDay(month); return ms.every((m) => MP.conditionOf(ctx.employees, ctx.sales, ctx.attendance, require('./_lib/roles').managesOf(m), month, upto).ok); })(),
        });
        return;
      }
      return fail(400, 'unknown_view');
    }

    if (req.method !== 'POST') return fail(405, 'method_not_allowed');
    const b = req.body || {};
    const month = String(b.month || '');
    if (!MP.isMonth(month)) return fail(400, 'invalid_month');
    const cur = MP.today().slice(0, 7);
    if (month > cur) return fail(400, 'invalid_month');

    if (b.action === 'propose') {
      if (session.role !== 'manager') return fail(403, 'forbidden');
      if (month !== cur && month !== MP.prevMonth(cur)) return fail(400, 'invalid_month'); // the month that closes, or the one before
      const consumables = MP.amount(b.consumables), other = MP.amount(b.other);
      if (consumables == null && other == null) return fail(400, 'missing_fields');
      const doc = await MP.loadCosts(readJSON);
      const entry = doc.months[month] && typeof doc.months[month] === 'object' ? doc.months[month] : {};
      const emps = await readJSON('data/employees.json', []);
      const me = emps.find((e) => e.id === session.employeeId) || {};
      entry.proposal = { consumables, other, note: clip(b.note, 500), at: new Date().toISOString(), by: session.employeeId, byName: me.name || '', status: 'pending' };
      doc.months[month] = entry;
      await writeJSON(MP.COSTS_KEY, doc, { quiet: true });
      await N.notifyMany(store, await N.adminIds(store), {
        kind: 'info', tone: 'info', go: 'angajati', tag: 'mgr-costs-' + month, ownerPush: false,
        title: 'Costuri variabile trimise', text: (me.name ? me.name.split(' ')[0] + ' a trimis' : 'S-au trimis') + ' consumabilele și alte costuri ale lunii. Le găsești în Echipa → Costuri.',
      });
      res.status(200).json({ ok: true });
      return;
    }

    if (!owner) return fail(403, 'forbidden');

    if (b.action === 'costs_save') {
      const doc = await MP.loadCosts(readJSON);
      const old = doc.months[month] && typeof doc.months[month] === 'object' ? doc.months[month] : {};
      const lines = {}, over = {};
      MP.LINES.forEach((l) => {
        if (l.auto) over[l.key] = MP.amount(b.over && b.over[l.key]);
        // the lines kept as records (Plăți și cheltuieli): what was typed here before stays as it was
        else if (l.rec) lines[l.key] = MP.amount(old.lines && old.lines[l.key]);
        else lines[l.key] = MP.amount(b.lines && b.lines[l.key]);
      });
      // the euro: today's BNR rate is used anyway; the one sent is kept only as the fallback for a day the BNR is down
      const entry = Object.assign({}, old, { eurRate: MP.amount(b.eurRate) || old.eurRate || null, lines, over, savedAt: new Date().toISOString(), savedBy: session.employeeId });
      // what Meta says now, kept for when it can't be read
      const ads = await MP.adsOf(readJSON, ['Timișoara', 'Arad'], month, MP.today());
      if (ads != null) entry.adsAuto = { lei: ads, at: new Date().toISOString() };
      const wa = await MP.waOf(readJSON, ['Timișoara', 'Arad'], month, MP.today());
      if (!wa.error) entry.waAuto = { lei: wa.lei, byCity: wa.byCity, at: new Date().toISOString() };
      doc.months[month] = entry;
      await writeJSON(MP.COSTS_KEY, doc, { quiet: true });
      res.status(200).json({ ok: true });
      return;
    }

    if (b.action === 'proposal_decide') {
      const doc = await MP.loadCosts(readJSON);
      const entry = doc.months[month];
      if (!entry || !entry.proposal) return fail(404, 'not_found');
      const p = entry.proposal;
      if (b.decision === 'accept') {
        // into the month's records (Plăți și cheltuieli → Cheltuieli variabile), marked as sent by her
        const EX = require('./_lib/expenses');
        const exp = await EX.loadDoc(readJSON);
        const m = exp.months[month] && typeof exp.months[month] === 'object' ? exp.months[month] : {};
        m.rec = m.rec && typeof m.rec === 'object' ? m.rec : {};
        const day = month === cur ? MP.today() : MP.lastDay(month);
        const note = 'trimis de ' + (String(p.byName || '').split(' ')[0] || 'manager') + (p.note ? ': ' + p.note : '');
        [['consumables', p.consumables], ['other', p.other]].forEach(([k, lei]) => { if (lei != null && lei > 0) (m.rec[k] = Array.isArray(m.rec[k]) ? m.rec[k] : []).push(EX.newEntry({ date: day, lei, note: note.slice(0, 200) }, session.employeeId)); });
        exp.months[month] = m;
        await writeJSON(EX.KEY, exp, { quiet: true });
        p.status = 'accepted';
      } else if (b.decision === 'decline') p.status = 'declined';
      else return fail(400, 'invalid_decision');
      p.decidedAt = new Date().toISOString();
      await writeJSON(MP.COSTS_KEY, doc, { quiet: true });
      res.status(200).json({ ok: true });
      return;
    }

    if (b.action === 'final_set') {
      const emps = await readJSON('data/employees.json', []);
      const emp = emps.find((e) => e.id === String(b.employeeId || '') && e.role === 'manager');
      if (!emp) return fail(404, 'employee_not_found');
      const key = emp.id + '|' + month;
      const finals = await readJSON(MP.FINAL_KEY, {});
      const doc = finals && typeof finals === 'object' && !Array.isArray(finals) ? finals : {};
      if (b.lei === '' || b.lei == null) delete doc[key];
      else {
        const lei = MP.amount(b.lei);
        if (lei == null || lei > 1e6) return fail(400, 'invalid_amount');
        doc[key] = { lei: Math.round(lei), at: new Date().toISOString(), by: session.employeeId };
      }
      await writeJSON(MP.FINAL_KEY, doc);
      if (doc[key]) {
        const label = ['ianuarie', 'februarie', 'martie', 'aprilie', 'mai', 'iunie', 'iulie', 'august', 'septembrie', 'octombrie', 'noiembrie', 'decembrie'][+month.slice(5, 7) - 1];
        await N.notifyMany(store, [emp.id], { kind: 'info', tone: doc[key].lei > 0 ? 'good' : 'info', go: 'comision', tag: 'mgr-final-' + month,
          title: 'Bonusul pe ' + label, text: doc[key].lei > 0 ? 'Luna e închisă: ' + N.leiTxt(doc[key].lei) + ' bonus. Îl vezi în Salariu.' : 'Luna e închisă. Detaliile sunt în Salariu.' });
      }
      res.status(200).json({ ok: true, final: doc[key] || null });
      return;
    }

    return fail(400, 'unknown_action');
  } catch (err) {
    console.error('portal-salariu error:', err.message);
    res.status(500).json({ error: 'salary_failed' });
  }
};
