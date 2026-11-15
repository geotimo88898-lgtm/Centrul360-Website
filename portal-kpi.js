// Centrul360 portal - Panou → KPI (the owner, and the manager for her clinics without the ads and their costs) and the
// „Azi pe clinici” block of Panou → Azi. Everything from /api/kpi. From 16.10.2026, 22:05 on (before: HighLevel).
//
// The page, top to bottom (the owner, 15.11: „să aibă maxim sens”; each block answers a decision):
//   the period bar     sticky at the top: Azi, Ieri, Săptămâna asta / trecută, Luna asta / trecută, 7 / 30 / 90 de zile,
//                      Anul acesta, Interval (De la / Până la); what it is compared with
//   the deck           the animated numbers of the period (portal-summit-kpi.js)
//   what stands out    ads doing very well / badly, leads not called, clients not coming (facts only)
//   the cities         per clinic: lead → contacted → booked → came → paid → package, the rate of each step and, for the
//                      owner, the ads' spend and what each step cost (are the leads enough, what do they cost)
//   the money          collected (↑ / ↓), per clinic, cash / card / transfer, packages and their average value, what is
//                      still to collect from packages paid in parts
//   the cosmeticians   lei per day worked vs 1500
//   the calendar       the next 7 days booked vs the team's hours (target: full + 50%)
//   the sales          consultations followed within 7 days by a package, the show-up rate
//   the reception      leads reached within 5 minutes, the ones never reached, messages waiting, who calls first
//   the ads, the trend, the offers (the owner), how each number is computed
// Fast: every period's answer is kept (switching back is instant, it is read again behind the page), the next ones are
// read ahead while the page is idle, the numbers on the page stay until the new ones are there (no blank, no flash).
(function () {
  'use strict';
  const K = window.K;
  const { esc, icon } = K;
  const S = { period: 'today', since: '', until: '', d: null, el: null, bar: null, deck: null, body: null, at: 0, err: '', want: '', trend: 'money', open: false };
  try { localStorage.removeItem('c360.kpi'); } catch (e) { /* the period once kept between openings */ }
  const PERIODS = [['today', 'Azi'], ['yesterday', 'Ieri'], ['week', 'Săptămâna asta'], ['lastweek', 'Săptămâna trecută'], ['month', 'Luna asta'], ['lastmonth', 'Luna trecută'],
    ['7d', 'Ultimele 7 zile'], ['30d', 'Ultimele 30 de zile'], ['90d', 'Ultimele 90 de zile'], ['year', 'Anul acesta'], ['custom', 'Interval']];
  const LABEL = Object.fromEntries(PERIODS);

  // ------------------------------------------------------------------ formatting
  const dec = (n, d) => (n == null ? '-' : (Math.round(Number(n) * Math.pow(10, d == null ? 1 : d)) / Math.pow(10, d == null ? 1 : d)).toLocaleString('ro-RO'));
  const P = (n) => (n == null ? '-' : dec(n, n >= 10 ? 0 : 1) + '%');
  const L = (n) => (n == null ? '-' : K.lei(n));
  const L2 = (n) => (n == null ? '-' : K.lei(n, n < 100 ? 2 : 0));
  const mins = (m) => (m == null ? '-' : m < 60 ? Math.round(m) + ' min' : m < 1440 ? dec(m / 60, 1) + ' h' : dec(m / 1440, 1) + ' zile');
  const ratio = (a, b) => (b ? Math.max(0, Math.min(100, (a / b) * 100)) : 0);
  const pct = (a, b) => (b ? Math.round((a / b) * 1000) / 10 : null);
  const none = (text) => '<p class="kq-none">' + icon('sparkles') + esc(text) + '</p>';
  const short = (c) => (c === 'Arad' ? 'AR' : 'TM');
  const rangeText = (r) => (!r ? '' : r.since === r.until ? K.dateLong(r.since) : K.dateShort(r.since) + ' → ' + K.dateShort(r.until));
  const owner = (d) => !(d && d.scope);
  // ↑ / ↓ against the previous period: kind 'cost' (lower is better), 'pt' (a rate: the difference in points)
  function dl(cur, prev, kind) {
    if (cur == null || prev == null || !Number.isFinite(Number(cur)) || !Number.isFinite(Number(prev))) return '';
    if (kind === 'pt') {
      const p = Math.round(Number(cur) - Number(prev));
      return p ? '<span class="kq-d ' + (p > 0 ? 'is-good' : 'is-bad') + '" title="înainte ' + P(prev) + '">' + (p > 0 ? '↑ ' : '↓ ') + Math.abs(p) + ' pt</span>' : '<span class="kq-d is-flat" title="la fel ca înainte">=</span>';
    }
    if (!Number(prev)) return '';
    const p = Math.round(((cur - prev) / Math.abs(prev)) * 100);
    if (!p) return '<span class="kq-d is-flat" title="la fel ca înainte">=</span>';
    const good = kind === 'cost' ? p < 0 : p > 0;
    return '<span class="kq-d ' + (good ? 'is-good' : 'is-bad') + '" title="înainte ' + esc(kind === 'lei' || kind === 'cost' ? K.lei(prev) : K.num(prev)) + '">' + (p > 0 ? '↑ ' : '↓ ') + Math.abs(p) + '%</span>';
  }
  const pv = (d) => (d && d.prev && d.prev.summary) || null;
  const card = (key, cls, ic, title, hint, body, extra) => '<section class="k-card kq-card ' + cls + '" data-part="' + key + '"><div class="kq-head"><h3>' + icon(ic) + esc(title) + '</h3>' + (hint ? '<span class="kq-hint">' + hint + '</span>' : '') + (extra || '') + '</div>' + body + '</section>';
  const go = (tab, label, then) => '<button type="button" class="kq-go" data-go="' + tab + '"' + (then ? ' data-then="' + then + '"' : '') + '>' + esc(label) + icon('arrow') + '</button>';

  // ------------------------------------------------------------------ the answers, kept per period (shared with the deck, Azi and Nuki's lines)
  const cache = new Map(), inflight = new Map();
  function fetchKpi(q, maxAge) {
    const c = cache.get(q);
    if (c && Date.now() - c.at < (maxAge == null ? 30e3 : maxAge)) return Promise.resolve(c.d);
    if (inflight.has(q)) return inflight.get(q);
    const p = K.api('/api/kpi?' + q).then((d) => { cache.set(q, { d, at: Date.now() }); inflight.delete(q); return d; }, (e) => { inflight.delete(q); throw e; });
    inflight.set(q, p);
    return p;
  }
  const qOf = (period, since, until) => 'period=' + period + (period === 'custom' ? '&since=' + since + '&until=' + until : '');
  const curQ = () => qOf(S.period, S.since, S.until);

  // load the period on screen: an answer kept is drawn at once (and read again behind it when older than 30 s); a new one
  // keeps the numbers on the page, the bar shows it is reading, the page changes when it is there
  function load(quiet) {
    const q = curQ();
    S.want = q;
    const c = cache.get(q);
    if (c) { S.d = c.d; S.dq = q; S.at = c.at; S.err = ''; paint(); if (Date.now() - c.at < 30e3) { prefetch(); return; } }
    if (!(quiet && c)) busy(true); // a refresh behind numbers already there: no sign of it
    fetchKpi(q, c ? 0 : 30e3).then((d) => {
      if (S.want !== q) return;
      const same = S.d === d || (S.d && JSON.stringify(S.d) === JSON.stringify(d));
      S.d = d; S.dq = q; S.at = Date.now(); S.err = '';
      busy(false);
      if (!same || !quiet) paint(); else tick();
      prefetch();
    }, (e) => {
      if (S.want !== q) return;
      busy(false);
      S.err = K.errText ? K.errText(e, 'Nu am putut încărca cifrele') : 'Nu am putut încărca cifrele';
      if (!S.d) paint(); else K.ui && K.ui().toast && K.ui().toast(S.err, 'error');
    });
  }
  // the periods one taps next, read ahead one at a time while the page is idle (each one is a few tens of ms on the server)
  let pre = 0;
  function prefetch() {
    clearTimeout(pre);
    const next = ['today', 'yesterday', 'week', '7d', 'month', 'lastweek', 'lastmonth', '30d'].map((p) => qOf(p)).find((q) => !cache.has(q) && !inflight.has(q));
    if (!next || document.hidden || !S.el || !S.el.isConnected) return;
    pre = setTimeout(() => { fetchKpi(next).then(prefetch, () => {}); }, 350);
  }
  function busy(on) { if (S.bar) S.bar.classList.toggle('is-busy', !!on); if (S.body) S.body.classList.toggle('is-stale', !!on && !!S.d && S.dq !== S.want); } // the numbers of another period, until the new ones come

  // ------------------------------------------------------------------ the period bar (drawn once; its chips scroll sideways on a phone)
  function barHtml() {
    return '<div class="kq-bar-in"><div class="kq-chips" role="tablist" aria-label="Perioada">' + PERIODS.map(([k, l]) => '<button type="button" role="tab" class="kq-chip" data-kp-period="' + k + '">' + (k === 'custom' ? icon('calendar') : '') + esc(l) + '</button>').join('') + '</div>' +
      '<form class="kq-range" data-kp-range hidden><label><span>De la</span><input type="date" name="since" min="2026-10-16" required></label><label><span>Până la</span><input type="date" name="until" min="2026-10-16" required></label>' +
      '<button type="submit" class="k-btn is-sm is-accent">' + icon('check') + 'Arată</button></form>' +
      '<div class="kq-when"><b data-kq-range></b><span data-kq-vs></span><i class="kq-load" aria-hidden="true"></i></div></div>';
  }
  function syncBar() {
    if (!S.bar) return;
    S.bar.querySelectorAll('[data-kp-period]').forEach((b) => { const on = b.dataset.kpPeriod === S.period; b.classList.toggle('is-on', on); b.setAttribute('aria-selected', on ? 'true' : 'false'); });
    const f = S.bar.querySelector('[data-kp-range]');
    f.hidden = !(S.period === 'custom' || S.open);
    const today = (S.d && (S.d.now && S.d.now.date)) || K.today();
    f.since.max = today; f.until.max = today;
    if (!f.since.value) f.since.value = S.since || (S.d && S.d.range && S.d.range.since) || today;
    if (!f.until.value) f.until.value = S.until || today;
    const d = S.d, r = d && d.range;
    S.bar.querySelector('[data-kq-range]').textContent = r ? rangeText(r) : '';
    const vs = !d ? '' : d.prev ? (d.prev.cut ? 'față de ieri, la aceeași oră' : 'față de ' + rangeText(d.prev.range)) : r && r.clipped ? 'de la 16 oct (de atunci avem date)' : d.period === 'max' ? 'de la 16 oct' : 'fără perioadă de comparat (înainte de 16 oct nu avem date)';
    S.bar.querySelector('[data-kq-vs]').textContent = vs;
  }
  function scrollChip() {
    const on = S.bar && S.bar.querySelector('.kq-chip.is-on'), row = S.bar && S.bar.querySelector('.kq-chips');
    if (on && row && row.scrollWidth > row.clientWidth) row.scrollTo({ left: Math.max(0, on.offsetLeft - 16), behavior: 'smooth' });
  }

  // ------------------------------------------------------------------ the pieces: one idea per card, its big number first, one short line
  // a big number that rolls up when its card reaches the screen (from the number it showed before, on a new period)
  const big = (k, v, fmt, cls) => '<b class="kq-n' + (cls ? ' ' + cls : '') + '" data-kq-n="' + (Number(v) || 0) + '" data-kq-f="' + fmt + '" data-kq-k="' + k + '">' + esc(fmtN(v, fmt)) + '</b>';
  function fmtN(v, f) { return v == null ? '-' : f === 'lei' ? K.lei(v) : f === 'pct' ? P(v) : K.num(v); }
  const hero = (k, v, fmt, delta, line, cls) => '<div class="kq-hero">' + big(k, v, fmt, cls) + (delta || '') + (line ? '<p>' + line + '</p>' : '') + '</div>';
  const tag = (c) => '<span class="kq-tag">' + short(c) + '</span>';
  const tone3 = (v, good, ok) => (v == null ? '' : v >= good ? 'is-good' : v >= ok ? 'is-warn' : 'is-bad');
  // a ring that closes to its share (consultation → package)
  function ring(p, cls) {
    const C = 2 * Math.PI * 26, v = Math.max(0, Math.min(100, p || 0)) / 100;
    return '<svg class="kq-ring ' + (cls || '') + '" viewBox="0 0 64 64" aria-hidden="true"><circle cx="32" cy="32" r="26" class="tr"/><circle cx="32" cy="32" r="26" class="fl" style="--c:' + C.toFixed(1) + ';--o:' + (C * (1 - v)).toFixed(1) + '" stroke-dasharray="' + C.toFixed(1) + '" transform="rotate(-90 32 32)"/></svg>';
  }

  function alertsHtml(d) {
    const list = d.alerts || [];
    if (!list.length) return '';
    const ic = { good: 'flame', bad: 'alert', warn: 'bell' };
    return card('alerts', 'kq-alerts is-full', 'zap', 'Ce iese în evidență', '<span class="kq-count">' + list.length + '</span>',
      '<div class="kq-al-g">' + list.map((a, i) => '<button type="button" style="--i:' + i + '" class="kq-al is-' + a.tone + '"' + (a.go ? ' data-go="' + a.go + '"' : a.kind === 'ad' ? ' data-kp-ad="' + esc(a.id) + '"' : '') + '>' +
        '<span class="kq-al-ic">' + icon(ic[a.tone] || 'info') + '</span><span class="kq-al-t"><small>' + esc(a.title) + '</small><b>' + esc(a.name) + '</b><span>' + esc(a.text) + '</span></span></button>').join('') + '</div>');
  }

  // the manager's own targets, per clinic (her section, after the animation), with her three actions
  function managerHtml(d) {
    const T = (d.targets && d.targets.perDay) || 1500, F = (d.targets && d.targets.fill) || 150;
    const pend = K.data && K.data.manager ? (K.data.manager.pendingTime || 0) + (K.data.manager.pendingLeave || 0) : 0;
    const rows = Object.keys(d.clinic || {}).map((c) => {
      const x = d.clinic[c], team = x.team || [], under = team.filter((p) => !p.ok).length;
      const goals = [
        [team.length ? !under : null, 'Lei / zi', team.length ? (under ? under + ' sub ' + K.lei(T) : 'toate peste ' + K.lei(T)) : 'nicio zi lucrată'],
        [x.fill.pct == null ? null : x.fill.pct >= F, 'Calendar 7 zile', P(x.fill.pct) + ' din ținta ' + F + '%'],
        [x.reception.pct == null ? null : x.reception.pct >= 100, 'Leaduri în 5 min', P(x.reception.pct) + (x.reception.never ? ' · ' + x.reception.never + ' nesunate' : '')],
        [!x.waiting, 'Mesaje', x.waiting ? x.waiting + ' așteaptă' : 'niciunul nu așteaptă'],
        [x.consults.pct == null ? null : x.consults.pct >= 50, 'Consultație → pachet', P(x.consults.pct) + ' din ținta 50%'],
      ];
      const hit = goals.filter((g) => g[0] === true).length, known = goals.filter((g) => g[0] != null).length;
      return '<div class="kq-mg-c"><div class="kq-mg-h"><h4>' + tag(c) + esc(c) + '</h4><b>' + hit + '<small> din ' + known + ' ținte</small></b></div>' +
        '<ul class="kq-goals">' + goals.map((g, i) => '<li style="--i:' + i + '" class="' + (g[0] === true ? 'is-ok' : g[0] === false ? 'is-no' : 'is-na') + '"><i>' + icon(g[0] === true ? 'check' : g[0] === false ? 'x' : 'minus') + '</i><span><b>' + g[1] + '</b><small>' + esc(g[2]) + '</small></span></li>').join('') + '</ul></div>';
    });
    return card('mgr', 'kq-mgr is-full', 'target', 'Țintele tale', 'în perioada aleasă; calendarul: următoarele 7 zile',
      '<div class="kq-mg-acts"><button type="button" class="k-btn is-accent" data-mg="george">' + icon('bell') + 'Anunță-l pe George</button><button type="button" class="k-btn is-outline" data-mg="close">' + icon('cash') + 'Închide ziua</button>' +
        '<button type="button" class="k-btn is-outline" data-mg="report">' + icon('listCheck') + 'Raport săptămânal</button></div>' +
      '<div class="kq-mg-g">' + rows.join('') + '</div>' +
      '<div class="kq-mg-links"><button type="button" class="kq-go" data-go="manager/echipa">Echipa: pontaj și concedii' + (pend ? ' <b class="kq-count">' + pend + '</b>' : '') + icon('arrow') + '</button><button type="button" class="kq-go" data-go="manager/casa">Casa' + icon('arrow') + '</button><button type="button" class="kq-go" data-go="manager/rapoarte">Rapoarte' + icon('arrow') + '</button></div>');
  }

  // per clinic: the funnel of its leads (it pours, top to bottom), each step's rate and (the owner) what it cost
  function citiesHtml(d) {
    const p = pv(d), own = owner(d);
    const rows = (d.cities && d.cities.rows) || [];
    const city = (c) => {
      const f = c.funnel, pc = p && p.cities && p.cities[c.city], cost = own && c.cost;
      const steps = [
        ['Leaduri', f.leads, '', cost && cost.lead],
        ['Contactate', f.contacted, f.leads ? P(f.rates.contacted) : '', cost && cost.contacted],
        ['Programate', f.booked, f.leads ? P(f.rates.booked) : '', cost && cost.booked],
        ['Au venit', f.came, (f.rates.came != null ? P(f.rates.came) : '') + (f.waiting ? (f.rates.came != null ? ', ' : '') + f.waiting + ' urmează' : ''), cost && cost.came],
        ['Au plătit', f.paid, f.came ? P(pct(f.paid, f.came)) + ' din venite' : '', cost && cost.paid],
        ['Pachet', f.upsold, f.came ? P(pct(f.upsold, f.came)) + ' din venite' : '', cost && cost.upsold],
      ];
      const top = Math.max(1, f.leads);
      const line = (own && c.spend != null ? K.lei(c.spend) + ' cheltuiți · ' + L2(cost && cost.lead) + ' un lead · ' + (c.roas ? dec(c.roas, 2) + ' lei la 1 leu' : 'încă nicio plată din ele') + '<br>' : '') + f.ads + ' din reclame · ' + f.organic + ' organic';
      return '<article class="kq-city">' +
        '<header class="kq-city-h"><h4>' + tag(c.city) + esc(c.city) + '</h4>' + hero('city-' + c.city, f.leads, 'num', pc ? dl(f.leads, pc.leads) : '', '<span>leaduri</span> · ' + line) + '</header>' +
        (f.leads ? '<ol class="kq-fn">' + steps.map(([l, v, sub, cst], i) => '<li style="--w:' + Math.max(2, ratio(v, top)) + '%;--i:' + i + '"><div class="kq-fn-t"><span>' + l + (sub ? ' <small>' + sub + '</small>' : '') + '</span>' +
          (own && cost && i && cst != null ? '<em>' + L2(cst) + ' / pas</em>' : '') + '<b>' + K.num(v) + '</b></div><i class="kq-tr"><s></s></i></li>').join('') + '</ol>'
          : none('Niciun lead în perioada asta.')) +
        '</article>';
    };
    const notes = [];
    if (own && d.cities && d.cities.unassignedSpend) notes.push(K.lei(d.cities.unassignedSpend) + ' cheltuiți pe reclame fără oraș în nume');
    if (d.cities && d.cities.noCity) notes.push(K.plural(d.cities.noCity, 'lead fără oraș', 'leaduri fără oraș'));
    return card('cities', 'kq-cities is-full', 'filter', 'Leadurile', own ? 'de la lead la pachet, cu cât a costat fiecare pas' : 'de la lead la pachet',
      '<div class="kq-city-g">' + rows.map(city).join('') + '</div>' + (notes.length ? '<p class="kq-note">' + esc(notes.join(' · ')) + ' (nu intră la niciun oraș)</p>' : ''));
  }

  function moneyHtml(d) {
    const m = d.money, p = pv(d);
    const cl = Object.keys(d.clinic || {});
    const meth = cl.reduce((a, c) => { const x = d.clinic[c].methods; a.cash += x.cash; a.card += x.card; a.transfer += x.transfer; a.other += x.other; return a; }, { cash: 0, card: 0, transfer: 0, other: 0 });
    const tot = meth.cash + meth.card + meth.transfer + meth.other;
    const seg = [['cash', 'Cash', meth.cash], ['card', 'Card', meth.card], ['transfer', 'Transfer', meth.transfer], ['other', 'Altfel', meth.other]].filter((x) => x[2] > 0);
    const byCity = (d.cities.rows || []).map((c) => ({ city: c.city, v: c.money.revenue, pv: p && p.cities && p.cities[c.city] ? p.cities[c.city].revenue : null }));
    const topC = Math.max(1, ...byCity.map((x) => x.v));
    return card('money', 'kq-money', 'wallet', 'Încasat', '',
      hero('money', m.revenue, 'lei', p ? dl(m.revenue, p.revenue, 'lei') : '', K.plural(m.payments, 'plată', 'plăți') + ' · bon mediu ' + L(m.ticket)) +
      (byCity.length > 1 ? '<div class="kq-bars">' + byCity.map((x, i) => '<div class="kq-bar-r" style="--i:' + i + ';--w:' + ratio(x.v, topC) + '%"><span>' + esc(x.city) + dl(x.v, x.pv, 'lei') + '</span><i class="kq-tr"><s></s></i><b>' + K.lei(x.v) + '</b></div>').join('') + '</div>' : '') +
      (tot ? '<div class="kq-split"><div class="kq-split-bar">' + seg.map((s, i) => '<i class="is-' + s[0] + '" style="--w:' + ratio(s[2], tot) + '%;--i:' + i + '"></i>').join('') + '</div>' +
        '<div class="kq-split-l">' + seg.map((s) => '<span><i class="is-' + s[0] + '"></i>' + s[1] + ' <b>' + K.lei(s[2]) + '</b></span>').join('') + '</div></div>' : ''));
  }

  // the packages: how many, their average value, the consultations that ended in one (a ring per clinic), what is left to collect
  function packagesHtml(d) {
    const pk = d.packages || {}, p = pv(d);
    const cl = Object.keys(d.clinic || {});
    const dues = cl.map((c) => Object.assign({ city: c }, d.clinic[c].dues)).filter((x) => x.rest > 0);
    const rest = dues.reduce((n, x) => n + x.rest, 0);
    return card('packages', 'kq-packages', 'gift', 'Pachete vândute', '',
      hero('packages', pk.count || 0, 'num', p ? dl(pk.count || 0, p.packages) : '', pk.count ? 'valoare medie ' + L(pk.avg) + (p ? ' ' + dl(pk.avg, p.packageAvg, 'lei') : '') + ' · în total ' + K.lei(pk.value) : 'niciun pachet în perioada asta') +
      '<div class="kq-rings">' + cl.map((c) => { const cs = d.clinic[c].consults; return '<div class="kq-rg">' + ring(cs.pct, tone3(cs.pct, 50, 30)) + '<div><b>' + tag(c) + P(cs.pct) + '</b><span>consultație → pachet</span><small>' + cs.withPackage + ' din ' + K.plural(cs.total, 'consultație', 'consultații') + ', în 7 zile</small></div></div>'; }).join('') + '</div>' +
      '<p class="kq-line' + (rest ? ' is-warn' : '') + '">' + icon('clock') + (rest ? '<span>De încasat din pachete: <b>' + K.lei(rest) + '</b> (' + dues.map((x) => short(x.city) + ' ' + K.plural(x.count, 'clientă', 'cliente')).join(', ') + ')</span>' : '<span>Nimic de încasat din pachete, acum.</span>') + '</p>');
  }

  // each cosmetician: lei per day she worked vs 1500 (the meters fill up)
  function teamHtml(d) {
    const T = (d.targets && d.targets.perDay) || 1500;
    const groups = Object.keys(d.clinic || {}).map((c) => ({ city: c, team: d.clinic[c].team || [] })).filter((g) => g.team.length);
    const all = groups.reduce((a, g) => a.concat(g.team), []), ok = all.filter((x) => x.ok).length;
    return card('team', 'kq-team', 'trophy', 'Cosmeticienele', '',
      groups.length ? hero('team', ok, 'num', '', '<span>din ' + all.length + '</span> fac peste ' + K.lei(T) + ' pe zi lucrată', ok === all.length ? 'is-good' : '') +
        groups.map((g) => '<div class="kq-grp"><h4>' + tag(g.city) + esc(g.city) + '</h4>' +
        '<ul class="kq-pp">' + g.team.map((x, i) => '<li style="--i:' + i + '" class="' + (x.ok ? 'is-ok' : 'is-low') + '">' + K.avatar(x.name, 30) + '<div class="kq-pp-m"><div class="kq-pp-t"><b>' + esc(x.name) + '</b><span>' + K.lei(x.perDay) + '<small> / zi</small></span></div>' +
          '<div class="kq-meter"><i style="--w:' + Math.min(100, (x.perDay / (T * 2)) * 100) + '%"></i><u style="--t:50%"></u></div>' +
          '<small>' + K.plural(x.days, 'zi lucrată', 'zile lucrate') + (x.payOnly ? ' (' + x.payOnly + ' fără pontaj, cu încasări)' : '') + ' · ' + K.lei(x.collected) + (x.ok ? '' : ' · mai trebuie ' + K.lei(x.gap) + ' / zi') + '</small></div></li>').join('') + '</ul></div>').join('')
        : none('Nicio încasare atribuită unei cosmeticiene în perioada asta.'));
  }

  // the calendar of the next 7 days vs the team's hours (the days fill up, left to right)
  function calendarHtml(d) {
    const tgt = (d.targets && d.targets.fill) || 150;
    const DOW = ['Du', 'Lu', 'Ma', 'Mi', 'Jo', 'Vi', 'Sâ'];
    const rows = Object.keys(d.clinic || {}).map((c) => {
      const f = d.clinic[c].fill;
      return '<div class="kq-cal"><div class="kq-cal-h"><h4>' + tag(c) + esc(c) + '</h4>' + big('cal-' + c, f.pct, 'pct', tone3(f.pct, tgt, 100)) + '<small>' + dec(f.freeHours, 1) + ' h libere din ' + dec(f.capHours, 1) + ' h</small></div>' +
        '<div class="kq-days">' + f.days.map((x, i) => {
          const dd = new Date(x.date + 'T12:00:00');
          const h = x.pct == null ? 0 : Math.min(100, (x.pct / 200) * 100);
          return '<div class="kq-day' + (x.capHours ? '' : ' is-off') + '" style="--i:' + i + '" title="' + esc(K.dateLong(x.date)) + ': ' + (x.capHours ? dec(x.bookedHours, 1) + ' h programate din ' + dec(x.capHours, 1) + ' h' : 'închis') + '">' +
            '<div class="kq-day-b"><i style="--h:' + h + '%" class="' + tone3(x.pct, tgt, 100) + '"></i><u style="--t:' + Math.min(100, tgt / 2) + '%"></u></div>' +
            '<b>' + (x.capHours ? P(x.pct) : '-') + '</b><small>' + DOW[dd.getDay()] + ' ' + dd.getDate() + '</small></div>';
        }).join('') + '</div>' + (f.schedule ? '' : '<p class="kq-note">Fără program echipă: capacitatea e după orele clinicii.</p>') + '</div>';
    });
    return card('calendar', 'kq-calendar', 'calendar', 'Calendarul, 7 zile', 'ținta: plin + 50% (' + tgt + '%), linia de pe zile', rows.join('') || none('Fără date de calendar.'), go('programari', 'Calendar'));
  }

  // the reception: how fast new leads are reached, the ones never reached, the messages waiting
  function receptionHtml(d) {
    const t = (d.messages && d.messages.team) || {};
    const cl = Object.keys(d.clinic || {});
    const sum = cl.reduce((a, c) => { const r = d.clinic[c].reception; a.total += r.total; a.w5 += r.within5; a.never += r.never; a.wait += d.clinic[c].waiting; return a; }, { total: 0, w5: 0, never: 0, wait: 0 });
    const all = pct(sum.w5, sum.total);
    const who = (d.contactBy || []).slice(0, 5);
    return card('reception', 'kq-reception', 'phone', 'Recepția', '',
      hero('rec', all, 'pct', '', 'din leadurile noi sunate în <b>5 minute</b> · ' + K.plural(sum.never, 'nesunat', 'nesunate'), tone3(all, 80, 50)) +
      '<div class="kq-recs">' + cl.map((c, i) => { const r = d.clinic[c].reception, w = d.clinic[c].waiting; return '<div class="kq-rec" style="--i:' + i + '">' + tag(c) +
        '<span><b class="' + tone3(r.pct, 80, 50) + '">' + P(r.pct) + '</b>în 5 min</span><span><b>' + P(r.inHoursPct) + '</b>în program</span><span><b class="' + (r.never ? 'is-bad' : '') + '">' + r.never + '</b>nesunate</span>' +
        '<button type="button" class="kq-wait' + (w ? ' is-on' : '') + '" data-go="mesaje"><i></i><b>' + w + '</b> mesaje așteaptă</button></div>'; }).join('') + '</div>' +
      (t.median != null || d.waitingSocial ? '<p class="kq-line">' + icon('chat') + '<span>' + [t.median != null ? 'Pe WhatsApp răspundem în <b>' + mins(t.median) + '</b>' + (t.in15 != null ? ', ' + P(t.in15) + ' sub 15 minute' : '') : '', d.waitingSocial ? '<b>' + d.waitingSocial + '</b> pe Instagram / Messenger așteaptă' : ''].filter(Boolean).join(' · ') + '</span></p>' : '') +
      (who.length ? '<div class="kq-who"><h4>Cine contactează primul</h4><ol>' + who.map((x) => '<li>' + K.avatar(x.name, 26) + '<b>' + esc(x.name) + '</b><span>' + K.plural(x.contacted, 'lead', 'leaduri') + ' · ' + mins(x.median) + ' · ' + P(x.in5) + ' sub 5 min</span></li>').join('') + '</ol></div>' : ''),
      go('mesaje', 'Mesaje'));
  }

  // every ad: Meta's numbers and what its leads became; the very good and very bad ones marked (the owner)
  function adsHtml(d) {
    if (d.adsState === 'none') return card('ads', 'kq-ads is-full', 'facebook', 'Reclamele', '', none('Cifrele reclamelor apar după ce lipești tokenul pentru reclame (Integrări → Facebook).'));
    if (d.adsState === 'error' || !d.ads) return card('ads', 'kq-ads is-full', 'facebook', 'Reclamele', '', '<p class="kq-none is-bad">' + icon('alert') + 'Meta: ' + esc(d.adsError || 'nu a răspuns') + '</p>');
    const a = d.ads.totals, rows = d.ads.rows, p = pv(d);
    const tile = (l, v, s, delta, cls, i) => '<div style="--i:' + i + '" class="' + (cls || '') + '"><span>' + l + '</span><b>' + v + (delta ? ' ' + delta : '') + '</b>' + (s ? '<small>' + s + '</small>' : '') + '</div>';
    const status = (s) => (s === 'ACTIVE' ? '<i class="kp-dot is-on" title="activă"></i>' : '<i class="kp-dot" title="oprită"></i>');
    const ago = d.adsAt ? Math.max(0, Math.round((Date.now() - d.adsAt) / 60e3)) : null;
    return card('ads', 'kq-ads is-full', 'facebook', 'Reclamele', ago != null ? 'de la Meta, ' + (ago < 1 ? 'acum' : 'acum ' + mins(ago)) + (d.adsStale ? ' (Meta nu răspunde acum)' : '') : '',
      hero('ads', a.spend, 'lei', p ? dl(a.spend, p.spend, 'lei') : '', 'cheltuiți · ' + L2(a.cpl) + ' un lead' + (p ? ' ' + dl(a.cpl, p.cpl, 'cost') : '') + ' · ' + (a.roas != null ? '<b class="' + (a.roas >= 1 ? 'is-good' : 'is-bad') + '">' + dec(a.roas, 2) + ' lei</b> la 1 leu' : 'încă nicio plată din ele')) +
      '<div class="kq-minis is-4 kq-flip">' +
        tile('O programare', L(a.perBooked), a.booked + ' programate', p ? dl(a.perBooked, p.perBooked, 'cost') : '', '', 0) +
        tile('O clientă venită', L(a.perCame), a.came + ' au venit', p ? dl(a.perCame, p.perCame, 'cost') : '', '', 1) +
        tile('O clientă care a plătit', L(a.cpa), a.clients + ' au plătit', p ? dl(a.cpa, p.cpa, 'cost') : '', '', 2) +
        tile('Click pe reclamă', P(a.ctr), K.num(a.clicks) + ' clickuri · ' + L2(a.cpm) + ' / 1000 afișări', '', '', 3) +
      '</div>' +
      (rows.length ? (() => {
        const head = rows.filter((x) => x.flag).concat(rows.filter((x) => !x.flag)).slice(0, Math.max(4, rows.filter((x) => x.flag).length));
        const rest = rows.filter((x) => !head.includes(x));
        const adCard = (x) => '<article class="k-card ad-camp kp-adc' + (x.flag ? ' is-' + x.flag : '') + (x.status === 'ACTIVE' ? '' : ' is-off') + '" data-kp-adrow="' + esc(x.id) + '">' +
          '<div class="ad-name"><span class="ad-thumb">' + (x.thumb ? '<img src="' + esc(x.thumb) + '" alt="" loading="lazy" referrerpolicy="no-referrer">' : icon('image')) + '</span>' +
            '<div class="ad-title"><b>' + status(x.status) + esc(x.name || 'Reclamă') + '</b><small>' + esc(x.campaign) +
            (x.flag === 'top' ? '<em class="kp-badge is-good">merge foarte bine</em>' : x.flag === 'bad' ? '<em class="kp-badge is-bad">merge rău</em>' : x.flag === 'watch' ? '<em class="kp-badge is-warn">de urmărit</em>' : '') + '</small></div></div>' +
          '<div class="ad-mkpis"><div><small>Leaduri</small><b>' + x.leads + (x.metaLeads !== x.leads ? ' <small>' + x.metaLeads + ' Meta</small>' : '') + '</b></div><div><small>Un lead</small><b>' + L2(x.cpl) + '</b></div><div><small>Cheltuit</small><b>' + K.lei(x.spend) + '</b></div></div>' +
          '<div class="kp-adc-more"><div data-l="Programate">' + x.booked + (x.leads ? ' <small>' + P(x.bookRate) + '</small>' : '') + '</div><div data-l="Au venit">' + x.came + '</div><div data-l="Încasat">' + (x.revenue ? K.lei(x.revenue) : '-') + '</div>' +
            '<div data-l="La 1 leu" class="' + (x.roas != null ? (x.roas >= 1 ? 'is-good' : 'is-bad') : '') + '">' + (x.roas != null ? dec(x.roas, 2) : '-') + '</div><div data-l="Click">' + P(x.ctr) + '</div><div data-l="O programare">' + L(x.perBooked) + '</div></div>' +
          (x.flag ? '<div class="kp-why">' + esc(x.why.join(' · ')) + '</div>' : '') + '</article>';
        return '<div class="kp-adc-list kq-adc-list">' + head.map(adCard).join('') + '</div>' +
          (rest.length ? '<details class="kq-more"><summary>Încă ' + K.plural(rest.length, 'reclamă', 'reclame') + '</summary><div class="kp-adc-list kq-adc-list">' + rest.map(adCard).join('') + '</div></details>' : '');
      })() : none('Nicio reclamă n-a cheltuit în perioada asta.')),
      go('reclame', 'Reclame'));
  }

  function trendHtml(d) {
    if (!d.trend || d.trend.length < 2) return '';
    return card('trend', 'kq-trend is-full', 'trend', 'Zi cu zi', '', '<div data-kp-chart data-sig="' + d.trend.map((x) => [x.leads, x.made, Math.round(x.revenue || 0), Math.round(x.spend || 0)].join('/')).join(',') + '"></div>',
      '<div class="k-seg"><button type="button" data-kp-trend="money" class="' + (S.trend === 'money' ? 'is-on' : '') + '">Bani</button><button type="button" data-kp-trend="people" class="' + (S.trend === 'people' ? 'is-on' : '') + '">Oameni</button></div>');
  }
  function drawTrend(d) {
    const el = S.body && S.body.querySelector('[data-kp-chart]');
    if (!el) return;
    const t = d.trend, labels = t.map((x) => K.dateShort(x.day));
    const money = S.trend === 'money';
    const series = money
      ? (d.scope ? [] : [{ name: 'Reclame', values: t.map((x) => x.spend), color: 'var(--bad)', kind: 'line', dashed: true }]).concat([{ name: 'Încasat', values: t.map((x) => x.revenue), color: 'var(--accent)' }])
      : [{ name: 'Leaduri', values: t.map((x) => x.leads), color: 'var(--accent)', kind: 'bar' }, { name: 'Programări făcute', values: t.map((x) => x.made), color: 'var(--info)', kind: 'line' }, { name: 'Au venit', values: t.map((x) => x.came), color: 'var(--good)', kind: 'line' }];
    el.innerHTML = ''; el._kro = null;
    K.chart(el, { labels, height: 220, series, format: money ? K.lei : K.num, axis: (v) => (money && v >= 1000 ? dec(v / 1000, 1) + 'k' : Math.round(v)),
      tip: (i) => '<b>' + esc(K.dateLong(t[i].day)) + '</b>' + series.map((s) => '<span><i style="background:' + s.color + '"></i>' + s.name + ': ' + (money ? K.lei(s.values[i]) : K.num(s.values[i])) + '</span>').join('') });
  }

  // each offer: leads → booked → came and the money, with its share of the spend (the owner)
  function offersHtml(d) {
    const rows = d.offers.rows.filter((x) => x.group === 'ads');
    if (!rows.length) return '';
    const top = Math.max(1, ...rows.map((x) => x.revenue));
    return card('offers', 'kq-offers is-full', 'tag', 'Ofertele', 'banii urmează leadurile perioadei',
      '<div class="kp-of">' + rows.map((x, i) => '<div class="kp-of-r' + (i === 0 && x.revenue > 0 ? ' is-top' : '') + '">' +
        '<div class="kp-of-n"><b>' + esc(x.title) + '</b><span class="kp-of-m"><i style="--w:' + ratio(x.revenue, top) + '%"></i></span></div>' +
        '<div class="kp-of-f" title="leaduri → programate → au venit"><span>' + x.leads + '</span>' + icon('right') + '<span>' + x.booked + '</span>' + icon('right') + '<span>' + x.came + '</span><small>' + P(x.bookRate) + ' se programează</small></div>' +
        '<div class="kp-of-v"><b>' + K.lei(x.revenue) + '</b><small>' + (x.spend ? K.lei(x.spend) + ' reclame' + (x.cpl != null ? ' · ' + L2(x.cpl) + ' / lead' : '') + (x.roas != null ? ' · ' + dec(x.roas, 2) + ' la 1 leu' : '') : '') + '</small></div></div>').join('') + '</div>',
      go('oferte', 'Oferte'));
  }

  // how each number is counted (no guessing: what it can't count, it doesn't show)
  function howHtml(d) {
    const items = [
      ['Lead', 'un formular sau un contact nou de la 16 oct, 22:05 încoace; din reclame dacă a venit prin formularul unei reclame, altfel organic.'],
      ['Contactat', 'primul apel, mesaj sau programare notat de cineva din echipă (nu mesajele automate).'],
      ['Sunate în 5 minute', 'leadurile noi din reclame și site pe care cineva le-a sunat, le-a scris sau le-a programat în 5 minute; „în program”: doar cele venite cât clinica e deschisă.'],
      ['Au venit', 'programarea e finalizată sau plătită, sau clienta a plătit ceva în ziua ei. Din programările cu ziua trecută; una anulată dinainte nu intră, una anulată la ora ei sau după contează ca nevenită.'],
      ['Pachet', 'o plată cu upsell (valoarea pachetului). Nu există o legătură directă consultație → pachet: „Consultație → pachet” numără consultațiile urmate în 7 zile de o plată cu pachet a aceleiași cliente.'],
      ['Lei pe zi lucrată', 'încasările atribuite cosmeticienei („Cine a făcut tratamentul”) împărțite la zilele lucrate: zilele pontate plus zilele cu încasări fără pontaj (o zi uitată la pontaj nu umflă media).'],
      ['Orașul', 'fiecare plată, programare și lead are orașul scris la fel (o plată fără oraș îl ia de la programarea ei, apoi de la cosmeticiană), la admin și la manager.'],
      ['Calendarul', 'orele programate (fără anulări) față de orele cosmeticienelor din Program echipă; ținta e plin + 50%, pentru că o parte din cliente nu vin.'],
      ['De încasat din pachete', 'ce mai au de plătit acum clientele cu pachete plătite în tranșe.'],
    ].concat(owner(d) ? [['Costul unui pas', 'cheltuiala reclamelor orașului (după numele campaniei: TM / AR) împărțită la leadurile din reclame ajunse la acel pas. „La 1 leu”: banii plătiți de leadurile din reclame la un leu cheltuit.']] : []);
    return '<details class="kq-how" data-part="how"><summary>' + icon('info') + 'Cum se calculează</summary><dl>' + items.map(([t, x]) => '<dt>' + esc(t) + '</dt><dd>' + esc(x) + '</dd>').join('') + '</dl></details>';
  }

  // ------------------------------------------------------------------ paint
  function paint() {
    if (!S.el) return;
    syncBar();
    const d = S.d;
    if (!d) {
      S.body.innerHTML = S.err ? K.empty('alert', 'Nu am putut încărca cifrele', esc(S.err), '<button type="button" class="k-btn is-primary" data-kp-reload>Reîncearcă</button>')
        : '<div class="k-skel" style="height:220px;border-radius:24px"></div><div class="k-skel" style="height:320px;margin-top:1rem;border-radius:24px"></div>';
      return;
    }
    if (S.deck && window.C360Deck) window.C360Deck.render(S.deck, d, LABEL[d.period] || '');
    const own = owner(d);
    // the owner: where the leads come from and what they cost first; the manager: her targets first, then the team's work
    const list = own
      ? [alertsHtml(d), citiesHtml(d), moneyHtml(d), packagesHtml(d), teamHtml(d), calendarHtml(d), receptionHtml(d), adsHtml(d), trendHtml(d), offersHtml(d), howHtml(d)]
      : [managerHtml(d), teamHtml(d), calendarHtml(d), receptionHtml(d), alertsHtml(d), citiesHtml(d), moneyHtml(d), packagesHtml(d), trendHtml(d), howHtml(d)];
    const parts = list.filter(Boolean).map((html) => ({ key: /data-part="([^"]+)"/.exec(html)[1], html }));
    const open = S.body.querySelector('.kq-how[open]');
    K.patch(S.body, parts);
    if (open) { const h = S.body.querySelector('.kq-how'); if (h) h.open = true; }
    const tr = S.body.querySelector('[data-kp-chart]');
    if (tr && !tr.children.length) drawTrend(d);
    animate(S.body);
    tick();
  }

  // ------------------------------------------------------------------ the entrances: each card its own (portal-kpi.css), once it reaches the
  // screen; a card redrawn for a new period plays again, short. The big numbers roll up from what they showed before.
  const calm = () => document.documentElement.classList.contains('c360-reduce') || (window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches);
  const lastN = new Map();
  let io = null;
  function roll(el) {
    const to = Number(el.dataset.kqN) || 0, f = el.dataset.kqF, k = el.dataset.kqK, from = lastN.has(k) ? lastN.get(k) : 0;
    lastN.set(k, to);
    if (calm() || from === to) { el.textContent = fmtN(to, f); return; }
    const t0 = performance.now(), ms = 750;
    (function step(t) {
      const q = Math.min(1, (t - t0) / ms), e = 1 - Math.pow(1 - q, 3), v = from + (to - from) * e;
      el.textContent = fmtN(f === 'pct' ? Math.round(v) : v, f);
      if (q < 1) requestAnimationFrame(step); else el.textContent = fmtN(to, f);
    })(t0);
  }
  function reveal(c) { c.classList.add('kq-in'); c.querySelectorAll('[data-kq-n]').forEach(roll); }
  function animate(root) {
    const cards = root.querySelectorAll('.kq-card:not(.kq-in), .kq-tc:not(.kq-in), .kq-sig:not(.kq-in)');
    if (calm() || !('IntersectionObserver' in window)) { cards.forEach((c) => { c.classList.add('kq-in'); c.querySelectorAll('[data-kq-n]').forEach(roll); }); return; }
    if (!io) io = new IntersectionObserver((es) => es.forEach((e) => { if (e.isIntersecting) { io.unobserve(e.target); reveal(e.target); } }), { threshold: 0.12 });
    cards.forEach((c) => {
      if (c._kq) return; c._kq = 1;
      // the number it starts from (the previous period's, or 0), set now so the old one never flashes
      c.querySelectorAll('[data-kq-n]').forEach((n) => { const k = n.dataset.kqK; n.textContent = fmtN(lastN.has(k) ? lastN.get(k) : 0, n.dataset.kqF); });
      io.observe(c);
    });
  }
  function tick() {
    const el = S.el && S.el.querySelector('[data-kp-ago]');
    if (el && S.at) { const s = Math.round((Date.now() - S.at) / 1000); el.textContent = 'actualizat ' + (s < 5 ? 'acum' : s < 60 ? 'acum ' + s + ' s' : 'acum ' + Math.round(s / 60) + ' min') + ' · se actualizează singur'; }
  }

  // ------------------------------------------------------------------ events
  function onClick(e) {
    const p = e.target.closest('[data-kp-period]');
    if (p) {
      const k = p.dataset.kpPeriod;
      if (k === 'custom') {
        // the interval: the dates open under the chips; an interval already picked shows again at once
        S.open = true;
        if (S.since && S.until) { S.period = 'custom'; syncBar(); load(); } else { syncBar(); const i = S.bar.querySelector('[data-kp-range] input'); if (i) i.focus(); }
        return;
      }
      S.period = k; S.open = false;
      syncBar(); scrollChip();
      load();
      return;
    }
    const tr = e.target.closest('[data-kp-trend]');
    if (tr) { S.trend = tr.dataset.kpTrend; S.el.querySelectorAll('[data-kp-trend]').forEach((b) => b.classList.toggle('is-on', b === tr)); if (S.d) drawTrend(S.d); return; }
    if (e.target.closest('[data-kp-reload]')) { load(); return; }
    const mg = e.target.closest('[data-mg]');
    if (mg) { const M = window.C360Manager; if (M && M[mg.dataset.mg]) M[mg.dataset.mg](); return; }
    const g = e.target.closest('[data-go]');
    if (g && !S.el.closest('#panel-panou')) { e.preventDefault(); K.go(g.dataset.go); return; }
    const ad = e.target.closest('[data-kp-ad]');
    if (ad) { const row = S.el.querySelector('[data-kp-adrow="' + CSS.escape(ad.dataset.kpAd) + '"]'); if (row) { row.scrollIntoView({ behavior: 'smooth', block: 'center' }); row.classList.add('is-flash'); setTimeout(() => row.classList.remove('is-flash'), 1600); } }
  }
  function onSubmit(e) {
    const f = e.target.closest('[data-kp-range]');
    if (!f) return;
    e.preventDefault();
    if (!f.since.value || !f.until.value) return;
    const s = [f.since.value, f.until.value].sort();
    S.since = s[0]; S.until = s[1]; S.period = 'custom'; S.open = true;
    f.since.value = s[0]; f.until.value = s[1];
    syncBar();
    load();
  }

  // ------------------------------------------------------------------ Panou → Azi: the day of each clinic (the control screen, morning and evening)
  function todayHtml(d) {
    const n = d.now; if (!n) return '';
    const own = owner(d), cl = Object.keys(n.cities);
    const chip = (v, label, tone, goTo) => (v ? '<button type="button" class="kq-st is-' + tone + '"' + (goTo ? ' data-go="' + goTo + '"' : '') + '><b>' + v + '</b>' + label + '</button>' : '');
    const col = (c) => {
      const x = n.cities[c], a = x.appts, m = x.methods, f = d.clinic && d.clinic[c] && d.clinic[c].fill;
      const meth = [['cash', 'cash'], ['card', 'card'], ['transfer', 'transfer']].filter((k) => m[k[0]] > 0).map((k) => K.lei(m[k[0]]) + ' ' + k[1]).join(' · ');
      const ld = x.leads;
      return '<article class="kq-tc">' +
        '<header><h4><span class="kq-tag">' + short(c) + '</span>' + esc(c) + '</h4><div class="kq-tc-m"><small>Încasat azi</small><b>' + K.lei(x.collected) + '</b><span>' + (x.payments ? K.plural(x.payments, 'plată', 'plăți') + (meth ? ' · ' + meth : '') : 'nicio plată încă') + '</span></div></header>' +
        '<div class="kq-tc-r"><span class="kq-tc-l">' + icon('calendar') + K.plural(a.total, 'programare', 'programări') + '</span><div class="kq-sts">' +
          (a.total ? chip(a.done, ' finalizate', 'good', 'programari') + chip(a.confirmed, ' confirmate', 'info', 'programari') + chip(a.unconfirmed, ' neconfirmate', 'warn', 'programari') + chip(a.passed, ' trecute, nefinalizate', 'bad', 'programari') + chip(a.cancelled, ' anulate', 'muted', 'programari')
            : '<span class="kq-muted">nicio programare azi</span>') + '</div></div>' +
        '<div class="kq-tc-r"><span class="kq-tc-l">' + icon('userPlus') + K.plural(ld.total, 'lead nou', 'leaduri noi') + '</span><div class="kq-sts">' +
          (ld.total ? chip(ld.within5, ' sunate în 5 min', 'good', 'pipeline') + chip(ld.total - ld.within5 - ld.never, ' sunate mai târziu', 'warn', 'pipeline') +
            (ld.never ? '<button type="button" class="kq-st is-bad" data-go="pipeline" data-then="pipeline:queue"><b>' + ld.never + '</b> nesunate</button>' : '')
            : '<span class="kq-muted">niciun lead încă</span>') + '</div></div>' +
        '<div class="kq-tc-r"><span class="kq-tc-l">' + icon('chat') + 'Mesaje</span><div class="kq-sts">' + (x.waiting ? '<button type="button" class="kq-st is-bad" data-go="mesaje"><b>' + x.waiting + '</b> așteaptă răspuns</button>' : '<span class="kq-muted">niciunul nu așteaptă</span>') + '</div></div>' +
        (own && x.ads ? '<div class="kq-tc-r"><span class="kq-tc-l">' + icon('facebook') + 'Reclame azi</span><div class="kq-sts"><span class="kq-st is-plain"><b>' + K.lei(x.ads.spend) + '</b> cheltuiți</span>' +
          '<span class="kq-st is-plain"><b>' + x.ads.metaLeads + '</b> leaduri Meta</span>' + (x.ads.cpl != null ? '<span class="kq-st is-plain"><b>' + L2(x.ads.cpl) + '</b> / lead</span>' : '') + '</div></div>' : '') +
        (f ? '<button type="button" class="kq-tc-cal" data-go="programari"><span>' + icon('clock') + 'Următoarele 7 zile</span><span class="kq-meter"><i class="' + (f.pct == null ? '' : f.pct >= f.targetPct ? 'is-good' : f.pct >= 100 ? 'is-warn' : 'is-bad') + '" style="--w:' + Math.min(100, ((f.pct || 0) / 200) * 100) + '%"></i><u style="--t:' + Math.min(100, f.targetPct / 2) + '%"></u></span>' +
          '<b>' + P(f.pct) + '</b><small>ținta ' + f.targetPct + '% · ' + dec(f.freeHours, 1) + ' h libere</small></button>' : '') +
        '</article>';
    };
    const sg = d.signals, items = [];
    if (sg) {
      const LV = { mult_putine: 'bad', putin_putine: 'warn', potrivit: 'good', putin_multe: 'warn', mult_multe: 'bad' };
      const hm = (iso) => { try { return new Intl.DateTimeFormat('ro-RO', { timeZone: 'Europe/Bucharest', weekday: 'short', hour: '2-digit', minute: '2-digit' }).format(new Date(iso)); } catch (e) { return ''; } };
      sg.feedback.forEach((x) => items.push({ tone: LV[x.level] || 'info', ic: 'bell', go: 'manager/rapoarte', t: 'Leaduri ' + short(x.city) + ': ' + x.label, s: (x.by ? x.by + ' · ' : '') + hm(x.at) + (x.details ? ' · „' + x.details + '”' : '') }));
      sg.unclosed.forEach((x) => items.push({ tone: 'warn', ic: 'cash', go: 'manager/casa', t: 'Ziua de ' + K.dateShort(x.date) + ' neînchisă la ' + x.city, s: 'nicio închidere de casă trimisă' }));
      sg.closes.filter((x) => x.off || x.fate === 'depus').forEach((x) => items.push({ tone: x.off ? 'bad' : 'info', ic: 'cash', go: 'manager/casa', t: 'Casa ' + short(x.city) + ', ' + K.dateShort(x.date) + (x.off ? ': diferență' : ': depus în cont'),
        s: [x.cashDiff ? 'cash ' + (x.cashDiff > 0 ? '+' : '') + K.lei(x.cashDiff, 2) : '', x.cardDiff ? 'card ' + (x.cardDiff > 0 ? '+' : '') + K.lei(x.cardDiff, 2) : '', x.fate === 'depus' ? 'depus ' + K.lei(x.deposited) : ''].filter(Boolean).join(' · ') + (x.by ? ' · ' + x.by : '') }));
      if (sg.report) items.push({ tone: sg.report.problems ? 'warn' : 'good', ic: 'file', go: 'manager/rapoarte', t: 'Raportul săptămânii ' + K.dateShort(sg.report.week) + ' → ' + K.dateShort(sg.report.to) + ' trimis', s: (sg.report.by ? sg.report.by + ' · ' : '') + hm(sg.report.at) + (sg.report.problems ? ' · are probleme notate' : '') });
    }
    const sig = sg && (sg.manager || items.length) ? '<div class="kq-sig"><h4>' + icon('users') + 'De la manager</h4>' + (items.length ? '<div class="kq-sig-l">' + items.map((x) => '<button type="button" class="kq-sig-i is-' + x.tone + '" data-go="' + x.go + '"><span class="kq-sig-ic">' + icon(x.ic) + '</span><span><b>' + esc(x.t) + '</b><small>' + esc(x.s) + '</small></span>' + icon('arrow') + '</button>').join('') + '</div>'
      : '<p class="kq-muted">Nimic nou în ultimele zile: niciun semnal despre leaduri, casa închisă fără diferențe.</p>') + '</div>' : '';
    return '<div class="kq-head"><h3>' + icon('sun') + 'Azi pe clinici</h3><span class="kq-hint">' + esc(K.dateLong(n.date)) + '</span>' + (d.waitingSocial ? '<button type="button" class="kq-go" data-go="mesaje">' + d.waitingSocial + ' pe Instagram / Messenger' + icon('arrow') + '</button>' : '') + '</div>' +
      '<div class="kq-tc-g">' + cl.map(col).join('') + '</div>' + sig;
  }
  const TD = { el: null, key: '' };
  function today(el) {
    if (!el) return;
    TD.el = el;
    const draw = (d) => { if (!TD.el || !TD.el.isConnected) return; const h = todayHtml(d); if (h !== TD.key || !TD.el.childElementCount) { TD.key = h; TD.el.innerHTML = h; animate(TD.el); } TD.el.hidden = !h; };
    const c = cache.get('period=today');
    if (c) draw(c.d); else if (!el.childElementCount) el.innerHTML = '<div class="k-skel" style="height:260px;border-radius:24px"></div>';
    fetchKpi('period=today', 60e3).then(draw, () => { if (!cache.has('period=today')) el.hidden = true; });
  }

  let timer = 0, liveAt = 0;
  window.C360Kpi = {
    // into the Panou's box (the owner or the manager switched to KPI)
    mount(el) {
      if (S.el !== el) {
        S.el = el;
        el.classList.add('kq');
        el.innerHTML = '<div class="kq-bar" data-kq-bar>' + barHtml() + '</div><section class="sx-deck kq-deck" data-kq-deck aria-label="KPI"></section><div class="kq-body" data-kq-body></div><p class="kq-foot">' + icon('refresh') + '<span data-kp-ago></span></p>';
        S.bar = el.querySelector('[data-kq-bar]'); S.deck = el.querySelector('[data-kq-deck]'); S.body = el.querySelector('[data-kq-body]');
        el.addEventListener('click', onClick);
        el.addEventListener('submit', onSubmit);
        // the bar sits under the portal's top bar
        const h = document.querySelector('header.topbar');
        if (h) el.style.setProperty('--kq-top', Math.round(h.getBoundingClientRect().height) + 'px');
        paint();
        requestAnimationFrame(scrollChip);
      }
      const picking = () => !!(S.el && S.el.querySelector('[data-kp-range] input:focus'));
      if (!S.d || (Date.now() - S.at > 20e3 && !picking())) load(!!S.d); else paint();
      clearInterval(timer);
      timer = setInterval(() => {
        if (!S.el || !S.el.isConnected || !K.isActive('panou')) { clearInterval(timer); return; }
        if (!document.hidden && !picking()) { const c = cache.get(curQ()); if (c) c.at = 0; load(true); }
      }, 60e3);
    },
    active() { return !!(S.el && S.el.isConnected); },
    // the same answers for the deck, Azi, the stage and Nuki (one request per period, kept 30 s by default)
    get: fetchKpi,
    peek(q) { const c = cache.get(q); return c ? c.d : null; },
    today,
  };
  K.everySecond(tick);
  // a change anywhere (a lead, a booking, a payment): the numbers follow, at most every 15 s; the other periods are read
  // again when opened
  K.on('remote', () => {
    if (document.hidden || Date.now() - liveAt < 15e3) return;
    const kpiOn = S.el && S.el.isConnected && K.isActive('panou'), azi = TD.el && TD.el.isConnected && K.isActive('panou');
    if (!kpiOn && !azi) return;
    liveAt = Date.now();
    setTimeout(() => {
      [...cache.keys()].forEach((k) => { const c = cache.get(k); if (c) c.at = 0; });
      if (kpiOn) load(true);
      if (azi) today(TD.el);
    }, 1500);
  });
})();
