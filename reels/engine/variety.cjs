// The hidden skeleton must never show (the owner, 14.11: „If I look at 10 of our reels, I shouldn't be able to tell
// they're all repetitive”). Compares one script with the last 10 v2 scripts (reels/scripts, newest first; plus a
// factory history file if given) and warns when the shape repeats. The producer rewrites until it prints "clean".
//   node variety.cjs <id> [--history file.json]   (history: [{ id, lead, loops: [..], cta, ctaType, answer, hook }])
// Warnings:
//   - the first 3 words of the lead, of a loop or of the CTA repeat one of the last 10
//   - the same CTA type in 3 of the last 5 (this one included)
//   - the same number of loops in 4 of the last 5
//   - the answer in the same 10 % band in 4 of the last 5
//   - the same visual opens the hook as one of the last 10
// Exit 3 when there are warnings (check.cjs runs it too and only prints them).
const fs = require('fs'), path = require('path');
const BASE = path.join(__dirname, '..', 'scripts');
const asList = (x) => (x == null ? [] : Array.isArray(x) ? x : [x]);
const norm = (s) => String(s || '').replace(/\*/g, '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9 ]+/g, ' ').trim();
const first3 = (s) => norm(s).split(/\s+/).slice(0, 3).join(' ');
function shape(id, S) {
  const lines = [].concat(asList(S.hook), asList(S.beats), asList(S.payoff), asList(S.resolve), asList(S.outro), S.end && S.end.say ? [S.end] : []);
  const say = (b) => b.say || '';
  const lead = lines.find((b) => b.role === 'lead');
  const loops = lines.filter((b) => b.role === 'loop').map(say);
  const ctaL = lines.filter((b) => b.role === 'cta').map(say);
  const end = (S.end && S.end.type) || 'ask', oc = S.outro && S.outro.cta;
  const ctaType = end === 'site' ? 'site' : end === 'comment' ? 'comment' : end === 'save' ? 'save' : end === 'loop' ? (oc === 'send' ? 'send' : 'none') : oc || end;
  // where the answer lands: the first payoff line's start, as a share of the spoken text (or of the real timing)
  let answer = null;
  try { const F = JSON.parse(fs.readFileSync(path.join(BASE, id, 'build', 'film.json'), 'utf8')); if (F.payoff != null) answer = F.payoff / F.total; } catch (e) { /* not rendered yet */ }
  if (answer == null) { const len = lines.map((b) => (b.tts || b.say || '').length); const pi = lines.indexOf(asList(S.payoff)[0]); if (pi >= 0) answer = len.slice(0, pi).reduce((a, x) => a + x, 0) / Math.max(1, len.reduce((a, x) => a + x, 0)); }
  const hv = (asList(S.hook)[0] || {}).visual || {};
  return { id, lead: lead ? say(lead) : '', loops, cta: ctaL.length ? ctaL[0] : (S.outro ? say(S.outro) : ''), ctaType, answer, hook: hv.type + (hv.mode ? ':' + hv.mode : '') };
}
function run(id, historyFile) {
  const S = JSON.parse(fs.readFileSync(path.join(BASE, id, 'script.json'), 'utf8'));
  const me = shape(id, S);
  let others = fs.readdirSync(BASE).filter((d) => d !== id && fs.existsSync(path.join(BASE, d, 'script.json')))
    .map((d) => ({ d, m: fs.statSync(path.join(BASE, d, 'script.json')).mtimeMs, X: JSON.parse(fs.readFileSync(path.join(BASE, d, 'script.json'), 'utf8')) }))
    .filter((o) => o.X.v === 2 && o.X.kind !== 'brand' && o.X.kind !== 'demo').sort((a, b) => b.m - a.m).map((o) => shape(o.d, o.X));
  if (historyFile) { try { others = others.concat(JSON.parse(fs.readFileSync(historyFile, 'utf8'))); } catch (e) { console.log('  · history not read: ' + e.message); } }
  const last10 = others.slice(0, 10), last4 = others.slice(0, 4);
  const warn = [];
  const rep = (what, mine, theirs) => { const f = first3(mine); if (!f || f.split(' ').length < 3) return; theirs.forEach((o) => { const hit = [].concat(o.lead || [], o.loops || [], o.cta || []).find((x) => first3(x) === f); if (hit) warn.push(what + ' starts like a line in ' + o.id + ': „' + f + '…”'); }); };
  rep('the lead', me.lead, last10); me.loops.forEach((l) => rep('a loop', l, last10)); rep('the CTA', me.cta, last10);
  // inside the reel too: two loops that start the same way
  if (me.loops.length > 1 && new Set(me.loops.map(first3)).size < me.loops.length) warn.push('two loops start the same way');
  const five = [me].concat(last4);
  const same = (k, v) => five.filter((o) => o[k] === v).length;
  if (same('ctaType', me.ctaType) >= 3) warn.push('the CTA type „' + me.ctaType + '” in ' + same('ctaType', me.ctaType) + ' of the last 5');
  const nl = (o) => (o.loops || []).length; if (five.filter((o) => nl(o) === nl(me)).length >= 4) warn.push(nl(me) + ' loops in ' + five.filter((o) => nl(o) === nl(me)).length + ' of the last 5');
  const band = (a) => (a == null ? null : Math.floor(a * 10)); if (me.answer != null && five.filter((o) => band(o.answer) === band(me.answer)).length >= 4) warn.push('the answer lands at ' + band(me.answer) * 10 + '-' + (band(me.answer) * 10 + 10) + ' % in 4 of the last 5');
  last10.forEach((o) => { if (o.hook && o.hook === me.hook) warn.push('the hook opens on the same visual („' + me.hook + '”) as ' + o.id); });
  return { me, warn, n: others.length };
}
module.exports = run;
if (require.main === module) {
  const id = process.argv[2]; const hi = process.argv.indexOf('--history');
  const r = run(id, hi > 0 ? process.argv[hi + 1] : null);
  console.log(id + ': lead „' + first3(r.me.lead) + '…”, ' + r.me.loops.length + ' loops, CTA ' + r.me.ctaType + ', answer at ' + (r.me.answer == null ? '-' : Math.round(r.me.answer * 100) + ' %') + ', hook ' + r.me.hook + ' (vs ' + Math.min(10, r.n) + ' recent reels)');
  r.warn.forEach((w) => console.log('  ! ' + w));
  if (!r.warn.length) console.log('  clean');
  process.exit(r.warn.length ? 3 : 0);
}
