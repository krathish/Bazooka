// scripts/discover-songs.js — bulk-import songs from iTunes Search.
// Run with: npm run discover-songs

const db = require('../database');

const SEARCH_TERMS = [
  'pop',
  'hip hop',
  'rock',
  'indie',
  'dance',
  'country',
  'alternative',
  'rnb'
];

// iTunes caps `limit` at 200 per call.
const RESULTS_PER_TERM = 200;

function sleep(ms) {
  return new Promise(function (resolve) { setTimeout(resolve, ms); });
}

function buildUrl(term) {
  return 'https://itunes.apple.com/search'
       + '?term=' + encodeURIComponent(term)
       + '&entity=song'
       + '&limit=' + RESULTS_PER_TERM
       + '&country=US';
}

async function searchItunes(term) {
  const response = await fetch(buildUrl(term));
  if (!response.ok) throw new Error('iTunes HTTP ' + response.status);
  const json = await response.json();
  return json.results || [];
}

// DO UPDATE (no-op) instead of DO NOTHING so RETURNING fires on conflict too.
async function upsertArtist(name) {
  const sql = `
    INSERT INTO artists (name) VALUES ($1)
    ON CONFLICT (name) DO UPDATE SET name = EXCLUDED.name
    RETURNING artist_id
  `;
  const result = await db.query(sql, [name]);
  return result.rows[0].artist_id;
}

// RETURNING song_id lets us count "actually new" vs "skipped duplicate".
async function insertSongIfNew(artistId, title, previewUrl) {
  const sql = `
    INSERT INTO songs (artist_id, title, preview_url)
    VALUES ($1, $2, $3)
    ON CONFLICT (artist_id, title) DO NOTHING
    RETURNING song_id
  `;
  const result = await db.query(sql, [artistId, title, previewUrl]);
  return result.rows.length > 0;
}

async function main() {
  console.log('Discovering songs across ' + SEARCH_TERMS.length + ' genre terms...\n');

  let totalSeen = 0;
  let totalInserted = 0;
  let totalSkippedDup = 0;
  let totalSkippedBad = 0;

  for (const term of SEARCH_TERMS) {
    process.stdout.write('  "' + term + '"  ');
    let results;
    try {
      results = await searchItunes(term);
    } catch (err) {
      console.log('  search failed: ' + err.message);
      continue;
    }
    process.stdout.write(results.length + ' results -> ');

    let inserted = 0;
    let dup = 0;
    let bad = 0;

    for (const r of results) {
      totalSeen += 1;

      if (!r.trackName || !r.artistName || !r.previewUrl || r.kind !== 'song') {
        bad += 1;
        totalSkippedBad += 1;
        continue;
      }

      // Trim to fit VARCHAR(100).
      const artistName = r.artistName.slice(0, 100);
      const title = r.trackName.slice(0, 100);

      try {
        const artistId = await upsertArtist(artistName);
        const wasNew = await insertSongIfNew(artistId, title, r.previewUrl);
        if (wasNew) {
          inserted += 1;
          totalInserted += 1;
        } else {
          dup += 1;
          totalSkippedDup += 1;
        }
      } catch (err) {
        bad += 1;
        totalSkippedBad += 1;
        console.log('\n    failed on "' + title + '" — ' + err.message);
      }
    }

    console.log(inserted + ' new, ' + dup + ' duplicate, ' + bad + ' skipped');

    // Be polite to the free API.
    await sleep(400);
  }

  console.log('\n----- DONE -----');
  console.log('saw      ' + totalSeen);
  console.log('new      ' + totalInserted);
  console.log('dup      ' + totalSkippedDup);
  console.log('bad      ' + totalSkippedBad);

  const { rows } = await db.query('SELECT COUNT(*)::int AS n FROM songs WHERE preview_url IS NOT NULL');
  console.log('catalog: ' + rows[0].n + ' playable songs');

  await db.pool.end();
}

main().catch(function (err) {
  console.error('discover-songs failed:', err);
  process.exit(1);
});
