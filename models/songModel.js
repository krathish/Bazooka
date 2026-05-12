// models/songModel.js — SQL for the `songs` table.

const db = require('../database');

// Random song_ids for a fresh game; only rows with a preview_url are playable.
async function getRandomSongIds(count) {
  const sql = `
    SELECT song_id
    FROM songs
    WHERE preview_url IS NOT NULL
    ORDER BY RANDOM()
    LIMIT $1
  `;
  const result = await db.query(sql, [count]);
  return result.rows.map(function (row) { return row.song_id; });
}

async function getSongWithArtist(songId) {
  const sql = `
    SELECT s.song_id, s.title, s.lyric_hint, s.preview_url,
           a.artist_id, a.name AS artist
    FROM songs s
    JOIN artists a ON s.artist_id = a.artist_id
    WHERE s.song_id = $1
  `;
  const result = await db.query(sql, [songId]);
  return result.rows[0] || null;
}

module.exports = {
  getRandomSongIds,
  getSongWithArtist
};
