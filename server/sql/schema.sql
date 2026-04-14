-- ============================================================
--  Verified Dating — PostgreSQL 17 Schema
-- ============================================================

-- Extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pg_trgm";   -- fuzzy text search

-- ── USERS (auth + verification) ─────────────────────────────
CREATE TABLE IF NOT EXISTS users (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    email           TEXT UNIQUE NOT NULL,
    password_hash   TEXT NOT NULL,
    email_verified  BOOLEAN DEFAULT FALSE,
    email_token     TEXT,                        -- verification token
    phone           TEXT,
    phone_verified  BOOLEAN DEFAULT FALSE,
    phone_otp       TEXT,
    phone_otp_exp   TIMESTAMPTZ,
    carrier         TEXT,                        -- Verizon / T-Mobile / AT&T / Sprint
    face_verified   BOOLEAN DEFAULT FALSE,
    is_premium      BOOLEAN DEFAULT FALSE,
    premium_expires TIMESTAMPTZ,
    is_active       BOOLEAN DEFAULT TRUE,
    is_banned       BOOLEAN DEFAULT FALSE,
    ban_reason      TEXT,
    last_seen       TIMESTAMPTZ DEFAULT NOW(),
    created_at      TIMESTAMPTZ DEFAULT NOW(),
    updated_at      TIMESTAMPTZ DEFAULT NOW()
);

-- ── PROFILES ────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS profiles (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id         UUID UNIQUE NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    display_name    TEXT NOT NULL,
    age             INT CHECK (age >= 18 AND age <= 100),
    gender          TEXT,
    interested_in   TEXT[],                      -- array: ['men','women','everyone']
    bio             TEXT,
    occupation      TEXT,
    education       TEXT,
    location_text   TEXT,                        -- "New York, NY"
    lat             DECIMAL(9,6),
    lng             DECIMAL(9,6),
    relationship_goal TEXT,                      -- 'serious','casual','friends','unsure'
    height_cm       INT,
    photos          TEXT[],                      -- ordered array of photo filenames
    interests       TEXT[],                      -- ['Art','Coffee','Travel',...]
    is_complete     BOOLEAN DEFAULT FALSE,       -- profile setup done
    show_me         BOOLEAN DEFAULT TRUE,        -- discoverable
    min_age_pref    INT DEFAULT 18,
    max_age_pref    INT DEFAULT 50,
    max_dist_km     INT DEFAULT 50,
    created_at      TIMESTAMPTZ DEFAULT NOW(),
    updated_at      TIMESTAMPTZ DEFAULT NOW()
);

-- ── SWIPES ──────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS swipes (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    swiper_id       UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    swiped_id       UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    action          TEXT NOT NULL CHECK (action IN ('like','nope','super')),
    created_at      TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(swiper_id, swiped_id)
);
CREATE INDEX IF NOT EXISTS idx_swipes_swiper    ON swipes(swiper_id);
CREATE INDEX IF NOT EXISTS idx_swipes_swiped    ON swipes(swiped_id);

-- ── MATCHES ─────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS matches (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user1_id        UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    user2_id        UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    super_liked     BOOLEAN DEFAULT FALSE,       -- was it a super like?
    unmatched_by    UUID REFERENCES users(id),   -- if unmatched
    created_at      TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(user1_id, user2_id),
    CHECK (user1_id < user2_id)                  -- enforces canonical ordering
);
CREATE INDEX IF NOT EXISTS idx_matches_user1 ON matches(user1_id);
CREATE INDEX IF NOT EXISTS idx_matches_user2 ON matches(user2_id);

-- ── MESSAGES ────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS messages (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    match_id        UUID NOT NULL REFERENCES matches(id) ON DELETE CASCADE,
    sender_id       UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    content         TEXT NOT NULL,
    read_at         TIMESTAMPTZ,
    created_at      TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_messages_match   ON messages(match_id, created_at);
CREATE INDEX IF NOT EXISTS idx_messages_sender  ON messages(sender_id);

-- ── BLOCKS / REPORTS ────────────────────────────────────────
CREATE TABLE IF NOT EXISTS blocks (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    blocker_id      UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    blocked_id      UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at      TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(blocker_id, blocked_id)
);

CREATE TABLE IF NOT EXISTS reports (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    reporter_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    reported_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    reason          TEXT NOT NULL,
    details         TEXT,
    resolved        BOOLEAN DEFAULT FALSE,
    created_at      TIMESTAMPTZ DEFAULT NOW()
);

-- ── REFRESH TOKENS ──────────────────────────────────────────
CREATE TABLE IF NOT EXISTS refresh_tokens (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id         UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    token           TEXT UNIQUE NOT NULL,
    expires_at      TIMESTAMPTZ NOT NULL,
    created_at      TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_refresh_tokens_user ON refresh_tokens(user_id);

-- ── BOOSTS ──────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS boosts (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id         UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    expires_at      TIMESTAMPTZ NOT NULL,
    created_at      TIMESTAMPTZ DEFAULT NOW()
);

-- ── updated_at auto-trigger ──────────────────────────────────
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN NEW.updated_at = NOW(); RETURN NEW; END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_users_updated    BEFORE UPDATE ON users    FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER trg_profiles_updated BEFORE UPDATE ON profiles FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ── MATCH helper view ────────────────────────────────────────
-- Returns matches for a given user (either side of the match)
CREATE OR REPLACE VIEW user_matches AS
SELECT
    m.id            AS match_id,
    m.created_at    AS matched_at,
    m.super_liked,
    m.unmatched_by,
    CASE WHEN m.user1_id = u.id THEN m.user2_id ELSE m.user1_id END AS other_user_id,
    u.id            AS this_user_id
FROM matches m
JOIN users u ON (u.id = m.user1_id OR u.id = m.user2_id)
WHERE m.unmatched_by IS NULL;
