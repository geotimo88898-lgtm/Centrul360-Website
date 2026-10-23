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
      '<div data-body><div class="k-skel" style="height:110px;margin-bottom:1rem"></div><div class="k-skel" style="height:360px"></div></div>';
    panel.addEventListener('click', onClick);
    panel.addEventListener('change', onChange);
    panel.addEventListener('input', (e) => { if (e.target.matches('[data-q]')) { A.q = e.target.value; paintList(); } });
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
      A.at = Date.now();
      show(d, body);
      prefetch();
    }
    catch (e) { if (seq === A.seq && !kept) body.innerHTML = K.empty('alert', 'Nu am putut încărca reclamele', K.errText(e), '<button type="button" class="k-btn is-primary" data-act="reload">Reîncearcă</button>'); }
    finally { if (seq === A.seq) { A.loading = false; body.classList.remove('is-loading'); } }
  }
  function show(d, body) {
    applyWant(d);
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
  function paintAll() { paintChips(); paintStats(); paintList(); }
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
    cpl: { label: 'Cost / lead', group: 'Leaduri și programări', fmt: 'money', val: (x) => per(x.spend, x.leads) },
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
    linkClicks: { label: 'Clickuri pe link', group: 'Meta', fmt: 'num', val: (x) => x.linkClicks },
    ctr: { label: 'CTR', group: 'Meta', fmt: 'pct', val: (x) => per(x.clicks, x.impressions) },
    linkCtr: { label: 'CTR link', group: 'Meta', fmt: 'pct', val: (x) => per(x.linkClicks, x.impressions) },
    cpc: { label: 'Cost / click', group: 'Meta', fmt: 'money', val: (x) => per(x.spend, x.linkClicks || x.clicks) },
    campaignsOn: { label: 'Campanii pornite', group: 'Meta', fmt: 'num', only: ['cards'], val: (x) => x.on },
  };
  const GROUPS = ['Bani', 'Leaduri și programări', 'Rate', 'Meta'];
  const DEF_COLS = ['budget', 'spend', 'leads', 'cpl', 'booked', 'costBooked', 'showed', 'costShowed', 'revenue', 'roas'];
  const DEF_CARDS = ['spend', 'leads', 'cpl', 'booked', 'costBooked', 'showed', 'costShowed', 'revenue'];
  const SUMS = ['spend', 'spendNew', 'leads', 'impressions', 'reach', 'clicks', 'linkClicks', 'pLeads', 'booked', 'showed', 'clients', 'revenue', 'upsells', 'upsellValue'];
  // what the ads spent in the days our own data counts (from 16.10.2026, 22:05): the costs after the form use it
  const sNew = (x) => (x.spendNew != null ? x.spendNew : x.spend);
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
  // a table chosen before 19.10 gets "Încasări" and ROAS at its end once (what each ad brought in), until the owner
  // changes the columns again
  const cols = () => {
    let c = K.prefs.get('ads.cols', DEF_COLS);
    if (Array.isArray(c) && !K.prefs.get('ads.cols.v2', false)) c = c.filter((id) => id !== 'revenue' && id !== 'roas').concat(['revenue', 'roas']);
    return okIds(c, 'cols');
  };
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
        await K.prefs.set('ads.cols.v2', true);
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
    const old = body.querySelector('.ad-scroll'), sx = old ? old.scrollLeft : 0;
    body.classList.toggle('is-readonly', !!d.readOnly);
    body.innerHTML =
      (d.readOnly ? '<div class="k-card ad-note is-warn">' + icon('alert') + '<span>Doar vizualizare: tokenul pentru reclame n-are permisiunea ads_management, așa că nu poți porni, opri sau schimba nimic de aici.</span><button type="button" class="k-btn is-sm" data-goto="integrari">Integrări</button></div>' : '') +
      (tok && days != null && days < 14 ? '<div class="k-card ad-note is-warn">' + icon('clock') + '<span>Conexiunea pentru reclame expiră ' + (days <= 0 ? 'azi' : 'în ' + K.plural(days, 'zi', 'zile')) + '.<span class="ad-sm-hide"> Integrări → Facebook → Reclame: lipește un token nou (unul de System User nu mai expiră).</span></span><button type="button" class="k-btn is-sm" data-goto="integrari">Integrări</button></div>' : '') +
      '<div class="ad-bar">' + K.seg('adperiod', periodPairs(), A.range ? 'custom' : A.period) +
        '<div class="ad-bar-right"><label class="ad-search">' + icon('search') + '<input data-q type="search" placeholder="Caută o campanie sau o reclamă…" value="' + esc(A.q) + '"></label>' +
        '<div class="k-chips"><button type="button" class="k-chip' + (A.show === 'active' ? ' is-on' : '') + '" data-show="active">Pornite<span>' + active + '</span></button><button type="button" class="k-chip' + (A.show === 'all' ? ' is-on' : '') + '" data-show="all">Toate<span>' + d.campaigns.length + '</span></button></div>' +
        '<button type="button" class="k-btn is-outline is-sm" data-act="customize" title="Coloane și KPI">' + icon('sliders') + '<span class="ad-sm-hide">Coloane și KPI</span></button>' +
        '<button type="button" class="k-icon-btn ad-refresh' + (A.spin ? ' is-spinning' : '') + '" data-act="refresh" title="Actualizează" aria-label="Actualizează">' + icon('refresh') + '</button>' +
        '<a class="k-icon-btn" href="' + esc(d.adsManager) + '" target="_blank" rel="noopener" title="Deschide Ads Manager">' + icon('link') + '</a></div></div>' +
      '<div data-stats></div>' +
      (d.partial ? '<p class="k-muted ad-partial">' + esc(d.partial) + '</p>' : '') +
      (d.stale ? '<p class="k-muted ad-partial">Meta limitează acum citirile contului: cifrele sunt de la ' + esc(new Date(d.stale).toLocaleTimeString('ro-RO', { hour: '2-digit', minute: '2-digit' })) + '.</p>' : '') +
      // the ads the guard stopped in the last 3 days (api/_lib/ads-guard.js)
      (d.guard && d.guard.log && d.guard.log.length ? '<p class="k-muted ad-partial">Automat: ' + d.guard.log.slice(0, 6).map((e) => (e.type === 'up' ? '📈 ' : e.type === 'down' ? '📉 ' : '⛔ ') + '<b>' + esc(e.campaignName || e.adName) + '</b> ' +
        (e.type === 'stop' ? '(' + esc(e.why || (money(e.spend) + ', ' + (e.leads ? K.plural(e.leads, 'lead', 'leaduri') : 'niciun lead'))) + ')' : esc(e.from + ' → ' + e.to + ' lei/zi'))).join(' · ') + '</p>' : '') +
      '<div class="ad-scroll"><div class="ad-table" style="--ad-cols:minmax(300px,1.6fr) repeat(' + C.length + ',minmax(116px,1fr)) 84px;--ad-minw:' + minw + 'px">' +
        '<div class="ad-head-row"><span class="ad-head-name"><label class="ad-pick" title="Selectează toate campaniile afișate"><input type="checkbox" data-pick-all></label>Campanie</span>' +
          C.map((id) => '<span title="' + esc(M[id].hint || '') + '">' + esc(M[id].label) + '</span>').join('') + '<span></span></div>' +
        '<div class="ad-list" data-list></div></div></div>';
    A.drawn = qsOf();
    dockPeriod();
    paintStats();
    paintList();
    if (sx) body.querySelector('.ad-scroll').scrollLeft = sx;
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
      '<div class="ad-hero">' + KEY.map((id) => '<div><small>' + esc(M[id].label) + '</small><b>' + esc(fmt(id, M[id].val(t))) + '</b></div>').join('') + '</div>' +
      '<div class="ad-stats">' + cards().map((id) => stat(iconOf(id), id === 'campaignsOn' && picked.length ? 'Pornite din cele alese' : M[id].label, fmt(id, M[id].val(t)), M[id].hint, id)).join('') + '</div>' +
      '<p class="k-muted ad-partial">Programările, prezentările, clienții, încasările și costurile lor: de pe 16 oct, 22:05 (datele din portal), cu cheltuiala din aceleași zile.</p>' +
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
  // on a phone these three come first and big, for the account and for every campaign
  const KEY = ['leads', 'cpl', 'spend'];
  const stat = (ic, label, val, hint, id) => '<div class="k-card ad-stat' + (KEY.includes(id) ? ' is-key' : '') + '"' + (hint ? ' title="' + esc(hint) + '"' : '') + '><span class="k-icon-chip is-accent">' + icon(ic) + '</span><div><small>' + esc(label) + '</small><b>' + esc(val) + '</b></div></div>';

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
        if (now[i]._h === html[i]) return;
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
    return cols().map((id) => {
      if (id === 'budget') {
        const v = kind === 'ad' ? '' : kind === 'adset' && c.cbo ? '<span class="ad-budget k-muted">al campaniei</span>' : budgetCell(x, kind);
        return '<div class="ad-cell' + (kind === 'ad' ? ' is-none' : '') + '" data-l="' + esc(M[id].label) + '">' + v + '</div>';
      }
      const v = fmt(id, M[id].val(x));
      return '<div class="ad-cell' + (KEY.includes(id) ? ' is-key' : '') + '" data-l="' + esc(M[id].label) + '">' + (M[id].strong ? '<b>' + esc(v) + '</b>' : esc(v)) + '</div>';
    }).join('');
  }
  // a phone: the period sits at the bottom of the screen, beside "Meniu" (on <body>: the panel's animation would carry a
  // fixed bar along with the page); its changes go to the same handler
  let dock = null;
  function dockPeriod() {
    const seg = panel.querySelector('.ad-bar > [data-k-seg="adperiod"]');
    if (!seg || !(window.matchMedia && window.matchMedia('(max-width:720px)').matches)) return;
    if (!dock) { dock = document.createElement('div'); dock.className = 'ad-dock'; dock.addEventListener('change', onChange); document.body.appendChild(dock); }
    dock.replaceChildren(seg);
  }
  // under a campaign: what the notifications said about it (last 3 days) and what the guard did to it, with the why
  const NOTE = { top: ['is-good', '🚀 TOP'], bad: ['is-bad', '⚠️ ATENȚIE'], watch: ['is-warn', '👀 De urmărit'] };
  function notesHtml(c) {
    const g = (A.d.guard && A.d.guard.log || []).filter((e) => e.campaignId === c.id).map((e) => [e.type === 'up' ? 'is-good' : 'is-bad',
      e.type === 'up' ? '📈 Buget mărit ' + e.from + ' → ' + e.to + ' lei/zi' : e.type === 'down' ? '📉 Buget înapoi ' + e.from + ' → ' + e.to + ' lei/zi' : '⛔ Oprită automat',
      (e.type === 'stop' && e.adName && e.adName !== e.campaignName ? e.adName + ': ' : '') + (e.why || '') + ' · ' + K.ago(e.at)]);
    const n = (c.notes || []).map((x) => [NOTE[x.flag][0], NOTE[x.flag][1], (x.ad ? x.ad + ': ' : '') + x.why.join(' · ') + ' (ultimele 3 zile)']);
    const all = g.concat(n);
    return all.length ? '<div class="ad-flags">' + all.map(([tone, label, text]) => '<p class="ad-flag ' + tone + '"><b>' + esc(label) + '</b><span>' + esc(text) + '</span></p>').join('') + '</div>' : '';
  }
  function campHtml(c) {
    return '<article class="k-card ad-camp' + (c.status === 'ACTIVE' ? '' : ' is-off') + (A.sel.has(c.id) ? ' is-picked' : '') + '" data-camp="' + esc(c.id) + '">' +
      '<div class="ad-row is-camp">' +
        '<div class="ad-name"><label class="ad-pick" title="Selectează campania"><input type="checkbox" data-pick="' + esc(c.id) + '"' + (A.sel.has(c.id) ? ' checked' : '') + '></label>' + sw(c.id, c.status === 'ACTIVE', 'campaign') + '<button type="button" class="ad-title" data-preview="' + esc(c.id) + '" title="Previzualizare"><b>' + esc(c.name) + '</b><small>' + tag(c.effective) + K.plural(c.adsets.length, 'set', 'seturi') + ' · ' + K.plural(c.adsets.reduce((n, s) => n + s.ads.length, 0), 'reclamă', 'reclame') + made(c) + '</small></button></div>' +
        '<div class="ad-mkpis">' + KEY.map((id) => '<div><small>' + esc(M[id].label) + '</small><b>' + esc(fmt(id, M[id].val(c))) + '</b></div>').join('') + '</div>' +
        cellsOf(c, 'campaign') +
        '<div class="ad-acts"><button type="button" class="k-icon-btn" data-preview="' + esc(c.id) + '" title="Previzualizare">' + icon('eye') + '</button>' +
          '<button type="button" class="k-icon-btn" data-more="campaign" data-id="' + esc(c.id) + '" data-name="' + esc(c.name) + '" title="Mai mult">' + icon('more') + '</button></div>' +
      '</div>' + notesHtml(c) +
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
    if (!apply) document.querySelectorAll('[data-k-seg="adperiod"] > button').forEach((b) => b.classList.toggle('is-on', b.dataset.v === (A.range ? 'custom' : A.period)));
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
      A.range = { since: a, until: z > today ? today : z };
      A.keep.clear();
      closeRange(true);
      load();
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
          '<span><small>Stare</small><b>' + (a.status === 'ACTIVE' ? 'Pornită' : 'Oprită') + '</b></span></div></div>';
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
          .catch((err) => { el.querySelector('[data-pv]').innerHTML = K.empty('alert', 'Nu am putut citi reclama', err.data && err.data.message ? err.data.message : K.errText(err)); });
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
          .catch((err) => { el.querySelector('[data-ed]').innerHTML = K.empty('alert', 'Nu am putut citi reclama', err.data && err.data.message ? err.data.message : K.errText(err)); });
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
    if (t.closest('[data-act="customize"]')) return customizeAds();
    if (t.closest('[data-act="creative"]')) { K.go('creative'); K.ui().toast('Deschide un creative aprobat și apasă „Publică pe Meta”.', 'info'); return; }
    const go = t.closest('[data-goto]'); if (go) return K.go(go.dataset.goto);
    const sh = t.closest('[data-show]'); if (sh) { A.show = sh.dataset.show; A.keep.clear(); return render(); }
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

  K.section('reclame', { mount, show: () => (A.d ? (Date.now() - (A.at || 0) > 20e3 ? load(true) : null) : load()) });
  const fresh = (ms) => { if (A.d && K.isActive('reclame') && !document.hidden && !K.drawerOpen && Date.now() - (A.at || 0) > ms) load(true); };
  // every 3 minutes while the page is open (Meta limits how often the ad account is read; the server keeps the
  // numbers for everyone), not on every change made elsewhere in the portal
  setInterval(() => fresh(170e3), 60e3);
  K.on('pull', () => fresh(0));
})();
