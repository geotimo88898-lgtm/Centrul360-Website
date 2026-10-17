// New Facebook lead forms, made from the portal: Integrări → Formulare Facebook → "Formular nou", and
// Creative → Publică pe Meta → "Creează formular" (through api/ads-publish.js). The form is made on the
// connected Page (POST /{page}/leadgen_forms), then kept in the portal's list with its procedure and
// city, so its leads come in with them and the publish window offers it at once.
//
// What a form is: its name, its city (the WhatsApp number of the button at the end follows it, so the
// clients write to the right clinic), the contact data asked (name, phone, e-mail …), the three
// screening questions with their answers, and the ending, copied from the forms that already run
// (_lib/fb-form-template.js), changeable per form.
//
// Meta needs a Page token allowed to manage ads on the Page (pages_manage_ads). The Page connection's
// token is tried first, then the Page token the ads token can give (a System User with the Page).

const { GRAPH_BASE, loadConnection } = require('./facebook');
const { dedash } = require('./dedash');
const T = require('./fb-form-template');

const FORMS_KEY = 'data/fb-forms.json';
const POLL_KEY = 'data/fb-poll.json';
const SITE = 'https://www.centrul360.com';
const PRIVACY = 'https://www.centrul360.com/politica-de-confidentialitate';
const SCREENING = 3;

const clip = (v, n) => dedash(String(v == null ? '' : v)).replace(/\s+/g, ' ').trim().slice(0, n);
const slug = (s) => String(s).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '').slice(0, 40);

// What the window sent (+ the template) → Meta's parameters, or what is wrong, in words.
function clean(input, template) {
  const i = input || {};
  const t = template || {};
  const name = clip(i.name, 200);
  if (name.length < 2) return { error: 'Scrie numele formularului.' };
  const city = T.LOCATIONS.includes(i.location) ? i.location : '';
  if (!city) return { error: 'Alege orașul: de el depinde numărul de WhatsApp de la final.' };
  const fields = (Array.isArray(i.fields) ? i.fields : t.fields || ['FULL_NAME', 'PHONE']).filter((f) => T.STANDARD.includes(f));
  if (!fields.includes('PHONE')) return { error: 'Telefonul trebuie cerut: fără el nu putem suna clienta.' };
  const questions = [...new Set(fields)].map((type) => ({ type }));
  const screening = (Array.isArray(i.questions) ? i.questions : []).slice(0, SCREENING);
  for (const [n, q] of screening.entries()) {
    const label = clip(q && q.label, 120);
    const opts = (Array.isArray(q && q.options) ? q.options : []).map((o) => clip(o, 80)).filter(Boolean).slice(0, 10);
    if (!label) return { error: 'Scrie întrebarea ' + (n + 1) + '.' };
    if (opts.length < 2) return { error: 'La întrebarea ' + (n + 1) + ' („' + label + '”) pune cel puțin două răspunsuri.' };
    const key = 'q' + (n + 1) + '_' + (slug(label) || 'intrebare');
    questions.push({ type: 'CUSTOM', key, label, options: opts.map((value, k) => ({ value, key: key + '_' + (k + 1) })) });
  }
  if (screening.length < SCREENING) return { error: 'Formularul are ' + SCREENING + ' întrebări de selecție: completează-le pe toate.' };
  const end = T.endingFor(t.ending ? t : Object.assign({ ending: { title: 'Mulțumim!', body: '' }, cta: { type: 'WHATSAPP' } }, t), city, i.ending);
  if (end.error) return { error: end.error };
  const params = {
    name,
    questions,
    locale: t.locale || 'RO_RO',
    privacy_policy: { url: (t.privacy && t.privacy.url) || PRIVACY, link_text: (t.privacy && t.privacy.linkText) || 'Politica de confidențialitate' },
    follow_up_action_url: SITE,
    block_display_for_non_targeted_viewer: true,
    is_optimized_for_quality: i.quality !== undefined ? !!i.quality : !!t.quality,
    thank_you_page: end.page,
  };
  const headline = clip(i.headline !== undefined ? i.headline : t.headline, 60);
  if (headline) params.question_page_custom_headline = headline;
  // the first page, only when the form wants one (copied from the running forms, changeable)
  const intro = i.intro || null;
  if (intro && intro.on !== false) {
    const lines = (Array.isArray(intro.lines) ? intro.lines : String(intro.lines || '').split('\n')).map((l) => clip(l, 120)).filter(Boolean).slice(0, 5);
    const title = clip(intro.title, 60);
    if (title || lines.length) params.context_card = { title: title || name.slice(0, 60), style: lines.length > 1 ? 'LIST_STYLE' : 'PARAGRAPH_STYLE', content: lines.length ? lines : [title], button_text: clip(intro.button, 30) || 'Continuă' };
  }
  return { params, reg: { offerId: clip(i.offerId, 80), location: city, whatsapp: end.number } };
}

async function post(pageId, token, params) {
  const r = await fetch(GRAPH_BASE + '/' + encodeURIComponent(pageId) + '/leadgen_forms', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(Object.assign({}, params, { access_token: token })),
  });
  const j = await r.json().catch(() => ({}));
  return r.ok && j.id ? { id: String(j.id) } : { error: (j.error && (j.error.error_user_msg || j.error.message)) || 'eroare ' + r.status, code: j.error && j.error.code };
}

// The Page token the ads token can give (a System User the Page is assigned to)
async function pageTokenFromAds(conn) {
  if (!conn.userToken) return '';
  try {
    const r = await fetch(GRAPH_BASE + '/' + encodeURIComponent(conn.pageId) + '?' + new URLSearchParams({ fields: 'access_token', access_token: conn.userToken }));
    const j = await r.json().catch(() => ({}));
    return j.access_token || '';
  } catch (e) { return ''; }
}

// A form on the Page from Meta's parameters: { id } or { error } (in words).
async function postForm(store, params, deps) {
  const conn = await loadConnection(store.readJSON);
  if (!conn.pageId) return { error: 'Facebook nu e conectat (Integrări → Facebook).' };
  const send = (deps && deps.post) || post;
  const tokens = [conn.pageAccessToken];
  let r = { error: 'fără token' };
  for (let k = 0; k < 2; k++) {
    const token = k === 0 ? conn.pageAccessToken : await pageTokenFromAds(conn);
    if (!token || (k === 1 && tokens.includes(token))) continue;
    tokens.push(token);
    r = await send(conn.pageId, token, params);
    // a language Meta doesn't take for forms: the same form without it
    if (r.error && /locale/i.test(r.error)) { const p = Object.assign({}, params); delete p.locale; r = await send(conn.pageId, token, p); }
    // only a permission problem is worth the other token; a wrong field stays wrong
    if (r.id || ![10, 200, 190, 3].includes(Number(r.code))) break;
  }
  if (r.id) return { id: r.id };
  const perm = [10, 200, 190].includes(Number(r.code)) || /permission|permis/i.test(r.error);
  return { error: perm
    ? 'Meta nu ne lasă să creăm formulare pe Pagină: conexiunea are nevoie de permisiunea pages_manage_ads. Reconectează Facebook în Integrări (sau dă-i utilizatorului de sistem Pagina cu drept de reclame).'
    : 'Meta: ' + r.error };
}

// Makes the form and puts it in the portal's list. { form } or { error } (in words).
async function createForm(store, input, deps) {
  const template = await T.getTemplate(store);
  const c = clean(input, template);
  if (c.error) return { error: c.error };
  const r = await postForm(store, c.params, deps);
  if (r.error) return { error: r.error };
  const now = new Date().toISOString();
  const [doc, poll] = await Promise.all([store.readJSON(FORMS_KEY, {}), store.readJSON(POLL_KEY, {})]);
  doc.forms = doc.forms || {};
  doc.forms[r.id] = Object.assign({ name: c.params.name, leads: 0, createdHere: now }, c.reg,
    { questions: c.params.questions.map((q) => ({ key: q.key || q.type.toLowerCase(), label: q.label || '', type: q.type, options: q.options || [] })) });
  poll.forms = [{ id: r.id, name: c.params.name, status: 'ACTIVE', count: 0, created: now, lastAt: 0 }].concat((poll.forms || []).filter((f) => f.id !== r.id));
  await Promise.all([store.writeJSON(FORMS_KEY, doc), store.writeJSON(POLL_KEY, poll)]);
  if (c.reg.offerId && c.reg.location) {
    const offers = await store.readJSON('data/offers.json', null);
    const o = Array.isArray(offers) && offers.find((x) => x.id === c.reg.offerId);
    if (o) { o.forms = Object.assign({}, o.forms, { [c.reg.location]: r.id }); await store.writeJSON('data/offers.json', offers); }
  }
  return { form: { id: r.id, name: c.params.name, location: c.reg.location, offerId: c.reg.offerId, whatsapp: c.reg.whatsapp } };
}

// A form archived on the Page (it stays in Meta's list, the ads can't pick it any more): { ok } or { error }.
async function archiveForm(store, id, deps) {
  const conn = await loadConnection(store.readJSON);
  if (!conn.pageId) return { error: 'Facebook nu e conectat (Integrări → Facebook).' };
  const send = (deps && deps.fetch) || fetch;
  let last = 'fără token';
  for (const token of [conn.pageAccessToken, await pageTokenFromAds(conn)].filter(Boolean)) {
    const r = await send(GRAPH_BASE + '/' + encodeURIComponent(id), { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ status: 'ARCHIVED', access_token: token }) });
    const j = await r.json().catch(() => ({}));
    if (r.ok && (j.success || j.id)) return { ok: true };
    last = (j.error && (j.error.error_user_msg || j.error.message)) || 'eroare ' + r.status;
  }
  return { error: 'Meta: ' + last };
}

module.exports = { createForm, postForm, archiveForm, clean, SCREENING };
