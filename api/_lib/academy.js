// Traininguri (the "Academia"): what the team learns from, by role.
//   Vânzări      recepție: the call script and what happens after the call · cosmeticiană: the consultation,
//                the 4 offers, selling at the consultation and in the room (+ the offer calculator, practice cases)
//   Tratamente   recepție: what each treatment does, its benefits, what it combines with, how to say it on the phone
//                cosmeticiană: the full treatment sheets (steps, settings, contraindications), the combinations, the room
//   De printat   the client sheets, the same for everyone
// Manuals: academy-manuals.js + academy-extra.js (Consultația, tests, prices, sheets, cases, first-week paths).
// The owner edits everything in place (admin); saved edits live in config.academy (api/portal-config.js).

const crypto = require('crypto');
const X = require('./academy-extra');
const M = require('./academy-manuals');

const VERSION = 2;

// Everything the Traininguri tab starts with: the manuals (each chapter with its test), the list prices and offer
// rules of the calculator, the treatment sheets, combinations, cases and first-week paths.
function defaultAcademy() {
  const manuals = [M.APEL, M.PROGRAMARE, X.CONSULTATIE, M.VANZARI, M.CABINA].map((m) => JSON.parse(JSON.stringify(m)));
  manuals.forEach((m) => m.chapters.forEach((c) => { c.media = []; c.quiz = JSON.parse(JSON.stringify(X.QUIZ[c.id] || [])); }));
  return Object.assign({ v: VERSION, manuals }, JSON.parse(JSON.stringify({ prices: X.PRICES, rules: X.RULES, schemes: X.SCHEMES, combos: X.COMBOS, cases: X.CASES, paths: X.PATHS })));
}

// The first version's chapters, by a fingerprint of their text: a saved chapter that still matches it was never
// edited, so it takes the new text; one the owner edited keeps hers.
const V1 = {"v-mentalitate":"6016e6054374","v-consultatie":"976255bdf890","v-intrebari":"74e3d905dad8","v-pret":"87a561eff6e8","v-obiectii":"a010cb436458","v-inchidere":"ed6e16ccbaea","v-pachete":"f7a0cc2d6c53","v-recomandari":"4c4c13cb31bf","v-reguli":"e58232e1d3b9","p-5min":"c0cee0714ac1","p-telefon":"797bd908fdbb","p-programare":"cbd2be4189f6","p-confirmari":"4e1c525f842c","p-anulari":"c08c1b9de349","p-revenire":"471e54f44cec","p-mesaje":"3e60e83de8d9","c-inainte":"4ff88d5e0b88","c-explici":"210594b788b6","c-protocol":"c96e5c364161","c-vanzare":"e65aa2dca4b5","c-dupa":"915140928fbd","c-igiena":"096eb6a7d4df"};
const fingerprint = (c) => crypto.createHash('sha1').update(JSON.stringify([c.title, c.summary || '', c.body || []])).digest('hex').slice(0, 12);

function upgrade(out, def) {
  const saved = new Map();
  out.manuals.forEach((m) => (m.chapters || []).forEach((c) => saved.set(c.id, { c, m: m.id })));
  const manuals = def.manuals.map((dm) => Object.assign({}, dm, { chapters: dm.chapters.map((dc) => {
    const s = saved.get(dc.id);
    if (!s) return dc;
    saved.delete(dc.id);
    const keep = { media: Array.isArray(s.c.media) && s.c.media.length ? s.c.media : dc.media };
    if (V1[dc.id] && fingerprint(s.c) !== V1[dc.id]) Object.assign(keep, { title: s.c.title, summary: s.c.summary || '', body: s.c.body || [] }, Array.isArray(s.c.quiz) ? { quiz: s.c.quiz } : {});
    return Object.assign({}, dc, keep);
  }) }));
  // chapters the owner added herself stay in their manual (a first-version chapter that was dropped doesn't)
  saved.forEach(({ c, m }) => { if (V1[c.id]) return; (manuals.find((x) => x.id === m) || manuals[0]).chapters.push(c); });
  out.manuals = manuals;
  out.v = VERSION;
}

// What the owner saved, completed with what came later: a manual added since, the test of a chapter that never
// had one (an emptied test stays empty), the newer parts as a whole, reception's fields of a treatment sheet.
function mergeAcademy(saved) {
  const def = defaultAcademy();
  if (!saved || !Array.isArray(saved.manuals)) return def;
  const out = JSON.parse(JSON.stringify(saved));
  if ((Number(out.v) || 1) < VERSION) upgrade(out, def);
  def.manuals.forEach((dm) => {
    const m = out.manuals.find((x) => x.id === dm.id);
    if (!m) { out.manuals.push(dm); return; }
    ['area', 'roles', 'icon'].forEach((k) => { if (m[k] == null) m[k] = dm[k]; });
    (m.chapters || []).forEach((c) => {
      if (!Array.isArray(c.quiz)) { const dc = dm.chapters.find((x) => x.id === c.id); c.quiz = dc ? dc.quiz : []; }
      if (!Array.isArray(c.media)) c.media = [];
    });
  });
  out.manuals.forEach((m) => { if (!m.area) m.area = 'vanzari'; if (!Array.isArray(m.roles) || !m.roles.length) m.roles = ['receptie', 'cosmetician']; });
  ['prices', 'schemes', 'combos', 'cases'].forEach((k) => { if (!Array.isArray(out[k])) out[k] = def[k]; });
  out.schemes.forEach((sc) => { const d = def.schemes.find((x) => x.id === sc.id); ['benefits', 'phone'].forEach((k) => { if (!Array.isArray(sc[k])) sc[k] = d ? d[k] : []; }); });
  if (!out.rules || typeof out.rules !== 'object') out.rules = def.rules;
  if (!out.paths || typeof out.paths !== 'object') out.paths = def.paths;
  ['receptie', 'cosmetician'].forEach((r) => { if (!Array.isArray(out.paths[r])) out.paths[r] = def.paths[r]; });
  return out;
}

// ------------------------------------------------------------------ cleaning what the owner saves
const GROUPS = ['fata', 'corp', 'epilare'];
const CITIES = ['both', 'tm', 'ar'];
const ID = /^[a-z0-9-]{1,40}$/;
const str = (v, n) => String(v == null ? '' : v).trim().slice(0, n);
const lines = (v, max, n) => (Array.isArray(v) ? v : String(v || '').split('\n')).map((x) => str(x, n || 600)).filter(Boolean).slice(0, max || 30);
const num = (v, lo, hi) => { const x = Number(String(v).replace(',', '.')); return Number.isFinite(x) ? Math.min(hi, Math.max(lo, x)) : lo; };
const newId = (p, i) => p + '-' + Date.now().toString(36) + (i || 0);
const pick = (v, list, d) => (list.includes(v) ? v : d);
const MEDIA = /^academy\/[\w-]{6,80}\.(jpg|png|webp|mp4|mov|webm|m4v)$/;
const cleanMedia = (v) => (Array.isArray(v) ? v : []).filter((x) => x && MEDIA.test(x.path)).slice(0, 12)
  .map((x, i) => ({ id: ID.test(x.id) ? x.id : newId('md', i), kind: /\.(mp4|mov|webm|m4v)$/.test(x.path) ? 'video' : 'image', path: x.path, caption: str(x.caption, 140) }));
const cleanQuiz = (v) => (Array.isArray(v) ? v : []).slice(0, 15).map((q) => {
  const options = (Array.isArray(q && q.options) ? q.options : []).map((o) => str(o, 200)).filter(Boolean).slice(0, 5);
  return { q: str(q && q.q, 300), options, answer: Math.min(options.length - 1, Math.max(0, Math.round(Number(q && q.answer) || 0))), why: str(q && q.why, 300) };
}).filter((q) => q.q && q.options.length >= 2);
const cleanChapter = (c, m, i) => ({
  id: ID.test(c && c.id) ? c.id : m.id.charAt(0) + '-' + Date.now().toString(36) + i,
  title: str(c && c.title, 120) || 'Capitol fără titlu',
  summary: str(c && c.summary, 300),
  body: lines(c && c.body, 200, 1200),
  media: cleanMedia(c && c.media),
  quiz: cleanQuiz(c && c.quiz),
});
const CLEAN = {
  price: (x, i) => ({ id: ID.test(x.id) ? x.id : newId('p', i), name: str(x.name, 100) || 'Procedură', group: pick(x.group, GROUPS, 'corp'), price: Math.round(num(x.price, 0, 100000)), city: pick(x.city, CITIES, 'both'), minutes: Math.round(num(x.minutes, 0, 600)) }),
  scheme: (x, i) => ({
    id: ID.test(x.id) ? x.id : newId('s', i), name: str(x.name, 80) || 'Tratament', group: pick(x.group, GROUPS, 'corp'), city: pick(x.city, CITIES, 'both'),
    minutes: Math.round(num(x.minutes, 0, 600)), prices: (Array.isArray(x.prices) ? x.prices : []).filter((p) => ID.test(p)).slice(0, 30), what: str(x.what, 600),
    forWho: lines(x.forWho), benefits: lines(x.benefits), phone: lines(x.phone), contra: lines(x.contra, 40), steps: lines(x.steps, 40), settings: lines(x.settings, 40), say: lines(x.say), after: lines(x.after),
    sessions: str(x.sessions, 40), interval: str(x.interval, 60), combos: (Array.isArray(x.combos) ? x.combos : []).filter((p) => ID.test(p)).slice(0, 12), media: cleanMedia(x.media), verified: !!x.verified,
  }),
  combo: (x, i) => ({ id: ID.test(x.id) ? x.id : newId('cb', i), a: ID.test(x.a) ? x.a : '', b: ID.test(x.b) ? x.b : '', why: str(x.why, 300), packs: str(x.packs, 200), sameDay: str(x.sameDay, 60), order: str(x.order, 140), gap: str(x.gap, 60), verified: !!x.verified }),
  case: (x, i) => {
    const options = (Array.isArray(x.options) ? x.options : []).map((o) => ({ text: str(o && o.text, 300), ok: !!(o && o.ok), why: str(o && o.why, 300) })).filter((o) => o.text).slice(0, 5);
    if (options.length && !options.some((o) => o.ok)) options[0].ok = true;
    return {
      id: ID.test(x.id) ? x.id : newId('caz', i), title: str(x.title, 140) || 'Caz nou', group: pick(x.group, GROUPS, 'corp'), city: pick(x.city, CITIES, 'both'),
      profile: lines(x.profile), wants: str(x.wants, 300), ask: lines(x.ask), options,
      program: (Array.isArray(x.program) ? x.program : []).filter((l) => l && ID.test(l.price)).slice(0, 12).map((l) => ({ price: l.price, sessions: Math.round(num(l.sessions, 0, 100) * 2) / 2, zone: str(l.zone, 60), interval: str(l.interval, 60) })),
      low: !!x.low, duration: str(x.duration, 60), result: str(x.result, 300), present: lines(x.present), watch: lines(x.watch), media: cleanMedia(x.media), verified: !!x.verified,
    };
  },
};
const LIST = { price: 'prices', scheme: 'schemes', combo: 'combos', case: 'cases' };
const REF = /^(m:[a-z0-9-]{1,40}\/[a-z0-9-]{1,40}|s:[a-z0-9-]{1,40}|[a-z0-9-]{1,40})$/;
const cleanPath = (days) => (Array.isArray(days) ? days : []).slice(0, 10).map((d, di) => ({
  title: str(d && d.title, 80) || 'Ziua ' + (di + 1),
  items: (Array.isArray(d && d.items) ? d.items : []).slice(0, 25).map((x, i) => ({
    id: /^[\w-]{1,24}$/.test(x && x.id) ? x.id : 'i' + Date.now().toString(36) + di + '-' + i,
    kind: pick(x && x.kind, ['read', 'quiz', 'case', 'task'], 'task'),
    ref: REF.test(x && x.ref) ? x.ref : '',
    text: str(x && x.text, 200),
  })).filter((x) => (x.kind === 'task' ? x.text : x.ref)),
}));

// Admin edits from the Traininguri tab, one part at a time:
//   { manualId, chapters:[{ id, title, summary, body[], media[], quiz[] }] }  that manual's chapters
//   { upsert: { kind: 'price'|'scheme'|'combo'|'case', item } }               add or replace one thing
//   { remove: { kind, id } }                                                    take one out
//   { prices: [...] }                                                           the whole list-price table
//   { rules: { bodyMin, faceMin, full, inst, parts } }                          the offer rules
//   { paths: { role: 'receptie'|'cosmetician', days:[{ title, items[] }] } }    a first-week path
function cleanAcademy(input, current) {
  const out = mergeAcademy(current);
  const b = input || {};
  const m = out.manuals.find((x) => x.id === b.manualId);
  if (m && Array.isArray(b.chapters)) m.chapters = b.chapters.slice(0, 40).map((c, i) => cleanChapter(c, m, i));
  if (b.upsert && LIST[b.upsert.kind] && b.upsert.item && typeof b.upsert.item === 'object') {
    const list = out[LIST[b.upsert.kind]];
    const item = CLEAN[b.upsert.kind](b.upsert.item, list.length);
    const at = list.findIndex((x) => x.id === item.id);
    if (at >= 0) list[at] = item; else list.push(item);
  }
  if (b.remove && LIST[b.remove.kind]) out[LIST[b.remove.kind]] = out[LIST[b.remove.kind]].filter((x) => x.id !== b.remove.id);
  if (Array.isArray(b.prices)) out.prices = b.prices.slice(0, 200).filter((x) => x && typeof x === 'object').map((x, i) => CLEAN.price(x, i));
  if (b.rules && typeof b.rules === 'object') {
    out.rules = { bodyMin: Math.round(num(b.rules.bodyMin, 0, 1e6)), faceMin: Math.round(num(b.rules.faceMin, 0, 1e6)), full: num(b.rules.full, 0, 90), inst: num(b.rules.inst, 0, 90), parts: Math.round(num(b.rules.parts, 1, 12)) };
  }
  if (b.paths && ['receptie', 'cosmetician'].includes(b.paths.role)) out.paths[b.paths.role] = cleanPath(b.paths.days);
  return out;
}

// What the team sees: only the sheets, combinations and cases the owner checked; the right answers
// of tests and cases stay on the server until she answers (a case she solved comes with its solution).
const SOLUTION = ['program', 'low', 'duration', 'result', 'present', 'watch'];
function forStaff(academy, mine) {
  const a = JSON.parse(JSON.stringify(academy));
  const solved = (mine && mine.cases) || {};
  a.manuals.forEach((m) => m.chapters.forEach((c) => { c.quiz = (c.quiz || []).map((q) => ({ q: q.q, options: q.options })); }));
  a.schemes = a.schemes.filter((s) => s.verified);
  const seen = new Set(a.schemes.map((s) => s.id));
  a.schemes.forEach((s) => { s.combos = s.combos.filter((id) => seen.has(id)); });
  a.combos = a.combos.filter((c) => c.verified && seen.has(c.a) && seen.has(c.b));
  a.cases = a.cases.filter((c) => c.verified).map((c) => {
    if (solved[c.id]) return c;
    const o = Object.assign({}, c, { options: c.options.map((x) => ({ text: x.text })) });
    SOLUTION.forEach((k) => delete o[k]);
    return o;
  });
  return a;
}

// a chapter, a sheet or a case by its reference ("m:vanzari/v-pret", "s:ems", "caz-gusa")
function findRef(academy, ref) {
  const r = String(ref || '');
  let x;
  if ((x = /^m:([a-z0-9-]+)\/([a-z0-9-]+)$/.exec(r))) { const m = academy.manuals.find((y) => y.id === x[1]); const c = m && m.chapters.find((y) => y.id === x[2]); return c ? { kind: 'chapter', manual: m, chapter: c } : null; }
  if ((x = /^s:([a-z0-9-]+)$/.exec(r))) { const s = academy.schemes.find((y) => y.id === x[1]); return s ? { kind: 'scheme', scheme: s } : null; }
  const c = academy.cases.find((y) => y.id === r);
  return c ? { kind: 'case', case: c } : null;
}

module.exports = { defaultAcademy, mergeAcademy, cleanAcademy, forStaff, findRef };
