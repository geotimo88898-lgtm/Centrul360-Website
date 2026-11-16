// Centrul360 portal - Calendar. A real time grid (08-21) in Day view (one column per location) and
// Week view (one column per day): click an empty slot to book, drag a block to move it (15-min snap,
// across columns too), click a block for its drawer with one-tap status, call / WhatsApp confirmation
// and "Încasează" straight into Încasări. Talks to /api/portal-appointments.
// On a phone: the month always open on top (a dot under each day with bookings, a tap picks the
// day, like LeadConnector), the day's grid under it, a round "+" to book.
(function () {
  'use strict';
  const K = window.K;
  const { esc, icon } = K;
  const START = 8, END = 21, PPM = 2; // grid hours + pixels per minute (an hour is 120px: the treatment fits on each, the owner 5.11)
  const DUR = 60;                        // an appointment with no end time is drawn as 1h
  const LOCS = ['Timișoara', 'Arad'];
  const STATUS = {
    programata: { label: 'Programată', plural: 'programate', tone: 'accent', ic: 'calendar' },
    confirmata: { label: 'Confirmată', plural: 'confirmate', tone: 'good', ic: 'checkCircle' },
    finalizata: { label: 'Finalizată', plural: 'finalizate', tone: 'done', ic: 'check' },
    reprogramata: { label: 'Reprogramată', plural: 'reprogramate', tone: 'warn', ic: 'refresh' },
    anulata: { label: 'Anulată', plural: 'anulate', tone: 'bad', ic: 'ban' },
    // Created automatically when an admin approves a leave request (Aprobări), not a real
    // appointment, just a marker so reception sees the person is away. See api/portal-leave.js.
    concediu: { label: 'Concediu', plural: 'concedii', tone: 'mute', ic: 'calendar' },
  };
  // Statuses the front desk picks by hand. "Finalizată" comes by itself when the appointment is paid
  // (Încasări); "Concediu" is a leave block created by an approved leave request.
  const PICK = ['programata', 'confirmata', 'reprogramata', 'anulata'];
  // closed by hand with „Finalizată” when there is no money to take: a session from a package, or a booking of 0 lei
  // (a free consultation where she bought nothing, the owner 14.11); one with a sum closes itself when it is paid
  const pickFor = (a) => (a && (a.package || (!a.paidSaleId && !(Number(a.amount) > 0))) ? PICK.concat(['finalizata']) : PICK);
  // "Blochează timp": a leave-like row (status concediu) with block: true, hours and a reason
  const BLOCKED = { label: 'Blocat', plural: 'blocate', tone: 'mute', ic: 'ban' };
  const stOf = (a) => (a.block ? BLOCKED : STATUS[a.status] || STATUS.programata);
  const S = { view: 'day', date: K.today(), loc: 'all', emp: '', only: 'all', appts: [], breaks: [], range: '', loading: false, orphans: [] };
  const phone = () => !!(window.matchMedia && window.matchMedia('(max-width:720px)').matches);
  const PHONE_VIEW = 'c360_cal_phone_view';
  const keepPhoneView = () => { if (phone()) try { localStorage.setItem(PHONE_VIEW, S.view); } catch (e) { /* private mode */ } };
  let panel, gridEl, nowTimer = 0;
  // Front desk + owner edit the calendar; a cosmetician sees it read-only (server enforces the same).
  const canEdit = () => !!(K.frontDesk && K.frontDesk());

  const toMin = (t) => { const m = /^(\d{1,2}):(\d{2})$/.exec(t || ''); return m ? +m[1] * 60 + +m[2] : null; };
  const toHM = (m) => K.pad(Math.floor(m / 60)) + ':' + K.pad(m % 60);
  // End of an appointment in minutes: its end time, or start + 1h when none was set.
  const endMin = (a) => { const s = toMin(a.time), e = toMin(a.endTime); return s == null ? null : e != null && e > s ? e : s + DUR; };
  const durText = (min) => (min >= 60 ? Math.floor(min / 60) + 'h' + (min % 60 ? ' ' + (min % 60) + ' min' : '') : min + ' min');
  // "10:00-11:30" (or just "10:00" when the end isn't set).
  const span = (a) => (a.time ? a.time + (toMin(a.endTime) > toMin(a.time) ? ' - ' + a.endTime : '') : '');
  const empName = (id) => { const e = (K.data && K.data.activeEmployees || []).find((x) => x.id === id); return e ? e.name : ''; };
  // the people who left („A plecat” in Echipa): their appointments after the last day wait for someone else (LEFT: the
  // filter value that shows them; S.orphans: those appointments, from the server)
  const LEFT = '__left';
  const leftOf = (id) => ((K.data && K.data.leftEmployees) || []).find((x) => x.id === id) || null;
  const isOrphan = (a) => S.orphans.some((x) => x.id === a.id);
  const empMatch = (a) => !S.emp || (S.emp === LEFT ? isOrphan(a) : a.cosmeticianId === S.emp);
  // Only cosmeticians do treatments; the list follows the chosen location (Timișoara / Arad).
  const cosmeticians = (loc) => ((K.data && K.data.activeEmployees) || []).filter((e) => e.role === 'cosmetician' && (!loc || loc === 'all' || e.location === loc));

  // ------------------------------------------------------------------ the break (the owner, 16.11)
  // 30 minutes at the middle of each cosmetician's shift, worked out by the server from Program echipă (api/_lib/team-
  // schedule.js dayBreaks) and sent with the appointments: { date, employeeId, name, location, from, to, mid, shiftFrom,
  // shiftTo, on, why, moved, by, at }. Not an appointment: not dragged like one, not counted. The owner and the manager move
  // it for a day (the sheet, a drag on a computer); a client booked over it moves it with the booking (the form's chips).
  const BRK = 30;
  const canMoveBreak = () => !!(K.canManage && K.canManage());
  const firstName = (n) => String(n || '').split(' ')[0];
  const brkKey = (b) => b.date + '|' + b.employeeId;
  const brkOf = (key) => S.breaks.find((b) => brkKey(b) === key) || null;
  // a cosmetician's own booking or break in the other clinic, a day she works there (16.11): shown with hers, in its city's column
  const away = (x) => !!(K.data && K.data.city) && !!x.location && x.location !== K.data.city;
  const locOk = (x) => S.loc === 'all' || x.location === S.loc || away(x);
  const brkShown = (b) => locOk(b) && (!S.emp || (S.emp !== LEFT && b.employeeId === S.emp));
  // what of hers is on a half hour that day (a client, a block): the drag's check (the server checks it again)
  const hersAt = (b, s, e) => S.appts.find((a) => a.date === b.date && a.cosmeticianId === b.employeeId && a.status !== 'anulata' && toMin(a.time) != null &&
    (a.block || a.status !== 'concediu') && toMin(a.time) < e && endMin(a) > s) || null;
  const WHY = { client: 'are o clientă atunci', block: 'are timp blocat atunci', busy: 'clinica e plină atunci', off: 'scoasă pentru azi' };

  // ------------------------------------------------------------------ mount + chrome
  function mount(p) {
    panel = p;
    panel.classList.add('k-panel', 'cal');
    // A cosmetician is limited to her city (no switch); reception and the owner see both.
    const locked = !!(K.data && K.data.city);
    if (locked) S.loc = K.data.city;
    // A cosmetician opens on her own clients; reception/admin see everyone.
    if (K.data && !K.data.isAdmin && K.data.me.role === 'cosmetician') S.emp = K.data.me.id;
    // a phone: day or week (agenda), as it was last picked on this phone
    if (window.innerWidth < 720) { let v = 'day'; try { v = localStorage.getItem(PHONE_VIEW) === 'week' ? 'week' : 'day'; } catch (e) { /* private mode */ } S.view = v; }
    panel.innerHTML =
      // no page title (the owner, 5.11: more room for the calendar); the buttons stay, on the right
      (canEdit() ? '<div class="k-head cal-head"><div class="k-head-actions">' + (K.data && K.data.isAdmin ? '<button type="button" class="k-btn is-outline" data-act="online" title="Programările clientelor de pe site">' + icon('globe') + 'Online</button>' : '') + (K.canManage && K.canManage() ? '<button type="button" class="k-btn is-outline" data-act="team">' + icon('users') + 'Program echipă</button>' : '') + '<button type="button" class="k-btn is-outline" data-act="block">' + icon('ban') + 'Blochează timp</button><button type="button" class="k-btn is-accent" data-act="new">' + icon('plus') + 'Programare<kbd>N</kbd></button></div></div>' : '') +
      '<div class="cal-bar">' +
        '<div class="cal-nav"><button type="button" class="k-btn is-outline is-sm" data-act="today">Azi</button>' +
        '<button type="button" class="k-icon-btn" data-act="prev" aria-label="Înapoi">' + icon('left') + '</button>' +
        '<button type="button" class="k-icon-btn" data-act="next" aria-label="Înainte">' + icon('right') + '</button>' +
        '<button type="button" class="cal-title" data-act="month"><b data-title></b>' + icon('down') + '</button></div>' +
        '<div class="cal-bar-right"><select data-emp aria-label="Cosmeticiană">' + empFilterOptions() + '</select>' + (locked ? '' : K.seg('calloc', [['all', 'Ambele orașe'], ['Timișoara', 'Timișoara'], ['Arad', 'Arad']], S.loc)) +
        '<select name="calonly" data-only aria-label="Arată">' + K.options(ONLY, S.only) + '</select>' +
        K.seg('calview', [['day', 'Zi'], ['week', 'Săptămână']], S.view) + '</div>' +
      '</div>' +
      '<button type="button" class="cal-left" data-left data-act="orphans" hidden></button>' +
      '<div class="cal-mbox" data-mbox hidden></div>' +
      '<div class="cal-summary" data-summary></div>' +
      '<div class="cal-team" data-team hidden></div>' +
      '<div class="cal-wrap k-card"><div class="cal-grid" data-grid></div></div>' +
      (canEdit() ? '<button type="button" class="cal-fab" data-act="new" aria-label="Programare nouă">' + icon('plus') + '</button>' : '');
    gridEl = panel.querySelector('[data-grid]');
    panel.addEventListener('click', onClick);
    panel.addEventListener('change', (e) => {
      if (e.target.name === 'calview') { S.view = e.target.value; keepPhoneView(); load(); }
      if (e.target.name === 'calloc') {
        S.loc = e.target.value;
        // the cosmetician filter only offers people from the chosen city
        if (S.emp && S.emp !== LEFT && !cosmeticians(S.loc).some((c) => c.id === S.emp)) S.emp = '';
        const sel = panel.querySelector('[data-emp]'); sel.innerHTML = empFilterOptions(); sel.value = S.emp;
        render();
      }
      if (e.target.name === 'calonly') { setOnly(e.target.value); }
      if (e.target.matches('[data-emp]')) { S.emp = e.target.value; render(true); }
    });
    gridEl.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('keydown', onKey);
    K.everySecond((now) => { if (now.getSeconds() % 30 === 0 && K.isActive('programari')) placeNow(); });
  }

  function empFilterOptions() {
    const me = K.data && K.data.me;
    return '<option value="">Toate cosmeticienele</option>' + K.options(cosmeticians(S.loc).map((e) => [e.id, me && me.id === e.id ? 'Doar ale mele' : e.name])
      .concat(S.orphans.length || S.emp === LEFT ? [[LEFT, 'Rămase fără cosmeticiană']] : []), S.emp);
  }

  function onKey(e) {
    if (!K.isActive('programari') || K.drawerOpen || K.typing(document.activeElement) || e.ctrlKey || e.metaKey || e.altKey) return;
    if (document.querySelector('.c360-dialog-root, .c360-palette-root')) return;
    const k = e.key.toLowerCase();
    if (k === 'n' && canEdit()) { e.preventDefault(); openNew({}); }
    else if (k === 't') { S.date = K.today(); load(); }
    else if (e.key === 'ArrowLeft') shift(-1);
    else if (e.key === 'ArrowRight') shift(1);
    else if (k === 'z') setView('day');
    else if (k === 's') setView('week');
  }
  function setView(v) { S.view = v; keepPhoneView(); const seg = panel.querySelector('[data-k-seg="calview"]'); if (seg) { seg.querySelectorAll('button').forEach((b) => b.classList.toggle('is-on', b.dataset.v === v)); seg.querySelector('input').value = v; } return load(); }
  function shift(dir) { S.date = K.addDays(S.date, dir * (S.view === 'day' ? 1 : 7)); inRange() ? (renderTitle(), render()) : load(); }
  // a phone has the whole month loaded: moving inside it needs no reload
  const inRange = () => { if (!phone() || !S.range) return false; const [a, b] = S.range.split('|'); return S.date >= a && S.date <= b; };
  // a day picked in the month on top (the next / previous month from its arrows)
  function pickDay(d) { S.date = d; inRange() ? (renderTitle(), render()) : load(); }

  function onClick(e) {
    if (e.target.closest('[data-lconf], [data-lmark], [data-lpay]')) { listAct(e); return; }
    const act = e.target.closest('[data-act]');
    if (act) {
      const a = act.dataset.act;
      if (a === 'new') return openNew({});
      if (a === 'block') return openBlock({});
      if (a === 'online') return openOnline();
      if (a === 'team') return openTeam();
      if (a === 'orphans') return openOrphans();
      if (a === 'today') { S.date = K.today(); return load(); }
      if (a === 'prev') return shift(-1);
      if (a === 'next') return shift(1);
      if (a === 'month') return phone() && S.view === 'day' ? null : openMonth(act); // a phone's day has the month open on top; its week doesn't
    }
    const mday = e.target.closest('[data-mday]');
    if (mday) return pickDay(mday.dataset.mday);
    const mm = e.target.closest('[data-mmonth]');
    if (mm) {
      // another month: its first day (today, when it's this month)
      const m = K.addMonths(S.date.slice(0, 7), +mm.dataset.mmonth);
      return pickDay(m === K.today().slice(0, 7) ? K.today() : m + '-01');
    }
    const bo = e.target.closest('[data-brk-open]');
    if (bo) return openBreak(brkOf(bo.dataset.brkOpen), bo);
    const row = e.target.closest('[data-open]');
    if (row) return openAppt(row.dataset.open);
    const gap = e.target.closest('[data-gap]');
    if (gap) { const [time, location] = gap.dataset.gap.split('|'); return openNew({ date: S.date, time, location }); }
    const day = e.target.closest('[data-goday]');
    if (day) { S.date = day.dataset.goday; return setView('day'); }
  }

  // ------------------------------------------------------------------ data
  function rangeFor() {
    // „Nefinalizate”: the last 30 days up to today; „De confirmat”: the day or the week shown, from today on
    if (S.only === 'nefin') return [K.addDays(K.today(), -30), K.today()];
    // a phone: the whole month (the month on top shows which days have bookings)
    if (phone() && S.view === 'day') { const m = S.date.slice(0, 7); return [m + '-01', m + '-' + K.pad(K.daysIn(m))]; }
    if (S.view === 'day') return [S.date, S.date];
    const mon = K.mondayOf(S.date);
    return [mon, K.addDays(mon, 6)];
  }
  async function load(keepScroll) {
    const [from, to] = rangeFor();
    S.range = from + '|' + to;
    renderTitle();
    try {
      const j = await K.api('/api/portal-appointments', { action: 'list', from, to });
      if (S.range !== from + '|' + to) return; // a newer navigation won
      S.appts = j.appointments || [];
      S.breaks = j.breaks || [];
      render(keepScroll);
      loadOrphans();
      // who works these days (Programul echipei): the strip on top of the day, after the grid is drawn
      teamRange(from, to).then(renderTeam).catch(() => {});
    } catch (e) {
      gridEl.innerHTML = K.empty('alert', 'Nu am putut încărca calendarul', 'Verifică conexiunea și reîncearcă.', '<button type="button" class="k-btn is-primary" data-act="today">Reîncearcă</button>');
    }
  }
  function renderTitle() {
    const t = panel.querySelector('[data-title]');
    if (S.view === 'day') t.textContent = K.relDay(S.date) === K.dateLong(S.date) ? K.dateLong(S.date) : K.relDay(S.date) + ' · ' + K.dateLong(S.date).split(', ')[1];
    else { const [a, b] = rangeFor(); t.textContent = K.dateShort(a) + ' - ' + K.dateShort(b) + ' ' + b.slice(0, 4); }
  }

  // ------------------------------------------------------------------ the two lists (16.11): „De confirmat”, „Nefinalizate”
  // A tap on Panou („TM 8 de confirmat mâine”, „10 vizite trecute, nefinalizate”) opens the exact list, its city picked
  // (routes programari/maine/de-confirmat/TM, programari/azi/de-confirmat/AR, programari/nefinalizate/TM). Each row: one tap
  // „Confirmată” and the WhatsApp confirmation (the chat, the message written); a passed one: „Finalizată”, „Nu a venit”,
  // „Încasează”. The grid comes back with „Toate”.
  const ONLY = [['all', 'Toate'], ['confirmata', 'Doar confirmate'], ['deconf', 'De confirmat'], ['nefin', 'Nefinalizate']];
  const LIST = { deconf: true, nefin: true };
  const nowMin = () => { const d = new Date(); return K.roHour ? K.roHour() * 60 + d.getMinutes() : d.getHours() * 60 + d.getMinutes(); };
  const gone = (a) => a.date < K.today() || (a.date === K.today() && endMin(a) != null && endMin(a) <= nowMin());
  const openSt = (a) => ['programata', 'confirmata', 'reprogramata'].includes(a.status) && !a.block && !a.paidSaleId;
  const inList = (a) => (S.only === 'deconf' ? openSt(a) && a.status !== 'confirmata' && !gone(a) : openSt(a) && gone(a) && toMin(a.time) != null);
  function setOnly(v, quiet) {
    const was = S.only;
    S.only = ONLY.some((o) => o[0] === v) ? v : 'all';
    const sel = panel && panel.querySelector('[data-only]'); if (sel && sel.value !== S.only) { sel.value = S.only; sel.dispatchEvent(new Event('change', { bubbles: false })); }
    if (quiet) return;
    if (was === 'nefin' || S.only === 'nefin') load(); else render(true);
  }
  const waText = (a) => 'Bună, ' + String(a.clientName || '').split(' ')[0] + '! Vă așteptăm ' + (a.date === K.today() ? 'azi' : a.date === K.addDays(K.today(), 1) ? 'mâine' : K.dateShort(a.date)) + ' la ora ' + (a.time || '') + ' la Centrul360 ' + (a.location || '') + (a.treatment ? ' pentru ' + a.treatment : '') + '. Confirmați?';
  function renderList(visible) {
    // „De confirmat”: the day shown (a phone loads its whole month) or the week; „Nefinalizate”: its 30 days
    const [from, to] = S.only === 'nefin' ? rangeFor() : S.view === 'day' ? [S.date, S.date] : [K.mondayOf(S.date), K.addDays(K.mondayOf(S.date), 6)];
    const rows = visible.filter((a) => a.date >= from && a.date <= to && inList(a)).sort((a, b) => (a.date !== b.date ? (S.only === 'nefin' ? (a.date < b.date ? 1 : -1) : (a.date < b.date ? -1 : 1)) : String(a.time || '').localeCompare(String(b.time || ''))));
    renderSummary(rows);
    const mb = panel.querySelector('[data-mbox]'); if (mb) mb.hidden = true;
    gridEl.classList.remove('is-week', 'is-split');
    gridEl.classList.add('is-list');
    const byDay = {};
    rows.forEach((a) => { (byDay[a.date] = byDay[a.date] || []).push(a); });
    const row = (a) => '<div class="cal-lrow" data-lrow="' + esc(a.id) + '"><button type="button" class="cal-lrow-m" data-open="' + esc(a.id) + '"><b>' + esc(span(a) || 'fără oră') + '</b><span><span class="cal-lrow-n">' + esc(nameOf(a)) + '</span><small>' +
        esc([treatOf(a), a.cosmeticianName ? firstName(a.cosmeticianName) : '', S.loc === 'all' ? a.location : ''].filter(Boolean).join(' · ')) + '</small></span></button><div class="cal-lrow-a">' +
      (S.only === 'deconf'
        ? '<button type="button" class="k-btn is-good is-sm" data-lconf="' + esc(a.id) + '">' + icon('checkCircle') + 'Confirmată</button>' +
          (a.clientPhone ? '<a class="k-btn is-outline is-sm" href="#mesaje" data-chat="' + esc(a.clientPhone) + '" data-chat-name="' + esc(a.clientName || '') + '" data-chat-city="' + esc(a.location || '') + '" data-chat-text="' + esc(waText(a)) + '">' + icon('chat') + 'WhatsApp</a>' : '')
        : (pickFor(a).includes('finalizata') ? '<button type="button" class="k-btn is-good is-sm" data-lmark="came" data-id="' + esc(a.id) + '">' + icon('check') + 'Finalizată</button>' : '<button type="button" class="k-btn is-outline is-sm" data-lpay="' + esc(a.id) + '">' + icon('wallet') + 'Încasează</button>') +
          '<button type="button" class="k-btn is-outline is-sm" data-lmark="noshow" data-id="' + esc(a.id) + '">' + icon('ban') + 'Nu a venit</button>') + '</div></div>';
    gridEl.innerHTML = rows.length ? '<div class="cal-list">' + Object.keys(byDay).map((d) => '<section><h4>' + esc(K.relDay(d)) + '<span>' + byDay[d].length + '</span></h4>' + byDay[d].map(row).join('') + '</section>').join('') + '</div>'
      : '<div class="cal-list">' + K.empty('checkCircle', S.only === 'deconf' ? 'Nimic de confirmat' : 'Nicio vizită nefinalizată', S.only === 'deconf' ? 'Toate programările de aici sunt confirmate.' : 'Toate vizitele trecute sunt marcate.') + '</div>';
  }
  async function listAct(e) {
    const c = e.target.closest('[data-lconf]'), m = e.target.closest('[data-lmark]'), p = e.target.closest('[data-lpay]');
    if (!c && !m && !p) return false;
    const id = (c && c.dataset.lconf) || (m && m.dataset.id) || (p && p.dataset.lpay), a = S.appts.find((x) => x.id === id);
    if (!a) return true;
    if (p) { K.go('incasari'); setTimeout(() => K.emit('incasari:new', { appointmentId: a.id }), 250); return true; }
    const btn = c || m, row = btn.closest('[data-lrow]');
    K.busy(btn, async () => {
      if (c) { const before = a.status; a.status = 'confirmata'; try { await save(a); } catch (err) { a.status = before; throw err; } }
      else { const j = await K.api('/api/portal-appointments', { action: 'mark', id: a.id, mark: m.dataset.lmark }); Object.assign(a, j.appointment || {}); }
      if (row) { row.classList.add('is-gone'); setTimeout(() => render(true), 260); } else render(true);
      K.ui().toast((a.clientName || 'Programarea') + ': ' + (c ? 'confirmată' : m.dataset.lmark === 'came' ? 'finalizată' : 'nu a venit'), 'success');
      K.reload();
    }).catch((err) => K.ui().toast(err.code === 'needs_payment' ? 'Se finalizează la încasare.' : K.errText(err), 'error'));
    return true;
  }
  // the routes from Panou and the notifications: <day>/<list>/<TM|AR> (day: azi, maine; list: de-confirmat, nefinalizate)
  const CITY_CODE = { TM: 'Timișoara', AR: 'Arad' };
  K.on('programari:sub', async (sub) => {
    const parts = String(sub || '').split('/');
    const list = parts.includes('de-confirmat') ? 'deconf' : parts.includes('nefinalizate') ? 'nefin' : '';
    if (!list) return;
    const until = Date.now() + 4000;
    while (!panel && Date.now() < until) await new Promise((r) => setTimeout(r, 80));
    if (!panel) return;
    const city = CITY_CODE[parts[parts.length - 1]] || '';
    if (city && !(K.data && K.data.city)) {
      S.loc = city;
      const seg = panel.querySelector('[data-k-seg="calloc"]');
      if (seg) { seg.querySelectorAll('button').forEach((b) => b.classList.toggle('is-on', b.dataset.v === S.loc)); const i = seg.querySelector('input'); if (i) i.value = S.loc; }
      if (S.emp && S.emp !== LEFT && !cosmeticians(S.loc).some((c) => c.id === S.emp)) S.emp = '';
      const sel = panel.querySelector('[data-emp]'); if (sel) { sel.innerHTML = empFilterOptions(); sel.value = S.emp; }
    }
    S.date = parts[0] === 'maine' ? K.addDays(K.today(), 1) : K.today();
    setOnly(list, true);
    S.view = 'day';
    const vseg = panel.querySelector('[data-k-seg="calview"]');
    if (vseg) { vseg.querySelectorAll('button').forEach((b) => b.classList.toggle('is-on', b.dataset.v === 'day')); const i = vseg.querySelector('input'); if (i) i.value = 'day'; }
    load();
  });

  // ------------------------------------------------------------------ render grid
  function columns() {
    // a cosmetician with something of hers in the other clinic that day: that city's column too
    const awayOn = (d) => S.appts.some((a) => a.date === d && away(a)) || S.breaks.some((b) => b.date === d && away(b));
    if (S.view === 'day') return (S.loc === 'all' ? LOCS : LOCS.filter((l) => l === S.loc || (awayOn(S.date) && l !== S.loc))).map((l) => ({ key: S.date + '|' + l, date: S.date, loc: l, label: l, sub: '' }));
    const mon = K.mondayOf(S.date);
    return Array.from({ length: 7 }, (_, i) => { const d = K.addDays(mon, i); return { key: d + '|' + S.loc, date: d, loc: S.loc === 'all' || awayOn(d) ? '' : S.loc, label: K.DOW_S[K.parse(d).getDay()], sub: String(K.parse(d).getDate()) }; });
  }
  const inCol = (a, c) => a.date === c.date && (!c.loc || a.location === c.loc);

  // a phone's week with both cities is 14 slivers no one can read (16.11): the week shows one city, hers or Timișoara,
  // and „Ambele orașe” steps aside until the day view (the city switch stays, one tap away)
  function oneCityWeek() {
    const pw = phone() && S.view === 'week';
    if (panel) panel.classList.toggle('cal-pweek', pw);
    if (!pw || S.loc !== 'all' || (K.data && K.data.city)) return;
    const mine = K.data && K.data.me && K.data.me.location;
    S.loc = LOCS.includes(mine) ? mine : LOCS[0];
    const seg = panel && panel.querySelector('[data-k-seg="calloc"]');
    if (seg) { seg.querySelectorAll('button').forEach((b) => b.classList.toggle('is-on', b.dataset.v === S.loc)); const i = seg.querySelector('input'); if (i) i.value = S.loc; }
    if (S.emp && S.emp !== LEFT && !cosmeticians(S.loc).some((c) => c.id === S.emp)) S.emp = '';
    const sel = panel && panel.querySelector('[data-emp]'); if (sel) { sel.innerHTML = empFilterOptions(); sel.value = S.emp; }
  }
  function render(keepScroll) {
    if (!gridEl) return;
    oneCityWeek();
    const mbox = panel.querySelector('[data-mbox]');
    mbox.hidden = !phone() || S.view === 'week'; // a phone's week: the 7 days' grid, like Google's
    const visible = S.appts.filter((a) => locOk(a) && empMatch(a) && (S.only !== 'confirmata' || a.status === S.only || a.status === 'finalizata'));
    if (LIST[S.only]) { renderList(visible); return; }
    if (phone() && S.view === 'day') mbox.innerHTML = monthHtml();
    const prevScroll = gridEl.parentElement.scrollTop;
    const cols = columns();
    renderSummary(phone() && S.view === 'day' ? visible.filter((a) => a.date === S.date) : visible); // a phone has the month loaded: the day's numbers
    renderTeam();
    const H = (END - START) * 60 * PPM;
    const hours = Array.from({ length: END - START + 1 }, (_, i) => START + i);
    const today = K.today();
    gridEl.style.setProperty('--cols', cols.length);
    gridEl.classList.remove('is-list');
    gridEl.classList.toggle('is-week', S.view === 'week');
    // the week with both cities (the owner, 16.11: too crowded): each day split in two, Timișoara left, Arad right
    const split = S.view === 'week' && S.loc === 'all' && !phone();
    gridEl.classList.toggle('is-split', split);
    gridEl.innerHTML =
      '<div class="cal-corner"></div>' +
      cols.map((c) => '<div class="cal-colhead' + (c.date === today ? ' is-today' : '') + '"' + (S.view === 'week' ? ' data-goday="' + c.date + '"' : '') + '>' +
        (S.view === 'week' ? '<span>' + c.label + '</span><b>' + c.sub + '</b>' : '<span>' + icon('pin') + esc(c.label) + '</span>') +
        '<em>' + visible.filter((a) => inCol(a, c) && a.status !== 'anulata' && a.status !== 'concediu').length + '</em>' +
        (split ? '<small class="cal-split-h"><span>TM</span><span>AR</span></small>' : '') + '</div>').join('') +
      '<div class="cal-gutter" style="height:' + H + 'px">' + hours.map((h) => '<span style="top:' + ((h - START) * 60 * PPM) + 'px">' + K.pad(h) + ':00</span>').join('') + '</div>' +
      cols.map((c) => {
        const list = visible.filter((a) => inCol(a, c));
        const timed = list.filter((a) => toMin(a.time) != null)
          .concat(S.breaks.filter((b) => b.on && b.date === c.date && (!c.loc || b.location === c.loc) && brkShown(b)).map((b) => ({ brk: b, time: b.from, endTime: b.to, location: b.location })));
        const untimed = list.filter((a) => toMin(a.time) == null);
        return '<div class="cal-col' + (split ? ' is-split' : '') + (c.date === today ? ' is-today' : '') + (c.date < today ? ' is-past' : '') + '" data-date="' + c.date + '" data-loc="' + esc(c.loc) + '" style="height:' + H + 'px">' +
          hours.slice(0, -1).map((h) => '<i class="cal-hour" style="top:' + ((h - START) * 60 * PPM) + 'px"></i>').join('') +
          (untimed.length ? '<div class="cal-untimed">' + untimed.map((a) => '<button type="button" class="cal-chip is-' + a.status + '" data-id="' + esc(a.id) + '">' + esc(nameOf(a)) + '</button>').join('') + '</div>' : '') +
          (split ? cityLayout(timed) : layout(timed)).map((it) => (it.a.brk ? brkHtml(it) : blockHtml(it))).join('') + '</div>';
      }).join('');
    placeNow();
    if (keepScroll) gridEl.parentElement.scrollTop = prevScroll;
    else {
      const now = new Date();
      const target = cols.some((c) => c.date === today) ? Math.max(0, (now.getHours() * 60 + now.getMinutes() - START * 60 - 90) * PPM) :
        Math.max(0, (Math.min(...visible.map((a) => toMin(a.time) || 10 * 60), 10 * 60) - START * 60 - 30) * PPM);
      gridEl.parentElement.scrollTo({ top: target, behavior: 'auto' });
    }
  }

  // ------------------------------------------------------------------ the phone list (one day)
  // Per city: each appointment as a row (time, client, treatment and price, who does it, status), the
  // free gaps of the working day between them (tap = book there), the "now" line on today.
  // the month on a phone: a dot under each day with bookings (cancelled ones and leave don't
  // count), the picked day lit, today in the accent colour
  function monthHtml() {
    const m = S.date.slice(0, 7), first = K.parse(m + '-01'), lead = (first.getDay() + 6) % 7, days = K.daysIn(m), today = K.today();
    const count = {};
    S.appts.forEach((x) => { if (x.status !== 'anulata' && x.status !== 'concediu' && locOk(x) && empMatch(x)) count[x.date] = (count[x.date] || 0) + 1; });
    const cells = [];
    for (let i = 0; i < lead; i++) cells.push('<span></span>');
    for (let d = 1; d <= days; d++) {
      const iso = m + '-' + K.pad(d), n = count[iso] || 0;
      cells.push('<button type="button" data-mday="' + iso + '" class="' + (iso === S.date ? 'is-sel ' : '') + (iso === today ? 'is-today' : '') + '">' +
        '<b>' + d + '</b>' + (n ? '<i title="' + K.plural(n, 'programare', 'programări') + '"></i>' : '<i class="is-none"></i>') + '</button>');
    }
    return '<div class="cal-mbox-head"><button type="button" class="k-icon-btn" data-mmonth="-1" aria-label="Luna trecută">' + icon('left') + '</button>' +
      '<b>' + K.monthLabel(m) + '</b><button type="button" class="k-icon-btn" data-mmonth="1" aria-label="Luna viitoare">' + icon('right') + '</button></div>' +
      '<div class="cal-mbox-grid">' + ['L', 'M', 'M', 'J', 'V', 'S', 'D'].map((x) => '<em>' + x + '</em>').join('') + cells.join('') + '</div>';
  }

  // Overlapping appointments share the column width (simple lane packing).
  function layout(list) {
    const items = list.map((a) => ({ a, s: toMin(a.time), e: endMin(a) })).sort((x, y) => x.s - y.s);
    const clusters = [];
    items.forEach((it) => {
      const last = clusters[clusters.length - 1];
      if (last && it.s < last.end) { last.items.push(it); last.end = Math.max(last.end, it.e); } else clusters.push({ items: [it], end: it.e });
    });
    clusters.forEach((c) => {
      const lanes = [];
      c.items.forEach((it) => { let l = lanes.findIndex((end) => end <= it.s); if (l === -1) { l = lanes.length; lanes.push(0); } lanes[l] = it.e; it.lane = l; });
      c.items.forEach((it) => { it.lanes = lanes.length; });
    });
    return items;
  }
  // the week with both cities: Timișoara packs in the left half of the day, Arad in the right half
  function cityLayout(list) {
    const left = list.filter((a) => a.location !== LOCS[1]), right = list.filter((a) => a.location === LOCS[1]);
    return [].concat(layout(left).map((it) => Object.assign(it, { base: 0, span: 50 })), layout(right).map((it) => Object.assign(it, { base: 50, span: 50 })));
  }
  // what an appointment is called: the title it had in HighLevel (as reception wrote it there), else the client;
  // the line under it: the client when the title doesn't name her, else the treatment
  const plainTxt = (x) => String(x || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  // the client's name first, the treatment on its own line under it, seen without opening the booking (the owner,
  // 5.11); an imported booking with no treatment shows its title there
  const nameOf = (a) => (a.block ? a.clientName || 'Timp blocat' : a.clientName || a.ghlTitle || '-');
  function treatOf(a) {
    if (a.block) return a.cosmeticianName || 'Toată clinica'; // a blocked time: for whom
    if (a.treatment) return a.treatment;
    return a.ghlTitle && plainTxt(a.ghlTitle) !== plainTxt(a.clientName) ? a.ghlTitle : '';
  }
  // the treatment and its price together, on every booking (the owner, 5.11: see the procedure and the sum without opening it)
  const trLine = (a) => (a.block ? treatOf(a) : [treatOf(a), Number(a.amount) > 0 ? K.lei(a.amount) : ''].filter(Boolean).join(' · '));
  const subOf = (a) => [a.online ? '🌐 online' : '', a.paidSaleId ? 'plătit' : ''].filter(Boolean).join(' · ');
  function blockHtml(it) {
    const a = it.a, st = stOf(a);
    const top = Math.max(0, (it.s - START * 60) * PPM), h = Math.max(30, (Math.min(it.e, END * 60) - it.s) * PPM - 3);
    const base = it.base || 0, w = (it.span || 100) / it.lanes;
    const narrow = it.span && it.lanes > 1; // a half day shared by several bookings: one clean line, the rest in the tooltip
    // as many lines for the name as the block's height holds, so a long title shows whole; a short appointment (half
    // an hour) has the hour in front of the name, in smaller letters, on up to two lines
    const short = it.e - it.s < 30; // under half an hour: one line
    const half = !short && it.e - it.s < 45; // half an hour: the hour in front of the name, the treatment under
    const tiny = phone() && S.view === 'week'; // a phone's week: 7 narrow columns, only the name
    const tr = trLine(a);
    const lines = tiny ? Math.max(1, Math.floor((h - 4) / 23)) : short ? 1 : Math.max(1, Math.min(2, Math.floor((h - 44) / 34)));
    return '<button type="button" class="cal-block is-' + a.status + (a.block ? ' is-block' : '') + (tiny ? ' is-tiny' : narrow ? ' is-narrow' : short ? ' is-short' : '') + '" data-id="' + esc(a.id) + '" style="top:' + top + 'px;height:' + h + 'px;left:calc(' + (base + it.lane * w) + '% + ' + (narrow ? 2 : 3) + 'px);width:calc(' + w + '% - ' + (narrow ? 4 : 6) + 'px);--lines:' + lines + '"' +
      ' title="' + esc(span(a) + ' · ' + nameOf(a) + ' · ' + tr + ' · ' + st.label + (a.location ? ' · ' + a.location : '')) + '">' +
      (narrow ? '<span class="cal-b-t">' + esc(a.time || '') + '</span><b>' + esc(nameOf(a).split(/\s+/)[0]) + '</b>' : tiny ? '<b>' + esc(nameOf(a).split(/[\s-]+/)[0]) + '</b>' + (tr ? '<span class="cal-b-tr">' + esc(tr) + '</span>' : '') : short
        ? '<b><span class="cal-b-t">' + esc(a.time || '') + '</span>' + esc(nameOf(a)) + (tr ? ' · ' + esc(tr) : '') + '</b>'
        : half ? '<b><span class="cal-b-t">' + esc(a.time || '') + '</span>' + esc(nameOf(a)) + '</b>' + (tr ? '<span class="cal-b-tr">' + esc(tr) + '</span>' : '')
        : '<span class="cal-b-time">' + esc(span(a)) + (a.cosmeticianName ? '<i>' + esc(K.initials(a.cosmeticianName)) + '</i>' : '') + '</span>' +
          '<b>' + esc(nameOf(a)) + '</b>' + (tr ? '<span class="cal-b-tr">' + esc(tr) + '</span>' : '') +
          (subOf(a) && h > 80 ? '<span class="cal-b-sub">' + esc(subOf(a)) + '</span>' : '')) + '</button>';
  }
  // the break in the grid: a soft yellow block in her lane, „Pauză <her first name>” (hers, never the clinic's) and the time
  function brkHtml(it) {
    const b = it.a.brk;
    const top = Math.max(0, (it.s - START * 60) * PPM), h = Math.max(24, (Math.min(it.e, END * 60) - it.s) * PPM - 3);
    const base = it.base || 0, w = (it.span || 100) / it.lanes;
    const slim = !!it.span || it.lanes > 1 || (phone() && S.view === 'week'); // a narrow lane: the word and her name
    const tip = 'Pauză ' + b.from + '-' + b.to + ' · ' + b.name + (b.moved ? ' · mutată' : '');
    const tiny = phone() && S.view === 'week'; // a phone's week: 7 narrow columns, only the word
    return '<button type="button" class="cal-brk' + (b.moved ? ' is-moved' : '') + (slim ? ' is-slim' : '') + (tiny ? ' is-tiny' : '') + (canMoveBreak() ? ' is-movable' : '') + '" data-brk="' + esc(brkKey(b)) + '" title="' + esc(tip) + '" aria-label="' + esc(tip) + '"' +
      ' style="top:' + top + 'px;height:' + h + 'px;left:calc(' + (base + it.lane * w) + '% + ' + (slim ? 2 : 3) + 'px);width:calc(' + w + '% - ' + (slim ? 4 : 6) + 'px)">' +
      '<b>Pauză ' + esc(firstName(b.name)) + '</b>' + (tiny ? '' : '<span>' + b.from + '-' + b.to + (slim ? '' : ' · 30 min') + '</span>') + (b.moved ? '<i>mutată</i>' : '') + '</button>';
  }
  function renderSummary(list) {
    const el = panel.querySelector('[data-summary]');
    // a blocked time is counted apart from the leaves, and neither is an appointment
    const c = (s) => list.filter((a) => a.status === s && !a.block).length;
    const blocked = list.filter((a) => a.block).length;
    const live = list.filter((a) => a.status !== 'anulata' && a.status !== 'concediu').length;
    el.innerHTML = '<span class="cal-sum-main">' + K.plural(live, 'programare', 'programări') + (S.view === 'day' ? '' : K.mondayOf(S.date) === K.mondayOf(K.today()) ? ' săptămâna aceasta' : ' în săptămâna afișată') + '</span>' +
      Object.keys(STATUS).filter((s) => c(s)).map((s) => '<span class="k-tag is-' + STATUS[s].tone + '">' + icon(STATUS[s].ic) + c(s) + ' ' + (c(s) === 1 ? STATUS[s].label.toLowerCase() : STATUS[s].plural) + '</span>').join('') +
      (blocked ? '<span class="k-tag is-mute">' + icon('ban') + blocked + ' ' + (blocked === 1 ? 'interval blocat' : 'intervale blocate') + '</span>' : '') +
      (c('programata') && canEdit() ? '<span class="cal-hint">' + icon('info') + 'Programările neconfirmate apar cu albastru, confirmă-le cu un click.</span>' : '');
  }
  function placeNow() {
    if (!gridEl) return;
    gridEl.querySelectorAll('.cal-now').forEach((n) => n.remove());
    const now = new Date(), m = now.getHours() * 60 + now.getMinutes();
    if (m < START * 60 || m > END * 60) return;
    gridEl.querySelectorAll('.cal-col[data-date="' + K.today() + '"]').forEach((col, i) => {
      const line = document.createElement('div');
      line.className = 'cal-now';
      line.style.top = ((m - START * 60) * PPM) + 'px';
      if (i === 0) line.innerHTML = '<span>' + toHM(m) + '</span>';
      col.appendChild(line);
    });
  }

  // ------------------------------------------------------------------ pointer: click slot / drag block
  let drag = null;
  function onPointerDown(e) {
    if (e.button !== 0 && e.pointerType === 'mouse') return;
    const col = e.target.closest('.cal-col');
    if (!col) return;
    // a break: a tap opens its sheet; on a computer the owner and the manager drag it within her shift (30-minute steps)
    const bel = e.target.closest('.cal-brk');
    if (bel) {
      drag = { brkEl: bel, col, sx: e.clientX, sy: e.clientY, started: false, type: e.pointerType, timer: 0, readOnly: !(canMoveBreak() && e.pointerType === 'mouse') };
      window.addEventListener('pointermove', onMove, { passive: false });
      window.addEventListener('pointerup', onUp, { once: true });
      window.addEventListener('pointercancel', onCancel, { once: true });
      return;
    }
    const block = e.target.closest('.cal-block, .cal-chip');
    drag = { block, col, sx: e.clientX, sy: e.clientY, started: false, id: block && block.dataset.id, type: e.pointerType, timer: 0 };
    if (!canEdit()) { drag.readOnly = true; }
    if (block && block.classList.contains('is-concediu')) drag.readOnly = true; // a leave / a blocked time is not moved
    if (block && !drag.readOnly && e.pointerType !== 'mouse' && canEdit()) drag.timer = setTimeout(() => { if (drag && !drag.started) startDrag(e); }, 350);
    window.addEventListener('pointermove', onMove, { passive: false });
    window.addEventListener('pointerup', onUp, { once: true });
    // a finger: the page scrolls from anywhere, a block too (the browser then cancels the pointer); only a held
    // block (dragging) stops the scroll
    window.addEventListener('pointercancel', onCancel, { once: true });
    if (e.pointerType !== 'mouse') window.addEventListener('touchmove', onTouchMove, { passive: false });
  }
  function onTouchMove(e) { if (drag && drag.started) e.preventDefault(); }
  function unbind() {
    window.removeEventListener('pointermove', onMove);
    window.removeEventListener('pointerup', onUp);
    window.removeEventListener('pointercancel', onCancel);
    window.removeEventListener('touchmove', onTouchMove);
  }
  // the browser took the finger for a scroll: nothing opens, a drag in progress goes back
  function onCancel() {
    const d = drag; drag = null;
    unbind();
    if (!d) return;
    clearTimeout(d.timer);
    if (d.brkEl) { if (d.started) { gridEl.classList.remove('is-dragging'); render(true); } return; }
    if (d.started) { gridEl.classList.remove('is-dragging'); render(true); }
  }
  function onMove(e) {
    if (!drag) return;
    const dist = Math.hypot(e.clientX - drag.sx, e.clientY - drag.sy);
    if (drag.brkEl) return moveBreakDrag(e, dist);
    if (!drag.started) {
      if (drag.block && !drag.readOnly && drag.type === 'mouse' && dist > 5 && drag.block.classList.contains('cal-block')) startDrag(e);
      // moved before a hold: it was a scroll, not a tap (nothing opens, nothing is booked)
      else if (dist > 10) { clearTimeout(drag.timer); drag.cancel = true; }
      return;
    }
    e.preventDefault();
    const target = colAt(e.clientX) || drag.col;
    const rect = target.getBoundingClientRect();
    let m = Math.round(((e.clientY - rect.top - drag.oy) / PPM + START * 60) / 15) * 15;
    m = Math.max(START * 60, Math.min(END * 60 - 15, m));
    drag.min = m; drag.target = target;
    if (drag.ghost.parentElement !== target) target.appendChild(drag.ghost);
    drag.ghost.style.top = ((m - START * 60) * PPM) + 'px';
    const gt = drag.ghost.querySelector('.cal-b-time') || drag.ghost.querySelector('.cal-b-t');
    if (gt && gt.firstChild) gt.firstChild.textContent = toHM(m) + (drag.dur ? ' - ' + toHM(Math.min(m + drag.dur, 24 * 60 - 1)) : '');
  }
  // dragging a break: only up and down in its own column, on :00 and :30, inside her shift; over a client of hers it turns red
  function moveBreakDrag(e, dist) {
    const d = drag, b = brkOf(d.brkEl.dataset.brk);
    if (!b) return;
    if (!d.started) {
      if (!d.readOnly && dist > 5) {
        d.started = true;
        d.oy = d.sy - d.brkEl.getBoundingClientRect().top;
        d.ghost = d.brkEl.cloneNode(true);
        d.ghost.classList.add('is-ghost');
        d.brkEl.classList.add('is-src');
        d.col.appendChild(d.ghost);
        gridEl.classList.add('is-dragging');
      } else if (dist > 10) d.cancel = true;
      return;
    }
    e.preventDefault();
    const rect = d.col.getBoundingClientRect();
    let m = Math.round(((e.clientY - rect.top - d.oy) / PPM + START * 60) / 30) * 30;
    const lo = Math.ceil(toMin(b.shiftFrom) / 30) * 30, hi = Math.floor((toMin(b.shiftTo) - BRK) / 30) * 30;
    m = Math.max(lo, Math.min(hi, m));
    d.min = m;
    d.clash = hersAt(b, m, m + BRK);
    d.ghost.style.top = ((m - START * 60) * PPM) + 'px';
    d.ghost.classList.toggle('is-no', !!d.clash);
    const t = d.ghost.querySelector('b');
    if (t) t.textContent = d.clash ? 'Clientă la ' + toHM(m) : 'Pauză ' + toHM(m);
  }
  async function dropBreak(d) {
    const b = brkOf(d.brkEl.dataset.brk);
    if (!d.started) { if (!d.cancel && b) openBreak(b, d.brkEl); return; }
    gridEl.classList.remove('is-dragging');
    if (!b || d.min == null || toHM(d.min) === b.from) { render(true); return; }
    if (d.clash) { render(true); K.ui().toast('La ' + toHM(d.min) + ' ' + firstName(b.name) + ' are o clientă. Pauza rămâne la ' + b.from + '.', 'error'); return; }
    await moveBreak(b, toHM(d.min));
  }
  // the break of that day to another half hour (the server checks the shift and her clients)
  async function moveBreak(b, from) {
    try {
      await K.api('/api/portal-schedule', { action: 'break_set', date: b.date, employeeId: b.employeeId, name: b.name, from });
      K.ui().toast('Pauza ' + firstName(b.name) + ': ' + from + '-' + toHM(toMin(from) + BRK) + (b.date === K.today() ? ', azi' : ', ' + K.relDay(b.date)), 'success');
      await load(true);
      return true;
    } catch (err) { render(true); K.ui().toast(brkErr(err), 'error'); return false; }
  }
  const brkErr = (err) => ({ break_taken: 'Are o clientă atunci. Alege altă oră.', outside_shift: 'Ora e în afara programului ei.', invalid_time: 'Pauza începe doar la fix sau la jumătate.',
    not_working: 'Nu lucrează în ziua asta.', no_break: 'Programul ei din ziua asta e prea scurt pentru pauză.' })[err && err.code] || K.errText(err);
  function colAt(x) { return Array.from(gridEl.querySelectorAll('.cal-col')).find((c) => { const r = c.getBoundingClientRect(); return x >= r.left && x <= r.right; }); }
  function startDrag(e) {
    const d = drag;
    d.started = true;
    const r = d.block.getBoundingClientRect();
    d.oy = d.sy - r.top;
    d.ghost = d.block.cloneNode(true);
    d.ghost.classList.add('is-ghost');
    d.ghost.style.left = '3px'; d.ghost.style.width = 'calc(100% - 6px)';
    d.block.classList.add('is-src');
    const src = S.appts.find((x) => x.id === d.id);
    d.dur = src && toMin(src.endTime) > toMin(src.time) ? toMin(src.endTime) - toMin(src.time) : 0;
    d.col.appendChild(d.ghost);
    gridEl.classList.add('is-dragging');
    if (navigator.vibrate && d.type !== 'mouse') navigator.vibrate(8);
  }
  async function onUp(e) {
    unbind();
    const d = drag; drag = null;
    if (!d) return;
    clearTimeout(d.timer);
    if (d.brkEl) return dropBreak(d);
    if (d.started) {
      gridEl.classList.remove('is-dragging');
      const a = S.appts.find((x) => x.id === d.id);
      const date = d.target.dataset.date, loc = d.target.dataset.loc || a.location, time = toHM(d.min);
      if (!a || (a.date === date && a.time === time && a.location === loc)) { render(true); return; }
      if (!(await placeOk(Object.assign({}, a, { date, time, location: loc, endTime: d.dur ? toHM(Math.min(d.min + d.dur, 24 * 60 - 15)) : a.endTime }), 'Muți programarea', 'Mută oricum'))) { render(true); return; }
      const before = Object.assign({}, a);
      Object.assign(a, { date, time, location: loc });
      if (d.dur) a.endTime = toHM(Math.min(d.min + d.dur, 24 * 60 - 15)); // same length, new place
      render(true);
      try {
        await save(a);
        K.ui().toast(a.clientName + ' → ' + K.relDay(date) + ' ' + span(a) + (loc !== before.location ? ' · ' + loc : ''), 'success');
        // moved onto her break: the break gives way that day (the sheet moves it elsewhere)
        const hit = S.breaks.find((b) => b.on && b.date === a.date && b.employeeId === a.cosmeticianId && toMin(b.from) < endMin(a) && toMin(b.to) > toMin(a.time));
        if (hit) setTimeout(() => K.ui().toast('Peste pauza ' + firstName(hit.name) + ': azi rămâne fără pauză. O poți muta din calendar.', 'info'), 400);
        load(true);
      } catch (err) { Object.assign(a, before); render(true); K.ui().toast(K.errText(err), 'error'); }
      return;
    }
    if (d.cancel) return;
    if (d.block) { openAppt(d.block.dataset.id); return; }
    if (d.readOnly) return;
    // Empty slot → new appointment at that time (rounded to 15 min).
    const rect = d.col.getBoundingClientRect();
    const m = Math.max(START * 60, Math.min(END * 60 - 15, Math.floor(((e.clientY - rect.top) / PPM + START * 60) / 15) * 15));
    openNew({ date: d.col.dataset.date, time: toHM(m), location: d.col.dataset.loc || (S.loc !== 'all' ? S.loc : '') });
  }

  function payload(a) {
    return {
      action: 'update', id: a.id, date: a.date, time: a.time, endTime: a.endTime || '', clientId: a.clientId, clientName: a.clientName, clientPhone: a.clientPhone,
      treatment: a.treatment, categories: K.catsOf(a), amount: a.amount || 0, location: a.location, cosmeticianId: a.cosmeticianId || '', status: a.status, package: !!a.package,
      note: a.note || '',
    };
  }
  const save = (a) => K.api('/api/portal-appointments', payload(a));

  // ------------------------------------------------------------------ drawers
  // with a date and an hour, once the city has a schedule (Program echipă): who works then first, the others still
  // there, marked „(nu lucrează)”; without a schedule, as before
  // the cosmeticians of a city, and the ones of the other clinic scheduled there that day (Program echipă, 16.11)
  function pickable(loc, date) {
    const day = date && teamAt(date, loc);
    const all = ((K.data && K.data.activeEmployees) || []).filter((e) => e.role === 'cosmetician');
    return cosmeticians(loc).concat(day ? all.filter((e) => e.location !== loc && day.has(e.id)) : []);
  }
  function empOptions(sel, loc, when) {
    const list = pickable(loc, when && when.date);
    const on = when && teamAt(when.date, loc, when.time);
    const pairs = on ? list.filter((e) => on.has(e.id)).map((e) => [e.id, e.name]).concat(list.filter((e) => !on.has(e.id)).map((e) => [e.id, e.name + ' (nu lucrează)'])) : list.map((e) => [e.id, e.name]);
    // an appointment already assigned to someone not in the list (moved city, other role) keeps her
    if (sel && !list.some((e) => e.id === sel)) pairs.push([sel, empName(sel) || (leftOf(sel) ? leftOf(sel).name + ' (a plecat)' : 'Cosmeticiana aleasă')]);
    return '<option value="">- alege cosmeticiana</option>' + K.options(pairs, sel);
  }
  // Quick fill from the active offers (treatment + price + category) for the chosen city.
  function offerChips(loc) {
    const key = loc === 'Arad' ? 'arad' : 'timisoara';
    const offers = ((K.data && K.data.offers) || []).filter((o) => !o.locations || !o.locations.length || o.locations.includes(key));
    // the free consultation first, as on the site (the owner, 9.11: „să am și varianta să pun consultația gratuită”)
    return '<div class="cal-offers" data-cal-offers><button type="button" data-offer="consult"><b>Consultație gratuită</b><span>0 lei</span></button>' + offers.map((o) => '<button type="button" data-offer="' + esc(o.id) + '"><b>' + esc(o.title) + '</b><span>' + K.lei(o.priceNew) + '</span></button>').join('') + '</div>';
  }
  // Offers carry the site category (epilare / faciale / remodelare) → the three portal categories.
  function offerCats(o) {
    if (o.category === 'epilare') return ['epilare-laser'];
    if (o.category === 'faciale') return ['faciale'];
    if (o.category === 'remodelare') return ['corporale'];
    return /epilare|laser/.test(K.norm(o.title)) ? ['epilare-laser'] : /facial|restart|hifu/.test(K.norm(o.title)) ? ['faciale'] : ['corporale'];
  }
  function slotOptions(sel) {
    const out = [];
    for (let m = START * 60; m < END * 60; m += 15) out.push([toHM(m), toHM(m)]);
    if (sel && !out.some((o) => o[0] === sel)) out.unshift([sel, sel]);
    return K.options(out, sel);
  }
  // End-time choices after the start, each with its length: "11:30 · 1h 30 min".
  function endOptions(start, sel) {
    const s = toMin(start) != null ? toMin(start) : 10 * 60;
    const out = [];
    for (let m = s + 15; m <= Math.min(s + 8 * 60, 23 * 60 + 45); m += 15) out.push([toHM(m), toHM(m) + '  ·  ' + durText(m - s)]);
    if (sel && toMin(sel) > s && !out.some((o) => o[0] === sel)) out.push([sel, sel + '  ·  ' + durText(toMin(sel) - s)]);
    return K.options(out, sel);
  }
  // The end shown in the form: the saved one, or 1h after the start.
  const formEnd = (a) => (toMin(a.endTime) > toMin(a.time || '10:00') ? a.endTime : toHM(Math.min((toMin(a.time || '10:00')) + DUR, 23 * 60 + 45)));

  function formHtml(a, isNew) {
    return '<form class="k-form" data-form>' +
      K.field('Client', '<input name="clientName" required maxlength="150" placeholder="Caută sau scrie un nume nou" value="' + esc(isNew ? '' : a.clientName || '') + '"' + (isNew ? ' autofocus' : '') + '>', 'full') +
      K.field('Telefon', '<input name="clientPhone" type="tel" required maxlength="30" placeholder="07xx xxx xxx" value="' + esc(isNew ? '' : a.clientPhone || '') + '">', 'full') +
      K.field('Data', '<input name="date" type="date" required value="' + esc(a.date) + '">', 'full') +
      K.field('Începe la', '<select name="time" data-start>' + slotOptions(a.time || '10:00') + '</select>') +
      K.field('Se termină la', '<select name="endTime" data-end>' + endOptions(a.time || '10:00', formEnd(a)) + '</select>') +
      K.field('Locație', K.seg('location', LOCS.map((l) => [l, l, 'pin']), a.location || LOCS[0], 'is-big'), 'full') +
      (isNew ? '<div class="k-field full"><span>Alege din oferte (completează tratamentul și suma)</span><div data-offer-box>' + offerChips(a.location || LOCS[0]) + '</div></div>' : '') +
      K.field('Tratament', '<input name="treatment" required maxlength="200" value="' + esc(a.treatment || '') + '" placeholder="ex: Facial Restart">', 'full') +
      K.field('Categorie (poți alege mai multe)', K.catPicker(K.catsOf(a)), 'full') +
      K.field('Suma programării', '<div class="k-money"><input name="amount" type="number" inputmode="decimal" min="0" step="1" value="' + esc(a.amount || '') + '" placeholder="0"></div>', 'full', 'Cât plătește clienta pentru ce s-a programat. Un upsell (pachet, zonă în plus) se bifează la încasare.') +
      K.field('Cosmeticiană', '<select name="cosmeticianId" data-cos>' + empOptions(a.cosmeticianId || '', a.location || LOCS[0]) + '</select>', 'full') +
      '<div class="cal-brk-hint full" data-brk-hint hidden></div>' +
      '<div class="k-field full">' + K.toggle('package', !!a.package, 'Ședință din pachet') + '<small>Primește doar reamintirile, fără confirmarea programării și fără cererea de recenzie.</small></div>' +
      K.field('Observații', '<textarea name="note" rows="2" maxlength="500" placeholder="ex. vine cu prietena, zona: abdomen">' + esc(a.note || '') + '</textarea>', 'full') +
      (isNew ? K.field('Status', K.seg('status', [['programata', 'Programată'], ['confirmata', 'Confirmată']], 'programata', 'is-big'), 'full') : '') +
      '</form>';
  }

  function wireForm(el, f, apptId) {
    // Moving the start keeps the length (10:00-11:30 → 11:00-12:30).
    let lastStart = f.time.value;
    // her break under the hour picked (the owner, 16.11): a light note, and one tap moves the break with the booking
    // (f._brk, sent as breakMove); nothing picked: the booking stands and she has no break that day
    let brkAsk = '';
    f._brk = null;
    const brkAgain = () => {
      const box = f.querySelector('[data-brk-hint]');
      if (!box) return;
      const v = { date: f.date.value, time: f.time.value, endTime: f.endTime.value, emp: (f.querySelector('[data-cos]') || {}).value || '' };
      const ask = JSON.stringify(v);
      if (ask === brkAsk) return;
      brkAsk = ask;
      const hide = () => { box.hidden = true; box.innerHTML = ''; f._brk = null; };
      if (!v.emp || !/^\d{4}-\d{2}-\d{2}$/.test(v.date) || !v.time) return hide();
      K.api('/api/portal-schedule', { action: 'break_info', date: v.date, employeeId: v.emp, time: v.time, endTime: v.endTime, skipId: apptId || '' }).then((j) => {
        if (brkAsk !== ask || !box.isConnected) return;
        if (!j.clash || !j.break) return hide();
        const b = j.break, who = firstName(empName(v.emp)) || 'cosmeticianei';
        const near = (j.near || []).slice(0, 2).sort();
        const keep = f._brk && (f._brk.off ? !near.length : near.includes(f._brk.from)) ? f._brk : null;
        f._brk = keep;
        box.innerHTML = '<p>' + icon('clock') + '<span>E pauza ' + esc(who) + ', ' + esc(b.from + '-' + b.to) + '.</span></p>' +
          '<div class="cal-brk-pick">' + (near.length ? '<span>Mută pauza la</span>' + near.map((t) => '<button type="button" class="brk-chip' + (keep && keep.from === t ? ' is-on' : '') + '" data-brk-to="' + t + '"><b>' + t + '</b></button>').join('')
            : '<button type="button" class="brk-chip' + (keep ? ' is-on' : '') + '" data-brk-off><b>Fără pauză azi</b></button>') + '</div>' +
          '<small>' + (near.length ? 'Dacă nu alegi, azi rămâne fără pauză.' : 'Nu mai e nicio jumătate de oră liberă în programul ei azi.') + '</small>';
        box.hidden = false;
      }).catch(() => {});
    };
    f.addEventListener('click', (e) => {
      const c = e.target.closest('[data-brk-to], [data-brk-off]');
      if (!c) return;
      const on = !c.classList.contains('is-on');
      f.querySelectorAll('[data-brk-to], [data-brk-off]').forEach((x) => x.classList.remove('is-on'));
      c.classList.toggle('is-on', on);
      f._brk = !on ? null : c.dataset.brkTo ? { from: c.dataset.brkTo } : { off: true };
    });
    f.addEventListener('change', (e) => { if (['date', 'time', 'endTime', 'cosmeticianId', 'location'].includes(e.target.name)) setTimeout(brkAgain, 0); });
    setTimeout(brkAgain, 0);
    // the cosmeticians in the order of who works at that date and hour (Program echipă); fetched once per day
    const cosAgain = () => {
      const v = { date: f.date.value, time: f.time.value }, loc = (f.querySelector('input[name=location]') || {}).value || LOCS[0];
      teamDate(v.date).then(() => {
        const sel = f.querySelector('[data-cos]');
        if (!sel || f.date.value !== v.date || f.time.value !== v.time) return; // changed again meanwhile
        const keep = sel.value;
        sel.innerHTML = empOptions(keep, loc, v); sel.value = keep;
      }).catch(() => {});
    };
    cosAgain();
    f.addEventListener('change', (e) => {
      if (['date', 'time', 'location'].includes(e.target.name)) setTimeout(cosAgain, 0);
      if (e.target.name === 'time') {
        const dur = Math.max(15, (toMin(f.endTime.value) || 0) - (toMin(lastStart) || 0));
        const end = toHM(Math.min(toMin(f.time.value) + dur, 23 * 60 + 45));
        f.endTime.innerHTML = endOptions(f.time.value, end); f.endTime.value = end;
        f.endTime.dispatchEvent(new Event('change')); // custom dropdown label
        lastStart = f.time.value;
        return;
      }
      if (e.target.name !== 'location') return;
      const loc = e.target.value;
      const sel = f.querySelector('[data-cos]');
      const keep = pickable(loc, f.date.value).some((c) => c.id === sel.value) ? sel.value : '';
      sel.innerHTML = empOptions(keep, loc, { date: f.date.value, time: f.time.value }); sel.value = keep;
      const box = f.querySelector('[data-offer-box]');
      if (box) box.innerHTML = offerChips(loc);
    });
    f.addEventListener('click', (e) => {
      const b = e.target.closest('[data-offer]');
      if (!b) return;
      const o = b.dataset.offer === 'consult' ? { title: 'Consultație gratuită', priceNew: 0, consult: true } : (K.data.offers || []).find((x) => x.id === b.dataset.offer);
      if (!o) return;
      f.querySelectorAll('[data-offer]').forEach((x) => x.classList.toggle('is-on', x === b));
      f.treatment.value = o.title;
      f.amount.value = o.priceNew;
      const pick = f.querySelector('[data-catpick]');
      if (o.consult) return; // the category stays the one picked: a consultation can be for the face or the body
      const cats = offerCats(o);
      pick.querySelectorAll('[data-cat]').forEach((x) => { const on = cats.includes(x.dataset.cat); x.classList.toggle('is-on', on); x.setAttribute('aria-pressed', on); });
      pick.querySelector('input[name=categories]').value = cats.join(',');
    });
  }
  const formCats = (v) => String(v.categories || '').split(',').filter(Boolean);

  function openNew(pre) {
    if (!canEdit()) return;
    const loc = pre.location || (K.data && LOCS.includes(K.data.me.location) ? K.data.me.location : LOCS[0]);
    const a = { date: pre.date || S.date, time: pre.time || '', endTime: pre.endTime || '', location: loc, treatment: pre.treatment || '', category: pre.category || '', cosmeticianId: pre.cosmeticianId || S.emp || '' };
    let picker;
    const d = K.drawer({
      title: 'Programare nouă', icon: 'calendar', subtitle: esc(K.dateLong(a.date)) + (a.time ? ' · ' + a.time : '') + ' · ' + esc(loc),
      body: formHtml(a, true),
      footer: '<button type="button" class="k-btn is-ghost is-sm cal-to-block" data-to-block title="Blochează intervalul" aria-label="Blochează intervalul">' + icon('ban') + '<span>Blochează intervalul</span></button><span class="k-grow"></span><button type="button" class="k-btn" data-k-close2>Renunță</button><button type="button" class="k-btn is-accent" data-save>' + icon('check') + 'Programează</button>',
      onMount(el) {
        const f = el.querySelector('[data-form]');
        picker = K.clientPicker(f.clientName, f.clientPhone);
        wireForm(el, f);
        if (pre.clientName) { f.clientName.value = pre.clientName; f.clientPhone.value = pre.clientPhone || ''; }
        // the treatment she asked for (her lead's offer): its chip fills the price and the categories, as a tap would
        // (16.11) her interest as the desk or the form wrote it („LipoSonix 2 zone…”, „lipo”, „Epilare laser”): the offer whose
        // name it matches; none: the categories it names, so the category is never left to guess
        if (pre.treatment) {
          const want = K.norm(pre.treatment).trim();
          const chips = Array.from(f.querySelectorAll('[data-offer]')).map((b) => ({ b, o: (K.data.offers || []).find((x) => x.id === b.dataset.offer) })).filter((x) => x.o);
          const first = (t) => K.norm(t).trim().split(/[\s+·,-]+/)[0] || '';
          const hit = chips.find((x) => x.o.title === pre.treatment) || chips.find((x) => K.norm(x.o.title).trim() === want) ||
            chips.find((x) => want && (K.norm(x.o.title).includes(want) || want.includes(K.norm(x.o.title).trim()))) ||
            chips.find((x) => first(want).length >= 4 && first(x.o.title) === first(want));
          if (hit) hit.b.click();
          else {
            const cats = offerCats({ title: pre.treatment });
            const pick = f.querySelector('[data-catpick]');
            if (pick && !formCats(K.formValues(f)).length) {
              pick.querySelectorAll('[data-cat]').forEach((x) => { const on = cats.includes(x.dataset.cat); x.classList.toggle('is-on', on); x.setAttribute('aria-pressed', on); });
              pick.querySelector('input[name=categories]').value = cats.join(',');
            }
          }
        }
        if (pre.amount && !Number(f.amount.value)) f.amount.value = pre.amount;
        el.querySelector('[data-k-close2]').addEventListener('click', () => d.close());
        el.querySelector('[data-to-block]').addEventListener('click', () => { const v = K.formValues(f); d.close(); setTimeout(() => openBlock({ date: v.date, time: v.time, endTime: v.endTime, location: v.location, cosmeticianId: v.cosmeticianId }), 230); });
        f.addEventListener('submit', (e) => { e.preventDefault(); el.querySelector('[data-save]').click(); });
        el.querySelector('[data-save]').addEventListener('click', (e) => K.busy(e.currentTarget, async () => {
          const v = K.formValues(f);
          if (!v.clientName || !v.clientPhone) { K.ui().toast('Completează clientul și telefonul.', 'error'); return; }
          if (!v.treatment) { K.ui().toast('Completează tratamentul.', 'error'); f.treatment.focus(); return; }
          if (!formCats(v).length) { K.ui().toast('Alege cel puțin o categorie.', 'error'); return; }
          // 0 lei is a real booking too (the owner, 14.11): the free consultation, or one whose price is set and paid at the
          // clinic; an empty sum counts as 0
          if (!v.cosmeticianId) { K.ui().toast('Alege cosmeticiana.', 'error'); return; }
          if (!(await placeOk(v, 'Programezi', 'Programează oricum'))) return;
          const body = Object.assign({ action: 'create', clientId: picker.id(), leadId: pre.leadId || '' }, v, { categories: formCats(v), amount: Number(v.amount) || 0 }, f._brk ? { breakMove: f._brk } : {});
          try {
            let made;
            try { made = await K.api('/api/portal-appointments', body); }
            catch (err) {
              if (err.code !== 'same_day') throw err;
              // she already has an appointment that day: a second one only when the desk says so
              const list = ((err.data && err.data.existing) || []).map((x) => (x.time ? x.time + (x.endTime ? '-' + x.endTime : '') : 'fără oră') + (x.treatment ? ' · ' + x.treatment : '')).join(', ');
              if (!(await K.ui().confirm({ title: v.clientName + ' are deja o programare în ziua asta', message: list + '. Faci încă una?', confirmText: 'Da, încă una' }))) return;
              made = await K.api('/api/portal-appointments', Object.assign(body, { force: true }));
            }
            d.close();
            K.ui().toast('Programat: ' + v.clientName + ' · ' + K.relDay(v.date) + ' ' + span(v), 'success');
            S.date = v.date;
            if (S.view === 'day' && S.loc !== 'all' && S.loc !== v.location) { S.loc = 'all'; }
            if (panel) load(true); // booked from Mesaje: the Calendar may not be open yet
            K.emit('tasks:changed');
            K.emit('appointment:created', made && made.appointment);
          } catch (err) { K.ui().toast(brkErr(err), 'error'); }
        }));
      },
    });
  }

  // what is already at this time, in words ('' when nothing): a blocked time (the whole clinic of the city or this
  // cosmetician), her leave that day, another client of hers at the same hour. The day's rows come from the server when
  // the Calendar shows another range (a booking from Mesaje or the Pipeline).
  async function clashAt(v) {
    const [from, to] = String(S.range || '|').split('|');
    let rows = S.appts;
    if (!(from && v.date >= from && v.date <= to)) {
      try { rows = (await K.api('/api/portal-appointments', { action: 'list', from: v.date, to: v.date })).appointments || []; } catch (e) { rows = []; }
    }
    const s = toMin(v.time), e = toMin(v.endTime) > s ? toMin(v.endTime) : s + DUR;
    const over = (x) => s != null && x.time && s < endMin(x) && e > toMin(x.time);
    const out = [];
    const b = rows.find((x) => x.block && x.id !== v.id && x.date === v.date && x.location === v.location && (!x.cosmeticianId || x.cosmeticianId === v.cosmeticianId) && (!x.time || over(x)));
    if (b) out.push('Interval blocat: ' + blockText(b));
    if (v.cosmeticianId) {
      const leave = rows.find((x) => x.status === 'concediu' && !x.block && x.date === v.date && x.cosmeticianId === v.cosmeticianId);
      if (leave) out.push((leave.cosmeticianName || 'Cosmeticiana') + ' e în concediu în ziua asta');
      // two clients of hers at the same hour are allowed without a word (the owner, 19.10: it is useful)
    }
    return out.join('. ');
  }
  // nothing in the way, or the desk says go on anyway
  async function placeOk(v, ask, go) {
    const why = await clashAt(v);
    return !why || K.ui().confirm({ title: 'Ora nu e liberă', message: why + '. ' + ask + ' oricum?', confirmText: go });
  }
  const blockText = (b) => (b.clientName || 'Timp blocat') + ' · ' + (span(b) || 'toată ziua') + (b.cosmeticianName ? ' · ' + b.cosmeticianName : '');
  const digits = (p) => String(p || '').replace(/\D/g, '').slice(-9);
  function openBlock(pre) {
    if (!canEdit()) return;
    const loc = pre.location || (S.loc !== 'all' ? S.loc : K.data && LOCS.includes(K.data.me.location) ? K.data.me.location : LOCS[0]);
    const editing = !!pre.id;
    const allDay0 = editing && !pre.time;
    const start = pre.time || '13:00';
    const a = { time: start, endTime: pre.endTime || '' };
    const d = K.drawer({
      title: editing ? 'Modifică intervalul blocat' : 'Blochează timp', icon: 'ban', subtitle: esc(K.dateLong(pre.date || S.date)) + ' · ' + esc(loc),
      body: '<form class="k-form" data-form>' +
        K.field('Motiv', '<input name="label" maxlength="80" placeholder="ex. Pauză de masă, ședință, curățenie" value="' + esc(pre.label || '') + '"' + (editing ? '' : ' autofocus') + '>', 'full') +
        K.field('Data', '<input name="date" type="date" required value="' + esc(pre.date || S.date) + '">', 'full') +
        '<div class="k-field full">' + K.toggle('allDay', allDay0, 'Toată ziua') + '</div>' +
        K.field('Începe la', '<select name="time" data-start>' + slotOptions(start) + '</select>') +
        K.field('Se termină la', '<select name="endTime" data-end>' + endOptions(start, formEnd(a)) + '</select>') +
        K.field('Locație', K.seg('location', LOCS.map((l) => [l, l, 'pin']), loc, 'is-big'), 'full') +
        K.field('Pentru', '<select name="cosmeticianId" data-cos>' + blockFor(pre.cosmeticianId || '', loc) + '</select>', 'full') +
        '</form>',
      footer: '<span class="k-grow"></span><button type="button" class="k-btn" data-k-close2>Renunță</button><button type="button" class="k-btn is-accent" data-save>' + icon(editing ? 'check' : 'ban') + (editing ? 'Salvează' : 'Blochează') + '</button>',
      onMount(el) {
        const f = el.querySelector('[data-form]');
        let lastStart = f.time.value;
        const hours = () => { const all = f.querySelector('input[name=allDay]').checked; [f.time, f.endTime].forEach((x) => { const box = x.closest('.k-field'); if (box) box.hidden = all; }); };
        hours();
        f.addEventListener('change', (e) => {
          if (e.target.name === 'allDay') return hours();
          if (e.target.name === 'time') {
            const dur = Math.max(15, (toMin(f.endTime.value) || 0) - (toMin(lastStart) || 0));
            const end = toHM(Math.min(toMin(f.time.value) + dur, 23 * 60 + 45));
            f.endTime.innerHTML = endOptions(f.time.value, end); f.endTime.value = end;
            f.endTime.dispatchEvent(new Event('change'));
            lastStart = f.time.value;
            return;
          }
          if (e.target.name === 'location') { const sel = f.querySelector('[data-cos]'); sel.innerHTML = blockFor('', e.target.value); sel.value = ''; }
        });
        el.querySelector('[data-k-close2]').addEventListener('click', () => d.close());
        f.addEventListener('submit', (e) => { e.preventDefault(); el.querySelector('[data-save]').click(); });
        el.querySelector('[data-save]').addEventListener('click', (e) => K.busy(e.currentTarget, async () => {
          const v = K.formValues(f);
          const all = !!f.querySelector('input[name=allDay]').checked;
          try {
            await K.api('/api/portal-appointments', { action: 'block', id: pre.id || '', date: v.date, time: all ? '' : v.time, endTime: all ? '' : v.endTime, location: v.location, cosmeticianId: v.cosmeticianId || '', label: v.label || '' });
            d.close();
            K.ui().toast((editing ? 'Interval schimbat: ' : 'Blocat: ') + K.relDay(v.date) + (all ? ', toată ziua' : ' ' + v.time + ' - ' + v.endTime) + ' · ' + v.location, 'success');
            S.date = v.date;
            if (panel) load(true);
          } catch (err) { K.ui().toast(err.code === 'invalid_time' ? 'Ora de sfârșit trebuie să fie după cea de început.' : K.errText(err), 'error'); }
        }));
      },
    });
  }
  // "Pentru": the whole clinic of the city, or one cosmetician
  function blockFor(sel, loc) { return '<option value="">Toată clinica</option>' + K.options(cosmeticians(loc).map((e) => [e.id, e.name]), sel); }

  // "Clienta" in an appointment: what her sheet says, in short, and the button to the whole sheet (it opens over
  // the Calendar, and closing it leaves you there)
  async function clientCard(box, a) {
    let j;
    try { j = await K.api('/api/portal-contacts', { action: 'get', id: a.clientId }); }
    catch (e) {
      // her sheet isn't where the appointment points (an old link from HighLevel): found by her phone instead
      if (!box.isConnected) return;
      if (!a.clientPhone) { box.remove(); return; }
      box.innerHTML = '<h4>' + icon('user') + 'Clienta</h4><button type="button" class="k-btn is-outline cal-client-open" data-open-phone>' + icon('user') + 'Deschide fișa clientei' + icon('arrow') + '</button>';
      box.querySelector('[data-open-phone]').addEventListener('click', () => K.emit('contacts:open-phone', a.clientPhone));
      return;
    }
    if (!box.isConnected) return;
    const c = j.contact || {}, appts = j.appointments || [], pays = j.payments || [];
    const notes = ((j.detail && j.detail.notes) || []).slice(0, 2);
    // her visits before this one (an earlier one today counts too)
    const done = appts.filter((x) => x.status === 'finalizata' && x.id !== a.id);
    const last = done.map((x) => x.date).filter((x) => x <= K.today()).sort().pop();
    const paid = pays.reduce((s, p) => s + Number(p.amount || 0), 0);
    const photos = c.photosCount || 0;
    // what she still owes for a package (16.11): seen before the visit, paid from the same sheet („Încasează restul”)
    const dues = j.dues || [], owed = dues.reduce((x, d) => x + Number(d.rest || 0), 0);
    box.innerHTML = '<h4>' + icon('user') + 'Clienta</h4>' +
      '<div class="cal-client-top">' + (a.clientPhone ? '<a href="#mesaje" class="cal-client-who" data-chat="' + esc(a.clientPhone) + '" data-chat-name="' + esc(a.clientName || '') + '" data-chat-city="' + esc(a.location || '') + '" title="Deschide conversația">' : '<div>') + '<b>' + esc(c.name || a.clientName) + '</b><span>' + esc([c.phone, c.email].filter(Boolean).join(' · ')) + '</span>' + (a.clientPhone ? '</a>' : '</div>') +
        ((c.tags || []).length ? '<div class="cal-client-tags">' + c.tags.slice(0, 4).map((t) => '<span class="k-tag">' + esc(t) + '</span>').join('') + '</div>' : '') + '</div>' +
      '<div class="cal-client-stats"><span><b>' + appts.length + '</b>' + (appts.length === 1 ? 'programare' : 'programări') + '</span>' +
        '<span><b>' + (last ? esc(K.dateShort(last)) : '-') + '</b>ultima vizită</span>' +
        '<span><b>' + K.lei(paid) + '</b>plătit</span>' + (photos ? '<span><b>' + photos + '</b>' + (photos === 1 ? 'poză' : 'poze') + '</span>' : '') + '</div>' +
      (owed > 0 ? '<button type="button" class="cal-rest" data-rest-pay title="' + esc(dues.map((d) => d.name + ': ' + K.lei(d.rest)).join(' · ')) + '">' + icon('wallet') + '<span>Rest <b>' + K.lei(owed) + '</b></span>' + (K.payRest && dues.length === 1 ? '<em>Încasează</em>' : '') + '</button>' : '') +
      (notes.length ? '<div class="cal-client-notes">' + notes.map((n) => '<p>' + esc(String(n.text || '').slice(0, 160)) + (String(n.text || '').length > 160 ? '…' : '') + '<small>' + esc(n.author || '') + (n.at ? ' · ' + esc(K.ago(n.at)) : '') + '</small></p>').join('') + '</div>' : '') +
      '<button type="button" class="k-btn is-outline cal-client-open" data-open-client>' + icon('user') + 'Deschide fișa clientei' + icon('arrow') + '</button>';
    box.querySelector('[data-open-client]').addEventListener('click', () => K.emit('contacts:open', { id: a.clientId, tab: 'fise' }));
    const rp = box.querySelector('[data-rest-pay]');
    if (rp) rp.addEventListener('click', () => {
      // one package: its rest is paid right here; several: her sheet, where each has its line
      if (K.payRest && dues.length === 1) K.payRest({ id: dues[0].id, client: c.name || a.clientName, what: dues[0].name, rest: dues[0].rest, total: dues[0].total, paid: Math.max(0, dues[0].total - dues[0].rest) }, { from: rp });
      else K.emit('contacts:open', { id: a.clientId, tab: 'istoric' });
    });
  }
  // her client, in short, for the cosmetician (16.11): when she last came, what she did, what is left of a package. The
  // amounts she may see (the rest of a package, as in Încasări); no totals of what the client paid.
  async function clientBrief(box, a) {
    let j;
    try { j = await K.api('/api/portal-contacts', { action: 'get', id: a.clientId }); } catch (e) { if (box.isConnected) box.remove(); return; }
    if (!box.isConnected) return;
    const appts = (j.appointments || []).filter((x) => x.id !== a.id);
    const done = appts.filter((x) => x.status === 'finalizata' && x.date <= K.today());
    const last = done.map((x) => x.date).sort().pop() || '';
    const treats = [...new Set(done.slice().sort((x, y) => (x.date < y.date ? 1 : -1)).map((x) => String(x.treatment || '').trim()).filter(Boolean))].slice(0, 3);
    const owed = (j.dues || []).reduce((x, d) => x + Number(d.rest || 0), 0);
    box.innerHTML = '<h4>' + icon('user') + 'Clienta</h4>' +
      '<div class="cal-client-stats"><span><b>' + (last ? esc(K.dateShort(last)) : '-') + '</b>' + (last ? 'ultima vizită' : 'prima vizită') + '</span>' +
        '<span><b>' + done.length + '</b>' + (done.length === 1 ? 'vizită' : 'vizite') + '</span>' +
        (owed > 0 ? '<span class="is-warn"><b>' + K.lei(owed) + '</b>rest din pachet</span>' : '') + '</div>' +
      (treats.length ? '<div class="cal-client-treats">' + treats.map((t) => '<span class="k-tag">' + esc(t) + '</span>').join('') + '</div>' : '');
  }
  // ------------------------------------------------------------------ online booking (the site, /programare)
  // When the clinics take bookings from the site: the hours per weekday, how many clients at once, the days closed.
  // The free hours the site shows are these minus what is in this Calendar (bookings, blocked time, leaves).
  const WD_ONLINE = [[1, 'Luni'], [2, 'Marți'], [3, 'Miercuri'], [4, 'Joi'], [5, 'Vineri'], [6, 'Sâmbătă'], [0, 'Duminică']];
  async function openOnline() {
    let d;
    try { d = await K.api('/api/portal-booking', { action: 'get' }); } catch (err) { K.ui().toast(K.errText(err), 'error'); return; }
    const st = d.settings;
    const times = (v) => { const out = []; for (let m = 7 * 60; m <= 22 * 60; m += 30) out.push(K.pad(Math.floor(m / 60)) + ':' + K.pad(m % 60)); if (v && !out.includes(v)) out.push(v); return out.sort().map((t) => [t, t]); };
    const cityHtml = (c) => {
      const x = st.cities[c];
      return '<section class="onl-city"><div class="onl-city-h"><b>' + icon('pin') + esc(c) + '</b><span>' + K.plural(d.upcoming[c] || 0, 'programare online', 'programări online') + ' de acum încolo</span></div>' +
        '<div class="onl-cap"><span>Ziua</span><span>Program · cliente în paralel</span></div>' +
        '<div class="onl-days">' + WD_ONLINE.map(([n, name]) => { const y = x.days[n]; const k = c + '|' + n;
          return '<div class="onl-day' + (y.on ? '' : ' is-off') + '" data-day="' + esc(k) + '">' + K.toggle('on|' + k, y.on, name) +
            '<span class="onl-set"><select name="from|' + esc(k) + '" aria-label="De la">' + K.options(times(y.from), y.from) + '</select><i>-</i><select name="to|' + esc(k) + '" aria-label="Până la">' + K.options(times(y.to), y.to) + '</select>' +
            '<select name="at|' + esc(k) + '" class="onl-at" aria-label="Câte cliente în paralel">' + K.options([1, 2, 3, 4].map((v) => [String(v), v + (v === 1 ? ' clientă' : ' cliente')]), String(y.at || 1)) + '</select></span></div>'; }).join('') + '</div>' +
        '<div class="onl-closed"><span>Zile închise</span><div class="onl-chips" data-closed="' + esc(c) + '">' + x.closed.map((dt) => chip(dt)).join('') + '</div>' +
        '<span class="onl-add"><input type="date" data-add-date="' + esc(c) + '" min="' + K.today() + '" aria-label="Zi închisă"><button type="button" class="k-btn is-outline is-sm" data-add="' + esc(c) + '">' + icon('plus') + 'Adaugă</button></span></div></section>';
    };
    const chip = (dt) => '<span class="onl-chip" data-date="' + dt + '">' + esc(K.dateShort(dt)) + '<button type="button" aria-label="Scoate" data-rm>' + icon('x') + '</button></span>';
    const url = 'https://www.centrul360.com/programare';
    K.drawer({
      title: 'Programări online', icon: 'globe',
      body: '<form class="onl" data-onl novalidate>' +
        '<div class="onl-top">' + K.toggle('on', st.on, 'Programările de pe site sunt pornite') +
        '<a class="onl-link" href="' + url + '" target="_blank" rel="noopener">' + icon('link') + 'centrul360.com/programare</a></div>' +
        cityHtml('Timișoara') + cityHtml('Arad') +
        '<div class="onl-gen">' + K.field('Cel mai devreme', '<select name="notice">' + K.options([[180, 'peste 3 ore'], [240, 'peste 4 ore'], [360, 'peste 6 ore'], [720, 'peste 12 ore'], [1440, 'cu o zi înainte']].map(([v, l]) => [String(v), l]), String(st.notice)) + '</select>') +
        K.field('Cât de departe', '<select name="ahead">' + K.options([[7, 'o săptămână'], [14, '2 săptămâni'], [21, '3 săptămâni'], [30, 'o lună'], [60, '2 luni']].map(([v, l]) => [String(v), l]), String(st.ahead)) + '</select>') +
        K.field('Orele din 30 în 30', '<select name="step">' + K.options([[15, 'din 15 în 15 min'], [30, 'din 30 în 30 min'], [60, 'la fix']].map(([v, l]) => [String(v), l]), String(st.step)) + '</select>') + '</div>' +
        '<div class="mo-note">' + icon('info') + 'Pe site apar doar orele libere: programul de mai sus, minus ce e deja în Calendar (programări, timp blocat, concedii, pauzele cosmeticienelor). Ziua cu un concediu are o clientă în minus.</div>' +
        '<div class="mo-note">' + icon('users') + 'Când orașul are Program echipă, ziua e deschisă dacă lucrează cineva, chiar dacă aici e oprită sau închisă. Aici se taie doar orele de pe site.</div>' +
        '</form>',
      footer: '<span class="k-grow"></span><button type="button" class="k-btn is-primary" data-save>' + icon('check') + 'Salvează</button>',
      onMount(el) {
        const f = el.querySelector('[data-onl]');
        f.addEventListener('change', (e) => { const row = e.target.closest('.onl-day'); if (row && e.target.name && e.target.name.startsWith('on|')) row.classList.toggle('is-off', !e.target.checked); });
        el.addEventListener('click', (e) => {
          const rm = e.target.closest('[data-rm]'); if (rm) { rm.closest('.onl-chip').remove(); return; }
          const add = e.target.closest('[data-add]');
          if (add) {
            const c = add.dataset.add, inp = el.querySelector('[data-add-date="' + c + '"]'), box = el.querySelector('[data-closed="' + c + '"]');
            if (!inp.value) { inp.focus(); return; }
            if (!box.querySelector('[data-date="' + inp.value + '"]')) box.insertAdjacentHTML('beforeend', chip(inp.value));
            inp.value = '';
          }
        });
        el.querySelector('[data-save]').addEventListener('click', (e) => K.busy(e.currentTarget, async () => {
          const v = K.formValues(f);
          const out = { on: !!v.on, notice: Number(v.notice), ahead: Number(v.ahead), step: Number(v.step), cities: {} };
          ['Timișoara', 'Arad'].forEach((c) => {
            const days = {};
            WD_ONLINE.forEach(([n]) => { const k = c + '|' + n; days[n] = { on: !!v['on|' + k], from: v['from|' + k], to: v['to|' + k], at: Number(v['at|' + k]) || 1 }; });
            const bad = Object.values(days).find((x) => x.on && x.to <= x.from);
            if (bad) throw Object.assign(new Error('În ' + c + ', o zi se termină înainte să înceapă.'), { shown: true });
            out.cities[c] = { days, closed: [...el.querySelectorAll('[data-closed="' + c + '"] [data-date]')].map((x) => x.dataset.date) };
          });
          await K.api('/api/portal-booking', { action: 'save', settings: out });
          K.ui().toast(out.on ? 'Salvat. Site-ul arată noile ore libere.' : 'Salvat. Programările de pe site sunt oprite.', 'success');
          K.closeDrawer();
        }).catch((err) => K.ui().toast(err.shown ? err.message : K.errText(err), 'error')));
      },
    });
  }

  // ------------------------------------------------------------------ Program echipă (the owner, 9.11: „unde trec programul fetelor”)
  // Who works when (api/portal-schedule.js): kept per day for a minute, read by the strip on top of the day and by the
  // booking form; the admin sets it in the drawer (a week per cosmetician, plus the days that differ).
  const TEAM = { days: {}, cities: {}, at: {} };
  const TEAM_TTL = 60e3;
  async function teamRange(from, to, force) {
    const fresh = (d) => TEAM.at[d] && Date.now() - TEAM.at[d] < TEAM_TTL;
    let all = true;
    for (let d = from; d <= to; d = K.addDays(d, 1)) if (!fresh(d)) { all = false; break; }
    if (all && !force) return;
    const j = await K.api('/api/portal-schedule', { action: 'get', from, to });
    TEAM.cities = j.cities || {};
    const now = Date.now();
    for (let d = from; d <= to; d = K.addDays(d, 1)) { TEAM.days[d] = (j.works || {})[d] || {}; TEAM.at[d] = now; }
  }
  const teamDate = (d) => (/^\d{4}-\d{2}-\d{2}$/.test(d || '') ? teamRange(d, d) : Promise.resolve());
  // the ids working in a city at a date and hour (a Set), or null when that city has no schedule (then: as before)
  function teamAt(date, loc, time) {
    if (!TEAM.cities[loc] || !TEAM.days[date]) return null;
    const t = toMin(time);
    return new Set((TEAM.days[date][loc] || []).filter((w) => t == null || (toMin(w.from) <= t && t < toMin(w.to))).map((w) => w.employeeId));
  }
  // „9-17”, „12:30-20”
  const hShort = (t) => String(t || '').replace(/^0(\d)/, '$1').replace(/:00$/, '');
  function renderTeam() {
    const el = panel && panel.querySelector('[data-team]');
    if (!el) return;
    const locs = S.loc === 'all' ? LOCS : [S.loc];
    const day = TEAM.days[S.date];
    const shown = S.view === 'day' && day ? locs.filter((l) => TEAM.cities[l] || (day[l] || []).length) : [];
    el.hidden = !shown.length;
    if (!shown.length) { el.innerHTML = ''; return; }
    el.innerHTML = '<span class="cal-team-k">' + icon('users') + 'La lucru</span>' + shown.map((l) => {
      const list = day[l] || [];
      return '<span class="cal-team-c">' + (shown.length > 1 || S.loc === 'all' ? '<b>' + esc(l) + '</b>' : '') +
        (list.length ? list.map((w) => {
          // her break, quietly, next to her hours (a tap opens it)
          const b = S.breaks.find((x) => x.date === S.date && x.employeeId === w.employeeId);
          return '<span class="cal-team-p"><span class="k-tag">' + esc(String(w.name || empName(w.employeeId) || '').split(' ')[0]) + ' ' + esc(hShort(w.from) + '-' + hShort(w.to)) + '</span>' +
            (b ? '<button type="button" class="cal-team-brk' + (b.on ? '' : ' is-off') + '" data-brk-open="' + esc(brkKey(b)) + '">' + (b.on ? 'pauză ' + esc(b.from) : 'fără pauză') + '</button>' : '') + '</span>';
        }).join('')
          : '<span class="k-tag is-mute">nimeni</span>') + '</span>';
    }).join('');
  }

  const WD_TEAM = [['1', 'Luni'], ['2', 'Marți'], ['3', 'Miercuri'], ['4', 'Joi'], ['5', 'Vineri'], ['6', 'Sâmbătă'], ['7', 'Duminică']];
  async function openTeam() {
    const from = K.today(), to = K.addDays(from, 180);
    let d;
    try { d = await K.api('/api/portal-schedule', { action: 'get', from, to }); } catch (err) { K.ui().toast(K.errText(err), 'error'); return; }
    const times = (v) => { const out = []; for (let m = 7 * 60; m <= 22 * 60; m += 30) out.push(K.pad(Math.floor(m / 60)) + ':' + K.pad(m % 60)); if (v && !out.includes(v)) out.push(v); return out.sort().map((t) => [t, t]); };
    const cityOf = (p) => (d.weekly[p.id] && d.weekly[p.id].location) || p.location || LOCS[0];
    const excText = (x) => (x.on ? hShort(x.from) + '-' + hShort(x.to) + (x.location ? ' · ' + x.location : '') : 'liberă');
    const excChips = (id) => Object.keys(d.dates).sort().filter((dt) => d.dates[dt][id]).map((dt) =>
      '<span class="onl-chip" data-exc-date="' + dt + '">' + esc(K.dateShort(dt) + ': ' + excText(d.dates[dt][id])) + '<button type="button" aria-label="Scoate" data-exc-rm>' + icon('x') + '</button></span>').join('');
    const card = (p) => {
      const w = d.weekly[p.id], days = (w && w.days) || {};
      return '<section class="onl-city tm-emp" data-emp="' + esc(p.id) + '"><div class="onl-city-h"><b>' + icon('user') + esc(p.name) + '</b>' + (p.role && p.role !== 'cosmetician' ? K.roleTag(p.role) : '') +
        (w ? '' : '<span>fără program</span>') + '<select name="loc" class="tm-loc" aria-label="Orașul">' + K.options(LOCS.map((l) => [l, l]), cityOf(p)) + '</select></div>' +
        '<div class="onl-days">' + WD_TEAM.map(([k, name]) => { const y = days[k] || { on: false, from: '09:00', to: '17:00' };
          return '<div class="onl-day' + (y.on ? '' : ' is-off') + '">' + K.toggle('on|' + k, y.on, name) +
            '<span class="onl-set"><select name="from|' + k + '" aria-label="De la">' + K.options(times(y.from), y.from) + '</select><i>-</i><select name="to|' + k + '" aria-label="Până la">' + K.options(times(y.to), y.to) + '</select></span></div>'; }).join('') + '</div>' +
        '<div class="tm-save"><button type="button" class="k-btn is-primary is-sm" data-tm-save>' + icon('check') + 'Salvează</button></div>' +
        '<div class="onl-closed"><span>Excepții</span><div class="onl-chips" data-exc>' + excChips(p.id) + '</div>' +
        '<span class="onl-add tm-add"><input type="date" name="exd" min="' + K.today() + '" aria-label="Ziua">' +
        '<select name="exk" aria-label="Ce se schimbă">' + K.options([['off', 'Liberă'], ['on', 'Alt program']], 'off') + '</select>' +
        '<span class="tm-hours" hidden><select name="exf" aria-label="De la">' + K.options(times('09:00'), '09:00') + '</select><i>-</i><select name="ext" aria-label="Până la">' + K.options(times('17:00'), '17:00') + '</select>' +
        '<select name="exl" aria-label="Orașul">' + K.options(LOCS.map((l) => [l, l]), cityOf(p)) + '</select></span>' +
        '<button type="button" class="k-btn is-outline is-sm" data-exc-add>' + icon('plus') + 'Adaugă</button></span></div></section>';
    };
    const body = () => {
      if (!d.people.length) return K.empty('users', 'Nicio cosmeticiană activă', '');
      const desk = d.people.some((p) => p.role && p.role !== 'cosmetician');
      return (desk ? '<p class="ct-hint">' + icon('info') + 'Locurile pentru cliente le fac doar orele cosmeticienelor. Orele recepției sunt pentru planificarea echipei.</p>' : '') +
        '<div class="onl tm">' + LOCS.map((l) => { const list = d.people.filter((p) => cityOf(p) === l).sort((a, b) => (a.role && a.role !== 'cosmetician' ? 1 : 0) - (b.role && b.role !== 'cosmetician' ? 1 : 0));
        return list.length ? '<h4 class="tm-city">' + icon('pin') + esc(l) + '</h4>' + list.map(card).join('') : ''; }).join('') + '</div>';
    };
    const changed = () => { Object.keys(TEAM.at).forEach((k) => delete TEAM.at[k]); if (panel && K.isActive('programari')) load(true); };
    // a change that leaves her bookings without a cosmetician (a day off, the other city): a line in her card, a tap shows them
    const affectedNote = (box, r, name) => {
      const old = box.querySelector('[data-tc-note]'); if (old) old.remove();
      const list = (r && r.affected) || [];
      if (!list.length) return;
      box.querySelector('.onl-city-h').insertAdjacentHTML('afterend', '<button type="button" class="cal-left tc-note" data-tc-note>' + icon('users') + '<span><b>' +
        (list.length === 1 ? 'O programare rămâne' : list.length + ' programări rămân') + '</b> fără cosmeticiană. <u>Mută-le</u></span>' + icon('right') + '</button>');
      box.querySelector('[data-tc-note]').addEventListener('click', (e) => K.affectedSheet(list, { from: e.currentTarget, why: 'programul ' + firstName(name) + ' s-a schimbat' }));
    };
    const post = async (payload) => { const r = await K.api('/api/portal-schedule', Object.assign({ from, to }, payload)); d = r; changed(); return r; };
    K.drawer({
      title: 'Program echipă', icon: 'users', width: 560,
      body: body(),
      onMount(el) {
        el.addEventListener('change', (e) => {
          const row = e.target.closest('.onl-day');
          if (row && e.target.name && e.target.name.startsWith('on|')) row.classList.toggle('is-off', !e.target.checked);
          if (e.target.name === 'exk') e.target.closest('.tm-add').querySelector('.tm-hours').hidden = e.target.value !== 'on';
        });
        el.addEventListener('click', (e) => {
          const box = e.target.closest('[data-emp]');
          if (!box) return;
          const id = box.dataset.emp, p = d.people.find((x) => x.id === id) || { name: '' };
          const val = (n) => (box.querySelector('[name="' + n + '"]') || {}).value;
          const repaint = () => { const c = box.querySelector('[data-exc]'); if (c) c.innerHTML = excChips(id); };
          const err = (x) => K.ui().toast(x.shown ? x.message : K.errText(x), 'error');
          if (e.target.closest('[data-tm-save]')) {
            const days = {};
            WD_TEAM.forEach(([k]) => { days[k] = { on: !!(box.querySelector('[name="on|' + k + '"]') || {}).checked, from: val('from|' + k), to: val('to|' + k) }; });
            const bad = WD_TEAM.find(([k]) => days[k].on && days[k].to <= days[k].from);
            if (bad) { K.ui().toast(bad[1] + ': ora de final e înainte de început.', 'error'); return; }
            K.busy(e.target.closest('[data-tm-save]'), async () => {
              affectedNote(box, await post({ action: 'save_week', employeeId: id, name: p.name, location: val('loc'), days }), p.name);
              const h = box.querySelector('.onl-city-h > span'); if (h) h.remove();
              K.ui().toast('Salvat: programul pentru ' + p.name + '.', 'success');
            }).catch(err);
            return;
          }
          const add = e.target.closest('[data-exc-add]');
          if (add) {
            const date = val('exd'), on = val('exk') === 'on';
            if (!date) { box.querySelector('[name=exd]').focus(); return; }
            const entry = on ? { on: true, from: val('exf'), to: val('ext'), location: val('exl') } : { on: false };
            if (on && entry.to <= entry.from) { K.ui().toast('Ora de final e înainte de început.', 'error'); return; }
            K.busy(add, async () => { affectedNote(box, await post({ action: 'save_date', employeeId: id, name: p.name, date, entry }), p.name); repaint(); box.querySelector('[name=exd]').value = ''; }).catch(err);
            return;
          }
          const rm = e.target.closest('[data-exc-rm]');
          if (rm) {
            const date = rm.closest('[data-exc-date]').dataset.excDate;
            K.busy(rm, async () => { await post({ action: 'save_date', employeeId: id, name: p.name, date, entry: null }); repaint(); }).catch(err);
          }
        });
      },
    });
  }

  // ------------------------------------------------------------------ the break's sheet (from the block, or from the day's line)
  // who, when, why it is where it is; for the owner and the manager: move it for that day (-1h … +1h, or any free half hour of
  // her shift; the taken ones greyed with the reason), „Fără pauză azi”, „Înapoi la mijloc”. A cosmetician sees it only.
  function openBreak(b, fromEl) {
    if (!b) return;
    const can = canMoveBreak();
    const h = (t) => hShort(t);
    const head = b.on ? b.from + '-' + b.to : 'fără pauză';
    const note = !b.on ? (b.why === 'off' ? 'Scoasă pentru ziua asta' + (b.by ? ' de ' + esc(firstName(b.by)) : '') + '.' : 'Azi nu are pauză: ' + esc(WHY[b.why] || '') + '. Mut-o pe o oră liberă.')
      : b.moved ? 'Mutată' + (b.by ? ' de ' + esc(firstName(b.by)) : '') + (b.at ? ', ' + esc(K.ago(b.at)) : '') + '. La mijlocul programului ar fi la ' + esc(b.mid) + '.'
      : 'Pauza e la mijlocul programului (' + esc(h(b.shiftFrom) + '-' + h(b.shiftTo)) + ').' + (b.fell ? ' Programul s-a schimbat, așa că a revenit la mijloc.' : '');
    const d = K.drawer({
      from: fromEl || null, width: 420,
      title: 'Pauză ' + esc(firstName(b.name)), icon: 'clock',
      subtitle: esc(K.relDay(b.date)) + ' · ' + esc(b.location),
      body: '<div class="brk-sheet"><div class="brk-when' + (b.on ? '' : ' is-off') + '"><b>' + esc(head) + '</b><span>' + esc(b.name) + ' · ' + esc(K.dateLong(b.date)) + '</span></div>' +
        '<p class="brk-note">' + icon('info') + '<span>' + note + '</span></p>' +
        (can ? '<section class="brk-move"><h4>Mută pauza</h4><div class="brk-quick" data-quick></div><div class="brk-slots" data-slots><div class="k-skel" style="height:76px"></div></div></section>' : '') + '</div>',
      footer: can ? (b.on ? '<button type="button" class="k-btn is-ghost is-sm" data-off>' + icon('x') + 'Fără pauză azi</button>' : '') + '<span class="k-grow"></span>' +
        (b.moved || b.why === 'off' ? '<button type="button" class="k-btn is-outline" data-reset>' + icon('refresh') + 'Înapoi la mijloc</button>' : '<button type="button" class="k-btn" data-k-close2>Gata</button>') : '',
      onMount(el) {
        const close2 = el.querySelector('[data-k-close2]'); if (close2) close2.addEventListener('click', () => d.close());
        const act = async (btn, payload, ok) => K.busy(btn, async () => {
          try { await K.api('/api/portal-schedule', Object.assign({ date: b.date, employeeId: b.employeeId, name: b.name }, payload)); d.close(); K.ui().toast(ok, 'success'); load(true); }
          catch (err) { K.ui().toast(brkErr(err), 'error'); }
        });
        const off = el.querySelector('[data-off]'); if (off) off.addEventListener('click', () => act(off, { action: 'break_off' }, firstName(b.name) + ' nu are pauză ' + (b.date === K.today() ? 'azi' : K.relDay(b.date)) + '.'));
        const rs = el.querySelector('[data-reset]'); if (rs) rs.addEventListener('click', () => act(rs, { action: 'break_reset' }, 'Pauza ' + firstName(b.name) + ' e din nou la ' + b.mid + '.'));
        if (!can) return;
        K.api('/api/portal-schedule', { action: 'break_info', date: b.date, employeeId: b.employeeId }).then((j) => {
          const box = el.querySelector('[data-slots]'), q = el.querySelector('[data-quick]');
          if (!box || !box.isConnected) return;
          // today: the half hours already gone are not offered
          const nowM = b.date === K.today() ? new Date().getHours() * 60 + new Date().getMinutes() : -1;
          const slots = (j.slots || []).map((x) => (x.free && toMin(x.from) < nowM ? Object.assign({}, x, { free: false, why: 'past' }) : x)), at = toMin(b.from);
          const byFrom = new Map(slots.map((x) => [x.from, x]));
          const why = (x) => (x.why === 'block' ? 'timp blocat' : x.why === 'past' ? 'a trecut' : 'clientă');
          q.innerHTML = [[-60, '−1h'], [-30, '−30 min'], [30, '+30 min'], [60, '+1h']].map(([dm, l]) => {
            const t = toHM(at + dm), x = byFrom.get(t);
            const bad = !x ? 'în afara programului' : !x.free ? why(x) + ' la ' + t : '';
            return '<button type="button" class="brk-chip is-quick" data-to="' + t + '"' + (bad ? ' disabled title="' + esc(bad) + '"' : ' title="La ' + t + '"') + '><b>' + l + '</b><span>' + (bad ? esc(bad.replace(' la ' + t, '')) : t) + '</span></button>';
          }).join('');
          box.innerHTML = slots.length ? '<div class="brk-grid">' + slots.map((x) => '<button type="button" class="brk-chip' + (b.on && x.from === b.from ? ' is-on' : '') + (x.free ? '' : ' is-taken') + '" data-to="' + x.from + '"' +
            (x.free ? '' : ' disabled title="' + esc(why(x)) + '"') + '><b>' + x.from + '</b>' + (x.free ? '' : '<span>' + esc(why(x)) + '</span>') + '</button>').join('') + '</div>' : '<p class="k-muted">Nu lucrează în ziua asta.</p>';
          el.querySelectorAll('[data-to]').forEach((btn) => btn.addEventListener('click', () => {
            if (btn.disabled || (b.on && btn.dataset.to === b.from)) return;
            act(btn, { action: 'break_set', from: btn.dataset.to }, 'Pauza ' + firstName(b.name) + ': ' + btn.dataset.to + '-' + toHM(toMin(btn.dataset.to) + BRK));
          }));
        }).catch((err) => { const box = el.querySelector('[data-slots]'); if (box) box.innerHTML = '<p class="k-muted">' + esc(K.errText(err)) + '</p>'; });
      },
    });
  }

  // the Manager page opens the same drawer (the owner and the manager set the team's hours)
  K.openTeamSchedule = () => openTeam();

  // her own visit of today or a passed day, still open (16.11): „Finalizată” (when there is no money to take: a package
  // session, a booking of 0 lei; one with a sum closes when it is paid) or „Nu a venit”. Only the status changes.
  const canMark = (a) => !!(K.data && K.data.me && a.cosmeticianId === K.data.me.id) && a.date <= K.today() && ['programata', 'confirmata', 'reprogramata'].includes(a.status) && !a.paidSaleId && !a.block;
  const mineAppt = (a) => !!(K.data && K.data.me && a && a.cosmeticianId === K.data.me.id);
  function markHtml(a) {
    if (!canMark(a)) return '';
    const byHand = pickFor(a).includes('finalizata');
    return '<section class="k-section cal-mark"><h4>' + icon('checkCircle') + 'A venit?</h4><div class="cal-mark-b">' +
      (byHand ? '<button type="button" class="k-btn is-good" data-mark="came">' + icon('check') + 'Finalizată</button>' : '') +
      '<button type="button" class="k-btn is-outline" data-mark="noshow">' + icon('ban') + 'Nu a venit</button></div>' +
      (byHand ? '' : '<small>A venit: se finalizează singură la încasare.</small>') + '</section>';
  }
  function wireMark(el, a) {
    el.querySelectorAll('[data-mark]').forEach((b) => b.addEventListener('click', () => K.busy(b, async () => {
      const j = await K.api('/api/portal-appointments', { action: 'mark', id: a.id, mark: b.dataset.mark });
      Object.assign(a, j.appointment || {});
      K.closeDrawer();
      K.ui().toast((a.clientName || 'Programarea') + ': ' + (b.dataset.mark === 'came' ? 'finalizată' : 'nu a venit'), 'success');
      render(true); K.reload();
    }).catch((err) => K.ui().toast(err.code === 'needs_payment' ? 'Se finalizează la încasare.' : K.errText(err), 'error'))));
  }
  // „Anulează concediul”: the leave taken back (api/portal-leave.js cancel), its days free again
  function wireLeaveCancel(el, a) {
    const b = el.querySelector('[data-leave-cancel]');
    if (!b) return;
    b.addEventListener('click', async () => {
      if (!(await K.ui().confirm({ title: a.block ? 'Anulezi orele libere?' : 'Anulezi concediul?', message: 'Zilele lui devin din nou zile de lucru în Calendar. Află și ea, și recepția.', confirmText: 'Anulează', danger: true }))) return;
      try { await K.api('/api/portal-leave', { action: 'cancel', appointmentId: a.id }); K.closeDrawer(); K.ui().toast(a.block ? 'Orele libere sunt anulate.' : 'Concediul e anulat.', 'success'); load(true); }
      catch (err) { K.ui().toast(K.errText(err), 'error'); }
    });
  }

  function openAppt(id) {
    const a = S.appts.find((x) => x.id === id);
    if (!a) return;
    const st = STATUS[a.status] || STATUS.programata;
    // A leave block isn't a real appointment, show it read-only, with just a delete button
    // for whoever can edit the calendar (undoing the approval's calendar side, if ever needed).
    // a leave's rows (and its „Ore libere”) go only with the leave, taken back by the owner or the manager (16.11)
    const fromLeave = a.createdBy === 'leave-approval';
    if (a.status === 'concediu' && a.block) {
      K.drawer({
        title: a.clientName || 'Timp blocat', icon: 'ban',
        subtitle: '<span class="k-tag is-mute">' + icon('ban') + 'Blocat</span> ' + esc(K.relDay(a.date)) + ' · ' + esc(span(a) || 'toată ziua') + ' · ' + esc(a.location),
        body: '<dl class="k-kv cal-kv"><dt>Motiv</dt><dd>' + esc(a.clientName || '-') + '</dd><dt>Data</dt><dd>' + esc(K.dateLong(a.date)) + '</dd><dt>Ora</dt><dd>' + esc(span(a) || 'Toată ziua') + '</dd>' +
          '<dt>Locație</dt><dd>' + esc(a.location) + '</dd><dt>Pentru</dt><dd>' + esc(a.cosmeticianName || 'Toată clinica') + '</dd></dl>',
        footer: fromLeave ? (canMoveBreak() ? '<button type="button" class="k-btn is-danger is-sm" data-leave-cancel>' + icon('x') + 'Anulează orele libere</button>' : '')
          : canEdit() ? '<button type="button" class="k-btn is-danger is-sm" data-del>' + icon('trash') + 'Deblochează</button><span class="k-grow"></span><button type="button" class="k-btn is-primary" data-edit-block>' + icon('pen') + 'Modifică</button>' : '',
        onMount(el) {
          wireLeaveCancel(el, a);
          const eb = el.querySelector('[data-edit-block]');
          if (eb) eb.addEventListener('click', () => { K.closeDrawer(); setTimeout(() => openBlock(Object.assign({ id: a.id, label: a.clientName }, a)), 230); });
          const del = el.querySelector('[data-del]');
          if (del) del.addEventListener('click', async () => {
            try { await K.api('/api/portal-appointments', { action: 'delete', id: a.id }); K.closeDrawer(); K.ui().toast('Interval deblocat.', 'success'); load(true); }
            catch (err) { K.ui().toast(K.errText(err), 'error'); }
          });
        },
      });
      return;
    }
    if (a.status === 'concediu') {
      K.drawer({
        title: a.clientName || 'Concediu', lead: K.avatar(a.cosmeticianName || '?', 42),
        subtitle: '<span class="k-tag is-mute">' + icon('calendar') + st.label + '</span> ' + esc(K.relDay(a.date)) + ' · ' + esc(a.location),
        body: '<dl class="k-kv cal-kv"><dt>Angajat</dt><dd>' + esc(a.cosmeticianName || '-') + '</dd><dt>Data</dt><dd>' + esc(K.dateLong(a.date)) + '</dd><dt>Locație</dt><dd>' + esc(a.location) + '</dd></dl>' +
          '<div class="mo-note">' + icon('info') + (fromLeave ? 'Din cererea de concediu aprobată. Nu poate fi programată în ziua asta; ziua se eliberează doar dacă se anulează concediul.' : 'În ziua asta nu se fac programări.') + '</div>',
        footer: fromLeave ? (canMoveBreak() ? '<button type="button" class="k-btn is-danger is-sm" data-leave-cancel>' + icon('x') + 'Anulează concediul</button>' : '')
          : canEdit() ? '<button type="button" class="k-btn is-danger is-sm" data-del>' + icon('trash') + 'Șterge blocarea</button>' : '',
        onMount(el) {
          wireLeaveCancel(el, a);
          const del = el.querySelector('[data-del]');
          if (del) del.addEventListener('click', async () => {
            if (!(await K.ui().confirm({ title: 'Ștergi blocarea?', message: 'Ziua devine din nou liberă în Calendar, cererea de concediu rămâne aprobată.', confirmText: 'Șterge', danger: true }))) return;
            try { await K.api('/api/portal-appointments', { action: 'delete', id: a.id }); K.ui().toast('Blocare ștearsă.', 'success'); load(true); }
            catch (err) { K.ui().toast(K.errText(err), 'error'); }
          });
        },
      });
      return;
    }
    if (!canEdit()) {
      K.drawer({
        title: a.clientName || 'Programare', lead: K.avatar(a.clientName, 42),
        subtitle: '<span class="k-tag is-' + st.tone + '">' + st.label + '</span> ' + (a.online ? '<span class="k-tag is-info" title="Clienta s-a programat singură pe site">' + icon('globe') + 'Online</span> ' : '') + esc(K.relDay(a.date)) + ' · ' + esc(span(a) || 'fără oră') + ' · ' + esc(a.location),
        body: '<dl class="k-kv cal-kv"><dt>Tratament</dt><dd>' + esc(a.treatment || '-') + '</dd><dt>Categorie</dt><dd>' + esc(K.catLabel(a) || '-') + '</dd>' + (a.amount ? '<dt>Sumă</dt><dd>' + K.lei(a.amount) + '</dd>' : '') +
          '<dt>Data</dt><dd>' + esc(K.dateLong(a.date)) + '</dd><dt>Ora</dt><dd>' + esc(span(a) || '-') + '</dd><dt>Locație</dt><dd>' + esc(a.location) + '</dd>' +
          '<dt>Cosmeticiană</dt><dd>' + esc(a.cosmeticianName || 'neasignat') + '</dd></dl>' +
          markHtml(a) +
          (a.clientId ? '<section class="k-section cal-client" data-client-brief><h4>' + icon('user') + 'Clienta</h4><div class="k-skel" style="height:56px"></div></section>' : '') +
          '<div class="mo-note">' + icon('info') + 'Programările le face și le modifică recepția.</div>' +
          (a.clientId ? '<div class="cal-cos-acts">' + (mineAppt(a) ? '<button type="button" class="k-btn is-accent" data-offer-calc>' + icon('percent') + 'Fă oferta</button>' : '') +
            '<button type="button" class="k-btn is-outline" data-contact>' + icon('user') + 'Fișa clientei și pozele</button></div>' : ''),
        onMount(el) {
          wireMark(el, a);
          const br = el.querySelector('[data-client-brief]'); if (br) clientBrief(br, a);
          const c = el.querySelector('[data-contact]'); if (c) c.addEventListener('click', () => { K.go('contacte'); setTimeout(() => (a.clientPhone ? K.emit('contacts:open-phone', a.clientPhone) : K.emit('contacts:open', a.clientId)), 250); }); // by her phone: an old link from HighLevel may point at a sheet that no longer exists
          // „Fă oferta”: the calculator for this client and this booking; „Salvează la clientă” keeps it on both (16.11)
          const of = el.querySelector('[data-offer-calc]'); if (of) of.addEventListener('click', () => { K.closeDrawer(); K.emit('calc:for', { id: a.clientId, name: a.clientName || '', apptId: a.id, city: a.location, when: K.relDay(a.date) + (a.time ? ' ' + a.time : '') }); });
        },
      });
      return;
    }
    const d = K.drawer({
      title: a.clientName || 'Programare', lead: K.avatar(a.clientName, 42),
      subtitle: '<span class="k-tag is-' + st.tone + '">' + st.label + '</span> ' + (a.online ? '<span class="k-tag is-info" title="Clienta s-a programat singură pe site">' + icon('globe') + 'Online</span> ' : '') + esc(K.relDay(a.date)) + ' · ' + esc(span(a) || 'fără oră') + ' · ' + esc(a.location),
      body:
        (a.paidSaleId ? '<div class="mo-note is-good">' + icon('checkCircle') + 'Plătită, apare în Încasări.</div>' : '') +
        '<div class="cal-status' + (pickFor(a).length > 4 ? ' is-5' : '') + '" role="group" aria-label="Status" style="--n:' + pickFor(a).length + '">' + pickFor(a).map((s) =>
          '<button type="button" class="is-' + STATUS[s].tone + (s === a.status ? ' is-on' : '') + '" data-status="' + s + '">' + icon(STATUS[s].ic) + '<span>' + STATUS[s].label + '</span></button>').join('') + '</div>' +
        (a.clientPhone ? '<div class="cal-contact">' +
          '<a class="k-btn is-outline" href="' + K.tel(a.clientPhone) + '">' + icon('phone') + 'Sună</a>' +
          '<a class="k-btn is-outline cal-wa" href="#mesaje" data-chat="' + esc(a.clientPhone) + '" data-chat-name="' + esc(a.clientName || '') + '" data-chat-city="' + esc(a.location || '') + '">' + icon('chat') + 'Mesaje</a></div>' : '') +
        (a.clientId ? '<section class="k-section cal-client" data-client><h4>' + icon('user') + 'Clienta</h4><div class="k-skel" style="height:72px"></div></section>' : '') +
        '<section class="k-section"><h4>' + icon('pen') + 'Detalii</h4>' + formHtml(a, false) + '</section>' +
        '<div class="k-muted">' + esc(a.clientPhone || 'Fără telefon salvat') + (a.cosmeticianName ? ' · cu ' + esc(a.cosmeticianName) : '') + '</div>',
      footer: '<button type="button" class="k-btn is-danger is-sm" data-del>' + icon('trash') + 'Șterge</button><span class="k-grow"></span>' +
        (a.paidSaleId ? '' : '<button type="button" class="k-btn is-outline" data-pay>' + icon('wallet') + 'Încasează</button>') + '<button type="button" class="k-btn is-primary" data-save>' + icon('check') + 'Salvează</button>',
      onMount(el) {
        const f = el.querySelector('[data-form]');
        wireForm(el, f, a.id);
        const picker = K.clientPicker(f.clientName, f.clientPhone);
        // Enter in a field saves (it used to send the page away)
        f.addEventListener('submit', (e) => { e.preventDefault(); el.querySelector('[data-save]').click(); });
        const cl = el.querySelector('[data-client]');
        if (cl) clientCard(cl, a);
        el.querySelectorAll('[data-status]').forEach((b) => b.addEventListener('click', async () => {
          const before = a.status;
          if (before === b.dataset.status) return;
          a.status = b.dataset.status;
          el.querySelectorAll('[data-status]').forEach((x) => x.classList.toggle('is-on', x === b));
          try {
            await save(a); render(true); K.reload();
            // „Reprogramată” is a move (the owner, 14.11): straight to the day and hour, which „Salvează” then keeps
            if (a.status === 'reprogramata') {
              const dt = f.querySelector('[name="date"]');
              if (dt) { dt.scrollIntoView({ block: 'center', behavior: 'smooth' }); setTimeout(() => { try { dt.focus(); if (dt.showPicker) dt.showPicker(); } catch (e) { /* the picker opens on a tap */ } }, 350); }
              K.ui().toast('Alege noua zi și ora, apoi apasă Salvează.', 'info');
            } else K.ui().toast(a.clientName + ': ' + STATUS[a.status].label.toLowerCase(), 'success');
          }
          catch (err) { a.status = before; K.ui().toast(K.errText(err), 'error'); openAppt(id); }
        }));
        el.querySelector('[data-save]').addEventListener('click', (e) => K.busy(e.currentTarget, async () => {
          const v = K.formValues(f);
          // another client picked from the list, or her name / phone changed: linked by the phone (the directory is
          // updated, a new number makes a new client); the same client stays as she is (an older booking with no phone too)
          const sameClient = !picker.id() && v.clientName === (a.clientName || '') && digits(v.clientPhone) === digits(a.clientPhone);
          if (!sameClient && (!v.clientName || digits(v.clientPhone).length < 9)) { K.ui().toast('Completează clientul și telefonul.', 'error'); return; }
          if (!v.treatment) { K.ui().toast('Completează tratamentul.', 'error'); f.treatment.focus(); return; }
          v.categories = formCats(v);
          v.amount = Number(v.amount) || 0;
          if (!v.categories.length) { K.ui().toast('Alege cel puțin o categorie.', 'error'); return; }
          const next = Object.assign({}, a, v);
          next.clientId = picker.id() || (sameClient ? a.clientId : '');
          const placed = next.date !== a.date || next.time !== a.time || next.location !== a.location || next.cosmeticianId !== a.cosmeticianId || next.endTime !== a.endTime;
          if (placed && !(await placeOk(next, 'Muți programarea', 'Mută oricum'))) return;
          try {
            const j = await K.api('/api/portal-appointments', Object.assign(payload(next), f._brk ? { breakMove: f._brk } : {}));
            Object.assign(a, (j && j.appointment) || v);
            d.close();
            K.ui().toast('Programare salvată.', 'success');
            load(true);
          } catch (err) { K.ui().toast(brkErr(err), 'error'); }
        }));
        const pay = el.querySelector('[data-pay]');
        if (pay) pay.addEventListener('click', () => {
          d.close();
          K.go('incasari');
          setTimeout(() => K.emit('incasari:new', { appointmentId: a.id }), 250);
        });
        el.querySelector('[data-del]').addEventListener('click', async () => {
          if (!(await K.ui().confirm({ title: 'Ștergi programarea?', message: a.clientName + ' · ' + K.relDay(a.date) + ' ' + span(a) + ' se șterge definitiv. Dacă doar s-a anulat, folosește „Anulată”.', confirmText: 'Șterge', danger: true }))) return;
          try { await K.api('/api/portal-appointments', { action: 'delete', id: a.id }); d.close(); K.ui().toast('Programare ștearsă.', 'success'); load(true); }
          catch (err) { K.ui().toast(K.errText(err), 'error'); }
        });
      },
    });
  }

  // ------------------------------------------------------------------ the bookings left without a cosmetician (16.11)
  // An approved leave, a day taken off in Program echipă, someone who left: her bookings those days, each with the colleagues
  // free then („Mută la Ana”, one tap) or „Altă zi” (the booking, in the Calendar). Opened from what was tapped (the
  // approval's card, the line on top of the Calendar). The server sends the rows (api/_lib/time-care.js).
  const WHY_TXT = { 'a plecat': 'a plecat', concediu: 'concediu', 'timp blocat': 'timp blocat', 'zi liberă': 'zi liberă', 'în alt oraș': 'în celălalt oraș' };
  function movesHtml(a) {
    if (a.done) return '<div class="tc-moves"><span class="k-tag is-good">' + icon('check') + 'La ' + esc(firstName(a.done)) + '</span></div>';
    return '<div class="tc-moves">' + (a.free && a.free.length ? '<span>Mută la</span>' + a.free.map((p) => '<button type="button" class="k-btn is-outline is-sm" data-tc-to="' + esc(p.id) + '" data-tc-name="' + esc(p.name) + '">' + esc(firstName(p.name)) + '</button>').join('')
      : '<span>Nicio colegă liberă atunci</span>') + '<button type="button" class="k-btn is-ghost is-sm" data-tc-day>' + icon('calendar') + 'Altă zi</button></div>';
  }
  function affectedSheet(list, o) {
    const opts = o || {};
    const rows = (list || []).map((a) => Object.assign({}, a));
    if (!rows.length) return null;
    const n = rows.length;
    const row = (a) => '<div class="k-row tc-row' + (a.done ? ' is-done' : '') + '" data-tc="' + esc(a.id) + '"><div class="k-row-main"><div class="k-row-title">' + esc(a.clientName || a.ghlTitle || 'Programare') + '</div>' +
      '<div class="k-row-sub">' + esc(K.relDay(a.date)) + (a.time ? ' · ' + esc(span(a)) : '') + ' · ' + esc(a.location || '') + (a.treatment ? ' · ' + esc(a.treatment) : '') +
      (a.orphanWhy ? ' · <b>' + esc(a.orphanWhy === 'a plecat' ? (((leftOf(a.cosmeticianId) || {}).name || a.cosmeticianName || '').split(' ')[0] + ' a plecat').trim() : WHY_TXT[a.orphanWhy] || a.orphanWhy) + '</b>' : '') + '</div>' + movesHtml(a) + '</div></div>';
    const d = K.drawer({
      title: n === 1 ? 'O programare de mutat' : n + ' programări de mutat', icon: 'users', width: 540, from: opts.from,
      subtitle: esc((n === 1 ? 'Rămâne' : 'Rămân') + ' fără cosmeticiană' + (opts.why ? ': ' + opts.why : '') + '. Dă-le unei colege libere sau mută-le pe altă zi.'),
      body: '<div class="k-list tc-list">' + rows.map(row).join('') + '</div>',
      footer: (opts.show ? '<button type="button" class="k-btn is-outline" data-show>' + icon('calendar') + 'Arată-le în Calendar</button>' : '') + '<span class="k-grow"></span><button type="button" class="k-btn" data-close>Gata</button>',
      onMount(el) {
        el.querySelector('[data-close]').addEventListener('click', () => d.close());
        const sh = el.querySelector('[data-show]'); if (sh) sh.addEventListener('click', () => { d.close(); opts.show(); });
        el.addEventListener('click', (e) => {
          const r = e.target.closest('[data-tc]'); if (!r) return;
          const a = rows.find((x) => x.id === r.dataset.tc); if (!a) return;
          if (e.target.closest('[data-tc-day]')) { d.close(); K.openAppointment(a.id, a.date); return; }
          const b = e.target.closest('[data-tc-to]'); if (!b) return;
          K.busy(b, async () => {
            await K.api('/api/portal-appointments', { action: 'reassign', id: a.id, cosmeticianId: b.dataset.tcTo });
            a.done = b.dataset.tcName;
            const box = r.querySelector('.tc-moves'); if (box) box.outerHTML = movesHtml(a);
            r.classList.add('is-done');
            K.ui().toast((a.clientName || 'Programarea') + ': la ' + firstName(a.done) + '.', 'success');
            if (panel && K.isActive('programari')) load(true);
          }).catch((err) => K.ui().toast(err.code === 'not_free' ? 'Nu mai e liberă atunci. Alege alta sau altă zi.' : K.errText(err), 'error'));
        });
      },
    });
    return d;
  }
  K.affectedSheet = affectedSheet;
  // „Ore libere” that don't cover a whole day (16.11): which hours, so the Calendar blocks exactly those for her. Resolves
  // { from, to } or null (closed). minutes: how many she asked for (the end follows the start).
  K.askHours = (o) => new Promise((done) => {
    const mins = Number(o && o.minutes) || 60;
    const opts = []; for (let m = 7 * 60; m <= 22 * 60; m += 15) opts.push([toHM(m), toHM(m)]);
    let out = null;
    const d = K.drawer({
      title: 'Ce ore are libere?', icon: 'clock', width: 440, from: o && o.from,
      subtitle: esc((o && o.name ? firstName(o.name) + ' · ' : '') + durText(mins) + ' din orele suplimentare'),
      body: '<form class="k-form" data-hours>' + K.field('De la', '<select name="from">' + K.options(opts, '15:00') + '</select>') +
        K.field('Până la', '<select name="to">' + K.options(opts, toHM(Math.min(15 * 60 + mins, 22 * 60))) + '</select>') + '</form>' +
        '<p class="ct-hint">' + icon('info') + 'Orele astea se blochează în Calendar pentru ea; programările ei de atunci apar ca rămase fără cosmeticiană.</p>',
      footer: '<span class="k-grow"></span><button type="button" class="k-btn" data-cancel>Renunță</button><button type="button" class="k-btn is-good" data-ok>' + icon('check') + 'Aprobă</button>',
      onMount(el) {
        const f = el.querySelector('[data-hours]');
        f.from.addEventListener('change', () => { f.to.value = toHM(Math.min(toMin(f.from.value) + mins, 22 * 60)); f.to.dispatchEvent(new Event('change')); });
        el.querySelector('[data-cancel]').addEventListener('click', () => d.close());
        el.querySelector('[data-ok]').addEventListener('click', () => {
          if (toMin(f.to.value) <= toMin(f.from.value)) { K.ui().toast('Ora de final e înainte de început.', 'error'); return; }
          out = { from: f.from.value, to: f.to.value }; d.close();
        });
      },
      onClose() { done(out); },
    });
  });
  // an approval (Aprobări, Manager → Echipa): the hours asked when needed, then her bookings left without a cosmetician in a
  // sheet out of the card. Resolves the server's answer, or null when the hours were not given.
  K.approveLeave = async (id, card, name, minutes) => {
    const body = { action: 'decide', id, decision: 'approved' };
    let j;
    try { j = await K.api('/api/portal-leave', body); }
    catch (err) {
      if (err.code !== 'missing_hours' && err.code !== 'invalid_hours') throw err;
      const hours = await K.askHours({ from: card, minutes, name });
      if (!hours) return null;
      j = await K.api('/api/portal-leave', Object.assign(body, { hours }));
    }
    if (j && j.affected && j.affected.length) setTimeout(() => K.affectedSheet(j.affected, { from: card && card.isConnected ? card : null, why: name ? 'concediu ' + firstName(name) : '' }), 60);
    return j;
  };

  // ------------------------------------------------------------------ the appointments of someone who left
  // After „A plecat” (Echipa): her appointments after the last day stay in the Calendar; a line on top says how many wait
  // for someone else, until each has another cosmetician (or is cancelled). Nothing is deleted.
  async function loadOrphans() {
    if (!canEdit()) return;
    try {
      const j = await K.api('/api/portal-appointments', { action: 'orphans' });
      S.orphans = j.appointments || [];
    } catch (e) { return; }
    if (!S.orphans.length && S.emp === LEFT) { S.emp = ''; render(true); }
    const sel = panel.querySelector('[data-emp]');
    if (sel && !K.drawerOpen) { sel.innerHTML = empFilterOptions(); sel.value = S.emp; }
    renderOrphans();
  }
  function renderOrphans() {
    const el = panel && panel.querySelector('[data-left]');
    if (!el) return;
    const list = S.orphans;
    el.hidden = !list.length;
    if (!list.length) { el.innerHTML = ''; return; }
    // why, short: who left by name, then the leave and the days off
    const who = [...new Set(list.filter((a) => (a.orphanWhy || 'a plecat') === 'a plecat').map((a) => (leftOf(a.cosmeticianId) || {}).name || a.cosmeticianName || '').filter(Boolean).map((n) => n.split(' ')[0]))];
    const whys = [...new Set(list.map((a) => a.orphanWhy).filter((w) => w && w !== 'a plecat').map((w) => WHY_TXT[w] || w))];
    const why = (who.length ? [who.join(', ') + ' a plecat'] : []).concat(whys);
    el.innerHTML = icon('users') + '<span><b>' + K.plural(list.length, 'programare', 'programări') + '</b> ' + (list.length === 1 ? 'rămasă' : 'rămase') + ' fără cosmeticiană' +
      (why.length ? ' (' + esc(why.join(' · ')) + ')' : '') + '. <u>Dă-le altcuiva</u></span>' + icon('right');
  }
  function openOrphans() {
    const list = S.orphans;
    if (!list.length) return;
    affectedSheet(list, { from: panel.querySelector('[data-left]'),
      show: () => {
        S.emp = LEFT;
        const sel = panel.querySelector('[data-emp]'); if (sel) { sel.innerHTML = empFilterOptions(); sel.value = LEFT; }
        S.date = list[0].date; setView('week');
      } });
  }

  // ------------------------------------------------------------------ month picker
  function openMonth(anchor) {
    let m = S.date.slice(0, 7);
    const pop = document.createElement('div');
    pop.className = 'k-menu cal-month';
    const paint = () => {
      const first = K.parse(m + '-01'), lead = (first.getDay() + 6) % 7, days = K.daysIn(m);
      const cells = [];
      for (let i = 0; i < lead; i++) cells.push('<span></span>');
      for (let d = 1; d <= days; d++) {
        const iso = m + '-' + K.pad(d);
        cells.push('<button type="button" data-d="' + iso + '" class="' + (iso === K.today() ? 'is-today ' : '') + (iso === S.date ? 'is-sel' : '') + '">' + d + '</button>');
      }
      pop.innerHTML = '<div class="cal-month-head"><button type="button" class="k-icon-btn" data-m="-1" aria-label="Luna anterioară">' + icon('left') + '</button><b>' + K.monthLabel(m) + '</b><button type="button" class="k-icon-btn" data-m="1" aria-label="Luna următoare">' + icon('right') + '</button></div>' +
        '<div class="cal-month-grid">' + ['L', 'M', 'M', 'J', 'V', 'S', 'D'].map((x) => '<em>' + x + '</em>').join('') + cells.join('') + '</div>';
    };
    paint();
    document.body.appendChild(pop);
    const r = anchor.getBoundingClientRect();
    pop.style.top = (r.bottom + 8) + 'px';
    pop.style.left = Math.min(r.left, window.innerWidth - 300) + 'px';
    pop.style.transformOrigin = 'top left';
    requestAnimationFrame(() => pop.classList.add('is-open'));
    const close = () => { pop.classList.remove('is-open'); setTimeout(() => pop.remove(), 200); document.removeEventListener('mousedown', outside, true); };
    const outside = (e) => { if (!pop.contains(e.target)) close(); };
    setTimeout(() => document.addEventListener('mousedown', outside, true), 0);
    pop.addEventListener('click', (e) => {
      const mb = e.target.closest('[data-m]');
      if (mb) { m = K.addMonths(m, +mb.dataset.m); paint(); return; }
      const db = e.target.closest('[data-d]');
      if (db) { S.date = db.dataset.d; close(); load(); }
    });
  }

  K.section('programari', {
    mount,
    show() { load(); },
  });
  K.on('remote', () => { if (panel && K.isActive('programari')) load(true); });
  K.on('calendar:new', (pre) => openNew(pre || {}));
  // Pipeline, Mesaje, Contacte: "change the appointment" opens it here, on its day
  K.openAppointment = async (id, date) => {
    if (!id) return;
    K.go('programari');
    const until = Date.now() + 5000;
    while (!panel && Date.now() < until) await new Promise((r) => setTimeout(r, 80));
    if (!panel) return;
    if (date) S.date = String(date).slice(0, 10);
    await setView('day');
    if (S.appts.some((x) => x.id === id)) openAppt(id);
    else K.ui().toast('Programarea nu mai e în calendar (a fost ștearsă).', 'info');
  };
  K.on('calendar:open', async (o) => {
    if (!o) return;
    S.date = o.date || S.date;
    await setView('day');
    if (o.id) openAppt(o.id);
  });
})();
  // #programari/pauza (Nuki, the guide): today's breaks, in the day view, with a short glow; #programari/echipa: Program echipă
  K.on('programari:sub', async (sub) => {
    if (sub === 'echipa') { if (K.canManage && K.canManage()) setTimeout(() => openTeam(), 120); return; }
    if (sub !== 'pauza') return;
    const until = Date.now() + 4000;
    while (!panel && Date.now() < until) await new Promise((r) => setTimeout(r, 80));
    if (!panel) return;
    S.date = K.today();
    await setView('day');
    if (K.glow) K.glow('.cal-team-brk, .cal-brk', { max: 8 }); // (the day's line „La lucru” and the blocks in the columns)
  });
