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
  if (hit && hit.v === v && Date.now() - hit.at < ttlMs) return hit.data;
  const data = await fn();
  if (data && !data.error) {
    await writeJSON(pathOf(name), { v, at: Date.now(), data }, { quiet: true }).catch(() => {});
    return data;
  }
  // Meta refused (often: too many calls for now): the last numbers of the last 6 hours, marked
  if (hit && hit.data && Date.now() - hit.at < 6 * 3600e3) return Object.assign({}, hit.data, { stale: hit.at });
  return data;
}

// after a change made from the portal: the next reading comes from Meta
async function clear() {
  const cur = ((await readJSON(VER, {}).catch(() => ({}))) || {}).v || 0;
  await writeJSON(VER, { v: cur + 1 }, { quiet: true });
}

module.exports = { cached, clear };
