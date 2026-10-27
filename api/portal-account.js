// POST /api/portal-account, "Contul meu" (avatar menu, top right): every signed-in person manages
// their own account. Actions:
//   get                       → profile, photo, preferences
//   profile   {name, phone, email}
//   username  {username, currentPassword}
//   password  {currentPassword, newPassword}
//   photo_set {dataUrl} / photo_delete   (a square JPEG made in the browser)
//   prefs     {prefs}                    (accent colour, start page, text size, motion)
//   push_key                             → the key a device needs to turn on notifications + how many are on
//   push_on   {sub, device} / push_off {endpoint}   (notifications on this phone / computer, _lib/push.js)
//
// Staff accounts live in data/employees.json, so whatever someone changes here (name, user, photo)
// shows up in the owner's Echipa right away. The owner's bootstrap login (ADMIN_USERNAME /
// ADMIN_PASSWORD in Vercel) has no row there: its name, photo and preferences live in
// data/admin-profile.json, and its user / password stay in Vercel (never lockable from here).

const crypto = require('crypto');
const { readJSON, writeJSON, writeBinary, removeBinary } = require('./_lib/store');
const { requireAuth, hashPassword, verifyPassword, setSessionCookie } = require('./_lib/auth');
const { dedash } = require('./_lib/dedash');
const push = require('./_lib/push');

const ADMIN_PROFILE = 'data/admin-profile.json';
const START_PAGES = ['panou', 'programari', 'mesaje', 'incasari', 'pipeline', 'contacte', 'automatizari', 'comision', 'traininguri', 'condica', 'ofertele', 'aprobari', 'angajati', 'activitate', 'fluxuri', 'integrari', 'oferte', 'reclame', 'kpi', 'setari'];
const MAX_PHOTO = 600 * 1024;

const clip = (v, n) => dedash(String(v == null ? '' : v).trim()).slice(0, n);
const photoUrl = (p) => (p && p.path ? '/api/portal-avatar?id=' + encodeURIComponent(p.id) + '&v=' + encodeURIComponent(p.v || '') : '');

// Only the keys the portal knows, with safe values.
function cleanPrefs(input, prev) {
  const p = Object.assign({}, prev || {});
  const i = input || {};
  if (i.fontSize !== undefined) p.fontSize = ['normal', 'lg', 'xl'].includes(i.fontSize) ? i.fontSize : 'normal';
  if (i.motion !== undefined) p.motion = i.motion === 'reduced' ? 'reduced' : 'normal';
  if (i.theme !== undefined) p.theme = i.theme === 'light' ? 'light' : 'dark';
  if (i.startPage !== undefined) p.startPage = START_PAGES.includes(i.startPage) ? i.startPage : '';
  if (i.accent !== undefined) {
    const a = i.accent || {};
    const hex = (v) => (/^#[0-9a-f]{6}$/i.test(v || '') ? String(v).toLowerCase() : '');
    p.accent = a && (a.id || hex(a.a)) ? { id: String(a.id || 'custom').slice(0, 20), mode: a.mode === 'grad' ? 'grad' : 'solid', a: hex(a.a), b: hex(a.b) } : null;
  }
  return p;
}

function view(acc, isBootstrapAdmin) {
  return {
    id: acc.id, name: acc.name || '', username: isBootstrapAdmin ? '' : (acc.username || ''), role: acc.role, location: acc.location || '',
    phone: acc.phone || '', email: acc.email || '', photo: photoUrl(acc.photo ? Object.assign({ id: acc.id }, acc.photo) : null),
    prefs: acc.prefs || {}, canChangeLogin: !isBootstrapAdmin,
  };
}

module.exports = async (req, res) => {
  if (req.method !== 'POST') { res.status(405).json({ error: 'method_not_allowed' }); return; }
  const session = await requireAuth(req, res);
  if (!session) return;
  const body = req.body || {};
  const fail = (code, error) => res.status(code).json({ error });

  try {
    const employees = await readJSON('data/employees.json', []);
    const isBootstrapAdmin = session.employeeId === 'admin' && !employees.some((e) => e.id === 'admin');
    let acc, persist;
    if (isBootstrapAdmin) {
      acc = Object.assign({ id: 'admin', name: 'Admin', role: 'admin', location: '' }, await readJSON(ADMIN_PROFILE, {}), { id: 'admin', role: 'admin' });
      persist = () => writeJSON(ADMIN_PROFILE, { name: acc.name, phone: acc.phone, email: acc.email, photo: acc.photo || null, prefs: acc.prefs || {} });
    } else {
      acc = employees.find((e) => e.id === session.employeeId && e.active !== false);
      if (!acc) return fail(401, 'not_authenticated');
      persist = () => writeJSON('data/employees.json', employees);
    }
    const done = async () => { await persist(); res.status(200).json({ ok: true, account: view(acc, isBootstrapAdmin) }); };
    const { action } = body;

    if (action === 'get') { res.status(200).json({ ok: true, account: view(acc, isBootstrapAdmin) }); return; }

    const store = { readJSON, writeJSON };
    if (action === 'push_key') { res.status(200).json({ ok: true, key: await push.publicKey(store), devices: await push.devicesOf(store, acc.id) }); return; }
    if (action === 'push_on') {
      if (!(await push.subscribe(store, acc.id, body.sub, body.device))) return fail(400, 'invalid_subscription');
      res.status(200).json({ ok: true, devices: await push.devicesOf(store, acc.id) });
      return;
    }
    if (action === 'push_test') {
      // once per device: the first time notifications are turned on there
      const device = clip(body.device, 80) || 'dispozitiv';
      const tested = await readJSON('data/push-tested.json', {});
      const mine = tested[acc.id] = tested[acc.id] || {};
      if (mine[device]) { res.status(200).json({ ok: true, sent: 0, already: true }); return; }
      mine[device] = new Date().toISOString();
      await writeJSON('data/push-tested.json', tested, { quiet: true });
      const sent = await push.sendPush(store, [acc.id], { title: 'Centrul360', body: 'Notificările merg pe acest telefon. Așa vei primi leadurile noi.', url: '/', tag: 'test' });
      res.status(200).json({ ok: true, sent });
      return;
    }
    if (action === 'push_off') {
      await push.unsubscribe(store, String(body.endpoint || ''), acc.id);
      res.status(200).json({ ok: true, devices: await push.devicesOf(store, acc.id) });
      return;
    }

    if (action === 'profile') {
      const name = clip(body.name, 100);
      if (name.length < 2) return fail(400, 'invalid_name');
      acc.name = name;
      acc.phone = clip(body.phone, 30);
      const email = clip(body.email, 120);
      if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return fail(400, 'invalid_email');
      acc.email = email;
      return done();
    }

    if (action === 'username') {
      if (isBootstrapAdmin) return fail(400, 'admin_login_in_vercel');
      const username = String(body.username || '').trim();
      if (!/^[a-zA-Z0-9._-]{3,40}$/.test(username)) return fail(400, 'invalid_username');
      if (!verifyPassword(String(body.currentPassword || ''), acc.passwordSalt, acc.passwordHash)) return fail(403, 'wrong_password');
      // the owner's login (Vercel) and "admin" are reserved, so nobody's user can look like the owner's
      const reserved = ['admin', String(process.env.ADMIN_USERNAME || '').toLowerCase(), ...require('./_lib/auth').OWNER_ALIASES].filter(Boolean);
      if (reserved.includes(username.toLowerCase()) || employees.some((e) => e.id !== acc.id && String(e.username || '').toLowerCase() === username.toLowerCase())) return fail(409, 'username_taken');
      acc.username = username;
      return done();
    }

    if (action === 'password') {
      if (isBootstrapAdmin) return fail(400, 'admin_login_in_vercel');
      const next = String(body.newPassword || '');
      if (next.length < 8) return fail(400, 'weak_password');
      if (!verifyPassword(String(body.currentPassword || ''), acc.passwordSalt, acc.passwordHash)) return fail(403, 'wrong_password');
      const { salt, hash } = hashPassword(next);
      acc.passwordSalt = salt; acc.passwordHash = hash;
      const t = Date.now();
      acc.passwordChangedAt = new Date(t).toISOString(); // every other device is signed out (_lib/auth.js stillActive)
      require('./_lib/auth').forgetRoster();
      res.req = res.req || req;
      setSessionCookie(res, acc.id, acc.role, null, t + 1); // this device stays signed in
      return done();
    }

    if (action === 'photo_set') {
      const m = /^data:image\/jpeg;base64,([A-Za-z0-9+/=]+)$/.exec(String(body.dataUrl || ''));
      const buf = m ? Buffer.from(m[1], 'base64') : null;
      if (!buf || !buf.length || buf.length > MAX_PHOTO) return fail(400, 'invalid_file');
      const path = 'avatars/' + acc.id + '-' + crypto.randomUUID() + '.jpg';
      await writeBinary(path, buf, 'image/jpeg');
      if (acc.photo && acc.photo.path) await removeBinary(acc.photo.path);
      acc.photo = { path, v: Date.now().toString(36) };
      return done();
    }
    if (action === 'photo_delete') {
      if (acc.photo && acc.photo.path) await removeBinary(acc.photo.path);
      acc.photo = null;
      return done();
    }

    if (action === 'prefs') {
      acc.prefs = cleanPrefs(body.prefs, acc.prefs);
      return done();
    }

    fail(400, 'invalid_action');
  } catch (err) {
    console.error('portal-account error:', err.message);
    res.status(500).json({ error: 'account_failed' });
  }
};

module.exports.photoUrl = photoUrl;
