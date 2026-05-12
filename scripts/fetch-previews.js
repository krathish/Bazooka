// scripts/fetch-previews.js
// One-time data ingestion: walks every song in the DB that doesn't yet
// have a preview_url, asks Apple's iTunes Search API for a 30-second
// preview link, and UPDATEs the row.
//
// Run with:   npm run fetch-previews
//
// Why this lives in /scripts and not in a route:
//   The app should never depend on a live API call during gameplay.
//   We do this once, the result is cached in the DB, and from then on
//   the play page reads `preview_url` straight from Postgres.
//
// iTunes Search is free, no API key, no auth, very generous rate limits.
// Docs: https://developer.apple.com/library/archive/documentation/AudioVideo/Conceptual/iTuneSearchAPI/

const db = require('../database');

// One-second pause helper. We use it between iTunes calls so we never
// hammer Apple's servers (and so they never temporarily throttle us).
function sleep(ms) {
  return new Promise(function (resolve) { setTimeout(resolve, ms); });
}

// Build the iTunes search URL. encodeURIComponent escapes spaces, &, etc.
// `entity=song&limit=1` says "only return the top matching SONG result".
function buildSearchUrl(title, artist) {
  const term = encodeURIComponent(title + ' ' + artist);
  return 'https://itunes.apple.com/search?term=' + term + '&entity=song&limit=1';
}

async function fetchPreviewUrl(title, artist) {
  const url = buildSearchUrl(title, artist);
  // Node 18+ has fetch built in, no extra dependency needed.
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error('iTunes returned HTTP ' + response.status);
  }
  const json = await response.json();

  // The shape we care about:
  //   { resultCount: 1, results: [ { previewUrl: "https://...", ... } ] }
  // resultCount can be 0 if the song wasn't matched (rare for mainstream pop).
  if (!json.results || json.results.length === 0) return null;
  return json.results[0].previewUrl || null;
}

// Core routine — exported so the migration step (which runs at app boot
// on Render) can also call it. Returns a small {ok, missing, errored}
// summary so callers can log/decide based on the outcome.
async function fetchMissingPreviews(opts) {
  const log = (opts && opts.log) || function () {};

  const { rows } = await db.query(
    'SELECT s.song_id, s.title, a.name AS artist FROM songs s JOIN artists a ON a.artist_id = s.artist_id WHERE s.preview_url IS NULL ORDER BY s.song_id'
  );

  if (rows.length === 0) {
    return { ok: 0, missing: 0, errored: 0, total: 0 };
  }

  log('Fetching iTunes previews for ' + rows.length + ' song(s)...');

  let okCount = 0;
  let missingCount = 0;
  let errorCount = 0;

  for (const row of rows) {
    try {
      const previewUrl = await fetchPreviewUrl(row.title, row.artist);

      if (previewUrl) {
        await db.query(
          'UPDATE songs SET preview_url = $1 WHERE song_id = $2',
          [previewUrl, row.song_id]
        );
        log('  [ok]      ' + row.title + ' — ' + row.artist);
        okCount += 1;
      } else {
        log('  [missing] ' + row.title + ' — ' + row.artist + '  (no iTunes match)');
        missingCount += 1;
      }
    } catch (err) {
      log('  [error]   ' + row.title + ' — ' + row.artist + '  ' + err.message);
      errorCount += 1;
    }

    // Be polite to Apple's free API.
    await sleep(250);
  }

  return { ok: okCount, missing: missingCount, errored: errorCount, total: rows.length };
}

module.exports = { fetchMissingPreviews };

// CLI entry point: `npm run fetch-previews`.
if (require.main === module) {
  fetchMissingPreviews({ log: console.log })
    .then(function (summary) {
      if (summary.total === 0) {
        console.log('All songs already have preview URLs. Nothing to do.');
      } else {
        console.log(
          '\nDone. ' + summary.ok + ' ok, ' +
          summary.missing + ' missing, ' +
          summary.errored + ' errored.'
        );
      }
      // Important: close the pool or the script hangs forever (Node won't exit
      // while there are open DB connections sitting in the pool).
      return db.pool.end();
    })
    .catch(function (err) {
      console.error('fetch-previews failed:', err);
      process.exit(1);
    });
}
