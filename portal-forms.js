// Centrul360 portal - Admin → Formulare: every Facebook lead form of the connected Page in one
// place. Per form: whether it's active, how many leads it brought (on Facebook and in the
// Pipeline), when the last one came, the procedure and city its leads get (set here, or read
// from the form's name), its questions as written in the form, and a jump to its leads.
// Data: /api/portal-integrations (the list comes from the minute's look at the forms, _lib/fb-leads.js).
(function () {
  'use strict';
  const K = window.K;
  const { esc, icon } = K;
  const F = { d: null, q: '', show: 'active', open: null, limit: 40 };
  let panel;

  function mount(p) {
    panel = p;
    panel.classList.add('k-panel', 'fm');
    panel.innerHTML =
      '<div class="k-head"><div><div class="k-eyebrow">Admin</div><h2>Formulare</h2><p class="k-lede">Formularele de lead din Facebook: procedura și orașul cu care intră leadurile fiecăruia, întrebările și leadurile primite.</p></div>' +
      '<div class="k-head-actions"><button type="button" class="k-btn is-outline" data-act="reload">' + icon('refresh') + 'Actualizează</button></div></div>' +
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
      panel.querySelector('[data-body]').innerHTML = K.empty('facebook', 'Niciun formular încă', 'Formularele apar aici la un minut după ce Facebook e conectat (Integrări → Facebook).', '<button type="button" class="k-btn is-primary" data-act="integrari">Integrări</button>');
      return;
    }
    panel.querySelector('[data-body]').innerHTML =
      '<div class="fm-bar"><label class="fm-search">' + icon('search') + '<input data-q type="search" placeholder="Caută un formular…" value="' + esc(F.q) + '"></label>' +
        '<div class="k-chips">' + [['active', 'Active', active], ['leads', 'Cu leaduri în portal', withLeads], ['archived', 'Arhivate', all.length - active], ['all', 'Toate', all.length]]
          .map(([k, l, n]) => '<button type="button" class="k-chip' + (F.show === k ? ' is-on' : '') + '" data-show="' + k + '">' + l + '<span>' + n + '</span></button>').join('') + '</div></div>' +
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
    if (t.closest('[data-act="integrari"]')) return K.go('integrari');
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

  K.section('formulare', { mount, show: load });
})();
