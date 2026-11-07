// Pentru testele de performanță: @vercel/blob în memorie (cu versiuni, ifMatch și allowOverwrite: false, ca R2 prin
// cf/blob-r2.js) și _lib/auth cu un admin de test. Nimic real: nici R2, nici sesiuni.
const Module = require('module'), path = require('path');
const API = path.join(__dirname, '..', '..', 'api');
const store = new Map(); let ver = 0;
class BlobNotFoundError extends Error { constructor() { super('The requested blob does not exist'); this.name = 'BlobNotFoundError'; } }
const blob = {
  store,
  async put(p, body, o = {}) {
    const cur = store.get(p);
    if (o.ifMatch && (!cur || cur.etag !== o.ifMatch)) throw Object.assign(new Error('Precondition failed: ETag mismatch.'), { name: 'BlobPreconditionFailedError' });
    if (o.allowOverwrite === false && cur) throw new Error('This blob already exists, use `allowOverwrite: true` if you want to overwrite it.');
    const etag = '"v' + (++ver) + '"';
    store.set(p, { body: String(body), etag });
    return { pathname: p, etag };
  },
  async get(p) {
    const cur = store.get(p);
    if (!cur) return null;
    return { statusCode: 200, blob: { etag: 'W/' + cur.etag, size: cur.body.length }, stream: (async function* () { yield Buffer.from(cur.body); })() };
  },
  async del(p) { (Array.isArray(p) ? p : [p]).forEach((x) => store.delete(x)); },
  BlobNotFoundError,
};
let admin = true;
const auth = { async requireAdmin(req, res) { if (admin) return { id: 'test', role: 'admin' }; res.status(401).json({ error: 'not_authenticated' }); return null; } };
const load0 = Module._load;
Module._load = function (req, parent, ...a) {
  if (req === '@vercel/blob') return blob;
  if (req === './_lib/auth' && parent && parent.filename.startsWith(API)) return auth;
  return load0.call(this, req, parent, ...a);
};
// req / res în stilul Vercel (cum le face cf/node-adapter.js)
function call(fn, { method = 'GET', body, headers = {}, query = {} } = {}) {
  return new Promise((done) => {
    const res = { statusCode: 200, h: {}, setHeader(k, v) { this.h[k.toLowerCase()] = v; }, status(c) { this.statusCode = c; return this; },
      json(o) { this.end(JSON.stringify(o)); }, end(b) { done({ status: this.statusCode, body: b ? JSON.parse(b) : null }); } };
    fn({ method, body, headers, query, url: '/api/x' }, res);
  });
}
module.exports = { blob, store, call, setAdmin: (v) => { admin = v; }, API };
