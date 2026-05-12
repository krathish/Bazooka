-- instructions.sql
-- Run this ONCE to set up the Bazooka database from scratch.
--
-- From your terminal (assuming a local Postgres on the default port):
--   psql -U postgres -f instructions.sql
--
-- This script will:
--   1. Drop the bazooka database if it already exists (so re-running is safe)
--   2. Create a fresh bazooka database
--   3. Connect to it
--   4. Create the four tables in dependency order (artists -> songs -> games -> guesses)
--   5. Seed 17 artists and 30 songs
--
-- We have FOUR tables because:
--   - artists  (lookup table for song artists; one artist has many songs)
--   - songs    (the lyric prompts; each song belongs to one artist)
--   - games    (one row per completed playthrough)
--   - guesses  (one row per round, links a game to a song with the score)


-- ---------- 1. Reset the database ----------

-- DROP first so re-running this script is idempotent. Without IF EXISTS the
-- very first run would error out because there's nothing to drop.
DROP DATABASE IF EXISTS bazooka;

-- Create a fresh empty database.
CREATE DATABASE bazooka;

-- \c is a psql meta-command (not actual SQL). It re-connects to the new DB
-- so the CREATE TABLE statements below land in `bazooka`, not `postgres`.
\c bazooka


-- ---------- 2. Create the tables ----------

-- artists is the parent of songs. We create it first so the FK in `songs`
-- has something to point at.
--   - artist_id: SERIAL means Postgres auto-generates 1, 2, 3, ... for us.
--   - name UNIQUE so we can safely look up an artist by name when seeding songs
--     (and so we never accidentally create "Adele" twice).
CREATE TABLE artists (
  artist_id SERIAL PRIMARY KEY,
  name      VARCHAR(100) NOT NULL UNIQUE
);

-- songs has a foreign key to artists. ON DELETE is left at the default RESTRICT,
-- which means Postgres will refuse to delete an artist that still has songs.
-- That's the safe default for a class project.
--
-- Three columns deserve a comment:
--   - lyric_hint  : NULLABLE. The hand-curated 30 seed songs at the bottom
--                   of this file have a lyric, but the iTunes-discovered
--                   songs (npm run discover-songs) don't, so the column
--                   has to allow NULL.
--   - preview_url : Apple's iTunes Search API gives us a 30-second mp4
--                   preview URL per song. That's the audio we play during
--                   a round. Filled in by `npm run fetch-previews` for
--                   the seeded 30, and inline by `npm run discover-songs`
--                   for everything else.
--   - UNIQUE (artist_id, title) : prevents duplicate rows when the
--                   discovery script re-runs or when iTunes returns the
--                   same song under different searches. The constraint
--                   is what `ON CONFLICT (artist_id, title) DO NOTHING`
--                   in the script keys off of.
CREATE TABLE songs (
  song_id     SERIAL PRIMARY KEY,
  artist_id   INT NOT NULL REFERENCES artists(artist_id),
  title       VARCHAR(100) NOT NULL,
  lyric_hint  VARCHAR(255),
  preview_url VARCHAR(500),
  UNIQUE (artist_id, title)
);

-- games stores one row per completed playthrough.
-- played_at defaults to NOW() so we never have to set it from the app —
-- Postgres timestamps the row at insert time.
CREATE TABLE games (
  game_id     SERIAL PRIMARY KEY,
  nickname    VARCHAR(30) NOT NULL,
  final_score INT NOT NULL,
  played_at   TIMESTAMP NOT NULL DEFAULT NOW()
);

-- guesses is a detail table: one row per round, ten rows per game.
-- It has TWO foreign keys (game_id and song_id), which is a clean teaching
-- example of a many-to-many-ish relationship laid out as a join table.
CREATE TABLE guesses (
  guess_id           SERIAL PRIMARY KEY,
  game_id            INT NOT NULL REFERENCES games(game_id),
  song_id            INT NOT NULL REFERENCES songs(song_id),
  points_awarded     INT NOT NULL,
  was_correct        BOOLEAN NOT NULL,
  time_taken_seconds INT NOT NULL
);


-- ---------- 3. Seed artists ----------

-- 17 mainstream pop artists. Order doesn't matter — SERIAL just hands out
-- IDs in insert order — but we go alphabetical to make the file readable.
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


-- ---------- 4. Seed songs ----------

-- We use INSERT ... SELECT instead of hard-coding artist_id = 1, 2, 3, ...
-- because the SERIAL counter is fragile (re-running the seeds in a different
-- order would shift every id). Looking the artist up by name keeps the songs
-- correct no matter what.
--
-- Each lyric_hint is a short, well-known snippet that points clearly at the
-- song without literally including the title.

-- The Weeknd
INSERT INTO songs (artist_id, title, lyric_hint)
  SELECT artist_id, 'Blinding Lights', 'I have been tryna call, I have been on my own for long enough'
  FROM artists WHERE name = 'The Weeknd';
INSERT INTO songs (artist_id, title, lyric_hint)
  SELECT artist_id, 'Save Your Tears', 'I saw you dancing in a crowded room'
  FROM artists WHERE name = 'The Weeknd';

-- Ed Sheeran
INSERT INTO songs (artist_id, title, lyric_hint)
  SELECT artist_id, 'Shape of You', 'The club is not the best place to find a lover, so the bar is where I go'
  FROM artists WHERE name = 'Ed Sheeran';
INSERT INTO songs (artist_id, title, lyric_hint)
  SELECT artist_id, 'Bad Habits', 'Every time you come around, you know I cannot say no'
  FROM artists WHERE name = 'Ed Sheeran';

-- Billie Eilish
INSERT INTO songs (artist_id, title, lyric_hint)
  SELECT artist_id, 'Bad Guy', 'White shirt now red, my bloody nose'
  FROM artists WHERE name = 'Billie Eilish';

-- Bruno Mars
INSERT INTO songs (artist_id, title, lyric_hint)
  SELECT artist_id, 'Uptown Funk', 'This hit, that ice cold, Michelle Pfeiffer, that white gold'
  FROM artists WHERE name = 'Bruno Mars';

-- Adele
INSERT INTO songs (artist_id, title, lyric_hint)
  SELECT artist_id, 'Rolling in the Deep', 'There is a fire starting in my heart'
  FROM artists WHERE name = 'Adele';
INSERT INTO songs (artist_id, title, lyric_hint)
  SELECT artist_id, 'Someone Like You', 'I heard that you are settled down, that you found a girl and you are married now'
  FROM artists WHERE name = 'Adele';
INSERT INTO songs (artist_id, title, lyric_hint)
  SELECT artist_id, 'Hello', 'It is me, I was wondering if after all these years you would like to meet'
  FROM artists WHERE name = 'Adele';

-- Taylor Swift
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

-- Justin Bieber
INSERT INTO songs (artist_id, title, lyric_hint)
  SELECT artist_id, 'Sorry', 'You gotta go and get angry at all of my honesty'
  FROM artists WHERE name = 'Justin Bieber';
INSERT INTO songs (artist_id, title, lyric_hint)
  SELECT artist_id, 'Peaches', 'I got my peaches out in Georgia'
  FROM artists WHERE name = 'Justin Bieber';

-- Lil Nas X
INSERT INTO songs (artist_id, title, lyric_hint)
  SELECT artist_id, 'Old Town Road', 'I am gonna take my horse to the old town road, I am gonna ride till I cant no more'
  FROM artists WHERE name = 'Lil Nas X';
INSERT INTO songs (artist_id, title, lyric_hint)
  SELECT artist_id, 'Montero', 'Call me by your name, tell me you love me in private'
  FROM artists WHERE name = 'Lil Nas X';
INSERT INTO songs (artist_id, title, lyric_hint)
  SELECT artist_id, 'Industry Baby', 'I told you long ago on the road, I got what they waiting for'
  FROM artists WHERE name = 'Lil Nas X';

-- Dua Lipa
INSERT INTO songs (artist_id, title, lyric_hint)
  SELECT artist_id, 'Levitating', 'If you wanna run away with me, I know a galaxy and I can take you for a ride'
  FROM artists WHERE name = 'Dua Lipa';

-- Harry Styles
INSERT INTO songs (artist_id, title, lyric_hint)
  SELECT artist_id, 'Watermelon Sugar', 'Tastes like strawberries on a summer evening'
  FROM artists WHERE name = 'Harry Styles';
INSERT INTO songs (artist_id, title, lyric_hint)
  SELECT artist_id, 'As It Was', 'Holdin me back, gravity is holdin me back'
  FROM artists WHERE name = 'Harry Styles';

-- Kid LAROI
INSERT INTO songs (artist_id, title, lyric_hint)
  SELECT artist_id, 'Stay', 'I do the same thing I told you that I never would'
  FROM artists WHERE name = 'Kid LAROI';

-- Olivia Rodrigo
INSERT INTO songs (artist_id, title, lyric_hint)
  SELECT artist_id, 'drivers license', 'I got my license last week, just like we always talked about'
  FROM artists WHERE name = 'Olivia Rodrigo';
INSERT INTO songs (artist_id, title, lyric_hint)
  SELECT artist_id, 'Good 4 U', 'Well, good for you, I guess you moved on really easily'
  FROM artists WHERE name = 'Olivia Rodrigo';
INSERT INTO songs (artist_id, title, lyric_hint)
  SELECT artist_id, 'Vampire', 'Hate to give the satisfaction askin how you are doin now'
  FROM artists WHERE name = 'Olivia Rodrigo';

-- Miley Cyrus
INSERT INTO songs (artist_id, title, lyric_hint)
  SELECT artist_id, 'Flowers', 'I can buy myself flowers, write my name in the sand'
  FROM artists WHERE name = 'Miley Cyrus';

-- Glass Animals
INSERT INTO songs (artist_id, title, lyric_hint)
  SELECT artist_id, 'Heat Waves', 'Sometimes all I think about is you, late nights in the middle of June'
  FROM artists WHERE name = 'Glass Animals';

-- Sabrina Carpenter
INSERT INTO songs (artist_id, title, lyric_hint)
  SELECT artist_id, 'Espresso', 'Now he is thinkin bout me every night, oh, is it that sweet'
  FROM artists WHERE name = 'Sabrina Carpenter';

-- Doja Cat
INSERT INTO songs (artist_id, title, lyric_hint)
  SELECT artist_id, 'Paint The Town Red', 'Yeah, bitch, I said what I said, I would rather be famous instead'
  FROM artists WHERE name = 'Doja Cat';

-- Eminem
INSERT INTO songs (artist_id, title, lyric_hint)
  SELECT artist_id, 'Houdini', 'Guess who is back, back again, Shady is back'
  FROM artists WHERE name = 'Eminem';
