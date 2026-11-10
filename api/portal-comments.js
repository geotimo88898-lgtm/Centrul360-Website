// /api/portal-comments, admin only (Integrări → Facebook → Comentarii): the answers to the comments on the clinic's
// posts and ads (api/_lib/social-comments.js).
//   GET or POST { action: 'get' }        → { on, comments: the last 50, newest first, status: { ready, missing, feed, igComments } }
//   POST { action: 'toggle', on }        → the switch „Răspunde automat la comentarii”
//   POST { action: 'retry', id }         → write and send the answer now (a comment skipped or failed)
//   POST { action: 'skip', id }          → no answer to this one

const { requireAdmin } = require('./_lib/auth');
const SC = require('./_lib/social-comments');

async function view() {
  const [set, comments, st] = await Promise.all([SC.settings(), SC.list(50), require('./_lib/social-inbox').status().catch((e) => ({ error: e.message }))]);
  return { on: set.on, comments: comments.map((c) => ({ id: c.id, channel: c.channel, name: (c.from && c.from.name) || '', text: c.text || '', at: c.at,
    state: c.state, reply: c.reply || '', why: c.why || '', repliedAt: c.repliedAt || '', link: c.link || '' })), status: st.error ? { error: st.error } : st.comments };
}

module.exports = async (req, res) => {
  const session = await requireAdmin(req, res);
  if (!session) return;
  res.setHeader('Cache-Control', 'no-store');
  try {
    const body = (req.method === 'POST' && req.body) || {};
    const action = req.method === 'GET' ? 'get' : body.action;
    const id = String(body.id || '').slice(0, 80);
    if (action === 'get') { res.status(200).json(await view()); return; }
    if (req.method !== 'POST') { res.status(405).json({ error: 'method_not_allowed' }); return; }
    if (action === 'toggle') { await SC.setOn(body.on !== false, session.name || session.employeeId); res.status(200).json(await view()); return; }
    if (action === 'retry') {
      const r = await SC.retry(id);
      if (r.error) { res.status(r.error === 'not_found' ? 404 : 409).json({ error: r.error }); return; }
      res.status(200).json(Object.assign({ result: r.result }, await view()));
      return;
    }
    if (action === 'skip') {
      const r = await SC.skip(id, session.name || '');
      if (r.error) { res.status(404).json({ error: r.error }); return; }
      res.status(200).json(await view());
      return;
    }
    res.status(400).json({ error: 'unknown_action' });
  } catch (err) {
    console.error('portal-comments:', err.message);
    res.status(500).json({ error: 'server_error' });
  }
};
