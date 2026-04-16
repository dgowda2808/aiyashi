/**
 * profiles.js — Get/update own profile, fetch discover feed
 */
const router = require('express').Router();
const { query } = require('../config/db');
const { authenticate } = require('../middleware/auth');
const upload = require('../middleware/upload');
const sharp  = require('sharp');
const path   = require('path');
const fs     = require('fs');

// ── GET /api/profiles/featured (public — landing page) ───────────
router.get('/featured', async (req, res) => {
  try {
    const { rows } = await query(
      `SELECT p.user_id AS id, p.display_name, p.age, p.occupation,
              p.location_text, p.photos, u.is_premium, u.face_verified, u.email_verified
       FROM profiles p JOIN users u ON u.id = p.user_id
       WHERE u.is_fake = TRUE AND p.is_complete = TRUE
         AND p.photos IS NOT NULL AND array_length(p.photos,1) > 0
       ORDER BY RANDOM() LIMIT 12`,
      []
    );
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: 'Failed' });
  }
});

// ── GET /api/profiles/me ──────────────────────────────────────────
router.get('/me', authenticate, async (req, res) => {
  try {
    const { rows } = await query(
      `SELECT p.*, u.email_verified, u.phone_verified, u.face_verified,
              u.carrier, u.is_premium
       FROM profiles p
       JOIN users u ON u.id = p.user_id
       WHERE p.user_id = $1`,
      [req.user.id]
    );
    if (!rows.length) return res.status(404).json({ error: 'Profile not found' });
    res.json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch profile' });
  }
});

// ── PUT /api/profiles/me ──────────────────────────────────────────
router.put('/me', authenticate, async (req, res) => {
  try {
    const {
      display_name, age, gender, bio, occupation, education,
      location_text, relationship_goal, height_cm,
      interests, interested_in, min_age_pref, max_age_pref,
      max_dist_km, show_me,
    } = req.body;

    if (age && (age < 18 || age > 100)) {
      return res.status(400).json({ error: 'Age must be between 18 and 100' });
    }

    // Determine if profile is complete enough
    const is_complete = !!(display_name && age && bio && gender);

    const { rows } = await query(
      `UPDATE profiles SET
         display_name     = COALESCE($1,  display_name),
         age              = COALESCE($2,  age),
         gender           = COALESCE($3,  gender),
         bio              = COALESCE($4,  bio),
         occupation       = COALESCE($5,  occupation),
         education        = COALESCE($6,  education),
         location_text    = COALESCE($7,  location_text),
         relationship_goal= COALESCE($8,  relationship_goal),
         height_cm        = COALESCE($9,  height_cm),
         interests        = COALESCE($10, interests),
         interested_in    = COALESCE($11, interested_in),
         min_age_pref     = COALESCE($12, min_age_pref),
         max_age_pref     = COALESCE($13, max_age_pref),
         max_dist_km      = COALESCE($14, max_dist_km),
         show_me          = COALESCE($15, show_me),
         is_complete      = $16
       WHERE user_id = $17
       RETURNING *`,
      [
        display_name, age, gender, bio, occupation, education,
        location_text, relationship_goal, height_cm,
        interests ? JSON.stringify(interests) : null,
        interested_in ? JSON.stringify(interested_in) : null,
        min_age_pref, max_age_pref, max_dist_km, show_me,
        is_complete, req.user.id,
      ]
    );
    res.json(rows[0]);
  } catch (err) {
    console.error('Profile update error:', err);
    res.status(500).json({ error: 'Failed to update profile' });
  }
});

// ── POST /api/profiles/photo ──────────────────────────────────────
router.post('/photo', authenticate, upload.single('photo'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'No file uploaded' });

    const filename = req.file.filename;
    const filepath = req.file.path;

    // Resize + optimise with sharp
    const optimised = filepath.replace(path.extname(filepath), '_opt.jpg');
    await sharp(filepath)
      .resize(800, 1000, { fit: 'cover', position: 'center' })
      .jpeg({ quality: 85 })
      .toFile(optimised);

    // Remove original, rename optimised
    fs.unlinkSync(filepath);
    fs.renameSync(optimised, filepath.replace(path.extname(filepath), '.jpg'));

    const finalName = filename.replace(path.extname(filename), '.jpg');

    // Append to photos array (max 6)
    const { rows } = await query(
      `UPDATE profiles
       SET photos = CASE
         WHEN array_length(photos, 1) >= 6 THEN photos
         ELSE array_append(COALESCE(photos, '{}'), $1)
       END
       WHERE user_id = $2
       RETURNING photos`,
      [finalName, req.user.id]
    );

    res.json({ photo: finalName, photos: rows[0].photos });
  } catch (err) {
    console.error('Photo upload error:', err);
    res.status(500).json({ error: 'Photo upload failed' });
  }
});

// ── DELETE /api/profiles/photo/:filename ─────────────────────────
router.delete('/photo/:filename', authenticate, async (req, res) => {
  try {
    const { filename } = req.params;

    // Make sure this photo belongs to the user
    const { rows } = await query(
      'SELECT photos FROM profiles WHERE user_id = $1', [req.user.id]
    );
    if (!rows.length || !rows[0].photos?.includes(filename)) {
      return res.status(404).json({ error: 'Photo not found' });
    }

    // Remove from array
    await query(
      `UPDATE profiles SET photos = array_remove(photos, $1) WHERE user_id = $2`,
      [filename, req.user.id]
    );

    // Delete file
    const filepath = path.join(process.env.UPLOAD_DIR || './public/uploads', filename);
    if (fs.existsSync(filepath)) fs.unlinkSync(filepath);

    res.json({ message: 'Photo deleted' });
  } catch (err) {
    res.status(500).json({ error: 'Failed to delete photo' });
  }
});

// ── GET /api/profiles/discover ────────────────────────────────────
// Returns paginated profiles the current user hasn't swiped on yet
// Query params: sort, race, gender, min_age, max_age, location, occupation, income, offset
router.get('/discover', authenticate, async (req, res) => {
  try {
    const limit  = Math.min(parseInt(req.query.limit) || 12, 50);
    const offset = Math.max(0, parseInt(req.query.offset) || 0);
    const { sort, race, gender, min_age, max_age, location, occupation, income } = req.query;

    const params = [req.user.id];
    const conditions = [];

    // Optional filters
    if (race) {
      params.push(race);
      conditions.push(`p.race = $${params.length}`);
    }
    if (gender && (gender === 'male' || gender === 'female')) {
      params.push(gender);
      conditions.push(`u.role = $${params.length}`);
    }
    if (min_age) {
      params.push(parseInt(min_age));
      conditions.push(`p.age >= $${params.length}`);
    }
    if (max_age) {
      params.push(parseInt(max_age));
      conditions.push(`p.age <= $${params.length}`);
    }
    if (location) {
      params.push(`%${location}%`);
      conditions.push(`p.location_text ILIKE $${params.length}`);
    }
    if (occupation) {
      params.push(`%${occupation}%`);
      conditions.push(`p.occupation ILIKE $${params.length}`);
    }
    if (income) {
      params.push(income);
      conditions.push(`p.income = $${params.length}`);
    }

    const extraWhere = conditions.length ? 'AND ' + conditions.join(' AND ') : '';

    // Photos-first clause (profiles with photos always shown before those without)
    const photosFirst = `CASE WHEN p.photos IS NOT NULL AND array_length(p.photos,1) > 0 THEN 0 ELSE 1 END`;

    // Order by sort param
    let orderBy;
    if (sort === 'popular') {
      orderBy = `${photosFirst}, (SELECT COUNT(*) FROM swipes WHERE swiped_id = p.user_id AND action IN ('like','super')) DESC, u.last_seen DESC`;
    } else if (sort === 'new') {
      orderBy = `${photosFirst}, u.created_at DESC`;
    } else if (sort === 'online') {
      orderBy = `${photosFirst}, u.last_seen DESC`;
    } else {
      // relevance (default) — photos first, then boosts, then last seen
      orderBy = `${photosFirst}, CASE WHEN EXISTS (SELECT 1 FROM boosts WHERE user_id = p.user_id AND expires_at > NOW()) THEN 0 ELSE 1 END, u.last_seen DESC`;
    }

    params.push(limit);
    const limitParam = `$${params.length}`;
    params.push(offset);
    const offsetParam = `$${params.length}`;

    const { rows } = await query(
      `SELECT
         p.user_id AS id,
         p.display_name,
         p.age,
         p.gender,
         p.bio,
         p.occupation,
         p.education,
         p.location_text,
         p.interests,
         p.photos,
         p.relationship_goal,
         p.height_cm,
         p.race,
         p.income,
         u.email_verified,
         u.phone_verified,
         u.face_verified,
         u.carrier,
         u.is_premium,
         u.last_seen,
         u.role
       FROM profiles p
       JOIN users u ON u.id = p.user_id
       WHERE
         p.user_id   != $1
         AND p.show_me   = TRUE
         AND p.is_complete = TRUE
         AND u.is_active   = TRUE
         AND u.is_banned   = FALSE
         -- Exclude already swiped
         AND p.user_id NOT IN (
           SELECT swiped_id FROM swipes WHERE swiper_id = $1
         )
         -- Exclude blocked
         AND p.user_id NOT IN (
           SELECT blocked_id FROM blocks WHERE blocker_id = $1
           UNION
           SELECT blocker_id FROM blocks WHERE blocked_id = $1
         )
         ${extraWhere}
       ORDER BY ${orderBy}
       LIMIT ${limitParam} OFFSET ${offsetParam}`,
      params
    );

    res.json(rows);
  } catch (err) {
    console.error('Discover error:', err);
    res.status(500).json({ error: 'Failed to load profiles' });
  }
});

// ── GET /api/profiles/activity ────────────────────────────────────
// Returns recent likes received and recent matches for the current user
router.get('/activity', authenticate, async (req, res) => {
  try {
    // Likes: up to 20 most recent swipes where swiped_id = current user
    const { rows: likes } = await query(
      `SELECT s.swiper_id AS id, s.action, s.created_at,
              p.display_name, p.photos, p.age, p.location_text
       FROM swipes s
       JOIN profiles p ON p.user_id = s.swiper_id
       WHERE s.swiped_id = $1 AND s.action IN ('like','super')
       ORDER BY s.created_at DESC
       LIMIT 20`,
      [req.user.id]
    );

    // Matches: up to 10 recent matches
    const { rows: matchRows } = await query(
      `SELECT m.id AS match_id, m.created_at,
              CASE WHEN m.user1_id = $1 THEN m.user2_id ELSE m.user1_id END AS partner_id,
              p.display_name, p.photos, p.age, p.location_text
       FROM matches m
       JOIN profiles p ON p.user_id = CASE WHEN m.user1_id = $1 THEN m.user2_id ELSE m.user1_id END
       WHERE (m.user1_id = $1 OR m.user2_id = $1) AND m.unmatched_by IS NULL
       ORDER BY m.created_at DESC
       LIMIT 10`,
      [req.user.id]
    );

    res.json({ likes, matches: matchRows });
  } catch (err) {
    console.error('Activity error:', err);
    res.status(500).json({ error: 'Failed to load activity' });
  }
});

// ── GET /api/profiles/:id ─────────────────────────────────────────
router.get('/:id', authenticate, async (req, res) => {
  try {
    const { rows } = await query(
      `SELECT p.user_id AS id, p.display_name, p.age, p.gender, p.bio,
              p.occupation, p.education, p.location_text, p.interests,
              p.photos, p.relationship_goal, p.height_cm,
              u.email_verified, u.phone_verified, u.face_verified,
              u.carrier, u.is_premium, u.last_seen
       FROM profiles p JOIN users u ON u.id = p.user_id
       WHERE p.user_id = $1 AND u.is_active = TRUE`,
      [req.params.id]
    );
    if (!rows.length) return res.status(404).json({ error: 'Profile not found' });

    // Only show photos if matched
    const match = await query(
      `SELECT id FROM matches
       WHERE (user1_id = $1 AND user2_id = $2)
          OR (user1_id = $2 AND user2_id = $1)
          AND unmatched_by IS NULL`,
      [req.user.id, req.params.id]
    );

    const profile = rows[0];
    if (!match.rowCount) {
      profile.photos = [];   // blurred until match
    }

    res.json(profile);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch profile' });
  }
});

module.exports = router;
