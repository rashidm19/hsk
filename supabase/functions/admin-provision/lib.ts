// Helpers for the admin-provision function. Mirrors grant-entitlement/lib.ts where possible
// (PLAN_MAP, timingSafeEqual) and adds CORS + a readable password generator.

// Kept in sync with grant-entitlement/lib.ts and data/onboarding.json. Comps always use
// amount 0 (see index.ts); `months` is the load-bearing field for coverage length.
export const PLAN_MAP: Record<string, { amount: number; months: number }> = {
  "1mo": { amount: 7990, months: 1 },
  "3mo": { amount: 13990, months: 3 },
  "12mo": { amount: 19990, months: 12 },
};

export function derivePlan(plan: string) {
  return PLAN_MAP[plan] ?? null;
}

// Constant-time string compare (identical to grant-entitlement/lib.ts).
export function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let out = 0;
  for (let i = 0; i < a.length; i++) out |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return out === 0;
}

// CORS allowlist. Reflect only exact-match origins; otherwise omit the ACAO header so the
// browser blocks the response. CORS is defense-in-depth — the shared secret is the real gate.
const ALLOWED_ORIGINS = new Set([
  "https://www.hskprep.cc",
  "https://hskprep.cc",
  "http://localhost:8080",
  "http://127.0.0.1:8080",
]);

export function corsHeaders(origin: string | null): Record<string, string> {
  const h: Record<string, string> = {
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "content-type, x-hsk-admin-secret",
    "Access-Control-Max-Age": "86400",
    "Vary": "Origin",
  };
  if (origin && ALLOWED_ORIGINS.has(origin)) h["Access-Control-Allow-Origin"] = origin;
  return h;
}

// Readable password: 4 groups of 4 chars from an unambiguous alphabet, dash-joined.
// No 0/O/1/l/I. Uses crypto.getRandomValues (Web Crypto). e.g. "Kf7q-Rp2m-Xt9d-Vb4h".
const PW_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789abcdefghijkmnpqrstuvwxyz";
export function generatePassword(): string {
  const buf = new Uint32Array(16);
  crypto.getRandomValues(buf);
  const groups: string[] = [];
  let i = 0;
  for (let g = 0; g < 4; g++) {
    let s = "";
    for (let c = 0; c < 4; c++) s += PW_ALPHABET[buf[i++] % PW_ALPHABET.length];
    groups.push(s);
  }
  return groups.join("-");
}

export function uuid(): string {
  return crypto.randomUUID();
}
