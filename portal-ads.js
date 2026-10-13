// Centrul360 portal - Admin → Reclame: a small Ads Manager over the connected Meta ad account.
// Campaigns with their ad sets and ads: switch on / off, change a daily budget, rename, delete,
// and the period's spend, leads and cost per lead. New ads are published from Creative ("Publică
// pe Meta"); the window starts from the defaults set here (Setări implicite).
// Data: /api/ads-manager (the Meta side is api/_lib/meta-ads.js).
(function () {
  'use strict';
  const K = window.K;
  const { esc, icon } = K;
  const A = { d: null, period: '7d', show: 'active', q: '', open: new Set(), keep: new Set(), loading: false };
  let panel;

  const PERIODS = [['today', 'Azi'], ['yesterday', 'Ieri'], ['7d', '7 zile'], ['30d', '30 zile'], ['max', 'Tot']];
  const STATUS = {
    ACTIVE: ['Activă', 'good'], PAUSED: ['Oprită', ''], CAMPAIGN_PAUSED: ['Campania e oprită', ''], ADSET_PAUSED: ['Setul e oprit', ''],
    PENDING_REVIEW: ['În verificare', 'info'], IN_PROCESS: ['Se pregătește', 'info'], PREAPPROVED: ['Pre-aprobată', 'info'],
    DISAPPROVED: ['Respinsă', 'bad'], WITH_ISSUES: ['Cu probleme', 'warn'], PENDING_BILLING_INFO: ['Fără metodă de plată', 'warn'],
  };
  const PLACE = [['fb_feed', 'Facebook · flux'], ['fb_story', 'Facebook · stories'], ['fb_reels', 'Facebook · reels'], ['ig_feed', 'Instagram · flux'], ['ig_story', 'Instagram · stories'], ['ig_reels', 'Instagram · reels']];
  const CTA = { LEARN_MORE: 'Află mai multe', SIGN_UP: 'Înscrie-te', BOOK_NOW: 'Rezervă acum', GET_OFFER: 'Obține oferta', APPLY_NOW: 'Aplică acum', GET_QUOTE: 'Solicită ofertă' };

  const money = (n) => K.lei(n, n && n < 100 ? 2 : 0);
  const cpl = (x) => (x.leads ? money(x.spend / x.leads) : '-');
  const tag = (eff) => { const s = STATUS[eff] || [eff ? eff.toLowerCase() : '', '']; return '<span class="k-tag' + (s[1] ? ' is-' + s[1] : '') + '">' + esc(s[0]) + '</span>'; };
  const sw = (id, on, kind) => '<label class="k-switch ad-sw" title="' + (on ? 'Pornită, apasă ca s-o oprești' : 'Oprită, apasă ca s-o pornești') + '"><input type="checkbox" data-sw="' + esc(id) + '" data-kind="' + kind + '"' + (on ? ' checked' : '') + '><i></i></label>';

  function mount(p) {
    panel = p;
    panel.classList.add('k-panel', 'ad');
    panel.innerHTML =
      '<div class="k-head"><div><div class="k-eyebrow">Marketing</div><h2>Reclame</h2><p class="k-lede">Campaniile din contul de reclame: pornești, oprești, schimbi bugetul și vezi leadurile. Reclamele noi le publici din Creative, cu „Publică pe Meta”.</p></div>' +
      '<div class="k-head-actions"><button type="button" class="k-btn is-outline" data-act="defaults">' + icon('sliders') + 'Setări implicite</button>' +
      '<button type="button" class="k-btn is-accent" data-act="creative">' + icon('sparkles') + 'Publică un creative</button></div></div>' +
      '<div data-body><div class="k-skel" style="height:110px;margin-bottom:1rem"></div><div class="k-skel" style="height:360px"></div></div>';
    panel.addEventListener('click', onClick);
    panel.addEventListener('change', onChange);
    panel.addEventListener('input', (e) => { if (e.target.matches('[data-q]')) { A.q = e.target.value; paintList(); } });
    panel.addEventListener('keydown', (e) => { if (e.key === 'Enter' && e.target.matches('[data-budget-input]')) { e.preventDefault(); saveBudget(e.target.closest('[data-budget-box]')); } });
  }
  // quiet: refresh after a change (statuses that follow from it) without dimming the page
  async function load(quiet) {
    if (A.loading) return;
    A.loading = true;
    const body = panel.querySelector('[data-body]');
    if (A.d && quiet !== true) body.classList.add('is-loading');
    try { A.d = await K.api('/api/ads-manager?period=' + A.period); render(); }
    catch (e) { body.innerHTML = K.empty('alert', 'Nu am putut încărca reclamele', K.errText(e), '<button type="button" class="k-btn is-primary" data-act="reload">Reîncearcă</button>'); }
    finally { A.loading = false; body.classList.remove('is-loading'); }
  }

  function render() {
    const d = A.d, body = panel.querySelector('[data-body]');
    if (!d.ready) {
      body.innerHTML = '<div class="k-card ad-setup"><span class="k-icon-chip is-warn">' + icon('alert') + '</span><div><b>Reclamele nu sunt încă legate</b><p>' + esc(d.message || '') + '</p>' +
        '<button type="button" class="k-btn is-primary is-sm" data-goto="integrari">' + icon('facebook') + 'Integrări → Facebook</button></div></div>';
      return;
    }
    const t = d.totals, active = d.campaigns.filter((c) => c.status === 'ACTIVE').length;
    const tok = d.token;
    const days = tok && tok.expiresAt ? Math.round((tok.expiresAt - Date.now()) / 86400e3) : null;
    body.innerHTML =
      (tok && days != null && days < 14 ? '<div class="k-card ad-note is-warn">' + icon('clock') + '<span>Conexiunea pentru reclame expiră ' + (days <= 0 ? 'azi' : 'în ' + K.plural(days, 'zi', 'zile')) + '. Reconectează din Integrări → Facebook (cu un token de System User nu mai expiră).</span><button type="button" class="k-btn is-sm" data-goto="integrari">Integrări</button></div>' : '') +
      '<div class="ad-bar">' + K.seg('adperiod', PERIODS.map(([k, l]) => [k, l]), A.period) +
        '<div class="ad-bar-right"><label class="ad-search">' + icon('search') + '<input data-q type="search" placeholder="Caută o campanie sau o reclamă…" value="' + esc(A.q) + '"></label>' +
        '<div class="k-chips"><button type="button" class="k-chip' + (A.show === 'active' ? ' is-on' : '') + '" data-show="active">Pornite<span>' + active + '</span></button><button type="button" class="k-chip' + (A.show === 'all' ? ' is-on' : '') + '" data-show="all">Toate<span>' + d.campaigns.length + '</span></button></div>' +
        '<a class="k-icon-btn" href="' + esc(d.adsManager) + '" target="_blank" rel="noopener" title="Deschide Ads Manager">' + icon('link') + '</a></div></div>' +
      '<div class="ad-stats">' +
        stat('wallet', 'Cheltuit', money(t.spend)) + stat('userPlus', 'Leaduri', K.num(t.leads)) +
        stat('target', 'Cost pe lead', t.leads ? money(t.spend / t.leads) : '-') + stat('zap', 'Campanii pornite', String(active)) + '</div>' +
      (d.partial ? '<p class="k-muted ad-partial">' + esc(d.partial) + '</p>' : '') +
      '<div class="ad-head-row"><span>Campanie</span><span>Buget / zi</span><span>Cheltuit</span><span>Leaduri</span><span>Cost / lead</span><span></span></div>' +
      '<div class="ad-list" data-list></div>';
    paintList();
  }
  const stat = (ic, label, val) => '<div class="k-card ad-stat"><span class="k-icon-chip is-accent">' + icon(ic) + '</span><div><small>' + esc(label) + '</small><b>' + esc(val) + '</b></div></div>';

  // a campaign is found by its own name or by the name of one of its ad sets or ads
  const hay = (c) => K.norm([c.name].concat(c.adsets.map((s) => s.name + ' ' + s.ads.map((x) => x.name).join(' '))).join(' '));
  function visible() {
    const q = K.norm(A.q || '');
    // a campaign switched off a moment ago stays in view (Pornite) until the filter changes
    return A.d.campaigns.filter((c) => (A.show === 'all' || c.status === 'ACTIVE' || A.keep.has(c.id)) && (!q || hay(c).includes(q)));
  }
  function paintList() {
    const box = panel.querySelector('[data-list]');
    if (!box) return;
    const list = visible();
    box.innerHTML = list.length ? list.map(campHtml).join('')
      : K.empty('zap', A.show === 'active' ? 'Nicio campanie pornită' : 'Nicio campanie', A.show === 'active' ? 'Vezi „Toate” pentru cele oprite, sau publică un creative din Creative.' : 'Publică un creative din Creative („Publică pe Meta”).');
  }
  function budgetCell(x, kind) {
    const val = x.daily ? money(x.daily) : x.lifetime ? money(x.lifetime) + ' total' : '-';
    const editable = (kind === 'adset' && !!x.daily) || (kind === 'campaign' && x.cbo);
    return editable
      ? '<span class="ad-budget" data-budget-box data-id="' + esc(x.id) + '"><button type="button" class="ad-budget-btn" data-budget-edit title="Schimbă bugetul">' + esc(val) + icon('pen') + '</button></span>'
      : '<span class="ad-budget">' + esc(val) + '</span>';
  }
  function campHtml(c) {
    const open = A.open.has(c.id);
    return '<article class="k-card ad-camp' + (open ? ' is-open' : '') + (c.status === 'ACTIVE' ? '' : ' is-off') + '" data-camp="' + esc(c.id) + '">' +
      '<div class="ad-row is-camp">' +
        '<div class="ad-name">' + sw(c.id, c.status === 'ACTIVE', 'campaign') + '<button type="button" class="ad-title" data-toggle="' + esc(c.id) + '"><b>' + esc(c.name) + '</b><small>' + tag(c.effective) + ' ' + K.plural(c.adsets.length, 'set', 'seturi') + ' · ' + K.plural(c.adsets.reduce((n, s) => n + s.ads.length, 0), 'reclamă', 'reclame') + '</small></button></div>' +
        '<div class="ad-cell" data-l="Buget / zi">' + budgetCell(c, 'campaign') + '</div>' +
        '<div class="ad-cell" data-l="Cheltuit">' + esc(money(c.spend)) + '</div>' +
        '<div class="ad-cell" data-l="Leaduri"><b>' + K.num(c.leads) + '</b></div>' +
        '<div class="ad-cell" data-l="Cost / lead">' + esc(cpl(c)) + '</div>' +
        '<div class="ad-acts"><button type="button" class="k-icon-btn" data-more="campaign" data-id="' + esc(c.id) + '" data-name="' + esc(c.name) + '" title="Mai mult">' + icon('more') + '</button>' +
          '<button type="button" class="k-icon-btn ad-chev" data-toggle="' + esc(c.id) + '" aria-label="Seturile de reclame">' + icon(open ? 'up' : 'down') + '</button></div>' +
      '</div>' +
      (open ? '<div class="ad-sets">' + (c.adsets.length ? c.adsets.map((s) => setHtml(s, c)).join('') : '<p class="k-muted ad-empty">Campania n-are seturi de reclame.</p>') + '</div>' : '') +
      '</article>';
  }
  function setHtml(s, c) {
    return '<div class="ad-set' + (s.status === 'ACTIVE' ? '' : ' is-off') + '">' +
      '<div class="ad-row is-set">' +
        '<div class="ad-name">' + sw(s.id, s.status === 'ACTIVE', 'adset') + '<div class="ad-title"><b>' + esc(s.name) + '</b><small>' + tag(s.effective) + (s.audience && K.norm(s.audience) !== K.norm(s.name) ? ' ' + esc(s.audience) : '') + '</small></div></div>' +
        '<div class="ad-cell" data-l="Buget / zi">' + (c.cbo ? '<span class="ad-budget k-muted">al campaniei</span>' : budgetCell(s, 'adset')) + '</div>' +
        '<div class="ad-cell" data-l="Cheltuit">' + esc(money(s.spend)) + '</div>' +
        '<div class="ad-cell" data-l="Leaduri"><b>' + K.num(s.leads) + '</b></div>' +
        '<div class="ad-cell" data-l="Cost / lead">' + esc(cpl(s)) + '</div>' +
        '<div class="ad-acts"><button type="button" class="k-icon-btn" data-more="adset" data-id="' + esc(s.id) + '" data-name="' + esc(s.name) + '" title="Mai mult">' + icon('more') + '</button></div>' +
      '</div>' +
      '<div class="ad-ads">' + (s.ads.length ? s.ads.map(adHtml).join('') : '<p class="k-muted ad-empty">Nicio reclamă în set.</p>') + '</div>' +
      '</div>';
  }
  function adHtml(a) {
    return '<div class="ad-row is-ad' + (a.status === 'ACTIVE' ? '' : ' is-off') + '">' +
      '<div class="ad-name">' + sw(a.id, a.status === 'ACTIVE', 'ad') +
        (a.thumb ? '<img class="ad-thumb" src="' + esc(a.thumb) + '" alt="" loading="lazy" referrerpolicy="no-referrer">' : '<span class="ad-thumb is-empty">' + icon('image') + '</span>') +
        '<div class="ad-title"><b>' + esc(a.name) + '</b><small>' + tag(a.effective) + (a.review ? ' <span class="ad-review">' + esc(a.review) + '</span>' : '') + '</small></div></div>' +
      '<div class="ad-cell" data-l="Buget / zi"></div>' +
      '<div class="ad-cell" data-l="Cheltuit">' + esc(money(a.spend)) + '</div>' +
      '<div class="ad-cell" data-l="Leaduri"><b>' + K.num(a.leads) + '</b></div>' +
      '<div class="ad-cell" data-l="Cost / lead">' + esc(cpl(a)) + '</div>' +
      '<div class="ad-acts"><button type="button" class="k-icon-btn" data-more="ad" data-id="' + esc(a.id) + '" data-name="' + esc(a.name) + '" title="Mai mult">' + icon('more') + '</button></div>' +
      '</div>';
  }

  // ------------------------------------------------------------------ actions
  async function post(body) { return K.api('/api/ads-manager', body); }
  function findAny(id) {
    for (const c of A.d.campaigns) {
      if (c.id === id) return c;
      for (const s of c.adsets) { if (s.id === id) return s; const a = s.ads.find((x) => x.id === id); if (a) return a; }
    }
    return null;
  }
  async function onChange(e) {
    const t = e.target;
    if (t.name === 'adperiod') { A.period = t.value; A.keep.clear(); return load(); }
    if (t.dataset.sw) {
      const x = findAny(t.dataset.sw);
      const status = t.checked ? 'ACTIVE' : 'PAUSED';
      t.disabled = true;
      try {
        await post({ action: 'status', id: t.dataset.sw, status });
        if (x) { x.status = status; x.effective = status; }
        if (t.dataset.kind === 'campaign') A.keep.add(t.dataset.sw);
        K.ui().toast(t.checked ? 'Pornită.' : 'Oprită.', 'success');
        paintList();
        load(true);
      } catch (err) { t.checked = !t.checked; K.ui().toast(err.data && err.data.message ? err.data.message : K.errText(err), 'error'); }
      finally { t.disabled = false; }
    }
  }
  function editBudget(box) {
    const x = findAny(box.dataset.id);
    box.innerHTML = '<input class="ad-budget-input" data-budget-input type="number" min="5" step="5" value="' + esc(x && x.daily ? x.daily : 50) + '"><button type="button" class="k-btn is-primary is-sm" data-budget-save>' + icon('check') + '</button>';
    const inp = box.querySelector('input'); inp.focus(); inp.select();
  }
  async function saveBudget(box) {
    const v = Number(box.querySelector('input').value);
    if (!(v >= 5)) { K.ui().toast('Bugetul minim e 5 lei pe zi.', 'error'); return; }
    const btn = box.querySelector('[data-budget-save]');
    await K.busy(btn, async () => {
      try {
        await post({ action: 'budget', id: box.dataset.id, daily: v });
        const x = findAny(box.dataset.id); if (x) x.daily = v;
        A.d.campaigns.forEach((c) => { if (!c.cbo) { const on = c.adsets.filter((s) => s.status === 'ACTIVE'); c.daily = (on.length ? on : c.adsets).reduce((n, s) => n + s.daily, 0); } });
        K.ui().toast('Bugetul e ' + money(v) + ' pe zi.', 'success');
        paintList();
      } catch (err) { K.ui().toast(err.data && err.data.message ? err.data.message : K.errText(err), 'error'); }
    });
  }
  // the ⋯ menu next to a campaign, an ad set or an ad
  let menuEl = null;
  function closeMenu() {
    if (!menuEl) return;
    const m = menuEl; menuEl = null;
    m.classList.remove('is-open');
    setTimeout(() => m.remove(), 200);
    document.removeEventListener('mousedown', outsideMenu, true);
    document.removeEventListener('keydown', escMenu, true);
    window.removeEventListener('scroll', closeMenu, true);
  }
  const outsideMenu = (e) => { if (menuEl && !menuEl.contains(e.target) && !e.target.closest('[data-more]')) closeMenu(); };
  const escMenu = (e) => { if (e.key === 'Escape') { e.stopPropagation(); closeMenu(); } };
  function amUrl(kind, id) {
    const act = String(A.d.account && A.d.account.id || '').replace(/^act_/, '');
    const page = { campaign: 'campaigns', adset: 'adsets', ad: 'ads' }[kind];
    return 'https://adsmanager.facebook.com/adsmanager/manage/' + page + '?act=' + act + '&selected_' + page.replace(/s$/, '') + '_ids=' + id;
  }
  function more(btn) {
    const same = menuEl && menuEl.dataset.for === btn.dataset.id;
    closeMenu();
    if (same) return;
    const kind = btn.dataset.more, id = btn.dataset.id;
    const m = document.createElement('div');
    m.className = 'k-menu ad-menu';
    m.dataset.for = id;
    m.innerHTML =
      '<button type="button" class="k-menu-item" data-m="rename">' + icon('pen') + 'Redenumește</button>' +
      '<a class="k-menu-item" href="' + esc(amUrl(kind, id)) + '" target="_blank" rel="noopener" data-m="open">' + icon('link') + 'Deschide în Ads Manager</a>' +
      '<button type="button" class="k-menu-item is-danger" data-m="delete">' + icon('trash') + 'Șterge</button>';
    document.body.appendChild(m);
    const r = btn.getBoundingClientRect();
    const h = m.offsetHeight;
    const below = r.bottom + 6 + h < window.innerHeight;
    m.style.top = (below ? r.bottom + 6 : r.top - 6 - h) + 'px';
    m.style.left = Math.max(8, Math.min(r.right - m.offsetWidth, window.innerWidth - m.offsetWidth - 8)) + 'px';
    m.style.transformOrigin = below ? 'top right' : 'bottom right';
    requestAnimationFrame(() => m.classList.add('is-open'));
    menuEl = m;
    setTimeout(() => {
      document.addEventListener('mousedown', outsideMenu, true);
      document.addEventListener('keydown', escMenu, true);
      window.addEventListener('scroll', closeMenu, true);
    }, 0);
    m.addEventListener('click', (e) => {
      const it = e.target.closest('[data-m]');
      if (!it) return;
      closeMenu();
      if (it.dataset.m === 'rename') rename(btn);
      if (it.dataset.m === 'delete') remove(btn);
    });
  }
  async function rename(btn) {
    const id = btn.dataset.id, name = btn.dataset.name;
    const nn = await K.ui().prompt({ title: 'Redenumește', value: name, confirmText: 'Salvează' });
    if (!nn || !nn.trim() || nn.trim() === name) return;
    try {
      await post({ action: 'rename', id, name: nn.trim() });
      const x = findAny(id); if (x) x.name = nn.trim();
      paintList();
      K.ui().toast('Redenumit.', 'success');
    } catch (err) { K.ui().toast(err.data && err.data.message ? err.data.message : K.errText(err), 'error'); }
  }
  async function remove(btn) {
    const id = btn.dataset.id, kind = btn.dataset.more, name = btn.dataset.name;
    const what = { campaign: 'campania', adset: 'setul de reclame', ad: 'reclama' }[kind];
    const ok = await K.ui().confirm({
      title: 'Ștergi ' + what + '?', danger: true, confirmText: 'Șterge',
      message: '„' + name + '”. ' + (kind === 'campaign' ? 'Se șterg și seturile și reclamele din ea. ' : kind === 'adset' ? 'Se șterg și reclamele din el. ' : '') + 'Rezultatele rămân în Meta, dar nu se poate anula. Dacă vrei doar s-o oprești, folosește butonul de pornire.',
    });
    if (!ok) return;
    try { await post({ action: 'delete', id }); K.ui().toast('Șters.', 'success'); load(true); }
    catch (err) { K.ui().toast(err.data && err.data.message ? err.data.message : K.errText(err), 'error'); }
  }
  async function onClick(e) {
    const t = e.target;
    if (t.closest('[data-act="reload"]')) { panel.querySelector('[data-body]').innerHTML = '<div class="k-skel" style="height:360px"></div>'; return load(); }
    if (t.closest('[data-act="defaults"]')) return openDefaults();
    if (t.closest('[data-act="creative"]')) { K.go('creative'); K.ui().toast('Deschide un creative aprobat și apasă „Publică pe Meta”.', 'info'); return; }
    const go = t.closest('[data-goto]'); if (go) return K.go(go.dataset.goto);
    const sh = t.closest('[data-show]'); if (sh) { A.show = sh.dataset.show; A.keep.clear(); return render(); }
    const tg = t.closest('[data-toggle]');
    if (tg) { const id = tg.dataset.toggle; if (A.open.has(id)) A.open.delete(id); else A.open.add(id); return paintList(); }
    const be = t.closest('[data-budget-edit]'); if (be) return editBudget(be.closest('[data-budget-box]'));
    const bs = t.closest('[data-budget-save]'); if (bs) return saveBudget(bs.closest('[data-budget-box]'));
    const m = t.closest('[data-more]'); if (m) return more(m);
  }

  // ------------------------------------------------------------------ defaults for "Publică pe Meta"
  function openDefaults() {
    const d = (A.d && A.d.defaults) || {};
    const ages = d.ages || { body: [28, 64], facial: [20, 60] };
    const names = d.names || {};
    const dr = K.drawer({
      title: 'Setări implicite', icon: 'sliders', width: 560,
      subtitle: 'Cu ce pornește fereastra „Publică pe Meta” din Creative. Le poți schimba acolo, la fiecare reclamă.',
      body: '<form class="k-form ad-defaults" data-def autocomplete="off">' +
        K.field('Buget pe zi (lei)', '<input name="budget" type="number" min="5" step="5" value="' + esc(d.budget || 50) + '">') +
        K.field('Rază în jurul orașului (km)', '<input name="radiusKm" type="number" min="1" max="80" value="' + esc(d.radiusKm || 7) + '">') +
        K.field('Vârstă, tratamente corporale', '<div class="ad-age"><input name="bodyMin" type="number" min="18" max="65" value="' + esc(ages.body[0]) + '"><span>până la</span><input name="bodyMax" type="number" min="18" max="65" value="' + esc(ages.body[1]) + '"></div>', 'full') +
        K.field('Vârstă, faciale clasice (ex. Restart)', '<div class="ad-age"><input name="facialMin" type="number" min="18" max="65" value="' + esc(ages.facial[0]) + '"><span>până la</span><input name="facialMax" type="number" min="18" max="65" value="' + esc(ages.facial[1]) + '"></div>', 'full', 'HIFU, RF și celelalte minim invazive folosesc vârsta de la corporale.') +
        '<div class="k-field full"><span>Plasări</span><div class="ad-checks">' + PLACE.map(([k, l]) => '<label class="fb-check"><input type="checkbox" name="pl_' + k + '"' + ((d.placements || []).includes(k) ? ' checked' : '') + '><span>' + esc(l) + '</span></label>').join('') + '</div></div>' +
        K.field('Buton', '<select name="cta">' + K.options(Object.keys(CTA).map((k) => [k, CTA[k]]), d.cta || 'LEARN_MORE') + '</select>') +
        K.field('Public', '<select name="women">' + K.options([['1', 'Doar femei'], ['0', 'Toți']], d.women === false ? '0' : '1') + '</select>') +
        K.field('Pornire', '<select name="startNow">' + K.options([['1', 'Pornește imediat după publicare'], ['0', 'Rămâne oprită, o pornesc eu']], d.startNow === false ? '0' : '1') + '</select>', 'full') +
        K.field('Numele campaniei', '<input name="n_campaign" value="' + esc(names.campaign || '') + '">', 'full') +
        K.field('Numele setului de reclame', '<input name="n_adset" value="' + esc(names.adset || '') + '">', 'full') +
        K.field('Numele reclamei', '<input name="n_ad" value="' + esc(names.ad || '') + '">', 'full', 'În nume poți folosi {oferta}, {oras}, {data}, {km}, {varsta}, {hook}.') +
        '</form>',
      footer: '<span class="k-grow"></span><button type="button" class="k-btn" data-cancel>Renunță</button><button type="button" class="k-btn is-primary" data-save>' + icon('check') + 'Salvează</button>',
      onMount(el) {
        el.querySelector('[data-cancel]').addEventListener('click', () => dr.close());
        el.querySelector('[data-save]').addEventListener('click', (ev) => K.busy(ev.currentTarget, async () => {
          const v = K.formValues(el.querySelector('[data-def]'));
          const defaults = {
            budget: Number(v.budget), radiusKm: Number(v.radiusKm), women: v.women === '1', startNow: v.startNow === '1', cta: v.cta,
            ages: { body: [Number(v.bodyMin), Number(v.bodyMax)], facial: [Number(v.facialMin), Number(v.facialMax)] },
            placements: PLACE.map(([k]) => k).filter((k) => v['pl_' + k]),
            names: { campaign: v.n_campaign, adset: v.n_adset, ad: v.n_ad },
          };
          if (!defaults.placements.length) { K.ui().toast('Alege cel puțin o plasare.', 'error'); return; }
          try {
            const r = await post({ action: 'defaults', defaults });
            if (A.d) A.d.defaults = r.defaults;
            dr.close();
            K.ui().toast('Salvat. Fereastra „Publică pe Meta” pornește de acum cu ele.', 'success');
          } catch (err) { K.ui().toast(K.errText(err), 'error'); }
        }));
      },
    });
  }

  K.section('reclame', { mount, show: load });
})();
