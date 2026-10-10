// Centrul360 portal — "Condică" (attendance log) + "Cererile mele" (leave requests).
// Everyone: today's clock-in/out, their own recent attendance, submitting a leave request and
// seeing its status/history. Admin additionally: filter attendance by employee/month, a simple
// monthly summary (days present, total hours), and inline correction of mistaken entries —
// deciding leave requests themselves happens in Aprobări (portal-admin.js), matching the
// existing "approvals" mental model.
(function () {
  'use strict';
  const K = window.K;
  const { esc, icon } = K;

  const TYPE_LABELS = { odihna: 'Concediu de odihnă', fara_plata: 'Concediu fără plată', medical: 'Concediu medical', alta: 'Alt tip de concediu' };
  const STATUS_LABEL = { pending: 'În așteptare', approved: 'Aprobată', rejected: 'Respinsă' };
  const STATUS_TONE = { pending: 'warn', approved: 'good', rejected: 'bad' };

  const C = { attendance: [], leave: [], empFilter: '', year: null, month: null, balance: null, overview: null };
  let panel;

  function isAdmin() { return !!(K.data && K.data.isAdmin); }
  function employees() { return isAdmin() ? (K.data.admin.employees || []).filter((e) => e.id !== 'admin') : []; }
  function empName(id) {
    if (id === 'admin') return 'Admin';
    const e = employees().find((x) => x.id === id);
    return e ? e.name : id;
  }

  function mount(p) {
    panel = p;
    panel.classList.add('k-panel', 'cd');
    const thisMonth = K.thisMonth().split('-');
    C.year = Number(thisMonth[0]); C.month = Number(thisMonth[1]);
    panel.innerHTML =
      '<div class="k-head"><div><div class="k-eyebrow">Echipă</div><h2>Condică</h2><p class="k-lede">Pontaj zilnic și cereri de concediu — ale tale, și ale echipei dacă ești admin.</p></div></div>' +
      '<div data-body><div class="k-skel" style="height:180px"></div></div>';
    panel.addEventListener('click', onClick);
    panel.addEventListener('change', onChange);
  }

  async function load() {
    try {
      // Admin with no employee picked: no personal balance (she doesn't accrue concediu), but
      // she gets a one-shot team overview instead. Picking an employee switches to that
      // person's detail (balance + their own attendance rows), same as before.
      const wantOverview = isAdmin() && !C.empFilter;
      const [att, lv, bal, ov] = await Promise.all([
        K.api('/api/portal-attendance', { action: 'list', employeeId: isAdmin() ? (C.empFilter || undefined) : undefined, year: isAdmin() ? C.year : undefined, month: isAdmin() ? C.month : undefined }),
        K.api('/api/portal-leave', { action: 'list' }),
        !wantOverview ? K.api('/api/portal-attendance', { action: 'balance', employeeId: isAdmin() ? C.empFilter : K.data.me.id }) : Promise.resolve(null),
        wantOverview ? K.api('/api/portal-attendance', { action: 'balance_all' }) : Promise.resolve(null),
      ]);
      C.attendance = att.entries || [];
      C.leave = lv.requests || [];
      C.balance = bal;
      C.overview = ov ? ov.employees || [] : null;
      render();
    } catch (e) {
      panel.querySelector('[data-body]').innerHTML = K.empty('alert', 'Nu am putut încărca condica', 'Verifică conexiunea și reîncearcă.', '<button type="button" class="k-btn is-primary" data-act="refresh">Reîncearcă</button>');
    }
  }

  function balanceHtml() {
    const b = C.balance;
    if (!b) return '';
    const who = isAdmin() && C.empFilter ? ' · ' + empName(C.empFilter) : '';
    return '<section class="k-card"><div class="k-card-head"><h3>' + icon('target') + 'Sold concediu & ore' + esc(who) + '</h3></div>' +
      '<div class="k-grid c2">' +
        '<div class="k-stat"><div class="k-stat-top">' + icon('calendar') + 'Zile de concediu rămase</div><div class="k-stat-value">' + b.daysLeft + '</div><div class="k-stat-sub">din ' + b.annualLeaveDays + ' — ' + b.daysUsed + ' folosite anul acesta</div></div>' +
        '<div class="k-stat is-' + (b.hoursDelta >= 0 ? 'good' : 'warn') + '"><div class="k-stat-top">' + icon('clock') + 'Ore de recuperat</div><div class="k-stat-value">' + (b.hoursDelta >= 0 ? '+' : '') + b.hoursDelta + '</div><div class="k-stat-sub">' + b.hoursPeriod + ' · program ' + b.contractedHoursPerDay + ' h/zi · doar zilele complete</div></div>' +
      '</div></section>';
  }

  function minutes(hhmm) { const m = /^(\d{2}):(\d{2})$/.exec(hhmm || ''); return m ? Number(m[1]) * 60 + Number(m[2]) : null; }
  function hoursBetween(a, b) { const x = minutes(a), y = minutes(b); return x != null && y != null && y > x ? Math.round(((y - x) / 60) * 100) / 100 : null; }

  function todayCard() {
    const today = K.today();
    const mine = C.attendance.find((e) => e.employeeId === K.data.me.id && e.date === today) || (isAdmin() && !C.empFilter ? C.attendance.find((e) => e.employeeId === 'admin' && e.date === today) : null);
    const hrs = mine ? hoursBetween(mine.checkIn, mine.checkOut) : null;
    return '<section class="k-card cd-today"><div class="k-card-head"><h3>' + icon('clock') + 'Azi, ' + esc(K.dateLong(today)) + '</h3></div>' +
      '<div class="cd-today-row">' +
        '<div class="cd-today-stat"><span>Sosire</span><b>' + (mine && mine.checkIn ? esc(mine.checkIn) : '—') + '</b></div>' +
        '<div class="cd-today-stat"><span>Plecare</span><b>' + (mine && mine.checkOut ? esc(mine.checkOut) : '—') + '</b></div>' +
        (hrs != null ? '<div class="cd-today-stat"><span>Ore</span><b>' + hrs + '</b></div>' : '') +
        '<div class="cd-today-actions">' +
          '<button type="button" class="k-btn is-good" data-clock="clock_in"' + (mine && mine.checkIn ? ' disabled' : '') + '>' + icon('checkCircle') + 'Pontează sosirea</button>' +
          '<button type="button" class="k-btn is-outline" data-clock="clock_out"' + (mine && mine.checkOut ? ' disabled' : '') + '>' + icon('clock') + 'Pontează plecarea</button>' +
        '</div></div></section>';
  }

  function attendanceRow(e, editable) {
    const hrs = hoursBetween(e.checkIn, e.checkOut);
    return '<div class="k-row cd-arow"' + (editable ? ' data-edit-att="' + esc(e.id) + '"' : '') + '><div class="k-row-main"><div class="k-row-title">' + esc(K.relDay(e.date)) + (isAdmin() && !C.empFilter ? ' · ' + esc(empName(e.employeeId)) : '') + '</div>' +
      '<div class="k-row-sub">Sosire ' + (e.checkIn ? esc(e.checkIn) : '—') + ' · Plecare ' + (e.checkOut ? esc(e.checkOut) : '—') + (hrs != null ? ' · ' + hrs + ' h' : '') + (e.note ? ' · „' + esc(e.note) + '”' : '') + '</div></div>' +
      (editable ? '<button type="button" class="k-icon-btn" aria-label="Corectează">' + icon('pen') + '</button>' : '') + '</div>';
  }

  function filterToolbar() {
    return '<div class="cd-filters k-toolbar">' +
      '<select data-f="emp"><option value="">Toată echipa</option>' + employees().map((e) => '<option value="' + esc(e.id) + '"' + (C.empFilter === e.id ? ' selected' : '') + '>' + esc(e.name) + '</option>').join('') + '</select>' +
      '<select data-f="month">' + Array.from({ length: 12 }, (_, i) => i + 1).map((m) => '<option value="' + m + '"' + (C.month === m ? ' selected' : '') + '>' + K.monthLabel(C.year + '-' + String(m).padStart(2, '0')).split(' ')[0] + '</option>').join('') + '</select>' +
      '<select data-f="year">' + [C.year - 1, C.year, C.year + 1].map((y) => '<option value="' + y + '"' + (C.year === y ? ' selected' : '') + '>' + y + '</option>').join('') + '</select>' +
      '</div>';
  }

  function overviewTable() {
    const rows = C.overview || [];
    return '<section class="k-card"><div class="k-card-head"><h3>' + icon('listCheck') + 'Condica echipei — toți angajații</h3></div>' +
      filterToolbar() +
      (rows.length ? '<div class="k-list" style="margin-top:.8rem">' + rows.map((r) => {
        const today = r.todayCheckIn || r.todayCheckOut ? (r.todayCheckIn ? 'Sosire ' + esc(r.todayCheckIn) : 'Fără sosire') + (r.todayCheckOut ? ' · Plecare ' + esc(r.todayCheckOut) : '') : 'Nicio intrare azi';
        return '<div class="k-row" data-pick-emp="' + esc(r.employeeId) + '" style="cursor:pointer">' +
          '<div class="k-row-main"><div class="k-row-title">' + esc(r.name) + '</div><div class="k-row-sub">' + esc(r.location || '') + ' · ' + esc(today) + '</div></div>' +
          '<div class="k-row-end"><span class="k-tag">' + r.daysLeft + ' zile concediu</span>' +
          '<span class="k-tag is-' + (r.hoursDelta >= 0 ? 'good' : 'warn') + '">' + (r.hoursDelta >= 0 ? '+' : '') + r.hoursDelta + ' h</span></div></div>';
      }).join('') + '</div>' : K.empty('users', 'Niciun angajat activ', 'Adaugă angajați din tab-ul Echipa.')) +
      '</section>';
  }

  function attendanceSection() {
    if (isAdmin() && !C.empFilter) return overviewTable();
    const mineOnly = isAdmin() ? C.attendance : C.attendance.filter((e) => e.employeeId === K.data.me.id);
    const recent = mineOnly.slice(0, 20);
    const filterHtml = isAdmin() ? filterToolbar() : '';
    const summaryHtml = isAdmin() ? summary() : '';
    const emptyState = isAdmin()
      ? K.empty('clock', 'Nicio intrare încă', esc(empName(C.empFilter)) + ' nu are pontaje în această perioadă.')
      : K.empty('clock', 'Nicio intrare încă', 'Pontajele apar aici imediat ce apeși „Pontează sosirea”.');
    return '<section class="k-card"><div class="k-card-head"><h3>' + icon('listCheck') + (isAdmin() ? 'Condica — ' + esc(empName(C.empFilter)) : 'Pontajele mele') + '</h3></div>' +
      filterHtml + summaryHtml +
      (recent.length ? '<div class="k-list">' + recent.map((e) => attendanceRow(e, isAdmin())).join('') + '</div>' : emptyState) +
      '</section>';
  }

  function summary() {
    const list = C.attendance;
    if (!list.length) return '';
    const byEmp = {};
    list.forEach((e) => { (byEmp[e.employeeId] = byEmp[e.employeeId] || []).push(e); });
    const rows = Object.keys(byEmp).map((id) => {
      const entries = byEmp[id];
      const present = entries.filter((e) => e.checkIn || e.checkOut).length;
      const totalHours = entries.reduce((a, e) => { const h = hoursBetween(e.checkIn, e.checkOut); return a + (h || 0); }, 0);
      return { id, present, totalHours: Math.round(totalHours * 100) / 100 };
    });
    return '<div class="k-grid c3" style="margin:.8rem 0">' + rows.map((r) => '<div class="k-stat"><div class="k-stat-top">' + esc(empName(r.id)) + '</div><div class="k-stat-value">' + r.present + '<small> zile</small></div><div class="k-stat-sub">' + r.totalHours + ' h în total (doar zilele cu sosire și plecare)</div></div>').join('') + '</div>';
  }

  function leaveSection() {
    if (isAdmin()) {
      const list = C.empFilter ? C.leave.filter((r) => r.employeeId === C.empFilter) : C.leave;
      return '<section class="k-card"><div class="k-card-head"><h3>' + icon('calendar') + 'Concedii' + (C.empFilter ? ' · ' + esc(empName(C.empFilter)) : ' — toată echipa') + '</h3></div>' +
        '<button type="button" class="k-btn is-accent" data-admin-new-leave>' + icon('plus') + 'Notează concediu pentru un angajat</button>' +
        (list.length ? '<div class="k-list" style="margin-top:.8rem">' + list.map((r) => leaveRow(r, true)).join('') + '</div>'
          : '<p class="k-muted" style="margin-top:.8rem">Nicio cerere încă.</p>') + '</section>';
    }
    const mine = C.leave.filter((r) => r.employeeId === K.data.me.id);
    return '<section class="k-card"><div class="k-card-head"><h3>' + icon('calendar') + 'Cererile mele de concediu</h3></div>' +
      '<button type="button" class="k-btn is-accent" data-new-leave>' + icon('plus') + 'Cerere nouă</button>' +
      (mine.length ? '<div class="k-list" style="margin-top:.8rem">' + mine.map((r) => leaveRow(r, false)).join('') + '</div>'
        : '<p class="k-muted" style="margin-top:.8rem">Nicio cerere încă.</p>') + '</section>';
  }

  function leaveRow(r, showEmployee) {
    return '<div class="k-row"><div class="k-row-main"><div class="k-row-title">' + (showEmployee ? esc(empName(r.employeeId)) + ' · ' : '') + esc(TYPE_LABELS[r.type] || r.type) + '</div>' +
      '<div class="k-row-sub">' + esc(K.dateShort(r.startDate)) + ' – ' + esc(K.dateShort(r.endDate)) + ' · ' + K.plural(r.workDays, 'zi', 'zile') +
      (r.reason ? ' · „' + esc(r.reason) + '”' : '') + (r.status === 'rejected' && r.rejectionNote ? ' · motiv refuz: „' + esc(r.rejectionNote) + '”' : '') + '</div></div>' +
      '<div class="k-row-end"><span class="k-tag is-' + STATUS_TONE[r.status] + '">' + STATUS_LABEL[r.status] + '</span>' +
      (r.status === 'approved' ? '<a class="k-icon-btn" target="_blank" rel="noopener" href="/api/portal-leave-pdf?id=' + esc(r.id) + '" title="Deschide PDF-ul">' + icon('file') + '</a>' : '') +
      '</div></div>';
  }

  function render() {
    if (!panel) return;
    // Admin doesn't clock her own attendance — it doesn't apply to her — so no "azi" card;
    // she gets the team's pontaj/sold + the ability to log a leave manually instead.
    panel.querySelector('[data-body]').innerHTML = (isAdmin() ? '' : todayCard()) + balanceHtml() + attendanceSection() + leaveSection();
  }

  async function clock(action) {
    try { await K.api('/api/portal-attendance', { action }); K.ui().toast(action === 'clock_in' ? 'Sosire pontată.' : 'Plecare pontată.', 'success'); await load(); }
    catch (e) { K.ui().toast(K.errText(e), 'error'); }
  }

  function newLeaveDrawer() {
    const d = K.drawer({
      title: 'Cerere de concediu', icon: 'calendar', width: 520,
      subtitle: 'Se trimite spre aprobare administratorului.',
      body: '<form class="k-form" data-form>' +
        K.field('Tip concediu', K.seg('type', [['odihna', 'Odihnă'], ['fara_plata', 'Fără plată'], ['medical', 'Medical'], ['alta', 'Altul']], 'odihna', 'is-big'), 'full') +
        K.field('Data început', '<input name="startDate" type="date" required value="' + esc(K.today()) + '">') +
        K.field('Data sfârșit', '<input name="endDate" type="date" required value="' + esc(K.today()) + '">') +
        K.field('Motiv', '<textarea name="reason" rows="3" maxlength="500" placeholder="Opțional la odihnă/fără plată, obligatoriu la medical/altul"></textarea>', 'full') +
        '</form>',
      footer: '<span class="k-grow"></span><button type="button" class="k-btn" data-cancel>Renunță</button><button type="button" class="k-btn is-primary" data-save>' + icon('check') + 'Trimite cererea</button>',
      onMount(el) {
        el.querySelector('[data-cancel]').addEventListener('click', () => d.close());
        el.querySelector('[data-save]').addEventListener('click', (ev) => K.busy(ev.currentTarget, async () => {
          const v = K.formValues(el.querySelector('[data-form]'));
          if (!v.startDate || !v.endDate) { K.ui().toast('Completează perioada.', 'error'); return; }
          if (v.endDate < v.startDate) { K.ui().toast('Data de sfârșit e înainte de data de început.', 'error'); return; }
          if ((v.type === 'medical' || v.type === 'alta') && !v.reason.trim()) { K.ui().toast('Completează motivul pentru acest tip de concediu.', 'error'); return; }
          try {
            await K.api('/api/portal-leave', { action: 'create', type: v.type, startDate: v.startDate, endDate: v.endDate, reason: v.reason });
            d.close(); K.ui().toast('Cererea a fost trimisă.', 'success'); load();
          } catch (err) { K.ui().toast(K.errText(err), 'error'); }
        }));
      },
    });
  }

  function adminNewLeaveDrawer() {
    const opts = employees().map((e) => '<option value="' + esc(e.id) + '"' + (C.empFilter === e.id ? ' selected' : '') + '>' + esc(e.name) + '</option>').join('');
    const d = K.drawer({
      title: 'Notează concediu pentru un angajat', icon: 'calendar', width: 520,
      subtitle: 'Se marchează direct ca aprobat — pentru cazul în care angajatul nu a trecut-o singur în portal.',
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

  function editAttendanceDrawer(entry) {
    const d = K.drawer({
      title: 'Corectează pontajul', icon: 'pen', width: 460,
      subtitle: esc(empName(entry.employeeId)) + ' · ' + esc(K.dateLong(entry.date)),
      body: '<form class="k-form" data-form>' +
        K.field('Sosire', '<input name="checkIn" type="time" value="' + esc(entry.checkIn || '') + '">') +
        K.field('Plecare', '<input name="checkOut" type="time" value="' + esc(entry.checkOut || '') + '">') +
        K.field('Notă', '<input name="note" maxlength="300" value="' + esc(entry.note || '') + '">', 'full') +
        '</form>',
      footer: '<span class="k-grow"></span><button type="button" class="k-btn" data-cancel>Renunță</button><button type="button" class="k-btn is-primary" data-save>' + icon('check') + 'Salvează</button>',
      onMount(el) {
        el.querySelector('[data-cancel]').addEventListener('click', () => d.close());
        el.querySelector('[data-save]').addEventListener('click', (ev) => K.busy(ev.currentTarget, async () => {
          const v = K.formValues(el.querySelector('[data-form]'));
          try {
            await K.api('/api/portal-attendance', { action: 'update', id: entry.id, checkIn: v.checkIn || null, checkOut: v.checkOut || null, note: v.note });
            d.close(); K.ui().toast('Pontaj corectat.', 'success'); load();
          } catch (err) { K.ui().toast(K.errText(err), 'error'); }
        }));
      },
    });
  }

  function onClick(e) {
    const t = e.target;
    if (t.closest('[data-act="refresh"]')) return load();
    const clockBtn = t.closest('[data-clock]');
    if (clockBtn) return clock(clockBtn.dataset.clock);
    if (t.closest('[data-new-leave]')) return newLeaveDrawer();
    if (t.closest('[data-admin-new-leave]')) return adminNewLeaveDrawer();
    const pick = t.closest('[data-pick-emp]');
    if (pick) { C.empFilter = pick.dataset.pickEmp; return load(); }
    const row = t.closest('[data-edit-att]');
    if (row) { const entry = C.attendance.find((x) => x.id === row.dataset.editAtt); if (entry) editAttendanceDrawer(entry); }
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
  K.on('remote', () => { if (panel && K.isActive('condica')) load(); });
})();
