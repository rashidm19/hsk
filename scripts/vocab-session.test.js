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
