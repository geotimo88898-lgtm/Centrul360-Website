// Centrul360 portal, "Contacte": every client and lead, searchable, and per contact:
//   Fișe & mențiuni, scan the paper sheet with the phone camera ("Scanează fișa"), upload files,
//                     write short notes;
//   Poze înainte / după, organised by session (Ședința 1, 2, …): one BEFORE and one AFTER photo
//                     per session. The side-by-side image is generated automatically for every
//                     session, plus the overall one (BEFORE of session 1 + AFTER of the latest);
//                     each can be downloaded. Plus the client's consent to publish her photos.
//   Istoric, her appointments and payments.
// The owner imports the existing contacts once from HighLevel (CSV export). Talks to
// /api/portal-contacts; files are served privately by /api/portal-file.
(function () {
  'use strict';
  const K = window.K;
  const { esc, icon } = K;
  const S = { q: '', filter: 'all', limit: 60, list: [], total: 0, counts: {}, loading: false };
  let panel, typingTimer = 0;
  const fileUrl = (p) => '/api/portal-file?p=' + encodeURIComponent(p);
  const api = (action, body) => K.api('/api/portal-contacts', Object.assign({ action }, body || {}));
  const SOURCES = { highlevel: 'HighLevel', facebook: 'Facebook', instagram: 'Instagram', site: 'Site', manual: 'Adăugat manual', recomandare: 'Recomandare', lead: 'Lead', tiktok: 'TikTok', google: 'Google' };
  const ERR = { no_consent: 'Clienta nu și-a dat acordul pentru publicare.', missing_title: 'Scrie un titlu.',  invalid_file: 'Fișierul nu e o imagine sau un PDF, sau e prea mare.', contact_not_found: 'Contactul nu mai există.', invalid_client: 'Completează numele și telefonul.', missing_text: 'Scrie mențiunea.' };
  const errText = (e) => ERR[e && e.code] || K.errText(e);

  // =====================================================================================
  // LIST
  // =====================================================================================
  function mount(p) {
    panel = p;
    panel.classList.add('k-panel', 'ct');
    const admin = K.data && K.data.isAdmin;
    panel.innerHTML =
      '<div class="k-head"><div><div class="k-eyebrow">Clinică</div><h2>Contacte</h2><p class="k-lede">Toate clientele și leadurile. Deschide un contact ca să scanezi fișa, să scrii mențiuni sau să urci pozele înainte/după.</p></div>' +
      '<div class="k-head-actions">' + (admin ? '<button type="button" class="k-btn is-outline" data-act="import">' + icon('download') + 'Importă din HighLevel</button>' : '') +
      '<button type="button" class="k-btn is-accent" data-act="new">' + icon('userPlus') + 'Contact nou</button></div></div>' +
      '<div class="ct-bar"><label class="k-search ct-search">' + icon('search') + '<input data-q type="search" placeholder="Caută după nume, telefon sau email…" autocomplete="off"></label>' +
      '<div class="k-chips" data-filters></div></div>' +
      '<div data-list><div class="k-skel" style="height:260px"></div></div>';
    panel.addEventListener('click', onClick);
    panel.querySelector('[data-q]').addEventListener('input', (e) => {
      S.q = e.target.value; S.limit = 60;
      clearTimeout(typingTimer); typingTimer = setTimeout(load, 220);
    });
  }
  async function load() {
    S.loading = true;
    try {
      const j = await api('list', { q: S.q, filter: S.filter, limit: S.limit });
      S.list = j.contacts || []; S.total = j.total || 0; S.counts = j.counts || {};
      render();
    } catch (e) {
      panel.querySelector('[data-list]').innerHTML = K.empty('alert', 'Nu am putut încărca contactele', 'Verifică conexiunea și reîncearcă.', '<button type="button" class="k-btn is-primary" data-act="reload">Reîncearcă</button>');
    }
    S.loading = false;
  }
  function render() {
    const F = [['all', 'Toate'], ['clients', 'Cliente'], ['leads', 'Leaduri'], ['photos', 'Cu poze'], ['fise', 'Cu fișă']];
    panel.querySelector('[data-filters]').innerHTML = F.map(([k, l]) => '<button type="button" class="k-chip' + (S.filter === k ? ' is-on' : '') + '" data-filter="' + k + '">' + l + '<span>' + (S.counts[k] || 0) + '</span></button>').join('');
    const el = panel.querySelector('[data-list]');
    if (!S.list.length) {
      el.innerHTML = K.empty('users', S.q ? 'Niciun contact pentru „' + S.q + '”' : 'Niciun contact aici', S.q ? 'Verifică scrierea sau caută după telefon.' : (K.data.isAdmin ? 'Importă contactele din HighLevel sau adaugă unul nou.' : 'Adaugă primul contact.'),
        '<button type="button" class="k-btn is-primary" data-act="new">' + icon('userPlus') + 'Contact nou</button>');
      return;
    }
    el.innerHTML = '<div class="ct-list">' + S.list.map(rowHtml).join('') + '</div>' +
      (S.total > S.list.length ? '<button type="button" class="k-btn is-outline ct-more" data-act="more">Arată mai multe (' + (S.total - S.list.length) + ')</button>' : '') +
      '<p class="ct-count">' + K.plural(S.total, 'contact', 'contacte') + (S.q ? ' găsite' : '') + '</p>';
  }
  function rowHtml(c) {
    const consent = c.publish === true ? '<span class="k-tag is-good" title="Acord de publicare a pozelor">' + icon('check') + 'Publicare: da</span>'
      : c.publish === false ? '<span class="k-tag is-bad" title="Fără acord de publicare">' + icon('ban') + 'Nu se publică</span>' : '';
    return '<button type="button" class="ct-row" data-open="' + esc(c.id) + '">' + K.avatar(c.name || '?', 42) +
      '<span class="ct-row-main"><b>' + esc(c.name || '(fără nume)') + '</b><small>' + esc(c.phone || c.email || '-') + (c.location ? ' · ' + esc(c.location) : '') + '</small></span>' +
      '<span class="ct-row-tags">' + (c.isClient ? '<span class="k-tag is-accent">Clientă</span>' : '<span class="k-tag is-info">Lead</span>') +
        (c.filesCount ? '<span class="k-tag" title="Fișe">' + icon('file') + c.filesCount + '</span>' : '') +
        (c.photosCount ? '<span class="k-tag" title="Poze">' + icon('image') + c.photosCount + '</span>' : '') + consent + '</span>' +
      icon('right', 'ct-row-chev') + '</button>';
  }
  function onClick(e) {
    const t = e.target;
    const f = t.closest('[data-filter]');
    if (f) { S.filter = f.dataset.filter; S.limit = 60; return load(); }
    const o = t.closest('[data-open]');
    if (o) return openContact(o.dataset.open);
    const a = t.closest('[data-act]');
    if (!a) return;
    if (a.dataset.act === 'new') return newContact();
    if (a.dataset.act === 'import') return importDrawer();
    if (a.dataset.act === 'more') { S.limit += 120; return load(); }
    if (a.dataset.act === 'reload') return load();
  }

  // =====================================================================================
  // IMAGES: shrink before upload, compose before/after
  // =====================================================================================
  const readDataUrl = (file) => new Promise((ok, fail) => { const r = new FileReader(); r.onload = () => ok(r.result); r.onerror = fail; r.readAsDataURL(file); });
  const loadImg = (src) => new Promise((ok, fail) => { const i = new Image(); i.onload = () => ok(i); i.onerror = fail; i.src = src; });
  async function prepare(file) {
    if (file.type === 'application/pdf') {
      if (file.size > 3.4 * 1024 * 1024) throw Object.assign(new Error('big'), { code: 'invalid_file' });
      return readDataUrl(file);
    }
    let src;
    try { src = await createImageBitmap(file, { imageOrientation: 'from-image' }); }
    catch (e) { src = await loadImg(URL.createObjectURL(file)).catch(() => { throw Object.assign(new Error('fmt'), { code: 'invalid_file' }); }); }
    const w = src.width || src.naturalWidth, h = src.height || src.naturalHeight;
    const k = Math.min(1, 1800 / Math.max(w, h));
    const c = document.createElement('canvas');
    c.width = Math.round(w * k); c.height = Math.round(h * k);
    c.getContext('2d').drawImage(src, 0, 0, c.width, c.height);
    return c.toDataURL('image/jpeg', 0.86);
  }
  // How a photo sits in its half of the before / after image (set in "Aliniază"): z = zoom (1 = the
  // photo just fills its half), x / y = offset as a fraction of the half. Both halves take the shape
  // of the BEFORE photo (kept between 3:4 and 4:3).
  const frameOf = (ph) => Object.assign({ z: 1, x: 0, y: 0 }, ph && ph.frame);
  const cellRatio = (img) => Math.min(4 / 3, Math.max(3 / 4, img.naturalWidth / img.naturalHeight));
  function placeIn(W, H, iw, ih, f) {
    const sc = Math.max(W / iw, H / ih) * f.z, dw = iw * sc, dh = ih * sc;
    return { sc, dw, dh, dx: (W - dw) / 2 + f.x * W, dy: (H - dh) / 2 + f.y * H };
  }
  // BEFORE | AFTER side by side, each photo framed as aligned, with a label on each half.
  const composed = new Map();
  async function compose(bPh, aPh, la, lb, height) {
    const fb = frameOf(bPh), fa = frameOf(aPh);
    const key = [bPh.path, aPh.path, JSON.stringify(fb), JSON.stringify(fa), la, lb, height || 0].join('|');
    if (composed.has(key)) return composed.get(key);
    const [A, B] = await Promise.all([loadImg(fileUrl(bPh.path)), loadImg(fileUrl(aPh.path))]);
    const H = height || Math.min(1500, Math.max(A.naturalHeight, B.naturalHeight));
    const W = Math.round(H * cellRatio(A)), gap = Math.round(H * 0.012);
    const wa = W;
    const c = document.createElement('canvas');
    c.width = W * 2 + gap; c.height = H;
    const g = c.getContext('2d');
    g.fillStyle = '#ffffff'; g.fillRect(0, 0, c.width, c.height);
    const cell = (img, f, x0) => {
      g.save(); g.beginPath(); g.rect(x0, 0, W, H); g.clip();
      g.fillStyle = '#ececec'; g.fillRect(x0, 0, W, H); // shows only when a photo is zoomed out
      const pl = placeIn(W, H, img.naturalWidth, img.naturalHeight, f);
      g.drawImage(img, x0 + pl.dx, pl.dy, pl.dw, pl.dh);
      g.restore();
    };
    cell(A, fb, 0); cell(B, fa, W + gap);
    const fs = Math.round(H * 0.042), pad = Math.round(fs * 0.55);
    const label = (txt, x) => {
      g.font = '700 ' + fs + 'px Inter, system-ui, sans-serif';
      const tw = g.measureText(txt).width;
      g.fillStyle = 'rgba(10,10,14,.72)';
      const bx = x + pad, by = pad, bw = tw + pad * 2, bh = fs + pad * 1.3, r = bh / 2;
      g.beginPath(); g.moveTo(bx + r, by); g.arcTo(bx + bw, by, bx + bw, by + bh, r); g.arcTo(bx + bw, by + bh, bx, by + bh, r); g.arcTo(bx, by + bh, bx, by, r); g.arcTo(bx, by, bx + bw, by, r); g.fill();
      g.fillStyle = '#ffffff'; g.textBaseline = 'middle'; g.fillText(txt, bx + pad, by + bh / 2 + 1);
    };
    label(la, 0); label(lb, wa + gap);
    g.font = '600 ' + Math.round(H * 0.022) + 'px Inter, system-ui, sans-serif';
    g.fillStyle = 'rgba(255,255,255,.85)'; g.textAlign = 'right'; g.textBaseline = 'alphabetic';
    g.fillText('CENTRUL360', c.width - pad, H - pad);
    const url = c.toDataURL('image/jpeg', height ? 0.84 : 0.9);
    composed.set(key, url);
    return url;
  }

  // ---------------------------------------------------------------- overlay (above the drawer)
  function overlay(opts) {
    const root = document.createElement('div');
    root.className = 'ct-ov' + (opts.wide ? ' is-wide' : '');
    root.innerHTML = '<div class="ct-ov-back" data-ov-close></div><div class="ct-ov-panel" role="dialog" aria-modal="true" aria-label="' + esc(opts.title) + '">' +
      '<header class="ct-ov-head"><div><b>' + esc(opts.title) + '</b>' + (opts.sub ? '<small>' + opts.sub + '</small>' : '') + '</div><button type="button" class="k-icon-btn" data-ov-close aria-label="Închide">' + icon('x') + '</button></header>' +
      '<div class="ct-ov-body">' + opts.body + '</div><footer class="ct-ov-foot">' + opts.footer + '</footer></div>';
    document.body.appendChild(root);
    document.documentElement.classList.add('ct-ov-lock');
    const close = () => { root.classList.remove('is-open'); document.documentElement.classList.remove('ct-ov-lock'); document.removeEventListener('keydown', onKey, true); setTimeout(() => root.remove(), 220); if (opts.onClose) opts.onClose(); };
    const onKey = (e) => { if (e.key === 'Escape') { e.stopPropagation(); close(); } };
    document.addEventListener('keydown', onKey, true);
    root.addEventListener('click', (e) => { if (e.target.closest('[data-ov-close]')) close(); });
    requestAnimationFrame(() => root.classList.add('is-open'));
    if (opts.onMount) opts.onMount(root, close);
    return { root, close };
  }

  // ---------------------------------------------------------------- "Aliniază": zoom / move each photo
  // Side by side (with guide lines across both) or on top of each other (the before one see-through),
  // drag to move, pinch / wheel / slider to zoom. Saves each photo's frame; every before / after image
  // made from these photos (downloads, the site) uses it.
  async function openAligner(bPh, aPh, labels, onSave) {
    let A, B;
    try { [A, B] = await Promise.all([loadImg(fileUrl(bPh.path)), loadImg(fileUrl(aPh.path))]); }
    catch (e) { K.ui().toast('Nu am putut încărca pozele.', 'error'); return; }
    const F = { b: frameOf(bPh), a: frameOf(aPh) };
    const IMG = { b: A, a: B };
    const ratio = cellRatio(A);
    const st = { mode: 'side', grid: true, move: 'b' };
    const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
    const zoomRow = (k, label) => '<div class="al-zoom" data-zrow="' + k + '"><span>' + label + '</span>' +
      '<button type="button" class="k-icon-btn" data-zstep="' + k + ':-1" aria-label="Micșorează">' + icon('minus') + '</button>' +
      '<input type="range" min="50" max="400" step="1" data-zrange="' + k + '" aria-label="Zoom ' + label + '">' +
      '<button type="button" class="k-icon-btn" data-zstep="' + k + ':1" aria-label="Mărește">' + icon('plus') + '</button>' +
      '<b data-zval="' + k + '"></b><button type="button" class="al-reset" data-zreset="' + k + '">Centrează</button></div>';
    const ov = overlay({
      title: 'Aliniază înainte / după', wide: true,
      sub: 'Trage poza ca s-o muți. Ca s-o mărești sau micșorezi: două degete, rotița mouse-ului sau bara de jos.',
      body: '<div class="al-bar">' + K.seg('almode', [['side', 'Una lângă alta'], ['ghost', 'Suprapuse']], 'side') +
          '<label class="al-check"><input type="checkbox" data-grid checked>Linii ajutătoare</label></div>' +
        '<div class="al-movebar" data-movebar hidden><span>Muți:</span>' + K.seg('almove', [['b', 'Poza ÎNAINTE'], ['a', 'Poza DUPĂ']], 'b') + '</div>' +
        '<div class="al-stage" data-stage></div>' +
        '<div class="al-zooms">' + zoomRow('b', 'ÎNAINTE') + zoomRow('a', 'DUPĂ') + '</div>',
      footer: '<button type="button" class="k-btn" data-ov-close>Renunță</button><button type="button" class="k-btn is-primary" data-al-save>' + icon('check') + 'Salvează</button>',
      onMount(root, close) {
        const stage = root.querySelector('[data-stage]');
        let panes = {}, W = 0, H = 0;
        function layout() {
          const sw = stage.clientWidth || 600;
          const maxH = Math.max(220, Math.min(window.innerHeight - (window.innerWidth < 720 ? 330 : 360), 640));
          const gap = 6;
          if (st.mode === 'side') { W = Math.floor(Math.min((sw - gap) / 2, maxH * ratio)); }
          else { W = Math.floor(Math.min(sw, maxH * ratio)); }
          H = Math.round(W / ratio);
          const pane = (k, extra) => '<div class="al-pane' + (extra || '') + '" data-p="' + k + '" style="width:' + W + 'px;height:' + H + 'px">' +
            (k === 'g' ? '<img data-img="a" alt="" draggable="false"><img data-img="b" class="is-ghost" alt="" draggable="false">' : '<img data-img="' + k + '" alt="" draggable="false">') +
            '<span class="al-tag">' + (k === 'b' ? 'ÎNAINTE' : k === 'a' ? 'DUPĂ' : 'ÎNAINTE peste DUPĂ') + '</span></div>';
          stage.innerHTML = '<div class="al-panes' + (st.grid ? ' has-grid' : '') + '" style="gap:' + gap + 'px">' +
            (st.mode === 'side' ? pane('b') + pane('a') : pane('g')) + '<i class="al-grid" aria-hidden="true"></i></div>';
          panes = {};
          stage.querySelectorAll('[data-p]').forEach((el) => { panes[el.dataset.p] = el; wire(el); });
          stage.querySelectorAll('img[data-img]').forEach((im) => { im.src = IMG[im.dataset.img].src; });
          paint();
        }
        function paint() {
          stage.querySelectorAll('img[data-img]').forEach((im) => {
            const k = im.dataset.img, I = IMG[k], pl = placeIn(W, H, I.naturalWidth, I.naturalHeight, F[k]);
            im.style.cssText = 'width:' + pl.dw + 'px;height:' + pl.dh + 'px;left:' + pl.dx + 'px;top:' + pl.dy + 'px';
          });
          ['b', 'a'].forEach((k) => {
            root.querySelector('[data-zrange="' + k + '"]').value = Math.round(F[k].z * 100);
            root.querySelector('[data-zval="' + k + '"]').textContent = Math.round(F[k].z * 100) + '%';
          });
        }
        // keep the point under the finger / cursor still while zooming
        function zoomAt(k, px, py, factor) {
          const f = F[k], I = IMG[k];
          const p1 = placeIn(W, H, I.naturalWidth, I.naturalHeight, f);
          const ux = (px - p1.dx) / p1.sc, uy = (py - p1.dy) / p1.sc;
          const z2 = clamp(f.z * factor, 0.5, 4);
          const s2 = Math.max(W / I.naturalWidth, H / I.naturalHeight) * z2;
          f.z = z2;
          f.x = clamp((px - ux * s2 - (W - I.naturalWidth * s2) / 2) / W, -1, 1);
          f.y = clamp((py - uy * s2 - (H - I.naturalHeight * s2) / 2) / H, -1, 1);
        }
        const target = (el) => (el.dataset.p === 'g' ? st.move : el.dataset.p);
        function wire(el) {
          const pts = new Map();
          let last = null;
          const snapshot = () => {
            const r = el.getBoundingClientRect(), list = [...pts.values()];
            if (list.length >= 2) {
              const [p, q] = list;
              return { two: true, mx: (p.x + q.x) / 2 - r.left, my: (p.y + q.y) / 2 - r.top, d: Math.hypot(p.x - q.x, p.y - q.y) };
            }
            return list.length ? { two: false, mx: list[0].x - r.left, my: list[0].y - r.top } : null;
          };
          el.addEventListener('pointerdown', (e) => {
            e.preventDefault();
            try { el.setPointerCapture(e.pointerId); } catch (err) { /* gone */ }
            pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
            last = snapshot();
            el.classList.add('is-drag');
          });
          el.addEventListener('pointermove', (e) => {
            if (!pts.has(e.pointerId)) return;
            pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
            const now = snapshot(), k = target(el), f = F[k];
            if (!now || !last) { last = now; return; }
            if (now.two && last.two && last.d > 0) zoomAt(k, now.mx, now.my, now.d / last.d);
            f.x = clamp(f.x + (now.mx - last.mx) / W, -1, 1);
            f.y = clamp(f.y + (now.my - last.my) / H, -1, 1);
            last = now;
            paint();
          });
          const up = (e) => { pts.delete(e.pointerId); last = snapshot(); if (!pts.size) el.classList.remove('is-drag'); };
          el.addEventListener('pointerup', up); el.addEventListener('pointercancel', up);
          el.addEventListener('wheel', (e) => {
            e.preventDefault();
            const r = el.getBoundingClientRect();
            zoomAt(target(el), e.clientX - r.left, e.clientY - r.top, Math.exp(-e.deltaY * 0.0015));
            paint();
          }, { passive: false });
        }
        root.querySelector('input[name=almode]').addEventListener('change', (e) => {
          st.mode = e.target.value;
          root.querySelector('[data-movebar]').hidden = st.mode !== 'ghost';
          layout();
        });
        root.querySelector('input[name=almove]').addEventListener('change', (e) => { st.move = e.target.value; });
        root.querySelector('[data-grid]').addEventListener('change', (e) => { st.grid = e.target.checked; stage.querySelector('.al-panes').classList.toggle('has-grid', st.grid); });
        root.addEventListener('input', (e) => {
          const k = e.target.dataset && e.target.dataset.zrange;
          if (!k) return;
          zoomAt(k, W / 2, H / 2, (Number(e.target.value) / 100) / F[k].z);
          paint();
        });
        root.addEventListener('click', async (e) => {
          const zs = e.target.closest('[data-zstep]');
          if (zs) { const [k, dir] = zs.dataset.zstep.split(':'); zoomAt(k, W / 2, H / 2, dir === '1' ? 1.08 : 1 / 1.08); paint(); return; }
          const zr = e.target.closest('[data-zreset]');
          if (zr) { F[zr.dataset.zreset] = { z: 1, x: 0, y: 0 }; paint(); return; }
          const sv = e.target.closest('[data-al-save]');
          if (sv) {
            await K.busy(sv, async () => {
              try { await onSave(F.b, F.a); close(); }
              catch (err) { K.ui().toast(errText(err), 'error'); }
            });
          }
        });
        let rz = 0;
        const onResize = () => { cancelAnimationFrame(rz); rz = requestAnimationFrame(layout); };
        window.addEventListener('resize', onResize);
        const mo = new MutationObserver(() => { if (!document.body.contains(root)) { window.removeEventListener('resize', onResize); mo.disconnect(); } });
        mo.observe(document.body, { childList: true });
        layout();
        if (!stage.clientWidth) setTimeout(layout, 60);
      },
    });
    return ov;
  }
  const slug = (s) => K.norm(s).replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'clienta';

  // =====================================================================================
  // ONE CONTACT
  // =====================================================================================
  function openContact(id, tab) {
    const st = { id, tab: tab || 'fise', c: null, detail: null, appts: [], pays: [], busy: '' };
    const d = K.drawer({
      title: 'Contact', icon: 'user', width: 820, focus: false,
      body: '<div class="k-skel" style="height:320px"></div>',
      onClose() { if (S.dirty) { S.dirty = false; if (panel && K.isActive('contacte')) load(); } },
    });
    const me = K.data.me, admin = K.data.isAdmin;
    const canRemove = (x) => admin || (x && x.authorId === me.id);
    // Publishing on the site: the owner and reception (never without the client's consent).
    const canPublish = admin || me.role === 'receptie';
    const pubOf = (kind, sid) => (st.detail.published || []).find((x) => x.kind === kind && (kind === 'case' || x.sessionId === sid));
    const consentOk = () => !!(st.detail.consent && st.detail.consent.publish);
    function pubHtml(kind, sid) {
      const pub = pubOf(kind, sid);
      if (pub) return '<span class="ct-onsite">' + icon('checkCircle') + 'Pe site' + '</span>' + (canPublish ? '<button type="button" class="k-btn is-sm is-outline" data-unpub="' + esc(pub.caseId) + '">' + icon('x') + 'Retrage de pe site</button>' : '');
      if (!canPublish) return '';
      return '<button type="button" class="k-btn is-sm ' + (kind === 'case' ? 'is-accent' : 'is-outline') + (consentOk() ? '' : ' is-locked') + '" data-publish="' + kind + '"' + (sid ? ' data-sid="' + esc(sid) + '"' : '') + '>' +
        icon('globe') + (kind === 'case' ? 'Publică cazul pe site' : 'Publică pe site') + '</button>';
    }
    (async () => {
      try {
        const j = await api('get', { id });
        Object.assign(st, { c: j.contact, detail: j.detail, appts: j.appointments || [], pays: j.payments || [] });
        paintAll();
      } catch (e) { d.set({ body: K.empty('alert', 'Nu am putut deschide contactul', errText(e)) }); }
    })();

    function paintAll() {
      const c = st.c;
      d.set({
        title: c.name || '(fără nume)', lead: K.avatar(c.name || '?', 46), icon: '',
        subtitle: (c.isClient ? '<span class="k-tag is-accent">Clientă</span>' : '<span class="k-tag is-info">Lead</span>') + esc(c.phone || '') + (c.location ? ' · ' + esc(c.location) : '') + (c.source ? ' · ' + esc(SOURCES[c.source] || c.source) : ''),
        body: '<div class="ct-quick">' + (c.phone ? '<a class="k-btn is-outline" href="' + K.tel(c.phone) + '">' + icon('phone') + 'Sună</a><a class="k-btn is-outline" target="_blank" rel="noopener" href="' + K.wa(c.phone) + '">' + icon('chat') + 'WhatsApp</a>' : '') +
            '<button type="button" class="k-btn is-outline" data-edit>' + icon('pen') + 'Editează</button></div>' +
          '<div class="ct-tabs">' + K.seg('cttab', [['fise', 'Fișe & mențiuni', 'file'], ['poze', 'Poze înainte / după', 'image'], ['istoric', 'Istoric', 'clock']], st.tab, 'is-big') + '</div>' +
          '<div class="ct-pane" data-pane></div>',
        onMount(el) {
          el.querySelector('input[name=cttab]').addEventListener('change', (e) => { st.tab = e.target.value; paintPane(); });
          el.querySelector('[data-edit]').addEventListener('click', () => editContact(st, () => paintAll()));
          const body = el.querySelector('.k-dbody'); // the drawer shell is shared by every drawer: listen on its body only
          body.addEventListener('change', onFile);
          body.addEventListener('click', onPaneClick);
          body.addEventListener('focusout', onBlur);
          paintPane();
        },
      });
    }
    const pane = () => d.el.querySelector('[data-pane]');
    function paintPane() {
      if (st.tab === 'fise') pane().innerHTML = fiseHtml();
      else if (st.tab === 'poze') { pane().innerHTML = pozeHtml(); fillComposites(); }
      else pane().innerHTML = istoricHtml();
    }

    // ---------------- Fișe & mențiuni
    function fiseHtml() {
      const det = st.detail;
      return '<section class="ct-sec"><h4>' + icon('file') + 'Fișa clientei</h4>' +
        '<div class="ct-upload">' +
          '<label class="ct-big is-accent"><input type="file" accept="image/*" capture="environment" data-up="scan" hidden>' + icon('image') + '<b>Scanează fișa</b><small>Deschide camera și fotografiază fișa</small></label>' +
          '<label class="ct-big"><input type="file" accept="image/*,application/pdf" multiple data-up="file" hidden>' + icon('download') + '<b>Încarcă fișier</b><small>Poză din galerie sau PDF</small></label>' +
        '</div>' +
        (st.busy === 'file' ? '<div class="ct-uploading"><span class="k-spin"></span>Se încarcă…</div>' : '') +
        (det.files.length ? '<div class="ct-files">' + det.files.map((f) => '<div class="ct-file">' +
          '<a href="' + fileUrl(f.path) + '" target="_blank" rel="noopener" class="ct-file-thumb">' + (f.mime === 'application/pdf' ? '<span class="ct-pdf">' + icon('file') + 'PDF</span>' : '<img src="' + fileUrl(f.path) + '" alt="" loading="lazy">') + '</a>' +
          '<div class="ct-file-meta"><b>' + esc(f.name || 'Fișă') + '</b><small>' + esc(K.dateShort(String(f.at).slice(0, 10))) + (f.author ? ' · ' + esc(f.author) : '') + '</small></div>' +
          (canRemove(f) ? '<button type="button" class="k-icon-btn ct-x" data-del-file="' + esc(f.id) + '" aria-label="Șterge">' + icon('trash') + '</button>' : '') + '</div>').join('') + '</div>'
          : '<p class="ct-hint">' + icon('info') + 'Nicio fișă încă. Apasă „Scanează fișa” și fotografiază foaia completată de clientă.</p>') +
        '</section>' +
        '<section class="ct-sec"><h4>' + icon('pen') + 'Mențiuni</h4>' +
          '<div class="ct-note-new"><textarea data-note rows="3" placeholder="Ex: alergie la …, preferă programări dimineața, a cerut…"></textarea><button type="button" class="k-btn is-primary" data-add-note>' + icon('plus') + 'Adaugă mențiunea</button></div>' +
          (det.notes.length ? '<div class="ct-notes">' + det.notes.map((n) => '<article class="ct-note"><p>' + esc(n.text) + '</p><footer>' + K.avatar(n.author || '?', 22) + '<span>' + esc(n.author || '') + ' · ' + esc(K.ago(n.at)) + '</span>' +
            (canRemove(n) ? '<button type="button" class="k-icon-btn" data-del-note="' + esc(n.id) + '" aria-label="Șterge">' + icon('trash') + '</button>' : '') + '</footer></article>').join('') + '</div>' : '') +
        '</section>';
    }

    // ---------------- Poze înainte / după
    function slotHtml(s, slot) {
      const ph = s[slot];
      const label = slot === 'before' ? 'ÎNAINTE' : 'DUPĂ';
      if (st.busy === s.id + ':' + slot) return '<div class="ct-slot is-busy"><span class="k-spin"></span><small>Se încarcă…</small></div>';
      if (!ph) return '<label class="ct-slot is-empty"><input type="file" accept="image/*" data-photo="' + esc(s.id) + '" data-slot="' + slot + '" hidden>' + icon('image') + '<b>' + label + '</b><small>Apasă ca să faci / alegi poza</small></label>';
      return '<div class="ct-slot"><img src="' + fileUrl(ph.path) + '" alt="' + label + '" loading="lazy" data-zoom="' + esc(ph.path) + '"><span class="ct-slot-tag">' + label + '</span>' +
        '<div class="ct-slot-actions"><label class="k-icon-btn" title="Schimbă poza"><input type="file" accept="image/*" data-photo="' + esc(s.id) + '" data-slot="' + slot + '" hidden>' + icon('refresh') + '</label>' +
        (canRemove(ph) ? '<button type="button" class="k-icon-btn" data-del-photo="' + esc(s.id) + '" data-slot="' + slot + '" title="Șterge poza">' + icon('trash') + '</button>' : '') + '</div></div>';
    }
    function totalPair() {
      const ss = st.detail.sessions.slice().sort((a, b) => a.n - b.n);
      const first = ss.find((s) => s.before);
      const last = ss.slice().reverse().find((s) => s.after);
      if (!first || !last || first.id === last.id) return null;
      return { first, last };
    }
    function pozeHtml() {
      const det = st.detail;
      const consent = det.consent;
      const ss = det.sessions.slice().sort((a, b) => a.n - b.n);
      const tp = totalPair();
      const next = ss.reduce((m, s) => Math.max(m, s.n), 0) + 1;
      return '<section class="ct-consent' + (consent ? (consent.publish ? ' is-yes' : ' is-no') : ' is-unset') + '"><div><b>' + icon('shield') + 'Acord pentru publicarea pozelor</b>' +
          '<small>' + (consent ? (consent.publish ? 'Clienta a fost de acord ca pozele să fie publicate.' : 'Pozele NU se publică (nici pe site, nici în reclame).') + ' · ' + esc(consent.by || '') + ', ' + esc(K.ago(consent.at)) : 'Nesetat. Întreab-o pe clientă și bifează aici.') + '</small></div>' +
          '<div class="ct-consent-btns"><button type="button" data-consent="1" class="' + (consent && consent.publish ? 'is-on' : '') + '">' + icon('check') + 'Da, se pot publica</button>' +
          '<button type="button" data-consent="0" class="' + (consent && !consent.publish ? 'is-on' : '') + '">' + icon('ban') + 'Nu se publică</button></div></section>' +
        (tp ? '<section class="ct-total"><div class="ct-total-head"><b>' + icon('sparkles') + 'Evoluția totală · Ședința ' + tp.first.n + ' → Ședința ' + tp.last.n + '</b></div>' +
          '<div class="ct-composite" data-total><span class="k-spin"></span></div>' +
          '<div class="ct-pair-actions"><a class="k-btn is-sm is-outline" data-dl-total download="inainte-dupa-' + slug(st.c.name) + '-s' + tp.first.n + '-s' + tp.last.n + '.jpg" href="#" aria-disabled="true">' + icon('download') + 'Descarcă</a>' +
          '<button type="button" class="k-btn is-sm is-outline" data-align="total">' + icon('move') + 'Aliniază</button>' + pubHtml('case') + '</div>' +
          (canPublish && !pubOf('case') ? '<p class="ct-hint">' + icon('info') + 'Pe site apare un singur card: ÎNAINTE de la Ședința ' + tp.first.n + ' și DUPĂ de la Ședința ' + tp.last.n + ', iar „Vezi cazul” arată toate ședințele. Numele clientei nu apare.</p>' : '') +
          '</section>' : '') +
        (ss.length ? '<div class="ct-sessions">' + ss.map((s) => '<article class="ct-session" data-session="' + esc(s.id) + '">' +
          '<header><span class="ct-sn">Ședința ' + s.n + '</span><input type="date" data-sdate value="' + esc(s.date || '') + '" aria-label="Data ședinței">' +
          '<input data-streat value="' + esc(s.treatment || '') + '" placeholder="Tratament (ex: LipoSonix abdomen)" maxlength="150">' +
          ((admin || (!s.before && !s.after)) ? '<button type="button" class="k-icon-btn" data-del-session="' + esc(s.id) + '" title="Șterge ședința">' + icon('trash') + '</button>' : '') + '</header>' +
          '<div class="ct-slots">' + slotHtml(s, 'before') + slotHtml(s, 'after') + '</div>' +
          (s.before && s.after ? '<div class="ct-pair"><div class="ct-composite" data-pair="' + esc(s.id) + '"><span class="k-spin"></span></div>' +
            '<div class="ct-pair-actions"><a class="k-btn is-sm is-outline" data-dl-pair="' + esc(s.id) + '" download="inainte-dupa-' + slug(st.c.name) + '-s' + s.n + '.jpg" href="#" aria-disabled="true">' + icon('download') + 'Descarcă</a>' +
            '<button type="button" class="k-btn is-sm is-outline" data-align="' + esc(s.id) + '">' + icon('move') + 'Aliniază</button>' + pubHtml('pair', s.id) + '</div></div>'
            : '<p class="ct-hint">' + icon('info') + (s.before || s.after ? 'Mai adaugă poza ' + (s.before ? 'DUPĂ' : 'ÎNAINTE') + ' și imaginea înainte / după se face singură.' : 'Fă poza ÎNAINTE de tratament și poza DUPĂ, la final.') + '</p>') +
          '</article>').join('') + '</div>'
          : '<div class="ct-empty-photos">' + icon('image') + '<b>Încă nicio ședință cu poze</b><span>Începe cu Ședința 1: poza ÎNAINTE de tratament și poza DUPĂ.</span></div>') +
        '<button type="button" class="k-btn is-accent ct-add-session" data-add-session>' + icon('plus') + (ss.length ? 'Adaugă Ședința ' + next : 'Începe Ședința 1') + '</button>';
    }
    async function fillComposites() {
      const ss = st.detail.sessions;
      for (const s of ss) {
        if (!(s.before && s.after)) continue;
        const box = d.el.querySelector('[data-pair="' + s.id + '"]');
        if (!box) continue;
        try {
          const url = await compose(s.before, s.after, 'ÎNAINTE · Ședința ' + s.n, 'DUPĂ · Ședința ' + s.n);
          box.innerHTML = '<img src="' + url + '" alt="Înainte și după, ședința ' + s.n + '">';
          const a = d.el.querySelector('[data-dl-pair="' + s.id + '"]'); if (a) { a.href = url; a.removeAttribute('aria-disabled'); }
        } catch (e) { box.innerHTML = '<span class="k-muted">Nu am putut genera imaginea.</span>'; }
      }
      const tp = totalPair();
      const tb = d.el.querySelector('[data-total]');
      if (tp && tb) {
        try {
          const url = await compose(tp.first.before, tp.last.after, 'ÎNAINTE · Ședința ' + tp.first.n, 'DUPĂ · Ședința ' + tp.last.n);
          tb.innerHTML = '<img src="' + url + '" alt="Evoluția totală">';
          const a = d.el.querySelector('[data-dl-total]'); if (a) { a.href = url; a.removeAttribute('aria-disabled'); }
        } catch (e) { tb.innerHTML = '<span class="k-muted">Nu am putut genera imaginea.</span>'; }
      }
    }

    // ---------------- Istoric
    function istoricHtml() {
      const ST = { programata: 'Programată', confirmata: 'Confirmată', finalizata: 'Finalizată', reprogramata: 'Reprogramată', anulata: 'Anulată' };
      const paid = st.pays.reduce((a, p) => a + Number(p.amount || 0), 0);
      return '<div class="k-grid c2 ct-kpis"><div class="k-stat"><div class="k-stat-top">' + icon('calendar') + 'Programări</div><div class="k-stat-value">' + st.appts.length + '</div></div>' +
        '<div class="k-stat is-good"><div class="k-stat-top">' + icon('wallet') + 'Total plătit</div><div class="k-stat-value">' + K.lei(paid) + '</div><div class="k-stat-sub">' + K.plural(st.pays.length, 'încasare', 'încasări') + '</div></div></div>' +
        (st.appts.length ? '<div class="k-list">' + st.appts.map((a) => '<div class="k-row"><div class="k-row-main"><div class="k-row-title">' + esc(a.treatment || '-') + '</div><div class="k-row-sub">' + esc(K.dateShort(a.date)) + ' ' + esc(a.time || '') + ' · ' + esc(a.location || '') + (a.cosmeticianName ? ' · ' + esc(a.cosmeticianName) : '') + '</div></div>' +
          '<div class="k-row-end">' + (a.amount ? '<span class="k-amount">' + K.lei(a.amount) + '</span>' : '') + '<span class="k-tag">' + esc(ST[a.status] || a.status) + '</span></div></div>').join('') + '</div>'
          : K.empty('calendar', 'Nicio programare încă', ''));
    }

    // ---------------- actions
    async function act(action, body, busyKey) {
      st.busy = busyKey || '';
      if (busyKey) paintPane();
      try {
        const j = await api(action, Object.assign({ id: st.id }, body));
        if (j.id && j.id !== st.id) st.id = j.id; // a lead became a client
        if (j.contact) st.c = j.contact;
        if (j.detail) st.detail = j.detail;
        S.dirty = true;
        st.busy = ''; paintPane();
        return j;
      } catch (e) { st.busy = ''; paintPane(); K.ui().toast(errText(e), 'error'); return null; }
    }
    async function onFile(e) {
      const inp = e.target;
      if (inp.type !== 'file' || !inp.files || !inp.files.length) return;
      const files = Array.from(inp.files);
      if (inp.dataset.photo) {
        const sid = inp.dataset.photo, slot = inp.dataset.slot;
        try {
          st.busy = sid + ':' + slot; paintPane();
          const dataUrl = await prepare(files[0]);
          const r = await act('photo_set', { sessionId: sid, slot, dataUrl }, sid + ':' + slot);
          if (r) K.ui().toast('Poza ' + (slot === 'before' ? 'ÎNAINTE' : 'DUPĂ') + ' a fost salvată.', 'success');
        } catch (err) { st.busy = ''; paintPane(); K.ui().toast(errText(err), 'error'); }
        return;
      }
      if (inp.dataset.up) {
        let n = 0;
        for (const f of files) {
          try {
            st.busy = 'file'; paintPane();
            const dataUrl = await prepare(f);
            const name = inp.dataset.up === 'scan' ? 'Fișă scanată ' + K.dateShort(K.today()) : (f.name || 'Fișier').replace(/\.[^.]+$/, '');
            if (await act('file_add', { dataUrl, name, kind: inp.dataset.up === 'scan' ? 'fisa' : 'document' }, 'file')) n++;
          } catch (err) { st.busy = ''; paintPane(); K.ui().toast(errText(err), 'error'); }
        }
        if (n) K.ui().toast(n === 1 ? 'Fișa a fost salvată.' : n + ' fișiere salvate.', 'success');
      }
    }
    async function onPaneClick(e) {
      const t = e.target;
      if (t.closest('[data-add-note]')) {
        const ta = d.el.querySelector('[data-note]');
        const text = ta.value.trim();
        if (!text) { ta.focus(); return; }
        if (await act('note_add', { text })) K.ui().toast('Mențiune adăugată.', 'success');
        return;
      }
      const dn = t.closest('[data-del-note]');
      if (dn) { if (await K.ui().confirm({ title: 'Ștergi mențiunea?', confirmText: 'Șterge', danger: true })) act('note_delete', { noteId: dn.dataset.delNote }); return; }
      const df = t.closest('[data-del-file]');
      if (df) { if (await K.ui().confirm({ title: 'Ștergi fișierul?', message: 'Se șterge definitiv.', confirmText: 'Șterge', danger: true })) act('file_delete', { fileId: df.dataset.delFile }); return; }
      const cs = t.closest('[data-consent]');
      if (cs) { const yes = cs.dataset.consent === '1'; if (await act('consent', { publish: yes })) K.ui().toast(yes ? 'Acord salvat: pozele se pot publica.' : 'Salvat: pozele nu se publică.', 'success'); return; }
      if (t.closest('[data-add-session]')) {
        const r = await act('session_add', {});
        if (r) setTimeout(() => { const all = d.el.querySelectorAll('.ct-session'); const last = all[all.length - 1]; if (last) last.scrollIntoView({ behavior: 'smooth', block: 'center' }); }, 60);
        return;
      }
      const ds = t.closest('[data-del-session]');
      if (ds) { if (await K.ui().confirm({ title: 'Ștergi ședința?', message: 'Se șterg și pozele ei.', confirmText: 'Șterge', danger: true })) act('session_delete', { sessionId: ds.dataset.delSession }); return; }
      const dp = t.closest('[data-del-photo]');
      if (dp) { if (await K.ui().confirm({ title: 'Ștergi poza?', confirmText: 'Șterge', danger: true })) act('photo_delete', { sessionId: dp.dataset.delPhoto, slot: dp.dataset.slot }); return; }
      const al = t.closest('[data-align]');
      if (al) {
        const tp = totalPair();
        const sid = al.dataset.align;
        const bs = sid === 'total' ? tp.first : st.detail.sessions.find((x) => x.id === sid);
        const as = sid === 'total' ? tp.last : bs;
        if (!bs || !as) return;
        openAligner(bs.before, as.after, null, async (fb, fa) => {
          const r = await api('frames_set', { id: st.id, frames: [Object.assign({ sessionId: bs.id, slot: 'before' }, fb), Object.assign({ sessionId: as.id, slot: 'after' }, fa)] });
          st.detail = r.detail; S.dirty = true; paintPane();
          K.ui().toast('Aliniere salvată.' + ((st.detail.published || []).length ? ' Dacă e deja pe site, publică din nou ca să se vadă noua aliniere.' : ''), 'success');
        });
        return;
      }
      const pb = t.closest('[data-publish]');
      if (pb) {
        if (!consentOk()) { K.ui().toast('Întâi bifează acordul clientei: „Da, se pot publica”.', 'error'); d.el.querySelector('.ct-consent').scrollIntoView({ behavior: 'smooth', block: 'center' }); return; }
        openPublish(pb.dataset.publish, pb.dataset.sid);
        return;
      }
      const up = t.closest('[data-unpub]');
      if (up) {
        if (!(await K.ui().confirm({ title: 'Retragi de pe site?', message: 'Imaginile dispar imediat de pe pagina de rezultate.', confirmText: 'Retrage', danger: true }))) return;
        if (await act('unpublish', { caseId: up.dataset.unpub })) K.ui().toast('Retras de pe site.', 'success');
        return;
      }
      const z = t.closest('[data-zoom]');
      if (z) { window.open(fileUrl(z.dataset.zoom), '_blank', 'noopener'); return; }
      const dl = t.closest('a[aria-disabled="true"]');
      if (dl) e.preventDefault();
    }
    // Guess "față" / "corp" from the treatment name.
    const guessCat = (txt) => (/facial|fata|față|gusa|gușă|barbie|bărbie|periocular|riduri|ten|pete|acnee|gat|gât|full face|pleoape|obraz/i.test(K.norm(txt)) ? 'fata' : 'corp');
    async function openPublish(kind, sid) {
      const ss = st.detail.sessions.slice().sort((a, b) => a.n - b.n);
      const tp = totalPair();
      const pair = kind === 'pair' ? ss.find((x) => x.id === sid) : null;
      const withBoth = ss.filter((x) => x.before && x.after);
      const treat = (pair ? pair.treatment : (ss.map((x) => x.treatment).filter(Boolean).pop() || '')) || '';
      const nSess = kind === 'case' ? ss.length : 1;
      const loc = ['Timișoara', 'Arad'].includes(st.c.location) ? st.c.location : (K.data.me.location === 'Arad' ? 'Arad' : 'Timișoara');
      let cover = '';
      const ov = overlay({
        title: kind === 'case' ? 'Publică cazul pe site' : 'Publică pe site',
        sub: 'Apare pe pagina de rezultate. Numele și telefonul clientei nu apar nicăieri.',
        body: '<div class="pb-preview" data-pv><span class="k-spin"></span></div>' +
          '<form class="k-form pb-form" data-pbf>' +
          K.field('Titlu pe site', '<input name="title" maxlength="80" required value="' + esc(treat) + '" placeholder="ex: HIFU gușă și contur">', 'full') +
          K.field('Zona', K.seg('category', [['fata', 'Față'], ['corp', 'Corp']], guessCat(treat), 'is-big')) +
          K.field('Oraș', K.seg('location', [['Timișoara', 'Timișoara'], ['Arad', 'Arad']], loc, 'is-big')) +
          '</form>' +
          '<p class="ct-hint">' + icon('info') + (kind === 'case' ? 'Cardul arată ÎNAINTE (Ședința ' + tp.first.n + ') și DUPĂ (Ședința ' + tp.last.n + '). În „Vezi cazul” apar ' + (withBoth.length === 1 ? 'și ședința cu poze' : 'toate cele ' + withBoth.length + ' ședințe cu poze') + '.' : 'Cardul arată poza ÎNAINTE și DUPĂ din Ședința ' + pair.n + '.') + '</p>',
        footer: '<button type="button" class="k-btn" data-ov-close>Renunță</button><button type="button" class="k-btn is-accent" data-pb-go>' + icon('globe') + 'Publică pe site</button>',
        async onMount(root, close) {
          const pv = root.querySelector('[data-pv]');
          try {
            cover = kind === 'case' ? await compose(tp.first.before, tp.last.after, 'ÎNAINTE · Ședința ' + tp.first.n, 'DUPĂ · Ședința ' + tp.last.n, 900)
              : await compose(pair.before, pair.after, 'ÎNAINTE', 'DUPĂ', 900);
            pv.innerHTML = '<img src="' + cover + '" alt="Previzualizare">';
          } catch (e) { pv.innerHTML = '<span class="k-muted">Nu am putut genera imaginea.</span>'; }
          root.querySelector('[data-pb-go]').addEventListener('click', (e) => K.busy(e.currentTarget, async () => {
            const v = K.formValues(root.querySelector('[data-pbf]'));
            if (!v.title.trim()) { K.ui().toast('Scrie un titlu (ex: tratamentul și zona).', 'error'); return; }
            if (!cover) { K.ui().toast('Imaginea nu e gata.', 'error'); return; }
            const images = [{ dataUrl: cover, label: kind === 'case' ? 'Ședința ' + tp.first.n + ' → Ședința ' + tp.last.n : 'Înainte și după' }];
            if (kind === 'case') {
              for (const x of withBoth.slice(-12)) images.push({ dataUrl: await compose(x.before, x.after, 'ÎNAINTE · Ședința ' + x.n, 'DUPĂ · Ședința ' + x.n, 900), label: 'Ședința ' + x.n });
            }
            const r = await act('publish', { kind, sessionId: sid || '', title: v.title.trim(), category: v.category, location: v.location, sessions: nSess, images });
            if (r) { close(); K.ui().toast('Publicat pe site, pe pagina de rezultate.', 'success'); }
          }));
        },
      });
      return ov;
    }

    function onBlur(e) {
      const t = e.target;
      const s = t.closest && t.closest('[data-session]');
      if (!s) return;
      const sess = st.detail.sessions.find((x) => x.id === s.dataset.session);
      if (!sess) return;
      if (t.matches('[data-streat]') && t.value.trim() !== (sess.treatment || '')) { sess.treatment = t.value.trim(); api('session_update', { id: st.id, sessionId: sess.id, treatment: sess.treatment }).catch(() => {}); }
      if (t.matches('[data-sdate]') && t.value && t.value !== sess.date) { sess.date = t.value; api('session_update', { id: st.id, sessionId: sess.id, date: sess.date }).catch(() => {}); }
    }
  }

  // ---------------- edit / new contact
  function editContact(st, done) {
    const c = st.c;
    const back = () => openContact(st.id, st.tab);
    K.drawer({
      title: 'Editează contactul', icon: 'pen', width: 520,
      body: '<form class="k-form" data-form>' + K.field('Nume', '<input name="name" required maxlength="150" value="' + esc(c.name) + '">', 'full') +
        K.field('Telefon', '<input name="phone" type="tel" maxlength="30" value="' + esc(c.phone) + '">') + K.field('Email', '<input name="email" type="email" maxlength="150" value="' + esc(c.email || '') + '">') +
        K.field('Oraș', K.seg('location', [['', 'Nesetat'], ['Timișoara', 'Timișoara'], ['Arad', 'Arad']], c.location || '', 'is-big'), 'full') + '</form>',
      footer: '<button type="button" class="k-btn" data-back>' + icon('left') + 'Înapoi</button><span class="k-grow"></span><button type="button" class="k-btn is-primary" data-save>' + icon('check') + 'Salvează</button>',
      onMount(el) {
        el.querySelector('[data-back]').addEventListener('click', back);
        el.querySelector('[data-save]').addEventListener('click', (e) => K.busy(e.currentTarget, async () => {
          const v = K.formValues(el.querySelector('[data-form]'));
          if (!v.name) { K.ui().toast('Completează numele.', 'error'); return; }
          try { const j = await api('update', Object.assign({ id: st.id }, v)); S.dirty = true; K.ui().toast('Contact salvat.', 'success'); openContact(j.id || st.id, st.tab); }
          catch (err) { K.ui().toast(errText(err), 'error'); }
        }));
      },
    });
    void done;
  }
  function newContact() {
    const d = K.drawer({
      title: 'Contact nou', icon: 'userPlus', width: 520,
      body: '<form class="k-form" data-form>' + K.field('Nume', '<input name="name" required maxlength="150" autofocus placeholder="Prenume și nume">', 'full') +
        K.field('Telefon', '<input name="phone" type="tel" required maxlength="30" placeholder="07xx xxx xxx">') + K.field('Email (opțional)', '<input name="email" type="email" maxlength="150">') +
        K.field('Oraș', K.seg('location', [['Timișoara', 'Timișoara'], ['Arad', 'Arad']], (K.data.me.location === 'Arad' ? 'Arad' : 'Timișoara'), 'is-big'), 'full') + '</form>',
      footer: '<span class="k-grow"></span><button type="button" class="k-btn" data-cancel>Renunță</button><button type="button" class="k-btn is-accent" data-save>' + icon('check') + 'Creează</button>',
      onMount(el) {
        el.querySelector('[data-cancel]').addEventListener('click', () => d.close());
        el.querySelector('[data-save]').addEventListener('click', (e) => K.busy(e.currentTarget, async () => {
          const v = K.formValues(el.querySelector('[data-form]'));
          if (!v.name || !v.phone) { K.ui().toast('Completează numele și telefonul.', 'error'); return; }
          try { const j = await api('create', v); S.dirty = true; load(); openContact(j.id); }
          catch (err) { K.ui().toast(errText(err), 'error'); }
        }));
      },
    });
  }

  // =====================================================================================
  // IMPORT FROM HIGHLEVEL (admin)
  // =====================================================================================
  function parseCsv(text) {
    text = text.replace(/^﻿/, '');
    const first = text.split(/\r?\n/)[0] || '';
    const sep = (first.match(/;/g) || []).length > (first.match(/,/g) || []).length ? ';' : ',';
    const rows = []; let row = [], cur = '', q = false;
    for (let i = 0; i < text.length; i++) {
      const ch = text[i];
      if (q) {
        if (ch === '"') { if (text[i + 1] === '"') { cur += '"'; i++; } else q = false; }
        else cur += ch;
      } else if (ch === '"') q = true;
      else if (ch === sep) { row.push(cur); cur = ''; }
      else if (ch === '\n' || ch === '\r') { if (ch === '\r' && text[i + 1] === '\n') i++; row.push(cur); cur = ''; if (row.some((x) => x.trim())) rows.push(row); row = []; }
      else cur += ch;
    }
    row.push(cur); if (row.some((x) => x.trim())) rows.push(row);
    return rows;
  }
  function mapRows(rows) {
    if (rows.length < 2) return [];
    const head = rows[0].map((h) => K.norm(h).replace(/[^a-z]/g, ''));
    const find = (...names) => head.findIndex((h) => names.includes(h));
    const ix = {
      first: find('firstname', 'prenume', 'first'), last: find('lastname', 'nume', 'last'), full: find('name', 'fullname', 'contactname', 'numecomplet'),
      phone: find('phone', 'phonenumber', 'telefon', 'mobile', 'mobilephone', 'nrtelefon'), email: find('email', 'emailaddress', 'mail'),
      tags: find('tags', 'etichete'), source: find('source', 'sursa', 'contactsource'), created: find('created', 'datecreated', 'createdat', 'dateadded', 'createdon'),
    };
    const get = (r, i) => (i >= 0 ? String(r[i] || '').trim() : '');
    return rows.slice(1).map((r) => {
      const name = get(r, ix.full) || [get(r, ix.first), get(r, ix.last)].filter(Boolean).join(' ');
      const created = get(r, ix.created);
      const t = created ? Date.parse(created) : NaN;
      return { name, phone: get(r, ix.phone), email: get(r, ix.email), tags: get(r, ix.tags), source: get(r, ix.source), createdAt: Number.isFinite(t) ? K.iso(new Date(t)) : '' };
    }).filter((x) => x.name || x.phone || x.email);
  }
  function importDrawer() {
    let rows = [];
    const d = K.drawer({
      title: 'Importă contactele din HighLevel', icon: 'download', width: 620,
      subtitle: 'O singură dată: toate contactele curente intră aici. Cele care există deja (același telefon) nu se dublează.',
      body: '<ol class="ct-steps"><li>În HighLevel: <b>Contacts</b> → bifează toate contactele → <b>Export</b> → descarcă fișierul CSV.</li><li>Alege fișierul aici.</li><li>Verifică și apasă <b>Importă</b>.</li></ol>' +
        '<label class="ct-big is-accent ct-csv"><input type="file" accept=".csv,text/csv" data-csv hidden>' + icon('file') + '<b>Alege fișierul CSV</b><small>Exportul de contacte din HighLevel</small></label>' +
        '<div data-preview></div>',
      footer: '<span class="k-grow k-muted" data-hint></span><button type="button" class="k-btn" data-cancel>Renunță</button><button type="button" class="k-btn is-accent" data-go disabled>' + icon('check') + 'Importă</button>',
      onMount(el) {
        el.querySelector('[data-cancel]').addEventListener('click', () => d.close());
        el.querySelector('[data-csv]').addEventListener('change', async (e) => {
          const f = e.target.files[0];
          if (!f) return;
          rows = mapRows(parseCsv(await f.text()));
          const withPhone = rows.filter((r) => r.phone).length;
          el.querySelector('[data-preview]').innerHTML = rows.length
            ? '<div class="mo-note is-good">' + icon('checkCircle') + 'Am găsit <b>' + rows.length + '</b> contacte (' + withPhone + ' cu telefon) în <b>' + esc(f.name) + '</b>.</div>' +
              '<div class="k-list">' + rows.slice(0, 6).map((r) => '<div class="k-row"><div class="k-row-main"><div class="k-row-title">' + esc(r.name || '(fără nume)') + '</div><div class="k-row-sub">' + esc(r.phone || '-') + (r.email ? ' · ' + esc(r.email) : '') + (r.tags ? ' · ' + esc(r.tags) : '') + '</div></div></div>').join('') + '</div>' +
              (rows.length > 6 ? '<p class="k-muted">… și încă ' + (rows.length - 6) + '.</p>' : '')
            : '<div class="mo-note is-bad">' + icon('alert') + 'Nu am găsit contacte în fișier. Verifică să fie exportul de contacte (CSV) din HighLevel.</div>';
          const go = el.querySelector('[data-go]');
          go.disabled = !rows.length;
          go.lastChild.textContent = rows.length ? 'Importă ' + rows.length + ' contacte' : 'Importă';
        });
        el.querySelector('[data-go]').addEventListener('click', (e) => K.busy(e.currentTarget, async () => {
          let added = 0, updated = 0, skipped = 0;
          const hint = el.querySelector('[data-hint]');
          for (let i = 0; i < rows.length; i += 400) {
            hint.textContent = 'Se importă ' + Math.min(rows.length, i + 400) + ' din ' + rows.length + '…';
            try { const j = await api('import', { rows: rows.slice(i, i + 400) }); added += j.added; updated += j.updated; skipped += j.skipped; }
            catch (err) { K.ui().toast(errText(err), 'error'); return; }
          }
          d.close();
          K.ui().toast('Import gata: ' + added + ' noi, ' + updated + ' completate' + (skipped ? ', ' + skipped + ' fără date' : '') + '.', 'success');
          load();
        }));
      },
    });
  }

  K.section('contacte', { mount, show() { load(); } });
  K.on('contacts:open', (id) => { if (id) openContact(id, 'poze'); });
  K.on('remote', () => { if (panel && K.isActive('contacte') && !K.drawerOpen) load(); });
})();
