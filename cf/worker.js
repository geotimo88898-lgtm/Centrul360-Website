// Centrul360 pe Cloudflare Workers: site-ul (www), portalul (admin / staff), api/ și mașina de creative (/creative),
// într-un singur Worker. Pe Vercel nu se folosește nimic de aici: vercel.json, middleware.js și api/ rămân sursa.
//  - Fișierele statice: dist/ (cf/build.mjs), cu antetele din vercel.json (_headers).
//  - Redirecturile din vercel.json și middleware.js (portalul ca pagină principală pe admin/staff, fișele doar
//    pentru cine e în portal) rulează aici, neschimbate.
//  - api/*.js rulează neschimbate prin adaptor (cf/node-adapter.js); Vercel Blob e R2 (cf/blob-r2.js).
//  - /creative: aplicația Next a mașinii de creative (OpenNext), construită din repo-ul centrul360-creative-machine
//    (privat) la build; comenzile ei în fundal sunt Cloudflare Workflows (cf/creative-jobs.js).
//  - Orele programate din vercel.json (Cron Triggers), oprite cu CRON_ON = "0" până la mutarea domeniului.
// Adresa de test (*.workers.dev) e implicit site-ul; ?c360host=admin o face portal (cookie), ?c360host=www înapoi.
import "./self-fetch.js";
import { AsyncLocalStorage } from "node:async_hooks";
import { env as ENV } from "cloudflare:workers";
import { runNode, matchRoute } from "./node-adapter.js";
import API from "./api.gen.js";
import { creative, sharp } from "./creative.gen.js";
import migrate from "./migrate.js";
import middleware from "../middleware.js";
import vercel from "../vercel.json";
import { makeBlob } from "./blob-r2.js";
import { makeJobs } from "./creative-jobs.js";
import { loadSecrets } from "./secrets.js";
const SHARED = ["ANTHROPIC_API_KEY", "GEMINI_API_KEY"];

const als = new AsyncLocalStorage();

// ce folosește mașina de creative din build-ul ei Next (module mici care cheamă globalele astea)
globalThis.__C360_CREATIVE_BLOB = makeBlob(() => ENV.CREATIVE_BLOB);
globalThis.__C360_SHARP = sharp || null;
globalThis.__C360_JOBS = {
  async start(job, args) {
    if (!job) throw new Error("Comandă necunoscută.");
    if (!ENV.CREATIVE_JOBS) throw new Error("Comenzile în fundal (Workflows) nu sunt legate de Worker.");
    const inst = await ENV.CREATIVE_JOBS.create({ params: { job, args } });
    return { runId: inst.id };
  }
};

// contextul de cerere al Vercel (@vercel/functions): jurnalul de activitate și portal-pulse lucrează după răspuns cu el
globalThis[Symbol.for("@vercel/request-context")] = {
  get() { const s = als.getStore(); return s && s.ctx ? { waitUntil: (p) => s.ctx.waitUntil(p), headers: {} } : {}; }
};

const TEST_COOKIE = "c360_test_host";

// redirecturile din vercel.json (căi fixe, cu condiție pe host)
const REDIRECTS = (vercel.redirects || []).map((r) => ({
  re: new RegExp("^" + r.source.replace(/[.]/g, "\\.").replace(/:path\*$/, "(.*)") + "$"),
  host: ((r.has || []).find((h) => h.type === "host") || {}).value,
  to: r.destination, code: r.permanent ? 308 : 307
}));

function cookie(request, name) {
  const c = (request.headers.get("cookie") || "").split(";").map((x) => x.trim()).find((x) => x.startsWith(name + "="));
  return c ? decodeURIComponent(c.slice(name.length + 1)) : "";
}
// hostul după care se aleg paginile: cel real pe domenii; pe adresa de test, cel ales cu ?c360host=
function siteHost(request, url) {
  const h = url.hostname;
  if (/centrul360\.com$/.test(h)) return h;
  return cookie(request, TEST_COOKIE) === "admin" ? "admin.centrul360.com" : "www.centrul360.com";
}

function internalToken() {
  if (!globalThis.__C360_INTERNAL) globalThis.__C360_INTERNAL = crypto.randomUUID() + crypto.randomUUID();
  return globalThis.__C360_INTERNAL;
}

async function route(request, env, ctx) {
  internalToken();
  const url = new URL(request.url);
  const p = url.pathname;

  // adresa de test: comută între site și portal
  const sw = url.searchParams.get("c360host");
  if (sw === "admin" || sw === "www") {
    url.searchParams.delete("c360host");
    return new Response(null, { status: 302, headers: { Location: url.pathname + url.search, "Set-Cookie": TEST_COOKIE + "=" + sw + "; Path=/; Secure; SameSite=Lax; Max-Age=2592000" } });
  }
  const host = siteHost(request, url);
  // un antet intern nu vine niciodată din afară
  if (request.headers.has("x-c360-internal") && !ctx.__internal) {
    const h = new Headers(request.headers); h.delete("x-c360-internal");
    request = new Request(request, { headers: h });
  }

  if (p === "/__c360/migrate") return runNode(migrate, request, ctx, { noCache: true });

  for (const r of REDIRECTS) {
    if (r.host && r.host !== host) continue;
    const m = p.match(r.re);
    if (m) return new Response(null, { status: r.code, headers: { Location: r.to.replace(":path*", m[1] || "") } });
  }

  if (p === "/creative" || p.startsWith("/creative/")) {
    if (!creative) return new Response("Mașina de creative nu e inclusă în acest build (lipsește CREATIVE_REPO_TOKEN la build).", { status: 503, headers: { "content-type": "text/plain; charset=utf-8" } });
    // fișierele statice ale aplicației Next (/creative/_next/…, logo-uri) sunt în dist/, ca la OpenNext
    if ((request.method === "GET" || request.method === "HEAD") && (p.startsWith("/creative/_next/") || /\.[a-z0-9]{2,5}$/i.test(p))) {
      const a = await env.ASSETS.fetch(request);
      if (a.status !== 404) return a;
    }
    return creative.fetch(request, env, ctx);
  }

  if (p.startsWith("/api/")) {
    const fn = API[p.slice(5).replace(/\/$/, "")];
    return fn ? runNode(fn, request, ctx) : new Response("Not found", { status: 404 });
  }

  // middleware.js de la Vercel, neschimbat (portalul pe admin/staff, fișele doar cu sesiune)
  if (p === "/" || p === "/login" || p.startsWith("/fise/") || p.startsWith("/academy-fisa/")) {
    const asHost = new URL(url); asHost.hostname = host; asHost.protocol = "https:"; asHost.port = "";
    const r = await middleware(new Request(asHost, request));
    if (r) {
      const to = r.headers.get("x-middleware-rewrite");
      if (!to) return r;
      const t = new URL(to);
      return env.ASSETS.fetch(new Request(new URL(t.pathname + url.search, url), request));
    }
  }
  return env.ASSETS.fetch(request);
}

// cererile spre propriile adrese (creative → portal) se rezolvă aici, fără să iasă din Worker
globalThis.__C360_ROUTE = (request) => {
  const store = als.getStore();
  const ctx = { __internal: true, waitUntil: (p) => (store && store.ctx ? store.ctx.waitUntil(p) : p), passThroughOnException() {} };
  return route(request, ENV, ctx);
};

export default {
  async fetch(request, env, ctx) {
    globalThis.__C360_SELF_HOST = new URL(request.url).host;
    await loadSecrets(env, SHARED);
    return als.run({ ctx }, () => route(request, env, ctx));
  },
  // aceleași ore ca în vercel.json (UTC): 05:00 producția automată de creative, 06:00 automatizările, 19:00 raportul
  async scheduled(event, env, ctx) {
    if (env.CRON_ON !== "1") return console.log("cron oprit (CRON_ON):", event.cron);
    await loadSecrets(env, SHARED);
    const hour = new Date(event.scheduledTime).getUTCHours();
    const path = hour === 5 ? "/creative/api/cron/auto" : hour === 6 ? "/api/automation-tick" : hour === 19 ? "/api/daily-report" : "";
    if (!path) return console.log("cron fără lucru la ora", hour);
    if (path.startsWith("/creative") && !creative) return console.log("cron: mașina de creative nu e în build");
    const req = new Request("https://admin.centrul360.com" + path, { headers: { authorization: "Bearer " + (env.CRON_SECRET || ""), "user-agent": "vercel-cron/1.0" } });
    const r = await als.run({ ctx }, () => route(req, env, ctx));
    console.log("cron", path, r.status);
  }
};

export const CreativeJobs = makeJobs(() => creative);
