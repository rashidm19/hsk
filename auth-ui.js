/**
 * Platform shell — live profile + sign out.
 */
(function () {
  'use strict';

  if (!document.body.classList.contains('app')) return;

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

  async function refresh() {
    if (!window.HSKAuth || !HSKAuth.isConfigured()) {
      nameEl.textContent = 'Guest';
      emailEl.textContent = 'Sign in on home page';
      avatarEl.textContent = '?';
      return;
    }
    try {
      var user = await HSKAuth.getUser();
      if (!user) return;
      var profile = await HSKAuth.getProfile(user.id);
      var name = HSKAuth.displayName(user, profile);
      nameEl.textContent = name;
      emailEl.textContent = user.email || '';
      avatarEl.textContent = HSKAuth.initials(name, user.email);
      profileEl.title = name;
    } catch (e) {
      console.warn('[auth-ui]', e);
    }
  }

  refresh();
  if (window.HSKAuth && HSKAuth.onAuthStateChange) {
    HSKAuth.onAuthStateChange(function () {
      refresh();
    });
  }
})();
