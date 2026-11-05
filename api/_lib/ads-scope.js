// Which campaigns of the ad account are Centrul360's. The account ("centru pls") is shared with Aranca Print and
// Brazi de Crăciun, whose admins take only the campaigns whose name starts with their prefix (ARANCA…, BRAZI…).
// Here, by default, every campaign that does NOT start with those prefixes; Admin → Reclame → Setări implicite can
// change the list, or keep only one prefix ("include"). Saved in data/ads-scope.json.
const KEY = 'data/ads-scope.json';
const DEFAULT = { exclude: ['ARANCA', 'BRAZI'], include: '' };

const up = (s) => String(s || '').trim().toUpperCase();
function clean(x) {
  const i = x || {};
  const list = (Array.isArray(i.exclude) ? i.exclude : String(i.exclude == null ? DEFAULT.exclude.join(',') : i.exclude).split(','))
    .map(up).filter(Boolean).map((p) => p.slice(0, 40));
  return { exclude: [...new Set(list)].slice(0, 10), include: up(i.include).slice(0, 40) };
}
const load = async (readJSON) => clean(await readJSON(KEY, null).catch(() => null) || DEFAULT);
// a campaign's name: kept or not
function keep(sc, name) {
  const s = sc || DEFAULT, n = up(name);
  if (s.include) return n.startsWith(s.include);
  return !(s.exclude || []).some((p) => p && n.startsWith(p));
}
const describe = (sc) => (sc.include ? 'Se iau campaniile al căror nume începe cu „' + sc.include + '”.'
  : sc.exclude.length ? 'Se iau campaniile al căror nume NU începe cu ' + sc.exclude.map((p) => '„' + p + '”').join(', ') + ' (acelea sunt ale celorlalte afaceri din același cont).' : 'Se iau toate campaniile contului.');

module.exports = { KEY, DEFAULT, clean, load, keep, describe };
