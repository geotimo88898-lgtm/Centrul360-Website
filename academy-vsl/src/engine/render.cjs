// Renders a film frame by frame: node render.cjs <film> [workers=3] [from s] [to s]
// → films/<id>/build/film.json (times, cues) and build/video.mp4 (no sound, high quality, for encode.sh)
const { chromium } = require('playwright');
const { spawn } = require('child_process');
const fs = require('fs'), path = require('path');
const { start } = require('./serve.cjs');

const FPS = 30;
const ARGS = []; // the default software compositor is the fastest here (the WebGL logo still works)

async function open(port, film) {
  const b = await chromium.launch({ args: ARGS });
  const p = await b.newPage({ viewport: (() => { try { return JSON.parse(require('fs').readFileSync(require('path').join(__dirname, '..', 'films', film, 'script.json'), 'utf8')).fmt === '45' ? { width: 1080, height: 1350 } : { width: 1920, height: 1080 }; } catch (e) { return { width: 1920, height: 1080 }; } })() });
  p.on('pageerror', (e) => console.log('pageerror:', e.message));
  await p.goto('http://127.0.0.1:' + port + '/academy-vsl/src/engine/stage.html?film=' + film);
  await p.waitForFunction(() => window.ready || window.bootError, null, { timeout: 180000 });
  const err = await p.evaluate(() => window.bootError);
  if (err) throw new Error(err);
  return { b, p };
}

async function segment(port, film, a, z, out, tag) {
  const { b, p } = await open(port, film);
  const cdp = await p.context().newCDPSession(p);
  const ff = spawn('ffmpeg', ['-v', 'error', '-y', '-f', 'image2pipe', '-framerate', String(FPS), '-c:v', 'mjpeg', '-i', '-',
    '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '12', '-pix_fmt', 'yuv420p', out], { stdio: ['pipe', 'inherit', 'inherit'] });
  const t0 = Date.now();
  for (let i = a; i < z; i++) {
    await p.evaluate((t) => window.seek(t), i / FPS);
    const { data } = await cdp.send('Page.captureScreenshot', { format: 'jpeg', quality: 93, optimizeForSpeed: true });
    if (!ff.stdin.write(Buffer.from(data, 'base64'))) await new Promise((r) => ff.stdin.once('drain', r));
    if ((i - a) % 300 === 0) console.log(tag, (i - a) + '/' + (z - a), ((i - a) / ((Date.now() - t0) / 1000 + 0.01)).toFixed(1) + ' fps');
  }
  ff.stdin.end();
  await new Promise((r) => ff.on('close', r));
  await b.close();
}

(async () => {
  const film = process.argv[2];
  const workers = +process.argv[3] || 3;
  const build = path.join(__dirname, '..', 'films', film, 'build');
  fs.mkdirSync(build, { recursive: true });
  const srv = await start();
  const port = srv.address().port;
  // the times and the sound cues
  const { b, p } = await open(port, film);
  const F = await p.evaluate(() => window.film);
  await b.close();
  fs.writeFileSync(path.join(build, 'film.json'), JSON.stringify(F));
  const from = process.argv[4] != null ? Math.round(+process.argv[4] * FPS) : 0;
  const to = process.argv[5] != null ? Math.round(+process.argv[5] * FPS) : Math.ceil(F.total * FPS);
  console.log(film + ': ' + F.total.toFixed(1) + ' s, frames ' + from + '..' + to + ', ' + workers + ' workers');
  const n = to - from, per = Math.ceil(n / workers);
  const parts = [];
  for (let w = 0; w < workers; w++) {
    const a = from + w * per, z = Math.min(to, a + per);
    if (a >= z) break;
    parts.push({ a, z, out: path.join(build, 'part' + w + '.mp4') });
  }
  const t0 = Date.now();
  await Promise.all(parts.map((x, w) => segment(port, film, x.a, x.z, x.out, 'w' + w)));
  fs.writeFileSync(path.join(build, 'parts.txt'), parts.map((x) => "file '" + x.out + "'").join('\n'));
  await new Promise((r) => spawn('ffmpeg', ['-v', 'error', '-y', '-f', 'concat', '-safe', '0', '-i', path.join(build, 'parts.txt'), '-c', 'copy', path.join(build, 'video.mp4')], { stdio: 'inherit' }).on('close', r));
  parts.forEach((x) => fs.unlinkSync(x.out));
  console.log('rendered in ' + ((Date.now() - t0) / 1000).toFixed(0) + ' s');
  srv.close();
})().catch((e) => { console.error(e); process.exit(1); });
