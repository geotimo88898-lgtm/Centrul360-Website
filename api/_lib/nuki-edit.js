// Nuki edits what the owner tells it (the owner, 8.11: „să poată Nuki să editeze ce îi zic”, e.g. the steps of a
// treatment), only with his tap: in the corner chat Nuki reads the content, proposes the change (as it is now and as it
// would be) and nothing is saved until the owner taps „Aplică” (his rule, 8.11: at first, everything Nuki does is with
// our approval or our own action). Admin only.
// What it can edit: Traininguri (the treatment sheets, the manuals' chapters, the cases), the same data and the same
// cleaning as the Traininguri editor (config.academy in data/config.json, api/_lib/academy.js).

const crypto = require('crypto');
const { readJSONTagged, writeJSONIf } = require('./store');
const { defaultConfig } = require('./defaults');
const A = require('./academy');

const CONFIG = 'data/config.json';
// the fields Nuki may change, with the editor's labels: [label, kind, max length]
const FIELDS = {
  scheme: {
    name: ['Tratamentul', 'text', 80], minutes: ['Durata (minute)', 'num'], sessions: ['Ședințe', 'text', 40], interval: ['Interval', 'text', 60],
    what: ['Ce e', 'text', 600], forWho: ['Pentru cine', 'lines'], benefits: ['Ce câștigă (pentru recepție)', 'lines'], phone: ['Cum o spune recepția la telefon', 'lines'],
    contra: ['Contraindicații', 'lines'], steps: ['Pașii', 'lines'], settings: ['Setările aparatului', 'lines'], say: ['Ce îi spui clientei', 'lines'], after: ['După tratament', 'lines'],
  },
  chapter: { title: ['Titlul', 'text', 120], summary: ['Pe scurt', 'text', 300], body: ['Conținutul', 'lines'] },
  case: {
    title: ['Titlul', 'text', 140], profile: ['Clienta', 'lines'], wants: ['Ce își dorește', 'text', 300], ask: ['Ce o întrebi', 'lines'],
    duration: ['Durata estimată', 'text', 60], result: ['Rezultatul estimat', 'text', 300], present: ['Cum îi prezinți', 'lines'], watch: ['La ce să fii atentă', 'lines'],
  },
};
const KIND = { scheme: 'Fișa de tratament', chapter: 'Capitolul', case: 'Cazul' };
const noDash = (s) => String(s == null ? '' : s).replace(/\s+[—–]\s+/g, ', ').replace(/[—–]/g, '-');

async function load() {
  const { data, etag } = await readJSONTagged(CONFIG, null);
  const config = data || defaultConfig();
  return { config, etag, academy: A.mergeAcademy(config.academy) };
}
function found(academy, ref) {
  const f = A.findRef(academy, ref);
  if (!f) return null;
  const item = f.scheme || f.chapter || f.case;
  const name = f.kind === 'chapter' ? f.manual.title + ' · ' + item.title : item.name || item.title;
  return { kind: f.kind, item, manual: f.manual, name };
}

// what Nuki sees of the training: one line per thing it can edit
async function index() {
  const { academy } = await load();
  const L = ['Fișele de tratament (ref s:<id>):'];
  academy.schemes.forEach((s) => L.push('- s:' + s.id + ' ' + s.name));
  L.push('Capitolele manualelor (ref m:<manual>/<capitol>):');
  academy.manuals.forEach((m) => (m.chapters || []).forEach((c) => L.push('- m:' + m.id + '/' + c.id + ' ' + m.title + ' · ' + c.title)));
  L.push('Cazurile (ref = id):');
  academy.cases.forEach((c) => L.push('- ' + c.id + ' ' + c.title));
  return L.join('\n');
}
// one thing as it is now, every field Nuki may change
async function view(ref) {
  const { academy } = await load();
  const f = found(academy, ref);
  if (!f) return { error: 'Nu găsesc „' + ref + '”. Folosește un ref din listă.' };
  const fields = {};
  Object.keys(FIELDS[f.kind]).forEach((k) => { fields[k] = { eticheta: FIELDS[f.kind][k][0], valoare: f.item[k] == null ? '' : f.item[k] }; });
  return { ref, tip: KIND[f.kind], nume: f.name, campuri: fields };
}

// a value as the editor would save it
function cleanValue(spec, v) {
  const [, kind, max] = spec;
  if (kind === 'num') { const x = Math.round(Number(String(v).replace(',', '.'))); return Number.isFinite(x) ? Math.min(600, Math.max(0, x)) : null; }
  if (kind === 'lines') {
    const list = (Array.isArray(v) ? v : String(v == null ? '' : v).split('\n')).map((x) => noDash(x).trim().slice(0, 1200)).filter(Boolean);
    return list.slice(0, 200);
  }
  return noDash(v).trim().slice(0, max || 600);
}
function cleanChanges(kind, changes) {
  const out = {};
  const spec = FIELDS[kind];
  Object.keys(changes || {}).forEach((k) => {
    if (!spec[k]) return;
    const v = cleanValue(spec[k], changes[k]);
    if (v !== null) out[k] = v;
  });
  return out;
}
const same = (a, b) => JSON.stringify(a == null ? '' : a) === JSON.stringify(b == null ? '' : b);
const print = (item, keys) => crypto.createHash('sha1').update(JSON.stringify(keys.map((k) => (item[k] == null ? '' : item[k])))).digest('hex').slice(0, 16);

// Nuki's proposal, checked: the fields that really change, as they are now and as they would be. Nothing is saved.
async function propose(input) {
  const { academy } = await load();
  const ref = String((input && input.ref) || '');
  const f = found(academy, ref);
  if (!f) return { error: 'Nu găsesc „' + ref + '”. Citește întâi lista și folosește un ref din ea.' };
  const asked = (input && input.campuri) || {};
  const bad = Object.keys(asked).filter((k) => !FIELDS[f.kind][k]);
  if (bad.length) return { error: 'La ' + KIND[f.kind].toLowerCase() + ' se pot schimba doar: ' + Object.keys(FIELDS[f.kind]).join(', ') + '. Nu: ' + bad.join(', ') + '.' };
  const changes = cleanChanges(f.kind, asked);
  Object.keys(changes).forEach((k) => { if (same(changes[k], f.item[k])) delete changes[k]; });
  const keys = Object.keys(changes);
  if (!keys.length) return { error: 'Nu se schimbă nimic față de ce e acum.' };
  if (f.kind === 'scheme' && keys.includes('name') && !changes.name) return { error: 'Tratamentul trebuie să aibă un nume.' };
  return {
    edit: {
      id: crypto.randomUUID().slice(0, 12), ref, kind: f.kind, what: KIND[f.kind], name: f.name, summary: noDash(String((input && input.rezumat) || '').trim().slice(0, 300)),
      fields: keys.map((k) => ({ key: k, label: FIELDS[f.kind][k][0], type: FIELDS[f.kind][k][1], before: f.item[k] == null ? '' : f.item[k], after: changes[k] })),
      changes, base: print(f.item, keys),
    },
  };
}

// the owner's „Aplică”: saved only while those fields are still as Nuki saw them (someone may have edited the sheet)
async function apply(input) {
  const ref = String((input && input.ref) || '');
  for (let i = 0; i < 5; i++) {
    const { config, etag, academy } = await load();
    const f = found(academy, ref);
    if (!f) return { status: 404, error: 'not_found', message: 'Nu mai găsesc ce voia Nuki să schimbe.' };
    const changes = cleanChanges(f.kind, input && input.changes);
    const keys = Object.keys(changes);
    if (!keys.length) return { status: 400, error: 'no_changes', message: 'Nu e nimic de aplicat.' };
    // a second tap (or the same change made by hand meanwhile): nothing left to do
    if (keys.every((k) => same(changes[k], f.item[k]))) return { ok: true, name: f.name, kind: f.kind, already: true };
    if (print(f.item, keys) !== String((input && input.base) || '')) return { status: 409, error: 'changed', message: 'S-a schimbat între timp. Cere-i lui Nuki din nou.' };
    Object.assign(f.item, changes);
    const edit = f.kind === 'chapter' ? { manualId: f.manual.id, chapters: f.manual.chapters } : { upsert: { kind: f.kind, item: f.item } };
    config.academy = A.cleanAcademy(edit, config.academy);
    if (await writeJSONIf(CONFIG, config, etag)) return { ok: true, name: f.name, kind: f.kind };
  }
  return { status: 503, error: 'busy', message: 'Nu am putut salva acum. Încearcă din nou.' };
}

// the two tools the corner chat gets for the owner (api/portal-nuki.js)
const TOOLS = [
  {
    name: 'citeste',
    description: 'Citește din Traininguri o fișă de tratament, un capitol sau un caz, exact cum e salvat acum (toate câmpurile pe care le poți schimba). Folosește-l înainte de orice propunere de modificare.',
    input_schema: { type: 'object', properties: { ref: { type: 'string', description: 'Ref-ul din listă: s:<id>, m:<manual>/<capitol> sau id-ul cazului.' } }, required: ['ref'], additionalProperties: false },
  },
  {
    name: 'propune_modificare',
    description: 'Propune proprietarului o modificare în Traininguri. Nu salvează nimic: el vede cum e acum și cum ar fi, și o aplică el cu un buton. ' +
      'Trimite doar câmpurile care se schimbă, fiecare cu valoarea nouă întreagă (la liste: toate rândurile, în ordine, nu doar cele noi). ' +
      'Câmpuri: fișa de tratament: name, minutes, sessions, interval, what, forWho, benefits, phone, contra, steps, settings, say, after; ' +
      'capitolul: title, summary, body (rânduri; „## ” subtitlu, „- ” listă, „1. ” pas, „> ” ce spui, „! ” regulă importantă); ' +
      'cazul: title, profile, wants, ask, duration, result, present, watch. Listele sunt array de rânduri, restul text (minutes: număr).',
    input_schema: {
      type: 'object',
      properties: {
        ref: { type: 'string', description: 'Ref-ul din listă.' },
        rezumat: { type: 'string', description: 'Ce schimbi, într-o propoziție scurtă, pentru proprietar.' },
        campuri: { type: 'object', description: 'Câmpul → valoarea nouă.', additionalProperties: true },
      },
      required: ['ref', 'campuri'],
      additionalProperties: false,
    },
  },
];

module.exports = { index, view, propose, apply, TOOLS, FIELDS };
