// Centrul360 portal — Admin → Automatizări: GoHighLevel-style flows. One trigger ("Programare nouă",
// "Lead nou din reclamă", "Cu 24h înainte" …), then steps (wait, WhatsApp, task for reception, move
// the lead, stop if …). Each flow is a card you can read at a glance; the editor shows the message
// exactly as the client will get it. The engine itself lives in api/_lib/workflows.js.
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
    wait: { ic: 'clock', label: 'Așteaptă', tone: '' },
    whatsapp: { ic: 'chat', label: 'Mesaj WhatsApp', tone: 'good' },
    task: { ic: 'listCheck', label: 'Sarcină pentru recepție', tone: 'accent' },
    move_stage: { ic: 'layers', label: 'Mută leadul', tone: 'info' },
    stop_if: { ic: 'ban', label: 'Oprește dacă', tone: 'warn' },
  };
  const COND = {
    contacted: 'leadul a fost contactat', booked: 'leadul are programare', appt_inactive: 'programarea e anulată / finalizată',
    appt_confirmed: 'programarea e confirmată', future_appt: 'clientul are deja o programare viitoare',
  };
  const STATUS = { programata: 'Programată', confirmata: 'Confirmată', anulata: 'Anulată', reprogramata: 'Reprogramată', finalizata: 'Finalizată' };
  const SOURCE = { any: 'Orice sursă', facebook: 'Reclamă Facebook', instagram: 'Instagram', site: 'Site', telefon: 'Telefon', recomandare: 'Recomandare', 'walk-in': 'Walk-in', manual: 'Adăugat manual' };
  const UNIT = { min: 'minute', h: 'ore', d: 'zile' };
  const VARS = [['prenume', 'Prenume'], ['nume', 'Nume complet'], ['zi', 'Zi (azi / mâine / joi)'], ['data', 'Data'], ['ora', 'Ora'], ['tratament', 'Tratament'], ['locatie', 'Locație'], ['adresa', 'Adresa'], ['interes', 'Interes (din formular)'], ['telefon', 'Telefon'], ['link_recenzie', 'Link recenzie']];
  const ERR = { missing_name: 'Dă-i un nume automatizării.', invalid_trigger: 'Alege declanșatorul complet.', missing_steps: 'Adaugă cel puțin un pas.',
    invalid_step: 'Un pas nu e complet (mesaj gol sau etapă lipsă).', step_needs_lead: '„Mută leadul” și condițiile despre lead merg doar la automatizări pornite de un lead.',
    step_needs_appointment: 'Condițiile despre programare merg doar la automatizări pornite de o programare.', too_many_workflows: 'Ai atins limita de 40 de automatizări.' };

  const S = { d: null, tab: 'flows', loading: false };
  let panel;

  const trigText = (t, meta) => {
    if (!t) return '';
    if (t.type === 'lead_created') return 'Lead nou' + (t.source && t.source !== 'any' ? ' din ' + (SOURCE[t.source] || t.source).toLowerCase() : '') + (t.location && t.location !== 'any' ? ' · ' + t.location : '');
    if (t.type === 'stage_changed') return 'Lead mutat în „' + ((meta.stages.find((s) => s.id === t.stage) || {}).name || t.stage) + '”';
    if (t.type === 'lead_idle') return 'Lead nesunat ' + t.hours + 'h';
    if (t.type === 'appointment_before') return 'Cu ' + (t.hours % 24 === 0 ? (t.hours / 24 === 1 ? 'o zi' : t.hours / 24 + ' zile') : t.hours + 'h') + ' înainte de programare';
    if (t.type === 'appointment_after') return t.days === 0 ? 'În ziua tratamentului' : 'La ' + (t.days === 1 ? 'o zi' : t.days + ' zile') + ' după tratament';
    if (t.type === 'appointment_status') return 'Programare devenită „' + (STATUS[t.status] || t.status) + '”';
    return (TRIG[t.type] || {}).label || t.type;
  };
  const stepText = (s, meta) => {
    if (s.type === 'wait') return s.amount + ' ' + UNIT[s.unit];
    if (s.type === 'stop_if') return COND[s.cond] || s.cond;
    if (s.type === 'move_stage') return '→ ' + ((meta.stages.find((x) => x.id === s.stage) || {}).name || s.stage);
    return String(s.text || '').replace(/\s+/g, ' ').slice(0, 70) + (String(s.text || '').length > 70 ? '…' : '');
  };

  // ------------------------------------------------------------------ page
  function mount(p) {
    panel = p;
    panel.classList.add('k-panel', 'au');
    panel.innerHTML =
      '<div class="k-head"><div><div class="k-eyebrow">Admin</div><h2>Automatizări</h2><p class="k-lede">Ce se întâmplă singur: confirmări, remindere, mesaje către leadurile din reclame, sarcini pentru recepție. Un declanșator, apoi pașii — ca în GoHighLevel.</p></div>' +
      '<div class="k-head-actions"><button type="button" class="k-btn is-outline" data-act="recipes">' + icon('book') + 'Rețete</button><button type="button" class="k-btn is-accent" data-act="new">' + icon('plus') + 'Automatizare nouă</button></div></div>' +
      '<div data-body><div class="k-skel" style="height:120px;margin-bottom:1rem"></div><div class="k-skel" style="height:320px"></div></div>';
    panel.addEventListener('click', onClick);
    panel.addEventListener('change', onChange);
  }
  async function load() {
    if (S.loading) return;
    S.loading = true;
    try { S.d = await K.api('/api/portal-workflows'); render(); }
    catch (e) { panel.querySelector('[data-body]').innerHTML = K.empty('alert', 'Nu am putut încărca automatizările', 'Verifică conexiunea și reîncearcă.', '<button type="button" class="k-btn is-primary" data-act="reload">Reîncearcă</button>'); }
    finally { S.loading = false; }
  }
  function totals() {
    const c = S.d.counters || {};
    return Object.keys(c).reduce((o, k) => { o.runs += c[k].runs || 0; o.sent += c[k].sent || 0; o.tasks += c[k].tasks || 0; return o; }, { runs: 0, sent: 0, tasks: 0 });
  }
  function render() {
    const d = S.d, meta = d.meta;
    const tot = totals();
    const waiting = Object.values(d.waiting || {}).reduce((a, b) => a + b, 0);
    const active = d.workflows.filter((w) => w.active).length;
    panel.querySelector('[data-body]').innerHTML =
      '<div class="au-status">' +
        '<div class="k-card au-chan ' + (meta.whatsappCloud ? 'is-on' : '') + '"><span class="k-icon-chip is-good">' + icon('chat') + '</span><div><b>WhatsApp · ' + (meta.whatsappCloud ? 'trimitere automată' : 'într-un tap') + '</b><span>' +
          (meta.whatsappCloud ? 'Mesajele pleacă singure prin WhatsApp Business. Dacă Meta refuză unul, devine sarcină.' : 'Mesajele apar în Sarcini, deja scrise — recepția apasă WhatsApp și trimite. <a href="#" data-act="wa-guide">Activează trimiterea automată</a>') + '</span></div></div>' +
        '<div class="k-card au-chan" data-act="fb"><span class="k-icon-chip" style="background:rgba(24,119,242,.12);color:#1877f2">' + icon('facebook') + '</span><div><b>Reclamele → Pipeline</b><span>Leadurile din formularele Facebook intră singure în Pipeline și pornesc automatizările „Lead nou”. <a href="#setari" data-act="fb">Conexiunea Facebook</a></span></div></div>' +
        '<div class="au-nums"><div><b>' + active + '</b><span>active</span></div><div><b>' + K.num(tot.runs) + '</b><span>rulări</span></div><div><b>' + K.num(tot.sent + tot.tasks) + '</b><span>mesaje & sarcini</span></div><div><b>' + K.num(waiting) + '</b><span>programate</span></div></div>' +
      '</div>' +
      '<div class="ad-tabs">' + K.seg('autab', [['flows', 'Automatizări', 'zap'], ['log', 'Istoric', 'clock'], ['vars', 'Date pentru mesaje', 'sliders']], S.tab, 'is-big') + '</div>' +
      '<div data-pane="flows"' + (S.tab === 'flows' ? '' : ' hidden') + '>' + flowsHtml() + '</div>' +
      '<div data-pane="log"' + (S.tab === 'log' ? '' : ' hidden') + '>' + logHtml() + '</div>' +
      '<div data-pane="vars"' + (S.tab === 'vars' ? '' : ' hidden') + '>' + varsHtml() + '</div>';
  }
  function flowsHtml() {
    const d = S.d, meta = d.meta;
    if (!d.workflows.length) return K.empty('zap', 'Nicio automatizare', 'Pornește de la o rețetă gata făcută sau construiește una de la zero.', '<button type="button" class="k-btn is-primary" data-act="recipes">' + icon('book') + 'Vezi rețetele</button>');
    const groups = [['Programări', (w) => w.trigger.type.startsWith('appointment')], ['Leaduri & reclame', (w) => !w.trigger.type.startsWith('appointment')]];
    return groups.map(([title, fn]) => {
      const list = d.workflows.filter(fn);
      if (!list.length) return '';
      return '<div class="au-group"><div class="au-group-title">' + esc(title) + '<span>' + list.length + '</span></div><div class="au-list">' + list.map((w) => {
        const c = (d.counters || {})[w.id] || { runs: 0, sent: 0, tasks: 0 };
        const wt = (d.waiting || {})[w.id] || 0;
        const ti = TRIG[w.trigger.type] || { ic: 'zap' };
        return '<article class="k-card au-flow' + (w.active ? ' is-active' : '') + '" data-open="' + esc(w.id) + '">' +
          '<div class="au-flow-head"><div class="au-flow-title"><b>' + esc(w.name) + '</b>' + (w.note ? '<span>' + esc(w.note) + '</span>' : '') + '</div>' +
          '<label class="k-switch" data-stop title="' + (w.active ? 'Activă — apasă ca s-o oprești' : 'Oprită — apasă ca s-o pornești') + '"><input type="checkbox" data-toggle="' + esc(w.id) + '"' + (w.active ? ' checked' : '') + '><i></i></label></div>' +
          '<div class="au-chain"><span class="au-node is-trigger">' + icon(ti.ic) + esc(trigText(w.trigger, meta)) + '</span>' +
            w.steps.map((s) => '<span class="au-arrow">' + icon('right') + '</span><span class="au-node is-' + s.type + '" title="' + esc(s.text || '') + '">' + icon(STEP[s.type].ic) + '<em>' + esc(stepText(s, meta)) + '</em></span>').join('') + '</div>' +
          '<div class="au-flow-foot">' + (c.runs ? K.plural(c.runs, 'rulare', 'rulări') + ' · ' + (c.sent ? c.sent + ' trimise automat · ' : '') + K.plural(c.tasks, 'sarcină', 'sarcini') : 'Nu a rulat încă') +
            (wt ? ' · <b>' + wt + ' programat' + (wt === 1 ? '' : 'e') + '</b>' : '') + '</div></article>';
      }).join('') + '</div></div>';
    }).join('');
  }
  function logHtml() {
    const r = S.d.recent || [];
    if (!r.length) return K.empty('clock', 'Nimic încă', 'Aici vezi fiecare rulare: pentru cine, ce pas, ce s-a trimis.');
    const tone = { waiting: 'info', done: 'good', stopped: '', error: 'bad' };
    const lab = { waiting: 'Programat', done: 'Terminat', stopped: 'Oprit', error: 'Eroare' };
    return '<div class="k-card au-log">' + r.map((x) => '<div class="au-log-row"><div class="au-log-main"><b>' + esc(x.who) + '</b><span>' + esc(x.workflow) + '</span>' +
      '<div class="au-log-steps">' + x.log.map((l) => '<i>' + esc(l.text) + '</i>').join('') + '</div></div>' +
      '<div class="au-log-side"><span class="k-tag is-' + tone[x.status] + '">' + lab[x.status] + '</span><small>' + esc(x.status === 'waiting' ? 'la ' + fmtWhen(x.dueAt) : K.ago(x.updatedAt)) + '</small></div></div>').join('') + '</div>';
  }
  const fmtWhen = (iso) => { const d = new Date(iso); return K.relDay(K.iso(d)).toLowerCase() + ' ' + K.pad(d.getHours()) + ':' + K.pad(d.getMinutes()); };
  function varsHtml() {
    const s = S.d.settings;
    return '<section class="k-card au-vars"><h3>' + icon('pin') + 'Adresele clinicilor</h3><p class="k-muted">Apar în mesaje acolo unde scrii {adresa}.</p><form class="k-form" data-settings>' +
      K.field('Timișoara', '<input name="adr_tm" value="' + esc(s.addresses['Timișoara'] || '') + '" placeholder="ex. Str. Exemplu 10, Timișoara (lângă …)" maxlength="200">', 'full') +
      K.field('Arad', '<input name="adr_ar" value="' + esc(s.addresses['Arad'] || '') + '" placeholder="ex. Bd. Revoluției 5, Arad" maxlength="200">', 'full') +
      K.field('Link pentru recenzii Google', '<input name="review" value="' + esc(s.reviewLink || '') + '" placeholder="https://g.page/r/…/review" maxlength="300">', 'full', 'Google Business → „Cere recenzii” → copiază linkul. Apare în mesaje la {link_recenzie}.') +
      '</form><div class="au-vars-foot"><button type="button" class="k-btn is-primary" data-act="save-settings">' + icon('check') + 'Salvează</button></div></section>' +
      '<section class="k-card au-vars"><h3>' + icon('chat') + 'WhatsApp automat (opțional)</h3>' + waGuide() + '</section>';
  }
  function waGuide() {
    const on = S.d.meta.whatsappCloud;
    return '<p class="k-muted">' + (on ? '<span class="k-tag is-good">' + icon('check') + 'Activ</span> Mesajele pleacă singure din numărul WhatsApp Business al clinicii.' : 'Acum mesajele ajung la recepție gata scrise (un tap pe WhatsApp). Ca să plece singure:') + '</p>' +
      '<ol class="au-steps"><li>În <b>Meta Business → WhatsApp Manager</b> adaugi numărul clinicii (WhatsApp Business Platform).</li>' +
      '<li>Creezi un <b>System User</b> cu acces la WhatsApp și generezi un token permanent.</li>' +
      '<li>În Vercel (proiectul site-ului) pui <code>WHATSAPP_TOKEN</code> și <code>WHATSAPP_PHONE_ID</code>, apoi Redeploy.</li>' +
      '<li>Pentru mesajele trimise de voi primii (confirmări, remindere), Meta cere <b>șabloane aprobate</b>: în WhatsApp Manager creezi șablonul în română, cu {{1}}, {{2}} … în ordinea variabilelor din mesaj, și îi scrii numele la pasul de WhatsApp.</li></ol>' +
      '<p class="k-muted">Până atunci nu se pierde nimic: orice mesaj care nu poate pleca singur devine sarcină într-un tap.</p>';
  }

  // ------------------------------------------------------------------ events
  async function onClick(e) {
    const t = e.target;
    const act = t.closest('[data-act]');
    if (t.closest('[data-stop]')) return; // the switch has its own change handler
    if (act) {
      const a = act.dataset.act;
      if (a === 'reload') return load();
      if (a === 'new') return openEditor(null);
      if (a === 'recipes') return openRecipes();
      if (a === 'fb') { e.preventDefault(); return K.go('setari'); }
      if (a === 'wa-guide') { e.preventDefault(); S.tab = 'vars'; return render(); }
      if (a === 'save-settings') return K.busy(act, saveSettings);
    }
    const card = t.closest('[data-open]');
    if (card) openEditor(S.d.workflows.find((w) => w.id === card.dataset.open));
  }
  async function onChange(e) {
    const t = e.target;
    if (t.name === 'autab') { S.tab = t.value; panel.querySelectorAll('[data-pane]').forEach((p) => { p.hidden = p.dataset.pane !== S.tab; }); return; }
    if (t.dataset.toggle) {
      const on = t.checked;
      try { S.d = await K.api('/api/portal-workflows', { action: 'toggle', id: t.dataset.toggle, active: on }); render(); K.ui().toast(on ? 'Automatizare pornită.' : 'Automatizare oprită.', 'success'); }
      catch (err) { t.checked = !on; K.ui().toast(K.errText(err), 'error'); }
    }
  }
  async function saveSettings() {
    const v = K.formValues(panel.querySelector('[data-settings]'));
    if (v.review && !/^https?:\/\//.test(v.review)) { K.ui().toast('Linkul de recenzii trebuie să înceapă cu https://', 'error'); return; }
    try { S.d = await K.api('/api/portal-workflows', { action: 'settings', settings: { addresses: { 'Timișoara': v.adr_tm, 'Arad': v.adr_ar }, reviewLink: v.review } }); render(); K.ui().toast('Salvat. Mesajele folosesc noile date.', 'success'); }
    catch (err) { K.ui().toast(K.errText(err), 'error'); }
  }

  // ------------------------------------------------------------------ recipes
  function openRecipes() {
    const have = new Set(S.d.workflows.map((w) => w.recipe).filter(Boolean));
    const d = K.drawer({
      title: 'Rețete gata făcute', icon: 'book', width: 620,
      subtitle: 'Automatizările care aduc bani într-o clinică. Se adaugă oprite — le verifici textul și le pornești.',
      body: '<div class="au-recipes">' + S.d.recipes.map((r) => '<article class="au-recipe"><div class="au-recipe-top"><span class="k-icon-chip">' + icon((TRIG[r.trigger.type] || {}).ic || 'zap') + '</span><div><b>' + esc(r.name) + '</b><span>' + esc(r.note || '') + '</span></div>' +
        (have.has(r.key) ? '<span class="k-tag is-good">' + icon('check') + 'Adăugată</span>' : '<button type="button" class="k-btn is-sm is-primary" data-add="' + esc(r.key) + '">' + icon('plus') + 'Adaugă</button>') + '</div>' +
        '<div class="au-chain is-compact"><span class="au-node is-trigger">' + esc(trigText(r.trigger, S.d.meta)) + '</span>' + r.steps.map((s) => '<span class="au-arrow">' + icon('right') + '</span><span class="au-node is-' + s.type + '">' + icon(STEP[s.type].ic) + '<em>' + esc(stepText(s, S.d.meta)) + '</em></span>').join('') + '</div></article>').join('') + '</div>',
      onMount(el) {
        el.addEventListener('click', (ev) => {
          const b = ev.target.closest('[data-add]');
          if (!b) return;
          K.busy(b, async () => {
            try { S.d = await K.api('/api/portal-workflows', { action: 'add_recipe', key: b.dataset.add }); render(); b.outerHTML = '<span class="k-tag is-good">' + icon('check') + 'Adăugată</span>'; K.ui().toast('Adăugată (oprită). O găsești în listă.', 'success'); }
            catch (err) { K.ui().toast(K.errText(err), 'error'); }
          });
        });
      },
    });
    return d;
  }

  // ------------------------------------------------------------------ editor
  function sample(trigger) {
    const s = S.d.settings;
    const appt = trigger && trigger.type && trigger.type.startsWith('appointment');
    return { prenume: 'Andreea', nume: 'Andreea Popescu', telefon: '0722 123 456', zi: 'mâine', data: '14.10.2026', ora: '11:00', tratament: appt ? 'Facial Restart' : 'LipoSonix', locatie: 'Timișoara',
      adresa: s.addresses['Timișoara'] || 'Timișoara', interes: 'LipoSonix · 2 zone', link_recenzie: s.reviewLink || 'https://g.page/r/…' };
  }
  const renderMsg = (text, v) => esc(String(text || '')).replace(/\{(\w+)\}/g, (m, k) => (k in v ? '<mark>' + esc(v[k]) + '</mark>' : '<mark class="is-bad">' + m + '</mark>'));

  function openEditor(wf) {
    const meta = S.d.meta;
    const W = wf ? JSON.parse(JSON.stringify(wf)) : { name: '', note: '', active: true, trigger: { type: 'appointment_created', location: 'any' }, steps: [{ type: 'whatsapp', text: 'Bună, {prenume}! ' }] };
    const isLeadT = () => !W.trigger.type.startsWith('appointment');
    const d = K.drawer({
      title: wf ? wf.name : 'Automatizare nouă', icon: 'zap', width: 680,
      subtitle: wf ? (wf.active ? '<span class="k-tag is-good">Activă</span>' : '<span class="k-tag">Oprită</span>') + ' Modificările se aplică de la următoarea rulare.' : 'Alegi ce o pornește, apoi pașii.',
      body: '<form class="k-form au-ed" data-ed autocomplete="off">' +
        K.field('Nume', '<input name="name" value="' + esc(W.name) + '" maxlength="80" placeholder="ex. Reminder cu o zi înainte" autofocus>', 'full') +
        '<div class="au-ed-trigger"><div class="au-ed-label">' + icon('zap') + 'Când pornește</div><div data-trig></div></div>' +
        '<div class="au-ed-label">' + icon('listCheck') + 'Ce face</div><div class="au-ed-steps" data-steps></div>' +
        '<div class="au-ed-add">' + Object.keys(STEP).map((k) => '<button type="button" class="k-btn is-outline is-sm" data-addstep="' + k + '">' + icon(STEP[k].ic) + STEP[k].label + '</button>').join('') + '</div>' +
        '</form>',
      footer: (wf ? '<button type="button" class="k-btn is-danger is-outline" data-del>' + icon('trash') + 'Șterge</button>' : '') + '<span class="k-grow"></span>' +
        K.toggle('active', W.active, 'Activă') + '<button type="button" class="k-btn" data-cancel>Renunță</button><button type="button" class="k-btn is-primary" data-save>' + icon('check') + 'Salvează</button>',
      onMount(el) {
        const trigBox = el.querySelector('[data-trig]');
        const stepsBox = el.querySelector('[data-steps]');
        const paintTrig = () => {
          const t = W.trigger;
          const sel = '<select data-t="type">' + K.options(meta.triggers.map((x) => [x.id, x.label]), t.type) + '</select>';
          let extra = '';
          if (t.type === 'lead_created') extra = '<select data-t="source">' + K.options(meta.sources.map((s) => [s, SOURCE[s] || s]), t.source || 'any') + '</select>';
          if (t.type === 'stage_changed') extra = '<select data-t="stage">' + K.options([['', 'Alege etapa…']].concat(meta.stages.map((s) => [s.id, s.name])), t.stage || '') + '</select>';
          if (t.type === 'lead_idle') extra = '<div class="au-inline"><input type="number" min="1" max="720" data-t="hours" value="' + esc(t.hours || 2) + '"><span>ore fără niciun contact</span></div>';
          if (t.type === 'appointment_before') extra = '<div class="au-inline"><input type="number" min="1" max="168" data-t="hours" value="' + esc(t.hours || 24) + '"><span>ore înainte de ora programării</span></div>';
          if (t.type === 'appointment_after') extra = '<div class="au-inline"><input type="number" min="0" max="365" data-t="days" value="' + esc(t.days == null ? 1 : t.days) + '"><span>zile după ce e marcată „Finalizată”</span></div>';
          if (t.type === 'appointment_status') extra = '<select data-t="status">' + K.options([['', 'Alege statusul…']].concat(meta.statuses.map((s) => [s, STATUS[s]])), t.status || '') + '</select>';
          const loc = t.type === 'stage_changed' || t.type === 'lead_idle' ? '' : '<select data-t="location">' + K.options(meta.locations.map((l) => [l, l === 'any' ? 'Ambele locații' : l]), t.location || 'any') + '</select>';
          trigBox.innerHTML = '<div class="au-trig-row">' + sel + extra + loc + '</div><p class="au-hint">' + icon('info') + esc(trigHint(t)) + '</p>';
        };
        const paintSteps = () => {
          const v = sample(W.trigger);
          stepsBox.innerHTML = W.steps.map((s, i) => {
            const st = STEP[s.type];
            let body = '';
            if (s.type === 'wait') body = '<div class="au-inline"><input type="number" min="1" max="999" data-s="amount" value="' + esc(s.amount || 1) + '"><select data-s="unit">' + K.options(Object.keys(UNIT).map((u) => [u, UNIT[u]]), s.unit || 'h') + '</select></div>';
            if (s.type === 'stop_if') body = '<select data-s="cond">' + K.options(Object.keys(COND).filter((c) => isLeadT() ? !c.startsWith('appt') : !['contacted', 'booked'].includes(c)).map((c) => [c, COND[c]]), s.cond) + '</select>';
            if (s.type === 'move_stage') body = '<select data-s="stage">' + K.options([['', 'Alege etapa…']].concat(meta.stages.map((x) => [x.id, x.name])), s.stage || '') + '</select>';
            if (s.type === 'whatsapp' || s.type === 'task') {
              body = '<textarea rows="' + (s.type === 'whatsapp' ? 4 : 2) + '" data-s="text" maxlength="' + (s.type === 'whatsapp' ? 1000 : 300) + '" placeholder="' + (s.type === 'whatsapp' ? 'Mesajul către client…' : 'Ce trebuie să facă recepția…') + '">' + esc(s.text || '') + '</textarea>' +
                '<div class="au-vars-chips">' + VARS.map(([k, l]) => '<button type="button" data-var="{' + k + '}" title="' + esc(l) + '">{' + k + '}</button>').join('') + '</div>' +
                (s.type === 'whatsapp' ? '<div class="au-preview"><span>' + icon('eye') + 'Așa îl primește clientul</span><div class="au-bubble" data-prev>' + renderMsg(s.text, v) + '</div></div>' +
                  '<details class="au-adv"' + (s.template ? ' open' : '') + '><summary>Șablon Meta (pentru trimiterea automată)</summary><input data-s="template" value="' + esc(s.template || '') + '" placeholder="numele șablonului aprobat, ex. reminder_programare" maxlength="80"><small>Variabilele din mesaj se trimit, în ordine, ca {{1}}, {{2}} … ale șablonului. Fără WhatsApp automat, câmpul e ignorat.</small></details>' : '');
            }
            return '<div class="au-step is-' + s.type + '" data-i="' + i + '"><div class="au-step-rail"><span class="au-step-ic">' + icon(st.ic) + '</span></div><div class="au-step-card"><div class="au-step-head"><b>' + (i + 1) + '. ' + st.label + '</b><span class="k-grow"></span>' +
              '<button type="button" class="k-icon-btn" data-mv="-1" title="Mută sus"' + (i === 0 ? ' disabled' : '') + '>' + icon('up') + '</button><button type="button" class="k-icon-btn" data-mv="1" title="Mută jos"' + (i === W.steps.length - 1 ? ' disabled' : '') + '>' + icon('down') + '</button><button type="button" class="k-icon-btn" data-rm title="Șterge pasul">' + icon('trash') + '</button></div>' + body + '</div></div>';
          }).join('') || '<div class="au-empty-steps">' + icon('info') + 'Adaugă primul pas de mai jos.</div>';
          el.querySelectorAll('[data-addstep]').forEach((b) => { b.disabled = W.steps.length >= 12 || (b.dataset.addstep === 'move_stage' && !isLeadT()); });
        };
        paintTrig(); paintSteps();
        let lastTa = null;
        el.addEventListener('focusin', (ev) => { if (ev.target.dataset && ev.target.dataset.s === 'text') lastTa = ev.target; });
        el.addEventListener('input', (ev) => {
          const f = ev.target;
          const row = f.closest('[data-i]');
          if (row && f.dataset.s) {
            const s = W.steps[+row.dataset.i];
            s[f.dataset.s] = f.type === 'number' ? Number(f.value) : f.value;
            const prev = row.querySelector('[data-prev]');
            if (prev && f.dataset.s === 'text') prev.innerHTML = renderMsg(f.value, sample(W.trigger));
          }
        });
        el.addEventListener('change', (ev) => {
          const f = ev.target;
          if (f.dataset.t) {
            W.trigger[f.dataset.t] = f.type === 'number' ? Number(f.value) : f.value;
            if (f.dataset.t === 'type') {
              W.trigger = { type: f.value, location: 'any' };
              if (!isLeadT()) W.steps = W.steps.filter((s) => s.type !== 'move_stage' && !['contacted', 'booked'].includes(s.cond));
              else W.steps = W.steps.filter((s) => !String(s.cond || '').startsWith('appt'));
              paintTrig(); paintSteps();
            } else paintTrig();
            return;
          }
          const row = f.closest('[data-i]');
          if (row && f.dataset.s) W.steps[+row.dataset.i][f.dataset.s] = f.type === 'number' ? Number(f.value) : f.value;
        });
        el.addEventListener('click', (ev) => {
          const b = ev.target;
          const add = b.closest('[data-addstep]');
          if (add) {
            const type = add.dataset.addstep;
            W.steps.push(type === 'wait' ? { type, amount: 1, unit: 'h' } : type === 'stop_if' ? { type, cond: isLeadT() ? 'contacted' : 'appt_inactive' } : type === 'move_stage' ? { type, stage: '' } : { type, text: type === 'whatsapp' ? 'Bună, {prenume}! ' : '' });
            paintSteps();
            const last = stepsBox.querySelector('[data-i]:last-child');
            if (last) { last.scrollIntoView({ block: 'nearest', behavior: 'smooth' }); const f = last.querySelector('textarea, input, select'); if (f) f.focus({ preventScroll: true }); }
            return;
          }
          const vbtn = b.closest('[data-var]');
          if (vbtn) {
            const ta = vbtn.closest('.au-step-card').querySelector('textarea');
            const pos = ta === lastTa && ta.selectionStart != null ? ta.selectionStart : ta.value.length;
            ta.value = ta.value.slice(0, pos) + vbtn.dataset.var + ta.value.slice(ta.selectionEnd != null && ta === lastTa ? ta.selectionEnd : pos);
            ta.focus(); ta.selectionStart = ta.selectionEnd = pos + vbtn.dataset.var.length;
            ta.dispatchEvent(new Event('input', { bubbles: true }));
            return;
          }
          const row = b.closest('[data-i]');
          if (row && b.closest('[data-rm]')) { W.steps.splice(+row.dataset.i, 1); paintSteps(); return; }
          const mv = b.closest('[data-mv]');
          if (row && mv) { const i = +row.dataset.i, j = i + Number(mv.dataset.mv); [W.steps[i], W.steps[j]] = [W.steps[j], W.steps[i]]; paintSteps(); }
        });
        el.querySelector('[data-cancel]').addEventListener('click', () => d.close());
        const del = el.querySelector('[data-del]');
        if (del) del.addEventListener('click', async () => {
          if (!(await K.ui().confirm({ title: 'Ștergi „' + wf.name + '”?', message: 'Rulările programate ale ei se opresc. Sarcinile deja create rămân.', confirmText: 'Șterge', danger: true }))) return;
          try { S.d = await K.api('/api/portal-workflows', { action: 'delete', id: wf.id }); d.close(); render(); K.ui().toast('Automatizare ștearsă.', 'success'); }
          catch (err) { K.ui().toast(K.errText(err), 'error'); }
        });
        el.querySelector('[data-save]').addEventListener('click', (ev) => K.busy(ev.currentTarget, async () => {
          W.name = el.querySelector('input[name=name]').value.trim();
          W.active = el.querySelector('input[name=active]').checked;
          if (!W.name) { K.ui().toast(ERR.missing_name, 'error'); return; }
          try {
            S.d = await K.api('/api/portal-workflows', { action: 'save', workflow: Object.assign({}, W, wf ? { id: wf.id } : {}) });
            d.close(); render(); K.ui().toast(wf ? 'Salvat.' : 'Automatizare creată' + (W.active ? ' și pornită.' : '.'), 'success');
          } catch (err) { K.ui().toast(ERR[err.code] || K.errText(err), 'error'); }
        }));
      },
    });
  }
  function trigHint(t) {
    return ({
      lead_created: 'Pornește când intră un lead nou — din formularul Facebook, de pe site sau adăugat de recepție.',
      stage_changed: 'Pornește când cineva (sau altă automatizare) mută leadul în etapa aleasă din Pipeline.',
      lead_idle: 'Verifică după atâtea ore: dacă nimeni n-a contactat leadul, face pașii. Dacă a fost sunat, nu face nimic.',
      appointment_created: 'Pornește imediat ce se face o programare (din Calendar sau din Pipeline).',
      appointment_before: 'Rulează la ora potrivită înainte de programare. Dacă programarea se mută, se recalculează singur.',
      appointment_status: 'Pornește când programarea primește statusul ales.',
      appointment_after: 'Pornește după ce programarea e marcată „Finalizată” — pentru recenzii, revenire, upsell.',
    })[t.type] || '';
  }

  K.section('fluxuri', { mount, show: load });
})();
