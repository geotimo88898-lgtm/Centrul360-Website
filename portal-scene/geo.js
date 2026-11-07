// Portat din adminul Summitlane (admin/assets/scene/geo.js). Centrul360: locuri și ca „@lat,lon”, HOME = clinica.
// The world as dots (land.json: a Fibonacci sphere of 36000 points, the indexes that fall on land, from Natural Earth 110m)
// and where each country is. The admin knows a visitor's or a buyer's country (Cloudflare, the card), never the city:
// a country is drawn at its middle, the people in it spread a little around it, always on the same spots.
export const D2R = Math.PI / 180;
export const ll = (lat, lon, r = 1) => [r * Math.cos(lat * D2R) * Math.cos(lon * D2R), r * Math.sin(lat * D2R), -r * Math.cos(lat * D2R) * Math.sin(lon * D2R)];

let LAND = null, landP = null;
export function loadLand() {
  if (landP) return landP;
  landP = fetch("/portal-scene/land.json").then((r) => r.json()).then((j) => {
    const raw = atob(j.idx), N = j.n, n = raw.length / 2, ga = Math.PI * (3 - Math.sqrt(5)), out = new Float32Array(n * 2);
    for (let k = 0; k < n; k++) {
      const i = raw.charCodeAt(k * 2) | (raw.charCodeAt(k * 2 + 1) << 8);
      const y = 1 - ((i + 0.5) / N) * 2; let lon = ((i * ga) % (2 * Math.PI)) / D2R; if (lon > 180) lon -= 360;
      out[k * 2] = Math.asin(y) / D2R; out[k * 2 + 1] = lon;
    }
    return (LAND = out);
  });
  return landP;
}
export const landLatLon = () => LAND;
export function landXYZ() {
  const L = LAND, n = L.length / 2, out = new Float32Array(n * 3);
  for (let k = 0; k < n; k++) { const p = ll(L[k * 2], L[k * 2 + 1]); out[k * 3] = p[0]; out[k * 3 + 1] = p[1]; out[k * 3 + 2] = p[2]; }
  return out;
}

// the middle of each country (where most people live, for the big ones), ISO 3166 alpha-2
export const CC = {
  CA: [45.8, -79.5], US: [38.5, -92.5], GB: [52.8, -1.6], UK: [52.8, -1.6], IE: [53.2, -7.7], AU: [-31.5, 146.5], NZ: [-39.5, 175.2], RO: [45.9, 24.9],
  DE: [51.1, 10.4], FR: [46.6, 2.4], ES: [40.2, -3.6], PT: [39.6, -8.1], IT: [42.8, 12.6], NL: [52.2, 5.5], BE: [50.6, 4.6], LU: [49.8, 6.1], CH: [46.8, 8.2], AT: [47.6, 14.1],
  DK: [56.0, 10.0], SE: [59.3, 15.5], NO: [60.5, 9.5], FI: [61.9, 25.7], IS: [64.9, -18.6], PL: [52.1, 19.4], CZ: [49.8, 15.5], SK: [48.7, 19.7], HU: [47.2, 19.4],
  SI: [46.1, 14.8], HR: [45.3, 15.8], RS: [44.0, 20.8], BG: [42.7, 25.3], GR: [39.1, 22.0], MD: [47.2, 28.5], UA: [49.0, 31.4], LT: [55.3, 23.9], LV: [56.9, 24.6], EE: [58.6, 25.0],
  TR: [39.0, 35.2], CY: [35.1, 33.4], MT: [35.9, 14.4], IL: [31.4, 34.9], AE: [24.4, 54.4], SA: [24.0, 45.0], QA: [25.3, 51.2], EG: [27.5, 30.8], MA: [32.0, -6.4], ZA: [-28.5, 25.0],
  NG: [8.7, 7.9], KE: [-0.5, 37.6], IN: [22.0, 78.5], PK: [30.0, 70.0], SG: [1.35, 103.8], MY: [3.8, 102.0], PH: [12.9, 121.8], ID: [-2.5, 113.0], TH: [15.1, 101.0], VN: [16.0, 107.0],
  JP: [36.2, 138.3], KR: [36.4, 127.8], CN: [32.5, 112.0], HK: [22.3, 114.2], TW: [23.7, 121.0], MX: [21.0, -101.5], BR: [-15.0, -48.0], AR: [-34.6, -61.0], CL: [-33.5, -70.7],
  CO: [4.6, -74.1], PE: [-10.0, -76.0], JM: [18.1, -77.3], PR: [18.2, -66.5]
};
// Centrul360: a place can also be given as "@lat,lon" (the visitor's city, as Cloudflare gives it)
export function where(cc) { const s = String(cc || ""); if (s[0] === "@") { const p = s.slice(1).split(",").map(Number); return isFinite(p[0]) && isFinite(p[1]) ? p : null; } return CC[s.toUpperCase()] || null; }
// person i of n in a country: a small spiral around its middle, always the same spot for the same i
export function spot(cc, i) {
  const c = where(cc); if (!c) return null;
  if (!i) return c;
  const a = i * 2.39996, r = 0.7 * Math.sqrt(i);
  return [c[0] + Math.sin(a) * r * 0.7, c[1] + Math.cos(a) * r / Math.max(0.35, Math.cos(c[0] * D2R))];
}
// the owner's base, where the money arcs land
export const HOME = { name: "Timișoara", lat: 45.75, lon: 21.23 }; // Centrul360: set from the data (the clinic's main city) before the globe mounts
