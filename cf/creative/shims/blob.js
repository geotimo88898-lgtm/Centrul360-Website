// @vercel/blob pe Cloudflare: bucket-ul R2 al mașinii de creative, din Workerul principal (globalThis.__C360_CREATIVE_BLOB).
const B = () => {
  const b = globalThis.__C360_CREATIVE_BLOB;
  if (!b) throw new Error("Stocarea R2 a creativelor nu e legată.");
  return b;
};
export const put = (...a) => B().put(...a);
export const get = (...a) => B().get(...a);
export const head = (...a) => B().head(...a);
export const del = (...a) => B().del(...a);
export const list = (...a) => B().list(...a);
