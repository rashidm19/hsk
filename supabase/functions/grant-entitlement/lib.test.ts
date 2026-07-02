import { assert, assertEquals } from "jsr:@std/assert@1";
import { hmacHex, verifySig, derivePlan, freshTs, timingSafeEqual } from "./lib.ts";

Deno.test("hmac verifies correct, rejects tampered body/secret", async () => {
  const sig = await hmacHex("secret", "hello");
  assert(await verifySig("secret", "hello", sig));
  assert(!(await verifySig("secret", "hello!", sig)));
  assert(!(await verifySig("wrong", "hello", sig)));
});

Deno.test("verifySig rejects empty and length-mismatched signatures", async () => {
  assert(!(await verifySig("secret", "hello", "")));
  assert(!(await verifySig("secret", "hello", "abcd")));
});

Deno.test("derivePlan maps known plans and rejects unknown", () => {
  assertEquals(derivePlan("3mo")?.amount, 54000);
  assertEquals(derivePlan("3mo")?.months, 3);
  assertEquals(derivePlan("12mo")?.months, 12);
  assertEquals(derivePlan("nope"), null);
});

// Expiry math (incl. the Jan 31 + 1mo -> Feb 28/29 month-end clamp) moved into SQL:
// apply_hsk_entitlement() in schema.sql. Its assertions live in the rollback-wrapped
// validation batch documented in supabase/PAYMENTS_SETUP.md ("Duplicate charges & refunds").

Deno.test("timingSafeEqual rejects length mismatch, accepts identical", () => {
  assert(!timingSafeEqual("abc", "abcd"));
  assert(timingSafeEqual("abc", "abc"));
  assert(!timingSafeEqual("abc", "abd"));
});

Deno.test("freshTs accepts now, rejects stale; handles NaN and clock skew", () => {
  const now = 1_700_000_000_000;
  assert(freshTs(1_700_000_000, now));            // same second
  assert(!freshTs(1_700_000_000 - 600, now));     // 10 min stale -> rejected
  assert(!freshTs(NaN, now));                     // non-finite -> rejected
  assert(freshTs(1_700_000_000 + 60, now));       // 1 min future (skew) within window
  assert(!freshTs(1_700_000_000 + 600, now));     // 10 min future -> rejected
});
