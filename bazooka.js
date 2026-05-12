// bazooka.js — application entry point.

const express = require('express');
const expressHandlebars = require('express-handlebars');
const bodyParser = require('body-parser');
const cookieParser = require('cookie-parser');
const expressSession = require('express-session');

const config = require('./config');
const { migrate } = require('./scripts/migrate');
const homeRoutes = require('./routes/homeRoutes');
const gameRoutes = require('./routes/gameRoutes');

const handlebars = expressHandlebars.create({
  helpers: {
    eq: function (a, b) { return a == b; },
    inc: function (n) { return Number(n) + 1; },
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

      const yest = new Date(now);
      yest.setDate(now.getDate() - 1);
      if (
        then.getFullYear() === yest.getFullYear() &&
        then.getMonth() === yest.getMonth() &&
        then.getDate() === yest.getDate()
      ) return 'yesterday';

      const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
      return months[then.getMonth()] + ' ' + then.getDate();
    }
  }
});

const app = express();

app.engine('handlebars', handlebars.engine);
app.set('view engine', 'handlebars');
// Capital V matters on Linux (case-sensitive FS).
app.set('views', './Views');

app.use(bodyParser.urlencoded({ extended: true }));
app.use(cookieParser(config.sessionSecret));
app.use(expressSession({
  secret: config.sessionSecret,
  resave: false,
  saveUninitialized: false,
  cookie: {
    httpOnly: true,
    sameSite: 'lax',
    maxAge: 30 * 60 * 1000
  }
}));

app.use('/', homeRoutes);
app.use('/game', gameRoutes);

app.use(function (req, res) {
  res.status(404).send('404 — that page is not in our setlist.');
});

app.use(function (err, req, res, next) {
  console.error(err.stack || err.message);
  res.status(500).send('500 — something hit a wrong note. Check the server logs.');
});

// In production, run the idempotent migration before accepting traffic.
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
