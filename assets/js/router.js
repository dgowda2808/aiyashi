/**
 * router.js — tab navigation with top bar title sync
 */

const TABS = ['discover', 'matches', 'profile'];

const TAB_META = {
  discover: { title: 'Welcome back, Alex 👋', sub: '12 new profiles near you · Fully verified account' },
  matches:  { title: 'Matches',               sub: '5 new matches · 4 conversations' },
  profile:  { title: 'My Profile',            sub: 'Alex Rivera · Fully verified' },
};

let currentTab = 'discover';

function setTopBar(tab) {
  const meta = TAB_META[tab];
  if (!meta) return;
  const title = document.getElementById('top-bar-title');
  const sub   = document.getElementById('top-bar-sub');
  const filterBtn = document.getElementById('tb-filter-btn');
  const boostBtn  = document.getElementById('tb-boost-btn');
  if (title) title.textContent = meta.title;
  if (sub)   sub.textContent   = meta.sub;
  // Show/hide context actions
  if (filterBtn) filterBtn.style.display = tab === 'discover' ? '' : 'none';
  if (boostBtn)  boostBtn.style.display  = tab === 'discover' ? '' : 'none';
}

export function navigate(target) {
  if (!TABS.includes(target)) return;

  // Close mobile messages screen if open
  const mobileMsg = document.getElementById('screen-messages');
  if (mobileMsg) mobileMsg.classList.remove('active');

  TABS.forEach(t => {
    const screen  = document.getElementById('screen-' + t);
    const snavBtn = document.querySelector(`.snav-btn[data-nav="${t}"]`);
    const bnavBtn = document.getElementById('bnav-' + t);
    const isActive = t === target;
    if (screen)  screen.classList.toggle('active', isActive);
    if (snavBtn) snavBtn.classList.toggle('active', isActive);
    if (bnavBtn) bnavBtn.classList.toggle('active', isActive);
  });

  currentTab = target;
  setTopBar(target);
  history.replaceState(null, '', '#' + target);
}

export function openMobileMessages() {
  const mobileMsg = document.getElementById('screen-messages');
  if (mobileMsg) {
    mobileMsg.classList.add('active');
    setTimeout(() => {
      const list = document.getElementById('mobile-msg-list');
      if (list) list.scrollTop = list.scrollHeight;
    }, 60);
  }
}

export function closeMobileMessages() {
  const mobileMsg = document.getElementById('screen-messages');
  if (mobileMsg) mobileMsg.classList.remove('active');
}

export function initRouter() {
  // Sidebar + bottom nav buttons
  document.querySelectorAll('[data-nav]').forEach(el => {
    el.addEventListener('click', () => navigate(el.dataset.nav));
  });

  // Mobile back button
  const backBtn = document.querySelector('.msg-back-btn');
  if (backBtn) backBtn.addEventListener('click', closeMobileMessages);

  // Load from hash
  const hash = location.hash.replace('#', '');
  if (TABS.includes(hash)) navigate(hash);
  else navigate('discover');

  // Browser history
  window.addEventListener('popstate', () => {
    const h = location.hash.replace('#', '');
    if (TABS.includes(h)) navigate(h);
  });
}
