// Centrul360 portal - Admin → Reclame: a small Ads Manager over the connected Meta ad account.
// Campaigns with their ad sets and ads: switch on / off, change a daily budget, rename, delete,
// and every result of the period: Meta's (spend, leads, clicks…) and what came after the form
// (booked, showed, clients, revenue, upsells), as columns and summary cards each account picks. New ads are published from Creative ("Publică
// pe Meta"); the window starts from the defaults set here (Setări implicite).
// Data: /api/ads-manager (the Meta side is api/_lib/meta-ads.js).
(function () {
  'use strict';
  const K = window.K;
  const { esc, icon } = K;
  // sel: the campaigns picked (the numbers on top are theirs; none picked = the whole account)
  // range: { since, until } when "Personalizat" is chosen
  const A = { d: null, period: '7d', range: null, show: 'active', q: '', open: new Set(), keep: new Set(), sel: new Set(), loading: false };
  let panel;

  const PERIODS = [['today', 'Azi'], ['yesterday', 'Ieri'], ['7d', '7 zile'], ['30d', '30 zile'], ['max', 'Tot']];
  const dayLabel = (d) => K.dateShort(d);
  const rangeLabel = (r) => (r.since === r.until ? dayLabel(r.since) : dayLabel(r.since) + ' - ' + dayLabel(r.until));
  const periodPairs = () => PERIODS.concat([['custom', A.range ? rangeLabel(A.range) : 'Personalizat', 'calendar']]);
  const STATUS = {
    ACTIVE: ['Activă', 'good'], PAUSED: ['Oprită', ''], CAMPAIGN_PAUSED: ['Campania e oprită', ''], ADSET_PAUSED: ['Setul e oprit', ''],
    PENDING_REVIEW: ['În verificare', 'info'], IN_PROCESS: ['Se pregătește', 'info'], PREAPPROVED: ['Pre-aprobată', 'info'],
    DISAPPROVED: ['Respinsă', 'bad'], WITH_ISSUES: ['Cu probleme', 'warn'], PENDING_BILLING_INFO: ['Fără metodă de plată', 'warn'],
  };
  const PLACE = [['fb_feed', 'Facebook · flux'], ['fb_story', 'Facebook · stories'], ['fb_reels', 'Facebook · reels'], ['ig_feed', 'Instagram · flux'], ['ig_story', 'Instagram · stories'], ['ig_reels', 'Instagram · reels']];
  const CTA = { LEARN_MORE: 'Află mai multe', SIGN_UP: 'Înscrie-te', BOOK_NOW: 'Rezervă acum', GET_OFFER: 'Obține oferta', APPLY_NOW: 'Aplică acum', GET_QUOTE: 'Solicită ofertă' };

  const money = (n) => K.lei(n, n && n < 100 ? 2 : 0);
  // "13 oct, 14:32" from Meta's created_time (2026-10-13T14:32:10+0300)
  const madeAt = (ts) => {
    const t = Date.parse(String(ts || '').replace(/([+-]\d{2})(\d{2})$/, '$1:$2'));
    if (!Number.isFinite(t)) return '';
    const d = new Date(t);
    return K.dateShort(K.iso(d)) + (d.getFullYear() !== new Date().getFullYear() ? ' ' + d.getFullYear() : '') + ', ' + K.pad(d.getHours()) + ':' + K.pad(d.getMinutes());
  };
  // after = something stands before it on the line (a dot separates them)
  const made = (x, after) => { const m = madeAt(x.created); return m ? '<span class="ad-made' + (after === false ? ' is-first' : '') + '" title="Publicată">' + esc(m) + '</span>' : ''; };
  // the switch already says on / off; a tag only for what it can't (review, rejected, campaign off…)
  const tag = (eff) => { if (!eff || eff === 'ACTIVE' || eff === 'PAUSED') return ''; const s = STATUS[eff] || [eff ? eff.toLowerCase() : '', '']; return '<span class="k-tag' + (s[1] ? ' is-' + s[1] : '') + '">' + esc(s[0]) + '</span>'; };
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
    try {
      // the columns and cards this account chose (K.prefs) come with the first load
      [A.d] = await Promise.all([K.api('/api/ads-manager?' + (A.range ? 'since=' + A.range.since + '&until=' + A.range.until : 'period=' + A.period)), K.prefs.load()]);
      // a picked campaign that no longer exists drops out of the pick
      if (A.d.campaigns) { const ids = new Set(A.d.campaigns.map((c) => c.id)); A.sel.forEach((id) => { if (!ids.has(id)) A.sel.delete(id); }); }
      render();
    }
    catch (e) { body.innerHTML = K.empty('alert', 'Nu am putut încărca reclamele', K.errText(e), '<button type="button" class="k-btn is-primary" data-act="reload">Reîncearcă</button>'); }
    finally { A.loading = false; body.classList.remove('is-loading'); }
  }

  // ------------------------------------------------------------------ what can be shown
  // Every number a row (campaign, ad set, ad) or the summary can show. Meta's results come with the
  // rows; what happened after the form (booked, showed, clients, revenue, upsells) is worked out by
  // the portal from the Pipeline, the appointments and Încasări (api/_lib/ads-funnel.js).
  const per = (a, b) => (b ? a / b : null);
  const M = {
    budget: { label: 'Buget / zi', group: 'Bani', only: ['cols'] },
    spend: { label: 'Cheltuit', group: 'Bani', fmt: 'money', val: (x) => x.spend },
    revenue: { label: 'Încasări', group: 'Bani', fmt: 'money', val: (x) => x.revenue, hint: 'Ce au plătit clientele venite din reclamă' },
    profit: { label: 'Încasări minus cheltuit', group: 'Bani', fmt: 'money', val: (x) => x.revenue - x.spend },
    roas: { label: 'ROAS', group: 'Bani', fmt: 'x', val: (x) => per(x.revenue, x.spend), hint: 'Câți lei încasați pe 1 leu cheltuit' },
    upsellValue: { label: 'Valoare upsell', group: 'Bani', fmt: 'money', val: (x) => x.upsellValue },
    leads: { label: 'Leaduri', group: 'Leaduri și programări', fmt: 'num', strong: true, val: (x) => x.leads, hint: 'Cum le numără Meta' },
    cpl: { label: 'Cost / lead', group: 'Leaduri și programări', fmt: 'money', val: (x) => per(x.spend, x.leads) },
    pLeads: { label: 'Leaduri în portal', group: 'Leaduri și programări', fmt: 'num', val: (x) => x.pLeads, hint: 'Leadurile intrate în Pipeline din reclamă' },
    booked: { label: 'Programări', group: 'Leaduri și programări', fmt: 'num', strong: true, val: (x) => x.booked },
    costBooked: { label: 'Cost / programare', group: 'Leaduri și programări', fmt: 'money', val: (x) => per(x.spend, x.booked) },
    showed: { label: 'Prezentări', group: 'Leaduri și programări', fmt: 'num', strong: true, val: (x) => x.showed, hint: 'Au venit la programare' },
    costShowed: { label: 'Cost / prezentare', group: 'Leaduri și programări', fmt: 'money', val: (x) => per(x.spend, x.showed) },
    clients: { label: 'Clienți', group: 'Leaduri și programări', fmt: 'num', val: (x) => x.clients, hint: 'Au plătit cel puțin o dată' },
    costClient: { label: 'Cost / client', group: 'Leaduri și programări', fmt: 'money', val: (x) => per(x.spend, x.clients) },
    upsells: { label: 'Upselluri', group: 'Leaduri și programări', fmt: 'num', val: (x) => x.upsells },
    costUpsell: { label: 'Cost / upsell', group: 'Leaduri și programări', fmt: 'money', val: (x) => per(x.spend, x.upsells) },
    rateBooked: { label: '% programate', group: 'Rate', fmt: 'pct', val: (x) => per(x.booked, x.pLeads), hint: 'Din leadurile din portal' },
    rateShowed: { label: '% prezentate', group: 'Rate', fmt: 'pct', val: (x) => per(x.showed, x.booked), hint: 'Din programări' },
    rateClient: { label: '% clienți', group: 'Rate', fmt: 'pct', val: (x) => per(x.clients, x.pLeads), hint: 'Din leadurile din portal' },
    rateLead: { label: '% click → lead', group: 'Rate', fmt: 'pct', val: (x) => per(x.leads, x.linkClicks) },
    impressions: { label: 'Afișări', group: 'Meta', fmt: 'num', val: (x) => x.impressions },
    reach: { label: 'Persoane atinse', group: 'Meta', fmt: 'num', val: (x) => x.reach },
    frequency: { label: 'Frecvență', group: 'Meta', fmt: 'dec', val: (x) => per(x.impressions, x.reach) },
    cpm: { label: 'CPM', group: 'Meta', fmt: 'money', val: (x) => (x.impressions ? x.spend / x.impressions * 1000 : null), hint: 'Cost pe 1000 de afișări' },
    clicks: { label: 'Clickuri', group: 'Meta', fmt: 'num', val: (x) => x.clicks },
    linkClicks: { label: 'Clickuri pe link', group: 'Meta', fmt: 'num', val: (x) => x.linkClicks },
    ctr: { label: 'CTR', group: 'Meta', fmt: 'pct', val: (x) => per(x.clicks, x.impressions) },
    linkCtr: { label: 'CTR link', group: 'Meta', fmt: 'pct', val: (x) => per(x.linkClicks, x.impressions) },
    cpc: { label: 'Cost / click', group: 'Meta', fmt: 'money', val: (x) => per(x.spend, x.linkClicks || x.clicks) },
    campaignsOn: { label: 'Campanii pornite', group: 'Meta', fmt: 'num', only: ['cards'], val: (x) => x.on },
  };
  const GROUPS = ['Bani', 'Leaduri și programări', 'Rate', 'Meta'];
  const DEF_COLS = ['budget', 'spend', 'leads', 'cpl', 'booked', 'costBooked', 'showed', 'costShowed', 'revenue', 'roas'];
  const DEF_CARDS = ['spend', 'leads', 'cpl', 'booked', 'costBooked', 'showed', 'costShowed', 'revenue'];
  const SUMS = ['spend', 'leads', 'impressions', 'reach', 'clicks', 'linkClicks', 'pLeads', 'booked', 'showed', 'clients', 'revenue', 'upsells', 'upsellValue'];
  // a card's icon: by what it counts
  const iconOf = (id) => {
    const m = M[id];
    if (m.fmt === 'pct') return 'percent';
    if (/^(booked|showed|costBooked|costShowed)$/.test(id)) return 'calendar';
    if (/^(clients|costClient)$/.test(id)) return 'users';
    if (/^(leads|pLeads|cpl)$/.test(id)) return 'userPlus';
    if (/^(impressions|reach|frequency|cpm)$/.test(id)) return 'eye';
    if (m.fmt === 'money' || m.fmt === 'x') return 'wallet';
    return 'zap';
  };
  const fmt = (id, v) => {
    if (v == null || !Number.isFinite(v)) return '-';
    const f = M[id].fmt;
    if (f === 'money') return money(v);
    if (f === 'pct') return (Math.round(v * 1000) / 10).toLocaleString('ro-RO') + '%';
    if (f === 'x') return (Math.round(v * 100) / 100).toLocaleString('ro-RO') + 'x';
    if (f === 'dec') return (Math.round(v * 100) / 100).toLocaleString('ro-RO');
    return K.num(v);
  };
  const okIds = (list, part) => (Array.isArray(list) ? list : []).filter((id) => M[id] && (!M[id].only || M[id].only.includes(part)));
  const cols = () => okIds(K.prefs.get('ads.cols', DEF_COLS), 'cols');
  const cards = () => okIds(K.prefs.get('ads.cards', DEF_CARDS), 'cards');

  function customizeAds() {
    K.customize({
      title: 'Coloane și KPI', subtitle: 'Alegi ce cifre vezi sus și ce coloane are tabelul, în ordinea ta. Se păstrează pe contul tău.',
      catalog: M, groups: GROUPS,
      parts: [
        { key: 'cards', label: 'Rezumatul de sus', hint: 'Pentru campaniile selectate, sau pentru tot contul când nu e nimic selectat. Oricâte.', value: cards(), def: DEF_CARDS, min: 1 },
        { key: 'cols', label: 'Coloanele tabelului', hint: 'Dacă sunt multe, tabelul se derulează în lateral.', value: cols(), def: DEF_COLS, min: 1 },
      ],
      async onSave(v) {
        await K.prefs.set('ads.cards', v.cards);
        await K.prefs.set('ads.cols', v.cols);
        render();
      },
    });
  }

  function render() {
    const d = A.d, body = panel.querySelector('[data-body]');
    if (!d.ready) {
      body.innerHTML = '<div class="k-card ad-setup"><span class="k-icon-chip is-warn">' + icon('alert') + '</span><div><b>Reclamele nu sunt încă legate</b><p>' + esc(d.message || '') + '</p>' +
        '<button type="button" class="k-btn is-primary is-sm" data-goto="integrari">' + icon('facebook') + 'Integrări → Facebook</button></div></div>';
      return;
    }
    const active = d.campaigns.filter((c) => c.status === 'ACTIVE').length;
    const tok = d.token;
    const days = tok && tok.expiresAt ? Math.round((tok.expiresAt - Date.now()) / 86400e3) : null;
    const C = cols();
    const minw = 300 + C.length * 116 + 84;
    body.classList.toggle('is-readonly', !!d.readOnly);
    body.innerHTML =
      (d.readOnly ? '<div class="k-card ad-note is-warn">' + icon('alert') + '<span>Doar vizualizare: tokenul pentru reclame n-are permisiunea ads_management, așa că nu poți porni, opri sau schimba nimic de aici.</span><button type="button" class="k-btn is-sm" data-goto="integrari">Integrări</button></div>' : '') +
      (tok && days != null && days < 14 ? '<div class="k-card ad-note is-warn">' + icon('clock') + '<span>Conexiunea pentru reclame expiră ' + (days <= 0 ? 'azi' : 'în ' + K.plural(days, 'zi', 'zile')) + '. Integrări → Facebook → Reclame: lipește un token nou (unul de System User nu mai expiră).</span><button type="button" class="k-btn is-sm" data-goto="integrari">Integrări</button></div>' : '') +
      '<div class="ad-bar">' + K.seg('adperiod', periodPairs(), A.range ? 'custom' : A.period) +
        '<div class="ad-bar-right"><label class="ad-search">' + icon('search') + '<input data-q type="search" placeholder="Caută o campanie sau o reclamă…" value="' + esc(A.q) + '"></label>' +
        '<div class="k-chips"><button type="button" class="k-chip' + (A.show === 'active' ? ' is-on' : '') + '" data-show="active">Pornite<span>' + active + '</span></button><button type="button" class="k-chip' + (A.show === 'all' ? ' is-on' : '') + '" data-show="all">Toate<span>' + d.campaigns.length + '</span></button></div>' +
        '<button type="button" class="k-btn is-outline is-sm" data-act="customize">' + icon('sliders') + 'Coloane și KPI</button>' +
        '<a class="k-icon-btn" href="' + esc(d.adsManager) + '" target="_blank" rel="noopener" title="Deschide Ads Manager">' + icon('link') + '</a></div></div>' +
      '<div data-stats></div>' +
      (d.partial ? '<p class="k-muted ad-partial">' + esc(d.partial) + '</p>' : '') +
      '<div class="ad-scroll"><div class="ad-table" style="--ad-cols:minmax(300px,1.6fr) repeat(' + C.length + ',minmax(116px,1fr)) 84px;--ad-minw:' + minw + 'px">' +
        '<div class="ad-head-row"><span class="ad-head-name"><label class="ad-pick" title="Selectează toate campaniile afișate"><input type="checkbox" data-pick-all></label>Campanie</span>' +
          C.map((id) => '<span title="' + esc(M[id].hint || '') + '">' + esc(M[id].label) + '</span>').join('') + '<span></span></div>' +
        '<div class="ad-list" data-list></div></div></div>';
    paintStats();
    paintList();
  }
  // the numbers on top: of the picked campaigns, or of all of them
  function sumOf(list) {
    const t = { on: list.filter((c) => c.status === 'ACTIVE').length };
    SUMS.forEach((k) => { t[k] = list.reduce((n, c) => n + (Number(c[k]) || 0), 0); });
    return t;
  }
  function paintStats() {
    const box = panel.querySelector('[data-stats]');
    if (!box || !A.d || !A.d.campaigns) return;
    const picked = A.d.campaigns.filter((c) => A.sel.has(c.id));
    const t = sumOf(picked.length ? picked : A.d.campaigns);
    const un = A.d.unmatched && !picked.length ? A.d.unmatched.pLeads : 0;
    box.innerHTML =
      (picked.length ? '<div class="ad-scope">' + icon('check') + '<span>Cifrele sunt pentru <b>' + K.plural(picked.length, 'campanie selectată', 'campanii selectate') + '</b></span><button type="button" class="k-btn is-ghost is-sm" data-pick-clear>Toate campaniile</button></div>' : '') +
      '<div class="ad-stats">' + cards().map((id) => stat(iconOf(id), id === 'campaignsOn' && picked.length ? 'Pornite din cele alese' : M[id].label, fmt(id, M[id].val(t)), M[id].hint)).join('') + '</div>' +
      (un ? '<p class="k-muted ad-partial">' + K.plural(un, 'lead din reclame care nu mai sunt în listă nu intră', 'leaduri din reclame care nu mai sunt în listă nu intră') + ' în cifre.</p>' : '');
    syncPickAll();
  }
  // the "all" box in the header: on when every shown campaign is picked, half when some are
  function syncPickAll() {
    const all = panel.querySelector('[data-pick-all]');
    if (!all) return;
    const shown = visible();
    const n = shown.filter((c) => A.sel.has(c.id)).length;
    all.checked = !!shown.length && n === shown.length;
    all.indeterminate = n > 0 && n < shown.length;
  }
  const stat = (ic, label, val, hint) => '<div class="k-card ad-stat"' + (hint ? ' title="' + esc(hint) + '"' : '') + '><span class="k-icon-chip is-accent">' + icon(ic) + '</span><div><small>' + esc(label) + '</small><b>' + esc(val) + '</b></div></div>';

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
    setTimeout(syncPickAll, 0);
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
  // the chosen columns of one row
  function cellsOf(x, kind, c) {
    return cols().map((id) => {
      if (id === 'budget') {
        const v = kind === 'ad' ? '' : kind === 'adset' && c.cbo ? '<span class="ad-budget k-muted">al campaniei</span>' : budgetCell(x, kind);
        return '<div class="ad-cell' + (kind === 'ad' ? ' is-none' : '') + '" data-l="' + esc(M[id].label) + '">' + v + '</div>';
      }
      const v = fmt(id, M[id].val(x));
      return '<div class="ad-cell" data-l="' + esc(M[id].label) + '">' + (M[id].strong ? '<b>' + esc(v) + '</b>' : esc(v)) + '</div>';
    }).join('');
  }
  function campHtml(c) {
    const open = A.open.has(c.id);
    return '<article class="k-card ad-camp' + (open ? ' is-open' : '') + (c.status === 'ACTIVE' ? '' : ' is-off') + (A.sel.has(c.id) ? ' is-picked' : '') + '" data-camp="' + esc(c.id) + '">' +
      '<div class="ad-row is-camp">' +
        '<div class="ad-name"><label class="ad-pick" title="Selectează campania"><input type="checkbox" data-pick="' + esc(c.id) + '"' + (A.sel.has(c.id) ? ' checked' : '') + '></label>' + sw(c.id, c.status === 'ACTIVE', 'campaign') + '<button type="button" class="ad-title" data-toggle="' + esc(c.id) + '"><b>' + esc(c.name) + '</b><small>' + tag(c.effective) + K.plural(c.adsets.length, 'set', 'seturi') + ' · ' + K.plural(c.adsets.reduce((n, s) => n + s.ads.length, 0), 'reclamă', 'reclame') + made(c) + '</small></button></div>' +
        cellsOf(c, 'campaign') +
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
        cellsOf(s, 'adset', c) +
        '<div class="ad-acts"><button type="button" class="k-icon-btn" data-more="adset" data-id="' + esc(s.id) + '" data-name="' + esc(s.name) + '" title="Mai mult">' + icon('more') + '</button></div>' +
      '</div>' +
      '<div class="ad-ads">' + (s.ads.length ? s.ads.map(adHtml).join('') : '<p class="k-muted ad-empty">Nicio reclamă în set.</p>') + '</div>' +
      '</div>';
  }
  function adHtml(a) {
    return '<div class="ad-row is-ad' + (a.status === 'ACTIVE' ? '' : ' is-off') + '">' +
      '<div class="ad-name">' + sw(a.id, a.status === 'ACTIVE', 'ad') +
        (a.thumb ? '<img class="ad-thumb" src="' + esc(a.thumb) + '" alt="" loading="lazy" referrerpolicy="no-referrer">' : '<span class="ad-thumb is-empty">' + icon('image') + '</span>') +
        '<div class="ad-title"><b>' + esc(a.name) + '</b><small>' + tag(a.effective) + made(a, !!tag(a.effective)) + (a.review ? ' <span class="ad-review">' + esc(a.review) + '</span>' : '') + '</small></div></div>' +
      cellsOf(a, 'ad') +
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
    if (t.name === 'adperiod') {
      if (t.value === 'custom') return openRange(t.closest('[data-k-seg]').querySelector('[data-v="custom"]'));
      A.period = t.value; A.range = null; A.keep.clear(); return load();
    }
    if (t.matches('[data-pick]')) {
      if (t.checked) A.sel.add(t.dataset.pick); else A.sel.delete(t.dataset.pick);
      const art = t.closest('.ad-camp'); if (art) art.classList.toggle('is-picked', t.checked);
      return paintStats();
    }
    if (t.matches('[data-pick-all]')) {
      visible().forEach((c) => { if (t.checked) A.sel.add(c.id); else A.sel.delete(c.id); });
      paintList(); return paintStats();
    }
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
  // "Personalizat": two days, from and to (the results of every day in between)
  let rangeEl = null;
  function closeRange(apply) {
    if (!rangeEl) return;
    const m = rangeEl; rangeEl = null;
    m.classList.remove('is-open');
    setTimeout(() => m.remove(), 200);
    document.removeEventListener('mousedown', outsideRange, true);
    document.removeEventListener('keydown', escRange, true);
    // cancelled: the period chosen before stays lit
    if (!apply) panel.querySelectorAll('[data-k-seg="adperiod"] > button').forEach((b) => b.classList.toggle('is-on', b.dataset.v === (A.range ? 'custom' : A.period)));
  }
  const outsideRange = (e) => { if (rangeEl && !rangeEl.contains(e.target) && !e.target.closest('[data-v="custom"]')) closeRange(false); };
  const escRange = (e) => { if (e.key === 'Escape') { e.stopPropagation(); closeRange(false); } };
  function openRange(anchor) {
    if (rangeEl) { closeRange(false); return; }
    const today = K.today();
    const r = A.range || { since: K.addDays(today, -6), until: today };
    const m = document.createElement('div');
    m.className = 'k-menu ad-range';
    m.innerHTML = '<div class="k-menu-label">Perioadă personalizată</div>' +
      '<div class="ad-range-fields"><label><span>De la</span><input type="date" data-since value="' + r.since + '" max="' + today + '"></label>' +
      '<label><span>Până la</span><input type="date" data-until value="' + r.until + '" max="' + today + '"></label></div>' +
      '<div class="ad-range-quick">' + [['Luna asta', K.thisMonth() + '-01', today], ['Luna trecută', K.addMonths(K.thisMonth(), -1) + '-01', K.addDays(K.thisMonth() + '-01', -1)], ['90 de zile', K.addDays(today, -89), today]]
        .map(([l, a, b]) => '<button type="button" class="k-chip" data-q-since="' + a + '" data-q-until="' + b + '">' + l + '</button>').join('') + '</div>' +
      '<div class="ad-range-acts"><button type="button" class="k-btn is-ghost is-sm" data-range-cancel>Renunță</button><button type="button" class="k-btn is-primary is-sm" data-range-ok>' + icon('check') + 'Aplică</button></div>';
    document.body.appendChild(m);
    const b = anchor.getBoundingClientRect();
    m.style.top = (b.bottom + 6) + 'px';
    m.style.left = Math.max(8, Math.min(b.left, window.innerWidth - m.offsetWidth - 8)) + 'px';
    m.style.transformOrigin = 'top left';
    requestAnimationFrame(() => m.classList.add('is-open'));
    rangeEl = m;
    setTimeout(() => { document.addEventListener('mousedown', outsideRange, true); document.addEventListener('keydown', escRange, true); }, 0);
    m.addEventListener('click', (e) => {
      const qb = e.target.closest('[data-q-since]');
      if (qb) { m.querySelector('[data-since]').value = qb.dataset.qSince; m.querySelector('[data-until]').value = qb.dataset.qUntil; return; }
      if (e.target.closest('[data-range-cancel]')) return closeRange(false);
      if (!e.target.closest('[data-range-ok]')) return;
      let a = m.querySelector('[data-since]').value, z = m.querySelector('[data-until]').value;
      if (!a || !z) { K.ui().toast('Alege ambele zile.', 'error'); return; }
      if (a > z) [a, z] = [z, a];
      A.range = { since: a, until: z > today ? today : z };
      A.keep.clear();
      closeRange(true);
      load();
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
    if (t.closest('[data-pick-clear]')) { A.sel.clear(); paintList(); return paintStats(); }
    if (t.closest('[data-act="reload"]')) { panel.querySelector('[data-body]').innerHTML = '<div class="k-skel" style="height:360px"></div>'; return load(); }
    if (t.closest('[data-act="defaults"]')) return openDefaults();
    if (t.closest('[data-act="customize"]')) return customizeAds();
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
        K.field('Numele reclamei', '<input name="n_ad" value="' + esc(names.ad || '') + '">', 'full', 'Poți folosi {oras_scurt} (TM, AR), {proc} (LIPO, CAV 1+1, RESTART…), {unghi} (reclama în 2-3 cuvinte), {oferta}, {oras}, {km}, {varsta}, {hook}, {data}.') +
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
