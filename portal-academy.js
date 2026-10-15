// Centrul360 portal, "Traininguri": everything the team learns from, by role.
//   Drumul meu      the first week of a new hire, day by day: read, test, practical tasks (the owner confirms them)
//   Vânzări         recepție: the call script and what happens after the call · cosmeticiană: the consultation and
//                   selling, the offer calculator (Ghidul consultației), practice cases
//   Tratamente      recepție: each treatment in short (what it does, benefits, combinations, how to say it on the phone)
//                   cosmeticiană: the full treatment sheets, the combinations, the treatment room
//   De printat      the client sheets, the same for everyone
//   Progres echipă  (owner) who read what, test scores, cases, first-week paths, tasks to confirm
// Every chapter: read, "Am citit", a short test, photos and videos, a branded PDF. The owner sees both roles.
// Content: api/_lib/academy.js (+ academy-extra.js); edits saved through /api/portal-config (academy);
// progress through /api/portal-academy (data/academy-progress.json).
(function () {
  'use strict';
  const K = window.K;
  const { esc, icon } = K;

  const A = { tab: '', manual: '', schemeGroup: 'all', caseGroup: 'all', openDay: null, role: 'cosmetician', pick: {}, fisa: { page: 0, ink: true, on: -1 } };
  let panel;

  // ------------------------------------------------------------------ body → html
  // "## " sub-heading · "- " bullet · "1. " step · "> " what to say · "! " rule · else paragraph
  function bodyHtml(lines) {
    let out = '', list = '';
    const close = () => { if (list) { out += '</' + list + '>'; list = ''; } };
    const open = (tag) => { if (list !== tag) { close(); out += '<' + tag + '>'; list = tag; } };
    (lines || []).forEach((raw) => {
      const l = String(raw);
      let m;
      if (l.indexOf('## ') === 0) { close(); out += '<h5>' + esc(l.slice(3)) + '</h5>'; }
      else if (l.indexOf('- ') === 0) { open('ul'); out += '<li>' + esc(l.slice(2)) + '</li>'; }
      else if ((m = /^(\d+)\.\s+(.*)$/.exec(l))) { open('ol'); out += '<li>' + esc(m[2]) + '</li>'; }
      else if (l.indexOf('> ') === 0) { close(); out += '<blockquote class="ac-say">' + esc(l.slice(2)) + '</blockquote>'; }
      else if (l.indexOf('! ') === 0) { close(); out += '<p class="ac-rule">' + esc(l.slice(2)) + '</p>'; }
      else { close(); out += '<p>' + esc(l) + '</p>'; }
    });
    close();
    return out;
  }

  // ------------------------------------------------------------------ data
  const D = () => (K.data && K.data.academy) || { manuals: [], schemes: [], combos: [], cases: [], prices: [], rules: {}, paths: {} };
  const isAdmin = () => !!(K.data && K.data.isAdmin);
  const meId = () => (K.data && K.data.me && K.data.me.id) || '';
  const blank = () => ({ read: {}, quiz: {}, cases: {}, tasks: {}, path: null });
  const progOf = (id) => Object.assign(blank(), ((K.data && K.data.academyProgress) || {})[id] || {});
  const mine = () => progOf(meId());
  const setMine = (p) => { if (!K.data.academyProgress) K.data.academyProgress = {}; K.data.academyProgress[meId()] = p; };
  const manuals = () => D().manuals || [];
  const current = () => manuals().find((m) => m.id === A.manual) || manuals()[0];
  const cref = (m, c) => 'm:' + m.id + '/' + c.id;
  const sref = (s) => 's:' + s.id;
  const priceOf = (id) => (D().prices || []).find((p) => p.id === id);
  const schemeOf = (id) => (D().schemes || []).find((s) => s.id === id);
  const caseOf = (id) => (D().cases || []).find((c) => c.id === id);
  const rules = () => Object.assign({ bodyMin: 9500, faceMin: 4000, full: 50, inst: 30, parts: 4 }, D().rules || {});
  const GROUP = { fata: 'Față', corp: 'Corp', epilare: 'Epilare laser' };
  const CITY = { both: 'Ambele orașe', tm: 'Doar Timișoara', ar: 'Doar Arad' };
  const ROLE = { receptie: 'Recepție', cosmetician: 'Cosmeticiană', admin: 'Admin' };
  const num = (i) => String(i + 1).padStart(2, '0');
  const lei = (n) => K.lei(n, 2);
  const dec = (n) => (Math.round(Number(n || 0) * 100) / 100).toLocaleString('ro-RO', { maximumFractionDigits: 2 });
  const fileUrl = (p) => '/api/portal-file?p=' + encodeURIComponent(p);
  // a reference used in a path step ("m:vanzari/v-pret", "s:ems", "caz-gusa") → what it is
  function findRef(ref) {
    let x;
    if ((x = /^m:([a-z0-9-]+)\/([a-z0-9-]+)$/.exec(ref || ''))) { const m = manuals().find((y) => y.id === x[1]); const c = m && m.chapters.find((y) => y.id === x[2]); return c ? { kind: 'chapter', m, c, i: m.chapters.indexOf(c), title: c.title } : null; }
    if ((x = /^s:([a-z0-9-]+)$/.exec(ref || ''))) { const s = schemeOf(x[1]); return s ? { kind: 'scheme', s, title: s.name } : null; }
    const c = caseOf(ref);
    return c ? { kind: 'case', c, title: c.title } : null;
  }
  const save = (academy) => K.api('/api/portal-config', { academy });
  const post = (body) => K.api('/api/portal-academy', body);

  // ------------------------------------------------------------------ media (photos + videos)
  function mediaHtml(list) {
    const l = list || [];
    if (!l.length) return '';
    return '<div class="tr-media">' + l.map((x) => '<figure>' + (x.kind === 'video'
      ? '<video controls playsinline preload="metadata" src="' + esc(fileUrl(x.path)) + '"></video>'
      : '<a href="' + esc(fileUrl(x.path)) + '" target="_blank" rel="noopener"><img loading="lazy" src="' + esc(fileUrl(x.path)) + '" alt=""></a>') +
      (x.caption ? '<figcaption>' + esc(x.caption) + '</figcaption>' : '') + '</figure>').join('') + '</div>';
  }
  function shrink(file) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => {
        const k = Math.min(1, 1600 / Math.max(img.naturalWidth, img.naturalHeight));
        const cv = document.createElement('canvas');
        cv.width = Math.round(img.naturalWidth * k); cv.height = Math.round(img.naturalHeight * k);
        cv.getContext('2d').drawImage(img, 0, 0, cv.width, cv.height);
        URL.revokeObjectURL(img.src);
        resolve(cv.toDataURL('image/jpeg', 0.86));
      };
      img.onerror = () => reject(new Error('Nu pot citi poza.'));
      img.src = URL.createObjectURL(file);
    });
  }
  let blobLib = null;
  function uploader() {
    if (window.C360BlobUpload) return Promise.resolve(window.C360BlobUpload);
    if (!blobLib) blobLib = new Promise((ok, fail) => {
      const s = document.createElement('script');
      s.src = '/vendor/blob-upload.js';
      s.onload = () => ok(window.C360BlobUpload); s.onerror = () => { blobLib = null; fail(new Error('lib')); };
      document.head.appendChild(s);
    });
    return blobLib;
  }
  const VIDEO_EXT = { 'video/mp4': 'mp4', 'video/quicktime': 'mov', 'video/webm': 'webm', 'video/x-m4v': 'm4v' };
  const rid = () => Array.from(crypto.getRandomValues(new Uint8Array(12))).map((b) => b.toString(16).padStart(2, '0')).join('');
  // The editor block for a list of photos / videos: add, caption, remove. get() returns the list.
  function mediaEditor(host, list) {
    const items = (list || []).map((x) => Object.assign({}, x));
    const paint = () => {
      host.innerHTML = '<div class="tr-med-list">' + items.map((x, i) => '<div class="tr-med-row">' +
        (x.kind === 'video' ? '<span class="tr-med-th is-video">' + icon('video') + '</span>' : '<img class="tr-med-th" src="' + esc(fileUrl(x.path)) + '" alt="">') +
        '<input data-cap="' + i + '" maxlength="140" value="' + esc(x.caption || '') + '" placeholder="Descriere (opțional)">' +
        '<button type="button" class="k-icon-btn" data-med-rm="' + i + '" aria-label="Scoate">' + icon('trash') + '</button></div>').join('') + '</div>' +
        '<div class="tr-med-add"><label class="k-btn is-outline is-sm">' + icon('image') + 'Adaugă poză<input type="file" accept="image/*" data-med-img hidden></label>' +
        '<label class="k-btn is-outline is-sm">' + icon('video') + 'Adaugă video<input type="file" accept="video/*" data-med-vid hidden></label><span class="tr-med-prog k-muted" data-med-prog></span></div>';
    };
    paint();
    host.addEventListener('input', (e) => { const c = e.target.closest('[data-cap]'); if (c) items[+c.dataset.cap].caption = c.value; });
    host.addEventListener('click', (e) => { const b = e.target.closest('[data-med-rm]'); if (b) { items.splice(+b.dataset.medRm, 1); paint(); } });
    host.addEventListener('change', async (e) => {
      const prog = host.querySelector('[data-med-prog]');
      const f = e.target.files && e.target.files[0];
      if (!f) return;
      try {
        if (e.target.hasAttribute('data-med-img')) {
          prog.textContent = 'Se urcă poza…';
          const j = await post({ action: 'media_image', dataUrl: await shrink(f) });
          items.push({ kind: 'image', path: j.path, caption: '' });
        } else {
          const ext = VIDEO_EXT[f.type] || (/\.(mp4|mov|webm|m4v)$/i.exec(f.name) || [])[1];
          if (!ext) { K.ui().toast('Video-ul trebuie să fie MP4, MOV sau WEBM.', 'error'); return; }
          if (f.size > 500 * 1024 * 1024) { K.ui().toast('Video-ul are peste 500 MB. Filmează mai scurt sau la o calitate mai mică.', 'error'); return; }
          const lib = await uploader();
          const pathname = 'academy/' + rid() + '.' + String(ext).toLowerCase();
          prog.textContent = 'Se urcă video-ul… 0%';
          const r = await lib.upload(pathname, f, { access: 'private', handleUploadUrl: '/api/portal-academy?upload=1', contentType: f.type || 'video/mp4', multipart: f.size > 25 * 1024 * 1024,
            onUploadProgress: (p) => { prog.textContent = 'Se urcă video-ul… ' + Math.round(p.percentage || 0) + '%'; } });
          items.push({ kind: 'video', path: r.pathname || pathname, caption: '' });
        }
        paint();
      } catch (err) {
        prog.textContent = '';
        K.ui().toast(err && err.code === 'too_large' ? 'Poza e prea mare.' : 'Nu am putut urca fișierul. Verifică internetul și reîncearcă.', 'error');
      } finally { e.target.value = ''; }
    });
    return { get: () => items.map((x) => ({ id: x.id, kind: x.kind, path: x.path, caption: x.caption || '' })) };
  }

  // ------------------------------------------------------------------ section frame + tabs
  function pathStats(id) {
    const p = progOf(id);
    if (!p.path) return null;
    const days = (D().paths || {})[p.path.role] || [];
    const items = days.flatMap((d) => d.items);
    const done = items.filter((x) => itemDone(x, p)).length;
    return { role: p.path.role, start: p.path.start, days, items: items.length, done, day: dayNo(p.path.start, days.length) };
  }
  // the day of the path: the first day is the start, then one per working day (Monday to Friday)
  function dayNo(start, total) {
    const s = K.parse(start), t = K.parse(K.today());
    let n = 1;
    for (const d = new Date(s); d < t; d.setDate(d.getDate() + 1)) { const nx = new Date(d); nx.setDate(nx.getDate() + 1); const wd = nx.getDay(); if (wd !== 0 && wd !== 6) n++; }
    return Math.max(1, Math.min(total || 1, n));
  }
  function itemDone(x, p) {
    if (x.kind === 'read') return !!p.read[x.ref];
    if (x.kind === 'quiz') return !!p.quiz[x.ref];
    if (x.kind === 'case') return !!p.cases[x.ref];
    if (x.kind === 'task') return !!(p.tasks[x.id] && p.tasks[x.id].confirmed);
    return false;
  }
  const pendingTasks = () => {
    const out = [];
    const all = (K.data && K.data.academyProgress) || {};
    Object.keys(all).forEach((emp) => {
      const p = progOf(emp);
      if (!p.path) return;
      const days = (D().paths || {})[p.path.role] || [];
      days.forEach((d, di) => d.items.forEach((x) => { const t = p.tasks[x.id]; if (x.kind === 'task' && t && t.done && !t.confirmed) out.push({ emp, item: x, day: di + 1, at: t.done }); }));
    });
    return out.sort((a, b) => (a.at < b.at ? -1 : 1));
  };
  function tabs() {
    const t = [];
    const ps = pathStats(meId());
    if (ps) t.push(['drum', 'Drumul meu', 'target', ps.done < ps.items ? ps.items - ps.done : 0]);
    t.push(['vanzari', 'Vânzări', 'trend'], ['tratamente', 'Tratamente', 'sparkles'], ['fise', 'De printat', 'printer']);
    if (isAdmin()) t.push(['echipa', 'Progres echipă', 'trend', pendingTasks().length]);
    return t;
  }

  function mount(p) {
    panel = p;
    panel.classList.add('k-panel', 'ac');
    panel.innerHTML = '<div class="k-head"><div><div class="k-eyebrow">Echipă</div><h2>Traininguri</h2></div></div>' +
      '<nav class="tr-tabs" data-tabs></nav><div data-view></div>';
    panel.addEventListener('click', onClick);
    panel.addEventListener('input', onCalcInput);
    panel.addEventListener('change', onCalcInput);
  }
  function render() {
    if (!panel || !K.data) return;
    const t = tabs();
    if (!A.tab || !t.some((x) => x[0] === A.tab)) A.tab = t[0][0] === 'drum' && pathStats(meId()).done < pathStats(meId()).items ? 'drum' : 'vanzari';
    panel.querySelector('[data-tabs]').innerHTML = t.map(([id, l, ic, n]) => '<button type="button" class="tr-tab' + (A.tab === id ? ' is-on' : '') + '" data-tab="' + id + '">' + icon(ic) + '<span>' + esc(l) + '</span>' + (n ? '<b class="tr-tab-n">' + n + '</b>' : '') + '</button>').join('');
    const v = panel.querySelector('[data-view]');
    if (subOf() === 'calc' && v.querySelector('[data-calc]')) { paintCalcResults(); return; } // keep what she's typing
    v.innerHTML = ({ drum: drumHtml, vanzari: () => areaHtml('vanzari'), tratamente: () => areaHtml('tratamente'), fise: printHtml, echipa: teamHtml })[A.tab]();
    if (subOf() === 'calc') paintCalcResults();
    if (subOf() === 'fisa' && window.C360Fisa) window.C360Fisa.bind(v, A.fisa, render);
    if (isAdmin()) K.badge('traininguri', pendingTasks().length);
    else { const ps = pathStats(meId()); K.badge('traininguri', ps ? todayLeft(ps) : 0); }
  }
  // what's still to do on her current day (and the days before it)
  function todayLeft(ps) {
    const p = mine();
    return ps.days.slice(0, ps.day).flatMap((d) => d.items).filter((x) => !itemDone(x, p) && !(x.kind === 'task' && p.tasks[x.id] && p.tasks[x.id].done)).length;
  }

  // ------------------------------------------------------------------ Drumul meu
  const KIND = { read: ['book', 'Citește'], quiz: ['listCheck', 'Test'], case: ['users', 'Caz'], task: ['checkCircle', 'Sarcină'] };
  function itemHtml(x, p, own) {
    const f = x.kind === 'task' ? null : findRef(x.ref);
    const t = p.tasks[x.id] || null;
    const done = itemDone(x, p);
    const title = x.kind === 'task' ? x.text : f ? (f.kind === 'scheme' ? 'Schema: ' + f.title : f.title) : 'În pregătire';
    let state = '', act = '';
    if (x.kind === 'quiz' && p.quiz[x.ref]) state = '<span class="k-tag is-good">' + p.quiz[x.ref].best + ' din ' + p.quiz[x.ref].total + '</span>';
    if (x.kind === 'case' && p.cases[x.ref]) state = '<span class="k-tag ' + (p.cases[x.ref].everOk ? 'is-good">Corect' : 'is-warn">Greșit') + '</span>';
    if (x.kind === 'task') {
      if (t && t.confirmed) state = '<span class="k-tag is-good">' + icon('check') + 'Confirmat</span>';
      else if (t && t.done) { state = '<span class="k-tag is-warn">' + icon('clock') + 'Așteaptă confirmarea</span>'; if (own) act = '<button type="button" class="k-btn is-ghost is-sm" data-task-undo="' + esc(x.id) + '">Anulează</button>'; }
      else if (own) act = '<button type="button" class="k-btn is-primary is-sm" data-task-done="' + esc(x.id) + '">' + icon('check') + 'Am făcut</button>';
    } else if (f && own) {
      act = '<button type="button" class="k-btn ' + (done ? 'is-ghost' : 'is-outline') + ' is-sm" data-open-ref="' + esc(x.ref) + '" data-open-kind="' + x.kind + '">' + (x.kind === 'quiz' ? (done ? 'Din nou' : 'Fă testul') : x.kind === 'case' ? (done ? 'Vezi' : 'Rezolvă') : (done ? 'Recitește' : 'Deschide')) + '</button>';
    }
    return '<li class="tr-item' + (done ? ' is-done' : '') + '"><span class="tr-item-ic">' + (done ? icon('check') : icon(KIND[x.kind][0])) + '</span>' +
      '<div class="tr-item-t"><small>' + esc(KIND[x.kind][1]) + '</small><b>' + esc(title) + '</b></div><div class="tr-item-a">' + state + act + '</div></li>';
  }
  function drumHtml() {
    const ps = pathStats(meId());
    if (!ps) return K.empty('target', 'Nu ai un drum de început', '');
    const p = mine();
    const pct = ps.items ? Math.round(ps.done / ps.items * 100) : 0;
    if (A.openDay == null) A.openDay = ps.day - 1;
    return '<div class="tr-hero">' + K.ring(pct, { size: 92, stroke: 9, inner: '<b>' + pct + '%</b>' }) +
      '<div><div class="k-eyebrow">' + esc(ROLE[ps.role] || '') + '</div><h3>' + (ps.done >= ps.items ? 'Ai terminat drumul de început' : 'Ziua ' + ps.day + ' din ' + ps.days.length) + '</h3>' +
      '<p class="k-muted">' + ps.done + ' din ' + ps.items + ' pași făcuți · început pe ' + esc(K.dateShort(ps.start)) + '</p></div></div>' +
      '<div class="tr-days">' + ps.days.map((d, i) => {
        const n = d.items.filter((x) => itemDone(x, p)).length;
        const open = A.openDay === i;
        return '<section class="tr-day' + (open ? ' is-open' : '') + (i + 1 === ps.day ? ' is-today' : '') + (n === d.items.length ? ' is-done' : '') + '">' +
          '<button type="button" class="tr-day-h" data-day="' + i + '"><span class="tr-day-n">' + (n === d.items.length ? icon('check') : i + 1) + '</span>' +
          '<span class="tr-day-t"><small>Ziua ' + (i + 1) + (i + 1 === ps.day ? ' · azi' : '') + '</small><b>' + esc(d.title) + '</b></span><span class="tr-day-c">' + n + '/' + d.items.length + '</span>' + icon(open ? 'up' : 'down') + '</button>' +
          (open ? '<ul class="tr-items">' + d.items.map((x) => itemHtml(x, p, true)).join('') + '</ul>' : '') + '</section>';
      }).join('') + '</div>';
  }

  // ------------------------------------------------------------------ Vânzări / Tratamente
  // whose view: the person's own role; the owner picks Recepție or Cosmeticiană
  const viewRole = () => (isAdmin() ? A.role : (K.data && K.data.me && K.data.me.role === 'receptie' ? 'receptie' : 'cosmetician'));
  function areaCards(area, role) {
    const p = mine();
    const cards = manuals().filter((m) => (m.area || 'vanzari') === area && (m.roles || []).includes(role)).map((m) => {
      const r = m.chapters.filter((c) => p.read[cref(m, c)]).length;
      return { id: 'm:' + m.id, title: m.title, icon: m.icon || 'book', sub: r ? r + ' din ' + m.chapters.length + ' citite' : m.chapters.length + ' capitole' };
    });
    const visible = (D().schemes || []).length;
    if (area === 'vanzari' && role === 'cosmetician') {
      // the consultation sheet, page by page, right after the Consultația manual
      if (window.C360Fisa) cards.splice(cards.findIndex((c) => c.id === 'm:consultatie') + 1, 0, { id: 'fisa', title: 'Fișa consultației', icon: 'file', sub: '5 pagini, explicate pe fișă' });
      cards.push({ id: 'calc', title: 'Calculator ofertă', icon: 'percent', sub: 'Programul și cele 4 oferte' });
      cards.push({ id: 'cases', title: 'Cazuri', icon: 'users', sub: (D().cases || []).length + ' exerciții' });
    }
    if (area === 'tratamente') {
      cards.unshift(role === 'receptie'
        ? { id: 'summary', title: 'Tratamentele, pe scurt', icon: 'sparkles', sub: visible + ' tratamente' }
        : { id: 'schemes', title: 'Scheme de tratament', icon: 'sparkles', sub: visible + ' tratamente' });
      cards.splice(1, 0, { id: 'combos', title: 'Combinații', icon: 'layers', sub: (D().combos || []).length + ' combinații' });
    }
    return cards;
  }
  // the part shown under the cards in the current tab
  function subOf() {
    if (A.tab !== 'vanzari' && A.tab !== 'tratamente') return '';
    const cards = areaCards(A.tab, viewRole());
    const key = A.tab + ':' + viewRole();
    if (!cards.some((c) => c.id === A.pick[key])) A.pick[key] = cards[0] ? cards[0].id : '';
    return A.pick[key];
  }
  function areaHtml(area) {
    const role = viewRole();
    const cards = areaCards(area, role);
    const pick = subOf();
    if (pick.indexOf('m:') === 0) A.manual = pick.slice(2);
    const sub = pick.indexOf('m:') === 0 ? manualHtml(current()) : pick === 'fisa' ? window.C360Fisa.html(A.fisa) : pick === 'calc' ? calcHtml() : pick === 'cases' ? casesHtml() : pick === 'schemes' ? schemesHtml() : pick === 'summary' ? summariesHtml() : pick === 'combos' ? combosHtml() : '';
    return (isAdmin() ? '<div class="tr-rolebar">' + K.seg('trole', [['receptie', 'Recepție', 'phone'], ['cosmetician', 'Cosmeticiană', 'sparkles']], role) + '</div>' : '') +
      (cards.length ? '<div class="ac-manuals">' + cards.map((c) => '<button type="button" class="ac-mcard' + (c.id === pick ? ' is-on' : '') + '" data-sub="' + esc(c.id) + '"><span class="k-icon-chip is-accent">' + icon(c.icon) + '</span>' +
        '<div><b>' + esc(c.title) + '</b><span>' + esc(c.sub) + '</span></div></button>').join('') + '</div>' : '') +
      (sub || K.empty('book', 'Nimic aici încă', ''));
  }

  // ------------------------------------------------------------------ a manual
  function manualHtml(m) {
    if (!m) return K.empty('book', 'Niciun training încă', '');
    const p = mine();
    return '<div class="ac-head"><div><h3>' + esc(m.title) + '</h3><p>' + esc(m.lede || '') + '</p></div><div class="ac-head-actions">' +
      (isAdmin() ? '<button type="button" class="k-btn is-outline is-sm" data-edit>' + icon('pen') + 'Capitole</button>' : '') +
      '<button type="button" class="k-btn is-primary is-sm" data-pdf-all>' + icon('download') + 'Tot manualul (PDF)</button></div></div>' +
      '<div class="ac-grid">' + m.chapters.map((c, i) => {
        const ref = cref(m, c), q = p.quiz[ref], read = !!p.read[ref];
        return '<article class="ac-ch" style="animation-delay:' + (i * 0.03).toFixed(2) + 's"><div class="tr-ch-top"><span class="ac-num">' + num(i) + '</span>' +
          (read ? '<span class="k-tag is-good">' + icon('check') + 'Citit</span>' : '') + (q ? '<span class="k-tag ' + (q.best === q.total ? 'is-good' : 'is-warn') + '">Test ' + q.best + '/' + q.total + '</span>' : '') +
          ((c.media || []).length ? '<span class="k-tag">' + icon((c.media || []).some((x) => x.kind === 'video') ? 'video' : 'image') + c.media.length + '</span>' : '') +
          (isAdmin() ? '<button type="button" class="k-icon-btn tr-ch-pen" data-ch-edit="' + i + '" aria-label="Editează capitolul">' + icon('pen') + '</button>' : '') + '</div>' +
          '<h4>' + esc(c.title) + '</h4><p>' + esc(c.summary || '') + '</p>' +
          '<footer><button type="button" class="k-btn is-outline is-sm" data-read="' + i + '">' + icon('book') + 'Citește</button>' +
          ((c.quiz || []).length ? '<button type="button" class="k-btn is-sm" data-quiz="' + i + '">' + icon('listCheck') + (q ? 'Din nou' : 'Test') + '</button>' : '') +
          '<button type="button" class="k-btn is-ghost is-sm" data-pdf="' + i + '" aria-label="Descarcă PDF">' + icon('download') + 'PDF</button></footer></article>';
      }).join('') + '</div>';
  }

  function read(m, i) {
    const c = m.chapters[i];
    const ref = cref(m, c);
    const d = K.drawer({
      title: c.title, icon: 'book', width: 720, subtitle: esc(m.title) + ' · Capitolul ' + num(i),
      body: '<div class="ac-read">' + (c.summary ? '<p class="ac-sum">' + esc(c.summary) + '</p>' : '') + bodyHtml(c.body) + mediaHtml(c.media) + '</div>',
      footer: (i > 0 ? '<button type="button" class="k-btn" data-prev aria-label="Capitolul anterior">' + icon('left') + '</button>' : '') + '<span class="k-grow"></span>' +
        '<button type="button" class="k-btn is-ghost" data-pdf aria-label="Descarcă PDF">' + icon('download') + '</button>' +
        (mine().read[ref] ? '<span class="k-tag is-good tr-readtag">' + icon('check') + 'Citit</span>' : '<button type="button" class="k-btn is-outline" data-did>' + icon('check') + 'Am citit</button>') +
        ((c.quiz || []).length ? '<button type="button" class="k-btn is-primary" data-q>' + icon('listCheck') + 'Testul</button>' : i < m.chapters.length - 1 ? '<button type="button" class="k-btn is-primary" data-next>Următorul' + icon('right') + '</button>' : ''),
      onMount(el) {
        el.querySelector('[data-pdf]').addEventListener('click', (ev) => downloadPdf(m, i, ev.currentTarget));
        const did = el.querySelector('[data-did]');
        if (did) did.addEventListener('click', (ev) => K.busy(ev.currentTarget, async () => {
          try { const j = await post({ action: 'read', ref }); setMine(j.progress); did.outerHTML = '<span class="k-tag is-good tr-readtag">' + icon('check') + 'Citit</span>'; render(); }
          catch (err) { K.ui().toast(K.errText(err), 'error'); }
        }));
        const q = el.querySelector('[data-q]'); if (q) q.addEventListener('click', () => { d.close(); setTimeout(() => quiz(m, i), 180); });
        const nx = el.querySelector('[data-next]'), pv = el.querySelector('[data-prev]');
        if (nx) nx.addEventListener('click', () => { d.close(); setTimeout(() => read(m, i + 1), 180); });
        if (pv) pv.addEventListener('click', () => { d.close(); setTimeout(() => read(m, i - 1), 180); });
      },
    });
  }

  // a chapter's test: answer everything, then see what was right and why
  function quiz(m, i) {
    const c = m.chapters[i];
    const ref = cref(m, c);
    const answers = c.quiz.map(() => null);
    let result = null;
    const d = K.drawer({
      title: 'Test · ' + c.title, icon: 'listCheck', width: 640, subtitle: c.quiz.length + ' întrebări · ' + esc(m.title),
      body: '<div class="tr-quiz" data-qz></div>',
      footer: '<span class="k-grow" data-qz-note></span><button type="button" class="k-btn" data-qz-close>Închide</button><button type="button" class="k-btn is-primary" data-qz-go disabled>' + icon('check') + 'Verifică</button>',
      onMount(el) {
        const box = el.querySelector('[data-qz]'), go = el.querySelector('[data-qz-go]'), note = el.querySelector('[data-qz-note]');
        const paint = () => {
          box.innerHTML = (result ? '<div class="tr-score ' + (result.score === result.total ? 'is-good' : '') + '"><b>' + result.score + ' din ' + result.total + '</b><span>' + (result.score === result.total ? 'Perfect!' : 'Uită-te mai jos la ce a fost greșit.') + '</span></div>' : '') +
            c.quiz.map((q, qi) => {
              const r = result && result.results[qi];
              return '<fieldset class="tr-q' + (r ? (r.ok ? ' is-ok' : ' is-bad') : '') + '"><legend><span>' + (qi + 1) + '</span>' + esc(q.q) + '</legend>' +
                q.options.map((o, oi) => {
                  const cls = r ? (oi === r.answer ? ' is-right' : oi === answers[qi] ? ' is-wrong' : '') : (answers[qi] === oi ? ' is-on' : '');
                  return '<button type="button" class="tr-opt' + cls + '" data-a="' + qi + '|' + oi + '"' + (r ? ' disabled' : '') + '><i></i><span>' + esc(o) + '</span></button>';
                }).join('') + (r && r.why ? '<p class="tr-why">' + icon(r.ok ? 'check' : 'info') + esc(r.why) + '</p>' : '') + '</fieldset>';
            }).join('');
          go.disabled = !result && answers.some((a) => a == null);
          go.innerHTML = result ? icon('refresh') + 'Din nou' : icon('check') + 'Verifică';
          note.textContent = result ? '' : answers.filter((a) => a != null).length + ' din ' + c.quiz.length;
        };
        paint();
        box.addEventListener('click', (e) => { const b = e.target.closest('[data-a]'); if (!b || result) return; const [qi, oi] = b.dataset.a.split('|').map(Number); answers[qi] = oi; paint(); });
        el.querySelector('[data-qz-close]').addEventListener('click', () => d.close());
        go.addEventListener('click', (ev) => {
          if (result) { result = null; answers.fill(null); paint(); box.scrollTop = 0; return; }
          K.busy(ev.currentTarget, async () => {
            try { result = await post({ action: 'quiz', ref, answers }); setMine(result.progress); paint(); el.querySelector('.k-dbody').scrollTop = 0; render(); }
            catch (err) { K.ui().toast(K.errText(err), 'error'); }
          });
        });
      },
    });
  }

  // the manual's chapters: titles, order, add, remove (the text, photos and test of one chapter: its own editor)
  function editManual() {
    const m = current();
    let list = JSON.parse(JSON.stringify(m.chapters));
    const d = K.drawer({
      title: 'Capitole · ' + m.title, icon: 'pen', width: 640,
      body: '<div data-chs></div><button type="button" class="k-btn is-outline rs-add" data-add>' + icon('plus') + 'Adaugă capitol</button>',
      footer: '<span class="k-grow"></span><button type="button" class="k-btn" data-cancel>Renunță</button><button type="button" class="k-btn is-primary" data-save>' + icon('check') + 'Salvează</button>',
      onMount(el) {
        const box = el.querySelector('[data-chs]');
        const readForm = () => box.querySelectorAll('[data-i]').forEach((row) => { const x = list[+row.dataset.i]; x.title = row.querySelector('[data-f="title"]').value; x.summary = row.querySelector('[data-f="summary"]').value; });
        const paint = () => {
          box.innerHTML = list.map((x, i) => '<div class="rs-ed" data-i="' + i + '"><div class="rs-ed-head"><b class="ac-num is-sm">' + num(i) + '</b>' +
            '<input data-f="title" value="' + esc(x.title) + '" placeholder="Titlul capitolului">' +
            '<button type="button" class="k-icon-btn" data-up="' + i + '"' + (i ? '' : ' disabled') + '>' + icon('up') + '</button><button type="button" class="k-icon-btn" data-down="' + i + '"' + (i < list.length - 1 ? '' : ' disabled') + '>' + icon('down') + '</button>' +
            '<button type="button" class="k-icon-btn" data-rm="' + i + '">' + icon('trash') + '</button></div>' +
            '<input data-f="summary" value="' + esc(x.summary || '') + '" placeholder="Pe scurt, despre ce e capitolul"></div>').join('');
        };
        paint();
        el.addEventListener('click', (ev) => {
          const b = ev.target.closest('[data-up],[data-down],[data-rm],[data-add]');
          if (!b) return;
          readForm();
          if (b.hasAttribute('data-add')) list.push({ id: '', title: '', summary: '', body: [], media: [], quiz: [] });
          if (b.dataset.up) { const i = +b.dataset.up; [list[i - 1], list[i]] = [list[i], list[i - 1]]; }
          if (b.dataset.down) { const i = +b.dataset.down; [list[i + 1], list[i]] = [list[i], list[i + 1]]; }
          if (b.dataset.rm) list.splice(+b.dataset.rm, 1);
          paint();
        });
        el.querySelector('[data-cancel]').addEventListener('click', () => d.close());
        el.querySelector('[data-save]').addEventListener('click', (ev) => K.busy(ev.currentTarget, async () => {
          readForm();
          const clean = list.filter((x) => x.title.trim() || (x.body || []).length);
          try { await save({ manualId: m.id, chapters: clean }); d.close(); K.ui().toast('Salvat.', 'success'); K.reload(); }
          catch (err) { K.ui().toast(K.errText(err), 'error'); }
        }));
      },
    });
  }

  // one chapter: text, photos and videos, test
  function editChapter(i) {
    const m = current();
    const c = JSON.parse(JSON.stringify(m.chapters[i]));
    let qs = (c.quiz || []).map((q) => ({ q: q.q, options: q.options.slice(), answer: q.answer || 0, why: q.why || '' }));
    let media;
    const d = K.drawer({
      title: 'Editează · ' + c.title, icon: 'pen', width: 760, subtitle: 'Pe fiecare rând: „## ” subtitlu · „- ” listă · „1. ” pas · „> ” ce spui · „! ” regulă importantă · restul e text.',
      body: '<div class="k-form">' + K.field('Titlul', '<input data-c="title" maxlength="120" value="' + esc(c.title) + '">', 'full') +
        K.field('Pe scurt', '<input data-c="summary" maxlength="300" value="' + esc(c.summary || '') + '">', 'full') +
        K.field('Conținutul', '<textarea data-c="body" rows="' + Math.min(22, Math.max(8, c.body.length + 2)) + '">' + esc(c.body.join('\n')) + '</textarea>', 'full') + '</div>' +
        '<h4 class="tr-sub">' + icon('image') + 'Poze și video</h4><div data-media></div>' +
        '<h4 class="tr-sub">' + icon('listCheck') + 'Testul</h4><div data-qs></div><button type="button" class="k-btn is-outline is-sm" data-q-add>' + icon('plus') + 'Adaugă întrebare</button>',
      footer: '<span class="k-grow"></span><button type="button" class="k-btn" data-cancel>Renunță</button><button type="button" class="k-btn is-primary" data-save>' + icon('check') + 'Salvează</button>',
      onMount(el) {
        media = mediaEditor(el.querySelector('[data-media]'), c.media);
        const box = el.querySelector('[data-qs]');
        const readQs = () => box.querySelectorAll('[data-qi]').forEach((row) => {
          const q = qs[+row.dataset.qi];
          q.q = row.querySelector('[data-qq]').value;
          q.why = row.querySelector('[data-qw]').value;
          q.options = [...row.querySelectorAll('[data-qo]')].map((x) => x.value);
          const r = row.querySelector('[data-qa]:checked'); q.answer = r ? +r.value : 0;
        });
        const paint = () => {
          box.innerHTML = qs.length ? qs.map((q, qi) => '<div class="tr-qed" data-qi="' + qi + '"><div class="tr-qed-h"><b>' + (qi + 1) + '</b><input data-qq maxlength="300" value="' + esc(q.q) + '" placeholder="Întrebarea">' +
            '<button type="button" class="k-icon-btn" data-q-rm="' + qi + '" aria-label="Scoate întrebarea">' + icon('trash') + '</button></div>' +
            q.options.map((o, oi) => '<label class="tr-qed-o"><input type="radio" name="qa' + qi + '" data-qa value="' + oi + '"' + (q.answer === oi ? ' checked' : '') + ' title="Răspunsul corect"><input data-qo maxlength="200" value="' + esc(o) + '" placeholder="Varianta ' + (oi + 1) + '">' +
              (q.options.length > 2 ? '<button type="button" class="k-icon-btn" data-o-rm="' + qi + '|' + oi + '" aria-label="Scoate varianta">' + icon('x') + '</button>' : '') + '</label>').join('') +
            (q.options.length < 5 ? '<button type="button" class="k-btn is-ghost is-sm" data-o-add="' + qi + '">' + icon('plus') + 'Variantă</button>' : '') +
            '<input data-qw maxlength="300" value="' + esc(q.why) + '" placeholder="De ce e corect (apare după răspuns)"></div>').join('') : '<p class="k-muted">Fără test. Bifa din stânga variantei marchează răspunsul corect.</p>';
        };
        paint();
        el.addEventListener('click', (ev) => {
          const b = ev.target.closest('[data-q-add],[data-q-rm],[data-o-add],[data-o-rm]');
          if (!b) return;
          readQs();
          if (b.hasAttribute('data-q-add')) qs.push({ q: '', options: ['', '', ''], answer: 0, why: '' });
          if (b.dataset.qRm) qs.splice(+b.dataset.qRm, 1);
          if (b.dataset.oAdd) qs[+b.dataset.oAdd].options.push('');
          if (b.dataset.oRm) { const [qi, oi] = b.dataset.oRm.split('|').map(Number); const q = qs[qi]; q.options.splice(oi, 1); if (q.answer >= q.options.length) q.answer = 0; else if (q.answer > oi) q.answer--; }
          paint();
        });
        el.querySelector('[data-cancel]').addEventListener('click', () => d.close());
        el.querySelector('[data-save]').addEventListener('click', (ev) => K.busy(ev.currentTarget, async () => {
          readQs();
          const g = (k) => el.querySelector('[data-c="' + k + '"]').value;
          const ch = Object.assign({}, c, { title: g('title'), summary: g('summary'), body: g('body').split('\n').map((s) => s.trim()).filter(Boolean), media: media.get(),
            quiz: qs.map((q) => ({ q: q.q.trim(), options: q.options.map((o) => o.trim()).filter(Boolean), answer: q.answer, why: q.why.trim() })).filter((q) => q.q && q.options.length >= 2) });
          const list = m.chapters.map((x, k) => (k === i ? ch : x));
          try { await save({ manualId: m.id, chapters: list }); d.close(); K.ui().toast('Capitol salvat.', 'success'); K.reload(); }
          catch (err) { K.ui().toast(K.errText(err), 'error'); }
        }));
      },
    });
  }

  // ------------------------------------------------------------------ Scheme de tratament
  const draftTag = (x) => (isAdmin() && !x.verified ? '<span class="k-tag is-warn">Ciornă</span>' : '');
  function schemesHtml() {
    const all = D().schemes || [];
    const g = A.schemeGroup;
    const list = all.filter((s) => g === 'all' || s.group === g);
    const drafts = all.filter((s) => !s.verified).length;
    const p = mine();
    return '<div class="tr-bar">' + K.seg('sgroup', [['all', 'Toate'], ['fata', 'Față'], ['corp', 'Corp'], ['epilare', 'Epilare']], g) +
      (isAdmin() ? '<span class="k-grow"></span>' + (drafts ? '<span class="k-tag is-warn">' + drafts + ' de verificat</span>' : '') + '<button type="button" class="k-btn is-outline is-sm" data-scheme-new>' + icon('plus') + 'Schemă nouă</button>' : '') + '</div>' +
      (isAdmin() && drafts ? '<p class="tr-note">' + icon('info') + 'Ciornele le vezi doar tu. Le citești, completezi setările aparatelor și apeși „Marchează verificat”, apoi le vede echipa.</p>' : '') +
      (list.length ? '<div class="ac-grid">' + list.map((s) => '<button type="button" class="ac-ch tr-card" data-scheme="' + esc(s.id) + '">' +
        '<div class="tr-ch-top"><span class="k-tag">' + esc(GROUP[s.group]) + '</span>' + (s.city !== 'both' ? '<span class="k-tag is-info">' + esc(CITY[s.city]) + '</span>' : '') + draftTag(s) +
        (p.read[sref(s)] ? '<span class="k-tag is-good">' + icon('check') + 'Citit</span>' : '') + '</div>' +
        '<h4>' + esc(s.name) + '</h4><p>' + esc(s.what || '') + '</p>' +
        '<footer class="tr-meta">' + (s.minutes ? '<span>' + icon('clock') + s.minutes + ' min</span>' : '') + (s.sessions ? '<span>' + icon('layers') + esc(s.sessions) + ' ședințe</span>' : '') + (s.interval ? '<span>' + icon('calendar') + esc(s.interval) + '</span>' : '') + '</footer></button>').join('') + '</div>'
        : K.empty('sparkles', isAdmin() ? 'Nicio schemă aici' : 'Schemele sunt în pregătire', ''));
  }
  const sec = (title, inner, cls) => (inner ? '<section class="tr-sec' + (cls ? ' ' + cls : '') + '"><h5>' + title + '</h5>' + inner + '</section>' : '');
  const ul = (l) => ((l || []).length ? '<ul>' + l.map((x) => '<li>' + esc(x) + '</li>').join('') + '</ul>' : '');
  const ol = (l) => ((l || []).length ? '<ol>' + l.map((x) => '<li>' + esc(x) + '</li>').join('') + '</ol>' : '');
  const says = (l) => (l || []).map((x) => '<blockquote class="ac-say">' + esc(x) + '</blockquote>').join('');
  const missing = (t) => (isAdmin() ? '<p class="tr-missing">' + icon('alert') + esc(t) + '</p>' : '');
  function openScheme(id) {
    const s = schemeOf(id);
    if (!s) return;
    const ref = sref(s);
    const prices = (s.prices || []).map(priceOf).filter(Boolean);
    const combos = (s.combos || []).map(schemeOf).filter(Boolean);
    const d = K.drawer({
      title: s.name, icon: 'sparkles', width: 720, subtitle: esc(GROUP[s.group]) + (s.city !== 'both' ? ' · ' + esc(CITY[s.city]) : '') + (s.minutes ? ' · ' + s.minutes + ' min' : '') + (isAdmin() && !s.verified ? ' · ciornă' : ''),
      body: '<div class="ac-read tr-scheme">' + (s.what ? '<p class="ac-sum">' + esc(s.what) + '</p>' : '') +
        sec('Pentru cine', ul(s.forWho)) +
        sec('Contraindicații · nu faci tratamentul', ul(s.contra), 'is-bad') +
        sec('Pașii', ol(s.steps) || missing('Pașii nu sunt scriși.')) +
        sec('Setările aparatului', ul(s.settings) || missing('De completat de specialistă.')) +
        sec('Ce îi spui clientei', says(s.say)) +
        sec('După tratament', ul(s.after)) +
        sec('Ședințe și interval', (s.sessions || s.interval) ? '<p>' + [s.sessions ? esc(s.sessions) + ' ședințe' : '', s.interval ? esc(s.interval) : ''].filter(Boolean).join(' · ') + '</p>' : missing('De completat.')) +
        sec('Se combină cu', combos.length ? '<div class="tr-chips">' + combos.map((x) => '<button type="button" class="k-chip" data-goto-scheme="' + esc(x.id) + '">' + esc(x.name) + '</button>').join('') + '</div>' : '') +
        sec('Prețuri de listă', prices.length ? '<ul>' + prices.map((x) => '<li>' + esc(x.name) + ': <b>' + lei(x.price) + '</b> / ședință</li>').join('') + '</ul>' : '') +
        mediaHtml(s.media) + '</div>',
      footer: (isAdmin() ? '<button type="button" class="k-btn is-ghost" data-s-edit>' + icon('pen') + 'Editează</button><button type="button" class="k-btn ' + (s.verified ? 'is-ghost' : 'is-outline') + '" data-s-ver>' + icon(s.verified ? 'x' : 'check') + (s.verified ? 'Scoate verificarea' : 'Marchează verificat') + '</button>' : '') +
        '<span class="k-grow"></span>' + (mine().read[ref] ? '<span class="k-tag is-good tr-readtag">' + icon('check') + 'Citit</span>' : '<button type="button" class="k-btn is-primary" data-did>' + icon('check') + 'Am citit</button>'),
      onMount(el) {
        el.addEventListener('click', (e) => { const g = e.target.closest('[data-goto-scheme]'); if (g) { d.close(); setTimeout(() => openScheme(g.dataset.gotoScheme), 180); } });
        const did = el.querySelector('[data-did]');
        if (did) did.addEventListener('click', (ev) => K.busy(ev.currentTarget, async () => {
          try { const j = await post({ action: 'read', ref }); setMine(j.progress); did.outerHTML = '<span class="k-tag is-good tr-readtag">' + icon('check') + 'Citit</span>'; render(); }
          catch (err) { K.ui().toast(K.errText(err), 'error'); }
        }));
        const ed = el.querySelector('[data-s-edit]'); if (ed) ed.addEventListener('click', () => { d.close(); setTimeout(() => editScheme(s), 180); });
        const ver = el.querySelector('[data-s-ver]');
        if (ver) ver.addEventListener('click', (ev) => K.busy(ev.currentTarget, async () => {
          try { await save({ upsert: { kind: 'scheme', item: Object.assign({}, s, { verified: !s.verified }) } }); d.close(); K.ui().toast(s.verified ? 'Scoasă de la echipă.' : 'Verificată. O vede toată echipa.', 'success'); K.reload(); }
          catch (err) { K.ui().toast(K.errText(err), 'error'); }
        }));
      },
    });
  }
  // reception: what each treatment does and how to talk about it (no steps, no settings)
  function summariesHtml() {
    const all = D().schemes || [];
    const g = A.schemeGroup;
    const list = all.filter((x) => g === 'all' || x.group === g);
    const p = mine();
    return '<div class="tr-bar">' + K.seg('sgroup', [['all', 'Toate'], ['fata', 'Față'], ['corp', 'Corp'], ['epilare', 'Epilare']], g) + '</div>' +
      (isAdmin() && all.some((x) => !x.verified) ? '<p class="tr-note">' + icon('info') + 'Recepția vede un tratament după ce îl marchezi verificat (Cosmeticiană → Scheme de tratament). Aici e varianta ei: ce face, beneficii, ce spune la telefon.</p>' : '') +
      (list.length ? '<div class="ac-grid">' + list.map((x) => '<button type="button" class="ac-ch tr-card" data-summary="' + esc(x.id) + '"><div class="tr-ch-top"><span class="k-tag">' + esc(GROUP[x.group]) + '</span>' +
        (x.city !== 'both' ? '<span class="k-tag is-info">' + esc(CITY[x.city]) + '</span>' : '') + draftTag(x) + (p.read[sref(x)] ? '<span class="k-tag is-good">' + icon('check') + 'Citit</span>' : '') + '</div>' +
        '<h4>' + esc(x.name) + '</h4><p>' + esc(x.what || '') + '</p>' + ((x.benefits || []).length ? '<ul class="tr-mini">' + x.benefits.slice(0, 3).map((b) => '<li>' + icon('check') + esc(b) + '</li>').join('') + '</ul>' : '') + '</button>').join('') + '</div>'
        : K.empty('sparkles', isAdmin() ? 'Niciun tratament aici' : 'Tratamentele sunt în pregătire', ''));
  }
  function openSummary(id) {
    const x = schemeOf(id);
    if (!x) return;
    const ref = sref(x);
    const prices = (x.prices || []).map(priceOf).filter(Boolean);
    const combos = (x.combos || []).map(schemeOf).filter(Boolean);
    const phone = (x.phone || []).length ? x.phone : x.say;
    const d = K.drawer({
      title: x.name, icon: 'sparkles', width: 640, subtitle: esc(GROUP[x.group]) + (x.city !== 'both' ? ' · ' + esc(CITY[x.city]) : '') + (x.minutes ? ' · ' + x.minutes + ' min' : ''),
      body: '<div class="ac-read tr-scheme">' + (x.what ? '<p class="ac-sum">' + esc(x.what) + '</p>' : '') +
        sec('Pentru cine', ul(x.forWho)) + sec('Ce câștigă', ul(x.benefits)) + sec('Cum o spui la telefon', says(phone)) +
        sec('Se combină cu', combos.length ? '<div class="tr-chips">' + combos.map((c) => '<button type="button" class="k-chip" data-goto-sum="' + esc(c.id) + '">' + esc(c.name) + '</button>').join('') + '</div>' : '') +
        sec('Bine de știut', '<ul>' + [x.minutes ? 'Durează ' + x.minutes + ' de minute.' : '', x.sessions ? 'De obicei ' + x.sessions + ' ședințe' + (x.interval ? ', ' + x.interval : '') + '.' : '', x.city !== 'both' ? CITY[x.city] + '.' : 'În ambele clinici.']
          .filter(Boolean).map((t) => '<li>' + esc(t) + '</li>').join('') + prices.map((pr) => '<li>' + esc(pr.name) + ': ' + lei(pr.price) + ' preț de listă (prețul de campanie îl iei din Oferte active)</li>').join('') + '</ul>') +
        mediaHtml(x.media) + '</div>',
      footer: (isAdmin() ? '<button type="button" class="k-btn is-ghost" data-s-edit>' + icon('pen') + 'Editează</button>' : '') + '<span class="k-grow"></span>' +
        (mine().read[ref] ? '<span class="k-tag is-good tr-readtag">' + icon('check') + 'Citit</span>' : '<button type="button" class="k-btn is-primary" data-did>' + icon('check') + 'Am citit</button>'),
      onMount(el) {
        el.addEventListener('click', (e) => { const g = e.target.closest('[data-goto-sum]'); if (g) { d.close(); setTimeout(() => openSummary(g.dataset.gotoSum), 180); } });
        const did = el.querySelector('[data-did]');
        if (did) did.addEventListener('click', (ev) => K.busy(ev.currentTarget, async () => {
          try { const j = await post({ action: 'read', ref }); setMine(j.progress); did.outerHTML = '<span class="k-tag is-good tr-readtag">' + icon('check') + 'Citit</span>'; render(); }
          catch (err) { K.ui().toast(K.errText(err), 'error'); }
        }));
        const ed = el.querySelector('[data-s-edit]'); if (ed) ed.addEventListener('click', () => { d.close(); setTimeout(() => editScheme(x), 180); });
      },
    });
  }
  // the combinations, in the page (cosmeticians: when, in what order; reception: why they go together)
  function combosHtml() {
    const list = D().combos || [];
    const name = (id) => (schemeOf(id) || { name: id }).name;
    const full = viewRole() === 'cosmetician';
    return (isAdmin() ? '<div class="tr-bar"><span class="k-grow"></span><button type="button" class="k-btn is-outline is-sm" data-cb-new>' + icon('plus') + 'Combinație nouă</button></div>' : '') +
      (list.length ? '<div class="tr-combos">' + list.map((c) => '<article class="tr-combo"><header><b>' + esc(name(c.a)) + ' + ' + esc(name(c.b)) + '</b>' + draftTag(c) +
        (isAdmin() ? '<button type="button" class="k-icon-btn" data-cb-edit="' + esc(c.id) + '" aria-label="Editează">' + icon('pen') + '</button>' : '') + '</header>' +
        (c.why ? '<p>' + esc(c.why) + '</p>' : '') +
        '<dl>' + (full ? [['În aceeași zi', c.sameDay], ['Ordinea', c.order], ['Pauza între ele', c.gap], ['Din pachetele', c.packs]] : [['Din pachetele', c.packs]])
          .map(([k, v]) => (v ? '<div><dt>' + k + '</dt><dd>' + esc(v) + '</dd></div>' : isAdmin() && k !== 'Din pachetele' ? '<div><dt>' + k + '</dt><dd class="tr-missing-dd">De completat</dd></div>' : '')).join('') + '</dl></article>').join('') + '</div>'
        : K.empty('layers', isAdmin() ? 'Nicio combinație încă' : 'Combinațiile sunt în pregătire', ''));
  }
  const linesField = (label, key, list, rows, hint) => K.field(label, '<textarea data-x="' + key + '" rows="' + (rows || 4) + '" placeholder="Un rând pe linie">' + esc((list || []).join('\n')) + '</textarea>', 'full', hint);
  const getLines = (el, key) => el.querySelector('[data-x="' + key + '"]').value.split('\n').map((s) => s.trim()).filter(Boolean);
  const getX = (el, key) => el.querySelector('[data-x="' + key + '"]').value.trim();
  function checks(name, all, on) {
    const set = new Set(on || []);
    return '<div class="tr-checks">' + all.map(([v, l]) => '<label class="k-chip tr-check"><input type="checkbox" data-' + name + '="' + esc(v) + '"' + (set.has(v) ? ' checked' : '') + '><span>' + esc(l) + '</span></label>').join('') + '</div>';
  }
  function editScheme(s0) {
    const s = Object.assign({ id: '', name: '', group: 'corp', city: 'both', minutes: 0, prices: [], what: '', forWho: [], benefits: [], phone: [], contra: [], steps: [], settings: [], say: [], after: [], sessions: '', interval: '', combos: [], media: [], verified: false }, s0 ? JSON.parse(JSON.stringify(s0)) : {});
    let media;
    const others = (D().schemes || []).filter((x) => x.id !== s.id);
    const d = K.drawer({
      title: s0 ? 'Editează · ' + s.name : 'Schemă nouă', icon: 'pen', width: 760,
      body: '<div class="k-form">' + K.field('Tratamentul', '<input data-x="name" maxlength="80" value="' + esc(s.name) + '" placeholder="ex. Liposonix">', 'full') +
        K.field('Categoria', '<select data-x="group">' + K.options(Object.keys(GROUP).map((k) => [k, GROUP[k]]), s.group) + '</select>') +
        K.field('Orașul', '<select data-x="city">' + K.options(Object.keys(CITY).map((k) => [k, CITY[k]]), s.city) + '</select>') +
        K.field('Durata (minute)', '<input data-x="minutes" type="number" min="0" max="600" value="' + esc(s.minutes || '') + '">') +
        K.field('Ședințe', '<input data-x="sessions" maxlength="40" value="' + esc(s.sessions) + '" placeholder="ex. 6-8">') +
        K.field('Interval', '<input data-x="interval" maxlength="60" value="' + esc(s.interval) + '" placeholder="ex. 2 pe săptămână">', 'full') +
        K.field('Ce e', '<textarea data-x="what" rows="2" maxlength="600">' + esc(s.what) + '</textarea>', 'full') +
        linesField('Pentru cine', 'forWho', s.forWho, 3) + linesField('Ce câștigă (pentru recepție)', 'benefits', s.benefits, 3) + linesField('Cum o spune recepția la telefon', 'phone', s.phone, 3) + linesField('Contraindicații', 'contra', s.contra, 6) + linesField('Pașii', 'steps', s.steps, 6) +
        linesField('Setările aparatului', 'settings', s.settings, 4, 'Parametrii pe care îi folosiți voi, pe zone.') + linesField('Ce îi spui clientei', 'say', s.say, 3) + linesField('După tratament', 'after', s.after, 4) + '</div>' +
        '<h4 class="tr-sub">' + icon('tag') + 'Prețuri de listă</h4>' + checks('price', (D().prices || []).filter((p) => p.group === s.group || (s.prices || []).includes(p.id)).map((p) => [p.id, p.name + ' · ' + K.lei(p.price)]), s.prices) +
        '<h4 class="tr-sub">' + icon('layers') + 'Se combină cu</h4>' + checks('combo', others.map((x) => [x.id, x.name]), s.combos) +
        '<h4 class="tr-sub">' + icon('image') + 'Poze și video</h4><div data-media></div>',
      footer: (s0 ? '<button type="button" class="k-btn is-danger is-outline" data-del>' + icon('trash') + 'Șterge</button>' : '') + '<span class="k-grow"></span>' +
        K.toggle('verified', s.verified, 'Verificat') + '<button type="button" class="k-btn is-primary" data-save>' + icon('check') + 'Salvează</button>',
      onMount(el) {
        media = mediaEditor(el.querySelector('[data-media]'), s.media);
        el.querySelector('[data-save]').addEventListener('click', (ev) => K.busy(ev.currentTarget, async () => {
          const item = Object.assign({}, s, { name: getX(el, 'name'), group: getX(el, 'group'), city: getX(el, 'city'), minutes: Number(getX(el, 'minutes')) || 0, sessions: getX(el, 'sessions'), interval: getX(el, 'interval'), what: getX(el, 'what'),
            forWho: getLines(el, 'forWho'), benefits: getLines(el, 'benefits'), phone: getLines(el, 'phone'), contra: getLines(el, 'contra'), steps: getLines(el, 'steps'), settings: getLines(el, 'settings'), say: getLines(el, 'say'), after: getLines(el, 'after'),
            prices: [...el.querySelectorAll('[data-price]:checked')].map((x) => x.dataset.price), combos: [...el.querySelectorAll('[data-combo]:checked')].map((x) => x.dataset.combo),
            media: media.get(), verified: el.querySelector('input[name=verified]').checked });
          if (!item.name) { K.ui().toast('Scrie numele tratamentului.', 'error'); return; }
          try { await save({ upsert: { kind: 'scheme', item } }); d.close(); K.ui().toast('Schemă salvată.', 'success'); K.reload(); }
          catch (err) { K.ui().toast(K.errText(err), 'error'); }
        }));
        const del = el.querySelector('[data-del]');
        if (del) del.addEventListener('click', async () => {
          if (!(await K.ui().confirm({ title: 'Ștergi schema „' + s.name + '”?', message: 'Dispare din Traininguri pentru toată echipa.', confirmText: 'Șterge', danger: true }))) return;
          try { await save({ remove: { kind: 'scheme', id: s.id } }); d.close(); K.ui().toast('Ștearsă.', 'success'); K.reload(); }
          catch (err) { K.ui().toast(K.errText(err), 'error'); }
        });
      },
    });
  }

  function editCombo(c0) {
    const c = Object.assign({ id: '', a: '', b: '', why: '', packs: '', sameDay: '', order: '', gap: '', verified: false }, c0 || {});
    const opts = [['', 'Alege…']].concat((D().schemes || []).map((s) => [s.id, s.name]));
    const d = K.drawer({
      title: c0 ? 'Editează combinația' : 'Combinație nouă', icon: 'layers', width: 560,
      body: '<div class="k-form">' + K.field('Tratamentul 1', '<select data-x="a">' + K.options(opts, c.a) + '</select>') + K.field('Tratamentul 2', '<select data-x="b">' + K.options(opts, c.b) + '</select>') +
        K.field('De ce merg împreună', '<textarea data-x="why" rows="2" maxlength="300">' + esc(c.why) + '</textarea>', 'full') +
        K.field('În aceeași zi?', '<input data-x="sameDay" maxlength="60" value="' + esc(c.sameDay) + '" placeholder="ex. Da, în aceeași vizită">', 'full') +
        K.field('Ordinea', '<input data-x="order" maxlength="140" value="' + esc(c.order) + '" placeholder="ex. Întâi cavitația, apoi EMS">', 'full') +
        K.field('Pauza între ele', '<input data-x="gap" maxlength="60" value="' + esc(c.gap) + '" placeholder="ex. Fără pauză">', 'full') +
        K.field('Din pachetele', '<input data-x="packs" maxlength="200" value="' + esc(c.packs) + '">', 'full') + '</div>',
      footer: (c0 ? '<button type="button" class="k-btn is-danger is-outline" data-del>' + icon('trash') + 'Șterge</button>' : '') + '<span class="k-grow"></span>' + K.toggle('verified', c.verified, 'Verificat') +
        '<button type="button" class="k-btn is-primary" data-save>' + icon('check') + 'Salvează</button>',
      onMount(el) {
        el.querySelector('[data-save]').addEventListener('click', (ev) => K.busy(ev.currentTarget, async () => {
          const item = Object.assign({}, c, { a: getX(el, 'a'), b: getX(el, 'b'), why: getX(el, 'why'), sameDay: getX(el, 'sameDay'), order: getX(el, 'order'), gap: getX(el, 'gap'), packs: getX(el, 'packs'), verified: el.querySelector('input[name=verified]').checked });
          if (!item.a || !item.b || item.a === item.b) { K.ui().toast('Alege două tratamente diferite.', 'error'); return; }
          try { await save({ upsert: { kind: 'combo', item } }); d.close(); K.ui().toast('Salvat.', 'success'); K.reload(); }
          catch (err) { K.ui().toast(K.errText(err), 'error'); }
        }));
        const del = el.querySelector('[data-del]');
        if (del) del.addEventListener('click', async () => {
          if (!(await K.ui().confirm({ title: 'Ștergi combinația?', confirmText: 'Șterge', danger: true }))) return;
          try { await save({ remove: { kind: 'combo', id: c.id } }); d.close(); K.reload(); }
          catch (err) { K.ui().toast(K.errText(err), 'error'); }
        });
      },
    });
  }

  // ------------------------------------------------------------------ the offer maths (Ghidul consultației)
  // lines: [{ price (id), sessions, zone, interval }] → totals, the 4 offers, the minimum check
  function offer(lines, low) {
    const R = rules();
    const rows = lines.map((l) => { const p = priceOf(l.price); const s = Number(l.sessions) || 0; return { l, p, s, unit: p ? p.price : 0, sub: p ? s * p.price : 0, half: s / 2, halfSub: p ? (s / 2) * p.price : 0 }; }).filter((r) => r.p);
    const total = rows.reduce((a, r) => a + r.sub, 0), half = rows.reduce((a, r) => a + r.halfSub, 0);
    const groups = new Set(rows.map((r) => r.p.group));
    const kind = groups.has('corp') ? 'corp' : groups.has('fata') ? 'fata' : groups.has('epilare') ? 'epilare' : '';
    const min = kind === 'corp' ? R.bodyMin : kind === 'fata' ? R.faceMin : 0;
    const k1 = 1 - R.full / 100, k2 = 1 - R.inst / 100;
    return { R, rows, total, half, kind, min, short: min && total < min && !low ? min - total : 0,
      pages: [
        { page: 2, title: 'Pachet complet, plată integrală', off: R.full, base: total, k: k1, pay: total * k1, parts: 0 },
        { page: 3, title: 'Pachet complet, ' + R.parts + ' tranșe', off: R.inst, base: total, k: k2, pay: total * k2, parts: R.parts },
        { page: 4, title: 'Jumătate de pachet, plată integrală', off: R.full, base: half, k: k1, pay: half * k1, parts: 0 },
        { page: 5, title: 'Jumătate de pachet, ' + R.parts + ' tranșe', off: R.inst, base: half, k: k2, pay: half * k2, parts: R.parts },
      ] };
  }
  const kDec = (k) => k.toFixed(2).replace('.', ',');
  function offersHtml(o) {
    return '<div class="tr-offers">' + o.pages.map((p) => '<article class="tr-offer"><header><span>Pagina ' + p.page + '</span><b>-' + dec(p.off) + '%</b></header><h5>' + esc(p.title) + '</h5>' +
      '<div class="tr-offer-pay">' + lei(p.pay) + '</div>' + (p.parts ? '<div class="tr-offer-part">' + lei(p.pay / p.parts) + ' pe tranșă</div>' : '') +
      '<small>' + dec(p.base) + ' × ' + kDec(p.k) + (p.parts ? ', apoi ÷ ' + p.parts : '') + '</small></article>').join('') + '</div>';
  }
  function programTable(o) {
    if (!o.rows.length) return '';
    return '<div class="tr-table-wrap"><table class="tr-table"><thead><tr><th>Procedura</th><th>Ședințe</th><th>Preț listă</th><th>Subtotal</th><th>½ pachet</th></tr></thead><tbody>' +
      o.rows.map((r) => '<tr><td><b>' + esc(r.p.name) + '</b>' + (r.l.zone || r.l.interval ? '<small>' + esc([r.l.zone, r.l.interval].filter(Boolean).join(' · ')) + '</small>' : '') + '</td><td>' + dec(r.s) + '</td><td>' + lei(r.unit) + '</td><td>' + lei(r.sub) + '</td><td>' + dec(r.half) + ' · ' + lei(r.halfSub) + '</td></tr>').join('') +
      '</tbody><tfoot><tr><td colspan="3">Total la preț de listă</td><td>' + lei(o.total) + '</td><td>' + lei(o.half) + '</td></tr></tfoot></table></div>';
  }
  const minNote = (o, low) => (o.kind === 'corp' || o.kind === 'fata'
    ? (o.short ? '<p class="tr-warn">' + icon('alert') + 'Programul pentru ' + (o.kind === 'corp' ? 'corp' : 'față') + ' are minimum ' + lei(o.min) + ' la preț de listă. Mai lipsesc ' + lei(o.short) + '.</p>'
      : low && o.total < o.min ? '<p class="tr-note">' + icon('info') + 'Sub minim, pentru că e o clientă cu foarte puțină grăsime (excepția din ghid).</p>' : '') : '');

  // ------------------------------------------------------------------ Cazuri
  function casesHtml() {
    const all = D().cases || [];
    const g = A.caseGroup;
    const list = all.filter((c) => g === 'all' || c.group === g);
    const p = mine();
    const drafts = all.filter((c) => !c.verified).length;
    return '<div class="tr-bar">' + K.seg('cgroup', [['all', 'Toate'], ['fata', 'Față'], ['corp', 'Corp'], ['epilare', 'Epilare']], g) +
      (isAdmin() ? '<span class="k-grow"></span>' + (drafts ? '<span class="k-tag is-warn">' + drafts + ' de verificat</span>' : '') + '<button type="button" class="k-btn is-outline is-sm" data-case-new>' + icon('plus') + 'Caz nou</button>' : '') + '</div>' +
      (isAdmin() && drafts ? '<p class="tr-note">' + icon('info') + 'Cazurile le-am scris ca exercițiu. Verifică recomandarea fiecăruia, apoi „Marchează verificat” ca să le vadă echipa.</p>' : '') +
      (list.length ? '<div class="ac-grid">' + list.map((c) => {
        const r = p.cases[c.id];
        return '<button type="button" class="ac-ch tr-card" data-case="' + esc(c.id) + '"><div class="tr-ch-top"><span class="k-tag">' + esc(GROUP[c.group]) + '</span>' +
          (c.city !== 'both' ? '<span class="k-tag is-info">' + esc(c.city === 'tm' ? 'Timișoara' : 'Arad') + '</span>' : '') + draftTag(c) +
          (r ? '<span class="k-tag ' + (r.everOk ? 'is-good">' + icon('check') + 'Rezolvat' : 'is-warn">Mai încearcă') + '</span>' : '') + '</div>' +
          '<h4>' + esc(c.title) + '</h4><p>' + esc(c.wants || '') + '</p></button>';
      }).join('') + '</div>' : K.empty('users', isAdmin() ? 'Niciun caz aici' : 'Cazurile sunt în pregătire', ''));
  }
  function solutionHtml(c) {
    const o = offer(c.program || [], c.low);
    return (c.program && c.program.length ? sec('Programul recomandat', programTable(o) + minNote(o, c.low)) + sec('Cele 4 oferte', offersHtml(o)) : '') +
      sec('Durata și rezultatul estimat', (c.duration || c.result) ? '<p>' + [c.duration ? '<b>' + esc(c.duration) + '</b>' : '', esc(c.result || '')].filter(Boolean).join(' · ') + '</p>' : '') +
      sec('Cum îi prezinți', says(c.present)) + sec('La ce să fii atentă', ul(c.watch), 'is-bad');
  }
  function openCase(id, fresh) {
    const c0 = caseOf(id);
    if (!c0) return;
    let c = c0;
    const p = mine();
    const tried = p.cases[c.id];
    let state = isAdmin() ? 'admin' : tried && !fresh && c.program !== undefined ? 'solved' : 'ask';
    let picked = tried ? tried.choice : null, right = tried ? tried.ok : null;
    const d = K.drawer({
      title: c.title, icon: 'users', width: 760, subtitle: esc(GROUP[c.group]) + (c.city !== 'both' ? ' · ' + (c.city === 'tm' ? 'Timișoara' : 'Arad') : '') + (isAdmin() && !c.verified ? ' · ciornă' : ''),
      body: '<div class="ac-read tr-case" data-cs></div>',
      footer: '<span class="k-grow"></span>' + (isAdmin() ? '<button type="button" class="k-btn is-ghost" data-c-edit>' + icon('pen') + 'Editează</button><button type="button" class="k-btn ' + (c.verified ? 'is-ghost' : 'is-outline') + '" data-c-ver>' + icon(c.verified ? 'x' : 'check') + (c.verified ? 'Scoate verificarea' : 'Marchează verificat') + '</button>' : '') +
        '<button type="button" class="k-btn is-outline" data-c-calc' + ((c.program || []).length ? '' : ' hidden') + '>' + icon('percent') + 'În calculator</button>',
      onMount(el) {
        const box = el.querySelector('[data-cs]');
        const paint = () => {
          const reveal = state !== 'ask';
          // the drawing: only her problem until she answers, the plan at work after
          box.innerHTML = (window.C360CaseArt ? window.C360CaseArt.html(c, reveal) : '') + sec('Clienta', ul(c.profile) + (c.wants ? '<blockquote class="ac-say">' + esc(c.wants) + '</blockquote>' : '')) + mediaHtml(c.media) +
            sec('Ce o întrebi la consultație', ul(c.ask)) +
            '<section class="tr-sec"><h5>Ce îi recomanzi?</h5><div class="tr-choices">' + c.options.map((o, i) => {
              const cls = reveal && o.ok !== undefined ? (o.ok ? ' is-right' : i === picked ? ' is-wrong' : '') : (i === picked ? ' is-on' : '');
              return '<button type="button" class="tr-opt' + cls + '" data-pick="' + i + '"' + (reveal ? ' disabled' : '') + '><i></i><span>' + esc(o.text) + (reveal && o.why ? '<small>' + esc(o.why) + '</small>' : '') + '</span></button>';
            }).join('') + '</div>' + (state === 'solved' && picked != null ? '<p class="tr-verdict ' + (right ? 'is-good">' + icon('check') + 'Corect!' : 'is-bad">' + icon('x') + 'Nu chiar. Citește de ce, mai jos.') + '</p>' : '') +
            (state === 'solved' ? '<button type="button" class="k-btn is-ghost is-sm" data-again>' + icon('refresh') + 'Încearcă din nou</button>' : '') + '</section>' +
            (reveal ? solutionHtml(c) : '');
          const calc = el.querySelector('[data-c-calc]'); if (calc) calc.hidden = !reveal || !(c.program || []).length;
        };
        paint();
        box.addEventListener('click', (e) => {
          if (e.target.closest('[data-again]')) { state = 'ask'; picked = null; paint(); return; }
          const b = e.target.closest('[data-pick]');
          if (!b || state !== 'ask') return;
          picked = +b.dataset.pick;
          K.busy(b, async () => {
            try { const j = await post({ action: 'case', id: c.id, choice: picked }); setMine(j.progress); c = j.case; right = j.right; state = 'solved'; paint(); render(); }
            catch (err) { K.ui().toast(K.errText(err), 'error'); }
          });
        });
        el.querySelector('[data-c-calc]').addEventListener('click', () => { d.close(); toCalc(c); });
        const ed = el.querySelector('[data-c-edit]'); if (ed) ed.addEventListener('click', () => { d.close(); setTimeout(() => editCase(c), 180); });
        const ver = el.querySelector('[data-c-ver]');
        if (ver) ver.addEventListener('click', (ev) => K.busy(ev.currentTarget, async () => {
          try { await save({ upsert: { kind: 'case', item: Object.assign({}, c, { verified: !c.verified }) } }); d.close(); K.ui().toast(c.verified ? 'Scos de la echipă.' : 'Verificat. Îl vede toată echipa.', 'success'); K.reload(); }
          catch (err) { K.ui().toast(K.errText(err), 'error'); }
        }));
      },
    });
  }
  function priceSelect(attr, sel, city) {
    const groups = Object.keys(GROUP).map((g) => '<optgroup label="' + esc(GROUP[g]) + '">' + (D().prices || []).filter((p) => p.group === g && (!city || p.city === 'both' || p.city === city || p.id === sel))
      .map((p) => '<option value="' + esc(p.id) + '"' + (p.id === sel ? ' selected' : '') + '>' + esc(p.name) + ' · ' + esc(K.lei(p.price)) + (p.city !== 'both' && !city ? ' (' + (p.city === 'tm' ? 'TM' : 'AR') + ')' : '') + '</option>').join('') + '</optgroup>').join('');
    return '<select ' + attr + '><option value="">Alege procedura…</option>' + groups + '</select>';
  }
  function editCase(c0) {
    const c = Object.assign({ id: '', title: '', group: 'corp', city: 'both', profile: [], wants: '', ask: [], options: [{ text: '', ok: true, why: '' }, { text: '', ok: false, why: '' }, { text: '', ok: false, why: '' }], program: [], low: false, duration: '', result: '', present: [], watch: [], media: [], verified: false }, c0 ? JSON.parse(JSON.stringify(c0)) : {});
    let media;
    const d = K.drawer({
      title: c0 ? 'Editează cazul' : 'Caz nou', icon: 'pen', width: 780,
      body: '<div class="k-form">' + K.field('Titlul', '<input data-x="title" maxlength="140" value="' + esc(c.title) + '" placeholder="ex. 50 de ani, riduri și piele lăsată">', 'full') +
        K.field('Categoria', '<select data-x="group">' + K.options(Object.keys(GROUP).map((k) => [k, GROUP[k]]), c.group) + '</select>') +
        K.field('Orașul', '<select data-x="city">' + K.options([['both', 'Oricare'], ['tm', 'Timișoara'], ['ar', 'Arad']], c.city) + '</select>') +
        linesField('Clienta', 'profile', c.profile, 3) + K.field('Ce își dorește', '<input data-x="wants" maxlength="300" value="' + esc(c.wants) + '">', 'full') + linesField('Ce o întrebi', 'ask', c.ask, 3) + '</div>' +
        '<h4 class="tr-sub">' + icon('listCheck') + 'Variantele (bifa = cea corectă)</h4><div data-opts></div><button type="button" class="k-btn is-ghost is-sm" data-opt-add>' + icon('plus') + 'Variantă</button>' +
        '<h4 class="tr-sub">' + icon('percent') + 'Programul corect</h4><div data-prog></div><button type="button" class="k-btn is-ghost is-sm" data-line-add>' + icon('plus') + 'Procedură</button>' +
        '<div class="k-form">' + '<div class="k-field full">' + K.toggle('low', c.low, 'Excepție: foarte puțină grăsime (programul poate fi sub minim)') + '</div>' +
        K.field('Durata estimată', '<input data-x="duration" maxlength="60" value="' + esc(c.duration) + '">') + K.field('Rezultatul estimat', '<input data-x="result" maxlength="300" value="' + esc(c.result) + '">') +
        linesField('Cum îi prezinți', 'present', c.present, 3) + linesField('La ce să fii atentă', 'watch', c.watch, 3) + '</div>' +
        '<h4 class="tr-sub">' + icon('image') + 'Poze</h4><div data-media></div>',
      footer: (c0 ? '<button type="button" class="k-btn is-danger is-outline" data-del>' + icon('trash') + 'Șterge</button>' : '') + '<span class="k-grow"></span>' + K.toggle('verified', c.verified, 'Verificat') +
        '<button type="button" class="k-btn is-primary" data-save>' + icon('check') + 'Salvează</button>',
      onMount(el) {
        media = mediaEditor(el.querySelector('[data-media]'), c.media);
        const oBox = el.querySelector('[data-opts]'), pBox = el.querySelector('[data-prog]');
        const readAll = () => {
          oBox.querySelectorAll('[data-oi]').forEach((r) => { const o = c.options[+r.dataset.oi]; o.text = r.querySelector('[data-ot]').value; o.why = r.querySelector('[data-ow]').value; o.ok = r.querySelector('[data-ook]').checked; });
          pBox.querySelectorAll('[data-li]').forEach((r) => { const l = c.program[+r.dataset.li]; l.price = r.querySelector('[data-lp]').value; l.sessions = Number(String(r.querySelector('[data-ls]').value).replace(',', '.')) || 0; l.zone = r.querySelector('[data-lz]').value; l.interval = r.querySelector('[data-lv]').value; });
        };
        const paint = () => {
          oBox.innerHTML = c.options.map((o, i) => '<div class="tr-qed" data-oi="' + i + '"><label class="tr-qed-o"><input type="radio" name="ook" data-ook' + (o.ok ? ' checked' : '') + '><input data-ot maxlength="300" value="' + esc(o.text) + '" placeholder="Varianta ' + (i + 1) + '">' +
            (c.options.length > 2 ? '<button type="button" class="k-icon-btn" data-opt-rm="' + i + '">' + icon('x') + '</button>' : '') + '</label><input data-ow maxlength="300" value="' + esc(o.why) + '" placeholder="De ce (apare după răspuns)"></div>').join('');
          pBox.innerHTML = c.program.map((l, i) => '<div class="tr-line" data-li="' + i + '">' + priceSelect('data-lp', l.price, '') +
            '<input data-ls inputmode="decimal" value="' + esc(l.sessions || '') + '" placeholder="Ședințe"><input data-lz maxlength="60" value="' + esc(l.zone || '') + '" placeholder="Zona"><input data-lv maxlength="60" value="' + esc(l.interval || '') + '" placeholder="Interval">' +
            '<button type="button" class="k-icon-btn" data-line-rm="' + i + '">' + icon('trash') + '</button></div>').join('') || '<p class="k-muted">Fără program (de ex. o contraindicație).</p>';
        };
        paint();
        el.addEventListener('click', (ev) => {
          const b = ev.target.closest('[data-opt-add],[data-opt-rm],[data-line-add],[data-line-rm]');
          if (!b) return;
          readAll();
          if (b.hasAttribute('data-opt-add') && c.options.length < 5) c.options.push({ text: '', ok: false, why: '' });
          if (b.dataset.optRm) c.options.splice(+b.dataset.optRm, 1);
          if (b.hasAttribute('data-line-add')) c.program.push({ price: '', sessions: 1, zone: '', interval: '' });
          if (b.dataset.lineRm) c.program.splice(+b.dataset.lineRm, 1);
          paint();
        });
        el.querySelector('[data-save]').addEventListener('click', (ev) => K.busy(ev.currentTarget, async () => {
          readAll();
          const item = Object.assign({}, c, { title: getX(el, 'title'), group: getX(el, 'group'), city: getX(el, 'city'), profile: getLines(el, 'profile'), wants: getX(el, 'wants'), ask: getLines(el, 'ask'),
            options: c.options.filter((o) => o.text.trim()), program: c.program.filter((l) => l.price), low: el.querySelector('input[name=low]').checked, duration: getX(el, 'duration'), result: getX(el, 'result'),
            present: getLines(el, 'present'), watch: getLines(el, 'watch'), media: media.get(), verified: el.querySelector('input[name=verified]').checked });
          if (!item.title || item.options.length < 2) { K.ui().toast('Scrie titlul și cel puțin două variante.', 'error'); return; }
          try { await save({ upsert: { kind: 'case', item } }); d.close(); K.ui().toast('Caz salvat.', 'success'); K.reload(); }
          catch (err) { K.ui().toast(K.errText(err), 'error'); }
        }));
        const del = el.querySelector('[data-del]');
        if (del) del.addEventListener('click', async () => {
          if (!(await K.ui().confirm({ title: 'Ștergi cazul?', confirmText: 'Șterge', danger: true }))) return;
          try { await save({ remove: { kind: 'case', id: c.id } }); d.close(); K.reload(); }
          catch (err) { K.ui().toast(K.errText(err), 'error'); }
        });
      },
    });
  }

  // ------------------------------------------------------------------ Calculator ofertă
  const CALC_KEY = 'c360_calc';
  let C = null;
  function calcState() {
    if (C) return C;
    try { C = JSON.parse(localStorage.getItem(CALC_KEY) || 'null'); } catch (e) { C = null; }
    if (!C || !Array.isArray(C.lines)) C = { city: (K.data && K.data.me && K.data.me.location === 'Arad') ? 'ar' : 'tm', lines: [{ price: '', sessions: 1, zone: '', interval: '' }], low: false, duration: '', result: '' };
    return C;
  }
  const keepCalc = () => { try { localStorage.setItem(CALC_KEY, JSON.stringify(C)); } catch (e) { /* private mode */ } };
  function toCalc(c) {
    C = { city: c.city === 'ar' ? 'ar' : 'tm', lines: (c.program || []).map((l) => Object.assign({}, l)), low: !!c.low, duration: c.duration || '', result: c.result || '' };
    keepCalc();
    A.tab = 'vanzari';
    if (isAdmin()) A.role = 'cosmetician';
    A.pick['vanzari:' + viewRole()] = 'calc';
    const v = panel.querySelector('[data-view]'); v.innerHTML = '';
    render();
    panel.scrollIntoView({ block: 'start' });
  }
  function calcHtml() {
    const s = calcState();
    return '<div class="tr-calc" data-calc>' +
      '<div class="tr-bar">' + K.seg('ccity', [['tm', 'Timișoara', 'pin'], ['ar', 'Arad', 'pin']], s.city) + '<span class="k-grow"></span>' +
      (isAdmin() ? '<button type="button" class="k-btn is-ghost is-sm" data-prices>' + icon('tag') + 'Prețuri și reguli</button>' : '') +
      '<button type="button" class="k-btn is-ghost is-sm" data-calc-clear>' + icon('refresh') + 'Golește</button></div>' +
      '<div class="tr-lines" data-lines>' + linesHtml() + '</div>' +
      '<button type="button" class="k-btn is-outline is-sm" data-calc-add>' + icon('plus') + 'Adaugă procedură</button>' +
      '<div data-calc-out></div>' +
      '<div class="k-form tr-calc-extra"><div class="k-field full">' + K.toggle('clow', s.low, 'Clientă cu foarte puțină grăsime (programul poate fi sub minim)') + '</div>' +
      K.field('Durata estimată', '<input data-cx="duration" maxlength="60" value="' + esc(s.duration) + '" placeholder="ex. 3 luni">') +
      K.field('Rezultatul estimat', '<input data-cx="result" maxlength="300" value="' + esc(s.result) + '" placeholder="ex. abdomen mai plat și mai ferm">') + '</div>' +
      '<div class="tr-calc-actions"><button type="button" class="k-btn is-ghost" data-calc-copy>' + icon('file') + 'Copiază</button><button type="button" class="k-btn is-primary" data-calc-client>' + icon('user') + 'Salvează la clientă</button></div></div>';
  }
  function linesHtml() {
    const s = calcState();
    return s.lines.map((l, i) => '<div class="tr-cline" data-ci="' + i + '"><div class="tr-cline-main">' + priceSelect('data-cp', l.price, s.city) +
      '<button type="button" class="k-icon-btn" data-cl-rm="' + i + '" aria-label="Scoate">' + icon('trash') + '</button></div>' +
      '<div class="tr-cline-sub"><label><span>Ședințe</span><input data-cs inputmode="decimal" value="' + esc(l.sessions === '' ? '' : l.sessions) + '"></label>' +
      '<label><span>Zona</span><input data-cz maxlength="60" value="' + esc(l.zone || '') + '" placeholder="abdomen"></label>' +
      '<label><span>Interval</span><input data-cv maxlength="60" value="' + esc(l.interval || '') + '" placeholder="1 pe săptămână"></label>' +
      '<div class="tr-cline-sum" data-csum="' + i + '"></div></div></div>').join('');
  }
  function paintCalcResults() {
    const out = panel.querySelector('[data-calc-out]');
    if (!out) return;
    const s = calcState();
    const o = offer(s.lines, s.low);
    s.lines.forEach((l, i) => { const p = priceOf(l.price); const cell = panel.querySelector('[data-csum="' + i + '"]'); if (cell) cell.innerHTML = p ? dec(Number(l.sessions) || 0) + ' × ' + lei(p.price) + ' = <b>' + lei((Number(l.sessions) || 0) * p.price) + '</b>' : ''; });
    const wrongCity = s.lines.map((l) => priceOf(l.price)).filter((p) => p && p.city !== 'both' && p.city !== s.city);
    out.innerHTML = o.rows.length
      ? '<div class="tr-total"><span>Total la preț de listă</span><b>' + lei(o.total) + '</b><small>Jumătate de pachet: ' + lei(o.half) + '</small></div>' +
        (wrongCity.length ? '<p class="tr-warn">' + icon('alert') + esc(wrongCity.map((p) => p.name).join(', ')) + ': doar în ' + (wrongCity[0].city === 'tm' ? 'Timișoara' : 'Arad') + '.</p>' : '') +
        minNote(o, s.low) + offersHtml(o)
      : '<p class="k-muted tr-calc-empty">Alege procedurile și numărul de ședințe. Totalul și cele 4 oferte apar aici.</p>';
  }
  function onCalcInput(e) {
    const t = e.target;
    if (!t.closest || !t.closest('[data-calc]')) return;
    const s = calcState();
    const row = t.closest('[data-ci]');
    if (row) {
      const l = s.lines[+row.dataset.ci];
      if (t.matches('[data-cp]')) l.price = t.value;
      if (t.matches('[data-cs]')) l.sessions = String(t.value).replace(',', '.');
      if (t.matches('[data-cz]')) l.zone = t.value;
      if (t.matches('[data-cv]')) l.interval = t.value;
    }
    if (t.matches('[data-cx]')) s[t.dataset.cx] = t.value;
    if (t.name === 'clow') s.low = t.checked;
    if (t.name === 'ccity' && e.type === 'change') { s.city = t.value; keepCalc(); panel.querySelector('[data-lines]').innerHTML = linesHtml(); }
    keepCalc();
    paintCalcResults();
  }
  function calcText() {
    const s = calcState();
    const o = offer(s.lines, s.low);
    const me = (K.data && K.data.me && K.data.me.name) || '';
    return ['Program recomandat (' + K.dateShort(K.today()) + ', ' + (s.city === 'ar' ? 'Arad' : 'Timișoara') + (me ? ', ' + me : '') + '):']
      .concat(o.rows.map((r) => '• ' + r.p.name + (r.l.zone ? ', ' + r.l.zone : '') + ': ' + dec(r.s) + ' ședințe × ' + lei(r.unit) + ' = ' + lei(r.sub) + (r.l.interval ? ' (' + r.l.interval + ')' : '')))
      .concat(['Total la preț de listă: ' + lei(o.total)], o.pages.map((p) => 'Pagina ' + p.page + ', ' + p.title.toLowerCase() + ' (-' + dec(p.off) + '%): ' + lei(p.pay) + (p.parts ? ', adică ' + lei(p.pay / p.parts) + ' pe tranșă' : '')),
        s.duration ? ['Durata estimată: ' + s.duration] : [], s.result ? ['Rezultat estimat: ' + s.result] : []).join('\n');
  }
  function saveToClient() {
    const s = calcState();
    if (!offer(s.lines, s.low).rows.length) { K.ui().toast('Alege întâi procedurile.', 'error'); return; }
    let picker;
    const d = K.drawer({
      title: 'Salvează la clientă', icon: 'user', width: 520, subtitle: 'Programul și ofertele apar ca notă în fișa ei, la Contacte.',
      body: '<div class="k-form">' + K.field('Clienta', '<input name="cn" maxlength="150" placeholder="Caută după nume sau telefon" autofocus>', 'full') +
        K.field('Telefon', '<input name="cp" type="tel" maxlength="30" placeholder="Doar pentru o clientă nouă">', 'full') + '</div><pre class="tr-pre">' + esc(calcText()) + '</pre>',
      footer: '<span class="k-grow"></span><button type="button" class="k-btn" data-cancel>Renunță</button><button type="button" class="k-btn is-primary" data-save>' + icon('check') + 'Salvează</button>',
      onMount(el) {
        const name = el.querySelector('input[name=cn]'), phone = el.querySelector('input[name=cp]');
        picker = K.clientPicker(name, phone);
        el.querySelector('[data-cancel]').addEventListener('click', () => d.close());
        el.querySelector('[data-save]').addEventListener('click', (ev) => K.busy(ev.currentTarget, async () => {
          try {
            let id = picker.id();
            if (!id) {
              if (!name.value.trim() || !phone.value.trim()) { K.ui().toast('Alege clienta din listă sau scrie numele și telefonul.', 'error'); return; }
              id = (await K.api('/api/portal-contacts', { action: 'create', name: name.value.trim(), phone: phone.value.trim() })).id;
            }
            await K.api('/api/portal-contacts', { action: 'note_add', id, text: calcText() });
            d.close(); K.ui().toast('Salvat în fișa clientei.', 'success');
          } catch (err) { K.ui().toast(K.errText(err), 'error'); }
        }));
      },
    });
  }
  // the owner: list prices (as on centrul360.com) and the offer rules of the guide
  function editPrices() {
    let list = JSON.parse(JSON.stringify(D().prices || []));
    const R = rules();
    const d = K.drawer({
      title: 'Prețuri de listă și reguli', icon: 'tag', width: 820,
      body: '<div class="k-form tr-rules">' + K.field('Minim program corp (lei)', '<input data-r="bodyMin" type="number" min="0" value="' + R.bodyMin + '">') + K.field('Minim program față (lei)', '<input data-r="faceMin" type="number" min="0" value="' + R.faceMin + '">') +
        K.field('Reducere plată integrală (%)', '<input data-r="full" type="number" min="0" max="90" value="' + R.full + '">') + K.field('Reducere în tranșe (%)', '<input data-r="inst" type="number" min="0" max="90" value="' + R.inst + '">') +
        K.field('Număr de tranșe', '<input data-r="parts" type="number" min="1" max="12" value="' + R.parts + '">') + '</div>' +
        '<h4 class="tr-sub">' + icon('tag') + 'Prețuri pe ședință</h4><div data-pl></div><button type="button" class="k-btn is-ghost is-sm" data-pl-add>' + icon('plus') + 'Procedură</button>',
      footer: '<span class="k-grow"></span><button type="button" class="k-btn" data-cancel>Renunță</button><button type="button" class="k-btn is-primary" data-save>' + icon('check') + 'Salvează</button>',
      onMount(el) {
        const box = el.querySelector('[data-pl]');
        const readAll = () => box.querySelectorAll('[data-pi]').forEach((r) => { const p = list[+r.dataset.pi]; p.name = r.querySelector('[data-pn]').value; p.group = r.querySelector('[data-pg]').value; p.city = r.querySelector('[data-pc]').value; p.price = Number(r.querySelector('[data-pp]').value) || 0; });
        const paint = () => {
          box.innerHTML = list.map((p, i) => '<div class="tr-pline" data-pi="' + i + '"><input data-pn maxlength="100" value="' + esc(p.name) + '" placeholder="Procedura">' +
            '<select data-pg>' + K.options(Object.keys(GROUP).map((k) => [k, GROUP[k]]), p.group) + '</select><select data-pc>' + K.options([['both', 'Ambele'], ['tm', 'Timișoara'], ['ar', 'Arad']], p.city) + '</select>' +
            '<div class="k-money"><input data-pp type="number" min="0" value="' + esc(p.price) + '"></div><button type="button" class="k-icon-btn" data-pl-rm="' + i + '">' + icon('trash') + '</button></div>').join('');
        };
        paint();
        el.addEventListener('click', (ev) => {
          const b = ev.target.closest('[data-pl-add],[data-pl-rm]');
          if (!b) return;
          readAll();
          if (b.hasAttribute('data-pl-add')) list.push({ id: '', name: '', group: 'corp', city: 'both', price: 0, minutes: 0 });
          if (b.dataset.plRm) list.splice(+b.dataset.plRm, 1);
          paint();
        });
        el.querySelector('[data-cancel]').addEventListener('click', () => d.close());
        el.querySelector('[data-save]').addEventListener('click', (ev) => K.busy(ev.currentTarget, async () => {
          readAll();
          const r = {}; el.querySelectorAll('[data-r]').forEach((x) => { r[x.dataset.r] = Number(x.value); });
          try { await save({ prices: list.filter((p) => p.name.trim()), rules: r }); d.close(); K.ui().toast('Salvat.', 'success'); K.reload(); }
          catch (err) { K.ui().toast(K.errText(err), 'error'); }
        }));
      },
    });
  }

  // ------------------------------------------------------------------ Progres echipă (owner)
  function teamPeople() {
    return ((K.data && K.data.activeEmployees) || []).filter((e) => e.role !== 'admin' && e.id !== 'admin');
  }
  function statsOf(id) {
    const p = progOf(id);
    const chapters = manuals().flatMap((m) => m.chapters.map((c) => ({ m, c, ref: cref(m, c) })));
    const read = chapters.filter((x) => p.read[x.ref]).length;
    const qs = Object.values(p.quiz || {});
    const avg = qs.length ? Math.round(qs.reduce((a, q) => a + (q.total ? q.best / q.total : 0), 0) / qs.length * 100) : null;
    const cs = Object.values(p.cases || {});
    const stamps = [].concat(Object.values(p.read || {}), qs.map((q) => q.at), cs.map((c) => c.at), Object.values(p.tasks || {}).map((t) => t.done)).filter(Boolean).sort();
    return { p, read, chapters: chapters.length, quizzes: qs.length, avg, cases: cs.length, casesOk: cs.filter((c) => c.everOk).length, last: stamps[stamps.length - 1] || '', path: pathStats(id) };
  }
  function teamHtml() {
    const pend = pendingTasks();
    const people = teamPeople();
    const byId = (id) => ((K.data && K.data.activeEmployees) || []).find((e) => e.id === id) || { name: '?' };
    return (pend.length ? '<section class="tr-pend"><h3>' + icon('clock') + 'De confirmat <span class="k-tag is-warn">' + pend.length + '</span></h3>' + pend.map((x) => '<div class="tr-pend-row">' + K.avatar(byId(x.emp).name, 34) +
      '<div><b>' + esc(byId(x.emp).name) + '</b><span>' + esc(x.item.text) + '</span><small>Ziua ' + x.day + ' · ' + esc(K.ago(x.at)) + '</small></div>' +
      '<div class="tr-pend-a"><button type="button" class="k-btn is-ghost is-sm" data-conf="' + esc(x.emp) + '|' + esc(x.item.id) + '|0">' + icon('undo') + 'Refă</button><button type="button" class="k-btn is-primary is-sm" data-conf="' + esc(x.emp) + '|' + esc(x.item.id) + '|1">' + icon('check') + 'Confirm</button></div></div>').join('') + '</section>' : '') +
      '<div class="tr-bar"><h3 class="tr-h">Echipa</h3><span class="k-grow"></span><button type="button" class="k-btn is-outline is-sm" data-paths>' + icon('target') + 'Drumurile de început</button></div>' +
      (people.length ? '<div class="tr-team">' + people.map((e) => {
        const s = statsOf(e.id);
        const pct = s.path && s.path.items ? Math.round(s.path.done / s.path.items * 100) : 0;
        return '<button type="button" class="tr-person" data-person="' + esc(e.id) + '">' + K.avatar(e.name, 40) + '<div class="tr-person-t"><b>' + esc(e.name) + '</b><small>' + esc((ROLE[e.role] || e.role) + (e.location && e.location !== '-' ? ' · ' + e.location : '')) + '</small></div>' +
          '<div class="tr-person-s">' +
          '<span><small>Drum</small><b>' + (s.path ? 'Ziua ' + s.path.day + ' · ' + pct + '%' : '-') + '</b></span>' +
          '<span><small>Citite</small><b>' + s.read + '/' + s.chapters + '</b></span>' +
          '<span><small>Teste</small><b>' + (s.quizzes ? s.quizzes + ' · ' + s.avg + '%' : '-') + '</b></span>' +
          '<span><small>Cazuri</small><b>' + (s.cases ? s.casesOk + '/' + s.cases : '-') + '</b></span>' +
          '<span><small>Ultima dată</small><b>' + (s.last ? esc(K.ago(s.last)) : '-') + '</b></span></div></button>';
      }).join('') + '</div>' : K.empty('users', 'Niciun angajat încă', ''));
  }
  function openPerson(id) {
    const e = ((K.data && K.data.activeEmployees) || []).find((x) => x.id === id);
    if (!e) return;
    const s = statsOf(id);
    const p = s.p;
    const role = (p.path && p.path.role) || (e.role === 'cosmetician' ? 'cosmetician' : 'receptie');
    const d = K.drawer({
      title: e.name, lead: K.avatar(e.name, 40), width: 720, subtitle: esc(ROLE[e.role] || e.role),
      body: '<section class="tr-sec"><h5>Drumul de început</h5><div class="k-form tr-pathform">' + K.field('Drumul', '<select data-pr>' + K.options([['receptie', 'Recepție'], ['cosmetician', 'Cosmeticiană']], role) + '</select>') +
        K.field('Din ziua', '<input type="date" data-ps value="' + esc((p.path && p.path.start) || K.today()) + '">') + '</div>' +
        '<div class="tr-path-btns">' + (p.path ? '<button type="button" class="k-btn is-ghost is-sm" data-path-off>' + icon('x') + 'Oprește drumul</button>' : '') +
        '<button type="button" class="k-btn is-outline is-sm" data-path-on>' + icon('target') + (p.path ? 'Schimbă' : 'Pornește drumul') + '</button></div>' +
        (s.path ? '<ul class="tr-items is-compact">' + s.path.days.map((dd, di) => '<li class="tr-item-day">Ziua ' + (di + 1) + ' · ' + esc(dd.title) + '</li>' + dd.items.map((x) => itemHtml(x, p, false)).join('')).join('') + '</ul>' : '') + '</section>' +
        manuals().map((m) => '<section class="tr-sec"><h5>' + esc(m.title) + '</h5><ul class="tr-prog">' + m.chapters.map((c) => {
          const ref = cref(m, c), q = p.quiz[ref];
          return '<li><span class="' + (p.read[ref] ? 'is-on' : '') + '">' + icon(p.read[ref] ? 'check' : 'minus') + '</span>' + esc(c.title) + (q ? '<b class="' + (q.best === q.total ? 'is-good' : 'is-warn') + '">' + q.best + '/' + q.total + (q.tries > 1 ? ' · ' + q.tries + ' încercări' : '') + '</b>' : '') + '</li>';
        }).join('') + '</ul></section>').join('') +
        ((D().cases || []).some((c) => p.cases[c.id]) ? '<section class="tr-sec"><h5>Cazuri</h5><ul class="tr-prog">' + (D().cases || []).filter((c) => p.cases[c.id]).map((c) => '<li><span class="is-on">' + icon(p.cases[c.id].everOk ? 'check' : 'x') + '</span>' + esc(c.title) + '<b class="' + (p.cases[c.id].everOk ? 'is-good">corect' : 'is-warn">greșit') + '</b></li>').join('') + '</ul></section>' : ''),
      onMount(el) {
        const setPath = (r) => K.busy(el.querySelector(r ? '[data-path-on]' : '[data-path-off]'), async () => {
          try { await post({ action: 'path', emp: id, role: r, start: el.querySelector('[data-ps]').value }); d.close(); K.ui().toast(r ? 'Drumul e pornit.' : 'Drumul e oprit.', 'success'); K.reload(); }
          catch (err) { K.ui().toast(K.errText(err), 'error'); }
        });
        el.querySelector('[data-path-on]').addEventListener('click', () => setPath(el.querySelector('[data-pr]').value));
        const off = el.querySelector('[data-path-off]'); if (off) off.addEventListener('click', () => setPath(''));
      },
    });
  }
  // the owner edits the two first-week paths: days, and in each day what to read / test / solve / do
  function editPaths() {
    let role = 'cosmetician';
    const all = JSON.parse(JSON.stringify(D().paths || {}));
    const refs = { read: [], quiz: [], case: [] };
    manuals().forEach((m) => m.chapters.forEach((c) => { refs.read.push([cref(m, c), m.title + ' · ' + c.title]); if ((c.quiz || []).length) refs.quiz.push([cref(m, c), m.title + ' · ' + c.title]); }));
    (D().schemes || []).forEach((s) => refs.read.push([sref(s), 'Schema · ' + s.name]));
    (D().cases || []).forEach((c) => refs.case.push([c.id, c.title]));
    const d = K.drawer({
      title: 'Drumurile de început', icon: 'target', width: 820,
      body: K.seg('prole', [['cosmetician', 'Cosmeticiană'], ['receptie', 'Recepție']], role) + '<div data-days></div><button type="button" class="k-btn is-outline is-sm" data-day-add>' + icon('plus') + 'Adaugă o zi</button>',
      footer: '<span class="k-grow"></span><button type="button" class="k-btn" data-cancel>Renunță</button><button type="button" class="k-btn is-primary" data-save>' + icon('check') + 'Salvează</button>',
      onMount(el) {
        const box = el.querySelector('[data-days]');
        const days = () => (all[role] = all[role] || []);
        const readAll = () => box.querySelectorAll('[data-di]').forEach((dr) => {
          const dd = days()[+dr.dataset.di];
          dd.title = dr.querySelector('[data-dt]').value;
          dr.querySelectorAll('[data-ii]').forEach((r) => { const x = dd.items[+r.dataset.ii]; x.kind = r.querySelector('[data-ik]').value; const ref = r.querySelector('[data-ir]'); const tx = r.querySelector('[data-it]'); x.ref = ref ? ref.value : ''; x.text = tx ? tx.value : ''; });
        });
        const paint = () => {
          box.innerHTML = days().map((dd, di) => '<section class="tr-ped" data-di="' + di + '"><header><b>Ziua ' + (di + 1) + '</b><input data-dt maxlength="80" value="' + esc(dd.title) + '" placeholder="Titlul zilei">' +
            '<button type="button" class="k-icon-btn" data-day-rm="' + di + '" aria-label="Scoate ziua">' + icon('trash') + '</button></header>' +
            dd.items.map((x, ii) => '<div class="tr-ped-row" data-ii="' + ii + '"><select data-ik>' + K.options([['read', 'Citește'], ['quiz', 'Test'], ['case', 'Caz'], ['task', 'Sarcină']], x.kind) + '</select>' +
              (x.kind === 'task' ? '<input data-it maxlength="200" value="' + esc(x.text) + '" placeholder="Ce are de făcut">' : '<select data-ir>' + K.options([['', 'Alege…']].concat(refs[x.kind] || []), x.ref) + '</select>') +
              '<button type="button" class="k-icon-btn" data-it-up="' + di + '|' + ii + '"' + (ii ? '' : ' disabled') + '>' + icon('up') + '</button><button type="button" class="k-icon-btn" data-it-rm="' + di + '|' + ii + '">' + icon('x') + '</button></div>').join('') +
            '<button type="button" class="k-btn is-ghost is-sm" data-it-add="' + di + '">' + icon('plus') + 'Pas</button></section>').join('');
        };
        paint();
        el.addEventListener('change', (ev) => {
          if (ev.target.name === 'prole') { readAll(); role = ev.target.value; paint(); return; }
          if (ev.target.matches('[data-ik]')) { readAll(); paint(); }
        });
        el.addEventListener('click', (ev) => {
          const b = ev.target.closest('[data-day-add],[data-day-rm],[data-it-add],[data-it-rm],[data-it-up]');
          if (!b) return;
          readAll();
          if (b.hasAttribute('data-day-add')) days().push({ title: '', items: [] });
          if (b.dataset.dayRm) days().splice(+b.dataset.dayRm, 1);
          if (b.dataset.itAdd) days()[+b.dataset.itAdd].items.push({ id: '', kind: 'task', ref: '', text: '' });
          if (b.dataset.itRm) { const [di, ii] = b.dataset.itRm.split('|').map(Number); days()[di].items.splice(ii, 1); }
          if (b.dataset.itUp) { const [di, ii] = b.dataset.itUp.split('|').map(Number); const l = days()[di].items; [l[ii - 1], l[ii]] = [l[ii], l[ii - 1]]; }
          paint();
        });
        el.querySelector('[data-cancel]').addEventListener('click', () => d.close());
        el.querySelector('[data-save]').addEventListener('click', (ev) => K.busy(ev.currentTarget, async () => {
          readAll();
          try {
            for (const r of ['cosmetician', 'receptie']) if (all[r]) await save({ paths: { role: r, days: all[r] } });
            d.close(); K.ui().toast('Drumurile sunt salvate.', 'success'); K.reload();
          } catch (err) { K.ui().toast(K.errText(err), 'error'); }
        }));
      },
    });
  }

  // ------------------------------------------------------------------ Fișe de printat
  const PRINTS = [
    ['/fise/fisa-client-proceduri-corporale.pdf', 'Fișă client · proceduri corporale', 'Se completează la prima vizită'],
    ['/fise/fisa-client-proceduri-faciale.pdf', 'Fișă client · proceduri faciale', 'Se completează la prima vizită'],
    ['/fise/fisa-client-epilare-laser.pdf', 'Fișă client · epilare laser', 'Se completează la prima vizită'],
    ['/fise/program-recomandat-si-oferta.pdf', 'Program recomandat și ofertă', 'Pentru clientă, după consultație'],
    ['/fise/ghid-program-recomandat.pdf', 'Ghidul programului recomandat', 'Intern, nu se arată clientei'],
  ];
  function printHtml() {
    return '<div class="ac-grid">' + PRINTS.map(([href, t, sub]) => '<a class="ac-ch ac-print" href="' + href + '" target="_blank" rel="noopener"><span class="k-icon-chip is-accent">' + icon('printer') + '</span><h4>' + esc(t) + '</h4><p>' + esc(sub) + '</p><footer><span class="k-btn is-sm is-outline">' + icon('file') + 'Deschide PDF</span></footer></a>').join('') + '</div>';
  }

  // ------------------------------------------------------------------ PDF (html2pdf, loaded on first use)
  // Rendered by the browser, so Romanian diacritics come out exactly as on screen.
  let libP = null;
  function lib() {
    if (window.html2pdf) return Promise.resolve(window.html2pdf);
    if (!libP) libP = new Promise((ok, fail) => {
      const s = document.createElement('script');
      s.src = 'https://cdnjs.cloudflare.com/ajax/libs/html2pdf.js/0.10.1/html2pdf.bundle.min.js';
      s.onload = () => ok(window.html2pdf); s.onerror = () => { libP = null; fail(new Error('pdf_lib')); };
      document.head.appendChild(s);
    });
    return libP;
  }
  const fileSafe = (s) => String(s).normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^\w\s-]/g, '').trim().replace(/\s+/g, '-');
  function chapterDoc(m, c, i) {
    return '<section class="pdf-ch">' +
      '<div class="pdf-kicker">' + esc(m.title) + ' · Capitolul ' + num(i) + '</div>' +
      '<h2>' + esc(c.title) + '</h2>' + (c.summary ? '<p class="pdf-sum">' + esc(c.summary) + '</p>' : '') +
      '<div class="pdf-body">' + bodyHtml(c.body) + '</div></section>';
  }
  function docShell(inner) {
    return '<div class="pdf-doc"><header class="pdf-brand"><img src="/brand_asset/logo-mark.png" alt=""><b>CENTRUL360</b><span>Uz intern</span></header>' + inner + '</div>';
  }
  async function downloadPdf(m, chapterIndex, btn) {
    const one = chapterIndex != null;
    const inner = one ? chapterDoc(m, m.chapters[chapterIndex], chapterIndex)
      : '<section class="pdf-cover"><div class="pdf-kicker">Centrul360 · Training</div><h1>' + esc(m.title) + '</h1><p>' + esc(m.lede || '') + '</p>' +
        '<ol class="pdf-toc">' + m.chapters.map((c, i) => '<li><b>' + num(i) + '</b> ' + esc(c.title) + '</li>').join('') + '</ol></section>' +
        m.chapters.map((c, i) => '<div class="html2pdf__page-break"></div>' + chapterDoc(m, c, i)).join('');
    const host = document.createElement('div');
    host.className = 'pdf-host';
    host.innerHTML = docShell(inner);
    document.body.appendChild(host);
    const name = fileSafe(m.title) + (one ? '-' + num(chapterIndex) + '-' + fileSafe(m.chapters[chapterIndex].title) : '') + '.pdf';
    const run = async () => {
      try {
        const h2p = await lib();
        await h2p().set({
          margin: [12, 12, 14, 12], filename: name,
          image: { type: 'jpeg', quality: 0.95 },
          html2canvas: { scale: 2, useCORS: true, backgroundColor: '#ffffff' },
          jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' },
          pagebreak: { mode: ['css', 'legacy'], avoid: ['li', 'blockquote', '.ac-rule', 'h5', '.pdf-sum'] },
        }).from(host.firstChild).save();
      } catch (err) {
        K.ui().toast('Nu am putut face PDF-ul. Verifică internetul și reîncearcă.', 'error');
      } finally { host.remove(); }
    };
    return btn ? K.busy(btn, run) : run();
  }

  // ------------------------------------------------------------------ clicks
  function onClick(e) {
    const t = e.target;
    const tb = t.closest('[data-tab]');
    if (tb) { A.tab = tb.dataset.tab; panel.querySelector('[data-view]').innerHTML = ''; return render(); }
    const dy = t.closest('[data-day]');
    if (dy) { A.openDay = A.openDay === +dy.dataset.day ? -1 : +dy.dataset.day; return render(); }
    const mb = t.closest('[data-m]');
    if (mb) { A.manual = mb.dataset.m; return render(); }
    if (t.closest('[data-edit]')) return editManual();
    const ce = t.closest('[data-ch-edit]'); if (ce) return editChapter(+ce.dataset.chEdit);
    const rd = t.closest('[data-read]'); if (rd) return read(current(), +rd.dataset.read);
    const qz = t.closest('[data-quiz]'); if (qz) return quiz(current(), +qz.dataset.quiz);
    const pdf = t.closest('[data-pdf]'); if (pdf) return downloadPdf(current(), +pdf.dataset.pdf, pdf);
    const all = t.closest('[data-pdf-all]'); if (all) return downloadPdf(current(), null, all);
    const or = t.closest('[data-open-ref]');
    if (or) {
      const f = findRef(or.dataset.openRef);
      if (!f) return;
      if (f.kind === 'chapter') return or.dataset.openKind === 'quiz' ? quiz(f.m, f.i) : read(f.m, f.i);
      if (f.kind === 'scheme') return viewRole() === 'receptie' ? openSummary(f.s.id) : openScheme(f.s.id);
      return openCase(f.c.id);
    }
    const td = t.closest('[data-task-done],[data-task-undo]');
    if (td) return K.busy(td, async () => {
      try { const j = await post({ action: 'task', id: td.dataset.taskDone || td.dataset.taskUndo, done: !!td.dataset.taskDone }); setMine(j.progress); render(); if (td.dataset.taskDone) K.ui().toast('Trimis la confirmare.', 'success'); }
      catch (err) { K.ui().toast(K.errText(err), 'error'); }
    });
    const sc = t.closest('[data-scheme]'); if (sc) return openScheme(sc.dataset.scheme);
    if (t.closest('[data-scheme-new]')) return editScheme(null);
    const cs = t.closest('[data-case]'); if (cs) return openCase(cs.dataset.case);
    if (t.closest('[data-case-new]')) return editCase(null);
    if (t.closest('[data-calc-add]')) { calcState().lines.push({ price: '', sessions: 1, zone: '', interval: '' }); keepCalc(); panel.querySelector('[data-lines]').innerHTML = linesHtml(); return paintCalcResults(); }
    const cr = t.closest('[data-cl-rm]'); if (cr) { const s = calcState(); s.lines.splice(+cr.dataset.clRm, 1); if (!s.lines.length) s.lines.push({ price: '', sessions: 1, zone: '', interval: '' }); keepCalc(); panel.querySelector('[data-lines]').innerHTML = linesHtml(); return paintCalcResults(); }
    if (t.closest('[data-calc-clear]')) { C = null; try { localStorage.removeItem(CALC_KEY); } catch (x) { /* private */ } panel.querySelector('[data-view]').innerHTML = ''; return render(); }
    const sb = t.closest('[data-sub]');
    if (sb) { A.pick[A.tab + ':' + viewRole()] = sb.dataset.sub; panel.querySelector('[data-view]').innerHTML = ''; return render(); }
    const sm = t.closest('[data-summary]'); if (sm) return openSummary(sm.dataset.summary);
    const ce2 = t.closest('[data-cb-edit],[data-cb-new]'); if (ce2) return editCombo(ce2.dataset.cbEdit ? (D().combos || []).find((x) => x.id === ce2.dataset.cbEdit) : null);
    if (t.closest('[data-calc-copy]')) return K.copy(calcText());
    if (t.closest('[data-calc-client]')) return saveToClient();
    if (t.closest('[data-prices]')) return editPrices();
    const cf = t.closest('[data-conf]');
    if (cf) {
      const [emp, id, ok] = cf.dataset.conf.split('|');
      return K.busy(cf, async () => {
        try { await post({ action: 'confirm', emp, id, ok: ok === '1' }); K.ui().toast(ok === '1' ? 'Confirmat.' : 'Trimis înapoi.', 'success'); K.reload(); }
        catch (err) { K.ui().toast(K.errText(err), 'error'); }
      });
    }
    const pe = t.closest('[data-person]'); if (pe) return openPerson(pe.dataset.person);
    if (t.closest('[data-paths]')) return editPaths();
  }
  // the group filters (K.seg)
  document.addEventListener('change', (e) => {
    if (!panel || !panel.contains(e.target)) return;
    if (e.target.name === 'sgroup') { A.schemeGroup = e.target.value; render(); }
    if (e.target.name === 'trole') { A.role = e.target.value; panel.querySelector('[data-view]').innerHTML = ''; render(); }
    if (e.target.name === 'cgroup') { A.caseGroup = e.target.value; render(); }
  });

  // ------------------------------------------------------------------ styles
  const css = `
.tr-tabs{ display:flex; gap:.4rem; overflow-x:auto; padding:.15rem .1rem .6rem; margin:0 0 .9rem; scrollbar-width:none; -webkit-overflow-scrolling:touch; }
.tr-tabs::-webkit-scrollbar{ display:none; }
.tr-tab{ flex:0 0 auto; display:inline-flex; align-items:center; gap:.45rem; height:40px; padding:0 .9rem; border-radius:999px; border:1px solid var(--line); background:var(--paper); color:var(--muted); font:inherit; font-size:.88rem; font-weight:600; cursor:pointer; transition:color .2s, border-color .2s, background .2s; }
.tr-tab .k-ic{ width:16px; height:16px; }
.tr-tab:hover{ color:var(--fg); }
.tr-tab.is-on{ color:var(--accent); border-color:var(--accent); background:var(--accent-soft); }
.tr-rolebar{ margin:0 0 .9rem; } .tr-rolebar .k-seg{ max-width:420px; }
.tr-mini{ list-style:none; margin:.2rem 0 0; padding:0; display:flex; flex-direction:column; gap:.25rem; } .tr-mini li{ display:flex; gap:.35rem; align-items:flex-start; font-size:.82rem; color:var(--fg); line-height:1.35; } .tr-mini .k-ic{ flex:0 0 auto; width:14px; height:14px; color:var(--good); margin-top:2px; }
.tr-tab-n{ min-width:20px; height:20px; padding:0 .35rem; border-radius:999px; background:var(--accent); color:var(--on-accent, #fff); font-size:.72rem; display:inline-flex; align-items:center; justify-content:center; }
.ac-manuals{ display:grid; grid-template-columns:repeat(auto-fit,minmax(220px,1fr)); gap:.7rem; margin-bottom:1.3rem; }
.ac-mcard{ display:flex; align-items:center; gap:.75rem; text-align:left; padding:.85rem 1rem; border-radius:16px; background:var(--paper); border:1px solid var(--line); cursor:pointer; color:inherit; font:inherit; transition:border-color .2s ease, transform .2s ease; }
.ac-mcard:hover{ transform:translateY(-1px); }
.ac-mcard.is-on{ border-color:var(--accent, #6a4dff); box-shadow:0 0 0 1px var(--accent, #6a4dff) inset; }
.ac-mcard b{ display:block; font-size:.95rem; } .ac-mcard span{ font-size:.78rem; color:var(--muted); }
.ac-head{ display:flex; flex-wrap:wrap; align-items:flex-end; justify-content:space-between; gap:.8rem; margin-bottom:1rem; }
.ac-head h3{ margin:0 0 .2rem; font-size:1.25rem; } .ac-head p{ margin:0; color:var(--muted); max-width:46rem; font-size:.9rem; }
.ac-head-actions{ display:flex; gap:.5rem; flex-wrap:wrap; }
.ac-grid{ display:grid; grid-template-columns:repeat(auto-fill,minmax(260px,1fr)); gap:.8rem; }
.ac-ch{ display:flex; flex-direction:column; gap:.45rem; padding:1rem 1.05rem; border-radius:16px; background:var(--paper); border:1px solid var(--line); box-shadow:var(--shadow-sm); animation:k-rise .4s var(--ease) both; text-align:left; color:inherit; font:inherit; }
.ac-ch h4{ margin:0; font-size:1rem; line-height:1.3; } .ac-ch p{ margin:0; color:var(--muted); font-size:.85rem; line-height:1.5; flex:1; }
.ac-ch footer{ display:flex; gap:.45rem; flex-wrap:wrap; margin-top:.35rem; }
.tr-card{ cursor:pointer; transition:transform .2s ease, border-color .2s ease; } .tr-card:hover{ transform:translateY(-2px); border-color:var(--accent); }
.tr-ch-top{ display:flex; align-items:center; gap:.35rem; flex-wrap:wrap; min-height:24px; }
.tr-ch-pen{ margin-left:auto; width:30px; height:30px; }
.tr-meta{ display:flex; flex-wrap:wrap; gap:.7rem; color:var(--muted); font-size:.78rem; } .tr-meta span{ display:inline-flex; align-items:center; gap:.3rem; } .tr-meta .k-ic{ width:14px; height:14px; }
.ac-print{ color:inherit; text-decoration:none; cursor:pointer; transition:transform .2s ease, border-color .2s ease; } .ac-print:hover{ transform:translateY(-2px); border-color:var(--accent, #6a4dff); }
.ac-num{ font-size:.72rem; font-weight:700; letter-spacing:.12em; color:var(--accent, #6a4dff); }
.ac-num.is-sm{ min-width:1.6rem; }
.ac-read{ font-size:.93rem; line-height:1.6; }
.ac-read h5{ margin:1.2rem 0 .4rem; font-size:.95rem; }
.ac-read ul, .ac-read ol{ margin:.3rem 0 .6rem; padding-left:1.25rem; } .ac-read li{ margin:.25rem 0; }
.ac-sum{ color:var(--muted); }
.ac-say{ margin:.5rem 0; padding:.6rem .85rem; border-left:3px solid var(--accent, #6a4dff); background:var(--glass); border-radius:0 10px 10px 0; font-style:italic; }
.ac-rule{ margin:.6rem 0; padding:.6rem .85rem; border-radius:10px; background:var(--warn-soft); border:1px solid color-mix(in srgb, var(--warn) 35%, transparent); font-weight:600; }
.tr-readtag{ height:36px; padding:0 .8rem; border-radius:10px; }
.tr-media{ display:grid; grid-template-columns:repeat(auto-fill,minmax(220px,1fr)); gap:.6rem; margin:1rem 0; }
.tr-media figure{ margin:0; border-radius:12px; overflow:hidden; background:var(--glass); border:1px solid var(--line); }
.tr-media img, .tr-media video{ display:block; width:100%; max-height:420px; object-fit:cover; background:#000; }
.tr-media figcaption{ padding:.45rem .6rem; font-size:.8rem; color:var(--muted); }
.tr-sub{ display:flex; align-items:center; gap:.45rem; margin:1.2rem 0 .6rem; font-size:.92rem; } .tr-sub .k-ic{ width:16px; height:16px; color:var(--accent); }
.tr-med-list{ display:flex; flex-direction:column; gap:.45rem; margin-bottom:.5rem; }
.tr-med-row{ display:flex; align-items:center; gap:.5rem; } .tr-med-row input{ flex:1; min-width:0; }
.tr-med-th{ width:52px; height:52px; border-radius:10px; object-fit:cover; flex:0 0 auto; background:var(--glass-2); display:inline-flex; align-items:center; justify-content:center; color:var(--muted); }
.tr-med-add{ display:flex; flex-wrap:wrap; align-items:center; gap:.5rem; } .tr-med-add label{ cursor:pointer; }
.tr-quiz{ display:flex; flex-direction:column; gap:1rem; }
.tr-score{ display:flex; align-items:baseline; gap:.7rem; padding:.85rem 1rem; border-radius:14px; background:var(--warn-soft); color:var(--warn); }
.tr-score.is-good{ background:var(--good-soft); color:var(--good); } .tr-score b{ font-size:1.4rem; } .tr-score span{ font-size:.88rem; color:var(--fg); }
.tr-q{ border:1px solid var(--line); border-radius:14px; padding:.8rem .85rem .85rem; margin:0; background:var(--paper); }
.tr-q.is-ok{ border-color:color-mix(in srgb, var(--good) 45%, transparent); } .tr-q.is-bad{ border-color:color-mix(in srgb, var(--bad) 45%, transparent); }
.tr-q legend{ display:flex; gap:.5rem; align-items:flex-start; font-weight:650; font-size:.94rem; line-height:1.4; padding:0 .25rem; }
.tr-q legend span{ flex:0 0 auto; width:22px; height:22px; border-radius:50%; background:var(--accent-soft); color:var(--accent); font-size:.75rem; display:inline-flex; align-items:center; justify-content:center; }
.tr-opt{ display:flex; align-items:flex-start; gap:.6rem; width:100%; text-align:left; margin-top:.45rem; padding:.7rem .8rem; border-radius:12px; border:1px solid var(--line); background:var(--glass); color:inherit; font:inherit; font-size:.9rem; line-height:1.4; cursor:pointer; transition:border-color .15s, background .15s; }
.tr-opt i{ flex:0 0 auto; width:18px; height:18px; margin-top:1px; border-radius:50%; border:2px solid var(--line-on-dark, var(--muted)); }
.tr-opt small{ display:block; margin-top:.3rem; color:var(--muted); font-size:.8rem; }
.tr-opt:hover:not(:disabled){ border-color:var(--accent); }
.tr-opt.is-on{ border-color:var(--accent); background:var(--accent-soft); } .tr-opt.is-on i{ border-color:var(--accent); background:radial-gradient(circle, var(--accent) 45%, transparent 50%); }
.tr-opt.is-right{ border-color:var(--good); background:var(--good-soft); } .tr-opt.is-right i{ border-color:var(--good); background:radial-gradient(circle, var(--good) 45%, transparent 50%); }
.tr-opt.is-wrong{ border-color:var(--bad); background:var(--bad-soft); } .tr-opt.is-wrong i{ border-color:var(--bad); }
.tr-opt:disabled{ cursor:default; }
.tr-why{ display:flex; gap:.4rem; align-items:flex-start; margin:.55rem 0 0; font-size:.84rem; color:var(--muted); } .tr-why .k-ic{ flex:0 0 auto; width:15px; height:15px; margin-top:2px; }
.tr-qed{ border:1px solid var(--line); border-radius:12px; padding:.6rem; margin-bottom:.6rem; display:flex; flex-direction:column; gap:.4rem; background:var(--glass); }
.tr-qed-h{ display:flex; align-items:center; gap:.5rem; } .tr-qed-h input{ flex:1; min-width:0; font-weight:600; }
.tr-qed-o{ display:flex; align-items:center; gap:.5rem; } .tr-qed-o input[type=radio]{ width:18px; height:18px; flex:0 0 auto; accent-color:var(--good); } .tr-qed-o input:not([type=radio]){ flex:1; min-width:0; }
.tr-bar{ display:flex; flex-wrap:wrap; align-items:center; gap:.6rem; margin-bottom:.9rem; } .tr-h{ margin:0; font-size:1.05rem; }
.tr-note{ display:flex; gap:.5rem; align-items:flex-start; padding:.65rem .8rem; border-radius:12px; background:var(--info-soft); color:var(--fg); font-size:.86rem; margin:0 0 .9rem; } .tr-note .k-ic{ flex:0 0 auto; width:16px; height:16px; color:var(--info); margin-top:2px; }
.tr-warn{ display:flex; gap:.5rem; align-items:flex-start; padding:.65rem .8rem; border-radius:12px; background:var(--warn-soft); color:var(--fg); font-size:.86rem; margin:.6rem 0; } .tr-warn .k-ic{ flex:0 0 auto; width:16px; height:16px; color:var(--warn); margin-top:2px; }
.tr-missing{ display:flex; gap:.4rem; align-items:center; color:var(--warn); font-size:.85rem; margin:.2rem 0; } .tr-missing .k-ic{ width:15px; height:15px; }
.tr-combo-card{ display:flex; align-items:center; gap:.75rem; width:100%; text-align:left; padding:.8rem 1rem; margin-bottom:.9rem; border-radius:16px; border:1px solid var(--line); background:var(--paper); color:inherit; font:inherit; cursor:pointer; }
.tr-combo-card span:nth-child(2){ flex:1; } .tr-combo-card b{ display:block; } .tr-combo-card small{ color:var(--muted); font-size:.8rem; }
.tr-combos{ display:flex; flex-direction:column; gap:.7rem; }
.tr-combo{ border:1px solid var(--line); border-radius:14px; padding:.75rem .9rem; background:var(--paper); }
.tr-combo header{ display:flex; align-items:center; gap:.5rem; } .tr-combo header b{ flex:1; } .tr-combo p{ margin:.4rem 0; color:var(--muted); font-size:.88rem; }
.tr-combo dl{ display:grid; grid-template-columns:repeat(auto-fit,minmax(150px,1fr)); gap:.4rem .8rem; margin:.3rem 0 0; } .tr-combo dt{ font-size:.72rem; color:var(--muted); text-transform:uppercase; letter-spacing:.06em; } .tr-combo dd{ margin:0; font-size:.88rem; }
.tr-missing-dd{ color:var(--warn); }
.tr-sec{ margin:1rem 0; } .tr-sec h5{ margin:0 0 .4rem; font-size:.78rem; text-transform:uppercase; letter-spacing:.08em; color:var(--muted); }
.tr-sec.is-bad ul{ padding:.6rem .8rem .6rem 1.9rem; border-radius:12px; background:var(--bad-soft); }
.tr-chips{ display:flex; flex-wrap:wrap; gap:.4rem; }
.tr-checks{ display:flex; flex-wrap:wrap; gap:.4rem; } .tr-check{ cursor:pointer; height:auto; min-height:32px; padding:.3rem .7rem; } .tr-check input{ accent-color:var(--accent); }
.tr-choices{ display:flex; flex-direction:column; }
.tr-verdict{ display:flex; align-items:center; gap:.4rem; font-weight:700; margin:.7rem 0 .3rem; } .tr-verdict.is-good{ color:var(--good); } .tr-verdict.is-bad{ color:var(--bad); }
.tr-table-wrap{ overflow-x:auto; border:1px solid var(--line); border-radius:12px; }
.tr-table{ width:100%; border-collapse:collapse; font-size:.85rem; min-width:520px; }
.tr-table th, .tr-table td{ padding:.5rem .6rem; text-align:right; border-bottom:1px solid var(--line); white-space:nowrap; }
.tr-table th:first-child, .tr-table td:first-child{ text-align:left; white-space:normal; }
.tr-table th{ font-size:.72rem; text-transform:uppercase; letter-spacing:.05em; color:var(--muted); font-weight:650; }
.tr-table td small{ display:block; color:var(--muted); font-size:.76rem; }
.tr-table tfoot td{ font-weight:700; border-bottom:0; }
.tr-offers{ display:grid; grid-template-columns:repeat(auto-fill,minmax(190px,1fr)); gap:.6rem; margin:.6rem 0; }
.tr-offer{ border:1px solid var(--line); border-radius:14px; padding:.75rem .85rem; background:var(--paper); display:flex; flex-direction:column; gap:.2rem; }
.tr-offer header{ display:flex; justify-content:space-between; font-size:.74rem; color:var(--muted); text-transform:uppercase; letter-spacing:.06em; } .tr-offer header b{ color:var(--accent); }
.tr-offer h5{ margin:.1rem 0 .2rem; font-size:.88rem; line-height:1.3; }
.tr-offer-pay{ font-size:1.35rem; font-weight:800; font-variant-numeric:tabular-nums; }
.tr-offer-part{ font-weight:650; color:var(--accent); }
.tr-offer small{ color:var(--muted); font-size:.76rem; }
.tr-calc{ display:flex; flex-direction:column; gap:.7rem; }
.tr-lines{ display:flex; flex-direction:column; gap:.6rem; }
.tr-cline{ border:1px solid var(--line); border-radius:14px; padding:.65rem .7rem; background:var(--paper); display:flex; flex-direction:column; gap:.5rem; }
.tr-cline-main{ display:flex; gap:.5rem; align-items:center; } .tr-cline-main select{ flex:1; min-width:0; }
.tr-cline-sub{ display:grid; grid-template-columns:90px 1fr 1fr auto; gap:.5rem; align-items:end; }
.tr-cline-sub label{ display:flex; flex-direction:column; gap:.2rem; font-size:.72rem; color:var(--muted); min-width:0; } .tr-cline-sub input{ min-width:0; }
.tr-cline-sum{ font-size:.85rem; color:var(--muted); white-space:nowrap; padding-bottom:.55rem; } .tr-cline-sum b{ color:var(--fg); }
.tr-total{ display:flex; flex-wrap:wrap; align-items:baseline; gap:.3rem 1rem; padding:.85rem 1rem; border-radius:14px; background:var(--accent-soft); }
.tr-total span{ font-size:.85rem; } .tr-total b{ font-size:1.5rem; font-variant-numeric:tabular-nums; } .tr-total small{ color:var(--muted); width:100%; }
.tr-calc-empty{ padding:1rem; text-align:center; }
.tr-calc-extra{ margin-top:.3rem; }
.tr-calc-actions{ display:flex; gap:.5rem; justify-content:flex-end; flex-wrap:wrap; }
.tr-pre{ white-space:pre-wrap; font:inherit; font-size:.82rem; color:var(--muted); background:var(--glass); border:1px solid var(--line); border-radius:12px; padding:.7rem .8rem; margin-top:.8rem; }
.tr-line, .tr-pline{ display:grid; gap:.4rem; align-items:center; margin-bottom:.45rem; }
.tr-line{ grid-template-columns:minmax(0,2fr) 80px minmax(0,1fr) minmax(0,1fr) auto; }
.tr-pline{ grid-template-columns:minmax(0,2.2fr) minmax(0,1fr) minmax(0,1fr) 110px auto; }
.tr-line input, .tr-line select, .tr-pline input, .tr-pline select{ min-width:0; }
.tr-rules{ grid-template-columns:repeat(auto-fit,minmax(180px,1fr)); }
.tr-hero{ display:flex; align-items:center; gap:1rem; padding:1rem 1.1rem; border-radius:18px; background:var(--paper); border:1px solid var(--line); margin-bottom:.9rem; }
.tr-hero h3{ margin:.1rem 0; font-size:1.2rem; } .tr-hero p{ margin:0; font-size:.86rem; } .tr-hero .k-ring-inner b{ font-size:1.05rem; }
.tr-days{ display:flex; flex-direction:column; gap:.55rem; }
.tr-day{ border:1px solid var(--line); border-radius:16px; background:var(--paper); overflow:hidden; }
.tr-day.is-today{ border-color:var(--accent); }
.tr-day-h{ display:flex; align-items:center; gap:.75rem; width:100%; padding:.8rem .95rem; border:0; background:none; color:inherit; font:inherit; text-align:left; cursor:pointer; }
.tr-day-n{ flex:0 0 auto; width:30px; height:30px; border-radius:50%; background:var(--glass-2); display:inline-flex; align-items:center; justify-content:center; font-weight:700; font-size:.85rem; }
.tr-day.is-today .tr-day-n{ background:var(--accent); color:var(--on-accent, #fff); } .tr-day.is-done .tr-day-n{ background:var(--good-soft); color:var(--good); }
.tr-day-n .k-ic{ width:15px; height:15px; }
.tr-day-t{ flex:1; min-width:0; } .tr-day-t small{ display:block; color:var(--muted); font-size:.74rem; } .tr-day-t b{ display:block; font-size:.95rem; }
.tr-day-c{ color:var(--muted); font-size:.82rem; font-variant-numeric:tabular-nums; }
.tr-items{ list-style:none; margin:0; padding:0 .7rem .7rem; display:flex; flex-direction:column; gap:.4rem; }
.tr-items.is-compact{ padding:0; }
.tr-item-day{ font-size:.74rem; text-transform:uppercase; letter-spacing:.06em; color:var(--muted); margin:.7rem 0 .1rem; }
.tr-item{ display:flex; align-items:center; gap:.65rem; padding:.55rem .65rem; border-radius:12px; background:var(--glass); }
.tr-item-ic{ flex:0 0 auto; width:30px; height:30px; border-radius:9px; background:var(--accent-soft); color:var(--accent); display:inline-flex; align-items:center; justify-content:center; } .tr-item-ic .k-ic{ width:15px; height:15px; }
.tr-item.is-done .tr-item-ic{ background:var(--good-soft); color:var(--good); }
.tr-item-t{ flex:1; min-width:0; } .tr-item-t small{ display:block; font-size:.7rem; color:var(--muted); text-transform:uppercase; letter-spacing:.05em; } .tr-item-t b{ display:block; font-size:.88rem; font-weight:600; line-height:1.35; }
.tr-item.is-done .tr-item-t b{ color:var(--muted); }
.tr-item-a{ display:flex; align-items:center; gap:.35rem; flex-wrap:wrap; justify-content:flex-end; }
.tr-pend{ border:1px solid color-mix(in srgb, var(--warn) 40%, transparent); border-radius:16px; padding:.85rem .95rem; margin-bottom:1rem; background:var(--paper); }
.tr-pend h3{ display:flex; align-items:center; gap:.45rem; margin:0 0 .6rem; font-size:1rem; } .tr-pend h3 .k-ic{ width:17px; height:17px; color:var(--warn); }
.tr-pend-row{ display:flex; align-items:center; gap:.7rem; padding:.55rem 0; border-top:1px solid var(--line); }
.tr-pend-row > div:nth-child(2){ flex:1; min-width:0; } .tr-pend-row b{ display:block; font-size:.9rem; } .tr-pend-row span{ display:block; font-size:.86rem; } .tr-pend-row small{ color:var(--muted); font-size:.76rem; }
.tr-pend-a{ display:flex; gap:.35rem; flex-wrap:wrap; justify-content:flex-end; }
.tr-team{ display:flex; flex-direction:column; gap:.55rem; }
.tr-person{ display:flex; align-items:center; gap:.8rem; width:100%; text-align:left; padding:.75rem .9rem; border-radius:16px; border:1px solid var(--line); background:var(--paper); color:inherit; font:inherit; cursor:pointer; transition:border-color .2s; }
.tr-person:hover{ border-color:var(--accent); }
.tr-person-t{ min-width:130px; } .tr-person-t b{ display:block; } .tr-person-t small{ color:var(--muted); font-size:.78rem; }
.tr-person-s{ flex:1; display:grid; grid-template-columns:repeat(5,minmax(0,1fr)); gap:.5rem; }
.tr-person-s span{ display:flex; flex-direction:column; min-width:0; } .tr-person-s small{ font-size:.7rem; color:var(--muted); text-transform:uppercase; letter-spacing:.05em; } .tr-person-s b{ font-size:.88rem; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
.tr-prog{ list-style:none; margin:0; padding:0; } .tr-prog li{ display:flex; align-items:center; gap:.5rem; padding:.35rem 0; border-bottom:1px solid var(--line); font-size:.88rem; }
.tr-prog li > span{ color:var(--muted); display:inline-flex; } .tr-prog li > span.is-on{ color:var(--good); } .tr-prog .k-ic{ width:15px; height:15px; }
.tr-prog li b{ margin-left:auto; font-size:.8rem; } .tr-prog b.is-good{ color:var(--good); } .tr-prog b.is-warn{ color:var(--warn); }
.tr-pathform{ grid-template-columns:repeat(auto-fit,minmax(180px,1fr)); }
.tr-path-btns{ display:flex; gap:.5rem; justify-content:flex-end; margin:.3rem 0 .6rem; }
.tr-ped{ border:1px solid var(--line); border-radius:14px; padding:.65rem; margin:.7rem 0; background:var(--glass); }
.tr-ped header{ display:flex; align-items:center; gap:.5rem; margin-bottom:.5rem; } .tr-ped header b{ white-space:nowrap; } .tr-ped header input{ flex:1; min-width:0; }
.tr-ped-row{ display:grid; grid-template-columns:120px minmax(0,1fr) auto auto; gap:.4rem; align-items:center; margin-bottom:.4rem; } .tr-ped-row select, .tr-ped-row input{ min-width:0; }
.pdf-host{ position:fixed; left:-10000px; top:0; }
.pdf-doc{ width:180mm; background:#fff; color:#17171c; font-family:Inter, system-ui, -apple-system, 'Segoe UI', Arial, sans-serif; font-size:11pt; line-height:1.55; }
.pdf-brand{ display:flex; align-items:center; gap:8px; padding-bottom:8px; margin-bottom:14px; border-bottom:1px solid #e3e3ea; }
.pdf-brand img{ width:22px; height:22px; } .pdf-brand b{ letter-spacing:.08em; font-size:10pt; } .pdf-brand span{ margin-left:auto; padding-right:2px; font-size:8pt; color:#8a8a96; white-space:nowrap; }
.pdf-kicker{ font-size:8pt; font-weight:700; letter-spacing:.14em; text-transform:uppercase; color:#6a4dff; margin-bottom:4px; }
.pdf-doc h1{ font-size:26pt; margin:6px 0 10px; } .pdf-doc h2{ font-size:17pt; margin:0 0 6px; }
.pdf-cover p{ color:#55555f; font-size:12pt; } .pdf-toc{ list-style:none; padding:0; margin:22px 0 0; } .pdf-toc li{ padding:6px 0; border-bottom:1px solid #eee; } .pdf-toc b{ color:#6a4dff; margin-right:8px; }
.pdf-sum{ color:#55555f; margin:0 0 10px; }
.pdf-body h5{ font-size:11.5pt; margin:14px 0 4px; } .pdf-body p{ margin:6px 0; } .pdf-body ul, .pdf-body ol{ margin:4px 0 8px; padding-left:18px; } .pdf-body li{ margin:3px 0; }
.pdf-body .ac-say{ margin:6px 0; padding:7px 10px; border-left:3px solid #6a4dff; background:#f3f1ff; border-radius:0 8px 8px 0; font-style:italic; }
.pdf-body .ac-rule{ margin:8px 0; padding:7px 10px; border-radius:8px; background:#fff3eb; border:1px solid #f6c3a2; font-weight:600; }
@media (max-width:860px){ .tr-person{ flex-wrap:wrap; } .tr-person-s{ flex-basis:100%; grid-template-columns:repeat(3,minmax(0,1fr)); } }
@media (max-width:640px){
  .ac-head-actions .k-btn{ flex:1; } .ac-grid{ grid-template-columns:1fr; }
  .ac-manuals{ grid-template-columns:1fr 1fr; gap:.5rem; margin-bottom:1rem; }
  .ac-mcard{ padding:.6rem .65rem; gap:.55rem; border-radius:14px; align-items:flex-start; }
  .ac-mcard .k-icon-chip{ width:30px; height:30px; flex:0 0 auto; }
  .ac-mcard b{ font-size:.84rem; line-height:1.25; } .ac-mcard span{ font-size:.72rem; }
  .tr-rolebar .k-seg{ max-width:none; }
  .tr-cline-sub{ grid-template-columns:80px 1fr; } .tr-cline-sub label:nth-child(3){ grid-column:1 / -1; } .tr-cline-sum{ grid-column:1 / -1; padding:0; }
  .tr-item{ flex-wrap:wrap; } .tr-item-a{ flex-basis:100%; justify-content:flex-start; padding-left:2.4rem; }
  .tr-pend-row{ flex-wrap:wrap; } .tr-pend-a{ flex-basis:100%; }
  .tr-line, .tr-pline{ grid-template-columns:1fr 1fr; } .tr-line select, .tr-pline input[data-pn]{ grid-column:1 / -1; }
  .tr-ped-row{ grid-template-columns:1fr auto auto; } .tr-ped-row select[data-ik]{ grid-column:1 / -1; }
  .tr-offers{ grid-template-columns:1fr 1fr; } .tr-offer-pay{ font-size:1.15rem; }
  .tr-hero{ padding:.85rem; }
}
`;
  const st = document.createElement('style');
  st.textContent = css;
  document.head.appendChild(st);

  K.section('traininguri', { mount, show: render, data() { if (panel && K.isActive('traininguri')) render(); else badgeOnly(); } });
  // the nav badge stays right while she's elsewhere in the portal
  function badgeOnly() {
    if (!K.data) return;
    if (isAdmin()) { K.badge('traininguri', pendingTasks().length); return; }
    const ps = pathStats(meId());
    K.badge('traininguri', ps ? todayLeft(ps) : 0);
  }
  K.on('academy:print', () => { A.tab = 'fise'; if (panel) { panel.querySelector('[data-view]').innerHTML = ''; render(); } });
})();
