// Conținut (organic reels, carousels, stories; the owner, 12.11): the size and length of a file the nightly producer
// uploads, read from the file itself (an MP4's header, a JPEG's frame, a PNG's IHDR), so a wrong file never gets posted
// because the producer said it was fine. Nothing is decoded; only the headers are read.

// MP4: the length from moov/mvhd, the size from the first track with a picture (trak/tkhd)
function boxes(buf, from, to, fn) {
  let p = from;
  while (p + 8 <= to) {
    let size = buf.readUInt32BE(p), head = 8;
    const type = buf.toString('latin1', p + 4, p + 8);
    if (size === 1) { if (p + 16 > to) return; size = Number(buf.readBigUInt64BE(p + 8)); head = 16; }
    else if (size === 0) size = to - p;
    if (size < head || p + size > to) return;
    if (fn(type, p + head, p + size) === false) return;
    p += size;
  }
}
function mp4(buf) {
  const out = { w: 0, h: 0, dur: 0 };
  let moov = null;
  boxes(buf, 0, buf.length, (t, a, b) => { if (t === 'moov') { moov = [a, b]; return false; } return true; });
  if (!moov) return null;
  boxes(buf, moov[0], moov[1], (t, a, b) => {
    if (t === 'mvhd' && b - a >= 32) {
      const v = buf[a];
      const scale = v === 1 ? buf.readUInt32BE(a + 20) : buf.readUInt32BE(a + 12);
      const len = v === 1 ? Number(buf.readBigUInt64BE(a + 24)) : buf.readUInt32BE(a + 16);
      if (scale) out.dur = Math.round((len / scale) * 100) / 100;
    }
    if (t === 'trak' && !out.w) {
      boxes(buf, a, b, (t2, a2, b2) => {
        if (t2 !== 'tkhd') return true;
        const off = buf[a2] === 1 ? 88 : 76;
        if (a2 + off + 8 <= b2) {
          const w = buf.readUInt32BE(a2 + off) / 65536, h = buf.readUInt32BE(a2 + off + 4) / 65536;
          if (w && h) { out.w = Math.round(w); out.h = Math.round(h); }
        }
        return false;
      });
    }
    return true;
  });
  return out.w || out.dur ? out : null;
}
function jpeg(buf) {
  if (buf[0] !== 0xff || buf[1] !== 0xd8) return null;
  let p = 2;
  while (p + 9 < buf.length) {
    if (buf[p] !== 0xff) { p++; continue; }
    const m = buf[p + 1];
    if (m === 0xd8 || m === 0x01 || (m >= 0xd0 && m <= 0xd7) || m === 0xff) { p += m === 0xff ? 1 : 2; continue; }
    const len = buf.readUInt16BE(p + 2);
    if ((m >= 0xc0 && m <= 0xc3) || (m >= 0xc5 && m <= 0xc7) || (m >= 0xc9 && m <= 0xcb) || (m >= 0xcd && m <= 0xcf)) return { h: buf.readUInt16BE(p + 5), w: buf.readUInt16BE(p + 7) };
    p += 2 + len;
  }
  return null;
}
function png(buf) {
  if (buf.length < 24 || buf.readUInt32BE(0) !== 0x89504e47 || buf.toString('latin1', 12, 16) !== 'IHDR') return null;
  return { w: buf.readUInt32BE(16), h: buf.readUInt32BE(20) };
}
// { w, h, dur } of a file, or null when its header can't be read
function probe(buf, mime) {
  try {
    if (mime === 'video/mp4') return mp4(buf);
    if (mime === 'image/jpeg') return jpeg(buf);
    if (mime === 'image/png') return png(buf);
  } catch (e) { return null; }
  return null;
}

module.exports = { probe };
