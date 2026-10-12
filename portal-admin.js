// Centrul360 portal, owner sections: Aprobări, Echipa (people · salaries · Condică), Oferte, Integrări.
// Aprobări: decision cards (A / R keys), optional reason on reject, bulk approve.
// Echipa: one card per person (role, salary, month numbers); a drawer to edit profile,
// reset password, (de)activate, the net salary (what she sees in "Salariu"). Oferte: the ONE offer list (website + portal + Creative) as
// site-like cards with live preview, toggles, drag-to-reorder and the marketing brief Creative
// writes ads from. Integrări: Facebook Lead Ads, WhatsApp, Creative, the site.
(function () {
  'use strict';
  const K = window.K;
  const { esc, icon } = K;
  const cat = (k) => (K.cats && (K.cats[k] || K.cats[K.catKey(k)])) || k || '';
  const ROLES = [['receptie', 'Recepție'], ['cosmetician', 'Cosmeticiană'], ['admin', 'Admin']];
  const LOCS = [['Timișoara', 'Timișoara'], ['Arad', 'Arad']];
  const monthOf = K.monthOf;

  // =====================================================================================
  // APROBĂRI
  // =====================================================================================
  let apanel;
  function mountApprovals(p) {
    apanel = p;
    apanel.classList.add('k-panel', 'ad');
    apanel.innerHTML = '<div class="k-head"><div><div class="k-eyebrow">Admin</div><h2>Aprobări</h2><p class="k-lede">Comisioanele din upsell așteaptă aici aprobarea ta: devin oficiale în contul angajatei abia după ce le aprobi. Mai jos, cererile de concediu.</p></div>' +
      '<div class="k-head-actions" data-head></div></div><div data-body></div>' +
      '<section class="k-card" style="margin-top:1rem"><div class="k-card-head"><h3>' + icon('clock') + 'Pontaj: ore peste / sub program</h3><span class="k-sub">luni-vineri 8 ore, sâmbăta totul e suplimentar</span></div><div data-time></div></section>' +
      '<section class="k-card" style="margin-top:1rem"><div class="k-card-head"><h3>' + icon('calendar') + 'Cereri de concediu</h3></div><div data-leave></div></section>';
    apanel.addEventListener('click', onApprovalClick);
    loadLeaveApprovals();
    loadTimeApprovals();
    document.addEventListener('keydown', (e) => {
      if (!K.isActive('aprobari') || K.drawerOpen || K.typing(document.activeElement) || e.ctrlKey || e.metaKey || e.altKey) return;
      if (document.querySelector('.c360-dialog-root, .c360-palette-root')) return;
      const first = apanel.querySelector('.ad-card:not(.is-leaving)');
      if (!first) return;
      if (e.key.toLowerCase() === 'a') { e.preventDefault(); decide(first.dataset.sale, 'approve'); }
      if (e.key.toLowerCase() === 'r') { e.preventDefault(); decide(first.dataset.sale, 'reject'); }
    });
  }
  function renderApprovals() {
    if (!apanel || !K.data || !K.data.admin) return;
    const pend = K.data.admin.pendingSales.slice().sort((a, b) => (a.date < b.date ? -1 : 1));
    const month = K.thisMonth();
    const decided = K.data.admin.allSales.filter((s) => s.status !== 'pending' && s.decidedAt).sort((a, b) => (a.decidedAt < b.decidedAt ? 1 : -1)).slice(0, 8);
    const totalComm = pend.reduce((a, s) => a + K.commissionOf(s.amount), 0);
    apanel.querySelector('[data-head]').innerHTML = pend.length > 1 ? '<button type="button" class="k-btn is-good" data-all>' + icon('check') + 'Aprobă toate (' + pend.length + ')</button>' : '';
    const approvedMonth = K.data.admin.allSales.filter((s) => s.status === 'approved' && monthOf(s.date) === month);
    apanel.querySelector('[data-body]').innerHTML =
      '<div class="k-grid c3 k-stagger" style="margin-bottom:1rem">' +
        '<div class="k-stat is-warn"><div class="k-stat-top"><span class="k-stat-ic">' + icon('clock') + '</span>În așteptare</div><div class="k-stat-value" data-count="' + pend.length + '" data-key="ad-p">0</div><div class="k-stat-sub">' + K.lei(pend.reduce((a, s) => a + Number(s.amount || 0), 0)) + ' vândut</div></div>' +
        '<div class="k-stat is-accent"><div class="k-stat-top"><span class="k-stat-ic">' + icon('percent') + '</span>Comision de plătit dacă aprobi</div><div class="k-stat-value" data-count="' + Math.round(totalComm) + '" data-fmt="lei" data-key="ad-c">0</div><div class="k-stat-sub">10% din profit (upsell - 60%)</div></div>' +
        '<div class="k-stat is-good"><div class="k-stat-top"><span class="k-stat-ic">' + icon('check') + '</span>Aprobate luna asta</div><div class="k-stat-value" data-count="' + approvedMonth.length + '" data-key="ad-a">0</div><div class="k-stat-sub">' + K.lei(approvedMonth.reduce((a, s) => a + Number(s.commission || 0), 0)) + ' comision</div></div>' +
      '</div>' +
      (pend.length ? '<p class="ad-keys">' + icon('info') + 'Scurtături: <kbd>A</kbd> aprobă, <kbd>R</kbd> respinge prima vânzare din listă.</p><div class="ad-list">' + pend.map((s) => {
        return '<article class="ad-card" data-sale="' + esc(s.id) + '">' + K.avatar(s.employeeName, 44) +
          '<div class="ad-main"><div class="ad-top"><b>' + esc(s.employeeName) + '</b><span class="k-tag">' + icon('pin') + esc(s.employeeLocation) + '</span><span class="k-muted">' + esc(K.dateLong(s.date)) + '</span></div>' +
          '<div class="ad-what">' + esc(s.treatment) + '</div><div class="ad-sub">' + esc(cat(s.category)) + (s.client ? ' · ' + esc(s.client) : '') + (s.note && s.origin !== 'upsell' ? ' · „' + esc(s.note) + '”' : '') + '</div></div>' +
          '<div class="ad-money"><span class="ad-label">upsell</span><b>' + K.lei(s.amount, 2) + '</b><span>profit ' + K.lei(K.profitOf(s.amount), 2) + ' · comision <b>' + K.lei(K.commissionOf(s.amount), 2) + '</b></span></div>' +
          '<div class="ad-actions"><button type="button" class="k-btn is-danger" data-reject="' + esc(s.id) + '">' + icon('x') + 'Respinge</button><button type="button" class="k-btn is-good" data-approve="' + esc(s.id) + '">' + icon('check') + 'Aprobă</button></div></article>';
      }).join('') + '</div>'
        : '<section class="k-card">' + K.empty('shield', 'Nimic de aprobat', 'Când la o încasare se bifează „Upsell efectuat”, cererea de comision apare aici. Cererile de concediu sunt mai jos.') + '</section>') +
      (decided.length ? '<section class="k-card" style="margin-top:1rem"><div class="k-card-head"><h3>' + icon('clock') + 'Decise recent</h3></div><div class="k-list">' + decided.map((s) =>
        '<div class="k-row">' + K.avatar(s.employeeName, 30) + '<div class="k-row-main"><div class="k-row-title">' + esc(s.treatment) + '</div><div class="k-row-sub">' + esc(s.employeeName) + ' · ' + esc(K.dateShort(s.date)) + ' · ' + K.lei(s.amount) + (s.decisionNote ? ' · „' + esc(s.decisionNote) + '”' : '') + '</div></div>' +
        '<div class="k-row-end"><span class="k-tag is-' + (s.status === 'approved' ? 'good' : 'bad') + '">' + (s.status === 'approved' ? 'Aprobată · ' + K.lei(s.commission, 2) : 'Respinsă') + '</span></div></div>').join('') + '</div></section>' : '');
    K.countAll(apanel);
  }
  async function decide(id, decision) {
    const card = apanel.querySelector('[data-sale="' + id + '"]');
    let reason = '';
    if (decision === 'reject') {
      reason = await K.ui().prompt({ title: 'Respingi vânzarea?', message: 'Spune-i pe scurt de ce, vede motivul în „Salariu”.', label: 'Motiv (opțional)', confirmText: 'Respinge' });
      if (reason === null) return;
    }
    if (card) card.classList.add('is-leaving', decision === 'approve' ? 'is-yes' : 'is-no');
    try {
      await K.api('/api/portal-approve', { saleId: id, decision, reason });
      K.ui().toast(decision === 'approve' ? 'Aprobată.' : 'Respinsă.', decision === 'approve' ? 'success' : 'info');
      setTimeout(() => K.reload(), 260);
    } catch (e) { if (card) card.classList.remove('is-leaving', 'is-yes', 'is-no'); K.ui().toast(K.errText(e), 'error'); }
  }
  async function onApprovalClick(e) {
    const a = e.target.closest('[data-approve]'); if (a) return decide(a.dataset.approve, 'approve');
    const r = e.target.closest('[data-reject]'); if (r) return decide(r.dataset.reject, 'reject');
    const al = e.target.closest('[data-approve-leave]'); if (al) return decideLeave(al.dataset.approveLeave, 'approved');
    const rl = e.target.closest('[data-reject-leave]'); if (rl) return decideLeave(rl.dataset.rejectLeave, 'rejected');
    const at = e.target.closest('[data-approve-time]'); if (at) return decideTime(at.dataset.approveTime, 'approve');
    const rt = e.target.closest('[data-reject-time]'); if (rt) return decideTime(rt.dataset.rejectTime, 'reject');
    if (e.target.closest('[data-all]')) {
      const pend = K.data.admin.pendingSales;
      if (!(await K.ui().confirm({ title: 'Aprobi toate cele ' + pend.length + ' vânzări?', message: 'Comisionul se calculează pentru fiecare cu regulile de acum.', confirmText: 'Aprobă toate' }))) return;
      for (const s of pend) { try { await K.api('/api/portal-approve', { saleId: s.id, decision: 'approve' }); } catch (err) { /* already decided elsewhere */ } }
      K.ui().toast('Toate vânzările au fost aprobate.', 'success');
      K.reload();
    }
  }
  K.section('aprobari', { mount: mountApprovals, show() { renderApprovals(); loadLeaveApprovals(); loadTimeApprovals(); }, data() { if (apanel && K.isActive('aprobari')) renderApprovals(); } });

  // ---------------------------------------------------------------- Cereri de concediu
  // Second, clearly separate list inside the same Aprobări tab, leave requests aren't tied to
  // commission, but it's the same "admin decides, team sees the result" mental model.
  const LEAVE_TYPE_LABELS = { odihna: 'Concediu de odihnă', fara_plata: 'Concediu fără plată', medical: 'Concediu medical', alta: 'Alt tip de concediu', suplimentare: 'Ore libere din suplimentare' };
  // "1h 05" / "45 min", with the sign when asked
  const fmtMin = (m, sign) => { const a = Math.abs(Math.round(m || 0)); const h = Math.floor(a / 60), r = a % 60; return (sign ? (m > 0 ? '+' : m < 0 ? '-' : '') : '') + (h ? h + 'h' + (r ? ' ' + K.pad(r) : '') : r + ' min'); };
  const LV = { requests: [] };
  function empNameFor(id) {
    if (id === 'admin') return 'Admin';
    const e = (K.data.admin.employees || []).find((x) => x.id === id);
    return e ? e.name : id;
  }
  async function loadLeaveApprovals() {
    if (!apanel) return;
    try { const j = await K.api('/api/portal-leave', { action: 'list' }); LV.requests = j.requests || []; renderLeaveApprovals(); }
    catch (e) { /* badge-less, best effort */ }
  }
  function renderLeaveApprovals() {
    const box = apanel && apanel.querySelector('[data-leave]');
    if (!box) return;
    const pending = LV.requests.filter((r) => r.status === 'pending');
    const decided = LV.requests.filter((r) => r.status !== 'pending').slice(0, 8);
    box.innerHTML = (pending.length ? '<div class="ad-list">' + pending.map((r) => leaveCardHtml(r)).join('') + '</div>'
      : '<p class="k-muted">Nicio cerere în așteptare.</p>') +
      (decided.length ? '<div class="k-list" style="margin-top:.8rem">' + decided.map((r) =>
        '<div class="k-row"><div class="k-row-main"><div class="k-row-title">' + esc(empNameFor(r.employeeId)) + ' · ' + esc(LEAVE_TYPE_LABELS[r.type] || r.type) + '</div>' +
        '<div class="k-row-sub">' + esc(K.dateShort(r.startDate)) + ' - ' + esc(K.dateShort(r.endDate)) + (r.rejectionNote ? ' · „' + esc(r.rejectionNote) + '”' : '') + '</div></div>' +
        '<span class="k-tag is-' + (r.status === 'approved' ? 'good' : 'bad') + '">' + (r.status === 'approved' ? 'Aprobată' : 'Respinsă') + '</span>' +
        (r.status === 'approved' ? '<a class="k-icon-btn" target="_blank" rel="noopener" href="/api/portal-leave-pdf?id=' + esc(r.id) + '" title="PDF">' + icon('file') + '</a>' : '') + '</div>').join('') + '</div>' : '');
  }
  function leaveCardHtml(r) {
    return '<article class="ad-card" data-leave-req="' + esc(r.id) + '">' + K.avatar(empNameFor(r.employeeId), 44) +
      '<div class="ad-main"><div class="ad-top"><b>' + esc(empNameFor(r.employeeId)) + '</b><span class="k-tag">' + esc(LEAVE_TYPE_LABELS[r.type] || r.type) + '</span><span class="k-muted">' + esc(K.dateLong(r.startDate)) + '</span></div>' +
      '<div class="ad-what">' + esc(K.dateShort(r.startDate)) + ' - ' + esc(K.dateShort(r.endDate)) + ' · ' + K.plural(r.workDays, 'zi', 'zile') + '</div>' +
      (r.reason ? '<div class="ad-sub">„' + esc(r.reason) + '”</div>' : '') +
      (r.type === 'suplimentare' ? '<div class="ad-plan"><b>' + icon('trend') + 'Folosește ' + fmtMin(r.minutes) + ' din orele suplimentare</b><span>Nu mai are de recuperat.</span></div>' : '') +
      (r.recovery ? '<div class="ad-plan"><b>' + icon('refresh') + 'Cu recuperare: ' + fmtMin(r.recovery.minutes) + '</b><span>' + (r.recovery.plan || []).map((x) => esc(K.dateShort(x.date)) + ' · ' + fmtMin(x.minutes)).join('  ·  ') + '</span></div>' : '') + '</div>' +
      '<div class="ad-actions"><button type="button" class="k-btn is-danger" data-reject-leave="' + esc(r.id) + '">' + icon('x') + 'Respinge</button><button type="button" class="k-btn is-good" data-approve-leave="' + esc(r.id) + '">' + icon('check') + 'Aprobă</button></div></article>';
  }
  // ---------------------------------------------------------------- Pontaj: days over / under
  // Each finished day that's 15+ minutes off the 8 hours (or any weekend time). Shows what approving
  // does right now (covers hours to make up, goes to overtime, comes out of overtime, or becomes
  // hours to make up); the minutes can be corrected before approving.
  const TM = { list: [], balances: {}, rate: 40 };
  async function loadTimeApprovals() {
    if (!apanel) return;
    try { const j = await K.api('/api/portal-attendance', { action: 'adjust_list' }); TM.list = j.adjustments || []; TM.balances = j.balances || {}; TM.rate = j.rate || 40; renderTimeApprovals(); }
    catch (e) { /* best effort */ }
  }
  function effectText(bal, m) {
    if (m > 0) {
      const cover = Math.min(bal.debt || 0, m), bank = m - cover;
      return (cover ? fmtMin(cover) + ' acoperă din orele de recuperat (are ' + fmtMin(bal.debt) + ')' : '') + (cover && bank ? ', ' : '') +
        (bank ? fmtMin(bank) + ' la ore suplimentare = ' + K.lei(Math.round(bank / 60 * TM.rate * 100) / 100) + ', cu salariul' : '');
    }
    const miss = -m, take = Math.min(bal.bank || 0, miss), debt = miss - take;
    return (take ? fmtMin(take) + ' se scad din orele suplimentare (are ' + fmtMin(bal.bank) + ')' : '') + (take && debt ? ', ' : '') + (debt ? fmtMin(debt) + ' trec la recuperat' : '');
  }
  function renderTimeApprovals() {
    const box = apanel && apanel.querySelector('[data-time]');
    if (!box) return;
    if (!TM.list.length) { box.innerHTML = '<p class="k-muted">Nicio zi peste sau sub program în așteptare.</p>'; return; }
    box.innerHTML = '<div class="ad-list">' + TM.list.map((a) => {
      const bal = TM.balances[a.employeeId] || { debt: 0, bank: 0 };
      const up = a.minutes > 0;
      const h = Math.floor(Math.abs(a.minutes) / 60), mi = Math.abs(a.minutes) % 60;
      return '<article class="ad-card ad-time" data-time-card="' + esc(a.id) + '">' + K.avatar(a.employeeName, 44) +
        '<div class="ad-main"><div class="ad-top"><b>' + esc(a.employeeName) + '</b>' + (a.location ? '<span class="k-tag">' + icon('pin') + esc(a.location) + '</span>' : '') + '<span class="k-muted">' + esc(K.dateLong(a.date)) + '</span>' + (a.weekend ? '<span class="k-tag is-accent">weekend</span>' : '') + '</div>' +
          '<div class="ad-what">Sosire ' + esc(a.checkIn || '-') + ' · Plecare ' + esc(a.checkOut || '-') + ' · ' + fmtMin(a.worked) + ' lucrate' + (a.weekend ? '' : ' (program ' + fmtMin(a.expected) + ')') + '</div>' +
          '<div class="ad-sub ad-effect" data-effect>' + icon('info') + '<span>La aprobare: ' + effectText(bal, a.minutes) + '.</span></div></div>' +
        '<div class="ad-money ' + (up ? 'is-up' : 'is-down') + '"><span class="ad-label">' + (a.weekend ? 'suplimentar' : up ? 'peste program' : 'sub program') + '</span><b>' + fmtMin(a.minutes, true) + '</b>' +
          '<label class="ad-edit"><span>Aprobă</span><input type="number" min="0" max="24" data-th value="' + h + '" aria-label="Ore">h<input type="number" min="0" max="59" data-tm value="' + mi + '" aria-label="Minute">min</label></div>' +
        '<div class="ad-actions"><button type="button" class="k-btn is-danger" data-reject-time="' + esc(a.id) + '">' + icon('x') + 'Respinge</button><button type="button" class="k-btn is-good" data-approve-time="' + esc(a.id) + '">' + icon('check') + 'Aprobă</button></div></article>';
    }).join('') + '</div>';
    // a corrected number shows its effect right away
    box.querySelectorAll('[data-time-card]').forEach((card) => card.addEventListener('input', () => {
      const a = TM.list.find((x) => x.id === card.dataset.timeCard);
      const m = Math.sign(a.minutes) * ((Number(card.querySelector('[data-th]').value) || 0) * 60 + (Number(card.querySelector('[data-tm]').value) || 0));
      card.querySelector('[data-effect] span').textContent = m ? 'La aprobare: ' + effectText(TM.balances[a.employeeId] || { debt: 0, bank: 0 }, m) + '.' : 'Cu 0 minute nu se schimbă nimic.';
    }));
  }
  async function decideTime(id, decision) {
    const card = apanel.querySelector('[data-time-card="' + id + '"]');
    const a = TM.list.find((x) => x.id === id);
    let note = '';
    if (decision === 'reject') {
      note = await K.ui().prompt({ title: 'Respingi ziua?', message: 'Ex.: a uitat să ponteze plecarea. Vede motivul în notificări.', label: 'Motiv (opțional)', confirmText: 'Respinge' });
      if (note === null) return;
    }
    const minutes = card ? (Number(card.querySelector('[data-th]').value) || 0) * 60 + (Number(card.querySelector('[data-tm]').value) || 0) : Math.abs(a.minutes);
    if (card) card.classList.add('is-leaving', decision === 'approve' ? 'is-yes' : 'is-no');
    try {
      await K.api('/api/portal-attendance', { action: 'adjust_decide', id, decision, minutes, note });
      K.ui().toast(decision === 'approve' ? 'Aprobat.' : 'Respins.', decision === 'approve' ? 'success' : 'info');
      setTimeout(loadTimeApprovals, 260);
      K.reload();
    } catch (e) { if (card) card.classList.remove('is-leaving', 'is-yes', 'is-no'); K.ui().toast(K.errText(e), 'error'); }
  }

  async function decideLeave(id, decision) {
    const card = apanel.querySelector('[data-leave-req="' + id + '"]');
    let rejectionNote = '';
    if (decision === 'rejected') {
      rejectionNote = await K.ui().prompt({ title: 'Respingi cererea de concediu?', message: 'Spune-i pe scurt de ce, vede motivul la cererea ei.', label: 'Motiv (opțional)', confirmText: 'Respinge' });
      if (rejectionNote === null) return;
    }
    if (card) card.classList.add('is-leaving', decision === 'approved' ? 'is-yes' : 'is-no');
    try {
      await K.api('/api/portal-leave', { action: 'decide', id, decision, rejectionNote });
      K.ui().toast(decision === 'approved' ? 'Cerere aprobată, PDF-ul e generat.' : 'Cerere respinsă.', decision === 'approved' ? 'success' : 'info');
      setTimeout(loadLeaveApprovals, 260);
      K.reload();
    } catch (e) { if (card) card.classList.remove('is-leaving', 'is-yes', 'is-no'); K.ui().toast(e.code === 'not_enough_overtime' ? 'Nu mai are destule ore suplimentare pentru cererea asta.' : K.errText(e), 'error'); }
  }

  // =====================================================================================
  // ECHIPA
  // =====================================================================================
  const METRICS = {
    incasari_atribuite_luna: { label: 'Încasări din tratamentele făcute de ea (luna)', ron: true, roles: ['cosmetician'] },
    programari_finalizate_luna: { label: 'Tratamente făcute și încasate (luna)', roles: ['cosmetician'] },
    comision_aprobat_luna: { label: 'Comision din upsell, aprobat (luna)', ron: true, roles: ['cosmetician', 'receptie'] },
    vanzari_aprobate_luna: { label: 'Upsell-uri aprobate (luna)', roles: ['cosmetician', 'receptie'] },
    leaduri_contactate_luna: { label: 'Leaduri contactate (luna)', roles: ['receptie'] },
    leaduri_programate_luna: { label: 'Leaduri programate din pipeline (luna)', roles: ['receptie'] },
    incasari_inregistrate_luna: { label: 'Încasări înregistrate de ea (luna)', ron: true, roles: ['receptie'] },
    programari_confirmate_azi: { label: 'Programări confirmate azi', roles: ['cosmetician'] },
    programari_anulate_azi: { label: 'Programări anulate azi', roles: ['cosmetician'] },
    manual: { label: 'Manual (valoare introdusă de tine)', roles: ['cosmetician', 'receptie'] },
  };
  let epanel;
  const TEAM = { tab: 'people' };
  function showTeamTab() {
    epanel.querySelectorAll('[data-pane]').forEach((x) => { x.hidden = x.dataset.pane !== TEAM.tab; });
    if (TEAM.tab === 'salarii') renderPayroll();
    if (TEAM.tab === 'condica' && K.mountCondica) K.mountCondica(epanel.querySelector('[data-cond]'));
  }
  function mountTeam(p) {
    epanel = p;
    epanel.classList.add('k-panel', 'ad');
    epanel.innerHTML = '<div class="k-head"><div><div class="k-eyebrow">Admin</div><h2>Echipa</h2><p class="k-lede">Oamenii, salariile și condica, într-un singur loc.</p></div>' +
      '<div class="k-head-actions"><button type="button" class="k-btn is-accent" data-new>' + icon('userPlus') + 'Angajat nou</button></div></div>' +
      '<div class="ad-teamtabs">' + K.seg('teamtab', [['people', 'Oameni', 'users'], ['salarii', 'Salarii', 'wallet'], ['condica', 'Condică', 'clock']], TEAM.tab, 'is-big') + '</div>' +
      '<div data-pane="people"><div data-body></div></div><div data-pane="salarii" hidden><div data-pay></div></div><div data-pane="condica" hidden><div data-cond></div></div>';
    epanel.addEventListener('click', (e) => {
      if (e.target.closest('[data-new]')) return openNewEmployee();
      const c = e.target.closest('[data-emp]');
      if (c) openEmployee(c.dataset.emp);
      const po = e.target.closest('[data-payout]');
      if (po) payOvertime(po.dataset.payout);
    });
    epanel.addEventListener('change', (e) => { if (e.target.name === 'teamtab') { TEAM.tab = e.target.value; showTeamTab(); } });
  }
  function empStats(e) {
    const A = K.data.admin, month = K.thisMonth();
    const sales = A.allSales.filter((s) => s.employeeId === e.id);
    const appr = sales.filter((s) => s.status === 'approved' && monthOf(s.date) === month);
    const pend = sales.filter((s) => s.status === 'pending');
    const recorded = (K.data.incasari || []).filter((s) => s.employeeId === e.id && monthOf(s.date) === month);
    const performed = (K.data.incasari || []).filter((s) => s.performedBy === e.id && monthOf(s.date) === month);
    return {
      comm: appr.reduce((a, s) => a + Number(s.commission || 0), 0), approved: appr.length, pending: pend.length,
      recorded: recorded.reduce((a, s) => a + Number(s.amount || 0), 0), performed: performed.reduce((a, s) => a + Number(s.amount || 0), 0),
    };
  }
  function renderTeam() {
    if (!epanel || !K.data || !K.data.admin) return;
    const emps = K.data.admin.employees.filter((e) => e.id !== 'admin');
    const active = emps.filter((e) => e.active), inactive = emps.filter((e) => !e.active);
    const card = (e) => {
      const st = empStats(e);
      const pay = (K.data.admin.payroll || []).find((x) => x.id === e.id) || {};
      const kv = e.role === 'receptie'
        ? [['Salariu', e.netSalary ? K.lei(e.netSalary) : '-'], ['Bonus', K.lei(pay.bonus || 0)], ['Media/zi', pay.booking ? K.num(pay.booking.avg) : '-']]
        : [['Salariu', e.netSalary ? K.lei(e.netSalary) : '-'], ['Comision', K.lei(st.comm)], ['Tratamente', K.lei(st.performed)]];
      return '<button type="button" class="ad-emp' + (e.active ? '' : ' is-off') + '" data-emp="' + esc(e.id) + '"><div class="ad-emp-top">' + K.avatar(e.name, 46) +
        '<div><b>' + esc(e.name) + '</b><span><span class="k-tag is-' + (e.role === 'receptie' ? 'info' : e.role === 'admin' ? 'accent' : 'good') + '">' + esc(K.roleLabel(e.role)) + '</span>' + esc(e.location) + (e.active ? '' : ' · dezactivat') + '</span></div></div>' +
        '<dl class="ad-emp-kv" title="Luna curentă">' + kv.map(([k, v]) => '<div><dt>' + k + '</dt><dd>' + v + '</dd></div>').join('') + '</dl>' +
        (e.netSalary ? '' : '<div class="ad-emp-empty">' + icon('wallet') + 'Salariul nu e setat, apasă ca să-l pui</div>') + '</button>';
    };
    epanel.querySelector('[data-body]').innerHTML =
      (active.length ? '<div class="ad-emps k-stagger">' + active.map(card).join('') + '</div>' : '<section class="k-card">' + K.empty('users', 'Niciun angajat încă', 'Adaugă primul om din echipă, primește username și parolă pentru portal.', '<button type="button" class="k-btn is-primary" data-new>' + icon('userPlus') + 'Angajat nou</button>') + '</section>') +
      (inactive.length ? '<details class="ad-inactive"><summary>' + K.plural(inactive.length, 'cont dezactivat', 'conturi dezactivate') + '</summary><div class="ad-emps">' + inactive.map(card).join('') + '</div></details>' : '');
  }

  function goalRowHtml(g, i, role) {
    g = g || { title: '', metric: role === 'receptie' ? 'leaduri_programate_luna' : 'comision_aprobat_luna', target: '', reward: '', currentValue: 0 };
    const keys = Object.keys(METRICS).sort((a, b) => (METRICS[b].roles.includes(role) ? 1 : 0) - (METRICS[a].roles.includes(role) ? 1 : 0));
    return '<div class="ad-goal" data-g="' + i + '"><div class="ad-goal-row"><input data-f="title" placeholder="Nume obiectiv (ex: 25 de programări din pipeline)" value="' + esc(g.title) + '">' +
      '<button type="button" class="k-icon-btn" data-rmg="' + i + '" aria-label="Șterge obiectivul">' + icon('trash') + '</button></div>' +
      '<div class="ad-goal-grid"><label class="k-field"><span>Se măsoară</span><select data-f="metric">' + K.options(keys.map((k) => [k, METRICS[k].label + (METRICS[k].roles.includes(role) ? '' : ' ·')]), g.metric) + '</select></label>' +
      '<label class="k-field"><span>Țintă</span><input data-f="target" type="number" min="0" value="' + esc(g.target) + '"></label>' +
      '<label class="k-field" title="Se plătește când obiectivul e atins"><span>Bonus (lei)</span><input data-f="reward" type="number" min="0" step="10" value="' + esc(g.reward || '') + '" placeholder="0"></label>' +
      '<label class="k-field" data-cur style="' + (g.metric === 'manual' ? '' : 'display:none') + '"><span>Valoare curentă</span><input data-f="currentValue" type="number" value="' + esc(g.currentValue || 0) + '"></label></div>' +
      (g.current != null && g.metric !== 'manual' ? '<div class="ad-goal-now">' + icon('trend') + 'Acum: <b>' + (METRICS[g.metric] && METRICS[g.metric].ron ? K.lei(g.current) : g.current) + '</b> din ' + (METRICS[g.metric] && METRICS[g.metric].ron ? K.lei(g.target) : g.target) + '</div>' : '') + '</div>';
  }

  function openEmployee(id) {
    const e = K.data.admin.employees.find((x) => x.id === id);
    if (!e) return;
    let goals = JSON.parse(JSON.stringify(e.goals || []));
    const st = empStats(e);
    const sales = K.data.admin.allSales.filter((s) => s.employeeId === e.id).sort((a, b) => (a.date < b.date ? 1 : -1)).slice(0, 25);
    const d = K.drawer({
      title: e.name, lead: K.avatar(e.name, 44), width: 600,
      subtitle: '<span class="k-tag is-' + (e.role === 'receptie' ? 'info' : 'good') + '">' + esc(K.roleLabel(e.role)) + '</span>' + esc(e.location) + ' · @' + esc(e.username) + (e.active ? '' : ' · <b>dezactivat</b>'),
      body:
        '<div class="ad-tabs">' + K.seg('emptab', [['profile', 'Profil & salariu', 'user'], ['condica', 'Condică', 'clock'], ['sales', 'Vânzări', 'receipt']], 'profile', 'is-big') + '</div>' +
        '<div data-pane="goals" hidden><div data-goals></div><button type="button" hidden data-addg></button></div>' +
        '<div data-pane="profile"><form class="k-form" data-profile>' +
          K.field('Salariu net (în mână)', '<div class="k-money"><input name="netSalary" type="number" min="0" step="50" inputmode="numeric" value="' + esc(e.netSalary || '') + '" placeholder="0"></div>', 'full', 'Cât primește în mână pe lună. Apare la ' + esc(e.name.split(' ')[0]) + ' în „Salariu”, împreună cu orele suplimentare și ' + (e.role === 'receptie' ? 'bonusul de programări.' : 'comisionul.')) +
          K.field('Nume', '<input name="name" value="' + esc(e.name) + '" maxlength="100">', 'full') +
          K.field('Rol', K.seg('role', ROLES, e.role, 'is-big'), 'full') +
          K.field('Locație', K.seg('location', LOCS, e.location, 'is-big'), 'full') +
          K.field('Zile de concediu pe an', '<input name="annualLeaveDays" type="number" min="0" max="60" value="' + esc(e.annualLeaveDays != null ? e.annualLeaveDays : 21) + '">', '', 'Minimul legal e 20; implicit 21.') +
          K.field('Ore contractate / zi', '<input name="contractedHoursPerDay" type="number" min="1" max="16" step="0.5" value="' + esc(e.contractedHoursPerDay != null ? e.contractedHoursPerDay : 8) + '">') + '</form>' +
          '<div class="ad-access"><button type="button" class="k-btn is-outline" data-pass>' + icon('key') + 'Resetează parola</button>' +
          '<button type="button" class="k-btn ' + (e.active ? 'is-danger' : 'is-good') + '" data-toggle>' + icon('power') + (e.active ? 'Dezactivează contul' : 'Reactivează contul') + '</button></div>' +
          '<p class="k-muted">Dezactivarea blochează logarea, dar păstrează istoricul și comisioanele.</p></div>' +
        '<div data-pane="condica" hidden><div data-balance><div class="k-skel" style="height:90px"></div></div></div>' +
        '<div data-pane="sales" hidden><div class="k-grid c3" style="margin-bottom:.8rem">' +
          '<div class="k-stat is-good"><div class="k-stat-top">Comision luna</div><div class="k-stat-value">' + K.lei(st.comm) + '</div></div>' +
          '<div class="k-stat"><div class="k-stat-top">Aprobate</div><div class="k-stat-value">' + st.approved + '</div></div>' +
          '<div class="k-stat is-warn"><div class="k-stat-top">În așteptare</div><div class="k-stat-value">' + st.pending + '</div></div></div>' +
          (sales.length ? '<div class="k-list">' + sales.map((s) => '<div class="k-row"><div class="k-row-main"><div class="k-row-title">' + esc(s.treatment) + '</div><div class="k-row-sub">' + esc(K.dateShort(s.date)) + ' · ' + esc(cat(s.category)) + ' · ' + K.lei(s.amount) + '</div></div>' +
            '<span class="k-tag is-' + (s.status === 'approved' ? 'good' : s.status === 'pending' ? 'warn' : 'bad') + '">' + (s.status === 'approved' ? K.lei(s.commission, 2) : s.status === 'pending' ? 'În așteptare' : 'Respinsă') + '</span></div>').join('') + '</div>'
            : K.empty('receipt', 'Nicio vânzare logată', '')) + '</div>',
      footer: (e.active ? '<button type="button" class="k-btn is-outline" data-preview title="Vezi portalul exact cum îl vede ' + esc(e.name.split(' ')[0]) + '">' + icon('eye') + 'Intră în cont</button>' : '') +
        '<span class="k-grow"></span><button type="button" class="k-btn" data-cancel>Închide</button><button type="button" class="k-btn is-primary" data-save>' + icon('check') + 'Salvează</button>',
      onMount(el) {
        const box = el.querySelector('[data-goals]');
        const pv = el.querySelector('[data-preview]');
        if (pv) pv.addEventListener('click', () => K.busy(pv, () => K.previewAs(e.id)));
        const readGoals = () => { box.querySelectorAll('[data-g]').forEach((row) => { const g = goals[+row.dataset.g]; row.querySelectorAll('[data-f]').forEach((f) => { g[f.dataset.f] = f.value; }); }); };
        const paint = () => {
          box.innerHTML = goals.length ? goals.map((g, i) => goalRowHtml(g, i, e.role)).join('') : '<div class="ad-emp-empty" style="margin-bottom:.7rem">' + icon('target') + 'Niciun obiectiv. Adaugă unul, de ex. un bonus de 200 lei la 25 de programări.</div>';
          el.querySelector('[data-addg]').disabled = goals.length >= 4;
        };
        paint();
        box.addEventListener('change', (ev) => { if (ev.target.dataset.f === 'metric') { const row = ev.target.closest('[data-g]'); row.querySelector('[data-cur]').style.display = ev.target.value === 'manual' ? '' : 'none'; } });
        el.querySelector('[data-addg]').addEventListener('click', () => { readGoals(); goals.push({ title: '', metric: e.role === 'receptie' ? 'leaduri_programate_luna' : 'comision_aprobat_luna', target: '', reward: '' }); paint(); const t = box.querySelectorAll('[data-f="title"]'); t[t.length - 1].focus(); });
        box.addEventListener('click', (ev) => { const rm = ev.target.closest('[data-rmg]'); if (rm) { readGoals(); goals.splice(+rm.dataset.rmg, 1); paint(); } });
        let balanceLoaded = false;
        async function loadBalance() {
          if (balanceLoaded) return;
          balanceLoaded = true;
          const box = el.querySelector('[data-balance]');
          try {
            const [b, t] = await Promise.all([K.api('/api/portal-attendance', { action: 'balance', employeeId: e.id }), K.api('/api/portal-attendance', { action: 'timebank', employeeId: e.id })]);
            const hm = (m) => { const a = Math.abs(Math.round(m || 0)); const h = Math.floor(a / 60), r = a % 60; return a ? (h ? h + 'h' + (r ? ' ' + K.pad(r) : '') : r + ' min') : '0'; };
            box.innerHTML = '<div class="k-grid c3">' +
              '<div class="k-stat"><div class="k-stat-top">' + icon('calendar') + 'Zile de concediu rămase</div><div class="k-stat-value">' + b.daysLeft + '</div><div class="k-stat-sub">din ' + b.annualLeaveDays + ', ' + b.daysUsed + ' folosite anul acesta</div></div>' +
              '<div class="k-stat' + (t.debt ? ' is-warn' : '') + '"><div class="k-stat-top">' + icon('refresh') + 'De recuperat</div><div class="k-stat-value">' + hm(t.debt) + '</div></div>' +
              '<div class="k-stat' + (t.bank ? ' is-good' : '') + '"><div class="k-stat-top">' + icon('trend') + 'Ore suplimentare</div><div class="k-stat-value">' + hm(t.bank) + '</div><div class="k-stat-sub">' + K.lei(t.bankLei) + ' de plătit cu salariul</div></div></div>';
          } catch (err) { box.innerHTML = '<span class="k-muted">Nu am putut calcula.</span>'; }
        }
        el.querySelector('input[name=emptab]').addEventListener('change', (ev) => {
          el.querySelectorAll('[data-pane]').forEach((p) => { p.hidden = p.dataset.pane !== ev.target.value; });
          el.querySelector('[data-save]').hidden = ev.target.value === 'sales' || ev.target.value === 'condica';
          if (ev.target.value === 'condica') loadBalance();
        });
        el.querySelector('[data-cancel]').addEventListener('click', () => d.close());
        el.querySelector('[data-pass]').addEventListener('click', async () => {
          const pw = await K.ui().prompt({ title: 'Parolă nouă pentru ' + e.name, message: 'Spune-i parola nouă; o poate folosi imediat.', label: 'Parolă (minim 6 caractere)', confirmText: 'Resetează' });
          if (pw == null) return;
          if (pw.length < 6) { K.ui().toast('Parola trebuie să aibă minim 6 caractere.', 'error'); return; }
          try { await K.api('/api/portal-employees', { action: 'reset_password', employeeId: e.id, newPassword: pw }); K.ui().toast('Parola a fost resetată.', 'success'); }
          catch (err) { K.ui().toast(K.errText(err), 'error'); }
        });
        el.querySelector('[data-toggle]').addEventListener('click', async () => {
          if (e.active && !(await K.ui().confirm({ title: 'Dezactivezi contul lui ' + e.name + '?', message: 'Nu se mai poate loga. Istoricul și comisioanele rămân.', confirmText: 'Dezactivează', danger: true }))) return;
          try { await K.api('/api/portal-employees', { action: 'set_active', employeeId: e.id, active: !e.active }); d.close(); K.ui().toast(e.active ? 'Cont dezactivat.' : 'Cont reactivat.', 'success'); K.reload(); }
          catch (err) { K.ui().toast(K.errText(err), 'error'); }
        });
        el.querySelector('[data-save]').addEventListener('click', (ev) => K.busy(ev.currentTarget, async () => {
          readGoals();
          const tab = el.querySelector('input[name=emptab]').value;
          try {
            if (tab === 'profile') {
              const v = K.formValues(el.querySelector('[data-profile]'));
              if (!v.name) { K.ui().toast('Numele e obligatoriu.', 'error'); return; }
              await K.api('/api/portal-employees', { action: 'update_details', employeeId: e.id, name: v.name, location: v.location, role: v.role, annualLeaveDays: v.annualLeaveDays, contractedHoursPerDay: v.contractedHoursPerDay, netSalary: v.netSalary });
            } else if (tab === 'goals') {
              const clean = goals.filter((g) => String(g.title).trim()).map((g) => ({ title: String(g.title).trim(), metric: g.metric, target: Number(g.target) || 0, reward: Number(g.reward) || 0, currentValue: Number(g.currentValue) || 0 }));
              if (clean.some((g) => !g.target)) { K.ui().toast('Fiecare obiectiv are nevoie de o țintă.', 'error'); return; }
              await K.api('/api/portal-employees', { action: 'set_goals', employeeId: e.id, goals: clean });
            }
            d.close(); K.ui().toast('Salvat.', 'success'); K.reload();
          } catch (err) { K.ui().toast(K.errText(err), 'error'); }
        }));
      },
    });
  }

  function openNewEmployee() {
    const gen = () => { const a = 'abcdefghjkmnpqrstuvwxyz23456789'; let s = ''; const r = crypto.getRandomValues(new Uint32Array(10)); for (let i = 0; i < 10; i++) s += a[r[i] % a.length]; return s; };
    const d = K.drawer({
      title: 'Angajat nou', icon: 'userPlus', subtitle: 'Primește cont în portal, cu acces potrivit rolului.',
      body: '<form class="k-form" data-form>' +
        K.field('Nume complet', '<input name="name" required maxlength="100" placeholder="ex: Giovanna Marin" autofocus>', 'full') +
        K.field('Rol', K.seg('role', ROLES.slice(0, 2), 'receptie', 'is-big'), 'full', 'Recepția face programările și are Sarcini. Cosmeticiana vede calendarul, contactele (fișe, poze), încasările și comisionul ei.') +
        K.field('Locație', K.seg('location', LOCS, 'Timișoara', 'is-big'), 'full') +
        K.field('Username', '<input name="username" required maxlength="60" autocomplete="off">') +
        K.field('Parolă temporară', '<div class="ad-pass"><input name="password" required minlength="6" autocomplete="off" value="' + gen() + '"><button type="button" class="k-icon-btn" data-gen title="Generează alta">' + icon('refresh') + '</button></div>') +
        '</form>',
      footer: '<span class="k-grow k-muted">Spune-i username-ul și parola; o poate schimba cerându-ți ție.</span><button type="button" class="k-btn" data-cancel>Renunță</button><button type="button" class="k-btn is-accent" data-save>' + icon('check') + 'Creează contul</button>',
      onMount(el) {
        const f = el.querySelector('[data-form]');
        f.name.addEventListener('input', () => { if (!f.username.dataset.touched) f.username.value = K.norm(f.name.value).trim().split(/\s+/)[0] || ''; });
        f.username.addEventListener('input', () => { f.username.dataset.touched = '1'; });
        el.querySelector('[data-gen]').addEventListener('click', () => { f.password.value = gen(); });
        el.querySelector('[data-cancel]').addEventListener('click', () => d.close());
        el.querySelector('[data-save]').addEventListener('click', (ev) => K.busy(ev.currentTarget, async () => {
          const v = K.formValues(f);
          if (!v.name || !v.username || (v.password || '').length < 6) { K.ui().toast('Completează numele, username-ul și o parolă de minim 6 caractere.', 'error'); return; }
          try {
            await K.api('/api/portal-employees', Object.assign({ action: 'create' }, v));
            d.close();
            K.ui().toast('Cont creat pentru ' + v.name + ' · username: ' + v.username, 'success');
            K.reload();
          } catch (err) { K.ui().toast(K.errText(err), 'error'); }
        }));
      },
    });
  }
  // ---------------- Salarii: this month's pay of every person (salary + overtime + commission / bonus)
  function renderPayroll() {
    const box = epanel && epanel.querySelector('[data-pay]');
    if (!box || !K.data || !K.data.admin) return;
    const rows = K.data.admin.payroll || [];
    const sum = (k) => rows.reduce((a, r) => a + (Number(r[k]) || 0), 0);
    const hm = (m) => { const a = Math.abs(Math.round(m || 0)); const h = Math.floor(a / 60), r = a % 60; return h ? h + 'h' + (r ? ' ' + K.pad(r) : '') : r + ' min'; };
    box.innerHTML =
      '<div class="k-grid c4 k-stagger" style="margin-bottom:1rem">' +
        '<div class="k-stat is-accent"><div class="k-stat-top">' + icon('wallet') + 'Total de plată</div><div class="k-stat-value">' + K.lei(sum('total')) + '</div><div class="k-stat-sub">' + esc(K.monthLabel(K.thisMonth())) + ', până azi</div></div>' +
        '<div class="k-stat"><div class="k-stat-top">' + icon('users') + 'Salarii de bază</div><div class="k-stat-value">' + K.lei(sum('base')) + '</div></div>' +
        '<div class="k-stat"><div class="k-stat-top">' + icon('clock') + 'Ore suplimentare</div><div class="k-stat-value">' + K.lei(sum('overtimeLei')) + '</div></div>' +
        '<div class="k-stat"><div class="k-stat-top">' + icon('percent') + 'Comision + bonus</div><div class="k-stat-value">' + K.lei(sum('commission') + sum('bonus')) + '</div></div>' +
      '</div>' +
      (rows.length ? '<div class="pr-list">' + rows.map((r) => {
        const extra = r.hasBonus
          ? '<div><dt>Bonus programări</dt><dd>' + K.lei(r.bonus) + '</dd><small>' + (r.booking && r.booking.days ? 'media ' + K.num(r.booking.avg) + '/zi' : 'fără zile pontate') + '</small></div>'
          : '<div><dt>Comision</dt><dd>' + K.lei(r.commission, r.commission % 1 ? 2 : 0) + '</dd><small>' + (r.commissionWaiting ? K.lei(r.commissionWaiting, 2) + ' în așteptare' : K.plural(r.upsells, 'upsell', 'upsell-uri')) + '</small></div>';
        return '<article class="pr-row"><button type="button" class="pr-who" data-emp="' + esc(r.id) + '">' + K.avatar(r.name, 40) + '<span><b>' + esc(r.name) + '</b><small>' + esc(K.roleLabel(r.role)) + ' · ' + esc(r.location || '') + '</small></span></button>' +
          '<dl class="pr-kv"><div><dt>Salariu net</dt><dd>' + (r.base ? K.lei(r.base) : '<em>nesetat</em>') + '</dd></div>' +
          '<div><dt>Ore suplimentare</dt><dd>' + K.lei(r.overtimeLei, r.overtimeLei % 1 ? 2 : 0) + '</dd><small>' + (r.overtimeMinutes ? hm(r.overtimeMinutes) + (r.overtimeDueLei ? ', de plătit' : ', plătite') : '-') + '</small></div>' + extra +
          '<div class="pr-total"><dt>Total</dt><dd>' + K.lei(r.total, r.total % 1 ? 2 : 0) + '</dd></div></dl>' +
          (r.overtimeDueLei ? '<button type="button" class="k-btn is-sm is-good" data-payout="' + esc(r.id) + '">' + icon('check') + 'Ore plătite cu salariul</button>' : '') + '</article>';
      }).join('') + '</div>' : K.empty('users', 'Niciun angajat activ', ''));
  }
  async function payOvertime(id) {
    const r = (K.data.admin.payroll || []).find((x) => x.id === id);
    if (!r || !(await K.ui().confirm({ title: 'Ore suplimentare plătite?', message: r.name + ': ' + K.lei(r.overtimeDueLei, 2) + ', cu salariul. Orele ies din sold.', confirmText: 'Da, plătite' }))) return;
    try { await K.api('/api/portal-attendance', { action: 'payout', employeeId: id }); K.ui().toast('Marcat plătit.', 'success'); K.reload(); }
    catch (e) { K.ui().toast(K.errText(e), 'error'); }
  }

  K.section('angajati', { mount: mountTeam, show() { renderTeam(); showTeamTab(); }, data() { if (epanel && K.isActive('angajati')) { renderTeam(); if (TEAM.tab === 'salarii') renderPayroll(); } } });

  // =====================================================================================
  // OFERTE
  // =====================================================================================
  const O = { list: null, images: [], filter: 'active' };
  const SITE_CATS = [['epilare', 'Epilare'], ['faciale', 'Faciale'], ['remodelare', 'Remodelare']];
  const LOC = { timisoara: 'Timișoara', arad: 'Arad' };
  let opanel;
  const imgUrl = (key) => { const i = O.images.find((x) => x.key === key); return i ? '/' + i.path : ''; };
  const disc = (o) => (Number(o.priceOld) > 0 ? Math.round(100 - (Number(o.priceNew) / Number(o.priceOld)) * 100) : 0);

  function mountOffers(p) {
    opanel = p;
    opanel.classList.add('k-panel', 'of');
    opanel.innerHTML = '<div class="k-head"><div><div class="k-eyebrow">Admin</div><h2>Oferte</h2><p class="k-lede">O singură listă pentru site (oferte.html, prețuri), recepție, comisioane și Creative. Schimbi aici, se schimbă peste tot.</p></div>' +
      '<div class="k-head-actions"><a class="k-btn is-outline" href="/oferte" target="_blank" rel="noopener">' + icon('eye') + 'Vezi pe site</a><button type="button" class="k-btn is-accent" data-new>' + icon('plus') + 'Ofertă nouă</button></div></div>' +
      '<div class="of-flow">' + ['Site public', 'Recepție & încasări', 'Comision', 'Creative · reclame'].map((x, i) => '<span>' + icon(['globe', 'wallet', 'percent', 'sparkles'][i] || 'tag') + x + '</span>').join(icon('arrow')) + '</div>' +
      '<div data-body><div class="k-skel" style="height:260px"></div></div>';
    opanel.addEventListener('click', onOfferClick);
    opanel.addEventListener('change', (e) => {
      const sw = e.target.closest('.of-toggles .k-switch input');
      if (!sw) return;
      const o = O.list.find((x) => x.id === sw.closest('[data-offer]').dataset.offer);
      if (o) quickSave(o, { [sw.name]: sw.checked });
    });
  }
  async function loadOffers() {
    try { const j = await K.api('/api/portal-offers', { action: 'list' }); O.list = j.offers || []; O.images = j.images || []; renderOffers(); }
    catch (e) { opanel.querySelector('[data-body]').innerHTML = K.empty('alert', 'Nu am putut încărca ofertele', '', '<button type="button" class="k-btn is-primary" data-reload>Reîncearcă</button>'); }
  }
  function renderOffers() {
    const all = O.list.slice().sort((a, b) => (Number(a.order) || 0) - (Number(b.order) || 0));
    const count = { all: all.length, active: all.filter((o) => o.active).length, ads: all.filter((o) => o.ads && o.active).length, off: all.filter((o) => !o.active).length };
    const list = all.filter((o) => O.filter === 'all' || (O.filter === 'active' && o.active) || (O.filter === 'ads' && o.ads && o.active) || (O.filter === 'off' && !o.active));
    opanel.querySelector('[data-body]').innerHTML =
      '<div class="k-toolbar"><div class="k-chips">' + [['active', 'Active pe site'], ['ads', 'În reclame'], ['off', 'Inactive'], ['all', 'Toate']].map(([k, l]) =>
        '<button type="button" class="k-chip' + (O.filter === k ? ' is-on' : '') + '" data-filter="' + k + '">' + l + '<span>' + count[k] + '</span></button>').join('') + '</div>' +
        '<span class="k-muted of-drag-hint">' + icon('grip') + 'Trage cardurile ca să schimbi ordinea de pe site</span></div>' +
      (list.length ? '<div class="of-grid" data-grid>' + list.map(offerCard).join('') + '</div>' : '<section class="k-card">' + K.empty('tag', 'Nicio ofertă aici', '', '<button type="button" class="k-btn is-primary" data-new>' + icon('plus') + 'Ofertă nouă</button>') + '</section>');
    wireDrag();
  }
  function offerCard(o) {
    const lines = String(o.description || '').split('\n').filter(Boolean);
    return '<article class="of-card' + (o.active ? '' : ' is-off') + '" data-offer="' + esc(o.id) + '" draggable="true">' +
      '<div class="of-img" style="background-image:url(\'' + esc(imgUrl(o.imageKey)) + '\')">' + (disc(o) ? '<span class="of-disc">-' + disc(o) + '%</span>' : '') + (o.featured ? '<span class="of-feat">' + icon('star') + 'Pachet</span>' : '') + '</div>' +
      '<div class="of-body"><div class="of-cat">' + esc((SITE_CATS.find((c) => c[0] === o.category) || [, o.category])[1]) + '</div><b>' + esc(o.title) + '</b>' +
      '<div class="of-price"><b>' + K.lei(o.priceNew) + '</b>' + (o.priceOld > o.priceNew ? '<s>' + K.lei(o.priceOld) + '</s>' : '') + '</div>' +
      (lines[0] ? '<p>' + esc(lines[0]) + '</p>' : '') +
      '<div class="of-tags">' + (o.locations || []).map((l) => '<span class="k-tag">' + icon('pin') + LOC[l] + '</span>').join('') + (o.guarantee ? '<span class="k-tag is-good">' + icon('shield') + 'Garanție</span>' : '') + '</div></div>' +
      '<footer class="of-toggles">' + K.toggle('active', o.active, 'Activă') + K.toggle('ads', o.ads, 'Reclame') +
      '<button type="button" class="k-icon-btn" data-edit="' + esc(o.id) + '" aria-label="Editează">' + icon('pen') + '</button></footer></article>';
  }
  async function quickSave(o, patch) {
    const before = Object.assign({}, o);
    Object.assign(o, patch);
    try {
      const j = await K.api('/api/portal-offers', Object.assign({ action: 'update' }, siteFields(o), { id: o.id, marketing: marketingFields(o) }));
      O.list = j.offers; renderOffers(); K.reload();
    } catch (e) { Object.assign(o, before); renderOffers(); K.ui().toast(K.errText(e), 'error'); }
  }
  const siteFields = (o) => ({ title: o.title, description: o.description || '', priceNew: Number(o.priceNew), priceOld: Number(o.priceOld), category: o.category, featured: !!o.featured, imageKey: o.imageKey, active: !!o.active, order: o.order });
  const marketingFields = (o) => ({ ads: !!o.ads, locations: o.locations, adName: o.adName, mechanic: o.mechanic, includes: o.includes, device: o.device, dreamOutcome: o.dreamOutcome, mechanism: o.mechanism, objections: o.objections, zones: o.zones, guarantee: o.guarantee, notes: o.notes });

  function onOfferClick(e) {
    const t = e.target;
    if (t.closest('[data-new]')) return openOffer(null);
    if (t.closest('[data-reload]')) return loadOffers();
    const f = t.closest('[data-filter]');
    if (f) { O.filter = f.dataset.filter; return renderOffers(); }
    if (t.closest('.of-toggles .k-switch')) return; // handled on change
    const card = t.closest('[data-offer]');
    if (card) openOffer(card.dataset.offer);
  }
  function wireDrag() {
    const grid = opanel.querySelector('[data-grid]');
    if (!grid) return;
    let dragEl = null;
    grid.addEventListener('dragstart', (e) => { dragEl = e.target.closest('.of-card'); if (dragEl) { dragEl.classList.add('is-drag'); e.dataTransfer.effectAllowed = 'move'; } });
    grid.addEventListener('dragover', (e) => {
      if (!dragEl) return;
      e.preventDefault();
      const over = e.target.closest('.of-card');
      if (!over || over === dragEl) return;
      const r = over.getBoundingClientRect();
      const after = (e.clientX - r.left) > r.width / 2;
      grid.insertBefore(dragEl, after ? over.nextSibling : over);
    });
    grid.addEventListener('dragend', async () => {
      if (!dragEl) return;
      dragEl.classList.remove('is-drag');
      dragEl = null;
      const visibleIds = Array.from(grid.querySelectorAll('.of-card')).map((c) => c.dataset.offer);
      // Keep offers outside the current filter in their relative place after the visible ones.
      const rest = O.list.slice().sort((a, b) => (Number(a.order) || 0) - (Number(b.order) || 0)).map((o) => o.id).filter((id) => !visibleIds.includes(id));
      try { const j = await K.api('/api/portal-offers', { action: 'reorder', ids: visibleIds.concat(rest) }); O.list = j.offers; renderOffers(); K.ui().toast('Ordinea de pe site a fost salvată.', 'success'); K.reload(); }
      catch (err) { K.ui().toast(K.errText(err), 'error'); loadOffers(); }
    });
  }

  function openOffer(id) {
    const src = id ? O.list.find((x) => x.id === id) : null;
    const o = src ? JSON.parse(JSON.stringify(src)) : { title: '', description: '', priceNew: '', priceOld: '', category: 'remodelare', featured: false, imageKey: (O.images[0] || {}).key, active: true,
      ads: false, locations: ['timisoara', 'arad'], adName: '', mechanic: '', includes: '', device: '', dreamOutcome: '', mechanism: '', objections: [], zones: [], guarantee: '', notes: '' };
    const lines = (a) => (a || []).join('\n');
    const d = K.drawer({
      title: src ? o.title : 'Ofertă nouă', icon: 'tag', width: 720, subtitle: 'Se vede pe site, la recepție și în Creative imediat ce salvezi.',
      body:
        '<div class="of-preview" data-preview></div>' +
        '<section class="k-section"><h4>' + icon('globe') + 'Pe site</h4><form class="k-form" data-site>' +
          K.field('Titlu', '<input name="title" maxlength="150" value="' + esc(o.title) + '" placeholder="ex: LipoSonix · 2 zone">', 'full') +
          K.field('Preț nou (lei)', '<input name="priceNew" type="number" min="0" value="' + esc(o.priceNew) + '">') +
          K.field('Preț vechi (lei)', '<input name="priceOld" type="number" min="0" value="' + esc(o.priceOld) + '">') +
          K.field('Descriere', '<textarea name="description" rows="4" maxlength="2000" placeholder="Prima linie = subtitlu. Liniile următoare = puncte (la pachete).">' + esc(o.description) + '</textarea>', 'full') +
          K.field('Categorie pe site', K.seg('category', SITE_CATS, o.category, 'is-big'), 'full') +
          K.field('Unde se face', '<div class="of-locs">' + Object.keys(LOC).map((l) => '<label class="k-switch"><input type="checkbox" name="loc_' + l + '"' + ((o.locations || []).includes(l) ? ' checked' : '') + '><i></i><span>' + LOC[l] + '</span></label>').join('') + '</div>', 'full') +
          '<div class="full of-flags">' + K.toggle('active', o.active, 'Activă (pe site și în portal)') + K.toggle('featured', o.featured, 'Card mare de pachet pe site') + '</div>' +
          K.field('Imagine', '<div class="of-imgs">' + O.images.map((img) => '<button type="button" data-img="' + esc(img.key) + '" class="' + (img.key === o.imageKey ? 'is-on' : '') + '" title="' + esc(img.label) + '" style="background-image:url(\'/' + esc(img.path) + '\')"></button>').join('') + '<input type="hidden" name="imageKey" value="' + esc(o.imageKey || '') + '"></div>', 'full') +
        '</form></section>' +
        '<section class="k-section of-ads"><h4>' + icon('sparkles') + 'Reclame · Creative</h4>' +
          '<div class="of-flags">' + K.toggle('ads', o.ads, 'Promovată în reclame (Creative face creative doar pentru ofertele bifate)') + '</div>' +
          '<form class="k-form" data-mk>' +
          K.field('Nume în reclamă', '<input name="adName" maxlength="120" value="' + esc(o.adName) + '" placeholder="ex: LipoSonix · 2 zone la preț de una">', 'full') +
          K.field('Mecanica ofertei', '<input name="mechanic" value="' + esc(o.mechanic) + '" placeholder="ex: 1+1: 2 zone la prețul uneia">', 'full') +
          K.field('Rezultatul dorit de clientă', '<input name="dreamOutcome" value="' + esc(o.dreamOutcome) + '" placeholder="ex: talie mai definită, haine care vin mai bine">', 'full') +
          K.field('Cum funcționează (simplu)', '<input name="mechanism" value="' + esc(o.mechanism) + '">', 'full') +
          K.field('Obiecții eliminate (una pe linie)', '<textarea name="objections" rows="3">' + esc(lines(o.objections)) + '</textarea>') +
          K.field('Zone (una pe linie)', '<textarea name="zones" rows="3">' + esc(lines(o.zones)) + '</textarea>') +
          K.field('Ce include', '<input name="includes" value="' + esc(o.includes) + '">') +
          K.field('Aparat', '<input name="device" value="' + esc(o.device) + '">') +
          K.field('Garanție', '<input name="guarantee" value="' + esc(o.guarantee) + '" placeholder="Doar dacă există (azi: doar la epilare)">', 'full', 'Creative pune garanția doar la ofertele care o au aici.') +
          K.field('Note pentru Creative', '<textarea name="notes" rows="2">' + esc(o.notes) + '</textarea>', 'full') +
          '</form></section>',
      footer: (src ? '<button type="button" class="k-btn is-danger is-sm" data-del>' + icon('trash') + 'Șterge</button>' : '') + '<span class="k-grow"></span><button type="button" class="k-btn" data-cancel>Renunță</button><button type="button" class="k-btn is-accent" data-save>' + icon('check') + (src ? 'Salvează' : 'Publică oferta') + '</button>',
      onMount(el) {
        const site = el.querySelector('[data-site]'), mk = el.querySelector('[data-mk]');
        const collect = () => {
          const s = K.formValues(site), m = K.formValues(mk);
          const ads = el.querySelector('.of-ads input[name=ads]').checked;
          const split = (v) => String(v || '').split('\n').map((x) => x.trim()).filter(Boolean);
          return Object.assign(o, s, m, {
            priceNew: Number(s.priceNew) || 0, priceOld: Number(s.priceOld) || 0, ads,
            locations: Object.keys(LOC).filter((l) => s['loc_' + l]), objections: split(m.objections), zones: split(m.zones),
          });
        };
        const preview = () => { const x = collect(); el.querySelector('[data-preview]').innerHTML = '<div class="of-grid is-single">' + offerCard(Object.assign({ id: 'preview' }, x)).replace('draggable="true"', '') + '</div><span class="k-muted">Previzualizare, așa arată cardul în listă.</span>'; };
        preview();
        el.addEventListener('input', preview);
        el.addEventListener('change', preview);
        el.querySelector('.of-imgs').addEventListener('click', (ev) => {
          const b = ev.target.closest('[data-img]'); if (!b) return;
          el.querySelectorAll('[data-img]').forEach((x) => x.classList.toggle('is-on', x === b));
          site.querySelector('input[name=imageKey]').value = b.dataset.img; preview();
        });
        el.querySelector('[data-cancel]').addEventListener('click', () => d.close());
        const del = el.querySelector('[data-del]');
        if (del) del.addEventListener('click', async () => {
          if (!(await K.ui().confirm({ title: 'Ștergi oferta?', message: '„' + src.title + '” dispare de pe site, din portal și din Creative. Dacă e doar temporară, dezactiveaz-o.', confirmText: 'Șterge', danger: true }))) return;
          try { const j = await K.api('/api/portal-offers', { action: 'delete', id: src.id }); O.list = j.offers; d.close(); renderOffers(); K.reload(); K.ui().toast('Ofertă ștearsă.', 'success'); }
          catch (err) { K.ui().toast(K.errText(err), 'error'); }
        });
        el.querySelector('[data-save]').addEventListener('click', (ev) => K.busy(ev.currentTarget, async () => {
          const x = collect();
          if (!x.title) { K.ui().toast('Completează titlul.', 'error'); return; }
          if (!(x.priceNew > 0)) { K.ui().toast('Completează prețul nou.', 'error'); return; }
          if (x.priceOld && x.priceOld < x.priceNew) { K.ui().toast('Prețul vechi e mai mic decât cel nou.', 'error'); return; }
          if (!x.locations.length) { K.ui().toast('Alege cel puțin o locație.', 'error'); return; }
          try {
            const body = Object.assign(siteFields(x), { priceOld: x.priceOld || x.priceNew }, src ? { action: 'update', id: src.id, marketing: marketingFields(x) } : Object.assign({ action: 'create' }, marketingFields(x)));
            const j = await K.api('/api/portal-offers', body);
            O.list = j.offers; d.close(); renderOffers(); K.reload();
            K.ui().toast(src ? 'Ofertă salvată, e live pe site.' : 'Ofertă publicată pe site.', 'success');
          } catch (err) { K.ui().toast(K.errText(err), 'error'); }
        }));
      },
    });
  }
  K.section('oferte', { mount: mountOffers, show() { if (O.list) renderOffers(); loadOffers(); } });

  // =====================================================================================
  // INTEGRĂRI
  // =====================================================================================
  let ipanel;
  function mountIntegrations(p) {
    ipanel = p;
    ipanel.classList.add('k-panel', 'st');
    ipanel.innerHTML = '<div class="k-head"><div><div class="k-eyebrow">Admin</div><h2>Integrări</h2><p class="k-lede">Ce e conectat la portal: leadurile din Facebook, WhatsApp, Creative și site-ul.</p></div></div><div data-body></div>';
  }
  function renderIntegrations() {
    if (!ipanel) return;
    const body = ipanel.querySelector('[data-body]');
    body.innerHTML = '<div class="st-integrations">' +
      '<section class="k-card st-int"><div class="st-int-head"><span class="k-icon-chip" style="background:rgba(24,119,242,.12);color:#1877f2">' + icon('facebook') + '</span><div><b>Facebook Lead Ads</b><span>Leadurile din formulare intră automat în Pipeline, cu procedura și orașul. Adminul și recepția primesc pe loc o notificare.</span></div></div><div data-fb><div class="k-skel" style="height:44px"></div></div><div class="st-forms-box" data-forms></div></section>' +
      '<section class="k-card st-int"><div class="st-int-head"><span class="k-icon-chip is-good">' + icon('chat') + '</span><div><b>WhatsApp Business</b><span>Mesajele clientelor în „Mesaje” și trimiterea automată a confirmărilor și a reminderelor.</span></div></div><div data-wa><div class="k-skel" style="height:44px"></div></div></section>' +
      '<section class="k-card st-int"><div class="st-int-head"><span class="k-icon-chip is-accent">' + icon('sparkles') + '</span><div><b>Creative</b><span>Mașina de creative citește ofertele direct din secțiunea Oferte.</span></div></div>' +
        '<div class="st-int-row"><span class="k-tag is-good">' + icon('check') + 'Conectat</span><button type="button" class="k-btn is-outline is-sm" data-goto="creative">Deschide Creative' + icon('arrow') + '</button></div></section>' +
      '<section class="k-card st-int"><div class="st-int-head"><span class="k-icon-chip is-info">' + icon('globe') + '</span><div><b>Site centrul360.com</b><span>Paginile Oferte și Prețuri se actualizează din secțiunea Oferte, în câteva minute.</span></div></div>' +
        '<div class="st-int-row"><span class="k-tag is-good">' + icon('check') + 'Sincronizat</span><a class="k-btn is-outline is-sm" href="https://centrul360.com/oferte" target="_blank" rel="noopener">Vezi pagina' + icon('arrow') + '</a></div></section></div>';
    body.querySelectorAll('[data-goto]').forEach((x) => x.addEventListener('click', () => K.go(x.dataset.goto)));
    loadFb(body.querySelector('[data-fb]'));
    (async () => {
      const box = body.querySelector('[data-wa]');
      const formsBox = body.querySelector('[data-forms]');
      try {
        const j = await K.api('/api/portal-integrations');
        box.innerHTML = j.whatsapp
          ? '<div class="st-int-row"><span class="k-tag is-good">' + icon('check') + 'Conectat</span><button type="button" class="k-btn is-outline is-sm" data-goto="mesaje">Deschide Mesaje' + icon('arrow') + '</button></div>'
          : '<div class="st-int-row"><span class="k-tag is-warn">' + icon('alert') + 'Neconectat</span><span class="k-muted">Până la conectare, mesajele de trimis apar ca sarcini la recepție.</span></div>';
        box.querySelectorAll('[data-goto]').forEach((x) => x.addEventListener('click', () => K.go(x.dataset.goto)));
        paintForms(formsBox, j);
      } catch (e) { box.innerHTML = '<span class="k-muted">Nu am putut verifica.</span>'; formsBox.innerHTML = ''; }
    })();
  }

  // Facebook lead forms: each lead arrives with its procedure and city. They're read from the form's
  // name (and the ad's); a form whose name doesn't say them gets them set here.
  function paintForms(box, j) {
    const forms = j.fbForms || [];
    const offerName = (id) => ((j.offers || []).find((o) => o.id === id) || {}).title || '';
    if (!forms.length) {
      box.innerHTML = '<p class="k-muted st-forms-empty">' + icon('info') + 'Formularele apar aici după primul lead din fiecare. Procedura și orașul se citesc din numele formularului și al reclamei; dacă nu reies de acolo, le alegi aici.</p>';
      return;
    }
    box.innerHTML = '<div class="st-forms-head"><b>Formulare</b><span class="k-muted">Procedura și orașul cu care intră leadurile din fiecare formular.</span></div>' +
      '<div class="st-forms">' + forms.map((f) => {
        const det = f.detected || {};
        const autoOffer = det.offerId && offerName(det.offerId) ? 'Automat: ' + offerName(det.offerId) : 'Automat (nedetectată)';
        const autoCity = (det.location || 'Timișoara') + ' (auto)';
        return '<div class="st-form" data-form="' + esc(f.id) + '"><div class="st-form-name"><b>' + esc(f.name || 'Formular ' + f.id) + '</b><small>' + K.plural(f.leads, 'lead', 'leaduri') + (f.lastAt ? ' · ultimul ' + esc(K.ago(f.lastAt)) : '') + '</small></div>' +
          '<select data-ff="offerId" aria-label="Procedura">' + K.options([['', autoOffer]].concat((j.offers || []).map((o) => [o.id, o.title])), f.offerId) + '</select>' +
          '<select data-ff="location" aria-label="Orașul">' + K.options([['', autoCity], ['Timișoara', 'Timișoara'], ['Arad', 'Arad']], f.location) + '</select></div>';
      }).join('') + '</div>';
    box.addEventListener('change', async (e) => {
      const row = e.target.closest('[data-form]');
      if (!row) return;
      const v = (k) => row.querySelector('[data-ff="' + k + '"]').value;
      try {
        await K.api('/api/portal-integrations', { action: 'fb_form', id: row.dataset.form, offerId: v('offerId'), location: v('location') });
        K.ui().toast('Salvat. Leadurile noi din formular vin așa.', 'success');
      } catch (err) { K.ui().toast(K.errText(err), 'error'); }
    });
  }
  // Facebook: one button logs in with Facebook (Meta's own window); back here, the admin picks the
  // clinic's Page (an account can manage several, e.g. the salon's too) and the ad account, which
  // can also be typed by hand when Facebook doesn't list it.
  const FB_ERR = { login_expired: 'Logarea a expirat. Apasă din nou „Conectează cu Facebook”.', page_not_found: 'Pagina nu mai e disponibilă. Loghează-te din nou.',
    subscribe_failed: 'Facebook n-a permis primirea leadurilor pe Pagina asta: lipsește permisiunea pages_manage_metadata sau nu ești admin pe Pagină. Folosește „Conectare cu token”.', invalid_ad_account: 'ID-ul contului de reclame are doar cifre (ex. 1234567890 sau act_1234567890).',
    token_invalid: 'Tokenul nu e valid sau a expirat.', no_pages: 'Contul ăsta de Facebook nu administrează nicio Pagină.',
    invalid_app_id: 'App ID are doar cifre.', invalid_app_secret: 'App secret are litere și cifre (32 de caractere), copiază-l din nou.', invalid_config_id: 'Configuration ID are doar cifre.', missing_app_secret: 'Lipește și App secret pentru aplicația asta.' };
  const adOptions = (list, sel) => K.options([['', 'Niciunul încă']].concat((list || []).map((a) => [a.id, a.name + (a.business ? ' · ' + a.business : '')])).concat([['__manual', 'Nu e în listă, scriu ID-ul']]), sel);
  const adManual = '<input data-ad-manual hidden placeholder="ID cont de reclame, ex. 1234567890" inputmode="numeric" maxlength="24">';
  function bindAdSelect(root) {
    const sel = root.querySelector('[data-ad]'), man = root.querySelector('[data-ad-manual]');
    if (sel && man) sel.addEventListener('change', () => { man.hidden = sel.value !== '__manual'; if (!man.hidden) man.focus(); });
  }
  const adValue = (root) => { const sel = root.querySelector('[data-ad]'); return sel && sel.value === '__manual' ? root.querySelector('[data-ad-manual]').value.trim() : (sel ? sel.value : ''); };

  // The Meta app the portal uses (App ID + secret + the "Facebook Login for Business" configuration),
  // pasted here instead of in Vercel, and the two webhook values to paste back in Meta.
  function appHtml(app, open) {
    const copy = (label, val) => '<div class="st-fb-copy"><span>' + esc(label) + '</span><code>' + esc(val || '-') + '</code>' + (val ? '<button type="button" class="k-btn is-ghost is-sm" data-copy="' + esc(val) + '">' + icon('copy') + 'Copiază</button>' : '') + '</div>';
    return '<details class="st-fb-app"' + (open ? ' open' : '') + '><summary>' + icon('key') + '<b>Aplicația Meta</b><span class="k-muted">' + (app.appId ? 'ID ' + esc(app.appId) + (app.fromPortal ? '' : ' (din Vercel)') : 'nesetată') + '</span></summary>' +
      '<form class="st-fb-appform" data-fb-app autocomplete="off">' +
        '<label class="k-field full"><span>App ID</span><input name="appId" inputmode="numeric" value="' + esc(app.appId || '') + '" placeholder="ex. 2177971149814780"></label>' +
        '<label class="k-field full"><span>App secret</span><input name="appSecret" type="password" autocomplete="new-password" placeholder="' + (app.hasSecret && app.fromPortal ? 'salvat, lasă gol ca să rămână' : 'din App settings → Basic → App secret → Show') + '"></label>' +
        '<label class="k-field full"><span>Configuration ID (Facebook Login for Business)</span><input name="configId" inputmode="numeric" value="' + esc(app.configId || '') + '" placeholder="din Facebook Login for Business → Configurations"></label>' +
        '<button type="submit" class="k-btn is-primary is-sm">' + icon('check') + 'Salvează aplicația</button></form>' +
      '<div class="st-fb-copies"><p class="k-muted">De pus în Meta:</p>' +
        copy('Valid OAuth Redirect URI', app.redirectUri) +
        copy('Webhooks → Callback URL', app.webhookUrl) +
        copy('Webhooks → Verify token', app.verifyToken) + '</div></details>';
  }
  function bindApp(root, reload) {
    const f = root.querySelector('[data-fb-app]');
    if (!f) return;
    f.addEventListener('submit', async (e) => {
      e.preventDefault();
      const v = K.formValues(f);
      try {
        await K.api('/api/fb-connection-status', { action: 'app', appId: v.appId, appSecret: v.appSecret, configId: v.configId });
        K.ui().toast('Aplicația Meta e salvată. Acum apasă „Conectează cu Facebook”.', 'success');
        reload();
      } catch (err) { K.ui().toast(FB_ERR[err.code] || K.errText(err), 'error'); }
    });
    root.querySelectorAll('[data-copy]').forEach((b) => b.addEventListener('click', async () => {
      try { await navigator.clipboard.writeText(b.dataset.copy); K.ui().toast('Copiat.', 'success'); } catch (x) { K.ui().toast('Selectează textul și copiază-l de mână.', 'error'); }
    }));
  }

  async function loadFb(box) {
    let d;
    try { d = await K.api('/api/fb-connection-status'); } catch (e) { box.innerHTML = '<span class="k-muted">Nu am putut verifica starea conexiunii.</span>'; return; }
    const addApp = () => { box.insertAdjacentHTML('beforeend', appHtml(d.app || {}, false)); bindApp(box, () => loadFb(box)); };
    if (d.notConfigured) {
      box.innerHTML = '<p class="k-muted st-fb-intro">Pune aici datele aplicației Meta (developers.facebook.com), apoi apare butonul de logare.</p>' + appHtml(d.app || {}, true);
      bindApp(box, () => loadFb(box));
      return;
    }
    const fail = (err) => K.ui().toast(FB_ERR[err.code] || K.errText(err), 'error');

    // several Pages after the login: pick the clinic's
    if (d.pending && d.pending.pages.length) {
      const p = d.pending;
      // the clinic's Page / ad account picked in advance when the names say so
      const guessPage = (p.pages.find((x) => /centrul|360/i.test(x.name)) || (p.pages.length === 1 ? p.pages[0] : {})).id;
      const guessAd = (p.adAccounts.find((x) => /centru/i.test(x.name)) || (p.adAccounts.length === 1 ? p.adAccounts[0] : {})).id || '';
      box.innerHTML = '<div class="st-fb-pick"><b>Alege Pagina clinicii</b><span class="k-muted">Contul tău administrează ' + K.plural(p.pages.length, 'Pagină', 'Pagini') + '. Leadurile vin doar din cea aleasă.</span>' +
        '<div class="st-fb-pages">' + p.pages.map((x, i) => '<label class="st-fb-page"><input type="radio" name="fbpage" value="' + esc(x.id) + '"' + (x.id === guessPage ? ' checked' : '') + '><span>' + icon('facebook') + esc(x.name) + '</span></label>').join('') + '</div>' +
        '<label class="k-field full"><span>Cont de reclame (pentru publicarea reclamelor, mai târziu)</span><select data-ad>' + adOptions(p.adAccounts, guessAd) + '</select>' + adManual + '</label>' +
        '<div class="st-int-row"><button type="button" class="k-btn is-primary is-sm" data-fb-choose>' + icon('check') + 'Conectează Pagina aleasă</button></div></div>';
      bindAdSelect(box);
      addApp();
      box.querySelector('[data-fb-choose]').addEventListener('click', (e) => K.busy(e.currentTarget, async () => {
        const pageId = (box.querySelector('input[name=fbpage]:checked') || {}).value;
        if (!pageId) { K.ui().toast('Alege Pagina clinicii.', 'error'); return; }
        const manual = box.querySelector('[data-ad]').value === '__manual';
        const ad = adValue(box);
        try {
          let r = await K.api('/api/fb-connection-status', { action: 'choose', pageId, adAccountId: manual ? '' : ad });
          if (manual && ad) r = await K.api('/api/fb-connection-status', { action: 'ad_account', adAccountId: ad });
          K.ui().toast('Conectat la ' + (r.pageName || 'Pagină') + '. Leadurile noi intră singure.', 'success');
          loadFb(box);
        } catch (err) { fail(err); }
      }));
      return;
    }

    if (d.connected) {
      const many = (d.pages || []).length > 1;
      // the check that answers "why didn't the lead arrive?"
      const sub = d.subscription || {};
      const diag = '<div class="st-fb-diag"><div class="st-fb-sub ' + (sub.ok ? 'is-ok' : 'is-bad') + '">' + icon(sub.ok ? 'checkCircle' : 'alert') +
          '<span>' + (sub.ok ? 'Pagina trimite leadurile la portal.' + (sub.since ? ' Abonată ' + esc(K.ago(sub.since)) + '.' : '') : 'Pagina nu trimite leadurile la portal' + (sub.error ? ': ' + esc(sub.error) : '.')) + '</span>' +
          (sub.ok ? '' : '<button type="button" class="k-btn is-primary is-sm" data-fb-resub>' + icon('refresh') + 'Abonează Pagina</button>') + '</div>' +
        (sub.apps && sub.apps.length ? '<small class="k-muted">Aplicații care primesc leadurile Paginii: ' + esc(sub.apps.join(', ')) + '</small>' : '') +
        '<div class="st-fb-log"><div class="st-fb-log-head"><b>Ultimele livrări de la Facebook</b><button type="button" class="k-btn is-ghost is-sm" data-fb-refresh>' + icon('refresh') + 'Reîmprospătează</button></div>' +
          ((d.deliveries || []).length ? d.deliveries.map((x) => '<div class="st-fb-logrow ' + (x.ok ? 'is-ok' : 'is-bad') + '"><span>' + esc(K.ago(x.at)) + '</span><em>' + esc(x.text) + '</em></div>').join('')
            : '<p class="k-muted">Nimic încă. Un lead de test care nu apare aici nu a fost trimis de Facebook către portal.</p>') + '</div></div>';
      box.innerHTML = '<div class="st-int-row"><span class="k-tag is-good">' + icon('check') + 'Conectat la ' + esc(d.pageName || 'Pagină') + '</span>' + (d.connectedAt ? '<span class="k-muted">din ' + esc(new Date(d.connectedAt).toLocaleDateString('ro-RO')) + '</span>' : '') + '</div>' +
        '<div class="st-fb-ad"><span class="k-muted">Cont de reclame:</span> <b>' + esc(d.adAccountName || 'neales') + '</b> <button type="button" class="k-btn is-ghost is-sm" data-fb-adedit>' + icon('pen') + 'Schimbă</button></div>' +
        diag +
        '<form class="st-fb-adform" data-fb-adform hidden><select data-ad>' + adOptions(d.adAccounts, d.adAccountId) + '</select>' + adManual + '<button type="submit" class="k-btn is-primary is-sm">Salvează</button></form>' +
        '<div class="st-int-row">' + (many ? '<button type="button" class="k-btn is-outline is-sm" data-fb-repick>' + icon('refresh') + 'Altă Pagină</button>' : '') +
        '<a class="k-btn is-outline is-sm" href="/api/fb-oauth-start">' + icon('facebook') + 'Reconectează</a><button type="button" class="k-btn is-danger is-sm" data-fbx>Deconectează</button></div>' +
        (many ? '<div class="st-fb-pages" data-fb-pages hidden>' + d.pages.map((x) => '<button type="button" class="st-fb-page' + (x.id === d.pageId ? ' is-on' : '') + '" data-page="' + esc(x.id) + '">' + icon('facebook') + esc(x.name) + '</button>').join('') + '</div>' : '');
      bindAdSelect(box);
      addApp();
      box.querySelector('[data-fb-adedit]').addEventListener('click', () => { const f = box.querySelector('[data-fb-adform]'); f.hidden = !f.hidden; });
      box.querySelector('[data-fb-refresh]').addEventListener('click', () => loadFb(box));
      const rs = box.querySelector('[data-fb-resub]');
      if (rs) rs.addEventListener('click', () => K.busy(rs, async () => {
        try { await K.api('/api/fb-connection-status', { action: 'resubscribe' }); K.ui().toast('Gata, Pagina trimite acum leadurile la portal.', 'success'); loadFb(box); }
        catch (err) { K.ui().toast('Facebook a refuzat abonarea' + (err.data && err.data.message ? ': ' + err.data.message : '') + '. Încearcă „Conectare cu token”.', 'error'); }
      }));
      box.querySelector('[data-fb-adform]').addEventListener('submit', async (e) => {
        e.preventDefault();
        try { await K.api('/api/fb-connection-status', { action: 'ad_account', adAccountId: adValue(box) }); K.ui().toast('Contul de reclame e salvat.', 'success'); loadFb(box); } catch (err) { fail(err); }
      });
      const rp = box.querySelector('[data-fb-repick]');
      if (rp) rp.addEventListener('click', () => { const l = box.querySelector('[data-fb-pages]'); l.hidden = !l.hidden; });
      box.querySelectorAll('[data-page]').forEach((b) => b.addEventListener('click', () => K.busy(b, async () => {
        try { await K.api('/api/fb-connection-status', { action: 'choose', pageId: b.dataset.page, adAccountId: d.adAccountId }); K.ui().toast('Pagina s-a schimbat.', 'success'); loadFb(box); } catch (err) { fail(err); }
      })));
      box.querySelector('[data-fbx]').addEventListener('click', async () => {
        if (!(await K.ui().confirm({ title: 'Deconectezi Facebook?', message: 'Leadurile noi din formulare nu mai intră în Pipeline până reconectezi.', confirmText: 'Deconectează', danger: true }))) return;
        try { await K.api('/api/fb-disconnect', {}); K.ui().toast('Facebook deconectat.', 'success'); loadFb(box); } catch (err) { fail(err); }
      });
      return;
    }

    box.innerHTML = '<div class="st-fb-login"><a class="k-btn is-fb" href="/api/fb-oauth-start">' + icon('facebook') + 'Conectează cu Facebook</a>' +
      '<span class="k-muted">Te loghezi în fereastra Facebook, alegi firma (ex. Hair Revive), Pagina clinicii și contul de reclame, apoi revii aici.</span></div>' +
      '<details class="st-fb-manual"><summary>Nu merge logarea? Conectare cu token</summary><form class="st-manual" data-manual><textarea name="t" rows="3" placeholder="User Access Token din Graph API Explorer"></textarea><button type="submit" class="k-btn is-primary is-sm">Conectează cu acest token</button></form></details>';
    box.querySelector('[data-manual]').addEventListener('submit', async (e) => {
      e.preventDefault();
      const tok = e.target.t.value.trim(); if (!tok) return;
      try {
        const r = await K.api('/api/fb-manual-connect', { userAccessToken: tok });
        K.ui().toast(r.choose ? 'Alege acum Pagina clinicii.' : 'Conectat la ' + (r.pageName || 'Pagină') + '.', 'success');
        // a token from another app can't be made permanent: the leads would stop within the hour
        if (r.shortLived) setTimeout(() => K.ui().toast('Atenție: tokenul nu e de la aplicația salvată aici, așa că expiră într-o oră. În Graph API Explorer alege aceeași aplicație și refă tokenul.', 'error'), 600);
        loadFb(box);
      }
      catch (err) { fail(err); }
    });
    addApp();
  }
  K.section('integrari', { mount: mountIntegrations, show: renderIntegrations });

  // Facebook redirects back to /portal?fb=connected|error after OAuth.
  (function fbReturn() {
    const params = new URLSearchParams(location.search);
    const flag = params.get('fb');
    if (!flag) return;
    params.delete('fb');
    const qs = params.toString();
    history.replaceState(null, '', location.pathname + (qs ? '?' + qs : '') + '#integrari');
    const msg = { connected: ['Facebook conectat. Leadurile noi intră singure.', 'success'], choose: ['Alege acum Pagina clinicii, în Integrări → Facebook.', 'success'], nopages: ['Contul de Facebook nu administrează nicio Pagină.', 'error'], nosub: ['Facebook n-a lăsat portalul să primească leadurile Paginii: lipsește permisiunea pages_manage_metadata. Folosește „Conectare cu token”.', 'error'] }[flag] || ['Conectarea la Facebook a eșuat.', 'error'];
    setTimeout(() => K.ui().toast(msg[0], msg[1]), 1200);
  })();
})();
