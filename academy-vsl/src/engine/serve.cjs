// a static server for the website root (the films read the brand assets from there)
const http = require('http'), fs = require('fs'), path = require('path');
const ROOT = path.resolve(__dirname, '../../..');
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.webp': 'image/webp', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.woff2': 'font/woff2', '.glb': 'model/gltf-binary', '.wav': 'audio/wav', '.mp4': 'video/mp4' };
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
module.exports = { start };
if (require.main === module) start(+process.argv[2] || 8360).then((s) => console.log('http://127.0.0.1:' + s.address().port + '/academy-vsl/src/engine/stage.html?film=parcurs'));
