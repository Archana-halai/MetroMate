// server.js — Ahmedabad LIVE backend: static site + REST API.
// Zero npm dependencies (node:http + node:sqlite). Login-first: '/' serves auth.html.
'use strict';
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { db, hash } = require('./db');
const sim = require('./sim');

const ROOT = __dirname;
const MIME = {
  '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8', '.json': 'application/json',
  '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg',
  '.ico': 'image/x-icon', '.woff2': 'font/woff2'
};

const qUser = db.prepare('SELECT id,name,email,pass_hash,salt FROM users WHERE email=?');
const qInsUser = db.prepare('INSERT INTO users(name,email,pass_hash,salt,created_at) VALUES(?,?,?,?,?)');
const qInsSess = db.prepare('INSERT INTO sessions(token,user_id,created_at) VALUES(?,?,?)');
const qSess = db.prepare(`SELECT s.token, u.id uid, u.name, u.email FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.token=?`);
const qDelSess = db.prepare('DELETE FROM sessions WHERE token=?');
const qInsBooking = db.prepare('INSERT INTO bookings(user_id,code,from_name,to_name,modes,minutes,fare,method,status,upi_link,created_at) VALUES(?,?,?,?,?,?,?,?,?,?,?)');
const qInsPayment = db.prepare('INSERT INTO payments(booking_id,method,amount,status,ref,created_at) VALUES(?,?,?,?,?,?)');
const qBookingsByUser = db.prepare('SELECT * FROM bookings WHERE user_id=? ORDER BY id DESC LIMIT 20');
const qBookingByCode = db.prepare('SELECT * FROM bookings WHERE code=? AND user_id=?');

function json(res, code, obj) {
  const body = JSON.stringify(obj);
  res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
  res.end(body);
}
function readBody(req) {
  return new Promise((resolve, reject) => {
    let data = '';
    req.on('data', c => { data += c; if (data.length > 1e6) req.destroy(); });
    req.on('end', () => { try { resolve(data ? JSON.parse(data) : {}); } catch { reject(new Error('bad json')); } });
    req.on('error', reject);
  });
}
function authUser(req) {
  const h = req.headers.authorization || '';
  const m = h.match(/^Bearer\s+(.+)$/i);
  if (!m) return null;
  const row = qSess.get(m[1]);
  return row ? { id: row.uid, name: row.name, email: row.email, token: row.token } : null;
}
function makeTicket(b) {
  return {
    code: b.code, from: b.from_name, to: b.to_name, modes: b.modes,
    minutes: b.minutes, fare: b.fare, method: b.method, status: b.status,
    upi_link: b.upi_link, created_at: b.created_at
  };
}
function luhn(num) {
  const d = num.replace(/\D/g, '');
  if (d.length < 12) return false;
  let sum = 0, alt = false;
  for (let i = d.length - 1; i >= 0; i--) {
    let n = +d[i];
    if (alt) { n *= 2; if (n > 9) n -= 9; }
    sum += n; alt = !alt;
  }
  return sum % 10 === 0;
}

// ---------------- auth handlers ----------------
async function handleSignup(req, res) {
  const b = await readBody(req);
  const name = String(b.name || '').trim(), email = String(b.email || '').trim().toLowerCase(), pass = String(b.password || '');
  if (!name || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email) || pass.length < 6) {
    return json(res, 400, { error: 'Name, valid email and password (6+ chars) required.' });
  }
  if (qUser.get(email)) return json(res, 409, { error: 'That email is already registered. Try signing in.' });
  const salt = crypto.randomBytes(16).toString('hex');
  const info = qInsUser.run(name, email, hash(pass, salt), salt, new Date().toISOString());
  const token = crypto.randomBytes(24).toString('hex');
  qInsSess.run(token, Number(info.lastInsertRowid), new Date().toISOString());
  json(res, 201, { token, user: { name, email } });
}
async function handleLogin(req, res) {
  const b = await readBody(req);
  const email = String(b.email || '').trim().toLowerCase(), pass = String(b.password || '');
  const u = qUser.get(email);
  if (!u) return json(res, 401, { error: 'No account with that email.' });
  const h = hash(pass, u.salt);
  const ok = h.length === u.pass_hash.length && crypto.timingSafeEqual(Buffer.from(h, 'hex'), Buffer.from(u.pass_hash, 'hex'));
  if (!ok) return json(res, 401, { error: 'Wrong password.' });
  const token = crypto.randomBytes(24).toString('hex');
  qInsSess.run(token, u.id, new Date().toISOString());
  json(res, 200, { token, user: { name: u.name, email: u.email } });
}

// ---------------- booking / payments ----------------
async function handleBooking(req, res, user) {
  const b = await readBody(req);
  const fromId = String(b.from || ''), toId = String(b.to || ''), sig = String(b.sig || '');
  const method = String(b.method || '');
  if (!['qr', 'card', 'upi'].includes(method)) return json(res, 400, { error: 'Unknown payment method.' });

  // tamper-proof: recompute routes server-side and match the chosen option by signature
  const options = sim.computeOptions(fromId, toId);
  const opt = options.find(o => o.sig === sig);
  if (!opt) return json(res, 400, { error: 'Route option expired or invalid — plan the journey again.' });

  const now = new Date().toISOString();
  const code = 'AHL-' + crypto.randomBytes(3).toString('hex').toUpperCase();
  let status = 'paid', payStatus = 'success', upiLink = null, ref = 'TXN' + Date.now().toString(36).toUpperCase();

  if (method === 'card') {
    const c = b.card || {};
    const digits = String(c.number || '').replace(/\s/g, '');
    if (!luhn(digits)) return json(res, 400, { error: 'Card number failed validation.' });
    const em = String(c.exp || '').match(/^(\d{2})\s*\/\s*(\d{2})$/);
    if (!em) return json(res, 400, { error: 'Expiry must be MM/YY.' });
    const mm = +em[1], yy = 2000 + +em[2];
    const end = new Date(yy, mm, 1);
    if (!(mm >= 1 && mm <= 12) || end <= new Date()) return json(res, 400, { error: 'Card expired or invalid expiry date.' });
    if (!/^\d{3,4}$/.test(String(c.cvc || ''))) return json(res, 400, { error: 'CVC must be 3–4 digits.' });
    if (!String(c.name || '').trim()) return json(res, 400, { error: 'Name on card required.' });
    if (digits.endsWith('0002')) return json(res, 402, { error: 'Card declined by issuing bank (demo test card).' });
  } else if (method === 'upi') {
    const id = String((b.upi || {}).id || '').trim();
    if (!/^[a-z0-9.\-_]{2,}@[a-z]{2,}$/i.test(id)) return json(res, 400, { error: 'Enter a valid UPI ID like name@okbank.' });
  } else { // qr — booking stays awaiting_payment until the (simulated) scan is confirmed
    status = 'awaiting_payment'; payStatus = 'pending'; ref = null;
    upiLink = `upi://pay?pa=ahmedabadlive.demo@upi&pn=${encodeURIComponent('Ahmedabad LIVE')}&am=${opt.fare}&cu=INR&tn=${encodeURIComponent(code + ' ' + opt.fromName + '-' + opt.toName)}`;
  }

  const info = qInsBooking.run(user.id, code, opt.fromName, opt.toName, opt.modesUsed.join('+'), opt.minutes, opt.fare, method, status, upiLink, now);
  qInsPayment.run(Number(info.lastInsertRowid), method, opt.fare, payStatus, ref, now);
  const bk = qBookingByCode.get(code, user.id);
  json(res, 201, { ticket: makeTicket(bk), option: { minutes: opt.minutes, fare: opt.fare, label: opt.label } });
}

async function handleConfirmPaid(req, res, user) {
  const b = await readBody(req);
  const code = String(b.code || '');
  const bk = qBookingByCode.get(code, user.id);
  if (!bk) return json(res, 404, { error: 'Ticket not found.' });
  if (bk.status === 'awaiting_payment') {
    db.prepare("UPDATE bookings SET status='paid' WHERE id=?").run(bk.id);
    db.prepare("UPDATE payments SET status='success', ref=? WHERE booking_id=?").run('QR' + Date.now().toString(36).toUpperCase(), bk.id);
    bk.status = 'paid';
  }
  json(res, 200, { ticket: makeTicket(bk) });
}

// ---------------- HTTP server ----------------
const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://localhost');
  const p = decodeURIComponent(url.pathname);

  try {
    // ---- API ----
    if (p.startsWith('/api/')) {
      if (p === '/api/health') return json(res, 200, { ok: true, service: 'ahmedabad-live-api', db: 'sqlite (node:sqlite)', time: new Date().toISOString() });
      if (p === '/api/state') return json(res, 200, sim.state());
      if (p === '/api/stations') return json(res, 200, sim.stationOptions());
      if (p === '/api/departures') {
        const id = url.searchParams.get('station');
        const d = id ? sim.departures(id) : null;
        return d ? json(res, 200, d) : json(res, 404, { error: 'Unknown station.' });
      }
      if (p === '/api/alerts') return json(res, 200, sim.alerts());
      if (p === '/api/telemetry') return json(res, 200, sim.telemetry());
      if (p === '/api/routes') {
        const from = url.searchParams.get('from'), to = url.searchParams.get('to');
        if (!from || !to) return json(res, 400, { error: 'from and to are required.' });
        const user = authUser(req);
        return json(res, 200, sim.routes(from, to, user ? user.id : null));
      }

      if (p === '/api/auth/signup' && req.method === 'POST') return handleSignup(req, res);
      if (p === '/api/auth/login' && req.method === 'POST') return handleLogin(req, res);
      if (p === '/api/auth/me') {
        const user = authUser(req);
        return user ? json(res, 200, { user: { name: user.name, email: user.email } }) : json(res, 401, { error: 'Not signed in.' });
      }
      if (p === '/api/auth/logout' && req.method === 'POST') {
        const user = authUser(req);
        if (user) qDelSess.run(user.token);
        return json(res, 200, { ok: true });
      }

      // authenticated routes below
      const user = authUser(req);
      if (!user) return json(res, 401, { error: 'Sign in required.' });
      if (p === '/api/bookings' && req.method === 'POST') return handleBooking(req, res, user);
      if (p === '/api/bookings' && req.method === 'GET') {
        return json(res, 200, qBookingsByUser.all(user.id).map(makeTicket));
      }
      if (p === '/api/bookings/confirm' && req.method === 'POST') return handleConfirmPaid(req, res, user);
      if (p === '/api/journeys' && req.method === 'GET') return json(res, 200, sim.journeys(user.id));
      return json(res, 404, { error: 'Unknown endpoint.' });
    }

    // ---- static site (login-first) ----
    if (req.method !== 'GET' && req.method !== 'HEAD') { res.writeHead(405); return res.end('Method not allowed'); }
    const rel = p === '/' ? '/auth.html' : p;
    const full = path.normalize(path.join(ROOT, rel));
    if (!full.startsWith(ROOT)) { res.writeHead(403); return res.end('Forbidden'); }
    fs.readFile(full, (err, data) => {
      if (err) { res.writeHead(404, { 'Content-Type': 'text/plain' }); return res.end('Not found'); }
      res.writeHead(200, { 'Content-Type': MIME[path.extname(full)] || 'application/octet-stream' });
      res.end(data);
    });
  } catch (e) {
    json(res, 500, { error: 'Server error: ' + e.message });
  }
});

sim.start();
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`Ahmedabad LIVE running on http://localhost:${PORT}`));
module.exports = server;
