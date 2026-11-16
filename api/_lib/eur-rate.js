// The euro in lei, as the BNR (Banca Națională a României) publishes it each working day, else the ECB's reference
// rate for RON the same day (the BNR site sometimes answers bots with a page instead of the XML) (the owner, 16.11:
// the rents in euro always at today's rate). Kept in data/eur-rate.json { rate, date, at }; read again once the day
// changes (Bucharest), at most once an hour when the BNR can't be reached; the last known rate stays meanwhile.
const URL = 'https://www.bnr.ro/nbrfxrates.xml';
const KEY = 'data/eur-rate.json';
const today = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Bucharest' }).format(new Date());

const ECB = 'https://www.ecb.europa.eu/stats/eurofxref/eurofxref-daily.xml';
async function getText(url) {
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), 6000);
  try { const r = await fetch(url, { signal: ctl.signal }); return r.ok ? await r.text() : ''; } catch (e) { return ''; } finally { clearTimeout(t); }
}
const sane = (x) => x && x.rate > 1 && x.rate < 20 ? x : null;
async function fetchBnr() {
  const xml = await getText(URL);
  const bnr = sane({ rate: Number((xml.match(/<Rate currency="EUR"[^>]*>([\d.]+)<\/Rate>/) || [])[1]), date: (xml.match(/<Cube date="(\d{4}-\d{2}-\d{2})"/) || [])[1] || '', source: 'BNR' });
  if (bnr) return bnr;
  const ecb = await getText(ECB);
  return sane({ rate: Number((ecb.match(/currency=['"]RON['"]\s+rate=['"]([\d.]+)['"]/) || [])[1]), date: (ecb.match(/time=['"](\d{4}-\d{2}-\d{2})['"]/) || [])[1] || '', source: 'BCE' });
}

// { rate, date } (date = the BNR's publishing day), or null when it was never read
async function eurToday(readJSON, writeJSON) {
  const kept = await readJSON(KEY, null);
  const fresh = kept && kept.rate && kept.checked === today();
  const tried = kept && kept.tryAt && Date.now() - Date.parse(kept.tryAt) < 3600e3;
  if (fresh || tried) return kept && kept.rate ? { rate: kept.rate, date: kept.date, source: kept.source || 'BNR' } : null;
  const got = await fetchBnr();
  const doc = got ? { rate: got.rate, date: got.date, source: got.source, checked: today(), at: new Date().toISOString() } : Object.assign({}, kept || {}, { tryAt: new Date().toISOString() });
  if (writeJSON) await writeJSON(KEY, doc, { quiet: true }).catch(() => {});
  return doc.rate ? { rate: doc.rate, date: doc.date, source: doc.source || 'BNR' } : null;
}

module.exports = { eurToday };
