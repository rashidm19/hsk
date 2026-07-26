# Design — `/app/` pre-launch batch 2 (P2 · P4 · P5 · P6 · P7)

**Date:** 2026-07-26
**Branch:** claude/dev (68 commits ahead of `origin/main`, **not pushed** — `https://www.hskprep.cc/app/`
returns 404, nothing of this work is live)
**Task:** the five owner-selected items from the 2026-07-25 production-readiness re-audit
(`wf_406f92d7-a17`). Items 1 (legal pages), 3 (self-host supabase-js) and 8 (inert UI claims) from the same
audit are explicitly **out of this batch**.
**Status:** owner decisions RESOLVED — support address → `info@hskprep.cc` (owner upgrades the mail plan);
Metrika goal handling → delegated to implementer, resolved below on evidence. Design approved. READY for
implementation planning.
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

`handlePaySuccess` becomes conditional:

```
marker = read hsk_checkout_started
armGrace = marker exists AND fresh (<= 30 min) AND marker.uid === current session uid
```

- `armGrace === true` → behave exactly as today (arm `hsk_pay_pending`, S25, poll).
- `armGrace === false` → **still** strip the param, still show S25, still poll the server. Grant **no**
  grace. The funnel's own content is ungated, and `pollSubscription` confirms a genuine entitlement from
  the server within seconds; if the server says no, the normal paywall applies.

This keeps the one genuine false-negative safe: a buyer who pays on their phone and opens the return link
in a different browser has no local marker, but their server-side entitlement is real, so the poll resolves
and `recordEntitlement` warms every cache. They are never stranded — they simply do not get a *local*
30-minute bypass they do not need.

**Where the uid comparison happens — deliberately not in `handlePaySuccess`.** No uid is available
synchronously in the funnel: every uid read goes through the async `HSKAuth.getUser()`, and
`handlePaySuccess` must stay synchronous (the comment at `onboarding.js:1345` states that it has to run
before the s17 auto-advance can override the forced screen). Introducing an await there would reorder a
deliberately ordered init path.

So the uid is **inherited, not looked up**: `handlePaySuccess` arms
`hsk_pay_pending = { uid: marker.uid, ts: now }`, taking the uid from the checkout marker — which was
written at `proceed()`, where `user.id` was genuinely known. Enforcement then happens at the only place a
real session uid is reliably in hand: `isPayPending(userId)` in `auth-guard.js:129`.

The security property survives intact, and the freeloader case is closed twice over:

- never started a checkout → no marker → nothing to arm → no grace;
- someone else's checkout on a shared device → marker carries *their* uid → `isPayPending(myUid)` fails at
  the guard → no grace.

**Fold in G4 — uid-scope `hsk_pay_pending` itself.** Today it is a bare timestamp, so it is not bound to
an account. Change the stored value to `{ uid, ts }` and change the signature to `isPayPending(userId)`,
requiring a match. Production call sites: exactly one, `auth-guard.js:129`, and `userId` is already
computed twelve lines above at `:117`. `armPayPending()` (`auth.js:316`) takes the uid too; its only
caller is `app/more.js:969`, which holds `authUid`.

Backward compatibility: a legacy bare-number value is treated as **no match**. Nothing is live and no such
marker exists in the wild, so the only theoretical cost is one lost grace window — the safe direction.

**Symmetry on cancel.** `handlePayCancel` (`onboarding.js:1242`) already deletes `hsk_pay_pending`; it must
also delete `hsk_checkout_started`. The `/app/` side (`app/core.js` `stripPayParam` at `:827`, consumed at
`:992`) must do the same for `pay === 'cancel'`.

`clearStudyProgress` (`auth.js:116`) must add `hsk_checkout_started` to its wipe list, alongside the
`hsk_pay_pending` entry already there.

### Files

`onboarding.js`, `auth.js`, `auth-guard.js`, `app/more.js`, `app/core.js`.
No generated HTML changes → no `node build.js` required for this item.

### Edge cases

- Storage disabled (Safari Private): no marker can be written, so no grace. Accepted — same disposition as
  the M-2 finding accepted in the 2026-07-23 cycle.
- Two accounts on one device: the uid check is what stops account A's checkout from granting account B grace.
- Marker present but the user abandons checkout at the acquirer and manually types `?pay=success`: they get
  grace for up to 30 minutes. Accepted — they demonstrably started a real checkout for their own uid, the
  window is short, and `check-access` remains the authoritative gate the moment the window closes.

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

1. If `HSKAuth.isPayPending(authUid)` → do not charge. Toast that access is still being set up and call the
   existing `App.actions.refreshSubscription(true)`.
2. Else read `HSKAuth.getSubscriptionStatus(authUid)`; if it returns without error and `subActive(sub)` →
   do not charge. Refresh the profile view so the user sees the plan they already own.
3. Else proceed exactly as today: arm `hsk_checkout_started`, fire `begin_checkout`, `armPayPending(authUid)`,
   redirect.

**Structural consequence.** `confirmPlan` is synchronous today and ends in `location.href = url`. Guard 2 is
asynchronous, so the function becomes promise-based. It therefore needs the funnel's liveness guard pattern
(`onboarding.js:1108` `live()`): capture the open plan sheet on entry and abort every terminal action if the
user closed it while the read was in flight. Without this, a dismissed sheet could still navigate the user to
the acquirer.

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

**Placement:**
1. A "Help & support" row in the mobile More screen and its desktop counterpart, rendered as a real
   `<a href="mailto:…">` (not a `data-a` action) so it works with no JS wiring and is keyboard/AT-native.
2. Both "Contact support to change email" strings become that link.

**Subject line:** prefill `?subject=` with a fixed, non-personal string so inbound mail is triageable —
e.g. `HSK Prep support`. No user data goes in the mailto (no email, name, uid) — putting personal data in a
URL is exactly what the M3 privacy pass removed from other surfaces.

### Files

`app/more.js`, `app/desktop-more.js`.

### Operational prerequisite (NOT code — owner action, launch-gating)

`hskprep.cc` mail is currently a **1-seat trial** (`business_s_v2_trial`, order `ORe4dc935a0f6cbec6a7fa2a20c7e9`)
that **expires 2026-07-31**. The single mailbox `info@hskprep.cc` has `storage_used: 0`, `messages_used: 0`
and `synced_at: null` — nothing has ever arrived in it and nobody has ever opened it.

Shipping a support link into a mailbox that expires in days is worse than shipping none. Before launch the
owner must (a) move the mail order off trial, and (b) confirm someone actually reads that inbox. This goes
in the deploy runbook as a blocking checklist item.

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

**Create two `action` goals:** `app_error` and `app_enter`, conditions `{ type: 'action', url: '<name>' }`,
matching the convention every existing action goal on this counter uses (e.g. `landing_cta`, `purchase`).

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
| **Scramble** (`把…组成句子` / `组句` / `完成句子` / bare word list) | 66 | a space-separated word list to reorder | exactly **one** is grammatical; the rest are deliberate permutation salad |

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
their **union** is complete. Classify an item as *scramble* when **either** holds:

1. **Permutation test** — every option reduces to the same character multiset (whitespace and CJK/ASCII
   punctuation stripped). Compose options are different sentences entirely; scramble options are reorderings.
2. **Stem marker** — the stem contains `组成` together with `句子`, or `连词成句`, or `组句`.

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
options rather than crash or show nothing.

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

**Storage keys touched:** `hsk_pay_pending` (format change: number → `{uid,ts}`), `hsk_checkout_started`
(new). Neither is part of the synced `profiles.progress` blob, so no blob-format migration is involved and
G2/L4 stay untouched.

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
- `isPayPending(uid)` is true only for a fresh matching marker, and false past the TTL
- `armPayPending(uid)` writes a uid-scoped marker
- `clearStudyProgress` removes `hsk_checkout_started`

**P2 — checkout-marker gate.** A small pure helper `payGraceUid(rawMarker, now)` extracted so the decision is
testable without loading the funnel. It returns the uid to inherit, or `null` for "arm nothing":
fresh marker → its uid; expired → `null`; absent → `null`; malformed JSON → `null`; marker without a uid →
`null`. Note it takes no uid argument — per the design above, the arming step inherits the uid rather than
verifying it, and verification happens in `isPayPending(userId)`.

**P6 — `confirmPlan` guards.** Test the extracted decision, not the redirect: pay-pending → `'skip-pending'`;
active subscription → `'skip-active'`; read error → `'charge'`; clean → `'charge'`.

**Regression:** the full suite (currently 76 node + 12 Deno) must stay green.

## Verification plan

Browser-verify both clients via the established placeholder-`config/auth.js` swap-and-restore (the real
config is git-tracked; restore it before committing):

- P7: open a paper with scramble items (`test-08` Q86) → exactly one model answer under "Model answer";
  open a 造句 item (`test-01` Q96) → all 11 still listed under "Sample answers". Both clients.
- P4: the support row renders and is a real `mailto:` in both clients; both former dead strings link.
- P6: with a mocked active subscription, "Extend access" does not navigate.

Cache gotcha from prior cycles: the in-app browser caches `app/*.js`. Fetch each changed module with
`{cache:'reload'}` and reload before trusting live globals.

P2's redirect behaviour needs a real session and is a **prod smoke item**, not locally verifiable: after
deploy, confirm that a signed-in free account visiting `/quiz/?pay=success` does **not** obtain a working
`/app/`.

## Risks

| Risk | Mitigation |
|---|---|
| P2 strands a genuine payer with no local marker | They keep S25 + server poll; only the local grace is withheld. `check-access` is authoritative and resolves within seconds. |
| P6's async rewrite lets a dismissed sheet still redirect | Port the funnel's `live()` liveness guard; abort every terminal action. |
| P6 blocks a legitimate renewal on a flaky read | Read errors fall through to the charge, matching the funnel's `.catch(proceed)`. |
| P7 misclassifies a future compose item as scramble, hiding valid models | Union rule has 0 false positives on all 126 shipped items; the fallback direction is today's behaviour. Test asserts the compose family stays intact. |
| P4 ships a link to a mailbox that expires 2026-07-31 | Blocking runbook item: owner moves the mail order off trial and confirms someone reads it. |
| P5 leaves the funnel report reading a stale goal | Runbook item: owner renames 579203316 and re-points the report after the new goals exist. |
