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
  // "Blochează timp": a leave-like row (status concediu) with block: true, hours and a reason
  const BLOCKED = { label: 'Blocat', plural: 'blocate', tone: 'mute', ic: 'ban' };
  const stOf = (a) => (a.block ? BLOCKED : STATUS[a.status] || STATUS.programata);
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
      (canEdit() ? '<div class="k-head-actions"><button type="button" class="k-btn is-outline" data-act="block">' + icon('ban') + 'Blochează timp</button><button type="button" class="k-btn is-accent" data-act="new">' + icon('plus') + 'Programare<kbd>N</kbd></button></div>' : '') + '</div>' +
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
      if (a === 'block') return openBlock({});
      if (a === 'today') { S.date = K.today(); return load(); }
      if (a === 'prev') return shift(-1);
      if (a === 'next') return shift(1);
      if (a === 'month') return phone() ? null : openMonth(act); // a phone has the month open on top
    }
    const mday = e.target.closest('[data-mday]');
    if (mday) return pickDay(mday.dataset.mday);
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
    mbox.hidden = !phone() || S.view === 'week'; // a phone's week: the 7 days' grid, like Google's
    const visible = S.appts.filter((a) => (S.loc === 'all' || a.location === S.loc) && (!S.emp || a.cosmeticianId === S.emp) &&
      (S.only === 'all' || a.status === S.only || a.status === 'finalizata'));
    if (phone() && S.view === 'day') mbox.innerHTML = monthHtml();
    const prevScroll = gridEl.parentElement.scrollTop;
    const cols = columns();
    renderSummary(phone() && S.view === 'day' ? visible.filter((a) => a.date === S.date) : visible); // a phone has the month loaded: the day's numbers
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
    if (a.block) return a.cosmeticianName || 'Toată clinica'; // a blocked time: for whom
    if (!a.ghlTitle) return a.treatment || '';
    const first = plainTxt(a.clientName).split(/\s+/)[0];
    const named = first && plainTxt(a.ghlTitle).includes(first);
    return [named ? '' : a.clientName, a.treatment && a.treatment !== a.ghlTitle ? a.treatment : ''].filter(Boolean).join(' · ');
  }
  function blockHtml(it) {
    const a = it.a, st = stOf(a);
    const top = Math.max(0, (it.s - START * 60) * PPM), h = Math.max(30, (Math.min(it.e, END * 60) - it.s) * PPM - 3);
    const w = 100 / it.lanes;
    // as many lines for the name as the block's height holds, so a long title shows whole; a short appointment (half
    // an hour) has the hour in front of the name, in smaller letters, on up to two lines
    const short = it.e - it.s < 45; // under 45 minutes; an hour keeps the big letters whatever the screen
    const tiny = phone() && S.view === 'week'; // a phone's week: 7 narrow columns, only the name
    const lines = tiny ? Math.max(1, Math.floor((h - 4) / 11.5)) : short ? Math.max(1, Math.floor((h - 6) / 13.5)) : Math.max(1, Math.floor((h - 28) / 17));
    return '<button type="button" class="cal-block is-' + a.status + (a.block ? ' is-block' : '') + (tiny ? ' is-tiny' : short ? ' is-short' : '') + '" data-id="' + esc(a.id) + '" style="top:' + top + 'px;height:' + h + 'px;left:calc(' + (it.lane * w) + '% + 3px);width:calc(' + w + '% - 6px);--lines:' + lines + '"' +
      ' title="' + esc(span(a) + ' · ' + nameOf(a) + (a.ghlTitle ? ' · ' + a.clientName : '') + ' · ' + (a.treatment || '') + ' · ' + st.label) + '">' +
      (tiny ? '<b>' + esc(nameOf(a)) + '</b>' : short
        ? '<b><span class="cal-b-t">' + esc(a.time || '') + '</span>' + esc(nameOf(a)) + '</b>'
        : '<span class="cal-b-time">' + esc(span(a)) + (a.cosmeticianName ? '<i>' + esc(K.initials(a.cosmeticianName)) + '</i>' : '') + '</span>' +
          '<b>' + esc(nameOf(a)) + '</b><span class="cal-b-sub">' + esc(subOf(a)) + (a.amount ? ' · ' + K.lei(a.amount) : '') + (a.paidSaleId ? ' · plătit' : '') + '</span>') + '</button>';
  }
  function renderSummary(list) {
    const el = panel.querySelector('[data-summary]');
    // a blocked time is counted apart from the leaves, and neither is an appointment
    const c = (s) => list.filter((a) => a.status === s && !a.block).length;
    const blocked = list.filter((a) => a.block).length;
    const live = list.filter((a) => a.status !== 'anulata' && a.status !== 'concediu').length;
    el.innerHTML = '<span class="cal-sum-main">' + K.plural(live, 'programare', 'programări') + (S.view === 'day' ? '' : ' săptămâna aceasta') + '</span>' +
      Object.keys(STATUS).filter((s) => c(s)).map((s) => '<span class="k-tag is-' + STATUS[s].tone + '">' + icon(STATUS[s].ic) + c(s) + ' ' + (c(s) === 1 ? STATUS[s].label.toLowerCase() : STATUS[s].plural) + '</span>').join('') +
      (blocked ? '<span class="k-tag is-mute">' + icon('ban') + blocked + ' ' + (blocked === 1 ? 'interval blocat' : 'intervale blocate') + '</span>' : '') +
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
    if (d.started) { gridEl.classList.remove('is-dragging'); render(true); }
  }
  function onMove(e) {
    if (!drag) return;
    const dist = Math.hypot(e.clientX - drag.sx, e.clientY - drag.sy);
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
    unbind();
    const d = drag; drag = null;
    if (!d) return;
    clearTimeout(d.timer);
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
      '<div class="k-field full">' + K.toggle('package', !!a.package, 'Ședință din pachet') + '<small>Primește doar reamintirile, fără confirmarea programării și fără cererea de recenzie.</small></div>' +
      K.field('Observații', '<textarea name="note" rows="2" maxlength="500" placeholder="ex. vine cu prietena, zona: abdomen">' + esc(a.note || '') + '</textarea>', 'full') +
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
      footer: '<button type="button" class="k-btn is-ghost is-sm cal-to-block" data-to-block title="Blochează intervalul" aria-label="Blochează intervalul">' + icon('ban') + '<span>Blochează intervalul</span></button><span class="k-grow"></span><button type="button" class="k-btn" data-k-close2>Renunță</button><button type="button" class="k-btn is-accent" data-save>' + icon('check') + 'Programează</button>',
      onMount(el) {
        const f = el.querySelector('[data-form]');
        picker = K.clientPicker(f.clientName, f.clientPhone);
        wireForm(el, f);
        if (pre.clientName) { f.clientName.value = pre.clientName; f.clientPhone.value = pre.clientPhone || ''; }
        // the treatment she asked for (her lead's offer): its chip fills the price and the categories, as a tap would
        if (pre.treatment) { const chip = Array.from(f.querySelectorAll('[data-offer]')).find((b) => { const o = (K.data.offers || []).find((x) => x.id === b.dataset.offer); return o && o.title === pre.treatment; }); if (chip) chip.click(); }
        if (pre.amount && !Number(f.amount.value)) f.amount.value = pre.amount;
        el.querySelector('[data-k-close2]').addEventListener('click', () => d.close());
        el.querySelector('[data-to-block]').addEventListener('click', () => { const v = K.formValues(f); d.close(); setTimeout(() => openBlock({ date: v.date, time: v.time, endTime: v.endTime, location: v.location, cosmeticianId: v.cosmeticianId }), 230); });
        f.addEventListener('submit', (e) => { e.preventDefault(); el.querySelector('[data-save]').click(); });
        el.querySelector('[data-save]').addEventListener('click', (e) => K.busy(e.currentTarget, async () => {
          const v = K.formValues(f);
          if (!v.clientName || !v.clientPhone) { K.ui().toast('Completează clientul și telefonul.', 'error'); return; }
          if (!v.treatment) { K.ui().toast('Completează tratamentul.', 'error'); f.treatment.focus(); return; }
          if (!formCats(v).length) { K.ui().toast('Alege cel puțin o categorie.', 'error'); return; }
          // a session from a package is already paid: 0 is fine there
          if (!v.package && !(Number(v.amount) > 0)) { K.ui().toast('Scrie suma programării (sau bifează „Ședință din pachet”).', 'error'); f.amount.focus(); return; }
          if (!v.cosmeticianId) { K.ui().toast('Alege cosmeticiana.', 'error'); return; }
          if (!(await placeOk(v, 'Programezi', 'Programează oricum'))) return;
          const body = Object.assign({ action: 'create', clientId: picker.id(), leadId: pre.leadId || '' }, v, { categories: formCats(v), amount: Number(v.amount) });
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
          } catch (err) { K.ui().toast(K.errText(err), 'error'); }
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
    catch (e) { box.remove(); return; }
    if (!box.isConnected) return;
    const c = j.contact || {}, appts = j.appointments || [], pays = j.payments || [];
    const notes = ((j.detail && j.detail.notes) || []).slice(0, 2);
    const done = appts.filter((x) => x.status === 'finalizata');
    const last = done.map((x) => x.date).filter((x) => x < K.today()).sort().pop();
    const paid = pays.reduce((s, p) => s + Number(p.amount || 0), 0);
    const photos = c.photosCount || 0;
    box.innerHTML = '<h4>' + icon('user') + 'Clienta</h4>' +
      '<div class="cal-client-top">' + (a.clientPhone ? '<a href="#mesaje" class="cal-client-who" data-chat="' + esc(a.clientPhone) + '" data-chat-name="' + esc(a.clientName || '') + '" data-chat-city="' + esc(a.location || '') + '" title="Deschide conversația">' : '<div>') + '<b>' + esc(c.name || a.clientName) + '</b><span>' + esc([c.phone, c.email].filter(Boolean).join(' · ')) + '</span>' + (a.clientPhone ? '</a>' : '</div>') +
        ((c.tags || []).length ? '<div class="cal-client-tags">' + c.tags.slice(0, 4).map((t) => '<span class="k-tag">' + esc(t) + '</span>').join('') + '</div>' : '') + '</div>' +
      '<div class="cal-client-stats"><span><b>' + appts.length + '</b>' + (appts.length === 1 ? 'programare' : 'programări') + '</span>' +
        '<span><b>' + (last ? esc(K.dateShort(last)) : '-') + '</b>ultima vizită</span>' +
        '<span><b>' + K.lei(paid) + '</b>plătit</span>' + (photos ? '<span><b>' + photos + '</b>' + (photos === 1 ? 'poză' : 'poze') + '</span>' : '') + '</div>' +
      (notes.length ? '<div class="cal-client-notes">' + notes.map((n) => '<p>' + esc(String(n.text || '').slice(0, 160)) + (String(n.text || '').length > 160 ? '…' : '') + '<small>' + esc(n.author || '') + (n.at ? ' · ' + esc(K.ago(n.at)) : '') + '</small></p>').join('') + '</div>' : '') +
      '<button type="button" class="k-btn is-outline cal-client-open" data-open-client>' + icon('user') + 'Deschide fișa clientei' + icon('arrow') + '</button>';
    box.querySelector('[data-open-client]').addEventListener('click', () => K.emit('contacts:open', { id: a.clientId, tab: 'fise' }));
  }
  function openAppt(id) {
    const a = S.appts.find((x) => x.id === id);
    if (!a) return;
    const st = STATUS[a.status] || STATUS.programata;
    // A leave block isn't a real appointment, show it read-only, with just a delete button
    // for whoever can edit the calendar (undoing the approval's calendar side, if ever needed).
    if (a.status === 'concediu' && a.block) {
      K.drawer({
        title: a.clientName || 'Timp blocat', icon: 'ban',
        subtitle: '<span class="k-tag is-mute">' + icon('ban') + 'Blocat</span> ' + esc(K.relDay(a.date)) + ' · ' + esc(span(a) || 'toată ziua') + ' · ' + esc(a.location),
        body: '<dl class="k-kv cal-kv"><dt>Motiv</dt><dd>' + esc(a.clientName || '-') + '</dd><dt>Data</dt><dd>' + esc(K.dateLong(a.date)) + '</dd><dt>Ora</dt><dd>' + esc(span(a) || 'Toată ziua') + '</dd>' +
          '<dt>Locație</dt><dd>' + esc(a.location) + '</dd><dt>Pentru</dt><dd>' + esc(a.cosmeticianName || 'Toată clinica') + '</dd></dl>',
        footer: canEdit() ? '<button type="button" class="k-btn is-danger is-sm" data-del>' + icon('trash') + 'Deblochează</button><span class="k-grow"></span><button type="button" class="k-btn is-primary" data-edit-block>' + icon('pen') + 'Modifică</button>' : '',
        onMount(el) {
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
          '<a class="k-btn is-outline cal-wa" href="#mesaje" data-chat="' + esc(a.clientPhone) + '" data-chat-name="' + esc(a.clientName || '') + '" data-chat-city="' + esc(a.location || '') + '">' + icon('chat') + 'Mesaje</a></div>' : '') +
        (a.clientId ? '<section class="k-section cal-client" data-client><h4>' + icon('user') + 'Clienta</h4><div class="k-skel" style="height:72px"></div></section>' : '') +
        '<section class="k-section"><h4>' + icon('pen') + 'Detalii</h4>' + formHtml(a, false) + '</section>' +
        '<div class="k-muted">' + esc(a.clientPhone || 'Fără telefon salvat') + (a.cosmeticianName ? ' · cu ' + esc(a.cosmeticianName) : '') + '</div>',
      footer: '<button type="button" class="k-btn is-danger is-sm" data-del>' + icon('trash') + 'Șterge</button><span class="k-grow"></span>' +
        (a.paidSaleId ? '' : '<button type="button" class="k-btn is-outline" data-pay>' + icon('wallet') + 'Încasează</button>') + '<button type="button" class="k-btn is-primary" data-save>' + icon('check') + 'Salvează</button>',
      onMount(el) {
        const f = el.querySelector('[data-form]');
        wireForm(el, f);
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
          try { await save(a); K.ui().toast(a.clientName + ': ' + STATUS[a.status].label.toLowerCase(), 'success'); render(true); K.reload(); }
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
            const j = await save(next);
            Object.assign(a, (j && j.appointment) || v);
            d.close();
            K.ui().toast('Programare salvată.', 'success');
            load(true);
          } catch (err) { K.ui().toast(K.errText(err), 'error'); }
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
  // Pipeline, Mesaje, Contacte: "change the appointment" opens it here, on its day
  K.openAppointment = async (id, date) => {
    if (!id) return;
    K.go('programari');
    const until = Date.now() + 5000;
    while (!panel && Date.now() < until) await new Promise((r) => setTimeout(r, 80));
    if (!panel) return;
    if (date) S.date = String(date).slice(0, 10);
    S.view = 'day';
    await load();
    if (S.appts.some((x) => x.id === id)) openAppt(id);
    else K.ui().toast('Programarea nu mai e în calendar (a fost ștearsă).', 'info');
  };
  K.on('calendar:open', async (o) => {
    if (!o) return;
    S.date = o.date || S.date; S.view = 'day';
    await load();
    if (o.id) openAppt(o.id);
  });
})();
