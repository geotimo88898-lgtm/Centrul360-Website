// Centrul360 portal - WhatsApp for the admin: the template editor (like HighLevel: name, category,
// header, message with {prenume} {data}…, footer, buttons, a live WhatsApp preview) and the window
// that connects a number (Timișoara / Arad), and the list of templates. Used by Integrări (WhatsApp,
// the Șabloane WhatsApp tab) and the WhatsApp step of a flow. Data: /api/portal-wa (tokens never come back here).
(function () {
  'use strict';
  const K = window.K;
  const { esc, icon } = K;
  const W = { d: null, p: null };

  const STATUS = {
    DRAFT: ['Ciornă', ''], PENDING: ['În verificare la Meta', 'info'], APPROVED: ['Aprobat', 'good'], REJECTED: ['Respins', 'bad'],
    PAUSED: ['Pus pe pauză de Meta', 'warn'], DISABLED: ['Dezactivat de Meta', 'bad'], DELETED: ['Șters din Meta', 'bad'],
  };
  const CAT = { UTILITY: 'Utilitate · confirmări, remindere, informații', MARKETING: 'Marketing · oferte, reveniri, promoții' };
  const VLABEL = { prenume: 'Prenume', nume: 'Nume complet', telefon: 'Telefon', procedura: 'Procedura (din formular)', interes: 'Interesul', tratament: 'Tratamentul',
    locatie: 'Orașul', adresa: 'Adresa clinicii', zi: 'Zi (azi / mâine / joi)', data: 'Data', ora: 'Ora', link_recenzie: 'Link recenzie' };
  const BTN = { QUICK_REPLY: 'Răspuns rapid', URL: 'Link', PHONE_NUMBER: 'Apel' };

  async function load(force) {
    if (!W.p || force) W.p = K.api('/api/portal-wa').then((d) => { W.d = d; return d; }).catch((e) => { W.p = null; throw e; });
    return W.p;
  }
  async function post(body) {
    const d = await K.api('/api/portal-wa', body);
    W.d = d; W.p = Promise.resolve(d);
    K.emit('wa', d);
    return d;
  }
  const tag = (status) => { const s = STATUS[status] || [status || '', '']; return '<span class="k-tag' + (s[1] ? ' is-' + s[1] : '') + '">' + esc(s[0]) + '</span>'; };
  // "Timișoara: Aprobat · Arad: În verificare", or one word when both say the same
  function cityTags(t) {
    const c = t.cities || {};
    const on = Object.keys(c).filter((k) => c[k]);
    if (!on.length) return tag(t.status);
    const same = on.every((k) => c[k] === c[on[0]]);
    return same ? tag(c[on[0]]) : on.map((k) => '<span class="wa-city">' + esc(k) + '</span>' + tag(c[k])).join(' ');
  }

  // the message as the client sees it, with example values
  function bubble(t, sample) {
    const v = sample || (W.d && W.d.sample) || {};
    const fill = (s) => esc(String(s || '')).replace(/\{(\w+)\}/g, (m, k) => (k in v ? '<mark>' + esc(v[k]) + '</mark>' : '<mark class="is-bad">' + m + '</mark>')).replace(/\{\{(\d+)\}\}/g, '<mark class="is-bad">{{$1}}</mark>');
    return '<div class="wa-phone"><div class="wa-bubble">' +
      (t.headerType === 'IMAGE' ? (t.image ? '<img class="wa-himg-pic" src="/api/portal-file?p=' + encodeURIComponent(t.image) + '" alt="" loading="lazy">' : '<span class="wa-himg">' + icon('image') + '</span>') : t.header ? '<b class="wa-h">' + esc(t.header) + '</b>' : '') +
      '<div class="wa-b">' + (fill(t.text || t.body) || '<span class="k-muted">Mesajul…</span>') + '</div>' +
      (t.footer ? '<small class="wa-f">' + esc(t.footer) + '</small>' : '') +
      '<span class="wa-time">11:02</span></div>' +
      ((t.buttons || []).length ? '<div class="wa-btns">' + t.buttons.map((b) => '<span>' + icon(b.type === 'URL' ? 'link' : b.type === 'PHONE_NUMBER' ? 'phone' : 'chat') + esc(b.text || BTN[b.type]) + '</span>').join('') + '</div>' : '') +
      '</div>';
  }

  // ------------------------------------------------------------------ the template editor
  // opts.onSaved(id, data): after a save (the builder selects the new template)
  async function edit(tpl, opts) {
    const o = opts || {};
    let d;
    try { d = await load(); } catch (e) { K.ui().toast(K.errText(e), 'error'); return; }
    const t = tpl ? JSON.parse(JSON.stringify(tpl)) : { label: '', category: 'UTILITY', header: '', headerType: '', purpose: '', text: 'Bună, {prenume}! ', footer: '', buttons: [], map: [], editable: true, status: 'DRAFT' };
    let sample = ''; // the example picture of an image header (a JPEG data URL, sent with the save)
    const sampleOf = (file) => new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => { const k = Math.min(1, 1200 / Math.max(img.naturalWidth, img.naturalHeight)); const cv = document.createElement('canvas'); cv.width = Math.round(img.naturalWidth * k); cv.height = Math.round(img.naturalHeight * k); cv.getContext('2d').drawImage(img, 0, 0, cv.width, cv.height); URL.revokeObjectURL(img.src); resolve(cv.toDataURL('image/jpeg', 0.85)); };
      img.onerror = () => reject(new Error('Nu pot citi poza.'));
      img.src = URL.createObjectURL(file);
    });
    const canEdit = t.editable !== false;
    const vars = d.vars || Object.keys(VLABEL);
    const chips = '<div class="au-vars-chips wa-chips">' + vars.map((k) => '<button type="button" data-var="{' + k + '}" title="' + esc(VLABEL[k] || k) + '">{' + k + '}</button>').join('') + '</div>';
    const btnRow = (b, i) => '<div class="wa-btn-row" data-bi="' + i + '"><select data-bf="type">' + K.options(Object.keys(BTN).map((k) => [k, BTN[k]]), b.type) + '</select>' +
      '<input data-bf="text" maxlength="25" placeholder="Textul butonului" value="' + esc(b.text || '') + '">' +
      (b.type === 'URL' ? '<input data-bf="url" placeholder="https://…" value="' + esc(b.url || '') + '">' : b.type === 'PHONE_NUMBER' ? '<input data-bf="phone" placeholder="+40750204243" value="' + esc(b.phone || '') + '">' : '') +
      '<button type="button" class="k-icon-btn" data-brm="' + i + '" aria-label="Scoate butonul">' + icon('x') + '</button></div>';
    const formHtml = () => (canEdit
      ? '<div class="k-form wa-form">' +
          K.field('Numele șablonului', '<input data-tf="label" maxlength="80" placeholder="ex. Confirmare programare" value="' + esc(t.label) + '">', 'full', 'Pentru tine. Meta primește un nume fără diacritice, ex. confirmare_programare.') +
          K.field('Categoria', '<select data-tf="category">' + K.options(Object.keys(CAT).map((k) => [k, CAT[k]]), t.category) + '</select>', 'full', 'Utilitate: confirmări și remindere (se aprobă mai ușor, costă mai puțin). Marketing: orice ofertă sau invitație.') +
          K.field('Antet', '<select data-tf="headerType">' + K.options([['', 'Text (sau fără)'], ['IMAGE', 'Imagine (se trimite cu fiecare mesaj)']], t.headerType || '') + '</select>', 'full') +
          (t.headerType === 'IMAGE'
            ? K.field('Poză exemplu pentru Meta', '<label class="k-btn is-outline is-sm wa-sample">' + icon('image') + (sample || t.hasSample ? 'Schimbă poza exemplu' : 'Alege o poză exemplu') + '<input type="file" accept="image/*" data-sample hidden></label>', 'full', 'Meta o vede doar la aprobare. La trimitere pleacă imaginea reală (ex. înainte / după).')
            : K.field('Text antet (opțional)', '<input data-tf="header" maxlength="60" placeholder="ex. Programarea ta la Centrul360" value="' + esc(t.header || '') + '">', 'full')) +
          '<div class="k-field full"><label class="k-switch"><input type="checkbox" data-results' + (t.purpose === 'results' ? ' checked' : '') + '><i></i><span>Se trimite la „Trimite rezultatele” (pozele înainte / după din profilul clientei)</span></label></div>' +
          K.field('Mesajul', '<textarea data-tf="text" rows="7" maxlength="1024" placeholder="Bună, {prenume}! …">' + esc(t.text || '') + '</textarea>', 'full', 'Variabilele se completează singure pentru fiecare clientă. Mesajul nu poate începe sau se termina cu o variabilă.') +
          chips +
          K.field('Subsol (opțional)', '<input data-tf="footer" maxlength="60" placeholder="ex. Centrul360 · Timișoara & Arad" value="' + esc(t.footer || '') + '">', 'full') +
          '<div class="k-field full"><span>Butoane (opțional)</span><div data-btns>' + (t.buttons || []).map(btnRow).join('') + '</div>' +
            ((t.buttons || []).length < 5 ? '<button type="button" class="k-btn is-ghost is-sm" data-badd>' + icon('plus') + 'Adaugă un buton</button>' : '') + '</div>' +
        '</div>'
      : '<div class="wa-locked">' + icon('info') + '<span>Șablonul e trimis la Meta: textul nu se mai schimbă (fă o copie dacă vrei altul). Poți schimba numele și ce variabilă completează fiecare loc.</span></div>' +
        '<div class="k-form wa-form">' + K.field('Numele șablonului', '<input data-tf="label" maxlength="80" value="' + esc(t.label) + '">', 'full') +
          ((t.map || []).length ? '<div class="k-field full"><span>Variabilele</span>' + t.map.map((k, i) => '<label class="wa-map"><b>{{' + (i + 1) + '}}</b><select data-map="' + i + '">' + K.options([['', 'Alege…']].concat(vars.map((x) => [x, VLABEL[x] || x])), k) + '</select></label>').join('') + '</div>' : '') +
        '</div>');
    const ready = d.ready;
    const dr = K.drawer({
      title: tpl ? 'Șablon: ' + (t.label || '') : 'Șablon WhatsApp nou', icon: 'chat', width: 760,
      subtitle: canEdit ? 'Scrie-l ca pe un mesaj obișnuit. Meta îl verifică o singură dată, apoi pleacă singur din automatizări.' : 'Trimis la Meta · ' + (STATUS[t.status] || [t.status])[0],
      body: '<div class="wa-edit"><div data-wform>' + formHtml() + '</div><aside class="wa-side"><small>Așa îl primește clienta</small><div data-wprev>' + bubble(t) + '</div>' +
        (t.reason ? '<p class="wa-reason">' + icon('alert') + 'Meta: ' + esc(t.reason) + '</p>' : '') +
        (!ready && canEdit ? '<p class="k-muted wa-note">' + icon('info') + 'WhatsApp nu e conectat încă: îl salvezi ca ciornă și îl trimiți la aprobare după ce conectezi numerele (Integrări → WhatsApp).</p>' : '') + '</aside></div>',
      footer: '<span class="k-grow"></span><button type="button" class="k-btn" data-cancel>Renunță</button>' +
        '<button type="button" class="k-btn' + (ready && canEdit ? '' : ' is-primary') + '" data-save>' + icon('check') + (canEdit ? 'Salvează ciorna' : 'Salvează') + '</button>' +
        (ready && canEdit ? '<button type="button" class="k-btn is-primary" data-send>' + icon('zap') + 'Salvează și trimite la aprobare</button>' : ''),
      onMount(el) {
        let last = null;
        const prev = () => { el.querySelector('[data-wprev]').innerHTML = bubble(t); };
        const repaint = () => { el.querySelector('[data-wform]').innerHTML = formHtml(); prev(); };
        el.addEventListener('focusin', (e) => { if (e.target.matches('[data-tf="text"]')) last = e.target; });
        el.addEventListener('input', (e) => {
          const f = e.target;
          if (f.dataset.tf) { t[f.dataset.tf] = f.value; prev(); }
          const row = f.closest('[data-bi]');
          if (row && f.dataset.bf) { t.buttons[Number(row.dataset.bi)][f.dataset.bf] = f.value; if (f.dataset.bf === 'type') repaint(); else prev(); }
        });
        el.addEventListener('change', (e) => {
          const f = e.target;
          if (f.dataset.tf === 'category') t.category = f.value;
          if (f.dataset.tf === 'headerType') { t.headerType = f.value; repaint(); }
          if (f.matches('[data-results]')) t.purpose = f.checked ? 'results' : '';
          if (f.matches('[data-sample]') && f.files && f.files[0]) sampleOf(f.files[0]).then((u) => { sample = u; repaint(); }).catch((err) => K.ui().toast(err.message, 'error'));
          if (f.dataset.map != null) t.map[Number(f.dataset.map)] = f.value;
          const row = f.closest('[data-bi]');
          if (row && f.dataset.bf === 'type') { t.buttons[Number(row.dataset.bi)].type = f.value; repaint(); }
        });
        el.addEventListener('click', (e) => {
          const vb = e.target.closest('[data-var]');
          if (vb) {
            const ta = last && last.isConnected ? last : el.querySelector('[data-tf="text"]');
            if (!ta) return;
            const a = ta.selectionStart != null ? ta.selectionStart : ta.value.length;
            ta.value = ta.value.slice(0, a) + vb.dataset.var + ta.value.slice(ta.selectionEnd != null ? ta.selectionEnd : a);
            ta.focus(); ta.selectionStart = ta.selectionEnd = a + vb.dataset.var.length;
            t.text = ta.value; prev();
            return;
          }
          if (e.target.closest('[data-badd]')) { t.buttons = (t.buttons || []).concat([{ type: 'QUICK_REPLY', text: '' }]); return repaint(); }
          const rm = e.target.closest('[data-brm]'); if (rm) { t.buttons.splice(Number(rm.dataset.brm), 1); return repaint(); }
          if (e.target.closest('[data-cancel]')) dr.close();
        });
        const saveIt = (submit) => async (ev) => K.busy(ev.currentTarget, async () => {
          try {
            const r = await post({ action: 'tpl_save', submit, template: { id: tpl && tpl.id, label: t.label, category: t.category, header: t.header, headerType: t.headerType || '', sample, purpose: t.purpose || '', body: t.text, footer: t.footer, buttons: t.buttons, map: t.map } });
            dr.close();
            if (r.submitError) K.ui().toast('Salvat, dar Meta: ' + r.submitError, 'error');
            else K.ui().toast(submit ? 'Trimis la Meta. Răspunde de obicei în câteva minute.' : 'Salvat.', 'success');
            if (o.onSaved) o.onSaved(r.savedId, r);
          } catch (err) { K.ui().toast(err.data && err.data.message ? err.data.message : K.errText(err), 'error'); }
        });
        el.querySelector('[data-save]').addEventListener('click', saveIt(false));
        const send = el.querySelector('[data-send]'); if (send) send.addEventListener('click', saveIt(true));
      },
    });
    return dr;
  }

  // ------------------------------------------------------------------ the list (Integrări → Șabloane WhatsApp)
  // The only messages the clinic sends first on WhatsApp: made here (or in WhatsApp Manager), approved
  // by Meta, then picked in a flow's WhatsApp step.
  const L = { box: null };
  function list(box, force) {
    if (L.box !== box) { L.box = box; box.addEventListener('click', listClick); }
    paintList(force);
  }
  async function paintList(force) {
    const box = L.box; if (!box) return;
    if (!box.firstChild) box.innerHTML = '<div class="k-skel" style="height:220px"></div>';
    let d;
    try { d = await load(force); } catch (e) { box.innerHTML = K.empty('alert', 'Nu am putut încărca șabloanele', K.errText(e)); return; }
    const conn = Object.keys(d.numbers || {}).filter((c) => d.numbers[c].connected);
    box.innerHTML =
      '<div class="ad-bar au-bar"><button type="button" class="k-btn is-accent" data-tpl-new>' + icon('plus') + 'Șablon nou</button>' +
        (d.ready && d.templates.length ? '<button type="button" class="k-btn is-primary" data-tpl-review>' + icon('check') + 'Verifică șabloanele</button>' : '') +
        (d.ready ? '<button type="button" class="k-btn is-outline" data-tpl-sync>' + icon('refresh') + 'Citește din Meta</button><span class="k-muted wa-sync">' + (d.syncedAt ? 'citit ' + esc(K.ago(d.syncedAt)) : '') + '</span>' : '') + '</div>' +
      (!d.ready ? '<div class="k-card ad-note is-warn">' + icon('info') + '<span>WhatsApp nu e conectat încă. Șabloanele rămân ciorne până conectezi numerele.</span><button type="button" class="k-btn is-sm" data-goto-int>Conectează</button></div>'
        : '<p class="k-muted wa-conn">' + icon('check') + conn.map((c) => esc(c) + (d.numbers[c].display ? ' (' + esc(d.numbers[c].display) + ')' : '')).join(' · ') + '</p>') +
      (d.syncError ? '<p class="wa-reason">' + icon('alert') + 'Meta: ' + esc(d.syncError) + '</p>' : '') +
      (d.templates.some((t) => t.hidden) ? '<p class="k-muted wa-hidden-note">' + icon('eye') + d.templates.filter((t) => t.hidden).length + ' ascunse · <a href="#" data-tpl-showhidden>' + (L.showHidden ? 'ascunde-le' : 'arată-le') + '</a></p>' : '') +
      (d.templates.length ? '<div class="ad-list">' + d.templates.filter((t) => L.showHidden || !t.hidden).map((t) => '<article class="k-card ad-camp wa-row"><div class="wa-row-in">' +
          '<button type="button" class="ad-title" data-tpl-open="' + esc(t.id) + '"><b>' + esc(t.label) + '</b><small>' + (t.category === 'MARKETING' ? 'Marketing' : 'Utilitate') + (t.name ? ' · ' + esc(t.name) : '') + (t.imported ? ' · din WhatsApp Manager' : '') + '</small></button>' +
          '<div class="wa-row-status">' + cityTags(t) + (t.reason ? '<small class="wa-row-reason">' + esc(t.reason) + '</small>' : '') + '</div>' +
          '<div class="wa-row-used k-muted">' + (t.usedIn.length ? 'în ' + K.plural(t.usedIn.length, 'automatizare', 'automatizări') : 'nefolosit') + '</div>' +
          '<div class="ad-acts">' + (t.editable && d.ready ? '<button type="button" class="k-btn is-sm is-primary" data-tpl-send="' + esc(t.id) + '">' + icon('zap') + 'Trimite la aprobare</button>' : '') +
            '<button type="button" class="k-icon-btn" data-tpl-more="' + esc(t.id) + '" title="Mai mult">' + icon('more') + '</button></div>' +
        '</div></article>').join('') + '</div>'
        : K.empty('chat', 'Niciun șablon încă', '', '<button type="button" class="k-btn is-primary" data-tpl-new>' + icon('plus') + 'Șablon nou</button>'));
  }
  const tplById = (id) => ((W.d && W.d.templates) || []).find((t) => t.id === id);
  const errMsg = (err) => K.ui().toast(err.data && err.data.message ? err.data.message : K.errText(err), 'error');
  const again = { onSaved: () => paintList() };
  async function listClick(e) {
    const t = e.target;
    if (t.closest('[data-tpl-new]')) return edit(null, again);
    if (t.closest('[data-tpl-review]')) return review();
    if (t.closest('[data-tpl-showhidden]')) { e.preventDefault(); L.showHidden = !L.showHidden; return paintList(); }
    if (t.closest('[data-goto-int]')) return K.emit('integrari:int');
    const sy = t.closest('[data-tpl-sync]');
    if (sy) return K.busy(sy, async () => { try { await post({ action: 'tpl_sync' }); paintList(); K.ui().toast('Citit din Meta.', 'success'); } catch (err) { errMsg(err); } });
    const op = t.closest('[data-tpl-open]'); if (op) { const x = tplById(op.dataset.tplOpen); if (x) edit(x, again); return; }
    const se = t.closest('[data-tpl-send]');
    if (se) return K.busy(se, async () => { try { const r = await post({ action: 'tpl_submit', id: se.dataset.tplSend }); paintList(); K.ui().toast(r.submitError ? 'Parțial: ' + r.submitError : 'Trimis la Meta.', r.submitError ? 'error' : 'success'); } catch (err) { errMsg(err); } });
    const mo = t.closest('[data-tpl-more]');
    if (mo) {
      const x = tplById(mo.dataset.tplMore); if (!x) return;
      menu(mo, [['open', 'pen', 'Editează'], ['copy', 'copy', 'Fă o copie'], ['del', 'trash', 'Șterge', true]], async (k) => {
        try {
          if (k === 'open') edit(x, again);
          if (k === 'copy') edit(Object.assign({}, x, { id: '', label: x.label + ' (copie)', editable: true, status: 'DRAFT', name: '', reason: '', cities: {} }), again);
          if (k === 'del') {
            const used = x.usedIn.length ? ' E folosit în: ' + x.usedIn.join(', ') + '; acolo pasul WhatsApp rămâne fără șablon.' : '';
            if (!(await K.ui().confirm({ title: 'Ștergi șablonul „' + x.label + '”?', message: 'Se șterge și din Meta.' + used, confirmText: 'Șterge', danger: true }))) return;
            await post({ action: 'tpl_delete', id: x.id }); paintList(); K.ui().toast('Șters.', 'success');
          }
        } catch (err) { errMsg(err); }
      });
    }
  }
  // ------------------------------------------------------------------ "Verifică șabloanele" (for now)
  // Every template as the client sees it, with its picture: tick the good ones and their cities; "Aplică"
  // sends each ticked one to Meta there with its picture and hides the rest. Then the normal list.
  async function review() {
    let d;
    try { d = await load(true); } catch (e) { return errMsg(e); }
    const ready = Object.keys(d.numbers || {}).filter((c) => d.numbers[c].connected);
    const guess = (t) => {
      const n = (t.name || '') + ' ' + (t.label || '');
      const on = Object.keys(t.cities || {}).filter((c) => t.cities[c] && t.cities[c] !== 'DRAFT');
      if (on.length) return on;
      if ((t.only || []).length) return t.only.slice();
      if (/(_|\b)(tm|timisoara)(_|\b)/i.test(n)) return ['Timișoara'];
      if (/(_|\b)(ar|arad)(_|\b)/i.test(n)) return ['Arad'];
      return ready.slice();
    };
    const pick = new Map(); // id → cities, for the ticked ones
    d.templates.forEach((t) => { if (Object.values(t.cities || {}).some((s) => s && s !== 'DRAFT') || t.reviewed) pick.set(t.id, guess(t)); });
    let show = 'all';
    const SH = { TIMIȘOARA: 'TM', ARAD: 'AR' };
    const card = (t) => {
      const on = pick.has(t.id), cs = pick.get(t.id) || guess(t);
      return '<article class="wa-rv' + (on ? ' is-on' : '') + '" data-rv="' + esc(t.id) + '">' +
        '<header><label class="wa-rv-keep"><input type="checkbox" data-rv-keep' + (on ? ' checked' : '') + '><span><b>' + esc(t.label) + '</b><small>' + esc(t.name || '') + ' · ' + (t.category === 'MARKETING' ? 'Marketing' : 'Utilitate') + '</small></span></label>' +
        '<span class="wa-rv-cities">' + ready.map((c) => '<button type="button" data-rv-city="' + esc(c) + '" class="' + (cs.includes(c) ? 'is-on' : '') + '">' + (SH[c.toUpperCase()] || esc(c)) + '</button>').join('') + '</span></header>' +
        bubble(t) + '<footer>' + cityTags(t) + '</footer></article>';
    };
    const grid = () => d.templates.filter((t) => show === 'all' || (show === 'img' ? t.headerType === 'IMAGE' : pick.has(t.id))).map(card).join('') || K.empty('chat', 'Nimic aici', '');
    const dr = K.drawer({
      title: 'Verifică șabloanele', icon: 'check', width: 1100,
      body: '<div class="wa-rv-top">' + K.seg('rvshow', [['all', 'Toate'], ['img', 'Cu poză'], ['on', 'Bifate']], 'all') + '<span class="k-muted" data-rv-count></span></div><div class="wa-rv-grid" data-rv-grid>' + grid() + '</div>',
      footer: '<span class="k-muted wa-rv-progress" data-rv-progress></span><span class="k-grow"></span><button type="button" class="k-btn" data-rv-cancel>Renunță</button><button type="button" class="k-btn is-primary" data-rv-apply>' + icon('check') + 'Aplică</button>',
      onMount(el) {
        const count = () => { el.querySelector('[data-rv-count]').textContent = pick.size + ' bifate din ' + d.templates.length; };
        count();
        el.addEventListener('change', (e) => {
          if (e.target.name === 'rvshow') { show = e.target.value; el.querySelector('[data-rv-grid]').innerHTML = grid(); return; }
          if (e.target.matches('[data-rv-keep]')) {
            const art = e.target.closest('[data-rv]'), id = art.dataset.rv, t = d.templates.find((x) => x.id === id);
            if (e.target.checked) pick.set(id, guess(t)); else pick.delete(id);
            art.classList.toggle('is-on', e.target.checked); count();
          }
        });
        el.addEventListener('click', (e) => {
          const cb = e.target.closest('[data-rv-city]');
          if (cb) {
            const art = cb.closest('[data-rv]'), id = art.dataset.rv, t = d.templates.find((x) => x.id === id);
            const cs = (pick.get(id) || guess(t)).slice(), c = cb.dataset.rvCity, i = cs.indexOf(c);
            if (i >= 0 && cs.length > 1) cs.splice(i, 1); else if (i < 0) cs.push(c);
            pick.set(id, cs);
            art.classList.add('is-on'); art.querySelector('[data-rv-keep]').checked = true;
            art.querySelectorAll('[data-rv-city]').forEach((b) => b.classList.toggle('is-on', cs.includes(b.dataset.rvCity)));
            count();
          }
          if (e.target.closest('[data-rv-cancel]')) dr.close();
        });
        el.querySelector('[data-rv-apply]').addEventListener('click', (ev) => K.busy(ev.currentTarget, async () => {
          if (!(await K.ui().confirm({ title: 'Aplici?', message: pick.size + ' șabloane pleacă la Meta (cu poza, unde au), celelalte se ascund (le poți readuce oricând).', confirmText: 'Aplică' }))) return;
          const prog = el.querySelector('[data-rv-progress]');
          const errs = [];
          let i = 0;
          for (const [id, cities] of pick) {
            i++;
            const t = d.templates.find((x) => x.id === id);
            prog.textContent = 'Trimit ' + i + ' din ' + pick.size + ': ' + (t ? t.label : '') + '…';
            try { const r = await post({ action: 'tpl_review', id, cities }); if (r.error) errs.push((t ? t.label : id) + ': ' + r.error); } catch (err) { errs.push((t ? t.label : id) + ': ' + ((err.data && err.data.message) || K.errText(err))); }
          }
          // the results template stays in sight (it is edited and sent to Meta on its own)
          const rest = d.templates.filter((t) => !pick.has(t.id) && t.purpose !== 'results').map((t) => t.id);
          if (rest.length) { prog.textContent = 'Ascund restul…'; try { await post({ action: 'tpl_hide', ids: rest }); } catch (err) { errs.push('ascunderea: ' + K.errText(err)); } }
          dr.close();
          paintList(true);
          if (errs.length) K.ui().toast('Gata, dar: ' + errs.slice(0, 3).join(' · '), 'error'); else K.ui().toast('Gata: ' + pick.size + ' trimise la Meta, restul ascunse.', 'success');
        }));
      },
    });
  }

  // the ⋯ menu of a template
  let menuEl = null;
  function closeMenu() { if (!menuEl) return; const m = menuEl; menuEl = null; m.classList.remove('is-open'); setTimeout(() => m.remove(), 180); document.removeEventListener('mousedown', outside, true); }
  const outside = (e) => { if (menuEl && !menuEl.contains(e.target) && !e.target.closest('[data-tpl-more]')) closeMenu(); };
  function menu(btn, items, onPick) {
    const same = menuEl && menuEl.dataset.for === btn.dataset.tplMore;
    closeMenu(); if (same) return;
    const m = document.createElement('div');
    m.className = 'k-menu ad-menu'; m.dataset.for = btn.dataset.tplMore;
    m.innerHTML = items.map(([k, ic, l, danger]) => '<button type="button" class="k-menu-item' + (danger ? ' is-danger' : '') + '" data-m="' + k + '">' + icon(ic) + esc(l) + '</button>').join('');
    document.body.appendChild(m);
    const r = btn.getBoundingClientRect(), h = m.offsetHeight, below = r.bottom + 6 + h < window.innerHeight;
    m.style.top = (below ? r.bottom + 6 : r.top - 6 - h) + 'px';
    m.style.left = Math.max(8, Math.min(r.right - m.offsetWidth, window.innerWidth - m.offsetWidth - 8)) + 'px';
    m.style.transformOrigin = below ? 'top right' : 'bottom right';
    requestAnimationFrame(() => m.classList.add('is-open'));
    menuEl = m;
    setTimeout(() => document.addEventListener('mousedown', outside, true), 0);
    m.addEventListener('click', (e) => { const it = e.target.closest('[data-m]'); if (!it) return; closeMenu(); onPick(it.dataset.m); });
  }

  // ------------------------------------------------------------------ connect a number
  // Meta's JavaScript SDK, loaded when the window opens: the button must open Meta's popup right on
  // the click, or the browser blocks it.
  function loadSdk(appId) {
    if (W.sdk && W.sdkFor === appId) return W.sdk;
    W.sdkFor = appId;
    W.sdk = new Promise((resolve, reject) => {
      const init = () => { window.FB.init({ appId, autoLogAppEvents: false, xfbml: false, version: 'v21.0' }); resolve(window.FB); };
      if (window.FB) { init(); return; }
      window.fbAsyncInit = init;
      const sc = document.createElement('script');
      sc.src = 'https://connect.facebook.net/en_US/sdk.js'; sc.async = true; sc.crossOrigin = 'anonymous';
      sc.onerror = () => { W.sdk = null; reject(new Error('sdk')); };
      document.head.appendChild(sc);
    });
    return W.sdk;
  }
  // Meta's window for a number already in the WhatsApp Business app (coexistence): the owner logs in,
  // picks the business and scans a QR code with the app. Answers { code, info } (info: the account, or
  // where it was cancelled).
  function coexLogin(FB, configId) {
    return new Promise((resolve) => {
      let code = null, info = null, done = false, timer = 0;
      const end = () => { if (done) return; done = true; clearTimeout(timer); window.removeEventListener('message', onMsg); resolve({ code: code || '', info: info || {} }); };
      const ready = () => { if (code !== null && info) end(); };
      function onMsg(e) {
        let host = '';
        try { host = new URL(e.origin).hostname; } catch (err) { return; }
        if (!/(^|\.)facebook\.com$/.test(host)) return;
        let m = e.data;
        try { if (typeof m === 'string') m = JSON.parse(m); } catch (err) { return; }
        if (!m || m.type !== 'WA_EMBEDDED_SIGNUP') return;
        if (m.event === 'CANCEL') info = { cancel: (m.data && m.data.current_step) || 'cancel', error: m.data && m.data.error_message };
        else if (/^FINISH/.test(m.event || '')) info = m.data || {};
        ready();
      }
      window.addEventListener('message', onMsg);
      FB.login((resp) => {
        code = (resp && resp.authResponse && resp.authResponse.code) || '';
        // the account comes in a separate message, sometimes a moment after
        timer = setTimeout(end, code ? 6000 : 800);
        ready();
      }, { config_id: configId, response_type: 'code', override_default_response_type: true,
        extras: { setup: {}, featureType: 'whatsapp_business_app_onboarding', sessionInfoVersion: '3' } });
    });
  }

  // the Facebook login for WhatsApp in a small window (a whole page when a small one isn't allowed)
  const WA_LOGIN = '/api/fb-oauth-start?for=wa';
  function login(city) {
    return new Promise((resolve) => {
      const w = window.open(WA_LOGIN, 'c360wa', 'width=560,height=720');
      if (!w) { try { sessionStorage.setItem('c360_wa_city', city); } catch (e) { /* back to Timișoara */ } location.href = WA_LOGIN; return; }
      const onMsg = (e) => {
        if (e.origin !== location.origin || !e.data || e.data.type !== 'c360:wa') return;
        window.removeEventListener('message', onMsg); clearInterval(t);
        resolve(e.data);
      };
      window.addEventListener('message', onMsg);
      // closed without finishing
      const t = setInterval(() => { if (w.closed) { clearInterval(t); setTimeout(() => { window.removeEventListener('message', onMsg); resolve({ ok: false, closed: true }); }, 400); } }, 600);
    });
  }

  async function connect(city, opts) {
    const o = opts || {};
    let d;
    try { d = await load(true); } catch (e) { K.ui().toast(K.errText(e), 'error'); return; }
    const other = (d.numbers ? Object.keys(d.numbers) : []).find((c) => c !== city);
    const otherN = other ? d.numbers[other] : null;
    const st = { found: null, busy: false, pin: null };
    // the number in the WhatsApp Business app on the phone (coexistence): the WhatsApp app's details,
    // asked once; Meta's SDK loads now so its window opens right on the click
    const app = d.app || {};
    const appReady = !!(app.appId && app.configId && app.secretSaved);
    let FBsdk = null;
    if (appReady) loadSdk(app.appId).then((x) => { FBsdk = x; }).catch(() => {});
    let el = null;
    const errMsg = (err) => (err && err.data && err.data.message) || K.errText(err);

    const loginHtml = () => '<div class="wa-login">' +
      '<button type="button" class="k-btn is-primary wa-login-btn" data-login>' + icon('facebook') + 'Conectează cu Facebook</button>' +
      '<p class="k-muted">Alegi contul de WhatsApp al clinicii, apoi numărul pentru ' + esc(city) + '.</p>' +
      // once: Meta's login configuration with the WhatsApp permissions (until it's saved)
      (d.login && !d.login.configId ? '<details class="wa-cfg"><summary>Configurarea Meta pentru WhatsApp (o singură dată)</summary><div class="wa-cfg-row">' +
        '<input data-cfg inputmode="numeric" autocomplete="off" placeholder="ID configurare (Facebook Login for Business)"><button type="button" class="k-btn is-sm" data-cfg-save>Salvează</button></div></details>' : '') +
      '</div>';
    const rowsHtml = (list, attr) => '<div class="wa-pick">' + list.map((x, i) => {
      const usedBy = otherN && otherN.connected && otherN.phoneId === x.phoneId;
      const mine = d.numbers[city] && d.numbers[city].phoneId === x.phoneId;
      return '<button type="button" class="wa-pick-row' + (mine ? ' is-on' : '') + '" ' + attr + '="' + i + '"' + (usedBy ? ' disabled' : '') + '>' +
        '<span class="wa-pick-ic">' + icon('chat') + '</span><span class="wa-pick-main"><b>' + esc(x.display || x.phoneId) + '</b><small>' + esc(x.name || '') + '</small></span>' +
        (usedBy ? '<em>la ' + esc(other) + '</em>' : mine ? (attr === 'data-mpick' ? '<em class="is-on">apasă ca să salvezi tokenul</em>' : '<em class="is-on">conectat</em>') : icon('right')) + '</button>';
    }).join('') + '</div>';
    const listHtml = () => (st.found.length
      ? rowsHtml(st.found, 'data-pick')
      : '<p class="k-muted">' + icon('info') + 'Contul de Facebook ales nu are numere de WhatsApp Business. Apasă „Alt cont” și alege contul clinicii.</p>') +
      '<button type="button" class="k-btn is-ghost is-sm wa-relogin" data-login>' + icon('facebook') + 'Alt cont</button>';
    const pinHtml = () => '<div class="k-form wa-form"><p class="k-muted">Numărul are deja un PIN de verificare în doi pași (din WhatsApp Manager sau de la aplicația de până acum). Scrie-l:</p>' +
      K.field('PIN (6 cifre)', '<input data-pin inputmode="numeric" maxlength="6" autocomplete="off" placeholder="••••••">', 'full') +
      '<div class="k-field full"><button type="button" class="k-btn is-primary" data-pin-go>' + icon('check') + 'Pornește numărul</button></div></div>';
    const coexHtml = () => '<details class="wa-coex"><summary>Numărul e în aplicația WhatsApp Business de pe telefon?</summary>' +
      '<small>Rămâne și în aplicație, cu conversațiile. Se aduc în portal conversațiile din ultimele 6 luni și ce scrie recepția de pe telefon. Deschide WhatsApp Business pe telefon măcar o dată la 14 zile.</small>' +
      '<button type="button" class="k-btn is-outline" data-coex' + (appReady ? '' : ' disabled') + '>' + icon('chat') + 'Conectează din aplicația WhatsApp Business</button>' +
      (appReady ? '<small><a href="#" data-app-edit>Schimbă aplicația Meta</a></small>' : '<small>Întâi datele aplicației WhatsApp din Meta (o singură dată):</small>') +
      '<div class="k-form wa-form" data-appform' + (appReady ? ' hidden' : '') + '>' +
        K.field('App ID', '<input data-app-id inputmode="numeric" placeholder="ex. 2177971149814780" value="' + esc(app.appId || '') + '">', '', 'developers.facebook.com → aplicația cu WhatsApp → Setări aplicație → De bază') +
        K.field('App Secret' + (app.secretSaved ? ' (salvat; scrie doar ca să-l schimbi)' : ''), '<input data-app-secret type="password" autocomplete="off" placeholder="32 de caractere">', '', 'Același loc, „Arată” la App Secret') +
        K.field('Configuration ID', '<input data-app-config inputmode="numeric" value="' + esc(app.configId || '') + '">', 'full',
          'Facebook Login for Business → Configurații → Creează: tip „WhatsApp Embedded Signup”, cu whatsapp_business_management și whatsapp_business_messaging.') +
        '<div class="k-field full"><button type="button" class="k-btn is-outline" data-app-save>' + icon('check') + 'Salvează aplicația</button></div></div></details>';
    // the token never comes back to the browser: once the city is connected, a line says it's saved
    const manualHtml = () => {
      const n = d.numbers[city] || {};
      const when = n.connectedAt ? new Date(n.connectedAt).toLocaleDateString('ro-RO', { day: 'numeric', month: 'short', year: 'numeric' }) : '';
      return '<details class="wa-manual"' + (n.connected || !(d.login && d.login.configId) ? ' open' : '') + '><summary>Am un token</summary>' +
      (n.connected ? '<p class="wa-mnote is-ok">' + icon('check') + 'Token salvat pentru ' + esc(city) + (when ? ' · ' + esc(when) : '') + '</p>' : '') +
      '<div class="k-form wa-form">' +
      K.field('Token WhatsApp', '<textarea data-tok rows="3" placeholder="' + (n.connected ? 'Lipește un token nou doar ca să-l schimbi' : 'Token de System User cu whatsapp_business_messaging') + '" autocomplete="off"></textarea>', 'full') +
      K.field('ID cont WhatsApp Business (opțional)', '<input data-waba inputmode="numeric" autocomplete="off">', 'full') +
      '<div class="k-field full"><button type="button" class="k-btn is-outline" data-discover>' + icon('search') + 'Caută numerele</button></div></div><div data-mfound></div></details>';
    };
    const paint = () => {
      if (!el) return;
      el.querySelector('[data-step]').innerHTML = st.pin ? pinHtml() : st.found ? listHtml() : (d.tokenSaved ? '<div class="k-skel" style="height:120px"></div>' : loginHtml());
    };
    async function discover(token, wabaId) {
      try {
        const r = await K.api('/api/portal-wa', { action: 'discover', city, token: token || '', wabaId: wabaId || '' });
        st.found = r.found || [];
      } catch (err) { st.found = null; d.tokenSaved = false; K.ui().toast(errMsg(err), 'error'); }
      paint();
    }
    // with a pasted token: its numbers right under its button (or why there are none)
    async function discoverToken(token, wabaId) {
      const box = el.querySelector('[data-mfound]');
      if (!token && !d.tokenSaved) { box.innerHTML = '<p class="wa-mnote is-bad">' + icon('alert') + 'Lipește tokenul.</p>'; return; }
      box.innerHTML = '<div class="k-skel" style="height:64px"></div>';
      try {
        const r = await K.api('/api/portal-wa', { action: 'discover', city, token: token || '', wabaId: wabaId || '' });
        st.mfound = r.found || [];
        box.innerHTML = st.mfound.length ? '<p class="wa-mnote">' + (st.mfound.length === 1 ? 'Un număr găsit' : st.mfound.length + ' numere găsite') + '. Apasă pe numărul pentru ' + esc(city) + ' ca să-l conectezi și să salvezi tokenul:</p>' + rowsHtml(st.mfound, 'data-mpick')
          : '<p class="wa-mnote is-bad">' + icon('alert') + esc(r.message || 'Tokenul nu vede niciun număr. Verifică ID-ul contului WhatsApp Business și că tokenul are contul atribuit.') + '</p>';
      } catch (err) { box.innerHTML = '<p class="wa-mnote is-bad">' + icon('alert') + esc(errMsg(err)) + '</p>'; }
      box.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    }
    // the other city next, by itself, while it isn't connected
    function next() {
      const fresh = W.d && W.d.numbers;
      if (other && fresh && !fresh[other].connected && !o.noChain) setTimeout(() => connect(other, o), 450);
    }
    async function pick(x, pin) {
      try {
        const tokIn = el.querySelector('[data-tok]');
        await post({ action: 'connect', city, wabaId: x.wabaId, phoneId: x.phoneId, token: tokIn ? tokIn.value.trim() : '', pin: pin || '' });
        dr.close();
        K.ui().toast(city + ' e conectat. Mesajele pleacă și vin de pe ' + (x.display || 'el') + '.', 'success');
        if (o.onDone) o.onDone();
        next();
      } catch (err) {
        if (err.data && err.data.error === 'needs_pin') { st.pin = x; paint(); return; }
        K.ui().toast(errMsg(err), 'error');
      }
    }

    const dr = K.drawer({
      title: 'WhatsApp ' + city, icon: 'chat', width: 520,
      body: '<div data-step></div>' + coexHtml() + manualHtml(),
      footer: '<span class="k-grow"></span><button type="button" class="k-btn" data-cancel>Închide</button>',
      onMount(root) {
        el = root;
        paint();
        el.querySelector('[data-cancel]').addEventListener('click', () => dr.close());
        el.addEventListener('click', (e) => {
          const lg = e.target.closest('[data-login]');
          if (lg) {
            return K.busy(lg, async () => {
              const r = await login(city);
              if (r.ok) { d.tokenSaved = true; st.found = null; paint(); await discover(); }
              else if (!r.closed) K.ui().toast(r.message || 'Nu a mers. Încearcă din nou.', 'error');
            });
          }
          const pk = e.target.closest('[data-pick]');
          if (pk && !pk.disabled) {
            const x = st.found[Number(pk.dataset.pick)];
            return K.busy(pk, () => pick(x));
          }
          const mp = e.target.closest('[data-mpick]');
          if (mp && !mp.disabled) {
            const x = st.mfound[Number(mp.dataset.mpick)];
            return K.busy(mp, () => pick(x));
          }
          const pg = e.target.closest('[data-pin-go]');
          if (pg) {
            const pin = el.querySelector('[data-pin]').value.trim();
            if (!/^\d{6}$/.test(pin)) return K.ui().toast('PIN-ul are 6 cifre.', 'error');
            return K.busy(pg, () => pick(st.pin, pin));
          }
          const ed = e.target.closest('[data-app-edit]');
          if (ed) { e.preventDefault(); el.querySelector('[data-appform]').hidden = false; return; }
          const as = e.target.closest('[data-app-save]');
          if (as) {
            return K.busy(as, async () => {
              try {
                await post({ action: 'app_save', appId: el.querySelector('[data-app-id]').value.trim(), appSecret: el.querySelector('[data-app-secret]').value.trim(), configId: el.querySelector('[data-app-config]').value.trim() });
                if (!(W.d.app && W.d.app.secretSaved)) { K.ui().toast('Lipsește App Secret.', 'error'); return; }
                K.ui().toast('Aplicația e salvată.', 'success');
                dr.close(); setTimeout(() => connect(city, o), 250);
              } catch (err) { K.ui().toast(errMsg(err), 'error'); }
            });
          }
          const cx = e.target.closest('[data-coex]');
          if (cx && !cx.disabled) {
            if (!FBsdk) { K.ui().toast('Se încarcă fereastra Meta, apasă din nou într-o secundă.', 'info'); return; }
            const win = coexLogin(FBsdk, app.configId); // opened right on the click
            return K.busy(cx, async () => {
              const r = await win;
              if (!r.code || !r.info.waba_id) {
                K.ui().toast(r.info.error ? 'Meta: ' + r.info.error : r.code ? 'Meta nu a trimis contul WhatsApp. Încearcă din nou.' : 'Conectarea a fost oprită.', r.code ? 'error' : 'info');
                return;
              }
              try {
                const res = await post({ action: 'coex', city, code: r.code, wabaId: r.info.waba_id, phoneId: r.info.phone_number_id || '' });
                dr.close();
                K.ui().toast('Numărul ' + city + ' e conectat. Conversațiile vin în Mesaje în câteva minute.', 'success');
                if (res.warning) K.ui().toast('Atenție, Meta a refuzat ' + res.warning, 'error');
                if (o.onDone) o.onDone();
                next();
              } catch (err) { K.ui().toast(errMsg(err), 'error'); }
            });
          }
          const cs = e.target.closest('[data-cfg-save]');
          if (cs) {
            return K.busy(cs, async () => {
              try { d = await post({ action: 'login_config', configId: el.querySelector('[data-cfg]').value.trim() }); paint(); K.ui().toast('Salvat. Acum apasă „Conectează cu Facebook”.', 'success'); }
              catch (err) { K.ui().toast(errMsg(err), 'error'); }
            });
          }
          const ds = e.target.closest('[data-discover]');
          if (ds) return K.busy(ds, () => discoverToken(el.querySelector('[data-tok]').value.trim(), el.querySelector('[data-waba]').value.trim()));
        });
      },
    });
    // a login kept from before: its numbers right away
    if (d.tokenSaved) discover();
  }
  // back from Facebook in the whole page (no small window): the connect window opens again by itself
  if (/[?&]wa=(ok|error)/.test(location.search)) {
    const ok = /[?&]wa=ok/.test(location.search);
    let city = 'Timișoara';
    try { city = sessionStorage.getItem('c360_wa_city') || city; sessionStorage.removeItem('c360_wa_city'); } catch (e) { /* Timișoara */ }
    history.replaceState(null, '', location.pathname + location.hash);
    const resume = () => { K.go('integrari'); setTimeout(() => (ok ? connect(city) : K.ui().toast('Logarea la Facebook nu a mers. Încearcă din nou.', 'error')), 500); };
    let resumed = false;
    const once = () => { if (resumed) return; resumed = true; setTimeout(resume, 300); };
    if (K.data) once(); else K.on('data', once);
  }

  // ------------------------------------------------------------------ the profile clients see
  // Integrări → WhatsApp → Profil: photo, about, description, address, e-mail, site, category, through
  // Meta's API (no phone app). The name shows with Meta's review of it; it changes in WhatsApp Manager.
  const VERT = [['BEAUTY', 'Frumusețe, spa și salon'], ['HEALTH', 'Medical și sănătate'], ['PROF_SERVICES', 'Servicii profesionale'], ['RETAIL', 'Magazin'], ['OTHER', 'Altele']];
  const NAMEST = { APPROVED: 'aprobat', AVAILABLE_WITHOUT_REVIEW: 'aprobat', PENDING_REVIEW: 'în analiză la Meta', DECLINED: 'respins de Meta', EXPIRED: 'expirat', NONE: '' };
  const ADDR = { 'Timișoara': 'Strada Bucegi nr. 7, Timișoara', 'Arad': 'Strada Ioan Alexandru 16-18, Arad' };
  // a picture as Meta wants it: square, 640 px, JPEG
  const squarePhoto = (file) => new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const s = Math.min(img.naturalWidth, img.naturalHeight), size = Math.min(640, s);
      const cv = document.createElement('canvas'); cv.width = cv.height = size;
      cv.getContext('2d').drawImage(img, (img.naturalWidth - s) / 2, (img.naturalHeight - s) / 2, s, s, 0, 0, size, size);
      URL.revokeObjectURL(img.src);
      resolve(cv.toDataURL('image/jpeg', 0.9));
    };
    img.onerror = () => reject(new Error('Nu pot citi poza.'));
    img.src = URL.createObjectURL(file);
  });
  function profile(city) {
    const other = city === 'Timișoara' ? 'Arad' : 'Timișoara';
    let photo = '', el = null;
    const dr = K.drawer({
      title: 'Profil WhatsApp · ' + city, icon: 'chat', width: 520,
      body: '<div data-prof><div class="k-skel" style="height:320px"></div></div>',
      footer: '<span class="k-grow"></span><button type="button" class="k-btn" data-cancel>Închide</button><button type="button" class="k-btn is-primary" data-save disabled>' + icon('check') + 'Salvează</button>',
      onMount(root) {
        el = root;
        el.querySelector('[data-cancel]').addEventListener('click', () => dr.close());
        el.querySelector('[data-save]').addEventListener('click', (e) => K.busy(e.currentTarget, save));
        load();
      } });
    async function load() {
      const box = el.querySelector('[data-prof]');
      let r;
      try { r = await K.api('/api/portal-wa', { action: 'profile_get', city }); } catch (err) { box.innerHTML = K.empty('alert', 'Nu am putut citi profilul', (err.data && err.data.message) || K.errText(err)); return; }
      const p = r.profile || {}, n = r.number || {};
      const st = NAMEST[n.name_status] || (n.name_status || '').toLowerCase().replace(/_/g, ' ');
      const sites = p.websites || [];
      const otherOn = W.d && W.d.numbers && W.d.numbers[other] && W.d.numbers[other].connected;
      box.innerHTML = '<div class="wa-prof">' +
        '<div class="wa-prof-top"><span class="wa-prof-pic" data-pic' + (p.profile_picture_url ? ' style="background-image:url(&quot;' + esc(p.profile_picture_url) + '&quot;)"' : '') + '>' + (p.profile_picture_url ? '' : icon('image')) + '</span>' +
          '<div><b>' + esc(n.verified_name || city) + '</b><small>' + esc(n.display_phone_number || '') + (st ? ' · nume ' + esc(st) : '') + '</small>' +
          '<span class="wa-prof-btns"><label class="k-btn is-outline is-sm wa-prof-up">' + icon('share') + 'Schimbă poza<input type="file" accept="image/jpeg,image/png" data-file hidden></label>' +
          '<a class="k-btn is-ghost is-sm" href="https://business.facebook.com/latest/whatsapp_manager/phone_numbers" target="_blank" rel="noopener" title="Numele se schimbă doar în WhatsApp Manager, cu aprobarea Meta">' + icon('pen') + 'Schimbă numele</a></span></div></div>' +
        '<div class="k-form wa-form">' +
          K.field('Despre (apare sub nume)', '<input data-f="about" maxlength="139" value="' + esc(p.about || '') + '" placeholder="Ex. Remodelare corporală și tratamente faciale">', 'full') +
          K.field('Descriere', '<textarea data-f="description" rows="3" maxlength="512">' + esc(p.description || '') + '</textarea>', 'full') +
          K.field('Adresă', '<input data-f="address" maxlength="256" value="' + esc(p.address || ADDR[city] || '') + '">', 'full') +
          K.field('E-mail', '<input data-f="email" type="email" maxlength="128" value="' + esc(p.email || '') + '">', '') +
          K.field('Categorie', '<select data-f="vertical">' + K.options(VERT.concat(VERT.some((v) => v[0] === p.vertical) || !p.vertical ? [] : [[p.vertical, p.vertical]]), p.vertical || 'BEAUTY') + '</select>', '') +
          K.field('Site', '<input data-f="site1" type="url" maxlength="256" value="' + esc(sites[0] || 'https://www.centrul360.com') + '">', 'full') +
          K.field('Al doilea site (opțional)', '<input data-f="site2" type="url" maxlength="256" value="' + esc(sites[1] || '') + '">', 'full') +
          (otherOn ? '<div class="k-field full"><label class="k-switch"><input type="checkbox" data-both checked><i></i><span>Aceeași poză și texte și la ' + esc(other) + ' (adresa rămâne a fiecăruia)</span></label></div>' : '') +
        '</div></div>';
      el.querySelector('[data-save]').disabled = false;
      el.querySelector('[data-file]').addEventListener('change', async (e) => {
        const f = e.target.files && e.target.files[0];
        if (!f) return;
        try {
          photo = await squarePhoto(f);
          const pic = el.querySelector('[data-pic]');
          pic.style.backgroundImage = 'url("' + photo + '")'; pic.innerHTML = '';
        } catch (err) { K.ui().toast(err.message, 'error'); }
      });
    }
    async function save() {
      const v = (k) => { const x = el.querySelector('[data-f="' + k + '"]'); return x ? x.value.trim() : ''; };
      const both = el.querySelector('[data-both]');
      try {
        await K.api('/api/portal-wa', { action: 'profile_save', city, about: v('about'), description: v('description'), address: v('address'), email: v('email'), vertical: v('vertical'),
          websites: [v('site1'), v('site2')].filter(Boolean), photo, both: !!(both && both.checked) });
        K.ui().toast('Profilul WhatsApp e salvat' + (both && both.checked ? ' pe ambele numere' : '') + '. Clienții îl văd în câteva minute.', 'success');
        dr.close();
      } catch (err) { K.ui().toast((err.data && err.data.message) || K.errText(err), 'error'); }
    }
  }

  // ------------------------------------------------------------------ check the numbers
  async function check() {
    const dr = K.drawer({ title: 'Verifică WhatsApp', icon: 'shield', width: 560, body: '<div data-checks><div class="k-skel" style="height:260px"></div></div>',
      footer: '<span class="k-grow"></span><button type="button" class="k-btn" data-close>Închide</button>',
      onMount(el) {
        el.querySelector('[data-close]').addEventListener('click', () => dr.close());
        el.addEventListener('click', (e) => {
          const fx = e.target.closest('[data-fix]');
          if (fx) {
            return K.busy(fx, async () => {
              try {
                const r = await K.api('/api/portal-wa', { action: 'repair', city: fx.dataset.fix });
                K.ui().toast('Gata: ' + r.done.join(' · '), 'success');
                paint(el);
              } catch (err) { K.ui().toast((err.data && err.data.message) || K.errText(err), 'error'); }
            });
          }
          const ts = e.target.closest('[data-test]');
          if (ts) {
            const inp = el.querySelector('[data-test-phone="' + ts.dataset.test + '"]');
            return K.busy(ts, async () => {
              try {
                const r = await K.api('/api/portal-wa', { action: 'test_send', city: ts.dataset.test, phone: inp.value.trim() });
                K.ui().toast('Trimis de pe ' + r.from + ' (' + r.template + '). Verifică telefonul.', 'success');
              } catch (err) { K.ui().toast((err.data && err.data.message) || K.errText(err), 'error'); }
            });
          }
        });
        paint(el);
      } });
    async function paint(el) {
      const box = el.querySelector('[data-checks]');
      box.innerHTML = '<div class="k-skel" style="height:260px"></div>';
      let r;
      try { r = await K.api('/api/portal-wa', { action: 'check' }); } catch (err) { box.innerHTML = K.empty('alert', 'Nu am putut verifica', K.errText(err)); return; }
      const me = K.data && K.data.me && K.data.me.phone ? K.data.me.phone : '';
      box.innerHTML = Object.keys(r.checks).map((city) => {
        const list = r.checks[city];
        const bad = list.filter((x) => !x.ok).length, fix = list.some((x) => !x.ok && x.fix);
        return '<section class="wa-check"><h4>' + esc(city) + (bad ? '<span class="k-tag is-bad">' + bad + ' de rezolvat</span>' : '<span class="k-tag is-good">merge</span>') + '</h4>' +
          '<ul>' + list.map((x) => '<li class="' + (x.ok ? 'is-ok' : 'is-bad') + '">' + icon(x.ok ? 'checkCircle' : 'alert') + '<div><b>' + esc(x.label) + '</b>' + (x.detail ? '<small>' + esc(x.detail) + '</small>' : '') + '</div></li>').join('') + '</ul>' +
          '<div class="wa-check-acts">' + (fix ? '<button type="button" class="k-btn is-primary is-sm" data-fix="' + esc(city) + '">' + icon('refresh') + 'Repară</button>' : '') +
          '<input data-test-phone="' + esc(city) + '" type="tel" inputmode="tel" placeholder="Telefon pentru test" value="' + esc(me) + '">' +
          '<button type="button" class="k-btn is-outline is-sm" data-test="' + esc(city) + '">' + icon('chat') + 'Trimite un test</button></div></section>';
      }).join('');
    }
  }

  window.C360Wa = { check, load, post, edit, connect, profile, list, tag, cityTags, bubble, STATUS, CAT, VLABEL, get d() { return W.d; } };
})();
