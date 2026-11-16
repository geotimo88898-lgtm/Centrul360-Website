// Meta's errors never reach a page as they came (16.11): a Graph address, an access_token, an account or ad id, Meta's
// English. clean() takes those out (for the server's own log), ui() gives the short Romanian sentence a page shows.
//   clean(raw)            the same text without links, tokens and long ids (logs only)
//   ui(raw)               „Conexiunea cu Meta a expirat…”, „Meta nu a răspuns…”, … (what the page reads)
//   log(where, raw)       console.error of clean(raw), once per call

const clean = (raw) => String(raw == null ? '' : raw)
  .replace(/https?:\/\/\S+/gi, '[link]')
  .replace(/access_token=[^&\s"']+/gi, 'access_token=…')
  .replace(/\bEA[A-Za-z0-9]{20,}\b/g, '…')
  .replace(/\b(act_)?\d{8,}\b/g, '…')
  .slice(0, 300);

function ui(raw) {
  const t = String(raw == null ? '' : raw).toLowerCase();
  if (!t) return 'Meta nu a răspuns. Încearcă din nou peste un minut.';
  if (/access token|session has expired|oauth|error validating|code 190|\b190\b|token/.test(t)) return 'Conexiunea cu Meta a expirat. Integrări → Facebook: conectează din nou.';
  if (/permission|not authorized|\(#10\)|\(#200\)|\(#294\)|ads_read|ads_management|nu dă voie/.test(t)) return 'Conexiunea cu Meta nu are voie să citească reclamele. Integrări → Facebook: conectează din nou, cu reclamele bifate.';
  if (/too many|rate limit|request limit|\(#4\)|\(#17\)|\(#32\)|\(#613\)|80004|user request limit|throttl/.test(t)) return 'Meta primește prea multe cereri acum. Cifrele vin din nou în câteva minute.';
  if (/fetch failed|network|econn|enotfound|timeout|timed out|aborted|socket|rețea|retea|offline/.test(t)) return 'Meta nu a răspuns. Încearcă din nou peste un minut.';
  if (/temporar|unexpected|unknown error|please retry|try again|service/.test(t)) return 'Meta are o problemă trecătoare. Încearcă din nou peste câteva minute.';
  return 'Meta nu a dat cifrele acum. Încearcă din nou peste câteva minute.';
}

// a message Meta wrote for the user (error_user_msg: „Bugetul e prea mic”), without links and ids, kept when it is short
// and readable; anything else: ui()
function action(raw) {
  const c = clean(raw);
  if (!c || /\[link\]|access_token|graph|oauth|\(#\d+\)|exception/i.test(c) || c.length > 200) return ui(raw);
  return c;
}

function log(where, raw) { try { console.error(where + ':', clean(raw)); } catch (e) { /* never in the way */ } }

module.exports = { clean, ui, action, log };
