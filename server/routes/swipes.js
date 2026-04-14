/**
 * swipes.js — Like, Nope, Super Like; creates matches on mutual like
 */
const router = require('express').Router();
const { query, withTransaction } = require('../config/db');
const { authenticate } = require('../middleware/auth');

// ── POST /api/swipes ──────────────────────────────────────────────
router.post('/', authenticate, async (req, res) => {
  try {
    const { target_id, action } = req.body;

    if (!target_id || !action) {
      return res.status(400).json({ error: 'target_id and action are required' });
    }
    if (!['like', 'nope', 'super'].includes(action)) {
      return res.status(400).json({ error: 'action must be like, nope or super' });
    }
    if (target_id === req.user.id) {
      return res.status(400).json({ error: 'Cannot swipe on yourself' });
    }

    // Check target exists
    const targetCheck = await query(
      'SELECT id FROM users WHERE id = $1 AND is_active = TRUE AND is_banned = FALSE',
      [target_id]
    );
    if (!targetCheck.rowCount) {
      return res.status(404).json({ error: 'User not found' });
    }

    // Upsert swipe (allow changing mind before match)
    await query(
      `INSERT INTO swipes (swiper_id, swiped_id, action)
       VALUES ($1, $2, $3)
       ON CONFLICT (swiper_id, swiped_id)
       DO UPDATE SET action = EXCLUDED.action, created_at = NOW()`,
      [req.user.id, target_id, action]
    );

    // Only check for match on like or super
    if (action === 'nope') {
      return res.json({ match: false });
    }

    // Did the other person already like me?
    const mutual = await query(
      `SELECT id FROM swipes
       WHERE swiper_id = $1 AND swiped_id = $2 AND action IN ('like','super')`,
      [target_id, req.user.id]
    );

    if (!mutual.rowCount) {
      return res.json({ match: false });
    }

    // It's a match! Insert into matches table (canonical ordering: smaller UUID first)
    const [user1, user2] = [req.user.id, target_id].sort();
    const superLiked = action === 'super';

    const matchResult = await withTransaction(async (client) => {
      const { rows } = await client.query(
        `INSERT INTO matches (user1_id, user2_id, super_liked)
         VALUES ($1, $2, $3)
         ON CONFLICT (user1_id, user2_id) DO NOTHING
         RETURNING id, created_at`,
        [user1, user2, superLiked]
      );
      return rows[0];
    });

    if (!matchResult) {
      // Already matched (race condition / duplicate)
      return res.json({ match: true, already_matched: true });
    }

    // Fetch other user's profile for response
    const { rows: [other] } = await query(
      `SELECT p.display_name, p.photos, u.id
       FROM profiles p JOIN users u ON u.id = p.user_id
       WHERE p.user_id = $1`,
      [target_id]
    );

    res.json({
      match: true,
      match_id: matchResult.id,
      matched_at: matchResult.created_at,
      matched_with: {
        id:           other.id,
        display_name: other.display_name,
        // Reveal first photo on match
        photo:        other.photos && other.photos[0] ? other.photos[0] : null,
      },
    });
  } catch (err) {
    console.error('Swipe error:', err);
    res.status(500).json({ error: 'Swipe failed' });
  }
});

module.exports = router;
