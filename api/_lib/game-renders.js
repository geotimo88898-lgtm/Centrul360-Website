// Game Mode, the garage's cars as clean showroom renders: made once by Google's image generator (Gemini, the owner's
// key in GEMINI_API_KEY, his OK to spend a little) from the real photo of each car (game/img/<id>.webp), then its depth
// map (near = white) for the 3D in the garage. Kept in the portal's storage (game/renders/v<V>/<id>.png,
// <id>-depth.png); nothing is generated again unless V changes here.
//   step(origin)   makes the next missing image (one per call, a generation takes up to a minute); a capped number of
//                  paid generations per version, never more
//   image(name)    the bytes of a finished image, for /api/portal-game?img=<name>
//   ready()        { <id>: { src, depth } } of the cars whose render and depth are done, once LIVE

const { readJSON, writeJSON, writeBinary, readBinary } = require('./store');

const V = 1;
const LIVE = false; // the renders show in the game only after they were looked at
const IDS = ['m4', 'gt3rs', 'svj'];
const MAX = 9; // paid generations per version: 6 needed, 3 to redo a failed one
const KEY = 'data/game-renders.json';
const MODEL = 'gemini-3-pro-image';
const path = (name) => 'game/renders/v' + V + '/' + name + '.png';

const RENDER = 'Using the car in this photo as the exact reference (same make, model, generation, body kit, wheels, brake calipers and paint colour), ' +
  'create a clean high-end video game showroom render of it, like the car selection screen of Gran Turismo 7 or Forza Motorsport. ' +
  'Three-quarter front view from the front left, camera at headlight height, the whole car in frame and centred, with generous empty space around it. ' +
  'A dark minimal studio: a deep charcoal backdrop fading to near black with a very subtle purple tint, a polished dark floor with a soft clean reflection of the car, ' +
  'one large soft overhead light panel drawing long clean highlights along the bodywork, thin cool rim lights outlining the silhouette, a soft contact shadow under the tyres. ' +
  'Photoreal, razor sharp, perfectly clean paint, no noise. No text, no watermark, no logo overlay, no people, no other objects, a blank licence plate.';
const DEPTH = 'Turn this image into its depth map: grayscale only, the nearest parts white and the farthest black, smooth gradients, ' +
  'the car clearly separated from the background, the floor going from white at the bottom edge to dark at the back, the backdrop black. ' +
  'Exactly the same framing and composition, nothing added or removed.';

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

async function generate(prompt, img, mime) {
  const ac = new AbortController(), t = setTimeout(() => ac.abort(), 55000);
  try {
    const r = await fetch('https://generativelanguage.googleapis.com/v1beta/interactions', {
      method: 'POST', signal: ac.signal,
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': process.env.GEMINI_API_KEY },
      body: JSON.stringify({ model: MODEL, input: [{ type: 'text', text: prompt }, { type: 'image', mime_type: mime, data: img.toString('base64') }],
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
  if (!process.env.GEMINI_API_KEY) return { state: 'no_key', named: Object.keys(process.env).filter((k) => /GEMINI|GOOGLE|GAME_/.test(k)) };
  const next = IDS.map((id) => (!d.done[id] ? id : !d.done[id + '-depth'] ? id + '-depth' : null)).find(Boolean);
  const status = () => ({ v: V, live: LIVE, spent: d.spent, max: MAX, done: Object.keys(d.done), next: next || null, errors: d.errors.slice(-3) });
  if (!next) return Object.assign({ state: 'complete' }, status());
  if (d.spent >= MAX) return Object.assign({ state: 'cap_reached' }, status());
  if (Date.now() - d.busy < 70000) return Object.assign({ state: 'busy' }, status());
  d.busy = Date.now();
  await writeJSON(KEY, d, { quiet: true });
  const depth = next.endsWith('-depth'), id = next.replace(/-depth$/, '');
  let src, mime;
  if (depth) { src = await readBinary(path(id)); mime = 'image/png'; }
  else { const r = await fetch(origin + '/game/img/' + id + '.webp'); src = r.ok ? Buffer.from(await r.arrayBuffer()) : null; mime = 'image/webp'; }
  let out = src ? await generate(depth ? DEPTH : RENDER, src, mime) : { error: 'no source image', billed: false };
  if (out.png) { await writeBinary(path(next), out.png, 'image/png'); d.done[next] = new Date().toISOString(); }
  if (out.billed) d.spent++;
  if (out.error) d.errors = d.errors.concat(next + ': ' + out.error).slice(-10);
  d.busy = 0;
  await writeJSON(KEY, d, { quiet: true });
  return Object.assign({ state: out.png ? 'made' : 'failed', made: out.png ? next : null }, status());
}

const image = (name) => (IDS.some((id) => name === id || name === id + '-depth') ? readBinary(path(name)) : Promise.resolve(null));

async function ready() {
  if (!LIVE) return {};
  const d = await load(), out = {};
  IDS.forEach((id) => { if (d.done[id] && d.done[id + '-depth']) out[id] = { src: '/api/portal-game?img=' + id + '&v=' + V, depth: '/api/portal-game?img=' + id + '-depth&v=' + V }; });
  return out;
}

module.exports = { V, step, image, ready };
