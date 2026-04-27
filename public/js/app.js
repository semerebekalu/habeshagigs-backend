const API = `${window.location.origin}/api`;

// ── Dark mode ──────────────────────────────────────────────
(function initDarkMode() {
    const saved = localStorage.getItem('eg_theme') || 'light';
    document.documentElement.setAttribute('data-theme', saved);
})();

function toggleDarkMode() {
    const current = document.documentElement.getAttribute('data-theme');
    const next = current === 'dark' ? 'light' : 'dark';
    document.documentElement.setAttribute('data-theme', next);
    localStorage.setItem('eg_theme', next);
    const btn = document.getElementById('darkToggle');
    if (btn) btn.textContent = next === 'dark' ? '☀️' : '🌙';
}

// ── Auth helpers ───────────────────────────────────────────
function getToken() { return localStorage.getItem('eg_token'); }
function getUser()  { try { return JSON.parse(localStorage.getItem('eg_user')); } catch { return null; } }
function setAuth(token, user) { localStorage.setItem('eg_token', token); localStorage.setItem('eg_user', JSON.stringify(user)); }
function clearAuth() { localStorage.removeItem('eg_token'); localStorage.removeItem('eg_user'); }
function isLoggedIn() { return !!getToken(); }

async function apiFetch(path, opts = {}) {
    const token = getToken();
    const headers = { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(opts.headers || {}) };
    const res = await fetch(API + path, { ...opts, headers });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw { status: res.status, ...data };
    return data;
}

// ── Toast ──────────────────────────────────────────────────
function toast(msg, type = '') {
    let container = document.getElementById('toastContainer');
    if (!container) {
        container = document.createElement('div');
        container.id = 'toastContainer';
        container.className = 'toast-container';
        document.body.appendChild(container);
    }
    const t = document.createElement('div');
    t.className = `toast ${type ? 'toast-' + type : ''}`;
    t.textContent = msg;
    container.appendChild(t);
    setTimeout(() => t.remove(), 3500);
}

// ── Time ago helper ────────────────────────────────────────
function timeAgo(dateStr) {
    if (!dateStr) return '';
    const diff = Date.now() - new Date(dateStr).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return 'just now';
    if (mins < 60) return `${mins}m ago`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `${hrs}h ago`;
    const days = Math.floor(hrs / 24);
    if (days < 7) return `${days}d ago`;
    return new Date(dateStr).toLocaleDateString();
}

// ── Nav state ──────────────────────────────────────────────
function updateNav() {
    const user = getUser();
    const loggedIn = isLoggedIn();
    const isFreelancerUser = loggedIn && user && (user.active_role === 'freelancer' || (user.role === 'freelancer' && !user.active_role));
    const isClientUser = loggedIn && user && (user.active_role === 'client' || user.role === 'client' || user.role === 'admin');

    document.querySelectorAll('.auth-only').forEach(el => el.classList.toggle('hidden', !loggedIn));
    document.querySelectorAll('.guest-only').forEach(el => el.classList.toggle('hidden', loggedIn));
    document.querySelectorAll('.admin-only').forEach(el => el.classList.toggle('hidden', !user || user.role !== 'admin'));
    document.querySelectorAll('.client-only').forEach(el => el.classList.toggle('hidden', !isClientUser));
    document.querySelectorAll('.freelancer-only').forEach(el => el.classList.toggle('hidden', !isFreelancerUser));

    // Add dark mode toggle to nav-actions if not already there
    const actions = document.querySelector('.nav-actions');
    if (actions && !document.getElementById('darkToggle')) {
        const btn = document.createElement('button');
        btn.id = 'darkToggle';
        btn.className = 'dark-toggle';
        btn.title = 'Toggle dark mode';
        btn.textContent = document.documentElement.getAttribute('data-theme') === 'dark' ? '☀️' : '🌙';
        btn.onclick = toggleDarkMode;
        actions.insertBefore(btn, actions.firstChild);
    }

    // Show verified badge in nav if user is verified
    if (loggedIn && user && user.id) {
        const actions = document.querySelector('.nav-actions');
        if (actions && !document.getElementById('navVerifiedBadge')) {
            const badge = document.createElement('span');
            badge.id = 'navVerifiedBadge';
            badge.className = 'verified-nav-badge hidden';
            badge.innerHTML = '✓ Verified';
            actions.insertBefore(badge, actions.firstChild);
        }
        apiFetch(`/kyc/status/${user.id}`).then(status => {
            const badge = document.getElementById('navVerifiedBadge');
            // Only show ✓ Verified badge for KYC-approved users, not just email-verified
            if (badge && status.kyc_status === 'approved') {
                badge.classList.remove('hidden');
            }
            const verifyLink = document.getElementById('navVerifyLink');
            if (verifyLink) {
                // Hide verify link if KYC approved or pending review
                if (status.kyc_status === 'approved' || status.kyc_status === 'pending') {
                    verifyLink.classList.add('hidden');
                } else {
                    verifyLink.classList.remove('hidden');
                }
            }
        }).catch(() => {});
    }
}

// ── Logout ─────────────────────────────────────────────────
document.getElementById('logoutBtn')?.addEventListener('click', async () => {
    try { await apiFetch('/auth/logout', { method: 'POST' }); } catch {}
    clearAuth();
    window.location.href = '/';
});

// ── Hamburger ──────────────────────────────────────────────
document.getElementById('hamburger')?.addEventListener('click', () => {
    let drawer = document.getElementById('mobileNavDrawer');
    if (!drawer) {
        // Build drawer from nav links dynamically
        drawer = document.createElement('div');
        drawer.id = 'mobileNavDrawer';
        drawer.className = 'mobile-nav-drawer';
        const navLinks = document.getElementById('navLinks');
        if (navLinks) {
            drawer.innerHTML = navLinks.innerHTML;
        }
        // Add auth actions
        const user = getUser();
        if (isLoggedIn()) {
            drawer.innerHTML += `<button onclick="document.getElementById('logoutBtn').click()">Logout</button>`;
        } else {
            drawer.innerHTML += `<a href="/login.html">Login</a><a href="/register.html">Register</a>`;
        }
        document.body.appendChild(drawer);
        // Close on outside click
        document.addEventListener('click', (e) => {
            if (!drawer.contains(e.target) && e.target.id !== 'hamburger') {
                drawer.classList.remove('open');
            }
        });
    }
    drawer.classList.toggle('open');
});

// ── Mobile sidebar toggle (dashboard) ─────────────────────
(function() {
    const sidebar = document.querySelector('.sidebar');
    if (!sidebar) return;
    const btn = document.createElement('button');
    btn.className = 'mobile-sidebar-toggle';
    btn.innerHTML = '☰';
    btn.title = 'Menu';
    btn.addEventListener('click', () => {
        sidebar.classList.toggle('mobile-open');
        btn.innerHTML = sidebar.classList.contains('mobile-open') ? '✕' : '☰';
    });
    // Close sidebar when a link is clicked on mobile
    sidebar.querySelectorAll('.sidebar-link').forEach(link => {
        link.addEventListener('click', () => {
            if (window.innerWidth <= 1024) {
                sidebar.classList.remove('mobile-open');
                btn.innerHTML = '☰';
            }
        });
    });
    document.body.appendChild(btn);
})();

// ── Notifications ──────────────────────────────────────────
async function loadNotifications() {
    const user = getUser();
    if (!user) return;
    try {
        const data = await apiFetch(`/notifications/${user.id}`);
        const badge = document.getElementById('notifBadge');
        if (badge) {
            badge.textContent = data.unreadCount;
            badge.classList.toggle('hidden', data.unreadCount === 0);
        }
        const list = document.getElementById('notifList');
        if (list) {
            list.innerHTML = data.notifications.slice(0, 10).map(n => `
                <div class="notif-item ${n.is_read ? '' : 'unread'}" onclick="markRead(${n.id})">
                    <strong>${n.title}</strong>
                    <small style="display:block;margin-top:2px;color:var(--muted);">${n.message}</small>
                    <small style="color:#94a3b8;font-size:0.72rem;">${timeAgo(n.created_at)}</small>
                </div>
            `).join('') || '<div class="notif-item"><small>No notifications yet</small></div>';
        }
    } catch {}
}

async function markRead(id) {
    await apiFetch(`/notifications/read/${id}`, { method: 'POST' });
    loadNotifications();
}

async function markAllRead() {
    await apiFetch('/notifications/read-all', { method: 'POST' });
    loadNotifications();
    document.getElementById('notifPanel')?.classList.add('hidden');
}

document.getElementById('notifBell')?.addEventListener('click', () => {
    const panel = document.getElementById('notifPanel');
    panel?.classList.toggle('hidden');
    loadNotifications();
});

// ── Hero search ────────────────────────────────────────────
function heroSearch() {
    const q = document.getElementById('heroSearch')?.value;
    if (!q) return;
    const user = getUser();
    const isFreelancer = user && (user.active_role === 'freelancer' || user.role === 'freelancer');
    if (isFreelancer) {
        window.location.href = `/marketplace.html?keyword=${encodeURIComponent(q)}&view=jobs`;
    } else {
        window.location.href = `/marketplace.html?keyword=${encodeURIComponent(q)}`;
    }
}
document.getElementById('heroSearch')?.addEventListener('keydown', e => { if (e.key === 'Enter') heroSearch(); });

// ── Featured freelancers ───────────────────────────────────
async function loadFeatured() {
    const container = document.getElementById('featuredFreelancers');
    if (!container) return;
    try {
        const freelancers = await apiFetch('/marketplace?min_rating=4');
        container.innerHTML = freelancers.slice(0, 4).map(renderFreelancerCard).join('') || '<p class="text-center">No freelancers yet.</p>';
    } catch {
        container.innerHTML = '<p class="text-center">Could not load freelancers.</p>';
    }
}

function renderFreelancerCard(f) {
    const avatar = `https://ui-avatars.com/api/?name=${encodeURIComponent(f.full_name)}&background=1E3A8A&color=fff&size=80`;
    const level = f.reputation_level || 'bronze';
    return `
        <div class="freelancer-card" onclick="window.location='/profile.html?id=${f.id}'">
            <div class="fc-header">
                <img class="fc-avatar" src="${avatar}" alt="${f.full_name}" />
                <div>
                    <div class="fc-name">${f.full_name}</div>
                    <div class="fc-title">${f.title || 'Freelancer'}</div>
                </div>
            </div>
            <div class="fc-badges">
                ${f.kyc_status === 'approved' ? '<span class="badge badge-verified">✓ Verified</span>' : ''}
                <span class="badge badge-${level}">${level.charAt(0).toUpperCase() + level.slice(1)}</span>
            </div>
            <div class="fc-rating">⭐ ${parseFloat(f.avg_rating || 0).toFixed(1)} · ${f.completion_rate || 0}% completion</div>
            <div class="fc-footer">
                <span class="fc-rate">${f.hourly_rate ? f.hourly_rate + ' ETB/hr' : 'Negotiable'}</span>
                <button class="btn btn-sm btn-teal">View Profile</button>
            </div>
        </div>
    `;
}

// ── Admin stats ────────────────────────────────────────────
async function loadAdminStats() {
    try {
        const stats = await apiFetch('/admin/stats');
        if (document.getElementById('statUsers')) document.getElementById('statUsers').textContent = (stats.total_users || 0).toLocaleString() + '+';
        if (document.getElementById('statJobs')) document.getElementById('statJobs').textContent = (stats.active_jobs || 0).toLocaleString() + '+';
    } catch {}
}

// ── Init ───────────────────────────────────────────────────
updateNav();
loadFeatured();
if (isLoggedIn()) {
    loadAdminStats();
    loadNotifications();
}
