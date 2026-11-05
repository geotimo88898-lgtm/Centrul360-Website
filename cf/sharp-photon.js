// `sharp` pe Cloudflare (mașina de creative): sharp e bibliotecă nativă și nu rulează în Workers. Aici e partea din
// sharp pe care o folosește mașina (citire PNG/JPEG/WEBP, rotire după EXIF, resize cu fit, flatten, extract,
// greyscale, removeAlpha, composite, raw, png/jpeg/webp, metadata), peste Photon (WASM). Se înregistrează ca
// globalThis.__C360_SHARP; în build-ul Next de pe Cloudflare, `sharp` e un modul mic care cheamă funcția asta.
// Diferență cunoscută: WEBP iese fără pierderi (Photon nu are WEBP comprimat), deci fișiere mai mari decât la Vercel.
import { PhotonImage, resize as phResize, SamplingFilter } from "@cf-wasm/photon/workerd";
import { Buffer } from "node:buffer";

function color(c) {
  if (c == null) return [0, 0, 0, 255];
  if (typeof c === "string") {
    let h = c.replace("#", "");
    if (h.length === 3) h = h.split("").map((x) => x + x).join("");
    return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16), 255];
  }
  return [c.r | 0, c.g | 0, c.b | 0, c.alpha == null ? 255 : Math.round(c.alpha * 255)];
}
const bytesOf = (x) => (x instanceof Uint8Array ? x : new Uint8Array(x));
function sniff(b) {
  if (b[0] === 0x89 && b[1] === 0x50) return "png";
  if (b[0] === 0xff && b[1] === 0xd8) return "jpeg";
  if (b[0] === 0x52 && b[1] === 0x49 && b[8] === 0x57 && b[9] === 0x45) return "webp";
  return "";
}
// orientarea EXIF a unui JPEG (1 = normală)
function exifOrientation(b) {
  if (sniff(b) !== "jpeg") return 1;
  let i = 2;
  while (i + 4 < b.length) {
    if (b[i] !== 0xff) return 1;
    const m = b[i + 1], len = (b[i + 2] << 8) | b[i + 3];
    if (m === 0xe1 && b[i + 4] === 0x45 && b[i + 5] === 0x78 && b[i + 6] === 0x69 && b[i + 7] === 0x66) {
      const t = i + 10, le = b[t] === 0x49;
      const u16 = (o) => (le ? b[o] | (b[o + 1] << 8) : (b[o] << 8) | b[o + 1]);
      const u32 = (o) => (le ? (b[o] | (b[o + 1] << 8) | (b[o + 2] << 16) | (b[o + 3] << 24)) >>> 0 : ((b[o] << 24) | (b[o + 1] << 16) | (b[o + 2] << 8) | b[o + 3]) >>> 0);
      const ifd = t + u32(t + 4), n = u16(ifd);
      for (let k = 0; k < n; k++) { const e = ifd + 2 + k * 12; if (u16(e) === 0x0112) return u16(e + 8) || 1; }
      return 1;
    }
    if (m === 0xda) return 1;
    i += 2 + len;
  }
  return 1;
}
// o imagine în lucru: RGBA, lățime, înălțime
function decode(buf) {
  const b = bytesOf(buf);
  const img = PhotonImage.new_from_byteslice(b);
  const out = { px: img.get_raw_pixels(), w: img.get_width(), h: img.get_height(), format: sniff(b), orientation: exifOrientation(b) };
  img.free();
  return out;
}
function reorient(im, o) {
  if (!o || o === 1) return im;
  const { px, w, h } = im;
  const swap = o >= 5;
  const W = swap ? h : w, H = swap ? w : h, out = new Uint8Array(W * H * 4);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    let X, Y;
    switch (o) {
      case 2: X = w - 1 - x; Y = y; break;
      case 3: X = w - 1 - x; Y = h - 1 - y; break;
      case 4: X = x; Y = h - 1 - y; break;
      case 5: X = y; Y = x; break;
      case 6: X = h - 1 - y; Y = x; break;
      case 7: X = h - 1 - y; Y = w - 1 - x; break;
      case 8: X = y; Y = w - 1 - x; break;
      default: X = x; Y = y;
    }
    const s = (y * w + x) * 4, d = (Y * W + X) * 4;
    out[d] = px[s]; out[d + 1] = px[s + 1]; out[d + 2] = px[s + 2]; out[d + 3] = px[s + 3];
  }
  return { px: out, w: W, h: H };
}
function scaled(im, w, h) {
  if (w === im.w && h === im.h) return im;
  const src = new PhotonImage(im.px, im.w, im.h);
  const r = phResize(src, Math.max(1, w), Math.max(1, h), SamplingFilter.Triangle);
  const out = { px: r.get_raw_pixels(), w: r.get_width(), h: r.get_height() };
  src.free(); r.free();
  return out;
}
function blank(w, h, c) {
  const px = new Uint8Array(w * h * 4);
  for (let i = 0; i < px.length; i += 4) { px[i] = c[0]; px[i + 1] = c[1]; px[i + 2] = c[2]; px[i + 3] = c[3]; }
  return { px, w, h };
}
function crop(im, left, top, width, height) {
  const out = new Uint8Array(width * height * 4);
  for (let y = 0; y < height; y++) out.set(im.px.subarray(((top + y) * im.w + left) * 4, ((top + y) * im.w + left + width) * 4), y * width * 4);
  return { px: out, w: width, h: height };
}
// over = deasupra lui base, la (left, top), cu amestec după transparență
function over(base, top, left, y0) {
  const out = new Uint8Array(base.px);
  for (let y = 0; y < top.h; y++) {
    const Y = y0 + y;
    if (Y < 0 || Y >= base.h) continue;
    for (let x = 0; x < top.w; x++) {
      const X = left + x;
      if (X < 0 || X >= base.w) continue;
      const s = (y * top.w + x) * 4, d = (Y * base.w + X) * 4, a = top.px[s + 3] / 255;
      if (a >= 1) { out[d] = top.px[s]; out[d + 1] = top.px[s + 1]; out[d + 2] = top.px[s + 2]; out[d + 3] = 255; continue; }
      const ab = out[d + 3] / 255, ao = a + ab * (1 - a);
      for (let k = 0; k < 3; k++) out[d + k] = ao ? Math.round((top.px[s + k] * a + out[d + k] * ab * (1 - a)) / ao) : 0;
      out[d + 3] = Math.round(ao * 255);
    }
  }
  return { px: out, w: base.w, h: base.h };
}
function resizeTo(im, o) {
  let { width, height } = o;
  const fit = o.fit || "cover";
  if (!width && !height) return im;
  if (!width) width = Math.round((im.w * height) / im.h);
  if (!height) height = Math.round((im.h * width) / im.w);
  if (o.withoutEnlargement && (fit === "inside" || !o.height || !o.width)) {
    if (im.w <= width && im.h <= height) return im;
  }
  if (fit === "fill") return scaled(im, width, height);
  if (fit === "inside" || fit === "outside") {
    const k = fit === "inside" ? Math.min(width / im.w, height / im.h) : Math.max(width / im.w, height / im.h);
    const kk = o.withoutEnlargement ? Math.min(1, k) : k;
    return scaled(im, Math.max(1, Math.round(im.w * kk)), Math.max(1, Math.round(im.h * kk)));
  }
  if (fit === "contain") {
    const k = Math.min(width / im.w, height / im.h);
    const s = scaled(im, Math.max(1, Math.round(im.w * k)), Math.max(1, Math.round(im.h * k)));
    return over(blank(width, height, color(o.background)), s, Math.floor((width - s.w) / 2), Math.floor((height - s.h) / 2));
  }
  // cover: umple, taie ce iese, centrat
  const k = Math.max(width / im.w, height / im.h);
  const s = scaled(im, Math.max(width, Math.round(im.w * k)), Math.max(height, Math.round(im.h * k)));
  return crop(s, Math.floor((s.w - width) / 2), Math.floor((s.h - height) / 2), width, height);
}

class Pipeline {
  constructor(input, opts) {
    this.input = input; this.ops = []; this.out = { format: "png" }; this.channels = 4;
    this.createSpec = input && !(input instanceof Uint8Array) && !(input instanceof ArrayBuffer) && input.create ? input.create : opts && opts.create ? opts.create : null;
  }
  rotate() { this.ops.push(["rotate"]); return this; }
  resize(a, b, c) {
    const o = typeof a === "object" && a ? Object.assign({}, a) : Object.assign({ width: a || undefined, height: b || undefined }, c || {});
    this.ops.push(["resize", o]); return this;
  }
  flatten(o) { this.ops.push(["flatten", o || {}]); return this; }
  extract(r) { this.ops.push(["extract", r]); return this; }
  greyscale() { this.ops.push(["grey"]); return this; }
  grayscale() { return this.greyscale(); }
  removeAlpha() { this.ops.push(["noalpha"]); return this; }
  composite(list) { this.ops.push(["composite", list || []]); return this; }
  png() { this.out = { format: "png" }; return this; }
  jpeg(o) { this.out = { format: "jpeg", quality: (o && o.quality) || 80 }; return this; }
  webp(o) { this.out = { format: "webp", quality: (o && o.quality) || 80 }; return this; }
  raw() { this.out = { format: "raw" }; return this; }
  toFormat(f, o) { return f === "jpeg" || f === "jpg" ? this.jpeg(o) : f === "webp" ? this.webp(o) : f === "raw" ? this.raw() : this.png(); }
  load() {
    if (this.createSpec) { const c = this.createSpec; return { im: blank(c.width, c.height, color(c.background)), format: "raw", orientation: 1, alpha: c.channels === 4 }; }
    const d = decode(this.input);
    return { im: { px: d.px, w: d.w, h: d.h }, format: d.format, orientation: d.orientation, alpha: d.format === "png" || d.format === "webp" };
  }
  async metadata() {
    const b = bytesOf(this.input);
    const d = decode(b);
    return { width: d.w, height: d.h, format: d.format, orientation: d.orientation, channels: 4, hasAlpha: d.format !== "jpeg" };
  }
  async run() {
    const L = this.load();
    let im = L.im, grey = false, noAlpha = !L.alpha;
    for (const [op, a] of this.ops) {
      if (op === "rotate") im = reorient(im, L.orientation);
      else if (op === "resize") im = resizeTo(im, a);
      else if (op === "flatten") { im = over(blank(im.w, im.h, color(a.background || "#000000")), im, 0, 0); noAlpha = true; }
      else if (op === "extract") im = crop(im, a.left | 0, a.top | 0, a.width | 0, a.height | 0);
      else if (op === "grey") grey = true;
      else if (op === "noalpha") noAlpha = true;
      else if (op === "composite") {
        for (const c of a) {
          let t = c.input && c.input.create ? blank(c.input.create.width, c.input.create.height, color(c.input.create.background)) : (() => { const d = decode(c.input); return { px: d.px, w: d.w, h: d.h }; })();
          im = over(im, t, c.left | 0, c.top | 0);
        }
      }
    }
    if (grey) {
      const px = new Uint8Array(im.px);
      for (let i = 0; i < px.length; i += 4) { const g = Math.round(0.2126 * px[i] + 0.7152 * px[i + 1] + 0.0722 * px[i + 2]); px[i] = px[i + 1] = px[i + 2] = g; }
      im = { px, w: im.w, h: im.h };
    }
    const f = this.out.format;
    if (f === "raw") {
      const ch = grey ? 1 : noAlpha ? 3 : 4;
      if (ch === 4) return { data: Buffer.from(im.px), info: { width: im.w, height: im.h, channels: 4, size: im.px.length, format: "raw" } };
      const out = new Uint8Array(im.w * im.h * ch);
      for (let i = 0, j = 0; i < im.px.length; i += 4, j += ch) { out[j] = im.px[i]; if (ch === 3) { out[j + 1] = im.px[i + 1]; out[j + 2] = im.px[i + 2]; } }
      return { data: Buffer.from(out), info: { width: im.w, height: im.h, channels: ch, size: out.length, format: "raw" } };
    }
    if (noAlpha && f !== "jpeg") { for (let i = 3; i < im.px.length; i += 4) im.px[i] = 255; }
    const p = new PhotonImage(im.px, im.w, im.h);
    let bytes;
    try { bytes = f === "jpeg" ? p.get_bytes_jpeg(this.out.quality) : f === "webp" ? p.get_bytes_webp() : p.get_bytes(); }
    finally { p.free(); }
    return { data: Buffer.from(bytes), info: { width: im.w, height: im.h, channels: noAlpha ? 3 : 4, size: bytes.length, format: f } };
  }
  async toBuffer(o) {
    const r = await this.run();
    return o && o.resolveWithObject ? r : r.data;
  }
}

export default function sharp(input, opts) { return new Pipeline(input, opts); }
