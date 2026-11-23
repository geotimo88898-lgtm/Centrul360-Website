// Centrul360 portal, „De făcut” (the owner, 23.11): his own page, on the phone on the road. Three tabs:
//   Ziua de mâine  the day top to bottom: the time, what, a short note, who, its links and files, a post ready to put up
//                  (the video, „Descarcă video”, its text per network with „Copiază textul”); a tap marks a step done
//   De făcut       his tasks: add, edit, check, delete, move up and down
//   La print shop  every document to print, by kind: size, copies (he changes them), open, download; one PDF with all
// API: api/portal-todo.js (admin only). Nothing here is shown to the team.
(function () {
  'use strict';
  const K = window.K;
  if (!K) return;
  const { esc, icon } = K;
  const S = { d: null, box: null, tab: 'day', net: 'ig', hi: '' };
  const api = (b) => K.api('/api/portal-todo', b);
  const GROUP = { tot: 'Tot pentru print', flyere: 'Flyere', carti: 'Cărți de vizită', fise: 'Fișe pentru clinică', acte: 'Pentru echipă', alte: 'Alte variante' };
  const NET = [['ig', 'Instagram'], ['fb', 'Facebook'], ['tt', 'TikTok']];
  const DAYS = ['duminică', 'luni', 'marți', 'miercuri', 'joi', 'vineri', 'sâmbătă'];
  const MONTHS = ['ianuarie', 'februarie', 'martie', 'aprilie', 'mai', 'iunie', 'iulie', 'august', 'septembrie', 'octombrie', 'noiembrie', 'decembrie'];
  const dayLong = (iso) => { if (!/^\d{4}-\d{2}-\d{2}$/.test(iso || '')) return ''; const d = new Date(iso + 'T12:00:00Z'); return DAYS[d.getUTCDay()] + ', ' + d.getUTCDate() + ' ' + MONTHS[d.getUTCMonth()]; };
  const dayShort = (iso) => (/^\d{4}-\d{2}-\d{2}$/.test(iso || '') ? iso.slice(8, 10) + '.' + iso.slice(5, 7) : '');
  const mb = (n) => (n ? (n >= 1048576 ? (n / 1048576).toFixed(1).replace('.', ',') + ' MB' : Math.max(1, Math.round(n / 1024)) + ' KB') : '');
  const fileBy = (key) => ((S.d && S.d.files) || []).find((f) => f.key === key);

  function mount(p) {
    S.box = p;
    p.classList.add('k-panel', 'td');
    p.innerHTML = '<div class="k-head"><div><div class="k-eyebrow">Doar pentru tine</div><h2>De făcut</h2></div></div><div data-td-body><div class="k-skel" style="height:56px;border-radius:16px"></div><div class="k-skel" style="height:420px;margin-top:1rem;border-radius:18px"></div></div>';
    p.addEventListener('click', onClick);
    p.addEventListener('change', onChange);
  }
  async function load() {
    try { S.d = await api({ action: 'get' }); paint(); }
    catch (err) { const b = S.box && S.box.querySelector('[data-td-body]'); if (b && !S.d) b.innerHTML = '<section class="k-card">' + K.empty('alert', 'Nu s-a putut încărca', esc(K.errText(err))) + '</section>'; }
  }

  // ------------------------------------------------------------------ the page
  function counts() {
    const steps = (S.d.day && S.d.day.steps) || [], tasks = S.d.tasks || [];
    return { done: steps.filter((s) => s.done).length, steps: steps.length, open: tasks.filter((t) => !t.done).length, files: (S.d.files || []).filter((f) => f.group !== 'alte').length };
  }
  function paint() {
    const body = S.box && S.box.querySelector('[data-td-body]');
    if (!body || !S.d) return;
    const c = counts(), day = S.d.day;
    const tab = (k, l, n) => '<button type="button" role="tab" class="td-tab' + (S.tab === k ? ' is-on' : '') + '" aria-selected="' + (S.tab === k) + '" data-td-tab="' + k + '"><span>' + l + '</span><b>' + n + '</b></button>';
    body.innerHTML = '<div class="td-tabs" role="tablist">' + tab('day', 'Mâine', c.steps ? c.done + '/' + c.steps : '0') + tab('tasks', 'De făcut', c.open) + tab('print', 'Print', c.files) + '</div>' +
      '<div data-td-view>' + (S.tab === 'day' ? dayView() : S.tab === 'tasks' ? tasksView() : printView()) + '</div>';
    if (S.hi) { const el = body.querySelector('[data-file="' + CSS.escape(S.hi) + '"]'); if (el) { el.classList.add('is-hi'); el.scrollIntoView({ block: 'center', behavior: 'smooth' }); } S.hi = ''; }
  }

  // ---- links and files of a step or a task
  function links(list) {
    return (list || []).map((l, i) => l.go ? '<button type="button" class="td-link" data-go="' + esc(l.go) + '">' + icon('arrow') + esc(l.label) + '</button>'
      : l.file ? '<button type="button" class="td-link" data-file-go="' + esc(l.file) + '">' + icon('file') + esc(l.label) + '</button>'
      : l.tab ? '<button type="button" class="td-link" data-td-tab="' + esc(l.tab) + '">' + icon('printer') + esc(l.label) + '</button>'
      : '<a class="td-link" href="' + esc(l.url) + '" target="_blank" rel="noopener">' + icon('link') + esc(l.label) + '</a>').join('');
  }
  function fileChips(keys) {
    return (keys || []).map(fileBy).filter(Boolean).map((f) => f.open ? '<a class="td-fchip" href="' + esc(f.open) + '" target="_blank" rel="noopener">' + icon('file') + '<span>' + esc(f.name) + '</span></a>' : '').join('');
  }
  // a post ready to put up (Conținut): the video, its download, its text per network
  function post(id) {
    const c = S.d.contents && S.d.contents[id];
    if (!c) return '';
    if (c.missing) return '<p class="td-miss">' + icon('alert') + 'Postarea nu mai e în Conținut.</p>';
    const cap = (c.captions && c.captions[S.net]) || '';
    return '<div class="td-post"><div class="td-vid">' + (c.video ? '<video controls playsinline preload="none"' + (c.poster ? ' poster="' + esc(c.poster) + '"' : '') + ' src="' + esc(c.video) + '"></video>' : '') + '</div>' +
      (c.title ? '<p class="td-post-t">' + esc(c.title) + '</p>' : '') +
      (c.download ? '<button type="button" class="k-btn is-primary td-dlv td-share" data-share="' + esc(c.download) + '" data-share-name="' + esc((c.title || 'reel').replace(/[^\w\s-]/g, '').trim().replace(/\s+/g, '-').slice(0, 60) + '.mp4') + '" data-share-type="video/mp4">' + icon('share') + 'Trimite / salvează video</button>' +
        '<a class="k-btn is-outline td-dlv" href="' + esc(c.download) + '" download>' + icon('download') + 'Descarcă video</a>' : '') +
      '<div class="td-cap"><div class="k-seg td-nets">' + NET.map(([k, l]) => '<button type="button" data-net="' + k + '" class="' + (S.net === k ? 'is-on' : '') + '"><span>' + l + '</span></button>').join('') + '</div>' +
      '<p class="td-cap-t">' + (cap ? esc(cap).replace(/\n/g, '<br>') : '<i>Fără text pentru rețeaua asta.</i>') + '</p>' +
      (cap ? '<button type="button" class="k-btn is-outline td-copy" data-copy="' + esc(S.net) + '" data-post="' + esc(id) + '">' + icon('copy') + 'Copiază textul</button>' : '') + '</div></div>';
  }

  // ---- Ziua de mâine
  function dayView() {
    const day = S.d.day;
    if (!day || !day.steps.length) return '<section class="k-card">' + K.empty('calendar', 'Nimic pentru mâine', 'Ziua apare aici când e pregătită.') + '</section>';
    const c = counts();
    return '<section class="k-card td-day"><div class="td-day-h"><div><small>Ziua de mâine</small><b>' + esc(day.title || dayLong(day.date)) + '</b></div><span class="td-prog"><i style="--p:' + (c.steps ? Math.round(c.done / c.steps * 100) : 0) + '%"></i>' + c.done + ' din ' + c.steps + '</span></div>' +
      '<ol class="td-tl">' + day.steps.map((s) => '<li class="td-step' + (s.done ? ' is-done' : '') + '"><div class="td-when">' + esc(s.time || '') + '</div>' +
        '<div class="td-sbody"><div class="td-srow"><button type="button" class="td-check" data-step="' + esc(s.id) + '" aria-pressed="' + s.done + '" aria-label="' + (s.done ? 'Nefăcut' : 'Făcut') + '">' + icon('check') + '</button>' +
        '<div class="td-stxt"><b>' + esc(s.title) + '</b>' + (s.who ? '<span class="k-tag td-who">' + icon('user') + esc(s.who) + '</span>' : '') + (s.note ? '<p>' + esc(s.note) + '</p>' : '') + '</div></div>' +
        (s.links.length || s.files.length ? '<div class="td-links">' + links(s.links) + fileChips(s.files) + '</div>' : '') + (s.content ? post(s.content) : '') + '</div></li>').join('') + '</ol></section>';
  }

  // ---- De făcut
  function taskRow(t, i, n) {
    return '<div class="td-task' + (t.done ? ' is-done' : '') + '" data-task="' + esc(t.id) + '"><button type="button" class="td-check" data-tdone="' + esc(t.id) + '" aria-pressed="' + !!t.done + '" aria-label="' + (t.done ? 'Nefăcut' : 'Făcut') + '">' + icon('check') + '</button>' +
      '<div class="td-ttxt"><b>' + esc(t.title) + '</b>' + (t.date || t.who ? '<span class="td-meta">' + [t.date ? icon('calendar') + esc(dayShort(t.date)) : '', t.who ? icon('user') + esc(t.who) : ''].filter(Boolean).join('<i></i>') + '</span>' : '') +
        (t.note ? '<p>' + esc(t.note) + '</p>' : '') + (t.files && t.files.length || (t.links && t.links.length) ? '<div class="td-links">' + links(t.links) + fileChips(t.files) + '</div>' : '') + (t.content ? post(t.content) : '') + '</div>' +
      '<span class="td-mw"><button type="button" class="k-btn is-ghost is-sm td-dots" data-td-menu aria-haspopup="true" aria-expanded="false" aria-label="Mai mult">' + icon('more') + '</button><span class="td-menu" role="menu">' +
        '<button type="button" data-tedit="' + esc(t.id) + '">' + icon('pen') + 'Editează</button>' + (i > 0 ? '<button type="button" data-tmove="' + esc(t.id) + '" data-dir="-1">' + icon('up') + 'Mută sus</button>' : '') +
        (i < n - 1 ? '<button type="button" data-tmove="' + esc(t.id) + '" data-dir="1">' + icon('down') + 'Mută jos</button>' : '') + '<button type="button" class="is-bad" data-tdel="' + esc(t.id) + '">' + icon('trash') + 'Șterge</button></span></span></div>';
  }
  function tasksView() {
    const all = S.d.tasks || [], open = all.filter((t) => !t.done), done = all.filter((t) => t.done);
    return '<section class="k-card td-tasks"><div class="td-th"><b>De făcut</b><button type="button" class="k-btn is-primary is-sm" data-tadd>' + icon('plus') + 'Adaugă</button></div>' +
      (open.length ? '<div class="td-tlist">' + open.map((t, i) => taskRow(t, i, open.length)).join('') + '</div>' : K.empty('check', 'Totul e făcut', 'Adaugă ce mai ai de făcut.')) +
      (done.length ? '<details class="td-donebox"><summary>Gata · ' + done.length + '</summary><div class="td-tlist">' + done.map((t, i) => taskRow(t, i, done.length)).join('') + '</div></details>' : '') + '</section>';
  }
  function taskDrawer(from, t) {
    const ed = !!t, v = t || {};
    const files = (S.d.files || []).filter((f) => f.group !== 'tot');
    K.drawer({
      from, title: ed ? 'Editează' : 'Adaugă', icon: 'check', width: 520,
      body: '<form class="k-form td-form" data-f>' + K.field('Ce', '<input name="title" maxlength="160" required value="' + esc(v.title || '') + '">') +
        '<div class="k-grid c2">' + K.field('Când', '<input type="date" name="date" value="' + esc(v.date || '') + '">') + K.field('Cine', '<input name="who" maxlength="40" placeholder="tu" value="' + esc(v.who || '') + '">') + '</div>' +
        K.field('Notă', '<textarea name="note" rows="3" maxlength="600">' + esc(v.note || '') + '</textarea>') +
        (files.length ? '<div class="k-field"><span>Fișiere</span><div class="td-fpick">' + files.map((f) => '<label><input type="checkbox" name="files" value="' + esc(f.key) + '"' + ((v.files || []).includes(f.key) ? ' checked' : '') + '><span>' + esc(f.name) + '</span></label>').join('') + '</div></div>' : '') + '</form>',
      footer: '<button type="button" class="k-btn" data-cancel>Renunță</button><span class="k-grow"></span><button type="button" class="k-btn is-primary" data-save>' + icon('check') + 'Salvează</button>',
      onMount(root, h) {
        root.querySelector('[data-cancel]').addEventListener('click', () => h.close());
        root.querySelector('[data-save]').addEventListener('click', (ev) => K.busy(ev.currentTarget, async () => {
          const f = root.querySelector('[data-f]');
          const task = { id: v.id, title: f.title.value, date: f.date.value, who: f.who.value, note: f.note.value, files: [...f.querySelectorAll('input[name=files]:checked')].map((x) => x.value) };
          if (!task.title.trim()) { K.ui().toast('Scrie ce ai de făcut.', 'error'); return; }
          try { await api({ action: 'task', task }); h.close(); await load(); } catch (err) { K.ui().toast(K.errText(err), 'error'); }
        }));
      },
    });
  }

  // ---- La print shop
  function fileRow(f) {
    return '<div class="td-file' + (f.missing ? ' is-miss' : '') + '" data-file="' + esc(f.key) + '"><div class="td-fh"><span class="td-ficon">' + icon('file') + '</span><div class="td-ftxt"><b>' + esc(f.name) + '</b>' + (f.what ? '<p>' + esc(f.what) + '</p>' : '') +
      '<span class="td-meta"><span class="k-tag">' + esc(f.size || 'A4') + '</span>' + (f.bytes ? '<span class="td-mb">' + mb(f.bytes) + '</span>' : '') + (f.missing ? '<span class="k-tag is-warn">lipsește</span>' : '') + '</span></div></div>' +
      '<div class="td-fact"><div class="td-copies" role="group" aria-label="Bucăți"><button type="button" data-cp="' + esc(f.id) + '" data-d="-1" aria-label="Mai puține">' + icon('minus') + '</button><b data-cpn="' + esc(f.id) + '">' + (f.copies || 0) + '</b><small>buc.</small>' +
        '<button type="button" data-cp="' + esc(f.id) + '" data-d="1" aria-label="Mai multe">' + icon('plus') + '</button></div>' +
        (f.open ? '<button type="button" class="k-btn is-primary is-sm td-share" data-share="' + esc(f.dl) + '" data-share-name="' + esc(f.file || 'fisier.pdf') + '" data-share-type="application/pdf">' + icon('share') + 'Trimite</button>' +
          '<a class="k-btn is-outline is-sm" href="' + esc(f.open) + '" target="_blank" rel="noopener">' + icon('eye') + 'Deschide</a><a class="k-btn is-outline is-sm" href="' + esc(f.dl) + '" download="' + esc(f.file) + '">' + icon('download') + 'Descarcă</a>' : '') + '</div></div>';
  }
  function printView() {
    const files = S.d.files || [];
    if (!files.length) return '<section class="k-card">' + K.empty('printer', 'Nimic de printat', 'Fișierele apar aici când sunt încărcate.') + '</section>';
    const all = files.find((f) => f.group === 'tot' && f.open);
    const by = (g) => files.filter((f) => f.group === g);
    const total = files.filter((f) => f.group !== 'tot' && f.group !== 'alte').reduce((n, f) => n + (f.copies || 0), 0);
    return (all ? '<section class="k-card td-all" data-file="' + esc(all.key) + '"><div><small>La print shop</small><b>' + esc(all.name) + '</b><p>' + esc(all.what || '') + (all.bytes ? ' · ' + mb(all.bytes) : '') + '</p></div>' +
        '<div class="td-all-b"><button type="button" class="k-btn is-primary td-share" data-share="' + esc(all.dl) + '" data-share-name="' + esc(all.file || 'tot-pentru-print.pdf') + '" data-share-type="application/pdf">' + icon('share') + 'Trimite tot</button><a class="k-btn is-outline" href="' + esc(all.dl) + '" download="' + esc(all.file) + '">' + icon('download') + 'Descarcă</a><a class="k-btn is-outline" href="' + esc(all.open) + '" target="_blank" rel="noopener">' + icon('eye') + 'Deschide</a></div></section>' : '') +
      '<p class="td-total">' + total + ' bucăți de printat, pe lista de mai jos</p>' +
      ['flyere', 'carti', 'fise', 'acte'].filter((g) => by(g).length).map((g) => '<section class="k-card td-group"><h3>' + GROUP[g] + '</h3>' + by(g).map(fileRow).join('') + '</section>').join('') +
      (by('alte').length ? '<details class="k-card td-group td-alt"><summary>' + GROUP.alte + ' · ' + by('alte').length + '</summary>' + by('alte').map(fileRow).join('') + '</details>' : '');
  }

  // ------------------------------------------------------------------ actions
  const closeMenus = (except) => S.box.querySelectorAll('.td-mw.open').forEach((m) => { if (m !== except) { m.classList.remove('open'); m.querySelector('[data-td-menu]').setAttribute('aria-expanded', 'false'); } });
  const saveCopies = {};
  // „Trimite” (the owner, 23.11: on the phone the PDFs would not download): the file goes to the phone's share sheet
  // (save to Files / Photos, WhatsApp, AirDrop to the print shop). The file is fetched first; when the phone wants the share
  // right on the tap (iPhone), the first tap only gets it ready and the button says to tap again.
  const SHARED = new Map();
  async function shareFile(b) {
    const url = b.dataset.share, name = b.dataset.shareName || 'fisier', type = b.dataset.shareType || 'application/octet-stream';
    const label = b.innerHTML;
    let file = SHARED.get(url);
    if (!file) {
      b.disabled = true; b.innerHTML = icon('refresh') + 'Se pregătește…';
      try {
        const r = await fetch(url, { credentials: 'same-origin' });
        if (!r.ok) throw new Error(r.status);
        file = new File([await r.blob()], name, { type });
        SHARED.set(url, file);
      } catch (err) { b.disabled = false; b.innerHTML = label; K.ui().toast('Nu am putut lua fișierul. Încearcă din nou.', 'error'); return; }
      b.disabled = false; b.innerHTML = label;
    }
    if (navigator.canShare && navigator.canShare({ files: [file] })) {
      try { await navigator.share({ files: [file], title: name }); return; }
      catch (err) {
        if (err && err.name === 'AbortError') return;
        if (err && err.name === 'NotAllowedError') { b.innerHTML = icon('share') + 'Gata, apasă din nou'; b.classList.add('is-ready'); return; }
      }
    }
    // no share sheet (a computer): saved as a file
    const a = document.createElement('a'); a.href = URL.createObjectURL(file); a.download = name; document.body.appendChild(a); a.click();
    setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 4000);
  }
  async function onClick(e) {
    const b = e.target.closest('button, a');
    if (!b || !S.box.contains(b)) { closeMenus(); return; }
    if (b.hasAttribute('data-td-menu')) { const mw = b.closest('.td-mw'), on = !mw.classList.contains('open'); closeMenus(mw); mw.classList.toggle('open', on); b.setAttribute('aria-expanded', String(on)); return; }
    if (!b.closest('.td-menu')) closeMenus(); else closeMenus();
    if (b.dataset.tdTab) { S.tab = b.dataset.tdTab; paint(); S.box.scrollIntoView({ block: 'start', behavior: 'smooth' }); return; }
    if (b.hasAttribute('data-share')) { shareFile(b); return; }
    if (b.dataset.go) { K.go(b.dataset.go); return; }
    if (b.dataset.fileGo) { S.tab = 'print'; S.hi = b.dataset.fileGo; paint(); return; }
    if (b.dataset.net) { S.net = b.dataset.net; paint(); return; }
    if (b.dataset.copy) {
      const c = S.d.contents[b.dataset.post], t = (c && c.captions && c.captions[b.dataset.copy]) || '';
      await K.copy(t); // it says „Copiat”
      return;
    }
    if (b.dataset.step) {
      const s = S.d.day.steps.find((x) => x.id === b.dataset.step); if (!s) return;
      s.done = !s.done; paint();
      try { await api({ action: 'step', id: s.id, done: s.done }); } catch (err) { s.done = !s.done; paint(); K.ui().toast(K.errText(err), 'error'); }
      return;
    }
    if (b.dataset.tdone) {
      const t = S.d.tasks.find((x) => x.id === b.dataset.tdone); if (!t) return;
      t.done = !t.done; paint();
      try { await api({ action: 'task_done', id: t.id, done: t.done }); } catch (err) { t.done = !t.done; paint(); K.ui().toast(K.errText(err), 'error'); }
      return;
    }
    if (b.hasAttribute('data-tadd')) { taskDrawer(b); return; }
    if (b.dataset.tedit) { const t = S.d.tasks.find((x) => x.id === b.dataset.tedit); if (t) taskDrawer(b, t); return; }
    if (b.dataset.tdel) {
      const t = S.d.tasks.find((x) => x.id === b.dataset.tdel); if (!t) return;
      if (!(await K.ui().confirm({ title: 'Ștergi?', message: t.title, confirmText: 'Șterge', danger: true }))) return;
      try { await api({ action: 'task_del', id: t.id }); await load(); } catch (err) { K.ui().toast(K.errText(err), 'error'); }
      return;
    }
    if (b.dataset.tmove) {
      const list = S.d.tasks, i = list.findIndex((x) => x.id === b.dataset.tmove);
      const same = list.filter((x) => !!x.done === !!list[i].done), j = same.indexOf(list[i]), k = j + Number(b.dataset.dir);
      if (k < 0 || k >= same.length) return;
      const a = list.indexOf(same[j]), c = list.indexOf(same[k]);
      [list[a], list[c]] = [list[c], list[a]];
      paint();
      try { await api({ action: 'task_order', ids: list.map((x) => x.id) }); } catch (err) { K.ui().toast(K.errText(err), 'error'); await load(); }
      return;
    }
    if (b.dataset.cp) {
      const f = S.d.files.find((x) => x.id === b.dataset.cp); if (!f) return;
      f.copies = Math.max(0, (f.copies || 0) + Number(b.dataset.d) * ({ flyere: 50, carti: 50, fise: 10 }[f.group] || 1)); // by fifty for flyers and cards, by ten for the sheets
      const n = S.box.querySelector('[data-cpn="' + CSS.escape(f.id) + '"]'); if (n) n.textContent = f.copies;
      const tot = S.box.querySelector('.td-total'); if (tot) tot.textContent = S.d.files.filter((x) => x.group !== 'tot' && x.group !== 'alte').reduce((m, x) => m + (x.copies || 0), 0) + ' bucăți de printat, pe lista de mai jos';
      clearTimeout(saveCopies[f.id]);
      saveCopies[f.id] = setTimeout(() => api({ action: 'copies', id: f.id, copies: f.copies }).catch((err) => K.ui().toast(K.errText(err), 'error')), 600);
    }
  }
  function onChange() {}

  K.section('defacut', { mount, show() { load(); } });
})();
