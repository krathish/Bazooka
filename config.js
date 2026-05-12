// config.js — env-driven config with dev fallbacks.

module.exports = {

  port: process.env.PORT || 3000,

  // Dev fallback so local runs Just Work; prod must inject SESSION_SECRET.
  sessionSecret: process.env.SESSION_SECRET || 'bazooka-dev-secret-change-me',

  postgres: {
    // Dev fallback assumes a local Postgres on the default port.
    connectionString:
      process.env.DATABASE_URL ||
      'postgres://postgres:postgres@localhost:5432/bazooka'
  },

  isProduction: process.env.NODE_ENV === 'production',

  game: {
    roundsPerGame: 10,
    roundSeconds: 30,
    maxPointsPerRound: 100
  }

};
