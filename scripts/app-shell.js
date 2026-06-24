/**
 * Shared dashboard shell — sidebar nav, top bar, profile.
 * Used by build.js injectAppShell() and page generators.
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');

const NAV = [
  { id: 'exams', href: '/exams/', label: 'Mock Exams', icon: '<rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/>' },
  { id: 'vocabulary', href: '/vocabulary/', label: 'Vocabulary', icon: '<path d="M4 19.5A2.5 2.5 0 016.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 014 19.5v-15A2.5 2.5 0 016.5 2z"/>' },
  { id: 'characters', href: '/characters/', label: 'Characters', icon: '<path d="M12 20h9"/><path d="M16.5 3.5a2.12 2.12 0 013 3L7 19l-4 1 1-4L16.5 3.5z"/>' },
  { id: 'grammar', href: '/grammar/', label: 'Grammar', icon: '<path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><path d="M14 2v6h6M16 13H8M16 17H8M10 9H8"/>' },
  { id: 'sentences', href: '/sentences/', label: 'Sentences', icon: '<path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z"/>' },
  { id: 'strategies', href: '/strategies/', label: 'Strategies', icon: '<circle cx="12" cy="12" r="10"/><path d="M12 16v-4M12 8h.01"/>' },
  { id: 'topics', href: '/topics/', label: 'Topics', icon: '<path d="M22 19a2 2 0 01-2 2H4a2 2 0 01-2-2V5a2 2 0 012-2h5l2 3h9a2 2 0 012 2z"/>' },
  { id: 'words', href: '/words/', label: 'Words', icon: '<path d="M16 3h5v5M8 3H3v5M3 16v5h5M21 16v5h-5"/><path d="M4 4l16 16"/>' },
  { id: 'compare', href: '/compare/', label: 'Compare', icon: '<path d="M18 20V10M12 20V4M6 20v-6"/>' },
  { id: 'traps', href: '/traps/', label: 'Traps', icon: '<path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/><path d="M12 9v4M12 17h.01"/>' },
  { id: 'guide', href: '/guide/', label: 'Guide', icon: '<circle cx="12" cy="12" r="10"/><path d="M9.09 9a3 3 0 015.83 1c0 2-3 3-3 3M12 17h.01"/>' },
];

function detectActiveNav(filePath) {
  const rel = path.relative(ROOT, filePath).replace(/\\/g, '/');
  if (rel === 'exams/index.html' || rel.startsWith('test/') || rel.startsWith('train/') || rel.startsWith('practice/')) return 'exams';
  if (rel.startsWith('vocabulary/')) return 'vocabulary';
  if (rel.startsWith('characters/')) return 'characters';
  if (rel.startsWith('grammar/') || rel.startsWith('writing/')) return 'grammar';
  if (rel.startsWith('sentences/')) return 'sentences';
  if (rel.startsWith('strategies/')) return 'strategies';
  if (rel.startsWith('topics/')) return 'topics';
  if (rel.startsWith('words/')) return 'words';
  if (rel.startsWith('compare/')) return 'compare';
  if (rel.startsWith('traps/')) return 'traps';
  if (rel.startsWith('guide/')) return 'guide';
  return '';
}

function navLinks(active) {
  return NAV.map(item => {
    const on = active === item.id;
    return `      <a href="${item.href}" class="app-nav-link${on ? ' is-active' : ''}"${on ? ' aria-current="page"' : ''}>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">${item.icon}</svg>
        ${item.label}
      </a>`;
  }).join('\n');
}

function renderAppShellOpen(active) {
  return `<div class="app-layout">
  <aside class="app-sidebar" id="app-sidebar" aria-label="Main navigation">
    <a href="/exams/" class="app-brand">
      <img src="/logo.svg" alt="" width="84" height="28">
      <span>HSK Prep</span>
    </a>
    <div class="app-nav-label">Workspace</div>
    <nav class="app-nav">
${navLinks(active)}
    </nav>
    <div class="app-sidebar-foot">
      <a href="/" class="app-nav-link">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z"/></svg>
        Home
      </a>
    </div>
  </aside>

  <div class="app-main">
    <header class="app-topbar">
      <button type="button" class="app-menu-btn" id="sidebar-toggle" aria-label="Open menu" aria-expanded="false" aria-controls="app-sidebar">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M3 12h18M3 6h18M3 18h18"/></svg>
      </button>
      <div class="app-search">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><circle cx="11" cy="11" r="8"/><path d="M21 21l-4.35-4.35"/></svg>
        <input type="search" placeholder="Search tests, vocabulary…" aria-label="Search" disabled>
      </div>
      <div class="app-topbar-actions">
        <button type="button" class="app-icon-btn app-theme-btn" aria-label="Toggle dark mode" title="Toggle dark mode" onclick="(function(d){var k=d.getAttribute('data-theme')==='dark';if(k){d.removeAttribute('data-theme')}else{d.setAttribute('data-theme','dark')}try{localStorage.setItem('hsk4_theme',k?'light':'dark')}catch(e){}})(document.documentElement)">
          <svg class="ic-moon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>
          <svg class="ic-sun" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><circle cx="12" cy="12" r="5"/><path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42"/></svg>
        </button>
        <div class="app-profile" id="app-profile-btn">
          <div class="app-profile-info">
            <span class="app-profile-name">Loading…</span>
            <span class="app-profile-email"></span>
          </div>
          <div class="app-profile-avatar" aria-hidden="true">…</div>
        </div>
      </div>
    </header>

    <div class="app-content">`;
}

function renderAppShellClose() {
  return `    </div><!-- .app-content -->
  </div><!-- .app-main -->
</div><!-- .app-layout -->

<div class="app-sidebar-backdrop" id="sidebar-backdrop" hidden></div>
<script src="/shell.js"><\/script>
<script src="/auth-ui.js"><\/script>`;
}

function ensureBodyApp(html) {
  if (/\bclass="[^"]*\bapp\b/.test(html)) return html;
  if (/<body\s+class="([^"]*)"/.test(html)) {
    return html.replace(/<body\s+class="([^"]*)"/, '<body class="app $1"');
  }
  return html.replace(/<body(\s*)>/, '<body class="app"$1>');
}

function ensureDashboardCss(html) {
  if (html.includes('dashboard.css')) return html;
  return html.replace(
    /<link rel="stylesheet" href="\/common\.css">/,
    '<link rel="stylesheet" href="/common.css">\n<link rel="stylesheet" href="/dashboard.css">'
  );
}

function injectAppShell() {
  const SKIP = new Set([
    path.join(ROOT, 'index.html'),
    path.join(ROOT, '404.html'),
  ]);
  const SKIP_DIRS = new Set(['.git', 'node_modules', 'data', 'scripts']);

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
  walk(ROOT, []).forEach(f => {
    if (SKIP.has(f)) return;
    let html = fs.readFileSync(f, 'utf8');
    if (html.includes('id="app-sidebar"')) return;
    if (/\bclass="[^"]*\blp\b/.test(html)) return;
    if (!/<main[\s>]/i.test(html)) return;

    html = ensureBodyApp(html);
    html = html.replace(/<header>[\s\S]*?<\/header>\s*/i, '');
    html = ensureDashboardCss(html);

    const active = detectActiveNav(f);
    html = html.replace(/<main/i, renderAppShellOpen(active) + '\n<main');

    if (/<\/footer>/i.test(html)) {
      html = html.replace(/<\/footer>/i, '</footer>\n' + renderAppShellClose());
    } else {
      html = html.replace(/<\/main>/i, '</main>\n' + renderAppShellClose());
    }

    if (!html.includes('shell.js')) {
      html = html.replace(/<\/body>/i, '<script src="/shell.js"><\/script>\n</body>');
    }

    fs.writeFileSync(f, html, 'utf8');
    count++;
  });

  console.log(`[shell] Injected app shell into ${count} pages`);
  return count;
}

module.exports = {
  NAV,
  detectActiveNav,
  renderAppShellOpen,
  renderAppShellClose,
  injectAppShell,
};

if (require.main === module) {
  injectAppShell();
}
