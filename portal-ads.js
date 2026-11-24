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
  const A = { d: null, period: 'today', range: null, show: 'active', q: '', open: new Set(), keep: new Set(), sel: new Set(), loading: false, cache: new Map(), seq: 0, want: new Map(), drawn: '' };
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
      '<div class="k-head"><div><div class="k-eyebrow">Marketing</div><h2>Reclame</h2></div>' +
      '<div class="k-head-actions"><button type="button" class="k-btn is-outline" data-act="defaults" title="Setări implicite">' + icon('sliders') + '<span class="ad-sm-hide">Setări implicite</span></button>' +
      '<button type="button" class="k-btn is-accent" data-act="creative">' + icon('sparkles') + '<span class="ad-sm-hide">Publică un creative</span><span class="ad-sm-only">Publică</span></button></div></div>' +
      '<div class="at-views">' + K.seg('adview', [['camp', 'Campanii', 'zap'], ['top', 'Clasament', 'trophy']], 'camp') + '</div>' +
      '<div data-body><div class="k-skel" style="height:110px;margin-bottom:1rem"></div><div class="k-skel" style="height:360px"></div></div>' +
      '<div data-top hidden></div>';
    panel.addEventListener('click', onClick);
    panel.addEventListener('change', onChange);
    panel.addEventListener('input', (e) => {
      if (e.target.matches('[data-q]')) { A.q = e.target.value; paintList(); }
      if (e.target.matches('[data-tq]')) { T.q = e.target.value; T.shown = PAGE; paintTopList(); }
      if (e.target.matches('[data-tmin]')) { clearTimeout(T.minT); T.minT = setTimeout(() => { T.min = Math.max(0, Number(e.target.value) || 0); saveTop(); T.shown = PAGE; paintTopList(); }, 250); }
    });
    panel.addEventListener('keydown', (e) => { if (e.key === 'Enter' && e.target.matches('[data-budget-input]')) { e.preventDefault(); saveBudget(e.target.closest('[data-budget-box]')); } });
  }
  // quiet: refresh after a change (statuses that follow from it) without dimming the page
  const qsOf = () => (A.range ? 'since=' + A.range.since + '&until=' + A.range.until : 'period=' + A.period);
  async function load(quiet) {
    const qs = qsOf(), seq = ++A.seq;
    const body = panel.querySelector('[data-body]');
    // this period was seen in the last 10 minutes: its numbers show at once, fresh ones follow
    const kept = A.cache.get(qs);
    if (kept && Date.now() - kept.at < 10 * 60e3) show(kept.d, body);
    else if (A.d && quiet !== true) body.classList.add('is-loading');
    A.loading = true;
    try {
      // the columns and cards this account chose (K.prefs) come with the first load
      const [d] = await Promise.all([K.api('/api/ads-manager?' + qs), K.prefs.load()]);
      A.cache.set(qs, { d, at: Date.now() });
      if (seq !== A.seq) return; // a newer pick is on screen: this one is only kept for later
      A.at = Date.now(); A.staleSince = 0;
      show(d, body);
      prefetch();
    }
    catch (e) {
      if (seq !== A.seq) return;
      if (!kept && !A.d) body.innerHTML = K.empty('alert', 'Nu am putut încărca reclamele', esc(K.errText(e)), '<button type="button" class="k-btn is-primary" data-act="reload">Reîncearcă</button>');
      else if (A.d) { A.staleSince = A.staleSince || A.at || Date.now(); paintNotes(); } // the old numbers stay, marked as old
    }
    finally { if (seq === A.seq) { A.loading = false; body.classList.remove('is-loading'); } }
  }
  function show(d, body) {
    applyWant(d);
    withLeads(d);
    // nothing changed: the page stays exactly as it is (no redraw, no jump)
    const key = JSON.stringify(d);
    if (key === A.key && body.querySelector('[data-list]')) return;
    // the same period, already on screen: only the numbers and the cards that changed move (the page isn't redrawn)
    const inPlace = A.d && A.d.ready && d.ready && A.drawn === qsOf() && body.querySelector('[data-list]') && !!A.d.readOnly === !!d.readOnly && (A.d.partial || '') === (d.partial || '');
    A.d = d; A.key = key;
    // a picked campaign that no longer exists drops out of the pick
    if (A.d.campaigns) { const ids = new Set(A.d.campaigns.map((c) => c.id)); A.sel.forEach((id) => { if (!ids.has(id)) A.sel.delete(id); }); }
    if (inPlace) paintAll(); else render();
  }
  // what was just switched shows as chosen, also in numbers Meta sends a moment later (its own status can lag)
  const WANT_MS = 3 * 60e3;
  const setStatus = (x, status) => { if (!x) return; x.status = status; if (!x.effective || x.effective === 'ACTIVE' || x.effective === 'PAUSED') x.effective = status; };
  function applyWant(d) {
    if (!d || !d.campaigns || !A.want.size) return;
    const now = Date.now();
    A.want.forEach((w, id) => { if (!w.busy && now - w.at > WANT_MS) A.want.delete(id); });
    // campaigns, ad sets and ads alike
    d.campaigns.forEach((c) => {
      const w = A.want.get(c.id); if (w) setStatus(c, w.status);
      (c.adsets || []).forEach((s) => { const ws = A.want.get(s.id); if (ws) setStatus(s, ws.status); (s.ads || []).forEach((a) => { const wa = A.want.get(a.id); if (wa) setStatus(a, wa.status); }); });
    });
  }
  function paintChips() {
    const a = panel.querySelector('[data-show="active"] span'), b = panel.querySelector('[data-show="all"] span');
    if (a) a.textContent = A.d.campaigns.filter((c) => c.status === 'ACTIVE').length;
    if (b) b.textContent = A.d.campaigns.length;
  }
  // what the page says on top of the list, true at this reading: the account not delivering, the guard silent, Meta
  // limiting, the costs on a fallback, and the changes of the last 3 days that still hold (api/ads-manager.js)
  function paintNotes() {
    const box = panel.querySelector('[data-notes]'), d = A.d;
    if (!box || !d) return;
    const line = (tone, html) => '<p class="k-muted ad-partial' + (tone ? ' is-' + tone : '') + '">' + html + '</p>';
    const stale = d.stale || A.staleSince;
    box.innerHTML = (d.notices || []).map((n) => line(n.tone, esc(n.text))).join('') +
      (d.scope && d.scope.text ? line('', esc(d.scope.text)) : '') +
      (d.partial ? line('', esc(d.partial)) : '') +
      (stale ? line('warn', (d.stale ? 'Meta limitează acum citirile contului: ' : 'Nu am putut reîmprospăta: ') + 'cifrele sunt de la ' + esc(new Date(stale).toLocaleTimeString('ro-RO', { hour: '2-digit', minute: '2-digit' })) + '.') : '');
    const n = (d.guard && d.guard.log || []).length, btn = panel.querySelector('[data-act="changes"] span');
    if (btn) btn.textContent = n ? String(n) : '';
  }
  // the changes of the last 3 days that still hold (the guard's and the ones asked for), in their own list
  function openChanges() {
    const log = (A.d && A.d.guard && A.d.guard.log) || [];
    const what = (e) => e.type === 'up' ? '📈 Buget mărit ' + e.from + ' → ' + e.to + ' lei/zi' : e.trim ? '✂️ Buget scăzut ' + e.from + ' → ' + e.to + ' lei/zi' : e.type === 'down' ? '📉 Buget înapoi ' + e.from + ' → ' + e.to + ' lei/zi' : e.job ? '⛔ Oprită' : e.adOnly ? '⛔ O reclamă oprită automat' : '⛔ Oprită automat';
    K.drawer({
      title: 'Schimbări', icon: 'clock', width: 520, subtitle: 'Ultimele 3 zile, doar ce e încă valabil.',
      body: log.length ? '<div class="k-list">' + log.map((e) => '<div class="k-row"><span class="k-icon-chip is-' + (e.type === 'up' ? 'good' : 'bad') + '">' + icon(e.type === 'up' ? 'trend' : e.type === 'stop' ? 'ban' : 'sliders') + '</span>' +
        '<div class="k-row-main"><div class="k-row-title">' + esc(e.campaignName || e.adName || '') + (e.adOnly ? ' <small>„' + esc(e.adName) + '”</small>' : '') + '</div><div class="k-row-sub">' + esc(what(e)) + (e.why ? ' · ' + esc(e.why) : '') + '</div></div>' +
        '<div class="k-row-end"><small>' + esc(K.ago(e.at)) + '</small></div></div>').join('') + '</div>'
        : K.empty('clock', 'Nicio schimbare', 'Nimic nu s-a schimbat în ultimele 3 zile.'),
    });
  }
  function paintAll() { paintChips(); paintStats(); paintNotes(); paintList(); }
  // the other periods load quietly, one after another, so Azi / Ieri / 30 zile show at once
  let prefetching = false;
  async function prefetch() {
    if (prefetching) return;
    prefetching = true;
    try {
      for (const [p] of PERIODS) {
        const qs = 'period=' + p, kept = A.cache.get(qs);
        if (kept && Date.now() - kept.at < 5 * 60e3) continue;
        if (!K.isActive('reclame') || document.hidden) break;
        try { A.cache.set(qs, { d: await K.api('/api/ads-manager?' + qs), at: Date.now() }); } catch (e) { break; }
      }
    } finally { prefetching = false; }
  }
  // after a change in Meta (paused, edited, deleted) the kept periods are out of date
  const reloadChanged = () => { A.cache.clear(); load(true); };

  // ------------------------------------------------------------------ what can be shown
  // Every number a row (campaign, ad set, ad) or the summary can show. Meta's results come with the
  // rows; what happened after the form (booked, showed, clients, revenue, upsells) is worked out by
  // the portal from the Pipeline, the appointments and Încasări (api/_lib/ads-funnel.js).
  const per = (a, b) => (b ? a / b : null);
  const M = {
    budget: { label: 'Buget / zi', group: 'Bani', only: ['cols'] },
    spend: { label: 'Cheltuit', group: 'Bani', fmt: 'money', val: (x) => x.spend },
    revenue: { label: 'Încasări', group: 'Bani', fmt: 'money', val: (x) => x.revenue, hint: 'Ce au plătit clientele venite din reclamă' },
    profit: { label: 'Încasări minus cheltuit', group: 'Bani', fmt: 'money', val: (x) => x.revenue - sNew(x) },
    roas: { label: 'ROAS', group: 'Bani', fmt: 'x', val: (x) => per(x.revenue, sNew(x)), hint: 'Câți lei încasați pe 1 leu cheltuit (de pe 16 oct)' },
    upsellValue: { label: 'Valoare upsell', group: 'Bani', fmt: 'money', val: (x) => x.upsellValue },
    leads: { label: 'Leaduri', group: 'Leaduri și programări', fmt: 'num', strong: true, val: (x) => x.leads, hint: 'Cum le numără Meta' },
    // (the account's summary: only the lead-form campaigns' spend, the website ones bring no form leads)
    cpl: { label: 'Cost / lead', group: 'Leaduri și programări', fmt: 'money', val: (x) => per(x.spendLead != null ? x.spendLead : x.spend, x.leads) },
    pLeads: { label: 'Leaduri în portal', group: 'Leaduri și programări', fmt: 'num', val: (x) => x.pLeads, hint: 'Leadurile intrate în Pipeline din reclamă' },
    booked: { label: 'Programări', group: 'Leaduri și programări', fmt: 'num', strong: true, val: (x) => x.booked },
    costBooked: { label: 'Cost / programare', group: 'Leaduri și programări', fmt: 'money', val: (x) => per(sNew(x), x.booked), hint: 'Cheltuiala de pe 16 oct încoace / programările de atunci' },
    showed: { label: 'Prezentări', group: 'Leaduri și programări', fmt: 'num', strong: true, val: (x) => x.showed, hint: 'Au venit la salon: programare finalizată sau plătită, ori leadul e la „Venit la programare” / „Luat pachet”' },
    costShowed: { label: 'Cost / prezentare', group: 'Leaduri și programări', fmt: 'money', val: (x) => per(sNew(x), x.showed), hint: 'Cheltuiala de pe 16 oct încoace / prezentările de atunci' },
    clients: { label: 'Clienți', group: 'Leaduri și programări', fmt: 'num', val: (x) => x.clients, hint: 'Au plătit cel puțin o dată' },
    costClient: { label: 'Cost / client', group: 'Leaduri și programări', fmt: 'money', val: (x) => per(sNew(x), x.clients) },
    upsells: { label: 'Upselluri', group: 'Leaduri și programări', fmt: 'num', val: (x) => x.upsells },
    costUpsell: { label: 'Cost / upsell', group: 'Leaduri și programări', fmt: 'money', val: (x) => per(sNew(x), x.upsells) },
    rateBooked: { label: '% programate', group: 'Rate', fmt: 'pct', val: (x) => per(x.booked, x.pLeads), hint: 'Din leadurile din portal' },
    rateShowed: { label: '% prezentate', group: 'Rate', fmt: 'pct', val: (x) => per(x.showed, x.booked), hint: 'Din programări' },
    rateClient: { label: '% clienți', group: 'Rate', fmt: 'pct', val: (x) => per(x.clients, x.pLeads), hint: 'Din leadurile din portal' },
    rateLead: { label: '% click → lead', group: 'Rate', fmt: 'pct', val: (x) => per(x.leads, x.linkClicks) },
    impressions: { label: 'Afișări', group: 'Meta', fmt: 'num', val: (x) => x.impressions },
    reach: { label: 'Persoane atinse', group: 'Meta', fmt: 'num', val: (x) => x.reach },
    frequency: { label: 'Frecvență', group: 'Meta', fmt: 'dec', val: (x) => per(x.impressions, x.reach) },
    cpm: { label: 'CPM', group: 'Meta', fmt: 'money', val: (x) => (x.impressions ? x.spend / x.impressions * 1000 : null), hint: 'Cost pe 1000 de afișări' },
    clicks: { label: 'Clickuri', group: 'Meta', fmt: 'num', val: (x) => x.clicks },
    linkClicks: { label: 'Clickuri pe link', short: 'Clickuri', group: 'Meta', fmt: 'num', hint: 'Doar clickurile pe link, cum le numără Meta', val: (x) => x.linkClicks },
    ctr: { label: 'CTR', group: 'Meta', fmt: 'pct', val: (x) => per(x.clicks, x.impressions) },
    linkCtr: { label: 'CTR link', group: 'Meta', fmt: 'pct', val: (x) => per(x.linkClicks, x.impressions) },
    cpc: { label: 'CPC', group: 'Meta', fmt: 'money', val: (x) => per(x.spend, x.linkClicks || x.clicks), hint: 'Cost pe click pe link' },
    visits: { label: 'Vizite pe pagină', group: 'Site', fmt: 'num', strong: true, val: (x) => x.visits || 0, hint: 'Pagina s-a deschis după click (landing page view)' },
    costVisit: { label: 'Cost/vizită', group: 'Site', fmt: 'money', val: (x) => per(x.spend, x.visits) },
    carts: { label: 'Adăugări în coș', group: 'Site', fmt: 'num', val: (x) => x.carts || 0 },
    checkouts: { label: 'Începe plata', group: 'Site', fmt: 'num', val: (x) => x.checkouts || 0 },
    purchases: { label: 'Achiziții', group: 'Site', fmt: 'num', strong: true, val: (x) => x.purchases || 0, hint: 'Plăți pe site, cum le numără Meta (pixel și server)' },
    costPurchase: { label: 'Cost / achiziție', group: 'Site', fmt: 'money', val: (x) => per(x.spend, x.purchases) },
    purchaseValue: { label: 'Valoare achiziții', group: 'Site', fmt: 'money', val: (x) => x.purchaseValue || 0 },
    siteRoas: { label: 'ROAS site', group: 'Site', fmt: 'x', val: (x) => per(x.purchaseValue, x.spend), hint: 'Valoarea achizițiilor de pe site / cheltuit' },
    campaignsOn: { label: 'Campanii pornite', group: 'Meta', fmt: 'num', only: ['cards'], val: (x) => x.on },
  };
  const SUMS = ['spend', 'spendNew', 'leads', 'impressions', 'reach', 'clicks', 'linkClicks', 'pLeads', 'booked', 'showed', 'clients', 'revenue', 'upsells', 'upsellValue', 'visits', 'carts', 'checkouts', 'purchases', 'purchaseValue',
    'schedules', 'pixelLeads', 'sCardPaid', 'sCardPaidLei', 'sCardRes', 'sCardResLei', 'sCardOpen', 'sBook', 'sPay', 'sPayLei', 'sLead',
    'uLeads', 'oBooked', 'oShowed', 'oCardRes', 'oCardPaid', 'oCardPaidLei', 'oCardOpen', 'oCashed', 'oCashedOnline'];
  // what the ads spent in the days our own data counts (from 16.10.2026, 22:05): the costs after the form use it
  const sNew = (x) => (x.spendNew != null ? x.spendNew : x.spend);
  const fmt = (id, v) => {
    if (v == null || !Number.isFinite(v)) return '-';
    const f = M[id].fmt;
    if (f === 'money') return money(v);
    if (f === 'pct') return (Math.round(v * 1000) / 10).toLocaleString('ro-RO') + '%';
    if (f === 'x') return (Math.round(v * 100) / 100).toLocaleString('ro-RO') + 'x';
    if (f === 'dec') return (Math.round(v * 100) / 100).toLocaleString('ro-RO');
    return K.num(v);
  };
  // (23.11, the owner: one set of numbers for every ad, lead form or website: the tiles under each campaign; the table keeps
  // only the budget, the choice of columns and cards is gone)
  const cols = () => ['budget'];

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
    // the columns as narrow as their numbers allow, the gaps counted, so a wide screen shows them all without scrolling
    const minw = 264 + C.length * 84 + 72 + (C.length + 1) * 10;
    const old = body.querySelector('.ad-scroll'), sx = old ? old.scrollLeft : 0;
    body.classList.toggle('is-readonly', !!d.readOnly);
    body.innerHTML =
      (d.readOnly ? '<div class="k-card ad-note is-warn">' + icon('alert') + '<span>Doar vizualizare: tokenul pentru reclame n-are permisiunea ads_management, așa că nu poți porni, opri sau schimba nimic de aici.</span><button type="button" class="k-btn is-sm" data-goto="integrari">Integrări</button></div>' : '') +
      (tok && days != null && days < 14 ? '<div class="k-card ad-note is-warn">' + icon('clock') + '<span>Conexiunea pentru reclame expiră ' + (days <= 0 ? 'azi' : 'în ' + K.plural(days, 'zi', 'zile')) + '.<span class="ad-sm-hide"> Integrări → Facebook → Reclame: lipește un token nou (unul de System User nu mai expiră).</span></span><button type="button" class="k-btn is-sm" data-goto="integrari">Integrări</button></div>' : '') +
      '<div class="ad-bar">' + K.seg('adperiod', periodPairs(), A.range ? 'custom' : A.period) +
        '<div class="ad-bar-right"><label class="ad-search">' + icon('search') + '<input data-q type="search" placeholder="Caută o campanie sau o reclamă…" value="' + esc(A.q) + '"></label>' +
        '<div class="k-chips"><button type="button" class="k-chip' + (A.show === 'active' ? ' is-on' : '') + '" data-show="active">Pornite<span>' + active + '</span></button><button type="button" class="k-chip' + (A.show === 'all' ? ' is-on' : '') + '" data-show="all">Toate<span>' + d.campaigns.length + '</span></button></div>' +
        '<button type="button" class="k-btn is-outline is-sm" data-act="changes" title="Schimbările din ultimele 3 zile">' + icon('clock') + '<span class="ad-sm-hide">Schimbări</span><span class="ad-count"></span></button>' +
        '<button type="button" class="k-icon-btn ad-refresh' + (A.spin ? ' is-spinning' : '') + '" data-act="refresh" title="Actualizează" aria-label="Actualizează">' + icon('refresh') + '</button>' +
        '<a class="k-icon-btn" href="' + esc(d.adsManager) + '" target="_blank" rel="noopener" title="Deschide Ads Manager">' + icon('link') + '</a></div></div>' +
      '<div data-stats></div>' +
      '<div data-notes></div>' +
      '<div class="ad-scroll"><div class="ad-table" style="--ad-cols:minmax(264px,2fr) repeat(' + C.length + ',minmax(84px,1fr)) 72px;--ad-minw:' + minw + 'px">' +
        '<div class="ad-head-row"><span class="ad-head-name"><label class="ad-pick" title="Selectează toate campaniile afișate"><input type="checkbox" data-pick-all></label>Campanie</span>' +
          C.map((id) => '<span title="' + esc(M[id].hint || '') + '">' + esc(M[id].label) + '</span>').join('') + '<span></span></div>' +
        '<div class="ad-list" data-list></div></div></div>';
    A.drawn = qsOf();
    paintNotes();
    dockPeriod();
    paintStats();
    paintList();
    if (sx) body.querySelector('.ad-scroll').scrollLeft = sx;
  }
  // the numbers on top: of the picked campaigns, or of all of them
  function sumOf(list) {
    const t = { on: list.filter((c) => c.status === 'ACTIVE').length };
    SUMS.forEach((k) => { t[k] = list.reduce((n, c) => n + (Number(c[k]) || 0), 0); });
    t.spendLead = list.reduce((n, c) => n + (c.site ? 0 : Number(c.spend) || 0), 0);
    // Meta didn't give the spend of our data's days: the costs use the period's (like each campaign's own)
    if (list.length && list.every((c) => c.spendNew == null)) t.spendNew = null;
    return t;
  }
  function paintStats() {
    const box = panel.querySelector('[data-stats]');
    if (!box || !A.d || !A.d.campaigns) return;
    const picked = A.d.campaigns.filter((c) => A.sel.has(c.id));
    const list = picked.length ? picked : A.d.campaigns;
    const t = sumOf(list);
    box.innerHTML =
      (picked.length ? '<div class="ad-scope">' + icon('check') + '<span>Cifrele sunt pentru <b>' + K.plural(picked.length, 'campanie selectată', 'campanii selectate') + '</b></span><button type="button" class="k-btn is-ghost is-sm" data-pick-clear>Toate campaniile</button></div>' : '') +
      outBox(t, list.some((c) => c.site), 'sum') +
      (reachesBack() ? '<p class="k-muted ad-partial">Programările, prezentările, cardurile, încasările și costurile lor: de pe 16 oct, 22:05 (datele din portal), cu cheltuiala din aceleași zile.</p>' : '');
    syncPickAll();
  }
  // Every ad's outcome, the same tiles for a lead-form ad and a website ad, for an ad, a campaign and the summary (the owner,
  // 23.11: „vreau să știu tot tot tot”): what Meta counts (spend, leads; on the site: page views, CTR) and what she did
  // after it, by her phone (api/_lib/ad-outcomes.js: bookings, visits, cards, Încasări, 30 days, her first ad touch).
  // The big ones first, the rest in a compact row; a cost or a rate without its base shows „-”.
  const nOr = (v) => (Number(v) || 0);
  const leiOf = (v) => K.lei(nOr(v), 0);
  // her leads: a lead form's (Meta's count) and the site's forms (ours, by the ad's tags)
  const leadsOf = (x, site) => (site ? 0 : nOr(x.leads)) + nOr(x.sLead);
  function outTiles(x, site) {
    const cost = (base, n) => (n ? money(base / n) : '-');
    const spentNew = sNew(x);
    const big = [
      ['Cheltuit', money(nOr(x.spend)), site && x.impressions ? K.plural(nOr(x.impressions), 'afișare', 'afișări') : ''],
      ['Leaduri', K.num(nOr(x.uLeads)), ''],
      ['Programări', K.num(nOr(x.oBooked)), ''],
      ['Carduri plătite', K.num(nOr(x.oCardPaid)), [x.oCardPaid ? leiOf(x.oCardPaidLei) : '', x.oCardOpen ? K.plural(x.oCardOpen, 'început neplătit', 'începute neplătite') : ''].filter(Boolean).join(' · ')],
      ['Încasat', money(nOr(x.oCashed)), x.oCashedOnline ? leiOf(x.oCashedOnline) + ' online' : ''],
      ['ROAS', spentNew && x.oCashed ? fmt('roas', x.oCashed / spentNew) : '-', ''],
    ];
    const small = [
      ['Prezentări', K.num(nOr(x.oShowed))],
      ['Carduri rezervate', K.num(nOr(x.oCardRes))],
      ['Cost/lead', cost(nOr(x.spend), nOr(x.uLeads))],
      ['Cost/programare', cost(spentNew, nOr(x.oBooked))],
      ['Cost/card plătit', cost(spentNew, nOr(x.oCardPaid))],
    ].concat(site ? [
      ['Vizite pe pagină', K.num(nOr(x.visits))],
      ['Cost/vizită', cost(nOr(x.spend), nOr(x.visits))],
      ['CTR', x.impressions ? fmt('linkCtr', nOr(x.linkClicks) / x.impressions) : '-'],
    ] : []);
    return { big, small };
  }
  // Meta's own count of the pixel's events on a website ad, when it has any
  const pixelLine = (x) => {
    const p = [[x.purchases, 'achiziție', 'achiziții'], [x.checkouts, 'plată începută', 'plăți începute'], [x.schedules, 'programare', 'programări'], [x.pixelLeads, 'lead', 'leaduri']]
      .filter((q) => nOr(q[0])).map((q) => K.plural(nOr(q[0]), q[1], q[2]));
    return p.length ? '<p class="ad-sx-px" title="Cum le numără Meta, din pixel">Pixel Meta: ' + esc(p.join(' · ')) + '</p>' : '';
  };
  // kind: 'sum' (the summary), 'camp' (under a campaign), 'ad'
  function outBox(x, site, kind) {
    const { big, small } = outTiles(x, site);
    return '<div class="ad-sx is-' + kind + '"><div class="ad-sx-grid">' + big.map(([label, val, sub]) =>
      '<div class="ad-sx-t' + (val === '-' ? ' is-none' : '') + '"><small>' + esc(label) + '</small><b>' + esc(val) + '</b>' + (sub ? '<i>' + esc(sub) + '</i>' : '') + '</div>').join('') + '</div>' +
      '<div class="ad-sx-row">' + small.map(([label, val]) => '<span' + (val === '-' ? ' class="is-none"' : '') + '><small>' + esc(label).replace('/', '/<wbr>') + '</small><b>' + esc(val) + '</b></span>').join('') + '</div>' +
      (site ? pixelLine(x) : '') + '</div>';
  }
  // under a campaign: its tiles, then each ad's (folded: „Pe reclame”)
  function campOut(c) {
    const list = (c.adsets || []).flatMap((s) => (s.ads || []).map((a) => Object.assign({}, a, { on: a.status === 'ACTIVE' && s.status === 'ACTIVE' })));
    const open = A.open.has(c.id);
    return '<div class="ad-sxc">' + outBox(c, c.site, 'camp') +
      (list.length ? '<button type="button" class="k-btn is-ghost is-sm ad-sx-more" data-sx-ads="' + esc(c.id) + '" aria-expanded="' + open + '">' + icon(open ? 'up' : 'down') + '<span>' + (open ? 'Ascunde reclamele' : 'Pe reclame (' + list.length + ')') + '</span></button>' : '') +
      (open ? '<div class="ad-sx-ads">' + list.map((a) => '<section class="ad-sx-ad' + (a.on ? '' : ' is-off') + '"><p class="ad-sx-name"><b>' + esc(a.name) + '</b>' + (a.on ? '' : '<span class="k-tag">Oprită</span>') + '</p>' + outBox(a, c.site, 'ad') + '</section>').join('') + '</div>' : '') +
      '</div>';
  }
  // the leads of every row, the same way (a website campaign's are the site's forms)
  function withLeads(d) {
    (d.campaigns || []).forEach((c) => {
      c.uLeads = leadsOf(c, c.site);
      (c.adsets || []).forEach((s) => { s.uLeads = leadsOf(s, c.site); (s.ads || []).forEach((a) => { a.uLeads = leadsOf(a, c.site); }); });
    });
  }
  // the period starts before the portal's own data (16.10.2026): the after-form numbers cover only part of it
  const reachesBack = () => (A.range ? A.range.since < '2026-10-16' : A.period === '30d' || A.period === 'max');
  // the "all" box in the header: on when every shown campaign is picked, half when some are
  function syncPickAll() {
    const all = panel.querySelector('[data-pick-all]');
    if (!all) return;
    const shown = visible();
    const n = shown.filter((c) => A.sel.has(c.id)).length;
    all.checked = !!shown.length && n === shown.length;
    all.indeterminate = n > 0 && n < shown.length;
  }
  // on a phone these three come first and big, for the account and for every campaign
  const KEY = ['leads', 'cpl', 'spend'];

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
    const html = list.map(campHtml);
    const now = [...box.children];
    if (list.length && now.length === list.length && list.every((c, i) => now[i].dataset && now[i].dataset.camp === c.id)) {
      list.forEach((c, i) => {
        if (now[i]._h === html[i] || now[i].querySelector('[data-budget-input]')) return;
        const tmp = document.createElement('div'); tmp.innerHTML = html[i];
        const card = tmp.firstElementChild; card._h = html[i]; now[i].replaceWith(card);
      });
      return;
    }
    box.innerHTML = list.length ? html.join('')
      : K.empty('zap', A.show === 'active' ? 'Nicio campanie pornită' : 'Nicio campanie', A.show === 'active' ? 'Vezi „Toate” pentru cele oprite, sau publică un creative din Creative.' : 'Publică un creative din Creative („Publică pe Meta”).');
    [...box.children].forEach((n, i) => { n._h = html[i]; });
  }
  function budgetCell(x, kind) {
    const val = x.daily ? money(x.daily) : x.lifetime ? money(x.lifetime) + ' total' : '-';
    const one = kind === 'campaign' && !x.cbo && x.adsets && x.adsets.length === 1 && x.adsets[0].daily ? x.adsets[0] : null;
    const editable = (kind === 'adset' && !!x.daily) || (kind === 'campaign' && (x.cbo || one));
    return editable
      ? '<span class="ad-budget" data-budget-box data-id="' + esc(one ? one.id : x.id) + '"><button type="button" class="ad-budget-btn" data-budget-edit title="Schimbă bugetul">' + esc(val) + icon('pen') + '</button></span>'
      : '<span class="ad-budget">' + esc(val) + '</span>';
  }
  // the chosen columns of one row
  function cellsOf(x, kind, c) {
    return cols().map((id) => cellOf(x, kind, c, id, KEY)).join('');
  }
  function cellOf(x, kind, c, id, key) {
    if (id === 'budget') {
      const v = kind === 'ad' ? '' : kind === 'adset' && c.cbo ? '<span class="ad-budget k-muted">al campaniei</span>' : budgetCell(x, kind);
      return '<div class="ad-cell' + (kind === 'ad' ? ' is-none' : '') + '" data-l="' + esc(M[id].label) + '">' + v + '</div>';
    }
    const v = fmt(id, M[id].val(x));
    return '<div class="ad-cell' + (key.includes(id) ? ' is-key' : '') + '" data-l="' + esc(M[id].label) + '">' + (M[id].strong ? '<b>' + esc(v) + '</b>' : esc(v)) + '</div>';
  }
  // a phone: the period sits at the bottom of the screen, beside "Meniu" (on <body>: the panel's animation would carry a
  // fixed bar along with the page); its changes go to the same handler
  let dock = null;
  const phone = window.matchMedia ? window.matchMedia('(max-width:640px)') : null;
  function dockPeriod() {
    if (!phone) return;
    // the period of the view on screen (Campanii or Clasament)
    const name = T.view === 'top' ? 'topperiod' : 'adperiod', barSel = T.view === 'top' ? '[data-top] .ad-bar' : '[data-body] .ad-bar';
    if (!phone.matches) { // a window grown past a phone's: the period goes back into the toolbar
      const bar = panel.querySelector(barSel), seg = dock && dock.querySelector('[data-k-seg="' + name + '"]');
      if (bar && seg) bar.insertBefore(seg, bar.firstChild);
      return;
    }
    const seg = panel.querySelector(barSel + ' > [data-k-seg="' + name + '"]');
    if (!seg) return;
    if (!dock) { dock = document.createElement('div'); dock.className = 'ad-dock'; dock.addEventListener('change', onChange); document.body.appendChild(dock); }
    dock.replaceChildren(seg);
  }
  if (phone && phone.addEventListener) phone.addEventListener('change', () => { if (panel) dockPeriod(); });
  // under a campaign: what the guard sees on it now and what was changed on it that still holds, with the why
  const NOTE = { top: ['is-good', '🚀 TOP'], bad: ['is-bad', '⚠️ ATENȚIE'], watch: ['is-warn', '👀 De urmărit'] };
  function notesHtml(c) {
    const g = (A.d.guard && A.d.guard.log || []).filter((e) => e.campaignId === c.id).map((e) => [e.type === 'up' || e.type === 'start' ? 'is-good' : 'is-bad',
      e.type === 'up' ? '📈 Buget mărit ' + e.from + ' → ' + e.to + ' lei/zi' : e.type === 'start' ? '▶️ Pornită' : e.trim ? '✂️ Buget scăzut ' + e.from + ' → ' + e.to + ' lei/zi' : e.type === 'down' ? '📉 Buget înapoi ' + e.from + ' → ' + e.to + ' lei/zi' : e.job ? '⛔ Oprită' : e.adOnly ? '⛔ O reclamă oprită automat' : '⛔ Oprită automat',
      (e.type === 'stop' && e.adOnly ? '„' + e.adName + '”: ' : '') + (e.why || '') + (e.adOnly ? '. Campania merge cu celelalte reclame' : '') + ' · ' + K.ago(e.at)]);
    const n = (c.notes || []).map((x) => [NOTE[x.flag][0], NOTE[x.flag][1], (x.ad ? x.ad + ': ' : '') + x.why.join(' · ')]);
    const all = g.concat(n);
    return all.length ? '<div class="ad-flags">' + all.map(([tone, label, text]) => '<p class="ad-flag ' + tone + '"><b>' + esc(label) + '</b><span>' + esc(text) + '</span></p>').join('') + '</div>' : '';
  }
  // the campaign's picture: its first ad's (the running one first)
  const thumbOf = (c) => { const ads = (c.adsets || []).flatMap((s) => s.ads || []); const a = ads.find((x) => x.thumb && x.status === 'ACTIVE') || ads.find((x) => x.thumb); return a ? a.thumb : ''; };
  const thumbHtml = (u) => '<span class="ad-thumb">' + (u ? '<img src="' + esc(u) + '" alt="" loading="lazy" referrerpolicy="no-referrer">' : icon('image')) + '</span>';
  // how many ads it has; on a running campaign with some ads paused, the running ones („2 reclame active”)
  const adsCount = (c) => {
    const all = c.adsets.reduce((n, s) => n + s.ads.length, 0);
    const on = c.adsets.reduce((n, s) => n + (s.status === 'ACTIVE' ? s.ads.filter((a) => a.status === 'ACTIVE').length : 0), 0);
    return c.status === 'ACTIVE' && on < all ? K.plural(on, 'reclamă activă', 'reclame active') : K.plural(all, 'reclamă', 'reclame');
  };
  function campHtml(c) {
    return '<article class="k-card ad-camp' + (c.status === 'ACTIVE' ? '' : ' is-off') + (A.sel.has(c.id) ? ' is-picked' : '') + '" data-camp="' + esc(c.id) + '">' +
      '<div class="ad-row is-camp">' +
        '<div class="ad-name"><label class="ad-pick" title="Selectează campania"><input type="checkbox" data-pick="' + esc(c.id) + '"' + (A.sel.has(c.id) ? ' checked' : '') + '></label>' + sw(c.id, c.status === 'ACTIVE', 'campaign') + thumbHtml(thumbOf(c)) + '<button type="button" class="ad-title" data-preview="' + esc(c.id) + '" title="Previzualizare"><b>' + esc(c.name) + '</b><small>' + tag(c.effective) + K.plural(c.adsets.length, 'set', 'seturi') + ' · ' + adsCount(c) + made(c) + '</small></button></div>' +
        cellsOf(c, 'campaign') +
        '<div class="ad-acts"><button type="button" class="k-icon-btn" data-preview="' + esc(c.id) + '" title="Previzualizare">' + icon('eye') + '</button>' +
          '<button type="button" class="k-icon-btn" data-more="campaign" data-id="' + esc(c.id) + '" data-name="' + esc(c.name) + '" title="Mai mult">' + icon('more') + '</button></div>' +
      '</div>' + campOut(c) + notesHtml(c) +
      '</article>';
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
    if (t.name === 'adview') return setView(t.value);
    if (t.name === 'topperiod') {
      if (t.value === 'custom') return openRange(t.closest('[data-k-seg]').querySelector('[data-v="custom"]'), TOP_RANGE);
      T.period = t.value; T.range = null; return loadTop();
    }
    if (t.matches('[data-tf]')) { T.f[t.dataset.tf] = t.value; saveTop(); T.shown = PAGE; return paintTopList(); }
    if (t.matches('[data-tsort-pick]')) { const c = TCOL[t.value]; T.sort = t.value; T.dir = c ? c.dir : 1; saveTop(); return paintTopList(); }
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
    if (t.dataset.sw) flip(t.dataset.sw, t.dataset.kind, t.checked);
  }
  // A switch moves at once: the card, the numbers on top and the "Pornite" count follow without waiting for Meta. Each
  // campaign's requests go one after another (the last choice wins when it's tapped twice quickly); many campaigns can
  // be switched at the same time. A refused change goes back, with Meta's reason.
  const sending = new Map();
  let quietT = 0;
  function flip(id, kind, on) {
    const status = on ? 'ACTIVE' : 'PAUSED';
    const x = findAny(id), w = A.want.get(id);
    A.want.set(id, { status, base: w ? w.base : (x ? x.status : (on ? 'PAUSED' : 'ACTIVE')), at: Date.now(), busy: true });
    setStatus(x, status);
    if (kind === 'campaign') A.keep.add(id);
    A.cache.clear(); // the other periods kept the old status
    paintAll();
    if (!sending.has(id)) sending.set(id, send(id).finally(() => sending.delete(id)));
  }
  // Meta's "too many calls for this ad account": a moment later it goes (the switch stays as chosen meanwhile)
  const busyMeta = (err) => /prea multe apeluri|too many calls|request limit|limit reached/i.test(String((err && err.data && err.data.message) || (err && err.message) || ''));
  async function send(id) {
    let sent = null, tries = 0;
    for (;;) {
      const w = A.want.get(id);
      if (!w || w.status === sent) break;
      const s = w.status;
      try { await post({ action: 'status', id, status: s }); sent = s; w.base = s; }
      catch (err) {
        if (busyMeta(err) && tries < 4) {
          tries++;
          if (tries === 1) K.ui().toast('Meta e ocupat acum, reîncerc singur în câteva secunde.', 'info');
          await new Promise((r) => setTimeout(r, 15000 * tries));
          continue;
        }
        const back = (A.want.get(id) || {}).base || (s === 'ACTIVE' ? 'PAUSED' : 'ACTIVE');
        A.want.delete(id);
        setStatus(findAny(id), back);
        paintAll();
        K.ui().toast(err.data && err.data.message ? err.data.message : K.errText(err), 'error');
        return;
      }
    }
    const w = A.want.get(id);
    if (w) { w.busy = false; w.at = Date.now(); }
    if (sent) K.ui().toast(sent === 'ACTIVE' ? 'Pornită.' : 'Oprită.', 'success');
    // the statuses that follow (ad sets, spend) come quietly a little later, once nothing is being switched
    clearTimeout(quietT);
    quietT = setTimeout(() => { if (!sending.size && K.isActive('reclame')) load(true); }, 12e3);
  }
  function editBudget(box) {
    const x = findAny(box.dataset.id);
    box.innerHTML = '<input class="ad-budget-input" data-budget-input type="number" min="5" step="5" value="' + esc(x && x.daily ? x.daily : 50) + '"><button type="button" class="k-btn is-primary is-sm" data-budget-save>' + icon('check') + '</button>';
    const inp = box.querySelector('input'); inp.focus(); inp.select();
  }
  async function saveBudget(box) {
    const btn = box.querySelector('[data-budget-save]');
    if (!btn || btn.disabled) return; // already on its way
    const v = Number(box.querySelector('input').value);
    if (!(v >= 5)) { K.ui().toast('Bugetul minim e 5 lei pe zi.', 'error'); return; }
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
    if (!apply) document.querySelectorAll('[data-k-seg="' + rangeOf.seg + '"] > button').forEach((b) => b.classList.toggle('is-on', b.dataset.v === rangeOf.on()));
  }
  // the campaigns' period (Campanii) or the leaderboard's (Clasament)
  const CAMP_RANGE = { seg: 'adperiod', on: () => (A.range ? 'custom' : A.period), get: () => A.range, set: (r) => { A.range = r; A.keep.clear(); load(); } };
  const TOP_RANGE = { seg: 'topperiod', on: () => (T.range ? 'custom' : T.period), get: () => T.range, set: (r) => { T.range = r; loadTop(); } };
  let rangeOf = CAMP_RANGE;
  const outsideRange = (e) => { if (rangeEl && !rangeEl.contains(e.target) && !e.target.closest('[data-v="custom"]')) closeRange(false); };
  const escRange = (e) => { if (e.key === 'Escape') { e.stopPropagation(); closeRange(false); } };
  function openRange(anchor, which) {
    if (rangeEl) { closeRange(false); return; }
    rangeOf = which || CAMP_RANGE;
    const today = K.today();
    const r = rangeOf.get() || { since: K.addDays(today, -6), until: today };
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
    // under its button, or above it when the button is at the bottom of the screen (a phone)
    m.style.top = (b.bottom + 6 + m.offsetHeight > window.innerHeight ? Math.max(8, b.top - 6 - m.offsetHeight) : b.bottom + 6) + 'px';
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
      const set = rangeOf.set;
      closeRange(true);
      set({ since: a, until: z > today ? today : z });
    });
  }

  // ------------------------------------------------------------------ Previzualizare / Editează
  // A running campaign: what its ads say and show (each text and headline copied with one tap, the
  // picture saved), and changing them: the words, the button, the form, the audience, the budget.
  const CTA_RO = { LEARN_MORE: 'Află mai multe', SIGN_UP: 'Înscrie-te', BOOK_NOW: 'Rezervă acum', GET_OFFER: 'Obține oferta', APPLY_NOW: 'Aplică acum', GET_QUOTE: 'Solicită ofertă', CONTACT_US: 'Contactează-ne', SUBSCRIBE: 'Abonează-te', DOWNLOAD: 'Descarcă' };
  let formsP = null;
  // the lead forms (names for the ids), once
  const forms = () => (formsP = formsP || K.api('/api/ads-publish?action=options').then((o) => o.forms || []).catch(() => []));
  const details = (campaignId) => post({ action: 'details', campaignId });

  // save the picture: the share sheet on a phone (→ Photos), a download on a computer
  async function savePicture(url, btn) {
    await K.busy(btn, async () => {
      try {
        const r = await fetch('/api/ads-manager?media=' + encodeURIComponent(url), { credentials: 'same-origin' });
        if (!r.ok) throw new Error('Nu am putut lua imaginea de la Meta.');
        const blob = await r.blob();
        const ext = (blob.type.split('/')[1] || 'jpg').replace('jpeg', 'jpg');
        const file = new File([blob], 'reclama-centrul360.' + ext, { type: blob.type });
        const phone = window.matchMedia('(max-width:720px)').matches || /iPhone|iPad|Android/i.test(navigator.userAgent);
        if (phone && navigator.canShare && navigator.canShare({ files: [file] })) { await navigator.share({ files: [file] }).catch(() => {}); return; }
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob); a.download = file.name;
        document.body.appendChild(a); a.click(); a.remove();
        setTimeout(() => URL.revokeObjectURL(a.href), 4000);
      } catch (err) { K.ui().toast(err.message || K.errText(err), 'error'); }
    });
  }
  const copyRow = (label, text) => '<div class="ad-pv-copy"><div class="ad-pv-copy-head"><small>' + esc(label) + '</small><button type="button" class="k-btn is-ghost is-sm" data-copy="' + esc(text) + '">' + icon('copy') + 'Copiază</button></div><p>' + esc(text) + '</p></div>';
  const variants = (label, list) => list.map((t, i) => copyRow(list.length > 1 ? label + ' ' + (i + 1) : label, t)).join('');

  async function openPreview(campaignId) {
    const c = A.d.campaigns.find((x) => x.id === campaignId);
    let d = null, list = [], at = 0;
    const paint = (el) => {
      const box = el.querySelector('[data-pv]');
      if (!d) { box.innerHTML = '<div class="k-skel" style="height:320px"></div><div class="k-skel" style="height:140px"></div>'; return; }
      if (!d.ads.length) { box.innerHTML = K.empty('image', 'Nicio reclamă', 'Campania n-are reclame.'); return; }
      const a = d.ads[at];
      const form = list.find((f) => f.id === a.formId);
      box.innerHTML =
        (d.ads.length > 1 ? '<div class="ad-pv-tabs">' + d.ads.map((x, i) => '<button type="button" class="k-chip' + (i === at ? ' is-on' : '') + '" data-pv-ad="' + i + '">' + esc(x.name) + '</button>').join('') + '</div>' : '') +
        '<div class="ad-pv-media' + (a.images.length > 1 ? ' is-many' : '') + '">' + (a.images.length ? a.images.map((u) =>
          '<figure><img src="' + esc(u) + '" alt="" referrerpolicy="no-referrer" loading="lazy"><button type="button" class="k-btn is-sm ad-pv-save" data-save-img="' + esc(u) + '">' + icon('download') + 'Descarcă</button></figure>').join('')
          : '<div class="ad-pv-noimg">' + icon(a.video ? 'play' : 'image') + '<span>' + (a.video ? 'Reclamă video: o vezi în Ads Manager.' : 'Fără imagine') + '</span></div>') + '</div>' +
        '<div class="ad-pv-texts">' + variants('Text principal', a.texts) + variants('Titlu', a.headlines) + variants('Descriere', a.descriptions) +
          '<div class="ad-pv-meta"><span><small>Buton</small><b>' + esc(CTA_RO[a.cta] || a.cta || '-') + '</b></span><span><small>Formular</small><b>' + esc(form ? form.name : a.formId || '-') + '</b></span>' +
          '<span><small>Stare</small><b>' + (a.status !== 'ACTIVE' ? 'Oprită' : c && c.status !== 'ACTIVE' ? 'Oprită (campania e oprită)' : 'Pornită') + '</b></span></div></div>';
    };
    const dr = K.drawer({
      title: c ? c.name : 'Previzualizare', icon: 'eye', width: 560, subtitle: 'Ce văd clientele: imaginea, textele, titlurile. Fiecare se copiază separat.',
      body: '<div class="ad-pv" data-pv></div>',
      footer: '<a class="k-btn is-ghost" href="' + esc(amUrl('campaign', campaignId)) + '" target="_blank" rel="noopener">' + icon('link') + 'Ads Manager</a><span class="k-grow"></span><button type="button" class="k-btn is-primary" data-pv-edit>' + icon('pen') + 'Editează</button>',
      onMount(el) {
        paint(el);
        el.addEventListener('click', (e) => {
          const cp = e.target.closest('[data-copy]'); if (cp) return K.copy(cp.dataset.copy);
          const sv = e.target.closest('[data-save-img]'); if (sv) return savePicture(sv.dataset.saveImg, sv);
          const tb = e.target.closest('[data-pv-ad]'); if (tb) { at = Number(tb.dataset.pvAd); return paint(el); }
          if (e.target.closest('[data-pv-edit]')) { dr.close(); setTimeout(() => openEdit(campaignId, d, at), 220); }
        });
        Promise.all([details(campaignId), forms()]).then(([x, f]) => { d = x; list = f; paint(el); })
          .catch((err) => { el.querySelector('[data-pv]').innerHTML = K.empty('alert', 'Nu am putut citi reclama', esc(err.data && err.data.message ? err.data.message : K.errText(err))); });
      },
    });
  }

  async function openEdit(campaignId, pre, adAt) {
    const c = A.d.campaigns.find((x) => x.id === campaignId);
    let d = pre || null, list = [], ai = adAt || 0, si = 0;
    // what she types, kept while switching between ads / ad sets
    const draft = { ads: {}, sets: {}, names: {} };
    // the names (campaign, ad set, ad) as she types them
    const nm = (x) => (draft.names[x.id] != null ? draft.names[x.id] : x.name);
    const adDraft = (a) => (draft.ads[a.id] = draft.ads[a.id] || { texts: a.texts.slice(), headlines: a.headlines.slice(), descriptions: a.descriptions.slice(), cta: a.cta || 'LEARN_MORE', formId: a.formId, dirty: false });
    const setDraft = (s) => (draft.sets[s.id] = draft.sets[s.id] || { budget: s.budget, ageMin: s.ageMin, ageMax: s.ageMax, women: s.women, radiusKm: s.radiusKm, placements: s.placements.slice(), dirty: false });
    const area = (name, i, v, multi) => '<div class="ad-ed-item"><textarea class="ad-ed-ta" data-f="' + name + '" data-i="' + i + '" rows="' + (name === 'texts' ? 4 : 1) + '">' + esc(v) + '</textarea>' + (multi ? '<button type="button" class="k-icon-btn" data-rm="' + name + '" data-i="' + i + '" aria-label="Scoate">' + icon('x') + '</button>' : '') + '</div>';
    const listField = (label, name, vals, multi, max) => '<div class="k-field full"><span>' + esc(label) + (multi ? ' (variante)' : '') + '</span>' + (vals.length ? vals : ['']).map((v, i) => area(name, i, v, multi && vals.length > 1)).join('') +
      (multi && vals.length < max ? '<button type="button" class="k-btn is-ghost is-sm ad-ed-add" data-addv="' + name + '">' + icon('plus') + 'Adaugă o variantă</button>' : '') + '</div>';
    const paint = (el) => {
      const box = el.querySelector('[data-ed]');
      if (!d) { box.innerHTML = '<div class="k-skel" style="height:260px"></div><div class="k-skel" style="height:200px"></div>'; return; }
      const a = d.ads[ai], s = d.adsets[si];
      let h = '<section class="ad-ed-sec"><div class="ad-ed-head"><b>Nume</b></div><div class="k-form ad-ed-form">' +
        K.field('Campanie', '<input data-name="' + esc(d.campaign.id) + '" value="' + esc(nm(d.campaign)) + '" maxlength="200">', 'full') +
        '</div></section>';
      if (a) {
        const x = adDraft(a);
        const formOpts = list.slice(); if (x.formId && !formOpts.some((f) => f.id === x.formId)) formOpts.unshift({ id: x.formId, name: 'Formularul actual (' + x.formId + ')' });
        h += '<section class="ad-ed-sec"><div class="ad-ed-head"><b>Reclama</b>' + (d.ads.length > 1 ? '<div class="ad-pv-tabs">' + d.ads.map((y, i) => '<button type="button" class="k-chip' + (i === ai ? ' is-on' : '') + '" data-ed-ad="' + i + '">' + esc(y.name) + '</button>').join('') + '</div>' : '') + '</div>' +
          (a.editable ? '<div class="k-form ad-ed-form">' +
            listField('Text principal', 'texts', x.texts, a.multi, 5) + listField('Titlu', 'headlines', x.headlines, a.multi, 5) + listField('Descriere', 'descriptions', x.descriptions, a.multi, 5) +
            K.field('Buton', '<select data-f="cta">' + K.options(Object.keys(CTA_RO).slice(0, 6).map((k) => [k, CTA_RO[k]]), x.cta) + '</select>') +
            K.field('Formular', '<select data-f="formId">' + K.options(formOpts.map((f) => [f.id, f.name + (f.location ? ' · ' + f.location : '')]), x.formId) + '</select>') +
            '</div><p class="k-muted ad-ed-note">' + icon('alert') + 'Textele noi trimit reclama la Meta pentru verificare (de obicei câteva minute). Rezultatele de până acum rămân.</p>'
            : '<p class="k-muted">Reclama asta (video sau alt format) se editează doar în Ads Manager.</p>') + '</section>';
      }
      if (s) {
        const y = setDraft(s);
        const PL = [['fb_feed', 'Facebook · flux'], ['fb_story', 'Facebook · stories'], ['fb_reels', 'Facebook · reels'], ['ig_feed', 'Instagram · flux'], ['ig_story', 'Instagram · stories'], ['ig_reels', 'Instagram · reels']];
        h += '<section class="ad-ed-sec"><div class="ad-ed-head"><b>Public și buget</b>' + (d.adsets.length > 1 ? '<div class="ad-pv-tabs">' + d.adsets.map((z, i) => '<button type="button" class="k-chip' + (i === si ? ' is-on' : '') + '" data-ed-set="' + i + '">' + esc(z.name) + '</button>').join('') + '</div>' : '') + '</div>' +
          '<div class="k-form ad-ed-form">' +
            (d.campaign.cbo ? K.field('Buget pe zi, al campaniei (lei)', '<input type="number" min="5" step="5" data-cbo value="' + esc(draft.cbo != null ? draft.cbo : d.campaign.budget) + '">')
              : s.budget ? K.field('Buget pe zi (lei)', '<input type="number" min="5" step="5" data-s="budget" value="' + esc(y.budget) + '">') : '') +
            (s.hasPin ? K.field('Rază (km)', '<input type="number" min="1" max="80" data-s="radiusKm" value="' + esc(y.radiusKm) + '">') : '') +
            K.field('Vârstă', '<div class="ad-age"><input type="number" min="18" max="65" data-s="ageMin" value="' + esc(y.ageMin) + '"><span>până la</span><input type="number" min="18" max="65" data-s="ageMax" value="' + esc(y.ageMax) + '"></div>') +
            K.field('Public', '<select data-s="women">' + K.options([['1', 'Doar femei'], ['0', 'Toți']], y.women ? '1' : '0') + '</select>') +
            '<div class="k-field full"><span>Plasări' + (s.automatic ? ' (acum automate, Meta alege)' : '') + '</span><div class="ad-checks">' + PL.map(([k, l]) => '<label class="fb-check"><input type="checkbox" data-pl="' + k + '"' + (y.placements.includes(k) ? ' checked' : '') + '><span>' + esc(l) + '</span></label>').join('') + '</div></div>' +
          '</div></section>';
      }
      box.innerHTML = h || K.empty('image', 'Nimic de editat', 'Campania n-are reclame.');
      box.querySelectorAll('.ad-ed-ta').forEach(fit);
    };
    const fit = (ta) => { ta.style.height = 'auto'; ta.style.height = ta.scrollHeight + 2 + 'px'; };
    const dr = K.drawer({
      title: 'Editează · ' + (c ? c.name : ''), icon: 'pen', width: 600, subtitle: 'Schimbi numele, textele, butonul, formularul, publicul și bugetul reclamei care rulează.',
      body: '<div class="ad-ed" data-ed></div>',
      footer: '<span class="k-grow"></span><button type="button" class="k-btn" data-cancel>Renunță</button><button type="button" class="k-btn is-primary" data-ed-save>' + icon('check') + 'Salvează</button>',
      onMount(el) {
        paint(el);
        const cur = () => ({ a: d && d.ads[ai], s: d && d.adsets[si] });
        el.addEventListener('input', (e) => {
          const t = e.target; const { a, s } = cur();
          if (t.dataset.f && a) { const x = adDraft(a); if (t.dataset.i != null) x[t.dataset.f][Number(t.dataset.i)] = t.value; else x[t.dataset.f] = t.value; x.dirty = true; if (t.tagName === 'TEXTAREA') fit(t); }
          if (t.dataset.s && s) { const y = setDraft(s); y[t.dataset.s] = t.dataset.s === 'women' ? t.value === '1' : Number(t.value); y.dirty = true; }
          if (t.hasAttribute('data-cbo')) draft.cbo = Number(t.value);
          if (t.dataset.name) draft.names[t.dataset.name] = t.value;
        });
        el.addEventListener('change', (e) => {
          const t = e.target; const { a, s } = cur();
          if (t.dataset.f && a && t.tagName === 'SELECT') { const x = adDraft(a); x[t.dataset.f] = t.value; x.dirty = true; }
          if (t.dataset.s === 'women' && s) { const y = setDraft(s); y.women = t.value === '1'; y.dirty = true; }
          if (t.dataset.pl && s) { const y = setDraft(s); y.placements = Array.from(el.querySelectorAll('[data-pl]:checked')).map((x) => x.dataset.pl); y.dirty = true; }
        });
        el.addEventListener('click', (e) => {
          const { a } = cur();
          const ta = e.target.closest('[data-ed-ad]'); if (ta) { ai = Number(ta.dataset.edAd); return paint(el); }
          const ts = e.target.closest('[data-ed-set]'); if (ts) { si = Number(ts.dataset.edSet); return paint(el); }
          const add = e.target.closest('[data-addv]'); if (add && a) { const x = adDraft(a); x[add.dataset.addv].push(''); x.dirty = true; return paint(el); }
          const rm = e.target.closest('[data-rm]'); if (rm && a) { const x = adDraft(a); x[rm.dataset.rm].splice(Number(rm.dataset.i), 1); x.dirty = true; return paint(el); }
          if (e.target.closest('[data-cancel]')) dr.close();
        });
        el.querySelector('[data-ed-save]').addEventListener('click', (ev) => K.busy(ev.currentTarget, async () => {
          if (!d) return;
          try {
            let n = 0;
            // the campaign's new name first
            for (const x of [d.campaign]) {
              const v = draft.names[x.id]; if (v == null || !v.trim() || v.trim() === x.name) continue;
              await post({ action: 'rename', id: x.id, name: v.trim() }); n++;
              const row = findAny(x.id); if (row) row.name = v.trim();
            }
            for (const a of d.ads) {
              const x = draft.ads[a.id]; if (!x || !x.dirty) continue;
              await post({ action: 'edit_ad', adId: a.id, texts: x.texts, headlines: x.headlines, descriptions: x.descriptions, cta: x.cta, formId: x.formId }); n++;
            }
            for (const s of d.adsets) {
              const y = draft.sets[s.id]; if (!y || !y.dirty) continue;
              if (y.ageMin > y.ageMax) throw new Error('Vârsta: „de la” trebuie să fie mai mic decât „până la”.');
              await post({ action: 'edit_adset', adsetId: s.id, budget: y.budget, ageMin: y.ageMin, ageMax: y.ageMax, women: y.women, radiusKm: y.radiusKm, placements: y.placements }); n++;
            }
            if (draft.cbo != null && d.campaign.cbo && draft.cbo !== d.campaign.budget) { await post({ action: 'budget', id: d.campaign.id, daily: draft.cbo }); n++; }
            dr.close();
            K.ui().toast(n ? 'Salvat în Meta.' : 'Nimic schimbat.', 'success');
            if (n) reloadChanged();
          } catch (err) { K.ui().toast(err.data && err.data.message ? err.data.message : err.message || K.errText(err), 'error'); }
        }));
        Promise.all([d ? Promise.resolve(d) : details(campaignId), forms()]).then(([x, f]) => { d = x; list = f; paint(el); })
          .catch((err) => { el.querySelector('[data-ed]').innerHTML = K.empty('alert', 'Nu am putut citi reclama', esc(err.data && err.data.message ? err.data.message : K.errText(err))); });
      },
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
      (kind === 'campaign' ? '<button type="button" class="k-menu-item" data-m="preview">' + icon('eye') + 'Previzualizare</button>' +
        '<button type="button" class="k-menu-item" data-m="edit">' + icon('sliders') + 'Editează</button>' : '') +
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
      if (it.dataset.m === 'preview') openPreview(btn.dataset.id);
      if (it.dataset.m === 'edit') openEdit(btn.dataset.id);
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
    try { await post({ action: 'delete', id }); K.ui().toast('Șters.', 'success'); reloadChanged(); }
    catch (err) { K.ui().toast(err.data && err.data.message ? err.data.message : K.errText(err), 'error'); }
  }
  async function onClick(e) {
    const t = e.target;
    if (onTopClick(t)) return;
    if (t.closest('[data-pick-clear]')) { A.sel.clear(); paintList(); return paintStats(); }
    const rf = t.closest('[data-act="refresh"]');
    if (rf) {
      // the icon turns while the numbers come (at least one full turn, so a fast answer still shows it)
      if (A.spin) return;
      A.spin = true;
      rf.classList.add('is-spinning');
      A.cache.delete(qsOf());
      const min = new Promise((r) => setTimeout(r, 700));
      return Promise.all([load(true), min]).finally(() => { A.spin = false; panel.querySelectorAll('[data-act="refresh"]').forEach((b) => b.classList.remove('is-spinning')); });
    }
    if (t.closest('[data-act="reload"]')) { panel.querySelector('[data-body]').innerHTML = '<div class="k-skel" style="height:360px"></div>'; return load(); }
    if (t.closest('[data-act="defaults"]')) return openDefaults();
    if (t.closest('[data-act="changes"]')) return openChanges();
    if (t.closest('[data-act="creative"]')) { K.go('creative'); K.ui().toast('Deschide un creative aprobat și apasă „Publică pe Meta”.', 'info'); return; }
    const go = t.closest('[data-goto]'); if (go) return K.go(go.dataset.goto);
    const sh = t.closest('[data-show]'); if (sh) { A.show = sh.dataset.show; A.keep.clear(); return render(); }
    const sx = t.closest('[data-sx-ads]');
    if (sx) { const id = sx.dataset.sxAds; if (A.open.has(id)) A.open.delete(id); else A.open.add(id); return paintList(); }
    const pv = t.closest('[data-preview]'); if (pv) return openPreview(pv.dataset.preview);
    const be = t.closest('[data-budget-edit]'); if (be) return editBudget(be.closest('[data-budget-box]'));
    const bs = t.closest('[data-budget-save]'); if (bs) return saveBudget(bs.closest('[data-budget-box]'));
    const m = t.closest('[data-more]'); if (m) return more(m);
    // anywhere else on a campaign's row (next to the name, on its numbers): the preview
    const row = t.closest('.ad-row.is-camp');
    if (row && !t.closest('input, button, label, a, select, textarea, [data-budget-box]')) return openPreview(row.closest('[data-camp]').dataset.camp);
  }

  // ------------------------------------------------------------------ defaults for "Publică pe Meta"
  function openDefaults() {
    const d = (A.d && A.d.defaults) || {};
    const ages = d.ages || { body: [28, 64], facial: [20, 60] };
    const names = d.names || {};
    const sc = (A.d && A.d.scope) || { exclude: ['ARANCA', 'BRAZI'], include: '' };
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
        K.field('Campaniile altor afaceri (prefixe)', '<input name="sc_exclude" value="' + esc((sc.exclude || []).join(', ')) + '">', 'full', 'Contul de reclame e comun cu Aranca și Brazi. Campaniile al căror nume începe cu aceste cuvinte nu intră aici (nici în cheltuială, nici în ROAS, nici în gardă).') +
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
            const ex = String(v.sc_exclude || '').split(',').map((x) => x.trim().toUpperCase()).filter(Boolean);
            if (ex.join(',') !== (sc.exclude || []).join(',')) {
              const s2 = await post({ action: 'scope', scope: { exclude: ex, include: sc.include || '' } });
              if (A.d) A.d.scope = s2.scope;
              A.cache.clear(); if (panel) load(true);
            }
            dr.close();
            K.ui().toast('Salvat. Fereastra „Publică pe Meta” pornește de acum cu ele.', 'success');
          } catch (err) { K.ui().toast(K.errText(err), 'error'); }
        }));
      },
    });
  }

  // ------------------------------------------------------------------ Clasament (George, 24.11)
  // „o pagină cu kpi unde pot să văd all time care a fost cea mai bună reclamă cu cel mai mare roas, configurabil pe time
  // frame-uri, să le pot sorta după obiectiv”: every ad of ours that spent in the period, in the three ad accounts
  // (api/_lib/ads-top.js: Meta's spend and leads, in lei, and what came after, by ad), ranked; ROAS first. Read only.
  const PAGE = 60;
  const T = { view: 'camp', period: 'max', range: null, d: null, at: 0, cache: new Map(), seq: 0, sort: 'roas', dir: -1, q: '', shown: PAGE,
    f: { obj: 'all', city: 'all', act: 'all', on: 'all' }, min: 50, minT: 0 };
  const TOP_KEY = 'c360-ads-top';
  try {
    const s = JSON.parse(localStorage.getItem(TOP_KEY) || 'null');
    if (s && typeof s === 'object') {
      if (typeof s.sort === 'string') T.sort = s.sort;
      if (s.dir === 1 || s.dir === -1) T.dir = s.dir;
      if (Number.isFinite(s.min) && s.min >= 0) T.min = s.min;
      if (s.f && typeof s.f === 'object') Object.keys(T.f).forEach((k) => { if (typeof s.f[k] === 'string') T.f[k] = s.f[k]; });
    }
  } catch (e) { /* a private window: the defaults */ }
  const saveTop = () => { try { localStorage.setItem(TOP_KEY, JSON.stringify({ sort: T.sort, dir: T.dir, min: T.min, f: T.f })); } catch (e) { /* not kept */ } };
  const OBJ = [['leads', 'Leaduri'], ['traffic', 'Trafic'], ['sales', 'Vânzări'], ['engagement', 'Interacțiuni'], ['awareness', 'Notorietate'], ['other', 'Altele']];
  const OBJ_L = Object.fromEntries(OBJ);
  const objOf = (o) => (/LEAD/.test(o) ? 'leads' : /TRAFFIC|LINK_CLICKS/.test(o) ? 'traffic' : /SALES|CONVERSIONS|CATALOG/.test(o) ? 'sales'
    : /ENGAGEMENT|POST|MESSAGES|VIDEO|PAGE_LIKES/.test(o) ? 'engagement' : /AWARENESS|REACH|BRAND/.test(o) ? 'awareness' : 'other');
  const CITY_L = { TM: 'Timișoara', AR: 'Arad', 'TM+AR': 'Timișoara și Arad' };
  // the numbers after the form are counted from 16.10 (the portal's data): their costs and the ROAS use the spend of the same
  // days, and need at least the minimum spent in them, so a few lei with one sale don't top the list
  const after = (x) => !T.min || x.spendNew >= T.min;
  const cost = (base, n) => (n > 0 ? base / n : null);
  // id → [label, value, format, first sort direction (-1: most first, 1: least first)]
  const TCOLS = [
    ['spend', 'Cheltuit', (x) => x.spend, 'money', -1],
    ['leads', 'Leaduri', (x) => x.leads, 'num', -1],
    ['cpl', 'Cost/lead', (x) => cost(x.spend, x.leads), 'money', 1],
    ['booked', 'Programări', (x) => x.booked, 'num', -1],
    ['cpb', 'Cost/programare', (x) => (after(x) ? cost(x.spendNew, x.booked) : null), 'money', 1],
    ['showed', 'Prezentări', (x) => x.showed, 'num', -1],
    ['cps', 'Cost/prezentare', (x) => (after(x) ? cost(x.spendNew, x.showed) : null), 'money', 1],
    ['clients', 'Cliente', (x) => x.clients, 'num', -1],
    ['cashed', 'Încasat', (x) => x.cashed, 'money', -1],
    ['roas', 'ROAS', (x) => (after(x) && x.spendNew > 0 ? x.cashed / x.spendNew : null), 'x', -1],
    ['cardsPaid', 'Carduri plătite', (x) => x.cardsPaid, 'num', -1],
  ];
  // the table's head is narrow: a shorter name where the full one doesn't fit (the full one on hover and on a phone's card)
  const SHORT = { cpb: 'Cost/progr.', cps: 'Cost/prez.', cardsPaid: 'Carduri' };
  const TCOL = Object.fromEntries(TCOLS.map(([id, label, val, f, dir]) => [id, { id, label, short: SHORT[id] || label, val, f, dir }]));
  const TLIST = Object.values(TCOL);
  const tfmt = (f, v) => (v == null || !Number.isFinite(v) ? '-' : f === 'money' ? money(v) : f === 'x' ? (Math.round(v * 100) / 100).toLocaleString('ro-RO') + 'x' : K.num(v));
  const topQs = () => 'view=top&' + (T.range ? 'since=' + T.range.since + '&until=' + T.range.until : 'period=' + T.period);
  const topPairs = () => PERIODS.concat([['custom', T.range ? rangeLabel(T.range) : 'Personalizat', 'calendar']]);
  const accName = (act) => { const a = ((T.d && T.d.accounts) || []).find((x) => x.act === act); return a ? a.name : act; };

  // Campanii ⇄ Clasament: the view on screen is drawn anew, so it slides in from its side (portal-motion.js)
  function setView(v) {
    T.view = v === 'top' ? 'top' : 'camp';
    const body = panel.querySelector('[data-body]'), top = panel.querySelector('[data-top]');
    body.hidden = T.view === 'top'; top.hidden = T.view !== 'top';
    if (T.view === 'top') { if (!T.d || T.drawn !== topQs()) topShell(); else paintTop(); loadTop(true); }
    else if (A.d) { A.key = ''; render(); if (Date.now() - (A.at || 0) > 20e3) load(true); }
    else load();
    dockPeriod();
  }
  // the bar (period, search, refresh) and the filters, then the numbers
  function topShell() {
    const top = panel.querySelector('[data-top]');
    const sel = (k, label, pairs) => '<label class="at-f"><span>' + esc(label) + '</span><select data-tf="' + k + '">' + K.options(pairs, T.f[k]) + '</select></label>';
    const d = T.d || { accounts: [], rows: [] };
    const objs = OBJ.filter(([k]) => k === T.f.obj || d.rows.some((x) => objOf(x.objective) === k));
    top.innerHTML =
      '<div class="ad-bar">' + K.seg('topperiod', topPairs(), T.range ? 'custom' : T.period) +
        '<div class="ad-bar-right"><label class="ad-search">' + icon('search') + '<input data-tq type="search" placeholder="Caută o reclamă sau o campanie…" value="' + esc(T.q) + '"></label>' +
        '<button type="button" class="k-icon-btn ad-refresh" data-act="top-refresh" title="Actualizează" aria-label="Actualizează">' + icon('refresh') + '</button></div></div>' +
      '<div class="at-filters">' +
        sel('obj', 'Obiectiv', [['all', 'Toate']].concat(objs)) +
        sel('city', 'Oraș', [['all', 'Ambele'], ['TM', 'Timișoara'], ['AR', 'Arad']]) +
        sel('act', 'Cont', [['all', 'Toate']].concat(d.accounts.map((a) => [a.act, a.name]))) +
        sel('on', 'Stare', [['all', 'Toate'], ['on', 'Pornite'], ['off', 'Oprite']]) +
        '<label class="at-f is-min"><span>Cheltuit minim</span><span class="at-min"><input data-tmin type="number" min="0" step="10" inputmode="numeric" value="' + esc(T.min) + '"><i>lei</i></span></label>' +
        '<label class="at-f is-sort"><span>Ordonează după</span><select data-tsort-pick>' + K.options(TCOLS.map(([id, label]) => [id, label]), T.sort) + '</select></label>' +
      '</div>' +
      '<div data-top-notes></div><div data-top-best></div><div data-top-sum></div><div data-top-list>' +
      (T.d ? '' : '<div class="k-skel" style="height:96px;margin-bottom:.8rem"></div><div class="k-skel" style="height:420px"></div>') + '</div>';
    T.drawn = topQs();
    dockPeriod();
    if (T.d) paintTop();
  }
  // quiet: the numbers kept for this period stay as they are while fresh ones come (no dimming)
  async function loadTop(quiet) {
    const qs = topQs(), seq = ++T.seq;
    const top = panel.querySelector('[data-top]');
    const kept = T.cache.get(qs), fresh = kept && Date.now() - kept.at < 10 * 60e3;
    if (kept) { T.d = kept.d; T.at = kept.at; }
    if (T.drawn !== qs || !top.querySelector('[data-top-list]')) { if (!kept) T.d = null; topShell(); }
    else if (kept) paintTop();
    if (fresh && quiet === true) return;
    if (T.d) { if (quiet !== true) top.classList.add('is-loading'); }
    else { const l = top.querySelector('[data-top-list]'); if (l) l.insertAdjacentHTML('afterbegin', '<p class="k-muted at-wait">Citesc cele trei conturi de reclame. Prima dată durează câteva secunde.</p>'); }
    try {
      const d = await K.api('/api/ads-manager?' + qs);
      T.cache.set(qs, { d, at: Date.now() });
      if (seq !== T.seq) return;
      T.d = d; T.at = Date.now();
      if (T.drawn !== qs || !top.querySelector('[data-top-list]')) topShell(); else paintTop();
    } catch (e) {
      if (seq !== T.seq) return;
      const l = top.querySelector('[data-top-list]');
      if (l && !T.d) l.innerHTML = K.empty('alert', 'Nu am putut încărca clasamentul', esc(K.errText(e)), '<button type="button" class="k-btn is-primary" data-act="top-reload">Reîncearcă</button>');
      else K.ui().toast('Nu am putut reîmprospăta clasamentul: ' + K.errText(e), 'error');
    } finally { if (seq === T.seq) top.classList.remove('is-loading'); }
  }
  function paintTop() {
    const top = panel.querySelector('[data-top]'), d = T.d;
    if (!top || !d) return;
    const l = top.querySelector('[data-top-list]');
    if (!d.ready) {
      top.querySelector('[data-top-notes]').innerHTML = '';
      l.innerHTML = '<div class="k-card ad-setup"><span class="k-icon-chip is-warn">' + icon('alert') + '</span><div><b>Reclamele nu sunt încă legate</b><p>' + esc(d.message || '') + '</p>' +
        '<button type="button" class="k-btn is-primary is-sm" data-goto="integrari">' + icon('facebook') + 'Integrări → Facebook</button></div></div>';
      return;
    }
    // what the numbers are, and an account Meta didn't give now
    const line = (tone, html) => '<p class="k-muted ad-partial' + (tone ? ' is-' + tone : '') + '">' + html + '</p>';
    const bad = (d.accounts || []).filter((a) => !a.ok), cad = (d.accounts || []).filter((a) => a.ok && a.currency && a.currency !== 'RON' && a.rate);
    top.querySelector('[data-top-notes]').innerHTML =
      bad.map((a) => line('warn', 'Contul „' + esc(a.name) + '” nu s-a putut citi acum (' + esc(a.error || 'Meta n-a răspuns') + '): reclamele lui lipsesc din listă.')).join('') +
      (d.reachesBack ? line('', 'Programările, prezentările, clientele și încasările: de pe 16 oct (datele din portal). Costurile lor și ROAS-ul: pe cheltuiala din aceleași zile, de la ' + esc(money(T.min)) + ' în sus.') : '') +
      (cad.length ? line('', 'Banii din ' + (cad.length === 1 ? 'contul „' + esc(cad[0].name) + '”' : 'conturile ' + cad.map((a) => '„' + esc(a.name) + '”').join(', ')) + ' (' + esc(cad[0].currency) + ') sunt în lei, la ' + esc(String(cad[0].rate).replace('.', ',')) + ' lei.') : '');
    const acts = top.querySelector('[data-tf="act"]');
    if (acts && acts.options.length !== (d.accounts || []).length + 1) topShell();
    else paintTopList();
  }
  // the rows the filters keep, sorted (an empty value last, whichever way)
  function topRows() {
    const q = K.norm(T.q || ''), f = T.f;
    const list = ((T.d && T.d.rows) || []).filter((x) => (f.obj === 'all' || objOf(x.objective) === f.obj) &&
      (f.city === 'all' || x.city === f.city || x.city === 'TM+AR') && (f.act === 'all' || x.act === f.act) &&
      (f.on === 'all' || (f.on === 'on' ? x.on : !x.on)) && (!T.min || x.spend >= T.min) && (!q || K.norm(x.ad + ' ' + x.campaign + ' ' + x.adset).includes(q)));
    const c = TCOL[T.sort] || TCOL.roas;
    const v = new Map(list.map((x) => [x, c.val(x)]));
    return list.sort((a, b) => {
      const p = v.get(a), r = v.get(b), pn = p == null || !Number.isFinite(p), rn = r == null || !Number.isFinite(r);
      if (pn || rn) return pn === rn ? b.spend - a.spend : pn ? 1 : -1;
      return p === r ? b.spend - a.spend : T.dir * (p - r);
    });
  }
  const statusTag = (x) => (x.on ? '<span class="k-tag is-good">Pornită</span>' : x.status === 'DISAPPROVED' ? '<span class="k-tag is-bad">Respinsă</span>'
    : x.status === 'ARCHIVED' || x.status === 'DELETED' ? '<span class="k-tag">Arhivată</span>' : '<span class="k-tag">Oprită</span>');
  const metaLine = (x) => [esc(accName(x.act)), esc(OBJ_L[objOf(x.objective)] || ''), x.city ? esc(x.city === 'TM+AR' ? 'TM + AR' : x.city) : ''].filter(Boolean).join(' · ');
  function topRowHtml(x, i) {
    const cells = TLIST.map((c) => { const v = tfmt(c.f, c.val(x)); return '<span class="at-cell' + (c.id === T.sort ? ' is-sort' : '') + (v === '-' ? ' is-none' : '') + '" data-l="' + esc(c.short) + '" title="' + esc(c.label) + '">' + esc(v) + '</span>'; }).join('');
    return '<article class="at-row' + (x.on ? '' : ' is-off') + '" data-top-ad="' + esc(x.adId) + '" tabindex="0">' +
      '<span class="at-rank">' + (i + 1) + '</span>' +
      '<div class="at-name">' + thumbHtml(x.thumb) + '<div class="at-title"><b>' + esc(x.ad || x.adId) + '</b><small>' + esc(x.campaign) + '</small><small class="at-meta">' + statusTag(x) + metaLine(x) + '</small></div></div>' +
      cells + '</article>';
  }
  function paintTopList() {
    const top = panel.querySelector('[data-top]');
    if (!top || !T.d || !T.d.ready) return;
    const rows = topRows();
    T.rows = rows;
    paintBest(rows);
    paintTopSum(rows);
    const box = top.querySelector('[data-top-list]');
    // where each row was (to move it to its new place instead of a cut, when the order changes)
    const was = new Map([...box.querySelectorAll('[data-top-ad]')].map((n) => [n.dataset.topAd, n.getBoundingClientRect().top]));
    if (!rows.length) {
      box.innerHTML = K.empty('trophy', 'Nicio reclamă', (T.d.rows || []).length ? 'Niciuna nu se potrivește cu filtrele (sau cu cheltuitul minim).' : 'Nicio reclamă n-a cheltuit în perioada asta.');
      return;
    }
    const shown = rows.slice(0, T.shown);
    const head = '<div class="at-head"><span class="at-rank">#</span><span class="at-hname">Reclamă</span>' + TLIST.map((c) =>
      '<button type="button" class="at-h' + (c.id === T.sort ? ' is-on' : '') + '" data-tsort="' + c.id + '" title="' + esc(c.label) + '" aria-sort="' + (c.id === T.sort ? (T.dir < 0 ? 'descending' : 'ascending') : 'none') + '">' +
      '<span>' + esc(c.short).replace('/', '/<wbr>') + '</span>' + (c.id === T.sort ? icon(T.dir < 0 ? 'down' : 'up') : '') + '</button>').join('') + '</div>';
    const old = box.querySelector('.at-scroll'), sx = old ? old.scrollLeft : 0;
    box.innerHTML = '<div class="at-scroll"><div class="at-table">' + head + '<div class="at-list">' + shown.map(topRowHtml).join('') + '</div></div></div>' +
      (rows.length > shown.length ? '<button type="button" class="k-btn is-outline is-sm at-more" data-act="top-more">' + icon('down') + 'Încă ' + Math.min(PAGE, rows.length - shown.length) + ' din ' + (rows.length - shown.length) + '</button>' : '');
    if (sx) box.querySelector('.at-scroll').scrollLeft = sx;
    if (was.size && !(window.C360Motion && window.C360Motion.reduced)) {
      box.querySelectorAll('[data-top-ad]').forEach((n, k) => {
        const y = was.get(n.dataset.topAd);
        if (y == null) { if (k < 12) n.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 220, delay: k * 12, easing: 'ease-out', fill: 'backwards' }); return; }
        const dy = y - n.getBoundingClientRect().top;
        if (Math.abs(dy) > 1 && Math.abs(dy) < innerHeight * 1.5) n.animate([{ transform: 'translateY(' + dy + 'px)' }, { transform: 'none' }], { duration: 320, easing: 'cubic-bezier(.2,.8,.2,1)' });
      });
    }
  }
  // the three on top: best ROAS, cheapest booking, most clients (of what the filters keep)
  function paintBest(rows) {
    const box = panel.querySelector('[data-top-best]');
    if (!box) return;
    const best = (id, ok) => { const c = TCOL[id]; let b = null, bv = null; rows.forEach((x) => { const v = c.val(x); if (v == null || !Number.isFinite(v) || (ok && !ok(x))) return; if (b == null || (c.dir < 0 ? v > bv : v < bv)) { b = x; bv = v; } }); return b ? [b, bv] : null; };
    const picks = [
      ['roas', 'Cel mai mare ROAS', 'trophy', best('roas', (x) => x.cashed > 0), (x) => money(x.cashed) + ' încasat din ' + money(x.spendNew)],
      ['cpb', 'Cea mai ieftină programare', 'calendar', best('cpb'), (x) => K.plural(x.booked, 'programare', 'programări') + ' din ' + money(x.spendNew)],
      ['clients', 'Cele mai multe cliente', 'users', best('clients', (x) => x.clients > 0), (x) => money(x.cashed) + ' încasat'],
    ].filter((p) => p[3]);
    box.innerHTML = picks.length ? '<div class="at-best">' + picks.map(([id, label, ic, [x, v], sub]) =>
      '<button type="button" class="k-card at-pick" data-top-ad="' + esc(x.adId) + '" data-top-pick="' + id + '">' +
        '<span class="at-pick-h">' + icon(ic) + '<small>' + esc(label) + '</small></span>' +
        '<span class="at-pick-v">' + esc(tfmt(TCOL[id].f, v)) + '</span>' +
        '<span class="at-pick-ad">' + thumbHtml(x.thumb) + '<span><b>' + esc(x.ad || x.adId) + '</b><small>' + esc(sub(x)) + '</small></span></span>' +
      '</button>').join('') + '</div>' : '';
  }
  // the sums of what the filters keep (each ad's own: nothing counted twice)
  function paintTopSum(rows) {
    const box = panel.querySelector('[data-top-sum]');
    if (!box) return;
    const s = (k) => rows.reduce((n, x) => n + (Number(x[k]) || 0), 0);
    const spendNew = s('spendNew'), cashed = s('cashed');
    const pairs = [['Reclame', K.num(rows.length)], ['Cheltuit', money(s('spend'))], ['Leaduri', K.num(s('leads'))], ['Programări', K.num(s('booked'))], ['Prezentări', K.num(s('showed'))],
      ['Cliente', K.num(s('clients'))], ['Încasat', money(cashed)], ['ROAS', spendNew > 0 ? tfmt('x', cashed / spendNew) : '-'], ['Carduri plătite', K.num(s('cardsPaid'))]];
    box.innerHTML = '<div class="ad-sx-row at-sum">' + pairs.map(([l, v]) => '<span' + (v === '-' ? ' class="is-none"' : '') + '><small>' + esc(l) + '</small><b>' + esc(v) + '</b></span>').join('') + '</div>';
  }
  // one ad, all its numbers: grows out of its row (K.drawer from), back goes into it
  function openTopAd(id, from) {
    const x = ((T.d && T.d.rows) || []).find((r) => r.adId === id);
    if (!x) return;
    const tile = (l, v, sub) => '<div class="ad-sx-t' + (v === '-' ? ' is-none' : '') + '"><small>' + esc(l) + '</small><b>' + esc(v) + '</b>' + (sub ? '<i>' + esc(sub) + '</i>' : '') + '</div>';
    const pair = (l, v) => '<span' + (v === '-' ? ' class="is-none"' : '') + '><small>' + esc(l).replace('/', '/<wbr>') + '</small><b>' + esc(v) + '</b></span>';
    const v = (id2) => tfmt(TCOL[id2].f, TCOL[id2].val(x));
    const link = 'https://adsmanager.facebook.com/adsmanager/manage/ads?act=' + encodeURIComponent(String(x.act).replace(/^act_/, '')) + '&selected_ad_ids=' + encodeURIComponent(x.adId);
    K.drawer({
      from, title: x.ad || x.adId, icon: 'trophy', width: 560, subtitle: esc(x.campaign),
      body: '<div class="at-ad">' + (x.thumb ? '<img class="at-ad-img" src="' + esc(x.thumb) + '" alt="" loading="lazy" referrerpolicy="no-referrer">' : '') +
        '<p class="at-ad-meta">' + statusTag(x) + metaLine(x) + (x.created ? ' · ' + esc(madeAt(x.created)) : '') + '</p></div>' +
        '<div class="ad-sx is-ad"><div class="ad-sx-grid at-ad-grid">' +
          tile('Cheltuit', money(x.spend), x.spendNew !== x.spend ? money(x.spendNew) + ' de pe 16 oct' : '') + tile('Leaduri', K.num(x.leads)) + tile('Programări', K.num(x.booked)) +
          tile('Cliente', K.num(x.clients)) + tile('Încasat', money(x.cashed)) + tile('ROAS', v('roas')) + '</div>' +
        '<div class="ad-sx-row">' + pair('Cost/lead', v('cpl')) + pair('Cost/programare', v('cpb')) + pair('Prezentări', K.num(x.showed)) + pair('Cost/prezentare', v('cps')) +
          pair('Carduri plătite', K.num(x.cardsPaid)) + pair('Bani din carduri', x.cardsPaid ? money(x.cardsPaidLei) : '-') + pair('Carduri rezervate', K.num(x.cardsReserved)) + '</div></div>' +
        (x.spendNew < T.min && x.spend >= T.min ? '<p class="k-muted ad-partial">De pe 16 oct a cheltuit sub ' + esc(money(T.min)) + ': costurile de după formular și ROAS-ul nu se calculează.</p>' : '') +
        '<a class="k-btn is-outline is-sm at-ad-link" href="' + esc(link) + '" target="_blank" rel="noopener">' + icon('link') + 'Deschide în Ads Manager</a>',
    });
  }
  // a tap in Clasament (true: handled)
  function onTopClick(t) {
    if (!t.closest('[data-top]')) return false;
    const h = t.closest('[data-tsort]');
    if (h) {
      const c = TCOL[h.dataset.tsort];
      if (T.sort === c.id) T.dir = -T.dir; else { T.sort = c.id; T.dir = c.dir; }
      const pick = panel.querySelector('[data-tsort-pick]'); if (pick) pick.value = T.sort;
      saveTop(); paintTopList(); return true;
    }
    if (t.closest('[data-act="top-more"]')) { T.shown += PAGE; paintTopList(); return true; }
    if (t.closest('[data-act="top-reload"]')) { loadTop(); return true; }
    const rf = t.closest('[data-act="top-refresh"]');
    if (rf) { rf.classList.add('is-spinning'); T.cache.clear(); Promise.all([loadTop(true), new Promise((r) => setTimeout(r, 700))]).finally(() => rf.classList.remove('is-spinning')); return true; }
    const row = t.closest('[data-top-ad]');
    if (row && !t.closest('a, input, select')) { openTopAd(row.dataset.topAd, row); return true; }
    return false;
  }
  document.addEventListener('keydown', (e) => { if ((e.key === 'Enter' || e.key === ' ') && e.target.matches && e.target.matches('article[data-top-ad]')) { e.preventDefault(); openTopAd(e.target.dataset.topAd, e.target); } });

  // Marketing → Setări (Creative's /setari page) opens these from outside Reclame: the account's data first, so the
  // form starts from what is saved, never from blanks
  window.C360Ads = {
    async openDefaults() {
      if (!A.d) { try { A.d = await K.api('/api/ads-manager?' + qsOf()); } catch (e) { K.ui().toast(K.errText(e), 'error'); return; } }
      openDefaults();
    },
  };

  K.section('reclame', { mount, show: () => (T.view === 'top' ? (T.d && Date.now() - (T.at || 0) < 5 * 60e3 ? null : loadTop(true)) : A.d ? (Date.now() - (A.at || 0) > 20e3 ? load(true) : null) : load()) });
  const fresh = (ms) => { if (T.view !== 'top' && A.d && K.isActive('reclame') && !document.hidden && !K.drawerOpen && Date.now() - (A.at || 0) > ms) load(true); };
  // every 3 minutes while the page is open (Meta limits how often the ad account is read; the server keeps the
  // numbers for everyone), not on every change made elsewhere in the portal
  setInterval(() => fresh(170e3), 60e3);
  K.on('pull', () => fresh(0));
})();
