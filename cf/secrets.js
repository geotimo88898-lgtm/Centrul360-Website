// Cheile comune din Cloudflare Secrets Store (aceleași ca la SummitLane: ANTHROPIC_API_KEY, GEMINI_API_KEY).
// O legătură Secrets Store e un obiect cu .get() asincron; codul din api/ citește process.env sincron, deci le copiem
// în process.env la începutul cererii (o dată la 5 minute). O cheie pusă direct pe Worker are prioritate.
import process from "node:process";
const TTL = 5 * 60 * 1000;
let at = 0, pending = null;
export function loadSecrets(env, names) {
  if (Date.now() - at < TTL) return Promise.resolve();
  if (!pending) {
    pending = Promise.all(names.map(async (n) => {
      const b = env[n];
      if (!b || typeof b.get !== "function") return;
      try { const v = await b.get(); if (v) process.env[n] = v; }
      catch (e) { console.error("secrets store: " + n + " " + ((e && e.message) || e)); }
    })).then(() => { at = Date.now(); }).finally(() => { pending = null; });
  }
  return pending;
}
