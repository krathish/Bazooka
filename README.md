# Bazooka

A simple web-based song-guessing game. Pratt INFO 638 class project.

You're shown a lyric. You type the song title. Faster guesses earn more points. Ten rounds, then your score lands on the leaderboard.

## Stack

- **Node.js + Express 5** — the web server
- **express-handlebars** — server-rendered HTML templates
- **PostgreSQL + pg** — the database, with raw SQL (no ORM)
- **express-session, cookie-parser, body-parser** — session + form handling
- **Bootstrap 5 (CDN)** — styling, no build step
- **nodemon** — auto-reload during development

That's it. No React, no Tailwind, no TypeScript, no bundler.

## Prerequisites

- **Node.js 18+** — check with `node -v`
- **PostgreSQL 14+** running locally — check with `psql --version`

## Setup

### 1. Install Node dependencies

```bash
npm install
```

### 2. Create the database and seed the songs

```bash
psql -U postgres -f instructions.sql
```

This drops any existing `bazooka` database, recreates it, builds the four tables (`artists`, `songs`, `games`, `guesses`), and inserts 17 artists + 30 songs.

If your local Postgres uses a different superuser, swap `-U postgres` for whatever's correct.

### 3. Cache the song audio previews

```bash
npm run fetch-previews
```

Each round plays a 30-second audio preview of the song. We get those previews from Apple's free [iTunes Search API](https://developer.apple.com/library/archive/documentation/AudioVideo/Conceptual/iTuneSearchAPI/) — no key, no auth, generous rate limits. The script walks every song in the DB that doesn't yet have a `preview_url` and fills it in.

Re-running the script is safe — it skips any song that already has a cached URL.

### 3a. Bulk-import hundreds more songs (recommended)

```bash
npm run discover-songs
```

Searches iTunes across eight broad genres (`pop`, `hip hop`, `rock`, `indie`, `dance`, `country`, `alternative`, `rnb`), pulling up to 200 songs per genre. New artists are upserted, new songs are inserted, and duplicates are silently skipped via `ON CONFLICT (artist_id, title) DO NOTHING`. After one run you should have roughly 700–1000 playable songs. Re-run any time to top up.

### 4. Point the app at your database

Open [`config.js`](./config.js) and update the connection string if your Postgres setup is non-standard:

```js
postgres: {
  connectionString: 'postgres://postgres:postgres@localhost:5432/bazooka'
}
```

Format: `postgres://USER:PASSWORD@HOST:PORT/DATABASE`.

### 5. Run the server

```bash
npm run dev
```

You should see:

```
Bazooka started on http://localhost:3000
press Ctrl-C to terminate.
```

Open <http://localhost:3000> in your browser.

For a non-watched run (closer to "production"):

```bash
npm start
```

## How the game works

1. **Home page** — see the top 10 leaderboard, type a nickname, click **Start Game**.
2. **Play (×10)** — a 30-second song preview plays, a 30-second timer counts down, you type the song title. Submitting (or running out of time) advances to the next round. Points: `100 - (seconds_taken × 100 / 30)`, rounded, with 0 for wrong answers.
3. **Finish** — a transaction inserts your `games` row + 10 `guesses` rows, then you see your final score and a per-round breakdown (with the song title and artist for each round). **Play Again** wipes the session and sends you home.

## File layout

```
Bazooka/
├── package.json              dependencies + start scripts
├── config.js                 port, session secret, DB connection, game tunables
├── instructions.sql          schema + seed data (run once with psql)
├── database.js               shared pg.Pool + query() helper
├── bazooka.js                app entry point — middleware, routers, listener
│
├── models/
│   ├── songModel.js          getRandomSongIds, getSongWithArtist (JOIN)
│   ├── gameModel.js          createGame (transactional), getTopGames
│   └── guessModel.js         addGuess (transactional), getGuessesByGameId (3-table JOIN)
│
├── routes/
│   ├── homeRoutes.js         GET /
│   └── gameRoutes.js         POST /game/start, GET /game/play, POST /game/guess,
│                             GET /game/finish, POST /game/restart
│
├── scripts/
│   ├── fetch-previews.js     one-off: cache iTunes preview URLs for the seeded 30 songs
│   └── discover-songs.js     bulk-import hundreds of songs across 8 iTunes genres
│
└── Views/
    ├── layouts/
    │   └── main.handlebars   page shell, Bootstrap CDN, all polish CSS
    ├── home.handlebars       leaderboard + nickname form
    ├── play.handlebars       round UI + audio preview + client-side countdown
    └── finish.handlebars     final score + per-round review table
```

## Database schema (4 tables)

```
artists (artist_id PK, name UNIQUE)
   |
   | 1..*
   v
songs   (song_id PK, artist_id FK, title, lyric_hint)
   |
   | 1..*
   v
guesses (guess_id PK, game_id FK, song_id FK,
         points_awarded, was_correct, time_taken_seconds)
   ^
   | *..1
   |
games   (game_id PK, nickname, final_score, played_at DEFAULT NOW())
```

Each completed game writes one `games` row and ten `guesses` rows in a single `BEGIN/COMMIT` transaction in `routes/gameRoutes.js → GET /game/finish`. If any of the eleven inserts fail, the whole batch rolls back so the leaderboard never shows a half-recorded game.

## Notes for the presentation

- **No ORM.** Every SQL statement is hand-written in a `models/*.js` file using parameterized queries (`$1`, `$2`, ...). The comments in each model file walk through SQL injection, JOINs, and `RETURNING`.
- **Server-authoritative timer.** The countdown in the browser is just visual feedback. The server records `roundStartTime` when the play page renders and recomputes elapsed seconds on submit.
- **Transaction.** `GET /game/finish` is the only place we touch the database during a playthrough. See the `BEGIN / COMMIT / ROLLBACK / client.release()` block in `routes/gameRoutes.js`.
- **Three Handlebars helpers** (`eq`, `inc`, `formatDate`) are defined in `bazooka.js` so the views stay readable.
- **Inline polish CSS.** The spec forbids a separate CSS file, so `Views/layouts/main.handlebars` carries one heavily-commented `<style>` block — focus rings, button feedback, screen entrance animations, score bump, timer urgency, `prefers-reduced-motion` kill switch, safe-area insets, tabular numerals.
