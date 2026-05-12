// config.js
// One single place for every "magic number" or credential the app needs.
// If we ever want to change the port, the database password, or how many
// rounds a game has, we change it here and nowhere else.
//
// In production (Render, Heroku, etc.) the host platform sets PORT,
// DATABASE_URL, and SESSION_SECRET as environment variables. Locally we
// fall back to sensible dev defaults so `npm run dev` still Just Works.

module.exports = {

  // The TCP port the Express server listens on.
  // Render (and most PaaS hosts) inject PORT — we MUST honor it.
  port: process.env.PORT || 3000,

  // Secret used by cookie-parser + express-session to sign the session cookie.
  // In production this comes from the SESSION_SECRET env var (Render auto-
  // generates one via render.yaml). The dev fallback keeps local runs working.
  sessionSecret: process.env.SESSION_SECRET || 'bazooka-dev-secret-change-me',

  // Postgres connection settings. We use the libpq "connection string" format
  // because it's a single line you can also paste straight into psql.
  // Format: postgres://USER:PASSWORD@HOST:PORT/DATABASE
  // On Render the managed Postgres add-on injects DATABASE_URL automatically.
  postgres: {
    connectionString:
      process.env.DATABASE_URL ||
      'postgres://postgres:postgres@localhost:5432/bazooka'
  },

  // True when we're running on a hosted platform (Render sets NODE_ENV=production).
  // Used by database.js to decide whether to enable SSL.
  isProduction: process.env.NODE_ENV === 'production',

  // Game-design settings, grouped together so the gameplay logic is tunable
  // from one spot. The route handler imports these instead of hard-coding 10/30/100.
  game: {
    roundsPerGame: 10,        // how many lyric prompts in a single playthrough
    roundSeconds: 30,         // countdown timer per round (max time before 0 pts)
    maxPointsPerRound: 100    // points if the player guesses instantly (t=0)
  }

};
