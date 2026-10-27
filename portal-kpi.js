// Centrul360 portal - Panou → KPI (the owner): every number of the clinic in one place, live (/api/kpi). From
// 16.10.2026, 22:05 on (what came before was brought over from HighLevel). Refreshes itself every minute and after
// every change anywhere (a lead, a booking, a payment), at most every 15 s.
//
// The page, top to bottom: the pulse (the five numbers that matter), the pace (today / yesterday / this month), what
// stands out (ads doing very well / very badly, leads not called, clients not coming…), the funnel with the speed to
// lead, bookings, money, the trend, the ads, the offers, the WhatsApp messages, the cities, the team.
(function () {
  'use strict';
  const K = window.K;
  const { esc, icon } = K;
  // opens on today; a period picked stays while the portal is open (the owner, 20.10)
  const S = { period: 'today', since: '', until: '', d: null, el: null, at: 0, busy: false, trend: 'money', src: 'revenue', err: '' };
  try { localStorage.removeItem('c360.kpi'); } catch (e) { /* the period once kept between openings */ }
  const PERIODS = [['today', 'Azi'], ['yesterday', 'Ieri'], ['7d', '7 zile'], ['30d', '30 zile'], ['month', 'Luna asta'], ['max', 'Tot timpul'], ['custom', 'Alege']];

  // ------------------------------------------------------------------ formatting
  const dec = (n, d) => (n == null ? '-' : (Math.round(Number(n) * Math.pow(10, d == null ? 1 : d)) / Math.pow(10, d == null ? 1 : d)).toLocaleString('ro-RO'));
  const P = (n) => (n == null ? '-' : dec(n, n >= 10 ? 0 : 1) + '%');
  const L = (n) => (n == null ? '-' : K.lei(n));
  const mins = (m) => (m == null ? '-' : m < 60 ? Math.round(m) + ' min' : m < 1440 ? dec(m / 60, 1) + ' h' : dec(m / 1440, 1) + ' zile');
  const ratio = (a, b) => (b ? Math.max(0, Math.min(100, (a / b) * 100)) : 0);
  const count = (v, fmt, key) => '<b data-count="' + (Number(v) || 0) + '"' + (fmt ? ' data-fmt="' + fmt + '"' : '') + ' data-key="kp-' + key + '">0</b>';
  const tone = (v, good, bad) => (v == null ? '' : v >= good ? 'is-good' : v <= bad ? 'is-bad' : 'is-warn');
  const card = (cls, head, body) => '<section class="k-card kp-card ' + cls + '">' + (head ? '<div class="kp-head">' + head + '</div>' : '') + body + '</section>';
  const h3 = (ic, t, extra) => '<h3>' + icon(ic) + t + '</h3>' + (extra || '');
  const none = (text) => '<p class="kp-none">' + icon('sparkles') + text + '</p>';

  // ------------------------------------------------------------------ load
  function url() {
    return '/api/kpi?period=' + S.period + (S.period === 'custom' && S.since && S.until ? '&since=' + S.since + '&until=' + S.until : '');
  }
  async function load(quiet) {
    if (S.busy) return;
    S.busy = true;
    if (!quiet || !S.d) paint(true);
    try { S.d = await K.api(url()); S.at = Date.now(); S.err = ''; } catch (e) { S.err = K.errText ? K.errText(e) : 'Nu am putut încărca cifrele'; }
    S.busy = false;
    paint(false);
  }

  // ------------------------------------------------------------------ pieces
  function headHtml(d) {
    const r = d && d.range;
    const label = r ? (r.since === r.until ? K.dateLong(r.since) : K.dateShort(r.since) + ' → ' + K.dateShort(r.until)) : '';
    return '<div class="kp-top"><div class="kp-title"><h2>KPI <span class="k-live">în timp real</span></h2><small>' + esc(label) + (d ? ' · numărăm de la 16 oct, 22:05' : '') + '</small></div>' +
      '<div class="kp-periods"><div class="k-chips">' + PERIODS.map(([k, l]) => '<button type="button" class="k-chip' + (S.period === k ? ' is-on' : '') + '" data-kp-period="' + k + '">' + (k === 'custom' ? icon('calendar') : '') + l + '</button>').join('') + '</div>' +
      (S.period === 'custom' ? '<form class="kp-range" data-kp-range><label><span>De la</span><input type="date" name="since" value="' + esc(S.since || (r && r.since) || '') + '" min="2026-10-16" max="' + esc(d ? d.today : '') + '" required></label>' +
        '<label><span>Până la</span><input type="date" name="until" value="' + esc(S.until || (r && r.until) || '') + '" min="2026-10-16" max="' + esc(d ? d.today : '') + '" required></label>' +
        '<button type="submit" class="k-btn is-sm is-accent">' + icon('check') + 'Arată</button></form>' : '') +
      '</div></div>';
  }

  // the five numbers that matter, on the lava band
  function pulseHtml(d) {
    const f = d.funnel, v = d.visits, m = d.money, a = d.ads ? d.ads.totals : null;
    const spark = (k) => (d.trend.length > 1 ? K.spark(d.trend.map((x) => x[k]), { color: '#fff', w: 110, h: 30 }) : '');
    const item = (label, value, sub, extra) => '<div class="kp-pulse-i"><span>' + label + '</span>' + value + '<small>' + sub + '</small>' + (extra || '') + '</div>';
    return '<section class="kp-pulse"><div class="db-aurora" aria-hidden="true"><i></i><i></i><i></i><i></i><i></i><i></i><i></i></div>' +
      item('Încasat', count(m.revenue, 'lei', 'rev'), m.upsell ? 'din care upsell ' + K.lei(m.upsell) : K.plural(m.payments, 'plată', 'plăți'), spark('revenue')) +
      item('Leaduri', count(f.leads, '', 'leads'), f.ads + ' din reclame · ' + f.organic + ' organic', spark('leads')) +
      item('Se programează', '<b>' + P(f.rates.booked) + '</b>', f.booked + ' din ' + f.leads + ' leaduri') +
      item('Vin la programare', '<b>' + P(v.rate) + '</b>', v.due ? v.came + ' din ' + v.due + ' cliente' : 'încă nicio zi trecută') +
      (a && a.spend ? item('La 1 leu în reclame', '<b>' + (a.roas != null ? dec(a.roas, 2) + ' lei' : '-') + '</b>', K.lei(a.spend) + ' cheltuiți') : item('Încasat / lead', '<b>' + L(f.perLead) + '</b>', 'din leadurile perioadei')) +
      '</section>';
  }

  // today / yesterday / this month, side by side: what the owner asked for in words
  function paceHtml(d) {
    const col = (key, title) => {
      const w = d.pace[key];
      if (!w) return '<div class="kp-pace-c is-empty"><h4>' + title + '</h4><p>înainte de 16 oct</p></div>';
      const b = w.bookings, v = w.visits;
      return '<div class="kp-pace-c"><h4>' + title + '</h4>' +
        '<div class="kp-pace-n"><span>Leaduri</span>' + count(w.leads, '', 'pl-' + key) + '</div>' +
        '<div class="kp-pace-n"><span>Programări făcute</span>' + count(b.made, '', 'pm-' + key) + '</div>' +
        '<div class="kp-pace-bar" title="din programările făcute"><i class="is-good" style="--w:' + ratio(b.came, b.made) + '%"></i><i class="is-bad" style="--w:' + ratio(b.missed, b.made) + '%"></i><i class="is-wait" style="--w:' + ratio(b.upcoming, b.made) + '%"></i></div>' +
        '<p class="kp-pace-s">' + (b.made ? '<b>' + b.came + '</b> au venit' + (b.due ? ' din ' + b.due + ' (' + P(b.rates.came) + ')' : '') + ' · ' + b.upcoming + ' urmează' + (b.cancelled ? ' · ' + b.cancelled + ' anulate' : '') : 'nicio programare făcută') + '</p>' +
        '<div class="kp-pace-n"><span>Au venit în ziua lor</span><b>' + (v.due ? v.came + ' / ' + v.due : '-') + '</b></div>' +
        '<div class="kp-pace-n is-money"><span>Încasat</span>' + count(w.revenue, 'lei', 'pr-' + key) + '</div></div>';
    };
    return card('kp-pace', h3('clock', 'Ritmul') + '<div class="kp-legend"><span><i class="is-good"></i>au venit</span><span><i class="is-bad"></i>n-au venit</span><span><i class="is-wait"></i>urmează</span></div>',
      '<div class="kp-pace-g">' + col('today', 'Azi') + col('yesterday', 'Ieri') + col('month', 'Luna asta') + '</div>');
  }

  function alertsHtml(d) {
    const list = d.alerts || [];
    const ic = { good: 'flame', bad: 'alert', warn: 'bell' };
    return card('kp-alerts', h3('zap', 'Ce iese în evidență', list.length ? '<span class="kp-count">' + list.length + '</span>' : ''),
      list.length ? '<div class="kp-al-g">' + list.map((a) => '<button type="button" class="kp-al is-' + a.tone + '"' + (a.go ? ' data-go="' + a.go + '"' : a.kind === 'ad' ? ' data-kp-ad="' + esc(a.id) + '"' : '') + '>' +
        '<span class="kp-al-ic">' + icon(ic[a.tone] || 'info') + '</span><span class="kp-al-t"><small>' + esc(a.title) + (a.tone === 'good' ? ' 🚀' : a.tone === 'bad' ? ' ⚠️' : '') + '</small><b>' + esc(a.name) + '</b><span>' + esc(a.text) + '</span></span></button>').join('') + '</div>'
        : none('Nimic ieșit din comun în perioada asta.'));
  }

  // the funnel: tapering steps with the conversion between them, the speed to lead beside it
  function funnelHtml(d) {
    const f = d.funnel;
    const steps = [['Leaduri', f.leads, 'userPlus'], ['Contactate', f.contacted, 'phone'], ['Programate', f.booked, 'calendar'], ['Au venit', f.came, 'checkCircle', f.waiting], ['Au plătit', f.paid, 'wallet'], ['Cu upsell', f.upsold, 'trophy']];
    const top = Math.max(1, f.leads);
    const sp = f.speed;
    const ringPct = sp.in5 != null ? sp.in5 : 0;
    return card('kp-funnel', h3('filter', 'Pâlnia', '<span class="kp-hint">din leadurile perioadei</span>'),
      '<div class="kp-fn-g"><ol class="kp-fn">' + steps.map(([l, v, ic, wait], i) => {
        const prev = i ? steps[i - 1][1] - (wait || 0) : 0; // came: of the booked whose day has come
        return (i ? '<li class="kp-fn-x"><span>' + icon('down') + (prev > 0 ? P(ratio(v, prev)) : '-') + '</span>' + (wait ? '<em>' + wait + ' urmează</em>' : '') + '</li>' : '') +
          '<li class="kp-fn-s" style="--w:' + Math.max(8, ratio(v, top)) + '%;--i:' + i + '"><span class="kp-fn-ic">' + icon(ic) + '</span><span class="kp-fn-l">' + l + '</span><b>' + K.num(v) + '</b></li>';
      }).join('') + '</ol>' +
      '<div class="kp-speed">' + K.ring(ringPct, { size: 132, stroke: 11, color: ringPct >= 60 ? 'var(--good)' : ringPct >= 30 ? 'var(--warn)' : 'var(--bad)', inner: '<b>' + mins(sp.median) + '</b><small>până la primul contact</small>' }) +
      '<div class="kp-speed-t"><div><span>în primele 5 minute</span><b>' + P(sp.in5) + '</b></div><div><span>în prima oră</span><b>' + P(sp.in60) + '</b></div><div><span>nesunate încă</span><b class="' + (f.leads - f.contacted ? 'is-bad' : '') + '">' + K.num(f.leads - f.contacted) + '</b></div></div></div></div>');
  }

  function bookingsHtml(d) {
    const b = d.bookings;
    const segs = [{ label: 'Au venit', value: b.came, color: 'var(--good)' }, { label: 'N-au venit', value: b.missed - Math.min(b.missed, b.cancelled), color: 'var(--bad)' },
      { label: 'Anulate', value: b.cancelled, color: 'var(--warn)' }, { label: 'Urmează', value: b.upcoming, color: 'var(--accent)' }];
    return card('kp-book', h3('calendar', 'Programările făcute'),
      b.made ? '<div class="kp-book-g">' + K.donut(segs, { size: 150, stroke: 18, inner: '<b>' + K.num(b.made) + '</b><small>făcute</small>' }) +
        '<ul class="kp-leg">' + segs.map((s) => '<li><i style="background:' + s.color + '"></i>' + s.label + '<b>' + K.num(s.value) + '</b></li>').join('') + '</ul></div>' +
        '<div class="kp-minis">' +
          '<div class="' + tone(b.rates.came, 80, 60) + '"><span>Vin</span><b>' + P(b.rates.came) + '</b><small>din cele cu ziua trecută</small></div>' +
          '<div><span>Confirmate</span><b>' + P(b.rates.confirmed) + '</b><small>' + b.confirmed + ' din ' + b.made + '</small></div>' +
          '<div><span>În avans</span><b>' + (b.daysAhead != null ? dec(b.daysAhead, 1) + ' zile' : '-') + '</b><small>de la programare la vizită</small></div>' +
          '<div><span>Lead → programare</span><b>' + (b.hoursToBook != null ? mins(b.hoursToBook * 60) : '-') + '</b><small>' + b.fromLeads + ' din leaduri noi</small></div>' +
        '</div>'
        : none('Nicio programare făcută în perioada asta.'));
  }

  function moneyHtml(d) {
    const m = d.money, v = d.visits;
    const adsW = ratio(m.ads, m.revenue);
    return card('kp-money', h3('wallet', 'Banii'),
      '<div class="kp-split"><div class="kp-split-bar"><i style="--w:' + adsW + '%"></i></div><div class="kp-split-l"><span><i class="is-ads"></i>Din reclame <b>' + K.lei(m.ads) + '</b></span><span><i class="is-org"></i>Organic <b>' + K.lei(m.organic) + '</b></span></div></div>' +
      '<div class="kp-minis">' +
        '<div><span>Bon mediu</span><b>' + L(m.ticket) + '</b><small>' + K.plural(m.payments, 'plată', 'plăți') + '</small></div>' +
        '<div class="' + tone(v.upsellRate, 40, 15) + '"><span>Upsell la vizite</span><b>' + P(v.upsellRate) + '</b><small>' + v.upsold + ' din ' + v.came + ' vizite</small></div>' +
        '<div><span>Upsell mediu</span><b>' + L(m.upsellAvg) + '</b><small>' + K.lei(m.upsell) + ' în total</small></div>' +
        '<div><span>Încasat / lead</span><b>' + L(d.funnel.perLead) + '</b><small>' + K.plural(m.clients, 'clientă', 'cliente') + ' au plătit</small></div>' +
      '</div>');
  }

  function trendHtml(d) {
    if (d.trend.length < 2) return '';
    return card('kp-trend', h3('trend', 'Zi cu zi') + '<div class="k-seg"><button type="button" data-kp-trend="money" class="' + (S.trend === 'money' ? 'is-on' : '') + '">Bani</button><button type="button" data-kp-trend="people" class="' + (S.trend === 'people' ? 'is-on' : '') + '">Oameni</button></div>',
      '<div data-kp-chart></div>');
  }
  function drawTrend(d) {
    const el = S.el && S.el.querySelector('[data-kp-chart]');
    if (!el) return;
    const t = d.trend, labels = t.map((x) => K.dateShort(x.day));
    const money = S.trend === 'money';
    const series = money
      ? [{ name: 'Reclame', values: t.map((x) => x.spend), color: 'var(--bad)', kind: 'line', dashed: true }, { name: 'Încasat', values: t.map((x) => x.revenue), color: 'var(--accent)' }]
      : [{ name: 'Leaduri', values: t.map((x) => x.leads), color: 'var(--accent)', kind: 'bar' }, { name: 'Programări făcute', values: t.map((x) => x.made), color: 'var(--info)', kind: 'line' }, { name: 'Au venit', values: t.map((x) => x.came), color: 'var(--good)', kind: 'line' }];
    el._kro = null;
    K.chart(el, { labels, height: 220, series, format: money ? K.lei : K.num, axis: (v) => (money && v >= 1000 ? dec(v / 1000, 1) + 'k' : Math.round(v)),
      tip: (i) => '<b>' + esc(K.dateLong(t[i].day)) + '</b>' + series.map((s) => '<span><i style="background:' + s.color + '"></i>' + s.name + ': ' + (money ? K.lei(s.values[i]) : K.num(s.values[i])) + '</span>').join('') });
  }

  // every ad: Meta's numbers and what its leads became; the very good and very bad ones marked
  function adsHtml(d) {
    if (d.adsState === 'none') return card('kp-ads', h3('facebook', 'Reclamele'), none('Cifrele reclamelor apar după ce lipești tokenul pentru reclame (Integrări → Facebook).'));
    if (d.adsState === 'error' || !d.ads) return card('kp-ads', h3('facebook', 'Reclamele'), '<p class="kp-none is-bad">' + icon('alert') + 'Meta: ' + esc(d.adsError || 'nu a răspuns') + '</p>');
    const a = d.ads.totals, rows = d.ads.rows;
    const tile = (l, v, s, cls) => '<div class="' + (cls || '') + '"><span>' + l + '</span><b>' + v + '</b>' + (s ? '<small>' + s + '</small>' : '') + '</div>';
    const status = (s) => (s === 'ACTIVE' ? '<i class="kp-dot is-on" title="activă"></i>' : '<i class="kp-dot" title="oprită"></i>');
    return card('kp-ads', h3('facebook', 'Reclamele', '<a class="k-btn is-sm is-outline" href="#reclame" data-go="reclame">Reclame' + icon('arrow') + '</a>'),
      '<div class="kp-tiles">' +
        tile('Cheltuit', K.lei(a.spend), K.num(a.impressions) + ' afișări') + tile('Cost / lead', L(a.cpl), a.leads + ' leaduri (' + a.metaLeads + ' la Meta)') +
        tile('Cost / programare', L(a.perBooked), a.booked + ' programate') + tile('Cost / clientă venită', L(a.perCame), a.came + ' au venit') +
        tile('Cost / clientă care a plătit', L(a.cpa), a.clients + ' au plătit') + tile('La 1 leu', a.roas != null ? dec(a.roas, 2) + ' lei' : '-', K.lei(a.revenue) + ' încasați', a.roas != null ? (a.roas >= 1 ? 'is-good' : 'is-bad') : '') +
        tile('Click pe reclamă', P(a.ctr), K.num(a.clicks) + ' clickuri') + tile('Cost / 1000 afișări', L(a.cpm), 'frecvență ' + dec(a.freq, 1)) +
      '</div>' +
      (rows.length ? '<div class="kp-ad-t"><div class="kp-ad-r is-head"><div>Reclamă</div><div>Cheltuit</div><div>Leaduri</div><div>Cost / lead</div><div>Programate</div><div>Au venit</div><div>Încasat</div><div>La 1 leu</div><div>Click</div><div>Frecv.</div></div>' +
        rows.map((x) => '<div class="kp-ad-r' + (x.flag ? ' is-' + x.flag : '') + '" data-kp-adrow="' + esc(x.id) + '">' +
          '<div class="kp-ad-n">' + (x.thumb ? '<img src="' + esc(x.thumb) + '" alt="" loading="lazy" referrerpolicy="no-referrer">' : '<span class="kp-ad-ph">' + icon('image') + '</span>') +
            '<span><b>' + status(x.status) + esc(x.name || 'Reclamă') + (x.flag === 'top' ? ' <em class="kp-badge is-good">🚀 merge foarte bine</em>' : x.flag === 'bad' ? ' <em class="kp-badge is-bad">⚠️ merge rău</em>' : x.flag === 'watch' ? ' <em class="kp-badge is-warn">de urmărit</em>' : '') + '</b>' +
            '<small>' + esc(x.campaign) + '</small>' + (x.flag ? '<small class="kp-why">' + esc(x.why.join(' · ')) + '</small>' : '') + '</span></div>' +
          '<div data-l="Cheltuit">' + K.lei(x.spend) + '</div><div data-l="Leaduri"><b>' + x.leads + '</b>' + (x.metaLeads !== x.leads ? ' <small>' + x.metaLeads + ' Meta</small>' : '') + '</div>' +
          '<div data-l="Cost / lead">' + L(x.cpl) + '</div><div data-l="Programate">' + x.booked + (x.leads ? ' <small>' + P(x.bookRate) + '</small>' : '') + '</div>' +
          '<div data-l="Au venit">' + x.came + '</div><div data-l="Încasat">' + (x.revenue ? K.lei(x.revenue) : '-') + '</div>' +
          '<div data-l="La 1 leu" class="' + (x.roas != null ? (x.roas >= 1 ? 'is-good' : 'is-bad') : '') + '">' + (x.roas != null ? dec(x.roas, 2) : '-') + '</div>' +
          '<div data-l="Click">' + P(x.ctr) + '</div><div data-l="Frecv." class="' + (x.freq >= 3.5 ? 'is-bad' : '') + '">' + dec(x.freq, 1) + '</div></div>').join('') + '</div>'
        : none('Nicio reclamă n-a cheltuit în perioada asta.')));
  }

  // each offer: a small funnel bar (leads → booked → came) and the money; the organic sources as chips
  function offersHtml(d) {
    const rows = d.offers.rows.filter((x) => x.group === 'ads'), org = d.offers.rows.filter((x) => x.group === 'organic');
    const top = Math.max(1, ...d.offers.rows.map((x) => x.revenue));
    return card('kp-offers', h3('tag', 'Ofertele', '<a class="k-btn is-sm is-outline" href="#oferte" data-go="oferte">Oferte' + icon('arrow') + '</a>'),
      (rows.length ? '<div class="kp-of">' + rows.map((x, i) => '<div class="kp-of-r' + (i === 0 && x.revenue > 0 ? ' is-top' : '') + '">' +
        '<div class="kp-of-n"><b>' + esc(x.title) + '</b><span class="kp-of-m"><i style="--w:' + ratio(x.revenue, top) + '%"></i></span></div>' +
        '<div class="kp-of-f" title="leaduri → programate → au venit"><span>' + x.leads + '</span>' + icon('right') + '<span>' + x.booked + '</span>' + icon('right') + '<span>' + x.came + '</span><small>' + P(x.bookRate) + ' se programează</small></div>' +
        '<div class="kp-of-v"><b>' + K.lei(x.revenue) + '</b><small>' + (x.spend ? K.lei(x.spend) + ' reclame' + (x.roas != null ? ' · ' + dec(x.roas, 2) + ' la 1 leu' : '') : x.upsell ? 'upsell ' + K.lei(x.upsell) : '') + '</small></div></div>').join('') + '</div>'
        : none('Niciun lead din reclame în perioada asta.')));
  }

  // where they come from: the ads and every organic source, leads and money
  function sourcesHtml(d) {
    const COLORS = ['var(--good)', 'var(--info)', 'var(--warn)', '#f472b6', '#22d3ee', '#a3e635', 'var(--muted-2)'];
    let c = 0;
    const segs = (d.sources || []).map((x) => ({ label: x.title, leads: x.leads, revenue: x.revenue, color: x.key === 'ads' ? 'var(--accent)' : COLORS[c++ % COLORS.length] }));
    const by = S.src === 'leads' ? 'leads' : 'revenue';
    const total = segs.reduce((n, s) => n + s[by], 0);
    return card('kp-src', h3('globe', 'De unde vin') + '<div class="k-seg"><button type="button" data-kp-src="revenue" class="' + (by === 'revenue' ? 'is-on' : '') + '">Bani</button><button type="button" data-kp-src="leads" class="' + (by === 'leads' ? 'is-on' : '') + '">Leaduri</button></div>',
      total ? '<div class="kp-src-g">' + K.donut(segs.map((s) => ({ label: s.label, value: s[by], color: s.color })), { size: 140, stroke: 16, inner: '<b>' + (by === 'revenue' ? K.lei(total) : K.num(total)) + '</b><small>' + (by === 'revenue' ? 'încasat' : 'leaduri') + '</small>' }) +
        '<ul class="kp-leg">' + segs.filter((s) => s[by] > 0).map((s) => '<li><i style="background:' + s.color + '"></i><span class="kp-leg-t">' + esc(s.label) + '</span><b>' + (by === 'revenue' ? K.lei(s[by]) : K.num(s[by])) + '</b></li>').join('') + '</ul></div>'
        : none('Nimic încă în perioada asta.'));
  }

  // each WhatsApp template: sent → delivered → read → answered → booked
  function messagesHtml(d) {
    const m = d.messages, rows = m.rows, t = m.team;
    const GROUP = { lead: 'Lead nou', reminder: 'Reamintire', other: 'Alt mesaj' };
    const step = (l, v, base) => '<span class="kp-msg-s" style="--w:' + ratio(v, base) + '%"><i></i><small>' + l + '</small><b>' + (base ? P(ratio(v, base)) : '-') + '</b></span>';
    return card('kp-msgs', h3('chat', 'Mesajele WhatsApp', '<a class="k-btn is-sm is-outline" href="#automatizari" data-go="automatizari">Mesaje' + icon('arrow') + '</a>'),
      '<div class="kp-minis is-row">' +
        '<div class="' + tone(t.median == null ? null : -t.median, -15, -60) + '"><span>Răspundem în</span><b>' + mins(t.median) + '</b><small>când ne scrie o clientă</small></div>' +
        '<div><span>Sub 15 minute</span><b>' + P(t.in15) + '</b><small>' + t.answered + ' din ' + t.inbound + ' conversații</small></div>' +
        '<div class="' + (t.unanswered ? 'is-bad' : 'is-good') + '"><span>Fără răspuns</span><b>' + K.num(t.unanswered) + '</b><small>de peste 30 de minute</small></div>' +
      '</div>' +
      (rows.length ? '<div class="kp-msg">' + rows.map((x) => {
        const base = x.sent - x.failed;
        return '<div class="kp-msg-r"><div class="kp-msg-n"><em>' + GROUP[x.group] + '</em><b>' + esc(x.label) + '</b><small>' + K.plural(x.sent, 'trimis', 'trimise') + (x.failed ? ' · ' + x.failed + ' n-au ajuns' : '') + (x.replyMin != null ? ' · răspund în ' + mins(x.replyMin) : '') + '</small></div>' +
          '<div class="kp-msg-l">' + step('livrate', x.delivered, base) + step('citite', x.read, base) + step('au răspuns', x.replied, base) + step('s-au programat', x.booked, base) + '</div></div>';
      }).join('') + '</div>'
        : none('Mesajele automate trimise de acum încolo apar aici, cu cine le-a citit și cine a răspuns.')));
  }

  function citiesHtml(d) {
    const c = d.cities;
    const max = (k) => Math.max(1, ...c.map((x) => (typeof k === 'function' ? k(x) : x[k]) || 0));
    const line = (label, fn, fmt) => '<div class="kp-city-l"><span>' + label + '</span>' + c.map((x, i) => { const v = fn(x) || 0; return '<div class="kp-city-v is-' + i + '"><i style="--w:' + ratio(v, max(fn)) + '%"></i><b>' + fmt(v) + '</b></div>'; }).join('') + '</div>';
    return card('kp-cities', h3('pin', 'Orașele') + '<div class="kp-legend">' + c.map((x, i) => '<span><i class="is-c' + i + '"></i>' + esc(x.city) + '</span>').join('') + '</div>',
      '<div class="kp-city">' + line('Leaduri', (x) => x.leads, K.num) + line('Programări făcute', (x) => x.made, K.num) + line('Au venit', (x) => x.visits.came, K.num) +
        '<div class="kp-city-l"><span>Vin la programare</span>' + c.map((x, i) => '<div class="kp-city-v is-' + i + ' is-rate"><b>' + P(x.visits.rate) + '</b></div>').join('') + '</div>' +
        line('Încasat', (x) => x.money.revenue, K.lei) + line('Upsell', (x) => x.money.upsell, K.lei) + '</div>');
  }

  function teamHtml(d) {
    const t = d.team;
    const board = (ic, title, rows, main, sub) => '<div class="kp-board"><h4>' + icon(ic) + title + '</h4>' + (rows.length ? '<ol>' + rows.slice(0, 6).map((x, i) => '<li><span class="kp-rank">' + (i + 1) + '</span>' + K.avatar(x.name, 28) + '<b>' + esc(x.name) + '</b><span class="kp-board-v">' + main(x) + '<small>' + sub(x) + '</small></span></li>').join('') + '</ol>' : '<p class="kp-none">-</p>') + '</div>';
    return card('kp-team', h3('users', 'Echipa'),
      '<div class="kp-team-g">' +
        board('calendar', 'Programări făcute', t.booking, (x) => '<b>' + x.made + '</b>', (x) => (x.due ? P(x.rate) + ' au venit' : 'urmează')) +
        board('phone', 'Primul contact', t.contact, (x) => '<b>' + mins(x.median) + '</b>', (x) => x.contacted + ' leaduri · ' + P(x.in5) + ' sub 5 min') +
        board('trophy', 'Upsell la vizite', t.care, (x) => '<b>' + P(x.rate) + '</b>', (x) => x.upsold + ' din ' + x.came + (x.upsell ? ' · ' + K.lei(x.upsell) : '')) +
      '</div>');
  }

  // ------------------------------------------------------------------ paint
  function paint(loading) {
    if (!S.el) return;
    const d = S.d;
    if (!d) {
      S.el.innerHTML = headHtml(null) + (S.err ? K.empty('alert', 'Nu am putut încărca cifrele', esc(S.err), '<button type="button" class="k-btn is-primary" data-kp-reload>Reîncearcă</button>')
        : '<div class="k-skel" style="height:150px;border-radius:24px"></div><div class="k-skel" style="height:260px;margin-top:1rem"></div>');
      return;
    }
    S.el.classList.toggle('is-loading', !!loading);
    S.el.innerHTML = headHtml(d) + pulseHtml(d) +
      '<div class="kp-grid">' +
        '<div class="kp-b is-wide">' + paceHtml(d) + '</div><div class="kp-b">' + alertsHtml(d) + '</div>' +
        '<div class="kp-b is-full">' + funnelHtml(d) + '</div>' +
        '<div class="kp-b">' + bookingsHtml(d) + '</div><div class="kp-b">' + moneyHtml(d) + '</div><div class="kp-b">' + sourcesHtml(d) + '</div>' +
        (d.trend.length > 1 ? '<div class="kp-b is-full">' + trendHtml(d) + '</div>' : '') +
        '<div class="kp-b is-full">' + adsHtml(d) + '</div>' +
        '<div class="kp-b is-wide">' + offersHtml(d) + '</div><div class="kp-b">' + citiesHtml(d) + '</div>' +
        '<div class="kp-b is-full">' + messagesHtml(d) + '</div>' +
        '<div class="kp-b is-full">' + teamHtml(d) + '</div>' +
      '</div>' +
      '<p class="kp-foot">' + icon('refresh') + '<span data-kp-ago></span></p>';
    drawTrend(d);
    K.countAll(S.el);
    tick();
  }
  function tick() {
    const el = S.el && S.el.querySelector('[data-kp-ago]');
    if (el && S.at) { const s = Math.round((Date.now() - S.at) / 1000); el.textContent = 'actualizat ' + (s < 5 ? 'acum' : s < 60 ? 'acum ' + s + ' s' : 'acum ' + Math.round(s / 60) + ' min') + ' · se actualizează singur'; }
  }

  // ------------------------------------------------------------------ events
  function onClick(e) {
    const p = e.target.closest('[data-kp-period]');
    if (p) {
      S.period = p.dataset.kpPeriod;
      if (S.period === 'custom' && !(S.since && S.until)) { paint(false); const i = S.el.querySelector('[data-kp-range] input'); if (i) i.focus(); return; }
      load();
      return;
    }
    const sr = e.target.closest('[data-kp-src]');
    if (sr) { S.src = sr.dataset.kpSrc; paint(false); return; }
    const tr = e.target.closest('[data-kp-trend]');
    if (tr) { S.trend = tr.dataset.kpTrend; S.el.querySelectorAll('[data-kp-trend]').forEach((b) => b.classList.toggle('is-on', b === tr)); if (S.d) drawTrend(S.d); return; }
    if (e.target.closest('[data-kp-reload]')) { load(); return; }
    const ad = e.target.closest('[data-kp-ad]');
    if (ad) { const row = S.el.querySelector('[data-kp-adrow="' + CSS.escape(ad.dataset.kpAd) + '"]'); if (row) { row.scrollIntoView({ behavior: 'smooth', block: 'center' }); row.classList.add('is-flash'); setTimeout(() => row.classList.remove('is-flash'), 1600); } }
  }
  function onSubmit(e) {
    const f = e.target.closest('[data-kp-range]');
    if (!f) return;
    e.preventDefault();
    S.since = f.since.value; S.until = f.until.value;
    if (!S.since || !S.until) return;
    load();
  }

  let timer = 0, liveAt = 0;
  window.C360Kpi = {
    // into the Panou's box (the owner switched to KPI)
    mount(el) {
      if (S.el !== el) {
        S.el = el;
        el.classList.add('kp');
        el.addEventListener('click', onClick);
        el.addEventListener('submit', onSubmit);
      }
      const picking = () => !!(S.el && S.el.querySelector('[data-kp-range] input:focus'));
      if (S.d && !picking()) paint(false);
      if (!S.d || (Date.now() - S.at > 20e3 && !picking())) load(!!S.d);
      clearInterval(timer);
      timer = setInterval(() => {
        if (!S.el || !S.el.isConnected || !K.isActive('panou')) { clearInterval(timer); return; }
        if (!document.hidden && !picking()) load(true);
      }, 60e3);
    },
    active() { return !!(S.el && S.el.isConnected); },
  };
  K.everySecond(tick);
  // a change anywhere (a lead, a booking, a payment): the numbers follow, at most every 15 s
  K.on('remote', () => {
    if (!S.el || !S.el.isConnected || !K.isActive('panou') || document.hidden || Date.now() - liveAt < 15e3) return;
    liveAt = Date.now();
    setTimeout(() => load(true), 1500);
  });
})();
