// Centrul360 portal - Admin → Integrări → Formulare Facebook: every Facebook lead form of the connected Page in one
// place. Per form: whether it's active, how many leads it brought (on Facebook and in the
// Pipeline), when the last one came, the procedure and city its leads get (set here, or read
// from the form's name), its questions as written in the form, and a jump to its leads. "Formular nou"
// makes a new form on the Page through Meta (api/_lib/fb-form-create.js).
// Data: /api/portal-integrations (the list comes from the minute's look at the forms, _lib/fb-leads.js).
(function () {
  'use strict';
  const K = window.K;
  const { esc, icon } = K;
  const F = { d: null, q: '', show: 'active', open: null, limit: 40 };
  let panel;

  // mounted inside Integrări (its "Formulare Facebook" tab, see portal-admin.js)
  function mount(p) {
    panel = p;
    panel.classList.add('fm');
    panel.innerHTML =
      '<div data-body><div class="k-skel" style="height:120px;margin-bottom:1rem"></div><div class="k-skel" style="height:360px"></div></div>';
    panel.addEventListener('click', onClick);
    panel.addEventListener('change', onChange);
    panel.addEventListener('input', (e) => { if (e.target.matches('[data-q]')) { F.q = e.target.value; F.limit = 40; paintList(); } });
  }
  async function load() {
    try { F.d = await K.api('/api/portal-integrations'); render(); }
    catch (e) { panel.querySelector('[data-body]').innerHTML = K.empty('alert', 'Nu am putut încărca formularele', 'Verifică conexiunea și reîncearcă.', '<button type="button" class="k-btn is-primary" data-act="reload">Reîncearcă</button>'); }
  }

  const offerName = (id) => ((F.d.offers || []).find((o) => o.id === id) || {}).title || '';
  const fold = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
  function visible() {
    const q = fold(F.q);
    return (F.d.fbForms || []).filter((f) => {
      if (F.show === 'active' && f.status && f.status !== 'ACTIVE') return false;
      if (F.show === 'archived' && (!f.status || f.status === 'ACTIVE')) return false;
      if (F.show === 'leads' && !f.leads) return false;
      return !q || fold(f.name).includes(q);
    });
  }

  function render() {
    const all = F.d.fbForms || [];
    const active = all.filter((f) => !f.status || f.status === 'ACTIVE').length;
    const withLeads = all.filter((f) => f.leads).length;
    if (!all.length) {
      panel.querySelector('[data-body]').innerHTML = K.empty('facebook', 'Niciun formular încă', 'Formularele apar aici la un minut după ce Facebook e conectat (Integrări → Facebook).', '<button type="button" class="k-btn is-primary" data-act="new">' + icon('plus') + 'Formular nou</button>');
      return;
    }
    panel.querySelector('[data-body]').innerHTML =
      '<div class="fm-bar"><label class="fm-search">' + icon('search') + '<input data-q type="search" placeholder="Caută un formular…" value="' + esc(F.q) + '"></label>' +
        '<div class="k-chips">' + [['active', 'Active', active], ['leads', 'Cu leaduri în portal', withLeads], ['archived', 'Arhivate', all.length - active], ['all', 'Toate', all.length]]
          .map(([k, l, n]) => '<button type="button" class="k-chip' + (F.show === k ? ' is-on' : '') + '" data-show="' + k + '">' + l + '<span>' + n + '</span></button>').join('') + '</div>' +
        '<button type="button" class="k-btn is-outline fm-new" data-act="settings">' + icon('sliders') + 'Setări formulare</button>' +
        '<button type="button" class="k-btn is-outline fm-new" data-act="renumber">' + icon('phone') + 'Numere noi la final</button>' +
        '<button type="button" class="k-btn is-accent fm-new" data-act="new">' + icon('plus') + 'Formular nou</button>' +
        '<button type="button" class="k-icon-btn fm-reload" data-act="reload" title="Actualizează">' + icon('refresh') + '</button></div>' +
      '<div class="fm-list" data-list></div>';
    paintList();
  }
  function paintList() {
    const box = panel.querySelector('[data-list]');
    if (!box) return;
    const list = visible();
    box.innerHTML = list.length ? list.slice(0, F.limit).map(rowHtml).join('') +
        (list.length > F.limit ? '<button type="button" class="k-btn is-outline fm-more" data-more>Arată încă ' + Math.min(40, list.length - F.limit) + ' din ' + (list.length - F.limit) + '</button>' : '')
      : K.empty('search', 'Niciun formular aici', 'Schimbă filtrul sau căutarea.');
  }
  function rowHtml(f) {
    const det = f.detected || {};
    const autoOffer = det.offerId && offerName(det.offerId) ? 'Automat: ' + offerName(det.offerId) : 'Automat (din numele formularului)';
    const autoCity = (det.location || 'automat') + (det.location ? ' (auto)' : '');
    const open = F.open === f.id;
    const archived = f.status && f.status !== 'ACTIVE';
    return '<article class="k-card fm-row' + (open ? ' is-open' : '') + '" data-form="' + esc(f.id) + '">' +
      '<div class="fm-top"><span class="k-icon-chip fm-ic">' + icon('facebook') + '</span>' +
        '<div class="fm-name"><b>' + esc(f.name || 'Formular ' + f.id) + '</b><small>' +
          [archived ? 'arhivat' : 'activ', f.fbLeads ? K.plural(f.fbLeads, 'lead pe Facebook', 'leaduri pe Facebook') : '', f.leads ? K.plural(f.leads, 'în portal', 'în portal') : '', f.lastAt ? 'ultimul ' + K.ago(f.lastAt) : ''].filter(Boolean).map(esc).join(' · ') + '</small></div>' +
        (f.leads ? '<button type="button" class="k-btn is-ghost is-sm" data-leads="' + esc(f.name) + '">' + icon('users') + 'Vezi leadurile</button>' : '') +
        '<button type="button" class="k-icon-btn" data-toggle-form aria-label="Detalii formular">' + icon(open ? 'up' : 'down') + '</button></div>' +
      '<div class="fm-set"><label><span>Procedura</span><select data-ff="offerId">' + K.options([['', autoOffer]].concat((F.d.offers || []).map((o) => [o.id, o.title])), f.offerId) + '</select></label>' +
        '<label><span>Orașul</span><select data-ff="location">' + K.options([['', autoCity], ['Timișoara', 'Timișoara'], ['Arad', 'Arad']], f.location) + '</select></label></div>' +
      (open ? '<div class="fm-q">' + (f.questions
        ? (f.questions.length ? '<b>Întrebările din formular</b><ol>' + f.questions.map((q) => '<li>' + esc(q.label) + (q.options && q.options.length ? '<small>' + q.options.map(esc).join(' · ') + '</small>' : '') + '</li>').join('') + '</ol>' : '<p class="k-muted">Formularul n-are întrebări în afară de datele de contact.</p>')
        : '<p class="k-muted">Întrebările nu sunt încă citite.</p><button type="button" class="k-btn is-outline is-sm" data-info>' + icon('download') + 'Citește întrebările de pe Facebook</button>') + '</div>' : '') +
      '</article>';
  }

  async function onClick(e) {
    const t = e.target;
    if (t.closest('[data-act="reload"]')) return load();
    if (t.closest('[data-act="new"]')) return openCreate();
    if (t.closest('[data-act="settings"]')) return openSettings();
    if (t.closest('[data-act="renumber"]')) return openRenumber();
    if (t.closest('[data-act="integrari"]')) return K.emit('integrari:int');
    const sh = t.closest('[data-show]');
    if (sh) { F.show = sh.dataset.show; F.limit = 40; return render(); }
    if (t.closest('[data-more]')) { F.limit += 40; return paintList(); }
    const row = t.closest('[data-form]');
    if (!row) return;
    const id = row.dataset.form;
    const lb = t.closest('[data-leads]');
    if (lb) {
      K.go('pipeline');
      setTimeout(() => window.C360Pipeline && window.C360Pipeline.search && window.C360Pipeline.search(lb.dataset.leads), 400);
      return;
    }
    if (t.closest('[data-toggle-form]')) { F.open = F.open === id ? null : id; return paintList(); }
    const info = t.closest('[data-info]');
    if (info) {
      return K.busy(info, async () => {
        try { F.d = await K.api('/api/portal-integrations', { action: 'fb_form_info', id }); paintList(); }
        catch (err) { K.ui().toast(K.errText(err), 'error'); }
      });
    }
  }
  async function onChange(e) {
    const row = e.target.closest('[data-form]');
    if (!row || !e.target.dataset.ff) return;
    const v = (k) => row.querySelector('[data-ff="' + k + '"]').value;
    try {
      F.d = await K.api('/api/portal-integrations', { action: 'fb_form', id: row.dataset.form, offerId: v('offerId'), location: v('location') });
      K.ui().toast('Salvat. Leadurile noi din formular vin așa.', 'success');
    } catch (err) { K.ui().toast(K.errText(err), 'error'); }
  }

  // ------------------------------------------------------------------ a new form ("Formular nou")
  // What matters on a form: its name, its city (the WhatsApp number of the button at the end follows it,
  // so the clients write to the right clinic), the contact data asked, the three screening questions with
  // their answers, the ending. The ending, the button and the numbers come from "Setări formulare",
  // copied from the forms that already run (api/_lib/fb-form-template.js).
  const CITY_SHORT = { 'Timișoara': 'TM', Arad: 'AR' };
  const FIELDS = [['FULL_NAME', 'Nume complet'], ['FIRST_NAME', 'Prenume'], ['LAST_NAME', 'Nume de familie'], ['PHONE', 'Telefon'], ['EMAIL', 'E-mail'], ['CITY', 'Oraș'], ['DOB', 'Data nașterii']];
  const FIELD_LABEL = Object.fromEntries(FIELDS);
  const dayMonth = () => { const d = new Date(); return String(d.getDate()).padStart(2, '0') + '.' + String(d.getMonth() + 1).padStart(2, '0'); };
  const shortTitle = (t) => String(t || '').split(/\s*[·(]\s*/)[0].trim();
  async function template(refresh) {
    if (!F.tpl || refresh) F.tpl = (await K.api('/api/portal-integrations', { action: 'fb_form_template', refresh: !!refresh })).template;
    return F.tpl;
  }
  const errMsg = (err) => K.ui().toast(err.data && err.data.message ? err.data.message : K.errText(err), 'error');
  const fieldChips = (sel, attr) => '<div class="fm-chips">' + FIELDS.map(([k, l]) => '<label class="fm-chip' + (sel.includes(k) ? ' is-on' : '') + (k === 'PHONE' ? ' is-locked' : '') + '"><input type="checkbox" ' + attr + '="' + k + '"' + (sel.includes(k) ? ' checked' : '') + (k === 'PHONE' ? ' disabled' : '') + '><span>' + l + '</span></label>').join('') + '</div>';

  async function openCreate() {
    let t;
    try { t = await template(); } catch (err) { return errMsg(err); }
    const offers = (F.d && F.d.offers) || [];
    const st = {
      name: '', location: 'Timișoara', offerId: '', fields: (t.fields || ['FULL_NAME', 'PHONE']).slice(),
      questions: [0, 1, 2].map(() => ({ label: '', options: ['', ''] })),
      ending: { title: t.ending.title, body: t.ending.body, button: t.cta.text },
      intro: { on: !!t.intro, title: (t.intro && t.intro.title) || '', lines: ((t.intro && t.intro.lines) || []).join('\n'), button: (t.intro && t.intro.button) || 'Continuă' },
      headline: t.headline || '', quality: !!t.quality,
    };
    let touchedName = false;
    const offerOf = () => offers.find((o) => o.id === st.offerId) || null;
    const autoName = () => { if (!touchedName) st.name = ((offerOf() && shortTitle(offerOf().title)) || 'Formular') + ' ' + CITY_SHORT[st.location] + ' · ' + dayMonth(); };
    autoName();
    const wa = () => (t.cities[st.location] || {}).pretty || '';
    const forms = () => (F.d.fbForms || []).filter((f) => !f.status || f.status === 'ACTIVE');
    const get = (p) => p.split('.').reduce((o, k) => (o ? o[k] : ''), st);
    const set = (p, v) => { const ks = p.split('.'); const last = ks.pop(); ks.reduce((o, k) => o[k], st)[last] = v; };
    const inp = (p, ph, max) => '<input data-cf="' + p + '" value="' + esc(get(p)) + '" placeholder="' + esc(ph || '') + '"' + (max ? ' maxlength="' + max + '"' : '') + '>';
    const qHtml = (q, i) => '<div class="fm-sq" data-q="' + i + '"><label class="k-field full"><span>Întrebarea ' + (i + 1) + '</span><input data-ql value="' + esc(q.label) + '" maxlength="120" placeholder="ex. Ce zonă vrei să tratezi?"></label>' +
      '<div class="fm-ans">' + q.options.map((o, k) => '<div class="fm-an"><span>' + String.fromCharCode(65 + k) + '</span><input data-qo="' + k + '" value="' + esc(o) + '" maxlength="80" placeholder="Răspunsul ' + (k + 1) + '">' +
        (q.options.length > 2 ? '<button type="button" class="k-icon-btn" data-qo-rm="' + k + '" aria-label="Scoate răspunsul">' + icon('x') + '</button>' : '') + '</div>').join('') +
      (q.options.length < 10 ? '<button type="button" class="k-btn is-ghost is-sm" data-qo-add>' + icon('plus') + 'Răspuns</button>' : '') + '</div></div>';
    const formHtml = () => '<div class="k-form fm-cf">' +
      '<h4 class="fm-cf-h">' + icon('file') + 'Formularul</h4>' +
      K.field('Numele formularului', inp('name', '', 200), 'full') +
      '<div class="k-field full"><span>Orașul</span>' + K.seg('fmcity', [['Timișoara', 'Timișoara'], ['Arad', 'Arad']], st.location) +
        '<small class="fm-wa' + (wa() ? '' : ' is-bad') + '">' + icon('chat') + (wa() ? 'La final, butonul deschide WhatsApp pe <b>' + esc(wa()) + '</b> (' + esc(st.location) + ')' : 'Lipsește numărul de WhatsApp pentru ' + esc(st.location) + ': pune-l în Setări formulare') + '</small></div>' +
      K.field('Procedura', '<select data-cf="offerId">' + K.options([['', 'Din numele formularului (automat)']].concat(offers.map((o) => [o.id, o.title])), st.offerId) + '</select>', 'full') +
      '<h4 class="fm-cf-h">' + icon('users') + 'Datele cerute</h4>' +
      '<div class="k-field full">' + fieldChips(st.fields, 'data-fld') + '</div>' +
      '<h4 class="fm-cf-h">' + icon('listCheck') + 'Întrebările de selecție</h4>' +
      '<div class="k-field full fm-copy"><span>Copiază întrebările din</span><select data-copy-from>' + K.options([['', 'Alege un formular…']].concat(forms().map((f) => [f.id, f.name + (f.location ? ' · ' + f.location : '')])), '') + '</select></div>' +
      '<div class="fm-sqs">' + st.questions.map(qHtml).join('') + '</div>' +
      '<h4 class="fm-cf-h">' + icon('checkCircle') + 'Finalul</h4>' +
      K.field('Titlul', inp('ending.title', '', 60), 'full') +
      K.field('Textul', '<textarea data-cf="ending.body" rows="3">' + esc(st.ending.body) + '</textarea>', 'full') +
      K.field('Butonul (WhatsApp)', inp('ending.button', 'Scrie-ne pe WhatsApp', 30), 'full') +
      '<details class="fm-more"' + (st.intro.on ? ' open' : '') + '><summary>Mai mult: prima pagină, titlul întrebărilor</summary><div class="k-form">' +
        '<label class="fb-check is-row full"><input type="checkbox" data-cf="intro.on"' + (st.intro.on ? ' checked' : '') + '><span>Are o primă pagină</span></label>' +
        (st.intro.on ? K.field('Titlul primei pagini', inp('intro.title', '', 60), 'full') + K.field('Rândurile', '<textarea data-cf="intro.lines" rows="3" placeholder="Câte unul pe rând">' + esc(st.intro.lines) + '</textarea>', 'full') + K.field('Butonul', inp('intro.button', 'Continuă', 30), 'full') : '') +
        K.field('Titlul paginii cu întrebări', inp('headline', '', 60), 'full') +
        '<label class="fb-check is-row full"><input type="checkbox" data-cf="quality"' + (st.quality ? ' checked' : '') + '><span>Leaduri mai atente<small>Clienta își confirmă datele înainte să trimită: mai puține leaduri, dar mai bune.</small></span></label>' +
      '</div></details>' +
      '</div>';
    const preview = () => {
      const lines = st.intro.lines.split('\n').map((x) => x.trim()).filter(Boolean);
      return '<div class="fm-pv">' +
        (st.intro.on ? '<div class="fm-pv-card"><small>Prima pagină</small><b>' + esc(st.intro.title || st.name) + '</b>' + (lines.length ? '<ul>' + lines.map((l) => '<li>' + esc(l) + '</li>').join('') + '</ul>' : '') + '<span class="fm-pv-btn">' + esc(st.intro.button || 'Continuă') + '</span></div>' : '') +
        '<div class="fm-pv-card"><small>Întrebările</small>' + (st.headline ? '<b>' + esc(st.headline) + '</b>' : '') +
          st.fields.map((f) => '<span class="fm-pv-in">' + esc(FIELD_LABEL[f] || f) + '</span>').join('') +
          st.questions.map((q, i) => '<span class="fm-pv-q">' + esc(q.label || 'Întrebarea ' + (i + 1)) + '</span>' + q.options.filter((o) => o.trim()).map((o) => '<span class="fm-pv-opt">' + esc(o) + '</span>').join('')).join('') +
          '<span class="fm-pv-btn">Trimite</span></div>' +
        '<div class="fm-pv-card"><small>Finalul</small><b>' + esc(st.ending.title) + '</b><p>' + esc(st.ending.body) + '</p><span class="fm-pv-btn is-wa">' + icon('chat') + esc(st.ending.button || 'Scrie-ne pe WhatsApp') + '</span>' + (wa() ? '<small class="fm-pv-num">' + esc(wa()) + '</small>' : '') + '</div></div>';
    };
    const dr = K.drawer({
      title: 'Formular nou', icon: 'file', width: 840,
      subtitle: 'Se creează pe Pagina de Facebook; apare imediat aici și în „Publică pe Meta”.',
      body: '<div class="fm-create"><div data-cform>' + formHtml() + '</div><aside class="fm-create-side"><small>Așa îl vede clienta</small><div data-cpv>' + preview() + '</div></aside></div>',
      footer: '<span class="k-grow"></span><button type="button" class="k-btn" data-cancel>Renunță</button><button type="button" class="k-btn is-primary" data-create>' + icon('check') + 'Creează formularul</button>',
      onMount(el) {
        const prev = () => { el.querySelector('[data-cpv]').innerHTML = preview(); };
        const repaint = () => { const y = el.querySelector('.k-dbody').scrollTop; el.querySelector('[data-cform]').innerHTML = formHtml(); prev(); el.querySelector('.k-dbody').scrollTop = y; };
        el.addEventListener('input', (e) => {
          const f = e.target;
          if (f.dataset.cf && f.type !== 'checkbox' && f.tagName !== 'SELECT') { set(f.dataset.cf, f.value); if (f.dataset.cf === 'name') touchedName = true; return prev(); }
          const q = f.closest('[data-q]');
          if (q) { const qq = st.questions[Number(q.dataset.q)]; if (f.matches('[data-ql]')) qq.label = f.value; else if (f.dataset.qo != null) qq.options[Number(f.dataset.qo)] = f.value; prev(); }
        });
        el.addEventListener('change', async (e) => {
          const f = e.target;
          if (f.name === 'fmcity') { st.location = f.value; autoName(); return repaint(); }
          if (f.dataset.cf === 'offerId') { st.offerId = f.value; autoName(); return repaint(); }
          if (f.dataset.cf && f.type === 'checkbox') { set(f.dataset.cf, f.checked); return f.dataset.cf === 'intro.on' ? repaint() : prev(); }
          if (f.dataset.fld) { st.fields = FIELDS.map(([k]) => k).filter((k) => k === 'PHONE' || (k === f.dataset.fld ? f.checked : st.fields.includes(k))); return repaint(); }
          if (f.matches('[data-copy-from]') && f.value) {
            try {
              F.d = await K.api('/api/portal-integrations', { action: 'fb_form_info', id: f.value });
              const src = (F.d.fbForms || []).find((x) => x.id === f.value);
              const qs = ((src && src.questions) || []).filter((x) => x.type === 'CUSTOM' && x.options && x.options.length).slice(0, 3);
              if (!qs.length) { K.ui().toast('Formularul ales n-are întrebări cu răspunsuri.', 'info'); return; }
              qs.forEach((x, i) => { st.questions[i] = { label: x.label, options: x.options.slice(0, 10) }; });
              repaint();
              K.ui().toast('Am copiat ' + K.plural(qs.length, 'întrebare', 'întrebări') + '.', 'success');
            } catch (err) { errMsg(err); }
          }
        });
        el.addEventListener('click', (e) => {
          if (e.target.closest('[data-cancel]')) return dr.close();
          const q = e.target.closest('[data-q]');
          if (q && e.target.closest('[data-qo-add]')) { st.questions[Number(q.dataset.q)].options.push(''); return repaint(); }
          const rm = e.target.closest('[data-qo-rm]');
          if (q && rm) { st.questions[Number(q.dataset.q)].options.splice(Number(rm.dataset.qoRm), 1); return repaint(); }
        });
        el.querySelector('[data-create]').addEventListener('click', (ev) => K.busy(ev.currentTarget, async () => {
          try {
            const r = await K.api('/api/portal-integrations', { action: 'fb_form_create', form: {
              name: st.name, location: st.location, offerId: st.offerId, fields: st.fields,
              questions: st.questions.map((q) => ({ label: q.label, options: q.options.filter((o) => o.trim()) })),
              ending: st.ending, headline: st.headline, quality: st.quality,
              intro: st.intro.on ? { title: st.intro.title, lines: st.intro.lines.split('\n'), button: st.intro.button } : null,
            } });
            F.d = r; F.show = 'active'; F.q = ''; render();
            dr.close();
            K.ui().toast('Formularul „' + st.name + '” e creat pe Facebook, cu WhatsApp ' + st.location + '.', 'success');
          } catch (err) { errMsg(err); }
        }));
      },
    });
  }

  // "Setări formulare": what every new form copies (read from the forms that run, changeable here)
  async function openSettings(onSaved) {
    let t;
    try { t = await template(); } catch (err) { return errMsg(err); }
    const st = {
      tm: (t.cities['Timișoara'] || {}).pretty || '', ar: (t.cities.Arad || {}).pretty || '',
      button: t.cta.text, title: t.ending.title, body: t.ending.body, privacy: (t.privacy && t.privacy.url) || '', fields: (t.fields || []).slice(),
    };
    const from = t.from && t.from.name ? 'Copiate din formularul „' + esc(t.from.name) + '”' + (t.readAt ? ', ' + esc(K.ago(t.readAt)) : '') + '.' : 'Nu am găsit un formular din care să copiez: completează-le aici.';
    const body = () => '<div class="k-form">' +
      '<p class="k-muted full fm-from">' + icon('info') + from + '</p>' +
      K.field('WhatsApp Timișoara', '<input data-s="tm" value="' + esc(st.tm) + '" placeholder="+40 7xx xxx xxx" inputmode="tel">') +
      K.field('WhatsApp Arad', '<input data-s="ar" value="' + esc(st.ar) + '" placeholder="+40 7xx xxx xxx" inputmode="tel">') +
      K.field('Butonul de la final', '<input data-s="button" value="' + esc(st.button) + '" maxlength="30">', 'full') +
      K.field('Titlul de la final', '<input data-s="title" value="' + esc(st.title) + '" maxlength="60">', 'full') +
      K.field('Textul de la final', '<textarea data-s="body" rows="3">' + esc(st.body) + '</textarea>', 'full') +
      '<div class="k-field full"><span>Datele cerute implicit</span>' + fieldChips(st.fields, 'data-sfld') + '</div>' +
      K.field('Politica de confidențialitate', '<input data-s="privacy" value="' + esc(st.privacy) + '" placeholder="https://…">', 'full') +
      '</div>';
    const d = K.drawer({
      title: 'Setări formulare', icon: 'sliders', width: 560,
      subtitle: 'Ce copiază fiecare formular nou. Orașul formularului alege numărul de WhatsApp.',
      body: '<div data-sbody>' + body() + '</div>',
      footer: '<button type="button" class="k-btn is-ghost" data-reread>' + icon('refresh') + 'Citește din nou din formulare</button><span class="k-grow"></span><button type="button" class="k-btn is-primary" data-ssave>' + icon('check') + 'Salvează</button>',
      onMount(el) {
        el.addEventListener('input', (e) => { const f = e.target; if (f.dataset.s) st[f.dataset.s] = f.value; });
        el.addEventListener('change', (e) => {
          const f = e.target;
          if (f.dataset.sfld) { st.fields = FIELDS.map(([k]) => k).filter((k) => k === 'PHONE' || (k === f.dataset.sfld ? f.checked : st.fields.includes(k))); el.querySelector('[data-sbody]').innerHTML = body(); }
        });
        el.querySelector('[data-reread]').addEventListener('click', (ev) => K.busy(ev.currentTarget, async () => {
          try { await template(true); d.close(); K.ui().toast('Citit din nou din formularele care rulează.', 'success'); openSettings(onSaved); } catch (err) { errMsg(err); }
        }));
        el.querySelector('[data-ssave]').addEventListener('click', (ev) => K.busy(ev.currentTarget, async () => {
          try {
            F.tpl = (await K.api('/api/portal-integrations', { action: 'fb_form_template_save', template: {
              cities: { 'Timișoara': { whatsapp: st.tm }, Arad: { whatsapp: st.ar } }, cta: { text: st.button }, ending: { title: st.title, body: st.body }, privacy: { url: st.privacy }, fields: st.fields,
            } })).template;
            d.close();
            K.ui().toast('Setările formularelor sunt salvate.', 'success');
            if (onSaved) onSaved();
          } catch (err) { errMsg(err); }
        }));
      },
    });
  }

  // "Numere noi la final": every active form copied as it is, with the city's new number at the end (a published form
  // can't change). One form at a time, each row says how it went; the copies keep the procedure and the city.
  async function openRenumber() {
    let p;
    try { p = await K.api('/api/portal-integrations', { action: 'fb_forms_renumber_plan' }); } catch (err) { return errMsg(err); }
    const st = { nums: { 'Timișoara': p.numbers['Timișoara'] || '', Arad: p.numbers.Arad || '' }, done: {}, running: false };
    const go = () => p.forms.filter((f) => f.city && !st.done[f.id]);
    const row = (f) => {
      const d = st.done[f.id];
      const num = st.nums[f.city] || '';
      return '<div class="fm-rn' + (d ? (d.ok ? ' is-ok' : ' is-bad') : '') + '"><span class="fm-rn-ic">' + icon(d ? (d.ok ? 'checkCircle' : 'alert') : 'file') + '</span>' +
        '<div class="fm-rn-t"><b>' + esc(f.name) + '</b><small>' + (f.city ? esc(f.city) : '<span class="is-bad">fără oraș</span>') + (f.activeAds ? ' · pe ' + K.plural(f.activeAds, 'reclamă activă', 'reclame active') : f.ads ? ' · pe ' + K.plural(f.ads, 'reclamă oprită', 'reclame oprite') : '') + (f.leads ? ' · ' + K.plural(f.leads, 'lead', 'leaduri') : '') + '</small>' +
        (d ? '<small>' + (d.ok ? 'Creat: „' + esc(d.name) + '”' : esc(d.error)) + '</small>'
          : f.city ? '<small>La final acum: <b>' + esc(f.oldPretty || '-') + '</b> → nou: <b>' + esc(num || '-') + '</b></small>' : '<small>' + esc(f.why || 'alege-i orașul în listă') + '</small>') + '</div></div>';
    };
    const body = () => '<div class="k-form">' +
      K.field('Numărul nou · Timișoara', '<input data-rn="Timișoara" value="' + esc(st.nums['Timișoara']) + '" inputmode="tel" placeholder="+40 7xx xxx xxx">') +
      K.field('Numărul nou · Arad', '<input data-rn="Arad" value="' + esc(st.nums.Arad) + '" inputmode="tel" placeholder="+40 7xx xxx xxx">') +
      '</div><div class="fm-rn-list">' + (p.forms.length ? p.forms.map(row).join('') : K.empty('file', 'Niciun formular activ', '')) + '</div>';
    const d = K.drawer({
      title: 'Numere noi la final', icon: 'phone', width: 620,
      subtitle: 'Formularele de pe reclame (și cele cu leaduri în ultimele 14 zile), copiate la fel, doar cu numărul orașului la final.',
      body: '<div data-rnbody>' + body() + '</div>',
      footer: '<span class="k-grow"></span><button type="button" class="k-btn is-accent" data-rngo>' + icon('check') + 'Creează ' + K.plural(go().length, 'formular nou', 'formulare noi') + '</button>',
      onMount(el) {
        el.addEventListener('input', (e) => { const f = e.target; if (f.dataset.rn) st.nums[f.dataset.rn] = f.value; });
        el.addEventListener('change', (e) => { if (e.target.dataset.rn) el.querySelector('[data-rnbody]').innerHTML = body(); });
        const btn = el.querySelector('[data-rngo]');
        btn.addEventListener('click', () => K.busy(btn, async () => {
          if (st.running) return;
          st.running = true;
          let ok = 0, bad = 0;
          for (const f of go()) {
            try {
              const r = await K.api('/api/portal-integrations', { action: 'fb_form_copy', id: f.id, numbers: st.nums });
              st.done[f.id] = { ok: true, name: r.copy.name }; ok++;
            } catch (err) { st.done[f.id] = { ok: false, error: (err.data && err.data.message) || K.errText(err) }; bad++; }
            el.querySelector('[data-rnbody]').innerHTML = body();
          }
          st.running = false;
          K.ui().toast(ok ? K.plural(ok, 'formular nou creat', 'formulare noi create') + (bad ? ', ' + bad + ' cu probleme' : '') + '. Pune-le pe reclame în Ads Manager.' : 'Niciun formular creat.', bad ? 'error' : 'success');
          load();
        }).then(() => { btn.innerHTML = icon('check') + 'Creează ' + K.plural(go().length, 'formular nou', 'formulare noi'); btn.disabled = !go().length; }));
      },
    });
  }

  window.C360Forms = { mount, load, isMounted: () => !!panel, create: openCreate, settings: openSettings, renumber: openRenumber };
})();
