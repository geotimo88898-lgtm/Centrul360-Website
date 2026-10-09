// Centrul360 portal — work: "Sarcini" (front desk message queue) and "SOP & Resurse".
// Sarcini: every message the front desk has to send, with the WhatsApp text already written,
// one tap to send, one tap to tick off, progress for the day. SOP & Resurse: the procedures for
// each role (followable as a checklist), the live Offers (same list as the website), scripts,
// protocols, treatment sheets, upsell and printable forms — searchable, and editable in place
// by the owner.
(function () {
  'use strict';
  const K = window.K;
  const { esc, icon } = K;

  // =====================================================================================
  // SARCINI
  // =====================================================================================
  const TYPES = {
    reminder_azi: { label: 'Reminder azi', ic: 'bell', tone: 'accent', msg: 'reminder' },
    confirmare_programare: { label: 'Confirmare programare', ic: 'checkCircle', tone: 'good', msg: 'confirm' },
    lead_inactiv: { label: 'Lead inactiv', ic: 'zap', tone: 'warn', msg: '' },
  };
  const T = { tasks: [], done: [], filter: '' };
  let tpanel;

  function waText(a, kind) {
    const first = String(a.clientName || '').split(' ')[0];
    const day = K.relDay(a.date) === 'Azi' ? 'azi' : K.relDay(a.date) === 'Mâine' ? 'mâine' : 'pe ' + K.dateLong(a.date).toLowerCase();
    if (kind === 'reminder') return 'Bună, ' + first + '! Îți reamintim de programarea de ' + day + ' la ora ' + a.time + ' la Centrul360 ' + a.location + '. Te așteptăm!';
    return 'Bună, ' + first + '! Îți confirmăm programarea la Centrul360 ' + a.location + ' ' + day + ' la ora ' + a.time + (a.treatment ? ', pentru ' + a.treatment : '') + '. Răspunde cu DA pentru confirmare. Mulțumim!';
  }

  function mountTasks(p) {
    tpanel = p;
    tpanel.classList.add('k-panel', 'wk');
    tpanel.innerHTML =
      '<div class="k-head"><div><div class="k-eyebrow">Clinică</div><h2>Sarcini</h2><p class="k-lede">Mesajele de trimis azi. Textul e deja scris — apeși WhatsApp, trimiți, apoi bifezi.</p></div>' +
      '<div class="k-head-actions"><button type="button" class="k-btn is-outline" data-act="refresh">' + icon('refresh') + 'Actualizează</button></div></div>' +
      '<div data-body><div class="k-skel" style="height:140px"></div></div>';
    tpanel.addEventListener('click', onTaskClick);
  }
  async function loadTasks() {
    try {
      const [p, all] = await Promise.all([K.api('/api/portal-automation-tasks'), K.api('/api/portal-automation-tasks?all=1')]);
      T.tasks = p.tasks || [];
      const today = K.today();
      T.done = (all.tasks || []).filter((t) => t.status === 'done' && t.doneBy !== 'system' && t.doneAt && K.iso(new Date(t.doneAt)) === today);
      K.badge('automatizari', T.tasks.length);
      renderTasks();
    } catch (e) {
      tpanel.querySelector('[data-body]').innerHTML = K.empty('alert', 'Nu am putut încărca sarcinile', 'Verifică conexiunea și reîncearcă.', '<button type="button" class="k-btn is-primary" data-act="refresh">Reîncearcă</button>');
    }
  }
  function renderTasks() {
    const total = T.tasks.length + T.done.length;
    const pct = total ? (T.done.length / total) * 100 : 100;
    const counts = {};
    T.tasks.forEach((t) => { counts[t.type] = (counts[t.type] || 0) + 1; });
    const list = T.tasks.filter((t) => !T.filter || t.type === T.filter);
    tpanel.querySelector('[data-body]').innerHTML =
      '<section class="k-card wk-progress">' + K.ring(pct, { size: 86, stroke: 9, inner: '<b class="wk-pct">' + T.done.length + '<small>/' + total + '</small></b>' }) +
        '<div><b>' + (T.tasks.length ? K.plural(T.tasks.length, 'mesaj de trimis', 'mesaje de trimis') : 'Totul e trimis pentru azi') + '</b>' +
        '<span>' + (T.done.length ? K.plural(T.done.length, 'sarcină bifată azi', 'sarcini bifate azi') : 'Nicio sarcină bifată încă azi') + ' · sarcinile pentru programări anulate se închid singure</span></div>' +
        (T.tasks.length > 1 ? '<button type="button" class="k-btn is-outline is-sm" data-act="all">' + icon('check') + 'Bifează toate</button>' : '') + '</section>' +
      (T.tasks.length ? '<div class="k-chips wk-chips"><button type="button" class="k-chip' + (!T.filter ? ' is-on' : '') + '" data-filter="">Toate<span>' + T.tasks.length + '</span></button>' +
        Object.keys(TYPES).filter((k) => counts[k]).map((k) => '<button type="button" class="k-chip' + (T.filter === k ? ' is-on' : '') + '" data-filter="' + k + '">' + icon(TYPES[k].ic) + TYPES[k].label + '<span>' + counts[k] + '</span></button>').join('') + '</div>' : '') +
      (list.length ? '<div class="wk-list">' + list.map(taskHtml).join('') + '</div>'
        : K.empty('checkCircle', 'Inbox zero', 'Nu mai e nimic de trimis. Sarcinile noi apar singure când se fac programări.'));
  }
  function taskHtml(t) {
    const ty = TYPES[t.type] || { label: t.type, ic: 'bell', tone: '' };
    const a = t.appointment;
    const phone = a && a.clientPhone;
    return '<article class="wk-task" data-task="' + esc(t.id) + '"><span class="k-icon-chip is-' + ty.tone + '">' + icon(ty.ic) + '</span>' +
      '<div class="wk-task-main"><div class="wk-task-top"><b>' + esc(a ? a.clientName : ty.label) + '</b><span class="k-tag is-' + ty.tone + '">' + ty.label + '</span>' + (t.location ? '<span class="k-tag">' + icon('pin') + esc(t.location) + '</span>' : '') +
      (a && !phone ? '<span class="k-tag is-warn" title="Adaugă telefonul în programare ca să poți trimite din aplicație">' + icon('alert') + 'fără telefon</span>' : '') + '</div>' +
      '<div class="wk-task-sub">' + (a ? esc(K.relDay(a.date) + ' · ' + (a.time || 'fără oră') + ' · ' + (a.treatment || '') + (a.cosmeticianName ? ' · cu ' + a.cosmeticianName : '')) : esc(t.text)) + '</div>' +
      (a && ty.msg ? '<div class="wk-msg">' + esc(waText(a, ty.msg)) + '</div>' : '') + '</div>' +
      '<div class="wk-task-actions">' +
        (phone && ty.msg ? '<a class="k-btn is-sm wk-wa" target="_blank" rel="noopener" data-sent="' + esc(t.id) + '" href="' + K.wa(phone, waText(a, ty.msg)) + '">' + icon('chat') + 'WhatsApp</a>' : '') +
        (phone ? '<a class="k-icon-btn" href="' + K.tel(phone) + '" title="Sună">' + icon('phone') + '</a>' : '') +
        (a ? '<button type="button" class="k-icon-btn" data-open="' + esc(a.id) + '" data-date="' + esc(a.date) + '" title="Deschide programarea">' + icon('calendar') + '</button>' : '') +
        '<button type="button" class="k-btn is-sm is-primary wk-done" data-done="' + esc(t.id) + '">' + icon('check') + 'Gata</button>' +
      '</div></article>';
  }
  async function complete(id, el) {
    if (el) el.classList.add('is-leaving');
    try {
      await K.api('/api/portal-automation-tasks', { action: 'complete', id });
      const t = T.tasks.find((x) => x.id === id);
      T.tasks = T.tasks.filter((x) => x.id !== id);
      if (t) T.done.push(t);
      K.badge('automatizari', T.tasks.length);
      setTimeout(renderTasks, el ? 280 : 0);
    } catch (e) { if (el) el.classList.remove('is-leaving'); K.ui().toast(K.errText(e), 'error'); }
  }
  async function onTaskClick(e) {
    const t = e.target;
    if (t.closest('[data-act="refresh"]')) return loadTasks();
    if (t.closest('[data-act="all"]')) {
      if (!(await K.ui().confirm({ title: 'Bifezi toate sarcinile?', message: 'Fă asta doar dacă ai trimis toate mesajele.', confirmText: 'Bifează ' + T.tasks.length })) ) return;
      for (const x of T.tasks.slice()) await complete(x.id, null);
      K.ui().toast('Toate sarcinile sunt bifate.', 'success');
      return;
    }
    const f = t.closest('[data-filter]');
    if (f) { T.filter = f.dataset.filter; return renderTasks(); }
    const sent = t.closest('[data-sent]');
    if (sent) { // after opening WhatsApp, offer to tick it off
      const card = sent.closest('.wk-task');
      setTimeout(() => card && card.classList.add('is-sent'), 400);
      return;
    }
    const done = t.closest('[data-done]');
    if (done) return complete(done.dataset.done, done.closest('.wk-task'));
    const open = t.closest('[data-open]');
    if (open) { K.go('programari'); setTimeout(() => K.emit('calendar:open', { id: open.dataset.open, date: open.dataset.date }), 250); }
  }
  K.section('automatizari', { mount: mountTasks, show: loadTasks });

  // =====================================================================================
  // SOP & RESURSE
  // =====================================================================================
  const R = { tab: '', q: '', edit: false };
  let rpanel;
  const ROLE_LABEL = { receptie: 'Recepție', cosmetician: 'Cosmeticiană', toti: 'Toată echipa' };
  const SOP_ICONS = ['sunrise', 'zap', 'calendar', 'checkCircle', 'users', 'wallet', 'moon', 'alert', 'file', 'sparkles', 'gift', 'star', 'phone', 'shield', 'book', 'clock'];

  function tabs() {
    const D = K.data, role = D.isAdmin ? 'admin' : D.me.role;
    const t = [];
    if (role === 'admin') { t.push({ id: 'sop-receptie', label: 'SOP Recepție', ic: 'listCheck', group: 'Proceduri' }); t.push({ id: 'sop-cosmetician', label: 'SOP Cosmeticiană', ic: 'listCheck', group: 'Proceduri' }); }
    else t.push({ id: 'sop-' + role, label: 'SOP-ul meu', ic: 'listCheck', group: 'Proceduri' });
    t.push({ id: 'sop-toti', label: 'Reguli pentru toți', ic: 'star', group: 'Proceduri' });
    t.push({ id: 'oferte', label: 'Oferte active', ic: 'tag', group: 'Vânzare' });
    if (role !== 'cosmetician') t.push({ id: 'scripturi', label: 'Scripturi telefon', ic: 'phone', group: 'Vânzare' });
    t.push({ id: 'upsell', label: 'Upsell', ic: 'gift', group: 'Vânzare' });
    if (role !== 'receptie') t.push({ id: 'protocoale', label: 'Protocoale aparate', ic: 'sliders', group: 'Tratamente' });
    t.push({ id: 'fise', label: 'Fișe tratament', ic: 'book', group: 'Tratamente' });
    t.push({ id: 'print', label: 'De printat', ic: 'printer', group: 'Tratamente' });
    return t;
  }

  function mountRes(p) {
    rpanel = p;
    rpanel.classList.add('k-panel', 'rs');
    rpanel.innerHTML =
      '<div class="k-head"><div><div class="k-eyebrow">Echipă</div><h2>SOP & Resurse</h2><p class="k-lede" data-lede></p></div>' +
      '<div class="k-head-actions"><label class="k-search">' + icon('search') + '<input data-q placeholder="Caută în tot (ex: anulare, HIFU, avans)…"></label></div></div>' +
      '<div class="rs-layout"><nav class="rs-nav" data-nav></nav><div class="rs-content" data-content></div></div>';
    rpanel.addEventListener('click', onResClick);
    rpanel.querySelector('[data-q]').addEventListener('input', (e) => { R.q = e.target.value.trim(); renderContent(); });
  }
  function renderRes() {
    if (!rpanel || !K.data) return;
    const D = K.data;
    rpanel.querySelector('[data-lede]').textContent = D.isAdmin ? 'Procedurile fiecărui rol și materialele echipei. Apasă „Editează” pe orice secțiune ca s-o modifici.'
      : D.me.role === 'receptie' ? 'Cum lucrăm la recepție — pas cu pas. Bifează pașii pe măsură ce îi faci.' : 'Cum lucrăm în cabină — pas cu pas, plus protocoalele aparatelor.';
    const t = tabs();
    if (!t.some((x) => x.id === R.tab)) R.tab = t[0].id;
    let group = '';
    rpanel.querySelector('[data-nav]').innerHTML = t.map((x) => {
      const g = x.group !== group ? '<div class="rs-group">' + esc(x.group) + '</div>' : '';
      group = x.group;
      return g + '<button type="button" data-tab="' + x.id + '" class="' + (x.id === R.tab ? 'is-on' : '') + '">' + icon(x.ic) + '<span>' + esc(x.label) + '</span></button>';
    }).join('');
    renderContent();
  }

  // ---------------- SOP (followable checklist, per day)
  const doneKey = () => 'c360_sop_' + (K.data.me.id || '') + '_' + K.today();
  const doneState = () => { try { return JSON.parse(localStorage.getItem(doneKey()) || '{}'); } catch (e) { return {}; } };
  function sopHtml(role, list, q) {
    const s = doneState();
    const match = (x) => !q || K.norm(x.title + ' ' + x.when + ' ' + x.steps.join(' ')).includes(K.norm(q));
    const items = list.filter(match);
    if (!items.length) return q ? '' : K.empty('listCheck', 'Nicio procedură încă', K.data.isAdmin ? 'Apasă Editează ca să adaugi prima procedură.' : '');
    return '<div class="rs-sops">' + items.map((x) => {
      const done = x.steps.filter((_, i) => s[x.id + ':' + i]).length;
      return '<section class="rs-sop' + (done === x.steps.length && done ? ' is-done' : '') + '"><header><span class="k-icon-chip is-accent">' + icon(x.icon || 'file') + '</span>' +
        '<div><h4>' + esc(x.title) + '</h4>' + (x.when ? '<span>' + icon('clock') + esc(x.when) + '</span>' : '') + '</div>' +
        '<em class="rs-count">' + done + '/' + x.steps.length + '</em></header>' +
        '<ol>' + x.steps.map((st, i) => '<li><button type="button" class="' + (s[x.id + ':' + i] ? 'is-done' : '') + '" data-step="' + esc(x.id + ':' + i) + '"><i>' + icon('check') + '</i><span>' + esc(st) + '</span></button></li>').join('') + '</ol></section>';
    }).join('') + '</div>';
  }

  function listHtml(items, opts) {
    const q = K.norm(R.q);
    const f = items.filter((x) => !q || K.norm(x).includes(q));
    if (!f.length) return '';
    return '<div class="rs-cards">' + f.map((x) => '<div class="rs-card">' + (opts && opts.copy ? '<button type="button" class="k-icon-btn rs-copy" data-copy="' + esc(x) + '" title="Copiază">' + icon('copy') + '</button>' : '') + '<p>' + esc(x) + '</p></div>').join('') + '</div>';
  }
  function referenceHtml(lines) {
    const blocks = [];
    (lines || []).forEach((l) => { if (l.indexOf('## ') === 0) blocks.push({ title: l.slice(3), items: [] }); else if (blocks.length) blocks[blocks.length - 1].items.push(l); });
    const q = K.norm(R.q);
    const f = blocks.filter((b) => !q || K.norm(b.title + ' ' + b.items.join(' ')).includes(q));
    if (!f.length) return '';
    return '<div class="rs-ref">' + f.map((b) => '<details class="rs-refcard"' + (q || f.length < 3 ? ' open' : '') + '><summary><span class="k-icon-chip is-info">' + icon('book') + '</span><b>' + esc(b.title) + '</b>' + icon('down') + '</summary>' +
      '<dl>' + b.items.map((it) => { const m = /^([^:?]{2,60}[:?])\s*(.*)$/.exec(it); return m ? '<dt>' + esc(m[1].replace(/:$/, '')) + '</dt><dd>' + esc(m[2]) + '</dd>' : '<dd class="full">' + esc(it) + '</dd>'; }).join('') + '</dl></details>').join('') + '</div>';
  }
  function offersHtml() {
    const q = K.norm(R.q);
    const offers = (K.data.offers || []).filter((o) => !q || K.norm(o.title + ' ' + o.description).includes(q));
    if (!offers.length) return '';
    const loc = { timisoara: 'Timișoara', arad: 'Arad' };
    return '<p class="rs-hint">' + icon('info') + 'Aceeași listă ca pe site — se actualizează singură când administratorul schimbă o ofertă.</p><div class="rs-offers">' + offers.map((o) => {
      const lines = String(o.description || '').split('\n').filter(Boolean);
      const pitch = o.title + ' — ' + o.priceNew + ' lei' + (o.priceOld > o.priceNew ? ' în loc de ' + o.priceOld + ' lei' : '') + (lines[0] ? '. ' + lines[0] : '');
      return '<article class="rs-offer"><header><b>' + esc(o.title) + '</b>' + (o.discountPercent ? '<span class="k-tag is-accent">−' + o.discountPercent + '%</span>' : '') + '</header>' +
        '<div class="rs-price"><b>' + K.lei(o.priceNew) + '</b>' + (o.priceOld > o.priceNew ? '<s>' + K.lei(o.priceOld) + '</s>' : '') + '</div>' +
        (lines.length ? '<ul>' + lines.map((l) => '<li>' + esc(l) + '</li>').join('') + '</ul>' : '') +
        '<footer>' + (o.locations || []).map((l) => '<span class="k-tag">' + icon('pin') + loc[l] + '</span>').join('') + (o.guarantee ? '<span class="k-tag is-good">' + icon('shield') + 'Garanția banilor înapoi</span>' : '') +
        (K.data.isAdmin && o.ads ? '<span class="k-tag is-info">' + icon('sparkles') + 'în reclame</span>' : '') +
        '<button type="button" class="k-icon-btn" data-copy="' + esc(pitch) + '" title="Copiază pentru WhatsApp">' + icon('copy') + '</button></footer></article>';
    }).join('') + '</div>';
  }
  function printHtml() {
    return '<div class="rs-print">' +
      '<a class="rs-pdf" href="/fise/program-recomandat-si-oferta.pdf" target="_blank" rel="noopener"><span class="k-icon-chip is-accent">' + icon('file') + '</span><div><b>Program recomandat și ofertă</b><span>PDF · pentru clientă, după consultație</span></div>' + icon('printer') + '</a>' +
      '<a class="rs-pdf" href="/fise/fisa-client-proceduri-corporale.pdf" target="_blank" rel="noopener"><span class="k-icon-chip is-accent">' + icon('file') + '</span><div><b>Fișă client — proceduri corporale</b><span>PDF · se completează la prima vizită</span></div>' + icon('printer') + '</a></div>';
  }

  function section(id) {
    const D = K.data, r = D.resources || {};
    const sops = D.sops || {};
    if (id.indexOf('sop-') === 0) { const role = id.slice(4); return { title: (role === 'toti' ? 'Reguli pentru toată echipa' : 'SOP · ' + ROLE_LABEL[role]), html: sopHtml(role, sops[role] || [], R.q), edit: 'sop:' + role }; }
    if (id === 'oferte') return { title: 'Oferte active', html: offersHtml(), editGo: 'oferte' };
    if (id === 'scripturi') return { title: 'Scripturi pentru telefon și recepție', html: listHtml(r.receptionScripts || [], { copy: true }), edit: 'res:receptionScripts' };
    if (id === 'upsell') return { title: 'Pachete de upsell recomandate', html: listHtml(r.upsellPackages || []), edit: 'res:upsellPackages' };
    if (id === 'protocoale') return { title: 'Protocoale pe aparat', html: listHtml(r.treatmentProtocols || []), edit: 'res:treatmentProtocols' };
    if (id === 'fise') return { title: 'Fișe de referință pe tratament', html: referenceHtml(r.treatmentReference), edit: 'res:treatmentReference' };
    if (id === 'print') return { title: 'Fișe de printat', html: printHtml() };
    return { title: '', html: '' };
  }

  function renderContent() {
    const el = rpanel.querySelector('[data-content]');
    if (R.q) { // search across every tab the user can see
      const hits = tabs().map((t) => ({ t, s: section(t.id) })).filter((x) => x.s.html && x.t.id !== 'print');
      el.innerHTML = hits.length ? hits.map((x) => '<div class="rs-hit-head">' + icon(x.t.ic) + esc(x.t.label) + '</div>' + x.s.html).join('')
        : K.empty('search', 'Nimic găsit pentru „' + R.q + '”', 'Încearcă alt cuvânt.');
      return;
    }
    const s = section(R.tab);
    el.innerHTML = '<div class="rs-title"><h3>' + esc(s.title) + '</h3>' +
      (K.data.isAdmin && s.edit ? '<button type="button" class="k-btn is-outline is-sm" data-edit="' + s.edit + '">' + icon('pen') + 'Editează</button>' : '') +
      (K.data.isAdmin && s.editGo ? '<button type="button" class="k-btn is-outline is-sm" data-go="' + s.editGo + '">' + icon('pen') + 'Gestionează în Oferte</button>' : '') + '</div>' +
      '<div class="rs-body">' + (s.html || K.empty('book', 'Nimic aici încă', '')) + '</div>';
  }

  function onResClick(e) {
    const t = e.target;
    const tab = t.closest('[data-tab]');
    if (tab && rpanel.querySelector('[data-nav]').contains(tab)) { R.tab = tab.dataset.tab; R.q = ''; rpanel.querySelector('[data-q]').value = ''; return renderRes(); }
    const step = t.closest('[data-step]');
    if (step) {
      const s = doneState(); s[step.dataset.step] = !s[step.dataset.step];
      try { localStorage.setItem(doneKey(), JSON.stringify(s)); } catch (err) { /* private mode */ }
      return renderContent();
    }
    const cp = t.closest('[data-copy]');
    if (cp) return K.copy(cp.dataset.copy);
    const go = t.closest('[data-go]');
    if (go) return K.go(go.dataset.go);
    const ed = t.closest('[data-edit]');
    if (ed) { const [kind, key] = ed.dataset.edit.split(':'); return kind === 'sop' ? editSops(key) : editList(key); }
  }

  // ---------------- owner editors
  function editList(key) {
    const titles = { receptionScripts: 'Scripturi', upsellPackages: 'Upsell', treatmentProtocols: 'Protocoale', treatmentReference: 'Fișe tratament' };
    const lines = (K.data.resources[key] || []).join('\n');
    const d = K.drawer({
      title: 'Editează · ' + titles[key], icon: 'pen', width: 640,
      subtitle: key === 'treatmentReference' ? 'O linie = un rând. Un rând care începe cu „## ” deschide o fișă nouă (numele tratamentului).' : 'Fiecare linie devine un card separat.',
      body: '<textarea class="rs-editor" data-text rows="22">' + esc(lines) + '</textarea>',
      footer: '<span class="k-grow k-muted">Se vede imediat la toată echipa.</span><button type="button" class="k-btn" data-cancel>Renunță</button><button type="button" class="k-btn is-primary" data-save>' + icon('check') + 'Salvează</button>',
      onMount(el) {
        el.querySelector('[data-cancel]').addEventListener('click', () => d.close());
        el.querySelector('[data-save]').addEventListener('click', (ev) => K.busy(ev.currentTarget, async () => {
          const arr = el.querySelector('[data-text]').value.split('\n').map((x) => x.trim()).filter(Boolean);
          try { await K.api('/api/portal-config', { resources: { [key]: arr } }); d.close(); K.ui().toast('Salvat.', 'success'); K.reload(); }
          catch (err) { K.ui().toast(K.errText(err), 'error'); }
        }));
      },
    });
  }
  function editSops(role) {
    let list = JSON.parse(JSON.stringify((K.data.sops || {})[role] || []));
    const d = K.drawer({
      title: 'Editează SOP · ' + ROLE_LABEL[role], icon: 'listCheck', width: 680, subtitle: 'Titlu, când se aplică și pașii (câte unul pe linie). Ordinea de aici e ordinea din aplicație.',
      body: '<div data-sops></div><button type="button" class="k-btn is-outline rs-add" data-add>' + icon('plus') + 'Adaugă procedură</button>',
      footer: '<span class="k-grow k-muted">' + (role === 'toti' ? 'Văzut de toată echipa.' : 'Văzut de ' + ROLE_LABEL[role].toLowerCase() + ' și de tine.') + '</span><button type="button" class="k-btn" data-cancel>Renunță</button><button type="button" class="k-btn is-primary" data-save>' + icon('check') + 'Salvează</button>',
      onMount(el) {
        const box = el.querySelector('[data-sops]');
        const read = () => { box.querySelectorAll('[data-i]').forEach((row) => { const x = list[+row.dataset.i]; x.title = row.querySelector('[data-f="title"]').value; x.when = row.querySelector('[data-f="when"]').value; x.icon = row.querySelector('[data-f="icon"]').value; x.steps = row.querySelector('[data-f="steps"]').value.split('\n').map((s) => s.trim()).filter(Boolean); }); };
        const paint = () => {
          box.innerHTML = list.map((x, i) => '<div class="rs-ed" data-i="' + i + '"><div class="rs-ed-head"><select data-f="icon" aria-label="Iconiță">' + K.options(SOP_ICONS.map((ic) => [ic, ic]), x.icon) + '</select>' +
            '<input data-f="title" value="' + esc(x.title) + '" placeholder="Titlu procedură">' +
            '<button type="button" class="k-icon-btn" data-up="' + i + '"' + (i ? '' : ' disabled') + '>' + icon('up') + '</button><button type="button" class="k-icon-btn" data-down="' + i + '"' + (i < list.length - 1 ? '' : ' disabled') + '>' + icon('down') + '</button>' +
            '<button type="button" class="k-icon-btn" data-rm="' + i + '">' + icon('trash') + '</button></div>' +
            '<input data-f="when" value="' + esc(x.when || '') + '" placeholder="Când se aplică (ex: Zilnic, înainte de primul client)">' +
            '<textarea data-f="steps" rows="' + Math.max(3, x.steps.length + 1) + '" placeholder="Un pas pe linie">' + esc(x.steps.join('\n')) + '</textarea></div>').join('');
        };
        paint();
        el.addEventListener('click', (ev) => {
          const b = ev.target.closest('[data-up],[data-down],[data-rm],[data-add]');
          if (!b) return;
          read();
          if (b.dataset.add !== undefined && b.hasAttribute('data-add')) list.push({ id: '', title: '', when: '', icon: 'file', steps: [] });
          if (b.dataset.up) { const i = +b.dataset.up; [list[i - 1], list[i]] = [list[i], list[i - 1]]; }
          if (b.dataset.down) { const i = +b.dataset.down; [list[i + 1], list[i]] = [list[i], list[i + 1]]; }
          if (b.dataset.rm) list.splice(+b.dataset.rm, 1);
          paint();
          if (b.hasAttribute('data-add')) { const inputs = box.querySelectorAll('[data-f="title"]'); inputs[inputs.length - 1].focus(); }
        });
        el.querySelector('[data-cancel]').addEventListener('click', () => d.close());
        el.querySelector('[data-save]').addEventListener('click', (ev) => K.busy(ev.currentTarget, async () => {
          read();
          const clean = list.filter((x) => x.title.trim() || x.steps.length);
          try { await K.api('/api/portal-config', { sops: { [role]: clean } }); d.close(); K.ui().toast('SOP salvat.', 'success'); K.reload(); }
          catch (err) { K.ui().toast(K.errText(err), 'error'); }
        }));
      },
    });
  }

  K.section('resurse', { mount: mountRes, show: renderRes, data() { if (rpanel && K.isActive('resurse')) renderRes(); } });
  K.on('resurse:fise', () => { R.tab = 'print'; if (rpanel) renderRes(); });
  K.on('resurse:tab', (tab) => { R.tab = tab; if (rpanel) renderRes(); });
})();
