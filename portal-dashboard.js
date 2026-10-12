// Centrul360 portal — Panou (live dashboard). Everything here is derived from /api/portal-data
// (K.data) plus the pipeline leads (K.leads()); it refreshes itself every minute while visible and
// the clock / "now" line / relative times tick every second.
(function () {
  'use strict';
  const K = window.K;
  const { esc, icon } = K;
  let panel = null, timer = 0, leadsData = null, firstPaint = true, tasksOpen = 0;
  K.on('tasks', (list) => { tasksOpen = list.length; });

  const STATUS = {
    programata: { label: 'Programată', tone: 'accent' }, confirmata: { label: 'Confirmată', tone: 'good' },
    finalizata: { label: 'Finalizată', tone: '' }, reprogramata: { label: 'Reprogramată', tone: 'warn' }, anulata: { label: 'Anulată', tone: 'bad' },
  };

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
    if (!prev && !cur) return '<span class="k-delta is-flat">—</span>';
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

  function onClick(e) {
    const a = e.target.closest('[data-go]');
    if (a) { e.preventDefault(); K.go(a.dataset.go); if (a.dataset.then) setTimeout(() => K.emit(a.dataset.then, a.dataset.arg || null), 250); return; }
    const appt = e.target.closest('[data-appt]');
    if (appt) { K.go('programari'); setTimeout(() => K.emit('calendar:open', { id: appt.dataset.appt, date: K.today() }), 250); return; }
    const lead = e.target.closest('[data-lead]');
    if (lead) { K.go('pipeline'); setTimeout(() => window.C360Pipeline && window.C360Pipeline.openLead(lead.dataset.lead), 400); return; }
    const task = e.target.closest('[data-task]');
    if (task) toggleTask(+task.dataset.task);
  }

  // ------------------------------------------------------------------ checklist (per user, per day)
  const taskKey = () => 'c360_tasks_' + ((K.data && K.data.me.id) || '') + '_' + K.today();
  function taskState() { try { return JSON.parse(localStorage.getItem(taskKey()) || '{}'); } catch (e) { return {}; } }
  function toggleTask(i) {
    const s = taskState();
    s[i] = !s[i];
    try { localStorage.setItem(taskKey(), JSON.stringify(s)); } catch (e) { /* private mode */ }
    const done = (K.data.tasks || []).every((_, j) => s[j]);
    renderTasks();
    if (done && s[i]) K.ui().toast('Toate sarcinile zilei sunt bifate. Bravo!', 'success');
  }
  function renderTasks() {
    const el = panel.querySelector('[data-tasks]');
    if (!el) return;
    const tasks = K.data.tasks || [], s = taskState();
    const done = tasks.filter((_, i) => s[i]).length;
    const pct = tasks.length ? Math.round((done / tasks.length) * 100) : 0;
    el.innerHTML =
      '<div class="k-card-head"><h3>' + icon('listCheck') + 'Rutina zilei</h3>' +
      K.ring(pct, { size: 46, stroke: 5, inner: '<b class="db-mini-pct">' + done + '/' + tasks.length + '</b>' }) + '</div>' +
      '<div class="db-tasks">' + tasks.map((t, i) =>
        '<button type="button" class="db-task' + (s[i] ? ' is-done' : '') + '" data-task="' + i + '"><i>' + icon('check') + '</i><span>' + esc(t) + '</span></button>').join('') + '</div>';
  }

  // ------------------------------------------------------------------ render
  function render() {
    if (!panel || !K.data) return;
    const D = K.data;
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
    const rate = (s) => (s.category === 'retail' ? D.retailRate : (D.commissionRates || {})[s.category] || 0) / 100;
    const commMonth = ms.filter((s) => s.status === 'approved' && K.monthOf(s.date) === month).reduce((a, s) => a + Number(s.commission || 0), 0);
    const commPrev = ms.filter((s) => s.status === 'approved' && K.monthOf(s.date) === prevMonth && s.date <= prevSameDay).reduce((a, s) => a + Number(s.commission || 0), 0);
    const pendingMine = ms.filter((s) => s.status === 'pending');
    const pendingEst = pendingMine.reduce((a, s) => a + Number(s.amount || 0) * rate(s), 0);
    const attributed = inc.filter((s) => s.performedBy === me.id && K.monthOf(s.date) === month).reduce((a, s) => a + Number(s.amount || 0), 0);

    const summary = [];
    if (role === 'cosmetician') {
      summary.push('<a href="#programari" data-go="programari">' + K.plural(mineToday.filter((a) => a.status !== 'anulata').length, 'clientă', 'cliente') + '</a> azi');
      if (pendingMine.length) summary.push('<a href="#comision" data-go="comision">' + K.plural(pendingMine.length, 'vânzare', 'vânzări') + ' în așteptarea aprobării</a>');
    } else {
      summary.push('<a href="#programari" data-go="programari">' + K.plural(live.length, 'programare', 'programări') + '</a> azi');
      if (role === 'receptie' && unconfirmed.length) summary.push('<a href="#programari" data-go="programari">' + K.plural(unconfirmed.length, 'programare de confirmat', 'programări de confirmat') + '</a>');
      if (callNow.length) summary.push('<a href="#pipeline" data-go="pipeline" data-then="pipeline:queue">' + K.plural(callNow.length, 'lead de sunat', 'leaduri de sunat') + '</a>');
      if (role === 'receptie' && tasksOpen) summary.push('<a href="#automatizari" data-go="automatizari">' + K.plural(tasksOpen, 'sarcină', 'sarcini') + '</a>');
      if (pending) summary.push('<a href="#aprobari" data-go="aprobari">' + K.plural(pending, 'vânzare de aprobat', 'vânzări de aprobat') + '</a>');
    }
    const actions = role === 'cosmetician'
      ? '<button type="button" class="k-btn is-accent" data-go="comision" data-then="comision:new">' + icon('percent') + 'Loghează o vânzare</button>' +
        '<button type="button" class="k-btn db-glass" data-go="programari">' + icon('calendar') + 'Calendarul meu</button>' +
        '<button type="button" class="k-btn db-glass" data-go="resurse">' + icon('book') + 'SOP & protocoale</button>'
      : '<button type="button" class="k-btn is-accent" data-go="incasari" data-then="incasari:new">' + icon('wallet') + 'Încasare</button>' +
        '<button type="button" class="k-btn db-glass" data-go="programari" data-then="calendar:new">' + icon('calendar') + 'Programare</button>' +
        '<button type="button" class="k-btn db-glass" data-go="pipeline" data-then="pipeline:new">' + icon('userPlus') + 'Lead</button>' +
        (callNow.length ? '<button type="button" class="k-btn db-glass" data-go="pipeline" data-then="pipeline:queue">' + icon('zap') + 'Coada de apeluri · ' + callNow.length + '</button>' : '');

    // Chart: clinic revenue for admin/reception; the cosmetician's own approved commission otherwise.
    const chartSrc = role === 'cosmetician' ? ms.filter((s) => s.status === 'approved').map((s) => ({ date: s.date, amount: s.commission })) : inc;
    const series30 = dailySeries(chartSrc, 30);
    const prev30 = (() => { const out = []; for (let i = 59; i >= 30; i--) { const d = K.addDays(today, -i); out.push(sumBy(chartSrc, d, d)); } return out; })();
    const stat = (cls, go, then, ic, label, value, fmt, key, sub, extra) =>
      '<button type="button" class="k-stat ' + cls + '" data-go="' + go + '"' + (then ? ' data-then="' + then + '"' : '') + '><div class="k-stat-top"><span class="k-stat-ic">' + icon(ic) + '</span>' + label + '</div>' +
      '<div class="k-stat-value" data-count="' + value + '"' + (fmt ? ' data-fmt="' + fmt + '"' : '') + ' data-key="' + key + '">0</div><div class="k-stat-sub">' + sub + '</div>' + (extra || '') + '</button>';
    let kpis;
    if (role === 'cosmetician') {
      kpis = stat('is-info', 'programari', '', 'calendar', 'Clientele mele azi', mineToday.filter((a) => a.status !== 'anulata').length, '', 'db-mine',
          mineToday.filter((a) => a.status === 'confirmata').length + ' confirmate · ' + mineToday.filter((a) => a.status === 'finalizata').length + ' finalizate') +
        stat('is-good', 'comision', '', 'percent', 'Comision luna aceasta', commMonth, 'lei', 'db-comm', delta(commMonth, commPrev) + 'aprobat', K.spark(dailySeries(chartSrc, 14).map((x) => x.v), { color: 'var(--good)' })) +
        stat('is-warn', 'comision', '', 'clock', 'În așteptare', Math.round(pendingEst), 'lei', 'db-pend', K.plural(pendingMine.length, 'vânzare', 'vânzări') + ' · estimat') +
        stat('is-accent', 'incasari', '', 'wallet', 'Încasări atribuite', attributed, 'lei', 'db-attr', 'tratamente efectuate de tine luna asta');
    } else {
      kpis = stat('is-accent', 'incasari', '', 'wallet', 'Încasat azi', todaySum, 'lei', 'db-today', delta(todaySum, yesterday) + K.plural(todayCount, 'încasare', 'încasări'), K.spark(spark14)) +
        (role === 'receptie'
          ? stat(unconfirmed.length ? 'is-warn' : 'is-good', 'programari', '', 'checkCircle', 'De confirmat', unconfirmed.length, '', 'db-unconf', confirmed + ' confirmate din ' + live.length + ' azi')
          : stat('is-good', 'incasari', '', 'trend', 'Luna aceasta', mtd, 'lei', 'db-mtd', delta(mtd, prevMtd) + 'vs ' + K.MON_S[Number(prevMonth.slice(5)) - 1] + '.')) +
        stat('is-info', 'programari', '', 'calendar', 'Programări azi', live.length, '', 'db-appts', confirmed + ' confirmate · ' + appts.filter((a) => a.status === 'finalizata').length + ' finalizate') +
        (role === 'admin' && pending
          ? stat('is-warn', 'aprobari', '', 'shield', 'De aprobat', pending, '', 'db-pending', 'vânzări în așteptare')
          : stat(callNow.length ? 'is-bad db-hot' : 'is-good', 'pipeline', 'pipeline:queue', 'zap', 'De sunat acum', callNow.length, '', 'db-call', leadsData ? working.length + ' leaduri active în pipeline' : 'se încarcă…'));
    }

    const cg = D.companyGoal || { target: 0, current: 0, reward: 0 };
    const cgPct = cg.target > 0 ? Math.min(100, (cg.current / cg.target) * 100) : 0;
    const daysLeft = K.daysIn(month) - dayOfMonth + 1;
    const perDay = cg.target > cg.current ? Math.ceil((cg.target - cg.current) / Math.max(1, daysLeft)) : 0;

    const rb = D.raceBonus || { leaderboard: [], target: 0 };
    const lbMax = Math.max(rb.target || 1, ...rb.leaderboard.map((r) => r.count));
    const cats = (window.C360_CTX && window.C360_CTX.categories) || {};

    const root = panel.querySelector('.db-root');
    root.innerHTML =
      // ---------------- hero
      '<section class="db-hero">' +
        '<div class="db-aurora" aria-hidden="true"><i></i><i></i><i></i><i></i><i></i><i></i><i></i></div>' +
        '<div class="db-hero-main">' +
          '<div class="db-date">' + icon(dayIcon()) + '<span>' + esc(K.dateLong(today)) + '</span><span class="k-live">live</span></div>' +
          '<h2>' + greeting() + ', ' + esc(first) + '</h2>' +
          '<p class="db-summary">Ai ' + summary.join(', ').replace(/, ([^,]*)$/, ' și $1') + '.</p>' +
          '<div class="db-actions">' + actions + '</div>' +
        '</div>' +
        '<div class="db-clock" aria-label="Ora"><div class="db-time" data-time></div>' +'<div class="db-secs"><svg viewBox="0 0 48 48" aria-hidden="true"><circle cx="24" cy="24" r="20" class="db-secs-track"/><circle cx="24" cy="24" r="20" class="db-secs-arc" pathLength="60" data-arc/></svg><b data-sec>--</b></div></div>' +
      '</section>' +

      // ---------------- KPIs (role-shaped, see above)
      '<div class="k-grid c4 db-kpis">' + kpis + '</div>' +

      // ---------------- revenue chart + goal
      '<div class="db-row db-row-a">' +
        '<section class="k-card db-chart-card"><div class="k-card-head"><h3>' + icon('trend') + (role === 'cosmetician' ? 'Comisionul meu' : 'Încasări') + ' · ultimele 30 de zile</h3>' +
          '<div class="k-legend"><span><i style="background:var(--accent)"></i>Ultimele 30 zile · ' + K.lei(series30.reduce((a, x) => a + x.v, 0)) + '</span><span><i style="background:var(--muted-2)"></i>Cele 30 dinainte</span></div></div>' +
          '<div data-chart></div></section>' +
        '<section class="k-card db-goal"><div class="k-card-head"><h3>' + icon('target') + 'Obiectivul lunii</h3><span class="k-sub">' + K.plural(daysLeft, 'zi rămasă', 'zile rămase') + '</span></div>' +
          '<div class="db-goal-body">' + K.ring(cgPct, { size: 168, stroke: 14, color: 'var(--accent)', color2: 'var(--accent-2)',
            inner: '<b class="db-goal-pct" data-count="' + Math.round(cgPct) + '" data-fmt="pct" data-key="db-cg">0%</b><span>din ' + K.lei(cg.target) + '</span>' }) +
          '<div class="db-goal-meta"><div><span>Realizat</span><b data-count="' + cg.current + '" data-fmt="lei" data-key="db-cgc">0 lei</b></div>' +
          (perDay ? '<div><span>Ritm necesar</span><b>' + K.lei(perDay) + '<small>/zi</small></b></div>' : '<div><span>Status</span><b class="db-good">Atins</b></div>') +
          '<div><span>Bonus / angajat</span><b>' + K.lei(cg.reward) + '</b></div></div></div></section>' +
      '</div>' +

      // ---------------- today + leaderboard + tasks
      '<div class="db-row db-row-b">' +
        '<section class="k-card db-today"><div class="k-card-head"><h3>' + icon('clock') + (role === 'cosmetician' ? 'Clientele mele azi' : 'Ziua de azi') + '</h3><a class="k-btn is-sm is-outline" href="#programari" data-go="programari">Calendar' + icon('arrow') + '</a></div>' +
          '<div class="db-timeline" data-timeline>' + timelineHtml(role === 'cosmetician' ? mineToday : appts) + '</div></section>' +
        '<div class="k-stack">' +
          '<section class="k-card db-race"><div class="k-card-head"><h3>' + icon('trophy') + 'Bonus de viteză</h3><span class="k-sub">' + esc(cats[rb.category] || rb.category || '') + ' · țintă ' + rb.target + ' · ' + K.lei(rb.reward) + '</span></div>' +
            (rb.leaderboard.length ? '<ol class="db-lb">' + rb.leaderboard.slice(0, 6).map((r, i) =>
              '<li class="' + (i === 0 && r.count ? 'is-lead' : '') + (r.employeeId === me.id ? ' is-me' : '') + '"><span class="db-rank">' + (i === 0 && r.count ? icon('crown') : i + 1) + '</span>' + K.avatar(r.name, 30) +
              '<div class="db-lb-main"><div class="db-lb-name">' + esc(r.name) + (r.employeeId === me.id ? ' <em>tu</em>' : '') + '</div><div class="k-bar"><i style="--w:' + Math.min(100, (r.count / lbMax) * 100) + '%"></i></div></div>' +
              '<b class="db-lb-count">' + r.count + '<small>/' + rb.target + '</small></b></li>').join('') + '</ol>'
              : K.empty('trophy', 'Nicio vânzare încă', 'Clasamentul pornește la prima vânzare aprobată.')) + '</section>' +
          '<section class="k-card" data-tasks></section>' +
        '</div>' +
      '</div>' +

      // ---------------- goals / team
      ((D.myGoals || []).length ? '<section class="k-card db-goals"><div class="k-card-head"><h3>' + icon('target') + 'Obiectivele mele</h3></div><div class="db-goal-list">' +
        D.myGoals.map((g) => {
          const pct = g.target > 0 ? Math.min(100, (g.current / g.target) * 100) : 0;
          const ron = g.metric === 'comision_aprobat_luna' || g.metric === 'incasari_atribuite_luna';
          return '<div class="db-goal-item">' + K.ring(pct, { size: 64, stroke: 7, inner: '<b class="db-mini-pct">' + Math.round(pct) + '%</b>' }) +
            '<div><b>' + esc(g.title) + '</b><span>' + (ron ? K.lei(g.current) + ' din ' + K.lei(g.target) : g.current + ' din ' + g.target) + '</span></div></div>';
        }).join('') + '</div></section>' : '') +
      (D.isAdmin ? '<section class="k-card db-team"><div class="k-card-head"><h3>' + icon('users') + 'Ce face echipa în pipeline</h3><a class="k-btn is-sm is-outline" href="#pipeline" data-go="pipeline">Pipeline' + icon('arrow') + '</a></div><div data-team>' + teamHtml(L) + '</div></section>' : '');

    renderTasks();
    K.chart(root.querySelector('[data-chart]'), {
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
    if (!list.length) return K.empty('calendar', 'Nicio programare azi', 'Când apar programări, le vezi aici în ordinea orei.', '<button type="button" class="k-btn is-sm is-primary" data-go="programari" data-then="calendar:new">' + icon('plus') + 'Adaugă programare</button>');
    return '<ol class="db-tl">' + list.map((a) => {
      const st = STATUS[a.status] || { label: a.status, tone: '' };
      return '<li class="db-tl-item is-' + a.status + '" data-appt="' + esc(a.id) + '" data-time="' + esc(a.time || '') + '">' +
        '<span class="db-tl-time">' + esc(a.time || '—') + '</span><span class="db-tl-dot"></span>' +
        '<div class="db-tl-card"><div class="db-tl-top"><b>' + esc(a.clientName || '—') + '</b><span class="k-tag is-' + st.tone + '">' + st.label + '</span></div>' +
        '<div class="db-tl-sub">' + esc(a.treatment || '') + ' · ' + esc(a.location || '') + (a.cosmeticianName ? ' · ' + esc(a.cosmeticianName) : '') + '</div></div></li>';
    }).join('') + '</ol>';
  }

  // Admin: what the team (reception) did in the pipeline — latest actions + today's counters per person.
  function teamHtml(L) {
    if (!leadsData) return '<div class="k-skel" style="height:120px"></div>';
    const acts = [];
    L.forEach((l) => (l.activities || []).forEach((a) => { if (a.author && a.type !== 'created') acts.push({ a, l }); }));
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
    const people = Object.keys(per).sort((a, b) => per[b].total - per[a].total);
    const verb = (a) => a.type === 'contact' ? (a.channel === 'whatsapp' ? 'a scris pe WhatsApp' : 'a sunat') : a.type === 'booking' ? 'a programat' : a.type === 'stage' ? 'a mutat' : a.type === 'note' ? 'a notat la' : a.type === 'followup' ? 'a setat follow-up la' : 'a actualizat';
    const OUT = { raspuns: 'a răspuns', interesat: 'interesată', programat: 'vrea programare', revine: 'revine', nu_raspunde: 'nu răspunde', refuz: 'nu e interesată', numar_gresit: 'număr greșit' };
    return (people.length ? '<div class="db-team-people">' + people.map((n) =>
      '<div class="db-person">' + K.avatar(n, 34) + '<div><b>' + esc(n) + '</b><span>azi: ' + per[n].contact + ' contactări · ' + per[n].booking + ' programări · ' + per[n].stage + ' mutări</span></div></div>').join('') + '</div>'
      : '<p class="k-muted" style="margin:0 0 .8rem">Nimeni n-a lucrat încă în pipeline azi.</p>') +
      (acts.length ? '<ol class="db-feed">' + acts.slice(0, 7).map(({ a, l }) =>
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
      if (!K.frontDesk()) leadsData = { leads: [] }; // cosmeticians don't work the pipeline
      if (!leadsData) {
        // Give the leads a moment so the first paint (and its animations) is the complete one.
        panel.querySelector('.db-root').innerHTML = skeleton();
        Promise.race([K.leads().then((j) => { leadsData = j; }).catch(() => { leadsData = { leads: [] }; }), sleep(900)]).then(render);
      } else render();
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
