/**
 * matches.js — List matches, unmatch
 */
const router = require('express').Router();
const { query } = require('../config/db');
const { authenticate } = require('../middleware/auth');

// ── GET /api/matches ──────────────────────────────────────────────
router.get('/', authenticate, async (req, res) => {
  try {
    const { rows } = await query(
      `SELECT
         m.id            AS match_id,
         m.created_at    AS matched_at,
         m.super_liked,
         CASE WHEN m.user1_id = $1 THEN m.user2_id ELSE m.user1_id END AS other_id,
         p.display_name,
         p.photos,
         u.last_seen,
         u.email_verified,
         u.phone_verified,
         u.face_verified,
         -- Last message
         last_msg.content    AS last_message,
         last_msg.created_at AS last_message_at,
         last_msg.sender_id  AS last_sender_id,
         -- Unread count
         (SELECT COUNT(*) FROM messages msg
          WHERE msg.match_id = m.id
            AND msg.sender_id != $1
            AND msg.read_at IS NULL) AS unread_count
       FROM matches m
       JOIN users u    ON u.id = CASE WHEN m.user1_id = $1 THEN m.user2_id ELSE m.user1_id END
       JOIN profiles p ON p.user_id = u.id
       LEFT JOIN LATERAL (
         SELECT content, created_at, sender_id
         FROM messages
         WHERE match_id = m.id
         ORDER BY created_at DESC
         LIMIT 1
       ) last_msg ON TRUE
       WHERE (m.user1_id = $1 OR m.user2_id = $1)
         AND m.unmatched_by IS NULL
         AND u.is_active = TRUE
       ORDER BY COALESCE(last_msg.created_at, m.created_at) DESC`,
      [req.user.id]
    );
    res.json(rows);
  } catch (err) {
    console.error('Matches error:', err);
    res.status(500).json({ error: 'Failed to fetch matches' });
  }
});

// ── DELETE /api/matches/:matchId ──────────────────────────────────
router.delete('/:matchId', authenticate, async (req, res) => {
  try {
    const { rows } = await query(
      `UPDATE matches SET unmatched_by = $1
       WHERE id = $2
         AND (user1_id = $1 OR user2_id = $1)
         AND unmatched_by IS NULL
       RETURNING id`,
      [req.user.id, req.params.matchId]
    );
    if (!rows.length) return res.status(404).json({ error: 'Match not found' });
    res.json({ message: 'Unmatched successfully' });
  } catch (err) {
    res.status(500).json({ error: 'Unmatch failed' });
  }
});

// ── GET /api/matches/:matchId/messages ────────────────────────────
router.get('/:matchId/messages', authenticate, async (req, res) => {
  try {
    const limit  = Math.min(parseInt(req.query.limit)  || 50, 100);
    const before = req.query.before; // cursor-based pagination

    // Verify user is part of this match
    const matchCheck = await query(
      `SELECT id FROM matches
       WHERE id = $1 AND (user1_id = $2 OR user2_id = $2) AND unmatched_by IS NULL`,
      [req.params.matchId, req.user.id]
    );
    if (!matchCheck.rowCount) return res.status(404).json({ error: 'Match not found' });

    const { rows } = await query(
      `SELECT msg.id, msg.sender_id, msg.content, msg.read_at, msg.created_at,
              p.display_name AS sender_name, p.photos AS sender_photos
       FROM messages msg
       JOIN profiles p ON p.user_id = msg.sender_id
       WHERE msg.match_id = $1
         ${before ? 'AND msg.created_at < $3' : ''}
       ORDER BY msg.created_at DESC
       LIMIT $2`,
      before ? [req.params.matchId, limit, before] : [req.params.matchId, limit]
    );

    // Mark messages as read
    await query(
      `UPDATE messages SET read_at = NOW()
       WHERE match_id = $1 AND sender_id != $2 AND read_at IS NULL`,
      [req.params.matchId, req.user.id]
    );

    res.json(rows.reverse()); // oldest first
  } catch (err) {
    console.error('Messages fetch error:', err);
    res.status(500).json({ error: 'Failed to fetch messages' });
  }
});

// ── POST /api/matches/:matchId/messages ───────────────────────────
// REST fallback for sending — Socket.io is preferred
router.post('/:matchId/messages', authenticate, async (req, res) => {
  try {
    const { content } = req.body;
    if (!content || !content.trim()) {
      return res.status(400).json({ error: 'Message content required' });
    }

    const matchCheck = await query(
      `SELECT id FROM matches
       WHERE id = $1 AND (user1_id = $2 OR user2_id = $2) AND unmatched_by IS NULL`,
      [req.params.matchId, req.user.id]
    );
    if (!matchCheck.rowCount) return res.status(404).json({ error: 'Match not found' });

    const { rows: [msg] } = await query(
      `INSERT INTO messages (match_id, sender_id, content)
       VALUES ($1, $2, $3)
       RETURNING id, sender_id, content, created_at`,
      [req.params.matchId, req.user.id, content.trim()]
    );

    res.status(201).json(msg);
  } catch (err) {
    res.status(500).json({ error: 'Failed to send message' });
  }
});

module.exports = router;
