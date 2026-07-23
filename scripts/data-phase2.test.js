/* Loads the REAL app/data.js in a mocked (fetch/window) env and locks L2: the
   phase-2 catalogs (Characters vs Study) normalize on INDEPENDENT chains, so a
   normalizer throw on one section's unexpected-shape JSON (e.g. a null grammar
   slug -> normalizeGrammar's g.slug.length TypeError) sets ONLY that section's
   error flag and never blanks the healthy other section — and a retry recovers a
   section whose data is fixed. Run: node scripts/data-phase2.test.js */
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

/* Minimal valid JSON for every catalog file the loader fetches; a test overrides
   individual entries to inject an unexpected shape. Char rows are valid so the
   Characters chain populates; grammar/confusables/… are empty-but-valid so the
   Study chain succeeds unless a test makes it throw. */
function baseFiles() {
  return {
    '/data/index.json': [],
    '/data/vocabulary.json': [],
    '/data/app-data.json': {},
    '/data/hsk4-characters.json': [{ char: '好', pinyin: 'hǎo', meaning: 'good' }],
    '/data/hsk4-rendu-characters.json': [],
    '/data/character-data.json': {},
    '/data/grammar-patterns.json': [],
    '/data/confusables.json': [],
    '/data/sentences.json': [],
    '/data/topics.json': {},
    '/data/task-dialogues.json': {},
    '/data/traps.json': [],
  };
}

/* Fresh module load with a fetch mock keyed on the `files` map (mutable — a test
   can swap an entry, then call D.retryFull() to re-fetch). */
function loadData(files) {
  const App = {};
  global.window = { App };
  global.document = { addEventListener() {} };
  global.fetch = function (url) {
    if (!(url in files)) return Promise.reject(new Error('no mock for ' + url));
    return Promise.resolve({ ok: true, json: function () { return Promise.resolve(files[url]); } });
  };
  const p = path.resolve(__dirname, '../app/data.js');
  delete require.cache[require.resolve(p)];
  require(p);
  return App.data;
}

/* Drive phase 1 (load) then phase 2 (loadFull → both catalog chains settle). */
async function boot(files) {
  const D = loadData(files);
  await D.load();
  await D.loadFull();
  return D;
}

test('both catalogs healthy → no error flags, sections populated', async () => {
  const D = await boot(baseFiles());
  assert.equal(D.readyFull, true);
  assert.equal(D.charsError, false);
  assert.equal(D.studyError, false);
  assert.ok(D.CHARS.length > 0, 'Characters populated');
});

test('L2: a Study normalizer throw does NOT flag Characters (healthy chars survive)', async () => {
  const files = baseFiles();
  files['/data/grammar-patterns.json'] = [{ slug: null, pattern_cn: 'x', pattern_en: 'y' }]; // g.slug.length → TypeError
  const D = await boot(files);
  assert.equal(D.readyFull, true, 'phase 2 still resolves');
  assert.equal(D.studyError, true, 'Study section flagged (its normalizer threw)');
  assert.equal(D.charsError, false, 'Characters NOT flagged despite the Study throw');
  assert.ok(D.CHARS.length > 0, 'Characters data stays populated');
});

test('L2: a Characters normalizer throw does NOT flag Study (healthy study survives)', async () => {
  const files = baseFiles();
  files['/data/hsk4-characters.json'] = [null]; // mk(null) → row.char → TypeError
  const D = await boot(files);
  assert.equal(D.readyFull, true, 'phase 2 still resolves');
  assert.equal(D.charsError, true, 'Characters section flagged (its normalizer threw)');
  assert.equal(D.studyError, false, 'Study NOT flagged despite the Characters throw');
});

test('L2: a real fetch failure flags only its own section (fetch-level decoupling still holds)', async () => {
  const files = baseFiles();
  const D = loadData(files);
  const realFetch = global.fetch;
  global.fetch = function (url) {
    if (url === '/data/character-data.json') return Promise.reject(new Error('offline'));
    return realFetch(url);
  };
  await D.load();
  await D.loadFull();
  assert.equal(D.charsError, true, 'Characters flagged (a char file 404’d)');
  assert.equal(D.studyError, false, 'Study unaffected by the char-file failure');
  assert.deepEqual(D.fullErrors, ['/data/character-data.json'], 'the failed file is recorded');
});

test('L2: retryFull re-runs both chains — a fixed Study section recovers, healthy Chars unaffected', async () => {
  const files = baseFiles();
  files['/data/grammar-patterns.json'] = [{ slug: null, pattern_cn: 'x', pattern_en: 'y' }];
  const D = await boot(files);
  assert.equal(D.studyError, true, 'precondition: Study errored on the bad slug');
  assert.equal(D.charsError, false);

  files['/data/grammar-patterns.json'] = []; // owner-side data fix
  await D.retryFull();
  assert.equal(D.studyError, false, 'Study recovers after the data is fixed');
  assert.equal(D.charsError, false, 'Characters stays healthy across the retry');
  assert.equal(D.readyFull, true);
});
