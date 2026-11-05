// Vercel Blob → Cloudflare R2: aceleași funcții ca @vercel/blob (put, get, head, del, list), scrise peste un bucket R2.
// Pe Cloudflare, wrangler.jsonc trimite `@vercel/blob` aici (alias), deci api/_lib/store.js și restul rulează neschimbate.
// Pe Vercel nu se folosește deloc. Aceleași căi ca în Blob (data/clients.json, contacts/…, academy/…).
// makeBlob(bucket) e folosit și pentru mașina de creative (alt bucket), prin globalThis.__C360_CREATIVE_BLOB.
import { env } from "cloudflare:workers";
import { Buffer } from "node:buffer";

class BlobError extends Error { constructor(m) { super(m); this.name = "BlobError"; } }
class BlobNotFoundError extends BlobError { constructor() { super("The requested blob does not exist"); this.name = "BlobNotFoundError"; } }
class BlobPreconditionFailedError extends BlobError { constructor() { super("Precondition failed: ETag mismatch."); this.name = "BlobPreconditionFailedError"; } }

const unq = (e) => String(e || "").replace(/^W\//, "").replace(/^"|"$/g, "");
const quote = (e) => (e ? '"' + unq(e) + '"' : "");
const keyOf = (p) => {
  const s = String(p || "");
  if (/^https?:\/\//.test(s)) return decodeURIComponent(new URL(s).pathname.slice(1));
  return s.replace(/^\/+/, "");
};
const urlOf = (key) => "r2://" + key;

async function toBody(body) {
  if (body == null) return "";
  if (typeof body === "string" || body instanceof ArrayBuffer || ArrayBuffer.isView(body)) return body;
  if (typeof Blob !== "undefined" && body instanceof Blob) return body.arrayBuffer();
  if (body instanceof ReadableStream) return new Response(body).arrayBuffer();
  if (body[Symbol.asyncIterator]) { const parts = []; for await (const c of body) parts.push(Buffer.from(c)); return Buffer.concat(parts); }
  return String(body);
}
function meta(o) {
  return {
    url: urlOf(o.key), downloadUrl: urlOf(o.key) + "?download=1", pathname: o.key,
    contentType: (o.httpMetadata && o.httpMetadata.contentType) || "application/octet-stream",
    contentDisposition: "", cacheControl: (o.httpMetadata && o.httpMetadata.cacheControl) || "",
    size: o.size, uploadedAt: o.uploaded, etag: quote(o.etag)
  };
}

export function makeBlob(bucket) {
  const B = () => {
    const b = bucket();
    if (!b) throw new BlobError("Stocarea R2 nu e legată de Worker (binding lipsă).");
    return b;
  };
  async function put(pathname, body, opts) {
    opts = opts || {};
    let key = keyOf(pathname);
    if (opts.addRandomSuffix) key = key.replace(/(\.[^./]+)?$/, (ext) => "-" + crypto.randomUUID().slice(0, 21).replace(/-/g, "") + (ext || ""));
    const httpMetadata = { contentType: opts.contentType || "application/octet-stream" };
    if (opts.cacheControlMaxAge != null) httpMetadata.cacheControl = "max-age=" + opts.cacheControlMaxAge;
    const o = { httpMetadata };
    if (opts.ifMatch) o.onlyIf = { etagMatches: unq(opts.ifMatch) };
    else if (opts.allowOverwrite === false) {
      // „doar dacă nu există”: R2 nu are if-none-match:* pe put, deci verific întâi (fereastra de cursă e de milisecunde)
      if (await B().head(key)) throw new BlobError("This blob already exists, use `allowOverwrite: true` if you want to overwrite it.");
    }
    const res = await B().put(key, await toBody(body), o);
    if (!res) throw new BlobPreconditionFailedError();
    return meta(res);
  }
  async function get(pathname, opts) {
    opts = opts || {};
    const key = keyOf(pathname);
    const range = /bytes=(\d+)-(\d*)/.exec(String((opts.headers && (opts.headers.range || opts.headers.Range)) || ""));
    const o = {};
    if (opts.ifNoneMatch) o.onlyIf = { etagDoesNotMatch: unq(opts.ifNoneMatch) };
    if (range) o.range = range[2] ? { offset: Number(range[1]), length: Number(range[2]) - Number(range[1]) + 1 } : { offset: Number(range[1]) };
    const obj = await B().get(key, o);
    if (!obj) return null;
    const h = new Headers({ etag: quote(obj.etag), "content-type": (obj.httpMetadata && obj.httpMetadata.contentType) || "application/octet-stream" });
    if (!("body" in obj) || !obj.body) return { statusCode: 304, stream: null, headers: h, blob: Object.assign(meta(obj), { contentType: null, size: null }) };
    if (range) {
      const from = Number(range[1]), to = range[2] ? Math.min(Number(range[2]), obj.size - 1) : obj.size - 1;
      h.set("content-range", "bytes " + from + "-" + to + "/" + obj.size);
      return { statusCode: 206, stream: obj.body, headers: h, blob: meta(obj) };
    }
    h.set("content-length", String(obj.size));
    return { statusCode: 200, stream: obj.body, headers: h, blob: meta(obj) };
  }
  async function head(pathname) {
    const o = await B().head(keyOf(pathname));
    if (!o) throw new BlobNotFoundError();
    return meta(o);
  }
  async function del(pathnames) {
    const keys = (Array.isArray(pathnames) ? pathnames : [pathnames]).map(keyOf).filter(Boolean);
    for (let i = 0; i < keys.length; i += 1000) await B().delete(keys.slice(i, i + 1000));
  }
  async function list(opts) {
    opts = opts || {};
    const r = await B().list({ prefix: opts.prefix || undefined, cursor: opts.cursor || undefined, limit: Math.min(1000, opts.limit || 1000) });
    return { blobs: r.objects.map((o) => ({ url: urlOf(o.key), downloadUrl: urlOf(o.key) + "?download=1", pathname: o.key, size: o.size, uploadedAt: o.uploaded, etag: quote(o.etag) })), hasMore: !!r.truncated, cursor: r.truncated ? r.cursor : undefined };
  }
  return { put, get, head, del, list };
}

// bucket-ul portalului (fostul store Vercel „centrul360-website-private”)
const site = makeBlob(() => env.BLOB);
export const put = site.put, get = site.get, head = site.head, del = site.del, list = site.list;
// linkuri semnate direct spre stocare nu există pe R2 fără chei S3: cine le cere cade pe varianta lui fără semnare
export async function issueSignedToken() { throw new BlobError("Linkurile semnate nu există pe R2."); }
export async function presignUrl() { throw new BlobError("Linkurile semnate nu există pe R2."); }
export { BlobError, BlobNotFoundError, BlobPreconditionFailedError };
export default { put, get, head, del, list, issueSignedToken, presignUrl };
