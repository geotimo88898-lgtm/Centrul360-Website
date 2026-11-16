// Local harness for qa/: the repo's api/*.js on a plain Node server (Vercel Blob mocked on the folder qa/.data, no outbound network), the portal's static files.
//   node qa/seed.cjs && node qa/server.cjs      then open http://127.0.0.1:8787 (PORT=... for another port)
const http = require('http'), fs = require('fs'), path = require('path'), crypto = require('crypto'), Module = require('module');
const REPO = process.env.REPO || path.join(__dirname, '..');
const DATA = process.env.DATA || path.join(__dirname, '.data');
process.env.PORTAL_SECRET = process.env.PORTAL_SECRET || 'dev-secret-only-local';
fs.mkdirSync(DATA, { recursive: true });
const fileOf = (p) => path.join(DATA, p.replace(/\//g, '__'));
const etagOf = (buf) => '"' + crypto.createHash('md5').update(buf).digest('hex') + '"';
class BlobNotFoundError extends Error { constructor() { super('not found'); this.name = 'BlobNotFoundError'; } }
class BlobPreconditionFailedError extends Error { constructor() { super('precondition failed'); this.name = 'BlobPreconditionFailedError'; } }
const blob = {
  async put(p, body, o) {
    const f = fileOf(p), buf = Buffer.isBuffer(body) ? body : Buffer.from(typeof body === 'string' ? body : body instanceof Uint8Array ? body : String(body));
    if (o && o.ifMatch && fs.existsSync(f) && etagOf(fs.readFileSync(f)) !== o.ifMatch) throw new BlobPreconditionFailedError();
    if (o && o.allowOverwrite === false && fs.existsSync(f)) throw new Error('already exists');
    fs.writeFileSync(f, buf);
    return { pathname: p, url: 'http://blob/' + p, etag: etagOf(buf) };
  },
  async get(p, o) {
    const f = fileOf(p);
    if (!fs.existsSync(f)) return null;
    const buf = fs.readFileSync(f), etag = etagOf(buf);
    if (o && o.ifNoneMatch && o.ifNoneMatch === etag) return { statusCode: 304 };
    const { Readable } = require('stream');
    return { statusCode: 200, stream: Readable.from([buf]), blob: { etag, size: buf.length, pathname: p } };
  },
  async head(p) { const f = fileOf(p); if (!fs.existsSync(f)) throw new BlobNotFoundError(); const buf = fs.readFileSync(f); return { size: buf.length, etag: etagOf(buf), pathname: p }; },
  async del(p) { [].concat(p).forEach((x) => { try { fs.unlinkSync(fileOf(x)); } catch (e) {} }); },
  async list() { return { blobs: [], hasMore: false }; },
  BlobNotFoundError, BlobPreconditionFailedError,
};
const origLoad = Module._load;
Module._load = function (req, parent, isMain) {
  if (req === '@vercel/blob') return blob;
  if (req === 'web-push') return { setVapidDetails() {}, sendNotification: async () => ({}), generateVAPIDKeys: () => ({ publicKey: 'x', privateKey: 'y' }) };
  return origLoad.apply(this, arguments);
};
// no outbound network from the API in the harness
const realFetch = global.fetch;
global.fetch = async (u, o) => { const s = String(u && u.url || u); if (/^http:\/\/127\.0\.0\.1/.test(s)) return realFetch(u, o); throw new Error('offline harness: ' + s.slice(0, 60)); };

const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json', '.png': 'image/png', '.webp': 'image/webp', '.svg': 'image/svg+xml', '.jpg': 'image/jpeg', '.woff2': 'font/woff2' };
function wrapRes(res) {
  res.status = (c) => { res.statusCode = c; return res; };
  res.json = (o) => { if (!res.getHeader('content-type')) res.setHeader('Content-Type', 'application/json; charset=utf-8'); res.end(JSON.stringify(o)); return res; };
  res.send = (b) => { if (b && typeof b === 'object' && !Buffer.isBuffer(b)) return res.json(b); res.end(b); return res; };
  return res;
}
const log = [];
http.createServer(async (req, res) => {
  wrapRes(res);
  const u = new URL(req.url, 'http://localhost');
  try {
    if (u.pathname.startsWith('/api/')) {
      const name = u.pathname.slice(5).replace(/\/$/, '');
      const file = path.join(REPO, 'api', name + '.js');
      if (!/^[\w-]+$/.test(name) || !fs.existsSync(file)) { res.status(404).json({ error: 'no_api' }); return; }
      const chunks = []; for await (const c of req) chunks.push(c);
      const raw = Buffer.concat(chunks).toString('utf8');
      req.body = raw && /json/.test(req.headers['content-type'] || '') ? JSON.parse(raw) : raw || undefined;
      req.query = Object.fromEntries(u.searchParams);
      const h = require(file);
      await (h.default || h)(req, res);
      log.push(req.method + ' ' + u.pathname + ' ' + (req.body && req.body.action || '') + ' ' + res.statusCode);
      if (res.statusCode >= 500) console.log('500', u.pathname, req.body && req.body.action);
      return;
    }
    let p = u.pathname === '/' ? '/portal.html' : u.pathname;
    if (p === '/login') p = '/portal-login.html';
    const f = path.join(REPO, decodeURIComponent(p));
    if (!f.startsWith(REPO) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.statusCode = 404; res.end('nf'); return; }
    res.setHeader('Content-Type', MIME[path.extname(f)] || 'application/octet-stream');
    res.end(fs.readFileSync(f));
  } catch (e) { console.error('ERR', u.pathname, e.stack); if (!res.headersSent) res.status(500).json({ error: String(e.message) }); }
}).listen(Number(process.env.PORT || 8787), '127.0.0.1', () => console.log('dev on', process.env.PORT || 8787));
process.on('unhandledRejection', (e) => console.error('UNHANDLED', e && e.stack));
