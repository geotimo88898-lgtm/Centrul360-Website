// Comenzile în fundal ale mașinii de creative pe Cloudflare (Cloudflare Workflows), în locul lui Vercel Workflow.
// Aceeași ordine ca src/workflows/produce.ts din repo-ul centrul360-creative-machine (dacă se schimbă acolo, se
// schimbă și aici): fiecare pas („…Step” din src/workflows/steps.ts) e un step.do, deci un lot de 20 de creative
// supraviețuiește unei reporniri și reia de unde a rămas. Pasul în sine rulează în aplicația Next (OpenNext), prin
// /creative/api/health/cf-step, cu un semn care există doar în memoria Workerului.
import { WorkflowEntrypoint } from "cloudflare:workers";
import { NonRetryableError } from "cloudflare:workflows";

const RETRY = { retries: { limit: 3, delay: "30 seconds", backoff: "exponential" }, timeout: "15 minutes" };

function hash(s) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return (h >>> 0).toString(36);
}

export function makeJobs(getCreative) {
  return class CreativeJobs extends WorkflowEntrypoint {
    async run(event, step) {
      const { job, args = [] } = event.payload || {};
      const env = this.env, ctx = this.ctx;
      const seen = new Map();
      // un pas = un step.do cu nume stabil (numele pasului + argumentele + a câta oară e chemat la fel)
      const S = (name, a) => {
        const base = name + ":" + hash(JSON.stringify(a || []));
        const n = (seen.get(base) || 0) + 1;
        seen.set(base, n);
        return step.do(base + "#" + n, RETRY, async () => {
          const creative = getCreative();
          if (!creative) throw new NonRetryableError("Mașina de creative nu e construită în acest Worker.");
          const res = await creative.fetch(new Request("https://internal.c360/creative/api/health/cf-step", {
            method: "POST",
            headers: { "content-type": "application/json", "x-c360-internal": globalThis.__C360_INTERNAL },
            body: JSON.stringify({ name, args: a || [] })
          }), env, ctx);
          const j = await res.json().catch(() => ({ ok: false, error: "Răspuns invalid de la pasul " + name + " (" + res.status + ")" }));
          if (j.ok) return j.result;
          if (j.fatal) throw new NonRetryableError(j.error);
          throw new Error(j.error);
        });
      };
      const msg = (e) => (e && e.message) || String(e);
      const setStatus = (id, status, error) => S("setCreativeStatus", [id, status, error]);

      async function qaLoop(id, maxFixRounds) {
        for (let round = 0; ; round++) {
          const verdict = await S("qaStep", [id]);
          if (verdict === "PASS" || verdict === "REJECT") return;
          if (round >= maxFixRounds) { await S("finishAfterRounds", [id]); return; }
          const instruction = await S("lastFixInstruction", [id]);
          await S("renderStep", [id, verdict === "FIX" ? "fix" : "regen", instruction]);
        }
      }
      async function produceCreative(id, maxFixRounds) {
        try {
          await S("artStep", [id]);
          await S("renderStep", [id, "gen", ""]);
          await qaLoop(id, maxFixRounds);
        } catch (e) { await setStatus(id, "failed", msg(e)); }
      }

      if (job === "produceRequest") {
        const [requestId, maxFixRounds, parallel] = args;
        try {
          const ids = await S("planStep", [requestId]);
          await S("copyStep", [requestId, ids]);
          const p = Math.max(1, Number(parallel) || 1);
          for (let i = 0; i < ids.length; i += p) await Promise.all(ids.slice(i, i + p).map((id) => produceCreative(id, maxFixRounds)));
          await S("finishRequest", [requestId]);
        } catch (e) { await S("finishRequest", [requestId, msg(e)]); }
        return;
      }
      if (job === "reworkCreative") {
        const [id, mode, instruction, maxFixRounds] = args;
        try {
          if (mode === "regen" && !instruction) await S("artStep", [id]);
          await S("renderStep", [id, mode, instruction]);
          await qaLoop(id, maxFixRounds);
        } catch (e) { await setStatus(id, "failed", msg(e)); }
        return;
      }
      if (job === "produceVideo") {
        const [videoId] = args;
        try { await S("videoStep", [videoId]); } catch (e) { await S("failVideo", [videoId, msg(e)]); }
        return;
      }
      if (job === "convertCreative") {
        const [id] = args;
        try {
          await S("convertCopyStep", [id]);
          for (let attempt = 0; attempt < 2; attempt++) if (await S("convertImageStep", [id, attempt])) return;
          await setStatus(id, "rejected", "Orașul nu s-a schimbat curat din 2 încercări. Vezi versiunile: poate una e totuși bună.");
        } catch (e) { await setStatus(id, "failed", msg(e)); }
        return;
      }
      if (job === "learnReferences") {
        try {
          for (let i = 0; i < 100; i++) {
            const r = await S("readNextStep", []);
            if (!r || r.left <= 0 || !r.read) break;
          }
          await S("rewriteLearnedStep", []);
        } catch (e) { console.error("learn:", msg(e)); }
        await S("learnDoneStep", []);
        return;
      }
      throw new NonRetryableError("Comandă necunoscută: " + job);
    }
  };
}
