// Centrul360 portal — owner sections: Aprobări, Echipa, Oferte, Setări.
// Aprobări: decision cards (A / R keys), optional reason on reject, bulk approve.
// Echipa: one card per person (role, month numbers, goal rings); a drawer to edit profile,
// reset password, (de)activate, and set up to 4 goals with a bonus each — what the employee
// then sees as "Bonusurile mele". Oferte: the ONE offer list (website + portal + Creative) as
// site-like cards with live preview, toggles, drag-to-reorder and the marketing brief Creative
// writes ads from. Setări: commission rules, monthly bonuses, integrations.
(function () {
  'use strict';
  const K = window.K;
  const { esc, icon } = K;
  const cat = (k) => (K.cats && K.cats[k]) || k || '';
  const ROLES = [['receptie', 'Recepție'], ['cosmetician', 'Cosmeticiană'], ['admin', 'Admin']];
  const LOCS = [['Timișoara', 'Timișoara'], ['Arad', 'Arad']];
  const rateOf = (c) => { const cfg = K.data.admin.config; return c === 'retail' ? cfg.retailRate : ((cfg.commissionRates || {})[c] || 0); };
  const monthOf = K.monthOf;

  // =====================================================================================
  // APROBĂRI
  // =====================================================================================
  let apanel;
  function mountApprovals(p) {
    apanel = p;
    apanel.classList.add('k-panel', 'ad');
    apanel.innerHTML = '<div class="k-head"><div><div class="k-eyebrow">Admin</div><h2>Aprobări</h2><p class="k-lede">Vânzările logate de echipă pentru comision. Aprobi → comisionul se calculează cu regulile de acum și intră la obiective.</p></div>' +
      '<div class="k-head-actions" data-head></div></div><div data-body></div>';
    apanel.addEventListener('click', onApprovalClick);
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
    const totalComm = pend.reduce((a, s) => a + Number(s.amount || 0) * rateOf(s.category) / 100, 0);
    apanel.querySelector('[data-head]').innerHTML = pend.length > 1 ? '<button type="button" class="k-btn is-good" data-all>' + icon('check') + 'Aprobă toate (' + pend.length + ')</button>' : '';
    const approvedMonth = K.data.admin.allSales.filter((s) => s.status === 'approved' && monthOf(s.date) === month);
    apanel.querySelector('[data-body]').innerHTML =
      '<div class="k-grid c3 k-stagger" style="margin-bottom:1rem">' +
        '<div class="k-stat is-warn"><div class="k-stat-top"><span class="k-stat-ic">' + icon('clock') + '</span>În așteptare</div><div class="k-stat-value" data-count="' + pend.length + '" data-key="ad-p">0</div><div class="k-stat-sub">' + K.lei(pend.reduce((a, s) => a + Number(s.amount || 0), 0)) + ' vândut</div></div>' +
        '<div class="k-stat is-accent"><div class="k-stat-top"><span class="k-stat-ic">' + icon('percent') + '</span>Comision de plătit dacă aprobi</div><div class="k-stat-value" data-count="' + Math.round(totalComm) + '" data-fmt="lei" data-key="ad-c">0</div><div class="k-stat-sub">după regulile de acum</div></div>' +
        '<div class="k-stat is-good"><div class="k-stat-top"><span class="k-stat-ic">' + icon('check') + '</span>Aprobate luna asta</div><div class="k-stat-value" data-count="' + approvedMonth.length + '" data-key="ad-a">0</div><div class="k-stat-sub">' + K.lei(approvedMonth.reduce((a, s) => a + Number(s.commission || 0), 0)) + ' comision</div></div>' +
      '</div>' +
      (pend.length ? '<p class="ad-keys">' + icon('info') + 'Scurtături: <kbd>A</kbd> aprobă, <kbd>R</kbd> respinge prima vânzare din listă.</p><div class="ad-list">' + pend.map((s) => {
        const r = rateOf(s.category);
        return '<article class="ad-card" data-sale="' + esc(s.id) + '">' + K.avatar(s.employeeName, 44) +
          '<div class="ad-main"><div class="ad-top"><b>' + esc(s.employeeName) + '</b><span class="k-tag">' + icon('pin') + esc(s.employeeLocation) + '</span><span class="k-muted">' + esc(K.dateLong(s.date)) + '</span></div>' +
          '<div class="ad-what">' + esc(s.treatment) + '</div><div class="ad-sub">' + esc(cat(s.category)) + (s.client ? ' · ' + esc(s.client) : '') + (s.note ? ' · „' + esc(s.note) + '”' : '') + '</div></div>' +
          '<div class="ad-money"><b>' + K.lei(s.amount, 2) + '</b><span>comision ' + K.lei(Number(s.amount) * r / 100, 2) + ' · ' + r + '%</span></div>' +
          '<div class="ad-actions"><button type="button" class="k-btn is-danger" data-reject="' + esc(s.id) + '">' + icon('x') + 'Respinge</button><button type="button" class="k-btn is-good" data-approve="' + esc(s.id) + '">' + icon('check') + 'Aprobă</button></div></article>';
      }).join('') + '</div>'
        : '<section class="k-card">' + K.empty('shield', 'Nimic de aprobat', 'Când cineva din echipă loghează o vânzare, apare aici și în meniu, cu numărul în așteptare.') + '</section>') +
      (decided.length ? '<section class="k-card" style="margin-top:1rem"><div class="k-card-head"><h3>' + icon('clock') + 'Decise recent</h3></div><div class="k-list">' + decided.map((s) =>
        '<div class="k-row">' + K.avatar(s.employeeName, 30) + '<div class="k-row-main"><div class="k-row-title">' + esc(s.treatment) + '</div><div class="k-row-sub">' + esc(s.employeeName) + ' · ' + esc(K.dateShort(s.date)) + ' · ' + K.lei(s.amount) + (s.decisionNote ? ' · „' + esc(s.decisionNote) + '”' : '') + '</div></div>' +
        '<div class="k-row-end"><span class="k-tag is-' + (s.status === 'approved' ? 'good' : 'bad') + '">' + (s.status === 'approved' ? 'Aprobată · ' + K.lei(s.commission, 2) : 'Respinsă') + '</span></div></div>').join('') + '</div></section>' : '');
    K.countAll(apanel);
  }
  async function decide(id, decision) {
    const card = apanel.querySelector('[data-sale="' + id + '"]');
    let reason = '';
    if (decision === 'reject') {
      reason = await K.ui().prompt({ title: 'Respingi vânzarea?', message: 'Spune-i pe scurt de ce — vede motivul în „Comisionul meu”.', label: 'Motiv (opțional)', confirmText: 'Respinge' });
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
    if (e.target.closest('[data-all]')) {
      const pend = K.data.admin.pendingSales;
      if (!(await K.ui().confirm({ title: 'Aprobi toate cele ' + pend.length + ' vânzări?', message: 'Comisionul se calculează pentru fiecare cu regulile de acum.', confirmText: 'Aprobă toate' }))) return;
      for (const s of pend) { try { await K.api('/api/portal-approve', { saleId: s.id, decision: 'approve' }); } catch (err) { /* already decided elsewhere */ } }
      K.ui().toast('Toate vânzările au fost aprobate.', 'success');
      K.reload();
    }
  }
  K.section('aprobari', { mount: mountApprovals, show: renderApprovals, data() { if (apanel && K.isActive('aprobari')) renderApprovals(); } });

  // =====================================================================================
  // ECHIPA
  // =====================================================================================
  const METRICS = {
    comision_aprobat_luna: { label: 'Comision aprobat (luna)', ron: true, roles: ['cosmetician', 'receptie'] },
    vanzari_aprobate_luna: { label: 'Vânzări aprobate (luna)', roles: ['cosmetician', 'receptie'] },
    programari_finalizate_luna: { label: 'Programări finalizate (luna)', roles: ['cosmetician'] },
    incasari_atribuite_luna: { label: 'Încasări din tratamentele ei (luna)', ron: true, roles: ['cosmetician'] },
    leaduri_contactate_luna: { label: 'Leaduri contactate (luna)', roles: ['receptie'] },
    leaduri_programate_luna: { label: 'Leaduri programate din pipeline (luna)', roles: ['receptie'] },
    incasari_inregistrate_luna: { label: 'Încasări înregistrate de ea (luna)', ron: true, roles: ['receptie'] },
    programari_confirmate_azi: { label: 'Programări confirmate azi', roles: ['cosmetician'] },
    programari_anulate_azi: { label: 'Programări anulate azi', roles: ['cosmetician'] },
    manual: { label: 'Manual (valoare introdusă de tine)', roles: ['cosmetician', 'receptie'] },
  };
  let epanel;
  function mountTeam(p) {
    epanel = p;
    epanel.classList.add('k-panel', 'ad');
    epanel.innerHTML = '<div class="k-head"><div><div class="k-eyebrow">Admin</div><h2>Echipa</h2><p class="k-lede">Fiecare om, cu cifrele lunii, obiectivele și bonusurile lui. Click pe un card ca să schimbi ceva.</p></div>' +
      '<div class="k-head-actions"><button type="button" class="k-btn is-accent" data-new>' + icon('userPlus') + 'Angajat nou</button></div></div><div data-body></div>';
    epanel.addEventListener('click', (e) => {
      if (e.target.closest('[data-new]')) return openNewEmployee();
      const c = e.target.closest('[data-emp]');
      if (c) openEmployee(c.dataset.emp);
    });
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
      const goals = e.goals || [];
      const kv = e.role === 'receptie'
        ? [['Încasări', K.lei(st.recorded)], ['Comision', K.lei(st.comm)], ['De aprobat', st.pending]]
        : [['Comision', K.lei(st.comm)], ['Tratamente', K.lei(st.performed)], ['De aprobat', st.pending]];
      return '<button type="button" class="ad-emp' + (e.active ? '' : ' is-off') + '" data-emp="' + esc(e.id) + '"><div class="ad-emp-top">' + K.avatar(e.name, 46) +
        '<div><b>' + esc(e.name) + '</b><span><span class="k-tag is-' + (e.role === 'receptie' ? 'info' : e.role === 'admin' ? 'accent' : 'good') + '">' + esc(K.roleLabel(e.role)) + '</span>' + esc(e.location) + (e.active ? '' : ' · dezactivat') + '</span></div></div>' +
        '<dl class="ad-emp-kv" title="Luna curentă">' + kv.map(([k, v]) => '<div><dt>' + k + '</dt><dd>' + v + '</dd></div>').join('') + '</dl>' +
        (goals.length ? '<div class="ad-emp-goals">' + goals.map((g) => {
          const pct = g.target > 0 ? Math.min(100, ((g.current || 0) / g.target) * 100) : 0;
          return '<div class="ad-goal-mini" title="' + esc(g.title) + '">' + K.ring(pct, { size: 40, stroke: 4.5, inner: '<b>' + Math.round(pct) + '</b>' }) + '<span>' + esc(g.title) + (g.reward ? '<em>' + K.lei(g.reward) + '</em>' : '') + '</span></div>';
        }).join('') + '</div>' : '<div class="ad-emp-empty">' + icon('target') + 'Fără obiective — adaugă din card</div>') + '</button>';
    };
    epanel.querySelector('[data-body]').innerHTML =
      (active.length ? '<div class="ad-emps k-stagger">' + active.map(card).join('') + '</div>' : '<section class="k-card">' + K.empty('users', 'Niciun angajat încă', 'Adaugă primul om din echipă — primește username și parolă pentru portal.', '<button type="button" class="k-btn is-primary" data-new>' + icon('userPlus') + 'Angajat nou</button>') + '</section>') +
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
        '<div class="ad-tabs">' + K.seg('emptab', [['goals', 'Obiective & bonusuri', 'target'], ['profile', 'Profil & acces', 'user'], ['sales', 'Vânzări', 'receipt']], 'goals', 'is-big') + '</div>' +
        '<div data-pane="goals"><p class="k-muted" style="margin:0 0 .7rem">Până la 4 obiective. Tot ce are bonus apare la ' + esc(e.name.split(' ')[0]) + ' în „Bonusurile mele”, cu progres live.</p><div data-goals></div>' +
          '<button type="button" class="k-btn is-outline rs-add" data-addg>' + icon('plus') + 'Adaugă obiectiv</button></div>' +
        '<div data-pane="profile" hidden><form class="k-form" data-profile>' +
          K.field('Nume', '<input name="name" value="' + esc(e.name) + '" maxlength="100">', 'full') +
          K.field('Rol', K.seg('role', ROLES, e.role, 'is-big'), 'full') +
          K.field('Locație', K.seg('location', LOCS, e.location, 'is-big'), 'full') + '</form>' +
          '<div class="ad-access"><button type="button" class="k-btn is-outline" data-pass>' + icon('key') + 'Resetează parola</button>' +
          '<button type="button" class="k-btn ' + (e.active ? 'is-danger' : 'is-good') + '" data-toggle>' + icon('power') + (e.active ? 'Dezactivează contul' : 'Reactivează contul') + '</button></div>' +
          '<p class="k-muted">Dezactivarea blochează logarea, dar păstrează istoricul și comisioanele.</p></div>' +
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
          box.innerHTML = goals.length ? goals.map((g, i) => goalRowHtml(g, i, e.role)).join('') : '<div class="ad-emp-empty" style="margin-bottom:.7rem">' + icon('target') + 'Niciun obiectiv. Adaugă unul — de ex. un bonus de 200 lei la 25 de programări.</div>';
          el.querySelector('[data-addg]').disabled = goals.length >= 4;
        };
        paint();
        box.addEventListener('change', (ev) => { if (ev.target.dataset.f === 'metric') { const row = ev.target.closest('[data-g]'); row.querySelector('[data-cur]').style.display = ev.target.value === 'manual' ? '' : 'none'; } });
        el.querySelector('[data-addg]').addEventListener('click', () => { readGoals(); goals.push({ title: '', metric: e.role === 'receptie' ? 'leaduri_programate_luna' : 'comision_aprobat_luna', target: '', reward: '' }); paint(); const t = box.querySelectorAll('[data-f="title"]'); t[t.length - 1].focus(); });
        box.addEventListener('click', (ev) => { const rm = ev.target.closest('[data-rmg]'); if (rm) { readGoals(); goals.splice(+rm.dataset.rmg, 1); paint(); } });
        el.querySelector('input[name=emptab]').addEventListener('change', (ev) => {
          el.querySelectorAll('[data-pane]').forEach((p) => { p.hidden = p.dataset.pane !== ev.target.value; });
          el.querySelector('[data-save]').hidden = ev.target.value === 'sales';
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
              await K.api('/api/portal-employees', { action: 'update_details', employeeId: e.id, name: v.name, location: v.location, role: v.role });
            } else {
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
        K.field('Rol', K.seg('role', ROLES.slice(0, 2), 'receptie', 'is-big'), 'full', 'Recepția lucrează Pipeline, Calendar, Încasări și Sarcini. Cosmeticiana vede calendarul, SOP-urile și comisionul ei.') +
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
  K.section('angajati', { mount: mountTeam, show: renderTeam, data() { if (epanel && K.isActive('angajati')) renderTeam(); } });

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
    opanel.innerHTML = '<div class="k-head"><div><div class="k-eyebrow">Admin</div><h2>Oferte</h2><p class="k-lede">O singură listă pentru site (oferte.html, prețuri), recepție, comisioane și Creative. Schimbi aici — se schimbă peste tot.</p></div>' +
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
      '<div class="of-img" style="background-image:url(\'' + esc(imgUrl(o.imageKey)) + '\')">' + (disc(o) ? '<span class="of-disc">−' + disc(o) + '%</span>' : '') + (o.featured ? '<span class="of-feat">' + icon('star') + 'Pachet</span>' : '') + '</div>' +
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
        const preview = () => { const x = collect(); el.querySelector('[data-preview]').innerHTML = '<div class="of-grid is-single">' + offerCard(Object.assign({ id: 'preview' }, x)).replace('draggable="true"', '') + '</div><span class="k-muted">Previzualizare — așa arată cardul în listă.</span>'; };
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
            K.ui().toast(src ? 'Ofertă salvată — e live pe site.' : 'Ofertă publicată pe site.', 'success');
          } catch (err) { K.ui().toast(K.errText(err), 'error'); }
        }));
      },
    });
  }
  K.section('oferte', { mount: mountOffers, show() { if (O.list) renderOffers(); loadOffers(); } });

  // =====================================================================================
  // SETĂRI
  // =====================================================================================
  const ST = { tab: 'comision' };
  let spanel;
  function mountSettings(p) {
    spanel = p;
    spanel.classList.add('k-panel', 'st');
    spanel.innerHTML = '<div class="k-head"><div><div class="k-eyebrow">Admin</div><h2>Setări</h2><p class="k-lede">Regulile după care se calculează comisioanele și bonusurile, plus integrările. Oamenii se gestionează în Echipa, procedurile în SOP & Resurse.</p></div></div>' +
      '<div class="st-tabs">' + K.seg('sttab', [['comision', 'Comisioane', 'percent'], ['bonus', 'Bonusuri lunare', 'trophy'], ['integrari', 'Integrări', 'link']], ST.tab) + '</div><div data-body></div>';
    spanel.addEventListener('change', (e) => { if (e.target.name === 'sttab') { ST.tab = e.target.value; renderSettings(); } });
  }
  function renderSettings() {
    if (!spanel || !K.data || !K.data.admin) return;
    const cfg = K.data.admin.config;
    const body = spanel.querySelector('[data-body]');
    if (ST.tab === 'comision') {
      const keys = Object.keys(K.cats).filter((k) => k !== 'retail');
      body.innerHTML = '<section class="k-card"><div class="k-card-head"><h3>' + icon('percent') + 'Procent de comision pe categorie</h3><span class="k-sub">Se aplică la aprobare; vânzările deja aprobate nu se schimbă.</span></div>' +
        '<div class="st-rates">' + keys.map((k) => rateRow(k, cat(k), (cfg.commissionRates || {})[k] ?? 10)).join('') + rateRow('__retail', 'Produse retail / home-care', cfg.retailRate ?? 15) + '</div>' +
        '<div class="st-example" data-example></div><div class="k-form-actions"><button type="button" class="k-btn is-primary" data-save-rates>' + icon('check') + 'Salvează comisioanele</button></div></section>';
      const ex = () => { const v = Number(body.querySelector('[data-rate="liposonix"] input[type=number]').value) || 0; body.querySelector('[data-example]').innerHTML = icon('info') + 'Exemplu: o vânzare LipoSonix de 640 lei aduce <b>' + K.lei(640 * v / 100, 2) + '</b> comision.'; };
      body.querySelector('.st-rates').addEventListener('input', (e) => { const row = e.target.closest('[data-rate]'); if (!row) return; const other = row.querySelector(e.target.type === 'range' ? 'input[type=number]' : 'input[type=range]'); other.value = e.target.value; ex(); });
      ex();
      body.querySelector('[data-save-rates]').addEventListener('click', (e) => K.busy(e.currentTarget, async () => {
        const commissionRates = {};
        let retailRate = 15;
        body.querySelectorAll('[data-rate]').forEach((r) => { const v = Number(r.querySelector('input[type=number]').value); if (r.dataset.rate === '__retail') retailRate = v; else commissionRates[r.dataset.rate] = v; });
        try { await K.api('/api/portal-config', { commissionRates, retailRate }); K.ui().toast('Comisioanele au fost salvate.', 'success'); K.reload(); }
        catch (err) { K.ui().toast(K.errText(err), 'error'); }
      }));
      return;
    }
    if (ST.tab === 'bonus') {
      const cg = cfg.companyGoal, rb = cfg.raceBonus, act = (K.data.admin.employees || []).filter((e) => e.active && e.id !== 'admin').length;
      body.innerHTML = '<div class="k-grid c2">' +
        '<section class="k-card"><div class="k-card-head"><h3>' + icon('target') + 'Obiectivul clinicii</h3></div><p class="k-muted" style="margin-top:0">Dacă vânzările aprobate din ambele locații ating ținta lunii, fiecare angajat activ primește bonusul. Apare la toți în „Bonusurile mele” și pe Panou.</p>' +
          '<form class="k-form" data-cg>' + K.field('Țintă lunară (lei)', '<input name="target" type="number" min="0" step="500" value="' + esc(cg.target) + '">') + K.field('Bonus per angajat (lei)', '<input name="reward" type="number" min="0" step="10" value="' + esc(cg.reward) + '">') + '</form>' +
          '<div class="st-example" data-cgx></div><div class="k-form-actions"><button type="button" class="k-btn is-primary" data-save-cg>' + icon('check') + 'Salvează</button></div></section>' +
        '<section class="k-card"><div class="k-card-head"><h3>' + icon('trophy') + 'Bonus de viteză</h3></div><p class="k-muted" style="margin-top:0">Cine are cele mai multe vânzări aprobate la categoria aleasă, dacă atinge ținta, câștigă bonusul. Clasamentul e live pe Panou.</p>' +
          '<form class="k-form" data-rb>' + K.field('Categorie', '<select name="category">' + K.options(Object.keys(K.cats).map((k) => [k, K.cats[k]]), rb.category) + '</select>', 'full') +
          K.field('Țintă (nr. vânzări)', '<input name="target" type="number" min="1" value="' + esc(rb.target) + '">') + K.field('Bonus (lei)', '<input name="reward" type="number" min="0" step="10" value="' + esc(rb.reward) + '">') + '</form>' +
          '<div class="k-form-actions"><button type="button" class="k-btn is-primary" data-save-rb>' + icon('check') + 'Salvează</button></div></section></div>' +
        '<p class="st-note">' + icon('info') + 'Bonusuri individuale (per om, cu obiectivele lui) se setează din <a href="#angajati" data-goto="angajati">Echipa</a>.</p>';
      const cgx = () => { const v = K.formValues(body.querySelector('[data-cg]')); body.querySelector('[data-cgx]').innerHTML = icon('info') + 'Cost total dacă se atinge: <b>' + K.lei((Number(v.reward) || 0) * act) + '</b> (' + K.plural(act, 'angajat activ', 'angajați activi') + ').'; };
      cgx(); body.querySelector('[data-cg]').addEventListener('input', cgx);
      body.querySelector('[data-goto]').addEventListener('click', (e) => { e.preventDefault(); K.go('angajati'); });
      body.querySelector('[data-save-cg]').addEventListener('click', (e) => K.busy(e.currentTarget, async () => {
        const v = K.formValues(body.querySelector('[data-cg]'));
        try { await K.api('/api/portal-config', { companyGoal: { target: Number(v.target), reward: Number(v.reward), month: K.thisMonth() } }); K.ui().toast('Obiectivul clinicii a fost salvat.', 'success'); K.reload(); }
        catch (err) { K.ui().toast(K.errText(err), 'error'); }
      }));
      body.querySelector('[data-save-rb]').addEventListener('click', (e) => K.busy(e.currentTarget, async () => {
        const v = K.formValues(body.querySelector('[data-rb]'));
        try { await K.api('/api/portal-config', { raceBonus: { category: v.category, target: Number(v.target), reward: Number(v.reward), month: K.thisMonth() } }); K.ui().toast('Bonusul de viteză a fost salvat.', 'success'); K.reload(); }
        catch (err) { K.ui().toast(K.errText(err), 'error'); }
      }));
      return;
    }
    // integrări
    body.innerHTML = '<div class="st-integrations">' +
      '<section class="k-card st-int"><div class="st-int-head"><span class="k-icon-chip" style="background:rgba(24,119,242,.12);color:#1877f2">' + icon('facebook') + '</span><div><b>Facebook Lead Ads</b><span>Leadurile din formulare intră automat în Pipeline.</span></div></div><div data-fb><div class="k-skel" style="height:44px"></div></div></section>' +
      '<section class="k-card st-int"><div class="st-int-head"><span class="k-icon-chip is-accent">' + icon('sparkles') + '</span><div><b>Creative</b><span>Mașina de creative citește ofertele direct din secțiunea Oferte.</span></div></div>' +
        '<div class="st-int-row"><span class="k-tag is-good">' + icon('check') + 'Conectat</span><button type="button" class="k-btn is-outline is-sm" data-goto="creative">Deschide Creative' + icon('arrow') + '</button></div></section>' +
      '<section class="k-card st-int"><div class="st-int-head"><span class="k-icon-chip is-info">' + icon('globe') + '</span><div><b>Site centrul360.com</b><span>Paginile Oferte și Prețuri se actualizează din secțiunea Oferte, în câteva minute.</span></div></div>' +
        '<div class="st-int-row"><span class="k-tag is-good">' + icon('check') + 'Sincronizat</span><a class="k-btn is-outline is-sm" href="/oferte" target="_blank" rel="noopener">Vezi pagina' + icon('arrow') + '</a></div></section></div>';
    body.querySelectorAll('[data-goto]').forEach((b) => b.addEventListener('click', () => K.go(b.dataset.goto)));
    loadFb(body.querySelector('[data-fb]'));
  }
  const rateRow = (k, label, v) => '<div class="st-rate" data-rate="' + k + '"><span>' + esc(label) + '</span><input type="range" min="0" max="40" step="1" value="' + v + '"><input type="number" min="0" max="100" value="' + v + '"><output>' + v + '%</output></div>';

  async function loadFb(box) {
    try {
      const d = await K.api('/api/fb-connection-status');
      if (d.notConfigured) { box.innerHTML = '<div class="st-int-row"><span class="k-tag is-warn">' + icon('alert') + 'Aplicația Meta nu e configurată (FB_APP_ID / FB_APP_SECRET)</span></div>'; return; }
      if (d.connected) {
        box.innerHTML = '<div class="st-int-row"><span class="k-tag is-good">' + icon('check') + 'Conectat la ' + esc(d.pageName || 'Pagină') + '</span>' + (d.connectedAt ? '<span class="k-muted">din ' + esc(new Date(d.connectedAt).toLocaleDateString('ro-RO')) + '</span>' : '') +
          '<button type="button" class="k-btn is-danger is-sm" data-fbx>Deconectează</button></div>';
        box.querySelector('[data-fbx]').addEventListener('click', async () => {
          if (!(await K.ui().confirm({ title: 'Deconectezi Facebook?', message: 'Leadurile noi din formulare nu mai intră în Pipeline până reconectezi.', confirmText: 'Deconectează', danger: true }))) return;
          try { await K.api('/api/fb-disconnect', {}); K.ui().toast('Facebook deconectat.', 'success'); loadFb(box); } catch (err) { K.ui().toast(K.errText(err), 'error'); }
        });
        return;
      }
      box.innerHTML = '<div class="st-int-row"><span class="k-tag is-warn">' + icon('alert') + 'Neconectat</span><a class="k-btn is-primary is-sm" href="/api/fb-oauth-start">' + icon('facebook') + 'Conectează Pagina</a><button type="button" class="k-btn is-sm" data-man>Conectare manuală</button></div>' +
        '<form class="st-manual" data-manual hidden><textarea name="t" rows="3" placeholder="User Access Token din Graph API Explorer"></textarea><button type="submit" class="k-btn is-primary is-sm">Conectează cu acest token</button></form>';
      box.querySelector('[data-man]').addEventListener('click', () => { box.querySelector('[data-manual]').hidden = !box.querySelector('[data-manual]').hidden; });
      box.querySelector('[data-manual]').addEventListener('submit', async (e) => {
        e.preventDefault();
        const tok = e.target.t.value.trim(); if (!tok) return;
        try { const r = await K.api('/api/fb-manual-connect', { userAccessToken: tok }); K.ui().toast('Conectat la ' + (r.pageName || 'Pagină') + '.', 'success'); loadFb(box); }
        catch (err) { K.ui().toast('Nu am putut conecta: ' + (err.code || 'eroare'), 'error'); }
      });
    } catch (e) { box.innerHTML = '<span class="k-muted">Nu am putut verifica starea conexiunii.</span>'; }
  }
  K.section('setari', { mount: mountSettings, show: renderSettings, data() { if (spanel && K.isActive('setari')) renderSettings(); } });

  // Facebook redirects back to /portal?fb=connected|error after OAuth.
  (function fbReturn() {
    const params = new URLSearchParams(location.search);
    const flag = params.get('fb');
    if (!flag) return;
    ST.tab = 'integrari';
    params.delete('fb');
    const qs = params.toString();
    history.replaceState(null, '', location.pathname + (qs ? '?' + qs : '') + '#setari');
    setTimeout(() => K.ui().toast(flag === 'connected' ? 'Facebook conectat cu succes.' : 'Conectarea la Facebook a eșuat.', flag === 'connected' ? 'success' : 'error'), 1200);
  })();
})();
