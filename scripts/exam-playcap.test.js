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
        return new Promise(function (_, rej) { store._rej = rej; store.rejectors.push(rej); });
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
    pendingPlay: !!opts.pendingPlay, _rej: null, rejectors: [], el: null, written: {},
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

test('F4 REGRESSION: a STALE clip rejection cannot refund the NEXT clip', async () => {
  /* A rejected play() is queued on the media element's TASK source, not as a
     microtask, so it can land AFTER the user has started a different clip.
     Without a per-clip serial the stale rejection refunds — and marks failed —
     a clip that is fine: the cap is farmable with Play, Next, Play. */
  const App = boot({ pendingPlay: true });
  App.actions.playClip();                        // Q0 debited
  assert.equal((App.state.audioPlays || {})[0], 1);
  App.state.audioPlaying = false;
  App.actions.nextQ();                           // stops Q0; its rejection is now pending
  App.state.audioPlaying = false;
  App.actions.playClip();                        // Q1 debited
  assert.equal((App.state.audioPlays || {})[1], 1, 'Q1 debited');

  App._store.rejectors[0](new Error('interrupted'));   // the STALE one lands late
  await new Promise(function (r) { setTimeout(r, 0); });

  assert.equal((App.state.audioPlays || {})[0] || 0, 1, 'Q0 keeps its debit (user navigated away)');
  assert.equal((App.state.audioPlays || {})[1] || 0, 1, "Q1 is NOT refunded by Q0's stale rejection");
  assert.equal(App.state.audioErr, false, 'and Q1 is not marked failed');
  App._restore();
});
