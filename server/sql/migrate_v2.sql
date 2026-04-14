-- Migration v2: Sugar Daddy app features
-- Run on live server: psql -U postgres -d datemap -f server/sql/migrate_v2.sql

-- Users table additions
ALTER TABLE users ADD COLUMN IF NOT EXISTS role           TEXT      DEFAULT 'female' CHECK (role IN ('female','male','other'));
ALTER TABLE users ADD COLUMN IF NOT EXISTS referral_code  TEXT      UNIQUE;
ALTER TABLE users ADD COLUMN IF NOT EXISTS referred_by    UUID      REFERENCES users(id);
ALTER TABLE users ADD COLUMN IF NOT EXISTS credit_balance INT       DEFAULT 0;
ALTER TABLE users ADD COLUMN IF NOT EXISTS last_boost_at  TIMESTAMPTZ;
ALTER TABLE users ADD COLUMN IF NOT EXISTS premium_until  TIMESTAMPTZ;
ALTER TABLE users ADD COLUMN IF NOT EXISTS verification_docs TEXT[];
ALTER TABLE users ADD COLUMN IF NOT EXISTS is_fake        BOOLEAN   DEFAULT FALSE;

-- Profiles table additions
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS is_fake     BOOLEAN   DEFAULT FALSE;

-- Backfill: give every existing user a referral code based on their id
UPDATE users SET referral_code = UPPER(SUBSTRING(REPLACE(id::text, '-', ''), 1, 8))
WHERE referral_code IS NULL;

-- Index for fast referral code lookups
CREATE UNIQUE INDEX IF NOT EXISTS idx_users_referral_code ON users(referral_code);
CREATE INDEX IF NOT EXISTS idx_users_role ON users(role);

SELECT 'Migration v2 complete' AS status;
