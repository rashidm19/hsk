/* Sidebar toggle for app dashboard shell */
(function () {
  const sidebar = document.getElementById('app-sidebar');
  const backdrop = document.getElementById('sidebar-backdrop');
  const toggle = document.getElementById('sidebar-toggle');
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
})();
