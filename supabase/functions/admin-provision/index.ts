// admin-provision — create creator "comp" accounts (auth user + active subscription) and
// list / revoke them. Secret-gated (x-hsk-admin-secret), service-role only. Mirrors the
// grant-entitlement pattern: it inserts a `paid` payments row then calls apply_hsk_entitlement,
// which is the only sanctioned writer of profiles.subscription. No schema change needed.
//
// Deploy with verify_jwt=false — the browser call carries only the shared admin secret, no
// Supabase JWT. Required env: HSK_ADMIN_SECRET (set manually), plus the platform-injected
// SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.
import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders, derivePlan, generatePassword, timingSafeEqual, uuid } from "./lib.ts";

const ADMIN_SECRET = Deno.env.get("HSK_ADMIN_SECRET") ?? "";
const SB_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SB_SERVICE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

function log(o: Record<string, unknown>) {
  console.log(JSON.stringify({ fn: "admin-provision", ...o }));
}
function json(status: number, obj: unknown, cors: Record<string, string>) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { "content-type": "application/json", ...cors },
  });
}

Deno.serve(async (req) => {
  const origin = req.headers.get("origin");
  const cors = corsHeaders(origin);

  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });
  if (req.method !== "POST") return json(405, { error: "method_not_allowed" }, cors);

  if (!ADMIN_SECRET || !SB_URL || !SB_SERVICE) {
    log({ result: "error", reject: "misconfigured" });
    return json(500, { error: "misconfigured" }, cors);
  }

  // Auth: shared secret, timing-safe. Empty/mismatch -> 401. Never log the presented value.
  const presented = req.headers.get("x-hsk-admin-secret") ?? "";
  if (!presented || !timingSafeEqual(presented, ADMIN_SECRET)) {
    log({ result: "reject", reject: "bad_secret" });
    return json(401, { error: "unauthorized" }, cors);
  }

  let body: Record<string, unknown>;
  try { body = await req.json(); } catch { return json(400, { error: "bad_json" }, cors); }

  const action = String(body.action ?? "");
  const sb = createClient(SB_URL, SB_SERVICE, { auth: { persistSession: false } });

  try {
    if (action === "create") return await handleCreate(sb, body, cors);
    if (action === "list") return await handleList(sb, cors);
    if (action === "revoke") return await handleRevoke(sb, body, cors);
    return json(400, { error: "unknown_action" }, cors);
  } catch (e) {
    log({ result: "error", action, reject: "unhandled", msg: String((e as Error).message) });
    return json(500, { error: "internal" }, cors);
  }
});

// ---- create ---------------------------------------------------------------
async function handleCreate(sb: SB, body: Record<string, unknown>, cors: Record<string, string>) {
  const email = String(body.email ?? "").trim().toLowerCase();
  const name = body.name ? String(body.name).trim() : null;
  const planKey = String(body.plan ?? "12mo");
  const plan = derivePlan(planKey);
  if (!email || !email.includes("@")) return json(400, { error: "bad_email" }, cors);
  if (!plan) return json(400, { error: "unknown_plan" }, cors);
  const months = Number.isFinite(Number(body.months)) && Number(body.months) > 0
    ? Math.floor(Number(body.months))
    : plan.months;
  // Passwordless by default (real creators sign in via OTP/Google). A password is
  // only minted for explicit test accounts (fake/undeliverable emails can't do OTP).
  const withPassword = body.with_password === true;

  // Resolve or create the auth user.
  let uid = "";
  let generatedPassword: string | null = null;
  const existing = await findUserByEmail(sb, email);

  if (existing) {
    uid = existing.id;
    if (withPassword && body.reset_password === true) {
      generatedPassword = generatePassword();
      const upd = await sb.auth.admin.updateUserById(uid, {
        password: generatedPassword,
        email_confirm: true,
      });
      if (upd.error) {
        log({ result: "error", reject: "pw_reset", msg: upd.error.message });
        return json(502, { error: "pw_reset_failed" }, cors);
      }
    }
  } else {
    const attrs: Record<string, unknown> = {
      email,
      email_confirm: true,
      user_metadata: name ? { name } : {},
    };
    if (withPassword) {
      generatedPassword = String(body.password ?? "") || generatePassword();
      attrs.password = generatedPassword;
    }
    const created = await sb.auth.admin.createUser(attrs);
    if (created.error) {
      // Race: someone created it between findUser and now. Recover by re-lookup.
      const retry = await findUserByEmail(sb, email);
      if (retry) { uid = retry.id; generatedPassword = null; }
      else {
        log({ result: "error", reject: "create_user", msg: created.error.message });
        return json(502, { error: "create_user_failed", detail: created.error.message }, cors);
      }
    } else {
      uid = created.data.user.id;
    }
  }

  // handle_new_user() inserts the profile on the auth.users insert; guard the rare race so
  // apply_hsk_entitlement's FOR UPDATE lock never runs before the row exists.
  await ensureProfile(sb, uid, email, name);

  // Don't double-comp: if this uid already has a paid comp order, skip inserting a second one
  // (that would stack the term / trip double_charge). Just recompute and return current state.
  const priorComp = await sb.from("payments")
    .select("order_id, status")
    .eq("user_id", uid)
    .like("order_id", "comp-%")
    .order("paid_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  let alreadyComped = false;
  if (priorComp.data && priorComp.data.status === "paid") {
    alreadyComped = true;
  } else {
    const ins = await sb.from("payments").insert({
      order_id: `comp-${uuid()}`,
      user_id: uid,
      plan: planKey,
      amount: 0, // revenue reports exclude by amount=0 OR order_id like 'comp-%'
      currency: "KZT",
      status: "paid",
      months,
      paid_at: new Date().toISOString(),
      raw: { comp: true, reason: "creator", created_by: "admin-panel" },
    });
    if (ins.error && ins.error.code !== "23505") {
      log({ result: "error", reject: "comp_insert", msg: ins.error.message });
      return json(500, { error: "comp_insert_failed" }, cors);
    }
  }

  const grant = await sb.rpc("apply_hsk_entitlement", { p_uid: uid });
  if (grant.error) {
    log({ result: "warn", uid, reject: "entitlement_apply", msg: grant.error.message });
    return json(200, { ok: true, uid, email, plan: planKey, entitlement: false }, cors);
  }
  const g = (grant.data ?? {}) as { expires_at?: string | null };

  log({ result: "created", uid, email, plan: planKey, months, alreadyComped, expires_at: g.expires_at });
  return json(200, {
    ok: true,
    uid,
    email,
    plan: planKey,
    months,
    expires_at: g.expires_at ?? null,
    already_comped: alreadyComped,
    // password only when we actually know it (new user or explicit reset).
    ...(generatedPassword ? { password: generatedPassword } : {}),
  }, cors);
}

// ---- list -----------------------------------------------------------------
async function handleList(sb: SB, cors: Record<string, string>) {
  const pays = await sb.from("payments")
    .select("order_id, user_id, plan, months, status, paid_at, review_status")
    .like("order_id", "comp-%")
    .order("paid_at", { ascending: false });
  if (pays.error) return json(500, { error: "list_failed" }, cors);

  const rowsRaw = (pays.data ?? []) as PaymentRow[];
  const uids = [...new Set(rowsRaw.map((r) => r.user_id))];
  const profs = uids.length
    ? await sb.from("profiles").select("id, email, name, created_at, subscription").in("id", uids)
    : { data: [] as ProfileRow[] };
  const pById = new Map(((profs.data ?? []) as ProfileRow[]).map((p) => [p.id, p]));

  // One row per user (payments already ordered newest-first, so the first seen wins).
  const seen = new Set<string>();
  const rows = rowsRaw.filter((r) => {
    if (seen.has(r.user_id)) return false;
    seen.add(r.user_id);
    return true;
  }).map((r) => {
    const p = pById.get(r.user_id) ?? ({} as ProfileRow);
    const sub = p.subscription ?? null;
    return {
      order_id: r.order_id,
      uid: r.user_id,
      email: p.email ?? null,
      name: p.name ?? null,
      plan: r.plan,
      comp_status: r.status,
      review_status: r.review_status ?? null,
      created_at: p.created_at ?? r.paid_at,
      sub_status: sub?.status ?? null,
      expires_at: sub?.expires_at ?? null,
    };
  });

  return json(200, { ok: true, count: rows.length, rows }, cors);
}

// ---- revoke ---------------------------------------------------------------
async function handleRevoke(sb: SB, body: Record<string, unknown>, cors: Record<string, string>) {
  const uid = String(body.uid ?? "");
  if (!uid) return json(400, { error: "missing_uid" }, cors);
  // Refund the user's comp orders, then recompute. If they also have REAL paid orders,
  // coverage shrinks to those (never below the real ledger) — safe for paying users.
  const upd = await sb.from("payments")
    .update({ status: "refunded", review_status: "refunded" })
    .eq("user_id", uid)
    .like("order_id", "comp-%")
    .eq("status", "paid");
  if (upd.error) return json(500, { error: "revoke_failed" }, cors);

  const grant = await sb.rpc("apply_hsk_entitlement", { p_uid: uid });
  if (grant.error) return json(200, { ok: true, uid, entitlement: "unknown" }, cors);
  const g = (grant.data ?? {}) as { expires_at?: string | null };
  log({ result: "revoked", uid, expires_at: g.expires_at });
  return json(200, { ok: true, uid, expires_at: g.expires_at ?? null }, cors);
}

// ---- helpers --------------------------------------------------------------
// supabase-js admin API has no server-side email filter, so page through listUsers.
// ~10 creators keeps this trivial; cap pages defensively.
async function findUserByEmail(sb: SB, email: string): Promise<{ id: string } | null> {
  const perPage = 200;
  for (let page = 1; page <= 25; page++) {
    const { data, error } = await sb.auth.admin.listUsers({ page, perPage });
    if (error) throw new Error("listUsers: " + error.message);
    const users = data?.users ?? [];
    const hit = users.find((u: { email?: string | null }) => (u.email ?? "").toLowerCase() === email);
    if (hit) return { id: hit.id };
    if (users.length < perPage) break; // last page
  }
  return null;
}

// Belt-and-suspenders: handle_new_user() should have created the profile. If a race left it
// missing, insert a minimal row (service_role bypasses the subscription guard; we don't touch
// subscription here). No-ops when the row already exists.
async function ensureProfile(sb: SB, uid: string, email: string, name: string | null) {
  const existing = await sb.from("profiles").select("id").eq("id", uid).maybeSingle();
  if (existing.data) return;
  await sb.from("profiles").insert({ id: uid, email, name });
}

// Loose types — the supabase-js client is dynamically typed here (no generated DB types).
// deno-lint-ignore no-explicit-any
type SB = any;
interface PaymentRow {
  order_id: string;
  user_id: string;
  plan: string | null;
  months: number | null;
  status: string;
  paid_at: string | null;
  review_status: string | null;
}
interface ProfileRow {
  id: string;
  email: string | null;
  name: string | null;
  created_at: string | null;
  subscription: { status?: string; expires_at?: string } | null;
}
