// frames of a reel at given times, for looking: node snap.cjs <id> <out dir> [t1 t2 ...] [--debug] (no times: one per line)
const { chromium } = require('playwright');
const { start, open } = require('./serve.cjs');
(async () => {
  const args = process.argv.slice(2).filter((x) => x !== '--debug');
  const [id, out, ...ts] = args;
  require('fs').mkdirSync(out, { recursive: true });
  const srv = await start();
  const { b, p } = await open(chromium, srv, id, process.argv.includes('--debug') ? '&debug=1' : '');
  const F = await p.evaluate(() => ({ total: window.film.total, beats: window.film.beats }));
  let times = ts.map(Number);
  if (!times.length) times = F.beats.map((x) => x.t0 + x.dur * 0.8);
  console.log(id, 'total', F.total.toFixed(1), 's, frames', times.length);
  for (const t of times) { await p.evaluate((t) => window.seek(t), t); await p.screenshot({ path: out + '/' + t.toFixed(2).padStart(6, '0') + '.jpg', type: 'jpeg', quality: 80 }); }
  await b.close(); srv.close();
})();
