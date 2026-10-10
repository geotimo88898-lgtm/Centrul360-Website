// Centrul360 portal — Calendar. A real time grid (08–21) in Day view (one column per location) and
// Week view (one column per day): click an empty slot to book, drag a block to move it (15-min snap,
// across columns too), click a block for its drawer with one-tap status, call / WhatsApp confirmation
// and "Încasează" straight into Încasări. Talks to /api/portal-appointments.
(function () {
  'use strict';
  const K = window.K;
  const { esc, icon } = K;
  const START = 8, END = 21, PPM = 1.1; // grid hours + pixels per minute
  const DUR = 60;                        // appointments carry no duration — draw them as 1h
  const LOCS = ['Timișoara', 'Arad'];
  const STATUS = {
    programata: { label: 'Programată', plural: 'programate', tone: 'accent', ic: 'calendar' },
    confirmata: { label: 'Confirmată', plural: 'confirmate', tone: 'good', ic: 'checkCircle' },
    finalizata: { label: 'Finalizată', plural: 'finalizate', tone: 'mute', ic: 'check' },
    reprogramata: { label: 'Reprogramată', plural: 'reprogramate', tone: 'warn', ic: 'refresh' },
    anulata: { label: 'Anulată', plural: 'anulate', tone: 'bad', ic: 'ban' },
  };
  const S = { view: 'day', date: K.today(), loc: 'all', emp: '', appts: [], range: '', loading: false };
  let panel, gridEl, nowTimer = 0;
  // Front desk + owner edit the calendar; a cosmetician sees it read-only (server enforces the same).
  const canEdit = () => !!(K.frontDesk && K.frontDesk());

  const toMin = (t) => { const m = /^(\d{1,2}):(\d{2})$/.exec(t || ''); return m ? +m[1] * 60 + +m[2] : null; };
  const toHM = (m) => K.pad(Math.floor(m / 60)) + ':' + K.pad(m % 60);
  const empName = (id) => { const e = (K.data && K.data.activeEmployees || []).find((x) => x.id === id); return e ? e.name : ''; };

  // ------------------------------------------------------------------ mount + chrome
  function mount(p) {
    panel = p;
    panel.classList.add('k-panel', 'cal');
    if (K.data && !K.data.isAdmin && LOCS.includes(K.data.me.location)) S.loc = K.data.me.location;
    // A cosmetician opens on her own clients; reception/admin see everyone.
    if (K.data && !K.data.isAdmin && K.data.me.role === 'cosmetician') S.emp = K.data.me.id;
    if (window.innerWidth < 720) S.view = 'day';
    panel.innerHTML =
      '<div class="k-head"><div><div class="k-eyebrow">Clinică</div><h2>Calendar</h2><p class="k-lede">' + (canEdit() ? 'Click pe un loc liber ca să programezi. Trage o programare ca s-o muți.' : 'Programările tale și ale echipei. Modificările le face recepția.') + '</p></div>' +
      (canEdit() ? '<div class="k-head-actions"><button type="button" class="k-btn is-accent" data-act="new">' + icon('plus') + 'Programare<kbd>N</kbd></button></div>' : '') + '</div>' +
      '<div class="cal-bar">' +
        '<div class="cal-nav"><button type="button" class="k-btn is-outline is-sm" data-act="today">Azi</button>' +
        '<button type="button" class="k-icon-btn" data-act="prev" aria-label="Înapoi">' + icon('left') + '</button>' +
        '<button type="button" class="k-icon-btn" data-act="next" aria-label="Înainte">' + icon('right') + '</button>' +
        '<button type="button" class="cal-title" data-act="month"><b data-title></b>' + icon('down') + '</button></div>' +
        '<div class="cal-bar-right"><select data-emp aria-label="Cosmeticiană"><option value="">Toată echipa</option>' + K.options(((K.data && K.data.activeEmployees) || []).map((e) => [e.id, (K.data.me.id === e.id ? 'Doar ale mele' : e.name)]), S.emp) + '</select>' + K.seg('calloc', [['all', 'Ambele'], ['Timișoara', 'Timișoara'], ['Arad', 'Arad']], S.loc) +
        K.seg('calview', [['day', 'Zi'], ['week', 'Săptămână']], S.view) + '</div>' +
      '</div>' +
      '<div class="cal-summary" data-summary></div>' +
      '<div class="cal-wrap k-card"><div class="cal-grid" data-grid></div></div>';
    gridEl = panel.querySelector('[data-grid]');
    panel.addEventListener('click', onClick);
    panel.addEventListener('change', (e) => {
      if (e.target.name === 'calview') { S.view = e.target.value; load(); }
      if (e.target.name === 'calloc') { S.loc = e.target.value; render(); }
      if (e.target.matches('[data-emp]')) { S.emp = e.target.value; render(true); }
    });
    gridEl.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('keydown', onKey);
    K.everySecond((now) => { if (now.getSeconds() % 30 === 0 && K.isActive('programari')) placeNow(); });
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
  function setView(v) { S.view = v; const seg = panel.querySelector('[data-k-seg="calview"]'); seg.querySelectorAll('button').forEach((b) => b.classList.toggle('is-on', b.dataset.v === v)); seg.querySelector('input').value = v; load(); }
  function shift(dir) { S.date = K.addDays(S.date, dir * (S.view === 'day' ? 1 : 7)); load(); }

  function onClick(e) {
    const act = e.target.closest('[data-act]');
    if (act) {
      const a = act.dataset.act;
      if (a === 'new') return openNew({});
      if (a === 'today') { S.date = K.today(); return load(); }
      if (a === 'prev') return shift(-1);
      if (a === 'next') return shift(1);
      if (a === 'month') return openMonth(act);
    }
    const day = e.target.closest('[data-goday]');
    if (day) { S.date = day.dataset.goday; return setView('day'); }
  }

  // ------------------------------------------------------------------ data
  function rangeFor() {
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
    else { const [a, b] = rangeFor(); t.textContent = K.dateShort(a) + ' – ' + K.dateShort(b) + ' ' + b.slice(0, 4); }
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
    const prevScroll = gridEl.parentElement.scrollTop;
    const cols = columns();
    const visible = S.appts.filter((a) => (S.loc === 'all' || a.location === S.loc) && (!S.emp || a.cosmeticianId === S.emp));
    renderSummary(visible);
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
          (untimed.length ? '<div class="cal-untimed">' + untimed.map((a) => '<button type="button" class="cal-chip is-' + a.status + '" data-id="' + esc(a.id) + '">' + esc(a.clientName) + '</button>').join('') + '</div>' : '') +
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

  // Overlapping appointments share the column width (simple lane packing).
  function layout(list) {
    const items = list.map((a) => ({ a, s: toMin(a.time), e: toMin(a.time) + DUR })).sort((x, y) => x.s - y.s);
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
  function blockHtml(it) {
    const a = it.a, st = STATUS[a.status] || STATUS.programata;
    const top = Math.max(0, (it.s - START * 60) * PPM), h = Math.max(30, DUR * PPM - 3);
    const w = 100 / it.lanes;
    return '<button type="button" class="cal-block is-' + a.status + '" data-id="' + esc(a.id) + '" style="top:' + top + 'px;height:' + h + 'px;left:calc(' + (it.lane * w) + '% + 3px);width:calc(' + w + '% - 6px)"' +
      ' title="' + esc(a.time + ' · ' + a.clientName + ' · ' + (a.treatment || '') + ' · ' + st.label) + '">' +
      '<span class="cal-b-time">' + esc(a.time) + (a.cosmeticianName ? '<i>' + esc(K.initials(a.cosmeticianName)) + '</i>' : '') + '</span>' +
      '<b>' + esc(a.clientName || '—') + '</b><span class="cal-b-sub">' + esc(a.treatment || '') + '</span></button>';
  }
  function renderSummary(list) {
    const el = panel.querySelector('[data-summary]');
    const c = (s) => list.filter((a) => a.status === s).length;
    const live = list.filter((a) => a.status !== 'anulata').length;
    el.innerHTML = '<span class="cal-sum-main">' + K.plural(live, 'programare', 'programări') + (S.view === 'day' ? '' : ' săptămâna aceasta') + '</span>' +
      Object.keys(STATUS).filter((s) => c(s)).map((s) => '<span class="k-tag is-' + STATUS[s].tone + '">' + icon(STATUS[s].ic) + c(s) + ' ' + (c(s) === 1 ? STATUS[s].label.toLowerCase() : STATUS[s].plural) + '</span>').join('') +
      (c('programata') ? '<span class="cal-hint">' + icon('info') + 'Programările neconfirmate apar cu albastru — confirmă-le cu un click.</span>' : '');
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
    drag.ghost.querySelector('.cal-b-time').firstChild.textContent = toHM(m);
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
      render(true);
      try {
        await save(a);
        K.ui().toast(a.clientName + ' → ' + K.relDay(date) + ' ' + time + (loc !== before.location ? ' · ' + loc : ''), 'success');
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
      action: 'update', id: a.id, date: a.date, time: a.time, clientId: a.clientId, clientName: a.clientName, clientPhone: a.clientPhone,
      treatment: a.treatment, category: a.category, location: a.location, cosmeticianId: a.cosmeticianId || '', status: a.status,
    };
  }
  const save = (a) => K.api('/api/portal-appointments', payload(a));

  // ------------------------------------------------------------------ drawers
  function catOptions(sel) { return K.options(Object.keys(K.cats).map((k) => [k, K.cats[k]]), sel); }
  function empOptions(sel) { return '<option value="">— neasignat —</option>' + K.options((K.data.activeEmployees || []).map((e) => [e.id, e.name + ' · ' + e.location]), sel); }
  function slotOptions(sel) {
    const out = [];
    for (let m = START * 60; m < END * 60; m += 15) out.push([toHM(m), toHM(m)]);
    if (sel && !out.some((o) => o[0] === sel)) out.unshift([sel, sel]);
    return K.options(out, sel);
  }
  function waText(a, kind) {
    const when = K.relDay(a.date).toLowerCase() === 'azi' ? 'azi' : K.relDay(a.date) === 'Mâine' ? 'mâine' : 'pe ' + K.dateLong(a.date).toLowerCase();
    if (kind === 'reminder') return 'Bună, ' + String(a.clientName || '').split(' ')[0] + '! Îți reamintim de programarea de ' + when + ' la ora ' + a.time + ' la Centrul360 ' + a.location + '. Te așteptăm!';
    return 'Bună, ' + String(a.clientName || '').split(' ')[0] + '! Îți confirmăm programarea la Centrul360 ' + a.location + ' ' + when + ' la ora ' + a.time + (a.treatment ? ', pentru ' + a.treatment : '') + '. Răspunde cu DA pentru confirmare. Mulțumim!';
  }

  function formHtml(a, isNew) {
    return '<form class="k-form" data-form>' +
      (isNew ? K.field('Client', '<input name="clientName" required maxlength="150" placeholder="Caută sau scrie un nume nou" autofocus>', 'full') +
        K.field('Telefon', '<input name="clientPhone" type="tel" required maxlength="30" placeholder="07xx xxx xxx">', 'full') :
        !a.clientPhone ? K.field('Telefon clientă', '<input name="clientPhone" type="tel" maxlength="30" placeholder="Lipsește — adaugă-l ca să poți suna / trimite WhatsApp">', 'full') : '') +
      K.field('Data', '<input name="date" type="date" required value="' + esc(a.date) + '">') +
      K.field('Ora', '<select name="time">' + slotOptions(a.time || '10:00') + '</select>') +
      K.field('Tratament', '<input name="treatment" required maxlength="200" value="' + esc(a.treatment || '') + '" placeholder="ex: Facial Restart">', 'full') +
      K.field('Categorie', '<select name="category">' + catOptions(a.category || 'tratament-facial') + '</select>') +
      K.field('Locație', '<select name="location">' + K.options(LOCS.map((l) => [l, l]), a.location || LOCS[0]) + '</select>') +
      K.field('Cosmeticiană', '<select name="cosmeticianId">' + empOptions(a.cosmeticianId || '') + '</select>', 'full') +
      (isNew ? K.field('Status', K.seg('status', [['programata', 'Programată'], ['confirmata', 'Confirmată']], 'programata', 'is-big'), 'full') : '') +
      '</form>';
  }

  function openNew(pre) {
    if (!canEdit()) return;
    const loc = pre.location || (K.data && LOCS.includes(K.data.me.location) ? K.data.me.location : LOCS[0]);
    const a = { date: pre.date || S.date, time: pre.time || '', location: loc, treatment: pre.treatment || '', category: pre.category || '', cosmeticianId: pre.cosmeticianId || S.emp || '' };
    let picker;
    const d = K.drawer({
      title: 'Programare nouă', icon: 'calendar', subtitle: esc(K.dateLong(a.date)) + (a.time ? ' · ' + a.time : '') + ' · ' + esc(loc),
      body: formHtml(a, true),
      footer: '<span class="k-grow k-muted">Se creează și sarcina de confirmare pe WhatsApp.</span><button type="button" class="k-btn" data-k-close2>Renunță</button><button type="button" class="k-btn is-accent" data-save>' + icon('check') + 'Programează</button>',
      onMount(el) {
        const f = el.querySelector('[data-form]');
        picker = K.clientPicker(f.clientName, f.clientPhone);
        if (pre.clientName) { f.clientName.value = pre.clientName; f.clientPhone.value = pre.clientPhone || ''; }
        el.querySelector('[data-k-close2]').addEventListener('click', () => d.close());
        f.addEventListener('submit', (e) => { e.preventDefault(); el.querySelector('[data-save]').click(); });
        el.querySelector('[data-save]').addEventListener('click', (e) => K.busy(e.currentTarget, async () => {
          const v = K.formValues(f);
          if (!v.clientName || !v.clientPhone) { K.ui().toast('Completează clientul și telefonul.', 'error'); return; }
          if (!v.treatment) { K.ui().toast('Completează tratamentul.', 'error'); f.treatment.focus(); return; }
          try {
            await K.api('/api/portal-appointments', Object.assign({ action: 'create', clientId: picker.id() }, v));
            d.close();
            K.ui().toast('Programat: ' + v.clientName + ' · ' + K.relDay(v.date) + ' ' + v.time, 'success');
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
    if (!canEdit()) {
      K.drawer({
        title: a.clientName || 'Programare', lead: K.avatar(a.clientName, 42),
        subtitle: '<span class="k-tag is-' + st.tone + '">' + st.label + '</span> ' + esc(K.relDay(a.date)) + ' · ' + esc(a.time || 'fără oră') + ' · ' + esc(a.location),
        body: '<dl class="k-kv cal-kv"><dt>Tratament</dt><dd>' + esc(a.treatment || '—') + '</dd><dt>Categorie</dt><dd>' + esc(K.cats[a.category] || a.category || '—') + '</dd>' +
          '<dt>Data</dt><dd>' + esc(K.dateLong(a.date)) + '</dd><dt>Ora</dt><dd>' + esc(a.time || '—') + '</dd><dt>Locație</dt><dd>' + esc(a.location) + '</dd>' +
          '<dt>Cosmeticiană</dt><dd>' + esc(a.cosmeticianName || 'neasignat') + '</dd></dl>' +
          '<div class="mo-note">' + icon('info') + 'Schimbări (oră, status, anulare) — le face recepția.</div>' +
          '<a class="k-btn is-outline" href="#resurse" data-go-sop>' + icon('book') + 'Protocolul tratamentului</a>',
        onMount(el) { el.querySelector('[data-go-sop]').addEventListener('click', (e) => { e.preventDefault(); K.go('resurse'); setTimeout(() => K.emit('resurse:tab', 'protocoale'), 200); }); },
      });
      return;
    }
    const d = K.drawer({
      title: a.clientName || 'Programare', lead: K.avatar(a.clientName, 42),
      subtitle: '<span class="k-tag is-' + st.tone + '">' + st.label + '</span> ' + esc(K.relDay(a.date)) + ' · ' + esc(a.time || 'fără oră') + ' · ' + esc(a.location),
      body:
        '<div class="cal-status" role="group" aria-label="Status">' + Object.keys(STATUS).map((s) =>
          '<button type="button" class="is-' + STATUS[s].tone + (s === a.status ? ' is-on' : '') + '" data-status="' + s + '">' + icon(STATUS[s].ic) + '<span>' + STATUS[s].label + '</span></button>').join('') + '</div>' +
        (a.clientPhone ? '<div class="cal-contact">' +
          '<a class="k-btn is-outline" href="' + K.tel(a.clientPhone) + '">' + icon('phone') + 'Sună</a>' +
          '<a class="k-btn is-outline cal-wa" target="_blank" rel="noopener" href="' + K.wa(a.clientPhone, waText(a, a.date === K.today() ? 'reminder' : 'confirm')) + '">' + icon('chat') + (a.date === K.today() ? 'Reminder WhatsApp' : 'Confirmare WhatsApp') + '</a></div>' : '') +
        '<section class="k-section"><h4>' + icon('pen') + 'Detalii</h4>' + formHtml(a, false) + '</section>' +
        '<div class="k-muted">' + esc(a.clientPhone || 'Fără telefon salvat') + (a.cosmeticianName ? ' · cu ' + esc(a.cosmeticianName) : '') + '</div>',
      footer: '<button type="button" class="k-btn is-danger is-sm" data-del>' + icon('trash') + 'Șterge</button><span class="k-grow"></span>' +
        '<button type="button" class="k-btn is-outline" data-pay>' + icon('wallet') + 'Încasează</button><button type="button" class="k-btn is-primary" data-save>' + icon('check') + 'Salvează</button>',
      onMount(el) {
        const f = el.querySelector('[data-form]');
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
          const next = Object.assign({}, a, v);
          // A phone added here links the appointment to the client directory (upsert by phone).
          if (v.clientPhone) next.clientId = '';
          try { await save(next); Object.assign(a, v); d.close(); K.ui().toast('Programare salvată.', 'success'); load(true); }
          catch (err) { K.ui().toast(K.errText(err), 'error'); }
        }));
        el.querySelector('[data-pay]').addEventListener('click', () => {
          d.close();
          K.go('incasari');
          setTimeout(() => K.emit('incasari:new', { clientName: a.clientName, clientPhone: a.clientPhone, clientId: a.clientId, treatment: a.treatment, category: a.category, performedBy: a.cosmeticianId, date: a.date, appt: a }), 250);
        });
        el.querySelector('[data-del]').addEventListener('click', async () => {
          if (!(await K.ui().confirm({ title: 'Ștergi programarea?', message: a.clientName + ' · ' + K.relDay(a.date) + ' ' + a.time + ' se șterge definitiv. Dacă doar s-a anulat, folosește „Anulată”.', confirmText: 'Șterge', danger: true }))) return;
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
