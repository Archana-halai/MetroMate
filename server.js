'use strict';
const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const db = require('./db');
const sim = require('./sim');

const PORT = process.env.PORT || 3000;
const ROOT = __dirname;
const MIME = {
  '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8', '.svg': 'image/svg+xml',
  '.png': 'image/png', '.ico': 'image/x-icon', '.json': 'application/json'
};

/* ---------- auth helpers ---------- */
const hashPassword = (password, salt) => crypto.scryptSync(password, salt, 64).toString('hex');
const newToken = () => crypto.randomBytes(32).toString('hex');

const qAuth = {
  userByEmail: db.prepare('SELECT * FROM users WHERE email=?'),
  addUser: db.prepare('INSERT INTO users(name,email,salt,password_hash,created_at) VALUES(?,?,?,?,?)'),
  addSession: db.prepare('INSERT INTO sessions(token,user_id,created_at) VALUES(?,?,?)'),
  sessionUser: db.prepare('SELECT u.id,u.name,u.email FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.token=?'),
  dropSession: db.prepare('DELETE FROM sessions WHERE token=?')
};

/* ---------- payments / bookings ---------- */
const luhn = digits => {
  let sum = 0, dbl = false;
  for (let i = digits.length - 1; i >= 0; i--) {
    let n = +digits[i];
    if (dbl) { n *= 2; if (n > 9) n -= 9; }
    sum += n; dbl = !dbl;
  }
  return digits.length > 0 && sum % 10 === 0;
};
const qPay = {
  addBooking: db.prepare('INSERT INTO bookings(user_id,email,code,from_name,to_name,option_title,fare,status,created_at) VALUES(?,?,?,?,?,?,?,?,?)'),
  addPayment: db.prepare('INSERT INTO payments(booking_id,method,amount,ref,status,created_at) VALUES(?,?,?,?,?,?)'),
  bookingsOf: db.prepare(`SELECT b.code,b.from_name,b.to_name,b.option_title,b.fare,b.status,b.created_at,p.method,p.ref
                          FROM bookings b JOIN payments p ON p.booking_id=b.id
                          WHERE b.user_id=? ORDER BY b.id DESC LIMIT 8`)
};

async function handleBooking(req, res) {
  const user = authUser(req);
  const { from, to, title, method, email, card, upi } = await readBody(req);
  const computed = sim.computeOptions(from || '', to || '');
  if (computed.error) return json(res, 400, computed);
  const opt = (computed.options || []).find(o => o.title === title);
  if (!opt) return json(res, 400, { error: 'Unknown route option' });
  const fare = opt.fare;
  const mail = user ? user.email : String(email || '').trim();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(mail || '')) return json(res, 400, { error: 'A valid email is required for the ticket' });

  let payLabel;
  if (method === 'card') {
    const digits = String((card && card.number) || '').replace(/\D/g, '');
    const exp = String((card && card.expiry) || '').trim();
    const cvc = String((card && card.cvc) || '').trim();
    const name = String((card && card.name) || '').trim();
    if (digits.length !== 16 || !luhn(digits)) return json(res, 400, { error: 'Card number failed validation — try 4242 4242 4242 4242' });
    const m = /^(0[1-9]|1[0-2])\/(\d{2})$/.exec(exp);
    if (!m) return json(res, 400, { error: 'Expiry must be in MM/YY format' });
    const yy = +m[2], mm = +m[1], d = new Date(), cy = d.getFullYear() % 100, cm = d.getMonth() + 1;
    if (yy < cy || (yy === cy && mm < cm)) return json(res, 400, { error: 'This card has expired' });
    if (!/^\d{3,4}$/.test(cvc)) return json(res, 400, { error: 'CVC must be 3 or 4 digits' });
    if (!name) return json(res, 400, { error: 'Name on card is required' });
    if (digits.endsWith('0002')) return json(res, 402, { error: 'Card declined by issuer (test decline card)' });
    payLabel = 'card ending ' + digits.slice(-4);
  } else if (method === 'upi') {
    const id = String(upi || '').trim();
    if (!/^[\w.\-]{2,}@[a-z]{2,}$/i.test(id)) return json(res, 400, { error: 'Enter a valid UPI ID like asha@okbank' });
    payLabel = 'UPI ' + id;
  } else {
    return json(res, 400, { error: 'Unsupported payment method' });
  }

  const ts = new Date().toISOString();
  const code = 'MM-' + crypto.randomBytes(4).toString('hex').toUpperCase();
  const info = qPay.addBooking.run(user ? user.id : null, mail, code, from, to, title, fare, 'DEMO_PENDING', ts);
  const ref = 'pay_' + crypto.randomBytes(6).toString('hex');
  qPay.addPayment.run(Number(info.lastInsertRowid), method, fare, ref, 'DEMO_ONLY', ts);
  return json(res, 201, { ticket: { code, from, to, title, fare, method, ref, email: mail, payLabel, paymentStatus: 'DEMO_ONLY', created_at: ts }, message: 'Demo booking created only. No payment was processed and no real ticket was issued.' });
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let data = '';
    req.on('data', c => { data += c; if (data.length > 1e6) req.destroy(); });
    req.on('end', () => { try { resolve(JSON.parse(data || '{}')); } catch (e) { reject(e); } });
  });
}
function authUser(req) {
  const h = req.headers.authorization || '';
  const token = h.startsWith('Bearer ') ? h.slice(7) : null;
  return token ? qAuth.sessionUser.get(token) : undefined;
}
function json(res, code, obj) {
  res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
  res.end(JSON.stringify(obj));
}

async function handleAuth(req, res, pathname) {
  if (pathname === '/api/auth/signup' && req.method === 'POST') {
    const { name, email, password } = await readBody(req);
    if (!name || !String(name).trim()) return json(res, 400, { error: 'Name is required' });
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email || '')) return json(res, 400, { error: 'Enter a valid email address' });
    if (!password || password.length < 6) return json(res, 400, { error: 'Password must be at least 6 characters' });
    if (qAuth.userByEmail.get(email)) return json(res, 409, { error: 'An account with this email already exists' });
    const salt = crypto.randomBytes(16).toString('hex');
    const info = qAuth.addUser.run(String(name).trim(), email, salt, hashPassword(password, salt), new Date().toISOString());
    const token = newToken();
    qAuth.addSession.run(token, Number(info.lastInsertRowid), new Date().toISOString());
    return json(res, 201, { token, user: { id: Number(info.lastInsertRowid), name: String(name).trim(), email } });
  }
  if (pathname === '/api/auth/login' && req.method === 'POST') {
    const { email, password } = await readBody(req);
    const user = qAuth.userByEmail.get(email || '');
    if (!user) return json(res, 401, { error: 'Invalid email or password' });
    const guess = hashPassword(password || '', user.salt);
    if (!crypto.timingSafeEqual(Buffer.from(guess, 'hex'), Buffer.from(user.password_hash, 'hex')))
      return json(res, 401, { error: 'Invalid email or password' });
    const token = newToken();
    qAuth.addSession.run(token, user.id, new Date().toISOString());
    return json(res, 200, { token, user: { id: user.id, name: user.name, email: user.email } });
  }
  if (pathname === '/api/auth/me' && req.method === 'GET') {
    const user = authUser(req);
    return user ? json(res, 200, { user }) : json(res, 401, { error: 'Not signed in' });
  }
  if (pathname === '/api/auth/logout' && req.method === 'POST') {
    const h = req.headers.authorization || '';
    if (h.startsWith('Bearer ')) qAuth.dropSession.run(h.slice(7));
    return json(res, 200, { ok: true });
  }
  return json(res, 404, { error: 'Unknown auth endpoint' });
}

/* ---------- server ---------- */
const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://localhost');
  const p = url.pathname;
  try {
    if (p.startsWith('/api/auth/')) return await handleAuth(req, res, p);
    if (p.startsWith('/api/')) {
      if (p === '/api/bookings' && req.method === 'POST') return await handleBooking(req, res);
      if (p === '/api/osm-stops' && req.method === 'GET') {
        const query = `[out:json][timeout:20];(node(around:10000,23.0575,72.5425)[highway=bus_stop];node(around:10000,23.0575,72.5425)[public_transport=platform][bus=yes];way(around:10000,23.0575,72.5425)[highway=bus_stop];way(around:10000,23.0575,72.5425)[public_transport=platform][bus=yes];);out center tags;`;
        const endpoints = ['https://overpass-api.de/api/interpreter', 'https://overpass.kumi.systems/api/interpreter'];
        let payload = null, lastError = null;
        for (const endpoint of endpoints) {
          try {
            const upstream = await fetch(endpoint, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8', 'User-Agent': 'MetroMate-Ahmedabad-Educational-Project/1.0' }, body: 'data=' + encodeURIComponent(query), signal: AbortSignal.timeout(22000) });
            if (!upstream.ok) throw new Error('OpenStreetMap query returned HTTP ' + upstream.status);
            payload = await upstream.json(); break;
          } catch (err) { lastError = err; }
        }
        if (!payload) return json(res, 502, { error: 'OpenStreetMap bus-stop lookup is temporarily unavailable', detail: String(lastError && lastError.message || '') });
        const stops = (payload.elements || []).map(el => {
          const tags = el.tags || {}, center = el.center || {};
          const lat = Number(el.lat ?? center.lat), lng = Number(el.lon ?? center.lon);
          const name = String(tags.name || tags['name:en'] || tags.ref || '').trim();
          if (!name || !Number.isFinite(lat) || !Number.isFinite(lng)) return null;
          const operatorText = [tags.operator, tags.network, tags.name, tags.description, tags.ref].filter(Boolean).join(' ');
          const isBRTS = /\bbrts\b|janmarg|bus rapid transit/i.test(operatorText);
          const isAMTS = /\bamts\b|ahmedabad municipal transport/i.test(operatorText);
          return { name, lat, lng, type: isBRTS ? 'brts' : 'amts', operatorVerified: isBRTS || isAMTS, operator: tags.operator || tags.network || '', source: 'OpenStreetMap' };
        }).filter(Boolean);
        return json(res, 200, { source: 'OpenStreetMap', radiusKm: 10, center: { lat: 23.0575, lng: 72.5425 }, stops });
      }
      if (req.method !== 'GET') return json(res, 405, { error: 'Method not allowed' });
      switch (p) {
        case '/api/health': return json(res, 200, { ok: true, service: 'metromate-api', db: 'sqlite (node:sqlite)', time: new Date().toISOString() });
        case '/api/state': return json(res, 200, sim.state());
        case '/api/departures': return json(res, 200, sim.departures());
        case '/api/arrivals': return json(res, 200, sim.arrivals(url.searchParams.get('station') || ''));
        case '/api/alerts': return json(res, 200, sim.alerts());
        case '/api/telemetry': return json(res, 200, sim.telemetry());
        case '/api/nearby': return json(res, 200, sim.nearby());
        case '/api/routes': {
          const user = authUser(req);
          return json(res, 200, sim.routes(url.searchParams.get('from') || '', url.searchParams.get('to') || '', user && user.id));
        }
        case '/api/journeys': {
          const user = authUser(req);
          if (!user) return json(res, 401, { error: 'Not signed in' });
          return json(res, 200, sim.journeys(user.id));
        }
        case '/api/bookings': {
          const user = authUser(req);
          if (!user) return json(res, 401, { error: 'Not signed in' });
          return json(res, 200, { bookings: qPay.bookingsOf.all(user.id) });
        }
        default: return json(res, 404, { error: 'Unknown endpoint' });
      }
    }
    const file = p === '/' ? '/auth.html' : p;
    const full = path.normalize(path.join(ROOT, file));
    if (full !== ROOT && !full.startsWith(ROOT + path.sep)) { res.writeHead(403); return res.end('Forbidden'); }
    fs.readFile(full, (err, data) => {
      if (err) { res.writeHead(404, { 'Content-Type': 'text/plain' }); return res.end('Not found'); }
      res.writeHead(200, { 'Content-Type': MIME[path.extname(full)] || 'application/octet-stream' });
      res.end(data);
    });
  } catch (e) {
    json(res, 500, { error: String(e && e.message || e) });
  }
});

sim.start();
server.listen(PORT, () => console.log('MetroMate API + site running on http://localhost:' + PORT));
module.exports = server;
