// Centrul360 portal, "Condică" (attendance log) + "Cererile mele" (leave requests).
// Everyone: today's clock-in/out, their hours (to make up, overtime, waiting for approval), their
// own recent attendance with each day's difference from 8 hours, and leave requests: a leave
// "cu recuperare" (with a plan of when she makes the hours up) or hours off from her overtime.
// Admin additionally (inside Echipa → Condică): the team overview, one person's detail with
// "Plătite cu salariul" for her overtime, corrections of mistaken entries. The day differences and
// the requests are decided in Aprobări (portal-admin.js). Rules: api/_lib/timebank.js.
// De rezolvat (the owner, 16.11, for the manager and the owner): the team's pontaj to fix (no departure, a working day
// with no pontaj, a late arrival, the corrections asked for), each with a sheet that grows from its row, prefilled with
// her scheduled hours. Everyone: „Cere corectarea” for a day of hers. Every correction keeps who, when, why
// (api/_lib/attendance-fix.js).
(function () {
  'use strict';
  const K = window.K;
  const { esc, icon } = K;

  const TYPE_LABELS = { odihna: 'Concediu de odihnă', fara_plata: 'Concediu fără plată', medical: 'Concediu medical', alta: 'Alt tip de concediu', suplimentare: 'Ore libere din orele suplimentare' };
  const STATUS_LABEL = { pending: 'În așteptare', approved: 'Aprobată', rejected: 'Respinsă' };
  const ADJ_LABEL = { pending: 'la aprobare', approved: 'aprobat', rejected: 'respins' };
  const STATUS_TONE = { pending: 'warn', approved: 'good', rejected: 'bad' };
  const ERR = {
    recovery_plan_mismatch: 'Orele din plan trebuie să dea exact totalul orelor lipsă.',
    invalid_recovery: 'Scrie câte ore lipsești.',
    not_enough_overtime: 'Nu ai destule ore suplimentare pentru asta.',
    overlapping_request: 'Ai deja o cerere pentru zilele astea.', no_work_days: 'Perioada nu are zile lucrătoare (luni-vineri).',
    invalid_minutes: 'Scrie câte ore folosești.',
    nothing_to_pay: 'Nu are ore suplimentare de plătit.',
    future_date: 'Nu se poate pune o zi din viitor.', future_time: 'Ora e după ora de acum.', checkout_before_checkin: 'Plecarea trebuie să fie după sosire.',
    duplicate_day: 'Are deja pontaj în ziua asta. Corectează-l din listă.', missing_reason: 'Scrie de ce corectezi.', missing_times: 'Pune sosirea și plecarea.',
    own_request: 'Pentru pontajul tău folosește „Cere corectarea”.', too_old: 'Se pot corecta doar zilele din ultima lună.', after_left: 'Nu mai lucra aici în ziua aceea.',
    already_decided: 'A fost deja decisă.', invalid_date: 'Alege ziua.',
  };
  const errText = (e) => ERR[e && e.code] || K.errText(e);

  const C = { attendance: [], leave: [], empFilter: '', year: null, month: null, balance: null, overview: null, tb: null, fix: null, requests: [] };
  let panel;

  function isAdmin() { return !!(K.data && K.data.isAdmin); }
  // De rezolvat: the owner (in Echipa → Condică, on the team view) and the manager (her own Condică)
  const fixer = () => (isAdmin() ? !C.empFilter : !!(K.isManager && K.isManager()));
  // who left („A plecat”) stays, at the end, for her past days
  function employees() { return isAdmin() ? (K.data.admin.employees || []).filter((e) => e.id !== 'admin' && e.role !== 'admin').sort((a, b) => (a.active === false ? 1 : 0) - (b.active === false ? 1 : 0)) : []; }
  function empName(id) {
    if (id === 'admin') return 'Admin';
    const e = employees().find((x) => x.id === id);
    return e ? e.name : id;
  }
  // "1h 05" / "45 min", with the sign when asked
  const fmt = (m, sign) => { const a = Math.abs(Math.round(m || 0)); const h = Math.floor(a / 60), r = a % 60; return (sign ? (m > 0 ? '+' : m < 0 ? '-' : '') : '') + (h ? h + 'h' + (r ? ' ' + K.pad(r) : '') : r + ' min'); };
  const hoursText = (m) => (m ? fmt(m) : '0');

  // embedded: shown inside Echipa → Condică (admin), without its own title.
  function mount(p, embedded) {
    panel = p;
    panel.classList.add('k-panel', 'cd');
    const thisMonth = K.thisMonth().split('-');
    C.year = Number(thisMonth[0]); C.month = Number(thisMonth[1]);
    panel.innerHTML =
      (embedded ? '' : '<div class="k-head"><div><div class="k-eyebrow">Echipă</div><h2>Condică</h2></div></div>') +
      '<div data-body><div class="k-skel" style="height:180px"></div></div>';
    panel.addEventListener('click', onClick);
    panel.addEventListener('change', onChange);
  }

  async function load() {
    try {
      // Admin with no employee picked: the team overview. Picking someone switches to her detail.
      const wantOverview = isAdmin() && !C.empFilter;
      const who = isAdmin() ? C.empFilter : K.data.me.id;
      const [att, lv, bal, ov, tb, fx] = await Promise.all([
        K.api('/api/portal-attendance', { action: 'list', employeeId: isAdmin() ? (C.empFilter || undefined) : undefined, year: isAdmin() ? C.year : undefined, month: isAdmin() ? C.month : undefined }),
        K.api('/api/portal-leave', { action: 'list' }),
        !wantOverview ? K.api('/api/portal-attendance', { action: 'balance', employeeId: who }) : Promise.resolve(null),
        wantOverview ? K.api('/api/portal-attendance', { action: 'balance_all' }) : Promise.resolve(null),
        !wantOverview ? K.api('/api/portal-attendance', { action: 'timebank', employeeId: isAdmin() ? who : undefined }) : Promise.resolve(null),
        fixer() ? K.api('/api/portal-attendance', { action: 'fix_list' }).catch(() => null) : Promise.resolve(null),
      ]);
      C.fix = fx ? fx.rows || [] : null;
      C.requests = att.requests || [];
      C.attendance = att.entries || [];
      C.leave = lv.requests || [];
      C.balance = bal;
      C.overview = ov ? ov.employees || [] : null;
      C.tb = tb;
      render();
    } catch (e) {
      panel.querySelector('[data-body]').innerHTML = K.empty('alert', 'Nu am putut încărca condica', 'Verifică conexiunea și reîncearcă.', '<button type="button" class="k-btn is-primary" data-act="refresh">Reîncearcă</button>');
    }
  }

  // ------------------------------------------------------------------ her hours
  function hoursHtml() {
    const b = C.balance, t = C.tb;
    if (!b || !t) return '';
    const who = isAdmin() && C.empFilter ? ' · ' + empName(C.empFilter) : '';
    const plans = t.debt > 0 ? (t.plans || []).filter((p) => p.status === 'approved') : []; // all made up = nothing to show
    const waitingPlans = (t.plans || []).filter((p) => p.status === 'pending');
    return '<section class="k-card cd-hours"><div class="k-card-head"><h3>' + icon('clock') + 'Orele ' + (isAdmin() ? 'ei' : 'mele') + esc(who) + '</h3>' +
        (!isAdmin() && t.bank > 0 ? '<button type="button" class="k-btn is-sm is-outline" data-use-overtime>' + icon('sun') + 'Folosește ore libere</button>' : '') + '</div>' +
      '<div class="k-grid c4 cd-hstats">' +
        '<div class="k-stat' + (t.debt ? ' is-warn' : '') + '"><div class="k-stat-top">' + icon('refresh') + 'De recuperat' +
          (isAdmin() && C.empFilter ? '<button type="button" class="k-btn is-ghost is-sm cd-setdebt" data-set-debt="' + esc(C.empFilter) + '">' + icon('pen') + 'Modifică</button>' : '') + '</div>' +
          '<div class="k-stat-value">' + hoursText(t.debt) + '</div><div class="k-stat-sub">' + (t.debt ? 'Orele în plus de la program se scad de aici.' : 'Nimic de recuperat.') + '</div></div>' +
        '<div class="k-stat' + (t.bank ? ' is-good' : '') + '"><div class="k-stat-top">' + icon('trend') + 'Ore suplimentare</div><div class="k-stat-value">' + hoursText(t.bank) + '</div><div class="k-stat-sub">' + (t.bank ? K.lei(t.bankLei) + ', se plătesc cu salariul (' + t.rate + ' lei/oră)' : t.rate + ' lei/oră, cu salariul') + '</div></div>' +
        '<div class="k-stat' + (t.pendingCount ? ' is-info' : '') + '"><div class="k-stat-top">' + icon('clock') + 'La aprobare</div><div class="k-stat-value">' + (t.pendingCount ? fmt(t.pendingMinutes, true) : '0') + '</div><div class="k-stat-sub">' + (t.pendingCount ? K.plural(t.pendingCount, 'zi', 'zile') + ' peste / sub program' : 'nimic în așteptare') + '</div></div>' +
        '<div class="k-stat"><div class="k-stat-top">' + icon('calendar') + 'Zile de concediu</div><div class="k-stat-value">' + b.daysLeft + '</div><div class="k-stat-sub">din ' + b.annualLeaveDays + ', ' + b.daysUsed + ' folosite anul acesta</div></div>' +
      '</div>' +
      (plans.length || waitingPlans.length ? '<div class="cd-plans">' + plans.concat(waitingPlans).map((p) =>
        '<div class="cd-plan"><span class="k-tag is-' + STATUS_TONE[p.status] + '">' + (p.status === 'approved' ? 'Plan de recuperare' : 'Plan la aprobare') + '</span>' +
        '<b>' + fmt(p.minutes) + '</b><span class="k-muted">pentru ' + esc(K.dateShort(p.startDate)) + (p.endDate !== p.startDate ? ' - ' + esc(K.dateShort(p.endDate)) : '') + '</span>' +
        '<div class="cd-plan-days">' + p.plan.map((x) => '<span class="' + (x.date < K.today() ? 'is-past' : '') + '">' + esc(K.dateShort(x.date)) + ' · ' + fmt(x.minutes) + '</span>').join('') + '</div></div>').join('') + '</div>' : '') +
      '<p class="cd-rule">' + icon('info') + 'Ziua se compară cu programul din Program echipă, cu pauza inclusă (fără program: 8 ore, luni-vineri). De la ' + t.tolerance + ' minute în plus sau în minus, ziua merge la aprobare. Într-o zi liberă, tot timpul e oră suplimentară.</p>' +
      (isAdmin() && C.empFilter && t.bank > 0 ? '<div class="cd-payout"><span>' + icon('wallet') + 'De plătit cu salariul: <b>' + fmt(t.bank) + ' = ' + K.lei(t.bankLei) + '</b></span><button type="button" class="k-btn is-good" data-payout="' + esc(C.empFilter) + '">' + icon('check') + 'Plătite cu salariul</button></div>' : '') +
      '</section>';
  }

  // "2", "2,5", "2h 30", "2:30", "90 min" → minutes (null when it isn't a duration)
  function parseHours(txt) {
    const v = String(txt || '').trim().toLowerCase().replace(',', '.');
    if (!v) return null;
    let m;
    if ((m = /^(\d+):(\d{1,2})$/.exec(v))) return Number(m[1]) * 60 + Number(m[2]);
    if ((m = /^(\d+(?:\.\d+)?)\s*(?:h|ore|ora|oră)?\s*(?:(\d{1,2})\s*(?:m|min)?)?$/.exec(v)) && !/^\d+\s*min$/.test(v)) return Math.round(Number(m[1]) * 60) + Number(m[2] || 0);
    if ((m = /^(\d+)\s*min$/.exec(v))) return Number(m[1]);
    return null;
  }
  // the owner sets her hours to make up by hand; what's decided after counts from this number
  async function setDebt(empId) {
    const cur = C.tb && C.tb.debt || 0;
    const h = Math.floor(cur / 60), r = cur % 60;
    const txt = await K.ui().prompt({ title: 'Ore de recuperat, ' + empName(empId), message: 'Câte ore are de recuperat de acum încolo. Orele în plus aprobate de acum se scad din numărul acesta. Ea primește o notificare.',
      label: 'Ore (ex. 3, 2,5 sau 2h 30)', value: cur ? (h + (r ? 'h ' + r : '')) : '0', confirmText: 'Salvează' });
    if (txt == null) return;
    const min = parseHours(txt);
    if (min == null || min > 1000 * 60) { K.ui().toast('Scrie orele, de ex. 3, 2,5 sau 2h 30.', 'error'); return; }
    try {
      await K.api('/api/portal-attendance', { action: 'set_debt', employeeId: empId, minutes: min });
      K.ui().toast(empName(empId) + ': de recuperat ' + (min ? hoursText(min) : '0') + '.', 'success');
      load();
    } catch (err) { K.ui().toast(K.errText(err), 'error'); }
  }

  function minutes(hhmm) { const m = /^(\d{2}):(\d{2})$/.exec(hhmm || ''); return m ? Number(m[1]) * 60 + Number(m[2]) : null; }
  function workedMin(a, b) { const x = minutes(a), y = minutes(b); return x != null && y != null && y > x ? y - x : null; }
  const adjOf = (entryId) => ((C.tb && C.tb.adjustments) || []).find((a) => a.attendanceId === entryId);
  const isWeekend = (date) => { const d = K.parse(date).getDay(); return d === 0 || d === 6; };

  function todayCard() {
    const today = K.today();
    const mine = C.attendance.find((e) => e.employeeId === K.data.me.id && e.date === today);
    const w = mine ? workedMin(mine.checkIn, mine.checkOut) : null;
    const adj = mine ? adjOf(mine.id) : null;
    const weekend = isWeekend(today);
    let line = '';
    if (w != null) {
      line = adj ? '<div class="cd-today-note is-' + (adj.minutes > 0 ? 'up' : 'down') + '">' + icon(adj.minutes > 0 ? 'trend' : 'clock') +
          (adj.weekend ? 'Azi e zi de weekend: ' + fmt(adj.minutes) + ' suplimentare' : fmt(adj.minutes, true) + (adj.minutes > 0 ? ' peste program' : ' sub program')) + ', ' + (ADJ_LABEL[adj.status] || '') + '.</div>'
        : '<div class="cd-today-note is-ok">' + icon('checkCircle') + 'Zi completă. Mulțumim!</div>';
    } else if (weekend) line = '<div class="cd-today-note">' + icon('info') + 'Azi e weekend: tot timpul lucrat e oră suplimentară.</div>';
    // no arrival yet in the afternoon: she probably forgot; she clocks in now and asks for the real hour
    else if (!(mine && mine.checkIn) && new Date().getHours() >= 13) line = '<div class="cd-today-note">' + icon('clock') + 'Ai uitat să pontezi dimineața? Pontează sosirea acum, apoi cere corectarea cu ora reală.</div>';
    return '<section class="k-card cd-today"><div class="k-card-head"><h3>' + icon('clock') + 'Azi, ' + esc(K.dateLong(today)) + '</h3></div>' +
      '<div class="cd-today-row">' +
        '<div class="cd-today-stat"><span>Sosire</span><b>' + (mine && mine.checkIn ? esc(mine.checkIn) : '-') + '</b></div>' +
        '<div class="cd-today-stat"><span>Plecare</span><b>' + (mine && mine.checkOut ? esc(mine.checkOut) : '-') + '</b></div>' +
        (w != null ? '<div class="cd-today-stat"><span>Lucrat</span><b>' + fmt(w) + '</b></div>' : '') +
        '<div class="cd-today-actions">' +
          '<button type="button" class="k-btn is-good" data-clock="clock_in"' + (mine && mine.checkIn ? ' disabled' : '') + '>' + icon('checkCircle') + 'Pontează sosirea</button>' +
          '<button type="button" class="k-btn is-outline" data-clock="clock_out"' + (!mine || !mine.checkIn || mine.checkOut ? ' disabled' : '') + '>' + icon('clock') + 'Pontează plecarea</button>' +
          (mine && mine.checkIn ? '<button type="button" class="k-btn is-ghost" data-fix-ask="' + esc(today) + '">' + icon('pen') + 'Cere corectarea</button>' : '') +
        '</div></div>' + line + '</section>';
  }

  // the last correction of a day, in one short line: „Corectat de Ioana · a uitat plecarea”
  function histLine(e) {
    const h = e && Array.isArray(e.history) && e.history.length ? e.history[e.history.length - 1] : null;
    if (!h) return '';
    const what = h.kind === 'create' ? 'Adăugat de ' : 'Corectat de ';
    return '<div class="k-row-sub cd-hist">' + icon('pen') + '<span>' + what + esc(h.byName || 'admin') + ' · ' + esc(K.dateShort(String(h.at).slice(0, 10))) + (h.reason ? ' · ' + esc(h.reason) : '') + '</span></div>';
  }
  K.attHistLine = histLine;
  // her own request for a day: the last one
  const reqOf = (date) => (C.requests || []).filter((r) => r.date === date).sort((a, b) => (a.at < b.at ? 1 : -1))[0] || null;
  function attendanceRow(e, editable) {
    const w = workedMin(e.checkIn, e.checkOut);
    const adj = adjOf(e.id);
    const tag = adj ? '<span class="k-tag is-' + (adj.status === 'rejected' ? 'bad' : adj.status === 'pending' ? 'warn' : adj.minutes > 0 ? 'good' : 'info') + '">' +
      fmt(adj.status === 'approved' ? adj.approvedMinutes : adj.minutes, true) + ' · ' + ADJ_LABEL[adj.status] + '</span>' : '';
    // her own days: tap one to ask for its correction (a pending one says so, a refused one says why)
    const own = !isAdmin() && e.employeeId === K.data.me.id;
    const rq = own ? reqOf(e.date) : null;
    const rqTag = rq && rq.status === 'pending' ? '<span class="k-tag is-info">corectare trimisă</span>' : rq && rq.status === 'rejected' ? '<span class="k-tag is-bad">corectare respinsă</span>' : '';
    const tap = editable ? ' data-edit-att="' + esc(e.id) + '"' : own ? ' data-fix-ask="' + esc(e.date) + '"' : '';
    return '<div class="k-row cd-arow' + (tap ? ' is-click' : '') + '"' + tap + '><div class="k-row-main"><div class="k-row-title">' + esc(K.relDay(e.date)) + (isWeekend(e.date) ? ' · weekend' : '') + (isAdmin() && !C.empFilter ? ' · ' + esc(empName(e.employeeId)) : '') + '</div>' +
      '<div class="k-row-sub">Sosire ' + (e.checkIn ? esc(e.checkIn) : '-') + ' · Plecare ' + (e.checkOut ? esc(e.checkOut) : '-') + (w != null ? ' · ' + fmt(w) : '') + (e.note ? ' · „' + esc(e.note) + '”' : '') + '</div>' +
      histLine(e) + (rq && rq.status === 'rejected' && rq.decisionNote ? '<div class="k-row-sub cd-hist is-bad">' + icon('x') + '<span>' + esc(rq.decisionNote) + '</span></div>' : '') + '</div>' +
      '<div class="k-row-end">' + rqTag + tag + (editable ? '<button type="button" class="k-icon-btn" aria-label="Corectează">' + icon('pen') + '</button>' : own ? '<span class="k-icon-btn cd-ask-ic" aria-hidden="true">' + icon('pen') + '</span>' : '') + '</div></div>';
  }

  function filterToolbar() {
    return '<div class="cd-filters k-toolbar">' +
      '<select data-f="emp"><option value="">Toată echipa</option>' + employees().map((e) => '<option value="' + esc(e.id) + '"' + (C.empFilter === e.id ? ' selected' : '') + '>' + esc(e.name + (e.active === false ? ' (a plecat)' : '')) + '</option>').join('') + '</select>' +
      '<select data-f="month">' + Array.from({ length: 12 }, (_, i) => i + 1).map((m) => '<option value="' + m + '"' + (C.month === m ? ' selected' : '') + '>' + K.monthLabel(C.year + '-' + String(m).padStart(2, '0')).split(' ')[0] + '</option>').join('') + '</select>' +
      '<select data-f="year">' + [C.year - 1, C.year, C.year + 1].map((y) => '<option value="' + y + '"' + (C.year === y ? ' selected' : '') + '>' + y + '</option>').join('') + '</select>' +
      '</div>';
  }

  function overviewTable() {
    const rows = C.overview || [];
    const card = (r) => {
      const today = r.todayCheckIn || r.todayCheckOut
        ? (r.todayCheckIn ? 'Sosire ' + r.todayCheckIn : 'Fără sosire') + (r.todayCheckOut ? ' · Plecare ' + r.todayCheckOut : '')
        : 'Nicio intrare azi';
      const kv = [['De recuperat', hoursText(r.debt)], ['Suplimentare', r.bank ? fmt(r.bank) : '0'], ['Concediu', r.daysLeft + ' z'], ['Azi', r.todayCheckIn ? (r.todayCheckOut ? 'Plecat' : 'Prezent') : 'Absent']];
      return '<button type="button" class="ad-emp" data-pick-emp="' + esc(r.employeeId) + '"><div class="ad-emp-top">' + K.avatar(r.name, 46) +
        '<div><b>' + esc(r.name) + '</b><span>' + K.roleTag(r.role) + esc(r.location || '') + (r.pending ? '<span class="k-tag is-warn">' + r.pending + ' la aprobare</span>' : '') + '</span></div></div>' +
        '<dl class="ad-emp-kv cd-kv4" title="' + esc(today) + '">' + kv.map(([k, v]) => '<div><dt>' + k + '</dt><dd>' + v + '</dd></div>').join('') + '</dl>' +
        (r.bank ? '<span class="cd-owe">' + icon('wallet') + 'De plătit cu salariul: ' + K.lei(r.bankLei) + '</span>' : '') +
        '</button>';
    };
    return '<section class="k-card"><div class="k-card-head"><h3>' + icon('listCheck') + 'Condica echipei, toți angajații</h3></div>' +
      filterToolbar() +
      (rows.length ? '<div class="ad-emps k-stagger" style="margin-top:.8rem">' + rows.map(card).join('') + '</div>' : K.empty('users', 'Niciun angajat activ', 'Adaugă angajați din tab-ul Echipa.')) +
      '</section>';
  }

  // ------------------------------------------------------------------ De rezolvat
  const FIX_TAG = { request: ['Cerere', 'info'], no_out: ['Fără plecare', 'warn'], no_in: ['Fără sosire', 'warn'], missing: ['Nepontată', 'bad'], late: ['Sosire târzie', 'info'] };
  function fixWhat(r) {
    const sched = r.from && r.to ? 'program ' + r.from + '-' + r.to : '';
    if (r.kind === 'request') {
      const q = r.request || {};
      return 'Cere ' + [q.checkIn ? 'sosire ' + q.checkIn : '', q.checkOut ? 'plecare ' + q.checkOut : ''].filter(Boolean).join(', ') + (q.note ? ' · „' + q.note + '”' : '');
    }
    if (r.kind === 'no_out') return 'Sosire ' + r.checkIn + ', fără plecare' + (sched ? ' · ' + sched : '');
    if (r.kind === 'no_in') return 'Plecare ' + r.checkOut + ', fără sosire' + (sched ? ' · ' + sched : '');
    if (r.kind === 'missing') return 'Niciun pontaj' + (sched ? ' · ' + sched : '');
    return 'Sosire ' + r.checkIn + (r.from ? ' · programul începe la ' + r.from : '');
  }
  function fixCard() {
    const rows = C.fix || [];
    const row = (r) => {
      const [label, tone] = FIX_TAG[r.kind] || ['', ''];
      return '<button type="button" class="k-row is-click cd-fix-row" data-fix="' + esc(r.key) + '">' + K.avatar(r.name, 36) +
        '<div class="k-row-main"><div class="k-row-title">' + esc(r.name) + '</div>' +
          '<div class="k-row-sub">' + esc(K.relDay(r.date)) + (r.location ? ' · ' + esc(r.location) : '') + '</div>' +
          '<div class="k-row-sub cd-fix-what"><span class="k-tag is-' + tone + '">' + label + '</span>' + esc(fixWhat(r)) + '</div></div>' +
        '<div class="k-row-end"><span class="k-btn is-sm is-outline cd-fix-go">' + (r.kind === 'request' ? 'Vezi' : 'Corectează') + '</span><span class="cd-fix-chev">' + icon('right') + '</span></div></button>';
    };
    return '<section class="k-card cd-fix"><div class="k-card-head"><h3>' + icon('alert') + 'De rezolvat' + (rows.length ? ' <span class="k-tag is-warn">' + rows.length + '</span>' : '') + '</h3>' +
        '<button type="button" class="k-btn is-sm is-outline" data-fix-add="">' + icon('plus') + 'Adaugă o zi</button></div>' +
      (rows.length ? '<div class="k-list cd-fix-list">' + rows.map(row).join('') + '</div>'
        : '<p class="cd-fix-ok">' + icon('checkCircle') + 'Totul e în regulă. Niciun pontaj de corectat.</p>') +
      '<p class="ct-hint">' + icon('info') + 'Ultimele 14 zile: zile fără plecare, zile de lucru fără pontaj, sosiri la peste 45 de minute de la începutul programului și cererile echipei.</p></section>';
  }

  function attendanceSection() {
    if (isAdmin() && !C.empFilter) return overviewTable();
    const mineOnly = isAdmin() ? C.attendance : C.attendance.filter((e) => e.employeeId === K.data.me.id);
    const recent = mineOnly.slice(0, 31);
    const emptyState = isAdmin()
      ? K.empty('clock', 'Nicio intrare încă', esc(empName(C.empFilter)) + ' nu are pontaje în această perioadă.')
      : K.empty('clock', 'Nicio intrare încă', 'Pontajele apar aici imediat ce apeși „Pontează sosirea”.');
    return '<section class="k-card"><div class="k-card-head"><h3>' + icon('listCheck') + (isAdmin() ? 'Condica, ' + esc(empName(C.empFilter)) : 'Pontajele mele') + '</h3>' +
        (isAdmin() ? '<button type="button" class="k-btn is-sm is-outline" data-fix-add="' + esc(C.empFilter) + '">' + icon('plus') + 'Adaugă o zi</button>'
          : '<button type="button" class="k-btn is-sm is-outline" data-fix-ask="">' + icon('pen') + 'Cere corectarea</button>') + '</div>' +
      (isAdmin() ? filterToolbar() + summary() : '') +
      (recent.length ? '<div class="k-list">' + recent.map((e) => attendanceRow(e, isAdmin())).join('') + '</div>' : emptyState) +
      '</section>';
  }

  function summary() {
    const list = C.attendance;
    if (!list.length) return '';
    const present = list.filter((e) => e.checkIn || e.checkOut).length;
    const total = list.reduce((a, e) => a + (workedMin(e.checkIn, e.checkOut) || 0), 0);
    return '<div class="k-grid c3" style="margin:.8rem 0"><div class="k-stat"><div class="k-stat-top">' + icon('calendar') + 'Zile pontate</div><div class="k-stat-value">' + present + '</div></div>' +
      '<div class="k-stat"><div class="k-stat-top">' + icon('clock') + 'Ore lucrate</div><div class="k-stat-value">' + fmt(total) + '</div><div class="k-stat-sub">doar zilele cu sosire și plecare</div></div></div>';
  }

  function leaveSection() {
    if (isAdmin()) {
      const list = C.empFilter ? C.leave.filter((r) => r.employeeId === C.empFilter) : C.leave;
      return '<section class="k-card"><div class="k-card-head"><h3>' + icon('calendar') + 'Concedii' + (C.empFilter ? ' · ' + esc(empName(C.empFilter)) : ', toată echipa') + '</h3></div>' +
        '<button type="button" class="k-btn is-accent" data-admin-new-leave>' + icon('plus') + 'Notează concediu pentru un angajat</button>' +
        (list.length ? '<div class="k-list" style="margin-top:.8rem">' + list.map((r) => leaveRow(r, true)).join('') + '</div>'
          : '<p class="k-muted" style="margin-top:.8rem">Nicio cerere încă.</p>') + '</section>';
    }
    const mine = C.leave.filter((r) => r.employeeId === K.data.me.id);
    return '<section class="k-card"><div class="k-card-head"><h3>' + icon('calendar') + 'Cererile mele</h3></div>' +
      '<button type="button" class="k-btn is-accent" data-new-leave>' + icon('plus') + 'Cerere nouă</button>' +
      (mine.length ? '<div class="k-list" style="margin-top:.8rem">' + mine.map((r) => leaveRow(r, false)).join('') + '</div>'
        : '<p class="k-muted" style="margin-top:.8rem">Nicio cerere încă.</p>') + '</section>';
  }

  function leaveRow(r, showEmployee) {
    const extra = r.type === 'suplimentare' ? ' · ' + fmt(r.minutes) + ' din orele suplimentare'
      : r.recovery ? ' · cu recuperare ' + fmt(r.recovery.minutes) : '';
    return '<div class="k-row"><div class="k-row-main"><div class="k-row-title">' + (showEmployee ? esc(empName(r.employeeId)) + ' · ' : '') + esc(TYPE_LABELS[r.type] || r.type) + '</div>' +
      '<div class="k-row-sub">' + esc(K.dateShort(r.startDate)) + (r.endDate !== r.startDate ? ' - ' + esc(K.dateShort(r.endDate)) : '') + ' · ' + K.plural(r.workDays, 'zi', 'zile') + extra +
      (r.reason ? ' · „' + esc(r.reason) + '”' : '') + (r.status === 'rejected' && r.rejectionNote ? ' · motiv refuz: „' + esc(r.rejectionNote) + '”' : '') + '</div></div>' +
      '<div class="k-row-end"><span class="k-tag is-' + STATUS_TONE[r.status] + '">' + STATUS_LABEL[r.status] + '</span>' +
      (r.status === 'approved' ? '<a class="k-icon-btn" target="_blank" rel="noopener" href="/api/portal-leave-pdf?id=' + esc(r.id) + '" title="Deschide PDF-ul">' + icon('file') + '</a>' : '') +
      '</div></div>';
  }

  function render() {
    if (!panel) return;
    // The owner doesn't clock in herself: no "azi" card; she gets the team + her detail.
    panel.querySelector('[data-body]').innerHTML = (isAdmin() ? '' : todayCard()) + (fixer() && C.fix ? fixCard() : '') + hoursHtml() + attendanceSection() + leaveSection();
  }

  async function clock(action) {
    try {
      const r = await K.api('/api/portal-attendance', { action });
      const a = r.adjust;
      K.ui().toast(action === 'clock_in' ? 'Sosire pontată.' : 'Plecare pontată.' + (a ? ' ' + (a.weekend ? fmt(a.minutes) + ' suplimentare' : fmt(a.minutes, true) + (a.minutes > 0 ? ' peste program' : ' sub program')) + ', trimis la aprobare.' : ''), 'success');
      await load();
    } catch (e) { K.ui().toast(K.errText(e), 'error'); }
  }

  // ------------------------------------------------------------------ a new request
  // "Altul" can be "cu recuperare": how many hours she misses and the days she makes them up
  // (1h one day, 5h another …); "Ore libere" uses her overtime instead (nothing to make up).
  const toMinutes = (h) => Math.round((Number(String(h).replace(',', '.')) || 0) * 60);
  function weekdays(a, b) { let n = 0; for (let d = K.parse(a); d <= K.parse(b); d.setDate(d.getDate() + 1)) { const w = d.getDay(); if (w && w !== 6) n++; } return n; }
  function planRow(date, hours) {
    return '<div class="lv-plan-row"><input type="date" data-pd value="' + esc(date || '') + '" min="' + K.today() + '" aria-label="Ziua">' +
      '<label class="lv-hours"><input type="number" data-ph min="0.5" step="0.5" inputmode="decimal" value="' + esc(hours || '') + '" placeholder="0" aria-label="Ore"><span>ore</span></label>' +
      '<button type="button" class="k-icon-btn" data-plan-del aria-label="Șterge ziua">' + icon('x') + '</button></div>';
  }
  function newLeaveDrawer(preset) {
    const tb = C.tb || { bank: 0 };
    const types = [['odihna', 'Odihnă'], ['fara_plata', 'Fără plată'], ['medical', 'Medical'], ['alta', 'Altul']].concat(tb.bank > 0 ? [['suplimentare', 'Ore libere']] : []);
    const d = K.drawer({
      title: 'Cerere de concediu', icon: 'calendar', width: 540,
      
      body: '<form class="k-form" data-form>' +
        K.field('Tip concediu', '<div class="lv-types">' + K.seg('type', types, preset || 'odihna', 'is-big') + '</div>', 'full') +
        K.field('Data început', '<input name="startDate" type="date" required value="' + esc(K.today()) + '">') +
        K.field('Data sfârșit', '<input name="endDate" type="date" required value="' + esc(K.today()) + '">') +
        // Altul → cu recuperare
        '<div class="full lv-rec" data-rec hidden><label class="pay-check"><input type="checkbox" data-rec-on><span class="pay-box">' + icon('check') + '</span>' +
          '<span><b>Cu recuperare</b><small>Lipsești acum și recuperezi orele în alte zile, cum vrei tu.</small></span></label>' +
          '<div class="lv-rec-body" data-rec-body hidden>' +
            '<label class="k-field"><span>Câte ore lipsești în total</span><label class="lv-hours is-big"><input type="number" data-rec-total min="0.5" step="0.5" inputmode="decimal" value="8"><span>ore</span></label></label>' +
            '<div class="lv-plan"><div class="lv-plan-head"><span>Când le recuperezi</span><b data-plan-sum></b></div>' +
              '<div data-plan-rows>' + planRow('', '') + '</div>' +
              '<button type="button" class="k-btn is-sm is-outline" data-plan-add>' + icon('plus') + 'Adaugă o zi</button></div>' +
          '</div></div>' +
        // Ore libere din orele suplimentare
        '<div class="full lv-sup" data-sup hidden><label class="k-field"><span>Câte ore folosești</span><label class="lv-hours is-big"><input type="number" data-sup-hours min="0.5" step="0.5" inputmode="decimal" placeholder="0"><span>ore</span></label></label>' +
          '<p class="ct-hint">' + icon('info') + 'Ai ' + fmt(tb.bank) + ' suplimentare. Le folosești în loc de bani și nu mai ai nimic de recuperat.</p></div>' +
        K.field('Motiv', '<textarea name="reason" rows="3" maxlength="500" placeholder="Opțional la odihnă / fără plată / ore libere, obligatoriu la medical / altul"></textarea>', 'full') +
        '</form>',
      footer: '<span class="k-grow"></span><button type="button" class="k-btn" data-cancel>Renunță</button><button type="button" class="k-btn is-primary" data-save>' + icon('check') + 'Trimite cererea</button>',
      onMount(el) {
        const f = el.querySelector('[data-form]');
        let totalTouched = false;
        const type = () => (f.querySelector('input[name=type]') || {}).value;
        const sync = () => {
          const t = type(), on = el.querySelector('[data-rec-on]').checked;
          el.querySelector('[data-rec]').hidden = t !== 'alta';
          el.querySelector('[data-rec-body]').hidden = !(t === 'alta' && on);
          el.querySelector('[data-sup]').hidden = t !== 'suplimentare';
          if (!totalTouched) { const v = f.startDate.value, w = f.endDate.value; if (v && w && w >= v) el.querySelector('[data-rec-total]').value = Math.max(1, weekdays(v, w)) * 8; }
          planSum();
        };
        const planList = () => Array.from(el.querySelectorAll('.lv-plan-row')).map((r) => ({ date: r.querySelector('[data-pd]').value, minutes: toMinutes(r.querySelector('[data-ph]').value) }));
        const planSum = () => {
          const total = toMinutes(el.querySelector('[data-rec-total]').value), got = planList().reduce((a, x) => a + x.minutes, 0);
          const box = el.querySelector('[data-plan-sum]');
          box.className = got === total && total > 0 ? 'is-ok' : 'is-warn';
          box.textContent = got === total && total > 0 ? 'Planul acoperă toate cele ' + fmt(total) : 'Planificat ' + fmt(got) + ' din ' + fmt(total) + (got < total ? ', mai pune ' + fmt(total - got) : ', ai pus prea multe ore');
        };
        f.addEventListener('change', (e) => { if (e.target.matches('[data-rec-total]')) totalTouched = true; sync(); });
        f.addEventListener('input', (e) => { if (e.target.matches('[data-rec-total]')) totalTouched = true; planSum(); });
        f.addEventListener('click', (e) => {
          if (e.target.closest('[data-plan-add]')) { el.querySelector('[data-plan-rows]').insertAdjacentHTML('beforeend', planRow('', '')); planSum(); return; }
          const del = e.target.closest('[data-plan-del]');
          if (del) { const rows = el.querySelectorAll('.lv-plan-row'); if (rows.length > 1) del.closest('.lv-plan-row').remove(); else { del.closest('.lv-plan-row').querySelector('[data-pd]').value = ''; del.closest('.lv-plan-row').querySelector('[data-ph]').value = ''; } planSum(); }
        });
        sync();
        el.querySelector('[data-cancel]').addEventListener('click', () => d.close());
        el.querySelector('[data-save]').addEventListener('click', (ev) => K.busy(ev.currentTarget, async () => {
          const v = K.formValues(f);
          if (!v.startDate || !v.endDate) { K.ui().toast('Completează perioada.', 'error'); return; }
          if (v.endDate < v.startDate) { K.ui().toast('Data de sfârșit e înainte de data de început.', 'error'); return; }
          if ((v.type === 'medical' || v.type === 'alta') && !v.reason.trim()) { K.ui().toast('Completează motivul pentru acest tip de concediu.', 'error'); return; }
          const body = { action: 'create', type: v.type, startDate: v.startDate, endDate: v.endDate, reason: v.reason };
          if (v.type === 'alta' && el.querySelector('[data-rec-on]').checked) {
            const total = toMinutes(el.querySelector('[data-rec-total]').value), plan = planList().filter((x) => x.date || x.minutes);
            if (!(total > 0)) { K.ui().toast(ERR.invalid_recovery, 'error'); return; }
            if (plan.some((x) => !x.date || !(x.minutes > 0))) { K.ui().toast('Pune data și orele la fiecare zi de recuperare.', 'error'); return; }
            if (plan.reduce((a, x) => a + x.minutes, 0) !== total) { K.ui().toast(ERR.recovery_plan_mismatch, 'error'); return; }
            body.recovery = { minutes: total, plan };
          }
          if (v.type === 'suplimentare') {
            const m = toMinutes(el.querySelector('[data-sup-hours]').value);
            if (!(m > 0)) { K.ui().toast(ERR.invalid_minutes, 'error'); return; }
            if (m > tb.bank) { K.ui().toast(ERR.not_enough_overtime, 'error'); return; }
            body.minutes = m;
          }
          try {
            await K.api('/api/portal-leave', body);
            d.close(); K.ui().toast('Cererea a fost trimisă.', 'success'); load();
          } catch (err) { K.ui().toast(errText(err), 'error'); }
        }));
      },
    });
  }

  function adminNewLeaveDrawer() {
    const opts = employees().map((e) => '<option value="' + esc(e.id) + '"' + (C.empFilter === e.id ? ' selected' : '') + '>' + esc(e.name + (e.active === false ? ' (a plecat)' : '')) + '</option>').join('');
    const d = K.drawer({
      title: 'Notează concediu pentru un angajat', icon: 'calendar', width: 520,
      
      body: '<form class="k-form" data-form>' +
        K.field('Angajat', '<select name="employeeId" required><option value="">Alege...</option>' + opts + '</select>', 'full') +
        K.field('Tip concediu', K.seg('type', [['odihna', 'Odihnă'], ['fara_plata', 'Fără plată'], ['medical', 'Medical'], ['alta', 'Altul']], 'odihna', 'is-big'), 'full') +
        K.field('Data început', '<input name="startDate" type="date" required value="' + esc(K.today()) + '">') +
        K.field('Data sfârșit', '<input name="endDate" type="date" required value="' + esc(K.today()) + '">') +
        K.field('Motiv', '<textarea name="reason" rows="3" maxlength="500" placeholder="Opțional la odihnă/fără plată, obligatoriu la medical/altul"></textarea>', 'full') +
        '</form>',
      footer: '<span class="k-grow"></span><button type="button" class="k-btn" data-cancel>Renunță</button><button type="button" class="k-btn is-primary" data-save>' + icon('check') + 'Notează ca aprobat</button>',
      onMount(el) {
        el.querySelector('[data-cancel]').addEventListener('click', () => d.close());
        el.querySelector('[data-save]').addEventListener('click', (ev) => K.busy(ev.currentTarget, async () => {
          const v = K.formValues(el.querySelector('[data-form]'));
          if (!v.employeeId) { K.ui().toast('Alege angajatul.', 'error'); return; }
          if (!v.startDate || !v.endDate) { K.ui().toast('Completează perioada.', 'error'); return; }
          if (v.endDate < v.startDate) { K.ui().toast('Data de sfârșit e înainte de data de început.', 'error'); return; }
          if ((v.type === 'medical' || v.type === 'alta') && !v.reason.trim()) { K.ui().toast('Completează motivul pentru acest tip de concediu.', 'error'); return; }
          try {
            await K.api('/api/portal-leave', { action: 'admin_create', employeeId: v.employeeId, type: v.type, startDate: v.startDate, endDate: v.endDate, reason: v.reason });
            d.close(); K.ui().toast('Concediul a fost notat și calendarul a fost blocat.', 'success'); load();
          } catch (err) { K.ui().toast(K.errText(err), 'error'); }
        }));
      },
    });
  }

  // ------------------------------------------------------------------ the correction sheet
  // One sheet for every correction, grown from the row it was opened from (K.drawer({from})):
  //   fix      an entry of someone else's (or a missing day): times, place, why → update / create
  //   add      a day with no pontaj, for a person and a day picked here → create
  //   decide   a request of the team: what she asked, the times (changeable), Aprobă / Respinge
  //   ask      her own day: „Cere corectarea” with the real times and a note → fix_request
  // o: { mode, from, employeeId, name, date, entry, row, request, shift: { from, to, location }, location, done }
  const LOCS = [['Timișoara', 'Timișoara'], ['Arad', 'Arad']];
  // the people the owner / the manager can add a day for (never the manager herself)
  function teamPeople() {
    const me = K.data.me && K.data.me.id;
    const list = isAdmin() ? employees() : ((K.data && K.data.activeEmployees) || []).filter((e) => e.role !== 'admin' && e.id !== me);
    return list.filter((e) => e.id !== 'admin' && e.role !== 'admin').map((e) => ({ id: e.id, name: e.name, location: e.location }));
  }
  function history(entry) {
    const h = entry && Array.isArray(entry.history) ? entry.history.slice().reverse() : [];
    if (!h.length) return '';
    const ch = (x) => {
      if (!x.before) return 'Sosire ' + (x.after.checkIn || '-') + ', plecare ' + (x.after.checkOut || '-');
      return [['checkIn', 'Sosire'], ['checkOut', 'Plecare'], ['location', 'Locația']].filter(([k]) => (x.before[k] || '') !== (x.after[k] || ''))
        .map(([k, l]) => l + ' ' + (x.before[k] || '-') + ' → ' + (x.after[k] || '-')).concat((x.before.date !== x.after.date) ? ['Ziua ' + K.dateShort(x.before.date) + ' → ' + K.dateShort(x.after.date)] : []).join(', ');
    };
    return '<div class="cd-histlist"><b>' + icon('clock') + 'Istoric</b>' + h.slice(0, 6).map((x) => '<div class="cd-histitem"><span>' + esc(ch(x)) + '</span><small>' +
      esc((x.kind === 'create' ? 'Adăugat de ' : 'Corectat de ') + (x.byName || 'admin') + ', ' + K.dateShort(String(x.at).slice(0, 10)) + ' ' + String(new Date(x.at).toTimeString()).slice(0, 5)) + (x.reason ? ' · ' + esc(x.reason) : '') + '</small></div>').join('') + '</div>';
  }
  function fixSheet(o) {
    const mode = o.mode;
    const e = o.entry || null, q = o.request || null, sh = o.shift || {};
    const pick = mode === 'add' && !o.employeeId;
    const people = pick ? teamPeople() : [];
    const val = {
      date: o.date || K.addDays(K.today(), -1),
      checkIn: mode === 'decide' ? (q.checkIn || (e && e.checkIn) || '') : mode === 'ask' ? ((e && e.checkIn) || '') : (e && e.checkIn) && !(o.row && o.row.kind === 'late') ? e.checkIn : sh.from || (e && e.checkIn) || '',
      checkOut: mode === 'decide' ? (q.checkOut || (e && e.checkOut) || '') : (e && e.checkOut) || (mode === 'ask' ? '' : sh.to || ''),
      location: (e && e.location) || sh.location || o.location || 'Timișoara',
    };
    if (!LOCS.some((x) => x[0] === val.location)) val.location = 'Timișoara';
    const titles = { fix: o.row && o.row.kind === 'missing' ? 'Adaugă ziua' : 'Corectează pontajul', add: 'Adaugă o zi', decide: 'Corectarea cerută', ask: 'Cere corectarea' };
    const who = o.name || (o.employeeId ? empName(o.employeeId) : '');
    const today = K.today();
    const asked = q ? '<div class="cd-asked"><span class="k-tag is-info">Cere</span><b>' + esc([q.checkIn ? 'Sosire ' + q.checkIn : '', q.checkOut ? 'Plecare ' + q.checkOut : ''].filter(Boolean).join(' · ')) + '</b>' +
        (q.note ? '<p>„' + esc(q.note) + '”</p>' : '') + '<small>Acum: sosire ' + esc((e && e.checkIn) || '-') + ', plecare ' + esc((e && e.checkOut) || '-') + '</small></div>' : '';
    const schedHint = sh.from && sh.to ? '<p class="cd-sched">' + icon('calendar') + 'Program în ziua aceea: ' + esc(sh.from) + '-' + esc(sh.to) + (sh.location ? ', ' + esc(sh.location) : '') + '.</p>' : '';
    const body = '<form class="k-form" data-form>' + asked +
      (pick ? K.field('Angajat', '<select name="employeeId" required>' + K.options([['', 'Alege…']].concat(people.map((p) => [p.id, p.name + (p.location ? ' · ' + p.location : '')])), '') + '</select>', 'full') : '') +
      (mode === 'add' || (mode === 'ask' && !o.date) ? K.field('Ziua', '<input name="date" type="date" required max="' + esc(today) + '"' + (mode === 'ask' ? ' min="' + esc(K.addDays(today, -31)) + '"' : '') + ' value="' + esc(val.date) + '">', 'full') : '') +
      K.field('Sosire', '<input name="checkIn" type="time" value="' + esc(val.checkIn) + '">') +
      K.field('Plecare', '<input name="checkOut" type="time" value="' + esc(val.checkOut) + '">') +
      (mode === 'ask' || mode === 'decide' ? '' : K.field('Locația', K.seg('location', LOCS, val.location), 'full')) +
      (mode === 'ask' ? K.field('Notă', '<input name="note" maxlength="200" placeholder="Ex.: am uitat să pontez plecarea">', 'full')
        : mode === 'decide' ? K.field('Notă pentru ea', '<input name="note" maxlength="200" placeholder="Opțional, o vede în notificare">', 'full')
        : K.field('De ce', '<input name="reason" maxlength="200" required placeholder="Ex.: a uitat să ponteze plecarea">', 'full')) +
      '</form>' + schedHint +
      (mode === 'ask' ? '<p class="ct-hint">' + icon('info') + 'Pune ora reală. Cererea se aprobă din Condică și primești o notificare.</p>'
        : mode === 'decide' ? '' : '<p class="ct-hint">' + icon('info') + 'Diferența față de program se recalculează cât timp ziua nu e decisă. Corectarea rămâne în istoricul zilei.</p>') +
      history(e);
    const dismiss = o.row && (o.row.kind === 'missing' || o.row.kind === 'late') ? '<button type="button" class="k-btn is-ghost" data-dismiss>' + (o.row.kind === 'missing' ? 'Nu a lucrat' : 'E corect') + '</button>' : '';
    const footer = mode === 'decide'
      ? '<span class="k-grow"></span><button type="button" class="k-btn is-danger" data-no>' + icon('x') + 'Respinge</button><button type="button" class="k-btn is-good" data-save>' + icon('check') + 'Aprobă</button>'
      : dismiss + '<span class="k-grow"></span><button type="button" class="k-btn" data-cancel>Renunță</button><button type="button" class="k-btn is-primary" data-save>' + icon('check') + (mode === 'ask' ? 'Trimite cererea' : 'Salvează') + '</button>';
    const d = K.drawer({
      title: titles[mode], icon: mode === 'ask' ? 'clock' : 'pen', width: 480, from: o.from,
      subtitle: [who && mode !== 'ask' ? esc(who) : '', o.date && !(mode === 'add') ? esc(K.dateLong(o.date)) : ''].filter(Boolean).join(' · '),
      body, footer,
      onMount(el) {
        const f = el.querySelector('[data-form]');
        const close = () => d.close();
        // a person picked: her clinic as the place
        if (pick) f.employeeId.addEventListener('change', () => { const p = people.find((x) => x.id === f.employeeId.value); const b = p && f.querySelector('[data-k-seg="location"] > button[data-v="' + p.location + '"]'); if (b) b.click(); });
        const cancel = el.querySelector('[data-cancel]');
        if (cancel) cancel.addEventListener('click', () => { close(); if (o.back) o.back(); });
        const finish = (msg) => { d.close(); K.ui().toast(msg, 'success'); if (o.done) o.done(); else load(); K.reload(); };
        const dis = el.querySelector('[data-dismiss]');
        if (dis) dis.addEventListener('click', (ev) => K.busy(ev.currentTarget, async () => {
          try { await K.api('/api/portal-attendance', { action: 'fix_dismiss', key: o.row.key }); finish(o.row.kind === 'missing' ? 'Scos din listă: nu a lucrat.' : 'Scos din listă.'); }
          catch (err) { K.ui().toast(errText(err), 'error'); }
        }));
        const no = el.querySelector('[data-no]');
        if (no) no.addEventListener('click', (ev) => K.busy(ev.currentTarget, async () => {
          const v = K.formValues(f);
          try { await K.api('/api/portal-attendance', { action: 'fix_decide', id: q.id, decision: 'reject', note: v.note }); finish('Cerere respinsă. Primește o notificare.'); }
          catch (err) { K.ui().toast(errText(err), 'error'); }
        }));
        el.querySelector('[data-save]').addEventListener('click', (ev) => K.busy(ev.currentTarget, async () => {
          const v = K.formValues(f);
          const empId = pick ? v.employeeId : o.employeeId;
          const date = v.date || o.date;
          if (pick && !empId) { K.ui().toast('Alege angajatul.', 'error'); return; }
          if (!date) { K.ui().toast(ERR.invalid_date, 'error'); return; }
          if (date > today) { K.ui().toast(ERR.future_date, 'error'); return; }
          if (v.checkIn && v.checkOut && v.checkOut <= v.checkIn) { K.ui().toast(ERR.checkout_before_checkin, 'error'); return; }
          try {
            if (mode === 'ask') {
              if (!v.checkIn && !v.checkOut) { K.ui().toast('Scrie ora reală de sosire sau de plecare.', 'error'); return; }
              const r = await K.api('/api/portal-attendance', { action: 'fix_request', date, checkIn: v.checkIn || null, checkOut: v.checkOut || null, note: v.note });
              finish(r.replaced ? 'Cererea ta a fost actualizată.' : 'Cererea ta a fost trimisă.');
              return;
            }
            if (mode === 'decide') {
              await K.api('/api/portal-attendance', { action: 'fix_decide', id: q.id, decision: 'approve', checkIn: v.checkIn || null, checkOut: v.checkOut || null, note: v.note });
              finish('Pontaj corectat. Primește o notificare.');
              return;
            }
            if (!String(v.reason || '').trim()) { K.ui().toast(ERR.missing_reason, 'error'); return; }
            if (e) {
              await K.api('/api/portal-attendance', { action: 'update', id: e.id, checkIn: v.checkIn || null, checkOut: v.checkOut || null, location: v.location, reason: v.reason });
              finish('Pontaj corectat.');
              return;
            }
            if (!v.checkIn || !v.checkOut) { K.ui().toast(ERR.missing_times, 'error'); return; }
            const body = { action: 'create', employeeId: empId, date, checkIn: v.checkIn, checkOut: v.checkOut, location: v.location, reason: v.reason };
            try { await K.api('/api/portal-attendance', body); }
            catch (err) {
              if (err.code !== 'needs_confirm') throw err;
              const why = err.data && err.data.why;
              const msg = why === 'leave' ? 'Are concediu în ziua asta.' : why === 'off' ? 'Ziua asta e liberă în programul ei.' : 'E zi de weekend și nu are program setat.';
              if (!(await K.ui().confirm({ title: 'Adaugi ziua oricum?', message: msg + ' Pontajul se adaugă și se numără ca zi lucrată.', confirmText: 'Da, adaugă' }))) return;
              await K.api('/api/portal-attendance', Object.assign(body, { confirm: true }));
            }
            finish('Zi adăugată în pontaj.');
          } catch (err) { K.ui().toast(errText(err), 'error'); }
        }));
      },
    });
    return d;
  }
  K.attFixSheet = fixSheet;
  // a row of De rezolvat → its sheet
  function openFix(key, from) {
    const r = (C.fix || []).find((x) => x.key === key);
    if (!r) return;
    const entry = r.entryId ? C.attendance.find((x) => x.id === r.entryId) || { id: r.entryId, employeeId: r.employeeId, date: r.date, checkIn: r.checkIn, checkOut: r.checkOut, location: r.location } : null;
    fixSheet({ mode: r.kind === 'request' ? 'decide' : 'fix', from, employeeId: r.employeeId, name: r.name, date: r.date, entry, row: r, request: r.request, shift: { from: r.from, to: r.to, location: r.location }, location: r.location });
  }
  // her own day → „Cere corectarea” (a day picked in the sheet when none was tapped)
  function ask(date, from) {
    const e = date ? C.attendance.find((x) => x.employeeId === K.data.me.id && x.date === date) : null;
    const rq = date ? reqOf(date) : null;
    fixSheet({ mode: 'ask', from, employeeId: K.data.me.id, date: date || '', entry: e || (rq && rq.status === 'pending' ? { checkIn: rq.checkIn, checkOut: rq.checkOut } : null) });
  }
  function editAttendanceDrawer(entry, from) {
    fixSheet({ mode: 'fix', from, employeeId: entry.employeeId, name: empName(entry.employeeId), date: entry.date, entry });
  }

  async function payout(id) {
    const t = C.tb;
    if (!(await K.ui().confirm({ title: 'Plătite cu salariul?', message: fmt(t.bank) + ' ore suplimentare = ' + K.lei(t.bankLei) + '. Orele ies din sold.', confirmText: 'Da, plătite' }))) return;
    const month = C.year + '-' + String(C.month).padStart(2, '0'); // booked to the month on screen
    try { await K.api('/api/portal-attendance', { action: 'payout', employeeId: id, month }); K.ui().toast('Ore suplimentare marcate plătite.', 'success'); load(); }
    catch (e) { K.ui().toast(errText(e), 'error'); }
  }

  function onClick(e) {
    const t = e.target;
    if (t.closest('[data-act="refresh"]')) return load();
    const clockBtn = t.closest('[data-clock]');
    if (clockBtn) return clock(clockBtn.dataset.clock);
    if (t.closest('[data-new-leave]')) return newLeaveDrawer();
    if (t.closest('[data-use-overtime]')) return newLeaveDrawer('suplimentare');
    if (t.closest('[data-admin-new-leave]')) return adminNewLeaveDrawer();
    const po = t.closest('[data-payout]');
    if (po) return payout(po.dataset.payout);
    const sd = t.closest('[data-set-debt]');
    if (sd) return setDebt(sd.dataset.setDebt);
    const pick = t.closest('[data-pick-emp]');
    if (pick) { C.empFilter = pick.dataset.pickEmp; return load(); }
    const fx = t.closest('[data-fix]');
    if (fx) return openFix(fx.dataset.fix, fx);
    const fa = t.closest('[data-fix-add]');
    if (fa) return fixSheet({ mode: 'add', from: fa, employeeId: fa.dataset.fixAdd || '', name: fa.dataset.fixAdd ? empName(fa.dataset.fixAdd) : '' });
    const ak = t.closest('[data-fix-ask]');
    if (ak) return ask(ak.dataset.fixAsk, ak);
    const row = t.closest('[data-edit-att]');
    if (row) { const entry = C.attendance.find((x) => x.id === row.dataset.editAtt); if (entry) editAttendanceDrawer(entry, row); }
  }
  function onChange(e) {
    const f = e.target.closest('[data-f]');
    if (!f) return;
    if (f.dataset.f === 'emp') C.empFilter = f.value;
    if (f.dataset.f === 'month') C.month = Number(f.value);
    if (f.dataset.f === 'year') C.year = Number(f.value);
    load();
  }

  K.section('condica', { mount, show: load });
  // Admin sees the team's Condică inside Echipa (portal-admin.js).
  K.mountCondica = (el) => { if (panel !== el) mount(el, true); load(); };
  K.on('remote', () => { if (panel && K.isActive('condica')) load(); });
})();
