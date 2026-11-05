// Adaptor Vercel → Cloudflare Workers: funcțiile din api/ (stil Node, req/res, CommonJS) rulează neschimbate.
// Făcut după cel de la Aranca, plus: req.body (ca la Vercel), răspuns în flux (res.write înainte de end, la chatbot).
// Centrul360: ca la Node / Vercel, răspunsul se încheie la res.end(), nu când funcția s-a terminat (jurnalul de activitate
// din portal trimite răspunsul după ce își scrie rândul); o funcție care uită de res.end() e închisă după 60 de secunde.
import { Buffer } from "node:buffer";

async function toReq(request, extra) {
  const u = new URL(request.url);
  const headers = {};
  request.headers.forEach((v, k) => { headers[k] = v; });
  const ip = request.headers.get("cf-connecting-ip") || "";
  if (ip) headers["x-forwarded-for"] = ip;
  headers["x-forwarded-proto"] = u.protocol.replace(":", "");
  headers["x-forwarded-host"] = u.host;
  const raw = request.method === "GET" || request.method === "HEAD" ? Buffer.alloc(0) : Buffer.from(await request.arrayBuffer());
  // req.body ca la Vercel: JSON, formular sau text
  let body;
  const ct = (headers["content-type"] || "").toLowerCase();
  if (raw.length) {
    const text = raw.toString("utf8");
    if (ct.includes("application/json")) { try { body = JSON.parse(text); } catch { body = text; } }
    else if (ct.includes("application/x-www-form-urlencoded")) body = Object.fromEntries(new URLSearchParams(text));
    else if (ct.startsWith("text/")) body = text;
    else body = raw;
  }
  const query = {};
  for (const [k, v] of u.searchParams) query[k] = k in query ? [].concat(query[k], v) : v;
  // o bucată dintr-un fișier mare spre R2 (cf/blob-client-r2.js): ca la Vercel, încărcările nu intră în jurnalul de activitate
  if (query.r2part && Buffer.isBuffer(body)) body.type = "blob.r2-part";
  return Object.assign({
    method: request.method, url: u.pathname + u.search, headers, query, body, rawBody: raw,
    socket: { remoteAddress: ip }, connection: { remoteAddress: ip },
    on(ev, cb) { if (ev === "data" && raw.length) queueMicrotask(() => cb(raw)); if (ev === "end") queueMicrotask(() => queueMicrotask(cb)); return this; },
    async *[Symbol.asyncIterator]() { if (raw.length) yield raw; }
  }, extra || {});
}

function toRes() {
  let started, done;
  const headStarted = new Promise((r) => { started = r; });
  const finished = new Promise((r) => { done = r; });
  const h = new Map();
  let stream = null, writer = null, chunks = [];
  const enc = (c) => (typeof c === "string" ? Buffer.from(c) : Buffer.from(c));
  const res = {
    statusCode: 200, headersSent: false, writableEnded: false,
    setHeader(k, v) { h.set(String(k).toLowerCase(), v); return res; },
    getHeader(k) { return h.get(String(k).toLowerCase()); },
    getHeaders() { return Object.fromEntries(h); },
    hasHeader(k) { return h.has(String(k).toLowerCase()); },
    removeHeader(k) { h.delete(String(k).toLowerCase()); },
    writeHead(code, a, b) { res.statusCode = code; const hs = typeof a === "object" ? a : b; if (hs) Object.entries(hs).forEach(([k, v]) => res.setHeader(k, v)); return res; },
    flushHeaders() { res.startStream(); },
    status(code) { res.statusCode = code; return res; },
    json(o) { if (!res.hasHeader("content-type")) res.setHeader("Content-Type", "application/json; charset=utf-8"); res.end(JSON.stringify(o)); return res; },
    send(b) { if (b !== null && typeof b === "object" && !Buffer.isBuffer(b) && !(b instanceof Uint8Array)) return res.json(b); res.end(b); return res; },
    redirect(a, b) { const [code, loc] = typeof a === "number" ? [a, b] : [307, a]; res.statusCode = code; res.setHeader("Location", loc); res.end(); return res; },
    startStream() { if (!stream) { stream = new TransformStream(); writer = stream.writable.getWriter(); chunks.forEach((c) => writer.write(c)); chunks = []; res.headersSent = true; started(); } },
    write(c) { if (c == null) return true; if (!stream) res.startStream(); writer.write(enc(c)); return true; },
    end(c) {
      if (res.writableEnded) return res;
      if (c != null && typeof c !== "function") { if (stream) writer.write(enc(c)); else chunks.push(enc(c)); }
      res.writableEnded = res.headersSent = true;
      if (stream) writer.close();
      started(); done();
      return res;
    },
    on() { return res; }, once() { return res; }
  };
  res.response = () => {
    const out = new Headers();
    for (const [k, v] of h) (Array.isArray(v) ? v : [v]).forEach((x) => out.append(k, String(x)));
    const noBody = res.statusCode === 204 || res.statusCode === 304;
    const body = noBody ? null : stream ? stream.readable : Buffer.concat(chunks);
    return new Response(body, { status: res.statusCode, headers: out });
  };
  res.headStarted = headStarted;
  res.finished = finished;
  return res;
}

// rulează o funcție din api/ și întoarce un Response. opts.extra: câmpuri puse pe req; opts.headers: antete implicite
export async function runNode(handler, request, ctx, opts) {
  opts = opts || {};
  const fn = handler && (handler.default || handler);
  const req = await toReq(request, opts.extra);
  const res = toRes();
  const work = Promise.resolve().then(() => fn(req, res));
  const grace = () => Promise.race([res.finished, new Promise((r) => setTimeout(r, 60e3))]);
  const failed = work.then(() => Promise.resolve(res.writableEnded ? null : grace()).then(() => { if (!res.writableEnded) res.end(); }), (e) => {
    console.error(e);
    if (!res.headersSent) { res.statusCode = 500; res.setHeader("Content-Type", "application/json; charset=utf-8"); res.end('{"error":"Eroare de server"}'); }
    else res.end();
  });
  await Promise.race([res.headStarted, failed]);
  if (ctx && ctx.waitUntil) ctx.waitUntil(failed); else await failed;
  const response = res.response();
  (opts.headers || []).forEach(([k, v]) => { if (!response.headers.has(k)) response.headers.set(k, v); });
  return response;
}

// redirecturi și rescrieri ca în vercel.json (forma simplă: căi fixe și „:rest*”)
export function matchRoute(list, url) {
  for (const r of list) {
    if (r.host && !new RegExp("^" + r.host + "$").test(url.host)) continue;
    const m = url.pathname.match(r.re);
    if (m) return typeof r.to === "function" ? r.to(m, url) : r.to;
  }
  return null;
}
