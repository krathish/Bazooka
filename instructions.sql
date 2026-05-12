-- instructions.sql — one-time DB setup. Run with: psql -U postgres -f instructions.sql

-- DROP first so re-running is idempotent.
DROP DATABASE IF EXISTS bazooka;
CREATE DATABASE bazooka;

-- psql meta-command (not SQL) to switch the connection to the new DB.
\c bazooka


-- artists: parent of songs.
CREATE TABLE artists (
  artist_id SERIAL PRIMARY KEY,
  name      VARCHAR(100) NOT NULL UNIQUE
);

-- songs: lyric prompts. UNIQUE (artist_id, title) backs the discover script's ON CONFLICT.
CREATE TABLE songs (
  song_id     SERIAL PRIMARY KEY,
  artist_id   INT NOT NULL REFERENCES artists(artist_id),
  title       VARCHAR(100) NOT NULL,
  lyric_hint  VARCHAR(255),
  preview_url VARCHAR(500),
  UNIQUE (artist_id, title)
);

-- games: one row per completed playthrough.
CREATE TABLE games (
  game_id     SERIAL PRIMARY KEY,
  nickname    VARCHAR(30) NOT NULL,
  final_score INT NOT NULL,
  played_at   TIMESTAMP NOT NULL DEFAULT NOW()
);

-- guesses: one row per round, ten rows per game.
CREATE TABLE guesses (
  guess_id           SERIAL PRIMARY KEY,
  game_id            INT NOT NULL REFERENCES games(game_id),
  song_id            INT NOT NULL REFERENCES songs(song_id),
  points_awarded     INT NOT NULL,
  was_correct        BOOLEAN NOT NULL,
  time_taken_seconds INT NOT NULL
);


INSERT INTO artists (name) VALUES ('Adele');
INSERT INTO artists (name) VALUES ('Bruno Mars');
INSERT INTO artists (name) VALUES ('Doja Cat');
INSERT INTO artists (name) VALUES ('Dua Lipa');
INSERT INTO artists (name) VALUES ('Ed Sheeran');
INSERT INTO artists (name) VALUES ('Eminem');
INSERT INTO artists (name) VALUES ('Glass Animals');
INSERT INTO artists (name) VALUES ('Harry Styles');
INSERT INTO artists (name) VALUES ('Justin Bieber');
INSERT INTO artists (name) VALUES ('Kid LAROI');
INSERT INTO artists (name) VALUES ('Lil Nas X');
INSERT INTO artists (name) VALUES ('Miley Cyrus');
INSERT INTO artists (name) VALUES ('Olivia Rodrigo');
INSERT INTO artists (name) VALUES ('Sabrina Carpenter');
INSERT INTO artists (name) VALUES ('Taylor Swift');
INSERT INTO artists (name) VALUES ('The Weeknd');
INSERT INTO artists (name) VALUES ('Billie Eilish');


-- INSERT ... SELECT looks up artist_id by name so re-ordering seeds doesn't break the FK.
INSERT INTO songs (artist_id, title, lyric_hint)
  SELECT artist_id, 'Blinding Lights', 'I have been tryna call, I have been on my own for long enough'
  FROM artists WHERE name = 'The Weeknd';
INSERT INTO songs (artist_id, title, lyric_hint)
  SELECT artist_id, 'Save Your Tears', 'I saw you dancing in a crowded room'
  FROM artists WHERE name = 'The Weeknd';

INSERT INTO songs (artist_id, title, lyric_hint)
  SELECT artist_id, 'Shape of You', 'The club is not the best place to find a lover, so the bar is where I go'
  FROM artists WHERE name = 'Ed Sheeran';
INSERT INTO songs (artist_id, title, lyric_hint)
  SELECT artist_id, 'Bad Habits', 'Every time you come around, you know I cannot say no'
  FROM artists WHERE name = 'Ed Sheeran';

INSERT INTO songs (artist_id, title, lyric_hint)
  SELECT artist_id, 'Bad Guy', 'White shirt now red, my bloody nose'
  FROM artists WHERE name = 'Billie Eilish';

INSERT INTO songs (artist_id, title, lyric_hint)
  SELECT artist_id, 'Uptown Funk', 'This hit, that ice cold, Michelle Pfeiffer, that white gold'
  FROM artists WHERE name = 'Bruno Mars';

INSERT INTO songs (artist_id, title, lyric_hint)
  SELECT artist_id, 'Rolling in the Deep', 'There is a fire starting in my heart'
  FROM artists WHERE name = 'Adele';
INSERT INTO songs (artist_id, title, lyric_hint)
  SELECT artist_id, 'Someone Like You', 'I heard that you are settled down, that you found a girl and you are married now'
  FROM artists WHERE name = 'Adele';
INSERT INTO songs (artist_id, title, lyric_hint)
  SELECT artist_id, 'Hello', 'It is me, I was wondering if after all these years you would like to meet'
  FROM artists WHERE name = 'Adele';

INSERT INTO songs (artist_id, title, lyric_hint)
  SELECT artist_id, 'Shake It Off', 'The players gonna play, play, play, play, play'
  FROM artists WHERE name = 'Taylor Swift';
INSERT INTO songs (artist_id, title, lyric_hint)
  SELECT artist_id, 'Bad Blood', 'Now we got problems and I do not think we can solve them'
  FROM artists WHERE name = 'Taylor Swift';
INSERT INTO songs (artist_id, title, lyric_hint)
  SELECT artist_id, 'Anti-Hero', 'It is me, hi, I am the problem, it is me'
  FROM artists WHERE name = 'Taylor Swift';
INSERT INTO songs (artist_id, title, lyric_hint)
  SELECT artist_id, 'Cruel Summer', 'Devils roll the dice, angels roll their eyes'
  FROM artists WHERE name = 'Taylor Swift';

INSERT INTO songs (artist_id, title, lyric_hint)
  SELECT artist_id, 'Sorry', 'You gotta go and get angry at all of my honesty'
  FROM artists WHERE name = 'Justin Bieber';
INSERT INTO songs (artist_id, title, lyric_hint)
  SELECT artist_id, 'Peaches', 'I got my peaches out in Georgia'
  FROM artists WHERE name = 'Justin Bieber';

INSERT INTO songs (artist_id, title, lyric_hint)
  SELECT artist_id, 'Old Town Road', 'I am gonna take my horse to the old town road, I am gonna ride till I cant no more'
  FROM artists WHERE name = 'Lil Nas X';
INSERT INTO songs (artist_id, title, lyric_hint)
  SELECT artist_id, 'Montero', 'Call me by your name, tell me you love me in private'
  FROM artists WHERE name = 'Lil Nas X';
INSERT INTO songs (artist_id, title, lyric_hint)
  SELECT artist_id, 'Industry Baby', 'I told you long ago on the road, I got what they waiting for'
  FROM artists WHERE name = 'Lil Nas X';

INSERT INTO songs (artist_id, title, lyric_hint)
  SELECT artist_id, 'Levitating', 'If you wanna run away with me, I know a galaxy and I can take you for a ride'
  FROM artists WHERE name = 'Dua Lipa';

INSERT INTO songs (artist_id, title, lyric_hint)
  SELECT artist_id, 'Watermelon Sugar', 'Tastes like strawberries on a summer evening'
  FROM artists WHERE name = 'Harry Styles';
INSERT INTO songs (artist_id, title, lyric_hint)
  SELECT artist_id, 'As It Was', 'Holdin me back, gravity is holdin me back'
  FROM artists WHERE name = 'Harry Styles';

INSERT INTO songs (artist_id, title, lyric_hint)
  SELECT artist_id, 'Stay', 'I do the same thing I told you that I never would'
  FROM artists WHERE name = 'Kid LAROI';

INSERT INTO songs (artist_id, title, lyric_hint)
  SELECT artist_id, 'drivers license', 'I got my license last week, just like we always talked about'
  FROM artists WHERE name = 'Olivia Rodrigo';
INSERT INTO songs (artist_id, title, lyric_hint)
  SELECT artist_id, 'Good 4 U', 'Well, good for you, I guess you moved on really easily'
  FROM artists WHERE name = 'Olivia Rodrigo';
INSERT INTO songs (artist_id, title, lyric_hint)
  SELECT artist_id, 'Vampire', 'Hate to give the satisfaction askin how you are doin now'
  FROM artists WHERE name = 'Olivia Rodrigo';

INSERT INTO songs (artist_id, title, lyric_hint)
  SELECT artist_id, 'Flowers', 'I can buy myself flowers, write my name in the sand'
  FROM artists WHERE name = 'Miley Cyrus';

INSERT INTO songs (artist_id, title, lyric_hint)
  SELECT artist_id, 'Heat Waves', 'Sometimes all I think about is you, late nights in the middle of June'
  FROM artists WHERE name = 'Glass Animals';

INSERT INTO songs (artist_id, title, lyric_hint)
  SELECT artist_id, 'Espresso', 'Now he is thinkin bout me every night, oh, is it that sweet'
  FROM artists WHERE name = 'Sabrina Carpenter';

INSERT INTO songs (artist_id, title, lyric_hint)
  SELECT artist_id, 'Paint The Town Red', 'Yeah, bitch, I said what I said, I would rather be famous instead'
  FROM artists WHERE name = 'Doja Cat';

INSERT INTO songs (artist_id, title, lyric_hint)
  SELECT artist_id, 'Houdini', 'Guess who is back, back again, Shady is back'
  FROM artists WHERE name = 'Eminem';
