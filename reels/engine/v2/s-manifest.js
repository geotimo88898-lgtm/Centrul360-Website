// Centrul360 reels v2: „Nu promitem. Îți arătăm.” (15.11): the site's own headline as a typographic manifesto that
// dives into a 3D corridor of real results. One continuous camera move, no cuts:
//   white, a rose gold light-dot writes a tiny line → the big type lands on the music's drop → the camera dives through
//   the "o" of „promitem” into a corridor whose walls are real before/after cards from the catalog (each with its label,
//   exactly as the catalog states) → it speeds up, then brakes on one case and resolves it (before, then after) → the
//   case opens like a hatch and „Îți arătăm.” waits behind it → through the type to the real logo, black on white.
// The 3D world is drawn in WebGL: real perspective, a glossy floor with reflections and the brand's grid, fog to white,
// and true motion blur and depth of field (an accumulation buffer: every frame is the average of K sub-frames, each at
// its own moment of the shutter and from its own point of the lens). The photos keep their true colours (no tint); a
// card is only ever fogged by distance or blurred by speed. Small text is DOM (crisp), pinned to the 3D camera.
//   visual: { type: "manifest", line, big: [l1, l2], show: [l1, l2], calm, google, cities: [a, b], hero: {img, title, meta},
//             consent, consentOne, cases: [{img, title, meta}] }
(function () {
  'use strict';
  const R = window.R2, V = R.V, { clamp, E, h, esc } = R;
  const W = 1080, H = 1920, FOC = 1500; // the focal length in px: an object 1500 units away is drawn 1:1
  const INK = '#0b0b0d', DEEP = '#0b7f74', TEAL = '#14a596';
  const smooth = (p) => { p = clamp(p); return p * p * (3 - 2 * p); };

  // ------------------------------------------------------------------ mat4 (column-major)
  const M4 = {
    id: () => new Float32Array([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]),
    mul: (a, b) => { const o = new Float32Array(16); for (let c = 0; c < 4; c++) for (let r = 0; r < 4; r++) o[c * 4 + r] = a[r] * b[c * 4] + a[4 + r] * b[c * 4 + 1] + a[8 + r] * b[c * 4 + 2] + a[12 + r] * b[c * 4 + 3]; return o; },
    T: (x, y, z) => { const m = M4.id(); m[12] = x; m[13] = y; m[14] = z; return m; },
    S: (x, y, z) => { const m = M4.id(); m[0] = x; m[5] = y; m[10] = z == null ? 1 : z; return m; },
    RX: (a) => { const c = Math.cos(a), s = Math.sin(a), m = M4.id(); m[5] = c; m[6] = s; m[9] = -s; m[10] = c; return m; },
    RY: (a) => { const c = Math.cos(a), s = Math.sin(a), m = M4.id(); m[0] = c; m[2] = -s; m[8] = s; m[10] = c; return m; },
    RZ: (a) => { const c = Math.cos(a), s = Math.sin(a), m = M4.id(); m[0] = c; m[1] = s; m[4] = -s; m[5] = c; return m; },
    chain: (...ms) => ms.reduce((a, b) => M4.mul(a, b)),
    pt: (m, x, y, z) => [m[0] * x + m[4] * y + m[8] * z + m[12], m[1] * x + m[5] * y + m[9] * z + m[13], m[2] * x + m[6] * y + m[10] * z + m[14]],
  };
  R.M4 = M4;

  // ------------------------------------------------------------------ the WebGL renderer
  const VS = `#version 300 es
precision highp float;
in vec2 aPos;
uniform mat4 uM, uV;
uniform vec4 uProj;
uniform vec3 uLens;
uniform vec2 uJit;
out vec2 vUv; out float vDist; out vec3 vW; out float vD;
void main() {
  vec4 w = uM * vec4(aPos, 0., 1.);
  vec4 v = uV * w;
  float d = -v.z;
  v.xy -= uLens.xy * (1. - d * uLens.z);
  vW = w.xyz; vDist = length(v.xyz); vD = d;
  vUv = vec2(aPos.x + .5, .5 - aPos.y);
  gl_Position = vec4(uProj.x * v.x + uJit.x * d, uProj.y * v.y + uJit.y * d, uProj.z * v.z + uProj.w, d);
}`;
  const FS_QUAD = `#version 300 es
precision highp float;
uniform sampler2D uTex;
uniform vec2 uSize;
uniform float uRad, uSoftPx, uAlpha, uShade, uMirror, uFade, uNear, uF, uVz;
uniform vec4 uTint;
uniform vec3 uFogC, uFogP, uDof, uGlowC;
uniform vec4 uSheen, uFrost, uFrostR;
in vec2 vUv; in float vDist; in vec3 vW; in float vD;
out vec4 o;
void main() {
  float d = max(vD, 1.);
  // the gap between two sub-frames here, in px: the lens (depth of field), the camera's own travel, the object's own move
  float sp = length(vec3(uDof.x * abs(1. / d - uDof.y), uDof.z, length(gl_FragCoord.xy - vec2(540., 960.)) * uVz / d));
  float bias = log2(max(1., sp));
  vec2 p = (vUv - .5) * uSize;
  vec2 q = abs(p) - (uSize * .5 - uRad);
  float sd = length(max(q, 0.)) + min(max(q.x, q.y), 0.) - uRad;
  float aa = max(fwidth(sd), max(uSoftPx, sp * .7) * d / uF);
  float mask = clamp(.5 - sd / aa, 0., 1.);
  vec4 c = texture(uTex, vUv, bias) * uTint;
  if (uFrost.z > 0.) {
    float inr = step(uFrostR.x, vUv.x) * step(vUv.x, uFrostR.z) * step(vUv.y, uFrostR.w);
    float fm = smoothstep(uFrost.x - uFrost.y, uFrost.x + uFrost.y, vUv.y) * uFrost.z * inr;
    vec4 b = (texture(uTex, vUv, 5.) + texture(uTex, vUv + vec2(.014, .009), 5.6) + texture(uTex, vUv - vec2(.014, .009), 5.6) + texture(uTex, vUv + vec2(-.011, .013), 5.6) + texture(uTex, vUv + vec2(.011, -.013), 5.6)) / 5.;
    b.rgb = mix(b.rgb, vec3(1.), .52);
    c = mix(c, b, fm);
    float dy = (vUv.y - uFrost.x) * uSize.y;
    c.rgb = mix(c.rgb, uGlowC, clamp(exp(-dy * dy / 14.) * uFrost.w, 0., 1.) * inr);
    c.rgb = mix(c.rgb, vec3(1.), clamp(exp(-dy * dy / 2600.) * uFrost.w * .4, 0., 1.) * inr);
  }
  c.rgb *= uShade;
  float sh = exp(-pow((vUv.x + vUv.y * .5 - uSheen.x) / max(uSheen.y, 1e-3), 2.)) * uSheen.z;
  c.rgb += vec3(sh) * c.a;
  float fog = (1. - exp(-max(0., vDist - uFogP.x) * uFogP.y)) * uFogP.z;
  c.rgb = mix(c.rgb, uFogC * c.a, fog);
  float a = mask * uAlpha;
  if (uMirror > 0.) a *= uMirror * pow(clamp(vUv.y, 0., 1.), 1.7) * (1. - fog);
  if (uFade > 0.) a *= (1. - fog);
  if (uNear > 0.) a *= smoothstep(uNear * .25, uNear, vDist);
  o = c * a;
}`;
  const FS_FLOOR = `#version 300 es
precision highp float;
uniform float uCell, uGridA, uVz;
uniform vec3 uGridC, uFogC, uFogP;
in vec2 vUv; in float vDist; in vec3 vW; in float vD;
out vec4 o;
void main() {
  vec2 g = vW.xz / uCell;
  vec2 fw = max(fwidth(g), vec2(1e-6));
  vec2 fwm = fw + vec2(0., uVz / uCell); // the lines across the flight smear with the speed
  vec2 l = abs(fract(g - .5) - .5) / fwm;
  vec2 lv = (1. - clamp(l - .3, 0., 1.)) * (fw / fwm);
  float line = max(lv.x, lv.y);
  vec2 l4 = abs(fract(g / 4. - .5) - .5) / (fwm / 4.);
  vec2 lv4 = (1. - clamp(l4 - 1.1, 0., 1.)) * (fw / fwm);
  float bold = max(lv4.x, lv4.y);
  float fade = 1. - smoothstep(.18, .5, max(fw.x, fw.y));
  float fade4 = 1. - smoothstep(.18, .5, max(fw.x, fw.y) / 4.);
  float ln = max(line * fade * .55, bold * fade4);
  vec3 base = mix(vec3(.925, .957, .952), vec3(1.), exp(-pow(vW.x / 1050., 2.)));
  vec3 col = mix(base, uGridC, ln * uGridA);
  float fog = (1. - exp(-max(0., vDist - uFogP.x) * uFogP.y)) * uFogP.z;
  o = vec4(mix(col, uFogC, fog), 1.);
}`;
  const VS_POST = `#version 300 es
in vec2 aPos; out vec2 vUv;
void main() { vUv = aPos + .5; gl_Position = vec4(aPos * 2., 0., 1.); }`;
  const FS_ADD = `#version 300 es
precision highp float;
uniform sampler2D uTex; uniform float uWt;
in vec2 vUv; out vec4 o;
void main() { vec3 c = texture(uTex, vUv).rgb; o = vec4(pow(c, vec3(2.2)) * uWt, uWt); }`;
  const FS_OUT = `#version 300 es
precision highp float;
uniform sampler2D uTex; uniform float uDiff, uVig, uSeed;
in vec2 vUv; out vec4 o;
float hash(vec2 p) { p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
void main() {
  vec3 c = texture(uTex, vUv).rgb;
  if (uDiff > 0.) { vec3 b = (textureLod(uTex, vUv, 3.5).rgb + textureLod(uTex, vUv, 5.).rgb + textureLod(uTex, vUv, 6.5).rgb) / 3.; c += max(b - c, 0.) * uDiff; }
  c = pow(max(c, 0.), vec3(1. / 2.2));
  vec2 r = (vUv - .5) * vec2(1., 1.78);
  c *= mix(vec3(1.), vec3(.915, .962, .955), smoothstep(.55, 1.3, length(r)) * uVig);
  c += (hash(gl_FragCoord.xy + uSeed) - .5) / 255.;
  o = vec4(c, 1.);
}`;

  function G3(cv) {
    const gl = cv.getContext('webgl2', { preserveDrawingBuffer: true, antialias: false, alpha: false, depth: false, stencil: false });
    if (!gl) throw new Error('WebGL2 is not available');
    gl.getExtension('EXT_color_buffer_float'); gl.getExtension('OES_texture_float_linear');
    const an = gl.getExtension('EXT_texture_filter_anisotropic');
    const sh = (type, src) => { const s = gl.createShader(type); gl.shaderSource(s, src); gl.compileShader(s); if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error('shader: ' + gl.getShaderInfoLog(s)); return s; };
    const prog = (vs, fs) => { const p = gl.createProgram(); gl.attachShader(p, sh(gl.VERTEX_SHADER, vs)); gl.attachShader(p, sh(gl.FRAGMENT_SHADER, fs)); gl.bindAttribLocation(p, 0, 'aPos'); gl.linkProgram(p); if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error('link: ' + gl.getProgramInfoLog(p));
      const u = {}; const n = gl.getProgramParameter(p, gl.ACTIVE_UNIFORMS); for (let i = 0; i < n; i++) { const inf = gl.getActiveUniform(p, i); u[inf.name] = gl.getUniformLocation(p, inf.name); } return { p, u }; };
    const P = { quad: prog(VS, FS_QUAD), floor: prog(VS, FS_FLOOR), add: prog(VS_POST, FS_ADD), out: prog(VS_POST, FS_OUT) };
    const vb = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, vb); gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-0.5, -0.5, 0.5, -0.5, -0.5, 0.5, 0.5, 0.5]), gl.STATIC_DRAW);
    gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
    const target = (ifmt, mips) => { const t = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D, t); gl.texStorage2D(gl.TEXTURE_2D, mips ? 11 : 1, ifmt, W, H);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, mips ? gl.LINEAR_MIPMAP_LINEAR : gl.LINEAR); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      const f = gl.createFramebuffer(); gl.bindFramebuffer(gl.FRAMEBUFFER, f); gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, t, 0);
      if (gl.checkFramebufferStatus(gl.FRAMEBUFFER) !== gl.FRAMEBUFFER_COMPLETE) throw new Error('framebuffer ' + ifmt); return { t, f }; };
    const SC = target(gl.RGBA8, false), AC = target(gl.RGBA16F, true);
    const G = { gl };
    // a texture from a canvas or an image (premultiplied, mipmapped, anisotropic)
    G.tex = (src) => { const t = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D, t); gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, true);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, src); gl.generateMipmap(gl.TEXTURE_2D);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      if (an) gl.texParameterf(gl.TEXTURE_2D, an.TEXTURE_MAX_ANISOTROPY_EXT, 8); return t; };
    const view = (c) => M4.chain(M4.RZ(-(c.roll || 0)), M4.RX(-(c.pitch || 0)), M4.RY(-(c.yaw || 0)), M4.T(-c.x, -c.y, -c.z));
    G.view = view;
    // one sub-frame: the floor, then the quads far to near (the caller's order inside "under" is kept)
    function pass(S, lens, jit, K) {
      const c = S.cam, Vm = view(c), n = 8, f = 90000;
      const proj = [FOC / (W / 2), FOC / (H / 2), -(f + n) / (f - n), -2 * f * n / (f - n)];
      const fogP = [S.fog.start, S.fog.density, 1];
      const common = (pr) => { gl.useProgram(pr.p); gl.uniform1f(pr.u.uVz, S.vz || 0); gl.uniformMatrix4fv(pr.u.uV, false, Vm); gl.uniform4fv(pr.u.uProj, proj); gl.uniform3f(pr.u.uLens, lens[0], lens[1], 1 / c.focus); gl.uniform2f(pr.u.uJit, jit[0], jit[1]); gl.uniform3fv(pr.u.uFogC, S.fog.color); };
      gl.bindFramebuffer(gl.FRAMEBUFFER, SC.f); gl.viewport(0, 0, W, H); gl.clearColor(S.fog.color[0], S.fog.color[1], S.fog.color[2], 1); gl.clear(gl.COLOR_BUFFER_BIT);
      if (S.floor) { const F = S.floor, pr = P.floor; common(pr); gl.disable(gl.BLEND);
        gl.uniformMatrix4fv(pr.u.uM, false, M4.chain(M4.T(0, F.y, c.z - 30000), M4.RX(-Math.PI / 2), M4.S(16000, 64000)));
        gl.uniform1f(pr.u.uCell, F.cell); gl.uniform1f(pr.u.uGridA, F.gridA); gl.uniform3fv(pr.u.uGridC, F.gridC); gl.uniform3fv(pr.u.uFogP, fogP); gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4); }
      const pr = P.quad; common(pr); gl.enable(gl.BLEND); gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA); gl.activeTexture(gl.TEXTURE0); gl.uniform1i(pr.u.uTex, 0); gl.uniform1f(pr.u.uF, FOC);
      const dofK = FOC * c.aperture * 2 * 1.25 / Math.sqrt(K);
      const depth = (q) => { const p = M4.pt(q.M, 0, 0, 0); return -(Vm[2] * p[0] + Vm[6] * p[1] + Vm[10] * p[2] + Vm[14]); };
      const qs = S.quads.map((q) => ({ q, d: depth(q) })).filter((x) => x.d > -(x.q.reach || 1200) && x.d < (x.q.far || 30000));
      qs.sort((a, b) => (a.q.layer || 0) - (b.q.layer || 0) || b.d - a.d);
      for (const { q } of qs) {
        gl.uniformMatrix4fv(pr.u.uM, false, q.M); gl.bindTexture(gl.TEXTURE_2D, q.tex);
        gl.uniform2f(pr.u.uSize, q.w, q.h); gl.uniform1f(pr.u.uRad, q.rad || 0); gl.uniform1f(pr.u.uSoftPx, q.soft || 0); gl.uniform1f(pr.u.uAlpha, q.alpha == null ? 1 : q.alpha);
        gl.uniform1f(pr.u.uShade, q.shade == null ? 1 : q.shade); gl.uniform1f(pr.u.uMirror, q.mirror || 0); gl.uniform1f(pr.u.uFade, q.fade || 0); gl.uniform1f(pr.u.uNear, q.near || 0);
        gl.uniform4fv(pr.u.uTint, q.tint || [1, 1, 1, 1]); gl.uniform3f(pr.u.uFogP, fogP[0], fogP[1], q.fog == null ? 1 : q.fog);
        gl.uniform3f(pr.u.uDof, dofK, 1 / c.focus, q.blur || 0); gl.uniform4fv(pr.u.uSheen, q.sheen || [0, 1, 0, 0]); gl.uniform4fv(pr.u.uFrost, q.frost || [0, 0, 0, 0]); gl.uniform4fv(pr.u.uFrostR, q.frostR || [0, 0, 1, 1]); gl.uniform3fv(pr.u.uGlowC, q.glow || [1, 1, 1]);
        gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
      }
      // into the accumulation buffer (linear light)
      gl.bindFramebuffer(gl.FRAMEBUFFER, AC.f); gl.blendFunc(gl.ONE, gl.ONE); gl.useProgram(P.add.p); gl.bindTexture(gl.TEXTURE_2D, SC.t); gl.uniform1i(P.add.u.uTex, 0); gl.uniform1f(P.add.u.uWt, 1 / K); gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    }
    // a frame: K sub-frames; scene(ts) → { cam, fog, floor, quads } at the sub-frame's own time
    const halton = (i, b) => { let f = 1, r = 0; while (i > 0) { f /= b; r += f * (i % b); i = Math.floor(i / b); } return r; };
    G.frame = (scene, t, K, shutter, post) => {
      gl.bindFramebuffer(gl.FRAMEBUFFER, AC.f); gl.viewport(0, 0, W, H); gl.clearColor(0, 0, 0, 0); gl.clear(gl.COLOR_BUFFER_BIT);
      const gcd = (a, b) => (b ? gcd(b, a % b) : a); let step = Math.max(1, Math.round(K * 0.38)); while (gcd(step, K) !== 1) step++; // every lens point once
      for (let k = 0; k < K; k++) {
        const ts = t + ((k + 0.5) / K - 0.5) * shutter;
        const S = scene(ts, K);
        const j = (k * step + 3) % K, rr = Math.sqrt((j + 0.5) / K), th = j * 2.39996323; // the lens: a golden-angle disc, in another order than the time
        const A = S.cam.aperture || 0;
        pass(S, [A * rr * Math.cos(th), A * rr * Math.sin(th)], [(halton(k + 1, 2) - 0.5) * 2 / W, (halton(k + 1, 3) - 0.5) * 2 / H], K);
      }
      gl.bindFramebuffer(gl.FRAMEBUFFER, null); gl.viewport(0, 0, W, H); gl.disable(gl.BLEND); gl.useProgram(P.out.p); gl.bindTexture(gl.TEXTURE_2D, AC.t);
      if (post.diff > 0) gl.generateMipmap(gl.TEXTURE_2D);
      gl.uniform1i(P.out.u.uTex, 0); gl.uniform1f(P.out.u.uDiff, post.diff || 0); gl.uniform1f(P.out.u.uVig, post.vig == null ? 1 : post.vig); gl.uniform1f(P.out.u.uSeed, post.seed || 0);
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    };
    return G;
  }
  R.G3 = G3;

  // ------------------------------------------------------------------ textures drawn on a 2D canvas
  function mk(w, hh) { const c = document.createElement('canvas'); c.width = Math.max(2, Math.ceil(w)); c.height = Math.max(2, Math.ceil(hh)); return c; }
  // a line of type: { cv, w, h (world units), bx (the left of the first glyph), base (the baseline, from the top), adv, widthOf(str) }
  function typeTex(str, font, size, color, track, ss) {
    const px = size * ss, F = font.replace('%', px + 'px');
    let c = mk(8, 8), g = c.getContext('2d'); g.font = F; g.letterSpacing = (track * px) + 'px';
    const m = g.measureText(str), pad = Math.ceil(px * 0.3), asc = Math.ceil(m.fontBoundingBoxAscent), desc = Math.ceil(m.fontBoundingBoxDescent);
    c = mk(m.width + pad * 2, asc + desc + pad * 2); g = c.getContext('2d'); g.font = F; g.letterSpacing = (track * px) + 'px'; g.fillStyle = color; g.textBaseline = 'alphabetic'; g.fillText(str, pad, pad + asc);
    const widthOf = (s) => { g.font = F; g.letterSpacing = (track * px) + 'px'; return g.measureText(s).width / ss; };
    return { cv: c, w: c.width / ss, h: c.height / ss, bx: pad / ss, base: (pad + asc) / ss, adv: m.width / ss, widthOf, size };
  }
  function rr(g, x, y, w, hh, r) { g.beginPath(); g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + hh, r); g.arcTo(x + w, y + hh, x, y + hh, r); g.arcTo(x, y + hh, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath(); }
  // a gallery card: a white paper mat, the real photo exactly as it is (never cropped, never tinted), its label under it
  function cardTex(img, title, meta, o) {
    const s = o.ts, P = o.pad, pw = o.pw, ph = o.ph, LH = o.label;
    const w = pw + P * 2, hh = ph + P * 2 + LH;
    const c = mk(w * s, hh * s), g = c.getContext('2d'); g.scale(s, s);
    g.fillStyle = '#ffffff'; g.fillRect(0, 0, w, hh);
    g.strokeStyle = 'rgba(11,60,55,.13)'; g.lineWidth = 1.6; rr(g, 0.8, 0.8, w - 1.6, hh - 1.6, o.cr - 1); g.stroke();
    g.save(); rr(g, P, P, pw, ph, o.pr); g.clip(); g.imageSmoothingQuality = 'high'; g.drawImage(img, P, P, pw, ph); g.restore();
    g.strokeStyle = 'rgba(11,11,13,.08)'; g.lineWidth = 1; rr(g, P + 0.5, P + 0.5, pw - 1, ph - 1, o.pr); g.stroke();
    if (LH) {
      g.fillStyle = TEAL; g.beginPath(); g.arc(P + 9, P + ph + 39, 6, 0, 7); g.fill();
      g.fillStyle = INK; g.font = "700 30px 'Inter Variable'"; g.letterSpacing = '-0.6px'; g.textBaseline = 'alphabetic'; g.fillText(title, P + 26, P + ph + 50);
      g.fillStyle = '#5e6d6b'; g.font = "500 23px 'Inter Variable'"; g.letterSpacing = '0px'; g.fillText(meta, P + 26, P + ph + 84);
    }
    return { cv: c, w, h: hh };
  }
  function blobTex() { const c = mk(128, 128), g = c.getContext('2d'); const gr = g.createRadialGradient(64, 64, 0, 64, 64, 64); gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.45, 'rgba(255,255,255,.55)'); gr.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = gr; g.fillRect(0, 0, 128, 128); return c; }
  function railTex() { const c = mk(64, 64), g = c.getContext('2d'); const im = g.createImageData(64, 64);
    for (let y = 0; y < 64; y++) for (let x = 0; x < 64; x++) { const u = (x - 31.5) / 31.5, v = y / 63; const a = (Math.exp(-u * u * 60) * 0.95 + Math.exp(-u * u * 5) * 0.22) * smooth(v / 0.06) * smooth((1 - v) / 0.1); const i = (y * 64 + x) * 4; im.data[i] = 20; im.data[i + 1] = 165; im.data[i + 2] = 150; im.data[i + 3] = Math.round(255 * clamp(a)); }
    g.putImageData(im, 0, 0); return c; }
  function dotTex() { const c = mk(128, 128), g = c.getContext('2d'); // the rose gold light-dot (the gradient of the site's rose gold)
    let gr = g.createRadialGradient(64, 64, 14, 64, 64, 64); gr.addColorStop(0, 'rgba(226,162,141,.55)'); gr.addColorStop(1, 'rgba(226,162,141,0)'); g.fillStyle = gr; g.fillRect(0, 0, 128, 128);
    gr = g.createRadialGradient(57, 55, 2, 64, 64, 27); gr.addColorStop(0, '#fff6f0'); gr.addColorStop(0.28, '#f6cdbd'); gr.addColorStop(0.7, '#e2a28d'); gr.addColorStop(1, '#c58069'); g.fillStyle = gr; g.beginPath(); g.arc(64, 64, 27, 0, 7); g.fill(); return c; }
  function flatTex(col) { const c = mk(4, 4), g = c.getContext('2d'); g.fillStyle = col; g.fillRect(0, 0, 4, 4); return c; }

  // ------------------------------------------------------------------ the scene
  V.manifest = (ctx, p) => {
    const el = ctx.el, per = R.beatPer || 0.48, B = (b) => b * per;
    const cv = h('canvas', null, null, el); cv.width = W; cv.height = H; cv.style.cssText = 'position:absolute;left:0;top:0;width:1080px;height:1920px';
    const ov = h('div', null, null, el); ov.style.cssText = 'position:absolute;left:0;top:0;width:1080px;height:1920px';
    const pre = h('div', null, null, el); pre.style.cssText = 'position:absolute;width:0;height:0;overflow:hidden';
    const CAT = R.ROOT + '/brand_asset/catalog/';
    const load = (src) => { const im = h('img', null, null, pre); im.src = src; return im; };
    const heroImg = load(CAT + p.hero.img), caseImgs = p.cases.map((c) => load(CAT + c.img));
    const END = B(34);

    // ---------------------------------------------------------------- the camera's path
    // the corridor: the speed (units a second) by beat; the flight speeds up with the music, then brakes on one case
    const DIVE0 = 6.6, DIVE_DUR = (8 - DIVE0) * per, V8 = 2.2 * FOC / DIVE_DUR;
    const VP = [[8, V8], [8.6, 2500], [9.3, 1500], [10.5, 1750], [12, 2700], [13.4, 3750], [14.2, 3950], [15, 2300], [15.6, 640], [16, 13]];
    const vAt = (b) => { if (b <= VP[0][0]) return VP[0][1]; for (let i = 1; i < VP.length; i++) if (b <= VP[i][0]) return VP[i - 1][1] + (VP[i][1] - VP[i - 1][1]) * smooth((b - VP[i - 1][0]) / (VP[i][0] - VP[i - 1][0])); return VP[VP.length - 1][1]; };
    const NI = 4800, ZT = new Float32Array(NI + 1); { let z = 0; const dt = (B(16) - B(8)) / NI; for (let i = 1; i <= NI; i++) { z -= vAt(8 + (i - 0.5) / NI * 8) * dt; ZT[i] = z; } }
    const flightZ = (t) => { const u = clamp((t - B(8)) / (B(16) - B(8))) * NI, i = Math.min(NI - 1, Math.floor(u)); return ZT[i] + (ZT[i + 1] - ZT[i]) * (u - i); };
    const Z16 = ZT[NI], ZHERO = Z16 - FOC;             // the camera stops 1500 units in front of the case (drawn 1:1)
    const CREEP = 13;                                   // it never stops dead: a slow push while a station holds
    const T2a = B(22.7), T2d = 1.3 * per, D2 = 1750;    // the case opens, the camera flies under it to „Îți arătăm.”
    const zHold1 = (t) => Z16 - CREEP * (t - B(16));
    const Z2 = zHold1(T2a) - D2, ZSHOW = Z2 - FOC;
    const zHold2 = (t) => Z2 - CREEP * (t - (T2a + T2d));
    // the second dive: through the type to the logo; it crosses the type's plane exactly on beat 29
    const D3 = 2700, T3d = 1.4 * per; const u3 = (() => { let lo = 0, hi = 1; for (let i = 0; i < 40; i++) { const m = (lo + hi) / 2; if (smooth(m) * D3 < FOC + 20) lo = m; else hi = m; } return lo; })();
    const T3a = B(29) - u3 * T3d, Z3 = zHold2(T3a) - D3, ZLOGO = Z3 - FOC;
    // where the first dive goes through: the counter of the "o" of „promitem” (set when the type is measured)
    let OX = -150, OY = -60;
    const camAt = (t) => {
      const c = { x: 0, y: 0, z: FOC, yaw: 0, pitch: 0, roll: 0, focus: FOC, aperture: 12 };
      if (t < B(DIVE0)) c.z = FOC + 64 * (1 - t / B(DIVE0)) - 9 * Math.exp(-Math.max(0, t - B(4)) * 7) * (t >= B(4) ? 1 : 0) - 6 * Math.exp(-Math.max(0, t - B(6)) * 7) * (t >= B(6) ? 1 : 0);
      else if (t < B(8)) { const u = (t - B(DIVE0)) / DIVE_DUR; const w = Math.pow(u, 2.2); c.z = FOC * (1 - w) + 64 * Math.pow(Math.sin(Math.PI * clamp(u / 0.5)), 2); c.x = OX * w; c.y = OY * w; c.focus = Math.max(260, c.z); c.aperture = 12; }
      else if (t < B(16)) { c.z = flightZ(t); const k = 1 - E.inout(clamp((t - B(8)) / (1.7 * per))); c.x = OX * k; c.y = OY * k;
        const env = smooth((t - B(9.2)) / (0.9 * per)) * (1 - smooth((t - B(14.3)) / (1.3 * per))); c.x += 52 * Math.sin((t - B(9)) * 1.75) * env; c.y += 16 * Math.sin((t - B(9)) * 1.2 + 1) * env;
        const a = smooth((t - B(8)) / (0.7 * per)), bq = smooth((t - B(14.6)) / (1.4 * per)); c.focus = 300 + (2500 - 300) * a + (FOC - 2500) * bq; c.aperture = 12 + (7.5 - 12) * a + (0 - 7.5) * bq; }
      else if (t < T2a) { c.z = zHold1(t); c.aperture = 0; }
      else if (t < T2a + T2d) { const u = (t - T2a) / T2d; c.z = zHold1(T2a) - D2 * smooth(u); c.aperture = 9 * Math.sin(Math.PI * u); c.focus = FOC + 900 * Math.sin(Math.PI * u); }
      else if (t < T3a) { c.z = zHold2(t); c.aperture = 0; }
      else if (t < T3a + T3d) { const u = (t - T3a) / T3d; c.z = zHold2(T3a) - D3 * smooth(u); c.aperture = 11 * Math.sin(Math.PI * u); c.focus = Math.max(280, Math.abs(c.z - ZSHOW)); c.y = 0; }
      else { c.z = Z3 - CREEP * (t - (T3a + T3d)); c.aperture = 0; }
      return c;
    };
    const cam = (t) => { const c = camAt(t), e = 1 / 240; const vx = (camAt(t + e).x - camAt(t - e).x) / (2 * e); c.roll = clamp(-vx * 0.00011, -0.06, 0.06); c.yaw = clamp(-vx * 0.00005, -0.03, 0.03); return c; };
    // a world point on the screen (the centre of the lens, no jitter): DOM text is pinned with it
    const project = (x, y, z, t) => { const c = cam(t), Vm = M4.chain(M4.RZ(-c.roll), M4.RY(-c.yaw), M4.T(-c.x, -c.y, -c.z)); const v = M4.pt(Vm, x, y, z), d = -v[2]; return { x: W / 2 + FOC * v[0] / d, y: H / 2 - FOC * v[1] / d, s: FOC / d, d }; };

    // ---------------------------------------------------------------- what is where (world units; +y up, the camera looks down -z)
    const FLOOR = -640, WALLX = 560, YAW = 58 * Math.PI / 180, STEP = 1000, Z0 = -1500, SLOTS = 8;
    const HERO = { w: 0, h: 0, y: 170 };           // its centre; the photo 760 wide, 1:1 on screen when the camera has stopped
    const BIG = { size: 160, y1: 112, y2: -48 };   // the baselines of „Noi nu” / „promitem.” (world y)
    const SHOW = { size: 205, y1: 262, y2: 62 };   // „Îți” / „arătăm.”
    let G = null, T = {}, cards = [], words = [], show = [];
    const frostAt = (t) => { const u = E.inout(clamp((t - B(20)) / 0.42)); return { split: 0.5 + 0.56 * u, amt: t < B(20) + 0.5 ? 1 : 0, glow: Math.sin(Math.PI * clamp((t - B(20) + 0.02) / 0.5)) }; };
    const slamZ = (t, t0) => { const u = (t - t0) / 0.3; if (u <= 0) return 1080; const e = E.out5(clamp(u)); return (1 - e) * 1080 - 46 * Math.sin(Math.PI * clamp(u)) * (1 - clamp(u)); };
    const hatch = (t) => E.inout(clamp((t - T2a + 0.06) / (0.86 * per))) * 1.72; // radians: it swings up past the horizontal
    const LAND = [B(4), B(5), B(6)], WORD_T = LAND.map((t) => t - 0.24); // the words land on the beat (the slam starts 0.24 s before)

    ctx.shot.after = () => {
      G = G3(cv);
      const tex = (c) => G.tex(c);
      T.blob = tex(blobTex()); T.dot = tex(dotTex()); T.edge = tex(flatTex('#dde6e4')); T.white = tex(flatTex('#ffffff'));
      // the big type (the site's headline style: Inter, heavy, ink; the answer in Fraunces italic, deep turquoise)
      const FB = "800 % 'Inter Variable'", FS = "italic 400 % 'Fraunces Variable'";
      const mkWord = (str, font, size, color, track, ss, cx, baseY, z) => { const m = typeTex(str, font, size, color, track, ss); return { m, tex: tex(m.cv), str, cx, baseY, z }; };
      const [l1, l2] = p.big, w1 = l1.split(' ');
      // line 1 is two words that land one after the other: measured together, so the spacing is the font's own
      const mL1 = typeTex(l1, FB, BIG.size, INK, -0.045, 4), mA = typeTex(w1[0], FB, BIG.size, INK, -0.045, 5), mB = typeTex(w1.slice(1).join(' '), FB, BIG.size, INK, -0.045, 5);
      const x0 = -mL1.adv / 2, xB = x0 + mL1.widthOf(w1[0] + ' ');
      const stem = l2.replace(/\.$/, ''), mC = typeTex(stem, FB, BIG.size, INK, -0.045, 5);
      const dotR = BIG.size * 0.105, xC = -(mC.adv + dotR * 2.1) / 2;
      words = [{ m: mA, tex: tex(mA.cv), x: x0, baseY: BIG.y1, t0: WORD_T[0] }, { m: mB, tex: tex(mB.cv), x: xB, baseY: BIG.y1, t0: WORD_T[1] }, { m: mC, tex: tex(mC.cv), x: xC, baseY: BIG.y2, t0: WORD_T[2] }];
      const oi = stem.indexOf('o'); // the dive goes through this letter
      OX = xC + mC.widthOf(stem.slice(0, oi)) + (mC.widthOf(stem.slice(0, oi + 1)) - mC.widthOf(stem.slice(0, oi))) / 2 - 0.045 * BIG.size / 2; OY = BIG.y2 + BIG.size * 0.272;
      T.period = { x: xC + mC.adv + dotR * 1.25, y: BIG.y2 + dotR * 0.98, r: dotR };
      const s1 = p.show[0], s2 = p.show[1].replace(/\.$/, '');
      const mS1 = typeTex(s1, FS, SHOW.size, DEEP, -0.02, 4), mS2 = typeTex(s2, FS, SHOW.size, DEEP, -0.02, 4), dR2 = SHOW.size * 0.075;
      const xs2 = -(mS2.adv + dR2 * 2.3) / 2;
      show = [{ m: mS1, tex: tex(mS1.cv), x: -mS1.adv / 2, baseY: SHOW.y1 }, { m: mS2, tex: tex(mS2.cv), x: xs2, baseY: SHOW.y2 }];
      T.period2 = { x: xs2 + mS2.adv + dR2 * 1.5, y: SHOW.y2 + dR2 * 1.05, r: dR2 };
      // the hero case, at the photo's own resolution
      { const iw = heroImg.naturalWidth, ih = heroImg.naturalHeight, pw = 760, ph = Math.round(pw * ih / iw), c = cardTex(heroImg, '', '', { ts: iw / pw, pad: 20, pw, ph, pr: 16, label: 0, cr: 30 }); HERO.w = c.w; HERO.h = c.h; T.hero = tex(c.cv); }
      // the walls: two tiers on each side, staggered; every card a different real case
      let n = 0;
      for (let k = 0; k < SLOTS; k++) for (const wall of [-1, 1]) for (const tier of [1, 0]) {
        const i = n++; if (i >= p.cases.length) continue;
        const im = caseImgs[i], ar = im.naturalWidth / im.naturalHeight, ph = ar > 1.49 ? Math.round(700 / ar) : 470, pw = Math.round(ph * ar);
        const c = cardTex(im, p.cases[i].title, p.cases[i].meta, { ts: 1.3, pad: 24, pw, ph, pr: 12, label: 104, cr: 22 });
        const z = Z0 - k * STEP - (wall > 0 ? STEP * 0.5 : 0) - (tier ? STEP * 0.2 : 0);
        cards.push({ tex: tex(c.cv), w: c.w, h: c.h, x: wall * WALLX, y: tier ? 418 : -208, z, wall, yaw: -wall * YAW, i });
      }
      draw(R.t || 0);
    };

    // the quads at a moment (sub-frames call this with their own time)
    const SHUT = 0.62;                                  // the shutter: the share of a frame's time that is open
    const HAZE = [0.953, 0.972, 0.968];                 // the corridor's air: a breath of turquoise, so white paper reads as paper
    function scene(t, K) {
      const c = cam(t), q = [];
      const fr = 1 / 30, vz = Math.abs(camAt(t + fr / 2).z - camAt(t - fr / 2).z);
      const own = (dz, d, lat) => (Math.abs(dz) * SHUT / Math.max(1, K)) * FOC * lat / Math.max(3600, d * d); // an object's own move between two sub-frames, in px
      // the fog: thick while the type holds (nothing behind it), then it clears as the camera dives in
      const rev = smooth((t - B(7.3)) / (0.8 * per));
      const tint = rev * (1 - smooth((t - (T2a + 0.55 * T2d)) / 0.4));
      const fog = { color: [1 + (HAZE[0] - 1) * tint, 1 + (HAZE[1] - 1) * tint, 1 + (HAZE[2] - 1) * tint], start: 2400 * rev, density: (1 / 2600) * (1 + 60 * Math.pow(1 - rev, 2)) };
      const inCorr = t >= B(7.3) && t < T3a + T3d;
      const calmK = 1 - 0.55 * smooth((t - B(15)) / per);
      const S = { cam: c, fog, vz: vz * SHUT / Math.max(1, K), floor: t >= B(7.3) ? { y: FLOOR, cell: 170, gridA: 0.42 * rev * calmK, gridC: [0.078, 0.647, 0.588] } : null, quads: q };
      // ---- the opening type (z = 0)
      if (t < B(8) + 0.3) {
        words.forEach((w) => { if (t < w.t0 - 0.001) return; const z = slamZ(t, w.t0), a = clamp((t - w.t0) / 0.07), dz = slamZ(t + fr / 2, w.t0) - slamZ(t - fr / 2, w.t0);
          q.push({ M: M4.chain(M4.T(w.x - w.m.bx + w.m.w / 2, w.baseY + w.m.base - w.m.h / 2, z), M4.S(w.m.w, w.m.h)), tex: w.tex, w: w.m.w, h: w.m.h, alpha: a, fog: 0, near: 230, far: 9000, blur: own(dz, c.z - z, 380) }); });
        // the light-dot: it writes the small line, waits, then becomes the full stop of „promitem.”
        const D = dotAt(t); if (D) q.push({ M: M4.chain(M4.T(D.x, D.y, D.z || 0.5), M4.S(D.r * 4.74, D.r * 4.74)), tex: T.dot, w: 1, h: 1, alpha: D.a, fog: 0, near: 230, layer: 1 });
      }
      // ---- the corridor
      if (inCorr && t < T2a + T2d) {
        const zc = c.z;
        cards.forEach((k) => {
          const d = zc - k.z; if (d < -450 || d > 9500) return;
          const base = M4.chain(M4.T(k.x, k.y, k.z), M4.RY(k.yaw));
          // its shadow on the floor, its reflection in it, the soft shade it throws behind itself
          q.push({ M: M4.chain(M4.T(k.x, FLOOR + 2, k.z), M4.RY(k.yaw), M4.RX(-Math.PI / 2), M4.S(k.w + 260, 300)), tex: T.blob, w: 1, h: 1, tint: [0.02, 0.2, 0.18, 1], alpha: k.y < 0 ? 0.2 : 0.07, fade: 1, layer: -3 });
          if (k.y < 0) q.push({ M: M4.chain(M4.T(0, 2 * FLOOR, 0), M4.S(1, -1, 1), base, M4.S(k.w, k.h)), tex: k.tex, w: k.w, h: k.h, rad: 22, mirror: 0.36, layer: -2, blur: 5 });
          q.push({ M: M4.chain(base, M4.T(0, -18, -26), M4.S(k.w + 30, k.h + 30)), tex: T.white, w: k.w + 30, h: k.h + 30, rad: 40, soft: 46, tint: [0.02, 0.17, 0.15, 1], alpha: 0.2, fade: 1 });
          // the paper's edge (its thickness), then the card
          q.push({ M: M4.chain(base, M4.T(k.wall * k.w / 2, 0, -8), M4.RY(k.wall * Math.PI / 2), M4.S(16, k.h - 30)), tex: T.edge, w: 16, h: k.h - 30, shade: 0.97 });
          q.push({ M: M4.chain(base, M4.S(k.w, k.h)), tex: k.tex, w: k.w, h: k.h, rad: 22, sheen: [0.5 + (d - 1500) / 2600, 0.2, 0.1, 0] });
        });
      }
      // ---- the hero case: it stands at the end, facing the camera; the "after" half under frosted glass until its beat
      if (inCorr && t < T2a + T2d + 0.1) {
        const a = hatch(t), da = hatch(t + fr / 2) - hatch(t - fr / 2), F = frostAt(t), hm = M4.chain(M4.T(0, HERO.y + HERO.h / 2, ZHERO), M4.RX(-a), M4.T(0, -HERO.h / 2, 0));
        const lift = own(da * HERO.h, Math.max(300, c.z - ZHERO), 700);
        const far = clamp((c.z - ZHERO - 1500) / 2500), still = a < 0.02 ? 1 : 0;
        if (still) q.push({ M: M4.chain(M4.T(0, FLOOR + 2, ZHERO), M4.RX(-Math.PI / 2), M4.S(HERO.w + 300, 380)), tex: T.blob, w: 1, h: 1, tint: [0.02, 0.2, 0.18, 1], alpha: 0.09, fade: 1, layer: -3 });
        if (still) q.push({ M: M4.chain(M4.T(0, 2 * FLOOR, 0), M4.S(1, -1, 1), hm, M4.S(HERO.w, HERO.h)), tex: T.hero, w: HERO.w, h: HERO.h, rad: 30, mirror: 0.3, layer: -2, blur: 6 });
        q.push({ M: M4.chain(hm, M4.T(0, -24, -30), M4.S(HERO.w + 36, HERO.h + 36)), tex: T.white, w: HERO.w + 36, h: HERO.h + 36, rad: 50, soft: 64, tint: [0.02, 0.17, 0.15, 1], alpha: 0.24 * (1 - far), fade: 1, blur: lift });
        if (a > 0.01) q.push({ M: M4.chain(hm, M4.T(0, -HERO.h / 2, -9), M4.RX(Math.PI / 2), M4.S(HERO.w - 40, 18)), tex: T.edge, w: HERO.w - 40, h: 18, blur: lift });
        const sw = clamp((t - B(15.7)) / 1.1); // one sweep of light over the glass as the camera lands
        const px = 20 / HERO.w, py = 20 / HERO.h;
        q.push({ M: M4.chain(hm, M4.S(HERO.w, HERO.h)), tex: T.hero, w: HERO.w, h: HERO.h, rad: 30, blur: lift, fog: far, frost: [F.split, 0.004, F.amt, F.glow], frostR: [px, py, 1 - px, 1 - py], glow: [0.886, 0.635, 0.553], sheen: [-0.4 + 2.4 * E.inout(sw), 0.16, 0.14 * Math.sin(Math.PI * sw), 0] });
      }
      // ---- „Îți arătăm.” (behind the case), its full stop the light-dot again
      if (t > T2a && t < T3a + T3d) {
        const near = t > T3a ? 260 : 0;
        show.forEach((w) => q.push({ M: M4.chain(M4.T(w.x - w.m.bx + w.m.w / 2, w.baseY + w.m.base - w.m.h / 2, ZSHOW), M4.S(w.m.w, w.m.h)), tex: w.tex, w: w.m.w, h: w.m.h, near, far: 9000 }));
        const P2 = T.period2, t0 = T2a + T2d + 0.1, pa = clamp((t - t0) / 0.16), pk = 1 + 0.6 * Math.sin(Math.PI * clamp((t - t0) / 0.34));
        if (pa > 0) q.push({ M: M4.chain(M4.T(P2.x, P2.y, ZSHOW + 1), M4.S(P2.r * 4.74 * pk, P2.r * 4.74 * pk)), tex: T.dot, w: 1, h: 1, alpha: pa, near, layer: 1 });
      }
      return S;
    }

    // ---------------------------------------------------------------- the light-dot's path while it writes (world units, on the type's plane)
    const KICK = { size: 40, y0: 100, y1: 322 }; // the small line: centred first, above the big type once it lands
    let kick = null, kw = [];
    const kickY = (t) => KICK.y0 + (KICK.y1 - KICK.y0) * E.inout(clamp((t - B(4) + 0.3) / 0.5));
    const WT = [0.7, 1.12, 1.52, 1.98, 2.44].map(B); // a word on (almost) every half beat
    function dotAt(t) {
      if (!kw.length) return null;
      const y = kickY(t) - 4, r0 = 7.5;
      const xs = kw.map((w) => w.x1), xStart = kw[0].x0 - 22;
      if (t < WT[WT.length - 1] + 0.22) { // writing: it runs just ahead of the words
        let x = xStart - 240 * (1 - E.out5(clamp((t + 0.3) / 0.6)));
        WT.forEach((tw, i) => { const from = i ? xs[i - 1] + 9 : xStart; x = t >= tw - 0.12 ? from + (xs[i] + 9 - from) * E.inout(clamp((t - tw + 0.12) / 0.34)) : x; });
        return { x, y, r: r0, a: clamp((t + 0.3) / 0.2) };
      }
      const xEnd = xs[xs.length - 1] + 9, tj = LAND[2] + 0.06, P = T.period;
      if (t < tj) return { x: xEnd, y, r: r0 * (1 + 0.14 * Math.sin((t - 1.3) * 5.2)), a: 1 };
      const u = clamp((t - tj) / 0.34), e = E.inout(u); // the leap: it lands as the full stop
      return { x: xEnd + (P.x - xEnd) * e, y: y + (P.y - y) * e + 90 * Math.sin(Math.PI * u) * (1 - u * 0.6), r: r0 + (P.r - r0) * e + 3 * Math.sin(Math.PI * clamp((t - tj - 0.34) / 0.25)), a: 1, z: 2 };
    }

    // ---------------------------------------------------------------- the DOM layer (small, crisp text; pinned to the camera)
    const txt = (cls, html, css) => { const d = h('div', 'tx ' + (cls || ''), html, ov); d.style.cssText += ';' + css; return d; };
    kick = txt('', p.line.split(/\s+/).map((w) => '<span style="display:inline-block;opacity:0">' + esc(w) + '</span>').join(' '), 'left:160px;width:760px;top:0;text-align:center;font:500 ' + KICK.size + 'px/1.2 var(--f-body);letter-spacing:-.012em;color:#262a30;white-space:nowrap;transform-origin:50% 50%');
    const kspans = [...kick.querySelectorAll('span')];
    const hud = txt('', esc(p.consent), 'left:170px;width:740px;top:1372px;padding:16px 26px 18px;border-radius:28px;background:rgba(255,255,255,.86);backdrop-filter:blur(14px);box-shadow:0 18px 40px -22px rgba(4,60,54,.35),0 0 0 1px rgba(11,60,55,.06);text-align:center;font:500 24px/1.34 var(--f-body);color:#3d4a48;opacity:0');
    const hTitle = txt('', '<i style="display:inline-block;width:14px;height:14px;border-radius:50%;background:' + TEAL + ';margin:0 16px 5px 0;vertical-align:middle"></i>' + esc(p.hero.title), 'left:160px;width:760px;top:0;text-align:center;font:700 42px/1.1 var(--f-body);letter-spacing:-.025em;color:' + INK + ';transform-origin:50% 0');
    const hMeta = txt('', esc(p.hero.meta), 'left:160px;width:760px;top:0;text-align:center;font:500 31px/1.1 var(--f-body);color:#4c5957;transform-origin:50% 0');
    const hNote = txt('', esc(p.consentOne), 'left:190px;width:700px;top:0;text-align:center;font:500 24px/1.34 var(--f-body);color:#4c5957;transform-origin:50% 0');
    const calm = txt('', esc(p.calm), 'left:190px;width:700px;top:0;text-align:center;font:500 36px/1.3 var(--f-body);letter-spacing:-.015em;color:#262a30;transform-origin:50% 0');
    const goog = txt('', esc(p.google), 'left:160px;width:760px;top:0;text-align:center;font:650 31px/1.2 var(--f-body);letter-spacing:.005em;color:' + DEEP + ';transform-origin:50% 0');
    // the real logo, black on white (brand_asset): the mark and the wordmark, as in the site's header
    const logo = h('div', null, null, ov); logo.style.cssText = 'position:absolute;left:0;top:0;width:1080px;height:1920px;transform-origin:540px 800px';
    const LM = 112, LWH = 50, LWW = Math.round(LWH * 5583 / 426), LX = Math.round((W - (LM + 26 + LWW)) / 2), LY = 742;
    const mark = h('i', null, null, logo); mark.style.cssText = 'position:absolute;left:' + LX + 'px;top:' + LY + 'px;width:' + LM + 'px;height:' + LM + 'px;background:url(' + R.ROOT + '/brand_asset/logo-mark.png) center/contain no-repeat';
    const wm = h('i', null, null, logo); wm.style.cssText = 'position:absolute;left:' + (LX + LM + 26) + 'px;top:' + (LY + (LM - LWH) / 2) + 'px;width:' + LWW + 'px;height:' + LWH + 'px;background:#000;-webkit-mask:url(' + R.ROOT + '/brand_asset/wordmark-com.png) center/contain no-repeat;mask:url(' + R.ROOT + '/brand_asset/wordmark-com.png) center/contain no-repeat';
    const city = txt('', esc(p.cities[0]) + '<i style="display:inline-block;width:15px;height:15px;border-radius:50%;margin:0 22px 5px;vertical-align:middle;background:radial-gradient(circle at 38% 34%,#fff 0%,#fbe3d9 30%,#eab5a5 70%,#cf8f7d 100%);box-shadow:0 0 14px 4px rgba(234,181,165,.4)"></i>' + esc(p.cities[1]), 'left:160px;width:760px;top:' + (LY + LM + 54) + 'px;text-align:center;font:500 38px/1.1 var(--f-body);letter-spacing:.01em;color:' + INK);
    logo.appendChild(city);
    [load(R.ROOT + '/brand_asset/logo-mark.png'), load(R.ROOT + '/brand_asset/wordmark-com.png')];
    const fadeIO = (t, a, b, din = 0.3, dout = 0.25) => smooth((t - a) / din) * (1 - smooth((t - b) / dout));
    const pin = (e, P, y, o, bl) => { e.style.top = y + 'px'; e.style.transformOrigin = '50% ' + (P.oy - y) + 'px'; e.style.transform = 'translate(' + (P.x - W / 2).toFixed(2) + 'px,' + (P.y - P.oy).toFixed(2) + 'px) scale(' + P.s.toFixed(4) + ')'; e.style.opacity = o.toFixed(3); e.style.filter = bl > 0.3 ? 'blur(' + bl.toFixed(1) + 'px)' : ''; e.style.visibility = o < 0.004 ? 'hidden' : ''; };
    function dom(t) {
      // the small line: its words appear as the dot passes; on the drop it moves up, above the big type
      const ky = kickY(t), P = project(0, ky, 0, t); P.oy = H / 2 - KICK.y0;
      kspans.forEach((s, i) => { const q = smooth((t - WT[i]) / 0.2); s.style.opacity = q.toFixed(3); s.style.filter = q < 0.99 ? 'blur(' + ((1 - q) * 5).toFixed(1) + 'px)' : ''; s.style.transform = 'translateY(' + ((1 - q) * 6).toFixed(1) + 'px)'; });
      pin(kick, P, H / 2 - KICK.y0 - KICK.size * 0.6, 1 - smooth((t - B(6.85)) / 0.22), 0);
      hud.style.opacity = fadeIO(t, B(9.1), B(15.1), 0.4, 0.3).toFixed(3); hud.style.visibility = +hud.style.opacity < 0.004 ? 'hidden' : '';
      // the case's label: what the catalog states, and the consent line
      const hb = HERO.y - HERO.h / 2, Ph = project(0, hb, ZHERO, t); Ph.oy = H / 2 - hb;
      const stag = (i) => fadeIO(t, B(16.35) + i * 0.12, B(22.45), 0.34, 0.2), rise = (i) => (1 - E.out5(clamp((t - B(16.35) - i * 0.12) / 0.5))) * 22;
      [[hTitle, 36], [hMeta, 94], [hNote, 152]].forEach(([e, dy], i) => { pin(e, Ph, Ph.oy + dy, stag(i), 0); e.style.transform += ' translateY(' + rise(i).toFixed(1) + 'px)'; });
      // the two calm lines under „Îți arătăm.”
      const sb = SHOW.y2 - 110, Ps = project(0, sb, ZSHOW, t); Ps.oy = H / 2 - sb;
      [[calm, 0, B(24.7)], [goog, 142, B(25.7)]].forEach(([e, dy, t0]) => { pin(e, Ps, Ps.oy + dy, fadeIO(t, t0, T3a - 0.05, 0.4, 0.2), (1 - smooth((t - t0) / 0.4)) * 6); e.style.transform += ' translateY(' + ((1 - E.out5(clamp((t - t0) / 0.6))) * 18).toFixed(1) + 'px)'; });
      // the logo: it waits in the light behind the type, 1:1 when the camera lands
      const Pl = project(0, 160, ZLOGO, t), a = smooth((t - B(29) - 0.02) / 0.3);
      logo.style.transform = 'translate(' + (Pl.x - W / 2).toFixed(2) + 'px,' + (Pl.y - 800).toFixed(2) + 'px) scale(' + Pl.s.toFixed(4) + ')'; logo.style.opacity = a.toFixed(3); logo.style.visibility = a < 0.004 ? 'hidden' : '';
      logo.style.filter = a < 0.99 ? 'blur(' + ((1 - a) * 9).toFixed(1) + 'px)' : '';
      const ca = smooth((t - B(29.85)) / 0.4); city.style.opacity = ca.toFixed(3); city.style.transform = 'translateY(' + ((1 - E.out5(clamp((t - B(29.85)) / 0.6))) * 14).toFixed(1) + 'px)';
    }
    ctx.shot.afterDom = () => { // the words' places on the type's plane (world x), for the dot
      const kr = kick.getBoundingClientRect(); kw = kspans.map((s) => { const r = s.getBoundingClientRect(); return { x0: r.left - W / 2, x1: r.right - W / 2 }; }); void kr; };

    // ---------------------------------------------------------------- one frame
    let last = -1;
    function draw(t) {
      if (!G) return;
      if (!kw.length) { el.style.display = 'block'; const o = kspans.map((s) => s.style.cssText); kick.style.transform = ''; ctx.shot.afterDom(); void o; }
      dom(t);
      if (Math.abs(t - last) < 1e-6) return; last = t;
      const fr = 1 / 30, sp = Math.abs(camAt(t + fr / 2).z - camAt(t - fr / 2).z);
      const busy = WORD_T.some((w) => t > w - 0.04 && t < w + 0.34) || (t > T2a - 0.1 && t < T2a + T2d + 0.1);
      const K = Math.round(clamp(6 + sp / 4.4 + (busy ? 16 : 0), 6, 30));
      const hold = (t >= B(16.4) && t < T2a) ? 1 : 0;
      G.frame(scene, t, K, fr * SHUT, { diff: 0, vig: 1, seed: Math.floor(t * 30) % 64 }); void hold;
    }
    ctx.tick((t) => draw(t));

    // ---------------------------------------------------------------- sound and events, to the frame
    const ev = (t, kind) => R.event(t, kind);
    WT.forEach((t, i) => { ctx.sfx(t, 'tick_soft', 0.5); ev(t, i ? 'word' : 'write'); });
    ctx.sfx(0.1, 'riser_soft', 0.4);
    LAND.forEach((t, i) => { ctx.sfx(t, i === 0 ? 'impact' : 'tap', i === 0 ? 0.95 : 0.7, { prio: 4 }); if (i === 0) ctx.sfx(t + 0.08, 'subdrop', 0.6, { prio: 4 }); ev(t, 'slam'); });
    ctx.sfx(LAND[2] + 0.4, 'dot', 0.6); ev(LAND[2] + 0.4, 'motif');
    ctx.sfx(B(6.9), 'riser_soft', 0.55);
    ctx.sfx(B(8), 'whoosh_cut', 0.75, { prio: 3, peak: true }); ev(B(8), 'cut');
    // the cards passing the camera: a soft tick each, on its side
    const passT = (z) => { let lo = B(8), hi = B(16); for (let i = 0; i < 30; i++) { const m = (lo + hi) / 2; if (flightZ(m) > z) lo = m; else hi = m; } return lo; };
    for (let k = 0; k < SLOTS; k++) [-1, 1].forEach((wall) => { const z = Z0 - k * STEP - (wall > 0 ? STEP * 0.5 : 0) - STEP * 0.1 + 240; const t = passT(z); ctx.sfx(t, 'tick_soft', 0.34, { pan: wall * 0.55 }); ev(t, 'pass'); });
    ctx.sfx(B(13.2), 'riser', 0.5, { prio: 3 });
    ctx.sfx(B(16), 'impact', 0.7, { prio: 4 }); ctx.sfx(B(16) + 0.08, 'subdrop', 0.75, { prio: 4 }); ev(B(16), 'stop');
    ctx.sfx(B(16.35), 'tick_soft', 0.4); ev(B(16.35), 'in');
    ctx.sfx(B(20), 'dot', 0.75, { prio: 3 }); ctx.sfx(B(20) + 0.08, 'shimmer', 0.5); ev(B(20), 'reveal');
    ctx.sfx(B(22.75), 'riser_soft', 0.5);
    const tOpen = T2a + 0.62 * T2d; ctx.sfx(tOpen, 'whoosh_cut', 0.6, { prio: 3, peak: true }); ev(tOpen, 'cut'); ev(T2a, 'open'); ctx.sfx(T2a, 'tap', 0.5);
    ctx.sfx(B(24), 'impact', 0.6, { prio: 4 }); ev(B(24), 'stop'); ctx.sfx(B(24) + 0.2, 'dot', 0.55);
    [B(24.7), B(25.7)].forEach((t) => { ctx.sfx(t, 'tick_soft', 0.45); ev(t, 'in'); });
    ctx.sfx(T3a + 0.05, 'riser_soft', 0.45);
    ctx.sfx(B(29), 'whoosh_cut', 0.7, { prio: 3, peak: true }); ev(B(29), 'cut');
    const tLogo = T3a + T3d; ctx.sfx(tLogo - 0.04, 'tap', 0.55); ev(tLogo - 0.04, 'slam'); ctx.sfx(tLogo + 0.05, 'shimmer', 0.4);
    ctx.sfx(B(29.85), 'dot', 0.5); ev(B(29.85), 'motif');
    ev(B(31.5), 'hold'); ev(B(18), 'breath'); ev(B(26.9), 'breath'); ev(B(11), 'beat'); ev(B(12), 'beat'); ev(B(13), 'beat');
    ctx.focus(logo);
    R.manifest = { cam, project, B, END, stations: () => ({ Z16, ZHERO, Z2, ZSHOW, Z3, ZLOGO, T2a, T2d, T3a, T3d, OX, OY }) };
  };
})();
