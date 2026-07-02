# App Shell — HSK Prep dashboard chrome

Every logged-in screen lives inside this shell. Requirements:

1. `<body class="app">` — this class remaps the shared tokens to the dashboard set
   (`--dash-*`) and sets the parchment app background. Without it the shell is unstyled.
2. Structure (copy from `AppShell.html`, it is the site's real markup):

```html
<body class="app">
<div class="app-layout">
  <aside class="app-sidebar">
    <a class="app-brand"><span>HSK Prep</span></a>
    <div class="app-nav-label">Workspace</div>
    <nav class="app-nav">
      <a class="app-nav-link is-active">…</a>   <!-- 24×24 stroke SVG icon + label -->
    </nav>
    <div class="app-sidebar-foot">…</div>
  </aside>
  <div class="app-main">
    <header class="app-topbar">…</header>       <!-- .app-menu-btn, .app-search, .app-topbar-actions -->
    <div class="app-content">PAGE CONTENT HERE</div>
  </div>
</div>
</body>
```

- Active nav item: `.app-nav-link.is-active`. Icons: inline SVG, `stroke="currentColor"`, stroke-width 2.
- Page header inside content: `<div class="dash-head"><h1>Title</h1></div>` then `.dash-stats` cards.
- Topbar right side: `.app-icon-btn` buttons + `.app-profile` (name/email + `.app-profile-avatar`).
  Add `.is-hydrated` on `.app-profile` in designs — without it the name/avatar are hidden
  (the production site reveals them only after auth JS populates them).
- Dark mode: `data-theme="dark"` on `<html>` restyles the whole shell.
- Sidebar collapses behind `.app-menu-btn` on mobile (handled by site CSS breakpoints).
