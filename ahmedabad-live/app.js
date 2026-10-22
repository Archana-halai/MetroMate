'use strict';
/* Ahmedabad LIVE — dashboard logic
   Live Leaflet map on real coordinates · AI route cards · QR/UPI/Card payments */

// ---- origin guard: the app only works when served by `node server.js` ----
(function originGuard() {
  const p = location.port, h = location.hostname;
  const wrong = location.protocol === 'file:' ||
    ((h === 'localhost' || h === '127.0.0.1') && p && p !== '3000');
  if (!wrong) return;
  document.addEventListener('DOMContentLoaded', () => {
    const d = document.createElement('div');
    d.style.cssText = 'position:fixed;inset:0;z-index:99999;background:rgba(7,11,20,.97);display:flex;align-items:center;justify-content:center;padding:24px';
    d.innerHTML = `<div style="max-width:560px;border:1px solid #ff5470;border-radius:18px;padding:30px;font-family:Consolas,monospace;color:#e8eefb;line-height:1.7">
      <h2 style="color:#ff5470;margin:0 0 12px">⚠ Opened the wrong way</h2>
      <p style="margin:0 0 12px">This page was opened from <b style="color:#ffb454">${location.protocol}//${location.host || location.pathname.slice(0, 40)}</b> — but the planner, live map and payments only work through the Node backend.</p>
      <p style="margin:0 0 8px">Fix in 3 steps:</p>
      <ol style="margin:0 0 12px;padding-left:22px">
        <li>In VS Code terminal (<b>Ctrl+\`</b>), open folder <b>ahmedabad-live</b></li>
        <li>Run: <b style="color:#3ddc97">node server.js</b></li>
        <li>Browse to: <b style="color:#4cc3ff">http://localhost:3000</b></li>
      </ol>
      <p style="margin:0;font-size:.8rem;opacity:.7">Do NOT double-click index.html and do NOT use the Live Server extension (port 5500).</p>
    </div>`;
    document.body.appendChild(d);
  });
})();

const $ = s => document.querySelector(s);
const $$ = s => [...document.querySelectorAll(s)];
const token = () => localStorage.getItem('ahl_token');
const POLL_MS = 2500;

async function api(path, opts = {}) {
  const headers = Object.assign({ 'Content-Type': 'application/json' }, opts.headers || {});
  const t = token();
  if (t) headers.Authorization = 'Bearer ' + t;
  const res = await fetch(path, Object.assign({}, opts, { headers }));
  if (res.status === 401 && !path.startsWith('/api/auth')) {
    localStorage.removeItem('ahl_token'); localStorage.removeItem('ahl_user');
    location.replace('/');
    throw new Error('session expired');
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) { const e = new Error(data.error || ('HTTP ' + res.status)); e.status = res.status; throw e; }
  return data;
}

function toast(msg, kind = '', sub = '') {
  const el = document.createElement('div');
  el.className = 'toast ' + kind;
  el.innerHTML = msg + (sub ? '<span class="mono">' + sub + '</span>' : '');
  $('#toasts').appendChild(el);
  setTimeout(() => { el.classList.add('out'); setTimeout(() => el.remove(), 450); }, 4200);
}

// ---------------- clock ----------------
setInterval(() => { $('#clock').textContent = new Date().toLocaleTimeString('en-IN', { hour12: false }); }, 1000);

// ---------------- geometry (client mirror of server) ----------------
function havKm(a, b) {
  const R = 6371, toR = Math.PI / 180;
  const dLat = (b[0] - a[0]) * toR, dLng = (b[1] - a[1]) * toR;
  const s = Math.sin(dLat / 2) ** 2 + Math.cos(a[0] * toR) * Math.cos(b[0] * toR) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(s));
}
function lineGeom(L) {
  if (L._cum) return L;
  const cum = [0];
  for (let i = 1; i < L.polyline.length; i++) cum.push(cum[i - 1] + havKm(L.polyline[i - 1], L.polyline[i]));
  L._cum = cum; L._len = cum[cum.length - 1];
  return L;
}
function posAt(L, d) {
  lineGeom(L);
  d = Math.max(0, Math.min(L._len, d));
  let i = 1;
  while (i < L._cum.length - 1 && L._cum[i] < d) i++;
  const t = (d - L._cum[i - 1]) / ((L._cum[i] - L._cum[i - 1]) || 1);
  const a = L.polyline[i - 1], b = L.polyline[i];
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
}

// ---------------- live map ----------------
let map = null, vehLayer = {}, stLayer = {}, lineIndex = {}, animStart = 0, animFrom = {};
let gmapLoaded = false;

function buildMap(state) {
  if (map) { updateVehicles(state); return; }
  map = L.map('leafletMap', { zoomControl: true, attributionControl: true }).setView([23.037, 72.572], 13);
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19,
    attribution: '&copy; OpenStreetMap contributors · real Ahmedabad geography'
  }).addTo(map);

  for (const L2 of state.lines) {
    lineIndex[L2.id] = L2;
    L.polyline(L2.polyline, { color: L2.color, weight: 13, opacity: .14 }).addTo(map);
    L.polyline(L2.polyline, {
      color: L2.color, weight: L2.mode === 'metro' ? 5 : 4, opacity: .9,
      dashArray: L2.mode === 'bus' ? '2 8' : (L2.mode === 'brts' ? '10 6' : null)
    }).addTo(map);
    for (const s of L2.stations) {
      if (stLayer[s.id]) continue;
      const m = L.circleMarker([s.lat, s.lng], {
        radius: s.interchange ? 7.5 : 5,
        color: s.interchange ? '#ffffff' : L2.color,
        weight: s.interchange ? 3 : 2.5,
        fillColor: s.interchange ? '#ffffff' : '#0b1120',
        fillOpacity: 1
      }).addTo(map);
      m.bindPopup(`<b>${s.name}</b><br>${L2.name} · ${s.area}<br><span style="opacity:.7">click for live departures</span>`);
      m.on('click', () => loadStationPanel(s.id));
      stLayer[s.id] = m;
    }
  }
  // legend
  $('#mapLegend').innerHTML = state.lines.map(l =>
    `<span class="legend-item" style="--c:${l.color}"><i></i>${l.name.split('(')[0].trim()}</span>`
  ).join('') + '<span class="legend-item" style="--c:#fff"><i class="dot"></i>interchange</span>';

  updateVehicles(state);
  map.fitBounds([[23.015, 72.552], [23.062, 72.598]], { padding: [12, 12] });
}

function updateVehicles(state) {
  animFrom = {};
  for (const v of state.vehicles) {
    const L2 = lineIndex[v.lineId];
    if (!L2) continue;
    const pos = posAt(L2, v.dist);
    if (!vehLayer[v.id]) {
      const icon = L.divIcon({
        className: 'veh-marker', iconSize: [26, 26],
        html: `<span class="veh${v.delayed ? ' delayed' : ''}" style="--c:${L2.color}">${L2.glyph}</span>`
      });
      vehLayer[v.id] = L.marker(pos, { icon, interactive: false }).addTo(map);
      animFrom[v.id] = pos;
    } else {
      animFrom[v.id] = vehLayer[v.id].getLatLng();
      const el = vehLayer[v.id].getElement && vehLayer[v.id].getElement();
      if (el) {
        const dot = el.querySelector('.veh');
        if (dot) { dot.classList.toggle('delayed', v.delayed); dot.style.setProperty('--c', L2.color); }
      }
      vehLayer[v.id]._target = pos;
    }
  }
  animStart = performance.now();
}

function animTick(now) {
  if (map) {
    const t = Math.min(1, (now - animStart) / POLL_MS);
    for (const id in vehLayer) {
      const m = vehLayer[id];
      if (!m._target) continue;
      const a = animFrom[id] || m.getLatLng();
      m.setLatLng([a.lat + (m._target[0] - a.lat) * t, a.lng + (m._target[1] - a.lng) * t]);
    }
  }
  requestAnimationFrame(animTick);
}
requestAnimationFrame(animTick);

// Google Maps view toggle
$('#tabLeaflet').addEventListener('click', () => {
  $('#tabLeaflet').classList.add('active'); $('#tabGmap').classList.remove('active');
  $('#mapView').hidden = false; $('#gmapView').hidden = true;
  if (map) setTimeout(() => map.invalidateSize(), 60);
});
$('#tabGmap').addEventListener('click', () => {
  $('#tabGmap').classList.add('active'); $('#tabLeaflet').classList.remove('active');
  $('#mapView').hidden = true; $('#gmapView').hidden = false;
  if (!gmapLoaded) { $('#gmapFrame').src = $('#gmapFrame').dataset.src; gmapLoaded = true; }
});

// ---------------- station panel + board ----------------
function depRow(d) {
  return `<div class="dep-row">
    <span class="dep-glyph" style="--c:${d.color}">${d.glyph}</span>
    <span class="dep-dest">${d.turnback ? 'via ' + d.dest + ' (returning)' : '→ ' + d.dest}</span>
    <span class="dep-eta ${d.delayed ? 'late' : ''}">${d.eta_min < 1 ? '&lt;1' : Math.round(d.eta_min)} min<small>${d.delayed ? 'DELAYED' : 'ON TIME'}</small></span>
    <span class="dep-sub">${d.line.split('(')[0].trim()} · vehicle ${d.vehicle} · ${d.delayed ? 'running slow' : 'nominal'}</span>
  </div>`;
}
async function loadStationPanel(id) {
  const panel = $('#mapPanel');
  try {
    const d = await api('/api/departures?station=' + encodeURIComponent(id));
    panel.innerHTML = `<h3>${d.station.name} <span class="chip" style="--c:${d.station.color}">${d.station.mode.toUpperCase()}</span></h3>
      <p class="dep-sub mono" style="margin:-6px 0 4px">${d.station.area} · ${d.station.line}</p>
      ${d.departures.length ? d.departures.map(depRow).join('') : '<p class="panel-hint">No vehicles on approach.</p>'}`;
  } catch { /* keep previous */ }
}
async function loadBoard() {
  const id = $('#boardStation').value;
  if (!id) return;
  try {
    const d = await api('/api/departures?station=' + encodeURIComponent(id));
    $('#boardList').innerHTML = d.departures.length
      ? d.departures.map(depRow).join('')
      : '<p class="panel-hint">No vehicles on approach.</p>';
  } catch { /* offline */ }
}

// ---------------- ticker ----------------
let tickerSig = '';
function renderTicker(alerts) {
  const sig = alerts.map(a => a.message).join('|');
  if (sig === tickerSig) return;
  tickerSig = sig;
  const html = alerts.map(a => `<span>${a.message}</span>`).join('');
  $('#tickerTrack').innerHTML = html + html;
}

// ---------------- planner ----------------
let allStations = [], lastOptions = [];

function fillSelects(list) {
  const areas = {};
  for (const s of list) (areas[s.area] = areas[s.area] || []).push(s);
  const modeTag = { metro: 'METRO', brts: 'BRTS', bus: 'AMTS' };
  const build = sel => {
    sel.innerHTML = Object.keys(areas).sort().map(a =>
      `<optgroup label="${a}">` + areas[a].map(s =>
        `<option value="${s.id}">${s.name} · ${modeTag[s.mode]}</option>`).join('') + '</optgroup>'
    ).join('');
  };
  build($('#planFrom')); build($('#planTo')); build($('#boardStation'));
  $('#planFrom').value = 'red-4';   // Naranpura (Metro Red)
  $('#planTo').value = 'blue-8';    // Kalupur (Metro Blue)
  $('#boardStation').value = 'brts-0';
  loadBoard();
}

function legHtml(l) {
  if (l.type === 'walk') {
    return `<span class="leg walk">🚶 ${Math.max(1, Math.round(l.minutes))} min · ${l.km} km — ${l.from} → ${l.to}</span>`;
  }
  return `<span class="leg"><span class="chip" style="--c:${l.color}">${l.glyph} ${l.mode.toUpperCase()}</span>${l.from} → ${l.to} · ${l.stops} stop${l.stops > 1 ? 's' : ''} · ${Math.round(l.minutes)} min</span>`;
}

function renderOptions(opts) {
  lastOptions = opts;
  if (!opts.length) { $('#planResults').innerHTML = '<p class="panel-hint">No route found between these points.</p>'; return; }
  $('#planResults').innerHTML = opts.map((o, i) => `
    <article class="plan-card glass ${o.best ? 'best' : ''}">
      <div class="plan-top">
        <div class="plan-title">${o.label} — ${o.fromName} → ${o.toName}</div>
        <div class="plan-badges">
          ${o.best ? '<span class="ai-pick">AI PICK</span>' : ''}
          ${o.value ? '<span class="value-pick">BEST FARE</span>' : ''}
          <span>⏱ ${o.minutes} min</span><span>₹${o.fare}</span>
        </div>
      </div>
      <div class="legs">${o.legs.map(legHtml).join('<span class="leg-arrow">›</span>')}</div>
      <div class="plan-meta">
        <span>ride <b>${o.rideKm} km</b></span>
        <span>walk <b>${o.walkKm} km</b></span>
        <span>transfers <b>${o.transfers}</b></span>
        <a class="gmaps-btn" target="_blank" rel="noopener" href="${o.googleUrl}">google maps directions ↗</a>
      </div>
      <div class="plan-book">
        <button class="btn btn-pay" type="button" data-i="${i}">Book & pay · ₹${o.fare}</button>
      </div>
    </article>`).join('');
  $$('#planResults .btn-pay').forEach(b => b.addEventListener('click', () => openPay(+b.dataset.i, b)));
}

$('#plannerForm').addEventListener('submit', async e => {
  e.preventDefault();
  const from = $('#planFrom').value, to = $('#planTo').value;
  if (from === to) { toast('Pick two different stations', 'warn'); return; }
  $('#planResults').innerHTML = '<p class="panel-hint">Searching every corridor…</p>';
  try {
    const opts = await api(`/api/routes?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`);
    renderOptions(opts);
    if (opts.length) toast(`AI ranked ${opts.length} routes — fastest: <b>${opts[0].minutes} min · ₹${opts[0].fare}</b>`, 'good', opts[0].label);
  } catch (err) { toast('Planner error: ' + err.message, 'bad'); }
});

// ---------------- payment ----------------
let payOpt = null, qrTicket = null;

function setPayTab(which) {
  $('#tabQR').classList.toggle('active', which === 'qr');
  $('#tabCard').classList.toggle('active', which === 'card');
  $('#tabUPI').classList.toggle('active', which === 'upi');
  $('#paneQR').hidden = which !== 'qr';
  $('#paneCard').hidden = which !== 'card';
  $('#paneUPI').hidden = which !== 'upi';
}
$('#tabQR').addEventListener('click', () => setPayTab('qr'));
$('#tabCard').addEventListener('click', () => setPayTab('card'));
$('#tabUPI').addEventListener('click', () => setPayTab('upi'));

function showTicket(t) {
  $('#payFlow').hidden = true;
  const v = $('#ticketView');
  v.hidden = false;
  v.innerHTML = `
    <div class="ticket">
      <div class="ticket-top">
        <span class="ticket-code">${t.code}</span>
        <span class="ticket-status ${t.status === 'paid' ? '' : 'pending'}">${t.status === 'paid' ? 'PAID ✓' : 'AWAITING PAYMENT'}</span>
      </div>
      <div class="ticket-route"><b>${t.from}</b> → <b>${t.to}</b></div>
      <div class="ticket-sep"></div>
      <div class="ticket-bottom">
        <div class="qr-mini" id="qrMini"></div>
        <div class="ticket-meta">
          <span>modes <b>${t.modes}</b></span>
          <span>journey <b>${t.minutes} min</b></span>
          <span>fare <b>₹${t.fare}</b> · ${t.method.toUpperCase()}</span>
          <span>issued <b>${new Date(t.created_at).toLocaleString('en-IN')}</b></span>
        </div>
      </div>
    </div>
    <button class="btn btn-primary" style="width:100%;margin-top:16px" id="ticketDone" type="button">Done</button>`;
  if (window.QRCode) {
    new QRCode($('#qrMini'), { text: t.upi_link || ('AHL-TICKET:' + t.code), width: 84, height: 84, correctLevel: QRCode.CorrectLevel.M });
  }
  $('#ticketDone').addEventListener('click', closePay);
  loadTickets();
}

async function openPay(i) {
  payOpt = lastOptions[i];
  if (!payOpt) return;
  qrTicket = null;
  $('#payFlow').hidden = false;
  $('#ticketView').hidden = true;
  $('#payErr').textContent = '';
  $('#payRoute').textContent = `${payOpt.label} · ${payOpt.fromName} → ${payOpt.toName} · ${payOpt.minutes} min`;
  $('#payFare').textContent = payOpt.fare;
  $$('.pay-fare-mirror').forEach(el => el.textContent = payOpt.fare);
  setPayTab('qr');
  $('#qrBox').innerHTML = '<p class="panel-hint">Generating UPI QR…</p>';
  $('#qrUpiLink').textContent = '';
  $('#payModal').hidden = false;
  try {
    const r = await api('/api/bookings', {
      method: 'POST',
      body: JSON.stringify({ from: $('#planFrom').value, to: $('#planTo').value, sig: payOpt.sig, method: 'qr' })
    });
    qrTicket = r.ticket;
    const box = $('#qrBox');
    box.innerHTML = '';
    if (window.QRCode) {
      new QRCode(box, { text: qrTicket.upi_link, width: 188, height: 188, correctLevel: QRCode.CorrectLevel.M });
    } else {
      box.innerHTML = '<p class="qr-hint">QR library unavailable offline — use the UPI link below or pay by Card/UPI tab.</p>';
    }
    $('#qrUpiLink').textContent = qrTicket.upi_link;
  } catch (e) {
    $('#qrBox').innerHTML = '<p class="qr-hint">Could not create QR booking: ' + e.message + '</p>';
  }
}

$('#qrPaidBtn').addEventListener('click', async () => {
  if (!qrTicket) return;
  const btn = $('#qrPaidBtn');
  btn.disabled = true; btn.textContent = 'Verifying payment…';
  try {
    const r = await api('/api/bookings/confirm', { method: 'POST', body: JSON.stringify({ code: qrTicket.code }) });
    toast('QR payment confirmed — ticket issued!', 'good', r.ticket.code);
    showTicket(r.ticket);
  } catch (e) { toast('Confirm failed: ' + e.message, 'bad'); }
  btn.disabled = false; btn.textContent = "I've scanned & paid ✓ (demo confirm)";
});

function closePay() { $('#payModal').hidden = true; }
$('#payClose').addEventListener('click', closePay);
$('#payModal').addEventListener('click', e => { if (e.target === $('#payModal')) closePay(); });

// card input formatters
$('#cardNum').addEventListener('input', e => {
  e.target.value = e.target.value.replace(/\D/g, '').slice(0, 16).replace(/(.{4})/g, '$1 ').trim();
});
$('#cardExp').addEventListener('input', e => {
  let v = e.target.value.replace(/\D/g, '').slice(0, 4);
  e.target.value = v.length > 2 ? v.slice(0, 2) + '/' + v.slice(2) : v;
});
$('#cardCvc').addEventListener('input', e => { e.target.value = e.target.value.replace(/\D/g, '').slice(0, 4); });

$('#paneCard').addEventListener('submit', async e => {
  e.preventDefault();
  $('#payErr').textContent = '';
  const btn = e.target.querySelector('button'); btn.disabled = true;
  try {
    const r = await api('/api/bookings', {
      method: 'POST',
      body: JSON.stringify({
        from: $('#planFrom').value, to: $('#planTo').value, sig: payOpt.sig, method: 'card',
        card: { number: $('#cardNum').value, exp: $('#cardExp').value, cvc: $('#cardCvc').value, name: $('#cardName').value }
      })
    });
    toast('Card payment successful', 'good', r.ticket.code);
    showTicket(r.ticket);
  } catch (err) {
    $('#payErr').textContent = err.message;
    if (err.status === 402) toast('Payment declined by bank', 'bad', 'try card 4242 4242 4242 4242');
  }
  btn.disabled = false;
});

$('#paneUPI').addEventListener('submit', async e => {
  e.preventDefault();
  $('#payErr').textContent = '';
  const btn = e.target.querySelector('button'); btn.disabled = true;
  try {
    const r = await api('/api/bookings', {
      method: 'POST',
      body: JSON.stringify({ from: $('#planFrom').value, to: $('#planTo').value, sig: payOpt.sig, method: 'upi', upi: { id: $('#upiId').value.trim() } })
    });
    toast('UPI collect request fulfilled', 'good', r.ticket.code);
    showTicket(r.ticket);
  } catch (err) { $('#payErr').textContent = err.message; }
  btn.disabled = false;
});

// ---------------- tickets ----------------
async function loadTickets() {
  try {
    const list = await api('/api/bookings');
    const sec = $('#tickets');
    if (!list.length) { sec.hidden = true; return; }
    sec.hidden = false;
    $('#ticketsWrap').innerHTML = list.map(t => `
      <div class="mini-ticket glass">
        <span class="mono">${t.code}</span>
        <span><b>${t.from}</b> → <b>${t.to}</b></span>
        <span class="mono">${t.modes} · ${t.minutes} min · ₹${t.fare} · ${t.method.toUpperCase()}</span>
        ${t.status === 'paid'
          ? '<span class="ticket-status">PAID ✓</span>'
          : `<button class="btn btn-pay" data-code="${t.code}" type="button">Confirm QR payment</button>`}
      </div>`).join('');
    $$('#ticketsWrap .btn-pay').forEach(b => b.addEventListener('click', async () => {
      try {
        await api('/api/bookings/confirm', { method: 'POST', body: JSON.stringify({ code: b.dataset.code }) });
        toast('Ticket paid', 'good', b.dataset.code);
        loadTickets();
      } catch (e) { toast(e.message, 'bad'); }
    }));
  } catch { /* signed-out races */ }
}

// ---------------- auth chip ----------------
function refreshAuth() {
  let u = null;
  try { u = JSON.parse(localStorage.getItem('ahl_user') || 'null'); } catch { }
  const chip = $('#authChip');
  if (u) {
    chip.innerHTML = `<span class="user-name">👤 ${u.name}</span><button class="signout" type="button">sign out</button>`;
    chip.querySelector('.signout').addEventListener('click', async () => {
      try { await api('/api/auth/logout', { method: 'POST' }); } catch { }
      localStorage.removeItem('ahl_token'); localStorage.removeItem('ahl_user');
      location.replace('/');
    });
  } else {
    chip.innerHTML = '<a href="/">Sign in</a>';
  }
}

// ---------------- reveal + counters ----------------
const io = new IntersectionObserver(es => es.forEach(e => { if (e.isIntersecting) e.target.classList.add('in'); }), { threshold: .12 });
$$('.reveal').forEach(el => io.observe(el));
$$('[data-count]').forEach(el => {
  const target = +el.dataset.count;
  const io2 = new IntersectionObserver(es => {
    if (!es[0].isIntersecting) return;
    io2.disconnect();
    const t0 = performance.now();
    (function step(t) {
      const k = Math.min(1, (t - t0) / 1100);
      el.textContent = Math.round(target * (1 - Math.pow(1 - k, 3)));
      if (k < 1) requestAnimationFrame(step);
    })(t0);
  }, { threshold: .4 });
  io2.observe(el);
});

// ---------------- pollers ----------------
async function pollState() {
  try {
    const s = await api('/api/state');
    buildMap(s);
    renderTicker(s.alerts);
    $('#sysStatus').classList.remove('offline');
    $('#sysStatus').innerHTML = '<i class="pulse"></i>LIVE';
  } catch {
    $('#sysStatus').classList.add('offline');
    $('#sysStatus').innerHTML = '<i class="pulse"></i>OFFLINE';
  }
}
async function pollTelemetry() {
  try {
    const t = await api('/api/telemetry');
    $('#statOnTime').textContent = t.onTimePct;
  } catch { }
}

// ---------------- boot ----------------
(async function boot() {
  if (!token()) { location.replace('/'); return; }
  try { await api('/api/auth/me'); } catch (e) { if (!token()) return; }
  try {
    allStations = await api('/api/stations');
    fillSelects(allStations);
    await pollState();
  } catch {
    toast('Backend unreachable — is <b>node server.js</b> running?', 'bad');
    setTimeout(boot, 5000);
    return;
  }
  refreshAuth();
  loadTickets();
  setInterval(pollState, POLL_MS);
  setInterval(pollTelemetry, 5000);
  setInterval(() => {
    if ($('#boardStation').value) loadBoard();
  }, 5000);
  // auto-plan the signature journey on first load
  $('#plannerForm').dispatchEvent(new Event('submit', { cancelable: true, bubbles: true }));
})();
