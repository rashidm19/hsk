# /app/ Pre-Launch Hardening Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship the six pre-launch correctness/privacy/test-debt fixes (O1b, O3, M3, M4, M5, M6) from the spec `docs/superpowers/specs/2026-07-23-app-prelaunch-hardening-design.md`, adversarially reviewed (`wf_df02afc2-53a`). **O5 is intentionally excluded** — it rides the live Group C paywall path and gets its own reviewed cycle.

**Architecture:** Plain static site, no framework/bundler/npm. The post-paywall SPA `/app/` runs two presentation shells over one shared logic layer: mobile modules `app/{core,exam,shell,more,…}.js` + desktop overrides `app/desktop-*.js`. Auth/paywall live at repo root (`auth.js`, `auth-guard.js`). Tests are zero-dependency `node:test` files under `scripts/`, loading real modules into a mocked `window`/`document`.

**Tech Stack:** Vanilla ES5-style JS (IIFE modules on a global `App`/`HSKAuth`), `node:test` + `node:assert/strict`, no build for these files.

## Global Constraints

Copied verbatim from the spec + CLAUDE.md. Every task implicitly includes these.

- **No npm / no framework / no bundler.** Node built-ins only. Match the surrounding ES5 style (`var`, function declarations, string-concatenated HTML).
- **Tests are zero-dep** and run with `node --test scripts/*.test.js`. The whole suite must stay green (currently 6 files / 53 tests).
- **Two shells:** any user-visible change to the mobile module must be mirrored in its `desktop-*.js` override. Shared *logic* is exported once on `App.exam`/`App.util` and read by desktop, not copied.
- **Never hand-edit generated `index.html`.** These tasks touch only non-generated source: `app/*.js`, `auth.js`, `auth-guard.js`, `scripts/*.test.js`. **No `node build.js` / `inject-auth` is required for any task** (only once at deploy).
- **Never emit the literal string `<`+`main`** anywhere in `/app/` JS (the `injectAppShell` path-skip invariant).
- **Band math:** `/300` scale, pass line **180**, `band = round(meanSec × 3)` where `meanSec` = mean of the auto-scored sections' per-section %. Writing (`selfCheck`) is excluded from the band.
- **Browser-verification bypass:** to open the guard locally, copy `config/auth.example.js` over `config/auth.js` (placeholder values short-circuit `isConfigured()`), verify in-browser on **both** clients (append `?client=mobile` / `?client=desktop` or set `localStorage 'hsk4-client'`), then **restore** `config/auth.js` (it is git-tracked; `git checkout config/auth.js`).
- **Commit trailer:** end every commit message with `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>`.

---

## File Structure

| File | Responsibility | Tasks |
|------|----------------|-------|
| `scripts/band-score.test.js` (create) | Regression-lock `App.util.bandScore`/`estScore` | M4 |
| `scripts/exam-audio.test.js` (modify) | Add `normalizeQ` writing self-check cases | M6 |
| `scripts/grade-sections.test.js` (create) | Lock the extracted grader + bandScore parity | M5 |
| `app/exam.js` (modify) | Extract `App.exam.gradeSections`; section-scoped results | M5, O1b |
| `app/desktop-exam.js` (modify) | Use `gradeSections`; section-scoped results | M5, O1b |
| `auth.js` (modify) | `HSKAuth.armPayPending()` | O3 |
| `scripts/access-authjs.test.js` (modify) | Lock `armPayPending`→`isPayPending` round-trip | O3 |
| `app/more.js` (modify) | Arm marker in `confirmPlan`; mask PII sites | O3, M3 |
| `auth-guard.js` (modify) | Drop the `?pay=success` disjunct | O3 |
| `app/desktop-more.js` (modify) | Mask PII sites | M3 |

**Task order:** M4 → M6 → M5 → O1b → O3 → M3. M4/M6 are pure characterization tests (safe, no prod change). M5 extracts the grader O1b then consumes. O3 and M3 are independent.

---

### Task 1 (M4): Regression tests for `bandScore` / `estScore`

**Files:**
- Create: `scripts/band-score.test.js`

**Interfaces:**
- Consumes: `App.util.bandScore(attempt)` and `App.util.estScore(attempts)` (already exported at `app/shell.js:74-75`). `bandScore` reads `attempt.sections` (array of `{tot, ok}`) or falls back to `attempt.pct`. `estScore` = mean `bandScore` of the last 3 attempts.
- Produces: nothing consumed by later tasks.

> These lock **existing, correct** code, so the tests pass green immediately — a failure means a real regression (or a wrong test). This is characterization, not red-green TDD.

- [ ] **Step 1: Write the test file**

```js
/* Regression-locks the /300 headline math: App.util.bandScore (the single
   band formula) and App.util.estScore (dashboard estimate = mean of last 3).
   Loads the REAL app/shell.js in a mocked env, mirroring skills-selfcheck.test.js.
   Run: node scripts/band-score.test.js */
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

function bandScoreImpl() {
  const App = { util: {}, screens: {}, sheets: {}, overlays: {}, actions: {}, gestures: {},
    state: {}, data: { TESTS: [], WORDS: [], CHARS: [], GRAMMAR: [], CONFUSABLES: [] },
    store: { get() { return null; }, set() {}, del() {}, getJSON(_k, fb) { return fb; }, setJSON() {} },
    setState() {}, update() {}, sub() { return ''; }, render() {} };
  global.window = { App, addEventListener() {}, matchMedia() { return { matches: false, addEventListener() {} }; } };
  global.document = { addEventListener() {}, createElement() { return { style: {}, setAttribute() {}, appendChild() {} }; }, getElementById() { return null; } };
  const p = path.resolve(__dirname, '..', 'app/shell.js');
  delete require.cache[require.resolve(p)];
  require(p);
  return App.util;
}
function sec(ok, tot) { return { tot: tot, ok: ok }; }

test('bandScore: 2 sections (<3 path) projects mean% onto /300', () => {
  const u = bandScoreImpl();
  assert.equal(u.bandScore({ sections: [sec(16, 20), sec(12, 20)] }), 210); // mean(80,60)=70 -> 210
});
test('bandScore: 3 sections (>=3 path) sums the per-section %', () => {
  const u = bandScoreImpl();
  assert.equal(u.bandScore({ sections: [sec(10, 20), sec(10, 20), sec(10, 20)] }), 150); // 50+50+50
});
test('bandScore: section-less legacy attempt uses pct*3', () => {
  const u = bandScoreImpl();
  assert.equal(u.bandScore({ pct: 60, sections: [] }), 180);
});
test('bandScore: empty attempt is 0', () => {
  const u = bandScoreImpl();
  assert.equal(u.bandScore({ sections: [] }), 0);
});
test('estScore: mean band of the last 3 attempts', () => {
  const u = bandScoreImpl();
  // section-less attempts give exact control of each band value (pct*3):
  assert.equal(u.estScore([{ pct: 100, sections: [] }, { pct: 100, sections: [] }, { pct: 100, sections: [] }]), 300);
  assert.equal(u.estScore([{ pct: 20, sections: [] }, { pct: 40, sections: [] }, { pct: 60, sections: [] }]), 120); // mean(60,120,180)=120
});
test('estScore: only the last 3 attempts count', () => {
  const u = bandScoreImpl();
  // first attempt (band 0) is dropped; mean(300,300,300)=300
  assert.equal(u.estScore([{ pct: 0, sections: [] }, { pct: 100, sections: [] }, { pct: 100, sections: [] }, { pct: 100, sections: [] }]), 300);
});
test('estScore: no attempts is 0', () => {
  const u = bandScoreImpl();
  assert.equal(u.estScore([]), 0);
});
```

- [ ] **Step 2: Run and verify all pass**

Run: `node --test scripts/band-score.test.js`
Expected: PASS (7 tests). If any fails, the arithmetic in `app/shell.js:42-58` has changed — investigate before editing the test.

- [ ] **Step 3: Run the full suite to confirm no interference**

Run: `node --test scripts/*.test.js`
Expected: all green (was 53 tests, now +7).

- [ ] **Step 4: Commit**

```bash
git add scripts/band-score.test.js
git commit -m "test(app): regression-lock bandScore/estScore /300 math (M4)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 2 (M6): Test `normalizeQ` Writing self-check

**Files:**
- Modify: `scripts/exam-audio.test.js` (append cases; reuse its `loadExam` harness)

**Interfaces:**
- Consumes: `App.exam.normalizeTest(testIdx, {questions})` (exported `app/exam.js:1439`), which runs each raw question through `normalizeQ`. A raw `writing_construction` question `{type:'writing_construction', options:[...model sentences...], text, image?}` must normalize to `{selfCheck:true, options:[], modelAnswers:[...the input options...]}` (`app/exam.js:152-171`).
- Produces: nothing consumed later.

- [ ] **Step 1: Append the failing-if-regressed test cases**

Add to the end of `scripts/exam-audio.test.js` (the `loadExam`, `byNum` helpers already exist in that file):

```js
/* M6: writing_construction is self-checked, not auto-scored — normalizeQ must
   flag selfCheck, move the model sentences to modelAnswers, and CLEAR options
   so every downstream scorer skips it. */
function W(number, options, image) {
  return { type: 'writing_construction', number: number, options: options, image: image || '', text: number + '. 看图造句' };
}

test('M6: 看图造句 (with image, many model sentences) -> selfCheck, options cleared, modelAnswers kept', () => {
  const App = loadExam([{ official: false }]);
  const models = ['他在打篮球。', '男孩正在打球。', '他们在运动。'];
  const out = App.exam.normalizeTest(0, { questions: [W(51, models, 'pic.png')] }).questions;
  assert.equal(out[0].selfCheck, true, 'flagged self-check');
  assert.deepEqual(out[0].options, [], 'options cleared so grading skips it');
  assert.deepEqual(out[0].modelAnswers, models, 'model sentences preserved for the reveal');
  assert.equal(out[0].typeLabel, '看图造句', 'image -> 看图造句 label');
});

test('M6: 完成句子 (colon prompt, single model) -> selfCheck, options cleared', () => {
  const App = loadExam([{ official: false }]);
  const q = { type: 'writing_construction', number: 61, options: ['他把作业写完了。'], image: '', text: '61. 完成句子：他把作业……' };
  const out = App.exam.normalizeTest(0, { questions: [q] }).questions;
  assert.equal(out[0].selfCheck, true);
  assert.deepEqual(out[0].options, []);
  assert.deepEqual(out[0].modelAnswers, ['他把作业写完了。']);
  assert.equal(out[0].typeLabel, '完成句子', 'no image -> 完成句子 label');
});
```

- [ ] **Step 2: Run and verify pass**

Run: `node --test scripts/exam-audio.test.js`
Expected: PASS (was 6, now 8). A failure means `normalizeQ`'s writing branch regressed.

- [ ] **Step 3: Commit**

```bash
git add scripts/exam-audio.test.js
git commit -m "test(app): lock normalizeQ writing self-check contract (M6)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 3 (M5): Extract `App.exam.gradeSections`; rewire both result templates

**Files:**
- Create: `scripts/grade-sections.test.js`
- Modify: `app/exam.js` (add `gradeSections`, export it, use it in `resultsTpl`)
- Modify: `app/desktop-exam.js` (use `gradeSections` in the desktop results template)

**Interfaces:**
- Produces: `App.exam.gradeSections(secList)` where `secList` is an array of `{tot, ok}` (the auto-scored sections, Writing already excluded). Returns `{ band, pass, passed, ratio, tierKey }` with `pass=180`, `band=Math.round(mean(per-section %)*3)`, `passed = band>=pass`, `ratio = band/pass`, `tierKey ∈ {'pass','close','building','early'}`. **O1b (Task 4) consumes this.**

- [ ] **Step 1: Write the failing test**

Create `scripts/grade-sections.test.js`:

```js
/* M5: App.exam.gradeSections is the single band+verdict grader shared by the
   mobile and desktop results screens. Locks explicit band values (not just
   parity, which would be tautological if it delegates) AND agreement with
   App.util.bandScore. Run: node scripts/grade-sections.test.js */
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
function loadUtil() {
  const App = { util: {}, screens: {}, sheets: {}, overlays: {}, actions: {}, gestures: {},
    state: {}, data: { TESTS: [], WORDS: [], CHARS: [], GRAMMAR: [], CONFUSABLES: [] },
    store: { get() { return null; }, set() {}, del() {}, getJSON(_k, fb) { return fb; }, setJSON() {} },
    setState() {}, update() {}, sub() { return ''; }, render() {} };
  global.window = { App, addEventListener() {}, matchMedia() { return { matches: false, addEventListener() {} }; } };
  global.document = { addEventListener() {}, createElement() { return { style: {}, setAttribute() {}, appendChild() {} }; }, getElementById() { return null; } };
  const p = path.resolve(__dirname, '..', 'app/shell.js');
  delete require.cache[require.resolve(p)];
  require(p);
  return App.util;
}
function sec(ok, tot) { return { tot: tot, ok: ok }; }

test('gradeSections: explicit band value (L 80%, R 60% -> 210, not passed)', () => {
  const g = loadExam().gradeSections([sec(16, 20), sec(12, 20)]);
  assert.equal(g.band, 210);
  assert.equal(g.pass, 180);
  assert.equal(g.passed, true);      // 210 >= 180
  assert.equal(g.tierKey, 'pass');
});
test('gradeSections: a failing set lands in the right tier', () => {
  const g = loadExam().gradeSections([sec(8, 20), sec(8, 20)]); // 40% mean -> band 120, ratio .666
  assert.equal(g.band, 120);
  assert.equal(g.passed, false);
  assert.equal(g.tierKey, 'building'); // ratio 0.666 in [0.55,0.85)
});
test('gradeSections: agrees with App.util.bandScore for the same sections', () => {
  const ex = loadExam();
  const cases = [[sec(16, 20), sec(12, 20)], [sec(8, 20), sec(8, 20)], [sec(20, 20), sec(20, 20)]];
  cases.forEach(function (secs) {
    const u = loadUtil();               // reload shell.js in its own mocked window
    assert.equal(ex.gradeSections(secs).band, u.bandScore({ sections: secs }));
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `node --test scripts/grade-sections.test.js`
Expected: FAIL — `App.exam.gradeSections is not a function`.

- [ ] **Step 3: Implement `gradeSections` in `app/exam.js`**

Add this function inside the `exam.js` IIFE, just above the `/* public surface */` export block (near `app/exam.js:1428`):

```js
  /* shared band+verdict grader (contract §Stats formulas) — Writing already
     excluded from secList; pass 180; band = round(mean section % × 3).
     Exposed so BOTH the mobile resultsTpl and desktop results use ONE source. */
  function gradeSections(secList) {
    var scores = (secList || []).map(function (x) { return x.tot ? Math.round(x.ok / x.tot * 100) : 0; });
    var meanSec = scores.length ? scores.reduce(function (a, b) { return a + b; }, 0) / scores.length : 0;
    var band = Math.round(meanSec * 3);
    var pass = 180;
    var ratio = pass ? band / pass : 0;
    var tierKey = band >= pass ? 'pass' : ratio >= 0.85 ? 'close' : ratio >= 0.55 ? 'building' : 'early';
    return { band: band, pass: pass, passed: band >= pass, ratio: ratio, tierKey: tierKey };
  }
```

Then export it — add to the public-surface block (near `app/exam.js:1439`, beside `ex.normalizeTest`):

```js
  ex.gradeSections = gradeSections;  /* pure; shared grader (M5) + exposed for tests */
```

- [ ] **Step 4: Rewire the mobile `resultsTpl` to use it**

In `app/exam.js` `resultsTpl`, replace the inline band computation (the block at ~`app/exam.js:1066-1072`):

```js
    var secList = Object.keys(secMap).map(function (k) { return secMap[k]; });
    var secScores = secList.map(function (x) { return x.tot ? Math.round(x.ok / x.tot * 100) : 0; });
    var meanSec = secScores.length ? secScores.reduce(function (a, b) { return a + b; }, 0) / secScores.length : 0;
    var band = Math.round(meanSec * 3);
    var pass = 180;
    var passed = band >= pass;
    var rBand = pass ? band / pass : 0;
```

with:

```js
    var secList = Object.keys(secMap).map(function (k) { return secMap[k]; });
    var _g = App.exam.gradeSections(secList);
    var band = _g.band, pass = _g.pass, passed = _g.passed, rBand = _g.ratio;
```

(The verdict-copy block at `app/exam.js:1110-1114` reads `passed`/`rBand` and is unchanged.)

- [ ] **Step 5: Rewire the desktop results template**

In `app/desktop-exam.js` `resultsTpl`, replace the seven-line band-computation block at **`app/desktop-exam.js:544-550`** (currently `bandMax`/`pass`/`meanSec`/`band`/`passed`/`wrong`/`r`) with the `gradeSections` version. **CRITICAL: line 549 is `var wrong = total - correct - skipped;` — it is NOT a band variable, it is interleaved in this block and is consumed by the hero at `:668`. The replacement below re-includes it; do not drop it.** The exact current block:

```js
    var bandMax = 300;
    var pass = 180;
    var meanSec = sections.length ? sections.reduce(function (a, x) { return a + x.score; }, 0) / sections.length : 0;
    var band = Math.round(meanSec * 3);
    var passed = band >= pass;
    var wrong = total - correct - skipped;
    var r = pass ? band / pass : 0;
```

Replace with:

```js
    var _g = App.exam.gradeSections(sections);
    var bandMax = 300;
    var band = _g.band, pass = _g.pass, passed = _g.passed, r = _g.ratio;
    var wrong = total - correct - skipped;
```

(`meanSec` is now computed inside `gradeSections`. The tier-copy block at `app/desktop-exam.js:588-591` reads `passed`/`r` and is unchanged. `sections` already excludes the `selfCheck` Writing section — the `qs.forEach` at :528-537 skips `q.selfCheck`.)

- [ ] **Step 6: Run the grader test — verify pass**

Run: `node --test scripts/grade-sections.test.js`
Expected: PASS (3 tests).

- [ ] **Step 7: Run the full suite**

Run: `node --test scripts/*.test.js`
Expected: all green.

- [ ] **Step 8: Browser-verify no visual regression (both clients)**

Swap in the placeholder config (`cp config/auth.example.js config/auth.js`), serve (`python3 -m http.server 8080`), open `/app/`, complete a **full** paper on mobile and desktop, submit. Confirm the results band + verdict render **identically** to before (same number, same "Passed/So close/…" copy). Restore: `git checkout config/auth.js`.

- [ ] **Step 9: Commit**

```bash
git add app/exam.js app/desktop-exam.js scripts/grade-sections.test.js
git commit -m "refactor(app): extract App.exam.gradeSections, shared by both results screens (M5)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 4 (O1b): Section-scoped results card for single-section drills

**Files:**
- Modify: `app/exam.js` (`resultsTpl` hero + the "projected to /300" line)
- Modify: `app/desktop-exam.js` (results hero)

**Interfaces:**
- Consumes: `App.exam.gradeSections` (Task 3), `s.examSection` (state; `'all'` for a full paper, a section name like `'Listening'`/`'Reading'` for a drill), and the already-computed `pct`, `correct`, `total`, `secList`/`sections`, `s.elapsed`.
- Produces: nothing consumed later.

> Section drills are **never persisted** (`submitExam` early-returns at `app/exam.js:617-621` before `computeAttempt`), so this is a **pure results-screen render fix** — no attempt field, no dashboard/history change.

- [ ] **Step 1: Mobile — add the `sectioned` flag**

In `app/exam.js` `resultsTpl`, right after `var s = stateOf();` (~`app/exam.js:1036`), add:

```js
    var sectioned = s.examSection && s.examSection !== 'all';
```

- [ ] **Step 2: Mobile — branch the hero**

In `resultsTpl`'s return, replace the band-ring hero block (`app/exam.js:1207-1214`, the `<div ... background:' + heroBg + ...>` … containing the `<svg>` ring, the `band`/`/ 300` label, `esc(verdict)`, `esc(verdictEn)`) so it is chosen only for a full paper, with a section hero for a drill:

```js
        (sectioned
          ? '<div style="background:linear-gradient(150deg,var(--accent),var(--accent-hover));color:#fff8f1;border-radius:22px;padding:24px;box-shadow:var(--shadow-lg);text-align:center">' +
              '<div style="font-size:2.6rem;font-weight:800;line-height:1">' + pct + '%</div>' +
              '<div style="font-size:.8rem;opacity:.92;margin-top:4px">' + correct + ' / ' + total + ' correct</div>' +
              '<div class="serif-cn" style="font-size:1.25rem;font-weight:700;margin-top:14px">' + esc((secList[0] && secList[0].cn) || '') + ' · ' + esc(s.examSection) + ' — practice</div>' +
              '<div style="opacity:.9;font-size:.85rem;margin-top:2px">Section practice — not a full-exam score · ' + esc(fmtTime(s.elapsed || 0)) + '</div>' +
            '</div>'
          : '<div style="position:relative;overflow:hidden;background:' + heroBg + ';color:#fff8f1;border-radius:22px;padding:24px;box-shadow:var(--shadow-lg);text-align:center">' +
              '<div style="position:relative;width:120px;height:120px;margin:0 auto">' +
                '<svg width="120" height="120" viewBox="0 0 120 120" style="transform:rotate(-90deg)"><circle cx="60" cy="60" r="54" fill="none" stroke="rgba(255,255,255,.25)" stroke-width="11"/><circle cx="60" cy="60" r="54" fill="none" stroke="#fff8f1" stroke-width="11" stroke-linecap="round" stroke-dasharray="339" stroke-dashoffset="' + ringOffset + '" style="transition:stroke-dashoffset 1s ease"/></svg>' +
                '<div style="position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center"><span style="font-size:2.1rem;font-weight:700;line-height:1">' + band + '</span><span style="font-size:.72rem;opacity:.9">/ 300</span></div>' +
              '</div>' +
              '<div class="serif-cn" style="font-size:1.5rem;font-weight:700;margin-top:14px">' + esc(verdict) + '</div>' +
              '<div style="opacity:.9;font-size:.88rem;margin-top:2px">' + esc(verdictEn) + ' · ' + esc(fmtTime(s.elapsed || 0)) + '</div>' +
            '</div>') +
```

- [ ] **Step 3: Mobile — fix the "projected to /300" caption**

Replace the caption line at `app/exam.js:1220`:

```js
        '<div style="text-align:center;font-size:.74rem;color:var(--stone);margin-top:12px">' + total + ' auto-scored · projected to /300' + (writeQs.length ? ' · writing self-checked below' : '') + '</div>' +
```

with:

```js
        '<div style="text-align:center;font-size:.74rem;color:var(--stone);margin-top:12px">' + (sectioned ? (total + ' questions · section practice') : (total + ' auto-scored · projected to /300' + (writeQs.length ? ' · writing self-checked below' : ''))) + '</div>' +
```

- [ ] **Step 4: Desktop — add `sectioned` + `pct`, branch the hero**

In `app/desktop-exam.js` **`resultsTpl`** (opens at `:509`), insert the two vars **immediately after `var r = pass ? band / pass : 0;` (the line following your Task-3 edit, ~`:550`)**, where `s`/`sections`/`correct`/`total` are all in scope, and before the hero return at `:655`:

```js
    var sectioned = s.examSection && s.examSection !== 'all';
    var pct = total ? Math.round(correct / total * 100) : 0;
```

> **Do NOT use line 365** — that is inside `playerTpl` (a different function that already has its own `var sectioned`); `correct`/`total`/`sections` do not exist there. `resultsTpl` has no pre-existing `pct`, so declare it here.

Then wrap the hero block (`app/desktop-exam.js:658-675`, the `<div ... background:' + tier.bg + ...>` … through its closing `</div>`) so it is used only for a full paper, with a section hero for a drill:

```js
        (sectioned
          ? '<div style="background:linear-gradient(150deg,var(--accent),var(--accent-hover));color:var(--invert-fg);border-radius:22px;box-shadow:var(--shadow-lg);padding:30px 32px;text-align:center">' +
              '<div style="font-size:2.6rem;font-weight:800;line-height:1">' + pct + '%</div>' +
              '<div style="opacity:.92;font-size:var(--fs-md);margin-top:4px">' + correct + ' / ' + total + ' correct</div>' +
              '<div class="serif-cn" style="font-size:var(--fs-2xl);font-weight:700;margin-top:14px">' + esc((sections[0] && sections[0].cn) || '') + ' · ' + esc(s.examSection) + ' — practice</div>' +
              '<div style="opacity:.9;font-size:var(--fs-sm);margin-top:2px">Section practice — not a full-exam score · ⏱ ' + esc(fmtTime(s.elapsed || 0)) + '</div>' +
            '</div>'
          : /* existing full-paper hero, unchanged: */
            '<div style="position:relative;overflow:hidden;background:' + tier.bg + ';color:var(--invert-fg);border-radius:22px;box-shadow:var(--shadow-lg);padding:30px 32px;display:flex;align-items:center;gap:28px;flex-wrap:wrap">' +
              /* ...keep the entire current hero body verbatim (band circle, tier.cn/en/gap, stat chips, Next, projected-to line)... */
            '</div>') +
```

(Copy the current hero's inner markup verbatim into the `:` branch — do not retype it from memory; cut-and-paste the existing `app/desktop-exam.js:658-675` body.)

- [ ] **Step 5: Browser-verify both clients**

With the placeholder config swapped in: open `/app/`, start a paper, open a **Listening-only** drill and a **Reading-only** drill (from the intro sheet's section options), answer some, submit. Confirm: **no `/300` ring, no "恭喜通过!/Passed"**, the section card shows `NN%` + `x / y correct` + "Section practice — not a full-exam score". Then run the **full** paper and confirm the band + verdict still appear. Repeat on the other client. Confirm 0 console errors. Restore `config/auth.js`.

- [ ] **Step 6: Regression check — drill does not touch the dashboard**

After running a drill, return to the dashboard/Stats and confirm the estimate and history are unchanged (the never-persisted invariant). Both clients.

- [ ] **Step 7: Commit**

```bash
git add app/exam.js app/desktop-exam.js
git commit -m "fix(app): section drills show a section score, not a /300 band + Passed verdict (O1b)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 5 (O3): Close the `?pay=success` bypass without ejecting in-app renewers

**Files:**
- Modify: `auth.js` (add `armPayPending`, export it)
- Modify: `scripts/access-authjs.test.js` (lock the round-trip)
- Modify: `app/more.js` (arm the marker in `confirmPlan`)
- Modify: `auth-guard.js` (delete the `?pay=success` disjunct)

**Interfaces:**
- Produces: `HSKAuth.armPayPending()` — writes the durable `hsk_pay_pending` marker (`Date.now()`, 30-min TTL) that `HSKAuth.isPayPending()` (`auth.js:307`) reads.

> **Order matters:** arm the marker (steps 1–4) and wire `confirmPlan` (step 5) **before** deleting the guard disjunct (step 6), or an in-app renewal loses its grace.

- [ ] **Step 1: Write the failing test**

Add to `scripts/access-authjs.test.js`, using its **actual** harness: `loadAuth(clientStub)` (`scripts/access-authjs.test.js:6`) returns the window global `g`, exposes `g.HSKAuth`, and its localStorage mock is a fresh `Map` per call at `g.__ls` (so no reset is needed). `sessionClient()` is the existing client-stub helper (`:30`). Mirror the file's style:

```js
test('O3: armPayPending writes the durable marker so isPayPending() is true', () => {
  const g = loadAuth(sessionClient());
  assert.equal(g.HSKAuth.isPayPending(), false, 'no marker initially');
  g.HSKAuth.armPayPending();
  assert.equal(g.HSKAuth.isPayPending(), true, 'armed -> pending within TTL');
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `node --test scripts/access-authjs.test.js`
Expected: FAIL — `HSKAuth.armPayPending is not a function`.

- [ ] **Step 3: Implement `armPayPending` in `auth.js`**

Add next to `isPayPending` (after `app/../auth.js:312`):

```js
  function armPayPending() {
    try { global.localStorage.setItem(PAY_PENDING_KEY, String(Date.now())); } catch (e) {}
  }
```

Export it in the `HSKAuth` public object (the block around `auth.js:579` that lists `isPayPending`):

```js
    armPayPending,
```

- [ ] **Step 4: Run to verify pass**

Run: `node --test scripts/access-authjs.test.js`
Expected: PASS.

- [ ] **Step 5: Arm the marker in the in-app checkout (`app/more.js`)**

In `A.confirmPlan` (`app/more.js:946`), immediately before the PSP redirect line `try { location.href = url; } catch (e) {}` (`app/more.js:966`), add:

```js
    /* arm the durable pay-pending marker so the /app/?pay=success return
       gets grace via HSKAuth.isPayPending() — mirrors onboarding.js
       handlePaySuccess; lets auth-guard drop the forgeable ?pay=success param */
    try { if (window.HSKAuth && HSKAuth.armPayPending) HSKAuth.armPayPending(); } catch (e2) {}
```

- [ ] **Step 6: Delete the `?pay=success` disjunct in `auth-guard.js`**

At `auth-guard.js:128`, change:

```js
        payPending: (HSKAuth.isPayPending && HSKAuth.isPayPending()) || /[?&]pay=success/.test(window.location.search),
```

to:

```js
        payPending: (HSKAuth.isPayPending && HSKAuth.isPayPending()),
```

- [ ] **Step 7: Run the full suite**

Run: `node --test scripts/*.test.js`
Expected: all green.

- [ ] **Step 8: Browser-verify both paths (real config, or a mock session)**

This is guard-level → must be browser-checked:
- **Bypass closed:** as a signed-in **non-subscriber** with no marker, load `/app/?pay=success` → redirected to `/quiz/?sub=required` (not admitted).
- **In-app renewal grace:** trigger `confirmPlan` (or manually `HSKAuth.armPayPending()` in the console), then load `/app/?pay=success` → app renders (pay-pending grace), no funnel bounce.

- [ ] **Step 9: Commit**

```bash
git add auth.js scripts/access-authjs.test.js app/more.js auth-guard.js
git commit -m "fix(app): close ?pay=success bypass; arm durable marker for in-app renewal (O3)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 6 (M3): Mask profile PII from Yandex Webvisor

**Files:**
- Modify: `app/more.js` (5 sites)
- Modify: `app/desktop-more.js` (4 sites)

**Interfaces:**
- Consumes: the funnel's masking convention — display PII gets `ym-hide-content`; editable PII inputs get `ym-disable-keys ym-hide-content` (onboarding.js:653/681).
- Produces: nothing consumed later. Pure attribute additions; no logic change.

> Webvisor (`webvisor:true`, `app/index.html:47`) records DOM + keystrokes. The **editable Name/Country inputs** are the highest-value capture surface; the email inputs are `disabled` (masked for value-completeness only).

- [ ] **Step 1: Mobile display sites (`app/more.js`) — add `ym-hide-content` to BOTH the name and email `<div>`s**

Two profile cards, at `app/more.js:160` and `app/more.js:723`, each render a **name** div then an **email** div in one flow. Mask **both** on each line (the funnel masks the name too; the desktop card in Step 3 masks its name div — keep it symmetric).

- Name div (`:160` uses `font-size:1.05rem`, `:723` uses `font-size:1.1rem`): add `class="ym-hide-content"`, e.g.
  `'<div class="ym-hide-content" style="font-weight:700;color:var(--ink);font-size:1.05rem">' + esc(pv.name) + '</div>'`.
- Email div (both lines): add `class="ym-hide-content"`, e.g.
  `'<div class="ym-hide-content" style="font-size:.82rem;color:var(--stone);white-space:nowrap;overflow:hidden;text-overflow:ellipsis">' + esc(pv.email) + '</div>'`.

- [ ] **Step 2: Mobile editable inputs (`app/more.js`) — add masking to Name, Country, Email**

At `app/more.js:757` (Name input) add `class="ym-disable-keys ym-hide-content"`:

```js
'...<input type="text" class="ym-disable-keys ym-hide-content" value="' + esc(draft.name) + '" data-in="onDraftName" style="...">...'
```

At `app/more.js:759` (Country input) likewise:

```js
'...<input type="text" class="ym-disable-keys ym-hide-content" value="' + esc(draft.country) + '" data-in="onDraftCountry" style="...">...'
```

At `app/more.js:758` (disabled Email input) add `class="ym-hide-content"` (value-masking; it can't take keystrokes):

```js
'...<input type="email" class="ym-hide-content" value="' + esc(draft.email) + '" disabled style="...">...'
```

- [ ] **Step 3: Desktop display site (`app/desktop-more.js:391`) — wrap name/email/country**

The profile card renders name, email, country in one flow. Add `ym-hide-content` to the email and country `<div>`s (and the name `<div>` for parity with the funnel). Change `app/desktop-more.js:391` so the email div is `<div class="ym-hide-content" style="font-size:var(--fs-sm);color:var(--stone)">' + esc(pv.email) + '</div>'` and the country div is `<div class="ym-hide-content" style="font-size:var(--fs-sm);color:var(--stone);margin-top:2px">📍 ' + esc(pv.country || '—') + '</div>` and the name div gets `class="ym-hide-content"`.

- [ ] **Step 4: Desktop editable inputs (`app/desktop-more.js`) — extend the `field` class**

At `app/desktop-more.js:477` (Name, `id="pe-name" class="field"`) → `class="field ym-disable-keys ym-hide-content"`.
At `app/desktop-more.js:482` (Country, `id="pe-country" class="field"`) → `class="field ym-disable-keys ym-hide-content"`.
At `app/desktop-more.js:479` (disabled Email, no class) → add `class="ym-hide-content"`.

- [ ] **Step 5: Grep to confirm no editable PII input is left unmasked**

Run:
```bash
grep -nE 'onDraftName|onDraftCountry|id="pe-(name|country)"' app/more.js app/desktop-more.js
```
Expected: every matching `<input>` line also contains `ym-disable-keys ym-hide-content`.

- [ ] **Step 6: Browser-verify (both clients)**

With the placeholder config: open `/app/` → More/Profile and the Edit-profile sheet. Confirm via DOM inspection that the email/name/country display nodes carry `ym-hide-content` and the editable Name/Country inputs carry both classes. Restore `config/auth.js`.

- [ ] **Step 7: Commit**

```bash
git add app/more.js app/desktop-more.js
git commit -m "fix(app): mask profile PII (name/email/country) from Webvisor (M3)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Post-implementation (before deploy — not part of the six tasks)

1. `node --test scripts/*.test.js` → all green; `deno test supabase/functions/*/lib.test.ts` → green (unchanged).
2. `node build.js` && `node scripts/inject-auth.js` → commit the regenerated `sitemap.xml` (lastmod) and confirm **0 generated-page content drift** + all `body.app` pages still carry the auth block.
3. **O5** is NOT in this plan — schedule its own reviewed spec+plan cycle (see the spec's O5 §Risk).
4. Merge `claude/dev → main`, push (DO auto-deploys), run the spec's prod smoke checks — **especially** the O3 in-app "Extend access" renewal return and the non-subscriber `/app/?pay=success` bounce.

---

## Self-Review

**Spec coverage:** O1b → Task 4; O3 → Task 5; M3 → Task 6; M4 → Task 1; M5 → Task 3; M6 → Task 2. O5 explicitly deferred (documented). All six shippable spec items have a task. ✓

**Placeholder scan:** every code step shows complete code. Post plan-review (`wf_d8a17976-8d6`) fixes: T5 Step 1 now uses the real `loadAuth(sessionClient())`→`g.HSKAuth`/`g.__ls` harness (was a wrong `{store}` shape); T4 Step 4 anchor corrected from the wrong function (`playerTpl` :365) to inside `resultsTpl` after `:550`; T3 Step 5 now preserves the interleaved `var wrong` (:549); T6 Step 1 now masks the name divs too. The only remaining cut-and-paste instruction (T4 Step 4, desktop full-paper hero body) is deliberate — reuse the verbatim existing block to avoid drift, with exact file:line given. ✓

**Type consistency:** `App.exam.gradeSections(secList) → {band,pass,passed,ratio,tierKey}` is produced in Task 3 and consumed in Task 4 (`_g.band/_g.passed/_g.ratio`). `HSKAuth.armPayPending()` produced in Task 5 Step 3, consumed in Step 5. `sectioned = s.examSection && s.examSection !== 'all'` used consistently in both clients. ✓
