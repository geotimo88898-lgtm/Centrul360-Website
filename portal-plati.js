// Centrul360 portal, the owner's Plăți și cheltuieli (Echipa → Costuri și plăți, api/portal-plati.js):
//   Plăți        the month's payments by day: the tick pays what is left, a tap on a row opens its sheet (a part paid,
//                this month's sum, his own rows); the filter chips and the next payment on top
//   Cheltuieli   the variable expenses kept as records (several a month, summed), and what is read by itself
//   Costuri      Costuri lunare (portal-money.js), the month's lines and the profit
// The days and the sums come from the server, only for the owner: nothing of it is in this file.
(function () {
  'use strict';
  const K = window.K;
  if (!K) return;
  const { esc, icon } = K;
  const PL = { sub: 'plati', month: K.thisMonth(), data: null, box: null, seq: 0 };
  try { const s = localStorage.getItem('c360-pl-sub'); if (['plati', 'chelt', 'costuri'].includes(s)) PL.sub = s; } catch (e) { /* private mode */ }
  const costsMount = K.mountCosts; // portal-money.js: Costuri lunare
  const roDay = (iso) => { const t = Date.parse(iso); return Number.isFinite(t) ? K.dateShort(new Date(t).toLocaleDateString('sv-SE', { timeZone: 'Europe/Bucharest' })) : ''; };
  const roTime = (iso) => { const t = Date.parse(iso); return Number.isFinite(t) ? new Date(t).toLocaleTimeString('ro-RO', { timeZone: 'Europe/Bucharest', hour: '2-digit', minute: '2-digit' }) : ''; };
  const readAt = (iso) => { if (!iso) return ''; const d = new Date(Date.parse(iso)).toLocaleDateString('sv-SE', { timeZone: 'Europe/Bucharest' }); return d === K.today() ? 'azi la ' + roTime(iso) : roDay(iso) + ', ' + roTime(iso); };

  K.mountCosts = (box) => {
    PL.box = box;
    box.innerHTML = '<div class="pf-subnav">' + K.seg('plsub', [['plati', 'Plăți', 'checkCircle'], ['chelt', 'Variabile', 'receipt'], ['costuri', 'Costuri lunare', 'sliders']], PL.sub) + '</div><div data-pf-pane></div>';
    showSub();
  };
  function showSub() {
    const pane = PL.box && PL.box.querySelector('[data-pf-pane]');
    if (!pane) return;
    try { localStorage.setItem('c360-pl-sub', PL.sub); } catch (e) { /* private mode */ }
    pane.classList.add('pf-narrow'); // the three views the same width (16.11): the payments and the records read best not too wide
    if (PL.sub === 'costuri') {
      // Costuri lunare goes up to this month; it keeps the month the owner looks at here
      const m = PL.month > K.thisMonth() ? K.thisMonth() : PL.month;
      if (K.setCostsMonth) K.setCostsMonth(m);
      pane.innerHTML = '<div data-pf-costs></div>';
      if (costsMount) costsMount(pane.firstChild);
      return;
    }
    pane.innerHTML = '<div class="k-skel" style="height:420px"></div>';
    load();
  }
  async function load() {
    const n = ++PL.seq, month = PL.month;
    try {
      const d = await K.api('/api/portal-plati?month=' + encodeURIComponent(month));
      if (n !== PL.seq) return;
      PL.data = d; PL.month = d.month;
      paint();
    } catch (err) {
      const pane = PL.box && PL.box.querySelector('[data-pf-pane]');
      if (pane && n === PL.seq) pane.innerHTML = K.empty('alert', 'Nu am putut încărca plățile', K.errText(err));
    }
  }
  function paint() {
    const pane = PL.box && PL.box.querySelector('[data-pf-pane]');
    if (!pane || !PL.data) return;
    pane.innerHTML = monthNav() + (PL.sub === 'chelt' ? cheltHtml() : platiHtml());
    const ak = PL.month + PL.sub; // drawn from nothing when a month or a view opens, not after every tick
    if (PL.animKey !== ak) { PL.animKey = ak; animateDonuts(pane); }
    if (PL.flashKey && PL.sub === 'plati') { const k = PL.flashKey; PL.flashKey = ''; requestAnimationFrame(() => flash(k)); }
    // the slim line shows once the circle is out of view
    if (PL.io) PL.io.disconnect();
    const ov = pane.querySelector('[data-pf-ov]'), mini = pane.querySelector('[data-pf-mini]');
    if (ov && mini && 'IntersectionObserver' in window) {
      PL.io = new IntersectionObserver(([e]) => mini.classList.toggle('is-on', !e.isIntersecting && e.boundingClientRect.top < 0), { threshold: 0 });
      PL.io.observe(ov);
    }
  }
  function monthNav() {
    const d = PL.data;
    return '<div class="pf-top"><div class="k-month"><button type="button" class="k-icon-btn" data-pf-m="-1" aria-label="Luna anterioară"' + (d.month <= d.first ? ' disabled' : '') + '>' + icon('left') + '</button><b>' + esc(K.monthLabel(d.month)) + '</b>' +
      '<button type="button" class="k-icon-btn" data-pf-m="1" aria-label="Luna următoare"' + (d.month >= d.last ? ' disabled' : '') + '>' + icon('right') + '</button></div>' +
      '<span class="pf-private">' + icon('shield') + 'Doar tu vezi</span></div>';
  }

  // ------------------------------------------------------------------ the donut (SVG, no library)
  // segs: [{ lei, color, label }]; a 2px surface gap between the parts; drawn from 0 when it appears (not with reduced
  // motion); each part says its name and sum on hover (title)
  const reduced = () => (window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches) || document.documentElement.classList.contains('c360-reduce');
  function donut(segs, size, center, aria) {
    const sw = Math.max(10, Math.round(size * 0.13)), r = (size - sw) / 2, C = 2 * Math.PI * r;
    const total = segs.reduce((a, x) => a + Math.max(0, x.lei), 0);
    const live = segs.filter((x) => x.lei > 0);
    const gap = live.length > 1 ? 2.5 : 0;
    let at = 0;
    const arcs = total > 0 ? live.map((x) => {
      const len = (x.lei / total) * C, show = Math.max(0.5, len - gap);
      const el = '<circle cx="' + size / 2 + '" cy="' + size / 2 + '" r="' + r + '" fill="none" stroke="' + x.color + '" stroke-width="' + sw + '" stroke-linecap="butt"' +
        ' stroke-dasharray="' + show.toFixed(2) + ' ' + (C - show).toFixed(2) + '" stroke-dashoffset="' + (-at).toFixed(2) + '" data-len="' + show.toFixed(2) + '"><title>' + esc(x.label) + ': ' + K.lei(x.lei) + '</title></circle>';
      at += len;
      return el;
    }).join('') : '';
    return '<div class="pf-donut" style="--s:' + size + 'px" role="img" aria-label="' + esc(aria) + '"><svg viewBox="0 0 ' + size + ' ' + size + '" width="' + size + '" height="' + size + '" aria-hidden="true">' +
      '<circle cx="' + size / 2 + '" cy="' + size / 2 + '" r="' + r + '" fill="none" stroke="var(--pf-track)" stroke-width="' + sw + '"/>' + arcs + '</svg>' +
      '<div class="pf-dc">' + center + '</div></div>';
  }
  // the parts grow from nothing, once, when the donut is painted
  function animateDonuts(root) {
    if (reduced()) return;
    root.querySelectorAll('.pf-donut circle[data-len]').forEach((c) => {
      const len = +c.dataset.len, C = len + Number(String(c.getAttribute('stroke-dasharray')).split(' ')[1]);
      c.style.transition = 'none'; c.setAttribute('stroke-dasharray', '0 ' + C);
      requestAnimationFrame(() => requestAnimationFrame(() => { c.style.transition = 'stroke-dasharray .9s cubic-bezier(.2,.8,.2,1)'; c.setAttribute('stroke-dasharray', len + ' ' + (C - len)); }));
    });
  }
  const pct = (a, b) => (b > 0 ? Math.round((a / b) * 100) : 0);

  // ------------------------------------------------------------------ Plăți
  // A row can be paid in parts (the owner, 16.11): the tick pays what is left in one go, a tap on the row opens its sheet
  // (pay a part, this month's sum, his own rows changed or removed). The filter chips and „Următoarea” on top.
  const MON_S = K.MON_S;
  const FILTERS = [['all', 'Toate'], ['open', 'De plătit'], ['late', 'Întârziate'], ['paid', 'Plătite']];
  try { const f = localStorage.getItem('c360-pl-filter'); if (FILTERS.some(([k]) => k === f)) PL.filter = f; } catch (e) { /* private mode */ }
  if (!PL.filter) PL.filter = 'all';
  const dShort = (day) => (day ? +day.slice(8, 10) + ' ' + MON_S[+day.slice(5, 7) - 1] : '');
  const dayBadge = (r) => {
    if (!r.due) return '<span class="pf-day is-none" aria-hidden="true">' + icon('calendar') + '</span>';
    const d = +r.due.slice(8, 10), m = MON_S[+r.due.slice(5, 7) - 1];
    return '<span class="pf-day"><b>' + d + '</b><small>' + m + '</small></span>';
  };
  const lastPart = (r) => (r.parts && r.parts.length ? r.parts[r.parts.length - 1] : null);
  const autoPart = (r) => (r.parts || []).find((p) => p.auto);
  function stateText(r) {
    if (r.done && autoPart(r) && r.parts.length === 1) return r.group === 'card' ? 'Plătit automat cu cardul' + (r.upToday ? ', până azi' : '') : 'Plătit automat pe ' + dShort(autoPart(r).date);
    if (!r.done && r.autoPay) return r.lei == null ? 'Automat, fără sumă' : r.due ? 'Se plătește automat pe ' + dShort(r.due) : 'Se plătește automat';
    if (r.done) { const p = lastPart(r); return 'Plătit ' + (p && p.date ? dShort(p.date) : roDay(r.paid && r.paid.at)) + (p && p.byName ? ' · ' + esc(p.byName) : '') + (r.parts.length > 1 ? ' · ' + r.parts.length + ' părți' : ''); }
    if (r.state === 'late') return r.due ? (r.left === -1 ? 'Întârziată, era ieri' : 'Întârziată ' + K.plural(-r.left, 'zi', 'zile')) : 'Neplătită';
    if (r.state === 'today') return 'Azi';
    if (r.state === 'soon') return r.left === 1 ? 'Mâine' : 'În ' + r.left + ' zile';
    if (r.state === 'nodate') return 'Fără dată';
    return 'Pe ' + K.dateShort(r.due);
  }
  function detail(r) {
    if (r.group === 'sal') {
      const ex = (r.extras || []).map((x) => K.lei(x.lei) + ' ' + x.label).join(' + ');
      return esc(r.sub) + (ex ? ' · ' + K.lei(r.base) + ' + ' + esc(ex) : '');
    }
    if (r.eur != null && r.lei != null && !r.changed) return K.num(r.eur) + ' € la cursul de azi';
    if (r.from && !r.changed) return 'suma din ' + esc(K.MON[+r.from.slice(5, 7) - 1]);
    if (r.group === 'card') return 'din ' + esc(r.src) + (r.at ? ', ' + esc(readAt(r.at)) : '');
    if (r.key === 'taxsal') return r.typed ? 'suma de la contabilă, din Variabile' : 'calculat din salarii, ' + K.plural((r.calc && r.calc.people.length) || 0, 'persoană', 'persoane');
    if (r.key === 'taxes') return r.entries ? K.plural(r.entries, 'sumă', 'sume') + ' în Variabile' : 'TVA și alte taxe';
    if (r.group === 'rec') return K.plural(r.entries || 0, 'sumă', 'sume') + ' în Variabile';
    if (r.group === 'own') return esc(r.own.note || '');
    return '';
  }
  const kindOf = (r) => (r.group === 'sal' ? 'Salariu' : r.autoPay ? 'Automat' : r.group === 'own' && r.own.repeat ? 'Lunar' : '');
  function amountHtml(r) {
    if (r.lei != null) return '<span class="pf-amt">' + (r.key === 'taxsal' && !r.typed && !r.changed ? '<s class="pf-approx" title="Calculat">≈</s>' : '') + (r.changed && r.orig != null ? '<s class="pf-orig" title="Suma obișnuită">' + K.lei(r.orig) + '</s>' : '') + K.lei(r.lei) + '</span>';
    if (r.done) return '<span class="pf-amt">' + K.lei(r.paidLei) + '</span>';
    if (r.key === 'taxes') return '<button type="button" class="pf-amt is-btn" data-pf-tax>' + icon('plus') + 'Sumă</button>';
    if (r.group === 'own') return '<button type="button" class="pf-amt is-btn" data-pf-open>' + icon('plus') + 'Sumă</button>';
    return '<button type="button" class="pf-amt is-btn" data-pf-go="costuri">de completat</button>';
  }
  const partsHtml = (r, inSheet) => '<ul class="pf-parts">' + r.parts.map((p) => '<li><span class="pf-pd">' + esc(dShort(p.date)) + '</span><span class="pf-pn">' +
      esc([p.byName, p.note].filter(Boolean).join(' · ')) + '</span><b>' + K.lei(p.lei, 2) + '</b>' +
      (p.auto ? '<span class="pf-pauto" title="Se plătește automat">' + icon('zap') + '</span>' : '<button type="button" class="pf-pdel" data-pf-pdel="' + esc(p.id) + '"' + (inSheet ? ' data-in-sheet' : '') + ' aria-label="Șterge plata de ' + esc(K.lei(p.lei, 2)) + '">' + icon('x') + '</button>') + '</li>').join('') + '</ul>';
  const progHtml = (r) => {
    const w = r.lei > 0 ? Math.min(100, Math.round((r.paidLei / r.lei) * 100)) : 0;
    return '<div class="pf-prog-line"><span>plătit <b>' + K.lei(r.paidLei) + '</b> din ' + K.lei(r.lei) + ', rămas <b class="pf-rest">' + K.lei(r.rest) + '</b></span><i class="pf-prog" aria-hidden="true"><i style="width:' + w + '%"></i></i></div>';
  };
  function rowHtml(r) {
    const dt = detail(r), kind = kindOf(r);
    const one = r.done && r.parts.length === 1 && !r.parts[0].auto;
    return '<li class="pf-row is-' + r.state + (r.partial ? ' is-partial' : '') + '" data-key="' + esc(r.key) + '">' + dayBadge(r) +
      '<div class="pf-main" data-pf-open role="button" tabindex="0" aria-label="' + esc(r.label) + ': detalii și plată">' +
        '<div class="pf-line"><b class="pf-name">' + (kind ? '<span class="pf-kind">' + kind + '</span>' : '') + esc(r.label) + '</b>' + amountHtml(r) + '</div>' +
        '<div class="pf-sub"><span class="pf-st">' + stateText(r) + '</span>' + (dt ? '<span class="pf-dt">' + dt + '</span>' : '') +
          (one ? '<button type="button" class="pf-note" data-pf-note>' + (r.paid.note ? '„' + esc(r.paid.note) + '”' : icon('pen') + 'notă') + '</button>' : '') + '</div>' +
        (r.partial ? progHtml(r) : '') + (r.parts.length > 1 || r.partial ? partsHtml(r) : '') + '</div>' +
      '<button type="button" class="pf-tick' + (r.done ? ' is-on' : '') + '" data-pf-tick aria-pressed="' + (r.done ? 'true' : 'false') + '" aria-label="' +
        (r.done ? 'Plătit. Atinge ca să anulezi' : r.rest > 0 ? 'Plătește tot ce a rămas, ' + esc(K.lei(r.rest)) : 'Plătește') + '">' + icon('check') + '<span>' + (r.done ? 'Plătit' : 'Bifează') + '</span></button></li>';
  }
  function nextHtml(n) {
    if (!n) return '';
    const when = n.left === 0 ? 'azi' : n.left === 1 ? 'mâine' : n.left > 1 && n.left <= 7 ? 'în ' + n.left + ' zile' : '';
    return '<button type="button" class="pf-next" data-pf-jump="' + esc(n.key) + '" data-month="' + esc(n.month) + '"><span class="pf-next-k">Următoarea</span>' +
      '<span class="pf-next-v"><b>' + esc(n.label) + '</b><span>' + esc(dShort(n.due)) + (when ? ', ' + when : '') + '</span>' + (n.lei != null ? '<b class="pf-next-l">' + K.lei(n.lei) + '</b>' : '') + '</span>' +
      (n.more ? '<small>și încă ' + K.plural(n.more, 'plată', 'plăți') + ' în aceeași zi' + (n.moreLei > 0 ? ', ' + K.lei(n.moreLei) : '') + '</small>' : '') + icon('right') + '</button>';
  }
  function platiHtml() {
    const d = PL.data, s = d.summary;
    const lateN = s.late, openLei = Math.max(0, s.toPay - s.lateLei), all = s.planned != null ? s.planned : s.paid + s.toPay;
    const p = pct(s.paid, all);
    const leg = (cls, label, lei, sub) => '<li class="' + cls + '"><i aria-hidden="true"></i><span>' + label + (sub ? '<small>' + sub + '</small>' : '') + '</span><b>' + K.lei(lei) + '</b></li>';
    const nOpen = d.rows.filter((r) => !r.done && r.state !== 'late').length;
    const overview = all > 0 || s.count ? '<section class="pf-ov" data-pf-ov>' +
        '<p class="pf-ov-tot"><b>' + K.lei(s.paid) + '</b> plătit din <b>' + K.lei(all) + '</b> pe ' + esc(K.MON[+d.month.slice(5, 7) - 1]) + '</p>' +
        donut([{ lei: s.paid, color: 'var(--pf-paid)', label: 'Plătit' }, { lei: openLei, color: 'var(--pf-open)', label: 'De plătit' }, { lei: s.lateLei, color: 'var(--pf-late)', label: 'Întârziate' }], 120,
          '<b>' + p + '%</b><small>plătit</small>', p + '% plătit: ' + K.lei(s.paid) + ' plătit, ' + K.lei(openLei) + ' de plătit, ' + K.lei(s.lateLei) + ' întârziate') +
        '<ul class="pf-leg">' + leg('is-paid', 'Plătit', s.paid, K.plural(s.paidCount, 'plată', 'plăți') + (s.partial ? ' + ' + s.partial + ' în parte' : '')) +
          leg('is-open', 'De plătit', openLei, nOpen ? K.plural(nOpen, 'plată', 'plăți') + (s.soon ? ', ' + s.soon + ' în curând' : '') : '') +
          leg('is-late', 'Întârziate', s.lateLei, lateN ? K.plural(lateN, 'plată', 'plăți') : 'nimic') + '</ul>' +
        (s.missing ? '<p class="pf-ov-note">' + icon('info') + K.plural(s.missing, 'plată fără sumă', 'plăți fără sumă') + ', nu intră în cerc</p>' : '') + '</section>' +
      // a slim line that stays at the top once the circle has scrolled away
      '<div class="pf-mini" data-pf-mini aria-hidden="true"><span><b>' + p + '%</b> plătit</span><span>rămas <b>' + K.lei(s.toPay) + '</b></span>' + (lateN ? '<span class="is-late">' + K.plural(lateN, 'întârziată', 'întârziate') + '</span>' : '') +
        '<i><i style="width:' + p + '%"></i></i></div>' : '';
    const late = d.rows.filter((r) => r.state === 'late'), open = d.rows.filter((r) => !r.done && r.state !== 'late'), paid = d.rows.filter((r) => r.done);
    const n = { all: d.rows.length, open: late.length + open.length, late: late.length, paid: paid.length };
    const f = PL.filter;
    const chips = d.rows.length ? '<div class="pf-tools"><div class="k-chips pf-chips">' + FILTERS.map(([k, l]) => '<button type="button" class="k-chip' + (f === k ? ' is-on' : '') + '" data-pf-filter="' + k + '" aria-pressed="' + (f === k) + '">' + l + '<span>' + n[k] + '</span></button>').join('') + '</div></div>' : '';
    const list = (title, rows) => rows.length ? '<section class="pf-group"><h4>' + title + '<span>' + rows.length + '</span></h4><ul class="pf-list">' + rows.map(rowHtml).join('') + '</ul></section>' : '';
    const openTitle = d.current || d.month > d.today.slice(0, 7) ? 'De plătit' : 'Neplătite';
    const groups = (f === 'all' || f === 'open' || f === 'late' ? list('Întârziate', late) : '') + (f === 'all' || f === 'open' ? list(openTitle, open) : '') + (f === 'all' || f === 'paid' ? list('Plătite', paid) : '');
    const shown = f === 'all' ? n.all : n[f];
    const actions = '<div class="pf-acts"><button type="button" class="pf-add" data-pf-own-add>' + icon('plus') + 'Adaugă o plată</button>' +
      (d.copyable ? '<button type="button" class="pf-add" data-pf-copy>' + icon('copy') + 'Copiază din luna trecută <span>' + d.copyable + '</span></button>' : '') + '</div>';
    return overview + nextHtml(d.next) + chips +
      (d.rows.length ? (shown ? groups : '<p class="pf-none">' + (f === 'late' ? 'Nimic întârziat.' : f === 'paid' ? 'Nimic plătit încă.' : 'Totul e plătit.') + '</p>')
        : K.empty('wallet', 'Nicio plată luna asta', 'Completează Costuri lunare și salariile în Echipa, sau adaugă o plată a ta.')) + actions +
      '<p class="pf-foot">Salariile de ' + esc(K.MON[+d.salariesFor.slice(5, 7) - 1]) + ' se plătesc în ' + esc(K.MON[+d.month.slice(5, 7) - 1]) + ', în ziua din fișa fiecăruia (Oameni → Ziua salariului). Cine a plecat nu mai apare aici.</p>';
  }

  // ------------------------------------------------------------------ the sheet of a row: pay a part, this month's sum, his own rows
  const leiIn = (name, value, ph) => '<div class="k-money"><input name="' + name + '" type="number" inputmode="decimal" min="0" step="0.01" placeholder="' + (ph || '0') + '"' + (value != null ? ' value="' + esc(value) + '"' : '') + '></div>';
  const numOf = (v) => { const n = Number(String(v == null ? '' : v).replace(/\s/g, '').replace(',', '.')); return Number.isFinite(n) ? n : NaN; };
  const post = (body) => K.api('/api/portal-plati', Object.assign({ month: PL.month }, body));
  function openRow(r, from) {
    const d = PL.data, t = K.today();
    const own = r.group === 'own', once = own && !r.own.repeat;
    const sub = [kindOf(r) === 'Salariu' ? esc(r.sub) : own ? (r.own.repeat ? 'în fiecare lună' : 'doar luna asta') : '', r.due ? 'scadent ' + esc(K.dateShort(r.due)) : r.group === 'card' ? 'cu cardul, pe măsură ce se cheltuie' : 'fără dată'].filter(Boolean).join(' · ');
    const stat = (label, v, cls) => '<div class="pf-sh-stat' + (cls ? ' ' + cls : '') + '"><span>' + label + '</span><b>' + v + '</b></div>';
    const w = r.lei > 0 ? Math.min(100, Math.round((r.paidLei / r.lei) * 100)) : r.done ? 100 : 0;
    const body =
      '<div class="pf-sh-top">' + stat('De plătit', r.lei != null ? K.lei(r.lei, 2) : 'fără sumă') + stat('Plătit', K.lei(r.paidLei, 2), 'is-paid') + stat('Rămas', r.rest != null ? K.lei(r.rest, 2) : '-', r.state === 'late' ? 'is-late' : '') +
        '<i class="pf-prog" aria-hidden="true"><i style="width:' + w + '%"></i></i>' + (r.changed && r.orig != null ? '<p class="pf-sh-note">Luna asta altă sumă. De obicei ' + K.lei(r.orig, 2) + '.</p>' : '') +
        (r.src ? '<p class="pf-sh-note">' + icon('zap') + (r.key === 'taxsal' ? (r.typed ? 'Suma e cea de la contabilă, din Variabile.' : 'Suma e calculată din salarii, pe persoane.') : 'Suma vine automat din ' + esc(r.src) + (r.group === 'card' && r.upToday ? ', cât s-a cheltuit până azi' : '') + '.') + '</p>' : '') +
        '</div>' + (r.calc ? taxSalHtml(r) : '') +
      (r.group !== 'sal' ? '<div class="pf-sh-auto">' + K.toggle('autopay', !!r.autoPay, 'Se plătește automat') + '<span>' + (r.group === 'card' ? 'Meta ia banii de pe card pe măsură ce cheltuie.' : 'Debit direct: se trece plătită singură pe ' + (r.due ? esc(K.dateShort(r.due)) : '1 ale lunii') + ', fără bifă.') + '</span></div>' : '') +
      (r.parts.length ? '<h5 class="pf-sh-h">Plăți făcute</h5>' + partsHtml(r, true) : '') +
      (!r.done ? '<h5 class="pf-sh-h">Plătește</h5><form class="k-form pf-form" data-pf-payf>' +
        K.field('Suma', leiIn('lei', r.rest > 0 ? r.rest : null), 'full') +
        K.field('Data', '<input name="date" type="date" value="' + esc(t) + '">', '') + K.field('Notă', '<input name="note" maxlength="200" placeholder="opțional">', '') + '</form>' : '') +
      (!once ? '<h5 class="pf-sh-h">Suma pe ' + esc(K.MON[+d.month.slice(5, 7) - 1]) + '</h5><form class="k-form pf-form pf-amtf" data-pf-amtf>' +
        K.field('Doar luna asta', leiIn('lei', r.lei, r.lei == null ? 'sumă' : ''), 'full') +
        '<div class="pf-sh-btns">' + (r.changed ? '<button type="button" class="k-btn pf-link" data-pf-amt-reset>Înapoi la ' + (r.orig != null ? esc(K.lei(r.orig)) : 'fără sumă') + '</button>' : '') +
        '<button type="button" class="k-btn" data-pf-amt-save>Salvează suma</button></div></form>' : '') +
      (own ? '<h5 class="pf-sh-h">Plata ta</h5>' + ownForm(r.own, r) + '<div class="pf-sh-btns"><button type="button" class="k-btn pf-own-del" data-pf-own-del>' + icon('trash') + 'Șterge</button><button type="button" class="k-btn" data-pf-own-save>Salvează</button></div>' : '');
    const dr = K.drawer({
      title: r.label, icon: own ? 'receipt' : r.group === 'sal' ? 'user' : 'wallet', width: 480, subtitle: sub, from, body,
      footer: '<span class="k-grow"></span><button type="button" class="k-btn" data-cancel>' + (r.done ? 'Închide' : 'Renunță') + '</button>' +
        (!r.done ? '<button type="button" class="k-btn is-primary" data-ok>' + icon('check') + 'Plătește</button>' : ''),
      onMount(el) {
        const done = (msg) => { dr.close(); if (msg) K.ui().toast(msg, 'success'); load(); };
        const err = (e) => K.ui().toast(K.errText(e), 'error');
        const ap = el.querySelector('.pf-sh-auto input[name="autopay"]');
        if (ap) ap.addEventListener('change', async () => {
          ap.disabled = true;
          try { await post({ action: 'autopay', key: r.key, on: ap.checked }); done(ap.checked ? r.label + ': se plătește automat.' : r.label + ': o bifezi tu.'); } catch (x) { ap.checked = !ap.checked; ap.disabled = false; err(x); }
        });
        el.querySelector('[data-cancel]').addEventListener('click', () => dr.close());
        const pf = el.querySelector('[data-pf-payf]'), ok = el.querySelector('[data-ok]');
        if (pf && ok) {
          pf.addEventListener('submit', (e) => { e.preventDefault(); ok.click(); });
          ok.addEventListener('click', (e) => K.busy(e.currentTarget, async () => {
            const v = K.formValues(pf), lei = numOf(v.lei);
            if (!(lei > 0)) { K.ui().toast('Scrie suma plătită.', 'error'); pf.lei.focus(); return; }
            try { await post({ action: 'pay', key: r.key, lei, date: v.date, note: v.note }); done(r.rest != null && lei < r.rest - 0.005 ? 'Plătit ' + K.lei(lei, 2) + ', rămas ' + K.lei(r.rest - lei, 2) + '.' : r.label + ': plătit.'); } catch (x) { err(x); }
          }));
        }
        const af = el.querySelector('[data-pf-amtf]');
        if (af) {
          af.addEventListener('submit', (e) => { e.preventDefault(); el.querySelector('[data-pf-amt-save]').click(); });
          el.querySelector('[data-pf-amt-save]').addEventListener('click', (e) => K.busy(e.currentTarget, async () => {
            const raw = af.lei.value, lei = numOf(raw);
            if (String(raw).trim() !== '' && !(lei > 0)) { K.ui().toast('Scrie o sumă mai mare ca zero.', 'error'); return; }
            try { await post({ action: 'amount', key: r.key, lei: String(raw).trim() === '' ? '' : lei }); done('Suma pe luna asta e salvată.'); } catch (x) { err(x); }
          }));
          const rs = el.querySelector('[data-pf-amt-reset]');
          if (rs) rs.addEventListener('click', (e) => K.busy(e.currentTarget, async () => { try { await post({ action: 'amount', key: r.key, lei: '' }); done('Suma obișnuită, din nou.'); } catch (x) { err(x); } }));
        }
        if (own) {
          const of = el.querySelector('[data-pf-ownf]');
          wireOwnForm(of);
          el.querySelector('[data-pf-own-save]').addEventListener('click', (e) => K.busy(e.currentTarget, async () => {
            const v = ownValues(of);
            if (!v) return;
            try { await post(Object.assign({ action: 'own_edit', key: r.key }, v)); done('Salvat.'); } catch (x) { err(x); }
          }));
          el.querySelector('[data-pf-own-del]').addEventListener('click', async (e) => {
            const btn = e.currentTarget;
            let scope = 'all';
            if (r.own.repeat) {
              scope = await K.ui().prompt({ from: btn, title: 'Ștergi ' + r.label + '?', label: 'De unde', options: [['month', 'Doar din ' + K.MON[+d.month.slice(5, 7) - 1]], ['all', 'Din ' + K.MON[+d.month.slice(5, 7) - 1] + ' înainte, în toate lunile']], value: 'month', confirmText: 'Șterge' });
              if (scope == null) return;
            } else if (!(await K.ui().confirm({ from: btn, title: 'Ștergi ' + r.label + '?', message: r.parts.length ? 'Se șterg și plățile notate la ea.' : 'Iese din lista lunii.', confirmText: 'Șterge', danger: true }))) return;
            K.busy(btn, async () => { try { await post({ action: 'own_del', key: r.key, scope }); done('Șters.'); } catch (x) { err(x); } });
          });
        }
        el.addEventListener('click', async (e) => {
          const pd = e.target.closest('[data-pf-pdel]');
          if (!pd) return;
          await delPart(r, pd.dataset.pfPdel, pd);
          dr.close();
        });
        if (pf) setTimeout(() => { try { pf.lei.focus({ preventScroll: true }); pf.lei.select(); } catch (x) { /* */ } }, 300);
      },
    });
  }
  // Taxe la stat (salarii): per person, as calculated (api/_lib/ro-salary-tax.js), the rates of the year under it
  function taxSalHtml(r) {
    const c = r.calc, pc = (v) => String(Math.round(v * 10000) / 100).replace('.', ',') + '%';
    const mon = K.MON[+c.month.slice(5, 7) - 1];
    return '<h5 class="pf-sh-h">Calculat pe ' + esc(mon) + (r.typed ? ' (pentru comparație)' : '') + '</h5><ul class="pf-tax">' + c.people.map((x) => '<li><div class="pf-tax-h"><b>' + esc(x.name) + '</b><span>' + K.lei(x.total) + '</span></div>' +
        '<small>brut ' + K.lei(x.gross) + (x.derived ? ' (din net)' : '') + ' · CAS ' + K.num(x.cas) + ' · CASS ' + K.num(x.cass) + ' · impozit ' + K.num(x.tax) + ' · CAM ' + K.num(x.cam) + (x.untaxed ? ' · ' + x.untaxed + ' lei neimpozabili' : '') + '</small></li>').join('') +
      '<li class="is-tot"><div class="pf-tax-h"><b>Total</b><span>' + K.lei(c.total) + '</span></div></li></ul>' +
      '<p class="pf-sh-note">Reguli ' + c.rates.year + ': CAS ' + pc(c.rates.cas) + ', CASS ' + pc(c.rates.cass) + ', impozit ' + pc(c.rates.tax) + ' după deducerea personală (fără persoane în întreținere, dacă nu sunt trecute), CAM ' + pc(c.rates.cam) + ' plătit de firmă, salariul minim ' + K.lei(c.rates.minWage) + '. ' +
        'Brutul e calculat din net când nu e trecut; orele, comisionul și bonusurile intră în brut. ' + (r.typed ? 'Pe rând e suma de la contabilă.' : 'Nu e suma finală: scrie suma de la contabilă în Variabile → Taxe la stat → „Din salarii”.') + '</p>';
  }
  async function delPart(r, id, from) {
    const p = (r.parts || []).find((x) => x.id === id);
    if (!p) return;
    if (!(await K.ui().confirm({ from, title: 'Ștergi plata de ' + K.lei(p.lei, 2) + '?', message: r.label + ': suma revine la „rămas”.', confirmText: 'Șterge', danger: true }))) return;
    try { await post({ action: 'part_del', key: r.key, id }); load(); } catch (err) { K.ui().toast(K.errText(err), 'error'); }
  }
  // his own row: name, sum, day, every month or not
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
    const lei = String(v.lei || '').trim() === '' ? '' : numOf(v.lei);
    if (lei !== '' && !(lei > 0)) { K.ui().toast('Scrie o sumă mai mare ca zero, sau las-o goală.', 'error'); f.lei.focus(); return null; }
    const day = String(v.day || '').trim() === '' ? '' : Math.round(numOf(v.day));
    if (day !== '' && !(day >= 1 && day <= 31)) { K.ui().toast('Ziua e de la 1 la 31, sau goală pentru fără dată.', 'error'); f.day.focus(); return null; }
    return { label: v.label, lei, day, note: v.note || '', repeat: !!v.repeat };
  }
  function openOwnAdd(from) {
    const d = PL.data;
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
          try { await post(Object.assign({ action: 'own_add' }, v)); dr.close(); K.ui().toast(v.repeat ? 'Adăugată, în fiecare lună.' : 'Adăugată.', 'success'); load(); } catch (err) { K.ui().toast(K.errText(err), 'error'); }
        }));
        setTimeout(() => { try { f.label.focus({ preventScroll: true }); } catch (x) { /* */ } }, 300);
      },
    });
  }

  // ------------------------------------------------------------------ Cheltuieli variabile
  const kindLabel = (line, k) => { const x = (line.kinds || []).find(([v]) => v === k); return x ? x[1] : ''; };
  function cheltHtml() {
    const d = PL.data;
    const autoRow = (a) => {
      const src = a.error && a.lei == null ? '<span class="is-err">' + (/nu poate fi citit/.test(a.error) ? esc(a.src) + ' nu poate fi citit acum' : esc(a.src) + ' nu răspunde: ' + esc(a.error)) + '. Scrie suma în Costuri lunare.</span>'
        : a.over != null ? 'scrisă de tine în Costuri lunare' : a.none ? 'WhatsApp nu e conectat' : a.key === 'payroll' ? 'din Salariu, se actualizează singur'
        : 'din ' + esc(a.src) + (a.at ? ', actualizat ' + esc(readAt(a.at)) : '') + (a.saved ? ' (ultima citire)' : '');
      return '<li class="pf-auto"><div class="pf-main"><b class="pf-name">' + esc(a.label) + '</b><small>' + src + '</small></div><span class="pf-amt">' + (a.lei != null ? K.lei(a.lei) : 'încă nu') + '</span></li>';
    };
    // the payment day: with one, the category is a row in Plăți once it has a sum (Taxe la stat: the 25th unless changed)
    const dayBtn = (line) => '<button type="button" class="pf-dayset' + (line.day ? ' is-on' : '') + '" data-pf-day aria-label="Ziua de plată pentru ' + esc(line.label) + '">' + icon('calendar') + (line.day ? 'În Plăți pe ' + line.day : 'Nu e în Plăți') + '</button>';
    const recCard = (line) => '<section class="k-card pf-rec" data-line="' + esc(line.key) + '"><div class="pf-rec-head"><div class="pf-main"><b class="pf-name">' + esc(line.label) + '</b>' + (line.hint ? '<small>' + esc(line.hint) + '</small>' : '') + dayBtn(line) + '</div>' +
        '<span class="pf-amt">' + K.lei(line.total, 2) + '</span></div>' +
        (line.entries.length ? '<ul class="pf-ents">' + line.entries.map((e) => '<li><span class="pf-ent-d">' + (e.date ? esc(K.dateShort(e.date)) : '-') + '</span><span class="pf-ent-n">' +
          (e.kind && line.kinds ? '<em>' + esc(kindLabel(line, e.kind)) + '</em>' : '') + esc(e.note || '') + '</span><b>' + K.lei(e.lei, 2) + '</b>' +
          '<button type="button" class="k-icon-btn pf-del" data-pf-del="' + esc(e.id) + '" aria-label="Șterge">' + icon('trash') + '</button></li>').join('') + '</ul>' : '') +
        '<button type="button" class="pf-add" data-pf-add>' + icon('plus') + 'Adaugă</button></section>';
    const tax = d.rec.find((l) => l.key === 'taxes');
    const taxSal = tax ? tax.entries.filter((e) => e.kind === 'salarii').reduce((a, e) => a + Number(e.lei), 0) : 0;
    return whereHtml(d.where) +
      (d.autos.length ? '<section class="k-card pf-rec"><div class="pf-rec-head"><div class="pf-main"><b class="pf-name">' + icon('zap') + 'Se completează singure</b></div></div><ul class="pf-autos">' + d.autos.map(autoRow).join('') + '</ul></section>' : '') +
      '<div class="pf-recs">' + d.rec.map(recCard).join('') + '</div>' +
      '<p class="pf-foot">Tot ce adaugi aici intră în costurile lunii' + (taxSal ? '. Taxele din salarii (' + K.lei(taxSal) + ') nu se scad încă o dată: sunt deja în Salarii brute.' : '.') + '</p>';
  }
  // Unde se duc banii: every cost of the month by category, the 6 biggest and the rest together, each with its own colour
  // (the colour follows the category, never its rank), and last month's total
  const CAT_COLOR = { sal: 1, rent: 2, credit: 3, laser: 4, tax: 5, ads: 6, cons: 7, util: 8 };
  function whereHtml(w) {
    if (!w) return '';
    const list = (w.cats || []).filter((c) => c.lei > 0).sort((a, b) => b.lei - a.lei);
    const colored = list.filter((c) => CAT_COLOR[c.key]);
    const top = colored.slice(0, 6);
    const rest = list.filter((c) => !top.includes(c));
    const restLei = rest.reduce((a, c) => a + c.lei, 0);
    const parts = top.map((c) => ({ key: c.key, label: c.label, lei: c.lei, color: 'var(--pf-c' + CAT_COLOR[c.key] + ')' }));
    if (restLei > 0) parts.push({ key: 'rest', label: 'Altele', lei: restLei, color: 'var(--pf-c0)', sub: rest.map((c) => (c.key === 'other' ? (c.parts || []).join(', ') : c.label)).filter(Boolean).join(', ') });
    const total = parts.reduce((a, x) => a + x.lei, 0);
    const mName = K.MON[+(w.prev ? w.prev.month : '2000-01').slice(5, 7) - 1];
    let cmp = '';
    if (w.prev && w.prev.total > 0) {
      const dlt = total - w.prev.total, up = dlt > 0;
      cmp = '<p class="pf-cmp ' + (up ? 'is-up' : 'is-down') + '">' + (up ? '↑ ' : '↓ ') + K.lei(Math.abs(dlt)) + (up ? ' mai mult' : ' mai puțin') + ' decât în ' + esc(mName) + ' (' + K.lei(w.prev.total) + ')' + (w.upToday ? ', luna asta până azi' : '') + '</p>';
    }
    // whole percents that add up to 100 (largest remainder): the legend never says 99% or 101% in all
    const raw = parts.map((x) => (total > 0 ? (x.lei / total) * 100 : 0)), pcs = raw.map(Math.floor);
    let left = total > 0 ? 100 - pcs.reduce((a, v) => a + v, 0) : 0;
    raw.map((v, i) => [v - Math.floor(v), i]).sort((a, b) => b[0] - a[0]).forEach(([, i]) => { if (left > 0) { pcs[i]++; left--; } });
    const legend = parts.map((x, i) => '<li><i style="--c:' + x.color + '" aria-hidden="true"></i><span>' + esc(x.label) + (x.sub ? '<small>' + esc(x.sub) + '</small>' : '') + '</span><b>' + K.lei(x.lei) + '</b><em>' + pcs[i] + '%</em></li>').join('');
    return '<section class="k-card pf-where"><div class="pf-where-head"><h3>Unde se duc banii luna asta</h3>' + cmp + '</div>' +
      (total > 0 ? '<div class="pf-where-body">' + donut(parts, 148, '<b>' + K.lei(total) + '</b><small>' + (w.upToday ? 'până azi' : 'toată luna') + '</small>', 'Costurile lunii: ' + parts.map((x) => x.label + ' ' + K.lei(x.lei)).join(', ')) +
        '<ul class="pf-leg is-cats">' + legend + '</ul></div>' : '<p class="pf-foot">Nicio cheltuială încă luna asta.</p>') +
      (w.missing && w.missing.length ? '<p class="pf-ov-note">' + icon('info') + 'Lipsesc: ' + esc(w.missing.join(', ')) + '</p>' : '') + '</section>';
  }
  function openAdd(lineKey) {
    const line = PL.data.rec.find((l) => l.key === lineKey);
    if (!line) return;
    const d = PL.data, t = K.today();
    const date = t.slice(0, 7) === d.month ? t : d.month + '-01';
    const dr = K.drawer({
      title: line.label, icon: 'receipt', width: 460, subtitle: esc(K.monthLabel(d.month)),
      body: '<form class="k-form pf-form" data-pf-form>' +
        K.field('Suma', '<div class="k-money"><input name="lei" type="number" inputmode="decimal" min="0" step="0.01" placeholder="0" required></div>', 'full') +
        (line.kinds ? K.field('Ce fel', K.seg('kind', line.kinds, line.kinds[0][0], 'is-big'), 'full', '„Din salarii” (contribuții și impozit) e deja în Salarii brute, nu se scade încă o dată din profit.') : '') +
        K.field('Data', '<input name="date" type="date" value="' + esc(date) + '" min="' + esc(d.month + '-01') + '" max="' + esc(d.month + '-' + K.pad(K.daysIn(d.month))) + '">', 'full') +
        K.field('Notă', '<input name="note" maxlength="200" placeholder="ex. factura de curent">', 'full') + '</form>',
      footer: '<span class="k-grow"></span><button type="button" class="k-btn" data-cancel>Renunță</button><button type="button" class="k-btn is-primary" data-ok>' + icon('check') + 'Adaugă</button>',
      onMount(el) {
        const f = el.querySelector('[data-pf-form]');
        setTimeout(() => { try { f.lei.focus(); } catch (e) { /* */ } }, 80);
        el.querySelector('[data-cancel]').addEventListener('click', () => dr.close());
        f.addEventListener('submit', (e) => { e.preventDefault(); el.querySelector('[data-ok]').click(); });
        el.querySelector('[data-ok]').addEventListener('click', (e) => K.busy(e.currentTarget, async () => {
          const v = K.formValues(f);
          const lei = Number(String(v.lei || '').replace(',', '.'));
          if (!(lei > 0)) { K.ui().toast('Scrie suma.', 'error'); f.lei.focus(); return; }
          try {
            await K.api('/api/portal-plati', { action: 'rec_add', month: d.month, line: line.key, lei, date: v.date, note: v.note, kind: v.kind });
            dr.close(); K.ui().toast('Adăugat.', 'success'); load();
          } catch (err) { K.ui().toast(K.errText(err), 'error'); }
        }));
      },
    });
  }

  // ------------------------------------------------------------------ taps
  document.addEventListener('change', (e) => {
    if (!PL.box || !PL.box.contains(e.target) || e.target.name !== 'plsub') return;
    if (PL.sub === 'costuri' && K.costsMonth) PL.month = K.costsMonth();
    PL.sub = e.target.value; showSub();
  });
  document.addEventListener('keydown', (e) => {
    if ((e.key !== 'Enter' && e.key !== ' ') || !PL.box || !PL.box.contains(e.target) || !e.target.matches('.pf-main[data-pf-open]')) return;
    e.preventDefault(); e.target.click();
  });
  // „Următoarea”: its row comes into view and lights up for a moment (another month: that month opens first)
  function flash(key) {
    const el = PL.box && PL.box.querySelector('.pf-row[data-key="' + (window.CSS && CSS.escape ? CSS.escape(key) : key) + '"]');
    if (!el) return;
    el.scrollIntoView({ block: 'center', behavior: reduced() ? 'auto' : 'smooth' });
    el.classList.remove('is-flash'); void el.offsetWidth; el.classList.add('is-flash');
    setTimeout(() => el.classList.remove('is-flash'), 1600);
  }
  document.addEventListener('click', async (e) => {
    if (!PL.box || !PL.box.contains(e.target) || !PL.data) return;
    const mv = e.target.closest('[data-pf-m]');
    if (mv) { PL.month = K.addMonths(PL.month, +mv.dataset.pfM); load(); return; }
    const go = e.target.closest('[data-pf-go]');
    if (go) { const b = PL.box.querySelector('[data-k-seg="plsub"] button[data-v="' + go.dataset.pfGo + '"]'); if (b) b.click(); return; }
    const fl = e.target.closest('[data-pf-filter]');
    if (fl) { PL.filter = fl.dataset.pfFilter; try { localStorage.setItem('c360-pl-filter', PL.filter); } catch (x) { /* private mode */ } paint(); return; }
    const jump = e.target.closest('[data-pf-jump]');
    if (jump) {
      const key = jump.dataset.pfJump, m = jump.dataset.month;
      if (PL.filter !== 'all' && PL.filter !== 'open') { PL.filter = 'all'; paint(); }
      if (m && m !== PL.month) { PL.month = m; PL.flashKey = key; load(); } else flash(key);
      return;
    }
    if (e.target.closest('[data-pf-own-add]')) return openOwnAdd(e.target.closest('[data-pf-own-add]'));
    const cp = e.target.closest('[data-pf-copy]');
    if (cp) return K.busy(cp, async () => { try { const r = await post({ action: 'own_copy' }); K.ui().toast(r.copied ? 'Am copiat ' + K.plural(r.copied, 'plată', 'plăți') + ' din luna trecută.' : 'Nimic nou de copiat.', 'success'); load(); } catch (err) { K.ui().toast(K.errText(err), 'error'); } });
    if (e.target.closest('[data-pf-tax]')) return openAdd('taxes');
    const dayb = e.target.closest('[data-pf-day]');
    if (dayb) {
      const line = PL.data.rec.find((l) => l.key === dayb.closest('[data-line]').dataset.line);
      if (!line) return;
      const opts = [['0', 'Nu apare în Plăți']].concat(Array.from({ length: 31 }, (_, i) => [String(i + 1), 'Pe ' + (i + 1) + ' ale lunii']));
      const v = await K.ui().prompt({ from: dayb, title: line.label + ' în Plăți', message: 'Cu o zi de plată, suma lunii apare în Plăți și o poți bifa.', label: 'Ziua de plată', options: opts, value: String(line.day || 0), confirmText: 'Salvează' });
      if (v == null) return;
      return K.busy(dayb, async () => { try { await post({ action: 'rec_day', line: line.key, day: +v }); load(); } catch (err) { K.ui().toast(K.errText(err), 'error'); } });
    }
    const add = e.target.closest('[data-pf-add]');
    if (add) return openAdd(add.closest('[data-line]').dataset.line);
    const del = e.target.closest('[data-pf-del]');
    if (del) {
      const line = del.closest('[data-line]').dataset.line, id = del.dataset.pfDel;
      if (!(await K.ui().confirm({ from: del, title: 'Ștergi suma?', message: id === 'legacy' ? 'E suma scrisă înainte în Costuri lunare; se scoate de acolo.' : 'Se scade din costurile lunii.', confirmText: 'Șterge', danger: true }))) return;
      return K.busy(del, async () => { try { await post({ action: 'rec_del', line, id }); load(); } catch (err) { K.ui().toast(K.errText(err), 'error'); } });
    }
    const row = e.target.closest('.pf-row');
    if (!row) return;
    const key = row.dataset.key, r = PL.data.rows.find((x) => x.key === key);
    if (!r) return;
    const pd = e.target.closest('[data-pf-pdel]');
    if (pd) return delPart(r, pd.dataset.pfPdel, pd);
    if (e.target.closest('[data-pf-note]')) {
      const note = await K.ui().prompt({ from: e.target.closest('[data-pf-note]'), title: 'Notă la ' + r.label, label: 'Notă (opțional)', value: (r.paid && r.paid.note) || '', confirmText: 'Salvează' });
      if (note == null) return;
      try { await post({ action: 'note', key, note }); load(); } catch (err) { K.ui().toast(K.errText(err), 'error'); }
      return;
    }
    const tick = e.target.closest('[data-pf-tick]');
    if (!tick) { if (e.target.closest('[data-pf-open]')) openRow(r, row); return; }
    if (r.autoPay) return openRow(r, row); // paid by itself: the sheet, where it can be turned off
    if (r.done) {
      if (!(await K.ui().confirm({ from: tick, title: 'Scoți plata?', message: r.parts.length > 1 ? 'Se șterg toate cele ' + r.parts.length + ' plăți; ' + r.label + ' rămâne de plătit.' : r.label + ' rămâne de plătit.', confirmText: 'Scoate' }))) return;
      tick.classList.remove('is-on');
      try { await post({ action: 'unpay', key }); } catch (err) { K.ui().toast(K.errText(err), 'error'); }
      return load();
    }
    // nothing known to pay (no sum yet): the sheet asks for the sum
    if (!(r.rest > 0)) return openRow(r, row);
    // the tick: what is left, in full, at once on the screen, then saved (a failed save puts it back)
    tick.classList.add('is-on'); tick.setAttribute('aria-pressed', 'true');
    try {
      await post({ action: 'pay', key });
      K.ui().toast(r.label + ': plătit' + (r.partial ? ' tot, ' + K.lei(r.rest) + ' acum' : '') + '.', 'success');
    } catch (err) { K.ui().toast(K.errText(err), 'error'); }
    load();
  });
  // its own entry in the menu (the owner, 16.11: „rubrică separată cu cheltuieli în meniu”): Plăți, Cheltuieli, Costuri lunare
  if (K.section) K.section('cheltuieli', {
    mount(p) {
      p.classList.add('k-panel', 'lg');
      p.innerHTML = '<div class="k-head"><div><div class="k-eyebrow">Bani</div><h2>Cheltuieli</h2></div></div><div data-costs></div>';
    },
    show() { const b = document.querySelector('#panel-cheltuieli [data-costs]'); if (b && K.mountCosts) K.mountCosts(b); },
  });
})();
