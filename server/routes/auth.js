/**
 * auth.js — Register, Login, Refresh, Logout, Email Verify
 */
const router  = require('express').Router();
const bcrypt  = require('bcryptjs');
const jwt     = require('jsonwebtoken');
const { v4: uuidv4 } = require('uuid');
const { query, withTransaction } = require('../config/db');
const { authenticate } = require('../middleware/auth');

// ── Helpers ────────────────────────────────────────────────────────
const issueTokens = (userId) => {
  const access = jwt.sign(
    { userId },
    process.env.JWT_SECRET,
    { expiresIn: process.env.JWT_EXPIRES_IN || '7d' }
  );
  const refresh = jwt.sign(
    { userId },
    process.env.JWT_REFRESH_SECRET,
    { expiresIn: process.env.JWT_REFRESH_EXPIRES_IN || '30d' }
  );
  return { access, refresh };
};

const saveRefreshToken = async (userId, token) => {
  const exp = new Date();
  exp.setDate(exp.getDate() + 30);
  await query(
    'INSERT INTO refresh_tokens (user_id, token, expires_at) VALUES ($1, $2, $3)',
    [userId, token, exp]
  );
};

// ── Helpers ────────────────────────────────────────────────────────
const genReferralCode = (id) => id.replace(/-/g, '').substring(0, 8).toUpperCase();

// ── POST /api/auth/register ────────────────────────────────────────
router.post('/register', async (req, res) => {
  try {
    const { email, password, display_name, role = 'female', referral_code } = req.body;

    if (!email || !password || !display_name) {
      return res.status(400).json({ error: 'email, password and display_name are required' });
    }
    if (password.length < 8) {
      return res.status(400).json({ error: 'Password must be at least 8 characters' });
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return res.status(400).json({ error: 'Invalid email address' });
    }
    const validRoles = ['female', 'male', 'other'];
    const userRole   = validRoles.includes(role) ? role : 'female';

    // Check duplicate
    const existing = await query('SELECT id FROM users WHERE email = $1', [email.toLowerCase()]);
    if (existing.rowCount > 0) {
      return res.status(409).json({ error: 'An account with this email already exists' });
    }

    // Resolve referral
    let referrerId = null;
    if (referral_code) {
      const { rows: refRows } = await query(
        'SELECT id FROM users WHERE referral_code = $1',
        [referral_code.toUpperCase()]
      );
      if (refRows.length) referrerId = refRows[0].id;
    }

    const hash       = await bcrypt.hash(password, 12);
    const emailToken = uuidv4();

    const isFemale   = userRole === 'female';
    // Auto-premium for females: 30 days
    const premiumExpires = isFemale ? new Date(Date.now() + 30 * 24 * 3600 * 1000) : null;
    const creditBalance = isFemale ? 30 : 0;

    const result = await withTransaction(async (client) => {
      const newId = uuidv4();
      const myReferralCode = genReferralCode(newId);

      // Create user
      const { rows: [user] } = await client.query(
        `INSERT INTO users
           (id, email, password_hash, email_token, role,
            is_premium, premium_expires, credit_balance,
            referral_code, referred_by)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
         RETURNING id`,
        [
          newId,
          email.toLowerCase(),
          hash,
          emailToken,
          userRole,
          isFemale,
          premiumExpires,
          creditBalance,
          myReferralCode,
          referrerId,
        ]
      );

      // Create empty profile
      await client.query(
        `INSERT INTO profiles (user_id, display_name) VALUES ($1, $2)`,
        [user.id, display_name]
      );

      // Reward referrer
      if (referrerId) {
        await client.query(
          `UPDATE users
           SET credit_balance  = credit_balance + 15,
               premium_expires = GREATEST(COALESCE(premium_expires, NOW()), NOW()) + INTERVAL '30 days',
               is_premium      = TRUE
           WHERE id = $1`,
          [referrerId]
        );
      }

      return user;
    });

    const tokens = issueTokens(result.id);
    await saveRefreshToken(result.id, tokens.refresh);

    res.status(201).json({
      message: 'Account created successfully',
      user: {
        id:             result.id,
        email:          email.toLowerCase(),
        display_name,
        role:           userRole,
        is_premium:     isFemale,
        credit_balance: creditBalance,
      },
      access_token:    tokens.access,
      refresh_token:   tokens.refresh,
      profile_complete: false,
      show_welcome:    isFemale,
    });
  } catch (err) {
    console.error('Register error:', err);
    res.status(500).json({ error: 'Registration failed' });
  }
});

// ── POST /api/auth/login ───────────────────────────────────────────
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required' });
    }

    const { rows } = await query(
      `SELECT u.id, u.email, u.password_hash, u.is_active, u.is_banned,
              u.email_verified, u.phone_verified, u.face_verified,
              u.role, u.is_premium, u.credit_balance, u.referral_code, u.last_boost_at,
              p.display_name, p.is_complete, p.photos
       FROM users u
       LEFT JOIN profiles p ON p.user_id = u.id
       WHERE u.email = $1`,
      [email.toLowerCase()]
    );

    if (!rows.length) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    const user = rows[0];

    if (user.is_banned)  return res.status(403).json({ error: 'Account suspended' });
    if (!user.is_active) return res.status(401).json({ error: 'Account deactivated' });

    const valid = await bcrypt.compare(password, user.password_hash);
    if (!valid) return res.status(401).json({ error: 'Invalid email or password' });

    // Update last_seen
    await query('UPDATE users SET last_seen = NOW() WHERE id = $1', [user.id]);

    const tokens = issueTokens(user.id);
    await saveRefreshToken(user.id, tokens.refresh);

    res.json({
      user: {
        id:             user.id,
        email:          user.email,
        display_name:   user.display_name,
        email_verified: user.email_verified,
        phone_verified: user.phone_verified,
        face_verified:  user.face_verified,
        role:           user.role || 'female',
        is_premium:     user.is_premium,
        credit_balance: user.credit_balance || 0,
        referral_code:  user.referral_code,
        last_boost_at:  user.last_boost_at,
        profile_complete: user.is_complete,
        has_photo:      user.photos && user.photos.length > 0,
      },
      access_token:  tokens.access,
      refresh_token: tokens.refresh,
    });
  } catch (err) {
    console.error('Login error:', err);
    res.status(500).json({ error: 'Login failed' });
  }
});

// ── POST /api/auth/refresh ─────────────────────────────────────────
router.post('/refresh', async (req, res) => {
  try {
    const { refresh_token } = req.body;
    if (!refresh_token) return res.status(400).json({ error: 'Refresh token required' });

    const decoded = jwt.verify(refresh_token, process.env.JWT_REFRESH_SECRET);

    // Check token exists in DB and not expired
    const { rows } = await query(
      `SELECT id FROM refresh_tokens
       WHERE token = $1 AND user_id = $2 AND expires_at > NOW()`,
      [refresh_token, decoded.userId]
    );
    if (!rows.length) return res.status(401).json({ error: 'Invalid or expired refresh token' });

    // Rotate: delete old, issue new
    await query('DELETE FROM refresh_tokens WHERE token = $1', [refresh_token]);
    const tokens = issueTokens(decoded.userId);
    await saveRefreshToken(decoded.userId, tokens.refresh);

    res.json({ access_token: tokens.access, refresh_token: tokens.refresh });
  } catch (err) {
    res.status(401).json({ error: 'Invalid refresh token' });
  }
});

// ── POST /api/auth/logout ──────────────────────────────────────────
router.post('/logout', authenticate, async (req, res) => {
  try {
    const { refresh_token } = req.body;
    if (refresh_token) {
      await query('DELETE FROM refresh_tokens WHERE token = $1', [refresh_token]);
    }
    res.json({ message: 'Logged out successfully' });
  } catch (err) {
    res.status(500).json({ error: 'Logout failed' });
  }
});

// ── GET /api/auth/verify-email/:token ─────────────────────────────
router.get('/verify-email/:token', async (req, res) => {
  try {
    const { rows } = await query(
      `UPDATE users SET email_verified = TRUE, email_token = NULL
       WHERE email_token = $1 RETURNING id, email`,
      [req.params.token]
    );
    if (!rows.length) return res.status(400).json({ error: 'Invalid or expired verification link' });
    res.json({ message: 'Email verified successfully', email: rows[0].email });
  } catch (err) {
    res.status(500).json({ error: 'Verification failed' });
  }
});

// ── GET /api/auth/me ───────────────────────────────────────────────
router.get('/me', authenticate, async (req, res) => {
  try {
    const { rows } = await query(
      `SELECT u.id, u.email, u.email_verified, u.phone_verified, u.face_verified,
              u.carrier, u.is_premium, u.last_seen,
              u.role, u.credit_balance, u.referral_code, u.last_boost_at,
              p.display_name, p.age, p.bio, p.photos, p.interests,
              p.location_text, p.is_complete, p.occupation, p.education
       FROM users u
       LEFT JOIN profiles p ON p.user_id = u.id
       WHERE u.id = $1`,
      [req.user.id]
    );
    res.json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch user' });
  }
});

// ── POST /api/auth/boost ───────────────────────────────────────────
router.post('/boost', authenticate, async (req, res) => {
  try {
    const { rows: [user] } = await query(
      'SELECT last_boost_at FROM users WHERE id = $1',
      [req.user.id]
    );

    if (user.last_boost_at) {
      const lastBoost = new Date(user.last_boost_at);
      const today     = new Date();
      if (lastBoost.toDateString() === today.toDateString()) {
        return res.status(429).json({ error: 'You already used your free boost today. Come back tomorrow!' });
      }
    }

    await query(
      'UPDATE users SET last_boost_at = NOW() WHERE id = $1',
      [req.user.id]
    );

    res.json({ message: 'Profile boosted!', boosted_at: new Date().toISOString() });
  } catch (err) {
    console.error('Boost error:', err);
    res.status(500).json({ error: 'Boost failed' });
  }
});

module.exports = router;
