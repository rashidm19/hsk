export const PLAN_MAP: Record<string, { amount: number; months: number }> = {
  "1mo": { amount: 39000, months: 1 },
  "3mo": { amount: 54000, months: 3 },
  "12mo": { amount: 149000, months: 12 },
};

export function derivePlan(plan: string) {
  return PLAN_MAP[plan] ?? null;
}

export async function hmacHex(secret: string, body: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(body));
  return [...new Uint8Array(sig)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

export function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let out = 0;
  for (let i = 0; i < a.length; i++) out |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return out === 0;
}

export async function verifySig(secret: string, body: string, sigHex: string): Promise<boolean> {
  if (!sigHex) return false;
  const expected = await hmacHex(secret, body);
  return timingSafeEqual(expected, sigHex.toLowerCase());
}

// Expiry is no longer computed here: apply_hsk_entitlement() (schema.sql) folds the whole
// payments ledger in SQL, where Postgres month-addition has the same month-end clamp the old
// computeExpiry() had (Jan 31 + 1 month = Feb 28/29). One authority — no TS/SQL drift.

export function freshTs(ts: number, nowMs: number, windowSec = 300): boolean {
  return Number.isFinite(ts) && Math.abs(nowMs - ts * 1000) <= windowSec * 1000;
}
