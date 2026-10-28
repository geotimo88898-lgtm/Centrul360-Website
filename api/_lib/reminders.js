// The messages a client gets for a booking (the owner, 28.10), per clinic, from the clinic's number, each with its
// map pin, signed Giovvana:
//   at the booking        "Programarea dvs. a fost confirmată! Ne vedem pe {data}, la ora {ora} …" (not for a package session)
//   the day before, 9:00  "Vă reamintim de programarea de mâine …" with the buttons „Da, ajung” / „Nu ajung”: the answer
//                         confirms or cancels the appointment by itself and the desk hears it (reply() below)
//   2 hours before        "Ne vedem în 2 ore …" with the parking (in Arad also how to find the door)
// No review message for now (the owner: "momentan nu").
// apply() sends the templates to Meta and gives a city's flow "Reamintiri · <oraș>" its new steps only once Meta approved
// all three for that city's number, so a booking is never left without a message; the appointments already waiting in
// it go on with the new messages (_lib/workflows.js moveRuns). Run by the automations' clock (_lib/wf-once.js) until
// both clinics have them, and by Automatizări → Mesaje → Reamintiri.

const { readJSON, writeJSON } = require('./store');
const WF = require('./workflows');
const WT = require('./wa-templates');
const WA = require('./whatsapp');
const { notifyMany, adminIds, cityTag } = require('./notify');

const KEY = 'data/reminders-msgs.json'; // { told: [what the admins were told once] }
const SIGN = 'Giovvana - Centrul360';
const YES = 'Da, ajung', NO = 'Nu ajung';
const NOTE = 'Confirmare la programare, cu o zi înainte la 9:00 cu Da / Nu ajung, cu 2 ore înainte cu parcarea.';
const CITY = {
  'Timișoara': { addr: 'Strada Bucegi nr. 7, Timișoara', parking: 'găsiți loc chiar în fața locației sau pe străduța în jos, gratuit.' },
  Arad: { addr: 'Strada Ioan Alexandru 16-18, Arad', parking: 'găsiți loc chiar în fața locației sau pe străduța în jos.',
    more: 'Indicații: Cum veniți de pe Blvd. Iuliu Maniu este în clădirea albă la penultima ușă de termopan. Dacă nu găsiți ne puteți contacta la +40 750 277 394.' },
};
const nowISO = () => new Date().toISOString();
const fold = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
const digits = (s) => String(s || '').replace(/\D/g, '');

function templates(c) {
  const C = CITY[c];
  return [
    { key: 'confirm', label: 'Reamintiri · Confirmare · ' + c, buttons: [],
      body: 'Bună, {prenume}! 🌸 Programarea dvs. a fost confirmată!\nNe vedem pe {data}, la ora {ora}, la Centrul360 ' + c + '.\n📍 ' + C.addr + '\n\nCu drag, ' + SIGN },
    { key: 'day', label: 'Reamintiri · Ziua dinainte · ' + c, buttons: [{ type: 'QUICK_REPLY', text: YES }, { type: 'QUICK_REPLY', text: NO }],
      body: 'Bună, {prenume}! 🌸 Vă reamintim de programarea de mâine, de la ora {ora}, la Centrul360 ' + c + '.\n📍 ' + C.addr + '\n\nNe confirmați că ajungeți? 💛\n' + SIGN },
    { key: '2h', label: 'Reamintiri · Cu 2 ore înainte · ' + c, buttons: [],
      body: 'Ne vedem în 2 ore, {prenume}! 💛\n📍 ' + C.addr + '\n🚗 Parcare: ' + C.parking + (C.more ? '\n' + C.more : '') + '\n\nPe curând! ' + SIGN },
  ].map((t) => Object.assign({ category: 'UTILITY', headerType: 'LOCATION', footer: '' }, t));
}
function steps(ids) {
  const wa = (k) => ({ type: 'whatsapp', templateId: ids[k], from: 'auto' });
  return [
    { type: 'if', cond: 'package', name: 'Ședință din pachet', yes: [], no: [wa('confirm')] },
    { type: 'wait', mode: 'before', amount: 1, unit: 'd', at: '09:00' },
    { type: 'stop_if', cond: 'appt_inactive' },
    wa('day'),
    { type: 'wait', mode: 'before', amount: 2, unit: 'h' },
    { type: 'stop_if', cond: 'appt_inactive' },
    wa('2h'),
  ];
}

// the template with today's words (a changed text is a new version, "… · v2": Meta doesn't change a sent one)
const sameText = (t, s) => WT.friendly(t).trim() === s.body.trim() && (t.headerType || '') === s.headerType &&
  JSON.stringify((t.buttons || []).map((b) => b.text)) === JSON.stringify(s.buttons.map((b) => b.text));
const versions = (d, s) => d.templates.filter((x) => x.label === s.label || String(x.label || '').startsWith(s.label + ' · v'));
const findTpl = (d, s) => versions(d, s).filter((x) => sameText(x, s)).sort((a, b) => (WT.overall(a) === 'REJECTED') - (WT.overall(b) === 'REJECTED'))[0] || null;
const tplIds = (list) => WF.flat(list).filter((s) => s.type === 'whatsapp' && s.templateId).map((s) => s.templateId);
const flowOf = (doc, c) => doc.workflows.find((w) => w.name === 'Reamintiri · ' + c) ||
  doc.workflows.find((w) => w.folder === 'reminders' && w.trigger && w.trigger.type === 'appointment_created' && w.trigger.location === c);

// Per city: no_number (WhatsApp not connected), missing (a template not made / not sent yet), rejected (Meta refused
// one), pending (at Meta), ready (approved, the flow doesn't use them yet), on (the flow has them). Read-only.
function cityState(d, cfg, doc, c) {
  if (!WA.readyNumbers(cfg).includes(c)) return { state: 'no_number' };
  const waba = cfg.numbers[c].wabaId;
  const list = templates(c).map((s) => ({ s, t: findTpl(d, s) }));
  const st = (t) => (t && t.meta[waba] ? t.meta[waba].status : '');
  const wf = flowOf(doc, c);
  const o = { flow: wf ? wf.id : '', templates: list.map(({ s, t }) => ({ key: s.key, label: (t && t.label) || s.label, id: t ? t.id : '', status: st(t) || 'DRAFT' })) };
  const bad = list.find(({ t }) => st(t) === 'REJECTED');
  if (bad) return Object.assign(o, { state: 'rejected', reason: bad.t.meta[waba].reason || '', label: bad.t.label });
  if (list.some(({ t }) => !t || !st(t) || st(t) === 'DELETED')) return Object.assign(o, { state: 'missing' });
  if (list.some(({ t }) => st(t) !== 'APPROVED')) return Object.assign(o, { state: 'pending' });
  const used = wf ? tplIds(wf.steps) : [];
  return Object.assign(o, { state: list.every(({ t }) => used.includes(t.id)) ? 'on' : 'ready' });
}
function status(d, cfg, doc) {
  const cities = {};
  WA.CITIES.forEach((c) => { cities[c] = cityState(d, cfg, doc, c); });
  return { cities, todo: Object.values(cities).filter((x) => x.state === 'missing' || x.state === 'ready').length };
}

async function tell(key, title, text) {
  const st = (await readJSON(KEY, null)) || { told: [] };
  if (st.told.includes(key)) return;
  st.told.push(key);
  await writeJSON(KEY, st, { quiet: true });
  const ids = await adminIds({ readJSON });
  await notifyMany({ readJSON, writeJSON }, ids, { kind: 'alert', tone: /respins/i.test(title) ? 'bad' : 'good', go: 'fluxuri', title, text }).catch((e) => console.error('reminders tell:', e.message));
}

// Makes and sends to Meta what is missing, reads Meta's answers, and switches the flow of every city whose three
// messages are approved. Returns { cities: { <oraș>: { state, … } }, wait } (wait: a city still on its way).
async function apply() {
  const cfg = await WA.loadConfig();
  const d = await WT.load();
  let doc = await WF.loadDoc();
  const out = { cities: {} };
  let dirty = false;
  for (const c of WA.CITIES) {
    if (cityState(d, cfg, doc, c).state !== 'missing') continue;
    for (const s of templates(c)) {
      let t = findTpl(d, s);
      if (!t) {
        const labels = new Set(d.templates.map((x) => x.label));
        let label = s.label, v = 1;
        while (labels.has(label)) label = s.label + ' · v' + (++v);
        const r = WT.clean(Object.assign({}, s, { label, only: [c] }));
        if (r.error) { out.cities[c] = { state: 'error', error: r.error }; break; }
        t = r.t;
        d.templates.push(t);
        dirty = true;
      }
      const m = t.meta[cfg.numbers[c].wabaId];
      if (m && m.status !== 'DELETED') continue;
      const r = await WT.submit(d, t.id, [c]);
      dirty = true;
      if (r.error) { out.cities[c] = { state: 'error', error: r.error }; break; }
    }
  }
  // Meta's answers (once something waits for one; just sent ones are read at the next run)
  if (!dirty && WA.CITIES.some((c) => cityState(d, cfg, doc, c).state === 'pending')) { await WT.sync(d); dirty = true; }
  if (dirty) await WT.save(d);
  for (const c of WA.CITIES) {
    const o = Object.assign(cityState(d, cfg, doc, c), out.cities[c] && out.cities[c].error ? out.cities[c] : {});
    out.cities[c] = o;
    if (o.state === 'rejected') await tell('rejected:' + o.label, 'Meta a respins un mesaj de programare' + cityTag(c), '„' + o.label + '”' + (o.reason ? ': ' + o.reason : '') + '. Rămân mesajele de acum.');
    if (o.state !== 'ready') continue;
    const ids = {};
    o.templates.forEach((x) => { ids[x.key] = x.id; });
    doc = await WF.loadDoc();
    const wf = flowOf(doc, c);
    const v = WF.validateWorkflow({ name: wf ? wf.name : 'Reamintiri · ' + c, note: NOTE, active: wf ? wf.active : false, folder: wf ? wf.folder : 'reminders',
      trigger: { type: 'appointment_created', location: c }, steps: steps(ids) });
    if (v.error) { o.state = 'error'; o.error = v.error; continue; }
    const old = wf ? wf.steps : [];
    let flow = wf;
    if (wf) Object.assign(wf, { steps: v.workflow.steps, note: NOTE, updatedAt: nowISO() });
    else { flow = Object.assign({ id: require('crypto').randomUUID(), createdAt: nowISO(), updatedAt: nowISO() }, v.workflow); doc.workflows.push(flow); }
    await WF.saveDoc(doc);
    const moved = wf ? await WF.moveRuns(flow, old) : { moved: 0, ended: 0 };
    const added = flow.active ? await WF.enrollUpcoming(flow) : 0;
    Object.assign(o, { state: 'on', switched: true, moved: moved.moved, ended: moved.ended, added });
    await tell('on:' + c + ':' + ids.day, 'Mesajele noi la programare' + cityTag(c), flow.active
      ? 'Confirmarea, ziua dinainte la 9:00 cu „Da, ajung” / „Nu ajung”, cu 2 ore înainte cu parcarea. „Nu ajung” anulează singur programarea.'
      : 'Sunt în „' + flow.name + '”, care e oprită: pornește-o din Automatizări ca să plece.');
  }
  out.wait = WA.CITIES.some((c) => ['missing', 'pending', 'ready', 'error'].includes(out.cities[c].state));
  return out;
}

// A client tapped a button of a reminder (_lib/../webhook-whatsapp.js): „Da, ajung” confirms her appointment, „Nu ajung”
// cancels it (the owner, 28.10: "se anulează singură"), and admins + the clinic's reception hear it on the bell and the
// phone. b = { phone, text, appt (the appointment the reminder was sent for), templateId }. The appointment: the one the
// reminder was for, else (a reminder sent before this) her next one in the next 3 days. Returns true when it was one.
async function reply(b) {
  const tap = fold(b.text);
  const yes = /^(da\b|reusesc)/.test(tap), no = /^nu\b/.test(tap);
  if (!yes && !no) return false;
  const tpl = b.templateId ? (await WT.load()).templates.find((t) => t.id === b.templateId) : null;
  // a button of one of our templates (or, the message it answers no longer in the chat, one of these words exactly)
  if (tpl ? !(tpl.buttons || []).some((x) => fold(x.text) === tap) : ![YES, NO, 'Reușesc să ajung'].map(fold).includes(tap)) return false;
  const KEYA = 'data/appointments.json';
  const appts = await readJSON(KEYA, []);
  const key = digits(b.phone).slice(-9), now = Date.now();
  const hers = (x) => x && !x.block && key.length >= 9 && digits(x.clientPhone).slice(-9) === key;
  // the reminder went to her number for this appointment (the phone on her sheet can differ from the one on it)
  let a = b.appt ? appts.find((x) => x.id === b.appt && !x.block) : null;
  if (!a) a = appts.filter((x) => hers(x) && !['anulata', 'finalizata', 'concediu'].includes(x.status) && WF.apptStart(x) > now && WF.apptStart(x) - now < 3 * 86400e3)
    .sort((x, y) => WF.apptStart(x) - WF.apptStart(y))[0];
  const emps = (await readJSON('data/employees.json', [])).filter((e) => e.active !== false);
  const who = (loc) => [...new Set((['admin']).concat(emps.filter((e) => e.role === 'admin' || (e.role === 'receptie' && (!loc || !e.location || e.location === loc))).map((e) => e.id)))];
  const name = (a && a.clientName) || b.name || b.phone;
  const when = a ? String(a.date).slice(8, 10) + '.' + String(a.date).slice(5, 7) + ' ' + (a.time || '') : '';
  const ring = (x, title, text, tone) => notifyMany({ readJSON, writeJSON }, who(x && x.location), { kind: 'booking', tone, title: title + cityTag(x && x.location), text, go: 'programari', tag: 'reply-' + (x ? x.id : key) + (yes ? '-da' : '-nu') });
  if (!a) { await ring(null, 'RĂSPUNS LA REAMINTIRE', name + ' a răspuns „' + b.text + '”, dar nu-i găsesc programarea. Sun-o.', 'info'); return true; }
  const from = a.status;
  if (yes && ['anulata', 'finalizata'].includes(from)) { await ring(a, 'RĂSPUNS LA REAMINTIRE', name + ' · ' + when + ' · a răspuns „' + b.text + '”, dar programarea e ' + (from === 'anulata' ? 'anulată' : 'finalizată') + '. Sun-o.', 'info'); return true; }
  if (no && (['anulata', 'finalizata'].includes(from) || !(WF.apptStart(a) > now))) return true; // nothing left to cancel
  const to = yes ? 'confirmata' : 'anulata';
  if (from !== to) {
    a.status = to;
    a.updatedAt = nowISO();
    a.statusBy = 'Clienta, pe WhatsApp';
    await writeJSON(KEYA, appts);
    if (no) await require('../portal-leads').unbookLead(a, 'Anulată de clientă pe WhatsApp („' + NO + '”)', 'WhatsApp automat');
    // the reminders still waiting stop on a cancel; a flow on "Confirmată" / "Anulată" runs
    await WF.emit('appointment_status', { appointment: a, status: to });
  }
  await ring(a, yes ? 'CONFIRMATĂ DE CLIENTĂ ✅' : 'ANULATĂ DE CLIENTĂ ❌', name + ' · ' + when + ' · a răspuns „' + b.text + '” pe WhatsApp' + (no ? '. Programarea s-a anulat singură.' : ''), yes ? 'good' : 'bad');
  return true;
}

module.exports = { apply, status, reply, flowOf, templates, steps, YES, NO, CITY };
