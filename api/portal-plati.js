// /api/portal-plati, Plăți și cheltuieli (api/_lib/expenses.js): the owner's payments of the month with their day and
// a „Plătit” tick, and the variable expenses kept as records. The owner only (role admin): everyone else gets 403, so
// the manager never sees a payment, a day of the month or a line.
//
//   GET  ?month=YYYY-MM                                  the payments, the summary, the records, what is read by itself
//   POST { action: 'pay', month, key, lei?, date?, note? }   a part paid (who, when); no lei: what is left, in full (the tick)
//   POST { action: 'unpay', month, key }                 every part taken back
//   POST { action: 'part_del', month, key, id }          one part taken back
//   POST { action: 'note', month, key, note }            the note of the last part
//   POST { action: 'amount', month, key, lei }           this month's sum of a row ('' or null: the usual one again)
//   POST { action: 'autopay', month, key, on }           „Se plătește automat”: paid by itself on its day (not a salary)
//   POST { action: 'own_add', month, label, lei?, day?, repeat?, note? }        his own row (this month, or every month from it)
//   POST { action: 'own_edit', month, key, label, lei?, day?, repeat?, note? }  changed (repeat off: it stops before this month)
//   POST { action: 'own_del', month, key, scope? }       removed ('month': a monthly one only this month; else from this month on)
//   POST { action: 'own_copy', month }                   last month's own rows (not the monthly ones) copied into this month
//   POST { action: 'rec_day', month, line, day }         a category's payment day (0 or '': not a payment row)
//   POST { action: 'rec_add', month, line, lei, date, note?, kind? }   a record (Taxe la stat, Utilități, Consumabile, Alte)
//   POST { action: 'rec_del', month, line, id }          a record removed ('legacy': the sum typed in Costuri lunare before)

const { readJSON, writeJSON, readJSONTagged, writeJSONIf } = require('./_lib/store');
const { requireRole } = require('./_lib/auth');
const MP = require('./_lib/manager-pay');
const EX = require('./_lib/expenses');

const FIRST = EX.FIRST;
const clip = (v, n) => String(v == null ? '' : v).replace(/\s+/g, ' ').trim().slice(0, n);
// the tracker document changed only on the version read (a double tap or two phones at once: redone on the newer one)
async function update(fn) {
  for (let i = 0; i < 6; i++) {
    const { data, etag } = await readJSONTagged(EX.KEY, null);
    const doc = EX.normDoc(data);
    const out = (await fn(doc)) || { ok: true };
    if (out.error || out.noop) return out;
    if (await writeJSONIf(EX.KEY, doc, etag, { quiet: true })) return out;
  }
  throw new Error('expenses busy');
}
// what Meta read (or the last reading kept in Costuri lunare, or the sum he typed there), as Variabile shows it
const metaRow = (key, label, r, saved, over, src, future) => ({
  key, label, src, over: over != null ? over : null, none: !!(r && r.none),
  lei: over != null ? over : r && r.lei != null ? r.lei : saved ? saved.lei : null,
  at: r && r.lei != null ? r.at || '' : saved ? saved.at : '', saved: !(r && r.lei != null) && !!saved, error: r && r.error ? r.error : r == null && !future ? 'Meta nu poate fi citit acum' : '',
});
const spendFrom = (autos) => Object.fromEntries(autos.filter((a) => a.key === 'ads' || a.key === 'whatsapp').map((a) => [a.key, { lei: a.lei, at: a.at || '' }]));
// the card rows of a month for a change on one of them (Meta read once, only then)
async function spendOf(ctx, month) {
  const cur = EX.today().slice(0, 7);
  if (month > cur) return {};
  const all = ['Timișoara', 'Arad'], day = EX.today();
  const entry = MP.cleanEntry(ctx.costs.months[month]);
  const [ad, wa] = await Promise.all([entry.over.ads != null ? null : MP.adsOf(readJSON, all, month, day).catch(() => null), entry.over.whatsapp != null ? null : MP.waOf(readJSON, all, month, day).catch(() => null)]);
  return spendFrom([metaRow('ads', '', ad, entry.adsAuto, entry.over.ads, ''), metaRow('whatsapp', '', wa, entry.waAuto, entry.over.whatsapp, '')]);
}
// a sum typed by the owner: '' or null is none; else a positive number up to 10 million (undefined: not valid)
const sumOf = (v) => { if (v == null || v === '') return null; const n = MP.amount(v); return n != null && n > 0 && n <= 1e7 ? n : undefined; };
// a day of the month: '' / null / 0 none, else 1..31 (undefined: not valid)
const dayIn = (v) => { if (v == null || v === '' || Number(v) === 0) return null; const n = Number(v); return Number.isInteger(n) && n >= 1 && n <= 31 ? n : undefined; };

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
      const mine = EX.monthOf(ctx.exp, month);
      // the records, with what was typed in Costuri lunare before them (kept, shown as an entry that can be removed)
      const entry = MP.cleanEntry(ctx.costs.months[month]);
      const rec = EX.REC.map((r) => {
        const list = mine.rec[r.key].slice().sort((a, b) => String(b.date).localeCompare(String(a.date)) || String(b.at).localeCompare(String(a.at)));
        if (entry.lines[r.key] != null && entry.lines[r.key] > 0) list.push({ id: 'legacy', date: '', lei: entry.lines[r.key], note: 'scris în Costuri lunare', legacy: true });
        return { key: r.key, label: r.label, hint: r.hint || '', kinds: r.kinds || null, entries: list, total: EX.recSum(list), day: EX.recDayOf(ctx.exp, r.key) };
      });
      // what is read by itself: the ads and the WhatsApp messages from Meta (only Centrul360's campaigns,
      // api/_lib/ads-scope.js inside adSpend), the commissions and the overtime from Salariu
      const all = ['Timișoara', 'Arad'];
      const day = EX.today(), isCurrent = month === cur;
      const future = month > cur;
      const [ad, wa, pay] = future ? [null, null, null] : await Promise.all([
        MP.adsOf(readJSON, all, month, day, { detail: true }), MP.waOf(readJSON, all, month, day), MP.payrollAutos(ctx, all, month, isCurrent)]);
      const autoRow = (key, label, r, saved, over, src) => metaRow(key, label, r, saved, over, src, future);
      const autos = future ? [] : [
        autoRow('ads', 'Reclame Meta', ad, entry.adsAuto, entry.over.ads, 'Meta'),
        autoRow('whatsapp', 'Mesaje WhatsApp', wa, entry.waAuto, entry.over.whatsapp, 'Meta WhatsApp'),
        { key: 'payroll', label: 'Comisioane și ore suplimentare', src: 'Salariu', lei: Math.round(((entry.over.commissions != null ? entry.over.commissions : pay.commissions) + (entry.over.overtime != null ? entry.over.overtime : pay.overtime)) * 100) / 100, over: entry.over.commissions != null || entry.over.overtime != null ? true : null, at: '' },
      ];
      // the payments: Meta's card rows from the same sums
      ctx.spend = spendFrom(autos);
      const t = EX.tracker(ctx, month);
      // where the money goes this month, by category, and last month's total to compare (both up to the same rules)
      let where = null;
      if (!future) {
        const pm = EX.prevMonth(month);
        const [now, before] = await Promise.all([costsFor(ctx, month, day, cur), costsFor(ctx, pm, day, cur).catch(() => null)]);
        where = { cats: cats(now), total: now.total, missing: now.rows.filter((r) => r.lei == null).map((r) => r.label), upToday: isCurrent,
          prev: before ? { month: pm, total: before.total, missing: before.missing.length } : null };
      }
      // last month's own rows that are not in this one yet (by name): what „Copiază din luna trecută” would add
      const here = new Set(t.rows.filter((r) => r.group === 'own').map((r) => String(r.label).toLowerCase()));
      const copyable = month > FIRST ? EX.monthOf(ctx.exp, EX.prevMonth(month)).own.filter((o) => !here.has(String(o.label || '').toLowerCase())).length : 0;
      res.status(200).json(Object.assign(t, { first: FIRST, last, rec, autos, where, salariesFor: EX.prevMonth(month), next: EX.nextDue(ctx, month, t), copyable }));
      return;
    }

    if (req.method !== 'POST') return fail(405, 'method_not_allowed');
    const b = req.body || {};
    const month = String(b.month || '');
    if (!EX.isMonth(month) || month < FIRST || month > last) return fail(400, 'invalid_month');
    const emps = await readJSON('data/employees.json', []);
    const me = (emps || []).find((e) => e && e.id === session.employeeId);
    const byName = String((me && me.name) || '').split(' ')[0] || 'admin';
    const now = () => new Date().toISOString();
    const send = (out) => (out.error ? fail(out.code || 400, out.error) : res.status(200).json(Object.assign({ ok: true }, out, { code: undefined })));

    // the rows of the month: paid (in parts), its sum, his own rows
    const ROW = ['pay', 'unpay', 'part_del', 'note', 'amount', 'autopay', 'own_add', 'own_edit', 'own_del', 'own_copy'];
    if (ROW.includes(b.action)) {
      const ctx = await MP.loadCtx(readJSON);
      const key = String(b.key || '');
      if (/^auto:/.test(key)) ctx.spend = await spendOf(ctx, month);
      const out = await update((doc) => {
        ctx.exp = doc;
        const rows = EX.tracker(ctx, month).rows;
        const m = EX.monthW(doc, month);
        // the ticks from before the parts become one part each, on the first change of the month
        rows.forEach((r) => { if (!Array.isArray(m.parts[r.key]) && m.paid[r.key]) { m.parts[r.key] = r.parts.filter((p) => !p.auto).map((p) => { const x = Object.assign({}, p); delete x.legacy; return x; }); delete m.paid[r.key]; } });
        const row = rows.find((r) => r.key === key);
        const dropKey = (mm, k) => { if (!mm) return; [mm.parts, mm.paid, mm.amt, mm.skip].forEach((o) => { if (o && typeof o === 'object') delete o[k]; }); };

        if (b.action === 'pay') {
          if (!row) return { error: 'not_found', code: 404 };
          let lei = sumOf(b.lei);
          if (lei === undefined) return { error: 'invalid_amount' };
          if (lei == null) {
            if (row.done) return { noop: true, already: true };
            if (!(row.rest > 0)) return { error: 'amount_needed' };
            lei = row.rest;
          }
          const date = EX.isDay(b.date) ? b.date : EX.today();
          (m.parts[key] = Array.isArray(m.parts[key]) ? m.parts[key] : []).push({ id: EX.newId(), date, lei, note: clip(b.note, 200), at: now(), by: session.employeeId, byName });
          return { ok: true, lei };
        }
        if (b.action === 'unpay') {
          if (!row && !m.parts[key] && !m.paid[key]) return { error: 'not_found', code: 404 };
          delete m.parts[key]; delete m.paid[key];
          return { ok: true };
        }
        if (b.action === 'part_del') {
          const list = Array.isArray(m.parts[key]) ? m.parts[key] : [];
          if (!list.some((p) => p && p.id === b.id)) return { error: 'not_found', code: 404 };
          m.parts[key] = list.filter((p) => p && p.id !== b.id);
          if (!m.parts[key].length) delete m.parts[key];
          return { ok: true };
        }
        if (b.action === 'note') {
          const list = Array.isArray(m.parts[key]) ? m.parts[key] : [];
          if (!row || !list.length) return { error: 'not_found', code: 404 };
          list[list.length - 1].note = clip(b.note, 200);
          return { ok: true };
        }
        if (b.action === 'amount') {
          if (!row) return { error: 'not_found', code: 404 };
          const lei = sumOf(b.lei);
          if (lei === undefined) return { error: 'invalid_amount' };
          if (row.group === 'own' && !row.own.repeat) {
            const o = m.own.find((x) => x && 'o:' + x.id === key);
            if (!o) return { error: 'not_found', code: 404 };
            o.lei = lei;
            return { ok: true };
          }
          const usual = row.changed ? row.orig : row.lei;
          if (lei == null || lei === usual) delete m.amt[key];
          else m.amt[key] = { lei, at: now(), by: session.employeeId };
          return { ok: true };
        }
        if (b.action === 'autopay') {
          // „Se plătește automat”: kept for the row in every month (a direct debit, the card); never a salary
          if (!row || row.group === 'sal') return { error: row ? 'not_allowed' : 'not_found', code: row ? 400 : 404 };
          doc.autoPay[key] = !!b.on;
          return { ok: true };
        }
        if (b.action === 'own_add' || b.action === 'own_edit') {
          const label = clip(b.label, 60), lei = sumOf(b.lei), day = dayIn(b.day), note = clip(b.note, 120), repeat = !!b.repeat;
          if (!label) return { error: 'invalid_label' };
          if (lei === undefined) return { error: 'invalid_amount' };
          if (day === undefined) return { error: 'invalid_day' };
          const fields = { label, lei, day, note };
          if (b.action === 'own_add') {
            const id = EX.newId(), x = Object.assign({ id }, fields, { at: now(), by: session.employeeId });
            if (repeat) doc.repeat.push(Object.assign(x, { from: month }));
            else m.own.push(x);
            return { ok: true, key: 'o:' + id };
          }
          if (!row || row.group !== 'own') return { error: 'not_found', code: 404 };
          const id = row.own.id;
          if (!row.own.repeat) {
            const i = m.own.findIndex((x) => x && x.id === id);
            if (i < 0) return { error: 'not_found', code: 404 };
            if (!repeat) { Object.assign(m.own[i], fields); return { ok: true }; }
            // from this month on, every month (the same key: what was paid this month stays on it)
            const x = m.own.splice(i, 1)[0];
            doc.repeat.push(Object.assign({}, x, fields, { from: month }));
            return { ok: true };
          }
          const def = doc.repeat.find((x) => x && x.id === id);
          if (!def) return { error: 'not_found', code: 404 };
          if (repeat) {
            // the usual sum changes for every month it shows in; a sum of this month only stays (Suma lunii)
            Object.assign(def, fields);
            return { ok: true };
          }
          // no longer monthly: it stays only in this month, the months after lose it
          m.own.push(Object.assign({ id, at: def.at, by: def.by }, fields));
          if (def.from >= month) doc.repeat = doc.repeat.filter((x) => x !== def);
          else def.until = EX.prevMonth(month);
          delete m.amt[key];
          Object.keys(doc.months).forEach((k) => { if (k > month) dropKey(doc.months[k], key); });
          return { ok: true };
        }
        if (b.action === 'own_del') {
          if (!row || row.group !== 'own') return { error: 'not_found', code: 404 };
          const id = row.own.id;
          if (!row.own.repeat) { m.own = m.own.filter((x) => x && x.id !== id); dropKey(m, key); return { ok: true }; }
          const def = doc.repeat.find((x) => x && x.id === id);
          if (!def) return { error: 'not_found', code: 404 };
          if (b.scope === 'month') { dropKey(m, key); m.skip[key] = true; return { ok: true }; }
          // from this month on (the months before keep it, with what was paid in them)
          if (def.from >= month) doc.repeat = doc.repeat.filter((x) => x !== def);
          else def.until = EX.prevMonth(month);
          Object.keys(doc.months).forEach((k) => { if (k >= month) dropKey(doc.months[k], key); });
          return { ok: true };
        }
        if (b.action === 'own_copy') {
          if (month <= FIRST) return { error: 'nothing_to_copy' };
          const here = new Set(rows.filter((r) => r.group === 'own').map((r) => String(r.label).toLowerCase()));
          const add = EX.monthOf(doc, EX.prevMonth(month)).own.filter((o) => !here.has(String(o.label || '').toLowerCase()));
          if (!add.length) return { noop: true, copied: 0 };
          add.forEach((o) => m.own.push({ id: EX.newId(), label: o.label, lei: o.lei == null ? null : o.lei, day: o.day || null, note: o.note || '', at: now(), by: session.employeeId }));
          return { ok: true, copied: add.length };
        }
        return { error: 'unknown_action' };
      });
      return send(out);
    }

    if (b.action === 'rec_day') {
      const line = EX.REC.find((r) => r.key === b.line);
      if (!line) return fail(400, 'invalid_line');
      const day = dayIn(b.day);
      if (day === undefined) return fail(400, 'invalid_day');
      return send(await update((doc) => { doc.recDays[line.key] = day == null ? 0 : day; return { ok: true }; }));
    }

    if (b.action === 'rec_add') {
      const line = EX.REC.find((r) => r.key === b.line);
      if (!line) return fail(400, 'invalid_line');
      const lei = MP.amount(b.lei);
      if (lei == null || !(lei > 0) || lei > 1e7) return fail(400, 'invalid_amount');
      const date = EX.isDay(b.date) && b.date.slice(0, 7) === month ? b.date : (month === cur ? EX.today() : month + '-01');
      const kind = line.kinds ? (line.kinds.some(([k]) => k === b.kind) ? b.kind : line.kinds[0][0]) : '';
      return send(await update((doc) => {
        const m = EX.monthW(doc, month);
        (m.rec[line.key] = Array.isArray(m.rec[line.key]) ? m.rec[line.key] : []).push(EX.newEntry({ date, lei, note: clip(b.note, 200), kind }, session.employeeId));
        return { ok: true };
      }));
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
      return send(await update((doc) => {
        const m = EX.monthW(doc, month);
        const list = Array.isArray(m.rec[line.key]) ? m.rec[line.key] : [];
        if (!list.some((e) => e && e.id === b.id)) return { error: 'not_found', code: 404 };
        m.rec[line.key] = list.filter((e) => e && e.id !== b.id);
        return { ok: true };
      }));
    }

    return fail(400, 'unknown_action');
  } catch (err) {
    console.error('portal-plati error:', err.message);
    res.status(500).json({ error: 'plati_failed' });
  }
};
