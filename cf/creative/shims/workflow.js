// Erorile din `workflow` (Vercel Workflow), pentru pașii mașinii de creative. Pe Cloudflare: o eroare FatalError
// oprește reîncercările pasului (NonRetryableError în cf/creative-jobs.js), restul se reîncearcă.
export class FatalError extends Error {
  constructor(message) { super(message); this.name = "FatalError"; this.fatal = true; }
}
export class RetryableError extends Error {
  constructor(message, opts) { super(message); this.name = "RetryableError"; this.retryAfter = opts && opts.retryAfter; }
}
