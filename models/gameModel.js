// models/gameModel.js
// All the SQL related to the `games` table lives here.
// Two things in this file:
//   - createGame    : inserts a finished game and returns its new game_id
//   - getTopGames   : reads the leaderboard for the home page

const db = require('../database');

// Insert a finished game and return the auto-generated primary key.
//
// The optional `dbClient` parameter is the trick that lets this function
// participate in a TRANSACTION when the caller has one open:
//   - If the caller passes a `client` from `pool.connect()`, the INSERT
//     runs inside that client's transaction (BEGIN ... COMMIT).
//   - If the caller passes nothing, we fall back to the shared pool, which
//     just runs the INSERT immediately (auto-commit).
// Same function, both worlds. Default values rule.
//
// `RETURNING game_id` is a Postgres feature: it gives us back the value
// the SERIAL column generated, in the same round-trip as the INSERT.
// Without this we would need a second SELECT to find the new row.
async function createGame(nickname, finalScore, dbClient) {
  const runner = dbClient || db.pool; // either a transaction client or the pool

  const sql = `
    INSERT INTO games (nickname, final_score)
    VALUES ($1, $2)
    RETURNING game_id
  `;

  const result = await runner.query(sql, [nickname, finalScore]);
  return result.rows[0].game_id;
}

// Read the top `limit` scores for the leaderboard on the home page.
// Sort by final_score DESC (highest first), then by played_at ASC (older
// games "win" ties, which feels right — they got there first).
async function getTopGames(limit) {
  const sql = `
    SELECT game_id, nickname, final_score, played_at
    FROM games
    ORDER BY final_score DESC, played_at ASC
    LIMIT $1
  `;
  const result = await db.query(sql, [limit]);
  return result.rows;
}

module.exports = {
  createGame,
  getTopGames
};
