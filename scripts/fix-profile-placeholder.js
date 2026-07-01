/**
 * Remove hardcoded demo profile placeholders from app shell pages.
 * Run: node scripts/fix-profile-placeholder.js
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const SKIP_DIRS = new Set(['.git', 'node_modules', 'data', 'scripts', 'supabase', 'config', 'landing-v2']);

function walk(dir, out) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (SKIP_DIRS.has(entry.name)) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, out);
    else if (entry.name.endsWith('.html')) out.push(full);
  }
  return out;
}

let count = 0;
walk(ROOT, []).forEach((file) => {
  let html = fs.readFileSync(file, 'utf8');
  if (!html.includes('app-profile-name')) return;

  const next = html
    .replace(/<span class="app-profile-name">Alex Chen<\/span>/g, '<span class="app-profile-name"></span>')
    .replace(/<span class="app-profile-email">student@example\.com<\/span>/g, '<span class="app-profile-email"></span>')
    .replace(/<div class="app-profile-avatar" aria-hidden="true">AC<\/div>/g, '<div class="app-profile-avatar" aria-hidden="true"></div>');

  if (next !== html) {
    fs.writeFileSync(file, next, 'utf8');
    count++;
  }
});

console.log('[fix-profile-placeholder] Updated ' + count + ' pages');
