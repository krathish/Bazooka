// models/songModel.js
// All the SQL related to the `songs` table lives here.
// Routes never write SQL directly — they call these functions instead.
// That way if we ever rename a column, we change ONE file, not ten.

const db = require('../database');

// Pull `count` random song_ids from the database.
// Used by POST /game/start to build the 10-song queue for a new game.
//
// We filter WHERE preview_url IS NOT NULL because the round is
// audio-only — without a 30-second preview, the player has nothing to
// guess from. (The 30 hand-curated seed songs all get URLs from
// `npm run fetch-previews`; the auto-discovered songs get them inline.)
//
// SECURITY NOTE — SQL injection
//   We never paste user input straight into the SQL string. Instead we use
//   the parameterized form `$1` and pass `[count]` as the second argument.
//   The pg driver sends the value separately from the query, so even if a
//   user typed something like `10; DROP TABLE songs;--` Postgres would treat
//   it as a single value, not as more SQL. This is the #1 reason for using
//   parameterized queries.
async function getRandomSongIds(count) {
  const sql = `
    SELECT song_id
    FROM songs
    WHERE preview_url IS NOT NULL
    ORDER BY RANDOM()
    LIMIT $1
  `;
  const result = await db.query(sql, [count]);
  // result.rows is an array of objects like [{song_id: 7}, {song_id: 2}, ...].
  // The route just wants the integers, so we map() them out.
  return result.rows.map(function (row) { return row.song_id; });
}

// Look up one song by its primary key, AND also return its artist name.
// Used by GET /game/play to render the lyric for the current round.
//
// JOIN NOTE
//   Songs and artists have a 1-many relationship: one artist has many songs,
//   each song belongs to one artist. We JOIN the two tables in a single
//   query (instead of doing two separate SELECTs) so Postgres returns the
//   row already glued together. ONE round-trip to the database, not two.
async function getSongWithArtist(songId) {
  const sql = `
    SELECT s.song_id, s.title, s.lyric_hint, s.preview_url,
           a.artist_id, a.name AS artist
    FROM songs s
    JOIN artists a ON s.artist_id = a.artist_id
    WHERE s.song_id = $1
  `;
  const result = await db.query(sql, [songId]);
  // result.rows is either [] (no match) or one row. Return null on miss so
  // the caller can do `if (!song) ...` cleanly instead of checking length.
  return result.rows[0] || null;
}

module.exports = {
  getRandomSongIds,
  getSongWithArtist
};
