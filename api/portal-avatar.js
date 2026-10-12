// GET /api/portal-avatar?id=<employeeId>&v=<version> - a team member's profile photo ("Contul
// meu"), for signed-in team members only. The version in the URL changes with every new photo,
// so it can be cached for long.

const { readJSON, readBinary } = require('./_lib/store');
const { requireAuth } = require('./_lib/auth');

module.exports = async (req, res) => {
  if (req.method !== 'GET') { res.status(405).json({ error: 'method_not_allowed' }); return; }
  const session = requireAuth(req, res);
  if (!session) return;
  try {
    const id = String((req.query && req.query.id) || '');
    let photo = null;
    if (id === 'admin') {
      const employees = await readJSON('data/employees.json', []);
      const row = employees.find((e) => e.id === 'admin');
      photo = row ? row.photo : (await readJSON('data/admin-profile.json', {})).photo;
    } else {
      const row = (await readJSON('data/employees.json', [])).find((e) => e.id === id);
      photo = row && row.photo;
    }
    const buf = photo && /^avatars\/[\w-]+\.jpg$/.test(photo.path || '') ? await readBinary(photo.path) : null;
    if (!buf) { res.status(404).json({ error: 'not_found' }); return; }
    res.setHeader('Content-Type', 'image/jpeg');
    res.setHeader('Cache-Control', 'private, max-age=2592000, immutable');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.status(200).send(buf);
  } catch (err) {
    console.error('portal-avatar error:', err.message);
    res.status(500).json({ error: 'avatar_failed' });
  }
};
