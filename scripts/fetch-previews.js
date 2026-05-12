// scripts/fetch-previews.js — backfill iTunes preview URLs for songs missing one.
// Run with: npm run fetch-previews

const db = require('../database');

function sleep(ms) {
  return new Promise(function (resolve) { setTimeout(resolve, ms); });
}

function buildSearchUrl(title, artist) {
  const term = encodeURIComponent(title + ' ' + artist);
  return 'https://itunes.apple.com/search?term=' + term + '&entity=song&limit=1';
}

async function fetchPreviewUrl(title, artist) {
  const url = buildSearchUrl(title, artist);
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error('iTunes returned HTTP ' + response.status);
  }
  const json = await response.json();

  if (!json.results || json.results.length === 0) return null;
  return json.results[0].previewUrl || null;
}

// Idempotent: only touches rows where preview_url IS NULL.
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

    // Be polite to the free API.
    await sleep(250);
  }

  return { ok: okCount, missing: missingCount, errored: errorCount, total: rows.length };
}

module.exports = { fetchMissingPreviews };

// CLI entry point.
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
      // Close the pool or Node won't exit.
      return db.pool.end();
    })
    .catch(function (err) {
      console.error('fetch-previews failed:', err);
      process.exit(1);
    });
}
