// Un pas din comenzile mașinii de creative, chemat doar din interiorul Workerului (cf/creative-jobs.js), cu un
// semn care există doar în memoria lui (globalThis.__C360_INTERNAL). Din afară: 404. Copiat la build în
// src/app/api/health/cf-step/route.ts (ruta e în afara verificării de cont din middleware, ca /api/health).
import * as steps from "@/workflows/steps";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const token = (globalThis as { __C360_INTERNAL?: string }).__C360_INTERNAL;
  if (!token || req.headers.get("x-c360-internal") !== token) return new Response("Not found", { status: 404 });
  const { name, args } = (await req.json()) as { name: string; args: unknown[] };
  const fn = (steps as unknown as Record<string, (...a: unknown[]) => Promise<unknown>>)[name];
  if (typeof fn !== "function") return Response.json({ ok: false, error: "Pas necunoscut: " + name, fatal: true });
  try {
    const result = await fn(...(Array.isArray(args) ? args : []));
    return Response.json({ ok: true, result: result === undefined ? null : result });
  } catch (e) {
    const err = e as { name?: string; message?: string; fatal?: boolean; retryAfter?: number };
    return Response.json({ ok: false, error: err?.message || String(e), fatal: err?.name === "FatalError" || !!err?.fatal, retryAfter: err?.retryAfter || 0 });
  }
}
