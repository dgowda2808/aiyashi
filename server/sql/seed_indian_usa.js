/**
 * seed_indian_usa.js — 100 Indian-origin Sugar Daddy profiles in US cities
 * Real photos via randomuser.me (Indian nationality)
 * Run: node server/sql/seed_indian_usa.js
 */
require('dotenv').config();
const bcrypt  = require('bcryptjs');
const { v4: uuidv4 } = require('uuid');
const https   = require('https');
const http    = require('http');
const fs      = require('fs');
const path    = require('path');
const { query } = require('../config/db');

const UPLOAD_DIR = process.env.UPLOAD_DIR || path.join(__dirname, '../../public/uploads');
if (!fs.existsSync(UPLOAD_DIR)) fs.mkdirSync(UPLOAD_DIR, { recursive: true });

const USA_CITIES = [
  { city: 'New York, NY',          lat: 40.7128, lng: -74.0060 },
  { city: 'San Jose, CA',          lat: 37.3382, lng: -121.8863 },
  { city: 'Fremont, CA',           lat: 37.5485, lng: -121.9886 },
  { city: 'Chicago, IL',           lat: 41.8781, lng: -87.6298 },
  { city: 'Houston, TX',           lat: 29.7604, lng: -95.3698 },
  { city: 'Edison, NJ',            lat: 40.5187, lng: -74.4121 },
  { city: 'Dallas, TX',            lat: 32.7767, lng: -96.7970 },
  { city: 'San Francisco, CA',     lat: 37.7749, lng: -122.4194 },
  { city: 'Seattle, WA',           lat: 47.6062, lng: -122.3321 },
  { city: 'Boston, MA',            lat: 42.3601, lng: -71.0589 },
  { city: 'Austin, TX',            lat: 30.2672, lng: -97.7431 },
  { city: 'Atlanta, GA',           lat: 33.7490, lng: -84.3880 },
  { city: 'Washington, DC',        lat: 38.9072, lng: -77.0369 },
  { city: 'Los Angeles, CA',       lat: 34.0522, lng: -118.2437 },
  { city: 'Philadelphia, PA',      lat: 39.9526, lng: -75.1652 },
  { city: 'Sunnyvale, CA',         lat: 37.3688, lng: -122.0363 },
  { city: 'Charlotte, NC',         lat: 35.2271, lng: -80.8431 },
  { city: 'Phoenix, AZ',           lat: 33.4484, lng: -112.0740 },
  { city: 'Denver, CO',            lat: 39.7392, lng: -104.9903 },
  { city: 'Minneapolis, MN',       lat: 44.9778, lng: -93.2650 },
  { city: 'Miami, FL',             lat: 25.7617, lng: -80.1918 },
  { city: 'Detroit, MI',           lat: 42.3314, lng: -83.0458 },
  { city: 'San Diego, CA',         lat: 32.7157, lng: -117.1611 },
  { city: 'Nashville, TN',         lat: 36.1627, lng: -86.7816 },
  { city: 'Portland, OR',          lat: 45.5051, lng: -122.6750 },
];

const OCCUPATIONS = [
  'Software Engineering Director', 'IT Startup Founder', 'Product Manager — Big Tech',
  'Investment Banker', 'Real Estate Developer', 'Private Equity Partner',
  'Cardiologist', 'Neurologist', 'Gastroenterologist',
  'Corporate Attorney', 'Hedge Fund Manager', 'Venture Capitalist',
  'Aerospace Engineer', 'Biotech Entrepreneur', 'Pharmaceutical Executive',
  'Data Science Lead — FAANG', 'Cloud Architecture Director', 'Fintech CEO',
  'Hotel Chain Owner', 'Restaurant Group Founder',
];

const EDUCATION_LIST = [
  'MIT', 'Stanford University', 'Harvard University', 'Carnegie Mellon University',
  'University of California Berkeley', 'Columbia University', 'Cornell University',
  'Georgia Tech', 'University of Michigan', 'Purdue University',
  'IIT Bombay + MS Stanford', 'IIT Delhi + MBA Wharton',
  'BITS Pilani + PhD MIT', 'IIM + Harvard Business School',
];

const BIOS = [
  'Indian-American professional settled in the US for 15 years. Love blending cultures — classical music, global travel, and great food.',
  'Tech entrepreneur who sold his startup. Now enjoying life, investing in the next big thing, and looking for a meaningful connection.',
  'Doctor by training, businessman by passion. Hard-working, financially secure, and ready to give time and attention to the right woman.',
  'Silicon Valley veteran with a heart for genuine relationships. I enjoy weekend getaways, fine dining, and deep conversations.',
  'NRI businessman who splits time between the US and India. Looking for someone who values connection as much as ambition.',
  'Successful professional who worked hard to build a comfortable life. Now want to share it with someone special and loyal.',
  'Self-made from a middle-class background in India. Now thriving in the US. Looking for love, laughter, and lifelong companionship.',
  'Love Indian culture but live an American life. Looking for someone who balances both worlds just like I do.',
  'Financial security was always my goal — achieved it. Now looking for emotional security with the right partner.',
  'Traveller, foodie, and entrepreneur. Been to 45+ countries. Always looking for a partner for the next adventure.',
  'Cardiologist turned healthcare investor. Passionate about wellness, travel, and building a life with someone extraordinary.',
  'IIT-IIM alumnus turned Wall Street professional. Down-to-earth despite the success — looking for realness over everything.',
];

const INTERESTS_POOL = [
  ['Cricket', 'Travel', 'Technology', 'Fine Dining'],
  ['Yoga', 'Meditation', 'Real Estate', 'Investing'],
  ['Bollywood', 'Hiking', 'Golf', 'Wine'],
  ['Chess', 'Reading', 'Philanthropy', 'Cooking'],
  ['Fitness', 'Cars', 'Music', 'Movies'],
  ['Startups', 'Crypto', 'Basketball', 'Travel'],
  ['Classical Music', 'Photography', 'Culture', 'Art'],
  ['Tennis', 'Sailing', 'Architecture', 'Luxury'],
  ['Food', 'Sports', 'Finance', 'Family'],
  ['Aviation', 'History', 'Nature', 'Books'],
];

function pick(arr) { return arr[Math.floor(Math.random() * arr.length)]; }
function randInt(min, max) { return Math.floor(Math.random() * (max - min + 1)) + min; }

function downloadFile(url, destPath) {
  return new Promise((resolve, reject) => {
    const proto = url.startsWith('https') ? https : http;
    const file = fs.createWriteStream(destPath);
    proto.get(url, (response) => {
      if (response.statusCode === 301 || response.statusCode === 302) {
        file.close();
        fs.unlinkSync(destPath);
        return downloadFile(response.headers.location, destPath).then(resolve).catch(reject);
      }
      if (response.statusCode !== 200) {
        file.close();
        return reject(new Error(`HTTP ${response.statusCode}`));
      }
      response.pipe(file);
      file.on('finish', () => { file.close(); resolve(destPath); });
    }).on('error', (err) => { fs.unlink(destPath, () => {}); reject(err); });
  });
}

function fetchRandomUsers(count) {
  return new Promise((resolve, reject) => {
    const url = `https://randomuser.me/api/?nat=in&gender=male&results=${count}&inc=name,picture&noinfo`;
    https.get(url, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try { resolve(JSON.parse(data).results); }
        catch(e) { reject(e); }
      });
    }).on('error', reject);
  });
}

async function seedIndianUSA() {
  console.log('Fetching 100 Indian-origin profiles (US cities) from randomuser.me...');

  let randomUsers = [];
  try {
    randomUsers = await fetchRandomUsers(100);
    console.log(`Got ${randomUsers.length} users`);
  } catch(err) {
    console.warn('randomuser.me failed:', err.message, '— creating without photos');
  }

  const passwordHash = await bcrypt.hash('FakeIndianUSA!2026', 12);
  let created = 0;

  for (let i = 1; i <= 100; i++) {
    try {
      const id          = uuidv4();
      const ru          = randomUsers[i - 1];
      const displayName = ru
        ? `${ru.name.first} ${ru.name.last.charAt(0)}.`
        : `Raj ${String.fromCharCode(65 + randInt(0, 25))}.`;
      const email       = `indian_usa_${i}@fake.aiyashi.vip`;
      const age         = randInt(30, 58);
      const location    = pick(USA_CITIES);
      const occ         = pick(OCCUPATIONS);
      const edu         = pick(EDUCATION_LIST);
      const bio         = pick(BIOS);
      const interests   = pick(INTERESTS_POOL);
      const refCode     = id.replace(/-/g, '').substring(0, 8).toUpperCase();

      const { rowCount } = await query('SELECT id FROM users WHERE email = $1', [email]);
      if (rowCount > 0) continue;

      // Download photo
      let photoFilename = null;
      if (ru?.picture?.large) {
        const photoPath = path.join(UPLOAD_DIR, `indian_usa_${i}.jpg`);
        try {
          await downloadFile(ru.picture.large, photoPath);
          photoFilename = `indian_usa_${i}.jpg`;
        } catch(_) {}
      }

      await query('BEGIN');
      try {
        await query(
          `INSERT INTO users
             (id, email, password_hash, role, is_premium, email_verified,
              face_verified, is_fake, referral_code, credit_balance)
           VALUES ($1,$2,$3,'male',TRUE,TRUE,TRUE,TRUE,$4,0)`,
          [id, email, passwordHash, refCode]
        );

        const photos = photoFilename ? `{${photoFilename}}` : '{}';
        await query(
          `INSERT INTO profiles
             (user_id, display_name, age, bio, occupation, education,
              interests, location_text, lat, lng, is_complete, photos)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,TRUE,$11)`,
          [
            id, displayName, age, bio, occ, edu,
            interests, location.city,
            location.lat + (Math.random() - 0.5) * 0.15,
            location.lng + (Math.random() - 0.5) * 0.15,
            photos,
          ]
        );

        await query('COMMIT');
        created++;
        if (created % 10 === 0) console.log(`  Created ${created} profiles...`);
      } catch (innerErr) {
        await query('ROLLBACK');
        console.error(`  Failed ${i}:`, innerErr.message);
      }
    } catch (err) {
      console.error(`  Error ${i}:`, err.message);
    }
  }

  console.log(`\nDone! Created ${created} Indian-origin US profiles.`);
  process.exit(0);
}

seedIndianUSA().catch(err => { console.error(err); process.exit(1); });
