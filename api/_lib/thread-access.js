// Who may open one conversation (a WhatsApp number, or "ig:" / "fb:"), in Mesaje (api/portal-whatsapp.js) and in Nuki
// (api/portal-nuki.js, which reads the stored conversation with her media): the same rules in both places (16.11).
//   - the manager: only the conversations of the clinics she runs (one with no city stays open to her);
//   - the hiring chats (candidates of the job ads, data/candidates.json): the owner and the manager only, never
//     reception or the cosmeticians (the owner, 16.11).
// threadAllowed(session, phone, { readJSON }) → true / false. No phone: true (nothing to open).
const { canManage } = require('./roles');

const KEY = 'data/whatsapp-conversations.json';
const digits9 = (p) => String(p || '').replace(/\D/g, '').slice(-9);

async function threadAllowed(session, phone, store) {
  const key = String(phone || '');
  if (!key) return true;
  if (!session) return false;
  const readJSON = store.readJSON;
  if (session.role === 'manager') {
    const scope = await require('./city').cityOf(session, readJSON);
    const c = (await readJSON(KEY, [])).find((x) => x.phone === key);
    if (c && c.location && scope && !scope.includes(c.location)) return false;
  }
  if (!canManage(session)) {
    const p9 = digits9(key);
    if (p9.length === 9 && (await readJSON('data/candidates.json', [])).some((x) => !x.test && digits9(x.phone) === p9)) return false;
  }
  return true;
}

module.exports = { threadAllowed, digits9 };
