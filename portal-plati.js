// Centrul360 portal, the owner's Cheltuieli (the owner, 16.11: „astea toate sunt același lucru… merge-le într-o singură
// secțiune”): one page per month, no sub-tabs.
//   on top      one card: the donut of the month's payments (plătit / de plătit / întârziat), Încasări − Costuri =
//               Profit, the manager's bonus (5%), whether the month is complete, the next payment; a slim line stays
//               at the top once it scrolls away
//   the list    every cost of the month in four groups (Salarii, Fixe, Variabile, Ale tale): the payments with their day
//               and their tick (paid in parts), the lines that only count in the profit (Salarii brute, comisioane, ore),
//               the variable categories with their entries; chips filter it
//   the sheet   a tap on a row: pay all or part, the parts, its sum (this month, or every month = the month's costs),
//               its day, „se plătește automat”, where the sum comes from (salary taxes per person, Meta, the euro rate)
// Two readings, both owner only on the server: /api/portal-plati (the payments, the records, what is read by itself)
// and /api/portal-salariu?view=costs (the month's lines, the collections, the profit). The money rules live there;
// nothing of them is in this file, it only shows them and sends the owner's changes to the same actions as before.
(function () {
  'use strict';
  const K = window.K;
  if (!K) return;
  const { esc, icon } = K;
  const MON_S = K.MON_S;
  const PL = { month: K.thisMonth(), P: null, C: null, box: null, seq: 0, filter: 'all', animKey: '', nums: {}, prog: {}, arcs: null, flashKey: '', want: null };
  const FIRST = '2026-11'; // the first month of the payments (api/_lib/expenses.js FIRST); before it, only the month's costs
  const FILTERS = [['all', 'Toate'], ['open', 'De plătit'], ['late', 'Întârziate'], ['paid', 'Plătite']];
  try { const f = localStorage.getItem('c360-pl-filter'); if (FILTERS.some(([k]) => k === f)) PL.filter = f; } catch (e) { /* private mode */ }
  const reduced = () => (window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches) || document.documentElement.classList.contains('c360-reduce');
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  const EASE = 'cubic-bezier(.2,.8,.2,1)';
  const monName = (m) => K.MON[+m.slice(5, 7) - 1];
  const roDay = (iso) => { const t = Date.parse(iso); return Number.isFinite(t) ? K.dateShort(new Date(t).toLocaleDateString('sv-SE', { timeZone: 'Europe/Bucharest' })) : ''; };
  const roTime = (iso) => { const t = Date.parse(iso); return Number.isFinite(t) ? new Date(t).toLocaleTimeString('ro-RO', { timeZone: 'Europe/Bucharest', hour: '2-digit', minute: '2-digit' }) : ''; };
  const readAt = (iso) => { if (!iso) return ''; const d = new Date(Date.parse(iso)).toLocaleDateString('sv-SE', { timeZone: 'Europe/Bucharest' }); return d === K.today() ? 'azi la ' + roTime(iso) : roDay(iso) + ', ' + roTime(iso); };
  const dShort = (day) => (day ? +day.slice(8, 10) + ' ' + MON_S[+day.slice(5, 7) - 1] : '');
  const pct = (a, b) => (b > 0 ? Math.round((a / b) * 100) : 0);
  const isFuture = () => PL.month > K.thisMonth();
  const r2 = (n) => Math.round((Number(n) || 0) * 100) / 100;
  const rateTxt = (v) => Number(v || 0).toLocaleString('ro-RO', { maximumFractionDigits: 4 });

  // ------------------------------------------------------------------ loading (both readings at once)
  async function load(opts) {
    const n = ++PL.seq, month = PL.month;
    const box = PL.box;
    if (!box) return;
    const quiet = opts && opts.quiet;
    PL.busy = true;
    if (!quiet && !PL.P && !PL.C) box.innerHTML = '<div class="pf-narrow"><div class="k-skel" style="height:220px;border-radius:20px"></div><div class="k-skel" style="height:420px;margin-top:1rem;border-radius:20px"></div></div>';
    try {
      const [P, C] = await Promise.all([
        month >= FIRST ? K.api('/api/portal-plati?month=' + encodeURIComponent(month)) : Promise.resolve(null),
        K.api('/api/portal-salariu?view=costs&month=' + encodeURIComponent(month)).catch((e) => ({ error: K.errText(e) })),
      ]);
      if (n !== PL.seq) return;
      PL.P = P; PL.C = C && !C.error ? C : null; PL.cErr = C && C.error ? C.error : '';
      PL.busy = false;
      paint(opts || {});
    } catch (err) {
      if (n === PL.seq) PL.busy = false;
      if (n === PL.seq) box.innerHTML = '<div class="pf-narrow">' + topHtml() + K.empty('alert', 'Nu am putut încărca cheltuielile', K.errText(err)) + '</div>';
    }
  }
  // after a change: the newer numbers, the page stays where it is (the donut, the bars and the sums move to the new values)
  const reload = () => load({ quiet: true });

  // ------------------------------------------------------------------ the items of the list
  // One item per thing he pays or counts: row (a payment of api/_lib/expenses.js tracker), line (a line of the month's
  // costs, api/_lib/manager-pay.js costsOf), rec (a variable category and its entries), auto (what Meta read).
  // The id stays the same whether the item is a payment this month or not (the sheet and the motion find it again).
  const REC_IDS = { taxes: 'r:taxes', utilities: 'r:utilities', consumables: 'r:consumables', other: 'r:other' };
  const idOfRow = (key) => (key === 'taxes' ? 'r:taxes' : /^rec:/.test(key) ? 'r:' + key.slice(4) : /^auto:/.test(key) ? 'a:' + key.slice(5) : key);
  function build() {
    const P = PL.P, C = PL.C;
    const rows = P ? P.rows : [];
    const lines = (C && C.costs && C.costs.rows) || [];
    const lineOf = (k) => lines.find((l) => l.key === k) || null;
    const recOf = (k) => (P ? P.rec.find((x) => x.key === k) : null) || null;
    const used = new Set();
    const take = (f) => rows.filter((r) => !used.has(r.key) && f(r)).map((r) => { used.add(r.key); return r; });
    const it = (o) => Object.assign({ row: null, line: null, rec: null, auto: null, part: '' }, o);
    const sal = take((r) => r.group === 'sal').map((r) => it({ id: r.key, row: r }));
    take((r) => r.key === 'taxsal').forEach((r) => sal.push(it({ id: 'taxsal', row: r, rec: recOf('taxes'), part: 'sal' })));
    // the accountant's salary taxes, when Taxe la stat has no payment day this month: still in the list
    if (!sal.some((x) => x.id === 'taxsal') && recOf('taxes') && recOf('taxes').entries.some((e) => e.kind === 'salarii')) sal.push(it({ id: 'taxsal', rec: recOf('taxes'), part: 'sal', cat: 'taxes' }));
    ['salaries', 'commissions', 'overtime'].forEach((k) => { const l = lineOf(k); if (l) sal.push(it({ id: 'c:' + k, line: l })); });
    const fixed = take((r) => r.group === 'fixed').map((r) => it({ id: r.key, row: r, line: lineOf(r.key) }));
    // before the payments existed: the fixed lines of the month's costs
    if (!P) lines.filter((l) => l.kind === 'fixed' && l.key !== 'salaries').forEach((l) => fixed.push(it({ id: l.key, line: l })));
    const vars = [];
    Object.keys(REC_IDS).forEach((k) => {
      const r = take((x) => x.line === k && x.key !== 'taxsal')[0] || null, rec = recOf(k), line = lineOf(k);
      if (!r && !rec && !line) return;
      vars.push(it({ id: REC_IDS[k], row: r, rec, line, part: k === 'taxes' ? 'tax' : '', cat: k }));
    });
    ['ads', 'whatsapp'].forEach((k) => {
      const r = take((x) => x.key === 'auto:' + k)[0] || null, a = P ? (P.autos || []).find((x) => x.key === k) || null : null, line = lineOf(k);
      if (!r && !a && !line) return;
      vars.push(it({ id: 'a:' + k, row: r, auto: a, line, card: k }));
    });
    const own = take((r) => r.group === 'own').map((r) => it({ id: r.key, row: r }));
    take(() => true).forEach((r) => fixed.push(it({ id: idOfRow(r.key), row: r }))); // anything new the server adds
    return [
      { key: 'sal', title: 'Salarii', items: sal },
      { key: 'fixed', title: 'Fixe', items: fixed },
      { key: 'var', title: 'Variabile', items: vars, add: P && !isFuture() ? 'var' : '' },
      { key: 'own', title: 'Ale tale', items: own, add: P ? 'own' : '' },
    ];
  }
  const allItems = () => build().reduce((a, g) => a.concat(g.items), []);
  const itemById = (id) => allItems().find((x) => x.id === id) || null;
  // the entries of a category, the way the item shows them (the salary taxes typed by the accountant apart from TVA)
  const entriesOf = (it) => {
    const list = (it.rec && it.rec.entries) || [];
    return it.part === 'sal' ? list.filter((e) => e.kind === 'salarii') : it.part === 'tax' ? list.filter((e) => e.kind !== 'salarii') : list;
  };
  const kindLabel = (k) => ({ tva: 'TVA', salarii: 'Din salarii', alte: 'Alte taxe' })[k] || '';
  // what the item weighs this month: the payment's sum, else the entries, else the line in the costs
  function amountOf(it) {
    const r = it.row;
    if (r) return r.lei != null ? r.lei : r.done ? r.paidLei : null;
    if (it.rec) return r2(entriesOf(it).reduce((a, e) => a + Number(e.lei), 0));
    return it.line ? it.line.lei : null;
  }
  // a sum that comes by itself (Salariu, Meta, the salary taxes calculated): marked „automat”, the source in the sheet
  function isAuto(it) {
    const r = it.row;
    if (r) return r.group === 'sal' || r.group === 'card' || (r.key === 'taxsal' && !r.typed && !r.changed);
    if (it.line && it.line.auto) return it.line.source === 'auto';
    return false;
  }
  const labelOf = (it) => (it.row ? it.row.label : it.part === 'sal' ? 'Taxe la stat (salarii)' : it.rec ? it.rec.label : it.line ? it.line.label.replace(/ \(TVA, contribuții, impozite\)$/, '') : '');
  const shows = (it, f) => f === 'all' || (it.row && (f === 'open' ? !it.row.done : f === 'late' ? it.row.state === 'late' : it.row.done));

  // ------------------------------------------------------------------ the row
  const lastPart = (r) => (r.parts && r.parts.length ? r.parts[r.parts.length - 1] : null);
  const autoPart = (r) => (r.parts || []).find((p) => p.auto);
  function stateText(r) {
    if (r.done && autoPart(r) && r.parts.length === 1) return r.group === 'card' ? 'Plătit automat cu cardul' + (r.upToday ? ', până azi' : '') : 'Plătit automat pe ' + dShort(autoPart(r).date);
    if (!r.done && r.autoPay) return r.lei == null ? 'Automat, fără sumă' : r.due ? 'Se plătește automat pe ' + dShort(r.due) : 'Se plătește automat';
    if (r.done) { const p = lastPart(r); return 'Plătit ' + (p && p.date ? dShort(p.date) : roDay(r.paid && r.paid.at)) + (r.parts.length > 1 ? ' · ' + r.parts.length + ' părți' : ''); }
    if (r.state === 'late') return r.due ? (r.left === -1 ? 'Întârziată, era ieri' : 'Întârziată ' + K.plural(-r.left, 'zi', 'zile')) : 'Neplătită';
    if (r.state === 'today') return 'Azi';
    if (r.state === 'soon') return r.left === 1 ? 'Mâine' : 'În ' + r.left + ' zile';
    if (r.state === 'nodate') return 'Fără dată';
    return 'Pe ' + K.dateShort(r.due);
  }
  function subText(it) {
    const r = it.row, l = it.line;
    if (r) {
      const bits = [stateText(r)];
      if (r.group === 'sal') bits.push(esc(r.sub));
      else if (r.eur != null && r.lei != null && !r.changed) bits.push(K.num(r.eur) + ' €');
      else if (r.from && !r.changed) bits.push('suma din ' + esc(monName(r.from)));
      else if (r.group === 'own') bits.push(r.own.repeat ? 'lunar' : 'o dată' + (r.own.note ? ', ' + esc(r.own.note) : ''));
      else if (r.changed) bits.push('altă sumă luna asta');
      return bits.join(' · ');
    }
    if (it.rec) { const n = entriesOf(it).length; return (n ? K.plural(n, 'sumă', 'sume') : 'nimic încă') + ' · fără zi de plată'; }
    if (l) {
      if (l.lei == null) return 'lipsește din costurile lunii';
      if (l.auto) return l.source === 'manual' ? 'scrisă de tine, doar în profit' : 'din ' + esc(l.auto) + ', doar în profit';
      return 'doar în profit';
    }
    return '';
  }
  const dayBadge = (it) => {
    const r = it.row;
    if (r && r.due) return '<span class="pf-day"><b>' + +r.due.slice(8, 10) + '</b><small>' + MON_S[+r.due.slice(5, 7) - 1] + '</small></span>';
    return '<span class="pf-day is-none" aria-hidden="true">' + icon(r ? 'calendar' : it.rec ? 'receipt' : 'sliders') + '</span>';
  };
  // a number that rolls to its new value (data-pf-n: its name across repaints)
  const numEl = (key, v, cls) => '<b class="pf-num' + (cls ? ' ' + cls : '') + '" data-pf-n="' + esc(key) + '" data-v="' + (Number(v) || 0) + '">' + K.lei(v) + '</b>';
  function amountHtml(it) {
    const r = it.row, v = amountOf(it), auto = isAuto(it) ? '<small class="pf-autotag">automat</small>' : '';
    if (v != null) return '<span class="pf-amt">' + auto + (r && r.key === 'taxsal' && !r.typed && !r.changed ? '<s class="pf-approx" title="Calculat">≈</s>' : '') +
      (r && r.changed && r.orig != null ? '<s class="pf-orig" title="Suma obișnuită">' + K.lei(r.orig) + '</s>' : '') + K.lei(v) + '</span>';
    return '<span class="pf-amt is-miss">' + (it.line && !it.line.auto ? 'de completat' : 'fără sumă') + '</span>';
  }
  const progHtml = (r) => {
    const w = r.lei > 0 ? Math.min(1, r.paidLei / r.lei) : 0;
    return '<div class="pf-prog-line"><span>plătit <b>' + K.lei(r.paidLei) + '</b> din ' + K.lei(r.lei) + ', rămas <b class="pf-rest">' + K.lei(r.rest) + '</b></span>' +
      '<i class="pf-prog" aria-hidden="true"><i data-pf-p="' + esc(r.key) + '" data-w="' + w.toFixed(4) + '" style="transform:scaleX(' + w.toFixed(4) + ')"></i></i></div>';
  };
  // the entries of a category as hairline sub-rows (the first three; the rest in its sheet)
  function subsHtml(it) {
    const list = entriesOf(it);
    if (!list.length) return '';
    const shown = list.slice(0, 3);
    return '<ul class="pf-subs">' + shown.map((e) => '<li><span class="pf-sd">' + (e.date ? esc(dShort(e.date)) : '-') + '</span><span class="pf-sn">' +
        (e.kind && it.part === 'tax' ? '<em>' + esc(kindLabel(e.kind)) + '</em>' : '') + esc(e.note || '') + '</span><b>' + K.lei(e.lei, 2) + '</b></li>').join('') +
      (list.length > shown.length ? '<li class="is-more"><span></span><span class="pf-sn">încă ' + K.plural(list.length - shown.length, 'sumă', 'sume') + '</span><b></b></li>' : '') + '</ul>';
  }
  function tickHtml(it) {
    const r = it.row;
    if (!r) {
      // a category with no payment day: a quick „+” for one more entry; a line of the costs: nothing to tick
      if (it.rec && PL.P && !isFuture()) return '<button type="button" class="pf-tick pf-plus" data-pf-plus aria-label="Adaugă o sumă la ' + esc(it.rec.label) + '">' + icon('plus') + '</button>';
      return '<span class="pf-tick-sp" aria-hidden="true"></span>';
    }
    return '<button type="button" class="pf-tick' + (r.done ? ' is-on' : '') + '" data-pf-tick aria-pressed="' + (r.done ? 'true' : 'false') + '" aria-label="' +
      (r.done ? 'Plătit. Atinge ca să anulezi' : r.rest > 0 ? 'Plătește tot ce a rămas, ' + esc(K.lei(r.rest)) : 'Plătește') + '">' + icon('check') + '<span>' + (r.done ? 'Plătit' : 'Bifează') + '</span></button>';
  }
  function rowHtml(it) {
    const r = it.row, label = labelOf(it);
    return '<li class="pf-row is-' + (r ? r.state : 'cost') + (r && r.partial ? ' is-partial' : '') + '" data-key="' + esc(it.id) + '">' + dayBadge(it) +
      '<div class="pf-main" data-pf-open role="button" tabindex="0" aria-label="' + esc(label) + ': detalii' + (r ? ' și plată' : '') + '">' +
        '<div class="pf-line"><b class="pf-name">' + esc(label) + '</b>' + amountHtml(it) + '</div>' +
        '<div class="pf-sub"><span class="pf-st">' + subText(it) + '</span></div>' +
        (r && r.partial ? progHtml(r) : '') + subsHtml(it) + '</div>' + tickHtml(it) + '</li>';
  }

  // ------------------------------------------------------------------ the donut (SVG, no library)
  // segs: [{ lei, color, label }]; a small gap between the parts; each part says its name and sum on hover (title)
  function donut(segs, size, center, aria) {
    const sw = Math.max(10, Math.round(size * 0.12)), r = (size - sw) / 2, C = 2 * Math.PI * r;
    const total = segs.reduce((a, x) => a + Math.max(0, x.lei), 0);
    const live = segs.filter((x) => x.lei > 0);
    const gap = live.length > 1 ? 2.5 : 0;
    let at = 0;
    const arcs = total > 0 ? live.map((x) => {
      const len = (x.lei / total) * C, show = Math.max(0.5, len - gap);
      const el = '<circle cx="' + size / 2 + '" cy="' + size / 2 + '" r="' + r + '" fill="none" stroke="' + x.color + '" stroke-width="' + sw + '" stroke-linecap="butt"' +
        ' stroke-dasharray="' + show.toFixed(2) + ' ' + (C - show).toFixed(2) + '" stroke-dashoffset="' + (-at).toFixed(2) + '" data-len="' + show.toFixed(2) + '" data-off="' + (-at).toFixed(2) + '" data-c="' + C.toFixed(2) + '" data-seg="' + esc(x.label) + '"><title>' + esc(x.label) + ': ' + K.lei(x.lei) + '</title></circle>';
      at += len;
      return el;
    }).join('') : '';
    return '<div class="pf-donut" style="--s:' + size + 'px" role="img" aria-label="' + esc(aria) + '"><svg viewBox="0 0 ' + size + ' ' + size + '" width="' + size + '" height="' + size + '" aria-hidden="true">' +
      '<circle cx="' + size / 2 + '" cy="' + size / 2 + '" r="' + r + '" fill="none" stroke="var(--pf-track)" stroke-width="' + sw + '"/>' + arcs + '</svg>' +
      '<div class="pf-dc">' + center + '</div></div>';
  }
  // the parts grow from nothing when a month opens; after a change they move from where they were to the new sums
  function animateDonut(root, from) {
    const circles = root.querySelectorAll('.pf-donut circle[data-len]');
    const next = {};
    circles.forEach((c) => { next[c.dataset.seg] = { len: +c.dataset.len, off: +c.dataset.off }; });
    if (!reduced()) circles.forEach((c) => {
      const len = +c.dataset.len, off = +c.dataset.off, C = +c.dataset.c, was = from ? from[c.dataset.seg] : null;
      if (from && was && Math.abs(was.len - len) < 0.3 && Math.abs(was.off - off) < 0.3) return;
      c.style.transition = 'none';
      c.setAttribute('stroke-dasharray', (was ? was.len : 0) + ' ' + C);
      c.setAttribute('stroke-dashoffset', String(was ? was.off : off));
      requestAnimationFrame(() => requestAnimationFrame(() => {
        c.style.transition = 'stroke-dasharray .9s ' + EASE + ', stroke-dashoffset .9s ' + EASE;
        c.setAttribute('stroke-dasharray', len + ' ' + (C - len)); c.setAttribute('stroke-dashoffset', String(off));
      }));
    });
    return next;
  }
  // the numbers: from 0 when a month opens, from the last value after a change (K.countUp, off with reduced motion)
  function rollNumbers(root) {
    root.querySelectorAll('[data-pf-n]').forEach((el) => {
      const k = el.dataset.pfN, v = Number(el.dataset.v) || 0, fmt = el.dataset.fmt === 'pct' ? (x) => Math.round(x) + '%' : el.dataset.fmt === 'num' ? (x) => K.num(Math.round(x)) : (x) => K.lei(Math.round(x));
      el._kv = PL.nums[k] != null ? PL.nums[k] : 0;
      PL.nums[k] = v;
      if (reduced()) { el.textContent = fmt(v); return; }
      K.countUp(el, v, fmt, 900);
    });
  }
  // the bars of the rows paid in part: from their last width to the new one
  function fillBars(root) {
    root.querySelectorAll('[data-pf-p]').forEach((el) => {
      const k = el.dataset.pfP, w = Number(el.dataset.w) || 0, was = PL.prog[k];
      PL.prog[k] = w;
      if (reduced() || was == null || Math.abs(was - w) < 0.001) return;
      el.style.transition = 'none'; el.style.transform = 'scaleX(' + was + ')';
      requestAnimationFrame(() => requestAnimationFrame(() => { el.style.transition = ''; el.style.transform = 'scaleX(' + w + ')'; }));
    });
  }
  // a month opened: the card and the rows come in one after the other, quickly
  function enter(root) {
    if (reduced()) return;
    let i = 0;
    root.querySelectorAll('.pf-hero, .pf-prop, .pf-tools, .pf-g-head, .pf-row').forEach((el) => {
      const r = el.getBoundingClientRect();
      if (r.top > innerHeight + 40) return; // below the screen: already in place when it scrolls in
      el.animate([{ opacity: 0, transform: 'translateY(10px)' }, { opacity: 1, transform: 'none' }], { duration: 340, delay: Math.min(i++, 18) * 26, easing: EASE, fill: 'backwards' });
    });
  }

  // ------------------------------------------------------------------ the page
  function topHtml() {
    const cur = K.thisMonth(), last = PL.P ? PL.P.last : K.addMonths(cur, 1), min = K.addMonths(cur, -12);
    return '<div class="pf-top"><div class="k-month"><button type="button" class="k-icon-btn" data-pf-m="-1" aria-label="Luna anterioară"' + (PL.month <= min ? ' disabled' : '') + '>' + icon('left') + '</button><b>' + esc(K.monthLabel(PL.month)) + '</b>' +
      '<button type="button" class="k-icon-btn" data-pf-m="1" aria-label="Luna următoare"' + (PL.month >= last ? ' disabled' : '') + '>' + icon('right') + '</button></div>' +
      '<span class="pf-private">' + icon('shield') + 'Doar tu vezi</span></div>';
  }
  function heroHtml() {
    const P = PL.P, C = PL.C;
    const s = P ? P.summary : null;
    let pay = '';
    if (s && (s.count || s.planned > 0)) {
      const all = s.planned != null ? s.planned : s.paid + s.toPay, p = pct(s.paid, all), openLei = Math.max(0, s.toPay - s.lateLei);
      const leg = (cls, label, key, lei) => '<li class="' + cls + '"><i aria-hidden="true"></i><span>' + label + '</span>' + numEl(key, lei) + '</li>';
      pay = '<div class="pf-hero-pay"><div class="pf-hero-row">' + donut([{ lei: s.paid, color: 'var(--pf-paid)', label: 'Plătit' }, { lei: openLei, color: 'var(--pf-open)', label: 'De plătit' }, { lei: s.lateLei, color: 'var(--pf-late)', label: 'Întârziate' }], 112,
          '<b data-pf-n="pct" data-v="' + p + '" data-fmt="pct">' + p + '%</b><small>plătit</small>', p + '% plătit: ' + K.lei(s.paid) + ' plătit, ' + K.lei(openLei) + ' de plătit, ' + K.lei(s.lateLei) + ' întârziate') +
        '<ul class="pf-leg">' + leg('is-paid', 'Plătit', 'paid', s.paid) + leg('is-open', 'De plătit', 'open', openLei) + leg('is-late', 'Întârziate', 'late', s.lateLei) + '</ul></div>' +
        (s.missing ? '<p class="pf-ov-note">' + icon('info') + K.plural(s.missing, 'plată fără sumă', 'plăți fără sumă') + ', nu intră în cerc</p>' : '') + '</div>';
    }
    // Încasări − Costuri = Profit (whole lei, as the server counts them), the bonus, whether the month is complete
    let eq = '';
    if (C && !isFuture()) {
      const prof = C.profit, n = (key, v) => '<b><span data-pf-n="' + key + '" data-v="' + Math.abs(v) + '" data-fmt="num">' + K.num(Math.abs(v)) + '</span><small>lei</small></b>';
      eq = '<div class="pf-eq" role="group" aria-label="Încasări ' + K.lei(C.collections) + ' minus costuri ' + K.lei(C.costs.total) + ' egal profit ' + K.lei(prof) + '">' +
          '<div class="pf-eq-c"><span>Încasări</span>' + n('inc', C.collections) + '</div><i aria-hidden="true">−</i>' +
          '<button type="button" class="pf-eq-c is-cost" data-pf-costs aria-label="Costurile lunii, pe categorii"><span>Costuri' + icon('right') + '</span>' + n('cost', C.costs.total) + '</button><i aria-hidden="true">=</i>' +
          '<div class="pf-eq-c is-prof ' + (prof >= 0 ? 'is-good' : 'is-bad') + '"><span>Profit' + (C.current ? ' până azi' : '') + '</span><b>' + (prof < 0 ? '−' : '') + '<span data-pf-n="prof" data-v="' + Math.abs(prof) + '" data-fmt="num">' + K.num(Math.abs(prof)) + '</span><small>lei</small></b></div></div>' +
        bonusHtml() + monthStateHtml();
    } else if (isFuture()) eq = '<p class="pf-hero-line is-muted">' + icon('clock') + '<span>Luna nu a început: încasările și profitul apar din ' + esc(monName(PL.month)) + '.</span></p>';
    else if (PL.cErr) eq = '<p class="pf-hero-line is-warn">' + icon('alert') + '<span>Costurile lunii nu s-au putut citi: ' + esc(PL.cErr) + '</span></p>';
    const next = P && P.next ? nextHtml(P.next) : '';
    if (!pay && !eq && !next) return '';
    return '<section class="pf-hero' + (pay ? '' : ' is-flat') + '" data-pf-ov>' + pay + (eq || next ? '<div class="pf-hero-money">' + eq + next + '</div>' : '') + '</section>' +
      (s && (s.count || s.planned > 0) ? miniHtml(s) : '');
  }
  function miniHtml(s) {
    const all = s.planned != null ? s.planned : s.paid + s.toPay, p = pct(s.paid, all);
    return '<div class="pf-mini" data-pf-mini aria-hidden="true"><span><b>' + p + '%</b> plătit</span><span>rămas <b>' + K.lei(s.toPay) + '</b></span>' + (PL.C && !isFuture() ? '<span class="is-prof">profit <b>' + K.lei(PL.C.profit) + '</b></span>' : '') +
      (s.late ? '<span class="is-late">' + K.plural(s.late, 'întârziată', 'întârziate') + '</span>' : '') + '<i><i style="transform:scaleX(' + (p / 100) + ')"></i></i></div>';
  }
  // the manager's bonus as Costuri lunare counted it: 5% of the profit when it is positive, her condition so far
  function bonusHtml() {
    const C = PL.C;
    if (C.bonusOk === null || C.bonusOk === undefined) return '';
    const bonus = Math.round(Math.max(0, C.profit) * 0.05);
    return '<p class="pf-hero-line">' + icon('trophy') + '<span>Bonus (5%) <b>' + (C.bonusOk ? K.lei(bonus) : '0 lei') + '</b>' +
      (C.bonusOk ? ' <em class="is-ok">condiția e îndeplinită până acum</em>' : ' <em class="is-no">condiția nu e îndeplinită încă' + (bonus ? ' (ar fi ' + K.lei(bonus) + ')' : '') + '</em>') + '</span></p>';
  }
  // the month's costs complete and saved (the manager's bonus waits for it): what is missing, and the two quick fixes
  function monthStateHtml() {
    const C = PL.C, E = C.entry, miss = C.costs.rows.filter((r) => r.lei == null);
    const copy = C.prev && miss.some((r) => r.kind === 'fixed') ? '<button type="button" class="pf-link-btn" data-pf-copy-costs>' + icon('copy') + 'Copiază din ' + esc(monName(C.prev.month)) + '</button>' : '';
    if (!miss.length && E.savedAt) return '<p class="pf-hero-line is-muted">' + icon('checkCircle') + '<span>Luna e completă, salvată ' + esc(roDay(E.savedAt)) + '</span></p>';
    if (!miss.length) return '<p class="pf-hero-line is-warn">' + icon('info') + '<span>Luna nu e salvată încă, bonusul așteaptă.</span><button type="button" class="pf-link-btn" data-pf-save-month>' + icon('check') + 'Salvează luna</button></p>';
    return '<p class="pf-hero-line is-warn">' + icon('alert') + '<span>Lipsește: ' + esc(miss.map((r) => r.label.replace(/ \(.*\)$/, '')).join(', ')) + '</span>' + copy + '</p>';
  }
  function nextHtml(n) {
    const when = n.left === 0 ? 'azi' : n.left === 1 ? 'mâine' : n.left > 1 && n.left <= 7 ? 'în ' + n.left + ' zile' : '';
    return '<button type="button" class="pf-next" data-pf-jump="' + esc(idOfRow(n.key)) + '" data-month="' + esc(n.month) + '"><span class="pf-next-k">Următoarea plată</span>' +
      '<span class="pf-next-v"><b>' + esc(n.label) + '</b><span>' + esc(dShort(n.due)) + (when ? ', ' + when : '') + '</span>' + (n.lei != null ? '<b class="pf-next-l">' + K.lei(n.lei) + '</b>' : '') + '</span>' +
      (n.more ? '<small>și încă ' + K.plural(n.more, 'plată', 'plăți') + ' în aceeași zi' + (n.moreLei > 0 ? ', ' + K.lei(n.moreLei) : '') + '</small>' : '') + icon('right') + '</button>';
  }
  // the costs the manager sent at month close: a small card on top of the list, as in Costuri lunare
  function propHtml() {
    const C = PL.C, P = C && C.entry && C.entry.proposal;
    if (!P || P.status !== 'pending') return '';
    const first = String(P.byName || '').split(' ')[0];
    return '<div class="co-prop pf-prop" data-pf-prop>' + icon('inbox') + '<div><b>' + (first ? esc(first) + ' a trimis' : 'S-au trimis') + ' costurile lunii</b><span>' +
        [P.consumables != null ? 'Consumabile ' + K.lei(P.consumables) : '', P.other != null ? 'Alte costuri ' + K.lei(P.other) : ''].filter(Boolean).join(' · ') + (P.note ? ' · „' + esc(P.note) + '”' : '') + '</span></div>' +
      '<div class="co-prop-acts"><button type="button" class="k-btn is-sm is-good" data-pf-prop-go="accept">' + icon('check') + 'Folosește</button><button type="button" class="k-btn is-sm is-ghost" data-pf-prop-go="decline">Nu</button></div></div>';
  }
  function chipsHtml(groups) {
    const rows = PL.P ? PL.P.rows : [];
    if (!rows.length) return '';
    const n = { all: groups.reduce((a, g) => a + g.items.length, 0), open: rows.filter((r) => !r.done).length, late: rows.filter((r) => r.state === 'late').length, paid: rows.filter((r) => r.done).length };
    return '<div class="pf-tools"><div class="k-chips pf-chips">' + FILTERS.map(([k, l]) => '<button type="button" class="k-chip' + (PL.filter === k ? ' is-on' : '') + '" data-pf-filter="' + k + '" aria-pressed="' + (PL.filter === k) + '">' + l + '<span>' + n[k] + '</span></button>').join('') + '</div></div>';
  }
  function listHtml(groups) {
    const f = PL.filter;
    const head = (g, n) => '<div class="pf-g-head"><h4>' + esc(g.title) + (n ? '<span>' + n + '</span>' : '') + '</h4>' +
      (g.add === 'var' ? '<button type="button" class="pf-g-add" data-pf-add-entry>' + icon('plus') + 'Adaugă</button>' : g.add === 'own' ? '<button type="button" class="pf-g-add" data-pf-own-add>' + icon('plus') + 'Plată nouă</button>' : '') + '</div>';
    const html = groups.map((g) => {
      const items = g.items.filter((it) => shows(it, f));
      if (!items.length && (f !== 'all' || !g.add)) return '';
      let foot = '';
      if (g.key === 'own' && f === 'all') {
        if (!items.length) foot = '<p class="pf-g-empty">Ce mai plătești tu: o dată sau în fiecare lună.</p>';
        if (PL.P && PL.P.copyable) foot += '<button type="button" class="pf-g-foot" data-pf-copy>' + icon('copy') + 'Copiază din luna trecută <span>' + PL.P.copyable + '</span></button>';
      }
      return '<section class="pf-group" data-g="' + g.key + '">' + head(g, items.length) + (items.length ? '<ul class="pf-list">' + items.map(rowHtml).join('') + '</ul>' : '') + foot + '</section>';
    }).join('');
    if (html) return html;
    return '<p class="pf-none">' + (f === 'late' ? 'Nimic întârziat.' : f === 'paid' ? 'Nimic plătit încă.' : f === 'open' ? 'Totul e plătit.' : 'Nicio cheltuială luna asta.') + '</p>';
  }
  function footHtml() {
    const P = PL.P;
    if (!P) return '<p class="pf-foot">Plățile cu zi și bifă încep din ' + esc(K.monthLabel(FIRST)) + '. Aici sunt costurile lunii, pentru profit.</p>';
    return '<p class="pf-foot">Salariile de ' + esc(monName(P.salariesFor)) + ' se plătesc în ' + esc(monName(P.month)) + ', în ziua din fișa fiecăruia (Oameni → Ziua salariului). Cine a plecat nu mai apare aici. ' +
      'Rândurile „doar în profit” nu se bifează: intră în Încasări − Costuri.</p>';
  }
  function paint(opts) {
    const box = PL.box;
    if (!box) return;
    const groups = build();
    const fresh = PL.animKey !== PL.month; // a month opened (or the page): everything comes in; after a change it moves
    if (fresh) { PL.nums = {}; PL.prog = {}; PL.arcs = null; }
    const keepY = !fresh ? window.scrollY : null;
    box.innerHTML = '<div class="pf-narrow pf-page">' + topHtml() + heroHtml() + propHtml() + chipsHtml(groups) + '<div data-pf-listwrap>' + listHtml(groups) + '</div>' + footHtml() + '</div>';
    if (keepY != null && Math.abs(window.scrollY - keepY) > 1) window.scrollTo(0, keepY);
    PL.arcs = animateDonut(box, fresh ? null : PL.arcs);
    rollNumbers(box); fillBars(box);
    if (fresh) { PL.animKey = PL.month; enter(box); }
    // the slim line shows once the card is out of view
    if (PL.io) PL.io.disconnect();
    const ov = box.querySelector('[data-pf-ov]'), mini = box.querySelector('[data-pf-mini]');
    if (ov && mini && 'IntersectionObserver' in window) {
      PL.io = new IntersectionObserver(([e]) => mini.classList.toggle('is-on', !e.isIntersecting && e.boundingClientRect.top < 0), { threshold: 0 });
      PL.io.observe(ov);
    }
    if (PL.flashKey) { const k = PL.flashKey; PL.flashKey = ''; requestAnimationFrame(() => flash(k)); }
    if (PL.want === 'prop') { PL.want = null; const p = box.querySelector('[data-pf-prop]'); if (p) requestAnimationFrame(() => { p.scrollIntoView({ block: 'center', behavior: reduced() ? 'auto' : 'smooth' }); p.classList.add('is-flash'); setTimeout(() => p.classList.remove('is-flash'), 1600); }); }
    if (opts && opts.then) opts.then();
  }
  // the filter: the list fades out, changes, fades back in (the card on top stays as it is)
  async function setFilter(f) {
    if (f === PL.filter) return;
    PL.filter = f;
    try { localStorage.setItem('c360-pl-filter', f); } catch (e) { /* private mode */ }
    const box = PL.box, wrap = box && box.querySelector('[data-pf-listwrap]');
    box.querySelectorAll('[data-pf-filter]').forEach((b) => { const on = b.dataset.pfFilter === f; b.classList.toggle('is-on', on); b.setAttribute('aria-pressed', String(on)); });
    if (!wrap) return;
    if (!reduced()) await wrap.animate([{ opacity: 1 }, { opacity: 0, transform: 'translateY(3px)' }], { duration: 110, easing: 'ease-in', fill: 'forwards' }).finished.catch(() => {});
    wrap.innerHTML = listHtml(build());
    fillBars(wrap);
    if (!reduced()) {
      wrap.getAnimations().forEach((a) => a.cancel());
      wrap.animate([{ opacity: 0, transform: 'translateY(4px)' }, { opacity: 1, transform: 'none' }], { duration: 220, easing: EASE });
    }
  }
  // a row comes into view and lights up for a moment
  function flash(id) {
    const el = PL.box && PL.box.querySelector('.pf-row[data-key="' + (window.CSS && CSS.escape ? CSS.escape(id) : id) + '"]');
    if (!el) return;
    el.scrollIntoView({ block: 'center', behavior: reduced() ? 'auto' : 'smooth' });
    el.classList.remove('is-flash'); void el.offsetWidth; el.classList.add('is-flash');
    setTimeout(() => el.classList.remove('is-flash'), 1600);
  }
  const rowEl = (id) => PL.box && PL.box.querySelector('.pf-row[data-key="' + (window.CSS && CSS.escape ? CSS.escape(id) : id) + '"]');

  // ------------------------------------------------------------------ the sheet of a row
  const leiIn = (name, value, ph, cls) => '<div class="k-money' + (cls ? ' ' + cls : '') + '"><input name="' + name + '" type="number" inputmode="decimal" min="0" step="0.01" placeholder="' + (ph || '0') + '"' + (value != null ? ' value="' + esc(value) + '"' : '') + '></div>';
  const numOf = (v) => { const n = Number(String(v == null ? '' : v).replace(/\s/g, '').replace(',', '.')); return Number.isFinite(n) ? n : NaN; };
  const blank = (v) => String(v == null ? '' : v).trim() === '';
  const post = (body) => K.api('/api/portal-plati', Object.assign({ month: PL.month }, body));
  const toast = (m, t) => K.ui().toast(m, t || 'success');
  const fail = (e) => K.ui().toast(K.errText(e), 'error');
  const h5 = (t) => '<h5 class="pf-sh-h">' + t + '</h5>';
  const note = (html, ic) => '<p class="pf-sh-note">' + (ic ? icon(ic) : '') + html + '</p>';
    // the month's costs as they are saved, with one change (the same body Costuri lunare sent: every line, every override)
  async function saveCosts(change) {
    const C = PL.C, E = C.entry, lines = {}, over = {};
    C.lines.forEach((l) => { if (l.auto) over[l.key] = E.over[l.key]; else if (!l.rec) lines[l.key] = E.lines[l.key]; });
    Object.assign(lines, change.lines || {}); Object.assign(over, change.over || {});
    const eurRate = change.eurRate != null ? change.eurRate : E.eurRate;
    if (C.lines.some((l) => l.eur && Number(lines[l.key]) > 0) && !(Number(eurRate) > 0)) throw new Error('Scrie cursul euro al lunii.');
    await K.api('/api/portal-salariu', { action: 'costs_save', month: PL.month, eurRate, lines, over });
    if (K.mgReset) K.mgReset(); // the manager's bonus reads the costs: her page counts again
  }
  const eurLine = () => {
    const E = PL.C && PL.C.entry;
    if (!E) return '';
    return E.eurFrom && E.eurFrom.source === 'bnr' ? '1 € = ' + rateTxt(E.eurRate) + ' lei, ' + esc(E.eurFrom.bank || 'BNR') + (E.eurFrom.date ? ' ' + esc(roDay(E.eurFrom.date)) : '') + ', se actualizează singur' : '';
  };
  // where the sum comes from, in one or two quiet lines
  function sourceHtml(it) {
    const r = it.row, l = it.line, a = it.auto, out = [];
    if (r && r.group === 'sal') {
      const ex = (r.extras || []).map((x) => K.lei(x.lei) + ' ' + esc(x.label)).join(' + ');
      out.push(note('Din Salariu: ' + esc(r.sub.toLowerCase()) + (ex ? ', ' + K.lei(r.base) + ' + ' + ex : '') + '. Ziua se schimbă în Oameni, în fișa ei.', 'zap'));
    }
    if (r && r.key === 'taxsal') out.push(note(r.typed ? 'Suma e cea de la contabilă.' : 'Calculată din salarii, pe persoane. Când ai suma de la contabilă, scrie-o mai jos.', 'zap'));
    if (it.card || (l && l.auto)) {
      if (a) {
        const src = a.error && a.lei == null ? (/nu poate fi citit/.test(a.error) ? esc(a.src) + ' nu poate fi citit acum' : esc(a.src) + ' nu răspunde: ' + esc(a.error)) + '. Scrie suma mai jos.'
          : a.over != null ? 'Suma e scrisă de tine.' : a.none ? 'WhatsApp nu e conectat.' : 'Din ' + esc(a.src) + (a.at ? ', actualizat ' + esc(readAt(a.at)) : '') + (a.saved ? ' (ultima citire)' : '') + '.';
        out.push(note(src + (r && r.group === 'card' ? ' Meta ia banii de pe card pe măsură ce cheltuie.' : ''), 'zap'));
      } else if (l) {
        const rd = PL.C && PL.C.read && PL.C.read[l.key];
        out.push(note(l.source === 'manual' ? 'Suma e scrisă de tine; automat ar fi ' + (l.autoLei != null ? K.lei(l.autoLei) : 'necunoscut') + '.' : l.autoLei != null ? 'Din ' + esc(l.auto) + ', se actualizează singur' + (rd && rd.at ? ', ' + esc(readAt(rd.at)) : '') + '.' : esc(l.auto) + ' nu poate fi citit acum, scrie suma.', 'zap'));
      }
    }
    if (r && r.eur != null && r.group === 'fixed') {
      const E = PL.C && PL.C.entry;
      out.push(note(K.num(r.eur) + ' € × ' + (E && E.eurRate ? rateTxt(E.eurRate) : '?') + ' = ' + (r.lei != null ? K.lei(r.lei) : '?') + '<br><small>' + (eurLine() || 'BNR nu răspunde acum: cursul salvat cu luna') + '</small>', 'refresh'));
    }
    if (r && r.from && !r.changed) out.push(note('Suma din ' + esc(monName(r.from)) + ': pe ' + esc(monName(PL.month)) + ' nu e scrisă încă în costuri.', 'info'));
    if (l && l.key === 'salaries') out.push(note('Salariile brute ale lunii, pentru profit. Taxele din salarii sunt incluse aici, nu se scad încă o dată.', 'info'));
    if (it.rec && it.rec.hint) out.push(note(esc(it.rec.hint), ''));
    if (r && r.group === 'own') out.push(note('Doar o plată: nu intră în costurile pentru profit. Pentru profit, adaug-o la Variabile.', 'info'));
    if (r && r.group === 'fixed' && l && l.lei != null && r.lei != null && Math.round(r.lei) !== l.lei) out.push(note('În costurile lunii: ' + K.lei(l.lei) + '.', 'info'));
    return out.join('');
  }
  function topStats(it) {
    const r = it.row, stat = (label, v, cls) => '<div class="pf-sh-stat' + (cls ? ' ' + cls : '') + '"><span>' + label + '</span><b>' + v + '</b></div>';
    if (r) {
      const w = r.lei > 0 ? Math.min(1, r.paidLei / r.lei) : r.done ? 1 : 0;
      return '<div class="pf-sh-top">' + stat('De plătit', r.lei != null ? K.lei(r.lei, 2) : 'fără sumă') + stat('Plătit', K.lei(r.paidLei, 2), 'is-paid') + stat('Rămas', r.rest != null ? K.lei(r.rest, 2) : '-', r.state === 'late' ? 'is-late' : '') +
        '<i class="pf-prog" aria-hidden="true"><i style="transform:scaleX(' + w.toFixed(4) + ')"></i></i>' + (r.changed && r.orig != null ? '<p class="pf-sh-note">Luna asta altă sumă. De obicei ' + K.lei(r.orig, 2) + '.</p>' : '') + '</div>';
    }
    const v = amountOf(it);
    return '<div class="pf-sh-top is-one">' + stat(it.rec ? 'Luna asta' : 'În costurile lunii', v != null ? K.lei(v, 2) : 'lipsește', v == null ? 'is-late' : '') + '</div>';
  }
  const partsHtml = (r) => '<ul class="pf-parts">' + r.parts.map((p, i) => '<li><span class="pf-pd">' + esc(dShort(p.date)) + '</span><span class="pf-pn">' +
      esc([p.byName, p.note].filter(Boolean).join(' · ')) + '</span><b>' + K.lei(p.lei, 2) + '</b>' +
      (p.auto ? '<span class="pf-pauto" title="Se plătește automat">' + icon('zap') + '</span>' : '<span class="pf-pacts">' + (i === r.parts.length - 1 ? '<button type="button" class="pf-pdel" data-act="note" aria-label="Notă la plată">' + icon('pen') + '</button>' : '') +
        '<button type="button" class="pf-pdel" data-act="pdel" data-id="' + esc(p.id) + '" aria-label="Șterge plata de ' + esc(K.lei(p.lei, 2)) + '">' + icon('x') + '</button></span>') + '</li>').join('') + '</ul>';
  // the sum: every month (the month's costs, what Costuri lunare kept) or this month only (the payment)
  function amountSection(it) {
    const r = it.row, l = it.line, mon = esc(monName(PL.month)), fut = isFuture() || !PL.C;
    const btns = (inner) => '<div class="pf-sh-btns">' + inner + '</div>';
    // a fixed line with its line in the costs: Mereu (Costuri lunare) or only this month (the payment)
    if (r && r.group === 'fixed' && l && !fut) {
      const eur = l.eur !== undefined && r.eur !== undefined;
      const E = PL.C.entry, typed = E.lines[l.key], bnr = E.eurFrom && E.eurFrom.source === 'bnr';
      return h5('Suma') + '<form class="k-form pf-form" data-form="amt" data-eur="' + (eur ? 1 : '') + '">' +
        K.field('', K.seg('scope', [['all', 'Mereu'], ['month', 'Doar pe ' + mon]], r.changed ? 'month' : 'all', 'is-big'), 'full') +
        '<div class="k-field full" data-scope="all"' + (r.changed ? ' hidden' : '') + '><span>' + (eur ? 'În euro, pe lună' : 'Pe lună') + '</span>' + leiIn('all', typed != null ? typed : eur ? r.eur : r.lei, 'de completat', eur ? 'is-eur' : '') +
          (eur && !bnr ? '<span class="pf-rate">Cursul euro (BNR nu răspunde acum)</span>' + leiIn('rate', E.eurRate, 'curs BNR', 'is-rate') : '') +
          '<small data-conv>' + (eur ? esc(eurLine()) : 'Intră în costurile lunii și în profit; lunile următoare o preiau.') + '</small></div>' +
        '<div class="k-field full" data-scope="month"' + (r.changed ? '' : ' hidden') + '><span>Doar plata pe ' + mon + ', în lei</span>' + leiIn('month', r.lei, 'sumă') + '<small>Profitul rămâne pe suma de mai sus.</small></div>' +
        btns((r.changed ? '<button type="button" class="k-btn pf-link" data-act="amt-reset">Înapoi la ' + (r.orig != null ? esc(K.lei(r.orig)) : 'fără sumă') + '</button>' : '') + '<button type="button" class="k-btn" data-act="amt-save">Salvează suma</button>') + '</form>';
    }
    // a line that only counts in the profit, or what is read by itself (Meta, Salariu): the month's sum in the costs
    if ((l && !l.rec && !r) || (it.card && l)) {
      if (fut) return '';
      const auto = !!l.auto, E = PL.C.entry, v = auto ? E.over[l.key] : E.lines[l.key];
      return h5(auto ? 'Altă sumă pe ' + mon : 'Suma pe ' + mon) + '<form class="k-form pf-form" data-form="line" data-key="' + esc(l.key) + '" data-auto="' + (auto ? 1 : '') + '">' +
        K.field(l.eur !== undefined ? 'În euro' : '', leiIn('lei', v, auto ? (l.autoLei != null ? String(Math.round(l.autoLei)) : 'suma') : 'de completat', l.eur !== undefined ? 'is-eur' : ''), 'full', auto ? 'Goală: suma automată.' : l.eur !== undefined ? esc(eurLine()) : '') +
        btns((auto && v != null ? '<button type="button" class="k-btn pf-link" data-act="line-auto">Înapoi la automat</button>' : '') + '<button type="button" class="k-btn" data-act="line-save">Salvează</button>') + '</form>';
    }
    // a payment whose sum comes from elsewhere: another sum only this month (folded until he needs it)
    if (r && !(r.group === 'own' && !r.own.repeat)) {
      return '<details class="pf-more"' + (r.changed ? ' open' : '') + '><summary>' + icon('pen') + 'Altă sumă doar pe ' + mon + '</summary><form class="k-form pf-form" data-form="once">' +
        K.field('', leiIn('lei', r.changed ? r.lei : null, r.lei != null ? String(r.lei) : 'sumă'), 'full') +
        btns((r.changed ? '<button type="button" class="k-btn pf-link" data-act="amt-reset">Înapoi la ' + (r.orig != null ? esc(K.lei(r.orig)) : 'fără sumă') + '</button>' : '') + '<button type="button" class="k-btn" data-act="once-save">Salvează suma</button>') + '</form></details>';
    }
    return '';
  }
  // the entries of a category: the list (each can go) and one more (the sum, the day, a note; for the taxes, which kind)
  function entriesSection(it) {
    if (!it.rec || !PL.P) return '';
    const list = entriesOf(it), d = PL.P, t = K.today();
    const date = t.slice(0, 7) === d.month ? t : d.month + '-01';
    const kinds = it.part === 'tax' ? [['tva', 'TVA'], ['alte', 'Alte taxe']] : null;
    return h5(it.part === 'sal' ? 'Suma de la contabilă' : 'Sumele lunii') +
      (list.length ? '<ul class="pf-ents">' + list.map((e) => '<li><span class="pf-ent-d">' + (e.date ? esc(dShort(e.date)) : '-') + '</span><span class="pf-ent-n">' +
        (e.kind && kinds ? '<em>' + esc(kindLabel(e.kind)) + '</em>' : '') + esc(e.note || '') + '</span><b>' + K.lei(e.lei, 2) + '</b>' +
        '<button type="button" class="k-icon-btn pf-del" data-act="edel" data-id="' + esc(e.id) + '" aria-label="Șterge">' + icon('trash') + '</button></li>').join('') + '</ul>' : '') +
      (isFuture() ? '' : '<form class="k-form pf-form pf-entf" data-form="ent">' + K.field('Suma', leiIn('lei', null, '0'), '') +
        K.field('Data', '<input name="date" type="date" value="' + esc(date) + '" min="' + esc(d.month + '-01') + '" max="' + esc(d.month + '-' + K.pad(K.daysIn(d.month))) + '">', '') +
        (kinds ? K.field('Ce fel', K.seg('kind', kinds, 'tva'), 'full') : '') +
        K.field('Notă', '<input name="note" maxlength="200" placeholder="' + (it.part === 'sal' ? 'ex. contribuții și impozit' : 'ex. factura de curent') + '">', 'full') +
        '<div class="pf-sh-btns"><button type="button" class="k-btn" data-act="ent-add">' + icon('plus') + 'Adaugă</button></div></form>') +
      (it.part === 'sal' ? note('Taxele din salarii sunt deja în Salarii brute: nu se scad încă o dată din profit.', 'info') : '');
  }
  // the payment day of a category (a day: it is a payment with a tick once it has a sum)
  function daySection(it) {
    if (!it.rec || it.part === 'sal' || !PL.P) return '';
    const cur = it.rec.day || 0;
    return h5('Ziua de plată') + '<div class="k-field full"><select data-act="day" aria-label="Ziua de plată">' + K.options([['0', 'Fără zi, doar o notez']].concat(Array.from({ length: 31 }, (_, i) => [String(i + 1), 'Pe ' + (i + 1) + ' ale lunii'])), String(cur)) + '</select>' +
      '<small>Cu o zi, suma lunii apare cu bifă și în cercul plăților.</small></div>';
  }
  const SUGGEST = ['Utilități', 'TVA', 'Furnizor', 'Chirie extra'];
  function ownForm(o, r) {
    o = o || {};
    return '<form class="k-form pf-form" data-pf-ownf>' +
      K.field('Ce plătești', '<input name="label" maxlength="60" required placeholder="ex. factura de curent" value="' + esc((r && r.label) || '') + '">', 'full') +
      (r ? '' : '<div class="pf-sugg">' + SUGGEST.map((x) => '<button type="button" class="k-chip" data-sugg="' + esc(x) + '">' + esc(x) + '</button>').join('') + '</div>') +
      K.field(r && o.repeat ? 'Suma, în fiecare lună' : 'Suma', leiIn('lei', r ? (o.repeat ? (r.changed ? r.orig : r.lei) : r.lei) : null, 'poate rămâne goală'), '') +
      K.field('Ziua din lună', '<input name="day" type="number" inputmode="numeric" min="1" max="31" step="1" placeholder="fără dată" value="' + esc(o.day || '') + '">', '') +
      K.field('Notă', '<input name="note" maxlength="120" placeholder="opțional" value="' + esc(o.note || '') + '">', 'full') +
      '<div class="k-field full pf-rep">' + K.toggle('repeat', !!o.repeat, 'Se repetă lunar, până o ștergi') + '</div></form>';
  }
  function wireOwnForm(f) {
    if (!f) return;
    f.addEventListener('submit', (e) => e.preventDefault());
    f.addEventListener('click', (e) => { const b = e.target.closest('[data-sugg]'); if (b) { f.label.value = b.dataset.sugg; f.lei.focus(); } });
  }
  function ownValues(f) {
    const v = K.formValues(f);
    if (!v.label) { K.ui().toast('Scrie ce plătești.', 'error'); f.label.focus(); return null; }
    const lei = blank(v.lei) ? '' : numOf(v.lei);
    if (lei !== '' && !(lei > 0)) { K.ui().toast('Scrie o sumă mai mare ca zero, sau las-o goală.', 'error'); f.lei.focus(); return null; }
    const day = blank(v.day) ? '' : Math.round(numOf(v.day));
    if (day !== '' && !(day >= 1 && day <= 31)) { K.ui().toast('Ziua e de la 1 la 31, sau goală pentru fără dată.', 'error'); f.day.focus(); return null; }
    return { label: v.label, lei, day, note: v.note || '', repeat: !!v.repeat };
  }
  // Taxe la stat (salarii): per person, as calculated (api/_lib/ro-salary-tax.js), the rates of the year under it
  function taxSalHtml(r) {
    const c = r.calc, pc = (v) => String(Math.round(v * 10000) / 100).replace('.', ',') + '%';
    return '<details class="pf-more"' + (r.typed ? '' : ' open') + '><summary>' + icon('users') + 'Calculat pe ' + esc(monName(c.month)) + (r.typed ? ', pentru comparație' : '') + '<b>' + K.lei(c.total) + '</b></summary><ul class="pf-tax">' + c.people.map((x) => '<li><div class="pf-tax-h"><b>' + esc(x.name) + '</b><span>' + K.lei(x.total) + '</span></div>' +
        '<small>brut ' + K.lei(x.gross) + (x.derived ? ' (din net)' : '') + ' · CAS ' + K.num(x.cas) + ' · CASS ' + K.num(x.cass) + ' · impozit ' + K.num(x.tax) + ' · CAM ' + K.num(x.cam) + (x.untaxed ? ' · ' + x.untaxed + ' lei neimpozabili' : '') + '</small></li>').join('') +
      '<li class="is-tot"><div class="pf-tax-h"><b>Total</b><span>' + K.lei(c.total) + '</span></div></li></ul>' +
      '<p class="pf-sh-note">Reguli ' + c.rates.year + ': CAS ' + pc(c.rates.cas) + ', CASS ' + pc(c.rates.cass) + ', impozit ' + pc(c.rates.tax) + ' după deducerea personală (fără persoane în întreținere, dacă nu sunt trecute), CAM ' + pc(c.rates.cam) + ' plătit de firmă, salariul minim ' + K.lei(c.rates.minWage) + '. ' +
        'Brutul e calculat din net când nu e trecut; orele, comisionul și bonusurile intră în brut. Nu e suma finală.</p></details>';
  }
  function sheetBody(it) {
    const r = it.row;
    const payF = r && !r.done ? h5('Plătește') + '<form class="k-form pf-form" data-pf-payf>' + K.field('Suma', leiIn('lei', r.rest > 0 ? r.rest : null), 'full') +
      K.field('Data', '<input name="date" type="date" value="' + esc(K.today()) + '">', '') + K.field('Notă', '<input name="note" maxlength="200" placeholder="opțional">', '') + '</form>' : '';
    const own = r && r.group === 'own';
    return topStats(it) + sourceHtml(it) + (r && r.calc ? taxSalHtml(r) : '') + payF +
      (r && r.parts.length ? h5('Plăți făcute') + partsHtml(r) : '') +
      entriesSection(it) + amountSection(it) + daySection(it) +
      (r && r.group !== 'sal' ? '<div class="pf-sh-auto">' + K.toggle('autopay', !!r.autoPay, 'Se plătește automat') + '<span>' + (r.group === 'card' ? 'Meta ia banii de pe card pe măsură ce cheltuie.' : 'Debit direct: se trece plătită singură pe ' + (r.due ? esc(K.dateShort(r.due)) : '1 ale lunii') + ', fără bifă.') + '</span></div>' : '') +
      (own ? h5('Plata ta') + ownForm(r.own, r) + '<div class="pf-sh-btns"><button type="button" class="k-btn pf-own-del" data-act="own-del">' + icon('trash') + 'Șterge</button><button type="button" class="k-btn" data-act="own-save">Salvează</button></div>' : '');
  }
  function sheetSub(it) {
    const r = it.row;
    if (!r) return it.rec ? 'variabilă, fără zi de plată' : 'doar în profit';
    return [r.group === 'sal' ? esc(r.sub) : r.group === 'own' ? (r.own.repeat ? 'în fiecare lună' : 'doar luna asta') : '', r.due ? 'scadent ' + esc(K.dateShort(r.due)) : r.group === 'card' ? 'cu cardul, pe măsură ce se cheltuie' : 'fără dată'].filter(Boolean).join(' · ');
  }
  // the sheet grows out of its row (portal-motion.js, K.drawer({ from })) and goes back into it; a change made in it stays
  // in it (the newer sums come in), paying closes it so the row shows the payment land
  function openItem(it, from) {
    let cur = it;
    const dr = K.drawer({
      title: labelOf(it), icon: it.row && it.row.group === 'own' ? 'receipt' : it.row && it.row.group === 'sal' ? 'user' : it.row ? 'wallet' : 'sliders', width: 480, subtitle: sheetSub(it), from, focus: false,
      body: sheetBody(it), footer: footer(it),
      onMount(el) { wire(el); },
    });
    function footer(x) {
      const r = x.row;
      return '<span class="k-grow"></span><button type="button" class="k-btn" data-cancel>' + (r && !r.done ? 'Renunță' : 'Închide') + '</button>' + (r && !r.done ? '<button type="button" class="k-btn is-primary" data-ok>' + icon('check') + 'Plătește</button>' : '');
    }
    // the sheet again with the newer numbers (the same row, found by its id); gone: closed
    async function refresh(msg) {
      if (msg) toast(msg);
      await reload();
      const nx = itemById(cur.id);
      if (!nx) { dr.close(); return; }
      cur = nx;
      const sc = dr.body ? dr.body.scrollTop : 0;
      dr.set({ title: labelOf(nx), subtitle: sheetSub(nx), body: sheetBody(nx), footer: footer(nx) });
      if (dr.body) dr.body.scrollTop = sc;
    }
    async function closeThen(msg, fn) {
      dr.close();
      if (msg) toast(msg);
      await Promise.all([fn ? fn() : null, wait(reduced() ? 0 : 360)]);
      await reload();
    }
    function wire(el) {
      const x = cur, r = x.row;
      el.querySelector('[data-cancel]').addEventListener('click', () => dr.close());
      const pf = el.querySelector('[data-pf-payf]'), ok = el.querySelector('[data-ok]');
      if (pf && ok) {
        pf.addEventListener('submit', (e) => { e.preventDefault(); ok.click(); });
        ok.addEventListener('click', (e) => K.busy(e.currentTarget, async () => {
          const v = K.formValues(pf), lei = numOf(v.lei);
          if (!(lei > 0)) { K.ui().toast('Scrie suma plătită.', 'error'); pf.lei.focus(); return; }
          try {
            await post({ action: 'pay', key: r.key, lei, date: v.date, note: v.note });
            closeThen(r.rest != null && lei < r.rest - 0.005 ? 'Plătit ' + K.lei(lei, 2) + ', rămas ' + K.lei(r.rest - lei, 2) + '.' : r.label + ': plătit.');
          } catch (er) { fail(er); }
        }));
      }
      const ap = el.querySelector('.pf-sh-auto input[name="autopay"]');
      if (ap) ap.addEventListener('change', async () => {
        ap.disabled = true;
        try { await post({ action: 'autopay', key: r.key, on: ap.checked }); refresh(ap.checked ? r.label + ': se plătește automat.' : r.label + ': o bifezi tu.'); } catch (er) { ap.checked = !ap.checked; ap.disabled = false; fail(er); }
      });
      const sel = el.querySelector('select[data-act="day"]');
      if (sel) sel.addEventListener('change', async () => {
        sel.disabled = true;
        try { await post({ action: 'rec_day', line: x.cat, day: +sel.value }); refresh(+sel.value ? 'Se plătește pe ' + sel.value + ' ale lunii.' : 'Fără zi de plată.'); } catch (er) { sel.disabled = false; fail(er); }
      });
      // the sum: Mereu / Doar pe luna asta (the two fields swap, the euro converts as he types)
      const af = el.querySelector('[data-form="amt"]');
      if (af) {
        const sync = () => {
          const sc = af.scope.value;
          af.querySelectorAll('[data-scope]').forEach((b) => { b.hidden = b.dataset.scope !== sc; });
          const cv = af.querySelector('[data-conv]');
          if (cv && af.dataset.eur) {
            const e = numOf(af.all.value), rate = af.rate ? numOf(af.rate.value) : PL.C.entry.eurRate;
            cv.innerHTML = e > 0 && rate > 0 ? K.num(e) + ' € × ' + rateTxt(rate) + ' = <b>' + K.lei(Math.round(e * rate)) + '</b>. ' + esc(eurLine()) : esc(eurLine()) || 'Scrie suma în euro.';
          }
        };
        af.addEventListener('click', (e) => { if (e.target.closest('[data-k-seg] > button')) setTimeout(sync, 0); });
        af.addEventListener('input', sync);
        af.addEventListener('submit', (e) => { e.preventDefault(); el.querySelector('[data-act="amt-save"]').click(); });
        sync();
      }
      ['line', 'once', 'ent'].forEach((k) => { const f = el.querySelector('[data-form="' + k + '"]'); if (f) f.addEventListener('submit', (e) => { e.preventDefault(); const b = f.querySelector('[data-act$="save"], [data-act="ent-add"]'); if (b) b.click(); }); });
      const of = el.querySelector('[data-pf-ownf]');
      if (of) wireOwnForm(of);
      // one listener on the sheet for its whole life (a refresh draws it again: the newest handler answers)
      if (!el._pfWired) { el._pfWired = true; el.addEventListener('click', (e) => { if (el._pfAct) el._pfAct(e); }); }
      el._pfAct = async (e) => {
        const b = e.target.closest('[data-act]');
        if (!b || b.tagName === 'SELECT') return;
        const act = b.dataset.act;
        if (act === 'amt-save') return K.busy(b, async () => {
          const sc = af.scope.value;
          if (sc === 'all') {
            const raw = af.all.value, v = blank(raw) ? null : numOf(raw);
            if (v != null && !(v >= 0)) { K.ui().toast('Scrie o sumă de la zero în sus.', 'error'); return; }
            const rate = af.rate && !blank(af.rate.value) ? numOf(af.rate.value) : null;
            try {
              await saveCosts({ lines: { [x.line.key]: v }, eurRate: rate });
              if (r.changed) await post({ action: 'amount', key: r.key, lei: '' }); // the month follows the usual sum again
              refresh('Salvat în costurile lunii.');
            } catch (er) { fail(er); }
            return;
          }
          const raw = af.month.value, lei = numOf(raw);
          if (!blank(raw) && !(lei > 0)) { K.ui().toast('Scrie o sumă mai mare ca zero.', 'error'); return; }
          try { await post({ action: 'amount', key: r.key, lei: blank(raw) ? '' : lei }); refresh('Suma pe ' + monName(PL.month) + ' e salvată.'); } catch (er) { fail(er); }
        });
        if (act === 'amt-reset') return K.busy(b, async () => { try { await post({ action: 'amount', key: r.key, lei: '' }); refresh('Suma obișnuită, din nou.'); } catch (er) { fail(er); } });
        if (act === 'once-save') return K.busy(b, async () => {
          const f = el.querySelector('[data-form="once"]'), raw = f.lei.value, lei = numOf(raw);
          if (!blank(raw) && !(lei > 0)) { K.ui().toast('Scrie o sumă mai mare ca zero.', 'error'); return; }
          try { await post({ action: 'amount', key: r.key, lei: blank(raw) ? '' : lei }); refresh('Suma pe ' + monName(PL.month) + ' e salvată.'); } catch (er) { fail(er); }
        });
        if (act === 'line-save' || act === 'line-auto') return K.busy(b, async () => {
          const f = el.querySelector('[data-form="line"]'), raw = act === 'line-auto' ? '' : f.lei.value, v = blank(raw) ? null : numOf(raw);
          if (v != null && !(v >= 0)) { K.ui().toast('Scrie o sumă de la zero în sus.', 'error'); return; }
          try { await saveCosts(f.dataset.auto ? { over: { [f.dataset.key]: v } } : { lines: { [f.dataset.key]: v } }); refresh(v == null && f.dataset.auto ? 'Din nou automat.' : 'Salvat în costurile lunii.'); } catch (er) { fail(er); }
        });
        if (act === 'ent-add') return K.busy(b, async () => {
          const f = el.querySelector('[data-form="ent"]'), v = K.formValues(f), lei = numOf(v.lei);
          if (!(lei > 0)) { K.ui().toast('Scrie suma.', 'error'); f.lei.focus(); return; }
          try { await post({ action: 'rec_add', line: x.cat || 'taxes', lei, date: v.date, note: v.note, kind: x.part === 'sal' ? 'salarii' : v.kind }); refresh('Adăugat.'); } catch (er) { fail(er); }
        });
        if (act === 'edel') {
          const id = b.dataset.id;
          if (!(await K.ui().confirm({ from: b, title: 'Ștergi suma?', message: id === 'legacy' ? 'E suma scrisă înainte în costurile lunii; se scoate de acolo.' : 'Se scade din costurile lunii.', confirmText: 'Șterge', danger: true }))) return;
          return K.busy(b, async () => { try { await post({ action: 'rec_del', line: x.cat || 'taxes', id }); refresh('Șters.'); } catch (er) { fail(er); } });
        }
        if (act === 'pdel') {
          const p = r.parts.find((q) => q.id === b.dataset.id);
          if (!p || !(await K.ui().confirm({ from: b, title: 'Ștergi plata de ' + K.lei(p.lei, 2) + '?', message: r.label + ': suma revine la „rămas”.', confirmText: 'Șterge', danger: true }))) return;
          return K.busy(b, async () => { try { await post({ action: 'part_del', key: r.key, id: p.id }); refresh('Plata e ștearsă.'); } catch (er) { fail(er); } });
        }
        if (act === 'note') {
          const lp = lastPart(r);
          const v = await K.ui().prompt({ from: b, title: 'Notă la plată', label: 'Notă (opțional)', value: (lp && lp.note) || '', confirmText: 'Salvează' });
          if (v == null) return;
          try { await post({ action: 'note', key: r.key, note: v }); refresh(); } catch (er) { fail(er); }
          return;
        }
        if (act === 'own-save') return K.busy(b, async () => {
          const v = ownValues(of);
          if (!v) return;
          try { await post(Object.assign({ action: 'own_edit', key: r.key }, v)); refresh('Salvat.'); } catch (er) { fail(er); }
        });
        if (act === 'own-del') {
          let scope = 'all';
          if (r.own.repeat) {
            scope = await K.ui().prompt({ from: b, title: 'Ștergi ' + r.label + '?', label: 'De unde', options: [['month', 'Doar din ' + monName(PL.month)], ['all', 'Din ' + monName(PL.month) + ' înainte, în toate lunile']], value: 'month', confirmText: 'Șterge' });
            if (scope == null) return;
          } else if (!(await K.ui().confirm({ from: b, title: 'Ștergi ' + r.label + '?', message: r.parts.length ? 'Se șterg și plățile notate la ea.' : 'Iese din lista lunii.', confirmText: 'Șterge', danger: true }))) return;
          return K.busy(b, async () => { try { await post({ action: 'own_del', key: r.key, scope }); closeThen('Șters.'); } catch (er) { fail(er); } });
        }
      };
    }
  }

  // ------------------------------------------------------------------ the small sheets: a variable entry, his own payment, the costs by category
  function openAddEntry(cat, from) {
    const d = PL.P, t = K.today(), date = t.slice(0, 7) === d.month ? t : d.month + '-01';
    const cats = d.rec.map((x) => [x.key, x.key === 'other' ? 'Alte' : x.label]);
    const dr = K.drawer({
      title: cat ? (d.rec.find((x) => x.key === cat) || {}).label || 'Adaugă' : 'Cheltuială variabilă', icon: 'receipt', width: 460, subtitle: esc(K.monthLabel(d.month)), from,
      body: '<form class="k-form pf-form" data-pf-form>' + K.field('Suma', leiIn('lei', null, '0'), 'full') +
        (cat ? '<input type="hidden" name="line" value="' + esc(cat) + '">' : K.field('Pe ce', K.seg('line', cats, 'utilities', 'is-big pf-cats'), 'full')) +
        '<div data-kinds' + (cat === 'taxes' ? '' : ' hidden') + '>' + K.field('Ce fel', K.seg('kind', [['tva', 'TVA'], ['salarii', 'Din salarii'], ['alte', 'Alte taxe']], 'tva', 'is-big'), 'full', '„Din salarii” (contribuții și impozit) e deja în Salarii brute, nu se scade încă o dată din profit.') + '</div>' +
        K.field('Data', '<input name="date" type="date" value="' + esc(date) + '" min="' + esc(d.month + '-01') + '" max="' + esc(d.month + '-' + K.pad(K.daysIn(d.month))) + '">', 'full') +
        K.field('Notă', '<input name="note" maxlength="200" placeholder="ex. factura de curent">', 'full') + '</form>',
      footer: '<span class="k-grow"></span><button type="button" class="k-btn" data-cancel>Renunță</button><button type="button" class="k-btn is-primary" data-ok>' + icon('check') + 'Adaugă</button>',
      onMount(el) {
        const f = el.querySelector('[data-pf-form]');
        const kinds = el.querySelector('[data-kinds]');
        f.addEventListener('click', (e) => { if (e.target.closest('[data-k-seg="line"] > button')) setTimeout(() => { kinds.hidden = f.line.value !== 'taxes'; }, 0); });
        el.querySelector('[data-cancel]').addEventListener('click', () => dr.close());
        f.addEventListener('submit', (e) => { e.preventDefault(); el.querySelector('[data-ok]').click(); });
        el.querySelector('[data-ok]').addEventListener('click', (e) => K.busy(e.currentTarget, async () => {
          const v = K.formValues(f), lei = numOf(v.lei);
          if (!(lei > 0)) { K.ui().toast('Scrie suma.', 'error'); f.lei.focus(); return; }
          try {
            await post({ action: 'rec_add', line: v.line, lei, date: v.date, note: v.note, kind: v.line === 'taxes' ? v.kind : '' });
            const id = v.line === 'taxes' && v.kind === 'salarii' ? 'taxsal' : REC_IDS[v.line];
            dr.close(); toast('Adăugat.');
            await wait(reduced() ? 0 : 340); PL.flashKey = id; reload();
          } catch (er) { fail(er); }
        }));
      },
    });
  }
  function openOwnAdd(from) {
    const d = PL.P;
    const dr = K.drawer({
      title: 'Plată nouă', icon: 'receipt', width: 460, subtitle: esc(K.monthLabel(d.month)), from, body: ownForm(null, null),
      footer: '<span class="k-grow"></span><button type="button" class="k-btn" data-cancel>Renunță</button><button type="button" class="k-btn is-primary" data-ok>' + icon('plus') + 'Adaugă</button>',
      onMount(el) {
        const f = el.querySelector('[data-pf-ownf]');
        wireOwnForm(f);
        el.querySelector('[data-cancel]').addEventListener('click', () => dr.close());
        el.querySelector('[data-ok]').addEventListener('click', (e) => K.busy(e.currentTarget, async () => {
          const v = ownValues(f);
          if (!v) return;
          try {
            const out = await post(Object.assign({ action: 'own_add' }, v));
            dr.close(); toast(v.repeat ? 'Adăugată, în fiecare lună.' : 'Adăugată.');
            await wait(reduced() ? 0 : 340); if (out && out.key) PL.flashKey = out.key; reload();
          } catch (er) { fail(er); }
        }));
      },
    });
  }
  // Unde se duc banii: every cost of the month by category, the 6 biggest and the rest together, each with its own colour
  // (the colour follows the category, never its rank), last month's total, and every line of the month's costs
  const CAT_COLOR = { sal: 1, rent: 2, credit: 3, laser: 4, tax: 5, ads: 6, cons: 7, util: 8 };
  function whereHtml(w) {
    if (!w) return '';
    const list = (w.cats || []).filter((c) => c.lei > 0).sort((a, b) => b.lei - a.lei);
    const top = list.filter((c) => CAT_COLOR[c.key]).slice(0, 6);
    const rest = list.filter((c) => !top.includes(c));
    const restLei = rest.reduce((a, c) => a + c.lei, 0);
    const parts = top.map((c) => ({ label: c.label, lei: c.lei, color: 'var(--pf-c' + CAT_COLOR[c.key] + ')' }));
    if (restLei > 0) parts.push({ label: 'Altele', lei: restLei, color: 'var(--pf-c0)', sub: rest.map((c) => (c.key === 'other' ? (c.parts || []).join(', ') : c.label)).filter(Boolean).join(', ') });
    const total = parts.reduce((a, x) => a + x.lei, 0);
    let cmp = '';
    if (w.prev && w.prev.total > 0) {
      const dlt = total - w.prev.total, up = dlt > 0;
      cmp = '<p class="pf-cmp ' + (up ? 'is-up' : 'is-down') + '">' + (up ? '↑ ' : '↓ ') + K.lei(Math.abs(dlt)) + (up ? ' mai mult' : ' mai puțin') + ' decât în ' + esc(monName(w.prev.month)) + ' (' + K.lei(w.prev.total) + ')' + (w.upToday ? ', luna asta până azi' : '') + '</p>';
    }
    // whole percents that add up to 100 (largest remainder)
    const raw = parts.map((x) => (total > 0 ? (x.lei / total) * 100 : 0)), pcs = raw.map(Math.floor);
    let left = total > 0 ? 100 - pcs.reduce((a, v) => a + v, 0) : 0;
    raw.map((v, i) => [v - Math.floor(v), i]).sort((a, b) => b[0] - a[0]).forEach(([, i]) => { if (left > 0) { pcs[i]++; left--; } });
    const legend = parts.map((x, i) => '<li><i style="--c:' + x.color + '" aria-hidden="true"></i><span>' + esc(x.label) + (x.sub ? '<small>' + esc(x.sub) + '</small>' : '') + '</span><b>' + K.lei(x.lei) + '</b><em>' + pcs[i] + '%</em></li>').join('');
    return '<div class="pf-where">' + cmp + (total > 0 ? '<div class="pf-where-body">' + donut(parts, 136, '<b>' + K.lei(total) + '</b><small>' + (w.upToday ? 'până azi' : 'toată luna') + '</small>', 'Costurile lunii: ' + parts.map((x) => x.label + ' ' + K.lei(x.lei)).join(', ')) +
      '<ul class="pf-leg is-cats">' + legend + '</ul></div>' : '<p class="pf-foot">Nicio cheltuială încă luna asta.</p>') + '</div>';
  }
  function openCosts(from) {
    const C = PL.C;
    if (!C) return;
    const share = C.collections > 0 ? Math.round((C.costs.total / C.collections) * 100) : null;
    const lines = C.costs.rows.map((l) => '<li><span>' + esc(l.label.replace(/ \(.*\)$/, '')) + '<small>' + (l.lei == null ? 'lipsește' : l.auto ? (l.source === 'manual' ? 'scrisă de tine' : 'automat, din ' + esc(l.auto)) : l.rec ? 'din sumele lunii' : l.eur != null ? K.num(l.eur) + ' €' : 'scrisă de tine') + '</small></span><b' + (l.lei == null ? ' class="is-miss"' : '') + '>' + (l.lei == null ? '-' : K.lei(l.lei)) + '</b></li>').join('');
    const canEdit = !isFuture();
    const dr = K.drawer({
      title: 'Costurile lunii', icon: 'sliders', width: 520, subtitle: esc(K.monthLabel(PL.month)) + (C.entry.savedAt ? ' · salvată ' + esc(roDay(C.entry.savedAt)) : ' · nesalvată'), from, focus: false,
      body: (PL.P && PL.P.where ? whereHtml(PL.P.where) : '') +
        (share != null ? '<div class="co-share"><div class="co-share-bar' + (share > 100 ? ' is-over' : '') + '"><i style="width:' + Math.min(100, share) + '%"></i></div><small>' + (share > 100 ? 'Costurile sunt mai mari decât încasările.' : 'Din fiecare 100 lei încasați, <b>' + share + '</b> se duc pe costuri și <b>' + (100 - share) + '</b> rămân profit.') + '</small></div>' : '') +
        h5('Toate liniile') + '<ul class="pf-clines">' + lines + '<li class="is-tot"><span>Total</span><b>' + K.lei(C.costs.total) + '</b></li></ul>' +
        (eurLine() ? note(esc(eurLine()), 'refresh') : '') +
        (canEdit ? '<div class="pf-sh-btns">' + (C.prev ? '<button type="button" class="k-btn pf-link" data-act="copy">' + icon('copy') + 'Copiază din ' + esc(monName(C.prev.month)) + '</button>' : '') + '<button type="button" class="k-btn" data-act="save">' + icon('check') + 'Salvează luna</button></div>' : ''),
      footer: '<span class="k-grow"></span><button type="button" class="k-btn" data-cancel>Închide</button>',
      onMount(el) {
        el.querySelector('[data-cancel]').addEventListener('click', () => dr.close());
        el.addEventListener('click', (e) => {
          const b = e.target.closest('[data-act]');
          if (b && b.dataset.act === 'save') K.busy(b, async () => { try { await saveCosts({}); dr.close(); toast('Costurile lunii au fost salvate.'); reload(); } catch (er) { fail(er); } });
          if (b && b.dataset.act === 'copy') copyCosts(b).then((ok) => { if (ok) dr.close(); });
        });
      },
    });
  }
  // the fixed lines of last month into this one (what Costuri lunare's „Copiază din” did), saved at once
  async function copyCosts(from) {
    const C = PL.C, p = C && C.prev;
    if (!p) return false;
    const lines = {};
    C.lines.filter((l) => l.kind === 'fixed').forEach((l) => { if (p.lines[l.key] != null) lines[l.key] = p.lines[l.key]; });
    const names = C.lines.filter((l) => lines[l.key] != null).map((l) => l.label);
    if (!names.length) { toast('Nimic de copiat din ' + monName(p.month) + '.', 'info'); return false; }
    if (!(await K.ui().confirm({ from, title: 'Copiezi din ' + monName(p.month) + '?', message: names.join(', ') + ': sumele din ' + monName(p.month) + ' intră pe ' + monName(PL.month) + '.', confirmText: 'Copiază' }))) return false;
    try { await saveCosts({ lines, eurRate: C.entry.eurFrom && C.entry.eurFrom.source === 'bnr' ? null : p.eurRate }); toast('Copiat din ' + K.monthLabel(p.month) + '.'); reload(); return true; } catch (er) { fail(er); return false; }
  }

  // ------------------------------------------------------------------ the tick: paid at once on the screen, then saved
  async function tickPay(it, tick, row) {
    const r = it.row;
    tick.classList.add('is-on', 'is-pop'); tick.setAttribute('aria-pressed', 'true');
    const bar = row.querySelector('[data-pf-p]');
    if (bar) { bar.style.transform = 'scaleX(1)'; PL.prog[bar.dataset.pfP] = 1; }
    try {
      await Promise.all([post({ action: 'pay', key: r.key }), wait(reduced() ? 0 : 480)]);
      toast(r.label + ': plătit' + (r.partial ? ' tot, ' + K.lei(r.rest) + ' acum' : '') + '.');
      // a row the filter no longer shows folds away before the list changes
      if (!reduced() && (PL.filter === 'open' || PL.filter === 'late')) {
        const h = row.offsetHeight;
        await row.animate([{ opacity: 1, height: h + 'px' }, { opacity: 0, height: '0px', paddingTop: '0px', paddingBottom: '0px' }], { duration: 260, easing: 'ease-in', fill: 'forwards' }).finished.catch(() => {});
      } else if (!reduced() && r.partial) {
        const pl = row.querySelector('.pf-prog-line');
        if (pl) await pl.animate([{ opacity: 1, maxHeight: pl.offsetHeight + 'px' }, { opacity: 0, maxHeight: '0px', marginTop: '0px' }], { duration: 220, easing: 'ease-in', fill: 'forwards' }).finished.catch(() => {});
      }
    } catch (err) { fail(err); }
    reload();
  }

  // ------------------------------------------------------------------ taps
  document.addEventListener('keydown', (e) => {
    if ((e.key !== 'Enter' && e.key !== ' ') || !PL.box || !PL.box.contains(e.target) || !e.target.matches('.pf-main[data-pf-open]')) return;
    e.preventDefault(); e.target.click();
  });
  document.addEventListener('click', async (e) => {
    if (!PL.box || !PL.box.contains(e.target)) return;
    const mv = e.target.closest('[data-pf-m]');
    if (mv) { PL.month = K.addMonths(PL.month, +mv.dataset.pfM); return load(); }
    const fl = e.target.closest('[data-pf-filter]');
    if (fl) return setFilter(fl.dataset.pfFilter);
    if (e.target.closest('[data-pf-costs]')) return openCosts(e.target.closest('[data-pf-costs]'));
    const jump = e.target.closest('[data-pf-jump]');
    if (jump) {
      const id = jump.dataset.pfJump, m = jump.dataset.month;
      if (PL.filter !== 'all' && PL.filter !== 'open') await setFilter('all');
      if (m && m !== PL.month) { PL.month = m; PL.flashKey = id; load(); } else flash(id);
      return;
    }
    const sv = e.target.closest('[data-pf-save-month]');
    if (sv) return K.busy(sv, async () => { try { await saveCosts({}); toast('Costurile lunii au fost salvate.'); reload(); } catch (er) { fail(er); } });
    const cc = e.target.closest('[data-pf-copy-costs]');
    if (cc) return K.busy(cc, () => copyCosts(cc));
    const pr = e.target.closest('[data-pf-prop-go]');
    if (pr) return K.busy(pr, async () => {
      try {
        await K.api('/api/portal-salariu', { action: 'proposal_decide', month: PL.month, decision: pr.dataset.pfPropGo });
        if (K.mgReset) K.mgReset();
        toast(pr.dataset.pfPropGo === 'accept' ? 'Preluat în costurile lunii.' : 'Propunerea nu a fost preluată.');
        const card = pr.closest('[data-pf-prop]');
        if (card && !reduced()) await card.animate([{ opacity: 1, transform: 'none' }, { opacity: 0, transform: 'scale(.98)' }], { duration: 200, easing: 'ease-in', fill: 'forwards' }).finished.catch(() => {});
        reload();
      } catch (er) { fail(er); }
    });
    const ad = e.target.closest('[data-pf-add-entry]');
    if (ad) return openAddEntry(null, ad);
    const oa = e.target.closest('[data-pf-own-add]');
    if (oa) return openOwnAdd(oa);
    const cp = e.target.closest('[data-pf-copy]');
    if (cp) return K.busy(cp, async () => { try { const r = await post({ action: 'own_copy' }); toast(r.copied ? 'Am copiat ' + K.plural(r.copied, 'plată', 'plăți') + ' din luna trecută.' : 'Nimic nou de copiat.'); reload(); } catch (er) { fail(er); } });
    const row = e.target.closest('.pf-row');
    if (!row) return;
    const it = itemById(row.dataset.key);
    if (!it) return;
    const plus = e.target.closest('[data-pf-plus]');
    if (plus) return openAddEntry(it.cat, plus);
    const tick = e.target.closest('[data-pf-tick]');
    if (!tick) { if (e.target.closest('[data-pf-open]')) openItem(it, row); return; }
    const r = it.row;
    if (r.autoPay) return openItem(it, row); // paid by itself: the sheet, where it can be turned off
    if (r.done) {
      if (!(await K.ui().confirm({ from: tick, title: 'Scoți plata?', message: r.parts.length > 1 ? 'Se șterg toate cele ' + r.parts.length + ' plăți; ' + r.label + ' rămâne de plătit.' : r.label + ' rămâne de plătit.', confirmText: 'Scoate' }))) return;
      tick.classList.remove('is-on', 'is-pop'); tick.setAttribute('aria-pressed', 'false');
      try { await post({ action: 'unpay', key: r.key }); } catch (err) { fail(err); }
      return reload();
    }
    // nothing known to pay (no sum yet): the sheet asks for the sum
    if (!(r.rest > 0)) return openItem(it, row);
    tickPay(it, tick, row);
  });

  // a link from a notice or another page: #cheltuieli/<what>@<YYYY-MM>, what = late | open | propunere | a row's key
  K.on('cheltuieli:sub', (arg) => {
    const [what, m] = String(arg || '').split('@');
    const month = /^\d{4}-\d{2}$/.test(m || '') ? m : PL.month;
    if (what === 'late' || what === 'open') { PL.filter = what; try { localStorage.setItem('c360-pl-filter', what); } catch (e) { /* private mode */ } }
    else if (what === 'propunere') PL.want = 'prop';
    else if (what) { PL.flashKey = idOfRow(what); if (PL.filter !== 'all') PL.filter = 'all'; }
    if (month !== PL.month) { PL.month = month; load(); } else if (!PL.busy && PL.box) paint({}); // a reading on its way paints it
  });

  // its own entry in the menu (the owner, 16.11: „rubrică separată cu cheltuieli în meniu”), one page since 16.11
  K.mountCosts = (box) => { PL.box = box; PL.animKey = ''; load(); };
  if (K.section) K.section('cheltuieli', {
    mount(p) {
      p.classList.add('k-panel', 'lg');
      p.innerHTML = '<div class="k-head"><div><div class="k-eyebrow">Bani</div><h2>Cheltuieli</h2></div></div><div data-costs></div>';
    },
    show() { const b = document.querySelector('#panel-cheltuieli [data-costs]'); if (b) K.mountCosts(b); },
  });
})();
