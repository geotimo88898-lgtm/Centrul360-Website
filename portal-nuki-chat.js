// Centrul360 portal: Nuki, the team's helper, anywhere in the portal (the owner, 8.11: „ca un chat support pentru mine”).
// A small Nuki in the corner opens a chat: ask how to answer a client, what to offer, a price, an hour. In Mesaje, with a
// conversation open, Nuki sees it too (portal-whatsapp.js C360Nuki.thread). Answers from api/portal-nuki.js (Claude);
// the chat lives in this tab only. Admin and reception.
(function () {
  'use strict';
  var K = function () { return window.K; };
  var esc = function (s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); };
  var POSE = '/brand_asset/mascota/ipostaze/';
  var SEND = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 19V5M5 12l7-7 7 7"/></svg>';
  var S = { msgs: [], busy: false, d: null, btn: null };

  function allowed() { var d = K() && K().data; return !!(d && (d.isAdmin || (d.me && d.me.role === 'receptie'))); }
  function tabName() {
    var h = location.hash.slice(1) || '';
    var b = document.querySelector('#tabsNav [data-tab="' + h + '"]');
    return b ? (b.getAttribute('data-label') || b.textContent || h).trim() : h;
  }
  // her answer as text with line breaks; **bold** kept, nothing else rendered
  function fmt(t) { return esc(t).replace(/\*\*(.+?)\*\*/g, '<b>$1</b>').replace(/\n/g, '<br>'); }

  function bodyHtml() {
    var list = S.msgs.map(function (m, i) {
      return m.role === 'user'
        ? '<div class="nk-m is-me">' + fmt(m.content) + '</div>'
        : '<div class="nk-m is-nuki">' + fmt(m.content) + '<button type="button" class="nk-copy" data-copy="' + i + '" aria-label="Copiază">' + (K().icon ? K().icon('copy') : 'Copiază') + '</button></div>';
    }).join('');
    var th = window.C360Nuki && window.C360Nuki.thread && window.C360Nuki.thread();
    var who = th ? '<p class="nk-ctx">' + (K().icon ? K().icon('chat') : '') + '<span>' + esc(th.name || 'Conversația deschisă') + '</span></p>' : '';
    return '<div class="nk">' + who + '<div class="nk-log" data-log>' + (list || '<div class="nk-hi"><img src="' + POSE + 'salut-pa.webp" alt=""><span>Cu ce te ajut?</span></div>') +
      (S.busy ? '<div class="nk-m is-nuki nk-dots"><i></i><i></i><i></i></div>' : '') + '</div></div>';
  }
  function footHtml() {
    return '<form class="nk-ask" data-ask><textarea rows="1" maxlength="2000" placeholder="Întreabă-l pe Nuki…" data-nkq></textarea>' +
      '<button type="submit" class="nk-send" aria-label="Trimite"' + (S.busy ? ' disabled' : '') + '>' + SEND + '</button></form>';
  }
  function paint() {
    if (!S.d) return;
    var body = S.d.el.querySelector('.k-dbody');
    if (body) body.innerHTML = bodyHtml();
    var log = S.d.el.querySelector('[data-log]');
    if (log) log.scrollTop = log.scrollHeight;
    var send = S.d.el.querySelector('.nk-ask button');
    if (send) send.disabled = S.busy;
  }
  async function ask(q) {
    if (!q || S.busy) return;
    S.msgs.push({ role: 'user', content: q });
    S.busy = true; paint();
    try {
      var th = window.C360Nuki && window.C360Nuki.thread && window.C360Nuki.thread();
      var r = await K().api('/api/portal-nuki', { action: 'chat', messages: S.msgs.slice(-16), thread: th || undefined, tab: tabName() });
      S.msgs.push({ role: 'assistant', content: r.text || 'Nu am un răspuns acum.' });
    } catch (err) {
      S.msgs.push({ role: 'assistant', content: (err.data && err.data.message) || 'Nu am putut răspunde acum. Încearcă din nou.' });
    }
    S.busy = false; paint();
  }
  function open() {
    if (!allowed()) return;
    S.d = K().drawer({
      title: 'Nuki', width: 460,
      lead: '<span class="nk-av"><img src="' + POSE + 'gandeste.webp" alt=""></span>',
      body: bodyHtml(), footer: footHtml(),
      onMount: function (el) {
        var ta = el.querySelector('[data-nkq]');
        var grow = function () { ta.style.height = 'auto'; ta.style.height = Math.min(140, ta.scrollHeight) + 'px'; };
        ta.addEventListener('input', grow);
        ta.addEventListener('keydown', function (e) { if (e.key === 'Enter' && !e.shiftKey && !(window.matchMedia && matchMedia('(pointer: coarse)').matches)) { e.preventDefault(); el.querySelector('[data-ask]').requestSubmit(); } });
        el.querySelector('[data-ask]').addEventListener('submit', function (e) { e.preventDefault(); var q = ta.value.trim(); if (!q) return; ta.value = ''; grow(); ask(q); });
        el.addEventListener('click', function (e) {
          var c = e.target.closest('[data-copy]');
          if (!c) return;
          var m = S.msgs[Number(c.dataset.copy)];
          if (m && navigator.clipboard) navigator.clipboard.writeText(m.content).then(function () { K().ui().toast('Copiat.', 'success'); }).catch(function () {});
        });
        setTimeout(function () { ta.focus(); }, 60);
        var log = el.querySelector('[data-log]'); if (log) log.scrollTop = log.scrollHeight;
      },
      onClose: function () { S.d = null; },
    });
  }

  function mount() {
    if (S.btn || !allowed()) return;
    S.btn = document.createElement('button');
    S.btn.type = 'button';
    S.btn.className = 'nk-fab';
    S.btn.setAttribute('aria-label', 'Nuki, asistentul tău');
    S.btn.title = 'Nuki';
    S.btn.innerHTML = '<img src="' + POSE + 'gandeste.webp" alt="">';
    S.btn.addEventListener('click', open);
    document.body.appendChild(S.btn);
  }
  function wait() { if (K() && K().data && K().drawer) mount(); else setTimeout(wait, 400); }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', wait); else wait();
})();
