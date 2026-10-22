'use strict';
const $ = s => document.querySelector(s);
let mode = 'login';

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
    localStorage.setItem('mm_token', data.token);
    localStorage.setItem('mm_user', JSON.stringify(data.user));
    location.href = 'map.html';
  } catch {
    err.textContent = 'Backend unreachable — start it with: node server.js';
  }
});

(async () => {
  const t = localStorage.getItem('mm_token');
  if (!t) return;
  try {
    const r = await fetch('/api/auth/me', { headers: { Authorization: 'Bearer ' + t } });
    if (r.ok) location.replace('map.html');
    else { localStorage.removeItem('mm_token'); localStorage.removeItem('mm_user'); }
  } catch { /* backend offline — stay on login */ }
})();
