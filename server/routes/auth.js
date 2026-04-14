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

// ── POST /api/auth/register ────────────────────────────────────────
router.post('/register', async (req, res) => {
  try {
    const { email, password, display_name } = req.body;

    if (!email || !password || !display_name) {
      return res.status(400).json({ error: 'email, password and display_name are required' });
    }
    if (password.length < 8) {
      return res.status(400).json({ error: 'Password must be at least 8 characters' });
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return res.status(400).json({ error: 'Invalid email address' });
    }

    // Check duplicate
    const existing = await query('SELECT id FROM users WHERE email = $1', [email.toLowerCase()]);
    if (existing.rowCount > 0) {
      return res.status(409).json({ error: 'An account with this email already exists' });
    }

    const hash       = await bcrypt.hash(password, 12);
    const emailToken = uuidv4();

    const result = await withTransaction(async (client) => {
      // Create user
      const { rows: [user] } = await client.query(
        `INSERT INTO users (email, password_hash, email_token)
         VALUES ($1, $2, $3) RETURNING id`,
        [email.toLowerCase(), hash, emailToken]
      );
      // Create empty profile
      await client.query(
        `INSERT INTO profiles (user_id, display_name) VALUES ($1, $2)`,
        [user.id, display_name]
      );
      return user;
    });

    const tokens = issueTokens(result.id);
    await saveRefreshToken(result.id, tokens.refresh);

    // TODO: send verification email when SMTP is configured
    // sendVerificationEmail(email, emailToken);

    res.status(201).json({
      message: 'Account created successfully',
      user: { id: result.id, email: email.toLowerCase(), display_name },
      access_token:  tokens.access,
      refresh_token: tokens.refresh,
      profile_complete: false,
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

module.exports = router;
