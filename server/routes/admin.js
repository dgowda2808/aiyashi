/**
 * server/routes/admin.js
 * Admin API — profiles, members, email campaigns.
 * Protected by a secret header: x-admin-key: aiyashi-admin-2026
 */
const router = require('express').Router();
const { query } = require('../config/db');
const fs   = require('fs');
const path = require('path');
const { sendCampaign } = require('../email');

// In-memory campaign job store (reset on server restart — good enough for admin)
const campaignJobs = {};

const ADMIN_KEY  = 'aiyashi-admin-2026';
const UPLOAD_DIR = process.env.UPLOAD_DIR || path.join(__dirname, '../../public/uploads');

function auth(req, res, next) {
  if (req.headers['x-admin-key'] !== ADMIN_KEY) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  next();
}

// ── GET /api/admin/profiles?page=1&limit=60&group=all ────────────
router.get('/profiles', auth, async (req, res) => {
  try {
    const page  = Math.max(1, parseInt(req.query.page)  || 1);
    const limit = Math.min(120, parseInt(req.query.limit) || 60);
    const group = req.query.group || 'all';
    const offset = (page - 1) * limit;

    let whereClause = "u.is_fake = TRUE";
    if (group !== 'all') {
      whereClause += ` AND u.email LIKE '${group}%'`;
    }

    const { rows } = await query(
      `SELECT u.id, u.email, p.display_name, p.age, p.occupation,
              p.location_text, p.photos, p.bio
       FROM users u
       JOIN profiles p ON p.user_id = u.id
       WHERE ${whereClause}
       ORDER BY u.created_at DESC
       LIMIT $1 OFFSET $2`,
      [limit, offset]
    );

    const { rows: countRows } = await query(
      `SELECT COUNT(*) FROM users u WHERE ${whereClause}`
    );

    res.json({ profiles: rows, total: parseInt(countRows[0].count), page, limit });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: e.message });
  }
});

// ── GET /api/admin/groups ─────────────────────────────────────────
router.get('/groups', auth, async (req, res) => {
  try {
    const { rows } = await query(`
      SELECT
        CASE
          WHEN email LIKE 'rep_%@%'  THEN 'rep_'
          WHEN email LIKE 'nri_%@%'  THEN 'nri_'
          WHEN email LIKE 'aif_%@%'  THEN 'aif_'
          WHEN email LIKE 'ind_%@%'  THEN 'ind_'
          WHEN email LIKE 'amer_%@%' THEN 'amer_'
          WHEN email LIKE 'me_%@%'   THEN 'me_'
          ELSE 'other'
        END AS grp,
        COUNT(*) AS cnt
      FROM users
      WHERE is_fake = TRUE
      GROUP BY 1
      ORDER BY 2 DESC
    `);
    res.json(rows);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ── DELETE /api/admin/profiles ────────────────────────────────────
// Body: { ids: ['uuid1', 'uuid2', ...] }
router.delete('/profiles', auth, async (req, res) => {
  try {
    const { ids } = req.body;
    if (!Array.isArray(ids) || ids.length === 0) {
      return res.status(400).json({ error: 'No ids provided' });
    }

    // Get photo filenames before deleting
    const { rows: photoRows } = await query(
      `SELECT photos FROM profiles WHERE user_id = ANY($1::uuid[])`,
      [ids]
    );

    // Delete users (cascades to profiles)
    const placeholders = ids.map((_, i) => `$${i + 1}`).join(',');
    const { rowCount } = await query(
      `DELETE FROM users WHERE id IN (${placeholders})`,
      ids
    );

    // Delete photo files from disk
    for (const row of photoRows) {
      if (row.photos && row.photos.length) {
        for (const fname of row.photos) {
          try {
            const fpath = path.join(UPLOAD_DIR, fname);
            if (fs.existsSync(fpath)) fs.unlinkSync(fpath);
          } catch(_) {}
        }
      }
    }

    res.json({ deleted: rowCount });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: e.message });
  }
});

// ── DELETE /api/admin/profiles/group ─────────────────────────────
// Body: { group: 'rep_' } — delete entire group
router.delete('/profiles/group', auth, async (req, res) => {
  try {
    const { group } = req.body;
    if (!group) return res.status(400).json({ error: 'No group provided' });

    const { rows: photoRows } = await query(
      `SELECT p.photos FROM profiles p JOIN users u ON u.id=p.user_id WHERE u.email LIKE $1`,
      [`${group}%`]
    );

    const { rowCount } = await query(
      `DELETE FROM users WHERE email LIKE $1`,
      [`${group}%`]
    );

    for (const row of photoRows) {
      if (row.photos && row.photos.length) {
        for (const fname of row.photos) {
          try {
            const fpath = path.join(UPLOAD_DIR, fname);
            if (fs.existsSync(fpath)) fs.unlinkSync(fpath);
          } catch(_) {}
        }
      }
    }

    res.json({ deleted: rowCount });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ── GET /api/admin/members?page=1&limit=50&search= ───────────────
router.get('/members', auth, async (req, res) => {
  try {
    const page   = Math.max(1, parseInt(req.query.page)  || 1);
    const limit  = Math.min(200, parseInt(req.query.limit) || 50);
    const search = (req.query.search || '').trim();
    const offset = (page - 1) * limit;

    let where = "u.is_fake = FALSE OR u.is_fake IS NULL";
    const params = [];

    if (search) {
      params.push(`%${search}%`);
      where += ` AND (u.email ILIKE $${params.length} OR p.display_name ILIKE $${params.length})`;
    }

    const dataParams  = [...params, limit, offset];
    const countParams = [...params];

    const { rows } = await query(
      `SELECT u.id, u.email, u.role, u.created_at,
              p.display_name, p.age, p.gender, p.location_text,
              p.occupation, p.bio,
              (SELECT COUNT(*) FROM swipes s WHERE s.swiper_id = u.id) AS swipe_count,
              (SELECT COUNT(*) FROM matches m WHERE m.user1_id = u.id OR m.user2_id = u.id) AS match_count
       FROM users u
       LEFT JOIN profiles p ON p.user_id = u.id
       WHERE ${where}
       ORDER BY u.created_at DESC
       LIMIT $${dataParams.length - 1} OFFSET $${dataParams.length}`,
      dataParams
    );

    const { rows: countRows } = await query(
      `SELECT COUNT(*) FROM users u
       LEFT JOIN profiles p ON p.user_id = u.id
       WHERE ${where}`,
      countParams
    );

    res.json({ members: rows, total: parseInt(countRows[0].count), page, limit });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: e.message });
  }
});

// ── DELETE /api/admin/members ─────────────────────────────────────
// Body: { ids: ['uuid1', ...] }
router.delete('/members', auth, async (req, res) => {
  try {
    const { ids } = req.body;
    if (!Array.isArray(ids) || ids.length === 0) {
      return res.status(400).json({ error: 'No ids provided' });
    }

    // Get photo filenames before deleting
    const { rows: photoRows } = await query(
      `SELECT photos FROM profiles WHERE user_id = ANY($1::uuid[])`,
      [ids]
    );

    const placeholders = ids.map((_, i) => `$${i + 1}`).join(',');
    const { rowCount } = await query(
      `DELETE FROM users WHERE id IN (${placeholders})`,
      ids
    );

    // Delete photo files from disk
    for (const row of photoRows) {
      if (row.photos && row.photos.length) {
        for (const fname of row.photos) {
          try {
            const fpath = path.join(UPLOAD_DIR, fname);
            if (fs.existsSync(fpath)) fs.unlinkSync(fpath);
          } catch (_) {}
        }
      }
    }

    res.json({ deleted: rowCount });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: e.message });
  }
});

// ── POST /api/admin/campaign ──────────────────────────────────────
// Body: { subject, html, emails: ['a@b.com', ...] }
// Starts async send job, returns { jobId, total }
router.post('/campaign', auth, async (req, res) => {
  try {
    const { subject, html, emails } = req.body;
    if (!subject || !html) return res.status(400).json({ error: 'subject and html are required' });
    if (!Array.isArray(emails) || emails.length === 0) {
      return res.status(400).json({ error: 'No email addresses provided' });
    }

    // Validate and deduplicate
    const re = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    const valid = [...new Set(emails.map(e => e.trim().toLowerCase()).filter(e => re.test(e)))];
    if (!valid.length) return res.status(400).json({ error: 'No valid email addresses found' });

    const jobId = Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
    campaignJobs[jobId] = { total: valid.length, sent: 0, failed: 0, done: false, startedAt: new Date() };

    // Fire and forget — send in background
    (async () => {
      try {
        const result = await sendCampaign({
          subject, html, emails: valid,
          onProgress: (sent, failed) => {
            if (campaignJobs[jobId]) {
              campaignJobs[jobId].sent   = sent;
              campaignJobs[jobId].failed = failed;
            }
          },
        });
        if (campaignJobs[jobId]) {
          campaignJobs[jobId].sent   = result.sent;
          campaignJobs[jobId].failed = result.failed;
          campaignJobs[jobId].done   = true;
        }
      } catch (err) {
        console.error('[campaign] job error:', err.message);
        if (campaignJobs[jobId]) { campaignJobs[jobId].done = true; campaignJobs[jobId].error = err.message; }
      }
      // Clean up after 1 hour
      setTimeout(() => delete campaignJobs[jobId], 3600_000);
    })();

    res.json({ jobId, total: valid.length });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: e.message });
  }
});

// ── GET /api/admin/campaign/status/:jobId ─────────────────────────
router.get('/campaign/status/:jobId', auth, (req, res) => {
  const job = campaignJobs[req.params.jobId];
  if (!job) return res.status(404).json({ error: 'Job not found' });
  res.json(job);
});

// ── GET /api/admin/campaign/test ─────────────────────────────────
// Send a test email to a single address
router.post('/campaign/test', auth, async (req, res) => {
  try {
    const { to, subject, html } = req.body;
    if (!to || !subject || !html) return res.status(400).json({ error: 'to, subject and html required' });
    const { sendMail } = require('../email');
    await sendMail({ to, subject, html });
    res.json({ ok: true, message: `Test email sent to ${to}` });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

module.exports = router;
