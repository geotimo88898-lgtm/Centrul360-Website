// GET /api/kpi?period=<K.PERIODS>[&since=YYYY-MM-DD&until=YYYY-MM-DD][&part=messages]
// Panou → KPI (the owner; and the manager, 15.11: the same figures for the clinics she runs, without the ads, their spend
// and the offers' costs) and Panou → Azi: every number of the clinic in one place, live. From 16.10.2026, 22:05 on (see
// _lib/kpi.js); the clinic's own work (per cosmetician, the calendar, consultations, reception) as the Manager page
// counts it (_lib/clinic.js).
//
//   summary / prev   the period's main numbers and the previous period of the same length (for ↑ / ↓), when it has data
//   cities           each clinic: lead → contacted → booked → came → paid → package, the ads' spend and the cost of each
//                    step (the owner only), the money paid, the packages
//   clinic           per clinic: each cosmetician's collections per day worked vs 1500 lei, consultations followed by a
//                    package, the calendar of the next 7 days vs the team's hours (target: full + 50%), new leads reached
//                    within 5 minutes, the messages waiting now, by how it was paid, what is still to collect from packages
//   now              today, whatever the period: the bookings of each clinic by state, collected, the leads and how fast
//                    they were reached, the messages waiting, the ads of today (the owner)
//   signals          the owner only: the manager's lead feedback, her day closes, her weekly report
//   funnel, bookings, visits, money, offers, ads, messages, team, trend, alerts: as before
// part=messages: only the messages (Automatizări → Mesaje).
// Server-Timing: data (the store), meta (the ads), calc.

const MONEY = require('./_lib/money');
const { readJSON } = require('./_lib/store');
const { requireRole } = require('./_lib/auth');
const { cityOf } = require('./_lib/city');
const { loadConnection } = require('./_lib/facebook');
const { loadOffers } = require('./_lib/offers');
const K = require('./_lib/kpi');
const C = require('./_lib/clinic');
const B = require('./_lib/booking');
const T = require('./_lib/team-schedule');

const LEVELS = { mult_putine: 'mult prea puține', putin_putine: 'puțin prea puține', potrivit: 'potrivit', putin_multe: 'puțin prea multe', mult_multe: 'mult prea multe' };
const toMin = (t) => { const m = /^(\d{1,2}):(\d{2})/.exec(String(t || '')); return m ? +m[1] * 60 + +m[2] : null; };
const first = (n) => String(n || '').trim().split(/\s+/)[0] || '';

// the bookings of a clinic today, by state: done (finished or paid), confirmed, not confirmed, their hour gone by without
// being finished (not come, or not marked yet), cancelled
function todayOf(appts, nowMin) {
  const out = { total: 0, confirmed: 0, unconfirmed: 0, done: 0, passed: 0, cancelled: 0 };
  appts.forEach((a) => {
    if (a.status === 'anulata') { out.cancelled++; return; }
    out.total++;
    if (a.status === 'finalizata' || a.paidSaleId) { out.done++; return; }
    const s = toMin(a.time), e = toMin(a.endTime), end = e != null && s != null && e > s ? e : s != null ? s + 60 : null;
    if (end != null && end < nowMin) { out.passed++; return; }
    if (a.status === 'confirmata') out.confirmed++; else out.unconfirmed++;
  });
  return out;
}

module.exports = async (req, res) => {
  const session = await requireRole(req, res, ['admin', 'manager']);
  if (!session) return;
  const t0 = Date.now();
  try {
    const q = req.query || {};
    const period = K.PERIODS.includes(q.period) ? q.period : '7d';
    const r = K.rangeOf(period, q);
    const owner = session.role !== 'manager';
    // Meta's days start at once, beside the store's reads (the manager: never asked)
    const connP = loadConnection(readJSON);
    let tMeta = 0;
    const adsP = owner && q.part !== 'messages'
      ? connP.then((c) => (c && c.userToken && c.adAccountId ? K.adsDaily(c) : { none: true })).catch((e) => ({ error: e.message })).then((x) => { tMeta = Date.now() - t0; return x; })
      : Promise.resolve({ none: true });
    const [offers, leads, appointments, sales, clients, conversations, tdoc, employees, admin, attendance, dues, cfg, fb, closes, reports] = await Promise.all([
      loadOffers(readJSON), readJSON('data/leads.json', []), readJSON('data/appointments.json', []), readJSON('data/sales.json', []),
      readJSON('data/clients.json', []), readJSON('data/whatsapp-conversations.json', []), readJSON('data/wa-templates.json', {}),
      readJSON('data/employees.json', []), readJSON('data/admin-profile.json', {}), readJSON('data/attendance.json', []), readJSON('data/client-dues.json', []),
      B.settings({ team: true }),
      owner ? readJSON('data/manager-feedback.json', []) : [], owner ? readJSON('data/day-closes.json', []) : [], owner ? readJSON('data/manager-reports.json', []) : [],
    ]);
    const tData = Date.now() - t0;
    const templates = (tdoc && tdoc.templates) || [];
    // every record with its clinic written one way (a payment without one: its visit's, else its cosmetician's), for the
    // owner and the manager alike, so the same clinic gives the same numbers on both pages (16.11)
    const N = C.normalize({ leads, appts: appointments, sales, convos: conversations, emps: employees });
    // the manager: only her clinics' leads, bookings, payments and messages; never the ads (Meta is not asked). A record
    // without a clinic is hers when she runs every clinic.
    const scope = owner ? null : (await cityOf(session, readJSON, employees)) || [];
    const all = !!scope && K.CITIES.every((c) => scope.includes(c));
    const mine = (x) => !scope || scope.includes(x && x.location) || (all && !(x && x.location));
    const myAppts = scope ? N.appts.filter(mine) : N.appts;
    const mySales = scope ? N.sales.filter(mine) : N.sales;
    const myLeads = scope ? N.leads.filter(mine) : N.leads;
    const myConvos = scope ? N.convos.filter((c) => !c.location || mine(c)) : N.convos;
    const cities = scope ? K.CITIES.filter((c) => scope.includes(c)) : K.CITIES;
    // the candidates of the job ads are not clients: out of the messages' numbers, as in Mesaje (api/_lib/wa-waiting.js)
    const candidates = await require('./_lib/wa-waiting').candidates().catch(() => null);
    const M = K.model({ offers, leads: myLeads, appointments: myAppts, sales: mySales, clients, conversations: myConvos, candidates });
    res.setHeader('Cache-Control', 'no-store');
    if (q.part === 'messages') { res.status(200).json({ period, range: r, start: new Date(K.cfg.start).toISOString(), messages: K.messagesOf(M, r, templates) }); return; }

    const daily = await adsP;
    const t1 = Date.now();
    const ads = daily.none ? { none: true } : daily.error ? { error: daily.error } : K.adsIn(daily, r);
    const names = new Map(employees.map((e) => [e.id, String(e.name || '').trim()]));
    names.set('admin', String(admin.name || '').trim() || 'Admin');
    const rep = K.report(M, r, { offers, ads: ads.rows ? ads : null, templates, names });

    // ---- the previous period of the same length (today: yesterday up to this minute, from what existed then)
    const prev = K.prevOf(period, r);
    if (prev) {
      let Mp = M;
      if (prev.cut) {
        const cut = prev.cut, before = (iso) => (Date.parse(iso) || 0) <= cut;
        Mp = K.model({ offers, clients, conversations: [], now: cut,
          leads: myLeads.filter((l) => before(l.createdAt)).map((l) => Object.assign({}, l, { activities: (l.activities || []).filter((a) => before(a.at)) })),
          appointments: myAppts.filter((a) => before(a.createdAt)), sales: mySales.filter((s) => before(s.createdAt || s.date)) });
      }
      const pAds = !prev.cut && daily.rows ? K.adsIn(daily, prev) : null; // spend is by the day: no „up to this minute”
      const pr = K.report(Mp, prev, { offers, ads: pAds, templates: [], names });
      rep.prev = { range: { since: prev.since, until: prev.until }, cut: !!prev.cut, summary: pr.summary };
    } else rep.prev = null;

    // ---- the clinic's own work, per clinic (the same numbers as the Manager page)
    const ro = B.roNow(), today = ro.date, ahead = C.addDay(today, 6);
    const waiting = await C.waitingNow(myConvos).catch(() => ({}));
    // the packages still being paid, with their clinic as Rest de plată reads it (a package without its clinic takes the one of
    // the payment that started it; never known: it shows at each clinic, as in that list), _lib/dues.js
    const DU = require('./_lib/dues');
    // the calendar's target per clinic: full plus the no-shows of the last 60 days, from every clinic's visits (a share, never money)
    const tg = C.fillTargets(N.appts, N.sales, cities, today, clients);
    const clinic = {};
    cities.forEach((city) => {
      const team = C.cosmeticians(employees, mySales, attendance, city, r.since, r.until);
      const counted = team.filter((x) => x.days > 0);
      const pays = (rep._pays || []).filter((p) => p.city === city);
      const due = DU.openList(dues, sales, city);
      clinic[city] = {
        team: counted.sort((a, b) => b.perDay - a.perDay).map((x) => ({ id: x.id, name: x.name, days: x.days, daysFrom: x.daysFrom, collected: x.collected, perDay: x.perDay, ok: x.ok, gap: x.gap, ...(x.trainee ? { trainee: true, label: x.label } : {}) })),
        consults: C.consults(myAppts, mySales, city, r.since, r.until),
        show30: C.showRate(myAppts, city, today, mySales, 30, clients),
        reception: C.leadSpeed(myLeads, myConvos, cfg, city, r.since, r.until),
        methods: C.methods(pays),
        dues: { count: due.length, rest: C.r2(due.reduce((n, d) => n + d.rest, 0)) },
        fill: Object.assign(C.fill(cfg, city, today, ahead, myAppts, tg[city].target), { target: tg[city], days: C.fillDays(cfg, city, today, 7, myAppts, tg[city].target), schedule: !!(cfg.team && T.hasSchedule(cfg.team.doc, city, cfg.team.ids)) }),
        waiting: waiting[city] || 0,
      };
    });
    rep.clinic = clinic;
    rep.targets = { perDay: C.TARGET_PER_DAY, fill: C.TARGET_FILL * 100 }; // fill: only the fallback; each clinic's is clinic[city].fill.targetPct
    rep.waitingSocial = waiting.social || 0;
    // the team's first contacts, by person (who called / wrote first, how fast)
    rep.contactBy = (rep.team && rep.team.contact) || [];

    // ---- today, whatever the period (Panou → Azi)
    const tr = { since: today, until: today };
    const adsToday = daily.rows ? K.adsIn(daily, tr) : null;
    const tcs = K.citiesOf(M, tr, adsToday ? adsToday.rows : null), tc = tcs.rows;
    const now = { date: today, min: ro.min, cities: {} };
    cities.forEach((city) => {
      const appts = myAppts.filter((a) => a && a.date === today && a.location === city && a.status !== 'concediu' && !a.block);
      const paid = mySales.filter((s) => s && s.source === 'incasare' && s.date === today && (s.location || '') === city);
      const c = tc.find((x) => x.city === city) || {};
      const sp = C.leadSpeed(myLeads, myConvos, cfg, city, today, today);
      const tomorrow = C.addDay(today, 1);
      now.cities[city] = {
        appts: todayOf(appts, ro.min),
        // tomorrow's bookings not confirmed yet (the reception confirms them the day before)
        tomorrowUnconfirmed: myAppts.filter((a) => a && a.date === tomorrow && a.location === city && !a.block && (a.status === 'programata' || a.status === 'reprogramata')).length,
        collected: MONEY.net(paid), payments: paid.filter(MONEY.isPayment).length, methods: C.methods(paid),
        leads: { total: sp.total, within5: sp.within5, never: sp.never, median: sp.median, inHours: sp.inHours, inHoursWithin5: sp.inHoursWithin5 },
        waiting: waiting[city] || 0,
        ads: owner && adsToday ? { spend: c.spend || 0, metaLeads: c.metaLeads || 0, leads: (c.ads && c.ads.leads) || 0, cpl: c.cost ? c.cost.lead : null } : null,
      };
    });
    if (owner && adsToday) now.adsUnassigned = tcs.unassignedSpend || 0;
    rep.now = now;

    // ---- the manager's signals, for the owner: her lead feedback, her day closes, her weekly report
    if (owner) {
      const recent = (x, days) => Date.now() - (Date.parse(x && x.at) || 0) < days * K.DAY;
      const yday = C.addDay(today, -1);
      const cl = (closes || []);
      rep.signals = {
        manager: employees.some((e) => e && e.role === 'manager' && e.active !== false),
        feedback: (fb || []).filter((x) => recent(x, 3)).slice(-6).reverse().map((x) => ({ id: x.id, at: x.at, city: x.city, level: x.level, label: LEVELS[x.level] || x.level, details: String(x.details || '').slice(0, 160), by: first(x.byName) })),
        closes: cl.filter((x) => recent(x, 3)).slice(-8).reverse().map((x) => ({ id: x.id, at: x.at, city: x.city, date: x.date, cashDiff: x.cashDiff, cardDiff: x.cardDiff, fate: x.cashFate, deposited: x.deposited,
          off: Math.abs(Number(x.cashDiff) || 0) >= 1 || (x.cardDiff != null && Math.abs(Number(x.cardDiff) || 0) >= 1), by: first(x.byName) })),
        // a clinic whose day closes are kept, without yesterday's
        unclosed: K.CITIES.filter((c) => cl.some((x) => x.city === c && x.date < yday) && !cl.some((x) => x.city === c && x.date === yday)).map((c) => ({ city: c, date: yday })),
        report: ((reports || []).filter((x) => recent(x, 8)).slice(-1).map((x) => ({ id: x.id, at: x.at, week: x.week, to: x.to, problems: !!String(x.problems || '').trim(), by: first(x.byName) })))[0] || null,
      };
    }

    if (scope) {
      // no ads, no ad spend, no offers' costs, no signals; only her clinics
      rep.offers = { rows: [], spend: { ready: false, total: 0, unassigned: 0 } }; rep.ads = null;
      rep.cities.rows = rep.cities.rows.filter((c) => scope.includes(c.city)).map((c) => Object.assign(c, { spend: null, metaLeads: null, cost: null, roas: null }));
      rep.cities.unassignedSpend = null;
      rep.trend = (rep.trend || []).map((t) => Object.assign({}, t, { spend: 0 }));
      rep.alerts = (rep.alerts || []).filter((a) => a.kind !== 'ad');
      ['spend', 'cpl', 'perBooked', 'perCame', 'cpa', 'roas', 'metaLeads'].forEach((k) => { delete rep.summary[k]; if (rep.prev) delete rep.prev.summary[k]; });
      Object.keys(rep.summary.cities).forEach((c) => { if (!scope.includes(c)) delete rep.summary.cities[c]; else { rep.summary.cities[c].spend = null; rep.summary.cities[c].cpl = null; } });
      if (rep.prev) Object.keys(rep.prev.summary.cities).forEach((c) => { if (!scope.includes(c)) delete rep.prev.summary.cities[c]; else { rep.prev.summary.cities[c].spend = null; rep.prev.summary.cities[c].cpl = null; } });
      delete rep.signals;
      Object.keys(rep.rates || {}).forEach((k) => { if (k !== 'all' && !scope.includes(k)) delete rep.rates[k]; });
      rep.scope = scope;
    }
    rep.period = period;
    rep.adsState = ads.none ? 'none' : ads.error ? 'error' : 'ok';
    // Meta's own words (a Graph address, a token) never go to the page: a short sentence there, the rest in the log
    if (ads.error) require('./_lib/meta-error').log('kpi ads', ads.error);
    rep.adsError = ads.error ? require('./_lib/meta-error').ui(ads.error) : '';
    rep.adsAt = ads.readAt || 0;
    rep.adsStale = !!ads.stale;
    const tCalc = Date.now() - t1;
    res.setHeader('Server-Timing', 'data;dur=' + tData + ', meta;dur=' + (owner ? tMeta : 0) + ', calc;dur=' + tCalc + ', total;dur=' + (Date.now() - t0));
    res.status(200).json(rep);
  } catch (err) {
    console.error('kpi error:', err.message);
    res.status(500).json({ error: 'failed' });
  }
};
