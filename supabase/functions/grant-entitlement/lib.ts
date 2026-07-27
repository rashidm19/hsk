export const PLAN_MAP: Record<string, { amount: number; months: number }> = {
  "1mo": { amount: 7990, months: 1 },
  "3mo": { amount: 13990, months: 3 },
  "12mo": { amount: 19990, months: 12 },
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

// A failed entitlement write is NOT a success. 503 puts the acquirer on the documented
// retry-with-backoff path; the retry is safe because the `payments` row is keyed by
// order_id and apply_hsk_entitlement() folds the whole ledger, so re-driving converges on
// the same coverage instead of stacking a second term. JSON (unlike the plain-text gateway
// 500s) so StudyBox can tell this apart from an infrastructure failure.
export const GRANT_FAIL_STATUS = 503;

export function grantFailBody(isReplay: boolean) {
  return { ok: false, idempotent: isReplay, entitlement: false, retry: true, reason: "entitlement_apply" };
}
