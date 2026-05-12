// routes/gameRoutes.js
// The five routes that drive a single playthrough:
//   POST /game/start    -> set up a fresh session, redirect to /game/play
//   GET  /game/play     -> render the current round (lyric + timer)
//   POST /game/guess    -> score the guess, advance the round
//   GET  /game/finish   -> save the game + 10 guesses in a transaction, render review
//   POST /game/restart  -> wipe the session, back to home
//
// All gameplay state lives in `req.session.game` while the game is running.
// We only touch the DB at the very end (inside one transaction) so a player
// who closes the tab mid-game leaves no junk rows behind.

const express = require('express');
const router = express.Router();

const config = require('../config');
const db = require('../database');
const songModel = require('../models/songModel');
const gameModel = require('../models/gameModel');
const guessModel = require('../models/guessModel');


// ---------- helper: normalize() ----------
// Compares a player's guess to a song title in a forgiving way.
// Steps, in order:
//   1. toLowerCase() — "Bad Guy" matches "bad guy"
//   2. .replace(/[^\w\s]|_/g, '') — strip punctuation: "Drivers License" matches "driver's license"
//   3. .replace(/\s+/g, ' ').trim() — collapse runs of whitespace and trim ends
// Done both sides of the comparison so `normalize(guess) === normalize(title)`.
function normalize(str) {
  if (typeof str !== 'string') return '';
  return str
    .toLowerCase()
    .replace(/[^\w\s]|_/g, '')   // \w is letters+digits+underscore, \s is whitespace
    .replace(/\s+/g, ' ')         // collapse double spaces from punctuation removal
    .trim();
}


// ---------- POST /game/start ----------
// Initialize a fresh game in the session. NO database write yet — the
// games + guesses rows are only created after round 10 in /game/finish.
router.post('/start', async function (req, res, next) {
  try {
    // Trim and cap the nickname; fall back to 'Anonymous' if blank.
    // VARCHAR(30) in the DB means anything longer would error, so we slice
    // it ourselves rather than let Postgres scream.
    let nickname = (req.body.nickname || '').trim();
    if (nickname.length === 0) nickname = 'Anonymous';
    if (nickname.length > 30) nickname = nickname.slice(0, 30);

    // Pick 10 random songs to play this round. The order is shuffled by
    // Postgres (ORDER BY RANDOM()) so every game feels different.
    const songQueue = await songModel.getRandomSongIds(config.game.roundsPerGame);

    // Build the session object. From here on, the play/guess/finish handlers
    // read and mutate this same object across requests.
    req.session.game = {
      nickname: nickname,
      songQueue: songQueue,
      currentRound: 0,           // 0-indexed; goes 0..9
      totalScore: 0,
      roundStartTime: null,      // set when /game/play renders
      guesses: [],               // collected here, written to DB at the end
      savedToDb: false,          // flips true after the transaction commits
      gameId: null               // populated by createGame() in /finish
    };

    res.redirect('/game/play');
  } catch (err) {
    next(err);
  }
});


// ---------- GET /game/play ----------
// Render the current round (lyric hint + input + timer).
// Two guards at the top:
//   1. No active game in the session  -> kick back to /
//   2. Already past round 10          -> jump to /game/finish
router.get('/play', async function (req, res, next) {
  try {
    const game = req.session.game;
    if (!game) return res.redirect('/');
    if (game.currentRound >= config.game.roundsPerGame) {
      return res.redirect('/game/finish');
    }

    // Look up THIS round's song (with the artist via JOIN).
    const songId = game.songQueue[game.currentRound];
    const song = await songModel.getSongWithArtist(songId);
    if (!song) {
      // Should never happen, but if a song was deleted between /start and
      // /play we'd land here. Fail loudly rather than silently skip.
      throw new Error('Song missing for round ' + game.currentRound + ' (id ' + songId + ')');
    }

    // Stamp the round-start time on the SERVER side. This is what /guess
    // will subtract from to compute elapsed seconds — never trust the
    // client's clock for scoring.
    game.roundStartTime = Date.now();

    res.render('play', {
      nickname: game.nickname,
      roundNumber: game.currentRound + 1,                // 1..10 for display
      totalRounds: config.game.roundsPerGame,
      progressPct: Math.round(game.currentRound / config.game.roundsPerGame * 100),
      totalScore: game.totalScore,
      previewUrl: song.preview_url,                      // 30-second iTunes audio
      roundSeconds: config.game.roundSeconds
      // IMPORTANT: do NOT send the song title to the template.
      // It would end up in the rendered HTML and the player could just
      // View Source. The title is only ever known on the server.
      //
      // preview_url is from Apple's CDN and looks like a hashed URL
      // (e.g. .../mzaf_NUMBERS.plus.aac.p.m4a) — it doesn't leak the
      // song title, so it's safe to expose in the page source.
    });
  } catch (err) {
    next(err);
  }
});


// ---------- POST /game/guess ----------
// Score the player's guess against the current song's title and advance
// the round. Still no DB write — we collect the round result in
// `game.guesses[]` and write everything in /finish.
router.post('/guess', async function (req, res, next) {
  try {
    const game = req.session.game;
    if (!game) return res.redirect('/');
    if (game.currentRound >= config.game.roundsPerGame) {
      return res.redirect('/game/finish');
    }

    const songId = game.songQueue[game.currentRound];
    const song = await songModel.getSongWithArtist(songId);

    // How long did the player take? Cap at the round limit so a delayed POST
    // (browser stall, network hiccup) cannot drive points negative.
    const rawElapsedMs = Date.now() - (game.roundStartTime || Date.now());
    const elapsedSec = Math.min(
      config.game.roundSeconds,
      Math.max(0, Math.round(rawElapsedMs / 1000))
    );

    // Forgiving comparison via normalize() — see the helper at the top.
    const wasCorrect = normalize(req.body.guess) === normalize(song.title);

    // Linear decay from 100 at t=0 to 0 at t=30. Wrong answers get 0 points
    // regardless of how fast they were typed.
    let points = 0;
    if (wasCorrect) {
      const max = config.game.maxPointsPerRound;
      const seconds = config.game.roundSeconds;
      points = Math.max(0, Math.round(max - elapsedSec * max / seconds));
    }

    // Remember this round's outcome so /finish can bulk-insert all 10.
    game.guesses.push({
      song_id: song.song_id,
      points_awarded: points,
      was_correct: wasCorrect,
      time_taken_seconds: elapsedSec
    });

    game.totalScore += points;
    game.currentRound += 1;

    // Loop back. If we just finished round 10, the /play handler's guard
    // will kick the user over to /finish on the next request.
    res.redirect('/game/play');
  } catch (err) {
    next(err);
  }
});


// ---------- GET /game/finish ----------
// Persist the whole game in ONE transaction:
//   BEGIN
//     INSERT INTO games (...) RETURNING game_id
//     INSERT INTO guesses (...)  x10  (all using the new game_id)
//   COMMIT
// If any single insert fails, ROLLBACK undoes the partial save so the
// leaderboard never shows a half-game with the wrong number of rounds.
router.get('/finish', async function (req, res, next) {
  const game = req.session.game;
  if (!game) return res.redirect('/');

  try {
    // Only persist on the FIRST visit. If the player refreshes the finish
    // page we don't want to insert a duplicate game + 10 more guesses.
    if (!game.savedToDb) {
      // Grab a dedicated client from the pool. A transaction has to live on
      // ONE client — you can't BEGIN on one and COMMIT on another.
      const client = await db.pool.connect();

      try {
        await client.query('BEGIN');

        // Insert the parent row first so we get its game_id back.
        const gameId = await gameModel.createGame(
          game.nickname,
          game.totalScore,
          client                 // pass the transaction client through
        );

        // Now insert all 10 guesses, each linked to that game_id via FK.
        for (const g of game.guesses) {
          await guessModel.addGuess(
            gameId,
            g.song_id,
            g.points_awarded,
            g.was_correct,
            g.time_taken_seconds,
            client
          );
        }

        await client.query('COMMIT');

        // Stamp the session so a refresh skips this whole block.
        game.gameId = gameId;
        game.savedToDb = true;
      } catch (txErr) {
        // Any failure inside the transaction -> roll the whole thing back.
        // Better to lose the game record than to leave a partial mess.
        await client.query('ROLLBACK');
        throw txErr;
      } finally {
        // ALWAYS release the client back to the pool, success or failure.
        // Without this, the pool slowly leaks connections until it's empty
        // and the whole app hangs.
        client.release();
      }
    }

    // Read the rounds back out via the 3-table JOIN so the template gets
    // the song title + artist name without us having to ship them in the
    // session. Bonus: this proves the data actually landed in the DB.
    const rounds = await guessModel.getGuessesByGameId(game.gameId);

    res.render('finish', {
      nickname: game.nickname,
      totalScore: game.totalScore,
      totalRounds: config.game.roundsPerGame,
      maxScore: config.game.roundsPerGame * config.game.maxPointsPerRound,
      rounds: rounds
    });
  } catch (err) {
    next(err);
  }
});


// ---------- POST /game/restart ----------
// Throw away the session entirely and send the player home.
// We use POST (not GET) because this MUTATES state — and browsers won't
// pre-fetch a POST, which avoids accidental wipes.
router.post('/restart', function (req, res, next) {
  req.session.destroy(function (err) {
    if (err) return next(err);
    res.redirect('/');
  });
});


module.exports = router;
