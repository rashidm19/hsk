// Pure helpers for check-access. Kept out of index.ts so they unit-test without Deno.serve.

// MUST match client auth.js `subActive` (auth.js:471): unparseable expires_at is treated ACTIVE.
export function computeActive(
  sub: { status?: string; expires_at?: string | null } | null,
  now: number,
): boolean {
  if (!sub || sub.status !== "active") return false;
  if (sub.expires_at) {
    const t = Date.parse(sub.expires_at);
    if (Number.isFinite(t) && t <= now) return false; // NaN (unparseable) => stays active
  }
  return true;
}

// Reflect-from-allowlist CORS (same origins as admin-provision/lib.ts). authorization+apikey for the
// browser functions.invoke; content-type for the JSON body. GET+POST+OPTIONS.
const ALLOWED_ORIGINS = new Set([
  "https://www.hskprep.cc",
  "https://hskprep.cc",
  "http://localhost:8080",
  "http://127.0.0.1:8080",
]);

export function corsHeaders(origin: string | null): Record<string, string> {
  const h: Record<string, string> = {
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "authorization, apikey, content-type",
    "Access-Control-Max-Age": "86400",
    "Vary": "Origin",
  };
  if (origin && ALLOWED_ORIGINS.has(origin)) h["Access-Control-Allow-Origin"] = origin;
  return h;
}
