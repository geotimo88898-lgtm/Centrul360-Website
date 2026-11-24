// The ad account's money in lei (George, 21.11: Centrul360's ads moved to an ad account in CAD). Meta gives spend and
// budgets in the account's currency; every rule, price and report here is in lei. So what is read from Meta is turned
// into lei on the way in (meta-ads.js inLei) and a budget written to Meta is turned back into the account's currency
// (meta-ads.js cents). On a RON account the factor is 1 and nothing changes.
//   data/ads-fx.json { act, currency, rate (lei for 1 unit), date (the BNR's day), source, checked (Bucharest day), at }
// The currency is asked once a day; the rate is the BNR's of the day (else the ECB's), read again when the day changes,
// at most once an hour when neither answers; the last known rate stays meanwhile, else a cautious fallback.
const KEY = 'data/ads-fx.json';
const BNR = 'https://www.bnr.ro/nbrfxrates.xml';
const ECB = 'https://www.ecb.europa.eu/stats/eurofxref/eurofxref-daily.xml';
// known accounts and a fallback rate when the bank can't be read the first time (never 1 for a foreign currency: a
// factor of 1 on CAD would let 3 times more money go before a rule stops it)
const KNOWN = { act_1136609638911845: 'CAD', act_989208510351291: 'CAD' };
const FALLBACK = { CAD: 3.3, EUR: 5.0, USD: 4.6, RON: 1 };
const today = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Bucharest' }).format(new Date());

async function getText(url) {
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), 6000);
  try { const r = await fetch(url, { signal: ctl.signal }); return r.ok ? await r.text() : ''; } catch (e) { return ''; } finally { clearTimeout(t); }
}
// lei for 1 unit of `cur` in the BNR's XML (multiplier="100" for some currencies), else the ECB's cross rate
function bnrRate(xml, cur) {
  const m = new RegExp('<Rate currency="' + cur + '"(?:\\s+multiplier="(\\d+)")?[^>]*>([\\d.]+)</Rate>').exec(String(xml || ''));
  if (!m) return null;
  const n = Number(m[2]) / (Number(m[1]) || 1);
  return n > 0 ? n : null;
}
function ecbRate(xml, cur) {
  const get = (c) => Number((new RegExp("currency=['\"]" + c + "['\"]\\s+rate=['\"]([\\d.]+)['\"]").exec(String(xml || '')) || [])[1]);
  const ron = get('RON');
  if (!(ron > 0)) return null;
  if (cur === 'EUR') return ron;
  const other = get(cur);
  return other > 0 ? ron / other : null;
}
const sane = (cur, n) => (n && n > 0.01 && n < 100 ? Math.round(n * 10000) / 10000 : null);
async function fetchRate(cur) {
  const bnr = await getText(BNR);
  const b = sane(cur, bnrRate(bnr, cur));
  if (b) return { rate: b, date: (bnr.match(/<Cube date="(\d{4}-\d{2}-\d{2})"/) || [])[1] || '', source: 'BNR' };
  const ecb = await getText(ECB);
  const e = sane(cur, ecbRate(ecb, cur));
  return e ? { rate: e, date: (ecb.match(/time=['"](\d{4}-\d{2}-\d{2})['"]/) || [])[1] || '', source: 'BCE' } : null;
}

// lei for 1 unit of the account's money; 1 on a RON account. `call` = meta-ads call (GET /act?fields=currency).
async function factor(conn, call, store) {
  const act = conn && conn.adAccountId;
  if (!act) return 1;
  const { readJSON, writeJSON } = store || require('./store');
  const kept = (await readJSON(KEY, null).catch(() => null)) || {};
  const mine = kept.act === act ? kept : {};
  if (mine.currency && mine.checked === today() && (mine.currency === 'RON' || mine.rate)) return mine.currency === 'RON' ? 1 : mine.rate;
  if (mine.tryAt && Date.now() - Date.parse(mine.tryAt) < 3600e3 && mine.currency) return mine.currency === 'RON' ? 1 : (mine.rate || FALLBACK[mine.currency] || 1);
  let currency = mine.currency || KNOWN[act] || '';
  if (call && conn.userToken) {
    const r = await call('GET', '/' + act, conn.userToken, { fields: 'currency' }).catch(() => null);
    if (r && r.ok && r.j && /^[A-Z]{3}$/.test(String(r.j.currency || ''))) currency = r.j.currency;
  }
  if (!currency) return mine.rate || 1;
  if (currency === 'RON') { await writeJSON(KEY, { act, currency, rate: 1, checked: today(), at: new Date().toISOString() }, { quiet: true }).catch(() => {}); return 1; }
  const got = await fetchRate(currency);
  const doc = got ? { act, currency, rate: got.rate, date: got.date, source: got.source, checked: today(), at: new Date().toISOString() }
    : Object.assign({}, mine, { act, currency, rate: mine.rate || FALLBACK[currency] || null, tryAt: new Date().toISOString() });
  await writeJSON(KEY, doc, { quiet: true }).catch(() => {});
  return doc.rate || FALLBACK[currency] || 1;
}
// what the reports show: the account's currency and its rate
async function info(store) {
  const { readJSON } = store || require('./store');
  const k = (await readJSON(KEY, null).catch(() => null)) || {};
  return { currency: k.currency || 'RON', rate: k.currency === 'RON' || !k.currency ? 1 : k.rate || FALLBACK[k.currency] || 1, date: k.date || '', source: k.source || '' };
}

module.exports = { KEY, KNOWN, FALLBACK, factor, info, bnrRate, ecbRate };
