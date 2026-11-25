// The shop's treatment pictures (the owner, 25.11: „ai un generator de imagini conectat, nu sta pe aceleași 3 poze”): one
// illustrative studio picture per treatment, in the look of the Black Friday cards' cut-outs (brand_asset/oferte/), made once
// by Google's image generator (Gemini, the owner's key in GEMINI_API_KEY) with that cut-out as the style reference. Kept in
// the store (site-art/v<V>/<id>.jpg); looked at by hand and only then published in brand_asset/tratamente/. Illustrative
// only: never a before/after (the results are only the clinic's real photos).
//   make(id)   generates that picture (one per call, up to a minute), capped per version
//   image(id)  its bytes
const { readJSON, writeJSON, writeBinary, readBinary } = require('./store');

const V = 1;
const MAX = 60; // paid generations per version (about 25 needed, a redo for some)
const KEY = 'data/site-art.json';
const MODEL = 'gemini-3-pro-image';
const path = (id) => 'site-art/v' + V + '/' + id + '.jpg';
const STYLE = 'Premium aesthetic-clinic advertising photo, photorealistic, editorial, like an Apple or Nike product ad. ' +
  'Match the reference image exactly in lighting, mood and colour grading: a pure near-black background (#0a0a0b), one soft warm key light, ' +
  'a subtle rose-gold rim light, natural realistic skin texture (not plastic, not retouched to wax). The subject sits in the right two thirds of a square frame ' +
  'and fades softly into the black background toward the left and bottom edges. Minimal, elegant, calm. Any device is generic and unbranded, white or chrome. ' +
  'No text, no letters, no logos, no watermark, no before/after split, no tattoos, no jewellery. ';
const ART = {
  liposonix: 'Subject: close-up of a slim woman\'s abdomen and waist in a black sports top, a sleek white ultrasound applicator resting flat on the lower abdomen, a faint warm glow where it touches the skin.',
  cavitatie: 'Subject: the side of a woman\'s waist, a round chrome ultrasound cavitation handpiece gliding on the skin with a faint warm glow.',
  ems: 'Subject: a toned woman\'s abdomen in black sports wear, a large flat white magnetic muscle-stimulation paddle strapped on the abdomen.',
  radiofrecventa: 'Subject: the back of a woman\'s thighs with smooth skin, a radiofrequency handpiece with a soft warm light gliding on the skin.',
  'hifu-corp': 'Subject: a woman\'s inner upper arm and side of the body, firm smooth skin, a slim white ultrasound wand pressed gently on the upper arm.',
  impachetare: 'Subject: a woman\'s legs lying relaxed, partly wrapped in warm white spa body-wrap bandages, a whisper of steam.',
  hifu: 'Subject: side profile of a woman from the lips to the neck, a defined jawline, a slim white ultrasound wand placed under the chin.',
  'rf-sculpt-gusa': 'Subject: a woman\'s profile from the lips to the neck, a defined chin, a small radiofrequency applicator with a warm glow gliding along the jawline.',
  biolifting: 'Subject: close-up of a woman\'s cheek and jaw, a small round radiofrequency probe touching the cheek with a soft rose glow.',
  'hifu-full-face': 'Subject: a woman\'s face in three-quarter view, eyes closed, serene, a slim white ultrasound wand resting on the cheekbone.',
  'biolifting-full-face': 'Subject: a woman\'s face, eyes closed, radiant firm skin, a small radiofrequency probe on the forehead with a warm glow.',
  'rf-sculpt-full-face': 'Subject: a woman lying on a treatment bed, face up, eyes closed, a gentle sculpting applicator on the cheekbone, a soft warm glow.',
  restart: 'Subject: a woman\'s face, eyes closed, glowing fresh hydrated skin with a soft clear sheen, a cotton headband.',
  'masaj-facial': 'Subject: a therapist\'s hands gently massaging a relaxed woman\'s face and neck, the woman\'s eyes closed, calm.',
  hidratare: 'Subject: close-up of a woman\'s cheek with dewy hydrated skin, a single drop of clear serum on the cheek.',
  antirid: 'Subject: close-up of a mature woman\'s eye area and cheek, smooth skin, a glass serum dropper nearby.',
  redness: 'Subject: close-up of a woman\'s calm, even-toned cheek with a thin layer of soothing clear gel.',
  'sebum-off': 'Subject: close-up of a woman\'s nose and cheek (T-zone), clear refined pores, a fresh matte finish.',
  microneedling: 'Subject: close-up of a sterile white microneedling pen gliding on a woman\'s cheek with a light serum sheen.',
  periocular: 'Subject: close-up of a woman\'s under-eye area, bright and smooth, a tiny precise white applicator near the lower eyelid.',
  'epilare-full-body': 'Subject: an elegant woman\'s long smooth legs in a side pose, perfectly smooth skin.',
  'epilare-axile': 'Subject: a woman with her arm raised, showing a perfectly smooth underarm, black sports top.',
  'epilare-picior': 'Subject: a white laser hair-removal handpiece with a cooling tip on a woman\'s smooth lower leg, a soft cool glow.',
  'epilare-zona': 'Subject: a white laser hair-removal handpiece with a cooling tip on a woman\'s smooth shoulder and back, a soft cool glow.',
};
const REF = { liposonix: 'liposonix', cavitatie: 'cavitatie', ems: 'liposonix', radiofrecventa: 'liposonix', 'hifu-corp': 'liposonix', impachetare: 'liposonix',
  hifu: 'hifu-gusa', 'rf-sculpt-gusa': 'hifu-gusa', biolifting: 'hifu-gusa', 'epilare-full-body': 'epilare', 'epilare-axile': 'epilare', 'epilare-picior': 'epilare', 'epilare-zona': 'epilare' };
const refOf = (id) => REF[id] || 'facial';

const blank = () => ({ v: V, spent: 0, done: {}, errors: [], busy: 0 });
async function load() { const d = await readJSON(KEY, null); return d && d.v === V ? Object.assign(blank(), d) : blank(); }
function findImage(x) {
  if (!x || typeof x !== 'object') return null;
  if (typeof x.data === 'string' && x.data.length > 1000 && (x.type === 'image' || /^image\//.test(x.mime_type || x.mimeType || ''))) return x.data;
  if (x.inlineData && typeof x.inlineData.data === 'string') return x.inlineData.data;
  for (const k of Object.keys(x)) { const f = findImage(x[k]); if (f) return f; }
  return null;
}
async function generate(text, ref) {
  const ac = new AbortController(), t = setTimeout(() => ac.abort(), 58000);
  try {
    const input = [{ type: 'text', text }].concat(ref ? [{ type: 'image', mime_type: 'image/webp', data: ref.toString('base64') }] : []);
    const r = await fetch('https://generativelanguage.googleapis.com/v1beta/interactions', {
      method: 'POST', signal: ac.signal,
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': process.env.GEMINI_API_KEY },
      body: JSON.stringify({ model: MODEL, input, response_format: { type: 'image', mime_type: 'image/jpeg', aspect_ratio: '1:1', image_size: '1K' } }),
    });
    const j = await r.json().catch(() => null);
    if (!r.ok) return { error: 'http ' + r.status + ': ' + String((j && j.error && j.error.message) || '').slice(0, 300), billed: false };
    const data = findImage(j);
    return data ? { img: Buffer.from(data, 'base64'), billed: true } : { error: 'no image in the answer', billed: true };
  } catch (e) {
    return { error: e.name === 'AbortError' ? 'timeout' : e.message, billed: e.name === 'AbortError' };
  } finally { clearTimeout(t); }
}
async function make(id, extra) {
  if (!ART[id]) return { error: 'unknown' };
  if (!process.env.GEMINI_API_KEY) return { error: 'no_key' };
  const d = await load();
  if (d.spent >= MAX) return { error: 'cap_reached', spent: d.spent };
  if (Date.now() - d.busy < 65000) return { error: 'busy' };
  d.busy = Date.now();
  await writeJSON(KEY, d, { quiet: true });
  let ref = null;
  try { const r = await fetch('https://www.centrul360.com/brand_asset/oferte/' + refOf(id) + '.webp?v=3'); if (r.ok) ref = Buffer.from(await r.arrayBuffer()); } catch (e) { /* no reference: the words alone */ }
  const out = await generate(STYLE + ART[id] + (extra ? ' ' + String(extra).slice(0, 400) : ''), ref);
  if (out.img) { await writeBinary(path(id), out.img, 'image/jpeg'); d.done[id] = new Date().toISOString(); }
  if (out.billed) d.spent++;
  if (out.error) d.errors = d.errors.concat(id + ': ' + out.error).slice(-10);
  d.busy = 0;
  await writeJSON(KEY, d, { quiet: true });
  return { ok: !!out.img, id, spent: d.spent, max: MAX, error: out.error || '' };
}
const image = (id) => (ART[id] ? readBinary(path(id)) : Promise.resolve(null));
async function status() { const d = await load(); return { v: V, spent: d.spent, max: MAX, done: Object.keys(d.done), ids: Object.keys(ART), errors: d.errors }; }

module.exports = { V, ART, make, image, status };
