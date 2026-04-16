/**
 * router.js — tab navigation for new app shell
 */

const TABS = ['browse', 'matches', 'activity', 'profile'];

let currentTab = 'browse';

export function navigate(target) {
  if (!TABS.includes(target)) return;

  TABS.forEach(t => {
    const screen = document.getElementById('screen-' + t);
    if (screen) screen.classList.toggle('active', t === target);

    // Desktop nav links
    document.querySelectorAll(`.app-nav-link[data-nav="${t}"]`).forEach(el =>
      el.classList.toggle('active', t === target)
    );
    // Mobile nav buttons
    document.querySelectorAll(`.mnav-btn[data-nav="${t}"]`).forEach(el =>
      el.classList.toggle('active', t === target)
    );
  });

  currentTab = target;
  history.replaceState(null, '', '#' + target);
}

export function getCurrentTab() { return currentTab; }

export function initRouter() {
  // Wire all [data-nav] elements
  document.querySelectorAll('[data-nav]').forEach(el => {
    el.addEventListener('click', () => navigate(el.dataset.nav));
  });

  // Load from hash
  const hash = location.hash.replace('#', '');
  if (TABS.includes(hash)) navigate(hash);
  else navigate('browse');

  // Browser back/forward
  window.addEventListener('popstate', () => {
    const h = location.hash.replace('#', '');
    if (TABS.includes(h)) navigate(h);
  });
}
