// Centrul360 portal — money: "Încasări" and "Comisionul meu".
// Încasări: pick the city (Timișoara / Arad / both) and the period (today, yesterday, this week,
// this month, last month or exact dates); totals per payment method, daily bars, per person and
// per category, the day-grouped list, CSV + print. A payment always starts from an appointment:
// the desk picks only WHICH appointment, HOW it was paid (card / cash / transfer / cash + card)
// and WHO did the treatment; the amount comes from the appointment and, if the client paid more,
// the difference is an upsell (10% for whoever did the treatment, after the owner approves it).
// Comisionul meu: commission earned this month, every bonus with how much is left to win it, and
// the upsell list.
(function () {
  'use strict';
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
  const rate = () => ((K.data && K.data.upsellRate) || 10) / 100;
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
  const S = { period: 'month', from: '', to: '', loc: 'all', method: '', q: '', day: '' };
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
    return K.dateShort(a) + ' – ' + K.dateShort(b) + (a.slice(0, 4) !== K.today().slice(0, 4) ? ' ' + a.slice(0, 4) : '');
  };

  function mountIncasari(p) {
    panel = p;
    panel.classList.add('k-panel', 'mo');
    if (K.data && !K.data.isAdmin && LOCS.includes(K.data.me.location)) S.loc = K.data.me.location;
    S.from = K.thisMonth() + '-01'; S.to = K.today();
    panel.innerHTML =
      '<div class="k-head"><div><div class="k-eyebrow">Clinică</div><h2>Încasări</h2><p class="k-lede">Fiecare plată, în timp real. Alege orașul și perioada.</p></div>' +
      '<div class="k-head-actions"><button type="button" class="k-btn is-outline" data-act="csv">' + icon('download') + 'Export</button>' +
      '<button type="button" class="k-btn is-outline" data-act="print">' + icon('printer') + 'Printează</button>' +
      '<button type="button" class="k-btn is-accent" data-act="new">' + icon('plus') + 'Încasare<kbd>N</kbd></button></div></div>' +
      '<div class="mo-filters k-card">' +
        '<div class="mo-filter"><span>Oraș</span>' + K.seg('moloc', [['all', 'Ambele'], ['Timișoara', 'Timișoara'], ['Arad', 'Arad']], S.loc) + '</div>' +
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
    rows.forEach((s) => { const n = s.performedByName && s.performedByName !== '—' ? s.performedByName : 'Neatribuit'; byPerson[n] = (byPerson[n] || 0) + Number(s.amount || 0); });
    const people = Object.keys(byPerson).sort((a, b) => byPerson[b] - byPerson[a]);
    const upsell = rows.reduce((a, s) => a + Number(s.upsell || 0), 0);
    const pct = (v) => (total ? Math.round((v / total) * 100) : 0);
    const where = S.loc === 'all' ? 'Timișoara + Arad' : S.loc;

    panel.querySelector('[data-body]').innerHTML =
      '<div class="mo-range"><b>' + esc(rangeLabel()) + '</b><span>' + esc(where) + '</span><span class="k-live">live</span></div>' +
      '<div class="k-grid c4 k-stagger">' +
        '<div class="k-stat is-accent"><div class="k-stat-top"><span class="k-stat-ic">' + icon('wallet') + '</span>Total încasat</div><div class="k-stat-value" data-count="' + total + '" data-fmt="lei" data-key="mo-t-' + from + to + S.loc + '">0</div><div class="k-stat-sub">' + K.plural(rows.length, 'încasare', 'încasări') + (rows.length ? ' · bon mediu ' + K.lei(total / rows.length) : '') + '</div></div>' +
        '<div class="k-stat"><div class="k-stat-top"><span class="k-stat-ic" style="color:var(--accent)">' + icon('card') + '</span>Card</div><div class="k-stat-value" data-count="' + Math.round(m.card) + '" data-fmt="lei" data-key="mo-c-' + from + to + S.loc + '">0</div><div class="k-stat-sub">' + pct(m.card) + '% din total</div></div>' +
        '<div class="k-stat"><div class="k-stat-top"><span class="k-stat-ic" style="color:var(--good)">' + icon('cash') + '</span>Cash</div><div class="k-stat-value" data-count="' + Math.round(m.cash) + '" data-fmt="lei" data-key="mo-h-' + from + to + S.loc + '">0</div><div class="k-stat-sub">' + pct(m.cash) + '% din total</div></div>' +
        '<div class="k-stat"><div class="k-stat-top"><span class="k-stat-ic" style="color:var(--info)">' + icon('bank') + '</span>Transfer</div><div class="k-stat-value" data-count="' + Math.round(m.transfer) + '" data-fmt="lei" data-key="mo-x-' + from + to + S.loc + '">0</div><div class="k-stat-sub">' + pct(m.transfer) + '% din total' + (upsell ? ' · upsell ' + K.lei(upsell) : '') + '</div></div>' +
      '</div>' +
      (days.length > 1 ? '<section class="k-card"><div class="k-card-head"><h3>' + icon('trend') + 'Pe zile</h3><span class="k-sub">apasă pe o zi ca s-o vezi separat</span></div><div data-chart></div></section>' : '') +
      '<div class="mo-row">' +
        '<section class="k-card"><div class="k-card-head"><h3>' + icon('sparkles') + 'Pe categorii</h3></div>' +
          (catKeys.length ? catKeys.map((k) => '<div class="mo-bar"><span>' + esc(K.cats[k]) + '</span><b>' + K.lei(byCat[k]) + '</b><div class="k-bar"><i style="--w:' + (byCat[k] / byCat[catKeys[0]]) * 100 + '%"></i></div></div>').join('') : '<p class="k-muted">Nicio încasare în perioada aleasă.</p>') + '</section>' +
        '<section class="k-card"><div class="k-card-head"><h3>' + icon('users') + 'Cine a făcut tratamentele</h3></div>' +
          (people.length ? '<div class="mo-people-grid">' + people.map((n) => '<div class="mo-person">' + K.avatar(n, 34) + '<div><b>' + esc(n) + '</b><span>' + K.lei(byPerson[n]) + ' · ' + pct(byPerson[n]) + '%</span><div class="k-bar"><i style="--w:' + (byPerson[n] / byPerson[people[0]]) * 100 + '%"></i></div></div></div>').join('') + '</div>' : '<p class="k-muted">—</p>') + '</section>' +
      '</div>' +
      '<section class="k-card"><div class="k-toolbar"><label class="k-search">' + icon('search') + '<input data-q placeholder="Caută clientă sau tratament…" value="' + esc(S.q) + '"></label>' +
        '<div class="k-chips">' + Object.keys(METHODS).map((k) => '<button type="button" class="k-chip' + (S.method === k ? ' is-on' : '') + '" data-method="' + k + '">' + icon(METHODS[k].ic) + METHODS[k].label + '</button>').join('') + '</div>' +
        (S.day ? '<button type="button" class="k-chip is-on" data-act="clear-day">' + esc(K.dateLong(S.day)) + icon('x') + '</button>' : '') + '</div>' +
        '<div data-list></div></section>';

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
            '<div class="k-row-main"><div class="k-row-title">' + esc(s.client || '—') + '</div><div class="k-row-sub">' + esc(s.treatment) + (K.catLabel(s) ? ' · ' + esc(K.catLabel(s)) : '') +
            (s.performedByName && s.performedByName !== '—' ? ' · ' + esc(s.performedByName) : '') + (S.loc === 'all' && s.location ? ' · ' + esc(s.location) : '') + '</div></div>' +
            '<div class="k-row-end">' + (s.upsell ? '<span class="k-tag is-good">+' + K.lei(s.upsell) + ' upsell</span>' : '') + '<span class="k-tag">' + mm.label + '</span><span class="k-amount">' + K.lei(s.amount, 2) + '</span></div></div>';
        }).join('') + '</div>').join('');
  }

  // ---------------- new payment: appointment → method → who did it
  async function openNew(pre) {
    pre = pre || {};
    const st = { list: null, apptId: pre.appointmentId || '', method: 'card', who: '', q: '', picking: !pre.appointmentId };
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
        el.querySelector('[data-save]').addEventListener('click', (e) => K.busy(e.currentTarget, save));
      },
    });
    const root = () => d.el.querySelector('[data-pay-body]');
    try {
      const j = await K.api('/api/portal-appointments', { action: 'unpaid' });
      st.list = j.appointments || [];
    } catch (e) { root().innerHTML = K.empty('alert', 'Nu am putut încărca programările', 'Verifică conexiunea și reîncearcă.'); return; }
    const appt = () => st.list.find((a) => a.id === st.apptId);
    if (st.apptId && !appt()) { st.apptId = ''; st.picking = true; }
    if (appt()) st.who = appt().cosmeticianId || '';
    paint();

    function apptCard(a, on) {
      return '<button type="button" class="pay-appt' + (on ? ' is-on' : '') + '" data-appt="' + esc(a.id) + '"><span class="pay-time"><b>' + esc(a.time || '—') + '</b><small>' + esc(K.relDay(a.date) === K.dateLong(a.date) ? K.dateShort(a.date) : K.relDay(a.date)) + '</small></span>' +
        '<span class="pay-main"><b>' + esc(a.clientName || '—') + '</b><small>' + esc(a.treatment || '') + ' · ' + esc(a.location) + (a.cosmeticianName ? ' · ' + esc(a.cosmeticianName) : '') + '</small></span>' +
        '<span class="pay-amt">' + (a.amount ? K.lei(a.amount) : '<em>fără sumă</em>') + '</span></button>';
    }
    function paint() {
      const a = appt();
      if (!st.list.length) {
        root().innerHTML = K.empty('calendar', 'Nicio programare de încasat', 'Încasarea pornește dintr-o programare. Programările de azi și din ultimele 30 de zile care nu sunt plătite apar aici.',
          '<button type="button" class="k-btn is-primary" data-go-cal>' + icon('calendar') + 'Deschide Calendarul</button>');
        return;
      }
      const q = K.norm(st.q);
      const mine = (x) => !K.data.isAdmin && LOCS.includes(K.data.me.location) ? x.location === K.data.me.location : true;
      const list = st.list.filter((x) => !q || K.norm(x.clientName + ' ' + x.treatment).includes(q)).sort((x, y) => (mine(y) ? 1 : 0) - (mine(x) ? 1 : 0));
      const today = list.filter((x) => x.date === K.today()), older = list.filter((x) => x.date !== K.today());
      const step1 = st.picking || !a
        ? '<section class="pay-step"><h4><i>1</i>Ce programare încasezi?</h4>' +
          (st.list.length > 6 ? '<label class="k-search pay-search">' + icon('search') + '<input data-pay-q placeholder="Caută clienta…" value="' + esc(st.q) + '"></label>' : '') +
          (today.length ? '<div class="pay-group">Azi</div>' + today.map((x) => apptCard(x, x.id === st.apptId)).join('') : '') +
          (older.length ? '<div class="pay-group">Zilele trecute, neîncasate</div>' + older.map((x) => apptCard(x, x.id === st.apptId)).join('') : '') +
          (!list.length ? '<p class="k-muted">Nicio programare găsită.</p>' : '') + '</section>'
        : '<section class="pay-step is-done"><h4><i>' + icon('check') + '</i>Programarea</h4>' + apptCard(a, true) + '<button type="button" class="k-btn is-sm is-outline pay-change" data-change>' + icon('refresh') + 'Altă programare</button></section>';
      if (!a || st.picking) { root().innerHTML = step1; updateSave(); return; }
      const booked = Number(a.amount) || 0;
      const team = cosmeticians(a.location);
      const others = cosmeticians().filter((x) => x.location !== a.location);
      root().innerHTML = step1 +
        '<section class="pay-step"><h4><i>2</i>Cum a plătit?</h4><div class="pay-methods">' + Object.keys(METHODS).map((k) =>
          '<button type="button" data-m="' + k + '" class="' + (st.method === k ? 'is-on' : '') + '"><span>' + icon(METHODS[k].ic) + '</span>' + METHODS[k].label + '</button>').join('') + '</div>' +
          '<div class="pay-amounts">' +
            '<label class="k-field"><span>Sumă încasată</span><div class="k-money"><input data-amount type="number" inputmode="decimal" min="0" step="1" value="' + esc(st.amount != null ? st.amount : booked || '') + '" placeholder="0"></div></label>' +
            (st.method === 'cash_card' ? '<div class="pay-split"><label class="k-field"><span>Din care cash</span><div class="k-money"><input data-cash type="number" inputmode="decimal" min="0" step="1" value="' + esc(st.cash || '') + '"></div></label>' +
              '<label class="k-field"><span>Din care card</span><div class="k-money"><input data-card type="number" inputmode="decimal" min="0" step="1" value="' + esc(st.card || '') + '"></div></label></div>' : '') +
            '<div class="pay-note" data-note></div></div></section>' +
        '<section class="pay-step"><h4><i>3</i>Cine a făcut tratamentul?</h4><div class="pay-people">' +
          team.concat(others).map((x) => '<button type="button" data-who="' + esc(x.id) + '" class="' + (st.who === x.id ? 'is-on' : '') + (x.location !== a.location ? ' is-other' : '') + '">' + K.avatar(x.name, 30) + '<span><b>' + esc(x.name) + '</b><small>' + esc(x.location) + '</small></span></button>').join('') +
          (!team.length && !others.length ? '<p class="k-muted">Nicio cosmeticiană activă în Echipa.</p>' : '') + '</div></section>';
      note(); updateSave();
    }
    function vals() {
      const a = appt();
      const amt = Number((d.el.querySelector('[data-amount]') || {}).value) || 0;
      const cash = Number((d.el.querySelector('[data-cash]') || {}).value) || 0;
      const card = Number((d.el.querySelector('[data-card]') || {}).value) || 0;
      return { a, amt, cash, card };
    }
    function note() {
      const box = d.el.querySelector('[data-note]');
      if (!box) return;
      const { a, amt, cash, card } = vals();
      const booked = Number(a.amount) || 0;
      const who = cosmeticians().find((x) => x.id === st.who);
      const lines = [];
      if (booked) lines.push('Programat: <b>' + K.lei(booked) + '</b>');
      if (booked && amt > booked) lines.push('<span class="pay-up">' + icon('trend') + 'Upsell <b>+' + K.lei(amt - booked) + '</b> → comision ' + Math.round(rate() * 100) + '% = <b>' + K.lei((amt - booked) * rate(), 2) + '</b>' + (who ? ' pentru ' + esc(who.name.split(' ')[0]) : '') + ' (după aprobare)</span>');
      if (booked && amt && amt < booked) lines.push('<span class="pay-warn">' + icon('alert') + 'Mai puțin decât suma programării.</span>');
      if (st.method === 'cash_card' && amt && Math.abs(cash + card - amt) > 0.01) lines.push('<span class="pay-warn">' + icon('alert') + 'Cash + card = ' + K.lei(cash + card) + ', trebuie ' + K.lei(amt) + '.</span>');
      box.innerHTML = lines.join('');
    }
    function ready() {
      const { a, amt, cash, card } = vals();
      if (!a || st.picking || !(amt > 0) || !st.who) return false;
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
      const ap = e.target.closest('[data-appt]');
      if (ap && (st.picking || !appt())) {
        st.apptId = ap.dataset.appt; st.picking = false; st.amount = null; st.cash = ''; st.card = '';
        st.who = (appt() && appt().cosmeticianId) || '';
        return paint();
      }
      if (e.target.closest('[data-change]')) { st.picking = true; return paint(); }
      const m = e.target.closest('[data-m]');
      if (m) { keepInputs(); st.method = m.dataset.m; return paint(); }
      const w = e.target.closest('[data-who]');
      if (w) { st.who = w.dataset.who; d.el.querySelectorAll('[data-who]').forEach((x) => x.classList.toggle('is-on', x === w)); note(); updateSave(); }
    }
    function keepInputs() {
      const amt = d.el.querySelector('[data-amount]'), c1 = d.el.querySelector('[data-cash]'), c2 = d.el.querySelector('[data-card]');
      if (amt) st.amount = amt.value;
      if (c1) st.cash = c1.value;
      if (c2) st.card = c2.value;
    }
    function onDrawerInput(e) {
      if (e.target.matches('[data-pay-q]')) { st.q = e.target.value; const pos = e.target.selectionStart; paint(); const q = d.el.querySelector('[data-pay-q]'); if (q) { q.focus(); q.setSelectionRange(pos, pos); } return; }
      // cash + card: typing one side fills the other with the rest
      const amt = Number((d.el.querySelector('[data-amount]') || {}).value) || 0;
      if (e.target.matches('[data-cash]') && amt) d.el.querySelector('[data-card]').value = Math.max(0, Math.round((amt - (Number(e.target.value) || 0)) * 100) / 100) || '';
      if (e.target.matches('[data-card]') && amt) d.el.querySelector('[data-cash]').value = Math.max(0, Math.round((amt - (Number(e.target.value) || 0)) * 100) / 100) || '';
      keepInputs(); note(); updateSave();
    }
    async function save() {
      if (!ready()) return;
      const { a, amt, cash, card } = vals();
      try {
        const r = await K.api('/api/portal-sale', { source: 'incasare', appointmentId: a.id, method: st.method, amount: amt, cashAmount: cash, cardAmount: card, performedBy: st.who });
        d.close();
        K.ui().toast('Încasat ' + K.lei(amt, 2) + ' · ' + a.clientName + (r.upsell ? ' · upsell +' + K.lei(r.upsell.amount) : ''), 'success');
        if (!(a.date >= range()[0] && a.date <= range()[1])) { S.period = a.date === K.today() ? 'today' : 'month'; }
        K.reload();
        K.emit('remote');
      } catch (err) {
        const msg = { already_paid: 'Programarea e deja încasată.', missing_performer: 'Alege cine a făcut tratamentul.', invalid_split: 'Cash + card trebuie să dea suma totală.', appointment_not_found: 'Programarea nu mai există.' }[err.code];
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
      body: '<dl class="k-kv"><dt>Clientă</dt><dd>' + esc(s.client) + '</dd><dt>Tratament</dt><dd>' + esc(s.treatment) + '</dd><dt>Categorie</dt><dd>' + esc(K.catLabel(s) || '—') + '</dd>' +
          '<dt>Plată</dt><dd>' + esc(methodText(s)) + '</dd>' + (s.bookedAmount ? '<dt>Programat</dt><dd>' + K.lei(s.bookedAmount) + (s.upsell ? ' · upsell +' + K.lei(s.upsell) : '') + '</dd>' : '') +
          '<dt>A făcut tratamentul</dt><dd>' + esc(s.performedByName || '—') + '</dd><dt>Înregistrată de</dt><dd>' + esc(s.employeeName || '—') + (s.createdAt ? ' · ' + esc(K.ago(s.createdAt)) : '') + '</dd></dl>' +
        (admin ? '<section class="k-section"><h4>' + icon('pen') + 'Corectează</h4><form class="k-form" data-form>' +
          K.field('Sumă', '<div class="k-money"><input name="amount" type="number" min="0" step="0.01" value="' + esc(s.amount) + '"></div>') +
          K.field('Data', '<input name="date" type="date" value="' + esc(s.date) + '">') +
          K.field('Metodă', K.seg('method', Object.keys(METHODS).map((k) => [k, METHODS[k].label, METHODS[k].ic]), s.method, 'is-big'), 'full') +
          '<div class="pay-split full" data-split' + (s.method === 'cash_card' ? '' : ' hidden') + '><label class="k-field"><span>Cash</span><input name="cashAmount" type="number" min="0" step="0.01" value="' + esc(s.split ? s.split.cash : '') + '"></label>' +
          '<label class="k-field"><span>Card</span><input name="cardAmount" type="number" min="0" step="0.01" value="' + esc(s.split ? s.split.card : '') + '"></label></div>' +
          K.field('Categorie', K.catPicker(K.catsOf(s)), 'full') +
          K.field('A făcut tratamentul', '<select name="performedBy"><option value="">—</option>' + K.options(emp.map((e) => [e.id, e.name + ' · ' + e.location]), s.performedBy || '') + '</select>', 'full') +
          '</form></section>'
          : '<div class="mo-note">' + icon('info') + 'O greșeală? Corecturile le face administratorul. Spune-i ce trebuie modificat.</div>'),
      footer: admin ? '<button type="button" class="k-btn is-danger is-sm" data-del>' + icon('trash') + 'Șterge</button><span class="k-grow"></span><button type="button" class="k-btn is-primary" data-save>' + icon('check') + 'Salvează</button>' : '',
      onMount(el) {
        if (!admin) return;
        const f = el.querySelector('[data-form]');
        f.addEventListener('change', (e) => { if (e.target.name === 'method') el.querySelector('[data-split]').hidden = e.target.value !== 'cash_card'; });
        el.querySelector('[data-save]').addEventListener('click', (e) => K.busy(e.currentTarget, async () => {
          const v = K.formValues(f);
          try {
            await K.api('/api/portal-incasari', Object.assign({ action: 'update', id: s.id }, v, { amount: Number(v.amount), cashAmount: Number(v.cashAmount) || 0, cardAmount: Number(v.cardAmount) || 0, categories: String(v.categories || '').split(',').filter(Boolean) }));
            d.close(); K.ui().toast('Încasare corectată.', 'success'); K.reload();
          } catch (err) { K.ui().toast(err.code === 'invalid_split' ? 'Cash + card trebuie să dea suma totală.' : K.errText(err), 'error'); }
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

  K.section('incasari', { mount: mountIncasari, show: render, data() { if (panel && K.isActive('incasari')) render(); } });
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
      '<div class="k-head"><div><div class="k-eyebrow">Echipă</div><h2>Comisionul meu</h2><p class="k-lede">Ce ai câștigat luna asta și cât mai ai până la fiecare bonus.</p></div></div>' +
      '<div data-body></div>';
    cpanel.addEventListener('click', (e) => {
      const m = e.target.closest('[data-m]');
      if (m) { C.month = K.addMonths(C.month, +m.dataset.m); renderComision(); }
    });
  }

  // One bonus, said plainly: how far she is, how much is left, what she wins.
  function bonusCard(b) {
    const pct = b.target > 0 ? Math.min(100, (b.current / b.target) * 100) : 0;
    const won = b.target > 0 && b.current >= b.target;
    const fmt = (v) => (b.ron ? K.lei(v) : K.num(v) + (b.unit ? ' ' + b.unit : ''));
    const left = Math.max(0, b.target - b.current);
    return '<article class="cb-bonus' + (won ? ' is-won' : '') + '"><div class="cb-bonus-top"><span class="k-icon-chip is-' + (won ? 'good' : 'accent') + '">' + icon(won ? 'trophy' : b.ic) + '</span>' +
      '<div><b>' + esc(b.title) + '</b><small>' + esc(b.sub || '') + '</small></div>' + (b.reward ? '<em>' + K.lei(b.reward) + '</em>' : '') + '</div>' +
      '<div class="cb-progress"><i style="--w:' + pct + '%"></i></div>' +
      '<div class="cb-bonus-foot"><span><b>' + fmt(b.current) + '</b> din ' + fmt(b.target) + '</span>' +
      (won ? '<strong class="is-won">' + icon('check') + (b.reward ? 'Câștigat: ' + K.lei(b.reward) : 'Atins') + '</strong>'
        : '<strong>Mai ai ' + fmt(left) + (b.reward ? ' până la ' + K.lei(b.reward) : '') + '</strong>') + '</div></article>';
  }

  function renderComision() {
    if (!cpanel || !K.data) return;
    const D = K.data;
    const sales = (D.mySales || []);
    const inMonth = sales.filter((s) => K.monthOf(s.date) === C.month);
    const approved = inMonth.filter((s) => s.status === 'approved');
    const pending = inMonth.filter((s) => s.status === 'pending');
    const comm = approved.reduce((a, s) => a + Number(s.commission || 0), 0);
    const pendEst = pending.reduce((a, s) => a + Number(s.amount || 0) * rate(), 0);
    const isNow = C.month === K.thisMonth();

    // personal bonuses (set by the owner in Echipa) + the team's ones
    const METRIC = {
      comision_aprobat_luna: { ron: true, ic: 'percent' }, incasari_atribuite_luna: { ron: true, ic: 'wallet' }, incasari_inregistrate_luna: { ron: true, ic: 'wallet' },
      vanzari_aprobate_luna: { unit: 'upsell-uri', ic: 'trend' }, programari_finalizate_luna: { unit: 'tratamente', ic: 'sparkles' }, leaduri_contactate_luna: { unit: 'leaduri', ic: 'phone' },
      leaduri_programate_luna: { unit: 'programări', ic: 'calendar' }, programari_confirmate_azi: { unit: 'programări', ic: 'checkCircle' },
    };
    const mine = (D.myGoals || []).map((g) => Object.assign({ title: g.title, current: Number(g.current) || 0, target: Number(g.target) || 0, reward: Number(g.reward) || 0, sub: 'Bonusul tău, setat de administrator' }, METRIC[g.metric] || { ic: 'star' }));
    const team = [];
    const cg = D.companyGoal || {};
    if (cg.target) team.push({ title: 'Obiectivul clinicii', sub: 'Toate încasările din Timișoara și Arad, luna aceasta. Se plătește tuturor.', current: Number(cg.current) || 0, target: Number(cg.target) || 0, reward: Number(cg.reward) || 0, ron: true, ic: 'target' });
    const rb = D.raceBonus || {};
    if (rb.reward && rb.target) {
      const lb = rb.leaderboard || [];
      const meRow = lb.find((r) => r.employeeId === D.me.id) || { count: 0 };
      const rank = lb.findIndex((r) => r.employeeId === D.me.id) + 1;
      team.push({ title: 'Cursa lunii · ' + (K.cats[rb.category] || rb.category), sub: 'Cine face cele mai multe tratamente din categorie' + (rank ? ' · ești pe locul ' + rank : ''), current: meRow.count, target: Number(rb.target), reward: Number(rb.reward), unit: 'tratamente', ic: 'trophy' });
    }

    cpanel.querySelector('[data-body]').innerHTML =
      '<section class="cb-hero k-card"><div class="cb-hero-main"><span>Comisionul tău · ' + esc(K.monthLabel(C.month)) + '</span>' +
        '<b data-count="' + comm + '" data-fmt="lei" data-key="cb-' + C.month + '">0</b>' +
        (pending.length ? '<p>' + icon('clock') + '+ ~' + K.lei(pendEst) + ' în așteptarea aprobării (' + K.plural(pending.length, 'upsell', 'upsell-uri') + ')</p>' : '<p>' + icon('checkCircle') + 'Nimic în așteptare.</p>') + '</div>' +
        '<div class="cb-rule">' + icon('info') + '<span>Primești <b>' + Math.round(rate() * 100) + '%</b> din fiecare upsell: când clienta plătește mai mult decât suma programării, diferența e upsell-ul tău.</span></div>' +
        '<div class="k-month"><button type="button" class="k-icon-btn" data-m="-1" aria-label="Luna anterioară">' + icon('left') + '</button><b>' + esc(K.monthLabel(C.month)) + '</b><button type="button" class="k-icon-btn" data-m="1" aria-label="Luna următoare"' + (isNow ? ' disabled' : '') + '>' + icon('right') + '</button></div></section>' +
      (isNow ? '<section class="cb-sec"><h3>' + icon('star') + 'Bonusurile tale</h3>' + (mine.length ? '<div class="cb-bonuses">' + mine.map(bonusCard).join('') + '</div>' : '<p class="k-muted">Nu ai încă un bonus personal luna aceasta.</p>') + '</section>' +
        '<section class="cb-sec"><h3>' + icon('users') + 'Bonusurile echipei</h3>' + (team.length ? '<div class="cb-bonuses">' + team.map(bonusCard).join('') + '</div>' : '<p class="k-muted">Niciun bonus de echipă luna aceasta.</p>') + '</section>' : '') +
      '<section class="cb-sec"><h3>' + icon('trend') + 'Upsell-urile mele · ' + esc(K.monthLabel(C.month)) + '</h3>' +
        (inMonth.length ? '<div class="k-list k-card">' + inMonth.slice().sort((a, b) => (a.date < b.date ? 1 : -1)).map((s) => {
          const st = SALE_STATUS[s.status] || { label: s.status, tone: '' };
          return '<div class="k-row"><span class="k-icon-chip is-' + st.tone + '">' + icon(s.status === 'approved' ? 'check' : s.status === 'rejected' ? 'ban' : 'clock') + '</span>' +
            '<div class="k-row-main"><div class="k-row-title">' + esc(s.client || s.treatment) + '</div><div class="k-row-sub">' + esc(K.dateShort(s.date)) + ' · ' + esc(String(s.treatment || '').replace(/^Upsell · /, '')) + ' · upsell ' + K.lei(s.amount) + (s.decisionNote ? '<span class="mo-reason">' + esc(s.decisionNote) + '</span>' : '') + '</div></div>' +
            '<div class="k-row-end"><span class="k-tag is-' + st.tone + '">' + st.label + '</span><span class="k-amount">' + (s.status === 'approved' ? '+' + K.lei(s.commission, 2) : s.status === 'pending' ? '~' + K.lei(Number(s.amount) * rate(), 2) : '—') + '</span></div></div>';
          }).join('') + '</div>'
          : K.empty('trend', 'Niciun upsell în ' + K.monthLabel(C.month).toLowerCase(), 'Când o clientă plătește mai mult decât suma programării la un tratament făcut de tine, upsell-ul apare aici.')) + '</section>';
    K.countAll(cpanel);
  }

  K.section('comision', { mount: mountComision, show: renderComision, data() { if (cpanel && K.isActive('comision')) renderComision(); } });
})();
