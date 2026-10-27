// Centrul360 portal - the visual editor of one automation (Admin → Automatizări), built like
// GoHighLevel's: the trigger on top, the steps under it on a canvas, a "+" between any two steps,
// drag a step to move it (on a phone: hold it a moment, then drag), "Dacă / Altfel" splits the flow
// into a Da and a Nu branch. A click on a step opens its settings on the right. The flow is saved
// through /api/portal-workflows (action save); the engine is api/_lib/workflows.js.
(function () {
  'use strict';
  const K = window.K;
  const { esc, icon } = K;

  const TRIG = {
    lead_created: { ic: 'userPlus', label: 'Lead nou' },
    stage_changed: { ic: 'layers', label: 'Lead mutat în etapă' },
    lead_idle: { ic: 'clock', label: 'Lead necontactat' },
    appointment_created: { ic: 'calendar', label: 'Programare nouă' },
    appointment_before: { ic: 'bell', label: 'Înainte de programare' },
    appointment_status: { ic: 'refresh', label: 'Status programare' },
    appointment_after: { ic: 'sparkles', label: 'După tratament' },
  };
  const STEP = {
    whatsapp: { ic: 'chat', label: 'WhatsApp către client', short: 'WhatsApp', tone: 'good', group: 'Mesaje' },
    notify: { ic: 'bell', label: 'Anunță echipa', short: 'Anunță echipa', tone: 'accent', group: 'Mesaje' },
    task: { ic: 'listCheck', label: 'Sarcină pentru recepție', short: 'Sarcină', tone: 'info', group: 'Echipă și Pipeline', hidden: true },
    move_stage: { ic: 'layers', label: 'Mută leadul în etapă', short: 'Mută leadul', tone: 'info', group: 'Echipă și Pipeline', lead: true },
    wait: { ic: 'clock', label: 'Așteaptă', short: 'Așteaptă', tone: '', group: 'Logică' },
    if: { ic: 'filter', label: 'Dacă / Altfel', short: 'Dacă / Altfel', tone: 'warn', group: 'Logică' },
    stop_if: { ic: 'ban', label: 'Oprește dacă', short: 'Oprește dacă', tone: 'bad', group: 'Logică' },
  };
  const COND = {
    interest: { label: 'Procedura este', value: 'offer' },
    location: { label: 'Orașul este', value: 'city' },
    source: { label: 'Sursa este', value: 'source', lead: true },
    contacted: { label: 'Leadul a fost contactat', lead: true },
    booked: { label: 'Leadul are programare', lead: true },
    future_appt: { label: 'Are deja o programare viitoare' },
    appt_confirmed: { label: 'Programarea e confirmată', appt: true },
    appt_inactive: { label: 'Programarea e anulată / finalizată', appt: true },
    category: { label: 'Categoria procedurii este', value: 'cat', appt: true },
    package: { label: 'E ședință din pachet', appt: true },
    appt_done: { label: 'Tratamentul e finalizat', appt: true },
    appt_cancelled: { label: 'Programarea e anulată', appt: true },
  };
  const CATS = { corporale: 'Corporale', faciale: 'Faciale', 'epilare-laser': 'Epilare laser' };
  const WAIT = { for: 'O perioadă', before: 'Până la … înainte de programare', after: '… după programare' };
  const MAX_BRANCHES = 6;
  const STATUS = { programata: 'Programată', confirmata: 'Confirmată', anulata: 'Anulată', reprogramata: 'Reprogramată', finalizata: 'Finalizată' };
  const SOURCE = { any: 'Orice sursă', facebook: 'Reclamă Facebook', instagram: 'Instagram', site: 'Site', telefon: 'Telefon', recomandare: 'Recomandare', 'walk-in': 'Venită în clinică', manual: 'Adăugat manual' };
  const ROLE = { admin: 'Admin', receptie: 'Recepție', cosmetician: 'Cosmeticiene' };
  const UNIT = { min: 'minute', h: 'ore', d: 'zile' };
  const VARS = [['prenume', 'Prenume'], ['nume', 'Nume complet'], ['telefon', 'Telefon'], ['procedura', 'Procedura (din formular)'], ['locatie', 'Orașul'], ['adresa', 'Adresa'], ['zi', 'Zi (azi / mâine / joi)'], ['data', 'Data'], ['ora', 'Ora'], ['tratament', 'Tratament'], ['link_recenzie', 'Link recenzie']];
  const ERR = { missing_name: 'Dă-i un nume automatizării.', invalid_trigger: 'Alege declanșatorul complet.', missing_steps: 'Adaugă cel puțin un pas.',
    invalid_step: 'Un pas nu e complet (e marcat cu galben).', step_needs_lead: 'Un pas sau o condiție merge doar la automatizări pornite de un lead.',
    step_needs_appointment: 'Un pas sau o condiție merge doar la automatizări pornite de o programare.', too_many_steps: 'Maxim 40 de pași într-o automatizare.',
    too_deep: 'Maxim 3 „Dacă / Altfel” unul în altul.', too_many_workflows: 'Ai atins limita de 40 de automatizări.' };
  const MAX_DEPTH = 3;
  const ZOOM_KEY = 'c360_fb_zoom';

  let B = null; // the open builder

  const uid = () => 's' + Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);
  const clone = (v) => JSON.parse(JSON.stringify(v));
  const isLead = () => !B.W.trigger.type.startsWith('appointment');
  function ensureIds(list) {
    (list || []).forEach((s) => {
      if (!s.id) s.id = uid();
      if (s.type === 'if') { s.yes = s.yes || []; s.no = s.no || []; ensureIds(s.yes); ensureIds(s.no); (s.more || []).forEach((b) => { if (!b.id) b.id = uid(); b.steps = b.steps || []; ensureIds(b.steps); }); }
    });
    return list;
  }
  // every list inside an "if": Da, the selector's other branches, Nu / Altfel
  const lists = (s) => [s.yes, s.no].concat((s.more || []).map((b) => b.steps));

  // ------------------------------------------------------------------ tree helpers
  // where a step lives: its list, its index, and the path of that list ('' = main line, 'id.yes' …)
  function locate(id, list, path) {
    list = list || B.W.steps; path = path || '';
    for (let i = 0; i < list.length; i++) {
      const s = list[i];
      if (s.id === id) return { list, i, s, path };
      if (s.type === 'if') {
        const r = locate(id, s.yes, s.id + '.yes') || locate(id, s.no, s.id + '.no') || (s.more || []).reduce((f, b) => f || locate(id, b.steps, s.id + '.' + b.id), null);
        if (r) return r;
      }
    }
    return null;
  }
  function listAt(path) {
    if (!path) return B.W.steps;
    const [id, br] = path.split('.');
    const r = locate(id);
    if (!r) return null;
    if (br === 'yes' || br === 'no') return r.s[br];
    const b = (r.s.more || []).find((x) => x.id === br);
    return b ? b.steps : null;
  }
  // how many "if"s a list sits inside
  function depthOf(path) {
    if (!path) return 0;
    const r = locate(path.split('.')[0]);
    return r ? 1 + depthOf(r.path) : 0;
  }
  const ifDepth = (s) => (s.type === 'if' ? 1 + Math.max(0, ...[].concat(...lists(s)).map(ifDepth)) : 0);
  const count = (list) => list.reduce((n, s) => n + 1 + (s.type === 'if' ? lists(s).reduce((m, l) => m + count(l), 0) : 0), 0);
  const inside = (path, s) => s.type === 'if' && path && (path.startsWith(s.id + '.') || [].concat(...lists(s)).some((x) => inside(path, x)));

  // ------------------------------------------------------------------ texts
  const offerOpts = () => (B.meta.offers || []);
  function trigText(t) {
    if (t.type === 'lead_created') {
      const bits = [t.interest && t.interest !== 'any' ? t.interest : '', t.source && t.source !== 'any' ? (SOURCE[t.source] || t.source).toLowerCase() : '', t.location && t.location !== 'any' ? t.location : ''].filter(Boolean);
      return 'Lead nou' + (bits.length ? ': ' + bits.join(' · ') : '');
    }
    if (t.type === 'stage_changed') return 'Lead mutat în „' + ((B.meta.stages.find((s) => s.id === t.stage) || {}).name || 'alege etapa') + '”';
    if (t.type === 'lead_idle') return 'Lead nesunat ' + (t.hours || 2) + 'h';
    if (t.type === 'appointment_before') { const h = t.hours || 24; return 'Cu ' + (h % 24 === 0 ? (h / 24 === 1 ? 'o zi' : h / 24 + ' zile') : h + 'h') + ' înainte de programare'; }
    if (t.type === 'appointment_after') { const d = t.days == null ? 1 : t.days; return d === 0 ? 'În ziua tratamentului' : 'La ' + (d === 1 ? 'o zi' : d + ' zile') + ' după tratament'; }
    if (t.type === 'appointment_status') return 'Programare devenită „' + (STATUS[t.status] || 'alege statusul') + '”';
    return (TRIG[t.type] || {}).label || t.type;
  }
  const condText = (s) => (COND[s.cond] || { label: s.cond }).label + (COND[s.cond] && COND[s.cond].value ? ' ' + ((COND[s.cond].value === 'cat' ? CATS[s.value] : s.value) || '…') : '');
  const waitSum = (s) => (s.mode === 'before' ? (s.amount || 0) + ' ' + UNIT[s.unit || 'h'] + ' înainte de programare' : s.mode === 'after' ? (s.amount || 0) + ' ' + UNIT[s.unit || 'h'] + ' după programare' : (s.amount || 1) + ' ' + UNIT[s.unit || 'h']);
  const branchName = (b) => b.name || condText(b);
  const toText = (to) => (to || []).map((x) => (x.startsWith('role:') ? ROLE[x.slice(5)] : ((B.meta.team || []).find((p) => 'emp:' + p.id === x) || { name: '?' }).name)).join(', ');
  // the WhatsApp templates and numbers (from /api/portal-workflows, refreshed after a new template)
  const tplOf = (id) => (B.meta.waTemplates || []).find((t) => t.id === id) || null;
  const WA_STATUS = { DRAFT: 'ciornă', PENDING: 'în verificare', APPROVED: 'aprobat', REJECTED: 'respins', PAUSED: 'pe pauză', DISABLED: 'dezactivat', DELETED: 'șters din Meta' };
  function waFields(s, label) {
    const nums = B.meta.waNumbers || [{ city: 'Timișoara' }, { city: 'Arad' }];
    const tpls = B.meta.waTemplates || [];
    const tpl = tplOf(s.templateId);
    const city = s.from && s.from !== 'auto' ? s.from : '';
    return K.field(label || 'De pe numărul', '<select data-f="from">' + K.options([['auto', 'Automat, după orașul clientei']].concat(nums.map((n) => [n.city, n.city + (n.display ? ' · ' + n.display : n.connected === false ? ' (neconectat încă)' : '')])), s.from || 'auto') + '</select>', 'full') +
      K.field('Șablonul', '<div class="fb-tpl-row"><select data-f="templateId">' + K.options([['', tpls.length ? 'Alege șablonul…' : 'Niciun șablon încă']].concat(tpls.map((t) => [t.id, t.label + ' · ' + (WA_STATUS[t.status] || t.status)])), s.templateId || '') + '</select>' +
        '<button type="button" class="k-btn is-outline is-sm" data-tpl-new>' + icon('plus') + 'Șablon nou</button></div>', 'full') +
      (tpl ? '<div class="au-preview"><span>' + icon('eye') + 'Așa îl primește</span>' + (window.C360Wa ? window.C360Wa.bubble(tpl, sample(city)) : '<div class="au-bubble">' + renderMsg(tpl.text, sample(city)) + '</div>') + '</div>' +
        (tpl.status !== 'APPROVED' ? '<p class="fb-hint is-warn">' + icon('alert') + (tpl.status === 'DRAFT' ? (nums.some((n) => n.connected) ? 'E ciornă: deschide-l mai jos și apasă „Salvează și trimite la aprobare”.' : 'E ciornă: îl trimiți la aprobare după ce conectezi numerele (Integrări → WhatsApp).') + ' Până e aprobat, mesajul nu pleacă.' : 'Meta: ' + (WA_STATUS[tpl.status] || tpl.status) + '. Până e aprobat, mesajul nu pleacă.') + '</p>' : '') +
        '<button type="button" class="k-btn is-ghost is-sm" data-tpl-edit="' + esc(tpl.id) + '">' + icon('pen') + 'Vezi / editează șablonul</button>'
        : '<p class="fb-hint">' + icon('info') + 'Pe WhatsApp scriem primii doar cu șabloane aprobate de Meta. Alege unul sau fă unul nou.</p>');
  }
  function summary(s) {
    if (s.type === 'wait') return waitSum(s);
    if (s.type === 'if' && s.more && s.more.length) return 'Selector: ' + [branchName(s)].concat(s.more.map(branchName)).join(' · ');
    if (s.type === 'if' || s.type === 'stop_if') return condText(s);
    if (s.type === 'move_stage') return '→ ' + ((B.meta.stages.find((x) => x.id === s.stage) || {}).name || 'alege etapa');
    if (s.type === 'notify') return s.to && s.to.length ? 'Către ' + toText(s.to) : 'Alege cui';
    if (s.type === 'whatsapp') { const tp = tplOf(s.templateId); return tp ? tp.label + (s.from && s.from !== 'auto' ? ' · ' + s.from : '') : 'Alege șablonul'; }
    const t = String(s.text || '').replace(/\s+/g, ' ').trim();
    return t ? (t.length > 60 ? t.slice(0, 60) + '…' : t) : 'Scrie mesajul';
  }
  // what keeps a step from saving (shown on the card in yellow)
  function problem(s) {
    if (s.type === 'whatsapp' && !s.templateId) return 'alege șablonul';
    if (s.type === 'notify' && s.whatsapp && !s.templateId) return 'alege șablonul';
    if (s.type === 'task' && !String(s.text || '').trim()) return 'gol';
    if (s.type === 'move_stage' && !s.stage) return 'alege etapa';
    if (s.type === 'notify' && (!s.to || !s.to.length)) return 'alege cui';
    if (s.type === 'notify' && !String(s.title || '').trim()) return 'fără titlu';
    if ((s.type === 'if' || s.type === 'stop_if') && COND[s.cond] && COND[s.cond].value && !s.value) return 'alege valoarea';
    if (s.type === 'if' && (s.more || []).some((b) => COND[b.cond] && COND[b.cond].value && !b.value)) return 'alege valoarea';
    if (s.type === 'if' && isLead() && (s.more || []).some((b) => COND[b.cond] && COND[b.cond].appt)) return 'doar la programări';
    if (s.type === 'wait' && s.mode && s.mode !== 'for' && isLead()) return 'doar la programări';
    if ((s.type === 'move_stage' || (COND[s.cond] && COND[s.cond].lead && (s.type === 'if' || s.type === 'stop_if'))) && !isLead()) return 'doar la leaduri';
    if ((s.type === 'if' || s.type === 'stop_if') && COND[s.cond] && COND[s.cond].appt && isLead()) return 'doar la programări';
    return '';
  }
  // a sample client for the previews, in the chosen number's city, else the trigger's, else Timișoara
  function sample(city) {
    const appt = !isLead(), st = B.settings;
    const tl = B.W.trigger.location;
    const loc = city || (tl && tl !== 'any' ? tl : 'Timișoara');
    return { prenume: 'Andreea', nume: 'Andreea Popescu', telefon: '0722 123 456', zi: 'mâine', data: '14.10.2026', ora: '11:00', tratament: appt ? 'Facial Restart' : (offerOpts()[0] || 'LipoSonix'),
      procedura: appt ? 'Facial Restart' : (B.W.trigger.interest && B.W.trigger.interest !== 'any' ? B.W.trigger.interest : (offerOpts()[0] || 'LipoSonix')), interes: offerOpts()[0] || 'LipoSonix',
      locatie: loc, adresa: (st.addresses || {})[loc] || loc, link_recenzie: st.reviewLink || 'https://g.page/r/…' };
  }
  const renderMsg = (text, v) => esc(String(text || '')).replace(/\{(\w+)\}/g, (m, k) => (k in v ? '<mark>' + esc(v[k]) + '</mark>' : '<mark class="is-bad">' + m + '</mark>'));

  // ------------------------------------------------------------------ canvas
  const slot = (path, i) => '<div class="fb-slot" data-slot="' + esc(path) + '|' + i + '"><button type="button" class="fb-add" data-add="' + esc(path) + '|' + i + '" aria-label="Adaugă un pas aici">' + icon('plus') + '</button></div>';
  function nodeHtml(s) {
    const st = STEP[s.type] || { ic: 'zap', short: s.type, tone: '' };
    const bad = problem(s);
    return '<div class="fb-node is-' + s.type + (B.sel === s.id ? ' is-sel' : '') + (bad ? ' is-bad' : '') + '" data-node="' + esc(s.id) + '" tabindex="0">' +
      '<span class="fb-ic k-icon-chip is-' + st.tone + '">' + icon(st.ic) + '</span>' +
      '<span class="fb-txt"><small>' + esc(st.short) + (bad ? ' · <em>' + esc(bad) + '</em>' : '') + '</small><b>' + esc(summary(s)) + '</b></span>' +
      '<button type="button" class="fb-x" data-rm="' + esc(s.id) + '" title="Șterge pasul" aria-label="Șterge pasul">' + icon('trash') + '</button></div>';
  }
  function listHtml(list, path) {
    let h = slot(path, 0);
    list.forEach((s, i) => {
      const multi = s.type === 'if' && s.more && s.more.length;
      const col = (cls, ic, tag, list, p) => '<div class="fb-branch ' + cls + '"><i class="fb-vl"></i><span class="fb-tag">' + icon(ic) + esc(tag) + '</span>' + listHtml(list, p) + '<i class="fb-fill"></i></div>';
      h += s.type === 'if'
        ? '<div class="fb-if">' + nodeHtml(s) + '<i class="fb-vl"></i><div class="fb-branches">' +
            (multi
              ? col('is-pick', 'filter', branchName(s), s.yes, s.id + '.yes') + s.more.map((b) => col('is-pick', 'filter', branchName(b), b.steps, s.id + '.' + b.id)).join('') + col('is-no', 'x', 'Altfel', s.no, s.id + '.no')
              : col('is-yes', 'check', 'Da', s.yes, s.id + '.yes') + col('is-no', 'x', 'Nu', s.no, s.id + '.no')) +
          '</div></div>'
        : nodeHtml(s);
      h += slot(path, i + 1);
    });
    return h;
  }
  function flowHtml() {
    const ti = TRIG[B.W.trigger.type] || { ic: 'zap' };
    return '<div class="fb-flow">' +
      '<div class="fb-node is-trigger' + (B.sel === 'trigger' ? ' is-sel' : '') + '" data-node="trigger" tabindex="0"><span class="fb-ic k-icon-chip is-accent">' + icon(ti.ic) + '</span>' +
        '<span class="fb-txt"><small>Declanșator</small><b>' + esc(trigText(B.W.trigger)) + '</b></span></div>' +
      listHtml(B.W.steps, '') +
      '<div class="fb-end">' + icon('checkCircle') + 'Sfârșit</div></div>';
  }
  function paint() {
    const host = B.root.querySelector('[data-flow]');
    host.innerHTML = flowHtml();
    B.root.querySelector('[data-count]').textContent = count(B.W.steps) + ' / ' + (B.meta.maxSteps || 40) + ' pași';
  }
  function setZoom(z) {
    B.zoom = Math.min(1.5, Math.max(0.4, Math.round(z * 10) / 10));
    B.root.querySelector('[data-flow]').style.zoom = B.zoom;
    B.root.querySelector('[data-zoom-v]').textContent = Math.round(B.zoom * 100) + '%';
    try { localStorage.setItem(ZOOM_KEY, String(B.zoom)); } catch (e) { /* private mode */ }
  }
  function fit() {
    const cv = B.root.querySelector('[data-canvas]'), flow = B.root.querySelector('.fb-flow');
    if (!flow) return;
    const w = flow.scrollWidth, h = flow.scrollHeight;
    setZoom(Math.min(1, (cv.clientWidth - 24) / w, Math.max(0.6, (cv.clientHeight - 24) / h)));
    cv.scrollLeft = (cv.scrollWidth - cv.clientWidth) / 2;
    cv.scrollTop = 0;
  }
  function changed() {
    B.dirty = true;
    B.root.querySelector('[data-dirty]').hidden = false;
  }

  // ------------------------------------------------------------------ settings panel
  const chips = '<div class="au-vars-chips">' + VARS.map(([k, l]) => '<button type="button" data-var="{' + k + '}" title="' + esc(l) + '">{' + k + '}</button>').join('') + '</div>';
  function condFields(s) {
    const conds = Object.keys(COND).filter((c) => (isLead() ? !COND[c].appt : !COND[c].lead));
    const c = COND[s.cond] || {};
    let val = '';
    if (c.value === 'offer') val = '<select data-f="value">' + K.options([['', 'Alege procedura…']].concat(offerOpts().map((o) => [o, o])), s.value || '') + '</select>';
    if (c.value === 'city') val = '<select data-f="value">' + K.options([['', 'Alege orașul…'], ['Timișoara', 'Timișoara'], ['Arad', 'Arad']], s.value || '') + '</select>';
    if (c.value === 'cat') val = '<select data-f="value">' + K.options([['', 'Alege categoria…']].concat(Object.keys(CATS).map((k) => [k, CATS[k]])), s.value || '') + '</select>';
    if (c.value === 'source') val = '<select data-f="value">' + K.options([['', 'Alege sursa…']].concat(Object.keys(SOURCE).filter((x) => x !== 'any').map((x) => [x, SOURCE[x]])), s.value || '') + '</select>';
    return K.field('Condiția', '<select data-f="cond">' + K.options(conds.map((k) => [k, COND[k].label]), s.cond) + '</select>', 'full') + (val ? K.field('Valoarea', val, 'full') : '');
  }
  // a selector branch's condition (same choices as the first one), bound by data-bf / data-br
  function branchCond(b) {
    const conds = Object.keys(COND).filter((c) => (isLead() ? !COND[c].appt : !COND[c].lead));
    const c = COND[b.cond] || {};
    let val = '';
    const sel = (opts) => '<select data-bf="value" data-br="' + esc(b.id) + '">' + K.options(opts, b.value || '') + '</select>';
    if (c.value === 'cat') val = sel([['', 'Alege categoria…']].concat(Object.keys(CATS).map((k) => [k, CATS[k]])));
    if (c.value === 'offer') val = sel([['', 'Alege procedura…']].concat(offerOpts().map((o) => [o, o])));
    if (c.value === 'city') val = sel([['', 'Alege orașul…'], ['Timișoara', 'Timișoara'], ['Arad', 'Arad']]);
    if (c.value === 'source') val = sel([['', 'Alege sursa…']].concat(Object.keys(SOURCE).filter((x) => x !== 'any').map((x) => [x, SOURCE[x]])));
    return K.field('Condiția', '<select data-bf="cond" data-br="' + esc(b.id) + '">' + K.options(conds.map((k) => [k, COND[k].label]), b.cond) + '</select>', 'full') + (val ? K.field('Valoarea', val, 'full') : '');
  }
  function panelHtml() {
    if (B.sel === 'trigger') return trigPanel();
    const r = locate(B.sel);
    if (!r) return '';
    const s = r.s, st = STEP[s.type];
    const v = sample();
    let body = '';
    if (s.type === 'wait') {
      const mode = s.mode || 'for';
      body = (isLead() ? '' : K.field('Cum', '<select data-f="mode">' + K.options(Object.keys(WAIT).map((m) => [m, WAIT[m]]), mode) + '</select>', 'full')) +
        K.field(mode === 'before' ? 'Cu cât înainte de ora programării' : mode === 'after' ? 'Cât după ce se termină programarea' : 'Cât așteaptă',
          '<div class="au-inline"><input type="number" min="' + (mode === 'for' ? 1 : 0) + '" max="999" data-f="amount" value="' + esc(s.amount == null ? 1 : s.amount) + '"><select data-f="unit">' + K.options(Object.keys(UNIT).map((u) => [u, UNIT[u]]), s.unit || 'h') + '</select></div>', 'full',
          mode === 'before' ? 'Dacă programarea se mută, se mută și mesajul. Dacă ora a trecut deja (programare făcută mai târziu), mesajul de după e sărit.' : mode === 'after' ? 'Se socotește de la ora de final a programării. Dacă se mută, se mută și mesajul.' : 'Apoi merge la pasul următor.');
    }
    if (s.type === 'whatsapp') body = waFields(s);
    if (s.type === 'task') body = K.field('Ce face recepția', '<textarea rows="3" data-f="text" maxlength="300" placeholder="ex. Sună-l pe {nume} ({telefon}) pentru {procedura}">' + esc(s.text || '') + '</textarea>', 'full') + chips;
    if (s.type === 'move_stage') body = K.field('Etapa', '<select data-f="stage">' + K.options([['', 'Alege etapa…']].concat(B.meta.stages.map((x) => [x.id, x.name])), s.stage || '') + '</select>', 'full');
    if (s.type === 'if') {
      const more = s.more || [];
      body = more.length
        ? '<div class="fb-br"><div class="fb-br-head"><b>Ramura 1</b></div>' + K.field('Numele ramurii', '<input data-f="name" maxlength="40" value="' + esc(s.name || '') + '" placeholder="' + esc(condText(s)) + '">', 'full') + condFields(s) + '</div>' +
          more.map((b, i) => '<div class="fb-br"><div class="fb-br-head"><b>Ramura ' + (i + 2) + '</b><button type="button" class="k-icon-btn" data-br-rm="' + esc(b.id) + '" aria-label="Scoate ramura">' + icon('trash') + '</button></div>' +
            K.field('Numele ramurii', '<input data-bf="name" data-br="' + esc(b.id) + '" maxlength="40" value="' + esc(b.name || '') + '" placeholder="' + esc(condText(b)) + '">', 'full') + branchCond(b) + '</div>').join('') +
          (more.length < MAX_BRANCHES - 1 ? '<button type="button" class="k-btn is-outline is-sm" data-br-add>' + icon('plus') + 'Adaugă ramură</button>' : '') +
          '<p class="fb-hint">' + icon('info') + 'Merge pe prima ramură a cărei condiție e adevărată, de sus în jos. Dacă niciuna, pe <b>Altfel</b>. După ramuri, continuă cu pașii de dedesubt.</p>'
        : condFields(s) + '<button type="button" class="k-btn is-outline is-sm" data-br-add>' + icon('plus') + 'Mai multe ramuri (selector)</button>' +
          '<p class="fb-hint">' + icon('info') + 'Dacă e adevărat, merge pe ramura <b>Da</b>; altfel pe <b>Nu</b>. Cu „Mai multe ramuri” devine selector: o ramură pentru fiecare variantă (ex. corporale, faciale, epilare laser). După ramuri, continuă cu pașii de dedesubt.</p>';
    }
    if (s.type === 'stop_if') body = condFields(s) + '<p class="fb-hint">' + icon('info') + 'Dacă e adevărat, automatizarea se oprește aici pentru acest client.</p>';
    if (s.type === 'notify') {
      const to = new Set(s.to || []);
      const box = (val, label, sub) => '<label class="fb-check"><input type="checkbox" data-to="' + esc(val) + '"' + (to.has(val) ? ' checked' : '') + '><span>' + esc(label) + (sub ? '<small>' + esc(sub) + '</small>' : '') + '</span></label>';
      const people = (B.meta.team || []).filter((p) => p.id !== 'admin');
      body = '<div class="fb-sub">Cui</div><div class="fb-checks">' + box('role:admin', 'Admin', 'tu și orice cont de admin') + box('role:receptie', 'Recepția', 'toate recepționistele') + box('role:cosmetician', 'Cosmeticienele', '') + '</div>' +
        (people.length ? '<details class="au-adv"' + ((s.to || []).some((x) => x.startsWith('emp:')) ? ' open' : '') + '><summary>Sau anumite persoane</summary><div class="fb-checks">' + people.map((p) => box('emp:' + p.id, p.name, ROLE[p.role] || p.role)).join('') + '</div></details>' : '') +
        K.field('Titlu', '<input data-f="title" maxlength="80" value="' + esc(s.title || '') + '" placeholder="ex. Lead nou: {nume}">', 'full') +
        K.field('Text', '<input data-f="text" maxlength="160" value="' + esc(s.text || '') + '" placeholder="ex. {procedura} · {locatie} · {telefon}">', 'full') + chips +
        '<div class="au-preview"><span>' + icon('bell') + 'Așa apare în portal și pe telefon</span><div class="fb-notif"><b data-prev-t>' + renderMsg(s.title, v) + '</b><span data-prev>' + renderMsg(s.text, v) + '</span></div></div>' +
        '<p class="fb-hint">' + icon('info') + 'Apare la clopoțel și, pe telefoanele unde au pornit notificările (Notificări → Pornește pe acest dispozitiv), ca notificare.</p>' +
        '<label class="fb-check is-row"><input type="checkbox" data-f="whatsapp"' + (s.whatsapp ? ' checked' : '') + '><span>Și pe WhatsApp, la numărul lor<small>Cu un șablon aprobat. Numărul e cel din profilul fiecăreia.</small></span></label>' +
        (s.whatsapp ? waFields(s, 'WhatsApp de pe numărul') : '');
    }
    return '<header class="fb-ph"><span class="k-icon-chip is-' + st.tone + '">' + icon(st.ic) + '</span><div><b>' + esc(st.label) + '</b><small>' + esc(problem(s) ? 'Incomplet: ' + problem(s) : 'Modificările se văd pe loc în schemă') + '</small></div>' +
      '<button type="button" class="k-icon-btn" data-close-panel aria-label="Închide">' + icon('x') + '</button></header>' +
      '<div class="fb-pb k-form">' + body + '</div>' +
      '<footer class="fb-pf"><button type="button" class="k-btn is-danger is-outline is-sm" data-rm="' + esc(s.id) + '">' + icon('trash') + 'Șterge pasul</button></footer>';
  }
  function trigPanel() {
    const t = B.W.trigger, meta = B.meta;
    const f = [K.field('Ce o pornește', '<select data-t="type">' + K.options(meta.triggers.map((x) => [x.id, x.label]), t.type) + '</select>', 'full')];
    if (t.type === 'lead_created') {
      f.push(K.field('Procedura', '<select data-t="interest">' + K.options([['any', 'Orice procedură']].concat(offerOpts().map((o) => [o, o])), t.interest || 'any') + '</select>', 'full', 'Procedura vine din formularul Facebook (Integrări → Formulare) sau o scrie recepția.'));
      f.push(K.field('Sursa', '<select data-t="source">' + K.options(meta.sources.map((s) => [s, SOURCE[s] || s]), t.source || 'any') + '</select>', 'full'));
    }
    if (t.type === 'stage_changed') f.push(K.field('Etapa', '<select data-t="stage">' + K.options([['', 'Alege etapa…']].concat(meta.stages.map((s) => [s.id, s.name])), t.stage || '') + '</select>', 'full'));
    if (t.type === 'lead_idle') f.push(K.field('După câte ore fără contact', '<input type="number" min="1" max="720" data-t="hours" value="' + esc(t.hours || 2) + '">', 'full'));
    if (t.type === 'appointment_before') f.push(K.field('Cu câte ore înainte', '<input type="number" min="1" max="168" data-t="hours" value="' + esc(t.hours || 24) + '">', 'full'));
    if (t.type === 'appointment_after') f.push(K.field('La câte zile după „Finalizată”', '<input type="number" min="0" max="365" data-t="days" value="' + esc(t.days == null ? 1 : t.days) + '">', 'full'));
    if (t.type === 'appointment_status') f.push(K.field('Statusul', '<select data-t="status">' + K.options([['', 'Alege statusul…']].concat(meta.statuses.map((s) => [s, STATUS[s]])), t.status || '') + '</select>', 'full'));
    if (t.type !== 'stage_changed' && t.type !== 'lead_idle') f.push(K.field('Orașul', '<select data-t="location">' + K.options(meta.locations.map((l) => [l, l === 'any' ? 'Ambele orașe' : l]), t.location || 'any') + '</select>', 'full'));
    if (t.type === 'lead_created') f.push('<label class="fb-check is-row"><input type="checkbox" data-t="returning"' + (t.returning ? ' checked' : '') + '><span>Și când un lead existent trimite din nou formularul<small>Bun pentru alerte. Mesajele de bun venit merg doar la leadurile noi.</small></span></label>');
    return '<header class="fb-ph"><span class="k-icon-chip is-accent">' + icon((TRIG[t.type] || {}).ic || 'zap') + '</span><div><b>Declanșator</b><small>Când pornește automatizarea</small></div>' +
      '<button type="button" class="k-icon-btn" data-close-panel aria-label="Închide">' + icon('x') + '</button></header>' +
      '<div class="fb-pb k-form">' + f.join('') + '<p class="fb-hint">' + icon('info') + esc(trigHint(t)) + '</p></div>';
  }
  function trigHint(t) {
    return ({
      lead_created: 'Pornește când intră un lead nou, din formularul Facebook, de pe site sau adăugat de recepție.',
      stage_changed: 'Pornește când cineva (sau altă automatizare) mută leadul în etapa aleasă din Pipeline.',
      lead_idle: 'Verifică după atâtea ore: dacă nimeni n-a contactat leadul, face pașii. Dacă a fost sunat, nu face nimic.',
      appointment_created: 'Pornește imediat ce se face o programare (din Calendar sau din Pipeline).',
      appointment_before: 'Rulează la ora potrivită înainte de programare. Dacă programarea se mută, se recalculează singur.',
      appointment_status: 'Pornește când programarea primește statusul ales.',
      appointment_after: 'Pornește după ce programarea e marcată „Finalizată”, pentru recenzii, revenire, upsell.',
    })[t.type] || '';
  }
  function openPanel(id) {
    B.sel = id;
    const p = B.root.querySelector('[data-panel]');
    p.innerHTML = panelHtml();
    p.hidden = !p.innerHTML;
    B.root.classList.toggle('has-panel', !p.hidden);
    paint();
  }
  function closePanel() {
    B.sel = null;
    const p = B.root.querySelector('[data-panel]');
    p.hidden = true; p.innerHTML = '';
    B.root.classList.remove('has-panel');
    paint();
  }
  // the panel's header line and previews follow the typing; the canvas card too
  function refreshPanelBits() {
    const r = B.sel && B.sel !== 'trigger' ? locate(B.sel) : null;
    if (!r) return;
    const p = B.root.querySelector('[data-panel]');
    const v = sample();
    const prev = p.querySelector('[data-prev]'); if (prev) prev.innerHTML = renderMsg(r.s.text, v);
    const pt = p.querySelector('[data-prev-t]'); if (pt) pt.innerHTML = renderMsg(r.s.title, v);
    const sm = p.querySelector('.fb-ph small'); if (sm) sm.textContent = problem(r.s) ? 'Incomplet: ' + problem(r.s) : 'Modificările se văd pe loc în schemă';
  }

  // ------------------------------------------------------------------ add / remove / move
  function defaults(type) {
    if (type === 'wait') return { type, amount: 1, unit: 'h', mode: 'for' };
    if (type === 'whatsapp') return { type, templateId: '', from: 'auto', text: '' };
    if (type === 'task') return { type, text: '' };
    if (type === 'move_stage') return { type, stage: '' };
    if (type === 'notify') return { type, to: ['role:admin', 'role:receptie'], title: isLead() ? 'Lead nou: {nume}' : 'Programare: {nume}', text: isLead() ? '{procedura} · {locatie} · {telefon}' : '{tratament} · {zi} {ora} · {locatie}', whatsapp: false, templateId: '', from: 'auto' };
    if (type === 'if') return { type, cond: isLead() ? 'interest' : 'appt_confirmed', value: '', yes: [], no: [] };
    if (type === 'stop_if') return { type, cond: isLead() ? 'contacted' : 'appt_inactive' };
    return { type };
  }
  function openMenu(btn) {
    closeMenu();
    const [path, i] = btn.dataset.add.split('|');
    const full = count(B.W.steps) >= (B.meta.maxSteps || 40);
    const groups = {};
    // (no "task" step: reception's Sarcini hold only what she adds herself)
    Object.keys(STEP).filter((k) => !STEP[k].hidden).forEach((k) => { (groups[STEP[k].group] = groups[STEP[k].group] || []).push(k); });
    const m = document.createElement('div');
    m.className = 'fb-menu';
    m.innerHTML = (full ? '<p class="fb-menu-note">Ai atins 40 de pași.</p>' : '') + Object.keys(groups).map((g) => '<div class="fb-menu-g"><small>' + esc(g) + '</small>' + groups[g].map((k) => {
      const off = full || (STEP[k].lead && !isLead()) || (k === 'if' && depthOf(path) >= MAX_DEPTH);
      return '<button type="button" data-new="' + k + '"' + (off ? ' disabled' : '') + '><span class="k-icon-chip is-' + STEP[k].tone + '">' + icon(STEP[k].ic) + '</span>' + esc(STEP[k].label) + '</button>';
    }).join('') + '</div>').join('');
    B.root.appendChild(m);
    const r = btn.getBoundingClientRect(), mw = m.offsetWidth, mh = m.offsetHeight;
    m.style.left = Math.max(8, Math.min(window.innerWidth - mw - 8, r.left + r.width / 2 - mw / 2)) + 'px';
    m.style.top = (r.bottom + mh + 8 < window.innerHeight ? r.bottom + 6 : Math.max(8, r.top - mh - 6)) + 'px';
    m.addEventListener('click', (e) => {
      const b = e.target.closest('[data-new]');
      if (!b || b.disabled) return;
      const s = Object.assign({ id: uid() }, defaults(b.dataset.new));
      const list = listAt(path);
      if (!list) return;
      list.splice(Number(i), 0, s);
      closeMenu(); changed(); openPanel(s.id);
      const n = B.root.querySelector('[data-node="' + s.id + '"]');
      if (n) n.scrollIntoView({ block: 'center', inline: 'center', behavior: 'smooth' });
    });
    B.menu = m;
  }
  function closeMenu() { if (B && B.menu) { B.menu.remove(); B.menu = null; } }
  async function removeStep(id) {
    const r = locate(id);
    if (!r) return;
    const inBranches = r.s.type === 'if' ? lists(r.s).reduce((n, l) => n + count(l), 0) : 0;
    if (inBranches > 0 &&
      !(await K.ui().confirm({ title: 'Ștergi „Dacă / Altfel”?', message: 'Se șterg și pașii din ramurile lui (' + inBranches + ').', confirmText: 'Șterge', danger: true }))) return;
    r.list.splice(r.i, 1);
    changed();
    if (B.sel === id || (B.sel && !locate(B.sel) && B.sel !== 'trigger')) closePanel(); else paint();
  }
  // move a step (with its branches) into list `path` at index `i`
  function moveStep(id, path, i) {
    const r = locate(id);
    const target = listAt(path);
    if (!r || !target || inside(path, r.s)) return false;
    if (r.s.type === 'if' && depthOf(path) + ifDepth(r.s) > MAX_DEPTH) { K.ui().toast(ERR.too_deep, 'error'); return false; }
    let at = i;
    if (r.list === target && r.i < i) at--;
    if (r.list === target && r.i === at) return false;
    r.list.splice(r.i, 1);
    target.splice(at, 0, r.s);
    changed();
    paint();
    return true;
  }

  // ------------------------------------------------------------------ drag & drop (mouse, pen, touch)
  function startDrag(node, e) {
    const id = node.dataset.node;
    const r = locate(id);
    if (!r) return;
    const ghost = node.cloneNode(true);
    ghost.classList.add('fb-ghost');
    ghost.style.width = node.offsetWidth + 'px';
    document.body.appendChild(ghost);
    B.drag = { id, ghost, ox: node.offsetWidth / 2, oy: 20, target: null };
    B.root.classList.add('is-dragging');
    node.classList.add('is-moving');
    // a step can't go inside its own branches
    B.root.querySelectorAll('[data-slot]').forEach((sl) => { if (inside(sl.dataset.slot.split('|')[0], r.s)) sl.classList.add('is-off'); });
    if (navigator.vibrate) try { navigator.vibrate(12); } catch (x) { /* not allowed */ }
    moveDrag(e);
  }
  function moveDrag(e) {
    const d = B.drag;
    d.ghost.style.transform = 'translate(' + (e.clientX - d.ox) + 'px,' + (e.clientY - d.oy) + 'px) rotate(-1.5deg)';
    // the nearest drop place within reach
    let best = null, bestD = 90;
    B.root.querySelectorAll('[data-slot]:not(.is-off)').forEach((sl) => {
      const b = sl.getBoundingClientRect();
      const dist = Math.hypot(e.clientX - (b.left + b.width / 2), e.clientY - (b.top + b.height / 2));
      if (dist < bestD) { best = sl; bestD = dist; }
    });
    if (d.target !== best) { if (d.target) d.target.classList.remove('is-target'); d.target = best; if (best) best.classList.add('is-target'); }
    // near an edge, the canvas scrolls by itself
    const cv = B.root.querySelector('[data-canvas]').getBoundingClientRect();
    d.vx = e.clientX < cv.left + 50 ? -12 : e.clientX > cv.right - 50 ? 12 : 0;
    d.vy = e.clientY < cv.top + 50 ? -12 : e.clientY > cv.bottom - 50 ? 12 : 0;
    if ((d.vx || d.vy) && !d.raf) {
      const step = () => {
        if (!B || !B.drag || (!B.drag.vx && !B.drag.vy)) { if (B && B.drag) B.drag.raf = 0; return; }
        const c = B.root.querySelector('[data-canvas]');
        c.scrollLeft += B.drag.vx; c.scrollTop += B.drag.vy;
        B.drag.raf = requestAnimationFrame(step);
      };
      d.raf = requestAnimationFrame(step);
    }
  }
  function endDrag(drop) {
    const d = B.drag;
    B.drag = null;
    d.ghost.remove();
    B.root.classList.remove('is-dragging');
    if (d.raf) cancelAnimationFrame(d.raf);
    B.draggedAt = Date.now(); // the click that ends a drag doesn't open the step
    let moved = false;
    if (drop && d.target) { const [path, i] = d.target.dataset.slot.split('|'); moved = moveStep(d.id, path, Number(i)); }
    if (!moved) paint();
  }
  function bindPointer(cv) {
    let press = null;
    cv.addEventListener('pointerdown', (e) => {
      if (e.button !== 0 || B.drag) return;
      const node = e.target.closest('[data-node]');
      if (node && node.dataset.node !== 'trigger' && !e.target.closest('[data-rm]')) {
        press = { node, x: e.clientX, y: e.clientY, touch: e.pointerType === 'touch', t: 0, id: e.pointerId };
        // a finger has to hold still a moment first, so the canvas can still be scrolled
        if (press.touch) press.t = setTimeout(() => { if (press) { press.ready = true; try { cv.setPointerCapture(press.id); } catch (x) { /* gone */ } startDrag(press.node, { clientX: press.x, clientY: press.y }); } }, 380);
        return;
      }
      // empty canvas: drag to look around (mouse)
      if (!node && !e.target.closest('button, input, select, textarea') && e.pointerType === 'mouse') {
        press = { pan: true, x: e.clientX, y: e.clientY, sl: cv.scrollLeft, st: cv.scrollTop };
        cv.classList.add('is-panning');
      }
    });
    cv.addEventListener('pointermove', (e) => {
      if (!press) return;
      if (press.pan) { cv.scrollLeft = press.sl - (e.clientX - press.x); cv.scrollTop = press.st - (e.clientY - press.y); return; }
      if (B.drag) { e.preventDefault(); moveDrag(e); return; }
      const far = Math.hypot(e.clientX - press.x, e.clientY - press.y) > 6;
      if (press.touch) { if (far && !press.ready) { clearTimeout(press.t); press = null; } return; }
      if (far) { try { cv.setPointerCapture(e.pointerId); } catch (x) { /* gone */ } startDrag(press.node, e); }
    });
    const up = (e, cancel) => {
      if (!press) return;
      clearTimeout(press.t);
      if (press.pan) cv.classList.remove('is-panning');
      if (B.drag) endDrag(!cancel);
      press = null;
    };
    cv.addEventListener('pointerup', (e) => up(e, false));
    cv.addEventListener('pointercancel', (e) => up(e, true));
    // while a finger drags a step, the page must not scroll
    cv.addEventListener('touchmove', (e) => { if (B && B.drag) e.preventDefault(); }, { passive: false });
    cv.addEventListener('wheel', (e) => { if (e.ctrlKey || e.metaKey) { e.preventDefault(); setZoom(B.zoom - Math.sign(e.deltaY) * 0.1); } }, { passive: false });
  }

  // ------------------------------------------------------------------ open / save / close
  function open(wf, ctx) {
    if (B) close(true);
    // a new flow starts in the folder it was made from (Automatizări → „Nouă aici”)
    const W = wf ? clone(wf) : { name: '', note: '', active: true, folder: (ctx && ctx.folder) || '', trigger: { type: 'lead_created', source: 'any', location: 'any', interest: 'any' }, steps: [] };
    ensureIds(W.steps);
    let z = 1;
    try { z = Number(localStorage.getItem(ZOOM_KEY)) || 1; } catch (e) { /* private mode */ }
    const root = document.createElement('div');
    root.className = 'fb-root';
    root.innerHTML =
      '<header class="fb-top"><button type="button" class="k-btn is-sm" data-back>' + icon('left') + '<span>Automatizări</span></button>' +
        '<input class="fb-name" data-name maxlength="80" placeholder="Numele automatizării" value="' + esc(W.name) + '">' +
        '<span class="fb-dirty" data-dirty hidden>Nesalvat</span><span class="fb-count" data-count></span><span class="k-grow"></span>' +
        K.toggle('active', W.active !== false, 'Activă') +
        (wf ? '<button type="button" class="k-icon-btn" data-del title="Șterge automatizarea" aria-label="Șterge automatizarea">' + icon('trash') + '</button>' : '') +
        '<button type="button" class="k-btn is-primary is-sm" data-save>' + icon('check') + 'Salvează</button></header>' +
      '<div class="fb-main"><div class="fb-canvas" data-canvas><div data-flow></div></div>' +
        '<div class="fb-zoombar"><button type="button" data-zoom="-1" aria-label="Micșorează">' + icon('minus') + '</button><span data-zoom-v></span><button type="button" data-zoom="1" aria-label="Mărește">' + icon('plus') + '</button><button type="button" data-fit title="Toată schema" aria-label="Toată schema">' + icon('move') + '</button></div>' +
        '<p class="fb-tip">' + icon('grip') + '<span>Trage un pas ca să-l muți. Pe telefon: ține apăsat, apoi trage.</span></p>' +
        '<aside class="fb-panel" data-panel hidden></aside></div>';
    document.body.appendChild(root);
    document.documentElement.classList.add('c360-noscroll');
    B = { W, wf, ctx, meta: ctx.meta, settings: ctx.settings || {}, sel: null, zoom: z, dirty: false, root, menu: null, drag: null };
    paint();
    setZoom(z);
    bindPointer(root.querySelector('[data-canvas]'));
    root.addEventListener('click', onClick);
    root.addEventListener('input', onInput);
    root.addEventListener('change', onChange);
    root.addEventListener('focusin', (e) => { if (e.target.matches('[data-f="text"], [data-f="title"]')) B.lastField = e.target; });
    document.addEventListener('keydown', onKey, true);
    window.addEventListener('beforeunload', onUnload);
    requestAnimationFrame(() => root.classList.add('is-open'));
    setTimeout(() => root.classList.add('is-open'), 60);
    // the main line starts in the middle, however wide the branches make the canvas
    const cv = root.querySelector('[data-canvas]');
    cv.scrollLeft = (cv.scrollWidth - cv.clientWidth) / 2;
    // a new automation starts with its trigger open
    if (!wf) openPanel('trigger');
    if (!W.name) setTimeout(() => root.querySelector('[data-name]').focus(), 300);
  }
  function onUnload(e) { if (B && B.dirty) { e.preventDefault(); e.returnValue = ''; } }
  async function close(force) {
    if (!B) return;
    if (!force && B.dirty && !(await K.ui().confirm({ title: 'Ieși fără să salvezi?', message: 'Modificările din schemă se pierd.', confirmText: 'Ieși fără salvare', danger: true }))) return;
    closeMenu();
    if (B.drag) B.drag.ghost.remove();
    B.root.remove();
    document.documentElement.classList.remove('c360-noscroll');
    document.removeEventListener('keydown', onKey, true);
    window.removeEventListener('beforeunload', onUnload);
    const ctx = B.ctx;
    B = null;
    if (ctx.onClose) ctx.onClose();
  }
  async function save(btn) {
    B.W.name = B.root.querySelector('[data-name]').value.trim();
    B.W.active = B.root.querySelector('input[name=active]').checked;
    if (!B.W.name) { K.ui().toast(ERR.missing_name, 'error'); B.root.querySelector('[data-name]').focus(); return; }
    const before = new Set((B.ctx.list() || []).map((w) => w.id));
    await K.busy(btn, async () => {
      try {
        const d = await K.api('/api/portal-workflows', { action: 'save', workflow: Object.assign({}, B.W, B.wf ? { id: B.wf.id } : {}) });
        const saved = B.wf ? d.workflows.find((w) => w.id === B.wf.id) : d.workflows.find((w) => !before.has(w.id));
        B.ctx.onSaved(d);
        if (saved) {
          B.wf = saved;
          B.W = clone(saved);
          ensureIds(B.W.steps);
          if (B.sel && B.sel !== 'trigger' && !locate(B.sel)) closePanel();
        }
        B.dirty = false;
        B.root.querySelector('[data-dirty]').hidden = true;
        if (!B.root.querySelector('[data-del]')) B.root.querySelector('[data-save]').insertAdjacentHTML('beforebegin', '<button type="button" class="k-icon-btn" data-del title="Șterge automatizarea" aria-label="Șterge automatizarea">' + icon('trash') + '</button>');
        paint();
        K.ui().toast(B.W.active ? 'Salvat. Automatizarea e activă.' : 'Salvat (oprită).', 'success');
      } catch (err) { K.ui().toast(ERR[err.code] || K.errText(err), 'error'); }
    });
  }

  // ------------------------------------------------------------------ events
  function onKey(e) {
    if (!B) return;
    if (document.querySelector('.c360-dialog-root')) return;
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') { e.preventDefault(); save(B.root.querySelector('[data-save]')); return; }
    if (e.key === 'Escape') {
      e.stopPropagation();
      if (B.drag) return endDrag(false);
      if (B.menu) return closeMenu();
      if (B.sel) return closePanel();
      close();
      return;
    }
    if ((e.key === 'Delete' || e.key === 'Backspace') && B.sel && B.sel !== 'trigger' && !e.target.closest('input, textarea, select')) { e.preventDefault(); removeStep(B.sel); }
    if (e.key === 'Enter' && e.target.matches('[data-node]')) openPanel(e.target.dataset.node);
  }
  function onClick(e) {
    const t = e.target;
    if (B.menu && !t.closest('.fb-menu') && !t.closest('[data-add]')) closeMenu();
    if (t.closest('[data-back]')) return close();
    if (t.closest('[data-save]')) return save(t.closest('[data-save]'));
    if (t.closest('[data-del]')) return delWorkflow();
    if (t.closest('[data-close-panel]')) return closePanel();
    // a new WhatsApp template (or the chosen one) in the template editor (portal-wa.js); the step takes the new one
    const tn = t.closest('[data-tpl-new], [data-tpl-edit]');
    if (tn && window.C360Wa) {
      const stepId = B.sel;
      const cur = tn.dataset.tplEdit ? tplOf(tn.dataset.tplEdit) : null;
      window.C360Wa.edit(cur, { onSaved: (id, d) => {
        if (!B) return;
        B.meta.waTemplates = d.templates;
        const r = locate(stepId);
        if (r) { if (!cur) r.s.templateId = id; const tp = tplOf(r.s.templateId); r.s.text = tp ? tp.text : r.s.text; changed(); }
        openPanel(stepId);
      } });
      return;
    }
    const z = t.closest('[data-zoom]'); if (z) return setZoom(B.zoom + Number(z.dataset.zoom) * 0.1);
    if (t.closest('[data-fit]')) return fit();
    const add = t.closest('[data-add]'); if (add) { if (B.menu && B.menu.dataset.for === add.dataset.add) return closeMenu(); openMenu(add); B.menu.dataset.for = add.dataset.add; return; }
    const rm = t.closest('[data-rm]'); if (rm) return removeStep(rm.dataset.rm);
    if (t.closest('[data-br-add]')) {
      const r = locate(B.sel);
      if (!r || r.s.type !== 'if') return;
      r.s.more = r.s.more || [];
      if (r.s.more.length >= MAX_BRANCHES - 1) return;
      const appt = !isLead();
      r.s.more.push({ id: uid(), name: '', cond: appt ? 'category' : 'interest', value: '', steps: [] });
      changed(); openPanel(B.sel);
      return;
    }
    const brm = t.closest('[data-br-rm]');
    if (brm) {
      const r = locate(B.sel);
      if (!r) return;
      const b = (r.s.more || []).find((x) => x.id === brm.dataset.brRm);
      if (!b) return;
      (async () => {
        if (count(b.steps) && !(await K.ui().confirm({ title: 'Scoți ramura?', message: 'Se șterg și pașii din ea (' + count(b.steps) + ').', confirmText: 'Scoate', danger: true }))) return;
        r.s.more = r.s.more.filter((x) => x !== b);
        changed(); openPanel(B.sel);
      })();
      return;
    }
    const vb = t.closest('[data-var]');
    if (vb) {
      const f = B.lastField && B.lastField.isConnected ? B.lastField : B.root.querySelector('[data-panel] [data-f="text"]');
      if (!f) return;
      const pos = f.selectionStart != null ? f.selectionStart : f.value.length;
      f.value = f.value.slice(0, pos) + vb.dataset.var + f.value.slice(f.selectionEnd != null ? f.selectionEnd : pos);
      f.focus(); f.selectionStart = f.selectionEnd = pos + vb.dataset.var.length;
      f.dispatchEvent(new Event('input', { bubbles: true }));
      return;
    }
    const node = t.closest('[data-node]');
    if (node && !B.drag && Date.now() - (B.draggedAt || 0) > 250) { if (B.sel === node.dataset.node) closePanel(); else openPanel(node.dataset.node); }
  }
  function setField(f) {
    const r = locate(B.sel);
    if (!r) return null;
    const k = f.dataset.f;
    r.s[k] = f.type === 'checkbox' ? f.checked : f.type === 'number' ? Number(f.value) : f.value;
    return r;
  }
  function branchOf(f) {
    const r = locate(B.sel);
    return r ? (r.s.more || []).find((x) => x.id === f.dataset.br) || null : null;
  }
  function onInput(e) {
    const f = e.target;
    if (f.matches('[data-name]')) { changed(); return; }
    if (f.dataset.bf && f.tagName !== 'SELECT') { const b = branchOf(f); if (b) { b[f.dataset.bf] = f.value; changed(); paint(); } return; }
    if (f.dataset.f && f.type !== 'checkbox' && f.tagName !== 'SELECT') { setField(f); changed(); paint(); refreshPanelBits(); }
  }
  function onChange(e) {
    const f = e.target;
    if (f.name === 'active') { changed(); return; }
    if (f.dataset.t) {
      const t = B.W.trigger;
      const k = f.dataset.t;
      if (k === 'type') {
        const wasLead = isLead();
        B.W.trigger = f.value === 'lead_created' ? { type: f.value, source: 'any', location: 'any', interest: 'any' } : { type: f.value, location: 'any' };
        if (wasLead !== isLead()) K.ui().toast(isLead() ? 'Pașii pentru programări sunt marcați cu galben.' : 'Pașii pentru leaduri sunt marcați cu galben.', 'info');
      } else t[k] = f.type === 'checkbox' ? f.checked : f.type === 'number' ? Number(f.value) : f.value;
      changed(); openPanel('trigger');
      return;
    }
    if (f.dataset.bf) {
      const b = branchOf(f);
      if (!b) return;
      b[f.dataset.bf] = f.value;
      if (f.dataset.bf === 'cond') b.value = '';
      changed();
      if (f.tagName === 'SELECT') openPanel(B.sel); else paint();
      return;
    }
    if (f.dataset.to) {
      const r = locate(B.sel);
      if (!r) return;
      const set = new Set(r.s.to || []);
      if (f.checked) set.add(f.dataset.to); else set.delete(f.dataset.to);
      r.s.to = [...set];
      changed(); paint(); refreshPanelBits();
      return;
    }
    if (f.dataset.f) {
      const r = setField(f);
      if (!r) return;
      if (f.dataset.f === 'cond') r.s.value = '';
      if (f.dataset.f === 'mode' && r.s.mode !== 'for' && (r.s.amount == null || r.s.amount === 1)) { r.s.amount = r.s.mode === 'before' ? 24 : 2; r.s.unit = 'h'; }
      if (f.dataset.f === 'templateId') { const tp = tplOf(f.value); r.s.text = tp ? tp.text : ''; }
      changed();
      // a select or a checkbox can change what the panel shows (a value list, the template field)
      if (f.tagName === 'SELECT' || f.type === 'checkbox') openPanel(B.sel); else { paint(); refreshPanelBits(); }
    }
  }
  async function delWorkflow() {
    if (!B.wf) return;
    if (!(await K.ui().confirm({ title: 'Ștergi „' + B.wf.name + '”?', message: 'Rulările programate ale ei se opresc. Sarcinile deja create rămân.', confirmText: 'Șterge', danger: true }))) return;
    try {
      const d = await K.api('/api/portal-workflows', { action: 'delete', id: B.wf.id });
      B.ctx.onSaved(d);
      close(true);
      K.ui().toast('Automatizare ștearsă.', 'success');
    } catch (err) { K.ui().toast(K.errText(err), 'error'); }
  }

  K.flowBuilder = { open, close: () => close(), STEP, COND, ROLE };
})();
