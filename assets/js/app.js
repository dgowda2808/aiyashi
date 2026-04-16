/**
 * app.js — entry point (redesigned for browse-grid UI)
 * Matches index.html element IDs exactly.
 */
import { initRouter, navigate as _navigate } from './router.js';
// Expose navigate globally for inline onclick attributes
window.navigate = function(tab) { _navigate(tab); };
const navigate = _navigate;
import { initProfile }    from './profile.js';
import { auth, profiles, matches, swipes, currentUser, tokens } from './api.js';
import { connectSocket, disconnectSocket, getSocket,
         joinMatch, sendMessage, sendTyping, sendStopTyping, markRead } from './socket.js';

// ── Auth gate ─────────────────────────────────────────────────────
function showAuthScreen() {
  document.getElementById('landing-page')?.classList.remove('hidden');
  const shell = document.getElementById('app-shell');
  if (shell) { shell.classList.add('hidden'); shell.style.display = ''; }
}

function showAppShell() {
  document.getElementById('landing-page')?.classList.add('hidden');
  const shell = document.getElementById('app-shell');
  if (shell) { shell.classList.remove('hidden'); shell.style.display = 'flex'; }
}

// ── Nav personalisation ───────────────────────────────────────────
function updateNavUser() {
  const user = currentUser.get();
  if (!user) return;

  const letterEl = document.getElementById('app-nav-avatar-letter');
  const nameEl   = document.getElementById('anm-name');
  const roleEl   = document.getElementById('anm-role');

  if (letterEl) {
    if (user.photos?.length) {
      letterEl.innerHTML = `<img src="/uploads/${user.photos[0]}" style="width:100%;height:100%;object-fit:cover;border-radius:50%" alt="me">`;
    } else {
      letterEl.textContent = (user.display_name || 'U').charAt(0).toUpperCase();
    }
  }
  if (nameEl)  nameEl.textContent = user.display_name || 'My Account';
  if (roleEl)  roleEl.textContent = user.role === 'female' ? '👩 Sugar Baby · Premium' : '💎 Sugar Daddy';

  // Credit badge on profile screen
  const creditBadge = document.getElementById('pp-credit-badge');
  const creditVal   = document.getElementById('pp-credit-val');
  if (creditBadge && creditVal && user.role === 'female') {
    creditBadge.classList.remove('hidden');
    creditVal.textContent = `$${user.credit_balance || 0} Credit`;
  }
  // Profile hero
  const ppName = document.getElementById('pp-name');
  if (ppName) ppName.textContent = user.display_name || '—';

  // Pre-fill edit fields
  const editName = document.getElementById('pp-edit-name');
  const editAge  = document.getElementById('pp-edit-age');
  const editOcc  = document.getElementById('pp-edit-occ');
  const editLoc  = document.getElementById('pp-edit-loc');
  const editBio  = document.getElementById('pp-edit-bio');
  if (editName && user.display_name) editName.value = user.display_name;
  if (editAge  && user.age)          editAge.value  = user.age;
  if (editOcc  && user.occupation)   editOcc.value  = user.occupation;
  if (editLoc  && user.location_text)editLoc.value  = user.location_text;
  if (editBio  && user.bio)          editBio.value  = user.bio;
}

// ── Role-based UI ─────────────────────────────────────────────────
function initRoleFeatures() {
  const user = currentUser.get();
  if (!user) return;
  const isFemale = user.role === 'female';

  // Earnings card in sidebar
  const earnCard = document.getElementById('earn-card');
  if (earnCard) earnCard.classList.toggle('hidden', !isFemale);

  // Referral card in sidebar
  const bsRef = document.getElementById('bs-referral-card');
  if (bsRef) bsRef.classList.toggle('hidden', !isFemale);

  // Boost & referral sections on profile screen
  const ppBoost = document.getElementById('pp-boost-section');
  const ppRef   = document.getElementById('pp-referral-section');
  if (ppBoost) ppBoost.classList.toggle('hidden', !isFemale);
  if (ppRef)   ppRef.classList.toggle('hidden', !isFemale);

  // Populate referral links
  if (user.referral_code) {
    const ref = `${location.origin}/?ref=${user.referral_code}`;
    const ppRefInput = document.getElementById('pp-ref-link');
    const bsrLink    = document.getElementById('bsr-link');
    if (ppRefInput) ppRefInput.value = ref;
    if (bsrLink)    bsrLink.value    = ref;
  }

  // Boost button: already used today?
  if (user.last_boost_at) {
    const sameDay = new Date(user.last_boost_at).toDateString() === new Date().toDateString();
    if (sameDay) {
      const b1 = document.getElementById('app-boost-btn');
      const b2 = document.getElementById('pp-boost-btn');
      if (b1) { b1.disabled = true; b1.style.opacity = '0.6'; b1.textContent = '⚡ Boosted'; }
      if (b2) { b2.disabled = true; b2.style.opacity = '0.6'; b2.textContent = 'Boosted!'; }
    }
  }
}

// ── Browse / Discover feed ────────────────────────────────────────
let browseProfiles = [];
let browseOffset   = 0;
const BROWSE_LIMIT = 12;
let activeFilters  = { minAge: 18, maxAge: 80, verifiedOnly: false, onlineOnly: false, location: '', race: '', gender: 'both', occupation: '', income: '' };
let currentBrowseSort = 'relevance';

function buildBrowseParams(offset = 0) {
  const params = new URLSearchParams({ limit: BROWSE_LIMIT, offset, sort: currentBrowseSort });
  if (activeFilters.race)       params.set('race',       activeFilters.race);
  if (activeFilters.gender && activeFilters.gender !== 'both') params.set('gender', activeFilters.gender);
  if (activeFilters.minAge && activeFilters.minAge > 18)  params.set('min_age', activeFilters.minAge);
  if (activeFilters.maxAge && activeFilters.maxAge < 80)  params.set('max_age', activeFilters.maxAge);
  if (activeFilters.location)   params.set('location',   activeFilters.location);
  if (activeFilters.occupation) params.set('occupation', activeFilters.occupation);
  if (activeFilters.income)     params.set('income',     activeFilters.income);
  return params;
}

async function loadBrowseFeed(sort) {
  if (sort) currentBrowseSort = sort;
  browseOffset = 0;
  browseProfiles = [];
  const grid = document.getElementById('profiles-grid');
  if (grid) grid.innerHTML = '<div style="grid-column:1/-1;text-align:center;padding:60px 24px;color:#9C8878"><div class="spinner"></div><p style="margin-top:16px">Finding matches for you…</p></div>';

  try {
    const fetched = await profiles.getDiscover(BROWSE_LIMIT, buildBrowseParams(0));
    browseProfiles = fetched;
    renderBrowseGrid();
    // Show/hide Load More button
    const lm = document.getElementById('browse-load-more');
    if (lm) lm.style.display = fetched.length >= BROWSE_LIMIT ? 'block' : 'none';
  } catch (err) {
    console.error('Browse error:', err);
    if (grid) grid.innerHTML = '<div style="grid-column:1/-1;text-align:center;padding:60px 24px;color:#9C8878">😔 Could not load profiles. Please refresh.</div>';
  }
}

window.loadMoreProfiles = async function() {
  browseOffset += BROWSE_LIMIT;
  try {
    const more = await profiles.getDiscover(BROWSE_LIMIT, buildBrowseParams(browseOffset));
    browseProfiles = [...browseProfiles, ...more];
    renderBrowseGrid();
    const lm = document.getElementById('browse-load-more');
    if (lm) lm.style.display = more.length >= BROWSE_LIMIT ? 'block' : 'none';
  } catch (err) {
    showInlineToast('Could not load more profiles');
  }
};

window.setBrowseTab = function(btn, sort) {
  document.querySelectorAll('.browse-tab').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  loadBrowseFeed(sort);
};

function applyFilters(list) {
  return list.filter(p => {
    if (activeFilters.verifiedOnly && !p.email_verified && !p.phone_verified && !p.face_verified) return false;
    if (activeFilters.onlineOnly   && !isRecentlyActive(p.last_seen)) return false;
    return true;
  });
}

function renderBrowseGrid() {
  const grid = document.getElementById('profiles-grid');
  if (!grid) return;

  const filtered = applyFilters(browseProfiles);
  const countEl  = document.getElementById('browse-count');
  if (countEl) countEl.textContent = `${filtered.length} profiles`;

  if (!filtered.length) {
    grid.innerHTML = '<div style="grid-column:1/-1;text-align:center;padding:60px 24px;color:#9C8878">🔍 No profiles match your filters.</div>';
    return;
  }

  grid.innerHTML = filtered.map(p => {
    const photo = p.photos?.length ? `/uploads/${p.photos[0]}` : null;
    return `
      <div class="profile-card" data-id="${p.id}">
        <div class="pc-photo">
          ${photo
            ? `<img src="${photo}" alt="${escapeHtml(p.display_name || '')}" loading="lazy">`
            : `<div class="pc-photo-placeholder">👤</div>`}
          <div class="pc-badges">
            ${p.is_premium   ? `<span class="pc-badge premium">⭐ Gold</span>`     : ''}
            ${p.face_verified ? `<span class="pc-badge verified">✓ Verified</span>` : ''}
          </div>
          ${isRecentlyActive(p.last_seen) ? `<div class="pc-online"></div>` : ''}
        </div>
        <div class="pc-info">
          <div class="pc-name">${escapeHtml(p.display_name || 'Member')}</div>
          <div class="pc-meta">
            ${p.age           ? `<span>🎂 ${p.age}</span>`              : ''}
            ${p.location_text ? `<span>📍 ${escapeHtml(p.location_text)}</span>` : ''}
          </div>
        </div>
      </div>`;
  }).join('');

  grid.querySelectorAll('.profile-card').forEach(card => {
    card.addEventListener('click', () => {
      const p = filtered.find(x => String(x.id) === String(card.dataset.id));
      if (p) openProfileModal(p);
    });
  });
}

function isRecentlyActive(lastSeen) {
  return lastSeen && (Date.now() - new Date(lastSeen)) < 30 * 60 * 1000;
}

// ── Filter wiring ─────────────────────────────────────────────────
window.applyBrowseFilters = function() {
  activeFilters.minAge       = parseInt(document.getElementById('f-min')?.value) || 18;
  activeFilters.maxAge       = parseInt(document.getElementById('f-max')?.value) || 80;
  activeFilters.location     = document.getElementById('f-loc')?.value.trim() || '';
  activeFilters.race         = document.getElementById('f-race')?.value || '';
  activeFilters.occupation   = document.getElementById('f-occ')?.value.trim() || '';
  activeFilters.income       = document.getElementById('f-income')?.value || '';
  loadBrowseFeed();
};

window.resetBrowseFilters = function() {
  activeFilters = { minAge: 18, maxAge: 80, verifiedOnly: false, onlineOnly: false, location: '', race: '', gender: 'both', occupation: '', income: '' };
  const fMin = document.getElementById('f-min'); if (fMin) fMin.value = 18;
  const fMax = document.getElementById('f-max'); if (fMax) fMax.value = 80;
  const fLoc = document.getElementById('f-loc'); if (fLoc) fLoc.value = '';
  const fRace = document.getElementById('f-race'); if (fRace) fRace.value = '';
  const fOcc = document.getElementById('f-occ'); if (fOcc) fOcc.value = '';
  const fIncome = document.getElementById('f-income'); if (fIncome) fIncome.value = '';
  // Reset gender pills
  document.getElementById('fg-both')?.classList.add('active');
  document.getElementById('fg-male')?.classList.remove('active');
  document.getElementById('fg-female')?.classList.remove('active');
  // Reset toggle visuals
  document.getElementById('f-verified-toggle')?.classList.remove('on');
  document.getElementById('f-online-toggle')?.classList.remove('on');
  loadBrowseFeed();
};

window.setGenderFilter = function(g) {
  activeFilters.gender = g;
  document.getElementById('fg-both')?.classList.toggle('active', g === 'both');
  document.getElementById('fg-male')?.classList.toggle('active', g === 'male');
  document.getElementById('fg-female')?.classList.toggle('active', g === 'female');
};

window.toggleFilter = function(type) {
  if (type === 'verified') {
    activeFilters.verifiedOnly = !activeFilters.verifiedOnly;
    document.getElementById('f-verified-toggle')?.classList.toggle('on', activeFilters.verifiedOnly);
  } else if (type === 'online') {
    activeFilters.onlineOnly = !activeFilters.onlineOnly;
    document.getElementById('f-online-toggle')?.classList.toggle('on', activeFilters.onlineOnly);
  }
};

window.toggleSidebar = function() {
  document.getElementById('browse-sidebar')?.classList.toggle('open');
};

// ── Profile Detail Modal ──────────────────────────────────────────
let modalProfile = null;

function openProfileModal(p) {
  modalProfile = p;

  const backdrop = document.getElementById('pmd-backdrop');
  const modal    = document.getElementById('profile-modal');
  if (!backdrop || !modal) return;

  // Photo
  const photoArea = document.getElementById('pmd-photo');
  if (photoArea) {
    const photo = p.photos?.length ? `/uploads/${p.photos[0]}` : null;
    photoArea.style.backgroundImage = photo ? `url('${photo}')` : 'none';
    photoArea.innerHTML = !photo ? '<div style="font-size:4rem;display:flex;align-items:center;justify-content:center;height:100%">👤</div>' : '';
  }

  // Name & age
  const nameEl = document.getElementById('pmd-name');
  const ageEl  = document.getElementById('pmd-age');
  if (nameEl) nameEl.textContent = p.display_name || 'Member';
  if (ageEl)  ageEl.textContent  = p.age ? `, ${p.age}` : '';

  // Verified badge
  const verEl = document.getElementById('pmd-verified');
  if (verEl) verEl.classList.toggle('hidden', !(p.face_verified || p.email_verified || p.phone_verified));

  // Location
  const locEl  = document.getElementById('pmd-location');
  if (locEl) locEl.textContent = p.location_text ? `📍 ${p.location_text}` : '';

  // Overview grid fields
  const occEl  = document.getElementById('pmd-occupation');
  const eduEl  = document.getElementById('pmd-education');
  const incEl  = document.getElementById('pmd-income');
  const raceEl = document.getElementById('pmd-race');
  if (occEl)  occEl.textContent  = p.occupation || '—';
  if (eduEl)  eduEl.textContent  = p.education  || '—';
  if (incEl)  incEl.textContent  = p.income     || '—';
  if (raceEl) raceEl.textContent = p.race       || '—';

  // Bio
  const bioEl = document.getElementById('pmd-bio');
  if (bioEl) bioEl.textContent = p.bio || '';

  // Interests
  const intEl = document.getElementById('pmd-interests');
  if (intEl) {
    intEl.innerHTML = (p.interests || []).map(i =>
      `<span style="display:inline-block;padding:5px 12px;background:#F9F5EE;border:1px solid #E8D8C0;border-radius:50px;font-size:0.78rem;margin:2px">${escapeHtml(i)}</span>`
    ).join('');
  }

  backdrop.classList.remove('hidden');
  modal.classList.remove('hidden');
  document.body.style.overflow = 'hidden';
}

window.closeProfileModal = function() {
  document.getElementById('pmd-backdrop')?.classList.add('hidden');
  document.getElementById('profile-modal')?.classList.add('hidden');
  document.body.style.overflow = '';
  modalProfile = null;
};

// ── Floating Chat Popup ───────────────────────────────────────────
let floatMatchId = null;
let floatProfile = null;

function openFloatingChat(matchId, profile) {
  floatMatchId = matchId;
  floatProfile = profile;

  const popup = document.getElementById('float-chat-popup');
  if (!popup) { navigate('matches'); return; }

  // Header info
  const avatarEl = document.getElementById('fc-avatar');
  const nameEl   = document.getElementById('fc-name');
  if (avatarEl) {
    const photo = profile.photos?.[0];
    avatarEl.innerHTML = photo
      ? `<img src="/uploads/${photo}" alt="${escapeHtml(profile.display_name || '')}">`
      : '👤';
  }
  if (nameEl) nameEl.textContent = profile.display_name || 'Match';

  // Clear messages
  const msgsEl = document.getElementById('fc-msgs');
  if (msgsEl) msgsEl.innerHTML = '<div class="fc-empty">Say hello! 👋</div>';

  popup.style.display = 'flex';
  popup.classList.remove('minimized');

  if (matchId) {
    joinMatch(matchId);
    matches.getMessages(matchId, { limit: 50 }).then(msgs => renderFloatMessages(msgs)).catch(() => {});
  }
  setTimeout(() => document.getElementById('fc-input')?.focus(), 150);
}

function renderFloatMessages(msgs) {
  const msgsEl = document.getElementById('fc-msgs');
  if (!msgsEl) return;
  const me = currentUser.get();
  if (!msgs.length) { msgsEl.innerHTML = '<div class="fc-empty">Say hello! 👋</div>'; return; }
  msgsEl.innerHTML = msgs.map(msg => {
    const isMine = msg.sender_id === me?.id;
    return `<div class="fc-msg-bubble ${isMine ? 'mine' : 'theirs'}">${escapeHtml(msg.content)}</div>`;
  }).join('');
  const body = document.getElementById('fc-body');
  if (body) body.scrollTop = body.scrollHeight;
}

function appendFloatMessage(msg) {
  const msgsEl = document.getElementById('fc-msgs');
  if (!msgsEl) return;
  const me = currentUser.get();
  msgsEl.querySelector('.fc-empty')?.remove();
  const isMine = msg.sender_id === me?.id;
  const div = document.createElement('div');
  div.className = `fc-msg-bubble ${isMine ? 'mine' : 'theirs'}`;
  div.textContent = msg.content;
  msgsEl.appendChild(div);
  const body = document.getElementById('fc-body');
  if (body) body.scrollTop = body.scrollHeight;
}

window.closeFloatChat = function() {
  const popup = document.getElementById('float-chat-popup');
  if (popup) popup.style.display = 'none';
  floatMatchId = null;
  floatProfile = null;
};

window.toggleFloatChat = function() {
  document.getElementById('float-chat-popup')?.classList.toggle('minimized');
};

window.openFullChat = function() {
  const mid = floatMatchId;
  const prof = floatProfile;
  window.closeFloatChat();
  navigate('matches');
  if (mid) setTimeout(() => {
    openChat(mid);
    if (prof) {
      const hdrName = document.getElementById('chat-hdr-name');
      if (hdrName) hdrName.textContent = prof.display_name || 'Match';
    }
  }, 300);
};

function wireFloatChat() {
  const input = document.getElementById('fc-input');
  const btn   = document.getElementById('fc-send-btn');
  if (!input || !btn) return;
  const doSend = () => {
    const text = input.value.trim();
    if (!text) return;
    if (!floatMatchId) { showInlineToast('No active chat'); return; }
    sendMessage(floatMatchId, text);
    input.value = '';
  };
  btn.addEventListener('click', doSend);
  input.addEventListener('keydown', e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); doSend(); } });
}

// ── Message from profile modal ────────────────────────────────────
window.messageFromModal = async function() {
  if (!modalProfile) return;
  const p = modalProfile;
  window.closeProfileModal();

  try {
    // Check if already matched
    const matchList = await matches.getAll();
    const existing = matchList.find(m => String(m.partner_id) === String(p.id));
    if (existing) {
      openFloatingChat(existing.match_id, p);
      return;
    }

    // Like them and wait to see if it's a mutual match
    const result = await swipes.swipe(p.id, 'like');
    loadMatches();

    if (result.match_id) {
      openFloatingChat(result.match_id, p);
      if (result.match) showMatchCelebration(result, p);
    } else {
      showInlineToast(`💬 Interest sent to ${p.display_name || 'them'}! You'll be able to chat when they match back.`);
    }
  } catch (err) {
    showInlineToast(`💬 You already sent interest to ${modalProfile?.display_name || 'them'} — chat opens when they match back.`);
  }
};

// ── Activity screen ───────────────────────────────────────────────
function makeActivityCard(person, onclick = '') {
  const photo = person.photos?.[0] ? `/uploads/${person.photos[0]}` : null;
  const name  = escapeHtml(person.display_name || 'Member');
  return `<div class="activity-card" style="${onclick ? 'cursor:pointer' : ''}" ${onclick ? `onclick="${onclick}"` : ''}>
    <div class="activity-card-photo">
      ${photo ? `<img src="${photo}" alt="${name}">` : '<div class="activity-card-ph">👤</div>'}
    </div>
    <div class="activity-card-info">
      <div class="activity-card-name">${name}</div>
      <div class="activity-card-meta">${person.age || ''}${person.location_text ? ` · ${escapeHtml(person.location_text)}` : ''}</div>
    </div>
    <div class="activity-card-time">${timeAgo(person.created_at)}</div>
  </div>`;
}

async function loadActivity() {
  try {
    const res = await fetch('/api/profiles/activity', {
      headers: { Authorization: `Bearer ${localStorage.getItem('token')}` },
    });
    if (!res.ok) throw new Error('Failed');
    const data = await res.json();

    // ❤️ Liked You tab — people who liked me
    const likesEl = document.getElementById('activity-likes');
    if (likesEl) {
      likesEl.innerHTML = data.likes?.length
        ? data.likes.map(l => makeActivityCard(l)).join('')
        : '<div class="activity-empty">No one has liked you yet — keep browsing to get noticed!</div>';
    }

    // 👋 You Liked tab — people I swiped right on
    const sentEl = document.getElementById('activity-sent');
    if (sentEl) {
      sentEl.innerHTML = data.likesSent?.length
        ? data.likesSent.map(l => makeActivityCard(l)).join('')
        : '<div class="activity-empty">You haven\'t liked anyone yet — start browsing!</div>';
    }

    // 🤝 Matches tab
    const matchesEl = document.getElementById('activity-matches');
    if (matchesEl) {
      if (!data.matches?.length) {
        matchesEl.innerHTML = '<div class="activity-empty">No matches yet — when someone likes you back, they\'ll appear here!</div>';
      } else {
        matchesEl.innerHTML = data.matches.map(m => {
          const safeId   = String(m.match_id).replace(/[^a-zA-Z0-9-]/g, '');
          const safeName = escapeHtml(m.display_name || 'Match');
          return makeActivityCard({ ...m, display_name: safeName }, `openMatchFromActivity('${safeId}','${safeName}')`);
        }).join('');
      }
    }
  } catch (err) {
    console.error('Activity error:', err);
    const likesEl = document.getElementById('activity-likes');
    if (likesEl) likesEl.innerHTML = '<div class="activity-empty">Could not load activity. Please try again.</div>';
  }
}

// Opens a match from the Activity screen → navigates to Messages and opens chat
window.openMatchFromActivity = function(matchId, name) {
  navigate('matches');
  loadMatches();
  setTimeout(async () => {
    await openChat(matchId);
    const hdrName = document.getElementById('chat-hdr-name');
    if (hdrName) hdrName.textContent = name || 'Match';
  }, 350);
};

window.switchActivityTab = function(btn, tab) {
  document.querySelectorAll('.activity-tab').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  document.getElementById('activity-likes')?.classList.toggle('hidden',   tab !== 'likes');
  document.getElementById('activity-sent')?.classList.toggle('hidden',    tab !== 'sent');
  document.getElementById('activity-matches')?.classList.toggle('hidden', tab !== 'matches');
};

// ── Settings panel (stub) ─────────────────────────────────────────
window.showSettingsPanel = function(type) {
  showInlineToast(`⚙️ ${type.charAt(0).toUpperCase() + type.slice(1)} settings — Coming soon!`);
  document.getElementById('app-nav-user-menu')?.classList.add('hidden');
};

// ── Credit / Wallet modal ─────────────────────────────────────────
window.openCreditModal = function() {
  const user = currentUser.get();
  const bal  = document.getElementById('credit-modal-balance');
  if (bal) bal.textContent = `$${user?.credit_balance || 0}`;
  const el = document.getElementById('credit-modal-backdrop');
  if (el) { el.style.display = 'flex'; }
};
window.closeCreditModal = function() {
  const el = document.getElementById('credit-modal-backdrop');
  if (el) el.style.display = 'none';
};

// ── Support modal ─────────────────────────────────────────────────
window.openSupportEmail = function() {
  document.getElementById('app-nav-user-menu')?.classList.add('hidden');
  const el = document.getElementById('support-modal-backdrop');
  if (el) { el.style.display = 'flex'; }
};
window.closeSupportModal = function() {
  const el = document.getElementById('support-modal-backdrop');
  if (el) el.style.display = 'none';
};

// ── Grid swipe ────────────────────────────────────────────────────
window.gridSwipe = async function(action) {
  if (!modalProfile) return;
  const p = modalProfile;
  window.closeProfileModal();

  try {
    const result = await swipes.swipe(p.id, action);
    if (result.match) {
      showMatchCelebration(result, p);
    } else if (action === 'like') {
      window.showToast?.('❤️ Liked!', 'success') || showInlineToast('❤️ Liked!');
    } else if (action === 'super') {
      window.showToast?.('⭐ Super Liked!', 'success') || showInlineToast('⭐ Super Liked!');
    }
    browseProfiles = browseProfiles.filter(x => x.id !== p.id);
    renderBrowseGrid();
  } catch (err) {
    console.error('Swipe error:', err);
    showInlineToast(err.message || 'Something went wrong');
  }
};

function showInlineToast(msg) {
  const t = document.createElement('div');
  t.style.cssText = 'position:fixed;bottom:24px;left:50%;transform:translateX(-50%) translateY(80px);opacity:0;transition:all .4s ease;padding:12px 24px;border-radius:50px;font-size:13px;font-weight:600;z-index:9999;background:#1A0A05;color:#fff;white-space:nowrap';
  t.textContent = msg;
  document.body.appendChild(t);
  requestAnimationFrame(() => { t.style.transform = 'translateX(-50%) translateY(0)'; t.style.opacity = '1'; });
  setTimeout(() => { t.style.opacity = '0'; setTimeout(() => t.remove(), 400); }, 3000);
}

function showMatchCelebration(result, p) {
  const me = currentUser.get();
  const myPhoto  = me?.photos?.[0]  ? `/uploads/${me.photos[0]}`  : null;
  const herPhoto = p.photos?.[0]    ? `/uploads/${p.photos[0]}`   : null;

  const div = document.createElement('div');
  div.className = 'match-celebration';
  div.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.75);z-index:3000;display:flex;align-items:center;justify-content:center;padding:20px';
  div.innerHTML = `
    <div style="background:linear-gradient(135deg,#1A0A05,#4A1030);border-radius:28px;padding:48px 40px;text-align:center;max-width:420px;width:100%;box-shadow:0 32px 80px rgba(0,0,0,.6)">
      <div style="font-size:4rem;margin-bottom:12px">🎉</div>
      <h2 style="font-family:'Playfair Display',serif;font-size:2rem;color:#E8C060;margin-bottom:10px">It's a Match!</h2>
      <div style="display:flex;align-items:center;justify-content:center;gap:16px;margin:24px 0">
        <div style="width:80px;height:80px;border-radius:50%;border:3px solid #C49A2A;overflow:hidden;background:#F0E8D8;display:flex;align-items:center;justify-content:center;font-size:2rem">
          ${myPhoto  ? `<img src="${myPhoto}"  style="width:100%;height:100%;object-fit:cover" alt="me">` : '👤'}
        </div>
        <div style="font-size:2rem">💛</div>
        <div style="width:80px;height:80px;border-radius:50%;border:3px solid #C49A2A;overflow:hidden;background:#F0E8D8;display:flex;align-items:center;justify-content:center;font-size:2rem">
          ${herPhoto ? `<img src="${herPhoto}" style="width:100%;height:100%;object-fit:cover" alt="${escapeHtml(p.display_name||'')}">` : '👤'}
        </div>
      </div>
      <p style="color:rgba(255,255,255,.75);font-size:.95rem;margin-bottom:28px">You and ${escapeHtml(p.display_name || 'someone')} liked each other!</p>
      <button id="_match-msg-btn" style="width:100%;padding:14px;background:linear-gradient(135deg,#C49A2A,#E8C060);color:#1A0A05;font-weight:700;font-size:1rem;border-radius:50px;border:none;cursor:pointer;margin-bottom:10px">💬 Send a Message</button>
      <button id="_match-keep-btn" style="width:100%;padding:12px;background:rgba(255,255,255,.08);color:rgba(255,255,255,.75);font-weight:600;border-radius:50px;border:1px solid rgba(255,255,255,.2);cursor:pointer;font-family:inherit;font-size:.9rem">Keep Browsing</button>
    </div>`;
  document.body.appendChild(div);

  div.querySelector('#_match-msg-btn').onclick = () => {
    div.remove();
    navigate('matches');
    if (result.match_id) openChat(result.match_id);
  };
  div.querySelector('#_match-keep-btn').onclick = () => div.remove();

  loadMatches();
}

// ── Matches / Conversations ───────────────────────────────────────
async function loadMatches() {
  try {
    const list = await matches.getAll();
    renderMatchesList(list);
  } catch (err) {
    console.error('Matches error:', err);
  }
}

function renderMatchesList(list) {
  const convList = document.getElementById('conv-list');
  if (!convList) return;

  const unread = list.filter(m => parseInt(m.unread_count) > 0).length;
  const navBadge  = document.getElementById('nav-badge-matches');
  const mnavBadge = document.getElementById('mnav-badge-matches');
  if (navBadge)  { navBadge.textContent  = unread || ''; navBadge.classList.toggle('hidden',  !unread); }
  if (mnavBadge) { mnavBadge.textContent = unread || ''; mnavBadge.classList.toggle('hidden', !unread); }

  if (!list || !list.length) {
    convList.innerHTML = `<div style="padding:48px 24px;text-align:center;color:#9C8878;font-size:13px;line-height:1.8">💛<br><br><strong style="color:#5a4a3a">No matches yet.</strong><br>Like profiles and wait for them to like you back<br>— matches appear here instantly!</div>`;
    return;
  }

  convList.innerHTML = list.map((m, i) => {
    const photo    = m.photos?.[0] ? `/uploads/${m.photos[0]}` : null;
    const initials = (m.display_name || 'U').charAt(0).toUpperCase();
    return `
      <div class="conv-item${i === 0 ? ' active' : ''}" data-match-id="${m.match_id}" data-open-chat>
        <div class="conv-avatar">
          ${photo ? `<img src="${photo}" alt="${escapeHtml(m.display_name||'')}">` : initials}
        </div>
        <div class="conv-info">
          <div class="conv-name">${escapeHtml(m.display_name || 'Match')}</div>
          <div class="conv-preview">${escapeHtml(m.last_message || 'Matched — say hello!')}</div>
        </div>
        <div class="conv-time">${m.last_message_at ? timeAgo(m.last_message_at) : ''}</div>
        ${parseInt(m.unread_count) > 0 ? `<div class="conv-unread">${m.unread_count}</div>` : ''}
      </div>`;
  }).join('');
}

// ── Chat ──────────────────────────────────────────────────────────
let activeMatchId = null;

async function openChat(matchId) {
  activeMatchId = matchId;
  joinMatch(matchId);

  // Show chat panel, hide empty state
  document.getElementById('chat-empty')?.classList.add('hidden');
  document.getElementById('chat-active')?.classList.remove('hidden');

  try {
    const msgs = await matches.getMessages(matchId, { limit: 50 });
    renderMessages(msgs);
    markRead(matchId);
  } catch (err) {
    console.error('Messages error:', err);
  }
}

function renderMessages(msgs) {
  const listEl = document.getElementById('chat-msg-list');
  if (!listEl) return;
  const me = currentUser.get();

  if (!msgs.length) {
    listEl.innerHTML = `<div style="text-align:center;padding:40px 20px;color:#9C8878;font-size:13px">Say hello to your new match!</div>`;
    return;
  }

  listEl.innerHTML = msgs.map(msg => {
    const isMine = msg.sender_id === me?.id;
    return `<div class="msg-bubble ${isMine ? 'mine' : 'theirs'}">${escapeHtml(msg.content)}</div>`;
  }).join('');

  listEl.scrollTop = listEl.scrollHeight;
}

function appendMessage(msg) {
  const listEl = document.getElementById('chat-msg-list');
  if (!listEl) return;
  const me = currentUser.get();
  const isMine = msg.sender_id === me?.id;

  // Remove "say hello" placeholder
  listEl.querySelectorAll('div[style]').forEach(el => el.remove());

  const div = document.createElement('div');
  div.className = `msg-bubble ${isMine ? 'mine' : 'theirs'}`;
  div.textContent = msg.content;
  listEl.appendChild(div);
  listEl.scrollTop = listEl.scrollHeight;
}

// ── Mobile chat back button ───────────────────────────────────────
window.closeMobileChat = function() {
  document.getElementById('chat-active')?.classList.add('hidden');
  document.getElementById('chat-empty')?.classList.remove('hidden');
  activeMatchId = null;
};

// ── Socket ────────────────────────────────────────────────────────
function wireSocket() {
  const sock = getSocket();
  if (!sock) return;

  sock.on('new_message', (msg) => {
    if (msg.match_id === activeMatchId) {
      appendMessage(msg);
      markRead(activeMatchId);
    }
    // Route to floating chat if it's open for this match
    if (msg.match_id === floatMatchId) {
      appendFloatMessage(msg);
      markRead(floatMatchId);
    }
    loadMatches();
  });

  sock.on('match_event', (data) => {
    showInlineToast(`🎉 New match with ${data.matched_with?.display_name || 'someone'}!`);
    loadMatches();
  });

  sock.on('error', (data) => {
    if (data?.code === 'MSG_LIMIT') showInlineToast(data.message || 'Daily message limit reached');
  });
}

// ── Send button ───────────────────────────────────────────────────
function wireSendButton() {
  const input = document.getElementById('chat-input');
  const btn   = document.getElementById('chat-send-btn');
  if (!input || !btn) return;

  let typingTimer;
  const doSend = () => {
    const text = input.value.trim();
    if (!text) return;
    if (!activeMatchId) { showInlineToast('Select a conversation first'); return; }
    sendMessage(activeMatchId, text);
    input.value = '';
    sendStopTyping(activeMatchId);
  };

  btn.addEventListener('click', doSend);
  input.addEventListener('keydown', e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); doSend(); } });
  input.addEventListener('input', () => {
    if (!activeMatchId) return;
    sendTyping(activeMatchId);
    clearTimeout(typingTimer);
    typingTimer = setTimeout(() => sendStopTyping(activeMatchId), 2000);
  });
}

// ── Conv item click delegation ────────────────────────────────────
function initConvItems() {
  document.addEventListener('click', async e => {
    const item = e.target.closest('[data-open-chat]');
    if (!item) return;
    const matchId = item.dataset.matchId;
    if (!matchId) return;

    document.querySelectorAll('.conv-item').forEach(c => c.classList.remove('active'));
    item.classList.add('active');

    await openChat(matchId);

    // Update chat header name
    const name = item.querySelector('.conv-name')?.textContent || 'Match';
    const hdrName = document.getElementById('chat-hdr-name');
    if (hdrName) hdrName.textContent = name;
  });
}

// ── Boost ─────────────────────────────────────────────────────────
async function doBoost() {
  try {
    await auth.boost();
    showInlineToast('⚡ Boosted! You\'re at the top for 30 min.');
    ['app-boost-btn', 'pp-boost-btn'].forEach(id => {
      const b = document.getElementById(id);
      if (b) { b.disabled = true; b.style.opacity = '0.6'; b.textContent = '⚡ Boosted'; }
    });
  } catch (err) {
    showInlineToast(err.message || 'Already boosted today — come back tomorrow!');
  }
}

// ── Helpers ───────────────────────────────────────────────────────
function escapeHtml(str) {
  if (!str) return '';
  return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

function timeAgo(date) {
  const secs = Math.floor((Date.now() - new Date(date)) / 1000);
  if (secs < 60)    return 'now';
  if (secs < 3600)  return Math.floor(secs / 60)   + 'm';
  if (secs < 86400) return Math.floor(secs / 3600)  + 'h';
  return Math.floor(secs / 86400) + 'd';
}

// ── Boot ──────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', async () => {
  if (!auth.isLoggedIn()) { showAuthScreen(); return; }

  try { await auth.me(); }
  catch { tokens.clear(); showAuthScreen(); return; }

  showAppShell();
  updateNavUser();
  initRoleFeatures();
  connectSocket();
  initRouter();
  initConvItems();
  initProfile();
  wireSendButton();
  wireSocket();
  wireFloatChat();

  // Boost buttons
  document.getElementById('app-boost-btn')?.addEventListener('click', doBoost);
  document.getElementById('pp-boost-btn')?.addEventListener('click', doBoost);

  // Profile detail modal backdrop click
  document.getElementById('pmd-backdrop')?.addEventListener('click', () => window.closeProfileModal());

  // Wire activity tab navigation — reload every time tab is clicked
  document.querySelectorAll('[data-nav="activity"]').forEach(el => {
    el.addEventListener('click', () => {
      // reset to Likes tab and reload
      const likesBtn = document.querySelector('.activity-tab');
      if (likesBtn) window.switchActivityTab(likesBtn, 'likes');
      loadActivity();
    });
  });

  loadBrowseFeed();
  loadMatches();

  window.addEventListener('auth:logout', () => { disconnectSocket(); showAuthScreen(); });
});
