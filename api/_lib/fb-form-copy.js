// Formulare → "Numere noi la final": every active lead form of the Page copied as it is (the questions and their
// answers, the first page, the questions page title, the ending, the privacy policy, the language), with only the
// number at the end changed to the city's WhatsApp number of now. Meta doesn't let a published form change, so the
// copy is a new form ("<name> · nr. nou"), kept in the portal with the same procedure and city as the old one, so its
// leads come in the same way. The old forms stay as they are until the ads move to the new ones.
//
//   plan(store)        the forms that would be copied: their city, the number at their end now and the new one
//   copyOne(store, id) one form copied: { id, name } or { error } (in words)

const { loadConnection } = require('./facebook');
const T = require('./fb-form-template');
const { postForm, archiveForm } = require('./fb-form-create');

const FORMS_KEY = 'data/fb-forms.json';
const POLL_KEY = 'data/fb-poll.json';
const SUFFIX = ' · nr. nou';
const SITE = 'https://www.centrul360.com';
const PRIVACY = 'https://www.centrul360.com/politica-de-confidentialitate';

const cityOf = (r, name) => r.location || (r.detected && r.detected.location) || (/arad/i.test(name) ? 'Arad' : /timi|\btm\b/i.test(name) ? 'Timișoara' : '');
// "40750452002" written the ways it can be in a text: +40 750 452 002, 0750 452 002, 0750452002 …
function variants(d) {
  if (!d) return [];
  const local = '0' + d.slice(2);
  const sp = (s, parts) => { let i = 0; return parts.map((n) => { const x = s.slice(i, i + n); i += n; return x; }).join(' '); };
  return [...new Set(['+' + d, d, local, '+' + sp(d, [2, 3, 3, 3]), sp(local, [4, 3, 3]), sp(local, [4, 2, 2, 2])])].sort((a, b) => b.length - a.length);
}
// an old number in a text → the new one, in the same style (and no long dash: a comma, the owner's rule)
function swapIn(text, oldD, newD) {
  let out = require('./dedash').dedash(String(text || ''));
  if (!oldD || !newD || oldD === newD) return out;
  const o = variants(oldD), n = variants(newD);
  o.forEach((v, i) => { out = out.split(v).join(n[i] || '+' + newD); });
  return out;
}

async function numbers(store) {
  // the city's number: the one connected in Integrări → WhatsApp, else the one in "Setări formulare"
  const wa = await T.waNumbers();
  const tpl = await T.getTemplate(store);
  const out = {};
  T.LOCATIONS.forEach((c) => { out[c] = wa[c] || ((tpl.cities || {})[c] || {}).whatsapp || ''; });
  return out;
}

// the forms worth copying: the ones the ads send to now (active or paused, not deleted), and the ones with a lead in the
// last 14 days; all: every active form of the Page
async function plan(store, opts) {
  const [doc, poll, nums] = await Promise.all([store.readJSON(FORMS_KEY, {}), store.readJSON(POLL_KEY, {}), numbers(store)]);
  const reg = doc.forms || {};
  const conn = await loadConnection(store.readJSON);
  const used = new Map();
  if (conn.userToken && conn.adAccountId) {
    const ads = await require('./meta-ads').adForms(conn);
    (ads.rows || []).forEach((a) => { const u = used.get(a.formId) || []; u.push(a); used.set(a.formId, u); });
  }
  const recent = (f) => f.lastAt && Date.now() / 1000 - f.lastAt < 14 * 86400;
  const list = (poll.forms || []).filter((f) => !f.status || f.status === 'ACTIVE').filter((f) => !(reg[f.id] || {}).copyOf && !(reg[f.id] || {}).replacedBy)
    .filter((f) => (opts && opts.all) || used.has(f.id) || recent(f));
  const out = [];
  for (const f of list) {
    const r = reg[f.id] || {};
    const city = cityOf(r, f.name || '');
    const j = conn.pageAccessToken ? await T.readForm(f.id, conn.pageAccessToken) : null;
    const tp = (j && j.thank_you_page) || {};
    const old = T.phoneOf(tp.business_phone_number) || T.phoneOf(tp.website_url);
    const ads = used.get(f.id) || [];
    out.push({ id: f.id, name: f.name || r.name || '', city, button: tp.button_type || '', old, oldPretty: T.pretty(old), number: nums[city] || '', pretty: T.pretty(nums[city] || ''),
      ads: ads.length, activeAds: ads.filter((a) => a.status === 'ACTIVE').length,
      leads: f.count || 0, ok: !!(j && j.thank_you_page && city && nums[city]),
      intro: j && j.context_card ? [j.context_card.title].concat(j.context_card.content || []).filter(Boolean).join(' / ') : '', ending: [tp.title, tp.body].filter(Boolean).join(' / '),
      offerId: r.offerId || '',
      why: !j ? 'nu l-am putut citi de pe Facebook' : !j.thank_you_page ? 'nu i-am putut citi finalul' : !city ? 'alege-i orașul mai jos' : !nums[city] ? 'lipsește numărul de WhatsApp pentru ' + city : '' });
  }
  out.sort((a, b) => b.activeAds - a.activeAds || b.ads - a.ads || b.leads - a.leads);
  return { forms: out, numbers: Object.fromEntries(T.LOCATIONS.map((c) => [c, T.pretty(nums[c] || '')])) };
}

async function copyOne(store, id, over, opts) {
  const [doc, nums] = await Promise.all([store.readJSON(FORMS_KEY, {}), numbers(store)]);
  T.LOCATIONS.forEach((c) => { const d = T.phoneOf(over && over[c]); if (d) nums[c] = d; });
  const reg = doc.forms || {};
  const r = reg[id] || {};
  if (r.replacedBy && !(reg[r.replacedBy] || {}).archived) return { error: 'are deja copie: ' + ((reg[r.replacedBy] || {}).name || r.replacedBy) };
  const conn = await loadConnection(store.readJSON);
  if (!conn.pageAccessToken) return { error: 'Facebook nu e conectat (Integrări → Facebook).' };
  const j = await T.readForm(id, conn.pageAccessToken);
  if (!j || !j.thank_you_page) return { error: 'nu l-am putut citi de pe Facebook' };
  const name = String(j.name || r.name || 'Formular');
  const city = cityOf(r, name);
  if (!city) return { error: 'alege-i orașul (Formulare → Orașul)' };
  const num = nums[city];
  if (!num) return { error: 'lipsește numărul de WhatsApp pentru ' + city };
  const tp = j.thank_you_page;
  const old = T.phoneOf(tp.business_phone_number) || T.phoneOf(tp.website_url);
  // the questions exactly as they are (contact fields by their type; the others with their key, text and answers)
  const questions = (j.questions || []).map((q) => (T.STANDARD.includes(q.type) || !q.label
    ? { type: q.type }
    : Object.assign({ type: q.type, key: q.key, label: q.label }, Array.isArray(q.options) && q.options.length ? { options: q.options.map((o) => ({ value: o.value, key: o.key })) } : {})));
  if (!questions.some((q) => q.type === 'PHONE')) return { error: 'formularul nu cere telefonul' };
  const page = { title: swapIn(tp.title, old, num) || 'Mulțumim!', body: swapIn(tp.body, old, num), button_type: tp.button_type || 'WHATSAPP', button_text: tp.button_text || 'Scrie-ne pe WhatsApp' };
  if (['WHATSAPP', 'CALL_BUSINESS'].includes(page.button_type)) page.business_phone_number = '+' + num;
  if (tp.website_url) page.website_url = /wa\.me\/|whatsapp\.com\/send/.test(tp.website_url) ? tp.website_url.replace(/(wa\.me\/)\+?\d+/, '$1' + num).replace(/([?&]phone=)\+?\d+/, '$1' + num) : tp.website_url;
  if (tp.country_code) page.country_code = tp.country_code;
  if (tp.enable_messenger) page.enable_messenger = true;
  const params = {
    name: String((opts && opts.name) || name + SUFFIX).replace(/\s+/g, ' ').trim().slice(0, 200), questions, locale: String(j.locale || 'RO_RO').toUpperCase(),
    privacy_policy: { url: j.privacy_policy_url || PRIVACY, link_text: 'Politica de confidențialitate' },
    follow_up_action_url: j.follow_up_action_url || SITE, block_display_for_non_targeted_viewer: true,
    is_optimized_for_quality: !!j.is_optimized_for_quality, thank_you_page: page,
  };
  if (j.question_page_custom_headline) params.question_page_custom_headline = swapIn(j.question_page_custom_headline, old, num);
  const cc = j.context_card;
  if (cc && (cc.title || (cc.content || []).length)) params.context_card = { title: swapIn(cc.title, old, num) || name.slice(0, 60), style: cc.style || 'PARAGRAPH_STYLE', content: (cc.content || []).map((x) => swapIn(x, old, num)), button_text: cc.button_text || 'Continuă' };
  const made = await postForm(store, params);
  if (!made.id) return { error: made.error };
  // in the portal: the same procedure and city as the old one, the old one pointing to it
  const now = new Date().toISOString();
  const fresh = await store.readJSON(FORMS_KEY, {});
  fresh.forms = fresh.forms || {};
  const o = fresh.forms[id] || {};
  fresh.forms[made.id] = { name: params.name, offerId: o.offerId || '', location: o.location || city, detected: o.detected || null, leads: 0, createdHere: now, whatsapp: num, copyOf: id,
    questions: params.questions.map((q) => ({ key: q.key || q.type.toLowerCase(), label: q.label || '', type: q.type, options: q.options || [] })) };
  fresh.forms[id] = Object.assign(o, { replacedBy: made.id });
  const p = await store.readJSON(POLL_KEY, {});
  p.forms = [{ id: made.id, name: params.name, status: 'ACTIVE', count: 0, created: now, lastAt: 0 }].concat((p.forms || []).filter((f) => f.id !== made.id));
  await Promise.all([store.writeJSON(FORMS_KEY, fresh), store.writeJSON(POLL_KEY, p)]);
  const back = await T.readForm(made.id, conn.pageAccessToken);
  const kept = back && back.thank_you_page ? T.phoneOf(back.thank_you_page.business_phone_number) || T.phoneOf(back.thank_you_page.website_url) : '';
  return { id: made.id, name: params.name, number: T.pretty(num), old: T.pretty(old), kept: T.pretty(kept), button: (back && back.thank_you_page && back.thank_you_page.button_type) || '' };
}

// a form archived on the Page; in the portal: archived, and its original can be copied again
async function archive(store, id) {
  const r = await archiveForm(store, id);
  if (r.error) return r;
  const doc = await store.readJSON(FORMS_KEY, {});
  doc.forms = doc.forms || {};
  const f = doc.forms[id] = doc.forms[id] || {};
  f.archived = new Date().toISOString();
  if (f.copyOf && doc.forms[f.copyOf] && doc.forms[f.copyOf].replacedBy === id) delete doc.forms[f.copyOf].replacedBy;
  const p = await store.readJSON(POLL_KEY, {});
  (p.forms || []).forEach((x) => { if (x.id === id) x.status = 'ARCHIVED'; });
  await Promise.all([store.writeJSON(FORMS_KEY, doc), store.writeJSON(POLL_KEY, p)]);
  return { ok: true };
}

module.exports = { plan, copyOne, archive, swapIn, variants, SUFFIX };
