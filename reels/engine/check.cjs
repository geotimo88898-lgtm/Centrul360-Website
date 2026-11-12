// Checks a reel before it is rendered: node check.cjs <id>
//  - every text box inside the safe zone (x 60..920, y 220..1540: the apps cover the rest) and not cut
//  - no text box over another, under the captions or under Nuki
//  - the hook: text on screen at frame 0, the first words said before 1.5 s; a cut or a visual change at least every 4 s
//  - 20-35 s long, no long dashes, every line has its voice, a comment keyword at the end
const { chromium } = require('playwright');
const fs = require('fs'), path = require('path');
const { start, open } = require('./serve.cjs');
(async () => {
  const id = process.argv[2];
  const dir = path.join(__dirname, '..', 'scripts', id);
  const S = JSON.parse(fs.readFileSync(path.join(dir, 'script.json'), 'utf8'));
  if (S.v === 2) return require('./check2.cjs')(id, dir, S);
  const problems = [];
  if (/[–—]/.test(JSON.stringify(S))) problems.push('long dash in the script');
  if (!S.keyword || !S.scenes.some((x) => x.type === 'end')) problems.push('no end card with a comment keyword');
  if (/\b(lei|ron|reducere|ofert|programeaz|programare|pre[tț])/i.test(S.scenes.map((x) => JSON.stringify(x)).join(' '))) problems.push('looks like an ad (price, offer or booking words)');
  const srv = await start();
  const { b, p } = await open(chromium, srv, id);
  p.on('pageerror', (e) => problems.push('pageerror ' + e.message));
  const F = await p.evaluate(() => window.film);
  const tim = fs.existsSync(path.join(dir, 'timing.json')) ? JSON.parse(fs.readFileSync(path.join(dir, 'timing.json'), 'utf8')) : {};
  const noVoice = F.beats.filter((x) => !tim[x.key] || tim[x.key].text !== x.text).length;
  if (noVoice) problems.push(noVoice + ' lines without their voice (timing.json)');
  if (F.total < 20 || F.total > 35.5) problems.push('length ' + F.total.toFixed(1) + ' s (want 20-35)');
  if (F.beats[0].t0 > 0.4) problems.push('the first words start at ' + F.beats[0].t0.toFixed(2) + ' s');
  const seen = new Set();
  for (let t = 0; t < F.total; t += 0.25) {
    const out = await p.evaluate((t) => {
      const nk = window.seek(t);
      const out = [];
      const vis = (e) => { let x = e; while (x && x !== document.body) { const c = getComputedStyle(x); if (c.display === 'none' || c.visibility === 'hidden' || +c.opacity < 0.9) return false; x = x.parentElement; } return true; };
      const boxes = [];
      const sel = '.ttl .w, .head, .item, .stamp, .sub, .bignum, .chip, .note, .bubble, .counter, .cbar, .kicker, #tag, #brand';
      document.querySelectorAll(sel).forEach((e) => {
        if (!vis(e)) return;
        let x = e, blur = false; while (x && x !== document.body) { if ((x.style.filter || '').includes('blur')) blur = true; x = x.parentElement; }
        if (blur) return; // in the middle of a slam or a cut (a few frames, blurred on purpose)
        let r = e.getBoundingClientRect(); if (r.width < 2) return;
        if (e.matches('.head, .sub, .bignum, .note')) { const rg = document.createRange(); rg.selectNodeContents(e); r = rg.getBoundingClientRect(); }
        const name = (e.className || e.id) + ' "' + e.textContent.trim().slice(0, 28) + '"';
        if (r.left < 56 || r.right > 924 || r.top < 216 || r.bottom > 1544) out.push('outside the safe zone: ' + name + ' ' + [r.left, r.top, r.right, r.bottom].map(Math.round));
        if (e.scrollWidth > e.clientWidth + 2 && !e.matches('.cbar, .item')) out.push('text wider than its box: ' + name);
        if (!e.matches('.ttl .w')) boxes.push({ r, n: name, e });
      });
      for (let i = 0; i < boxes.length; i++) for (let j = i + 1; j < boxes.length; j++) {
        const a = boxes[i], c = boxes[j];
        if (a.e.contains(c.e) || c.e.contains(a.e)) continue;
        const ox = Math.min(a.r.right, c.r.right) - Math.max(a.r.left, c.r.left), oy = Math.min(a.r.bottom, c.r.bottom) - Math.max(a.r.top, c.r.top);
        if (ox > 8 && oy > 8) out.push('overlap: ' + a.n + ' / ' + c.n);
      }
      const cap = document.getElementById('cap');
      if (+cap.style.opacity > 0.5) {
        const ws = [...cap.querySelectorAll('.w')].map((w) => w.getBoundingClientRect());
        ws.forEach((cr) => {
          if (cr.left < 56 || cr.right > 924 || cr.top < 216 || cr.bottom > 1544) out.push('caption outside the safe zone ' + [cr.left, cr.top, cr.right, cr.bottom].map(Math.round));
          boxes.forEach((x) => { const ox = Math.min(x.r.right, cr.right) - Math.max(x.r.left, cr.left), oy = Math.min(x.r.bottom, cr.bottom) - Math.max(x.r.top, cr.top); if (ox > 6 && oy > 6) out.push('caption covers ' + x.n); });
        });
        if (nk) { const nr = document.getElementById('nuki').getBoundingClientRect(); const body = { left: nr.left + nr.width * 0.15, right: nr.right - nr.width * 0.15, top: nr.top + nr.height * 0.05 }; ws.forEach((cr) => { if (Math.min(cr.right, body.right) - Math.max(cr.left, body.left) > 20 && cr.bottom - body.top > 20 && cr.top < nr.bottom) out.push('caption over Nuki'); }); }
      }
      if (nk) { const nr = document.getElementById('nuki').getBoundingClientRect(); const body = { left: nr.left + nr.width * 0.18, right: nr.right - nr.width * 0.18, top: nr.top + nr.height * 0.05, bottom: nr.bottom - nr.height * 0.05 };
        if (body.right > 960) out.push('Nuki under the right-side app buttons');
        boxes.forEach((x) => { if (x.e.closest('#over') || x.e.matches('#tag, #brand')) return; const ox = Math.min(x.r.right, body.right) - Math.max(x.r.left, body.left), oy = Math.min(x.r.bottom, body.bottom) - Math.max(x.r.top, body.top); if (ox > 30 && oy > 30) out.push('Nuki covers ' + x.n); }); }
      return out;
    }, t);
    out.forEach((o) => { if (!seen.has(o)) { seen.add(o); problems.push(t.toFixed(2) + 's ' + o); } });
  }
  // frame 0: something big on screen (the thumbnail and the visual hook)
  const f0 = await p.evaluate(() => { window.seek(0); return [...document.querySelectorAll('.scene .ttl .w, .scene .stamp')].filter((e) => getComputedStyle(e).visibility !== 'hidden' && +getComputedStyle(e).opacity > 0.9).length; });
  if (!f0) problems.push('nothing big on frame 0 (the visual hook)');
  if (!F.cues.some((c) => c.t < 0.1 && c.sfx === 'hit')) problems.push('no sound hook (hit) on the first words');
  const br = F.breaks.concat([F.total]).filter((x) => x >= 0);
  let gap = 0, at = 0;
  for (let i = 1; i < br.length; i++) if (br[i] - br[i - 1] > gap) { gap = br[i] - br[i - 1]; at = br[i - 1]; }
  if (gap > 4) problems.push('no cut or visual change for ' + gap.toFixed(1) + ' s from ' + at.toFixed(1) + ' s');
  console.log(id + ': ' + F.total.toFixed(1) + ' s, ' + F.scenes.length + ' scenes, ' + F.cues.length + ' sound cues, longest still stretch ' + gap.toFixed(1) + ' s');
  problems.forEach((x) => console.log('  ! ' + x));
  if (!problems.length) console.log('  clean');
  await b.close(); srv.close();
  process.exit(problems.length ? 2 : 0);
})();
