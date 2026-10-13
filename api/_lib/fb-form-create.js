// New Facebook lead forms, made from the portal: Integrări → Formulare Facebook → "Formular nou", and
// Creative → Publică pe Meta → "Creează formular" (through api/ads-publish.js). The form is made on the
// connected Page (POST /{page}/leadgen_forms), then kept in the portal's list with its procedure and
// city, so its leads come in with them and the publish window offers it at once.
//
// Meta needs a Page token allowed to manage ads on the Page (pages_manage_ads). The Page connection's
// token is tried first, then the Page token the ads token can give (a System User with the Page).

const { GRAPH_BASE, loadConnection } = require('./facebook');
const { dedash } = require('./dedash');

const FORMS_KEY = 'data/fb-forms.json';
const POLL_KEY = 'data/fb-poll.json';
const SITE = 'https://centrul360.com';
const PRIVACY = SITE + '/politica-de-confidentialitate';
const LOCATIONS = ['Timișoara', 'Arad'];

const clip = (v, n) => dedash(String(v == null ? '' : v)).replace(/\s+/g, ' ').trim().slice(0, n);
const slug = (s) => String(s).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '').slice(0, 40);

// What the window sent → Meta's parameters, or what is wrong, in words.
function clean(input) {
  const i = input || {};
  const name = clip(i.name, 200);
  if (name.length < 2) return { error: 'Scrie numele formularului.' };
  const questions = [{ type: 'FULL_NAME' }, { type: 'PHONE' }];
  if (i.email) questions.push({ type: 'EMAIL' });
  const custom = (Array.isArray(i.custom) ? i.custom : []).slice(0, 5);
  for (const [n, q] of custom.entries()) {
    const label = clip(q && q.label, 120);
    if (!label) continue;
    const opts = (Array.isArray(q.options) ? q.options : []).map((o) => clip(o, 80)).filter(Boolean).slice(0, 10);
    if (Array.isArray(q.options) && q.options.length && opts.length < 2) return { error: 'La „' + label + '” pune cel puțin două variante (sau niciuna, pentru răspuns scris).' };
    const key = 'q' + (n + 1) + '_' + (slug(label) || 'intrebare');
    questions.push(Object.assign({ type: 'CUSTOM', key, label }, opts.length ? { options: opts.map((value, k) => ({ value, key: key + '_' + (k + 1) })) } : {}));
  }
  const params = {
    name,
    questions,
    locale: 'RO_RO',
    privacy_policy: { url: PRIVACY, link_text: 'Politica de confidențialitate' },
    follow_up_action_url: SITE,
    block_display_for_non_targeted_viewer: true,
    is_optimized_for_quality: !!i.quality,
  };
  const intro = i.intro || {};
  const lines = (Array.isArray(intro.lines) ? intro.lines : String(intro.lines || '').split('\n')).map((l) => clip(l, 120)).filter(Boolean).slice(0, 5);
  const introTitle = clip(intro.title, 60);
  if (introTitle || lines.length) {
    params.context_card = { title: introTitle || name.slice(0, 60), style: lines.length > 1 ? 'LIST_STYLE' : 'PARAGRAPH_STYLE', content: lines.length ? lines : [introTitle], button_text: clip(intro.button, 30) || 'Continuă' };
  }
  const headline = clip(i.headline, 60);
  if (headline) params.question_page_custom_headline = headline;
  const t = i.thanks || {};
  params.thank_you_page = {
    title: clip(t.title, 60) || 'Mulțumim! Te sunăm noi.',
    body: clip(t.body, 300) || 'O colegă de la Centrul360 te sună în curând ca să stabiliți ora.',
    button_type: 'VIEW_WEBSITE', button_text: clip(t.button, 30) || 'Vezi site-ul', website_url: SITE,
  };
  const reg = { offerId: clip(i.offerId, 80), location: LOCATIONS.includes(i.location) ? i.location : '' };
  return { params, reg };
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

// Makes the form and puts it in the portal's list. { form } or { error } (in words).
async function createForm(store, input, deps) {
  const c = clean(input);
  if (c.error) return { error: c.error };
  const conn = await loadConnection(store.readJSON);
  if (!conn.pageId) return { error: 'Facebook nu e conectat (Integrări → Facebook).' };
  const send = (deps && deps.post) || post;
  const tokens = [conn.pageAccessToken];
  let r = { error: 'fără token' };
  for (let k = 0; k < 2; k++) {
    const token = k === 0 ? conn.pageAccessToken : await pageTokenFromAds(conn);
    if (!token || (k === 1 && tokens.includes(token))) continue;
    tokens.push(token);
    r = await send(conn.pageId, token, c.params);
    // a language Meta doesn't take for forms: the same form without it
    if (r.error && /locale/i.test(r.error)) { const p = Object.assign({}, c.params); delete p.locale; r = await send(conn.pageId, token, p); }
    // only a permission problem is worth the other token; a wrong field stays wrong
    if (r.id || ![10, 200, 190, 3].includes(Number(r.code))) break;
  }
  if (!r.id) {
    const perm = [10, 200, 190].includes(Number(r.code)) || /permission|permis/i.test(r.error);
    return { error: perm
      ? 'Meta nu ne lasă să creăm formulare pe Pagină: conexiunea are nevoie de permisiunea pages_manage_ads. Reconectează Facebook în Integrări (sau dă-i utilizatorului de sistem Pagina cu drept de reclame).'
      : 'Meta: ' + r.error };
  }
  const now = new Date().toISOString();
  const [doc, poll] = await Promise.all([store.readJSON(FORMS_KEY, {}), store.readJSON(POLL_KEY, {})]);
  doc.forms = doc.forms || {};
  doc.forms[r.id] = Object.assign({ name: c.params.name, leads: 0, createdHere: now }, c.reg,
    { questions: c.params.questions.map((q) => ({ key: q.key || q.type.toLowerCase(), label: q.label || '', type: q.type, options: q.options || [] })) });
  poll.forms = [{ id: r.id, name: c.params.name, status: 'ACTIVE', count: 0, created: now, lastAt: 0 }].concat((poll.forms || []).filter((f) => f.id !== r.id));
  await Promise.all([store.writeJSON(FORMS_KEY, doc), store.writeJSON(POLL_KEY, poll)]);
  return { form: { id: r.id, name: c.params.name, location: c.reg.location, offerId: c.reg.offerId } };
}

module.exports = { createForm, clean };
