// Traininguri progress, per person: what she read, her test scores, the cases she solved, the tasks of
// her first-week path (done by her, confirmed by the owner) and the path itself (role + start day).
//
//   data/academy-progress.json  { [employeeId]: { read:{ [ref]: iso }, quiz:{ [ref]: { score, total, best, tries, at } },
//                                 cases:{ [id]: { ok, everOk, choice, tries, at } }, tasks:{ [itemId]: { done, confirmed, by } },
//                                 path: { role, start } | null } }
//
// One document for the whole team; a change is written and read back, so two people answering at the
// same moment both keep theirs.

const crypto = require('crypto');
const { readJSON, writeJSON } = require('./store');

const KEY = 'data/academy-progress.json';
const blank = () => ({ read: {}, quiz: {}, cases: {}, tasks: {}, path: null });
const of = (doc, id) => Object.assign(blank(), (doc && doc[id]) || {});

async function all() { return readJSON(KEY, {}); }

// change one person's progress: fn(progress) edits it in place; returns the saved progress
async function update(employeeId, fn) {
  for (let i = 0; i < 4; i++) {
    const doc = await readJSON(KEY, {});
    const mine = of(doc, employeeId);
    fn(mine);
    mine.v = crypto.randomUUID().slice(0, 8);
    doc[employeeId] = mine;
    await writeJSON(KEY, doc);
    const check = await readJSON(KEY, {});
    if (check[employeeId] && check[employeeId].v === mine.v) return mine;
  }
  throw new Error('progress_conflict');
}

const todayRo = () => new Date().toLocaleDateString('sv-SE', { timeZone: 'Europe/Bucharest' });

module.exports = { KEY, blank, of, all, update, todayRo };
