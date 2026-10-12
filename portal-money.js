// Centrul360 portal, money: "Încasări" and "Salariu" (with the commission or the booking bonus).
// Încasări: pick the city (Timișoara / Arad / both) and the period (today, yesterday, this week,
// this month, last month or exact dates); totals per payment method, daily bars, per person and
// per category, the day-grouped list, CSV + print. A payment always starts from an appointment:
// the desk picks WHICH appointment, HOW it was paid (card / cash / transfer / cash + card), WHO did
// the treatment and, when she sold something extra, ticks "Upsell efectuat" with its value. The
// commission on it (value - 60% costs, 10% of the profit) waits for the owner's approval.
// Salariu: salary + overtime + commission (cosmeticians) or the booking bonus (reception), per month.
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
    return K.dateShort(a) + ' - ' + K.dateShort(b) + (a.slice(0, 4) !== K.today().slice(0, 4) ? ' ' + a.slice(0, 4) : '');
  };

  function mountIncasari(p) {
    panel = p;
    panel.classList.add('k-panel', 'mo');
    const locked = !!(K.data && K.data.city); // cosmeticians: only their city, no switch
    if (locked) S.loc = K.data.city;
    S.from = K.thisMonth() + '-01'; S.to = K.today();
    panel.innerHTML =
      '<div class="k-head"><div><div class="k-eyebrow">Clinică</div><h2>Încasări</h2><p class="k-lede">Fiecare plată, în timp real. Alege orașul și perioada.</p></div>' +
      '<div class="k-head-actions"><button type="button" class="k-btn is-outline" data-act="csv">' + icon('download') + 'Export</button>' +
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
    rows.forEach((s) => { const n = s.performedByName && s.performedByName !== '-' ? s.performedByName : 'Neatribuit'; byPerson[n] = (byPerson[n] || 0) + Number(s.amount || 0); });
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
          (people.length ? '<div class="mo-people-grid">' + people.map((n) => '<div class="mo-person">' + K.avatar(n, 34) + '<div><b>' + esc(n) + '</b><span>' + K.lei(byPerson[n]) + ' · ' + pct(byPerson[n]) + '%</span><div class="k-bar"><i style="--w:' + (byPerson[n] / byPerson[people[0]]) * 100 + '%"></i></div></div></div>').join('') + '</div>' : '<p class="k-muted">-</p>') + '</section>' +
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
            '<div class="k-row-main"><div class="k-row-title">' + esc(s.client || '-') + '</div><div class="k-row-sub">' + esc(s.treatment) + (K.catLabel(s) ? ' · ' + esc(K.catLabel(s)) : '') +
            (s.performedByName && s.performedByName !== '-' ? ' · ' + esc(s.performedByName) : '') + (S.loc === 'all' && s.location ? ' · ' + esc(s.location) : '') + '</div></div>' +
            '<div class="k-row-end">' + (s.upsell ? '<span class="k-tag is-good">+' + K.lei(s.upsell) + ' upsell</span>' : '') + '<span class="k-tag">' + mm.label + '</span><span class="k-amount">' + K.lei(s.amount, 2) + '</span></div></div>';
        }).join('') + '</div>').join('');
  }

  // ---------------- new payment: appointment → method → who did it
  async function openNew(pre) {
    pre = pre || {};
    // Step 1 = city (Timișoara / Arad) → day (today by default) → that day's unpaid appointments in a dropdown.
    const st = { list: null, apptId: pre.appointmentId || '', method: 'card', who: '', day: K.today(), upsell: false,
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
      root().innerHTML = step1 +
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
        '</section>';
      note(); updateSave();
    }
    function vals() {
      const a = appt();
      const amt = Number((d.el.querySelector('[data-amount]') || {}).value) || 0;
      const cash = Number((d.el.querySelector('[data-cash]') || {}).value) || 0;
      const card = Number((d.el.querySelector('[data-card]') || {}).value) || 0;
      const ups = st.upsell ? amt : 0; // "Upsell efectuat" = the whole amount paid is the upsell
      return { a, amt, cash, card, ups };
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
        return;
      }
      if (t.matches('[data-appt-select]')) {
        st.apptId = t.value; st.amount = null; st.cash = ''; st.card = ''; st.upsell = false;
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
      keepInputs(); note(); updateSave();
    }
    async function save() {
      if (!ready()) return;
      const { a, amt, cash, card, ups } = vals();
      try {
        const r = await K.api('/api/portal-sale', { source: 'incasare', appointmentId: a.id, method: st.method, amount: amt, cashAmount: cash, cardAmount: card, performedBy: st.who, upsell: st.upsell, upsellAmount: ups });
        d.close();
        K.ui().toast('Încasat ' + K.lei(amt, 2) + ' · ' + a.clientName + (r.upsell ? '. Comision ' + K.lei(r.upsell.commission, 2) + '.' : ''), 'success');
        if (!(a.date >= range()[0] && a.date <= range()[1])) { S.period = a.date === K.today() ? 'today' : 'month'; }
        K.reload();
        K.emit('remote');
      } catch (err) {
        const msg = { invalid_upsell: 'Valoarea upsell-ului trebuie să fie între 1 leu și suma încasată.', already_paid: 'Programarea e deja încasată.', missing_performer: 'Alege cine a făcut tratamentul.', invalid_split: 'Cash + card trebuie să dea suma totală.', appointment_not_found: 'Programarea nu mai există.' }[err.code];
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
          (s.upsell ? '<dt>Upsell</dt><dd>Da · comision ' + K.lei(K.commissionOf(s.upsell), 2) + '</dd>' : '') +
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
      '<div class="k-head"><div><div class="k-eyebrow">Echipă</div><h2>Salariul meu</h2><p class="k-lede">Ce primești în mână luna asta și din ce se adună.</p></div></div>' +
      '<div data-body></div>';
    cpanel.addEventListener('click', (e) => {
      const m = e.target.closest('[data-m]');
      if (m) { C.month = K.addMonths(C.month, +m.dataset.m); renderComision(); return; }
      const h = e.target.closest('[data-month]');
      if (h) { C.month = h.dataset.month; renderComision(); cpanel.scrollIntoView({ behavior: 'smooth', block: 'start' }); return; }
      if (e.target.closest('[data-go-train]')) K.go('traininguri');
    });
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
        (bk.next ? '<small>' + (bk.days ? 'Încă ' + K.num(Math.ceil((bk.next.min - bk.avg) * 10) / 10) + ' pe zi pentru ' + K.lei(bk.next.lei) : 'de la ' + bk.next.min + ' pe zi') + (isNow && daysLeft ? ' · ' + K.plural(daysLeft, 'zi rămasă', 'zile rămase') : '') + '</small>' : '<small>Treapta cea mai mare. Bravo!</small>') + '</div></div>' +
      '<div class="sl-tiers"><div class="sl-track"><i style="--w:' + pct(bk.avg) + '%"></i>' +
        tiers.map((t) => '<span class="sl-tick' + (bk.avg >= t.min ? ' is-on' : '') + '" style="left:' + pct(t.min) + '%"><b>' + t.min + '+</b><em>' + K.lei(t.lei) + '</em></span>').join('') + '</div></div>' +
      '<p class="cd-rule">' + icon('info') + 'Media = programările făcute de tine împărțite la zilele în care ai pontat sosirea. 24-27 pe zi: 500 lei, 27-30: 700 lei, 30+: 1.500 lei.</p>' +
      (bk.perDay.length ? '<div class="sl-days">' + bk.perDay.slice().reverse().map((d) => '<div class="sl-day' + (d.count >= tiers[0].min ? ' is-good' : '') + '"><span>' + esc(K.dateShort(d.date)) + '</span><b>' + d.count + '</b></div>').join('') + '</div>' : '') +
      '</section>';
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
          tile('clock', 'Ore suplimentare', lei2(pay.overtimeLei), pay.overtimeMinutes ? hm(pay.overtimeMinutes) + ' × 40 lei' + (pay.overtimeDueLei ? ', vin cu salariul' : '') : 'nicio oră luna asta') +
          (pay.hasBonus ? tile('trophy', 'Bonus programări', K.lei(pay.bonus), pay.booking && pay.booking.days ? 'media ' + K.num(pay.booking.avg) + ' pe zi' : 'nicio zi pontată încă', pay.bonus ? 'is-good' : '')
            : tile('percent', 'Comision', lei2(pay.commission), K.plural(pay.upsells, 'upsell', 'upsell-uri') + (pay.commissionWaiting ? ' · ' + lei2(pay.commissionWaiting) + ' în așteptare' : ''))) +
        '</div></section>';

    let detail = '';
    if (pay && pay.hasBonus && pay.booking) detail = bookingHtml(pay.booking, isNow);
    else if (!isDesk) {
      detail =
        '<section class="cb-sec"><h3>' + icon('percent') + 'Comisionul meu · ' + esc(K.monthLabel(C.month)) + '</h3>' +
          '<p class="cd-rule">' + icon('info') + 'Din valoarea upsell-ului se scad ' + RULE.cost + '% (cheltuielile medii ale procedurii), iar din ce rămâne primești ' + RULE.rate + '%. Exemplu: 3.000 lei upsell, 120 lei comision.</p>' +
          '<div class="k-grid c4 k-stagger" style="margin-top:.8rem">' +
          '<div class="k-stat"><div class="k-stat-top"><span class="k-stat-ic">' + icon('sparkles') + '</span>Tratamente făcute</div><div class="k-stat-value">' + done.length + '</div><div class="k-stat-sub">' + delta(done.length, donePrev.length) + 'vs ' + K.MON_S[Number(prevM.slice(5)) - 1] + '.' + (isNow ? ' (aceleași zile)' : '') + '</div></div>' +
          '<div class="k-stat"><div class="k-stat-top"><span class="k-stat-ic">' + icon('wallet') + '</span>Încasat din tratamentele tale</div><div class="k-stat-value">' + K.lei(doneValue) + '</div><div class="k-stat-sub">' + delta(doneValue, donePrevValue) + (done.length ? 'bon mediu ' + K.lei(doneValue / done.length) : 'încă nimic luna asta') + '</div></div>' +
          '<div class="k-stat"><div class="k-stat-top"><span class="k-stat-ic">' + icon('trend') + '</span>Rata de upsell</div><div class="k-stat-value">' + upRate + '%</div><div class="k-stat-sub">' + withUpsell + ' din ' + done.length + ' tratamente cu upsell</div></div>' +
          '<div class="k-stat"><div class="k-stat-top"><span class="k-stat-ic">' + icon('percent') + '</span>Upsell mediu</div><div class="k-stat-value">' + K.lei(inMonth.length ? upsTotal / inMonth.length : 0) + '</div><div class="k-stat-sub">' + K.lei(inMonth.length ? K.commissionOf(upsTotal / inMonth.length) : 0, 2) + ' comision / upsell</div></div>' +
        '</div></section>' +
        (done.length ? '<section class="k-card cb-sec"><div class="k-card-head"><h3>' + icon('trend') + 'Pe zile</h3><span class="k-sub">valoarea tratamentelor făcute de tine</span></div><div data-cbchart></div></section>' : '') +
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
                '<div class="k-row-end">' + (s.status === 'approved' ? '' : '<span class="k-tag is-' + st.tone + '">' + st.label + '</span>') + '<span class="k-amount">+' + K.lei(val, 2) + '</span></div></div>';
            }).join('') + '</div>'
              : K.empty('trend', 'Niciun upsell încă', 'Upsell-urile la tratamentele făcute de tine apar aici, cu comisionul lor.')) + '</section>' +
        '</div>';
    }

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

    cpanel.querySelector('[data-body]').innerHTML = hero + detail + (tips ? '<div class="mo-row is-flip cb-lists">' + histHtml + tips + '</div>' : histHtml);

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

  K.section('comision', { mount: mountComision, show: renderComision, data() { if (cpanel && K.isActive('comision')) renderComision(); } });
})();
