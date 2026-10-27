// Centrul360 portal - Panou (live dashboard). Everything here is derived from /api/portal-data
// (K.data) plus the pipeline leads (K.leads()); it refreshes itself every minute while visible and
// the clock / "now" line / relative times tick every second.
(function () {
  'use strict';
  const K = window.K;
  const { esc, icon } = K;
  let panel = null, timer = 0, leadsData = null, firstPaint = true, tasksOpen = 0;
  let actData = null, actTimer = 0; // today's changes by the whole team (Activitate), for the owner
  function loadAct() {
    if (!K.data || !K.data.isAdmin) return;
    K.api('/api/portal-activity?days=1').then((j) => {
      actData = j.lines || [];
      const box = panel && panel.querySelector('[data-team]');
      if (box && leadsData) box.innerHTML = teamHtml(leadsData.leads || []);
    }).catch(() => {});
  }
  // a change anywhere: the card follows (the line is written a moment after the change)
  K.on('remote', () => { if (!panel || !K.isActive('panou')) return; loadAct(); clearTimeout(actTimer); actTimer = setTimeout(loadAct, 2500); });
  let customizeCtx = null; // what Personalizează offers this account (set by render)
  K.on('tasks', (list) => { tasksOpen = list.length; });

  const STATUS = {
    programata: { label: 'Programată', tone: 'accent' }, confirmata: { label: 'Confirmată', tone: 'good' },
    finalizata: { label: 'Finalizată', tone: '' }, reprogramata: { label: 'Reprogramată', tone: 'warn' }, anulata: { label: 'Anulată', tone: 'bad' },
  };

  // an average with one decimal (23,9 isn't 24)
  const avg1 = (v) => (Number(v) || 0).toLocaleString('ro-RO', { minimumFractionDigits: 0, maximumFractionDigits: 1 });
  function greeting() {
    const h = new Date().getHours();
    return h < 5 ? 'Noapte bună' : h < 12 ? 'Bună dimineața' : h < 18 ? 'Bună ziua' : 'Bună seara';
  }
  function dayIcon() { const h = new Date().getHours(); return h < 7 ? 'moon' : h < 11 ? 'sunrise' : h < 19 ? 'sun' : 'moon'; }

  function sumBy(list, from, to) {
    return list.filter((s) => s.date >= from && s.date <= to).reduce((a, s) => a + Number(s.amount || 0), 0);
  }
  function dailySeries(list, days) {
    const out = [];
    for (let i = days - 1; i >= 0; i--) { const d = K.addDays(K.today(), -i); out.push({ d, v: sumBy(list, d, d) }); }
    return out;
  }
  function delta(cur, prev) {
    if (!prev && !cur) return '<span class="k-delta is-flat">-</span>';
    if (!prev) return '<span class="k-delta is-up">' + icon('arrowUp') + 'nou</span>';
    const p = Math.round(((cur - prev) / prev) * 100);
    return '<span class="k-delta ' + (p > 0 ? 'is-up' : p < 0 ? 'is-down' : 'is-flat') + '">' + icon(p >= 0 ? 'arrowUp' : 'arrowDown') + Math.abs(p) + '%</span>';
  }

  function mount(p) {
    panel = p;
    panel.classList.add('k-panel', 'db');
    panel.innerHTML = '<div class="db-root"></div>';
    panel.addEventListener('click', onClick);
    K.everySecond(tick);
  }

  // the owner's two pages of the Panou: the day (Azi) and every number of the clinic (KPI, portal-kpi.js)
  let view = 'azi';
  try { view = localStorage.getItem('c360.dash.view') === 'kpi' ? 'kpi' : 'azi'; } catch (e) { /* the day */ }
  const viewsHtml = () => '<div class="db-views"><div class="k-seg">' + [['azi', 'sun', 'Azi'], ['kpi', 'trend', 'KPI']].map(([k, ic, l]) =>
    '<button type="button" data-view="' + k + '" class="' + (view === k ? 'is-on' : '') + '">' + icon(ic) + l + '</button>').join('') + '</div></div>';

  function onClick(e) {
    const v = e.target.closest('[data-view]');
    if (v) {
      view = v.dataset.view;
      try { localStorage.setItem('c360.dash.view', view); } catch (err) { /* this visit only */ }
      firstPaint = true;
      render();
      return;
    }
    if (e.target.closest('[data-act="customize"]')) return customizeDash();
    const a = e.target.closest('[data-go]');
    if (a) { e.preventDefault(); K.go(a.dataset.go); if (a.dataset.then) setTimeout(() => K.emit(a.dataset.then, a.dataset.arg || null), 250); return; }
    const appt = e.target.closest('[data-appt]');
    if (appt) { K.go('programari'); setTimeout(() => K.emit('calendar:open', { id: appt.dataset.appt, date: K.today() }), 250); return; }
    const lead = e.target.closest('[data-lead]');
    if (lead) { K.go('pipeline'); setTimeout(() => window.C360Pipeline && window.C360Pipeline.openLead(lead.dataset.lead), 400); }
  }

  // Personalizează: the KPI cards (any number, any order) and the blocks of the page, per account
  function customizeDash() {
    const c = customizeCtx; if (!c) return;
    const catalog = {};
    c.mineKpi.forEach((k) => { catalog[k] = { label: c.KPI[k].label, group: c.KPI[k].group, only: ['kpis'] }; });
    Object.keys(c.BLOCK).filter((b) => c.BLOCK[b].ok).forEach((b) => { catalog['b:' + b] = { label: c.BLOCK[b].label, group: 'Secțiuni', only: ['blocks'] }; });
    const groups = []; c.mineKpi.forEach((k) => { if (!groups.includes(c.KPI[k].group)) groups.push(c.KPI[k].group); });
    K.customize({
      title: 'Personalizează panoul', subtitle: 'Alegi cifrele de sus și secțiunile, în ordinea ta. Se păstrează pe contul tău.',
      catalog, groups: groups.concat(['Secțiuni']),
      parts: [
        { key: 'kpis', label: 'Cifrele de sus', hint: 'Oricâte; se așază pe rânduri.', value: c.kpiNow, def: c.DEF },
        { key: 'blocks', label: 'Secțiunile', hint: 'Ce apare sub cifre și în ce ordine.', value: c.blocksNow.map((b) => 'b:' + b), def: c.DEF_BLOCKS.map((b) => 'b:' + b) },
      ],
      async onSave(v) {
        await K.prefs.set('dash.kpis', v.kpis);
        await K.prefs.set('dash.blocks', v.blocks.map((b) => b.slice(2)));
        render();
      },
    });
  }

  // ------------------------------------------------------------------ render
  function render() {
    if (!panel || !K.data) return;
    const D = K.data;
    if (D.isAdmin && view === 'kpi' && window.C360Kpi) {
      const root = panel.querySelector('.db-root');
      let box = root.querySelector('[data-kpi-root]');
      if (!box) { root.innerHTML = viewsHtml() + '<div data-kpi-root></div>'; box = root.querySelector('[data-kpi-root]'); }
      window.C360Kpi.mount(box);
      return;
    }
    const me = D.me, first = String(me.name || '').split(' ')[0];
    const today = K.today();
    const inc = D.incasari || [];
    const month = K.thisMonth();
    const dayOfMonth = Number(today.slice(8, 10));
    const prevMonth = K.addMonths(month, -1);
    const prevSameDay = prevMonth + '-' + K.pad(Math.min(dayOfMonth, K.daysIn(prevMonth)));
    const todaySum = sumBy(inc, today, today);
    const todayCount = inc.filter((s) => s.date === today).length;
    const yesterday = sumBy(inc, K.addDays(today, -1), K.addDays(today, -1));
    const mtd = sumBy(inc, month + '-01', today);
    const prevMtd = sumBy(inc, prevMonth + '-01', prevSameDay);
    const spark14 = dailySeries(inc, 14).map((x) => x.v);
    const appts = (D.appointmentsToday && D.appointmentsToday.list) || [];
    const live = appts.filter((a) => a.status !== 'anulata');
    const confirmed = appts.filter((a) => a.status === 'confirmata').length;
    const L = leadsData ? leadsData.leads || [] : [];
    const working = L.filter((l) => l.kind === 'open' || l.kind === 'booked');
    const callNow = working.filter((l) => l.followUpState === 'overdue' || l.neverContacted);
    const pending = D.isAdmin && D.admin ? D.admin.pendingSales.length : 0;

    // ---- role shaping: reception runs the front desk, a cosmetician sees her own day + earnings
    const role = D.isAdmin ? 'admin' : me.role;
    const mineToday = appts.filter((a) => a.cosmeticianId === me.id);
    const unconfirmed = appts.filter((a) => a.status === 'programata');
    const ms = D.mySales || [];
    const commMonth = ms.filter((s) => s.status === 'approved' && K.monthOf(s.date) === month).reduce((a, s) => a + Number(s.commission || 0), 0);
    const commPrev = ms.filter((s) => s.status === 'approved' && K.monthOf(s.date) === prevMonth && s.date <= prevSameDay).reduce((a, s) => a + Number(s.commission || 0), 0);
    const pendingMine = ms.filter((s) => s.status === 'pending');
    const pendingEst = pendingMine.reduce((a, s) => a + (s.commission ? Number(s.commission) : K.commissionOf(s.amount)), 0);
    const attributed = inc.filter((s) => s.performedBy === me.id && K.monthOf(s.date) === month).reduce((a, s) => a + Number(s.amount || 0), 0);

    const summary = [];
    if (role === 'cosmetician') {
      summary.push('<a href="#programari" data-go="programari">' + K.plural(mineToday.filter((a) => a.status !== 'anulata').length, 'clientă', 'cliente') + '</a> azi');
      if (pendingMine.length) summary.push('<a href="#comision" data-go="comision">' + K.plural(pendingMine.length, 'upsell', 'upselluri') + ' în așteptare</a>');
    } else {
      summary.push('<a href="#programari" data-go="programari">' + K.plural(live.length, 'programare', 'programări') + '</a> azi');
      if (role === 'receptie' && unconfirmed.length) summary.push('<a href="#programari" data-go="programari">' + K.plural(unconfirmed.length, 'programare de confirmat', 'programări de confirmat') + '</a>');
      if (callNow.length) summary.push('<a href="#pipeline" data-go="pipeline" data-then="pipeline:queue">' + K.plural(callNow.length, 'lead de sunat', 'leaduri de sunat') + '</a>');
      if (role === 'receptie' && tasksOpen) summary.push('<a href="#automatizari" data-go="automatizari">' + K.plural(tasksOpen, 'sarcină', 'sarcini') + '</a>');
      if (pending) summary.push('<a href="#aprobari" data-go="aprobari">' + K.plural(pending, 'upsell de aprobat', 'upselluri de aprobat') + '</a>');
    }
    const actions = role === 'cosmetician'
      ? '<button type="button" class="k-btn is-accent" data-go="programari">' + icon('calendar') + 'Calendarul meu</button>' +
        '<button type="button" class="k-btn db-glass" data-go="contacte">' + icon('image') + 'Fișe și poze</button>' +
        '<button type="button" class="k-btn db-glass" data-go="comision">' + icon('wallet') + 'Salariul meu</button>' +
        '<button type="button" class="k-btn db-glass" data-go="traininguri">' + icon('book') + 'Traininguri</button>'
      : '<button type="button" class="k-btn is-accent" data-go="incasari" data-then="incasari:new">' + icon('wallet') + 'Încasare</button>' +
        '<button type="button" class="k-btn db-glass" data-go="programari" data-then="calendar:new">' + icon('calendar') + 'Programare</button>' +
        '<button type="button" class="k-btn db-glass" data-go="pipeline" data-then="pipeline:new">' + icon('userPlus') + 'Lead</button>' +
        (callNow.length ? '<button type="button" class="k-btn db-glass" data-go="pipeline" data-then="pipeline:queue">' + icon('zap') + 'Coada de apeluri · ' + callNow.length + '</button>' : '');
    const custom = '<button type="button" class="k-btn db-glass db-custom" data-act="customize" title="Alege cifrele și secțiunile panoului">' + icon('sliders') + 'Personalizează</button>';

    // Chart: clinic revenue for admin/reception; the cosmetician's own approved commission otherwise.
    const chartSrc = role === 'cosmetician' ? ms.filter((s) => s.status === 'approved').map((s) => ({ date: s.date, amount: s.commission })) : inc;
    const series30 = dailySeries(chartSrc, 30);
    const prev30 = (() => { const out = []; for (let i = 59; i >= 30; i--) { const d = K.addDays(today, -i); out.push(sumBy(chartSrc, d, d)); } return out; })();
    const stat = (cls, go, then, ic, label, value, fmt, key, sub, extra) =>
      '<button type="button" class="k-stat ' + cls + '" data-go="' + go + '"' + (then ? ' data-then="' + then + '"' : '') + '><div class="k-stat-top"><span class="k-stat-ic">' + icon(ic) + '</span>' + label + '</div>' +
      '<div class="k-stat-value" data-count="' + value + '"' + (fmt ? ' data-fmt="' + fmt + '"' : '') + ' data-key="' + key + '">0</div><div class="k-stat-sub">' + sub + '</div>' + (extra || '') + '</button>';
    // Pay this month: hers (staff) or the whole team's (owner). See "Salariu" / Echipa > Salarii.
    const lei2 = (v) => K.lei(v, v % 1 ? 2 : 0);
    const myPay = D.salary && D.salary.months && D.salary.months[0];
    const team = (D.admin && D.admin.payroll) || [];
    const tsum = (k) => team.reduce((a, r) => a + (Number(r[k]) || 0), 0);
    const payCard = D.isAdmin
      ? '<section class="k-card db-pay"><div class="k-card-head"><h3>' + icon('wallet') + 'Salarii · ' + esc(K.monthLabel(month)) + '</h3></div>' +
        '<b class="db-pay-total" data-count="' + Math.round(tsum('total')) + '" data-fmt="lei" data-key="db-payt">0 lei</b><span class="db-pay-sub">de plată până azi, toată echipa</span>' +
        '<div class="db-pay-lines"><div><span>Salarii de bază</span><b>' + K.lei(tsum('base')) + '</b></div><div><span>Ore suplimentare</span><b>' + lei2(tsum('overtimeLei')) + '</b></div><div><span>Comision + bonus</span><b>' + lei2(tsum('commission') + tsum('bonus') + tsum('manual')) + '</b></div></div>' +
        '<button type="button" class="k-btn is-sm is-outline" data-go="angajati">' + icon('users') + 'Echipa · Salarii</button></section>'
      : myPay ? '<section class="k-card db-pay"><div class="k-card-head"><h3>' + icon('wallet') + 'Salariul meu · ' + esc(K.monthLabel(month)) + '</h3></div>' +
        '<b class="db-pay-total" data-count="' + myPay.total + '" data-fmt="lei" data-key="db-payme">0 lei</b><span class="db-pay-sub">în mână, până azi</span>' +
        '<div class="db-pay-lines"><div><span>Salariu de bază</span><b>' + (myPay.base ? K.lei(myPay.base) : '-') + '</b></div><div><span>Ore suplimentare</span><b>' + lei2(myPay.overtimeLei) + '</b></div>' +
        (myPay.hasBonus ? '<div><span>Bonus programări</span><b>' + K.lei(myPay.bonus) + '</b></div>' : '<div><span>Comision</span><b>' + lei2(myPay.commission) + '</b></div>') + (myPay.manual ? '<div><span>Comision adăugat</span><b>' + lei2(myPay.manual) + '</b></div>' : '') + '</div>' +
        '<button type="button" class="k-btn is-sm is-outline" data-go="comision">' + icon('wallet') + 'Detalii</button></section>' : '';
    // Reception: the booking bonus at a glance (average per clocked-in day, the steps)
    const bk = myPay && myPay.booking;
    const bonusCard = bk ? '<section class="k-card db-book"><div class="k-card-head"><h3>' + icon('trophy') + 'Bonusul de programări</h3><a class="k-btn is-sm is-outline" href="#comision" data-go="comision">Detalii' + icon('arrow') + '</a></div>' +
      '<div class="db-book-row"><div><b>' + avg1(bk.avg) + '</b><span>programări / zi în medie</span></div><div class="' + (bk.lei ? 'is-on' : '') + '"><b>' + K.lei(bk.lei) + '</b><span>bonus acum</span></div></div>' +
      '<div class="db-book-steps">' + bk.tiers.slice().sort((a, b) => a.min - b.min).map((t) => '<span class="' + (bk.avg >= t.min ? 'is-on' : '') + '">' + t.min + '+ · ' + K.lei(t.lei) + '</span>').join('') + '</div>' +
      (bk.next ? '<p class="db-book-next">' + (bk.days ? 'Încă ' + avg1(Math.max(0.1, Math.ceil((bk.next.min - bk.avg) * 10) / 10)) + ' pe zi pentru ' + K.lei(bk.next.lei) + '.' : 'Pontează sosirea și pornește media de azi.') + '</p>' : '<p class="db-book-next">Treapta cea mai mare. Bravo!</p>') + '</section>' : '';

    // ---- every KPI this account may put on its Panou (its own choice, K.prefs 'dash.kpis')
    const lastMonthSum = sumBy(inc, prevMonth + '-01', K.addDays(month + '-01', -1));
    const monthInc = inc.filter((s) => K.monthOf(s.date) === month);
    const byCity = (c) => monthInc.filter((s) => s.location === c).reduce((a, s) => a + Number(s.amount || 0), 0);
    const upsMonth = monthInc.filter((s) => Number(s.upsell) > 0);
    const dayOf = (iso) => (iso ? K.iso(new Date(iso)) : '');
    const newToday = L.filter((l) => dayOf(l.createdAt) === today);
    const newMonth = L.filter((l) => dayOf(l.createdAt).slice(0, 7) === month);
    const bookedNow = L.filter((l) => l.kind === 'booked');
    const wonMonth = L.filter((l) => l.kind === 'won' && dayOf(l.stageChangedAt).slice(0, 7) === month);
    const pipeValue = working.reduce((a, l) => a + (Number(l.value) || 0), 0);
    const myUpsMonth = ms.filter((s) => K.monthOf(s.date) === month);
    const mineLive = mineToday.filter((a) => a.status !== 'anulata');
    const ALL = ['admin', 'receptie', 'cosmetician'], DESK = ['admin', 'receptie'], STAFF = ['receptie', 'cosmetician'];
    const pct = (a, b) => (b ? Math.round((a / b) * 1000) / 10 : 0);
    const KPI = {
      incToday: { label: 'Încasat azi', group: 'Încasări', roles: DESK, html: () => stat('is-accent', 'incasari', '', 'wallet', 'Încasat azi', todaySum, 'lei', 'db-today', delta(todaySum, yesterday) + K.plural(todayCount, 'încasare', 'încasări'), K.spark(spark14)) },
      incYesterday: { label: 'Încasat ieri', group: 'Încasări', roles: DESK, html: () => stat('is-accent', 'incasari', '', 'wallet', 'Încasat ieri', yesterday, 'lei', 'db-yday', K.dateLong(K.addDays(today, -1))) },
      mtd: { label: 'Încasări luna aceasta', group: 'Încasări', roles: ['admin'], html: () => stat('is-good', 'incasari', '', 'trend', 'Luna aceasta', mtd, 'lei', 'db-mtd', delta(mtd, prevMtd) + 'vs ' + K.MON_S[Number(prevMonth.slice(5)) - 1] + '.') },
      lastMonth: { label: 'Încasări luna trecută', group: 'Încasări', roles: ['admin'], html: () => stat('is-info', 'incasari', '', 'calendar', 'Luna trecută', lastMonthSum, 'lei', 'db-lm', esc(K.monthLabel(prevMonth))) },
      perDay: { label: 'Medie pe zi, luna aceasta', group: 'Încasări', roles: ['admin'], html: () => stat('is-info', 'incasari', '', 'trend', 'Medie pe zi', Math.round(mtd / Math.max(1, dayOfMonth)), 'lei', 'db-perday', 'în ' + dayOfMonth + ' zile din lună') },
      ticket: { label: 'Bon mediu, luna aceasta', group: 'Încasări', roles: ['admin'], html: () => stat('is-info', 'incasari', '', 'wallet', 'Bon mediu', Math.round(mtd / Math.max(1, monthInc.length)), 'lei', 'db-ticket', K.plural(monthInc.length, 'încasare', 'încasări') + ' luna asta') },
      incCountMonth: { label: 'Nr. încasări luna aceasta', group: 'Încasări', roles: ['admin'], html: () => stat('is-info', 'incasari', '', 'wallet', 'Încasări luna asta', monthInc.length, '', 'db-incn', 'plăți înregistrate') },
      incTM: { label: 'Timișoara, luna aceasta', group: 'Încasări', roles: ['admin'], html: () => stat('is-accent', 'incasari', '', 'pin', 'Timișoara', byCity('Timișoara'), 'lei', 'db-tm', 'încasări luna asta') },
      incAR: { label: 'Arad, luna aceasta', group: 'Încasări', roles: ['admin'], html: () => stat('is-accent', 'incasari', '', 'pin', 'Arad', byCity('Arad'), 'lei', 'db-ar', 'încasări luna asta') },
      upsellsMonth: { label: 'Upselluri luna aceasta', group: 'Încasări', roles: ['admin'], html: () => stat('is-good', 'incasari', '', 'trophy', 'Upselluri luna asta', upsMonth.length, '', 'db-ups', K.lei(upsMonth.reduce((a, s) => a + Number(s.upsell || 0), 0)) + ' valoare') },
      apptsToday: { label: 'Programări azi', group: 'Programări', roles: DESK, html: () => stat('is-info', 'programari', '', 'calendar', 'Programări azi', live.length, '', 'db-appts', confirmed + ' confirmate · ' + appts.filter((a) => a.status === 'finalizata').length + ' finalizate') },
      unconfirmed: { label: 'De confirmat azi', group: 'Programări', roles: DESK, html: () => stat(unconfirmed.length ? 'is-warn' : 'is-good', 'programari', '', 'checkCircle', 'De confirmat', unconfirmed.length, '', 'db-unconf', confirmed + ' confirmate din ' + live.length + ' azi') },
      doneToday: { label: 'Finalizate azi', group: 'Programări', roles: DESK, html: () => stat('is-good', 'programari', '', 'checkCircle', 'Finalizate azi', appts.filter((a) => a.status === 'finalizata').length, '', 'db-done', 'din ' + live.length + ' programări') },
      cancelledToday: { label: 'Anulate azi', group: 'Programări', roles: DESK, html: () => stat('is-bad', 'programari', '', 'alert', 'Anulate azi', appts.filter((a) => a.status === 'anulata').length, '', 'db-canc', 'programări anulate') },
      mineToday: { label: 'Clientele mele azi', group: 'Programări', roles: ['cosmetician'], html: () => stat('is-info', 'programari', '', 'calendar', 'Clientele mele azi', mineLive.length, '', 'db-mine', mineToday.filter((a) => a.status === 'confirmata').length + ' confirmate · ' + mineToday.filter((a) => a.status === 'finalizata').length + ' finalizate') },
      callNow: { label: 'De sunat acum', group: 'Leaduri', roles: DESK, html: () => stat(callNow.length ? 'is-bad db-hot' : 'is-good', 'pipeline', 'pipeline:queue', 'zap', 'De sunat acum', callNow.length, '', 'db-call', leadsData ? working.length + ' leaduri active în pipeline' : 'se încarcă…') },
      leadsActive: { label: 'Leaduri active', group: 'Leaduri', roles: DESK, html: () => stat('is-info', 'pipeline', '', 'users', 'Leaduri active', working.length, '', 'db-lact', K.lei(pipeValue) + ' în pipeline') },
      leadsNewToday: { label: 'Leaduri noi azi', group: 'Leaduri', roles: DESK, html: () => stat('is-accent', 'pipeline', '', 'userPlus', 'Leaduri noi azi', newToday.length, '', 'db-lnew', K.plural(newMonth.length, 'lead', 'leaduri') + ' luna asta') },
      leadsNewMonth: { label: 'Leaduri noi luna aceasta', group: 'Leaduri', roles: DESK, html: () => stat('is-accent', 'pipeline', '', 'userPlus', 'Leaduri luna asta', newMonth.length, '', 'db-lmon', newToday.length + ' azi') },
      leadsBooked: { label: 'Leaduri programate', group: 'Leaduri', roles: DESK, html: () => stat('is-info', 'pipeline', '', 'calendar', 'Programați', bookedNow.length, '', 'db-lbook', 'în etapa de programare') },
      leadsWon: { label: 'Câștigați luna aceasta', group: 'Leaduri', roles: DESK, html: () => stat('is-good', 'pipeline', '', 'trophy', 'Câștigați luna asta', wonMonth.length, '', 'db-lwon', pct(newMonth.filter((l) => l.kind === 'won').length, newMonth.length) + '% din leadurile lunii') },
      pendingApprovals: { label: 'Upselluri de aprobat', group: 'Echipa', roles: ['admin'], html: () => stat(pending ? 'is-warn' : 'is-good', 'aprobari', '', 'shield', 'De aprobat', pending, '', 'db-pending', 'upselluri în așteptare') },
      payroll: { label: 'Salarii luna aceasta (echipa)', group: 'Echipa', roles: ['admin'], html: () => stat('is-info', 'angajati', '', 'users', 'Salarii luna asta', Math.round(tsum('total')), 'lei', 'db-payroll', 'de plată până azi') },
      tasksOpen: { label: 'Sarcinile mele', group: 'Echipa', roles: ['receptie'], html: () => stat(tasksOpen ? 'is-warn' : 'is-good', 'automatizari', '', 'checkCircle', 'Sarcini', tasksOpen, '', 'db-tasks', 'de făcut') },
      commMonth: { label: 'Comision luna aceasta', group: 'Salariul meu', roles: ['cosmetician'], html: () => stat('is-good', 'comision', '', 'percent', 'Comision luna aceasta', commMonth, 'lei', 'db-comm', delta(commMonth, commPrev) + 'aprobat', K.spark(dailySeries(chartSrc, 14).map((x) => x.v), { color: 'var(--good)' })) },
      commPending: { label: 'Comision în așteptare', group: 'Salariul meu', roles: ['cosmetician'], html: () => stat('is-warn', 'comision', '', 'clock', 'În așteptare', Math.round(pendingEst), 'lei', 'db-pend', K.plural(pendingMine.length, 'upsell', 'upselluri') + ' · estimat') },
      attributed: { label: 'Încasări atribuite mie', group: 'Salariul meu', roles: ['cosmetician'], html: () => stat('is-accent', 'incasari', '', 'wallet', 'Încasări atribuite', attributed, 'lei', 'db-attr', 'tratamente efectuate de tine luna asta') },
      myUpsells: { label: 'Upsellurile mele luna aceasta', group: 'Salariul meu', roles: ['cosmetician'], html: () => stat('is-good', 'comision', '', 'trophy', 'Upselluri luna asta', myUpsMonth.length, '', 'db-myups', K.lei(myUpsMonth.reduce((a, s) => a + Number(s.amount || 0), 0)) + ' valoare') },
      myPay: { label: 'Salariul meu până azi', group: 'Salariul meu', roles: STAFF, html: () => stat('is-good', 'comision', '', 'wallet', 'Salariul meu', myPay ? Math.round(myPay.total) : 0, 'lei', 'db-mypay', 'în mână, până azi') },
      myOvertime: { label: 'Ore suplimentare (lei)', group: 'Salariul meu', roles: STAFF, html: () => stat('is-info', 'comision', '', 'clock', 'Ore suplimentare', myPay ? Math.round(myPay.overtimeLei || 0) : 0, 'lei', 'db-myot', 'luna asta') },
      bookingAvg: { label: 'Programări pe zi (bonus)', group: 'Salariul meu', roles: ['receptie'], html: () => stat('is-accent', 'comision', '', 'trophy', 'Programări / zi', bk ? bk.avg : 0, '', 'db-bkavg', bk ? 'bonus acum ' + K.lei(bk.lei) : 'pontează ca să pornească media') },
    };
    const DEF_KPI = { admin: ['incToday', 'mtd', 'apptsToday', 'callNow'], receptie: ['incToday', 'unconfirmed', 'apptsToday', 'callNow'], cosmetician: ['mineToday', 'commMonth', 'commPending', 'attributed'] };
    const mineKpi = Object.keys(KPI).filter((k) => KPI[k].roles.includes(role));
    const chosenKpi = (K.prefs.get('dash.kpis', null) || DEF_KPI[role] || []).filter((k) => mineKpi.includes(k));
    const kpis = chosenKpi.map((k) => KPI[k].html()).join('');

    // ---- the page's blocks, in her order (K.prefs 'dash.blocks')
    const BLOCK = {
      chart: { label: role === 'cosmetician' ? 'Graficul comisionului' : 'Graficul încasărilor', size: 'wide', ok: true },
      pay: { label: D.isAdmin ? 'Salariile echipei' : 'Salariul meu', size: 'narrow', ok: !!payCard },
      today: { label: role === 'cosmetician' ? 'Clientele mele azi' : 'Ziua de azi', size: 'wide', ok: true },
      bonus: { label: 'Bonusul de programări', size: 'narrow', ok: !!bonusCard },
      team: { label: 'Echipa în pipeline', size: 'full', ok: !!D.isAdmin },
    };
    const DEF_BLOCKS = ['chart', 'pay', 'today', 'bonus', 'team'];
    const chosenBlocks = (K.prefs.get('dash.blocks', null) || DEF_BLOCKS).filter((b) => BLOCK[b] && BLOCK[b].ok);
    customizeCtx = { KPI, mineKpi, DEF: DEF_KPI[role] || [], BLOCK, DEF_BLOCKS: DEF_BLOCKS.filter((b) => BLOCK[b].ok), kpiNow: chosenKpi, blocksNow: chosenBlocks };
    const blockHtml = {
      chart: () => '<section class="k-card db-chart-card"><div class="k-card-head"><h3>' + icon('trend') + (role === 'cosmetician' ? 'Comisionul meu' : 'Încasări') + ' · ultimele 30 de zile</h3>' +
        '<div class="k-legend"><span><i style="background:var(--accent)"></i>Ultimele 30 zile · ' + K.lei(series30.reduce((a, x) => a + x.v, 0)) + '</span><span><i style="background:var(--muted-2)"></i>Cele 30 dinainte</span></div></div>' +
        '<div data-chart></div></section>',
      pay: () => payCard,
      today: () => '<section class="k-card db-today"><div class="k-card-head"><h3>' + icon('clock') + (role === 'cosmetician' ? 'Clientele mele azi' : 'Ziua de azi') + '</h3><a class="k-btn is-sm is-outline" href="#programari" data-go="programari">Calendar' + icon('arrow') + '</a></div>' +
        '<div class="db-timeline" data-timeline>' + timelineHtml(role === 'cosmetician' ? mineToday : appts) + '</div></section>',
      bonus: () => bonusCard,
      team: () => '<section class="k-card db-team"><div class="k-card-head"><h3>' + icon('users') + 'Ce face echipa</h3><a class="k-btn is-sm is-outline" href="#activitate" data-go="activitate">Activitate' + icon('arrow') + '</a></div><div data-team>' + teamHtml(L) + '</div></section>',
    };

    const root = panel.querySelector('.db-root');
    root.innerHTML = (D.isAdmin && window.C360Kpi ? viewsHtml() : '') +
      // ---------------- hero
      '<section class="db-hero">' +
        '<div class="db-aurora" aria-hidden="true"><i></i><i></i><i></i><i></i><i></i><i></i><i></i></div>' +
        '<div class="db-hero-main">' +
          '<div class="db-date">' + icon(dayIcon()) + '<span>' + esc(K.dateLong(today)) + '</span><span class="k-live">în timp real</span></div>' +
          '<h2>' + greeting() + ', ' + esc(first) + '</h2>' +
          '<p class="db-summary">Ai ' + summary.join(', ').replace(/, ([^,]*)$/, ' și $1') + '.</p>' +
          '<div class="db-actions">' + actions + custom + '</div>' +
        '</div>' +
        '<div class="db-clock" aria-label="Ora"><div class="db-time" data-time></div>' +'<div class="db-secs"><svg viewBox="0 0 48 48" aria-hidden="true"><circle cx="24" cy="24" r="20" class="db-secs-track"/><circle cx="24" cy="24" r="20" class="db-secs-arc" pathLength="60" data-arc/></svg><b data-sec>--</b></div></div>' +
      '</section>' +

      // ---------------- the KPIs and blocks she chose (Personalizează)
      (kpis ? '<div class="db-kpis">' + kpis + '</div>' : '') +
      '<div class="db-blocks">' + chosenBlocks.map((b) => '<div class="db-b is-' + BLOCK[b].size + '">' + blockHtml[b]() + '</div>').join('') + '</div>';

    if (root.querySelector('[data-chart]')) K.chart(root.querySelector('[data-chart]'), {
      labels: series30.map((x) => K.dateShort(x.d)), height: 230, format: K.lei, axis: (v) => (v >= 1000 ? (Math.round(v / 100) / 10).toLocaleString('ro-RO') + 'k' : Math.round(v)),
      series: [
        { name: 'Perioada anterioară', values: prev30, color: 'var(--muted-2)', kind: 'line', dashed: true },
        { name: 'Încasări', values: series30.map((x) => x.v), color: 'var(--accent)' },
      ],
      tip: (i) => '<b>' + esc(K.dateLong(series30[i].d)) + '</b><span><i style="background:var(--accent)"></i>' + K.lei(series30[i].v) + '</span><span><i style="background:var(--muted-2)"></i>cu 30 zile înainte: ' + K.lei(prev30[i]) + '</span>',
      onClick: (i) => { K.go('incasari'); setTimeout(() => K.emit('incasari:day', series30[i].d), 250); },
    });
    if (!firstPaint) root.querySelectorAll('.k-draw, .k-area, .k-ring-bar, .k-bar i').forEach((x) => { x.style.animation = 'none'; });
    firstPaint = false;
    K.countAll(root);
    tick(new Date());
  }

  function timelineHtml(appts) {
    const list = appts.slice().sort((a, b) => (a.time || '99').localeCompare(b.time || '99'));
    if (!list.length) return K.empty('calendar', 'Nicio programare azi', 'Când apar programări, le vezi aici în ordinea orei.', K.frontDesk && K.frontDesk() ? '<button type="button" class="k-btn is-sm is-primary" data-go="programari" data-then="calendar:new">' + icon('plus') + 'Adaugă programare</button>' : '');
    return '<ol class="db-tl">' + list.map((a) => {
      const st = STATUS[a.status] || { label: a.status, tone: '' };
      return '<li class="db-tl-item is-' + a.status + '" data-appt="' + esc(a.id) + '" data-time="' + esc(a.time || '') + '">' +
        '<span class="db-tl-time">' + esc(a.time || '-') + (a.endTime && a.endTime > (a.time || '') ? '<small>' + esc(a.endTime) + '</small>' : '') + '</span><span class="db-tl-dot"></span>' +
        '<div class="db-tl-card"><div class="db-tl-top"><b>' + esc(a.clientName || '-') + '</b><span class="k-tag is-' + st.tone + '">' + st.label + '</span></div>' +
        '<div class="db-tl-sub">' + esc(a.treatment || '') + ' · ' + esc(a.location || '') + (a.cosmeticianName ? ' · ' + esc(a.cosmeticianName) : '') + '</div></div></li>';
    }).join('') + '</ol>';
  }

  // Admin: what the team (reception) did in the pipeline, latest actions + today's counters per person.
  function teamHtml(L) {
    if (!leadsData) return '<div class="k-skel" style="height:120px"></div>';
    const acts = [];
    const ROBOTS = ['Facebook Lead Ads', 'WhatsApp automat', 'Formular site', 'Automatizare', 'Calendar'];
    L.forEach((l) => (l.activities || []).forEach((a) => { if (a.author && a.type !== 'created' && !ROBOTS.includes(a.author)) acts.push({ a, l }); }));
    acts.sort((x, y) => (x.a.at < y.a.at ? 1 : -1));
    const today = K.today();
    const per = {};
    acts.forEach(({ a }) => {
      if (K.iso(new Date(a.at)) !== today) return;
      const p = per[a.author] = per[a.author] || { contact: 0, booking: 0, stage: 0, total: 0 };
      p.total++;
      if (a.type === 'contact') p.contact++;
      if (a.type === 'booking') p.booking++;
      if (a.type === 'stage') p.stage++;
    });
    // everything the team changed today (Activitate), not only the pipeline
    const all = {};
    (actData || []).filter((l) => K.iso(new Date(l.at)) === today).forEach((l) => { all[l.name] = (all[l.name] || 0) + 1; if (!per[l.name]) per[l.name] = { contact: 0, booking: 0, stage: 0, total: 0 }; });
    Object.keys(per).forEach((n) => { per[n].all = all[n] || per[n].total; });
    const people = Object.keys(per).sort((a, b) => per[b].all - per[a].all);
    const verb = (a) => a.type === 'contact' ? (a.channel === 'whatsapp' ? 'a scris pe WhatsApp' : 'a sunat') : a.type === 'booking' ? 'a programat' : a.type === 'stage' ? 'a mutat' : a.type === 'note' ? 'a notat la' : a.type === 'followup' ? 'a setat follow-up la' : 'a actualizat';
    const OUT = { raspuns: 'a răspuns', interesat: 'interesată', programat: 'vrea programare', revine: 'revine', nu_raspunde: 'nu răspunde', refuz: 'nu e interesată', numar_gresit: 'număr greșit' };
    return (people.length ? '<div class="db-team-people">' + people.map((n) =>
      '<div class="db-person">' + K.avatar(n, 34) + '<div><b>' + esc(n) + '</b><span>azi: ' + per[n].all + (per[n].all === 1 ? ' modificare' : ' modificări') + (per[n].contact || per[n].booking ? ' · ' + per[n].contact + ' contactări · ' + per[n].booking + ' programări' : '') + '</span></div></div>').join('') + '</div>'
      : '<p class="k-muted" style="margin:0 0 .8rem">Nimeni n-a lucrat încă azi.</p>') +
      ((actData || []).length ? '<ol class="db-feed">' + actData.slice(0, 7).map((l) =>
        '<li data-go="' + esc(l.go || 'activitate') + '">' + K.avatar(l.name, 26) + '<div><span><b>' + esc(l.name) + '</b> ' + esc(l.verb) + (l.subject ? ' <b>' + esc(l.subject) + '</b>' : '') +
        (l.detail ? ' · ' + esc(l.detail) : '') + '</span><small data-ago="' + esc(l.at) + '">' + K.ago(l.at) + '</small></div></li>').join('') + '</ol>'
      : acts.length ? '<ol class="db-feed">' + acts.slice(0, 7).map(({ a, l }) =>
        '<li data-lead="' + esc(l.id) + '">' + K.avatar(a.author, 26) + '<div><span><b>' + esc(a.author) + '</b> ' + verb(a) + ' <b>' + esc(l.name) + '</b>' +
        (a.type === 'contact' && OUT[a.outcome] ? ' · ' + OUT[a.outcome] : a.type === 'stage' ? ' · ' + esc(a.text) : '') + '</span><small data-ago="' + esc(a.at) + '">' + K.ago(a.at) + '</small></div></li>').join('') + '</ol>'
        : K.empty('users', 'Încă nicio activitate', 'Apelurile, programările și mutările din pipeline apar aici în timp real.'));
  }

  // ------------------------------------------------------------------ live ticking
  function tick(now) {
    if (!panel || !K.isActive('panou')) return;
    setClock(now);
    if (now.getSeconds() % 20 === 0 || !panel.querySelector('.db-now')) placeNow(now);
    if (now.getSeconds() === 0) panel.querySelectorAll('[data-ago]').forEach((x) => { x.textContent = K.ago(x.dataset.ago); });
  }
  // Hero clock: each digit rolls in when it changes, seconds sweep a glowing ring.
  function setClock(now) {
    const box = panel.querySelector('[data-time]');
    if (!box) return;
    const str = K.pad(now.getHours()) + ':' + K.pad(now.getMinutes());
    if (box.children.length !== 5) {
      box.innerHTML = str.split('').map((ch) => (ch === ':' ? '<i class="db-colon">:</i>' : '<span class="db-dig"><span>' + ch + '</span></span>')).join('');
    } else {
      str.split('').forEach((ch, i) => {
        const slot = box.children[i];
        if (ch === ':') return;
        const cur = slot.lastElementChild;
        if (cur && cur.textContent === ch && !cur.classList.contains('out')) return;
        const n = document.createElement('span');
        n.textContent = ch;
        n.className = 'in';
        if (cur) { cur.classList.add('out'); setTimeout(() => cur.remove(), 650); }
        slot.appendChild(n);
      });
    }
    const s = now.getSeconds();
    const secEl = panel.querySelector('[data-sec]');
    if (secEl) secEl.textContent = K.pad(s);
    const arc = panel.querySelector('[data-arc]');
    if (arc) {
      arc.style.transition = s === 0 ? 'none' : '';
      arc.style.strokeDashoffset = String(60 - (s === 0 ? 60 : s));
    }
  }
  function placeNow(now) {
    const tl = panel.querySelector('.db-tl');
    if (!tl) return;
    const hm = K.pad(now.getHours()) + ':' + K.pad(now.getMinutes());
    let line = tl.querySelector('.db-now');
    if (!line) { line = document.createElement('li'); line.className = 'db-now'; line.innerHTML = '<span>' + hm + '</span><i></i>'; }
    line.querySelector('span').textContent = hm;
    const items = Array.from(tl.querySelectorAll('.db-tl-item'));
    let placed = false;
    items.forEach((it) => {
      const t = it.dataset.time;
      const past = t && t < hm;
      it.classList.toggle('is-past', !!past && !it.classList.contains('is-anulata'));
      const [h, m] = (t || '').split(':').map(Number);
      const mins = now.getHours() * 60 + now.getMinutes() - (h * 60 + m);
      it.classList.toggle('is-now', !!t && mins >= 0 && mins < 60 && !it.classList.contains('is-anulata') && !it.classList.contains('is-finalizata'));
      if (!placed && t && t > hm) { tl.insertBefore(line, it); placed = true; }
    });
    if (!placed) tl.appendChild(line);
  }

  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  function skeleton() {
    return '<div class="k-skel" style="height:190px;border-radius:24px"></div><div class="k-grid c4" style="margin-top:1rem">' +
      '<div class="k-skel" style="height:118px"></div>'.repeat(4) + '</div><div class="k-skel" style="height:300px;margin-top:1rem"></div>';
  }

  K.section('panou', {
    mount,
    show() {
      firstPaint = true; // entering the tab animates; silent refreshes don't
      loadAct();
      if (!K.frontDesk()) leadsData = { leads: [] }; // cosmeticians don't work the pipeline
      if (!leadsData) {
        // Give the leads a moment so the first paint (and its animations) is the complete one.
        panel.querySelector('.db-root').innerHTML = skeleton();
        Promise.race([Promise.all([K.leads().then((j) => { leadsData = j; }).catch(() => { leadsData = { leads: [] }; }), K.prefs.load()]), sleep(900)]).then(render);
      } else K.prefs.load().then(render);
      clearInterval(timer);
      timer = setInterval(() => {
        if (!K.isActive('panou')) { clearInterval(timer); return; }
        if (!document.hidden && !K.drawerOpen && !K.frontDesk()) { K.emit('reload'); return; }
        if (!document.hidden && !K.drawerOpen) { K.leads(true).catch(() => {}).then(() => K.emit('reload')); }
      }, 60000);
    },
    data() { if (panel && K.isActive('panou')) render(); },
  });
  K.on('leads', (j) => { leadsData = j; });
})();
