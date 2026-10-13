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
  // Made on the connected Page through Meta, then right in the list with its procedure and city. Name and
  // phone (and e-mail, if wanted) are Meta's own fields, filled in for the client; up to 5 questions of ours.
  const CITY_SHORT = { 'Timișoara': 'TM', Arad: 'AR' };
  const SLUG_CITY = { timisoara: 'Timișoara', arad: 'Arad' };
  const dayMonth = () => { const d = new Date(); return String(d.getDate()).padStart(2, '0') + '.' + String(d.getMonth() + 1).padStart(2, '0'); };
  function openCreate() {
    const offers = (F.d && F.d.offers) || [];
    const st = {
      offerId: (offers[0] || {}).id || '', location: 'Timișoara', name: '',
      intro: { title: '', lines: '', button: 'Vreau oferta' }, headline: 'Lasă-ne numărul și te sunăm noi',
      email: false, custom: [], quality: false,
      thanks: { title: 'Mulțumim! Te sunăm noi.', body: 'O colegă de la Centrul360 te sună în curând ca să stabiliți ora.', button: 'Vezi site-ul' },
    };
    const touched = { name: false, intro: false };
    const offerOf = () => offers.find((o) => o.id === st.offerId) || null;
    const citiesOf = (o) => (o && o.locations && o.locations.length ? o.locations.map((l) => SLUG_CITY[l]).filter(Boolean) : ['Timișoara', 'Arad']);
    // the name and the first page follow the procedure and the city until they're written by hand
    function auto() {
      const o = offerOf();
      if (!citiesOf(o).includes(st.location)) st.location = citiesOf(o)[0];
      if (!touched.name) st.name = (o ? o.title : 'Formular') + ' ' + (CITY_SHORT[st.location] || '') + ' · ' + dayMonth();
      if (!touched.intro && o) {
        st.intro.title = o.title + ' în ' + st.location;
        const lines = String(o.description || '').split('\n').map((x) => x.trim()).filter(Boolean).slice(0, 3);
        if (o.priceNew) lines.push(o.priceNew + ' lei' + (o.priceOld ? ' în loc de ' + o.priceOld + ' lei' : ''));
        st.intro.lines = lines.join('\n');
      }
    }
    auto();
    const get = (path) => path.split('.').reduce((o, k) => (o ? o[k] : ''), st);
    const set = (path, v) => { const ks = path.split('.'); const last = ks.pop(); ks.reduce((o, k) => o[k], st)[last] = v; };
    const inp = (path, ph, max) => '<input data-cf="' + path + '" value="' + esc(get(path)) + '" placeholder="' + esc(ph || '') + '"' + (max ? ' maxlength="' + max + '"' : '') + '>';
    const qRow = (q, i) => '<div class="fm-cq" data-cq="' + i + '"><input data-cqf="label" value="' + esc(q.label) + '" placeholder="Întrebarea, ex. Ce zonă vrei să tratezi?" maxlength="120">' +
      '<select data-cqf="kind">' + K.options([['text', 'Răspuns scris'], ['choice', 'Variante']], q.kind) + '</select>' +
      '<button type="button" class="k-icon-btn" data-cq-rm="' + i + '" aria-label="Scoate întrebarea">' + icon('x') + '</button>' +
      (q.kind === 'choice' ? '<input class="fm-cq-opts" data-cqf="options" value="' + esc(q.options) + '" placeholder="Variantele, despărțite prin virgulă: Abdomen, Coapse, Brațe">' : '') + '</div>';
    const formHtml = () => '<div class="k-form fm-cf">' +
      K.field('Procedura', '<select data-cf="offerId">' + K.options(offers.map((o) => [o.id, o.title]), st.offerId) + '</select>') +
        K.field('Orașul', '<select data-cf="location">' + K.options(citiesOf(offerOf()).map((c) => [c, c]), st.location) + '</select>') +
      K.field('Numele formularului', inp('name', '', 200), 'full', 'Doar pentru tine; clientele nu-l văd.') +
      '<h4 class="fm-cf-h">' + icon('file') + 'Prima pagină</h4>' +
      K.field('Titlul', inp('intro.title', 'ex. LipoSonix în Timișoara', 60), 'full') +
      K.field('Rândurile', '<textarea data-cf="intro.lines" rows="4" placeholder="Câte unul pe rând">' + esc(st.intro.lines) + '</textarea>', 'full') +
      K.field('Butonul', inp('intro.button', 'Vreau oferta', 30), 'full') +
      '<h4 class="fm-cf-h">' + icon('listCheck') + 'Întrebările</h4>' +
      K.field('Titlul paginii', inp('headline', '', 60), 'full') +
      '<div class="fm-cf-fixed"><span>' + icon('check') + 'Nume complet</span><span>' + icon('check') + 'Telefon</span>' +
        '<label class="fb-check"><input type="checkbox" data-cf="email"' + (st.email ? ' checked' : '') + '><span>E-mail</span></label></div>' +
      '<div data-cqs>' + st.custom.map(qRow).join('') + '</div>' +
      (st.custom.length < 5 ? '<button type="button" class="k-btn is-ghost is-sm" data-cq-add>' + icon('plus') + 'Întrebare a noastră</button>' : '') +
      '<h4 class="fm-cf-h">' + icon('checkCircle') + 'Mulțumirea</h4>' +
      K.field('Titlul', inp('thanks.title', '', 60), 'full') +
      K.field('Textul', '<textarea data-cf="thanks.body" rows="2">' + esc(st.thanks.body) + '</textarea>', 'full') +
      K.field('Butonul (duce pe centrul360.com)', inp('thanks.button', 'Vezi site-ul', 30), 'full') +
      '<label class="fb-check is-row"><input type="checkbox" data-cf="quality"' + (st.quality ? ' checked' : '') + '><span>Leaduri mai atente<small>Clienta își confirmă datele înainte să trimită: mai puține leaduri, dar mai bune.</small></span></label>' +
      '</div>';
    const preview = () => {
      const lines = st.intro.lines.split('\n').map((x) => x.trim()).filter(Boolean);
      return '<div class="fm-pv">' +
        '<div class="fm-pv-card"><small>1 · Prima pagină</small><b>' + esc(st.intro.title || st.name) + '</b>' + (lines.length ? '<ul>' + lines.map((l) => '<li>' + esc(l) + '</li>').join('') + '</ul>' : '') + '<span class="fm-pv-btn">' + esc(st.intro.button || 'Continuă') + '</span></div>' +
        '<div class="fm-pv-card"><small>2 · Întrebările</small><b>' + esc(st.headline || 'Datele tale') + '</b>' +
          ['Nume complet', 'Număr de telefon'].concat(st.email ? ['E-mail'] : []).map((l) => '<span class="fm-pv-in">' + l + '</span>').join('') +
          st.custom.filter((q) => q.label.trim()).map((q) => '<span class="fm-pv-q">' + esc(q.label) + '</span>' + (q.kind === 'choice' ? q.options.split(',').map((o) => o.trim()).filter(Boolean).map((o) => '<span class="fm-pv-opt">' + esc(o) + '</span>').join('') : '<span class="fm-pv-in">Răspunsul tău</span>')).join('') +
          '<span class="fm-pv-btn">Trimite</span></div>' +
        '<div class="fm-pv-card"><small>3 · Mulțumirea</small><b>' + esc(st.thanks.title) + '</b><p>' + esc(st.thanks.body) + '</p><span class="fm-pv-btn">' + esc(st.thanks.button || 'Vezi site-ul') + '</span></div></div>';
    };
    const dr = K.drawer({
      title: 'Formular nou', icon: 'file', width: 820,
      subtitle: 'Se creează pe Pagina de Facebook și apare imediat aici și în „Publică pe Meta”.',
      body: '<div class="fm-create"><div data-cform>' + formHtml() + '</div><aside class="fm-create-side"><small>Așa îl vede clienta</small><div data-cpv>' + preview() + '</div></aside></div>',
      footer: '<span class="k-grow"></span><button type="button" class="k-btn" data-cancel>Renunță</button><button type="button" class="k-btn is-primary" data-create>' + icon('check') + 'Creează formularul</button>',
      onMount(el) {
        const prev = () => { el.querySelector('[data-cpv]').innerHTML = preview(); };
        const repaint = () => { el.querySelector('[data-cform]').innerHTML = formHtml(); prev(); };
        const onField = (e) => {
          const f = e.target;
          if (f.dataset.cf) {
            const v = f.type === 'checkbox' ? f.checked : f.value;
            set(f.dataset.cf, v);
            if (f.dataset.cf === 'name') touched.name = true;
            if (/^intro\./.test(f.dataset.cf)) touched.intro = true;
            if (f.dataset.cf === 'offerId' || f.dataset.cf === 'location') { auto(); return repaint(); }
            return prev();
          }
          const row = f.closest('[data-cq]');
          if (row && f.dataset.cqf) {
            st.custom[Number(row.dataset.cq)][f.dataset.cqf] = f.value;
            if (f.dataset.cqf === 'kind') return repaint();
            prev();
          }
        };
        el.addEventListener('input', onField);
        el.addEventListener('change', (e) => { if (e.target.tagName === 'SELECT' || e.target.type === 'checkbox') onField(e); });
        el.addEventListener('click', (e) => {
          if (e.target.closest('[data-cq-add]')) { st.custom.push({ label: '', kind: 'text', options: '' }); return repaint(); }
          const rm = e.target.closest('[data-cq-rm]'); if (rm) { st.custom.splice(Number(rm.dataset.cqRm), 1); return repaint(); }
          if (e.target.closest('[data-cancel]')) dr.close();
        });
        el.querySelector('[data-create]').addEventListener('click', (ev) => K.busy(ev.currentTarget, async () => {
          try {
            const r = await K.api('/api/portal-integrations', { action: 'fb_form_create', form: {
              name: st.name, offerId: st.offerId, location: st.location,
              intro: { title: st.intro.title, lines: st.intro.lines.split('\n'), button: st.intro.button }, headline: st.headline,
              email: st.email, quality: st.quality, thanks: st.thanks,
              custom: st.custom.map((q) => ({ label: q.label, options: q.kind === 'choice' ? q.options.split(',').map((o) => o.trim()).filter(Boolean) : [] })),
            } });
            F.d = r; F.show = 'active'; F.q = ''; render();
            dr.close();
            K.ui().toast('Formularul „' + st.name + '” e creat pe Facebook.', 'success');
          } catch (err) { K.ui().toast(err.data && err.data.message ? err.data.message : K.errText(err), 'error'); }
        }));
      },
    });
  }

  window.C360Forms = { mount, load, isMounted: () => !!panel, create: openCreate };
})();
