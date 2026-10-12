// Centrul360 portal - Admin → Automatizări: GoHighLevel-style flows. One trigger ("Programare nouă",
// "Lead nou din reclamă", "Cu 24h înainte" …), then steps (wait, WhatsApp, task for reception, move
// the lead, alert the team, if / else, stop if …). Each flow is a card you can read at a glance; a click
// opens it on the canvas editor (portal-builder.js). The engine itself lives in api/_lib/workflows.js.
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
    notify: { ic: 'bell', label: 'Anunță echipa', tone: 'accent' },
    if: { ic: 'filter', label: 'Dacă / Altfel', tone: 'warn' },
  };
  const ROLE = { admin: 'Admin', receptie: 'Recepție', cosmetician: 'Cosmeticiene' };
  const COND = {
    contacted: 'leadul a fost contactat', booked: 'leadul are programare', appt_inactive: 'programarea e anulată / finalizată',
    appt_confirmed: 'programarea e confirmată', future_appt: 'clientul are deja o programare viitoare',
  };
  const STATUS = { programata: 'Programată', confirmata: 'Confirmată', anulata: 'Anulată', reprogramata: 'Reprogramată', finalizata: 'Finalizată' };
  const SOURCE = { any: 'Orice sursă', facebook: 'Reclamă Facebook', instagram: 'Instagram', site: 'Site', telefon: 'Telefon', recomandare: 'Recomandare', 'walk-in': 'Walk-in', manual: 'Adăugat manual' };
  const UNIT = { min: 'minute', h: 'ore', d: 'zile' };

  const S = { d: null, tab: 'flows', loading: false };
  let panel;

  const trigText = (t, meta) => {
    if (!t) return '';
    if (t.type === 'lead_created') return 'Lead nou' + (t.interest && t.interest !== 'any' ? ': ' + t.interest : '') + (t.source && t.source !== 'any' ? ' din ' + (SOURCE[t.source] || t.source).toLowerCase() : '') + (t.location && t.location !== 'any' ? ' · ' + t.location : '');
    if (t.type === 'stage_changed') return 'Lead mutat în „' + ((meta.stages.find((s) => s.id === t.stage) || {}).name || t.stage) + '”';
    if (t.type === 'lead_idle') return 'Lead nesunat ' + t.hours + 'h';
    if (t.type === 'appointment_before') return 'Cu ' + (t.hours % 24 === 0 ? (t.hours / 24 === 1 ? 'o zi' : t.hours / 24 + ' zile') : t.hours + 'h') + ' înainte de programare';
    if (t.type === 'appointment_after') return t.days === 0 ? 'În ziua tratamentului' : 'La ' + (t.days === 1 ? 'o zi' : t.days + ' zile') + ' după tratament';
    if (t.type === 'appointment_status') return 'Programare devenită „' + (STATUS[t.status] || t.status) + '”';
    return (TRIG[t.type] || {}).label || t.type;
  };
  const stepText = (s, meta) => {
    if (s.type === 'wait') return s.amount + ' ' + UNIT[s.unit];
    if (s.type === 'stop_if' || s.type === 'if') {
      const c = ({ interest: 'procedura e ', location: 'orașul e ', source: 'sursa e ' })[s.cond];
      const t = c ? c + (s.value || '…') : (COND[s.cond] || s.cond);
      if (s.type === 'stop_if') return t;
      const n = (function cnt(l) { return (l || []).reduce((a, x) => a + 1 + (x.type === 'if' ? cnt(x.yes) + cnt(x.no) : 0), 0); })((s.yes || []).concat(s.no || []));
      return 'Dacă ' + t + (n ? ' (+' + n + ' în ramuri)' : '');
    }
    if (s.type === 'notify') return 'Către ' + (s.to || []).map((x) => (x.startsWith('role:') ? ROLE[x.slice(5)] : ((meta.team || []).find((p) => 'emp:' + p.id === x) || { name: '?' }).name)).join(', ');
    if (s.type === 'move_stage') return '→ ' + ((meta.stages.find((x) => x.id === s.stage) || {}).name || s.stage);
    return String(s.text || '').replace(/\s+/g, ' ').slice(0, 70) + (String(s.text || '').length > 70 ? '…' : '');
  };

  // ------------------------------------------------------------------ page
  function mount(p) {
    panel = p;
    panel.classList.add('k-panel', 'au');
    panel.innerHTML =
      '<div class="k-head"><div><div class="k-eyebrow">Admin</div><h2>Automatizări</h2><p class="k-lede">Ce se întâmplă singur: confirmări, remindere, mesaje către leadurile din reclame, sarcini pentru recepție. Un declanșator, apoi pașii, ca în GoHighLevel.</p></div>' +
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
          (meta.whatsappCloud ? 'Mesajele pleacă singure prin WhatsApp Business. Dacă Meta refuză unul, devine sarcină.' : 'Mesajele apar în Sarcini, deja scrise, recepția apasă WhatsApp și trimite. <a href="#" data-act="wa-guide">Activează trimiterea automată</a>') + '</span></div></div>' +
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
          '<label class="k-switch" data-stop title="' + (w.active ? 'Activă, apasă ca s-o oprești' : 'Oprită, apasă ca s-o pornești') + '"><input type="checkbox" data-toggle="' + esc(w.id) + '"' + (w.active ? ' checked' : '') + '><i></i></label></div>' +
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
      if (a === 'fb') { e.preventDefault(); return K.go('integrari'); }
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
      subtitle: 'Automatizările care aduc bani într-o clinică. Se adaugă oprite, le verifici textul și le pornești.',
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
  // The flow itself is edited on a canvas, like in GoHighLevel (portal-builder.js).
  function openEditor(wf) {
    K.flowBuilder.open(wf, {
      meta: S.d.meta, settings: S.d.settings,
      list: () => S.d.workflows,
      onSaved(d) { S.d = d; render(); },
    });
  }
  K.section('fluxuri', { mount, show: load });
})();
