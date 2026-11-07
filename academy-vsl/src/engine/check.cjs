// Checks a film before it is rendered: node check.cjs <film>
//  - every visible text box inside the frame (not cut) and not overlapping another box or Nuki or the caption
//  - Nuki on screen 60-70% of the time; a pattern break (new scene or a big move) at least every 20 s
//  - no long dashes anywhere in the script; every line has its voice
const { chromium } = require('playwright');
const fs = require('fs'), path = require('path');
const { start } = require('./serve.cjs');

(async () => {
  const film = process.argv[2];
  const S = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'films', film, 'script.json'), 'utf8'));
  const problems = [];
  const raw = JSON.stringify(S);
  if (/[–—]/.test(raw)) problems.push('long dash in the script');
  const srv = await start();
  const b = await chromium.launch();
  const p = await b.newPage({ viewport: (() => { try { return JSON.parse(require('fs').readFileSync(require('path').join(__dirname, '..', 'films', film, 'script.json'), 'utf8')).fmt === '45' ? { width: 1080, height: 1350 } : { width: 1920, height: 1080 }; } catch (e) { return { width: 1920, height: 1080 }; } })() });
  p.on('pageerror', (e) => problems.push('pageerror ' + e.message));
  await p.goto('http://127.0.0.1:' + srv.address().port + '/academy-vsl/src/engine/stage.html?film=' + film);
  await p.waitForFunction(() => window.ready || window.bootError, null, { timeout: 180000 });
  const F = await p.evaluate(() => window.film);
  const tim = fs.existsSync(path.join(__dirname, '..', 'films', film, 'timing.json')) ? JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'films', film, 'timing.json'), 'utf8')) : {};
  const noVoice = F.beats.filter((x) => !tim[x.key] || tim[x.key].text !== x.text).length;
  if (noVoice) problems.push(noVoice + ' lines without their voice (timing.json)');
  // sample every 0.5 s
  let nuki = 0, n = 0;
  const seen = new Set();
  for (let t = 0; t < F.total; t += 0.5) {
    const r = await p.evaluate((t) => {
      const nk = window.seek(t);
      const vis = (e) => { const cs = getComputedStyle(e); if (cs.visibility === 'hidden' || cs.display === 'none') return false; let x = e; while (x && x !== document.body) { const c = getComputedStyle(x); if (c.display === 'none' || +c.opacity < 0.9) return false; x = x.parentElement; } return true; };
      const out = [];
      const boxes = [];
      const scene = [...document.querySelectorAll('.scene')].filter((e) => e.style.display === 'block' && +e.style.opacity > 0.98)[0];
      if (!scene) return { nk, out };
      // leaf text blocks
      scene.querySelectorAll('.card, .chip, .h1, .h2, .h3, .kicker, .lede, .bub, .phone, .sheetwrap, .stop, .big, .cchip, .crumb, .rs, .dot').forEach((e) => {
        if (!vis(e)) return;
        const r = e.getBoundingClientRect();
        if (r.width < 2) return;
        if (r.left < 20 || r.right > innerWidth - 20 || r.top < 110 || r.bottom > innerHeight - 60) out.push('out of frame: ' + (e.className + ' ' + e.textContent.trim().slice(0, 40)) + ' ' + [r.left, r.top, r.right, r.bottom].map(Math.round));
        if (e.scrollWidth > e.clientWidth + 2 && !e.classList.contains('phone') && !e.classList.contains('sheetwrap')) out.push('text wider than its box: ' + e.textContent.trim().slice(0, 50));
        if (e.matches('.card, .bub, .phone, .sheetwrap, .cchip, .chip, .big, .rs, .crumb')) boxes.push({ r, t: e.textContent.trim().slice(0, 30), e });
      });
      for (let i = 0; i < boxes.length; i++) for (let j = i + 1; j < boxes.length; j++) {
        const a = boxes[i], c = boxes[j];
        if (a.e.contains(c.e) || c.e.contains(a.e)) continue;
        const ox = Math.min(a.r.right, c.r.right) - Math.max(a.r.left, c.r.left), oy = Math.min(a.r.bottom, c.r.bottom) - Math.max(a.r.top, c.r.top);
        if (ox > 6 && oy > 6) out.push('overlap: "' + a.t + '" / "' + c.t + '"');
      }
      // caption vs content
      const cap = document.getElementById('cap');
      if (+cap.style.opacity > 0.5) { const cr = cap.querySelector('span').getBoundingClientRect(); boxes.forEach((x) => { const ox = Math.min(x.r.right, cr.right) - Math.max(x.r.left, cr.left), oy = Math.min(x.r.bottom, cr.bottom) - Math.max(x.r.top, cr.top); if (ox > 6 && oy > 6) out.push('caption covers: "' + x.t + '"'); }); }
      // nuki vs content (his body box, a little inside the image)
      const nkEl = document.getElementById('nuki');
      if (nk) { const nr = nkEl.getBoundingClientRect(); const body = { left: nr.left + 90, right: nr.right - 90, top: nr.top + 60, bottom: nr.bottom - 30 }; boxes.forEach((x) => { const ox = Math.min(x.r.right, body.right) - Math.max(x.r.left, body.left), oy = Math.min(x.r.bottom, body.bottom) - Math.max(x.r.top, body.top); if (ox > 30 && oy > 30) out.push('Nuki covers: "' + x.t + '"'); }); }
      const je = document.getElementById('jerry');
      if (+je.style.opacity > 0.5) { const jr = je.getBoundingClientRect(), bb = je.querySelector('.jb').getBoundingClientRect();
        [jr, bb].forEach((r0, i) => { if (i && +je.querySelector('.jb').style.opacity < 0.5) return; const r = i ? r0 : { left: r0.left + 40, right: r0.right - 40, top: r0.top + 30, bottom: r0.bottom };
          if (r.left < 10 || r.right > innerWidth - 10) out.push('Jerry out of frame');
          boxes.forEach((x) => { const ox = Math.min(x.r.right, r.right) - Math.max(x.r.left, r.left), oy = Math.min(x.r.bottom, r.bottom) - Math.max(x.r.top, r.top); if (ox > 10 && oy > 10) out.push('Jerry covers: "' + x.t + '"'); }); }); }
      return { nk, out };
    }, t);
    n++; if (r.nk) nuki++;
    r.out.forEach((o) => { const k = o; if (!seen.has(k)) { seen.add(k); problems.push(t.toFixed(1) + 's ' + o); } });
  }
  const share = nuki / n;
  // pattern breaks: scene starts
  const starts = [...new Set(F.scenes.map((s) => s.t0).concat(F.breaks || [], [F.total]))].sort((a, b) => a - b);
  let gap = 0, at = 0;
  for (let i = 1; i < starts.length; i++) if (starts[i] - starts[i - 1] > gap) { gap = starts[i] - starts[i - 1]; at = starts[i - 1]; }
  if (gap > 20) problems.push('no pattern break for ' + gap.toFixed(1) + ' s from ' + at.toFixed(1) + ' s');
  if (share < 0.6 || share > 0.72) problems.push('Nuki on screen ' + Math.round(share * 100) + '% (want 60-70%)');
  console.log(film + ': ' + F.total.toFixed(1) + ' s, ' + F.scenes.length + ' scenes, ' + F.cues.length + ' sound cues, Nuki ' + Math.round(share * 100) + '%, longest scene ' + gap.toFixed(1) + ' s');
  problems.forEach((x) => console.log('  ! ' + x));
  if (!problems.length) console.log('  clean');
  await b.close(); srv.close();
  process.exit(problems.length ? 2 : 0);
})();
