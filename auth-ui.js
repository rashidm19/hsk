/**
 * Platform shell — profile, sign out, and in-app home links.
 */
(function () {
  'use strict';

  if (!document.body.classList.contains('app')) return;

  var APP_HOME = '/exams/';

  function fixAppHomeLinks() {
    document.querySelectorAll('.app-sidebar-foot a[href="/"]').forEach(function (a) {
      a.setAttribute('href', APP_HOME);
    });
    document.querySelectorAll(
      '.breadcrumb a[href="/"], nav[aria-label="Breadcrumb"] a[href="/"]'
    ).forEach(function (a) {
      a.setAttribute('href', APP_HOME);
    });
  }

  fixAppHomeLinks();

  var profileEl = document.querySelector('.app-profile');
  var nameEl = document.querySelector('.app-profile-name');
  var emailEl = document.querySelector('.app-profile-email');
  var avatarEl = document.querySelector('.app-profile-avatar');
  if (!profileEl || !nameEl || !emailEl || !avatarEl) return;

  profileEl.setAttribute('role', 'button');
  profileEl.setAttribute('tabindex', '0');
  profileEl.setAttribute('aria-label', 'Account menu');

  var menu = document.createElement('div');
  menu.className = 'app-profile-menu';
  menu.hidden = true;
  menu.innerHTML = '<button type="button" class="app-profile-menu-item" id="app-sign-out">Sign out</button>';
  profileEl.parentNode.appendChild(menu);

  function closeMenu() {
    menu.hidden = true;
    profileEl.setAttribute('aria-expanded', 'false');
  }

  function openMenu() {
    menu.hidden = false;
    profileEl.setAttribute('aria-expanded', 'true');
  }

  profileEl.addEventListener('click', function (e) {
    e.stopPropagation();
    menu.hidden ? openMenu() : closeMenu();
  });

  profileEl.addEventListener('keydown', function (e) {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      profileEl.click();
    }
  });

  document.addEventListener('click', closeMenu);

  document.getElementById('app-sign-out').addEventListener('click', function () {
    if (!window.HSKAuth) return;
    HSKAuth.signOut().then(function () {
      window.location.href = '/';
    });
  });

  function applyProfile(name, email, avatar) {
    nameEl.textContent = name || '';
    emailEl.textContent = email || '';
    avatarEl.textContent = avatar || '';
    profileEl.title = name || 'Account';
    profileEl.classList.add('is-hydrated');
  }

  function applyCachedProfile() {
    if (!window.HSKAuth || !HSKAuth.readProfileCache) return false;
    var cached = HSKAuth.readProfileCache();
    if (!cached) return false;
    applyProfile(cached.name, cached.email, cached.initials);
    return true;
  }

  applyCachedProfile();

  async function refresh() {
    if (!window.HSKAuth || !HSKAuth.isConfigured()) {
      applyProfile('Guest', 'Sign in to save progress', '?');
      return;
    }
    try {
      var user = await HSKAuth.getUser();
      if (!user) return;

      var cached = HSKAuth.readProfileCache && HSKAuth.readProfileCache();
      if (cached && cached.userId === user.id) {
        applyProfile(cached.name, cached.email, cached.initials);
      }

      var profile = null;
      if (!cached || cached.userId !== user.id) {
        profile = await HSKAuth.getProfile(user.id);
      }

      var name = HSKAuth.displayName(user, profile);
      var email = user.email || '';
      var avatar = HSKAuth.initials(name, email);
      applyProfile(name, email, avatar);

      HSKAuth.writeProfileCache({
        userId: user.id,
        name: name,
        email: email,
        initials: avatar,
      });
    } catch (e) {
      console.warn('[auth-ui]', e);
      if (!profileEl.classList.contains('is-hydrated')) {
        applyCachedProfile();
      }
    }
  }

  refresh();
  if (window.HSKAuth && HSKAuth.onAuthStateChange) {
    HSKAuth.onAuthStateChange(function () {
      refresh();
    });
  }
})();
