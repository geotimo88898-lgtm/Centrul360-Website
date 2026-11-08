// Once (the owner, 8.11, through his main session: „da” on the new texts for the four Arad ads running since 7.11, the
// file output/2026-11-07_lot01/texte-noi-propuse.md of centrul360-creative-machine, branch arad-lot): two more primary
// texts (P3, P4) and one more headline (H4) for each ad, next to the ones it has, so Meta shows each woman the mix that
// works best. Same picture, form, call to action, Page and Instagram; the budget, the audience and the ad set stay as they
// are: the ad gets a new creative (Meta takes text changes only that way) and goes through Meta's review again.
// Run by the automations' clock (and the portal's pulse); Meta's call limit or another refusal: tried again the next
// hour, for three days. What went in is read back from Meta and kept in data/ads-text-once.json; the public clock
// status (api/clock-status.js) shows, per ad, whether every new text is in.

const { readJSON, writeJSON } = require('./store');
const { loadConnection } = require('./facebook');
const M = require('./meta-ads');

const KEY = 'data/ads-text-once.json';
const DAY = '2026-11-08';
const ADS = [
  {
    "campaignId": "120251787778550103",
    "name": "AR LIPO · rezultat real Arad",
    "bodies": [
      "ARAD, uite un rezultat real de la noi din clinică 👇\nO clientă din Arad, după Liposonix pe abdomen.\n💥 fără operație\n💥 fără diete stricte\n💥 2 zone la preț de una\n640 lei în loc de 1.280 lei, doar pentru primele 10 programări de săptămâna asta.\n👉 Completează formularul și te sunăm noi.",
      "Vrei burtica mai mică fără diete stricte? 👋\nLiposonix lucrează cu ultrasunete pe zona aleasă. Tu stai întinsă, apoi te întorci la treabă.\nAcum 2 zone costă 640 lei, nu 1.280 lei.\n⏰ Doar primele 10 programări din Arad prind prețul ăsta.\nÎți păstrez un loc? 👇"
    ],
    "titles": [
      "REZULTAT REAL ÎN ARAD 📸🔥"
    ]
  },
  {
    "campaignId": "120251787708750103",
    "name": "AR LIPO · copertă revistă",
    "bodies": [
      "ARAD! 10 locuri la Liposonix săptămâna asta ⏰\n2 zone la preț de una: 640 lei în loc de 1.280 lei.\n✨ burtică și talie mai definite\n✨ fără operație, fără ace\n✨ te întorci la treabă în aceeași zi\n👉 Completează formularul și te sunăm noi.",
      "Căutăm 10 doamne din Arad care doresc o talie mai fină până la sărbători 🎄\nFără sală și fără diete stricte: ultrasunete pe 2 zone, 640 lei în loc de 1.280 lei.\nPrețul ține doar pentru primele 10 programări.\nVrei unul dintre locuri? 👇"
    ],
    "titles": [
      "2 ZONE LA PREȚ DE UNA, ARAD 💥"
    ]
  },
  {
    "campaignId": "120251788054230103",
    "name": "AR RF GUSA · copertă 50+",
    "bodies": [
      "ARAD! Gușa, o singură ședință, 119 lei 🔥\nÎn mod normal costă 210 lei. Săptămâna asta avem 8 programări de test la 119 lei.\n✅ fără ace\n✅ fără operație\n✅ fără pauză, te întorci la treabă\n👉 Completează formularul și te sunăm noi.",
      "Căutăm 8 doamne din Arad care doresc o bărbie mai definită până la Crăciun 🎄\nLifting cu radiofrecvență, o singură ședință, fără ace.\n119 lei în loc de 210 lei, doar pentru 8 programări.\nÎți păstrez un loc? ⏰👇"
    ],
    "titles": [
      "GUȘĂ: 119 LEI ÎN LOC DE 210 💨"
    ]
  },
  {
    "campaignId": "120251788054780103",
    "name": "AR RF GUSA · copertă 40+",
    "bodies": [
      "Hei 👋 Am deschis 8 locuri în Arad săptămâna asta pentru lifting gușă cu radiofrecvență.\nO singură ședință, fără ace și fără pauză.\nPrețul normal e 210 lei, acum e 119 lei pentru programările de test.\nVrei să-ți păstrez un loc? 💨👇",
      "ARAD, bărbie și gât mai definite într-o singură ședință ✨\n💥 radiofrecvență, fără ace\n💥 fără operație\n💥 se vede diferența de la prima ședință\n119 lei în loc de 210 lei. Doar 8 locuri săptămâna asta.\n👉 Completează formularul și te sunăm noi."
    ],
    "titles": [
      "DOAR 8 LOCURI LA 119 LEI ⏰"
    ]
  }
];

const RATE = /limit|too many|\(cod (4|17|32|613|80004)\b/i;
const errOf = (j) => { const e = (j && j.error) || {}; return String(e.error_user_msg || e.message || 'eroare') + (e.code ? ' (cod ' + e.code + (e.error_subcode ? '/' + e.error_subcode : '') + ')' : ''); };
const textsOf = (arr) => (Array.isArray(arr) ? arr : []).map((x) => String((x && x.text) || '')).filter(Boolean);
const formOf = (o) => { if (!o || typeof o !== 'object') return ''; if (o.lead_gen_form_id) return String(o.lead_gen_form_id); for (const k of Object.keys(o)) { const v = formOf(o[k]); if (v) return v; } return ''; };
const uniq = (a) => [...new Set(a)];

// one ad: its current texts plus the new ones, in a new creative, put on the ad; then read back
async function addTexts(conn, a) {
  const tok = conn.userToken;
  const list = await M.call('GET', '/' + a.campaignId + '/ads', tok, { fields: 'id,name,effective_status,creative{id,name,object_story_spec,asset_feed_spec}', limit: '10' });
  if (!list.ok) return { error: errOf(list.j) };
  const live = (list.j.data || []).filter((x) => !['DELETED', 'ARCHIVED'].includes(x.effective_status));
  if (live.length !== 1) return { error: 'campania are ' + live.length + ' reclame (aștept una)' };
  const ad = live[0], cr = ad.creative || {}, oss = cr.object_story_spec || {}, afs = cr.asset_feed_spec || {}, ld = oss.link_data || {};
  const bodies0 = textsOf(afs.bodies).length ? textsOf(afs.bodies) : [ld.message].filter(Boolean);
  const titles0 = textsOf(afs.titles).length ? textsOf(afs.titles) : [ld.name].filter(Boolean);
  const descs = textsOf(afs.descriptions).length ? textsOf(afs.descriptions) : [ld.description].filter(Boolean);
  // already in (an earlier run that was read back late): nothing to do
  if (a.bodies.every((t) => bodies0.includes(t)) && a.titles.every((t) => titles0.includes(t))) return { adId: ad.id, already: true, bodies: bodies0.length, titles: titles0.length };
  const hash = ld.image_hash || ((afs.images || [])[0] || {}).hash || '';
  const form = formOf(ld.call_to_action) || formOf(afs);
  const cta = (ld.call_to_action && ld.call_to_action.type) || (afs.call_to_action_types || [])[0] || '';
  if (!hash || !form || !cta || !oss.page_id || !bodies0.length) return { error: 'nu pot citi tot ce are reclama (poză, formular, buton, pagină, texte), n-o ating' };
  const bodies = uniq(bodies0.concat(a.bodies)).slice(0, 5);
  const titles = uniq(titles0.concat(a.titles)).slice(0, 5);
  const spec = { page_id: oss.page_id, link_data: { image_hash: hash, link: ld.link || 'https://fb.me/', message: bodies[0], name: titles[0] || undefined, description: descs[0] || undefined,
    call_to_action: { type: cta, value: { lead_gen_form_id: form } } } };
  if (oss.instagram_user_id) spec.instagram_user_id = oss.instagram_user_id;
  const feed = { bodies: bodies.map((text) => ({ text })), titles: titles.map((text) => ({ text })), optimization_type: 'DEGREES_OF_FREEDOM' };
  if (descs.length) feed.descriptions = descs.slice(0, 5).map((text) => ({ text }));
  const made = await M.call('POST', '/' + conn.adAccountId + '/adcreatives', tok, { name: String(cr.name || ad.name || a.name).slice(0, 80) + ' · texte noi', object_story_spec: spec, asset_feed_spec: feed });
  if (!made.ok) return { error: 'creativul nou: ' + errOf(made.j) };
  const put = await M.call('POST', '/' + ad.id, tok, { creative: { creative_id: made.j.id } });
  if (!put.ok) return { error: 'reclama: ' + errOf(put.j), creativeId: made.j.id };
  const back = await M.call('GET', '/' + ad.id, tok, { fields: 'effective_status,creative{id,asset_feed_spec}' });
  const bb = back.ok ? textsOf(((back.j.creative || {}).asset_feed_spec || {}).bodies) : [];
  const tt = back.ok ? textsOf(((back.j.creative || {}).asset_feed_spec || {}).titles) : [];
  return { adId: ad.id, creativeId: made.j.id, status: back.ok ? back.j.effective_status : '', bodies: bb.length, titles: tt.length,
    exact: a.bodies.every((t) => bb.includes(t)) && a.titles.every((t) => tt.includes(t)) && bodies0.every((t) => bb.includes(t)) };
}

async function run() {
  const st = Object.assign({ done: false, ads: {} }, (await readJSON(KEY, {})) || {});
  if (st.done) return { skipped: true };
  if (st.running && Date.now() - Date.parse(st.running) < 5 * 60e3) return { skipped: 'running' };
  st.running = new Date().toISOString();
  await writeJSON(KEY, st);
  try {
    const conn = await loadConnection(readJSON);
    if (!conn.userToken || !conn.adAccountId) return { skipped: 'not_connected' };
    for (const a of ADS) {
      if (st.ads[a.campaignId] && (st.ads[a.campaignId].exact || st.ads[a.campaignId].already)) continue;
      const r = await addTexts(conn, a).catch((e) => ({ error: String(e.message || e) }));
      st.ads[a.campaignId] = Object.assign({ name: a.name, at: new Date().toISOString() }, r);
      await writeJSON(KEY, st);
      if (r.error && RATE.test(r.error)) break; // Meta's limit: the rest waits for the next hour
    }
    const left = ADS.filter((a) => !(st.ads[a.campaignId] && (st.ads[a.campaignId].exact || st.ads[a.campaignId].already)));
    const old = Date.now() - Date.parse(DAY + 'T00:00:00+02:00') > 3 * 864e5;
    if (!left.length || old) st.done = true;
    return { done: st.done, left: left.length };
  } finally {
    st.running = null;
    await writeJSON(KEY, st).catch(() => {});
  }
}

// for the public clock status: per ad, whether the new texts are in (names and counts only)
async function summary() {
  const st = (await readJSON(KEY, null).catch(() => null)) || {};
  return { done: !!st.done, ads: Object.values(st.ads || {}).map((x) => ({ name: x.name, in: !!(x.exact || x.already), status: x.status || '', bodies: x.bodies || 0, titles: x.titles || 0, error: x.error || '' })) };
}

module.exports = { run, summary, KEY, ADS };
