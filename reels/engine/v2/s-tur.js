// Centrul360 reels v2: „POV: prima ta consultație.” (15.11), a walk through the clinic in its REAL photos, on the
// second break and drop of „Too Much For Me”. No voice. Every photo is cut into depth by a real depth map
// (scripts/<id>/depth/*.png, engine/depth.py): the camera moves through it in 2.5D (parallax, a dolly zoom, a push
// along the bed, a focus that passes from the petal to the logo), every move starting on a measured beat, covering most
// of its way at once, gliding and holding (README, „Camera”). The film is black and white with turquoise light; each
// photo sits in the top of the frame and melts into white, the step of the consultation is written under it, in the
// site's own words.
//   0. calm (the song's break): a petal, so close it is only soft grey, the logo out of focus on the wall behind;
//      „POV: prima ta consultație.”; on a beat the focus passes to the logo and the camera rises
//   1. DROP: the camera flies through the logo into the light, and lands at the reception (punch-in, a shake)
//   2. 01 „Discutăm obiectivele tale.”: a whip to the two chairs, a dolly zoom on the table between them
//   3. 02 „Evaluăm zona.”: a push through into the room, a push along the bed
//   4. the song's one-bar pause: the bed in the window light, „30 de minute.”, nothing but the light moves
//   5. the drum returns: one device on each beat, then the vials held; 03 „Îți recomandăm un plan personalizat.”,
//      Nuki with the file, small, once
//   6. the white rises over everything: the logo, black on white, the two cities, a turquoise line. Held.
//   visual: { type: "tur", b0, per, shots: {key: {img, size, lv: [lo, mid, hi]}}, hook: [a, b, c], steps: [{n, a, b}],
//             pause: [a, b], nukiImg, cities: [a, b] }
(function () {
  'use strict';
  const R = window.R2, V = R.V, { clamp, h, esc } = R;
  const W = 1080, H = 1920, INK = '#0b0b0d', TEAL = '#14a596', DEEP = '#0b7f74';
  const smooth = (p) => { p = clamp(p); return p * p * (3 - 2 * p); };
  const out5 = (p) => 1 - Math.pow(1 - clamp(p), 5), out3 = (p) => 1 - Math.pow(1 - clamp(p), 3);
  const lerp = (a, b, p) => a + (b - a) * p, fr = (t) => Math.round(t * 30) / 30;
  const ease = (t, t0, d) => R.cam.ease(t, t0, d);
  const CX = 540, CY = 840, PB = 1920;          // the photo fills the frame (its centre at CY, down to PB under the apps' bar); the words sit on a soft veil in the bottom third

  const VS = `#version 300 es
layout(location=0) in vec2 aPos; out vec2 vUv;
void main() { vUv = aPos * .5 + .5; gl_Position = vec4(aPos, 0., 1.); }`;
  // one photo seen by the camera: a ray from near to far through the depth map (the first surface it meets wins),
  // then black and white with the photo's own levels; alpha carries the disparity (for the focus)
  const FS_PHOTO = `#version 300 es
precision highp float;
uniform sampler2D uImg, uDep;
uniform vec2 uSize, uF, uC, uOff, uP;
uniform float uS, uDz, uD0, uW, uSat;
uniform vec4 uLv;
in vec2 vUv; out vec4 o;
vec2 uvAt(vec2 s, float D) { float k = max(.05, 1. + uDz * (D - uD0)); return uF + (s - uC - uOff - uP * (D - uD0)) / (uSize * uS * k); }
float dep(vec2 uv) { return texture(uDep, clamp(uv, 0., 1.)).r; }
void main() {
  vec2 s = vec2(vUv.x, 1. - vUv.y) * vec2(1080., 1920.);
  const int N = 30;
  float D = 1., prevD = 1.; vec2 uv = uvAt(s, 1.); bool hit = false;
  for (int i = 0; i <= N; i++) { D = 1. - float(i) / float(N); uv = uvAt(s, D); if (dep(uv) >= D) { hit = true; break; } prevD = D; }
  if (hit && D < 1.) { float a = D, b = prevD; for (int j = 0; j < 5; j++) { float m = .5 * (a + b); if (dep(uvAt(s, m)) >= m) a = m; else b = m; } D = a; uv = uvAt(s, D); }
  vec3 c = texture(uImg, clamp(uv, 0., 1.)).rgb;
  float y = mix(dot(c, vec3(.2126, .7152, .0722)), max(c.r, max(c.g, c.b)), uSat);
  y = clamp((y - uLv.x) / (uLv.y - uLv.x), 0., 1.); y = pow(y, uLv.z);
  y = mix(y, y * y * (3. - 2. * y), uLv.w);
  o = vec4(vec3(y), D) * uW;
}`;
  // the frame: the focus (a gather over a golden-angle disc, by the disparity), the melt into white with the brand's
  // grid, the turquoise light (a streak on each move, a soft leak), a fine grain
  const FS_OUT = `#version 300 es
precision highp float;
uniform sampler2D uAcc;
uniform float uFocus, uAp, uMaxR, uF0, uF1, uFa, uE0, uE1, uSeed, uWhite, uGrid, uLeak;
uniform vec3 uStreak; uniform vec3 uBeam;
in vec2 vUv; out vec4 o;
vec4 A(vec2 p) { return texture(uAcc, p / vec2(1080., 1920.)); }
float hash(vec2 p) { p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
void main() {
  vec2 s = gl_FragCoord.xy; float yd = 1920. - s.y;
  vec4 c0 = A(s); vec3 col = c0.rgb;
  if (uAp > 0.) {
    float r = min(uMaxR, uAp * abs(c0.a - uFocus));
    if (r > .7) { vec3 acc = col; float wt = 1.;
      for (int i = 0; i < 36; i++) { float fi = float(i) + .5; float rr = sqrt(fi / 36.) * r; float th = fi * 2.39996323;
        vec4 t = A(s + rr * vec2(cos(th), sin(th))); float rt = min(uMaxR, uAp * abs(t.a - uFocus));
        float w = clamp(rt - rr + 1.5, .08, 1.); acc += t.rgb * w; wt += w; }
      col = acc / wt; }
  }
  // the turquoise light on the photo: a soft leak from the top left, and the streak of a move
  vec3 teal = vec3(.373, .831, .776);
  float leak = uLeak * exp(-dot(s - vec2(-120., 2050.), s - vec2(-120., 2050.)) / (2. * 700. * 700.));
  col = mix(col, col * vec3(.86, 1.02, 1.0) + teal * .10, leak);
  float u = (s.x * .5 + yd * .866) - uStreak.x; col += mix(teal, vec3(1.), .35) * uStreak.y * exp(-u * u / (uStreak.z * uStreak.z));
  float bu = (s.x * .766 - yd * .643) - uBeam.x; col += vec3(1., .99, .97) * uBeam.y * exp(-bu * bu / (uBeam.z * uBeam.z)) * smoothstep(1200., 300., yd);
  vec2 rv = (s / vec2(1080., 1920.) - vec2(.5, .62)) * vec2(1., 1.6);
  col *= 1. - .16 * smoothstep(.35, 1.05, length(rv));
  col += (hash(s + uSeed) - .5) * .035;
  // the veil under the words: white with a breath of turquoise at its top edge, the photo still showing through
  float m = smoothstep(uF0, uF1, yd) * uFa * (1. - .3 * smoothstep(1520., 1860., yd));
  vec3 veil = mix(vec3(.915, .968, .962), vec3(.982, .988, .986), smoothstep(uF0 + 120., uF1 + 220., yd));
  col = mix(col, veil, m);
  // the end: clean white rising from the bottom, with the brand's grid
  vec3 paper = vec3(.984, .988, .984);
  float gx = mod(s.x - 540., 54.), gy = mod(yd, 54.); float g = (gx < 1. || gy < 1.) ? 1. : 0.;
  paper = mix(paper, vec3(.078, .647, .588), .085 * g * uGrid);
  col = mix(col, paper, smoothstep(uE0, uE1, yd));
  col = mix(col, vec3(1.), uWhite);
  o = vec4(col, 1.);
}`;
  const FS_CLR = `#version 300 es
precision highp float; out vec4 o; void main() { o = vec4(0.); }`;

  V.tur = (ctx, p) => {
    const el = ctx.el, id = R.script.id;
    const root = h('div', null, null, el); root.style.cssText = 'position:absolute;left:0;top:0;width:1080px;height:1920px;overflow:hidden;background:#fbfcfb';
    const cv = h('canvas', null, null, root); cv.width = W; cv.height = H; cv.style.cssText = 'position:absolute;left:0;top:0;width:1080px;height:1920px';
    const ov = h('div', null, null, root); ov.style.cssText = 'position:absolute;left:0;top:0;width:1080px;height:1920px';
    const pre = h('div', null, null, el); pre.style.cssText = 'position:absolute;width:0;height:0;overflow:hidden';
    const load = (src) => { const im = h('img', null, null, pre); im.src = src; im.decoding = 'sync'; return im; };
    const PH = {};
    Object.entries(p.shots).forEach(([k, s]) => {
      const [w, hh] = s.size, [lo, mid, hi] = s.lv, m = clamp((mid - lo) / (hi - lo), 0.05, 0.95);
      PH[k] = { k, w, h: hh, lo, hi, gam: Math.log(0.64) / Math.log(m), sat: s.sat == null ? 0.5 : s.sat, s0: Math.max(W / w, 2 * Math.max(CY, PB - CY) / hh),
        im: load(R.ROOT + '/brand_asset/' + s.img + '.webp'), dm: load('../../scripts/' + id + '/depth/' + s.img + '.png') };
    });
    const B = (k) => fr(p.b0 + k * p.per);

    // ---- the cameras: { f: [x, y] (the photo point at the centre), z (zoom over cover), P: [x, y] (px of parallax per
    // unit of disparity away from the focal plane D0), dz (near grows more, > 0; far grows, < 0), off: [x, y] }
    const C = (f, z, o = {}) => Object.assign({ f, z, P: [0, 0], dz: 0, D0: 0.5, off: [0, 0] }, o);
    const shake = (t, t0, amp = 20, dur = 0.2) => { const u = t - t0; if (u < 0 || u > dur) return [0, 0]; const d = Math.pow(1 - u / dur, 2); return [amp * d * Math.sin(u * 2 * Math.PI * 19), amp * 0.6 * d * Math.sin(u * 2 * Math.PI * 15 + 1.3)]; };
    const L2 = (a, b, q) => [lerp(a[0], b[0], q), lerp(a[1], b[1], q)];
    // the hook: the petal, then the logo, then through it
    function camHook(t) {
      const q0 = clamp(t / B(-3)), r = ease(t, B(-3), 0.8);
      const c = C(L2(L2([0.6, 0.79], [0.585, 0.785], q0), [0.4, 0.47], r), lerp(2.25 + 0.06 * q0, 1.12, r), { D0: lerp(0.74, 0.05, r), P: [-12 * q0 * (1 - r), 150 * r] });
      if (t > B(-1)) { const q = clamp((t - B(-1)) / (B(0) - B(-1))), e = Math.pow(q, 2.4);
        c.z *= Math.exp(3.9 * e); c.f = L2(c.f, [0.322, 0.395], Math.pow(q, 0.8)); c.dz = 1.4 * e; }
      return c;
    }
    function camRec(t) {
      const u = t - B(0), r = ease(t, B(2), 0.75);
      const c = C(L2([0.38, 0.45], [0.31, 0.47], r), 1.06 * (1 + 0.34 * (1 - out5(u / 0.5))) * lerp(1, 1.1, r), { D0: 0.75, P: [-95 * r, -18 * r] });
      const [sx, sy] = shake(t, B(0), 28, 0.24); c.off = [sx, sy];
      if (t > B(4) - 0.1) c.off[0] -= W * 1.1 * Math.pow((t - (B(4) - 0.1)) / 0.1, 2);
      return c;
    }
    function camChairs(t) {
      const u = t - B(4), r = ease(t, B(6), 0.9);
      const c = C([0.52, 0.47], 1.05, { D0: 0.42, dz: -0.95 * r });
      c.off = [W * 1.1 * (1 - out5(u / 0.3)), 0];
      return c;
    }
    function camRoom(t) {
      const u = t - B(8), a = 1 - out5(u / 0.55), r = ease(t, B(10), 0.75);
      const c = C(L2([0.5, 0.5], [0.5, 0.46], r), 1.08 * (1 + 0.3 * a) * lerp(1, 1.1, r), { D0: 0.1, dz: 0.45 * a + 0.35 * r });
      return c;
    }
    function camLight(t) {
      const u = t - B(12), q = smooth(u / (B(16) - B(12)));
      const c = C([0.43, 0.5], 1.06 + 0.035 * q, { D0: 0.57, P: [-12 * q, 0] });
      if (t > B(16) - 0.3) { const k = clamp((t - (B(16) - 0.3)) / 0.3); c.z *= 1 - 0.05 * k * k; }
      return c;
    }
    const MON = [['m1', [0.5, 0.5], 1.05, 0.52, 1], ['m2', [0.5, 0.52], 1.1, 0.6, -1], ['m3', [0.48, 0.45], 1.08, 0.59, 1], ['m4', [0.42, 0.5], 1.05, 0.7, -1]];
    function camMon(t, i) {
      const [, f, zb, d0, dir] = MON[i], t0 = B(16 + i), u = t - t0;
      const c = C(f, zb * (1 + 0.24 * (1 - out5(u / 0.32))), { D0: d0, P: [dir * 70 * out5(u / 0.42), 0] });
      const [sx, sy] = shake(t, t0, i ? 16 : 28, i ? 0.16 : 0.24); c.off = [sx, sy];
      const left = B(17 + i) - t; if (left < 0.07) c.z *= 1 + 0.22 * Math.pow(1 - left / 0.07, 2);
      return c;
    }
    function camVials(t) {
      const u = t - B(20), r = ease(t, B(22), 0.85);
      const c = C(L2([0.42, 0.47], [0.5, 0.46], r), 1.08 * (1 + 0.22 * (1 - out5(u / 0.32))), { D0: 0.37, P: [-115 * r, 0] });
      const [sx, sy] = shake(t, B(20), 16, 0.16); c.off = [sx, sy];
      if (t > B(24)) c.z *= 1 + 0.03 * smooth((t - B(24)) / 1.5);
      return c;
    }
    // the camera never shows a photo's edge: the look-at point is kept inside the photo by what the lens sees (with
    // the parallax and the depth scaling at their worst)
    function keep(key, c) {
      const ph = PH[key], S = ph.s0 * c.z;
      const kmin = Math.max(0.3, Math.min(1 + c.dz * (0 - c.D0), 1 + c.dz * (1 - c.D0), 1));
      const px = (Math.abs(c.P[0]) + Math.abs(c.off[0]) * 0 + 12) / (ph.w * S), py = (Math.abs(c.P[1]) + 12) / (ph.h * S);
      const hx = 540 / (ph.w * S * kmin) + px, up = CY / (ph.h * S * kmin) + py, dn = (PB - CY) / (ph.h * S * kmin) + py;
      if (2 * hx < 1) c.f[0] = clamp(c.f[0], hx, 1 - hx); else c.f[0] = 0.5;
      if (up + dn < 1) c.f[1] = clamp(c.f[1], up, 1 - dn); else c.f[1] = up / (up + dn);
      return c;
    }
    // what is on screen at t: [[photo, camera, weight], …]
    function scene(t) { return scene0(t).map(([k, c, w]) => [k, keep(k, c), w]); }
    function scene0(t) {
      if (t < B(0)) return [['hook', camHook(t), 1]];
      if (t < B(4)) return [['rec', camRec(t), 1]];
      if (t < B(8)) return [['chairs', camChairs(t), 1]];
      if (t < B(12)) return [['room', camRoom(t), 1]];
      if (t < B(16)) { const a = smooth((t - B(12)) / 0.36); return a < 1 ? [['room', camRoom(t), 1 - a], ['light', camLight(t), a]] : [['light', camLight(t), 1]]; }
      for (let i = 0; i < 4; i++) if (t < B(17 + i)) return [[MON[i][0], camMon(t, i), 1]];
      return [['vials', camVials(t), 1]];
    }
    // the focus (only where it tells something: the petal, then the logo; a little on the room and the vials)
    function focus(t) {
      if (t < B(0)) { const r = smooth((t - B(-3) + 0.05) / 0.62); return { f: lerp(0.74, 0.06, r), ap: lerp(72, 60, r), max: 26 }; }
      if (t >= B(8) && t < B(12)) return { f: 0.72, ap: 10, max: 7 };
      if (t >= B(20)) return { f: 0.5, ap: 24, max: 12 };
      return { f: 0.5, ap: 0, max: 0 };
    }
    // the moves (a streak of light on each, 4 frames)
    const MOVES = [B(-3), B(0), B(2), B(4), B(6), B(8), B(10), B(16), B(17), B(18), B(19), B(20), B(22)];
    // motion blur: sub-frames where the camera is fast
    const FAST = [[B(-1) + 0.15, B(0) + 0.32], [B(-3), B(-3) + 0.3], [B(2), B(2) + 0.35], [B(4) - 0.12, B(4) + 0.3], [B(6), B(6) + 0.4], [B(8), B(8) + 0.3], [B(10), B(10) + 0.35], [B(16) - 0.1, B(20) + 0.34], [B(22), B(22) + 0.4]];
    const HARD = [B(8), B(16), B(17), B(18), B(19), B(20)];
    const kAt = (t) => (FAST.some(([a, b]) => t >= a && t <= b) ? 7 : 1);

    // ---- WebGL
    let G = null;
    function initGL() {
      const gl = cv.getContext('webgl2', { preserveDrawingBuffer: true, antialias: false, alpha: false, depth: false, stencil: false });
      if (!gl) throw new Error('WebGL2 is not available');
      gl.getExtension('EXT_color_buffer_float'); gl.getExtension('OES_texture_float_linear');
      const sh = (type, src) => { const s = gl.createShader(type); gl.shaderSource(s, src); gl.compileShader(s); if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error('shader: ' + gl.getShaderInfoLog(s)); return s; };
      const prog = (fs) => { const pr = gl.createProgram(); gl.attachShader(pr, sh(gl.VERTEX_SHADER, VS)); gl.attachShader(pr, sh(gl.FRAGMENT_SHADER, fs)); gl.bindAttribLocation(pr, 0, 'aPos'); gl.linkProgram(pr);
        if (!gl.getProgramParameter(pr, gl.LINK_STATUS)) throw new Error('link: ' + gl.getProgramInfoLog(pr)); const u = {}; const n = gl.getProgramParameter(pr, gl.ACTIVE_UNIFORMS); for (let i = 0; i < n; i++) { const inf = gl.getActiveUniform(pr, i); u[inf.name] = gl.getUniformLocation(pr, inf.name); } return { p: pr, u }; };
      const vb = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, vb); gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
      gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
      const acc = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D, acc); gl.texStorage2D(gl.TEXTURE_2D, 1, gl.RGBA16F, W, H);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      const fb = gl.createFramebuffer(); gl.bindFramebuffer(gl.FRAMEBUFFER, fb); gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, acc, 0);
      if (gl.checkFramebufferStatus(gl.FRAMEBUFFER) !== gl.FRAMEBUFFER_COMPLETE) throw new Error('framebuffer');
      const tex = (src, mip) => { const t = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D, t); gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, src); if (mip) gl.generateMipmap(gl.TEXTURE_2D);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, mip ? gl.LINEAR_MIPMAP_LINEAR : gl.LINEAR); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE); return t; };
      // the depth, slightly softened (its edges would tear otherwise): drawn through a small blur once
      const soft = (im) => { const c = document.createElement('canvas'); c.width = im.naturalWidth; c.height = im.naturalHeight; const g = c.getContext('2d'); g.filter = 'blur(2px)'; g.drawImage(im, 0, 0); return c; };
      Object.values(PH).forEach((ph) => { ph.ti = tex(ph.im, true); ph.td = tex(soft(ph.dm), false); });
      G = { gl, fb, acc, P: { photo: prog(FS_PHOTO), out: prog(FS_OUT), clr: prog(FS_CLR) } };
    }
    function photoPass(key, c, w) {
      const { gl } = G, pr = G.P.photo, ph = PH[key];
      gl.useProgram(pr.p);
      gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, ph.ti); gl.uniform1i(pr.u.uImg, 0);
      gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, ph.td); gl.uniform1i(pr.u.uDep, 1);
      gl.uniform2f(pr.u.uSize, ph.w, ph.h); gl.uniform2f(pr.u.uF, c.f[0], c.f[1]); gl.uniform2f(pr.u.uC, CX, CY); gl.uniform2f(pr.u.uOff, c.off[0], c.off[1]);
      gl.uniform2f(pr.u.uP, c.P[0], c.P[1]); gl.uniform1f(pr.u.uS, ph.s0 * c.z); gl.uniform1f(pr.u.uDz, c.dz); gl.uniform1f(pr.u.uD0, c.D0); gl.uniform1f(pr.u.uW, w);
      gl.uniform4f(pr.u.uLv, ph.lo, ph.hi, ph.gam, 0.25); gl.uniform1f(pr.u.uSat, ph.sat);
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    }
    // the end: the white rises over the photo
    const tEnd = B(24);
    const fade = (t) => { const e = out3((t - tEnd + 0.03) / 0.42); return t < tEnd - 0.04 ? [5000, 5300] : [lerp(1940, -420, e), lerp(2240, -120, e)]; };
    // the veil is there for the words: light where no words are (the reception, the end), full under a step
    const WORDS = [[0, B(-1) + 0.12], [B(4), B(8)], [B(8), B(12)], [B(12), B(16)], [B(16), B(24)]];
    const veilAt = (t) => { let v = 0.3; for (const [a, z] of WORDS) v = Math.max(v, 0.3 + 0.52 * smooth((t - a + 0.12) / 0.25) * (1 - smooth((t - z + 0.05) / 0.25))); return v; };
    function render(t) {
      if (!G) initGL();
      const { gl } = G;
      gl.bindFramebuffer(gl.FRAMEBUFFER, G.fb); gl.viewport(0, 0, W, H); gl.disable(gl.BLEND); gl.clearColor(0, 0, 0, 0); gl.clear(gl.COLOR_BUFFER_BIT);
      gl.enable(gl.BLEND); gl.blendFunc(gl.ONE, gl.ONE);
      const K = kAt(t), shut = 0.55 / 30;
      for (let k = 0; k < K; k++) { let ts = K > 1 ? t + ((k + 0.5) / K - 0.5) * shut : t;
        for (const cb of HARD) { if (t >= cb && ts < cb) ts = cb; else if (t < cb && ts >= cb) ts = cb - 0.0005; } // (a hard cut is never blended with the shot before it)
        scene(ts).forEach(([key, c, w]) => { if (w > 0.001) photoPass(key, c, w / K); }); }
      gl.disable(gl.BLEND);
      gl.bindFramebuffer(gl.FRAMEBUFFER, null); gl.viewport(0, 0, W, H);
      const pr = G.P.out; gl.useProgram(pr.p); gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, G.acc); gl.uniform1i(pr.u.uAcc, 0);
      const F = focus(t); gl.uniform1f(pr.u.uFocus, F.f); gl.uniform1f(pr.u.uAp, F.ap); gl.uniform1f(pr.u.uMaxR, F.max);
      const [e0, e1] = fade(t); gl.uniform1f(pr.u.uE0, e0); gl.uniform1f(pr.u.uE1, e1); gl.uniform1f(pr.u.uF0, 1010); gl.uniform1f(pr.u.uF1, 1250); gl.uniform1f(pr.u.uFa, veilAt(t));
      gl.uniform1f(pr.u.uSeed, Math.round(t * 30) * 7.13 % 997); gl.uniform1f(pr.u.uGrid, 1);
      // white: the flight through the logo, then the light it lands in
      let white = 0;
      if (t < B(0) && t > B(-1)) white = Math.pow(smooth((t - B(-1) - 0.2) / (B(0) - B(-1) - 0.2)), 1.6);
      if (t >= B(0)) white = Math.exp(-(t - B(0)) / 0.085) * (t - B(0) < 0.5 ? 1 : 0);
      gl.uniform1f(pr.u.uWhite, clamp(white));
      // the streak of a move: a diagonal band of turquoise light across the frame in four frames
      let st = [0, 0, 160];
      for (const m of MOVES) { const u = t - m + 0.02; if (u >= 0 && u < 0.16) { const q = u / 0.16; st = [-300 + 2600 * q, 0.2 * Math.sin(Math.PI * q), 150]; } }
      gl.uniform3f(pr.u.uStreak, st[0], st[1], st[2]);
      // the window light in the pause: one soft band that slides slowly over the bed
      let bm = [0, 0, 200];
      if (t > B(12) - 0.1 && t < B(16) + 0.1) { const q = (t - B(12)) / (B(16) - B(12)); bm = [lerp(-120, 260, q), 0.07 * smooth((t - B(12)) / 0.5) * (1 - smooth((t - B(16) + 0.25) / 0.25)), 210]; }
      gl.uniform3f(pr.u.uBeam, bm[0], bm[1], bm[2]);
      gl.uniform1f(pr.u.uLeak, 0.55 + 0.15 * Math.sin(t * 1.1));
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    }

    // ---- the words: few and large, in the white under the photo
    const FONT = "'Inter Variable',system-ui,sans-serif", SERIF = "'Fraunces Variable',Georgia,serif";
    const txt = (css, html) => { const d = h('div', 'tx', html, ov); d.style.cssText += ';' + css; return d; };
    const vis = (e, o) => { e.style.opacity = clamp(o).toFixed(3); e.style.visibility = o < 0.004 ? 'hidden' : ''; };
    const wsp = (s) => s.split(' ').map((w) => '<span style="display:inline-block">' + esc(w) + '</span>').join(' ');
    const NUM = 'font:300 96px/1 ' + FONT + ';letter-spacing:-.03em;color:' + TEAL;
    const LA = 'font:800 104px/1.06 ' + FONT + ';letter-spacing:-.04em;color:' + INK + ';white-space:nowrap';
    const LB = 'font:italic 400 76px/1.04 ' + SERIF + ';letter-spacing:-.02em;color:' + DEEP + ';white-space:nowrap';
    // a block: [number?], line a, line b; every word its own entrance
    function block(n, a, b, o = {}) {
      const g = h('div', null, null, ov); g.style.cssText = 'position:absolute;left:0;top:0;width:1080px;height:1920px';
      const mk = (css, html, top) => { const d = h('div', 'tx', html, g); d.style.cssText += ';left:160px;width:760px;text-align:center;top:' + top + 'px;' + css; return d; };
      const num = n ? mk(NUM, esc(n), 1146) : null;
      const la = mk(o.la || LA, o.raw ? a : wsp(a), o.ya || 1246);
      const lb = mk(o.lb || LB, wsp(b), o.yb || 1364);
      return { g, num, la, lb, words: [...la.querySelectorAll('span'), ...lb.querySelectorAll('span')] };
    }
    const hk = block(null, '<span style="display:inline-block;color:' + TEAL + '">POV:</span> ' + wsp(p.hook[1]), p.hook[2], { raw: true, ya: 1236, yb: 1352, lb: 'font:italic 400 96px/1.04 ' + SERIF + ';letter-spacing:-.02em;color:' + DEEP + ';white-space:nowrap' });
    const steps = p.steps.map((s) => block(s.n, s.a, s.b));
    const pz = block(null, p.pause[0], p.pause[1], { la: 'font:800 200px/1 ' + FONT + ';letter-spacing:-.05em;color:' + INK + ';white-space:nowrap', ya: 1128, yb: 1346 });
    // the fit: a line wider than the column gets smaller (never under 64 px)
    const fitLine = (d) => { let f = parseFloat(getComputedStyle(d).fontSize); const span = () => { const r = document.createRange(); r.selectNodeContents(d); return r.getBoundingClientRect().width; }; while (f > 66 && span() > 752) { f -= 2; d.style.fontSize = f + 'px'; } };
    // the timing of each block's words: [word index → reel second]
    const WT = {
      hk: [0.03, B(-5), B(-5) + 0.12, B(-4), B(-3) + 0.04],
      s0: [B(4) + 0.06, B(5), B(5) + 0.1], s1: [B(8) + 0.08, B(9)], s2: [B(16) + 0.04, B(16) + 0.16, B(17), B(17) + 0.12, B(18)],
      pz: [B(12) + 0.06, B(13), B(13) + 0.12],
    };
    const SPAN = { hk: [0, B(-1) + 0.12], s0: [B(4), B(8) - 0.02], s1: [B(8), B(12) - 0.02], pz: [B(12), B(16) - 0.02], s2: [B(16), tEnd] };
    function blockAt(t, bl, key) {
      const [a, z] = SPAN[key];
      if (t < a - 0.01 || t > z) { vis(bl.g, 0); return; }
      vis(bl.g, 1);
      const go = clamp((t - z + 0.2) / 0.2); // the exit: up and into blur, gone by the next cut
      const ws = WT[key];
      const ghost = key === 'hk' ? 0.2 : 0;
      bl.words.forEach((s, i) => { const q0 = smooth((t - ws[Math.min(i, ws.length - 1)]) / 0.3), q = ghost + (1 - ghost) * q0;
        if (ghost) { s.style.opacity = (q * (1 - go)).toFixed(3); s.style.filter = go > 0 ? 'blur(' + (go * 12).toFixed(1) + 'px)' : ''; s.style.transform = 'scale(' + (1 + 0.06 * Math.sin(Math.PI * clamp(q0)) * (q0 < 1 ? 1 : 0)).toFixed(4) + ')'; return; } s.style.opacity = (q * (1 - go)).toFixed(3); s.style.filter = q < 0.99 || go > 0 ? 'blur(' + ((1 - q) * 14 + go * 12).toFixed(1) + 'px)' : ''; s.style.transform = 'translateY(' + ((1 - out3(q)) * 22 - go * 26).toFixed(1) + 'px)'; });
      if (bl.num) { const q = smooth((t - a - 0.02) / 0.25); vis(bl.num, q * (1 - go)); bl.num.style.transform = 'translateY(' + ((1 - out3(q)) * 12 - go * 20).toFixed(1) + 'px)'; }
    }
    // Nuki, once, small, with the file (the plan): at the photo's lower left
    const nk = h('div', null, null, ov); nk.style.cssText = 'position:absolute;left:60px;top:1018px;width:196px;height:222px;transform-origin:50% 100%';
    const nki = h('img', null, null, nk); nki.src = R.ROOT + '/brand_asset/' + p.nukiImg; nki.style.cssText = 'width:100%;height:100%;object-fit:contain;filter:drop-shadow(0 12px 14px rgba(4,40,36,.18))';
    const tN = B(20) + 0.08;
    // the end: the logo (black on white), the cities, the turquoise line
    const endG = h('div', null, null, ov); endG.style.cssText = 'position:absolute;left:0;top:0;width:1080px;height:1920px';
    const logo = h('div', null, null, endG); logo.style.cssText = 'position:absolute;left:0;top:0;width:1080px;height:1920px';
    const LM = 120, LWH = 54, LWW = Math.round(LWH * 5583 / 426), LX = Math.round((W - (LM + 28 + LWW)) / 2), LY = 812;
    const mark = h('i', null, null, logo); mark.style.cssText = 'position:absolute;left:' + LX + 'px;top:' + LY + 'px;width:' + LM + 'px;height:' + LM + 'px;background:url(' + R.ROOT + '/brand_asset/logo-mark.png) center/contain no-repeat';
    const wm = h('i', null, null, logo); wm.style.cssText = 'position:absolute;left:' + (LX + LM + 28) + 'px;top:' + (LY + (LM - LWH) / 2) + 'px;width:' + LWW + 'px;height:' + LWH + 'px;background:#000;-webkit-mask:url(' + R.ROOT + '/brand_asset/wordmark-com.png) center/contain no-repeat;mask:url(' + R.ROOT + '/brand_asset/wordmark-com.png) center/contain no-repeat';
    load(R.ROOT + '/brand_asset/logo-mark.png'); load(R.ROOT + '/brand_asset/wordmark-com.png');
    const city = txt('left:160px;width:760px;top:' + (LY + LM + 50) + 'px;text-align:center;font:500 50px/1.1 ' + FONT + ';letter-spacing:-.01em;color:' + INK + ';white-space:nowrap',
      esc(p.cities[0]) + '<i class="pd" style="display:inline-block;width:20px;height:20px;border-radius:50%;margin:0 26px 8px;vertical-align:middle;background:radial-gradient(circle at 38% 34%,#fdeee6 0%,#efbfad 30%,#dc9a85 75%,#bf7a64 100%);box-shadow:0 0 14px 4px rgba(226,162,141,.45)"></i>' + esc(p.cities[1])); endG.appendChild(city);
    const pd = city.querySelector('.pd');
    const line = h('i', null, null, endG); line.style.cssText = 'position:absolute;left:380px;width:320px;top:' + (LY + LM + 138) + 'px;height:4px;border-radius:2px;background:' + TEAL + ';transform-origin:50% 50%';
    const tLogo = tEnd + 0.1, tCity = B(25), tLine = B(26);
    let fitted = false;
    function dom(t) {
      if (!fitted && el.offsetParent) { [hk, ...steps, pz].forEach((bl) => { fitLine(bl.la); fitLine(bl.lb); }); fitted = true; } // (measured once the shot is shown)
      blockAt(t, hk, 'hk'); steps.forEach((bl, i) => blockAt(t, bl, 's' + i)); blockAt(t, pz, 'pz');
      // the hook flies away with the camera, a little bigger
      if (t > B(-1)) hk.g.style.transform = 'scale(' + (1 + 0.5 * Math.pow(clamp((t - B(-1)) / 0.5), 3)).toFixed(4) + ')'; else hk.g.style.transform = '';
      hk.g.style.transformOrigin = '540px 1420px';
      // Nuki: up from the white with a small bounce, a nod, gone with the white
      const nq = clamp((t - tN) / 0.42), nOut = smooth((t - tEnd + 0.05) / 0.2);
      if (t < tN - 0.01 || nOut >= 1) vis(nk, 0); else {
        vis(nk, Math.min(1, nq * 4) * (1 - nOut)); const e = R.E.back(nq);
        nk.style.transform = 'translateY(' + ((1 - e) * 120).toFixed(1) + 'px) scale(' + (0.9 + 0.1 * Math.min(1, e)).toFixed(3) + ') rotate(' + (2.5 * Math.sin(Math.max(0, t - tN - 0.4) * 2.6) * smooth((t - tN - 0.4) / 0.3)).toFixed(2) + 'deg)';
      }
      // the end
      vis(endG, t >= tEnd ? 1 : 0);
      if (t >= tEnd) {
        const tl = t - tLogo, lg = smooth(tl / 0.26); logo.style.opacity = lg.toFixed(3); logo.style.visibility = lg < 0.004 ? 'hidden' : '';
        logo.style.filter = tl < 0.26 ? 'blur(' + ((1 - lg) * 10).toFixed(1) + 'px)' : ''; logo.style.transform = 'translateY(' + ((1 - out5(tl / 0.45)) * 34).toFixed(1) + 'px)';
        const cq = smooth((t - tCity) / 0.32); vis(city, cq); city.style.transform = 'translateY(' + ((1 - out3(cq)) * 16).toFixed(1) + 'px)';
        const dq = clamp((t - tCity - 0.12) / 0.12); pd.style.transform = 'scale(' + (dq < 1 ? dq * 1.4 : 1 + 0.4 * Math.exp(-(t - tCity - 0.24) * 12)).toFixed(3) + ')';
        const lq = R.E.inout(clamp((t - tLine) / 0.5)); line.style.transform = 'scaleX(' + lq.toFixed(4) + ')'; line.style.opacity = lq > 0.002 ? '1' : '0';
      } else { logo.style.opacity = '0'; vis(city, 0); line.style.opacity = '0'; }
    }
    function draw(t) { render(t); dom(t); }
    ctx.tick((t) => draw(t));
    ctx.shot.after = () => draw(R.t || 0);

    // ---- sound and events, to the frame: each move a whoosh peaking on its start and the deep hit two frames in;
    // a soft tick on every word; the pause gets light and air, no hit
    const ev = (t, kind) => R.event(t, kind);
    const word = (t, g = 0.45) => { ctx.sfx(fr(t), 'tick_soft', g); ev(fr(t), 'in'); };
    ctx.sfx(0.02, 'impact', 0.12, { prio: 4 }); ev(0, 'write');
    WT.hk.forEach((t, i) => (i === 2 ? null : word(t, 0.5)));
    ctx.sfx(B(-3), 'whoosh_cut', 0.35, { prio: 5, peak: true }); ctx.sfx(B(-3) + 0.07, 'pulse', 0.45); ev(B(-3), 'cut'); ev(B(-3), 'glow');
    ctx.sfx(B(-1) + 0.1, 'riser_soft', 0.55);
    ctx.sfx(B(0), 'whoosh_through', 0.8, { prio: 5, peak: true }); ctx.sfx(B(0) + 0.072, 'hit_deep', 1, { prio: 5 }); ctx.sfx(B(0) + 0.14, 'shimmer_soft', 0.6, { prio: 4 }); ev(B(0), 'cut'); ev(B(0), 'reveal'); ev(B(0), 'slam');
    ctx.sfx(B(2), 'whoosh_cut', 0.4, { prio: 5, peak: true }); ctx.sfx(B(2) + 0.072, 'hit_deep', 0.4, { prio: 5 }); ev(B(2), 'cut');
    ctx.sfx(B(4), 'whoosh_cut', 0.75, { prio: 5, peak: true }); ctx.sfx(B(4) + 0.072, 'hit_deep', 0.5, { prio: 5 }); ev(B(4), 'cut'); ctx.sfx(B(4) + 0.03, 'tap', 0.45); ev(B(4), 'slam');
    WT.s0.forEach((t) => word(t));
    ctx.sfx(B(6), 'whoosh_through', 0.5, { prio: 5, peak: true }); ctx.sfx(B(6) + 0.072, 'pulse', 0.5); ev(B(6), 'cut');
    ctx.sfx(B(8), 'whoosh_through', 0.7, { prio: 5, peak: true }); ctx.sfx(B(8) + 0.072, 'hit_deep', 0.6, { prio: 5 }); ev(B(8), 'cut'); ctx.sfx(B(8) + 0.04, 'tap', 0.4);
    WT.s1.forEach((t) => word(t));
    ctx.sfx(B(10), 'whoosh_cut', 0.4, { prio: 5, peak: true }); ctx.sfx(B(10) + 0.072, 'hit_deep', 0.4, { prio: 5 }); ev(B(10), 'cut');
    ctx.sfx(B(12), 'shimmer_soft', 0.55, { prio: 4 }); ev(B(12), 'cut'); ev(B(12) + 0.4, 'glow');
    WT.pz.forEach((t, i) => (i === 1 ? null : word(t, 0.4)));
    ctx.sfx(B(16) - 0.02, 'suck_in', 0.6, { prio: 5, peak: true }); ctx.sfx(B(16) + 0.072, 'hit_deep', 1, { prio: 5 }); ev(B(16), 'cut'); ev(B(16), 'slam');
    for (let i = 1; i < 4; i++) { ctx.sfx(B(16 + i), 'whoosh_cut', 0.55, { prio: 5, peak: true }); ctx.sfx(B(16 + i) + 0.072, 'hit_deep', 0.35, { prio: 5 }); ev(B(16 + i), 'cut'); }
    WT.s2.forEach((t, i) => (i === 1 || i === 3 ? null : word(t)));
    ctx.sfx(B(20), 'whoosh_cut', 0.6, { prio: 5, peak: true }); ctx.sfx(B(20) + 0.072, 'hit_deep', 0.45, { prio: 5 }); ev(B(20), 'cut');
    ctx.sfx(tN + 0.12, 'tap', 0.55); ev(tN, 'pop');
    ctx.sfx(B(22), 'whoosh_cut', 0.4, { prio: 5, peak: true }); ctx.sfx(B(22) + 0.072, 'pulse', 0.4); ev(B(22), 'cut');
    ctx.sfx(tEnd, 'swoosh_end', 0.7, { prio: 5, peak: true }); ev(tEnd, 'cut');
    ctx.sfx(tLogo, 'tap', 0.55); ev(tLogo, 'slam'); ctx.sfx(tLogo + 0.08, 'dot', 0.5); ctx.sfx(tLogo + 0.22, 'shimmer_soft', 0.4); ev(tLogo + 0.22, 'glow');
    ctx.sfx(tCity, 'tick_soft', 0.45); ev(tCity, 'in'); ctx.sfx(tCity + 0.13, 'dot', 0.45);
    ctx.sfx(tLine, 'tick_soft', 0.35); ev(tLine, 'in');
    ctx.focus(logo);
    R.tur = { B, scene, focus };
  };
})();
