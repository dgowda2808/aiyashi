/**
 * seed_males.js — Seeds 100 fake Sugar Daddy profiles
 * Run: node server/sql/seed_males.js
 */
require('dotenv').config();
const bcrypt = require('bcryptjs');
const { v4: uuidv4 } = require('uuid');
const { query } = require('../config/db');

const CITIES = [
  { city: 'New York, NY',       lat: 40.7128, lng: -74.0060 },
  { city: 'Los Angeles, CA',    lat: 34.0522, lng: -118.2437 },
  { city: 'Chicago, IL',        lat: 41.8781, lng: -87.6298 },
  { city: 'Houston, TX',        lat: 29.7604, lng: -95.3698 },
  { city: 'Miami, FL',          lat: 25.7617, lng: -80.1918 },
  { city: 'San Francisco, CA',  lat: 37.7749, lng: -122.4194 },
  { city: 'Las Vegas, NV',      lat: 36.1699, lng: -115.1398 },
  { city: 'Seattle, WA',        lat: 47.6062, lng: -122.3321 },
  { city: 'Boston, MA',         lat: 42.3601, lng: -71.0589 },
  { city: 'Dallas, TX',         lat: 32.7767, lng: -96.7970 },
  { city: 'Atlanta, GA',        lat: 33.7490, lng: -84.3880 },
  { city: 'Phoenix, AZ',        lat: 33.4484, lng: -112.0740 },
  { city: 'Denver, CO',         lat: 39.7392, lng: -104.9903 },
  { city: 'Austin, TX',         lat: 30.2672, lng: -97.7431 },
  { city: 'Nashville, TN',      lat: 36.1627, lng: -86.7816 },
  { city: 'Portland, OR',       lat: 45.5051, lng: -122.6750 },
  { city: 'San Diego, CA',      lat: 32.7157, lng: -117.1611 },
  { city: 'Charlotte, NC',      lat: 35.2271, lng: -80.8431 },
  { city: 'Minneapolis, MN',    lat: 44.9778, lng: -93.2650 },
  { city: 'Philadelphia, PA',   lat: 39.9526, lng: -75.1652 },
];

const OCCUPATIONS = [
  'CEO & Founder', 'Investment Banker', 'Real Estate Developer',
  'Tech Entrepreneur', 'Private Equity Partner', 'Hedge Fund Manager',
  'Venture Capitalist', 'Luxury Real Estate Agent', 'Senior Software Architect',
  'Corporate Attorney', 'Plastic Surgeon', 'Oil & Gas Executive',
  'Fashion Industry Director', 'Media Executive', 'Aerospace Engineer',
  'Wealth Manager', 'Import/Export Businessman', 'Hotel Chain Owner',
  'Restaurant Group Owner', 'Sports Agent',
];

const EDUCATION = [
  'Harvard Business School', 'Stanford University', 'MIT', 'Wharton School',
  'Columbia University', 'NYU Stern', 'University of Chicago',
  'Yale School of Management', 'Northwestern Kellogg', 'Duke University',
];

const FIRST_NAMES = [
  'James', 'Robert', 'Michael', 'William', 'David', 'Richard', 'Joseph',
  'Thomas', 'Charles', 'Christopher', 'Daniel', 'Matthew', 'Anthony',
  'Mark', 'Donald', 'Steven', 'Paul', 'Andrew', 'Joshua', 'Kenneth',
  'Kevin', 'Brian', 'George', 'Timothy', 'Ronald', 'Edward', 'Jason',
  'Jeffrey', 'Ryan', 'Jacob', 'Gary', 'Nicholas', 'Eric', 'Jonathan',
  'Stephen', 'Larry', 'Justin', 'Scott', 'Brandon', 'Frank',
  'Benjamin', 'Gregory', 'Samuel', 'Raymond', 'Patrick', 'Alexander',
  'Jack', 'Dennis', 'Jerry', 'Tyler',
];

const BIOS = [
  'Successful entrepreneur who values genuine connections. I enjoy fine dining, travel, and the finer things in life. Looking for someone to share life\'s best moments with.',
  'Life is short — spend it with someone who appreciates the good things. I work hard, play harder, and believe in treating a partner like royalty.',
  'Built my business from the ground up. Now looking to invest in a meaningful relationship. Love art, travel, and great conversations over dinner.',
  'Financially secure professional who enjoys spoiling someone special. I value loyalty, honesty, and a great sense of humor above all else.',
  'Passionate about business, travel, and fine cuisine. I believe in quality over quantity — in life and in relationships.',
  'Successful but humble. Looking for a genuine connection with a woman who knows what she wants. I enjoy weekend getaways and cultural experiences.',
  'I have built a good life and want to share it with the right person. Generous, caring, and ready for something real.',
  'Entrepreneur at heart, adventurer by passion. From boardrooms to beaches — I do it all. Looking for my partner in life.',
  'Work hard, live well. I believe in taking care of the people I care about. Looking for a special lady to travel the world with.',
  'Private equity professional who enjoys philanthropy, golf, and excellent wine. Looking for a mature, genuine connection.',
];

const INTERESTS_POOL = [
  ['Travel', 'Fine Dining', 'Art', 'Golf'],
  ['Wine', 'Sailing', 'Opera', 'Real Estate'],
  ['Fitness', 'Tech', 'Investing', 'Travel'],
  ['Philanthropy', 'Music', 'Polo', 'Luxury Cars'],
  ['Business', 'Cooking', 'Hiking', 'Photography'],
  ['Tennis', 'Wine Tasting', 'Architecture', 'Travel'],
  ['Aviation', 'Yachting', 'Fine Art', 'Dining'],
  ['Crypto', 'Startups', 'Travel', 'Fitness'],
  ['Sports', 'Food', 'Movies', 'Reading'],
  ['Meditation', 'Yoga', 'Nature', 'Music'],
];

function pick(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

function randInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

async function seedMales() {
  console.log('Seeding 100 fake Sugar Daddy profiles...');
  const passwordHash = await bcrypt.hash('FakePass!2026', 12);
  let created = 0;

  for (let i = 1; i <= 100; i++) {
    try {
      const id        = uuidv4();
      const firstName = pick(FIRST_NAMES);
      const displayName = firstName + ' ' + String.fromCharCode(65 + randInt(0, 25)) + '.';
      const email     = `sugar_daddy_${i}@fake.aiyashi.vip`;
      const age       = randInt(35, 65);
      const location  = pick(CITIES);
      const occ       = pick(OCCUPATIONS);
      const edu       = pick(EDUCATION);
      const bio       = pick(BIOS);
      const interests = pick(INTERESTS_POOL);
      const refCode   = id.replace(/-/g, '').substring(0, 8).toUpperCase();

      // Check if already exists
      const { rowCount } = await query('SELECT id FROM users WHERE email = $1', [email]);
      if (rowCount > 0) { continue; }

      await query('BEGIN');
      try {
        await query(
          `INSERT INTO users
             (id, email, password_hash, role, is_premium, email_verified,
              face_verified, is_fake, referral_code, credit_balance)
           VALUES ($1,$2,$3,'male',TRUE,TRUE,TRUE,TRUE,$4,0)`,
          [id, email, passwordHash, refCode]
        );

        await query(
          `INSERT INTO profiles
             (user_id, display_name, age, bio, occupation, education,
              interests, location_text, lat, lng, is_complete)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,TRUE)`,
          [
            id, displayName, age, bio, occ, edu,
            interests, location.city,
            location.lat + (Math.random() - 0.5) * 0.1,
            location.lng + (Math.random() - 0.5) * 0.1,
          ]
        );

        await query('COMMIT');
        created++;
        if (created % 10 === 0) console.log(`  Created ${created} profiles...`);
      } catch (innerErr) {
        await query('ROLLBACK');
        console.error(`  Failed profile ${i}:`, innerErr.message);
      }
    } catch (err) {
      console.error(`  Error on ${i}:`, err.message);
    }
  }

  console.log(`Done! Created ${created} Sugar Daddy profiles.`);
  process.exit(0);
}

seedMales().catch(err => { console.error(err); process.exit(1); });
