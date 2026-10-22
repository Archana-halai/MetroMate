'use strict';
const $ = s => document.querySelector(s);
let mode = 'login';

// ---- origin guard: login only works when served by `node server.js` ----
(function originGuard() {
  const p = location.port, h = location.hostname;
  const wrong = location.protocol === 'file:' ||
    ((h === 'localhost' || h === '127.0.0.1') && p && p !== '3000');
  if (!wrong) return;
  const d = document.createElement('div');
  d.style.cssText = 'position:fixed;inset:0;z-index:99999;background:rgba(7,11,20,.97);display:flex;align-items:center;justify-content:center;padding:24px';
  d.innerHTML = `<div style="max-width:560px;border:1px solid #ff5470;border-radius:18px;padding:30px;font-family:Consolas,monospace;color:#e8eefb;line-height:1.7">
    <h2 style="color:#ff5470;margin:0 0 12px">⚠ Opened the wrong way</h2>
    <p style="margin:0 0 12px">This page was opened from <b style="color:#ffb454">${location.protocol}//${location.host || location.pathname.slice(0, 40)}</b> — sign-up/sign-in needs the Node backend.</p>
    <p style="margin:0 0 8px">Fix in 3 steps:</p>
    <ol style="margin:0 0 12px;padding-left:22px">
      <li>In VS Code terminal (<b>Ctrl+\`</b>), open folder <b>ahmedabad-live</b></li>
      <li>Run: <b style="color:#3ddc97">node server.js</b></li>
      <li>Browse to: <b style="color:#4cc3ff">http://localhost:3000</b></li>
    </ol>
    <p style="margin:0;font-size:.8rem;opacity:.7">Do NOT double-click index.html/auth.html and do NOT use the Live Server extension (port 5500).</p>
  </div>`;
  (document.body || document.documentElement).appendChild(d);
})();

function setMode(m) {
  mode = m;
  $('#tabLogin').classList.toggle('active', m === 'login');
  $('#tabSignup').classList.toggle('active', m === 'signup');
  $('#nameField').hidden = m !== 'signup';
  $('#authSubmit').textContent = m === 'login' ? 'Sign in' : 'Create account';
  $('#password').autocomplete = m === 'login' ? 'current-password' : 'new-password';
  $('#authErr').textContent = '';
}
$('#tabLogin').addEventListener('click', () => setMode('login'));
$('#tabSignup').addEventListener('click', () => setMode('signup'));

$('#authForm').addEventListener('submit', async e => {
  e.preventDefault();
  const err = $('#authErr');
  err.textContent = '';
  const payload = {
    email: $('#email').value.trim(),
    password: $('#password').value
  };
  if (mode === 'signup') payload.name = $('#name').value.trim();
  try {
    const res = await fetch('/api/auth/' + mode, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    const data = await res.json();
    if (!res.ok) { err.textContent = data.error || 'Something went wrong'; return; }
    localStorage.setItem('ahl_token', data.token);
    localStorage.setItem('ahl_user', JSON.stringify(data.user));
    location.href = 'index.html';
  } catch {
    err.textContent = 'Backend unreachable — start it with: node server.js';
  }
});

// already signed in? skip straight to the dashboard
(async () => {
  const t = localStorage.getItem('ahl_token');
  if (!t) return;
  try {
    const r = await fetch('/api/auth/me', { headers: { Authorization: 'Bearer ' + t } });
    if (r.ok) location.replace('index.html');
    else { localStorage.removeItem('ahl_token'); localStorage.removeItem('ahl_user'); }
  } catch { /* backend offline — stay on login */ }
})();
