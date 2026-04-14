/**
 * seed_indian_males.js — Seeds 100 Indian Sugar Daddy profiles with real photos
 * Fetches real Indian male photos from randomuser.me
 * Run: node server/sql/seed_indian_males.js
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

// Ensure upload dir exists
if (!fs.existsSync(UPLOAD_DIR)) fs.mkdirSync(UPLOAD_DIR, { recursive: true });

// ── Indian city data ─────────────────────────────────────────────
const CITIES = [
  { city: 'Mumbai, Maharashtra',     lat: 19.0760, lng: 72.8777 },
  { city: 'Delhi, NCR',              lat: 28.7041, lng: 77.1025 },
  { city: 'Bangalore, Karnataka',    lat: 12.9716, lng: 77.5946 },
  { city: 'Hyderabad, Telangana',    lat: 17.3850, lng: 78.4867 },
  { city: 'Chennai, Tamil Nadu',     lat: 13.0827, lng: 80.2707 },
  { city: 'Pune, Maharashtra',       lat: 18.5204, lng: 73.8567 },
  { city: 'Kolkata, West Bengal',    lat: 22.5726, lng: 88.3639 },
  { city: 'Ahmedabad, Gujarat',      lat: 23.0225, lng: 72.5714 },
  { city: 'Jaipur, Rajasthan',       lat: 26.9124, lng: 75.7873 },
  { city: 'Surat, Gujarat',          lat: 21.1702, lng: 72.8311 },
  { city: 'Lucknow, Uttar Pradesh',  lat: 26.8467, lng: 80.9462 },
  { city: 'Chandigarh, Punjab',      lat: 30.7333, lng: 76.7794 },
  { city: 'Indore, Madhya Pradesh',  lat: 22.7196, lng: 75.8577 },
  { city: 'Bhopal, Madhya Pradesh',  lat: 23.2599, lng: 77.4126 },
  { city: 'Kochi, Kerala',           lat:  9.9312, lng: 76.2673 },
  { city: 'Coimbatore, Tamil Nadu',  lat: 11.0168, lng: 76.9558 },
  { city: 'Gurgaon, Haryana',        lat: 28.4595, lng: 77.0266 },
  { city: 'Noida, Uttar Pradesh',    lat: 28.5355, lng: 77.3910 },
  { city: 'Visakhapatnam, AP',       lat: 17.6868, lng: 83.2185 },
  { city: 'Nagpur, Maharashtra',     lat: 21.1458, lng: 79.0882 },
];

const OCCUPATIONS = [
  'CEO & Managing Director', 'Real Estate Developer', 'IT Business Owner',
  'Industrialist', 'Export Business Owner', 'Hotel & Hospitality Group Owner',
  'Private Equity Investor', 'Stock Market Trader', 'Pharma Company Director',
  'Diamond & Jewellery Merchant', 'Film Producer', 'Media & Entertainment CEO',
  'Automotive Dealership Owner', 'Construction Company Owner',
  'Textile Business Owner', 'Software Company Founder', 'CA & Tax Consultant',
  'Corporate Lawyer', 'Surgeon & Healthcare Executive', 'NRI Business Owner',
];

const EDUCATION_LIST = [
  'IIT Bombay', 'IIM Ahmedabad', 'IIT Delhi', 'IIM Bangalore',
  'BITS Pilani', 'Delhi University', 'Mumbai University',
  'ISB Hyderabad', 'Christ University', 'Manipal Institute of Technology',
];

const BIOS = [
  'Successful businessman based in India. Love fine dining, travel, and genuine connections. Looking for someone to share life\'s best moments with.',
  'Built my business from scratch over 20 years. Now looking for a meaningful relationship with someone who appreciates the finer things in life.',
  'Entrepreneur and investor. Enjoy travelling the world, playing golf, and great conversations. Life is short — spend it with someone special.',
  'Financially secure professional with a passion for culture, art, and travel. Looking for a genuine and loyal companion.',
  'Self-made businessman who values loyalty and honesty above everything. Ready to spoil the right person with time, attention, and experiences.',
  'Running a successful family business. Well-travelled, cultured, and looking for someone to share luxury and love with.',
  'Retired early, now enjoy life to the fullest. Looking for a smart, confident woman to travel, dine, and make memories with.',
  'From humble beginnings to a successful enterprise. I believe in giving back — and in giving the best to the right person.',
  'Well-established in my field with the means to enjoy life. Looking for a genuine connection beyond superficiality.',
  'Senior professional who loves music, cooking, and weekend getaways. Looking for someone who enjoys the good life.',
];

const INTERESTS_POOL = [
  ['Travel', 'Golf', 'Fine Dining', 'Cricket'],
  ['Business', 'Real Estate', 'Investing', 'Travel'],
  ['Music', 'Art', 'Wine', 'Cooking'],
  ['Fitness', 'Yoga', 'Meditation', 'Travel'],
  ['Bollywood', 'Cricket', 'Food', 'Cars'],
  ['Photography', 'Trekking', 'Culture', 'History'],
  ['Chess', 'Reading', 'Philanthropy', 'Movies'],
  ['Tech', 'Startups', 'Crypto', 'Gadgets'],
  ['Polo', 'Horse Racing', 'Luxury Cars', 'Architecture'],
  ['Sailing', 'Gourmet Cooking', 'Opera', 'Sports'],
];

function pick(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}
function randInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

// ── Download a URL to a local file ──────────────────────────────
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
    }).on('error', (err) => {
      fs.unlink(destPath, () => {});
      reject(err);
    });
  });
}

// ── Fetch Indian male users from randomuser.me ───────────────────
function fetchRandomUsers(count) {
  return new Promise((resolve, reject) => {
    const url = `https://randomuser.me/api/?nat=in&gender=male&results=${count}&inc=name,picture,location&noinfo`;
    https.get(url, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          resolve(JSON.parse(data).results);
        } catch(e) {
          reject(e);
        }
      });
    }).on('error', reject);
  });
}

// ── Main ─────────────────────────────────────────────────────────
async function seedIndianMales() {
  console.log('Fetching 100 Indian male profiles from randomuser.me...');

  let randomUsers = [];
  try {
    randomUsers = await fetchRandomUsers(100);
    console.log(`Got ${randomUsers.length} users from randomuser.me`);
  } catch(err) {
    console.warn('Could not fetch from randomuser.me:', err.message);
    console.log('Will create profiles without photos...');
  }

  const passwordHash = await bcrypt.hash('FakeIndianPass!2026', 12);
  let created = 0;

  for (let i = 1; i <= 100; i++) {
    try {
      const id          = uuidv4();
      const ru          = randomUsers[i - 1];
      const firstName   = ru ? (ru.name.first + ' ' + ru.name.last) : `IndianDaddy${i}`;
      const displayName = ru ? ru.name.first + ' ' + ru.name.last.charAt(0) + '.' : `Arjun ${String.fromCharCode(65 + randInt(0, 25))}.`;
      const email       = `indian_daddy_${i}@fake.aiyashi.vip`;
      const age         = randInt(32, 60);
      const location    = pick(CITIES);
      const occ         = pick(OCCUPATIONS);
      const edu         = pick(EDUCATION_LIST);
      const bio         = pick(BIOS);
      const interests   = pick(INTERESTS_POOL);
      const refCode     = id.replace(/-/g, '').substring(0, 8).toUpperCase();

      // Check if already exists
      const { rowCount } = await query('SELECT id FROM users WHERE email = $1', [email]);
      if (rowCount > 0) {
        console.log(`  Skipping ${email} (already exists)`);
        continue;
      }

      // Download photo if available
      let photoFilename = null;
      if (ru && ru.picture && ru.picture.large) {
        const photoPath = path.join(UPLOAD_DIR, `indian_m_${i}.jpg`);
        try {
          await downloadFile(ru.picture.large, photoPath);
          photoFilename = `indian_m_${i}.jpg`;
        } catch(photoErr) {
          // Silent — profile created without photo
        }
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
            location.lat + (Math.random() - 0.5) * 0.2,
            location.lng + (Math.random() - 0.5) * 0.2,
            photos,
          ]
        );

        await query('COMMIT');
        created++;
        if (created % 10 === 0) console.log(`  Created ${created} Indian profiles...`);
      } catch (innerErr) {
        await query('ROLLBACK');
        console.error(`  Failed profile ${i}:`, innerErr.message);
      }
    } catch (err) {
      console.error(`  Error on profile ${i}:`, err.message);
    }
  }

  console.log(`\nDone! Created ${created} Indian Sugar Daddy profiles.`);
  process.exit(0);
}

seedIndianMales().catch(err => { console.error(err); process.exit(1); });
