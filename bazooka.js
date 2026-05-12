// bazooka.js
// The application entry point. `npm run dev` runs this file with nodemon.
//
// What this file is responsible for:
//   1. Configuring express-handlebars (view engine + helpers)
//   2. Wiring up middleware (body-parser, cookie-parser, express-session)
//   3. Mounting the routers (homeRoutes at /, gameRoutes at /game)
//   4. Friendly 404 + 500 fallbacks
//   5. Starting the HTTP listener


// ---------- framework imports ----------
const express = require('express');
const expressHandlebars = require('express-handlebars');
const bodyParser = require('body-parser');
const cookieParser = require('cookie-parser');
const expressSession = require('express-session');


// ---------- application imports ----------
const config = require('./config');
const { migrate } = require('./scripts/migrate');
const homeRoutes = require('./routes/homeRoutes');
const gameRoutes = require('./routes/gameRoutes');


// ---------- handlebars setup ----------
// Three small template helpers — kept here so bazooka.js is the one place
// that "knows" about the view engine.
const handlebars = expressHandlebars.create({
  helpers: {

    // {{eq a b}} — strict-loose equality for use inside templates,
    // e.g. {{#if (eq round.was_correct true)}}.
    eq: function (a, b) { return a == b; },

    // {{inc 0}} -> 1. Used to turn 0-based @index into 1-based "Round 1".
    inc: function (n) { return Number(n) + 1; },

    // {{formatDate ts}} — small UX touch on the leaderboard.
    // Returns "just now", "Xm ago", "today", "yesterday", or "Mon DD".
    formatDate: function (ts) {
      if (!ts) return '';
      const then = new Date(ts);
      const now = new Date();
      const diffMs = now - then;
      const diffMin = Math.round(diffMs / 60000);
      if (diffMin < 1) return 'just now';
      if (diffMin < 60) return diffMin + 'm ago';

      const diffHr = Math.round(diffMin / 60);
      const sameDay =
        then.getFullYear() === now.getFullYear() &&
        then.getMonth() === now.getMonth() &&
        then.getDate() === now.getDate();
      if (sameDay) return diffHr + 'h ago';

      // Was it yesterday?
      const yest = new Date(now);
      yest.setDate(now.getDate() - 1);
      if (
        then.getFullYear() === yest.getFullYear() &&
        then.getMonth() === yest.getMonth() &&
        then.getDate() === yest.getDate()
      ) return 'yesterday';

      // Older — "Mon DD".
      const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
      return months[then.getMonth()] + ' ' + then.getDate();
    }

  }
});


// ---------- app setup ----------
const app = express();

// Tell Express how to render .handlebars files.
app.engine('handlebars', handlebars.engine);
app.set('view engine', 'handlebars');
// IMPORTANT: capital V in 'Views' to match the actual folder name on disk.
// macOS is case-insensitive, Linux is NOT — so this saves us a deploy bug.
app.set('views', './Views');


// ---------- middleware ----------
// body-parser turns "name=Krathish&nickname=k" form bodies into req.body.{name,nickname}.
// extended:true uses the `qs` library so nested objects (e.g. user[name]=...)
// also parse correctly — a safe default even though we don't rely on it yet.
app.use(bodyParser.urlencoded({ extended: true }));

// cookie-parser is required by express-session for signed cookies.
app.use(cookieParser(config.sessionSecret));

// express-session: server-side session storage (the in-memory default for dev).
// resave:false and saveUninitialized:false keep us from spamming the store
// with empty sessions for every visitor.
app.use(expressSession({
  secret: config.sessionSecret,
  resave: false,
  saveUninitialized: false,
  cookie: {
    httpOnly: true,                  // JS in the page can't read the cookie
    sameSite: 'lax',                 // sane default vs CSRF for our forms
    maxAge: 30 * 60 * 1000           // 30 minutes — plenty for a 10-round game
  }
}));


// ---------- routes ----------
// Mount the routers. Each one's internal paths (e.g. router.get('/'))
// are prefixed by what we mount it under.
app.use('/', homeRoutes);            // GET  /
app.use('/game', gameRoutes);        // POST /game/start, GET /game/play, ...


// ---------- 404 fallback ----------
// Reached when nothing above matched the URL.
app.use(function (req, res) {
  res.status(404).send('404 — that page is not in our setlist.');
});


// ---------- 500 error handler ----------
// Reached when any router calls next(err). The four-arg signature is what
// tells Express this is the error handler, not a regular middleware.
app.use(function (err, req, res, next) {
  console.error(err.stack || err.message);
  res.status(500).send('500 — something hit a wrong note. Check the server logs.');
});


// ---------- start the server ----------
// In production we run the idempotent migration first so a fresh Render
// deploy bootstraps its empty Postgres before accepting traffic. Locally
// we skip it — `psql -f instructions.sql` is the documented dev workflow.
async function start() {
  if (config.isProduction) {
    try {
      await migrate();
    } catch (err) {
      console.error('[startup] migration failed:', err.message);
      process.exit(1);
    }
  }

  app.listen(config.port, function () {
    console.log(
      'Bazooka started on port ' + config.port + '\n' +
      'press Ctrl-C to terminate.'
    );
  });
}

start();
