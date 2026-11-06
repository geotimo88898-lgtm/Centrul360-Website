// Build-ul pentru Cloudflare (Workers Builds: comanda de build `node cf/build.mjs`, apoi `npx wrangler deploy`).
// Pe Vercel nu rulează. Face:
//  1. cf/api.gen.js: toate funcțiile din api/ (orice fișier nou din api/ intră singur);
//  2. dist/: fișierele statice ale site-ului și portalului + _headers din vercel.json + încărcarea pe bucăți spre R2
//     (cf/blob-upload-r2.js în locul lui vendor/blob-upload.js);
//  3. mașina de creative: repo-ul privat centrul360-creative-machine, luat din CREATIVE_DIR (o copie locală) sau
//     clonat cu CREATIVE_REPO_TOKEN (variabilă de build, token GitHub doar de citire pe acel repo). Se construiește
//     cu OpenNext într-o copie de lucru (.creative-build/), cu cf/creative/ peste ea; repo-ul lui rămâne neatins.
//     Fără ele: Workerul iese fără /creative (răspunde 503), restul merge.
import { execSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const r = (...p) => path.join(ROOT, ...p);
const sh = (cmd, cwd, extraEnv) => execSync(cmd, { cwd: cwd || ROOT, stdio: "inherit", env: Object.assign({}, process.env, extraEnv || {}) });
const log = (...a) => console.log("[cf-build]", ...a);

// 0. dependențele funcțiilor (pdf-lib, web-push), dacă build-ul nu le-a instalat deja
if (!fs.existsSync(r("node_modules/pdf-lib"))) sh("npm install --no-audit --no-fund");

// 1. api/
const apis = fs.readdirSync(r("api")).filter((f) => f.endsWith(".js")).sort();
fs.writeFileSync(r("cf/api.gen.js"), "// Generat de cf/build.mjs din api/*.js. Nu se editează de mână.\n" +
  apis.map((f, i) => `import a${i} from "../api/${f}";`).join("\n") + "\nexport default {\n" +
  apis.map((f, i) => `  ${JSON.stringify(f.replace(/\.js$/, ""))}: a${i},`).join("\n") + "\n};\n");
log("api:", apis.length, "funcții");
// the version of this build: the portal sees it in /api/portal-pulse and, when it changes, drops its cached files
// (on Vercel this was VERCEL_GIT_COMMIT_SHA; Cloudflare's build gives WORKERS_CI_COMMIT_SHA)
let buildId = process.env.WORKERS_CI_COMMIT_SHA || "";
if (!buildId) { try { buildId = execSync("git rev-parse HEAD", { cwd: ROOT }).toString().trim(); } catch (e) { buildId = ""; } }
buildId = (buildId || "b").slice(0, 12) + "-" + Date.now().toString(36);
fs.writeFileSync(r("cf/build-id.gen.js"), "// Generat de cf/build.mjs.\nexport default " + JSON.stringify(buildId.slice(0, 60)) + ";\n");
log("build:", buildId);

// 2. dist/
const SKIP = new Set(["api", "cf", "node_modules", "dist", ".git", ".github", ".creative", ".creative-build", ".cf-mods", ".wrangler",
  "package.json", "package-lock.json", "vercel.json", "middleware.js", "wrangler.jsonc", ".gitignore", ".assetsignore", ".vercel", ".dev.vars"]);
fs.rmSync(r("dist"), { recursive: true, force: true });
for (const f of fs.readdirSync(ROOT)) if (!SKIP.has(f)) fs.cpSync(r(f), r("dist", f), { recursive: true });
fs.copyFileSync(r("cf/blob-upload-r2.js"), r("dist/vendor/blob-upload.js"));
const vercel = JSON.parse(fs.readFileSync(r("vercel.json"), "utf8"));
const headers = ["# Generat de cf/build.mjs din vercel.json. Nu se editează de mână."];
for (const h of vercel.headers || []) {
  headers.push(h.source.replace("(.*)", "*"));
  for (const x of h.headers) headers.push("  " + x.key + ": " + x.value);
}
fs.writeFileSync(r("dist/_headers"), headers.join("\n") + "\n");
log("dist: gata");

// 3. mașina de creative
fs.rmSync(r(".cf-mods"), { recursive: true, force: true });
fs.mkdirSync(r(".cf-mods"), { recursive: true });
fs.writeFileSync(r(".cf-mods/README.txt"), "Fișiere puse în Worker ca module (citite cu node:fs la /bundle). Generat de cf/build.mjs.\n");
let src = process.env.CREATIVE_DIR || "";
if (!src && fs.existsSync(r(".creative/web/package.json"))) src = r(".creative");
if (!src && process.env.CREATIVE_REPO_TOKEN) {
  log("clonez centrul360-creative-machine");
  fs.rmSync(r(".creative"), { recursive: true, force: true });
  execSync("git clone --depth 1 https://x-access-token:" + process.env.CREATIVE_REPO_TOKEN + "@github.com/geotimo88898-lgtm/centrul360-creative-machine .creative", { cwd: ROOT, stdio: "ignore" });
  src = r(".creative");
}
const stub = 'export const creative = null;\nexport const sharp = null;\n';
if (!src) {
  fs.writeFileSync(r("cf/creative.gen.js"), "// Generat de cf/build.mjs: build fără mașina de creative.\n" + stub);
  log("creative: lipsește (nici CREATIVE_DIR, nici CREATIVE_REPO_TOKEN): /creative răspunde 503");
} else {
  const work = r(".creative-build/web");
  fs.mkdirSync(work, { recursive: true });
  // copia de lucru: sursa repo-ului, fără ce se generează (node_modules rămâne, ca build-urile locale să fie rapide)
  for (const f of fs.readdirSync(work)) if (!["node_modules"].includes(f)) fs.rmSync(path.join(work, f), { recursive: true, force: true });
  for (const f of fs.readdirSync(path.join(src, "web"))) if (![".next", ".open-next", "node_modules", ".data", ".vercel", ".wrangler"].includes(f)) fs.cpSync(path.join(src, "web", f), path.join(work, f), { recursive: true });
  fs.copyFileSync(r("cf/creative/next.config.ts"), path.join(work, "next.config.ts"));
  fs.copyFileSync(r("cf/creative/open-next.config.ts"), path.join(work, "open-next.config.ts"));
  fs.cpSync(r("cf/creative/shims"), path.join(work, "cf-shims"), { recursive: true });
  fs.renameSync(path.join(work, "cf-shims/cf-step-route.ts"), path.join(work, "cf-step-route.ts"));
  fs.mkdirSync(path.join(work, "src/app/api/health/cf-step"), { recursive: true });
  fs.renameSync(path.join(work, "cf-step-route.ts"), path.join(work, "src/app/api/health/cf-step/route.ts"));
  // seed/ se citește din /bundle/seed (modulele Workerului, vezi wrangler.jsonc), nu din folderul de lucru
  const dataTs = path.join(work, "src/lib/data.ts");
  const before = fs.readFileSync(dataTs, "utf8");
  const after = before.replace('const SEED = path.join(process.cwd(), "seed");', 'const SEED = "/bundle/seed";');
  if (after === before) throw new Error("creative: nu găsesc SEED în src/lib/data.ts (s-a schimbat codul?)");
  fs.writeFileSync(dataTs, after);
  // OpenNext cere un wrangler.jsonc; cel adevărat e cel din rădăcina acestui repo
  fs.writeFileSync(path.join(work, "wrangler.jsonc"), JSON.stringify({ name: "centrul360-website", main: ".open-next/worker.js", compatibility_date: "2025-09-01", compatibility_flags: ["nodejs_compat"], assets: { directory: ".open-next/assets", binding: "ASSETS" } }, null, 2));
  const stamp = path.join(work, "node_modules/.c360-installed");
  const pkg = fs.readFileSync(path.join(work, "package.json"), "utf8");
  if (!fs.existsSync(stamp) || fs.readFileSync(stamp, "utf8") !== pkg) {
    log("creative: npm install");
    sh("npm install --no-audit --no-fund --no-package-lock", work);
    // OpenNext 1.20 cere next >= 15.5.29 (aceeași linie 15.5, doar corecturi); Vercel rămâne pe versiunea din package.json
    sh("npm install --no-audit --no-fund --no-save --no-package-lock next@15.5.29 @opennextjs/cloudflare@1.20.16 wrangler@4.158.0", work);
    fs.writeFileSync(stamp, pkg);
  }
  log("creative: OpenNext build");
  sh("npx opennextjs-cloudflare build --skipWranglerConfigCheck", work, { C360_CF: "1", NEXT_TELEMETRY_DISABLED: "1" });
  // fișierele statice ale Next (/creative/_next/…, logo-uri) lângă ale site-ului
  fs.cpSync(path.join(work, ".open-next/assets"), r("dist"), { recursive: true, force: true });
  // seed/ (oferte, cunoștințe, referințe) se citește cu node:fs: intră în Worker ca module, la /bundle/seed
  fs.cpSync(path.join(work, "seed"), r(".cf-mods/seed"), { recursive: true });
  // Photon (sharp pe Cloudflare): doar pentru acest build, fără să schimbe package.json (Vercel nu-l vede)
  try { execSync("node -e \"require.resolve('@cf-wasm/photon/package.json')\"", { cwd: ROOT, stdio: "ignore" }); }
  catch (e) { sh("npm install --no-audit --no-fund --no-save --no-package-lock @cf-wasm/photon@0.4.0"); }
  fs.writeFileSync(r("cf/creative.gen.js"), "// Generat de cf/build.mjs: build cu mașina de creative.\n" +
    'import handler from "../.creative-build/web/.open-next/worker.js";\nimport sharpPhoton from "./sharp-photon.js";\n' +
    "export const creative = handler;\nexport const sharp = sharpPhoton;\n");
  log("creative: gata");
}
