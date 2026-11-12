// Renders a reel frame by frame: node render.cjs <id> [workers=3]
// → scripts/<id>/build/film.json (times, sound cues) and build/video.mp4 (no sound, high quality, for encode.sh)
const { chromium } = require('playwright');
const { spawn } = require('child_process');
const fs = require('fs'), path = require('path');
const { start, open } = require('./serve.cjs');
const FPS = 30;
async function segment(srv, id, a, z, out, tag) {
  const { b, p } = await open(chromium, srv, id);
  const cdp = await p.context().newCDPSession(p);
  const ff = spawn('ffmpeg', ['-v', 'error', '-y', '-f', 'image2pipe', '-framerate', String(FPS), '-c:v', 'mjpeg', '-i', '-', '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '12', '-pix_fmt', 'yuv420p', out], { stdio: ['pipe', 'inherit', 'inherit'] });
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
  const id = process.argv[2], workers = +process.argv[3] || 3;
  const build = path.join(__dirname, '..', 'scripts', id, 'build');
  fs.mkdirSync(build, { recursive: true });
  const srv = await start();
  const { b, p } = await open(chromium, srv, id);
  const F = await p.evaluate(() => window.film);
  await b.close();
  fs.writeFileSync(path.join(build, 'film.json'), JSON.stringify(F));
  const n = Math.ceil(F.total * FPS), per = Math.ceil(n / workers);
  console.log(id + ': ' + F.total.toFixed(1) + ' s, ' + n + ' frames, ' + workers + ' workers');
  const parts = [];
  for (let w = 0; w < workers; w++) { const a = w * per, z = Math.min(n, a + per); if (a < z) parts.push({ a, z, out: path.join(build, 'part' + w + '.mp4') }); }
  await Promise.all(parts.map((x, w) => segment(srv, id, x.a, x.z, x.out, 'w' + w)));
  fs.writeFileSync(path.join(build, 'parts.txt'), parts.map((x) => "file '" + x.out + "'").join('\n'));
  await new Promise((r) => spawn('ffmpeg', ['-v', 'error', '-y', '-f', 'concat', '-safe', '0', '-i', path.join(build, 'parts.txt'), '-c', 'copy', path.join(build, 'video.mp4')], { stdio: 'inherit' }).on('close', r));
  parts.forEach((x) => fs.unlinkSync(x.out));
  srv.close();
})().catch((e) => { console.error(e); process.exit(1); });
