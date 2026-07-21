// check-access — authoritative entitlement read for the /app/ paywall gate.
// Deploy with verify_jwt=TRUE (pinned in supabase/config.toml). SUPABASE_URL,
// SUPABASE_ANON_KEY and SUPABASE_SERVICE_ROLE_KEY are auto-injected.
//
// verify_jwt only rejects unsigned/expired tokens AND still admits the public anon
// key (a project-signed role:anon JWT with no `sub`). So we validate an AUTHENTICATED
// principal here: getUser(bearer) with the caller's token; no user id => 401. Then read
// the subscription with the service-role client (authoritative, RLS-proof).
import { createClient } from "npm:@supabase/supabase-js@2";
import { computeActive, corsHeaders } from "./lib.ts";

const SB_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SB_ANON = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
const SB_SERVICE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

function json(body: unknown, status: number, cors: Record<string, string>): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, "content-type": "application/json" },
  });
}

Deno.serve(async (req) => {
  const cors = corsHeaders(req.headers.get("Origin"));
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });

  const authz = req.headers.get("Authorization") ?? "";
  // Request-scoped client under the CALLER's token — getUser(bearer) validates the principal.
  const asUser = createClient(SB_URL, SB_ANON, {
    global: { headers: { Authorization: authz } },
    auth: { persistSession: false },
  });
  let userId: string | null = null;
  try {
    // Pass the bearer token EXPLICITLY. A no-arg getUser() on a persistSession:false client
    // reads a non-existent stored session and 401s every caller (per Supabase docs).
    const bearer = authz.replace(/^Bearer\s+/i, "");
    const { data } = await asUser.auth.getUser(bearer);
    userId = data?.user?.id ?? null;
  } catch (_e) {
    userId = null;
  }
  if (!userId) return json({ active: false }, 401, cors);

  // Authoritative read with the service role.
  const svc = createClient(SB_URL, SB_SERVICE, { auth: { persistSession: false } });
  const { data, error } = await svc
    .from("profiles").select("subscription").eq("id", userId).maybeSingle();
  if (error) return json({ active: false }, 200, cors); // definite unknown -> client fails closed if uncached

  const sub = (data &&
    (data as { subscription?: { status?: string; expires_at?: string | null; plan?: string } }).subscription) ||
    null;
  return json(
    { active: computeActive(sub, Date.now()), expires_at: sub?.expires_at ?? null, plan: sub?.plan ?? null },
    200,
    cors,
  );
});
