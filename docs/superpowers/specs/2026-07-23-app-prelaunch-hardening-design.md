# Design — `/app/` pre-launch hardening (O1 · O3 · M3 · M4 · M5 · M6 · O5)

**Date:** 2026-07-23
**Branch:** claude/dev (51 commits ahead of `origin/main`, **not pushed** — nothing live)
**Task:** the seven owner-selected items from the 2026-07-23 production-readiness re-audit
(`wf_003410c5-866`). Everything else from that audit is deferred to post-launch fast-follow.
**Status:** Owner decisions RESOLVED — **O5 → (A)** keep SEO pages public via the C1 gate re-scope;
**M3 → (A)** per-element masking; **O1** section-drill copy approved. **Revised after adversarial spec
review** (`wf_df02afc2-53a`, 19 verified findings): O1 collapsed to a results-screen-only fix (drills are
never persisted — see O1 §Problem), O3 gained a mandatory prerequisite (in-app renewal returns to
`/app/?pay=success`), M3 widened to the editable name/country inputs, O5 mechanism corrected to scope the
login redirect + veil. **Review verdict: ready to plan; strongly consider splitting O5 into its own reviewed
cycle** (it rides the live Group C paywall path). READY for implementation planning.
**Prior context:** builds on Groups A–G (see `[[hsk-app-production-readiness-2026-07-20]]`). The
paywall/access model is defined in `2026-07-21-app-paywall-hardening-design.md`; O3 amends it.

---

## Why these seven

The re-audit found **no code blocker and no HIGH defect** — the A–G passes were thorough. The launch
gate is a legal deliverable (real Terms/Privacy/Refunds, tracked separately as **O4**, not in this spec).
These seven are the cheap, high-value correctness / honesty / privacy / test-debt items worth doing in the
same pre-launch pass:

| ID | One line | Class |
|----|----------|-------|
| **O1** | Single-section drills show a full `/300` band + "Passed" verdict on the **results screen** (drills aren't persisted, so the dashboard is unaffected) | honesty / correctness (paid product) |
| **O3** | `?pay=success` URL param grants any signed-in user a paywall bypass | security (UX-gate) |
| **M3** | User email/name recorded into Yandex Webvisor on `/app/` profile screens (funnel masks the same PII) | privacy |
| **M4** | `bandScore`/`estScore` — the `/300` headline math — have zero unit coverage | test debt (regression guard) |
| **M5** | Results band+verdict math is inline, duplicated mobile≠desktop, untestable | test debt + de-dup |
| **M6** | `normalizeQ` Writing self-check (the "excluded from band" contract) is untested | test debt (mis-grade guard) |
| **O5** | `sitemap.xml` advertises 598 auth+subscription-gated URLs | SEO strategy decision |

## Non-goals

- **Not** re-architecting the static + SEO hosting model, the client-side gate, or the sync blob format
  (G2/L4 stay deferred to their own reviewed cycle).
- **Not** O4 (legal pages) — separate business/legal deliverable; it, not this spec, is the launch gate.
- **Not** a visual redesign of the results screen — O1 reuses existing card styling.

---

## O1 — Section drills must not claim a full-exam `/300` score or "Passed" (results screen only)

### Problem
A section drill (听力-only / 阅读-only, `examSection !== 'all'`, launched via `beginSection`, exam.js:485) is
auto-scored on its one section and its **results screen** treats it as a whole exam: `resultsTpl`
(exam.js:1035) computes `band = round(meanSec*3)`, `pass = 180`, `passed = band >= 180` (exam.js:1068–1071)
over whatever sections are present. A Listening-only drill at ≥60 % → `band ≥ 180` → the green hero
"**恭喜通过! · Passed — you cleared the bar**" (exam.js:1111). Desktop repeats this independently
(desktop-exam.js:544–548, 588).

The Writing-only drill is already handled (no auto-scored questions → `!total` branch, exam.js:1094 /
desktop-exam.js:569, shows the self-check card with no band). Listening/Reading-only drills are the gap.

> **Corrected by spec review (was over-scoped):** the drill does **NOT** pollute the dashboard estimate or
> Stats. `submitExam` **early-returns for a sectioned drill at `exam.js:617–621` — before `computeAttempt()`
> (:622) and `storeSet(App.keys.attempts)` (:626)** — so a drill is **never persisted** to `hsk4-attempts`.
> `computeAttempt`'s only caller is :622; the only other attempts writer is the legacy full-paper seed
> (core.js:780–796). Therefore `estScore`, `skillsData`, the mobile "Est. score" tile (more.js:447–448), the
> Stats history "Passed" badge (more.js:545–547, desktop-more.js:792–794), and the desktop section-accuracy
> ring never see a drill. **The only real defect is the results screen rendered live from state.** The
> earlier plan's O1a (stamp `full`) and O1c (`fullAttempts` estimate filter) are unnecessary and are dropped.

### Change — results screen only (O1b)
In both `resultsTpl` (exam.js) and the desktop results template (desktop-exam.js), branch on
`sectioned = s.examSection && s.examSection !== 'all'` **before** the band/verdict block. For a sectioned
auto-scored drill render a **section-scoped card** — reuse the existing correct/wrong/skipped tiles + the
section bar + Review answers, but **omit the `/300` ring and the pass/fail verdict tier**. Copy (approved):
title `"<section> · practice"`, subline **"Section practice — not a full-exam score"**, and a raw line like
`"15 / 20 correct · 75%"`. The `!total` Writing-only branch is unchanged (it is a subset of `sectioned`).
Reads live state — no attempt field, no persistence change.

### Files
`app/exam.js` (`resultsTpl` only), `app/desktop-exam.js` (results template only). Source-only → **no rebuild /
inject-auth**. (No change to `computeAttempt`, `shell.js`, `more.js`, or the dashboards.)

### Acceptance
- A Listening-only and a Reading-only drill each show a section card (no `/300` ring, no "Passed"); the same
  paper taken **full** still shows the band + verdict. Verified both clients, light + dark, 0 console errors.
- Regression: the dashboard estimate and Stats history are **unchanged** by running a drill (confirming the
  never-persisted invariant) — quick manual check, both clients.

### Interaction with M5
If M5 (extract `gradeSections`) lands first, O1b is a one-line skip: don't call `gradeSections` when
`sectioned`. If M5 is deferred, O1b adds the `sectioned` guard directly ahead of the two inline band blocks.
Either order works; see §Sequencing.

---

## O3 — Remove the `?pay=success` paywall bypass

### Problem
`auth-guard.js:128` computes
`payPending: (HSKAuth.isPayPending && HSKAuth.isPayPending()) || /[?&]pay=success/.test(window.location.search)`.
Any signed-in **non-subscriber** who loads `/app/?pay=success` gets `payPending:true` → `decideAccess`
returns `pay-pending` → `unveil()`. It never calls the server. This defeats the stated G4 justification.

### The catch — `/app/?pay=success` IS a legitimate return target (spec-review correction)
The funnel flow is safe (return → `/quiz/?pay=success`, `handlePaySuccess` onboarding.js:1251 arms the
durable marker `lsSet('hsk_pay_pending', now)` at :1255 and strips the param), **but there is a second,
in-app checkout the original plan missed:** the "Extend access" / plan-renewal flow `A.confirmPlan`
(**more.js:946–967**) sends its PSP `return` to **`base + '/app/?pay=success'`** (more.js:964, cancel →
`/app/?pay=cancel` at :965). `/app/` **is** a `body.app` page, and `confirmPlan` arms **only** the
sessionStorage `preOrder` marker (more.js:956) — it **never** arms the durable `hsk_pay_pending`
(grep confirms `hsk_pay_pending` is written **only** by onboarding.js:1255). So today the URL-param
disjunction is the **only** grace signal for the in-app renewal return: deleting it in isolation would bounce
a just-paid in-app renewer (a lapsed-then-resubscribed user, or a cold sub-cache + webhook lag) to
`/quiz/?sub=required` before the app can boot.

### Change — arm the durable marker in the in-app checkout, THEN delete the URL check
1. **Prerequisite (more.js).** In `A.confirmPlan` (more.js:946–967), before the PSP redirect, arm the durable
   marker: `HSKAuth.armPayPending()` (or `lsSet('hsk_pay_pending', String(Date.now()))` via the same key
   auth.js:289 uses) — mirroring `onboarding.js handlePaySuccess`. Now `HSKAuth.isPayPending()` (auth.js:307,
   30-min TTL) covers the in-app renewal return exactly as it covers the funnel, independent of the URL.
   (Non-subscribers cannot self-arm by typing the URL — arming requires actually initiating a real checkout
   behind `canPay()`; an abandoned checkout expires in the same 30-min window the funnel already grants.)
2. **Delete (auth-guard.js:128).** Drop the `|| /[?&]pay=success/.test(...)` disjunction so `payPending`
   derives solely from the durable, TTL-bounded `HSKAuth.isPayPending()`.

### Files
`app/more.js` (arm the marker in `confirmPlan`), `auth-guard.js` (delete one disjunct). Both non-generated →
no rebuild required for the edits (rebuild still runs at deploy).

### Acceptance
- Signed-in **non**-subscriber, no `hsk_pay_pending` marker, `/app/?pay=success` → **redirected to
  `/quiz/?sub=required`** (bypass closed).
- **In-app "Extend access" renewal:** click Extend → PSP → return to `/app/?pay=success` → durable marker
  (armed in step 1) → `pay-pending` grace, app renders (no funnel bounce). This is the regression the review
  caught — it MUST be smoke-tested.
- Funnel just-paid user (`/quiz/` return arms the marker) → unchanged.
- Optional guard-input regression: `payPending` false when only the URL param would have set it.

---

## M3 — Mask user PII from Yandex Webvisor on `/app/`

### Problem
`app/index.html:47` initialises Metrika with `webvisor:true` (session/DOM replay). The funnel deliberately
masks the same PII — `ym-disable-keys ym-hide-content` on the name/email inputs (onboarding.js:653, 681) and
`ym-hide-content` on the echo (onboarding.js:731). The post-paywall profile/settings screens re-render the
**same email (and name/country) with no masking class**, so Webvisor records it to Yandex.

Unmasked render sites (verified):
- `app/more.js:160` — mobile dashboard profile card (name + email)
- `app/more.js:723` — mobile profile **sheet** (name + email)  *(audit missed this one)*
- `app/more.js:758` — mobile settings email `<input value>` (disabled)
- `app/desktop-more.js:391` — desktop profile card (name + email + country)
- `app/desktop-more.js:479` — desktop settings email `<input value>` (disabled)

### Change — **DECIDED: (A) per-element masking**
Match the funnel: add `ym-hide-content` to each name/email/country **display** element, and
`ym-disable-keys ym-hide-content` to every **editable** PII input. Keeps Webvisor analytics on `/app/`;
consistent with the funnel's discipline. (Rejected: (B) `webvisor:false` on `/app/` — simpler but loses
replay; not chosen.)

**Spec-review correction — the highest-value surface was missed.** The original plan masked only the display
elements + the two `<input type=email disabled>` fields. But a **disabled** input cannot receive keystrokes,
so `ym-disable-keys` on it is near-inert — the real live keystroke-capture surface (under `webvisor:true`) is
the **editable Name and Country inputs** in the Edit-profile sheet, seeded from real profile PII
(`A.openEdit`, more.js:883): `data-in="onDraftName"` at **more.js:757** and `data-in="onDraftCountry"` at
**more.js:759**, and desktop `#pe-name` / `#pe-country` at **desktop-more.js:477 / :482**. The funnel masks
exactly this (its editable name input, onboarding.js:653). These four **must** be masked.

**Render/display sites** (add `ym-hide-content`): mobile profile card more.js:160, mobile profile sheet
more.js:723, desktop profile card desktop-more.js:391 (name + email + country). **Editable inputs** (add
`ym-disable-keys ym-hide-content`): more.js:757 (name), more.js:759 (country), desktop-more.js:477 (name),
desktop-more.js:482 (country); the disabled email inputs more.js:758 / desktop-more.js:479 get
`ym-hide-content` for value-masking completeness.

Residual risk: a future PII render site must remember the class — mitigate by grepping
`pv.email`/`p.email`/`onDraftName`/`onDraftCountry`/`#pe-` at review time and noting the convention in
CLAUDE.md's `/app/` section.

### Files
`app/more.js` (160, 723, 757, 758, 759), `app/desktop-more.js` (391, 477, 479, 482) — source-only, **no rebuild**.

### Acceptance
- All render sites (more.js:160/723, desktop-more.js:391) show email/name/country inside `.ym-hide-content`;
  all four editable inputs (more.js:757/759, desktop-more.js:477/482) carry `ym-disable-keys ym-hide-content`.
- Grep confirms no editable PII input on a `body.app` page lacks the masking class.

---

## M4 — Unit coverage for `bandScore` / `estScore`

### Problem
`bandScore` (shell.js:42) and `estScore` (shell.js:52) are the single formula behind the headline `/300`
number and the dashboard estimate. Both are already exported on `App.util` (shell.js:74–75) and are pure —
harness-loadable exactly like `scripts/skills-selfcheck.test.js` — yet no test calls them.

### Change
New `scripts/band-score.test.js` using the `freshApp()` / `loadFresh(A,'app/shell.js')` harness from
`skills-selfcheck.test.js`. Lock all `bandScore`/`estScore` branches:

| Case | Input | Expect |
|------|-------|--------|
| 2-section (<3 path) | L 16/20, R 12/20 | `bandScore = 210` (`round(140/200*300)`) |
| 3-section (sum path) | 10/20 ×3 | `bandScore = 150` |
| section-less legacy | `{pct:60, sections:[]}` | `bandScore = 180` |
| empty | `{sections:[]}` no pct | `bandScore = 0` |
| estScore mean | bands 100/200/300 | `estScore = 200`; with a 4th prepended, slice(-3) still 200 |

### Files
`scripts/band-score.test.js` (new). Runs under `node --test scripts/*.test.js`.

### Acceptance
7-file suite stays green; the new file fails if any branch, the 180 pass basis, or the `full` filter regresses.

---

## M5 — Extract one testable grader; kill the mobile≠desktop duplication

### Problem
The band + verdict math lives **inline** in `resultsTpl` (exam.js:1068–1114) and is **independently
duplicated** in desktop-exam.js:544–591. Both are embedded in string-returning HTML functions reading
module-private state → untestable, and free to drift apart.

### Change
Extract a pure `App.exam.gradeSections(sections)` (exposed on `ex` like `ex.normalizeTest`, exam.js:1439)
returning `{ band, pass:180, passed, ratio, tierKey }`, where `band` uses the shared `<3-section` mean×3
scaling. Rewire **both** `resultsTpl` and the desktop results template to call it (single source of truth),
and derive the verdict tier from `tierKey`. This also makes O1b a one-line skip (don't call `gradeSections`
for a sectioned drill).

### Files
`app/exam.js` (extract + export + use), `app/desktop-exam.js` (use), `scripts/exam-audio.test.js` **or** a
new `scripts/grade-sections.test.js`. Source-only, no rebuild.

### Acceptance
- **Explicit band values** (not only parity — a delegating `gradeSections` would make a pure parity assertion
  tautological): `gradeSections([{ok:16,tot:20},{ok:12,tot:20}]).band === 210`, and a passing set → `passed`
  true, a failing set → the correct tier. Then **also** assert
  `gradeSections(sec).band === App.util.bandScore({sections:sec})` (the "stay in agreement" contract).
- Tiers: `band≥180 → passed`; `ratio≥0.85`, `≥0.55`, else — matching current thresholds
  (exam.js:1111–1114, desktop-exam.js:588–591). Verdict copy unchanged in both clients.

---

## M6 — Unit coverage for `normalizeQ` Writing self-check

### Problem
`normalizeQ` (exam.js:152–171) is what makes Writing safe to exclude from auto-scoring: for
`type==='writing_construction'` it sets `selfCheck=true`, moves `options` into `modelAnswers`, and **clears
`options=[]`**. Every scorer (computeAttempt:519, resultsTpl:1051) relies on `selfCheck`. `ex.normalizeTest`
is already exported (exam.js:1439) but no test feeds it a writing question.

### Change
Extend `scripts/exam-audio.test.js` (or new `scripts/normalize-q.test.js`): feed `ex.normalizeTest` a raw
test containing a `writing_construction` question (both 看图造句-with-image and 完成句子-with-colon shapes)
and assert `q.selfCheck === true`, `q.options.length === 0`, `q.modelAnswers` populated. Optionally lock the
adjacent correctness branches the audit flagged: `reading_ordering → 阅读理解` fallback (exam.js:143–150),
`fill_in_blank` bank lettering (136), `correct_answer_index` mapping (118).

### Files
`scripts/exam-audio.test.js` (extend) or new file. No prod change (uses the existing export).

### Acceptance
A regression that drops `selfCheck` or fails to clear `options` for `writing_construction` fails the suite.

> **Scope note (spec review):** M6 locks the flag at the *producer* (`normalizeQ`). The *consumer* honoring —
> `computeAttempt`/`resultsTpl` doing `if (q.selfCheck) return;` (exam.js:519, 1051) — stays out of M6's
> declared no-prod-change scope (asserting it would require exporting `computeAttempt`). Promote the
> `reading_ordering → 阅读理解` fallback and `correct_answer_index` mapping from "optional" to required if
> cheap, since they ride the same `normalizeTest` harness.

---

## O5 — Keep the SEO pages publicly readable (C1 gate re-scope) — **DECIDED: (A)**

### Problem
`buildSitemap` (build.js:1116) emits ~598 URLs — `/exams/`, `/vocabulary/`, `/characters/…`, `/test/NN/`,
grammar/confusable/topic pages — that are all `body.app` and, since 2026-07-02, **subscription-gated** by
`auth-guard.js`. A crawler indexes the pre-rendered HTML; a human clicking the result is bounced to
`/quiz/?sub=required`. Not cloaking (same HTML to all agents), but a soft-404 / poor-SERP-experience risk.
This is the long-deferred **C1 scoping** question (`[[auth-content-gating-deferred]]`).

### Decided direction: (A) keep the SEO pre-render publicly readable
The whole `build.js` pre-render exists to rank these pages; gating them defeats the SEO strategy. Scope the
gate so the **interactive `/app/` product requires an active subscription**, while the SEO content pages
render to everyone (auth stays cosmetic). **Monetization note (explicit, since (A) opens reference content):**
this makes the pre-rendered *reference* content (word/character/grammar/sentence lists, exam question text)
free to logged-out visitors — no incremental data leak, since `data/*.json` is already a public static file
— while the **paid product remains the `/app/` interactive experience** (timed scored player, `/300` band,
SRS/mastery, HanziWriter practice, progress/sync). This is the intended freemium split; confirming it is part
of the review.

### Mechanism (corrected by spec review)
Path-scope the gate in `auth-guard.js` — a single file loaded by all ~598 `body.app` pages (not regenerated
by `build.js`), so the change propagates with **no page rebuild**. **The review corrected three things the
original one-line "skip the paywall redirect" framing got wrong:**

- **Scope BOTH redirects, not just the paywall one.** `decideAccess` returns `{action:'login'}` whenever
  `!o.session` (access-decision.js:40) — **before** any subscription check — and the guard bounces that to
  `/login/?next=` (auth-guard.js:141–145). A logged-**out** visitor on `/characters/…` would still be
  bounced. For a non-product (SEO) path the guard must skip **both** the `login` and the `paywall` redirects.
- **Always `unveil()` on the SEO path.** The `hsk-auth-pending` veil is baked into all 598 static pages
  (inject-auth.js:86 + common.css:1091) and only `unveil()` removes it; the paywall branch redirects
  *without* unveiling (auth-guard.js:140). A naive "just don't redirect" leaves the SEO page painted blank —
  the non-product branch must call `unveil()` and return.
- **Predicate against raw `window.location.pathname`, and fail *closed*.** `auth-guard.js:33` strips the
  trailing slash into `path`; a predicate written against the stripped form but checking `'/app/'` would
  never match → the `/app/` paywall is skipped → **every signed-in non-subscriber gets the paid product
  free (fail-open)**. Define `isProductPath(window.location.pathname)` to match **both** `/app` and
  `/app/…` (product), everything else = SEO/public. Implement as: `if (!isProductPath(...)) { unveil();
  return; }` at the **top** of the guard's post-session block, so a predicate bug can only over-gate (bounce
  an SEO page), never under-gate the product.

Concretely: add the short-circuit in `auth-guard.js`; `access-decision.js` is unchanged (the product/SEO
split lives in the guard shell, keeping the pure decision logic intact). `sitemap.xml` stays as-is.

### Risk / sequencing — **review recommends splitting O5 into its own cycle**
This edits the **live Group C paywall path** (`auth-guard.js`, whose `check-access` edge fn is deployed) and
carries a **fail-open-the-paid-product** failure mode if the path predicate is wrong (see §Mechanism). It is
by far the largest and highest-blast-radius of the seven, and — unlike the other six — it changes the
monetization surface (opens the reference content). **The spec review's verdict: give O5 its own
Group-C-style reviewed spec + plan cycle rather than bundling it into this pass.** Owner has chosen the
direction (A); the recommendation is to sequence it separately. The other six ship independently, and the
interim (leave today's gate + sitemap unchanged) carries **no regression** — only the pre-existing soft-404
posture, which is not a launch blocker.

### Files
`auth-guard.js` (the `isProductPath` short-circuit — `access-decision.js` stays unchanged). No page rebuild.
Because the split lives in the guard shell (not the pure `decideAccess`), it can only be **browser-verified**,
not unit-tested via `access-decision.test.js` — so the acceptance below is a mandatory manual matrix.

### Acceptance (guard-level, browser-verified both the product and SEO paths)
- **Fail-closed check (critical):** signed-in **non-subscriber** on `/app/` → still `/quiz/?sub=required`;
  unauthenticated on `/app/` → still `/login/?next=`. (Confirms the predicate didn't fail-open the product.)
- **SEO open check:** **logged-out** visitor on `/characters/…`, `/vocabulary/`, `/test/NN/` → content
  renders, **no** redirect **and** no residual `hsk-auth-pending` veil (page not blank).
- Every `sitemap.xml` URL resolves to readable content for an anonymous crawler.

---

## Decisions — RESOLVED (owner, 2026-07-23)

1. **O5 direction → (A)** keep SEO pages publicly readable via the C1 gate re-scope. **Open (post-review):**
   the spec review recommends O5 get its **own** reviewed cycle rather than riding this pass (live paywall
   path + fail-open risk + monetization change) — final sequencing call at planning time.
2. **M3 approach → (A)** per-element masking, matching the funnel.
3. **O1 copy → approved** — section-drill card wording ("Section practice — not a full-exam score").

Everything else is determined by the audit + code.

---

## Sequencing & dependencies

The six shippable items are largely independent; O5 is recommended to split out (see O5 §Risk).

1. **M5** (extract `gradeSections`, test) — optional-but-nice before O1b so the results branch shares one grader.
2. **O1b** (results-screen `sectioned` branch in exam.js + desktop-exam.js — **results templates only**; no
   `computeAttempt`/estimate/history changes, since drills are never persisted).
3. **M4** (band-score tests — the five arithmetic cases).
4. **M6** (normalizeQ writing self-check test) — independent, any time.
5. **O3** (arm `hsk_pay_pending` in `more.js` `confirmPlan` **then** delete the URL disjunct in
   `auth-guard.js` — order matters: arm first).
6. **M3** (masking incl. the four editable name/country inputs) — independent.
7. **O5 (A)** — path-scope the gate in `auth-guard.js`; **recommended to split into its own reviewed cycle**
   (live Group C path, fail-open risk, monetization change). The other six ship regardless.

TDD per the project convention: for M4/M5/M6 write the test first (red), then wire the code (green). O1b/O3/M3
are behaviour changes browser-verified on **both** clients via the placeholder-`config/auth.js` bypass
(swap → verify → restore; `config/auth.js` is git-tracked). O3's in-app-renewal grace and O5's fail-closed +
SEO-open checks are guard-level → **must** be browser-verified (not unit-testable).

## Test plan (suite must stay green: `node --test scripts/*.test.js` + `deno test supabase/functions/*/lib.test.ts`)

- New `scripts/band-score.test.js` (M4) and `scripts/grade-sections.test.js`/extended `exam-audio.test.js`
  (M5, M6).
- Extend `scripts/access-decision.test.js` for O3 if the URL-param logic is factored into a pure helper.
- No Deno-side change (O-items don't touch edge functions).

## Build & deploy

With the resolved decisions all seven are edits to **non-generated** files — `app/*.js`, `auth-guard.js`,
`scripts/*.test.js` — so **no page rebuild is strictly required** (M3(A) masks in `app/*.js`; O5(A) changes
only the shared `auth-guard.js` guard shell, not the 598 pages).
Regardless, before the push run `node build.js` **and** `node scripts/inject-auth.js` and commit the output —
`build.js` re-stamps `sitemap.xml <lastmod>` to today by design, so the sitemap shows in the diff even with
no content change, and the run confirms 0 generated-page drift + all `body.app` pages still carry auth.

Then the standard deploy (unchanged from the audit): merge `claude/dev → main`, `git push` (DO auto-deploys
`origin/main`), and run the prod smoke checks — including the new O3 check (`/app/?pay=success` as a
non-subscriber is bounced) and an O1 check (a Listening-only drill shows a section score, not "Passed").

## Verification matrix (both clients, light + dark, 0 console errors)

| Item | Check |
|------|-------|
| O1b | Listening-only & Reading-only drill → section card, no `/300` ring, no "Passed"; full paper → band + verdict |
| O1 (regression) | dashboard estimate + Stats history **unchanged** by a drill (never-persisted invariant holds) |
| O3 | non-sub `/app/?pay=success` → `/quiz/?sub=required`; **in-app Extend renewal** return → grace (marker armed) |
| M3 | email/name/country display inside `.ym-hide-content`; all four editable name/country inputs carry `ym-disable-keys ym-hide-content` |
| M4/M5/M6 | suite green; each new test fails on its targeted regression (M5 has explicit band values, not just parity) |
| O5 (if in this pass) | non-sub on `/app/` still bounced (no fail-open); logged-out on SEO page renders (no bounce, no residual veil) |
