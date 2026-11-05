// @vercel/blob/client pe Cloudflare: handleUpload primește fișierele mari (video Academy, documente WhatsApp) pe bucăți
// și le scrie în R2 ca încărcare în mai multe părți. Perechea din browser e cf/blob-upload-r2.js, servit pe Cloudflare
// la /vendor/blob-upload.js în locul bibliotecii Vercel. Pe Vercel nu se folosește.
// Protocolul: JSON { type: "blob.r2-start" | "blob.r2-complete" | "blob.r2-abort", … }; o parte = POST cu ?r2part=N&key=…&uploadId=…
// și conținutul brut. Fiecare cerere trece întâi prin verificarea de cont a funcției (requireAuth / requireAdmin)
// și prin onBeforeGenerateToken (calea, mărimea, tipul permise), exact ca la Vercel.
import { env } from "cloudflare:workers";

export const PART_SIZE = 8 * 1024 * 1024;

export async function handleUpload({ body, request, onBeforeGenerateToken }) {
  const bucket = env.BLOB;
  if (!bucket) throw new Error("r2_not_bound");
  const q = (request && request.query) || {};
  if (q.r2part) {
    const key = String(q.key || ""), uploadId = String(q.uploadId || ""), n = Number(q.r2part);
    if (!key || !uploadId || !(n >= 1 && n <= 10000)) throw new Error("invalid_part");
    const rules = (await onBeforeGenerateToken(key, null, true)) || {};
    const max = rules.maximumSizeInBytes || 0;
    if (max && (n - 1) * PART_SIZE >= max) throw new Error("too_large");
    const data = body && body.length != null ? body : new Uint8Array(0);
    const part = await bucket.resumeMultipartUpload(key, uploadId).uploadPart(n, data);
    return { type: "blob.r2-part", partNumber: part.partNumber, etag: part.etag };
  }
  const b = body || {};
  const key = String(b.pathname || "");
  if (!key) throw new Error("invalid_path");
  const rules = (await onBeforeGenerateToken(key, b.clientPayload || null, true)) || {};
  if (b.type === "blob.r2-start") {
    const size = Number(b.size) || 0, type = String(b.contentType || "application/octet-stream");
    if (rules.maximumSizeInBytes && size > rules.maximumSizeInBytes) throw new Error("too_large");
    if (rules.allowedContentTypes && rules.allowedContentTypes.length && !rules.allowedContentTypes.includes(type)) throw new Error("content_type_not_allowed");
    if (rules.allowOverwrite === false && (await bucket.head(key))) throw new Error("already_exists");
    const up = await bucket.createMultipartUpload(key, { httpMetadata: { contentType: type } });
    return { type: "blob.r2-started", uploadId: up.uploadId, key, partSize: PART_SIZE };
  }
  if (b.type === "blob.r2-complete") {
    const parts = (Array.isArray(b.parts) ? b.parts : []).map((p) => ({ partNumber: Number(p.partNumber), etag: String(p.etag) }));
    await bucket.resumeMultipartUpload(key, String(b.uploadId || "")).complete(parts);
    return { type: "blob.r2-completed", pathname: key };
  }
  if (b.type === "blob.r2-abort") {
    try { await bucket.resumeMultipartUpload(key, String(b.uploadId || "")).abort(); } catch (e) { /* deja închisă */ }
    return { type: "blob.r2-aborted" };
  }
  throw new Error("invalid_request");
}

export default { handleUpload };
