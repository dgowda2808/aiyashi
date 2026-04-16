/**
 * api.js — Centralised fetch wrapper + token management
 */

const BASE = '';   // same origin — Express serves both frontend and API

// ── Token storage ─────────────────────────────────────────────────
export const tokens = {
  get access()  { return localStorage.getItem('access_token'); },
  get refresh() { return localStorage.getItem('refresh_token'); },
  set(access, refresh) {
    localStorage.setItem('access_token',  access);
    if (refresh) localStorage.setItem('refresh_token', refresh);
  },
  clear() {
    localStorage.removeItem('access_token');
    localStorage.removeItem('refresh_token');
    localStorage.removeItem('current_user');
  },
};

// ── Current user cache ────────────────────────────────────────────
export const currentUser = {
  get()  {
    try { return JSON.parse(localStorage.getItem('current_user')); } catch { return null; }
  },
  set(u) { localStorage.setItem('current_user', JSON.stringify(u)); },
  clear(){ localStorage.removeItem('current_user'); },
};

// ── Core fetch with auto-refresh ──────────────────────────────────
let refreshing = null;   // singleton promise to avoid parallel refresh calls

async function apiFetch(path, options = {}) {
  const headers = {
    'Content-Type': 'application/json',
    ...(options.headers || {}),
  };

  if (tokens.access) headers['Authorization'] = `Bearer ${tokens.access}`;

  let res = await fetch(BASE + path, { ...options, headers });

  // Try refresh on 401 TOKEN_EXPIRED
  if (res.status === 401 && tokens.refresh) {
    const body = await res.json().catch(() => ({}));

    if (body.code === 'TOKEN_EXPIRED') {
      if (!refreshing) {
        refreshing = fetch('/api/auth/refresh', {
          method:  'POST',
          headers: { 'Content-Type': 'application/json' },
          body:    JSON.stringify({ refresh_token: tokens.refresh }),
        })
        .then(r => r.json())
        .finally(() => { refreshing = null; });
      }

      const refreshed = await refreshing;
      if (refreshed.access_token) {
        tokens.set(refreshed.access_token, refreshed.refresh_token);
        headers['Authorization'] = `Bearer ${refreshed.access_token}`;
        res = await fetch(BASE + path, { ...options, headers });
      } else {
        // Refresh failed — kick to login
        tokens.clear();
        window.dispatchEvent(new Event('auth:logout'));
        throw new Error('Session expired. Please log in again.');
      }
    }
  }

  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw Object.assign(new Error(err.error || 'Request failed'), { status: res.status, data: err });
  }

  // 204 No Content
  if (res.status === 204) return null;
  return res.json();
}

// ── Auth ──────────────────────────────────────────────────────────
export const auth = {
  async register(email, password, displayName, role = 'female', referralCode = null) {
    const data = await apiFetch('/api/auth/register', {
      method: 'POST',
      body: JSON.stringify({ email, password, display_name: displayName, role, referral_code: referralCode || undefined }),
    });
    tokens.set(data.access_token, data.refresh_token);
    currentUser.set(data.user);
    return data;
  },

  async login(email, password) {
    const data = await apiFetch('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    });
    tokens.set(data.access_token, data.refresh_token);
    currentUser.set(data.user);
    return data;
  },

  async logout() {
    try {
      await apiFetch('/api/auth/logout', {
        method: 'POST',
        body: JSON.stringify({ refresh_token: tokens.refresh }),
      });
    } catch (_) {}
    tokens.clear();
    currentUser.clear();
  },

  async me() {
    const data = await apiFetch('/api/auth/me');
    currentUser.set(data);
    return data;
  },

  isLoggedIn() { return !!tokens.access; },

  async boost() {
    return apiFetch('/api/auth/boost', { method: 'POST' });
  },

  async uploadVerification(formData) {
    const res = await fetch('/api/profiles/verify', {
      method:  'POST',
      headers: { 'Authorization': `Bearer ${tokens.access}` },
      body:    formData,
    });
    if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || 'Upload failed');
    return res.json();
  },
};

// ── Profiles ──────────────────────────────────────────────────────
export const profiles = {
  getMe()           { return apiFetch('/api/profiles/me'); },
  updateMe(data)    { return apiFetch('/api/profiles/me', { method: 'PUT', body: JSON.stringify(data) }); },
  getDiscover(limit = 20, params) {
    if (params instanceof URLSearchParams) {
      params.set('limit', limit);
      return apiFetch(`/api/profiles/discover?${params.toString()}`);
    }
    return apiFetch(`/api/profiles/discover?limit=${limit}`);
  },
  getById(id)       { return apiFetch(`/api/profiles/${id}`); },

  async uploadPhoto(file) {
    const form = new FormData();
    form.append('photo', file);
    const res = await fetch('/api/profiles/photo', {
      method:  'POST',
      headers: { 'Authorization': `Bearer ${tokens.access}` },
      body:    form,
    });
    if (!res.ok) throw new Error((await res.json()).error || 'Upload failed');
    return res.json();
  },

  deletePhoto(filename) {
    return apiFetch(`/api/profiles/photo/${filename}`, { method: 'DELETE' });
  },
};

// ── Swipes ────────────────────────────────────────────────────────
export const swipes = {
  swipe(targetId, action) {
    return apiFetch('/api/swipes', {
      method: 'POST',
      body: JSON.stringify({ target_id: targetId, action }),
    });
  },
};

// ── Matches ───────────────────────────────────────────────────────
export const matches = {
  getAll()          { return apiFetch('/api/matches'); },
  getMessages(matchId, opts = {}) {
    const params = new URLSearchParams(opts).toString();
    return apiFetch(`/api/matches/${matchId}/messages${params ? '?' + params : ''}`);
  },
  sendMessage(matchId, content) {
    return apiFetch(`/api/matches/${matchId}/messages`, {
      method: 'POST',
      body: JSON.stringify({ content }),
    });
  },
  unmatch(matchId) {
    return apiFetch(`/api/matches/${matchId}`, { method: 'DELETE' });
  },
};

// ── Safety ────────────────────────────────────────────────────────
export const safety = {
  block(userId)                     { return apiFetch('/api/safety/block',  { method: 'POST', body: JSON.stringify({ user_id: userId }) }); },
  report(userId, reason, details)   { return apiFetch('/api/safety/report', { method: 'POST', body: JSON.stringify({ user_id: userId, reason, details }) }); },
};

export default { auth, profiles, swipes, matches, safety, tokens, currentUser };
