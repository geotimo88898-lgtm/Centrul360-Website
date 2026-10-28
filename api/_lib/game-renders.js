// Game Mode, the garage's cars: made once by Google's image generator (Gemini, the owner's key in GEMINI_API_KEY, his
// OK to spend a little) from the real photo of each car (game/img/<id>.webp), all from the same angle, in the colours
// the owner chose, on a plain studio background. They are kept in the portal's storage (game/renders/v<V>/<id>.png),
// then looked at, cut out of their background and published with the game (game/img/<id>-cut.webp), where the garage
// stands them in its showroom. Nothing is generated again unless V changes here.
//   step(origin)   makes the next missing car (one per call, a generation takes up to a minute); a capped number of
//                  paid generations per version, never more
//   image(name)    the bytes of a finished car, for /api/portal-game?img=<id>

const { readJSON, writeJSON, writeBinary, readBinary } = require('./store');

const V = 3;
const MAX = 6; // paid generations per version: 3 needed, 3 to redo one
const KEY = 'data/game-renders.json';
const MODEL = 'gemini-3-pro-image';
const path = (id) => 'game/renders/v' + V + '/' + id + '.png';

// the owner's colours (October 2026)
const PAINT = {
  m4: 'a subtle, very dark brown metallic paint leaning toward burgundy (deep brown-maroon, elegant, not red, not black); the rest of the car exactly as in the photo',
  gt3rs: 'gloss white paint with exposed carbon fibre details, like the Weissach package: a bare carbon fibre front bonnet, carbon roof, carbon mirror caps and a carbon rear wing; dark wheels',
  svj: 'a super clean matte grey paint (satin, flat, no gloss, like Lamborghini\'s Grigio Telesto matt) with red details: red brake calipers, thin red accents on the front splitter, side skirts and rear diffuser',
};
const prompt = (id) => 'Using the car in this photo as the exact reference (same make, model, generation, body kit, wheels design and proportions), ' +
  'make a studio product shot of it painted in ' + PAINT[id] + '. ' +
  'Front three-quarter view, the nose of the car pointing toward the lower right of the frame, so we see the front and the car\'s left side; ' +
  'camera slightly above headlight height, about 35 degrees off the car\'s axis, the whole car in frame, centred, filling about 85% of the width, the wheels straight. ' +
  'A plain seamless light grey studio background, soft even studio lighting with long clean highlights on the bodywork, no visible floor line, no reflections or shadows on the background. ' +
  'Ultra realistic, photoreal, razor sharp, perfectly clean paint. No text, no watermark, no logo overlay, no people, no other objects, a blank licence plate.';

const IDS = Object.keys(PAINT);
const blank = () => ({ v: V, spent: 0, done: {}, errors: [], busy: 0 });
async function load() { const d = await readJSON(KEY, null); return d && d.v === V ? Object.assign(blank(), d) : blank(); }

// the first base64 image anywhere in Google's answer (the Interactions API puts it in steps[].content[])
function findImage(x) {
  if (!x || typeof x !== 'object') return null;
  if (typeof x.data === 'string' && x.data.length > 1000 && (x.type === 'image' || /^image\//.test(x.mime_type || x.mimeType || ''))) return x.data;
  if (x.inlineData && typeof x.inlineData.data === 'string') return x.inlineData.data;
  for (const k of Object.keys(x)) { const f = findImage(x[k]); if (f) return f; }
  return null;
}

async function generate(text, img, mime) {
  const ac = new AbortController(), t = setTimeout(() => ac.abort(), 55000);
  try {
    const r = await fetch('https://generativelanguage.googleapis.com/v1beta/interactions', {
      method: 'POST', signal: ac.signal,
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': process.env.GEMINI_API_KEY },
      body: JSON.stringify({ model: MODEL, input: [{ type: 'text', text }, { type: 'image', mime_type: mime, data: img.toString('base64') }],
        response_format: { type: 'image', mime_type: 'image/png', aspect_ratio: '16:9', image_size: '2K' } }),
    });
    const j = await r.json().catch(() => null);
    if (!r.ok) return { error: 'http ' + r.status + ': ' + String((j && j.error && j.error.message) || '').slice(0, 300), billed: false };
    const data = findImage(j);
    return data ? { png: Buffer.from(data, 'base64'), billed: true } : { error: 'no image in the answer', billed: true };
  } catch (e) {
    return { error: e.name === 'AbortError' ? 'timeout' : e.message, billed: e.name === 'AbortError' };
  } finally { clearTimeout(t); }
}

async function step(origin) {
  const d = await load();
  if (!process.env.GEMINI_API_KEY) return { state: 'no_key' };
  const next = IDS.find((id) => !d.done[id]) || null;
  const status = () => ({ v: V, spent: d.spent, max: MAX, done: Object.keys(d.done), next, errors: d.errors.slice(-3) });
  if (!next) return Object.assign({ state: 'complete' }, status());
  if (d.spent >= MAX) return Object.assign({ state: 'cap_reached' }, status());
  if (Date.now() - d.busy < 70000) return Object.assign({ state: 'busy' }, status());
  d.busy = Date.now();
  await writeJSON(KEY, d, { quiet: true });
  const r = await fetch(origin + '/game/img/' + next + '.webp');
  const src = r.ok ? Buffer.from(await r.arrayBuffer()) : null;
  const out = src ? await generate(prompt(next), src, 'image/webp') : { error: 'no source image', billed: false };
  if (out.png) { await writeBinary(path(next), out.png, 'image/png'); d.done[next] = new Date().toISOString(); }
  if (out.billed) d.spent++;
  if (out.error) d.errors = d.errors.concat(next + ': ' + out.error).slice(-10);
  d.busy = 0;
  await writeJSON(KEY, d, { quiet: true });
  return Object.assign({ state: out.png ? 'made' : 'failed', made: out.png ? next : null }, status());
}

const image = (name) => (IDS.includes(name) ? readBinary(path(name)) : Promise.resolve(null));

module.exports = { V, step, image };
