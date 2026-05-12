// database.js — shared pg pool + thin query helper.

const pg = require('pg');
const config = require('./config');

// Render's managed Postgres uses a self-signed cert; connection is still
// encrypted, we just don't verify the cert chain.
const pool = new pg.Pool({
  connectionString: config.postgres.connectionString,
  ssl: config.isProduction ? { rejectUnauthorized: false } : false
});

pool.on('error', function (err) {
  console.error('Unexpected error on idle Postgres client:', err.message);
});

async function query(text, params) {
  return pool.query(text, params);
}

module.exports = {
  pool,
  query
};
