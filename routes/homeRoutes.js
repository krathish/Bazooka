// routes/homeRoutes.js
// The router for the public-facing home page.
// One route only: GET / -> render the leaderboard + nickname form.
//
// We use express.Router() (not the app directly) so this file is a
// self-contained module that bazooka.js mounts at the path of its choice.
// That's the same pattern the professor used in routes/index.js.

const express = require('express');
const router = express.Router();
const gameModel = require('../models/gameModel');

// GET /
// Show the leaderboard (top 10 games) and the "Start Game" form.
router.get('/', async function (req, res, next) {
  try {
    // Pull the leaderboard from the games table (sorted by final_score DESC).
    // 10 is a Miller's-Law-friendly chunk size — long enough to feel like a
    // ranking, short enough to scan in a glance.
    const topScores = await gameModel.getTopGames(10);

    // Render Views/home.handlebars and inject `topScores` so the template
    // can {{#each topScores}} over it. Express.handlebars will wrap the
    // result in Views/layouts/main.handlebars automatically.
    res.render('home', { topScores });
  } catch (err) {
    // Hand the error to the global error handler in bazooka.js, which will
    // serve a friendly 500 page instead of crashing the whole server.
    next(err);
  }
});

module.exports = router;
