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
  return { campaigns: out };
}

module.exports = { report };
