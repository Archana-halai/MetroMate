'use strict';
const db = require('./db');

const TIME_SCALE = 0.55; /* sim seconds -> displayed minutes */

const lines = db.prepare('SELECT * FROM lines').all();
const stations = db.prepare('SELECT * FROM stations ORDER BY line_id, seq').all();
for (const l of lines) {
  l.stations = stations.filter(s => s.line_id === l.id);
  l.len = 0;
  for (let i = 1; i < l.stations.length; i++)
    l.len += Math.hypot(l.stations[i].x - l.stations[i - 1].x, l.stations[i].y - l.stations[i - 1].y);
  let acc = 0;
  l.stations[0].arc = 0;
  for (let i = 1; i < l.stations.length; i++) {
    acc += Math.hypot(l.stations[i].x - l.stations[i - 1].x, l.stations[i].y - l.stations[i - 1].y);
    l.stations[i].arc = acc;
  }
}
const trains = db.prepare('SELECT * FROM trains').all();
const lineOf = id => lines.find(l => l.id === id);
const speedOf = t => lineOf(t.line_id).speed * (t.delayed ? 0.5 : 1);

const q = {
  updTrain: db.prepare('UPDATE trains SET pos=?, direction=?, delayed=?, delay_min=? WHERE id=?'),
  addAlert: db.prepare('INSERT INTO alerts(kind,message,created_at,active) VALUES(?,?,?,1)'),
  expire: db.prepare("UPDATE alerts SET active=0 WHERE kind!='info' AND datetime(created_at) < datetime('now','-90 seconds')"),
  activeAlerts: db.prepare('SELECT * FROM alerts WHERE active=1 ORDER BY CASE WHEN kind=\'info\' THEN 0 ELSE 1 END, id DESC LIMIT 12'),
  logEta: db.prepare('INSERT INTO eta_log(train_id,station_name,eta_min,confidence,created_at) VALUES(?,?,?,?,?)'),
  lastLog: db.prepare('SELECT * FROM eta_log ORDER BY id DESC LIMIT 9'),
  trimLog: db.prepare('DELETE FROM eta_log WHERE id NOT IN (SELECT id FROM eta_log ORDER BY id DESC LIMIT 200)'),
  bus: db.prepare('SELECT * FROM bus_stops ORDER BY id'),
  rail: db.prepare('SELECT * FROM railway_stations ORDER BY id'),
  addJourney: db.prepare('INSERT INTO journeys(user_id,from_name,to_name,best_option,best_time_min,created_at) VALUES(?,?,?,?,?,?)'),
  journeysOf: db.prepare('SELECT * FROM journeys WHERE user_id=? ORDER BY id DESC LIMIT 8')
};

const now = () => new Date().toISOString();
const confidence = t => Math.round((t.delayed ? 88 : 94) + Math.random() * 5);

function etaMin(t, st) {
  const l = lineOf(t.line_id);
  const v = speedOf(t);
  const p = t.pos * l.len, ls = st.arc;
  let sec;
  if (t.direction > 0) sec = ls >= p ? (ls - p) / v : ((l.len - p) + (l.len - ls)) / v;
  else sec = p >= ls ? (p - ls) / v : (p + ls) / v;
  return sec * TIME_SCALE;
}

function tick(dt) {
  for (const t of trains) {
    const l = lineOf(t.line_id);
    t.pos += (speedOf(t) * dt * t.direction) / l.len;
    if (t.pos >= 1) { t.pos = 1; t.direction = -1; }
    if (t.pos <= 0) { t.pos = 0; t.direction = 1; }
  }
  for (const t of trains) q.updTrain.run(t.pos, t.direction, t.delayed, t.delay_min, t.id);
}

function maybeDelay() {
  if (Math.random() >= 0.38) return;
  const t = trains.filter(x => !x.delayed)[Math.floor(Math.random() * trains.length)];
  if (!t || t.delayed) return;
  t.delayed = 1;
  t.delay_min = Math.ceil(2 + Math.random() * 3);
  q.addAlert.run('delay', 'Train ' + t.id + ' running +' + t.delay_min + ' min behind — AI re-sequencing headways.', now());
  setTimeout(() => {
    t.delayed = 0;
    q.addAlert.run('recovery', 'Train ' + t.id + ' back on predicted schedule.', now());
  }, 14000 + Math.random() * 10000);
}

function logEta() {
  const t = trains[Math.floor(Math.random() * trains.length)];
  const l = lineOf(t.line_id);
  const st = l.stations[Math.floor(Math.random() * l.stations.length)];
  q.logEta.run(t.id, st.name, +etaMin(t, st).toFixed(2), confidence(t), now());
  q.trimLog.run();
}

function state() {
  return {
    lines: lines.map(l => ({
      id: l.id, name: l.name, color: l.color, speed: l.speed, len: l.len,
      stations: l.stations.map(s => ({
        name: s.name, x: s.x, y: s.y, seq: s.seq,
        interchange: !!s.is_interchange, shared: !!s.shared, lx: s.lx, ly: s.ly, ax: s.ax
      }))
    })),
    trains: trains.map(t => ({
      id: t.id, line_id: t.line_id, direction: t.direction,
      pos: t.pos, delayed: !!t.delayed, delay_min: t.delay_min
    })),
    updated: Date.now()
  };
}

function departures() {
  q.expire.run();
  const rows = trains.map(t => {
    const l = lineOf(t.line_id);
    const p = t.pos * l.len;
    const ahead = l.stations
      .filter(s => (t.direction > 0 ? s.arc > p + 1 : s.arc < p - 1))
      .sort((a, b) => (t.direction > 0 ? a.arc - b.arc : b.arc - a.arc))[0];
    const dest = l.stations[t.direction > 0 ? l.stations.length - 1 : 0];
    const next = ahead || dest;
    return {
      train: t.id, line_id: l.id, line_name: l.name, color: l.color,
      next: next.name, dest: dest.name, eta: Math.max(etaMin(t, next), 0.1),
      delayed: !!t.delayed, delay_min: t.delay_min
    };
  }).sort((a, b) => a.eta - b.eta);
  return { rows };
}

function arrivals(name) {
  q.expire.run();
  const rows = [];
  for (const l of lines) {
    const st = l.stations.find(s => s.name === name);
    if (!st) continue;
    for (const t of trains) if (t.line_id === l.id)
      rows.push({
        train: t.id, line_id: l.id, line_name: l.name, color: l.color,
        eta: etaMin(t, st),
        heading: l.stations[t.direction > 0 ? l.stations.length - 1 : 0].name,
        confidence: confidence(t), delayed: !!t.delayed
      });
  }
  rows.sort((a, b) => a.eta - b.eta);
  return { station: name, rows: rows.slice(0, 4) };
}

function alerts() {
  q.expire.run();
  return { alerts: q.activeAlerts.all() };
}

function telemetry() {
  return {
    conf: +(92 + Math.random() * 6.5).toFixed(1),
    err: Math.round(28 + Math.random() * 27),
    risk: +(0.08 + Math.random() * 0.34).toFixed(2),
    log: q.lastLog.all().reverse()
  };
}

function nearby() {
  return { bus: q.bus.all(), rail: q.rail.all() };
}

function metroLeg(a, b) {
  const la = lineOf(a.line_id), lb = lineOf(b.line_id);
  if (a.line_id === b.line_id) {
    const stops = Math.abs(a.seq - b.seq);
    return {
      title: 'Metro direct',
      legs: [{ mode: 'METRO', color: la.color, txt: la.name + ' · ' + a.name + ' → ' + b.name }],
      time: stops * 2.4 + 2, fare: Math.min(30, 8 + stops * 3)
    };
  }
  const g1 = la.stations.find(s => s.is_interchange), g2 = lb.stations.find(s => s.is_interchange);
  const stops = Math.abs(a.seq - g1.seq) + Math.abs(b.seq - g2.seq);
  return {
    title: 'Metro with interchange',
    legs: [
      { mode: 'METRO', color: la.color, txt: la.name + ' · ' + a.name + ' → Gheekanta' },
      { mode: 'WALK', color: '#8fa0bd', txt: 'cross-platform transfer · 3 min' },
      { mode: 'METRO', color: lb.color, txt: lb.name + ' · Gheekanta → ' + b.name }
    ],
    time: stops * 2.4 + 6, fare: Math.min(40, 10 + stops * 3)
  };
}

function computeOptions(from, to) {
  const a = stations.find(s => s.name === from), b = stations.find(s => s.name === to);
  if (!a || !b) return { error: 'Unknown station' };
  if (a.name === b.name) return { options: [] };
  const dist = Math.hypot(a.x - b.x, a.y - b.y);
  const opts = [metroLeg(a, b)];
  opts.push({
    title: 'AMTS bus direct', time: dist / 10 + 8, fare: 6 + Math.round(dist / 150),
    legs: [
      { mode: 'WALK', color: '#8fa0bd', txt: 'to nearest AMTS stop · 4 min' },
      { mode: 'BUS', color: '#3ddc97', txt: 'AMTS arterial service · ' + Math.round(dist / 10) + ' min ride' }
    ]
  });
  const mb = metroLeg(a, b);
  mb.title = 'Metro + AMTS last mile';
  mb.legs = mb.legs.concat([{ mode: 'BUS', color: '#3ddc97', txt: 'AMTS last-mile shuttle · 5 min' }]);
  mb.time += 4; mb.fare += 6;
  opts.push(mb);
  opts.sort((x, y) => x.time - y.time);
  opts.forEach((o, i) => { o.best = i === 0; o.confidence = Math.round(89 + Math.random() * 8); });
  return { options: opts };
}

function routes(from, to, userId) {
  const r = computeOptions(from, to);
  if (r.options && r.options.length)
    q.addJourney.run(userId || null, from, to, r.options[0].title, Math.round(r.options[0].time), now());
  return r;
}

function journeys(userId) {
  return { journeys: q.journeysOf.all(userId) };
}

let started = false;
function start() {
  if (started) return;
  started = true;
  let n = 0;
  setInterval(() => {
    tick(1);
    maybeDelay();
    if (++n % 3 === 0) logEta();
  }, 1000);
}

module.exports = { start, state, departures, arrivals, alerts, telemetry, nearby, routes, journeys, computeOptions };
