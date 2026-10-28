// A one-off look at the ads (26.10, the owner: stop what doesn't work, lower what is so-so, raise what works well):
// every running campaign with its budget, the last 7 and 30 days' spend and leads, and what those leads became
// (booked, came, paid). Read by the automations' clock; taken out once the decisions are made.

const { readJSON } = require('./store');
const { loadConnection } = require('./facebook');
const ads = require('./meta-ads');
const { funnel } = require('./ads-funnel');
const KPI = require('./kpi');

const day = (t) => new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Bucharest' }).format(new Date(t));
const r1 = (n) => Math.round(n * 10) / 10;

async function report() {
  const conn = await loadConnection(readJSON);
  if (!conn.userToken || !conn.adAccountId) return { error: 'not_connected' };
  const [v7, v30] = await Promise.all([ads.overview(conn, '7d'), ads.overview(conn, '30d')]);
  if (v7.error || v30.error) return { error: v7.error || v30.error };
  const [leads, appts, sales, stages] = await Promise.all([readJSON('data/leads.json', []), readJSON('data/appointments.json', []), readJSON('data/sales.json', []), readJSON('data/pipeline-stages.json', null)]);
  const appointments = (appts || []).filter((a) => a.createdBy !== 'highlevel' && !a.importedAt && !a.ghlId);
  const flatOf = (v) => { const out = []; v.campaigns.forEach((c) => c.adsets.forEach((s) => s.ads.forEach((a) => out.push({ id: a.id, name: a.name, adsetId: s.id, campaignId: c.id, campaignName: c.name })))); return out; };
  const first = day(KPI.cfg.start + 864e5);
  const rng = (d) => ({ since: day(Date.now() - (d - 1) * 864e5) < first ? first : day(Date.now() - (d - 1) * 864e5), until: day(Date.now()) });
  const st = Array.isArray(stages) && stages.length ? stages : [{ id: 'lead_nou', kind: 'open' }, { id: 'contactat', kind: 'open' }, { id: 'programare_stabilita', kind: 'booked' },
    { id: 'venit_la_programare', kind: 'open' }, { id: 'client_fidel', kind: 'won' }, { id: 'pierdut', kind: 'lost' }];
  const f7 = funnel({ leads, appointments, sales, stages: st, ads: flatOf(v7), range: rng(7) });
  const f30 = funnel({ leads, appointments, sales, stages: st, ads: flatOf(v30), range: rng(30) });
  const c30 = new Map(v30.campaigns.map((c) => [c.id, c]));
  const out = v7.campaigns.filter((c) => c.status === 'ACTIVE').map((c) => {
    const a = f7.campaigns.get(c.id) || {}, b = f30.campaigns.get(c.id) || {}, m = c30.get(c.id) || {};
    return { id: c.id, name: c.name, daily: c.daily, created: String(c.created || '').slice(0, 10),
      d7: { spend: Math.round(c.spend), leads: Math.max(c.leads, a.leads || 0), cpl: c.spend && Math.max(c.leads, a.leads || 0) ? r1(c.spend / Math.max(c.leads, a.leads || 0)) : null, booked: a.booked || 0, came: a.showed || 0 },
      d30: { spend: Math.round(m.spend || 0), leads: Math.max(m.leads || 0, b.leads || 0), booked: b.booked || 0, came: b.showed || 0, money: Math.round(b.revenue || 0) },
      ads: c.adsets.reduce((n, s) => n + s.ads.filter((x) => x.status === 'ACTIVE').length, 0) };
  });
  // the ones published lately that aren't running (in review, refused, paused)
  const recent = await ads.recentCampaigns(conn);
  const all = recent.ids ? await ads.overview(conn, '7d', null, recent.ids) : { campaigns: [] };
  const fresh = (all.campaigns || []).filter((c) => String(c.created || '') >= '2026-10-23' && c.status !== 'ACTIVE' || ['120251497422680103', '120251497570950103', '120251497423510103', '120251497737010103'].includes(c.id))
    .map((c) => ({ id: c.id, name: c.name, status: c.status, effective: c.effective, created: String(c.created || '').slice(0, 10), ads: c.adsets.flatMap((st) => st.ads.map((x) => ({ status: x.status, effective: x.effective, review: x.review }))) }));
  const slow = await Promise.all(out.filter((c) => c.daily >= 20 && c.d7.spend < 10 && c.created <= day(Date.now() - 864e5)).map(async (c) => ({ name: c.name, id: c.id, delivery: await ads.delivery(conn, c.id) })));
  return { campaigns: out, fresh, slow };
}

// The calendars, for planning the ads (28.10, the owner: "analizează calendarele, rata de prezentare e ~50%"): per
// clinic, the next 14 days (appointments, booked hours, the cosmeticians working, the HIFU ones), the same weekdays
// of the last 4 weeks for the usual load and opening hours, and how the last 30 days' appointments ended. Counts only.
async function calendar() {
  const [appts, emps] = await Promise.all([readJSON('data/appointments.json', []), readJSON('data/employees.json', [])]);
  const toMin = (t) => { const m = /^(\d{1,2}):(\d{2})/.exec(String(t || '')); return m ? +m[1] * 60 + +m[2] : null; };
  const dur = (a) => { const s = toMin(a.time), e = toMin(a.endTime); return s == null ? 0 : e != null && e > s ? e - s : 60; };
  const fold = (x) => String(x || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
  const kind = (a) => { const t = fold(a.treatment); return /hifu/.test(t) ? (/gus|barbie|gat/.test(t) ? 'hifu_gusa' : /abdom|burt|talie|corp|lipo/.test(t) ? 'hifu_abdomen' : 'hifu_alt') : /lipo/.test(t) ? 'liposonix' : (a.category || 'alt'); };
  const today = day(Date.now());
  const addDay = (d, n) => new Date(Date.parse(d + 'T12:00:00Z') + n * 864e5).toISOString().slice(0, 10);
  const wd = (d) => ['du', 'lu', 'ma', 'mi', 'jo', 'vi', 'sa'][new Date(d + 'T12:00:00Z').getUTCDay()];
  const out = {};
  for (const city of ['Timișoara', 'Arad']) {
    const staff = emps.filter((e) => e.active !== false && e.role === 'cosmetician' && e.location === city).map((e) => e.id);
    const mine = appts.filter((a) => a.location === city);
    const real = (a) => !a.block && a.status !== 'concediu';
    const next = [];
    for (let i = 0; i < 14; i++) {
      const d = addDay(today, i);
      const list = mine.filter((a) => a.date === d);
      const live = list.filter((a) => real(a) && a.status !== 'anulata');
      const off = new Set(list.filter((a) => a.status === 'concediu' && !a.time).map((a) => a.cosmeticianId));
      const kinds = {};
      live.forEach((a) => { const k = kind(a); kinds[k] = (kinds[k] || 0) + 1; });
      next.push({ d, wd: wd(d), appts: live.length, hours: Math.round(live.reduce((n, a) => n + dur(a), 0) / 6) / 10,
        blockedH: Math.round(list.filter((a) => a.block).reduce((n, a) => n + dur(a), 0) / 6) / 10, staff: staff.filter((id) => !off.has(id)).length,
        first: live.map((a) => a.time).filter(Boolean).sort()[0] || '', last: live.map((a) => a.endTime || a.time).filter(Boolean).sort().slice(-1)[0] || '', kinds });
    }
    // the last 4 weeks, per weekday: usual load and the hours the clinic works
    const past = {};
    for (let i = 1; i <= 28; i++) {
      const d = addDay(today, -i), w = wd(d);
      const live = mine.filter((a) => a.date === d && real(a) && a.status !== 'anulata');
      const p = past[w] = past[w] || { days: 0, appts: 0, hours: 0, first: [], last: [] };
      p.days++; p.appts += live.length; p.hours += live.reduce((n, a) => n + dur(a), 0) / 60;
      const t = live.map((a) => a.time).filter(Boolean).sort();
      if (t.length) { p.first.push(t[0]); p.last.push(live.map((a) => a.endTime || a.time).filter(Boolean).sort().slice(-1)[0]); }
    }
    Object.values(past).forEach((p) => { p.appts = Math.round(p.appts / p.days * 10) / 10; p.hours = Math.round(p.hours / p.days * 10) / 10; p.first = p.first.sort()[0] || ''; p.last = p.last.sort().slice(-1)[0] || ''; });
    // how the last 30 days' appointments ended (past ones): came (finalizată / încasată), cancelled, still open (no-show)
    const ended = { total: 0, came: 0, anulata: 0, open: 0 }, endedK = {};
    mine.filter((a) => real(a) && a.date >= addDay(today, -30) && a.date < today).forEach((a) => {
      const k = kind(a), e = endedK[k] = endedK[k] || { total: 0, came: 0, anulata: 0, open: 0 };
      const came = a.status === 'finalizata' || !!a.paidSaleId;
      [ended, e].forEach((x) => { x.total++; if (came) x.came++; else if (a.status === 'anulata') x.anulata++; else x.open++; });
    });
    // how long each kind takes
    const lens = {};
    mine.filter((a) => real(a) && a.date >= addDay(today, -60)).forEach((a) => { const k = kind(a); (lens[k] = lens[k] || []).push(dur(a)); });
    Object.keys(lens).forEach((k) => { const l = lens[k].sort((x, y) => x - y); lens[k] = { n: l.length, median: l[l.length >> 1] }; });
    out[city] = { staff: staff.length, next, past, ended, endedByKind: endedK, minutes: lens };
  }
  return out;
}

module.exports = { report, calendar };
