// a static server for the website root (the reels read the brand assets and the catalog from there)
const http = require('http'), fs = require('fs'), path = require('path');
const ROOT = path.resolve(__dirname, '../..');
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.webp': 'image/webp', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.woff2': 'font/woff2', '.wav': 'audio/wav', '.mp3': 'audio/mpeg' };
function start(port = 0) {
  return new Promise((res) => {
    const srv = http.createServer((q, r) => {
      const p = path.join(ROOT, decodeURIComponent(q.url.split('?')[0]));
      if (!p.startsWith(ROOT)) { r.writeHead(403); return r.end(); }
      fs.readFile(p, (e, b) => { if (e) { r.writeHead(404); return r.end(); } r.writeHead(200, { 'Content-Type': TYPES[path.extname(p)] || 'application/octet-stream', 'Cache-Control': 'no-store' }); r.end(b); });
    });
    srv.listen(port, '127.0.0.1', () => res(srv));
  });
}
async function open(chromium, srv, id, extra = '') {
  const b = await chromium.launch();
  const p = await b.newPage({ viewport: { width: 1080, height: 1920 } });
  p.on('pageerror', (e) => console.log('pageerror:', e.message));
  // v2 scripts ("v": 2) play on v2/stage.html; v1 scripts on stage.html (unchanged)
  let v2 = false; try { v2 = JSON.parse(fs.readFileSync(path.join(ROOT, 'reels', 'scripts', id, 'script.json'), 'utf8')).v === 2; } catch (e) { /* */ }
  await p.goto('http://127.0.0.1:' + srv.address().port + '/reels/engine/' + (v2 ? 'v2/' : '') + 'stage.html?reel=' + id + extra);
  await p.waitForFunction(() => window.ready || window.bootError, null, { timeout: 120000 });
  const err = await p.evaluate(() => window.bootError);
  if (err) throw new Error(err);
  return { b, p };
}
module.exports = { start, open };
if (require.main === module) start(+process.argv[2] || 8361).then((s) => console.log('http://127.0.0.1:' + s.address().port + '/reels/engine/stage.html?reel=mit-gusa-kilograme&debug=1'));
