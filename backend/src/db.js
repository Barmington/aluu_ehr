require('dotenv').config();
const { Pool, types } = require('pg');

// Return DATE columns as plain 'YYYY-MM-DD' strings (no time-zone shifting).
types.setTypeParser(1082, value => value);

const pool = new Pool({
  user: process.env.DB_USER,
  host: process.env.DB_HOST,
  database: process.env.DB_NAME,
  password: process.env.DB_PASSWORD,
  port: process.env.DB_PORT,
});

pool.on('error', err => {
  console.error('Unexpected PostgreSQL error', err);
});

pool
  .query('SELECT now()')
  .then(r => console.log('Connected:', r.rows[0]))
  .catch(err => console.error('Database connection failed:', err.message));

/** Run a function inside a transaction; rolls back on error. */
async function withTransaction(fn) {
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
}

module.exports = {
  pool,
  query: (text, params) => pool.query(text, params),
  withTransaction,
};
