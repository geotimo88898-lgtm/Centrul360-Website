// Renders a reel frame by frame: node render.cjs <id> [workers=3]
// → scripts/<id>/build/film.json (times, sound cues) and build/video.mp4 (no sound, high quality, for encode.sh)
const { chromium } = require('playwright');
const { spawn } = require('child_process');
const fs = require('fs'), path = require('path');
const { start, open } = require('./serve.cjs');
const FPS = 30;
// Optional real motion blur for DOM scenes (15.11): a script's "subframes": { "n": 4, "shutter": 0.5, "ranges": [[t0, t1], …] }
// makes every frame (or only the frames inside the ranges) the average of n sub-frames spread over the open shutter
// (ffmpeg tmix). Without "subframes" in the script nothing changes.
async function segment(srv, id, a, z, out, tag, SUB) {
  const { b, p } = await open(chromium, srv, id);
  const cdp = await p.context().newCDPSession(p);
  const K = SUB && SUB.n > 1 ? Math.round(SUB.n) : 1, shut = (SUB && SUB.shutter) || 0.5;
  const ff = spawn('ffmpeg', ['-v', 'error', '-y', '-f', 'image2pipe', '-framerate', String(FPS * K), '-c:v', 'mjpeg', '-i', '-'].concat(K > 1 ? ['-vf', 'tmix=frames=' + K + ",select='not(mod(n+1," + K + "))',setpts=N/(" + FPS + '*TB)', '-r', String(FPS)] : [], ['-c:v', 'libx264', '-preset', 'veryfast', '-crf', '12', '-pix_fmt', 'yuv420p', out]), { stdio: ['pipe', 'inherit', 'inherit'] });
  const t0 = Date.now();
  for (let i = a; i < z; i++) {
    if (K > 1) { // the sub-frames of this frame; a frame outside the ranges is one picture, written n times
      const inR = !SUB.ranges || SUB.ranges.some((r) => i / FPS >= r[0] && i / FPS <= r[1]);
      let buf = null;
      for (let k = 0; k < K; k++) {
        if (inR || !buf) { await p.evaluate((t) => window.seek(t), inR ? i / FPS + ((k + 0.5) / K - 0.5) * shut / FPS : i / FPS); buf = Buffer.from((await cdp.send('Page.captureScreenshot', { format: 'jpeg', quality: 93, optimizeForSpeed: true })).data, 'base64'); }
        if (!ff.stdin.write(buf)) await new Promise((r) => ff.stdin.once('drain', r));
      }
      if ((i - a) % 300 === 0) console.log(tag, (i - a) + '/' + (z - a), ((i - a) / ((Date.now() - t0) / 1000 + 0.01)).toFixed(1) + ' fps');
      continue;
    }
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
  let SUB = null; try { SUB = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'scripts', id, 'script.json'), 'utf8')).subframes || null; } catch (e) { /* no script options */ }
  await Promise.all(parts.map((x, w) => segment(srv, id, x.a, x.z, x.out, 'w' + w, SUB)));
  fs.writeFileSync(path.join(build, 'parts.txt'), parts.map((x) => "file '" + x.out + "'").join('\n'));
  await new Promise((r) => spawn('ffmpeg', ['-v', 'error', '-y', '-f', 'concat', '-safe', '0', '-i', path.join(build, 'parts.txt'), '-c', 'copy', path.join(build, 'video.mp4')], { stdio: 'inherit' }).on('close', r));
  parts.forEach((x) => fs.unlinkSync(x.out));
  srv.close();
})().catch((e) => { console.error(e); process.exit(1); });
