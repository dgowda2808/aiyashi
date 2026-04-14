/**
 * seed.js — creates test users for local development
 * Usage: node server/sql/seed.js
 *
 * Test accounts created:
 *   alex@test.com   / Test1234!   (main user)
 *   sarah@test.com  / Test1234!
 *   jessica@test.com/ Test1234!
 *   maya@test.com   / Test1234!
 */
require('dotenv').config();
const bcrypt = require('bcryptjs');
const { pool } = require('../config/db');

const users = [
  {
    email: 'alex@test.com',
    password: 'Test1234!',
    display_name: 'Alex Rivera',
    age: 30, gender: 'man',
    bio: 'Software engineer. Coffee enthusiast. Looking for something real.',
    occupation: 'Software Engineer', education: 'MIT',
    location_text: 'New York, NY',
    interests: ['Tech','Coffee','Travel','Music'],
    relationship_goal: 'serious',
    email_verified: true, phone_verified: true, face_verified: true,
    carrier: 'AT&T', is_premium: false,
  },
  {
    email: 'sarah@test.com',
    password: 'Test1234!',
    display_name: 'Sarah M.',
    age: 28, gender: 'woman',
    bio: 'Museum enthusiast. Coffee snob. I\'ll probably drag you to a gallery opening on our first date — fair warning.',
    occupation: 'UX Designer', education: 'Columbia University',
    location_text: 'New York, NY',
    interests: ['Art','Coffee','Travel','Books','Theatre'],
    relationship_goal: 'serious',
    email_verified: true, phone_verified: true, face_verified: true,
    carrier: 'T-Mobile', is_premium: true,
  },
  {
    email: 'jessica@test.com',
    password: 'Test1234!',
    display_name: 'Jessica',
    age: 26, gender: 'woman',
    bio: 'Building things by day, jamming on guitar by night. Half-marathons and honest conversations.',
    occupation: 'Software Engineer', education: 'NYU',
    location_text: 'Brooklyn, NY',
    interests: ['Tech','Music','Running','Hiking'],
    relationship_goal: 'casual',
    email_verified: true, phone_verified: true, face_verified: false,
    carrier: 'Verizon', is_premium: false,
  },
  {
    email: 'maya@test.com',
    password: 'Test1234!',
    display_name: 'Maya K.',
    age: 24, gender: 'woman',
    bio: 'Yoga instructor by day, amateur chef by night. Looking for someone to try new restaurants with.',
    occupation: 'Yoga Instructor', education: 'UCLA',
    location_text: 'Hoboken, NJ',
    interests: ['Yoga','Food','Travel','Photography'],
    relationship_goal: 'unsure',
    email_verified: true, phone_verified: false, face_verified: true,
    carrier: null, is_premium: false,
  },
];

async function seed() {
  const client = await pool.connect();
  try {
    console.log('Seeding test users...\n');

    for (const u of users) {
      const hash = await bcrypt.hash(u.password, 12);

      // Upsert user
      const { rows: [user] } = await client.query(
        `INSERT INTO users (email, password_hash, email_verified, phone_verified,
           face_verified, carrier, is_premium)
         VALUES ($1,$2,$3,$4,$5,$6,$7)
         ON CONFLICT (email) DO UPDATE
           SET email_verified=$3, phone_verified=$4, face_verified=$5,
               carrier=$6, is_premium=$7
         RETURNING id`,
        [u.email, hash, u.email_verified, u.phone_verified,
         u.face_verified, u.carrier, u.is_premium]
      );

      // Upsert profile
      await client.query(
        `INSERT INTO profiles
           (user_id, display_name, age, gender, bio, occupation, education,
            location_text, interests, relationship_goal, is_complete, show_me)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,true,true)
         ON CONFLICT (user_id) DO UPDATE
           SET display_name=$2, age=$3, gender=$4, bio=$5, occupation=$6,
               education=$7, location_text=$8, interests=$9,
               relationship_goal=$10, is_complete=true`,
        [user.id, u.display_name, u.age, u.gender, u.bio,
         u.occupation, u.education, u.location_text,
         JSON.stringify(u.interests), u.relationship_goal]
      );

      console.log(`  ✓ ${u.email.padEnd(25)} id: ${user.id}`);
    }

    console.log(`
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 Test accounts ready:

  Email              Password
  alex@test.com      Test1234!   ← log in as this user
  sarah@test.com     Test1234!
  jessica@test.com   Test1234!
  maya@test.com      Test1234!
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);

  } catch (err) {
    console.error('Seed failed:', err.message);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
}

seed();
