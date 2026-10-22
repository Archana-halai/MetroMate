// sim.js — live vehicle simulation + AI route engine for Ahmedabad LIVE.
// Vehicles glide along REAL coordinates; routing uses Dijkstra over
// Metro (Blue/Red) + Janmarg BRTS + AMTS with real walking transfers.
'use strict';
const { db } = require('./db');

const TIME_SCALE = 18;          // 1 real second = 18 network seconds
const DWELL_MIN = 0.4;          // dwell per stop (network minutes)
const WALK_KMH = 4.8;
const BASE_FARE = { metro: 5, brts: 8, bus: 10 };
const PER_STOP  = { metro: 2.5, brts: 1.5, bus: 1 };
const TRANSFER_MAX_KM = 0.45;   // walking transfer radius
const ACCESS_MAX_KM = 0.9;      // origin/destination access radius

// ---------- geometry ----------
function havKm(aLat, aLng, bLat, bLng) {
  const R = 6371, toR = Math.PI / 180;
  const dLat = (bLat - aLat) * toR, dLng = (bLng - aLng) * toR;
  const s = Math.sin(dLat / 2) ** 2 +
    Math.cos(aLat * toR) * Math.cos(bLat * toR) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(s));
}

// ---------- static network ----------
const lines = new Map();     // id -> {id,name,mode,color,glyph,headway,speed,cum[],len,polyline[]}
const stations = new Map();  // station id -> {id,lineId,name,lat,lng,seq,interchange,area,cum}
const stationRows = [];

(function loadNetwork() {
  for (const l of db.prepare('SELECT * FROM lines').all()) {
    lines.set(l.id, {
      id: l.id, name: l.name, mode: l.mode, color: l.color, glyph: l.glyph,
      headway: l.headway_min, speed: l.speed_kmh,
      cum: [], len: 0, polyline: [], stations: []
    });
  }
  const rows = db.prepare('SELECT * FROM stations ORDER BY line_id, seq').all();
  for (const s of rows) {
    const L = lines.get(s.line_id);
    L.polyline.push([s.lat, s.lng]);
    L.stations.push(s.id);
  }
  for (const L of lines.values()) {
    let acc = 0; L.cum = [0];
    for (let i = 1; i < L.polyline.length; i++) {
      acc += havKm(L.polyline[i - 1][0], L.polyline[i - 1][1], L.polyline[i][0], L.polyline[i][1]);
      L.cum.push(acc);
    }
    L.len = acc;
  }
  for (const s of rows) {
    const L = lines.get(s.line_id);
    const st = {
      id: s.id, lineId: s.line_id, name: s.name, lat: s.lat, lng: s.lng,
      seq: s.seq, interchange: !!s.interchange, area: s.area, cum: L.cum[s.seq]
    };
    stations.set(s.id, st);
    stationRows.push(st);
  }
})();

// ---------- walking transfer adjacency ----------
const transferAdj = new Map(); // station id -> [{to, min, km}]
(function buildTransfers() {
  for (const a of stationRows) transferAdj.set(a.id, []);
  for (let i = 0; i < stationRows.length; i++) {
    for (let j = i + 1; j < stationRows.length; j++) {
      const a = stationRows[i], b = stationRows[j];
      if (a.lineId === b.lineId) continue;
      const d = havKm(a.lat, a.lng, b.lat, b.lng);
      if (d <= TRANSFER_MAX_KM) {
        const t = (d / WALK_KMH) * 60 + 2; // +2 min interchange buffer
        transferAdj.get(a.id).push({ to: b.id, min: t, km: d });
        transferAdj.get(b.id).push({ to: a.id, min: t, km: d });
      }
    }
  }
})();

// ---------- vehicles ----------
const vehicles = [];
(function loadVehicles() {
  for (const v of db.prepare('SELECT * FROM vehicles').all()) {
    vehicles.push({
      id: v.id, lineId: v.line_id, dist: v.dist, dir: v.dir,
      speed: v.speed, label: v.label,
      jitter: 0.92 + Math.random() * 0.16,
      delayUntil: 0
    });
  }
})();

function posAt(L, d) {
  d = Math.max(0, Math.min(L.len, d));
  let i = 1;
  while (i < L.cum.length - 1 && L.cum[i] < d) i++;
  const t = (d - L.cum[i - 1]) / ((L.cum[i] - L.cum[i - 1]) || 1);
  const a = L.polyline[i - 1], b = L.polyline[i];
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
}
function nearestStation(L, d) {
  let best = null, bd = Infinity;
  for (let i = 0; i < L.cum.length; i++) {
    const dd = Math.abs(L.cum[i] - d);
    if (dd < bd) { bd = dd; best = i; }
  }
  return stations.get(L.stations[best]);
}

// ---------- alerts ----------
function addAlert(kind, message) {
  db.prepare('INSERT INTO alerts(kind,message,created_at) VALUES(?,?,?)')
    .run(kind, message, new Date().toISOString());
}
let tickCount = 0;

function tick() {
  const dt = TIME_SCALE / 3600; // network hours per real second
  const now = Date.now();
  for (const v of vehicles) {
    const L = lines.get(v.lineId);
    const delayed = now < v.delayUntil;
    const sp = v.speed * v.jitter * (delayed ? 0.3 : 1);
    v.dist += v.dir * sp * dt;
    if (v.dist <= 0) { v.dist = -v.dist; v.dir = 1; }
    if (v.dist >= L.len) { v.dist = 2 * L.len - v.dist; v.dir = -1; }
  }
  // random delay events (max 2 active)
  const activeDelays = vehicles.filter(v => now < v.delayUntil).length;
  if (activeDelays < 2 && Math.random() < 0.012) {
    const v = vehicles[Math.floor(Math.random() * vehicles.length)];
    v.delayUntil = now + 25000 + Math.random() * 35000;
    const L = lines.get(v.lineId);
    const st = nearestStation(L, v.dist);
    addAlert('delay', `Service alert: ${L.name.split('(')[0].trim()} running ~4 min slow near ${st.name}.`);
  }
  for (const v of vehicles) {
    if (v.delayUntil && now >= v.delayUntil && v.delayUntil < now + 1100) {
      if (v.recoverFlag) { addAlert('recovered', `Normal service resumed on ${lines.get(v.lineId).name.split('(')[0].trim()}.`); v.recoverFlag = false; }
    }
    if (Date.now() < v.delayUntil) v.recoverFlag = true;
  }
  if (++tickCount % 30 === 0) {
    db.exec('DELETE FROM alerts WHERE id NOT IN (SELECT id FROM alerts ORDER BY id DESC LIMIT 80)');
  }
}

let timer = null;
function start() { if (!timer) timer = setInterval(tick, 1000); }

// ---------- API payloads ----------
function state() {
  const now = Date.now();
  return {
    timeScale: TIME_SCALE, updated: now,
    lines: [...lines.values()].map(L => ({
      id: L.id, name: L.name, mode: L.mode, color: L.color, glyph: L.glyph,
      headway: L.headway, polyline: L.polyline, len: +L.len.toFixed(2),
      stations: L.stations.map(id => {
        const s = stations.get(id);
        return { id: s.id, name: s.name, lat: s.lat, lng: s.lng, interchange: s.interchange, area: s.area, cum: +s.cum.toFixed(3) };
      })
    })),
    vehicles: vehicles.map(v => ({
      id: v.id, lineId: v.lineId, dist: +v.dist.toFixed(4), dir: v.dir,
      speed: +(v.speed * v.jitter).toFixed(1), delayed: now < v.delayUntil, label: v.label
    })),
    alerts: db.prepare('SELECT kind,message,created_at FROM alerts ORDER BY CASE WHEN kind=\'info\' THEN 0 ELSE 1 END, id DESC LIMIT 10').all()
  };
}

function stationOptions() {
  return stationRows
    .slice()
    .sort((a, b) => a.area.localeCompare(b.area) || a.name.localeCompare(b.name))
    .map(s => {
      const L = lines.get(s.lineId);
      return { id: s.id, name: s.name, area: s.area, mode: L.mode, lineName: L.name, color: L.color, interchange: s.interchange };
    });
}

function departures(stationId) {
  const s = stations.get(stationId);
  if (!s) return null;
  const L = lines.get(s.lineId);
  const now = Date.now();
  const out = [];
  for (const v of vehicles) {
    if (v.lineId !== s.lineId) continue;
    const sp = v.speed * v.jitter * (now < v.delayUntil ? 0.3 : 1);
    let d, turnback = false;
    if (v.dir === 1) {
      if (s.cum >= v.dist) { d = s.cum - v.dist; }
      else { d = (L.len - v.dist) + (L.len - s.cum); turnback = true; }
    } else {
      if (s.cum <= v.dist) { d = v.dist - s.cum; }
      else { d = v.dist + s.cum; turnback = true; }
    }
    const stopsBetween = Math.max(0, Math.round(Math.abs(d) / (L.len / (L.stations.length - 1))) - 1);
    const mins = (d / sp) * 60 + stopsBetween * DWELL_MIN;
    const dest = stations.get(v.dir === 1 ? L.stations[L.stations.length - 1] : L.stations[0]);
    out.push({
      vehicle: v.label, dest: dest.name, turnback,
      eta_min: +mins.toFixed(1), delayed: now < v.delayUntil,
      line: L.name, color: L.color, mode: L.mode, glyph: L.glyph
    });
  }
  out.sort((a, b) => a.eta_min - b.eta_min);
  return { station: { id: s.id, name: s.name, area: s.area, lat: s.lat, lng: s.lng, line: L.name, color: L.color, mode: L.mode }, departures: out.slice(0, 6) };
}

function alertsList() {
  return db.prepare('SELECT kind,message,created_at FROM alerts ORDER BY id DESC LIMIT 12').all();
}

function telemetry() {
  const now = Date.now();
  const delayed = vehicles.filter(v => now < v.delayUntil).length;
  const networkKm = [...lines.values()].reduce((a, L) => a + L.len, 0);
  const avg = vehicles.reduce((a, v) => a + v.speed * v.jitter * (now < v.delayUntil ? 0.3 : 1), 0) / vehicles.length;
  return {
    vehicles: vehicles.length, delayed,
    onTimePct: Math.round(((vehicles.length - delayed) / vehicles.length) * 100),
    avgSpeed: +avg.toFixed(1), networkKm: +networkKm.toFixed(1),
    stations: stationRows.length, lines: lines.size,
    paxPerHour: 8200 + Math.round(Math.sin(now / 90000) * 900)
  };
}

// ---------- routing (Dijkstra over modes with walking transfers) ----------
function search(fromId, toId, modes, allowTransfers) {
  const start = stations.get(fromId), goal = stations.get(toId);
  if (!start || !goal) return null;
  const allowed = s => modes.includes(lines.get(s.lineId).mode);

  const best = new Map(); // key `node|lastLine` -> state
  const visited = new Set();
  const push = (key, st) => {
    const cur = best.get(key);
    if (!cur || st.cost < cur.cost) best.set(key, st);
  };

  // start candidates: allowed-line stations within access walk of origin
  for (const s of stationRows) {
    if (!allowed(s)) continue;
    const d = s.id === fromId ? 0 : havKm(start.lat, start.lng, s.lat, s.lng);
    if (d > ACCESS_MAX_KM) continue;
    const walkMin = d > 0.03 ? (d / WALK_KMH) * 60 + 1 : 0;
    const legs = walkMin ? [{ type: 'walk', from: start.name, to: s.name, minutes: +walkMin.toFixed(1), km: +d.toFixed(2) }] : [];
    push(s.id + '|', { cost: walkMin, fare: 0, legs, lastLine: null, walkKm: d, transfers: 0 });
  }
  if (!best.size) return null;

  // end candidates
  const ends = stationRows.filter(s => allowed(s) &&
    (s.id === toId || havKm(goal.lat, goal.lng, s.lat, s.lng) <= ACCESS_MAX_KM));
  if (!ends.length) return null;

  while (true) {
    let uKey = null, u = null;
    for (const [k, st] of best) {
      if (visited.has(k)) continue;
      if (!u || st.cost < u.cost) { uKey = k; u = st; }
    }
    if (!uKey) break;
    visited.add(uKey);
    const uId = uKey.split('|')[0];
    const us = stations.get(uId);
    const L = lines.get(us.lineId);

    // ride edges to adjacent stations on same line
    for (const dSeq of [1, -1]) {
      const nb = stations.get(L.stations[us.seq + dSeq]);
      if (!nb || !allowed(nb)) continue;
      const segD = Math.abs(nb.cum - us.cum);
      const t = (segD / L.speed) * 60 + DWELL_MIN;
      const boarding = u.lastLine !== L.id;
      const w = boarding ? L.headway / 2 : 0;
      const legs = u.legs.slice();
      if (boarding) {
        legs.push({
          type: 'ride', lineId: L.id, lineName: L.name, mode: L.mode,
          color: L.color, glyph: L.glyph, from: us.name, to: nb.name,
          stops: 1, km: +segD.toFixed(2), minutes: +(t + w).toFixed(1)
        });
      } else {
        // clone the shared last-leg object before mutating — other states
        // hold references to the same array elements
        const last = Object.assign({}, legs[legs.length - 1]);
        legs[legs.length - 1] = last;
        last.to = nb.name; last.stops += 1;
        last.km = +(last.km + segD).toFixed(2);
        last.minutes = +(last.minutes + t).toFixed(1);
      }
      const nKey = nb.id + '|' + L.id;
      if (!visited.has(nKey)) {
        push(nKey, {
          cost: u.cost + t + w,
          fare: u.fare + (boarding ? BASE_FARE[L.mode] : 0) + PER_STOP[L.mode],
          legs, lastLine: L.id, walkKm: u.walkKm, transfers: u.transfers
        });
      }
    }

    // walking transfers
    if (allowTransfers) {
      for (const tr of transferAdj.get(uId) || []) {
        const ts = stations.get(tr.to);
        if (!allowed(ts)) continue;
        const nKey = ts.id + '|';
        if (visited.has(nKey)) continue;
        push(nKey, {
          cost: u.cost + tr.min, fare: u.fare,
          legs: u.legs.concat([{ type: 'walk', from: us.name, to: ts.name, minutes: +tr.min.toFixed(1), km: +tr.km.toFixed(2) }]),
          lastLine: null, walkKm: u.walkKm + tr.km, transfers: u.transfers + 1
        });
      }
    }
  }

  // best completion via end candidates
  let win = null;
  for (const e of ends) {
    const d = e.id === toId ? 0 : havKm(goal.lat, goal.lng, e.lat, e.lng);
    const fin = d > 0.03 ? (d / WALK_KMH) * 60 + 1 : 0;
    for (const [k, st] of best) {
      if (!k.startsWith(e.id + '|')) continue;
      const total = st.cost + fin;
      if (!win || total < win.total) {
        const legs = st.legs.slice();
        if (fin) legs.push({ type: 'walk', from: e.name, to: goal.name, minutes: +fin.toFixed(1), km: +d.toFixed(2) });
        win = { total, fare: st.fare, legs, walkKm: st.walkKm, transfers: st.transfers, rideKm: legs.filter(l => l.type === 'ride').reduce((a, l) => a + l.km, 0) };
      }
    }
  }
  if (!win || !win.legs.some(l => l.type === 'ride')) return null;
  return {
    minutes: Math.max(1, Math.round(win.total)),
    fare: Math.max(5, Math.round(win.fare)),
    legs: win.legs, transfers: win.transfers,
    rideKm: +win.rideKm.toFixed(1), walkKm: +win.walkKm.toFixed(1),
    modesUsed: [...new Set(win.legs.filter(l => l.type === 'ride').map(l => l.mode))],
    sig: win.legs.map(l => l.type === 'ride' ? `R:${l.lineId}:${l.from}>${l.to}` : `W:${l.from}>${l.to}`).join('|')
  };
}

const PROFILES = [
  { key: 'metro', label: 'Metro (Red ⇄ Blue)', modes: ['metro'], transfers: true },
  { key: 'brts',  label: 'Janmarg BRTS',       modes: ['brts'],  transfers: false },
  { key: 'amts',  label: 'AMTS City Bus',      modes: ['bus'],   transfers: false },
  { key: 'smart', label: 'Smart Multi-modal',  modes: ['metro', 'brts', 'bus'], transfers: true }
];

function computeOptions(fromId, toId) {
  const from = stations.get(fromId), to = stations.get(toId);
  if (!from || !to || fromId === toId) return [];
  const seen = new Set();
  const opts = [];
  for (const p of PROFILES) {
    const r = search(fromId, toId, p.modes, p.transfers);
    if (!r || seen.has(r.sig)) continue;
    seen.add(r.sig);
    opts.push({
      key: p.key, label: p.label, ...r,
      score: r.minutes + r.fare * 0.5 + r.transfers * 3,
      fromName: from.name, toName: to.name,
      googleUrl: `https://www.google.com/maps/dir/?api=1&origin=${encodeURIComponent(from.name + ', Ahmedabad')}&destination=${encodeURIComponent(to.name + ', Ahmedabad')}&travelmode=transit`
    });
  }
  opts.sort((a, b) => a.score - b.score);
  if (opts.length) {
    opts[0].best = true;
    const cheapest = opts.reduce((a, b) => (b.fare < a.fare ? b : a));
    if (cheapest !== opts[0]) cheapest.value = true;
  }
  return opts;
}

function routes(fromId, toId, userId) {
  const options = computeOptions(fromId, toId);
  if (userId && options.length) {
    const from = stations.get(fromId), to = stations.get(toId);
    db.prepare('INSERT INTO journeys(user_id,from_name,to_name,plan_json,created_at) VALUES(?,?,?,?,?)')
      .run(userId, from.name, to.name, JSON.stringify(options[0]), new Date().toISOString());
  }
  return options;
}

function journeys(userId) {
  return db.prepare('SELECT from_name,to_name,plan_json,created_at FROM journeys WHERE user_id=? ORDER BY id DESC LIMIT 8').all(userId)
    .map(j => ({ ...j, plan: JSON.parse(j.plan_json), plan_json: undefined }));
}

module.exports = { start, state, stationOptions, departures, alerts: alertsList, telemetry, computeOptions, routes, journeys, stations, lines, TIME_SCALE };
