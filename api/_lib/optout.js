// The people who asked us not to send them offers any more (the owner, 21.11: „șterge-o … să nu-i mai trimitem promoții,
// și vezi cine a mai zis”). One list for every campaign (the card's waves, „Transformarea 360”, the ones to come): by the
// last 9 digits of the phone. Her client file, visits and chat stay; only the offers stop. data/optout.json [{ k, at, why }]
const { readJSON, writeJSON } = require('./store');

const KEY = 'data/optout.json';
const d9 = (p) => String(p || '').replace(/\D/g, '').slice(-9);
const fold = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

async function all() { const x = await readJSON(KEY, []); return Array.isArray(x) ? x : []; }
async function set() { return new Set((await all()).map((x) => x.k)); }
async function add(phones, why) {
  const list = await all();
  const have = new Set(list.map((x) => x.k));
  let n = 0;
  (Array.isArray(phones) ? phones : [phones]).map(d9).filter((k) => k.length === 9).forEach((k) => {
    if (have.has(k)) return; have.add(k); n++;
    list.push({ k, at: new Date().toISOString(), why: String(why || '').slice(0, 120) });
  });
  if (n) await writeJSON(KEY, list);
  return { ok: true, added: n, total: list.length };
}
// what reads as „don't send me this any more”, in Romanian, with or without diacritics
function isStop(text) {
  const t = fold(text).replace(/[^\w\s]/g, ' ').replace(/\s+/g, ' ').trim();
  return /^(stop|dezabonare|dezabonez|unsubscribe)\b/.test(t) ||
    /nu (ma|mai) intereseaza|nu mai (trimiteti|trimite|vreau|doresc)|nu (vreau|doresc) (sa (mai )?primesc|mesaje|oferte|promotii)|sterge(ti)? ma|scoate(ti)? ma|nu ma mai (contactati|deranjati)|lasati ma|stop (mesaje|promotii)/.test(t);
}
module.exports = { KEY, all, set, add, isStop, d9 };
