// Centrul360 portal, work: "Sarcini" (the receptionist's list) and "Oferte" (the team's view of
// the live offers). Sarcini: every message to send with the WhatsApp text already written (from
// the automations) plus the to-dos she adds herself ("Adaugă sarcină"); one tap to send, one tap
// to tick off. Oferte: the same list as the website, read-only, with a copy button for WhatsApp.
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
    // From Admin → Automatizări: the message text comes already written by the flow.
    whatsapp: { label: 'WhatsApp', ic: 'chat', tone: 'good', msg: 'flow' },
    sarcina: { label: 'De făcut', ic: 'listCheck', tone: 'accent', msg: '' },
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
      '<div class="k-head"><div><div class="k-eyebrow">Clinică</div><h2>Sarcini</h2><p class="k-lede">Ce ai de făcut azi: mesajele de trimis (textul e deja scris) și sarcinile adăugate de tine.</p></div>' +
      '<div class="k-head-actions"><button type="button" class="k-btn is-outline" data-act="refresh">' + icon('refresh') + 'Actualizează</button>' +
      '<button type="button" class="k-btn is-accent" data-act="add">' + icon('plus') + 'Adaugă sarcină</button></div></div>' +
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
    if (ty.msg === 'flow' || t.type === 'sarcina') return flowTaskHtml(t, ty);
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
  // A task an automation created: its own title (the flow's name), message and phone.
  function flowTaskHtml(t, ty) {
    const a = t.appointment;
    const phone = t.phone || (a && a.clientPhone) || '';
    const msg = t.message || '';
    return '<article class="wk-task" data-task="' + esc(t.id) + '"><span class="k-icon-chip is-' + ty.tone + '">' + icon(ty.ic) + '</span>' +
      '<div class="wk-task-main"><div class="wk-task-top"><b>' + esc(t.clientName || (a && a.clientName) || ty.label) + '</b><span class="k-tag is-' + ty.tone + '">' + icon('zap') + esc(t.title || ty.label) + '</span>' +
        (t.location ? '<span class="k-tag">' + icon('pin') + esc(t.location) + '</span>' : '') +
        (!phone && msg ? '<span class="k-tag is-warn">' + icon('alert') + 'fără telefon</span>' : '') + '</div>' +
      '<div class="wk-task-sub">' + (a ? esc(K.relDay(a.date) + ' · ' + (a.time || 'fără oră') + ' · ' + (a.treatment || '')) : msg ? '' : esc(t.text)) + '</div>' +
      (msg ? '<div class="wk-msg">' + esc(msg) + '</div>' : '') + '</div>' +
      '<div class="wk-task-actions">' +
        (phone && msg ? '<a class="k-btn is-sm wk-wa" target="_blank" rel="noopener" data-sent="' + esc(t.id) + '" href="' + K.wa(phone, msg) + '">' + icon('chat') + 'WhatsApp</a>' : '') +
        (phone ? '<a class="k-icon-btn" href="' + K.tel(phone) + '" title="Sună">' + icon('phone') + '</a>' : '') +
        (t.relatedLeadId ? '<button type="button" class="k-icon-btn" data-lead="' + esc(t.relatedLeadId) + '" title="Deschide leadul">' + icon('user') + '</button>' : '') +
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
    if (t.closest('[data-act="add"]')) return addTask();
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
    const lead = t.closest('[data-lead]');
    if (lead) { K.go('pipeline'); setTimeout(() => window.C360Pipeline && window.C360Pipeline.openLead(lead.dataset.lead), 350); return; }
    const open = t.closest('[data-open]');
    if (open) { K.go('programari'); setTimeout(() => K.emit('calendar:open', { id: open.dataset.open, date: open.dataset.date }), 250); }
  }
  // The receptionist's own to-do: what, optionally for which client (call / WhatsApp in one tap), when.
  function addTask() {
    const d = K.drawer({
      title: 'Sarcină nouă', icon: 'listCheck', width: 520,
      body: '<form class="k-form" data-form>' +
        K.field('Ce trebuie făcut', '<textarea name="text" rows="3" maxlength="500" required autofocus placeholder="ex: Sună-o pe Maria pentru programarea de la HIFU"></textarea>', 'full') +
        K.field('Când', K.seg('when', [['today', 'Azi'], ['tomorrow', 'Mâine'], ['date', 'Altă zi']], 'today', 'is-big'), 'full') +
        '<label class="k-field full" data-date hidden><span>Data</span><input name="dueDate" type="date" value="' + K.addDays(K.today(), 2) + '"></label>' +
        K.field('Clientă (opțional)', '<input name="clientName" maxlength="150" placeholder="Caută sau scrie">') +
        K.field('Telefon (opțional)', '<input name="phone" type="tel" maxlength="30">') +
        '</form>',
      footer: '<span class="k-grow"></span><button type="button" class="k-btn" data-cancel>Renunță</button><button type="button" class="k-btn is-accent" data-save>' + icon('check') + 'Adaugă</button>',
      onMount(el) {
        const f = el.querySelector('[data-form]');
        K.clientPicker(f.clientName, f.phone);
        f.addEventListener('change', (e) => { if (e.target.name === 'when') el.querySelector('[data-date]').hidden = e.target.value !== 'date'; });
        el.querySelector('[data-cancel]').addEventListener('click', () => d.close());
        el.querySelector('[data-save]').addEventListener('click', (e) => K.busy(e.currentTarget, async () => {
          const v = K.formValues(f);
          if (!v.text) { K.ui().toast('Scrie ce trebuie făcut.', 'error'); f.text.focus(); return; }
          const due = v.when === 'tomorrow' ? K.addDays(K.today(), 1) : v.when === 'date' ? v.dueDate : K.today();
          try {
            await K.api('/api/portal-automation-tasks', { action: 'create', text: v.text, dueDate: due, clientName: v.clientName, phone: v.phone });
            d.close();
            K.ui().toast(due === K.today() ? 'Sarcină adăugată.' : 'Sarcină adăugată pentru ' + K.relDay(due).toLowerCase() + '.', 'success');
            loadTasks();
          } catch (err) { K.ui().toast(K.errText(err), 'error'); }
        }));
      },
    });
  }

  K.section('automatizari', { mount: mountTasks, show: loadTasks });
  K.on('remote', () => { if (tpanel && K.isActive('automatizari')) loadTasks(); });

  // =====================================================================================
  // OFERTE (team view)
  // =====================================================================================
  let opanel, oq = '';
  function offersHtml() {
    const q = K.norm(oq);
    const offers = ((K.data && K.data.offers) || []).filter((o) => !q || K.norm(o.title + ' ' + o.description).includes(q));
    if (!offers.length) return K.empty('tag', q ? 'Nimic pentru „' + oq + '”' : 'Nicio ofertă activă', '');
    const loc = { timisoara: 'Timișoara', arad: 'Arad' };
    return '<div class="rs-offers">' + offers.map((o) => {
      const lines = String(o.description || '').split('\n').filter(Boolean);
      const pitch = o.title + ': ' + o.priceNew + ' lei' + (o.priceOld > o.priceNew ? ' în loc de ' + o.priceOld + ' lei' : '') + (lines[0] ? '. ' + lines[0] : '');
      return '<article class="rs-offer"><header><b>' + esc(o.title) + '</b>' + (o.discountPercent ? '<span class="k-tag is-accent">-' + o.discountPercent + '%</span>' : '') + '</header>' +
        '<div class="rs-price"><b>' + K.lei(o.priceNew) + '</b>' + (o.priceOld > o.priceNew ? '<s>' + K.lei(o.priceOld) + '</s>' : '') + '</div>' +
        (lines.length ? '<ul>' + lines.map((l) => '<li>' + esc(l) + '</li>').join('') + '</ul>' : '') +
        '<footer>' + (o.locations || []).map((l) => '<span class="k-tag">' + icon('pin') + loc[l] + '</span>').join('') + (o.guarantee ? '<span class="k-tag is-good">' + icon('shield') + 'Garanția banilor înapoi</span>' : '') +
        '<button type="button" class="k-icon-btn" data-copy="' + esc(pitch) + '" title="Copiază pentru WhatsApp">' + icon('copy') + '</button></footer></article>';
    }).join('') + '</div>';
  }
  function mountOffers(p) {
    opanel = p;
    opanel.classList.add('k-panel', 'rs');
    opanel.innerHTML = '<div class="k-head"><div><div class="k-eyebrow">Echipă</div><h2>Oferte</h2><p class="k-lede">Ofertele active, la fel ca pe site. Prețurile de aici sunt singurele corecte.</p></div>' +
      '<div class="k-head-actions"><label class="k-search">' + icon('search') + '<input data-q placeholder="Caută o ofertă…"></label></div></div><div data-body></div>';
    opanel.querySelector('[data-q]').addEventListener('input', (e) => { oq = e.target.value.trim(); renderOffers(); });
    opanel.addEventListener('click', (e) => { const cp = e.target.closest('[data-copy]'); if (cp) K.copy(cp.dataset.copy); });
  }
  function renderOffers() { if (opanel) opanel.querySelector('[data-body]').innerHTML = '<p class="rs-hint">' + icon('info') + 'Aceeași listă ca pe site. Se actualizează singură când administratorul schimbă o ofertă.</p>' + offersHtml(); }
  K.section('ofertele', { mount: mountOffers, show: renderOffers, data() { if (opanel && K.isActive('ofertele')) renderOffers(); } });
})();
