// The v2 checks (check.cjs calls this for "v": 2 scripts). Exit 2 when something must be fixed.
//  - the story: a hook question on screen and said by 3 s, the first frame already moving, a sound hit on frames 0-3,
//    the payoff in the last 25 % of the story (the end segment, a CTA, is not story), a visual change at least every
//    2.5 s, every spoken line bound to a visual (a new shot or a declared step) with something that moves on it
//  - the words: no ad-speak, no price / offer / booking, no cringe phrases or folk idioms, no long dashes, diacritics
//  - the frame: every text inside the safe zone (x 60..920, y 220..1540), no text over text, captions over nothing
//  - 25-40 s, every line voiced (timing.json), ≤ 8 AI images, the end type valid (site: real screenshots captured)
const { chromium } = require('playwright');
const fs = require('fs'), path = require('path');
const { start, open } = require('./serve.cjs');
// words that sound like an ad, or that the rules forbid (README.md, „Vocea” and „Regulile”)
const AD = /\b(descoper[ăa]|transform[ăa]|transformarea|rezultate spectaculoase|spectaculos|revolu[țt]ionar|incredibil|uimitor|nu rata|ofert[ăae]|reducere|promo[țt]ie|lei|pre[țt]ul?|programeaz[ăa]|programare|rezerv[ăa]|sun[ăa] acum|link[- ]?(ul)? (din|în) bio|consulta[țt]ie gratuit[ăa]|garantat|100 ?%|vindec|f[ăa]r[ăa] riscuri|minune|slăbe[șs]ti \d|kg garantat)/i;
const BANNED = /\b(mit|mitul|mituri|miturile|mit sau adev[ăa]r)\b/i; // the owner, 13.11: never the word, the stamp or the format
const CRINGE = /(hei,? dragel?e mele|dragile mele|fetelor,|cai verzi pe pere[țt]i|ba[țt]i apa-?n piu[ăa]|cioara vopsit[ăa]|la pa[șs]tele cailor|ca la carte|s[ăa] vezi minune|pe bune|ca [îi]ntre noi|bomb[ăa]|wow,|super tare|ai gu[șs][ăa]\?)/i;
module.exports = async (id, dir, S) => {
  const problems = [], notes = [];
  const say = [].concat(S.hook || [], S.beats || [], S.payoff || [], S.resolve || [], S.outro || [], S.end && S.end.say ? [S.end] : []);
  const words = say.map((b) => [b.say, b.cap, b.tts].filter(Boolean).join(' ')).join(' | ');
  if (/[–—]/.test(JSON.stringify(S))) problems.push('long dash in the script');
  const ad = words.match(AD); if (ad) problems.push('sounds like an ad / forbidden word: „' + ad[0] + '”');
  const cr = words.match(CRINGE); if (cr) problems.push('cringe phrase or folk idiom: „' + cr[0] + '” (README „Vocea”)');
  const bn = JSON.stringify(S).replace(/\\u[0-9a-f]{4}/g, '').match(BANNED); if (bn) problems.push('the word „' + bn[0] + '” (never „mit” or the „Mit sau adevăr” format)');
  if (!S.resolve || [].concat(S.resolve).length < 2) problems.push('no resolution beat: "resolve" needs 2-3 lines („Și atunci, ce faci?” + practical, real things)');
  if (!S.outro || !S.outro.visual) problems.push('no outro: a warm closing line with a resolving visual ("outro")');
  if (S.end && S.end.type === 'comment' && String(S.end.keyword || S.keyword || '360') !== '360') problems.push('a comment end always uses the keyword 360');
  if (S.brand) notes.push('the logo is on screen (brand: true): only where it is natural');
  if (/\b(sa|si|fara|daca|tine|asa)\b/i.test(words.replace(/\*/g, '').replace(/[ăâîșțĂÂÎȘȚ]/g, 'X'))) notes.push('check the diacritics (sa / si / fara …)');
  say.forEach((b, i) => { if (!b.visual && !b.step && b !== S.end) problems.push('line ' + i + ' has no visual and no step: „' + (b.say || '').slice(0, 40) + '”'); });
  // the brand only (the owner, 14.11): two themes, nothing else
  if (!['brand-light', 'brand-teal'].includes(S.theme)) problems.push('theme „' + S.theme + '”: only brand-light or brand-teal (the brand colours, 14.11)');
  // variety (the owner, 14.11: „nu vreau să fie la fel niciunul”): compare with the other v2 reels
  try {
    const sig = (X) => { const all = [].concat(X.hook || [], X.beats || [], X.payoff || [], X.resolve || [], X.outro || []); const types = all.filter((b) => b.visual).map((b) => b.visual.type);
      const h0 = [].concat(X.hook || [])[0] || {}; const hv = h0.visual || {};
      const SIG = ['race', 'scrubber', 'cardrow', 'skin', 'photo', 'panel', 'puzzle', 'dissolve', 'tilt', 'zoom', 'energy', 'scale', 'gauge'];
      const sigs = [...new Set(types.filter((t) => SIG.includes(t)))].concat(X.end && X.end.type === 'site' ? ['site-search'] : []).sort();
      return { theme: X.theme, hook: hv.type + (hv.mode ? ':' + hv.mode : ''), end: X.end && X.end.type, sigs, types }; };
    const me = sig(S);
    const base = path.join(__dirname, '..', 'scripts');
    const others = fs.readdirSync(base).filter((d) => d !== id && fs.existsSync(path.join(base, d, 'script.json'))).map((d) => ({ d, m: fs.statSync(path.join(base, d, 'script.json')).mtimeMs, X: JSON.parse(fs.readFileSync(path.join(base, d, 'script.json'), 'utf8')) })).filter((o) => o.X.v === 2).sort((a, b) => b.m - a.m);
    others.forEach((o) => { const x = sig(o.X); if (x.theme === me.theme && x.hook === me.hook && x.end === me.end && x.sigs.join() === me.sigs.join()) problems.push('the same theme, hook, signature scenes and ending as ' + o.d + ': make it different'); });
    if (others[0]) { const prev = sig(others[0].X); const left = prev.types.slice(); let same = 0; me.types.forEach((t) => { const i = left.indexOf(t); if (i >= 0) { same++; left.splice(i, 1); } });
      const r = same / Math.max(1, me.types.length); notes.push('variety vs ' + others[0].d + ': ' + Math.round(r * 100) + ' % of the scenes alike; hook ' + me.hook + ' vs ' + prev.hook + ', end ' + me.end + ' vs ' + prev.end + ', theme ' + me.theme + ' vs ' + prev.theme);
      if (r > 0.5) notes.push('WARNING: more than half of the scenes are the same kinds as ' + others[0].d + ' (vary them)'); }
  } catch (e) { notes.push('variety check skipped: ' + e.message); }
  // too-alike animations (the owner, 14.11: „ai grijă la animațiile prea asemănătoare”): inside a reel no scene kind and
  // no visual metaphor more than twice, never the same kind back to back; across the recent reels each has its own
  // core visual for the mechanism (a warning when it repeats)
  try {
    const story = [].concat(S.hook || [], S.beats || [], S.payoff || [], S.resolve || [], S.outro || []).filter((b) => b.visual);
    const kind = (v) => (/^type-/.test(v.type) ? 'type' : ['qmark', 'gridq', 'strokeq'].includes(v.type) ? 'glyph' : v.type);
    const META = { skin: 'cross-section', beam: 'layer-stack', cells: 'cell-field', energy: 'energy-flow', dissolve: 'particles', zoom: 'zoom-in', puzzle: 'puzzle', race: 'bars', bars: 'bars', scrubber: 'timeline', timeline: 'timeline', big: 'big-number', counter: 'big-number' };
    const meta = (v) => (kind(v) === 'type' ? 'kinetic-type' : kind(v) === 'glyph' ? 'glyph:' + (v.glyph || (v.type === 'qmark' || v.type === 'gridq' || v.type === 'strokeq' ? 'q' : '')) : v.type === 'photo' ? 'photo:' + v.img : META[v.type] || v.type);
    const kinds = story.map((b) => kind(b.visual)), metas = story.map((b) => meta(b.visual));
    const count = (arr) => arr.reduce((m, x) => ((m[x] = (m[x] || 0) + 1), m), {});
    Object.entries(count(kinds)).forEach(([k, n]) => { if (n > 2) problems.push('the scene kind „' + k + '” appears ' + n + ' times (max 2 a reel)'); });
    Object.entries(count(metas)).forEach(([k, n]) => { if (n > 2) problems.push('the visual „' + k + '” appears ' + n + ' times (max 2 a reel)'); });
    for (let i = 1; i < kinds.length; i++) if (kinds[i] === kinds[i - 1]) problems.push('the same scene kind back to back: „' + kinds[i] + '” (lines ' + (i - 1) + ', ' + i + ')');
    notes.push('scene kinds: ' + kinds.join(', '));
    const MECH = ['skin', 'beam', 'cells', 'energy', 'dissolve', 'puzzle'];
    const core = (X) => (X.core ? [].concat(X.core) : [...new Set([].concat(X.hook || [], X.beats || [], X.payoff || [], X.resolve || [], X.outro || []).filter((b) => b.visual && MECH.includes(b.visual.type)).map((b) => b.visual.type))]);
    const mine = core(S);
    notes.push('core mechanism visual: ' + (mine.join(', ') || 'none'));
    const base = path.join(__dirname, '..', 'scripts');
    fs.readdirSync(base).filter((d) => d !== id && fs.existsSync(path.join(base, d, 'script.json'))).map((d) => ({ d, m: fs.statSync(path.join(base, d, 'script.json')).mtimeMs, X: JSON.parse(fs.readFileSync(path.join(base, d, 'script.json'), 'utf8')) }))
      .filter((o) => o.X.v === 2 && o.X.kind !== 'brand').sort((a, b) => b.m - a.m).slice(0, 3)
      .forEach((o) => { const shared = core(o.X).filter((k) => mine.includes(k)); if (shared.length) notes.push('WARNING: the same core mechanism visual as ' + o.d + ': ' + shared.join(', ') + ' (give each reel its own)'); });
  } catch (e) { notes.push('scene-kind check skipped: ' + e.message); }
  const ends = ['loop', 'comment', 'site', 'ask'];
  if (!S.end || !ends.includes(S.end.type)) problems.push('end.type must be one of ' + ends.join(', '));
  if (S.end && S.end.type === 'comment' && !(S.end.keyword || S.keyword)) problems.push('a comment end needs a keyword');
  const h0 = [].concat(S.hook || [])[0] || {};
  if (!h0.q || !/\?/.test(h0.q)) problems.push('the hook needs "q": the question it opens (with a "?")');
  const srv = await start();
  const { b, p } = await open(chromium, srv, id);
  p.on('pageerror', (e) => problems.push('pageerror ' + e.message));
  const F = await p.evaluate(() => window.film);
  const T = F.total;
  if (T < 30 || T > 45.5) problems.push('length ' + T.toFixed(1) + ' s (want 30-45)');
  const unvoiced = F.beats.filter((x) => !x.voiced).length;
  if (unvoiced) notes.push(unvoiced + ' lines without their voice yet (estimated timing): run voice.py');
  if (F.images > 8) problems.push(F.images + ' AI images (max 8)');
  // the hook
  const hook = F.beats[0];
  if (hook.t0 + hook.dur > 3.25) problems.push('the hook line ends at ' + (hook.t0 + hook.dur).toFixed(2) + ' s (want ≤ 3 s)');
  let qAt = null;
  for (let t = 0; t <= 3.0 && qAt == null; t += 0.1) {
    const ok = await p.evaluate((t) => { window.seek(t); const vis = (e) => { let x = e; while (x && x !== document.body) { const c = getComputedStyle(x); if (c.display === 'none' || c.visibility === 'hidden' || +c.opacity < 0.5) return false; x = x.parentElement; } return true; };
      if ([...document.querySelectorAll('[data-q]')].some((d) => { const q = [...d.querySelectorAll('.w')]; return q.length && q.every(vis); })) return true;
      const cap = document.getElementById('cap'); return +cap.style.opacity > 0.5 && /\?/.test(cap.textContent); }, t);
    if (ok) qAt = t;
  }
  if (qAt == null) problems.push('the hook question is not on screen by 3 s');
  const sig = async (t) => p.evaluate((t) => { window.seek(t); const out = []; document.querySelectorAll('.shot *, #bg *').forEach((e) => { if (e.offsetParent === null && e.tagName !== 'CANVAS') return; out.push(e.style.transform + '|' + e.style.opacity + '|' + (e.tagName === 'CANVAS' ? e.toDataURL().length : '')); }); return out.join(';'); }, t);
  if ((await sig(0)) === (await sig(1 / 30))) problems.push('frame 0 is still (the first frame must already move)');
  if (!F.cues.some((c) => c.t <= 0.1 && /impact|boom|shutter|glitch/.test(c.cat))) problems.push('no sound hit on frames 0-3');
  // the payoff and the rhythm
  const endShot = F.shots[F.shots.length - 1];
  const storyEnd = endShot.role === 'end' ? endShot.t0 : T;
  if (F.payoff == null) problems.push('no payoff');
  else { const r = F.payoff / T; notes.push('payoff at ' + F.payoff.toFixed(1) + ' s (' + Math.round(r * 100) + ' % of the reel), resolution from ' + (F.sections.resolve ? F.sections.resolve[0].toFixed(1) : '-') + ' s'); if (r < 0.4) problems.push('the answer comes too early (' + Math.round(r * 100) + ' %, want after 40 %)'); if (F.sections.resolve && F.sections.resolve[0] < F.payoff - 0.5) problems.push('the resolution starts before the answer'); }
  const ev = [...new Set(F.events.filter((e) => e.kind !== 'line').map((e) => Math.round(e.t * 100) / 100))].filter((x) => x >= 0).sort((a, b2) => a - b2).concat([T]);
  let gap = 0, at = 0; for (let i = 1; i < ev.length; i++) if (ev[i] - ev[i - 1] > gap) { gap = ev[i] - ev[i - 1]; at = ev[i - 1]; }
  if (ev[0] > 2.5) { gap = Math.max(gap, ev[0]); }
  if (gap > 2.5) problems.push('no visual change for ' + gap.toFixed(1) + ' s from ' + at.toFixed(1) + ' s (want ≤ 2.5)');
  F.beats.forEach((L, i) => { if (L.role === 'end') return; const hit = F.events.some((e) => e.kind !== 'line' && e.t >= L.t0 - 0.4 && e.t <= L.t0 + Math.min(1.2, L.dur)); if (!hit) problems.push('line ' + i + ' („' + L.text.slice(0, 32) + '…”) has nothing moving when it starts'); });
  // every new idea moves to a new screen with a real transition; within one idea at most one small step
  F.shots.forEach((sh, i) => { if (i && (!sh.tr || sh.tr === 'cut')) problems.push('shot ' + i + ' (' + sh.type + ') starts without a real transition'); if (sh.role !== 'end' && sh.lines.length > 2) problems.push('shot ' + i + ' (' + sh.type + ') holds ' + sh.lines.length + ' lines: a new idea needs a new screen'); });
  const trs = F.shots.slice(1).map((x) => x.tr); notes.push('transitions: ' + trs.join(', '));
  for (let i = 1; i < trs.length; i++) if (trs[i] === trs[i - 1]) problems.push('the same transition twice in a row (' + trs[i] + ')');
  // Nuki: 2-4 small appearances
  if (F.nuki < 2 || F.nuki > 4) problems.push('Nuki appears ' + F.nuki + ' times (want 2-4, small, in some frames)');
  // the ending: a CTA line (soft or explicit) and a resolving visual in the last 5 s
  const ctaLines = [].concat(S.outro || [], S.end && S.end.say ? [S.end] : []).filter((b) => b.cta);
  const ctaIn = F.beats.some((L) => (L.role === 'outro' || L.role === 'end') && [].concat(S.outro || [], S.end || []).some((b) => b.cta && (b.tts || b.say || '').replace(/\*/g, '').trim() === L.text) && L.t0 + L.dur > T - 5.5);
  if (!ctaLines.length || !ctaIn) problems.push('no CTA line (soft, talk or loop: "cta") in the last 5 s');
  if (!F.events.some((e) => /^resolve/.test(e.kind) && e.t >= T - 5.5)) problems.push('no resolving visual in the last 5 s (the "?" resolving, the final landing)');
  if (S.end && S.end.type === 'site') { const man = fs.existsSync(path.join(__dirname, 'site', 'manifest.json')) ? JSON.parse(fs.readFileSync(path.join(__dirname, 'site', 'manifest.json'), 'utf8')) : { shots: {} }; (S.end.pages || []).forEach((pg) => { if (!man.shots[pg.key]) problems.push('no screenshot for ' + pg.key + ': run node site.cjs ' + id); }); }
  // the frame: safe zone, overlaps, captions
  const seen = new Set();
  for (let t = 0; t < T; t += 0.25) {
    const out = await p.evaluate((t) => {
      window.seek(t);
      const out = [];
      const vis = (e) => { let x = e, o = 1; while (x && x !== document.body) { const c = getComputedStyle(x); if (c.display === 'none' || c.visibility === 'hidden') return false; o *= +c.opacity; if ((x.style.filter || '').includes('blur') || (x.style.transform || '').includes('scale(0.')) return false; x = x.parentElement; } return o > 0.9; };
      const boxes = [];
      document.querySelectorAll('.shot .tx').forEach((e) => {
        if (!vis(e)) return;
        if (e.closest('.shot').style.clipPath || +e.closest('.shot').style.opacity < 0.99 || /translate\((?!0\.00px,0\.00px)/.test(e.closest('.shot').style.transform)) return; // in a transition
        const rg = document.createRange(); rg.selectNodeContents(e); let r = rg.getBoundingClientRect(); if (r.width < 2) r = e.getBoundingClientRect(); if (r.width < 2) return;
        const name = e.className + ' "' + e.textContent.trim().slice(0, 26) + '"';
        if (r.left < 56 || r.right > 924 || r.top < 216 || r.bottom > 1544) out.push('outside the safe zone: ' + name + ' ' + [r.left, r.top, r.right, r.bottom].map(Math.round));
        boxes.push({ r, n: name, e });
      });
      for (let i = 0; i < boxes.length; i++) for (let j = i + 1; j < boxes.length; j++) {
        const a = boxes[i], c = boxes[j]; if (a.e.contains(c.e) || c.e.contains(a.e)) continue;
        const ox = Math.min(a.r.right, c.r.right) - Math.max(a.r.left, c.r.left), oy = Math.min(a.r.bottom, c.r.bottom) - Math.max(a.r.top, c.r.top);
        if (ox > 10 && oy > 10) out.push('text over text: ' + a.n + ' / ' + c.n);
      }
      document.querySelectorAll('.shot .nuki-c').forEach((n) => { if (!vis(n) || n.closest('.shot').style.clipPath) return; const r0 = n.getBoundingClientRect(); const r = { left: r0.left + r0.width * 0.2, right: r0.right - r0.width * 0.2, top: r0.top + r0.height * 0.08, bottom: Math.min(r0.bottom - r0.height * 0.05, n.dataset.vb ? +n.dataset.vb : 1e9) };
        const capWs = [...document.getElementById('cap').querySelectorAll('.cw')].map((w) => w.getBoundingClientRect());
        boxes.concat(+document.getElementById('cap').style.opacity > 0.5 ? capWs.map((cr) => ({ r: cr, n: 'a caption' })) : []).forEach((x) => { const ox = Math.min(x.r.right, r.right) - Math.max(x.r.left, r.left), oy = Math.min(x.r.bottom, r.bottom) - Math.max(x.r.top, r.top); if (ox > 14 && oy > 14) out.push('Nuki covers ' + x.n); }); });
      const cap = document.getElementById('cap');
      if (+cap.style.opacity > 0.5) [...cap.querySelectorAll('.cw')].forEach((w) => { const cr = w.getBoundingClientRect(); if (cr.left < 56 || cr.right > 924 || cr.top < 216 || cr.bottom > 1544) out.push('caption outside the safe zone'); boxes.forEach((x) => { const ox = Math.min(x.r.right, cr.right) - Math.max(x.r.left, cr.left), oy = Math.min(x.r.bottom, cr.bottom) - Math.max(x.r.top, cr.top); if (ox > 8 && oy > 8) out.push('caption covers ' + x.n); }); });
      return out;
    }, t);
    out.forEach((o) => { if (!seen.has(o)) { seen.add(o); problems.push(t.toFixed(2) + 's ' + o); } });
  }
  const per = {}; F.cues.filter((c) => c.cat !== 'key').forEach((c) => { const k = Math.floor(c.t); per[k] = (per[k] || 0) + 1; });
  const dens = Object.values(per); notes.push('sound events (before thinning): ' + (dens.reduce((a, x) => a + x, 0) / T).toFixed(1) + ' a second, max ' + Math.max(...dens) + '; longest still stretch ' + gap.toFixed(1) + ' s; hook question on screen at ' + (qAt == null ? '-' : qAt.toFixed(1)) + ' s');
  console.log(id + ' (v2, ' + S.theme + ', end ' + (S.end && S.end.type) + '): ' + T.toFixed(1) + ' s, ' + F.shots.length + ' shots, ' + F.beats.length + ' lines');
  notes.forEach((x) => console.log('  · ' + x));
  problems.forEach((x) => console.log('  ! ' + x));
  if (!problems.length) console.log('  clean');
  await b.close(); srv.close();
  process.exit(problems.length ? 2 : 0);
};
