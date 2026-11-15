// Centrul360 portal, „Manager” (the owner, 15.11: a manager runs both clinics). For the manager and the owner (the API
// checks it: api/portal-manager.js, api/_lib/roles.js).
//   Cifre     this month, per clinic: each cosmetician's lei per day worked vs 1500 (the bonus condition), the calendar
//             booked vs the team's hours (target: full + 50%), consultations followed by a package, leads called within
//             5 minutes, messages waiting now; „Anunță-l pe George” (the lead volume as she sees it, with the numbers)
//   Echipa    the team's days over / under 8 hours and the leave requests to decide (never her own), everyone's pontaj on
//             both clinics, the team's hours (Calendar → Program echipă), leave noted for someone
//   Casa      the day's close per clinic (cash and card in the system vs counted and the POS, what happened with the cash)
//             and the clinic's myPOS card payments (only the payments, never the account's balance)
//   Rapoarte  the weekly report (the numbers, her notes and problems) and what was sent before; the owner reads here the
//             reports, the closes and what she said about the leads
// No profit, costs, salaries or ad spend anywhere on this page.
(function () {
  'use strict';
  const K = window.K;
  if (!K) return;
  const { esc, icon } = K;
  const CITIES = ['Timișoara', 'Arad'];
  const LEVELS = [['mult_putine', 'Mult prea puține', 'is-bad'], ['putin_putine', 'Puțin prea puține', 'is-warn'], ['potrivit', 'Potrivit', 'is-good'], ['putin_multe', 'Puțin prea multe', 'is-warn'], ['mult_multe', 'Mult prea multe', 'is-bad']];
  const LEVEL = Object.fromEntries(LEVELS.map((x) => [x[0], x]));
  const FATE = { ridicare: 'Păstrat pentru ridicare', depus: 'Depus în contul firmei' };
  const LEAVE = { odihna: 'Concediu de odihnă', fara_plata: 'Concediu fără plată', medical: 'Concediu medical', alta: 'Alt tip de concediu', suplimentare: 'Ore libere din suplimentare' };
  const ERR = {
    own_request: 'Cererile tale le decide adminul.', invalid_city: 'Alege orașul.', invalid_level: 'Alege cum sunt leadurile.', invalid_cash: 'Scrie cât cash ai numărat.',
    invalid_pos: 'Suma de pe POS nu e validă.', invalid_fate: 'Alege ce s-a întâmplat cu cash-ul.', invalid_deposit: 'Scrie suma depusă.', missing_notes: 'Scrie notițele sau problemele săptămânii.',
    invalid_week: 'Săptămâna nu e validă.', forbidden: 'Nu ai acces aici.', not_enough_overtime: 'Nu mai are destule ore suplimentare.', already_decided: 'A fost deja decisă.',
  };
  const errText = (e) => ERR[e && e.code] || K.errText(e);
  const S = { tab: 'cifre', city: 'all', stats: null, team: null, adj: null, leave: null, closes: null, pos: null, posCity: '', reports: null, feedback: null, empPick: '' };
  let panel = null;

  const admin = () => !!(K.data && K.data.isAdmin);
  const me = () => (K.data && K.data.me) || {};
  const myCity = () => (CITIES.includes(me().location) ? me().location : CITIES[0]);
  const fmt = (m) => { const a = Math.abs(Math.round(m || 0)); const h = Math.floor(a / 60), r = a % 60; return (m < 0 ? '-' : '') + (h ? h + 'h' + (r ? ' ' + K.pad(r) : '') : r + ' min'); };
  const fmtS = (m) => (m > 0 ? '+' : '') + fmt(m);
  const pct = (n) => (n == null ? '-' : n + '%');
  const short = (c) => (c === 'Arad' ? 'AR' : 'TM');
  const cities = () => (S.city === 'all' ? CITIES : [S.city]);
  const dShort = (d) => (d ? K.dateShort(d) : '');
  const hm = (iso) => { try { return new Intl.DateTimeFormat('ro-RO', { timeZone: 'Europe/Bucharest', hour: '2-digit', minute: '2-digit' }).format(new Date(iso)); } catch (e) { return ''; } };
  const dayOfIso = (iso) => { try { return new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Bucharest' }).format(new Date(iso)); } catch (e) { return ''; } };

  // ------------------------------------------------------------------ the page
  function mount(p) {
    panel = p;
    panel.classList.add('k-panel', 'mg');
    panel.addEventListener('click', onClick);
    panel.addEventListener('change', onChange);
    paint();
  }
  function head() {
    return '<div class="k-head"><div><div class="k-eyebrow">' + (admin() ? 'Admin · ' : '') + 'Timișoara și Arad</div><h2>Manager</h2></div>' +
      '<div class="k-head-actions mg-actions">' +
        (admin() ? '' : '<button type="button" class="k-btn is-accent" data-act="george">' + icon('bell') + 'Anunță-l pe George</button>') +
        '<button type="button" class="k-btn is-outline" data-act="close">' + icon('cash') + 'Închide ziua</button>' +
        (admin() ? '' : '<button type="button" class="k-btn is-outline" data-act="report">' + icon('listCheck') + 'Raport săptămânal</button>') +
      '</div></div>' +
      '<div class="mg-bar">' + K.seg('mgtab', [['cifre', 'Cifre', 'trend'], ['echipa', 'Echipa', 'users'], ['casa', 'Casa', 'wallet'], ['rapoarte', 'Rapoarte', 'file']], S.tab, 'mg-tabs') +
      K.seg('mgcity', [['all', 'Ambele'], ['Timișoara', 'Timișoara'], ['Arad', 'Arad']], S.city, 'mg-city') + '</div>';
  }
  function paint() {
    if (!panel) return;
    const pend = K.data && K.data.manager ? (K.data.manager.pendingTime || 0) + (K.data.manager.pendingLeave || 0) : 0;
    panel.innerHTML = head() + '<div data-body></div>';
    if (pend) { const b = panel.querySelector('.mg-tabs [data-v="echipa"]'); if (b) b.insertAdjacentHTML('beforeend', '<b class="mg-dot">' + pend + '</b>'); }
    body();
  }
  function body() {
    const el = panel && panel.querySelector('[data-body]');
    if (!el) return;
    if (S.tab === 'cifre') return cifre(el);
    if (S.tab === 'echipa') return echipa(el);
    if (S.tab === 'casa') return casa(el);
    return rapoarte(el);
  }
  const skel = (h) => '<div class="k-skel" style="height:' + (h || 160) + 'px"></div>';
  const fail = (el, what) => { el.innerHTML = '<section class="k-card">' + K.empty('alert', 'Nu am putut încărca ' + what, 'Verifică conexiunea și reîncearcă.', '<button type="button" class="k-btn is-primary" data-act="retry">Reîncearcă</button>') + '</section>'; };

  // ------------------------------------------------------------------ Cifre
  async function cifre(el, quiet) {
    if (!S.stats || !quiet) el.innerHTML = S.stats ? cifreHtml() : skel(320);
    try { S.stats = await K.api('/api/portal-manager', { action: 'stats' }); } catch (e) { if (!S.stats) return fail(el, 'cifrele'); }
    if (S.tab === 'cifre' && el.isConnected) { el.innerHTML = cifreHtml(); K.countAll(el); }
  }
  const bar = (v, max, tone) => '<span class="mg-bar-t' + (tone ? ' ' + tone : '') + '"><i style="--w:' + Math.max(2, Math.min(100, max ? (v / max) * 100 : 0)).toFixed(1) + '%"></i></span>';
  function stat(tone, ic, label, value, sub, hint) {
    return '<div class="k-stat ' + tone + '"' + (hint ? ' title="' + esc(hint) + '"' : '') + '><div class="k-stat-top"><span class="k-stat-ic">' + icon(ic) + '</span>' + esc(label) + '</div>' +
      '<div class="k-stat-value">' + value + '</div><div class="k-stat-sub">' + sub + '</div></div>';
  }
  function cifreHtml() {
    const s = S.stats;
    if (!s) return skel(320);
    const t = s.targets;
    return '<p class="mg-month">' + icon('calendar') + esc(K.monthLabel(s.month)) + ', până azi · țintele lunii: ' + t.perDay.toLocaleString('ro-RO') + ' lei pe zi lucrată de fiecare cosmeticiană, calendar plin + 50%, jumătate din consultații cu pachet, toate leadurile sunate în 5 minute, niciun mesaj fără răspuns la închidere.</p>' +
      cities().map((c) => cityCard(c, s.cities[c], t)).join('') +
      (s.waitingSocial ? '<p class="ct-hint">' + icon('chat') + K.plural(s.waitingSocial, 'conversație', 'conversații') + ' pe Instagram sau Facebook așteaptă răspuns (fără oraș).</p>' : '');
  }
  function cityCard(city, x, t) {
    if (!x) return '';
    const team = x.team.slice().sort((a, b) => b.perDay - a.perDay);
    const fm = x.fillMonth, fa = x.fillAhead, cs = x.consults, ld = x.leads;
    const fillTone = (f) => (f.pct == null ? '' : f.pct >= t.fill ? 'is-good' : f.pct >= 100 ? 'is-warn' : 'is-bad');
    const bonus = x.bonus.counted ? (x.bonus.ok ? '<span class="k-tag is-good">' + icon('check') + 'Bonus pe drum bun</span>' : '<span class="k-tag is-warn">' + K.plural(x.bonus.below, 'cosmeticiană sub 1500', 'cosmeticiene sub 1500') + '</span>') : '<span class="k-tag">nicio zi lucrată încă</span>';
    const rows = team.length ? team.map((p) => '<div class="k-row mg-cos">' + K.avatar(p.name, 34) +
      '<div class="k-row-main"><div class="k-row-title">' + esc(p.name) + '</div><div class="k-row-sub">' + (p.days ? K.plural(p.days, p.daysFrom === 'pontaj' ? 'zi pontată' : 'zi cu încasări', p.daysFrom === 'pontaj' ? 'zile pontate' : 'zile cu încasări') + ' · ' + K.lei(p.collected) : 'nicio zi lucrată luna asta') +
        (p.daysFrom === 'incasari' ? ' · fără pontaj' : '') + '</div>' + bar(p.perDay, t.perDay, p.ok ? 'is-good' : 'is-warn') + '</div>' +
      '<div class="k-row-end"><span class="mg-perday ' + (p.ok ? 'is-good' : p.days ? 'is-warn' : '') + '"><b>' + (p.days ? K.lei(p.perDay) : '-') + '</b><small>' + (p.days ? (p.ok ? 'pe zi' : 'lipsesc ' + K.lei(p.gap)) : '') + '</small></span></div></div>').join('')
      : '<p class="k-muted">Nicio cosmeticiană activă în ' + esc(city) + '.</p>';
    return '<section class="k-card mg-city-card"><div class="k-card-head"><h3>' + icon('pin') + esc(city) + '</h3>' + bonus + '</div>' +
      '<div class="k-grid c4 mg-stats">' +
        stat(fillTone(fm), 'calendar', 'Calendar, luna asta', pct(fm.pct), fm.capHours ? K.num(fm.bookedHours) + ' / ' + K.num(fm.capHours) + ' h · țintă ' + fm.targetPct + '%' : 'fără ore de lucru setate', 'Ore programate față de orele cosmeticienelor (Calendar → Program echipă). Ținta: plin + 50%.') +
        stat(fillTone(fa), 'sunrise', 'Următoarele 7 zile', pct(fa.pct), fa.capHours ? K.num(fa.bookedHours) + ' / ' + K.num(fa.capHours) + ' h · ' + K.num(fa.freeHours) + ' h libere' : 'fără ore de lucru setate') +
        stat(cs.pct == null ? '' : cs.pct >= t.consults ? 'is-good' : 'is-warn', 'target', 'Consultații cu pachet', pct(cs.pct), cs.total ? cs.withPackage + ' din ' + cs.total + ' · țintă ' + t.consults + '%' : 'nicio consultație luna asta', 'Consultațiile neanulate până azi urmate, în 7 zile, de o încasare cu pachet sau upsell pentru aceeași clientă. Portalul nu leagă direct consultația de pachet: e cea mai apropiată cifră reală.') +
        stat(ld.inHoursPct == null ? '' : ld.inHoursPct >= t.leads5 ? 'is-good' : ld.inHoursPct >= 80 ? 'is-warn' : 'is-bad', 'zap', 'Leaduri sunate în 5 min', pct(ld.inHoursPct), ld.inHours ? ld.inHoursWithin5 + ' din ' + ld.inHours + ' în program' + (ld.median != null ? ' · median ' + ld.median + ' min' : '') : 'niciun lead nou în program', 'Leadurile noi din reclame și de pe site intrate cât clinica e deschisă. Primul contact: un apel sau o notă în Pipeline, o programare sau primul mesaj scris de cineva pe WhatsApp.') +
      '</div>' +
      '<div class="mg-line">' + icon('chat') + '<span>Mesaje fără răspuns acum: <b class="' + (x.waiting ? 'is-bad' : 'is-good') + '">' + x.waiting + '</b></span>' + (x.waiting ? '<button type="button" class="k-btn is-ghost is-sm" data-go="mesaje">Deschide Mesaje</button>' : '') +
        (ld.total ? '<span class="mg-sep"></span><span>' + K.plural(ld.total, 'lead nou', 'leaduri noi') + ' luna asta, ' + ld.within5 + ' în 5 min' + (ld.never ? ', ' + ld.never + ' încă nesunate' : '') + '</span>' : '') + '</div>' +
      (x.schedule ? '' : '<p class="ct-hint">' + icon('info') + 'Orele cosmeticienelor nu sunt setate în ' + esc(city) + ': calendarul se măsoară cu orele clinicii din Calendar → Online.</p>') +
      '<h4 class="mg-h">' + icon('wallet') + 'Încasat pe zi lucrată · țintă ' + K.lei(t.perDay) + '</h4><div class="k-list">' + rows + '</div></section>';
  }

  // ------------------------------------------------------------------ Echipa
  async function echipa(el) {
    el.innerHTML = skel(260);
    try {
      const [adj, lv, ov] = await Promise.all([
        K.api('/api/portal-attendance', { action: 'adjust_list' }),
        K.api('/api/portal-leave', { action: 'list' }),
        K.api('/api/portal-attendance', { action: 'balance_all' }),
      ]);
      S.adj = adj; S.leave = lv.requests || []; S.team = ov.employees || [];
    } catch (e) { return fail(el, 'echipa'); }
    if (S.tab === 'echipa' && el.isConnected) el.innerHTML = echipaHtml();
  }
  const nameOf = (id) => { const p = (S.team || []).find((x) => x.employeeId === id) || ((K.data && K.data.activeEmployees) || []).find((x) => x.id === id); return p ? p.name : 'Angajat'; };
  const cityOfEmp = (id) => { const p = (S.team || []).find((x) => x.employeeId === id) || ((K.data && K.data.activeEmployees) || []).find((x) => x.id === id); return (p && p.location) || ''; };
  const inShown = (loc) => S.city === 'all' || !loc || loc === S.city;
  function echipaHtml() {
    const adjs = ((S.adj && S.adj.adjustments) || []).filter((a) => inShown(a.location || cityOfEmp(a.employeeId)));
    const leaves = (S.leave || []).filter((r) => r.status === 'pending' && inShown(cityOfEmp(r.employeeId)));
    const mine = (id) => id === me().id && !admin();
    const own = (x) => (mine(x.employeeId) ? 1 : 0);
    // hers last: the owner decides them
    const timeCard = (a) => '<article class="ad-card mg-dec" data-adj="' + esc(a.id) + '">' + K.avatar(a.employeeName, 40) +
      '<div class="ad-main"><div class="ad-top"><b>' + esc(a.employeeName) + '</b>' + (a.location ? '<span class="k-tag">' + icon('pin') + esc(a.location) + '</span>' : '') + '<span class="k-muted">' + esc(K.dateLong(a.date)) + '</span>' + (a.weekend ? '<span class="k-tag is-accent">weekend</span>' : '') + '</div>' +
      '<div class="ad-what">Sosire ' + esc(a.checkIn || '-') + ' · Plecare ' + esc(a.checkOut || '-') + ' · ' + fmt(a.worked) + ' lucrate</div></div>' +
      '<div class="mg-dec-amt ' + (a.minutes > 0 ? 'is-up' : 'is-down') + '"><b>' + fmtS(a.minutes) + '</b><small>' + (a.weekend ? 'suplimentar' : a.minutes > 0 ? 'peste program' : 'sub program') + '</small></div>' +
      (mine(a.employeeId) ? '<div class="ad-actions"><span class="k-tag">Decide adminul</span></div>'
        : '<div class="ad-actions"><button type="button" class="k-btn is-danger is-sm" data-adj-no="' + esc(a.id) + '">' + icon('x') + 'Respinge</button><button type="button" class="k-btn is-good is-sm" data-adj-ok="' + esc(a.id) + '">' + icon('check') + 'Aprobă</button></div>') + '</article>';
    const leaveCard = (r) => '<article class="ad-card mg-dec" data-lv="' + esc(r.id) + '">' + K.avatar(nameOf(r.employeeId), 40) +
      '<div class="ad-main"><div class="ad-top"><b>' + esc(nameOf(r.employeeId)) + '</b><span class="k-tag">' + esc(LEAVE[r.type] || r.type) + '</span></div>' +
      '<div class="ad-what">' + esc(dShort(r.startDate)) + (r.endDate !== r.startDate ? ' - ' + esc(dShort(r.endDate)) : '') + ' · ' + K.plural(r.workDays, 'zi', 'zile') +
        (r.type === 'suplimentare' ? ' · ' + fmt(r.minutes) + ' din suplimentare' : r.recovery ? ' · cu recuperare ' + fmt(r.recovery.minutes) : '') + '</div>' +
      (r.reason ? '<div class="ad-sub">„' + esc(r.reason) + '”</div>' : '') + '</div>' +
      (mine(r.employeeId) ? '<div class="ad-actions"><span class="k-tag">Decide adminul</span></div>'
        : '<div class="ad-actions"><button type="button" class="k-btn is-danger is-sm" data-lv-no="' + esc(r.id) + '">' + icon('x') + 'Respinge</button><button type="button" class="k-btn is-good is-sm" data-lv-ok="' + esc(r.id) + '">' + icon('check') + 'Aprobă</button></div>') + '</article>';
    const people = (S.team || []).filter((r) => inShown(r.location)).sort((a, b) => (a.location || '').localeCompare(b.location || '') || a.name.localeCompare(b.name));
    const person = (r) => {
      const now = r.todayCheckIn ? (r.todayCheckOut ? 'Plecat la ' + r.todayCheckOut : 'Prezent de la ' + r.todayCheckIn) : 'Nepontat azi';
      return '<button type="button" class="ad-emp mg-emp" data-emp="' + esc(r.employeeId) + '"><div class="ad-emp-top">' + K.avatar(r.name, 42) +
        '<div><b>' + esc(r.name) + '</b><span>' + K.roleTag(r.role) + esc(r.role === 'manager' ? 'ambele' : r.location || '') + (r.pending ? '<span class="k-tag is-warn">' + r.pending + ' la aprobare</span>' : '') + '</span></div></div>' +
        '<dl class="ad-emp-kv cd-kv4"><div><dt>Azi</dt><dd class="' + (r.todayCheckIn ? 'is-good' : '') + '">' + esc(now) + '</dd></div><div><dt>De recuperat</dt><dd>' + (r.debt ? fmt(r.debt) : '0') + '</dd></div><div><dt>Suplimentare</dt><dd>' + (r.bank ? fmt(r.bank) : '0') + '</dd></div><div><dt>Concediu rămas</dt><dd>' + r.daysLeft + ' z</dd></div></dl></button>';
    };
    return '<section class="k-card"><div class="k-card-head"><h3>' + icon('shield') + 'De decis</h3><span class="k-sub">pontaj și concedii, ' + (S.city === 'all' ? 'ambele clinici' : esc(S.city)) + '</span></div>' +
        (adjs.length || leaves.length ? '<div class="ad-list">' + adjs.filter((x) => !own(x)).map(timeCard).join('') + leaves.filter((x) => !own(x)).map(leaveCard).join('') + adjs.filter(own).map(timeCard).join('') + leaves.filter(own).map(leaveCard).join('') + '</div>' : '<p class="k-muted">Nimic de decis acum.</p>') +
        '<p class="ct-hint">' + icon('info') + 'Upsell-urile și comisioanele le aprobă adminul. Cererile tale le decide tot adminul.</p></section>' +
      '<section class="k-card"><div class="k-card-head"><h3>' + icon('clock') + 'Pontajul echipei</h3><div class="mg-row-btns">' +
        (K.openTeamSchedule ? '<button type="button" class="k-btn is-outline is-sm" data-act="schedule">' + icon('calendar') + 'Program echipă</button>' : '') +
        '<button type="button" class="k-btn is-outline is-sm" data-act="leave-new">' + icon('plus') + 'Notează concediu</button></div></div>' +
        (people.length ? '<div class="ad-emps">' + people.map(person).join('') + '</div>' : K.empty('users', 'Nimeni aici', '')) + '</section>';
  }
  async function decideAdj(id, ok) {
    let note = '';
    if (!ok) { note = await K.ui().prompt({ title: 'Respingi ziua?', message: 'Ex.: a uitat să ponteze plecarea. Vede motivul în notificări.', label: 'Motiv (opțional)', confirmText: 'Respinge' }); if (note === null) return; }
    const a = ((S.adj && S.adj.adjustments) || []).find((x) => x.id === id);
    try {
      await K.api('/api/portal-attendance', { action: 'adjust_decide', id, decision: ok ? 'approve' : 'reject', minutes: a ? Math.abs(a.minutes) : undefined, note });
      K.ui().toast(ok ? 'Aprobat.' : 'Respins.', ok ? 'success' : 'info'); K.reload(); body();
    } catch (e) { K.ui().toast(errText(e), 'error'); }
  }
  async function decideLeave(id, ok) {
    let rejectionNote = '';
    if (!ok) { rejectionNote = await K.ui().prompt({ title: 'Respingi cererea de concediu?', message: 'Spune-i pe scurt de ce, vede motivul la cererea ei.', label: 'Motiv (opțional)', confirmText: 'Respinge' }); if (rejectionNote === null) return; }
    try {
      await K.api('/api/portal-leave', { action: 'decide', id, decision: ok ? 'approved' : 'rejected', rejectionNote });
      K.ui().toast(ok ? 'Concediu aprobat, calendarul e blocat.' : 'Cerere respinsă.', ok ? 'success' : 'info'); K.reload(); body();
    } catch (e) { K.ui().toast(errText(e), 'error'); }
  }
  // one person's month: her days, with the correction of a mistaken entry (never one's own)
  async function openEmp(id) {
    const r = (S.team || []).find((x) => x.employeeId === id) || { name: nameOf(id) };
    const month = K.thisMonth();
    const d = K.drawer({ title: r.name, lead: K.avatar(r.name, 42), width: 520, subtitle: K.roleTag(r.role) + esc(r.location || ''), body: skel(200) });
    let list = [];
    try { list = (await K.api('/api/portal-attendance', { action: 'list', employeeId: id, year: Number(month.slice(0, 4)), month: Number(month.slice(5, 7)) })).entries || []; }
    catch (e) { d.set({ body: K.empty('alert', 'Nu am putut încărca pontajul', '') }); return; }
    const own = id === me().id && !admin();
    const worked = (e) => { const a = /^(\d\d):(\d\d)$/.exec(e.checkIn || ''), b = /^(\d\d):(\d\d)$/.exec(e.checkOut || ''); return a && b ? (+b[1] * 60 + +b[2]) - (+a[1] * 60 + +a[2]) : null; };
    const total = list.reduce((n, e) => n + (worked(e) || 0), 0);
    d.set({
      body: '<div class="k-grid c2" style="margin-bottom:1rem">' + stat('', 'calendar', 'Zile pontate', String(list.filter((e) => e.checkIn).length), esc(K.monthLabel(month))) + stat('', 'clock', 'Ore lucrate', fmt(total), 'zilele cu sosire și plecare') + '</div>' +
        (list.length ? '<div class="k-list">' + list.map((e) => '<div class="k-row' + (own ? '' : ' is-click') + '"' + (own ? '' : ' data-att="' + esc(e.id) + '"') + '><div class="k-row-main"><div class="k-row-title">' + esc(K.relDay(e.date)) + '</div>' +
          '<div class="k-row-sub">Sosire ' + esc(e.checkIn || '-') + ' · Plecare ' + esc(e.checkOut || '-') + (worked(e) != null ? ' · ' + fmt(worked(e)) : '') + (e.note ? ' · „' + esc(e.note) + '”' : '') + '</div></div>' +
          (own ? '' : '<div class="k-row-end"><span class="k-icon-btn" aria-hidden="true">' + icon('pen') + '</span></div>') + '</div>').join('') + '</div>'
          : K.empty('clock', 'Niciun pontaj luna asta', '')) +
        (own ? '<p class="ct-hint">' + icon('info') + 'Pontajul tău îl corectează adminul.</p>' : ''),
      onMount(el) {
        el.addEventListener('click', (ev) => {
          const row = ev.target.closest('[data-att]');
          if (!row) return;
          const e = list.find((x) => x.id === row.dataset.att);
          if (e) editAtt(e, r.name, () => openEmp(id));
        });
      },
    });
  }
  function editAtt(entry, name, back) {
    const d = K.drawer({
      title: 'Corectează pontajul', icon: 'pen', width: 460, subtitle: esc(name) + ' · ' + esc(K.dateLong(entry.date)),
      body: '<form class="k-form" data-form>' + K.field('Sosire', '<input name="checkIn" type="time" value="' + esc(entry.checkIn || '') + '">') +
        K.field('Plecare', '<input name="checkOut" type="time" value="' + esc(entry.checkOut || '') + '">') + K.field('Notă', '<input name="note" maxlength="300" value="' + esc(entry.note || '') + '">', 'full') + '</form>' +
        '<p class="ct-hint">' + icon('info') + 'Diferența față de 8 ore se recalculează cât timp ziua nu e decisă.</p>',
      footer: '<span class="k-grow"></span><button type="button" class="k-btn" data-cancel>Renunță</button><button type="button" class="k-btn is-primary" data-save>' + icon('check') + 'Salvează</button>',
      onMount(el) {
        el.querySelector('[data-cancel]').addEventListener('click', () => back());
        el.querySelector('[data-save]').addEventListener('click', (ev) => K.busy(ev.currentTarget, async () => {
          const v = K.formValues(el.querySelector('[data-form]'));
          try { await K.api('/api/portal-attendance', { action: 'update', id: entry.id, checkIn: v.checkIn || null, checkOut: v.checkOut || null, note: v.note }); K.ui().toast('Pontaj corectat.', 'success'); back(); }
          catch (err) { K.ui().toast(errText(err), 'error'); }
        }));
      },
    });
    return d;
  }
  function newLeave() {
    const people = (S.team || []).filter((r) => admin() || r.employeeId !== me().id);
    const d = K.drawer({
      title: 'Notează concediu', icon: 'calendar', width: 520,
      body: '<form class="k-form" data-form>' + K.field('Angajat', '<select name="employeeId" required>' + K.options([['', 'Alege…']].concat(people.map((p) => [p.employeeId, p.name + ' · ' + (p.location || '')])), '') + '</select>', 'full') +
        K.field('Tip', K.seg('type', [['odihna', 'Odihnă'], ['fara_plata', 'Fără plată'], ['medical', 'Medical'], ['alta', 'Altul']], 'odihna', 'is-big'), 'full') +
        K.field('De la', '<input name="startDate" type="date" required value="' + esc(K.today()) + '">') + K.field('Până la', '<input name="endDate" type="date" required value="' + esc(K.today()) + '">') +
        K.field('Motiv', '<textarea name="reason" rows="3" maxlength="500" placeholder="Obligatoriu la medical și altul"></textarea>', 'full') + '</form>' +
        '<p class="ct-hint">' + icon('info') + 'Se notează aprobat: zilele se blochează în Calendar și se face PDF-ul.</p>',
      footer: '<span class="k-grow"></span><button type="button" class="k-btn" data-cancel>Renunță</button><button type="button" class="k-btn is-primary" data-save>' + icon('check') + 'Notează</button>',
      onMount(el) {
        el.querySelector('[data-cancel]').addEventListener('click', () => d.close());
        el.querySelector('[data-save]').addEventListener('click', (ev) => K.busy(ev.currentTarget, async () => {
          const v = K.formValues(el.querySelector('[data-form]'));
          if (!v.employeeId) { K.ui().toast('Alege angajatul.', 'error'); return; }
          if (v.endDate < v.startDate) { K.ui().toast('Data de sfârșit e înainte de început.', 'error'); return; }
          if ((v.type === 'medical' || v.type === 'alta') && !v.reason) { K.ui().toast('Scrie motivul.', 'error'); return; }
          try { await K.api('/api/portal-leave', { action: 'admin_create', employeeId: v.employeeId, type: v.type, startDate: v.startDate, endDate: v.endDate, reason: v.reason }); d.close(); K.ui().toast('Concediu notat, calendarul e blocat.', 'success'); body(); }
          catch (err) { K.ui().toast(errText(err), 'error'); }
        }));
      },
    });
  }

  // ------------------------------------------------------------------ Casa
  async function casa(el) {
    const city = S.city === 'all' ? (S.posCity || myCity()) : S.city;
    S.posCity = city;
    el.innerHTML = skel(260);
    try {
      const [cl, pos] = await Promise.all([K.api('/api/portal-manager', { action: 'closes_list' }), K.api('/api/portal-manager', { action: 'pos', city })]);
      S.closes = cl.closes || []; S.pos = pos;
    } catch (e) { return fail(el, 'casa'); }
    if (S.tab === 'casa' && el.isConnected) el.innerHTML = casaHtml();
  }
  const diffTag = (n, what) => (n == null ? '' : Math.abs(n) < 1 ? '<span class="k-tag is-good">' + icon('check') + what + ' ok</span>' : '<span class="k-tag is-bad">' + what + ' ' + (n > 0 ? '+' : '') + K.lei(n, 2) + '</span>');
  function closeRow(x) {
    return '<div class="k-row is-click" data-close="' + esc(x.id) + '"><span class="mg-city-chip">' + short(x.city) + '</span><div class="k-row-main"><div class="k-row-title">' + esc(K.dateLong(x.date)) + '</div>' +
      '<div class="k-row-sub">Cash ' + K.lei(x.cashCounted, 2) + (x.pos != null ? ' · POS ' + K.lei(x.pos, 2) : '') + ' · ' + esc(x.cashFate === 'depus' ? 'depus ' + K.lei(x.deposited, 2) : 'pentru ridicare') + (x.byName ? ' · ' + esc(x.byName.split(' ')[0]) : '') + '</div></div>' +
      '<div class="k-row-end">' + diffTag(x.cashDiff, 'cash') + diffTag(x.cardDiff, 'card') + '</div></div>';
  }
  function casaHtml() {
    const list = (S.closes || []).filter((x) => S.city === 'all' || x.city === S.city).slice(0, 30);
    const p = S.pos || {};
    const pays = (p.payments || []);
    const ok = pays.filter((x) => !x.cancelled);
    const total = ok.reduce((a, x) => a + x.amount, 0);
    const byDay = {};
    pays.forEach((x) => { (byDay[x.day] = byDay[x.day] || []).push(x); });
    const posBody = !p.connected ? K.empty('card', 'myPOS nu e conectat', 'Adminul îl conectează din Integrări.')
      : !p.terminals ? K.empty('card', 'Niciun POS legat de ' + esc(p.city), 'Adminul alege orașul fiecărui POS din Integrări → myPOS.')
      : pays.length ? Object.keys(byDay).sort().reverse().map((d) => { const day = byDay[d], sum = day.filter((x) => !x.cancelled).reduce((a, x) => a + x.amount, 0);
        return '<h4 class="mg-h">' + esc(K.dateLong(d)) + '<span>' + K.lei(sum, 2) + ' · ' + K.plural(day.filter((x) => !x.cancelled && x.amount > 0).length, 'plată', 'plăți') + '</span></h4><div class="k-list">' +
          day.map((x) => '<div class="k-row"><span class="mg-time">' + esc(hm(x.at)) + '</span><div class="k-row-main"><div class="k-row-title">' + K.lei(x.amount, 2) + '</div><div class="k-row-sub">' + (x.pan ? 'card ••' + esc(x.pan) : 'card') + '</div></div>' +
            '<div class="k-row-end">' + (x.cancelled ? '<span class="k-tag is-bad">anulată</span>' : x.refund ? '<span class="k-tag is-warn">returnare</span>' : '') + '</div></div>').join('') + '</div>'; }).join('')
      : '<p class="k-muted">Nicio plată cu cardul în zilele astea.</p>';
    return '<section class="k-card"><div class="k-card-head"><h3>' + icon('cash') + 'Închiderile zilei</h3><button type="button" class="k-btn is-primary is-sm" data-act="close">' + icon('plus') + 'Închide ziua</button></div>' +
        (list.length ? '<div class="k-list">' + list.map(closeRow).join('') + '</div>' : '<p class="k-muted">Nicio închidere încă. La sfârșitul zilei apasă „Închide ziua”.</p>') + '</section>' +
      '<section class="k-card"><div class="k-card-head"><h3>' + icon('card') + 'Plăți cu cardul pe POS · ' + esc(p.city || S.posCity) + '</h3>' +
        (S.city === 'all' ? K.seg('poscity', CITIES.map((c) => [c, c]), S.posCity, 'mg-mini') : '') + '</div>' +
        (p.connected && p.terminals ? '<div class="k-grid c3 mg-stats" style="margin-bottom:.8rem">' + stat('is-accent', 'card', 'Încasat pe POS', K.lei(total, 2), esc(dShort(p.from)) + ' - ' + esc(dShort(p.to))) +
          stat('', 'receipt', 'Plăți', String(ok.filter((x) => x.amount > 0).length), ok.filter((x) => x.amount > 0).length ? 'bon mediu ' + K.lei(total / Math.max(1, ok.filter((x) => x.amount > 0).length)) : '-') +
          stat('', 'refresh', 'Citit', p.syncedAt ? esc(K.ago(p.syncedAt)) : '-', 'din myPOS') + '</div>' : '') +
        posBody + '<p class="ct-hint">' + icon('info') + 'Doar plățile cu cardul, ultimele 7 zile. Soldul contului nu apare aici.</p></section>';
  }

  // ------------------------------------------------------------------ Rapoarte
  async function rapoarte(el) {
    el.innerHTML = skel(260);
    try {
      const [r, f] = await Promise.all([K.api('/api/portal-manager', { action: 'reports_list' }), K.api('/api/portal-manager', { action: 'feedback_list' })]);
      S.reports = r.reports || []; S.feedback = f.feedback || [];
    } catch (e) { return fail(el, 'rapoartele'); }
    if (S.tab === 'rapoarte' && el.isConnected) el.innerHTML = rapoarteHtml();
  }
  function rapoarteHtml() {
    const fb = (S.feedback || []).filter((x) => S.city === 'all' || x.city === S.city);
    const rep = S.reports || [];
    const fbRow = (x) => { const l = LEVEL[x.level] || ['', x.level, '']; const c = x.context || {};
      return '<div class="k-row is-click" data-fb="' + esc(x.id) + '"><span class="mg-city-chip">' + short(x.city) + '</span><div class="k-row-main"><div class="k-row-title">' + esc(x.details || l[1]) + '</div>' +
        '<div class="k-row-sub">' + esc(K.dateShort(dayOfIso(x.at))) + ' ' + esc(hm(x.at)) + (x.byName ? ' · ' + esc(x.byName.split(' ')[0]) : '') + ' · ' + K.plural(c.leads7 || 0, 'lead', 'leaduri') + ' în 7 zile · ' + K.num(c.freeHoursNext7 || 0) + ' h libere</div></div>' +
        '<div class="k-row-end"><span class="k-tag ' + l[2] + '">' + esc(l[1]) + '</span></div></div>'; };
    const repRow = (x) => '<div class="k-row is-click" data-rep="' + esc(x.id) + '"><span class="k-icon-chip">' + icon('file') + '</span><div class="k-row-main"><div class="k-row-title">Săptămâna ' + esc(dShort(x.week)) + ' - ' + esc(dShort(x.to)) + '</div>' +
      '<div class="k-row-sub">' + CITIES.map((c) => short(c) + ' ' + K.lei((x.numbers[c] || {}).collected || 0)).join(' · ') + (x.byName ? ' · ' + esc(x.byName.split(' ')[0]) : '') + '</div></div>' +
      '<div class="k-row-end">' + (x.problems ? '<span class="k-tag is-warn">probleme</span>' : '') + icon('right') + '</div></div>';
    return '<section class="k-card"><div class="k-card-head"><h3>' + icon('file') + 'Rapoarte săptămânale</h3>' + (admin() ? '' : '<button type="button" class="k-btn is-primary is-sm" data-act="report">' + icon('plus') + 'Raport nou</button>') + '</div>' +
        (rep.length ? '<div class="k-list">' + rep.map(repRow).join('') + '</div>' : '<p class="k-muted">Niciun raport trimis încă.</p>') + '</section>' +
      '<section class="k-card"><div class="k-card-head"><h3>' + icon('bell') + 'Leaduri: ce i-a spus managerul lui George</h3>' + (admin() ? '' : '<button type="button" class="k-btn is-outline is-sm" data-act="george">' + icon('plus') + 'Anunță</button>') + '</div>' +
        (fb.length ? '<div class="k-list">' + fb.map(fbRow).join('') + '</div>' : '<p class="k-muted">Nimic încă.</p>') + '</section>';
  }
  function contextHtml(c) {
    if (!c) return skel(90);
    const sh = c.show30 || {};
    return '<dl class="mg-ctx"><div><dt>Leaduri, ultimele 7 zile</dt><dd>' + c.leads7 + '</dd></div><div><dt>Consultații, următoarele 7 zile</dt><dd>' + c.consultsNext7 + '</dd></div>' +
      '<div><dt>Ore libere, următoarele 7 zile</dt><dd>' + K.num(c.freeHoursNext7) + ' h <small>din ' + K.num(c.capHoursNext7) + ' h</small></dd></div>' +
      '<div><dt>Calendar ocupat, 7 zile</dt><dd>' + pct(c.fillNext7) + ' <small>țintă 150%</small></dd></div>' +
      '<div><dt>Au venit, ultimele 30 de zile</dt><dd>' + pct(sh.pct) + (sh.due ? ' <small>' + sh.came + ' din ' + sh.due + '</small>' : '') + '</dd></div></dl>';
  }
  function openFeedback(x) {
    const l = LEVEL[x.level] || ['', x.level, ''];
    K.drawer({ title: 'Leaduri ' + x.city, icon: 'bell', width: 520, subtitle: '<span class="k-tag ' + l[2] + '">' + esc(l[1]) + '</span>' + esc(K.dateLong(dayOfIso(x.at)) + ' ' + hm(x.at)) + (x.byName ? ' · ' + esc(x.byName) : ''),
      body: (x.details ? '<p class="mg-text">' + esc(x.details) + '</p>' : '<p class="k-muted">Fără detalii.</p>') + '<h4 class="mg-h">Cifrele de atunci</h4>' + contextHtml(x.context) });
  }
  function weekTable(n) {
    const row = (label, f) => '<tr><th>' + label + '</th>' + CITIES.map((c) => '<td>' + f(n[c] || {}) + '</td>').join('') + '</tr>';
    return '<div class="mg-table-wrap"><table class="mg-table"><thead><tr><th></th>' + CITIES.map((c) => '<th>' + esc(c) + '</th>').join('') + '</tr></thead><tbody>' +
      row('Încasat', (x) => K.lei(x.collected || 0)) + row('Medie pe cosmeticiană, pe zi lucrată', (x) => K.lei(x.perDayAvg || 0)) +
      row('Programări făcute', (x) => x.booked || 0) + row('Vizite în săptămână', (x) => x.visits || 0) + row('Au venit', (x) => x.shows || 0) + row('Anulate', (x) => x.cancelled || 0) +
      row('Consultații cu pachet', (x) => (x.consults ? x.consults.withPackage + ' din ' + x.consults.total : '-')) + row('Leaduri noi', (x) => x.leads || 0) +
      '</tbody></table></div>' +
      CITIES.map((c) => ((n[c] || {}).team || []).length ? '<h4 class="mg-h">' + esc(c) + ', pe cosmeticiană</h4><div class="k-list">' + n[c].team.map((p) => '<div class="k-row"><div class="k-row-main"><div class="k-row-title">' + esc(p.name) + '</div><div class="k-row-sub">' + K.plural(p.days, 'zi', 'zile') + ' · ' + K.lei(p.collected) + '</div></div><div class="k-row-end"><b class="' + (p.perDay >= 1500 ? 'is-good' : p.days ? 'is-warn' : '') + '">' + (p.days ? K.lei(p.perDay) + '/zi' : '-') + '</b></div></div>').join('') + '</div>' : '').join('');
  }
  function openReport(x) {
    K.drawer({ title: 'Raport ' + dShort(x.week) + ' - ' + dShort(x.to), icon: 'file', width: 640, subtitle: esc(x.byName || '') + ' · trimis ' + esc(K.ago(x.at)),
      body: (x.notes ? '<h4 class="mg-h">Notițe</h4><p class="mg-text">' + esc(x.notes) + '</p>' : '') + (x.problems ? '<h4 class="mg-h is-warn">Probleme</h4><p class="mg-text">' + esc(x.problems) + '</p>' : '') +
        '<h4 class="mg-h">Cifrele săptămânii</h4>' + weekTable(x.numbers || {}) });
  }

  // ------------------------------------------------------------------ Anunță-l pe George
  function george() {
    const city0 = S.city === 'all' ? myCity() : S.city;
    let ctx = null;
    const d = K.drawer({
      title: 'Anunță-l pe George', icon: 'bell', width: 560, subtitle: 'Cum sunt leadurile față de ținta: calendar plin + 50%',
      body: '<form class="k-form" data-form>' + K.field('Oraș', K.seg('city', CITIES.map((c) => [c, c]), city0, 'is-big'), 'full') +
        '<div class="k-field full"><span>Cum sunt leadurile</span><div class="mg-levels" role="radiogroup">' + LEVELS.map(([v, l, tone]) =>
          '<button type="button" role="radio" aria-checked="false" class="mg-level ' + tone + '" data-level="' + v + '"><i></i>' + esc(l) + '</button>').join('') + '<input type="hidden" name="level" value=""></div></div>' +
        K.field('Detalii', '<textarea name="details" rows="4" maxlength="1500" placeholder="De ce, ce fel de leaduri vin, zilele goale sau prea pline"></textarea>', 'full') + '</form>' +
        '<h4 class="mg-h">' + icon('info') + 'Se trimit și cifrele reale</h4><div data-ctx>' + contextHtml(null) + '</div>',
      footer: '<span class="k-grow"></span><button type="button" class="k-btn" data-cancel>Renunță</button><button type="button" class="k-btn is-accent" data-send>' + icon('bell') + 'Trimite</button>',
      onMount(el) {
        const f = el.querySelector('[data-form]');
        const loadCtx = async (city) => {
          el.querySelector('[data-ctx]').innerHTML = contextHtml(null);
          try { ctx = (await K.api('/api/portal-manager', { action: 'context', city })).context; if (f.city.value === city) el.querySelector('[data-ctx]').innerHTML = contextHtml(ctx); }
          catch (e) { el.querySelector('[data-ctx]').innerHTML = '<p class="k-muted">Cifrele nu s-au putut citi acum, se calculează la trimitere.</p>'; }
        };
        loadCtx(city0);
        f.addEventListener('change', (e) => { if (e.target.name === 'city') loadCtx(e.target.value); });
        el.querySelector('.mg-levels').addEventListener('click', (e) => {
          const b = e.target.closest('[data-level]');
          if (!b) return;
          el.querySelectorAll('[data-level]').forEach((x) => { x.classList.toggle('is-on', x === b); x.setAttribute('aria-checked', String(x === b)); });
          f.level.value = b.dataset.level;
        });
        el.querySelector('[data-cancel]').addEventListener('click', () => d.close());
        el.querySelector('[data-send]').addEventListener('click', (ev) => K.busy(ev.currentTarget, async () => {
          const v = K.formValues(f);
          if (!v.level) { K.ui().toast(ERR.invalid_level, 'error'); return; }
          try { await K.api('/api/portal-manager', { action: 'feedback', city: v.city, level: v.level, details: v.details }); d.close(); K.ui().toast('Trimis. George a primit notificarea.', 'success'); if (S.tab === 'rapoarte') body(); }
          catch (err) { K.ui().toast(errText(err), 'error'); }
        }));
      },
    });
  }

  // ------------------------------------------------------------------ Închide ziua
  function closeDay() {
    const city0 = S.city === 'all' ? myCity() : S.city;
    let sys = null;
    const d = K.drawer({
      title: 'Închide ziua', icon: 'cash', width: 560,
      body: '<form class="k-form" data-form>' + K.field('Oraș', K.seg('city', CITIES.map((c) => [c, c]), city0, 'is-big'), 'full') +
        K.field('Ziua', '<input name="date" type="date" max="' + K.today() + '" value="' + K.today() + '">', 'full') +
        '<div class="full" data-sys>' + skel(80) + '</div>' +
        K.field('Cash numărat', '<div class="k-money"><input name="cashCounted" type="number" min="0" step="0.5" inputmode="decimal" placeholder="0"></div><small class="is-warn mg-diff" data-cashdiff></small>') +
        K.field('Card pe POS', '<div class="k-money"><input name="posAmount" type="number" min="0" step="0.01" inputmode="decimal" placeholder="0"></div><small class="is-warn mg-diff" data-carddiff></small>') +
        K.field('Ce s-a întâmplat cu cash-ul', K.seg('cashFate', [['ridicare', FATE.ridicare], ['depus', FATE.depus]], 'ridicare', 'is-big'), 'full') +
        '<label class="k-field full" data-dep style="display:none"><span>Suma depusă cu cardul firmei</span><div class="k-money"><input name="deposited" type="number" min="0" step="0.5" inputmode="decimal" placeholder="0"></div></label>' +
        K.field('Notă', '<textarea name="note" rows="2" maxlength="600" placeholder="Opțional: o diferență, de ce, cine a ridicat"></textarea>', 'full') + '</form>',
      footer: '<span class="k-grow"></span><button type="button" class="k-btn" data-cancel>Renunță</button><button type="button" class="k-btn is-primary" data-save>' + icon('check') + 'Închide ziua</button>',
      onMount(el) {
        const f = el.querySelector('[data-form]');
        const diffs = () => {
          if (!sys) return;
          const cash = f.cashCounted.value === '' ? null : Number(f.cashCounted.value) - sys.cash;
          const pos = f.posAmount.value === '' ? null : Number(f.posAmount.value) - sys.card;
          const t = (n) => (n == null ? '' : Math.abs(n) < 1 ? '<b class="is-good">se potrivește cu sistemul</b>' : '<b class="is-bad">' + (n > 0 ? '+' : '') + K.lei(n, 2) + ' față de sistem</b>');
          el.querySelector('[data-cashdiff]').innerHTML = t(cash);
          el.querySelector('[data-carddiff]').innerHTML = t(pos);
        };
        const loadSys = async () => {
          const box = el.querySelector('[data-sys]');
          box.innerHTML = skel(80);
          try {
            const r = await K.api('/api/portal-manager', { action: 'close_prefill', city: f.city.value, date: f.date.value });
            sys = r.system;
            box.innerHTML = '<dl class="mg-ctx is-sys"><div><dt>Cash în sistem</dt><dd>' + K.lei(sys.cash, 2) + '</dd></div><div><dt>Card în sistem</dt><dd>' + K.lei(sys.card, 2) + '</dd></div>' +
              (sys.transfer ? '<div><dt>Transfer</dt><dd>' + K.lei(sys.transfer, 2) + '</dd></div>' : '') +
              '<div><dt>POS myPOS</dt><dd>' + (sys.pos.connected ? K.lei(sys.pos.total, 2) + ' <small>' + K.plural(sys.pos.count, 'plată', 'plăți') + '</small>' : '<small>neconectat</small>') + '</dd></div></dl>' +
              '<p class="ct-hint">' + icon('info') + K.plural(sys.count, 'încasare', 'încasări') + ' în Încasări pe ziua asta.' + (r.last ? ' Ziua a mai fost închisă ' + esc(K.ago(r.last.at)) + ': o închidere nouă se adaugă lângă ea.' : '') + '</p>';
            if (sys.pos.connected && f.posAmount.value === '') f.posAmount.value = sys.pos.total;
            diffs();
          } catch (e) { box.innerHTML = '<p class="k-muted">Nu am putut citi sistemul.</p>'; }
        };
        loadSys();
        f.addEventListener('change', (e) => {
          if (e.target.name === 'city' || e.target.name === 'date') { f.posAmount.value = ''; loadSys(); }
          if (e.target.name === 'cashFate') el.querySelector('[data-dep]').style.display = e.target.value === 'depus' ? '' : 'none';
        });
        f.addEventListener('input', diffs);
        el.querySelector('[data-cancel]').addEventListener('click', () => d.close());
        el.querySelector('[data-save]').addEventListener('click', (ev) => K.busy(ev.currentTarget, async () => {
          const v = K.formValues(f);
          if (v.cashCounted === '') { K.ui().toast(ERR.invalid_cash, 'error'); f.cashCounted.focus(); return; }
          if (v.cashFate === 'depus' && !(Number(v.deposited) > 0)) { K.ui().toast(ERR.invalid_deposit, 'error'); return; }
          try {
            const r = await K.api('/api/portal-manager', { action: 'close', city: v.city, date: v.date, cashCounted: Number(v.cashCounted), posAmount: v.posAmount === '' ? '' : Number(v.posAmount), cashFate: v.cashFate, deposited: Number(v.deposited) || 0, note: v.note });
            d.close();
            const c = r.close, off = Math.abs(c.cashDiff) >= 1 || (c.cardDiff != null && Math.abs(c.cardDiff) >= 1);
            K.ui().toast(off ? 'Ziua e închisă, cu diferență. Adminul vede închiderea.' : 'Ziua e închisă. Totul se potrivește.', off ? 'info' : 'success');
            if (S.tab === 'casa') body();
          } catch (err) { K.ui().toast(errText(err), 'error'); }
        }));
      },
    });
  }

  // ------------------------------------------------------------------ Raport săptămânal
  function report() {
    const thisMon = K.mondayOf(K.today()), lastMon = K.addDays(thisMon, -7);
    let week = K.parse(K.today()).getDay() === 1 ? lastMon : thisMon; // on a Monday, the week that just ended
    const d = K.drawer({
      title: 'Raport săptămânal', icon: 'listCheck', width: 640,
      body: '<form class="k-form" data-form>' + K.field('Săptămâna', K.seg('week', [[lastMon, 'Trecută · ' + dShort(lastMon)], [thisMon, 'Asta · ' + dShort(thisMon)]], week, 'is-big'), 'full') + '</form>' +
        '<div data-nums>' + skel(200) + '</div>' +
        '<form class="k-form" data-notes>' + K.field('Ce a mers, ce ai făcut', '<textarea name="notes" rows="4" maxlength="3000" placeholder="Pe scurt: echipa, calendarul, vânzările, ce urmează"></textarea>', 'full') +
        K.field('Probleme', '<textarea name="problems" rows="3" maxlength="3000" placeholder="Ce te-a încurcat și ce ai nevoie de la George"></textarea>', 'full') + '</form>',
      footer: '<span class="k-grow"></span><button type="button" class="k-btn" data-cancel>Renunță</button><button type="button" class="k-btn is-primary" data-send>' + icon('check') + 'Trimite raportul</button>',
      onMount(el) {
        const load = async () => {
          el.querySelector('[data-nums]').innerHTML = skel(200);
          try { const r = await K.api('/api/portal-manager', { action: 'report_draft', week }); el.querySelector('[data-nums]').innerHTML = '<h4 class="mg-h">Cifrele, ' + esc(dShort(r.week)) + ' - ' + esc(dShort(r.to)) + '</h4>' + weekTable(r.numbers); }
          catch (e) { el.querySelector('[data-nums]').innerHTML = '<p class="k-muted">Cifrele nu s-au putut citi.</p>'; }
        };
        load();
        el.querySelector('[data-form]').addEventListener('change', (e) => { if (e.target.name === 'week') { week = e.target.value; load(); } });
        el.querySelector('[data-cancel]').addEventListener('click', () => d.close());
        el.querySelector('[data-send]').addEventListener('click', (ev) => K.busy(ev.currentTarget, async () => {
          const v = K.formValues(el.querySelector('[data-notes]'));
          if (!v.notes && !v.problems) { K.ui().toast(ERR.missing_notes, 'error'); return; }
          try { await K.api('/api/portal-manager', { action: 'report_send', week, notes: v.notes, problems: v.problems }); d.close(); K.ui().toast('Raportul a plecat la George.', 'success'); if (S.tab === 'rapoarte') body(); }
          catch (err) { K.ui().toast(errText(err), 'error'); }
        }));
      },
    });
  }

  // ------------------------------------------------------------------ events
  function onClick(e) {
    const a = e.target.closest('[data-act]');
    if (a) {
      const w = a.dataset.act;
      if (w === 'george') return george();
      if (w === 'close') return closeDay();
      if (w === 'report') return report();
      if (w === 'retry') return body();
      if (w === 'schedule' && K.openTeamSchedule) return K.openTeamSchedule();
      if (w === 'leave-new') return newLeave();
    }
    const go = e.target.closest('[data-go]');
    if (go) return K.go(go.dataset.go);
    const t = (sel, fn) => { const x = e.target.closest(sel); if (x) { fn(x); return true; } return false; };
    if (t('[data-adj-ok]', (x) => decideAdj(x.dataset.adjOk, true))) return;
    if (t('[data-adj-no]', (x) => decideAdj(x.dataset.adjNo, false))) return;
    if (t('[data-lv-ok]', (x) => decideLeave(x.dataset.lvOk, true))) return;
    if (t('[data-lv-no]', (x) => decideLeave(x.dataset.lvNo, false))) return;
    if (t('[data-emp]', (x) => openEmp(x.dataset.emp))) return;
    if (t('[data-fb]', (x) => { const f = (S.feedback || []).find((y) => y.id === x.dataset.fb); if (f) openFeedback(f); })) return;
    if (t('[data-rep]', (x) => { const r = (S.reports || []).find((y) => y.id === x.dataset.rep); if (r) openReport(r); })) return;
    t('[data-close]', (x) => { const c = (S.closes || []).find((y) => y.id === x.dataset.close); if (c) openClose(c); });
  }
  function openClose(x) {
    K.drawer({ title: 'Închiderea din ' + K.dateLong(x.date), icon: 'cash', width: 520, subtitle: esc(x.city) + (x.byName ? ' · ' + esc(x.byName) : '') + ' · ' + esc(K.ago(x.at)),
      body: '<dl class="mg-ctx is-sys"><div><dt>Cash în sistem</dt><dd>' + K.lei(x.system.cash, 2) + '</dd></div><div><dt>Cash numărat</dt><dd>' + K.lei(x.cashCounted, 2) + ' ' + diffTag(x.cashDiff, '') + '</dd></div>' +
        '<div><dt>Card în sistem</dt><dd>' + K.lei(x.system.card, 2) + '</dd></div><div><dt>Card pe POS</dt><dd>' + (x.pos != null ? K.lei(x.pos, 2) + ' <small>' + esc(x.posSource) + '</small> ' + diffTag(x.cardDiff, '') : '-') + '</dd></div>' +
        (x.system.transfer ? '<div><dt>Transfer</dt><dd>' + K.lei(x.system.transfer, 2) + '</dd></div>' : '') +
        '<div><dt>Cash-ul</dt><dd>' + esc(x.cashFate === 'depus' ? 'Depus în contul firmei: ' + K.lei(x.deposited, 2) : FATE.ridicare) + '</dd></div></dl>' +
        (x.note ? '<p class="mg-text">' + esc(x.note) + '</p>' : '') });
  }
  function onChange(e) {
    if (e.target.name === 'mgtab') { S.tab = e.target.value; body(); }
    else if (e.target.name === 'mgcity') { S.city = e.target.value; if (S.tab === 'cifre') { const el = panel.querySelector('[data-body]'); el.innerHTML = cifreHtml(); } else body(); }
    else if (e.target.name === 'poscity') { S.posCity = e.target.value; body(); }
  }

  K.section('manager', { mount, show() { paint(); } });
  // a save somewhere: the numbers read again, at most once a minute (they read a lot)
  let lastRemote = 0;
  K.on('remote', () => {
    if (!panel || !K.isActive('manager') || S.tab !== 'cifre' || Date.now() - lastRemote < 60e3) return;
    lastRemote = Date.now();
    const el = panel.querySelector('[data-body]');
    if (el) cifre(el, true);
  });
})();
