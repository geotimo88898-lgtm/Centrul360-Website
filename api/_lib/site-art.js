// The shop's treatment pictures (the owner, 25.11: „ai un generator de imagini conectat, nu sta pe aceleași 3 poze”): one
// photoreal studio picture per treatment, a different woman and a different crop each time, made by Google's image model
// (Gemini, the owner's key in GEMINI_API_KEY) on a plain grey backdrop, so it can be cut out cleanly like the Black Friday
// cards (brand_asset/oferte/). Kept in the store (site-art/v<V>/<id>-<n>.jpg, every try); looked at by hand, cut out and only
// then published in brand_asset/tratamente/. Illustrative only: never a before/after (the results are only the clinic's photos).
// Plus a short silent „how it works” loop for the top treatments (Veo 3.1). Both go to Vertex AI first (VERTEX_API_KEY, the
// GCP credit, like api/_lib/media-read.js), then to AI Studio (GEMINI_API_KEY) for the pictures. The keys only go in a header.
//   make(id, extra)               generates that picture (one per call, up to two minutes), capped per version
//   image(id, n)                  its bytes (the newest try when n is not given)
//   makeVideo(id, extra, model)   starts the 8 s loop (Veo, a long-running job), capped per version
//   pollVideo(id)                 asks how the loop is going; when it is ready, keeps it
//   video(id)                     its bytes (mp4)
const { readJSON, writeJSON, writeBinary, readBinary } = require('./store');

const V = 1;
const MAX = 60; // paid picture generations per version (21 treatments, about two tries each)
const VMAX = 10; // paid video generations per version (one test, then the six top sellers, a redo or two)
const KEY = 'data/site-art.json';
const MODEL = 'gemini-3-pro-image';
const VMODELS = { 'veo-3.1-generate-001': 0.4, 'veo-3.1-fast-generate-001': 0.15, 'veo-3.1-lite-generate-001': 0.05, 'gemini-omni-1.2-flash': 0.07 }; // USD a second, the upper list price
const VMODEL = 'veo-3.1-generate-001';
const USD_IMAGE = 0.134; // a 2K picture, the list price, for the report only
const VSEC = 8;
const path = (id, n) => 'site-art/v' + V + '/' + id + '-' + n + '.jpg';
const vpath = (id) => 'site-art/v' + V + '/' + id + '.mp4';
const STYLE = 'Photorealistic premium studio photograph for a high-end aesthetic clinic, shot on a medium-format camera with an 85mm lens, sharp focus. ' +
  'Soft, neutral, diffused studio light from a large softbox at front left with a gentle fill, no harsh shadows; true-to-life colour; ' +
  'natural real skin with visible fine pores and subtle texture (not plastic, not airbrushed, not waxy), healthy and well cared for. ' +
  'Elegant, calm, tasteful and modest, like a luxury skincare campaign. ' +
  'Background: a completely plain, seamless, uniform mid-grey studio backdrop (#8a8a8a), evenly lit, no gradient, no vignette, no shadow on it, ' +
  'no props, no furniture, no studio equipment (no softbox, no light stand, no flag), nothing else in the frame, with some of the plain backdrop visible around the subject so she can be cut out cleanly. ' +
  'Wardrobe only in matte black or charcoal (a knit top may be warm sand), never nude or skin-coloured underwear or swimwear, no logos. Anatomically correct, natural proportions; any visible hand has exactly ' +
  'five natural fingers and short natural nails. No text, no letters, no logos, no watermark, no before/after, no split screen, no medical device, ' +
  'no tattoos, no jewellery, no piercings, no heavy makeup. ';
// each treatment: how she is framed, who she is, the aspect ratio. Every one a different woman (age 28-55, skin tone, hair, body) and crop
const ART = {
  liposonix: { ar: '4:5', t: 'Framing: a crop of the torso from just under the bust to the upper thighs, front three-quarter view; the face is not in the frame. Subject: a woman in her mid-thirties with warm medium-tan skin and a natural, softly feminine waist (slim but real, not a fitness model), wearing a matte black sports bra (only its lower edge in frame) and matte black high-waist briefs; one relaxed hand rests lightly on the side of her waist.' },
  cavitatie: { ar: '4:5', t: 'Framing: a side view from the waist to just below the knees; the face is not in the frame. Subject: a woman around thirty with fair, lightly freckled skin and a natural curvy figure, the near leg slightly forward with the knee softly bent, one relaxed hand resting on the outer hip, wearing matte black high-waist cycling shorts that end high on the thigh and the lower edge of a matte black sports bra; firm, smooth, even skin on the outer thigh.' },
  ems: { ar: '4:5', t: 'Framing: a straight-on front crop from the lower chest to the hips; the face is not in the frame. Subject: an athletic woman around thirty-two with deep brown skin and a toned, defined abdomen (visible abdominal lines and obliques, strong but natural, not a bodybuilder), wearing a matte black sports bra and matte black high-waist leggings; arms relaxed along her sides, hands out of the frame.' },
  radiofrecventa: { ar: '4:5', t: 'Framing: a three-quarter rear view from the waist to just below the knees, she stands with her weight on one leg and the other knee relaxed; the face is not in the frame. Subject: a woman in her late forties with light-medium skin and a soft, natural, womanly figure, wearing matte charcoal high-waist seamless shorts that end high on the thigh (full coverage over the hips), firm smooth skin on the back and the side of the thighs; one hand rests lightly on the side of her hip.' },
  'hifu-corp': { ar: '4:5', t: 'Framing: a front crop from just below the chin to the hips; the face is not in the frame. Subject: a woman around forty-eight with olive skin, a firm natural midriff and toned upper arms, wearing a charcoal sports bra and charcoal high-waist leggings, one arm raised with the hand resting behind her head (the hand hidden), showing the smooth underside of the upper arm and the flat abdomen.' },
  impachetare: { ar: '4:5', t: 'Framing: a side view from the bust line to mid-thigh; the face is not in the frame. Subject: a woman in her early fifties with fair skin, standing relaxed, her waist, hips and upper thighs wrapped snugly in wide, smooth, neatly overlapping white cotton spa body-wrap bands (a professional detox body wrap), a simple matte black bandeau top; arms relaxed, hands out of the frame.' },
  hifu: { ar: '4:5', t: 'Framing: a close side-profile crop from the lips to the collarbones, looking to the right; the eyes are out of the frame. Subject: a woman in her mid-forties with fair skin, a sharply defined jawline, a firm smooth neck and chin, the chin gently raised, dark brown hair pulled back (only its edge visible), bare shoulders with a thin matte black strap.' },
  'rf-sculpt-gusa': { ar: '4:5', t: 'Framing: a three-quarter close crop from just below the nose to the base of the neck. Subject: a woman in her late thirties with deep brown skin, a contoured jaw and a defined chin, natural lips softly closed, two fingertips of one hand gently tracing along her jawline toward the ear, the edge of a matte black off-shoulder top.' },
  biolifting: { ar: '4:5', t: 'Framing: an extreme close-up of the lower face and neck, turned three-quarter to the right and tilted slightly up, cropped at the cheekbones so the eyes are NOT in the frame, down to the collarbone; the curve of the jaw from the chin to the ear is the hero. Subject: a woman around thirty with light olive skin, a smooth lifted cheek and a soft clean jawline, glossy black hair tucked behind the ear, a bare neck and shoulder.' },
  'hifu-full-face': { ar: '4:5', t: 'Framing: head and shoulders in a clean side profile facing left, the whole contour from the forehead over the cheekbone to the jaw and neck. Subject: a woman around fifty with light skin and soft natural expression lines, auburn shoulder-length hair tucked behind the ear, eyes open looking ahead, a firm lifted jawline, bare shoulders with a thin matte black strap.' },
  'biolifting-full-face': { ar: '4:5', t: 'Framing: head and shoulders, three-quarter view, the chin slightly raised. Subject: an East Asian woman in her mid-forties with smooth radiant skin, black hair in a sleek low bun, eyes gently closed, serene, a charcoal knit top with a wide neckline.' },
  'rf-sculpt-full-face': { ar: '4:5', t: 'Framing: head and bare shoulders, she looks back over her shoulder toward the camera, three-quarter view. Subject: a Mediterranean woman in her late thirties with olive skin, long dark wavy hair falling down her back, defined cheekbones and a smooth contoured face, a calm confident look, eyes open.' },
  restart: { ar: '4:5', t: 'Framing: front-facing head and shoulders, centred. Subject: a woman in her early thirties with light olive skin and dark brows, her hair wrapped up in a soft white towel turban, eyes closed, fresh luminous clean skin with a natural glow, no makeup, a white towel around her shoulders.' },
  'masaj-facial': { ar: '4:5', t: 'Framing: head and shoulders seen from above at a gentle angle, she lies face-up, deeply relaxed. Subject: a woman in her early thirties with medium-tan skin, light brown hair held back with a soft white spa headband, eyes closed, a peaceful expression, a white spa towel wrapped around her chest.' },
  hidratare: { ar: '4:5', t: 'Framing: a close-up of the face in three-quarter view from the forehead to the neck, the cheek prominent. Subject: a woman in her late twenties with fair, lightly freckled skin and strawberry-blonde hair in a loose bun, dewy, plump, deeply hydrated skin with a fresh glassy sheen, eyes open looking softly past the camera, the fingertips of one hand lightly touching her cheekbone.' },
  antirid: { ar: '4:5', t: 'Framing: head and shoulders, three-quarter view, a soft warm closed-mouth smile. Subject: an elegant woman in her mid-fifties with fair skin, short silver-blonde hair, natural soft expression lines around the eyes, well-cared radiant smooth skin, eyes open looking at the camera, a sand-coloured knit top.' },
  redness: { ar: '4:5', t: 'Framing: a close-up of the face and neck in profile facing right, from the forehead to the collarbone. Subject: a woman in her mid-thirties with very fair porcelain skin and light brown hair in a low ponytail, a calm, even skin tone with no redness on the cheek or nose, eyes gently lowered, serene.' },
  'sebum-off': { ar: '4:5', t: 'Framing: front-facing head and neck, the T-zone (forehead, nose, chin) in sharp focus. Subject: a woman in her late twenties with deep brown skin and short natural coily hair, clear balanced skin with a fresh soft-matte finish and refined pores (no shine on the nose), eyes open looking at the camera, calm and confident, a black crew-neck top.' },
  microneedling: { ar: '4:5', t: 'Framing: head and shoulders seen slightly from below, the face tilted up, three-quarter view. Subject: a woman around forty with medium-tan skin and dark hair slicked straight back, eyes closed, a smooth, even, refined skin texture with a light healthy sheen, a charcoal wrap top.' },
  periocular: { ar: '4:5', t: 'Framing: a close-up of the upper half of the face in three-quarter profile facing left, from the hairline to just below the nose, the eye and its outer corner at the centre. Subject: a woman in her early forties with light-medium skin and hazel eyes, the eye open and bright, natural lashes and brows, smooth firm skin under the eye and at the outer corner (no puffiness, no dark circles), minimal natural makeup, light brown hair pulled back.' },
  epilare: { ar: '3:4', t: 'Framing: a front three-quarter view of a pair of long legs from the hips to just above the ankles, she stands with one knee bent forward across the other; the face, the hands and the feet are out of the frame. Subject: a woman in her late twenties with light olive skin, perfectly smooth, silky, hair-free legs with a soft healthy sheen (no visible pores, no follicles, no stubble), wearing matte black high-waist cycling shorts that end high on the thigh.' },
};

// the „how it works” loops: a clean 3D visualisation, no person, no result, no text
const VSTYLE = 'A clean, elegant, photoreal 3D medical visualisation for a premium aesthetic clinic, one continuous 8-second shot that loops seamlessly ' +
  '(the last frame matches the first). Soft studio lighting on a dark neutral background, warm white and rose-gold accents, slow smooth camera drift. ' +
  'Calm, minimal, precise, like an Apple product film. No people, no faces, no before/after, no text, no labels, no numbers, no logos. ' +
  'Silent: no music, no voice, no sound effects. ';
const VID = {
  liposonix: 'A cross-section of skin seen from the side as soft translucent layers: a thin warm-beige skin surface, the dermis, and below it a layer of round golden fat cells. A sleek white ultrasound applicator rests on the skin surface and sends a narrow, precisely focused cone of soft light pulses that converge at one point deep in the fat layer; where they meet, the fat cells glow warm, then slowly shrink and fade, while the skin surface above stays calm and untouched.',
  hifu: 'A side cross-section of the area under the chin as soft translucent layers: skin, a thin fat layer and the deep supporting layer (SMAS). Fine, precise points of focused ultrasound light appear one by one in a neat row at the deep layer, each a tiny warm dot; around them the fibres slowly tighten and the layers lift gently upward, the skin surface stays smooth.',
  'rf-sculpt-gusa': 'A side cross-section of the skin under the jaw as soft translucent layers. A smooth white radiofrequency applicator glides slowly across the surface; soft waves of warm rose-gold heat spread evenly into the deeper layers, the collagen fibres (fine translucent strands) glow, then tighten and become denser and more ordered.',
  epilare: 'A close macro cross-section of skin with a few hair follicles shown as fine dark roots. A cool white laser handpiece passes above; brief soft pulses of light travel down each hair shaft to its root, the roots glow warm for an instant and then fade away, the skin surface stays cool and calm, a light cooling mist on the surface.',
  ems: 'A stylised translucent view of the abdominal muscles as smooth layered fibres. A flat white applicator rests on top; rhythmic waves of soft electromagnetic light pass through the tissue and the muscle fibres contract and relax in a strong, steady rhythm, each contraction glowing warmly.',
  cavitatie: 'A cross-section of skin with a layer of round golden fat cells. A round chrome ultrasound head glides on the surface; soft circular sound waves ripple down into the fat layer, tiny bubbles form gently between the fat cells and the cells slowly soften and release, the skin surface stays smooth.',
  biolifting: 'A cross-section of facial skin as soft translucent layers with fine collagen strands. A small round radiofrequency probe glides on the surface; a gentle warm rose-gold glow spreads evenly into the dermis, the collagen strands warm up, tighten and line up, and the surface becomes smoother and firmer.',
};

const blank = () => ({ v: V, spent: 0, tries: {}, errors: [], busy: 0, via: {}, vspent: 0, vusd: 0, vops: {}, vdone: {}, vbase: '' });
async function load() { const d = await readJSON(KEY, null); return d && d.v === V ? Object.assign(blank(), d) : blank(); }
const note = (d, s) => { d.errors = d.errors.concat(String(s).slice(0, 400)).slice(-12); };
function providers() {
  const out = [];
  if (process.env.VERTEX_API_KEY) out.push({ name: 'vertex', key: process.env.VERTEX_API_KEY, base: 'https://aiplatform.googleapis.com/v1/publishers/google/models/' });
  if (process.env.GEMINI_API_KEY) out.push({ name: 'studio', key: process.env.GEMINI_API_KEY, base: 'https://generativelanguage.googleapis.com/v1beta/models/' });
  return out;
}
async function post(url, key, body, ms) {
  const ac = new AbortController(), t = setTimeout(() => ac.abort(), ms);
  try {
    const r = await fetch(url, { method: 'POST', signal: ac.signal, headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key }, body: JSON.stringify(body) });
    const text = await r.text();
    let j = null; try { j = JSON.parse(text); } catch (e) { /* not json */ }
    return { status: r.status, ok: r.ok, j, text };
  } catch (e) {
    return { status: 0, ok: false, j: null, text: e.name === 'AbortError' ? 'timeout' : e.message, timeout: e.name === 'AbortError' };
  } finally { clearTimeout(t); }
}
// one picture: Vertex first, AI Studio when Vertex refuses (no credit, not enabled)
async function picture(text, ar) {
  const body = { contents: [{ role: 'user', parts: [{ text }] }], generationConfig: { responseModalities: ['TEXT', 'IMAGE'], imageConfig: { aspectRatio: ar, imageSize: '2K' } } };
  const tried = [];
  for (const p of providers()) {
    const r = await post(p.base + MODEL + ':generateContent', p.key, body, 125000);
    if (r.timeout) return { error: p.name + ': timeout', billed: true, tried };
    if (!r.ok) { tried.push(p.name + ' ' + r.status + ': ' + r.text.replace(/\s+/g, ' ').slice(0, 220)); if ([401, 402, 403, 404, 429].includes(r.status)) continue; return { error: tried.join(' | '), billed: false }; }
    const parts = (r.j && r.j.candidates && r.j.candidates[0] && r.j.candidates[0].content && r.j.candidates[0].content.parts) || [];
    const img = parts.find((x) => x.inlineData || x.inline_data);
    if (!img) return { error: p.name + ': no image (' + ((r.j && r.j.candidates && r.j.candidates[0] && r.j.candidates[0].finishReason) || 'unknown') + ') ' + parts.map((x) => x.text || '').join(' ').slice(0, 200), billed: true, via: p.name };
    return { bytes: Buffer.from((img.inlineData || img.inline_data).data, 'base64'), billed: true, via: p.name };
  }
  return { error: tried.join(' | ') || 'no_key', billed: false };
}
async function make(id, extra) {
  if (!ART[id]) return { error: 'unknown' };
  if (!providers().length) return { error: 'no_key' };
  const d = await load();
  if (d.spent >= MAX) return { error: 'cap_reached', spent: d.spent };
  if (Date.now() - d.busy < 130000) return { error: 'busy' };
  d.busy = Date.now();
  await writeJSON(KEY, d, { quiet: true });
  const out = await picture(STYLE + ART[id].t + (extra ? ' ' + String(extra).slice(0, 600) : ''), ART[id].ar);
  const d2 = await load(); // what changed while it ran (a video) stays
  const n = (d2.tries[id] || 0) + 1;
  if (out.bytes) { await writeBinary(path(id, n), out.bytes, 'image/jpeg'); d2.tries[id] = n; }
  if (out.billed) { d2.spent++; d2.via[out.via || '?'] = (d2.via[out.via || '?'] || 0) + 1; }
  if (out.error) note(d2, id + ': ' + out.error);
  d2.busy = 0;
  await writeJSON(KEY, d2, { quiet: true });
  return { ok: !!out.bytes, id, n: out.bytes ? n : 0, via: out.via || '', spent: d2.spent, max: MAX, error: out.error || '' };
}
async function image(id, n) {
  if (!ART[id]) return null;
  if (!n) { const d = await load(); n = d.tries[id] || 0; }
  return n ? readBinary(path(id, Number(n) || 0)) : null;
}
// the loop: Veo 3.1 on Vertex, silent (no audio track is made), 16:9, 720p, 8 s; a long-running job asked about with pollVideo.
// Veo wants the Google Cloud project in the address: the key's own project, as Vertex names it when asked for a model that
// is not there (kept in the store, never in the code). Or Gemini Omni Flash on AI Studio (model gemini-omni-1.2-flash), in one go.
const VERTEX = 'https://aiplatform.googleapis.com/v1/';
async function vertexBase(d) {
  if (d.vbase) return d.vbase;
  const r = await post(VERTEX + 'publishers/google/models/no-such-model-c360:generateContent', process.env.VERTEX_API_KEY, { contents: [{ role: 'user', parts: [{ text: 'x' }] }] }, 30000);
  const m = /projects\/([\w-]+)\/locations\//.exec(r.text || '');
  if (!m) return '';
  d.vbase = 'https://us-central1-aiplatform.googleapis.com/v1/projects/' + m[1] + '/locations/us-central1/publishers/google/models/';
  return d.vbase;
}
async function makeVideo(id, extra, model) {
  if (!VID[id]) return { error: 'unknown' };
  const m = VMODELS[model] ? model : VMODEL;
  const d = await load();
  if (d.vspent >= VMAX) return { error: 'cap_reached', vspent: d.vspent };
  if (d.vops[id] && Date.now() - d.vops[id].at < 15 * 60e3) return { error: 'busy', op: { model: d.vops[id].model, at: d.vops[id].at } };
  const prompt = VSTYLE + VID[id] + (extra ? ' ' + String(extra).slice(0, 600) : '');
  if (/^gemini-omni/.test(m)) { // AI Studio, synchronous: the video comes back in the answer
    if (!process.env.GEMINI_API_KEY) return { error: 'no_key' };
    d.vops[id] = { model: m, at: Date.now() }; await writeJSON(KEY, d, { quiet: true });
    const r = await post('https://generativelanguage.googleapis.com/v1beta/interactions', process.env.GEMINI_API_KEY, { model: m, input: [{ type: 'text', text: prompt }],
      background: false, store: false, response_format: { type: 'video', aspect_ratio: '16:9', resolution: '720p', duration: VSEC + 's' } }, 290000);
    const d2 = await load(); delete d2.vops[id];
    const data = r.ok && findVideo(r.j);
    if (data) { await writeBinary(vpath(id), Buffer.from(data, 'base64'), 'video/mp4'); d2.vdone[id] = { at: new Date().toISOString(), model: m }; }
    if (r.ok || r.timeout) { d2.vspent++; d2.vusd = Math.round((d2.vusd + VSEC * VMODELS[m]) * 100) / 100; }
    const err = data ? '' : r.status + ' ' + String(r.text || '').replace(/\s+/g, ' ').slice(0, 300);
    if (err) note(d2, 'video ' + id + ': ' + err);
    await writeJSON(KEY, d2, { quiet: true });
    return { ok: !!data, id, model: m, done: true, error: err };
  }
  const key = process.env.VERTEX_API_KEY;
  if (!key) return { error: 'no_key' };
  const body = { instances: [{ prompt }],
    parameters: { aspectRatio: '16:9', durationSeconds: VSEC, resolution: '720p', generateAudio: false, sampleCount: 1, personGeneration: 'dont_allow',
      negativePrompt: 'text, letters, captions, watermark, logo, people, faces, hands, blood, needles, before and after' } };
  let base = VERTEX + 'publishers/google/models/';
  let r = await post(base + m + ':predictLongRunning', key, body, 60000);
  if (!r.ok && /RESOURCE_PROJECT_INVALID/.test(r.text || '')) {
    base = await vertexBase(d);
    if (base) r = await post(base + m + ':predictLongRunning', key, body, 60000);
  }
  const name = r.j && r.j.name;
  if (!r.ok || !name) { const e = r.status + ' ' + String(r.text || '').replace(/projects\/[\w-]+\//g, 'projects/…/').replace(/\s+/g, ' ').slice(0, 300); note(d, 'video ' + id + ': ' + e); await writeJSON(KEY, d, { quiet: true }); return { ok: false, id, error: e }; }
  d.vops[id] = { op: name, base, model: m, at: Date.now() };
  d.vspent++; d.vusd = Math.round((d.vusd + VSEC * VMODELS[m]) * 100) / 100;
  await writeJSON(KEY, d, { quiet: true });
  return { ok: true, id, started: true, model: m, vspent: d.vspent, vmax: VMAX };
}
function findVideo(x) {
  if (!x || typeof x !== 'object') return null;
  if (typeof x.bytesBase64Encoded === 'string') return x.bytesBase64Encoded;
  if (typeof x.encodedVideo === 'string') return x.encodedVideo;
  if (typeof x.data === 'string' && x.data.length > 1000 && (x.type === 'video' || /^video\//.test(x.mime_type || x.mimeType || ''))) return x.data;
  for (const k of Object.keys(x)) { const f = findVideo(x[k]); if (f) return f; }
  return null;
}
async function pollVideo(id) {
  const d = await load();
  const o = d.vops[id];
  if (!o) return { error: 'not_started', done: !!d.vdone[id] };
  if (!o.op) return { ok: true, id, done: false, seconds: Math.round((Date.now() - o.at) / 1000) };
  const r = await post((o.base || VERTEX + 'publishers/google/models/') + o.model + ':fetchPredictOperation', process.env.VERTEX_API_KEY, { operationName: o.op }, 60000);
  if (!r.ok) return { ok: false, id, error: r.status + ' ' + r.text.replace(/\s+/g, ' ').slice(0, 300) };
  if (!r.j || !r.j.done) return { ok: true, id, done: false, seconds: Math.round((Date.now() - o.at) / 1000) };
  const data = findVideo(r.j.response || r.j);
  const d2 = await load();
  delete d2.vops[id];
  if (data) { await writeBinary(vpath(id), Buffer.from(data, 'base64'), 'video/mp4'); d2.vdone[id] = { at: new Date().toISOString(), model: o.model }; }
  else note(d2, 'video ' + id + ': ' + JSON.stringify(r.j.error || r.j.response || r.j).slice(0, 300));
  await writeJSON(KEY, d2, { quiet: true });
  return { ok: !!data, id, done: true, error: data ? '' : JSON.stringify(r.j.error || r.j.response || {}).slice(0, 300) };
}
const video = (id) => (VID[id] ? readBinary(vpath(id)) : Promise.resolve(null));
async function status() {
  const d = await load();
  return { v: V, spent: d.spent, max: MAX, via: d.via, tries: d.tries, ids: Object.keys(ART), vspent: d.vspent, vmax: VMAX, vdone: d.vdone,
    vbusy: Object.keys(d.vops), vids: Object.keys(VID), usd: { images: Math.round(d.spent * USD_IMAGE * 100) / 100, videos: d.vusd }, errors: d.errors };
}

module.exports = { V, ART, VID, make, image, makeVideo, pollVideo, video, status };
