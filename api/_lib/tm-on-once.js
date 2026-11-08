// Once (the owner, 8.11: the Timișoara ads with a return, back on, each at the budget he set): the seven ads that
// brought money in Timișoara, found by their ad (two campaigns share a name), each with its ad set and campaign switched
// on and its daily budget set. Nothing else in those campaigns is touched. Run by the automations' clock and the
// portal's pulse; Meta's call limit or a refusal: tried again the next hour, for three days. What Meta says afterwards
// is kept in data/tm-on-once.json and shown (names and states only) by the public clock status.

const { readJSON, writeJSON } = require('./store');
const { loadConnection } = require('./facebook');
const M = require('./meta-ads');

const KEY = 'data/tm-on-once.json';
const DAY = '2026-11-08';
const ADS = [
  { ad: '120251505898860103', name: 'TM LIPO · fără efort', daily: 50 },
  { ad: '120251401215780103', name: 'TM HIFU G · sezon', daily: 50 },
  { ad: '120251585545250103', name: 'TM VIDEO · HIFU gușă · iPad', daily: 58 },
  { ad: '120251418156010103', name: 'tm vid 3 lipo 09.09 - copie', daily: 70 },
  { ad: '120251418279710103', name: 'TM RESTART · fără ace', daily: 50 },
  { ad: '120251400890900103', name: 'TM HIFU G · hifu gușă', daily: 50 },
  { ad: '120251401189560103', name: 'TM HIFU G · prețul cu motiv', daily: 50 },
];
const RATE = /limit|too many|\(cod (4|17|32|613|80004)\b/i;
const errOf = (j) => { const e = (j && j.error) || {}; return String(e.error_user_msg || e.message || 'eroare') + (e.code ? ' (cod ' + e.code + (e.error_subcode ? '/' + e.error_subcode : '') + ')' : ''); };

async function one(conn, a) {
  const tok = conn.userToken;
  const r = await M.call('GET', '/' + a.ad, tok, { fields: 'campaign_id,adset_id,status,effective_status' });
  if (!r.ok) return { error: errOf(r.j) };
  const camp = String(r.j.campaign_id || ''), set = String(r.j.adset_id || '');
  const b = await M.budgetOf(conn, camp);
  if (b.error) return { error: 'buget: ' + b.error };
  if (Math.round(b.daily * 100) !== Math.round(a.daily * 100)) {
    const x = await M.act(conn, { action: 'budget', id: b.id, daily: a.daily });
    if (x.error) return { error: 'buget: ' + x.error };
  }
  for (const [id, cur] of [[a.ad, r.j.status], [set, null], [camp, null]]) {
    if (cur === 'ACTIVE') continue;
    const x = await M.act(conn, { action: 'status', id, status: 'ACTIVE' });
    if (x.error) return { error: 'pornire: ' + x.error };
  }
  const back = await M.call('GET', '/' + a.ad, tok, { fields: 'effective_status,campaign{effective_status,daily_budget},adset{effective_status,daily_budget}' });
  if (!back.ok) return { on: true, check: errOf(back.j) };
  const c = back.j.campaign || {}, s = back.j.adset || {};
  const daily = Number(c.daily_budget || s.daily_budget || 0) / 100;
  return { on: true, ad: back.j.effective_status, campaign: c.effective_status, adset: s.effective_status, daily };
}

async function run() {
  const st = Object.assign({ done: false, ads: {} }, (await readJSON(KEY, {})) || {});
  if (st.done) return { skipped: true };
  if (st.running && Date.now() - Date.parse(st.running) < 5 * 60e3) return { skipped: 'running' };
  st.running = new Date().toISOString();
  await writeJSON(KEY, st);
  try {
    const conn = await loadConnection(readJSON);
    if (!conn.userToken || !conn.adAccountId) return { skipped: 'not_connected' };
    for (const a of ADS) {
      if (st.ads[a.ad] && st.ads[a.ad].on) continue;
      const r = await one(conn, a).catch((e) => ({ error: String(e.message || e) }));
      st.ads[a.ad] = Object.assign({ name: a.name, want: a.daily, at: new Date().toISOString() }, r);
      await writeJSON(KEY, st);
      if (r.error && RATE.test(r.error)) break;
    }
    const left = ADS.filter((a) => !(st.ads[a.ad] && st.ads[a.ad].on));
    if (!left.length || Date.now() - Date.parse(DAY + 'T00:00:00+02:00') > 3 * 864e5) st.done = true;
    return { done: st.done, left: left.length };
  } finally {
    st.running = null;
    await writeJSON(KEY, st).catch(() => {});
  }
}

async function summary() {
  const st = (await readJSON(KEY, null).catch(() => null)) || {};
  return { done: !!st.done, ads: Object.values(st.ads || {}).map((x) => ({ name: x.name, on: !!x.on, ad: x.ad || '', campaign: x.campaign || '', daily: x.daily || 0, want: x.want, error: x.error || '' })) };
}

module.exports = { run, summary, KEY, ADS };
