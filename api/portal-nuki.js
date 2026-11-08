// /api/portal-nuki: Nuki, the team's helper inside the portal, on Claude (the owner, 8.11: „să mă ajute să-i răspund la o
// clientă când nu știu ce să-i scriu, ca un chat support pentru mine”). POST, admin or reception:
//   { action: 'reply', thread, draft? } → { text }: the next message to her, in the clinic's voice, to check and send
//   { action: 'chat', messages: [{ role, content, files? }], thread?, tab? } → { text }: an answer for the person asking
//     files: [{ kind: 'image' | 'pdf' | 'text', name, type, data (base64) | text, gone? }]: photos, screenshots, PDFs and
//     text files sent with a question (gone: sent earlier, no longer resent, named only)
// thread = what the screen shows of the conversation: { name, city, channel, interest, appointment, messages: [{ dir, text, at }] }
// Nuki knows the active offers and prices (Admin → Oferte), the two clinics and their hours, the online free hours and the
// clinic's rules. It never sends anything itself: the person reads it, changes it, sends it. At most 400 answers a day.

const Anthropic = require('@anthropic-ai/sdk');
const { readJSON, writeJSON } = require('./_lib/store');
const { getSession, requireAdmin } = require('./_lib/auth');
const E = require('./_lib/nuki-edit');
const { loadOffers } = require('./_lib/offers');
const B = require('./_lib/booking');

const MODEL = 'claude-opus-5-5';
const CAP_KEY = 'data/nuki-usage.json';
const DAILY_CAP = 400;
const clip = (s, n) => String(s == null ? '' : s).trim().slice(0, n);
const RO_DAYS = ['duminică', 'luni', 'marți', 'miercuri', 'joi', 'vineri', 'sâmbătă'];

// how a message to a client is written, and the clinic's fixed facts (both prompts)
const CLIENT_RULES = `- în română, cu diacritice, ca un om din clinică, cald și firesc, nu ca o reclamă; tutuiești clienta, politicos;
- scurt: 1-4 propoziții, cel mult 1-2 emoji; fără liniuțe lungi (— sau –);
- răspunzi exact la ce a întrebat ea, apoi duci spre pasul următor: de obicei consultația gratuită sau programarea, cu 2 ore libere concrete din lista primită (zi și oră), sau o întrebare simplă;
- prețuri și oferte doar din lista „Ofertele active” primită, și doar pentru orașul ei; dacă nu știi prețul exact, spui că îl află la consultația gratuită;
- nu promiți rezultate garantate, nu dai sfaturi medicale; la boli, sarcină, alăptare, medicamente, implanturi sau orice întrebare medicală spui cu blândețe că la consultația gratuită specialista verifică dacă tratamentul i se potrivește;
- nu spui niciodată că clienta are o problemă cu corpul sau fața ei; vorbești despre ce își dorește;
- dacă scrie supărată sau se plânge, îți ceri scuze simplu, fără scuze lungi, și propui o soluție concretă (te sună cineva din echipă, o oră nouă);
- dacă vrea să anuleze sau să mute programarea, îi confirmi și propui alte ore libere;
- nu inventezi nimic: nume de specialiste, aparate, reduceri, cadouri sau garanții care nu sunt în datele primite.

Când echipa îți trimite poze sau fișiere (capturi de conversații, poze înainte/după, documente, tabele): le citești atent și răspunzi la ce întreabă. Dintr-o captură de conversație scrii răspunsul pentru clientă. Din poze nu pui diagnostice și nu promiți un rezultat; spui ce se vede și trimiți spre consultația gratuită.`;

const FACTS = `Fapte fixe:
- Consultația e gratuită, durează aproximativ 30 de minute și nu obligă la nimic; acolo se stabilesc planul și prețul exact.
- Prețul ofertelor se plătește la clinică, fără plată în avans.
- Epilarea laser, EMS și detoxul se fac doar la Timișoara.
- Timișoara: Str. Bucegi 7, telefon 0750 452 002. Arad: Str. Ioan Alexandru 16-18, telefon 0750 277 394.
- Programările online: centrul360.com/programare.`;

// who Nuki is in Mesaje (the reply button): the same for every question (cached by the API)
const RULES = `Ești Nuki, asistentul echipei Centrul360: două clinici de medicină estetică non-invazivă, în Timișoara și Arad (corp, față, epilare laser).
Ajuți echipa (proprietarul și recepția) să le răspundă clientelor pe WhatsApp, Instagram și Messenger, și răspunzi la întrebările echipei despre oferte, prețuri, programări și cum să vorbească cu o clientă.

Cum scrii un mesaj către o clientă:
${CLIENT_RULES}

Ce trimiți înapoi când ți se cere un mesaj pentru clientă: doar textul mesajului, gata de trimis, fără ghilimele, fără explicații.
Când echipa îți pune o întrebare: răspunzi scurt și practic, în română, ca un coleg care știe clinica; dacă e cazul, dai și mesajul exact de trimis.

${FACTS}`;

// the corner chat: a helper for anything, not only messages (the owner, 8.11: „să răspundă punctual la orice întrebare și
// să mă ajute cu orice am nevoie”); the clinic's facts are there for when the question is about the clinic
const CHAT_RULES = `Ești Nuki, asistentul personal al proprietarului Centrul360 și al echipei lui, deschis în adminul clinicii (Centrul360: două clinici de medicină estetică non-invazivă, în Timișoara și Arad).
Îi ajuți cu orice au nevoie, nu doar cu mesajele clientelor: răspunzi la orice întrebare (clinică, marketing, reclame, vânzări, bani și calcule, texte, traduceri, Excel, tehnic, idei, sfaturi practice, cultură generală), citești poze și fișiere, scrii și corectezi texte, faci planuri și liste.

Cum răspunzi:
- punctual: răspunsul direct din prima propoziție, apoi doar ce ajută; scurt, fără introduceri și fără să repeți întrebarea;
- în română, cu diacritice (sau în limba în care ți se scrie); fără liniuțe lungi (— sau –); fără titluri cu #; poți folosi liste scurte cu „-” și **bold** pentru ce contează;
- corect: dacă nu știi sigur, spui; pentru lucruri recente sau care se schimbă (prețuri, știri, reguli, programe, cursuri), cauți pe internet și spui pe scurt ce ai aflat și de unde (numele site-ului), cu cuvintele tale, fără să lipești fragmente din pagini;
- răspunzi doar la ce te întreabă: la o întrebare („pot să fac RF în sarcină?”, „cât costă…”, „ce înseamnă…”) dai răspunsul, nu un mesaj pentru o clientă și nici exemple de mesaje (the owner, 8.11);
- scrii un mesaj de trimis doar când ți se cere explicit („scrie-i”, „ce să-i răspund”, „fă-mi un mesaj”), și atunci dai textul gata de copiat;
- datele clinicii de mai jos (ofertele active, programul, orele libere) le folosești doar când întrebarea e despre clinică; nu inventezi date despre clinică (prețuri, programări, încasări) care nu sunt acolo; dacă nu le ai, spui unde le găsește în admin.

Doar când ți se cere un mesaj către o clientă a clinicii, îl scrii așa:
${CLIENT_RULES}

${FACTS}`;

// the owner's edits through Nuki (the owner, 8.11: „să poată Nuki să editeze ce îi zic”): only proposals, saved by his tap
const EDIT_RULES = `Poți modifica pentru proprietar conținutul din Traininguri (fișele de tratament, capitolele manualelor, cazurile), doar prin propuneri:
- când îți cere să schimbi, să adaugi sau să scoți ceva de acolo, citești întâi ce e acum (citeste), apoi chemi propune_modificare cu valorile noi; conținutul nou nu-l scrii în chat: el îl vede în propunere, cum e acum și cum ar fi;
- nimic nu se salvează până nu apasă el „Aplică”; după propunere îi spui într-o propoziție scurtă ce ai schimbat, fără să repeți conținutul;
- schimbi exact ce cere, cu cuvintele lui, curățate (diacritice, majusculă la început, punct la final dacă așa sunt celelalte rânduri); restul rămâne cum e;
- dacă schimbarea face greșit alt câmp din aceeași fișă (de exemplu „în 8 etape” când acum sunt 7 pași), îl corectezi în aceeași propunere și îi spui;
- nu inventezi date medicale, setări de aparat, prețuri sau rezultate; dacă îți lipsesc, întrebi;
- dacă nu e clar ce fișă sau ce câmp vrea, întrebi scurt înainte;
- altceva decât Traininguri (oferte, prețuri de pe site, reclame, programări, setări) nu poți modifica: îi spui în ce secțiune o face el.

Ce poți modifica:`;
const NO_EDIT = 'Nu poți modifica nimic în admin. Dacă ți se cere, spui că modificările le face proprietarul.';

function money(n) { return Math.round(Number(n) || 0).toLocaleString('ro-RO') + ' lei'; }
async function offersText() {
  const all = (await loadOffers(readJSON, null)).filter((o) => o && o.active !== false);
  return all.map((o) => {
    const where = (o.locations || []).map((l) => (/arad/i.test(l) ? 'Arad' : 'Timișoara')).join(' și ') || 'Timișoara și Arad';
    const price = Number(o.priceNew) > 0 ? money(o.priceNew) + (Number(o.priceOld) > Number(o.priceNew) ? ' în loc de ' + money(o.priceOld) : '') : 'preț la consultație';
    return '- ' + o.title + ': ' + price + ' (' + where + ')' + (o.description ? '. ' + clip(o.description, 200).replace(/\s+/g, ' ') : '');
  }).join('\n');
}
// the clinics' hours and the next free online hours (a 30 minute consultation), from Calendar → Online
async function hoursText() {
  const [cfg, appts] = await Promise.all([B.settings(), readJSON('data/appointments.json', [])]);
  const out = [];
  for (const city of B.CITIES) {
    const c = cfg.cities && cfg.cities[city];
    if (!c) continue;
    const open = Object.entries(c.days || {}).filter(([, d]) => d && d.on).map(([k, d]) => RO_DAYS[Number(k)] + ' ' + d.from + '-' + d.to);
    const free = cfg.on ? B.days(cfg, city, 30, appts).filter((d) => d.slots && d.slots.length).slice(0, 3)
      .map((d) => { const dt = new Date(d.date + 'T12:00:00Z'); return RO_DAYS[dt.getUTCDay()] + ' ' + d.date.slice(8, 10) + '.' + d.date.slice(5, 7) + ': ' + d.slots.slice(0, 6).join(', '); }) : [];
    out.push(city + ': program ' + (open.join('; ') || '-') + '.\n  Ore libere pentru consultație: ' + (free.join(' · ') || 'nu am găsit în zilele următoare, se stabilește la telefon'));
  }
  return out.join('\n');
}
function threadText(t) {
  if (!t || typeof t !== 'object') return '';
  const msgs = (Array.isArray(t.messages) ? t.messages : []).slice(-30).map((m) => {
    const who = m.dir === 'out' ? 'Clinica' : 'Clienta';
    const at = clip(m.at, 16).replace('T', ' ');
    return (at ? '[' + at + '] ' : '') + who + ': ' + clip(m.text, 1200);
  }).join('\n');
  const head = [t.name ? 'Clienta: ' + clip(t.name, 80) : '', t.city ? 'Orașul: ' + clip(t.city, 30) : '', t.channel ? 'Canal: ' + clip(t.channel, 20) : '',
    t.interest ? 'Interesată de: ' + clip(t.interest, 120) : '', t.appointment ? 'Programare: ' + clip(t.appointment, 120) : ''].filter(Boolean).join('\n');
  return head + (msgs ? '\nConversația (cele mai noi la final):\n' + msgs : '');
}


// ---------------------------------------------------------------- „Programăm?” (the owner, 8.11)
// In Mesaje, when she names a day and an hour, Nuki reads what she wants and the Calendar says whether that hour is
// free. Free: the desk books it with one tap (the booking opens filled in, they save it). Taken: who is there (her
// treatment, which session, whether it is paid) next to what the new client would bring, and the nearest free hours.
// Nuki never books or moves anyone by itself (the owner, 8.11: „de început, orice face Nuki să fie cu aprobarea sau
// acțiunea noastră”).
const toMin = (t) => { const m = /^(\d{1,2}):(\d{2})$/.exec(String(t || '')); return m ? Number(m[1]) * 60 + Number(m[2]) : null; };
const hhmm = (n) => String(Math.floor(n / 60)).padStart(2, '0') + ':' + String(n % 60).padStart(2, '0');
const fold = (t) => String(t || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
function overlaps(appts, city, date, s, e) {
  return appts.filter((a) => a && a.location === city && a.date === date && a.status !== 'anulata' && toMin(a.time) != null &&
    toMin(a.time) < e && ((toMin(a.endTime) > toMin(a.time) ? toMin(a.endTime) : toMin(a.time) + 60)) > s);
}
function placesAt(cfg, city, date, appts) {
  const c = cfg.cities && cfg.cities[city]; if (!c) return { open: false };
  const d = (c.days || {})[new Date(date + 'T12:00:00Z').getUTCDay()];
  if (!d || !d.on || (c.closed || []).includes(date)) return { open: false };
  const off = new Set(appts.filter((a) => a.location === city && a.date === date && (a.status === 'concediu' || a.block) && !a.time && a.cosmeticianId).map((a) => a.cosmeticianId));
  const closed = appts.some((a) => a.location === city && a.date === date && (a.status === 'concediu' || a.block) && !a.time && !a.cosmeticianId);
  return { open: !closed, from: toMin(d.from), to: toMin(d.to), cap: Math.max(0, (Number(d.at) || 1) - off.size) };
}
async function slotCheck(want, city) {
  const [cfg, appts, sales, offers] = await Promise.all([B.settings(), readJSON('data/appointments.json', []), readJSON('data/sales.json', []), B.services(city)]);
  const pick = want.treatment ? offers.find((o) => o.id !== 'consult' && fold(want.treatment).split(/\s+/).filter((w) => w.length > 3).some((w) => fold(o.title).includes(w))) : null;
  const svc = pick || (want.treatment ? null : B.CONSULT);
  const minutes = (svc && svc.minutes) || 60;
  const s = toMin(want.time), e = s + minutes;
  const P = placesAt(cfg, city, want.date, appts);
  const taken = overlaps(appts, city, want.date, s, e).filter((a) => a.status !== 'concediu' && !a.block);
  const inHours = P.open && s >= P.from && e <= P.to;
  const free = inHours && taken.length < P.cap;
  const paid = (a) => !!a.paidSaleId || sales.some((x) => x.appointmentId === a.id);
  const who = taken.map((a) => {
    const before = appts.filter((x) => x.clientId && x.clientId === a.clientId && x.id !== a.id && x.status !== 'anulata' && x.date < a.date && fold(x.treatment).slice(0, 6) === fold(a.treatment).slice(0, 6)).length;
    return { id: a.id, name: a.clientName || 'Clientă', phone: a.clientPhone || '', treatment: a.treatment || '', time: a.time, endTime: a.endTime || '', session: before + 1, amount: Number(a.amount) || 0, paid: paid(a), cosmetician: a.cosmeticianName || '' };
  });
  // the nearest free hours: that day around her hour, then the next days at her hour
  const alt = [];
  for (let k = 0; k < 7 && alt.length < 4; k++) {
    const day = B.addDay(want.date, k), Q = placesAt(cfg, city, day, appts);
    if (!Q.open) continue;
    const cands = [];
    for (let t = Q.from; t + minutes <= Q.to; t += 30) if (overlaps(appts, city, day, t, t + minutes).filter((a) => a.status !== 'concediu' && !a.block).length < Q.cap) cands.push(t);
    cands.sort((a, b) => Math.abs(a - s) - Math.abs(b - s)).slice(0, k === 0 ? 2 : 1).forEach((t) => { if (!(k === 0 && t === s) && alt.length < 4) alt.push({ date: day, time: hhmm(t) }); });
  }
  return { date: want.date, time: want.time, endTime: hhmm(e), minutes, city, treatment: svc ? svc.title : want.treatment || '', price: svc ? svc.price : 0,
    free, open: P.open, inHours, who, alt: alt.sort((a, b) => (a.date + a.time).localeCompare(b.date + b.time)) };
}

async function underCap() {
  const day = new Date().toISOString().slice(0, 10);
  const u = (await readJSON(CAP_KEY, null)) || {};
  const n = u.day === day ? Number(u.n) || 0 : 0;
  if (n >= DAILY_CAP) return false;
  await writeJSON(CAP_KEY, { day, n: n + 1 }, { quiet: true }).catch(() => {});
  return true;
}

let client = null;
function claude() {
  if (!client) client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY, maxRetries: 2, timeout: 120e3 });
  return client;
}
// photos, PDFs and text files as content blocks for Claude
const IMG = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
const B64 = /^[A-Za-z0-9+/=\s]+$/;
function fileBlocks(files) {
  const out = [], earlier = [];
  (Array.isArray(files) ? files : []).slice(0, 8).forEach((f) => {
    if (!f || typeof f !== 'object') return;
    const name = clip(f.name, 120) || 'fișier';
    if (f.gone) { earlier.push(name); return; }
    if (f.kind === 'image' && IMG.includes(f.type) && typeof f.data === 'string' && f.data.length < 7e6 && B64.test(f.data.slice(0, 200))) out.push({ type: 'image', source: { type: 'base64', media_type: f.type, data: f.data } });
    else if (f.kind === 'pdf' && typeof f.data === 'string' && f.data.length < 28e6 && B64.test(f.data.slice(0, 200))) out.push({ type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: f.data }, title: name });
    else if (f.kind === 'text' && typeof f.text === 'string' && f.text.trim()) out.push({ type: 'document', source: { type: 'text', media_type: 'text/plain', data: f.text.slice(0, 200000) }, title: name });
  });
  if (earlier.length) out.push({ type: 'text', text: '(Mai devreme mi-ai trimis și: ' + earlier.join(', ') + '.)' });
  return out;
}
const blocks = (c) => (typeof c === 'string' ? (c ? [{ type: 'text', text: c }] : []) : c);

let webErr = ''; // why the last internet search was refused (the health check shows it)
// onTool(name, input) answers the tools the clinic runs itself (the owner's edits, api/_lib/nuki-edit.js): its
// { result, error } goes back to Claude and the turn goes on
async function ask(system, messages, effort, tools, onTool) {
  const parts = [];
  const said = [];
  let paused = false;
  let convo = messages;
  let r;
  // a search can pause a long turn (pause_turn): what came so far goes back as the answer's start and the server goes on
  for (let i = 0; i < 10; i++) {
    const params = {
      model: MODEL,
      max_tokens: 8000,
      output_config: { effort: effort || 'low' }, // short, everyday answers: quick (more care in the corner chat)
      betas: ['server-side-fallback-2026-07-01'],
      fallbacks: 'default', // a refused request is answered by the fallback model in the same call
      system,
      messages: parts.length ? convo.concat({ role: 'assistant', content: parts.slice() }) : convo,
    };
    try {
      r = await claude().beta.messages.create(tools && tools.length ? Object.assign({ tools }, params) : params);
    } catch (e) {
      // the newest search refused: the basic one; that refused too (search off on the account): the question without it
      const web = tools && tools.find((t) => t.name === 'web_search');
      if (web && e && e.status === 400 && /web_search|tool/i.test(String(e.message))) {
        webErr = (webErr ? webErr + ' | ' : '') + String(e.message).slice(0, 300); console.error('portal-nuki web:', webErr);
        const rest = tools.filter((t) => t !== web);
        tools = web.type === WEB[0].type ? [Object.assign({}, WEB[0], { type: 'web_search_20250305' })].concat(rest) : rest;
        i--; continue;
      }
      throw e;
    }
    const got = r.content || [];
    parts.push(...got);
    // what it says before reading or proposing („Mă uit la fișă.”) is not part of the answer
    const words = r.stop_reason === 'tool_use' && onTool ? '' : got.filter((b) => b.type === 'text').map((b) => b.text).join('');
    // a paused turn goes on in the same sentence; a turn after a tool's answer is a new paragraph
    if (words.trim()) { if (paused && said.length) said[said.length - 1] += words; else said.push(words); }
    paused = r.stop_reason === 'pause_turn';
    if (r.stop_reason === 'pause_turn') continue;
    const uses = got.filter((b) => b.type === 'tool_use');
    if (r.stop_reason === 'tool_use' && onTool && uses.length) {
      const results = [];
      for (const u of uses) {
        let o;
        try { o = (await onTool(u.name, u.input || {})) || {}; } catch (e) { o = { result: 'Eroare: ' + String((e && e.message) || e).slice(0, 200), error: true }; }
        results.push({ type: 'tool_result', tool_use_id: u.id, content: String(o.result || 'ok'), is_error: !!o.error });
      }
      convo = convo.concat({ role: 'assistant', content: parts.slice() }, { role: 'user', content: results });
      parts.length = 0;
      continue;
    }
    break;
  }
  if (r.stop_reason === 'refusal') return { text: '', refused: true };
  const text = said.map((x) => x.trim()).filter(Boolean).join('\n\n');
  const searches = parts.filter((b) => b.type === 'server_tool_use').length;
  return { text: text.replace(/\s+[—–]\s+/g, ', ').replace(/[—–]/g, '-'), searches };
}
// the corner chat can look things up on the internet (news, prices, rules, anything recent)
// (no user_location: the search refuses the country code RO; the question itself says where)
const WEB = [{ type: 'web_search_20260209', name: 'web_search', max_uses: 5 }];

module.exports = async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  const session = getSession(req);
  if (!session) { res.status(401).json({ error: 'unauthorized' }); return; }
  if (!['admin', 'receptie'].includes(session.role)) { res.status(403).json({ error: 'forbidden' }); return; }
  if (req.method !== 'POST') { res.status(405).json({ error: 'method_not_allowed' }); return; }
  const b = req.body || {};
  // the owner's „Aplică” on a change Nuki proposed (admin only; Activitate notes it)
  if (b.action === 'apply') {
    const admin = await requireAdmin(req, res);
    if (!admin) return;
    try {
      const out = await E.apply(b);
      if (!out.ok) { res.status(out.status || 400).json({ error: out.error, message: out.message }); return; }
      res.status(200).json({ ok: true, name: out.name, kind: out.kind });
    } catch (e) {
      console.error('portal-nuki apply:', String((e && e.message) || e).slice(0, 200));
      res.status(500).json({ error: 'apply_failed', message: 'Nu am putut salva. Încearcă din nou.' });
    }
    return;
  }
  if (!process.env.ANTHROPIC_API_KEY) { res.status(503).json({ error: 'no_key', message: 'Nuki nu are încă cheia Claude.' }); return; }
  try {
    if (!(await underCap())) { res.status(429).json({ error: 'cap', message: 'Nuki a răspuns destul azi. Mâine e din nou aici.' }); return; }
    const [offers, hours] = await Promise.all([offersText(), hoursText()]);
    const now = new Date().toLocaleString('ro-RO', { timeZone: 'Europe/Bucharest', weekday: 'long', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
    const facts = 'Acum: ' + now + '.\n\nDatele clinicii.\nOfertele active (Admin → Oferte):\n' + (offers || '-') + '\n\nClinicile:\n' + hours;
    // the rules first and cached; the day's facts (offers, free hours) after them
    const system = [{ type: 'text', text: RULES, cache_control: { type: 'ephemeral' } }, { type: 'text', text: facts }];
    if (b.action === 'slot') {
      const th = threadText(b.thread);
      if (!th) { res.status(400).json({ error: 'no_thread' }); return; }
      const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Bucharest' }).format(new Date());
      const wd = RO_DAYS[new Date(today + 'T12:00:00Z').getUTCDay()];
      const q = th + '\n\nAzi e ' + wd + ', ' + today + '. Din mesajele ei cele mai noi: cere clienta o programare la o zi și o oră anume? ' +
        'Răspunde doar cu JSON: {"found":true|false,"date":"YYYY-MM-DD","time":"HH:MM","treatment":"ce tratament vrea, scurt, sau gol","city":"Timișoara|Arad|gol"}. ' +
        '„mâine la 3” înseamnă 15:00 dacă e în program; fără zi sau fără oră clară: found false.';
      const r = await ask([{ type: 'text', text: RULES, cache_control: { type: 'ephemeral' } }], [{ role: 'user', content: q }]);
      let want = null;
      try { const t = r.text || ''; want = JSON.parse(t.slice(t.indexOf('{'), t.lastIndexOf('}') + 1)); } catch (e) { want = null; }
      if (!want || !want.found || !/^\d{4}-\d{2}-\d{2}$/.test(want.date || '') || toMin(want.time) == null || want.date < today) { res.status(200).json({ found: false }); return; }
      const city = B.CITIES.includes(want.city) ? want.city : B.CITIES.includes((b.thread || {}).city) ? b.thread.city : B.CITIES[0];
      res.status(200).json(Object.assign({ found: true }, await slotCheck(want, city)));
      return;
    }
    if (b.action === 'reply') {
      const th = threadText(b.thread);
      if (!th) { res.status(400).json({ error: 'no_thread' }); return; }
      const draft = clip(b.draft, 2000);
      const ask1 = th + '\n\n' + (draft
        ? 'Echipa a început acest răspuns: „' + draft + '”. Fă-l mai bun (aceeași idee, mai clar, mai cald, cu pasul următor). Trimite doar mesajul.'
        : 'Scrie mesajul pe care clinica i-l trimite acum clientei. Trimite doar mesajul.');
      const r = await ask(system, [{ role: 'user', content: ask1 }]);
      if (r.refused || !r.text) { res.status(200).json({ text: '', message: 'Nuki nu a putut scrie un răspuns aici.' }); return; }
      res.status(200).json({ text: r.text.replace(/^[„"“]|[”"]$/g, '').trim() });
      return;
    }
    if (b.action === 'chat') {
      const list = (Array.isArray(b.messages) ? b.messages : []).slice(-16).map((m) => {
        const role = m.role === 'assistant' ? 'assistant' : 'user';
        const text = clip(m.content, 4000);
        const files = role === 'user' ? fileBlocks(m.files) : [];
        return { role, content: files.length ? files.concat({ type: 'text', text: text || 'Uită-te la asta.' }) : text };
      }).filter((m) => m.content && m.content.length);
      while (list.length && list[0].role !== 'user') list.shift();
      if (!list.length || list[list.length - 1].role !== 'user') { res.status(400).json({ error: 'no_question' }); return; }
      const th = threadText(b.thread);
      const where = clip(b.tab, 40);
      if (th || where) list[0] = { role: list[0].role, content: [{ type: 'text', text: (where ? 'Sunt în admin, la „' + where + '”.\n' : '') + (th ? 'Am deschisă conversația asta (folosește-o doar dacă întrebarea e despre ea; nu-i scrie un mesaj dacă nu ți-l cer):\n' + th : '') }].concat(blocks(list[0].content)) };
      // the API wants the turns to alternate: merge two of the same side
      const turns = [];
      list.forEach((m) => { const last = turns[turns.length - 1]; if (last && last.role === m.role) last.content = blocks(last.content).concat(blocks(m.content)); else turns.push(Object.assign({}, m)); });
      // the corner chat: a helper for anything (its own rules), able to search the internet
      const owner = session.role === 'admin';
      const chatSystem = [{ type: 'text', text: CHAT_RULES, cache_control: { type: 'ephemeral' } }, { type: 'text', text: facts },
        { type: 'text', text: owner ? EDIT_RULES + '\n' + (await E.index()) : NO_EDIT }];
      // the owner's edits: Nuki reads and proposes; what it proposes goes to the chat with „Aplică”, nothing is saved here
      const edits = [];
      const onTool = async (name, input) => {
        if (!owner) return { result: NO_EDIT, error: true };
        if (name === 'citeste') { const v = await E.view(input.ref); return v.error ? { result: v.error, error: true } : { result: JSON.stringify(v) }; }
        if (name === 'propune_modificare') {
          if (edits.length >= 6) return { result: 'Destule propuneri într-un singur răspuns.', error: true };
          const p = await E.propose(input);
          if (p.error) return { result: p.error, error: true };
          edits.push(p.edit);
          return { result: 'Propunerea e în fața proprietarului, cu „Aplică”. Nu e salvată încă.' };
        }
        return { result: 'Nu am unealta asta.', error: true };
      };
      const r = await ask(chatSystem, turns, 'medium', owner ? WEB.concat(E.TOOLS) : WEB, onTool);
      const text = r.refused || (!r.text && !edits.length) ? 'Nu pot răspunde la asta. Întreabă-mă altfel sau întreabă pe cineva din echipă.' : r.text;
      res.status(200).json(edits.length ? { text, edits } : { text });
      return;
    }
    res.status(400).json({ error: 'invalid_action' });
  } catch (e) {
    const status = e && e.status;
    console.error('portal-nuki:', status || '', String((e && e.message) || e).slice(0, 200));
    res.status(502).json({ error: 'nuki_failed', message: status === 429 ? 'Nuki e ocupat acum, încearcă din nou peste un minut.' : 'Nuki nu a răspuns. Încearcă din nou.' });
  }
};

// the health check (/api/lead-health?nuki=1): is the key there, does Claude answer with the real offers and hours
module.exports.ping = async () => {
  if (!process.env.ANTHROPIC_API_KEY) return { key: false };
  try {
    const [offers, hours] = await Promise.all([offersText(), hoursText()]);
    const facts = 'Acum: ' + new Date().toLocaleString('ro-RO', { timeZone: 'Europe/Bucharest' }) + '.\n\nDatele clinicii.\nOfertele active:\n' + offers + '\n\nClinicile:\n' + hours;
    const reply = await ask([{ type: 'text', text: RULES, cache_control: { type: 'ephemeral' } }, { type: 'text', text: facts }], [{ role: 'user', content: 'O clientă din Arad întreabă: „Cât costă la gușă și când aș putea veni?” Scrie mesajul.' }]);
    webErr = '';
    const chat = await ask([{ type: 'text', text: CHAT_RULES, cache_control: { type: 'ephemeral' } }, { type: 'text', text: facts }], [{ role: 'user', content: 'Cât e cursul euro BNR azi? Și cât fac 2.500 lei în euro?' }], 'medium', WEB);
    return { key: true, ok: !!(reply.text && chat.text), reply: reply.text.slice(0, 500), chat: chat.text.slice(0, 700), searches: chat.searches, webErr };
  } catch (e) { return { key: true, ok: false, status: e && e.status, error: String((e && e.message) || e).slice(0, 300) }; }
};

// /api/lead-health?nuki=edit: what the owner's chat does with „schimbă pașii…”, without saving anything
module.exports.pingEdit = async (q) => {
  if (!process.env.ANTHROPIC_API_KEY) return { key: false };
  try {
    const edits = [];
    const tools = [];
    const onTool = async (name, input) => {
      tools.push(name + (input && input.ref ? ' ' + input.ref : ''));
      if (name === 'citeste') { const v = await E.view(input.ref); return v.error ? { result: v.error, error: true } : { result: JSON.stringify(v) }; }
      if (name === 'propune_modificare') { const p = await E.propose(input); if (p.error) return { result: p.error, error: true }; edits.push(p.edit); return { result: 'Propunerea e în fața proprietarului, cu „Aplică”. Nu e salvată încă.' }; }
      return { result: 'Nu am unealta asta.', error: true };
    };
    const system = [{ type: 'text', text: CHAT_RULES, cache_control: { type: 'ephemeral' } }, { type: 'text', text: 'Acum: ' + new Date().toLocaleString('ro-RO', { timeZone: 'Europe/Bucharest' }) + '.' },
      { type: 'text', text: EDIT_RULES + '\n' + (await E.index()) }];
    const r = await ask(system, [{ role: 'user', content: clip(q, 600) || 'La tratamentul facial Restart, pasul cu masajul să fie „Masaj față, gât și decolteu”.' }], 'medium', WEB.concat(E.TOOLS), onTool);
    return { key: true, ok: edits.length > 0, text: r.text.slice(0, 500), tools, edits: edits.map((e) => ({ ref: e.ref, name: e.name, fields: e.fields.map((f) => ({ key: f.key, after: f.after })) })) };
  } catch (e) { return { key: true, ok: false, status: e && e.status, error: String((e && e.message) || e).slice(0, 300) }; }
};
