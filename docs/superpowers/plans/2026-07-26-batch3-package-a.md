# Batch 3 · Package A — money & availability · Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove the third-party single point of failure in front of every gated page, make a failed entitlement grant loud instead of silent, and stop the fail-closed guard from walling out subscribers it can already identify.

**Architecture:** Four independent changes sharing one theme — nothing on the money path should depend on an unverified promise. B1 vendors the Supabase client same-origin at a pinned version. B2 turns a lying `200` into a `503` and updates the published wire contract in the same commit. B2b makes a failed grant detectable (a reconciliation query) and audible (an alert the function sends itself). F7 lets the fail-closed branch honour the two positive signals it already has.

**Tech Stack:** Plain ES5 browser JS, Node build scripts (modern syntax OK), Deno TypeScript edge functions, `node:test` + Deno test. Zero npm dependencies.

**Spec:** `docs/superpowers/specs/2026-07-26-app-prelaunch-batch3-design.md` (commit `4a50f795`, revised after adversarial review `wf_307cb7ff-428`).

## Global Constraints

- **Zero npm dependencies.** No `package.json`, no installs. `npm pack` in Task 1 runs in `/tmp`, never in the repo.
- **ES5-compatible browser syntax** in shipped `.js` under the repo root and `app/` (`var`, `function`; no arrow functions, `const`/`let`, or template literals). **Does not apply** to `scripts/*.js`, `build.js` (Node) or `supabase/functions/**` (Deno) — those already use modern syntax.
- **Every browser-side storage access is wrapped in `try/catch`.** Safari Private mode throws.
- **Byte-check edited files** with `perl`, never `grep` — this environment's `grep` is `ugrep -I`, which returns exit 1 on a NUL file and is blind to the exact byte this check exists to catch:
  ```bash
  perl -ne 'print "$ARGV:$.\n" if /[\x00-\x08\x0b\x0c\x0e-\x1f]/; close ARGV if eof;' <files>
  ```
- **`node --check`** every edited `.js` before committing; `deno check` every edited `.ts`.
- **Commit messages via `git commit -F <file>`**, never `-m "…"` — backticks in a `-m` body get command-substituted by the shell (this bit us in batch 2).
- **Suite green before each commit:** `node --test scripts/*.test.js` (103 at plan start) and `deno test supabase/functions/*/lib.test.ts` (12).
- **Pinned Supabase version is exactly `2.110.8`**, sha256 `913f94db33b394a97d34c058347009053ac2d9534459c0990eb08594a108d2ee`, 207,904 bytes.
- **Line numbers below were computed against `4a50f795`.** Task 2 rewrites 598 pages; nothing after it depends on those line numbers, but always prefer the quoted text over the number.

---

### Task 1: Vendor the pinned Supabase UMD

Adds a file. Changes no behaviour — nothing references it yet. Safe to land alone.

**Files:**
- Create: `vendor/supabase-js-2.110.8.min.js`

**Interfaces:**
- Produces: the file at `/vendor/supabase-js-2.110.8.min.js`, consumed by Task 2's `SB_TAG`.

- [ ] **Step 1: Fetch the npm artifact and verify it**

Run, from `/tmp` (never the repo — `npm pack` writes a tarball):

```bash
cd /tmp && rm -rf sbpack && mkdir sbpack && cd sbpack
npm pack @supabase/supabase-js@2.110.8
tar -xzf supabase-supabase-js-2.110.8.tgz package/dist/umd/supabase.js
shasum -a 256 package/dist/umd/supabase.js
wc -c package/dist/umd/supabase.js
```

Expected: `913f94db33b394a97d34c058347009053ac2d9534459c0990eb08594a108d2ee` and `207904`.

**If the digest differs, STOP.** It means npm served different bytes than were verified during grounding; do not vendor them. Cross-check against a second origin before doing anything else:

```bash
curl -sL https://unpkg.com/@supabase/supabase-js@2.110.8/dist/umd/supabase.js | shasum -a 256
```

- [ ] **Step 2: Copy it into the repo**

```bash
mkdir -p /Users/max/Projects/hsk/vendor
cp /tmp/sbpack/package/dist/umd/supabase.js /Users/max/Projects/hsk/vendor/supabase-js-2.110.8.min.js
cd /Users/max/Projects/hsk
shasum -a 256 vendor/supabase-js-2.110.8.min.js
```

Expected: the same digest as Step 1.

- [ ] **Step 3: Confirm it is not gitignored and parses**

```bash
git check-ignore -v vendor/supabase-js-2.110.8.min.js || echo "not ignored — good"
node --check vendor/supabase-js-2.110.8.min.js && echo "parses"
```

Expected: `not ignored — good` then `parses`.

- [ ] **Step 4: Commit**

```bash
git add vendor/supabase-js-2.110.8.min.js
printf '%s\n' \
  'build(vendor): pin @supabase/supabase-js 2.110.8 as a same-origin asset' '' \
  'The npm dist/umd artifact, sha256 913f94db33b394a97d34c058347009053ac2d9534459c0990eb08594a108d2ee,' \
  '207904 bytes, verified byte-identical across npm, unpkg and jsdelivr.' '' \
  'Nothing references it yet — the switch is the next commit.' > /tmp/t1.txt
git commit -F /tmp/t1.txt
```

---

### Task 2: Switch all six source locations to the vendored file

The atomic switch. Every tag moves in one commit, because a half-switched tree means some pages load two Supabase clients and others none.

**Files:**
- Modify: `scripts/inject-auth.js` (the `HEAD_SNIPPET` tag, the `injectHead` guard, the strip list)
- Modify: `build.js:5424` (the quiz-funnel template)
- Modify: `index.html:1404`, `login/index.html:44`, `auth/callback.html:27`, `app/index.html:5`
- Regenerates: 598 `body.app` pages via `node build.js`

**Interfaces:**
- Consumes: `/vendor/supabase-js-2.110.8.min.js` from Task 1.
- Produces: `SB_TAG` and `SB_TAG_RE` in `scripts/inject-auth.js`, used by nothing outside that file.

- [ ] **Step 1: Add the constants to `scripts/inject-auth.js`**

Insert immediately above `const HEAD_SNIPPET = \`` (currently line 16):

```js
// B1: the Supabase client is vendored same-origin and version-pinned. The old floating
// jsdelivr alias (@supabase/supabase-js@2) was a render-blocking third-party fetch that
// followed 2.x releases with no commit, and could not carry SRI (jsdelivr rewrites that
// alias and says so in its own banner). Bumping the version = drop the new file in
// /vendor/, edit SB_TAG, edit the four hand-maintained files listed in the batch-3 spec,
// then `node build.js` and grep for the OLD filename (must be 0) before deleting it.
const SB_TAG = '<script src="/vendor/supabase-js-2.110.8.min.js"></script>';
// Matches ANY vendored version, so a bump strips the previous tag instead of leaving a
// stale duplicate beside the new one.
const SB_TAG_RE = /<script src="\/vendor\/supabase-js-[^"]+"><\/script>\n?/g;
```

- [ ] **Step 2: Use `SB_TAG` in the snippet**

In `HEAD_SNIPPET`, replace the line

```
<script src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2"></script>
```

with `${SB_TAG}` so the template reads:

```js
const HEAD_SNIPPET = `
${SB_TAG}
<script src="/config/auth.js"></script>
<script src="/auth.js"></script>
<script src="/access-decision.js"></script>
<script src="/auth-guard.js"></script>
<script src="/auth-ui.js" defer></script>`;
```

- [ ] **Step 3: Re-key the freshness guard**

`injectHead` currently early-returns on `/access-decision.js`, which **every** already-injected page contains — leaving it unchanged would silently skip all 598 pages while reporting success. Replace the first line of `injectHead` (currently `if (html.includes('/access-decision.js')) return html;`) with:

```js
  // Skip only pages already carrying THIS EXACT tag. Keying on a bare '/vendor/' substring
  // would match a page holding the PREVIOUS version's tag on the next bump and return early —
  // the same silent-skip bug this line is being changed to fix.
  if (html.includes(SB_TAG)) return html;
```

- [ ] **Step 4: Make the strip list cumulative**

In the strip-list array (currently line 52 holds the jsdelivr literal), **keep** the jsdelivr literal — a page being migrated still carries it — and add `SB_TAG`. Change the array's first entry region so both are present:

```js
    [
      '<script src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2"></script>',
      SB_TAG,
      '<script src="/config/auth.js"></script>',
```

Then, immediately before the loop that removes those literals, strip any *other* vendored version by pattern:

```js
    html = html.replace(SB_TAG_RE, '');
```

- [ ] **Step 5: Update `build.js`**

At `build.js:5424`, replace

```
<script src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2"></script>
```

with

```
<script src="/vendor/supabase-js-2.110.8.min.js"></script>
```

- [ ] **Step 6: Update the four hand-maintained files**

`inject-auth` never rewrites these — `index.html` and `auth/callback.html` are in its `SKIP` set (`scripts/inject-auth.js:9-13`), `login/index.html` has a plain `<body>` and fails the `body.app` test. Apply the identical replacement in each:

| File | Line |
|---|---|
| `index.html` | 1404 |
| `login/index.html` | 44 |
| `auth/callback.html` | 27 |
| `app/index.html` | 5 |

From `<script src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2"></script>`
to `<script src="/vendor/supabase-js-2.110.8.min.js"></script>`.

- [ ] **Step 7: Rebuild and verify the switch is total**

```bash
cd /Users/max/Projects/hsk
node --check scripts/inject-auth.js && node --check build.js
node build.js
grep -rl 'cdn.jsdelivr.net/npm/@supabase' --include='*.html' . | wc -l
grep -rl '/vendor/supabase-js-2.110.8.min.js' --include='*.html' . | wc -l
```

Expected: **0** then **602**. If the first number is not 0, the guard in Step 3 is wrong — do not commit.

- [ ] **Step 8: Verify in a browser, all five entry points**

Start the preview server (`.claude/launch.json` defines `hsk-static` on port 8080) and load `/app/`, `/login/`, `/quiz/`, `/` and `/auth/callback.html`. On each, in the console:

```js
({ resolves: typeof (window.supabase && window.supabase.createClient), jsdelivr: performance.getEntriesByType('resource').filter(function (r) { return r.name.indexOf('jsdelivr') > -1 && r.name.indexOf('supabase') > -1; }).length })
```

Expected on every page: `{resolves: "function", jsdelivr: 0}`. Zero console errors.

- [ ] **Step 9: Run the suite and commit**

```bash
node --test scripts/*.test.js
perl -ne 'print "$ARGV:$.\n" if /[\x00-\x08\x0b\x0c\x0e-\x1f]/; close ARGV if eof;' scripts/inject-auth.js build.js index.html login/index.html auth/callback.html app/index.html
git add -A
printf '%s\n' \
  'build(auth): serve the Supabase client same-origin from /vendor/ (B1)' '' \
  'The floating jsdelivr alias was render-blocking in <head> on 602 committed pages with' \
  'no integrity attribute, so an unreachable CDN painted "Couldn'"'"'t connect" over every' \
  'gated page including the paid /app/, and /login/ + /quiz/ could not sign anyone in.' \
  'jsdelivr has no China CDN since losing its ICP licence. It also floated: the alias moved' \
  'to 2.110.8 on 2026-07-21 with no commit and no rollback path.' '' \
  'Six source locations, not three: inject-auth.js carries the tag in both the snippet and' \
  'the strip list, plus build.js and four hand-maintained files inject-auth never rewrites' \
  '(index.html, login/index.html, auth/callback.html, app/index.html).' '' \
  'The injectHead freshness guard now keys on the exact versioned SB_TAG. Keying it on' \
  'access-decision.js (unchanged) would have skipped all 598 pages while reporting success;' \
  'keying it on a bare /vendor/ substring would recreate that bug one version later.' \
  'The strip list keeps the jsdelivr literal permanently and removes prior vendored' \
  'versions by pattern, so a bump heals a page instead of duplicating the tag.' '' \
  'Verified: jsdelivr-supabase refs 602 -> 0, vendored refs 0 -> 602; all five entry points' \
  'resolve window.supabase.createClient with zero jsdelivr requests.' > /tmp/t2.txt
git commit -F /tmp/t2.txt
```

Expected: 103 tests pass; byte check silent.

---

### Task 3: `grant-entitlement` returns 503 when the grant failed

**Files:**
- Modify: `supabase/functions/grant-entitlement/lib.ts` (append the decision)
- Modify: `supabase/functions/grant-entitlement/index.ts` (the RPC-error branch, ~line 73)
- Modify: `supabase/functions/grant-entitlement/lib.test.ts` (append cases)
- Modify: `docs/studybox-payment-integration.md:217` and `:275-278`
- Modify: `supabase/PAYMENTS_SETUP.md:104-105`

**Interfaces:**
- Produces: `GRANT_FAIL_STATUS: 503` and `grantFailBody(isReplay: boolean)` from `lib.ts`, consumed by `index.ts` and pinned by `lib.test.ts`.

- [ ] **Step 1: Write the failing test**

Append to `supabase/functions/grant-entitlement/lib.test.ts`:

```ts
Deno.test("B2: a failed entitlement write is reported as a retryable 503, not a success", () => {
  assertEquals(GRANT_FAIL_STATUS, 503);
  const body = grantFailBody(false);
  assertEquals(body.ok, false, "ok:true would tell the acquirer the grant landed");
  assertEquals(body.retry, true, "the acquirer must know this one is worth re-driving");
  assertEquals(body.reason, "entitlement_apply");
});

Deno.test("B2: the replay flag is preserved so a re-drive is still recognisable", () => {
  assertEquals(grantFailBody(true).idempotent, true);
  assertEquals(grantFailBody(false).idempotent, false);
});
```

Extend the import at the top of the file to include the two new names:

```ts
import { hmacHex, verifySig, derivePlan, freshTs, timingSafeEqual, GRANT_FAIL_STATUS, grantFailBody } from "./lib.ts";
```

- [ ] **Step 2: Run it to verify it fails**

Run: `deno test supabase/functions/grant-entitlement/lib.test.ts`
Expected: FAIL — the module has no export named `GRANT_FAIL_STATUS`.

- [ ] **Step 3: Add the decision to `lib.ts`**

Append to `supabase/functions/grant-entitlement/lib.ts`:

```ts
// A failed entitlement write is NOT a success. 503 puts the acquirer on the documented
// retry-with-backoff path; the retry is safe because the `payments` row is keyed by
// order_id and apply_hsk_entitlement() folds the whole ledger, so re-driving converges on
// the same coverage instead of stacking a second term. JSON (unlike the plain-text gateway
// 500s) so StudyBox can tell this apart from an infrastructure failure.
export const GRANT_FAIL_STATUS = 503;

export function grantFailBody(isReplay: boolean) {
  return { ok: false, idempotent: isReplay, entitlement: false, retry: true, reason: "entitlement_apply" };
}
```

- [ ] **Step 4: Use it in `index.ts`**

Replace the RPC-error branch (currently `return json(200, { ok: true, idempotent: isReplay, entitlement: false }); // still un-granted; alert + re-drive`) with:

```ts
    return json(GRANT_FAIL_STATUS, grantFailBody(isReplay));
```

Add the two names to the existing `lib.ts` import at the top of `index.ts`.

- [ ] **Step 5: Run the tests**

```bash
deno check supabase/functions/grant-entitlement/index.ts
deno test supabase/functions/*/lib.test.ts
```

Expected: 14 passed (12 + 2), 0 failed.

- [ ] **Step 6: Update the published contract**

The `200 {"ok":true,"entitlement":false}` response no longer exists, so the doc that instructs StudyBox how to handle it must change in the same commit — otherwise their escalation trigger is dead.

In `docs/studybox-payment-integration.md`, replace the `:217` table row with:

```
| 503 | `{"ok":false,"retry":true,"reason":"entitlement_apply"}` | Payment recorded, entitlement write failed | **Retry with backoff** (same `order_id`, fresh `ts`) — idempotent by `order_id`, so a re-drive heals a transient failure. **Give up after 6 attempts over 2 hours** and contact HSK: a persistent failure means the database is misconfigured and retrying forever will not fix it. |
```

Rewrite the `:275-278` bullet to match — it currently describes the `entitlement:false` 200 and its escalation. Replace `entitlement:false (200)` with the 503, keep the "re-drive heals a transient failure" reasoning, and state the give-up threshold instead of "escalate".

In `supabase/PAYMENTS_SETUP.md`, update `:104-105` the same way: a persisting failure is now a persisting 503, not a persisting `entitlement:false`.

- [ ] **Step 7: Commit**

```bash
git add supabase/functions/grant-entitlement/ docs/studybox-payment-integration.md supabase/PAYMENTS_SETUP.md
printf '%s\n' \
  'fix(payments): a failed entitlement grant answers 503, not 200 ok:true (B2)' '' \
  'The branch returned 200 {ok:true, entitlement:false} when apply_hsk_entitlement errored,' \
  'so the acquirer recorded a success and never retried. The customer is charged, not' \
  'granted, and bounced to /quiz/?sub=required after their 30-minute grace.' '' \
  'This was not an oversight: studybox-payment-integration.md formally instructed StudyBox' \
  'to treat that response as success AND alert. The defect is that a money-path alert was' \
  'delegated to another party in another repo with nothing verifying it happened.' '' \
  'Retrying is safe by construction — the payments row is keyed by order_id and' \
  'apply_hsk_entitlement folds the ledger, so a re-drive converges on the same coverage' \
  'rather than stacking a second term.' '' \
  'The response is part of a published wire contract, so the contract changes in the same' \
  'commit: the 200/entitlement:false row becomes the 503, with a give-up threshold so a' \
  'PERMANENT failure (schema not applied) stops instead of retrying forever.' > /tmp/t3.txt
git commit -F /tmp/t3.txt
```

**Do NOT deploy here.** The deploy is deferred to the end of Task 4 so that the single v6 build carries
both this 503 change *and* Task 4's `alertGrantFailure`. Deploying now would ship a v6 that the very next
task supersedes — a money-path function permanently diverging from the repo, with the alert committed but
inert in production. Task 4 Step 6 does the one deploy.

---

### Task 4: Make a failed grant detectable and audible

**Files:**
- Modify: `supabase/PAYMENTS_SETUP.md` (new reconciliation section + a launch-checklist line at `:92-99`)
- Modify: `supabase/functions/grant-entitlement/index.ts` (alert on the failure branch)

**Interfaces:**
- Consumes: `GRANT_FAIL_STATUS` / `grantFailBody` from Task 3.

- [ ] **Step 1: Add the reconciliation query to `PAYMENTS_SETUP.md`**

The repair runbook already exists at `:101-108`; what is missing is *detection*. Add a new section:

````markdown
## Reconciliation — run before launch, then on a schedule

Paid orders whose coverage does not reflect the ledger. Any row here needs the
lost/failed-webhook runbook below. Expected result: **no rows**.

```sql
select p.order_id, p.user_id, p.plan, p.amount, p.months, p.paid_at,
       pr.subscription->>'status'     as sub_status,
       pr.subscription->>'expires_at' as sub_expires_at
  from public.payments p
  join public.profiles pr on pr.id = p.user_id
 where p.status = 'paid'
   and p.paid_at is not null
   and coalesce(p.months, 0) > 0
   and (pr.subscription is null
        or coalesce(pr.subscription->>'status', '') <> 'active'
        or (pr.subscription->>'expires_at') is null
        or (pr.subscription->>'expires_at')::timestamptz < now());
```
````

And add to the Launch checklist at `:92-99`:

```markdown
- [ ] Reconciliation query returns no rows, and is scheduled to run after launch.
```

- [ ] **Step 2: Run it against prod and record the result**

Run the query. Expected: **0 rows** (it was 0 during grounding). If it returns rows, stop and work the runbook before shipping anything else in this package.

- [ ] **Step 3: Add the alert to the failure branch**

⚠️ **Do not use un-awaited fire-and-forget.** Supabase Edge Functions may be torn down as soon as the response is returned, so an un-awaited `fetch` can silently never send. Await it with a short timeout instead, wrapped so that an alert failure can never change the HTTP response.

This is the **first outbound HTTP call in any edge function in this repo** — there is no existing pattern to copy, and it needs a new secret.

Add to `supabase/functions/grant-entitlement/index.ts`, above `Deno.serve`:

```ts
// First outbound call from any function here. Supabase has no alert-on-log-line feature —
// log export is a Pro-plan Log Drain configured in the dashboard, which cannot ship in a
// function deploy — so the function raises its own alarm. Awaited with a short timeout
// because Edge Functions can be torn down the moment the response is returned; wrapped so
// an alert failure NEVER changes what the acquirer sees.
async function alertGrantFailure(orderId: string, uid: string, msg: string) {
  const key = Deno.env.get("HSK_ALERT_RESEND_KEY") ?? "";
  const to = Deno.env.get("HSK_ALERT_TO") ?? "";
  if (!key || !to) return;
  try {
    const ctl = new AbortController();
    const t = setTimeout(() => ctl.abort(), 2000);
    await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { authorization: `Bearer ${key}`, "content-type": "application/json" },
      body: JSON.stringify({
        from: "alerts@hskprep.cc",
        to: [to],
        subject: `[HSK] entitlement grant FAILED — order ${orderId}`,
        text: `apply_hsk_entitlement failed.\norder_id: ${orderId}\nuid: ${uid}\nerror: ${msg}\n\nThe customer is charged and NOT granted. Runbook: supabase/PAYMENTS_SETUP.md.`,
      }),
      signal: ctl.signal,
    });
    clearTimeout(t);
  } catch (_e) { /* alerting is best-effort; the 503 is the contract */ }
}
```

Then call it in the RPC-error branch, immediately before the return added in Task 3:

```ts
    await alertGrantFailure(String(p.order_id), String(p.uid), grant.error.message);
    return json(GRANT_FAIL_STATUS, grantFailBody(isReplay));
```

- [ ] **Step 4: Verify it compiles and the suite is green**

```bash
deno check supabase/functions/grant-entitlement/index.ts
deno test supabase/functions/*/lib.test.ts
node --test scripts/*.test.js
```

Expected: 14 Deno, 103 node, 0 failures. (The alert is I/O — `lib.test.ts` pins the *decision*, not the send.)

- [ ] **Step 5: Commit**

```bash
git add supabase/functions/grant-entitlement/index.ts supabase/PAYMENTS_SETUP.md
printf '%s\n' \
  'feat(payments): detect and alert on a failed entitlement grant (B2b)' '' \
  'The repair runbook already existed; DETECTION did not. Nothing told an operator that an' \
  'order needed it — the only trace was one log line in a short retention window.' '' \
  'Part 1: a reconciliation query (paid orders whose coverage does not reflect the ledger)' \
  'in PAYMENTS_SETUP.md and on the launch checklist. Durable, and independent of Part 2.' '' \
  'Part 2: the function raises its own alarm. Supabase has no alert-on-log-line feature —' \
  'log export is a Pro-plan Log Drain configured in the dashboard, which cannot ship in a' \
  'function deploy — so anything else would repeat the very mistake B2 diagnosed: an' \
  'alerting promise with no verified mechanism.' '' \
  'Awaited with a 2s timeout rather than fire-and-forget, because Edge Functions can be' \
  'torn down as soon as the response is returned; every failure path is swallowed so the' \
  'alert can never change what the acquirer sees.' > /tmp/t4.txt
git commit -F /tmp/t4.txt
```

- [ ] **Step 6: Deploy the single v6 (carrying BOTH the 503 and the alert) and smoke-test**

This is the **only** `grant-entitlement` deploy in package A. It happens here, after Task 4, so v6 carries
Task 3's 503 *and* this task's `alertGrantFailure` — not the 503 alone. It is live at **version 5** today.

Deploy (`version 5 → 6`; `verify_jwt:false` unchanged, no `config.toml` change), then run the Group C curl
matrix against v6 — **no real payment needed**:

| Request | Expected |
|---|---|
| unsigned POST | `401` |
| valid HMAC, stale `ts` | `400` |
| replay of an existing comp `order_id`, fresh `ts` | `200 {"idempotent":true}` |

Then re-run the Step 2 reconciliation query and confirm coverage is unchanged.

- [ ] **Step 7: Owner action — set the alert secrets**

`HSK_ALERT_RESEND_KEY` and `HSK_ALERT_TO` must be set in the Supabase dashboard before the alert can fire,
and `alerts@hskprep.cc` must be a verified Resend sender or the send 401s (harmlessly — the swallow keeps
the 503 intact, but the alert never arrives). Until then, `alertGrantFailure` returns immediately and the
503 + reconciliation query carry detection on their own. Record both on the launch checklist.

---

### Task 5: The fail-closed branch honours the signals it already has

**Files:**
- Modify: `auth-guard.js` (the `!decide` branch, currently `showAccessFail(); return;`)
- Modify: `scripts/auth-guard.test.js` (extend `loadGuard`, append two cases)

**Interfaces:**
- Consumes: `readSubCache(userId)` (`auth-guard.js:49`, returns the `{userId, sub, cachedAt}` **wrapper** or `null`) and `HSKAuth.isPayPending(userId)` (uid-scoped, from batch 2).

- [ ] **Step 1: Teach the test harness to seed the two signals**

In `scripts/auth-guard.test.js`'s `loadGuard`, replace the `global.sessionStorage` line with one that can hold a seeded cache, and let `HSKAuth.isPayPending` be overridable:

```js
  global.sessionStorage = {
    getItem: () => (o.subCache ? JSON.stringify(o.subCache) : null),
    setItem() {}, removeItem() {},
  };
```

`isPayPending` already flows through `o.authOver`, which `Object.assign`s over the default `HSKAuth` — no change needed there.

- [ ] **Step 2: Write the failing tests**

Append to `scripts/auth-guard.test.js`:

```js
test('F7: a known subscriber (fresh uid-scoped cache) is shown the app, not the retry card', async () => {
  const g = loadGuard({
    session: { user: { id: 'u1' } },
    HSKAccess: undefined,                       // access-decision.js failed to load
    subCache: { userId: 'u1', sub: { status: 'active', expires_at: '2099-01-01T00:00:00Z' }, cachedAt: Date.now() },
  });
  await tick();
  assert.equal(g.getById('hsk-access-fail'), null, 'no retry card for someone we can already identify');
  assert.equal(g.replaced.length, 0, 'and no redirect');
});

test('F7: a just-paid user (uid-matched pay marker) is shown the app', async () => {
  const g = loadGuard({
    session: { user: { id: 'u1' } },
    HSKAccess: undefined,
    authOver: { isPayPending: (uid) => uid === 'u1' },
  });
  await tick();
  assert.equal(g.getById('hsk-access-fail'), null, 'the 30-minute pay window still counts here');
  assert.equal(g.replaced.length, 0);
});

test('F7: another account\'s cache does NOT open the app', async () => {
  const g = loadGuard({
    session: { user: { id: 'u1' } },
    HSKAccess: undefined,
    subCache: { userId: 'u2', sub: { status: 'active', expires_at: '2099-01-01T00:00:00Z' }, cachedAt: Date.now() },
  });
  await tick();
  assert.ok(g.getById('hsk-access-fail'), 'uid mismatch -> still fail closed');
});
```

- [ ] **Step 3: Run them to verify they fail**

Run: `node --test scripts/auth-guard.test.js`
Expected: the first two FAIL — the branch shows `hsk-access-fail` unconditionally. The third passes already (it must keep passing).

- [ ] **Step 4: Implement**

In `auth-guard.js`, replace `showAccessFail(); return;` in the `!decide` branch with:

```js
        /* F7: honour the SAME two positive signals decideAccess() short-circuits on
           (access-decision.js:41-42), so the contract above actually holds — a known
           subscriber (fresh 15-min uid-scoped cache) or a just-paid user (30-min
           uid-matched pay marker) is shown the app, not a retry card.
           confirmedActive is DELIBERATELY not consulted: access-decision.js only reaches
           'grace-show' AFTER both the edge function and the RLS read were attempted and
           failed, and this branch attempts neither — admitting it here would turn its
           7-day marker into a week-long offline pass and re-open what L3 closed. */
        var freshSub = (readSubCache(userId) || {}).sub || null;
        var paying = !!(HSKAuth.isPayPending && HSKAuth.isPayPending(userId));
        if (freshSub || paying) { unveil(); return; }
        showAccessFail(); return;
```

Note `readSubCache` returns the **wrapper**; take `.sub` from it, exactly as the `decide({…})` call below does.

- [ ] **Step 5: Run the tests**

```bash
node --check auth-guard.js
node --test scripts/*.test.js
```

Expected: 106 tests (103 + 3), 0 failures — including both original L3 cases, which must still pass.

- [ ] **Step 6: Commit**

```bash
perl -ne 'print "$ARGV:$.\n" if /[\x00-\x08\x0b\x0c\x0e-\x1f]/; close ARGV if eof;' auth-guard.js
git add auth-guard.js scripts/auth-guard.test.js
printf '%s\n' \
  'fix(auth): fail-closed branch honours the two signals it already has (F7)' '' \
  'When access-decision.js specifically fails to fetch, the guard fell back to a' \
  '"Couldn'"'"'t verify access" retry card even for a subscriber whose fresh uid-scoped' \
  'cache was sitting right there — both signals are computed a few lines below for the' \
  'normal path, contradicting the branch'"'"'s own contract comment.' '' \
  'Now it honours exactly what decideAccess() short-circuits on: cacheFresh and payPending.' \
  'confirmedActive stays excluded on purpose — it is only reachable AFTER the edge function' \
  'and the RLS read have both been attempted and failed, and this branch attempts neither,' \
  'so admitting it would turn a 7-day marker into a week-long offline pass and re-open what' \
  'the L3 fix closed. A cache belonging to another uid still fails closed.' > /tmp/t5.txt
git commit -F /tmp/t5.txt
```

---

## Package A done-condition

- 103 → **106** node tests, 12 → **14** Deno tests, all green.
- `grep -rl 'cdn.jsdelivr.net/npm/@supabase' --include='*.html' .` → **0**.
- All five entry points resolve `window.supabase.createClient` with zero jsdelivr requests.
- `grant-entitlement` deployed **once**, at the end of Task 4, so v6 carries both the 503 and the alert; curl matrix green; reconciliation query returns no rows.
- `node build.js` idempotent afterwards (only `sitemap.xml` `lastmod` may move).

**Deploy artifacts:** client + generated HTML (git push → DigitalOcean) **and** one edge-function deploy. Package A is the only package in batch 3 that touches surfaces live today — `index.html`, `login/index.html` and `auth/callback.html` go live the moment `main` is pushed, unlike `/app/`, which is still 404 in production.

**Owner actions unlocked by this package:** set `HSK_ALERT_RESEND_KEY` and `HSK_ALERT_TO`; schedule the reconciliation query.
