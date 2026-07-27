# Design — `/app/` pre-launch batch 3 (six independent packages)

**Date:** 2026-07-26
**Branch:** claude/dev @2debd1d7, 82 commits ahead of `origin/main`, **not pushed**.
`https://www.hskprep.cc/app/` is 404 — none of `/app/` is live. **`/quiz/`, `/login/` and the landing ARE
live** on `origin/main` = e405eda, which matters for package A.
**Task:** audit items 4 (self-host supabase-js), 5 (grant-entitlement + alerting), 6 (inert product claims)
and **all fifteen** first-week fast-follow items from the 2026-07-25 re-audit.
**Explicitly out of scope:** anything touching **localization**. The dead RU interface row
(`app/more.js:783`, `app/desktop-more.js:984`) stays exactly as it is and becomes its own task before
launch, per owner instruction.
**Status:** design approved. Owner decisions resolved — **L4 + G2 ship together as their own cycle**
(package F); the **Notifications row stays and defaults OFF** (package B).
**Grounding:** every item below was re-verified against the real code by `wf_2b3f67a6-9c8` (6 parallel
readers, 19 items, **all 19 STILL_OPEN**). Several audit descriptions were wrong; the corrections are
called out inline because three of them change the fix.
**Revised after a full adversarial spec review** (`wf_307cb7ff-428`, 5 lenses; 41 raw findings → 34
verified — 4 lenses machine-refuted, the 5th's 12 findings hand-verified against code one by one after its
refutation agent stalled). The substantive corrections: B1 gained the full bump procedure, the
exact-SB_TAG guard key and the cumulative strip pattern (a literal reading would have recreated the
swallow bug one version later, and a bump would have stranded the live `/login/`); B2 now updates the
published StudyBox contract in the same commit and defines a give-up threshold; B2b's alert names its
mechanism (in-function Resend send — Supabase has no alert-on-log feature and Log Drains cannot ship in a
deploy); B3a's desktop edit targets the heading and aria-label, where the cadence claim actually lives;
F3 became `min(DECK_SIZE, unmastered)` with the all-mastered state and the live-update writers specified;
F4's refund is one-shot because `clipFail` fires twice per failure; F6 grew from 4 sites to the full
11 + 7 inventory including the MOBILE chrome washes; F11 buffers reports until `ymGoal` exists and
classifies third-party noise out of the cap; F12 enumerates all five clobber sites with an append-only
rule for attempts; F8's stale `:669` citation became `:683` + desktop mirror; F14 routes the desktop
duplicate through the same helper.

---

## Why six packages and not one batch

The seventeen items span six unrelated subsystems: a vendored dependency, an edge function plus
monitoring, product copy, the render/focus path, client failure handling, and the synced blob format.
They share no machinery, they fail in different ways, and they are verified by different means. One
monolithic cycle would make the review useless — a reviewer cannot hold "is this CSS fallback right" and
"does this blob migration lose data" in the same pass.

Each package below is independently shippable and independently reviewable. **Package F additionally gets
its own implementation plan and its own adversarial review**, following the precedent set by Group A3 and
Group C: it changes the format of live user data.

| Package | Items | Ships when |
|---|---|---|
| **A — money & availability** | B1, B2, B2b, F7 | before any real charge |
| **B — honest product surface** | B3a, B3b, F3, F14 | before launch |
| **C — focus & a11y** | F1 → F8, F9 | before launch |
| **D — client robustness** | F4, F5, F11, F12 | before launch |
| **E — presentation & weight** | F6, F13 | before launch |
| **F — synced blob format** | F10 (L4) + G2 | own cycle, before launch (last cheap moment) |
| **owner tasks, no code** | F15, mail plan, legal pages | tracked, not implemented here |

**Execution order:** A → B + E → C (F1 first) → D → F.

---

# Package A — money & availability

## B1 — vendor the Supabase client instead of loading it from jsdelivr

### Problem (verified)

`<script src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2"></script>` is parser-blocking in
`<head>`, has no `integrity`, and floats on the major version. **`integrity=` appears zero times anywhere
in the repo.** 602 committed `.html` files carry the tag.

Two distinct failures:

1. **Hard lockout.** If the visitor cannot reach jsdelivr, `auth-guard.js:17` paints a full-screen
   "Couldn't connect" over **every** gated page including the paid `/app/`, and `/login/` + `/quiz/`
   cannot sign anyone in either — they load the same script. For an HSK product the headline case is not
   hypothetical: **jsdelivr lost its Chinese ICP licence and its China CDN was shut down.** Corporate
   proxies and tracker blocklists do the same thing.
2. **Silent supply-chain drift.** The floating alias moved to **2.110.8 on 2026-07-21** — five days before
   this audit — with no commit, no deploy and no rollback path. A bad 2.x publish reaches every gated page
   immediately, and nothing in the repo records which version was ever shipped.

### Three corrections to the audit that change the work

**(a) There are six source locations, not three.** `scripts/inject-auth.js` carries the tag **twice** —
`:17` in `HEAD_SNIPPET` and `:52` in the stale-block strip list — plus `build.js:5424`, plus **four
hand-maintained files inject-auth does not rewrite**: root `index.html:1404`, `login/index.html:44`
(plain `<body>`, fails the `body.app` test), `auth/callback.html:27` (in inject-auth's SKIP file set, `scripts/inject-auth.js:12`), and
`app/index.html:5` (which does get healed once (b) is fixed).

**(b) A freshness guard will silently swallow the change.** `scripts/inject-auth.js:37` reads
`if (html.includes('/access-decision.js')) return html;`. Every one of the 598 injected pages already
contains `/access-decision.js`, so the new snippet would reach **none of them** and the run would report
success. The guard must key on a marker the new snippet introduces (the `/vendor/` tag) instead.

**(c) The bytes the site downloads today cannot carry SRI at all, and are not the bytes to vendor.** The
jsdelivr alias response is 208,196 B — a 292-byte banner wrapped around the npm file, and that banner's own
text reads *"Do NOT use SRI with dynamically generated files"*. Vendor the npm artifact:
`dist/umd/supabase.js` for **2.110.8**, 207,904 B raw / 52,750 B gzip,
`sha256 913f94db33b394a97d34c058347009053ac2d9534459c0990eb08594a108d2ee` — verified byte-identical across
npm, unpkg and jsdelivr's version-pinned path.

### Design

Vendor to **`/vendor/supabase-js-2.110.8.min.js`** at the repo root. No DigitalOcean config change is
needed: there is no committed app spec, the static-site component serves the repo root verbatim (the same
way `/common.css` and `/app/core.js` are served), and `.gitignore` has no `vendor` entry.

The version lives **in the filename** — its purpose is making the shipped version visible in `git log`
(the actual fix for failure mode 2), **not** browser-cache longevity: DO static hosting pins
`max-age=10`, so the file revalidates per navigation via ETag/304 regardless of its name. That tradeoff
is accepted and recorded here.

**The bump procedure — all of it, because "edit one constant" would recreate this very defect.** A future
version bump is: drop the new file into `/vendor/`, edit `SB_TAG`, **edit the four hand-maintained files**
(`index.html:1404`, `login/index.html:44`, `auth/callback.html:27`, `app/index.html:5`), run
`node build.js`, then `grep` the whole tree for the OLD versioned filename (**must be 0**) before deleting
the old vendor file. Skipping the hand-edits leaves the **live** `/login/` and the OAuth callback pointing
at a file that no longer exists.

Single constant `SB_TAG` in `scripts/inject-auth.js`, mirrored in `build.js`; the four hand-maintained
files edited directly (the heal path is **not** relied on for this migration). Two details are
load-bearing:

- **The `:37` guard keys on the FULL versioned `SB_TAG` string** —
  `includes('/vendor/supabase-js-2.110.8.min.js')` — never on a bare `'/vendor/'` substring. A bare marker
  would match a page carrying the *previous* version's tag on the next bump and return early: the exact
  silent swallow this spec diagnoses in correction (b), recreated one version later.
- **The strip list keeps the old jsdelivr literal permanently AND strips prior vendor versions by
  pattern** (`/<script src="\/vendor\/supabase-js-[^"]+"><\/script>/`), so a bump heals a page holding
  the previous tag instead of accumulating a stale duplicate alongside the new one.

Verification: checksum the vendored file against the digest above before committing.

SRI is **not** added. Same-origin removes the threat SRI addresses (a third party altering the bytes), and
an `integrity` attribute on a self-hosted file only creates a way to hard-break the site on a future
version bump where someone updates the file but not the hash.

### Files

`scripts/inject-auth.js`, `build.js`, `index.html`, `login/index.html`, `auth/callback.html`,
`app/index.html`, new `vendor/supabase-js-2.110.8.min.js`. Requires `node build.js` (regenerates the 598
injected pages, one-line diff each) and therefore a large but mechanical commit.

### Verification

`grep -c cdn.jsdelivr.net/npm/@supabase` across all `.html` must go 602 → **0**. Boot **all five**
hand-touched entry points — `/app/`, `/login/`, `/quiz/`, the root landing, and `/auth/callback.html`
(or one full local Google sign-in round trip) — and confirm `window.supabase.createClient` resolves from
`/vendor/` on each with no request leaving the origin for the client. Confirm the served file is
207,904 B with the expected digest.

**Deliberately out of scope, stated so the Problem section is not over-read:** `hanzi-writer` (and its
stroke-data fetches) stay on jsdelivr. In the China scenario the character section degrades gracefully —
`glyphFallback` (`app/more.js:314`) plus F5's `onLoadCharDataError` — rather than blocking anything;
vendoring its per-character data set is a much larger job with a working fallback already in place.

---

## B2 — `grant-entitlement` must not answer 200 when the grant failed

### Problem (verified) — and the audit's framing was wrong

`supabase/functions/grant-entitlement/index.ts:73` returns `200 {ok:true, entitlement:false}` when
`apply_hsk_entitlement` errors.

**The audit called this an oversight. It is not.** The trailing comment says *"still un-granted; alert +
re-drive"*, and `docs/studybox-payment-integration.md:216-217` and `:275-278` **formally instruct StudyBox
to treat it as success and to alert on `entitlement:false`**. The real defect is that the alerting
obligation was delegated to a third party, in a different repository, with nothing on our side verifying it
ever happened. Reframing this matters: the fix is not "someone forgot", it is "we are relying on an
unverifiable promise for a money path".

Trigger: the charge lands, the `payments` insert succeeds, and only the RPC fails — a transient DB error, a
statement timeout, or the RPC being absent entirely because `schema.sql` was not applied before a function
deploy. `PAYMENTS_SETUP.md:14-17` warns about exactly that last case.

Customer effect: charged, not granted, bounced to `/quiz/?sub=required` after the 30-minute grace, and
nobody on our side knows.

### Design

Return **5xx** on that branch, with the decision extracted into `lib.ts` so the existing Deno harness pins
it (the `index.ts`/`lib.ts` split is already this function's convention).

**The one thing that could make this worse than the bug — checked.** A 5xx invites a retry; a retry must not
stack a second term. It does not: the `payments` row is keyed by `order_id` and `apply_hsk_entitlement` is a
**fold of the ledger**, so re-driving converges on the same coverage rather than adding to it. This is the
same idempotency the double-charge policy already relies on.

**The response is part of a published wire contract, so the contract changes in the same commit.**
`docs/studybox-payment-integration.md:216` documents the `200 {ok:true, entitlement:false}` row this
change removes, and §8 (`:275-278`) builds the acquirer's escalation on it — after B2 that row never
occurs, so left unedited the doc would instruct StudyBox to handle a response that no longer exists and
its escalation trigger would be dead. The row is replaced with the new 5xx semantics: exact body
`503 {ok:false, retry:true, reason:"entitlement_apply"}` (JSON, unlike the plain-text gateway 500s, so the
acquirer can distinguish them), action "retry with backoff, fresh `ts` — idempotent by `order_id`", plus a
**give-up threshold**: after N retries over M hours, stop and contact HSK — a *permanent* RPC failure
(schema not applied, the exact case `PAYMENTS_SETUP.md:14-17` warns about) must not retry forever.
`PAYMENTS_SETUP.md`'s runbook references to `entitlement:false` are updated to match.

Deployment: function version 5 → 6, `verify_jwt:false` unchanged, no `config.toml` change.
**Post-deploy verification (no real payment needed):** the Group C curl matrix against v6 — unsigned
POST → 401; valid HMAC + stale `ts` → 400; replay of an existing comp `order_id` with fresh `ts` →
200 `idempotent:true` with no coverage change, re-checked by the B2b Part-1 query.

### Files

`supabase/functions/grant-entitlement/lib.ts`, `index.ts`, `lib.test.ts`,
`docs/studybox-payment-integration.md`, `supabase/PAYMENTS_SETUP.md`. No client code, no build, no
`inject-auth`.

---

## B2b — make a failed grant *detectable*

### Problem (verified) — again the audit overstated

The audit said "no reconciliation". **The repair runbook already exists and is good** —
`PAYMENTS_SETUP.md:101-108` "Runbook — lost/failed webhook", plus the refund/comp runbooks at `:76-86`.
What is missing is **detection**: nothing tells an operator that an order needs the runbook. The deliverable
is therefore a query on the launch checklist, not a new runbook.

### Design

**Part 1 (documentation only, zero risk, land first):** a reconciliation query added to
`PAYMENTS_SETUP.md` as its own section and as a line in the launch checklist at `:92-99` — paid `payments`
rows whose user's `profiles.subscription` does not reflect the ledger. Run before launch, then on a
schedule. *Already run against prod during grounding: 0 discrepancies today.*

**Part 2 (ships in B2's deploy):** the function itself sends the alert on the failure branch —
**fire-and-forget email via the Resend API** (already this project's mail transport), authenticated by a
new `HSK_ALERT_*` secret, with the send wrapped so an alert failure can never change the HTTP response.
Covered in `lib.test.ts` (the decision, not the I/O). **Named concretely because the obvious alternative
does not exist:** Supabase has no native alert-on-log-line feature — log export is a Log Drain, a
Pro-plan dashboard add-on (~$60/mo) that only forwards to an external system which must itself alert, and
being dashboard configuration it cannot ship in a function deploy. Anything else would repeat B2's own
diagnosis: an alerting promise with no verified mechanism behind it.

Part 1 is the durable backstop and does not depend on Part 2 existing — which is the point, given that the
current design already depends on an alert nobody verified.

---

## F7 — the fail-closed branch must honour the two signals it already has

### Problem (verified)

`auth-guard.js:123`'s fail-closed branch — added deliberately by the prior cycle's L3 fix — ignores
`cacheFresh` and `payPending`, contradicting its own contract comment at `:91-92`. Both signals are already
computed and in scope (`:87`, `:129`).

Trigger: an authenticated user loads a gated page in a browser where **`/access-decision.js` specifically**
failed to fetch (a partial or aborted response on that one file; the other auth scripts are separate
requests). A known subscriber with a fresh cache gets a "Couldn't verify access" retry card instead of their
product.

### Design

Honour **exactly** the two signals `decideAccess()` itself short-circuits on (`access-decision.js:41-42`)
and nothing more.

`confirmedActive` is **deliberately excluded**, and this is the load-bearing decision of the item:
`access-decision.js:47-52` shows `grace-show` is reached only *after* both the edge function and the RLS
read were attempted and failed. This branch attempts neither. Admitting `confirmedActive` here would turn
its 7-day localStorage marker into a week-long offline pass — i.e. it would re-open the hole L3 closed.

### Files

`auth-guard.js` only. `access-decision.js` is **not** modified — its ordering is the specification this fix
mirrors. Tests drop into the existing `scripts/auth-guard.test.js`, whose `loadGuard()` already loads the
real guard with `HSKAccess` undefined to exercise this exact branch.

---

# Package B — honest product surface

## B3a — the Notifications row

### Problem (verified)

`grep` for `Notification|serviceWorker|requestPermission|showNotification|periodicSync` across the whole
repo returns **exactly one hit**, and it is the literal word "Notifications" inside the row's own label.
There is no delivery mechanism of any kind. `app/core.js:127` defaults `notif: true` and nothing writes the
key at boot, so **every new account sees the switch already ON without ever opting in**.

*Audit line number was wrong by ~36 lines: the mobile row is `app/more.js:753-756`, its label is built at
`:729-731`; desktop is `app/desktop-more.js:424-425` with vars at `:374-376`.*

### Design — owner chose "keep the row, default OFF"

Grounding recommended deleting the row outright (~7 deleted lines, and it is the fully honest option). The
owner chose to keep it. Implementing that choice as-is would leave the dishonesty intact — a switch the user
can turn ON that does nothing — so within the owner's decision the row is **also relabelled** so it stops
asserting a capability:

- default flips to `notif: false` in `app/core.js:127`;
- the sub-label stops asserting delivery. Today `app/more.js:731` reads
  `var notifSub = pv.notif ? 'Daily reminder' : 'Off';` — the ON string is the whole problem, because it
  names a cadence that does not exist. It becomes:

  ```js
  var notifSub = pv.notif ? 'On · reminders coming soon' : 'Off';
  ```

  The row's own heading stays "Notifications" — **on mobile, where the heading already is
  "Notifications"**. On desktop the dishonest string lives in a different place: the row **heading** at
  `app/desktop-more.js:424` is literally `Daily reminder 提醒`, the `aria-label` at `:425` is
  `Toggle daily reminder`, and the ON sub-label at `:376` is already an honest `'On'`. So "the same
  treatment" is spelled out per client, because the requirement is that the row stops asserting a cadence
  **anywhere it appears**:

  - desktop heading `:424` → `Notifications 提醒`;
  - desktop `aria-label` `:425` → `Toggle notifications`;
  - desktop ON sub-label `:376` → the same `'On · reminders coming soon'` as mobile.

  Nothing else about the row changes: it remains a real stored preference, so when reminders do ship the
  user's choice is already there.

`app/sync.js` is untouched: `notif` stays in the synced key list so a user's choice still follows them, and
the default change affects only accounts that never wrote the key.

## B3b — the spaced-repetition claim

`app/desktop-vocab.js:328` claims *"Spaced repetition keeps words in long-term memory"*. Verified: **this is
the only spaced-repetition claim in the entire repo**, and no scheduler exists — no timestamps, no interval,
no ease factor, no per-word history. The only persisted vocab state is `hsk4-vocab-mastered`, a flat set.

Replaced with what the deck actually does — the exact strings, because copy is a product decision, not an
implementation detail:

- sub-line `:328` → `Mark what you know — mastered words leave the deck` (converging on mobile's
  `app/vocab.js:665`);
- eyebrow `:326` → `Flashcard review · <span class="chinese">复习</span>` — "Daily review" is what makes
  "due today" read as a schedule. Mobile's `:663` eyebrow is deliberately left alone: its "to review"
  makes no scheduling claim.

(Precision note: "only SRS claim in the repo" means the product surface — `README.md:119` mentions SRS in
a dataset-ideas list, which no user sees.)

## F3 — the vocabulary hero counts

### Problem (verified)

Real numbers: catalog **1,000** words; one flashcard session **20**; one quiz round **20**; the dashboard
already shows 20. The heroes compute `total - mastered` and render it as the session size:
`app/vocab.js:654/664` "1,000 cards to review", `app/desktop-vocab.js:327/341` "1,000 cards **due today**".

A fresh subscriber is told 1,000 and handed 20 — a 50× overstatement, and on desktop a claim that a thousand
cards are scheduled for today.

### Design

One source of truth: **`App.DECK_SIZE = 20`** declared in `app/core.js` next to `App.keys` (core loads
first, so every later module sees it). The deck builder and the copy both read it, so they cannot drift
again. This is what makes the item testable as a real invariant rather than a copy assertion: *the number
the hero shows must equal the number of cards the user receives.*

Three consequences the naive "hero prints DECK_SIZE" reading gets wrong, all specified here so two
implementers cannot resolve them two ways:

- **The hero shows `min(App.DECK_SIZE, unmasteredCount)`**, not the constant: `app/vocab.js:171` slices
  the *unmastered* pool, so near the end of the catalog the deck genuinely holds fewer than 20.
- **The all-mastered fallback is its own copy state.** With 0 unmastered, `:174` deals 20
  already-mastered cards — the hero must then say so (e.g. "Review 20 mastered words"), not claim 0 or 20
  due.
- **Every writer of the number changes, not just the template.** The live-update path
  (`syncMasteredLive` → `App.live('vDue', …)`) must emit the same derived value, or the first mastery tap
  overwrites the corrected hero with the old `total - mastered` arithmetic. The quiz round's two
  hardcoded 20s at `app/vocab.js:283-284` route through `App.DECK_SIZE` in the same commit.

## F14 — results "Focus next → Go" opens the wrong screen

### Problem (verified) — both audit line numbers were wrong

The bug is in `App.actions.resultsGoNext`, `app/exam.js:762-782`, specifically the `forEach` at `:766-772`:
it builds its section map without the `selfCheck` guard the other three sites use. Writing therefore scores
a permanent 0/N and is always "weakest", so the button routes to Sentences (造句). Reproduces 100% of the
time on a full paper, mobile only, when the weaker of Listening/Reading is below 80%.

### Design

Take the **recommended** fix rather than the one-line guard: extract a pure `ex.weakestSection` helper and
route **all three** live call sites through it — both mobile sites *and* the desktop inline copy at
`app/desktop-exam.js:582-585`, whose own comment ("mobile resultsGoNext canon") admits it duplicates the
rule. `exam.js` loads before `desktop-exam.js` in the desktop client, so the helper is available there.
Desktop's copy is guard-correct today, which is exactly why it should not be left to drift independently
from a rule that has already been got wrong once. Same size, kills every duplicate, unit-testable.

---

# Package C — focus & accessibility

## F1 — keyboard focus does not survive a region re-render

### Problem (verified) — and the audit was half wrong in a way that changes the estimate

The audit said "the machinery already exists and is merely wired only to dialogs". **Half true.** Three
helpers are reusable as-is: `_restorable` (`core.js:514`), `_selectorFor` (`:532`), `_resolveReturn`
(`:544`). But **two things do not exist at all**: any capture of the pre-swap `activeElement` as a
re-resolvable descriptor for the non-dialog case, and any post-swap "focus fell to `<body>` — put it back"
step. What preserves focus inside modals is `_focusInto`'s container pin (`:520-526`), which is
dialog-specific and coarse. So this is **new code that reuses three existing helpers**, not a rewiring.

Also more precise than the audit: not *every* state change — only changes to fields in the affected region's
deps. `SHELL_SKIP` (`shell.js:639-645`) and `D_SKIP` (`desktop-shell.js:286-292`) already spare
`elapsed`/`curQ`/`answers`/`flags`/`gQuery`/`vMastered`, and the typing paths deliberately bypass render.

Worst case, identical on both clients: the exam results review accordion. Each row is a
`<button data-a="toggleReview">`; activating it calls `setState({reviewOpen})`, the region's innerHTML is
replaced, the focused button is detached, focus drops to `<body>`, the AT announces nothing, and the user
Tabs from the top of the document again — after every single row they open.

### Design

~30 lines next to the existing helpers in `app/core.js`, plus exactly two call sites (`render`, `update`).
Declared as `function` statements so hoisting lets `render()` at `:356` call them.

Interaction with the prior cycle's `_focus` id convention (the search input) is explicitly preserved: the
new step runs **after** the existing `restoreFocus`, and no-ops when focus is already inside the swapped
region — the same contains-check `_focusInto` uses. That ordering is what stops it stealing the search
caret, which is the failure the earlier a11y cycle had to fix twice.

Two boundaries stated so the design is not read as a blanket guarantee:

- **Restore always calls `focus({preventScroll: true})`** with the same try/fallback the existing helpers
  use (`core.js:327`, `:524`, `:569`) — a restored button in a long results list must not jump-scroll the
  page the moment `resScroll` has positioned it.
- **The descriptor covers `data-a` elements only** — that is what `_selectorFor` resolves (priority:
  `id` → `data-a` + `data-arg`/`data-argn` → none). Text inputs wired via `data-in` remain the `_focus`
  convention's job, deliberately: they already survive re-renders with caret position intact through that
  path, and duplicating it would race it.

**F1 ships first in the package**, because F8's `aria-pressed` and F9's verdict text are only reachable for
a keyboard user once focus survives.

## F8 — `aria-pressed` on stateful toggles

*Audit correction: `app/exam.js:1030` is already correct — it has `role="radio"` + `aria-checked` inside a
`role="radiogroup"` from Group D, and is dropped from the list.*

Real targets: the vocabulary row mastery toggle (`app/vocab.js:454`, state conveyed by border and background
colour only), the word-sheet toggle (`:709`), the exam Flag button (`app/exam.js:1072`), and the guide
checklist toggle — **`app/more.js:683`** (`data-a="toggleGuide"`; the audit's `:669` is a static info div,
stale after batch 2's insertions) with its desktop mirror `app/desktop-more.js:929`. The implementation
plan re-stamps every F8 line number against HEAD, since this file shifts whenever rows are added above. Where the accessible name is a static `aria-label`, the name becomes state-bearing
too, reusing wording the desktop client already ships so the two clients agree.

## F9 — quick-check verdicts are colour-only

Verified: `app/study.js:352-361` (grammar) and `:476-478` (communicative tasks), `app/desktop-study.js:258-273`.
The explanation text is **byte-identical** whether the answer was right or wrong; the only signal is the
option's background tint. Affects screen-reader users (colour is not exposed at all) and red/green
colour-blind users on the light theme, where `--ok-bg` and `--bad-bg` are both pale tints.

*Audit correction: the reuse target it named (`exam.js:994/1025`) is wrong — those are the listening note and
the question prompt. The verdict pattern actually lives at `exam.js:1205`, and the same
`'✓ Correct' / '✗ Not quite'` pattern already ships in-file at `study.js:567/635`.* The fix reuses that
in-file pattern verbatim so all four quick-check surfaces speak the same language.

---

# Package D — client robustness

## F4 — a failed clip must not burn an exam-mode play

### Problem (verified) — audit line numbers ~40 lines stale

The debit is `app/exam.js:747-748` inside `playClip` (`725-750`), not "~705"; `clipFail` is `:360-363`, not
"~318". The budget is `state.audioPlays[i]` keyed by the active-list index, gated by an early return at
`:734`.

Exam mode only, on papers with per-question `q.audio` (tests 01–12; official 13/14 use `sharedTrack` and are
uncapped). If the clip fails to start twice — a media-host hiccup, an offline blip, or a stalled 6.5 MB WAV —
the question's audio is permanently greyed out for the rest of the attempt.

### Design — the audit's proposed fix is rejected

**Do not move the debit to the `playing` event.** `playing` also fires after every mid-clip buffer stall
(`waiting` → `playing`), so a stalling 6.5 MB WAV on mobile data would debit two or three plays for a single
listen — strictly worse than the bug.

Instead: keep the debit on start (the anti-reset comment at `:745-746` stays true) and **refund in
`clipFail` only when the clip never produced audible playback**, tracked by a `_clipStarted` flag set from a
new `playing` listener.

**The refund must be one-shot, because `clipFail` runs TWICE for a single failed clip.** A bad `src` fires
both the media `error` event (`onAudioError`, `:388-391`, guarded only by `ex._mode`) *and* the rejected
`el.play()` promise's unconditional `p.catch(function () { clipFail(); })` at `:743` — and `clipFail`
itself has no re-entry guard. A refund gated only on `_clipStarted === false` would execute in both
invocations: one debit, two refunds, net **−1** per failed attempt — a farmable cap on a flaky media host,
the exact thing the risk table below claims impossible. So the debit records a one-shot marker
(`ex._clipDebit = { q: i }`), the refund consumes it (keyed to `ex._clipQ`, **not** the current `curQ`,
which may have changed) and no-ops on the second call. `exam-playcap.test.js` gets an explicit
two-`clipFail`-invocations case.

## F5 — HanziWriter stroke-data failure leaves a blank box with live buttons

Verified: the **library**-load fallback exists (`glyphFallback`, `app/more.js:314`), but the stroke-**data**
fetch has no handler — `onLoadCharDataError` is not passed at `app/more.js:337` (`initWriter` spans
`319-339`; the audit's "~323" is the library guard). `HanziWriter.create` mounts its empty `<svg>`
synchronously and then the data XHR fails, so the user gets an empty box with Animate/Practice buttons that
look live.

Fix: pass the hook, reuse the existing `glyphFallback` (re-resolving the node, since a re-render may have
swapped it), and disable Animate/Practice when the engine is unavailable.

## F11 — a lost module gives a blank tab, and resource 404s are never reported

### Problem (verified) — worse than the audit said

The boot assert at `app/index.html:93` covers only `core.js`, `shell.js` and `data.js`. If `exam.js`,
`vocab.js`, `more.js` or `study.js` is lost, **boot succeeds**: the shell renders a working header and tab
bar, `screenHtml()` resolves the missing function to `undefined` and returns `''`, and the user taps
Exams/Words/More and gets a blank white area between working chrome. That is indistinguishable from "this
section is empty" — the reload card never appears.

Separately, the global `error` listener at `:62` is registered without capture, so resource 404s never reach
`app_error` — which is the goal we just wired in batch 2.

Fix: extend the assert to all module seams; move the boundary block to the top of `<head>` and register with
`capture:true` plus resource classification. An `App.missingSeams` refactor makes the assert unit-testable.

**Two consequences of the move, handled explicitly or the fix eats itself:**

- `report()` currently burns a cap slot **unconditionally** — `if(n<5){n++;if(window.ymGoal)…}` increments
  even when `ymGoal` is not yet defined, and `ymGoal` only comes into existence at `:48`. Moved to the top
  of `<head>` with capture, the reporter now sees failures of everything loading before Metrika. So reports
  are **buffered until `ymGoal` exists** (flushed by the Metrika block), and `n` counts only goals actually
  sent.
- Resource failures are **classified by target origin**: third-party losses (fonts, hanzi-writer, Metrika
  itself — all commonly blocked by adblockers and in China) must not consume the 5-per-session cap that
  exists to surface **our** errors. They get a separate, lower-priority kind.

## F12 — a stale second tab clobbers the other tab's data

Verified: `app/exam.js:499` and `app/vocab.js:90` serialize an in-memory map over localStorage, so an
actively-used stale tab overwrites the other. Concretely: tab 2 answers 20 questions of paper 5; the user
returns to tab 1 and answers one question of paper 3; tab 1 writes its boot-time map, which has no key 5, and
paper 5's answers are erased. For `mastered` the loss is also **pushed to the server**.

Fix: read-modify-write against stored state at every write, plus a `storage` event listener for cross-tab
invalidation. Same-device only — localStorage is synchronously readable, which is why this needs no
tombstones, unlike the cross-**device** case in package F.

**All five write sites, not the two the audit named** — an implementer fixing only `:499` and `vocab.js:90`
leaves the worst one in place:

| Site | What it writes | Rule |
|---|---|---|
| `exam.js:499` (persistLive) | whole progress map | RMW, touch only this paper's key |
| `exam.js:635` (leave player) | whole progress map | same |
| `exam.js:650` (exitExam) | whole progress map, deletes this paper | same — delete only this paper's key |
| `exam.js:674-675` (submitExam) | **the entire attempts array** + progress | attempts is append-only: **read, union by attempt key, append** — mirroring `sync.js`'s union. A stale tab must not erase another tab's *completed exam result* |
| `vocab.js:90` (mastered) | whole mastered set | RMW union; this one also pushes to the server |

**Listener policy, stated:** for the paper currently open in the player, in-memory state wins (the taker's
own answers are authoritative); the `storage` listener refreshes list/dashboard surfaces and re-bases the
next write. It does not yank the active attempt out from under the user.

---

# Package E — presentation & weight

## F6 — `color-mix()` and `backdrop-filter` with no fallback

### Problem (verified) — sharper, worse, and wider than the audit

Light theme (the default) on any browser without `color-mix()` — Chrome/Edge < 111, Safari < 16.2,
Firefox < 113, i.e. **any iOS 15 / 16.1 device** — an invalid declaration is dropped wholesale. Two
failure classes:

1. **Invisible text.** On the four gradient heroes the whole `linear-gradient(...)` shorthand dies, the
   element inherits `background: var(--paper)` (`#f9f4ec`), and the text is `color: var(--invert-fg)` —
   **the same literal `#f9f4ec`**. Contrast exactly **1:1**.
2. **Transparent sticky chrome.** Six header/nav surfaces use
   `background: color-mix(in srgb, var(--paper) N%, transparent)` as their *only* background — on old
   browsers content scrolls visibly through the sticky header. **This includes the MOBILE client**
   (`shell.js` ×3, `exam.js:1050`), whose audience is exactly the older-iOS population — an earlier draft
   of this spec said "four desktop surfaces", which understated it.

### Design — the full inventory, one pattern per class

**No `@supports` needed** anywhere: both a `style=""` attribute and a CSS rule honour a repeated
property — the invalid declaration is discarded and the earlier valid one wins.

| Class | Sites (11 `color-mix` total) | Pattern |
|---|---|---|
| **Theme-static oklab gradients** | `desktop-exam.js:587`, `:588`, `desktop-more.js:729`, `desktop-vocab.js:323` | delete `color-mix()`, inline the precomputed hex (computed in oklab exactly as specified: `mix(#2f6349, black 42%)` → `#112b1e`; `mix(#8a6420, black 34%)` → `#4c360d`; `mix(#8a6420, black 40%)` → `#422e0a`) — `desktop-more.js:728`'s own comment already calls them "deliberate theme-static gradient" |
| **srgb chrome washes** | `desktop-exam.js:464`, `desktop-shell.js:194`, `exam.js:1050`, `shell.js:255`, `:286`, `:579` | keep the wash, add a preceding **opaque** fallback: `background:var(--paper);background:color-mix(…)` (`var(--surface)` where that is the base). Old browsers get a solid sticky header; new ones keep the frosted glass |
| **CSS hover** | `app/desktop.css:88` | preceding plain declaration: `box-shadow:inset 0 0 0 999px rgba(0,0,0,.08);` before the `color-mix` one |

**`backdrop-filter` (7 sites) rides along mechanically:** each `backdrop-filter:blur(12px)` gains a
`-webkit-backdrop-filter:blur(12px);` twin, which restores the blur on iOS Safari 16.2–17.x (unprefixed
support landed in 18). On browsers with neither, the opaque background fallback above already makes the
missing blur invisible — nothing shows through an opaque header.

A zero-dep `scripts/css-fallback.test.js` lint asserts, over **`app/*.js` and `app/*.css`** (its stated
scope), that every `color-mix(` occurrence is either inside a precomputed-hex-free gradient (class 1,
gone) or preceded by a plain `background`/`box-shadow` fallback in the same declaration block — so a new
un-fallbacked site fails the suite the day it is written, not the day an iOS 15 user finds it.

## F13 — the font stylesheet is heavier than all of the app's own JS

### Problem (measured, not estimated)

The `/app/` Google Fonts URL returns **185,810 B gzipped / 681,704 B raw / 614 `@font-face` blocks**. And
`Noto Sans SC` weight **300 is requested and used zero times** — `font-weight:300` does not appear anywhere
in the repo.

### Design

One line: make `app/index.html:17` **byte-identical** to the URL already used at `build.js:5421` (family
order included — the URL is the cache key). Effect: **−30,911 B gzip** on a cold load, and a warm-cache
**hit** for the overwhelmingly common path of arriving from `/quiz/`, which currently re-downloads a
different URL. Safe by construction: the only delta is the weight nothing renders at.

The 14 remaining `build.js` occurrences get the same trim as a **separate commit**, because that one
regenerates ~599 pages and would bury the real change. A `scripts/font-url.test.js` drift guard asserts the
two URLs stay identical — worth having precisely because this bug *is* drift.

---

# Package F — synced blob format (own cycle)

**Owner decision: L4 and G2 ship together, as their own reviewed cycle.**

`app/sync.js:119-121` uses **one global `updatedAt`** for every scalar preference, and `:231-233` bumps it on
**any** synced write. So: the phone changes the target score, the UI language or the theme; the laptop then
finishes an exam or masters one word, which bumps its global stamp past the phone's; on the next merge the
laptop is declared "newer" for **every** scalar and silently reverts all of them — on both devices, since
the merge result is pushed back.

G2 is the same family: `mergeColl` (`:103-107`) treats `mastered` and `guide` as whole-set LWW, so a
concurrent add on another device between syncs is lost.

### Design

A per-field stamp container plus per-item stamps for the removable collections — **one** format change
instead of two. Fallback semantics mirror the pattern `mergeColl:105` already uses: a side with no stamps
degrades to today's behaviour rather than losing data, so an un-upgraded device is safe.

**Why now:** prod holds exactly **one** progress blob, **266 bytes**, across 30 profiles. After launch this
becomes a live-data migration. The generic container must also be chosen now, or G2 later forces a second
format revision.

**Why its own cycle:** it changes the format of real user data, and the two prior data-integrity items in
this project (A3, Group C) each got a dedicated reviewed cycle for exactly that reason. This package gets its
own implementation plan and its own adversarial review before any code is written.

---

# Owner tasks — recorded, not implemented

## F15 — the listening audio is 6.5 MB per clip

**Measured** by HEAD on all 507 unique URLs referenced by `data/test-*.json`: **449 WAV references (447
unique)**, mean **6.52 MB**, median 6.26 MB; **`Cache-Control` absent on all 507**; zero dead URLs. Playing
every clip once on a WAV paper costs **279–293 MB**; exam mode permits two plays, so the pessimistic bound is
**~580 MB for one listening section**. `test-12` already proves the alternative works: mean **0.37 MB**
across its 45 mp3s.

**Nothing in this repository controls those bytes or those headers.** `grep -rl media.mandarinzone.com`
returns only `data/test-*.json`, the generated `quiz/index.html`, and docs; the repo carries no hosting
config. Owner work at the media host: re-encode the 447 WAVs to the profile `test-12` already uses
(2,926 MB → ~170 MB total; ~292 MB → ~17 MB per section), in place at the same URLs so **zero repo change is
needed**, and add `Cache-Control`.

## Also on the launch checklist, outside this spec

- **Mail plan off trial before 2026-07-31** — batch 2 shipped a `mailto:info@hskprep.cc` support link into a
  1-seat trial mailbox that expires in days.
- **Legal pages** `/terms/`, `/privacy/`, `/refunds/` — the actual launch gate; needs owner copy.
- **Localization** — the dead RU row, deliberately untouched here, as its own task.

---

# Test plan

All new tests follow the existing zero-dep convention (`node:test`, load the real module under a mocked
`window.App`). Suite goes from **103** to roughly **125**.

| Package | New coverage |
|---|---|
| A | `lib.test.ts` (Deno) pins the 5xx decision; `auth-guard.test.js` gains the two F7 branches |
| B | `vocab-session.test.js` — **the hero number must equal the deck the user receives** (a real invariant); `exam.js` `weakestSection` cases including a Writing-heavy paper |
| C | `focus-restore.test.js` (core.js loads cleanly under the harness — verified); `aria-pressed` assertions on the rendered markup |
| D | `exam-playcap.test.js` (**already prototyped during grounding and passing**); `hanzi-fallback.test.js` (likewise); `boot-seams.test.js` after the `App.missingSeams` refactor; `exam-multitab.test.js` |
| E | `css-fallback.test.js` and `font-url.test.js` — lint-style drift guards, not behaviour |
| F | extends `sync-merge.test.js`, which already loads the real `sync.js` and exposes `App.sync.merge` |

Items with **no** unit test, and why: B3a and B3b are markup/copy deletions with no invariant behind them
(asserting on rendered substrings would just re-encode the copy in a second place); F6 and F13 are CSS and a
`<link>`, guarded by lint instead; F15 is bytes on a third-party host and the suite is deliberately offline.

# Verification plan

Browser-verify on **both** clients via the established placeholder-`config/auth.js` swap-and-restore, then
confirm `git status` is clean on that file. Remember the preview browser is `pointer:fine` and therefore
always picks the **desktop** client — force mobile with `localStorage 'hsk4-client' = 'mobile'` and bust
`app/*.js` with `{cache:'reload'}` before trusting live globals.

Package A additionally needs: a real deploy for B2 (function v6) and, for B1, a check that no request leaves
the origin for the Supabase client on `/app/`, `/login/` and `/quiz/`.

# Risks

| Risk | Mitigation |
|---|---|
| B1's `inject-auth.js:37` guard swallows the change and reports success | Re-key the guard on the `/vendor/` marker; verify by grepping the 602 pages for the old tag (must be 0) |
| B1 vendors the wrong bytes | Pin 2.110.8 and check `sha256 913f94db…d2ee`; the jsdelivr alias bytes are explicitly not the artifact |
| B2's 5xx causes a duplicate grant on retry | `payments` is keyed by `order_id` and `apply_hsk_entitlement` folds the ledger — re-driving converges. Verified before writing this |
| F7 re-opens what L3 closed | Only `cacheFresh` and `payPending` are honoured; `confirmedActive` stays excluded, with the reason recorded in-code |
| F1 steals the search caret, as an earlier a11y cycle twice did | Run after `restoreFocus`, no-op when focus is already inside the region |
| F4's fix lets a user farm extra plays | The refund is one-shot (a per-debit marker consumed on first `clipFail`), because `clipFail` fires twice per failure — a `_clipStarted`-only gate would net −1 per attempt. The `playing`-based debit the audit proposed is explicitly rejected |
| F6's precomputed hex drifts from the token | Values are theme-static by the code's own comment; lint asserts a fallback exists |
| F13's trim drops a weight something uses | Only weight 300 is removed, and `font-weight:300` appears nowhere in the repo |
| Package F loses user data | Own reviewed cycle; unstamped sides degrade to today's behaviour; prod holds one 266-byte blob |
