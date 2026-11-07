// frames of a film at given times, for looking: node snap.cjs <film> <out dir> [t1 t2 ...] (no times: one per line)
const { chromium } = require('playwright');
const { start } = require('./serve.cjs');
(async () => {
  const [film, out, ...ts] = process.argv.slice(2);
  require('fs').mkdirSync(out, { recursive: true });
  const srv = await start();
  const b = await chromium.launch();
  const p = await b.newPage({ viewport: { width: 1920, height: 1080 } });
  p.on('console', (m) => { if (m.type() === 'error') console.log('console:', m.text()); });
  p.on('pageerror', (e) => console.log('pageerror:', e.message));
  await p.goto('http://127.0.0.1:' + srv.address().port + '/academy-vsl/src/engine/stage.html?film=' + film);
  await p.waitForFunction(() => window.ready || window.bootError, null, { timeout: 120000 });
  const err = await p.evaluate(() => window.bootError);
  if (err) { console.log(err); process.exit(1); }
  const F = await p.evaluate(() => ({ total: window.film.total, beats: window.film.beats }));
  let times = ts.map(Number);
  if (!times.length) times = F.beats.map((b) => b.t0 + Math.min(b.dur * 0.85, b.dur - 0.1));
  console.log('total', F.total.toFixed(1), 's, frames', times.length);
  for (const t of times) {
    await p.evaluate((t) => window.seek(t), t);
    await p.screenshot({ path: out + '/' + t.toFixed(2).padStart(7, '0') + '.jpg', type: 'jpeg', quality: 80 });
  }
  await b.close(); srv.close();
})();
