import { createClient } from "npm:@supabase/supabase-js@2";
import { computeExpiry, derivePlan, freshTs, verifySig } from "./lib.ts";

const SECRET = Deno.env.get("HSK_GRANT_HMAC_SECRET") ?? "";
const SB_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SB_SERVICE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

function log(o: Record<string, unknown>) {
  console.log(JSON.stringify({ fn: "grant-entitlement", ...o }));
}
function json(status: number, obj: unknown) {
  return new Response(JSON.stringify(obj), { status, headers: { "content-type": "application/json" } });
}

Deno.serve(async (req) => {
  if (req.method !== "POST") return new Response("method not allowed", { status: 405 });

  const body = await req.text();
  const sig = req.headers.get("x-hsk-signature") ?? "";

  if (!SECRET || !SB_URL || !SB_SERVICE) {
    log({ result: "error", reject: "misconfigured" });
    return new Response("misconfigured", { status: 500 });
  }
  if (!(await verifySig(SECRET, body, sig))) {
    log({ result: "reject", reject: "bad_hmac" });
    return new Response("bad signature", { status: 401 });
  }

  let p: Record<string, unknown>;
  try { p = JSON.parse(body); } catch { return new Response("bad json", { status: 400 }); }

  const plan = derivePlan(String(p.plan ?? ""));
  if (!plan) { log({ order_id: p.order_id, result: "reject", reject: "unknown_plan" }); return new Response("unknown plan", { status: 400 }); }
  if (p.currency !== "KZT") { log({ order_id: p.order_id, result: "reject", reject: "bad_currency" }); return new Response("bad currency", { status: 400 }); }
  if (!freshTs(Number(p.ts), Date.now())) { log({ order_id: p.order_id, result: "reject", reject: "stale" }); return new Response("stale", { status: 400 }); }
  if (!p.uid || !p.order_id || !p.paid_at) return new Response("missing fields", { status: 400 });
  if (isNaN(new Date(String(p.paid_at)).getTime())) {
    // permanent caller error — fail closed with 400 so the acquiring doesn't retry-storm a 500
    log({ order_id: p.order_id, result: "reject", reject: "bad_paid_at" });
    return new Response("bad paid_at", { status: 400 });
  }

  const sb = createClient(SB_URL, SB_SERVICE, { auth: { persistSession: false } });

  // Replay? (webhook retries + operator re-drives). We do NOT early-return: the entitlement is
  // (re-)applied below on every call, so a re-drive reconciles a prior entitlement:false — the old
  // short-circuit skipped the profile write, making a re-POST a no-op that never healed a failed grant.
  const existing = await sb.from("payments").select("order_id").eq("order_id", p.order_id).maybeSingle();
  const isReplay = !!existing.data;

  const expires_at = computeExpiry(String(p.paid_at), plan.months);

  // Audit ledger — write once. On replay the row already exists; tolerate the unique violation.
  if (!isReplay) {
    const ins = await sb.from("payments").insert({
      order_id: p.order_id, user_id: p.uid, plan: p.plan, amount: plan.amount,
      currency: "KZT", status: "paid", receipt: p.receipt ?? null, paid_at: p.paid_at, raw: p,
    });
    if (ins.error && ins.error.code !== "23505") { // 23505 = unique_violation (concurrent retry)
      log({ order_id: p.order_id, result: "error", reject: "payments_insert", msg: ins.error.message });
      return new Response("db error", { status: 500 });
    }
  }

  // Entitlement — (re-)upsert by uid on EVERY call (idempotent: re-setting status:active is a no-op).
  // This covers a missing profiles row AND reconciles a previous entitlement:false on re-drive.
  const subscription = {
    status: "active", plan: p.plan, price: plan.amount, currency: "KZT",
    interval: plan.interval, provider: "studybox", order_id: p.order_id,
    paid_at: p.paid_at, expires_at,
  };
  const up = await sb.from("profiles").upsert({ id: p.uid, subscription }, { onConflict: "id" });
  if (up.error) {
    log({ order_id: p.order_id, uid: p.uid, result: "warn", reject: "profile_upsert", idempotent: isReplay, msg: up.error.message });
    return json(200, { ok: true, idempotent: isReplay, entitlement: false }); // still un-granted; alert + re-drive
  }

  log({ order_id: p.order_id, uid: p.uid, plan: p.plan, amount: plan.amount, hmac_ok: true, idempotent: isReplay, result: "granted" });
  return json(200, { ok: true, idempotent: isReplay });
});
