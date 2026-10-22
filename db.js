'use strict';
const { DatabaseSync } = require('node:sqlite');
const path = require('path');

const db = new DatabaseSync(path.join(__dirname, 'metromate.db'));

db.exec(`
CREATE TABLE IF NOT EXISTS lines (
  id    TEXT PRIMARY KEY,
  name  TEXT NOT NULL,
  color TEXT NOT NULL,
  speed REAL NOT NULL
);
CREATE TABLE IF NOT EXISTS stations (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  line_id        TEXT NOT NULL REFERENCES lines(id),
  seq            INTEGER NOT NULL,
  name           TEXT NOT NULL,
  x              REAL NOT NULL,
  y              REAL NOT NULL,
  is_interchange INTEGER NOT NULL DEFAULT 0,
  shared         INTEGER NOT NULL DEFAULT 0,
  lx             REAL NOT NULL DEFAULT 0,
  ly             REAL NOT NULL DEFAULT 0,
  ax             TEXT NOT NULL DEFAULT 'middle',
  UNIQUE(line_id, seq)
);
CREATE TABLE IF NOT EXISTS trains (
  id        TEXT PRIMARY KEY,
  line_id   TEXT NOT NULL REFERENCES lines(id),
  direction INTEGER NOT NULL,
  pos       REAL NOT NULL,
  delayed   INTEGER NOT NULL DEFAULT 0,
  delay_min INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS bus_stops (
  id       INTEGER PRIMARY KEY AUTOINCREMENT,
  name     TEXT NOT NULL,
  routes   TEXT NOT NULL,
  walk_min INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS railway_stations (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  name        TEXT NOT NULL,
  info        TEXT NOT NULL,
  distance_km REAL NOT NULL,
  connection  TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS alerts (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  kind       TEXT NOT NULL,
  message    TEXT NOT NULL,
  created_at TEXT NOT NULL,
  active     INTEGER NOT NULL DEFAULT 1
);
CREATE TABLE IF NOT EXISTS eta_log (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  train_id   TEXT NOT NULL,
  station_name TEXT NOT NULL,
  eta_min    REAL NOT NULL,
  confidence REAL NOT NULL,
  created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS journeys (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id       INTEGER REFERENCES users(id),
  from_name     TEXT NOT NULL,
  to_name       TEXT NOT NULL,
  best_option   TEXT NOT NULL,
  best_time_min REAL NOT NULL,
  created_at    TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS users (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  name          TEXT NOT NULL,
  email         TEXT NOT NULL UNIQUE,
  salt          TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  created_at    TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS sessions (
  token      TEXT PRIMARY KEY,
  user_id    INTEGER NOT NULL REFERENCES users(id),
  created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS bookings (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id      INTEGER REFERENCES users(id),
  email        TEXT NOT NULL,
  code         TEXT NOT NULL UNIQUE,
  from_name    TEXT NOT NULL,
  to_name      TEXT NOT NULL,
  option_title TEXT NOT NULL,
  fare         INTEGER NOT NULL,
  status       TEXT NOT NULL DEFAULT 'PAID',
  created_at   TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS payments (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  booking_id INTEGER NOT NULL REFERENCES bookings(id),
  method     TEXT NOT NULL,
  amount     INTEGER NOT NULL,
  ref        TEXT NOT NULL,
  status     TEXT NOT NULL,
  created_at TEXT NOT NULL
);
`);

if (db.prepare('SELECT COUNT(*) AS c FROM lines').get().c === 0) {
  const addLine = db.prepare('INSERT INTO lines(id,name,color,speed) VALUES(?,?,?,?)');
  addLine.run('red', 'Red Line', '#ff5470', 46);
  addLine.run('blue', 'Blue Line', '#4cc3ff', 40);

  const addStation = db.prepare(
    'INSERT INTO stations(line_id,seq,name,x,y,is_interchange,shared,lx,ly,ax) VALUES(?,?,?,?,?,?,?,?,?,?)');
  [
    ['red', 1, 'Vastral Gam', 70, 470, 0, 0, 0, 30, 'middle'],
    ['red', 2, 'Apparel Park', 200, 430, 0, 0, 0, -18, 'middle'],
    ['red', 3, 'Thakkar Bapa Nagar', 330, 392, 0, 0, 0, 30, 'middle'],
    ['red', 4, 'Kalupur Railway Station', 430, 362, 0, 0, 0, -18, 'middle'],
    ['red', 5, 'Gheekanta', 500, 340, 1, 0, -14, -20, 'end'],
    ['red', 6, 'Sabarmati Riverfront', 620, 322, 0, 0, 0, 32, 'middle'],
    ['red', 7, 'Thaltej', 780, 302, 0, 0, 0, -18, 'middle'],
    ['red', 8, 'Thaltej Gam', 930, 290, 0, 0, 0, 30, 'middle'],
    ['blue', 1, 'Motera Stadium', 560, 80, 0, 0, 16, 5, 'start'],
    ['blue', 2, 'Sabarmati', 520, 180, 0, 0, 16, 5, 'start'],
    ['blue', 3, 'Gheekanta', 500, 340, 1, 1, 0, 0, 'middle'],
    ['blue', 4, 'Old City', 500, 450, 0, 0, -16, 5, 'end'],
    ['blue', 5, 'Paldi', 500, 520, 0, 0, 16, 5, 'start'],
    ['blue', 6, 'APMC', 470, 580, 0, 0, 0, 28, 'middle']
  ].forEach(r => addStation.run(...r));

  const addTrain = db.prepare('INSERT INTO trains(id,line_id,direction,pos) VALUES(?,?,?,?)');
  addTrain.run('R-101', 'red', 1, 0.08);
  addTrain.run('R-102', 'red', 1, 0.42);
  addTrain.run('R-103', 'red', -1, 0.86);
  addTrain.run('B-201', 'blue', 1, 0.12);
  addTrain.run('B-202', 'blue', -1, 0.55);
  addTrain.run('B-203', 'blue', -1, 0.90);

  const addBus = db.prepare('INSERT INTO bus_stops(name,routes,walk_min) VALUES(?,?,?)');
  addBus.run('Gheekanta Stop', 'routes 12 · 45 · 88', 2);
  addBus.run('Kalupur Depot Stop', 'routes 7 · 21 · 60', 4);
  addBus.run('Riverfront South Stop', 'routes 33 · 51', 6);
  addBus.run('Paldi Char Rasta', 'routes 3 · 18 · 40', 8);

  const addRail = db.prepare('INSERT INTO railway_stations(name,info,distance_km,connection) VALUES(?,?,?,?)');
  addRail.run('Kalupur Terminus', 'main line', 1.1, 'metro 1 stop');
  addRail.run('Sabarmati Junction', 'north line', 4.6, 'metro 2 stops');
  addRail.run('Maninagar Station', 'south line', 6.2, 'bus 40');
  addRail.run('Chandkheda Halt', 'freight loop', 8.9, 'bus 51');

  const addAlert = db.prepare('INSERT INTO alerts(kind,message,created_at,active) VALUES(?,?,?,1)');
  [
    'Red Line: headway compressed to 90s through evening peak',
    'AI model v4.2 deployed — ETA window tightened to ±42s',
    'Blue Line: Sabarmati platform 2 crowding easing, dwell back to 22s',
    'AMTS route 45 synced with Kalupur metro arrivals',
    'Monsoon advisory: surface-section speed caps active, predictions adjusted',
    'Gheekanta interchange: cross-platform transfer window 3.5 min'
  ].forEach(m => addAlert.run('info', m, new Date().toISOString()));
}

module.exports = db;
