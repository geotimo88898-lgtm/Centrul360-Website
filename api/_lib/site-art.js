// The shop's treatment pictures (the owner, 25.11: „ai un generator de imagini conectat, nu sta pe aceleași 3 poze”): one
// photoreal studio picture per treatment, a different woman and a different crop each time, made by Google's image model
// (Gemini, the owner's key in GEMINI_API_KEY) on a plain grey backdrop, so it can be cut out cleanly like the Black Friday
// cards (brand_asset/oferte/). Kept in the store (site-art/v<V>/<id>-<n>.jpg, every try); looked at by hand, cut out and only
// then published in brand_asset/tratamente/. Illustrative only: never a before/after (the results are only the clinic's photos).
// Plus a short silent „how it works” loop for the top treatments (Gemini Omni Flash, the video model of the same key).
//   make(id, extra)        generates that picture (one per call, up to two minutes), capped per version
//   image(id, n)           its bytes (the newest try when n is not given)
//   makeVideo(id, extra)   generates the 8 s loop (up to five minutes), capped per version
//   video(id)              its bytes (mp4)
const { readJSON, writeJSON, writeBinary, readBinary } = require('./store');

const V = 1;
const MAX = 60; // paid picture generations per version (21 treatments, about two tries each)
const VMAX = 10; // paid video generations per version (one test, then the six top sellers, a redo or two)
const KEY = 'data/site-art.json';
const MODEL = 'gemini-3-pro-image';
const VMODEL = 'gemini-omni-1.2-flash';
const USD = { image: 0.134, videoSecond: 0.07 }; // the list prices (2K picture; 720p video), for the report only
const VSEC = 8;
const path = (id, n) => 'site-art/v' + V + '/' + id + '-' + n + '.jpg';
const vpath = (id) => 'site-art/v' + V + '/' + id + '.mp4';
const STYLE = 'Photorealistic premium studio photograph for a high-end aesthetic clinic, shot on a medium-format camera with an 85mm lens, sharp focus. ' +
  'Soft, neutral, diffused studio light from a large softbox at front left with a gentle fill, no harsh shadows; true-to-life colour; ' +
  'natural real skin with visible fine pores and subtle texture (not plastic, not airbrushed, not waxy), healthy and well cared for. ' +
  'Elegant, calm, tasteful and modest, like a luxury skincare campaign. ' +
  'Background: a completely plain, seamless, uniform mid-grey studio backdrop (#8a8a8a), evenly lit, no gradient, no vignette, no shadow on it, ' +
  'no props, no furniture, nothing else in the frame, with some of the plain backdrop visible around the subject so she can be cut out cleanly. ' +
  'Wardrobe only in matte black, charcoal or warm sand tones, no logos. Anatomically correct, natural proportions; any visible hand has exactly ' +
  'five natural fingers and short natural nails. No text, no letters, no logos, no watermark, no before/after, no split screen, no medical device, ' +
  'no tattoos, no jewellery, no piercings, no heavy makeup. ';
// each treatment: how she is framed, who she is, the aspect ratio. Every one a different woman (age 28-55, skin tone, hair, body) and crop
const ART = {
  liposonix: { ar: '4:5', t: 'Framing: a crop of the torso from just under the bust to the upper thighs, front three-quarter view; the face is not in the frame. Subject: a woman in her mid-thirties with warm medium-tan skin and a natural, softly feminine waist (slim but real, not a fitness model), wearing a matte black sports bra (only its lower edge in frame) and matte black high-waist briefs; one relaxed hand rests lightly on the side of her waist.' },
  cavitatie: { ar: '4:5', t: 'Framing: a side-profile crop from the waist to just above the knees; the face is not in the frame. Subject: a woman around thirty with fair, lightly freckled skin and a natural curvy figure, standing in profile with one knee slightly forward, wearing matte black seamless high-waist briefs with a modest cut; smooth skin on the hip and the outer thigh. Arms out of the frame.' },
  ems: { ar: '4:5', t: 'Framing: a straight-on front crop from the lower chest to the hips; the face is not in the frame. Subject: an athletic woman around thirty-two with deep brown skin and a toned, defined abdomen (visible abdominal lines and obliques, strong but natural, not a bodybuilder), wearing a matte black sports bra and matte black high-waist leggings; arms relaxed along her sides, hands out of the frame.' },
  radiofrecventa: { ar: '4:5', t: 'Framing: a front three-quarter crop from the navel to just below the knees; the face is not in the frame. Subject: a woman in her late forties with light-medium skin and a soft, natural, womanly figure, standing with her weight on one leg and the hip slightly out, wearing a warm sand-coloured seamless high-waist brief and the lower edge of a sand-coloured top; firm smooth thighs; the fingertips of one hand rest on her upper thigh.' },
  'hifu-corp': { ar: '4:5', t: 'Framing: a front crop from just below the chin to the hips; the face is not in the frame. Subject: a woman around forty-eight with olive skin, a firm natural midriff and toned upper arms, wearing a charcoal sports bra and charcoal high-waist leggings, one arm raised with the hand resting behind her head (the hand hidden), showing the smooth underside of the upper arm and the flat abdomen.' },
  impachetare: { ar: '4:5', t: 'Framing: a side view from the bust line to mid-thigh; the face is not in the frame. Subject: a woman in her early fifties with fair skin, standing relaxed, her waist, hips and upper thighs wrapped snugly in wide, smooth, neatly overlapping white cotton spa body-wrap bands (a professional detox body wrap), a simple matte black bandeau top; arms relaxed, hands out of the frame.' },
  hifu: { ar: '4:5', t: 'Framing: a close side-profile crop from the lips to the collarbones, looking to the right; the eyes are out of the frame. Subject: a woman in her mid-forties with fair skin, a sharply defined jawline, a firm smooth neck and chin, the chin gently raised, dark brown hair pulled back (only its edge visible), bare shoulders with a thin matte black strap.' },
  'rf-sculpt-gusa': { ar: '4:5', t: 'Framing: a three-quarter close crop from just below the nose to the base of the neck. Subject: a woman in her late thirties with deep brown skin, a contoured jaw and a defined chin, natural lips softly closed, two fingertips of one hand gently tracing along her jawline toward the ear, the edge of a matte black off-shoulder top.' },
  biolifting: { ar: '4:5', t: 'Framing: a close three-quarter profile facing left, from just under the eye to just below the chin, the ear in the frame. Subject: a woman around thirty with light olive skin, a smooth lifted cheek and a soft clean jawline, glossy black hair tucked behind the ear, bare neck and shoulder.' },
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
  epilare: { ar: '3:4', t: 'Framing: an elegant side view of a pair of legs from the hip to the ankles, one knee gently bent in front of the other; the face and the feet are out of the frame. Subject: a woman in her late twenties with light olive skin, perfectly smooth, silky, hair-free legs with a soft healthy sheen, the edge of matte black briefs at the top of the frame.' },
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

const blank = () => ({ v: V, spent: 0, tries: {}, errors: [], busy: 0, vspent: 0, vseconds: 0, vdone: {}, vbusy: 0 });
async function load() { const d = await readJSON(KEY, null); return d && d.v === V ? Object.assign(blank(), d) : blank(); }
function findMedia(x, kind) {
  if (!x || typeof x !== 'object') return null;
  if (typeof x.data === 'string' && x.data.length > 1000 && (x.type === kind || String(x.mime_type || x.mimeType || '').startsWith(kind + '/'))) return x.data;
  if (kind === 'image' && x.inlineData && typeof x.inlineData.data === 'string') return x.inlineData.data;
  for (const k of Object.keys(x)) { const f = findMedia(x[k], kind); if (f) return f; }
  return null;
}
async function call(body, kind, ms) {
  const ac = new AbortController(), t = setTimeout(() => ac.abort(), ms);
  try {
    const r = await fetch('https://generativelanguage.googleapis.com/v1beta/interactions', {
      method: 'POST', signal: ac.signal,
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': process.env.GEMINI_API_KEY },
      body: JSON.stringify(body),
    });
    const j = await r.json().catch(() => null);
    if (!r.ok) return { error: 'http ' + r.status + ': ' + String((j && j.error && j.error.message) || '').slice(0, 300), billed: false };
    const data = findMedia(j, kind);
    return data ? { bytes: Buffer.from(data, 'base64'), billed: true } : { error: 'no ' + kind + ' in the answer: ' + JSON.stringify(j || {}).slice(0, 300), billed: true };
  } catch (e) {
    return { error: e.name === 'AbortError' ? 'timeout' : e.message, billed: e.name === 'AbortError' };
  } finally { clearTimeout(t); }
}
async function make(id, extra) {
  if (!ART[id]) return { error: 'unknown' };
  if (!process.env.GEMINI_API_KEY) return { error: 'no_key' };
  const d = await load();
  if (d.spent >= MAX) return { error: 'cap_reached', spent: d.spent };
  if (Date.now() - d.busy < 130000) return { error: 'busy' };
  d.busy = Date.now();
  await writeJSON(KEY, d, { quiet: true });
  const text = STYLE + ART[id].t + (extra ? ' ' + String(extra).slice(0, 600) : '');
  const out = await call({ model: MODEL, input: [{ type: 'text', text }],
    response_format: { type: 'image', mime_type: 'image/jpeg', aspect_ratio: ART[id].ar, image_size: '2K' } }, 'image', 125000);
  const d2 = await load(); // what changed while it ran (a video) stays
  const n = (d2.tries[id] || 0) + 1;
  if (out.bytes) { await writeBinary(path(id, n), out.bytes, 'image/jpeg'); d2.tries[id] = n; }
  if (out.billed) d2.spent++;
  if (out.error) d2.errors = d2.errors.concat(id + ': ' + out.error).slice(-10);
  d2.busy = 0;
  await writeJSON(KEY, d2, { quiet: true });
  return { ok: !!out.bytes, id, n: out.bytes ? n : 0, spent: d2.spent, max: MAX, error: out.error || '' };
}
async function image(id, n) {
  if (!ART[id]) return null;
  if (!n) { const d = await load(); n = d.tries[id] || 0; }
  return n ? readBinary(path(id, Number(n) || 0)) : null;
}
async function makeVideo(id, extra) {
  if (!VID[id]) return { error: 'unknown' };
  if (!process.env.GEMINI_API_KEY) return { error: 'no_key' };
  const d = await load();
  if (d.vspent >= VMAX) return { error: 'cap_reached', vspent: d.vspent };
  if (Date.now() - d.vbusy < 310000) return { error: 'busy' };
  d.vbusy = Date.now();
  await writeJSON(KEY, d, { quiet: true });
  const text = VSTYLE + VID[id] + (extra ? ' ' + String(extra).slice(0, 600) : '');
  const out = await call({ model: VMODEL, input: [{ type: 'text', text }], background: false, store: false,
    response_format: { type: 'video', aspect_ratio: '16:9', resolution: '720p', duration: VSEC + 's' } }, 'video', 300000);
  const d2 = await load();
  if (out.bytes) { await writeBinary(vpath(id), out.bytes, 'video/mp4'); d2.vdone[id] = new Date().toISOString(); }
  if (out.billed) { d2.vspent++; d2.vseconds += VSEC; }
  if (out.error) d2.errors = d2.errors.concat('video ' + id + ': ' + out.error).slice(-10);
  d2.vbusy = 0;
  await writeJSON(KEY, d2, { quiet: true });
  return { ok: !!out.bytes, id, bytes: out.bytes ? out.bytes.length : 0, vspent: d2.vspent, vmax: VMAX, error: out.error || '' };
}
const video = (id) => (VID[id] ? readBinary(vpath(id)) : Promise.resolve(null));
async function status() {
  const d = await load();
  return { v: V, spent: d.spent, max: MAX, tries: d.tries, ids: Object.keys(ART), vspent: d.vspent, vmax: VMAX, vseconds: d.vseconds,
    vdone: Object.keys(d.vdone), vids: Object.keys(VID), usd: Math.round((d.spent * USD.image + d.vseconds * USD.videoSecond) * 100) / 100, errors: d.errors };
}

module.exports = { V, ART, VID, make, image, makeVideo, video, status };
