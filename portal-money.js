// Centrul360 portal, money: "Încasări" and "Salariu" (with the commission or the booking bonus).
// Încasări: pick the city (Timișoara / Arad / both) and the period (today, yesterday, this week,
// this month, last month or exact dates); totals per payment method, daily bars, per person and
// per category, the day-grouped list, CSV + print. A payment always starts from an appointment:
// the desk picks WHICH appointment, HOW it was paid (card / cash / transfer / cash + card), WHO did
// the treatment and, when she sold something extra, ticks "Upsell efectuat" with its value. The
// commission on it (value - 60% costs, 10% of the profit) waits for the owner's approval.
// The owner also sees the POS check (myPOS, Integrări): the card payments made on the POS next to the card
// payments recorded here, matched one by one (same day, same city, same sum), and what is on one side only.
// Salariu: salary + overtime + commission (cosmeticians) or the booking bonus (reception), per month.
(function () {
  'use strict';
  // an average with one decimal (23,9 isn't 24)
  const avg1 = (v) => (Number(v) || 0).toLocaleString('ro-RO', { minimumFractionDigits: 0, maximumFractionDigits: 1 });
  const K = window.K;
  const { esc, icon } = K;
  const METHODS = {
    card: { label: 'Card', ic: 'card', color: 'var(--accent)' },
    cash: { label: 'Cash', ic: 'cash', color: 'var(--good)' },
    transfer: { label: 'Transfer', ic: 'bank', color: 'var(--info)' },
    cash_card: { label: 'Cash + card', ic: 'wallet', color: 'var(--warn)' },
  };
  const LOCS = ['Timișoara', 'Arad'];
  const SALE_STATUS = { pending: { label: 'În așteptare', tone: 'warn' }, approved: { label: 'Aprobat', tone: 'good' }, rejected: { label: 'Respins', tone: 'bad' } };
  const sum = (list) => list.reduce((a, s) => a + Number(s.amount || 0), 0);
  // Cash + card payments count on both sides of the split.
  function byMethod(rows) {
    const t = { card: 0, cash: 0, transfer: 0 };
    rows.forEach((s) => {
      if (s.method === 'cash_card' && s.split) { t.cash += Number(s.split.cash || 0); t.card += Number(s.split.card || 0); }
      else if (t[s.method] != null) t[s.method] += Number(s.amount || 0);
    });
    return t;
  }
  const methodText = (s) => (s.method === 'cash_card' && s.split ? 'Cash ' + K.lei(s.split.cash) + ' + card ' + K.lei(s.split.card) : (METHODS[s.method] || METHODS.card).label);
  const cosmeticians = (loc) => ((K.data && K.data.activeEmployees) || []).filter((e) => e.role === 'cosmetician' && (!loc || e.location === loc));

  // =====================================================================================
  // ÎNCASĂRI
  // =====================================================================================
  const PERIODS = [['today', 'Azi'], ['yesterday', 'Ieri'], ['week', 'Săptămâna asta'], ['month', 'Luna asta'], ['prev', 'Luna trecută'], ['custom', 'Alte date']];
  const S = { period: 'today', from: '', to: '', loc: 'all', method: '', q: '', day: '' }; // opens on today (the owner, 20.10)
  let panel;

  function range() {
    const t = K.today();
    if (S.period === 'today') return [t, t];
    if (S.period === 'yesterday') { const y = K.addDays(t, -1); return [y, y]; }
    if (S.period === 'week') return [K.mondayOf(t), t];
    if (S.period === 'prev') { const m = K.addMonths(K.thisMonth(), -1); return [m + '-01', m + '-' + K.pad(K.daysIn(m))]; }
    if (S.period === 'custom' && S.from && S.to) return S.from <= S.to ? [S.from, S.to] : [S.to, S.from];
    return [K.thisMonth() + '-01', t];
  }
  const rangeLabel = () => {
    const [a, b] = range();
    if (a === b) return K.relDay(a) === K.dateLong(a) ? K.dateLong(a) : K.relDay(a) + ' · ' + K.dateShort(a);
    return K.dateShort(a) + ' - ' + K.dateShort(b) + (a.slice(0, 4) !== K.today().slice(0, 4) ? ' ' + a.slice(0, 4) : '');
  };

  function mountIncasari(p) {
    panel = p;
    panel.classList.add('k-panel', 'mo');
    const locked = !!(K.data && K.data.city); // cosmeticians: only their city, no switch
    if (locked) S.loc = K.data.city;
    S.from = K.thisMonth() + '-01'; S.to = K.today();
    panel.innerHTML =
      '<div class="k-head"><div><div class="k-eyebrow">Clinică</div><h2>Încasări</h2></div>' +
      '<div class="k-head-actions"><button type="button" class="k-btn is-outline" data-act="customize">' + icon('sliders') + 'Personalizează</button><button type="button" class="k-btn is-outline" data-act="csv">' + icon('download') + 'Export</button>' +
      '<button type="button" class="k-btn is-outline" data-act="print">' + icon('printer') + 'Printează</button>' +
      '<button type="button" class="k-btn is-accent" data-act="new">' + icon('plus') + 'Încasare<kbd>N</kbd></button></div></div>' +
      '<div class="mo-filters k-card">' +
        (locked ? '' : '<div class="mo-filter"><span>Oraș</span>' + K.seg('moloc', [['all', 'Ambele'], ['Timișoara', 'Timișoara'], ['Arad', 'Arad']], S.loc) + '</div>') +
        '<div class="mo-filter"><span>Perioadă</span><div class="k-chips" data-periods>' + PERIODS.map(([k, l]) => '<button type="button" class="k-chip' + (S.period === k ? ' is-on' : '') + '" data-period="' + k + '">' + l + '</button>').join('') + '</div></div>' +
        '<div class="mo-custom" data-custom' + (S.period === 'custom' ? '' : ' hidden') + '><label>De la<input type="date" data-from value="' + S.from + '"></label><label>Până la<input type="date" data-to value="' + S.to + '"></label></div>' +
      '</div>' +
      '<div data-body></div>';
    panel.addEventListener('click', onClick);
    panel.addEventListener('change', (e) => {
      if (e.target.name === 'moloc') { S.loc = e.target.value; S.day = ''; render(); }
      if (e.target.matches('[data-from]')) { S.from = e.target.value; S.day = ''; render(); }
      if (e.target.matches('[data-to]')) { S.to = e.target.value; S.day = ''; render(); }
    });
    panel.addEventListener('input', (e) => { if (e.target.matches('[data-q]')) { S.q = e.target.value; renderList(); } });
    document.addEventListener('keydown', (e) => {
      if (!K.isActive('incasari') || K.drawerOpen || K.typing(document.activeElement) || e.ctrlKey || e.metaKey || e.altKey) return;
      if (document.querySelector('.c360-dialog-root, .c360-palette-root')) return;
      if (e.key.toLowerCase() === 'n') { e.preventDefault(); openNew({}); }
    });
  }
  function onClick(e) {
    const a = e.target.closest('[data-act]');
    if (a) {
      if (a.dataset.act === 'new') return openNew({});
      if (a.dataset.act === 'csv') return exportCsv();
      if (a.dataset.act === 'customize') return customizeInc();
      if (a.dataset.act === 'print') return printList();
      if (a.dataset.act === 'clear-day') { S.day = ''; return render(); }
      if (a.dataset.act === 'calendar') return K.go('programari');
    }
    const per = e.target.closest('[data-period]');
    if (per) {
      S.period = per.dataset.period; S.day = '';
      panel.querySelectorAll('[data-period]').forEach((b) => b.classList.toggle('is-on', b === per));
      panel.querySelector('[data-custom]').hidden = S.period !== 'custom';
      return render();
    }
    const meth = e.target.closest('[data-method]');
    if (meth) { S.method = S.method === meth.dataset.method ? '' : meth.dataset.method; return renderList(); }
    const row = e.target.closest('[data-pay]');
    if (row) openPayment(row.dataset.pay);
  }

  const inLoc = (s) => S.loc === 'all' || s.location === S.loc;
  function periodRows() { const [a, b] = range(); return ((K.data && K.data.incasari) || []).filter((s) => s.date >= a && s.date <= b && inLoc(s)); }

  // what Personalizează offers on this page (set by render)
  let incCtx = null;
  const INC_DEF = ['total', 'card', 'cash', 'transfer'];
  const INC_BLOCKS = { chart: 'Graficul pe zile', split: 'Pe categorii și pe persoane', list: 'Lista încasărilor' };
  function customizeInc() {
    const c = incCtx; if (!c) return;
    const catalog = {};
    Object.keys(c.INC).forEach((k) => { catalog[k] = { label: c.INC[k].label, group: c.INC[k].group, only: ['kpis'] }; });
    Object.keys(INC_BLOCKS).forEach((b) => { catalog['b:' + b] = { label: INC_BLOCKS[b], group: 'Secțiuni', only: ['blocks'] }; });
    K.customize({
      title: 'Personalizează Încasări', subtitle: 'Alegi cifrele de sus și secțiunile, în ordinea ta. Se păstrează pe contul tău.',
      catalog, groups: ['Bani', 'Metode', 'Categorii și orașe', 'Upsell', 'Secțiuni'],
      parts: [
        { key: 'kpis', label: 'Cifrele de sus', hint: 'Oricâte; se așază pe rânduri. Toate sunt pentru orașul și perioada alese.', value: c.kpis, def: INC_DEF },
        { key: 'blocks', label: 'Secțiunile', value: c.blocks.map((b) => 'b:' + b), def: Object.keys(INC_BLOCKS).map((b) => 'b:' + b) },
      ],
      async onSave(v) {
        await K.prefs.set('inc.kpis', v.kpis);
        await K.prefs.set('inc.blocks', v.blocks.map((b) => b.slice(2)));
        render();
      },
    });
  }

  function render() {
    if (!panel || !K.data) return;
    const rows = periodRows();
    const [from, to] = range();
    const total = sum(rows);
    const m = byMethod(rows);
    const days = [];
    for (let d = from; d <= to && days.length < 120; d = K.addDays(d, 1)) days.push(d);
    const daily = days.map((d) => sum(rows.filter((s) => s.date === d)));
    const byCat = { 'epilare-laser': 0, faciale: 0, corporale: 0 };
    rows.forEach((s) => { const c = K.catsOf(s); c.forEach((k) => { byCat[k] += Number(s.amount || 0) / c.length; }); });
    const catKeys = Object.keys(byCat).filter((k) => byCat[k] > 0).sort((a, b) => byCat[b] - byCat[a]);
    const byPerson = {};
    rows.forEach((s) => { const n = s.performedByName && s.performedByName !== '-' ? s.performedByName : 'Neatribuit'; byPerson[n] = (byPerson[n] || 0) + Number(s.amount || 0); });
    const people = Object.keys(byPerson).sort((a, b) => byPerson[b] - byPerson[a]);
    const pct = (v) => (total ? Math.round((v / total) * 100) : 0);
    const where = S.loc === 'all' ? 'Timișoara + Arad' : S.loc;

    // ---- every number Încasări can show on top (her pick, K.prefs 'inc.kpis'), for the city and period chosen
    const card = (cls, ic, color, label, value, fmt, key, sub) => '<div class="k-stat' + (cls ? ' ' + cls : '') + '"><div class="k-stat-top"><span class="k-stat-ic"' + (color ? ' style="color:' + color + '"' : '') + '>' + icon(ic) + '</span>' + label + '</div>' +
      (fmt === 'lei' ? '<div class="k-stat-value" data-count="' + Math.round(value) + '" data-fmt="lei" data-key="mo-' + key + '-' + from + to + S.loc + '">0</div>' : '<div class="k-stat-value">' + value + '</div>') + '<div class="k-stat-sub">' + sub + '</div></div>';
    const best = days.map((d, i) => [d, daily[i]]).filter((x) => x[1] > 0).sort((a, b) => b[1] - a[1])[0];
    const ups = rows.filter((x) => Number(x.upsell) > 0);
    const upsValue = ups.reduce((a, x) => a + Number(x.upsell || 0), 0);
    const cityOf = (c) => sum(rows.filter((x) => x.location === c));
    const top = people.filter((n) => n !== 'Neatribuit')[0];
    const INC = {
      total: { label: 'Total încasat', group: 'Bani', html: () => card('is-accent', 'wallet', '', 'Total încasat', total, 'lei', 't', K.plural(rows.length, 'încasare', 'încasări') + (rows.length ? ' · bon mediu ' + K.lei(total / rows.length) : '')) },
      count: { label: 'Număr de încasări', group: 'Bani', html: () => card('', 'receipt', '', 'Încasări', K.num(rows.length), '', '', 'plăți în perioadă') },
      ticket: { label: 'Bon mediu', group: 'Bani', html: () => card('', 'wallet', '', 'Bon mediu', rows.length ? total / rows.length : 0, 'lei', 'tk', 'pe încasare') },
      perDay: { label: 'Medie pe zi', group: 'Bani', html: () => card('', 'trend', '', 'Medie pe zi', days.length ? total / days.length : 0, 'lei', 'pd', 'în ' + K.plural(days.length, 'zi', 'zile')) },
      bestDay: { label: 'Cea mai bună zi', group: 'Bani', html: () => card('is-good', 'trophy', '', 'Cea mai bună zi', best ? best[1] : 0, 'lei', 'bd', best ? esc(K.dateLong(best[0])) : '-') },
      topPerson: { label: 'Cine a făcut cele mai multe', group: 'Bani', html: () => card('', 'users', '', 'Cel mai mult', top ? byPerson[top] : 0, 'lei', 'tp', top ? esc(top) : '-') },
      card: { label: 'Card', group: 'Metode', html: () => card('', 'card', 'var(--accent)', 'Card', m.card, 'lei', 'c', pct(m.card) + '% din total') },
      cash: { label: 'Cash', group: 'Metode', html: () => card('', 'cash', 'var(--good)', 'Cash', m.cash, 'lei', 'h', pct(m.cash) + '% din total') },
      transfer: { label: 'Transfer', group: 'Metode', html: () => card('', 'bank', 'var(--info)', 'Transfer', m.transfer, 'lei', 'x', pct(m.transfer) + '% din total') },
      epil: { label: 'Epilare laser', group: 'Categorii și orașe', html: () => card('', 'sparkles', '', esc(K.cats['epilare-laser'] || 'Epilare'), byCat['epilare-laser'], 'lei', 'ce', pct(byCat['epilare-laser']) + '% din total') },
      facial: { label: 'Faciale', group: 'Categorii și orașe', html: () => card('', 'sparkles', '', esc(K.cats.faciale || 'Faciale'), byCat.faciale, 'lei', 'cf', pct(byCat.faciale) + '% din total') },
      body: { label: 'Corporale', group: 'Categorii și orașe', html: () => card('', 'sparkles', '', esc(K.cats.corporale || 'Corporale'), byCat.corporale, 'lei', 'cb', pct(byCat.corporale) + '% din total') },
      tm: { label: 'Timișoara', group: 'Categorii și orașe', html: () => card('', 'pin', '', 'Timișoara', cityOf('Timișoara'), 'lei', 'tm', pct(cityOf('Timișoara')) + '% din total') },
      ar: { label: 'Arad', group: 'Categorii și orașe', html: () => card('', 'pin', '', 'Arad', cityOf('Arad'), 'lei', 'ar', pct(cityOf('Arad')) + '% din total') },
      upsell: { label: 'Valoare upsell', group: 'Upsell', html: () => card('is-good', 'trend', '', 'Upsell', upsValue, 'lei', 'up', K.plural(ups.length, 'upsell', 'upselluri')) },
      upsellCount: { label: 'Număr de upselluri', group: 'Upsell', html: () => card('', 'trophy', '', 'Upselluri', K.num(ups.length), '', '', K.lei(upsValue) + ' valoare') },
      upsellRate: { label: 'Rata de upsell', group: 'Upsell', html: () => card('', 'percent', '', 'Rata de upsell', (rows.length ? Math.round((ups.length / rows.length) * 100) : 0) + '%', '', '', ups.length + ' din ' + rows.length + ' încasări') },
    };
    const kpis = (K.prefs.get('inc.kpis', null) || INC_DEF).filter((k) => INC[k]);
    const blocks = (K.prefs.get('inc.blocks', null) || Object.keys(INC_BLOCKS)).filter((b) => INC_BLOCKS[b]);
    incCtx = { INC, kpis, blocks };

    const BLOCK = {
      chart: () => (days.length > 1 ? '<section class="k-card"><div class="k-card-head"><h3>' + icon('trend') + 'Pe zile</h3><span class="k-sub">apasă pe o zi ca s-o vezi separat</span></div><div data-chart></div></section>' : ''),
      split: () => '<div class="mo-row">' +
        '<section class="k-card"><div class="k-card-head"><h3>' + icon('sparkles') + 'Pe categorii</h3></div>' +
          (catKeys.length ? catKeys.map((k) => '<div class="mo-bar"><span>' + esc(K.cats[k]) + '</span><b>' + K.lei(byCat[k]) + '</b><div class="k-bar"><i style="--w:' + (byCat[k] / byCat[catKeys[0]]) * 100 + '%"></i></div></div>').join('') : '<p class="k-muted">Nicio încasare în perioada aleasă.</p>') + '</section>' +
        '<section class="k-card"><div class="k-card-head"><h3>' + icon('users') + 'Cine a făcut tratamentele</h3></div>' +
          (people.length ? '<div class="mo-people-grid">' + people.map((n) => '<div class="mo-person">' + K.avatar(n, 34) + '<div><b>' + esc(n) + '</b><span>' + K.lei(byPerson[n]) + ' · ' + pct(byPerson[n]) + '%</span><div class="k-bar"><i style="--w:' + (byPerson[n] / byPerson[people[0]]) * 100 + '%"></i></div></div></div>').join('') + '</div>' : '<p class="k-muted">-</p>') + '</section>' +
        '</div>',
      list: () => '<section class="k-card"><div class="k-toolbar"><label class="k-search">' + icon('search') + '<input data-q placeholder="Caută clientă sau tratament…" value="' + esc(S.q) + '"></label>' +
        '<div class="k-chips">' + Object.keys(METHODS).map((k) => '<button type="button" class="k-chip' + (S.method === k ? ' is-on' : '') + '" data-method="' + k + '">' + icon(METHODS[k].ic) + METHODS[k].label + '</button>').join('') + '</div>' +
        (S.day ? '<button type="button" class="k-chip is-on" data-act="clear-day">' + esc(K.dateLong(S.day)) + icon('x') + '</button>' : '') + '</div>' +
        '<div data-list></div></section>',
    };

    panel.querySelector('[data-body]').innerHTML =
      '<div class="mo-range"><b>' + esc(rangeLabel()) + '</b><span>' + esc(where) + '</span><span class="k-live">live</span></div>' +
      (kpis.length ? '<div class="mo-kpis k-stagger">' + kpis.map((k) => INC[k].html()).join('') + '</div>' : '') +
      (K.data.isAdmin ? '<div data-pos></div>' : '') +
      blocks.map((b) => BLOCK[b]()).join('');

    const ch = panel.querySelector('[data-chart]');
    if (ch) K.chart(ch, {
      labels: days.map((d) => (days.length > 31 ? K.dateShort(d) : String(Number(d.slice(8, 10))))), height: 210, format: K.lei,
      highlight: S.day ? days.indexOf(S.day) : days.indexOf(K.today()),
      axis: (v) => (v >= 1000 ? (Math.round(v / 100) / 10).toLocaleString('ro-RO') + 'k' : Math.round(v)),
      series: [{ name: 'Încasări', values: daily, color: 'var(--accent)', kind: 'bar' }],
      tip: (i) => '<b>' + esc(K.dateLong(days[i])) + '</b><span>' + K.lei(daily[i]) + ' · ' + K.plural(rows.filter((s) => s.date === days[i]).length, 'încasare', 'încasări') + '</span>',
      onClick: (i) => { S.day = S.day === days[i] ? '' : days[i]; render(); },
    });
    K.countAll(panel);
    renderList();
    if (K.data.isAdmin) paintPos(from, to);
  }

  // ---------------- myPOS (owner only): the card payments on the POS next to the card payments recorded here
  const POS = { key: '', at: 0, data: null, loading: null, r: null, all: false, bal: null, balAt: 0 };
  // the myPOS account's balance: now, straight from the account (myPOS API Gateway keys, the server keeps it a minute),
  // or from the daily statement until those keys are saved
  function loadBal(force) {
    if (!force && POS.bal && Date.now() - POS.balAt < (POS.bal.live ? 60e3 : 5 * 60e3)) return Promise.resolve(false);
    POS.balAt = Date.now();
    return K.api('/api/portal-mypos?view=balance' + (force ? '&fresh=1' : '')).then((b) => { POS.bal = b; return true; }, () => false);
  }
  function balHtml() {
    const b = POS.bal;
    if (!b || !b.connected) return '';
    const acc = (b.accounts || []).filter((a) => !a.reserve && (a.available != null || a.closing != null));
    const reserve = (b.accounts || []).filter((a) => a.reserve && (a.available != null || a.closing != null));
    if (!acc.length) return '<div class="mo-pos-bal is-empty">' + icon('wallet') + '<span>Soldul contului myPOS nu s-a putut citi' + (b.error ? '' : ' încă') + '.</span><button type="button" class="k-btn is-ghost is-sm" data-bal-refresh>' + icon('refresh') + '</button></div>';
    const money = (v, cur) => (Number(v) || 0).toLocaleString('ro-RO', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' ' + (cur && cur !== 'RON' ? cur : 'lei');
    return '<div class="mo-pos-bal">' + acc.map((a) => '<div class="mo-pos-bal-main"><span>' + icon('wallet') + 'Sold cont myPOS' + (acc.length > 1 ? ' · ' + esc(a.name || '••' + a.number) : '') + '</span>' +
        '<b>' + money(a.available != null ? a.available : a.closing, a.currency) + '</b>' +
        '<small>' + (a.live ? 'sold actual · ' + (a.computed ? 'extrasul din ' + esc(K.dateShort(a.computed.from)) + ' + ' + K.plural(a.computed.moves, 'mișcare', 'mișcări') + ' de atunci · ' : '') + 'citit ' + esc(K.ago(b.at)) + (b.error ? ' · nu s-a putut reciti' : '')
          : (a.available != null && a.closing != null && Math.abs(a.available - a.closing) > 0.009 ? 'disponibil · contabil ' + money(a.closing, a.currency) + ' · ' : a.available != null ? 'disponibil · ' : '') + (a.date && a.date !== K.today() ? 'extras din ' + esc(K.dateShort(a.date)) : 'extras de azi')) + '</small></div>').join('') +
      reserve.map((a) => '<div class="mo-pos-bal-res"><span>Rezervă</span><b>' + money(a.available != null ? a.available : a.closing, a.currency) + '</b></div>').join('') +
      (acc.some((a) => !a.live) ? '<button type="button" class="k-btn is-ghost is-sm mo-pos-bal-go" data-goto-int>' + (b.gateway && b.gateway.error ? 'Soldul de acum s-a oprit' : 'Soldul de acum') + icon('arrow') + '</button>' : '') +
      '<button type="button" class="k-btn is-ghost is-sm" data-bal-refresh title="Citește acum">' + icon('refresh') + '</button></div>';
  }
  const cardPart = (s) => (s.method === 'card' ? Number(s.amount || 0) : s.method === 'cash_card' && s.split ? Number(s.split.card || 0) : 0);
  K.on('remote', () => { POS.at = 0; });
  function loadPos(from, to) {
    const key = from + '|' + to;
    if (POS.key === key && Date.now() - POS.at < 60e3) return Promise.resolve(false);
    if (POS.loading && POS.loading.key === key) return POS.loading.p;
    const p = K.api('/api/portal-mypos?' + new URLSearchParams({ view: 'payments', from, to }))
      .then((d) => { POS.data = d; }, () => { POS.data = { error: true }; })
      .then(() => { POS.key = key; POS.at = Date.now(); POS.loading = null; return true; });
    POS.loading = { key, p };
    return p;
  }
  // one POS payment ↔ one card payment recorded here: same day, same sum (50 bani either way), the city of the
  // terminal when it's set, the nearest in time
  function reconcile(rows, d) {
    const devices = d.devices || {};
    const cityOfTid = (tid) => (devices[tid] && devices[tid].city) || '';
    const cover = d.coverFrom ? K.iso(new Date(d.coverFrom)) : '';
    const live = (d.payments || []).filter((p) => !p.cancelled);
    const unknown = live.filter((p) => !cityOfTid(p.tid)).length;
    const pays = live.filter((p) => S.loc === 'all' || cityOfTid(p.tid) === S.loc);
    const pos = pays.filter((p) => p.amount > 0), refunds = pays.filter((p) => p.amount < 0);
    const sales = rows.filter((s) => cardPart(s) > 0 && (!cover || s.date >= cover))
      .map((s) => ({ s, amt: cardPart(s), t: Date.parse(s.createdAt) || Date.parse(s.date + 'T12:00:00') }));
    const used = new Set(), matched = new Map(), posOnly = [];
    pos.slice().sort((a, b) => (a.at < b.at ? -1 : 1)).forEach((p) => {
      const pc = cityOfTid(p.tid), pt = Date.parse(p.at);
      let best = null;
      sales.forEach((x) => {
        if (used.has(x.s.id) || x.s.date !== p.day || Math.abs(x.amt - p.amount) > 0.5 || (pc && x.s.location && x.s.location !== pc)) return;
        const dt = Math.abs(x.t - pt);
        if (!best || dt < best.dt) best = { x, dt };
      });
      if (best) { used.add(best.x.s.id); matched.set(best.x.s.id, p); } else posOnly.push(p);
    });
    return {
      pos, refunds, unknown, matched, posOnly, portalOnly: sales.filter((x) => !used.has(x.s.id)),
      posTotal: pos.reduce((a, p) => a + p.amount, 0), portalCard: sales.reduce((a, x) => a + x.amt, 0), cover,
    };
  }
  const posTime = (p) => { const t = new Date(p.at); return K.pad(t.getHours()) + ':' + K.pad(t.getMinutes()); };
  function posHtml(r, d) {
    const devices = d.devices || {};
    const diff = Math.round((r.posTotal - r.portalCard) * 100) / 100;
    const ok = !r.posOnly.length && !r.portalOnly.length;
    const dayTxt = (day) => (K.relDay(day) === K.dateLong(day) ? K.dateShort(day) : K.relDay(day));
    const cap = (list) => (POS.all ? list : list.slice(0, 6));
    const posRow = (p) => '<div class="k-row"><span class="k-icon-chip" style="color:var(--accent)">' + icon('card') + '</span><div class="k-row-main"><div class="k-row-title">' + esc(dayTxt(p.day) + ', ' + posTime(p)) + '</div>' +
      '<div class="k-row-sub">' + esc([devices[p.tid] && devices[p.tid].city, p.pan ? 'card ••' + p.pan : '', 'TID ' + p.tid].filter(Boolean).join(' · ')) + '</div></div><div class="k-row-end"><span class="k-amount">' + K.lei(p.amount, 2) + '</span></div></div>';
    const saleRow = (x) => '<div class="k-row is-click" data-pay="' + esc(x.s.id) + '"><span class="k-icon-chip" style="color:var(--warn)">' + icon('receipt') + '</span><div class="k-row-main"><div class="k-row-title">' + esc(x.s.client || '-') + '</div>' +
      '<div class="k-row-sub">' + esc([dayTxt(x.s.date), x.s.treatment, S.loc === 'all' ? x.s.location : ''].filter(Boolean).join(' · ')) + '</div></div><div class="k-row-end"><span class="k-amount">' + K.lei(x.amt, 2) + '</span></div></div>';
    const more = (list) => (list.length > 6 ? '<button type="button" class="k-btn is-ghost is-sm" data-pos-all>' + (POS.all ? 'Mai puține' : 'Vezi toate (' + list.length + ')') + '</button>' : '');
    return '<section class="k-card mo-pos"><div class="k-card-head"><h3>' + icon('card') + 'POS myPOS</h3><span class="k-sub">' + (d.syncedAt ? 'citit ' + esc(K.ago(d.syncedAt)) : '') + '</span></div>' +
      balHtml() +
      '<div class="mo-pos-sum">' +
        '<div><span>Pe POS</span><b>' + K.lei(r.posTotal) + '</b><small>' + K.plural(r.pos.length, 'plată', 'plăți') + (r.pos.length ? ' · bon mediu ' + K.lei(r.posTotal / r.pos.length) : '') + '</small></div>' +
        '<div><span>În portal, pe card</span><b>' + K.lei(r.portalCard) + '</b><small>' + K.plural(r.matched.size + r.portalOnly.length, 'încasare', 'încasări') + '</small></div>' +
        '<div class="' + (Math.abs(diff) < 0.01 && ok ? 'is-good' : 'is-warn') + '"><span>Diferență</span><b>' + (diff > 0 ? '+' : '') + K.lei(diff) + '</b><small>' + (ok ? (r.pos.length ? 'totul se potrivește' : 'nicio plată pe card') : K.plural(r.posOnly.length + r.portalOnly.length, 'plată nepotrivită', 'plăți nepotrivite')) + '</small></div>' +
      '</div>' +
      posDevsHtml(r, devices) +
      (r.unknown && S.loc !== 'all' ? '<p class="mo-pos-note">' + icon('info') + K.plural(r.unknown, 'plată vine', 'plăți vin') + ' de pe un aparat fără oraș. <button type="button" class="k-btn is-ghost is-sm" data-goto-int>Alege orașul aparatelor</button></p>' : '') +
      (r.posOnly.length ? '<h4 class="mo-pos-h">Pe POS, dar nu în portal · ' + r.posOnly.length + '</h4><div class="k-list">' + cap(r.posOnly).map(posRow).join('') + '</div>' + more(r.posOnly) : '') +
      (r.portalOnly.length ? '<h4 class="mo-pos-h">În portal pe card, dar nu pe POS · ' + r.portalOnly.length + '</h4><div class="k-list">' + cap(r.portalOnly).map(saleRow).join('') + '</div>' + more(r.portalOnly) : '') +
      (r.refunds.length ? '<h4 class="mo-pos-h">Returnări pe POS · ' + r.refunds.length + '</h4><div class="k-list">' + r.refunds.map(posRow).join('') + '</div>' : '') +
      (ok && r.pos.length ? '<p class="mo-pos-ok">' + icon('checkCircle') + 'Fiecare plată de pe POS are încasarea ei în portal.</p>' : '') +
      '</section>';
  }
  // each POS of the period: payments, total, the average payment; on more than one day, payments per day
  function posDevsHtml(r, devices) {
    if (!r.pos.length) return '';
    const by = new Map();
    r.pos.forEach((p) => { const x = by.get(p.tid) || { tid: p.tid, n: 0, sum: 0, days: new Set() }; x.n++; x.sum += p.amount; x.days.add(p.day); by.set(p.tid, x); });
    const days = new Set(r.pos.map((p) => p.day)).size;
    const rows = Array.from(by.values()).sort((a, b) => b.sum - a.sum);
    const cell = (v, l) => '<div class="mo-pos-dev-n"><b>' + v + '</b><small>' + l + '</small></div>';
    return '<div class="mo-pos-devs">' + rows.map((x) => {
      const dv = devices[x.tid] || {};
      return '<div class="mo-pos-dev"><span class="mo-pos-dev-ic">' + icon('card') + '</span>' +
        '<div class="mo-pos-dev-name"><b>' + esc((dv.model || 'POS') + (dv.city ? ' · ' + dv.city : '')) + '</b><small>TID ' + esc(x.tid) + '</small></div>' +
        '<div class="mo-pos-dev-nums">' + cell(K.num(x.n), x.n === 1 ? 'plată' : 'plăți') + cell(K.lei(x.sum), 'total') + cell(K.lei(x.sum / x.n), 'bon mediu') +
          (days > 1 ? cell(K.num(Math.round((x.n / days) * 10) / 10), 'pe zi') : '') + '</div></div>';
    }).join('') + '</div>';
  }
  function paintPos(from, to) {
    const draw = () => {
      const slot = panel && panel.querySelector('[data-pos]');
      if (!slot) return;
      const d = POS.data;
      if (!d || POS.key !== from + '|' + to) return;
      if (d.error) { slot.innerHTML = '<p class="k-muted mo-pos-err">Nu am putut citi plățile de pe POS.</p>'; POS.r = null; return; }
      if (!d.connected) { slot.innerHTML = ''; POS.r = null; return; }
      POS.r = reconcile(periodRows(), d);
      slot.innerHTML = posHtml(POS.r, d);
      const all = slot.querySelectorAll('[data-pos-all]');
      all.forEach((b) => b.addEventListener('click', () => { POS.all = !POS.all; draw(); }));
      slot.querySelectorAll('[data-goto-int]').forEach((x) => x.addEventListener('click', () => K.go('integrari')));
      const br = slot.querySelector('[data-bal-refresh]');
      if (br) br.addEventListener('click', () => K.busy(br, async () => { await loadBal(true); draw(); }));
      renderList();
    };
    draw();
    loadPos(from, to).then((changed) => { if (changed) draw(); });
    loadBal(false).then((changed) => { if (changed) draw(); });
  }

  // the owner sees on each card payment whether it is on the POS too
  function posTag(s) {
    const r = POS.r;
    if (!r || !cardPart(s) || (r.cover && s.date < r.cover)) return '';
    return r.matched.has(s.id) ? '<span class="k-tag is-good">' + icon('check') + 'POS</span>' : '<span class="k-tag is-warn">fără POS</span>';
  }
  function filtered() {
    const q = K.norm(S.q);
    return periodRows().filter((s) => (!S.day || s.date === S.day) && (!S.method || s.method === S.method) &&
      (!q || K.norm(s.client + ' ' + s.treatment + ' ' + K.catLabel(s) + ' ' + (s.performedByName || '')).includes(q)));
  }
  function renderList() {
    const el = panel && panel.querySelector('[data-list]');
    if (!el) return;
    panel.querySelectorAll('.k-chip[data-method]').forEach((b) => b.classList.toggle('is-on', b.dataset.method === S.method));
    const rows = filtered().slice().sort((a, b) => (a.date !== b.date ? (a.date < b.date ? 1 : -1) : (a.createdAt < b.createdAt ? 1 : -1)));
    if (!rows.length) {
      el.innerHTML = K.empty('receipt', S.q || S.day || S.method ? 'Nimic pentru filtrul ales' : 'Nicio încasare în perioada aleasă',
        S.q || S.day || S.method ? 'Schimbă filtrul sau caută altceva.' : 'Încasarea pornește dintr-o programare: „Încasează” în Calendar sau butonul de mai jos.',
        '<button type="button" class="k-btn is-primary" data-act="new">' + icon('plus') + 'Încasare nouă</button>');
      return;
    }
    const days = [];
    rows.forEach((s) => { const d = days[days.length - 1]; if (d && d.date === s.date) d.rows.push(s); else days.push({ date: s.date, rows: [s] }); });
    el.innerHTML = '<div class="mo-total">' + K.plural(rows.length, 'încasare', 'încasări') + ' · <b>' + K.lei(sum(rows)) + '</b></div>' +
      days.map((d) => '<div class="k-day"><span>' + esc(K.relDay(d.date) === K.dateLong(d.date) ? K.dateLong(d.date) : K.relDay(d.date) + ' · ' + K.dateShort(d.date)) + '</span><b>' + K.lei(sum(d.rows)) + '</b></div>' +
        '<div class="k-list">' + d.rows.map((s) => {
          const mm = METHODS[s.method] || METHODS.card;
          return '<div class="k-row is-click" data-pay="' + esc(s.id) + '"><span class="k-icon-chip" style="color:' + mm.color + '">' + icon(mm.ic) + '</span>' +
            '<div class="k-row-main"><div class="k-row-title">' + esc(s.client || '-') + '</div><div class="k-row-sub">' + esc(s.treatment) + (K.catLabel(s) ? ' · ' + esc(K.catLabel(s)) : '') +
            (s.performedByName && s.performedByName !== '-' ? ' · ' + esc(s.performedByName) : '') + (S.loc === 'all' && s.location ? ' · ' + esc(s.location) : '') + '</div></div>' +
            '<div class="k-row-end">' + (s.upsell ? '<span class="k-tag is-good">+' + K.lei(s.upsell) + ' upsell</span>' : '') + (s.packageTotal ? '<span class="k-tag is-warn" title="Pachet plătit în tranșe">pachet ' + K.lei(s.packageTotal) + '</span>' : '') + (s.toDue ? '<span class="k-tag is-info">din restul pachetului</span>' : '') + posTag(s) + '<span class="k-tag">' + mm.label + '</span><span class="k-amount">' + K.lei(s.amount, 2) + '</span></div></div>';
        }).join('') + '</div>').join('');
  }

  // ---------------- new payment: appointment → method → who did it
  async function openNew(pre) {
    pre = pre || {};
    // Step 1 = city (Timișoara / Arad) → day (today by default) → that day's unpaid appointments in a dropdown.
    const st = { list: null, apptId: pre.appointmentId || '', method: 'card', who: '', day: K.today(), upsell: false, pkg: '', dueId: '', dues: {},
      city: K.data && K.data.city ? K.data.city : (K.data && LOCS.includes(K.data.me.location) ? K.data.me.location : LOCS[0]) };
    const d = K.drawer({
      title: 'Încasare', icon: 'wallet', width: 600, focus: false,
      subtitle: 'Alegi programarea, cum a plătit și cine a făcut tratamentul.',
      body: '<div data-pay-body><div class="k-skel" style="height:220px"></div></div>',
      footer: '<button type="button" class="k-btn" data-cancel>Renunță</button><span class="k-grow"></span><button type="button" class="k-btn is-accent is-lg" data-save disabled>' + icon('check') + '<span data-save-label>Încasează</span></button>',
      onMount(el) {
        el.querySelector('[data-cancel]').addEventListener('click', () => d.close());
        const body = el.querySelector('.k-dbody'); // the drawer shell is shared by every drawer: listen on its body only
        body.addEventListener('click', onDrawerClick);
        body.addEventListener('input', onDrawerInput);
        body.addEventListener('change', onDrawerChange);
        el.querySelector('[data-save]').addEventListener('click', (e) => K.busy(e.currentTarget, save));
      },
    });
    const root = () => d.el.querySelector('[data-pay-body]');
    try {
      const j = await K.api('/api/portal-appointments', { action: 'unpaid' });
      st.list = j.appointments || [];
      st.dues = j.dues || {}; // what her clients still owe for packages paid in parts
    } catch (e) { root().innerHTML = K.empty('alert', 'Nu am putut încărca programările', 'Verifică conexiunea și reîncearcă.'); return; }
    const appt = () => st.list.find((a) => a.id === st.apptId);
    function whoOk() { return cosmeticians(st.city).some((x) => x.id === st.who); }
    if (st.apptId && !appt()) st.apptId = '';
    if (appt()) { st.who = appt().cosmeticianId || ''; st.city = appt().location || st.city; st.day = appt().date || st.day; }
    paint();

    function apptCard(a) {
      return '<div class="pay-appt is-on"><span class="pay-time"><b>' + esc(a.time || '-') + '</b><small>' + esc(K.relDay(a.date) === K.dateLong(a.date) ? K.dateShort(a.date) : K.relDay(a.date)) + '</small></span>' +
        '<span class="pay-main"><b>' + esc(a.clientName || '-') + '</b><small>' + esc(a.treatment || '') + ' · ' + esc(a.location) + (a.cosmeticianName ? ' · ' + esc(a.cosmeticianName) : '') + '</small></span>' +
        '<span class="pay-amt">' + (a.amount ? K.lei(a.amount) : '<em>fără sumă</em>') + '</span></div>';
    }
    function optText(x) { return [x.time || 'fără oră', x.clientName || '-', x.treatment || '', x.cosmeticianName || '', x.amount ? K.lei(x.amount) : 'fără sumă'].filter(Boolean).join(' · '); }
    function step1Html(a) {
      const today = K.today(), yest = K.addDays(today, -1);
      const dayList = st.list.filter((x) => x.location === st.city && x.date === st.day).sort((x, y) => (x.time || '99').localeCompare(y.time || '99'));
      // other days in this city that still have unpaid appointments (newest first)
      const other = {};
      st.list.forEach((x) => { if (x.location === st.city && x.date !== st.day) other[x.date] = (other[x.date] || 0) + 1; });
      const otherDays = Object.keys(other).sort().reverse().slice(0, 8);
      const dayName = st.day === today ? 'azi' : st.day === yest ? 'ieri' : K.dateLong(st.day).toLowerCase();
      return '<section class="pay-step' + (a ? ' is-done' : '') + '"><h4><i>' + (a ? icon('check') : '1') + '</i>Ce programare încasezi?</h4>' +
        '<div class="pay-filters">' + (K.data.city ? '' : '<div class="pay-filter"><span>Oraș</span>' + K.seg('paycity', LOCS.map((l) => [l, l, 'pin']), st.city, 'is-big') + '</div>') +
          '<div class="pay-filter"><span>Ziua</span><div class="pay-days">' +
            '<button type="button" data-day="' + today + '" class="' + (st.day === today ? 'is-on' : '') + '">Azi</button>' +
            '<button type="button" data-day="' + yest + '" class="' + (st.day === yest ? 'is-on' : '') + '">Ieri</button>' +
            '<input type="date" data-day-input max="' + today + '" value="' + esc(st.day) + '" aria-label="Alege ziua"></div></div></div>' +
        '<label class="k-field pay-select"><span>Programările din ' + esc(st.city) + ', ' + esc(dayName) + '</span>' +
          '<select data-appt-select' + (dayList.length ? '' : ' disabled') + '>' +
            (dayList.length ? '<option value="">- alege programarea (' + dayList.length + ') -</option>' + dayList.map((x) => '<option value="' + esc(x.id) + '"' + (x.id === st.apptId ? ' selected' : '') + '>' + esc(optText(x)) + '</option>').join('')
              : '<option value="">Nicio programare neîncasată în ziua asta</option>') +
          '</select></label>' +
        (!dayList.length && otherDays.length ? '<div class="pay-other"><span>Mai sunt neîncasate în ' + esc(st.city) + ':</span>' + otherDays.map((dd) => '<button type="button" class="k-chip" data-day="' + dd + '">' + esc(dd === today ? 'Azi' : dd === yest ? 'Ieri' : K.dateShort(dd)) + '<span>' + other[dd] + '</span></button>').join('') + '</div>' : '') +
        (a ? apptCard(a) : '') + '</section>';
    }
    function paint() {
      const a = appt();
      if (!st.list.length) {
        root().innerHTML = K.empty('calendar', 'Nicio programare de încasat', 'Încasarea pornește dintr-o programare. Programările de azi și din ultimele 30 de zile care nu sunt plătite apar aici.',
          '<button type="button" class="k-btn is-primary" data-go-cal>' + icon('calendar') + 'Deschide Calendarul</button>');
        return;
      }
      const step1 = step1Html(a);
      if (!a) { root().innerHTML = step1; updateSave(); return; }
      const booked = Number(a.amount) || 0;
      // only the cosmeticians of the chosen city
      const team = cosmeticians(st.city);
      const owed = (a.clientId && st.dues[a.clientId]) || [];
      root().innerHTML = step1 +
        (owed.length ? '<section class="pay-step pay-due"><h4><i>' + icon('wallet') + '</i>Mai are de plătit dintr-un pachet</h4>' + owed.map((o) =>
          '<label class="pay-check"><input type="checkbox" data-due="' + esc(o.id) + '" data-rest="' + o.rest + '"' + (st.dueId === o.id ? ' checked' : '') + '><span class="pay-box">' + icon('check') + '</span>' +
            '<span><b>Rest de achitat: ' + K.lei(o.rest, 2) + '</b><small>' + esc(o.what || 'Pachet') + ' · plătit ' + K.lei(o.paid, 2) + ' din ' + K.lei(o.total, 2) + '. Bifează dacă plata asta e din rest.</small></span></label>').join('') + '</section>' : '') +
        '<section class="pay-step"><h4><i>2</i>Cum a plătit?</h4><div class="pay-methods">' + Object.keys(METHODS).map((k) =>
          '<button type="button" data-m="' + k + '" class="' + (st.method === k ? 'is-on' : '') + '"><span>' + icon(METHODS[k].ic) + '</span>' + METHODS[k].label + '</button>').join('') + '</div>' +
          '<div class="pay-amounts">' +
            '<label class="k-field"><span>Sumă încasată</span><div class="k-money"><input data-amount type="number" inputmode="decimal" min="0" step="1" value="' + esc(st.amount != null ? st.amount : booked || '') + '" placeholder="0"></div></label>' +
            (st.method === 'cash_card' ? '<div class="pay-split"><label class="k-field"><span>Din care cash</span><div class="k-money"><input data-cash type="number" inputmode="decimal" min="0" step="1" value="' + esc(st.cash || '') + '"></div></label>' +
              '<label class="k-field"><span>Din care card</span><div class="k-money"><input data-card type="number" inputmode="decimal" min="0" step="1" value="' + esc(st.card || '') + '"></div></label></div>' : '') +
            '<div class="pay-note" data-note></div></div></section>' +
        '<section class="pay-step"><h4><i>3</i>Cine a făcut tratamentul?</h4><div class="pay-people">' +
          team.map((x) => '<button type="button" data-who="' + esc(x.id) + '" class="' + (st.who === x.id ? 'is-on' : '') + '">' + K.avatar(x.name, 30) + '<span><b>' + esc(x.name) + '</b><small>' + esc(x.location) + '</small></span></button>').join('') +
          (!team.length ? '<p class="k-muted">Nicio cosmeticiană activă în ' + esc(st.city) + ' (Echipa).</p>' : '') + '</div></section>' +
        '<section class="pay-step pay-ups' + (st.upsell ? ' is-on' : '') + '"><h4><i>4</i>A vândut ceva în plus?</h4>' +
          '<label class="pay-check"><input type="checkbox" data-upsell' + (st.upsell ? ' checked' : '') + '><span class="pay-box">' + icon('check') + '</span>' +
            '<span><b>Upsell efectuat</b><small>Bifează dacă a vândut un pachet, o zonă în plus sau alt tratament.</small></span></label>' +
          '<div class="pay-pkg"><label class="k-field"><span>Valoarea întregului pachet (dacă plătește în tranșe)</span><div class="k-money"><input data-pkg type="number" inputmode="decimal" min="0" step="1" value="' + esc(st.pkg) + '" placeholder="ex. 3000"></div></label>' +
          '<div class="pay-note" data-pkg-rest></div></div>' +
        '</section>';
      note(); pkgNote(); updateSave();
    }
    // the rest of a package paid in parts, as the desk types its value
    function pkgNote() {
      const box = d.el.querySelector('[data-pkg-rest]');
      if (!box) return;
      const { amt, pkg } = vals();
      box.innerHTML = !pkg ? '' : pkg < amt ? '<span class="pay-warn">' + icon('alert') + 'Pachetul nu poate valora mai puțin decât suma încasată.</span>'
        : pkg > amt ? '<span>Rest de achitat: <b>' + K.lei(pkg - amt, 2) + '</b>. Apare la următoarele ei încasări.</span>' : '<span>Pachetul e plătit integral acum.</span>';
    }
    function vals() {
      const a = appt();
      const amt = Number((d.el.querySelector('[data-amount]') || {}).value) || 0;
      const cash = Number((d.el.querySelector('[data-cash]') || {}).value) || 0;
      const card = Number((d.el.querySelector('[data-card]') || {}).value) || 0;
      const ups = st.upsell ? amt : 0; // "Upsell efectuat" = the whole amount paid is the upsell
      const pkg = st.upsell ? Number(st.pkg) || 0 : 0; // a package paid in parts: its whole value
      return { a, amt, cash, card, ups, pkg };
    }
    function note() {
      const box = d.el.querySelector('[data-note]');
      if (!box) return;
      const { a, amt, cash, card } = vals();
      const booked = Number(a.amount) || 0;
      const lines = [];
      if (booked) lines.push('Programat: <b>' + K.lei(booked) + '</b>');
      if (booked && amt && amt < booked) lines.push('<span class="pay-warn">' + icon('alert') + 'Mai puțin decât suma programării.</span>');
      if (st.method === 'cash_card' && amt && Math.abs(cash + card - amt) > 0.01) lines.push('<span class="pay-warn">' + icon('alert') + 'Cash + card = ' + K.lei(cash + card) + ', trebuie ' + K.lei(amt) + '.</span>');
      box.innerHTML = lines.join('');
    }
    function ready() {
      const { a, amt, cash, card } = vals();
      if (!a || !(amt > 0) || !st.who || !whoOk()) return false;
      if (st.upsell && Number(st.pkg) > 0 && Number(st.pkg) < amt) return false;
      if (st.method === 'cash_card' && (!(cash > 0) || !(card > 0) || Math.abs(cash + card - amt) > 0.01)) return false;
      return true;
    }
    function updateSave() {
      const b = d.el.querySelector('[data-save]');
      const { amt } = vals();
      b.disabled = !ready();
      d.el.querySelector('[data-save-label]').textContent = amt > 0 ? 'Încasează ' + K.lei(amt, 2) : 'Încasează';
    }
    function onDrawerClick(e) {
      if (e.target.closest('[data-go-cal]')) { d.close(); K.go('programari'); return; }
      const dy = e.target.closest('[data-day]');
      if (dy) { setDay(dy.dataset.day); return; }
      const m = e.target.closest('[data-m]');
      if (m) { keepInputs(); st.method = m.dataset.m; return paint(); }
      const w = e.target.closest('[data-who]');
      if (w) { st.who = w.dataset.who; d.el.querySelectorAll('[data-who]').forEach((x) => x.classList.toggle('is-on', x === w)); note(); updateSave(); }

    }
    // A different city or day empties the choice unless the chosen appointment still matches.
    function setDay(day) {
      if (!day) return;
      st.day = day;
      const a = appt();
      if (a && a.date !== st.day) st.apptId = '';
      paint();
    }
    function onDrawerChange(e) {
      const t = e.target;
      if (t.name === 'paycity') {
        st.city = t.value;
        const a = appt();
        if (a && a.location !== st.city) st.apptId = '';
        return paint();
      }
      if (t.matches('[data-day-input]')) return setDay(t.value);
      if (t.matches('[data-upsell]')) {
        st.upsell = t.checked;
        t.closest('.pay-ups').classList.toggle('is-on', st.upsell);
        pkgNote(); updateSave();
        return;
      }
      // paying down a package: the sum becomes what is left of it (the desk can change it)
      if (t.matches('[data-due]')) {
        st.dueId = t.checked ? t.dataset.due : '';
        d.el.querySelectorAll('[data-due]').forEach((x) => { if (x !== t) x.checked = false; });
        const amt = d.el.querySelector('[data-amount]');
        if (t.checked && amt) { amt.value = t.dataset.rest; keepInputs(); }
        note(); pkgNote(); updateSave();
        return;
      }
      if (t.matches('[data-appt-select]')) {
        st.apptId = t.value; st.amount = null; st.cash = ''; st.card = ''; st.upsell = false; st.pkg = ''; st.dueId = '';
        st.who = (appt() && appt().cosmeticianId) || '';
        return paint();
      }
    }
    function keepInputs() {
      const amt = d.el.querySelector('[data-amount]'), c1 = d.el.querySelector('[data-cash]'), c2 = d.el.querySelector('[data-card]');
      if (amt) st.amount = amt.value;
      if (c1) st.cash = c1.value;
      if (c2) st.card = c2.value;
    }
    function onDrawerInput(e) {
      // cash + card: typing one side fills the other with the rest
      const amt = Number((d.el.querySelector('[data-amount]') || {}).value) || 0;
      if (e.target.matches('[data-cash]') && amt) d.el.querySelector('[data-card]').value = Math.max(0, Math.round((amt - (Number(e.target.value) || 0)) * 100) / 100) || '';
      if (e.target.matches('[data-card]') && amt) d.el.querySelector('[data-cash]').value = Math.max(0, Math.round((amt - (Number(e.target.value) || 0)) * 100) / 100) || '';
      if (e.target.matches('[data-pkg]')) st.pkg = e.target.value;
      keepInputs(); note(); pkgNote(); updateSave();
    }
    async function save() {
      if (!ready()) return;
      const { a, amt, cash, card, ups, pkg } = vals();
      try {
        const r = await K.api('/api/portal-sale', { source: 'incasare', appointmentId: a.id, method: st.method, amount: amt, cashAmount: cash, cardAmount: card, performedBy: st.who, upsell: st.upsell, upsellAmount: ups,
          packageTotal: pkg > amt ? pkg : 0, dueId: st.dueId || '' });
        d.close();
        const dueTxt = r.due ? (r.due.rest > 0 ? ' Rest de achitat: ' + K.lei(r.due.rest, 2) + '.' : st.dueId ? ' Pachetul e achitat integral.' : '') : '';
        K.ui().toast('Încasat ' + K.lei(amt, 2) + ' · ' + a.clientName + (r.upsell ? '. Comision ' + K.lei(r.upsell.commission, 2) + '.' : '') + dueTxt, 'success');
        if (!(a.date >= range()[0] && a.date <= range()[1])) { S.period = a.date === K.today() ? 'today' : 'month'; }
        K.reload();
        K.emit('remote');
      } catch (err) {
        const msg = { invalid_package: 'Pachetul nu poate valora mai puțin decât suma încasată.', invalid_due: 'Restul pachetului nu mai există. Redeschide încasarea.', invalid_upsell: 'Valoarea upsell-ului trebuie să fie între 1 leu și suma încasată.', already_paid: 'Programarea e deja încasată.', missing_performer: 'Alege cine a făcut tratamentul.', invalid_split: 'Cash + card trebuie să dea suma totală.', appointment_not_found: 'Programarea nu mai există.' }[err.code];
        K.ui().toast(msg || K.errText(err), 'error');
      }
    }
  }

  // ---------------- view / correct (owner) one payment
  function openPayment(id) {
    const s = (K.data.incasari || []).find((x) => x.id === id);
    if (!s) return;
    const m = METHODS[s.method] || METHODS.card;
    const admin = K.data.isAdmin;
    const emp = cosmeticians();
    const d = K.drawer({
      title: K.lei(s.amount, 2), lead: '<span class="k-dicon" style="background:' + m.color + '">' + icon(m.ic) + '</span>',
      subtitle: esc(s.client) + ' · ' + esc(K.dateLong(s.date)) + (s.location ? ' · ' + esc(s.location) : ''),
      body: '<dl class="k-kv"><dt>Clientă</dt><dd>' + esc(s.client) + '</dd><dt>Tratament</dt><dd>' + esc(s.treatment) + '</dd><dt>Categorie</dt><dd>' + esc(K.catLabel(s) || '-') + '</dd>' +
          '<dt>Plată</dt><dd>' + esc(methodText(s)) + '</dd>' + (s.bookedAmount ? '<dt>Programat</dt><dd>' + K.lei(s.bookedAmount) + '</dd>' : '') +
          (s.upsell ? '<dt>Upsell</dt><dd>Da · ' + K.lei(s.upsell) + ' (comisionul, dacă e, apare în Salariu)</dd>' : '') +
          '<dt>A făcut tratamentul</dt><dd>' + esc(s.performedByName || '-') + '</dd><dt>Înregistrată de</dt><dd>' + esc(s.employeeName || '-') + (s.createdAt ? ' · ' + esc(K.ago(s.createdAt)) : '') + '</dd></dl>' +
        (admin ? '<section class="k-section"><h4>' + icon('pen') + 'Corectează</h4><form class="k-form" data-form>' +
          K.field('Sumă', '<div class="k-money"><input name="amount" type="number" min="0" step="0.01" value="' + esc(s.amount) + '"></div>') +
          K.field('Data', '<input name="date" type="date" value="' + esc(s.date) + '">') +
          K.field('Metodă', K.seg('method', Object.keys(METHODS).map((k) => [k, METHODS[k].label, METHODS[k].ic]), s.method, 'is-big'), 'full') +
          '<div class="pay-split full" data-split' + (s.method === 'cash_card' ? '' : ' hidden') + '><label class="k-field"><span>Cash</span><input name="cashAmount" type="number" min="0" step="0.01" value="' + esc(s.split ? s.split.cash : '') + '"></label>' +
          '<label class="k-field"><span>Card</span><input name="cardAmount" type="number" min="0" step="0.01" value="' + esc(s.split ? s.split.card : '') + '"></label></div>' +
          K.field('Categorie', K.catPicker(K.catsOf(s)), 'full') +
          K.field('A făcut tratamentul', '<select name="performedBy"><option value="">-</option>' + K.options(emp.map((e) => [e.id, e.name + ' · ' + e.location]), s.performedBy || '') + '</select>', 'full') +
          '<label class="pay-check full"><input type="checkbox" name="upsell" value="true"' + (s.upsell ? ' checked' : '') + '><span class="pay-box">' + icon('check') + '</span><span><b>Upsell efectuat</b><small>Toată suma e upsell. Comisionul se recalculează cât timp nu e aprobat.</small></span></label>' +
          '</form></section>'
          : '<div class="mo-note">' + icon('info') + 'Ai văzut o greșeală? Spune ce trebuie corectat și se rezolvă.</div>'),
      footer: admin ? '<button type="button" class="k-btn is-danger is-sm" data-del>' + icon('trash') + 'Șterge</button><span class="k-grow"></span><button type="button" class="k-btn is-primary" data-save>' + icon('check') + 'Salvează</button>' : '',
      onMount(el) {
        if (!admin) return;
        const f = el.querySelector('[data-form]');
        f.addEventListener('change', (e) => { if (e.target.name === 'method') el.querySelector('[data-split]').hidden = e.target.value !== 'cash_card'; });
        el.querySelector('[data-save]').addEventListener('click', (e) => K.busy(e.currentTarget, async () => {
          const v = K.formValues(f);
          try {
            const upsell = !!f.querySelector('input[name=upsell]').checked;
            await K.api('/api/portal-incasari', Object.assign({ action: 'update', id: s.id }, v, { amount: Number(v.amount), cashAmount: Number(v.cashAmount) || 0, cardAmount: Number(v.cardAmount) || 0, categories: String(v.categories || '').split(',').filter(Boolean), upsell, upsellAmount: upsell ? Number(v.amount) || 0 : 0 }));
            d.close(); K.ui().toast('Încasare corectată.', 'success'); K.reload();
          } catch (err) { K.ui().toast(err.code === 'invalid_split' ? 'Cash + card trebuie să dea suma totală.' : err.code === 'invalid_upsell' ? 'Valoarea upsell-ului trebuie să fie între 1 leu și suma încasată.' : K.errText(err), 'error'); }
        }));
        el.querySelector('[data-del]').addEventListener('click', async () => {
          if (!(await K.ui().confirm({ title: 'Ștergi încasarea?', message: K.lei(s.amount, 2) + ' · ' + s.client + ' dispare din totaluri, iar programarea redevine neîncasată.', confirmText: 'Șterge', danger: true }))) return;
          try { await K.api('/api/portal-incasari', { action: 'delete', id: s.id }); d.close(); K.ui().toast('Încasare ștearsă.', 'success'); K.reload(); }
          catch (err) { K.ui().toast(K.errText(err), 'error'); }
        });
      },
    });
  }

  function exportCsv() {
    const rows = filtered().slice().sort((a, b) => (a.date < b.date ? -1 : 1));
    if (!rows.length) { K.ui().toast('Nimic de exportat pentru filtrul ales.', 'info'); return; }
    const [a, b] = range();
    K.csv('incasari-' + a + (a !== b ? '_' + b : '') + (S.loc !== 'all' ? '-' + K.norm(S.loc) : '') + '.csv', [['Data', 'Oraș', 'Clientă', 'Tratament', 'Categorie', 'Sumă (lei)', 'Metodă', 'Cash', 'Card', 'Upsell', 'A făcut tratamentul', 'Înregistrat de']]
      .concat(rows.map((s) => [s.date, s.location || '', s.client, s.treatment, K.catLabel(s), String(s.amount).replace('.', ','), (METHODS[s.method] || {}).label || s.method,
        s.split ? String(s.split.cash).replace('.', ',') : s.method === 'cash' ? String(s.amount).replace('.', ',') : '', s.split ? String(s.split.card).replace('.', ',') : s.method === 'card' ? String(s.amount).replace('.', ',') : '',
        s.upsell ? String(s.upsell).replace('.', ',') : '', s.performedByName || '', s.employeeName || ''])));
  }
  function printList() {
    const rows = filtered().slice().sort((a, b) => (a.date < b.date ? -1 : 1));
    const w = window.open('', '_blank', 'width=900,height=700');
    if (!w) { K.ui().toast('Permite ferestrele pop-up ca să printezi.', 'error'); return; }
    const m = byMethod(rows);
    const head = 'Card: ' + K.lei(m.card, 2) + ' · Cash: ' + K.lei(m.cash, 2) + ' · Transfer: ' + K.lei(m.transfer, 2);
    w.document.write('<!doctype html><html lang="ro"><head><meta charset="utf-8"><title>Încasări ' + esc(rangeLabel()) + '</title><style>' +
      'body{font:13px/1.45 Inter,system-ui,sans-serif;color:#111;margin:32px}h1{font-size:20px;margin:0 0 4px}p{color:#555;margin:0 0 18px}' +
      'table{width:100%;border-collapse:collapse}th,td{text-align:left;padding:7px 8px;border-bottom:1px solid #ddd}th{font-size:11px;text-transform:uppercase;letter-spacing:.05em;color:#666}' +
      'td.n{text-align:right;font-variant-numeric:tabular-nums}tfoot td{font-weight:700;border-top:2px solid #111}</style></head><body>' +
      '<h1>Centrul360 · Încasări ' + esc(S.day ? K.dateLong(S.day) : rangeLabel()) + ' · ' + esc(S.loc === 'all' ? 'Timișoara + Arad' : S.loc) + '</h1><p>' + esc(head) + '</p><table><thead><tr><th>Data</th><th>Clientă</th><th>Tratament</th><th>Plată</th><th>A făcut</th><th class="n">Sumă</th></tr></thead><tbody>' +
      rows.map((s) => '<tr><td>' + esc(K.dateShort(s.date)) + '</td><td>' + esc(s.client) + '</td><td>' + esc(s.treatment) + '</td><td>' + esc(methodText(s)) + '</td><td>' + esc(s.performedByName || '') + '</td><td class="n">' + K.lei(s.amount, 2) + '</td></tr>').join('') +
      '</tbody><tfoot><tr><td colspan="5">Total · ' + rows.length + ' încasări</td><td class="n">' + K.lei(sum(rows), 2) + '</td></tr></tfoot></table>' +
      '<script>window.onload=function(){window.print();}<\/script></body></html>');
    w.document.close();
  }

  K.section('incasari', { mount: mountIncasari, show() { K.prefs.load().then(render); }, data() { if (panel && K.isActive('incasari')) render(); } });
  K.on('incasari:new', (pre) => openNew(pre || {}));
  K.on('incasari:day', (d) => {
    if (!d || !panel) return;
    S.period = 'custom'; S.from = d.slice(0, 8) + '01'; S.to = K.today(); S.day = d;
    panel.querySelectorAll('[data-period]').forEach((b) => b.classList.toggle('is-on', b.dataset.period === 'custom'));
    panel.querySelector('[data-custom]').hidden = false;
    panel.querySelector('[data-from]').value = S.from; panel.querySelector('[data-to]').value = S.to;
    render();
  });

  // =====================================================================================
  // COMISIONUL MEU
  // =====================================================================================
  const C = { month: K.thisMonth() };
  let cpanel;

  function mountComision(p) {
    cpanel = p;
    cpanel.classList.add('k-panel', 'mo', 'cb');
    cpanel.innerHTML =
      '<div class="k-head"><div><div class="k-eyebrow">Echipă</div><h2>Salariul meu</h2></div><div class="k-head-actions"><button type="button" class="k-btn is-accent" data-comm-new hidden>' + icon('plus') + 'Adaugă comision</button><button type="button" class="k-btn is-outline" data-sal-custom>' + icon('sliders') + 'Personalizează</button></div></div>' +
      '<div data-body></div>';
    cpanel.addEventListener('click', (e) => {
      const m = e.target.closest('[data-m]');
      if (m) { C.month = K.addMonths(C.month, +m.dataset.m); renderComision(); return; }
      const h = e.target.closest('[data-month]');
      if (h) { C.month = h.dataset.month; renderComision(); cpanel.scrollIntoView({ behavior: 'smooth', block: 'start' }); return; }
      if (e.target.closest('[data-go-train]')) K.go('traininguri');
      if (e.target.closest('[data-sal-custom]')) customizeSal();
      if (e.target.closest('[data-comm-new]')) openCommNew();
      const cc = e.target.closest('[data-comm-cancel]');
      if (cc) cancelComm(cc.dataset.commCancel);
    });
  }

  // "+ Adaugă comision": an upsell of hers the payment didn't carry (a package she sold, a zone added); it waits for the
  // owner's approval, the commission shown is what it would bring (upsell - 60% costs, 10% of the profit)
  function openCommNew() {
    const RULE = K.commissionRule();
    const d = K.drawer({
      title: 'Adaugă comision', icon: 'percent', width: 520, subtitle: 'Se aprobă de admin, apoi intră în salariu.',
      body: '<form class="k-form" data-form>' +
        K.field('Data', '<input name="date" type="date" required value="' + K.today() + '" max="' + K.today() + '">', 'full') +
        K.field('Clienta', '<input name="clientName" required maxlength="150" placeholder="Caută sau scrie numele" autocomplete="off">', 'full') +
        K.field('Telefon (opțional)', '<input name="clientPhone" type="tel" maxlength="30" placeholder="07xx xxx xxx">', 'full') +
        K.field('Ce ai vândut', '<input name="treatment" required maxlength="200" placeholder="ex. pachet 6 ședințe LipoSonix, o zonă în plus">', 'full') +
        K.field('Categorie', K.catPicker([]), 'full') +
        K.field('Valoarea upsell-ului', '<div class="k-money"><input name="amount" type="number" inputmode="decimal" min="1" step="1" required placeholder="0"></div>', 'full') +
        '<div class="pay-note" data-comm-est></div>' +
        K.field('Notă pentru admin (opțional)', '<textarea name="note" rows="2" maxlength="500" placeholder="ex. a plătit la recepție, nu s-a bifat upsell"></textarea>', 'full') +
        '</form>',
      footer: '<span class="k-grow"></span><button type="button" class="k-btn" data-k-close2>Renunță</button><button type="button" class="k-btn is-accent" data-save>' + icon('check') + 'Trimite la aprobare</button>',
      onMount(el) {
        const f = el.querySelector('[data-form]');
        const picker = K.clientPicker(f.clientName, f.clientPhone);
        const est = () => {
          const v = Number(f.amount.value) || 0;
          el.querySelector('[data-comm-est]').innerHTML = v > 0 ? '<span>Comision: <b>' + K.lei(K.commissionOf(v), 2) + '</b> (' + K.lei(v) + ' - ' + RULE.cost + '% = ' + K.lei(K.profitOf(v), 2) + ', × ' + RULE.rate + '%), după aprobare.</span>' : '';
        };
        f.amount.addEventListener('input', est);
        el.querySelector('[data-k-close2]').addEventListener('click', () => d.close());
        f.addEventListener('submit', (e) => { e.preventDefault(); el.querySelector('[data-save]').click(); });
        el.querySelector('[data-save]').addEventListener('click', (e) => K.busy(e.currentTarget, async () => {
          const v = K.formValues(f);
          const cats = String(v.categories || '').split(',').filter(Boolean);
          if (!v.clientName) { K.ui().toast('Scrie numele clientei.', 'error'); f.clientName.focus(); return; }
          if (!v.treatment) { K.ui().toast('Scrie ce ai vândut.', 'error'); f.treatment.focus(); return; }
          if (!cats.length) { K.ui().toast('Alege categoria.', 'error'); return; }
          if (!(Number(v.amount) > 0)) { K.ui().toast('Scrie valoarea upsell-ului.', 'error'); f.amount.focus(); return; }
          try {
            await K.api('/api/portal-sale', { source: 'comision', date: v.date, categories: cats, treatment: v.treatment, amount: Number(v.amount), note: v.note || '',
              clientId: picker.id(), clientName: v.clientName, clientPhone: v.clientPhone || '' });
            d.close();
            K.ui().toast('Trimis la aprobare: ' + K.lei(K.commissionOf(Number(v.amount)), 2) + ' comision.', 'success');
            K.reload();
          } catch (err) { K.ui().toast(err.code === 'invalid_date' ? 'Data nu poate fi în viitor.' : K.errText(err), 'error'); }
        }));
      },
    });
  }
  // her own, still waiting: taken back
  async function cancelComm(id) {
    if (!(await K.ui().confirm({ title: 'Retragi cererea de comision?', message: 'Dispare din lista de aprobat. O poți trimite din nou oricând.', confirmText: 'Retrage', danger: true }))) return;
    try { await K.api('/api/portal-sale', { source: 'comision_cancel', id }); K.ui().toast('Cerere retrasă.', 'success'); K.reload(); }
    catch (err) { K.ui().toast(err.code === 'already_decided' ? 'Adminul a decis deja asupra ei.' : K.errText(err), 'error'); }
  }

  // "Salariu": what she takes home this month (salary + overtime + commission, or the booking bonus
  // for reception) and, below it, the details of her commission or of her bonus. Data:
  // K.data.salary (api/_lib/payroll.js), the commission lines from K.data.mySales.
  const hm = (m) => { const a = Math.abs(Math.round(m || 0)); const h = Math.floor(a / 60), r = a % 60; return h ? h + 'h' + (r ? ' ' + K.pad(r) : '') : r + ' min'; };
  const lei2 = (v) => K.lei(v, v % 1 ? 2 : 0);

  function bookingHtml(bk, isNow) {
    const tiers = bk.tiers.slice().sort((a, b) => a.min - b.min); // 24, 27, 30
    const max = tiers[tiers.length - 1].min + 4;
    const pct = (v) => Math.min(100, (v / max) * 100);
    const days = K.daysIn(C.month), daysLeft = isNow ? days - Number(K.today().slice(8, 10)) + 1 : 0;
    return '<section class="k-card sl-bonus"><div class="k-card-head"><h3>' + icon('trophy') + 'Bonusul de programări</h3><span class="k-sub">media pe zi, în zilele pontate</span></div>' +
      '<div class="sl-bk-top"><div><span>Media ta</span><b>' + K.num(bk.avg) + '</b><small>programări / zi · ' + K.plural(bk.days, 'zi pontată', 'zile pontate') + ', ' + bk.total + ' programări</small></div>' +
        '<div class="sl-bk-now' + (bk.lei ? ' is-on' : '') + '"><span>Bonus</span><b>' + K.lei(bk.lei) + '</b>' +
        (bk.next ? '<small>' + (bk.days ? 'Încă ' + avg1(Math.max(0.1, Math.ceil((bk.next.min - bk.avg) * 10) / 10)) + ' pe zi pentru ' + K.lei(bk.next.lei) : 'de la ' + bk.next.min + ' pe zi') + (isNow && daysLeft ? ' · ' + K.plural(daysLeft, 'zi rămasă', 'zile rămase') : '') + '</small>' : '<small>Treapta cea mai mare. Bravo!</small>') + '</div></div>' +
      '<div class="sl-tiers"><div class="sl-track"><i style="--w:' + pct(bk.avg) + '%"></i>' +
        tiers.map((t) => '<span class="sl-tick' + (bk.avg >= t.min ? ' is-on' : '') + '" style="left:' + pct(t.min) + '%"><b>' + t.min + '+</b><em>' + K.lei(t.lei) + '</em></span>').join('') + '</div></div>' +
      '<p class="cd-rule">' + icon('info') + 'Media = programările făcute de tine împărțite la zilele în care ai pontat sosirea. De la 24 pe zi: 500 lei, de la 27: 700 lei, de la 30: 1.500 lei.</p>' +
      (bk.perDay.length ? '<div class="sl-days">' + bk.perDay.slice().reverse().map((d) => '<div class="sl-day' + (d.count >= tiers[0].min ? ' is-good' : '') + '"><span>' + esc(K.dateShort(d.date)) + '</span><b>' + d.count + '</b></div>').join('') + '</div>' : '') +
      '</section>';
  }

  // Personalizează on Salariu: her numbers and blocks (set by renderComision)
  let salCtx = null;
  function customizeSal() {
    const c = salCtx; if (!c) return;
    const catalog = {};
    c.mineSal.forEach((k) => { catalog[k] = { label: c.SAL[k].label, group: c.SAL[k].group, only: ['kpis'] }; });
    Object.keys(c.BLOCKS).forEach((b) => { catalog['b:' + b] = { label: c.BLOCKS[b], group: 'Secțiuni', only: ['blocks'] }; });
    const groups = []; c.mineSal.forEach((k) => { if (!groups.includes(c.SAL[k].group)) groups.push(c.SAL[k].group); });
    K.customize({
      title: 'Personalizează Salariul', subtitle: 'Alegi cifrele și secțiunile, în ordinea ta. Se păstrează pe contul tău.',
      catalog, groups: groups.concat(['Secțiuni']),
      parts: [
        { key: 'kpis', label: 'Cifrele', hint: 'Oricâte; se așază pe rânduri.', value: c.kpis, def: c.def },
        { key: 'blocks', label: 'Secțiunile', hint: 'Salariul din capul paginii rămâne mereu sus.', value: c.blocks.map((b) => 'b:' + b), def: Object.keys(c.BLOCKS).map((b) => 'b:' + b) },
      ],
      async onSave(v) {
        await K.prefs.set('sal.kpis', v.kpis);
        await K.prefs.set('sal.blocks', v.blocks.map((b) => b.slice(2)));
        renderComision();
      },
    });
  }

  function renderComision() {
    if (!cpanel || !K.data) return;
    const D = K.data;
    const me = D.me;
    const isNow = C.month === K.thisMonth();
    const today = K.today();
    const dim = K.daysIn(C.month);
    const dayNow = isNow ? Number(today.slice(8, 10)) : dim;
    const prevM = K.addMonths(C.month, -1);
    const months = (D.salary && D.salary.months) || [];
    const pay = months.find((m) => m.month === C.month) || null;
    const RULE = K.commissionRule();
    const isDesk = me.role === 'receptie';
    const addBtn = cpanel.querySelector('[data-comm-new]');
    if (addBtn) addBtn.hidden = me.role !== 'cosmetician';

    // ---- commission lines (cosmeticians)
    const sales = (D.mySales || []);
    const inMonth = sales.filter((s) => K.monthOf(s.date) === C.month && s.status !== 'rejected');
    const upsTotal = inMonth.reduce((a, s) => a + Number(s.amount || 0), 0);
    const inc = D.incasari || [];
    const doneOf = (m, uptoDay) => inc.filter((s) => s.performedBy === me.id && K.monthOf(s.date) === m && (!uptoDay || Number(s.date.slice(8, 10)) <= uptoDay));
    const done = doneOf(C.month);
    const donePrev = doneOf(prevM, isNow ? dayNow : 0);
    const doneValue = done.reduce((a, s) => a + Number(s.amount || 0), 0);
    const donePrevValue = donePrev.reduce((a, s) => a + Number(s.amount || 0), 0);
    const withUpsell = done.filter((s) => Number(s.upsell) > 0).length;
    const upRate = done.length ? Math.round((withUpsell / done.length) * 100) : 0;
    const days = Array.from({ length: dim }, (_, i) => C.month + '-' + K.pad(i + 1));
    const daily = days.map((dd) => done.filter((s) => s.date === dd).reduce((a, s) => a + Number(s.amount || 0), 0));
    const delta = (cur, prev) => {
      if (!prev) return cur ? '<span class="k-delta is-up">' + icon('arrowUp') + 'nou</span>' : '';
      const p = Math.round(((cur - prev) / prev) * 100);
      return '<span class="k-delta ' + (p > 0 ? 'is-up' : p < 0 ? 'is-down' : 'is-flat') + '">' + icon(p >= 0 ? 'arrowUp' : 'arrowDown') + Math.abs(p) + '%</span>';
    };

    const tile = (ic, label, value, sub, cls) => '<div' + (cls ? ' class="' + cls + '"' : '') + '><span>' + icon(ic) + label + '</span><b>' + value + '</b><small>' + sub + '</small></div>';
    const hero = !pay ? '<section class="cb-hero k-card"><div class="cb-hero-main"><span>Salariul tău · ' + esc(K.monthLabel(C.month)) + '</span><b>-</b><p>' + icon('info') + 'Nu avem date pentru luna asta.</p></div>' + monthNav(isNow) + '</section>'
      : '<section class="cb-hero k-card"><div class="cb-hero-main"><span>Salariul tău · ' + esc(K.monthLabel(C.month)) + '</span>' +
        '<b data-count="' + pay.total + '" data-fmt="lei" data-key="sl-t-' + C.month + '">0</b>' +
        '<p>' + icon('wallet') + 'în mână' + (isNow ? ', până azi' : '') + '</p></div>' + monthNav(isNow) +
        '<div class="cb-split">' +
          tile('user', 'Salariu de bază', pay.base ? K.lei(pay.base) : '-', pay.base ? 'net, pe lună' : 'nesetat încă') +
          tile('clock', 'Ore suplimentare', lei2(pay.overtimeLei), pay.overtimeMinutes ? hm(pay.overtimeMinutes) + ' × 40 lei' + (pay.overtimeDueLei ? ', neplătite încă (toate lunile), vin cu salariul' : '') : 'nicio oră luna asta') +
          (pay.hasBonus ? tile('trophy', 'Bonus programări', K.lei(pay.bonus), pay.booking && pay.booking.days ? 'media ' + avg1(pay.booking.avg) + ' pe zi' : 'nicio zi pontată încă', pay.bonus ? 'is-good' : '')
            : tile('percent', 'Comision', lei2(pay.commission), K.plural(pay.upsells, 'upsell', 'upsell-uri') + (pay.commissionWaiting ? ' · ' + lei2(pay.commissionWaiting) + ' în așteptare' : ''))) +
          (pay.manual ? tile('sliders', 'Comision adăugat', (pay.manual > 0 ? '+' : '') + lei2(pay.manual), 'de admin, luna asta', pay.manual > 0 ? 'is-good' : '') : '') +
        '</div></section>';

    // the treatments and upsells (cosmeticians)
    const listsHtml = isDesk ? '' :
        '<div class="mo-row cb-lists">' +
          '<section class="k-card"><div class="k-card-head"><h3>' + icon('sparkles') + 'Tratamentele tale</h3><span class="k-sub">' + K.plural(done.length, 'tratament', 'tratamente') + '</span></div>' +
            (done.length ? '<div class="k-list">' + done.slice().sort((a, b) => (a.date < b.date ? 1 : -1)).slice(0, 40).map((s) =>
              '<div class="k-row"><div class="k-row-main"><div class="k-row-title">' + esc(s.client || '-') + '</div><div class="k-row-sub">' + esc(K.dateShort(s.date)) + ' · ' + esc(s.treatment || '') + '</div></div>' +
              '<div class="k-row-end">' + (s.upsell ? '<span class="k-tag is-good">upsell</span>' : '') + '<span class="k-amount">' + K.lei(s.amount) + '</span></div></div>').join('') + '</div>'
              : K.empty('sparkles', 'Niciun tratament încasat', 'Tratamentele la care ești trecută la încasare apar aici.')) + '</section>' +
          '<section class="k-card"><div class="k-card-head"><h3>' + icon('percent') + 'Upsell-urile tale</h3><span class="k-sub">' + (pay ? lei2(pay.commission) + ' comision' : '') + '</span></div>' +
            (inMonth.length ? '<div class="k-list">' + inMonth.slice().sort((a, b) => (a.date < b.date ? 1 : -1)).map((s) => {
              const st = SALE_STATUS[s.status] || { label: s.status, tone: '' };
              const val = s.status === 'approved' ? Number(s.commission || 0) : (s.commission ? Number(s.commission) : K.commissionOf(s.amount));
              return '<div class="k-row' + (s.status === 'pending' ? ' is-wait' : '') + '"><div class="k-row-main"><div class="k-row-title">' + esc(s.client || s.treatment) + '</div><div class="k-row-sub">' + esc(K.dateShort(s.date)) + ' · ' + esc(String(s.treatment || '').replace(/^Upsell · /, '')) + '</div>' +
                '<div class="cb-calc"><span>Upsell <b>' + K.lei(s.amount) + '</b></span><span>- ' + RULE.cost + '%</span><span>= <b>' + K.lei(K.profitOf(s.amount), 2) + '</b></span><span>× ' + RULE.rate + '%</span></div></div>' +
                '<div class="k-row-end">' + (s.status === 'pending' && s.origin === 'manual' ? '<button type="button" class="k-btn is-ghost is-sm" data-comm-cancel="' + esc(s.id) + '">Retrage</button>' : '') + (s.status === 'approved' ? '' : '<span class="k-tag is-' + st.tone + '">' + st.label + '</span>') + '<span class="k-amount">+' + K.lei(val, 2) + '</span></div></div>';
            }).join('') + '</div>'
              : K.empty('trend', 'Niciun upsell încă', 'Upsell-urile la tratamentele făcute de tine apar aici, cu comisionul lor.', me.role === 'cosmetician' ? '<button type="button" class="k-btn is-accent is-sm" data-comm-new>' + icon('plus') + 'Adaugă comision</button>' : '')) + '</section>' +
        '</div>';

    // ---- last months
    const hist = months.filter((m, i) => i === 0 || m.total > 0);
    const histHtml = '<section class="k-card"><div class="k-card-head"><h3>' + icon('calendar') + 'Lunile tale</h3></div>' +
      '<div class="cb-hist sl-hist"><div class="cb-hist-row is-head"><span>Luna</span><span>Salariu</span><span>Ore supl.</span><span>' + (isDesk ? 'Bonus' : 'Comision') + '</span><span>Total</span></div>' +
      hist.map((h) => '<button type="button" class="cb-hist-row' + (h.month === C.month ? ' is-on' : '') + '" data-month="' + h.month + '"><span>' + esc(K.monthLabel(h.month)) + '</span><span>' + K.lei(h.base) + '</span><span>' + lei2(h.overtimeLei) + '</span><span>' + lei2(isDesk ? h.bonus : h.commission) + '</span><b>' + lei2(h.total) + '</b></button>').join('') + '</div></section>';
    const tips = isDesk ? '' : '<section class="k-card cb-tip"><div class="k-card-head"><h3>' + icon('zap') + 'Cum îți crești comisionul</h3></div>' +
      '<ol><li>La finalul tratamentului spune-i clientei ce ai observat și ce ar ajuta-o să ajungă mai repede la rezultat.</li>' +
      '<li>Recomandă <b>o singură</b> combinație potrivită (ex. grăsime → plus tonifiere; facial → întreținere lunară).</li>' +
      '<li>Programeaz-o pe loc la următoarea ședință.</li></ol>' +
      '<button type="button" class="k-btn is-outline" data-go-train>' + icon('book') + 'Manualul de vânzări</button></section>';

    // ---- every number this page can show (her pick, K.prefs 'sal.kpis') and its blocks ('sal.blocks')
    const st = (ic, label, value, sub, cls) => '<div class="k-stat' + (cls ? ' ' + cls : '') + '"><div class="k-stat-top"><span class="k-stat-ic">' + icon(ic) + '</span>' + label + '</div><div class="k-stat-value">' + value + '</div><div class="k-stat-sub">' + sub + '</div></div>';
    const bkk = pay && pay.booking;
    const bestDone = days.map((dd, i) => [dd, daily[i]]).filter((x) => x[1] > 0).sort((a, b) => b[1] - a[1])[0];
    const SAL = {
      payTotal: { label: 'Salariul în mână', group: 'Salariu', html: () => st('wallet', 'Salariul în mână', pay ? lei2(pay.total) : '-', isNow ? 'până azi' : esc(K.monthLabel(C.month)), 'is-accent') },
      base: { label: 'Salariu de bază', group: 'Salariu', html: () => st('user', 'Salariu de bază', pay && pay.base ? K.lei(pay.base) : '-', 'net, pe lună') },
      overtime: { label: 'Ore suplimentare', group: 'Salariu', html: () => st('clock', 'Ore suplimentare', pay ? lei2(pay.overtimeLei) : '-', pay && pay.overtimeMinutes ? hm(pay.overtimeMinutes) : 'nicio oră') },
      done: { label: 'Tratamente făcute', group: 'Tratamente', roles: ['cosmetician'], html: () => st('sparkles', 'Tratamente făcute', String(done.length), delta(done.length, donePrev.length) + 'vs ' + K.MON_S[Number(prevM.slice(5)) - 1] + '.' + (isNow ? ' (aceleași zile)' : '')) },
      doneValue: { label: 'Încasat din tratamentele tale', group: 'Tratamente', roles: ['cosmetician'], html: () => st('wallet', 'Încasat din tratamentele tale', K.lei(doneValue), delta(doneValue, donePrevValue) + (done.length ? 'bon mediu ' + K.lei(doneValue / done.length) : 'încă nimic luna asta')) },
      ticket: { label: 'Bon mediu', group: 'Tratamente', roles: ['cosmetician'], html: () => st('wallet', 'Bon mediu', K.lei(done.length ? doneValue / done.length : 0), 'pe tratament') },
      bestDay: { label: 'Cea mai bună zi', group: 'Tratamente', roles: ['cosmetician'], html: () => st('trophy', 'Cea mai bună zi', bestDone ? K.lei(bestDone[1]) : '-', bestDone ? esc(K.dateLong(bestDone[0])) : '-') },
      upRate: { label: 'Rata de upsell', group: 'Upsell și comision', roles: ['cosmetician'], html: () => st('trend', 'Rata de upsell', upRate + '%', withUpsell + ' din ' + done.length + ' tratamente cu upsell') },
      upAvg: { label: 'Upsell mediu', group: 'Upsell și comision', roles: ['cosmetician'], html: () => st('percent', 'Upsell mediu', K.lei(inMonth.length ? upsTotal / inMonth.length : 0), K.lei(inMonth.length ? K.commissionOf(upsTotal / inMonth.length) : 0, 2) + ' comision / upsell') },
      upCount: { label: 'Număr de upselluri', group: 'Upsell și comision', roles: ['cosmetician'], html: () => st('trophy', 'Upselluri', String(inMonth.length), K.lei(upsTotal) + ' valoare') },
      upValue: { label: 'Valoarea upsellurilor', group: 'Upsell și comision', roles: ['cosmetician'], html: () => st('trend', 'Valoare upsell', K.lei(upsTotal), K.plural(inMonth.length, 'upsell', 'upselluri')) },
      commission: { label: 'Comision aprobat', group: 'Upsell și comision', roles: ['cosmetician'], html: () => st('percent', 'Comision', pay ? lei2(pay.commission) : '-', 'aprobat', 'is-good') },
      commWaiting: { label: 'Comision în așteptare', group: 'Upsell și comision', roles: ['cosmetician'], html: () => st('clock', 'În așteptare', pay ? lei2(pay.commissionWaiting || 0) : '-', 'se aprobă de admin', 'is-warn') },
      bkAvg: { label: 'Programări pe zi', group: 'Bonus de programări', roles: ['receptie'], html: () => st('calendar', 'Programări / zi', bkk ? K.num(bkk.avg) : '-', bkk ? K.plural(bkk.days, 'zi pontată', 'zile pontate') : '-') },
      bkLei: { label: 'Bonusul acum', group: 'Bonus de programări', roles: ['receptie'], html: () => st('trophy', 'Bonus', bkk ? K.lei(bkk.lei) : '-', bkk && bkk.next ? 'următorul: ' + bkk.next.min + '+ pe zi' : 'treapta cea mai mare', bkk && bkk.lei ? 'is-good' : '') },
      bkTotal: { label: 'Programări făcute', group: 'Bonus de programări', roles: ['receptie'], html: () => st('calendar', 'Programări făcute', bkk ? String(bkk.total) : '-', 'luna asta') },
    };
    const role = isDesk ? 'receptie' : 'cosmetician';
    const mineSal = Object.keys(SAL).filter((k) => !SAL[k].roles || SAL[k].roles.includes(role));
    const SAL_DEF = isDesk ? [] : ['done', 'doneValue', 'upRate', 'upAvg'];
    const SAL_BLOCKS = isDesk ? { kpis: 'Cifrele alese', bonus: 'Bonusul de programări', history: 'Lunile tale' }
      : { kpis: 'Comisionul meu (cifrele alese)', chart: 'Graficul pe zile', lists: 'Tratamentele și upsellurile tale', history: 'Lunile tale', tips: 'Cum îți crești comisionul' };
    const salKpis = (K.prefs.get('sal.kpis', null) || SAL_DEF).filter((k) => mineSal.includes(k));
    const salBlocks = (K.prefs.get('sal.blocks', null) || Object.keys(SAL_BLOCKS)).filter((b) => SAL_BLOCKS[b]);
    salCtx = { SAL, mineSal, def: SAL_DEF, BLOCKS: SAL_BLOCKS, kpis: salKpis, blocks: salBlocks };

    const kpiRow = salKpis.length ? '<div class="mo-kpis k-stagger" style="margin-top:.8rem">' + salKpis.map((k) => SAL[k].html()).join('') + '</div>' : '';
    const BLOCK = {
      kpis: () => (isDesk ? (kpiRow ? '<section class="cb-sec">' + kpiRow + '</section>' : '')
        : '<section class="cb-sec"><h3>' + icon('percent') + 'Comisionul meu · ' + esc(K.monthLabel(C.month)) + '</h3>' +
          '<p class="cd-rule">' + icon('info') + 'Din valoarea upsell-ului se scad ' + RULE.cost + '% (cheltuielile medii ale procedurii), iar din ce rămâne primești ' + RULE.rate + '%. Exemplu: 3.000 lei upsell, 120 lei comision.</p>' + kpiRow + '</section>'),
      bonus: () => (pay && pay.hasBonus && pay.booking ? bookingHtml(pay.booking, isNow) : ''),
      chart: () => (done.length ? '<section class="k-card cb-sec"><div class="k-card-head"><h3>' + icon('trend') + 'Pe zile</h3><span class="k-sub">valoarea tratamentelor făcute de tine</span></div><div data-cbchart></div></section>' : ''),
      lists: () => listsHtml,
      history: () => histHtml,
      tips: () => tips,
    };
    cpanel.querySelector('[data-body]').innerHTML = hero + salBlocks.map((b) => BLOCK[b]()).join('');

    const ch = cpanel.querySelector('[data-cbchart]');
    if (ch) K.chart(ch, {
      labels: days.map((dd) => String(Number(dd.slice(8, 10)))), height: 180, format: K.lei, highlight: isNow ? dayNow - 1 : -1,
      axis: (v) => (v >= 1000 ? (Math.round(v / 100) / 10).toLocaleString('ro-RO') + 'k' : Math.round(v)),
      series: [{ name: 'Tratamente', values: daily, color: 'var(--accent)', kind: 'bar' }],
      tip: (i) => '<b>' + esc(K.dateLong(days[i])) + '</b><span>' + K.lei(daily[i]) + ' · ' + K.plural(done.filter((s) => s.date === days[i]).length, 'tratament', 'tratamente') + '</span>',
    });
    K.countAll(cpanel);
  }
  function monthNav(isNow) {
    return '<div class="k-month"><button type="button" class="k-icon-btn" data-m="-1" aria-label="Luna anterioară">' + icon('left') + '</button><b>' + esc(K.monthLabel(C.month)) + '</b><button type="button" class="k-icon-btn" data-m="1" aria-label="Luna următoare"' + (isNow ? ' disabled' : '') + '>' + icon('right') + '</button></div>';
  }

  K.section('comision', { mount: mountComision, show() { K.prefs.load().then(renderComision); }, data() { if (cpanel && K.isActive('comision')) renderComision(); } });
})();
