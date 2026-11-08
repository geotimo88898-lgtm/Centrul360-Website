// Centrul360 portal: Nuki, the team's helper, anywhere in the portal (the owner, 8.11: „ca un chat support pentru mine”).
// A small Nuki in the corner opens a chat: ask how to answer a client, what to offer, a price, an hour. In Mesaje, with a
// conversation open, Nuki sees it too (portal-whatsapp.js C360Nuki.thread). Answers from api/portal-nuki.js (Claude);
// the chat lives in this tab only. Admin and reception. Photos, screenshots (pasted too), PDFs and text files go with a
// question (the owner, 8.11: „să-i pot trimite și poze, fișiere”): photos smaller first, everything as data to Claude.
// For the owner, Nuki also edits what he tells it in Traininguri (8.11: „să editeze ce îi zic”): it shows the change as
// a card (as it is now, as it would be) and it is saved only when he taps „Aplică” (api/_lib/nuki-edit.js).
(function () {
  'use strict';
  var K = function () { return window.K; };
  var esc = function (s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); };
  var POSE = '/brand_asset/mascota/ipostaze/';
  var SEND = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 19V5M5 12l7-7 7 7"/></svg>';
  var S = { msgs: [], busy: false, d: null, btn: null, files: [] };
  var MAX_FILES = 6;
  var IMG = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
  var TEXT = /\.(txt|csv|tsv|md|json|html?)$/i;
  function toast(m) { K().ui().toast(m, 'error'); }

  function allowed() { var d = K() && K().data; return !!(d && (d.isAdmin || (d.me && d.me.role === 'receptie'))); }
  // the section on screen (the panel shown, not the address: it told „Acte și autorizații” on Traininguri, 8.11)
  function tabName() {
    var p = document.querySelector('main > .panel.active');
    var t = p && p.id ? p.id.replace(/^panel-/, '') : (location.hash.slice(1) || '').split('/')[0];
    var b = document.querySelector('#tabsNav button[data-tab="' + t + '"].active') || document.querySelector('#tabsNav button[data-tab="' + t + '"]:not(.hidden)') || document.querySelector('#tabsNav button[data-tab="' + t + '"]');
    return b ? (b.getAttribute('data-label') || b.textContent || t).trim() : t;
  }
  // the answer as text with line breaks: **bold**, a heading line as bold, links (sources of a search) clickable
  function fmt(t) {
    return esc(t)
      .replace(/^#{1,6}\s*(.+)$/gm, '<b>$1</b>')
      .replace(/\*\*(.+?)\*\*/g, '<b>$1</b>')
      .replace(/\[([^\]\n]+)\]\((https?:\/\/[^\s)]+)\)/g, '<a href="$2" target="_blank" rel="noopener">$1</a>')
      .replace(/(^|[\s(])(https?:\/\/[^\s<)]*[^\s<).,;:!?])/g, '$1<a href="$2" target="_blank" rel="noopener">$2</a>')
      .replace(/\n/g, '<br>');
  }

  function fileHtml(f, i, mine) {
    var x = mine ? '' : '<button type="button" class="nk-unfile" data-unfile="' + i + '" aria-label="Scoate">' + K().icon('x') + '</button>';
    return f.kind === 'image'
      ? '<span class="nk-file is-img"><img src="' + f.url + '" alt="">' + x + '</span>'
      : '<span class="nk-file is-doc">' + K().icon('file') + '<em>' + esc(f.name) + '</em>' + x + '</span>';
  }
  // a change Nuki proposes, each field as it would be: a list whole and in its new order (the new lines marked, long
  // unchanged stretches folded), then what goes out, struck; a text as it is now, struck, and as it would be
  function fieldHtml(f) {
    if (f.type === 'lines') {
      var before = (f.before || []).slice(), after = f.after || [], left = before.slice(), rows = [], run = [];
      var flush = function () {
        if (run.length >= 4) rows.push('<li class="is-fold">' + run.length + ' rânduri la fel</li>');
        else run.forEach(function (x) { rows.push('<li>' + esc(x) + '</li>'); });
        run = [];
      };
      after.forEach(function (x, k) {
        var at = left.indexOf(x);
        if (at >= 0) left.splice(at, 1);
        var near = after.slice(Math.max(0, k - 1), k + 2).some(function (y) { return before.indexOf(y) < 0; });
        if (at >= 0 && !near && after.length > 12) { run.push(x); return; }
        flush();
        rows.push('<li' + (at < 0 ? ' class="is-in"' : '') + '>' + esc(x) + '</li>');
      });
      flush();
      var out = left.length ? '<p class="nk-out-h">Se scoate</p><ul class="nk-diff">' + left.map(function (x) { return '<li class="is-out">' + esc(x) + '</li>'; }).join('') + '</ul>' : '';
      return '<section><h5>' + esc(f.label) + '</h5><ul class="nk-diff' + (f.key === 'steps' && after.length <= 40 ? ' is-num' : '') + '">' + rows.join('') + '</ul>' + out + '</section>';
    }
    return '<section><h5>' + esc(f.label) + '</h5><ul class="nk-diff">' + (f.before !== '' && f.before != null ? '<li class="is-out">' + esc(f.before) + '</li>' : '') + '<li class="is-in">' + esc(f.after) + '</li></ul></section>';
  }
  function editHtml(e, i, j) {
    var foot = e.state === 'done' ? '<p class="nk-edit-st is-done">' + K().icon('check') + 'Aplicat</p>'
      : e.state === 'no' ? '<p class="nk-edit-st">Nu s-a schimbat nimic</p>'
      : '<footer><button type="button" class="k-btn is-ghost is-sm" data-edit-no="' + i + ':' + j + '"' + (e.busy ? ' disabled' : '') + '>Renunță</button>' +
        '<button type="button" class="k-btn is-primary is-sm" data-edit-ok="' + i + ':' + j + '"' + (e.busy ? ' disabled' : '') + '>' + K().icon('check') + 'Aplică</button></footer>';
    return '<div class="nk-edit' + (e.state ? ' is-' + e.state : '') + '"><header>' + K().icon('pen') + '<div><small>' + esc(e.what) + '</small><b>' + esc(e.name) + '</b></div></header>' +
      e.fields.map(fieldHtml).join('') + foot + '</div>';
  }
  function bodyHtml() {
    var list = S.msgs.map(function (m, i) {
      return m.role === 'user'
        ? '<div class="nk-m is-me' + (m.files && m.files.length ? ' has-files' : '') + '">' + (m.files && m.files.length ? '<div class="nk-mfiles">' + m.files.map(function (f, j) { return fileHtml(f, j, true); }).join('') + '</div>' : '') + fmt(m.content) + '</div>'
        : '<div class="nk-m is-nuki">' + fmt(m.content) + '<button type="button" class="nk-copy" data-copy="' + i + '" aria-label="Copiază">' + (K().icon ? K().icon('copy') : 'Copiază') + '</button></div>' +
          (m.edits || []).map(function (e, j) { return editHtml(e, i, j); }).join('');
    }).join('');
    var th = window.C360Nuki && window.C360Nuki.thread && window.C360Nuki.thread();
    var who = th ? '<p class="nk-ctx">' + (K().icon ? K().icon('chat') : '') + '<span>' + esc(th.name || 'Conversația deschisă') + '</span></p>' : '';
    return '<div class="nk">' + who + '<div class="nk-log" data-log>' + (list || '<div class="nk-hi"><img src="' + POSE + 'salut-pa.webp" alt=""><span>Cu ce te ajut?</span></div>') +
      (S.busy ? '<div class="nk-m is-nuki nk-dots"><i></i><i></i><i></i></div>' : '') + '</div></div>';
  }
  function footHtml() {
    return '<form class="nk-ask" data-ask><div class="nk-tools">' +
      '<label class="k-icon-btn" title="Poză sau captură">' + K().icon('image') + '<input type="file" data-nkfile hidden multiple accept="image/*"></label>' +
      '<label class="k-icon-btn" title="PDF sau fișier text">' + K().icon('file') + '<input type="file" data-nkfile hidden multiple accept="application/pdf,.pdf,.txt,.csv,.tsv,.md,.json,text/*"></label></div>' +
      '<div class="nk-files" data-nkfiles></div>' +
      '<textarea rows="1" maxlength="2000" placeholder="Întreabă-mă orice…" data-nkq></textarea>' +
      '<button type="submit" class="nk-send" aria-label="Trimite"' + (S.busy ? ' disabled' : '') + '>' + SEND + '</button></form>';
  }
  function paintFiles() {
    var box = S.d && S.d.el.querySelector('[data-nkfiles]');
    if (box) box.innerHTML = S.files.map(function (f, i) { return fileHtml(f, i, false); }).join('');
  }
  // photos and files: a photo goes smaller first (Claude reads about 1600 px), as JPEG; a small one stays as it is
  function readAs(file, how) { return new Promise(function (res, rej) { var fr = new FileReader(); fr.onload = function () { res(fr.result); }; fr.onerror = function () { rej(new Error('read')); }; fr[how](file); }); }
  function shrink(file) {
    return new Promise(function (resolve, reject) {
      var img = new Image();
      img.onload = function () {
        var w = img.naturalWidth, h = img.naturalHeight, k = Math.min(1, 1600 / Math.max(w, h));
        URL.revokeObjectURL(img.src);
        if (k === 1 && file.size <= 1.5e6 && IMG.indexOf(file.type) >= 0) { readAs(file, 'readAsDataURL').then(resolve, reject); return; }
        var cv = document.createElement('canvas');
        cv.width = Math.round(w * k); cv.height = Math.round(h * k);
        var cx = cv.getContext('2d'); cx.fillStyle = '#fff'; cx.fillRect(0, 0, cv.width, cv.height); cx.drawImage(img, 0, 0, cv.width, cv.height);
        resolve(cv.toDataURL('image/jpeg', 0.86));
      };
      img.onerror = function () { URL.revokeObjectURL(img.src); reject(new Error('img')); };
      img.src = URL.createObjectURL(file);
    });
  }
  async function addFiles(list) {
    for (var i = 0; i < list.length; i++) {
      var file = list[i], name = file.name || 'captură';
      if (S.files.length >= MAX_FILES) { toast('Cel mult ' + MAX_FILES + ' odată.'); break; }
      try {
        if (/^image\//.test(file.type)) {
          var url = await shrink(file);
          S.files.push({ kind: 'image', name: name, type: url.slice(5, url.indexOf(';')), data: url.slice(url.indexOf(',') + 1), url: url });
        } else if (file.type === 'application/pdf' || /\.pdf$/i.test(name)) {
          if (file.size > 20e6) { toast('PDF-ul e prea mare (cel mult 20 MB).'); continue; }
          var pdf = await readAs(file, 'readAsDataURL');
          S.files.push({ kind: 'pdf', name: name, type: 'application/pdf', data: pdf.slice(pdf.indexOf(',') + 1) });
        } else if (/^text\//.test(file.type) || file.type === 'application/json' || TEXT.test(name)) {
          if (file.size > 2e6) { toast(name + ' e prea mare (cel mult 2 MB).'); continue; }
          S.files.push({ kind: 'text', name: name, type: 'text/plain', text: String(await readAs(file, 'readAsText')).slice(0, 200000) });
        } else toast('Nuki citește poze, PDF și fișiere text. Salvează documentul ca PDF.');
      } catch (e) { toast('Nu pot citi ' + name + '.'); }
    }
    paintFiles();
  }
  // what goes to Nuki: the last turns, and the files from the newest back, as long as they fit (older ones by name)
  function payload() {
    var list = S.msgs.slice(-16), left = 18e6, n = 0;
    var out = list.map(function (m) {
      var said = m.content;
      if (m.edits && m.edits.length) said += '\n\n(Propunerile mele: ' + m.edits.map(function (e) {
        return e.what + ' „' + e.name + '” (' + e.fields.map(function (f) { return f.label; }).join(', ') + '): ' + (e.state === 'done' ? 'aplicată de el' : e.state === 'no' ? 'refuzată de el' : 'încă neaplicată');
      }).join('; ') + '.)';
      return { role: m.role, content: said };
    });
    for (var i = list.length - 1; i >= 0; i--) {
      if (!list[i].files || !list[i].files.length) continue;
      out[i].files = list[i].files.map(function (f) {
        var size = (f.data || f.text || '').length;
        if (n < 12 && size <= left) { left -= size; n++; return { kind: f.kind, name: f.name, type: f.type, data: f.data, text: f.text }; }
        return { kind: f.kind, name: f.name, gone: true };
      });
    }
    return out;
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
    if ((!q && !S.files.length) || S.busy) return;
    S.msgs.push({ role: 'user', content: q, files: S.files });
    S.files = []; paintFiles();
    S.busy = true; paint();
    try {
      var th = window.C360Nuki && window.C360Nuki.thread && window.C360Nuki.thread();
      var r = await K().api('/api/portal-nuki', { action: 'chat', messages: payload(), thread: th || undefined, tab: tabName() });
      S.msgs.push({ role: 'assistant', content: r.text || (r.edits && r.edits.length ? 'Uite ce aș schimba.' : 'Nu am un răspuns acum.'), edits: r.edits || [] });
    } catch (err) {
      S.msgs.push({ role: 'assistant', content: (err.data && err.data.message) || 'Nu am putut răspunde acum. Încearcă din nou.' });
    }
    S.busy = false; paint();
  }
  // „Aplică”: saved now (only if nobody changed those fields since); „Renunță”: nothing is saved
  async function decide(i, j, yes) {
    var m = S.msgs[i], e = m && m.edits && m.edits[j];
    if (!e || e.state || e.busy) return;
    if (!yes) { e.state = 'no'; paint(); return; }
    e.busy = true; paint();
    try {
      await K().api('/api/portal-nuki', { action: 'apply', ref: e.ref, changes: e.changes, base: e.base, name: e.name });
      e.state = 'done';
      K().ui().toast('Salvat în Traininguri.', 'success');
      if (K().reload) K().reload();
    } catch (err) {
      K().ui().toast((err.data && err.data.message) || (K().errText ? K().errText(err) : 'Nu am putut salva.'), 'error');
    }
    e.busy = false; paint();
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
        el.querySelector('[data-ask]').addEventListener('submit', function (e) { e.preventDefault(); var q = ta.value.trim(); if (!q && !S.files.length) return; ta.value = ''; grow(); ask(q); });
        // a screenshot pasted into the box, a file dropped on the chat, or picked with the two buttons
        ta.addEventListener('paste', function (e) { var f = e.clipboardData && e.clipboardData.files; if (f && f.length) { e.preventDefault(); addFiles(f); } });
        el.addEventListener('change', function (e) { if (e.target.matches('[data-nkfile]')) { addFiles(e.target.files); e.target.value = ''; } });
        el.addEventListener('dragover', function (e) { if (e.dataTransfer && Array.prototype.indexOf.call(e.dataTransfer.types || [], 'Files') >= 0) { e.preventDefault(); el.classList.add('nk-drop'); } });
        el.addEventListener('dragleave', function (e) { if (!el.contains(e.relatedTarget)) el.classList.remove('nk-drop'); });
        el.addEventListener('drop', function (e) { el.classList.remove('nk-drop'); if (e.dataTransfer && e.dataTransfer.files.length) { e.preventDefault(); addFiles(e.dataTransfer.files); } });
        paintFiles();
        el.addEventListener('click', function (e) {
          var u = e.target.closest('[data-unfile]');
          if (u) { S.files.splice(Number(u.dataset.unfile), 1); paintFiles(); return; }
          var ok = e.target.closest('[data-edit-ok]'), no = e.target.closest('[data-edit-no]');
          if (ok || no) { var at = (ok || no).getAttribute(ok ? 'data-edit-ok' : 'data-edit-no').split(':'); decide(Number(at[0]), Number(at[1]), !!ok); return; }
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
