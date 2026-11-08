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
const { getSession } = require('./_lib/auth');
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
- corect: dacă nu știi sigur, spui; pentru lucruri recente sau care se schimbă (prețuri, știri, reguli, programe, cursuri), cauți pe internet și spui de unde ai aflat;
- când îți cer un mesaj de trimis cuiva, dai textul gata de copiat;
- datele clinicii de mai jos (ofertele active, programul, orele libere) le folosești doar când întrebarea e despre clinică; nu inventezi date despre clinică (prețuri, programări, încasări) care nu sunt acolo; dacă nu le ai, spui unde le găsește în admin.

Când e vorba de mesaje către o clientă a clinicii:
${CLIENT_RULES}

${FACTS}`;

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
async function ask(system, messages, effort, tools) {
  const parts = [];
  let r;
  // a search can pause a long turn (pause_turn): what came so far goes back as the answer's start and the server goes on
  for (let i = 0; i < 4; i++) {
    const params = {
      model: MODEL,
      max_tokens: 8000,
      output_config: { effort: effort || 'low' }, // short, everyday answers: quick (more care in the corner chat)
      betas: ['server-side-fallback-2026-07-01'],
      fallbacks: 'default', // a refused request is answered by the fallback model in the same call
      system,
      messages: parts.length ? messages.concat({ role: 'assistant', content: parts.slice() }) : messages,
    };
    try {
      r = await claude().beta.messages.create(tools ? Object.assign({ tools }, params) : params);
    } catch (e) {
      // the internet search not allowed on the account: the same question without it
      // the newest search refused: the basic one; that refused too (search off on the account): the question without it
      if (tools && e && e.status === 400 && /web_search|tool/i.test(String(e.message))) {
        webErr = (webErr ? webErr + ' | ' : '') + String(e.message).slice(0, 300); console.error('portal-nuki web:', webErr);
        tools = tools[0].type === WEB[0].type ? [Object.assign({}, WEB[0], { type: 'web_search_20250305' })] : null; i--; continue;
      }
      throw e;
    }
    parts.push(...(r.content || []));
    if (r.stop_reason !== 'pause_turn') break;
  }
  if (r.stop_reason === 'refusal') return { text: '', refused: true };
  const text = parts.filter((b) => b.type === 'text').map((b) => b.text).join('').trim();
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
  if (!process.env.ANTHROPIC_API_KEY) { res.status(503).json({ error: 'no_key', message: 'Nuki nu are încă cheia Claude.' }); return; }
  const b = req.body || {};
  try {
    if (!(await underCap())) { res.status(429).json({ error: 'cap', message: 'Nuki a răspuns destul azi. Mâine e din nou aici.' }); return; }
    const [offers, hours] = await Promise.all([offersText(), hoursText()]);
    const now = new Date().toLocaleString('ro-RO', { timeZone: 'Europe/Bucharest', weekday: 'long', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
    const facts = 'Acum: ' + now + '.\n\nDatele clinicii.\nOfertele active (Admin → Oferte):\n' + (offers || '-') + '\n\nClinicile:\n' + hours;
    // the rules first and cached; the day's facts (offers, free hours) after them
    const system = [{ type: 'text', text: RULES, cache_control: { type: 'ephemeral' } }, { type: 'text', text: facts }];
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
      if (th || where) list[0] = { role: list[0].role, content: [{ type: 'text', text: (where ? 'Sunt în admin, la „' + where + '”.\n' : '') + (th ? 'Am deschisă conversația asta (folosește-o doar dacă întrebarea e despre ea):\n' + th : '') }].concat(blocks(list[0].content)) };
      // the API wants the turns to alternate: merge two of the same side
      const turns = [];
      list.forEach((m) => { const last = turns[turns.length - 1]; if (last && last.role === m.role) last.content = blocks(last.content).concat(blocks(m.content)); else turns.push(Object.assign({}, m)); });
      // the corner chat: a helper for anything (its own rules), able to search the internet
      const chatSystem = [{ type: 'text', text: CHAT_RULES, cache_control: { type: 'ephemeral' } }, { type: 'text', text: facts }];
      const r = await ask(chatSystem, turns, 'medium', WEB);
      res.status(200).json({ text: r.refused || !r.text ? 'Nu pot răspunde la asta. Întreabă-mă altfel sau întreabă pe cineva din echipă.' : r.text });
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
