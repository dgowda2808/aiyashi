/**
 * safety.js — Block and report users
 */
const router = require('express').Router();
const { query } = require('../config/db');
const { authenticate } = require('../middleware/auth');

// ── POST /api/safety/block ────────────────────────────────────────
router.post('/block', authenticate, async (req, res) => {
  try {
    const { user_id } = req.body;
    if (!user_id) return res.status(400).json({ error: 'user_id required' });
    if (user_id === req.user.id) return res.status(400).json({ error: 'Cannot block yourself' });

    await query(
      `INSERT INTO blocks (blocker_id, blocked_id) VALUES ($1, $2)
       ON CONFLICT DO NOTHING`,
      [req.user.id, user_id]
    );

    // Also unmatch if exists
    await query(
      `UPDATE matches SET unmatched_by = $1
       WHERE (user1_id = $1 AND user2_id = $2)
          OR (user1_id = $2 AND user2_id = $1)`,
      [req.user.id, user_id]
    );

    res.json({ message: 'User blocked' });
  } catch (err) {
    res.status(500).json({ error: 'Block failed' });
  }
});

// ── POST /api/safety/report ───────────────────────────────────────
router.post('/report', authenticate, async (req, res) => {
  try {
    const { user_id, reason, details } = req.body;
    if (!user_id || !reason) {
      return res.status(400).json({ error: 'user_id and reason required' });
    }

    const valid = ['fake','spam','inappropriate','harassment','underage','other'];
    if (!valid.includes(reason)) {
      return res.status(400).json({ error: 'Invalid reason' });
    }

    await query(
      `INSERT INTO reports (reporter_id, reported_id, reason, details)
       VALUES ($1, $2, $3, $4)`,
      [req.user.id, user_id, reason, details || null]
    );

    res.json({ message: 'Report submitted. Our team will review it.' });
  } catch (err) {
    res.status(500).json({ error: 'Report failed' });
  }
});

module.exports = router;
