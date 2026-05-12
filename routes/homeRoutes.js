// routes/homeRoutes.js — public home page + healthcheck.

const express = require('express');
const router = express.Router();
const db = require('../database');
const gameModel = require('../models/gameModel');

// Render's healthCheckPath; also handy for "are previews populated yet?".
router.get('/healthz', async function (req, res) {
  try {
    const r = await db.query(
      'SELECT COUNT(*)::int AS songs, COUNT(preview_url)::int AS playable FROM songs'
    );
    res.json({
      ok: true,
      songs: r.rows[0].songs,
      playable: r.rows[0].playable,
      ready: r.rows[0].playable > 0
    });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

router.get('/', async function (req, res, next) {
  try {
    const topScores = await gameModel.getTopGames(10);
    res.render('home', { topScores });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
