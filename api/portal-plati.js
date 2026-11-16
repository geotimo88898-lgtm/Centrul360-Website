// /api/portal-plati, Plăți și cheltuieli (api/_lib/expenses.js): the owner's payments of the month with their day and
// a „Plătit” tick, and the variable expenses kept as records. The owner only (role admin): everyone else gets 403, so
// the manager never sees a payment, a day of the month or a line.
//
//   GET  ?month=YYYY-MM                                  the payments, the summary, the records, what is read by itself
//   POST { action: 'pay', month, key, note? }            ticked as paid (who, when, the sum of that moment)
//   POST { action: 'unpay', month, key }                 the tick taken back
//   POST { action: 'note', month, key, note }            the note of a paid row
//   POST { action: 'rec_add', month, line, lei, date, note?, kind? }   a record (Taxe la stat, Utilități, Consumabile, Alte)
//   POST { action: 'rec_del', month, line, id }          a record removed ('legacy': the sum typed in Costuri lunare before)

const { readJSON, writeJSON } = require('./_lib/store');
const { requireRole } = require('./_lib/auth');
const MP = require('./_lib/manager-pay');
const EX = require('./_lib/expenses');

const FIRST = EX.FIRST;
const clip = (v, n) => String(v == null ? '' : v).replace(/\s+/g, ' ').trim().slice(0, n);

// a month's costs, every line (api/_lib/manager-pay.js costsOf), for both clinics
async function costsFor(ctx, month, day, cur) {
  const all = ['Timișoara', 'Arad'];
  const entry = MP.withEur(MP.cleanEntry(ctx.costs.months[month]), ctx.eur);
  const autos = await MP.payrollAutos(ctx, all, month, month === cur);
  const ad = entry.over.ads != null ? null : await MP.adsOf(readJSON, all, month, day);
  autos.ads = ad != null ? ad : entry.adsAuto ? entry.adsAuto.lei : null;
  const wa = entry.over.whatsapp != null ? { error: 'over' } : await MP.waOf(readJSON, all, month, day);
  autos.whatsapp = wa.error ? (entry.waAuto ? entry.waAuto.lei : null) : wa.lei;
  return MP.costsOf(entry, autos, all, EX.recCosts(ctx.exp, month));
}
// the lines grouped the way the owner thinks of them (Altele: what is small or has no colour of its own)
const CAT = { salaries: 'sal', commissions: 'sal', overtime: 'sal', rentTm: 'rent', rentAr: 'rent', credits: 'credit', laser: 'laser', taxes: 'tax', ads: 'ads', consumables: 'cons', utilities: 'util' };
const CAT_LABEL = { sal: 'Salarii', rent: 'Chirii', credit: 'Credit', laser: 'Laser', tax: 'Taxe', ads: 'Reclame', cons: 'Consumabile', util: 'Utilități', other: 'Altele' };
const SHORT = { whatsapp: 'WhatsApp', accounting: 'contabilitate', claude: 'Claude', other: 'neprevăzute' };
function cats(costs) {
  const out = {};
  costs.rows.forEach((r) => {
    if (!(Number(r.lei) > 0)) return;
    const k = CAT[r.key] || 'other';
    const c = out[k] || (out[k] = { key: k, label: CAT_LABEL[k], lei: 0, parts: [] });
    c.lei = Math.round((c.lei + Number(r.lei)) * 100) / 100;
    if (k === 'other') c.parts.push(SHORT[r.key] || r.label);
  });
  return Object.values(out);
}

module.exports = async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  const session = await requireRole(req, res, ['admin']);
  if (!session) return;
  const fail = (code, error) => { res.status(code).json({ error }); };
  const cur = EX.today().slice(0, 7), last = EX.nextMonth(cur);
  try {
    if (req.method === 'GET') {
      const q = req.query || {};
      const month = EX.isMonth(q.month) && q.month >= FIRST && q.month <= last ? q.month : cur;
      const ctx = await MP.loadCtx(readJSON);
      const t = EX.tracker(ctx, month);
      const mine = EX.monthOf(ctx.exp, month);
      // the records, with what was typed in Costuri lunare before them (kept, shown as an entry that can be removed)
      const entry = MP.cleanEntry(ctx.costs.months[month]);
      const rec = EX.REC.map((r) => {
        const list = mine.rec[r.key].slice().sort((a, b) => String(b.date).localeCompare(String(a.date)) || String(b.at).localeCompare(String(a.at)));
        if (entry.lines[r.key] != null && entry.lines[r.key] > 0) list.push({ id: 'legacy', date: '', lei: entry.lines[r.key], note: 'scris în Costuri lunare', legacy: true });
        return { key: r.key, label: r.label, hint: r.hint || '', kinds: r.kinds || null, entries: list, total: EX.recSum(list) };
      });
      // what is read by itself: the ads and the WhatsApp messages from Meta (only Centrul360's campaigns,
      // api/_lib/ads-scope.js inside adSpend), the commissions and the overtime from Salariu
      const all = ['Timișoara', 'Arad'];
      const day = EX.today(), isCurrent = month === cur;
      const future = month > cur;
      const [ad, wa, pay] = future ? [null, null, null] : await Promise.all([
        MP.adsOf(readJSON, all, month, day, { detail: true }), MP.waOf(readJSON, all, month, day), MP.payrollAutos(ctx, all, month, isCurrent)]);
      const autoRow = (key, label, r, saved, over, src) => ({
        key, label, src, over: over != null ? over : null, none: !!(r && r.none),
        lei: over != null ? over : r && r.lei != null ? r.lei : saved ? saved.lei : null,
        at: r && r.lei != null ? r.at || '' : saved ? saved.at : '', saved: !(r && r.lei != null) && !!saved, error: r && r.error ? r.error : r == null && !future ? 'Meta nu poate fi citit acum' : '',
      });
      const autos = future ? [] : [
        autoRow('ads', 'Reclame Meta', ad, entry.adsAuto, entry.over.ads, 'Meta'),
        autoRow('whatsapp', 'Mesaje WhatsApp', wa, entry.waAuto, entry.over.whatsapp, 'Meta WhatsApp'),
        { key: 'payroll', label: 'Comisioane și ore suplimentare', src: 'Salariu', lei: Math.round(((entry.over.commissions != null ? entry.over.commissions : pay.commissions) + (entry.over.overtime != null ? entry.over.overtime : pay.overtime)) * 100) / 100, over: entry.over.commissions != null || entry.over.overtime != null ? true : null, at: '' },
      ];
      // where the money goes this month, by category, and last month's total to compare (both up to the same rules)
      let where = null;
      if (!future) {
        const pm = EX.prevMonth(month);
        const [now, before] = await Promise.all([costsFor(ctx, month, day, cur), costsFor(ctx, pm, day, cur).catch(() => null)]);
        where = { cats: cats(now), total: now.total, missing: now.rows.filter((r) => r.lei == null).map((r) => r.label), upToday: isCurrent,
          prev: before ? { month: pm, total: before.total, missing: before.missing.length } : null };
      }
      res.status(200).json(Object.assign(t, { first: FIRST, last, rec, autos, where, salariesFor: EX.prevMonth(month) }));
      return;
    }

    if (req.method !== 'POST') return fail(405, 'method_not_allowed');
    const b = req.body || {};
    const month = String(b.month || '');
    if (!EX.isMonth(month) || month < FIRST || month > last) return fail(400, 'invalid_month');
    const doc = await EX.loadDoc(readJSON);
    const m = doc.months[month] && typeof doc.months[month] === 'object' ? doc.months[month] : {};
    m.paid = m.paid && typeof m.paid === 'object' ? m.paid : {};
    m.rec = m.rec && typeof m.rec === 'object' ? m.rec : {};
    const save = async () => { doc.months[month] = m; await writeJSON(EX.KEY, doc, { quiet: true }); };
    const emps = await readJSON('data/employees.json', []);
    const me = (emps || []).find((e) => e && e.id === session.employeeId);
    const byName = String((me && me.name) || '').split(' ')[0] || 'admin';

    if (b.action === 'pay' || b.action === 'unpay' || b.action === 'note') {
      const key = String(b.key || '');
      const ctx = await MP.loadCtx(readJSON);
      const row = EX.tracker(ctx, month).rows.find((r) => r.key === key);
      if (!row && !(b.action === 'unpay' && m.paid[key])) return fail(404, 'not_found');
      if (b.action === 'pay') m.paid[key] = { at: new Date().toISOString(), by: session.employeeId, byName, lei: row.lei, note: clip(b.note, 200) };
      else if (b.action === 'unpay') delete m.paid[key];
      else { if (!m.paid[key]) return fail(404, 'not_found'); m.paid[key].note = clip(b.note, 200); }
      await save();
      res.status(200).json({ ok: true });
      return;
    }

    if (b.action === 'rec_add') {
      const line = EX.REC.find((r) => r.key === b.line);
      if (!line) return fail(400, 'invalid_line');
      const lei = MP.amount(b.lei);
      if (lei == null || !(lei > 0) || lei > 1e7) return fail(400, 'invalid_amount');
      const date = EX.isDay(b.date) && b.date.slice(0, 7) === month ? b.date : (month === cur ? EX.today() : month + '-01');
      const kind = line.kinds ? (line.kinds.some(([k]) => k === b.kind) ? b.kind : line.kinds[0][0]) : '';
      (m.rec[line.key] = Array.isArray(m.rec[line.key]) ? m.rec[line.key] : []).push(EX.newEntry({ date, lei, note: clip(b.note, 200), kind }, session.employeeId));
      await save();
      res.status(200).json({ ok: true });
      return;
    }

    if (b.action === 'rec_del') {
      const line = EX.REC.find((r) => r.key === b.line);
      if (!line) return fail(400, 'invalid_line');
      if (b.id === 'legacy') {
        // the sum typed in Costuri lunare before the records: cleared there
        const costs = await MP.loadCosts(readJSON);
        const en = costs.months[month];
        if (!en || !en.lines || en.lines[line.key] == null) return fail(404, 'not_found');
        en.lines = Object.assign({}, en.lines, { [line.key]: null });
        await writeJSON(MP.COSTS_KEY, costs, { quiet: true });
        res.status(200).json({ ok: true });
        return;
      }
      const list = Array.isArray(m.rec[line.key]) ? m.rec[line.key] : [];
      if (!list.some((e) => e && e.id === b.id)) return fail(404, 'not_found');
      m.rec[line.key] = list.filter((e) => e && e.id !== b.id);
      await save();
      res.status(200).json({ ok: true });
      return;
    }

    return fail(400, 'unknown_action');
  } catch (err) {
    console.error('portal-plati error:', err.message);
    res.status(500).json({ error: 'plati_failed' });
  }
};
