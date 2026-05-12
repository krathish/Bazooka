// models/guessModel.js
// All the SQL related to the `guesses` table lives here.
// Two things in this file:
//   - addGuess              : INSERT one round of a game
//   - getGuessesByGameId    : SELECT all 10 rounds for the finish screen,
//                             joined with songs+artists so the template gets
//                             the song title and artist name in one go

const db = require('../database');

// Insert one row into `guesses`.
//
// Like createGame in gameModel.js, this accepts an optional `dbClient` so it
// can run inside a transaction. The /game/finish handler calls this 10
// times in a loop, all on the SAME client, so either every insert lands or
// none of them do.
async function addGuess(gameId, songId, pointsAwarded, wasCorrect, timeTakenSeconds, dbClient) {
  const runner = dbClient || db.pool;

  const sql = `
    INSERT INTO guesses (game_id, song_id, points_awarded, was_correct, time_taken_seconds)
    VALUES ($1, $2, $3, $4, $5)
  `;

  // Five parameters, five placeholders. pg matches them up in order.
  await runner.query(sql, [gameId, songId, pointsAwarded, wasCorrect, timeTakenSeconds]);
}

// Fetch all 10 guesses for one game, alongside the song title and artist
// name. Used by the finish screen's per-round review table.
//
// THREE-TABLE JOIN
//   guesses --(song_id)--> songs --(artist_id)--> artists
//   We chain two JOINs in the same query so a single round-trip returns
//   everything the view needs. The alternative (one query for guesses,
//   then a separate lookup for each song, then for each artist) would be
//   the classic "N+1 query" anti-pattern.
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
