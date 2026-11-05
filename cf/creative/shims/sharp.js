// sharp pe Cloudflare: implementarea e în Workerul principal (cf/sharp-photon.js), înregistrată ca globalThis.__C360_SHARP.
export default function sharp(...args) {
  const f = globalThis.__C360_SHARP;
  if (!f) throw new Error("Prelucrarea imaginilor nu e pornită pe acest server.");
  return f(...args);
}
