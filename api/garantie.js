// /api/garantie: the requests of „Politica de garanție și returnare” (the owner, 22.11): a package suspended, its sessions
// transferred or turned into credit, a refund, or the legal 14-day withdrawal for what was bought online.
//   POST (public, from our own pages: Origin, a hidden trap field, the consent box, a few tries per address)
//        { name, phone, city, kind, package, reason, consent, website, page, files: [{ name, type, data: data URL }] (≤ 3, ≤ 4 MB) }
//        → { ok, id }   saved in data/guarantee-requests.json (the files privately under garantie/<id>/), the admins told
//   GET  (an admin, or Claude's key) → { ok, requests: [...] } newest first: the simple list the team works from
// Nothing about a request is ever public.

const crypto = require('crypto');
const { readJSON, readJSONTagged, writeJSON, writeJSONIf, writeBinary } = require('./_lib/store');
const { normalizePhone } = require('./_lib/clients');

const KEY = 'data/guarantee-requests.json';
const KINDS = { suspendare: 'Suspendarea pachetului', transfer: 'Transferul ședințelor', credit: 'Credit pentru alte tratamente', returnare: 'Returnarea banilor', retragere: 'Retragere în 14 zile (cumpărat online)' };
const CITIES = ['Timișoara', 'Arad'];
const TYPES = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'image/heic': 'heic', 'image/heif': 'heif', 'application/pdf': 'pdf' };
const MAX_BYTES = 4 * 1024 * 1024;
const clip = (s, n) => String(s == null ? '' : s).replace(/[<>]/g, '').trim().slice(0, n);
const fold = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
const ourOrigin = (o) => !o || /^https:\/\/([\w-]+\.)?centrul360\.com$/.test(o) || /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(o);
const tries = new Map(); // ip → [times] (per warm instance)

async function list(req, res) {
  if (!require('./_lib/content').fromProducer(req)) { const s = await require('./_lib/auth').requireAdmin(req, res); if (!s) return; }
  const all = (await readJSON(KEY, [])) || [];
  res.setHeader('Cache-Control', 'no-store');
  res.status(200).json({ ok: true, requests: all.slice().sort((a, b) => String(b.at).localeCompare(String(a.at))) });
}

module.exports = async (req, res) => {
  try {
    if (req.method === 'GET') return await list(req, res);
    if (req.method !== 'POST') { res.status(405).json({ error: 'method_not_allowed' }); return; }
    if (!ourOrigin(String(req.headers.origin || ''))) { res.status(403).json({ error: 'forbidden' }); return; }
    const ip = String(req.headers['x-forwarded-for'] || '').split(',')[0].trim() || 'x';
    const now = Date.now();
    const mine = (tries.get(ip) || []).filter((t) => now - t < 30 * 60e3);
    if (mine.length >= 4) { res.status(429).json({ error: 'too_many' }); return; }
    tries.set(ip, mine.concat(now));
    if (tries.size > 5000) tries.clear();

    let b = req.body || {};
    if (typeof b === 'string') { try { b = JSON.parse(b); } catch (e) { b = {}; } }
    if (b.website) { res.status(200).json({ ok: true }); return; } // the trap: a bot filled the hidden field
    const name = clip(b.name, 100);
    const phone = normalizePhone(clip(b.phone, 30)) || clip(b.phone, 30);
    if (name.length < 2 || String(phone).replace(/\D/g, '').length < 9) { res.status(400).json({ error: 'missing_fields' }); return; }
    if (!KINDS[b.kind]) { res.status(400).json({ error: 'bad_kind' }); return; }
    if (!(b.consent === true || b.consent === 'true')) { res.status(400).json({ error: 'missing_consent' }); return; }
    const reason = clip(b.reason, 3000);
    if (reason.length < 5) { res.status(400).json({ error: 'missing_reason' }); return; }

    // the documents: images or PDFs, at most 3 and 4 MB in all, kept privately
    const id = crypto.randomUUID();
    const files = [];
    let total = 0;
    for (const f of (Array.isArray(b.files) ? b.files : []).slice(0, 3)) {
      const m = /^data:([\w/.+-]+);base64,(.+)$/.exec(String((f && f.data) || ''));
      if (!m || !TYPES[m[1]]) continue;
      const buf = Buffer.from(m[2], 'base64');
      total += buf.length;
      if (total > MAX_BYTES) break;
      const path = 'garantie/' + id + '/' + (files.length + 1) + '.' + TYPES[m[1]];
      await writeBinary(path, buf, m[1]);
      files.push({ path, name: clip(f.name, 80), type: m[1], bytes: buf.length });
    }

    const row = { id, at: new Date().toISOString(), status: 'nou', kind: b.kind, kindLabel: KINDS[b.kind], name, phone, city: CITIES.find((c) => fold(c) === fold(b.city)) || '',
      package: clip(b.package, 200), reason, files, page: clip(b.page, 120) };
    for (let i = 0; i < 4; i++) {
      const { data, etag } = await readJSONTagged(KEY, null);
      const all = Array.isArray(data) ? data : [];
      all.push(row);
      const ok = etag ? await writeJSONIf(KEY, all, etag) : (await writeJSON(KEY, all), true);
      if (ok) break;
      if (i === 3) throw new Error('could not save');
    }
    res.status(200).json({ ok: true, id });

    // the admins: in the bell and on their phones (the answer is due in 10 working days)
    try {
      const N = require('./_lib/notify');
      const store = { readJSON, writeJSON };
      await N.notifyMany(store, await N.adminIds(store), { kind: 'alert', tone: 'warn', go: 'pipeline', tag: 'garantie-' + id,
        title: 'CERERE ' + KINDS[b.kind].toUpperCase() + N.cityTag(row.city), text: name + (row.package ? ' · ' + row.package : '') + ' · răspuns în 10 zile lucrătoare' });
    } catch (e) { console.error('garantie notify:', e.message); }
  } catch (err) {
    console.error('garantie error:', err.message);
    if (!res.headersSent) res.status(500).json({ error: 'failed' });
  }
};
