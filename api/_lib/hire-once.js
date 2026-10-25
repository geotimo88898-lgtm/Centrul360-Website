// Job ads the owners asked for in chat, made by the portal itself (the automations' clock runs it, api/automation-tick.js):
// once per job, a lead form of its own (its leads are candidates, api/_lib/fb-leads.js → Echipa → Candidați, never clients)
// and the ad (Meta's special category EMPLOYMENT), with the picture from the site's files.
//   24.10: a cosmetician for Timișoara, base pay + sales commission, a raise on performance and seniority, only the
//   cosmetician's diploma asked. The ad shows the gross pay (the owner: "reclama spune direct brutul"); it goes out
//   once BRUT is set.
// data/hire-once.json: { jobs: { <id>: { formId, campaignId, at } } }

const { readJSON, writeJSON } = require('./store');
const { loadConnection } = require('./facebook');
const ads = require('./meta-ads');
const { createForm } = require('./fb-form-create');
const WT = require('./wa-templates');
const WA = require('./whatsapp');

// the WhatsApp message a candidate gets (25.10: the job's leads got none, the clients' welcome is about an offer), friendly
// like the treatments' one, asking for her CV (it comes back in Mesaje):
// its own template, from the Timișoara number, sent once Meta approves it, to everyone who applied (those before it too)
const CAND_TPL = {
  label: 'Angajare · Candidat nou · Timișoara · v2', category: 'UTILITY', only: ['Timișoara'],
  body: 'Bună {prenume}! 👋 Mulțumim mult că ai aplicat pentru postul de cosmeticiană la Centrul360 Timișoara. 💛\n\nNe poți trimite CV-ul tău aici, pe WhatsApp? 📄❤️',
};
async function welcomeCandidates() {
  const d = await WT.load();
  // the first version (it said "we'll call you once it comes", 25.10: taken out) is deleted, never sent
  for (const old of d.templates.filter((x) => x.label === 'Angajare · Candidat nou · Timișoara')) { const r = await WT.remove(d, old.id); if (!r.error) await WT.save(d); }
  let t = d.templates.find((x) => x.label === CAND_TPL.label);
  if (!t) {
    const v = WT.clean(CAND_TPL);
    if (v.error) return { template: v.error };
    d.templates.push(v.t);
    const sub = await WT.submit(d, v.t.id, CAND_TPL.only);
    await WT.save(d);
    return { template: sub.error || 'submitted' };
  }
  if (!d.syncedAt || Date.now() - Date.parse(d.syncedAt) > 3 * 60e3) { await WT.sync(d).catch(() => {}); await WT.save(d); t = d.templates.find((x) => x.label === CAND_TPL.label); }
  const list = await readJSON('data/candidates.json', []);
  const todo = list.filter((c) => !c.test && !c.welcomed && (c.welcomeTries || 0) < 3 && String(c.phone || '').replace(/\D/g, '').length >= 9).slice(0, 30);
  const totals = () => ({ candidates: list.filter((c) => !c.test).length, welcomed: list.filter((c) => /^\d{4}-/.test(String(c.welcomed || ''))).length,
    skipped: list.filter((c) => /^skipped/.test(String(c.welcomed || ''))).length, failed: list.filter((c) => !c.welcomed && (c.welcomeTries || 0) >= 3).length,
    times: [...new Set(list.map((c) => String(c.welcomed || '').slice(0, 16)).filter((x) => /^\d{4}-/.test(x)))].sort() });
  if (!todo.length) return Object.assign({ sent: 0 }, totals());
  const wa = { tpls: d.templates, cfg: await WA.loadConfig() };
  const { sendTemplate, firstName } = require('./workflows');
  // someone already talked with her on WhatsApp (the cofounder, the desk, or she wrote first): left to them
  const { normalizePhone } = require('./clients');
  const talked = new Set((await readJSON('data/whatsapp-conversations.json', [])).filter((x) => (x.messages || []).length).map((x) => x.phone));
  let sent = 0, skipped = 0, why = '';
  for (const c of todo) {
    if (talked.has(normalizePhone(c.phone) || String(c.phone))) { c.welcomed = 'skipped: conversation'; skipped++; continue; }
    const r = await sendTemplate(wa, t.id, 'Timișoara', c.phone, { prenume: firstName(c.name), nume: c.name });
    if (r.pending) { why = 'waiting for Meta'; break; } // not approved yet: tried again on the next tick
    if (r.sent) { c.welcomed = new Date().toISOString(); sent++; } else { c.welcomeTries = (c.welcomeTries || 0) + 1; c.welcomeError = r.why; why = r.why; }
  }
  await writeJSON('data/candidates.json', list);
  return Object.assign({ sent, skippedNow: skipped, why: why || undefined }, totals());
}

const KEY = 'data/hire-once.json';
const JOBS = [
  { id: 'cosmeticiana-tm-2026-10-24', city: 'Timișoara', job: 'Cosmeticiană', brut: '5.100', // ≈ 3.000 lei net
    picture: 'https://admin.centrul360.com/brand_asset/angajare-cosmeticiana-tm.jpg',
    form: {
      name: 'Angajare cosmeticiană Timișoara', location: 'Timișoara', fields: ['FULL_NAME', 'PHONE'],
      questions: [
        { label: 'Ai diplomă de cosmeticiană?', options: ['Da', 'Nu încă, sunt la curs'] },
        { label: 'Câtă experiență ai?', options: ['Abia am terminat cursul', 'Sub 1 an', '1-3 ani', 'Peste 3 ani'] },
        { label: 'Când poți începe?', options: ['Imediat', 'În 2 săptămâni', 'Într-o lună sau mai mult'] },
      ],
      ending: { title: 'Mulțumim!', body: 'Ne uităm peste răspunsuri și te sunăm noi în zilele următoare.', whatsapp: '+40750452002' }, // the Timișoara clinic's (site)
    },
    text: (brut) => 'Angajăm cosmeticiană în Timișoara.\n\n💰 Salariu de bază ' + brut + ' lei brut + comision din vânzări\n📈 Creștere salarială după performanță și vechime\n🎓 Cerem doar diploma de cosmeticiană\n📅 Clientele vin din reclamele noastre, agenda e deja plină\n\n👉 Aplică în 30 de secunde din formular, te sunăm noi.',
    headline: 'Angajăm cosmeticiană în Timișoara', description: 'Centrul360 Timișoara' },
];

async function run() {
  const welcome = await welcomeCandidates().catch((e) => ({ error: e.message }));
  const doc = Object.assign({ jobs: {} }, (await readJSON(KEY, {}).catch(() => ({}))) || {});
  const open = JOBS.filter((j) => !(doc.jobs[j.id] && doc.jobs[j.id].campaignId));
  if (!open.length) return { welcome };
  const conn = await loadConnection(readJSON);
  if (!conn.userToken || !conn.adAccountId || !conn.pageId) return { skipped: 'not_connected' };
  const out = {};
  for (const j of open) {
    const st = doc.jobs[j.id] = doc.jobs[j.id] || {};
    // 1. its own form, marked as a job's (its leads become candidates)
    if (!st.formId) {
      const r = await createForm({ readJSON, writeJSON }, j.form);
      if (r.error) { out[j.id] = { form: r.error }; continue; }
      st.formId = r.form.id;
      const forms = await readJSON('data/fb-forms.json', {});
      forms.forms = forms.forms || {};
      forms.forms[st.formId] = Object.assign({}, forms.forms[st.formId], { kind: 'hiring', job: j.job, location: j.city, offerId: '' });
      await writeJSON('data/fb-forms.json', forms);
      out[j.id] = { form: 'made' };
    }
    // 2. the ad, once the gross pay is set
    if (!j.brut) { out[j.id] = Object.assign(out[j.id] || {}, { ad: 'waiting for the gross pay' }); continue; }
    const img = await fetch(j.picture);
    if (!img.ok) { out[j.id] = Object.assign(out[j.id] || {}, { ad: 'picture ' + img.status }); continue; }
    const d = await ads.loadDefaults(readJSON);
    const c = ads.cleanSettings({
      adsetId: '', campaignName: 'TM ANGAJARE · ' + j.job, adsetName: j.city + ' 25 km · toți 18-65', adName: 'Angajăm ' + j.job.toLowerCase() + ' · ' + j.city,
      city: j.city, radiusKm: 25, women: false, ageMin: 18, ageMax: 65, placements: d.placements, budget: d.budget, formId: st.formId,
      primaryText: j.text(j.brut), headline: j.headline, description: j.description, cta: 'APPLY_NOW', startNow: true, employment: true,
    });
    if (c.error) { out[j.id] = Object.assign(out[j.id] || {}, { ad: c.error }); continue; }
    const r = await ads.publish(conn, { base64: Buffer.from(await img.arrayBuffer()).toString('base64'), name: 'angajare-' + j.id + '.jpg' }, c.s);
    if (r.error) { out[j.id] = Object.assign(out[j.id] || {}, { ad: r.error }); continue; }
    st.campaignId = r.campaignId; st.at = new Date().toISOString();
    out[j.id] = Object.assign(out[j.id] || {}, { ad: 'published', campaignId: r.campaignId, warning: r.warning });
  }
  await writeJSON(KEY, doc, { quiet: true });
  return Object.assign(out, { welcome });
}

module.exports = { run, welcomeCandidates };
