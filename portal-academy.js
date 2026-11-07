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

  const A = { tab: '', zone: '', manual: '', schemeGroup: 'all', caseGroup: 'all', openDay: null, role: 'cosmetician', pick: {}, fisa: { sheet: 'corporale', page: 0, ink: true, on: -1 } };
  // three pages of the menu share this module (the owner, 5.11): Traininguri, Fișe de printat, Calculator ofertă.
  // Only one shows at a time: `panel` is the one on screen, MODE which of them it is.
  const PANELS = {};
  let panel, MODE = 'train';

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
  // the manuals one person can open (her role's; everything for the owner or an unknown role)
  const manualsFor = (e) => (e && e.role && e.role !== 'admin' ? manuals().filter((m) => !(m.roles || []).length || (m.roles || []).includes(e.role)) : manuals());
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
    // the cosmetician's trainings (and the owner looking as one): one page with three big doors (zonesHtml)
    if (viewRole() === 'cosmetician') t.push(['acasa', 'Traininguri', 'book']);
    else t.push(['vanzari', 'Vânzări', 'trend'], ['tratamente', 'Tratamente', 'sparkles'], ['portal', 'Portalul', 'sliders']);
    if (isAdmin()) t.push(['echipa', 'Progres echipă', 'trend', pendingTasks().length]);
    return t;
  }

  const TITLES = { train: ['Echipă', 'Traininguri'], fise: ['Echipă', 'Fișe de printat'], calc: ['Vânzări', 'Calculator ofertă'] };
  function mountAs(mode) {
    return (p) => {
      PANELS[mode] = p;
      p.classList.add('k-panel', 'ac');
      p.innerHTML = '<div class="k-head"><div><div class="k-eyebrow">' + TITLES[mode][0] + '</div><h2>' + TITLES[mode][1] + '</h2></div></div>' +
        (mode === 'train' ? '<nav class="tr-tabs" data-tabs></nav>' : '') + '<div data-view></div>';
      p.addEventListener('click', onClick);
      p.addEventListener('input', onCalcInput);
      p.addEventListener('change', onCalcInput);
    };
  }
  const mount = mountAs('train');
  function showAs(mode) { return () => { MODE = mode; panel = PANELS[mode]; render(); }; }
  function render() {
    if (!panel || !K.data) return;
    if (MODE === 'fise') { panel.querySelector('[data-view]').innerHTML = printHtml(); return; }
    if (MODE === 'calc') {
      const v = panel.querySelector('[data-view]');
      if (!v.querySelector('[data-calc]')) v.innerHTML = calcHtml();
      paintCalcResults();
      return;
    }
    const t = tabs();
    if (!A.tab || !t.some((x) => x[0] === A.tab)) A.tab = t[0][0] === 'drum' && pathStats(meId()).done < pathStats(meId()).items ? 'drum' : viewRole() === 'cosmetician' ? 'acasa' : 'vanzari';
    panel.querySelector('[data-tabs]').hidden = t.length < 2; // one tab alone is no choice
    panel.querySelector('[data-tabs]').innerHTML = t.map(([id, l, ic, n]) => '<button type="button" class="tr-tab' + (A.tab === id ? ' is-on' : '') + '" data-tab="' + id + '">' + icon(ic) + '<span>' + esc(l) + '</span>' + (n ? '<b class="tr-tab-n">' + n + '</b>' : '') + '</button>').join('');
    const v = panel.querySelector('[data-view]');
    if (subOf() === 'calc' && v.querySelector('[data-calc]')) { paintCalcResults(); return; } // keep what she's typing
    v.innerHTML = ({ drum: drumHtml, acasa: zonesHtml, vanzari: () => areaHtml('vanzari'), tratamente: () => areaHtml('tratamente'), portal: guideHtml, echipa: teamHtml })[A.tab]();
    if (subOf() === 'calc') paintCalcResults();
    if (subOf() === 'm:consultatie' && window.C360Fisa) window.C360Fisa.bind(v, A.fisa, render);
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
    const HIDE = role === 'cosmetician' ? ['vanzari', 'cabina'] : [];
    const cards = manuals().filter((m) => (m.area || 'vanzari') === area && (m.roles || []).includes(role) && !HIDE.includes(m.id)).map((m) => {
      const r = m.chapters.filter((c) => p.read[cref(m, c)]).length;
      if (m.id === 'consultatie' && window.C360Fisa) return { id: 'm:' + m.id, title: m.title, icon: 'file', sub: 'Cele 4 fișe, pagină cu pagină' };
      return { id: 'm:' + m.id, title: m.title, icon: m.icon || 'book', sub: r ? r + ' din ' + m.chapters.length + ' citite' : m.chapters.length + ' capitole' };
    });
    const visible = (D().schemes || []).length;
    if (area === 'vanzari' && role === 'cosmetician') {
      cards.push({ id: 'cases', title: 'Cazuri', icon: 'users', sub: (D().cases || []).length + ' cazuri' });
    }
    if (area === 'tratamente') {
      cards.unshift(role === 'receptie'
        ? { id: 'summary', title: 'Tratamentele, pe scurt', icon: 'sparkles', sub: visible + ' tratamente' }
        : { id: 'schemes', title: 'Tratamentele', icon: 'sparkles', sub: visible + ' tratamente' });
      cards.splice(1, 0, { id: 'combos', title: 'Combinații', icon: 'layers', sub: (D().combos || []).length + ' combinații' });
    }
    return cards;
  }
  // the part shown under the cards in the current tab
  // the area the sub-cards belong to: a tab (Recepție), or a door of the cosmetician's trainings
  const areaNow = () => (A.tab === 'acasa' ? (A.zone === 'consult' ? 'vanzari' : A.zone === 'tratamente' ? 'tratamente' : '') : A.tab === 'vanzari' || A.tab === 'tratamente' ? A.tab : '');
  function subOf() {
    const area = areaNow();
    if (!area) return '';
    const cards = areaCards(area, viewRole());
    const key = area + ':' + viewRole();
    if (!cards.some((c) => c.id === A.pick[key])) A.pick[key] = cards[0] ? cards[0].id : '';
    return A.pick[key];
  }
  function areaHtml(area, inZone) {
    const role = viewRole();
    const cards = areaCards(area, role);
    const pick = subOf();
    if (pick.indexOf('m:') === 0) A.manual = pick.slice(2);
    const sub = pick === 'm:consultatie' && window.C360Fisa ? consultHtml(current()) : pick.indexOf('m:') === 0 ? manualHtml(current()) : pick === 'calc' ? calcHtml() : pick === 'cases' ? casesHtml() : pick === 'schemes' ? schemesHtml() : pick === 'summary' ? summariesHtml() : pick === 'combos' ? combosHtml() : '';
    return (isAdmin() && !inZone ? '<div class="tr-rolebar">' + K.seg('trole', [['receptie', 'Recepție', 'phone'], ['cosmetician', 'Cosmeticiană', 'sparkles']], role) + '</div>' : '') +
      (cards.length ? '<div class="ac-manuals">' + cards.map((c) => '<button type="button" class="ac-mcard' + (c.id === pick ? ' is-on' : '') + '" data-sub="' + esc(c.id) + '"><span class="k-icon-chip is-accent">' + icon(c.icon) + '</span>' +
        '<div><b>' + esc(c.title) + '</b><span>' + esc(c.sub) + '</span></div></button>').join('') + '</div>' : '') +
      (sub || K.empty('book', 'Nimic aici încă', ''));
  }

  // ------------------------------------------------------------------ the cosmetician's three doors
  // (the owner, 5.11) "un selector mare pe tot ecranul": the consultation, the client's way through the salon (what she
  // does from the door to the door, explained very simply), the treatments
  // in the order she learns them (the owner, 5.11): first how a client goes through the salon, then the consultation,
  // then the treatments
  const ZONES = [
    { id: 'parcurs', n: 1, title: 'Parcursul clientei', sub: 'Ce fac de când vine clienta până pleacă.', icon: 'users', hue: 'a' },
    { id: 'consult', n: 2, title: 'Consultația', sub: 'Ce îi spun clientei și ce îi recomand.', icon: 'file', hue: 'b' },
    { id: 'tratamente', n: 3, title: 'Tratamentele', sub: 'Cum fac fiecare tratament.', icon: 'sparkles', hue: 'c' },
    // (the owner, 7.11) how to use the portal itself, next to the three
    { id: 'portal', n: 4, title: 'Portalul', sub: 'Cum folosesc portalul, pas cu pas.', icon: 'sliders', hue: 'd' },
  ];
  function zonesHtml() {
    const roleBar = isAdmin() ? '<div class="tr-rolebar">' + K.seg('trole', [['receptie', 'Recepție', 'phone'], ['cosmetician', 'Cosmeticiană', 'sparkles']], viewRole()) + '</div>' : '';
    if (!A.zone) {
      return roleBar + '<div class="tr-doors">' + ZONES.map((z, i) => '<button type="button" class="tr-door is-' + z.hue + '" data-zone="' + z.id + '" data-tilt style="--i:' + i + '">' +
        '<span class="tr-door-glow"></span><span class="tr-door-n">' + z.n + '</span>' +
        '<span class="tr-door-ic">' + icon(z.icon) + '</span><small class="tr-door-k">Vreau să învăț</small><b>' + esc(z.title) + '</b><span class="tr-door-sub">' + esc(z.sub) + '</span>' +
        (z.id === 'parcurs' ? '<span class="tr-door-prog"><i style="--w:' + Math.round(pdone().size / PARCURS.length * 100) + '%"></i></span>' : '') +
        (z.id === 'portal' ? '<span class="tr-door-prog"><i style="--w:' + guidePct() + '%"></i></span>' : '') +
        '<i class="tr-door-go">' + icon('right') + '</i></button>').join('') + '</div>';
    }
    const z = ZONES.find((x) => x.id === A.zone) || ZONES[0];
    const others = ZONES.filter((x) => x.id !== z.id);
    return roleBar + '<div class="tr-zonebar"><button type="button" class="k-btn is-ghost is-sm" data-zone="">' + icon('left') + 'Toate</button><h3>' + icon(z.icon) + esc(z.title) + '</h3><span class="k-grow"></span>' +
      others.map((x) => '<button type="button" class="k-chip" data-zone="' + x.id + '">' + esc(x.title) + '</button>').join('') + '</div>' +
      (z.id === 'parcurs' ? parcursHtml() : z.id === 'portal' ? guideHtml() : areaHtml(z.id === 'consult' ? 'vanzari' : 'tratamente', true));
  }

  // ------------------------------------------------------------------ Portalul (portal-academy-guide.js)
  // the lessons of her role, one open, what she marked „Am înțeles” kept on this device
  function gdone() { try { return new Set(JSON.parse(localStorage.getItem(window.C360Guide ? window.C360Guide.KEY : '') || '[]')); } catch (e) { return new Set(); } }
  function gsave(set) { try { localStorage.setItem(window.C360Guide.KEY, JSON.stringify([...set])); } catch (e) { /* private mode */ } }
  function guidePct() {
    if (!window.C360Guide) return 0;
    const list = window.C360Guide.lessons(viewRole()), d = gdone();
    return list.length ? Math.round(list.filter((x) => d.has(x.id)).length / list.length * 100) : 0;
  }
  function guideHtml() {
    if (!window.C360Guide) return K.empty('book', 'Se încarcă', '');
    const list = window.C360Guide.lessons(viewRole()), d = gdone();
    if (A.gstep == null || A.gstep < 0 || A.gstep >= list.length) { A.gstep = list.findIndex((x) => !d.has(x.id)); if (A.gstep < 0) A.gstep = 0; }
    return window.C360Guide.html(viewRole(), A.gstep, d, icon);
  }

  // ------------------------------------------------------------------ Parcursul clientei
  // Each step, said simply (as to a 5-year-old): what you do, why it matters, what never to forget. A draft to fill:
  // the owner will give the exact words and the photos.
  // more: the details of a step (where things are in the portal); go: buttons to the guide that explains it
  // a training film when it is made (window.C360Vsl, in portal-academy-fisa.js), else the "Vine în curând" card
  const vsl = (id, title, soon) => (window.C360Vsl ? window.C360Vsl.html(id, title, soon) : soon);
  const PARCURS = [
    { t: 'Deschizi salonul', when: 'Dimineața, dacă ajungi prima', ic: 'clock',
      do: ['Deschide ușa.', 'Aprinde luminile.', 'Pornește aparatele.', 'Pregătește apa, cafeaua și ceaiul.', 'Uită-te în Calendar cine vine azi.'],
      why: 'Clienta intră într-un salon gata pregătit.', never: '' },
    { t: 'Pregătești cabinetul', when: 'Înainte de fiecare clientă', ic: 'sparkles',
      do: ['Pune un cearceaf curat pe pat.', 'Pune un prosop curat.', 'Pune pe masă doar ce îți trebuie.'],
      why: 'Nu cauți nimic cât clienta așteaptă.', never: 'Un cearceaf și un prosop sunt doar pentru o clientă.' },
    { t: 'Primești clienta', when: 'Când intră pe ușă', ic: 'users',
      do: ['Zâmbește.', 'Spune-i „Bună ziua” și numele ei.', 'Invit-o să stea jos.', 'Întreab-o: „Doriți apă, cafea sau ceai?”'],
      why: 'Așa se simte binevenită.', never: '' },
    { t: 'Fișa clientei', when: 'Prima dată când vine, înainte de tratament', ic: 'file',
      do: ['Alege fișa potrivită: corp, față sau epilare laser.', 'Stai lângă ea. O completezi tu, împreună cu ea: o întrebi rubrică cu rubrică și scrii.', 'Citiți împreună întrebările de sănătate și bifezi „Da” sau „Nu” la fiecare.', 'Faci evaluarea de pe pagina 2: măsori, te uiți la piele.', 'Ea citește acordul și semnează. Semnezi și tu.'],
      more: ['Fișa o scanezi în portal: Contacte → clienta → Fișe & mențiuni → „Scanează fișa”. Fotografiezi fiecare pagină cu telefonul.', 'Foaia de hârtie o pui la dosarul ei.', 'Dacă e un „Da” la sănătate, nu începi tratamentul până nu întrebi dacă se poate.'],
      go: [['Vezi cum se completează fișa', 'consult:corporale']],
      shot: ['scan-fisa', 'Contacte → clienta → Fișe & mențiuni → „Scanează fișa”'],
      why: 'Fișa ne arată dacă tratamentul e sigur pentru ea. Când o completați împreună, nu sare nimic și ea simte că ai grijă de ea.', never: 'Nu-i dai fișa să o completeze singură. Și fără fișă semnată nu începi tratamentul.' },
    { t: 'Poza „înainte”', when: 'Înainte de tratament', ic: 'image',
      do: ['Pune clienta în același loc, cu lumină bună, pe un fundal simplu.', 'Fă o poză din față și una din profil, la zona tratată.', 'Pune pozele în portal, la ședința de azi.'],
      more: ['Unde: Contacte → caută clienta → „Poze înainte / după” → Ședința de azi (Ședința 1 la prima vizită) → ÎNAINTE.', 'La fiecare ședință faci pozele din același loc și din același unghi. Așa se vede clar diferența.', 'Întreab-o dacă e de acord ca pozele să fie folosite pe site și în reclame (fără față). Bifează răspunsul ei tot acolo, la „Publicare”.', 'Pozele stau doar în portal, în fișa ei.'],
      shot: ['poza-inainte', 'Contacte → clienta → Poze înainte / după → Ședința de azi → ÎNAINTE'],
      why: 'Așa vedem rezultatul, și ea îl vede.', never: 'Fără acordul ei, pozele nu se publică nicăieri.' },
    { t: 'Programul și oferta', when: 'La prima vizită, după fișă și poze', ic: 'wallet',
      do: ['Spune-i ce ai văzut: ce o deranjează și ce se poate face.', 'Faci programul în Calculatorul de ofertă: alegi tratamentele și ședințele.', 'Scrii programul pe pagina 1 a fișei „Program recomandat și ofertă”.', 'Îi arăți oferta 1. Dacă spune „nu”, oferta 2, apoi 3, apoi 4.', 'Când alege, semnează pagina aleasă. La final o duci la recepție: recepția face plata și programările.'],
      more: ['Toate ofertele și cum se completează fiecare pagină sunt explicate la Consultația → „Programul și oferta”.', 'Pe masă e mereu o singură ofertă. Pagina de dinainte o iei înapoi.'],
      go: [['Vezi programul și oferta, pagină cu pagină', 'consult:program'], ['Deschide calculatorul', 'calc']],
      why: 'Clienta pleacă cu un plan clar: ce face, de câte ori și cât costă.', never: 'Nu pui mai multe oferte pe masă deodată.' },
    { t: 'Faci tratamentul', when: 'În cabinet', ic: 'sparkles',
      do: ['Spune-i pe scurt ce urmează.', 'Întreab-o din când în când dacă e bine.', 'Fă tratamentul cum scrie la Tratamente.'],
      why: 'Când știe ce urmează, e liniștită.', never: '' },
    { t: 'Poza „după”', when: 'Imediat după tratament', ic: 'image',
      do: ['Același loc, aceeași lumină și același unghi ca la „înainte”.', 'Pune pozele la aceeași ședință, la DUPĂ.'],
      more: ['Unde: Contacte → clienta → „Poze înainte / după” → Ședința de azi → DUPĂ.', 'Portalul pune singur pozele una lângă alta. Poți să i le arăți pe loc.'],
      shot: ['poza-dupa', 'Aceeași ședință → DUPĂ. Imaginea înainte / după se face singură.'],
      why: 'Așa se vede diferența.', never: '' },
    { t: 'Conduci clienta', when: 'La final', ic: 'calendar',
      do: ['Spune-i ce să facă acasă.', 'Du-o la recepție.', 'Spune-i recepției cât durează următoarele ședințe și la ce interval vin (de exemplu: „60 de minute, o dată pe săptămână”). Recepția face plata și toate programările.', 'Mulțumește-i și spune-i „La revedere” pe nume.'],
      more: ['Programările le face recepția, nu tu. Recepția știe să le facă foarte bine, iar tu nu pierzi timp și te pregătești pentru următoarea clientă.', 'Durata și intervalul le iei din programul ales (fișa „Program recomandat și ofertă”) sau din schema tratamentului.'],
      why: 'Și finalul contează. Recepția are tot ce îi trebuie ca să-i facă programările pe loc.', never: 'Nu faci tu programările: le predai recepției.' },
    { t: 'Faci curat', when: 'După fiecare clientă', ic: 'refresh',
      do: ['Dezinfectează patul, aparatul și masa.', 'Scoate cearceaful și prosopul folosite.', 'Aruncă ce e de unică folosință.'],
      why: 'Următoarea clientă găsește totul curat.', never: '' },
    { t: 'Închizi salonul', when: 'Seara, dacă pleci ultima', ic: 'power',
      do: ['Oprește aparatele.', 'Fă curat și scoate gunoiul.', 'Stinge luminile.', 'Încuie ușa.'],
      why: 'Mâine dimineață totul e gata de lucru.', never: '' },
  ];
  // what she marked "Am înțeles" (this device), the step open; v2 since the steps changed (6.11)
  const PKEY = 'c360_parcurs_done_v2';
  function pdone() { try { return new Set(JSON.parse(localStorage.getItem(PKEY) || '[]')); } catch (e) { return new Set(); } }
  function psave(set) { try { localStorage.setItem(PKEY, JSON.stringify([...set])); } catch (e) { /* private mode */ } }
  // the stops on the map, in % of its box: a winding road, wide on a computer, tall on a phone
  // the same road on a phone, standing up: it winds from top to bottom (left, middle, right, middle, ...), every stop on it
  const MAPV = Array.from({ length: 11 }, (_, i) => [[16, 50, 84, 50][i % 4], i * 10]);
  const MAPW = [[6, 30], [20, 16], [34, 30], [49, 16], [64, 26], [79, 16], [92, 50], [76, 80], [57, 86], [38, 74], [18, 84]];
  const STAGES = [[0, 2, 'Înainte să vină'], [2, 9, 'Cu clienta'], [9, 11, 'După']];
  // a smooth road through the stops (Catmull-Rom as curves)
  function road(pts) {
    let d = 'M' + pts[0][0] + ' ' + pts[0][1];
    for (let i = 0; i < pts.length - 1; i++) {
      const p0 = pts[i - 1] || pts[i], p1 = pts[i], p2 = pts[i + 1], p3 = pts[i + 2] || p2;
      d += ' C' + (p1[0] + (p2[0] - p0[0]) / 6) + ' ' + (p1[1] + (p2[1] - p0[1]) / 6) + ' ' + (p2[0] - (p3[0] - p1[0]) / 6) + ' ' + (p2[1] - (p3[1] - p1[1]) / 6) + ' ' + p2[0] + ' ' + p2[1];
    }
    return d;
  }
  function mapHtml(pts, cls, done, cur) {
    const d = road(pts);
    return '<div class="tr-map ' + cls + (A.mapEnter ? ' is-enter' : '') + '"><svg viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">' +
      '<path class="tr-road-bg" d="' + d + '"/><path class="tr-road" d="' + d + '" pathLength="100"/></svg>' +
      PARCURS.map((x, i) => {
        const st = done.has(i) ? ' is-done' : '';
        const side = cls === 'is-tall' ? (pts[i][0] > 60 ? ' is-l' : pts[i][0] > 40 ? ' is-r is-c' : ' is-r') : '';
        return '<button type="button" class="tr-stop' + st + side + (i === cur ? ' is-cur' : '') + '" data-pstep="' + i + '" style="left:' + (4 + pts[i][0] * 0.92).toFixed(2) + '%;top:' + (6 + pts[i][1] * 0.88).toFixed(2) + '%;--i:' + i + '" aria-label="' + (i + 1) + '. ' + esc(x.t) + '">' +
          '<span class="tr-stop-dot">' + (done.has(i) ? icon('check') : icon(x.ic)) + '</span><span class="tr-stop-l"><small>' + (i + 1) + '</small>' + esc(x.t) + '</span></button>';
      }).join('') + '</div>';
  }
  // on a phone: one straight path from top to bottom, every stop on it, its name next to it (the owner, 5.11:
  // "clean nice", the stretched curve looked deformed on a narrow screen)
  function vmapHtml(done, cur) {
    const last = Math.max(-1, ...[...done]);
    return '<div class="tr-vmap' + (A.mapEnter ? ' is-enter' : '') + '" style="--fill:' + ((last + 1) / PARCURS.length * 100).toFixed(1) + '%">' +
      PARCURS.map((x, i) => '<button type="button" class="tr-vstop' + (done.has(i) ? ' is-done' : '') + (i === cur ? ' is-cur' : '') + '" data-pstep="' + i + '" style="--i:' + i + '">' +
        '<span class="tr-vdot">' + (done.has(i) ? icon('check') : icon(x.ic)) + '</span>' +
        '<span class="tr-vtxt"><small>Pasul ' + (i + 1) + '</small><b>' + esc(x.t) + '</b></span>' + (i === cur ? '<span class="tr-vnow">Acum</span>' : '') + '</button>').join('') + '</div>';
  }
  function parcursHtml() {
    const done = pdone();
    if (A.pstep == null || A.pstep < 0) { A.pstep = PARCURS.findIndex((x, i) => !done.has(i)); if (A.pstep < 0) A.pstep = 0; }
    const i = A.pstep, x = PARCURS[i];
    const stage = (STAGES.find(([a, b]) => i >= a && i < b) || STAGES[0])[2];
    return '<div class="tr-jhead"><div><b>' + done.size + ' din ' + PARCURS.length + '</b><span>pași învățați</span></div><div class="tr-jbar"><i style="--w:' + Math.round(done.size / PARCURS.length * 100) + '%"></i></div>' +
        '<span class="tr-draft-s">' + icon('pen') + 'Schiță</span></div>' +
      // one film for the whole journey (the owner, 6.11), not one per step
      vsl('parcurs', 'Filmulețul cu tot parcursul', '<div class="tr-vsl"><span class="tr-vsl-play">' + icon('video') + '</span><div><b>Filmulețul cu tot parcursul</b><span>Un singur film care arată tot drumul clientei, de la deschiderea salonului până la închidere. Vine în curând.</span></div></div>') +
      mapHtml(MAPW, 'is-wide', done, i) + mapHtml(MAPV, 'is-tall', done, i) + (A.mapEnter = false, '') +
      '<div class="tr-step" data-sheet>' +
        '<div class="tr-step-top"><span class="tr-step-stage">' + esc(stage) + ' · ' + esc(x.when) + '</span><span class="tr-step-n">Pasul ' + (i + 1) + ' din ' + PARCURS.length + '</span></div>' +
        '<h3 class="tr-step-t"><span>' + icon(x.ic) + '</span>' + esc(x.t) + '</h3>' +
        '<ul class="tr-dos">' + x.do.map((d2, k) => '<li style="--k:' + k + '"><i>' + (k + 1) + '</i>' + esc(d2) + '</li>').join('') + '</ul>' +
        '<div class="tr-whybox"><b>De ce?</b><span>' + esc(x.why) + '</span></div>' +
        (x.never ? '<div class="tr-never">' + icon('alert') + '<span>' + esc(x.never) + '</span></div>' : '') +
        (x.more ? '<div class="tr-more"><b>' + icon('info') + 'Mai multe detalii</b><ul>' + x.more.map((m) => '<li>' + esc(m) + '</li>').join('') + '</ul></div>' : '') +
        (x.shot ? '<figure class="tr-shot"><img src="/academy-shots/' + x.shot[0] + '.webp" alt="" loading="lazy"><figcaption>' + icon('info') + esc(x.shot[1]) + '</figcaption></figure>' : '') +
        (x.go ? '<div class="tr-golinks">' + x.go.map(([l, to]) => '<button type="button" class="k-btn is-outline" data-pgoto="' + to + '">' + esc(l) + icon('right') + '</button>').join('') + '</div>' : '') +
        '<div class="tr-step-nav"><button type="button" class="k-btn is-ghost" data-pgo="' + (i - 1) + '"' + (i ? '' : ' disabled') + '>' + icon('left') + 'Înapoi</button><span class="k-grow"></span>' +
          '<button type="button" class="k-btn is-primary is-lg tr-got" data-pdone="' + i + '">' + (done.has(i) ? icon('check') + 'Învățat' : 'Am înțeles') + (i < PARCURS.length - 1 ? icon('right') : '') + '</button></div>' +
      '</div>';
  }

  function burst(el) {
    const r = el.getBoundingClientRect();
    const box = document.createElement('div'); box.className = 'tr-burst'; box.style.left = (r.left + r.width / 2) + 'px'; box.style.top = (r.top + r.height / 2) + 'px';
    box.innerHTML = Array.from({ length: 14 }, (_, k) => '<i style="--a:' + (k * 360 / 14) + 'deg;--d:' + (40 + (k % 3) * 18) + 'px"></i>').join('');
    document.body.appendChild(box); setTimeout(() => box.remove(), 800);
  }
  // the cards lean toward the pointer (a computer)
  document.addEventListener('pointermove', (e) => {
    const c = e.target.closest && e.target.closest('[data-tilt]');
    document.querySelectorAll('[data-tilt].is-tilt').forEach((x) => { if (x !== c) { x.classList.remove('is-tilt'); x.style.removeProperty('--rx'); x.style.removeProperty('--ry'); } });
    if (!c || e.pointerType !== 'mouse') return;
    const r = c.getBoundingClientRect(), px = (e.clientX - r.left) / r.width - 0.5, py = (e.clientY - r.top) / r.height - 0.5;
    c.classList.add('is-tilt'); c.style.setProperty('--rx', (-py * 7).toFixed(2) + 'deg'); c.style.setProperty('--ry', (px * 9).toFixed(2) + 'deg');
    c.style.setProperty('--mx', ((px + 0.5) * 100).toFixed(1) + '%'); c.style.setProperty('--my', ((py + 0.5) * 100).toFixed(1) + '%');
  });

  // ------------------------------------------------------------------ Consultația
  // The consultation is the sheet, page by page (portal-academy-fisa.js). The manual's chapters stay under it
  // as a short list: their tests, "Drumul meu" and everyone's progress hang on them.
  function consultHtml(m) {
    // a sheet open: only its guide; the chapters and tests stay with the four sheets (less on the screen)
    if (!m || A.fisa.chosen) return window.C360Fisa.html(A.fisa);
    const p = mine();
    return window.C360Fisa.html(A.fisa) +
      '<section class="tr-ctests"><div class="tr-ctests-h"><h4>Capitolele și testele</h4><span class="k-grow"></span>' +
        (isAdmin() ? '<button type="button" class="k-btn is-ghost is-sm" data-edit>' + icon('pen') + 'Capitole</button>' : '') +
        '<button type="button" class="k-btn is-ghost is-sm" data-pdf-all>' + icon('download') + 'PDF</button></div>' +
      '<ul>' + m.chapters.map((c, i) => {
        const ref = cref(m, c), q = p.quiz[ref], read = !!p.read[ref];
        return '<li><span class="ac-num">' + num(i) + '</span><div class="tr-ctests-t"><b>' + esc(c.title) + '</b>' +
          '<span>' + (read ? '<span class="k-tag is-good">' + icon('check') + 'Citit</span>' : '') + (q ? '<span class="k-tag ' + (q.best === q.total ? 'is-good' : 'is-warn') + '">Test ' + q.best + '/' + q.total + '</span>' : '') + '</span></div>' +
          '<div class="tr-ctests-a"><button type="button" class="k-btn is-ghost is-sm" data-read="' + i + '">' + icon('book') + 'Citește</button>' +
          ((c.quiz || []).length ? '<button type="button" class="k-btn is-outline is-sm" data-quiz="' + i + '">' + icon('listCheck') + (q ? 'Din nou' : 'Test') + '</button>' : '') + '</div></li>';
      }).join('') + '</ul></section>';
  }

  // ------------------------------------------------------------------ a manual
  function manualHtml(m) {
    if (!m) return K.empty('book', 'Niciun training încă', '');
    const p = mine();
    return '<div class="ac-head"><div><h3>' + esc(m.title) + '</h3></div><div class="ac-head-actions">' +
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
        ((c.quiz || []).length ? '<button type="button" class="k-btn is-primary" data-q>' + icon('listCheck') + 'Testul</button>' : '') + (i < m.chapters.length - 1 ? '<button type="button" class="k-btn ' + ((c.quiz || []).length ? '' : 'is-primary') + '" data-next>Următorul' + icon('right') + '</button>' : ''),
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
            '<button type="button" class="k-icon-btn" data-up="' + i + '" aria-label="Mai sus"' + (i ? '' : ' disabled') + '>' + icon('up') + '</button><button type="button" class="k-icon-btn" data-down="' + i + '" aria-label="Mai jos"' + (i < list.length - 1 ? '' : ' disabled') + '>' + icon('down') + '</button>' +
            '<button type="button" class="k-icon-btn" data-rm="' + i + '" aria-label="Scoate">' + icon('trash') + '</button></div>' +
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
  // (the owner, 6.11) the treatments as important documents, not the app's usual cards: each one a protocol on paper,
  // read top to bottom, simple; a film for each one comes later
  function schemesHtml() {
    const all = D().schemes || [];
    const open = A.schemeOpen && all.find((s) => s.id === A.schemeOpen);
    if (open) return schemeDoc(open);
    const g = A.schemeGroup;
    const list = all.filter((s) => g === 'all' || s.group === g);
    const drafts = all.filter((s) => !s.verified).length;
    const p = mine();
    return '<div class="tr-bar">' + K.seg('sgroup', [['all', 'Toate'], ['fata', 'Față'], ['corp', 'Corp'], ['epilare', 'Epilare']], g) +
      (isAdmin() ? '<span class="k-grow"></span>' + (drafts ? '<span class="k-tag is-warn">' + drafts + ' de verificat</span>' : '') + '<button type="button" class="k-btn is-outline is-sm" data-scheme-new>' + icon('plus') + 'Schemă nouă</button>' : '') + '</div>' +
      (list.length ? '<div class="tr-docs">' + list.map((s, i) => '<button type="button" class="tr-doc is-' + esc(s.group) + '" data-scheme="' + esc(s.id) + '" style="--i:' + i + '">' +
        '<span class="tr-doc-k">Protocol · ' + esc(GROUP[s.group]) + '<i>PT-' + String(all.indexOf(s) + 1).padStart(2, '0') + '</i></span>' +
        '<b>' + esc(s.name) + '</b><span class="tr-doc-w">' + esc(s.what || '') + '</span>' +
        '<span class="tr-doc-m">' + (s.minutes ? '<em>' + s.minutes + ' min</em>' : '') + (s.sessions ? '<em>' + esc(s.sessions) + ' ședințe</em>' : '') + (s.city !== 'both' ? '<em>' + esc(CITY[s.city]) + '</em>' : '') +
          (isAdmin() && !s.verified ? '<em class="is-warn">ciornă</em>' : '') + (p.read[sref(s)] ? '<em class="is-ok">citit</em>' : '') + '</span></button>').join('') + '</div>'
        : K.empty('sparkles', isAdmin() ? 'Nicio schemă aici' : 'Schemele sunt în pregătire', ''));
  }
  function schemeDoc(s) {
    const all = D().schemes || [];
    const prices = (s.prices || []).map(priceOf).filter(Boolean);
    const combos = (s.combos || []).map(schemeOf).filter(Boolean);
    const read = !!mine().read[sref(s)];
    let n = 0;
    const part = (title, inner, cls) => (inner ? '<section class="tr-pd-s' + (cls ? ' ' + cls : '') + '" style="--k:' + n + '"><h4><i>' + (++n) + '</i>' + title + '</h4>' + inner + '</section>' : '');
    const list = (l) => ((l || []).length ? '<ul>' + l.map((x) => '<li>' + esc(x) + '</li>').join('') + '</ul>' : '');
    return '<div class="tr-pd-wrap"><div class="tr-case2-top"><button type="button" class="k-btn is-ghost is-sm" data-scheme-back>' + icon('left') + 'Toate tratamentele</button><span class="k-grow"></span>' +
        (isAdmin() ? '<button type="button" class="k-btn is-ghost is-sm" data-scheme-edit="' + esc(s.id) + '">' + icon('pen') + 'Editează</button><button type="button" class="k-btn is-ghost is-sm" data-scheme-ver="' + esc(s.id) + '">' + icon(s.verified ? 'x' : 'check') + (s.verified ? 'Scoate verificarea' : 'Marchează verificat') + '</button>' : '') + '</div>' +
      '<article class="tr-pd is-' + esc(s.group) + '">' +
        '<header class="tr-pd-h"><span class="tr-pd-org">Centrul360 · Protocol de tratament</span><span class="tr-pd-no">PT-' + String(all.indexOf(s) + 1).padStart(2, '0') + '</span>' +
          '<h2>' + esc(s.name) + '</h2>' + (s.what ? '<p class="tr-pd-what">' + esc(s.what) + '</p>' : '') +
          '<span class="tr-pd-stamp' + (s.verified ? '' : ' is-draft') + '">' + (s.verified ? 'Verificat' : 'Ciornă') + '</span></header>' +
        '<div class="tr-pd-facts">' + [['Durata', s.minutes ? s.minutes + ' minute' : ''], ['Ședințe', s.sessions || ''], ['Interval', s.interval || ''], ['Preț / ședință', prices.length ? prices.map((x) => lei(x.price)).join(' · ') : ''], ['Unde', CITY[s.city] || '']]
          .filter((x) => x[1]).map(([k, v]) => '<div><small>' + esc(k) + '</small><b>' + esc(v) + '</b></div>').join('') + '</div>' +
        vsl('t-' + s.id, 'Filmulețul: ' + s.name, '<div class="tr-vsl"><span class="tr-vsl-play">' + icon('video') + '</span><div><b>Filmulețul: ' + esc(s.name) + '</b><span>Tratamentul arătat pas cu pas. Vine în curând.</span></div></div>') +
        part('Pentru cine e', list(s.forWho)) +
        part('Nu faci tratamentul dacă', list(s.contra), 'is-bad') +
        part('Pașii', (s.steps || []).length ? '<ol class="tr-pd-steps">' + s.steps.map((x, k) => '<li style="--k:' + k + '"><i>' + (k + 1) + '</i><span>' + esc(x) + '</span></li>').join('') + '</ol>' : missing('Pașii nu sunt scriși.')) +
        part('Setările aparatului', list(s.settings) || missing('De completat de specialistă.')) +
        part('Ce îi spui clientei', (s.say || []).map((x) => '<blockquote>' + esc(x) + '</blockquote>').join('')) +
        part('După tratament', list(s.after)) +
        part('Se combină cu', combos.length ? '<div class="tr-chips">' + combos.map((x) => '<button type="button" class="k-chip" data-scheme="' + esc(x.id) + '">' + esc(x.name) + '</button>').join('') + '</div>' : '') +
        mediaHtml(s.media) +
        '<footer class="tr-pd-f">' + (read ? '<span class="k-tag is-good">' + icon('check') + 'Citit</span>' : '<button type="button" class="k-btn is-primary is-lg tr-got" data-scheme-read="' + esc(s.id) + '">Am citit' + icon('check') + '</button>') + '</footer>' +
      '</article></div>';
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
  // half a program: half of each procedure's sessions, rounded up (the owner, 7.11: „1,5 ședințe nu există, se rotunjește”)
  function offer(lines, low) {
    const R = rules();
    const rows = lines.map((l) => { const p = priceOf(l.price); const s = Number(l.sessions) || 0; return { l, p, s, unit: p ? p.price : 0, sub: p ? s * p.price : 0, half: Math.ceil(s / 2), halfSub: p ? Math.ceil(s / 2) * p.price : 0 }; }).filter((r) => r.p);
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
  // (the owner, 6.11) only the cases and their recommendation: the client (her picture, who she is, what she wants),
  // the program recommended for her, then the offer in its 4 steps said as a conversation. Simple, animated, no quiz.
  const OFFER_NAME = (R) => ['Tot programul, plătit azi', 'Tot programul, în ' + R.parts + ' tranșe', 'Jumătate de program, plătit azi', 'Jumătate de program, în ' + R.parts + ' tranșe'];
  function casesHtml() {
    const all = D().cases || [];
    const open = A.caseOpen && all.find((c) => c.id === A.caseOpen);
    if (open) return caseHtml(open);
    const g = A.caseGroup;
    const list = all.filter((c) => g === 'all' || c.group === g);
    const p = mine();
    const drafts = all.filter((c) => !c.verified).length;
    return '<div class="tr-bar">' + K.seg('cgroup', [['all', 'Toate'], ['fata', 'Față'], ['corp', 'Corp'], ['epilare', 'Epilare']], g) +
      (isAdmin() ? '<span class="k-grow"></span>' + (drafts ? '<span class="k-tag is-warn">' + drafts + ' de verificat</span>' : '') + '<button type="button" class="k-btn is-outline is-sm" data-case-new>' + icon('plus') + 'Caz nou</button>' : '') + '</div>' +
      (list.length ? '<div class="tr-czs">' + list.map((c, i) => {
        const r = p.cases[c.id];
        const o = offer(c.program || [], c.low);
        return '<button type="button" class="tr-cz" data-case="' + esc(c.id) + '" style="--i:' + i + '">' +
          '<span class="tr-cz-ph">' + (window.C360CaseArt ? window.C360CaseArt.html(c, false) : '') + '</span>' +
          '<span class="tr-cz-b"><span class="tr-cz-tags"><em>' + esc(GROUP[c.group]) + '</em>' + (c.city !== 'both' ? '<em>' + esc(c.city === 'tm' ? 'Timișoara' : 'Arad') + '</em>' : '') +
            (isAdmin() && !c.verified ? '<em class="is-warn">ciornă</em>' : '') + (r && r.everOk ? '<em class="is-ok">' + icon('check') + 'Învățat</em>' : '') + '</span>' +
          '<b>' + esc(c.title) + '</b><span class="tr-cz-w">' + esc(c.wants || '') + '</span>' +
          '<span class="tr-cz-f">' + (o.rows.length ? 'Program de ' + esc(lei(o.total)) + ' · 4 pași' : 'Fără tratament: află de ce') + icon('right') + '</span></span></button>';
      }).join('') + '</div>' : K.empty('users', isAdmin() ? 'Niciun caz aici' : 'Cazurile sunt în pregătire', ''));
  }
  function caseHtml(c) {
    const o = offer(c.program || [], c.low);
    const right = (c.options || []).find((x) => x.ok) || null;
    const done = mine().cases[c.id] && mine().cases[c.id].everOk;
    const N = OFFER_NAME(o.R);
    return '<div class="tr-case2">' +
      '<div class="tr-case2-top"><button type="button" class="k-btn is-ghost is-sm" data-case-back>' + icon('left') + 'Toate cazurile</button><span class="k-grow"></span>' +
        (isAdmin() ? '<button type="button" class="k-btn is-ghost is-sm" data-case-edit="' + esc(c.id) + '">' + icon('pen') + 'Editează</button>' : '') + '</div>' +
      // 1 · the client
      '<section class="tr-c2-step tr-case2-hero"><div class="tr-case2-ph">' + (window.C360CaseArt ? window.C360CaseArt.html(c, true) : '') + '</div>' +
        '<div class="tr-case2-who"><span class="tr-cz-tags"><em>' + esc(GROUP[c.group]) + '</em>' + (c.city !== 'both' ? '<em>' + esc(c.city === 'tm' ? 'Timișoara' : 'Arad') + '</em>' : '') + '</span>' +
        '<h3>' + esc(c.title) + '</h3>' + ((c.profile || []).length ? '<ul class="tr-case2-pro">' + c.profile.map((x) => '<li>' + esc(x) + '</li>').join('') + '</ul>' : '') +
        (c.wants ? '<blockquote class="tr-case2-q">' + esc(c.wants) + '</blockquote>' : '') + '</div></section>' +
      // 2 · what she is recommended, and why
      '<section class="tr-c2-step"><h3><i>1</i>Ce îi recomanzi' + (right && right.why ? '<small>Și de ce, pe înțeles.</small>' : '') + '</h3>' +
        (right ? '<p class="tr-case2-rec">' + esc(right.text) + '</p>' + (right.why ? '<div class="tr-whybox"><b>De ce?</b><span>' + esc(right.why) + '</span></div>' : '') : '') +
        (o.rows.length ? '' : '<div class="tr-never">' + icon('alert') + '<span>Aici nu se face tratament. Îi explici cu blândețe de ce și o rugăm să revină când se poate.</span></div>') + '</section>' +
      (o.rows.length
        // 3 · the program
        ? '<section class="tr-c2-step"><h3><i>2</i>Programul recomandat<small>Prețul întreg, fără reducere. Îl scrii pe pagina 1 a fișei.</small></h3>' +
          '<div class="tr-case2-prog">' + o.rows.map((r, k) => '<div class="tr-case2-line" style="--k:' + k + '"><span><b>' + esc(r.p.name) + '</b>' + (r.l.zone || r.l.interval ? '<small>' + esc([r.l.zone, r.l.interval].filter(Boolean).join(' · ')) + '</small>' : '') + '</span>' +
            '<em>' + dec(r.s) + ' × ' + esc(lei(r.unit)) + '</em><b>' + esc(lei(r.sub)) + '</b></div>').join('') +
          '<div class="tr-case2-tot"><span>Total</span><b>' + esc(lei(o.total)) + '</b></div></div>' +
          ((c.duration || c.result) ? '<p class="tr-case2-res">' + icon('clock') + esc([c.duration, c.result].filter(Boolean).join(' · ')) + '</p>' : '') + minNote(o, c.low) + '</section>' +
          // 4 · the offer, in 4 steps
          '<section class="tr-c2-step"><h3><i>3</i>Oferta, în 4 pași<small>Ca o conversație. Cel mai bine e să vă opriți la pasul 1.</small></h3><ol class="tr-c2-offers">' +
          o.pages.map((pg, k) => '<li class="tr-c2-off is-' + 'abcd'[k] + '" style="--k:' + k + '"><div class="tr-c2-oh"><span class="tr-c2-on">' + (k + 1) + '</span><div><b>' + esc(N[k]) + '</b><small>' + esc(SAYS[k]) + '</small></div><em>-' + dec(pg.off) + '%</em></div>' +
            '<div class="tr-c2-op"><b>' + esc(lei(pg.pay)) + '</b>' + (pg.parts ? '<span>adică <b>' + esc(lei(pg.pay / pg.parts)) + '</b> la fiecare din primele ' + pg.parts + ' ședințe</span>' : '<span>plătește tot azi</span>') + '</div></li>').join('') + '</ol></section>'
        : '') +
      '<div class="tr-case2-end">' + (o.rows.length ? '<button type="button" class="k-btn is-outline" data-case-calc="' + esc(c.id) + '">' + icon('wallet') + 'Deschide în calculator</button>' : '') + '<span class="k-grow"></span>' +
        (done ? '<span class="k-tag is-good">' + icon('check') + 'Învățat</span>' : '<button type="button" class="k-btn is-primary is-lg tr-got" data-case-got="' + esc(c.id) + '">Am înțeles cazul' + icon('check') + '</button>') + '</div>' +
      '</div>';
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
            (c.options.length > 2 ? '<button type="button" class="k-icon-btn" data-opt-rm="' + i + '" aria-label="Scoate varianta">' + icon('x') + '</button>' : '') + '</label><input data-ow maxlength="300" value="' + esc(o.why) + '" placeholder="De ce (apare după răspuns)"></div>').join('');
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
    if (!C || !Array.isArray(C.lines)) C = { lines: [], low: false, duration: '', result: '', grp: 'corp' };
    return C;
  }
  const keepCalc = () => { try { localStorage.setItem(CALC_KEY, JSON.stringify(C)); } catch (e) { /* private mode */ } };
  function toCalc(c) {
    C = { city: c.city === 'ar' ? 'ar' : 'tm', lines: (c.program || []).map((l) => Object.assign({}, l)), low: !!c.low, duration: c.duration || '', result: c.result || '' };
    keepCalc();
    if (PANELS.calc) PANELS.calc.querySelector('[data-view]').innerHTML = '';
    K.go('calculator');
  }
  // (the owner, 5.11) "să înțeleagă și un copil de 5 ani să-l folosească": three steps one under the other, big
  // and plain. 1: tap what you recommend, set the sessions with − and +. 2: the total. 3: the 4 offers in the order
  // she shows them. No city to choose: everyone works with her own clinic's prices (her location; an admin with
  // no clinic sees both, each marked)
  const calcCity = () => { const l = K.data && K.data.me && K.data.me.location; return l === 'Arad' ? 'ar' : l === 'Timișoara' ? 'tm' : ''; };
  const priceOk = (p) => { const c = calcCity(); return !c || p.city === 'both' || p.city === c; };
  function calcHtml() {
    const s = calcState(), city = calcCity();
    const groups = Object.keys(GROUP).filter((g) => (D().prices || []).some((p) => p.group === g && priceOk(p)));
    if (!groups.includes(s.grp)) s.grp = groups[0] || 'corp';
    const tiles = (D().prices || []).filter((p) => p.group === s.grp && priceOk(p));
    const picked = new Set(s.lines.map((l) => l.price));
    return '<div class="tr-calc tr-c2" data-calc>' +
      '<div class="tr-c2-top"><span class="tr-c2-city">' + icon('pin') + (city === 'ar' ? 'Prețuri Arad' : city === 'tm' ? 'Prețuri Timișoara' : 'Prețuri Timișoara și Arad') + '</span><span class="k-grow"></span>' +
        (isAdmin() ? '<button type="button" class="k-btn is-ghost is-sm" data-prices>' + icon('tag') + 'Prețuri și reguli</button>' : '') +
        '<button type="button" class="k-btn is-ghost is-sm" data-calc-clear>' + icon('refresh') + 'De la capăt</button></div>' +
      // 1
      '<section class="tr-c2-step"><h3><i>1</i>Ce îi recomanzi?<small>Apasă pe tratament. Apoi alegi câte ședințe.</small></h3>' +
        '<div class="tr-c2-grp">' + groups.map((g) => '<button type="button" class="tr-c2-chip' + (g === s.grp ? ' is-on' : '') + '" data-cgrp="' + g + '">' + esc(GROUP[g]) + '</button>').join('') + '</div>' +
        '<div class="tr-c2-tiles">' + tiles.map((p) => '<button type="button" class="tr-c2-tile' + (picked.has(p.id) ? ' is-on' : '') + '" data-cadd="' + esc(p.id) + '">' +
          '<span class="tr-c2-tn">' + esc(p.name) + (!city && p.city !== 'both' ? ' <em>' + (p.city === 'tm' ? 'TM' : 'AR') + '</em>' : '') + '</span><span class="tr-c2-tp">' + esc(K.lei(p.price)) + ' <small>/ ședință</small></span>' +
          '<span class="tr-c2-tick">' + icon(picked.has(p.id) ? 'check' : 'plus') + '</span></button>').join('') + '</div>' +
        '<div class="tr-c2-lines" data-lines>' + linesHtml() + '</div></section>' +
      // 2 and 3
      '<div data-calc-out></div>' +
      '<details class="tr-c2-more"' + (s.duration || s.result || s.low ? ' open' : '') + '><summary>Durata, rezultatul și excepția</summary><div class="k-form tr-calc-extra">' +
        '<div class="k-field full">' + K.toggle('clow', s.low, 'Clientă cu foarte puțină grăsime (programul pentru corp poate fi sub minim)') + '</div>' +
        K.field('Cât durează programul', '<input data-cx="duration" maxlength="60" value="' + esc(s.duration) + '" placeholder="ex. 3 luni">') +
        K.field('Ce rezultat estimezi', '<input data-cx="result" maxlength="300" value="' + esc(s.result) + '" placeholder="ex. abdomen mai plat și mai ferm">') + '</div></details>' +
      '<div class="tr-calc-actions"><button type="button" class="k-btn is-ghost" data-calc-copy>' + icon('file') + 'Copiază</button><button type="button" class="k-btn is-primary" data-calc-client>' + icon('user') + 'Salvează la clientă</button></div></div>';
  }
  function linesHtml() {
    const s = calcState();
    const rows = s.lines.map((l, i) => [l, i, priceOf(l.price)]).filter((x) => x[2]);
    if (!rows.length) return '<div class="tr-c2-empty">' + icon('sparkles') + '<span>Programul ei e gol. Apasă pe un tratament de mai sus.</span></div>';
    return '<h4 class="tr-c2-h">Programul ei</h4>' + rows.map(([l, i, p]) => '<div class="tr-c2-line" data-ci="' + i + '">' +
      '<div class="tr-c2-ln"><b>' + esc(p.name) + '</b><small>' + esc(K.lei(p.price)) + ' o ședință</small>' +
        '<input data-cz maxlength="60" value="' + esc(l.zone || '') + '" placeholder="Zona (ex. abdomen)" aria-label="Zona"></div>' +
      '<div class="tr-c2-stp"><button type="button" data-cstep="' + i + '|-1" aria-label="Mai puține">−</button><input data-cs inputmode="decimal" value="' + esc(l.sessions === '' ? '' : l.sessions) + '" aria-label="Ședințe"><button type="button" data-cstep="' + i + '|1" aria-label="Mai multe">+</button><small>ședințe</small></div>' +
      '<div class="tr-c2-sum" data-csum="' + i + '"></div>' +
      '<button type="button" class="tr-c2-rm" data-cl-rm="' + i + '" aria-label="Scoate">' + icon('x') + '</button></div>').join('');
  }
  // the four offers said as one conversation (the owner, 6.11): never a "discount, take it or leave it"; the best is
  // to stop at the first one
  const SAYS = [
    '„Pentru că începeți azi tot programul, aveți 50% reducere, cu plata integrală.” Cel mai bine e să vă opriți aici.',
    'E prea mult? „Înțeleg. Atunci ce putem face pentru dvs. este o reducere puțin mai mică, de 30%, și puteți achita în 4 tranșe.”',
    'Tot e greu? „Înțeleg perfect. Corect din partea noastră ar fi să puneți un picior pe ușă: începeți cu jumătate din program, tot cu 50% reducere. Vă obișnuiți cu noi și vedem cum răspunde corpul dvs. la aparate.”',
    'Ultima variantă: „Ca să fie cât mai ușor: aceeași jumătate de program, cu 30% reducere, în 4 tranșe.”',
  ];
  function paintCalcResults() {
    const out = panel.querySelector('[data-calc-out]');
    if (!out) return;
    const s = calcState();
    const o = offer(s.lines, s.low);
    s.lines.forEach((l, i) => { const p = priceOf(l.price); const cell = panel.querySelector('[data-csum="' + i + '"]'); if (cell) cell.innerHTML = p ? '<small>' + dec(Number(l.sessions) || 0) + ' × ' + lei(p.price) + ' =</small><b>' + lei((Number(l.sessions) || 0) * p.price) + '</b>' : ''; });
    if (!o.rows.length) { out.innerHTML = ''; return; }
    const minBox = (o.kind === 'corp' || o.kind === 'fata') ? (() => {
      const pct = Math.min(100, o.total / o.min * 100);
      const ok = o.total >= o.min || s.low;
      return '<div class="tr-c2-min' + (ok ? ' is-ok' : '') + '"><div class="tr-c2-bar"><i style="width:' + pct.toFixed(1) + '%"></i></div><span>' +
        (o.total >= o.min ? icon('check') + '<span>Bun! Programul trece de minimul de ' + lei(o.min) + '.</span>' : s.low ? icon('info') + '<span>Sub minim, pentru că e o clientă cu foarte puțină grăsime.</span>' :
          icon('alert') + '<span>Programul pentru ' + (o.kind === 'corp' ? 'corp' : 'față') + ' trebuie să fie de cel puțin ' + lei(o.min) + '. Mai adaugă ședințe sau tratamente: lipsesc <b>' + lei(o.short) + '</b>.</span>') + '</span></div>';
    })() : '';
    const SAY = SAYS;
    const NAME = ['Tot programul, plătit azi', 'Tot programul, în ' + o.R.parts + ' rate', 'Jumătate de program, plătit azi', 'Jumătate de program, în ' + o.R.parts + ' rate'];
    out.innerHTML =
      '<section class="tr-c2-step"><h3><i>2</i>Cât costă tot programul<small>Prețul întreg, fără reducere. Îl scrii pe pagina 1 a fișei.</small></h3>' +
        '<div class="tr-c2-total"><b>' + lei(o.total) + '</b><span>Jumătate de program: ' + lei(o.half) + '</span></div>' + minBox + '</section>' +
      '<section class="tr-c2-step"><h3><i>3</i>Cele 4 oferte, pe rând<small>Le arăți una câte una, în ordinea asta. Pe masă e doar una.</small></h3>' +
        '<ol class="tr-c2-offers">' + o.pages.map((p, k) => '<li class="tr-c2-off is-' + 'abcd'[k] + '" style="--k:' + k + '">' +
          '<div class="tr-c2-oh"><span class="tr-c2-on">' + (k + 1) + '</span><div><b>' + esc(NAME[k]) + '</b><small>' + esc(SAY[k]) + '</small></div><em>-' + dec(p.off) + '%</em></div>' +
          '<div class="tr-c2-op"><b>' + lei(p.pay) + '</b>' + (p.parts ? '<span>adică <b>' + lei(p.pay / p.parts) + '</b> la fiecare din primele ' + p.parts + ' ședințe</span>' : '<span>plătește tot azi</span>') + '</div>' +
          '<small class="tr-c2-how">Cum am calculat: ' + lei(p.base) + ' − ' + dec(p.off) + '% = ' + lei(p.pay) + (p.parts ? ', împărțit la ' + p.parts : '') + ' · fișa, pagina ' + p.page + '</small></li>').join('') + '</ol></section>';
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
    keepCalc();
    paintCalcResults();
  }
  function calcText() {
    const s = calcState();
    const o = offer(s.lines, s.low);
    const me = (K.data && K.data.me && K.data.me.name) || '';
    return ['Program recomandat (' + K.dateShort(K.today()) + ', ' + (calcCity() === 'ar' ? 'Arad' : calcCity() === 'tm' ? 'Timișoara' : '') + (me ? ', ' + me : '') + '):']
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
    const e = ((K.data && K.data.activeEmployees) || []).find((x) => x.id === id);
    const chapters = manualsFor(e).flatMap((m) => m.chapters.map((c) => ({ m, c, ref: cref(m, c) })));
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
        manualsFor(e).map((m) => '<section class="tr-sec"><h5>' + esc(m.title) + '</h5><ul class="tr-prog">' + m.chapters.map((c) => {
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
    const sc = t.closest('[data-scheme]');
    if (sc) { A.schemeOpen = sc.dataset.scheme; panel.querySelector('[data-view]').innerHTML = ''; render(); const v = panel.querySelector('.tr-pd-wrap'); if (v) v.scrollIntoView({ block: 'start' }); return; }
    if (t.closest('[data-scheme-back]')) { A.schemeOpen = ''; panel.querySelector('[data-view]').innerHTML = ''; return render(); }
    const sed = t.closest('[data-scheme-edit]'); if (sed) return editScheme(schemeOf(sed.dataset.schemeEdit));
    const sve = t.closest('[data-scheme-ver]');
    if (sve) { const s0 = schemeOf(sve.dataset.schemeVer); return K.busy(sve, async () => { try { await save({ upsert: { kind: 'scheme', item: Object.assign({}, s0, { verified: !s0.verified }) } }); K.ui().toast(s0.verified ? 'Scoasă de la echipă.' : 'Verificată. O vede toată echipa.', 'success'); K.reload(); } catch (err) { K.ui().toast(K.errText(err), 'error'); } }); }
    const srd = t.closest('[data-scheme-read]');
    if (srd) { const s0 = schemeOf(srd.dataset.schemeRead); return K.busy(srd, async () => { try { const j = await post({ action: 'read', ref: sref(s0) }); setMine(j.progress); burst(srd); setTimeout(render, 380); } catch (err) { K.ui().toast(K.errText(err), 'error'); } }); }
    if (t.closest('[data-scheme-new]')) return editScheme(null);
    const cs = t.closest('[data-case]');
    if (cs) { A.caseOpen = cs.dataset.case; panel.querySelector('[data-view]').innerHTML = ''; render(); const v = panel.querySelector('.tr-case2'); if (v) v.scrollIntoView({ block: 'start' }); return; }
    if (t.closest('[data-case-back]')) { A.caseOpen = ''; panel.querySelector('[data-view]').innerHTML = ''; return render(); }
    const ced = t.closest('[data-case-edit]'); if (ced) return editCase(caseOf(ced.dataset.caseEdit));
    const ccl = t.closest('[data-case-calc]'); if (ccl) return toCalc(caseOf(ccl.dataset.caseCalc));
    const cgot = t.closest('[data-case-got]');
    if (cgot) {
      const c = caseOf(cgot.dataset.caseGot);
      const ok = c ? (c.options || []).findIndex((x) => x.ok) : -1;
      return K.busy(cgot, async () => {
        try { const j = await post({ action: 'case', id: c.id, choice: Math.max(0, ok) }); setMine(j.progress); burst(cgot); setTimeout(render, 380); }
        catch (err) { K.ui().toast(K.errText(err), 'error'); }
      });
    }
    if (t.closest('[data-case-new]')) return editCase(null);
    // the calculator: a whole repaint keeps the page where it is
    const recalc = () => { keepCalc(); const v = panel.querySelector('[data-calc]'); if (!v) return; const y = window.scrollY; v.outerHTML = calcHtml(); paintCalcResults(); window.scrollTo(0, y); };
    const cg = t.closest('[data-cgrp]'); if (cg) { calcState().grp = cg.dataset.cgrp; return recalc(); }
    const ca = t.closest('[data-cadd]');
    if (ca) {
      const s = calcState(), id = ca.dataset.cadd;
      s.lines = s.lines.filter((l) => l.price);
      if (s.lines.some((l) => l.price === id)) s.lines = s.lines.filter((l) => l.price !== id); else s.lines.push({ price: id, sessions: 1, zone: '', interval: '' });
      return recalc();
    }
    const cst = t.closest('[data-cstep]');
    if (cst) { const [i, d] = cst.dataset.cstep.split('|'); const l = calcState().lines[+i]; if (l) l.sessions = Math.max(1, Math.min(60, Math.round((Number(l.sessions) || 0) + Number(d)))); return recalc(); }
    const cr = t.closest('[data-cl-rm]'); if (cr) { calcState().lines.splice(+cr.dataset.clRm, 1); return recalc(); }
    if (t.closest('[data-calc-clear]')) { C = null; try { localStorage.removeItem(CALC_KEY); } catch (x) { /* private */ } panel.querySelector('[data-view]').innerHTML = ''; return render(); }
    const sb = t.closest('[data-sub]');
    if (sb) { A.pick[areaNow() + ':' + viewRole()] = sb.dataset.sub; panel.querySelector('[data-view]').innerHTML = ''; return render(); }
    const zn = t.closest('[data-zone]');
    if (zn) { A.zone = zn.dataset.zone; A.mapEnter = true; panel.querySelector('[data-view]').innerHTML = ''; render(); panel.scrollIntoView({ block: 'start' }); return; }
    const ps = t.closest('[data-pstep],[data-pgo]');
    if (ps && !ps.disabled) { A.pstep = +(ps.dataset.pstep != null ? ps.dataset.pstep : ps.dataset.pgo); render(); const sh = panel.querySelector('[data-sheet]'); if (sh && window.innerWidth < 900) sh.scrollIntoView({ behavior: 'smooth', block: 'start' }); return; }
    const gl = t.closest('[data-glesson]');
    if (gl && !gl.disabled) { A.gstep = +gl.dataset.glesson; render(); const sh = panel.querySelector('[data-gsheet]'); if (sh && window.innerWidth < 900) sh.scrollIntoView({ behavior: 'smooth', block: 'start' }); return; }
    const gd = t.closest('[data-gdone]');
    if (gd) {
      const list = window.C360Guide.lessons(viewRole()), i = +gd.dataset.gdone, set = gdone();
      set.add(list[i].id); gsave(set); burst(gd);
      setTimeout(() => { A.gstep = Math.min(list.length - 1, i + 1); render(); if (list.every((x) => set.has(x.id)) && i === list.length - 1) K.ui().toast('Bravo! Știi tot portalul.', 'success'); }, 380);
      return;
    }
    const gg = t.closest('[data-ggo]');
    if (gg) { const to = gg.dataset.ggo; if (to === 'account') return K.openAccount && K.openAccount(); if (to === 'notif') return K.openNotifications && K.openNotifications(); return K.go(to); }
    const pg2 = t.closest('[data-pgoto]');
    if (pg2) {
      const to = pg2.dataset.pgoto;
      if (to === 'calc') return K.go('calculator');
      const sheet = to.split(':')[1];
      A.fisa.sheet = sheet; A.fisa.page = 0; A.fisa.on = -1; A.fisa.chosen = true;
      A.zone = 'consult'; A.pick['vanzari:' + viewRole()] = 'm:consultatie';
      panel.querySelector('[data-view]').innerHTML = ''; render(); panel.scrollIntoView({ block: 'start' });
      return;
    }
    const pd = t.closest('[data-pdone]');
    if (pd) {
      const i = +pd.dataset.pdone, set = pdone();
      set.add(i); psave(set);
      burst(pd);
      setTimeout(() => { A.pstep = Math.min(PARCURS.length - 1, i + 1); render(); if (set.size === PARCURS.length && i === PARCURS.length - 1) K.ui().toast('Bravo! Ai învățat tot parcursul clientei.', 'success'); }, 380);
      return;
    }
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
  const css2 = `
.tr-doors{ display:grid; grid-template-columns:repeat(3,minmax(0,1fr)); gap:1.1rem; min-height:min(calc(100dvh - 240px), 560px); perspective:1200px; }
.tr-door{ --c1:#5b8cff; --c2:#22d3ee; position:relative; display:flex; flex-direction:column; justify-content:flex-end; align-items:flex-start; gap:.4rem; padding:1.8rem; min-height:300px; text-align:left;
  border-radius:30px; border:1px solid color-mix(in srgb, var(--fg) 9%, transparent); color:var(--fg); font:inherit; cursor:pointer; overflow:hidden; isolation:isolate;
  background:linear-gradient(180deg, color-mix(in srgb, var(--fg) 6%, transparent), color-mix(in srgb, var(--fg) 1.5%, transparent)), var(--paper);
  box-shadow:0 1px 0 color-mix(in srgb, var(--fg) 8%, transparent) inset, 0 30px 60px -40px rgba(0,0,0,.8);
  transform:rotateX(var(--rx,0)) rotateY(var(--ry,0)); transform-style:preserve-3d;
  transition:transform .5s cubic-bezier(.16,1,.3,1), box-shadow .4s, border-color .3s; animation:trRise .7s cubic-bezier(.16,1,.3,1) both; animation-delay:calc(var(--i) * 90ms); }
.tr-door.is-b{ --c1:#a855f7; --c2:#ec4899; } .tr-door.is-c{ --c1:#f97316; --c2:#f43f5e; } .tr-door.is-d{ --c1:#10b981; --c2:#06b6d4; }
@media (min-width:1101px){ .tr-doors{ grid-template-columns:repeat(4,minmax(0,1fr)); } .tr-door{ padding:1.6rem; } .tr-door b{ font-size:1.6rem; } }
.gd-list{ display:grid; grid-template-columns:repeat(auto-fill,minmax(168px,1fr)); gap:.6rem; margin:.4rem 0 1.1rem; }
.gd-l{ display:flex; align-items:center; gap:.65rem; min-width:0; padding:.7rem .8rem; border-radius:18px; border:1px solid color-mix(in srgb, var(--fg) 9%, transparent); background:var(--glass);
  color:var(--fg); text-align:left; cursor:pointer; font:inherit; transition:transform .35s cubic-bezier(.16,1,.3,1), border-color .3s, box-shadow .3s; animation:gdIn .5s cubic-bezier(.16,1,.3,1) both; animation-delay:calc(var(--i) * 30ms); }
.gd-l:hover{ transform:translateY(-2px); border-color:color-mix(in srgb, var(--fg) 18%, transparent); }
.gd-l b{ font-size:.95rem; font-weight:700; letter-spacing:-.01em; line-height:1.25; min-width:0; }
.gd-ic{ width:34px; height:34px; flex:none; border-radius:12px; display:grid; place-items:center; color:#fff; background:linear-gradient(145deg,#10b981,#06b6d4); }
.gd-ic .k-ic{ width:18px; height:18px; }
.gd-l.is-done .gd-ic{ background:color-mix(in srgb, #10b981 22%, transparent); color:#10b981; }
.gd-l.is-cur{ border-color:#10b981; box-shadow:0 0 0 3px color-mix(in srgb, #10b981 22%, transparent); }
.gd-step .tr-step-stage{ color:#10b981; }
.gd-step .tr-step-t span{ background:linear-gradient(145deg,#10b981,#06b6d4); }
@keyframes gdIn{ from{ opacity:0; transform:translateY(8px); } to{ opacity:1; transform:none; } }
@media (max-width:760px){ .gd-step .tr-whybox{ flex-direction:column; gap:.15rem; } .gd-list{ grid-template-columns:1fr 1fr; } .gd-l{ padding:.6rem .65rem; gap:.5rem; } .gd-ic{ width:30px; height:30px; border-radius:10px; } .gd-l b{ font-size:.88rem; } }
@media (prefers-reduced-motion:reduce){ .gd-l{ animation:none; } }
.tr-door.is-tilt{ transition:transform .12s linear, box-shadow .4s, border-color .3s; }
.tr-door:hover{ border-color:color-mix(in srgb, var(--fg) 20%, transparent); box-shadow:0 1px 0 color-mix(in srgb, var(--fg) 10%, transparent) inset, 0 40px 80px -40px color-mix(in srgb, var(--c1) 70%, transparent); }
.tr-door:active{ transform:scale(.98); }
.tr-door-glow{ position:absolute; inset:-30%; z-index:-1; background:radial-gradient(40% 40% at var(--mx,70%) var(--my,20%), color-mix(in srgb, var(--c1) 55%, transparent), transparent 70%),
  radial-gradient(45% 45% at 15% 95%, color-mix(in srgb, var(--c2) 35%, transparent), transparent 70%); opacity:.55; transition:opacity .4s; animation:trFloat 9s ease-in-out infinite alternate; }
.tr-door:hover .tr-door-glow{ opacity:.9; }
.tr-door-n{ position:absolute; top:1.3rem; right:1.5rem; font-size:4.5rem; font-weight:800; letter-spacing:-.06em; line-height:1; color:color-mix(in srgb, var(--fg) 7%, transparent); }
.tr-door-ic{ position:absolute; top:1.5rem; left:1.5rem; width:62px; height:62px; border-radius:20px; display:grid; place-items:center; color:#fff;
  background:linear-gradient(145deg, var(--c1), var(--c2)); box-shadow:0 12px 30px -10px var(--c1), inset 0 1px 0 rgba(255,255,255,.4); transform:translateZ(30px); animation:trBob 4s ease-in-out infinite; animation-delay:calc(var(--i) * .6s); }
.tr-door-ic .k-ic{ width:30px; height:30px; }
.tr-door-k{ font-size:.78rem; font-weight:700; letter-spacing:.1em; text-transform:uppercase; color:color-mix(in srgb, var(--c2) 70%, #fff); }
.tr-door b{ font-size:1.75rem; font-weight:800; letter-spacing:-.035em; line-height:1.1; transform:translateZ(20px); }
.tr-door-sub{ font-size:.98rem; color:var(--muted); line-height:1.45; max-width:30ch; padding-right:3.2rem; }
.tr-door-prog{ width:calc(100% - 3.4rem); max-width:220px; height:6px; border-radius:6px; background:color-mix(in srgb, var(--fg) 8%, transparent); overflow:hidden; margin-top:.5rem; }
.tr-door-prog i{ display:block; height:100%; width:var(--w); border-radius:inherit; background:linear-gradient(90deg, var(--c1), var(--c2)); }
.tr-door-go{ position:absolute; bottom:1.6rem; right:1.5rem; width:40px; height:40px; border-radius:50%; display:grid; place-items:center; background:color-mix(in srgb, var(--fg) 8%, transparent); color:var(--fg); font-style:normal; transition:transform .3s cubic-bezier(.16,1,.3,1), background .3s; }
.tr-door:hover .tr-door-go{ transform:translateX(4px); background:linear-gradient(145deg, var(--c1), var(--c2)); color:#fff; }
@keyframes trRise{ from{ opacity:0; transform:translateY(24px) scale(.97); } to{ opacity:1; transform:none; } }
@keyframes trFloat{ from{ transform:translate(0,0); } to{ transform:translate(4%, -3%); } }
@keyframes trBob{ 0%,100%{ transform:translateZ(30px) translateY(0); } 50%{ transform:translateZ(30px) translateY(-5px); } }
.tr-zonebar{ display:flex; flex-wrap:wrap; align-items:center; gap:.5rem; margin-bottom:1rem; }
.tr-zonebar h3{ display:inline-flex; align-items:center; gap:.45rem; margin:0 .4rem; font-size:1.1rem; }
.tr-zonebar h3 .k-ic{ width:18px; height:18px; color:var(--accent); }
/* the journey map */
.tr-jhead{ display:flex; align-items:center; gap:1rem; margin-bottom:.6rem; }
.tr-jhead b{ display:block; font-size:1.3rem; font-weight:800; letter-spacing:-.02em; } .tr-jhead span{ font-size:.8rem; color:var(--muted); }
.tr-jbar{ flex:1; height:8px; border-radius:8px; background:var(--glass); overflow:hidden; }
.tr-jbar i{ display:block; height:100%; width:var(--w); border-radius:inherit; background:linear-gradient(90deg,#22d3ee,#5b8cff,#a855f7); transition:width .8s cubic-bezier(.16,1,.3,1); }
.tr-draft-s{ display:inline-flex; align-items:center; gap:.3rem; padding:.3rem .6rem; border-radius:999px; background:var(--warn-soft); color:var(--warn) !important; font-size:.72rem !important; font-weight:700; }
.tr-draft-s .k-ic{ width:12px; height:12px; }
.tr-map{ position:relative; width:100%; border-radius:28px; margin-bottom:1rem; overflow:hidden;
  background:radial-gradient(60% 80% at 20% 0%, rgba(91,140,255,.16), transparent 60%), radial-gradient(50% 70% at 100% 100%, rgba(168,85,247,.16), transparent 60%), var(--paper);
  border:1px solid color-mix(in srgb, var(--fg) 8%, transparent); }
.tr-map.is-wide{ height:420px; }
.tr-map > svg{ position:absolute; inset:6% 4%; width:92%; height:88%; overflow:visible; }
.tr-road-bg{ fill:none; stroke:color-mix(in srgb, var(--fg) 7%, transparent); stroke-width:16px; vector-effect:non-scaling-stroke; stroke-linecap:round; }
.tr-road{ fill:none; stroke:color-mix(in srgb, var(--fg) 35%, transparent); stroke-width:3px; vector-effect:non-scaling-stroke; stroke-linecap:round; stroke-dasharray:2 3; animation:trDash 20s linear infinite; }
.tr-map.is-enter .tr-road{ animation:trRoad 1.6s ease-out both, trDash 20s linear infinite; }
@keyframes trRoad{ from{ opacity:0; } to{ opacity:1; } }
@keyframes trDash{ to{ stroke-dashoffset:-100; } }
.tr-stop{ position:absolute; width:0; height:0; border:0; background:none; padding:0; color:var(--fg); font:inherit; cursor:pointer; }
.tr-stop-dot{ position:absolute; left:0; top:0; width:52px; height:52px; margin:-26px 0 0 -26px; border-radius:17px; display:grid; place-items:center; background:var(--paper); border:1px solid color-mix(in srgb, var(--fg) 14%, transparent); color:var(--fg);
  box-shadow:0 10px 24px -12px rgba(0,0,0,.8); transition:transform .3s cubic-bezier(.34,1.56,.64,1), background .3s; }
.tr-map.is-enter .tr-stop-dot, .tr-map.is-enter .tr-stop-l{ animation:trPop .6s cubic-bezier(.34,1.56,.64,1) both; animation-delay:calc(.3s + var(--i) * 70ms); }
.tr-stop-dot .k-ic{ width:23px; height:23px; }
.tr-stop:hover .tr-stop-dot{ transform:translateY(-3px) scale(1.06); }
.tr-stop.is-done .tr-stop-dot{ background:linear-gradient(145deg,#22c55e,#10b981); border-color:transparent; color:#fff; }
.tr-stop.is-cur .tr-stop-dot{ background:linear-gradient(145deg,#5b8cff,#a855f7); border-color:transparent; color:#fff; box-shadow:0 0 0 5px rgba(124,140,255,.22), 0 14px 30px -12px #7c6cff; }
.tr-stop-l{ position:absolute; left:0; top:36px; transform:translateX(-50%); white-space:nowrap; display:flex; align-items:center; gap:.35rem; padding:.22rem .65rem .22rem .3rem; border-radius:999px;
  background:var(--paper); border:1px solid color-mix(in srgb, var(--fg) 8%, transparent); font-size:.76rem; font-weight:600; line-height:1.2; }
.tr-stop-l small{ display:grid; place-items:center; width:18px; height:18px; border-radius:50%; background:color-mix(in srgb, var(--fg) 10%, transparent); font-size:.64rem; font-weight:800; color:var(--muted); }
.tr-stop.is-cur .tr-stop-l{ border-color:rgba(124,140,255,.55); }
@keyframes trPop{ from{ opacity:0; scale:.5; } to{ opacity:1; scale:1; } }
/* the phone's path */
.tr-vmap{ display:none; position:relative; margin-bottom:1rem; padding:.4rem 0; }
.tr-vmap::before, .tr-vmap::after{ content:''; position:absolute; left:27px; top:36px; bottom:36px; width:3px; margin-left:-1.5px; border-radius:3px; background:color-mix(in srgb, var(--fg) 10%, transparent); }
.tr-vmap::after{ bottom:auto; height:calc((100% - 72px) * var(--fill) / 100); background:linear-gradient(180deg,#22c55e,#10b981); transition:height .8s cubic-bezier(.16,1,.3,1); }
.tr-vstop{ position:relative; z-index:1; display:flex; align-items:center; gap:.9rem; width:100%; padding:.45rem 0; border:0; background:none; color:var(--fg); font:inherit; text-align:left; cursor:pointer; }
.tr-vmap.is-enter .tr-vstop{ animation:trSheet .5s cubic-bezier(.16,1,.3,1) both; animation-delay:calc(var(--i) * 45ms); }
.tr-vdot{ flex:none; width:54px; height:54px; border-radius:18px; display:grid; place-items:center; background:var(--paper); border:1px solid color-mix(in srgb, var(--fg) 14%, transparent); box-shadow:0 8px 20px -12px rgba(0,0,0,.9); transition:transform .3s cubic-bezier(.34,1.56,.64,1); }
.tr-vdot .k-ic{ width:23px; height:23px; }
.tr-vstop:active .tr-vdot{ transform:scale(.94); }
.tr-vstop.is-done .tr-vdot{ background:linear-gradient(145deg,#22c55e,#10b981); border-color:transparent; color:#fff; }
.tr-vstop.is-cur .tr-vdot{ background:linear-gradient(145deg,#5b8cff,#a855f7); border-color:transparent; color:#fff; box-shadow:0 0 0 5px rgba(124,140,255,.22), 0 14px 30px -12px #7c6cff; }
.tr-vtxt{ display:flex; flex-direction:column; min-width:0; }
.tr-vtxt small{ font-size:.7rem; font-weight:700; letter-spacing:.05em; text-transform:uppercase; color:var(--muted); }
.tr-vtxt b{ font-size:1.05rem; font-weight:700; letter-spacing:-.01em; }
.tr-vstop.is-done .tr-vtxt b{ color:var(--muted); }
.tr-vnow{ margin-left:auto; padding:.25rem .65rem; border-radius:999px; background:rgba(124,140,255,.16); color:var(--accent); font-size:.72rem; font-weight:700; }
/* the step's card */
.tr-step{ position:relative; min-width:0; max-width:100%; box-sizing:border-box; padding:1.6rem; border-radius:28px; border:1px solid color-mix(in srgb, var(--fg) 10%, transparent); background:linear-gradient(180deg, color-mix(in srgb, var(--fg) 5%, transparent), color-mix(in srgb, var(--fg) 1%, transparent)), var(--paper);
  box-shadow:0 30px 60px -40px rgba(0,0,0,.9); animation:trSheet .5s cubic-bezier(.16,1,.3,1) both; }
@keyframes trSheet{ from{ opacity:0; transform:translateY(16px); } to{ opacity:1; transform:none; } }
.tr-step-top{ display:flex; flex-wrap:wrap; justify-content:space-between; gap:.3rem .6rem; font-size:.78rem; font-weight:600; color:var(--muted); margin-bottom:.5rem; }
.tr-step-stage{ color:color-mix(in srgb, #5b8cff 75%, #fff); text-transform:uppercase; letter-spacing:.08em; }
.tr-step-t{ display:flex; align-items:center; gap:.75rem; margin:0 0 1.1rem; font-size:1.9rem; font-weight:800; letter-spacing:-.035em; }
.tr-step-t span{ width:48px; height:48px; border-radius:16px; display:grid; place-items:center; background:linear-gradient(145deg,#5b8cff,#a855f7); color:#fff; flex:none; }
.tr-step-t .k-ic{ width:24px; height:24px; }
.tr-dos{ list-style:none; margin:0 0 1rem; padding:0; display:flex; flex-direction:column; gap:.55rem; }
.tr-dos li{ display:flex; align-items:center; gap:.85rem; padding:.85rem 1rem; border-radius:18px; background:var(--glass); font-size:1.12rem; font-weight:500; line-height:1.35;
  animation:trSheet .45s cubic-bezier(.16,1,.3,1) both; animation-delay:calc(.1s + var(--k) * 80ms); }
.tr-dos li i{ width:30px; height:30px; flex:none; border-radius:50%; display:grid; place-items:center; background:color-mix(in srgb, var(--fg) 10%, transparent); font-style:normal; font-weight:800; font-size:.85rem; }
.tr-whybox{ display:flex; gap:.6rem; align-items:baseline; padding:.9rem 1.1rem; border-radius:18px; background:rgba(91,140,255,.12); color:var(--fg); font-size:1.02rem; margin-bottom:.6rem; }
.tr-whybox b{ color:var(--accent); }
.tr-never{ display:flex; gap:.6rem; align-items:center; padding:.9rem 1.1rem; border-radius:18px; background:var(--bad-soft); color:var(--bad); font-weight:600; margin-bottom:.6rem; }
.tr-never .k-ic{ width:20px; height:20px; flex:none; }
.tr-photo{ display:flex; align-items:center; justify-content:center; gap:.5rem; height:140px; margin-top:.4rem; border-radius:18px; border:1.5px dashed color-mix(in srgb, var(--fg) 14%, transparent); color:var(--muted); font-size:.85rem; }
.tr-step-nav{ display:flex; align-items:center; gap:.6rem; margin-top:1.2rem; }
.tr-got{ background:linear-gradient(145deg,#5b8cff,#a855f7) !important; border:0 !important; color:#fff !important; box-shadow:0 14px 30px -14px #7c6cff; }
.tr-burst{ position:fixed; z-index:500; width:0; height:0; pointer-events:none; }
.tr-burst i{ position:absolute; width:8px; height:8px; border-radius:50%; background:hsl(calc(var(--a) / 1), 90%, 65%); animation:trBurst .75s cubic-bezier(.16,1,.3,1) forwards; }
@keyframes trBurst{ from{ transform:rotate(var(--a)) translateX(0) scale(1); opacity:1; } to{ transform:rotate(var(--a)) translateX(var(--d)) scale(.2); opacity:0; } }
@media (max-width:900px){ .tr-map.is-wide{ display:none; } }
/* the phone: the same map as on a computer (the road, the stops with their icons, the colours of done and now), standing up; each
   name sits beside its stop, on the side with room, and may take two lines (nothing cut, nothing wider than the screen) */
.tr-map.is-tall{ display:none; }
@media (max-width:900px){
  .tr-map.is-tall{ display:block; height:calc(11 * 86px); border-radius:24px; }
  .tr-map.is-tall .tr-stop-dot{ width:46px; height:46px; margin:-23px 0 0 -23px; border-radius:15px; }
  .tr-map.is-tall .tr-stop-dot .k-ic{ width:21px; height:21px; }
  .tr-map.is-tall .tr-stop-l{ top:0; transform:translateY(-50%); white-space:normal; width:max-content; max-width:min(56vw, 210px); padding:.32rem .7rem .32rem .32rem; border-radius:14px; font-size:.8rem; }
  .tr-map.is-tall .tr-stop.is-r .tr-stop-l{ left:32px; }
  .tr-map.is-tall .tr-stop.is-c .tr-stop-l{ max-width:calc(50vw - 64px); }
  .tr-map.is-tall .tr-stop.is-l .tr-stop-l{ left:auto; right:32px; flex-direction:row-reverse; padding:.32rem .32rem .32rem .7rem; text-align:right; }
}
@media (prefers-reduced-motion:reduce){ .tr-door, .tr-door-ic, .tr-door-glow, .tr-stop-dot, .tr-stop-l, .tr-vstop, .tr-road, .tr-step, .tr-dos li{ animation:none !important; } }
/* the offer calculator, step by step */
.tr-c2{ gap:1.1rem; }
.tr-c2-top{ display:flex; align-items:center; gap:.5rem; flex-wrap:wrap; }
.tr-c2-city{ display:inline-flex; align-items:center; gap:.35rem; padding:.35rem .75rem; border-radius:999px; background:var(--glass); font-size:.82rem; font-weight:600; }
.tr-c2-city .k-ic{ width:14px; height:14px; color:#7c8cff; }
.tr-c2-step{ padding:1.3rem; border-radius:26px; border:1px solid var(--line); background:linear-gradient(180deg, color-mix(in srgb, var(--fg) 4%, transparent), transparent), var(--paper); animation:trSheet .5s cubic-bezier(.16,1,.3,1) both; }
.tr-c2-step h3{ display:flex; flex-wrap:wrap; align-items:center; gap:.2rem .7rem; margin:0 0 1rem; font-size:1.35rem; font-weight:800; letter-spacing:-.02em; }
.tr-c2-step h3 i{ font-style:normal; width:34px; height:34px; border-radius:12px; display:grid; place-items:center; font-size:1rem; color:#fff; background:linear-gradient(145deg,#5b8cff,#a855f7); box-shadow:0 10px 22px -12px #7c6cff; }
.tr-c2-step h3 small{ flex-basis:100%; font-size:.9rem; font-weight:500; letter-spacing:0; color:var(--muted); }
.tr-c2-grp{ display:inline-flex; gap:.25rem; padding:.25rem; border-radius:14px; background:var(--glass); margin-bottom:.9rem; }
.tr-c2-chip{ border:0; background:none; color:var(--muted); font:inherit; font-weight:600; font-size:.9rem; padding:.45rem 1rem; border-radius:11px; cursor:pointer; transition:background .2s, color .2s; }
.tr-c2-chip.is-on{ background:var(--paper); color:var(--fg); box-shadow:0 4px 14px -6px rgba(0,0,0,.5); }
.tr-c2-tiles{ display:grid; grid-template-columns:repeat(auto-fill, minmax(190px, 1fr)); gap:.55rem; }
.tr-c2-tile{ position:relative; display:flex; flex-direction:column; align-items:flex-start; gap:.3rem; min-height:86px; padding:.8rem 2.6rem .8rem .9rem; border-radius:18px; border:1px solid var(--line); background:var(--glass); color:inherit; font:inherit; text-align:left; cursor:pointer;
  transition:transform .3s cubic-bezier(.34,1.56,.64,1), border-color .2s, background .2s; }
.tr-c2-tile:hover{ transform:translateY(-2px); } .tr-c2-tile:active{ transform:scale(.97); }
.tr-c2-tn{ font-weight:600; font-size:.9rem; line-height:1.25; } .tr-c2-tn em{ font-style:normal; font-size:.68rem; font-weight:800; color:var(--accent); }
.tr-c2-tp{ white-space:nowrap; margin-top:auto; font-weight:800; font-size:1rem; font-variant-numeric:tabular-nums; } .tr-c2-tp small{ font-weight:500; color:var(--muted); font-size:.72rem; }
.tr-c2-tick{ position:absolute; top:.7rem; right:.7rem; width:26px; height:26px; border-radius:50%; display:grid; place-items:center; background:color-mix(in srgb, var(--fg) 8%, transparent); transition:background .2s, transform .3s cubic-bezier(.34,1.56,.64,1); }
.tr-c2-tick .k-ic{ width:15px; height:15px; }
.tr-c2-tile.is-on{ border-color:transparent; background:linear-gradient(160deg, rgba(91,140,255,.22), rgba(168,85,247,.14)); box-shadow:0 0 0 2px #7c8cff inset; }
.tr-c2-tile.is-on .tr-c2-tick{ background:linear-gradient(145deg,#5b8cff,#a855f7); color:#fff; transform:scale(1.1); }
.tr-c2-h{ margin:1.3rem 0 .6rem; font-size:.78rem; font-weight:700; letter-spacing:.06em; text-transform:uppercase; color:var(--muted); }
.tr-c2-empty{ display:flex; align-items:center; gap:.6rem; margin-top:1rem; padding:1rem 1.1rem; border-radius:18px; border:1.5px dashed var(--line); color:var(--muted); }
.tr-c2-line{ position:relative; display:grid; grid-template-columns:minmax(0,1fr) auto auto; align-items:center; gap:1rem; padding:.9rem 2.8rem .9rem 1rem; border-radius:20px; background:var(--glass); margin-bottom:.5rem; animation:trSheet .4s cubic-bezier(.16,1,.3,1) both; }
.tr-c2-ln{ display:flex; flex-direction:column; gap:.15rem; min-width:0; } .tr-c2-ln b{ font-size:1rem; } .tr-c2-ln small{ color:var(--muted); font-size:.78rem; }
.tr-c2-ln input{ margin-top:.35rem; max-width:240px; font-size:.85rem; padding:.4rem .6rem; }
.tr-c2-stp{ display:flex; align-items:center; gap:.3rem; }
.tr-c2-stp button{ width:40px; height:40px; border-radius:50%; border:0; background:color-mix(in srgb, var(--fg) 10%, transparent); color:var(--fg); font-size:1.35rem; font-weight:600; line-height:1; cursor:pointer; transition:transform .2s; }
.tr-c2-stp button:active{ transform:scale(.88); }
.tr-c2-stp input{ width:52px; text-align:center; font-size:1.25rem; font-weight:800; padding:.3rem 0; border-radius:12px; font-variant-numeric:tabular-nums; }
.tr-c2-stp small{ color:var(--muted); font-size:.78rem; margin-left:.2rem; }
.tr-c2-sum{ display:flex; flex-direction:column; align-items:flex-end; min-width:110px; } .tr-c2-sum small{ color:var(--muted); font-size:.74rem; } .tr-c2-sum b{ font-size:1.15rem; font-variant-numeric:tabular-nums; }
.tr-c2-rm{ position:absolute; top:.6rem; right:.6rem; width:28px; height:28px; border-radius:50%; border:0; background:none; color:var(--muted); display:grid; place-items:center; cursor:pointer; }
.tr-c2-rm:hover{ background:color-mix(in srgb, var(--fg) 8%, transparent); color:var(--fg); } .tr-c2-rm .k-ic{ width:15px; height:15px; }
.tr-c2-total{ display:flex; flex-wrap:wrap; align-items:baseline; gap:.3rem 1rem; } .tr-c2-total b{ font-size:2.6rem; font-weight:800; letter-spacing:-.03em; font-variant-numeric:tabular-nums; } .tr-c2-total span{ color:var(--muted); }
.tr-c2-min{ margin-top:.9rem; display:flex; flex-direction:column; gap:.55rem; padding:.85rem 1rem; border-radius:18px; background:var(--warn-soft); color:var(--warn); font-weight:600; }
.tr-c2-min.is-ok{ background:var(--good-soft); color:var(--good); }
.tr-c2-min > span{ display:flex; gap:.5rem; align-items:flex-start; } .tr-c2-min .k-ic{ width:18px; height:18px; flex:none; margin-top:.1rem; }
.tr-c2-bar{ height:8px; border-radius:8px; background:color-mix(in srgb, var(--fg) 10%, transparent); overflow:hidden; } .tr-c2-bar i{ display:block; height:100%; border-radius:inherit; background:currentColor; transition:width .6s cubic-bezier(.16,1,.3,1); }
.tr-c2-offers{ list-style:none; margin:0; padding:0; display:flex; flex-direction:column; gap:.6rem; counter-reset:none; }
.tr-c2-off{ --g1:#22c55e; position:relative; padding:1rem 1.1rem; border-radius:20px; background:var(--glass); border:1px solid var(--line); animation:trSheet .45s cubic-bezier(.16,1,.3,1) both; animation-delay:calc(var(--k) * 70ms); }
.tr-c2-off.is-b{ --g1:#5b8cff; } .tr-c2-off.is-c{ --g1:#f59e0b; } .tr-c2-off.is-d{ --g1:#ec4899; }
.tr-c2-off:not(:last-child)::after{ content:'↓ dacă spune „nu”'; position:absolute; left:2.9rem; bottom:-.62rem; z-index:1; padding:0 .5rem; border-radius:999px; background:var(--paper); color:var(--muted); font-size:.7rem; font-weight:600; }
.tr-c2-oh{ display:flex; align-items:center; gap:.8rem; } .tr-c2-oh div{ flex:1; min-width:0; display:flex; flex-direction:column; } .tr-c2-oh b{ font-size:1.02rem; } .tr-c2-oh small{ color:var(--muted); font-size:.82rem; }
.tr-c2-on{ width:34px; height:34px; flex:none; border-radius:12px; display:grid; place-items:center; font-weight:800; color:#fff; background:var(--g1); box-shadow:0 10px 20px -12px var(--g1); }
.tr-c2-oh em{ font-style:normal; font-weight:800; font-size:.85rem; padding:.25rem .6rem; border-radius:999px; color:var(--g1); background:color-mix(in srgb, var(--g1) 15%, transparent); }
.tr-c2-op{ display:flex; flex-wrap:wrap; align-items:baseline; gap:.2rem .8rem; margin:.7rem 0 .3rem 2.9rem; } .tr-c2-op > b{ font-size:1.7rem; font-weight:800; letter-spacing:-.02em; font-variant-numeric:tabular-nums; } .tr-c2-op span{ color:var(--muted); } .tr-c2-op span b{ color:var(--fg); }
.tr-c2-how{ display:block; margin-left:2.9rem; color:var(--muted); font-size:.74rem; }
.tr-c2-more{ border-radius:20px; border:1px solid var(--line); padding:.2rem 1rem; } .tr-c2-more summary{ cursor:pointer; padding:.7rem 0; font-weight:600; }
@media (max-width:760px){
  .tr-c2-step{ padding:1rem; border-radius:22px; } .tr-c2-tiles{ grid-template-columns:1fr 1fr; } .tr-c2-tile{ min-height:96px; }
  .tr-c2-line{ grid-template-columns:1fr; gap:.7rem; padding-right:1rem; } .tr-c2-ln{ padding-right:1.8rem; } .tr-c2-ln input{ max-width:none; }
  .tr-c2-sum{ flex-direction:row; align-items:baseline; justify-content:space-between; gap:.5rem; min-width:0; padding-top:.6rem; border-top:1px solid var(--line); } .tr-c2-sum small{ white-space:nowrap; }
  .tr-c2-total b{ font-size:2.1rem; } .tr-c2-op{ margin-left:0; } .tr-c2-how{ margin-left:0; }
}
.tr-vsl{ display:flex; align-items:center; gap:1rem; padding:1rem 1.2rem; margin-bottom:1rem; border-radius:24px; border:1.5px dashed color-mix(in srgb, var(--fg) 16%, transparent); background:var(--glass); }
.tr-vsl-play{ flex:none; width:52px; height:52px; border-radius:50%; display:grid; place-items:center; color:#fff; background:linear-gradient(145deg,#5b8cff,#a855f7); box-shadow:0 12px 26px -12px #7c6cff; }
.tr-vsl-play .k-ic{ width:24px; height:24px; }
.tr-vsl div{ display:flex; flex-direction:column; gap:.15rem; } .tr-vsl b{ font-size:1.05rem; } .tr-vsl span{ color:var(--muted); font-size:.88rem; }
.tr-vsl.is-on{ display:block; padding:0; border:0; background:none; margin:0 0 1.1rem; }
.tr-vsl.is-on video{ display:block; width:100%; aspect-ratio:16/9; border-radius:22px; background:#0f1a19; box-shadow:0 22px 50px -28px rgba(10,60,55,.55); border:1px solid color-mix(in srgb, var(--fg) 10%, transparent); }
.tr-vsl.is-on figcaption{ display:flex; flex-wrap:wrap; align-items:baseline; gap:.2rem .7rem; padding:.65rem .25rem 0; }
.tr-more{ margin:.2rem 0 .6rem; padding:1rem 1.1rem; border-radius:18px; background:var(--glass); }
.tr-more b{ display:flex; align-items:center; gap:.45rem; font-size:.95rem; margin-bottom:.4rem; } .tr-more b .k-ic{ width:17px; height:17px; color:var(--accent); }
.tr-more ul{ margin:0; padding-left:1.2rem; display:flex; flex-direction:column; gap:.35rem; } .tr-more li{ line-height:1.45; }
.tr-golinks{ display:flex; flex-wrap:wrap; gap:.5rem; margin:.3rem 0 .4rem; }
/* Cazuri: picture cards, then the case page */
.tr-czs{ display:grid; grid-template-columns:repeat(auto-fill, minmax(250px, 1fr)); gap:1rem; }
.tr-cz{ display:flex; flex-direction:column; padding:0; border-radius:24px; overflow:hidden; border:1px solid var(--line); background:var(--paper); color:inherit; font:inherit; text-align:left; cursor:pointer;
  transition:transform .35s cubic-bezier(.34,1.56,.64,1), box-shadow .3s; animation:trSheet .5s cubic-bezier(.16,1,.3,1) both; animation-delay:calc(var(--i) * 50ms); }
.tr-cz:hover{ transform:translateY(-4px); box-shadow:0 24px 50px -30px rgba(91,140,255,.6); }
.tr-cz-ph{ display:block; height:190px; overflow:hidden; position:relative; }
.tr-cz-ph figure.ta{ margin:0; border:0; border-radius:0; height:100%; }
.tr-cz-ph figure.ta.is-photo .ta-ph{ height:190px; } .tr-cz-ph figure.ta.is-photo img{ max-height:none; height:190px; width:100%; object-fit:cover; object-position:center 25%; }
.tr-cz-ph figure.ta svg{ height:190px; width:100%; object-fit:cover; } .tr-cz-ph .ta-tag{ display:none; }
.tr-cz-b{ display:flex; flex-direction:column; gap:.35rem; padding:1rem 1.1rem 1.1rem; flex:1; }
.tr-cz-b > b{ font-size:1.08rem; letter-spacing:-.01em; }
.tr-cz-w{ color:var(--muted); font-size:.88rem; line-height:1.4; display:-webkit-box; -webkit-box-orient:vertical; -webkit-line-clamp:2; overflow:hidden; }
.tr-cz-tags{ display:flex; flex-wrap:wrap; gap:.3rem; } .tr-cz-tags em{ display:inline-flex; align-items:center; gap:.25rem; font-style:normal; font-size:.7rem; font-weight:700; padding:.18rem .55rem; border-radius:999px; background:var(--glass-2); color:var(--muted); }
.tr-cz-tags em.is-ok{ color:var(--good); background:var(--good-soft); } .tr-cz-tags em.is-warn{ color:var(--warn); background:var(--warn-soft); } .tr-cz-tags .k-ic{ width:12px; height:12px; }
.tr-cz-f{ margin-top:auto; padding-top:.5rem; display:flex; align-items:center; justify-content:space-between; font-weight:700; font-size:.84rem; color:var(--accent); } .tr-cz-f .k-ic{ width:16px; height:16px; }
.tr-case2{ display:flex; flex-direction:column; gap:1rem; }
.tr-case2-top{ display:flex; align-items:center; gap:.5rem; }
.tr-case2-hero{ display:grid; grid-template-columns:minmax(0, 340px) minmax(0, 1fr); gap:1.4rem; align-items:start; }
.tr-case2-ph figure.ta{ margin:0; border-radius:20px; }
.tr-case2-who h3{ margin:.5rem 0 .8rem; font-size:1.7rem; font-weight:800; letter-spacing:-.03em; line-height:1.15; }
.tr-case2-pro{ margin:0 0 .9rem; padding:0; list-style:none; display:flex; flex-direction:column; gap:.4rem; }
.tr-case2-pro li{ padding:.6rem .85rem; border-radius:14px; background:var(--glass); animation:trSheet .45s cubic-bezier(.16,1,.3,1) both; }
.tr-case2-q{ margin:0; padding:.85rem 1rem; border-radius:18px 18px 18px 4px; background:color-mix(in srgb, var(--accent) 12%, transparent); font-size:1.02rem; font-style:italic; }
.tr-case2-rec{ margin:0 0 .7rem; font-size:1.15rem; font-weight:700; line-height:1.4; }
.tr-case2-prog{ display:flex; flex-direction:column; gap:.4rem; }
.tr-case2-line{ display:grid; grid-template-columns:minmax(0,1fr) auto auto; align-items:center; gap:1rem; padding:.75rem 1rem; border-radius:16px; background:var(--glass); animation:trSheet .45s cubic-bezier(.16,1,.3,1) both; animation-delay:calc(var(--k) * 70ms); }
.tr-case2-line span{ display:flex; flex-direction:column; } .tr-case2-line small{ color:var(--muted); font-size:.78rem; } .tr-case2-line em{ font-style:normal; color:var(--muted); font-size:.85rem; white-space:nowrap; } .tr-case2-line > b{ white-space:nowrap; }
.tr-case2-tot{ display:flex; justify-content:space-between; align-items:baseline; padding:.8rem 1rem 0; } .tr-case2-tot b{ font-size:1.8rem; font-weight:800; letter-spacing:-.02em; }
.tr-case2-res{ display:flex; gap:.4rem; align-items:center; color:var(--muted); margin:.6rem 0 0; } .tr-case2-res .k-ic{ width:15px; height:15px; }
.tr-case2-end{ display:flex; align-items:center; gap:.6rem; flex-wrap:wrap; }
@media (max-width:760px){ .tr-case2-hero{ grid-template-columns:1fr; } .tr-case2-line{ grid-template-columns:1fr auto; } .tr-case2-line em{ grid-column:1; grid-row:2; } .tr-czs{ grid-template-columns:1fr; } }
/* Tratamente: protocols on paper */
.tr-docs{ display:grid; grid-template-columns:repeat(auto-fill, minmax(260px, 1fr)); gap:1rem; }
.tr-doc{ --band:#5b8cff; position:relative; display:flex; flex-direction:column; gap:.45rem; min-height:200px; padding:1.3rem 1.3rem 1.1rem; border-radius:6px 22px 22px 22px; border:1px solid #e7e2d8; background:linear-gradient(180deg, #fffdf8, #f6f2ea);
  color:#1d1b18; font:inherit; text-align:left; cursor:pointer; box-shadow:0 1px 0 #fff inset, 0 18px 40px -28px rgba(0,0,0,.6); transition:transform .35s cubic-bezier(.34,1.56,.64,1), box-shadow .3s;
  animation:trSheet .5s cubic-bezier(.16,1,.3,1) both; animation-delay:calc(var(--i) * 40ms); }
.tr-doc::before{ content:''; position:absolute; left:0; top:0; bottom:0; width:5px; border-radius:6px 0 0 22px; background:var(--band); }
.tr-doc.is-corp{ --band:#10b981; } .tr-doc.is-epilare{ --band:#f59e0b; }
.tr-doc:hover{ transform:translateY(-4px) rotate(-.3deg); box-shadow:0 1px 0 #fff inset, 0 28px 50px -26px rgba(0,0,0,.6); }
.tr-doc-k{ display:flex; justify-content:space-between; font-size:.68rem; font-weight:700; letter-spacing:.12em; text-transform:uppercase; color:#8a8172; } .tr-doc-k i{ font-style:normal; letter-spacing:.05em; }
.tr-doc > b{ font-family:'Iowan Old Style', 'Palatino Linotype', Georgia, serif; font-size:1.3rem; font-weight:700; line-height:1.2; color:#16140f; }
.tr-doc-w{ font-size:.86rem; line-height:1.45; color:#5c564b; display:-webkit-box; -webkit-box-orient:vertical; -webkit-line-clamp:3; overflow:hidden; }
.tr-doc-m{ margin-top:auto; display:flex; flex-wrap:wrap; gap:.3rem; } .tr-doc-m em{ font-style:normal; font-size:.7rem; font-weight:700; padding:.18rem .5rem; border-radius:6px; background:#ece6da; color:#5c564b; }
.tr-doc-m em.is-ok{ background:#d8f0e3; color:#11764a; } .tr-doc-m em.is-warn{ background:#f8e7c6; color:#8a5a00; }
.tr-pd-wrap{ display:flex; flex-direction:column; gap:1rem; }
.tr-pd{ --band:#5b8cff; position:relative; box-sizing:border-box; min-width:0; max-width:900px; width:100%; margin:0 auto; padding:2.2rem 2.4rem 1.8rem; border-radius:8px 28px 28px 28px; background:linear-gradient(180deg, #fffdf8, #f7f3eb); color:#1d1b18;
  border:1px solid #e7e2d8; box-shadow:0 40px 80px -50px rgba(0,0,0,.8); animation:trSheet .55s cubic-bezier(.16,1,.3,1) both; }
.tr-pd.is-corp{ --band:#10b981; } .tr-pd.is-epilare{ --band:#f59e0b; }
.tr-pd::before{ content:''; position:absolute; left:0; right:0; top:0; height:6px; border-radius:8px 28px 0 0; background:var(--band); }
.tr-pd-h{ position:relative; padding-bottom:1.2rem; border-bottom:1px solid #e5dfd3; }
.tr-pd-org{ font-size:.7rem; font-weight:700; letter-spacing:.16em; text-transform:uppercase; color:#8a8172; } .tr-pd-no{ float:right; font-size:.78rem; font-weight:700; color:#8a8172; }
.tr-pd-h h2{ margin:.6rem 0 .5rem; font-family:'Iowan Old Style', 'Palatino Linotype', Georgia, serif; font-size:2.3rem; line-height:1.1; letter-spacing:-.01em; color:#16140f; padding-right:7rem; }
.tr-pd-what{ margin:0; font-size:1.08rem; line-height:1.55; color:#3d3830; max-width:60ch; }
.tr-pd-stamp{ position:absolute; right:0; top:2rem; transform:rotate(-8deg); padding:.35rem .8rem; border:2.5px solid #11764a; border-radius:8px; color:#11764a; font-weight:800; font-size:.8rem; letter-spacing:.14em; text-transform:uppercase; opacity:.85; animation:trStamp .5s .3s cubic-bezier(.34,1.56,.64,1) both; }
.tr-pd-stamp.is-draft{ border-color:#b7791f; color:#b7791f; }
@keyframes trStamp{ from{ opacity:0; transform:rotate(-8deg) scale(1.8); } to{ opacity:.85; transform:rotate(-8deg) scale(1); } }
.tr-pd-facts{ display:grid; grid-template-columns:repeat(auto-fit, minmax(120px, 1fr)); gap:1px; margin:1.2rem 0; border-radius:14px; overflow:hidden; background:#e5dfd3; border:1px solid #e5dfd3; }
.tr-pd-facts div{ display:flex; flex-direction:column; gap:.15rem; padding:.75rem .9rem; background:#fffdf8; } .tr-pd-facts small{ font-size:.68rem; font-weight:700; letter-spacing:.08em; text-transform:uppercase; color:#8a8172; } .tr-pd-facts b{ font-size:1rem; color:#16140f; }
.tr-pd .tr-vsl{ background:#f1ece2; border-color:#d9d1c2; } .tr-pd .tr-vsl span{ color:#6b6457; } .tr-pd .tr-vsl b{ color:#16140f; }
.tr-pd .tr-vsl.is-on{ background:none; } .tr-pd .tr-vsl.is-on video{ border-color:#d9d1c2; }
.tr-pd-s{ padding:1.1rem 0; border-top:1px solid #ece6da; animation:trSheet .45s cubic-bezier(.16,1,.3,1) both; animation-delay:calc(.1s + var(--k) * 60ms); }
.tr-pd-s h4{ display:flex; align-items:center; gap:.6rem; margin:0 0 .7rem; font-family:'Iowan Old Style', 'Palatino Linotype', Georgia, serif; font-size:1.25rem; color:#16140f; }
.tr-pd-s h4 i{ font-style:normal; font-family:Inter, system-ui, sans-serif; width:28px; height:28px; border-radius:50%; display:grid; place-items:center; font-size:.8rem; font-weight:800; color:#fff; background:var(--band); flex:none; }
.tr-pd-s ul{ margin:0; padding-left:1.2rem; display:flex; flex-direction:column; gap:.35rem; } .tr-pd-s li{ line-height:1.5; color:#2c2822; }
.tr-pd-s.is-bad{ margin:.3rem 0; padding:1rem 1.1rem; border-radius:16px; border:1.5px solid #e9b4b4; background:#fdf1f1; } .tr-pd-s.is-bad h4{ color:#a12a2a; } .tr-pd-s.is-bad h4 i{ background:#c53030; } .tr-pd-s.is-bad li{ color:#5b1f1f; }
.tr-pd-steps{ list-style:none; margin:0; padding:0; display:flex; flex-direction:column; gap:.5rem; position:relative; }
.tr-pd-steps li{ display:flex; gap:.85rem; align-items:flex-start; padding:.7rem .9rem; border-radius:14px; background:#f3eee5; animation:trSheet .4s cubic-bezier(.16,1,.3,1) both; animation-delay:calc(.15s + var(--k) * 70ms); }
.tr-pd-steps li i{ font-style:normal; flex:none; width:26px; height:26px; border-radius:50%; display:grid; place-items:center; font-weight:800; font-size:.8rem; background:#fff; color:#16140f; border:1px solid #ddd5c6; }
.tr-pd-s blockquote{ margin:0 0 .5rem; padding:.75rem 1rem; border-radius:16px 16px 16px 4px; background:#fff; border:1px solid #e5dfd3; color:#2c2822; font-size:1rem; }
.tr-pd .tr-missing{ color:#8a5a00; } .tr-pd .k-chip{ color:#16140f; }
.tr-pd-f{ display:flex; justify-content:flex-end; padding-top:1.2rem; border-top:1px solid #ece6da; }
@media (max-width:760px){ .tr-pd{ padding:1.5rem 1.2rem 1.2rem; } .tr-pd-h h2{ font-size:1.7rem; padding-right:0; } .tr-pd-stamp{ position:static; display:inline-block; margin-top:.6rem; } .tr-docs{ grid-template-columns:1fr; } }
.tr-shot{ margin:.3rem 0 .7rem; display:flex; flex-direction:column; align-items:center; gap:.6rem; padding:1rem; border-radius:20px; background:var(--glass); }
.tr-shot img{ display:block; width:100%; max-width:320px; border-radius:22px; border:6px solid #0b0c10; box-shadow:0 20px 40px -24px rgba(0,0,0,.8); animation:trSheet .5s cubic-bezier(.16,1,.3,1) both; }
.tr-shot figcaption{ display:flex; gap:.4rem; align-items:flex-start; font-size:.85rem; font-weight:600; color:var(--muted); text-align:center; } .tr-shot .k-ic{ width:15px; height:15px; flex:none; margin-top:.1rem; color:var(--accent); }
/* the light theme: soft shadows instead of the dark ones */
:root[data-theme="light"] .tr-door, :root[data-theme="light"] .tr-step{ box-shadow:0 20px 40px -30px rgba(13,15,20,.35); }
:root[data-theme="light"] .tr-stop-dot, :root[data-theme="light"] .tr-vdot{ box-shadow:0 6px 16px -10px rgba(13,15,20,.3); }
:root[data-theme="light"] .tr-map{ background:radial-gradient(60% 80% at 20% 0%, rgba(91,140,255,.1), transparent 60%), radial-gradient(50% 70% at 100% 100%, rgba(168,85,247,.1), transparent 60%), var(--paper-2); }
@media (min-width:761px) and (max-width:1100px){
  .tr-doors{ grid-template-columns:1fr; min-height:0; gap:1rem; }
  .tr-door{ min-height:190px; padding:1.6rem 5rem 1.6rem 7.4rem; justify-content:center; border-radius:28px; }
  .tr-door-ic{ top:50%; margin-top:-31px; left:1.6rem; }
  .tr-door-n{ top:50%; margin-top:-2.4rem; right:5.2rem; }
  .tr-door-go{ top:50%; bottom:auto; margin-top:-20px; }
  .tr-door-sub{ max-width:46ch; padding-right:0; }
}
@media (max-width:760px){
  .tr-doors{ grid-template-columns:1fr; min-height:0; }
  .tr-door{ min-height:170px; padding:1.3rem 1.3rem 1.3rem 6rem; justify-content:center; border-radius:26px; }
  .tr-door-ic{ top:50%; margin-top:-28px; left:1.2rem; width:56px; height:56px; }
  .tr-door b{ font-size:1.4rem; }
  .tr-door-n{ font-size:3.2rem; }
  .tr-door-go{ display:none; }
  .tr-step{ padding:1.2rem; } .tr-step-t{ font-size:1.5rem; } .tr-dos li{ font-size:1.02rem; }
}
`;
  const st = document.createElement('style');
  st.textContent = css + css2;
  document.head.appendChild(st);

  K.section('traininguri', { mount, show: showAs('train'), data() { if (K.isActive('traininguri')) { MODE = 'train'; panel = PANELS.train; render(); } else badgeOnly(); } });
  K.section('fise', { mount: mountAs('fise'), show: showAs('fise') });
  K.section('calculator', { mount: mountAs('calc'), show: showAs('calc'), data() { if (K.isActive('calculator')) { MODE = 'calc'; panel = PANELS.calc; render(); } } });
  // the nav badge stays right while she's elsewhere in the portal
  function badgeOnly() {
    if (!K.data) return;
    if (isAdmin()) { K.badge('traininguri', pendingTasks().length); return; }
    const ps = pathStats(meId());
    K.badge('traininguri', ps ? todayLeft(ps) : 0);
  }
  K.on('academy:print', () => K.go('fise'));
})();
