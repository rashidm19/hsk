/* Sidebar toggle + workspace link prefetch for app dashboard shell */
(function () {
  var sidebar = document.getElementById('app-sidebar');
  var backdrop = document.getElementById('sidebar-backdrop');
  var toggle = document.getElementById('sidebar-toggle');
  if (!sidebar || !toggle) return;

  function setOpen(open) {
    sidebar.classList.toggle('is-open', open);
    if (backdrop) {
      backdrop.hidden = !open;
      backdrop.classList.toggle('is-visible', open);
    }
    toggle.setAttribute('aria-expanded', open ? 'true' : 'false');
    toggle.setAttribute('aria-label', open ? 'Close menu' : 'Open menu');
  }

  toggle.addEventListener('click', function () {
    setOpen(!sidebar.classList.contains('is-open'));
  });
  if (backdrop) backdrop.addEventListener('click', function () { setOpen(false); });
  sidebar.querySelectorAll('.app-nav-link').forEach(function (link) {
    link.addEventListener('click', function () { setOpen(false); });
  });

  var prefetched = Object.create(null);

  function prefetchHref(href) {
    if (!href || href.charAt(0) !== '/' || prefetched[href]) return;
    prefetched[href] = true;
    var link = document.createElement('link');
    link.rel = 'prefetch';
    link.href = href;
    document.head.appendChild(link);
  }

  sidebar.querySelectorAll('.app-nav-link[href^="/"]').forEach(function (link) {
    var href = link.getAttribute('href');
    link.addEventListener('mouseenter', function () { prefetchHref(href); }, { passive: true });
    link.addEventListener('focus', function () { prefetchHref(href); }, { passive: true });
    link.addEventListener('touchstart', function () { prefetchHref(href); }, { passive: true });
  });

  if (window.requestIdleCallback) {
    requestIdleCallback(function () {
      sidebar.querySelectorAll('.app-nav-link[href^="/"]').forEach(function (link) {
        prefetchHref(link.getAttribute('href'));
      });
    }, { timeout: 2500 });
  }
})();
