// start() din `workflow/api` pe Cloudflare: pornește o instanță Cloudflare Workflows (cf/creative-jobs.js).
export async function start(fn, args) {
  const jobs = globalThis.__C360_JOBS;
  if (!jobs) throw new Error("Comenzile în fundal nu sunt pornite pe acest server.");
  return jobs.start(fn && fn.__job, args || []);
}
