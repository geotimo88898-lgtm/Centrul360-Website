// /api/club-360: the waiting list of Clubul 360 (the owner, 21.11), from its page (v2/src/club-360.html). Only our own
// pages, a hidden trap field, a few tries per address. Who bought the Card de Sărbători online is on the list already
// (api/_lib/card-sarbatori.js); coming with her card's code, or with the phone of a card paid, she is marked as card holder.
//   POST { name, phone, city?, code?, consent, website } → { ok, place, holder, again }
//   POST { code } (only)                                  → { ok, holder } whether that code is a card paid (no name, no phone)

const { normalizePhone } = require('./_lib/clients');
const { readJSON } = require('./_lib/store');
const C = require('./_lib/card-sarbatori');

const clip = (s, n) => String(s == null ? '' : s).trim().slice(0, n);
const ourOrigin = (o) => !o || /^https:\/\/([\w-]+\.)?centrul360\.com$/.test(o) || /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(o);
const tries = new Map();
function limited(ip, max) {
  const now = Date.now();
  const mine = (tries.get(ip) || []).filter((t) => now - t < 10 * 60e3);
  if (mine.length >= max) return true;
  tries.set(ip, mine.concat(now));
  return false;
}

module.exports = async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  if (!ourOrigin(String(req.headers.origin || ''))) { res.status(403).json({ error: 'forbidden' }); return; }
  if (req.method !== 'POST') { res.status(405).json({ error: 'method_not_allowed' }); return; }
  try {
    let b = req.body || {};
    if (typeof b === 'string') { try { b = JSON.parse(b); } catch (e) { b = {}; } }
    const ip = String(req.headers['x-forwarded-for'] || '').split(',')[0].trim() || 'x';
    if (limited(ip, 12)) { res.status(429).json({ error: 'too_many' }); return; }
    const code = clip(b.code, 20).toUpperCase();
    if (!b.name && !b.phone) {
      const f = code ? C.findCard(await readJSON(C.KEY, []), code) : null;
      res.status(200).json({ ok: true, holder: !!(f && f.r.status === 'platit') });
      return;
    }
    if (b.website) { res.status(200).json({ ok: true }); return; }
    const name = clip(String(b.name || '').replace(/[<>"]/g, '').replace(/\s+/g, ' '), 100);
    let phone = normalizePhone(clip(b.phone, 30));
    if (/^7\d{8}$/.test(phone)) phone = '0' + phone;
    if (name.length < 2) { res.status(400).json({ error: 'missing_name' }); return; }
    if (!/^07\d{8}$/.test(phone) && !/^[1-9]\d{10,14}$/.test(phone)) { res.status(400).json({ error: 'bad_phone' }); return; }
    if (!(b.consent === true || b.consent === 'true' || b.consent === 'on')) { res.status(400).json({ error: 'missing_consent' }); return; }
    const city = ['Timișoara', 'Arad'].includes(b.city) ? b.city : '';
    const x = await C.clubAdd({ name, phone, city, code, source: 'site' });
    res.status(200).json({ ok: true, place: x.place, holder: !!x.row.holder, again: !!x.again });
  } catch (e) {
    console.error('club-360:', e.message);
    res.status(500).json({ error: 'failed' });
  }
};
