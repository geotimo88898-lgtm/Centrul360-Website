// Portat din adminul Summitlane (admin/assets/scene/globe.js): același glob, aceleași shadere, markere și etichete.
// Centrul360: vizitatorii sunt puncte verzi calme (fără inel care pulsează), clinica e o lumină turcoaz liniștită.
// Live: the dotted globe. A green dot for each person on a page or in an app right now (placed in their country), a green
// ring when someone opens a page, a blue ring when someone starts paying, a gold arc to the owner's base on each payment.
//   const G = createGlobe()
//   G.mount(stageEl, labelsEl, layout)  layout() -> {W, H, cx, cy, R, phone} in stage pixels
//   G.setVisitors([{cc, n}])           everyone live now, by country
//   G.event({kind: "v"|"c"|"p", cc, label, icon})   v visit, c checkout, p payment (arc + label with the amount)
//   G.setSpots([{key, app, cc, label, icon, n}])  who is live where: a marker that pulses at the country, with the app's mascot
//                                     and "GrizzFit · SUA"; the globe turns so the marker is in front (one after another)
//   G.focus({app, cc})                 turn to that visitor (a row tapped in the list); a short-lived marker if they already left
//   G.enter()  G.leave()
import { GL, loadGL, attach, detach, kick, wantRun, active, newStats, phoneDpr, watchView, reduced, tilt, clamp } from "./renderer.js";
import { ll, loadLand, landXYZ, spot, where, HOME, D2R } from "./geo.js";

const MAXV = 200; // dots for visitors (beyond that the count still shows, the dots stop)
const TAU = Math.PI * 2;
const wrap = (a) => ((a + Math.PI) % TAU + TAU) % TAU - Math.PI;
// the rotation that brings a point to the front: spin about y, lean about x (the same convention in WebGL and in 2D)
const faceSpin = (lon) => -Math.PI / 2 - lon * D2R;
const faceTilt = (lat) => clamp(lat * D2R, -0.7, 0.9);

// Centrul360: the globe's light, markers and arcs take the accent picked in the portal (portal-accent.js sets --accent)
function accent() {
  const v = getComputedStyle(document.documentElement).getPropertyValue("--accent").trim();
  let m = /^#([0-9a-f]{6})$/i.exec(v), r = 0.24, g = 0.88, b = 0.56;
  if (m) { const n = parseInt(m[1], 16); r = (n >> 16 & 255) / 255; g = (n >> 8 & 255) / 255; b = (n & 255) / 255; }
  else if ((m = /^#([0-9a-f]{3})$/i.exec(v))) { r = parseInt(m[1][0] + m[1][0], 16) / 255; g = parseInt(m[1][1] + m[1][1], 16) / 255; b = parseInt(m[1][2] + m[1][2], 16) / 255; }
  else if ((m = /rgba?\(([\d.]+)[ ,]+([\d.]+)[ ,]+([\d.]+)/.exec(v))) { r = m[1] / 255; g = m[2] / 255; b = m[3] / 255; }
  return [r, g, b];
}
// Centrul360 (the owner, 8.11): on Light the globe is drawn light (the page's paper, land in ink, the lights in the accent)
const isLight = () => document.documentElement.getAttribute("data-theme") === "light";
function cssRGB(name, fb) {
  try {
    const c = document.createElement("canvas"); c.width = c.height = 1; const g = c.getContext("2d");
    g.fillStyle = fb; g.fillStyle = getComputedStyle(document.documentElement).getPropertyValue(name).trim() || fb; g.fillRect(0, 0, 1, 1);
    const d = g.getImageData(0, 0, 1, 1).data; return [d[0] / 255, d[1] / 255, d[2] / 255];
  } catch (e) { return [1, 1, 1]; }
}
export function createGlobe() {
  const G = { host: null, labels: null, layout: null, visitors: [], mode: null, spots: [] };
  let S = null, flat = null;
  // ---------- markers (HTML over the canvas, placed from the projection of each frame) ----------
  const M = { els: {}, focus: null, hold: 0, cycle: 0, ghost: null };
  const phoneW = () => innerWidth < 1100;
  function spotEl(s) {
    let e = M.els[s.key];
    if (!e) {
      e = document.createElement("div"); e.className = "gspot";
      e.innerHTML = '<i class="gs-dot"></i><span class="gs-tag"><img alt=""><span class="gs-t"></span><b class="gs-n"></b></span>';
      M.els[s.key] = e; if (G.labels) G.labels.appendChild(e);
    }
    if (G.labels && e.parentNode !== G.labels) G.labels.appendChild(e);
    const img = e.querySelector("img"); if (s.icon && img.getAttribute("src") !== s.icon) img.src = s.icon;
    e.querySelector(".gs-t").textContent = s.label; e.querySelector(".gs-n").textContent = s.n > 1 ? s.n : "";
    e.classList.toggle("ghost", !!s.ghost); e._w = 0;
    return e;
  }
  function allSpots() { return M.ghost ? G.spots.concat([M.ghost]) : G.spots; }
  function syncSpotEls() {
    const keep = {}; allSpots().forEach((s) => { keep[s.key] = 1; spotEl(s); });
    Object.keys(M.els).forEach((k) => { if (!keep[k]) { M.els[k].remove(); delete M.els[k]; } });
  }
  // what the globe should face now: a tapped visitor (held 15 s), else each live spot in turn, biggest first
  function target(now) {
    if (M.ghost && now > M.ghost.until) { M.ghost = null; syncSpotEls(); }
    if (M.focus && now < M.hold) return allSpots().find((s) => s.key === M.focus) || null;
    if (!G.spots.length) return null;
    return G.spots[M.cycle % G.spots.length];
  }
  // proj(lat, lon) -> [x, y, facing] in stage pixels; places every marker, the label only for the ones in front (no overlaps)
  function placeSpots(proj, W, H, cur) {
    const L = allSpots(); if (!L.length) return;
    const maxTags = phoneW() ? 2 : 4, P = [];
    L.forEach((s) => { const q = proj(s.lat, s.lon); P.push({ s, x: q[0], y: q[1], f: q[2], e: M.els[s.key] }); });
    // a label for the faced one, then one per country (the app with the most people there), only on the side turned toward us
    const seenCC = {}, order = [];
    P.filter((p) => p.f > 0.2).sort((a, b) => (b.s === cur) - (a.s === cur) || b.s.n - a.s.n).forEach((p) => {
      if (order.length >= maxTags || (p.s !== cur && seenCC[p.s.cc])) return;
      seenCC[p.s.cc] = 1; order.push(p);
    });
    const placed = [];
    order.forEach((p) => {
      const w = p.e._w || (p.e._w = p.e.querySelector(".gs-tag").offsetWidth) || 140;
      // right of the marker, else left, else wherever it fits inside the stage (never cut by the edge)
      let x0 = p.x + 14 + w <= W - 8 ? p.x + 14 : p.x - 14 - w >= 8 ? p.x - 14 - w : clamp(p.x - w / 2, 8, Math.max(8, W - 8 - w));
      let ty = x0 > p.x - w && x0 < p.x ? -48 : -16;
      for (let k = 0; k < 6; k++) {
        const y0 = p.y + ty, hit = placed.find((r) => x0 < r.x1 + 4 && x0 + w > r.x0 - 4 && y0 < r.y1 && y0 + 32 > r.y0);
        if (!hit) break;
        ty = hit.y1 - p.y + 4;
      }
      placed.push({ x0, x1: x0 + w, y0: p.y + ty, y1: p.y + ty + 32 });
      p.tag = true; p.tx = x0 - p.x; p.ty = ty;
    });
    P.forEach((p) => {
      const e = p.e; if (!e) return;
      const vis = clamp((p.f + 0.05) / 0.25, 0, 1);
      e.style.opacity = vis.toFixed(2);
      e.style.transform = "translate(" + p.x.toFixed(1) + "px," + p.y.toFixed(1) + "px)";
      e.classList.toggle("on", p.s === cur); e.classList.toggle("notag", !p.tag);
      if (p.tag) {
        // a thin line from the marker to the nearest side of its label
        const w = p.e._w || 140, dx = p.tx >= 0 ? p.tx : p.tx + w <= 0 ? p.tx + w : clamp(0, p.tx, p.tx + w), dy = p.ty + 16 + (p.tx < 0 && p.tx + w > 0 ? 16 : 0);
        e.style.setProperty("--tx", p.tx.toFixed(1) + "px"); e.style.setProperty("--ty", p.ty.toFixed(1) + "px");
        e.style.setProperty("--la", Math.atan2(dy, dx).toFixed(3) + "rad"); e.style.setProperty("--lw", Math.hypot(dx, dy).toFixed(1) + "px");
      }
    });
  }
  G.setSpots = function (list) {
    const byCC = {};
    G.spots = (list || []).filter((s) => where(s.cc) && s.n > 0).sort((a, b) => b.n - a.n || String(a.key).localeCompare(String(b.key))).map((s) => {
      const i = byCC[s.cc] = (byCC[s.cc] == null ? 0 : byCC[s.cc] + 1), p = spot(s.cc, i * 5);
      return Object.assign({}, s, { lat: p[0], lon: p[1] });
    });
    if (M.ghost && G.spots.some((s) => s.key === M.ghost.key)) M.ghost = null;
    syncSpotEls();
    if (S) S.syncSpots(); else if (flat) flat.draw();
  };
  G.focus = function (o) {
    const cc = String(o && o.cc || "").toUpperCase(); if (!where(cc)) return false;
    const key = (o.app || "") + "|" + cc, now = performance.now();
    let s = G.spots.find((x) => x.key === key) || G.spots.find((x) => x.cc === cc && (!o.app || x.app === o.app));
    if (!s) { const c = where(cc); s = M.ghost = Object.assign({ key, cc, n: 1, lat: c[0], lon: c[1], ghost: true, until: now + 15000 }, o.spot || {}); syncSpotEls(); }
    M.focus = s.key; M.hold = now + 15000;
    if (S) S.syncSpots(); else if (flat) flat.draw();
    return true;
  };
  function people() {
    const L = [];
    G.visitors.forEach((v) => { for (let i = 0; i < v.n && L.length < MAXV; i++) { const p = spot(v.cc, i); if (p) L.push({ lat: p[0], lon: p[1], ph: ((i * 0.618) + v.cc.charCodeAt(0) * 0.13) % 1 }); } });
    return L;
  }
  G.mount = function (stage, labels, layout) {
    G.host = stage; G.labels = labels; G.layout = layout;
    syncSpotEls();
    if (S) { detach(S); S.host = stage; watchView(S, stage); return; }
    if (G.mode) return;
    G.mode = "wait";
    Promise.all([loadGL(), loadLand()]).then(([g]) => {
      if (!g) { G.mode = "2d"; flat = flat2D(); return; }
      try { S = build(g.T); G.mode = "gl"; } catch (e) { G.mode = "2d"; flat = flat2D(); return; }
      if (G.host && G.host.isConnected) { S.host = G.host; watchView(S, G.host); G.enter(); }
    }, () => { G.mode = "none"; });
  };
  G.setVisitors = function (list) { G.visitors = list.filter((v) => where(v.cc) && v.n > 0); if (S) S.syncVisitors(); else if (flat) flat.draw(); };
  G.event = function (e) { if (S) S.event(e); };
  G.enter = function () { if (S && G.host && G.host.isConnected) { attach(S); S.enter(); } else if (flat) flat.mount(); };
  G.leave = function () { if (S) detach(S); };

  // ---------- no WebGL: the same dots, drawn on demand ----------
  function flat2D() {
    const F = { c: null };
    F.mount = function () {
      if (!G.host || !G.host.isConnected) return;
      if (!F.c || F.c.parentNode !== G.host) { F.c = document.createElement("canvas"); F.c.setAttribute("aria-hidden", "true"); G.host.insertBefore(F.c, G.host.firstChild); new ResizeObserver(F.draw).observe(G.host); }
      F.draw();
    };
    const pts = landXYZ();
    F.draw = function () {
      if (!F.c || !F.c.isConnected) return;
      const L = G.layout(), dpr = phoneDpr();
      F.c.width = L.W * dpr; F.c.height = L.H * dpr;
      const g = F.c.getContext("2d"); g.scale(dpr, dpr);
      const cur = target(performance.now()), ry = cur ? faceSpin(cur.lon) : -1.13, rx = cur ? faceTilt(cur.lat) : 0.42, cy = Math.cos(ry), sy = Math.sin(ry), cx = Math.cos(rx), sx = Math.sin(rx);
      const P = (x, y, z) => { const x1 = x * cy + z * sy, z1 = -x * sy + z * cy; const y2 = y * cx - z1 * sx, z2 = y * sx + z1 * cx; return [L.cx + x1 * L.R, L.cy - y2 * L.R, z2]; };
      const light = isLight(), acc = accent().map((x) => Math.round(x * 255)).join(","), ink = cssRGB("--fg", "#14161a").map((x) => Math.round(x * 255)).join(",");
      const grd = g.createRadialGradient(L.cx, L.cy, L.R * 0.9, L.cx, L.cy, L.R * 1.25); grd.addColorStop(0, light ? "rgba(" + acc + ",.16)" : "rgba(160,180,255,.12)"); grd.addColorStop(1, "rgba(0,0,0,0)");
      g.fillStyle = grd; g.beginPath(); g.arc(L.cx, L.cy, L.R * 1.25, 0, 7); g.fill();
      g.fillStyle = light ? "rgba(" + ink + ",.04)" : "#030304"; g.beginPath(); g.arc(L.cx, L.cy, L.R, 0, 7); g.fill();
      for (let i = 0; i < pts.length; i += 3) { const p = P(pts[i], pts[i + 1], pts[i + 2]); if (p[2] <= 0) continue; g.fillStyle = (light ? "rgba(" + ink + "," : "rgba(235,238,245,") + (0.15 + p[2] * 0.6).toFixed(2) + ")"; g.fillRect(p[0] - 1, p[1] - 1, 2, 2); }
      people().forEach((v) => { const q = ll(v.lat, v.lon), p = P(q[0], q[1], q[2]); if (p[2] <= 0) return; g.fillStyle = "rgb(" + accent().map((x) => Math.round(x * 255)).join(",") + ")"; g.beginPath(); g.arc(p[0], p[1], 2.4, 0, 7); g.fill();  });
      const h = ll(HOME.lat, HOME.lon), hp = P(h[0], h[1], h[2]); g.fillStyle = "#2fd6c3"; g.beginPath(); g.arc(hp[0], hp[1], 3.5, 0, 7); g.fill();
      placeSpots((lat, lon) => { const q = ll(lat, lon, 1.004); return P(q[0], q[1], q[2]); }, L.W, L.H, cur);
    };
    F.mount();
    return F;
  }

  // ---------- WebGL ----------
  function build(THREE) {
    const renderer = GL.r, phone = innerWidth < 1100;
    const S = { name: "globe", host: G.host, inView: true, maxDpr: phoneDpr, minDpr: 0.75, clockV: 0 };
    newStats(S);
    const scene = new THREE.Scene(), camera = new THREE.PerspectiveCamera(32, 1, 0.1, 200), CAMZ = 10;
    camera.position.set(0, 0, CAMZ); S.scene = scene; S.camera = camera;
    const root = new THREE.Group(); scene.add(root);
    const tiltG = new THREE.Group(); root.add(tiltG);
    const spin = new THREE.Group(); tiltG.add(spin);
    const seg = phone ? [40, 28] : [56, 40];
    const ball = Object.assign(new THREE.Mesh(new THREE.SphereGeometry(0.992, seg[0], seg[1]), new THREE.MeshBasicMaterial({ color: 0x030304 })), { renderOrder: 0 });
    spin.add(ball);

    // land dots (half of them on phones)
    let lp = landXYZ();
    if (phone) { const h = new Float32Array(Math.floor(lp.length / 6) * 3); for (let i = 0, j = 0; j < h.length; i += 6, j += 3) { h[j] = lp[i]; h[j + 1] = lp[i + 1]; h[j + 2] = lp[i + 2]; } lp = h; }
    const lg = new THREE.BufferGeometry(); lg.setAttribute("position", new THREE.BufferAttribute(lp, 3));
    const rand = new Float32Array(lp.length / 3); for (let i = 0; i < rand.length; i++) rand[i] = Math.random(); lg.setAttribute("rnd", new THREE.BufferAttribute(rand, 1));
    const dotMat = new THREE.ShaderMaterial({ transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
      uniforms: { uSize: { value: 2 }, uReveal: { value: 1.25 }, uLight: { value: 0 }, uInk: { value: new THREE.Vector3(0.1, 0.11, 0.14) } },
      vertexShader: `attribute float rnd; uniform float uSize, uReveal; varying float vA; varying float vW;
        void main(){ vec4 wp=modelMatrix*vec4(position,1.0); vec3 n=normalize(mat3(modelMatrix)*position);
          float f=dot(n,normalize(cameraPosition-wp.xyz)); float lit=0.55+0.45*max(dot(n,normalize(vec3(-0.5,0.6,0.7))),0.0);
          float rev=smoothstep(uReveal-0.25,uReveal,1.0-(position.y*0.5+0.5)+rnd*0.15);
          vA=smoothstep(-0.02,0.5,f)*lit*(1.0-rev); vW=rnd;
          gl_Position=projectionMatrix*viewMatrix*wp; gl_PointSize=uSize*(0.85+0.3*rnd); }`,
      fragmentShader: "uniform float uLight; uniform vec3 uInk; varying float vA; varying float vW; void main(){ float d=length(gl_PointCoord-0.5); if(d>0.5) discard; float a=smoothstep(0.5,0.2,d)*vA; if(uLight>0.5){ gl_FragColor=vec4(uInk,a*(0.55+0.25*vW)); } else { gl_FragColor=vec4(mix(vec3(0.82,0.85,0.92),vec3(1.0),vW)*a,a); } }" });
    const dots = new THREE.Points(lg, dotMat); dots.renderOrder = 1; spin.add(dots);

    // atmosphere: one camera-facing sprite
    const atm = new THREE.Mesh(new THREE.PlaneGeometry(2.7, 2.7), new THREE.ShaderMaterial({ transparent: true, depthWrite: false, depthTest: false, blending: THREE.AdditiveBlending,
      vertexShader: "varying vec2 vU; void main(){ vU=uv*2.0-1.0; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0); }",
      uniforms: { uAcc: { value: null }, uLight: { value: 0 } },
      fragmentShader: "uniform vec3 uAcc; uniform float uLight; varying vec2 vU; void main(){ float r=length(vU)*1.35; float a=r<1.0? pow(r,6.0)*0.35 : exp(-(r-1.0)*9.0)*0.42; a*=smoothstep(1.35,1.0,r); if(uLight>0.5){ gl_FragColor=vec4(uAcc,min(1.0,a*0.75)); } else { gl_FragColor=vec4(mix(vec3(0.62,0.72,1.0),uAcc,0.55)*a,a); } }" }));
    atm.renderOrder = 2; root.add(atm);
    atm.material.uniforms.uAcc.value = new THREE.Vector3(...accent());

    // stars
    const SN = phone ? 160 : 360, sp = new Float32Array(SN * 3), ss = new Float32Array(SN);
    for (let i = 0; i < SN; i++) { const u = Math.random() * 2 - 1, t = Math.random() * 6.283, r = Math.sqrt(1 - u * u); sp[i * 3] = r * Math.cos(t) * 60; sp[i * 3 + 1] = u * 60; sp[i * 3 + 2] = r * Math.sin(t) * 60 - 20; ss[i] = Math.random(); }
    const sg = new THREE.BufferGeometry(); sg.setAttribute("position", new THREE.BufferAttribute(sp, 3)); sg.setAttribute("rnd", new THREE.BufferAttribute(ss, 1));
    const starMat = new THREE.ShaderMaterial({ transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, uniforms: { uT: { value: 0 }, uPx: { value: 1 } },
      vertexShader: "attribute float rnd; uniform float uT, uPx; varying float vA; void main(){ vA=(0.2+0.8*rnd*rnd)*(0.7+0.3*sin(uT*(0.5+rnd)+rnd*50.0)); gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0); gl_PointSize=uPx*(0.8+rnd*1.4); }",
      fragmentShader: "varying float vA; void main(){ float d=length(gl_PointCoord-0.5); float a=smoothstep(0.5,0.0,d)*vA*0.7; gl_FragColor=vec4(vec3(a),a); }" });
    const stars = new THREE.Points(sg, starMat); stars.frustumCulled = false; scene.add(stars);

    // pulses: 0 visitor (green, looping), 1 payment burst (gold), 2 home, 3 page view (green ring), 4 checkout (blue ring)
    const pulseVS = `attribute float ph; attribute float kind; attribute float born; uniform float uT, uSize; varying float vPh; varying float vKind; varying float vAge; varying float vF;
      void main(){ vec4 wp=modelMatrix*vec4(position,1.0); vec3 n=normalize(mat3(modelMatrix)*position); vF=smoothstep(0.0,0.35,dot(n,normalize(cameraPosition-wp.xyz)));
        vPh=ph; vKind=kind; vAge=uT-born; gl_Position=projectionMatrix*viewMatrix*wp; gl_PointSize=uSize*(kind>0.5 && kind<1.5 ? 2.4 : (kind>2.5 ? 2.0 : 1.0)); }`;
    const pulseFS = `uniform float uT; uniform vec3 uAcc; uniform float uLight; varying float vPh; varying float vKind; varying float vAge; varying float vF;
      void main(){ float d=length(gl_PointCoord-0.5)*2.0; vec3 col; float a;
        if(vKind<0.5){ float core=smoothstep(0.22,0.1,d); float glow=smoothstep(0.55,0.0,d)*0.22; col=uAcc; a=(core+glow)*smoothstep(0.0,0.8,vAge); }
        else if(vKind<1.5){ float t=clamp(vAge/1.4,0.0,1.0); float ring=smoothstep(0.07,0.0,abs(d-t))*(1.0-t); float core=smoothstep(0.3,0.0,d)*(1.0-t)*1.5; col=vec3(1.0,0.8,0.42); a=ring*1.4+core; }
        else if(vKind<2.5){ float core=smoothstep(0.16,0.06,d); float glow=smoothstep(0.5,0.0,d)*0.3; col=mix(uAcc,vec3(1.0),0.35); a=core*1.2+glow; }
        else { float t=clamp(vAge/1.1,0.0,1.0); float ring=smoothstep(0.06,0.0,abs(d-t))*(1.0-t); col= vKind<3.5 ? uAcc : vec3(0.74,0.83,1.0); a=ring*1.3+smoothstep(0.2,0.0,d)*(1.0-t); }
        a*=vF; if(a<0.01) discard; if(uLight>0.5){ if(vKind>0.5 && vKind<1.5) col=vec3(0.86,0.6,0.12); gl_FragColor=vec4(min(col,vec3(1.0))*0.92,min(a,1.0)); } else { gl_FragColor=vec4(col*a,a); } }`;
    const MAXP = MAXV + 40;
    const pg = new THREE.BufferGeometry(), pPos = new Float32Array(MAXP * 3), pPh = new Float32Array(MAXP), pKind = new Float32Array(MAXP), pBorn = new Float32Array(MAXP);
    pg.setAttribute("position", new THREE.BufferAttribute(pPos, 3)); pg.setAttribute("ph", new THREE.BufferAttribute(pPh, 1)); pg.setAttribute("kind", new THREE.BufferAttribute(pKind, 1)); pg.setAttribute("born", new THREE.BufferAttribute(pBorn, 1));
    const pulseMat = new THREE.ShaderMaterial({ transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, uniforms: { uT: { value: 0 }, uSize: { value: 20 }, uAcc: { value: new THREE.Vector3(...accent()) }, uLight: { value: 0 } }, vertexShader: pulseVS, fragmentShader: pulseFS });
    // a new accent (avatar menu): the light follows it
    // Light or dark: the clear colour, the ball, the land, the glow and the lights follow the theme (and the accent)
    const blend = (m, light) => { const b = light ? THREE.NormalBlending : THREE.AdditiveBlending; if (m.blending !== b) { m.blending = b; m.needsUpdate = true; } };
    function theme() {
      const light = isLight(), a = accent();
      pulseMat.uniforms.uAcc.value.set(...a); atm.material.uniforms.uAcc.value.set(...a);
      [dotMat.uniforms, atm.material.uniforms, pulseMat.uniforms].forEach((u) => { u.uLight.value = light ? 1 : 0; });
      [dotMat, atm.material, pulseMat].concat(arcs.map((x) => x.mat)).forEach((m) => blend(m, light));
      stars.visible = !light;
      if (light) {
        const paper = cssRGB("--paper", "#ffffff"), ink = cssRGB("--fg", "#14161a");
        dotMat.uniforms.uInk.value.set(...ink);
        ball.material.color.setRGB(paper[0] * 0.955 + ink[0] * 0.045, paper[1] * 0.955 + ink[1] * 0.045, paper[2] * 0.955 + ink[2] * 0.045);
        renderer.setClearColor(new THREE.Color(paper[0], paper[1], paper[2]), 1);
      } else { ball.material.color.setHex(0x030304); renderer.setClearColor(0x000000, 1); }
    }
    S.theme = theme;
    new MutationObserver(() => { theme(); if (active() === S) S.renderOnce(); }).observe(document.documentElement, { attributes: true, attributeFilter: ["style", "data-theme"] });
    const pulses = new THREE.Points(pg, pulseMat); pulses.frustumCulled = false; pulses.renderOrder = 4; spin.add(pulses);
    const HOMEP = ll(HOME.lat, HOME.lon, 1.004);
    let bursts = [], clock = 0, crowd = [];
    function writePulses() {
      let k = 0;
      const put = (p, ph, kind, born) => { if (k >= MAXP) return; pPos.set(p, k * 3); pPh[k] = ph; pKind[k] = kind; pBorn[k] = born; k++; };
      put(HOMEP, 0, 2, 0);
      bursts = bursts.filter((b) => clock - b.born < 1.6);
      bursts.forEach((b) => put(b.p, 0, b.kind, b.born));
      crowd.forEach((v) => put(v.p, v.ph, 0, v.born));
      pg.setDrawRange(0, k);
      ["position", "ph", "kind", "born"].forEach((a) => { pg.attributes[a].needsUpdate = true; });
    }
    S.syncSpots = function () { if (active() === S) { if (wantRun()) kick(); else S.renderOnce(); } };
    S.syncVisitors = function () {
      const old = {}; crowd.forEach((v) => { old[v.lat.toFixed(3) + "," + v.lon.toFixed(3)] = v; });
      crowd = people().map((v) => { const o = old[v.lat.toFixed(3) + "," + v.lon.toFixed(3)]; return o || Object.assign(v, { p: ll(v.lat, v.lon, 1.004), born: clock }); });
      writePulses(); if (active() === S) { if (wantRun()) kick(); else S.renderOnce(); }
    };

    // a payment: a gold arc from the buyer's country to the base
    const arcVS = "varying float vU; void main(){ vU=uv.x; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0); }";
    const arcFS = "uniform float uH; uniform vec3 uAcc; uniform float uLight; varying float vU; void main(){ float tail=uH-0.38; float a=smoothstep(tail,uH,vU)*step(vU,uH); float head=smoothstep(uH-0.04,uH,vU)*step(vU,uH); if(uLight>0.5){ gl_FragColor=vec4(mix(uAcc,uAcc*0.6,head),min(1.0,a*0.9+head)); return; } vec3 c=mix(uAcc,vec3(1.0),head*0.8); a=a*0.9+head*1.6; gl_FragColor=vec4(c*a,a); }";
    const arcs = [];
    function addArc(e) {
      const w = where(e.cc), Sv = new THREE.Vector3(...ll(w[0], w[1], 1.003)), E = new THREE.Vector3(...HOMEP);
      const ang = Sv.angleTo(E), mid = Sv.clone().add(E).normalize().multiplyScalar(1 + ang * 0.42);
      const geo = new THREE.TubeGeometry(new THREE.QuadraticBezierCurve3(Sv, mid, E), phone ? 48 : 80, 0.0065, 5, false);
      const mat = new THREE.ShaderMaterial({ transparent: true, depthWrite: false, blending: isLight() ? THREE.NormalBlending : THREE.AdditiveBlending, uniforms: { uH: { value: 0 }, uAcc: pulseMat.uniforms.uAcc, uLight: pulseMat.uniforms.uLight }, vertexShader: arcVS, fragmentShader: arcFS });
      const m = new THREE.Mesh(geo, mat); m.renderOrder = 5; spin.add(m);
      bursts.push({ p: Sv.toArray(), born: clock, kind: 1 }); writePulses();
      arcs.push({ m, geo, mat, t: 0, dur: 1.5 + ang * 0.25, e, landed: false });
    }
    // the amount appears at the base when the arc lands
    const labels = [];
    function addLabel(e) {
      if (!G.labels || !e.label) return;
      const el = document.createElement("div"); el.className = "glabel";
      el.innerHTML = (e.icon ? '<img src="' + e.icon + '" alt="">' : "") + "<span></span>"; el.lastChild.textContent = e.label;
      G.labels.appendChild(el); labels.push({ e: el, born: clock });
    }
    const v3 = new THREE.Vector3(), v4 = new THREE.Vector3(), v5 = new THREE.Vector3();
    function placeLabels() {
      if (!labels.length || !Lw) return;
      v3.set(...HOMEP).applyMatrix4(spin.matrixWorld);
      const facing = v4.copy(v3).sub(root.position).normalize().dot(v5.copy(camera.position).sub(v3).normalize());
      v3.project(camera);
      const x = (v3.x * 0.5 + 0.5) * Lw.W, y = (-v3.y * 0.5 + 0.5) * Lw.H;
      for (let i = labels.length - 1; i >= 0; i--) {
        const l = labels[i], age = clock - l.born;
        if (age > 2.6) { l.e.remove(); labels.splice(i, 1); continue; }
        l.e.style.opacity = (Math.min(1, age * 4) * Math.min(1, (2.6 - age) * 2) * (facing > 0 ? 1 : 0.25)).toFixed(2);
        const w = l.w || (l.w = l.e.offsetWidth), lx = x + 16 + w > Lw.W - 16 ? x - 16 - w : x + 16, idx = labels.length - 1 - i;
        l.e.style.transform = "translate(" + Math.max(16, lx).toFixed(1) + "px," + (y - 16 - age * 12 - idx * 40).toFixed(1) + "px)";
      }
    }

    let Lw = null, wpp = 1, baseR = 1; const basePos = new THREE.Vector3();
    S.layout = function () {
      if (!S.host || !S.host.isConnected || active() !== S) return;
      Lw = G.layout();
      renderer.setPixelRatio(S.st.dpr); renderer.setSize(Lw.W, Lw.H, false);
      camera.aspect = Lw.W / Lw.H; camera.updateProjectionMatrix();
      wpp = (2 * Math.tan((camera.fov * Math.PI) / 360) * CAMZ) / Lw.H;
      baseR = Lw.R * wpp;
      basePos.set((Lw.cx - Lw.W / 2) * wpp, -(Lw.cy - Lw.H / 2) * wpp, 0);
      dotMat.uniforms.uSize.value = Math.max(1.6, Math.min(3, Lw.R * (phone ? 0.0105 : 0.0082))) * S.st.dpr;
      pulseMat.uniforms.uSize.value = Math.max(18, Lw.R * 0.085) * S.st.dpr;
      starMat.uniforms.uPx.value = S.st.dpr * 1.3;
    };
    new ResizeObserver(() => { if (active() === S) { S.layout(); S.renderOnce(); } }).observe(document.documentElement);

    // drag to spin, the pointer leans it
    const ptr = { x: 0, y: 0, cx: 0, cy: 0 };
    let spinY = -1.13, vel = 0, drag = null, lastInput = 0, lastDrag = -1e9, tiltB = 0.42, turning = false, lastCycle = 0;
    addEventListener("pointermove", (e) => {
      if (active() !== S) return;
      if (e.pointerType === "mouse") { ptr.x = (e.clientX / innerWidth) * 2 - 1; ptr.y = (e.clientY / innerHeight) * 2 - 1; lastInput = performance.now(); kick(); }
      if (drag) { const dx = e.clientX - drag.x; drag.x = e.clientX; vel = dx * 0.006; spinY += vel; lastInput = lastDrag = performance.now(); kick(); }
    }, { passive: true });
    GL.canvas.addEventListener("pointerdown", (e) => { if (active() === S) { drag = { x: e.clientX }; vel = 0; } });
    addEventListener("pointerup", () => { drag = null; });
    addEventListener("pointercancel", () => { drag = null; });

    let enterT = 0;
    const ease = (x) => 1 - Math.pow(1 - clamp(x, 0, 1), 3);
    S.busy = (now) => now - lastInput < 1200 || arcs.length > 0 || bursts.length > 0 || enterT < 1.6 || labels.length > 0 || Math.abs(vel) > 0.0005 || turning;
    S.step = function (dt) {
      clock += dt; S.clockV = clock; enterT += dt;
      ptr.cx += (ptr.x + tilt.x - ptr.cx) * Math.min(1, dt * 2.4); ptr.cy += (ptr.y + tilt.y - ptr.cy) * Math.min(1, dt * 2.4);
      // a live visitor: turn so they are in front (after a drag, the globe is the owner's for 8 s); nobody live: a slow drift
      const nowMs = performance.now();
      if (G.spots.length > 1 && !reduced && clock - lastCycle > 7 && !(M.focus && nowMs < M.hold)) { lastCycle = clock; M.cycle++; }
      const cur = target(nowMs), free = drag || nowMs - lastDrag < 8000;
      turning = false;
      if (!drag) vel *= Math.pow(0.05, dt);
      if (cur && !free) {
        const d = wrap(faceSpin(cur.lon) - spinY), dl = faceTilt(cur.lat) - tiltB, f = reduced ? 1 : Math.min(1, dt * 2.2);
        spinY += d * f; tiltB += dl * f; turning = Math.abs(d) > 0.002 || Math.abs(dl) > 0.002;
      } else if (!drag) { spinY += (reduced || cur ? 0 : 0.055) * dt + vel * (dt * 60) * 0.02; }
      const k = reduced ? 1 : ease(enterT / 1.4);
      root.position.copy(basePos);
      root.scale.setScalar(baseR * (0.86 + 0.14 * k));
      tiltG.rotation.x = tiltB + ptr.cy * 0.12; tiltG.rotation.z = -ptr.cx * 0.04;
      spin.rotation.y = spinY + ptr.cx * 0.25 - (1 - k) * 1.2;
      atm.quaternion.copy(camera.quaternion);
      dotMat.uniforms.uReveal.value = reduced ? 1.25 : -0.3 + 1.6 * ease(enterT / 1.5);
      starMat.uniforms.uT.value = clock; stars.rotation.y = ptr.cx * 0.02 + clock * 0.004; stars.rotation.x = ptr.cy * 0.02;
      pulseMat.uniforms.uT.value = clock;
      for (let i = arcs.length - 1; i >= 0; i--) {
        const a = arcs[i]; a.t += dt / a.dur; a.mat.uniforms.uH.value = a.t * 1.38;
        if (!a.landed && a.t >= 0.725) { a.landed = true; bursts.push({ p: HOMEP, born: clock, kind: 1 }); writePulses(); addLabel(a.e); }
        if (a.t >= 1) { spin.remove(a.m); a.geo.dispose(); a.mat.dispose(); arcs.splice(i, 1); }
      }
      if (bursts.length && clock - bursts[0].born > 1.6) writePulses();
      root.updateMatrixWorld();
      placeLabels();
      if (Lw) placeSpots((lat, lon) => {
        v3.set(...ll(lat, lon, 1.004)).applyMatrix4(spin.matrixWorld);
        const f = v4.copy(v3).sub(root.position).normalize().dot(v5.copy(camera.position).sub(v3).normalize());
        v3.project(camera); return [(v3.x * 0.5 + 0.5) * Lw.W, (-v3.y * 0.5 + 0.5) * Lw.H, f];
      }, Lw.W, Lw.H, cur);
    };
    S.renderOnce = function () { if (!Lw || active() !== S) return; S.step(0); renderer.render(scene, camera); };
    S.enter = function () { theme(); enterT = reduced ? 9 : 0; S.syncVisitors(); kick(); };
    S.event = function (e) {
      if (!where(e.cc)) return;
      if (active() !== S || !wantRun()) return;
      if (e.kind === "p") addArc(e);
      else { const w = where(e.cc); bursts.push({ p: ll(w[0], w[1], 1.004), born: clock, kind: e.kind === "c" ? 4 : 3 }); writePulses(); }
      kick();
    };
    return S;
  }
  return G;
}
