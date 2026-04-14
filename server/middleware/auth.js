/**
 * auth.js — JWT verification middleware
 */
const jwt = require('jsonwebtoken');
const { query } = require('../config/db');

const authenticate = async (req, res, next) => {
  try {
    const header = req.headers.authorization;
    if (!header || !header.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'No token provided' });
    }

    const token = header.slice(7);
    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    // Verify user still exists and is active
    const { rows } = await query(
      'SELECT id, email, email_verified, is_active, is_banned FROM users WHERE id = $1',
      [decoded.userId]
    );

    if (!rows.length)           return res.status(401).json({ error: 'User not found' });
    if (!rows[0].is_active)     return res.status(401).json({ error: 'Account deactivated' });
    if (rows[0].is_banned)      return res.status(403).json({ error: 'Account suspended' });

    req.user = rows[0];
    next();
  } catch (err) {
    if (err.name === 'TokenExpiredError') {
      return res.status(401).json({ error: 'Token expired', code: 'TOKEN_EXPIRED' });
    }
    return res.status(401).json({ error: 'Invalid token' });
  }
};

// Optional auth — attaches user if token present, continues either way
const optionalAuth = async (req, res, next) => {
  try {
    const header = req.headers.authorization;
    if (header && header.startsWith('Bearer ')) {
      const token = header.slice(7);
      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      const { rows } = await query('SELECT id, email FROM users WHERE id = $1', [decoded.userId]);
      if (rows.length) req.user = rows[0];
    }
  } catch (_) { /* ignore */ }
  next();
};

module.exports = { authenticate, optionalAuth };
