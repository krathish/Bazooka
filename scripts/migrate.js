// scripts/migrate.js
// Idempotent database setup for production deploys (e.g. Render).
//
// instructions.sql is great for local psql use, but it relies on two things
// we can't do over a normal pg connection:
//   1. `DROP DATABASE` / `CREATE DATABASE` — managed Postgres gives you ONE
//      pre-provisioned database; you can't drop it from inside a connection.
//   2. `\c bazooka` — that's a psql meta-command, not SQL. The pg driver
//      will throw a syntax error.
//
// So this file does the equivalent work, but safely:
//   - CREATE TABLE IF NOT EXISTS for the four tables
//   - Seeds artists with ON CONFLICT (name) DO NOTHING
//   - Seeds songs by reading the same lyric_hint data, with
//     ON CONFLICT (artist_id, title) DO NOTHING
//
// Re-running this script is a no-op once the data is in place. It runs
// automatically at app startup (see bazooka.js) so a fresh Render deploy
// is fully self-bootstrapping.

const db = require('../database');
const { fetchMissingPreviews } = require('./fetch-previews');

const ARTISTS = [
  'Adele', 'Bruno Mars', 'Doja Cat', 'Dua Lipa', 'Ed Sheeran', 'Eminem',
  'Glass Animals', 'Harry Styles', 'Justin Bieber', 'Kid LAROI', 'Lil Nas X',
  'Miley Cyrus', 'Olivia Rodrigo', 'Sabrina Carpenter', 'Taylor Swift',
  'The Weeknd', 'Billie Eilish'
];

// Same 30 lyric prompts from instructions.sql — kept here so the migration
// is self-contained and doesn't have to parse the .sql file at runtime.
const SONGS = [
  ['The Weeknd',        'Blinding Lights',     'I have been tryna call, I have been on my own for long enough'],
  ['The Weeknd',        'Save Your Tears',     'I saw you dancing in a crowded room'],
  ['Ed Sheeran',        'Shape of You',        'The club is not the best place to find a lover, so the bar is where I go'],
  ['Ed Sheeran',        'Bad Habits',          'Every time you come around, you know I cannot say no'],
  ['Billie Eilish',     'Bad Guy',             'White shirt now red, my bloody nose'],
  ['Bruno Mars',        'Uptown Funk',         'This hit, that ice cold, Michelle Pfeiffer, that white gold'],
  ['Adele',             'Rolling in the Deep', 'There is a fire starting in my heart'],
  ['Adele',             'Someone Like You',    'I heard that you are settled down, that you found a girl and you are married now'],
  ['Adele',             'Hello',               'It is me, I was wondering if after all these years you would like to meet'],
  ['Taylor Swift',      'Shake It Off',        'The players gonna play, play, play, play, play'],
  ['Taylor Swift',      'Bad Blood',           'Now we got problems and I do not think we can solve them'],
  ['Taylor Swift',      'Anti-Hero',           'It is me, hi, I am the problem, it is me'],
  ['Taylor Swift',      'Cruel Summer',        'Devils roll the dice, angels roll their eyes'],
  ['Justin Bieber',     'Sorry',               'You gotta go and get angry at all of my honesty'],
  ['Justin Bieber',     'Peaches',             'I got my peaches out in Georgia'],
  ['Lil Nas X',         'Old Town Road',       'I am gonna take my horse to the old town road, I am gonna ride till I cant no more'],
  ['Lil Nas X',         'Montero',             'Call me by your name, tell me you love me in private'],
  ['Lil Nas X',         'Industry Baby',       'I told you long ago on the road, I got what they waiting for'],
  ['Dua Lipa',          'Levitating',          'If you wanna run away with me, I know a galaxy and I can take you for a ride'],
  ['Harry Styles',      'Watermelon Sugar',    'Tastes like strawberries on a summer evening'],
  ['Harry Styles',      'As It Was',           'Holdin me back, gravity is holdin me back'],
  ['Kid LAROI',         'Stay',                'I do the same thing I told you that I never would'],
  ['Olivia Rodrigo',    'drivers license',     'I got my license last week, just like we always talked about'],
  ['Olivia Rodrigo',    'Good 4 U',            'Well, good for you, I guess you moved on really easily'],
  ['Olivia Rodrigo',    'Vampire',             'Hate to give the satisfaction askin how you are doin now'],
  ['Miley Cyrus',       'Flowers',             'I can buy myself flowers, write my name in the sand'],
  ['Glass Animals',     'Heat Waves',          'Sometimes all I think about is you, late nights in the middle of June'],
  ['Sabrina Carpenter', 'Espresso',            'Now he is thinkin bout me every night, oh, is it that sweet'],
  ['Doja Cat',          'Paint The Town Red',  'Yeah, bitch, I said what I said, I would rather be famous instead'],
  ['Eminem',            'Houdini',             'Guess who is back, back again, Shady is back']
];

async function ensureSchema() {
  await db.query(`
    CREATE TABLE IF NOT EXISTS artists (
      artist_id SERIAL PRIMARY KEY,
      name      VARCHAR(100) NOT NULL UNIQUE
    );
  `);

  await db.query(`
    CREATE TABLE IF NOT EXISTS songs (
      song_id     SERIAL PRIMARY KEY,
      artist_id   INT NOT NULL REFERENCES artists(artist_id),
      title       VARCHAR(100) NOT NULL,
      lyric_hint  VARCHAR(255),
      preview_url VARCHAR(500),
      UNIQUE (artist_id, title)
    );
  `);

  await db.query(`
    CREATE TABLE IF NOT EXISTS games (
      game_id     SERIAL PRIMARY KEY,
      nickname    VARCHAR(30) NOT NULL,
      final_score INT NOT NULL,
      played_at   TIMESTAMP NOT NULL DEFAULT NOW()
    );
  `);

  await db.query(`
    CREATE TABLE IF NOT EXISTS guesses (
      guess_id           SERIAL PRIMARY KEY,
      game_id            INT NOT NULL REFERENCES games(game_id),
      song_id            INT NOT NULL REFERENCES songs(song_id),
      points_awarded     INT NOT NULL,
      was_correct        BOOLEAN NOT NULL,
      time_taken_seconds INT NOT NULL
    );
  `);
}

async function seedArtists() {
  for (const name of ARTISTS) {
    await db.query(
      'INSERT INTO artists (name) VALUES ($1) ON CONFLICT (name) DO NOTHING',
      [name]
    );
  }
}

async function seedSongs() {
  for (const [artist, title, lyric] of SONGS) {
    await db.query(
      `INSERT INTO songs (artist_id, title, lyric_hint)
         SELECT artist_id, $2, $3 FROM artists WHERE name = $1
       ON CONFLICT (artist_id, title) DO NOTHING`,
      [artist, title, lyric]
    );
  }
}

async function migrate() {
  await ensureSchema();
  await seedArtists();
  await seedSongs();

  // Lightweight summary so the deploy logs make sense at a glance.
  const a = await db.query('SELECT COUNT(*)::int AS c FROM artists');
  const s = await db.query('SELECT COUNT(*)::int AS c FROM songs');
  console.log(
    `[migrate] schema ready — ${a.rows[0].c} artists, ${s.rows[0].c} songs`
  );

  // Backfill iTunes preview URLs for any songs that are missing one.
  // /game/play filters WHERE preview_url IS NOT NULL — without this step
  // a fresh Render deploy has 30 songs but zero playable rounds, and
  // POST /game/start sends an empty queue into /play (the very 500 we
  // just hit in production: "Song missing for round 0 (id undefined)").
  //
  // The function is idempotent (only touches NULL rows), so on every boot
  // after the first one this is a single SELECT that returns zero rows.
  try {
    const summary = await fetchMissingPreviews({ log: function (m) { console.log('[migrate] ' + m); } });
    if (summary.total > 0) {
      console.log(
        '[migrate] previews — ' + summary.ok + ' ok, ' +
        summary.missing + ' missing, ' +
        summary.errored + ' errored'
      );
    }
  } catch (err) {
    // Don't kill the boot if iTunes is having a bad day — we'll try again
    // on the next deploy / restart. Existing rows with previews still play.
    console.error('[migrate] preview backfill failed (non-fatal):', err.message);
  }
}

module.exports = { migrate };

// Allow `node scripts/migrate.js` for manual one-off use as well.
if (require.main === module) {
  migrate()
    .then(function () { return db.pool.end(); })
    .catch(function (err) {
      console.error('[migrate] failed:', err);
      process.exit(1);
    });
}
