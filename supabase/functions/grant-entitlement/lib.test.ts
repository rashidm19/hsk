import { assert, assertEquals, assertThrows } from "jsr:@std/assert@1";
import { hmacHex, verifySig, derivePlan, computeExpiry, freshTs, timingSafeEqual } from "./lib.ts";

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
  assertEquals(derivePlan("12mo")?.interval, "12 months");
  assertEquals(derivePlan("nope"), null);
});

Deno.test("computeExpiry adds months in UTC", () => {
  assertEquals(computeExpiry("2026-01-15T00:00:00.000Z", 3), "2026-04-15T00:00:00.000Z");
});

Deno.test("computeExpiry clamps month-end overflow (Jan 31 +1mo -> Feb 28, not March)", () => {
  assertEquals(computeExpiry("2026-01-31T00:00:00.000Z", 1), "2026-02-28T00:00:00.000Z");
  assertEquals(computeExpiry("2024-01-31T00:00:00.000Z", 1), "2024-02-29T00:00:00.000Z"); // leap year
  assertEquals(computeExpiry("2026-01-31T12:00:00.000Z", 1), "2026-02-28T12:00:00.000Z"); // preserves time
});

Deno.test("computeExpiry throws on malformed paid_at", () => {
  assertThrows(() => computeExpiry("not-a-date", 1));
});

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
