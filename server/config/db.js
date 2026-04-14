/**
 * db.js — PostgreSQL connection pool
 */
const { Pool } = require('pg');

const pool = new Pool({
  host:     process.env.DB_HOST     || 'localhost',
  port:     parseInt(process.env.DB_PORT) || 5432,
  database: process.env.DB_NAME     || 'datemap',
  user:     process.env.DB_USER     || 'verified_user',
  password: process.env.DB_PASSWORD || '',
  max:      10,          // max pool size — fine for 200-300 users
  idleTimeoutMillis:    30000,
  connectionTimeoutMillis: 5000,
});

pool.on('error', (err) => {
  console.error('Unexpected DB pool error:', err.message);
});

// Simple query helper
const query = (text, params) => pool.query(text, params);

// Transaction helper
const withTransaction = async (fn) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
};

module.exports = { pool, query, withTransaction };
