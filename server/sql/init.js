/**
 * init.js — run once to create DB, user and apply schema
 * Usage: node server/sql/init.js
 */
require('dotenv').config();
const { Client } = require('pg');
const fs = require('fs');
const path = require('path');

async function init() {
  // Connect as postgres superuser to create DB + role
  const admin = new Client({
    host: process.env.DB_HOST || 'localhost',
    port: process.env.DB_PORT || 5432,
    database: 'postgres',
    user: 'postgres',            // default superuser
    password: process.env.DB_ADMIN_PASSWORD || '',
  });

  try {
    await admin.connect();
    console.log('✓ Connected as postgres superuser');

    const dbName   = process.env.DB_NAME     || 'datemap';
    const dbUser   = process.env.DB_USER     || 'datemap_user';
    const dbPass   = process.env.DB_PASSWORD || 'changeme';

    // Create role if not exists
    const roleExists = await admin.query(
      `SELECT 1 FROM pg_roles WHERE rolname = $1`, [dbUser]
    );
    if (roleExists.rowCount === 0) {
      await admin.query(`CREATE USER "${dbUser}" WITH PASSWORD '${dbPass}'`);
      console.log(`✓ Created DB user: ${dbUser}`);
    } else {
      console.log(`  DB user already exists: ${dbUser}`);
    }

    // Create database if not exists
    const dbExists = await admin.query(
      `SELECT 1 FROM pg_database WHERE datname = $1`, [dbName]
    );
    if (dbExists.rowCount === 0) {
      await admin.query(`CREATE DATABASE "${dbName}" OWNER "${dbUser}"`);
      console.log(`✓ Created database: ${dbName}`);
    } else {
      console.log(`  Database already exists: ${dbName}`);
    }

    await admin.query(`GRANT ALL PRIVILEGES ON DATABASE "${dbName}" TO "${dbUser}"`);
    await admin.end();

    // Now connect to the new DB to apply schema
    const app = new Client({
      host: process.env.DB_HOST || 'localhost',
      port: process.env.DB_PORT || 5432,
      database: dbName,
      user: 'postgres',
      password: process.env.DB_ADMIN_PASSWORD || '',
    });

    await app.connect();
    const schema = fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8');
    await app.query(schema);
    console.log('✓ Schema applied successfully');

    // Grant schema permissions
    await app.query(`GRANT ALL ON ALL TABLES IN SCHEMA public TO "${dbUser}"`);
    await app.query(`GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO "${dbUser}"`);
    await app.query(`ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO "${dbUser}"`);
    await app.query(`ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON SEQUENCES TO "${dbUser}"`);
    console.log('✓ Permissions granted');

    await app.end();
    console.log('\n✅ Database initialised. You can now start the server.');
  } catch (err) {
    console.error('❌ Init failed:', err.message);
    process.exit(1);
  }
}

init();
