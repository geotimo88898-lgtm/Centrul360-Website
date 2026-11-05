// În locul lui src/workflows/produce.ts pe Cloudflare: doar numele comenzilor. Pașii lor rulează în
// cf/creative-jobs.js (Cloudflare Workflows), care cheamă fiecare pas prin /creative/api/health/cf-step.
const job = (name) => Object.assign(async () => { throw new Error("Se pornește cu start()."); }, { __job: name });
export const produceRequest = job("produceRequest");
export const reworkCreative = job("reworkCreative");
export const produceVideo = job("produceVideo");
export const convertCreative = job("convertCreative");
export const learnReferences = job("learnReferences");
