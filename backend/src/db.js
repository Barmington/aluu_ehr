require('dotenv').config();
const { Pool, types } = require('pg');

// Return DATE columns as YYYY-MM-DD strings.
types.setTypeParser(1082, value => value);

const pool = new Pool(
  process.env.DATABASE_URL
    ? {
        connectionString: process.env.DATABASE_URL,
      }
    : {
        user: process.env.DB_USER,
        host: process.env.DB_HOST,
        database: process.env.DB_NAME,
        password: process.env.DB_PASSWORD,
        port: Number(process.env.DB_PORT || 5432),
      },
);

pool.on('error', err => {
  console.error('Unexpected PostgreSQL error:', err);
});

pool
  .query('SELECT NOW()')
  .then(() => console.log('PostgreSQL connected successfully'))
  .catch(err => console.error('Database connection failed:', err.message));

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
