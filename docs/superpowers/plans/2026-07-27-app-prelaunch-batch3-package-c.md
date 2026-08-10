# Package C — focus & accessibility (F1, F8, F9) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the `/app/` client usable without a mouse and without colour vision — keyboard focus survives a re-render, stateful toggles announce their state, and quick-check verdicts are readable when colour is not.

**Architecture:** Three independent a11y fixes on the existing two-client structure. F1 adds ~55 lines of new focus machinery to `app/core.js` that **reuses three existing helpers** (`_restorable`, `_selectorFor`, `_resolveReturn`) and hooks exactly two call sites (`render`, `update`); it is deliberately scoped to `data-a` controls, leaving text inputs to the existing `_focus` id convention and dialogs to `_syncModalFocus`. F8 and F9 are attribute/markup edits across seven and four render sites respectively, each asserted on the real rendered markup.

**Tech Stack:** Plain ES5 IIFE modules, no bundler, no npm, no framework. Tests are Node's built-in `node:test` with zero dependencies, loading the real modules under a mocked `window`/`document`.

**Spec:** `docs/superpowers/specs/2026-07-26-app-prelaunch-batch3-design.md` § "Package C — focus & accessibility".

---

## Ground truth — verified against HEAD `e5b3a105`, not the spec

**Package B (HEAD `d890c458`→`e5b3a105`) moved most of the spec's line numbers.** Every number below was re-read at the current HEAD. As in the Package B plan, **every edit is anchored on a verbatim string, not a line number**; numbers are for orientation only.

### Confirmed as the spec describes

| Item | Site at HEAD | Verified |
|---|---|---|
| F1 | `app/core.js:520` `_restorable`, `:538` `_selectorFor`, `:550` `_resolveReturn` | all three reusable as-is (spec said `:514/:532/:544` — **+6**, my `App.DECK_SIZE` insert) |
| F1 | `app/core.js:526-532` `_focusInto` | dialog-specific container pin, as spec says (spec said `:520-526`) |
| F1 | `app/core.js:362` `render`, `:409` its `restoreFocus(sel)` | the two hook points; `update` at `:414`, its `restoreFocus` at `:429` |
| F1 | `app/exam.js:1420-1426` `App.screens.results.deps` | **includes `s.reviewOpen`** — so opening one review row replaces all of `r-results`. The spec's worst case, confirmed |
| F1 | `app/exam.js:1226`, `app/desktop-exam.js:640` | the accordion rows are `<button data-a="toggleReview" data-argn="i">` |
| F1 | `app/shell.js:639-645` `SHELL_SKIP`, `app/desktop-shell.js:286-292` `D_SKIP` | already spare `elapsed/curQ/answers/flags/gQuery/vMastered` |
| F8 | `app/exam.js:1022` | already `role="radio"` + `aria-checked` in a radiogroup — correctly **dropped** from scope (spec said `:1030`) |
| F9 | `app/study.js:356-361`, `:483`; `app/desktop-study.js:262-268` | note text is **byte-identical** whether right or wrong; only signal is `optColors`' background |
| F9 | `app/study.js:565-567`, `:635`; `app/desktop-study.js:391`, `:462` | the in-file `'✓ Correct' / '✗ Not quite'` pattern to reuse — exists exactly as spec says |
| — | `aria-pressed` | appears **zero** times in `app/` today |

### Corrections that change the work

1. **Every F8 line number has moved.** `vocab.js:454`→**`:480`**, `vocab.js:709`→**`:733`**, `exam.js:1072`→**`:1058`** (my F14 edit removed 14 lines above it), `desktop-more.js:929`→**`:930`**. `more.js:683` is unchanged. The spec anticipated this ("The implementation plan re-stamps every F8 line number against HEAD").
2. **The spec's F9 reuse citation is wrong.** It says "The verdict pattern actually lives at `exam.js:1205`". At HEAD `app/exam.js` contains **no** `✓ Correct`/`✗ Not quite` anywhere; `:1189` is a bare glyph (`ok ? '✓' : (has ? '✗' : '–')`) on a review row, not a labelled verdict. The genuinely reusable in-file pattern is `study.js:565-567` — which the spec also names, and which this plan uses.
3. **There is a FOURTH quick-check the spec never lists.** `app/desktop-study.js:554` (communicative tasks, desktop). Unlike the other three it is **not** colour-only — it already prints "You scored 0 / 1" at `:555`. The spec's prose says "all four quick-check surfaces", so it is in scope; owner confirmed (below).
4. **`_selectorFor` alone restores the WRONG control.** A bare `data-a` is not unique: the mobile Vocabulary screen renders `data-a="goCards"` **twice** — the hero button (`vocab.js:685`) and the "Cards" segment (`:695`, built by `segBtn`, so a source grep for the literal misses it). A selector-only restore moves focus to the hero when the user was on the tab. F1 therefore records the **index among same-selector matches**, and prefers `id` when present. This is covered by a test.
5. **F8's naming instruction contradicts W3C.** See the owner decision below.

### Owner decisions taken for this plan (2026-07-27)

- **F8 naming.** The spec says "Where the accessible name is a static `aria-label`, the name becomes state-bearing too, reusing wording the desktop client already ships". Desktop ships `'Mastered — click to unmark' : 'Mark as mastered'` (`desktop-vocab.js:125`). W3C ARIA APG's Button pattern says the opposite for toggles: **the accessible name must not change with state** — `aria-pressed` carries it, or a screen reader announces the state twice ("Mastered — click to unmark, toggle button, pressed"). The desktop wording also says "click", which is wrong on the touch client it would be copied to.
  **Owner chose: stable name + `aria-pressed` (follow W3C APG)**, and normalise desktop's existing state-bearing label so the two clients agree.
- **F9 fourth surface.** **Owner chose: include `desktop-study.js:554`** for consistency, so all four quick-checks read identically — noting it is a consistency fix there, not an a11y one.

### What is unit-tested and what is not — stated, not implied

The two exam **Flag** buttons (`exam.js:1058`, `desktop-exam.js:478`) are the only F8 targets with **no unit test**: they live inside `playerTpl`, which needs a paper loaded into `QCACHE` via a network fetch, and this suite is deliberately offline. They are covered by the browser pass in Task 4 Step 4 check 4, which checks them explicitly. Every other F8 and F9 site — including the desktop vocabulary row, reachable through `App.screens['d-vocab-list'].html()` — is asserted on real rendered markup.

F1 is covered at **two** levels, deliberately: `focus-restore.test.js` drives the helpers directly (9 cases), and `focus-hooks.test.js` drives the real `App.render()` / `App.update()` through a real `innerHTML` swap (3 cases). The second file exists because the first would still pass if a **hook were dropped** — mutation-verified: removing either hook in either function fails the suite.

*(Corrected after the implementation review: an earlier draft also claimed these tests pin the `restoreFocus`-then-`restoreSwapFocus` line ordering. They do not, and that ordering is behaviourally inert — see Task 1 Step 6.)*

### Prototype validation

Every edit and both new test files below were applied to an isolated copy of `app/` in a scratch directory and run before this plan was written:

- `focus-restore.test.js` — **9 fail** against unpatched HEAD (`TypeError: App._captureSwapFocus is not a function`), **9 pass** after F1.
- `focus-hooks.test.js` — **2 of 3 fail** against unpatched HEAD, **3 pass** after F1. (The third, the search-caret guard, passes either way: without F1 nothing steals the caret because nothing restores anything. A regression guard, not a RED test.)
- `toggle-a11y.test.js` — **8 of 9 fail** against unpatched HEAD, **9 pass** after F8+F9. (The 9th, "an UNANSWERED quick-check shows no verdict", passes either way by design — a guard against the fix leaking a verdict into the un-answered state.)
- Full suite with all of Package C applied: **145 tests, 145 pass, 0 fail** (124 existing + 21 new), and `node --check` clean on all nine edited files.

All 18 replace-anchors matched **exactly once** at HEAD, and applying them **in plan order** never broke a later anchor. The working tree was never modified.

---

## Global Constraints

- **ES5 only** in `app/*.js`: `var`, `function` declarations, no arrow functions, no `let`/`const`, no template literals. Test files are Node-only and follow each file's own idiom.
- **No npm, no bundler, no linter.** Tests use `node:test` + `node:assert/strict` + `node:path` only.
- **No `node build.js` and no `node scripts/inject-auth.js`** — this package touches only `app/*.js` and `scripts/*.test.js`.
- **Read `App.*` at call time**, never cache at module load.
- **F1 ships FIRST** (spec): F8's `aria-pressed` and F9's verdict text are only reachable for a keyboard user once focus survives the re-render that follows activating a control.
- New F1 helpers must be **`function` declarations**, so hoisting lets `App.render` (defined earlier in the file) call them.
- Every `focus()` call uses `focus({ preventScroll: true })` with the file's existing try/fallback shape (`core.js:333`, `:530`, `:575`).
- Test command: `node --test scripts/*.test.js` from the repo root. Baseline at HEAD: **124 pass**.
- Commit messages end with: `Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>`

---

## File Structure

| File | Change | Task |
|---|---|---|
| `app/core.js` | F1: new focus-survival helpers + 4 one-line hooks in `render`/`update` | 1 |
| `scripts/focus-restore.test.js` | **new** — 9 F1 helper tests | 1 |
| `scripts/focus-hooks.test.js` | **new** — 3 F1 hook-wiring tests (real `render`/`update`) | 1 |
| `app/vocab.js` | F8: row toggle + word-sheet toggle | 2 |
| `app/desktop-vocab.js` | F8: normalise the state-bearing label, add `aria-pressed` | 2 |
| `app/exam.js` | F8: mobile Flag | 2 |
| `app/desktop-exam.js` | F8: desktop Flag | 2 |
| `app/more.js` | F8: Study Guide rows | 2 |
| `app/desktop-more.js` | F8: Study Guide rows (desktop mirror) | 2 |
| `scripts/toggle-a11y.test.js` | **new** — 5 F8 tests (Task 2), 4 F9 tests appended (Task 3) | 2, 3 |
| `app/study.js` | F9: grammar + task quick-checks | 3 |
| `app/desktop-study.js` | F9: grammar + task quick-checks | 3 |

**Task order:** F1 first (spec requirement). F8 and F9 are independent of each other; F8 second because it shares the test file it creates.

### Deliberately NOT changed

- **`app/access-decision.js`, `auth-guard.js`** — untouched; nothing in Package C is auth-related.
- **`_focusInto` / `_syncModalFocus`** — the dialog path is already correct and was verified twice in earlier cycles. F1 runs *before* `_syncModalFocus` in both `setState` and `update`, and no-ops whenever focus is already somewhere real, so it cannot fight the modal machinery.
- **The `_focus` id convention** (`state._focus`, `restoreFocus`) — owns text inputs, including caret position. F1 explicitly skips the element named by `App.state._focus`.
- **`app/exam.js:1022`** — already `role="radio"` + `aria-checked`; adding `aria-pressed` there would be wrong (a radio is not a toggle).

---

## Task 1: F1 — keyboard focus survives a region re-render

**Files:**
- Modify: `app/core.js` — new helpers before `var _modalWasOpen …` (HEAD `:555`); two hooks in `App.render` (HEAD `:362`, `:409`); two in `App.update` (HEAD `:421`, `:429`)
- Test: `scripts/focus-restore.test.js` (**new**), `scripts/focus-hooks.test.js` (**new**)

**Interfaces:**
- Consumes: the existing `_restorable(el)` → boolean, `_selectorFor(el)` → string|null, both already in `app/core.js`.
- Produces, for the test only:
  - `App._captureSwapFocus()` → `undefined`. Records the focused control as a re-resolvable descriptor. Skips: a non-`_restorable` element, the element named by `App.state._focus`, and anything with neither an `id` nor a `data-a`.
  - `App._restoreSwapFocus()` → `undefined`. **One-shot** — consumes the descriptor whether or not it restores. No-ops unless `document.activeElement` is null/`<body>`/`<html>`.

- [ ] **Step 1: Write the failing test**

Create `scripts/focus-restore.test.js` with exactly this content:

```js
/* Package C / F1: keyboard focus must survive a region innerHTML swap.
   Loads the REAL app/core.js and drives App._captureSwapFocus /
   App._restoreSwapFocus against a minimal DOM that implements exactly the five
   APIs the code touches (activeElement, getElementById, querySelectorAll,
   contains, getClientRects) — the decisions under test are the real ones.
   Run: node --test scripts/focus-restore.test.js */
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

/* ---- minimal DOM ---- */
function el(attrs) {
  const e = {
    id: attrs.id || '',
    _attrs: attrs, _attached: true, _focused: 0,
    nodeType: 1,
    getAttribute(n) { return Object.prototype.hasOwnProperty.call(attrs, n) ? String(attrs[n]) : null; },
    getClientRects() { return e._attached ? [{}] : []; },     // detached == not rendered
    focus(opts) { e._focused++; e._focusOpts = opts; DOC.activeElement = e; },
  };
  return e;
}
const BODY = el({}); const HTML = el({});
let DOC = null;
function makeDoc(nodes) {
  DOC = {
    body: BODY, documentElement: HTML, activeElement: BODY,
    _nodes: nodes,
    addEventListener() {},
    contains(n) { return !!(n && n._attached); },
    getElementById(id) { return DOC._nodes.find((n) => n._attached && n.id === id) || null; },
    querySelectorAll(sel) {
      /* supports [data-a="x"], plus [data-arg="y"] / [data-argn="z"] */
      const want = {};
      sel.replace(/\[([a-z-]+)="([^"]*)"\]/g, (_, k, v) => { want[k] = v; return ''; });
      return DOC._nodes.filter((n) => n._attached && Object.keys(want).every((k) => n.getAttribute(k) === want[k]));
    },
    querySelector(sel) { return DOC.querySelectorAll(sel)[0] || null; },
    createElement() { return el({}); },
  };
  global.document = DOC;
  return DOC;
}
function loadCore() {
  global.localStorage = { getItem() { return null; }, setItem() {}, removeItem() {} };
  global.window = { addEventListener() {}, matchMedia() { return { matches: false, addEventListener() {} }; }, localStorage: global.localStorage };
  const p = path.resolve(__dirname, '../app/core.js');
  delete require.cache[require.resolve(p)];
  require(p);
  return global.window.App;
}
/* a region swap: old nodes detach, fresh equivalents take their place */
function swap(doc, out, fresh) {
  out.forEach((n) => { n._attached = false; });
  doc._nodes = doc._nodes.filter((n) => out.indexOf(n) === -1).concat(fresh);
  doc.activeElement = BODY;                       // what innerHTML= actually does
}

function setup(nodes) { makeDoc(nodes); const App = loadCore(); App.state._focus = null; return App; }

test('F1: a focused data-a control is restored to its recreated twin after a swap', () => {
  const row3 = el({ 'data-a': 'toggleReview', 'data-argn': '3' });
  const App = setup([el({ 'data-a': 'toggleReview', 'data-argn': '2' }), row3]);
  DOC.activeElement = row3;

  App._captureSwapFocus();
  const fresh3 = el({ 'data-a': 'toggleReview', 'data-argn': '3' });
  swap(DOC, [row3], [el({ 'data-a': 'toggleReview', 'data-argn': '2' }), fresh3]);
  assert.equal(DOC.activeElement, BODY, 'precondition: the swap dropped focus');

  App._restoreSwapFocus();
  assert.equal(DOC.activeElement, fresh3, 'focus landed on the RECREATED row 3');
  assert.deepEqual(fresh3._focusOpts, { preventScroll: true }, 'restored without jump-scrolling');
});

test('F1: a duplicated bare data-a restores the right one by index, not the first match', () => {
  /* the mobile Vocabulary screen renders data-a="goCards" twice: the hero
     button and the "Cards" segment. A selector-only restore would jump to the hero. */
  const hero = el({ 'data-a': 'goCards' });
  const tab = el({ 'data-a': 'goCards' });
  const App = setup([hero, tab]);
  DOC.activeElement = tab;                        // user was on the TAB

  App._captureSwapFocus();
  const freshHero = el({ 'data-a': 'goCards' });
  const freshTab = el({ 'data-a': 'goCards' });
  swap(DOC, [hero, tab], [freshHero, freshTab]);

  App._restoreSwapFocus();
  assert.equal(DOC.activeElement, freshTab, 'the Cards tab, not the hero');
  assert.notEqual(DOC.activeElement, freshHero);
});

test('F1: an id wins over the selector (stable across reordering)', () => {
  const b = el({ id: 'g-more', 'data-a': 'loadMore' });
  const App = setup([b]);
  DOC.activeElement = b;
  App._captureSwapFocus();
  const fresh = el({ id: 'g-more', 'data-a': 'loadMore' });
  swap(DOC, [b], [el({ 'data-a': 'loadMore' }), fresh]);   // fresh is now index 1
  App._restoreSwapFocus();
  assert.equal(DOC.activeElement, fresh, 'resolved by id, not by index 0');
});

test('F1: no-op when the swap did NOT drop focus (never fights restoreFocus)', () => {
  const b = el({ 'data-a': 'toggleReview', 'data-argn': '1' });
  const other = el({ id: 'vocab-search' });
  const App = setup([b, other]);
  DOC.activeElement = b;
  App._captureSwapFocus();
  swap(DOC, [b], [el({ 'data-a': 'toggleReview', 'data-argn': '1' })]);
  DOC.activeElement = other;                      // restoreFocus already placed focus
  const before = other._focused;
  App._restoreSwapFocus();
  assert.equal(DOC.activeElement, other, 'left exactly where restoreFocus put it');
  assert.equal(other._focused, before, 'and not re-focused');
});

test('F1: the _focus text-input convention is never hijacked', () => {
  const input = el({ id: 'vocab-search', 'data-a': 'noop' });
  const App = setup([input]);
  App.state._focus = 'vocab-search';
  DOC.activeElement = input;
  App._captureSwapFocus();
  const fresh = el({ id: 'vocab-search', 'data-a': 'noop' });
  swap(DOC, [input], [fresh]);
  App._restoreSwapFocus();
  assert.equal(DOC.activeElement, BODY, 'restoreFocus owns this one — we captured nothing');
  assert.equal(fresh._focused, 0);
});

test('F1: nothing is captured for an element with no data-a and no id', () => {
  const plain = el({});
  const App = setup([plain]);
  DOC.activeElement = plain;
  App._captureSwapFocus();
  swap(DOC, [plain], [el({})]);
  App._restoreSwapFocus();
  assert.equal(DOC.activeElement, BODY, 'no descriptor -> no restore');
});

test('F1: focus on <body> before a swap captures nothing', () => {
  const b = el({ 'data-a': 'x' });
  const App = setup([b]);
  DOC.activeElement = BODY;
  App._captureSwapFocus();
  swap(DOC, [b], [el({ 'data-a': 'x' })]);
  App._restoreSwapFocus();
  assert.equal(DOC.activeElement, BODY);
});

test('F1: a control that no longer exists after the swap is not forced back', () => {
  const b = el({ 'data-a': 'toggleReview', 'data-argn': '9' });
  const App = setup([b]);
  DOC.activeElement = b;
  App._captureSwapFocus();
  swap(DOC, [b], []);                              // the row is gone (filter changed)
  App._restoreSwapFocus();
  assert.equal(DOC.activeElement, BODY, 'no crash, no wrong target');
});

test('F1: the descriptor is one-shot — a second restore does nothing', () => {
  const b = el({ 'data-a': 'toggleReview', 'data-argn': '1' });
  const App = setup([b]);
  DOC.activeElement = b;
  App._captureSwapFocus();
  const fresh = el({ 'data-a': 'toggleReview', 'data-argn': '1' });
  swap(DOC, [b], [fresh]);
  App._restoreSwapFocus();
  assert.equal(fresh._focused, 1);
  DOC.activeElement = BODY;                        // a later unrelated swap
  App._restoreSwapFocus();
  assert.equal(fresh._focused, 1, 'stale descriptor was consumed, not replayed');
});
```

- [ ] **Step 2: Write the hook-wiring test**

`focus-restore.test.js` drives the helpers directly, so it would still pass if a hook were dropped or Step 6's two restore lines were swapped — and that ordering is the claim F1 rests on. This second file drives the real `App.render()`/`App.update()` through a real `innerHTML` swap. It needs regions and a working `innerHTML` setter, hence its own DOM harness.

Create `scripts/focus-hooks.test.js` with exactly this content:

```js
/* Package C / F1 — HOOK WIRING. focus-restore.test.js drives the helpers
   directly, so it would still pass if a hook were dropped or the two restore
   lines were swapped. These three drive the REAL App.render() / App.update()
   through a REAL innerHTML swap, which is the only thing that pins F1's
   load-bearing ordering claim: restoreSwapFocus runs AFTER restoreFocus, so the
   _focus search caret is never stolen.
   Needs regions + innerHTML, hence a second DOM harness.
   Run: node --test scripts/focus-hooks.test.js */
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

let DOC = null;
const ALL = [];

function el(attrs, id) {
  const e = {
    id: id || attrs.id || '',
    _attrs: attrs, _attached: true, _focused: 0, _children: [], nodeType: 1,
    getAttribute(n) { return Object.prototype.hasOwnProperty.call(attrs, n) ? String(attrs[n]) : null; },
    hasAttribute(n) { return Object.prototype.hasOwnProperty.call(attrs, n); },
    getClientRects() { return e._attached ? [{}] : []; },
    focus(opts) { e._focused++; e._focusOpts = opts; DOC.activeElement = e; },
    querySelectorAll() { return []; },        // no gestures, no .hsk-scroll
    contains(n) { return e._children.indexOf(n) >= 0 || n === e; },
  };
  Object.defineProperty(e, 'innerHTML', {
    get() { return e._html || ''; },
    set(v) {
      e._html = v;
      e._children.forEach((c) => { c._attached = false; });
      e._children = [];
      (JSON.parse(v || '[]')).forEach((a) => { const c = el(a); e._children.push(c); ALL.push(c); });
      DOC.activeElement = DOC.body;           // what innerHTML= does to focus
    },
  });
  ALL.push(e);
  return e;
}

const BODY = el({}); const HTML = el({});
function makeDoc(regionIds) {
  const regions = {};
  regionIds.forEach((id) => { regions[id] = el({}, id); });
  DOC = {
    body: BODY, documentElement: HTML, activeElement: BODY,
    addEventListener() {},
    contains(n) { return !!(n && n._attached); },
    getElementById(id) { return regions[id] || ALL.find((n) => n._attached && n.id === id) || null; },
    querySelectorAll(sel) {
      const want = {};
      sel.replace(/\[([a-z-]+)="([^"]*)"\]/g, (_, k, v) => { want[k] = v; return ''; });
      return ALL.filter((n) => n._attached && Object.keys(want).every((k) => n.getAttribute(k) === want[k]));
    },
    querySelector(sel) { return DOC.querySelectorAll(sel)[0] || null; },
    createElement() { return el({}); },
  };
  global.document = DOC;
  return regions;
}
function loadCore() {
  global.localStorage = { getItem() { return null; }, setItem() {}, removeItem() {} };
  global.window = { addEventListener() {}, matchMedia() { return { matches: false, addEventListener() {} }; }, localStorage: global.localStorage };
  const p = path.resolve(__dirname, '../app/core.js');
  delete require.cache[require.resolve(p)];
  require(p);
  return global.window.App;
}

test('HOOK: App.render() restores focus after a real region innerHTML swap', () => {
  ALL.length = 0;
  const regions = makeDoc(['r-shell', 'r-player', 'r-results', 'r-sheet', 'r-overlay']);
  const App = loadCore();
  App.state._focus = null;
  App.state.n = 0;
  App.screens.results = {
    deps: (s) => [s.n],
    html: (s) => JSON.stringify([
      { 'data-a': 'toggleReview', 'data-argn': '0' },
      { 'data-a': 'toggleReview', 'data-argn': '1' },
    ]),
  };
  App.render();                                        // initial paint
  const rows = regions['r-results']._children;
  assert.equal(rows.length, 2);
  DOC.activeElement = rows[1];                         // user tabbed to row 1

  App.state.n = 1;                                     // force a re-render
  App.render();

  const fresh = regions['r-results']._children;
  assert.notEqual(fresh[1], rows[1], 'precondition: the swap really recreated the row');
  assert.equal(DOC.activeElement, fresh[1], 'render() put focus back on the recreated row 1');
  assert.deepEqual(fresh[1]._focusOpts, { preventScroll: true });
});

test('HOOK: App.update() restores focus after a real region innerHTML swap', () => {
  ALL.length = 0;
  const regions = makeDoc(['r-shell', 'r-player', 'r-results', 'r-sheet', 'r-overlay']);
  const App = loadCore();
  App.state._focus = null;
  App.state.n = 0;
  App.screens.player = {
    deps: (s) => [s.n],
    html: () => JSON.stringify([{ 'data-a': 'toggleFlagCur' }, { 'data-a': 'nextQ' }]),
  };
  App.render();
  const kids = regions['r-player']._children;
  DOC.activeElement = kids[0];

  App.state.n = 1;
  App.update('r-player');

  const fresh = regions['r-player']._children;
  assert.notEqual(fresh[0], kids[0], 'precondition: recreated');
  assert.equal(DOC.activeElement, fresh[0], 'update() put focus back on the Flag button');
});

test('HOOK: render() does NOT steal the _focus search caret', () => {
  ALL.length = 0;
  const regions = makeDoc(['r-shell', 'r-player', 'r-results', 'r-sheet', 'r-overlay']);
  const App = loadCore();
  App.state.n = 0;
  App.screens.results = {
    deps: (s) => [s.n],
    html: () => JSON.stringify([{ 'data-a': 'toggleReview', 'data-argn': '0', id: 'vocab-search' }]),
  };
  App.render();
  const input = regions['r-results']._children[0];
  input.value = 'ab'; input.selectionStart = 2; input.selectionEnd = 2;
  input.setSelectionRange = function (a, b) { input._range = [a, b]; };
  App.state._focus = 'vocab-search';
  DOC.activeElement = input;

  App.state.n = 1;
  App.render();
  const fresh = regions['r-results']._children[0];
  assert.equal(DOC.activeElement, fresh, 'restoreFocus (the _focus convention) owns it');
  assert.equal(fresh._focused, 1, 'focused exactly once — not double-focused by the swap restore');
});
```

- [ ] **Step 3: Run both tests to verify they fail**

Run: `node --test scripts/focus-restore.test.js scripts/focus-hooks.test.js`
Expected: `tests 12`, `pass 1`, `fail 11`.
- All 9 in `focus-restore.test.js` fail with `TypeError: App._captureSwapFocus is not a function`.
- 2 of 3 in `focus-hooks.test.js` fail on `assert.equal(DOC.activeElement, fresh[…])` — focus is still `<body>` after the swap.
- The 3rd, "does NOT steal the _focus search caret", **passes already**: with no F1 there is nothing to steal it. A regression guard, not a RED test — and see the correction in Step 6: it does not pin the line ordering.

- [ ] **Step 4: Add the focus-survival helpers**

In `app/core.js`, replace this exact line (HEAD `:555`):

```js
  var _modalWasOpen = false, _modalReturnEl = null, _modalReturnSel = null, _modalCurDlg = null;
```

with:

```js
  /* ---------- F1: keyboard focus survives a region re-render ----------
     render()/update() replace whole regions via innerHTML; a focused control
     inside one is detached and focus silently falls to <body>. A keyboard or
     screen-reader user is then thrown back to the top of the document after
     every activation — worst case the exam results review accordion
     (App.screens.results deps include reviewOpen), one drop per row opened.

     Three cases, three owners, deliberately kept apart:
       text inputs     -> state._focus + restoreFocus (which also keeps the caret)
       dialogs         -> _syncModalFocus / _focusInto (pins focus in the modal)
       data-a controls -> here.
     Reuses _restorable / _selectorFor / _resolveReturn; declared as function
     statements so render() can call them from above. */
  var _swapDesc = null, _swapEl = null;

  /* A bare data-a is NOT unique: the mobile Vocabulary screen renders
     data-a="goCards" twice (the hero button and the "Cards" segment), so a
     selector-only restore would jump focus to the hero when the user was on
     the tab. Record the index among same-selector matches. */
  function _describeSwapFocus(el) {
    try {
      if (el.id) return { id: el.id };
      var sel = _selectorFor(el);
      if (!sel) return null;
      var all = document.querySelectorAll(sel);
      for (var i = 0; i < all.length; i++) { if (all[i] === el) return { sel: sel, idx: i }; }
      return { sel: sel, idx: 0 };
    } catch (e) { return null; }
  }

  function captureSwapFocus() {
    _swapDesc = null; _swapEl = null;
    try {
      var ae = document.activeElement;
      if (!_restorable(ae)) return;
      if (App.state._focus && ae.id === App.state._focus) return; /* the _focus convention owns this one */
      var d = _describeSwapFocus(ae);
      if (d) { _swapDesc = d; _swapEl = ae; }
    } catch (e) {}
  }

  function restoreSwapFocus() {
    var d = _swapDesc, el = _swapEl;
    _swapDesc = null; _swapEl = null;
    if (!d) return;
    try {
      /* act ONLY when the swap actually dropped focus — never fight
         restoreFocus, _syncModalFocus, or a deliberate move by the action */
      var ae = document.activeElement;
      if (ae && ae !== document.body && ae !== document.documentElement) return;
      var t = null;
      if (d.id) t = document.getElementById(d.id);
      else if (_restorable(el)) t = el;
      else {
        var all = document.querySelectorAll(d.sel);
        t = all[d.idx] || null;   /* fewer matches than before: restore nothing rather than
                                     force focus onto a control the user was never on */
      }
      if (!_restorable(t)) return;
      /* preventScroll: a restored row deep in a long results list must not
         jump-scroll the page resScroll has just positioned */
      try { t.focus({ preventScroll: true }); } catch (e0) { try { t.focus(); } catch (e1) {} }
    } catch (e) {}
  }
  App._captureSwapFocus = captureSwapFocus; /* exposed for scripts/focus-restore.test.js */
  App._restoreSwapFocus = restoreSwapFocus;

  var _modalWasOpen = false, _modalReturnEl = null, _modalReturnSel = null, _modalCurDlg = null;
```

- [ ] **Step 5: Hook `App.render` — capture before the swap loop**

In `app/core.js`, replace this exact block (HEAD `:363-365`):

```js
    var s = App.state;
    var sel = captureSel();
    var swapped = [];
```

with:

```js
    var s = App.state;
    var sel = captureSel();
    captureSwapFocus();
    var swapped = [];
```

- [ ] **Step 6: Hook `App.render` — restore after the swap loop**

In `app/core.js`, replace this exact block (HEAD `:409-412`):

```js
    restoreFocus(sel);
  };

  /* Force re-render of one region/subregion.
```

with:

```js
    restoreFocus(sel);
    restoreSwapFocus();
  };

  /* Force re-render of one region/subregion.
```

Order matters: `restoreSwapFocus` runs **after** `restoreFocus`, so the `_focus` search-caret convention wins and the new step no-ops (this is the failure an earlier a11y cycle had to fix twice). `_syncModalFocus` still runs after `render()` returns, so an open dialog still pins focus inside itself.

**Correction, from the implementation review:** this ordering is *inert*, not load-bearing. `restoreFocus` (`core.js:333`) focuses the `_focus` element unconditionally, and `captureSwapFocus` skips that element anyway, so swapping the two lines changes nothing but one no-op `focus()` — and no test detects it. Keep the order as written for clarity, but do not describe it as a guarantee the suite enforces. The guarantee that IS real and IS mutation-killed is the one in Step 4: restore no-ops unless focus actually fell to `<body>`.

- [ ] **Step 7: Hook `App.update` — capture**

In `app/core.js`, replace this exact line (HEAD `:421`):

```js
    var _fb = null; try { _fb = document.activeElement; } catch (e0) {}
```

with:

```js
    var _fb = null; try { _fb = document.activeElement; } catch (e0) {}
    captureSwapFocus();
```

- [ ] **Step 8: Hook `App.update` — restore**

In `app/core.js`, replace this exact block (HEAD `:429-430`):

```js
    restoreFocus(sel);
    /* a subregion swap that re-renders an open dialog's container
```

with:

```js
    restoreFocus(sel);
    restoreSwapFocus();
    /* a subregion swap that re-renders an open dialog's container
```

- [ ] **Step 9: Run the test to verify it passes**

Run: `node --test scripts/focus-restore.test.js scripts/focus-hooks.test.js`
Expected: `tests 12`, `pass 12`, `fail 0`.

- [ ] **Step 10: Check syntax and run the whole suite**

Run:

```bash
node --check app/core.js && node --test scripts/*.test.js
```

Expected: no syntax output, then `tests 136`, `pass 136`, `fail 0` (124 existing + 12 new). `core.js` is loaded by many existing tests — a regression here would surface immediately.

- [ ] **Step 11: Commit**

```bash
git add app/core.js scripts/focus-restore.test.js scripts/focus-hooks.test.js
git commit -F - <<'EOF'
feat(app): keyboard focus survives a region re-render (F1)

render()/update() replace whole regions with innerHTML, so the focused
control was detached and focus fell to <body>. A keyboard or screen-reader
user was thrown back to the top of the document after every activation —
worst case the exam results review accordion, whose deps include
reviewOpen, so opening one row re-rendered all of r-results: one focus
drop per row.

New code, not a rewiring: the three reusable helpers (_restorable,
_selectorFor, _resolveReturn) existed, but nothing captured the pre-swap
activeElement as a re-resolvable descriptor and nothing put focus back.
Scoped to data-a controls — text inputs keep the _focus id convention
(which also preserves the caret) and dialogs keep _syncModalFocus.
Runs after restoreFocus and no-ops unless focus actually fell to <body>,
so it can never steal the search caret.

The descriptor records the index among same-selector matches because a
bare data-a is not unique: the mobile Vocabulary screen renders
data-a="goCards" twice, and a selector-only restore focused the wrong one.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
```

---

## Task 2: F8 — `aria-pressed` on stateful toggles

**Files:**
- Modify: `app/vocab.js` (row toggle HEAD `:480`, word-sheet toggle HEAD `:733`)
- Modify: `app/desktop-vocab.js` (label HEAD `:125`, toggle HEAD `:138`)
- Modify: `app/exam.js` (mobile Flag HEAD `:1058`)
- Modify: `app/desktop-exam.js` (desktop Flag HEAD `:478`)
- Modify: `app/more.js` (guide rows HEAD `:683`), `app/desktop-more.js` (HEAD `:930`)
- Test: `scripts/toggle-a11y.test.js` (**new**)

**Interfaces:**
- Consumes: nothing from Task 1.
- Produces: nothing later tasks rely on. Every edit adds `aria-pressed="true|false"` from a boolean already in scope — `mastered` (`vocab.js:465`, `:709`; `desktop-vocab.js:121`), `flagged` (`exam.js:1029`, `desktop-exam.js:441`), `on` (`more.js:676`, `desktop-more.js:923`). No new variables, no logic changes.

**The naming rule this task applies** (owner decision, W3C ARIA APG Button pattern):
- Named by a **static `aria-label`** (icon-only) → keep the label **stable**, let `aria-pressed` carry state.
- Named by **visible text that already states the state** (word-sheet button, desktop Flag, guide rows) → leave the visible text alone and add `aria-pressed`. Changing that text is a visual design change and out of scope.

- [ ] **Step 1: Write the failing test**

Create `scripts/toggle-a11y.test.js` with exactly this content:

```js
/* Package C / F8 + F9: stateful toggles must expose their state to assistive
   tech (aria-pressed), and quick-check verdicts must not be colour-only.
   Asserts on the REAL rendered markup of the real modules, mirroring
   skills-selfcheck.test.js. Run: node --test scripts/toggle-a11y.test.js */
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

function boot(extraState) {
  const App = {
    util: {}, screens: {}, sheets: {}, overlays: {}, actions: {}, gestures: {}, vocab: {}, more: {}, d: {},
    state: Object.assign({ vMastered: [], vSort: 'default', deckIds: [], guideDone: [], uiLang: 'en', dataReadyFull: true }, extraState || {}),
    data: { WORDS: [], TESTS: [], CHARS: [], GRAMMAR: [], CONFUSABLES: [], TASKS: [] },
    keys: { mastered: 'k', guide: 'g' },
    store: { get() { return null; }, set() {}, del() {}, getJSON(_k, fb) { return fb; }, setJSON() {} },
    setState(p) { for (const k in p) App.state[k] = p[k]; }, update() {}, render() {}, live() {}, sub() { return ''; },
    DECK_SIZE: 20,
  };
  global.window = { App, addEventListener() {}, matchMedia() { return { matches: false, addEventListener() {} }; } };
  global.document = {
    addEventListener() {}, querySelectorAll() { return []; }, querySelector() { return null; },
    getElementById() { return null; },
    createElement() { return { style: {}, setAttribute() {}, appendChild() {} }; },
  };
  return App;
}
function load(App, rel) {
  const p = path.resolve(__dirname, '..', rel);
  delete require.cache[require.resolve(p)];
  require(p);
  return App;
}
const WORDS = [
  { id: 1, word: '爱情', pinyin: 'àiqíng', meaning: 'romantic love', pos: 'n.', freq: 1 },
  { id: 2, word: '安排', pinyin: 'ānpái', meaning: 'to arrange', pos: 'v.', freq: 2 },
];

/* ---------------- F8: aria-pressed ---------------- */

test('F8: the vocabulary row mastery toggle exposes aria-pressed for BOTH states', () => {
  const App = boot({ vMastered: [1] });
  App.data.WORDS = WORDS;
  load(App, 'app/vocab.js');
  const html = App.vocab.listInner();
  assert.match(html, /data-a="toggleMastered" data-argn="1"[^>]*aria-pressed="true"/, 'mastered row is pressed');
  assert.match(html, /data-a="toggleMastered" data-argn="2"[^>]*aria-pressed="false"/, 'unmastered row is not pressed');
});

test('F8: the row toggle name is STABLE across state and names its word (W3C APG)', () => {
  const on = boot({ vMastered: [1] }); on.data.WORDS = WORDS; load(on, 'app/vocab.js');
  const off = boot({ vMastered: [] }); off.data.WORDS = WORDS; load(off, 'app/vocab.js');
  const nameOf = (html) => (html.match(/data-argn="1"[^>]*aria-label="([^"]*)"/) || [])[1];
  assert.equal(nameOf(on.vocab.listInner()), nameOf(off.vocab.listInner()),
    'the accessible name must not change with state — aria-pressed carries it');
  assert.match(nameOf(on.vocab.listInner()), /爱情/, 'and it names the word, so rows are distinguishable');
});

test('F8: the word-sheet mastery toggle exposes aria-pressed', () => {
  const App = boot({ vMastered: [1], wordSheetId: 1 });
  App.data.WORDS = WORDS;
  load(App, 'app/vocab.js');
  assert.match(App.vocab.sheet(), /data-a="toggleMastered"[^>]*aria-pressed="true"/);

  const App2 = boot({ vMastered: [], wordSheetId: 1 });
  App2.data.WORDS = WORDS;
  load(App2, 'app/vocab.js');
  assert.match(App2.vocab.sheet(), /data-a="toggleMastered"[^>]*aria-pressed="false"/);
});

test('F8: the Study Guide checklist rows expose aria-pressed on BOTH clients', () => {
  const m = boot({ guideDone: [0], moreView: 'guide' }); load(m, 'app/more.js');
  const mh = m.screens.more(m.state);
  assert.match(mh, /data-a="toggleGuide" data-argn="0"[^>]*aria-pressed="true"/, 'done step is pressed');
  assert.match(mh, /data-a="toggleGuide" data-argn="1"[^>]*aria-pressed="false"/, 'pending step is not');

  const d = boot({ guideDone: [0], moreView: 'guide' });
  load(d, 'app/more.js'); load(d, 'app/desktop-more.js');
  const dh = d.d.guide(d.state);
  assert.match(dh, /data-a="toggleGuide" data-argn="0"[^>]*aria-pressed="true"/, 'desktop mirror too');
  assert.match(dh, /data-a="toggleGuide" data-argn="1"[^>]*aria-pressed="false"/);
});
```

Then append this fifth test. It covers the one edit in this package that **replaces an existing accessible name** — the highest-risk F8 change, and the only one that interpolates data into an attribute:

```js

test('F8: the DESKTOP vocabulary row toggle — aria-pressed, stable name, escaped word', () => {
  const mk = (mastered, words) => {
    const A = boot({ vMastered: mastered, dataReady: true });
    A.data.WORDS = words || WORDS;
    load(A, 'app/vocab.js'); load(A, 'app/desktop-vocab.js');
    return A.screens['d-vocab-list'].html(A.state);
  };
  const on = mk([1]), off = mk([]);
  assert.match(on, /data-a="toggleMastered" data-argn="1"[^>]*aria-pressed="true"/);
  assert.match(off, /data-a="toggleMastered" data-argn="1"[^>]*aria-pressed="false"/);

  const nameOf = (html) => (html.match(/data-argn="1"[^>]*aria-label="([^"]*)"/) || [])[1];
  assert.equal(nameOf(on), nameOf(off), 'name stable across state (this edit REPLACED a state-bearing label)');
  assert.doesNotMatch(nameOf(on), /click/, 'and no longer says "click" — it is shared with the touch client');

  /* the label now interpolates data, so it must be escaped */
  const quoted = mk([], [{ id: 1, word: 'a"b', pinyin: 'p', meaning: 'm', pos: 'n.', freq: 1 }]);
  assert.doesNotMatch(quoted, /aria-label="Mastered: a"b"/, 'a quote in the word must not break the attribute');
  assert.match(quoted, /aria-label="Mastered: a&quot;b"/);
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `node --test scripts/toggle-a11y.test.js`
Expected: `tests 5`, `pass 0`, `fail 5` — every failure an `AssertionError` reporting that the rendered markup did not match the `aria-pressed` pattern (`aria-pressed` appears zero times in `app/` today).

- [ ] **Step 3: Mobile vocabulary row toggle**

In `app/vocab.js`, replace this exact substring (HEAD `:480`):

```
data-a="toggleMastered" data-argn="' + Number(w.id) + '" aria-label="Toggle mastered"
```

with:

```
data-a="toggleMastered" data-argn="' + Number(w.id) + '" aria-label="Mastered: ' + esc(w.word) + '" aria-pressed="' + (mastered ? 'true' : 'false') + '"
```

The name is now stable across state (APG) and names its word, so a screen-reader user tabbing a 1,000-row list no longer hears "Toggle mastered" a thousand times identically. `mastered` is in scope at `:465`.

- [ ] **Step 4: Mobile word-sheet toggle**

In `app/vocab.js`, replace this exact substring (HEAD `:733`):

```
data-a="toggleMastered" data-argn="' + Number(w.id) + '" style="display:flex;align-items:center;justify-content:center;gap:9px;width:100%
```

with:

```
data-a="toggleMastered" data-argn="' + Number(w.id) + '" aria-pressed="' + (mastered ? 'true' : 'false') + '" style="display:flex;align-items:center;justify-content:center;gap:9px;width:100%
```

This button's name is its visible text (`btnLabel`, `:716`), which is left alone. `mastered` is in scope at `:709`.

- [ ] **Step 5: Desktop vocabulary row toggle**

In `app/desktop-vocab.js`, replace this exact line (HEAD `:125`):

```js
    var aria = mastered ? 'Mastered — click to unmark' : 'Mark as mastered';
```

with:

```js
    /* F8: a toggle's accessible name must NOT change with state — aria-pressed
       carries it (W3C ARIA APG, Button/toggle). Also drops "click", which was
       wrong on the touch client that shares this wording. */
    var aria = 'Mastered: ' + w.word;
```

Then, in the same file, replace this exact substring (HEAD `:138`):

```
data-a="toggleMastered" data-argn="' + Number(w.id) + '" aria-label="' + aria + '" title="' + aria + '"
```

with:

```
data-a="toggleMastered" data-argn="' + Number(w.id) + '" aria-label="' + esc(aria) + '" title="' + esc(aria) + '" aria-pressed="' + (mastered ? 'true' : 'false') + '"
```

`esc()` is added because `aria` now interpolates `w.word` directly rather than a fixed string.

- [ ] **Step 6: The two exam Flag buttons**

In `app/exam.js`, replace this exact substring (HEAD `:1058`):

```
data-a="toggleFlagCur" aria-label="Flag" class="pa"
```

with:

```
data-a="toggleFlagCur" aria-label="Flag for review" aria-pressed="' + (flagged ? 'true' : 'false') + '" class="pa"
```

The name becomes the neutral wording desktop already uses, and stays stable. `flagged` is in scope at `:1029`.

In `app/desktop-exam.js`, replace this exact substring (HEAD `:478`):

```
data-a="toggleFlagCur" class="hv" style="display:inline-flex
```

with:

```
data-a="toggleFlagCur" aria-pressed="' + (flagged ? 'true' : 'false') + '" class="hv" style="display:inline-flex
```

Desktop's name is its visible text (`flagLabel`, `:445`), left alone. `flagged` is in scope at `:441`.

- [ ] **Step 7: The Study Guide checklist rows, both clients**

In `app/more.js`, replace this exact substring (HEAD `:683`):

```
data-a="toggleGuide" data-argn="' + i + '" style="display:flex;align-items:center;gap:12px
```

with:

```
data-a="toggleGuide" data-argn="' + i + '" aria-pressed="' + (on ? 'true' : 'false') + '" style="display:flex;align-items:center;gap:12px
```

In `app/desktop-more.js`, replace this exact substring (HEAD `:930`):

```
data-a="toggleGuide" data-argn="' + i + '" style="display:flex;align-items:center;gap:14px
```

with:

```
data-a="toggleGuide" data-argn="' + i + '" aria-pressed="' + (on ? 'true' : 'false') + '" style="display:flex;align-items:center;gap:14px
```

`on` is in scope at `more.js:676` and `desktop-more.js:923`. These rows are named by their step text, which does not change with state (only its strikethrough does), so the name is already stable.

- [ ] **Step 8: Run the test to verify it passes**

Run: `node --test scripts/toggle-a11y.test.js`
Expected: `tests 5`, `pass 5`, `fail 0`.

- [ ] **Step 9: Confirm every intended toggle got the attribute, and no radio did**

Run:

```bash
grep -ho 'aria-pressed="' app/*.js | wc -l
```

Expected: **7**. Two things matter here. Match on `aria-pressed="` *including the quote*, not the bare word — Step 5's comment in `desktop-vocab.js` mentions `aria-pressed` in prose and a bare-word grep counts that too. And use `grep -o … | wc -l`, not `grep -c`: `-c` counts matching **lines**, so it would silently under-count if two attributes ever shared a line.

Then run:

```bash
grep -n "aria-pressed" app/exam.js | grep "role=\"radio\""
```

Expected: **no output** — `aria-pressed` must not land on the radiogroup options at `exam.js:1022`, which correctly use `aria-checked`.

- [ ] **Step 10: Check syntax and run the whole suite**

Run:

```bash
node --check app/vocab.js && node --check app/desktop-vocab.js && node --check app/exam.js && node --check app/desktop-exam.js && node --check app/more.js && node --check app/desktop-more.js && node --test scripts/*.test.js
```

Expected: no syntax output, then `tests 141`, `pass 141`, `fail 0`.

- [ ] **Step 11: Commit**

```bash
git add app/vocab.js app/desktop-vocab.js app/exam.js app/desktop-exam.js app/more.js app/desktop-more.js scripts/toggle-a11y.test.js
git commit -F - <<'EOF'
feat(app): stateful toggles announce their state (F8)

aria-pressed appeared zero times in app/. Seven toggles carried no
programmatic state: both clients' vocabulary row toggle, the mobile
word-sheet mastery button, both clients' exam Flag, and both clients'
Study Guide checklist rows. Three were colour-only (the two row toggles
and the mobile Flag); the rest conveyed state through visible text or
strikethrough, which assistive tech can read but which never announced the
control as a toggle.

Naming follows the W3C ARIA APG Button pattern rather than the spec's
instruction: a toggle's accessible name must NOT change with state, or a
screen reader announces it twice. Icon-only toggles keep a stable label
and let aria-pressed carry the state; toggles named by visible
state-bearing text keep that text. Desktop's "Mastered — click to unmark"
is normalised for the same reason (and because "click" is wrong on the
touch client that was to copy it).

Two toggles are knowingly left double-announcing — the mobile word-sheet
button and the desktop Flag, whose names ARE their visible state-bearing
text. Rewording those is a visual design change, out of scope here.

The exam radiogroup options are deliberately untouched: they already use
role="radio" + aria-checked, where aria-pressed would be wrong.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
```

---

## Task 3: F9 — quick-check verdicts are not colour-only

**Files:**
- Modify: `app/study.js` (grammar note HEAD `:356-357`, task note HEAD `:483`)
- Modify: `app/desktop-study.js` (grammar note HEAD `:264`, task note HEAD `:554`)
- Test: `scripts/toggle-a11y.test.js` (append)

**Interfaces:**
- Consumes: nothing from Tasks 1–2.
- Produces: nothing. Each edit prefixes the existing note block with the in-file verdict pattern from `app/study.js:565-567`:
  `<b style="color:{--ok-ink|--bad-ink}">{✓ Correct|✗ Not quite}</b> · ` before `esc(q.note)`.
  Correctness is `picked === q.correct`, the same expression `optColors` is already driven by.

- [ ] **Step 1: Write the failing test**

Append to `scripts/toggle-a11y.test.js`:

```js
/* ---------------- F9: verdicts are not colour-only ---------------- */

const GRAMMAR = [{
  slug: 'jinguan', en: 'Although', cn: '尽管', structure: '尽管…', desc: 'd',
  examples: [], wrong: [],
  quiz: [{ q: '选择正确的句子', opts: ['A', 'B'], correct: 0, note: '尽管 introduces a concession.' }],
}];

test('F9: the grammar quick-check states the verdict in TEXT, not just colour', () => {
  const right = boot({ studySub: 'grammar', curGrammar: 'jinguan', gqChoice: 0, gqIdx: 0 });
  right.data.GRAMMAR = GRAMMAR; load(right, 'app/study.js');
  const wrong = boot({ studySub: 'grammar', curGrammar: 'jinguan', gqChoice: 1, gqIdx: 0 });
  wrong.data.GRAMMAR = GRAMMAR; load(wrong, 'app/study.js');
  const r = right.screens.study(right.state), w = wrong.screens.study(wrong.state);
  assert.match(r, /✓ Correct/, 'a right pick says so');
  assert.match(w, /✗ Not quite/, 'a wrong pick says so');
  assert.doesNotMatch(r, /✗ Not quite/);
  assert.doesNotMatch(w, /✓ Correct/);
  assert.notEqual(r, w, 'the two states are no longer byte-identical');
});

test('F9: the DESKTOP grammar quick-check states the verdict too', () => {
  const mk = (pick) => {
    const A = boot({ studySub: 'grammar', curGrammar: 'jinguan', gqChoice: pick, gqIdx: 0 });
    A.data.GRAMMAR = GRAMMAR; load(A, 'app/study.js'); load(A, 'app/desktop-study.js');
    return A.d.study(A.state);
  };
  assert.match(mk(0), /✓ Correct/);
  assert.match(mk(1), /✗ Not quite/);
});

const TASKS = [{
  slug: 'greet', en: 'Greetings', cn: '问候', cat: 'social', dialogue: [],
  quiz: { q: '你好', opts: ['hello', 'bye'], correct: 0, note: '你好 is the neutral greeting.' },
}];

test('F9: the communicative-task quick-check states the verdict on BOTH clients', () => {
  const mobile = (pick) => {
    const A = boot({ studySub: 'topics', curTopic: 'greet', tqChoice: pick });
    A.data.TASKS = TASKS; load(A, 'app/study.js');
    return A.screens.study(A.state);
  };
  assert.match(mobile(0), /✓ Correct/, 'mobile right');
  assert.match(mobile(1), /✗ Not quite/, 'mobile wrong');

  const desktop = (pick) => {
    const A = boot({ studySub: 'topics', curTopic: 'greet', tqChoice: pick });
    A.data.TASKS = TASKS; load(A, 'app/study.js'); load(A, 'app/desktop-study.js');
    return A.d.study(A.state);
  };
  assert.match(desktop(0), /✓ Correct/, 'desktop right');
  assert.match(desktop(1), /✗ Not quite/, 'desktop wrong');
});

test('F9: an UNANSWERED quick-check shows no verdict at all', () => {
  const A = boot({ studySub: 'grammar', curGrammar: 'jinguan', gqChoice: null, gqIdx: 0 });
  A.data.GRAMMAR = GRAMMAR; load(A, 'app/study.js');
  const html = A.screens.study(A.state);
  assert.doesNotMatch(html, /✓ Correct/);
  assert.doesNotMatch(html, /✗ Not quite/);
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `node --test scripts/toggle-a11y.test.js`
Expected: `tests 9`, `pass 6`, `fail 3`. The five F8 tests still pass; the three new verdict tests fail with `AssertionError … did not match /✓ Correct/`. The fourth new test — "an UNANSWERED quick-check shows no verdict" — **passes already, by design**: it is a guard that the fix must not leak a verdict into the un-answered state, not a RED test.

- [ ] **Step 3: Mobile grammar quick-check**

In `app/study.js`, replace this exact block (HEAD `:356-357`):

```js
      var noteBlock = picked != null
        ? '<div class="chinese" style="margin-top:12px;background:var(--surface-sunken);border-radius:11px;padding:12px 14px;font-size:.85rem;color:var(--stone);line-height:1.6">' + esc(q.note) + '</div>'
```

with:

```js
      var vOk = picked === q.correct;
      var vLabel = '<b style="color:' + (vOk ? 'var(--ok-ink)' : 'var(--bad-ink)') + '">' + (vOk ? '✓ Correct' : '✗ Not quite') + '</b> · ';
      var noteBlock = picked != null
        ? '<div class="chinese" style="margin-top:12px;background:var(--surface-sunken);border-radius:11px;padding:12px 14px;font-size:.85rem;color:var(--stone);line-height:1.6">' + vLabel + esc(q.note) + '</div>'
```

- [ ] **Step 4: Mobile communicative-task quick-check**

In `app/study.js`, replace this exact substring (HEAD `:483`):

```js
(picked != null ? '<div class="chinese" style="margin-top:12px;background:var(--surface-sunken);border-radius:11px;padding:12px 14px;font-size:.86rem;color:var(--stone);line-height:1.6">' + esc(q.note) + '</div>' : '')
```

with:

```js
(picked != null ? '<div class="chinese" style="margin-top:12px;background:var(--surface-sunken);border-radius:11px;padding:12px 14px;font-size:.86rem;color:var(--stone);line-height:1.6"><b style="color:' + (picked === q.correct ? 'var(--ok-ink)' : 'var(--bad-ink)') + '">' + (picked === q.correct ? '✓ Correct' : '✗ Not quite') + '</b> · ' + esc(q.note) + '</div>' : '')
```

- [ ] **Step 5: Desktop grammar quick-check**

In `app/desktop-study.js`, replace this exact line (HEAD `:264`):

```js
        noteBlock = '<div style="margin-top:14px;background:var(--surface-sunken);border-radius:11px;padding:12px 15px;font-size:var(--fs-sm);color:var(--stone);line-height:1.6">' + esc(q.note) + '</div>'
```

with:

```js
        var vOk = picked === q.correct;
        noteBlock = '<div style="margin-top:14px;background:var(--surface-sunken);border-radius:11px;padding:12px 15px;font-size:var(--fs-sm);color:var(--stone);line-height:1.6"><b style="color:' + (vOk ? 'var(--ok-ink)' : 'var(--bad-ink)') + '">' + (vOk ? '✓ Correct' : '✗ Not quite') + '</b> · ' + esc(q.note) + '</div>'
```

- [ ] **Step 6: Desktop communicative-task quick-check**

In `app/desktop-study.js`, replace this exact block (HEAD `:554-555`):

```js
          '<div style="margin-top:14px;background:var(--surface-sunken);border-radius:11px;padding:12px 15px;font-size:var(--fs-sm);color:var(--stone);line-height:1.6">' + esc(q.note) + '</div>' +
          '<div style="text-align:center;padding:14px 8px 0">
```

with:

```js
          '<div style="margin-top:14px;background:var(--surface-sunken);border-radius:11px;padding:12px 15px;font-size:var(--fs-sm);color:var(--stone);line-height:1.6"><b style="color:' + (ok ? 'var(--ok-ink)' : 'var(--bad-ink)') + '">' + (ok ? '✓ Correct' : '✗ Not quite') + '</b> · ' + esc(q.note) + '</div>' +
          '<div style="text-align:center;padding:14px 8px 0">
```

This is the fourth surface the spec did not list. `ok` is already computed at `:548` for the score line — this card was never colour-only, so the change is for consistency with the other three, not an a11y fix.

- [ ] **Step 7: Run the test to verify it passes**

Run: `node --test scripts/toggle-a11y.test.js`
Expected: `tests 9`, `pass 9`, `fail 0`.

- [ ] **Step 8: Confirm all four surfaces speak the same language**

Run:

```bash
grep -c "Not quite" app/study.js app/desktop-study.js
```

Expected: `app/study.js:4` and `app/desktop-study.js:4` — the two pre-existing uses in each file (`study.js:567`/`:635`, `desktop-study.js:391`/`:462`) plus the two added to each.

- [ ] **Step 9: Check syntax and run the whole suite**

Run:

```bash
node --check app/study.js && node --check app/desktop-study.js && node --test scripts/*.test.js
```

Expected: no syntax output, then `tests 145`, `pass 145`, `fail 0`.

- [ ] **Step 10: Commit**

```bash
git add app/study.js app/desktop-study.js scripts/toggle-a11y.test.js
git commit -F - <<'EOF'
feat(app): quick-check verdicts are readable without colour (F9)

The grammar and communicative-task quick-checks rendered a byte-identical
explanation whether the answer was right or wrong — the only signal was
the option's background tint. That is invisible to a screen reader, and on
the light theme --ok-bg and --bad-bg are both pale tints, so it is close to
invisible to a red/green colour-blind user too.

Each note block now opens with the verdict, reusing the '✓ Correct' /
'✗ Not quite' pattern this file already ships. The desktop task card is
included for consistency — it was never colour-only (it prints a score
line), but all four quick-checks now read the same way.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
```

---

## Task 4: Verification on both clients

**Files:** none modified.

**Interfaces:**
- Consumes: Tasks 1–3.
- Produces: the pass/fail record for the package.

**Why a separate task:** F1's real payload is a browser behaviour no unit test can prove (a real `innerHTML` swap dropping real focus), and the two exam Flag buttons have no unit test at all. This pass is their only verification and is the gate for the package.

- [ ] **Step 1: Run the full suite**

Run: `node --test scripts/*.test.js`
Expected: `tests 145`, `pass 145`, `fail 0`.

- [ ] **Step 2: Confirm nothing needs a rebuild**

Run:

```bash
git status --porcelain -- app/ scripts/ data/ build.js
```

Expected: **no output** if Tasks 1–3 each committed. (Plain `git status --porcelain` is *not* clean — the untracked Package B and C plan documents show as `??`. Scoping the check to the code paths is what makes it meaningful.)

Then confirm the diff touched only `app/*.js` and `scripts/*.test.js`:

```bash
git diff --name-only HEAD~3..HEAD
```

No `data/*.json`, no `build.js`, no generated `index.html`, no `app/index.html` — so neither `node build.js` nor `node scripts/inject-auth.js` is required.

- [ ] **Step 3: Serve with the placeholder auth config**

`config/auth.js` is tracked, so `git` is the backup.

```bash
cp config/auth.example.js config/auth.js && python3 -m http.server 8080 &
echo "server pid $!"
```

Background it (`&`) and keep the PID: run in the foreground this step never returns, and an executor that stalls here may end the session before Step 6 restores the real config — which would leave an unconfigured, ungated site in the tree.

- [ ] **Step 4: Verify the DESKTOP client**

Open `http://localhost:8080/app/`. The preview browser is `pointer:fine`, so it picks the desktop client.

Bust the module cache first — stale `app/*.js` has burned prior verification passes in this project. In the console, then reload:

```js
['core','data','shell','exam','vocab','more','study','desktop-config','desktop-shell','desktop-exam','desktop-vocab','desktop-more','desktop-study'].forEach(function(m){fetch('/app/'+m+'.js',{cache:'reload'});});
```

Then check, in order:

1. **F1, the worst case.** Sit any paper, submit it, and reach the results screen. Tab to a review-row toggle (`data-a="toggleReview"`), press Enter, and confirm `document.activeElement` is still that row — not `<body>`. The check that matters:
   ```js
   (function(){var b=document.querySelector('[data-a="toggleReview"]');b.focus();b.click();
     var a=document.activeElement;
     return {isRow:a.getAttribute('data-a')==='toggleReview',
             droppedToBody:a===document.body,
             sameNode:a===b};})()
   ```
   Expected: `isRow: true`, `droppedToBody: false`, **`sameNode: false`**. All three matter: `sameNode` must be *false*, because a `true` there would mean the region was never swapped and the check proved nothing — it is the only assertion that shows a swap happened **and** the twin was resolved. Before F1 this returned `droppedToBody: true`.
2. **F1 must not steal the search caret.** Open the ⌘K palette, type two characters, and confirm focus stays in the input and the caret does not jump to the start:
   ```js
   document.activeElement.id + ' | caret ' + document.activeElement.selectionStart
   ```
3. **F1 must not scroll the page.** On a long results list, scroll down, open a review row far from the top, and confirm the page does not jump to the top.
4. **F8 Flag (no unit test — this is its only check).** In the exam player, confirm the Flag button reports `aria-pressed` and that it flips:
   ```js
   (function(){var f=document.querySelector('[data-a="toggleFlagCur"]');var before=f.getAttribute('aria-pressed');
     f.click();var after=document.querySelector('[data-a="toggleFlagCur"]').getAttribute('aria-pressed');
     return before+' -> '+after;})()
   ```
   Expected: `false -> true` (or `true -> false`).
5. **F8 elsewhere.** On Vocabulary, confirm a row toggle carries `aria-pressed` and that its `aria-label` is unchanged by toggling it. On More → Study Guide, confirm a checklist row carries `aria-pressed`.
6. **F9.** Study → Grammar → open a pattern → answer its Quick check **wrongly**; the note must begin `✗ Not quite ·`. Answer another **correctly**; it must begin `✓ Correct ·`. Repeat on Study → Communicative tasks.

- [ ] **Step 5: Verify the MOBILE client**

In the console:

```js
localStorage.setItem('hsk4-client', 'mobile'); location.reload();
```

Then bust the cache again (the seven shared modules) and reload:

```js
['core','data','shell','exam','vocab','more','study'].forEach(function(m){fetch('/app/'+m+'.js',{cache:'reload'});});
```

Repeat checks 1, 4, 5 and 6 from Step 4. Mobile-specific additions:
- The word-sheet "Mark as mastered" button carries `aria-pressed`, and its visible label still changes (`Mark as mastered` ↔ `Mastered`).
- The mobile Flag button's `aria-label` reads `Flag for review` and does **not** change when toggled — only `aria-pressed` does.

- [ ] **Step 6: Restore the real auth config**

Stop the server, then:

```bash
git checkout -- config/auth.js && git status --porcelain config/auth.js
```

Expected: **no output**. Do not skip this: leaving the placeholder in place ships an unconfigured, ungated site.

- [ ] **Step 7: Update CLAUDE.md's test count**

In `CLAUDE.md`, replace this exact substring:

```
band-score/grade-sections/skills/plan-charge/writing-models/vocab-session/weakest-section — 15 files, 124 tests)
```

with:

```
band-score/grade-sections/skills/plan-charge/writing-models/vocab-session/weakest-section/focus-restore/focus-hooks/toggle-a11y — 18 files, 145 tests)
```

Then commit:

```bash
git add CLAUDE.md
git commit -m "docs: CLAUDE.md test count 124 -> 145 (Package C suites)

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

- [x] **Step 8: Record the result** — RAN 2026-07-27, all checks green

Both clients, placeholder-config swap, cache busted, config restored clean. Evidence:

| Check | Desktop | Mobile |
|---|---|---|
| F1 review accordion | `isRow:true, droppedToBody:false, sameNode:false, argn:"0"` | `rows:85, isRow:true, droppedToBody:false, sameNode:false` |
| F1 no jump-scroll | scrollY `6508 → 6508` on row 40, same row refocused | — |
| F1 search caret | `g-search` kept focus, caret at 2 | — |
| **F8 exam Flag** (the only F8 target with no unit test) | `aria-pressed: false → true → false` | label `Flag for review` **stable**, `false → true` |
| F8 vocab row | name `Mastered: 啊` stable, pressed flips, no "click" | same |
| F8 word sheet | — | `aria-pressed="true"`, visible text `Mastered` |
| F8 guide rows | 8 rows, `false → true` | — |
| F9 grammar | `✗ Not quite · Concession…` / `✓ Correct · Concession…` | same, and unanswered shows neither |
| F9 tasks | — | `✗ Not quite · The answer is…` |

The Flag row is the one that matters: it is the package's only manually-gated deliverable, and it passed on both clients.

If every check in Steps 4–5 passed, Package C is complete. If any failed, fix it in the task that owns it and re-run this task from Step 1 — do not report the package complete on a partial pass.

---

## What this package deliberately leaves for later

- **F1 covers `data-a` controls only.** A focused element with neither an `id` nor a `data-a` (a raw `<a href>` in prose, say) still loses focus on a swap. Widening `_selectorFor` is a bigger change with its own ambiguity questions; the controls that actually re-render on activation all carry `data-a`.
- **`aria-pressed` is not added to the exam radiogroup** (`exam.js:1022`) — correctly, since `aria-checked` is the right attribute there.
- **`aria-expanded` on disclosure controls** is a separate, adjacent gap: `toggleReview` (`exam.js:1226`, `desktop-exam.js:640`), `toggleWrModel` (`study.js:671`, `desktop-study.js:594`) and `toggleRail`/`toggleMenu` (`desktop-shell.js:196`/`:199`) expand and collapse content without announcing it, and `toggleNotif` / `toggleRecall` are switches with no state exposure. Worth naming here because the review accordion is F1's showcase surface: after this package focus survives it, but it still never announces open or closed. Out of scope per the spec.
- **The old build-generated site now diverges.** `vocabulary/index.html` has its own `toggleMastered` and `grammar/*/index.html` its own verdict text, all untouched — correct per scope (and why no rebuild is needed), but the two surfaces' a11y differs until those generators are revisited.
- **Live-region announcements for tab changes** (audit item L10) remain open; Package C covers focus and state, not announcements.
- **Packages D, E and F** follow, per the spec's execution order `A → B + E → C → D → F`. E (`F6` CSS fallbacks, `F13` font URL) has not been planned yet.
