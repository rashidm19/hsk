export const PLAN_MAP: Record<string, { amount: number; months: number; interval: string }> = {
  "1mo": { amount: 39000, months: 1, interval: "1 month" },
  "3mo": { amount: 54000, months: 3, interval: "3 months" },
  "12mo": { amount: 149000, months: 12, interval: "12 months" },
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

export function computeExpiry(paidAtIso: string, months: number): string {
  const d = new Date(paidAtIso);
  if (isNaN(d.getTime())) throw new Error("bad paid_at");
  const day = d.getUTCDate();
  const r = new Date(d);
  r.setUTCDate(1); // shift the month off day 1 so e.g. Jan 31 + 1mo cannot roll into March
  r.setUTCMonth(r.getUTCMonth() + months);
  const daysInTarget = new Date(Date.UTC(r.getUTCFullYear(), r.getUTCMonth() + 1, 0)).getUTCDate();
  r.setUTCDate(Math.min(day, daysInTarget)); // clamp to the target month's last day
  return r.toISOString();
}

export function freshTs(ts: number, nowMs: number, windowSec = 300): boolean {
  return Number.isFinite(ts) && Math.abs(nowMs - ts * 1000) <= windowSec * 1000;
}
