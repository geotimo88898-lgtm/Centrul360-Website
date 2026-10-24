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

const KEY = 'data/hire-once.json';
const JOBS = [
  { id: 'cosmeticiana-tm-2026-10-24', city: 'Timișoara', job: 'Cosmeticiană', brut: '',
    picture: 'https://admin.centrul360.com/brand_asset/angajare-cosmeticiana-tm.jpg',
    form: {
      name: 'Angajare cosmeticiană Timișoara', location: 'Timișoara', fields: ['FULL_NAME', 'PHONE'],
      questions: [
        { label: 'Ai diplomă de cosmeticiană?', options: ['Da', 'Nu încă, sunt la curs'] },
        { label: 'Câtă experiență ai?', options: ['Abia am terminat cursul', 'Sub 1 an', '1-3 ani', 'Peste 3 ani'] },
        { label: 'Când poți începe?', options: ['Imediat', 'În 2 săptămâni', 'Într-o lună sau mai mult'] },
      ],
      ending: { title: 'Mulțumim!', body: 'Ne uităm peste răspunsuri și te sunăm noi în zilele următoare.' },
    },
    text: (brut) => 'Angajăm cosmeticiană în Timișoara.\n\n💰 Salariu de bază ' + brut + ' lei brut + comision din vânzări\n📈 Creștere salarială după performanță și vechime\n🎓 Cerem doar diploma de cosmeticiană\n📅 Clientele vin din reclamele noastre, agenda e deja plină\n\n👉 Aplică în 30 de secunde din formular, te sunăm noi.',
    headline: 'Angajăm cosmeticiană în Timișoara', description: 'Centrul360 Timișoara' },
];

async function run() {
  const doc = Object.assign({ jobs: {} }, (await readJSON(KEY, {}).catch(() => ({}))) || {});
  const open = JOBS.filter((j) => !(doc.jobs[j.id] && doc.jobs[j.id].campaignId));
  if (!open.length) return { skipped: 'nothing' };
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
  return out;
}

module.exports = { run };
