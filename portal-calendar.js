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
  const START = 8, END = 21, PPM = 1.1; // grid hours + pixels per minute
  const DUR = 60;                        // an appointment with no end time is drawn as 1h
  const LOCS = ['Timișoara', 'Arad'];
  const STATUS = {
    programata: { label: 'Programată', plural: 'programate', tone: 'accent', ic: 'calendar' },
    confirmata: { label: 'Confirmată', plural: 'confirmate', tone: 'good', ic: 'checkCircle' },
    finalizata: { label: 'Finalizată', plural: 'finalizate', tone: 'mute', ic: 'check' },
    reprogramata: { label: 'Reprogramată', plural: 'reprogramate', tone: 'warn', ic: 'refresh' },
    anulata: { label: 'Anulată', plural: 'anulate', tone: 'bad', ic: 'ban' },
    // Created automatically when an admin approves a leave request (Aprobări), not a real
    // appointment, just a marker so reception sees the person is away. See api/portal-leave.js.
    concediu: { label: 'Concediu', plural: 'concedii', tone: 'mute', ic: 'calendar' },
  };
  // Statuses the front desk picks by hand. "Finalizată" comes by itself when the appointment is paid
  // (Încasări); "Concediu" is a leave block created by an approved leave request.
  const PICK = ['programata', 'confirmata', 'reprogramata', 'anulata'];
  const S = { view: 'day', date: K.today(), loc: 'all', emp: '', only: 'all', appts: [], range: '', loading: false };
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
  // Only cosmeticians do treatments; the list follows the chosen location (Timișoara / Arad).
  const cosmeticians = (loc) => ((K.data && K.data.activeEmployees) || []).filter((e) => e.role === 'cosmetician' && (!loc || loc === 'all' || e.location === loc));

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
      '<div class="k-head"><div><div class="k-eyebrow">Clinică</div><h2>Calendar</h2></div>' +
      (canEdit() ? '<div class="k-head-actions"><button type="button" class="k-btn is-accent" data-act="new">' + icon('plus') + 'Programare<kbd>N</kbd></button></div>' : '') + '</div>' +
      '<div class="cal-bar">' +
        '<div class="cal-nav"><button type="button" class="k-btn is-outline is-sm" data-act="today">Azi</button>' +
        '<button type="button" class="k-icon-btn" data-act="prev" aria-label="Înapoi">' + icon('left') + '</button>' +
        '<button type="button" class="k-icon-btn" data-act="next" aria-label="Înainte">' + icon('right') + '</button>' +
        '<button type="button" class="cal-title" data-act="month"><b data-title></b>' + icon('down') + '</button></div>' +
        '<div class="cal-bar-right"><select data-emp aria-label="Cosmeticiană">' + empFilterOptions() + '</select>' + (locked ? '' : K.seg('calloc', [['all', 'Ambele orașe'], ['Timișoara', 'Timișoara'], ['Arad', 'Arad']], S.loc)) +
        K.seg('calonly', [['all', 'Toate'], ['confirmata', 'Doar confirmate']], S.only) +
        K.seg('calview', [['day', 'Zi'], ['week', 'Săptămână']], S.view) + '</div>' +
      '</div>' +
      '<div class="cal-mbox" data-mbox hidden></div>' +
      '<div class="cal-summary" data-summary></div>' +
      '<div class="cal-wrap k-card"><div class="cal-grid" data-grid></div></div>' +
      (canEdit() ? '<button type="button" class="cal-fab" data-act="new" aria-label="Programare nouă">' + icon('plus') + '</button>' : '');
    gridEl = panel.querySelector('[data-grid]');
    panel.addEventListener('click', onClick);
    panel.addEventListener('change', (e) => {
      if (e.target.name === 'calview') { S.view = e.target.value; keepPhoneView(); load(); }
      if (e.target.name === 'calloc') {
        S.loc = e.target.value;
        // the cosmetician filter only offers people from the chosen city
        if (S.emp && !cosmeticians(S.loc).some((c) => c.id === S.emp)) S.emp = '';
        const sel = panel.querySelector('[data-emp]'); sel.innerHTML = empFilterOptions(); sel.value = S.emp;
        render();
      }
      if (e.target.name === 'calonly') { S.only = e.target.value; render(true); }
      if (e.target.matches('[data-emp]')) { S.emp = e.target.value; render(true); }
    });
    gridEl.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('keydown', onKey);
    K.everySecond((now) => { if (now.getSeconds() % 30 === 0 && K.isActive('programari')) placeNow(); });
  }

  function empFilterOptions() {
    const me = K.data && K.data.me;
    return '<option value="">Toate cosmeticienele</option>' + K.options(cosmeticians(S.loc).map((e) => [e.id, me && me.id === e.id ? 'Doar ale mele' : e.name]), S.emp);
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
  function setView(v) { S.view = v; keepPhoneView(); const seg = panel.querySelector('[data-k-seg="calview"]'); seg.querySelectorAll('button').forEach((b) => b.classList.toggle('is-on', b.dataset.v === v)); seg.querySelector('input').value = v; load(); }
  function shift(dir) { S.date = K.addDays(S.date, dir * (S.view === 'day' ? 1 : 7)); inRange() ? (renderTitle(), render()) : load(); }
  // a phone has the whole month loaded: moving inside it needs no reload
  const inRange = () => { if (!phone() || !S.range) return false; const [a, b] = S.range.split('|'); return S.date >= a && S.date <= b; };
  // a day picked in the month on top (the next / previous month from its arrows)
  function pickDay(d) { S.date = d; inRange() ? (renderTitle(), render()) : load(); }

  function onClick(e) {
    const act = e.target.closest('[data-act]');
    if (act) {
      const a = act.dataset.act;
      if (a === 'new') return openNew({});
      if (a === 'today') { S.date = K.today(); return load(); }
      if (a === 'prev') return shift(-1);
      if (a === 'next') return shift(1);
      if (a === 'month') return phone() ? null : openMonth(act); // a phone has the month open on top
    }
    const mday = e.target.closest('[data-mday]');
    if (mday) return pickDay(mday.dataset.mday);
    // the week strip: to that day in the agenda
    const wday = e.target.closest('[data-wday]');
    if (wday) {
      const sec = gridEl.querySelector('[data-agday="' + wday.dataset.wday + '"]');
      if (sec) { const top = sec.getBoundingClientRect().top + window.scrollY - stickTop(); window.scrollTo({ top, behavior: 'smooth' }); }
      return;
    }
    const nd = e.target.closest('[data-newday]');
    if (nd) return openNew({ date: nd.dataset.newday, location: S.loc !== 'all' ? S.loc : '' });
    const mm = e.target.closest('[data-mmonth]');
    if (mm) {
      // another month: its first day (today, when it's this month)
      const m = K.addMonths(S.date.slice(0, 7), +mm.dataset.mmonth);
      return pickDay(m === K.today().slice(0, 7) ? K.today() : m + '-01');
    }
    const row = e.target.closest('[data-open]');
    if (row) return openAppt(row.dataset.open);
    const gap = e.target.closest('[data-gap]');
    if (gap) { const [time, location] = gap.dataset.gap.split('|'); return openNew({ date: S.date, time, location }); }
    const day = e.target.closest('[data-goday]');
    if (day) { S.date = day.dataset.goday; return setView('day'); }
  }

  // ------------------------------------------------------------------ data
  function rangeFor() {
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
      render(keepScroll);
    } catch (e) {
      gridEl.innerHTML = K.empty('alert', 'Nu am putut încărca calendarul', 'Verifică conexiunea și reîncearcă.', '<button type="button" class="k-btn is-primary" data-act="today">Reîncearcă</button>');
    }
  }
  function renderTitle() {
    const t = panel.querySelector('[data-title]');
    if (S.view === 'day') t.textContent = K.relDay(S.date) === K.dateLong(S.date) ? K.dateLong(S.date) : K.relDay(S.date) + ' · ' + K.dateLong(S.date).split(', ')[1];
    else { const [a, b] = rangeFor(); t.textContent = K.dateShort(a) + ' - ' + K.dateShort(b) + ' ' + b.slice(0, 4); }
  }

  // ------------------------------------------------------------------ render grid
  function columns() {
    if (S.view === 'day') return (S.loc === 'all' ? LOCS : [S.loc]).map((l) => ({ key: S.date + '|' + l, date: S.date, loc: l, label: l, sub: '' }));
    const mon = K.mondayOf(S.date);
    return Array.from({ length: 7 }, (_, i) => { const d = K.addDays(mon, i); return { key: d + '|' + S.loc, date: d, loc: S.loc === 'all' ? '' : S.loc, label: K.DOW_S[K.parse(d).getDay()], sub: String(K.parse(d).getDate()) }; });
  }
  const inCol = (a, c) => a.date === c.date && (!c.loc || a.location === c.loc);

  function render(keepScroll) {
    if (!gridEl) return;
    const mbox = panel.querySelector('[data-mbox]');
    mbox.hidden = !phone();
    const visible = S.appts.filter((a) => (S.loc === 'all' || a.location === S.loc) && (!S.emp || a.cosmeticianId === S.emp) &&
      (S.only === 'all' || a.status === S.only || a.status === 'finalizata'));
    if (phone() && S.view === 'week') {
      mbox.innerHTML = weekStripHtml(visible);
      renderSummary(visible);
      gridEl.style.removeProperty('--cols');
      gridEl.classList.remove('is-week');
      gridEl.classList.add('is-agenda');
      gridEl.innerHTML = agendaHtml(visible);
      if (!keepScroll) { const t = gridEl.querySelector('.cal-ag-day.is-today'); if (t) requestAnimationFrame(() => window.scrollTo({ top: Math.max(0, t.getBoundingClientRect().top + window.scrollY - stickTop()), behavior: 'auto' })); }
      return;
    }
    gridEl.classList.remove('is-agenda');
    if (phone()) mbox.innerHTML = monthHtml();
    const prevScroll = gridEl.parentElement.scrollTop;
    const cols = columns();
    renderSummary(phone() ? visible.filter((a) => a.date === S.date) : visible); // a phone has the month loaded: the day's numbers
    const H = (END - START) * 60 * PPM;
    const hours = Array.from({ length: END - START + 1 }, (_, i) => START + i);
    const today = K.today();
    gridEl.style.setProperty('--cols', cols.length);
    gridEl.classList.toggle('is-week', S.view === 'week');
    gridEl.innerHTML =
      '<div class="cal-corner"></div>' +
      cols.map((c) => '<div class="cal-colhead' + (c.date === today ? ' is-today' : '') + '"' + (S.view === 'week' ? ' data-goday="' + c.date + '"' : '') + '>' +
        (S.view === 'week' ? '<span>' + c.label + '</span><b>' + c.sub + '</b>' : '<span>' + icon('pin') + esc(c.label) + '</span>') +
        '<em>' + visible.filter((a) => inCol(a, c) && a.status !== 'anulata').length + '</em></div>').join('') +
      '<div class="cal-gutter" style="height:' + H + 'px">' + hours.map((h) => '<span style="top:' + ((h - START) * 60 * PPM) + 'px">' + K.pad(h) + ':00</span>').join('') + '</div>' +
      cols.map((c) => {
        const list = visible.filter((a) => inCol(a, c));
        const timed = list.filter((a) => toMin(a.time) != null);
        const untimed = list.filter((a) => toMin(a.time) == null);
        return '<div class="cal-col' + (c.date === today ? ' is-today' : '') + (c.date < today ? ' is-past' : '') + '" data-date="' + c.date + '" data-loc="' + esc(c.loc) + '" style="height:' + H + 'px">' +
          hours.slice(0, -1).map((h) => '<i class="cal-hour" style="top:' + ((h - START) * 60 * PPM) + 'px"></i>').join('') +
          (untimed.length ? '<div class="cal-untimed">' + untimed.map((a) => '<button type="button" class="cal-chip is-' + a.status + '" data-id="' + esc(a.id) + '">' + esc(nameOf(a)) + '</button>').join('') + '</div>' : '') +
          layout(timed).map(blockHtml).join('') + '</div>';
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
    S.appts.forEach((x) => { if (x.status !== 'anulata' && x.status !== 'concediu' && (S.loc === 'all' || x.location === S.loc) && (!S.emp || x.cosmeticianId === S.emp)) count[x.date] = (count[x.date] || 0) + 1; });
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

  // ------------------------------------------------------------------ the phone week (agenda)
  // how far down the sticky header and week strip reach (a day jumps to just under them)
  const stickTop = () => { const s = panel && panel.querySelector(".cal-mbox"); return (s && !s.hidden ? s.getBoundingClientRect().height : 0) + 74; };
  const weekDays = () => { const mon = K.mondayOf(S.date); return Array.from({ length: 7 }, (_, i) => K.addDays(mon, i)); };
  const live = (a) => a.status !== 'anulata' && a.status !== 'concediu';
  function weekStripHtml(visible) {
    const today = K.today();
    return '<div class="cal-wstrip">' + weekDays().map((d) => {
      const n = visible.filter((a) => a.date === d && live(a)).length;
      return '<button type="button" data-wday="' + d + '" class="' + (d === today ? 'is-today ' : '') + (d < today ? 'is-past' : '') + '">' +
        '<em>' + K.DOW_S[K.parse(d).getDay()] + '</em><b>' + K.parse(d).getDate() + '</b><i' + (n ? '' : ' class="is-none"') + '>' + (n || '') + '</i></button>';
    }).join('') + '</div>';
  }
  function agendaHtml(visible) {
    const today = K.today();
    const multi = S.loc === 'all';
    return '<div class="cal-agenda">' + weekDays().map((d) => {
      const list = visible.filter((a) => a.date === d).sort((x, y) => (toMin(x.time) == null ? -1 : toMin(x.time)) - (toMin(y.time) == null ? -1 : toMin(y.time)));
      const n = list.filter(live).length;
      const dt = K.parse(d);
      return '<section class="cal-ag-day' + (d === today ? ' is-today' : '') + (d < today ? ' is-past' : '') + '" data-agday="' + d + '">' +
        '<button type="button" class="cal-ag-head" data-goday="' + d + '"><b>' + esc(K.DOW[dt.getDay()].replace(/^./, (c) => c.toUpperCase())) + '</b><span>' + esc(K.dateShort(d)) + (d === today ? ' · azi' : '') + '</span>' +
          '<em>' + (n ? K.plural(n, 'programare', 'programări') : 'liber') + '</em>' + icon('right') + '</button>' +
        (list.length ? list.map((a) => {
          const st = STATUS[a.status] || STATUS.programata;
          return '<button type="button" class="cal-ag-row is-' + esc(a.status) + '" data-open="' + esc(a.id) + '">' +
            '<span class="cal-ag-time">' + (a.time ? '<b>' + esc(a.time) + '</b>' + (toMin(a.endTime) > toMin(a.time) ? '<small>' + esc(a.endTime) + '</small>' : '') : '<b>toată</b><small>ziua</small>') + '</span>' +
            '<span class="cal-ag-main"><b>' + esc(nameOf(a)) + '</b><small>' + esc([subOf(a), a.amount ? K.lei(a.amount) : '', a.paidSaleId ? 'plătit' : ''].filter(Boolean).join(' · ')) + '</small>' +
            '<span class="cal-ag-meta">' + (a.cosmeticianName ? '<i>' + esc(K.initials(a.cosmeticianName)) + '</i>' + esc(a.cosmeticianName.split(' ')[0]) : '') + (multi && a.location ? '<em>' + esc(a.location) + '</em>' : '') +
            (a.package ? '<em>pachet</em>' : '') + '<em class="is-st">' + esc(st.label) + '</em></span></span></button>';
        }).join('') : '<div class="cal-ag-empty"><span>Nicio programare</span>' + (canEdit() && d >= today ? '<button type="button" class="k-btn is-ghost is-sm" data-newday="' + d + '">' + icon('plus') + 'Programează</button>' : '') + '</div>') +
        '</section>';
    }).join('') + '</div>';
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
  // what an appointment is called: the title it had in HighLevel (as reception wrote it there), else the client;
  // the line under it: the client when the title doesn't name her, else the treatment
  const plainTxt = (x) => String(x || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  const nameOf = (a) => a.ghlTitle || a.clientName || '-';
  function subOf(a) {
    if (!a.ghlTitle) return a.treatment || '';
    const first = plainTxt(a.clientName).split(/\s+/)[0];
    const named = first && plainTxt(a.ghlTitle).includes(first);
    return [named ? '' : a.clientName, a.treatment && a.treatment !== a.ghlTitle ? a.treatment : ''].filter(Boolean).join(' · ');
  }
  function blockHtml(it) {
    const a = it.a, st = STATUS[a.status] || STATUS.programata;
    const top = Math.max(0, (it.s - START * 60) * PPM), h = Math.max(30, (Math.min(it.e, END * 60) - it.s) * PPM - 3);
    const w = 100 / it.lanes;
    // as many lines for the name as the block's height holds, so a long title shows whole; a short appointment (half
    // an hour) has the hour in front of the name, in smaller letters, on up to two lines
    const short = it.e - it.s < 45; // under 45 minutes; an hour keeps the big letters whatever the screen
    const lines = short ? Math.max(1, Math.floor((h - 6) / 13.5)) : Math.max(1, Math.floor((h - 28) / 17));
    return '<button type="button" class="cal-block is-' + a.status + (short ? ' is-short' : '') + '" data-id="' + esc(a.id) + '" style="top:' + top + 'px;height:' + h + 'px;left:calc(' + (it.lane * w) + '% + 3px);width:calc(' + w + '% - 6px);--lines:' + lines + '"' +
      ' title="' + esc(span(a) + ' · ' + nameOf(a) + (a.ghlTitle ? ' · ' + a.clientName : '') + ' · ' + (a.treatment || '') + ' · ' + st.label) + '">' +
      (short
        ? '<b><span class="cal-b-t">' + esc(a.time || '') + '</span>' + esc(nameOf(a)) + '</b>'
        : '<span class="cal-b-time">' + esc(span(a)) + (a.cosmeticianName ? '<i>' + esc(K.initials(a.cosmeticianName)) + '</i>' : '') + '</span>' +
          '<b>' + esc(nameOf(a)) + '</b><span class="cal-b-sub">' + esc(subOf(a)) + (a.amount ? ' · ' + K.lei(a.amount) : '') + (a.paidSaleId ? ' · plătit' : '') + '</span>') + '</button>';
  }
  function renderSummary(list) {
    const el = panel.querySelector('[data-summary]');
    const c = (s) => list.filter((a) => a.status === s).length;
    const live = list.filter((a) => a.status !== 'anulata').length;
    el.innerHTML = '<span class="cal-sum-main">' + K.plural(live, 'programare', 'programări') + (S.view === 'day' ? '' : ' săptămâna aceasta') + '</span>' +
      Object.keys(STATUS).filter((s) => c(s)).map((s) => '<span class="k-tag is-' + STATUS[s].tone + '">' + icon(STATUS[s].ic) + c(s) + ' ' + (c(s) === 1 ? STATUS[s].label.toLowerCase() : STATUS[s].plural) + '</span>').join('') +
      (c('programata') ? '<span class="cal-hint">' + icon('info') + 'Programările neconfirmate apar cu albastru, confirmă-le cu un click.</span>' : '');
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
    const block = e.target.closest('.cal-block, .cal-chip');
    const col = e.target.closest('.cal-col');
    if (!col) return;
    drag = { block, col, sx: e.clientX, sy: e.clientY, started: false, id: block && block.dataset.id, type: e.pointerType, timer: 0 };
    if (!canEdit()) { drag.readOnly = true; }
    if (block && e.pointerType !== 'mouse' && canEdit()) drag.timer = setTimeout(() => { if (drag && !drag.started) startDrag(e); }, 350);
    window.addEventListener('pointermove', onMove, { passive: false });
    window.addEventListener('pointerup', onUp, { once: true });
  }
  function onMove(e) {
    if (!drag) return;
    const dist = Math.hypot(e.clientX - drag.sx, e.clientY - drag.sy);
    if (!drag.started) {
      if (drag.block && !drag.readOnly && drag.type === 'mouse' && dist > 5 && drag.block.classList.contains('cal-block')) startDrag(e);
      else if (dist > 10) { clearTimeout(drag.timer); if (!drag.block) drag.cancel = true; }
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
    drag.ghost.querySelector('.cal-b-time').firstChild.textContent = toHM(m) + (drag.dur ? ' - ' + toHM(Math.min(m + drag.dur, 24 * 60 - 1)) : '');
  }
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
    window.removeEventListener('pointermove', onMove);
    const d = drag; drag = null;
    if (!d) return;
    clearTimeout(d.timer);
    if (d.started) {
      gridEl.classList.remove('is-dragging');
      const a = S.appts.find((x) => x.id === d.id);
      const date = d.target.dataset.date, loc = d.target.dataset.loc || a.location, time = toHM(d.min);
      if (!a || (a.date === date && a.time === time && a.location === loc)) { render(true); return; }
      const before = Object.assign({}, a);
      Object.assign(a, { date, time, location: loc });
      if (d.dur) a.endTime = toHM(Math.min(d.min + d.dur, 24 * 60 - 15)); // same length, new place
      render(true);
      try {
        await save(a);
        K.ui().toast(a.clientName + ' → ' + K.relDay(date) + ' ' + span(a) + (loc !== before.location ? ' · ' + loc : ''), 'success');
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
    };
  }
  const save = (a) => K.api('/api/portal-appointments', payload(a));

  // ------------------------------------------------------------------ drawers
  function empOptions(sel, loc) {
    const list = cosmeticians(loc);
    const pairs = list.map((e) => [e.id, e.name]);
    // an appointment already assigned to someone not in the list (moved city, other role) keeps her
    if (sel && !list.some((e) => e.id === sel)) pairs.push([sel, empName(sel) || 'Cosmeticiana aleasă']);
    return '<option value="">- alege cosmeticiana</option>' + K.options(pairs, sel);
  }
  // Quick fill from the active offers (treatment + price + category) for the chosen city.
  function offerChips(loc) {
    const key = loc === 'Arad' ? 'arad' : 'timisoara';
    const offers = ((K.data && K.data.offers) || []).filter((o) => !o.locations || !o.locations.length || o.locations.includes(key));
    if (!offers.length) return '';
    return '<div class="cal-offers" data-cal-offers>' + offers.map((o) => '<button type="button" data-offer="' + esc(o.id) + '"><b>' + esc(o.title) + '</b><span>' + K.lei(o.priceNew) + '</span></button>').join('') + '</div>';
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
  function waText(a, kind) {
    const when = K.relDay(a.date).toLowerCase() === 'azi' ? 'azi' : K.relDay(a.date) === 'Mâine' ? 'mâine' : 'pe ' + K.dateLong(a.date).toLowerCase();
    if (kind === 'reminder') return 'Bună, ' + String(a.clientName || '').split(' ')[0] + '! Îți reamintim de programarea de ' + when + ' la ora ' + a.time + ' la Centrul360 ' + a.location + '. Te așteptăm!';
    return 'Bună, ' + String(a.clientName || '').split(' ')[0] + '! Îți confirmăm programarea la Centrul360 ' + a.location + ' ' + when + ' la ora ' + a.time + (a.treatment ? ', pentru ' + a.treatment : '') + '. Răspunde cu DA pentru confirmare. Mulțumim!';
  }

  function formHtml(a, isNew) {
    return '<form class="k-form" data-form>' +
      (isNew ? K.field('Client', '<input name="clientName" required maxlength="150" placeholder="Caută sau scrie un nume nou" autofocus>', 'full') +
        K.field('Telefon', '<input name="clientPhone" type="tel" required maxlength="30" placeholder="07xx xxx xxx">', 'full') :
        !a.clientPhone ? K.field('Telefon clientă', '<input name="clientPhone" type="tel" maxlength="30" placeholder="Lipsește - adaugă-l ca să poți suna / trimite WhatsApp">', 'full') : '') +
      K.field('Data', '<input name="date" type="date" required value="' + esc(a.date) + '">', 'full') +
      K.field('Începe la', '<select name="time" data-start>' + slotOptions(a.time || '10:00') + '</select>') +
      K.field('Se termină la', '<select name="endTime" data-end>' + endOptions(a.time || '10:00', formEnd(a)) + '</select>') +
      K.field('Locație', K.seg('location', LOCS.map((l) => [l, l, 'pin']), a.location || LOCS[0], 'is-big'), 'full') +
      (isNew ? '<div class="k-field full"><span>Alege din oferte (completează tratamentul și suma)</span><div data-offer-box>' + offerChips(a.location || LOCS[0]) + '</div></div>' : '') +
      K.field('Tratament', '<input name="treatment" required maxlength="200" value="' + esc(a.treatment || '') + '" placeholder="ex: Facial Restart">', 'full') +
      K.field('Categorie (poți alege mai multe)', K.catPicker(K.catsOf(a)), 'full') +
      K.field('Suma programării', '<div class="k-money"><input name="amount" type="number" inputmode="decimal" min="0" step="1" value="' + esc(a.amount || '') + '" placeholder="0"></div>', 'full', 'Cât plătește clienta pentru ce s-a programat. Un upsell (pachet, zonă în plus) se bifează la încasare.') +
      K.field('Cosmeticiană', '<select name="cosmeticianId" data-cos>' + empOptions(a.cosmeticianId || '', a.location || LOCS[0]) + '</select>', 'full') +
      '<div class="k-field full">' + K.toggle('package', !!a.package, 'Ședință din pachet') + '<small>Primește doar reamintirile, fără confirmarea programării și fără cererea de recenzie.</small></div>' +
      (isNew ? K.field('Status', K.seg('status', [['programata', 'Programată'], ['confirmata', 'Confirmată']], 'programata', 'is-big'), 'full') : '') +
      '</form>';
  }

  function wireForm(el, f) {
    // Moving the start keeps the length (10:00-11:30 → 11:00-12:30).
    let lastStart = f.time.value;
    f.addEventListener('change', (e) => {
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
      const keep = cosmeticians(loc).some((c) => c.id === sel.value) ? sel.value : '';
      sel.innerHTML = empOptions(keep, loc); sel.value = keep;
      const box = f.querySelector('[data-offer-box]');
      if (box) box.innerHTML = offerChips(loc);
    });
    f.addEventListener('click', (e) => {
      const b = e.target.closest('[data-offer]');
      if (!b) return;
      const o = (K.data.offers || []).find((x) => x.id === b.dataset.offer);
      if (!o) return;
      f.querySelectorAll('[data-offer]').forEach((x) => x.classList.toggle('is-on', x === b));
      f.treatment.value = o.title;
      f.amount.value = o.priceNew;
      const pick = f.querySelector('[data-catpick]');
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
      footer: '<span class="k-grow k-muted">Se creează și sarcina de confirmare pe WhatsApp.</span><button type="button" class="k-btn" data-k-close2>Renunță</button><button type="button" class="k-btn is-accent" data-save>' + icon('check') + 'Programează</button>',
      onMount(el) {
        const f = el.querySelector('[data-form]');
        picker = K.clientPicker(f.clientName, f.clientPhone);
        wireForm(el, f);
        if (pre.clientName) { f.clientName.value = pre.clientName; f.clientPhone.value = pre.clientPhone || ''; }
        el.querySelector('[data-k-close2]').addEventListener('click', () => d.close());
        f.addEventListener('submit', (e) => { e.preventDefault(); el.querySelector('[data-save]').click(); });
        el.querySelector('[data-save]').addEventListener('click', (e) => K.busy(e.currentTarget, async () => {
          const v = K.formValues(f);
          if (!v.clientName || !v.clientPhone) { K.ui().toast('Completează clientul și telefonul.', 'error'); return; }
          if (!v.treatment) { K.ui().toast('Completează tratamentul.', 'error'); f.treatment.focus(); return; }
          if (!formCats(v).length) { K.ui().toast('Alege cel puțin o categorie.', 'error'); return; }
          // a session from a package is already paid: 0 is fine there
          if (!v.package && !(Number(v.amount) > 0)) { K.ui().toast('Scrie suma programării (sau bifează „Ședință din pachet”).', 'error'); f.amount.focus(); return; }
          if (!v.cosmeticianId) { K.ui().toast('Alege cosmeticiana.', 'error'); return; }
          try {
            await K.api('/api/portal-appointments', Object.assign({ action: 'create', clientId: picker.id() }, v, { categories: formCats(v), amount: Number(v.amount) }));
            d.close();
            K.ui().toast('Programat: ' + v.clientName + ' · ' + K.relDay(v.date) + ' ' + span(v), 'success');
            S.date = v.date;
            if (S.view === 'day' && S.loc !== 'all' && S.loc !== v.location) { S.loc = 'all'; }
            load(true);
            K.emit('tasks:changed');
          } catch (err) { K.ui().toast(K.errText(err), 'error'); }
        }));
      },
    });
  }

  function openAppt(id) {
    const a = S.appts.find((x) => x.id === id);
    if (!a) return;
    const st = STATUS[a.status] || STATUS.programata;
    // A leave block isn't a real appointment, show it read-only, with just a delete button
    // for whoever can edit the calendar (undoing the approval's calendar side, if ever needed).
    if (a.status === 'concediu') {
      K.drawer({
        title: a.clientName || 'Concediu', lead: K.avatar(a.cosmeticianName || '?', 42),
        subtitle: '<span class="k-tag is-mute">' + icon('calendar') + st.label + '</span> ' + esc(K.relDay(a.date)) + ' · ' + esc(a.location),
        body: '<dl class="k-kv cal-kv"><dt>Angajat</dt><dd>' + esc(a.cosmeticianName || '-') + '</dd><dt>Data</dt><dd>' + esc(K.dateLong(a.date)) + '</dd><dt>Locație</dt><dd>' + esc(a.location) + '</dd></dl>' +
          '<div class="mo-note">' + icon('info') + 'Generat automat la aprobarea cererii de concediu (Aprobări). Angajatul nu poate fi programat în această zi.</div>',
        footer: canEdit() ? '<button type="button" class="k-btn is-danger is-sm" data-del>' + icon('trash') + 'Șterge blocarea</button>' : '',
        onMount(el) {
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
        subtitle: '<span class="k-tag is-' + st.tone + '">' + st.label + '</span> ' + esc(K.relDay(a.date)) + ' · ' + esc(span(a) || 'fără oră') + ' · ' + esc(a.location),
        body: '<dl class="k-kv cal-kv"><dt>Tratament</dt><dd>' + esc(a.treatment || '-') + '</dd><dt>Categorie</dt><dd>' + esc(K.catLabel(a) || '-') + '</dd>' + (a.amount ? '<dt>Sumă</dt><dd>' + K.lei(a.amount) + '</dd>' : '') +
          '<dt>Data</dt><dd>' + esc(K.dateLong(a.date)) + '</dd><dt>Ora</dt><dd>' + esc(span(a) || '-') + '</dd><dt>Locație</dt><dd>' + esc(a.location) + '</dd>' +
          '<dt>Cosmeticiană</dt><dd>' + esc(a.cosmeticianName || 'neasignat') + '</dd></dl>' +
          '<div class="mo-note">' + icon('info') + 'Programările le face și le modifică recepția.</div>' +
          (a.clientId ? '<button type="button" class="k-btn is-outline" data-contact>' + icon('user') + 'Fișa clientei și pozele</button>' : ''),
        onMount(el) { const c = el.querySelector('[data-contact]'); if (c) c.addEventListener('click', () => { K.go('contacte'); setTimeout(() => K.emit('contacts:open', a.clientId), 250); }); },
      });
      return;
    }
    const d = K.drawer({
      title: a.clientName || 'Programare', lead: K.avatar(a.clientName, 42),
      subtitle: '<span class="k-tag is-' + st.tone + '">' + st.label + '</span> ' + esc(K.relDay(a.date)) + ' · ' + esc(span(a) || 'fără oră') + ' · ' + esc(a.location),
      body:
        (a.paidSaleId ? '<div class="mo-note is-good">' + icon('checkCircle') + 'Plătită, apare în Încasări.</div>' : '') +
        '<div class="cal-status" role="group" aria-label="Status">' + PICK.map((s) =>
          '<button type="button" class="is-' + STATUS[s].tone + (s === a.status ? ' is-on' : '') + '" data-status="' + s + '">' + icon(STATUS[s].ic) + '<span>' + STATUS[s].label + '</span></button>').join('') + '</div>' +
        (a.clientPhone ? '<div class="cal-contact">' +
          '<a class="k-btn is-outline" href="' + K.tel(a.clientPhone) + '">' + icon('phone') + 'Sună</a>' +
          '<a class="k-btn is-outline cal-wa" target="_blank" rel="noopener" href="' + K.wa(a.clientPhone, waText(a, a.date === K.today() ? 'reminder' : 'confirm')) + '">' + icon('chat') + (a.date === K.today() ? 'Reminder WhatsApp' : 'Confirmare WhatsApp') + '</a></div>' : '') +
        '<section class="k-section"><h4>' + icon('pen') + 'Detalii</h4>' + formHtml(a, false) + '</section>' +
        '<div class="k-muted">' + esc(a.clientPhone || 'Fără telefon salvat') + (a.cosmeticianName ? ' · cu ' + esc(a.cosmeticianName) : '') + '</div>',
      footer: '<button type="button" class="k-btn is-danger is-sm" data-del>' + icon('trash') + 'Șterge</button><span class="k-grow"></span>' +
        (a.clientId ? '<button type="button" class="k-icon-btn" data-contact title="Fișa clientei și pozele">' + icon('user') + '</button>' : '') +
        (a.paidSaleId ? '' : '<button type="button" class="k-btn is-outline" data-pay>' + icon('wallet') + 'Încasează</button>') + '<button type="button" class="k-btn is-primary" data-save>' + icon('check') + 'Salvează</button>',
      onMount(el) {
        const f = el.querySelector('[data-form]');
        wireForm(el, f);
        const ct = el.querySelector('[data-contact]');
        if (ct) ct.addEventListener('click', () => { d.close(); K.go('contacte'); setTimeout(() => K.emit('contacts:open', a.clientId), 250); });
        el.querySelectorAll('[data-status]').forEach((b) => b.addEventListener('click', async () => {
          const before = a.status;
          if (before === b.dataset.status) return;
          a.status = b.dataset.status;
          el.querySelectorAll('[data-status]').forEach((x) => x.classList.toggle('is-on', x === b));
          try { await save(a); K.ui().toast(a.clientName + ': ' + STATUS[a.status].label.toLowerCase(), 'success'); render(true); K.reload(); }
          catch (err) { a.status = before; K.ui().toast(K.errText(err), 'error'); openAppt(id); }
        }));
        el.querySelector('[data-save]').addEventListener('click', (e) => K.busy(e.currentTarget, async () => {
          const v = K.formValues(f);
          if (!v.clientPhone) delete v.clientPhone;
          v.categories = formCats(v);
          v.amount = Number(v.amount) || 0;
          if (!v.categories.length) { K.ui().toast('Alege cel puțin o categorie.', 'error'); return; }
          const next = Object.assign({}, a, v);
          // A phone added here links the appointment to the client directory (upsert by phone).
          if (v.clientPhone) next.clientId = '';
          try { await save(next); Object.assign(a, v); d.close(); K.ui().toast('Programare salvată.', 'success'); load(true); }
          catch (err) { K.ui().toast(K.errText(err), 'error'); }
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
      pop.innerHTML = '<div class="cal-month-head"><button type="button" class="k-icon-btn" data-m="-1">' + icon('left') + '</button><b>' + K.monthLabel(m) + '</b><button type="button" class="k-icon-btn" data-m="1">' + icon('right') + '</button></div>' +
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
  K.on('calendar:open', async (o) => {
    if (!o) return;
    S.date = o.date || S.date; S.view = 'day';
    await load();
    if (o.id) openAppt(o.id);
  });
})();
