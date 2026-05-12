// scripts/discover-songs.js
// Bulk-import songs from Apple's iTunes Search API to grow the catalog
// from "30 hand-picked tracks" to "several hundred", so games never
// repeat the same songs back-to-back.
//
// Run with:   npm run discover-songs
//
// What it does:
//   For each search term in SEARCH_TERMS, ask iTunes for up to 200
//   matching songs. For each result, upsert the artist (so we don't
//   insert "Taylor Swift" twice) and insert the song using
//   ON CONFLICT (artist_id, title) DO NOTHING so duplicates are
//   silently skipped. Re-running the script is safe and cheap.
//
// Why bulk-cache instead of querying iTunes during gameplay:
//   1. Players never wait on a third-party API mid-round.
//   2. We control the catalog (can prune later if needed).
//   3. The leaderboard's per-round review keeps working long after
//      iTunes might rotate its preview URLs.

const db = require('../database');

// Broad search terms. iTunes ranks by popularity, so each one returns
// mostly mainstream tracks. Add or remove terms here to widen / narrow
// the catalog.
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

// iTunes Search caps `limit` at 200 per call. We hit that ceiling on
// every term to maximize what one run returns.
const RESULTS_PER_TERM = 200;

function sleep(ms) {
  return new Promise(function (resolve) { setTimeout(resolve, ms); });
}

// Build the iTunes Search URL.
//   entity=song   -> only return tracks (not albums or music videos)
//   limit=200     -> the API's cap
//   country=US    -> US storefront, where most preview URLs are populated
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

// "Upsert" pattern: insert if not present, return the id either way.
// ON CONFLICT (name) DO UPDATE SET name = EXCLUDED.name is a no-op write
// that exists ONLY so RETURNING fires even on conflict. (DO NOTHING
// would skip the RETURNING, leaving us with an empty result on duplicates.)
async function upsertArtist(name) {
  const sql = `
    INSERT INTO artists (name) VALUES ($1)
    ON CONFLICT (name) DO UPDATE SET name = EXCLUDED.name
    RETURNING artist_id
  `;
  const result = await db.query(sql, [name]);
  return result.rows[0].artist_id;
}

// Insert a song. ON CONFLICT (artist_id, title) DO NOTHING uses the
// UNIQUE constraint we added in instructions.sql to silently skip rows
// we already have. RETURNING song_id then lets us count "actually new"
// vs "skipped duplicate" without an extra SELECT.
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

      // Skip results missing any of the three fields the game needs.
      // r.kind is 'song' for actual tracks (vs 'music-video', 'feature-movie', ...).
      if (!r.trackName || !r.artistName || !r.previewUrl || r.kind !== 'song') {
        bad += 1;
        totalSkippedBad += 1;
        continue;
      }

      // Trim to fit our VARCHAR(100) columns. iTunes occasionally
      // returns very long titles (extended remix names, etc.).
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
        // Don't blow up the whole run on one bad row.
        console.log('\n    failed on "' + title + '" — ' + err.message);
      }
    }

    console.log(inserted + ' new, ' + dup + ' duplicate, ' + bad + ' skipped');

    // Small pause between API calls so we never look like an attacker.
    await sleep(400);
  }

  // Final totals so the demo has one clean line to point at.
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
