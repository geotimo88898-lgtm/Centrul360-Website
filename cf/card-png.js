// SVG → PNG on Cloudflare (the Card de Sărbători sent on WhatsApp, api/_lib/card-image.js): resvg as WebAssembly, the
// module given to the Worker by wrangler (a .wasm import is a compiled module). Registered as globalThis.__C360_SVG2PNG.
import { initWasm, Resvg } from "@resvg/resvg-wasm";
import wasm from "@resvg/resvg-wasm/index_bg.wasm";

let ready = null;
export async function svgToPng(svg, fontBuffers) {
  if (!ready) ready = initWasm(wasm).catch((e) => { ready = null; throw e; });
  await ready;
  const r = new Resvg(svg, { font: { fontBuffers: fontBuffers || [], defaultFontFamily: "Inter", loadSystemFonts: false }, fitTo: { mode: "original" } });
  const img = r.render();
  const out = img.asPng();
  img.free(); r.free();
  return out;
}
