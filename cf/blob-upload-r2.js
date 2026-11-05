// Încărcarea fișierelor mari din portal pe Cloudflare (servit la /vendor/blob-upload.js doar acolo; pe Vercel rămâne
// biblioteca Vercel). Aceeași interfață: window.C360BlobUpload.upload(cale, fișier, { handleUploadUrl, contentType,
// onUploadProgress }). Fișierul pleacă pe bucăți de 8 MB la aceeași adresă a portalului, care le scrie în R2.
(function () {
  var PART = 8 * 1024 * 1024;
  function url(base, extra) { return base + (base.indexOf("?") >= 0 ? "&" : "?") + extra; }
  async function call(u, body, raw) {
    var r = await fetch(u, { method: "POST", credentials: "same-origin", headers: { "content-type": raw ? "application/octet-stream" : "application/json" }, body: raw ? body : JSON.stringify(body) });
    var j = null;
    try { j = await r.json(); } catch (e) { j = null; }
    if (!r.ok) { var err = new Error((j && (j.message || j.error)) || "upload_failed"); err.code = j && j.error; throw err; }
    return j;
  }
  async function upload(pathname, file, opts) {
    opts = opts || {};
    var base = opts.handleUploadUrl;
    var type = opts.contentType || file.type || "application/octet-stream";
    var start = await call(base, { type: "blob.r2-start", pathname: pathname, contentType: type, size: file.size, clientPayload: opts.clientPayload || null });
    var size = start.partSize || PART, parts = [], done = 0;
    try {
      for (var n = 1, off = 0; off < file.size || n === 1; n++, off += size) {
        var chunk = file.slice(off, Math.min(file.size, off + size));
        var p = await call(url(base, "r2part=" + n + "&key=" + encodeURIComponent(start.key) + "&uploadId=" + encodeURIComponent(start.uploadId)), chunk, true);
        parts.push({ partNumber: p.partNumber, etag: p.etag });
        done += chunk.size;
        if (opts.onUploadProgress) try { opts.onUploadProgress({ loaded: done, total: file.size, percentage: file.size ? (done / file.size) * 100 : 100 }); } catch (e) { /* doar afișare */ }
        if (off + size >= file.size) break;
      }
      await call(base, { type: "blob.r2-complete", pathname: start.key, uploadId: start.uploadId, parts: parts });
    } catch (e) {
      call(base, { type: "blob.r2-abort", pathname: start.key, uploadId: start.uploadId }).catch(function () {});
      throw e;
    }
    return { pathname: start.key, url: "r2://" + start.key, contentType: type };
  }
  window.C360BlobUpload = { upload: upload };
})();
