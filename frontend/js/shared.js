/* ══ DRIVEHAUS — ADMIN SHARED JS ════════════════════════════════════════════ */

const BACKEND = 'https://drivehaus.onrender.com';

// Every admin page calls e.g. GET('/bookings'), GET('/cars'), GET('/stats').
// shared.js prepends /api/admin so they resolve to the correct backend routes.
const API = BACKEND + '/api/admin';

/* ── Auth ────────────────────────────────────────────────────────────────── */
function getToken() { return sessionStorage.getItem('dh_admin_token') || ''; }

/* ── API CLIENT ──────────────────────────────────────────────────────────── */
async function api(path, opts = {}) {
  const res = await fetch(API + path, {
    headers: { 'Content-Type': 'application/json', 'x-admin-token': getToken() },
    ...opts,
  });
  if (res.status === 401) {
    sessionStorage.removeItem('dh_admin_token');
    window.location.href = '/admin';
    throw new Error('Session expired');
  }
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
  return data;
}

const GET    = (p)       => api(p);
const POST   = (p, body) => api(p, { method: 'POST',   body: JSON.stringify(body) });
const PUT    = (p, body) => api(p, { method: 'PUT',    body: JSON.stringify(body) });
const PATCH  = (p, body) => api(p, { method: 'PATCH',  body: JSON.stringify(body) });
const DELETE = (p)       => api(p, { method: 'DELETE' });

/* ── TOAST ───────────────────────────────────────────────────────────────── */
function toast(title, msg = '', type = 'success') {
  let c = document.getElementById('toast-container');
  if (!c) { c = document.createElement('div'); c.id = 'toast-container'; document.body.appendChild(c); }
  const el = document.createElement('div');
  el.className = `toast ${type}`;
  const icons = { success: '✓', error: '✕', info: 'ℹ' };
  el.innerHTML = `<div class="toast-icon">${icons[type]||'•'}</div>
    <div><div class="toast-title">${title}</div>${msg ? `<div class="toast-msg">${msg}</div>` : ''}</div>`;
  c.appendChild(el);
  setTimeout(() => { el.style.opacity = '0'; setTimeout(() => el.remove(), 400); }, 3800);
}

/* ── MODALS ──────────────────────────────────────────────────────────────── */
function openModal(id)  { document.getElementById(id)?.classList.add('open'); }
function closeModal(id) { document.getElementById(id)?.classList.remove('open'); }
document.addEventListener('click', e => {
  if (e.target.classList.contains('modal-overlay')) e.target.classList.remove('open');
});

/* ── FORMAT HELPERS ──────────────────────────────────────────────────────── */
function fmtDate(str) {
  if (!str) return '—';
  return new Date(str).toLocaleDateString('en-IN', { day:'2-digit', month:'short', year:'numeric' });
}
function fmtDateTime(str) {
  if (!str) return '—';
  return new Date(str).toLocaleString('en-IN', { day:'2-digit', month:'short', year:'numeric', hour:'2-digit', minute:'2-digit' });
}
function fmtCurrency(n) {
  return '$' + (+n || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
function timeSince(str) {
  if (!str) return '';
  const diff = Date.now() - new Date(str).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1)  return 'just now';
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}
function statusBadge(status) {
  const map = {
    active:    ['badge-green', '● Active'],
    returned:  ['badge-muted', '✓ Returned'],
    cancelled: ['badge-red',   '✕ Cancelled'],
  };
  const [cls, label] = map[status] || ['badge-muted', status];
  return `<span class="badge ${cls}">${label}</span>`;
}
function availBadge(isAvailable) {
  return isAvailable
    ? `<span class="badge badge-green">● Available</span>`
    : `<span class="badge badge-red">● Rented</span>`;
}

/* ── CAR SVG DRAWINGS ────────────────────────────────────────────────────── */
function carSVG(car) {
  const c   = car.svg_color   || car.svgColor   || '#aaa';
  const acc = car.accent_color || car.accentColor || '#c9a84c';
  const svgs = {
    'C001':`<svg viewBox="0 0 280 120" fill="none"><ellipse cx="140" cy="108" rx="130" ry="6" fill="rgba(0,0,0,0.4)"/><path d="M20 80 L35 60 L60 42 L100 36 L180 36 L220 44 L255 60 L260 80 Z" fill="${c}" opacity="0.95"/><path d="M60 42 L70 28 L110 20 L175 20 L205 36 L180 36 L100 36 Z" fill="${c}"/><path d="M62 42 L72 29 L112 21 L174 21 L203 36" stroke="${acc}" stroke-width="1.5" fill="none" opacity="0.6"/><path d="M68 40 L78 26 L113 22 L113 40 Z" fill="rgba(100,160,220,0.35)"/><path d="M116 22 L175 22 L200 36 L116 40 Z" fill="rgba(100,160,220,0.35)"/><path d="M30 72 L255 72" stroke="${acc}" stroke-width="1" opacity="0.4"/><circle cx="70" cy="90" r="20" fill="#111" stroke="${acc}" stroke-width="2"/><circle cx="70" cy="90" r="12" fill="#222"/><circle cx="70" cy="90" r="4" fill="${acc}"/><circle cx="205" cy="90" r="20" fill="#111" stroke="${acc}" stroke-width="2"/><circle cx="205" cy="90" r="12" fill="#222"/><circle cx="205" cy="90" r="4" fill="${acc}"/><path d="M252 64 L260 68 L258 74 L248 72 Z" fill="${acc}" opacity="0.9"/></svg>`,
    'C002':`<svg viewBox="0 0 280 120" fill="none"><ellipse cx="140" cy="108" rx="128" ry="6" fill="rgba(0,0,0,0.4)"/><path d="M18 78 L32 58 L58 40 L105 34 L182 34 L222 44 L258 62 L260 80 Z" fill="${c}" opacity="0.95"/><path d="M58 40 L65 24 L108 18 L178 18 L210 34 L182 34 L105 34 Z" fill="${c}"/><path d="M66 39 L75 24 L110 20 L110 39 Z" fill="rgba(120,170,230,0.35)"/><path d="M113 20 L177 20 L207 35 L113 39 Z" fill="rgba(120,170,230,0.35)"/><path d="M25 70 L255 70" stroke="${acc}" stroke-width="1.2" opacity="0.35"/><circle cx="68" cy="90" r="21" fill="#0f0f0f" stroke="${acc}" stroke-width="2"/><circle cx="68" cy="90" r="13" fill="#1a1a1a"/><circle cx="68" cy="90" r="5" fill="${acc}"/><circle cx="207" cy="90" r="21" fill="#0f0f0f" stroke="${acc}" stroke-width="2"/><circle cx="207" cy="90" r="13" fill="#1a1a1a"/><circle cx="207" cy="90" r="5" fill="${acc}"/><path d="M254 62 L262 67 L260 74 L250 72 Z" fill="${acc}" opacity="0.9"/></svg>`,
    'C003':`<svg viewBox="0 0 280 130" fill="none"><ellipse cx="140" cy="116" rx="125" ry="7" fill="rgba(0,0,0,0.45)"/><path d="M22 88 L22 52 L35 38 L245 38 L258 52 L258 88 Z" fill="${c}" opacity="0.95"/><path d="M35 38 L38 22 L242 22 L245 38 Z" fill="${c}" opacity="0.9"/><rect x="45" y="18" width="190" height="4" fill="${acc}" opacity="0.5" rx="1"/><rect x="42" y="25" width="60" height="28" rx="2" fill="rgba(100,140,100,0.3)"/><rect x="112" y="25" width="60" height="28" rx="2" fill="rgba(100,140,100,0.3)"/><rect x="182" y="25" width="52" height="28" rx="2" fill="rgba(100,140,100,0.3)"/><rect x="22" y="78" width="236" height="10" fill="#1a1a1a" stroke="${acc}" stroke-width="1" opacity="0.7"/><circle cx="72" cy="99" r="24" fill="#111" stroke="${acc}" stroke-width="2.5"/><circle cx="72" cy="99" r="15" fill="#1d1d1d"/><circle cx="72" cy="99" r="6" fill="${acc}"/><circle cx="208" cy="99" r="24" fill="#111" stroke="${acc}" stroke-width="2.5"/><circle cx="208" cy="99" r="15" fill="#1d1d1d"/><circle cx="208" cy="99" r="6" fill="${acc}"/></svg>`,
    'C004':`<svg viewBox="0 0 280 120" fill="none"><ellipse cx="140" cy="110" rx="130" ry="6" fill="rgba(0,0,0,0.4)"/><path d="M18 82 L25 58 L50 42 L95 36 L185 36 L225 44 L255 62 L258 82 Z" fill="${c}" opacity="0.95"/><path d="M50 42 L58 26 L100 20 L182 20 L218 36 L185 36 L95 36 Z" fill="${c}"/><path d="M62 38 L68 26 L110 22 L110 38 Z" fill="rgba(80,130,200,0.28)"/><rect x="115" y="22" width="95" height="16" rx="2" fill="rgba(80,130,200,0.22)"/><path d="M24 68 L255 68" stroke="${acc}" stroke-width="1.5" opacity="0.4"/><circle cx="72" cy="92" r="22" fill="#0a0a0a" stroke="${acc}" stroke-width="2.5"/><circle cx="72" cy="92" r="14" fill="#1a1a1a"/><circle cx="72" cy="92" r="4" fill="${acc}"/><circle cx="208" cy="92" r="22" fill="#0a0a0a" stroke="${acc}" stroke-width="2.5"/><circle cx="208" cy="92" r="14" fill="#1a1a1a"/><circle cx="208" cy="92" r="4" fill="${acc}"/></svg>`,
    'C005':`<svg viewBox="0 0 280 120" fill="none"><ellipse cx="140" cy="108" rx="128" ry="6" fill="rgba(0,0,0,0.35)"/><path d="M22 80 L35 56 L62 38 L108 32 L178 32 L222 42 L255 58 L258 80 Z" fill="${c}" opacity="0.92"/><path d="M62 38 L70 22 L115 16 L175 16 L208 32 L178 32 L108 32 Z" fill="${c}"/><path d="M28 68 L255 68" stroke="${acc}" stroke-width="1" opacity="0.35"/><circle cx="70" cy="90" r="21" fill="#0d0d0d" stroke="${acc}" stroke-width="2"/><circle cx="70" cy="90" r="17" fill="#161616"/><circle cx="70" cy="90" r="5" fill="${acc}" opacity="0.9"/><circle cx="207" cy="90" r="21" fill="#0d0d0d" stroke="${acc}" stroke-width="2"/><circle cx="207" cy="90" r="17" fill="#161616"/><circle cx="207" cy="90" r="5" fill="${acc}" opacity="0.9"/></svg>`,
    'C006':`<svg viewBox="0 0 280 120" fill="none"><ellipse cx="140" cy="110" rx="130" ry="6" fill="rgba(0,0,0,0.5)"/><path d="M18 80 L28 62 L55 48 L90 36 L190 34 L230 44 L255 58 L260 80 Z" fill="${c}" opacity="0.95"/><path d="M90 36 L95 20 L175 18 L210 30 L190 34 Z" fill="${c}"/><path d="M90 58 L255 58" stroke="${acc}" stroke-width="2.5" opacity="0.5"/><path d="M28 70 L256 70" stroke="${acc}" stroke-width="1.5" opacity="0.4"/><circle cx="75" cy="92" r="23" fill="#0a0a0a" stroke="${acc}" stroke-width="2.5"/><circle cx="75" cy="92" r="15" fill="#1a1a1a"/><circle cx="75" cy="92" r="5" fill="${acc}"/><circle cx="210" cy="92" r="23" fill="#0a0a0a" stroke="${acc}" stroke-width="2.5"/><circle cx="210" cy="92" r="15" fill="#1a1a1a"/><circle cx="210" cy="92" r="5" fill="${acc}"/></svg>`,
  };
  return svgs[car.id] || svgs[car.carId] || `<svg viewBox="0 0 280 120"><text x="140" y="70" text-anchor="middle" fill="${c}" font-size="60">🚗</text></svg>`;
}

/* ── SIDEBAR ─────────────────────────────────────────────────────────────── */
function renderSidebar(activePage) {
  return `
  <aside class="sidebar" id="sidebar">
    <div class="sidebar-logo">
      <div class="sidebar-logo-text">DRIVE<span>HAUS</span></div>
      <div class="sidebar-logo-sub">Admin Panel</div>
    </div>
    <nav class="sidebar-nav">
      <div class="nav-section-label">Overview</div>
      <a class="nav-link${activePage==='dashboard'?' active':''}" href="/pages/dashboard.html"><span class="icon">◈</span> Dashboard</a>
      <div class="nav-section-label">Operations</div>
      <a class="nav-link${activePage==='fleet'?' active':''}" href="/pages/fleet.html"><span class="icon">🚗</span> Fleet</a>
      <a class="nav-link${activePage==='bookings'?' active':''}" href="/pages/bookings.html"><span class="icon">📋</span> Bookings</a>
      <a class="nav-link${activePage==='customers'?' active':''}" href="/pages/customers.html"><span class="icon">👥</span> Customers</a>
      <div class="nav-section-label">System</div>
      <a class="nav-link${activePage==='activity'?' active':''}" href="/pages/activity.html"><span class="icon">⚡</span> Activity Log</a>
      <div class="nav-section-label">Site</div>
      <a class="nav-link" href="/" target="_blank"><span class="icon">🌍</span> Public Site ↗</a>
    </nav>
    <div class="sidebar-footer" style="display:flex;justify-content:space-between;align-items:center">
      <span><span class="status-dot"></span>Online</span>
      <button onclick="adminLogout()" style="font-family:var(--font-mono);font-size:.58rem;letter-spacing:.08em;text-transform:uppercase;color:var(--muted);cursor:pointer;border:none;background:none;transition:color .2s" onmouseover="this.style.color='var(--red)'" onmouseout="this.style.color='var(--muted)'">Logout</button>
    </div>
  </aside>`;
}

function adminLogout() {
  sessionStorage.removeItem('dh_admin_token');
  window.location.href = '/admin';
}

// Auth guard — runs on every admin page except the login page itself
(function immediateGuard() {
  const path = window.location.pathname;
  if (path === '/admin' || path === '/admin.html') return;
  if (!sessionStorage.getItem('dh_admin_token')) {
    window.location.replace('/admin');
  }
})();