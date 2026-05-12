// database.js
// One shared connection pool for the whole app.
//
// Why a POOL and not a fresh connection every time?
//   Opening a new TCP connection to Postgres takes a few milliseconds and a
//   bit of memory. If we did that on every request the server would be slow
//   AND we would quickly exhaust the database's max-connection limit.
//   A pool keeps a small number of connections open and hands them out to
//   queries as needed, then puts them back when the query is done.
//
// We export TWO things:
//   - `pool`  : the raw pg Pool. The /game/finish handler grabs a `client`
//               from this pool when it needs a transaction (BEGIN/COMMIT).
//   - `query` : a tiny helper for the common case (single statement, no
//               transaction). Models call this for everyday SELECT/INSERT/etc.

const pg = require('pg');
const config = require('./config');

// One Pool instance. The connection string lives in config.js so we never
// have a database password sitting in version-control-tracked code.
//
// Render's managed Postgres requires SSL but uses a self-signed certificate
// that Node's default validator rejects. In production we enable SSL with
// rejectUnauthorized:false — the connection is still encrypted, we just
// don't verify the cert chain (standard practice for managed PaaS DBs).
const pool = new pg.Pool({
  connectionString: config.postgres.connectionString,
  ssl: config.isProduction ? { rejectUnauthorized: false } : false
});

// Helpful one-liner so we know in the terminal if Postgres is even reachable.
// `pool.on('error', ...)` catches errors that happen on idle connections —
// the kind that would otherwise crash the whole Node process.
pool.on('error', function (err) {
  console.error('Unexpected error on idle Postgres client:', err.message);
});

// Thin wrapper around pool.query so models read a little nicer:
//   await db.query('SELECT * FROM songs WHERE song_id = $1', [42])
// Equivalent to pool.query(...) — just a friendlier name.
async function query(text, params) {
  return pool.query(text, params);
}

module.exports = {
  pool,
  query
};
