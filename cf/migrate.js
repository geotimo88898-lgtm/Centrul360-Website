// Mutarea fișierelor din Vercel Blob în R2, o singură dată: /__c360/migrate, doar pentru proprietar (contul de admin
// al portalului). Citește din Blob cu tokenurile temporare BLOB_READ_WRITE_TOKEN (store-ul portalului) și
// CREATIVE_BLOB_READ_WRITE_TOKEN (store-ul creativelor), puse de mână în Cloudflare doar pe durata mutării.
// Pe bucăți: o cerere = o pagină din listă (câteva fișiere), cu reluare de la cursor. Se poate rula de oricâte ori:
// un fișier aflat deja în R2 cu aceeași mărime se sare. Răspunsul are doar numere (niciun nume de fișier).
import { env } from "cloudflare:workers";
import auth from "../api/_lib/auth.js";
const { requireAdmin } = auth;

// C360_BLOB_API: doar pentru teste locale (un server care imită API-ul Blob)
const API = env.C360_BLOB_API || "https://vercel.com/api/blob/";
const STORES = {
  site: { token: () => env.BLOB_READ_WRITE_TOKEN, bucket: () => env.BLOB },
  creative: { token: () => env.CREATIVE_BLOB_READ_WRITE_TOKEN, bucket: () => env.CREATIVE_BLOB }
};
const PAGE = 8;

async function batch(store, cursor) {
  const s = STORES[store];
  if (!s) return { error: "store_necunoscut" };
  const token = s.token(), bucket = s.bucket();
  if (!token) return { error: "lipseste_tokenul_blob" };
  if (!bucket) return { error: "lipseste_bucketul_r2" };
  const q = new URLSearchParams({ limit: String(PAGE) });
  if (cursor) q.set("cursor", cursor);
  const r = await fetch(API + "?" + q, { headers: { authorization: "Bearer " + token, "x-api-version": "12" } });
  if (!r.ok) return { error: "blob_list_" + r.status };
  const page = await r.json();
  let copied = 0, skipped = 0, failed = 0, bytes = 0;
  for (const b of page.blobs || []) {
    try {
      const have = await bucket.head(b.pathname);
      if (have && have.size === b.size) { skipped++; continue; }
      const d = await fetch(b.url, { headers: { authorization: "Bearer " + token } });
      if (!d.ok || !d.body) { failed++; continue; }
      const len = Number(d.headers.get("content-length")) || b.size;
      const body = len === b.size ? d.body.pipeThrough(new FixedLengthStream(b.size)) : await d.arrayBuffer();
      await bucket.put(b.pathname, body, { httpMetadata: { contentType: d.headers.get("content-type") || "application/octet-stream" } });
      copied++; bytes += b.size;
    } catch (e) {
      failed++;
      console.error("migrate:", (e && e.message) || e);
    }
  }
  return { copied, skipped, failed, bytes, cursor: page.hasMore ? page.cursor : null, done: !page.hasMore };
}

const PAGE_HTML = `<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Mutare Blob → R2</title><style>body{font:16px system-ui;margin:2rem;max-width:40rem}button{font:inherit;padding:.6rem 1rem;margin:.3rem 0}pre{background:#f4f4f4;padding:1rem}</style>
<h1>Mutare fișiere Vercel Blob → R2</h1><p>Se poate rula de mai multe ori: ce e deja copiat se sare.</p>
<button data-s="site">Portalul (store-ul centrul360-website-private)</button><br><button data-s="creative">Creativele (store-ul centrul360-creatives)</button>
<pre id="o">gata de pornire</pre><script>
const o=document.getElementById('o');
document.querySelectorAll('button').forEach(b=>b.onclick=async()=>{document.querySelectorAll('button').forEach(x=>x.disabled=true);
let cursor=null,t={copied:0,skipped:0,failed:0,bytes:0},n=0;
try{for(;;){const r=await fetch(location.pathname,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({store:b.dataset.s,cursor})});
const j=await r.json();if(j.error)throw new Error(j.error);for(const k in t)t[k]+=j[k]||0;n++;
o.textContent=b.dataset.s+': copiate '+t.copied+', sărite (deja acolo) '+t.skipped+', eșuate '+t.failed+', '+(t.bytes/1048576).toFixed(1)+' MB, pași '+n+(j.done?'\\nGATA.':'');
if(j.done)break;cursor=j.cursor;}}catch(e){o.textContent+='\\nOprit: '+e.message+' (apasă din nou ca să reiei)';}
document.querySelectorAll('button').forEach(x=>x.disabled=false);});
</script>`;

export default async function migrate(req, res) {
  const session = await requireAdmin(req, res);
  if (!session) return;
  res.setHeader("Cache-Control", "no-store");
  if (req.method === "GET") { res.setHeader("Content-Type", "text/html; charset=utf-8"); res.end(PAGE_HTML); return; }
  if (req.method !== "POST") { res.status(405).json({ error: "method_not_allowed" }); return; }
  const b = req.body || {};
  res.status(200).json(await batch(String(b.store || ""), b.cursor ? String(b.cursor) : ""));
}
