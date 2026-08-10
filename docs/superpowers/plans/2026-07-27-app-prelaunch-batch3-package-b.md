# Package B — honest product surface (B3a, B3b, F3, F14) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stop the `/app/` client asserting four things it does not do — a daily notification cadence, spaced repetition, a 1,000-card review session, and a "weakest section" that is always Writing.

**Architecture:** Four independent edits inside the existing two-client structure (shared logic in `app/{core,exam,vocab,shell,more}.js`, presentation overrides in `app/desktop-*.js`). Two are pure copy changes with no invariant behind them (B3a, B3b). Two introduce a single source of truth and route every duplicate through it: `App.DECK_SIZE` + `App.vocab.deckPreview()/deckLabel()` for the session size (F3), and `App.exam.weakestSection()` for the section ranking (F14). Both new seams are pure functions, exported next to their existing siblings (`App.vocab.dueCount`, `App.exam.gradeSections`), and unit-tested with `node:test`.

**Tech Stack:** Plain ES5 IIFE modules, no bundler, no npm, no framework. Tests are Node's built-in `node:test` with zero dependencies, loading the real modules under a mocked `window`/`document` (the `scripts/skills-selfcheck.test.js` and `scripts/grade-sections.test.js` harness pattern).

**Spec:** `docs/superpowers/specs/2026-07-26-app-prelaunch-batch3-design.md` § "Package B — honest product surface".

---

## Ground truth — verified against HEAD `d890c458`, not the spec

The spec was written against an earlier tree. Every line number below was re-read at HEAD before this plan was written. **Where the spec and HEAD disagree, HEAD wins and this plan says so.**

### Confirmed exactly as the spec describes

| Item | Site | Verified content |
|---|---|---|
| B3a | `app/core.js:127` | `uiLang: 'en', notif: true,` |
| B3a | `app/more.js:729-731` | notif vars; `:731` is `var notifSub = pv.notif ? 'Daily reminder' : 'Off';` |
| B3a | `app/more.js:753-756` | the mobile row; heading at `:754` already reads `Notifications` |
| B3a | `app/desktop-more.js:374-376` | notif vars; `:376` is `var notifSub = pv.notif ? 'On' : 'Off';` |
| B3a | `app/desktop-more.js:424` | heading `Daily reminder <span class="chinese"…>提醒</span>` |
| B3a | `app/desktop-more.js:425` | `aria-label="Toggle daily reminder"` |
| B3b | `app/desktop-vocab.js:328` | `Spaced repetition keeps words in long-term memory` — still the only such claim in the product surface |
| B3b | `app/desktop-vocab.js:326` | eyebrow `Daily review · 每日复习` |
| F3 | `app/vocab.js:171` | `pool.slice(0, 20)` over the *unmastered* pool |
| F3 | `app/vocab.js:283-284` | the quiz round's hardcoded `20`s (three literals across the two lines) |
| F3 | `app/vocab.js:654 / :664` | `total - masteredCount` rendered as "N cards to review" |
| F3 | `app/vocab.js:481-487` | `syncMasteredLive()` → `App.live('vDue', fmtNum(due))` |
| F3 | catalog / session sizes | `data/vocabulary.json` holds **1,000** words; a deck and a quiz round are both **20** |
| F14 | `app/exam.js:762-782` | `App.actions.resultsGoNext`; the `forEach` at `:766-772` has **no** `selfCheck` guard |
| F14 | `app/exam.js:1160-1163` | the mobile results card's `weak`/`weakR` — already guard-correct (built from the guarded `secList`) |
| F14 | `app/desktop-exam.js:582-585` | the desktop inline copy, already guard-correct |
| — | `app/index.html:65-73` | `core.js` loads first; `exam.js`/`vocab.js` load before their `desktop-*` counterparts |

### Corrections that change the work

1. **`app/desktop-vocab.js:341` already goes through a seam.** It reads
   `var due = App.vocab.dueCount ? App.vocab.dueCount() : Math.max(0, total - masteredCount);`
   — not the raw `total - mastered` the spec describes. `App.vocab.dueCount` exists at `app/vocab.js:740`.
2. **The all-mastered branch re-deals the FROZEN deck.** The spec says `app/vocab.js:174` "deals 20
   already-mastered cards". It does not, in general: `:172-175` first reuses `s.deckIds` when one exists.
   Empirically confirmed at HEAD — with a prior deck of 7 and everything mastered, `startDeck` deals **7**,
   not 20. The preview helper must mirror that branch or the invariant test fails on a real user's second
   all-mastered visit.
3. **Three writers of the number the spec never lists.** An implementer following the spec literally leaves
   all three wrong or inconsistent:
   - `app/desktop-more.js:700` → `:705` renders `due + ' due'` on the Stats screen's Vocabulary card
     (today: "1000 due" — raw concatenation, no thousands separator; this file has no `fmtNum` and its
     neighbouring `sub` line is unformatted too), from the same `App.vocab.dueCount()` seam.
   - `app/shell.js:147` → `:188` renders `Math.min(dueCount, 20) + ' cards to review'` — already clamped,
     but with a **literal 20** that is exactly the constant F3 exists to centralise.
   - `app/desktop-shell.js:338` → `:441` renders `Math.min(h.dueCount, 20) + ' cards to begin'` — same.
4. **The spec's citation of mobile's sub-line is not literal.** It calls for the desktop sub-line to converge
   on "mobile's `app/vocab.js:665`". HEAD `:665` reads `Swipe through · mark what you know`. The spec's
   verbatim replacement string is used as given; mobile `:665` is **not** changed (it is honest, and it names
   the mobile-only swipe gesture correctly).
5. **The suite is at 106 tests, not 103.** `CLAUDE.md` and the spec both say 103; Package A added three.
   This package takes it to **124** (validated, see "Prototype validation" below).

### Owner decisions taken for this plan (2026-07-27)

The spec leaves three copy questions open. All three were put to the owner and answered:

- **Mobile eyebrow `app/vocab.js:663`** is the byte-identical `Daily review · 每日复习` that B3b removes from
  desktop. The spec said to leave it. **Owner chose: converge both clients on `Flashcard review · 复习`.**
- **`app/desktop-more.js:705` "N due" Stats chip.** **Owner chose: relabel to `N left`**, and keep
  `App.vocab.dueCount()` meaning "unmastered remaining" — a progress card must keep showing progress; only
  the scheduling word "due" goes.
- **Desktop hero headline `app/desktop-vocab.js:327`** (`N cards due today`, no replacement in the spec).
  **Owner chose: converge on mobile's `N cards to review`**, with `Review N mastered words` as the
  all-mastered state.

### Prototype validation

Every implementation edit and both new test files in this plan were applied to an isolated copy of `app/` in
a scratch directory and run before this plan was written. Results: **124 tests, 124 pass, 0 fail** (106
existing + 18 new, no regressions). The same two test files run against **unpatched HEAD** fail all 18, with
exactly the messages this plan's RED steps predict. The working tree was never modified.

---

## Global Constraints

- **ES5 only** in `app/*.js` and `scripts/*.test.js`-adjacent app code: `var`, `function` declarations, no
  arrow functions, no `let`/`const`, no template literals, no optional chaining. (Test files themselves are
  Node-only and already use `const`/arrows — follow each file's own idiom.)
- **No npm, no bundler, no linter.** Tests use `node:test` + `node:assert/strict` + `node:path` only.
- **Never hand-edit generated `index.html` files.** No file this package touches is generated. `app/*.js` are
  hand-maintained sources; `app/index.html` is hand-maintained but is **not** touched by this package.
- **No `node build.js` run and no `node scripts/inject-auth.js` run is needed for this package** — it changes
  no `data/*.json`, no `build.js` generator, and creates no new platform page.
- **Read `App.*` at call time**, never cache it at module load — the codebase convention (`App.keys.<x>` is
  resolved per call). New helpers follow it.
- **`App.live(name, text)` sets `textContent`** of every `[data-live="<name>"]` element. It cannot set HTML,
  so any phrase that must change with state has to live entirely inside the span.
- Test command: `node --test scripts/*.test.js` from the repo root.
- Every commit message ends with the project's standard trailer:
  `Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>`

---

## File Structure

| File | Change | Task |
|---|---|---|
| `app/core.js` | `notif` default `true` → `false`; add `App.DECK_SIZE = 20` | 1, 3 |
| `app/more.js` | notif ON sub-label copy | 1 |
| `app/desktop-more.js` | notif ON sub-label, row heading, `aria-label`; Stats chip `due` → `left` | 1, 4 |
| `app/vocab.js` | eyebrow copy; `DECK()`, `deckPreview()`, `deckLabel()`; route deck + quiz builders; hero + live channel | 2, 3, 4 |
| `app/desktop-vocab.js` | eyebrow + sub-line copy; hero headline through `deckLabel()` | 2, 4 |
| `app/shell.js` | literal `20` → `App.DECK_SIZE` | 4 |
| `app/desktop-shell.js` | literal `20` → `App.DECK_SIZE` | 4 |
| `app/exam.js` | add `weakestSection()`; route `resultsGoNext` + the results card | 5 |
| `app/desktop-exam.js` | route the inline duplicate | 5 |
| `scripts/vocab-session.test.js` | **new** — the F3 hero==deck invariant | 3 |
| `scripts/weakest-section.test.js` | **new** — the F14 rule | 5 |

**Task order:** copy-only edits first (Tasks 1–2), because they are 1-for-1 line replacements that shift no
line numbers. Tasks 3–5 insert code and therefore move lines below their insertion points — which is why
**every edit in this plan is specified by a verbatim anchor string, not by line number.** Line numbers are
given only for orientation and are all HEAD `d890c458`.

### Deliberately NOT changed (stated so the plan is not over-read)

- **`app/sync.js`** — `notif` stays in the synced key list (`:55`, `:91`, `:133`, `:151`). The B3a default
  change affects only accounts that never wrote `hsk4-notif`; `app/core.js:932-933` still lets a stored value
  win, so an existing user's choice survives and still follows them across devices.
- **`app/vocab.js:665`** (`Swipe through · mark what you know`) — honest, and mobile-specific.
- **`app/vocab.js:660` / `app/desktop-vocab.js:348`** (`1,000 of 1,200 HSK 4 words`) — accurate: the app
  ships 1,000 of the 1,200-word HSK 4 list.
- **`app/shell.js:146` vs `app/vocab.js:83-87`** — `shell.js` counts mastery as `(s.vMastered||[]).length`
  (raw stored ids) while `vocab.js` uses `countMastered` (ids present in the catalog). These can disagree if
  a stale id is stored. Pre-existing, out of scope for Package B; worth its own follow-up task.
- **The RU interface row** (`app/more.js:783`, `app/desktop-more.js:984`) — localization is explicitly out of
  scope for this whole batch, per owner instruction.

---

## Task 1: B3a — the Notifications row defaults OFF and stops naming a cadence

**Files:**
- Modify: `app/core.js:127` (state default)
- Modify: `app/more.js:731` (mobile ON sub-label)
- Modify: `app/desktop-more.js:376` (desktop ON sub-label), `:424` (row heading), `:425` (`aria-label`)

**Interfaces:**
- Consumes: nothing from earlier tasks.
- Produces: nothing later tasks rely on. `App.state.notif` keeps its boolean type; `App.keys.notif`
  (`'hsk4-notif'`), the `toggleNotif` action (`app/more.js:922-926`, shared by both clients) and the
  `app/sync.js` key list are all unchanged.

**Why no unit test:** per the spec's test plan, B3a is a copy/default change with no invariant behind it —
asserting on rendered substrings would re-encode the copy in a second place. It is browser-verified in Task 6.

- [ ] **Step 1: Flip the state default to OFF**

In `app/core.js` (HEAD `:127`), replace this exact substring:

```js
uiLang: 'en', notif: true,
```

with:

```js
uiLang: 'en', notif: false, /* B3a: OFF until a delivery mechanism exists — nobody is opted in without asking */
```

Nothing else on that line changes. `app/core.js:932-933` (`var n = App.store.get(App.keys.notif); if (n != null) s.notif = n === '1';`) is **not** touched — a user who already toggled the switch keeps their stored choice; only accounts that never wrote the key see the new default.

- [ ] **Step 2: Stop the mobile ON label naming a cadence**

In `app/more.js` (HEAD `:731`), replace this exact line:

```js
    var notifSub = pv.notif ? 'Daily reminder' : 'Off';
```

with:

```js
    /* B3a: the ON string must not name a cadence — no reminder delivery exists yet */
    var notifSub = pv.notif ? 'On · reminders coming soon' : 'Off';
```

The row's heading at `:754` already reads `Notifications` and stays as it is.

- [ ] **Step 3: Mirror it on desktop, where the cadence claim also lives in the heading and the aria-label**

In `app/desktop-more.js` (HEAD `:376`), replace this exact line:

```js
    var notifSub = pv.notif ? 'On' : 'Off';
```

with:

```js
    /* B3a: mirrors mobile more.js — the ON string must not name a cadence */
    var notifSub = pv.notif ? 'On · reminders coming soon' : 'Off';
```

In the same file (HEAD `:424`), replace this exact substring:

```
<span style="font-weight:600;color:var(--ink);font-size:var(--fs-md)">Daily reminder <span class="chinese" style="font-weight:400;color:var(--stone);font-size:.85em">提醒</span></span>
```

with:

```
<span style="font-weight:600;color:var(--ink);font-size:var(--fs-md)">Notifications <span class="chinese" style="font-weight:400;color:var(--stone);font-size:.85em">提醒</span></span>
```

And in the same file (HEAD `:425`), replace this exact substring:

```
aria-label="Toggle daily reminder"
```

with:

```
aria-label="Toggle notifications"
```

- [ ] **Step 4: Confirm no cadence claim survives anywhere**

Run:

```bash
grep -rn "Daily reminder" app/
```

Expected: **no output** (exit status 1).

Then run:

```bash
grep -rn "reminders coming soon" app/
```

Expected: exactly two hits — `app/more.js` and `app/desktop-more.js`.

- [ ] **Step 5: Confirm the suite is still green**

Run: `node --test scripts/*.test.js`
Expected: `pass 106`, `fail 0`.

- [ ] **Step 6: Commit**

```bash
git add app/core.js app/more.js app/desktop-more.js
git commit -m "fix(app): notifications default OFF and stop claiming a daily cadence (B3a)

No delivery mechanism exists — grep for Notification/serviceWorker/
requestPermission across the repo returns only the row's own label. The
switch shipped ON by default, so every new account was opted in to
nothing. Default flips to false (stored choices still win, so existing
users and app/sync.js are unaffected) and the ON label stops naming a
schedule. On desktop the cadence claim also lived in the row heading and
its aria-label, so both move to Notifications.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Task 2: B3b — remove the spaced-repetition claim and the daily-cadence eyebrows

**Files:**
- Modify: `app/desktop-vocab.js:326` (eyebrow), `:328` (sub-line)
- Modify: `app/vocab.js:663` (eyebrow — owner decision, see Ground truth)

**Interfaces:**
- Consumes: nothing from earlier tasks.
- Produces: nothing. Task 4 edits `app/desktop-vocab.js:327` and `app/vocab.js:664`, which sit **between**
  these two edits in each file — all three are 1-for-1 line replacements, so no line shifts and no conflict.

**Why no unit test:** same reason as Task 1 — pure copy. Browser-verified in Task 6.

- [ ] **Step 1: Replace the spaced-repetition claim with what the deck actually does**

In `app/desktop-vocab.js` (HEAD `:328`), replace this exact line:

```js
          '<div style="opacity:.9;margin-top:3px;font-size:var(--fs-md)">Spaced repetition keeps words in long-term memory</div>' +
```

with:

```js
          '<div style="opacity:.9;margin-top:3px;font-size:var(--fs-md)">Mark what you know — mastered words leave the deck</div>' +
```

(The dash is an em dash `—`, U+2014. The file is UTF-8 and already carries Chinese characters.)

- [ ] **Step 2: Drop the daily-cadence eyebrow on desktop**

In `app/desktop-vocab.js` (HEAD `:326`), replace this exact line:

```js
          '<div style="font-size:var(--fs-xs);text-transform:uppercase;letter-spacing:.12em;font-weight:700;opacity:.9">Daily review · <span class="chinese">每日复习</span></div>' +
```

with:

```js
          '<div style="font-size:var(--fs-xs);text-transform:uppercase;letter-spacing:.12em;font-weight:700;opacity:.9">Flashcard review · <span class="chinese">复习</span></div>' +
```

- [ ] **Step 3: Drop the same eyebrow on mobile (owner decision — the spec left it)**

In `app/vocab.js` (HEAD `:663`), replace this exact line:

```js
            '<div style="font-size:.68rem;text-transform:uppercase;letter-spacing:.1em;font-weight:700;opacity:.9">Daily review · <span class="chinese">每日复习</span></div>' +
```

with:

```js
            '<div style="font-size:.68rem;text-transform:uppercase;letter-spacing:.1em;font-weight:700;opacity:.9">Flashcard review · <span class="chinese">复习</span></div>' +
```

`app/vocab.js:665` (`Swipe through · mark what you know`) is deliberately left alone — it is honest and names the mobile swipe gesture.

- [ ] **Step 4: Confirm no scheduling claim survives**

Run:

```bash
grep -rn "Spaced repetition\|spaced repetition\|Daily review\|每日复习" app/
```

Expected: **no output** (exit status 1).

- [ ] **Step 5: Confirm the suite is still green**

Run: `node --test scripts/*.test.js`
Expected: `pass 106`, `fail 0`.

- [ ] **Step 6: Commit**

```bash
git add app/desktop-vocab.js app/vocab.js
git commit -m "fix(app): the vocab deck stops claiming spaced repetition (B3b)

No scheduler exists: the only persisted vocab state is
hsk4-vocab-mastered, a flat set — no timestamps, no interval, no ease
factor, no per-word history. The desktop sub-line now says what the deck
actually does. Both clients' Daily review eyebrows go too: the mobile one
was the byte-identical string, so leaving it would have kept the cadence
claim alive on the client that never lost it.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Task 3: F3 (part 1) — `App.DECK_SIZE` and the deck-preview seam

**Files:**
- Modify: `app/core.js` — add `App.DECK_SIZE` immediately after the `App.keys` block (HEAD `:165-171`)
- Modify: `app/vocab.js` — add `DECK()`, `deckPreview()`, `deckLabel()`; route `startDeck` and `startQuiz`
- Test: `scripts/vocab-session.test.js` (**new**)

**Interfaces:**
- Consumes: nothing from earlier tasks.
- Produces, relied on by Task 4:
  - `App.DECK_SIZE` — `number`, `20`. Declared in `app/core.js`, which `app/index.html:65` loads before every
    other module, so every later module sees it.
  - `App.vocab.deckPreview()` → `{ n: number, allMastered: boolean }`. `n` is exactly the number of cards
    `App.vocab.startDeck()` will put in `App.state.deckIds`.
  - `App.vocab.deckLabel()` → `string`. The complete hero phrase, e.g. `'20 cards to review'`,
    `'Review 20 mastered words'`, `'No cards yet'`. Rendered as the whole content of
    `[data-live="vDue"]`, so `App.live('vDue', …)` can swap the entire phrase and not just the digits.
  - `App.vocab.dueCount()` and `App.vocab.masteredCount()` are **unchanged** — `dueCount()` still means
    "unmastered words remaining in the catalog".

- [ ] **Step 1: Write the failing test**

Create `scripts/vocab-session.test.js` with exactly this content:

```js
/* Package B / F3: the vocabulary hero must print the deck the user actually
   RECEIVES, not the whole remaining catalog. Loads the REAL app/core.js (for the
   one true App.DECK_SIZE) plus app/vocab.js in a mocked env, mirroring
   skills-selfcheck.test.js. Run: node --test scripts/vocab-session.test.js */
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

function loadFresh(rel) {
  const p = path.resolve(__dirname, '..', rel);
  delete require.cache[require.resolve(p)];
  require(p);
}

/* core.js + vocab.js into ONE App, so the constant under test is the shipped one */
function boot(wordCount, masteredCount, deckIds) {
  global.localStorage = { getItem() { return null; }, setItem() {}, removeItem() {} };
  global.window = {
    addEventListener() {}, matchMedia() { return { matches: false, addEventListener() {} }; },
    localStorage: global.localStorage,
  };
  global.document = {
    addEventListener() {}, querySelectorAll() { return []; }, querySelector() { return null; },
    getElementById() { return null; },
    documentElement: { setAttribute() {}, removeAttribute() {}, getAttribute() { return null; } },
    createElement() { return { style: {}, setAttribute() {}, appendChild() {}, classList: { add() {}, remove() {} } }; },
    body: { classList: { add() {}, remove() {} } },
  };
  loadFresh('app/core.js');
  const App = global.window.App;
  App.data = App.data || {};
  App.data.WORDS = Array.from({ length: wordCount }, (_, i) => ({
    id: i + 1, hanzi: '字', pinyin: 'zi', meaning: 'm' + (i + 1), pos: 'n.', freq: i,
  }));
  App.state.vMastered = Array.from({ length: masteredCount }, (_, i) => i + 1);
  App.state.deckIds = deckIds || [];
  App.state.vSort = 'default';
  App.setState = function (patch) { for (const k in patch) App.state[k] = patch[k]; };
  App.render = function () {};
  App.update = function () {};
  loadFresh('app/vocab.js');
  return App;
}

/* THE invariant: whatever the hero promises is what startDeck deals. */
function dealt(App) { App.vocab.startDeck(); return App.state.deckIds.length; }

test('F3: App.DECK_SIZE is the single session-size constant', () => {
  const App = boot(1000, 0);
  assert.equal(typeof App.DECK_SIZE, 'number');
  assert.equal(App.DECK_SIZE, 20);
});

test('F3 INVARIANT: the previewed count equals the deck startDeck deals', () => {
  const cases = [
    { words: 1000, mastered: 0, label: 'fresh subscriber (the 50x overstatement)' },
    { words: 1000, mastered: 500, label: 'halfway' },
    { words: 1000, mastered: 993, label: 'seven unmastered left — fewer than a full deck' },
    { words: 1000, mastered: 999, label: 'one unmastered left' },
    { words: 1000, mastered: 1000, label: 'everything mastered, no frozen deck' },
    { words: 6, mastered: 0, label: 'catalog smaller than a deck' },
    { words: 6, mastered: 6, label: 'tiny catalog, everything mastered' },
  ];
  cases.forEach((c) => {
    const App = boot(c.words, c.mastered);
    const promised = App.vocab.deckPreview().n;
    assert.equal(promised, dealt(App), c.label);
  });
});

test('F3 INVARIANT: all-mastered re-deals the FROZEN deck, and the preview says so', () => {
  /* startDeck reuses state.deckIds when nothing is unmastered — a 7-card frozen
     deck must not be previewed as 20. */
  const App = boot(1000, 1000, [1, 2, 3, 4, 5, 6, 7]);
  assert.equal(App.vocab.deckPreview().n, 7);
  assert.equal(dealt(App), 7);
});

test('F3: the hero never promises the whole remaining catalog', () => {
  const App = boot(1000, 0);
  assert.equal(App.vocab.deckPreview().n, 20);
  assert.notEqual(App.vocab.deckPreview().n, 1000);
  assert.equal(App.vocab.dueCount(), 1000, 'dueCount still means "unmastered remaining"');
});

test('F3: deckLabel copy states — normal, near-empty, singular, all-mastered, no data', () => {
  assert.equal(boot(1000, 0).vocab.deckLabel(), '20 cards to review');
  assert.equal(boot(1000, 993).vocab.deckLabel(), '7 cards to review');
  assert.equal(boot(1000, 999).vocab.deckLabel(), '1 card to review');
  assert.equal(boot(1000, 1000).vocab.deckLabel(), 'Review 20 mastered words');
  assert.equal(boot(1000, 1000, [42]).vocab.deckLabel(), 'Review 1 mastered word');
  assert.equal(boot(0, 0).vocab.deckLabel(), 'No cards yet');
});

test('F3: the quiz round is DECK_SIZE too, and tops up from mastered when short', () => {
  const App = boot(1000, 0);
  App.vocab.startQuiz();
  assert.equal(App.state.quizIds.length, App.DECK_SIZE);

  const App2 = boot(1000, 995);           // only 5 unmastered
  App2.vocab.startQuiz();
  assert.equal(App2.state.quizIds.length, App2.DECK_SIZE, 'topped up from mastered');

  const App3 = boot(6, 0);                // catalog smaller than a round
  App3.vocab.startQuiz();
  assert.equal(App3.state.quizIds.length, 6);
});

test('F3: DECK_SIZE is honoured, not hardcoded — changing it moves the deck', () => {
  const App = boot(1000, 0);
  App.DECK_SIZE = 5;
  assert.equal(App.vocab.deckPreview().n, 5);
  assert.equal(dealt(App), 5);
  assert.equal(App.vocab.deckLabel(), '5 cards to review');
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `node --test scripts/vocab-session.test.js`
Expected: `fail 7`, `pass 0`, with these messages:
- `F3: App.DECK_SIZE is the single session-size constant` → `AssertionError` (`undefined` !== `'number'`)
- the other six → `TypeError: App.vocab.deckPreview is not a function` /
  `TypeError: boot(...).vocab.deckLabel is not a function`, and for the quiz test an `AssertionError`.

- [ ] **Step 3: Declare the constant in core.js**

In `app/core.js`, find the end of the `App.keys` block (HEAD `:170-171`) and replace this exact substring:

```js
    preOrder: 'hsk4m-pre-order' /* sessionStorage checkout marker (more.js) — name shared with any in-flight checkout, kept stable */
  };
```

with:

```js
    preOrder: 'hsk4m-pre-order' /* sessionStorage checkout marker (more.js) — name shared with any in-flight checkout, kept stable */
  };

  /* ONE source of truth for the flashcard/quiz session size (F3). The vocabulary
     heroes print the deck the user is about to receive and vocab.js builds that
     deck from this same constant, so the promised number and the delivered deck
     can never drift apart again. Read at call time, like App.keys.*. */
  App.DECK_SIZE = 20;
```

- [ ] **Step 4: Add the call-time reader in vocab.js**

In `app/vocab.js`, replace this exact line (HEAD `:59`):

```js
  function words() { return (App.data && App.data.WORDS) || []; }
```

with:

```js
  function words() { return (App.data && App.data.WORDS) || []; }

  /* Session size — resolved at call time from App.DECK_SIZE (core.js), the same
     way App.keys.* is, so there is exactly ONE literal 20 in the codebase. */
  function DECK() { return App.DECK_SIZE; }
```

There is deliberately **no fallback default** here. `app/index.html:65` loads `core.js` before `vocab.js`, and if `core.js` were ever missing the boot assert at `app/index.html:93` paints the reload card before any of this runs. A fallback literal would be a second source of truth — the exact defect F3 exists to remove. This matches how `app/vocab.js:90` already reads `App.keys.mastered` with no fallback.

Known, accepted risk class (pre-existing, not introduced here): `app/index.html`'s script tags are unversioned, so a partial browser-cache refresh could pair a stale `core.js` with a new `vocab.js` — `DECK()` would return `undefined` and the deck degrades until the cache settles. This is the same exposure `app/desktop-vocab.js:68-74` already carries by calling seven `App.vocab.*` seams unguarded; module-version skew is out of this package's scope.

- [ ] **Step 5: Route the deck builder through it**

In `app/vocab.js`, replace this exact line (HEAD `:171`):

```js
    var ids = pool.slice(0, 20).map(function (w) { return Number(w.id); });
```

with:

```js
    var ids = pool.slice(0, DECK()).map(function (w) { return Number(w.id); });
```

Then replace this exact line (HEAD `:174`):

```js
      else ids = words().slice(0, 20).map(function (w) { return Number(w.id); });
```

with:

```js
      else ids = words().slice(0, DECK()).map(function (w) { return Number(w.id); });
```

- [ ] **Step 6: Route the quiz round through it**

In `app/vocab.js`, replace these two exact lines (HEAD `:283-284`):

```js
    var ids = un.slice(0, 20);
    if (ids.length < 20) ids = ids.concat(ma.slice(0, 20 - ids.length));
```

with:

```js
    var ids = un.slice(0, DECK());
    if (ids.length < DECK()) ids = ids.concat(ma.slice(0, DECK() - ids.length));
```

- [ ] **Step 7: Add the preview + label helpers**

In `app/vocab.js`, replace this exact line (HEAD `:181`):

```js
  function deckIds() { var d = S().deckIds; return Array.isArray(d) ? d : []; }
```

with:

```js
  /* The number the heroes print. Mirrors startDeck EXACTLY — including its
     all-mastered branch, which re-deals the FROZEN deck when one exists — so
     the hero can never promise more cards than the next tap hands over.
     Pure: reads state + data, writes nothing. */
  function deckPreview() {
    var s = S(), mset = masteredSet(), ws = words();
    var un = 0;
    for (var i = 0; i < ws.length; i++) { if (!mset.has(Number(ws[i].id))) un++; }
    if (un > 0) return { n: Math.min(DECK(), un), allMastered: false };
    var prev = Array.isArray(s.deckIds) ? s.deckIds.length : 0;
    return { n: prev || Math.min(DECK(), ws.length), allMastered: true };
  }

  /* Hero copy for BOTH clients. The WHOLE phrase lives inside [data-live="vDue"]
     so syncMasteredLive can swap the all-mastered state, not just the digits. */
  function deckLabel() {
    var p = deckPreview();
    if (!p.n) return 'No cards yet';
    if (p.allMastered) return 'Review ' + fmtNum(p.n) + ' mastered ' + (p.n === 1 ? 'word' : 'words');
    return fmtNum(p.n) + ' ' + (p.n === 1 ? 'card' : 'cards') + ' to review';
  }

  function deckIds() { var d = S().deckIds; return Array.isArray(d) ? d : []; }
```

The `un > 0` branch mirrors `startDeck`'s `ids = pool.slice(0, DECK())` over the unmastered pool; the `else` branch mirrors `startDeck`'s `if (!ids.length)` fallback at HEAD `:172-175`, which prefers the frozen `s.deckIds` and only then falls back to `words().slice(0, DECK())`.

- [ ] **Step 8: Export the two helpers**

In `app/vocab.js`, replace this exact substring (HEAD `:740`):

```js
  App.vocab.dueCount = function () {
```

with:

```js
  App.vocab.deckPreview = deckPreview; /* pure; the F3 hero==deck invariant */
  App.vocab.deckLabel = deckLabel;
  App.vocab.dueCount = function () {
```

`App.vocab.dueCount` and `App.vocab.masteredCount` keep their existing bodies and meanings.

- [ ] **Step 9: Run the test to verify it passes**

Run: `node --test scripts/vocab-session.test.js`
Expected: `tests 7`, `pass 7`, `fail 0`.

- [ ] **Step 10: Run the whole suite for regressions**

Run: `node --test scripts/*.test.js`
Expected: `tests 113`, `pass 113`, `fail 0` (106 existing + 7 new).

- [ ] **Step 11: Commit**

```bash
git add app/core.js app/vocab.js scripts/vocab-session.test.js
git commit -m "feat(app): App.DECK_SIZE + a deck preview that mirrors the real deck (F3, part 1)

The heroes promised total-minus-mastered and the builder dealt 20 — a 50x
overstatement to a fresh subscriber. One constant now feeds both the
flashcard deck and the quiz round, and deckPreview() mirrors startDeck
branch for branch, including the all-mastered path that re-deals the
FROZEN deck (a 7-card deck must not be previewed as 20). deckLabel()
returns the whole phrase so the live channel can swap the all-mastered
copy state, not just the digits. The invariant — previewed count equals
dealt count — is now a test, not a comment.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Task 4: F3 (part 2) — every writer of the number adopts the seam

**Files:**
- Modify: `app/vocab.js` — hero (HEAD `:654`, `:664`) and the live channel (HEAD `:481-487`)
- Modify: `app/desktop-vocab.js` — `heroHtml` signature + headline (HEAD `:321`, `:327`), its caller (HEAD `:341`, `:350`)
- Modify: `app/desktop-more.js` — Stats card chip (HEAD `:705`)
- Modify: `app/shell.js` — literal `20` (HEAD `:188`)
- Modify: `app/desktop-shell.js` — literal `20` (HEAD `:441`)

**Interfaces:**
- Consumes from Task 3: `App.DECK_SIZE` (number), `App.vocab.deckLabel()` (string), `App.vocab.deckPreview()`
  (`{n, allMastered}`), and the unchanged `App.vocab.dueCount()` (unmastered remaining).
- Produces: nothing later tasks rely on.

**Load-order note:** `app/shell.js` loads at `app/index.html:68`, *before* `app/vocab.js` at `:70`. That is
fine — `App.DECK_SIZE` comes from `core.js` (`:65`), and `computeHome` runs at render time, long after every
module has loaded. `app/desktop-*.js` all load after their shared counterparts (`:73`).

- [ ] **Step 1: Extend the test with the render-path expectations**

Append these two tests to the end of `scripts/vocab-session.test.js`:

```js
test('F3: the live channel emits the same phrase the hero rendered', () => {
  /* syncMasteredLive drives [data-live="vDue"]; if it emitted the old
     total-minus-mastered arithmetic, the first mastery tap would overwrite the
     corrected hero with "999". */
  const App = boot(1000, 0);
  const live = {};
  App.live = function (name, text) { live[name] = text; };
  App.actions.toggleMastered(1);              // master one word -> syncMasteredLive
  assert.equal(live.vDue, App.vocab.deckLabel());
  assert.equal(live.vDue, '20 cards to review');
  assert.notEqual(live.vDue, '999');
  assert.equal(live.vMastered, '1');
});

test('F3: the mobile hero markup carries the whole phrase inside [data-live="vDue"]', () => {
  const App = boot(1000, 0);
  const html = App.vocab.screen();
  assert.match(html, /<span data-live="vDue">20 cards to review<\/span>/);
  assert.doesNotMatch(html, /1,000 cards/, 'the catalog count is not the session size');
});
```

- [ ] **Step 2: Run the test to verify the two new cases fail**

Run: `node --test scripts/vocab-session.test.js`
Expected: `tests 9`, `pass 7`, `fail 2` — the seven from Task 3 still pass, the two new ones fail:
- `F3: the live channel emits the same phrase the hero rendered` → `AssertionError`,
  `actual: '999'`, `expected: '20 cards to review'`.
- `F3: the mobile hero markup carries the whole phrase…` → `AssertionError`, the rendered markup still
  contains `<span data-live="vDue">1,000</span> cards to review`.

- [ ] **Step 3: Point the mobile hero at `deckLabel()`**

In `app/vocab.js`, delete this exact line (HEAD `:654`) entirely — it becomes unused:

```js
    var dueCount = Math.max(0, total - masteredCount);
```

Then replace this exact substring (HEAD `:664`):

```js
<span data-live="vDue">' + fmtNum(dueCount) + '</span> cards to review</div>' +
```

with:

```js
<span data-live="vDue">' + esc(deckLabel()) + '</span></div>' +
```

Note the trailing static text `cards to review` is removed — the phrase now lives entirely inside the span, which is what lets `App.live` swap the all-mastered state.

- [ ] **Step 4: Point the live channel at the same helper**

In `app/vocab.js`, replace these three exact lines (HEAD `:483-485`):

```js
      var mc = countMastered(masteredSet());
      var due = Math.max(0, words().length - mc);
      if (App.live) { App.live('vMastered', String(mc)); App.live('vDue', fmtNum(due)); }
```

with:

```js
      var mc = countMastered(masteredSet());
      if (App.live) { App.live('vMastered', String(mc)); App.live('vDue', deckLabel()); }
```

`App.live` sets `textContent`, so no escaping is applied or needed here.

- [ ] **Step 5: Point the desktop hero at the same helper**

In `app/desktop-vocab.js`, replace this exact line (HEAD `:321`):

```js
  function heroHtml(due) {
```

with:

```js
  function heroHtml() {
```

Then replace this exact substring (HEAD `:327`):

```js
<span data-live="vDue">' + fmtNum(due) + '</span> cards due today</div>' +
```

with:

```js
<span data-live="vDue">' + esc(App.vocab.deckLabel()) + '</span></div>' +
```

Then delete this exact line (HEAD `:341`) entirely — it becomes unused:

```js
    var due = App.vocab.dueCount ? App.vocab.dueCount() : Math.max(0, total - masteredCount);
```

Then replace this exact line (HEAD `:350`):

```js
        heroHtml(due) +
```

with:

```js
        heroHtml() +
```

`esc` and `fmtNum` are both file-local in `app/desktop-vocab.js` (`:48`, `:55`); `fmtNum` stays in use at `:348`.

- [ ] **Step 6: Take the scheduling word off the Stats card (owner decision)**

In `app/desktop-more.js`, replace this exact substring (HEAD `:705`):

```js
      w: vocW + '%', trend: due + ' due', tCol: 'var(--stone)'
```

with:

```js
      w: vocW + '%', trend: due + ' left', tCol: 'var(--stone)'
```

The `due` variable at HEAD `:700` is **not** changed: `App.vocab.dueCount()` still returns unmastered-remaining, which is the honest number for a progress card. Only the word "due", which implied a schedule, goes. The number stays a raw concatenation with no thousands separator (`1000 left`) — this file has no `fmtNum`, and its neighbouring `sub` line (`mastered + ' of ' + total + ' mastered'`) is unformatted too, so raw is the file's convention.

- [ ] **Step 7: Replace the two remaining literal 20s**

In `app/shell.js`, replace this exact substring (HEAD `:188`):

```js
sub: Math.min(dueCount, 20) + ' cards to review'
```

with:

```js
sub: Math.min(dueCount, App.DECK_SIZE) + ' cards to review'
```

In `app/desktop-shell.js`, replace this exact substring (HEAD `:441`):

```js
Math.min(h.dueCount, 20) + ' cards to begin · <span class="chinese">词汇</span>'
```

with:

```js
Math.min(h.dueCount, App.DECK_SIZE) + ' cards to begin · <span class="chinese">词汇</span>'
```

- [ ] **Step 8: Confirm no session-size literal survives in the vocabulary path**

Run:

```bash
grep -n "slice(0, 20)\|, 20)\|< 20\|20 - ids" app/*.js
```

Expected: **no output** (exit status 1). (Verified at HEAD: these patterns match exactly the six sites this package edits and nothing else in `app/`, so the widened scope also guards `study.js`/`more.js` against a stray literal.)

- [ ] **Step 9: Run the test to verify it passes**

Run: `node --test scripts/vocab-session.test.js`
Expected: `tests 9`, `pass 9`, `fail 0`.

- [ ] **Step 10: Run the whole suite for regressions**

Run: `node --test scripts/*.test.js`
Expected: `tests 115`, `pass 115`, `fail 0`.

- [ ] **Step 11: Commit**

```bash
git add app/vocab.js app/desktop-vocab.js app/desktop-more.js app/shell.js app/desktop-shell.js scripts/vocab-session.test.js
git commit -m "fix(app): every writer of the session size reads one seam (F3, part 2)

Both heroes, the vDue live channel, the desktop Stats card and the two
shells' today's-plan rows all printed their own arithmetic. The heroes
now render deckLabel() as the entire content of [data-live=\"vDue\"], so
the live update on a mastery tap can no longer overwrite the corrected
number with total-minus-mastered — the failure the naive 'hero prints
DECK_SIZE' fix leaves behind. Desktop drops 'due today', the Stats chip
drops 'due' for 'left' (that card keeps the real remaining count), and
the two shells' literal 20s become App.DECK_SIZE.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Task 5: F14 — one `weakestSection` rule, three call sites

**Files:**
- Modify: `app/exam.js` — add `weakestSection()` next to `gradeSections()` (HEAD `:1484-1492`), export it
  (HEAD `:1507`), route `resultsGoNext` (HEAD `:762-782`) and the results card (HEAD `:1160-1163`)
- Modify: `app/desktop-exam.js` — route the inline duplicate (HEAD `:582-585`)
- Test: `scripts/weakest-section.test.js` (**new**)

**Interfaces:**
- Consumes: nothing from earlier tasks.
- Produces: `App.exam.weakestSection(qs, answers)` → `{ name: string, cn: string, r: number }`.
  - `qs` is an array of normalized questions (`{section, sectionCn, selfCheck, correct, …}` — the shape
    `normalizeQ` produces at `app/exam.js:149-167`); `answers` is the `state.answers` index→choice map.
  - Questions with `selfCheck === true` are excluded. Sections are ranked by correct/total ascending, ties
    to `Writing`, iterated in first-appearance order.
  - Returns `{name: 'Writing', cn: '书写', r: 0}` when no auto-scored section exists (a Writing-only drill,
    or empty input) — preserving today's routing for that case.
  - `App.exam.gradeSections` is untouched.

**Why the helper takes raw questions rather than pre-computed tallies:** the whole defect is a missing
`selfCheck` guard. If the helper accepted tallies, each call site would still build its own guarded map and
the guard could be forgotten again — which is exactly what happened at `app/exam.js:766-772`. Taking
`(qs, answers)` puts the guard in one place. All three sites already have both variables in scope
(`app/exam.js:1086-1088`, `app/desktop-exam.js:511-513`, and `activeQuestions()`/`s.answers` in
`resultsGoNext`).

**Behaviour at the two already-correct sites is unchanged.** Site 2 built its ranking from `secList`
(insertion-ordered, guard-filtered); site 3 built it from `sections` (filtered through
`SEC_ORDER = ['Listening','Reading','Writing']`). The helper's first-appearance order matches both: every
paper in `data/test-*.json` presents Listening before Reading before Writing (verified across all 14; only
`test-07` interleaves, and it still shows Listening first).

- [ ] **Step 1: Write the failing test**

Create `scripts/weakest-section.test.js` with exactly this content:

```js
/* Package B / F14: App.exam.weakestSection is the ONE weakest-section rule,
   shared by the mobile results card, its "Focus next -> Go" route and the
   desktop results copy. Writing is self-assessed (selfCheck) and must never be
   counted: doing so scored it a permanent 0/N, made it weakest on every paper,
   and routed "Go" to Sentences. Loads the REAL app/exam.js, mirroring
   grade-sections.test.js. Run: node --test scripts/weakest-section.test.js */
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

function loadExam() {
  const App = { data: { TESTS: [{ official: false }] } };
  global.window = { App };
  global.document = { addEventListener() {} };
  const p = path.resolve(__dirname, '../app/exam.js');
  delete require.cache[require.resolve(p)];
  require(p);
  return App.exam;
}

const CN = { Listening: '听力', Reading: '阅读', Writing: '书写' };
/* Build a paper section by section, in the order every real test-*.json uses. */
function paper(spec) {
  const qs = [], answers = {};
  spec.forEach((sec) => {
    for (let k = 0; k < sec.tot; k++) {
      const i = qs.length;
      qs.push({
        section: sec.name, sectionCn: CN[sec.name],
        selfCheck: !!sec.selfCheck, correct: 1, options: sec.selfCheck ? [] : ['a', 'b'],
      });
      if (sec.selfCheck) continue;             // writing is never auto-answered
      if (k < sec.ok) answers[i] = 1;          // correct
      else if (!sec.skip) answers[i] = 0;      // answered, wrong
    }
  });
  return { qs, answers };
}

test('F14 REGRESSION: a full paper never routes to Writing just because it is self-checked', () => {
  const ex = loadExam();
  const p = paper([
    { name: 'Listening', tot: 20, ok: 18 },   // 90%
    { name: 'Reading', tot: 20, ok: 12 },     // 60%  <- genuinely weakest
    { name: 'Writing', tot: 10, selfCheck: true },
  ]);
  const weak = ex.weakestSection(p.qs, p.answers);
  assert.equal(weak.name, 'Reading', 'Reading is the weakest auto-scored section');
  assert.notEqual(weak.name, 'Writing', 'the self-checked section must not win');
  assert.equal(weak.cn, '阅读');
  assert.equal(weak.r, 0.6);
});

test('F14: Listening can be weakest too — the rule is the ratio, not the section', () => {
  const ex = loadExam();
  const p = paper([
    { name: 'Listening', tot: 20, ok: 8 },    // 40%
    { name: 'Reading', tot: 20, ok: 16 },     // 80%
    { name: 'Writing', tot: 10, selfCheck: true },
  ]);
  assert.equal(ex.weakestSection(p.qs, p.answers).name, 'Listening');
});

test('F14: unanswered questions count as wrong (the results screen already assumes it)', () => {
  const ex = loadExam();
  const p = paper([
    { name: 'Listening', tot: 20, ok: 20 },
    { name: 'Reading', tot: 20, ok: 0, skip: true },   // all left blank
    { name: 'Writing', tot: 10, selfCheck: true },
  ]);
  const weak = ex.weakestSection(p.qs, p.answers);
  assert.equal(weak.name, 'Reading');
  assert.equal(weak.r, 0);
});

test('F14: an exact Listening/Reading tie resolves deterministically (first appearance)', () => {
  const ex = loadExam();
  const p = paper([
    { name: 'Listening', tot: 20, ok: 14 },
    { name: 'Reading', tot: 20, ok: 14 },
    { name: 'Writing', tot: 10, selfCheck: true },
  ]);
  assert.equal(ex.weakestSection(p.qs, p.answers).name, 'Listening');
  assert.equal(ex.weakestSection(p.qs, p.answers).name, 'Listening', 'stable across calls');
});

test('F14: legacy MC-graded Writing (selfCheck false) IS scored and can be weakest', () => {
  const ex = loadExam();
  const p = paper([
    { name: 'Listening', tot: 20, ok: 18 },
    { name: 'Reading', tot: 20, ok: 16 },
    { name: 'Writing', tot: 10, ok: 2 },      // real section data, 20%
  ]);
  assert.equal(ex.weakestSection(p.qs, p.answers).name, 'Writing');
});

test('F14: Writing wins a genuine tie (it is the hardest to self-improve)', () => {
  const ex = loadExam();
  const p = paper([
    { name: 'Listening', tot: 20, ok: 10 },
    { name: 'Writing', tot: 20, ok: 10 },
  ]);
  assert.equal(ex.weakestSection(p.qs, p.answers).name, 'Writing');
});

test('F14: a Writing-only drill has no auto-scored section — falls back to Writing', () => {
  const ex = loadExam();
  const p = paper([{ name: 'Writing', tot: 10, selfCheck: true }]);
  const weak = ex.weakestSection(p.qs, p.answers);
  assert.equal(weak.name, 'Writing', 'so "Go" still routes to Sentences for a writing drill');
  assert.equal(weak.cn, '书写');
  assert.equal(weak.r, 0);
});

test('F14: empty / missing input never throws and never returns undefined', () => {
  const ex = loadExam();
  assert.equal(ex.weakestSection([], {}).name, 'Writing');
  assert.equal(ex.weakestSection(undefined, undefined).name, 'Writing');
  assert.equal(typeof ex.weakestSection([], {}).r, 'number');
});

test('F14: a single-section Reading drill reports Reading, not the Writing fallback', () => {
  const ex = loadExam();
  const p = paper([{ name: 'Reading', tot: 20, ok: 11 }]);
  const weak = ex.weakestSection(p.qs, p.answers);
  assert.equal(weak.name, 'Reading');
  assert.equal(weak.r, 0.55);
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `node --test scripts/weakest-section.test.js`
Expected: `tests 9`, `fail 9`, `pass 0`, every failure `TypeError: ex.weakestSection is not a function`.

- [ ] **Step 3: Write the helper**

In `app/exam.js`, replace this exact line (HEAD `:1494`):

```js
  /* public surface (CONTRACT names App.exam.audioEl) */
```

with:

```js
  /* Weakest auto-scored section — the ONE rule, shared by the mobile results
     card, its "Focus next → Go" route and the desktop results copy.
     Writing (q.selfCheck) is self-assessed and never auto-scored, so it MUST be
     excluded: counting it scored a permanent 0/N, which made it weakest on every
     paper and routed "Go" to Sentences (F14). Sections are ranked in first-
     appearance order, so ties are deterministic; Writing wins a tie only when it
     genuinely carries auto-scored questions (legacy MC-graded papers).
     Pure: takes questions + the answer map, touches no state. */
  function weakestSection(qs, answers) {
    var a = answers || {}, secMap = {}, order = [];
    (qs || []).forEach(function (q, i) {
      if (!q || q.selfCheck) return;          /* self-assessed: not auto-scored */
      var name = q.section;
      if (!secMap[name]) { secMap[name] = { name: name, cn: q.sectionCn, tot: 0, ok: 0 }; order.push(name); }
      secMap[name].tot++;
      if (a[i] != null && a[i] === q.correct) secMap[name].ok++;
    });
    var withR = order.map(function (k) {
      var x = secMap[k];
      return { name: x.name, cn: x.cn, r: x.tot ? x.ok / x.tot : 0 };
    });
    withR.sort(function (x, y) { return (x.r - y.r) || (x.name === 'Writing' ? -1 : y.name === 'Writing' ? 1 : 0); });
    return withR[0] || { name: 'Writing', cn: '书写', r: 0 };
  }

  /* public surface (CONTRACT names App.exam.audioEl) */
```

- [ ] **Step 4: Export it**

In `app/exam.js`, replace this exact line (HEAD `:1507`):

```js
  ex.gradeSections = gradeSections; /* pure; shared grader (M5) + exposed for tests */
```

with:

```js
  ex.gradeSections = gradeSections; /* pure; shared grader (M5) + exposed for tests */
  ex.weakestSection = weakestSection; /* pure; ONE weakest-section rule (F14) + exposed for tests */
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `node --test scripts/weakest-section.test.js`
Expected: `tests 9`, `pass 9`, `fail 0`.

- [ ] **Step 6: Route call site 1 — the buggy one, `resultsGoNext`**

In `app/exam.js`, replace this exact block (HEAD `:763-779`):

```js
    var s = stateOf();
    var qs = activeQuestions();
    var secMap = {};
    qs.forEach(function (q, i) {
      var a = (s.answers || {})[i];
      var ok = a != null && a === q.correct;
      secMap[q.section] = secMap[q.section] || { name: q.section, tot: 0, ok: 0 };
      secMap[q.section].tot++;
      if (ok) secMap[q.section].ok++;
    });
    var withR = Object.keys(secMap).map(function (k) {
      var x = secMap[k];
      return { name: x.name, r: x.tot ? x.ok / x.tot : 0 };
    });
    withR.sort(function (a, b) { return (a.r - b.r) || (a.name === 'Writing' ? -1 : b.name === 'Writing' ? 1 : 0); });
    var weak = withR[0] || { name: 'Writing' };
    var nextSub
```

with:

```js
    var s = stateOf();
    var weak = weakestSection(activeQuestions(), s.answers);
    var nextSub
```

`weakestSection` is a hoisted function declaration inside the same IIFE, so calling it from a function body assigned earlier in the file is safe.

- [ ] **Step 7: Route call site 2 — the mobile results card**

In `app/exam.js`, replace this exact block (HEAD `:1160-1163`):

```js
    var withR = secList.map(function (x) { return { name: x.name, cn: x.cn, r: x.tot ? x.ok / x.tot : 0 }; });
    withR.sort(function (a, b) { return (a.r - b.r) || (a.name === 'Writing' ? -1 : b.name === 'Writing' ? 1 : 0); });
    var weak = withR[0] || { name: 'Writing', cn: '书写', r: 0 };
    var weakR = weak.r != null ? weak.r : 0;
```

with:

```js
    var weak = weakestSection(qs, answers);
    var weakR = weak.r;
```

`weak.r` is always a number (the fallback carries `r: 0`), so the `!= null` guard is no longer needed. `secList` stays in use at HEAD `:1116` for `gradeSections`.

- [ ] **Step 8: Route call site 3 — the desktop duplicate**

In `app/desktop-exam.js`, replace this exact block (HEAD `:582-585`):

```js
    /* weakest section: lowest ratio, Writing wins ties (mobile resultsGoNext canon) */
    var withR = sections.map(function (x) { return { name: x.name, r: x.tot ? x.ok / x.tot : 0 }; });
    withR.sort(function (a, b) { return (a.r - b.r) || (a.name === 'Writing' ? -1 : b.name === 'Writing' ? 1 : 0); });
    var wName = (withR[0] || { name: 'Writing' }).name;
```

with:

```js
    /* weakest section: ONE rule, App.exam.weakestSection (F14). Writing is
       self-assessed and excluded there, so it can never win by scoring 0. */
    var wName = App.exam.weakestSection(qs, answers).name;
```

`app/index.html:69` loads `exam.js` before `app/index.html:73` loads `desktop-exam.js`, so `App.exam.weakestSection` exists by the time this renders.

- [ ] **Step 9: Confirm the rule has exactly one implementation**

Run:

```bash
grep -rn "=== 'Writing' ? -1" app/
```

Expected: exactly **one** hit — the sort comparator inside `weakestSection` in `app/exam.js`.

- [ ] **Step 10: Run the whole suite for regressions**

Run: `node --test scripts/*.test.js`
Expected: `tests 124`, `pass 124`, `fail 0`.

- [ ] **Step 11: Commit**

```bash
git add app/exam.js app/desktop-exam.js scripts/weakest-section.test.js
git commit -m "fix(app): 'Focus next -> Go' stops always opening Sentences (F14)

resultsGoNext built its section map without the selfCheck guard the other
three sites use, so Writing scored a permanent 0/N, was weakest on every
full paper, and the button routed to Sentences 100% of the time whenever
the weaker of Listening/Reading was below 80%.

Fixed by extracting the rule rather than patching the guard: one pure
App.exam.weakestSection(qs, answers) that owns the exclusion, with all
three live call sites routed through it — including the desktop inline
copy whose own comment already admitted it duplicated the mobile canon.
The two already-correct sites are behaviourally unchanged: the helper
ranks in first-appearance order, which matches SEC_ORDER for all 14
papers.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Task 6: Verification on both clients

**Files:** none modified. This task produces evidence, not code.

**Interfaces:**
- Consumes: everything from Tasks 1–5.
- Produces: the pass/fail record for the package.

**Why a separate task:** four of the six changes (both Notifications labels, both eyebrows, the desktop
headline, the Stats chip) have no unit test by design — the spec's test plan says so explicitly. The browser
pass is their only verification, and it is the gate for the package.

- [ ] **Step 1: Run the full suite one final time**

Run: `node --test scripts/*.test.js`
Expected: `tests 124`, `pass 124`, `fail 0`.

- [ ] **Step 2: Confirm nothing needs a rebuild**

Run:

```bash
git status --porcelain
```

Expected: only `app/*.js` and `scripts/*.test.js` paths appear (and nothing at all if Tasks 1–5 each committed). No `data/*.json`, no `build.js`, no generated `index.html`, no `app/index.html` — so neither `node build.js` nor `node scripts/inject-auth.js` is required.

- [ ] **Step 3: Serve the site and swap in the placeholder auth config**

The gated `/app/` page needs auth to be *unconfigured* so `isConfigured()` short-circuits the guard for local preview. `config/auth.js` is a **tracked** file, so `git` is the backup — no copy aside is needed.

```bash
cp config/auth.example.js config/auth.js && python3 -m http.server 8080
```

- [ ] **Step 4: Verify the DESKTOP client**

Open `http://localhost:8080/app/`. The preview browser is `pointer:fine`, so it picks the desktop client automatically.

If this browser profile has ever loaded `/app/` before, bust the module cache **first** — stale `app/*.js` files have burned prior verification passes in this project. In the console, then reload:

```js
['core','data','shell','exam','vocab','more','study','desktop-config','desktop-shell','desktop-exam','desktop-vocab','desktop-more','desktop-study'].forEach(function(m){fetch('/app/'+m+'.js',{cache:'reload'});});
```

Check, in order:
1. **Words tab** — the hero eyebrow reads `Flashcard review · 复习` (not `Daily review · 每日复习`); the headline reads `20 cards to review` (not `1,000 cards due today`); the sub-line reads `Mark what you know — mastered words leave the deck` (not the spaced-repetition claim).
2. **Master one word** from the list, then look at the hero again without reloading — it must still read `20 cards to review`, not `999`. (This is the live-channel path from Task 4.)
3. **Start review →** — count the cards in the session; the counter must show `1 / 20`, matching the hero.
4. **More → Profile** — the preferences row heading reads `Notifications 提醒` (not `Daily reminder 提醒`); the toggle is **OFF** with the label `Off` on a browser profile that has never toggled it (clear `hsk4-notif` from localStorage first if unsure). Turn it ON: the label reads `On · reminders coming soon`.
5. **More → Stats** — the Vocabulary skill card's chip ends in `left`, not `due` (e.g. `999 left` after the word mastered in check 2 — raw number, no thousands separator; this file renders counts unformatted).
6. **Sit a full paper**, deliberately **failing it overall** with Reading weaker than Listening: keep the mean auto-scored section below 60% (e.g. Listening ≈55%, Reading ≈40% — band `< 180`), and leave Writing blank. On the results screen the "Next:" line must name **Reading**, not Writing. The failing score is load-bearing: on a *passed* paper the desktop tier copy reads `Lock it in — sit the next paper to confirm` and names no section at all (`desktop-exam.js:587`), so a passing run makes this check vacuous — e.g. Listening 90% / Reading 60% gives band 225 and shows no section name.

- [ ] **Step 5: Verify the MOBILE client**

In the browser console:

```js
localStorage.setItem('hsk4-client', 'mobile'); location.reload();
```

Then bust the module cache before trusting any live global:

```js
['core','data','shell','exam','vocab','more','study'].forEach(function(m){fetch('/app/'+m+'.js',{cache:'reload'});});
```

Reload once more, then check:
1. **Words tab** — eyebrow `Flashcard review · 复习`; headline `20 cards to review`; sub-line still `Swipe through · mark what you know` (deliberately unchanged).
2. **Master one word**, confirm the hero stays at `20 cards to review`.
3. **Home tab** — the "Vocabulary review" task row reads `20 cards to review`.
4. **More → Profile** — row heading `Notifications`, toggle OFF, label `Off`; toggling ON gives `On · reminders coming soon`.
5. **Sit a full paper** with Reading weakest and Writing blank. The "Focus next" card must read **`Start with Reading basics`**, and tapping **Go** must open **Strategies**, not Sentences (造句). This is the F14 regression — check it deliberately.

- [ ] **Step 6: Restore the real auth config and confirm it is clean**

Stop the server, then:

```bash
git checkout -- config/auth.js && git status --porcelain config/auth.js
```

Expected: **no output** — the real credentials are back and the file is byte-identical to what was committed. Do not skip this: leaving the placeholder in place ships an unconfigured, ungated site.

- [ ] **Step 7: Update CLAUDE.md's test count**

`CLAUDE.md:27` still says "13 files, 103 tests" — stale since Package A (106) and now off by 21. In `CLAUDE.md`, replace this exact substring:

```
band-score/grade-sections/skills/plan-charge/writing-models — 13 files, 103 tests)
```

with:

```
band-score/grade-sections/skills/plan-charge/writing-models/vocab-session/weakest-section — 15 files, 124 tests)
```

Then commit:

```bash
git add CLAUDE.md
git commit -m "docs: CLAUDE.md test count 103 -> 124 (Package A + B suites)

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

- [ ] **Step 8: Record the result**

If every check in Steps 4–5 passed, Package B is complete. If any failed, fix it in the task that owns it and re-run this task from Step 1 — do not report the package complete on a partial pass.

---

## What this package deliberately leaves for later

- **`app/shell.js:146` counts mastery as `(s.vMastered||[]).length`** (raw stored ids) while `app/vocab.js`
  uses `countMastered` (catalog-filtered). They disagree if a stale id is stored. Pre-existing, unrelated to
  F3's session-size defect; deserves its own task.
- **`App.vocab.dueCount()` is still named "due"** even though nothing schedules anything. Renaming it touches
  three consumers for no user-visible gain; the user-facing word "due" is gone after this package, which was
  the honesty problem.
- **Package C (F1 → F8, F9)** is the next package in the spec's execution order (`A → B + E → C → D → F`),
  and F1 ships first within it.
