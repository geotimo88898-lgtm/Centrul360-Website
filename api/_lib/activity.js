// Activitate: every change anyone makes in the portal, in words ("Bianca a mutat programarea Ioanei Pop:
// ora 10:00 → 11:00"). Recorded in one place for every API route (auth.js calls watch() on each signed-in
// request): when a change answers OK, a line is added for the day. Nothing is written for reading, and a
// password, a token or a secret is never part of a line. The owner reads it in Admin → Activitate.
//
//   data/activity/<YYYY-MM-DD>.json  [{ id, at, by, name, role, area, go, verb, subject, detail, path, action }]
//
// The line is added after the answer is ready; on Vercel the function is kept alive for it (waitUntil),
// elsewhere the answer waits for it. A day's file is read, added to and checked, so two changes at the
// same moment both stay.

const crypto = require('crypto');
const { readJSON, writeJSON } = require('./store');

// where a change happened: the portal section (and its link), the document holding the thing changed
const ROUTES = {
  'portal-appointments': { area: 'Programări', go: 'programari', doc: 'data/appointments.json', ids: ['id'] },
  'portal-leads': { area: 'Pipeline', go: 'pipeline', doc: 'data/leads.json', ids: ['leadId', 'id'] },
  'portal-contacts': { area: 'Contacte', go: 'contacte', doc: 'data/clients.json', ids: ['id'] },
  'portal-incasari': { area: 'Încasări', go: 'incasari', doc: 'data/sales.json', ids: ['id'] },
  'portal-sale': { area: 'Încasări', go: 'incasari', doc: 'data/appointments.json', ids: ['appointmentId'] },
  'portal-approve': { area: 'Aprobări', go: 'aprobari', doc: 'data/sales.json', ids: ['saleId'] },
  'portal-employees': { area: 'Echipa', go: 'angajati', doc: 'data/employees.json', ids: ['employeeId'] },
  'portal-attendance': { area: 'Condică', go: 'condica' },
  'portal-leave': { area: 'Concedii', go: 'condica', doc: 'data/leave-requests.json', ids: ['id'] },
  'portal-offers': { area: 'Oferte', go: 'oferte' },
  'portal-workflows': { area: 'Automatizări', go: 'fluxuri' },
  'portal-automation-tasks': { area: 'Sarcini', go: 'automatizari' },
  'portal-whatsapp': { area: 'Mesaje', go: 'mesaje' },
  'portal-wa': { area: 'WhatsApp', go: 'integrari' },
  'portal-integrations': { area: 'Integrări', go: 'integrari' },
  'portal-mypos': { area: 'Integrări', go: 'integrari' },
  'portal-ghl': { area: 'Integrări', go: 'integrari' },
  'portal-live': { area: 'Integrări', go: 'integrari' },
  'portal-config': { area: 'Setări', go: 'integrari' },
  'portal-academy': { area: 'Traininguri', go: 'traininguri' },
  'portal-account': { area: 'Contul meu', go: '' },
  'ads-manager': { area: 'Reclame', go: 'reclame' },
  'ads-publish': { area: 'Reclame', go: 'reclame' },
};
// what is only read (never a line), and routes that are not changes of the clinic's work
const READS = ['list', 'search', 'get', 'unpaid', 'thread', 'balance', 'balance_all', 'timebank', 'adjust_list', 'check', 'discover', 'profile_get',
  'details', 'defaults', 'fb_form_info', 'form_info', 'push_key', 'push_test', 'push_on', 'push_off', 'prefs', 'login_config', 'tpl_sync', 'media_image', 'sync', 'step', 'pause', 'test'];
const SKIP = ['portal-prefs', 'portal-pulse', 'portal-impersonate', 'portal-creative-sso', 'portal-file', 'portal-leave-pdf', 'portal-avatar', 'portal-data', 'portal-login', 'portal-logout', 'portal-activity', 'portal-game'];

// the words for each change (route:action; route: for the routes without actions)
const VERBS = {
  'portal-appointments:create': 'a programat', 'portal-appointments:update': 'a modificat programarea', 'portal-appointments:delete': 'a șters programarea',
  'portal-leads:create': 'a adăugat leadul', 'portal-leads:update_details': 'a modificat leadul', 'portal-leads:move_stage': 'a mutat leadul',
  'portal-leads:add_note': 'a notat la', 'portal-leads:log_contact': 'a contactat', 'portal-leads:set_followup': 'a setat follow-up la',
  'portal-leads:link_appointment': 'a programat leadul', 'portal-leads:delete': 'a șters leadul', 'portal-leads:stages_save': 'a modificat etapele din Pipeline',
  'portal-contacts:create': 'a adăugat contactul', 'portal-contacts:update': 'a modificat contactul', 'portal-contacts:import': 'a importat contacte',
  'portal-contacts:note_add': 'a adăugat o notă la', 'portal-contacts:note_delete': 'a șters o notă la', 'portal-contacts:file_add': 'a adăugat un fișier la',
  'portal-contacts:file_delete': 'a șters un fișier la', 'portal-contacts:session_add': 'a adăugat o ședință la', 'portal-contacts:session_update': 'a modificat o ședință la',
  'portal-contacts:session_delete': 'a șters o ședință la', 'portal-contacts:photo_set': 'a pus o poză înainte / după la', 'portal-contacts:photo_delete': 'a șters o poză la',
  'portal-contacts:consent': 'a setat acordul pentru poze la', 'portal-contacts:frames_set': 'a aliniat pozele la', 'portal-contacts:publish': 'a publicat pe site rezultatele',
  'portal-contacts:unpublish': 'a scos de pe site rezultatele',
  'portal-incasari:update': 'a modificat încasarea', 'portal-incasari:delete': 'a șters încasarea',
  'portal-ghl:connect': 'a conectat HighLevel', 'portal-ghl:mapping': 'a potrivit calendarele HighLevel', 'portal-ghl:start': 'a pornit importul din HighLevel', 'portal-ghl:disconnect': 'a deconectat HighLevel',
  'portal-live:connect': 'a pornit sincronizarea instantă', 'portal-live:disconnect': 'a oprit sincronizarea instantă',
  'portal-mypos:connect': 'a conectat myPOS', 'portal-mypos:device': 'a ales orașul unui aparat POS', 'portal-mypos:disconnect': 'a deconectat myPOS',
  'portal-sale:': 'a înregistrat o încasare la', 'portal-approve:': 'a decis vânzarea',
  'portal-employees:create': 'a adăugat în echipă pe', 'portal-employees:update_details': 'a modificat datele pentru', 'portal-employees:reset_password': 'a resetat parola pentru',
  'portal-employees:set_active': 'a schimbat accesul pentru', 'portal-employees:set_goals': 'a setat obiectivele pentru',
  'portal-employees:manual_add': 'a adăugat o ajustare pentru', 'portal-employees:manual_delete': 'a șters o ajustare',
  'portal-attendance:clock_in': 'a pontat intrarea', 'portal-attendance:clock_out': 'a pontat ieșirea', 'portal-attendance:update': 'a modificat pontajul',
  'portal-attendance:adjust_decide': 'a decis o corecție de pontaj', 'portal-attendance:payout': 'a plătit ore suplimentare',
  'portal-leave:create': 'a cerut concediu', 'portal-leave:decide': 'a decis o cerere de concediu', 'portal-leave:admin_create': 'a adăugat un concediu',
  'portal-offers:create': 'a adăugat oferta', 'portal-offers:update': 'a modificat oferta', 'portal-offers:delete': 'a șters oferta', 'portal-offers:reorder': 'a reordonat ofertele',
  'portal-workflows:save': 'a salvat automatizarea', 'portal-workflows:toggle': 'a pornit / oprit automatizarea', 'portal-workflows:delete': 'a șters automatizarea',
  'portal-workflows:run_now': 'a rulat automatizarea',
  'portal-automation-tasks:create': 'a adăugat o sarcină',
  'portal-whatsapp:send': 'a răspuns pe WhatsApp', 'portal-whatsapp:send_template': 'a trimis un șablon WhatsApp', 'portal-whatsapp:send_media': 'a trimis un fișier pe WhatsApp',
  'portal-whatsapp:send_results': 'a trimis rezultatele înainte / după', 'portal-whatsapp:snip_save': 'a salvat snippetul', 'portal-whatsapp:snip_delete': 'a șters un snippet',
  'portal-wa:connect': 'a conectat numărul WhatsApp', 'portal-wa:disconnect': 'a deconectat numărul WhatsApp', 'portal-wa:tpl_save': 'a salvat șablonul WhatsApp',
  'portal-wa:tpl_submit': 'a trimis la aprobare șablonul', 'portal-wa:tpl_delete': 'a șters un șablon WhatsApp', 'portal-wa:profile_save': 'a modificat profilul WhatsApp',
  'portal-account:password': 'și-a schimbat parola', 'portal-account:profile': 'și-a actualizat profilul', 'portal-account:photo_set': 'și-a schimbat poza',
  'portal-account:photo_delete': 'și-a scos poza', 'portal-account:username': 'și-a schimbat utilizatorul',
  'ads-manager:edit_ad': 'a modificat o reclamă', 'ads-manager:edit_adset': 'a modificat un set de reclame',
  'portal-academy:read': 'a citit', 'portal-academy:quiz': 'a dat testul', 'portal-academy:case': 'a rezolvat cazul',
  'portal-academy:task': 'a bifat sarcina', 'portal-academy:confirm': 'a decis sarcina', 'portal-academy:path': 'a setat drumul de început pentru',
};
const generic = (a) => (/create|add|new/.test(a) ? 'a adăugat' : /delete|remove/.test(a) ? 'a șters' : 'a modificat');

// what changed, in words ("ora 10:00 → 11:00")
const FIELDS = { date: 'data', time: 'ora', endTime: 'ora de final', status: 'statusul', treatment: 'tratamentul', location: 'locația', cosmeticianName: 'cosmeticiana',
  amount: 'suma', name: 'numele', clientName: 'clienta', phone: 'telefonul', email: 'e-mailul', value: 'valoarea', followUpAt: 'follow-up', nextAction: 'pasul următor',
  interest: 'interesul', priceNew: 'prețul', priceOld: 'prețul vechi', title: 'titlul', active: 'activ', role: 'rolul', note: 'nota' };
const STATUS = { programata: 'programată', confirmata: 'confirmată', anulata: 'anulată', reprogramata: 'reprogramată', finalizata: 'finalizată', concediu: 'concediu', scheduled: 'programată', confirmed: 'confirmată', done: 'finalizată', completed: 'finalizată', cancelled: 'anulată', canceled: 'anulată', no_show: 'neprezentată', noshow: 'neprezentată', pending: 'în așteptare', approved: 'aprobată', rejected: 'respinsă' };
const OUTCOME = { raspuns: 'a răspuns', interesat: 'interesată', programat: 'vrea programare', revine: 'revine', nu_raspunde: 'nu răspunde', refuz: 'nu e interesată', numar_gresit: 'număr greșit' };
const clip = (s, n) => { const t = String(s == null ? '' : s).replace(/\s+/g, ' ').trim(); return t.length > n ? t.slice(0, n - 1) + '…' : t; };
function pretty(k, v) {
  if (v == null || v === '') return '-';
  if (typeof v === 'boolean') return v ? 'da' : 'nu';
  const s = String(v);
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s.slice(8, 10) + '.' + s.slice(5, 7);
  if (/^\d{4}-\d{2}-\d{2}T/.test(s)) { const d = new Date(s); return isNaN(d) ? s : d.toLocaleString('ro-RO', { timeZone: 'Europe/Bucharest', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }); }
  if (k === 'status') return STATUS[s] || s.replace(/_/g, ' ');
  if (k === 'amount' || k === 'value' || k === 'priceNew' || k === 'priceOld') return s + ' lei';
  return clip(s, 40);
}
function diff(before, after) {
  if (!before || !after) return '';
  return Object.keys(FIELDS).filter((k) => k in before || k in after)
    .filter((k) => JSON.stringify(before[k] == null ? '' : before[k]) !== JSON.stringify(after[k] == null ? '' : after[k]))
    .slice(0, 4).map((k) => FIELDS[k] + ' ' + pretty(k, before[k]) + ' → ' + pretty(k, after[k])).join(', ');
}

// the thing in a document by its id (a list, or lists inside an object)
function findById(doc, id) {
  if (!doc || !id) return null;
  const lists = Array.isArray(doc) ? [doc] : Object.values(doc).filter(Array.isArray);
  for (const l of lists) { const x = l.find((r) => r && String(r.id) === String(id)); if (x) return x; }
  return null;
}
const nameOfThing = (x) => (x && (x.clientName || x.name || x.title || x.label)) || '';
const idOf = (route, body) => { const r = ROUTES[route]; if (!r || !r.ids) return ''; for (const k of r.ids) if (body && body[k]) return String(body[k]); return ''; };

// who did it: the team member's name (the owner's from her profile)
let people = { at: 0, map: null };
async function whoName(id) {
  if (!people.map || Date.now() - people.at > 60e3) {
    const map = new Map();
    (await readJSON('data/employees.json', [])).forEach((e) => map.set(e.id, e.name));
    const admin = await readJSON('data/admin-profile.json', {});
    if (!map.has('admin')) map.set('admin', (admin && admin.name) || 'Admin');
    people = { at: Date.now(), map };
  }
  return people.map.get(id) || (id === 'admin' ? 'Admin' : 'Cineva');
}

// the words for one change
function describe(route, action, body, before, after, out) {
  const b = body || {};
  const verb = VERBS[route + ':' + (action || '')] || VERBS[route + ':*'] || generic(action || '');
  let subject = nameOfThing(after) || nameOfThing(before) || b.clientName || b.name || b.title || b.label ||
    (b.snippet && b.snippet.title) || (b.template && b.template.label) || (b.workflow && b.workflow.name) || '';
  if (route === 'portal-approve') { const x = after || before; if (x) subject = [x.treatment, x.client].filter(Boolean).join(' · ') || subject; }
  if (!subject && b.phone) subject = String(b.phone);
  if (route === 'portal-wa' && b.city) subject = subject || b.city;
  if (route === 'portal-config' && b.academy) {
    const a = b.academy, it = (a.upsert && a.upsert.item) || {};
    subject = it.name || it.title || (a.remove ? 'un element' : '') || (a.manualId ? 'manualul ' + a.manualId : '') || (a.rules ? 'regulile ofertei' : '') || (a.paths ? 'drumul de început' : '') || 'Traininguri';
  }
  let detail = '';
  if (route === 'portal-appointments' && action === 'create') detail = [b.treatment, [pretty('date', b.date), b.time].filter((x) => x && x !== '-').join(' '), b.location].filter(Boolean).join(' · ');
  else if (route === 'portal-leads' && action === 'move_stage' && after && (after.activities || []).length) detail = clip(after.activities[after.activities.length - 1].text, 80);
  else if (route === 'portal-leads' && action === 'log_contact') detail = [b.channel === 'whatsapp' ? 'pe WhatsApp' : 'telefonic', OUTCOME[b.outcome] || '', clip(b.text, 60)].filter(Boolean).join(' · ');
  else if (route === 'portal-leads' && action === 'add_note') detail = clip(b.text, 80);
  else if (route === 'portal-whatsapp' && (action === 'send' || action === 'send_media')) detail = clip(b.text || b.caption || b.filename, 80);
  else if (route === 'portal-sale') detail = [b.amount ? b.amount + ' lei' : '', b.cashAmount ? 'cash ' + b.cashAmount : '', b.cardAmount ? 'card ' + b.cardAmount : ''].filter(Boolean).join(' · ');
  else if (route === 'portal-approve') detail = (b.decision === 'approve' || b.decision === 'approved' ? 'aprobată' : b.decision ? 'respinsă' + (b.reason ? ': ' + clip(b.reason, 60) : '') : '') + ((after || before) && Number((after || before).amount) ? ' · ' + Number((after || before).amount) + ' lei' : '');
  else if (route === 'portal-employees' && action === 'manual_add') detail = (b.kind === 'commission' ? b.value + ' lei' : b.value + ' min') + (b.note ? ' · ' + clip(b.note, 60) : '');
  else if (route === 'portal-leave' && action === 'decide') detail = b.decision === 'approve' || b.decision === 'approved' ? 'aprobată' : 'respinsă';
  else if (route === 'portal-employees' && action === 'set_active') detail = b.active ? 'activ' : 'dezactivat';
  else if (route === 'portal-academy' && action === 'quiz' && out) detail = out.score + ' din ' + out.total;
  else if (route === 'portal-academy' && action === 'case' && out) detail = out.right ? 'corect' : 'greșit';
  else if (route === 'portal-academy' && action === 'task') detail = b.done ? 'făcută, de confirmat' : 'anulată';
  else if (route === 'portal-academy' && action === 'confirm') detail = b.ok ? 'confirmată' : 'trimisă înapoi';
  else if (route === 'portal-academy' && action === 'path') detail = b.role === 'receptie' ? 'recepție' : b.role === 'cosmetician' ? 'cosmeticiană' : 'oprit';
  else if (route === 'portal-config' && b.academy) detail = b.academy.remove ? 'scos' : (b.academy.upsert && b.academy.upsert.item && b.academy.upsert.item.verified ? 'verificat' : '');
  else if (/update|session_update|update_details/.test(action || '')) detail = diff(before, after);
  if (!detail && before && after) detail = diff(before, after);
  return { verb, subject: clip(subject, 80), detail: clip(detail, 160) };
}

// the day a line belongs to, the clinic's day (Bucharest)
const dayOf = (iso) => new Date(iso).toLocaleDateString('sv-SE', { timeZone: 'Europe/Bucharest' });
const keyOf = (day) => 'data/activity/' + day + '.json';

// one line added to its day, checked, so two changes at the same moment both stay
async function append(entry) {
  const key = keyOf(dayOf(entry.at));
  for (let i = 0; i < 4; i++) {
    const list = await readJSON(key, []);
    if (!list.some((e) => e.id === entry.id)) list.push(entry);
    await writeJSON(key, list, { quiet: true });
    const check = await readJSON(key, []);
    if (check.some((e) => e.id === entry.id)) return true;
  }
  return false;
}

// Vercel keeps the function alive for work after the answer (its request context's waitUntil)
function waitUntil() {
  try {
    const c = globalThis[Symbol.for('@vercel/request-context')];
    const ctx = c && typeof c.get === 'function' ? c.get() : null;
    return ctx && typeof ctx.waitUntil === 'function' ? (p) => ctx.waitUntil(p) : null;
  } catch (e) { return null; }
}

// Called by auth.js for each signed-in request: a change (not a read) that answers OK gets its line.
function watch(req, res, session) {
  try {
    if (!req || !res || !session || session.viewer || res.__activity) return;
    if (!req.method || req.method === 'GET' || req.method === 'HEAD' || req.method === 'OPTIONS') return;
    const route = (String(req.url || '').split('?')[0].match(/\/api\/([\w-]+)/) || [])[1] || '';
    if (!route || SKIP.includes(route)) return;
    const body = req.body && typeof req.body === 'object' ? req.body : {};
    if (typeof body.type === 'string' && body.type.startsWith('blob.')) return;
    const action = String(body.action || (req.method === 'DELETE' ? 'delete' : ''));
    if (READS.includes(action)) return;
    res.__activity = true;
    const r = route === 'portal-config' && body.academy ? { area: 'Traininguri', go: 'traininguri' } : ROUTES[route] || { area: route.replace(/^portal-/, ''), go: '' };
    // the thing as it was, read before the route changes it
    const id = idOf(route, body);
    const beforeP = r.doc && id ? readJSON(r.doc, null).then((d) => JSON.parse(JSON.stringify(findById(d, id) || null))).catch(() => null) : Promise.resolve(null);
    const orig = res.json.bind(res);
    res.json = (out) => {
      const status = res.statusCode || 200;
      if (status >= 300 || (out && out.error)) return orig(out);
      const job = (async () => {
        const before = await beforeP;
        const after = r.doc && id ? findById(await readJSON(r.doc, null), id) : null;
        const words = describe(route, action, body, before, after, out);
        const entry = { id: crypto.randomUUID().slice(0, 12), at: new Date().toISOString(), by: session.employeeId, name: await whoName(session.employeeId), role: session.role,
          area: r.area, go: r.go || '', verb: words.verb, subject: words.subject, detail: words.detail, path: route, action };
        await append(entry);
      })().catch((err) => console.error('activity:', err.message));
      const wu = waitUntil();
      if (wu) { wu(job); return orig(out); }
      job.finally(() => orig(out));
      return res;
    };
  } catch (err) { console.error('activity.watch:', err.message); }
}

// the lines of the last days, newest first (Admin → Activitate)
async function lines(days) {
  const n = Math.max(1, Math.min(31, Number(days) || 1));
  const keys = [];
  for (let i = 0; i < n; i++) keys.push(keyOf(dayOf(new Date(Date.now() - i * 864e5).toISOString())));
  const all = (await Promise.all(keys.map((k) => readJSON(k, [])))).flat();
  return all.sort((a, b) => (a.at < b.at ? 1 : -1)).slice(0, 3000);
}

module.exports = { watch, lines, describe, append, dayOf };
