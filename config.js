// config.js
// One single place for every "magic number" or credential the app needs.
// If we ever want to change the port, the database password, or how many
// rounds a game has, we change it here and nowhere else.
//
// We export ONE object so other files can do `const config = require('./config')`
// and then read `config.port`, `config.game.roundSeconds`, etc.

module.exports = {

  // The TCP port the Express server listens on.
  // 3000 is the classic Node default; pick anything free if you have a clash.
  port: 3000,

  // Secret used by cookie-parser + express-session to sign the session cookie.
  // In a real app this would come from an environment variable, but for a class
  // project a hard-coded string is fine. Change it before deploying anywhere real.
  sessionSecret: 'bazooka-dev-secret-change-me',

  // Postgres connection settings. We use the libpq "connection string" format
  // because it's a single line you can also paste straight into psql.
  // Format: postgres://USER:PASSWORD@HOST:PORT/DATABASE
  // Adjust the username/password to whatever your local Postgres is set to.
  postgres: {
    connectionString: 'postgres://postgres:postgres@localhost:5432/bazooka'
  },

  // Game-design settings, grouped together so the gameplay logic is tunable
  // from one spot. The route handler imports these instead of hard-coding 10/30/100.
  game: {
    roundsPerGame: 10,        // how many lyric prompts in a single playthrough
    roundSeconds: 30,         // countdown timer per round (max time before 0 pts)
    maxPointsPerRound: 100    // points if the player guesses instantly (t=0)
  }

};
