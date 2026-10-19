// Meta limits how often an ad account may be read ("S-au înregistrat prea multe apeluri de la acest cont"). Every
// reading of the ads goes through here: the same numbers come from Meta at most once in a while for everyone (the
// portal's pages on every phone and computer, the KPI page, Creative), kept in the store. A change made from the portal
// (on / off, budget, edit, delete, publish) clears them. When Meta says no, the last numbers are shown, marked stale.
const { readJSON, writeJSON } = require('./store');

const VER = 'data/ads-cache/v.json';
const pathOf = (name) => 'data/ads-cache/' + String(name).replace(/[^\w.-]+/g, '_') + '.json';

async function cached(name, ttlMs, fn) {
  const v = ((await readJSON(VER, {}).catch(() => ({}))) || {}).v || 0;
  const hit = await readJSON(pathOf(name), null).catch(() => null);
  // readAt: when these numbers were read from Meta (a change made after it is laid over them, api/ads-manager.js)
  const at = (data, t) => (data && typeof data === 'object' && !Array.isArray(data) ? Object.assign({}, data, { readAt: t }) : data);
  if (hit && hit.v === v && Date.now() - hit.at < ttlMs) return at(hit.data, hit.at);
  const data = await fn();
  if (data && !data.error) {
    const t = Date.now();
    await writeJSON(pathOf(name), { v, at: t, data }, { quiet: true }).catch(() => {});
    return at(data, t);
  }
  // Meta refused (often: too many calls for now): the last numbers of the last 6 hours, marked
  if (hit && hit.data && Date.now() - hit.at < 6 * 3600e3) return Object.assign({}, hit.data, { stale: hit.at, readAt: hit.at });
  return data;
}

// after a change made from the portal: the next reading comes from Meta
async function clear() {
  const cur = ((await readJSON(VER, {}).catch(() => ({}))) || {}).v || 0;
  await writeJSON(VER, { v: cur + 1 }, { quiet: true });
}

// what was switched on / off from the portal (30 min): laid over every reading older than the switch, its ad sets and
// ads following (a paused campaign's ads show "CAMPAIGN_PAUSED"), until Meta's own reading catches up
const OVR = 'data/ads-cache/switched.json';
const LIVE = 30 * 60e3, GRACE = 60e3;
async function switched(id, status) {
  const o = ((await readJSON(OVR, {}).catch(() => ({}))) || {});
  const now = Date.now();
  Object.keys(o).forEach((k) => { if (now - o[k].at > LIVE) delete o[k]; });
  o[id] = { status, at: now };
  await writeJSON(OVR, o, { quiet: true }).catch(() => {});
}
const PAUSED = ['PAUSED', 'CAMPAIGN_PAUSED', 'ADSET_PAUSED'];
function effective(x, parentOn, parentLabel) {
  if (x.status === 'PAUSED') return 'PAUSED';
  if (!parentOn) return parentLabel;
  return !x.effective || PAUSED.includes(x.effective) ? 'ACTIVE' : x.effective; // in review, with issues… stay as Meta says
}
async function laySwitches(view) {
  if (!view || !Array.isArray(view.campaigns)) return view;
  const o = ((await readJSON(OVR, {}).catch(() => ({}))) || {});
  const read = view.readAt || 0, now = Date.now();
  // a reading from up to a minute after the switch may still carry Meta's old status: the switch wins there too
  const want = (id) => { const x = o[id]; return x && x.at + GRACE > read && now - x.at < LIVE ? x.status : null; };
  if (!Object.keys(o).some((id) => want(id))) return view;
  view.campaigns.forEach((c) => {
    const cw = want(c.id);
    if (cw) { c.status = cw; c.effective = effective(c, true, ''); }
    (c.adsets || []).forEach((s) => {
      const sw = want(s.id);
      if (sw) s.status = sw;
      if (cw || sw) s.effective = effective(s, c.status === 'ACTIVE', 'CAMPAIGN_PAUSED');
      (s.ads || []).forEach((a) => {
        const aw = want(a.id);
        if (aw) a.status = aw;
        if (cw || sw || aw) a.effective = effective(a, c.status === 'ACTIVE' && s.status === 'ACTIVE', c.status !== 'ACTIVE' ? 'CAMPAIGN_PAUSED' : 'ADSET_PAUSED');
      });
    });
  });
  return view;
}

module.exports = { cached, clear, switched, laySwitches };
