// What every new lead form copies from the forms that already run: the ending (title, text) and its
// button (a WhatsApp message to the clinic of the form's city), the first page if they have one, the
// privacy policy, the language, the questions page title, the contact fields. Read from the newest
// active form of each city (Meta), kept in data/fb-form-template.json; the owner changes it in
// Formulare → "Setări formulare". The city of a new form picks its WhatsApp number from here, so the
// clients write to the right clinic.

const { GRAPH_BASE, loadConnection } = require('./facebook');
const { dedash } = require('./dedash');

const KEY = 'data/fb-form-template.json';
const LOCATIONS = ['Timișoara', 'Arad'];
const STANDARD = ['FULL_NAME', 'FIRST_NAME', 'LAST_NAME', 'PHONE', 'EMAIL', 'CITY', 'DOB'];
const FIELDS = 'name,status,locale,questions,privacy_policy_url,follow_up_action_url,question_page_custom_headline,is_optimized_for_quality,' +
  'context_card{title,style,content,button_text},thank_you_page{title,body,button_type,button_text,business_phone_number,website_url,country_code,enable_messenger}';

const clip = (v, n) => dedash(String(v == null ? '' : v)).trim().slice(0, n);
const digits = (s) => String(s || '').replace(/\D/g, '');
// "+40 750 452 002", "0750452002", "wa.me/40750452002", "api.whatsapp.com/send?phone=40…" → "40750452002"
function phoneOf(s) {
  const t = String(s || '');
  const m = /wa\.me\/(\+?\d{8,15})/.exec(t) || /[?&]phone=(\+?\d{8,15})/.exec(t);
  let d = digits(m ? m[1] : t);
  if (d.startsWith('0') && d.length === 10) d = '40' + d.slice(1);
  return d.length >= 9 && d.length <= 15 ? d : '';
}
const pretty = (d) => (d ? '+' + d.replace(/^(\d{2})(\d{3})(\d{3})(\d{3,})$/, '$1 $2 $3 $4') : '');

// one form, as Meta keeps it (falls back to fewer fields if Meta refuses the nested ones)
async function readForm(id, token) {
  for (const fields of [FIELDS, 'name,status,locale,questions,privacy_policy_url,follow_up_action_url']) {
    try {
      const r = await fetch(GRAPH_BASE + '/' + encodeURIComponent(id) + '?' + new URLSearchParams({ fields, access_token: token }));
      const j = await r.json().catch(() => ({}));
      if (r.ok && j && j.id !== undefined) return j;
      if (r.ok && j && j.name) return j;
    } catch (e) { /* next */ }
  }
  return null;
}

// the newest active form of a city: by its set city, else the one read from its name
function newestFor(city, reg, poll) {
  return (poll.forms || [])
    .filter((f) => (!f.status || f.status === 'ACTIVE'))
    .filter((f) => { const r = reg[f.id] || {}; return (r.location || (r.detected && r.detected.location) || '') === city; })
    .sort((a, b) => (b.lastAt || 0) - (a.lastAt || 0) || String(b.created || '').localeCompare(String(a.created || '')))[0] || null;
}

// The WhatsApp numbers the portal is connected to (Integrări → WhatsApp), as a last resort
async function waNumbers() {
  try {
    const cfg = await require('./whatsapp').loadConfig();
    const out = {};
    LOCATIONS.forEach((c) => { const n = cfg.numbers[c]; if (n && n.display) out[c] = phoneOf(n.display); });
    return out;
  } catch (e) { return {}; }
}

function fromForm(j) {
  const tp = j.thank_you_page || {};
  const cc = j.context_card || null;
  const contact = (j.questions || []).map((q) => q.type).filter((t) => STANDARD.includes(t));
  return {
    from: { id: String(j.id || ''), name: String(j.name || '') },
    ending: { title: clip(tp.title, 60), body: clip(tp.body, 500) },
    cta: { type: String(tp.button_type || ''), text: clip(tp.button_text, 30), url: String(tp.website_url || ''), countryCode: String(tp.country_code || ''), enableMessenger: !!tp.enable_messenger },
    intro: cc && (cc.title || (cc.content || []).length) ? { title: clip(cc.title, 60), lines: (cc.content || []).map((x) => clip(x, 120)).filter(Boolean), button: clip(cc.button_text, 30), style: cc.style || '' } : null,
    privacy: { url: String(j.privacy_policy_url || ''), linkText: 'Politica de confidențialitate' },
    locale: String(j.locale || ''),
    headline: clip(j.question_page_custom_headline, 60),
    quality: !!j.is_optimized_for_quality,
    fields: contact.length ? contact : ['FULL_NAME', 'PHONE'],
    number: phoneOf(tp.business_phone_number) || phoneOf(tp.website_url),
  };
}

const EMPTY = () => ({
  ending: { title: 'Mulțumim! Scrie-ne pe WhatsApp', body: 'Apasă butonul de mai jos și scrie-ne pe WhatsApp. O colegă îți răspunde în cel mai scurt timp.' },
  cta: { type: 'WHATSAPP', text: 'Scrie-ne pe WhatsApp', url: '', countryCode: 'RO', enableMessenger: false },
  intro: null, privacy: { url: 'https://www.centrul360.com/politica-de-confidentialitate', linkText: 'Politica de confidențialitate' },
  locale: 'RO_RO', headline: '', quality: false, fields: ['FULL_NAME', 'PHONE'],
  cities: { 'Timișoara': { whatsapp: '' }, Arad: { whatsapp: '' } }, from: null, readAt: '',
});

// The template: saved, or read now from the forms that run (refresh: read again from Meta).
async function getTemplate(store, opts) {
  const saved = await store.readJSON(KEY, null);
  if (saved && !(opts && opts.refresh)) return view(saved);
  const t = saved ? Object.assign(EMPTY(), saved) : EMPTY();
  const conn = await loadConnection(store.readJSON);
  if (conn.pageAccessToken) {
    const [doc, poll] = await Promise.all([store.readJSON('data/fb-forms.json', {}), store.readJSON('data/fb-poll.json', {})]);
    const reg = doc.forms || {};
    let base = null;
    for (const city of LOCATIONS) {
      const f = newestFor(city, reg, poll);
      const j = f ? await readForm(f.id, conn.pageAccessToken) : null;
      if (!j) continue;
      const x = fromForm(Object.assign({ id: f.id }, j));
      if (x.number) t.cities[city] = { whatsapp: x.number, from: x.from };
      if (!base && (x.ending.title || x.cta.type)) base = x;
    }
    if (base) {
      Object.assign(t, { ending: base.ending.title ? base.ending : t.ending, cta: base.cta.type ? base.cta : t.cta, intro: base.intro, privacy: base.privacy.url ? base.privacy : t.privacy,
        locale: base.locale || t.locale, headline: base.headline, quality: base.quality, fields: base.fields, from: base.from });
    }
  }
  const wa = await waNumbers();
  LOCATIONS.forEach((c) => { if (!t.cities[c] || !t.cities[c].whatsapp) t.cities[c] = Object.assign({}, t.cities[c], { whatsapp: wa[c] || '' }); });
  t.readAt = new Date().toISOString();
  await store.writeJSON(KEY, t);
  return view(t);
}
const view = (t) => Object.assign({}, t, { cities: Object.fromEntries(LOCATIONS.map((c) => [c, Object.assign({}, (t.cities || {})[c], { whatsapp: (t.cities && t.cities[c] && t.cities[c].whatsapp) || '', pretty: pretty((t.cities && t.cities[c] && t.cities[c].whatsapp) || '') })])) });

// "Setări formulare": what the owner changed (the numbers, the ending, the button, the policy)
async function saveTemplate(store, input) {
  const cur = Object.assign(EMPTY(), await store.readJSON(KEY, {}));
  const i = input || {};
  for (const c of LOCATIONS) {
    if (i.cities && i.cities[c] && i.cities[c].whatsapp !== undefined) {
      const d = phoneOf(i.cities[c].whatsapp);
      if (i.cities[c].whatsapp && !d) return { error: 'Numărul de WhatsApp pentru ' + c + ' nu pare corect.' };
      cur.cities[c] = Object.assign({}, cur.cities[c], { whatsapp: d });
    }
  }
  if (i.ending) cur.ending = { title: clip(i.ending.title, 60) || cur.ending.title, body: clip(i.ending.body, 500) };
  if (i.cta && i.cta.text !== undefined) cur.cta = Object.assign({}, cur.cta, { text: clip(i.cta.text, 30) || cur.cta.text });
  if (i.privacy && i.privacy.url) { if (!/^https:\/\//.test(i.privacy.url)) return { error: 'Adresa politicii de confidențialitate trebuie să înceapă cu https://' }; cur.privacy = Object.assign({}, cur.privacy, { url: String(i.privacy.url).slice(0, 300) }); }
  if (Array.isArray(i.fields)) { const f = i.fields.filter((x) => STANDARD.includes(x)); if (f.length) cur.fields = f; }
  cur.savedAt = new Date().toISOString();
  await store.writeJSON(KEY, cur);
  return { template: view(cur) };
}

// The ending of a form of this city: the template's, with the city's WhatsApp number in its button.
function endingFor(t, city, over) {
  const o = over || {};
  const num = phoneOf(o.whatsapp) || ((t.cities || {})[city] || {}).whatsapp || '';
  const cta = t.cta || {};
  const type = cta.type || 'WHATSAPP';
  const page = { title: clip(o.title, 60) || t.ending.title, body: clip(o.body, 500) || t.ending.body, button_type: type, button_text: clip(o.button, 30) || cta.text || 'Scrie-ne pe WhatsApp' };
  if (type === 'WHATSAPP' || type === 'CALL_BUSINESS') {
    if (!num) return { error: 'Nu am numărul de WhatsApp pentru ' + city + '. Pune-l în Formulare → Setări formulare.' };
    page.business_phone_number = '+' + num;
    if (cta.countryCode) page.country_code = cta.countryCode;
    if (type === 'WHATSAPP' && cta.enableMessenger) page.enable_messenger = true;
  } else if (type === 'VIEW_WEBSITE') {
    // a wa.me link carries the number (and maybe a ready message): the city's number goes in
    const url = cta.url || 'https://centrul360.com';
    page.website_url = num && /wa\.me\/|whatsapp\.com\/send/.test(url)
      ? url.replace(/(wa\.me\/)\+?\d+/, '$1' + num).replace(/([?&]phone=)\+?\d+/, '$1' + num) : url;
  }
  return { page, number: num };
}

module.exports = { getTemplate, saveTemplate, endingFor, phoneOf, pretty, STANDARD, LOCATIONS };
