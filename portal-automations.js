// Centrul360 portal - Admin → Automatizări: the owner's flows in folders (Intake for the leads from the
// ads, Reminders for the appointments, any others she makes). Each flow is one row like in Reclame:
// tick, on / off, the name, the numbers she picked; a tap opens it on the canvas editor
// (portal-builder.js). Mesaje: the WhatsApp messages of the new leads and of the reminders, each with its
// state at Meta and its flow's switch. Istoric: every run, filtered by flow, folder, form, status, period.
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
    h: { wf: '', folder: '', form: '', status: '', period: 'today', q: '' } }; // the history opens on today
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
      '<div class="ad-tabs">' + K.seg('autab', [['flows', 'Automatizări', 'zap'], ['msgs', 'Mesaje', 'chat'], ['log', 'Istoric', 'clock']], S.tab, 'is-big') + '</div>' +
      '<div data-pane="flows"' + (S.tab === 'flows' ? '' : ' hidden') + '>' +
        '<div class="ad-bar au-bar"><label class="ad-search">' + icon('search') + '<input data-q type="search" placeholder="Caută o automatizare…" value="' + esc(S.q) + '"></label>' +
          '<div class="k-chips">' + [['all', 'Toate'], ['on', 'Pornite'], ['off', 'Oprite']].map(([k, l]) => '<button type="button" class="k-chip' + (S.show === k ? ' is-on' : '') + '" data-show="' + k + '">' + l + '<span>' + d.workflows.filter((w) => k === 'all' || (k === 'on') === !!w.active).length + '</span></button>').join('') + '</div>' +
          '<select data-ffolder aria-label="Folder">' + K.options([['', 'Toate folderele']].concat(folders.map((f) => [f.id, f.name]), [[NONE, 'Fără folder']]), S.folder) + '</select>' +
          '<select data-ftrig aria-label="Declanșator">' + K.options([['', 'Orice declanșator']].concat(Object.keys(TRIG).map((k) => [k, TRIG[k]])), S.trig) + '</select>' +
        '</div>' +
        '<div data-bulk></div>' +
        '<div data-flows></div>' +
      '</div>' +
      '<div data-pane="msgs"' + (S.tab === 'msgs' ? '' : ' hidden') + '><div data-msgs><div class="k-skel" style="height:220px"></div></div></div>' +
      '<div data-pane="log"' + (S.tab === 'log' ? '' : ' hidden') + '>' + logFilters() + '<div data-log></div></div>';
    paintStats(); paintFlows(); paintLog(); paintMsgs();
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

  // ------------------------------------------------------------------ Mesaje
  // Lead nou: a new lead gets a WhatsApp at once, from her city's number, about the offer she signed up for, with
  // the offer's picture. For each offer in the ads: a template (the picture as its header, sent to Meta for the
  // numbers of the offer's cities) and a flow "Lead nou · <ofertă>" in Intake that sends it. Until Meta approves
  // a template its message is skipped (and noted in Istoric); then it goes by itself. Run again when an offer is
  // added. The message is the owner's own from HighLevel (her words per offer, prices from Oferte, quick replies
  // Timișoara / Arad); when it changes, a new version goes to Meta and the offer moves to it ("Actualizează").
  // No flow sends it: the template names its offers (leadOffers) and _lib/workflows.js welcome() sends it.
  // Reamintiri: the appointment flows with the messages they send. A message opens in the template editor.
  // the site's leads: one message for all, short, morning or evening (the city they picked on the form)
  const SITE = { key: 'site', title: 'Lead de pe site', locations: ['timisoara', 'arad'], site: true };
  const SITE_TEXT = 'Bună {prenume}! 👋 Mulțumim că te-ai înscris la consultația gratuită și masajul facial cadou. Când ți-e mai ușor să vii, dimineața sau seara? ❤️';
  const SITE_BTNS = [{ type: 'QUICK_REPLY', text: 'Dimineața' }, { type: 'QUICK_REPLY', text: 'Seara' }];
  const LEAD_TPL = (o) => (o.site ? 'Lead site · dimineața sau seara' : 'Lead nou · ' + o.title);
  const LEAD_WF = (o) => 'Lead nou · ' + o.title + ' → mesaj cu oferta';
  // the owner's own message (as in HighLevel), each offer named her way, the prices from Oferte
  const leadPrices = (o) => ({ now: Math.round(Number(o.priceNew) || 0), was: Math.round(Number(o.priceOld) || 0) });
  const LEAD_PHRASE = {
    'liposonix-2zone': (p) => 'Liposonix 2 zone la ' + p.now + ' LEI, în loc de ' + p.was + ' LEI',
    'facial-restart': (p) => 'Tratament Facial RESTART la ' + p.now + ' LEI, în loc de ' + p.was + ' LEI',
    'epilare-full-body': (p) => 'Epilare Laser Full Body la ' + p.now + ' LEI, în loc de ' + p.was + ' LEI',
    'cavitatie-ems': (p) => '1+1, Cavitație + EMS cadou, ' + p.now + ' LEI redus de la ' + p.was + ' LEI',
    'cavitatie-1plus1': (p) => '1+1, Cavitație, ' + p.now + ' LEI redus de la ' + p.was + ' LEI',
    'hifu-gusa-1sedinta': (p) => 'HIFU gușă la ' + p.now + ' LEI, în loc de ' + p.was + ' LEI',
  };
  const leadPhrase = (o) => { const p = leadPrices(o); const f = LEAD_PHRASE[o.key]; return f ? f(p) : o.title + (p.now ? ' la ' + p.now + ' LEI' + (p.was > p.now ? ', în loc de ' + p.was + ' LEI' : '') : ''); };
  const leadText = (o) => o.site ? SITE_TEXT : 'Bună {prenume}! 👋 Mai avem câteva locuri disponibile săptămâna aceasta la oferta ' + leadPhrase(o) + '. 🔥\n\nCa să îți verificăm disponibilitatea, unde ți-ar fi mai ușor să ajungi? ❤️';
  const LEAD_BTNS = [{ type: 'QUICK_REPLY', text: 'Timișoara' }, { type: 'QUICK_REPLY', text: 'Arad' }];
  // the picture: the owner's dark creative of the offer (not the site's offer photo, often a before / after)
  const LEAD_PIC = (o) => (o.site ? '' : '/brand_asset/wa-offers/' + o.key + '.webp');
  const btnsOf = (o) => (o.site ? SITE_BTNS : LEAD_BTNS);
  const sameMsg = (t, o) => !!t && String(t.text || '').trim() === leadText(o).trim() && JSON.stringify((t.buttons || []).map((b) => b.text)) === JSON.stringify(btnsOf(o).map((b) => b.text)) && (t.pic || '') === LEAD_PIC(o);
  // a single-city offer goes only to the leads of that city
  const leadWhere = (o) => { const c = leadCities(o); return c.length === 1 ? c[0] : 'any'; };
  const leadCities = (o) => [...new Set((o.locations || []).map((l) => (/arad/i.test(l) ? 'Arad' : 'Timișoara')))];
  const leadOffers = () => { const all = (K.data && K.data.offers) || []; const ads = all.filter((o) => o.ads); return ads.length ? ads : all; };
  const intakeId = () => ((S.d.folders || []).find((f) => f.id === 'intake') || (S.d.folders || []).find((f) => /intake|lead/i.test(f.name)) || {}).id || '';
  // every template a flow sends, branches included, once
  const tplIds = (steps) => [...new Set((function walk(l) { return (l || []).reduce((a, s) => a.concat(s.type === 'whatsapp' && s.templateId ? [s.templateId] : [], s.type === 'if' ? walk(s.yes).concat(walk(s.no), ...(s.more || []).map((b) => walk(b.steps))) : []), []); })(steps))];
  const remindFlows = () => S.d.workflows.filter((w) => (w.folder === 'reminders' || /^appointment_/.test(w.trigger.type)) && tplIds(w.steps).length);

  // The reminders, the owner's own messages from HighLevel. Per city: the confirmation at once with the care sheet
  // of its group (Epilare · HIFU / Liposonix · Recomandări generale; not for a package session) and right after it
  // the clinic's map pin (a template has one header: the sheet is the confirmation's), 24h before and 2h before with
  // the map pin, the review 2h after a finished treatment (not for a package session).
  // "Creează reamintirile" makes the templates (a changed text or picture: a new version) and sets the steps of
  // the flows "Reamintiri · <oraș>" (their switch stays as it is; a new one starts off).
  const CARE = { epilare: '/brand_asset/wa-care/epilare-laser.webp', hifu: '/brand_asset/wa-care/hifu-liposonix.webp', gen: '/brand_asset/wa-care/recomandari-generale.webp' };
  const REM_CITY = {
    'Timișoara': { pin: 'Strada Bucegi, nr. 7, Timișoara.', near: 'Strada Bucegi, nr. 7, Timișoara (a nu se confunda cu strada din Chișoda)', review: 'https://g.page/r/CX3t4AVIOVHpEBE/review', groups: ['epilare', 'hifu', 'gen'] },
    Arad: { pin: 'Strada Ioan Alexandru, 16-18, Arad', near: 'Strada Ioan Alexandru 16-18, Arad', review: 'https://g.page/r/CV_i6zWLF5yVEBI/review', groups: ['hifu', 'gen'] },
  };
  const GROUP = { epilare: 'Epilare', hifu: 'HIFU / Liposonix', gen: 'Recomandări generale' };
  const confirmText = (g, c) => 'Bună {prenume}! 🌸 V-am confirmat programarea ' + (g === 'epilare' ? 'pentru epilare laser ' : '') + 'pe {data}, ora {ora}.\n' +
    'V-am pregătit mai sus tot ce e bine să știți înainte și după ședință ☝️\n' +
    'Dacă intervine ceva, anunțați-mă cu cel puțin 24h înainte, ca să pot oferi locul altei cliente. 💛\n' +
    '📍' + REM_CITY[c].pin + (g === 'epilare' ? '\n' : '\n\n') + 'Cu drag, Raluca - Centrul360';
  const remSpec = (c) => {
    const C = REM_CITY[c];
    const list = C.groups.map((g) => ({ key: 'confirm-' + g, label: 'Reamintiri · Confirmare · ' + GROUP[g] + ' · ' + c, category: 'UTILITY', headerType: 'IMAGE', pic: CARE[g], body: confirmText(g, c), buttons: [] }));
    // every message that speaks of the address has the pin: the confirmation's comes right after it
    list.push({ key: 'loc', label: 'Reamintiri · Locația · ' + c, category: 'UTILITY', headerType: 'LOCATION', pic: '', buttons: [],
      body: 'Ne vedem pe {data}, la ora {ora}. Aici ne găsiți 📍 ' + C.near + '\n\nPe curând! Raluca - Centrul360' });
    list.push({ key: '24h', label: 'Reamintiri · 24h înainte · ' + c, category: 'UTILITY', headerType: 'LOCATION', pic: '', buttons: [{ type: 'QUICK_REPLY', text: 'Reușesc să ajung' }],
      body: 'Bună {prenume}! 📅 Vă reamintesc cu drag programarea de mâine, {data}, ora {ora}. Reușiți să ajungeți?\nNe găsiți aici: 📍 ' + C.near + '\n\nVă aștept! Raluca - Centrul360' });
    list.push({ key: '2h', label: 'Reamintiri · 2h înainte · ' + c, category: 'UTILITY', headerType: 'LOCATION', pic: '', buttons: [],
      body: c === 'Arad'
        ? 'Dragă {prenume}, vă reamintim că întâlnirea noastră este în 2 ore.\n📍Adresa: Strada Ioan Alexandru 16-18, Arad.\nIndicații: Cum veniți de pe Blvd. Iuliu Maniu este în clădirea albă la penultima ușă de termopan. Dacă nu găsiți ne puteți contacta la +40750204243. Vă așteptăm cu drag!\nEchipa Centrul360'
        : 'Bună {prenume}! ⏰ Vă aștept peste ~2 ore, la ora {ora}. Reușiți să ajungeți?\n📍 ' + C.near + '\n\nPe curând! Raluca - Centrul360' });
    list.push({ key: 'review', label: 'Reamintiri · Recenzie · ' + c, category: 'MARKETING', headerType: '', pic: '', buttons: [],
      body: 'Bună, {prenume}! 🥰 Ne-a bucurat tare mult vizita ta la Centrul360! Dacă ți-a plăcut experiența, ne-ar ajuta enorm o recenzie sinceră pe Google. 💛 Ca mulțumire, îți oferim un masaj facial GRATUIT la următoarea vizită, un răsfăț din partea noastră 🎁\n\nLasă recenzia aici 👉 ' + C.review + ' și scrie-ne când ai făcut-o ca să-ți activăm cadoul. Abia așteptăm să te răsfățăm din nou! ❤️\nEchipa Centrul360' });
    return list;
  };
  const remSame = (t, s) => !!t && String(t.text || '').trim() === s.body.trim() && (t.headerType || '') === s.headerType && (t.pic || '') === s.pic &&
    JSON.stringify((t.buttons || []).map((b) => b.text)) === JSON.stringify(s.buttons.map((b) => b.text));
  const remFind = (tpls, s) => tpls.filter((x) => x.label === s.label || String(x.label || '').startsWith(s.label + ' · v'));
  const remFlowName = (c) => 'Reamintiri · ' + c;
  // the steps of a city's flow, from its templates (id by spec key)
  function remSteps(c, ids) {
    const wa = (k) => ({ type: 'whatsapp', templateId: ids[k], from: 'auto' });
    const hifu = { cond: 'interest', value: 'hifu|liposonix', name: 'HIFU / Liposonix', steps: [wa('confirm-hifu')] };
    const pick = REM_CITY[c].groups.includes('epilare')
      ? { type: 'if', cond: 'category', value: 'epilare-laser', name: 'Epilare', yes: [wa('confirm-epilare')], more: [hifu, { cond: 'interest', value: 'epilare', name: 'Epilare (după nume)', steps: [wa('confirm-epilare')] }], no: [wa('confirm-gen')] }
      : { type: 'if', cond: 'interest', value: 'hifu|liposonix', name: 'HIFU / Liposonix', yes: [wa('confirm-hifu')], no: [wa('confirm-gen')] };
    return [
      { type: 'if', cond: 'package', name: 'Ședință din pachet', yes: [], no: [pick, wa('loc')] },
      { type: 'wait', mode: 'before', amount: 24, unit: 'h' }, wa('24h'),
      { type: 'wait', mode: 'before', amount: 2, unit: 'h' }, wa('2h'),
      { type: 'if', cond: 'package', name: 'Ședință din pachet', yes: [], no: [{ type: 'wait', mode: 'after', amount: 2, unit: 'h' }, { type: 'if', cond: 'appt_done', name: 'Tratament finalizat', yes: [wa('review')], no: [] }] },
    ];
  }
  // what is missing or out of date (per city: templates with today's text + the flow using exactly them)
  function remState(tpls) {
    let todo = 0;
    Object.keys(REM_CITY).forEach((c) => {
      const ids = {};
      remSpec(c).forEach((s) => { const good = remFind(tpls, s).find((x) => remSame(x, s)); if (!good) todo++; else ids[s.key] = good.id; });
      const w = S.d.workflows.find((x) => x.name === remFlowName(c));
      if (!w || Object.values(ids).some((id) => !tplIds(w.steps).includes(id))) todo++;
    });
    return todo;
  }
  async function makeReminders(btn) {
    await K.busy(btn, async () => {
      try {
        let wa = await window.C360Wa.load(true);
        const errs = [];
        let made = 0;
        for (const c of Object.keys(REM_CITY)) {
          const ids = {};
          for (const s of remSpec(c)) {
            let t = remFind(wa.templates || [], s).find((x) => remSame(x, s));
            if (!t) {
              let sample;
              if (s.headerType === 'IMAGE') { try { sample = await toJpeg(s.pic); } catch (e) { errs.push(s.label + ': lipsește poza'); continue; } }
              const labels = new Set((wa.templates || []).map((x) => x.label));
              let label = s.label, v = 1;
              while (labels.has(label)) label = s.label + ' · v' + (++v);
              wa = await window.C360Wa.post({ action: 'tpl_save', submit: true, cities: [c],
                template: { label, category: s.category, headerType: s.headerType, body: s.body, footer: '', buttons: s.buttons, sample, pic: s.pic } });
              if (wa.submitError) errs.push(s.label + ': ' + wa.submitError);
              t = (wa.templates || []).find((x) => x.id === wa.savedId);
              made++;
            }
            if (t) ids[s.key] = t.id;
          }
          if (remSpec(c).some((s) => !ids[s.key])) continue; // a template missing: the flow stays as it was
          const w = S.d.workflows.find((x) => x.name === remFlowName(c));
          S.d = await K.api('/api/portal-workflows', { action: 'save', workflow: {
            id: w ? w.id : undefined, name: remFlowName(c), note: 'Confirmare cu fișa grupei și harta, 24h și 2h înainte cu harta, recenzia după tratament.',
            active: w ? !!w.active : false, folder: 'reminders', trigger: { type: 'appointment_created', location: c }, steps: remSteps(c, ids),
          } });
        }
        K.ui().toast(errs.length ? errs.join(' · ') : made ? 'Gata: ' + K.plural(made, 'mesaj trimis', 'mesaje trimise') + ' la aprobare. Reamintirile pleacă după ce Meta le aprobă și pornești fluxurile.' : 'Reamintirile sunt la zi.', errs.length ? 'error' : 'success');
      } catch (err) { fail(err); }
      render();
    });
  }
  // the offer's picture as a JPEG (Meta takes JPEG/PNG for a header), at most 1600 px wide
  async function toJpeg(url) {
    // onload, not img.decode(): decode can hang while the page is in the background
    const img = new Image();
    await new Promise((resolve, reject) => {
      img.onload = resolve;
      img.onerror = () => reject(new Error('Nu pot citi poza ofertei.'));
      img.src = url;
      if (img.complete && img.naturalWidth) resolve();
    });
    const w = Math.min(1600, img.naturalWidth), h = Math.round(img.naturalHeight * w / img.naturalWidth);
    const c = document.createElement('canvas');
    c.width = w; c.height = h;
    const g = c.getContext('2d');
    g.fillStyle = '#fff'; g.fillRect(0, 0, w, h); g.drawImage(img, 0, 0, w, h);
    let q = 0.9, out = c.toDataURL('image/jpeg', q);
    while (out.length > 3.8e6 && q > 0.5) { q -= 0.1; out = c.toDataURL('image/jpeg', q); }
    return out;
  }
  // No flow for it any more: the template names the offers whose new leads get it ("Se trimite singur la lead
  // nou", leadOffers). Per offer: every version of its message ("Lead nou · X", "… · v2" …); the one with today's
  // text, else the one that goes now, else the newest. Up to date when exactly that one goes and no old flow is left.
  const leadRows = (tpls) => leadOffers().concat([SITE]).map((o) => {
    const mine = tpls.filter((x) => x.label === LEAD_TPL(o) || String(x.label || '').startsWith(LEAD_TPL(o) + ' · v'));
    const goes = tpls.filter((x) => (x.leadOffers || []).includes(o.key));
    const w = S.d.workflows.find((x) => x.name === LEAD_WF(o)); // the old way, removed by "Actualizează"
    const good = mine.find((x) => sameMsg(x, o));
    const t = good || goes[0] || mine[mine.length - 1] || null;
    const fresh = !!(good && !w && goes.length === 1 && goes[0].id === good.id);
    return { o, t, w, mine, good, goes, fresh, on: !!(t && (t.leadOffers || []).includes(o.key)) };
  });
  const flowSwitch = (w) => '<label class="k-switch ad-sw" title="' + (w.active ? 'Pornită, apasă ca s-o oprești' : 'Oprită, apasă ca s-o pornești') + '"><input type="checkbox" data-toggle="' + esc(w.id) + '"' + (w.active ? ' checked' : '') + '><i></i></label>';
  // a template's state in the given cities only (a lead offer's cities, a reminder flow's city)
  const cityState = (t, cities) => cities.map((c) => (cities.length > 1 ? '<small class="au-msg-city">' + esc(c) + '</small>' : '') + window.C360Wa.tag((t.cities || {})[c] || 'DRAFT')).join('');
  const flowCities = (w, t) => { const l = String((w.trigger || {}).location || ''); return /arad/i.test(l) ? ['Arad'] : /timi/i.test(l) ? ['Timișoara'] : Object.keys(t.cities || {}).filter((c) => (t.cities || {})[c]); };
  const tplBtn = (t) => '<button type="button" class="k-btn is-ghost is-sm" data-tpl="' + esc(t.id) + '">' + icon('pen') + 'Mesajul</button>';
  // how each message did, from 16.10 on (/api/kpi, part=messages; all the versions of a message together): sent,
  // read, answered, booked within 7 days. The same numbers are in Panou → KPI.
  let msgStats = null, msgStatsAt = 0;
  const loadStats = () => (Date.now() - msgStatsAt < 30e3 && msgStats ? Promise.resolve(msgStats)
    : K.api('/api/kpi?period=max&part=messages').then((j) => { msgStats = new Map(((j.messages || {}).rows || []).map((x) => [x.id, x])); msgStatsAt = Date.now(); return msgStats; }).catch(() => msgStats || new Map()));
  const statHtml = (stats, ids) => {
    const rows = ids.map((id) => stats.get(id)).filter(Boolean);
    const sum = (k) => rows.reduce((n, x) => n + (x[k] || 0), 0);
    const sent = sum('sent'), base = sent - sum('failed');
    if (!sent) return '<span class="au-msg-stat is-none">încă netrimis</span>';
    const p = (k) => (base ? Math.round((sum(k) / base) * 100) + '%' : '-');
    return '<span class="au-msg-stat" title="de la 16 oct"><b>' + K.num(sent) + '</b> ' + (sent === 1 ? 'trimis' : 'trimise') + '<i></i>' + p('read') + ' citite<i></i><b>' + p('replied') + '</b> răspund<i></i>' + p('booked') + ' se programează</span>';
  };
  async function paintMsgs() {
    const box = panel.querySelector('[data-msgs]'); if (!box || S.tab !== 'msgs') return;
    let wa, stats;
    try { [wa, stats] = await Promise.all([window.C360Wa.load(), loadStats()]); } catch (e) { box.innerHTML = K.empty('alert', 'Nu am putut încărca mesajele', 'Verifică conexiunea și reîncearcă.'); return; }
    if (!box.isConnected) return;
    if (!picsChecked) {
      picsChecked = true;
      const old = leadRows(wa.templates || []).some((r) => !r.o.site && r.mine.concat(r.goes).some((x) => x.headerType === 'IMAGE' && (x.pic || '') !== LEAD_PIC(r.o)));
      if (old) { try { await fixPics(wa); return paintMsgs(); } catch (e) { /* drawn as they are */ } }
    }
    const tpls = wa.templates || [];
    const byId = new Map(tpls.map((t) => [t.id, t]));
    const rows = leadRows(tpls);
    const missing = rows.filter((r) => !r.t).length;
    const stale = rows.filter((r) => r.t && !r.fresh && (r.on || r.w || !r.good)).length;
    const numbers = Object.keys(wa.numbers || {}).some((c) => wa.numbers[c].connected);
    const reminders = remindFlows();
    const remTodo = remState(tpls);
    box.innerHTML = '<div class="au-msgs">' +
      '<section class="k-card au-msg"><header class="au-msg-h"><span class="k-icon-chip is-accent">' + icon('userPlus') + '</span><div><b>Lead nou</b><small>cu poza ofertei, de pe numărul orașului</small></div>' +
        (numbers ? '<button type="button" class="k-btn ' + (missing || stale ? 'is-primary' : 'is-ghost') + ' is-sm" data-leadmsg-go>' + icon(missing || stale ? 'plus' : 'refresh') + (missing ? (rows.length === missing ? 'Creează mesajele' : 'Creează ce lipsește') : stale ? 'Actualizează mesajele' : 'Verifică din nou') + '</button>' : '') + '</header>' +
        (numbers ? '' : '<p class="k-muted au-msg-none">Conectează numerele WhatsApp din Integrări.</p>') +
        (rows.length ? rows.map((r) => '<div class="au-msg-row">' + (r.t ? '<label class="k-switch ad-sw" title="' + (r.on ? 'Pornit, apasă ca să-l oprești' : 'Oprit, apasă ca să-l pornești') + '"><input type="checkbox" data-leadsw="' + esc(r.t.id) + '" data-key="' + esc(r.o.key) + '"' + (r.on ? ' checked' : '') + '><i></i></label>' : '<span class="au-msg-gap"></span>') +
          '<span class="au-msg-pic">' + (r.t && r.t.image ? '<img src="/api/portal-file?p=' + encodeURIComponent(r.t.image) + '" alt="" loading="lazy">' : icon(r.o.site ? 'chat' : 'image')) + '</span>' +
          '<span class="au-msg-name"><b>' + esc(r.o.title) + '</b><small>' + esc(leadCities(r.o).join(' · ')) + '</small>' + (r.t ? statHtml(stats, [...new Set(r.mine.concat(r.goes, [r.t]).map((x) => x.id))]) : '') + '</span>' +
          '<span class="au-msg-tags">' + (r.t ? cityState(r.t, leadCities(r.o)) : '<span class="k-tag">Lipsește</span>') + '</span>' +
          (r.t ? tplBtn(r.t) : '') + '</div>').join('') : '<p class="k-muted au-msg-none">Nicio ofertă bifată „Reclame”.</p>') +
      '</section>' +
      '<section class="k-card au-msg"><header class="au-msg-h"><span class="k-icon-chip is-accent">' + icon('clock') + '</span><div><b>Reamintiri</b><small>confirmare, înainte de programare, recenzie</small></div>' +
        (numbers ? '<button type="button" class="k-btn ' + (remTodo ? 'is-primary' : 'is-ghost') + ' is-sm" data-rem-go>' + icon(remTodo ? 'plus' : 'refresh') + (remTodo ? 'Creează reamintirile' : 'Verifică din nou') + '</button>' : '') + '</header>' +
        (reminders.length ? reminders.map((w) => '<div class="au-msg-flow"><div class="au-msg-fhead">' + flowSwitch(w) +
            '<button type="button" class="au-msg-fname" data-open="' + esc(w.id) + '" title="Deschide pe schemă"><b>' + esc(w.name) + '</b>' + icon('right') + '</button></div>' +
            tplIds(w.steps).map((id) => { const t = byId.get(id); return '<div class="au-msg-row is-sub"><span class="au-msg-name"><b>' + esc(t ? t.label : 'Șablon șters') + '</b>' + (t ? statHtml(stats, [id]) : '') + '</span>' +
              '<span class="au-msg-tags">' + (t ? (flowCities(w, t).length ? cityState(t, flowCities(w, t)) : window.C360Wa.tag(t.status)) : '<span class="k-tag is-bad">Alege alt șablon pe schemă</span>') + '</span>' + (t ? tplBtn(t) : '') + '</div>'; }).join('') +
          '</div>').join('') : '<p class="k-muted au-msg-none">Nicio reamintire încă.</p>') +
      '</section></div>';
  }
  // The offer's dark creative on every version of its message (the picture goes with each message; Meta approved only
  // the text, so it changes at once, no new version). Returns the templates as they are after.
  async function fixPics(wa) {
    for (const r of leadRows(wa.templates || [])) {
      if (r.o.site) continue;
      const list = [...new Map(r.mine.concat(r.goes, r.t ? [r.t] : []).map((x) => [x.id, x])).values()].filter((x) => x.headerType === 'IMAGE' && (x.pic || '') !== LEAD_PIC(r.o));
      if (!list.length) continue;
      let sample;
      try { sample = await toJpeg(LEAD_PIC(r.o)); } catch (e) { continue; }
      for (const x of list) wa = await window.C360Wa.post({ action: 'tpl_set_pic', id: x.id, sample, pic: LEAD_PIC(r.o) });
    }
    return wa;
  }
  let picsChecked = false;
  async function makeLeadMsgs(btn) {
    await K.busy(btn, async () => {
      try {
        let wa = await fixPics(await window.C360Wa.load(true));
        let made = 0;
        const errs = [];
        for (const r of leadRows(wa.templates || [])) {
          let t = r.good;
          if (!t) {
            // a template sent to Meta can't change its text: a new version, the flow moves to it
            let sample;
            if (!r.o.site) { try { sample = await toJpeg(LEAD_PIC(r.o)); } catch (e) { errs.push(r.o.title + ': lipsește poza ofertei pentru WhatsApp'); continue; } }
            const labels = new Set((wa.templates || []).map((x) => x.label));
            let label = LEAD_TPL(r.o), v = 1;
            while (labels.has(label)) label = LEAD_TPL(r.o) + ' · v' + (++v);
            wa = await window.C360Wa.post({ action: 'tpl_save', submit: true, cities: leadCities(r.o),
              template: { label, category: r.o.site ? 'UTILITY' : 'MARKETING', headerType: r.o.site ? '' : 'IMAGE', body: leadText(r.o), footer: '', buttons: btnsOf(r.o), sample, leadOffers: [], pic: LEAD_PIC(r.o) } });
            if (wa.submitError) errs.push(r.o.title + ': ' + wa.submitError);
            t = (wa.templates || []).find((x) => x.id === wa.savedId);
            made++;
          }
          if (!t) continue;
          // this one goes for the offer (it stays off if it was switched off), no other version, no old flow
          const keep = r.w ? (!!r.w.active || r.on) : (r.t ? r.on : true);
          for (const x of (wa.templates || []).filter((y) => y.id !== t.id && (y.leadOffers || []).includes(r.o.key))) {
            wa = await window.C360Wa.post({ action: 'tpl_lead', id: x.id, leadOffers: x.leadOffers.filter((k) => k !== r.o.key) });
          }
          const cur = new Set(((wa.templates || []).find((y) => y.id === t.id) || t).leadOffers || []);
          if (keep) cur.add(r.o.key); else cur.delete(r.o.key);
          wa = await window.C360Wa.post({ action: 'tpl_lead', id: t.id, leadOffers: [...cur] });
          if (r.w) S.d = await K.api('/api/portal-workflows', { action: 'delete', id: r.w.id });
        }
        K.ui().toast(errs.length ? errs.join(' · ') : made ? 'Gata: ' + K.plural(made, 'mesaj trimis', 'mesaje trimise') + ' la aprobare. Pornesc singure când Meta le aprobă.' : 'Toate ofertele au mesajul lor.', errs.length ? 'error' : 'success');
      } catch (err) { fail(err); }
      render();
    });
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

  // ------------------------------------------------------------------ menus (a flow, a folder)
  let menuEl = null;
  function closeMenu() { if (!menuEl) return; const m = menuEl; menuEl = null; m.classList.remove('is-open'); setTimeout(() => m.remove(), 180); document.removeEventListener('mousedown', outside, true); }
  const outside = (e) => { if (menuEl && !menuEl.contains(e.target) && !e.target.closest('[data-wmore],[data-fmore]')) closeMenu(); };
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
    const lg = t.closest('[data-leadmsg-go]'); if (lg) return makeLeadMsgs(lg);
    const rg = t.closest('[data-rem-go]'); if (rg) return makeReminders(rg);
    const tp = t.closest('[data-tpl]');
    if (tp) { const tpl = ((window.C360Wa.d || {}).templates || []).find((x) => x.id === tp.dataset.tpl); if (tpl) window.C360Wa.edit(tpl, { onSaved: () => paintMsgs() }); return; }
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
    if (t.name === 'autab') { S.tab = t.value; panel.querySelectorAll('[data-pane]').forEach((p) => { p.hidden = p.dataset.pane !== S.tab; }); return paintMsgs(); }
    if (t.matches('[data-ffolder]')) { S.folder = t.value; return paintFlows(); }
    if (t.matches('[data-ftrig]')) { S.trig = t.value; return paintFlows(); }
    if (t.dataset.h) { S.h[t.dataset.h] = t.value; return paintLog(); }
    if (t.matches('[data-pick]')) { if (t.checked) S.sel.add(t.dataset.pick); else S.sel.delete(t.dataset.pick); t.closest('.ad-camp').classList.toggle('is-picked', t.checked); syncPickAll(); paintBulk(); return paintStats(); }
    if (t.matches('[data-pick-all]')) { visible().forEach((w) => { if (t.checked) S.sel.add(w.id); else S.sel.delete(w.id); }); paintFlows(); return paintStats(); }
    if (t.dataset.leadsw) {
      const on = t.checked, key = t.dataset.key;
      const tpl = ((window.C360Wa.d || {}).templates || []).find((x) => x.id === t.dataset.leadsw);
      if (!tpl) return;
      const s = new Set(tpl.leadOffers || []); if (on) s.add(key); else s.delete(key);
      try { await window.C360Wa.post({ action: 'tpl_lead', id: tpl.id, leadOffers: [...s] }); K.ui().toast(on ? 'Pornit: leadurile noi îl primesc.' : 'Oprit.', 'success'); paintMsgs(); }
      catch (err) { t.checked = !on; K.ui().toast(K.errText(err), 'error'); }
      return;
    }
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
  K.on('wa', (d) => { if (S.d && S.d.meta) S.d.meta.waTemplates = d.templates; if (S.d && panel && K.isActive('fluxuri')) paintMsgs(); });
  K.section('fluxuri', { mount, show: load });
  K.on('remote', async () => {
    if (!S.d || !K.isActive('fluxuri') || S.loading || document.querySelector('.fb-root.is-open')) return;
    try {
      const d = await K.api('/api/portal-workflows');
      if (JSON.stringify(d) === JSON.stringify(S.d)) return; // nothing new: no redraw
      S.d = d; render();
    } catch (e) { /* the next pulse tries again */ }
  });
})();
