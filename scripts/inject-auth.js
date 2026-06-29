/**
 * Inject Supabase auth scripts into platform pages (body.app).
 * Run: node scripts/inject-auth.js
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const SKIP = new Set([
  path.join(ROOT, 'index.html'),
  path.join(ROOT, '404.html'),
  path.join(ROOT, 'auth', 'callback.html'),
]);
const SKIP_DIRS = new Set(['.git', 'node_modules', 'data', 'scripts', 'supabase', 'config']);

const HEAD_SNIPPET = `
<script src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2"></script>
<script src="/config/auth.js"></script>
<script src="/auth.js"></script>
<script src="/auth-guard.js"></script>
<script src="/auth-ui.js" defer></script>`;

const BODY_SNIPPET = '';

function walk(dir, out) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (SKIP_DIRS.has(entry.name)) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, out);
    else if (entry.name.endsWith('.html')) out.push(full);
  }
  return out;
}

function injectHead(html) {
  if (html.includes('/auth-ui.js" defer')) return html;
  if (!/\bclass="[^"]*\bapp\b/.test(html)) return html;
  if (html.includes('/auth-guard.js')) {
    return html.replace(
      /<script src="\/auth-guard\.js"><\/script>/,
      '<script src="/auth-guard.js"></script>\n<script src="/auth-ui.js" defer></script>'
    );
  }
  const marker = '<script>(function(){try{var t=localStorage.getItem';
  if (html.includes(marker)) {
    return html.replace(marker, HEAD_SNIPPET + '\n' + marker);
  }
  return html.replace(/<head>/i, '<head>' + HEAD_SNIPPET);
}

function injectBody(html) {
  if (html.includes('/auth-ui.js" defer')) return html;
  if (!/\bclass="[^"]*\bapp\b/.test(html)) return html;
  if (html.includes('<script src="/auth-ui.js"></script>')) {
    return html.replace(/\n?<script src="\/auth-ui\.js"><\/script>/g, '');
  }
  return html;
}

function addAuthPending(html) {
  if (!/\bclass="[^"]*\bapp\b/.test(html)) return html;
  if (html.includes('hsk-auth-pending')) return html;
  return html.replace(/<body class="app"/, '<body class="app hsk-auth-pending"');
}

let count = 0;
walk(ROOT, []).forEach((file) => {
  if (SKIP.has(file)) return;
  let html = fs.readFileSync(file, 'utf8');
  if (!/\bclass="[^"]*\bapp\b/.test(html)) return;
  const next = injectHead(injectBody(addAuthPending(html)));
  if (next !== html) {
    fs.writeFileSync(file, next, 'utf8');
    count++;
  }
});

console.log('[inject-auth] Updated ' + count + ' pages');
