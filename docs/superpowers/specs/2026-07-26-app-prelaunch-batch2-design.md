# Design — `/app/` pre-launch batch 2 (P2 · P4 · P5 · P6 · P7)

**Date:** 2026-07-26
**Branch:** claude/dev (69 commits ahead of `origin/main`, **not pushed** — `https://www.hskprep.cc/app/`
returns 404, nothing of **`/app/`** is live. Note `/quiz/` **is** live on `origin/main` and its
`onboarding.js` is byte-identical in the parts P2 touches — see C1 below.)
**Task:** the five owner-selected items from the 2026-07-25 production-readiness re-audit
(`wf_406f92d7-a17`). Items 1 (legal pages), 3 (self-host supabase-js) and 8 (inert UI claims) from the same
audit are explicitly **out of this batch**.
**Status:** owner decisions RESOLVED — support address → `info@hskprep.cc` (owner upgrades the mail plan);
Metrika goal handling → delegated to implementer, resolved below on evidence. Design approved, then
**REVISED after a full adversarial spec review** (`wf_4a5a97ac-b73`, 5 lenses × refutation pass; 49 raw
findings → 31 verified). The review's factual audit of ~40 citations came back clean apart from the drift
listed at the end; the substantive corrections it forced are:

1. **`hsk_pay_pending` has two independent readers, not one** — `onboarding.js:82 payPendingFresh()` parses
   the same value with `parseInt` and is the **live** funnel's first duplicate-charge guard. The original
   format change would have silently disabled it (C1).
2. **That key does two different jobs** — access grace *and* charge suppression. The original design gated
   both; only the access half has a security reason to be gated (I1).
3. **The two clients arm the marker on opposite legs** — the funnel on the return, `/app/` on the
   departure — so a mirrored guard 1 means something different in each (I2).
4. **The prescribed Metrika condition shape was wrong** and would have created two goals that never fire —
   the exact failure P5 exists to fix (I3).
5. **P6 cannot be browser-verified by the method originally prescribed** (I4), and the O3 smoke test lost
   its positive half (I5).

READY for implementation planning.
**Prior context:** builds on Groups A–G and the 2026-07-23 batch (see
`[[hsk-app-production-readiness-2026-07-20]]`). The paywall/access model is defined in
`2026-07-21-app-paywall-hardening-design.md`; **P2 amends it** (it changes the `payPending` input to
`decideAccess`). O3 in `2026-07-23-app-prelaunch-hardening-design.md` closed the `/app/?pay=success` URL
disjunct in `auth-guard.js`; **P2 closes the sibling hole one layer up**, in `onboarding.js`.

---

## Why these five

| ID | One line | Class |
|----|----------|-------|
| **P2** | `/quiz/?pay=success` arms the durable pay-grace marker with no proof a checkout ever started — any free account gets 30 min of the paid product, re-armable forever | monetization / access |
| **P4** | A paying customer inside `/app/` has no way to contact anyone; the only "support" string is a dead end | supportability |
| **P5** | The funnel's terminal Metrika goal is a URL goal on `/exams/` that the `/app/` pivot can never satisfy; no `app_error` goal exists at all | observability |
| **P6** | In-app "Extend access" redirects to a real KZT charge without either of the two duplicate-charge guards the funnel has | money |
| **P7** | 66 word-scramble writing items render their deliberate distractors as "Sample answers" — the product teaches ungrammatical Chinese | content correctness |

## Non-goals

- **Not** the legal pages (audit item 1) — that is the launch gate and a business deliverable, tracked separately.
- **Not** self-hosting supabase-js (item 3) or removing the inert RU/notifications/SRS claims (item 8).
- **Not** any change to the sync blob format (G2/L4 stay in their own future cycle).
- **Not** a redesign of the checkout, paywall, or writing-section UI — P2/P6/P7 reuse existing components.
- **Not** deleting or repurposing Metrika goal 579203316 (it holds real data — see P5).

---

## P2 — `/quiz/?pay=success` must not grant access on the strength of a URL

### Problem (verified in current code)

`onboarding.js:1348` dispatches on the raw query param:

```js
if (payResult === 'success') handlePaySuccess();
```

and `handlePaySuccess` (`onboarding.js:1251`) makes its first durable act the arming of the grace marker:

```js
function handlePaySuccess() {
  stripParam('pay');
  lsSet(LS_PAY_PENDING, String(Date.now()));   // onboarding.js:1255
  ...
}
```

`LS_PAY_PENDING` is `'hsk_pay_pending'` (`onboarding.js:33`) — the same key `auth.js:289` documents as
"written by onboarding.js at checkout + armPayPending()" and reads in `isPayPending()` (`auth.js:307`).
That value short-circuits the whole gate, because in `access-decision.js:42` the check sits **above** the
authoritative call:

```js
if (o.cacheFresh) return Promise.resolve({ action: 'show', sub: o.cacheFresh });
if (o.payPending) return Promise.resolve({ action: 'pay-pending' });
return Promise.resolve(o.checkAccess()).then(...)
```

and `auth-guard.js` unveils on `pay-pending`. Accounts are free (the s17 OTP gate creates one without
payment), so: sign up free → open `https://www.hskprep.cc/quiz/?pay=success` → 30 minutes of the full paid
product, renewable indefinitely, via a copy-pasteable URL.

This is **not** the already-fixed O3. O3 removed a `/[?&]pay=success/` test from `auth-guard.js:128`.
The marker-arming path in `onboarding.js` was never touched and is the load-bearing half.

### Design

Introduce a second durable marker that only a real checkout redirect can create, and gate the arming on it.

**New key `hsk_checkout_started`**, value `JSON.stringify({ uid, ts })`, same 30-minute TTL as the pay
window. Written immediately before each real redirect to the acquirer — the two places that build a
`pay.checkoutUrl`/`CHECKOUT_URL` link:

- `onboarding.js` `proceed()` (`:1119`), which already holds `user.id`
- `app/more.js` `confirmPlan` (`:946`), which already holds `authUid`

### The key does two jobs — gate only one of them

`hsk_pay_pending` is load-bearing for **two unrelated purposes**, and conflating them was the original
design's mistake:

| Job | Reader | Grants | Needs gating? |
|---|---|---|---|
| **Access grace** — admit a just-paid user before the webhook lands | `auth.js:307 isPayPending()` → `auth-guard.js:129` | access to the paid product | **YES** — this is the hole |
| **Charge suppression** — "a payment was reported, don't start a second one" | `onboarding.js:82 payPendingFresh()` → `:1137` | nothing; it only *withholds* a charge | **NO** — gating it can only cause double charges |

So `handlePaySuccess` gates only the grace half:

```
marker  = read hsk_checkout_started            (fresh <= 30 min, else null)
graceUid = marker ? marker.uid : null

always: write hsk_pay_pending = { uid: graceUid, ts: now }   // charge suppression, unconditional
grace is granted later only if isPayPending(sessionUid) finds uid != null AND uid === sessionUid
```

- Marker present → `uid` is set → `auth-guard.js` grants grace exactly as today.
- Marker absent → `uid` is `null` → `isPayPending` refuses to match (a `null` uid **never** matches a real
  session uid; the implementation must reject `null === null` explicitly), so no grace — but
  `payPendingFresh()` still sees a fresh `ts` and still blocks a second charge.

This is strictly safer than both the status quo and the first draft. A buyer whose return leg lands in a
storage context with no marker (bank-app deep link, in-app webview handing off to the system browser,
cleared storage) keeps the charge protection they have today and simply does not get a *local* access
bypass — `pollSubscription` and then `check-access` resolve their real server-side entitlement.

### Fold in G4 — uid-scope `hsk_pay_pending`

The value becomes `{ uid, ts }` (uid nullable, per above) and the reader becomes `isPayPending(userId)`,
requiring a non-null match.

`isPayPending` has exactly one production call site, `auth-guard.js:129`, and `userId` is already computed
at `auth-guard.js:111`. **The stored value, however, has two independent readers**, and this is the single
most dangerous edit in the batch:

- readers: `auth.js:307 isPayPending()` and **`onboarding.js:82 payPendingFresh()`**
- writers: `onboarding.js:1255`, `auth.js:316 armPayPending()`
- deleters: `onboarding.js:91/1181/1244/1282`, `auth.js:116`

`payPendingFresh()` does `parseInt(lsGet(LS_PAY_PENDING) || '', 10)`. Against `{"uid":…}` that is `NaN`, so
if only `auth.js` is migrated the funnel's guard 1 returns `false` **forever** — silently, since no test
covers it (it lives inside `onboarding.js`'s un-exported IIFE) and the only signal is the
`checkout_duplicate_prevented{pay_pending}` Metrika event quietly ceasing. That guard protects a **live**
surface: `/quiz/` runs on `origin/main` today with the identical `:82` reader.

**Therefore:** both readers move to the `{uid,ts}` shape in the same commit, and the parse lives in exactly
one place. Export `readPayPending(raw, now) -> {uid, ts} | null` from `auth.js` (already loaded on `/quiz/`
before `onboarding.js`) and have `payPendingFresh()` delegate to it, ignoring `uid` and checking only `ts`.
A legacy bare number is parsed as `{uid:null, ts}`: it still suppresses a charge but grants no access.
**Correction, applied after the implementation review:** an earlier draft of this paragraph said such a
marker parses to `null` "and nothing is live that holds one". That was FALSE — `origin/main`'s live
`/quiz/` writes `String(Date.now())` at `onboarding.js:1255`, so bare markers exist in the wild on deploy
day, and rejecting them outright would have disabled the funnel's guard 1 for every user mid-payment-window
at the moment we ship.

`armPayPending(userId)` gains the uid parameter; its only caller is `app/more.js:969`, which holds
`authUid`. **The call site must actually pass it** — a forgotten argument silently breaks in-app renewal
grace, which is why the prod smoke below tests the positive direction too (I5).

**Where the uid comparison happens — deliberately not in `handlePaySuccess`.** The funnel has no practical
synchronous uid: every uid read goes through the async `HSKAuth.getUser()`. (`HSKAuth.readProfileCache()`
at `auth.js:78` is synchronous, but it is populated only on the **OAuth** branch via `finishOAuthFromUrl`
and never on the OTP path, so it cannot be relied on.) And `handlePaySuccess` must stay synchronous — the
comment at `onboarding.js:1345` states it has to run before the s17 auto-advance can override the forced
screen; introducing an await there would reorder a deliberately ordered init path.

So the uid is **inherited, not looked up**, per the pseudocode above. Enforcement happens at the only place
a real session uid is reliably in hand: `isPayPending(userId)` in `auth-guard.js:129`.

The freeloader case is closed twice over:

- never started a checkout → no marker → `uid` is `null` → `isPayPending` refuses → no grace;
- someone else's checkout on a shared device → marker carries *their* uid → `isPayPending(myUid)` fails at
  the guard → no grace.

**Consume the marker.** `handlePaySuccess` deletes `hsk_checkout_started` after reading it, so one checkout
start mints at most one grace window rather than an unlimited number within its TTL.

**Symmetry on cancel — spell out both keys.** The two clients differ here and the difference matters:

- `onboarding.js:1242 handlePayCancel` already deletes `hsk_pay_pending`; add `hsk_checkout_started`.
- `app/core.js` has **no `pay === 'cancel'` branch at all** today (`stripPayParam` at `:827` special-cases
  only `success`; `:992` is `if (pay === 'success')`), and nothing under `app/` ever deletes
  `hsk_pay_pending`. Add a cancel branch that deletes **both** keys. `/app/` needs the second deletion that
  the funnel gets for free, because `/app/` arms on the departure leg (see P6 guard 1).

`clearStudyProgress` (`auth.js:116`) must add `hsk_checkout_started` to its wipe list, alongside the
`hsk_pay_pending` entry already there.

### Files

| File | Change |
|---|---|
| `onboarding.js` | arm `hsk_checkout_started` in `proceed()`; gate+consume it in `handlePaySuccess`; **migrate `payPendingFresh()` to the shared parse**; delete the new key in `handlePayCancel` |
| `auth.js` | `{uid,ts}` format; export `readPayPending`; `isPayPending(userId)`; `armPayPending(userId)`; add `hsk_checkout_started` to `clearStudyProgress` |
| `auth-guard.js` | pass `userId` into `isPayPending` |
| `app/more.js` | arm `hsk_checkout_started`; pass `authUid` to `armPayPending` |
| `app/core.js` | **new** `pay === 'cancel'` branch deleting both markers |

No generated HTML changes → no `node build.js` required for this item.

### Edge cases

- Storage disabled (Safari Private): no marker can be written, so no grace. Accepted — same disposition as
  the M-2 finding accepted in the 2026-07-23 cycle.
- Two accounts on one device: the uid check is what stops account A's checkout from granting account B grace.
- Marker present but the user abandons checkout at the acquirer and manually types `?pay=success`: they get
  grace for up to 30 minutes. Accepted — they demonstrably started a real checkout for their own uid, the
  window is short, and `check-access` remains the authoritative gate the moment the window closes.
- Re-walking the funnel to the paywall and starting a **new** checkout mints a new marker and therefore a
  new grace window. That is correct — each window is bought by a real checkout start.
- A forged `hsk_checkout_started` written by hand in devtools yields grace for 30 minutes. This design
  raises the bar from "paste a URL" (shareable, zero knowledge) to "edit your own localStorage" (not
  shareable, requires intent); it does not claim to make a client-side marker unforgeable. The
  authoritative gate remains server-side `check-access`, and every client marker in this system carries the
  same caveat — see the Group C spec's non-goals.

---

## P6 — in-app "Extend access" needs the funnel's two duplicate-charge guards

### Problem (verified in current code)

`app/more.js:946` `A.confirmPlan` checks only `canPay()` and then redirects to a real KZT charge. The funnel's
`startCheckout` carries two guards it lacks (`onboarding.js:1137-1155`):

1. `payPendingFresh()` — a payment was reported minutes ago and its webhook has not landed; never start a
   second charge in that window.
2. A fresh `getSubscriptionStatus` / `subActive` re-read — labelled in-code "Last line of defense against a
   double charge": the entitlement may already exist because the webhook landed after the return poll gave up.

The inviting state is reachable: if the webhook lags past the funnel's 6-second poll, the buyer lands in
`/app/` on pay-pending grace, and Profile renders status "—", "No active plan" and an empty billing history
directly beside a prominent "Extend access" button.

### Design

Mirror both guards in `confirmPlan`, in the same order as the funnel:

1. If a **return-leg** pay-pending marker exists for `authUid` → do not charge. Toast that access is still
   being set up and call the existing `App.actions.refreshSubscription(true)`.
2. Else read `HSKAuth.getSubscriptionStatus(authUid)`; if it returns without error and the sub is active →
   do not charge. Refresh the profile view so the user sees the plan they already own.
3. Else proceed exactly as today: fire `begin_checkout`, arm `hsk_checkout_started`,
   `armPayPending(authUid)`, redirect.

**Guard 1 needs a `src` discriminator — the two clients arm on opposite legs.** The funnel arms
`hsk_pay_pending` on the **return** (`onboarding.js:1255`, inside `handlePaySuccess`), so there it truly
means "a payment was reported". `/app/` arms it on the **departure** (`app/more.js:969`, immediately before
`location.href`), so there it means "a checkout was *started*". A naive mirror of guard 1 would therefore
refuse a customer who tapped "Extend access", abandoned at the acquirer (wrong card, OTP timeout, Back,
tab-close) and came back to retry — for up to 30 minutes, with a toast falsely claiming access is being set
up. Tab-close and Back never produce a `?pay=cancel` return, so the cancel branch alone does not cover it.

**Therefore** the marker carries `{ uid, ts, src }` where `src` is `'start'` or `'return'`, and **guard 1
requires `src === 'return'`**. Access grace (`isPayPending`) accepts either — a departure-leg arm is exactly
what makes the in-app renewal return work, which is the reason O3 put it there. Only the *don't-charge-again*
guard is narrowed.

**Guard 2 must not name `subActive`.** That function is private to `auth.js:531` and is absent from the
`HSKAuth` export block, so it is unreachable from `app/more.js`. Use the canonical shared copy
`HSKAccess.subActiveOf(res.sub, Date.now())` (`access-decision.js:12`, loaded at `app/index.html:8`).
Do **not** use `subInfo().active` (`app/more.js:107`): it reads stale state and treats a missing
`expires_at` as INACTIVE, where `auth.js` and the `check-access` edge function both treat it as ACTIVE —
using it would refuse a renewal for a subscriber whose row lacks an expiry.

**Structural consequence.** `confirmPlan` is synchronous today and ends in `location.href = url`. Guard 2 is
asynchronous, so the function becomes promise-based. It therefore needs the funnel's liveness guard pattern
(`onboarding.js:1110` `live()`): capture the open plan sheet on entry and abort every terminal action if the
user closed it while the read was in flight. Without this, a dismissed sheet could still navigate the user to
the acquirer.

**Analytics ordering is preserved.** `begin_checkout` must still fire only when a real cross-domain redirect
is imminent — i.e. in step 3, after both guards have passed, exactly as `onboarding.js:1121` does. A guard
that fires must not emit it.

A transient read failure must **not** block a legitimate renewal: on error, fall through to the charge (the
funnel does the same via `.catch(proceed)`). The server-side ledger fold remains the backstop.

### Files

`app/more.js` only. Verified: `app/desktop-more.js:558` renders its own plan button but emits the same
`data-a="confirmPlan"` action, which dispatches to the shared `A.confirmPlan` at `app/more.js:946` — the
in-code comment at `app/desktop-more.js:165` confirms the desktop copy is "UI-only". One implementation
covers both clients.

---

## P4 — a support path inside the paid product

### Problem (verified in current code)

There is no support, help or contact route anywhere in `/app/`. Zero `mailto:` links exist under `app/`.
The only occurrence of the word is a dead end shown twice — `app/more.js:758` and `app/desktop-more.js:480`:

> Contact support to change email

with no address given. This is also the recovery path the payments runbook explicitly anticipates
(`supabase/PAYMENTS_SETUP.md` on double charges).

### Design

Single constant, one address, used in three places.

**Address:** `info@hskprep.cc` — owner's decision. It is already the public contact on the landing
(`index.html:786`), so no new mailbox has to exist for the link to work.

**Placement — four sites, not three.** The desktop client has **no More list**: `app/desktop-shell.js:231`
maps `tab === 'more'` straight to the Profile screen, so there is no list to add a row to.

1. A "Help & support" row in the **mobile** More screen (`app/more.js` `MORE_ITEMS` neighbourhood),
   rendered as a real `<a href="mailto:…">` (not a `data-a` action) so it needs no JS wiring and is
   keyboard/AT-native.
2. The equivalent row on the **desktop Profile screen** rendered by `app/desktop-more.js`.
3. + 4. Both "Contact support to change email" strings (`app/more.js:758`, `app/desktop-more.js:480`)
   become that link.

**Subject line:** prefill `?subject=` with a fixed, non-personal string so inbound mail is triageable —
e.g. `HSK Prep support`. No user data goes in the mailto (no email, name, uid) — putting personal data in a
URL is exactly what the M3 privacy pass removed from other surfaces.

### Files

`app/more.js`, `app/desktop-more.js`.

### Operational prerequisite (NOT code — owner action, launch-gating)

`hskprep.cc` mail is currently a **1-seat trial** (`business_s_v2_trial`, order `ORe4dc935a0f6cbec6a7fa2a20c7e9`)
that **expires 2026-07-31**. The single mailbox `info@hskprep.cc` is live and has received mail
(`messages_used: 11`, `storage_used: 188`, last synced 2026-07-26), so the address works today — the problem
is purely the expiry.

Shipping a support link into a mailbox whose plan lapses in days is worse than shipping none. Before launch
the owner must (a) move the mail order off trial, and (b) confirm someone actually monitors that inbox. This
goes in the deploy runbook as a blocking checklist item.

---

## P5 — Metrika goals so launch day is observable

### Problem (verified against the live counter API)

Counter **110455584**:

- Goal **579203316 "App entered"** is `type: "url"` with condition `contain /exams/`. After the post-auth
  routing pivot to `/app/`, no subscriber path produces an `/exams/` URL, so the funnel's terminal step can
  never fire — the purchase funnel will read 0% conversion at the last step for reasons unrelated to the
  product.
- There is **no `app_error` goal at all**, although the client already emits it: `app/index.html:61` (runtime
  error reporter, capped at 5 per session) and `:82` (boot failure).
- `app_enter` is already emitted by `app/core.js:998`.

Measured over 2026-06-01…2026-07-26: goal 579203316 has **93 reaches**, "Purchase" has **0** (consistent
with zero real payments ever settling), "Landing CTA" has 47, across 290 visits.

### Design

**No client code changes.** Both events already fire through `window.ymGoal` (`app/index.html:48`). This item
is pure counter configuration plus one owner UI step.

**Create two goals** with goal-level `type: 'action'` and conditions
`[{ type: 'exact', url: 'app_error' }]` and `[{ type: 'exact', url: 'app_enter' }]`.

⚠️ The condition type is **`exact`**, not `action`. `action` is the *goal-level* field; every existing
action goal on this counter uses an `exact` condition — verbatim, `579203255 "Landing CTA"` is
`type:"action"` with `conditions:[{"type":"exact","url":"landing_cta"}]`, and `579203299 "Purchase"`,
`ob_start`, `ob_email_view`, `auth`, `paywall_view`, `begin_checkout` all follow the same shape. The
`create_goal` condition enum *accepts* `action`, so a malformed call is silently accepted rather than
rejected, and produces a goal that never matches `reachGoal('app_enter')` — reproducing precisely the
0%-terminal-step failure P5 exists to fix.

**Because P5 is 100% configuration** ("No client code changes"), no test and no build step can catch a
mistake here. Verification is therefore part of the deliverable: after creating the goals, re-run
`list_goals` and confirm both conditions read `exact`; then load `/app/` once from a real session and
confirm `app_enter` records a non-zero reach **before** re-pointing the funnel report.

**Leave 579203316 alone.** Two reasons, both decisive:

1. It holds 93 real conversions. They are mislabeled relative to the goal's *name*, but they are genuine
   `/exams/` page views — real data, not noise. Deleting it destroys that history, and destroying data is not
   something to do as a side effect of a wiring fix.
2. The Metrika MCP surface offers `create_goal` and `delete_goal` but **no `update_goal`** — the goal's type
   and conditions cannot be edited programmatically at all. "Repurpose in place" is not available.

**Owner UI follow-up (runbook item):** rename 579203316 to something honest such as "Legacy /exams/ views",
and re-point the built funnel report «Воронка: лендинг → покупка» from it to the new `app_enter` goal. Until
that is done the funnel report keeps reading the legacy goal.

### Separately noted, NOT in this batch

`supabase/functions/grant-entitlement/index.ts:73` returns HTTP 200 `ok:true` when `apply_hsk_entitlement`
errors, so the acquirer never retries and a charged customer can be silently un-granted. That is a
server-side change with its own deploy and is tracked as a fast-follow, not part of P5. The reconciliation
query (paid `payments` rows whose user has no active `profiles.subscription`) belongs on the launch
checklist regardless.

---

## P7 — word-scramble distractors must not be shown as "Sample answers"

### Problem (verified in current code and in `data/`)

`app/exam.js:152-166` normalizes every `writing_construction` item as self-check and keeps **all** options
as model answers:

```js
out.selfCheck = true;
out.modelAnswers = options.slice();
out.options = [];
```

The in-code comment justifies this with "the source has no correct_answer_index" — **that premise is false**.
All 126 multi-option writing items carry one. `writeModelHtml` (`app/exam.js:909`) then renders the whole
array under "显示参考答案 · Sample answers".

The 126 items are two different tasks:

| Family | Count | Stem shape | Options |
|---|---|---|---|
| **Compose** (`造句` / `看图造句`) | 60 (5 per paper × 12) | "用『X』造句", often with an image | every option is a **valid** model sentence — `test-02` Q96 says so literally: `下面每个选项都是对的` |
| **Scramble** (`把…组成句子` / `组句` / `完成句子` / bare word list) | 66 | a space-separated word list to reorder | **typically one** is grammatical and the rest are deliberate permutation salad; a minority admit a second valid word order (see below) |

The corpus also holds **84 single-option** `writing_construction` items (210 total), which this change must
leave alone — see the arity precondition below.

**The minority case, stated honestly.** All 66 stored `correct_answer_index` values are grammatical, so this
change can never promote wrong Chinese. But roughly 15 items admit a *second* valid ordering that showing
only the key will hide — e.g. `test-02` Q86, where both `她很羡慕会弹钢琴的人。` and the keyed
`会弹钢琴的人很羡慕她。` are correct Chinese with different meanings; also `test-02` Q91/Q95, `test-03` Q91,
`test-04` Q90/93/94, `test-05` Q94, `test-09` Q89, `test-12` Q86/87/93. The trade is still clearly worth it:
today those items show ~3 ungrammatical sentences as "Sample answers", and after the change they show one
grammatical sentence and hide one grammatical alternative. Do **not** "fix" this by rewriting
`correct_answer_index` in `data/` — both orderings are valid and those keys are already the published
answers in the committed static pages.

Example, `test-08` Q86 — stem `把下列词语组成一个完整的句子：质量 你的 怎么样 笔记本电脑`, `correct_answer_index: 1`:

```
[0] 质量你的怎么样笔记本电脑？   ← ungrammatical, currently shown as a "Sample answer"
[1] 你的笔记本电脑质量怎么样？   ← the only correct sentence
[2] 笔记本电脑你的质量怎么样？   ← ungrammatical
[3] 怎么样质量你的笔记本电脑？   ← ungrammatical
```

书写 is the one section where self-assessment **is** the grading mechanism, so the learner is being taught
wrong Chinese in the exact place they have nothing else to check against.

### Design — the classifier

`correct_answer_index` does **not** discriminate the two families (all 126 have one). Two signals do, and
their **union** is complete. Classify an item as *scramble* when it has **at least two options** AND
**either** of:

1. **Permutation test** — every option reduces to the same character multiset (whitespace and CJK/ASCII
   punctuation stripped). Compose options are different sentences entirely; scramble options are reorderings.
2. **Stem marker** — the stem contains `组成` together with `句子`, or `连词成句`, or `组句`.

⚠️ **The arity precondition is load-bearing, not a formality.** A 1-element array *vacuously* satisfies
"every option reduces to the same multiset", so a literal implementation without `options.length >= 2`
classifies all 84 single-option items as scramble too — 150 instead of 66. The behaviour happens to be inert
there (showing "the only option" equals showing "all options"), but the classifier would be reporting
nonsense and the tests would encode it.

Measured over all 126 items:

| Rule | Scramble found | False positives on the 60 compose items |
|---|---|---|
| Permutation only | 64 / 66 | 0 |
| Stem marker only | 55 / 66 | 0 |
| **Union** | **66 / 66** | **0** |

The permutation test alone misses exactly two, both genuine scrambles with a one-character irregularity:
`test-02` Q89 (a distractor drops 的) and `test-11` Q87 (the key substitutes 许多人 for 很多人). The stem
marker catches both. Conversely the stem marker alone misses 11 items the permutation test catches — the
`完成句子：` block in `test-12` (Q86-95) and the bare word list at `test-05` Q94, neither of which uses a
recognizable marker.

### Design — the behaviour

In `normalizeQ`'s `writing_construction` branch:

- **Scramble** *and* a valid `correct_answer_index` in range → `out.modelAnswers = [options[idx]]`.
- **Everything else** → unchanged (`options.slice()`).

`writeModelHtml` needs no change: it already branches on `ans.length > 1` to choose between the
"Sample answers" list and the single "Model answer" block, and `app/desktop-exam.js` reuses the same
function.

**Failure direction.** A future paper whose scramble items match neither signal falls through to today's
behaviour (all options shown). That is a known, bounded gap — the same defect as today, not a new one — and
is preferable to the inverse, where a misclassified compose item would hide 3-10 legitimate model sentences
from the learner.

**Guard.** If `correct_answer_index` is missing or out of range on an item classified as scramble, keep all
options rather than crash or show nothing. The guard must read the **raw** `q.correct_answer_index`, not
`normalizeQ`'s local `correct` variable — `app/exam.js:118` already coerces an absent index to `0`, which
would make "missing" indistinguishable from "the first option is the answer".

No item in `data/` currently trips this guard (all 210 items carry an in-range index), so it is defensive
cover for future papers and must be tested with synthetic fixtures rather than real data.

**No-op on the official papers.** `test-13` and `test-14` carry only single-option writing items, so the
arity precondition alone excludes them; the official shared-track model is untouched.

### Files

`app/exam.js` only. The classifier is extracted as a named pure function and exposed on the `App.exam`
namespace for the test harness, following the `normalizeTest` / `gradeSections` precedent.

---

## Cross-cutting

**Ordering constraint (P2 × P6).** In `confirmPlan`, `hsk_checkout_started` must be armed on the same code
path as `armPayPending`, *after* both P6 guards have passed and immediately before the redirect. Arming it
earlier would let a guard-aborted attempt leave a marker behind that a later hand-typed `?pay=success` could
consume.

**Do not move `armPayPending` out of `app/more.js`.** `auth-guard.js` is loaded at `app/index.html:9`, before
`core.js` at `:65`; arming on the return leg instead of the departure leg would bounce a genuine just-paid
renewer.

**Storage keys touched:** `hsk_pay_pending` (format change: number → `{uid, ts, src}`, **two readers across
two files — see C1**) and `hsk_checkout_started` (new, `{uid, ts}`). Neither is part of the synced
`profiles.progress` blob, so no blob-format migration is involved and G2/L4 stay untouched. `app/sync.js`
syncs an explicit key list and does not pick up `hsk_*` keys, so neither marker leaks cross-device.

**Docs to re-sync after implementation** (the repo does this as its own `docs: sync…` commit):
`docs/hskprep_functional_spec.md:443` describes `hsk_pay_pending` as a bare timestamp, `:430` carries the
test inventory this batch changes, and `:246` states what `?reset=1` does and does not clear — which now
needs a disposition for `hsk_checkout_started`.

**No rebuild required.** Every file is `<script src>` source or app module; no generated HTML is touched, so
`node build.js` / `inject-auth` are not needed for correctness. The build must still be run and verified
drift-free before merge, as a standing pre-merge check.

---

## Test plan

New and extended `node --test` cases, zero npm deps, following the existing harness conventions
(`scripts/*.test.js`; load the real module under a minimal mocked `window`/`global.document`).

**P7 — `scripts/writing-models.test.js` (new), driven by the real `data/test-*.json`:**
- all 66 scramble items normalize to exactly one model answer, and it equals `options[correct_answer_index]`
- all 60 compose items keep every option
- the two irregular scrambles (`test-02` Q89, `test-11` Q87) are classified via the stem arm
- an item with no `correct_answer_index` keeps all options
- an out-of-range index keeps all options
- a compose item with an image is never classified as scramble

**P2 — extend `scripts/access-authjs.test.js`:**
- `isPayPending(uid)` is false for a marker belonging to a different uid
- `isPayPending(uid)` is false for a legacy bare-number marker
- `isPayPending(uid)` is false when the marker's `uid` is `null` (the no-checkout-marker case) — explicitly
  assert that `null` does not match a `null`/absent session uid either
- `isPayPending(uid)` is true only for a fresh matching marker, and false past the TTL
- `armPayPending(uid)` writes a uid-scoped marker
- `readPayPending` returns `{uid,ts,src}` for both `src` values, and `{uid:null,ts,src:'return'}` for a legacy bare number (charge suppression survives deploy day; no grace)

⚠️ **Two existing cases encode the pre-G4 contract and must be rewritten, not preserved:**
`scripts/access-authjs.test.js:90-95` and `:105-110` both call `isPayPending()` with no argument against a
bare-number marker and assert `true`. The regression bar is "suite green **after** those two edits", not
"suite unchanged". Resolve them by moving to the uid-scoped contract — **not** by making the no-arg form
accept a bare number, which would reinstate the hole.

`clearStudyProgress` is private (`auth.js:109`) and not on the `HSKAuth` export, so it cannot be called
directly from a test. Cover the new key by extending the existing sign-out case at
`scripts/access-authjs.test.js:96` that already asserts both grace markers are cleared.

**P2 — checkout-marker gate.** A pure helper `payGraceUid(rawMarker, now)` extracted so the decision is
testable without loading the funnel. Returns the uid to inherit, or `null`: fresh marker → its uid;
expired → `null`; absent → `null`; malformed JSON → `null`; marker without a uid → `null`. It takes no uid
argument — the arming step inherits rather than verifies, and verification happens in `isPayPending(userId)`.

**P2 — the C1 regression that has no coverage today.** Assert that a `{uid,ts}` marker still satisfies the
funnel's charge-suppression path. Since `payPendingFresh` is IIFE-private, test the shared
`readPayPending(raw, now)` it will delegate to: a `{uid:null, ts:now}` marker must still yield a fresh `ts`
(charge suppressed) while `isPayPending(someUid)` returns false (no grace). That pair of assertions is the
whole point of the C1/I1 decoupling and must not be omitted.

**P6 — `confirmPlan` guards.** Test the extracted decision, not the redirect: return-leg pay-pending →
`'skip-pending'`; **departure-leg (`src:'start'`) pay-pending → `'charge'`** (the I2 case — a retry after an
abandoned checkout must not be refused); active subscription → `'skip-active'`; read error → `'charge'`;
clean → `'charge'`.

**P7 — arity:** assert the 84 single-option items are **not** classified as scramble.

**Regression:** the full suite (currently 76 node + 12 Deno) must stay green after the two rewrites above.

## Verification plan

Browser-verify both clients via the established placeholder-`config/auth.js` swap-and-restore (the real
config is git-tracked; restore it before committing):

- P7: open a paper with scramble items (`test-08` Q86) → exactly one model answer under "Model answer";
  open a 造句 item (`test-01` Q96) → all 11 still listed under "Sample answers". Both clients.
- P4: the support row renders and is a real `mailto:` in both clients; both former dead strings link.

⚠️ **P6 cannot be verified by the placeholder-config method — do not try.** With the placeholder in place
`HSKAuth.isConfigured()` is false, so `canPay()` (`app/more.js:789`) is false and `A.confirmPlan` returns at
`:947` **before reaching any guard**; the desktop button is not even rendered with a `data-a` attribute
(`app/desktop-more.js:558-559` renders a disabled "Sign in to extend"). "Nothing navigates" would therefore
pass for entirely the wrong reason while exercising none of the new logic. P6 is covered by its unit test
plus the prod smoke below; if a browser check is wanted, it must use the **real** config with a signed-in
account and a stubbed `getSubscriptionStatus`.

Cache gotcha from prior cycles: the in-app browser caches `app/*.js`. Fetch each changed module with
`{cache:'reload'}` and reload before trusting live globals.

**Prod smoke — both directions.** P2 changes the marker format, the `armPayPending` signature and its sole
call site, so the negative test alone is not enough: a forgotten argument at `app/more.js:969` would break
genuine renewals and still pass a negative-only check.

- **Negative:** a signed-in **free** account visiting `/quiz/?pay=success` does **not** obtain a working
  `/app/`.
- **Positive (restored from the O3 smoke):** in-app "Extend access" → acquirer → return to
  `/app/?pay=success` → the app unveils on the uid-scoped marker.
- **Charge suppression (C1/I1):** immediately after a `?pay=success` return, re-entering the funnel at s22
  and pressing Pay must still be refused by guard 1 rather than starting a second charge.

## Risks

| Risk | Mitigation |
|---|---|
| P2 strands a genuine payer with no local marker | They keep S25 + server poll, **and they keep local charge suppression** — only the access grace is withheld (C1/I1 decoupling). Note `check-access` is precisely what returns `inactive` during webhook lag, so it is not the mitigation here; the retained charge guard is. |
| The `hsk_pay_pending` format change breaks the live funnel's guard 1 | Both readers migrate in the same commit behind one shared `readPayPending`; a dedicated regression test asserts a `{uid,ts}` marker still suppresses a charge. |
| P2's uid threading breaks in-app renewal grace | `armPayPending(uid)` unit test **plus** the positive half of the prod smoke — a unit test cannot catch a call site that forgets the argument. |
| P6 guard 1 refuses a retry after an abandoned checkout | The `src` discriminator: guard 1 requires `src === 'return'`, so a departure-leg arm never blocks a retry. |
| P5's goals are created with the wrong condition type and silently never fire | Post-create `list_goals` check plus one real `app_enter` reach observed before the funnel report is re-pointed. |
| P7 hides a second valid word order on ~15 items | Accepted and documented: the alternative is showing ~3 ungrammatical sentences on all 66. Keys are never rewritten in `data/`. |
| P6's async rewrite lets a dismissed sheet still redirect | Port the funnel's `live()` liveness guard; abort every terminal action. |
| P6 blocks a legitimate renewal on a flaky read | Read errors fall through to the charge, matching the funnel's `.catch(proceed)`. |
| P7 misclassifies a future compose item as scramble, hiding valid models | Union rule has 0 false positives on all 126 shipped items; the fallback direction is today's behaviour. Test asserts the compose family stays intact. |
| P4 ships a link to a mailbox that expires 2026-07-31 | Blocking runbook item: owner moves the mail order off trial and confirms someone reads it. |
| P5 leaves the funnel report reading a stale goal | Runbook item: owner renames 579203316 and re-points the report after the new goals exist. |

---

## Post-implementation corrections (adversarial impl review `wf_5c934f3e-4c4`, 26 raw → 12 verified)

Zero CRITICAL. Three findings changed shipped behaviour and are now part of the design:

**1. The `/app/` return leg must PROMOTE its own marker (I2's blind spot).** `/app/` arms on the departure
leg with `src:'start'`, and nothing converted it on the return — so `isPayReported()` was false for the only
kind of purchase `/app/` starts, and P6's guard 1 could never fire for an in-app renewal. A lagging webhook
plus a second tap of "Extend access" would have run a second real KZT charge. Note the spec's own
problem-statement scenario (a *funnel* purchase observed in `/app/`) was always guarded, since that marker
carries `src:'return'`; the gap was in-app-originated checkouts specifically.

**2. A `?pay=success` replay must not downgrade a genuine payer.** `consumeCheckoutStarted()` is
read-and-delete, so a second run of `handlePaySuccess` armed `uid:null` over a live `{uid,src:'return'}`
marker and revoked that payer's grace.

**Both are fixed by ONE new helper, `HSKAuth.returnGraceUid()`**, because both legs ask the same question —
"which uid should this return leg grant grace to?":

1. the consumed checkout-start proof, when this device really began a checkout;
2. else whatever a still-live marker already carries — which both prevents the replay downgrade **and**
   promotes an `/app/` `src:'start'` marker to `src:'return'`;
3. else `null` — no proof, no grace (the hand-typed-URL case).

`onboarding.js handlePaySuccess` and the new `app/core.js` `pay === 'success'` branch both call it. I2 is
preserved: an *abandoned* checkout never produces a `?pay=success` return, so it still holds only
`src:'start'` and a retry is never refused.

**3. `planSeq` was inert.** The token meant to guard dismiss-then-reopen was incremented only inside
`confirmPlan`, and since `payInFlight` already prevents overlapping calls, `seq === planSeq` was always
true — `live()` degenerated to exactly the `!!S().planSheet` check its own comment called inadequate. A user
who dismissed the sheet mid-read and reopened it would have been sent to the acquirer with the
*previously* selected plan while the sheet showed another. `A.openPlans`/`A.closePlans` now bump the token,
and the plan is re-resolved from live state at charge time so the amount always matches what is on screen.

Also corrected: two false comment clauses in `app/exam.js` (the "source has no `correct_answer_index`"
claim, and the over-broad "every compose option is valid" claim — 20 picture-prompt items in
`test-08..11` Q96-100 have options that contradict the picture; grammatical, so no wrong Chinese is taught,
recorded as a **deferred content gap** outside P7's scope), and `onboarding.js`'s now-dead
`PAY_PENDING_TTL_MS` was removed since `payPendingFresh` delegates to `auth.js`'s copy.
