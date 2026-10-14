// WhatsApp templates ("Șabloane WhatsApp", Integrări): the only way the clinic writes first on
// WhatsApp. The owner writes one like in HighLevel (name, category, header, message with {prenume},
// {data}… , footer, buttons); it is kept here and, once a number is connected, sent to Meta for
// approval. Meta's own list is read back (statuses, and templates made in WhatsApp Manager).
// Templates live in a WhatsApp Business account (WABA): when Timișoara and Arad are in the same one
// a template is sent once; in two accounts it is sent to both (same name), with a status for each.
//
//   data/wa-templates.json  { syncedAt, syncError, templates: [{
//     id, label, name (Meta's, fixed once sent), category UTILITY | MARKETING, language 'ro',
//     header, body (Meta's form, {{1}} {{2}} …), map (our variable for each {{n}}), footer,
//     buttons [{ type QUICK_REPLY | URL | PHONE_NUMBER, text, url?, phone? }],
//     meta: { [wabaId]: { id, name, status APPROVED | PENDING | REJECTED | PAUSED | DISABLED | DELETED, reason } },
//     updatedAt }] }

const crypto = require('crypto');
const { readJSON, writeJSON, readBinary } = require('./store');
const WA = require('./whatsapp');

const KEY = 'data/wa-templates.json';
// what a message can say about the client / the appointment (the names in _lib/workflows.js vars())
const VARS = ['prenume', 'nume', 'telefon', 'procedura', 'interes', 'tratament', 'locatie', 'adresa', 'zi', 'data', 'ora', 'link_recenzie'];
// Meta wants an example for each variable when it reviews a template
const SAMPLE = { prenume: 'Andreea', nume: 'Andreea Popescu', telefon: '0722 123 456', procedura: 'LipoSonix', interes: 'LipoSonix', tratament: 'Facial Restart',
  locatie: 'Timișoara', adresa: 'Str. Bucegi 7, Timișoara', zi: 'mâine', data: '14.10.2026', ora: '11:00', link_recenzie: 'https://g.page/r/centrul360/review' };
const CATEGORIES = ['UTILITY', 'MARKETING'];

const clip = (s, n) => String(s == null ? '' : s).slice(0, n);
const nowISO = () => new Date().toISOString();

async function load() {
  const d = (await readJSON(KEY, null)) || {};
  return { syncedAt: d.syncedAt || '', syncError: d.syncError || '', templates: Array.isArray(d.templates) ? d.templates.map((t) => Object.assign({ meta: {} }, t)) : [] };
}
const save = (d) => writeJSON(KEY, d);

// the WhatsApp Business accounts of the connected numbers, each with a token that can manage it
async function accounts() {
  const cfg = await WA.loadConfig();
  const out = new Map();
  WA.readyNumbers(cfg).forEach((city) => {
    const n = cfg.numbers[city];
    if (!n.wabaId) return;
    const a = out.get(n.wabaId) || { wabaId: n.wabaId, token: n.token, cities: [] };
    a.cities.push(city);
    out.set(n.wabaId, a);
  });
  return { cfg, list: Array.from(out.values()) };
}

// "Confirmare programare 24h" → confirmare_programare_24h (Meta: lowercase, digits, underscores)
function slug(label) {
  return String(label || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 60) || 'sablon';
}
// our text ({prenume}) ↔ Meta's ({{1}}) + which variable each number is
function toMeta(text) {
  const map = [];
  const body = String(text || '').replace(/\{(\w+)\}/g, (m, k) => (VARS.includes(k) ? (map.push(k), '{{' + map.length + '}}') : m));
  return { body, map };
}
function friendly(t) {
  return String(t.body || '').replace(/\{\{(\d+)\}\}/g, (m, n) => (t.map && t.map[n - 1] ? '{' + t.map[n - 1] + '}' : m));
}
// one word for the template: a draft, or Meta's answer (the worst one when there are two accounts)
function overall(t) {
  const s = Object.values(t.meta || {}).map((m) => m.status).filter((x) => x && x !== 'DELETED');
  if (!s.length) return 'DRAFT';
  if (s.includes('REJECTED')) return 'REJECTED';
  if (s.includes('DISABLED')) return 'DISABLED';
  if (s.includes('PAUSED')) return 'PAUSED';
  if (s.every((x) => x === 'APPROVED')) return 'APPROVED';
  return 'PENDING';
}
const editable = (t) => ['DRAFT', 'REJECTED'].includes(overall(t));

// what she typed, checked against Meta's rules; returns { t } or { error }
const onlyOf = (v) => (Array.isArray(v) ? WA.CITIES.filter((c) => v.includes(c)) : []);
function clean(input, prev) {
  const i = input || {};
  const t = prev ? JSON.parse(JSON.stringify(prev)) : { id: crypto.randomUUID().slice(0, 12), language: 'ro', name: '', meta: {} };
  if (i.only !== undefined) t.only = onlyOf(i.only);
  // the template "Trimite rezultatele" (Contacte → before / after) sends
  if (i.purpose !== undefined) t.purpose = i.purpose === 'results' ? 'results' : '';
  t.label = clip(i.label, 80).trim() || t.label || '';
  if (!t.label) return { error: 'Dă-i un nume șablonului.' };
  if (!prev || editable(prev)) {
    t.category = CATEGORIES.includes(i.category) ? i.category : 'UTILITY';
    // the header: words, or a picture sent with each message (Meta reviews it with an example picture)
    t.headerType = i.headerType === 'IMAGE' ? 'IMAGE' : '';
    t.header = t.headerType === 'IMAGE' ? '' : clip(i.header, 60).trim();
    if (/[{}]/.test(t.header)) return { error: 'Antetul nu poate avea variabile.' };
    const text = clip(i.body, 1024).trim();
    if (!text) return { error: 'Scrie mesajul.' };
    const bad = (text.match(/\{(\w+)\}/g) || []).map((m) => m.slice(1, -1)).filter((k) => !VARS.includes(k));
    if (bad.length) return { error: 'Variabilă necunoscută: {' + bad[0] + '}.' };
    if (/^\{\w+\}/.test(text) || /\{\w+\}[\s.!?…]*$/.test(text)) return { error: 'Meta nu acceptă mesaje care încep sau se termină cu o variabilă. Pune un cuvânt înainte / după ea.' };
    const m = toMeta(text);
    if (m.map.length && text.replace(/\{\w+\}/g, '').replace(/\s+/g, ' ').trim().split(' ').length < m.map.length * 2) return { error: 'Prea multe variabile pentru un mesaj atât de scurt (regula Meta).' };
    t.body = m.body; t.map = m.map;
    t.footer = clip(i.footer, 60).trim();
    if (/[{}]/.test(t.footer)) return { error: 'Subsolul nu poate avea variabile.' };
    const buttons = (Array.isArray(i.buttons) ? i.buttons : []).slice(0, 5)
      .map((b) => ({ type: ['QUICK_REPLY', 'URL', 'PHONE_NUMBER'].includes(b.type) ? b.type : 'QUICK_REPLY', text: clip(b.text, 25).trim(), url: clip(b.url, 2000).trim(), phone: clip(b.phone, 20).replace(/[^\d+]/g, '') }))
      .filter((b) => b.text);
    if (buttons.filter((b) => b.type === 'QUICK_REPLY').length > 3) return { error: 'Cel mult 3 butoane de răspuns rapid.' };
    if (buttons.filter((b) => b.type !== 'QUICK_REPLY').length > 2) return { error: 'Cel mult un buton cu link și unul de apel.' };
    if (buttons.some((b) => b.type === 'URL' && !/^https:\/\/\S+$/.test(b.url))) return { error: 'Linkul unui buton trebuie să înceapă cu https://.' };
    if (buttons.some((b) => b.type === 'PHONE_NUMBER' && !/^\+\d{8,15}$/.test(b.phone))) return { error: 'Numărul unui buton de apel: cu prefix, ex. +40750204243.' };
    t.buttons = buttons.map((b) => (b.type === 'URL' ? { type: b.type, text: b.text, url: b.url } : b.type === 'PHONE_NUMBER' ? { type: b.type, text: b.text, phone: b.phone } : { type: b.type, text: b.text }));
  } else if (Array.isArray(i.map)) {
    // sent / imported: only which variable fills each {{n}} can change (that part is ours, not Meta's)
    const n = (String(t.body).match(/\{\{\d+\}\}/g) || []).length;
    t.map = Array.from({ length: n }, (_, k) => (VARS.includes(i.map[k]) ? i.map[k] : (t.map || [])[k] || ''));
  }
  t.updatedAt = nowISO();
  return { t };
}

function components(t, handle) {
  const c = [];
  if (t.headerType === 'IMAGE') c.push({ type: 'HEADER', format: 'IMAGE', example: { header_handle: [handle || ''] } });
  else if (t.header) c.push({ type: 'HEADER', format: 'TEXT', text: t.header });
  const body = { type: 'BODY', text: t.body };
  if ((t.map || []).length) body.example = { body_text: [t.map.map((k) => SAMPLE[k] || 'exemplu')] };
  c.push(body);
  if (t.footer) c.push({ type: 'FOOTER', text: t.footer });
  if ((t.buttons || []).length) c.push({ type: 'BUTTONS', buttons: t.buttons.map((b) => (b.type === 'URL' ? { type: 'URL', text: b.text, url: b.url } : b.type === 'PHONE_NUMBER' ? { type: 'PHONE_NUMBER', text: b.text, phone_number: b.phone } : { type: 'QUICK_REPLY', text: b.text })) });
  return c;
}
async function graph(token, method, path, params) {
  const opts = { method, headers: { Authorization: 'Bearer ' + token } };
  let url = WA.GRAPH + path;
  if (method === 'GET' || method === 'DELETE') url += (url.includes('?') ? '&' : '?') + new URLSearchParams(params || {});
  else { opts.headers['Content-Type'] = 'application/json'; opts.body = JSON.stringify(params || {}); }
  const r = await fetch(url, opts);
  const j = await r.json().catch(() => ({}));
  const e = (j && j.error) || {};
  return { ok: r.ok, j, error: !r.ok ? (e.error_user_msg || e.message || 'eroare ' + r.status) : '' };
}

// the parts Meta reviews: an image header goes with its example picture, uploaded with the account's access
async function compsFor(t, a) {
  if (t.headerType !== 'IMAGE') return { c: components(t) };
  const buf = t.samplePath ? await readBinary(t.samplePath) : null;
  if (!buf) return { error: 'lipsește poza exemplu' };
  const h = await WA.resumableHandle(a.token, buf, 'image/jpeg');
  if (h.error) return { error: 'poza exemplu: ' + h.error };
  return { c: components(t, h.h) };
}

// send it to Meta for approval, in every connected account that doesn't have it yet (or refused it)
async function submit(d, id, cities) {
  const t = d.templates.find((x) => x.id === id);
  if (!t) return { error: 'Șablonul nu mai există.' };
  if (Array.isArray(cities)) t.only = onlyOf(cities);
  const all = (await accounts()).list;
  // a template for one clinic goes only to that number's account
  const list = (t.only || []).length ? all.filter((a) => a.cities.some((c) => t.only.includes(c))) : all;
  if (!list.length) return { error: 'Conectează întâi un număr de WhatsApp (Integrări → WhatsApp). Până atunci șablonul rămâne ciornă.' };
  const todo = list.filter((a) => !t.meta[a.wabaId] || ['REJECTED', 'DELETED'].includes(t.meta[a.wabaId].status));
  if (!todo.length) return { error: 'Șablonul e deja trimis.' };
  // a name Meta hasn't seen (a refused name stays taken for a while)
  const taken = new Set(d.templates.filter((x) => x.id !== id).map((x) => x.name));
  Object.values(t.meta).forEach((m) => { if (m.status === 'REJECTED' || m.status === 'DELETED') taken.add(m.name); });
  let name = t.name && !taken.has(t.name) ? t.name : slug(t.label);
  const base = name; let n = 2;
  while (taken.has(name)) name = base + '_' + n++;
  t.name = name;
  const errors = [];
  if (t.headerType === 'IMAGE' && !t.samplePath) return { error: 'Adaugă poza exemplu (Meta o cere ca să aprobe un șablon cu imagine).' };
  for (const a of todo) {
    const comps = await compsFor(t, a);
    if (comps.error) { errors.push(a.cities.join(' + ') + ': ' + comps.error); continue; }
    const r = await graph(a.token, 'POST', '/' + a.wabaId + '/message_templates', { name, language: t.language || 'ro', category: t.category, components: comps.c });
    if (r.ok) t.meta[a.wabaId] = { id: String(r.j.id || ''), name, status: String(r.j.status || 'PENDING').toUpperCase(), reason: '' };
    else errors.push(a.cities.join(' + ') + ': ' + r.error);
  }
  t.updatedAt = nowISO();
  return errors.length ? { error: 'Meta: ' + errors.join(' · '), partial: Object.keys(t.meta).length > 0 } : { ok: true, t };
}

// Meta's lists → statuses here; templates made in WhatsApp Manager come in too
async function sync(d) {
  const { list } = await accounts();
  if (!list.length) return { ok: false };
  const errors = [];
  for (const a of list) {
    const all = [];
    let r = await graph(a.token, 'GET', '/' + a.wabaId + '/message_templates', { fields: 'id,name,status,category,language,components,rejected_reason', limit: '200' });
    let failed = false;
    for (let i = 0; i < 5; i++) {
      if (!r.ok) { errors.push(a.cities.join(' + ') + ': ' + r.error); failed = true; break; }
      all.push(...(r.j.data || []));
      const next = r.j.paging && r.j.paging.next;
      if (!next) break;
      const u = new URL(next);
      r = await graph(a.token, 'GET', u.pathname.replace(/^\/v\d+\.\d+/, ''), Object.fromEntries(u.searchParams));
    }
    if (failed) continue;
    all.forEach((m) => {
      let t = d.templates.find((x) => (x.meta[a.wabaId] && x.meta[a.wabaId].id === String(m.id)) || ((x.name === m.name) && (x.language || 'ro') === m.language));
      const comp = (type) => (m.components || []).find((c) => c.type === type) || {};
      if (!t) {
        const body = String(comp('BODY').text || '');
        const n = (body.match(/\{\{\d+\}\}/g) || []).length;
        t = { id: crypto.randomUUID().slice(0, 12), label: m.name.replace(/_/g, ' '), name: m.name, language: m.language, category: CATEGORIES.includes(m.category) ? m.category : 'MARKETING',
          header: comp('HEADER').format === 'TEXT' ? comp('HEADER').text || '' : '', headerType: comp('HEADER').format === 'IMAGE' ? 'IMAGE' : '', body, map: Array.from({ length: n }, (_, k) => (k === 0 ? 'prenume' : '')), footer: comp('FOOTER').text || '',
          buttons: (comp('BUTTONS').buttons || []).map((b) => ({ type: b.type, text: b.text, url: b.url, phone: b.phone_number })), imported: true, meta: {}, updatedAt: nowISO() };
        d.templates.push(t);
      }
      t.meta[a.wabaId] = { id: String(m.id), name: m.name, status: String(m.status || '').toUpperCase(), reason: m.rejected_reason && m.rejected_reason !== 'NONE' ? String(m.rejected_reason) : '' };
    });
    // sent from here but gone from Meta (deleted in WhatsApp Manager)
    const ids = new Set(all.map((m) => String(m.id)));
    d.templates.forEach((t) => { const m = t.meta[a.wabaId]; if (m && m.id && !ids.has(m.id)) m.status = 'DELETED'; });
  }
  await spread(d, list).catch((e) => errors.push('copierea șabloanelor: ' + e.message));
  d.syncedAt = nowISO(); d.syncError = errors.join(' · ');
  return { ok: !errors.length };
}

// A number connected in another (new) account: the templates that already work elsewhere go to it too,
// a few on each sync, so the automations can write from it. Ours and the ones the automations use;
// the ones only imported from WhatsApp Manager (an older tool's) stay where they were.
async function spread(d, list, max = 6) {
  if (list.length < 1) return 0;
  const wf = await readJSON('data/workflows.json', {});
  const used = new Set();
  (wf.workflows || []).forEach((w) => (function walk(steps) { (steps || []).forEach((s) => { if (s.templateId) used.add(s.templateId); if (s.type === 'if') { walk(s.yes); walk(s.no); } }); })(w.steps));
  let sent = 0;
  for (const a of list) {
    for (const t of d.templates) {
      if (sent >= max) return sent;
      if (t.meta[a.wabaId] || (t.imported && !used.has(t.id))) continue;
      if ((t.only || []).length && !a.cities.some((c) => t.only.includes(c))) continue;
      if (!Object.values(t.meta).some((m) => m.status === 'APPROVED')) continue;
      const name = t.name || slug(t.label);
      const comps = await compsFor(t, a);
      if (comps.error) continue;
      const r = await graph(a.token, 'POST', '/' + a.wabaId + '/message_templates', { name, language: t.language || 'ro', category: t.category, components: comps.c });
      t.name = name;
      t.meta[a.wabaId] = r.ok ? { id: String(r.j.id || ''), name, status: String(r.j.status || 'PENDING').toUpperCase(), reason: '' }
        : { id: '', name, status: 'REJECTED', reason: r.error };
      t.updatedAt = nowISO();
      sent++;
    }
  }
  return sent;
}

async function remove(d, id) {
  const t = d.templates.find((x) => x.id === id);
  if (!t) return { ok: true };
  const { list } = await accounts();
  for (const a of list) {
    const m = t.meta[a.wabaId];
    if (!m || !m.id || m.status === 'DELETED') continue;
    const r = await graph(a.token, 'DELETE', '/' + a.wabaId + '/message_templates', { name: m.name, hsm_id: m.id });
    if (!r.ok && !/does not exist|not found/i.test(r.error)) return { error: 'Meta: ' + r.error };
  }
  d.templates = d.templates.filter((x) => x.id !== id);
  return { ok: true };
}

// may this template leave from that number? (approved in the number's account)
function approvedFor(t, wabaId) { const m = t && (t.meta || {})[wabaId]; return !!(m && m.status === 'APPROVED'); }

// what the page, the editor and the flow builder show (no tokens here, only Meta's answers)
function view(t, cfg) {
  const cities = {};
  if (cfg) WA.CITIES.forEach((c) => { const n = cfg.numbers[c]; const m = n.wabaId ? (t.meta || {})[n.wabaId] : null; cities[c] = n.phoneId && n.token ? (m ? m.status : 'DRAFT') : ''; });
  const reasons = Object.values(t.meta || {}).map((m) => m.reason).filter(Boolean);
  return { id: t.id, label: t.label, name: t.name, category: t.category, language: t.language, header: t.header || '', headerType: t.headerType || '', purpose: t.purpose || '', hasSample: !!t.samplePath, text: friendly(t), body: t.body, map: t.map || [],
    footer: t.footer || '', buttons: t.buttons || [], status: overall(t), editable: editable(t), cities, reason: reasons[0] || '', imported: !!t.imported, updatedAt: t.updatedAt || '' };
}

module.exports = { KEY, VARS, SAMPLE, load, save, accounts, clean, submit, sync, remove, friendly, overall, approvedFor, view, slug, toMeta };
