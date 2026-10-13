// Centrul360 portal, "Mesaje": the WhatsApp inbox of both clinic numbers (Timișoara, Arad) inside the
// portal, like LeadConnector's conversations. The list (search, unread, city), the conversation (days,
// delivery ticks, who answered, her lead), a free answer within Meta's 24h window, an approved template
// after it or to write first ("Mesaj nou"). On a phone the list and the conversation each take the whole
// screen, the answer box stays at the bottom. Live: every new message comes in by itself.
// Data: /api/portal-whatsapp (numbers, templates, conversations); the numbers are connected in Integrări.
(function () {
  'use strict';
  const K = window.K;
  const { esc, icon } = K;

  const C = { conversations: [], numbers: {}, templates: [], q: '', show: 'all', loc: 'all', selectedPhone: null, thread: null, loadingThread: false, loaded: false, pushed: false };
  let panel;
  const CITY_SHORT = { 'Timișoara': 'TM', Arad: 'AR' };
  const TICK = { sent: '✓', delivered: '✓✓', read: '✓✓', failed: '!', received: '' };
  const SEND = '<svg class="k-ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M22 2 11 13"/><path d="m22 2-7 20-4-9-9-4z"/></svg>';
  const phone = () => !!(window.matchMedia && window.matchMedia('(max-width:720px)').matches);

  function mount(p) {
    panel = p;
    panel.classList.add('k-panel', 'mx');
    panel.innerHTML =
      '<div class="k-head"><div><div class="k-eyebrow">Echipă</div><h2>Mesaje</h2></div>' +
      '<div class="k-head-actions"><button type="button" class="k-btn is-accent" data-act="new">' + icon('pen') + 'Mesaj nou</button></div></div>' +
      '<div data-body><div class="k-skel" style="height:320px"></div></div>';
    panel.addEventListener('click', onClick);
    panel.addEventListener('submit', onSubmit);
    panel.addEventListener('keydown', onKeydown);
    panel.addEventListener('input', onInput);
    panel.addEventListener('change', (e) => { if (e.target.name === 'waloc') { C.loc = e.target.value; paintList(); } });
  }

  async function load() {
    try {
      const j = await K.api('/api/portal-whatsapp', { action: 'list' });
      C.conversations = j.conversations || [];
      C.numbers = j.numbers || {};
      C.templates = j.templates || [];
      C.loaded = true;
      if (C.selectedPhone && !C.conversations.find((c) => c.phone === C.selectedPhone)) closeThread();
      if (!panel.querySelector('[data-mx-list]')) render(); else { paintStatus(); paintList(); }
      if (C.selectedPhone) loadThread(C.selectedPhone, false);
    } catch (e) {
      panel.querySelector('[data-body]').innerHTML = K.empty('alert', 'Nu am putut încărca mesajele', 'Verifică conexiunea și reîncearcă.', '<button type="button" class="k-btn is-primary" data-act="refresh">Reîncearcă</button>');
    }
  }

  async function loadThread(ph, showSkeleton) {
    if (showSkeleton) { C.loadingThread = true; paintThread(); }
    const body = panel.querySelector('.mx-tbody');
    const atBottom = !body || body.scrollHeight - body.scrollTop - body.clientHeight < 60;
    try {
      const j = await K.api('/api/portal-whatsapp', { action: 'thread', phone: ph });
      if (C.selectedPhone !== ph) return;
      const same = C.thread && JSON.stringify(C.thread.messages) === JSON.stringify(j.messages) && C.thread.within24h === j.within24h;
      C.thread = j;
      const convo = C.conversations.find((c) => c.phone === ph);
      if (convo && convo.unreadCount) { convo.unreadCount = 0; paintList(); }
      if (same && !showSkeleton) return; // nothing new: the conversation stays as it is (and the draft too)
    } catch (e) {
      K.ui().toast(K.errText(e), 'error');
    } finally {
      C.loadingThread = false;
    }
    paintThread();
    if (atBottom || showSkeleton) scrollToBottom();
  }
  function scrollToBottom() { const b = panel && panel.querySelector('.mx-tbody'); if (b) b.scrollTop = b.scrollHeight; }

  // ------------------------------------------------------------------ helpers
  const dayKey = (iso) => { const d = new Date(iso); return isNaN(d) ? '' : K.iso(d); };
  function fmtTime(iso) {
    if (!iso) return '';
    const d = new Date(iso);
    if (isNaN(d)) return '';
    const today = K.today(), day = K.iso(d);
    if (day === today) return K.pad(d.getHours()) + ':' + K.pad(d.getMinutes());
    if (day === K.addDays(today, -1)) return 'ieri';
    return K.dateShort(day);
  }
  const hm = (iso) => { const d = new Date(iso); return isNaN(d) ? '' : K.pad(d.getHours()) + ':' + K.pad(d.getMinutes()); };
  const pretty = (p) => { const d = String(p || '').replace(/\D/g, ''); return /^0\d{9}$/.test(d) ? d.slice(0, 4) + ' ' + d.slice(4, 7) + ' ' + d.slice(7) : String(p || ''); };
  const named = (c) => !!(c.clientName && c.clientName !== c.phone && /[a-zA-ZăâîșțĂÂÎȘȚ]/.test(c.clientName));
  const nameOf = (c) => (named(c) ? c.clientName : pretty(c.phone));
  const face = (c, size) => (named(c) ? K.avatar(c.clientName, size) : '<span class="k-avatar mx-anon" style="--s:' + size + 'px">' + icon('user') + '</span>');
  const connected = () => Object.keys(C.numbers).filter((c) => C.numbers[c].connected);
  const isAdmin = () => !!(K.data && K.data.isAdmin);

  // ------------------------------------------------------------------ the page
  function render() {
    panel.querySelector('[data-body]').innerHTML =
      '<div data-mx-status></div>' +
      '<div class="mx-wrap">' +
        '<section class="k-card mx-list-col"><div class="mx-tools"><label class="mx-search">' + icon('search') + '<input data-q type="search" placeholder="Caută o clientă sau un număr…" value="' + esc(C.q) + '"></label>' +
          '<div class="mx-filters"><div class="k-chips" data-chips></div>' + K.seg('waloc', [['all', 'Ambele'], ['Timișoara', 'TM'], ['Arad', 'AR']], C.loc) + '</div></div>' +
          '<div class="mx-list" data-mx-list></div></section>' +
        '<section class="k-card mx-thread-col" data-mx-thread></section>' +
      '</div>';
    paintStatus(); paintList(); paintThread();
  }

  // which numbers are connected: a quiet line when both are, a clear card when not
  function paintStatus() {
    const box = panel.querySelector('[data-mx-status]');
    if (!box) return;
    const cities = Object.keys(C.numbers);
    const on = connected();
    if (on.length === cities.length && cities.length) { box.innerHTML = ''; return; }
    box.innerHTML = '<div class="k-card mx-status">' + icon(on.length ? 'info' : 'chat') + '<div><b>' + (on.length ? 'Un număr nu e conectat încă' : 'WhatsApp nu e conectat încă') + '</b><span>' +
      cities.map((c) => '<i class="' + (C.numbers[c].connected ? 'is-on' : '') + '">' + esc(c) + (C.numbers[c].connected ? ' · ' + esc(C.numbers[c].display) : ' · neconectat') + '</i>').join('') +
      '</span><small>' + (on.length ? 'Conversațiile numărului conectat merg deja.' : 'Totul e pregătit: după ce conectezi numerele, mesajele clientelor apar aici singure, iar tu răspunzi direct de aici.') + '</small></div>' +
      (isAdmin() ? '<button type="button" class="k-btn is-sm is-primary" data-act="connect">Conectează</button>' : '') + '</div>';
  }

  function visible() {
    const q = K.norm(C.q || ''), qd = C.q.replace(/\D/g, '');
    return C.conversations.filter((c) => (C.loc === 'all' || c.location === C.loc) && (C.show === 'all' || (C.show === 'unread' && c.unreadCount) || (C.show === 'open' && c.within24h)) &&
      (!q || K.norm(nameOf(c)).includes(q) || (qd.length >= 3 && String(c.phone).replace(/\D/g, '').includes(qd))));
  }
  function paintList() {
    const box = panel.querySelector('[data-mx-list]');
    if (!box) return;
    const unread = C.conversations.filter((c) => c.unreadCount).length;
    const open = C.conversations.filter((c) => c.within24h).length;
    panel.querySelector('[data-chips]').innerHTML = [['all', 'Toate', C.conversations.length], ['unread', 'Necitite', unread], ['open', 'Deschise 24h', open]]
      .map(([k, l, n]) => '<button type="button" class="k-chip' + (C.show === k ? ' is-on' : '') + '" data-show="' + k + '">' + l + (n ? '<span>' + n + '</span>' : '') + '</button>').join('');
    const list = visible();
    box.innerHTML = list.length ? list.map(row).join('')
      : C.conversations.length ? K.empty('search', 'Nimic aici', 'Schimbă filtrul sau căutarea.')
        : K.empty('chat', 'Nicio conversație încă', connected().length ? 'Când îți scrie o clientă pe WhatsApp, apare aici imediat. Poți și să scrii tu primul, cu „Mesaj nou”.' : 'După ce se conectează numerele, mesajele clientelor apar aici singure.');
  }
  function row(c) {
    const preview = (c.lastDirection === 'out' ? (TICK[c.lastStatus] ? TICK[c.lastStatus] + ' ' : 'Tu: ') : '') + (c.lastText || '');
    return '<button type="button" class="mx-row' + (c.phone === C.selectedPhone ? ' is-on' : '') + (c.unreadCount ? ' is-unread' : '') + '" data-pick="' + esc(c.phone) + '">' +
      face(c, 44) +
      '<span class="mx-row-main"><span class="mx-row-top"><b>' + esc(nameOf(c)) + '</b><small>' + esc(fmtTime(c.lastMessageAt)) + '</small></span>' +
        '<span class="mx-row-bottom"><span class="mx-row-prev">' + esc(preview) + '</span>' +
        (c.location ? '<em class="mx-city">' + esc(CITY_SHORT[c.location] || c.location) + '</em>' : '') +
        (c.unreadCount ? '<i class="mx-unread">' + (c.unreadCount > 99 ? '99+' : c.unreadCount) + '</i>' : '') + '</span></span></button>';
  }

  function bubble(m) {
    const out = m.direction === 'out';
    return '<div class="mx-msg is-' + (out ? 'out' : 'in') + (m.status === 'failed' ? ' is-failed' : '') + '"><div class="mx-bub">' +
      (m.type === 'template' ? '<span class="mx-tpl-tag">' + icon('file') + 'Șablon</span>' : '') +
      '<span class="mx-text">' + esc(m.text) + '</span>' +
      '<span class="mx-meta">' + (out && m.sentByName ? esc(m.sentByName) + ' · ' : '') + esc(hm(m.timestamp)) + (out ? ' <i class="mx-tick' + (m.status === 'read' ? ' is-read' : '') + '">' + (TICK[m.status] || '') + '</i>' : '') + '</span></div></div>';
  }
  function dayLabel(day) {
    const t = K.today();
    return day === t ? 'Azi' : day === K.addDays(t, -1) ? 'Ieri' : K.dateLong(day).split(', ')[1] || K.dateShort(day);
  }
  function paintThread() {
    const box = panel.querySelector('[data-mx-thread]');
    if (!box) return;
    panel.classList.toggle('is-thread', !!C.selectedPhone);
    document.documentElement.classList.toggle('mx-thread-open', !!C.selectedPhone && phone() && K.isActive('mesaje'));
    if (!C.selectedPhone) {
      box.innerHTML = K.empty('chat', 'Alege o conversație', 'Mesajele, răspunsurile și șabloanele, într-un singur loc.');
      return;
    }
    if (C.loadingThread || !C.thread) {
      const c = C.conversations.find((x) => x.phone === C.selectedPhone) || {};
      delete box.dataset.for;
      box.innerHTML = headHtml({ clientName: c.clientName || C.selectedPhone, phone: C.selectedPhone, location: c.location }) + '<div class="mx-tbody"><div class="k-skel" style="height:220px"></div></div>';
      return;
    }
    const t = C.thread;
    let last = '', msgs = '';
    (t.messages || []).forEach((m) => { const d = dayKey(m.timestamp); if (d !== last) { msgs += '<div class="mx-day"><span>' + esc(dayLabel(d)) + '</span></div>'; last = d; } msgs += bubble(m); });
    const left = t.windowEnds ? Math.max(0, Math.floor((new Date(t.windowEnds) - Date.now()) / 3600e3)) : 0;
    const windowLine = icon('clock') + 'Poți răspunde liber încă ' + (left < 1 ? 'mai puțin de o oră' : left === 1 ? 'o oră' : left + (left >= 20 ? ' de ore' : ' ore')) + '.';
    // the same conversation, still open for answers: only the messages change, the answer box stays
    if (t.within24h && box.dataset.for === t.phone && box.querySelector('.mx-compose')) {
      box.querySelector('.mx-thead').outerHTML = headHtml(t);
      box.querySelector('.mx-tbody').innerHTML = msgs;
      box.querySelector('.mx-window').innerHTML = windowLine;
      return;
    }
    const draft = (box.querySelector('textarea') || {}).value || '';
    box.dataset.for = t.phone;
    box.innerHTML = headHtml(t) +
      '<div class="mx-tbody">' + (msgs || K.empty('chat', 'Nimic încă', '')) + '</div>' +
      (t.within24h
        ? '<form class="mx-compose" data-send><button type="button" class="k-icon-btn" data-act="tpl" title="Trimite un șablon">' + icon('file') + '</button>' +
          '<textarea name="text" maxlength="4000" placeholder="Scrie un mesaj…" rows="1">' + esc(draft) + '</textarea>' +
          '<button type="submit" class="mx-send-btn" aria-label="Trimite">' + SEND + '</button></form>' +
          '<p class="mx-window">' + windowLine + '</p>'
        : '<div class="mx-closed">' + icon('info') + '<span>' + (waiting(t) ? 'Șablonul a plecat. Când îți răspunde, îi poți scrie liber.' : (t.messages || []).some((m) => m.direction === 'in') ? 'Au trecut 24 de ore de la ultimul ei mesaj. Îi poți scrie doar cu un șablon aprobat.' : 'Primul mesaj către ea pleacă doar cu un șablon aprobat.') + '</span>' +
          '<button type="button" class="k-btn ' + (waiting(t) ? '' : 'is-primary ') + 'is-sm" data-act="tpl">' + icon('file') + (waiting(t) ? 'Alt șablon' : 'Trimite un șablon') + '</button></div>');
    autoGrow(box.querySelector('textarea'));
  }
  // our template is the last word: we wait for her answer
  function waiting(t) {
    const msgs = t.messages || [];
    const last = msgs[msgs.length - 1];
    return !!(last && last.direction === 'out' && last.type === 'template');
  }
  function headHtml(t) {
    return '<header class="mx-thead"><button type="button" class="k-icon-btn mx-back" data-act="back" aria-label="Înapoi">' + icon('left') + '</button>' +
      face(t, 40) + '<div class="mx-thead-main"><b>' + esc(nameOf(t)) + '</b><small>' +
      esc([named(t) ? pretty(t.phone) : '', t.location || '', t.appointment ? 'programare ' + K.dateShort(t.appointment.date) + (t.appointment.time ? ' ' + t.appointment.time : '') : ''].filter(Boolean).join(' · ')) + '</small></div>' +
      '<a class="k-icon-btn" href="tel:' + esc(String(t.phone || '').replace(/[^\d+]/g, '')) + '" title="Sună" data-act="call">' + icon('phone') + '</a>' +
      (t.lead && K.frontDesk && K.frontDesk() ? '<button type="button" class="k-icon-btn" data-act="lead" title="Deschide leadul">' + icon('users') + '</button>' : '') + '</header>';
  }
  function autoGrow(ta) { if (!ta) return; ta.style.height = 'auto'; ta.style.height = Math.min(ta.scrollHeight + 2, 140) + 'px'; ta.style.overflowY = ta.scrollHeight > 138 ? 'auto' : 'hidden'; }

  function openThread(ph) {
    const box = panel.querySelector('[data-mx-thread]');
    if (box && box.dataset.for !== ph) { delete box.dataset.for; box.innerHTML = ''; }
    C.selectedPhone = ph; C.thread = null;
    // on a phone the conversation is a screen of its own: the phone's back button returns to the list
    if (phone() && !C.pushed) { try { history.pushState({ mx: 1 }, '', location.href); C.pushed = true; } catch (e) { /* no history */ } }
    paintList();
    loadThread(ph, true);
  }
  function closeThread() {
    C.selectedPhone = null; C.thread = null;
    if (panel) { paintList(); paintThread(); }
  }
  // "back" in the conversation: the same step back as the phone's own button
  function goBack() {
    if (C.pushed) { history.back(); return; } // popstate closes it
    closeThread();
  }
  window.addEventListener('popstate', () => {
    if (!C.pushed) return;
    C.pushed = false;
    if (C.selectedPhone) closeThread();
  });
  // her lead in the Pipeline (it opens as soon as the Pipeline has its leads)
  function openLead(id) {
    C.pushed = false; // the Pipeline takes this step in history; back returns to Mesaje
    closeThread();
    K.go('pipeline');
    const until = Date.now() + 5000;
    (function tryOpen() {
      const P = window.C360Pipeline;
      if ((P && P.openLead(id)) || Date.now() > until) return;
      setTimeout(tryOpen, 200);
    })();
  }

  // ------------------------------------------------------------------ templates
  // what we don't know about her yet shows red (it leaves as "-")
  const fill = (text, v) => esc(text).replace(/\{(\w+)\}/g, (m, k) => (v[k] ? '<mark>' + esc(v[k]) + '</mark>' : '<mark class="is-bad" title="Nu știm încă, pleacă „-”">' + esc(k) + '</mark>'));
  function sampleFor(name, city, interest) {
    return { prenume: String(name || '').split(/\s+/)[0] || 'Clienta', nume: name || '', locatie: city || '', interes: interest || '', procedura: interest || '', tratament: interest || '' };
  }
  function pickTemplate(opts) {
    const city = opts.city;
    const list = C.templates.filter((t) => !city || (t.cities || {})[city] === 'APPROVED');
    if (!list.length) {
      return K.ui().toast(C.templates.length ? 'Niciun șablon aprobat pentru numărul ' + city + '.' : 'Niciun șablon aprobat încă' + (isAdmin() ? ' (Integrări → Șabloane WhatsApp).' : '.'), 'info');
    }
    const v = sampleFor(opts.name, city, opts.interest);
    const d = K.drawer({
      title: 'Alege șablonul', icon: 'file', width: 520, subtitle: 'Se completează singur cu datele ei' + (city ? ', de pe numărul ' + esc(city) : '') + '.',
      body: '<div class="mx-tpls">' + list.map((t) => '<button type="button" class="mx-tpl" data-tpl="' + esc(t.id) + '"><b>' + esc(t.label) + '</b>' +
        '<span class="mx-tpl-text">' + (t.header ? '<strong>' + esc(t.header) + '</strong>\n' : '') + fill(t.text, v) + '</span></button>').join('') + '</div>',
      onMount(el) {
        el.addEventListener('click', (e) => {
          const b = e.target.closest('[data-tpl]');
          if (!b || b.disabled) return;
          b.disabled = true;
          K.busy(b, async () => {
            try {
              const r = await K.api('/api/portal-whatsapp', { action: 'send_template', phone: opts.phone, templateId: b.dataset.tpl, name: opts.name || '', location: city || '' });
              d.close();
              K.ui().toast('Trimis pe WhatsApp.', 'success');
              await load();
              openThread(r.phone);
            } catch (err) { b.disabled = false; K.ui().toast(err.data && err.data.message ? err.data.message : K.errText(err), 'error'); }
          });
        });
      },
    });
  }

  // "Mesaj nou": write first to a client (always with an approved template)
  function openNew() {
    const on = connected();
    if (!on.length) return K.ui().toast('WhatsApp nu e conectat încă.', 'info');
    const st = { phone: '', name: '', city: on.includes(K.data && K.data.me && K.data.me.location) ? K.data.me.location : on[0] };
    const d = K.drawer({
      title: 'Mesaj nou', icon: 'pen', width: 480, subtitle: 'Primul mesaj către o clientă pleacă doar cu un șablon aprobat de Meta.',
      body: '<div class="k-form">' +
        K.field('Telefonul clientei', '<input data-n="phone" type="tel" inputmode="tel" placeholder="07xx xxx xxx" autocomplete="off">', 'full') +
        K.field('Numele (opțional)', '<input data-n="name" placeholder="ex. Ioana Pop" autocomplete="off">', 'full') +
        '<div class="k-field full"><span>De pe numărul</span>' + (on.length > 1 ? K.seg('wanew', on.map((c) => [c, c]), st.city, 'mx-newcity') : '') +
        '<small data-num>' + esc(st.city + ' · ' + (C.numbers[st.city].display || '')) + '</small></div>' +
        '</div>',
      footer: '<span class="k-grow"></span><button type="button" class="k-btn" data-k-close2>Renunță</button><button type="button" class="k-btn is-primary" data-go>' + icon('file') + 'Alege șablonul</button>',
      onMount(el) {
        const num = () => { el.querySelector('[data-num]').textContent = st.city + ' · ' + (C.numbers[st.city].display || ''); };
        const setCity = (c) => {
          st.city = c; num();
          el.querySelectorAll('[data-k-seg="wanew"] > button').forEach((b) => b.classList.toggle('is-on', b.dataset.v === c));
          const h = el.querySelector('input[name="wanew"]'); if (h) h.value = c;
        };
        // a number we know: her name and her clinic's number come by themselves
        const known = async () => {
          const key = st.phone.replace(/\D/g, '').slice(-9);
          if (key.length < 9 || !(K.frontDesk && K.frontDesk())) return;
          try {
            const j = await K.leads();
            const lead = (j.leads || []).find((l) => String(l.phone || '').replace(/\D/g, '').slice(-9) === key);
            if (!lead || st.phone.replace(/\D/g, '').slice(-9) !== key) return;
            const nameIn = el.querySelector('[data-n="name"]');
            if (!st.name && lead.name) { nameIn.value = lead.name; st.name = lead.name; }
            st.interest = lead.interest || '';
            if (on.includes(lead.location)) setCity(lead.location);
          } catch (err) { /* only a convenience */ }
        };
        el.addEventListener('input', (e) => { if (e.target.dataset.n) st[e.target.dataset.n] = e.target.value.trim(); if (e.target.dataset.n === 'phone') known(); });
        el.addEventListener('change', (e) => { if (e.target.name === 'wanew') { st.city = e.target.value; num(); } });
        el.querySelector('[data-k-close2]').addEventListener('click', () => d.close());
        el.querySelector('[data-go]').addEventListener('click', () => {
          if (st.phone.replace(/\D/g, '').length < 9) return K.ui().toast('Scrie numărul de telefon.', 'error');
          d.close();
          setTimeout(() => pickTemplate({ phone: st.phone, name: st.name, city: st.city, interest: st.interest || '' }), 230);
        });
      },
    });
  }

  // ------------------------------------------------------------------ events
  function onClick(e) {
    const act = e.target.closest('[data-act]');
    if (act) {
      const a = act.dataset.act;
      if (a === 'refresh') return load();
      if (a === 'new') return openNew();
      if (a === 'connect') { K.go('integrari'); return; }
      if (a === 'back') return goBack();
      // a computer can't dial: the number is copied instead (on a phone the link opens the call)
      if (a === 'call' && !(window.matchMedia && window.matchMedia('(pointer: coarse)').matches)) {
        e.preventDefault();
        const num = pretty(C.thread ? C.thread.phone : C.selectedPhone);
        (navigator.clipboard ? navigator.clipboard.writeText(num.replace(/\s/g, '')) : Promise.reject()).catch(() => {});
        return K.ui().toast('Am copiat numărul ' + num + '. De pe calculator nu se poate suna, sună de pe telefon.', 'info');
      }
      if (a === 'tpl' && C.thread) return pickTemplate({ phone: C.thread.phone, name: named(C.thread) ? C.thread.clientName : '', city: C.thread.location, interest: C.thread.lead ? C.thread.lead.interest : '' });
      if (a === 'lead' && C.thread && C.thread.lead) return openLead(C.thread.lead.id);
    }
    const sh = e.target.closest('[data-show]');
    if (sh) { C.show = sh.dataset.show; return paintList(); }
    const pick = e.target.closest('[data-pick]');
    if (pick) openThread(pick.dataset.pick);
  }
  function onInput(e) {
    if (e.target.matches('[data-q]')) { C.q = e.target.value; paintList(); }
    if (e.target.matches('.mx-compose textarea')) autoGrow(e.target);
  }
  function onKeydown(e) {
    // Enter sends on a computer; on a phone Enter is a new line and the arrow sends
    if (e.key === 'Enter' && !e.shiftKey && !phone() && e.target.closest('.mx-compose textarea')) {
      e.preventDefault();
      const form = e.target.closest('form[data-send]');
      if (form) form.requestSubmit ? form.requestSubmit() : form.dispatchEvent(new Event('submit', { cancelable: true }));
    }
  }
  function onSubmit(e) {
    const form = e.target.closest('form[data-send]');
    if (!form) return;
    e.preventDefault();
    const ta = form.querySelector('textarea[name="text"]');
    const text = (ta.value || '').trim();
    if (!text || !C.selectedPhone) return;
    const btn = form.querySelector('button[type="submit"]');
    K.busy(btn, async () => {
      try {
        const ph = C.selectedPhone;
        await K.api('/api/portal-whatsapp', { action: 'send', phone: ph, text });
        ta.value = ''; autoGrow(ta);
        await loadThread(ph, false);
        scrollToBottom();
        load();
      } catch (err) { K.ui().toast(err.data && err.data.message ? err.data.message : K.errText(err), 'error'); }
    });
  }

  // the open conversation follows the phone's keyboard (its height is what's left above it)
  function fitViewport(e) {
    const vv = window.visualViewport, root = document.documentElement;
    if (!vv) return;
    root.style.setProperty('--mx-vh', vv.height + 'px');
    root.style.setProperty('--mx-top', vv.offsetTop + 'px');
    if (e && e.type === 'resize' && C.selectedPhone && phone()) scrollToBottom();
  }
  if (window.visualViewport) { window.visualViewport.addEventListener('resize', fitViewport); window.visualViewport.addEventListener('scroll', fitViewport); }

  K.section('mesaje', { mount, show() { if (C.loaded) { paintThread(); } load(); } });
  K.on('remote', () => { if (panel && K.isActive('mesaje')) load(); });
  // leaving Mesaje on a phone gives the bottom bar back
  window.addEventListener('hashchange', () => { if (!K.isActive('mesaje')) document.documentElement.classList.remove('mx-thread-open'); });
})();
