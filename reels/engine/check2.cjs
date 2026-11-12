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
const CRINGE = /(hei,? dragel?e mele|dragile mele|fetelor,|cai verzi pe pere[țt]i|ba[țt]i apa-?n piu[ăa]|cioara vopsit[ăa]|la pa[șs]tele cailor|ca la carte|s[ăa] vezi minune|pe bune|ca [îi]ntre noi|bomb[ăa]|wow,|super tare|ai gu[șs][ăa]\?)/i;
module.exports = async (id, dir, S) => {
  const problems = [], notes = [];
  const say = [].concat(S.hook || [], S.beats || [], S.payoff || [], S.end && S.end.say ? [S.end] : []);
  const words = say.map((b) => [b.say, b.cap, b.tts].filter(Boolean).join(' ')).join(' | ');
  if (/[–—]/.test(JSON.stringify(S))) problems.push('long dash in the script');
  const ad = words.match(AD); if (ad) problems.push('sounds like an ad / forbidden word: „' + ad[0] + '”');
  const cr = words.match(CRINGE); if (cr) problems.push('cringe phrase or folk idiom: „' + cr[0] + '” (README „Vocea”)');
  if (/\b(sa|si|fara|daca|tine|asa)\b/i.test(words.replace(/\*/g, '').replace(/[ăâîșțĂÂÎȘȚ]/g, 'X'))) notes.push('check the diacritics (sa / si / fara …)');
  say.forEach((b, i) => { if (!b.visual && !b.step && b !== S.end) problems.push('line ' + i + ' has no visual and no step: „' + (b.say || '').slice(0, 40) + '”'); });
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
  if (T < 25 || T > 40.5) problems.push('length ' + T.toFixed(1) + ' s (want 25-40)');
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
  else { const r = F.payoff / storyEnd; notes.push('payoff at ' + F.payoff.toFixed(1) + ' s: ' + Math.round(r * 100) + ' % of the story, ' + Math.round(F.payoff / T * 100) + ' % of the reel'); if (r < 0.75) problems.push('the payoff comes at ' + Math.round(r * 100) + ' % of the story (want the last 25 %)'); }
  const ev = [...new Set(F.events.filter((e) => e.kind !== 'line').map((e) => Math.round(e.t * 100) / 100))].filter((x) => x >= 0).sort((a, b2) => a - b2).concat([T]);
  let gap = 0, at = 0; for (let i = 1; i < ev.length; i++) if (ev[i] - ev[i - 1] > gap) { gap = ev[i] - ev[i - 1]; at = ev[i - 1]; }
  if (ev[0] > 2.5) { gap = Math.max(gap, ev[0]); }
  if (gap > 2.5) problems.push('no visual change for ' + gap.toFixed(1) + ' s from ' + at.toFixed(1) + ' s (want ≤ 2.5)');
  F.beats.forEach((L, i) => { if (L.role === 'end') return; const hit = F.events.some((e) => e.kind !== 'line' && e.t >= L.t0 - 0.4 && e.t <= L.t0 + Math.min(1.2, L.dur)); if (!hit) problems.push('line ' + i + ' („' + L.text.slice(0, 32) + '…”) has nothing moving when it starts'); });
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
