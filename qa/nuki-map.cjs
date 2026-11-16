// The portal's map (portal-guide-map.js), checked against the portal itself (16.11): Nuki and the guide in Traininguri
// send people only where their account really has something, with the words really on the screen.
//   node qa/nuki-map.cjs        (also run by qa/api-checks.cjs). Exits 1 on a failure.
//   1 every place's section is in the menu for those roles (portal.html); a whole section: exactly those roles
//   2 every place's own page (sub) is heard by its section (K.on('<tab>:sub') naming it); every emit has a listener
//   3 every call exists (K.place's CALLS in portal-core.js, and what it calls)
//   4 every lesson's and answer's place is a place of that role
//   5 every label in „quotes” is on the screen (in the portal's code; a few outside it or templated, allowed by name)
//   6 a non-admin's map for Nuki names no owner-only place or page
//   7 no long dashes, no names or titles to say whom to go to, in any text the team reads
const fs = require('fs'), path = require('path');
const ROOT = path.join(__dirname, '..');
const GM = require('../portal-guide-map.js');
const rd = (f) => fs.readFileSync(path.join(ROOT, f), 'utf8');

const results = [];
const check = (item, name, ok, info) => { results.push({ item, name, ok: !!ok }); console.log((ok ? 'ok  ' : 'FAIL') + ' map' + item + ' ' + name + (ok || info == null ? '' : ' → ' + JSON.stringify(info).slice(0, 600))); };

// ---------------------------------------------------------------- the menu: which roles have each section
const html = rd('portal.html');
const nav = html.slice(html.indexOf('<nav class="tabs"'), html.indexOf('</nav>'));
const TABROLES = {};
for (const m of nav.matchAll(/<button\s+([^>]*data-tab="([a-z]+)"[^>]*)>/g)) {
  const attrs = m[1], tab = m[2];
  const roles = /data-roles="([^"]+)"/.test(attrs) ? /data-roles="([^"]+)"/.exec(attrs)[1].split(',') : /admin-only/.test(attrs) ? ['admin'] : GM.ROLES.slice();
  TABROLES[tab] = Array.from(new Set((TABROLES[tab] || []).concat(roles)));
}
// the code the team's screens are made of (the map and the guide's renderer left out: they are what is checked)
const SKIP = new Set(['portal-guide-map.js', 'portal-academy-guide.js']);
const code = fs.readdirSync(ROOT).filter((f) => /^portal-[\w-]+\.js$/.test(f) && !SKIP.has(f)).map((f) => ({ f, s: rd(f) }));
const all = code.map((x) => x.s).join('\n');
const libs = fs.readdirSync(path.join(ROOT, 'api/_lib')).filter((f) => f.endsWith('.js')).map((f) => rd('api/_lib/' + f)).join('\n') + fs.readdirSync(path.join(ROOT, 'api')).filter((f) => f.endsWith('.js')).map((f) => rd('api/' + f)).join('\n');

// 1. sections and roles
{
  const bad = [];
  Object.entries(GM.PLACES).forEach(([id, p]) => {
    if (!p.go.tab) return;
    const have = TABROLES[p.go.tab];
    if (!have) { bad.push(id + ': no menu button for ' + p.go.tab); return; }
    const extra = p.roles.filter((r) => !have.includes(r));
    if (extra.length) bad.push(id + ': ' + extra.join(',') + ' not in the menu');
    if (id === p.go.tab && have.some((r) => !p.roles.includes(r))) bad.push(id + ': the menu has ' + have.join(',') + ', the map ' + p.roles.join(','));
  });
  check(1, 'every place\'s section is in the menu for exactly its roles', !bad.length, bad);
}

// 2. own pages and emits
{
  const listeners = {};
  for (const x of code) for (const m of x.s.matchAll(/K\.on\('([a-z]+):sub',/g)) (listeners[m[1]] = listeners[m[1]] || []).push(x.s.slice(m.index, m.index + 1600));
  const bad = [];
  Object.entries(GM.PLACES).forEach(([id, p]) => {
    if (!p.go.sub) return;
    const ls = listeners[p.go.tab] || [];
    if (!ls.some((body) => body.includes("'" + p.go.sub + "'") || new RegExp('[{,]\\s*' + p.go.sub + ':').test(body))) bad.push(id + ': no ' + p.go.tab + ':sub listener names \'' + p.go.sub + '\'');
  });
  check(2, 'every own page (sub) is handled by its section', !bad.length, bad);
  const emits = Object.entries(GM.PLACES).filter(([, p]) => p.go.emit).filter(([, p]) => !new RegExp("K\\.on\\('" + p.go.emit.replace(/[.:]/g, (c) => '\\' + c) + "'").test(all)).map(([id, p]) => id + ': ' + p.go.emit);
  check(2, 'every emit has a listener', !emits.length, emits);
}

// 3. calls
{
  const core = rd('portal-core.js');
  const block = core.slice(core.indexOf('const CALLS = {'), core.indexOf('K.placeCalls = CALLS'));
  const have = Array.from(block.matchAll(/^\s+([a-zA-Z]+): \(\) =>/gm)).map((m) => m[1]);
  const used = Array.from(new Set(Object.values(GM.PLACES).filter((p) => p.go.call).map((p) => p.go.call)));
  const missing = used.filter((c) => !have.includes(c));
  const targets = { account: /K\.openAccount = /, notif: /K\.openNotifications = /, closeDay: /window\.C360Manager = \{[^}]*close: /.source && /window\.C360Manager = \{[^}]*close: / };
  const gone = used.filter((c) => targets[c] && !targets[c].test(all));
  check(3, 'every call is in K.place and what it calls exists', !missing.length && !gone.length && have.length, { missing, gone, have });
}

// 4. places of the lessons and answers
{
  const bad = [];
  GM.ROLES.forEach((role) => {
    GM.lessons(role).forEach((l) => { if (!GM.can(l.place, role)) bad.push(role + ' lesson ' + l.id + ' → ' + l.place); });
    GM.faq(role).forEach((f) => { if (f.place && !GM.can(f.place, role)) bad.push(role + ' „' + f.q + '” → ' + f.place); });
  });
  check(4, 'every lesson and answer sends to a place of that role', !bad.length, bad);
}

// 5. the labels in quotes are on the screen
{
  // outside the portal's code (the phone's own words, a file name), or templated („Adaugă Ședința N”, „{prenume}”)
  const OUTSIDE = new Set(['Distribuie', 'Adaugă pe ecranul principal', 'Adaugă', 'Instalează', 'centrul360.apk', 'Centrul360', 'Utilizator', 'Parolă', 'Intră în portal',
    'Adaugă Ședința N', '{prenume}', 'Scrie un mesaj…', '+', 'Consultația', 'Portalul', 'Orele mele' /* 'Orele ' + 'mele' */]);
  const texts = [];
  GM.ROLES.forEach((role) => {
    GM.lessons(role).forEach((l) => [l.t, l.what, l.goL, l.never].concat(l.do, l.know).forEach((t) => texts.push(t)));
    GM.faq(role).forEach((f) => texts.push(f.a));
  });
  const labels = new Set();
  texts.forEach((t) => { for (const m of String(t || '').matchAll(/„([^”]+)”/g)) labels.add(m[1]); });
  const corpus = all + '\n' + html + '\n' + libs + '\n' + rd('portal-login.html');
  const missing = Array.from(labels).filter((l) => !OUTSIDE.has(l) && !corpus.includes(l));
  check(5, 'every quoted label (' + labels.size + ') is on the screen', !missing.length, missing);
}

// 6. a non-admin's map: no owner-only place or page
{
  const ownerOnly = Object.entries(GM.PLACES).filter(([, p]) => p.roles.length === 1 && p.roles[0] === 'admin');
  const PAGES = ['Aprobări', 'Cheltuieli', 'Activitate', 'Integrări', 'Ajustări', 'Candidați', 'Reclame', 'Ad Engine', 'Salarii', 'Automatizări', 'Oferte (Admin)', 'Intră în cont', 'Confirmă la închiderea lunii'];
  const bad = [];
  ['manager', 'receptie', 'cosmetician'].forEach((role) => {
    const t = GM.promptText(role);
    ownerOnly.forEach(([id]) => { if (new RegExp('(^- |\\[\\[du:)' + id.replace(/\./g, '\\.') + '(:|\\]\\])', 'm').test(t)) bad.push(role + ': ' + id); });
    PAGES.forEach((w) => { if (new RegExp('(^|[^\\p{L}])' + w.replace(/[()]/g, (c) => '\\' + c) + '(?![\\p{L}])', 'u').test(t)) bad.push(role + ': „' + w + '”'); });
    for (const m of t.matchAll(/\[\[du:([a-z0-9._-]+)\]\]/g)) if (!GM.can(m[1], role)) bad.push(role + ': [[du:' + m[1] + ']]');
  });
  check(6, 'a non-admin\'s map names no owner-only place or page', !bad.length, bad);
}

// 7. dashes, names and titles
{
  const bad = [];
  const WHO = [/\bGeorge\b/, /proprietar/i, /\bmanager(ul|ului|ei|a|ii)\b/i, /\bde manager\b/i, /\badmin(ul|ului)\b/i, /\bșef(ul|a|ei|ului)\b/i, /(spune|cere|întreab)[\p{L}-]*\s+(lui|ei)\s+\p{Lu}/u];
  const scan = (where, t) => { const s = String(t || ''); if (/[—–]/.test(s)) bad.push(where + ': long dash'); WHO.forEach((re) => { if (re.test(s)) bad.push(where + ': ' + re.source + ' in „' + s.slice(0, 90) + '”'); }); };
  GM.ROLES.forEach((role) => {
    GM.lessons(role).forEach((l) => [l.t, l.what, l.goL, l.never].concat(l.do, l.know).forEach((t) => scan(role + ' ' + l.id, t)));
    GM.faq(role).forEach((f) => scan(role + ' faq', f.a));
  });
  Object.entries(GM.PLACES).forEach(([id, p]) => scan('place ' + id, p.title));
  check(7, 'no long dashes, names or titles in the texts', !bad.length, bad);
}

const failed = results.filter((r) => !r.ok);
console.log('\n' + (results.length - failed.length) + '/' + results.length + ' ok' + (failed.length ? ', failed: ' + failed.map((r) => 'map' + r.item + ' ' + r.name).join('; ') : ''));
if (require.main === module) process.exit(failed.length ? 1 : 0);
module.exports = { results };
