'use strict';
const $ = (s, r) => (r || document).querySelector(s);
const SVGNS = 'http://www.w3.org/2000/svg';
const el = (name, attrs) => {
  const n = document.createElementNS(SVGNS, name);
  for (const k in attrs) n.setAttribute(k, attrs[k]);
  return n;
};
const fmtEta = m => (m < 1 ? Math.max(15, Math.round(m * 60)) + 's' : m.toFixed(1) + ' min');

/* ---------------- api client ---------------- */
const token = () => localStorage.getItem('mm_token');
async function api(path, opts) {
  const o = Object.assign({ headers: {} }, opts);
  if (token()) o.headers.Authorization = 'Bearer ' + token();
  const r = await fetch(path, o);
  if (r.status === 401 && token()) { localStorage.removeItem('mm_token'); localStorage.removeItem('mm_user'); }
  if (!r.ok) { const d = await r.json().catch(() => ({})); throw new Error(d.error || ('HTTP ' + r.status)); }
  return r.json();
}
let offlineWarned = false;
function offline() {
  if (offlineWarned) return;
  offlineWarned = true;
  toast('Backend offline — start it with: node server.js', 'warn', 'API UNREACHABLE');
}

/* ---------------- live map ---------------- */
const svg = $('#netmap');
const local = {};   /* train id -> {line, dir, pos, delayed, speed, len} */
const lineMeta = {}; /* line id -> {color, name, len, speed} */
const stationDots = {};
let selectedName = null;

function buildMap(state) {
  svg.innerHTML = '';
  for (const l of state.lines) {
    lineMeta[l.id] = l;
    l.arcs = [0];
    for (let i = 1; i < l.stations.length; i++)
      l.arcs.push(l.arcs[i - 1] + Math.hypot(l.stations[i].x - l.stations[i - 1].x, l.stations[i].y - l.stations[i - 1].y));
    const d = l.stations.map((s, i) => (i ? 'L' : 'M') + s.x + ' ' + s.y).join(' ');
    svg.appendChild(el('path', { d, class: 'net-line-glow', stroke: l.color }));
    svg.appendChild(el('path', { d, class: 'net-line', stroke: l.color }));
  }
  for (const l of state.lines) for (const s of l.stations) {
    const key = s.name;
    if (s.interchange && !stationDots[key + '-ring']) {
      const ring = el('circle', { cx: s.x, cy: s.y, r: 10, fill: 'none', stroke: '#fff', 'stroke-width': 2, opacity: .5 });
      ring.appendChild(el('animate', { attributeName: 'r', values: '10;24', dur: '2.6s', repeatCount: 'indefinite' }));
      ring.appendChild(el('animate', { attributeName: 'opacity', values: '.5;0', dur: '2.6s', repeatCount: 'indefinite' }));
      svg.appendChild(ring);
      stationDots[key + '-ring'] = true;
    }
    if (!stationDots[key]) {
      const dot = el('circle', { cx: s.x, cy: s.y, r: s.interchange ? 9 : 7, class: 'st-dot' + (s.interchange ? ' st-inter' : ''), stroke: l.color });
      dot.addEventListener('click', () => showStation(key));
      stationDots[key] = dot;
      svg.appendChild(dot);
      if (!s.shared) {
        const t = el('text', { x: s.x + (s.lx || 0), y: s.y + (s.ly || 0), class: 'st-label', 'text-anchor': s.ax || 'middle' });
        t.textContent = s.name;
        stationDots[key + '-label'] = t;
        svg.appendChild(t);
      }
    }
  }
  for (const t of state.trains) {
    if (!local[t.id]) {
      const g = el('g', { class: 'train' });
      const color = lineMeta[t.line_id].color;
      g.append(el('circle', { r: 11, fill: color, opacity: .25 }), el('circle', { r: 6.5, fill: color }), el('circle', { r: 2.6, fill: '#fff' }));
      svg.appendChild(g);
      local[t.id] = { g };
    }
    Object.assign(local[t.id], { line: t.line_id, dir: t.direction, pos: t.pos, delayed: t.delayed, speed: lineMeta[t.line_id].speed, len: lineMeta[t.line_id].len });
  }
}
let last = performance.now();
function tick(now) {
  const dt = Math.min(.05, (now - last) / 1000);
  last = now;
  for (const id in local) {
    const t = local[id];
    if (t.len == null) continue;
    t.pos += (t.speed * (t.delayed ? .5 : 1) * dt * t.dir) / t.len;
    if (t.pos >= 1) { t.pos = 1; t.dir = -1; }
    if (t.pos <= 0) { t.pos = 0; t.dir = 1; }
    const l = lineMeta[t.line];
    const dist = t.pos * t.len;
    let i = 0;
    while (i < l.arcs.length - 2 && l.arcs[i + 1] < dist) i++;
    const a = l.stations[i], b = l.stations[i + 1];
    const f = (dist - l.arcs[i]) / (l.arcs[i + 1] - l.arcs[i]);
    t.g.setAttribute('transform', 'translate(' + (a.x + (b.x - a.x) * f) + ' ' + (a.y + (b.y - a.y) * f) + ')');
  }
  requestAnimationFrame(tick);
}
requestAnimationFrame(tick);

async function showStation(name) {
  selectedName = name;
  for (const k in stationDots) {
    if (k.endsWith('-label')) stationDots[k].classList.toggle('hot', k === name + '-label');
  }
  try {
    const data = await api('/api/arrivals?station=' + encodeURIComponent(name));
    const panel = $('#stationPanel');
    if (!data.rows.length) { panel.innerHTML = '<p class="panel-hint">No live services for this station.</p>'; return; }
    panel.innerHTML = '<h3>' + name + '</h3>' +
      '<span class="chip" style="--c:' + data.rows[0].color + '">' + data.rows[0].line_name.toUpperCase() + '</span>' +
      data.rows.map(r =>
        '<div class="arr-row">' +
        '<span class="chip' + (r.delayed ? ' delayed' : '') + '" style="--c:' + r.color + '">' + r.train + '</span>' +
        '<span class="arr-eta mono">' + fmtEta(r.eta) + '</span>' +
        '<span class="mono" style="color:var(--muted);font-size:.72rem">' + (r.delayed ? '· delayed' : '→ ' + r.heading) + '</span>' +
        '<span class="arr-sub">AI confidence ' + r.confidence + '% · ' + (r.delayed ? 'DELAY RISK HIGH · headway re-sequenced' : 'on time · dwell nominal') + '</span>' +
        '</div>').join('');
  } catch (e) { offline(); }
}

/* ---------------- board / alerts / telemetry ---------------- */
async function refreshBoard() {
  try {
    const data = await api('/api/departures');
    $('#boardBody').innerHTML = data.rows.map(r =>
      '<div class="board-row' + (r.delayed ? ' is-delayed' : '') + '">' +
      '<span>' + r.train + '</span>' +
      '<span><span class="chip" style="--c:' + r.color + '">' + r.line_name.toUpperCase() + '</span></span>' +
      '<span>' + r.next + '</span>' +
      '<span style="color:var(--muted)">toward ' + r.dest + '</span>' +
      '<span class="eta">' + fmtEta(r.eta) + '</span>' +
      '<span class="status ' + (r.delayed ? 'late' : 'ok') + '">' + (r.delayed ? 'DELAYED +' + r.delay_min + ' MIN' : 'ON TIME') + '</span>' +
      '</div>').join('');
  } catch (e) { offline(); }
}
let lastTicker = '', lastAlertId = 0;
async function refreshAlerts() {
  try {
    const data = await api('/api/alerts');
    const msgs = data.alerts.map(a => a.message).join('|');
    if (msgs !== lastTicker) {
      lastTicker = msgs;
      const list = data.alerts.map(a => a.message);
      $('#ticker').innerHTML = list.concat(list).map(m => '<span>' + m + '</span>').join('');
    }
    for (const a of data.alerts) {
      if (a.id > lastAlertId && lastAlertId !== 0 && a.kind !== 'info')
        toast(a.message, a.kind === 'delay' ? 'warn' : 'good', (a.kind === 'delay' ? 'DELAY ALERT' : 'RECOVERY') + ' · ' + a.created_at.slice(11, 19));
      if (a.id > lastAlertId) lastAlertId = a.id;
    }
  } catch (e) { offline(); }
}
async function refreshTelemetry() {
  try {
    const t = await api('/api/telemetry');
    $('#mConf').textContent = t.conf + '%';
    $('#mErr').textContent = '±' + t.err + 's';
    $('#mRisk').textContent = t.risk;
    $('#barConf').style.width = t.conf + '%';
    $('#barErr').style.width = (t.err / 60 * 100) + '%';
    $('#barRisk').style.width = (t.risk * 100) + '%';
    $('#aiLog').innerHTML = t.log.map(r =>
      '<div>[' + r.created_at.slice(11, 19) + '] ' + r.train_id + ' ETA ' + r.station_name + ' ' + fmtEta(r.eta_min) + ' <b>conf ' + r.confidence + '%</b></div>').join('');
  } catch (e) { offline(); }
}

/* ---------------- nearby + planner ---------------- */
async function refreshNearby() {
  try {
    const d = await api('/api/nearby');
    $('#busList').innerHTML = d.bus.map(b =>
      '<li><span class="near-name">' + b.name + '</span><span class="near-meta mono">' + b.routes + '</span><span class="near-walk mono">' + b.walk_min + ' min walk</span></li>').join('');
    $('#railList').innerHTML = d.rail.map(r =>
      '<li><span class="near-name">' + r.name + '</span><span class="near-meta mono">' + r.info + ' · ' + r.distance_km + ' km</span><span class="near-walk mono">' + r.connection + '</span></li>').join('');
  } catch (e) { offline(); }
}
function loadSelects() {
  const fromSel = $('#fromSel'), toSel = $('#toSel');
  fromSel.innerHTML = ''; toSel.innerHTML = '';
  for (const id in lineMeta) {
    for (const target of [fromSel, toSel]) {
      const og = document.createElement('optgroup');
      og.label = lineMeta[id].name;
      lineMeta[id].stations.filter(s => !s.shared).forEach(s => {
        const o = document.createElement('option');
        o.value = s.name; o.textContent = s.name;
        og.appendChild(o);
      });
      target.appendChild(og);
    }
  }
  fromSel.value = 'Vastral Gam'; toSel.value = 'Motera Stadium';
}
$('#plannerForm').addEventListener('submit', async e => {
  e.preventDefault();
  const box = $('#planResults');
  try {
    const d = await api('/api/routes?from=' + encodeURIComponent($('#fromSel').value) + '&to=' + encodeURIComponent($('#toSel').value));
    if (d.error) { box.innerHTML = '<p class="section-sub">' + d.error + '</p>'; return; }
    if (!d.options.length) { box.innerHTML = '<p class="section-sub">You are already there — MetroMate approves of efficiency.</p>'; return; }
    lastPlan = { from: $('#fromSel').value, to: $('#toSel').value, options: d.options };
    box.innerHTML = d.options.map((o, i) =>
      '<div class="plan-card glass' + (i === 0 ? ' best' : '') + '">' +
      '<div class="plan-top"><span class="plan-title">Option ' + (i + 1) + ' · ' + o.title + '</span>' +
      '<span class="plan-badges">' + (i === 0 ? '<span class="ai-pick">AI PICK</span>' : '') + '<span>confidence ' + o.confidence + '%</span></span></div>' +
      '<div class="legs">' + o.legs.map((l, j) =>
        (j ? '<span class="leg-arrow">›</span>' : '') +
        '<span class="leg"><span class="chip" style="--c:' + l.color + '">' + l.mode + '</span>' + l.txt + '</span>').join('') + '</div>' +
      '<div class="plan-meta"><span>door-to-door <b>' + o.time.toFixed(0) + ' min</b></span>' +
      '<span>blended fare <b>₹' + o.fare + '</b></span></div>' +
      '<div class="plan-book"><button class="btn btn-pay" type="button" data-i="' + i + '">Book & pay · ₹' + o.fare + '</button></div></div>').join('');
    loadSaved();
  } catch (err) { offline(); }
});
$('#planResults').addEventListener('click', e => {
  const b = e.target.closest('.btn-pay');
  if (b) openPay(+b.dataset.i);
});

/* ---------------- booking + payment ---------------- */
let lastPlan = null, payIndex = 0, payMethod = 'card';
function openPay(i) {
  const o = lastPlan.options[i];
  payIndex = i;
  $('#paySummary').textContent = lastPlan.from + ' → ' + lastPlan.to + ' · ' + o.title;
  $('#payBtn').textContent = 'Pay ₹' + o.fare;
  $('#payErr').textContent = '';
  $('#ticketView').hidden = true;
  $('#payFormView').hidden = false;
  $('#guestEmailField').hidden = !!token();
  const u = localStorage.getItem('mm_user');
  if (u) { try { $('#payEmail').value = JSON.parse(u).email || ''; } catch (e) { /* ignore */ } }
  $('#payModal').hidden = false;
}
function setPayMethod(m) {
  payMethod = m;
  $('#tabCard').classList.toggle('active', m === 'card');
  $('#tabUpi').classList.toggle('active', m === 'upi');
  $('#cardFields').hidden = m !== 'card';
  $('#upiFields').hidden = m !== 'upi';
}
$('#tabCard').addEventListener('click', () => setPayMethod('card'));
$('#tabUpi').addEventListener('click', () => setPayMethod('upi'));
$('#cardNumber').addEventListener('input', e => {
  e.target.value = e.target.value.replace(/\D/g, '').slice(0, 16).replace(/(.{4})/g, '$1 ').trim();
});
$('#cardExpiry').addEventListener('input', e => {
  const v = e.target.value.replace(/\D/g, '').slice(0, 4);
  e.target.value = v.length > 2 ? v.slice(0, 2) + '/' + v.slice(2) : v;
});
$('#cardCvc').addEventListener('input', e => { e.target.value = e.target.value.replace(/\D/g, '').slice(0, 4); });
$('#payClose').addEventListener('click', () => { $('#payModal').hidden = true; });
$('#payModal').addEventListener('click', e => { if (e.target === e.currentTarget) $('#payModal').hidden = true; });

$('#payForm').addEventListener('submit', async e => {
  e.preventDefault();
  const err = $('#payErr');
  err.textContent = '';
  const o = lastPlan.options[payIndex];
  const body = { from: lastPlan.from, to: lastPlan.to, title: o.title, method: payMethod };
  if (payMethod === 'card')
    body.card = { number: $('#cardNumber').value, name: $('#cardName').value, expiry: $('#cardExpiry').value, cvc: $('#cardCvc').value };
  else body.upi = $('#upiId').value;
  if (!token()) body.email = $('#payEmail').value.trim();
  $('#payBtn').disabled = true;
  $('#payBtn').textContent = 'Processing…';
  try {
    const headers = { 'Content-Type': 'application/json' };
    if (token()) headers.Authorization = 'Bearer ' + token();
    const res = await fetch('/api/bookings', { method: 'POST', headers, body: JSON.stringify(body) });
    const d = await res.json();
    if (!res.ok) { err.textContent = d.error || 'Payment failed'; return; }
    renderTicket(d.ticket);
    toast('Ticket ' + d.ticket.code + ' confirmed — ' + d.ticket.payLabel, 'good', 'PAYMENT SUCCESS · ' + d.ticket.ref);
    loadTickets();
  } catch (er) {
    err.textContent = 'Backend unreachable — start it with: node server.js';
  } finally {
    $('#payBtn').disabled = false;
    $('#payBtn').textContent = 'Pay ₹' + o.fare;
  }
});
function qrCells(code) {
  let h = 2166136261;
  for (const ch of code) { h ^= ch.charCodeAt(0); h = Math.imul(h, 16777619) >>> 0; }
  let out = '';
  for (let i = 0; i < 441; i++) { h = (Math.imul(h, 1103515245) + 12345) >>> 0; out += '<i class="' + (h & 1 ? 'on' : '') + '"></i>'; }
  return out;
}
function renderTicket(t) {
  $('#payFormView').hidden = true;
  const v = $('#ticketView');
  v.hidden = false;
  v.innerHTML = '<div class="ticket">' +
    '<div class="ticket-top"><span class="ticket-code">' + t.code + '</span><span class="chip" style="--c:var(--green)">PAID</span></div>' +
    '<div class="ticket-route"><b>' + t.from + '</b> → <b>' + t.to + '</b>' +
    '<span class="mono" style="display:block;color:var(--muted);font-size:.76rem;margin-top:6px">' + t.title + '</span></div>' +
    '<div class="ticket-sep"></div>' +
    '<div class="ticket-bottom"><div class="qr">' + qrCells(t.code) + '</div>' +
    '<div class="ticket-meta"><span>amount <b>₹' + t.fare + '</b></span><span>via <b>' + t.payLabel + '</b></span>' +
    '<span>ref <b>' + t.ref + '</b></span><span>mail <b>' + t.email + '</b></span></div></div></div>' +
    '<p class="auth-note mono">Show this code at the AFC gate. Demo ticket — no real travel rights.</p>';
}
async function loadTickets() {
  const wrap = $('#ticketsWrap');
  if (!token()) { wrap.hidden = true; return; }
  try {
    const d = await api('/api/bookings');
    wrap.hidden = !d.bookings.length;
    $('#ticketsList').innerHTML = d.bookings.map(b =>
      '<li><span class="near-name">' + b.code + ' · ' + b.from_name + ' → ' + b.to_name + '</span>' +
      '<span class="near-meta mono">' + b.option_title + ' · ' + b.method + ' · ref ' + b.ref + '</span>' +
      '<span class="near-walk mono">₹' + b.fare + '</span></li>').join('');
  } catch (e) { wrap.hidden = true; }
}
async function loadSaved() {
  const wrap = $('#savedWrap');
  if (!token()) { wrap.hidden = true; return; }
  try {
    const d = await api('/api/journeys');
    wrap.hidden = !d.journeys.length;
    $('#savedList').innerHTML = d.journeys.map(j =>
      '<li><span class="near-name">' + j.from_name + ' → ' + j.to_name + '</span>' +
      '<span class="near-meta mono">' + j.best_option + ' · ' + j.best_time_min + ' min</span>' +
      '<span class="near-walk mono">' + j.created_at.slice(11, 16) + '</span></li>').join('');
  } catch (e) { wrap.hidden = true; }
}

/* ---------------- auth chip ---------------- */
async function refreshAuth() {
  const chip = $('#authChip');
  if (!token()) { chip.innerHTML = '<a href="auth.html">Sign in</a>'; return; }
  try {
    const d = await api('/api/auth/me');
    chip.innerHTML = '<span class="user-name">' + d.user.name + '</span><button class="signout" id="signout" type="button">Sign out</button>';
    $('#signout').addEventListener('click', async () => {
      await api('/api/auth/logout', { method: 'POST' }).catch(() => {});
      localStorage.removeItem('mm_token'); localStorage.removeItem('mm_user');
      location.replace('/');
    });
  } catch (e) {
    chip.innerHTML = '<a href="auth.html">Sign in</a>';
  }
}

/* ---------------- toasts, clock, reveals, counters ---------------- */
function toast(msg, kind, sub) {
  const box = $('#toasts');
  const d = document.createElement('div');
  d.className = 'toast ' + (kind || '');
  d.innerHTML = msg + (sub ? '<span class="mono">' + sub + '</span>' : '');
  box.appendChild(d);
  setTimeout(() => { d.classList.add('out'); setTimeout(() => d.remove(), 450); }, 6000);
  while (box.children.length > 3) box.firstChild.remove();
}
setInterval(() => { $('#clock').textContent = new Date().toLocaleTimeString('en-GB', { hour12: false }); }, 1000);

const io = new IntersectionObserver(es => es.forEach(en => {
  if (!en.isIntersecting) return;
  en.target.classList.add('in');
  if (en.target.classList.contains('stats')) runCounters(en.target);
  io.unobserve(en.target);
}), { threshold: .2 });
document.querySelectorAll('.reveal').forEach(n => io.observe(n));
io.observe($('.stats'));
function runCounters(scope) {
  scope.querySelectorAll('[data-count]').forEach(n => {
    const target = parseFloat(n.dataset.count), dec = +(n.dataset.decimals || 0);
    const pre = n.dataset.prefix || '', suf = n.dataset.suffix || '';
    const t0 = performance.now();
    (function step(t) {
      const k = Math.min(1, (t - t0) / 1400), e = 1 - (1 - k) ** 3;
      n.textContent = pre + (target * e).toFixed(dec) + suf;
      if (k < 1) requestAnimationFrame(step);
    })(t0);
  });
}

/* ---------------- boot ---------------- */
(async function boot() {
  if (!token()) { location.replace('/'); return; }
  try {
    await api('/api/auth/me');
  } catch (e) {
    if (!token()) { location.replace('/'); return; }
  }
  try {
    const state = await api('/api/state');
    buildMap(state);
    loadSelects();
    showStation('Gheekanta');
    offlineWarned = false;
  } catch (e) {
    offline();
    setTimeout(boot, 5000);
    return;
  }
  setInterval(async () => {
    try {
      const state = await api('/api/state');
      for (const t of state.trains) if (local[t.id])
        Object.assign(local[t.id], { dir: t.direction, pos: t.pos, delayed: t.delayed });
    } catch (e) { offline(); }
  }, 2000);
  refreshBoard(); setInterval(refreshBoard, 4000);
  refreshAlerts(); setInterval(refreshAlerts, 9000);
  refreshTelemetry(); setInterval(refreshTelemetry, 2600);
  refreshNearby();
  refreshAuth();
  loadSaved();
  loadTickets();
})();
