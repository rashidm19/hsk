import { assertEquals } from "jsr:@std/assert@1";  // repo convention (grant-entitlement/lib.test.ts)
import { computeActive, corsHeaders } from "./lib.ts";

const NOW = Date.parse("2026-07-21T00:00:00Z");

Deno.test("active + no expiry -> true", () => {
  assertEquals(computeActive({ status: "active" }, NOW), true);
});
Deno.test("active + future expiry -> true", () => {
  assertEquals(computeActive({ status: "active", expires_at: "2099-01-01T00:00:00Z" }, NOW), true);
});
Deno.test("active + past expiry -> false", () => {
  assertEquals(computeActive({ status: "active", expires_at: "2000-01-01T00:00:00Z" }, NOW), false);
});
Deno.test("active + UNPARSEABLE expiry -> true (matches client subActive)", () => {
  assertEquals(computeActive({ status: "active", expires_at: "not-a-date" }, NOW), true);
});
Deno.test("inactive status -> false", () => {
  assertEquals(computeActive({ status: "canceled" }, NOW), false);
});
Deno.test("null sub -> false", () => {
  assertEquals(computeActive(null, NOW), false);
});
Deno.test("corsHeaders reflects an allowlisted origin, omits others", () => {
  assertEquals(corsHeaders("https://www.hskprep.cc")["Access-Control-Allow-Origin"], "https://www.hskprep.cc");
  assertEquals(corsHeaders("https://evil.com")["Access-Control-Allow-Origin"], undefined);
  assertEquals(corsHeaders("http://127.0.0.1:8080")["Access-Control-Allow-Origin"], "http://127.0.0.1:8080");
});
