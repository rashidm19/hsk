import { assert, assertEquals } from "jsr:@std/assert@1";
import { hmacHex, verifySig, derivePlan, computeExpiry, freshTs } from "./lib.ts";

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

Deno.test("freshTs accepts now, rejects 10-minute-old timestamps", () => {
  const now = 1_700_000_000_000;
  assert(freshTs(1_700_000_000, now));
  assert(!freshTs(1_700_000_000 - 600, now));
});
