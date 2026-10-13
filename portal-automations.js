// Centrul360 portal - Admin → Automatizări: the owner's flows in folders (Intake for the leads from the
// ads, Reminders for the appointments, any others she makes). Each flow is one row like in Reclame:
// tick, on / off, the name, the numbers she picked; a tap opens it on the canvas editor
// (portal-builder.js). Istoric: every run, filtered by flow, folder, form, status, period.
// The engine lives in api/_lib/workflows.js, the data comes from /api/portal-workflows.
(function () {
  'use strict';
  const K = window.K;
  const { esc, icon } = K;

  const TRIG = {
    lead_created: 'Lead nou', stage_changed: 'Lead mutat în etapă', lead_idle: 'Lead necontactat',
    appointment_created: 'Programare nouă', appointment_before: 'Înainte de programare',
    appointment_status: 'Status programare', appointment_after: 'După tratament',
  };
  const RUN = { waiting: ['Programat', 'info'], done: ['Terminat', 'good'], stopped: ['Oprit', ''], error: ['Eroare', 'bad'] };
  // sel: the flows ticked; closed: the folders folded; h: the history filters
  const S = { d: null, tab: 'flows', loading: false, q: '', show: 'all', folder: '', trig: '', sel: new Set(), closed: new Set(),
    h: { wf: '', folder: '', form: '', status: '', period: '30d', q: '' } };
  let panel;

  const NONE = '__none';
  const folderName = (id) => ((S.d.folders || []).find((f) => f.id === id) || {}).name || '';
  const ago = (iso) => (iso ? K.ago(iso) : '-');
  const whenShort = (iso) => { if (!iso) return '-'; const d = new Date(iso); return K.dateShort(K.iso(d)) + ', ' + K.pad(d.getHours()) + ':' + K.pad(d.getMinutes()); };
  const stepsOf = (w) => (function cnt(l) { return (l || []).reduce((a, x) => a + 1 + (x.type === 'if' ? cnt(x.yes) + cnt(x.no) : 0), 0); })(w.steps);
  const statOf = (w) => Object.assign({ waiting: 0, done: 0, stopped: 0, errors: 0, runs7d: 0, runs30d: 0, last: '' }, (S.d.stats || {})[w.id] || {}, { counters: (S.d.counters || {})[w.id] || { runs: 0, sent: 0, tasks: 0 } });

  // ------------------------------------------------------------------ what a row / the cards can show
  const M = {
    waiting: { label: 'Rulări active', group: 'Rulări', hint: 'Programate acum, așteaptă pasul următor', val: (x) => x.waiting },
    runs: { label: 'Rulări totale', group: 'Rulări', val: (x) => x.counters.runs },
    runs7d: { label: 'Rulări 7 zile', group: 'Rulări', val: (x) => x.runs7d },
    runs30d: { label: 'Rulări 30 zile', group: 'Rulări', val: (x) => x.runs30d },
    done: { label: 'Terminate', group: 'Rulări', val: (x) => x.done },
    stopped: { label: 'Oprite', group: 'Rulări', hint: 'Oprite de o condiție sau de o schimbare', val: (x) => x.stopped },
    errors: { label: 'Erori', group: 'Rulări', val: (x) => x.errors },
    sent: { label: 'Mesaje trimise', group: 'Ce au făcut', val: (x) => x.counters.sent },
    tasks: { label: 'Sarcini create', group: 'Ce au făcut', val: (x) => x.counters.tasks },
    lastRun: { label: 'Ultima rulare', group: 'Detalii', text: true, only: ['cols'], val: (x) => (x.last ? ago(x.last) : '-') },
    trigger: { label: 'Declanșator', group: 'Detalii', text: true, only: ['cols'], val: (x, w) => TRIG[w.trigger.type] || w.trigger.type },
    steps: { label: 'Pași', group: 'Detalii', only: ['cols'], val: (x, w) => stepsOf(w) },
    updated: { label: 'Modificată', group: 'Detalii', text: true, only: ['cols'], val: (x, w) => whenShort(w.updatedAt) },
    created: { label: 'Creată', group: 'Detalii', text: true, only: ['cols'], val: (x, w) => whenShort(w.createdAt) },
    count: { label: 'Automatizări', group: 'Detalii', only: ['cards'], val: (x) => x.count },
    activeCount: { label: 'Pornite', group: 'Detalii', only: ['cards'], val: (x) => x.on },
  };
  const GROUPS = ['Rulări', 'Ce au făcut', 'Detalii'];
  const DEF_COLS = ['waiting', 'runs', 'runs7d', 'sent', 'lastRun'];
  const DEF_CARDS = ['activeCount', 'waiting', 'runs', 'runs7d', 'sent'];
  const okIds = (list, part) => (Array.isArray(list) ? list : []).filter((id) => M[id] && (!M[id].only || M[id].only.includes(part)));
  const cols = () => okIds(K.prefs.get('wf.cols', DEF_COLS), 'cols');
  const cards = () => okIds(K.prefs.get('wf.cards', DEF_CARDS), 'cards');

  // ------------------------------------------------------------------ page
  function mount(p) {
    panel = p;
    panel.classList.add('k-panel', 'au', 'ad');
    panel.innerHTML =
      '<div class="k-head"><div><div class="k-eyebrow">Admin</div><h2>Automatizări</h2></div>' +
      '<div class="k-head-actions"><button type="button" class="k-btn is-outline" data-act="customize">' + icon('sliders') + 'Coloane și KPI</button>' +
      '<button type="button" class="k-btn is-outline" data-act="folder-new">' + icon('folder') + 'Folder nou</button>' +
      '<button type="button" class="k-btn is-accent" data-act="new">' + icon('plus') + 'Automatizare nouă</button></div></div>' +
      '<div data-body><div class="k-skel" style="height:110px;margin-bottom:1rem"></div><div class="k-skel" style="height:320px"></div></div>';
    panel.addEventListener('click', onClick);
    panel.addEventListener('change', onChange);
    panel.addEventListener('input', (e) => {
      if (e.target.matches('[data-q]')) { S.q = e.target.value; paintFlows(); }
      if (e.target.matches('[data-hq]')) { S.h.q = e.target.value; paintLog(); }
    });
  }
  async function load() {
    if (S.loading) return;
    S.loading = true;
    try {
      [S.d] = await Promise.all([K.api('/api/portal-workflows'), K.prefs.load()]);
      const ids = new Set(S.d.workflows.map((w) => w.id)); S.sel.forEach((id) => { if (!ids.has(id)) S.sel.delete(id); });
      render();
    } catch (e) { panel.querySelector('[data-body]').innerHTML = K.empty('alert', 'Nu am putut încărca automatizările', 'Verifică conexiunea și reîncearcă.', '<button type="button" class="k-btn is-primary" data-act="reload">Reîncearcă</button>'); }
    finally { S.loading = false; }
  }
  const post = async (body) => { S.d = await K.api('/api/portal-workflows', body); const ids = new Set(S.d.workflows.map((w) => w.id)); S.sel.forEach((id) => { if (!ids.has(id)) S.sel.delete(id); }); render(); };

  function render() {
    const d = S.d;
    const folders = d.folders || [];
    panel.querySelector('[data-body]').innerHTML =
      '<div data-stats></div>' +
      '<div class="ad-tabs">' + K.seg('autab', [['flows', 'Automatizări', 'zap'], ['tpl', 'Șabloane WhatsApp', 'chat'], ['log', 'Istoric', 'clock']], S.tab, 'is-big') + '</div>' +
      '<div data-pane="flows"' + (S.tab === 'flows' ? '' : ' hidden') + '>' +
        '<div class="ad-bar au-bar"><label class="ad-search">' + icon('search') + '<input data-q type="search" placeholder="Caută o automatizare…" value="' + esc(S.q) + '"></label>' +
          '<div class="k-chips">' + [['all', 'Toate'], ['on', 'Pornite'], ['off', 'Oprite']].map(([k, l]) => '<button type="button" class="k-chip' + (S.show === k ? ' is-on' : '') + '" data-show="' + k + '">' + l + '<span>' + d.workflows.filter((w) => k === 'all' || (k === 'on') === !!w.active).length + '</span></button>').join('') + '</div>' +
          '<select data-ffolder aria-label="Folder">' + K.options([['', 'Toate folderele']].concat(folders.map((f) => [f.id, f.name]), [[NONE, 'Fără folder']]), S.folder) + '</select>' +
          '<select data-ftrig aria-label="Declanșator">' + K.options([['', 'Orice declanșator']].concat(Object.keys(TRIG).map((k) => [k, TRIG[k]])), S.trig) + '</select>' +
        '</div>' +
        '<div data-bulk></div>' +
        '<div data-flows></div>' +
      '</div>' +
      '<div data-pane="tpl"' + (S.tab === 'tpl' ? '' : ' hidden') + '><div data-tpl><div class="k-skel" style="height:220px"></div></div></div>' +
      '<div data-pane="log"' + (S.tab === 'log' ? '' : ' hidden') + '>' + logFilters() + '<div data-log></div></div>';
    paintStats(); paintFlows(); paintLog();
    if (S.tab === 'tpl') paintTpl();
  }

  // the cards on top: of the ticked flows, or of all of them
  function paintStats() {
    const box = panel.querySelector('[data-stats]'); if (!box) return;
    const picked = S.d.workflows.filter((w) => S.sel.has(w.id));
    const list = picked.length ? picked : S.d.workflows;
    const t = { count: list.length, on: list.filter((w) => w.active).length, counters: { runs: 0, sent: 0, tasks: 0 }, waiting: 0, done: 0, stopped: 0, errors: 0, runs7d: 0, runs30d: 0 };
    list.forEach((w) => { const x = statOf(w); ['waiting', 'done', 'stopped', 'errors', 'runs7d', 'runs30d'].forEach((k) => { t[k] += x[k]; }); ['runs', 'sent', 'tasks'].forEach((k) => { t.counters[k] += x.counters[k] || 0; }); });
    const ic = { waiting: 'clock', runs: 'zap', runs7d: 'zap', runs30d: 'zap', done: 'check', stopped: 'ban', errors: 'alert', sent: 'chat', tasks: 'listCheck', count: 'layers', activeCount: 'zap' };
    box.innerHTML = (picked.length ? '<div class="ad-scope">' + icon('check') + '<span>Cifrele sunt pentru <b>' + K.plural(picked.length, 'automatizare selectată', 'automatizări selectate') + '</b></span><button type="button" class="k-btn is-ghost is-sm" data-sel-clear>Toate</button></div>' : '') +
      '<div class="ad-stats">' + cards().map((id) => '<div class="k-card ad-stat"' + (M[id].hint ? ' title="' + esc(M[id].hint) + '"' : '') + '><span class="k-icon-chip is-accent">' + icon(ic[id] || 'zap') + '</span><div><small>' + esc(M[id].label) + '</small><b>' + esc(K.num(M[id].val(t))) + '</b></div></div>').join('') + '</div>';
  }

  // ------------------------------------------------------------------ the flows, by folder
  function visible() {
    const q = K.norm(S.q);
    return S.d.workflows.filter((w) => (S.show === 'all' || (S.show === 'on') === !!w.active) &&
      (!S.folder || (S.folder === NONE ? !folderName(w.folder) : w.folder === S.folder)) &&
      (!S.trig || w.trigger.type === S.trig) && (!q || K.norm(w.name).includes(q)));
  }
  function paintFlows() {
    const box = panel.querySelector('[data-flows]'); if (!box) return;
    const C = cols();
    const list = visible();
    const folders = (S.d.folders || []).filter((f) => !S.folder || S.folder === f.id);
    const loose = list.filter((w) => !folderName(w.folder));
    const groups = folders.map((f) => ({ f, items: list.filter((w) => w.folder === f.id) }));
    if ((!S.folder || S.folder === NONE) && loose.length) groups.push({ f: { id: NONE, name: 'Fără folder' }, items: loose });
    const filtering = S.q || S.show !== 'all' || S.trig;
    const minw = 320 + C.length * 116 + 84;
    box.innerHTML = '<div class="ad-scroll"><div class="ad-table" style="--ad-cols:minmax(320px,1.6fr) repeat(' + C.length + ',minmax(116px,1fr)) 84px;--ad-minw:' + minw + 'px">' +
      '<div class="ad-head-row"><span class="ad-head-name"><label class="ad-pick" title="Selectează toate cele afișate"><input type="checkbox" data-pick-all></label>Automatizare</span>' +
        C.map((id) => '<span title="' + esc(M[id].hint || '') + '">' + esc(M[id].label) + '</span>').join('') + '<span></span></div>' +
      (groups.length ? groups.map((g) => folderHtml(g.f, g.items, filtering)).join('') : K.empty('folder', 'Niciun folder', 'Fă un folder nou, apoi automatizările în el.')) +
      '</div></div>';
    syncPickAll(); paintBulk();
  }
  function folderHtml(f, items, filtering) {
    if (filtering && !items.length) return '';
    const closed = S.closed.has(f.id);
    return '<section class="au-folder' + (closed ? ' is-closed' : '') + '">' +
      '<header class="au-folder-head"><button type="button" class="au-folder-title" data-fold="' + esc(f.id) + '">' + icon(closed ? 'right' : 'down') + icon('folder') + '<b>' + esc(f.name) + '</b><span>' + items.length + '</span></button>' +
        (f.id !== NONE ? '<button type="button" class="k-btn is-ghost is-sm" data-new-in="' + esc(f.id) + '">' + icon('plus') + 'Nouă aici</button><button type="button" class="k-icon-btn" data-fmore="' + esc(f.id) + '" title="Folder">' + icon('more') + '</button>' : '') +
      '</header>' +
      (closed ? '' : '<div class="ad-list">' + (items.length ? items.map(rowHtml).join('') : '<p class="k-muted au-folder-empty">Gol. „Nouă aici” pornește o automatizare în folderul ăsta.</p>') + '</div>') +
      '</section>';
  }
  function rowHtml(w) {
    const x = statOf(w);
    return '<article class="k-card ad-camp' + (w.active ? '' : ' is-off') + (S.sel.has(w.id) ? ' is-picked' : '') + '" data-wf="' + esc(w.id) + '">' +
      '<div class="ad-row is-camp">' +
        '<div class="ad-name"><label class="ad-pick" title="Selectează"><input type="checkbox" data-pick="' + esc(w.id) + '"' + (S.sel.has(w.id) ? ' checked' : '') + '></label>' +
          '<label class="k-switch ad-sw" title="' + (w.active ? 'Pornită, apasă ca s-o oprești' : 'Oprită, apasă ca s-o pornești') + '"><input type="checkbox" data-toggle="' + esc(w.id) + '"' + (w.active ? ' checked' : '') + '><i></i></label>' +
          '<button type="button" class="ad-title" data-open="' + esc(w.id) + '" title="Deschide pe schemă"><b>' + esc(w.name) + '</b>' + (x.errors ? '<small><span class="k-tag is-bad">' + K.plural(x.errors, 'eroare', 'erori') + '</span></small>' : '') + '</button></div>' +
        cols().map((id) => { const v = M[id].val(x, w); return '<div class="ad-cell" data-l="' + esc(M[id].label) + '">' + (M[id].text ? esc(v) : '<b>' + esc(K.num(v)) + '</b>') + '</div>'; }).join('') +
        '<div class="ad-acts"><button type="button" class="k-icon-btn" data-wmore="' + esc(w.id) + '" title="Mai mult">' + icon('more') + '</button></div>' +
      '</div></article>';
  }
  function syncPickAll() {
    const all = panel.querySelector('[data-pick-all]'); if (!all) return;
    const shown = visible(); const n = shown.filter((w) => S.sel.has(w.id)).length;
    all.checked = !!shown.length && n === shown.length; all.indeterminate = n > 0 && n < shown.length;
  }
  // what to do with the ticked ones
  function paintBulk() {
    const box = panel.querySelector('[data-bulk]'); if (!box) return;
    const n = S.sel.size;
    box.innerHTML = n ? '<div class="au-bulk"><b>' + K.plural(n, 'selectată', 'selectate') + '</b>' +
      '<button type="button" class="k-btn is-sm" data-bulk="on">' + icon('zap') + 'Pornește</button><button type="button" class="k-btn is-sm" data-bulk="off">' + icon('ban') + 'Oprește</button>' +
      '<button type="button" class="k-btn is-sm" data-bulk="move">' + icon('folder') + 'Mută în folder</button><button type="button" class="k-btn is-sm is-danger" data-bulk="delete">' + icon('trash') + 'Șterge</button>' +
      '<span class="k-grow"></span><button type="button" class="k-btn is-ghost is-sm" data-sel-clear>Deselectează</button></div>' : '';
  }

  // ------------------------------------------------------------------ Istoric, with its filters
  function logFilters() {
    const runs = S.d.recent || [];
    const forms = Array.from(new Set(runs.map((r) => r.form).filter(Boolean))).sort();
    const wfs = Array.from(new Map(runs.map((r) => [r.workflowId, r.workflow])).entries()).sort((a, b) => a[1].localeCompare(b[1]));
    const h = S.h;
    return '<div class="k-card au-hfilters">' +
      '<label class="ad-search">' + icon('search') + '<input data-hq type="search" placeholder="Caută o persoană…" value="' + esc(h.q) + '"></label>' +
      '<select data-h="wf" aria-label="Automatizare">' + K.options([['', 'Toate automatizările']].concat(wfs), h.wf) + '</select>' +
      '<select data-h="folder" aria-label="Folder">' + K.options([['', 'Toate folderele']].concat((S.d.folders || []).map((f) => [f.id, f.name])), h.folder) + '</select>' +
      '<select data-h="form" aria-label="Formular">' + K.options([['', 'Toate formularele']].concat(forms.map((f) => [f, f])), h.form) + '</select>' +
      '<select data-h="status" aria-label="Stare">' + K.options([['', 'Orice stare']].concat(Object.keys(RUN).map((k) => [k, RUN[k][0]])), h.status) + '</select>' +
      '<select data-h="period" aria-label="Perioadă">' + K.options([['today', 'Azi'], ['7d', 'Ultimele 7 zile'], ['30d', 'Ultimele 30 de zile'], ['all', 'Tot']], h.period) + '</select>' +
      '</div>';
  }
  function logRows() {
    const h = S.h, q = K.norm(h.q);
    const wfFolder = new Map(S.d.workflows.map((w) => [w.id, w.folder]));
    const since = h.period === 'today' ? new Date(new Date().setHours(0, 0, 0, 0)).getTime() : h.period === '7d' ? Date.now() - 7 * 864e5 : h.period === '30d' ? Date.now() - 30 * 864e5 : 0;
    return (S.d.recent || []).filter((r) => (!h.wf || r.workflowId === h.wf) && (!h.folder || wfFolder.get(r.workflowId) === h.folder) &&
      (!h.form || r.form === h.form) && (!h.status || r.status === h.status) && (!since || Date.parse(r.updatedAt) >= since) &&
      (!q || K.norm(r.who + ' ' + r.workflow).includes(q)));
  }
  function paintLog() {
    const box = panel.querySelector('[data-log]'); if (!box) return;
    const rows = logRows();
    if (!rows.length) { box.innerHTML = K.empty('clock', (S.d.recent || []).length ? 'Nimic pentru filtrele alese' : 'Nimic încă', 'Aici vezi fiecare rulare: pentru cine, ce automatizare, ce s-a întâmplat.'); return; }
    const by = (k) => rows.filter((r) => r.status === k).length;
    box.innerHTML = '<p class="au-hsum"><b>' + rows.length + '</b> ' + (rows.length === 1 ? 'rulare' : 'rulări') + ' · ' + by('waiting') + ' programate · ' + by('done') + ' terminate · ' + by('stopped') + ' oprite' + (by('error') ? ' · <span class="au-herr">' + by('error') + ' erori</span>' : '') + '</p>' +
      '<div class="k-card au-log">' + rows.slice(0, 300).map((x) => '<div class="au-log-row"><div class="au-log-main"><b>' + esc(x.who) + '</b><span>' + esc(x.workflow) + (x.form ? ' · ' + esc(x.form) : '') + '</span>' +
        '<div class="au-log-steps">' + x.log.map((l) => '<i>' + esc(l.text) + '</i>').join('') + '</div></div>' +
        '<div class="au-log-side"><span class="k-tag is-' + (RUN[x.status] || ['', ''])[1] + '">' + esc((RUN[x.status] || [x.status])[0]) + '</span><small>' + esc(x.status === 'waiting' ? 'la ' + whenShort(x.dueAt) : whenShort(x.updatedAt)) + '</small></div></div>').join('') + '</div>' +
      (rows.length > 300 ? '<p class="k-muted">Primele 300. Restrânge filtrele ca să vezi altele.</p>' : '');
  }

  // ------------------------------------------------------------------ Șabloane WhatsApp
  // The only messages the clinic sends first on WhatsApp. Made here (or in WhatsApp Manager), approved
  // by Meta, then picked in a flow's WhatsApp step. The editor lives in portal-wa.js.
  async function paintTpl(force) {
    const box = panel.querySelector('[data-tpl]'); if (!box || !window.C360Wa) return;
    let d;
    try { d = await window.C360Wa.load(force); } catch (e) { box.innerHTML = K.empty('alert', 'Nu am putut încărca șabloanele', K.errText(e)); return; }
    const conn = Object.keys(d.numbers || {}).filter((c) => d.numbers[c].connected);
    box.innerHTML =
      '<div class="ad-bar au-bar"><button type="button" class="k-btn is-accent" data-tpl-new>' + icon('plus') + 'Șablon nou</button>' +
        (d.ready ? '<button type="button" class="k-btn is-outline" data-tpl-sync>' + icon('refresh') + 'Citește din Meta</button><span class="k-muted wa-sync">' + (d.syncedAt ? 'citit ' + esc(K.ago(d.syncedAt)) : '') + '</span>' : '') + '</div>' +
      (!d.ready ? '<div class="k-card ad-note is-warn">' + icon('info') + '<span>WhatsApp nu e conectat încă. Poți scrie șabloanele de acum (ciorne); după ce conectezi numerele în Integrări → WhatsApp le trimiți la aprobare cu un clic.</span><button type="button" class="k-btn is-sm" data-goto-int>Integrări</button></div>'
        : '<p class="k-muted wa-conn">' + icon('check') + 'Conectat: ' + conn.map((c) => esc(c) + (d.numbers[c].display ? ' (' + esc(d.numbers[c].display) + ')' : '')).join(' · ') + '</p>') +
      (d.syncError ? '<p class="wa-reason">' + icon('alert') + 'Meta: ' + esc(d.syncError) + '</p>' : '') +
      (d.templates.length ? '<div class="ad-list">' + d.templates.map((t) => '<article class="k-card ad-camp wa-row" data-tpl-id="' + esc(t.id) + '"><div class="wa-row-in">' +
          '<button type="button" class="ad-title" data-tpl-open="' + esc(t.id) + '"><b>' + esc(t.label) + '</b><small>' + (t.category === 'MARKETING' ? 'Marketing' : 'Utilitate') + (t.name ? ' · ' + esc(t.name) : '') + (t.imported ? ' · din WhatsApp Manager' : '') + '</small></button>' +
          '<div class="wa-row-status">' + window.C360Wa.cityTags(t) + (t.reason ? '<small class="wa-row-reason">' + esc(t.reason) + '</small>' : '') + '</div>' +
          '<div class="wa-row-used k-muted">' + (t.usedIn.length ? 'în ' + K.plural(t.usedIn.length, 'automatizare', 'automatizări') : 'nefolosit') + '</div>' +
          '<div class="ad-acts">' + (t.editable && d.ready ? '<button type="button" class="k-btn is-sm is-primary" data-tpl-send="' + esc(t.id) + '">' + icon('zap') + 'Trimite la aprobare</button>' : '') +
            '<button type="button" class="k-icon-btn" data-tpl-more="' + esc(t.id) + '" title="Mai mult">' + icon('more') + '</button></div>' +
        '</div></article>').join('') + '</div>'
        : K.empty('chat', 'Niciun șablon încă', 'Fă primul: confirmarea programării, reminderul, mesajul de bun venit pentru leaduri.', '<button type="button" class="k-btn is-primary" data-tpl-new>' + icon('plus') + 'Șablon nou</button>'));
  }
  const tplById = (id) => ((window.C360Wa && window.C360Wa.d && window.C360Wa.d.templates) || []).find((t) => t.id === id);
  async function tplClick(t) {
    const W2 = window.C360Wa; if (!W2) return false;
    if (t.closest('[data-tpl-new]')) { W2.edit(null, { onSaved: () => paintTpl() }); return true; }
    if (t.closest('[data-goto-int]')) { K.go('integrari'); return true; }
    const sy = t.closest('[data-tpl-sync]');
    if (sy) { await K.busy(sy, async () => { try { await W2.post({ action: 'tpl_sync' }); paintTpl(); K.ui().toast('Citit din Meta.', 'success'); } catch (err) { K.ui().toast(K.errText(err), 'error'); } }); return true; }
    const op = t.closest('[data-tpl-open]'); if (op) { const x = tplById(op.dataset.tplOpen); if (x) W2.edit(x, { onSaved: () => paintTpl() }); return true; }
    const se = t.closest('[data-tpl-send]');
    if (se) { await K.busy(se, async () => { try { const r = await W2.post({ action: 'tpl_submit', id: se.dataset.tplSend }); paintTpl(); K.ui().toast(r.submitError ? 'Parțial: ' + r.submitError : 'Trimis la Meta.', r.submitError ? 'error' : 'success'); } catch (err) { K.ui().toast(err.data && err.data.message ? err.data.message : K.errText(err), 'error'); } }); return true; }
    const mo = t.closest('[data-tpl-more]');
    if (mo) {
      const x = tplById(mo.dataset.tplMore); if (!x) return true;
      mo.dataset.wmore = x.id;
      menu(mo, [['open', 'pen', 'Editează'], ['copy', 'copy', 'Fă o copie'], ['del', 'trash', 'Șterge', true]], async (k) => {
        try {
          if (k === 'open') W2.edit(x, { onSaved: () => paintTpl() });
          if (k === 'copy') W2.edit(Object.assign({}, x, { id: '', label: x.label + ' (copie)', editable: true, status: 'DRAFT', name: '', reason: '', cities: {} }), { onSaved: () => paintTpl() });
          if (k === 'del') {
            const used = x.usedIn.length ? ' E folosit în: ' + x.usedIn.join(', ') + '; acolo pasul WhatsApp rămâne fără șablon.' : '';
            if (!(await K.ui().confirm({ title: 'Ștergi șablonul „' + x.label + '”?', message: 'Se șterge și din Meta.' + used, confirmText: 'Șterge', danger: true }))) return;
            await W2.post({ action: 'tpl_delete', id: x.id }); paintTpl(); K.ui().toast('Șters.', 'success');
          }
        } catch (err) { K.ui().toast(err.data && err.data.message ? err.data.message : K.errText(err), 'error'); }
      });
      return true;
    }
    return false;
  }

  // ------------------------------------------------------------------ menus (a flow, a folder)
  let menuEl = null;
  function closeMenu() { if (!menuEl) return; const m = menuEl; menuEl = null; m.classList.remove('is-open'); setTimeout(() => m.remove(), 180); document.removeEventListener('mousedown', outside, true); }
  const outside = (e) => { if (menuEl && !menuEl.contains(e.target) && !e.target.closest('[data-wmore],[data-fmore],[data-tpl-more]')) closeMenu(); };
  function menu(btn, items, onPick) {
    const again = menuEl && menuEl.dataset.for === (btn.dataset.wmore || btn.dataset.fmore);
    closeMenu(); if (again) return;
    const m = document.createElement('div');
    m.className = 'k-menu ad-menu'; m.dataset.for = btn.dataset.wmore || btn.dataset.fmore;
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
  const pickFolder = async (title) => {
    const opts = [['', 'Fără folder']].concat((S.d.folders || []).map((f) => [f.id, f.name]));
    return K.ui().prompt({ title, label: 'Folder', options: opts, value: (S.d.folders[0] || {}).id || '', confirmText: 'Mută' });
  };
  const fail = (err) => K.ui().toast(err.data && err.data.error === 'too_many_workflows' ? 'Poți avea cel mult 40 de automatizări.' : K.errText(err), 'error');
  async function flowMenu(btn) {
    const w = S.d.workflows.find((x) => x.id === btn.dataset.wmore); if (!w) return;
    menu(btn, [['open', 'pen', 'Editează pe schemă'], ['rename', 'type', 'Redenumește'], ['move', 'folder', 'Mută în folder'], ['dup', 'copy', 'Duplică'], ['del', 'trash', 'Șterge', true]], async (k) => {
      try {
        if (k === 'open') return openEditor(w);
        if (k === 'rename') { const n = await K.ui().prompt({ title: 'Redenumește', value: w.name, confirmText: 'Salvează' }); if (n && n.trim() && n.trim() !== w.name) { await post({ action: 'rename', id: w.id, name: n.trim() }); K.ui().toast('Redenumită.', 'success'); } }
        if (k === 'move') { const f = await pickFolder('Mută „' + w.name + '”'); if (f !== null) { await post({ action: 'many', ids: [w.id], op: 'move', folder: f }); K.ui().toast('Mutată.', 'success'); } }
        if (k === 'dup') { await post({ action: 'duplicate', id: w.id }); K.ui().toast('Copie făcută (oprită).', 'success'); }
        if (k === 'del' && await K.ui().confirm({ title: 'Ștergi „' + w.name + '”?', message: 'Rulările programate ale ei se opresc. Nu se poate anula.', confirmText: 'Șterge', danger: true })) { await post({ action: 'delete', id: w.id }); K.ui().toast('Ștearsă.', 'success'); }
      } catch (err) { fail(err); }
    });
  }
  async function folderMenu(btn) {
    const f = (S.d.folders || []).find((x) => x.id === btn.dataset.fmore); if (!f) return;
    menu(btn, [['rename', 'type', 'Redenumește folderul'], ['del', 'trash', 'Șterge folderul', true]], async (k) => {
      try {
        if (k === 'rename') { const n = await K.ui().prompt({ title: 'Redenumește folderul', value: f.name, confirmText: 'Salvează' }); if (n && n.trim()) await post({ action: 'folder', id: f.id, name: n.trim() }); }
        if (k === 'del' && await K.ui().confirm({ title: 'Ștergi folderul „' + f.name + '”?', message: 'Automatizările din el rămân, fără folder.', confirmText: 'Șterge', danger: true })) await post({ action: 'folder_delete', id: f.id });
      } catch (err) { fail(err); }
    });
  }

  // ------------------------------------------------------------------ events
  async function onClick(e) {
    const t = e.target;
    if (t.closest('[data-pane="tpl"]') && await tplClick(t)) return;
    const act = t.closest('[data-act]');
    if (act) {
      const a = act.dataset.act;
      if (a === 'reload') return load();
      if (a === 'new') return openEditor(null, S.folder && S.folder !== NONE ? S.folder : '');
      if (a === 'customize') return customize();
      if (a === 'folder-new') {
        const n = await K.ui().prompt({ title: 'Folder nou', label: 'Numele folderului', confirmText: 'Fă folderul' });
        if (n && n.trim()) { try { await post({ action: 'folder', name: n.trim() }); K.ui().toast('Folder făcut.', 'success'); } catch (err) { fail(err); } }
        return;
      }
    }
    if (t.closest('[data-sel-clear]')) { S.sel.clear(); paintStats(); return paintFlows(); }
    const sh = t.closest('[data-show]'); if (sh) { S.show = sh.dataset.show; panel.querySelectorAll('[data-show]').forEach((b) => b.classList.toggle('is-on', b === sh)); return paintFlows(); }
    const fo = t.closest('[data-fold]'); if (fo) { const id = fo.dataset.fold; if (S.closed.has(id)) S.closed.delete(id); else S.closed.add(id); return paintFlows(); }
    const ni = t.closest('[data-new-in]'); if (ni) return openEditor(null, ni.dataset.newIn);
    const wm = t.closest('[data-wmore]'); if (wm) return flowMenu(wm);
    const fm = t.closest('[data-fmore]'); if (fm) return folderMenu(fm);
    const op = t.closest('[data-open]'); if (op) return openEditor(S.d.workflows.find((w) => w.id === op.dataset.open));
    const bk = t.closest('[data-bulk]');
    if (bk) {
      const ids = Array.from(S.sel), op2 = bk.dataset.bulk;
      try {
        if (op2 === 'move') { const f = await pickFolder('Mută ' + K.plural(ids.length, 'automatizare', 'automatizări')); if (f === null) return; await post({ action: 'many', ids, op: 'move', folder: f }); }
        else if (op2 === 'delete') { if (!(await K.ui().confirm({ title: 'Ștergi ' + K.plural(ids.length, 'automatizare', 'automatizări') + '?', message: 'Rulările lor programate se opresc. Nu se poate anula.', confirmText: 'Șterge', danger: true }))) return; await post({ action: 'many', ids, op: 'delete' }); S.sel.clear(); render(); }
        else await post({ action: 'many', ids, op: op2 });
        K.ui().toast('Gata.', 'success');
      } catch (err) { fail(err); }
    }
  }
  async function onChange(e) {
    const t = e.target;
    if (t.name === 'autab') { S.tab = t.value; panel.querySelectorAll('[data-pane]').forEach((p) => { p.hidden = p.dataset.pane !== S.tab; }); if (S.tab === 'tpl') paintTpl(); return; }
    if (t.matches('[data-ffolder]')) { S.folder = t.value; return paintFlows(); }
    if (t.matches('[data-ftrig]')) { S.trig = t.value; return paintFlows(); }
    if (t.dataset.h) { S.h[t.dataset.h] = t.value; return paintLog(); }
    if (t.matches('[data-pick]')) { if (t.checked) S.sel.add(t.dataset.pick); else S.sel.delete(t.dataset.pick); t.closest('.ad-camp').classList.toggle('is-picked', t.checked); syncPickAll(); paintBulk(); return paintStats(); }
    if (t.matches('[data-pick-all]')) { visible().forEach((w) => { if (t.checked) S.sel.add(w.id); else S.sel.delete(w.id); }); paintFlows(); return paintStats(); }
    if (t.dataset.toggle) {
      const on = t.checked;
      try { await post({ action: 'toggle', id: t.dataset.toggle, active: on }); K.ui().toast(on ? 'Pornită.' : 'Oprită.', 'success'); }
      catch (err) { t.checked = !on; K.ui().toast(K.errText(err), 'error'); }
    }
  }
  function customize() {
    K.customize({
      title: 'Coloane și KPI', subtitle: 'Alegi cifrele de sus și coloanele listei, în ordinea ta. Se păstrează pe contul tău.',
      catalog: M, groups: GROUPS,
      parts: [
        { key: 'cards', label: 'Cifrele de sus', hint: 'Pentru automatizările bifate, sau pentru toate. Oricâte.', value: cards(), def: DEF_CARDS },
        { key: 'cols', label: 'Coloanele listei', hint: 'Dacă sunt multe, lista se derulează în lateral.', value: cols(), def: DEF_COLS },
      ],
      async onSave(v) { await K.prefs.set('wf.cards', v.cards); await K.prefs.set('wf.cols', v.cols); render(); },
    });
  }

  // ------------------------------------------------------------------ editor
  // The flow itself is built on a canvas, like in GoHighLevel (portal-builder.js); a new one starts in its folder.
  function openEditor(wf, folder) {
    const waNow = window.C360Wa && window.C360Wa.d;
    K.flowBuilder.open(wf, {
      meta: Object.assign({}, S.d.meta, waNow ? { waTemplates: waNow.templates } : {}), settings: S.d.settings, folder: folder || '',
      list: () => S.d.workflows,
      onSaved(d) { S.d = d; render(); },
    });
  }
  K.on('fluxuri:tpl', () => { S.tab = 'tpl'; if (S.d) render(); });
  K.on('wa', (d) => { if (S.d && S.d.meta) S.d.meta.waTemplates = d.templates; });
  K.section('fluxuri', { mount, show: load });
})();
