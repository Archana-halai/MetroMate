// db.js — Ahmedabad LIVE database (built-in node:sqlite, zero npm deps)
// Seeds REAL Ahmedabad geography: Metro Blue (East–West, incl. Kalupur),
// Metro Red (North–South, incl. Naranpura), Janmarg BRTS corridor and an
// AMTS city-bus route — all with real latitude/longitude coordinates.
'use strict';
const { DatabaseSync } = require('node:sqlite');
const path = require('node:path');
const crypto = require('node:crypto');

const db = new DatabaseSync(path.join(__dirname, 'ahmedabad.db'));

db.exec(`
PRAGMA journal_mode = WAL;
CREATE TABLE IF NOT EXISTS lines(
  id TEXT PRIMARY KEY, name TEXT NOT NULL, mode TEXT NOT NULL,
  color TEXT NOT NULL, headway_min REAL NOT NULL, speed_kmh REAL NOT NULL,
  glyph TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS stations(
  id TEXT PRIMARY KEY, line_id TEXT NOT NULL, name TEXT NOT NULL,
  lat REAL NOT NULL, lng REAL NOT NULL, seq INTEGER NOT NULL,
  interchange INTEGER NOT NULL DEFAULT 0, area TEXT NOT NULL DEFAULT ''
);
CREATE TABLE IF NOT EXISTS vehicles(
  id TEXT PRIMARY KEY, line_id TEXT NOT NULL, dist REAL NOT NULL,
  dir INTEGER NOT NULL, speed REAL NOT NULL, label TEXT NOT NULL DEFAULT ''
);
CREATE TABLE IF NOT EXISTS alerts(
  id INTEGER PRIMARY KEY AUTOINCREMENT, kind TEXT NOT NULL,
  message TEXT NOT NULL, created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS journeys(
  id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER, from_name TEXT,
  to_name TEXT, plan_json TEXT, created_at TEXT
);
CREATE TABLE IF NOT EXISTS users(
  id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL,
  email TEXT UNIQUE NOT NULL, pass_hash TEXT NOT NULL, salt TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS sessions(
  token TEXT PRIMARY KEY, user_id INTEGER NOT NULL, created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS bookings(
  id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER NOT NULL,
  code TEXT UNIQUE NOT NULL, from_name TEXT, to_name TEXT, modes TEXT,
  minutes INTEGER, fare INTEGER, method TEXT, status TEXT,
  upi_link TEXT, created_at TEXT
);
CREATE TABLE IF NOT EXISTS payments(
  id INTEGER PRIMARY KEY AUTOINCREMENT, booking_id INTEGER NOT NULL,
  method TEXT NOT NULL, amount INTEGER NOT NULL, status TEXT NOT NULL,
  ref TEXT, created_at TEXT
);
`);

function hash(password, salt) {
  return crypto.scryptSync(password, salt, 64).toString('hex');
}

// ---------------- seed lines ----------------
// mode: metro | brts | bus   (speed_kmh = real-world operating speed)
const LINES = [
  { id: 'blue', name: 'Metro Blue Line (East–West)', mode: 'metro', color: '#4cc3ff', headway_min: 4, speed_kmh: 34, glyph: 'M' },
  { id: 'red',  name: 'Metro Red Line (North–South)', mode: 'metro', color: '#ff5470', headway_min: 5, speed_kmh: 34, glyph: 'M' },
  { id: 'brts', name: 'Janmarg BRTS', mode: 'brts', color: '#ffb454', headway_min: 5, speed_kmh: 22, glyph: 'B' },
  { id: 'amts', name: 'AMTS Route 4U', mode: 'bus', color: '#3ddc97', headway_min: 8, speed_kmh: 16, glyph: 'A' }
];

// ---------------- seed stations (real lat/lng) ----------------
// Blue Line — operational East–West corridor Thaltej ↔ Vastral Gam
const BLUE = [
  ['Thaltej',            23.0633, 72.5062, 0, 'Thaltej'],
  ['Doordarshan Kendra', 23.0575, 72.5145, 0, 'Gurukul'],
  ['Gurukul Road',       23.0512, 72.5228, 0, 'Gurukul'],
  ['Gujarat University', 23.0455, 72.5310, 0, 'Navrangpura'],
  ['Commerce Six Road',  23.0400, 72.5420, 0, 'Navrangpura'],
  ['Old High Court',     23.0334, 72.5626, 1, 'Ashram Road'],
  ['Shahpur',            23.0300, 72.5720, 0, 'Old City'],
  ['Gheekanta',          23.0275, 72.5805, 0, 'Old City'],
  ['Kalupur',            23.0262, 72.5856, 0, 'Kalupur'],
  ['Kankaria East',      23.0170, 72.5910, 0, 'Kankaria'],
  ['Apparel Park',       23.0190, 72.6150, 0, 'Vastral'],
  ['Vastral Gam',        23.0230, 72.6330, 0, 'Vastral']
];
// Red Line — North–South corridor Motera ↔ APMC (Naranpura sector)
const RED = [
  ['Motera Stadium', 23.0925, 72.5780, 0, 'Motera'],
  ['Sabarmati',      23.0690, 72.5820, 0, 'Sabarmati'],
  ['Ranip',          23.0610, 72.5780, 0, 'Ranip'],
  ['Vadaj',          23.0540, 72.5665, 0, 'Vadaj'],
  ['Naranpura',      23.0455, 72.5630, 0, 'Naranpura'],
  ['Old High Court', 23.0334, 72.5626, 1, 'Ashram Road'],
  ['Lal Darwaja',    23.0250, 72.5760, 0, 'Old City'],
  ['Maninagar',      23.0090, 72.5925, 0, 'Maninagar'],
  ['APMC Market',    23.0010, 72.5880, 0, 'APMC']
];
// Janmarg BRTS — Naranpura ↔ Kalupur via Income Tax & Lal Darwaja
const BRTS = [
  ['Naranpura BRTS',  23.0510, 72.5635, 0, 'Naranpura'],
  ['Gurukul Crossing',23.0455, 72.5615, 0, 'Naranpura'],
  ['Income Tax',      23.0395, 72.5590, 0, 'Ashram Road'],
  ['Ashram Road',     23.0350, 72.5640, 0, 'Ashram Road'],
  ['Lal Bahadur Stadium', 23.0289, 72.5730, 0, 'Old City'],
  ['Lal Darwaja BRTS',23.0255, 72.5785, 0, 'Old City'],
  ['Kalupur BRTS',    23.0258, 72.5860, 0, 'Kalupur']
];
// AMTS city bus 4U — Naranpura ↔ Kalupur Terminus (street stops)
const AMTS = [
  ['Naranpura Bus Stop',  23.0515, 72.5648, 0, 'Naranpura'],
  ['Shastri Nagar',       23.0470, 72.5655, 0, 'Naranpura'],
  ['H.K. College',        23.0420, 72.5680, 0, 'Navrangpura'],
  ['Relief Road',         23.0300, 72.5750, 0, 'Old City'],
  ['Bhadra',              23.0270, 72.5790, 0, 'Old City'],
  ['Kalupur Terminus',    23.0245, 72.5860, 0, 'Kalupur']
];

const nLines = db.prepare('SELECT COUNT(*) c FROM lines').get().c;
if (nLines === 0) {
  const insLine = db.prepare('INSERT INTO lines(id,name,mode,color,headway_min,speed_kmh,glyph) VALUES(?,?,?,?,?,?,?)');
  for (const l of LINES) insLine.run(l.id, l.name, l.mode, l.color, l.headway_min, l.speed_kmh, l.glyph);

  const insSt = db.prepare('INSERT INTO stations(id,line_id,name,lat,lng,seq,interchange,area) VALUES(?,?,?,?,?,?,?,?)');
  const groups = [['blue', BLUE], ['red', RED], ['brts', BRTS], ['amts', AMTS]];
  for (const [lineId, rows] of groups) {
    rows.forEach((r, i) => {
      const id = lineId + '-' + i;
      insSt.run(id, lineId, r[0], r[1], r[2], i, r[3], r[4]);
    });
  }

  // vehicles parked at varied progress points (km) — sim.start() animates them
  const insV = db.prepare('INSERT INTO vehicles(id,line_id,dist,dir,speed,label) VALUES(?,?,?,?,?,?)');
  const seeds = [
    ['blue', 0.6, 1, 'T1'], ['blue', 5.4, -1, 'T2'], ['blue', 9.8, 1, 'T3'], ['blue', 14.2, -1, 'T4'],
    ['red', 1.1, 1, 'T5'],  ['red', 5.9, -1, 'T6'], ['red', 9.4, 1, 'T7'],
    ['brts', 0.4, 1, 'J1'], ['brts', 1.8, -1, 'J2'], ['brts', 2.9, 1, 'J3'],
    ['amts', 0.3, -1, 'A1'], ['amts', 1.6, 1, 'A2'], ['amts', 2.7, -1, 'A3']
  ];
  for (const s of seeds) {
    const line = LINES.find(l => l.id === s[0]);
    insV.run(s[0] + '-' + s[3], s[0], s[1], s[2], line.speed_kmh, s[3]);
  }

  // seed info alerts
  const insA = db.prepare('INSERT INTO alerts(kind,message,created_at) VALUES(?,?,?)');
  const now = new Date().toISOString();
  const infos = [
    ['info', 'Blue Line headway reduced to 4 min for evening peak (Thaltej ↔ Vastral Gam).'],
    ['info', 'Janmarg BRTS: dedicated lane enforcement active on Ashram Road stretch.'],
    ['info', 'AMTS Route 4U now connects Naranpura directly to Kalupur Terminus.'],
    ['info', 'Interchange available between Blue & Red Lines at Old High Court station.'],
    ['info', 'UPI QR ticketing enabled — scan, pay, and ride paperless.']
  ];
  for (const [k, m] of infos) insA.run(k, m, now);

  // seed demo users
  const insU = db.prepare('INSERT INTO users(name,email,pass_hash,salt,created_at) VALUES(?,?,?,?,?)');
  for (const u of [
    { name: 'Ravi Mehta', email: 'ravi@metro.city', pass: 'blueline42' },
    { name: 'Asha Patel', email: 'asha@metro.city', pass: 'redline123' }
  ]) {
    const salt = crypto.randomBytes(16).toString('hex');
    insU.run(u.name, u.email, hash(u.pass, salt), salt, now);
  }
  console.log('ahmedabad.db seeded: 4 lines, 34 stations, 13 vehicles, demo users ready');
}

module.exports = { db, hash };
