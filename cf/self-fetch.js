// Cererile Workerului spre propriile adrese (mașina de creative cere ofertele și publicarea pe Meta portalului,
// la admin.centrul360.com) nu pleacă pe internet: se rezolvă direct în Worker (globalThis.__C360_ROUTE, din
// cf/worker.js). Pe adresa de test, așa vorbește creative cu portalul de pe Cloudflare, nu cu cel de pe Vercel.
// Primul import din cf/worker.js, ca să fie pus înaintea oricărui alt cod.
// Pentru teste (wrangler dev): cu C360_OFFLINE_TEST = "1", nicio cerere nu pleacă spre Claude, Gemini, Meta /
// WhatsApp sau Resend; primesc un răspuns 400 „test”. În producție variabila nu există.
import { env } from "cloudflare:workers";

const realFetch = globalThis.fetch;
const PAID = /(^|\.)(anthropic\.com|googleapis\.com|facebook\.com|resend\.com|mypos\.com|mypos\.eu)$/;
const SELF = /^(www\.|admin\.|staff\.)?centrul360\.com$/;

globalThis.fetch = function fetch(input, init) {
  try {
    const route = globalThis.__C360_ROUTE;
    if (route) {
      const u = new URL(input instanceof Request ? input.url : String(input));
      if (SELF.test(u.hostname) || u.host === globalThis.__C360_SELF_HOST) return route(new Request(input, init));
    }
    if (env.C360_OFFLINE_TEST === "1") {
      const u = new URL(input instanceof Request ? input.url : String(input));
      if (PAID.test(u.hostname)) return Promise.resolve(Response.json({ error: { type: "invalid_request_error", message: "test offline: fără apeluri reale (" + u.hostname + ")" } }, { status: 400 }));
    }
  } catch (e) { /* o adresă pe care nu o pot citi: merge pe drumul obișnuit */ }
  return realFetch(input, init);
};
