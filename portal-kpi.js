// Centrul360 portal - Panou → KPI (the owner, and the manager for her clinics without the ads and their costs) and the
// „Azi pe clinici” block of Panou → Azi. Everything from /api/kpi. From 16.10.2026, 22:05 on (before: HighLevel).
//
// The page, top to bottom (the owner, 15 and 16.11: „să aibă maxim sens”, „foarte clean, fără lucruri useless”):
//   the period bar     one slim sticky line: Azi, 7 zile, Luna asta, Luna trecută; „Altă perioadă” opens Ieri, Săptămâna
//                      asta / trecută, 30 / 90 de zile, Anul acesta and the interval; the range small beside it
//   the deck           the animated numbers of the period (portal-summit-kpi.js): collected, bookings, show rate, clients
//   to do              at most 3 problems to act on (leads not called, clients not coming, messages unanswered)
//   the owner          leads per city (cost per lead, how far they went), the ads, money per clinic and method, packages,
//                      cosmeticians' lei per day vs 1500, the calendar of 7 days, reception, day by day, the offers
//   the manager        her targets per clinic and her three actions first, then the team's work (no ads, no costs)
// A card without data isn't drawn; how a number is counted is behind the ⓘ of its card; ↑ / ↓ only with a comparison.
// Fast: every period's answer is kept (switching back is instant, it is read again behind the page), the next ones are
// read ahead while the page is idle, the numbers on the page stay until the new ones are there (no blank, no flash).
(function () {
  'use strict';
  const K = window.K;
  const { esc, icon } = K;
  const S = { period: 'today', since: '', until: '', d: null, el: null, bar: null, deck: null, body: null, at: 0, err: '', want: '', trend: 'money', open: false, dq: '' };
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
  const short = (c) => (c === 'Arad' ? 'AR' : 'TM');
  const cityOf = (s) => (/arad/i.test(String(s || '')) ? 'Arad' : /timi/i.test(String(s || '')) ? 'Timișoara' : '');
  const owner = (d) => !(d && d.scope);
  // ↑ / ↓ against the previous period: kind 'cost' (lower is better), 'pt' (a rate: the difference in points)
  function dl(cur, prev, kind) {
    if (cur == null || prev == null || !Number.isFinite(Number(cur)) || !Number.isFinite(Number(prev))) return '';
    if (kind === 'pt' || kind === 'ptbad') {
      const p = Math.round(Number(cur) - Number(prev));
      return p ? '<span class="kq-d ' + ((p > 0) === (kind === 'pt') ? 'is-good' : 'is-bad') + '" title="înainte ' + P(prev) + '">' + (p > 0 ? '↑ ' : '↓ ') + Math.abs(p) + ' pt</span>' : '<span class="kq-d is-flat" title="la fel ca înainte">=</span>';
    }
    if (!Number(prev)) return '';
    const p = Math.round(((cur - prev) / Math.abs(prev)) * 100);
    if (!p) return '<span class="kq-d is-flat" title="la fel ca înainte">=</span>';
    const good = kind === 'cost' ? p < 0 : p > 0;
    return '<span class="kq-d ' + (good ? 'is-good' : 'is-bad') + '" title="înainte ' + esc(kind === 'lei' || kind === 'cost' ? K.lei(prev) : K.num(prev)) + '">' + (p > 0 ? '↑ ' : '↓ ') + Math.abs(p) + '%</span>';
  }
  const pv = (d) => (d && d.prev && d.prev.summary) || null;
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

  // ------------------------------------------------------------------ the period bar: one slim line (the owner, 16.11: „cu o tentă foarte clean”)
  // the four used most in a segmented control, „Altă perioadă” opens the rest (and the interval), the range small beside it
  const MAIN = [['today', 'Azi'], ['7d', '7 zile'], ['30d', '30 zile'], ['month', 'Luna asta'], ['lastmonth', 'Luna trecută']];
  const MAIN_S = { lastmonth: 'Luna trec.' }; // on a phone: the five fit on one line
  const MORE = [['yesterday', 'Ieri'], ['week', 'Săptămâna asta'], ['lastweek', 'Săptămâna trecută'], ['90d', 'Ultimele 90 de zile'], ['year', 'Anul acesta']];
  const SHORT = { yesterday: 'Ieri', week: 'Săpt. asta', lastweek: 'Săpt. trecută', '30d': '30 zile', '90d': '90 zile', year: 'Anul acesta' };
  const span = (r) => { if (!r) return ''; const a = K.dateShort(r.since), b = K.dateShort(r.until); if (r.since === r.until) return a; return r.since.slice(0, 7) === r.until.slice(0, 7) ? a.split(' ')[0] + '-' + b : a + '-' + b; };
  function barHtml() {
    return '<div class="kq-bar-in"><div class="kq-seg" role="tablist" aria-label="Perioada">' + MAIN.map(([k, l]) => '<button type="button" role="tab" data-kp-period="' + k + '"><span class="l">' + esc(l) + '</span>' + (MAIN_S[k] ? '<span class="s">' + esc(MAIN_S[k]) + '</span>' : '') + '</button>').join('') + '</div>' +
      '<button type="button" class="kq-other" data-kq-other aria-haspopup="true" aria-expanded="false" aria-label="Altă perioadă">' + icon('calendar') + '<span data-kq-other-l>Altă perioadă</span></button>' +
      '<span class="kq-span" data-kq-range></span><i class="kq-load" aria-hidden="true"></i>' +
      '<div class="kq-pop" data-kq-pop hidden><div class="kq-pop-g">' + MORE.map(([k, l]) => '<button type="button" data-kp-period="' + k + '">' + esc(l) + '</button>').join('') + '</div>' +
        '<form class="kq-range" data-kp-range><label><span>De la</span><input type="date" name="since" min="2026-10-16" required></label><label><span>Până la</span><input type="date" name="until" min="2026-10-16" required></label>' +
        '<button type="submit" class="k-btn is-sm is-accent">Arată</button></form></div></div>';
  }
  function syncBar() {
    if (!S.bar) return;
    const inMain = MAIN.some((x) => x[0] === S.period);
    S.bar.querySelectorAll('[data-kp-period]').forEach((b) => { const on = b.dataset.kpPeriod === S.period; b.classList.toggle('is-on', on); b.setAttribute('aria-selected', on ? 'true' : 'false'); });
    const o = S.bar.querySelector('[data-kq-other]');
    o.classList.toggle('is-on', !inMain);
    const d = S.d, r = d && d.range;
    S.bar.querySelector('[data-kq-other-l]').textContent = inMain ? 'Altă perioadă' : S.period === 'custom' ? (r && S.dq === curQ() ? span(r) : 'Interval') : SHORT[S.period] || 'Altă perioadă';
    const f = S.bar.querySelector('[data-kp-range]');
    const today = (d && d.now && d.now.date) || K.today();
    f.since.max = today; f.until.max = today;
    if (!f.since.value) f.since.value = S.since || today;
    if (!f.until.value) f.until.value = S.until || today;
    const el = S.bar.querySelector('[data-kq-range]');
    el.textContent = r && !(S.period === 'custom' && !inMain) ? span(r) : '';
    el.title = d && d.prev ? (d.prev.cut ? 'comparat cu ieri, la aceeași oră' : 'comparat cu ' + span(d.prev.range)) : '';
  }
  function pop(open) {
    const p = S.bar && S.bar.querySelector('[data-kq-pop]'); if (!p) return;
    S.open = open == null ? p.hidden : !!open;
    p.hidden = !S.open;
    S.bar.querySelector('[data-kq-other]').setAttribute('aria-expanded', S.open ? 'true' : 'false');
  }
  document.addEventListener('click', (e) => { if (S.open && S.bar && !S.bar.contains(e.target)) pop(false); });
  document.addEventListener('keydown', (e) => { if (S.open && e.key === 'Escape') pop(false); });

  // ------------------------------------------------------------------ the pieces: one idea per card, the big number first, one short line;
  // a card without data is not drawn; how a number is counted sits behind the small ⓘ of its card
  const big = (k, v, fmt, cls) => '<b class="kq-n' + (cls ? ' ' + cls : '') + '" data-kq-n="' + (Number(v) || 0) + '" data-kq-f="' + fmt + '" data-kq-k="' + k + '">' + esc(fmtN(v, fmt)) + '</b>';
  function fmtN(v, f) { return v == null ? '-' : f === 'lei' ? K.lei(v) : f === 'pct' ? P(v) : K.num(v); }
  const hero = (k, v, fmt, delta, line, cls) => '<div class="kq-hero">' + big(k, v, fmt, cls) + (delta || '') + (line ? '<p>' + line + '</p>' : '') + '</div>';
  const tag = (c) => '<span class="kq-tag">' + short(c) + '</span>';
  const bad = (cond) => (cond ? ' is-bad' : '');
  // the card: its title, a small ⓘ (how it is counted, opens under the title), its link
  const sec = (key, cls, title, info, body, extra) => '<section class="k-card kq-card ' + cls + '" data-part="' + key + '"><div class="kq-head"><h3>' + esc(title) + '</h3>' +
    (info ? '<button type="button" class="kq-i" data-kq-i aria-label="Cum se calculează" title="Cum se calculează">' + icon('info') + '</button>' : '') + (extra || '') + '</div>' +
    (info ? '<p class="kq-info" hidden>' + esc(info) + '</p>' : '') + body + '</section>';
  function ring(p) {
    const C = 2 * Math.PI * 15, v = Math.max(0, Math.min(100, p || 0)) / 100;
    return '<svg class="kq-ring" viewBox="0 0 36 36" aria-hidden="true"><circle cx="18" cy="18" r="15" class="tr"/><circle cx="18" cy="18" r="15" class="fl" style="--c:' + C.toFixed(1) + ';--o:' + (C * (1 - v)).toFixed(1) + '" stroke-dasharray="' + C.toFixed(1) + '" transform="rotate(-90 18 18)"/></svg>';
  }

  // what needs attention, at the top (only real problems): for the owner also the leads of a city falling or getting dearer,
  // cosmeticians under 1.500 lei a day, the upsell or the show-up falling; then the portal's own (leads not called…); max 4
  function alertsHtml(d) {
    const p = pv(d), own = owner(d), list = [];
    if (own && p) {
      (d.cities.rows || []).forEach((c) => {
        const pc = p.cities && p.cities[c.city]; if (!pc) return;
        if (pc.leads >= 5 && c.funnel.leads <= pc.leads * 0.7) list.push({ tone: 'bad', go: 'reclame', t: 'Leaduri ' + short(c.city) + ': ' + c.funnel.leads, s: 'cu ' + Math.round((1 - c.funnel.leads / pc.leads) * 100) + '% mai puține decât înainte (' + pc.leads + ')' });
        if (c.cost && c.cost.lead && pc.cpl && c.cost.lead >= pc.cpl * 1.3) list.push({ tone: 'warn', go: 'reclame', t: 'Un lead ' + short(c.city) + ': ' + L2(c.cost.lead), s: 'cu ' + Math.round((c.cost.lead / pc.cpl - 1) * 100) + '% mai scump decât înainte (' + L2(pc.cpl) + ')' });
      });
    }
    const under = Object.keys(d.clinic || {}).reduce((a, c) => a.concat((d.clinic[c].team || []).filter((x) => !x.ok)), []);
    if (under.length) list.push({ tone: 'warn', to: 'team', t: K.plural(under.length, 'cosmeticiană', 'cosmeticiene') + ' sub ' + K.lei((d.targets && d.targets.perDay) || 1500) + ' pe zi', s: under.map((x) => String(x.name).split(' ')[0] + ' ' + K.lei(x.perDay)).join(', ') });
    if (p && d.summary.upsellRate != null && p.upsellRate != null && d.summary.upsellRate <= p.upsellRate - 10) list.push({ tone: 'warn', to: 'rates', t: 'Upsellul a scăzut: ' + P(d.summary.upsellRate), s: 'înainte ' + P(p.upsellRate) + ' din vizite' });
    if (p && d.summary.showRate != null && p.showRate != null && d.summary.showRate <= p.showRate - 10) list.push({ tone: 'warn', to: 'rates', t: 'Vin mai puține: ' + P(d.summary.showRate), s: 'înainte ' + P(p.showRate) });
    // calling leads and answering messages are the manager's job: on the owner's page these stay in Pipeline and Mesaje (16.11)
    (d.alerts || []).filter((a) => a.tone !== 'good' && a.kind !== 'ad' && a.kind !== 'show' && !(own && ['lead', 'speed', 'wa'].includes(a.kind))).forEach((a) => list.push({ tone: a.tone, go: a.go, t: a.title + ': ' + a.name, s: a.text }));
    if (!list.length) return '';
    return '<section class="kq-todo is-full" data-part="alerts">' + list.slice(0, 4).map((a, i) => '<button type="button" style="--i:' + i + '" class="kq-al is-' + a.tone + '"' + (a.go ? ' data-go="' + a.go + '"' : ' data-kq-to="' + a.to + '"') + '>' +
      icon(a.tone === 'bad' ? 'alert' : 'bell') + '<span><b>' + esc(a.t) + '</b> ' + esc(a.s) + '</span>' + icon('arrow') + '</button>').join('') + '</section>';
  }

  // the clinic's rates at a glance: who doesn't come (60 days, the calendar's target rests on it), the upsell at the visit, the
  // consultations ending with a package, the cancellations, the clients who booked again
  function ratesHtml(d) {
    const R = d.rates; if (!R) return '';
    const p = pv(d), cl = Object.keys(d.clinic || {});
    const ns = cl.reduce((a, c) => { const t = d.clinic[c].fill.target; if (t && t.from === 'clinic') { a.due += t.due; a.missed += t.missed; } return a; }, { due: 0, missed: 0 });
    const cs = cl.reduce((a, c) => { const x = d.clinic[c].consults; a.total += x.total; a.pk += x.withPackage; return a; }, { total: 0, pk: 0 });
    const per = (fn) => cl.length > 1 ? '<small>' + cl.map((c) => short(c) + ' ' + fn(c)).join(' · ') + '</small>' : '';
    const st = (label, v, delta, sub, cls) => '<div class="' + (cls || '') + '"><span>' + label + '</span><b>' + v + (delta || '') + '</b>' + sub + '</div>';
    const items = [
      ns.due ? st('Nu vin, 60 de zile', P(Math.round((ns.missed / ns.due) * 100)), '', per((c) => { const t = d.clinic[c].fill.target; return t && t.from === 'clinic' ? t.noShow + '%' : '-'; }) || '<small>' + ns.missed + ' din ' + ns.due + ', 60 de zile</small>') : '',
      R.all.upsell.came ? st('Upsell la vizită', P(R.all.upsell.pct), p ? dl(R.all.upsell.pct, p.upsellRate, 'pt') : '', per((c) => P(R[c] && R[c].upsell.pct)) || '<small>' + R.all.upsell.upsold + ' din ' + R.all.upsell.came + '</small>') : '',
      cs.total ? st('Consultații cu upsell', P(Math.round((cs.pk / cs.total) * 100)), '', per((c) => P(d.clinic[c].consults.pct)) || '<small>' + cs.pk + ' din ' + cs.total + '</small>', cs.pk / cs.total < 0.5 ? 'is-bad' : '') : '',
      R.all.cancel.made ? st('Anulări', P(R.all.cancel.pct), p ? dl(R.all.cancel.pct, p.cancelRate, 'ptbad') : '', per((c) => P(R[c] && R[c].cancel.pct)) || '<small>' + R.all.cancel.cancelled + ' din ' + R.all.cancel.made + '</small>') : '',
      R.all.rebook.clients ? st('Revin', P(R.all.rebook.pct), p ? dl(R.all.rebook.pct, p.rebookRate, 'pt') : '', per((c) => P(R[c] && R[c].rebook.pct)) || '<small>' + R.all.rebook.back + ' din ' + R.all.rebook.clients + '</small>') : '',
    ].filter(Boolean);
    if (!items.length) return '';
    return sec('rates', 'kq-rates is-full', 'Ratele', 'Nu vin: din programările ultimelor 60 de zile (de la 17 oct), cele care n-au venit (anulate la ora lor sau după, ori nemarcate și neplătite); din ele vine ținta calendarului. Upsell la vizită: vizitele venite cu un pachet sau upsell plătit atunci. Consultații cu upsell: consultațiile urmate în 7 zile de o plată cu upsell sau pachet a aceleiași cliente. Anulări: din programările făcute în perioadă. Revin: clientele venite în perioadă care au deja o altă programare după vizită.',
      '<div class="kq-rates-g">' + items.join('') + '</div>');
  }

  // the manager's own targets per clinic, and her three actions
  function managerHtml(d) {
    const T = (d.targets && d.targets.perDay) || 1500;
    const pend = K.data && K.data.manager ? (K.data.manager.pendingTime || 0) + (K.data.manager.pendingLeave || 0) : 0;
    const cols = Object.keys(d.clinic || {}).map((c) => {
      const x = d.clinic[c], team = x.team || [], under = team.filter((p) => !p.ok).length;
      const goals = [
        [team.length ? !under : null, '1.500 lei / zi', team.length ? (under ? under + ' sub țintă' : 'toate') : '-'],
        [x.fill.pct == null ? null : x.fill.pct >= x.fill.targetPct, 'Calendar 7 zile', P(x.fill.pct) + ' din ' + x.fill.targetPct + '%'],
        [x.reception.pct == null ? null : x.reception.pct >= 100, 'Leaduri în 5 min', P(x.reception.pct)],
        [!x.waiting, 'Mesaje', x.waiting ? x.waiting + ' așteaptă' : 'zero'],
        [x.consults.pct == null ? null : x.consults.pct >= 50, 'Consultații cu upsell', P(x.consults.pct) + ' / 50%'],
      ];
      const hit = goals.filter((g) => g[0] === true).length, known = goals.filter((g) => g[0] != null).length;
      return '<div class="kq-col"><div class="kq-col-h">' + tag(c) + '<b>' + hit + '</b><small>din ' + known + ' ținte</small></div>' +
        '<ul class="kq-goals">' + goals.map((g, i) => '<li style="--i:' + i + '" class="' + (g[0] === true ? 'is-ok' : g[0] === false ? 'is-no' : '') + '"><i></i><span>' + g[1] + '</span><b>' + esc(g[2]) + '</b></li>').join('') + '</ul></div>';
    });
    return sec('mgr', 'kq-mgr is-full', 'Țintele tale', 'În perioada aleasă; calendarul: următoarele 7 zile, ținta lui = 100% + cele care nu au venit în ultimele 60 de zile. ' + noShows(d) + '. Lei pe zi: încasările fiecărei cosmeticiene împărțite la zilele lucrate.',
      '<div class="kq-cols">' + cols.join('') + '</div>' +
      '<div class="kq-acts"><button type="button" class="k-btn is-sm is-accent" data-mg="george">' + icon('bell') + 'Trimite feedback pentru reclame</button><button type="button" class="k-btn is-sm is-outline" data-mg="close">Închide ziua</button>' +
        '<button type="button" class="k-btn is-sm is-outline" data-mg="report">Raport</button><span class="kq-acts-l"><button type="button" class="kq-link" data-go="manager/echipa">Echipa' + (pend ? ' <b class="kq-dot">' + pend + '</b>' : '') + '</button><button type="button" class="kq-link" data-go="manager/casa">Casa</button><button type="button" class="kq-link" data-go="manager/rapoarte">Rapoarte</button></span></div>');
  }

  // per clinic: the leads, what one cost, and how far they went (only the steps that have someone)
  function citiesHtml(d) {
    const p = pv(d), own = owner(d);
    const rows = ((d.cities && d.cities.rows) || []).filter((c) => c.funnel.leads || (own && c.spend));
    if (!rows.length) return '';
    const col = (c) => {
      const f = c.funnel, pc = p && p.cities && p.cities[c.city], cost = own && c.cost;
      const steps = [['Contactate', f.contacted, cost && cost.contacted], ['Programate', f.booked, cost && cost.booked], ['Au venit', f.came, cost && cost.came], ['Au plătit', f.paid, cost && cost.paid], ['Pachet', f.upsold, cost && cost.upsold]].filter((s) => s[1] > 0);
      const top = Math.max(1, f.leads);
      const line = [own && c.spend ? L2(cost && cost.lead) + ' un lead' + (pc ? dl(cost && cost.lead, pc.cpl, 'cost') : '') : '', own && c.spend ? K.lei(c.spend) + ' cheltuiți' : '', f.organic ? f.organic + ' organic' : ''].filter(Boolean).join(' · ');
      return '<div class="kq-col"><div class="kq-col-h">' + tag(c.city) + '</div>' + hero('city-' + c.city, f.leads, 'num', pc ? dl(f.leads, pc.leads) : '', '<span>leaduri</span>' + (line ? ' · ' + line : '')) +
        (steps.length ? '<ol class="kq-fn">' + steps.map(([l, v, cst], i) => '<li style="--w:' + Math.max(3, ratio(v, top)) + '%;--i:' + i + '"><span>' + l + '</span><i class="kq-tr"><s></s></i><b>' + K.num(v) + '</b>' + (own && cst != null ? '<em>' + L2(cst) + '</em>' : '') + '</li>').join('') + '</ol>' : '') +
        (own && c.spend && c.ads.revenue ? '<p class="kq-sub">' + K.lei(c.ads.revenue) + ' încasați din ele · ' + dec(c.roas, 2) + ' lei la 1 leu</p>' : '') + '</div>';
    };
    return sec('cities', 'kq-cities is-full', 'Leadurile', 'Lead: un formular sau contact nou. Contactat: primul apel, mesaj sau programare de cineva din echipă. Au venit: programarea e finalizată, plătită, sau clienta a plătit ceva în ziua ei.' + (own ? ' Lângă fiecare pas: cât a costat (cheltuiala orașului, după numele campaniei TM / AR, la leadurile din reclame ajunse acolo).' : ''),
      '<div class="kq-cols">' + rows.map(col).join('') + '</div>');
  }

  // how the money came in, per clinic and by method (the total is in the deck above)
  function moneyHtml(d) {
    const p = pv(d);
    if (!d.money.revenue) return '';
    const cl = Object.keys(d.clinic || {});
    const meth = cl.reduce((a, c) => { const x = d.clinic[c].methods; a.cash += x.cash; a.card += x.card; a.transfer += x.transfer + x.other; return a; }, { cash: 0, card: 0, transfer: 0 });
    const tot = meth.cash + meth.card + meth.transfer;
    const seg = [['cash', 'cash', meth.cash], ['card', 'card', meth.card], ['transfer', 'transfer', meth.transfer]].filter((x) => x[2] > 0);
    const byCity = (d.cities.rows || []).filter((c) => c.money.revenue).map((c) => ({ city: c.city, v: c.money.revenue, pv: p && p.cities && p.cities[c.city] ? p.cities[c.city].revenue : null }));
    const topC = Math.max(1, ...byCity.map((x) => x.v));
    return sec('money', 'kq-money', 'Încasat', 'Plățile din Încasări din perioada aleasă, după ziua scrisă la plată.',
      '<div class="kq-bars">' + byCity.map((x, i) => '<div class="kq-bar-r" style="--i:' + i + ';--w:' + ratio(x.v, topC) + '%">' + tag(x.city) + '<i class="kq-tr"><s></s></i><b>' + K.lei(x.v) + '</b>' + dl(x.v, x.pv, 'lei') + '</div>').join('') + '</div>' +
      (tot ? '<div class="kq-split"><div class="kq-split-bar">' + seg.map((s, i) => '<i class="is-' + s[0] + '" style="--w:' + ratio(s[2], tot) + '%;--i:' + i + '"></i>').join('') + '</div>' +
        '<p class="kq-sub">' + seg.map((s) => '<span class="is-' + s[0] + '"><i></i>' + P(pct(s[2], tot)) + ' ' + s[1] + '</span>').join('') + '<span>bon mediu ' + L(d.money.ticket) + '</span></p></div>' : ''));
  }

  function packagesHtml(d) {
    const pk = d.packages || {}, p = pv(d);
    const cl = Object.keys(d.clinic || {});
    const cons = cl.filter((c) => d.clinic[c].consults.total);
    const rest = cl.reduce((n, c) => n + d.clinic[c].dues.rest, 0);
    if (!pk.count && !cons.length && !rest) return '';
    return sec('packages', 'kq-packages', 'Pachete', 'Pachet: o plată cu upsell. Consultații cu upsell: consultațiile urmate în 7 zile de o plată cu upsell sau pachet a aceleiași cliente, după structura din Traininguri (nu există o legătură directă). De încasat: ce mai au de plătit acum clientele cu pachete în tranșe.',
      hero('packages', pk.count || 0, 'num', p ? dl(pk.count || 0, p.packages) : '', pk.count ? '<span>vândute</span> · medie ' + L(pk.avg) + (p ? dl(pk.avg, p.packageAvg, 'lei') : '') : '<span>vândute</span>') +
      (cons.length ? '<ul class="kq-list">' + cons.map((c, i) => { const cs = d.clinic[c].consults; return '<li style="--i:' + i + '">' + ring(cs.pct) + tag(c) + '<span>consultație → pachet</span><b class="' + bad(cs.pct < 50).trim() + '">' + P(cs.pct) + '</b><small>' + cs.withPackage + ' din ' + cs.total + '</small></li>'; }).join('') + '</ul>' : '') +
      (rest ? '<p class="kq-sub">De încasat din pachete: <b>' + K.lei(rest) + '</b></p>' : ''));
  }

  function teamHtml(d) {
    const T = (d.targets && d.targets.perDay) || 1500;
    const all = Object.keys(d.clinic || {}).reduce((a, c) => a.concat((d.clinic[c].team || []).map((x) => Object.assign({ city: c }, x))), []).sort((a, b) => b.perDay - a.perDay);
    if (!all.length) return '';
    const ok = all.filter((x) => x.ok).length;
    return sec('team', 'kq-team', 'Cosmeticienele', 'Lei pe zi lucrată: încasările atribuite ei („Cine a făcut tratamentul”) împărțite la zilele pontate plus zilele cu încasări fără pontaj. Linia de pe bară: ținta de ' + K.lei(T) + '.',
      hero('team', ok, 'num', '', '<span>din ' + all.length + '</span> peste ' + K.lei(T) + ' pe zi') +
      '<ul class="kq-pp">' + all.map((x, i) => '<li style="--i:' + i + '" class="' + (x.ok ? 'is-ok' : 'is-low') + '"><span class="kq-pp-n">' + esc(x.name) + ' <small>' + short(x.city) + ' · ' + K.plural(x.days, 'zi', 'zile') + '</small></span><b>' + K.lei(x.perDay) + '</b>' +
        '<span class="kq-meter"><i style="--w:' + Math.min(100, (x.perDay / (T * 2)) * 100) + '%"></i><u style="--t:50%"></u></span></li>').join('') + '</ul>');
  }

  // the target of each clinic's calendar: full plus the clients who didn't come in the last 60 days
  function noShows(d) {
    return Object.keys(d.clinic || {}).map((c) => {
      const t = d.clinic[c].fill.target;
      if (!t) return '';
      const win = 'de la ' + K.dateShort(t.since) + ' la ' + K.dateShort(t.until);
      if (t.noShow == null) return short(c) + ': doar ' + t.due + ' programări ' + win + ', prea puține, ținta 150%';
      return short(c) + (t.from === 'both' ? ' (prea puține aici, ambele clinici)' : '') + ': din ' + t.due + ' programări ' + win + ' au venit ' + t.came + ', n-au venit ' + t.missed + ' (' + t.noShow + '%) → ținta ' + t.target + '%';
    }).filter(Boolean).join('. ');
  }
  function calendarHtml(d) {
    const DOW = ['D', 'L', 'Ma', 'Mi', 'J', 'V', 'S'];
    const cols = Object.keys(d.clinic || {}).map((c) => {
      const f = d.clinic[c].fill, tgt = f.targetPct;
      return '<div class="kq-col"><div class="kq-col-h">' + tag(c) + big('cal-' + c, f.pct, 'pct', f.pct != null && f.pct < 100 ? 'is-bad' : '') + '<small>din ' + tgt + '% · ' + dec(f.freeHours, 0) + ' h libere</small></div>' +
        '<div class="kq-days">' + f.days.map((x, i) => {
          const dd = new Date(x.date + 'T12:00:00');
          return '<div class="kq-day' + (x.capHours ? '' : ' is-off') + '" style="--i:' + i + '" title="' + esc(K.dateLong(x.date)) + ': ' + (x.capHours ? P(x.pct) + ' din ' + tgt + '%' : 'închis') + '"><div class="kq-day-b"><i style="--h:' + (x.pct == null ? 0 : Math.min(100, (x.pct / 200) * 100)) + '%" class="' + (x.pct != null && x.pct < 100 ? 'is-bad' : '') + '"></i><u style="--t:' + Math.min(100, tgt / 2) + '%"></u></div><small>' + DOW[dd.getDay()] + dd.getDate() + '</small></div>';
        }).join('') + '</div></div>';
    });
    return sec('calendar', 'kq-calendar', 'Calendarul, 7 zile', 'Orele programate (fără anulări) față de orele cosmeticienelor din Program echipă; roșu: sub plin. Ținta (linia de pe zile) = 100% + cele care nu au venit în ultimele 60 de zile (de la 17 oct, când a pornit portalul): programările clientelor, fără anulările făcute dinainte, o clientă o dată pe zi și tratament; au venit = finalizate, plătite sau clienta a plătit ceva în ziua ei. ' + noShows(d) + '.', '<div class="kq-cols">' + cols.join('') + '</div>');
  }

  function receptionHtml(d) {
    const cl = Object.keys(d.clinic || {});
    const sum = cl.reduce((a, c) => { const r = d.clinic[c].reception; a.total += r.total; a.w5 += r.within5; a.never += r.never; a.wait += d.clinic[c].waiting; return a; }, { total: 0, w5: 0, never: 0, wait: 0 });
    if (!sum.total && !sum.wait && !d.waitingSocial) return '';
    const all = pct(sum.w5, sum.total), t = (d.messages && d.messages.team) || {};
    // the manager answers the phone herself (16.11: „ea e tot recepție”): her own card, each thing to do one tap away
    if (!owner(d)) {
      const wait = sum.wait + (d.waitingSocial || 0);
      return sec('reception', 'kq-reception', 'Recepția ta', 'Leadurile noi din reclame și site pe care le-ai sunat, le-ai scris sau le-ai programat în 5 minute. Mesaje: conversațiile în care clienta a scris ultima și n-a primit răspuns.',
        hero('rec', all, 'pct', '', '<span>sunate în 5 minute</span>' + (sum.total ? ' · ' + sum.w5 + ' din ' + sum.total : '') + (t.median != null ? ' · pe WhatsApp răspunzi în ' + mins(t.median) : ''), all != null && all < 80 ? 'is-bad' : '') +
        (sum.never || wait ? '<div class="kq-tc-do">' + (sum.never ? '<button type="button" class="kq-act is-bad" data-go="pipeline" data-then="pipeline:queue"><b>' + sum.never + '</b> ' + (sum.never === 1 ? 'nesunat' : 'nesunate') + ', sună acum' + icon('arrow') + '</button>' : '') +
          (wait ? '<button type="button" class="kq-act is-bad" data-go="mesaje/wait"><b>' + wait + '</b> ' + (wait === 1 ? 'mesaj așteaptă' : 'mesaje așteaptă') + icon('arrow') + '</button>' : '') + '</div>' : '<p class="kq-sub">Niciun lead nesunat, niciun mesaj fără răspuns.</p>'));
    }
    return sec('reception', 'kq-reception', 'Recepția', 'Leadurile noi din reclame și site sunate, scrise sau programate de cineva din echipă în 5 minute. Mesaje: conversațiile în care clienta a scris ultima și nu i-a răspuns nimeni.',
      hero('rec', all, 'pct', '', '<span>sunate în 5 minute</span>' + (sum.never ? ' · <b class="is-bad">' + K.plural(sum.never, 'nesunat', 'nesunate') + '</b>' : '') + (t.median != null ? ' · pe WhatsApp răspundem în ' + mins(t.median) : ''), all != null && all < 80 ? 'is-bad' : '') +
      '<ul class="kq-list">' + cl.map((c, i) => { const r = d.clinic[c].reception, w = d.clinic[c].waiting; return '<li style="--i:' + i + '">' + tag(c) + '<span>' + P(r.pct) + ' în 5 min</span>' + (r.never ? '<b class="is-bad">' + K.plural(r.never, 'nesunat', 'nesunate') + '</b>' : '') +
        (w ? '<button type="button" class="kq-wait" data-go="mesaje"><i></i>' + K.plural(w, 'mesaj', 'mesaje') + '</button>' : '') + '</li>'; }).join('') +
        (d.waitingSocial ? '<li><span class="kq-tag">IG</span><span>Instagram / Messenger</span><button type="button" class="kq-wait" data-go="mesaje"><i></i>' + K.plural(d.waitingSocial, 'mesaj', 'mesaje') + '</button></li>' : '') + '</ul>');
  }

  // the ads: spend and what a result cost; the ads to act on first, the others folded
  function adsHtml(d) {
    if (d.adsState === 'none') return '';
    if (d.adsState === 'error' || !d.ads) return sec('ads', 'kq-ads is-full', 'Reclamele', '', '<p class="kq-sub is-bad">Meta: ' + esc(d.adsError || 'nu a răspuns') + '</p>');
    const a = d.ads.totals, rows = d.ads.rows, p = pv(d);
    if (!a.spend) return '';
    const st = (l, v, delta) => (v === '-' ? '' : '<div><small>' + l + '</small><b>' + v + '</b>' + (delta || '') + '</div>'); // nothing to show: not shown
    const row = (x) => '<li class="' + (x.flag ? 'is-' + x.flag : '') + '" data-kp-adrow="' + esc(x.id) + '"><span class="kq-ad-n"><i class="' + (x.status === 'ACTIVE' ? 'is-on' : '') + '"></i>' + esc(x.name || 'Reclamă') + (x.flag ? '<small>' + esc(x.why.join(' · ')) + '</small>' : '') + '</span>' +
      '<span>' + K.plural(x.leads, 'lead', 'leaduri') + (x.metaLeads !== x.leads ? ' (' + x.metaLeads + ' Meta)' : '') + '</span><span>' + L2(x.cpl) + ' / lead</span><span>' + K.lei(x.spend) + '</span><span>' + (x.roas != null ? dec(x.roas, 2) + ' la 1 leu' : '') + '</span></li>';
    const head = rows.filter((x) => x.flag === 'bad' || x.flag === 'top').concat(rows.filter((x) => x.flag !== 'bad' && x.flag !== 'top')).slice(0, Math.max(3, rows.filter((x) => x.flag === 'bad' || x.flag === 'top').length));
    const rest = rows.filter((x) => !head.includes(x));
    return sec('ads', 'kq-ads is-full', 'Reclamele', 'Cifrele Meta adunate pe zile; leadurile, programările și banii sunt cei din portal, ai leadurilor venite din fiecare reclamă. Marcate: cele care merg mult mai bine sau mai rău decât media.',
      hero('ads', a.spend, 'lei', p ? dl(a.spend, p.spend, 'lei') : '', '<span>cheltuiți</span>' + (d.adsStale ? ' · Meta nu răspunde acum, cifrele de la ultima citire' : '')) +
      '<div class="kq-stats">' + st('Un lead', L2(a.cpl), p ? dl(a.cpl, p.cpl, 'cost') : '') + st('O programare', L(a.perBooked), p ? dl(a.perBooked, p.perBooked, 'cost') : '') + st('O clientă venită', L(a.perCame), p ? dl(a.perCame, p.perCame, 'cost') : '') +
        st('La 1 leu', a.roas != null ? dec(a.roas, 2) + ' lei' : '-', p ? dl(a.roas, p.roas) : '') + '</div>' +
      '<ul class="kq-ads-l">' + head.map(row).join('') + '</ul>' + (rest.length ? '<details class="kq-more"><summary>Încă ' + K.plural(rest.length, 'reclamă', 'reclame') + '</summary><ul class="kq-ads-l">' + rest.map(row).join('') + '</ul></details>' : ''),
      go('reclame', 'Reclame'));
  }

  function trendHtml(d) {
    if (!d.trend || d.trend.length < 2 || !d.trend.some((x) => x.revenue || x.leads)) return '';
    return sec('trend', 'kq-trend is-full', 'Zi cu zi', '', '<div data-kp-chart data-sig="' + d.trend.map((x) => [x.leads, x.made, Math.round(x.revenue || 0), Math.round(x.spend || 0)].join('/')).join(',') + '"></div>',
      '<div class="k-seg"><button type="button" data-kp-trend="money" class="' + (S.trend === 'money' ? 'is-on' : '') + '">Bani</button><button type="button" data-kp-trend="people" class="' + (S.trend === 'people' ? 'is-on' : '') + '">Oameni</button></div>');
  }
  function drawTrend(d) {
    const el = S.body && S.body.querySelector('[data-kp-chart]');
    if (!el) return;
    const t = d.trend, labels = t.map((x) => K.dateShort(x.day));
    const money = S.trend === 'money';
    const series = money
      ? (d.scope ? [] : [{ name: 'Reclame', values: t.map((x) => x.spend), color: 'var(--muted)', kind: 'line', dashed: true }]).concat([{ name: 'Încasat', values: t.map((x) => x.revenue), color: 'var(--accent)' }])
      : [{ name: 'Leaduri', values: t.map((x) => x.leads), color: 'var(--accent)', kind: 'bar' }, { name: 'Au venit', values: t.map((x) => x.came), color: 'var(--muted)', kind: 'line' }];
    el.innerHTML = ''; el._kro = null;
    K.chart(el, { labels, height: 200, series, format: money ? K.lei : K.num, axis: (v) => (money && v >= 1000 ? dec(v / 1000, 1) + 'k' : Math.round(v)),
      tip: (i) => '<b>' + esc(K.dateLong(t[i].day)) + '</b>' + series.map((s) => '<span><i style="background:' + s.color + '"></i>' + s.name + ': ' + (money ? K.lei(s.values[i]) : K.num(s.values[i])) + '</span>').join('') });
  }

  function offersHtml(d) {
    const rows = d.offers.rows.filter((x) => x.group === 'ads' && (x.leads || x.revenue));
    if (!rows.length) return '';
    return sec('offers', 'kq-offers is-full', 'Ofertele', 'Banii urmează leadurile perioadei: ce au plătit leadurile venite pe fiecare ofertă.',
      '<ul class="kq-of">' + rows.map((x) => '<li><span class="kq-of-n">' + esc(x.title) + '</span><span>' + x.leads + ' leaduri</span><span>' + x.came + ' au venit</span><span>' + (x.cpl != null ? L2(x.cpl) + ' / lead' : '') + '</span><b>' + K.lei(x.revenue) + '</b></li>').join('') + '</ul>',
      go('oferte', 'Oferte'));
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
      ? [alertsHtml(d), ratesHtml(d), citiesHtml(d), adsHtml(d), teamHtml(d), calendarHtml(d), moneyHtml(d), packagesHtml(d), receptionHtml(d), trendHtml(d), offersHtml(d)]
      : [managerHtml(d), ratesHtml(d), alertsHtml(d), teamHtml(d), calendarHtml(d), receptionHtml(d), citiesHtml(d), moneyHtml(d), packagesHtml(d), trendHtml(d)];
    const parts = list.filter(Boolean).map((html) => ({ key: /data-part="([^"]+)"/.exec(html)[1], html }));
    K.patch(S.body, parts);
    const tr = S.body.querySelector('[data-kp-chart]');
    if (tr && !tr.children.length) drawTrend(d);
    animate(S.body);
    tick();
  }

  // ------------------------------------------------------------------ the entrances: short and quiet, each card its own (portal-kpi.css), once it
  // reaches the screen; the big numbers roll from what they showed before
  const calm = () => document.documentElement.classList.contains('c360-reduce') || (window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches);
  const lastN = new Map();
  let io = null;
  function roll(el) {
    const to = Number(el.dataset.kqN) || 0, f = el.dataset.kqF, k = el.dataset.kqK, from = lastN.has(k) ? lastN.get(k) : 0;
    lastN.set(k, to);
    if (calm() || from === to || el.textContent === '-') { el.textContent = el.textContent === '-' ? '-' : fmtN(to, f); return; }
    const t0 = performance.now(), ms = 500;
    (function step(t) {
      const q = Math.min(1, (t - t0) / ms), e = 1 - Math.pow(1 - q, 3), v = from + (to - from) * e;
      el.textContent = fmtN(f === 'pct' ? Math.round(v) : v, f);
      if (q < 1) requestAnimationFrame(step); else el.textContent = fmtN(to, f);
    })(t0);
  }
  function reveal(c) { c.classList.add('kq-in'); c.querySelectorAll('[data-kq-n]').forEach(roll); }
  function animate(root) {
    const cards = root.querySelectorAll('.kq-card:not(.kq-in), .kq-todo:not(.kq-in), .kq-tc:not(.kq-in), .kq-sig:not(.kq-in)');
    if (calm() || !('IntersectionObserver' in window)) { cards.forEach(reveal); return; }
    if (!io) io = new IntersectionObserver((es) => es.forEach((e) => { if (e.isIntersecting) { io.unobserve(e.target); reveal(e.target); } }), { threshold: 0.1 });
    cards.forEach((c) => {
      if (c._kq) return; c._kq = 1;
      c.querySelectorAll('[data-kq-n]').forEach((n) => { if (n.textContent === '-') return; const k = n.dataset.kqK; n.textContent = fmtN(lastN.has(k) ? lastN.get(k) : 0, n.dataset.kqF); });
      io.observe(c);
    });
  }
  function tick() {
    const el = S.el && S.el.querySelector('[data-kp-ago]');
    if (el && S.at) { const s = Math.round((Date.now() - S.at) / 1000); el.textContent = 'actualizat ' + (s < 5 ? 'acum' : s < 60 ? 'acum ' + s + ' s' : 'acum ' + Math.round(s / 60) + ' min'); }
  }

  // ------------------------------------------------------------------ events
  function onClick(e) {
    if (e.target.closest('[data-kq-other]')) { pop(); return; }
    const p = e.target.closest('[data-kp-period]');
    if (p) { S.period = p.dataset.kpPeriod; pop(false); syncBar(); load(); return; }
    const to = e.target.closest('[data-kq-to]');
    if (to) { const c = S.body.querySelector('[data-part="' + to.dataset.kqTo + '"]'); if (c) c.scrollIntoView({ behavior: 'smooth', block: 'start' }); return; }
    const inf = e.target.closest('[data-kq-i]');
    if (inf) { const t = inf.closest('.kq-card').querySelector('.kq-info'); if (t) { t.hidden = !t.hidden; inf.classList.toggle('is-on', !t.hidden); } return; }
    const tr = e.target.closest('[data-kp-trend]');
    if (tr) { S.trend = tr.dataset.kpTrend; S.el.querySelectorAll('[data-kp-trend]').forEach((b) => b.classList.toggle('is-on', b === tr)); if (S.d) drawTrend(S.d); return; }
    if (e.target.closest('[data-kp-reload]')) { load(); return; }
    const mg = e.target.closest('[data-mg]');
    if (mg) { const M = window.C360Manager; if (M && M[mg.dataset.mg]) M[mg.dataset.mg](); return; }
    const g = e.target.closest('[data-go]');
    if (g && !S.el.closest('#panel-panou')) { e.preventDefault(); K.go(g.dataset.go); }
  }
  function onSubmit(e) {
    const f = e.target.closest('[data-kp-range]');
    if (!f) return;
    e.preventDefault();
    if (!f.since.value || !f.until.value) return;
    const s = [f.since.value, f.until.value].sort();
    S.since = s[0]; S.until = s[1]; S.period = 'custom';
    f.since.value = s[0]; f.until.value = s[1];
    pop(false); syncBar(); load();
  }

  // ------------------------------------------------------------------ Panou → Azi: the day of each clinic (morning and evening), only what needs doing coloured
  function todayHtml(d) {
    const n = d.now; if (!n) return '';
    const own = owner(d), cl = Object.keys(n.cities);
    const act = (v, label, tone, goTo, then) => (v ? '<button type="button" class="kq-act is-' + tone + '" data-go="' + goTo + '"' + (then ? ' data-then="' + then + '"' : '') + '><b>' + v + '</b> ' + label + '</button>' : '');
    const col = (c) => {
      const x = n.cities[c], a = x.appts, m = x.methods, f = d.clinic && d.clinic[c] && d.clinic[c].fill, ld = x.leads;
      const meth = [['cash', 'cash'], ['card', 'card'], ['transfer', 'transfer']].filter((k) => m[k[0]] > 0).map((k) => K.lei(m[k[0]]) + ' ' + k[1]).join(' · ');
      const appts = [a.done ? a.done + ' finalizate' : '', a.confirmed ? a.confirmed + ' confirmate' : '', a.cancelled ? a.cancelled + ' anulate' : ''].filter(Boolean).join(' · ');
      const leads = ld.total ? K.plural(ld.total, 'lead nou', 'leaduri noi') + (ld.within5 ? ' · ' + ld.within5 + ' sunate în 5 min' : '') : 'niciun lead nou';
      const todo = act(a.unconfirmed, 'de confirmat', 'warn', 'programari') + act(a.passed, 'trecute, nefinalizate', 'bad', 'programari') + act(ld.never, ld.never === 1 ? 'nesunat' : 'nesunate', 'bad', 'pipeline', 'pipeline:queue') + act(x.waiting, x.waiting === 1 ? 'mesaj așteaptă' : 'mesaje așteaptă', 'bad', 'mesaje');
      return '<article class="kq-tc">' +
        '<header>' + tag(c) + '<div class="kq-tc-m"><b>' + K.lei(x.collected) + '</b><small>' + (x.payments ? K.plural(x.payments, 'plată', 'plăți') + (meth ? ' · ' + meth : '') : 'încasat azi') + '</small></div></header>' +
        '<ul class="kq-tc-l"><li>' + icon('calendar') + '<span><b>' + K.plural(a.total, 'programare', 'programări') + '</b>' + (appts ? ' · ' + appts : '') + '</span></li>' +
          '<li>' + icon('userPlus') + '<span>' + leads + '</span></li>' +
          (own && x.ads && x.ads.spend ? '<li>' + icon('facebook') + '<span>' + K.lei(x.ads.spend) + ' pe reclame · ' + x.ads.metaLeads + ' leaduri Meta' + (x.ads.cpl != null ? ' · ' + L2(x.ads.cpl) + ' / lead' : '') + '</span></li>' : '') +
          (f ? '<li class="kq-tc-cal" data-go="programari">' + icon('clock') + '<span>7 zile: <b class="' + bad(f.pct != null && f.pct < 100).trim() + '">' + P(f.pct) + '</b> din ' + f.targetPct + '%</span><span class="kq-meter"><i class="' + bad(f.pct != null && f.pct < 100).trim() + '" style="--w:' + Math.min(100, ((f.pct || 0) / 200) * 100) + '%"></i><u style="--t:' + Math.min(100, f.targetPct / 2) + '%"></u></span></li>' : '') +
        '</ul>' + (todo && own ? '<div class="kq-tc-do">' + todo + '</div>' : '') + '</article>'; // the manager has them all in „De făcut” above
    };
    const sg = d.signals, items = [];
    if (sg) {
      const LV = { mult_putine: 'bad', putin_putine: 'warn', potrivit: 'ok', putin_multe: 'warn', mult_multe: 'bad' };
      const hm = (iso) => { try { return new Intl.DateTimeFormat('ro-RO', { timeZone: 'Europe/Bucharest', weekday: 'short', hour: '2-digit', minute: '2-digit' }).format(new Date(iso)); } catch (e) { return ''; } };
      sg.feedback.forEach((x) => items.push({ tone: LV[x.level] || 'ok', go: 'manager/rapoarte', t: 'Leaduri ' + short(x.city) + ': ' + x.label, s: hm(x.at) + (x.details ? ' · „' + x.details + '”' : '') }));
      sg.unclosed.forEach((x) => items.push({ tone: 'warn', go: 'manager/casa', t: 'Casa ' + short(x.city) + ' neînchisă pe ' + K.dateShort(x.date), s: '' }));
      sg.closes.filter((x) => x.off || x.fate === 'depus').forEach((x) => items.push({ tone: x.off ? 'bad' : 'ok', go: 'manager/casa', t: 'Casa ' + short(x.city) + ', ' + K.dateShort(x.date) + (x.off ? ': diferență' : ': depus în cont'),
        s: [x.cashDiff ? 'cash ' + (x.cashDiff > 0 ? '+' : '') + K.lei(x.cashDiff, 2) : '', x.cardDiff ? 'card ' + (x.cardDiff > 0 ? '+' : '') + K.lei(x.cardDiff, 2) : '', x.fate === 'depus' ? 'depus ' + K.lei(x.deposited) : ''].filter(Boolean).join(' · ') }));
      if (sg.report) items.push({ tone: sg.report.problems ? 'warn' : 'ok', go: 'manager/rapoarte', t: 'Raportul săptămânii trimis', s: hm(sg.report.at) + (sg.report.problems ? ' · are probleme notate' : '') });
    }
    const who = sg && [].concat(sg.feedback || [], sg.closes || [], sg.report ? [sg.report] : []).map((x) => x.by).find(Boolean);
    const sig = items.length ? '<div class="kq-sig"><h4>' + (who ? 'De la ' + esc(who) : 'Casa și rapoartele') + '</h4><ul>' + items.slice(0, 4).map((x) => '<li class="is-' + x.tone + '" data-go="' + x.go + '"><i></i><span><b>' + esc(x.t) + '</b>' + (x.s ? '<small>' + esc(x.s) + '</small>' : '') + '</span>' + icon('arrow') + '</li>').join('') + '</ul></div>' : '';
    return (own ? '' : deskHtml(d)) + '<div class="kq-head"><h3>Azi pe clinici</h3>' + (d.waitingSocial ? '<button type="button" class="kq-act is-bad" data-go="mesaje"><b>' + d.waitingSocial + '</b> pe Instagram / Messenger</button>' : '') + '</div>' +
      '<div class="kq-tc-g">' + cl.map(col).join('') + '</div>' + sig;
  }

  // the manager is the reception too (16.11): everything waiting for her, live, one tap from where it's done; only what is > 0
  function deskHtml(d) {
    const n = d.now; if (!n) return '';
    const leads = (TD.leads || []).filter((l) => l.kind === 'open' || l.kind === 'booked');
    const ago = (iso) => { const m = Math.max(0, (Date.now() - Date.parse(iso)) / 60e3); return m < 60 ? Math.round(m) + ' min' : m < 1440 ? Math.round(m / 60) + ' h' : Math.round(m / 1440) + ' zile'; };
    const rows = [];
    const add = (c, v, text, go, then, sub) => { if (v > 0) rows.push('<li data-go="' + go + '"' + (then ? ' data-then="' + then + '"' : '') + '>' + (c ? tag(c) : '<span class="kq-tag">' + icon('chat') + '</span>') + '<span><span><b>' + v + '</b> ' + esc(text) + '</span>' + (sub ? '<small>' + esc(sub) + '</small>' : '') + '</span>' + icon('arrow') + '</li>'); };
    Object.keys(n.cities).forEach((c) => {
      const x = n.cities[c], mine = leads.filter((l) => cityOf(l.location) === c);
      const never = mine.filter((l) => l.neverContacted).sort((a, b) => String(a.createdAt).localeCompare(String(b.createdAt)));
      add(c, never.length, never.length === 1 ? 'lead nesunat' : 'leaduri nesunate', 'pipeline', 'pipeline:queue', never[0] && never[0].createdAt ? 'cel mai vechi așteaptă de ' + ago(never[0].createdAt) : '');
      const back = mine.filter((l) => l.followUpState === 'overdue' && !l.neverContacted).length;
      add(c, back, back === 1 ? 'de resunat acum' : 'de resunat acum', 'pipeline', 'pipeline:queue');
      add(c, x.waiting, x.waiting === 1 ? 'mesaj fără răspuns' : 'mesaje fără răspuns', 'mesaje/wait');
      add(c, x.appts.passed, x.appts.passed === 1 ? 'vizită trecută, nefinalizată' : 'vizite trecute, nefinalizate', 'programari');
      add(c, x.appts.unconfirmed, 'de confirmat azi', 'programari');
      add(c, x.tomorrowUnconfirmed, 'de confirmat mâine', 'programari');
    });
    const loose = leads.filter((l) => !cityOf(l.location) && l.neverContacted);
    add('', loose.length, loose.length === 1 ? 'lead nesunat, fără oraș' : 'leaduri nesunate, fără oraș', 'pipeline', 'pipeline:queue');
    add('', d.waitingSocial || 0, (d.waitingSocial === 1 ? 'mesaj' : 'mesaje') + ' pe Instagram / Messenger', 'mesaje/wait');
    const pend = K.data && K.data.manager ? (K.data.manager.pendingTime || 0) + (K.data.manager.pendingLeave || 0) : 0;
    if (pend) rows.push('<li data-go="manager/echipa"><span class="kq-tag">' + icon('users') + '</span><span><span><b>' + pend + '</b> ' + (pend === 1 ? 'cerere de pontaj sau concediu' : 'cereri de pontaj și concediu') + '</span></span>' + icon('arrow') + '</li>');
    // more lists from the follow-ups (packages without a next booking, call again at…), when they are there
    const fu = window.C360Followups && window.C360Followups.counts ? window.C360Followups.counts() : null;
    if (fu) { if (fu.packagesUnbooked) rows.push('<li data-go="' + (fu.go || 'pipeline') + '"><span class="kq-tag">' + icon('gift') + '</span><span><span><b>' + fu.packagesUnbooked + '</b> pachete fără programare</span></span>' + icon('arrow') + '</li>');
      if (fu.callAgain) rows.push('<li data-go="' + (fu.go || 'pipeline') + '"><span class="kq-tag">' + icon('phone') + '</span><span><span><b>' + fu.callAgain + '</b> de resunat acum</span></span>' + icon('arrow') + '</li>'); }
    return '<section class="kq-desk"><div class="kq-head"><h3>De făcut</h3>' + (rows.length ? '<span class="kq-count">' + rows.length + '</span>' : '') + '</div>' +
      (rows.length ? '<ul>' + rows.join('') + '</ul>' : '<p class="kq-desk-ok">' + icon('checkCircle') + 'Totul e la zi.</p>') + '</section>';
  }
  const TD = { el: null, key: '', leads: null };
  function today(el, leads) {
    if (!el) return;
    TD.el = el;
    if (leads) TD.leads = leads;
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
        el.innerHTML = '<div class="kq-bar" data-kq-bar>' + barHtml() + '</div><section class="sx-deck kq-deck" data-kq-deck aria-label="KPI"></section><div class="kq-body" data-kq-body></div><p class="kq-foot"><span data-kp-ago></span></p>';
        S.bar = el.querySelector('[data-kq-bar]'); S.deck = el.querySelector('[data-kq-deck]'); S.body = el.querySelector('[data-kq-body]');
        el.addEventListener('click', onClick);
        el.addEventListener('submit', onSubmit);
        // the bar sits under the portal's top bar
        const h = document.querySelector('header.topbar');
        if (h) el.style.setProperty('--kq-top', Math.round(h.getBoundingClientRect().height) + 'px');
        paint();
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
