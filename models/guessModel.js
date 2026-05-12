// models/guessModel.js — SQL for the `guesses` table.

const db = require('../database');

// Optional `dbClient` lets this run inside a caller-managed transaction.
async function addGuess(gameId, songId, pointsAwarded, wasCorrect, timeTakenSeconds, dbClient) {
  const runner = dbClient || db.pool;

  const sql = `
    INSERT INTO guesses (game_id, song_id, points_awarded, was_correct, time_taken_seconds)
    VALUES ($1, $2, $3, $4, $5)
  `;

  await runner.query(sql, [gameId, songId, pointsAwarded, wasCorrect, timeTakenSeconds]);
}

// 3-table JOIN so the finish view gets song + artist in one round-trip (no N+1).
async function getGuessesByGameId(gameId) {
  const sql = `
    SELECT g.guess_id,
           g.points_awarded,
           g.was_correct,
           g.time_taken_seconds,
           s.title AS song_title,
           a.name  AS artist_name
    FROM guesses g
    JOIN songs   s ON s.song_id   = g.song_id
    JOIN artists a ON a.artist_id = s.artist_id
    WHERE g.game_id = $1
    ORDER BY g.guess_id
  `;
  const result = await db.query(sql, [gameId]);
  return result.rows;
}

module.exports = {
  addGuess,
  getGuessesByGameId
};
