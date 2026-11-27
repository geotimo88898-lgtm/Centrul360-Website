// Contacte → „Șterge” (the owner, 27.11: „să pot șterge contacte”, api/portal-contacts.js action delete): only the owner; a
// client goes with her sheets, notes, files, photos, her cases on the site and her leads; a lead-only contact goes with its
// leads; the appointments, the payments and the chat stay. In memory, no network.
//   node qa/contacts-delete.cjs      Exits 1 on a failure.
const path = require('path'), Module = require('module');
const API = path.join(__dirname, '..', 'api');
const fake = (file, exports) => { const p = require.resolve(path.join(API, file)); require.cache[p] = new Module(p); Object.assign(require.cache[p], { filename: p, loaded: true, exports }); };
const mem = new Map(), removed = [];
const clone = (x) => (x === undefined ? x : JSON.parse(JSON.stringify(x)));
fake('_lib/store.js', {
  async readJSON(p, d) { return mem.has(p) ? clone(mem.get(p)) : d; },
  async writeJSON(p, d) { mem.set(p, clone(d)); return { ok: true }; },
  async readJSONTagged(p, d) { return { data: mem.has(p) ? clone(mem.get(p)) : d, etag: '' }; },
  async writeJSONIf(p, d) { mem.set(p, clone(d)); return { ok: true }; },
  async writeBinary() {}, async readBinary() { return null; },
  async removeBinary(p) { removed.push(p); mem.delete(p); }, async readRev() { return ''; }, writeLog: [], merge3: (a, b) => b, async createOnce() { return true; },
});
let SESSION = { employeeId: 'e-adm', role: 'admin' };
fake('_lib/auth.js', { async requireAuth() { return SESSION; }, async requireAdmin() { return SESSION.role === 'admin' ? SESSION : null; }, async requireRole() { return SESSION; } });
const handler = require(path.join(API, 'portal-contacts.js'));
const call = async (body) => { let code = 200, out = null; const res = { status(c) { code = c; return this; }, json(j) { out = j; return this; }, setHeader() {} }; await handler({ method: 'POST', body, headers: {} }, res); return { code, out }; };
let ok = 0; const fails = [];
const check = (name, cond, more) => { if (cond) { ok++; console.log('ok   ' + name); } else { fails.push(name); console.log('FAIL ' + name + (more ? ' → ' + JSON.stringify(more).slice(0, 400) : '')); } };

(async () => {
  mem.set('data/employees.json', [{ id: 'e-adm', name: 'Admin Proba', role: 'admin' }, { id: 'e-rec', name: 'Recepție Proba', role: 'receptie', location: 'Timișoara' }]);
  mem.set('data/clients.json', [{ id: 'c-ana', name: 'Ana Proba', phone: '0700000501', location: 'Timișoara' }, { id: 'c-bia', name: 'Bia Proba', phone: '0700000502', location: 'Arad' }]);
  mem.set('data/contacts/c-ana.json', { notes: [{ id: 'n1', text: 'x' }], files: [{ id: 'f1', path: 'contacts/c-ana/f1.pdf' }],
    sessions: [{ id: 's1', before: { path: 'contacts/c-ana/b1.jpg' }, after: { path: 'contacts/c-ana/a1.jpg' }, photos: [{ id: 'p1', path: 'contacts/c-ana/b1.jpg' }, { id: 'p2', path: 'contacts/c-ana/x2.jpg' }] }],
    consent: { publish: true }, published: [{ kind: 'case', caseId: 'case-ana' }] });
  mem.set('data/cases.json', [{ id: 'case-ana', images: [{ path: 'cases/case-ana/1.jpg' }] }, { id: 'case-other', images: [{ path: 'cases/case-other/1.jpg' }] }]);
  mem.set('data/leads.json', [{ id: 'l-ana', name: 'Ana Proba', phone: '+40700000501' }, { id: 'l-cora', name: 'Cora Proba', phone: '0700000503' }, { id: 'l-cora2', name: 'Cora P.', phone: '0700000503' }, { id: 'l-dana', name: 'Dana Proba', phone: '0700000504' }]);
  mem.set('data/appointments.json', [{ id: 'ap1', clientId: 'c-ana', clientPhone: '0700000501', clientName: 'Ana Proba', date: '2026-11-30' }]);
  mem.set('data/sales.json', [{ id: 's1', clientId: 'c-ana', amount: 300, source: 'incasare' }]);

  SESSION = { employeeId: 'e-rec', role: 'receptie' };
  const no = await call({ action: 'delete', id: 'c-ana' });
  check('reception cannot delete (only the owner)', no.code === 403 && mem.get('data/clients.json').length === 2, no);

  SESSION = { employeeId: 'e-adm', role: 'admin' };
  const r = await call({ action: 'delete', id: 'c-ana' });
  check('the owner deletes a client', r.code === 200 && r.out.deleted === 'client', r);
  check('her card is gone from the clients, the other client stays', mem.get('data/clients.json').map((c) => c.id).join() === 'c-bia');
  check('her sheet (notes, files, sessions) is gone', !mem.has('data/contacts/c-ana.json') && removed.includes('data/contacts/c-ana.json'));
  check('her files and photos are removed (each once)', ['contacts/c-ana/f1.pdf', 'contacts/c-ana/b1.jpg', 'contacts/c-ana/a1.jpg', 'contacts/c-ana/x2.jpg'].every((p) => removed.filter((x) => x === p).length === 1) && r.out.files === 4, { removed, r: r.out });
  check('her case is off the site, the other case stays', mem.get('data/cases.json').map((c) => c.id).join() === 'case-other' && removed.includes('cases/case-ana/1.jpg'));
  check('her lead (the same phone) is gone, so she does not come back as a lead', !mem.get('data/leads.json').some((l) => l.id === 'l-ana'));
  check('her appointment and her payment stay', mem.get('data/appointments.json').length === 1 && mem.get('data/sales.json').length === 1);
  const list = await call({ action: 'list' });
  check('the list: no Ana, as a client or as a lead', list.code === 200 && !list.out.contacts.some((c) => /Ana/.test(c.name)), list.out && list.out.contacts.map((c) => c.name));

  const rl = await call({ action: 'delete', id: 'lead:l-cora' });
  check('a lead-only contact: deleted with her other lead (the same phone); another lead stays', rl.code === 200 && rl.out.deleted === 'lead' && rl.out.leads === 2 && mem.get('data/leads.json').map((l) => l.id).join() === 'l-dana', { rl: rl.out, leads: mem.get('data/leads.json') });
  const gone = await call({ action: 'delete', id: 'c-nobody' });
  check('a contact that is not there: 404', gone.code === 404);

  console.log('\n' + ok + ' ok, ' + fails.length + ' failed');
  process.exit(fails.length ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
