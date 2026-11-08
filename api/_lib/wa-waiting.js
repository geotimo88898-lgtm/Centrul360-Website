// Mesaje: no client left without an answer (the owner, 8.11: „să se asigure zilnic că nu sunt cliente lăsate fără
// răspuns; nu doar cele necitite, uneori citim și uităm să răspundem; să vină sus și să le dăm noi dacă s-a rezolvat”).
// A conversation waits when she wrote after the last answer a person gave her (WhatsApp, Instagram or Messenger; the
// automatic messages don't count), in the last 14 days, and nobody marked it „Rezolvat” after her message (a call, a talk in the clinic). Nuki reads the ones that wait and says in a few words
// what she wants, or that her last message needs no answer („Mulțumesc!”). At 10:00 and 17:00 the owner and reception
// hear how many still wait.
// State: data/wa-waiting.json { resolved: { <phone|ig:id>: { at, by } }, triage: { <key>: { lastInAt, needs, why } }, pushed: {} }

const { readJSON, writeJSON, readJSONTagged, writeJSONIf } = require('./store');

const KEY = 'data/wa-waiting.json';
const DAYS = 14;
const SLOTS = [10, 17];
const roDay = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Bucharest' }).format(new Date());
const roHour = () => Number(new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Bucharest', hour: '2-digit', hour12: false }).format(new Date()));
const fresh = (t) => !!t && Date.now() - Date.parse(t) < DAYS * 864e5;
const load = async () => Object.assign({ resolved: {}, triage: {}, pushed: {} }, (await readJSON(KEY, null)) || {});
// a change that never overwrites one made meanwhile (a „Rezolvat” tapped while Nuki was reading: it came back, 8.11)
async function update(fn) {
  for (let i = 0; i < 6; i++) {
    const { data, etag } = await readJSONTagged(KEY, null);
    const st = Object.assign({ resolved: {}, triage: {}, pushed: {} }, data || {});
    fn(st);
    if (await writeJSONIf(KEY, st, etag)) return st;
  }
  throw new Error('wa waiting: busy');
}
// a last message that asks for nothing: a button tap on the reminder, a thank you, an ok, an emoji
const NOTHING = /^\s*(da,? ajung|nu ajung|da|ok+|okay|oki|bine|super|perfect|sigur|confirm(at|ăm)?|mul[tț]umesc( frumos| mult)?|mersi|merci|v[aă] mul[tț]umesc( frumos| mult)?|o zi bun[aă]|la fel|ne vedem)\s*[.!,)]*\s*[\p{Extended_Pictographic}\u200d\ufe0f\s]*$|^[\p{Extended_Pictographic}\u200d\ufe0f\s]+$/iu;

// the candidates from the job ads (data/candidates.json): not clients, nothing to answer here (the owner, 8.11)
const d9 = (p) => String(p || '').replace(/\D/g, '').slice(-9);
async function candidates() { return new Set((await readJSON('data/candidates.json', [])).map((c) => d9(c.phone)).filter((x) => x.length === 9)); }
function waits(c, st, cand) {
  if (cand && cand.has(d9(c.phone))) return null;
  // she wrote after the last answer a person gave her (an automatic reminder is not an answer)
  if (!c || !fresh(c.lastInAt) || (c.lastReplyAt && c.lastReplyAt >= c.lastInAt)) return null;
  const r = st.resolved[c.phone];
  if (r && r.at >= c.lastInAt) return null;
  const t = st.triage[c.phone];
  // Nuki read it and her last message asks for nothing („Da, ajung”, „Mulțumesc”): she doesn't wait
  if (t && t.lastInAt === c.lastInAt && t.needs === false) return null;
  return { since: c.lastInAt, needs: t && t.lastInAt === c.lastInAt ? t.needs : null, why: t && t.lastInAt === c.lastInAt ? t.why || '' : '' };
}
// the list Mesaje shows: each conversation that waits gets { waiting: { since, needs, why } }
async function mark(list) {
  const [st, cand] = await Promise.all([load(), candidates()]);
  (list || []).forEach((c) => { const w = waits(c, st, cand); if (w) c.waiting = w; else delete c.waiting; });
  return list;
}
async function resolve(key, on, by) {
  await update((st) => {
    if (on) st.resolved[key] = { at: new Date().toISOString(), by: String(by || '').slice(0, 60) };
    else delete st.resolved[key];
    // the marks of conversations long quiet go (the file stays small)
    Object.keys(st.resolved).forEach((k) => { if (!fresh(st.resolved[k].at)) delete st.resolved[k]; });
  });
}

// Nuki: what each waiting client wants, or that her last message needs no answer
async function triage(items) {
  if (!items.length || !process.env.ANTHROPIC_API_KEY) return [];
  const Anthropic = require('@anthropic-ai/sdk');
  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY, maxRetries: 2, timeout: 90e3 });
  const text = items.map((x, i) => '### ' + (i + 1) + '\n' + x.msgs.map((m) => (m.direction === 'out' ? 'Clinica' : 'Clienta') + ': ' + String(m.text || '[fișier]').slice(0, 500)).join('\n')).join('\n\n');
  // the same call as Nuki's in the portal (api/portal-nuki.js)
  const r = await client.beta.messages.create({
    model: 'claude-opus-5-5', max_tokens: 4000, output_config: { effort: 'low' }, betas: ['server-side-fallback-2026-07-01'], fallbacks: 'default',
    system: 'Ești Nuki, asistentul clinicii Centrul360. Primești conversații în care ultimul mesaj e al clientei și clinica nu i-a răspuns încă. Pentru fiecare spui dacă îi datorăm un răspuns (needs: true) sau dacă mesajul ei nu cere unul (needs: false, de exemplu „Mulțumesc!”, „Ok”, un emoji, o confirmare la care am răspuns deja). „why”: ce vrea ea, în cel mult 8 cuvinte, în română, fără nume, fără liniuțe lungi. Răspunzi doar cu JSON: [{"i":1,"needs":true,"why":"..."}].',
    messages: [{ role: 'user', content: text }],
  });
  const out = (r.content || []).filter((b) => b.type === 'text').map((b) => b.text).join('');
  try { const j = JSON.parse(out.slice(out.indexOf('['), out.lastIndexOf(']') + 1)); return Array.isArray(j) ? j : []; } catch (e) { return []; }
}

// the clock (api/automation-tick.js, hourly): Nuki reads the new ones, then at 10:00 and 17:00 the count goes out
async function run() {
  const [st, cand] = await Promise.all([load(), candidates()]);
  const SI = require('./social-inbox');
  const [wa, so] = await Promise.all([readJSON('data/whatsapp-conversations.json', []), readJSON(SI.KEY, [])]);
  const items = [];
  const lastIn = (ms) => (ms || []).reduce((a, m) => (m.direction === 'in' && m.timestamp > a ? m.timestamp : a), '');
  const lastReply = (ms) => (ms || []).reduce((a, m) => (m.direction === 'out' && !m.auto && m.timestamp > a ? m.timestamp : a), '');
  const add = (key, name, ms) => { const c = { phone: key, lastInAt: lastIn(ms), lastReplyAt: lastReply(ms) }; const w = waits(c, st, cand); if (w) items.push({ key, name, msgs: ms.slice(-8), lastInAt: c.lastInAt, w }); };
  (Array.isArray(wa) ? wa : []).forEach((c) => add(c.phone, c.clientName || '', c.messages || []));
  (Array.isArray(so) ? so : []).forEach((c) => add(c.channel + ':' + c.id, c.name || (c.username ? '@' + c.username : ''), c.messages || []));
  // the ones whose last message asks for nothing, at once; the rest Nuki reads (at most 40 a run; the others at the next)
  const found = {};
  items.filter((x) => x.w.needs === null).forEach((x) => {
    const lastIn = x.msgs.filter((m) => m.direction === 'in').slice(-1)[0];
    if (lastIn && lastIn.text && NOTHING.test(lastIn.text)) { found[x.key] = { lastInAt: x.lastInAt, needs: false, why: '', at: new Date().toISOString() }; x.w.needs = false; }
  });
  const todo = items.filter((x) => x.w.needs === null).slice(0, 40);
  let read = Object.keys(found).length;
  if (todo.length) {
    const ans = await triage(todo).catch((e) => { console.error('wa waiting triage:', e.message); return []; });
    ans.forEach((a) => { const x = todo[Number(a.i) - 1]; if (!x) return; found[x.key] = { lastInAt: x.lastInAt, needs: a.needs !== false, why: String(a.why || '').replace(/[—–]/g, ',').slice(0, 80), at: new Date().toISOString() }; x.w.needs = a.needs !== false; x.w.why = found[x.key].why; read++; });
  }
  // 10:00 and 17:00: the ones still owed an answer, waiting for more than half an hour
  const h = roHour(), slot = SLOTS.find((x) => h === x), day = roDay();
  let pushed = 0, sent = false;
  if (slot !== undefined && !st.pushed[day + '|' + slot]) {
    // the „Rezolvat” marks as they are now (tapped while Nuki was reading)
    const now = await load();
    const owed = items.filter((x) => x.w.needs !== false && !(now.resolved[x.key] && now.resolved[x.key].at >= x.lastInAt) && Date.now() - Date.parse(x.lastInAt) > 30 * 60e3).sort((a, b) => a.lastInAt.localeCompare(b.lastInAt));
    if (owed.length) {
      const N = require('./notify');
      const emps = await readJSON('data/employees.json', []);
      const ids = (await N.adminIds({ readJSON })).concat(emps.filter((e) => e.active !== false && e.role === 'receptie').map((e) => e.id));
      await N.notifyMany({ readJSON, writeJSON }, ids, {
        kind: 'alert', tone: 'warn', go: 'mesaje', tag: 'waiting-' + day + '-' + slot,
        title: owed.length === 1 ? 'O CLIENTĂ FĂRĂ RĂSPUNS 💬' : owed.length + ' CLIENTE FĂRĂ RĂSPUNS 💬',
        text: owed.slice(0, 3).map((x) => (x.name || 'Clientă') + (x.w.why ? ', ' + x.w.why : '')).join(' · '),
      });
      pushed = owed.length;
    }
    sent = true;
  }
  // saved over what is there now: only what Nuki read and the hour told, never a „Rezolvat” made meanwhile
  if (read || sent) await update((cur) => {
    Object.assign(cur.triage, found);
    Object.keys(cur.triage).forEach((k) => { if (!fresh(cur.triage[k].lastInAt)) delete cur.triage[k]; });
    if (sent) { cur.pushed[day + '|' + slot] = new Date().toISOString(); Object.keys(cur.pushed).forEach((k) => { if (k.slice(0, 10) < day) delete cur.pushed[k]; }); }
  });
  return { waiting: items.length, read, pushed };
}

module.exports = { mark, resolve, run, KEY };
