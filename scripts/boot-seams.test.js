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

test('F11: the boundary runs BEFORE the app modules and the vendor/auth scripts', () => {
  const boundary = HTML.indexOf('__hskFlushErrors');
  assert.ok(boundary >= 0, 'boundary present');
  ['/vendor/supabase-js', '/auth-guard.js', '/app/core.js', 'mc.yandex.ru'].forEach((needle) => {
    assert.ok(boundary < HTML.indexOf(needle), 'boundary precedes ' + needle);
  });
});

/* ---- the boundary block is inline HTML too: execute it, don't grep it ---- */
function runBoundary() {
  const m = HTML.match(/<script>\n\(function\(\)\{\s*\n?\s*var CAP=[\s\S]*?\}\)\(\);\n<\/script>/);
  assert.ok(m, 'boundary IIFE found in app/index.html');
  const code = m[0].replace(/^<script>\n/, '').replace(/\n<\/script>$/, '');
  const goals = [], warns = [], listeners = {};
  const sandbox = {
    console: { warn: (...a) => warns.push(a.join(' ')) },
    location: { origin: 'https://www.hskprep.cc' },
  };
  sandbox.window = sandbox;
  sandbox.addEventListener = (k, fn, capture) => { (listeners[k] = listeners[k] || []).push({ fn, capture }); };
  vm.createContext(sandbox);
  vm.runInContext(code, sandbox);
  return {
    sandbox, goals, warns, listeners,
    fireResource(url) {
      const ev = { target: { src: url } };
      listeners.error.forEach((l) => l.fn(ev));
    },
    fireError(msg) { listeners.error.forEach((l) => l.fn({ message: msg })); },
    enableGoal() { sandbox.ymGoal = (name, params) => goals.push({ name, params }); },
    flush() { sandbox.__hskFlushErrors(); },
  };
}

test('F11: the error listener is registered with capture (resource errors do not bubble)', () => {
  const b = runBoundary();
  assert.ok(b.listeners.error && b.listeners.error.length, "an 'error' listener exists");
  assert.equal(b.listeners.error[0].capture, true, 'capture:true — else a 404\'d <script> is never seen');
});

test('F11: reports before ymGoal are BUFFERED, consume no cap, then flush', () => {
  const b = runBoundary();
  for (let i = 0; i < 30; i++) b.fireError('boom ' + i);
  assert.equal(b.goals.length, 0, 'nothing sent while ymGoal is undefined');
  b.enableGoal();
  b.flush();
  assert.equal(b.goals.length, 5, 'the 5-per-session cap is spent on real reports, not burned early');
});

test('F11: the buffer is BOUNDED (a boot-time error storm cannot grow it without limit)', () => {
  const b = runBoundary();
  for (let i = 0; i < 500; i++) b.fireError('storm ' + i);
  b.enableGoal();
  b.flush();
  assert.ok(b.goals.length <= 5, 'still capped after a storm');
  assert.equal(b.warns.length, 500, 'every one was still consoled');
});

test('F11: third-party losses have their OWN budget and cannot crowd out ours', () => {
  const b = runBoundary();
  b.enableGoal();
  for (let i = 0; i < 10; i++) b.fireResource('https://fonts.gstatic.com/f' + i + '.woff2');
  const thirdParty = b.goals.length;
  assert.ok(thirdParty <= 2, '3P capped low; got ' + thirdParty);
  for (let i = 0; i < 10; i++) b.fireResource('https://www.hskprep.cc/app/mod' + i + '.js');
  const ours = b.goals.length - thirdParty;
  assert.equal(ours, 5, 'OUR five are still fully available after the 3P flood');
});

test('F11: resource origin classification', () => {
  const b = runBoundary();
  b.enableGoal();
  b.fireResource('https://www.hskprep.cc/app/core.js');
  b.fireResource('/app/vocab.js');
  b.fireResource('https://cdn.jsdelivr.net/npm/hanzi-writer@3.7/dist/hanzi-writer.min.js');
  const kinds = b.goals.map((g) => g.params.kind);
  assert.deepEqual(kinds, ['resource', 'resource', 'res3p'],
    'same-origin and relative are OURS; a CDN is third-party');
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
