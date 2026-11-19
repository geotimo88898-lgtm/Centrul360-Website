// Centrul360 portal, money: "Încasări" and "Salariu" (with the commission or the booking bonus).
// Încasări: pick the city (Timișoara / Arad / both) and the period (today, yesterday, this week,
// this month, last month or exact dates); totals per payment method, daily bars, per person and
// per category, the day-grouped list, CSV + print, the rests still owed on packages. A payment always starts from an
// appointment: the desk picks WHICH appointment, WHAT the sum is made of (the session, or a cross-sell: what she did
// instead; an upsell's whole value and what she paid of it now; a payment on a package's rest), HOW it was paid
// (card / cash / transfer / cash + card) and WHO did the treatment. The commission on the upsell (value - 60% costs,
// 10% of the profit) waits for the owner's approval.
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
  const sum = (list) => K.net(list); // net: a refund row has a minus sum (portal-core.js K.net)
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
      (K.frontDesk && K.frontDesk() ? '<button type="button" class="k-btn is-accent" data-act="new">' + icon('plus') + 'Încasare<kbd>N</kbd></button>' : '') + '</div></div>' +
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
      if (e.key.toLowerCase() === 'n' && K.frontDesk && K.frontDesk()) { e.preventDefault(); openNew({}); }
    });
  }
  function onClick(e) {
    const a = e.target.closest('[data-act]');
    if (a) {
      if (a.dataset.act === 'new') return K.frontDesk && K.frontDesk() ? openNew({}) : null;
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
    if (row) openPayment(row.dataset.pay, row);
    const due = e.target.closest('[data-due-refund]');
    if (due) openRefund(due.dataset.dueSale, due.closest('.k-row') || due, { scope: 'package', dueId: due.dataset.dueRefund });
    const dp = e.target.closest('[data-due-pay]');
    if (dp) { const dd = (DUES.list || []).find((x) => x.id === dp.dataset.duePay); if (dd) openRestPay(dd, { from: dp.closest('.k-row') || dp }); }
  }

  const inLoc = (s) => S.loc === 'all' || s.location === S.loc;
  function periodRows() { const [a, b] = range(); return ((K.data && K.data.incasari) || []).filter((s) => s.date >= a && s.date <= b && inLoc(s)); }

  // what Personalizează offers on this page (set by render)
  let incCtx = null;
  const INC_DEF = ['total', 'card', 'cash', 'transfer'];
  const INC_BLOCKS = { chart: 'Graficul pe zile', split: 'Pe categorii și pe persoane', dues: 'Rest de plată din pachete', list: 'Lista încasărilor' };
  function customizeInc() {
    const c = incCtx; if (!c) return;
    const catalog = {};
    Object.keys(c.INC).forEach((k) => { catalog[k] = { label: c.INC[k].label, group: c.INC[k].group, only: ['kpis'] }; });
    Object.keys(INC_BLOCKS).forEach((b) => { catalog['b:' + b] = { label: INC_BLOCKS[b], group: 'Secțiuni', only: ['blocks'] }; });
    K.customize({
      title: 'Personalizează Încasări', 
      catalog, groups: ['Bani', 'Metode', 'Categorii și orașe', 'Upsell', 'Secțiuni'],
      parts: [
        { key: 'kpis', label: 'Cifrele de sus', hint: 'Oricâte; se așază pe rânduri. Toate sunt pentru orașul și perioada alese.', value: c.kpis, def: INC_DEF },
        { key: 'blocks', label: 'Secțiunile', value: c.blocks.map((b) => 'b:' + b), def: Object.keys(INC_BLOCKS).map((b) => 'b:' + b) },
      ],
      async onSave(v) {
        await K.prefs.set('inc.kpis', v.kpis);
        await K.prefs.set('inc.blocks', v.blocks.map((b) => b.slice(2)));
        await K.prefs.set('inc.duesSeen', true);
        render();
      },
    });
  }

  function render() {
    if (!panel || !K.data) return;
    const rows = periodRows();
    const [from, to] = range();
    // net: the payments minus the refunds of the period (K.net, as the server's api/_lib/money.js); a refund is no payment
    const total = K.net(rows), paysR = K.pays(rows), back = K.refundsOf(rows), mgr = K.canManage();
    const m = byMethod(rows);
    const days = [];
    for (let d = from; d <= to && days.length < 120; d = K.addDays(d, 1)) days.push(d);
    const daily = days.map((d) => sum(rows.filter((s) => s.date === d)));
    const byCat = { 'epilare-laser': 0, faciale: 0, corporale: 0 };
    rows.forEach((s) => { const c = K.catsOf(s); c.forEach((k) => { byCat[k] += Number(s.amount || 0) / c.length; }); });
    const catKeys = Object.keys(byCat).filter((k) => byCat[k] > 0).sort((a, b) => byCat[b] - byCat[a]);
    const byPerson = {};
    // a cosmetician: her own share and the rest of the clinic together, never a colleague's (the server sends no names)
    const solo = K.data.me && K.data.me.role === 'cosmetician';
    const myName = solo ? K.data.me.name || 'Tu' : '';
    rows.forEach((s) => { const n = solo ? (s.performedBy === K.data.me.id ? myName : 'Colegele') : s.performedByName && s.performedByName !== '-' ? s.performedByName : 'Neatribuit'; byPerson[n] = (byPerson[n] || 0) + Number(s.amount || 0); });
    const people = Object.keys(byPerson).sort((a, b) => byPerson[b] - byPerson[a]);
    const pct = (v) => (total ? Math.round((v / total) * 100) : 0);
    const where = S.loc === 'all' ? 'Timișoara + Arad' : S.loc;

    // ---- every number Încasări can show on top (her pick, K.prefs 'inc.kpis'), for the city and period chosen
    const card = (cls, ic, color, label, value, fmt, key, sub) => '<div class="k-stat' + (cls ? ' ' + cls : '') + '"><div class="k-stat-top"><span class="k-stat-ic"' + (color ? ' style="color:' + color + '"' : '') + '>' + icon(ic) + '</span>' + label + '</div>' +
      (fmt === 'lei' ? '<div class="k-stat-value" data-count="' + Math.round(value) + '" data-fmt="lei" data-key="mo-' + key + '-' + from + to + S.loc + '">0</div>' : '<div class="k-stat-value">' + value + '</div>') + '<div class="k-stat-sub">' + sub + '</div></div>';
    const best = days.map((d, i) => [d, daily[i]]).filter((x) => x[1] > 0).sort((a, b) => b[1] - a[1])[0];
    const ups = paysR.filter((x) => Number(x.upsell) > 0);
    const cross = paysR.filter((x) => x.crossSell);
    const upsValue = ups.reduce((a, x) => a + Number(x.upsell || 0), 0);
    const cityOf = (c) => sum(rows.filter((x) => x.location === c));
    const top = solo ? '' : people.filter((n) => n !== 'Neatribuit')[0];
    const INC = {
      total: { label: 'Total încasat', group: 'Bani', html: () => card('is-accent', 'wallet', '', 'Total încasat', total, 'lei', 't', K.plural(paysR.length, 'încasare', 'încasări') + (paysR.length ? ' · bon mediu ' + K.lei(back.gross / paysR.length) : '') + (back.count ? ' · net, după rambursări' : '')) },
      count: { label: 'Număr de încasări', group: 'Bani', html: () => card('', 'receipt', '', 'Încasări', K.num(paysR.length), '', '', 'plăți în perioadă') },
      ticket: { label: 'Bon mediu', group: 'Bani', html: () => card('', 'wallet', '', 'Bon mediu', paysR.length ? back.gross / paysR.length : 0, 'lei', 'tk', 'pe încasare') },
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
      cross: { label: 'Cross-sell', group: 'Upsell', html: () => card('', 'refresh', '', 'Cross-sell', K.num(cross.length), '', '', cross.length ? K.lei(sum(cross)) + ' încasat · ' + K.lei(cross.reduce((x, y) => x + Number(y.crossSell.fromAmount || 0), 0)) + ' programat' : 'a făcut altceva decât a venit') },
      dueRest: { label: 'Rest de plată din pachete', group: 'Upsell', html: () => card('is-warn', 'wallet', '', 'Rest de plată', DUES.list ? DUES.list.filter(inLoc).reduce((x, y) => x + Number(y.rest || 0), 0) : 0, 'lei', 'dr', DUES.list ? K.plural(DUES.list.filter(inLoc).length, 'pachet', 'pachete') + ' de încasat' : 'se încarcă') },
      upsellRate: { label: 'Rata de upsell', group: 'Upsell', html: () => card('', 'percent', '', 'Rata de upsell', (paysR.length ? Math.round((ups.length / paysR.length) * 100) : 0) + '%', '', '', ups.length + ' din ' + paysR.length + ' încasări') },
    };
    if (solo) delete INC.topPerson;
    // the refunds (the owner and the manager): their sum, how many, their share of what came in
    if (mgr) INC.refunds = { label: 'Rambursări', group: 'Bani', html: () => card(back.lei ? 'is-warn' : '', 'refresh', '', 'Rambursări', back.lei, 'lei', 'rf', back.count ? K.plural(back.count, 'rambursare', 'rambursări') + ' · ' + String(back.pct).replace('.', ',') + '% din încasări' : 'niciuna în perioadă') };
    const kpis = (K.prefs.get('inc.kpis', null) || INC_DEF).filter((k) => INC[k]);
    const blocks = (K.prefs.get('inc.blocks', null) || Object.keys(INC_BLOCKS)).filter((b) => INC_BLOCKS[b]);
    // the rests (5.11) show for her too when she picked her sections before they existed, until she customizes again
    if (!blocks.includes('dues') && !K.prefs.get('inc.duesSeen', false)) blocks.splice(Math.max(0, blocks.indexOf('list')), 0, 'dues');
    incCtx = { INC, kpis, blocks };

    const BLOCK = {
      chart: () => (days.length > 1 ? '<section class="k-card"><div class="k-card-head"><h3>' + icon('trend') + 'Pe zile</h3></div><div data-chart></div></section>' : ''),
      split: () => '<div class="mo-row">' +
        '<section class="k-card"><div class="k-card-head"><h3>' + icon('sparkles') + 'Pe categorii</h3></div>' +
          (catKeys.length ? catKeys.map((k) => '<div class="mo-bar"><span>' + esc(K.cats[k]) + '</span><b>' + K.lei(byCat[k]) + '</b><div class="k-bar"><i style="--w:' + (byCat[k] / byCat[catKeys[0]]) * 100 + '%"></i></div></div>').join('') : '<p class="k-muted">Nicio încasare în perioada aleasă.</p>') + '</section>' +
        '<section class="k-card"><div class="k-card-head"><h3>' + icon('users') + (solo ? 'Partea ta' : 'Cine a făcut tratamentele') + '</h3></div>' +
          (people.length ? '<div class="mo-people-grid">' + people.map((n) => '<div class="mo-person">' + K.avatar(n, 34) + '<div><b>' + esc(n) + '</b><span>' + K.lei(byPerson[n]) + ' · ' + pct(byPerson[n]) + '%</span><div class="k-bar"><i style="--w:' + (byPerson[n] / byPerson[people[0]]) * 100 + '%"></i></div></div></div>').join('') + '</div>' : '<p class="k-muted">-</p>') + '</section>' +
        '</div>',
      dues: () => '<section class="k-card"><div class="k-card-head"><h3>' + icon('wallet') + 'Rest de plată din pachete</h3></div><div data-dues>' + duesHtml() + '</div></section>',
      list: () => '<section class="k-card"><div class="k-toolbar"><label class="k-search">' + icon('search') + '<input data-q placeholder="Caută clientă sau tratament…" value="' + esc(S.q) + '"></label>' +
        '<div class="k-chips">' + Object.keys(METHODS).map((k) => '<button type="button" class="k-chip' + (S.method === k ? ' is-on' : '') + '" data-method="' + k + '">' + icon(METHODS[k].ic) + METHODS[k].label + '</button>').join('') + '</div>' +
        (S.day ? '<button type="button" class="k-chip is-on" data-act="clear-day">' + esc(K.dateLong(S.day)) + icon('x') + '</button>' : '') + '</div>' +
        '<div data-list></div></section>',
    };

    panel.querySelector('[data-body]').innerHTML =
      '<div class="mo-range"><b>' + esc(rangeLabel()) + '</b><span>' + esc(where) + '</span><span class="k-live">live</span></div>' +
      (mgr && back.count ? '<p class="mo-refunds">' + icon('refresh') + '<span>Rambursări <b>' + K.lei(back.lei, 2) + '</b> · ' + K.plural(back.count, 'rambursare', 'rambursări') + ' · ' + String(back.pct).replace('.', ',') + '% din încasări</span></p>' : '') +
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
    loadDues();
  }

  // ---------------- "Rest de plată din pachete": every package still being paid (api/portal-incasari.js dues)
  const DUES = { list: null, at: 0, busy: false };
  function loadDues(force) {
    if (DUES.busy || (!force && DUES.list && Date.now() - DUES.at < 60e3)) return;
    DUES.busy = true;
    K.api('/api/portal-incasari', { action: 'dues', id: '-' }).then((j) => { DUES.list = j.dues || []; DUES.at = Date.now(); }, () => { DUES.list = DUES.list || []; })
      .then(() => {
        DUES.busy = false;
        const el = panel && panel.querySelector('[data-dues]');
        if (el) el.innerHTML = duesHtml();
        const kp = panel && panel.querySelector('.mo-kpis');
        if (kp && incCtx && incCtx.kpis.includes('dueRest')) { kp.innerHTML = incCtx.kpis.map((k) => incCtx.INC[k].html()).join(''); K.countAll(panel); }
      });
  }
  function duesHtml() {
    if (!DUES.list) return '<div class="k-skel" style="height:90px"></div>';
    const list = DUES.list.filter(inLoc);
    if (!list.length) return '<p class="k-muted" style="margin:0">Nicio clientă nu mai are de plătit dintr-un pachet.</p>';
    const tot = list.reduce((a, d) => a + Number(d.rest || 0), 0);
    const can = K.canManage() && !(K.data && K.data.impersonating); // Rambursare on a package (the owner, the manager)
    const desk = K.frontDesk && K.frontDesk() && !(K.data && K.data.impersonating); // „Încasează” the rest, with no visit (16.11)
    return '<div class="mo-total">' + K.plural(list.length, 'pachet', 'pachete') + ' · de încasat <b>' + K.lei(tot, 2) + '</b></div><div class="k-list">' + list.map((dd) =>
      '<div class="k-row"><span class="k-icon-chip is-warn">' + icon('wallet') + '</span><div class="k-row-main"><div class="k-row-title">' + esc(dd.client || '-') + '</div>' +
        '<div class="k-row-sub">' + esc(dd.what || 'Pachet') + ' · plătit ' + K.lei(dd.paid, 2) + ' din ' + K.lei(dd.total, 2) + (dd.location && S.loc === 'all' ? ' · ' + esc(dd.location) : '') + ' · din ' + esc(K.dateShort(String(dd.createdAt).slice(0, 10))) + '</div></div>' +
        '<div class="k-row-end">' + (desk ? '<button type="button" class="k-btn is-outline is-sm" data-due-pay="' + esc(dd.id) + '">' + icon('wallet') + 'Încasează</button>' : '') + (can && dd.saleId ? '<button type="button" class="k-btn is-ghost is-sm" data-due-refund="' + esc(dd.id) + '" data-due-sale="' + esc(dd.saleId) + '">' + icon('undo') + 'Rambursare</button>' : '') + '<span class="k-tag is-warn">rest</span><span class="k-amount">' + K.lei(dd.rest, 2) + '</span></div></div>').join('') + '</div>';
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
        S.q || S.day || S.method ? 'Schimbă filtrul sau caută altceva.' : '' + (K.frontDesk && K.frontDesk() ? 'Încasarea pornește dintr-o programare: „Încasează” în Calendar sau butonul de mai jos.' : 'Încasările le face recepția.'),
        K.frontDesk && K.frontDesk() ? '<button type="button" class="k-btn is-primary" data-act="new">' + icon('plus') + 'Încasare nouă</button>' : '');
      return;
    }
    const days = [];
    rows.forEach((s) => { const d = days[days.length - 1]; if (d && d.date === s.date) d.rows.push(s); else days.push({ date: s.date, rows: [s] }); });
    const nBack = rows.filter(K.isRefund).length;
    el.innerHTML = '<div class="mo-total">' + K.plural(rows.length - nBack, 'încasare', 'încasări') + (nBack ? ' · ' + K.plural(nBack, 'rambursare', 'rambursări') : '') + ' · <b>' + K.lei(sum(rows)) + '</b></div>' +
      days.map((d) => '<div class="k-day"><span>' + esc(K.relDay(d.date) === K.dateLong(d.date) ? K.dateLong(d.date) : K.relDay(d.date) + ' · ' + K.dateShort(d.date)) + '</span><b>' + K.lei(sum(d.rows)) + '</b></div>' +
        '<div class="k-list">' + d.rows.map((s) => {
          if (K.isRefund(s)) return refundRow(s);
          const mm = METHODS[s.method] || METHODS.card;
          return '<div class="k-row is-click" data-pay="' + esc(s.id) + '"><span class="k-icon-chip" style="color:' + mm.color + '">' + icon(mm.ic) + '</span>' +
            '<div class="k-row-main"><div class="k-row-title">' + esc(s.client || '-') + '</div><div class="k-row-sub">' + esc(s.treatment) + (K.catLabel(s) ? ' · ' + esc(K.catLabel(s)) : '') +
            (s.performedByName && s.performedByName !== '-' ? ' · ' + esc(s.performedByName) : '') + (S.loc === 'all' && s.location ? ' · ' + esc(s.location) : '') + '</div></div>' +
            '<div class="k-row-end">' + (s.crossSell ? '<span class="k-tag is-info" title="A venit pentru ' + esc(s.crossSell.from) + '">cross-sell</span>' : '') +
              (s.upsell ? '<span class="k-tag is-good">+' + K.lei(s.upsell) + ' upsell' + (s.parts && s.parts.upsell < s.upsell ? ', avans ' + K.lei(s.parts.upsell) : '') + '</span>' : '') +
              (s.packageTotal && !s.parts ? '<span class="k-tag is-warn" title="Pachet plătit în tranșe">pachet ' + K.lei(s.packageTotal) + '</span>' : '') + (s.toDue ? '<span class="k-tag is-info">' + (s.parts ? K.lei(s.toDue) + ' ' : '') + 'din restul pachetului</span>' : '') + refundTag(s) + posTag(s) + '<span class="k-tag">' + mm.label + '</span><span class="k-amount">' + K.lei(s.amount, 2) + '</span></div></div>';
        }).join('') + '</div>').join('');
  }

  // a payment refunded (all of it or a part): „rambursat parțial / integral”
  const refundTag = (s) => (Number(s.refunded) > 0 ? '<span class="k-tag is-bad">' + (Number(s.refunded) >= Number(s.amount) - 0.005 ? 'rambursat integral' : 'rambursat parțial') + '</span>' : '');
  // a refund: money out, its own row in its day
  function refundRow(s) {
    return '<div class="k-row is-click mo-refund" data-pay="' + esc(s.id) + '"><span class="k-icon-chip" style="color:var(--bad)">' + icon('refresh') + '</span>' +
      '<div class="k-row-main"><div class="k-row-title">' + esc(s.client || '-') + '</div><div class="k-row-sub">' + esc(s.treatment) + (s.reason ? ' · ' + esc(s.reason) : '') +
      (S.loc === 'all' && s.location ? ' · ' + esc(s.location) : '') + '</div></div>' +
      '<div class="k-row-end"><span class="k-tag is-bad">rambursare</span><span class="k-tag">' + (METHODS[s.method] || METHODS.card).label + '</span><span class="k-amount is-neg">' + K.lei(s.amount, 2) + '</span></div></div>';
  }

  // ---------------- „Încasează restul”: a payment on a package's rest, with no visit (16.11, the audit: the rest could be paid
  // only inside a visit's payment of the last 30 days). From Încasări → Rest de plată din pachete and from her sheet
  // (Contacte). due: { id, client, what, rest, paid, total }; o: { from, done(r) }
  function openRestPay(due, o) {
    o = o || {};
    const rest = Math.round(Number(due.rest || 0) * 100) / 100;
    const st = { method: 'card', amount: String(rest), cash: '', card: '' };
    const num = (v) => Math.round((Number(String(v).replace(',', '.')) || 0) * 100) / 100;
    const money = (attr, val) => '<div class="k-money"><input ' + attr + ' type="number" inputmode="decimal" min="0" step="1" value="' + esc(val == null ? '' : val) + '" placeholder="0"></div>';
    const d = K.drawer({
      title: 'Încasează restul', icon: 'wallet', width: 520, focus: false, from: o.from,
      subtitle: esc(due.client || '') + (due.what ? ' · ' + esc(due.what) : ''),
      body: '<div class="pay-rest" data-rp></div>',
      footer: '<button type="button" class="k-btn" data-cancel>Renunță</button><span class="k-grow"></span><button type="button" class="k-btn is-accent is-lg" data-save disabled>' + icon('check') + '<span data-save-label>Încasează</span></button>',
      onMount(el) {
        el.querySelector('[data-cancel]').addEventListener('click', () => d.close());
        const body = el.querySelector('.k-dbody');
        body.addEventListener('click', (e) => { const m = e.target.closest('[data-m]'); if (m) { keep(); st.method = m.dataset.m; paint(); } });
        body.addEventListener('input', (e) => {
          keep();
          const amt = num(st.amount);
          if (e.target.matches('[data-cash]') && amt) { el.querySelector('[data-card]').value = Math.max(0, num(amt - num(e.target.value))) || ''; keep(); }
          if (e.target.matches('[data-card]') && amt) { el.querySelector('[data-cash]').value = Math.max(0, num(amt - num(e.target.value))) || ''; keep(); }
          check();
        });
        el.querySelector('[data-save]').addEventListener('click', (e) => K.busy(e.currentTarget, save));
      },
    });
    const box = () => d.el.querySelector('[data-rp]');
    function keep() { [['[data-rp-amt]', 'amount'], ['[data-cash]', 'cash'], ['[data-card]', 'card']].forEach(([sel, k]) => { const x = d.el.querySelector(sel); if (x) st[k] = x.value; }); }
    function paint() {
      box().innerHTML = '<div class="pay-sum"><span>Rest de plată</span><b>' + K.lei(rest, 2) + '</b>' + (due.total ? '<small>plătit ' + K.lei(due.paid || 0, 2) + ' din ' + K.lei(due.total, 2) + '</small>' : '') + '</div>' +
        '<section class="pay-step"><h4><i>1</i>Cât plătește acum?</h4><label class="k-field"><span>Din rest</span>' + money('data-rp-amt', st.amount) + '</label></section>' +
        '<section class="pay-step"><h4><i>2</i>Cum a plătit?</h4><div class="pay-methods">' + Object.keys(METHODS).map((k) =>
          '<button type="button" data-m="' + k + '" class="' + (st.method === k ? 'is-on' : '') + '"><span>' + icon(METHODS[k].ic) + '</span>' + METHODS[k].label + '</button>').join('') + '</div>' +
          (st.method === 'cash_card' ? '<div class="pay-split"><label class="k-field"><span>Din care cash</span>' + money('data-cash', st.cash) + '</label><label class="k-field"><span>Din care card</span>' + money('data-card', st.card) + '</label></div>' : '') +
          '<div class="pay-note" data-rp-note></div></section>';
      check();
    }
    function ok() {
      const amt = num(st.amount);
      if (!(amt > 0) || amt > rest + 0.01) return false;
      if (st.method === 'cash_card' && (!(num(st.cash) > 0) || !(num(st.card) > 0) || Math.abs(num(st.cash) + num(st.card) - amt) > 0.01)) return false;
      return true;
    }
    function check() {
      const amt = num(st.amount), n = d.el.querySelector('[data-rp-note]');
      if (n) n.innerHTML = amt > rest + 0.01 ? '<span class="pay-warn">' + icon('alert') + 'Mai are doar ' + K.lei(rest, 2) + '.</span>'
        : amt > 0 ? '<span>' + (amt >= rest - 0.005 ? 'Pachetul se achită integral.' : 'Rămân ' + K.lei(rest - amt, 2) + '.') + '</span>' : '';
      const b = d.el.querySelector('[data-save]');
      b.disabled = !ok();
      d.el.querySelector('[data-save-label]').textContent = amt > 0 ? 'Încasează ' + K.lei(amt, 2) : 'Încasează';
    }
    async function save() {
      keep();
      if (!ok()) return;
      const amt = num(st.amount);
      try {
        const r = await K.api('/api/portal-sale', { source: 'incasare', dueId: due.id, amount: amt, method: st.method, cashAmount: num(st.cash), cardAmount: num(st.card) });
        d.close();
        K.ui().toast('Încasat ' + K.lei(amt, 2) + ' · ' + (due.client || 'clienta') + '. ' + (r.due && r.due.rest > 0 ? 'Rest: ' + K.lei(r.due.rest, 2) + '.' : 'Pachetul e achitat integral.'), 'success');
        K.emit('sale:recorded'); DUES.at = 0; loadDues(true); K.reload(); K.emit('remote');
        if (o.done) o.done(r);
      } catch (err) {
        const msg = { over_rest: 'Mai are doar ' + K.lei((err.data && err.data.rest) || rest, 2) + '.', invalid_due: 'Pachetul s-a schimbat sau e achitat. Redeschide.', already_paid: 'Suma asta e deja încasată.', invalid_split: 'Cash + card trebuie să dea suma.', invalid_amount: 'Scrie cât plătește.' }[err.code];
        K.ui().toast(msg || K.errText(err), 'error');
      }
    }
    paint();
  }
  K.payRest = openRestPay;

  // ---------------- new payment: appointment → method → who did it
  async function openNew(pre) {
    pre = pre || {};
    // Step 1 = city (Timișoara / Arad) → day (today by default) → that day's unpaid appointments in a dropdown.
    // the payment in parts (the owner, 5.11): the session she came for (or, a cross-sell, what she did instead), an
    // upsell (its whole value and what she paid of it now: the rest is owed), a payment on an older package's rest
    const st = { list: null, apptId: pre.appointmentId || '', method: 'card', who: '', day: K.today(), upsell: false, dueId: '', dues: {},
      session: null, cross: false, crossTo: '', upsWhat: '', upsValue: '', upsPaid: '', duePaid: '',
      city: K.data && K.data.city ? K.data.city : (K.data && LOCS.includes(K.data.me.location) ? K.data.me.location : LOCS[0]) };
    const d = K.drawer({
      title: 'Încasare', icon: 'wallet', width: 600, focus: false,
      
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
      st.offers = j.offers || {}; // the offer made with the calculator for that booking (or her newest), its 4 options
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
    function offerPick(a) {
      const of = st.offers && st.offers[a.id];
      if (!of || !(of.pages || []).length) return '';
      return '<div class="pay-part pay-offer"><div class="pay-part-h"><b>Oferta din calculator</b><small>' + esc(of.what || 'Programul ei') + ' · ' + esc(K.dateShort(String(of.at || '').slice(0, 10))) + '</small></div>' +
        '<div class="pay-offers">' + of.pages.map((p, i) => '<button type="button" data-offer-pick="' + i + '" class="' + (st.offerPick === i ? 'is-on' : '') + '"><b>' + K.lei(p.pay) + '</b><small>' + esc(p.title || ('Oferta ' + (i + 1))) + (p.parts && !/tranș/i.test(p.title || '') ? ' · ' + p.parts + ' tranșe' : '') + '</small></button>').join('') + '</div></div>';
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
      if (st.session == null) st.session = a.package ? 0 : booked || '';
      // only the cosmeticians of the chosen city
      const team = cosmeticians(st.city);
      const owed = (a.clientId && st.dues[a.clientId]) || [];
      const money = (attr, val, ph) => '<div class="k-money"><input ' + attr + ' type="number" inputmode="decimal" min="0" step="1" value="' + esc(val == null ? '' : val) + '" placeholder="' + (ph || '0') + '"></div>';
      const treats = [...new Set(((K.data && K.data.offers) || []).map((o) => o.title).concat(['Masaj facial', 'Tratament facial Restart', 'HIFU · Gușă', 'HIFU · Abdomen', 'Liposonix', 'Cavitație', 'EMS', 'Radiofrecvență', 'Microneedling', 'Epilare laser', 'Împachetare']))];
      root().innerHTML = step1 +
        '<section class="pay-step"><h4><i>2</i>Ce a plătit?</h4>' +
          '<div class="pay-sum" data-total></div>' +
          // the session she came for, or what she did instead
          '<div class="pay-part"><div class="pay-part-h"><b>Ședința de azi</b><small>' + esc(a.treatment || '-') + (a.package ? ' · ședință din pachet' : booked ? ' · programată la ' + K.lei(booked) : '') + '</small></div>' +
            '<label class="pay-check pay-cross' + (st.cross ? ' is-on' : '') + '"><input type="checkbox" data-cross' + (st.cross ? ' checked' : '') + '><span class="pay-box">' + icon('check') + '</span>' +
              '<span><b>Cross-sell</b><small>A făcut altă procedură decât cea pentru care a venit.</small></span></label>' +
            '<div class="pay-grid"' + (st.cross ? '' : ' hidden') + ' data-cross-box><label class="k-field"><span>Ce a făcut în loc de ' + esc(a.treatment || 'programare') + '</span><input data-cross-to list="pay-treats" value="' + esc(st.crossTo) + '" placeholder="ex. Masaj facial" maxlength="120"></label></div>' +
            '<datalist id="pay-treats">' + treats.map((t) => '<option value="' + esc(t) + '">').join('') + '</datalist>' +
            '<label class="k-field"><span data-session-label>' + (st.cross ? 'Prețul procedurii făcute' : 'Cât a plătit pentru ședință') + '</span>' + money('data-session', st.session) + '</label>' +
          '</div>' +
          // the offer made with the calculator (16.11): a tap on the option she took fills the upsell
          offerPick(a) +
          // the upsell: its whole value, what she paid of it now
          '<div class="pay-part pay-ups' + (st.upsell ? ' is-on' : '') + '">' +
            '<label class="pay-check"><input type="checkbox" data-upsell' + (st.upsell ? ' checked' : '') + '><span class="pay-box">' + icon('check') + '</span>' +
              '<span><b>Upsell</b><small>A cumpărat ceva în plus: un pachet, o ședință pentru altă dată, o zonă în plus. Ședința de azi nu e upsell.</small></span></label>' +
            '<div class="pay-grid"' + (st.upsell ? '' : ' hidden') + ' data-ups-box>' +
              '<label class="k-field full"><span>Ce a cumpărat</span><input data-ups-what list="pay-treats" value="' + esc(st.upsWhat) + '" placeholder="ex. Pachet 3 ședințe HIFU gușă" maxlength="120"></label>' +
              '<label class="k-field"><span>Valoarea totală a upsell-ului</span>' + money('data-ups-value', st.upsValue, 'ex. 1980') + '</label>' +
              '<label class="k-field"><span>Cât a plătit acum din el</span>' + money('data-ups-paid', st.upsPaid, 'tot sau avansul') + '</label>' +
              '<div class="pay-note full" data-ups-rest></div>' +
            '</div></div>' +
          // a payment on what she still owes for an older package
          (owed.length ? '<div class="pay-part pay-due"><div class="pay-part-h"><b>Mai are de plătit dintr-un pachet</b><small>Bifează dacă plătește acum din rest.</small></div>' + owed.map((o) =>
            '<label class="pay-check"><input type="checkbox" data-due="' + esc(o.id) + '" data-rest="' + o.rest + '"' + (st.dueId === o.id ? ' checked' : '') + '><span class="pay-box">' + icon('check') + '</span>' +
              '<span><b>Rest: ' + K.lei(o.rest, 2) + '</b><small>' + esc(o.what || 'Pachet') + ' · plătit ' + K.lei(o.paid, 2) + ' din ' + K.lei(o.total, 2) + '</small></span></label>').join('') +
            '<label class="k-field"' + (st.dueId ? '' : ' hidden') + ' data-due-box><span>Cât plătește acum din rest</span>' + money('data-due-paid', st.duePaid) + '</label></div>' : '') +
        '</section>' +
        '<section class="pay-step"><h4><i>3</i>Cum a plătit?</h4><div class="pay-methods">' + Object.keys(METHODS).map((k) =>
          '<button type="button" data-m="' + k + '" class="' + (st.method === k ? 'is-on' : '') + '"><span>' + icon(METHODS[k].ic) + '</span>' + METHODS[k].label + '</button>').join('') + '</div>' +
          (st.method === 'cash_card' ? '<div class="pay-split"><label class="k-field"><span>Din care cash</span>' + money('data-cash', st.cash) + '</label>' +
            '<label class="k-field"><span>Din care card</span>' + money('data-card', st.card) + '</label></div>' : '') +
          '<div class="pay-note" data-note></div></section>' +
        '<section class="pay-step"><h4><i>4</i>Cine a făcut tratamentul?</h4><div class="pay-people">' +
          team.map((x) => '<button type="button" data-who="' + esc(x.id) + '" class="' + (st.who === x.id ? 'is-on' : '') + '">' + K.avatar(x.name, 30) + '<span><b>' + esc(x.name) + '</b><small>' + esc(x.location) + '</small></span></button>').join('') +
          (!team.length ? '<p class="k-muted">Nicio cosmeticiană activă în ' + esc(st.city) + ' (Echipa).</p>' : '') + '</div></section>';
      note(); updateSave();
    }
    function num(v) { return Math.round((Number(v) || 0) * 100) / 100; }
    // what each part is and the total, from what the desk typed
    function vals() {
      const a = appt();
      const owedRest = st.dueId ? Number((d.el.querySelector('[data-due="' + st.dueId + '"]') || { dataset: {} }).dataset.rest) || 0 : 0;
      const session = num(st.session);
      const upsValue = st.upsell ? num(st.upsValue) : 0;
      const upsPaid = st.upsell ? num(st.upsPaid) : 0;
      const duePaid = st.dueId ? num(st.duePaid) : 0;
      const amt = num(session + upsPaid + duePaid);
      const cash = num(st.cash), card = num(st.card);
      return { a, amt, cash, card, session, upsValue, upsPaid, duePaid, owedRest };
    }
    function note() {
      const v = vals();
      const tot = d.el.querySelector('[data-total]');
      if (tot) {
        const bits = ['ședința ' + K.lei(v.session, 2)];
        if (st.upsell) bits.push((v.upsPaid < v.upsValue ? 'avans upsell ' : 'upsell ') + K.lei(v.upsPaid, 2));
        if (st.dueId) bits.push('din pachet ' + K.lei(v.duePaid, 2));
        tot.innerHTML = '<span>Total încasat acum</span><b>' + K.lei(v.amt, 2) + '</b><small>' + bits.join(' + ') + '</small>';
      }
      const ur = d.el.querySelector('[data-ups-rest]');
      if (ur) ur.innerHTML = !st.upsell || !v.upsValue ? ''
        : v.upsPaid > v.upsValue ? '<span class="pay-warn">' + icon('alert') + 'A plătit mai mult decât valoarea upsell-ului.</span>'
        : v.upsPaid < v.upsValue ? '<span>Rest de plată: <b>' + K.lei(v.upsValue - v.upsPaid, 2) + '</b>. Apare la următoarele ei încasări și în Încasări → Rest de plată din pachete.</span>'
        : '<span>Upsell plătit integral acum.</span>';
      const box = d.el.querySelector('[data-note]');
      if (!box) return;
      const a = v.a, booked = Number(a.amount) || 0;
      const lines = [];
      if (st.cross && st.crossTo) lines.push('Cross-sell: <b>' + esc(st.crossTo) + '</b> în loc de ' + esc(a.treatment || '-') + (booked ? ' (' + K.lei(booked) + ')' : ''));
      if (!st.cross && !a.package && booked && v.session < booked) lines.push('<span class="pay-warn">' + icon('alert') + 'Ședința e mai puțin decât suma programării (' + K.lei(booked) + ').</span>');
      if (st.dueId && v.duePaid > v.owedRest + 0.01) lines.push('<span class="pay-warn">' + icon('alert') + 'Din pachet mai are doar ' + K.lei(v.owedRest, 2) + '.</span>');
      if (st.method === 'cash_card' && v.amt && Math.abs(v.cash + v.card - v.amt) > 0.01) lines.push('<span class="pay-warn">' + icon('alert') + 'Cash + card = ' + K.lei(v.cash + v.card) + ', trebuie ' + K.lei(v.amt) + '.</span>');
      box.innerHTML = lines.join('');
    }
    function ready() {
      const v = vals();
      if (!v.a || !(v.amt > 0) || !st.who || !whoOk()) return false;
      if (st.cross && !String(st.crossTo).trim()) return false;
      if (st.upsell && (!(v.upsValue > 0) || v.upsPaid > v.upsValue)) return false;
      if (st.dueId && (!(v.duePaid > 0) || v.duePaid > v.owedRest + 0.01)) return false;
      if (st.method === 'cash_card' && (!(v.cash > 0) || !(v.card > 0) || Math.abs(v.cash + v.card - v.amt) > 0.01)) return false;
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
      // an option of her calculator offer: the upsell is that program, at that price; paid now: all of it, or the first part
      const op = e.target.closest('[data-offer-pick]');
      if (op) {
        keepInputs();
        const of = st.offers[st.apptId], p = of && of.pages[Number(op.dataset.offerPick)];
        if (!p) return;
        st.offerPick = Number(op.dataset.offerPick);
        st.upsell = true; st.upsWhat = String((of.what || 'Program') + ' · ' + (p.title || '')).slice(0, 120);
        st.upsValue = String(p.pay); st.upsPaid = String(p.parts ? Math.round(p.pay / p.parts * 100) / 100 : p.pay);
        return paint();
      }

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
        d.el.querySelector('[data-ups-box]').hidden = !st.upsell;
        note(); updateSave();
        return;
      }
      if (t.matches('[data-cross]')) {
        st.cross = t.checked;
        t.closest('.pay-cross').classList.toggle('is-on', st.cross);
        d.el.querySelector('[data-cross-box]').hidden = !st.cross;
        d.el.querySelector('[data-session-label]').textContent = st.cross ? 'Prețul procedurii făcute' : 'Cât a plătit pentru ședință';
        if (st.cross) { const i = d.el.querySelector('[data-cross-to]'); if (i) i.focus(); }
        note(); updateSave();
        return;
      }
      // paying down a package: what is left of it, by default (the desk can change it)
      if (t.matches('[data-due]')) {
        st.dueId = t.checked ? t.dataset.due : '';
        d.el.querySelectorAll('[data-due]').forEach((x) => { if (x !== t) x.checked = false; });
        st.duePaid = t.checked ? t.dataset.rest : '';
        const box = d.el.querySelector('[data-due-box]');
        if (box) { box.hidden = !t.checked; box.querySelector('input').value = st.duePaid; }
        note(); updateSave();
        return;
      }
      if (t.matches('[data-appt-select]')) {
        st.apptId = t.value; st.cash = ''; st.card = ''; st.upsell = false; st.dueId = ''; st.offerPick = null;
        st.session = null; st.cross = false; st.crossTo = ''; st.upsWhat = ''; st.upsValue = ''; st.upsPaid = ''; st.duePaid = '';
        st.who = (appt() && appt().cosmeticianId) || '';
        return paint();
      }
    }
    function keepInputs() {
      const get = (sel) => { const x = d.el.querySelector(sel); return x ? x.value : null; };
      const map = { '[data-session]': 'session', '[data-cross-to]': 'crossTo', '[data-ups-what]': 'upsWhat', '[data-ups-value]': 'upsValue', '[data-ups-paid]': 'upsPaid', '[data-due-paid]': 'duePaid', '[data-cash]': 'cash', '[data-card]': 'card' };
      Object.keys(map).forEach((sel) => { const v = get(sel); if (v != null) st[map[sel]] = v; });
    }
    function onDrawerInput(e) {
      const t = e.target;
      // the upsell's value typed first: what she paid now starts at the whole value (the desk changes it for an advance)
      if (t.matches('[data-ups-value]')) { const pd = d.el.querySelector('[data-ups-paid]'); if (pd && (pd.value === '' || pd.value === String(st.upsValue))) pd.value = t.value; }
      keepInputs();
      // cash + card: typing one side fills the other with the rest
      const { amt } = vals();
      if (t.matches('[data-cash]') && amt) { d.el.querySelector('[data-card]').value = Math.max(0, num(amt - (Number(t.value) || 0))) || ''; keepInputs(); }
      if (t.matches('[data-card]') && amt) { d.el.querySelector('[data-cash]').value = Math.max(0, num(amt - (Number(t.value) || 0))) || ''; keepInputs(); }
      note(); updateSave();
    }
    async function save() {
      keepInputs();
      if (!ready()) return;
      const v = vals(), a = v.a, amt = v.amt;
      try {
        const r = await K.api('/api/portal-sale', { source: 'incasare', appointmentId: a.id, method: st.method, cashAmount: v.cash, cardAmount: v.card, performedBy: st.who, dueId: st.dueId || '',
          parts: { session: v.session, crossTo: st.cross ? String(st.crossTo).trim() : '', upsell: st.upsell, upsellValue: v.upsValue, upsellPaid: v.upsPaid, upsellWhat: st.upsell ? String(st.upsWhat).trim() : '', duePaid: v.duePaid } });
        d.close();
        const dueTxt = r.due ? (r.due.rest > 0 ? ' Rest de plată din pachet: ' + K.lei(r.due.rest, 2) + '.' : st.dueId ? ' Pachetul e achitat integral.' : '') : '';
        // the upsell's commission as it comes (4% of the money received): now, and what the rest of the package brings later
        const c = r.commission, commTxt = r.upsell ? (c && c.rule === 'cash' ? '. Comision acum ' + K.lei(c.now, 2) + (c.later > 0 ? ', încă ' + K.lei(c.later, 2) + ' la restul' : '') + '.' : '. Comision ' + K.lei(c ? c.now : r.upsell.commission, 2) + '.') : '';
        K.ui().toast('Încasat ' + K.lei(amt, 2) + ' · ' + a.clientName + commTxt + dueTxt, 'success'); K.emit('sale:recorded');
        DUES.at = 0; loadDues(true);
        if (!(a.date >= range()[0] && a.date <= range()[1])) { S.period = a.date === K.today() ? 'today' : 'month'; }
        K.reload();
        K.emit('remote');
      } catch (err) {
        const msg = { invalid_package: 'A plătit mai mult decât valoarea upsell-ului.', invalid_due: 'Restul pachetului s-a schimbat. Redeschide încasarea.', invalid_upsell: 'Scrie valoarea upsell-ului.', invalid_amount: 'Scrie cât a plătit.', already_paid: 'Programarea e deja încasată.', missing_performer: 'Alege cine a făcut tratamentul.', invalid_split: 'Cash + card trebuie să dea suma totală.', appointment_not_found: 'Programarea nu mai există.' }[err.code];
        K.ui().toast(msg || K.errText(err), 'error');
      }
    }
  }

  // ---------------- view / correct (owner) one payment
  function openPayment(id, from) {
    const s = (K.data.incasari || []).find((x) => x.id === id);
    if (!s) return;
    if (K.isRefund(s)) return openRefundRow(s, from);
    const canRefund = K.canManage() && !(K.data && K.data.impersonating);
    const m = METHODS[s.method] || METHODS.card;
    const admin = K.data.isAdmin;
    const emp = cosmeticians();
    // the parts as recorded, or, for an older payment of one sum, a first split the owner corrects: the session at the
    // booked price (at most the sum), the rest of an upsell above it
    const amt0 = Number(s.amount) || 0, due0 = Number(s.toDue) || 0, booked0 = Number(s.bookedAmount) || 0;
    const ses0 = s.parts ? s.parts.session : s.upsell ? Math.min(booked0 || 0, amt0 - due0) : amt0 - due0;
    const P0 = s.parts || { session: ses0, upsell: Math.max(0, amt0 - due0 - ses0), due: due0 };
    const upsV0 = s.parts ? Number(s.upsell) || 0 : s.upsell ? Math.max(P0.upsell, s.packageTotal ? Number(s.packageTotal) - ses0 : 0) : 0;
    // a refund hangs on its sums, its day and its person: only the method, the categories and the note change then
    const locked = Number(s.refunded) > 0;
    const lk = locked ? ' disabled' : '';
    // a month before this one: its salaries and bonus are closed, the correction says so before it is saved
    const closedTxt = (m) => 'Luna ' + K.monthLabel(m).split(' ')[0].toLowerCase() + ' e deja închisă: schimbarea modifică salariile și bonusul lunii.';
    const d = K.drawer({
      title: K.lei(s.amount, 2), lead: '<span class="k-dicon" style="background:' + m.color + '">' + icon(m.ic) + '</span>', from,
      subtitle: esc(s.client) + ' · ' + esc(K.dateLong(s.date)) + (s.location ? ' · ' + esc(s.location) : ''),
      body: '<dl class="k-kv"><dt>Clientă</dt><dd>' + esc(s.client) + '</dd><dt>Tratament</dt><dd>' + esc(s.treatment) + '</dd><dt>Categorie</dt><dd>' + esc(K.catLabel(s) || '-') + '</dd>' +
          '<dt>Plată</dt><dd>' + esc(methodText(s)) + '</dd>' + (s.bookedAmount ? '<dt>Programat</dt><dd>' + K.lei(s.bookedAmount) + '</dd>' : '') +
          (s.parts ? '<dt>Ședința</dt><dd>' + K.lei(s.parts.session, 2) + '</dd>' : '') +
          (s.crossSell ? '<dt>Cross-sell</dt><dd>' + esc(s.crossSell.to) + ' în loc de ' + esc(s.crossSell.from) + (s.crossSell.fromAmount ? ' (' + K.lei(s.crossSell.fromAmount) + ')' : '') + '</dd>' : '') +
          (s.upsell ? '<dt>Upsell</dt><dd>' + (s.upsellWhat ? esc(s.upsellWhat) + ' · ' : '') + 'valoare ' + K.lei(s.upsell) + (s.parts ? ' · plătit acum ' + K.lei(s.parts.upsell, 2) + (s.parts.upsell < s.upsell ? ' · rest ' + K.lei(s.upsell - s.parts.upsell, 2) : '') : '') + ' (comisionul, dacă e, apare în Salariu)</dd>' : '') +
          (s.toDue ? '<dt>Din restul pachetului</dt><dd>' + K.lei(s.toDue, 2) + '</dd>' : '') +
          '<dt>A făcut tratamentul</dt><dd>' + esc(s.performedByName || '-') + '</dd><dt>Înregistrată de</dt><dd>' + esc(s.employeeName || '-') + (s.createdAt ? ' · ' + esc(K.ago(s.createdAt)) : '') + '</dd>' +
          (Number(s.refunded) > 0 ? '<dt>Rambursat</dt><dd>' + K.lei(s.refunded, 2) + (Number(s.refunded) >= Number(s.amount) - 0.005 ? ', integral' : ', parțial') + '</dd>' : '') + '</dl>' +
        (admin ? '<section class="k-section"><h4>' + icon('pen') + 'Corectează</h4><form class="k-form" data-form>' +
          (locked ? '<p class="mo-note full" style="margin:0">' + icon('undo') + '<span>Are o rambursare: sumele, data și cine a lucrat rămân. Se schimbă metoda, categoria și nota.</span></p>' : '') +
          K.field('Ședința de azi', '<div class="k-money"><input name="session" type="number" min="0" step="0.01" value="' + esc(P0.session) + '"' + lk + '></div>') +
          '<div class="k-field"><span>Total încasat</span><b data-ptotal style="font-size:1.1rem;padding:.55rem 0">' + K.lei(s.amount, 2) + '</b></div>' +
          K.field('Cross-sell: ce a făcut în loc de ' + esc(s.crossSell ? s.crossSell.from : s.treatment), '<input name="crossTo" value="' + esc(s.crossSell ? s.crossSell.to : '') + '" placeholder="gol = a făcut ce era programat" maxlength="120">', 'full') +
          K.field('Data', '<input name="date" type="date" value="' + esc(s.date) + '"' + lk + '>') +
          K.field('Metodă', K.seg('method', Object.keys(METHODS).map((k) => [k, METHODS[k].label, METHODS[k].ic]), s.method, 'is-big'), 'full') +
          '<div class="pay-split full" data-split' + (s.method === 'cash_card' ? '' : ' hidden') + '><label class="k-field"><span>Cash</span><input name="cashAmount" type="number" min="0" step="0.01" value="' + esc(s.split ? s.split.cash : '') + '"></label>' +
          '<label class="k-field"><span>Card</span><input name="cardAmount" type="number" min="0" step="0.01" value="' + esc(s.split ? s.split.card : '') + '"></label></div>' +
          K.field('Categorie', K.catPicker(K.catsOf(s)), 'full') +
          K.field('A făcut tratamentul', '<select name="performedBy"' + lk + '><option value="">-</option>' + K.options(emp.map((e) => [e.id, e.name + ' · ' + e.location]), s.performedBy || '') + '</select>', 'full') +
          (true
            ? '<label class="pay-check full"><input type="checkbox" name="upsell" value="true"' + (upsV0 ? ' checked' : '') + lk + '><span class="pay-box">' + icon('check') + '</span><span><b>Upsell</b><small>Comisionul se recalculează cât timp nu e aprobat; restul pachetului urmează valoarea și avansul.</small></span></label>' +
              '<div class="pay-grid full" data-pups' + (upsV0 ? '' : ' hidden') + '>' +
                '<label class="k-field full"><span>Ce a cumpărat</span><input name="upsellWhat" value="' + esc(s.upsellWhat || '') + '" maxlength="120"></label>' +
                '<label class="k-field"><span>Valoarea totală</span><div class="k-money"><input name="upsellValue" type="number" min="0" step="0.01" value="' + esc(upsV0 || '') + '"' + lk + '></div></label>' +
                '<label class="k-field"><span>Plătit acum</span><div class="k-money"><input name="upsellPaid" type="number" min="0" step="0.01" value="' + esc(P0.upsell || '') + '"' + lk + '></div></label></div>' +
              (s.toDue ? '<p class="k-muted full" style="margin:0">Din restul unui pachet: ' + K.lei(s.toDue, 2) + ' (rămâne așa).</p>' : '') +
              K.field('Notă', '<input name="note" value="' + esc(s.note || '') + '" maxlength="300" placeholder="opțional">', 'full')
            : '<label class="pay-check full"><input type="checkbox" name="upsell" value="true"' + (s.upsell ? ' checked' : '') + '><span class="pay-box">' + icon('check') + '</span><span><b>Upsell efectuat</b><small>Toată suma e upsell. Comisionul se recalculează cât timp nu e aprobat.</small></span></label>') +
          '</form></section>'
          : '<div class="mo-note">' + icon('info') + 'Ai văzut o greșeală? Spune ce trebuie corectat și se rezolvă.</div>'),
      footer: (admin ? '<button type="button" class="k-btn is-danger is-sm" data-del>' + icon('trash') + 'Șterge</button>' : '') + '<span class="k-grow"></span>' +
        (canRefund && Number(s.refunded || 0) < Number(s.amount) - 0.005 ? '<button type="button" class="k-btn is-outline" data-refund>' + icon('undo') + 'Rambursare</button>' : '') +
        (admin ? '<button type="button" class="k-btn is-primary" data-save>' + icon('check') + 'Salvează</button>' : ''),
      onMount(el) {
        const rb = el.querySelector('[data-refund]');
        if (rb) rb.addEventListener('click', () => openRefund(s.id, from || rb, {}));
        if (!admin) return;
        const f = el.querySelector('[data-form]');
        f.addEventListener('change', (e) => {
          if (e.target.name === 'method') el.querySelector('[data-split]').hidden = e.target.value !== 'cash_card';
          if (e.target.name === 'upsell') el.querySelector('[data-pups]').hidden = !e.target.checked;
        });
        // a payment of parts: the total follows them
        const ptotal = () => { if (locked) return Number(s.amount) || 0; const v = K.formValues(f); const ups = !!f.querySelector('input[name=upsell]').checked; return Math.round(((Number(v.session) || 0) + (ups ? Number(v.upsellPaid) || 0 : 0) + (Number(s.toDue) || 0)) * 100) / 100; };
        f.addEventListener('input', () => { el.querySelector('[data-ptotal]').textContent = K.lei(ptotal(), 2); });
        f.addEventListener('change', () => { el.querySelector('[data-ptotal]').textContent = K.lei(ptotal(), 2); });
        el.querySelector('[data-save]').addEventListener('click', (e) => K.busy(e.currentTarget, async () => {
          const v = K.formValues(f);
          if (locked) Object.assign(v, { date: s.date, performedBy: s.performedBy || '', session: P0.session, upsellValue: upsV0, upsellPaid: P0.upsell });
          // the money of a month before this one moves: said before it is saved
          const upsOn = !!f.querySelector('input[name=upsell]').checked;
          const moved = Math.abs(ptotal() - (Number(s.amount) || 0)) > 0.005 || v.date !== s.date || (v.performedBy || '') !== (s.performedBy || '') || Math.abs((upsOn ? Number(v.upsellValue) || 0 : 0) - upsV0) > 0.005;
          const pastM = [s.date, v.date].map((x) => String(x || '').slice(0, 7)).filter((x, i, a) => x && x < K.today().slice(0, 7) && a.indexOf(x) === i);
          if (moved && pastM.length && !(await K.ui().confirm({ title: 'Corectezi încasarea?', message: closedTxt(pastM[0]), confirmText: 'Corectează', from: e.currentTarget }))) return;
          try {
            const upsell = upsOn;
            await K.api('/api/portal-incasari', Object.assign({ action: 'update', id: s.id }, v, true
              ? { amount: ptotal(), cashAmount: Number(v.cashAmount) || 0, cardAmount: Number(v.cardAmount) || 0, categories: String(v.categories || '').split(',').filter(Boolean),
                parts: { session: Number(v.session) || 0, crossTo: v.crossTo || '', upsell, upsellValue: Number(v.upsellValue) || 0, upsellPaid: Number(v.upsellPaid) || 0, upsellWhat: v.upsellWhat || '' } }
              : { amount: Number(v.amount), cashAmount: Number(v.cashAmount) || 0, cardAmount: Number(v.cardAmount) || 0, categories: String(v.categories || '').split(',').filter(Boolean), upsell, upsellAmount: upsell ? Number(v.amount) || 0 : 0 }));
            d.close(); K.ui().toast('Încasare corectată.', 'success'); K.reload(); DUES.at = 0; loadDues(true);
          } catch (err) { K.ui().toast(err.code === 'has_refunds' ? 'Are o rambursare: sumele, data și cine a lucrat rămân.' : err.code === 'invalid_split' ? 'Cash + card trebuie să dea suma totală.' : err.code === 'invalid_upsell' ? 'Scrie valoarea upsell-ului.' : err.code === 'invalid_amount' ? 'Totalul trebuie să fie mai mare de 0.' : err.code === 'invalid_package' ? 'Plătit acum nu poate fi mai mult decât valoarea upsell-ului.' : K.errText(err), 'error'); }
        }));
        el.querySelector('[data-del]').addEventListener('click', async () => {
          const pastDel = String(s.date).slice(0, 7) < K.today().slice(0, 7);
          if (!(await K.ui().confirm({ title: 'Ștergi încasarea?', message: K.lei(s.amount, 2) + ' · ' + s.client + ' dispare din totaluri, iar programarea redevine neîncasată.' + (s.upsell ? ' Comisionul upsell-ului se șterge și el.' : '') + (pastDel ? ' ' + closedTxt(String(s.date).slice(0, 7)) : ''), confirmText: 'Șterge', danger: true, from: el.querySelector('[data-del]') }))) return;
          try { await K.api('/api/portal-incasari', { action: 'delete', id: s.id }); d.close(); K.ui().toast('Încasare ștearsă.', 'success'); K.reload(); DUES.at = 0; loadDues(true); }
          catch (err) { K.ui().toast(err.code === 'has_refunds' ? 'Are o rambursare. Anuleaz-o întâi, din rândul ei.' : err.code === 'has_package_payments' ? 'Pachetul are și alte plăți. Șterge-le întâi pe ele.' : K.errText(err), 'error'); }
        });
      },
    });
  }

  // ---------------- Rambursare (16.11): the owner and the manager (her clinics). The sheet grows out of the payment's row
  // (or the package's) and says exactly what happens before anything is written: the money that goes back, whose
  // commission goes down and by how much, the package's rest. The server works it out (api/_lib/refunds.js plan), so
  // the sheet and the refund are the same numbers.
  const MONTHS_RO = ['ianuarie', 'februarie', 'martie', 'aprilie', 'mai', 'iunie', 'iulie', 'august', 'septembrie', 'octombrie', 'noiembrie', 'decembrie'];
  const monthIn = (d) => 'în ' + MONTHS_RO[Number(String(d).slice(5, 7)) - 1];
  function openRefund(saleId, from, o) {
    const s = (K.data.incasari || []).find((x) => x.id === saleId) || { id: saleId, client: '', treatment: '', date: K.today(), amount: 0 };
    const st = { scope: o.scope || 'payment', dueId: o.dueId || '', amount: '', close: o.scope === 'package', plan: null, seq: 0, touched: false, closeTouched: false, why: '' };
    // „Închide pachetul” turns on by itself when everything paid on it goes back, or the reason says she isn't coming
    const GONE = /nu mai (vine|poate|vrea|continu)|renun[țţt]|se mut|plec|anul|nu mai are timp|s-a r[ăa]zg[âa]ndit/i;
    // the money goes back on a day of this month (a month before is closed: its salaries are paid), never before the payment
    const m0 = K.today().slice(0, 7) + '-01', minDay = s.date > m0 ? s.date : m0;
    const d = K.drawer({
      title: 'Rambursare', icon: 'undo', width: 520, from, focus: false,
      subtitle: esc(s.client || 'Clientă') + ' · ' + esc(String(s.treatment || '').replace(/^Upsell · /, '')) + (s.date ? ' · ' + esc(K.dateShort(s.date)) : ''),
      body: '<form class="k-form rf-form" data-form>' +
        '<div class="k-field full" data-scope hidden></div>' +
        K.field('Suma dată înapoi', '<div class="k-money"><input name="amount" type="number" inputmode="decimal" min="0" step="0.01" placeholder="0"></div>', 'full', '<span data-max></span>') +
        '<div class="k-field full" data-close hidden></div>' +
        K.field('Cum se dau banii', K.seg('method', [['card', 'Card', 'card'], ['cash', 'Cash', 'cash'], ['transfer', 'Transfer', 'bank']], s.method === 'cash' || s.method === 'transfer' ? s.method : 'card'), 'full') +
        K.field('Data', '<input name="date" type="date" value="' + K.today() + '" min="' + minDay + '" max="' + K.today() + '">', 'full') +
        K.field('Motivul', '<textarea name="reason" rows="2" maxlength="300" placeholder="ex. nu mai poate veni la ședințe"></textarea>', 'full') +
        '<section class="rf-what" data-what><div class="k-skel" style="height:96px"></div></section>' +
        '</form>',
      footer: '<span class="k-grow"></span><button type="button" class="k-btn" data-cancel>Renunță</button><button type="button" class="k-btn is-primary" data-ok disabled>' + icon('undo') + 'Rambursează</button>',
      onMount(el) {
        const f = el.querySelector('[data-form]');
        const ok = el.querySelector('[data-ok]');
        el.querySelector('[data-cancel]').addEventListener('click', () => d.close());
        f.addEventListener('submit', (e) => { e.preventDefault(); ok.click(); });
        let t = 0;
        const ask = () => { clearTimeout(t); t = setTimeout(preview, 220); };
        f.addEventListener('input', (e) => { if (e.target.name === 'amount') { st.touched = true; st.amount = e.target.value; ask(); } });
        f.addEventListener('change', (e) => {
          if (e.target.name === 'rfscope') { st.scope = e.target.value; st.touched = false; st.amount = ''; st.close = st.scope === 'package'; st.why = ''; ask(); }
          if (e.target.name === 'rfclose') { st.close = e.target.checked; st.closeTouched = true; st.why = ''; ask(); }
        });
        f.reason.addEventListener('input', () => { if (st.plan) autoClose(st.plan); });
        // the package closes by itself (until it is set by hand): everything paid goes back, or she isn't coming
        function autoClose(p) {
          if (st.closeTouched || !p || !p.pkg) return false;
          const all = p.pkg.paid > 0 && p.fromPkg >= p.pkg.paid - 0.005, gone = GONE.test(f.reason.value || '');
          const want = all || gone;
          st.why = want ? (all ? 'se dă înapoi tot ce a plătit pe el' : 'motivul spune că nu mai vine') : '';
          if (want !== st.close) { st.close = want; ask(); return true; }
          if (st.plan) el.querySelector('[data-what]').innerHTML = whatHtml(st.plan);
          return false;
        }
        async function preview() {
          const seq = ++st.seq;
          let p;
          try { p = await K.api('/api/portal-incasari', { action: 'refund_preview', id: s.id, scope: st.scope, dueId: st.dueId, amount: st.touched ? st.amount : '', close: st.close }); }
          catch (err) { p = { error: err.code || 'x', max: err.data && err.data.max }; }
          if (seq !== st.seq || !el.isConnected) return;
          paint(p);
        }
        function paint(p) {
          st.plan = p.error ? null : p;
          const sc = el.querySelector('[data-scope]');
          // a payment into a package: this payment, or the whole package (every payment of it)
          if (p.pkg && !sc.dataset.on) {
            sc.dataset.on = '1'; sc.hidden = false; st.dueId = st.dueId || p.pkg.id;
            sc.innerHTML = '<span>Ce rambursezi</span>' + K.seg('rfscope', [['payment', 'Plata asta'], ['package', 'Tot pachetul']], st.scope);
          }
          if (!st.touched && p.max != null) f.amount.value = p.max;
          el.querySelector('[data-max]').textContent = p.max != null ? 'cel mult ' + K.lei(p.max, 2) + (st.scope === 'package' ? ', cât s-a plătit pe pachet' : ', cât s-a plătit și nu s-a rambursat încă') : '';
          const cl = el.querySelector('[data-close]');
          const pk = p.pkg || (st.plan && st.plan.pkg);
          if (pk) {
            cl.hidden = false;
            if (!cl.dataset.on) { cl.dataset.on = '1'; cl.innerHTML = K.toggle('rfclose', st.close, 'Închide pachetul') + '<small class="k-muted" data-close-sub></small>'; }
            cl.querySelector('input').checked = st.close;
            const left = p.error ? pk.rest : pk.rest + (p.fromPkg || 0);
            cl.querySelector('[data-close-sub]').textContent = st.close ? 'Nu mai rămâne nimic de încasat din el.' : 'Rămâne de încasat ' + K.lei(left, 2) + ', valoarea pachetului rămâne.';
          } else cl.hidden = true;
          if (!p.error && autoClose(p)) return; // the close changed: the preview comes again with it
          el.querySelector('[data-what]').innerHTML = whatHtml(p);
          ok.disabled = !st.plan;
          ok.innerHTML = icon('undo') + (st.plan ? 'Rambursează ' + K.lei(st.plan.lei, 2) : 'Rambursează');
        }
        function whatHtml(p) {
          if (p.error) return '<p class="rf-err">' + icon('alert') + (p.error === 'over_paid' ? 'E mai mult decât s-a plătit: cel mult ' + K.lei(p.max, 2) + '.' : p.error === 'invalid_amount' ? 'Scrie suma dată înapoi.' : K.errText({ code: p.error })) + '</p>';
          const day = f.date.value || K.today();
          const li = (ic, tone, html) => '<li class="' + (tone ? 'is-' + tone : '') + '">' + icon(ic) + '<span>' + html + '</span></li>';
          const out = [li('wallet', 'bad', 'Clientei i se dau înapoi <b>' + K.lei(p.lei, 2) + '</b>. Încasările scad cu atât ' + monthIn(day) + '.')];
          if (p.fromPkg > 0 && p.fromSession > 0) out.push(li('info', '', K.lei(p.fromPkg, 2) + ' din pachet și ' + K.lei(p.fromSession, 2) + ' din ședință.'));
          p.cuts.forEach((c) => out.push(li('percent', 'warn', 'Comisionul ' + (c.status === 'pending' ? 'în așteptare ' : '') + 'pentru <b>' + esc(String(c.name || 'cosmeticiană').split(' ')[0]) + '</b> scade cu <b>' + K.lei(c.lei, 2) + '</b> (4% din ' + K.lei(c.cash, 2) + ')' + (c.status === 'pending' ? '.' : ', ' + monthIn(day) + '.'))));
          if (!p.cuts.length) out.push(li('percent', '', 'Niciun comision nu se schimbă.'));
          if (p.pkg) {
            const paidAfter = Math.max(0, p.pkg.paid - p.fromPkg);
            out.push(p.close ? li('x', 'bad', '<b>Pachetul se închide</b>' + (st.why ? ' (pornit singur: ' + esc(st.why) + ')' : '') + ': ' + (p.restCut > 0 ? 'restul de ' + K.lei(p.restCut, 2) + ' nu se mai încasează. ' : 'nu mai rămâne nimic de încasat. ') + 'Rămâne plătit ' + K.lei(paidAfter, 2) + '.')
              // not closed: the package keeps its value, what goes back is owed again
              : li('receipt', '', 'Pachetul rămâne: plătit ' + K.lei(paidAfter, 2) + ' din ' + K.lei(p.pkg.total, 2) + ', rest ' + K.lei(p.pkg.rest + p.fromPkg, 2) + ' de încasat.'));
          }
          out.push(li('undo', '', 'Se poate anula oricând, din rândul rambursării.'));
          return '<h4>Ce se întâmplă</h4><ul class="rf-sum">' + out.join('') + '</ul>';
        }
        f.date.addEventListener('change', () => { if (st.plan) el.querySelector('[data-what]').innerHTML = whatHtml(st.plan); });
        ok.addEventListener('click', (e) => K.busy(e.currentTarget, async () => {
          const v = K.formValues(f);
          if (!String(v.reason || '').trim()) { K.ui().toast('Scrie motivul.', 'error'); f.reason.focus(); return; }
          try {
            const r = await K.api('/api/portal-incasari', { action: 'refund', id: s.id, scope: st.scope, dueId: st.dueId, amount: Number(f.amount.value) || 0, close: st.close, method: v.method, date: v.date, reason: v.reason });
            d.close();
            K.ui().toast('Rambursat ' + K.lei(r.lei, 2) + (r.close ? '. Pachetul e închis.' : '.'), 'success');
            K.reload(); DUES.at = 0; loadDues(true);
          } catch (err) {
            K.ui().toast(err.code === 'over_paid' ? 'E mai mult decât s-a plătit.' : err.code === 'invalid_date' ? 'Data: din luna asta, de la plată până azi.' : err.code === 'missing_reason' ? 'Scrie motivul.' : err.code === 'forbidden' ? 'Plata e la altă clinică.' : K.errText(err), 'error');
          }
        }));
        preview();
      },
    });
  }
  // a refund's own sheet: what it was, and taking it back
  function openRefundRow(s, from) {
    const canUndo = K.canManage() && !(K.data && K.data.impersonating);
    const d = K.drawer({
      title: K.lei(s.amount, 2), icon: 'undo', width: 480, from, focus: false,
      subtitle: esc(s.client || 'Clientă') + ' · rambursare · ' + esc(K.dateLong(s.date)),
      body: '<dl class="k-kv"><dt>Ce</dt><dd>' + esc(String(s.treatment || '').replace(/^Rambursare · /, '')) + '</dd><dt>Motiv</dt><dd>' + esc(s.reason || '-') + '</dd>' +
        '<dt>Cum</dt><dd>' + esc((METHODS[s.method] || METHODS.card).label) + '</dd>' + (s.scope === 'package' ? '<dt>Pachet</dt><dd>' + (s.whole ? 'tot pachetul' : 'o parte') + '</dd>' : '') +
        ((s.restCut || []).length ? '<dt>Rest anulat</dt><dd>' + K.lei(s.restCut.reduce((a, x) => a + Number(x.lei || 0), 0), 2) + '</dd>' : '') +
        '<dt>A făcut-o</dt><dd>' + esc(s.employeeName || '-') + (s.createdAt ? ' · ' + esc(K.ago(s.createdAt)) : '') + '</dd></dl>',
      footer: '<span class="k-grow"></span><button type="button" class="k-btn" data-cancel>Închide</button>' + (canUndo ? '<button type="button" class="k-btn is-outline" data-undo>' + icon('refresh') + 'Anulează rambursarea</button>' : ''),
      onMount(el) {
        el.querySelector('[data-cancel]').addEventListener('click', () => d.close());
        const u = el.querySelector('[data-undo]');
        if (u) u.addEventListener('click', async () => {
          if (!(await K.ui().confirm({ title: 'Anulezi rambursarea?', message: K.lei(-s.amount, 2) + ' revin în încasări, pachetul și comisionul revin cum erau.', confirmText: 'Anulează rambursarea' }))) return;
          try { await K.api('/api/portal-incasari', { action: 'refund_undo', id: s.id }); d.close(); K.ui().toast('Rambursare anulată.', 'success'); K.reload(); DUES.at = 0; loadDues(true); }
          catch (err) { K.ui().toast(K.errText(err), 'error'); }
        });
      },
    });
  }

  function exportCsv() {
    const rows = filtered().slice().sort((a, b) => (a.date < b.date ? -1 : 1));
    if (!rows.length) { K.ui().toast('Nimic de exportat pentru filtrul ales.', 'info'); return; }
    const [a, b] = range();
    K.csv('incasari-' + a + (a !== b ? '_' + b : '') + (S.loc !== 'all' ? '-' + K.norm(S.loc) : '') + '.csv', [['Data', 'Oraș', 'Clientă', 'Tratament', 'Categorie', 'Sumă (lei)', 'Metodă', 'Cash', 'Card', 'Ședința', 'Cross-sell (în loc de)', 'Upsell (valoare)', 'Upsell plătit acum', 'Din restul pachetului', 'A făcut tratamentul', 'Înregistrat de']]
      .concat(rows.map((s) => [s.date, s.location || '', s.client, s.treatment, K.catLabel(s), String(s.amount).replace('.', ','), (METHODS[s.method] || {}).label || s.method,
        s.split ? String(s.split.cash).replace('.', ',') : s.method === 'cash' ? String(s.amount).replace('.', ',') : '', s.split ? String(s.split.card).replace('.', ',') : s.method === 'card' ? String(s.amount).replace('.', ',') : '',
        s.parts ? String(s.parts.session).replace('.', ',') : '', s.crossSell ? s.crossSell.from : '',
        s.upsell ? String(s.upsell).replace('.', ',') : '', s.parts && s.upsell ? String(s.parts.upsell).replace('.', ',') : '', s.toDue ? String(s.toDue).replace('.', ',') : '', s.performedByName || '', s.employeeName || ''])));
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
  K.on('incasari:new', (pre) => { if (K.frontDesk && K.frontDesk()) openNew(pre || {}); else K.ui().toast('Încasările le face recepția.', 'info'); });
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
      const mp = e.target.closest('[data-mg-propose]');
      if (mp) mgPropose(mp);
      const cc = e.target.closest('[data-comm-cancel]');
      if (cc) cancelComm(cc.dataset.commCancel);
    });
  }

  // "+ Adaugă comision": an upsell of hers the payment didn't carry (a package she sold, a zone added); it waits for the
  // owner's approval, the commission shown is what it would bring (4% of the money, the one rule shown everywhere)
  function openCommNew() {
    const d = K.drawer({
      title: 'Adaugă comision', icon: 'percent', width: 520, 
      body: '<form class="k-form" data-form>' +
        K.field('Data', '<input name="date" type="date" required value="' + K.today() + '" max="' + K.today() + '">', 'full') +
        K.field('Clienta', '<input name="clientName" required maxlength="150" placeholder="Caută sau scrie numele" autocomplete="off">', 'full') +
        K.field('Telefon (opțional)', '<input name="clientPhone" type="tel" maxlength="30" placeholder="07xx xxx xxx">', 'full') +
        K.field('Ce ai vândut', '<input name="treatment" required maxlength="200" placeholder="ex. pachet 6 ședințe LipoSonix, o zonă în plus">', 'full') +
        K.field('Categorie', K.catPicker([]), 'full') +
        K.field('Valoarea upsell-ului', '<div class="k-money"><input name="amount" type="number" inputmode="decimal" min="1" step="1" required placeholder="0"></div>', 'full') +
        '<div class="pay-note" data-comm-est></div>' +
        K.field('Notă (opțional)', '<textarea name="note" rows="2" maxlength="500" placeholder="ex. a plătit la recepție, nu s-a bifat upsell"></textarea>', 'full') +
        '</form>',
      footer: '<span class="k-grow"></span><button type="button" class="k-btn" data-k-close2>Renunță</button><button type="button" class="k-btn is-accent" data-save>' + icon('check') + 'Trimite la aprobare</button>',
      onMount(el) {
        const f = el.querySelector('[data-form]');
        const picker = K.clientPicker(f.clientName, f.clientPhone);
        const est = () => {
          const v = Number(f.amount.value) || 0;
          el.querySelector('[data-comm-est]').innerHTML = v > 0 ? '<span>Comision: <b>' + K.lei(K.commissionOf(v), 2) + '</b>, 4% din banii încasați, după aprobare.</span>' : '';
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
    catch (err) { K.ui().toast(err.code === 'already_decided' ? 'Cererea e deja decisă.' : K.errText(err), 'error'); }
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
    return '<section class="k-card sl-bonus"><div class="k-card-head"><h3>' + icon('trophy') + 'Bonusul de programări</h3>' + (bk.frozen ? '<span class="k-tag">oprit la ' + esc(K.dateShort(bk.frozen)) + '</span>' : '') + '</div>' +
      // the manager: what she made as reception until she became manager, frozen (paid for those days; nothing after)
      (bk.frozen ? '<div class="mo-note">' + icon('info') + 'Bonusul de recepție se oprește din ziua schimbării rolului. Rămâne ce ai făcut până atunci, pentru zilele de recepție.</div>' : '') +
      '<div class="sl-bk-top"><div><span>Media ta</span><b>' + K.num(bk.avg) + '</b><small>programări / zi · ' + K.plural(bk.days, 'zi pontată', 'zile pontate') + ', ' + bk.total + ' programări</small></div>' +
        '<div class="sl-bk-now' + (bk.lei ? ' is-on' : '') + '"><span>Bonus</span><b>' + K.lei(bk.lei) + '</b>' +
        (bk.next ? '<small>' + (bk.days ? 'Încă ' + avg1(Math.max(0.1, Math.ceil((bk.next.min - bk.avg) * 10) / 10)) + ' pe zi pentru ' + K.lei(bk.next.lei) : 'de la ' + bk.next.min + ' pe zi') + (isNow && daysLeft ? ' · ' + K.plural(daysLeft, 'zi rămasă', 'zile rămase') : '') + '</small>'
          : bk.lei && bk.lei >= Math.max(...tiers.map((t) => t.lei)) ? '<small>Treapta cea mai mare. Bravo!</small>'
          : '<small>' + (bk.frozen ? 'Oprit la ' + esc(K.dateShort(bk.frozen)) + (bk.lei ? '' : ', sub prima treaptă (' + tiers[0].min + ' pe zi)') : 'de la ' + tiers[0].min + ' pe zi') + '</small>') + '</div></div>' +
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
      title: 'Personalizează Salariul', 
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

  // the commission's lines (from November 2026, api/_lib/commission.js): one per payment received for an upsell, the
  // refunds that took some back, and what is still to come from the packages' rests. Salariu (hers) and Echipa → Salarii.
  const lei2s = (v) => K.lei(v, Math.round(v * 100) % 100 ? 2 : 0);
  // Bonusul pe pachete (_lib/commission.js PACK): the rule in plain words and how many 1.500+ payments she has today
  function packHtml(pay) {
    const P = pay && pay.pack;
    const today = K.today();
    if (!P || (P.until && today > P.until)) return '';
    const mine = (pay.commissionLines || []).filter((l) => l.kind === 'pay' && l.date === today && l.pack);
    const lei = mine.reduce((a, l) => a + l.lei, 0);
    const live = today >= P.from;
    return '<div class="pk-box"><b>Bonus pachete · de la ' + esc(K.dateShort(P.from)) + '</b>' +
      '<p>La fiecare plată de pachet: 1.500-1.999 lei = <b>100 lei</b>, 2.000-2.499 lei = <b>150 lei</b>, 2.500-2.999 lei = <b>200 lei</b>, 3.000+ lei = <b>350 lei</b>. ' +
      'Contează și avansul. În plus: <b>+50 lei</b> la a 3-a vânzare din zi și la fiecare după ea, <b>+100 lei</b> când o clientă care a mai cumpărat un pachet cumpără altul. Sub 1.500 rămâne comisionul obișnuit.</p>' +
      (live ? '<p class="pk-now">Azi: <b>' + mine.length + '</b> ' + (mine.length === 1 ? 'pachet' : 'pachete') + (lei ? ' · <b>+' + lei2s(lei) + '</b> bonus' : '') + '</p>' : '') + '</div>';
  }
  // Premiul echipei (_lib/payroll.js TEAM): this week's packages of the whole team against the two steps, and the weeks won
  function teamHtml(pay) {
    const T = pay && pay.team;
    if (!T || !T.weeks.length) return '';
    const [hi, lo] = T.tiers;
    const now = T.weeks.find((w) => !w.done);
    const won = T.weeks.filter((w) => w.done && w.lei);
    const pk = (n) => K.plural(n, 'pachet', 'pachete');
    const pct = now ? Math.min(100, Math.round((now.packages / hi.min) * 100)) : 0;
    return '<section class="k-card cb-sec pk-team"><div class="k-card-head"><h3>' + icon('users') + 'Premiul echipei</h3><span class="k-sub">' + (T.lei ? '+' + lei2s(T.lei) + ' luna asta' : '') + '</span></div>' +
      '<p>Când echipa vinde într-o săptămână (luni-duminică) <b>' + pk(lo.min) + '</b>, fiecare primește <b>' + lei2s(lo.lei) + '</b>. La <b>' + pk(hi.min) + '</b>, fiecare primește <b>' + lei2s(hi.lei) + '</b>. ' +
      'Se numără pachetele de ' + lei2s(T.min) + ' sau mai mult, din ambele clinici, cu avansul încasat. Primește oricine a lucrat în săptămâna aceea, și recepția.</p>' +
      (now ? '<div class="pk-bar"><i style="width:' + pct + '%"></i><em style="left:' + Math.round((lo.min / hi.min) * 100) + '%"></em></div>' +
        '<p class="pk-now">Săptămâna asta: <b>' + pk(now.packages) + '</b>' + (now.packages >= hi.min ? ' · premiul de ' + lei2s(hi.lei) + ' e atins' : now.packages >= lo.min ? ' · ' + lei2s(lo.lei) + ' atins, încă ' + (hi.min - now.packages) + ' până la ' + lei2s(hi.lei) : ' · încă ' + (lo.min - now.packages) + ' până la ' + lei2s(lo.lei)) + '</p>' : '') +
      (won.length ? '<p class="pk-won">' + won.map((w) => esc(K.dateShort(w.from)) + ' - ' + esc(K.dateShort(w.to)) + ': +' + lei2s(w.lei)).join(' · ') + '</p>' : '') + '</section>';
  }
  function commLinesHtml(lines, toCome, o) {
    o = o || {};
    const what = (l) => (/^pachet/i.test(l.what || '') ? '' : 'pachet ') + esc(l.what || 'upsell') + (l.client && !o.noClient ? ', ' + esc(l.client) : '');
    const row = (cls, title, sub, lei, extra) => '<li class="' + cls + '"><div class="cl-main"><b>' + title + '</b><small>' + sub + '</small></div>' + (extra || '') + '<span class="cl-lei">' + lei + '</span></li>';
    const wait = (l) => (l.status === 'pending' ? ' is-wait' : '');
    const waitTxt = (l) => (l.status === 'pending' ? ' · în așteptare' : '');
    const out = (lines || []).map((l) => {
      const day = esc(K.dateShort(l.date));
      const EX = { third: 'a 3-a vânzare din zi +50', again: 'clientă care revine +100' };
      if (l.kind === 'pay') return row('is-pay' + wait(l), (l.pack ? 'Bonus pachet din ' : 'Comision din ') + lei2s(l.cash) + ' încasați' + (l.extras ? ' · ' + l.extras.map((x) => EX[x]).join(', ') : ''), what(l) + ', ' + lei2s(l.paidSoFar) + ' din ' + lei2s(l.total) + ' · ' + day + waitTxt(l), '+' + lei2s(l.lei));
      if (l.kind === 'whole') return row('is-pay' + wait(l), 'Upsell ' + lei2s(l.cash), what(l) + ' · comision pe toată valoarea · ' + day + waitTxt(l), '+' + lei2s(l.lei),
        o.cancel && l.status === 'pending' && o.cancel(l.upsellId) ? '<button type="button" class="k-btn is-ghost is-sm" data-comm-cancel="' + esc(l.upsellId) + '">Retrage</button>' : '');
      if (l.kind === 'refund') return row('is-cut' + wait(l), 'Rambursare ' + lei2s(-l.cash), what(l) + (l.reason ? ' · ' + esc(l.reason) : '') + ' · ' + day + waitTxt(l), '−' + lei2s(-l.lei));
      return row('is-cut' + wait(l), 'Rest anulat ' + lei2s(-l.cash), what(l) + ' închis, comisionul fusese pe toată valoarea · ' + day, '−' + lei2s(-l.lei));
    });
    const come = (toCome || []).map((t) => row('is-come', 'încă ' + lei2s(t.rest) + ' de încasat → ' + lei2s(t.lei) + ' comision', what(t) + ', plătit ' + lei2s(t.paid) + ' din ' + lei2s(t.total) + (t.status === 'pending' ? ' · după aprobare' : ''), lei2s(t.lei)));
    if (!out.length && !come.length) return '';
    return (out.length ? '<ul class="cl-lines">' + out.join('') + '</ul>' : '') +
      (come.length ? '<div class="cl-head"><span>De încasat din pachete</span><span>' + lei2s(toCome.reduce((a, t) => a + t.lei, 0)) + '</span></div><ul class="cl-lines">' + come.join('') + '</ul>' : '');
  }
  K.commLinesHtml = commLinesHtml;
  K.teamHtml = teamHtml;

  function renderComision() {
    if (!cpanel || !K.data) return;
    const D = K.data;
    const me = D.me;
    // the manager: her own page (the bonus of a manager, not the commission or the booking bonus)
    if (me.role === 'manager') { renderManager(); return; }
    const isNow = C.month === K.thisMonth();
    const today = K.today();
    const dim = K.daysIn(C.month);
    const dayNow = isNow ? Number(today.slice(8, 10)) : dim;
    const prevM = K.addMonths(C.month, -1);
    const months = (D.salary && D.salary.months) || [];
    const pay = months.find((m) => m.month === C.month) || null;
    const RULE = K.commissionRule();
    const isDesk = me.role === 'receptie' || me.role === 'manager';
    const addBtn = cpanel.querySelector('[data-comm-new]');
    // only a cosmetician's commission is paid (16.11: hidden for reception and the manager; .k-btn's display beat `hidden`)
    if (addBtn) { addBtn.hidden = me.role !== 'cosmetician'; addBtn.style.display = me.role === 'cosmetician' ? '' : 'none'; }

    // ---- commission lines (cosmeticians)
    const sales = (D.mySales || []);
    const inMonth = sales.filter((s) => K.monthOf(s.date) === C.month && s.status !== 'rejected');
    const upsTotal = inMonth.reduce((a, s) => a + Number(s.amount || 0), 0);
    const inc = D.incasari || [];
    const doneOf = (m, uptoDay) => inc.filter((s) => s.performedBy === me.id && K.monthOf(s.date) === m && (!uptoDay || Number(s.date.slice(8, 10)) <= uptoDay));
    // her treatments (a refund is not one); what they brought in: net of the refunds (K.net)
    const doneAll = doneOf(C.month), donePrevAll = doneOf(prevM, isNow ? dayNow : 0);
    const done = K.pays(doneAll);
    const donePrev = K.pays(donePrevAll);
    const doneValue = K.net(doneAll);
    const donePrevValue = K.net(donePrevAll);
    const withUpsell = done.filter((s) => Number(s.upsell) > 0).length;
    const upRate = done.length ? Math.round((withUpsell / done.length) * 100) : 0;
    const days = Array.from({ length: dim }, (_, i) => C.month + '-' + K.pad(i + 1));
    const daily = days.map((dd) => K.net(doneAll.filter((s) => s.date === dd)));
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
          tile('user', 'Salariu de bază', pay.base ? K.lei(pay.base) : 'încă nu', pay.base ? 'net, pe lună' : 'nesetat încă') +
          tile('clock', 'Ore suplimentare', lei2(pay.overtimeLei), pay.overtimeMinutes ? hm(pay.overtimeMinutes) + ' × 40 lei' + (pay.overtimeDueLei ? ', neplătite încă (toate lunile), vin cu salariul' : '') : 'nicio oră luna asta') +
          (pay.hasBonus ? tile('trophy', 'Bonus programări', K.lei(pay.bonus), pay.booking && pay.booking.days ? 'media ' + avg1(pay.booking.avg) + ' pe zi' : 'nicio zi pontată încă', pay.bonus ? 'is-good' : '')
            : tile('percent', 'Comision', lei2(pay.commission), K.plural(pay.upsells, 'upsell', 'upselluri') + (pay.commissionWaiting ? ' · ' + lei2(pay.commissionWaiting) + ' în așteptare' : ''))) +
          (pay.manual ? tile('sliders', 'Comision adăugat', (pay.manual > 0 ? '+' : '') + lei2(pay.manual), 'luna asta', pay.manual > 0 ? 'is-good' : '') : '') +
        '</div></section>';

    // the treatments and upsells (cosmeticians)
    const listsHtml = isDesk ? '' :
        '<div class="mo-row cb-lists">' +
          '<section class="k-card"><div class="k-card-head"><h3>' + icon('sparkles') + 'Tratamentele tale</h3><span class="k-sub">' + K.plural(done.length, 'tratament', 'tratamente') + '</span></div>' +
            (done.length ? '<div class="k-list">' + done.slice().sort((a, b) => (a.date < b.date ? 1 : -1)).slice(0, 40).map((s) =>
              '<div class="k-row"><div class="k-row-main"><div class="k-row-title">' + esc(s.client || '-') + '</div><div class="k-row-sub">' + esc(K.dateShort(s.date)) + ' · ' + esc(s.treatment || '') + '</div></div>' +
              '<div class="k-row-end">' + (s.upsell ? '<span class="k-tag is-good">upsell</span>' : '') + '<span class="k-amount">' + K.lei(s.amount) + '</span></div></div>').join('') + '</div>'
              : K.empty('sparkles', 'Niciun tratament încasat', 'Tratamentele la care ești trecută la încasare apar aici.')) + '</section>' +
          (pay && pay.commissionLines ? '<section class="k-card"><div class="k-card-head"><h3>' + icon('percent') + 'Comisionul tău</h3><span class="k-sub">' + lei2(pay.commission) + (pay.commissionWaiting ? ' · ' + lei2(pay.commissionWaiting) + ' în așteptare' : '') + '</span></div>' +
            packHtml(pay) +
            (commLinesHtml(pay.commissionLines, pay.toCome, { cancel: (id) => { const x = sales.find((y) => y.id === id); return x && x.origin === 'manual'; } }) ||
              K.empty('trend', 'Niciun comision luna asta', 'Comisionul vine din banii încasați pentru upsellurile tale: 4% din fiecare plată.', me.role === 'cosmetician' ? '<button type="button" class="k-btn is-accent is-sm" data-comm-new>' + icon('plus') + 'Adaugă comision</button>' : '')) + '</section>' :
          '<section class="k-card"><div class="k-card-head"><h3>' + icon('percent') + 'Upsellurile tale</h3><span class="k-sub">' + (pay ? lei2(pay.commission) + ' comision' : '') + '</span></div>' +
            (inMonth.length ? '<div class="k-list">' + inMonth.slice().sort((a, b) => (a.date < b.date ? 1 : -1)).map((s) => {
              const st = SALE_STATUS[s.status] || { label: s.status, tone: '' };
              // what it has brought so far (api/_lib/commission.js summaryOf: 4% of the money received, minus the refunds)
              const cashR = s.cash && s.cash.rule === 'cash';
              const val = s.cash ? Number(s.cash.lei) || 0 : s.status === 'approved' ? Number(s.commission || 0) : (s.commission ? Number(s.commission) : K.commissionOf(s.amount));
              return '<div class="k-row' + (s.status === 'pending' ? ' is-wait' : '') + '"><div class="k-row-main"><div class="k-row-title">' + esc(s.client || s.treatment) + '</div><div class="k-row-sub">' + esc(K.dateShort(s.date)) + ' · ' + esc(String(s.treatment || '').replace(/^Upsell · /, '')) + '</div>' +
                '<div class="cb-calc">' + (cashR ? '<span>Încasat <b>' + K.lei(s.cash.paid, 2) + '</b> din ' + K.lei(s.amount) + '</span><span>4% din banii încasați</span>' + (s.cash.rest > 0 ? '<span>încă ' + K.lei(s.cash.restLei, 2) + ' la restul</span>' : '')
                  : '<span>Upsell <b>' + K.lei(s.amount) + '</b></span><span>4% din valoare</span>') + '</div></div>' +
                '<div class="k-row-end">' + (s.status === 'pending' && s.origin === 'manual' ? '<button type="button" class="k-btn is-ghost is-sm" data-comm-cancel="' + esc(s.id) + '">Retrage</button>' : '') + (s.status === 'approved' ? '' : '<span class="k-tag is-' + st.tone + '">' + st.label + '</span>') + '<span class="k-amount">+' + K.lei(val, 2) + '</span></div></div>';
            }).join('') + '</div>'
              : K.empty('trend', 'Niciun upsell încă', 'Upsellurile la tratamentele făcute de tine apar aici, cu comisionul lor.', me.role === 'cosmetician' ? '<button type="button" class="k-btn is-accent is-sm" data-comm-new>' + icon('plus') + 'Adaugă comision</button>' : '')) + '</section>') +
        '</div>';

    // ---- last months
    const hist = months.filter((m, i) => i === 0 || m.total > 0);
    const histHtml = '<section class="k-card"><div class="k-card-head"><h3>' + icon('calendar') + 'Lunile tale</h3></div>' +
      '<div class="cb-hist sl-hist"><div class="cb-hist-row is-head"><span>Luna</span><span>Salariu</span><span>Ore supl.</span><span>' + (isDesk ? 'Bonus' : 'Comision') + '</span><span>Total</span></div>' +
      hist.map((h) => '<button type="button" class="cb-hist-row' + (h.month === C.month ? ' is-on' : '') + '" data-month="' + h.month + '"><span>' + esc(K.monthLabel(h.month)) + '</span><span data-l="salariu">' + K.lei(h.base) + '</span><span data-l="ore supl.">' + lei2(h.overtimeLei) + '</span><span data-l="' + (isDesk ? 'bonus' : 'comision') + '">' + lei2(isDesk ? h.bonus : h.commission) + '</span><b>' + lei2(h.total) + '</b></button>').join('') + '</div></section>';
    const tips = isDesk ? '' : '<section class="k-card cb-tip"><div class="k-card-head"><h3>' + icon('zap') + 'Cum îți crești comisionul</h3></div>' +
      '<ol><li>La finalul tratamentului spune-i clientei ce ai observat și ce ar ajuta-o să ajungă mai repede la rezultat.</li>' +
      '<li>Recomandă <b>o singură</b> combinație potrivită (ex. grăsime → plus tonifiere; facial → întreținere lunară).</li>' +
      '<li>Programeaz-o pe loc la următoarea ședință.</li></ol>' +
      '<button type="button" class="k-btn is-outline" data-go-train>' + icon('book') + 'Manualul de vânzări</button></section>';

    // ---- every number this page can show (her pick, K.prefs 'sal.kpis') and its blocks ('sal.blocks')
    const st = (ic, label, value, sub, cls) => '<div class="k-stat' + (cls ? ' ' + cls : '') + '"><div class="k-stat-top"><span class="k-stat-ic">' + icon(ic) + '</span><span class="k-stat-l">' + label + '</span></div><div class="k-stat-value">' + value + '</div><div class="k-stat-sub">' + sub + '</div></div>';
    const bkk = pay && pay.booking;
    const bestDone = days.map((dd, i) => [dd, daily[i]]).filter((x) => x[1] > 0).sort((a, b) => b[1] - a[1])[0];
    const SAL = {
      payTotal: { label: 'Salariul în mână', group: 'Salariu', html: () => st('wallet', 'Salariul în mână', pay ? lei2(pay.total) : 'încă nu', isNow ? 'până azi' : esc(K.monthLabel(C.month)), 'is-accent') },
      base: { label: 'Salariu de bază', group: 'Salariu', html: () => st('user', 'Salariu de bază', pay && pay.base ? K.lei(pay.base) : 'încă nu', 'net, pe lună') },
      overtime: { label: 'Ore suplimentare', group: 'Salariu', html: () => st('clock', 'Ore suplimentare', pay ? lei2(pay.overtimeLei) : 'încă nu', pay && pay.overtimeMinutes ? hm(pay.overtimeMinutes) : 'nicio oră') },
      done: { label: 'Tratamente făcute', group: 'Tratamente', roles: ['cosmetician'], html: () => st('sparkles', 'Tratamente făcute', String(done.length), delta(done.length, donePrev.length) + 'vs ' + K.MON_S[Number(prevM.slice(5)) - 1] + '.' + (isNow ? ' (aceleași zile)' : '')) },
      doneValue: { label: 'Încasat din tratamentele tale', group: 'Tratamente', roles: ['cosmetician'], html: () => st('wallet', 'Încasat din tratamentele tale', K.lei(doneValue), delta(doneValue, donePrevValue) + (done.length ? 'bon mediu ' + K.lei(doneValue / done.length) : 'încă nimic luna asta')) },
      ticket: { label: 'Bon mediu', group: 'Tratamente', roles: ['cosmetician'], html: () => st('wallet', 'Bon mediu', K.lei(done.length ? doneValue / done.length : 0), 'pe tratament') },
      bestDay: { label: 'Cea mai bună zi', group: 'Tratamente', roles: ['cosmetician'], html: () => st('trophy', 'Cea mai bună zi', bestDone ? K.lei(bestDone[1]) : 'încă nu', bestDone ? esc(K.dateLong(bestDone[0])) : 'nicio zi încă') },
      upRate: { label: 'Rata de upsell', group: 'Upsell și comision', roles: ['cosmetician'], html: () => st('trend', 'Rata de upsell', upRate + '%', withUpsell + ' din ' + done.length + ' tratamente cu upsell') },
      upAvg: { label: 'Upsell mediu', group: 'Upsell și comision', roles: ['cosmetician'], html: () => st('percent', 'Upsell mediu', K.lei(inMonth.length ? upsTotal / inMonth.length : 0), K.lei(inMonth.length ? K.commissionOf(upsTotal / inMonth.length) : 0, 2) + ' comision / upsell') },
      upCount: { label: 'Număr de upselluri', group: 'Upsell și comision', roles: ['cosmetician'], html: () => st('trophy', 'Upselluri', String(inMonth.length), K.lei(upsTotal) + ' valoare') },
      upValue: { label: 'Valoarea upsellurilor', group: 'Upsell și comision', roles: ['cosmetician'], html: () => st('trend', 'Valoare upsell', K.lei(upsTotal), K.plural(inMonth.length, 'upsell', 'upselluri')) },
      commission: { label: 'Comision aprobat', group: 'Upsell și comision', roles: ['cosmetician'], html: () => st('percent', 'Comision', pay ? lei2(pay.commission) : 'încă nu', 'aprobat', 'is-good') },
      commWaiting: { label: 'Comision în așteptare', group: 'Upsell și comision', roles: ['cosmetician'], html: () => st('clock', 'În așteptare', pay ? lei2(pay.commissionWaiting || 0) : 'încă nu', 'de aprobat', 'is-warn') },
      bkAvg: { label: 'Programări pe zi', group: 'Bonus de programări', roles: ['receptie'], html: () => st('calendar', 'Programări / zi', bkk ? K.num(bkk.avg) : 'încă nu', bkk ? K.plural(bkk.days, 'zi pontată', 'zile pontate') : '-') },
      bkLei: { label: 'Bonusul acum', group: 'Bonus de programări', roles: ['receptie'], html: () => st('trophy', 'Bonus', bkk ? K.lei(bkk.lei) : 'încă nu', bkk && bkk.next ? 'următorul: ' + bkk.next.min + '+ pe zi' : bkk && bkk.lei >= Math.max(...bkk.tiers.map((t) => t.lei)) ? 'treapta cea mai mare' : bkk && bkk.frozen ? 'oprit la ' + esc(K.dateShort(bkk.frozen)) : '-', bkk && bkk.lei ? 'is-good' : '') },
      bkTotal: { label: 'Programări făcute', group: 'Bonus de programări', roles: ['receptie'], html: () => st('calendar', 'Programări făcute', bkk ? String(bkk.total) : 'încă nu', 'luna asta') },
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
          '<p class="cd-rule">' + icon('info') + (C.month >= '2026-11' ? 'Primești 4% din fiecare plată încasată pentru upsell, în luna în care vin banii: 500 lei plătiți din 1.000 înseamnă 20 lei acum și încă 20 când vine restul. La o rambursare, se scad 4% din banii dați înapoi.'
            : 'Din valoarea upsell-ului se scad ' + RULE.cost + '% (cheltuielile medii ale procedurii), iar din ce rămâne primești ' + RULE.rate + '%. Exemplu: 3.000 lei upsell, 120 lei comision.') + '</p>' + kpiRow + '</section>'),
      bonus: () => (pay && pay.hasBonus && pay.booking ? bookingHtml(pay.booking, isNow) : ''),
      chart: () => (done.length ? '<section class="k-card cb-sec"><div class="k-card-head"><h3>' + icon('trend') + 'Pe zile</h3></div><div data-cbchart></div></section>' : ''),
      lists: () => listsHtml,
      history: () => histHtml,
      tips: () => tips,
    };
    // her own row of the 1.500 lei a day (this month): right under the pay, the same bar the manager's condition draws
    const dt = isNow && me.role === 'cosmetician' && D.salary && D.salary.dayTarget ? K.dayTargetHtml(D.salary.dayTarget, me.name) : '';
    cpanel.querySelector('[data-body]').innerHTML = hero + (isNow ? teamHtml(pay) : '') + dt + salBlocks.map((b) => BLOCK[b]()).join('');

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

  // =====================================================================================
  // SALARIU, THE MANAGER (api/portal-salariu.js, api/_lib/manager-pay.js)
  // Her pay, simple: what she takes home (base + the bonus, estimated until the owner closes the month), the bonus
  // condition person by person, "if the month closed today", the base and the probation, the reception bonus she made
  // until she became manager (one frozen line), the month-close costs she sends, her months. The owner opens the same
  // from Echipa (K.openManagerPay), with the costs, the profit and the final bonus he confirms.
  // =====================================================================================
  const MG = { cache: {}, at: {} };
  const mgKey = (month, empId) => (empId || 'me') + '|' + month;
  async function mgLoad(month, empId, force) {
    const k = mgKey(month, empId);
    if (!force && MG.cache[k] && Date.now() - MG.at[k] < 60e3) return MG.cache[k];
    const v = await K.api('/api/portal-salariu?view=manager&month=' + encodeURIComponent(month) + (empId ? '&employeeId=' + encodeURIComponent(empId) : ''));
    MG.cache[k] = v; MG.at[k] = Date.now();
    return v;
  }
  const first = (n) => String(n || '').split(' ')[0];
  // an ISO moment as the clinic's day (Bucharest), short
  const roDay = (iso) => { const t = Date.parse(iso); return Number.isFinite(t) ? K.dateShort(new Date(t).toLocaleDateString('sv-SE', { timeZone: 'Europe/Bucharest' })) : ''; };
  // the bonus of a month: final (the owner closed it), estimated (the costs are in), or not yet known
  const mgBonus = (m) => (m.final ? { lei: m.final.lei, kind: 'final' } : m.estimate ? { lei: m.estimate.bonus, kind: 'estimat' } : null);

  // a cosmetician's own row of the condition (her Salariu, her Panou): „Încasat pe zi lucrată · țintă 1.500 lei”, net of
  // the refunds, her row only
  K.dayTargetHtml = (t, name) => {
    const top = t.min * 4 / 3, pct = Math.min(100, (t.perDay / top) * 100), need = Math.max(1, t.min - t.perDay);
    return '<section class="k-card mg-mine"><div class="k-card-head"><h3>' + icon('target') + 'Încasat pe zi lucrată</h3><span class="k-sub">țintă ' + K.lei(t.min) + '</span></div>' +
      '<div class="mg-person' + (t.days ? (t.ok ? ' is-ok' : ' is-low') : ' is-none') + '">' + K.avatar(name || '', 36) +
        '<div class="mg-p-main"><div class="mg-p-top"><b>Tu</b><em>' + (t.days ? K.lei(t.perDay) + ' / zi' : 'încă nu') + '</em></div>' +
          '<div class="mg-bar"><i style="--w:' + pct + '%"></i><s style="left:75%"></s></div>' +
          '<small>' + (t.days ? K.plural(t.days, 'zi lucrată', 'zile lucrate') + ' · ' + K.lei(t.collected) + ' încasat' + (t.ok ? ', peste țintă' : ' · încă ' + K.lei(need) + ' pe zi') : 'Nicio zi lucrată luna asta.') + '</small></div>' +
        '<span class="mg-p-ic">' + icon(t.ok ? 'check' : t.days ? 'x' : 'minus') + '</span></div></section>';
  };
  function mgCondHtml(cond) {
    const top = cond.min * 4 / 3; // the bar's end: 2.000 lei a day, the 1.500 mark at three quarters
    const low = cond.people.filter((p) => p.days && !p.ok);
    const rows = cond.people.map((p) => {
      const pct = Math.min(100, (p.perDay / top) * 100);
      const need = Math.max(1, cond.min - p.perDay);
      return '<div class="mg-person' + (p.days ? (p.ok ? ' is-ok' : ' is-low') : ' is-none') + '">' + K.avatar(p.name, 36) +
        '<div class="mg-p-main"><div class="mg-p-top"><b>' + esc(p.name) + '</b><em>' + (p.days ? K.lei(p.perDay) + ' / zi' : 'încă nu') + '</em></div>' +
          '<div class="mg-bar"><i style="--w:' + pct + '%"></i><s style="left:75%"></s></div>' +
          '<small>' + esc(p.location) + ' · ' + (p.days ? K.plural(p.days, 'zi lucrată', 'zile lucrate') + ' · ' + K.lei(p.collected) + ' încasat' + (p.ok ? '' : ' · încă ' + K.lei(need) + ' pe zi') : 'Nicio zi lucrată luna asta, nu intră în calcul.') + '</small></div>' +
        '<span class="mg-p-ic">' + icon(p.ok ? 'check' : p.days ? 'x' : 'minus') + '</span></div>';
    }).join('');
    const banner = !cond.people.some((p) => p.days)
      ? '<div class="mg-cond-sum">' + icon('info') + '<span>Încă nu a lucrat nicio cosmeticiană luna asta.</span></div>'
      : cond.ok ? '<div class="mg-cond-sum is-ok">' + icon('checkCircle') + '<span><b>Condiția e îndeplinită.</b> Toate cosmeticienele sunt peste ' + K.lei(cond.min) + ' pe zi.</span></div>'
        : '<div class="mg-cond-sum is-low">' + icon('target') + '<span><b>Încă nu.</b> ' + esc(low.map((p) => first(p.name)).join(', ')) + (low.length === 1 ? ' e' : ' sunt') + ' sub ' + K.lei(cond.min) + ' pe zi.</span></div>';
    return '<div class="mg-step"><span class="mg-step-n">1</span><div><b>Condiția</b><small>Fiecare cosmeticiană încasează peste ' + K.lei(cond.min) + ' pe zi lucrată.</small></div></div>' +
      banner + (rows ? '<div class="mg-people">' + rows + '</div>' : '') +
      (cond.training.length ? '<p class="mg-train">' + icon('book') + esc(cond.training.map((p) => first(p.name)).join(', ')) + ' ' + (cond.training.length === 1 ? 'e' : 'sunt') + ' încă în training: nu intră în calcul.</p>' : '');
  }

  // step 2: "if the month closed today", or the final number
  function mgCalcHtml(m, admin) {
    const pct = Math.round(m.rate * 100);
    const head = '<div class="mg-step"><span class="mg-step-n">2</span><div><b>' + (m.final ? 'Bonusul final' : m.current ? 'Dacă luna se închide azi' : 'Calculul lunii') + '</b><small>' + pct + '% din profitul clinicilor ' + esc(m.clinics.join(' și ')) + '.</small></div></div>';
    if (m.final) {
      return head + '<div class="mg-calc is-final"><div><span>Bonus final</span><b>' + K.lei(m.final.lei) + '</b><small>' + icon('checkCircle') + 'Luna e închisă' + (m.final.at ? ' pe ' + esc(roDay(m.final.at)) : '') + '</small></div></div>';
    }
    if (!m.estimate) {
      return head + '<div class="mg-wait">' + icon('clock') + '<span>' + (admin ? 'Trece costurile lunii în Cheltuieli și bonusul se calculează singur.' : 'Bonusul se calculează după ce se trec costurile lunii.') + '</span></div>';
    }
    const e = m.estimate;
    return head + '<div class="mg-calc">' +
        '<div><span>Profit estimat</span><b>' + K.lei(e.profit) + '</b><small>încasări minus costurile lunii</small></div>' +
        '<i class="mg-x">× ' + pct + '%</i>' +
        '<div class="' + (e.bonus ? 'is-on' : '') + '"><span>Bonus estimat</span><b>' + K.lei(e.bonus) + '</b><small>' + (m.condition.ok ? (e.profit > 0 ? 'dacă rămâne așa' : 'luna e pe pierdere deocamdată') : 'condiția nu e îndeplinită' + (e.potential ? ': ar fi ' + K.lei(e.potential) : '')) + '</small></div>' +
      '</div>' +
      '<p class="cd-rule">' + icon('info') + 'E o estimare. Suma finală vine la închiderea lunii.</p>';
  }

  // the base and the probation (30 days from the day she became manager)
  function mgBaseHtml(v, base) {
    const p = v.probation;
    const dl = (d) => Number(d.slice(8, 10)) + ' ' + K.MON[Number(d.slice(5, 7)) - 1];
    return '<section class="k-card mg-base"><div class="k-card-head"><h3>' + icon('user') + 'Salariul de bază</h3></div>' +
      '<div class="mg-base-row"><div><span>Acum</span><b>' + (base ? K.lei(base) : 'încă nu') + '</b><small>' + (base ? 'net, pe lună' : 'nesetat încă') + '</small></div>' +
      (p && (p.inProbation || p.after) ? '<div class="' + (p.inProbation ? '' : 'is-on') + '"><span>' + (p.inProbation ? 'După perioada de probă' : 'După probă') + '</span><b>' + (p.after ? K.lei(p.after) : 'încă nu') + '</b><small>' + (p.inProbation ? 'de la ' + esc(dl(p.end)) : 'net, pe lună') + '</small></div>' : '') + '</div>' +
      (p ? '<p class="cd-rule">' + icon('calendar') + (p.inProbation ? 'Perioada de probă: ' + v.rule.probationDays + ' de zile, până pe ' + esc(dl(p.end)) + '.' : 'Perioada de probă s-a încheiat pe ' + esc(dl(p.end)) + '.') + '</p>' : '') +
      '</section>';
  }

  // what she sends at month close (consumables, other costs): a proposal the owner takes into the month's costs (Cheltuieli)
  function mgProposeHtml(m) {
    const p = m.proposal;
    const st = p ? { pending: ['warn', 'Trimis, în așteptare'], accepted: ['good', 'Preluat'], declined: ['bad', 'Nepreluat'] }[p.status] : null;
    return '<section class="k-card mg-prop"><div class="k-card-head"><h3>' + icon('receipt') + 'Costuri variabile ale lunii</h3>' + (st ? '<span class="k-tag is-' + st[0] + '">' + st[1] + '</span>' : '') + '</div>' +
      '<p class="k-muted mg-prop-lead">La închiderea lunii trimite consumabilele și alte costuri. După verificare intră în calcul.</p>' +
      '<form class="k-form mg-prop-form" data-mg-prop-form>' +
        K.field('Consumabile', '<div class="k-money"><input name="consumables" type="number" inputmode="decimal" min="0" step="1" placeholder="0" value="' + esc(p && p.consumables != null ? p.consumables : '') + '"></div>') +
        K.field('Alte costuri', '<div class="k-money"><input name="other" type="number" inputmode="decimal" min="0" step="1" placeholder="0" value="' + esc(p && p.other != null ? p.other : '') + '"></div>') +
        K.field('Notă (opțional)', '<input name="note" maxlength="300" placeholder="ex. gel și cartușe, o reparație" value="' + esc(p ? p.note || '' : '') + '">', 'full') +
      '</form><div class="mg-prop-acts"><button type="button" class="k-btn is-accent" data-mg-propose>' + icon('check') + (p ? 'Trimite din nou' : 'Trimite') + '</button></div></section>';
  }

  // Lunile tale: salary, overtime, the bonus (reception's until the switch, then the manager's), the total
  function mgHistHtml(months, v, sel) {
    const byM = {}; (v.history || []).forEach((h) => { byM[h.month] = h; });
    const hist = months.filter((m, i) => i === 0 || m.total > 0 || byM[m.month]);
    return '<section class="k-card"><div class="k-card-head"><h3>' + icon('calendar') + 'Lunile tale</h3></div>' +
      '<div class="cb-hist sl-hist"><div class="cb-hist-row is-head"><span>Luna</span><span>Salariu</span><span>Ore supl.</span><span>Bonus</span><span>Total</span></div>' +
      hist.map((h) => {
        const x = byM[h.month];
        const est = x && !x.final && x.estimate != null ? x.estimate : 0;
        const bon = (Number(h.bonus) || 0) + (x ? (x.final ? x.final.lei : est) : 0);
        const tag = x ? (x.final ? '' : x.estimate != null ? ' <em class="mg-est">estimat</em>' : ' <em class="mg-est">în calcul</em>') : '';
        return '<button type="button" class="cb-hist-row' + (h.month === sel ? ' is-on' : '') + '" data-month="' + h.month + '"><span>' + esc(K.monthLabel(h.month)) + '</span><span data-l="salariu">' + K.lei(h.base) + '</span><span data-l="ore supl.">' + lei2(h.overtimeLei) + '</span><span data-l="bonus">' + lei2(bon) + tag + '</span><b>' + lei2(h.total + est) + '</b></button>';
      }).join('') + '</div></section>';
  }

  // the page, for her (opts.admin: the owner's drawer, with the costs and the final bonus)
  function mgHtml(v, pay, opts) {
    const m = v.month, admin = !!(opts && opts.admin);
    const b = mgBonus(m);
    const est = b && b.kind === 'estimat' ? b.lei : 0;
    const total = pay ? pay.total + est : null;
    const bk = pay && pay.booking && pay.booking.frozen ? pay.booking : null;
    const head = '<section class="cb-hero k-card mg-hero"><div class="cb-hero-main"><span>' + (admin ? esc(v.name) : 'Salariul tău') + ' · ' + esc(K.monthLabel(m.month)) + '</span>' +
        (total != null ? '<b data-count="' + Math.round(total) + '" data-fmt="lei" data-key="mg-t-' + m.month + '">0</b><p>' + icon('wallet') + (m.current ? 'în mână luna asta' : 'în mână') + (est ? ', cu bonusul estimat' : '') + '</p>'
          : '<b>' + (b ? K.lei(b.lei) : 'încă nu') + '</b><p>' + icon('trophy') + 'bonus' + (b ? ', ' + b.kind : '') + '</p>') + '</div>' +
        (opts && opts.nav !== false ? monthNav(m.current) : '') +
        (pay ? '<div class="cb-split">' +
          '<div><span>' + icon('user') + 'Salariu de bază</span><b>' + (pay.base ? K.lei(pay.base) : 'încă nu') + '</b><small>' + (pay.base ? 'net, pe lună' : 'nesetat încă') + '</small></div>' +
          '<div class="' + (b && b.lei ? 'is-good' : !b ? 'is-wait' : '') + '"><span>' + icon('trophy') + 'Bonus</span><b>' + (b ? K.lei(b.lei) : 'încă nu') + '</b><small>' + (b ? (b.kind === 'final' ? 'final, luna e închisă' : 'estimat, ' + (m.condition.ok ? 'condiția e îndeplinită' : 'condiția încă nu e îndeplinită')) : 'după costurile lunii') + '</small></div>' +
          '<div><span>' + icon('clock') + 'Ore suplimentare</span><b>' + lei2(pay.overtimeLei) + '</b><small>' + (pay.overtimeMinutes ? hm(pay.overtimeMinutes) + ' × 40 lei' : 'nicio oră luna asta') + '</small></div>' +
          '</div>' : '') +
        (bk ? '<div class="mg-frozen">' + icon('calendar') + '<span>Bonus recepție (până la ' + esc(K.dateShort(bk.frozen)) + '): <b>' + K.lei(bk.lei) + '</b></span><small>media ' + avg1(bk.avg) + ' programări pe zi · ' + (bk.lei ? 'inclus în total' : 'sub prima treaptă (' + bk.tiers.slice().sort((a, c) => a.min - c.min)[0].min + ' pe zi)') + '</small></div>' : '') +
        (pay && pay.manual ? '<div class="mg-frozen">' + icon('sliders') + '<span>Ajustare: <b>' + (pay.manual > 0 ? '+' : '') + lei2(pay.manual) + '</b></span></div>' : '') +
      '</section>';
    const bonusCard = '<section class="k-card mg-bonus"><div class="k-card-head"><h3>' + icon('trophy') + 'Bonusul</h3>' +
        (b ? '<span class="k-tag is-' + (b.kind === 'final' ? 'good' : 'info') + '">' + b.kind + '</span>' : '') + '</div>' +
      mgCondHtml(m.condition) + mgCalcHtml(m, admin) + (admin ? mgAdminHtml(v) : '') + '</section>';
    return head + bonusCard + (opts && opts.extra ? opts.extra : '');
  }

  // the owner: the month's real numbers and the final bonus
  function mgAdminHtml(v) {
    const m = v.month;
    if (!m.costs) return '';
    const src = { auto: 'auto', manual: 'scris de tine', typed: '', missing: 'lipsește', empty: '', records: 'din Cheltuieli' };
    const rows = m.costs.rows.map((r) => '<div class="mg-cost' + (r.lei == null ? ' is-miss' : '') + '"><span>' + esc(r.label) + (src[r.source] ? ' <em>' + src[r.source] + '</em>' : '') + '</span><b>' + (r.lei == null ? 'lipsește' : K.lei(r.lei)) + '</b></div>').join('');
    const fin = m.final ? m.final.lei : m.estimate ? m.estimate.bonus : '';
    return '<div class="mg-admin"><div class="mg-step"><span class="mg-step-n">' + icon('shield') + '</span><div><b>Doar pentru tine</b><small>Costurile reale și profitul lunii.</small></div></div>' +
      '<div class="mg-costs"><div class="mg-cost is-in"><span>Încasări ' + esc(m.clinics.join(' și ')) + '</span><b>' + K.lei(m.collections) + '</b></div>' + rows +
        '<div class="mg-cost is-total"><span>Total costuri</span><b>' + K.lei(m.costs.total) + '</b></div>' +
        '<div class="mg-cost is-profit"><span>Profit</span><b>' + K.lei(m.profit) + '</b></div></div>' +
      (m.costs.missing.length || !m.filled ? '<div class="mg-wait">' + icon('alert') + '<span>' + (m.costs.missing.length ? 'Lipsesc: ' + esc(m.costs.rows.filter((r) => r.lei == null).map((r) => r.label).join(', ')) + '.' : 'Luna nu e salvată încă în Cheltuieli.') + ' Bonusul apare la ea doar după ce luna e completă.</span></div>' : '') +
      '<form class="mg-final" data-mg-final><label><span>Bonus final</span><div class="k-money"><input name="lei" type="number" inputmode="numeric" min="0" step="1" value="' + esc(fin) + '" placeholder="0"></div></label>' +
        '<button type="button" class="k-btn is-accent" data-mg-final-save>' + icon('check') + (m.final ? 'Schimbă' : 'Confirmă la închiderea lunii') + '</button>' +
        (m.final ? '<button type="button" class="k-btn is-ghost" data-mg-final-clear>Retrage</button>' : '') + '</form>' +
      '<p class="cd-rule">' + icon('info') + 'După confirmare, ' + esc(first(v.name)) + ' vede bonusul ca final și intră în salariul lunii.</p></div>';
  }

  function renderManager() {
    const D = K.data;
    const body = cpanel.querySelector('[data-body]');
    ['[data-comm-new]', '[data-sal-custom]'].forEach((s) => { const x = cpanel.querySelector(s); if (x) x.style.display = 'none'; });
    const months = (D.salary && D.salary.months) || [];
    const pay = months.find((x) => x.month === C.month) || null;
    const k = mgKey(C.month);
    const v = MG.cache[k];
    if (!v || Date.now() - MG.at[k] > 60e3) {
      if (!v) body.innerHTML = '<div class="k-skel" style="height:220px;margin-bottom:1rem"></div><div class="k-skel" style="height:320px"></div>';
      const month = C.month;
      mgLoad(month, null, !!v).then(() => { if (C.month === month && K.isActive('comision')) renderManager(); })
        .catch((err) => { if (!v) body.innerHTML = '<section class="k-card">' + K.empty('alert', 'Nu am putut încărca salariul', K.errText(err)) + '</section>'; });
      if (!v) return;
    }
    const m = v.month;
    const propose = m.current || C.month === K.addMonths(K.thisMonth(), -1) ? mgProposeHtml(m) : '';
    body.innerHTML = mgHtml(v, pay, { extra: mgBaseHtml(v, pay ? pay.base : 0) + (K.data.impersonating ? '' : propose) + mgHistHtml(months, v, C.month) });
    K.countAll(cpanel);
  }

  async function mgPropose(btn) {
    const f = cpanel.querySelector('[data-mg-prop-form]');
    if (!f) return;
    const v = K.formValues(f);
    if (v.consumables === '' && v.other === '') { K.ui().toast('Scrie consumabilele sau alte costuri.', 'error'); return; }
    await K.busy(btn, async () => {
      try {
        await K.api('/api/portal-salariu', { action: 'propose', month: C.month, consumables: v.consumables, other: v.other, note: v.note || '' });
        K.ui().toast('Trimis.', 'success');
        await mgLoad(C.month, null, true);
        renderManager();
      } catch (err) { K.ui().toast(K.errText(err), 'error'); }
    });
  }

  // the owner: a manager's Salariu, in a drawer (Echipa → Salarii / her card)
  K.openManagerPay = (empId) => {
    const S = { month: K.thisMonth() };
    const who = (((K.data && K.data.admin && K.data.admin.employees) || []).find((x) => x.id === empId) || {}).name || '';
    const d = K.drawer({
      title: who ? 'Salariul ' + who.split(' ')[0] : 'Salariu și bonus', icon: 'trophy', width: 640,
      body: '<div class="mo cb mg-drawer" data-mg-box><div class="k-skel" style="height:260px"></div></div>',
      footer: '<span class="k-grow"></span><button type="button" class="k-btn" data-mg-close>Închide</button>',
      onMount(el) {
        const box = el.querySelector('[data-mg-box]');
        const paint = async (force) => {
          try {
            const v = await mgLoad(S.month, empId, force);
            const pay = S.month === K.thisMonth() ? ((K.data.admin && K.data.admin.payroll) || []).find((r) => r.id === empId) || null : null;
            const nav = '<div class="k-month mg-dnav"><button type="button" class="k-icon-btn" data-dm="-1" aria-label="Luna anterioară">' + icon('left') + '</button><b>' + esc(K.monthLabel(S.month)) + '</b><button type="button" class="k-icon-btn" data-dm="1" aria-label="Luna următoare"' + (S.month >= K.thisMonth() ? ' disabled' : '') + '>' + icon('right') + '</button></div>';
            const emp = ((K.data.admin && K.data.admin.employees) || []).find((e) => e.id === empId) || {};
            box.innerHTML = nav + mgHtml(v, pay, { admin: true, nav: false, extra: mgBaseHtml(v, Number(emp.netSalary) || 0) });
            K.countAll(box);
          } catch (err) { box.innerHTML = K.empty('alert', 'Nu am putut încărca', K.errText(err)); }
        };
        paint(true);
        el.querySelector('[data-mg-close]').addEventListener('click', () => d.close());
        box.addEventListener('click', async (e) => {
          const nv = e.target.closest('[data-dm]');
          if (nv) { S.month = K.addMonths(S.month, +nv.dataset.dm); box.innerHTML = '<div class="k-skel" style="height:260px"></div>'; paint(); return; }
          const save = e.target.closest('[data-mg-final-save]'), clear = e.target.closest('[data-mg-final-clear]');
          if (!save && !clear) return;
          const f = box.querySelector('[data-mg-final]');
          const lei = clear ? '' : f.lei.value;
          if (save && (lei === '' || !(Number(lei) >= 0))) { K.ui().toast('Scrie bonusul final.', 'error'); f.lei.focus(); return; }
          if (save && !(await K.ui().confirm({ title: 'Bonus final ' + K.lei(Number(lei)) + '?', message: 'Pentru ' + K.monthLabel(S.month) + '. Îl vede ca final și intră în salariul lunii.', confirmText: 'Confirmă' }))) return;
          await K.busy(save || clear, async () => {
            try {
              await K.api('/api/portal-salariu', { action: 'final_set', employeeId: empId, month: S.month, lei });
              K.ui().toast(clear ? 'Bonusul final a fost retras.' : 'Bonus final confirmat.', 'success');
              await paint(true);
              K.reload();
            } catch (err) { K.ui().toast(K.errText(err), 'error'); }
          });
        });
      },
    });
  };

  // the manager's pay is read again after the owner changes the month's costs (Cheltuieli, portal-plati.js)
  K.mgReset = () => { MG.cache = {}; };

  K.section('comision', { mount: mountComision, show() { K.prefs.load().then(renderComision); }, data() { if (cpanel && K.isActive('comision')) renderComision(); } });
})();
  // #comision/bonus, /costuri, /adauga (Nuki, the guide): her bonus card or the month's costs, with a short glow; „Adaugă comision”
  K.on('comision:sub', (t) => {
    if (t === 'adauga') { const me = K.data && K.data.me; if (me && me.role === 'cosmetician') setTimeout(() => openCommNew(), 120); return; }
    if (t === 'bonus' && K.glow) K.glow('.sl-bonus, .mg-bonus', { max: 1 });
    if (t === 'costuri' && K.glow) K.glow('.mg-prop', { max: 1 });
  });
  // #incasari/dues: „Rest de plată din pachete”
  K.on('incasari:sub', (t) => { if (t === 'dues' && K.glow) K.glow('section:has(> [data-dues]), [data-dues]', { max: 1 }); });
