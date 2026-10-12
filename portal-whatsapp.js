// Centrul360 portal, "Mesaje": a WhatsApp inbox inside the portal (reception/admin see and
// reply to client messages without needing the WhatsApp Business app on a phone). Visible to
// everyone, same K.section/K.api/K.drawer conventions as portal-condica.js.
(function () {
  'use strict';
  const K = window.K;
  const { esc, icon } = K;

  const C = { conversations: [], loc: 'all', selectedPhone: null, thread: null, loadingThread: false };
  let panel;

  const STYLE_ID = 'wa-style';
  function injectStyle() {
    if (document.getElementById(STYLE_ID)) return;
    const s = document.createElement('style');
    s.id = STYLE_ID;
    s.textContent =
      '.wa-wrap{ display:flex; gap:1rem; align-items:flex-start; }' +
      '.wa-list-col{ flex:0 0 320px; max-width:320px; }' +
      '.wa-thread-col{ flex:1; min-width:0; }' +
      '@media (max-width:900px){ .wa-wrap{ flex-direction:column; } .wa-list-col{ flex:none; max-width:none; width:100%; } }' +
      '.wa-conv{ display:flex; align-items:flex-start; gap:.6rem; width:100%; text-align:left; padding:.7rem .6rem; border-radius:12px; cursor:pointer; border:none; background:none; font-family:inherit; }' +
      '.wa-conv:hover{ background:var(--panel-2, rgba(127,127,127,.08)); }' +
      '.wa-conv.is-on{ background:var(--accent-dim, rgba(106,77,255,.14)); }' +
      '.wa-conv-main{ flex:1; min-width:0; }' +
      '.wa-conv-top{ display:flex; justify-content:space-between; gap:.4rem; align-items:baseline; }' +
      '.wa-conv-name{ font-weight:600; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }' +
      '.wa-conv-time{ font-size:.72rem; color:var(--muted); flex:none; }' +
      '.wa-conv-preview{ font-size:.82rem; color:var(--muted); white-space:nowrap; overflow:hidden; text-overflow:ellipsis; margin-top:.15rem; }' +
      '.wa-conv-badge{ flex:none; min-width:20px; height:20px; border-radius:999px; background:var(--accent,#6a4dff); color:var(--accent-fg,#fff); font-size:.72rem; font-weight:700; display:flex; align-items:center; justify-content:center; padding:0 .35rem; }' +
      '.wa-thread{ display:flex; flex-direction:column; height:min(70vh,640px); }' +
      '.wa-thread-head{ display:flex; align-items:center; gap:.6rem; padding-bottom:.6rem; border-bottom:1px solid var(--border, rgba(127,127,127,.18)); }' +
      '.wa-thread-body{ flex:1; overflow-y:auto; padding:.8rem .2rem; display:flex; flex-direction:column; gap:.4rem; }' +
      '.wa-bubble-row{ display:flex; }' +
      '.wa-bubble-row.is-out{ justify-content:flex-end; }' +
      '.wa-bubble{ max-width:70%; padding:.55rem .75rem; border-radius:14px; font-size:.86rem; line-height:1.4; white-space:pre-wrap; word-break:break-word; }' +
      '.wa-bubble-row.is-in .wa-bubble{ background:var(--panel-2, rgba(127,127,127,.12)); border-radius:14px 14px 14px 4px; }' +
      '.wa-bubble-row.is-out .wa-bubble{ background:var(--accent,#6a4dff); color:var(--accent-fg,#fff); border-radius:14px 14px 4px 14px; }' +
      '.wa-bubble-meta{ display:block; font-size:.68rem; opacity:.7; margin-top:.25rem; text-align:right; }' +
      '.wa-send{ display:flex; gap:.5rem; padding-top:.6rem; border-top:1px solid var(--border, rgba(127,127,127,.18)); }' +
      '.wa-send textarea{ flex:1; resize:none; min-height:42px; max-height:120px; }' +
      '.wa-blocked{ padding-top:.6rem; border-top:1px solid var(--border, rgba(127,127,127,.18)); color:var(--muted); font-size:.84rem; }';
    document.head.appendChild(s);
  }

  function mount(p) {
    panel = p;
    injectStyle();
    panel.classList.add('k-panel', 'wa');
    panel.innerHTML =
      '<div class="k-head"><div><div class="k-eyebrow">Echipă</div><h2>Mesaje</h2><p class="k-lede">WhatsApp, conversațiile cu clienții, direct din portal.</p></div></div>' +
      '<div data-body><div class="k-skel" style="height:220px"></div></div>';
    panel.addEventListener('click', onClick);
    panel.addEventListener('submit', onSubmit);
    panel.addEventListener('keydown', onKeydown);
    panel.addEventListener('change', onChange);
  }

  async function load() {
    try {
      const j = await K.api('/api/portal-whatsapp', { action: 'list' });
      C.conversations = j.conversations || [];
      if (C.selectedPhone && !C.conversations.find((c) => c.phone === C.selectedPhone)) C.selectedPhone = null;
      render();
      if (C.selectedPhone) loadThread(C.selectedPhone, false);
    } catch (e) {
      panel.querySelector('[data-body]').innerHTML = K.empty('alert', 'Nu am putut încărca mesajele', 'Verifică conexiunea și reîncearcă.', '<button type="button" class="k-btn is-primary" data-act="refresh">Reîncearcă</button>');
    }
  }

  async function loadThread(phone, showSkeleton) {
    if (showSkeleton) { C.loadingThread = true; render(); }
    try {
      const j = await K.api('/api/portal-whatsapp', { action: 'thread', phone });
      C.thread = j;
      // That conversation is read now, clear its badge locally without waiting for a reload.
      const convo = C.conversations.find((c) => c.phone === phone);
      if (convo) convo.unreadCount = 0;
    } catch (e) {
      K.ui().toast(K.errText(e), 'error');
    } finally {
      C.loadingThread = false;
      render();
      scrollThreadToBottom();
    }
  }

  function scrollThreadToBottom() {
    const body = panel && panel.querySelector('.wa-thread-body');
    if (body) body.scrollTop = body.scrollHeight;
  }

  function fmtTime(iso) {
    if (!iso) return '';
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return '';
    const today = new Date();
    const sameDay = d.toDateString() === today.toDateString();
    return sameDay ? K.pad(d.getHours()) + ':' + K.pad(d.getMinutes()) : K.dateShort(K.iso(d));
  }

  const TICK = { sent: '✓', delivered: '✓✓', read: '✓✓', failed: '⚠', received: '' };

  function locSeg() {
    return K.seg('waloc', [['all', 'Toate'], ['Timișoara', 'Timișoara'], ['Arad', 'Arad']], C.loc);
  }

  function filteredConversations() {
    if (C.loc === 'all') return C.conversations;
    return C.conversations.filter((c) => c.location === C.loc);
  }

  function convRow(c) {
    const preview = (c.lastDirection === 'out' ? 'Tu: ' : '') + (c.lastText || '');
    return '<button type="button" class="wa-conv' + (c.phone === C.selectedPhone ? ' is-on' : '') + '" data-pick="' + esc(c.phone) + '">' +
      K.avatar(c.clientName, 40) +
      '<div class="wa-conv-main"><div class="wa-conv-top"><span class="wa-conv-name">' + esc(c.clientName) + '</span><span class="wa-conv-time">' + esc(fmtTime(c.lastMessageAt)) + '</span></div>' +
      '<div class="wa-conv-preview">' + esc(preview) + (c.location ? ' · ' + esc(c.location) : '') + '</div></div>' +
      (c.unreadCount ? '<span class="wa-conv-badge">' + (c.unreadCount > 99 ? '99+' : c.unreadCount) + '</span>' : '') +
      '</button>';
  }

  function listPane() {
    const list = filteredConversations();
    return '<section class="k-card wa-list-col"><div class="k-card-head"><h3>' + icon('chat') + 'Conversații</h3></div>' +
      '<div style="margin-bottom:.6rem">' + locSeg() + '</div>' +
      (list.length ? list.map(convRow).join('') : K.empty('chat', 'Niciun mesaj încă', 'Mesajele clienților pe WhatsApp apar aici.')) +
      '</section>';
  }

  function bubble(m) {
    const tick = m.direction === 'out' ? (TICK[m.status] || '') : '';
    return '<div class="wa-bubble-row is-' + (m.direction === 'out' ? 'out' : 'in') + '"><div class="wa-bubble">' + esc(m.text) +
      '<span class="wa-bubble-meta">' + esc(fmtTime(m.timestamp)) + (tick ? ' ' + tick : '') + '</span></div></div>';
  }

  function threadPane() {
    if (!C.selectedPhone) {
      return '<section class="k-card wa-thread-col">' + K.empty('chat', 'Alege o conversație', 'Selectează un client din listă ca să vezi istoricul mesajelor.') + '</section>';
    }
    if (C.loadingThread || !C.thread) {
      return '<section class="k-card wa-thread-col"><div class="k-skel" style="height:300px"></div></section>';
    }
    const t = C.thread;
    const msgs = (t.messages || []).map(bubble).join('');
    return '<section class="k-card wa-thread-col"><div class="wa-thread">' +
      '<div class="wa-thread-head">' + K.avatar(t.clientName, 40) + '<div><b>' + esc(t.clientName) + '</b><div class="k-muted" style="font-size:.78rem">' + esc(t.phone) + (t.location ? ' · ' + esc(t.location) : '') + '</div></div></div>' +
      '<div class="wa-thread-body">' + (msgs || K.empty('chat', 'Nimic încă', '')) + '</div>' +
      (t.within24h
        ? '<form class="wa-send" data-send><textarea name="text" maxlength="4000" placeholder="Scrie un mesaj..." rows="1"></textarea><button type="submit" class="k-btn is-primary">' + icon('arrowUp') + 'Trimite</button></form>'
        : '<div class="wa-blocked">' + icon('alert') + ' Fereastra de 24h a expirat, clientul trebuie să scrie el primul din nou, sau trimite un șablon aprobat.</div>') +
      '</div></section>';
  }

  function render() {
    if (!panel) return;
    panel.querySelector('[data-body]').innerHTML = '<div class="wa-wrap">' + listPane() + threadPane() + '</div>';
  }

  function onClick(e) {
    if (e.target.closest('[data-act="refresh"]')) return load();
    const pick = e.target.closest('[data-pick]');
    if (pick) { C.selectedPhone = pick.dataset.pick; C.thread = null; render(); loadThread(C.selectedPhone, true); }
  }

  function onKeydown(e) {
    if (e.key === 'Enter' && !e.shiftKey && e.target.closest('.wa-send textarea')) {
      e.preventDefault();
      const form = e.target.closest('form[data-send]');
      if (form) form.requestSubmit ? form.requestSubmit() : form.dispatchEvent(new Event('submit', { cancelable: true }));
    }
  }

  function onSubmit(e) {
    const form = e.target.closest('form[data-send]');
    if (!form) return;
    e.preventDefault();
    const textarea = form.querySelector('textarea[name="text"]');
    const text = (textarea.value || '').trim();
    if (!text || !C.selectedPhone) return;
    const btn = form.querySelector('button[type="submit"]');
    K.busy(btn, async () => {
      try {
        const phone = C.selectedPhone;
        await K.api('/api/portal-whatsapp', { action: 'send', phone, text });
        textarea.value = '';
        await loadThread(phone, false);
        load();
      } catch (err) { K.ui().toast(K.errText(err), 'error'); }
    });
  }

  function onChange(e) {
    const seg = e.target.closest('[data-k-seg="waloc"] input[type=hidden]');
    if (!seg) return;
    C.loc = seg.value;
    render();
  }

  K.section('mesaje', { mount, show: load });
  K.on('remote', () => { if (panel && K.isActive('mesaje')) load(); });
})();
