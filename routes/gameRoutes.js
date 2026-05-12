// routes/gameRoutes.js — the five routes that drive a single playthrough.
// Gameplay state lives in `req.session.game`; the DB is only touched in /finish.

const express = require('express');
const router = express.Router();

const config = require('../config');
const db = require('../database');
const songModel = require('../models/songModel');
const gameModel = require('../models/gameModel');
const guessModel = require('../models/guessModel');

// Forgiving comparison: case-insensitive, punctuation-stripped, whitespace-collapsed.
function normalize(str) {
  if (typeof str !== 'string') return '';
  return str
    .toLowerCase()
    .replace(/[^\w\s]|_/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}


router.post('/start', async function (req, res, next) {
  try {
    let nickname = (req.body.nickname || '').trim();
    if (nickname.length === 0) nickname = 'Anonymous';
    if (nickname.length > 30) nickname = nickname.slice(0, 30);

    const songQueue = await songModel.getRandomSongIds(config.game.roundsPerGame);

    if (songQueue.length === 0) {
      return res.status(503).send(
        'No playable songs yet — the iTunes preview backfill has not finished. ' +
        'Please wait a minute and try again, or check /healthz.'
      );
    }

    req.session.game = {
      nickname: nickname,
      songQueue: songQueue,
      currentRound: 0,
      totalScore: 0,
      roundStartTime: null,
      guesses: [],
      savedToDb: false,
      gameId: null
    };

    res.redirect('/game/play');
  } catch (err) {
    next(err);
  }
});


router.get('/play', async function (req, res, next) {
  try {
    const game = req.session.game;
    if (!game) return res.redirect('/');
    if (game.currentRound >= config.game.roundsPerGame) {
      return res.redirect('/game/finish');
    }

    const songId = game.songQueue[game.currentRound];
    const song = await songModel.getSongWithArtist(songId);
    if (!song) {
      throw new Error('Song missing for round ' + game.currentRound + ' (id ' + songId + ')');
    }

    // Server-side timestamp; never trust the client clock for scoring.
    game.roundStartTime = Date.now();

    res.render('play', {
      nickname: game.nickname,
      roundNumber: game.currentRound + 1,
      totalRounds: config.game.roundsPerGame,
      progressPct: Math.round(game.currentRound / config.game.roundsPerGame * 100),
      totalScore: game.totalScore,
      // SECURITY: do NOT pass song.title — it would leak into View Source.
      previewUrl: song.preview_url,
      roundSeconds: config.game.roundSeconds
    });
  } catch (err) {
    next(err);
  }
});


router.post('/guess', async function (req, res, next) {
  try {
    const game = req.session.game;
    if (!game) return res.redirect('/');
    if (game.currentRound >= config.game.roundsPerGame) {
      return res.redirect('/game/finish');
    }

    const songId = game.songQueue[game.currentRound];
    const song = await songModel.getSongWithArtist(songId);

    // Cap elapsed at the round limit so a delayed POST can't drive points negative.
    const rawElapsedMs = Date.now() - (game.roundStartTime || Date.now());
    const elapsedSec = Math.min(
      config.game.roundSeconds,
      Math.max(0, Math.round(rawElapsedMs / 1000))
    );

    const wasCorrect = normalize(req.body.guess) === normalize(song.title);

    // Linear decay from max points at t=0 to 0 at t=roundSeconds.
    let points = 0;
    if (wasCorrect) {
      const max = config.game.maxPointsPerRound;
      const seconds = config.game.roundSeconds;
      points = Math.max(0, Math.round(max - elapsedSec * max / seconds));
    }

    game.guesses.push({
      song_id: song.song_id,
      points_awarded: points,
      was_correct: wasCorrect,
      time_taken_seconds: elapsedSec
    });

    game.totalScore += points;
    game.currentRound += 1;

    res.redirect('/game/play');
  } catch (err) {
    next(err);
  }
});


// Persist the whole game in one transaction (game row + 10 guesses), or rollback.
router.get('/finish', async function (req, res, next) {
  const game = req.session.game;
  if (!game) return res.redirect('/');

  try {
    if (!game.savedToDb) {
      const client = await db.pool.connect();

      try {
        await client.query('BEGIN');

        const gameId = await gameModel.createGame(
          game.nickname,
          game.totalScore,
          client
        );

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

        game.gameId = gameId;
        game.savedToDb = true;
      } catch (txErr) {
        await client.query('ROLLBACK');
        throw txErr;
      } finally {
        // Always release, or the pool slowly leaks connections until it hangs.
        client.release();
      }
    }

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


// POST (not GET) so browsers won't pre-fetch a session wipe.
router.post('/restart', function (req, res, next) {
  req.session.destroy(function (err) {
    if (err) return next(err);
    res.redirect('/');
  });
});


module.exports = router;
