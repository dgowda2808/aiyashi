/**
 * app.js — entry point
 * Checks auth state, loads real data from API, wires UI
 */
import { initRouter, navigate, openMobileMessages } from './router.js';
import { initDiscover, revealPhoto } from './discover.js';
import { initMessages }   from './messages.js';
import { initProfile }    from './profile.js';
import { auth, profiles, matches, currentUser, tokens } from './api.js';
import { connectSocket, disconnectSocket, getSocket,
         joinMatch, sendMessage, sendTyping, sendStopTyping, markRead } from './socket.js';

// ── Auth gate ─────────────────────────────────────────────────────
function showAuthScreen() {
  document.getElementById('app-shell')?.classList.add('hidden');
  document.getElementById('auth-screen')?.classList.remove('hidden');
}
function showAppShell() {
  document.getElementById('auth-screen')?.classList.add('hidden');
  document.getElementById('app-shell')?.classList.remove('hidden');
}

// ── Top bar personalisation ───────────────────────────────────────
function updateTopBarUser() {
  const user = currentUser.get();
  if (!user) return;
  const titleEl = document.getElementById('top-bar-title');
  if (titleEl) titleEl.textContent = `Welcome back, ${user.display_name} 👋`;
}

// ── Role-based UI (female features) ──────────────────────────────
function initRoleFeatures() {
  const user = currentUser.get();
  if (!user) return;
  const isFemale = user.role === 'female';

  // Earnings banner on discover
  const banner = document.getElementById('earnings-banner');
  if (banner) banner.style.display = isFemale ? '' : 'none';

  // Female-only profile sections
  const femaleSection  = document.getElementById('section-female-only');
  const referralSection = document.getElementById('section-referral');
  if (femaleSection)   femaleSection.style.display   = isFemale ? '' : 'none';
  if (referralSection) referralSection.style.display = isFemale ? '' : 'none';

  // Populate referral link
  if (isFemale && user.referral_code) {
    const inp = document.getElementById('referral-link-input');
    if (inp) inp.value = `${location.origin}/?ref=${user.referral_code}`;
  }

  // Check if boost already used today
  if (isFemale && user.last_boost_at) {
    const lastBoost = new Date(user.last_boost_at);
    const today     = new Date();
    const sameDay   = lastBoost.toDateString() === today.toDateString();
    if (sameDay) {
      const btn = document.getElementById('boost-btn');
      const statusEl = document.getElementById('boost-status-text');
      if (btn) { btn.disabled = true; btn.textContent = 'Boosted Today ⚡'; btn.style.opacity = '0.6'; }
      if (statusEl) statusEl.textContent = 'Profile boosted! Come back tomorrow for your next free boost.';
    }
  }

  // Update top bar sub with credit balance
  if (user.credit_balance !== undefined) {
    const subEl = document.getElementById('top-bar-sub');
    if (subEl && isFemale) {
      subEl.textContent = `Premium Member · $${user.credit_balance} credit balance`;
    }
  }
}

// ── Discover feed ─────────────────────────────────────────────────
let discoverProfiles = [];
let currentCardIndex = 0;

async function loadDiscoverFeed() {
  try {
    discoverProfiles = await profiles.getDiscover(20);
    currentCardIndex = 0;
    renderCurrentCard();
  } catch (err) {
    console.error('Failed to load discover feed:', err);
  }
}

function renderCurrentCard() {
  const container = document.getElementById('cards-container');
  if (!container) return;

  const filtered = applyFilters(discoverProfiles);

  if (!filtered.length || currentCardIndex >= filtered.length) {
    container.innerHTML = `
      <div style="text-align:center;padding:60px 20px;color:var(--text-muted)">
        <div style="font-size:48px;margin-bottom:16px">🎉</div>
        <div style="font-size:18px;font-weight:700;color:var(--text-primary);margin-bottom:8px">You're all caught up!</div>
        <div style="font-size:13px">Check back later for new verified profiles</div>
      </div>`;
    return;
  }

  const p = filtered[currentCardIndex];
  const isVerified = p.email_verified || p.phone_verified;

  container.innerHTML = `
    <div class="card-stack-wrap" id="card-stack-wrap">
      <div class="card-shadow-2"></div>
      <div class="card-shadow-1"></div>
      <div class="profile-card" id="card-current" data-user-id="${p.id}">
        <div class="card-flash like-flash" id="flash-like-current"></div>
        <div class="card-flash nope-flash" id="flash-nope-current"></div>

        <div class="photo-area" id="photo-current">
          <div class="photo-placeholder"><div class="silhouette"></div></div>
          <div class="photo-gradient"></div>
          <div class="photo-top-badges">
            ${isVerified ? `<div class="face-check-badge"><svg viewBox="0 0 24 24" fill="currentColor" width="11" height="11"><path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41L9 16.17z"/></svg>Verified ✓</div>` : '<div></div>'}
            <div class="photo-distance">📍 ${p.location_text || 'Nearby'}</div>
          </div>
          <button class="reveal-btn" id="btn-reveal-current">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
            Reveal Photo
          </button>
          <div class="matched-note">Unlocks after matching</div>
        </div>

        <div class="profile-info">
          <div class="card-info-header">
            <div class="card-info-name-row">
              <span class="card-info-name">${p.display_name}</span>
              ${p.age ? `<span class="card-info-age">${p.age}</span>` : ''}
              <div class="online-dot"></div>
            </div>
            <div class="card-info-location">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="13" height="13"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg>
              ${p.occupation ? p.occupation + ' · ' : ''}${p.location_text || ''}
            </div>
          </div>
          <div class="verification-strip">
            ${p.email_verified ? `<span class="vbadge vbadge-email"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"/></svg>Email Verified</span>` : ''}
            ${p.phone_verified ? `<span class="vbadge vbadge-phone"><span class="carrier-dot carrier-${(p.carrier||'tm').toLowerCase().replace(/[^a-z]/g,'')}"></span><span class="carrier-label">${p.carrier||''}</span>Phone Verified</span>` : ''}
            ${p.face_verified  ? `<span class="vbadge vbadge-face"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><path d="M8 14s1.5 2 4 2 4-2 4-2"/></svg>Face Check</span>` : ''}
            ${p.is_premium     ? `<span class="vbadge vbadge-premium">⭐ Gold</span>` : ''}
          </div>
          ${p.bio ? `<div class="profile-bio">${p.bio}</div>` : ''}
          ${(p.interests||[]).length ? `<div class="interest-tags">${p.interests.map(i=>`<span class="tag">${i}</span>`).join('')}</div>` : ''}
          ${p.education || p.occupation ? `
          <div class="card-stats">
            ${p.education  ? `<div class="card-stat"><span class="cs-icon">🎓</span><span class="cs-val">${p.education}</span></div>` : ''}
            ${p.occupation ? `<div class="card-stat"><span class="cs-icon">💼</span><span class="cs-val">${p.occupation}</span></div>` : ''}
            ${p.relationship_goal ? `<div class="card-stat"><span class="cs-icon">💘</span><span class="cs-val">${p.relationship_goal}</span></div>` : ''}
          </div>` : ''}
          <div class="action-row">
            <div class="action-col"><button class="action-btn btn-super" data-action="super"  data-id="${p.id}" title="Super Like">⭐</button><div class="action-label">Super</div></div>
            <div class="action-col"><button class="action-btn btn-nope"  data-action="nope"   data-id="${p.id}" title="Nope">✕</button><div class="action-label">Nope</div></div>
            <div class="action-col"><button class="action-btn btn-like"  data-action="like"   data-id="${p.id}" title="Like">♡</button><div class="action-label">Like</div></div>
            <div class="action-col"><button class="action-btn btn-boost" data-action="boost"  data-id="${p.id}" title="Boost">⚡</button><div class="action-label">Boost</div></div>
          </div>
        </div>
      </div>
    </div>`;

  // Wire action buttons directly to handleSwipeAction
  container.querySelectorAll('[data-action]').forEach(btn => {
    btn.addEventListener('click', () => handleSwipeAction(btn.dataset.action, btn.dataset.id));
  });
  // Wire reveal button
  const revealBtn = container.querySelector('#btn-reveal-current');
  if (revealBtn) revealBtn.addEventListener('click', () => revealPhoto('current'));
}

// ── Load matches into sidebar ─────────────────────────────────────
async function loadMatches() {
  try {
    const list = await matches.getAll();
    renderMatchesList(list);
  } catch (err) {
    console.error('Failed to load matches:', err);
  }
}

function renderMatchesList(list) {
  // Update badge
  const unread = list.filter(m => parseInt(m.unread_count) > 0).length;
  document.querySelectorAll('.snav-badge, .bnav-badge').forEach(el => {
    el.textContent = unread || '';
    el.style.display = unread ? '' : 'none';
  });

  // Sidebar recent avatars
  const avatarWrap = document.querySelector('.sidebar-avatars');
  if (avatarWrap && list.length) {
    avatarWrap.innerHTML = list.slice(0, 5).map(m => `
      <div class="sa-bubble" data-match-id="${m.match_id}" data-open-chat>
        <div class="sa-avatar" style="background:linear-gradient(135deg,#7c3aed,#ec4899)">
          👤
          ${parseInt(m.unread_count) > 0 ? '<div class="sa-dot"></div>' : ''}
        </div>
        <div class="sa-name">${(m.display_name||'').split(' ')[0]}</div>
      </div>`).join('');
  }

  // Conv list on matches screen
  const convList = document.querySelector('.conv-list');
  if (!convList) return;

  convList.innerHTML = list.length ? list.map((m, i) => `
    <div class="conv-item ${i === 0 ? 'selected' : ''}" data-match-id="${m.match_id}" data-open-chat>
      <div class="conv-avatar" style="background:linear-gradient(135deg,#7c3aed,#ec4899)">
        👤
        ${parseInt(m.unread_count) > 0 ? '<div class="online-ring"></div>' : ''}
      </div>
      <div class="conv-details">
        <div class="conv-name-row">
          <span class="conv-name">${m.display_name}</span>
          ${m.phone_verified || m.email_verified ? `<span class="conv-verified-icon"><svg viewBox="0 0 24 24" fill="currentColor" width="12"><path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41L9 16.17z"/></svg></span>` : ''}
        </div>
        <div class="conv-preview ${parseInt(m.unread_count) > 0 ? 'unread' : ''}">
          ${m.last_message || 'Matched ' + new Date(m.matched_at).toLocaleDateString() + ' · Say hello!'}
        </div>
      </div>
      <div class="conv-meta">
        <div class="conv-time">${m.last_message_at ? timeAgo(m.last_message_at) : ''}</div>
        ${parseInt(m.unread_count) > 0 ? `<div class="conv-unread-badge">${m.unread_count}</div>` : ''}
      </div>
    </div>`).join('')
  : '<div style="padding:24px;text-align:center;color:var(--text-muted);font-size:13px">No matches yet — keep swiping!</div>';
}

// ── Open chat ─────────────────────────────────────────────────────
let activeMatchId = null;

async function openChat(matchId) {
  activeMatchId = matchId;
  joinMatch(matchId);

  // Load messages
  try {
    const msgs = await matches.getMessages(matchId, { limit: 50 });
    renderMessages(msgs, 'desktop-msg-list');
    renderMessages(msgs, 'mobile-msg-list');
    markRead(matchId);
  } catch (err) {
    console.error('Failed to load messages:', err);
  }
}

function renderMessages(msgs, listId) {
  const listEl = document.getElementById(listId);
  if (!listEl) return;
  const me = currentUser.get();

  listEl.innerHTML = msgs.map(msg => {
    const isMine = msg.sender_id === me?.id;
    return `
      <div class="msg-row ${isMine ? 'sent' : 'received'}">
        ${!isMine ? `<div class="msg-bubble-avatar">👤</div>` : ''}
        <div class="msg-bubble-group">
          <div class="msg-bubble">${escapeHtml(msg.content)}</div>
          <div class="msg-time">${new Date(msg.created_at).toLocaleTimeString([], {hour:'2-digit',minute:'2-digit'})}</div>
        </div>
      </div>`;
  }).join('');

  listEl.scrollTop = listEl.scrollHeight;
}

function appendMessage(msg, listId) {
  const listEl = document.getElementById(listId);
  if (!listEl) return;
  const me = currentUser.get();
  const isMine = msg.sender_id === me?.id;

  const div = document.createElement('div');
  div.className = `msg-row ${isMine ? 'sent' : 'received'}`;
  div.innerHTML = `
    ${!isMine ? `<div class="msg-bubble-avatar">👤</div>` : ''}
    <div class="msg-bubble-group">
      <div class="msg-bubble">${escapeHtml(msg.content)}</div>
      <div class="msg-time">${new Date(msg.created_at).toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'})}</div>
    </div>`;
  listEl.appendChild(div);
  listEl.scrollTop = listEl.scrollHeight;
}

// ── Socket.io event listeners ─────────────────────────────────────
function wireSocket() {
  const sock = getSocket();
  if (!sock) return;

  sock.on('new_message', (msg) => {
    if (msg.match_id === activeMatchId) {
      appendMessage(msg, 'desktop-msg-list');
      appendMessage(msg, 'mobile-msg-list');
      markRead(activeMatchId);
    }
    // Refresh matches list to update last message / unread
    loadMatches();
  });

  sock.on('typing', ({ matchId }) => {
    if (matchId !== activeMatchId) return;
    document.getElementById('typing-indicator')?.classList.add('active');
  });

  sock.on('stop_typing', ({ matchId }) => {
    if (matchId !== activeMatchId) return;
    document.getElementById('typing-indicator')?.classList.remove('active');
  });

  sock.on('match_event', (data) => {
    // Show match pop-up
    showMatchToast(data);
    loadMatches();
  });

  sock.on('error', (data) => {
    if (data?.code === 'MSG_LIMIT') {
      showMsgLimitToast(data.message);
    }
  });
}

// ── Message send ──────────────────────────────────────────────────
function wireSendButton(inputId, btnId) {
  const input = document.getElementById(inputId);
  const btn   = document.getElementById(btnId);
  if (!input || !btn) return;

  let typingTimer;

  const doSend = () => {
    const text = input.value.trim();
    if (!text || !activeMatchId) return;
    sendMessage(activeMatchId, text);
    input.value = '';
    sendStopTyping(activeMatchId);
  };

  btn.addEventListener('click', doSend);
  input.addEventListener('keydown', (e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); doSend(); } });
  input.addEventListener('input', () => {
    if (!activeMatchId) return;
    sendTyping(activeMatchId);
    clearTimeout(typingTimer);
    typingTimer = setTimeout(() => sendStopTyping(activeMatchId), 2000);
  });
}

// ── Message limit toast ───────────────────────────────────────────
function showMsgLimitToast(message) {
  const existing = document.getElementById('msg-limit-toast');
  if (existing) existing.remove();
  const toast = document.createElement('div');
  toast.id = 'msg-limit-toast';
  toast.style.cssText = 'position:fixed;bottom:24px;left:50%;transform:translateX(-50%) translateY(80px);opacity:0;transition:all .4s cubic-bezier(.34,1.56,.64,1);background:linear-gradient(135deg,#7c3aed,#6d28d9);color:#fff;padding:14px 22px;border-radius:16px;font-size:13px;font-weight:600;z-index:9999;max-width:320px;text-align:center;box-shadow:0 16px 40px rgba(124,58,237,.45)';
  toast.textContent = message || 'Daily limit reached (10/day). Upgrade to Premium for unlimited messages.';
  document.body.appendChild(toast);
  requestAnimationFrame(() => {
    toast.style.transform = 'translateX(-50%) translateY(0)';
    toast.style.opacity = '1';
  });
  setTimeout(() => {
    toast.style.transform = 'translateX(-50%) translateY(80px)';
    toast.style.opacity = '0';
    setTimeout(() => toast.remove(), 400);
  }, 4000);
}

// ── Match toast ───────────────────────────────────────────────────
function showMatchToast(data) {
  const toast = document.createElement('div');
  toast.className = 'match-toast';
  toast.innerHTML = `
    <div class="match-toast-inner">
      <div class="match-toast-icon">🎉</div>
      <div>
        <div class="match-toast-title">It's a Match!</div>
        <div class="match-toast-sub">You and ${data.matched_with?.display_name || 'someone'} liked each other</div>
      </div>
      <button class="match-toast-btn" id="match-toast-send">Send Message</button>
    </div>`;
  document.body.appendChild(toast);
  setTimeout(() => toast.classList.add('show'), 50);

  toast.querySelector('#match-toast-send')?.addEventListener('click', () => {
    navigate('matches');
    if (data.match_id) openChat(data.match_id);
    toast.remove();
  });

  setTimeout(() => { toast.classList.remove('show'); setTimeout(() => toast.remove(), 400); }, 5000);
}

// ── Conv item clicks ──────────────────────────────────────────────
function initConvItems() {
  document.addEventListener('click', async (e) => {
    const item = e.target.closest('[data-open-chat]');
    if (!item) return;

    const matchId = item.dataset.matchId;
    if (!matchId) return;

    document.querySelectorAll('.conv-item').forEach(c => c.classList.remove('selected'));
    if (item.classList.contains('conv-item')) item.classList.add('selected');

    await openChat(matchId);

    // Update chat header with matched user's name
    const matchData = document.querySelector(`.conv-item[data-match-id="${matchId}"] .conv-name`);
    const name = matchData?.textContent || 'Match';
    document.querySelectorAll('.msg-header-name').forEach(el => { el.childNodes[0].textContent = name + ' '; });

    if (window.innerWidth < 768) {
      navigate('matches');
      openMobileMessages();
    }
  });
}

// ── Swipe actions ─────────────────────────────────────────────────
export async function handleSwipeAction(action, userId) {
  // Boost is NOT a swipe — handle separately
  if (action === 'boost') {
    try {
      const { auth: authApi } = await import('./api.js');
      await authApi.boost();
      showMsgLimitToast('⚡ Profile boosted! You\'re now at the top of feeds for 30 min.');
      // Update boost button state in profile screen
      const btn = document.getElementById('boost-btn');
      if (btn) { btn.disabled = true; btn.textContent = 'Boosted Today ⚡'; btn.style.opacity = '0.6'; }
    } catch (err) {
      showMsgLimitToast(err.message || 'Could not boost right now');
    }
    return;
  }

  try {
    // Flash animation
    const flash = document.getElementById('flash-like-current');
    const nopeFlash = document.getElementById('flash-nope-current');
    if (action === 'like' || action === 'super') flash?.classList.add('active');
    if (action === 'nope') nopeFlash?.classList.add('active');

    setTimeout(() => {
      flash?.classList.remove('active');
      nopeFlash?.classList.remove('active');
    }, 400);

    const result = await swipes_api.swipe(userId, action);

    if (result.match) {
      showMatchToast(result);
      loadMatches();
    }

    // Advance to next card
    currentCardIndex++;
    setTimeout(renderCurrentCard, 300);

  } catch (err) {
    console.error('Swipe error:', err);
  }
}

// ── Helpers ───────────────────────────────────────────────────────
function escapeHtml(str) {
  return str.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

function timeAgo(date) {
  const secs = Math.floor((Date.now() - new Date(date)) / 1000);
  if (secs < 60)   return 'now';
  if (secs < 3600) return Math.floor(secs/60) + 'm';
  if (secs < 86400)return Math.floor(secs/3600) + 'h';
  return Math.floor(secs/86400) + 'd';
}

// Live clock
function startClock() {
  const el = document.querySelector('.status-bar .time');
  if (!el) return;
  const tick = () => el.textContent = new Date().toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'});
  tick();
  setInterval(tick, 30000);
}

// ── Lazy import to avoid circular dep ────────────────────────────
let swipes_api;

// ── Active filters ────────────────────────────────────────────────
let activeFilters = { minAge: 18, maxAge: 80, verifiedOnly: false, location: '' };

function applyFilters(profiles) {
  return profiles.filter(p => {
    if (activeFilters.verifiedOnly && !p.email_verified && !p.phone_verified) return false;
    if (p.age) {
      if (p.age < activeFilters.minAge) return false;
      if (p.age > activeFilters.maxAge) return false;
    }
    if (activeFilters.location) {
      const loc = (p.location_text || '').toLowerCase();
      if (!loc.includes(activeFilters.location.toLowerCase())) return false;
    }
    return true;
  });
}

function openFilterDrawer() {
  let drawer = document.getElementById('filter-drawer');
  if (!drawer) {
    drawer = document.createElement('div');
    drawer.id = 'filter-drawer';
    drawer.style.cssText = `position:fixed;top:0;right:0;width:320px;height:100%;background:#1a1a2e;border-left:1px solid rgba(255,255,255,0.08);z-index:8000;padding:28px 24px;overflow-y:auto;transform:translateX(100%);transition:transform .3s ease;box-shadow:-20px 0 60px rgba(0,0,0,.5)`;
    drawer.innerHTML = `
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:28px">
        <div style="font-size:17px;font-weight:700;color:#fff">Filters</div>
        <button id="filter-close" style="background:rgba(255,255,255,.08);border:none;color:#fff;width:32px;height:32px;border-radius:50%;cursor:pointer;font-size:16px">✕</button>
      </div>
      <div style="margin-bottom:20px">
        <div style="font-size:12px;font-weight:600;color:rgba(255,255,255,.5);text-transform:uppercase;letter-spacing:.8px;margin-bottom:10px">Age Range</div>
        <div style="display:flex;gap:10px;align-items:center">
          <input id="f-min-age" type="number" min="18" max="80" value="${activeFilters.minAge}" style="width:70px;padding:8px 10px;background:rgba(255,255,255,.07);border:1px solid rgba(255,255,255,.12);border-radius:10px;color:#fff;font-size:14px;text-align:center">
          <span style="color:rgba(255,255,255,.4)">to</span>
          <input id="f-max-age" type="number" min="18" max="80" value="${activeFilters.maxAge}" style="width:70px;padding:8px 10px;background:rgba(255,255,255,.07);border:1px solid rgba(255,255,255,.12);border-radius:10px;color:#fff;font-size:14px;text-align:center">
        </div>
      </div>
      <div style="margin-bottom:20px">
        <div style="font-size:12px;font-weight:600;color:rgba(255,255,255,.5);text-transform:uppercase;letter-spacing:.8px;margin-bottom:10px">Location</div>
        <input id="f-location" type="text" placeholder="City or area..." value="${activeFilters.location}" style="width:100%;box-sizing:border-box;padding:10px 14px;background:rgba(255,255,255,.07);border:1px solid rgba(255,255,255,.12);border-radius:10px;color:#fff;font-size:14px">
      </div>
      <div style="margin-bottom:28px">
        <label style="display:flex;align-items:center;gap:12px;cursor:pointer">
          <div id="f-verified-toggle" style="width:44px;height:24px;border-radius:12px;background:${activeFilters.verifiedOnly ? 'linear-gradient(135deg,#7c3aed,#ec4899)' : 'rgba(255,255,255,.15)'};position:relative;transition:.2s;flex-shrink:0">
            <div style="position:absolute;top:3px;left:${activeFilters.verifiedOnly ? '23px' : '3px'};width:18px;height:18px;border-radius:50%;background:#fff;transition:.2s"></div>
          </div>
          <span style="font-size:14px;color:rgba(255,255,255,.8)">Verified profiles only</span>
        </label>
      </div>
      <button id="filter-apply" style="width:100%;padding:14px;background:linear-gradient(135deg,#7c3aed,#ec4899);border:none;border-radius:14px;color:#fff;font-size:15px;font-weight:700;cursor:pointer">Apply Filters</button>
      <button id="filter-reset" style="width:100%;padding:12px;background:transparent;border:1px solid rgba(255,255,255,.12);border-radius:14px;color:rgba(255,255,255,.5);font-size:13px;cursor:pointer;margin-top:10px">Reset</button>
    `;
    document.body.appendChild(drawer);

    // Toggle handler
    let verifiedOn = activeFilters.verifiedOnly;
    drawer.querySelector('#f-verified-toggle').addEventListener('click', () => {
      verifiedOn = !verifiedOn;
      const tog = drawer.querySelector('#f-verified-toggle');
      tog.style.background = verifiedOn ? 'linear-gradient(135deg,#7c3aed,#ec4899)' : 'rgba(255,255,255,.15)';
      tog.querySelector('div').style.left = verifiedOn ? '23px' : '3px';
    });

    drawer.querySelector('#filter-apply').addEventListener('click', () => {
      activeFilters.minAge      = parseInt(drawer.querySelector('#f-min-age').value) || 18;
      activeFilters.maxAge      = parseInt(drawer.querySelector('#f-max-age').value) || 80;
      activeFilters.location    = drawer.querySelector('#f-location').value.trim();
      activeFilters.verifiedOnly = verifiedOn;
      closeFilterDrawer();
      currentCardIndex = 0;
      renderCurrentCard();
    });

    drawer.querySelector('#filter-reset').addEventListener('click', () => {
      activeFilters = { minAge: 18, maxAge: 80, verifiedOnly: false, location: '' };
      verifiedOn = false;
      closeFilterDrawer();
      currentCardIndex = 0;
      renderCurrentCard();
    });

    drawer.querySelector('#filter-close').addEventListener('click', closeFilterDrawer);

    // Click outside to close
    document.addEventListener('click', (e) => {
      if (!drawer.contains(e.target) && !document.getElementById('tb-filter-btn')?.contains(e.target)) {
        closeFilterDrawer();
      }
    });
  }
  requestAnimationFrame(() => { drawer.style.transform = 'translateX(0)'; });
}

function closeFilterDrawer() {
  const d = document.getElementById('filter-drawer');
  if (d) d.style.transform = 'translateX(100%)';
}

// ── Boot ──────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', async () => {
  const { swipes: swipesModule } = await import('./api.js');
  swipes_api = swipesModule;

  // Check auth
  if (!auth.isLoggedIn()) {
    showAuthScreen();
    return;
  }

  // Verify token is still valid
  try {
    await auth.me();
  } catch {
    tokens.clear();
    showAuthScreen();
    return;
  }

  showAppShell();
  updateTopBarUser();
  initRoleFeatures();
  connectSocket();

  initDiscover();
  initMessages();
  initProfile();
  initRouter();
  initConvItems();
  startClock();

  wireSocket();
  wireSendButton('msg-input',           'msg-send-btn');
  wireSendButton('mobile-msg-input',    'mobile-msg-send-btn');

  // Wire top-bar buttons
  document.getElementById('tb-filter-btn')?.addEventListener('click', openFilterDrawer);
  document.getElementById('tb-boost-btn')?.addEventListener('click', async () => {
    try {
      const { auth: authApi } = await import('./api.js');
      await authApi.boost();
      showMsgLimitToast('⚡ Profile boosted! You\'re at the top of feeds for 30 min.');
    } catch (err) {
      showMsgLimitToast(err.message || 'Already boosted today — come back tomorrow!');
    }
  });
  document.getElementById('tb-gold-btn')?.addEventListener('click', () => {
    navigate('profile');
    setTimeout(() => {
      document.getElementById('section-female-only')?.scrollIntoView({ behavior: 'smooth' });
    }, 200);
  });

  // Load data
  loadDiscoverFeed();
  loadMatches();

  // Listen for logout from token refresh failure
  window.addEventListener('auth:logout', () => {
    disconnectSocket();
    showAuthScreen();
  });
});
