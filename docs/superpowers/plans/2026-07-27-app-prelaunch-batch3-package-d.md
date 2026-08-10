# Package D — client robustness (F4, F5, F11, F12) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stop four silent failure modes in the `/app/` client — a failed audio clip burning an exam play, a dead character engine leaving live buttons over a blank box, a lost module producing a blank tab nobody reports, and a second browser tab erasing the first one's work.

**Architecture:** Four independent robustness fixes. F4 and F12 change `app/exam.js` (plus `app/vocab.js` for F12); F5 changes `app/more.js`; F11 changes `app/core.js` and — uniquely in this batch — **`app/index.html`**, the hand-maintained `body.app` page. Each item gets its own zero-dep test file driving the real module: a mocked `Audio` element for F4, a fake `HanziWriter` for F5, a shared fake store for F12, and a pure seam-list plus structural assertions on the served HTML for F11.

**Tech Stack:** Plain ES5 IIFE modules, no bundler, no npm. Tests are Node's built-in `node:test`, zero dependencies.

**Spec:** `docs/superpowers/specs/2026-07-26-app-prelaunch-batch3-design.md` § "Package D — client robustness".

---

## Ground truth — verified against HEAD `29399131`, not the spec

Every line number below was re-read at the current HEAD. As in the Package B and C plans, **every edit is anchored on a verbatim string, not a line number**.

### Confirmed exactly as the spec describes

| Item | Site at HEAD | Verified |
|---|---|---|
| F4 | `app/exam.js:747-748` | the debit, inside `playClip` (`:725-750`) |
| F4 | `app/exam.js:360-363` | `clipFail`, with **no re-entry guard** |
| F4 | `app/exam.js:388-391` | `onAudioError`, guarded only by `ex._mode` |
| F4 | `app/exam.js:743` | `p.catch(function () { clipFail(); })` — **unguarded**, the second invocation |
| F4 | `app/exam.js:734` | the 2-play early return; budget is `state.audioPlays[i]` |
| F5 | `app/more.js:314` | `glyphFallback` — the library-load fallback that already exists |
| F5 | `app/more.js:319-339` | `initWriter`; `:337` `HanziWriter.create` with **no** `onLoadCharDataError` |
| F11 | `app/index.html:93` | boot assert covers only `core`/`shell`/`data` |
| F11 | `app/index.html:62` | the `error` listener registered **without** capture |
| F11 | `app/index.html:61` | `report()` increments `n` even when `ymGoal` is undefined; `ymGoal` is defined at `:48` |
| F12 | `app/exam.js:499`, `:635`, `:650`, `:674-675` | all four progress/attempts writers serialise the tab's own in-memory map |
| F12 | `app/vocab.js:94` | `persistMastered` overwrites the whole set (spec said `:90` — **+4**, my F3 `DECK()` insert) |

### Corrections that change the work

1. **The spec's "RMW union" for `mastered` would break un-mastering.** `toggleMastered` (`app/vocab.js:407`) removes an id; unioning the result with storage resurrects it, so the user could never un-master anything. The write must be a **delta** — keep the stored set, drop what *this* tab removed, add what *this* tab has. Mutation-verified: implementing the spec's literal union fails two tests in `exam-multitab.test.js`.
2. **The spec's F4 harm description is wrong in detail, and it changes the test.** It says a naive refund nets "**−1** per failed attempt". With the natural zero-clamp (`if (n > 0) plays[q] = n; else delete plays[q]`) the count never goes negative, so a test that merely fires the failure twice from zero **passes even with a broken, non-one-shot refund** — I confirmed this. The real harm appears only when a play was already legitimately spent: refund #2 then claws back the *earlier, genuine* listen. The one-shot marker is still required; the test that pins it must set up a prior successful play.
3. **Moving the error boundary to the top of `<head>` would break character encoding.** `<meta charset="utf-8">` currently sits at byte **538**, leaving only 486 bytes of headroom, and the boundary block is ~1.4 KB. Pushing charset past the 1024-byte sniffing window risks the browser mis-detecting the encoding of a page full of Chinese. **`<meta charset>` moves to the very first line of `<head>`**, before the boundary. Guarded by a test.
4. **F5's "disable the buttons" must not go through `setState`.** A re-render recreates `#hw-target`, which re-runs `initWriter`, which re-fetches the stroke data that just failed — an infinite retry loop. The disable is direct DOM, exactly as the existing `glyphFallback` already does, and `initWriter` early-returns for a character already known bad. Guarded by a test.
5. **F11 edits `app/index.html`, so `node scripts/inject-auth.js` must be re-run** (project rule: it is `body.app`). Verified it is a **no-op** today — `injectHead` early-returns on the exact `SB_TAG` already present — and the new ordering keeps the auth block after the theme loader, so a future Supabase bump still injects correctly. Run it anyway and assert 0 changes.

### Prototype validation

Every edit and all four test files below were applied to an isolated copy in a scratch directory and run before this plan was written:

| File | RED (unpatched HEAD) | GREEN |
|---|---|---|
| `exam-playcap.test.js` (11) | 6 fail / 5 pass | 11 pass |
| `hanzi-fallback.test.js` (10) | 10 fail | 10 pass |
| `boot-seams.test.js` (13) | 10 fail / 3 pass | 13 pass |
| `exam-multitab.test.js` (8) | 7 fail / 1 pass | 8 pass |

Full suite with all of Package D applied: **187 tests, 187 pass, 0 fail** (145 existing + 42 new), `node --check` clean on all four changed `.js` files, and `node scripts/inject-auth.js` reports **"Updated 0 pages"** with `app/index.html` byte-identical afterwards. Seven adversarial mutants are killed by these tests: the spec's literal `mastered` union; a non-one-shot refund; a refund that does not distinguish a deliberate stop; a `fallback()` still gated on an empty shell; a stale hanzi callback with no freshness check; a charset guard matching prose instead of the tag; and a collapsed third-party report cap. The working tree was never modified.

The RED files that partly pass do so by design — those cases assert behaviour the fix must *preserve* (a normal clip still costs one play; un-mastering already worked; a fully-loaded app has no missing seams). They are regression guards, not RED tests.

---

## Global Constraints

- **ES5 only** in `app/*.js` and in the inline scripts in `app/index.html`: `var`, `function` declarations, no arrow functions, no `let`/`const`, no template literals. Test files are Node-only.
- **No npm, no bundler, no linter.** Tests use `node:test` + `node:assert/strict` + `node:path` (+ `node:fs` for F11's HTML assertions).
- **`node build.js` is NOT needed** — no `data/*.json` and no generator changes. **`node scripts/inject-auth.js` IS required** after Task 3 (it touches `app/index.html`), and must report 0 changed pages.
- **Read `App.*` at call time**, never cache at module load.
- Test command: `node --test scripts/*.test.js`. Baseline at HEAD: **145 pass**.
- Commit messages end with: `Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>`

## File Structure

| File | Change | Task |
|---|---|---|
| `app/exam.js` | F4 refund machinery; F12 `storeGet` + two RMW helpers + 4 write sites | 1, 4 |
| `scripts/exam-playcap.test.js` | **new** — 11 F4 tests | 1 |
| `app/more.js` | F5 stroke-data hook, control disable, guarded actions | 2 |
| `scripts/hanzi-fallback.test.js` | **new** — 10 F5 tests | 2 |
| `app/core.js` | F11 `App.missingSeams` | 3 |
| `app/index.html` | F11 charset first, error boundary, boot assert | 3 |
| `scripts/boot-seams.test.js` | **new** — 13 F11 tests | 3 |
| `app/vocab.js` | F12 `persistMastered` delta merge | 4 |
| `scripts/exam-multitab.test.js` | **new** — 8 F12 tests | 4 |

**Task order:** F4 → F5 → F11 → F12. F4 and F12 both edit `app/exam.js` but never the same lines; F4 first because F12's `writeProgressSlot` rewrites `persistLive`, which F4's refund calls. Doing F12 first would make F4's anchors stale.

### Deliberately NOT changed

- **`app/sync.js`** — the cross-**device** merge. F12 is same-device only: `localStorage` is synchronously readable, so no tombstones are needed. The cross-device case (concurrent add lost, per-item stamps) is package F's job and is explicitly out of scope here.
- **Desktop module seams** in `App.missingSeams` — if `desktop-shell.js` is lost, `App.screens.shell` is still `shell.js`'s, so the app degrades to the mobile UI rather than going blank. That is not the failure F11 guards.
- **The `playing`-based debit the audit proposed** — `playing` fires again after every buffer stall, so a stalling 6.5 MB WAV on mobile data would debit two or three plays for one listen. The debit stays on start; only the refund is new.

---

## Task 1: F4 — a failed clip must not burn an exam-mode play

**Files:**
- Modify: `app/exam.js` — `ex` object (HEAD `:332`), `ensureAudio` (`:342`), `clipFail` (`:360-363`), `playClip` (`:738`, `:747-748`)
- Test: `scripts/exam-playcap.test.js` (**new**)

**Interfaces:**
- Consumes: nothing.
- Produces: two new fields on the module-private `ex` object — `_clipStarted` (boolean, set by a new `playing` listener) and `_clipDebit` (`{q: number}` or `null`, the one-shot marker). Neither is exported; the behaviour is observed through `App.state.audioPlays`.

- [ ] **Step 1: Write the failing test**

Create `scripts/exam-playcap.test.js` with exactly this content:

```js
/* Package D / F4: a listening clip that never becomes audible must not burn one
   of the exam-mode 2 plays — and the refund must be ONE-SHOT, because clipFail
   runs twice for a single failed clip (the media 'error' event AND the rejected
   play() promise). A refund gated only on "never started" would net -1 per
   failed attempt: a farmable cap on a flaky media host.
   Drives the REAL app/exam.js playClip through a mocked Audio element.
   Run: node --test scripts/exam-playcap.test.js */
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

function L(number) {
  return { type: 'listening_choice', number: number, audio: 'https://media/x' + number + '.mp3',
           options: ['a', 'b', 'c', 'd'], correct_answer_index: 0, text: 'listen ' + number };
}
function rawPaper() { return { questions: [L(1), L(2), L(3)] }; }

/* Minimal Audio double: records listeners so the test can fire the real handlers,
   and lets each test choose whether play() resolves or rejects. */
function makeAudio(store) {
  return function Audio() {
    const el = {
      _h: {}, preload: '', src: '', currentTime: 0, paused: true,
      addEventListener(k, fn) { (el._h[k] = el._h[k] || []).push(fn); },
      removeAttribute() { el.src = ''; },
      /* a real element REJECTS the pending play() promise when it is interrupted
         ("The play() request was interrupted by a call to pause()") */
      load() { store.interrupt(); },
      pause() { el.paused = true; store.interrupt(); },
      play() {
        el.paused = false;
        if (!store.pendingPlay) return store.playResult();
        return new Promise(function (_, rej) { store._rej = rej; });
      },
      fire(k) { (el._h[k] || []).slice().forEach((fn) => fn()); },
    };
    store.el = el;
    return el;
  };
}

function boot(opts) {
  opts = opts || {};
  const store = {
    playResult: opts.playResult || (() => Promise.resolve()),
    pendingPlay: !!opts.pendingPlay, _rej: null, el: null, written: {},
    interrupt() { if (store._rej) { const r = store._rej; store._rej = null; r(new Error('interrupted')); } },
  };
  const savedSI = global.setInterval, savedCI = global.clearInterval, savedAudio = global.Audio;
  global.setInterval = () => 0;
  global.clearInterval = () => {};
  global.Audio = makeAudio(store);
  const App = {
    data: { TESTS: [{ official: false }], questionsFor: () => rawPaper() },
    state: Object.assign({
      testIdx: 0, examMode: 'exam', examSection: 'all', examView: 'player',
      curQ: 0, answers: {}, flags: {}, elapsed: 0, audioPlays: {}, progress: {},
    }, opts.state || {}),
    setState(patch) { Object.assign(App.state, patch); },
    keys: { progress: 'hsk4-exam-progress', attempts: 'hsk4-attempts' },
    store: { setJSON(k, v) { store.written[k] = v; }, getJSON(k, fb) { return k in store.written ? store.written[k] : fb; } },
  };
  global.window = { App };
  global.document = { addEventListener() {}, querySelector() { return null; }, querySelectorAll() { return []; } };
  const p = path.resolve(__dirname, '../app/exam.js');
  delete require.cache[require.resolve(p)];
  require(p);
  App.exam.load(0);
  App._store = store;
  App._restore = () => { global.setInterval = savedSI; global.clearInterval = savedCI; global.Audio = savedAudio; };
  return App;
}
const plays = (App) => (App.state.audioPlays || {})[0] || 0;

test('F4: a clip that plays normally still costs exactly one play', () => {
  const App = boot();
  App.actions.playClip();
  App._store.el.fire('playing');
  assert.equal(plays(App), 1);
  App._restore();
});

test('F4 REGRESSION: a clip that never becomes audible is refunded', () => {
  const App = boot();
  App.actions.playClip();
  assert.equal(plays(App), 1, 'debited on start (so navigating away cannot reset the cap)');
  App._store.el.fire('error');                 // media error: 'playing' never fired
  assert.equal(plays(App), 0, 'refunded — the user heard nothing');
  App._restore();
});

test('F4 REGRESSION: the refund is ONE-SHOT — clipFail really does run twice', async () => {
  /* The genuine double-fire, and the ONLY one that reaches clipFail twice:
     a bad src fires the media 'error' event (-> onAudioError -> clipFail #1,
     which nulls ex._mode) AND rejects play(), whose p.catch calls clipFail
     UNCONDITIONALLY — onAudioError's !ex._mode guard does not protect it.
     A refund gated only on "never started" fires in both: one debit, two
     refunds, net -1 per failed attempt = a farmable cap. */
  const App = boot({ playResult: () => Promise.reject(new Error('no media')) });
  App.actions.playClip();
  assert.equal(plays(App), 1, 'debited on start');

  App._store.el.fire('error');                 // clipFail #1 (via onAudioError)
  assert.equal(plays(App), 0, 'refunded once');
  await Promise.resolve(); await Promise.resolve();   // let p.catch -> clipFail #2 run

  assert.equal(plays(App), 0, 'STILL zero — the second clipFail must not refund again');
  assert.ok(!((App.state.audioPlays || {})[0] < 0), 'the budget can never go negative');
  App._restore();
});

test('F4: repeated failures do not farm extra plays (the cap still binds)', async () => {
  const App = boot({ playResult: () => Promise.reject(new Error('no media')) });
  for (let round = 0; round < 3; round++) {
    App.actions.playClip();
    App._store.el.fire('error');               // the real double-fire, every round:
    await Promise.resolve(); await Promise.resolve();   // error event + rejected play()
    assert.equal(plays(App), 0, 'round ' + round + ': still zero, never negative');
  }
  App._store.playResult = () => Promise.resolve();
  /* budget intact: two real listens are still available, a third is refused */
  App.actions.playClip(); App._store.el.fire('playing');
  App.state.audioPlaying = false;
  App.actions.playClip(); App._store.el.fire('playing');
  App.state.audioPlaying = false;
  assert.equal(plays(App), 2);
  App.actions.playClip();
  assert.equal(plays(App), 2, 'the 2-play lock still refuses a third');
  App._restore();
});

test('F4 REGRESSION: a double refund cannot claw back an ALREADY-SPENT play', async () => {
  /* The case the zero-clamp does NOT mask, and the reason the marker is one-shot:
     the user has already listened once (plays = 1), plays a second time, and THAT
     clip dies. One refund is correct (back to 1). A second refund would hand back
     the first, genuinely-used listen — the farm. */
  const App = boot();
  App.actions.playClip();                       // listen 1: succeeds
  App._store.el.fire('playing');
  App.state.audioPlaying = false;
  assert.equal(plays(App), 1, 'one play legitimately spent');

  App._store.playResult = () => Promise.reject(new Error('no media'));
  App.actions.playClip();                       // listen 2: never becomes audible
  assert.equal(plays(App), 2);
  App._store.el.fire('error');                  // clipFail #1 -> refund to 1
  await Promise.resolve(); await Promise.resolve();   // clipFail #2 via p.catch

  assert.equal(plays(App), 1, 'the SPENT first listen is not refunded by the second call');
  App._restore();
});

test('F4: a mid-clip stall keeps its debit (the rejected "playing"-debit design)', () => {
  /* 'playing' fires again after every buffer stall; debiting there would charge
     2-3 plays for one listen. Here: it played, then failed -> NO refund. */
  const App = boot();
  App.actions.playClip();
  App._store.el.fire('playing');               // audible
  App._store.el.fire('error');                 // died mid-clip
  assert.equal(plays(App), 1, 'the user heard it — the play is spent');
  App._restore();
});

test('F4: the refund is keyed to the clip that was debited, not the live curQ', () => {
  const App = boot();
  App.actions.playClip();                       // debits Q index 0
  App.state.curQ = 2;                           // user navigates while it fails
  App._store.el.fire('error');
  assert.equal((App.state.audioPlays || {})[0] || 0, 0, 'Q0 refunded');
  assert.equal((App.state.audioPlays || {})[2] || 0, 0, 'Q2 untouched');
  App._restore();
});

test('F4: the refund is persisted, so a reload cannot resurrect the debit', () => {
  const App = boot();
  App.actions.playClip();
  App._store.el.fire('error');
  const saved = App._store.written['hsk4-exam-progress'];
  assert.ok(saved && saved[0], 'progress was written');
  assert.equal((saved[0].audioPlays || {})[0] || 0, 0, 'the stored budget shows the refund');
  App._restore();
});

test('F4: practice mode is uncapped and unaffected', () => {
  const App = boot({ state: { examMode: 'practice' } });
  for (let i = 0; i < 4; i++) { App.actions.playClip(); App._store.el.fire('playing'); App.state.audioPlaying = false; }
  assert.equal(plays(App), 4, 'no cap outside exam mode');
  App._restore();
});

test('F4 REGRESSION: navigating away mid-load KEEPS the debit (the cap stays honest)', async () => {
  /* A DELIBERATE stop also rejects the pending play() promise — stopClip() calls
     pause()/load() — and that rejection reaches the same unguarded p.catch.
     Refunding there would let a user start a clip, tap Next, and never spend a
     play: the exact invariant the start-side debit exists to protect. */
  const App = boot({ pendingPlay: true });      // play() stays pending, like a slow clip
  App.actions.playClip();
  assert.equal(plays(App), 1, 'debited on start');
  App.actions.nextQ();                          // navKeep -> stopClip -> pause() rejects play()
  await Promise.resolve(); await Promise.resolve();
  assert.equal(plays(App), 1, 'STILL spent — navigating away cannot reset the cap');
  App._restore();
});

test('F4 REGRESSION: repeated start-then-navigate cannot farm the cap', async () => {
  const App = boot({ pendingPlay: true });
  for (let i = 0; i < 6; i++) {
    App.state.curQ = 0; App.state.audioPlaying = false;
    App.actions.playClip();
    App.state.curQ = 0;
    App.actions.nextQ();
    await Promise.resolve(); await Promise.resolve();
  }
  assert.ok(plays(App) >= 2, 'the 2-play cap still binds; got ' + plays(App));
  App._restore();
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `node --test scripts/exam-playcap.test.js`
Expected: `tests 11`, `pass 5`, `fail 6`. The five that pass assert behaviour the fix must **preserve**, not add: a normal clip costs one play, a mid-clip stall keeps its debit, practice mode is uncapped, and — critically — the two navigate-away cases, which already hold at HEAD and which a careless refund would break.

- [ ] **Step 3: Add the refund state to the `ex` object**

In `app/exam.js`, replace this exact line (HEAD `:332`):

```js
  var ex = { audioEl: null, _mode: null, _trackTest: null, _clipQ: null };
```

with:

```js
  /* _clipStarted: did this clip ever produce audible playback ('playing' fired)?
     _clipDebit:   one-shot marker for the play debited on start, consumed by the
                   refund. clipFail runs TWICE for one bad clip (the media error
                   event AND the rejected play() promise), so a refund gated only
                   on _clipStarted would fire twice and claw back an earlier,
                   legitimately-spent listen. (F4) */
  var ex = { audioEl: null, _mode: null, _trackTest: null, _clipQ: null, _clipStarted: false, _clipDebit: null };
```

- [ ] **Step 4: Listen for `playing`**

In `app/exam.js`, replace this exact line (HEAD `:342`):

```js
      el.addEventListener('error', onAudioError);
```

with:

```js
      el.addEventListener('playing', onAudioPlaying);
      el.addEventListener('error', onAudioError);
```

- [ ] **Step 5: Refund in `clipFail`, once**

In `app/exam.js`, replace this exact block (HEAD `:360-363`):

```js
  function clipFail() {
    stopClip({ full: true });
    App.setState({ audioPlaying: false, audioProg: 0, audioErr: true });
  }
```

with:

```js
  /* A clip that never became audible must not burn one of the exam-mode 2 plays.
     Refund the debit recorded on start — ONCE (see ex._clipDebit above) — and only
     when 'playing' never fired, so a mid-clip stall (waiting -> playing) keeps its
     debit. Keyed to the debit's own question index, never the live curQ, which may
     have changed. Persisted, because the debit itself was. (F4) */
  function clipFail() {
    var patch = { audioPlaying: false, audioProg: 0, audioErr: true };
    var d = ex._clipDebit;
    ex._clipDebit = null;                       /* one-shot: consumed on the FIRST call */
    /* Refund ONLY a genuine media failure. A DELIBERATE stop — navigating away
       mid-load — also rejects the pending play() promise, and that rejection
       reaches the same unguarded p.catch. stopClip() nulls ex._mode, so a live
       'clip' mode still pointing at the debited question is what distinguishes
       "the clip died" from "the user left": without this, starting a clip and
       tapping Next would hand the play back, and the 2-play cap would be
       farmable — the very invariant the start-side debit exists to protect. */
    var refund = !!d && !ex._clipStarted && ex._mode === 'clip' && ex._clipQ === d.q;
    if (refund) {
      var s = stateOf();
      var plays = assign({}, s.audioPlays);
      var n = (plays[d.q] || 0) - 1;
      if (n > 0) plays[d.q] = n; else delete plays[d.q];
      patch.audioPlays = plays;
    }
    stopClip({ full: true });
    App.setState(patch);
    if (refund) persistLive();                  /* the refund must survive a reload */
  }

  function onAudioPlaying() {
    if (ex._mode === 'clip') ex._clipStarted = true;
  }
```

- [ ] **Step 6: Reset the flags when a clip starts**

In `app/exam.js`, replace this exact line (HEAD `:738`):

```js
    ex._mode = 'clip'; ex._clipQ = i;
```

with:

```js
    ex._mode = 'clip'; ex._clipQ = i;
    ex._clipStarted = false; ex._clipDebit = null;
```

- [ ] **Step 7: Record the debit as refundable**

In `app/exam.js`, replace this exact block (HEAD `:747-748`):

```js
    var plays = assign({}, s.audioPlays); plays[i] = (plays[i] || 0) + 1;
    App.setState({ audioPlaying: true, audioProg: 0, audioErr: false, audioPlays: plays });
```

with:

```js
    var plays = assign({}, s.audioPlays); plays[i] = (plays[i] || 0) + 1;
    ex._clipDebit = { q: i };                   /* refundable by clipFail if it never plays (F4) */
    App.setState({ audioPlaying: true, audioProg: 0, audioErr: false, audioPlays: plays });
```

- [ ] **Step 8: Run the test to verify it passes**

Run: `node --test scripts/exam-playcap.test.js`
Expected: `tests 11`, `pass 11`, `fail 0`.

- [ ] **Step 9: Check syntax and run the whole suite**

Run:

```bash
node --check app/exam.js && node --test scripts/*.test.js
```

Expected: no syntax output, then `tests 156`, `pass 156`, `fail 0`.

- [ ] **Step 10: Commit**

```bash
git add app/exam.js scripts/exam-playcap.test.js
git commit -F - <<'EOF'
fix(app): a clip that never plays no longer burns an exam play (F4)

The play was debited on start — correctly, so navigating away mid-clip
cannot reset the 2-play cap — but nothing refunded it when the clip never
became audible. A media-host hiccup, an offline blip or a stalled 6.5 MB
WAV therefore greyed the question's audio out for the rest of the attempt.

The debit stays on start. A new 'playing' listener records whether the clip
was ever audible, and clipFail refunds only when it was not, so a mid-clip
buffer stall keeps its debit — the audit's proposal to debit on 'playing'
is rejected, because 'playing' fires again after every stall and would
charge two or three plays for one listen.

The refund is ONE-SHOT. clipFail really does run twice for one bad clip:
the media 'error' event reaches it through onAudioError, and the rejected
play() promise reaches it through an unguarded p.catch — onAudioError's
!ex._mode guard does not protect the second path. Without the marker the
second call claws back an earlier, legitimately-spent listen.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
```

---

## Task 2: F5 — a failed stroke-data fetch must not leave live buttons over a blank box

**Files:**
- Modify: `app/more.js` — writer state (HEAD `:311`), `initWriter` (`:319-339`), the three `hw*` actions (`:880-882`), exports (`:352`)
- Test: `scripts/hanzi-fallback.test.js` (**new**)

**Interfaces:**
- Consumes: nothing.
- Produces: `App.chars.unavailable()` → boolean, exported for the test. The behaviour under test is the `onLoadCharDataError` callback passed to `HanziWriter.create`, plus the disabled state of `[data-a="hwAnimate"]` / `[data-a="hwQuiz"]`.

**Why the disable is direct DOM and not `setState`:** a re-render recreates `#hw-target`, which re-runs `initWriter`, which re-fetches the stroke data that just failed — an infinite retry loop. `glyphFallback` already writes the DOM directly for the same reason. `initWriter` additionally early-returns for a character already known bad.

- [ ] **Step 1: Write the failing test**

Create `scripts/hanzi-fallback.test.js` with exactly this content:

```js
/* Package D / F5: HanziWriter.create mounts its empty <svg> synchronously and
   only THEN fetches the per-character stroke JSON. The library-load fallback
   (glyphFallback) existed; the data-fetch failure had no handler, so the user
   got an empty box with live Animate/Practice buttons.
   Drives the REAL app/more.js against a fake HanziWriter.
   Run: node --test scripts/hanzi-fallback.test.js */
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

function el(attrs) {
  const e = {
    _attrs: attrs || {}, innerHTML: '', style: {}, disabled: false, nodeType: 1,
    getAttribute(n) { return Object.prototype.hasOwnProperty.call(e._attrs, n) ? String(e._attrs[n]) : null; },
    setAttribute(n, v) { e._attrs[n] = String(v); },
    getClientRects() { return [{}]; }, focus() {},
  };
  return e;
}

function boot(opts) {
  opts = opts || {};
  const target = el({ id: 'hw-target' });
  const animate = el({ 'data-a': 'hwAnimate' });
  const quiz = el({ 'data-a': 'hwQuiz' });
  const created = [];
  const App = {
    util: {}, screens: {}, sheets: {}, overlays: {}, actions: {}, gestures: {}, more: {}, chars: {},
    state: { tab: 'more', moreView: 'characters', curChar: opts.char || '爱', theme: 'light', guideDone: [] },
    data: { CHARS: [], WORDS: [], TESTS: [] },
    keys: { mastered: 'm', guide: 'g' },
    store: { get() { return null; }, set() {}, del() {}, getJSON(_k, fb) { return fb; }, setJSON() {} },
    setState(p) { Object.assign(App.state, p); }, update() {}, render() {}, live() {}, sub() { return ''; },
  };
  const HW = opts.noLibrary ? undefined : {
    create(node, ch, cfg) {
      created.push({ node, ch, cfg });
      const inst = { animateCharacter() { inst.animated = (inst.animated || 0) + 1; }, quiz() { inst.quizzed = (inst.quizzed || 0) + 1; } };
      inst.cfg = cfg;
      created.inst = inst;
      return inst;
    },
  };
  global.window = { App, HanziWriter: HW, addEventListener() {}, matchMedia() { return { matches: false, addEventListener() {} }; } };
  global.document = {
    addEventListener() {},
    getElementById(id) { return id === 'hw-target' ? target : null; },
    querySelector() { return null; },
    querySelectorAll(sel) {
      if (sel.indexOf('hwAnimate') !== -1) return [animate];
      if (sel.indexOf('hwQuiz') !== -1) return [quiz];
      return [];
    },
    createElement() { return el(); },
  };
  const p = path.resolve(__dirname, '../app/more.js');
  delete require.cache[require.resolve(p)];
  require(p);
  return { App, target, animate, quiz, created };
}

test('F5: the stroke-data error hook is actually passed to HanziWriter.create', () => {
  const t = boot();
  t.App.chars.initWriter();
  assert.equal(t.created.length, 1, 'the writer was created');
  assert.equal(typeof t.created[0].cfg.onLoadCharDataError, 'function',
    'onLoadCharDataError must be supplied — this is the whole fix');
});

test('F5 REGRESSION: a failed stroke-data fetch paints the static glyph, not a blank box', () => {
  const t = boot({ char: '爱' });
  t.App.chars.initWriter();
  assert.equal(t.target.innerHTML, '', 'create() left the box to the library');
  t.created[0].cfg.onLoadCharDataError(new Error('404'));
  assert.match(t.target.innerHTML, /爱/, 'the character is painted statically');
  assert.equal(t.target.getAttribute('data-hw-char'), '爱');
});

test('F5 REGRESSION: Animate and Practice are disabled when the engine is unavailable', () => {
  const t = boot();
  t.App.chars.initWriter();
  assert.equal(t.animate.disabled, false, 'live while the engine works');
  assert.equal(t.animate.getAttribute('aria-disabled'), 'false');

  t.created[0].cfg.onLoadCharDataError(new Error('404'));
  assert.equal(t.animate.disabled, true, 'Animate disabled');
  assert.equal(t.quiz.disabled, true, 'Practice disabled');
  assert.equal(t.animate.getAttribute('aria-disabled'), 'true', 'and announced as disabled');
});

test('F5: the actions no-op after a data failure instead of re-firing the fetch', () => {
  const t = boot();
  t.App.chars.initWriter();
  const inst = t.created.inst;
  t.App.actions.hwAnimate();
  assert.equal(inst.animated, 1, 'works while healthy');

  t.created[0].cfg.onLoadCharDataError(new Error('404'));
  t.App.actions.hwAnimate();
  t.App.actions.hwQuiz();
  assert.equal(inst.animated, 1, 'no further animate');
  assert.equal(inst.quizzed, undefined, 'no quiz');
  assert.equal(t.created.length, 1, 'and NO re-create — that would re-fetch the bad data');
});

test('F5: re-initialising a known-bad character does not re-fetch (no retry loop)', () => {
  /* the disable path must not go through setState: a re-render would recreate
     #hw-target, re-run initWriter and re-fetch — an infinite loop */
  const t = boot();
  t.App.chars.initWriter();
  t.created[0].cfg.onLoadCharDataError(new Error('404'));
  t.App.chars.initWriter();
  t.App.chars.initWriter();
  assert.equal(t.created.length, 1, 'create() called exactly once for a known-bad character');
  assert.match(t.target.innerHTML, /爱/, 'and the fallback glyph is re-painted');
});

test('F5: Reset clears the error so the user has a retry path', () => {
  const t = boot();
  t.App.chars.initWriter();
  t.created[0].cfg.onLoadCharDataError(new Error('404'));
  assert.equal(t.animate.disabled, true);
  t.App.actions.hwReset();
  assert.equal(t.created.length, 2, 'Reset retries the fetch');
  assert.equal(t.animate.disabled, false, 'and the controls come back');
});

test('F5: moving to a DIFFERENT character retries (the flag is per-character)', () => {
  const t = boot({ char: '爱' });
  t.App.chars.initWriter();
  t.created[0].cfg.onLoadCharDataError(new Error('404'));
  t.App.state.curChar = '情';
  t.App.chars.initWriter();
  assert.equal(t.created.length, 2, 'a different character is not tarred by the first one');
  assert.equal(t.created[1].ch, '情');
});

test('F5: the pre-existing library-load fallback still works and also disables the buttons', () => {
  const t = boot({ noLibrary: true });
  const savedST = global.setTimeout;
  global.setTimeout = () => 0;                     // skip the retry budget
  for (let i = 0; i < 41; i++) t.App.chars.initWriter();
  global.setTimeout = savedST;
  assert.match(t.target.innerHTML, /爱/, 'static glyph painted when the library never arrives');
  assert.equal(t.animate.disabled, true, 'and the buttons are not left live');
});

test('F5: a STALE data error does not hijack the character the user moved to', () => {
  /* the fetch is async — the user can open another character before it fails.
     The late failure must not paint the old glyph over the new box or dim
     controls that work. */
  const t = boot({ char: '爱' });
  t.App.chars.initWriter();
  const staleFail = t.created[0].cfg.onLoadCharDataError;

  t.App.state.curChar = '情';                 // user moves on
  t.App.chars.initWriter();                   // writer 2 created, healthy
  assert.equal(t.created.length, 2);
  assert.equal(t.animate.disabled, false);

  staleFail(new Error('404'));                // 爱's fetch finally fails
  assert.doesNotMatch(t.target.innerHTML, /爱/, 'the old glyph is NOT painted over the new box');
  assert.equal(t.animate.disabled, false, 'and the working character keeps live controls');
  assert.equal(t.quiz.disabled, false);
});

test('F5: the stale character is still remembered as bad', () => {
  const t = boot({ char: '爱' });
  t.App.chars.initWriter();
  const staleFail = t.created[0].cfg.onLoadCharDataError;
  t.App.state.curChar = '情';
  t.App.chars.initWriter();
  staleFail(new Error('404'));
  t.App.state.curChar = '爱';                 // back to the bad one
  t.App.chars.initWriter();
  assert.equal(t.created.length, 2, 'no re-fetch of the known-bad character');
  assert.match(t.target.innerHTML, /爱/, 'fallback painted for it');
  assert.equal(t.animate.disabled, true, 'and its controls are disabled');
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `node --test scripts/hanzi-fallback.test.js`
Expected: `tests 10`, `pass 0`, `fail 10` — the first failure is `onLoadCharDataError` not being a function (it is never passed today).

- [ ] **Step 3: Track the character whose stroke data failed**

In `app/more.js`, replace this exact line (HEAD `:311`):

```js
  var hw = null; var hwTries = 0;
```

with:

```js
  var hw = null; var hwTries = 0;
  /* F5: the character whose STROKE DATA failed to load. HanziWriter.create mounts
     its empty <svg> synchronously and only then fetches the per-character JSON, so
     a failed fetch left a blank box with live Animate/Practice buttons. Keyed by
     character so moving to another one retries; cleared by hwReset (the user's
     retry affordance). */
  var hwDataErr = null;
```

- [ ] **Step 4: Add the control-disable helper and the known-bad early return**

In `app/more.js`, replace this exact block (HEAD `:319-322`):

```js
  function initWriter() {
    var s = S();
    var el = document.getElementById('hw-target');
    if (!el) { hwTries++; if (hwTries < 40) setTimeout(initWriter, 200); return; }
```

with:

```js
  /* Engine unavailable -> the buttons must not look live. Direct DOM, like
     glyphFallback: a setState here would re-render #hw-target, re-run initWriter
     and re-fetch the data that just failed — an infinite retry loop. (F5) */
  function hwSetControls(on) {
    try {
      var names = ['hwAnimate', 'hwQuiz'];
      for (var i = 0; i < names.length; i++) {
        var list = document.querySelectorAll('[data-a="' + names[i] + '"]');
        for (var j = 0; j < list.length; j++) {
          var b = list[j];
          b.disabled = !on;
          b.setAttribute('aria-disabled', on ? 'false' : 'true');
          b.style.opacity = on ? '' : '.45';
          b.style.cursor = on ? '' : 'not-allowed';
        }
      }
    } catch (e) {}
  }
  function hwUnavailable() { return !hw || (hwDataErr !== null && hwDataErr === S().curChar); }

  function initWriter() {
    var s = S();
    var el = document.getElementById('hw-target');
    if (!el) { hwTries++; if (hwTries < 40) setTimeout(initWriter, 200); return; }
    if (hwDataErr !== null && hwDataErr === s.curChar) {   /* already known bad — do not re-fetch */
      hw = null; glyphFallback(el, s.curChar); hwSetControls(false); return;
    }
```

- [ ] **Step 5: Disable the controls on the library-load fallback too**

In `app/more.js`, replace this exact block (HEAD `:326-327`):

```js
      glyphFallback(el, s.curChar);   /* retry budget exhausted → static glyph */
      return;
```

with:

```js
      glyphFallback(el, s.curChar);   /* retry budget exhausted → static glyph */
      hwSetControls(false);
      return;
```

- [ ] **Step 6: Pass the stroke-data error hook**

In `app/more.js`, replace this exact block (HEAD `:337-338`):

```js
      hw = window.HanziWriter.create(el, s.curChar, Object.assign({ width: 200, height: 200, padding: 8, showCharacter: true, showOutline: true, delayBetweenStrokes: 140 }, col));
    } catch (e) {}
```

with:

```js
      var forChar = s.curChar;
      hw = window.HanziWriter.create(el, s.curChar, Object.assign({
        width: 200, height: 200, padding: 8, showCharacter: true, showOutline: true, delayBetweenStrokes: 140,
        /* F5: the stroke-data XHR fails AFTER the empty <svg> is mounted */
        onLoadCharDataError: function () {
          hwDataErr = forChar;
          /* the fetch is async: the user may have opened ANOTHER character since.
             Remember this one is bad, but do not paint it over — or disable the
             controls of — a character that is working. */
          if (S().curChar !== forChar) return;
          hw = null;
          try { glyphFallback(document.getElementById('hw-target'), forChar); } catch (e2) {}
          hwSetControls(false);
        }
      }, col));
      hwSetControls(true);
    } catch (e) { hw = null; glyphFallback(el, s.curChar); hwSetControls(false); }
```

`forChar` is captured because the fetch is async: the user may have opened a different character before it fails. The flag is still recorded for `forChar` (so returning to it does not re-fetch), but nothing is painted or disabled unless that character is still on screen — otherwise a late failure for 爱 would paint 爱 over 情's box and dim controls that work.

- [ ] **Step 7: Make the actions no-op when the engine is unavailable**

In `app/more.js`, replace this exact block (HEAD `:880-882`):

```js
  A.hwAnimate = function () { try { hw ? hw.animateCharacter() : initWriter(); } catch (e) {} };
  A.hwQuiz = function () { try { if (hw) hw.quiz(); } catch (e) {} };
  A.hwReset = function () { initWriter(); };
```

with:

```js
  A.hwAnimate = function () {
    if (hwDataErr !== null && hwDataErr === S().curChar) return;   /* engine unavailable (F5) */
    try { hw ? hw.animateCharacter() : initWriter(); } catch (e) {}
  };
  A.hwQuiz = function () {
    if (hwDataErr !== null && hwDataErr === S().curChar) return;
    try { if (hw) hw.quiz(); } catch (e) {}
  };
  A.hwReset = function () { hwDataErr = null; initWriter(); };   /* Reset = the retry affordance */
```

Without the `hwAnimate` guard the button would call `initWriter()` (its existing `hw`-is-null branch) and re-fire the failed fetch on every tap.

- [ ] **Step 8: Export the predicate for the test**

In `app/more.js`, replace this exact line (HEAD `:352`):

```js
  App.chars.initWriter = initWriter;
```

with:

```js
  App.chars.initWriter = initWriter;
  App.chars.unavailable = hwUnavailable;   /* pure-ish; exposed for hanzi-fallback.test.js */
```

- [ ] **Step 9: Run the test to verify it passes**

Run: `node --test scripts/hanzi-fallback.test.js`
Expected: `tests 10`, `pass 10`, `fail 0`.

- [ ] **Step 10: Check syntax and run the whole suite**

Run:

```bash
node --check app/more.js && node --test scripts/*.test.js
```

Expected: no syntax output, then `tests 166`, `pass 166`, `fail 0`.

- [ ] **Step 11: Commit**

```bash
git add app/more.js scripts/hanzi-fallback.test.js
git commit -F - <<'EOF'
fix(app): a dead character engine no longer shows live buttons (F5)

HanziWriter.create mounts its empty <svg> synchronously and only then
fetches the per-character stroke JSON. The library-LOAD fallback existed
(glyphFallback); the DATA-fetch failure had no handler, so a 404 or an
offline blip left an empty box with Animate and Practice looking live.

onLoadCharDataError now paints the static glyph — re-resolving #hw-target,
since a re-render may have swapped it — and disables the two controls.
The disable is direct DOM, not setState: a re-render would recreate
#hw-target, re-run initWriter and re-fetch the data that just failed, an
infinite retry loop. initWriter early-returns for a character already known
bad, hwAnimate no longer re-fires the fetch through its hw-is-null branch,
and Reset clears the flag so the user keeps a retry path.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
```

---

## Task 3: F11 — a lost module must not give a blank tab, and resource 404s must be reported

**Files:**
- Modify: `app/core.js` — add `App.missingSeams` after `App.DECK_SIZE` (HEAD `:172`)
- Modify: `app/index.html` — charset first + error boundary at the top of `<head>`; flush hook in the Metrika block; boot assert; delete the old in-body boundary
- Test: `scripts/boot-seams.test.js` (**new**)

**Interfaces:**
- Produces: `App.missingSeams(app?)` → `string[]`, the names of missing module seams (`core`, `data`, `shell`, `exam`, `vocab`, `more`, `study`), empty when all are present. Pure — takes an optional app object so the test can pass a deliberately broken one. Also `window.__hskFlushErrors()`, called once by the Metrika block.

**This is the only task in the batch that edits `app/index.html`.** It is `body.app`, so `node scripts/inject-auth.js` must be re-run (Step 8). It is a **no-op today** — `injectHead` early-returns on the exact `SB_TAG` the page already carries — and the new ordering keeps the auth block after the theme loader, so a future Supabase bump still injects correctly.

- [ ] **Step 1: Write the failing test**

Create `scripts/boot-seams.test.js` with exactly this content:

```js
/* Package D / F11: a module that silently 404s does NOT throw — boot succeeds,
   the shell paints a working header and tab bar, and the missing screen resolves
   to '' — a blank white area that reads as "this section is empty" rather than an
   error. App.missingSeams is what index.html's boot assert now checks, and this
   file is also a structural guard on the index.html error boundary.
   Run: node --test scripts/boot-seams.test.js */
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');

function loadCore() {
  global.localStorage = { getItem() { return null; }, setItem() {}, removeItem() {} };
  global.window = { addEventListener() {}, matchMedia() { return { matches: false, addEventListener() {} }; }, localStorage: global.localStorage };
  global.document = {
    addEventListener() {}, querySelectorAll() { return []; }, querySelector() { return null; },
    getElementById() { return null; },
    documentElement: { setAttribute() {}, removeAttribute() {}, getAttribute() { return null; } },
    createElement() { return { style: {}, setAttribute() {}, appendChild() {}, classList: { add() {}, remove() {} } }; },
    body: { classList: { add() {}, remove() {} } },
  };
  const p = path.resolve(__dirname, '../app/core.js');
  delete require.cache[require.resolve(p)];
  require(p);
  return global.window.App;
}
/* an App with every module present */
function whole() {
  return {
    screens: { shell: {}, player: {}, results: {}, more: {}, study: {} },
    setState() {}, render() {},
    data: { load() {} }, exam: {}, vocab: { screen() {} },
  };
}

test('F11: a fully-loaded app reports no missing seams', () => {
  const App = loadCore();
  assert.deepEqual(App.missingSeams(whole()), []);
});

test('F11 REGRESSION: each lost module is named — this is what the old assert missed', () => {
  const App = loadCore();
  const cases = [
    ['exam', (a) => { delete a.exam; delete a.screens.player; delete a.screens.results; }],
    ['vocab', (a) => { delete a.vocab; }],
    ['more', (a) => { delete a.screens.more; }],
    ['study', (a) => { delete a.screens.study; }],
    ['shell', (a) => { delete a.screens.shell; }],
    ['data', (a) => { delete a.data; }],
  ];
  cases.forEach(([name, breakIt]) => {
    const a = whole();
    breakIt(a);
    assert.deepEqual(App.missingSeams(a), [name], 'losing ' + name + '.js must be reported');
  });
});

test('F11: the OLD assert would have passed for exam/vocab/more/study — the bug', () => {
  const App = loadCore();
  ['exam', 'vocab', 'more', 'study'].forEach((mod) => {
    const a = whole();
    if (mod === 'exam') { delete a.exam; delete a.screens.player; delete a.screens.results; }
    if (mod === 'vocab') delete a.vocab;
    if (mod === 'more') delete a.screens.more;
    if (mod === 'study') delete a.screens.study;
    const oldAssertPasses = !!(a.screens && a.screens.shell && a.data && typeof a.data.load === 'function');
    assert.equal(oldAssertPasses, true, 'the old three-seam assert was satisfied -> blank tab');
    assert.deepEqual(App.missingSeams(a), [mod], 'the new one catches it');
  });
});

test('F11: several lost at once are all reported, and a missing App is handled', () => {
  const App = loadCore();
  const a = whole();
  delete a.vocab; delete a.screens.study;
  assert.deepEqual(App.missingSeams(a), ['vocab', 'study']);
  assert.deepEqual(App.missingSeams({}), ['core', 'data', 'shell', 'exam', 'vocab', 'more', 'study']);
});

/* ---- structural guards on app/index.html (the boundary block is inline HTML) ---- */
const HTML = fs.readFileSync(path.resolve(__dirname, '../app/index.html'), 'utf8');

test('F11: <meta charset> stays inside the 1024-byte encoding-sniffing window', () => {
  /* match the TAG, not the words: the boundary comment mentions "<meta charset>"
     in prose, and a loose needle would find that instead and always pass */
  const at = Buffer.from(HTML, 'utf8').indexOf('<meta charset="utf-8">');
  assert.ok(at >= 0, 'the charset TAG is declared');
  assert.ok(at < 1024, 'charset at byte ' + at + ' — a browser only sniffs the first 1024');
});

test('F11: the error boundary is registered with capture (resource errors do not bubble)', () => {
  const m = HTML.match(/addEventListener\('error'[\s\S]{0,600}?\},\s*true\s*\)/);
  assert.ok(m, "the 'error' listener must pass capture:true, or a 404'd <script> is never seen");
});

test('F11: the boundary runs BEFORE the app modules and the vendor/auth scripts', () => {
  const boundary = HTML.indexOf('__hskFlushErrors');
  assert.ok(boundary >= 0, 'boundary present');
  ['/vendor/supabase-js', '/auth-guard.js', '/app/core.js', 'mc.yandex.ru'].forEach((needle) => {
    assert.ok(boundary < HTML.indexOf(needle), 'boundary precedes ' + needle);
  });
});

test('F11: reports are buffered until ymGoal exists, and the buffer is flushed', () => {
  assert.ok(/if\(!window\.ymGoal\)\{\s*if\(buf\.length</.test(HTML.replace(/\s+/g, ' ').replace(/ /g, '')) ||
            /!window\.ymGoal/.test(HTML), 'buffers when ymGoal is not yet defined');
  const goalAt = HTML.indexOf('window.ymGoal=function');
  const flushAt = HTML.indexOf('window.__hskFlushErrors()');
  assert.ok(flushAt > goalAt, 'the flush call comes after ymGoal is defined');
});

test('F11: third-party resource losses get their own cap, not the 5 reserved for ours', () => {
  /* string presence is not enough: collapsing the two branches into one cap
     leaves both identifiers in the file. Assert the SEPARATE budget exists and
     is actually consulted and incremented. */
  assert.ok(/res3p/.test(HTML), 'third-party reports carry a distinct kind');
  assert.match(HTML, /CAP3P\s*=\s*\d+/, 'a third-party cap constant with a value');
  assert.match(HTML, /sent3p\s*>=\s*CAP3P/, 'consulted on its own budget');
  assert.match(HTML, /sent3p\+\+/, 'and incremented separately from sent');
});

test('F11: the boot assert goes through App.missingSeams, not a hand-rolled subset', () => {
  assert.ok(/App\.missingSeams\(\)/.test(HTML), 'boot assert calls missingSeams');
  assert.ok(!/App\.screens\.shell&&App\.data&&typeof App\.data\.load/.test(HTML), 'the old three-seam check is gone');
});

/* ---- the boot block is inline HTML, so execute it for real ---- */
const vm = require('node:vm');

function runBoot(opts) {
  const m = HTML.match(/\(function\(\)\{\s*\/\* Paint a reload screen[\s\S]*?\n\}\)\(\);/);
  assert.ok(m, 'boot IIFE found in app/index.html');
  const goals = [];
  const shell = { innerHTML: opts.shellPainted ? '<div>real shell</div>' : '' };
  const sandbox = {
    document: { getElementById: (id) => (id === 'r-shell' ? shell : null) },
    App: opts.App,
    ymGoal: (name, params) => goals.push({ name, params }),
    location: { reload() {} },
  };
  sandbox.window = sandbox;
  vm.createContext(sandbox);
  vm.runInContext(m[0], sandbox);
  return { goals, shell };
}
/* the REAL missingSeams from core.js, bound to the fake app the VM sees —
   index.html calls App.missingSeams() with no argument, so it must close over it */
function wholeApp() {
  const realMissingSeams = loadCore().missingSeams;
  const a = {
    boot() {}, screens: { shell: {}, player: {}, results: {}, more: {}, study: {} },
    setState() {}, render() {}, data: { load() {} }, exam: {}, vocab: { screen() {} },
  };
  a.missingSeams = function () { return realMissingSeams(a); };
  return a;
}

test('F11 REGRESSION: a lost TAB module reports AND paints even though the shell rendered', () => {
  /* THE motivating case: shell.js loaded fine, study.js 404'd. Before the fix
     both the goal and the reload card were gated on an EMPTY #r-shell, so this
     scenario produced silence and a blank tab. */
  const a = wholeApp();
  delete a.screens.study;
  const r = runBoot({ App: a, shellPainted: true });
  assert.equal(r.goals.length, 1, 'exactly one app_error goal fired');
  assert.match(r.goals[0].params.msg, /study/, 'and it names the lost module');
  assert.match(r.shell.innerHTML, /Something went wrong/, 'the reload card replaced the broken shell');
});

test('F11: a healthy app reports nothing and paints nothing', () => {
  const r = runBoot({ App: wholeApp(), shellPainted: true });
  assert.equal(r.goals.length, 0);
  assert.equal(r.shell.innerHTML, '<div>real shell</div>', 'the real shell is left alone');
});

test('F11: a lost shell still reports exactly once (no double-fire)', () => {
  const a = wholeApp();
  delete a.screens.shell;
  const r = runBoot({ App: a, shellPainted: false });
  assert.equal(r.goals.length, 1, 'one goal, not two');
  assert.match(r.shell.innerHTML, /Something went wrong/);
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `node --test scripts/boot-seams.test.js`
Expected: `tests 13`, `pass 3`, `fail 10`. The `missingSeams` tests fail with `TypeError: App.missingSeams is not a function`, and the HTML/boot guards fail. The three that pass are regression guards that must *stay* true: the charset window, and two boot-block cases.

- [ ] **Step 3: Add the seam list to core.js**

In `app/core.js`, replace this exact line (HEAD `:172`):

```js
  App.DECK_SIZE = 20;
```

with:

```js
  App.DECK_SIZE = 20;

  /* F11: the module seams the app needs to be usable. index.html's boot assert
     calls this. A module that silently 404s (partial fetch, CDN blip) does NOT
     throw — boot succeeds, the shell paints a working header and tab bar, and
     screenHtml() resolves the missing screen to undefined and returns '': the
     user taps Exams and gets a blank white area, indistinguishable from "this
     section is empty". Pure; exported for scripts/boot-seams.test.js.
     Desktop overrides are deliberately NOT asserted: if desktop-shell.js is lost,
     App.screens.shell is still shell.js's, so the app degrades to the mobile UI
     rather than going blank — which is not the failure this guards. */
  App.missingSeams = function (a) {
    a = a || App;
    var miss = [];
    function need(name, ok) { if (!ok) miss.push(name); }
    need('core', !!(a.screens && typeof a.setState === 'function' && typeof a.render === 'function'));
    need('data', !!(a.data && typeof a.data.load === 'function'));
    need('shell', !!(a.screens && a.screens.shell));
    need('exam', !!(a.exam && a.screens && a.screens.player && a.screens.results));
    need('vocab', !!(a.vocab && typeof a.vocab.screen === 'function'));
    need('more', !!(a.screens && a.screens.more));
    need('study', !!(a.screens && a.screens.study));
    return miss;
  };
```

- [ ] **Step 4: Put the error boundary at the top of `<head>`, charset first**

In `app/index.html`, replace this exact string — the opening of the theme loader, the current first thing in `<head>` (HEAD `:4`):

```
<script>(function(){try{var t=localStorage.getItem
```

with:

```
<meta charset="utf-8">
<!-- F11 global error boundary. FIRST script in <head> so it also covers the
     vendor/auth/font/Metrika loads below; capture:true because a 404'd
     <script>/<link> fires a RESOURCE error that does not bubble to window.
     Reports are buffered until ymGoal exists (defined in the Metrika block
     below), so a failure before Metrika is not silently dropped; third-party
     losses (fonts, hanzi-writer, Metrika itself - all commonly ad-blocked and
     blocked in China) get their own small cap so they cannot crowd out OURS.
     <meta charset> stays the first thing in <head>: this block is ~1.4 KB and
     would otherwise push it past the 1024-byte encoding-sniffing window. -->
<script>
(function(){
  var CAP=5,CAP3P=2,sent=0,sent3p=0,buf=[];
  function push(rec){
    if(!window.ymGoal){ if(buf.length<20)buf.push(rec); return; }
    if(rec.kind==='res3p'){ if(sent3p>=CAP3P)return; sent3p++; }
    else { if(sent>=CAP)return; sent++; }
    try{window.ymGoal('app_error',rec);}catch(e){}
  }
  function flush(){var q=buf;buf=[];for(var i=0;i<q.length;i++)push(q[i]);}
  window.__hskFlushErrors=flush;
  function report(kind,msg){
    var rec={kind:kind,msg:String(msg==null?'':msg).slice(0,180)};
    try{if(window.console&&console.warn)console.warn('[app]',kind,rec.msg);}catch(e){}
    try{push(rec);}catch(e){}
  }
  function ours(u){try{return u.charAt(0)==='/'||u.indexOf(location.origin)===0;}catch(e){return false;}}
  window.addEventListener('error',function(e){
    var t=e&&e.target;
    if(t&&t!==window&&(t.src||t.href)){
      var u=String(t.src||t.href||'');
      report(ours(u)?'resource':'res3p',u);
      return;
    }
    report('error',e&&(e.message||(e.error&&e.error.message)));
  },true);
  window.addEventListener('unhandledrejection',function(e){
    report('rejection',e&&e.reason&&(e.reason.message||e.reason));
  });
})();
</script>
<script>(function(){try{var t=localStorage.getItem
```

Then delete the now-duplicated charset line: replace this exact block (HEAD `:11-12`):

```
<meta charset="utf-8">
<meta name="viewport"
```

with:

```
<meta name="viewport"
```

`<meta charset>` **must** end up first. It currently sits at byte 538 with only 486 bytes of headroom, and this block is ~1.4 KB; leaving charset where it was would push it past the 1024-byte window a browser sniffs for the encoding, on a page full of Chinese. Step 1's test asserts this.

- [ ] **Step 5: Flush the buffer as soon as `ymGoal` exists**

In `app/index.html`, replace this exact line (HEAD `:48`):

```
window.ymGoal=function(name,params){try{if(window.ym)ym(110455584,"reachGoal",name,params||{});}catch(e){}};
```

with:

```
window.ymGoal=function(name,params){try{if(window.ym)ym(110455584,"reachGoal",name,params||{});}catch(e){}};
try{if(window.__hskFlushErrors)window.__hskFlushErrors();}catch(e){}  /* F11: drain anything reported before this point */
```

- [ ] **Step 6: Delete the old in-body boundary**

In `app/index.html`, replace this exact block (HEAD `:57-64`) with **nothing** (an empty string):

```
<!-- Global error boundary (registered before the modules so a load-time throw in
     any of them is reported, not silently swallowed). Metrika-reports (capped) +
     console; the boot wrapper below paints a reload screen if boot itself throws. -->
<script>
(function(){var n=0;function report(kind,msg){try{if(n<5){n++;if(window.ymGoal)ymGoal('app_error',{kind:kind,msg:String(msg==null?'':msg).slice(0,180)});}}catch(e){}try{if(window.console&&console.warn)console.warn('[app]',kind,msg);}catch(e){}}
window.addEventListener('error',function(e){report('error',e&&(e.message||(e.error&&e.error.message)));});
window.addEventListener('unhandledrejection',function(e){report('rejection',e&&e.reason&&(e.reason.message||e.reason));});})();
</script>
```

It is superseded by the head block, which catches strictly more (it runs earlier and uses capture).

- [ ] **Step 7: Route the boot assert through `App.missingSeams`**

First make `fallback` able to fire when the shell DID render. In `app/index.html`, replace this exact block (HEAD `:78-81`):

```
  function fallback(reason){
    try{
      var r=document.getElementById('r-shell');
      if(r&&!r.innerHTML.trim()){
```

with:

```
  /* force=true: a module seam is missing even though the shell painted — the
     blank-TAB case F11 exists for. Without it both the app_error goal and the
     reload card are gated on an EMPTY #r-shell, so losing exam/vocab/more/study
     reported nothing and showed nothing. */
  function fallback(reason,force){
    try{
      var r=document.getElementById('r-shell');
      if(r&&(force||!r.innerHTML.trim())){
```

Then, in the same file, replace this exact line (HEAD `:93`):

```
    if(!(window.App&&App.screens&&App.screens.shell&&App.data&&typeof App.data.load==='function')){ fallback('missing seams'); return; }
```

with:

```
    var miss=(window.App&&typeof App.missingSeams==='function')?App.missingSeams():['core'];
    if(miss.length){ fallback('missing seams: '+miss.join(','),true); return; }
```

**The `force` flag is the whole point.** `fallback()` gates *both* the `app_error` goal and the reload card on `#r-shell` being empty. In F11's motivating case — `shell.js` loads fine, `study.js` 404s — the shell is NOT empty, so without `force` the refactor would fire nothing and show nothing: a nicer message that never appears. The reload card now also names which module was lost, which is the difference between an actionable bug report and "it was blank".

- [ ] **Step 8: Re-run inject-auth (project rule for `body.app` pages)**

Run:

```bash
node scripts/inject-auth.js && git status --porcelain app/index.html
```

Expected: `[inject-auth] Updated 0 pages`, and `git status` shows `app/index.html` as modified **by your edits only** — inject-auth must not have added anything. If it reports a non-zero count, stop: the auth block has been disturbed and the ordering needs re-checking before continuing.

- [ ] **Step 9: Run the test to verify it passes**

Run: `node --test scripts/boot-seams.test.js`
Expected: `tests 13`, `pass 13`, `fail 0`.

- [ ] **Step 10: Check syntax and run the whole suite**

Run:

```bash
node --check app/core.js && node --test scripts/*.test.js
```

Expected: no syntax output, then `tests 179`, `pass 179`, `fail 0`.

- [ ] **Step 11: Commit**

```bash
git add app/core.js app/index.html scripts/boot-seams.test.js
git commit -F - <<'EOF'
fix(app): a lost module is caught at boot, and resource 404s are reported (F11)

The boot assert covered core.js, shell.js and data.js only. If exam.js,
vocab.js, more.js or study.js was lost, boot SUCCEEDED: the shell painted
a working header and tab bar, screenHtml() resolved the missing screen to
undefined and returned '', and the user tapped Exams and got a blank white
area — indistinguishable from "this section is empty". App.missingSeams
now covers every shared module and the reload card names the one that went
missing.

fallback() also had to learn to fire when the shell DID render: it gated
both the app_error goal and the card on an empty #r-shell, so extending the
assert alone would have changed nothing in exactly the case it was written
for. Desktop overrides are excluded on purpose: losing desktop-shell.js
falls back to the mobile shell, not a blank screen.

The global error listener was also registered without capture, so resource
404s never reached the app_error goal wired in batch 2 — a 404'd <script>
fires a resource error that does not bubble. It now uses capture and
classifies by origin: third-party losses (fonts, hanzi-writer, Metrika
itself, all commonly ad-blocked and blocked in China) get their own small
cap so they cannot crowd out OUR five. Reports are buffered until ymGoal
exists, because the old code burned a cap slot per report even when Metrika
had not loaded yet — and the boundary now runs first in <head>, so it sees
the vendor, auth and font loads it previously missed.

<meta charset> moves to the very first line: it sat at byte 538 with 486
bytes of headroom, and this block would have pushed it past the 1024-byte
window browsers sniff for the encoding, on a page full of Chinese.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
```

---

## Task 4: F12 — a stale second tab must not clobber the other tab's data

**Files:**
- Modify: `app/exam.js` — add `storeGet` + two RMW helpers next to `storeSet` (HEAD `:47-53`); rewrite four write sites (`:499`, `:635`, `:650`, `:674-675`)
- Modify: `app/vocab.js` — `persistMastered` (HEAD `:93-95`) and its two callers (`:220`, `:408`)
- Test: `scripts/exam-multitab.test.js` (**new**)

**Interfaces:**
- Consumes: `assign` and `storeSet`, both already module-private in `app/exam.js`.
- Produces (module-private, observed through the store):
  - `storeGet(key, fb)` — the read counterpart of `storeSet`.
  - `writeProgressSlot(idx, entry)` → the merged map. `entry === null` deletes that slot.
  - `appendAttempt(at)` → the merged array, union by `testIdx|ts`.
  - `persistMastered(next, cur)` → the merged array. **Both arguments are required** — `cur` is what this tab had *before* the change, and without it a removal cannot be distinguished from a concurrent addition.

**Why a delta and not a union:** the spec says "RMW union" for `mastered`, but `toggleMastered` can *remove* an id. Unioning the result with storage resurrects it, so un-mastering would silently stop working. The write keeps the stored set, drops what this tab removed, and adds what this tab has.

**Scope:** same-device only. `localStorage` is synchronously readable, which is why this needs no tombstones — unlike the cross-**device** merge in `app/sync.js`, which is package F's job and is untouched here.

- [ ] **Step 1: Write the failing test**

Create `scripts/exam-multitab.test.js` with exactly this content:

```js
/* Package D / F12: two tabs of the same device share localStorage. Every write
   used to serialise the tab's OWN in-memory map, so a stale tab erased whatever
   the other tab had written since boot. Each write now read-modify-writes the
   STORED value and touches only its own key.
   Drives the REAL app/exam.js and app/vocab.js against a shared fake store.
   Run: node --test scripts/exam-multitab.test.js */
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

const KEYS = { progress: 'hsk4-exam-progress', attempts: 'hsk4-attempts', mastered: 'hsk4-vocab-mastered' };

/* ONE store, shared by every "tab" in a test — this is the whole point. */
function makeStore(seed) {
  const disk = Object.assign({}, seed || {});
  return {
    disk,
    getJSON(k, fb) { return k in disk ? JSON.parse(JSON.stringify(disk[k])) : fb; },
    setJSON(k, v) { disk[k] = JSON.parse(JSON.stringify(v)); },
    get() { return null; }, set() {}, del() {},
  };
}

function L(n) { return { type: 'listening_choice', number: n, audio: 'a' + n, options: ['a', 'b'], correct_answer_index: 0, text: 't' + n }; }
function rawPaper() { return { questions: [L(1), L(2), L(3)] }; }

/* Boot one "tab" of exam.js whose in-memory state is whatever it saw at ITS boot. */
function examTab(store, state) {
  const savedSI = global.setInterval, savedCI = global.clearInterval;
  global.setInterval = () => 0; global.clearInterval = () => {};
  const App = {
    data: { TESTS: [{ official: false }], questionsFor: () => rawPaper() },
    keys: KEYS, store,
    state: Object.assign({ testIdx: 0, examMode: 'exam', examSection: 'all', examView: 'player',
      curQ: 0, answers: {}, flags: {}, elapsed: 0, audioPlays: {}, progress: {}, attempts: [] }, state || {}),
    setState(p) { Object.assign(App.state, p); },
    util: { scrollTop() {} },
  };
  global.window = { App };
  global.document = { addEventListener() {}, querySelector() { return null; }, querySelectorAll() { return []; } };
  const p = path.resolve(__dirname, '../app/exam.js');
  delete require.cache[require.resolve(p)];
  require(p);
  App.exam.load(0);
  App._restore = () => { global.setInterval = savedSI; global.clearInterval = savedCI; };
  return App;
}

function vocabTab(store, vMastered) {
  const App = {
    util: {}, screens: {}, sheets: {}, overlays: {}, actions: {}, gestures: {}, vocab: {},
    keys: KEYS, store, DECK_SIZE: 20,
    state: { vMastered: (vMastered || []).slice(), vSort: 'default', deckIds: [] },
    data: { WORDS: [1, 2, 3, 4, 5].map((i) => ({ id: i, word: 'w' + i, pinyin: 'p', meaning: 'm', pos: 'n.', freq: i })) },
    setState(p) { Object.assign(App.state, p); }, render() {}, update() {}, live() {},
  };
  global.window = { App, addEventListener() {}, matchMedia() { return { matches: false, addEventListener() {} }; } };
  global.document = { addEventListener() {}, querySelector() { return null; }, querySelectorAll() { return []; }, getElementById() { return null; } };
  const p = path.resolve(__dirname, '../app/vocab.js');
  delete require.cache[require.resolve(p)];
  require(p);
  return App;
}

/* ---------------- exam progress ---------------- */

test('F12 REGRESSION: a stale tab autosaving paper 0 does not erase paper 5', () => {
  const store = makeStore();
  const t1 = examTab(store, { testIdx: 0 });      // tab 1 booted with an empty map
  t1._restore();
  /* tab 2 answers 20 questions of paper 5 */
  store.setJSON(KEYS.progress, { 5: { answers: { 0: 1 }, answered: 20, curQ: 19, ts: 1 } });
  /* tab 1 now autosaves ITS paper */
  t1.state.answers = { 0: 1 };
  t1.exam.load(0);
  t1.actions.answerQ(1);                          // -> persistLive()
  const disk = store.getJSON(KEYS.progress, null);
  assert.ok(disk[5], "paper 5's progress survived the other tab's write");
  assert.equal(disk[5].answered, 20);
  assert.ok(disk[0], "and tab 1's own paper was written");
});

test('F12: exiting a paper deletes ONLY that paper, not the whole map', () => {
  const store = makeStore({ [KEYS.progress]: { 3: { answered: 7, ts: 1 }, 5: { answered: 20, ts: 2 } } });
  const t = examTab(store, { testIdx: 3, progress: { 3: { answered: 7, ts: 1 } } });  // never saw paper 5
  t.actions.exitExam();
  t._restore();
  const disk = store.getJSON(KEYS.progress, null);
  assert.equal(disk[3], undefined, 'paper 3 cleared as asked');
  assert.ok(disk[5], 'paper 5 untouched');
});

test('F12 REGRESSION: submitting keeps the other tab\'s completed attempt', () => {
  const store = makeStore();
  const t1 = examTab(store, { testIdx: 0, attempts: [] });   // booted with none
  /* tab 2 finishes paper 5 meanwhile */
  store.setJSON(KEYS.attempts, [{ testIdx: 5, ts: 111, pct: 80, sections: [] }]);
  t1.state.answers = { 0: 0, 1: 0, 2: 0 };
  t1.actions.submitExam();
  t1._restore();
  const disk = store.getJSON(KEYS.attempts, null);
  assert.equal(disk.length, 2, 'both attempts on disk — attempts are append-only');
  assert.ok(disk.some((a) => a.testIdx === 5), "the other tab's result survived");
  assert.ok(disk.some((a) => a.testIdx === 0), 'and this tab appended its own');
});

test('F12: re-submitting the same attempt does not duplicate it (union by testIdx|ts)', () => {
  const store = makeStore();
  const t = examTab(store, { testIdx: 0 });
  t.state.answers = { 0: 0 };
  t.actions.submitExam();
  const first = store.getJSON(KEYS.attempts, []);
  store.setJSON(KEYS.attempts, first.concat(first));      // a duplicate sneaks in
  t.state.answers = { 0: 0 };
  t.actions.submitExam();
  t._restore();
  const seen = {};
  store.getJSON(KEYS.attempts, []).forEach((a) => { seen[a.testIdx + '|' + a.ts] = (seen[a.testIdx + '|' + a.ts] || 0) + 1; });
  Object.keys(seen).forEach((k) => assert.equal(seen[k], 1, 'no duplicate key ' + k));
});

/* ---------------- vocabulary mastery ---------------- */

test('F12 REGRESSION: mastering a word keeps what the other tab mastered', () => {
  const store = makeStore();
  const t1 = vocabTab(store, []);                 // tab 1 booted with none
  store.setJSON(KEYS.mastered, [4, 5]);           // tab 2 mastered two words
  t1.actions.toggleMastered(1);
  const disk = store.getJSON(KEYS.mastered, []);
  assert.deepEqual(disk.slice().sort(), [1, 4, 5], "the other tab's words survived");
  assert.deepEqual(t1.state.vMastered.slice().sort(), [1, 4, 5], 'and this tab adopted the merged set');
});

test('F12 CRITICAL: un-mastering still works — a plain union would resurrect the word', () => {
  /* The trap in "RMW union": unioning with storage undoes every removal, so the
     user could never un-master anything. The write is a DELTA, not a union. */
  const store = makeStore({ [KEYS.mastered]: [1, 2, 3] });
  const t = vocabTab(store, [1, 2, 3]);
  t.actions.toggleMastered(2);                    // un-master word 2
  const disk = store.getJSON(KEYS.mastered, []);
  assert.ok(disk.indexOf(2) === -1, 'word 2 is GONE from storage, not resurrected');
  assert.deepEqual(disk.slice().sort(), [1, 3]);
  assert.ok(t.state.vMastered.indexOf(2) === -1, 'and gone from memory');
});

test('F12: this tab\'s removal and the other tab\'s addition both survive one write', () => {
  const store = makeStore({ [KEYS.mastered]: [1, 2] });
  const t = vocabTab(store, [1, 2]);              // booted seeing [1,2]
  store.setJSON(KEYS.mastered, [1, 2, 9]);        // other tab adds 9
  t.actions.toggleMastered(1);                    // this tab removes 1
  const disk = store.getJSON(KEYS.mastered, []).slice().sort();
  assert.deepEqual(disk, [2, 9], 'removal honoured AND the concurrent addition kept');
});

test('F12: the flashcard "I know it" path merges the same way', () => {
  const store = makeStore();
  const t = vocabTab(store, []);
  store.setJSON(KEYS.mastered, [7]);              // other tab, after this one booted
  t.vocab.startDeck();
  t.state.flashFlipped = true;
  t.actions.fcKnow();
  const disk = store.getJSON(KEYS.mastered, []);
  assert.ok(disk.indexOf(7) !== -1, "the other tab's word survived the flashcard write");
  assert.ok(disk.length >= 2, 'and this tab added its own');
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `node --test scripts/exam-multitab.test.js`
Expected: `tests 8`, `pass 1`, `fail 7`. The one that passes is "un-mastering still works" — it already does today, and it is the regression guard that stops the fix being written as a plain union.

- [ ] **Step 3: Add the read counterpart and the two merge helpers**

In `app/exam.js`, replace this exact line (HEAD `:53`):

```js
  function pad2(n) { return (n < 10 ? '0' : '') + n; }
```

with:

```js
  function storeGet(key, fb) {
    try {
      if (App.store && typeof App.store.getJSON === 'function') return App.store.getJSON(key, fb);
    } catch (e) {}
    try { var v = JSON.parse(localStorage.getItem(key) || 'null'); return v == null ? fb : v; }
    catch (e) { return fb; }
  }

  /* F12: a second tab may have written since this one booted. Serialising this
     tab's whole in-memory map would erase the other tab's papers, so every write
     read-modify-writes the STORED map and touches only its own paper's key.
     localStorage is synchronously readable, which is why the same-DEVICE case
     needs no tombstones (unlike the cross-DEVICE merge in app/sync.js).
     entry === null deletes the slot. Returns the merged map for the state patch. */
  function writeProgressSlot(idx, entry) {
    var stored = storeGet(App.keys.progress, null);
    var merged = (stored && typeof stored === 'object' && !Array.isArray(stored)) ? assign({}, stored) : {};
    if (entry === null) delete merged[idx]; else merged[idx] = entry;
    storeSet(App.keys.progress, merged);
    return merged;
  }

  /* attempts is APPEND-ONLY: union by (testIdx, ts) against what is stored, so a
     stale tab can never erase another tab's completed exam result. (F12) */
  function attemptKey(a) { return String(a && a.testIdx) + '|' + String(a && a.ts); }
  function appendAttempt(at) {
    var stored = storeGet(App.keys.attempts, null);
    var base = Array.isArray(stored) ? stored : [];
    var seen = {}, out = [];
    base.concat([at]).forEach(function (a) {
      var k = attemptKey(a);
      if (seen[k]) return;
      seen[k] = 1; out.push(a);
    });
    storeSet(App.keys.attempts, out);
    return out;
  }

  function pad2(n) { return (n < 10 ? '0' : '') + n; }
```

- [ ] **Step 4: Site 1 of 4 — `persistLive` (the 10-second autosave)**

In `app/exam.js`, replace this exact block (HEAD `:490-499`):

```js
    var progress = assign({}, s.progress);
    var prev = progress[s.testIdx];
    progress[s.testIdx] = {
      answers: assign({}, s.answers), flags: assign({}, s.flags),
      curQ: s.curQ, elapsed: s.elapsed, audioPlays: assign({}, s.audioPlays),
      answered: answered, examMode: s.examMode,
      ts: (prev && prev.ts) || Date.now()   /* "Started {date}" on the history card */
    };
    s.progress = progress;   /* silent — exams list is off-screen during play */
    storeSet(App.keys.progress, progress);
```

with:

```js
    var prev = (s.progress || {})[s.testIdx];
    var progress = writeProgressSlot(s.testIdx, {
      answers: assign({}, s.answers), flags: assign({}, s.flags),
      curQ: s.curQ, elapsed: s.elapsed, audioPlays: assign({}, s.audioPlays),
      answered: answered, examMode: s.examMode,
      ts: (prev && prev.ts) || Date.now()   /* "Started {date}" on the history card */
    });
    s.progress = progress;   /* silent — exams list is off-screen during play */
```

- [ ] **Step 5: Site 2 of 4 — leaving the player**

In `app/exam.js`, replace this exact block (HEAD `:626-635`):

```js
      var progress = assign({}, s.progress);
      var prev = progress[s.testIdx];
      progress[s.testIdx] = {
        answers: assign({}, s.answers), flags: assign({}, s.flags),
        curQ: s.curQ, elapsed: s.elapsed, audioPlays: assign({}, s.audioPlays),
        answered: answered, examMode: s.examMode,
        ts: (prev && prev.ts) || Date.now()
      };
      patch.progress = progress;
      storeSet(App.keys.progress, progress);
```

with:

```js
      var prev = (s.progress || {})[s.testIdx];
      patch.progress = writeProgressSlot(s.testIdx, {
        answers: assign({}, s.answers), flags: assign({}, s.flags),
        curQ: s.curQ, elapsed: s.elapsed, audioPlays: assign({}, s.audioPlays),
        answered: answered, examMode: s.examMode,
        ts: (prev && prev.ts) || Date.now()
      });
```

- [ ] **Step 6: Site 3 of 4 — `exitExam` (delete only this paper)**

In `app/exam.js`, replace this exact block (HEAD `:647-650`):

```js
      var progress = assign({}, s.progress);
      delete progress[s.testIdx];
      patch.progress = progress;
      storeSet(App.keys.progress, progress);
```

with:

```js
      patch.progress = writeProgressSlot(s.testIdx, null);   /* delete ONLY this paper's slot */
```

- [ ] **Step 7: Site 4 of 4 — `submitExam` (the worst one: the whole attempts array)**

In `app/exam.js`, replace this exact block (HEAD `:670-675`):

```js
    var at = computeAttempt();
    var attempts = (s.attempts || []).concat([at]);
    var progress = assign({}, s.progress);
    delete progress[s.testIdx];
    storeSet(App.keys.attempts, attempts);
    storeSet(App.keys.progress, progress);
```

with:

```js
    var at = computeAttempt();
    var attempts = appendAttempt(at);                        /* append-only union (F12) */
    var progress = writeProgressSlot(s.testIdx, null);
```

This is the site the audit missed. `(s.attempts || []).concat([at])` rebuilds the entire history from this tab's boot-time copy, so a stale tab submitting one paper erased every *completed exam result* the other tab had recorded.

- [ ] **Step 8: `persistMastered` becomes a delta merge**

In `app/vocab.js`, replace this exact block (HEAD `:93-95`):

```js
  function persistMastered(next) {
    App.store.setJSON(App.keys.mastered, next);
  }
```

with:

```js
  /* F12: another tab may have changed the set since this one booted, so persist a
     DELTA against what is stored rather than overwriting with this tab's copy.
     A plain union would be wrong in the other direction — it would resurrect the
     word the user just un-mastered — so this keeps the stored set, drops what THIS
     tab removed, and adds what THIS tab has. Returns the merged array so the
     caller's in-memory state matches storage. */
  function persistMastered(next, cur) {
    var stored = App.store.getJSON(App.keys.mastered, null);
    var base = Array.isArray(stored) ? stored : (Array.isArray(cur) ? cur : []);
    var nSet = {}, cSet = {}, seen = {}, out = [], i, n;
    for (i = 0; i < next.length; i++) { n = Number(next[i]); if (!isNaN(n)) nSet[n] = 1; }
    if (Array.isArray(cur)) { for (i = 0; i < cur.length; i++) { n = Number(cur[i]); if (!isNaN(n)) cSet[n] = 1; } }
    for (i = 0; i < base.length; i++) {
      n = Number(base[i]);
      if (isNaN(n) || seen[n]) continue;
      if (cSet[n] && !nSet[n]) continue;      /* THIS tab un-mastered it — honour that */
      seen[n] = 1; out.push(n);
    }
    for (i = 0; i < next.length; i++) {
      n = Number(next[i]);
      if (isNaN(n) || seen[n]) continue;
      seen[n] = 1; out.push(n);
    }
    App.store.setJSON(App.keys.mastered, out);
    return out;
  }
```

- [ ] **Step 9: Both callers pass `cur` and adopt the merged result**

In `app/vocab.js`, replace this exact line (HEAD `:220`, the flashcard "I know it" path):

```js
      if (!has) { var next = cur.concat([id]); persistMastered(next); patch.vMastered = next; }
```

with:

```js
      if (!has) { var next = cur.concat([id]); patch.vMastered = persistMastered(next, cur); }
```

Then replace this exact block (HEAD `:407-409`, the row / word-sheet toggle):

```js
    var next = has ? cur.filter(function (x) { return Number(x) !== id; }) : cur.concat([id]);
    persistMastered(next);
    setSt({ vMastered: next });   /* shell skips vMastered — #vocab-list subregion + word sheet re-render */
```

with:

```js
    var next = has ? cur.filter(function (x) { return Number(x) !== id; }) : cur.concat([id]);
    var merged = persistMastered(next, cur);
    setSt({ vMastered: merged });   /* shell skips vMastered — #vocab-list subregion + word sheet re-render */
```

Adopting the merged array (not `next`) is what makes this tab show the other tab's additions immediately, and keeps memory consistent with storage.

- [ ] **Step 10: Run the test to verify it passes**

Run: `node --test scripts/exam-multitab.test.js`
Expected: `tests 8`, `pass 8`, `fail 0`.

- [ ] **Step 11: Confirm no write site was missed**

Run:

```bash
grep -n "storeSet(App.keys.progress\|storeSet(App.keys.attempts" app/exam.js
```

Expected: exactly **two** hits, both inside the helpers (`writeProgressSlot`, `appendAttempt`) — no caller writes those keys directly any more.

Then run:

```bash
grep -n "setJSON(App.keys.mastered" app/vocab.js
```

Expected: exactly **one** hit, inside `persistMastered`.

- [ ] **Step 12: Check syntax and run the whole suite**

Run:

```bash
node --check app/exam.js && node --check app/vocab.js && node --test scripts/*.test.js
```

Expected: no syntax output, then `tests 187`, `pass 187`, `fail 0`.

- [ ] **Step 13: Commit**

```bash
git add app/exam.js app/vocab.js scripts/exam-multitab.test.js
git commit -F - <<'EOF'
fix(app): a second tab no longer clobbers the first one's data (F12)

Every write serialised the tab's OWN in-memory map over localStorage, so a
stale tab erased whatever another tab had written since it booted. Tab 2
answers 20 questions of paper 5; tab 1 answers one question of paper 3 and
writes its boot-time map, which has no key 5 — paper 5 is gone.

All five write sites now read-modify-write the stored value and touch only
their own key: the autosave, leaving the player, exitExam (deletes just that
paper), submitExam, and vocab mastery. submitExam is the one the audit
missed and the worst of them — it rebuilt the ENTIRE attempts array from
this tab's copy, erasing other tabs' completed exam results; attempts are
append-only and are now unioned by testIdx|ts.

Mastery is a DELTA, not the union the spec called for: a union would
resurrect the word the user just un-mastered. It keeps the stored set,
drops what this tab removed, and adds what this tab has — so a concurrent
addition in another tab and a removal here both survive one write.

Same-device only. localStorage is synchronously readable, which is why this
needs no tombstones, unlike the cross-DEVICE merge in app/sync.js.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
```

---

## Task 5: Verification on both clients

**Files:** none modified.

- [ ] **Step 1: Run the full suite**

Run: `node --test scripts/*.test.js`
Expected: `tests 187`, `pass 187`, `fail 0`.

- [ ] **Step 2: Confirm the build state**

Run:

```bash
node scripts/inject-auth.js && git status --porcelain -- app/ scripts/ data/ build.js
```

Expected: `[inject-auth] Updated 0 pages` and **no output** from `git status` if Tasks 1–4 each committed. (Plain `git status --porcelain` is not clean — the untracked plan documents show as `??`.) No `data/*.json` or `build.js` changes, so `node build.js` is not required.

- [ ] **Step 3: Serve with the placeholder auth config**

```bash
cp config/auth.example.js config/auth.js && python3 -m http.server 8080 &
echo "server pid $!"
```

Background it and keep the PID — Step 6 must restore the real config.

- [ ] **Step 4: Verify the DESKTOP client**

Open `http://localhost:8080/app/`. Bust the module cache first (stale `app/*.js` has burned prior passes), then reload:

```js
['core','data','shell','exam','vocab','more','study','desktop-config','desktop-shell','desktop-exam','desktop-vocab','desktop-more','desktop-study'].forEach(function(m){fetch('/app/'+m+'.js',{cache:'reload'});});
```

1. **F11 boundary is live and first.** In the console:
   ```js
   JSON.stringify({flush:typeof window.__hskFlushErrors, seams:App.missingSeams(),
     charsetByte:document.documentElement.outerHTML.indexOf('charset')})
   ```
   Expected: `flush:"function"`, `seams:[]`.
2. **F11 resource classification.** Inject a failing same-origin script and a failing third-party one, then check the console warnings:
   ```js
   var a=document.createElement('script');a.src='/app/does-not-exist.js';document.head.appendChild(a);
   var b=document.createElement('script');b.src='https://cdn.jsdelivr.net/npm/does-not-exist-xyz';document.head.appendChild(b);
   ```
   Expected: two `[app]` console warnings, the first `resource`, the second `res3p`.
3. **F5.** Open More → Characters → any character. Confirm the stroke box renders and Animate works. Then force the failure:
   ```js
   (function(){var el=document.getElementById('hw-target');
     App.state.curChar && App.chars.initWriter();
     return 'engine unavailable? ' + App.chars.unavailable();})()
   ```
   Then, with devtools Network set to block `*hanzi-writer*` **stroke data** (or offline), open a *different* character and confirm: the static glyph is painted, and Animate/Practice are visibly dimmed and do nothing.
4. **F4.** Start a mock exam on a paper with per-question audio (tests 01–12), and in the console:
   ```js
   (function(){var q=App.state.curQ;App.actions.playClip();
     var after=(App.state.audioPlays||{})[q]||0;
     App.exam.audioEl.dispatchEvent(new Event('error'));
     return 'debited '+after+' -> refunded '+((App.state.audioPlays||{})[q]||0);})()
   ```
   Expected: `debited 1 -> refunded 0`.
5. **F12.** Open `/app/` in a **second** tab. In tab 2, master a word. In tab 1 (without reloading), master a different word. Then in tab 1:
   ```js
   JSON.parse(localStorage.getItem('hsk4-vocab-mastered')).length
   ```
   Expected: **both** words present. Repeat with un-mastering in tab 1 and confirm the word does **not** come back.

- [ ] **Step 5: Verify the MOBILE client**

```js
localStorage.setItem('hsk4-client','mobile'); location.reload();
```

Bust the seven shared modules, reload, and repeat checks 1, 3, 4 and 5.

- [ ] **Step 6: Restore the real auth config**

Stop the server, then:

```bash
git checkout -- config/auth.js && git status --porcelain config/auth.js
```

Expected: **no output**. Do not skip this — leaving the placeholder ships an unconfigured, ungated site.

- [ ] **Step 7: Update CLAUDE.md's test count**

In `CLAUDE.md`, replace this exact substring:

```
band-score/grade-sections/skills/plan-charge/writing-models/vocab-session/weakest-section/focus-restore/focus-hooks/toggle-a11y — 18 files, 145 tests)
```

with:

```
band-score/grade-sections/skills/plan-charge/writing-models/vocab-session/weakest-section/focus-restore/focus-hooks/toggle-a11y/exam-playcap/hanzi-fallback/boot-seams/exam-multitab — 22 files, 187 tests)
```

Then commit:

```bash
git add CLAUDE.md
git commit -m "docs: CLAUDE.md test count 145 -> 187 (Package D suites)

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

- [ ] **Step 8: Record the result**

If every check in Steps 4–5 passed, Package D is complete. If any failed, fix it in the task that owns it and re-run this task from Step 1.

---

## Post-implementation corrections (from the implementation review)

Implemented as planned, then five findings were fixed in `686316bd`. Recorded here because two of them are corrections to this plan's own reasoning:

1. **F4's threat model was incomplete.** The plan assumed a rejected `play()` arrives as a *microtask*; the HTML spec queues it on the media element's **task** source, so a stale rejection can land after the user has started a different clip. The `ex._mode`/`_clipQ` guard compares the *current* clip against a marker owned by the *old* one, so Play → Next → Play refunded the **new** clip and flagged it failed — the cap was still farmable. Fixed with a per-`playClip` serial (`clipSeq`) on the `p.catch` closure. **The Task 1 harness could not express this**: `store.interrupt()` rejects synchronously, so no ordering-sensitive case was reachable.
2. **Two comments overclaimed.** Clearing `ex._clipDebit` and the `hwAnimate` early return are *redundant* with, respectively, `stopClip()` nulling `_mode` and `initWriter`'s known-bad early return. Both are kept as belt-and-braces but no longer described as the mechanism.
3. **Three coverage holes**, all found by mutation and now closed: the flashcard path never asserted it adopts the *merged* set; the `index.html` boundary was grepped rather than executed (a collapsed third-party cap survived); and no test fed `persistMastered` a corrupt stored array — `Number(null)` is `0`, which would have invented the phantom word id 0 and synced it.

Suite: **191** (not 187). Two mutants remain unkilled and are accepted: clearing `_clipDebit` (equivalent under every reachable path) and the 20-entry buffer bound in `index.html` (a memory guard, not observable behaviour — pinning it would need a test-only accessor in production code).

## What this package deliberately leaves for later

- **Cross-device merge** (`app/sync.js`) — F12 is same-device only. Concurrent adds lost between devices, per-item stamps and tombstones are package F (L4 + G2), which gets its own reviewed cycle because it changes the format of live user data.
- **A `storage` event listener** for live cross-tab refresh. The spec mentions one; this package delivers the half that prevents *data loss* (every write is now a merge), which is the part that cannot be recovered. A listener only improves freshness of an already-correct store, and its stated policy ("in-memory wins for the paper open in the player") needs UX review before it starts changing a live exam under the taker. Worth a follow-up item.
- **`hanzi-writer` itself stays on jsdelivr** — vendoring its per-character data set is a much larger job, and after F5 the character section degrades gracefully instead of showing a dead box.
- **F15 (the 6.5 MB WAVs)** is owner work at the media host; nothing in this repository controls those bytes.
