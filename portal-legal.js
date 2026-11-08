// Centrul360 portal, Admin → „Acte și autorizații” (the owner, 8.11): for each salon (Timișoara, Arad) every
// authorization and paper it needs, and for each employee their legal dossier; per item its status, number, dates,
// notes and the files (a photo with the phone camera, a PDF, a Word or Excel file). What each item takes comes from
// api/_lib/legal-reqs.js; what we have, from api/portal-legal.js. Admin only.
(function () {
  'use strict';
  const K = window.K;
  if (!K) return;
  const { esc, icon } = K;
  const S = { view: 'Timișoara', person: '', d: null, busy: false, old: false };
  let panel = null, dr = null;

  const LABEL = { verif: 'De verificat', lipsa: 'Lipsește', lucru: 'În lucru', depus: 'Depus', ok: 'În regulă', na: 'Nu se aplică', expirat: 'Expirat', curand: 'Expiră curând' };
  const TONE = { verif: '', lipsa: 'is-bad', lucru: 'is-warn', depus: 'is-info', ok: 'is-good', na: '', expirat: 'is-bad', curand: 'is-warn' };
  const PICK = ['lipsa', 'lucru', 'depus', 'ok', 'na'];
  const ROLE = { cosmetician: 'Cosmeticiană', receptie: 'Recepție', admin: 'Admin' };
  const today = () => (K.today ? K.today() : new Date().toISOString().slice(0, 10));
  const daysTo = (d) => Math.round((Date.parse(d + 'T12:00:00Z') - Date.parse(today() + 'T12:00:00Z')) / 864e5);
  const dShort = (d) => (d ? d.slice(8, 10) + '.' + d.slice(5, 7) + '.' + d.slice(0, 4) : '');
  const size = (n) => (n > 1048576 ? (n / 1048576).toFixed(1).replace('.', ',') + ' MB' : Math.max(1, Math.round(n / 1024)) + ' KB');
  const ini = (n) => String(n || '?').trim().split(/\s+/).slice(0, 2).map((w) => w[0]).join('').toUpperCase();

  // ------------------------------------------------------------------ the model
  const scopeOf = () => (S.view === 'team' ? (S.person ? 'emp:' + S.person : '') : 'salon:' + S.view);
  const box = (scope) => (S.d && S.d.data.scopes[scope]) || { items: {}, custom: [] };
  function reqsFor(scope) {
    if (!S.d) return [];
    const custom = (box(scope).custom || []).map((c) => ({ id: c.id, group: 'alte', title: c.title, custom: true }));
    if (scope.startsWith('salon:')) {
      const city = scope.slice(6);
      return S.d.reqs.salon.filter((r) => !r.applies || r.applies === 'both' || r.applies === city).concat(custom);
    }
    const emp = S.d.employees.find((e) => 'emp:' + e.id === scope) || {};
    return S.d.reqs.employee.filter((r) => !r.roles || r.roles.includes(emp.role)).concat(custom);
  }
  // an item's state: its status, or "expired" / "expires soon" from its date
  function state(scope, r) {
    const it = box(scope).items[r.id] || {};
    const st = it.status || 'verif';
    if (st === 'ok' && it.expires) {
      const n = daysTo(it.expires);
      if (n < 0) return { k: 'expirat', it, n };
      if (n <= 30) return { k: 'curand', it, n };
    }
    return { k: st, it, n: it.expires ? daysTo(it.expires) : null };
  }
  function tally(scope) {
    const t = { all: 0, ok: 0, lipsa: 0, lucru: 0, depus: 0, verif: 0, curand: 0, expirat: 0 };
    reqsFor(scope).forEach((r) => { const s = state(scope, r).k; if (s === 'na') return; t.all++; if (s === 'ok' || s === 'curand') t.ok++; if (t[s] !== undefined && s !== 'ok') t[s]++; });
    return t;
  }

  // ------------------------------------------------------------------ the page
  function mount(p) {
    panel = p;
    panel.classList.add('k-panel', 'lg');
    panel.innerHTML = '<div class="k-head"><div><div class="k-eyebrow">Admin</div><h2>Acte și autorizații</h2></div><div class="k-head-actions" data-lghead></div></div><div data-lgbody><div class="k-skel" style="height:360px"></div></div>';
    panel.addEventListener('change', (e) => { if (e.target.name === 'lgview') { S.view = e.target.value; S.person = ''; paint(); } });
    panel.addEventListener('click', (e) => {
      const row = e.target.closest('[data-lgitem]'); if (row) return openItem(scopeOf(), row.dataset.lgitem);
      const pp = e.target.closest('[data-lgperson]'); if (pp) { S.person = pp.dataset.lgperson; paint(); window.scrollTo({ top: 0, behavior: 'smooth' }); return; }
      if (e.target.closest('[data-lgback]')) { S.person = ''; paint(); return; }
      if (e.target.closest('[data-lgold]')) { S.old = !S.old; paint(); return; }
      if (e.target.closest('[data-lgadd]')) return addCustom(scopeOf());
    });
  }
  async function load() {
    try { S.d = await K.api('/api/portal-legal', { action: 'get' }); paint(); }
    catch (err) { const b = panel && panel.querySelector('[data-lgbody]'); if (b) b.innerHTML = K.empty('alert', 'Nu am putut încărca actele', esc(K.errText(err))); }
  }
  function paint() {
    if (!panel || !S.d) return;
    panel.querySelector('[data-lghead]').innerHTML = K.seg('lgview', S.d.cities.map((c) => [c, c]).concat([['team', 'Echipa']]), S.view);
    const body = panel.querySelector('[data-lgbody]');
    if (S.view !== 'team') body.innerHTML = summary(scopeOf(), S.view) + groups(scopeOf());
    else if (S.person) {
      const e = S.d.employees.find((x) => x.id === S.person) || {};
      body.innerHTML = '<button type="button" class="k-btn is-ghost is-sm lg-back" data-lgback>' + icon('left') + 'Echipa</button>' + summary(scopeOf(), e.name || 'Angajat', (ROLE[e.role] || '') + (e.location ? ' · ' + e.location : '')) + groups(scopeOf());
    } else body.innerHTML = team();
  }
  function summary(scope, title, sub) {
    const t = tally(scope), pct = t.all ? Math.round(t.ok / t.all * 100) : 0;
    const chip = (n, label, tone) => (n ? '<span class="k-tag ' + tone + '">' + n + ' ' + label + '</span>' : '');
    return '<section class="lg-sum"><div class="lg-ring" style="--p:' + pct + '"><b>' + pct + '<small>%</small></b></div>' +
      '<div class="lg-sum-t"><h3>' + esc(title) + '</h3>' + (sub ? '<p>' + esc(sub) + '</p>' : '') + '<p class="lg-sum-n"><b>' + t.ok + ' din ' + t.all + '</b> în regulă</p>' +
      '<div class="lg-tags">' + chip(t.expirat, t.expirat === 1 ? 'expirat' : 'expirate', 'is-bad') + chip(t.lipsa, t.lipsa === 1 ? 'lipsește' : 'lipsesc', 'is-bad') + chip(t.curand, 'expiră curând', 'is-warn') +
        chip(t.lucru, 'în lucru', 'is-warn') + chip(t.depus, t.depus === 1 ? 'depus' : 'depuse', 'is-info') + chip(t.verif, 'de verificat', '') + '</div></div></section>';
  }
  function rowHtml(scope, r) {
    const s = state(scope, r), it = s.it, files = (it.files || []).length;
    const meta = [r.who || '', it.expires ? (s.n < 0 ? 'expirat din ' + dShort(it.expires) : 'expiră ' + dShort(it.expires)) : '', files ? files + (files === 1 ? ' fișier' : ' fișiere') : ''].filter(Boolean).join(' · ');
    const tag = s.k === 'curand' ? 'în ' + s.n + (s.n === 1 ? ' zi' : ' zile') : LABEL[s.k];
    return '<button type="button" class="lg-row is-' + s.k + '" data-lgitem="' + esc(r.id) + '"><i class="lg-dot"></i><span class="lg-main"><b>' + esc(r.title) + '</b>' + (meta ? '<small>' + esc(meta) + '</small>' : '') + '</span>' +
      '<span class="k-tag ' + TONE[s.k] + '">' + esc(tag) + '</span>' + icon('right') + '</button>';
  }
  function groups(scope) {
    const list = reqsFor(scope), G = S.d.reqs.groups || {};
    const order = Object.keys(G);
    const by = {}; list.forEach((r) => { (by[r.group] = by[r.group] || []).push(r); });
    return order.filter((g) => by[g]).map((g) => '<section class="lg-group"><h4>' + esc(G[g]) + '</h4><div class="lg-list">' + by[g].map((r) => rowHtml(scope, r)).join('') + '</div></section>').join('') +
      '<button type="button" class="k-btn is-outline lg-add" data-lgadd>' + icon('plus') + 'Alt document</button>';
  }
  function team() {
    const card = (e) => {
      const t = tally('emp:' + e.id), pct = t.all ? Math.round(t.ok / t.all * 100) : 0, bad = t.expirat + t.lipsa, soon = t.curand;
      return '<button type="button" class="lg-person" data-lgperson="' + esc(e.id) + '">' + (e.photo ? '<img class="lg-av" src="' + esc(e.photo) + '" alt="">' : '<span class="lg-av">' + esc(ini(e.name)) + '</span>') +
        '<span class="lg-pt"><b>' + esc(e.name) + '</b><small>' + esc([ROLE[e.role] || e.role, e.location].filter(Boolean).join(' · ')) + '</small><i class="lg-bar"><i style="width:' + pct + '%"></i></i></span>' +
        '<span class="lg-pn">' + t.ok + '/' + t.all + (bad ? '<em class="is-bad">' + bad + ' lipsă</em>' : soon ? '<em class="is-warn">' + soon + ' expiră</em>' : '') + '</span></button>';
    };
    const now = S.d.employees.filter((e) => e.active), gone = S.d.employees.filter((e) => !e.active);
    return (now.length ? '<div class="lg-people">' + now.map(card).join('') + '</div>' : K.empty('users', 'Niciun angajat activ', '')) +
      (gone.length ? '<button type="button" class="k-btn is-ghost is-sm lg-oldbtn" data-lgold>' + icon(S.old ? 'up' : 'down') + 'Foști angajați (' + gone.length + ')</button>' + (S.old ? '<div class="lg-people is-old">' + gone.map(card).join('') + '</div>' : '') : '');
  }

  // ------------------------------------------------------------------ one item: status, dates, files, notes, what it takes
  async function call(payload, btn) {
    try { S.busy = true; const r = await K.api('/api/portal-legal', payload); S.d = r; paint(); return r; }
    catch (err) { K.ui().toast(K.errText(err, (err.data && err.data.message) || 'Nu am putut salva.'), 'error'); return null; }
    finally { S.busy = false; if (btn) btn.disabled = false; }
  }
  function itemBody(scope, r) {
    const s = state(scope, r), it = s.it;
    const pick = '<div class="lg-pick" role="radiogroup">' + PICK.map((k) => '<button type="button" role="radio" aria-checked="' + ((it.status || 'verif') === k) + '" class="lg-st is-' + k + ((it.status || 'verif') === k ? ' is-on' : '') + '" data-lgst="' + k + '"><i></i>' + LABEL[k] + '</button>').join('') + '</div>';
    const warn = s.k === 'expirat' ? '<p class="lg-warn is-bad">' + icon('alert') + 'Expirat din ' + dShort(it.expires) + '</p>' : s.k === 'curand' ? '<p class="lg-warn">' + icon('clock') + 'Expiră în ' + s.n + (s.n === 1 ? ' zi' : ' zile') + ', pe ' + dShort(it.expires) + '</p>' : '';
    const files = (it.files || []).map((f) => '<li><a href="/api/portal-file?p=' + encodeURIComponent(f.path) + '" target="_blank" rel="noopener">' +
      (/^image\//.test(f.mime) ? '<img src="/api/portal-file?p=' + encodeURIComponent(f.path) + '" alt="" loading="lazy">' : '<span class="lg-fi">' + icon('file') + '<em>' + esc((f.path.split('.').pop() || '').toUpperCase()) + '</em></span>') +
      '<span><b>' + esc(f.name) + '</b><small>' + esc(dShort(String(f.at).slice(0, 10)) + ' · ' + size(f.size)) + '</small></span></a>' +
      '<button type="button" class="k-icon-btn" data-lgdel="' + esc(f.id) + '" aria-label="Șterge fișierul">' + icon('trash') + '</button></li>').join('');
    const need = r.custom ? '' : '<section class="lg-need">' +
      (r.who ? '<div><small>Cine îl dă</small><p>' + esc(r.who) + '</p></div>' : '') +
      (r.docs && r.docs.length ? '<div><small>Ce acte trebuie</small><ul>' + r.docs.map((x) => '<li>' + esc(x) + '</li>').join('') + '</ul></div>' : '') +
      (r.renew ? '<div><small>Reînnoire</small><p>' + esc(r.renew) + '</p></div>' : '') +
      (r.basis ? '<div><small>Temei legal</small><p>' + esc(r.basis) + '</p></div>' : '') +
      (r.note ? '<div><small>De reținut</small><p>' + esc(r.note) + '</p></div>' : '') +
      (r.src && r.src.length ? '<div class="lg-src">' + r.src.map((u) => { let h = u; try { h = new URL(u).hostname.replace(/^www\./, ''); } catch (e) { /* as it is */ } return '<a href="' + esc(u) + '" target="_blank" rel="noopener">' + icon('link') + esc(h) + '</a>'; }).join('') + '</div>' : '') + '</section>';
    return pick + warn +
      '<div class="lg-fields"><label class="k-field"><span>Număr</span><input data-lgf="number" value="' + esc(it.number || '') + '" maxlength="80" autocomplete="off"></label>' +
        '<label class="k-field"><span>Emis la</span><input type="date" data-lgf="issued" value="' + esc(it.issued || '') + '"></label>' +
        '<label class="k-field"><span>Expiră la</span><input type="date" data-lgf="expires" value="' + esc(it.expires || '') + '"></label></div>' +
      '<section class="lg-files"><div class="lg-files-h"><h5>Fișiere</h5><div>' +
        '<label class="k-btn is-outline is-sm">' + icon('image') + 'Fotografiază<input type="file" accept="image/*" capture="environment" data-lgup hidden></label>' +
        '<label class="k-btn is-outline is-sm">' + icon('plus') + 'Încarcă<input type="file" multiple accept="image/*,application/pdf,.pdf,.doc,.docx,.xls,.xlsx" data-lgup hidden></label></div></div>' +
        (files ? '<ul class="lg-flist">' + files + '</ul>' : '') + '</section>' +
      '<label class="k-field lg-notes"><span>Notițe</span><textarea data-lgf="notes" rows="3" maxlength="2000">' + esc(it.notes || '') + '</textarea></label>' +
      need + (r.custom ? '<button type="button" class="k-btn is-ghost is-sm lg-rm" data-lgrm>' + icon('trash') + 'Șterge documentul</button>' : '');
  }
  // a photo goes smaller first (a paper stays readable at 2200 px), as JPEG; a PDF or an office file as it is
  function shrink(file) {
    return new Promise((ok, no) => {
      const img = new Image();
      img.onload = () => {
        const k = Math.min(1, 2200 / Math.max(img.naturalWidth, img.naturalHeight)), c = document.createElement('canvas');
        c.width = Math.round(img.naturalWidth * k); c.height = Math.round(img.naturalHeight * k);
        const g = c.getContext('2d'); g.fillStyle = '#fff'; g.fillRect(0, 0, c.width, c.height); g.drawImage(img, 0, 0, c.width, c.height);
        URL.revokeObjectURL(img.src); ok(c.toDataURL('image/jpeg', 0.86));
      };
      img.onerror = () => { URL.revokeObjectURL(img.src); no(new Error('img')); };
      img.src = URL.createObjectURL(file);
    });
  }
  const asData = (file) => new Promise((ok, no) => { const fr = new FileReader(); fr.onload = () => ok(fr.result); fr.onerror = no; fr.readAsDataURL(file); });
  function openItem(scope, id) {
    const r = reqsFor(scope).find((x) => x.id === id); if (!r) return;
    const where = scope.startsWith('salon:') ? scope.slice(6) : ((S.d.employees.find((e) => 'emp:' + e.id === scope) || {}).name || '');
    const repaint = () => { if (!dr) return; const y = dr.body.scrollTop; dr.body.innerHTML = itemBody(scope, r); dr.body.scrollTop = y; };
    const save = async (patch) => { await call({ action: 'save', scope, item: id, patch }); repaint(); };
    dr = K.drawer({
      title: r.title, subtitle: esc(((S.d.reqs.groups || {})[r.group] || '') + ' · ' + where), icon: 'file', width: 560, body: itemBody(scope, r),
      onClose: () => { dr = null; },
      onMount(el) {
        el.addEventListener('click', async (e) => {
          const st = e.target.closest('[data-lgst]');
          if (st) { const cur = (box(scope).items[id] || {}).status || 'verif'; return save({ status: st.dataset.lgst === cur ? 'verif' : st.dataset.lgst }); }
          const del = e.target.closest('[data-lgdel]');
          if (del) { if (await K.ui().confirm({ title: 'Ștergi fișierul?', message: 'Nu se mai poate recupera.', confirmText: 'Șterge', danger: true })) { await call({ action: 'file_delete', scope, item: id, fileId: del.dataset.lgdel }); repaint(); } return; }
          if (e.target.closest('[data-lgrm]')) { if (await K.ui().confirm({ title: 'Ștergi „' + r.title + '”?', message: 'Pleacă și fișierele lui.', confirmText: 'Șterge', danger: true })) { await call({ action: 'custom_delete', scope, item: id }); if (dr) dr.close(); } }
        });
        el.addEventListener('change', async (e) => {
          const f = e.target.closest('[data-lgf]');
          if (f && f.dataset.lgf !== 'notes') {
            const patch = {}; patch[f.dataset.lgf] = f.value;
            // issued with a known validity and no expiry yet: the expiry follows (it can still be changed)
            const it = box(scope).items[id] || {};
            if (f.dataset.lgf === 'issued' && f.value && r.months && !it.expires) { const d = new Date(f.value + 'T12:00:00Z'); d.setUTCMonth(d.getUTCMonth() + r.months); patch.expires = d.toISOString().slice(0, 10); }
            return save(patch);
          }
          const up = e.target.closest('[data-lgup]');
          if (up && up.files && up.files.length) {
            const list = [...up.files]; up.value = '';
            const zone = el.querySelector('.lg-files'); if (zone) zone.classList.add('is-busy');
            let n = 0;
            for (const file of list) {
              try {
                const img = /^image\//.test(file.type) && !/gif|svg/.test(file.type);
                if (!img && file.size > 20 * 1024 * 1024) { K.ui().toast(file.name + ' trece de 20 MB.', 'error'); continue; }
                const dataUrl = img ? await shrink(file) : await asData(file);
                const name = (file.name && !/^image\.\w+$/i.test(file.name) ? file.name.replace(/\.[^.]+$/, '') : r.title + ' ' + dShort(today()));
                if (await call({ action: 'file_add', scope, item: id, name, dataUrl })) n++;
              } catch (err) { K.ui().toast('Nu pot citi ' + (file.name || 'fișierul') + '.', 'error'); }
            }
            repaint();
            if (n) K.ui().toast(n === 1 ? 'Fișier încărcat.' : n + ' fișiere încărcate.', 'success');
          }
        });
        el.addEventListener('focusout', (e) => {
          const f = e.target.closest('[data-lgf="notes"]');
          if (f && f.value !== ((box(scope).items[id] || {}).notes || '')) save({ notes: f.value });
        });
      },
    });
  }
  async function addCustom(scope) {
    const title = await K.ui().prompt({ title: 'Alt document', confirmText: 'Adaugă' });
    if (!title || !String(title).trim()) return;
    const r = await call({ action: 'custom_add', scope, title: String(title).trim() });
    if (r) { const c = (box(scope).custom || []).slice(-1)[0]; if (c) openItem(scope, c.id); }
  }

  // from Echipa: an employee's papers in one tap
  window.C360Legal = { person(id) { S.view = 'team'; S.person = id; K.go('acte'); if (S.d) paint(); } };
  K.section('acte', { mount, show() { load(); } });
})();
