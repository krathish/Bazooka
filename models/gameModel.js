// models/gameModel.js — SQL for the `games` table.

const db = require('../database');

// Optional `dbClient` lets this run inside a caller-managed transaction.
async function createGame(nickname, finalScore, dbClient) {
  const runner = dbClient || db.pool;

  const sql = `
    INSERT INTO games (nickname, final_score)
    VALUES ($1, $2)
    RETURNING game_id
  `;

  const result = await runner.query(sql, [nickname, finalScore]);
  return result.rows[0].game_id;
}

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
