/**
 * Ethio Gigs — Real-Time Notifications Dashboard
 * Shared component loaded on every page.
 * Requires: app.js (apiFetch, getToken, getUser, toast)
 */

(function () {
    'use strict';

    // ── State ──────────────────────────────────────────────
    let _notifications  = [];
    let _unreadCount    = 0;
    let _activeCategory = sessionStorage.getItem('notif_cat') || 'all';
    let _offset         = 0;
    let _hasMore        = true;
    let _loading        = false;
    let _prefsOpen      = false;
    let _socket         = null;
    let _soundEnabled   = localStorage.getItem('notif_sound') !== 'false';
    let _desktopEnabled = localStorage.getItem('notif_desktop') !== 'false';
    let _pollTimer      = null;

    // ── Category config ────────────────────────────────────
    const CATEGORIES = [
        { id: 'all',      label: 'All',      icon: '🔔' },
        { id: 'jobs',     label: 'Jobs',     icon: '💼' },
        { id: 'payments', label: 'Payments', icon: '💰' },
        { id: 'messages', label: 'Messages', icon: '💬' },
        { id: 'system',   label: 'System',   icon: '⚙️' },
        { id: 'admin',    label: 'Admin',    icon: '🛡️' },
    ];

    // ── Event-type → navigation URL ───────────────────────
    const NAV_MAP = {
        proposal_accepted:   '/dashboard.html#contracts',
        work_submitted:      '/dashboard.html#contracts',
        milestone_overdue:   '/dashboard.html#contracts',
        new_proposal:        '/dashboard.html#proposals',
        payment_released:    '/dashboard.html#wallet',
        withdrawal_approved: '/dashboard.html#wallet',
        withdrawal_rejected: '/dashboard.html#wallet',
        referral_reward:     '/dashboard.html#subscription',
        topup_confirmed:     '/dashboard.html#wallet',
        kyc_approved:        '/verify.html',
        kyc_rejected:        '/verify.html',
        contract_signed:     '/dashboard.html#contracts',
        contract_completed:  '/dashboard.html#contracts',
        dispute_raised:      '/dashboard.html#disputes',
        dispute_resolved:    '/dashboard.html#disputes',
        new_message:         '/chat.html',
    };

    // ── Category icons ─────────────────────────────────────
    const EVENT_ICONS = {
        proposal_accepted: '🎉', work_submitted: '📦', milestone_overdue: '⏰',
        new_proposal: '📩', payment_released: '💰', withdrawal_approved: '✅',
        withdrawal_rejected: '❌', referral_reward: '🎁', topup_confirmed: '💳',
        kyc_approved: '✅', kyc_rejected: '❌', contract_signed: '✍️',
        contract_completed: '🏆', dispute_raised: '⚖️', dispute_resolved: '✅',
        new_message: '💬', admin_action: '🛡️', suspension: '⚠️', ban: '🚫',
        platform_update: '📢',
    };

    // ── Relative time ──────────────────────────────────────
    function relativeTime(dateStr) {
        const diff = Date.now() - new Date(dateStr).getTime();
        const s = Math.floor(diff / 1000);
        if (s < 60)  return 'just now';
        const m = Math.floor(s / 60);
        if (m < 60)  return `${m}m ago`;
        const h = Math.floor(m / 60);
        if (h < 24)  return `${h}h ago`;
        const d = Math.floor(h / 24);
        if (d < 7)   return `${d}d ago`;
        return new Date(dateStr).toLocaleDateString();
    }

    // ── Build panel HTML ───────────────────────────────────
    function buildPanel() {
        const user = (typeof getUser === 'function') ? getUser() : null;
        const isAdmin = user?.role === 'admin';

        const catButtons = CATEGORIES
            .filter(c => c.id !== 'admin' || isAdmin)
            .map(c => `
                <button class="notif-cat-btn${c.id === _activeCategory ? ' active' : ''}"
                        data-cat="${c.id}" aria-label="Filter: ${c.label}">
                    ${c.label}
                    <span class="notif-cat-count" id="notif-cat-count-${c.id}">0</span>
                </button>`).join('');

        return `
        <div id="notifPanel" class="notif-panel hidden" role="dialog" aria-label="Notifications" aria-modal="true">
            <div class="notif-header">
                <h4>🔔 Notifications</h4>
                <div class="notif-header-actions">
                    <button onclick="NotifCenter.markAllRead()" title="Mark all as read">✓ All read</button>
                    <button onclick="NotifCenter.clearAll()" title="Clear all">🗑 Clear</button>
                    <button class="notif-settings-btn" onclick="NotifCenter.togglePrefs()" title="Preferences">⚙️</button>
                </div>
            </div>
            <div class="notif-cats" role="tablist" aria-label="Notification categories">
                ${catButtons}
            </div>
            <div class="notif-list" id="notifList" role="list" aria-live="polite" aria-atomic="false">
                <div class="notif-empty"><div class="notif-empty-icon">🔔</div><p>Loading...</p></div>
            </div>
            <div class="notif-load-more" id="notifLoadMore" style="display:none;">
                <button onclick="NotifCenter.loadMore()" id="notifLoadMoreBtn">Load more</button>
            </div>
            <div class="notif-prefs" id="notifPrefs">
                <h5>⚙️ Notification Preferences</h5>
                <div class="notif-pref-row">
                    <div class="notif-pref-label">🔊 Sound<small>Play sound on new notification</small></div>
                    <label class="notif-toggle"><input type="checkbox" id="notifSoundToggle" ${_soundEnabled ? 'checked' : ''} onchange="NotifCenter.toggleSound(this.checked)"><span class="notif-toggle-slider"></span></label>
                </div>
                <div class="notif-pref-row">
                    <div class="notif-pref-label">🖥️ Desktop alerts<small>Show browser notifications</small></div>
                    <label class="notif-toggle"><input type="checkbox" id="notifDesktopToggle" ${_desktopEnabled ? 'checked' : ''} onchange="NotifCenter.toggleDesktop(this.checked)"><span class="notif-toggle-slider"></span></label>
                </div>
                <div style="margin-top:10px;font-size:.75rem;color:var(--muted);font-weight:600;text-transform:uppercase;letter-spacing:.05em;">Categories (in-app)</div>
                <div id="notifCatPrefs"></div>
            </div>
        </div>`;
    }

    // ── Render notification item ───────────────────────────
    function renderItem(n) {
        const icon = EVENT_ICONS[n.event_type] || '🔔';
        const time = relativeTime(n.created_at);
        const unreadClass = n.is_read ? '' : ' unread';
        const dot = n.is_read ? '' : '<div class="notif-unread-dot" aria-label="Unread"></div>';
        const readBtn = n.is_read
            ? `<button onclick="NotifCenter.markUnread(${n.id},event)" title="Mark unread">◉</button>`
            : `<button onclick="NotifCenter.markRead(${n.id},event)" title="Mark read">✓</button>`;
        return `
        <div class="notif-item${unreadClass}" id="notif-item-${n.id}" role="listitem"
             onclick="NotifCenter.clickNotif(${n.id},'${n.event_type}')"
             tabindex="0" aria-label="${n.title}">
            <div class="notif-item-icon" aria-hidden="true">${icon}</div>
            <div class="notif-item-body">
                <div class="notif-item-title">${escapeHtml(n.title)}</div>
                <div class="notif-item-msg">${escapeHtml(n.message || '')}</div>
                <div class="notif-item-time">${time}</div>
            </div>
            <div class="notif-item-actions">
                ${readBtn}
            </div>
            ${dot}
        </div>`;
    }

    function escapeHtml(str) {
        return String(str || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
    }

    // ── Render list ────────────────────────────────────────
    function renderList() {
        const list = document.getElementById('notifList');
        if (!list) return;
        const filtered = _activeCategory === 'all'
            ? _notifications
            : _notifications.filter(n => n.category === _activeCategory);

        if (!filtered.length) {
            list.innerHTML = `<div class="notif-empty"><div class="notif-empty-icon">🔔</div><p>No notifications${_activeCategory !== 'all' ? ' in this category' : ' yet'}</p></div>`;
        } else {
            list.innerHTML = filtered.map(renderItem).join('');
        }

        // Load more button
        const lm = document.getElementById('notifLoadMore');
        if (lm) lm.style.display = _hasMore ? 'block' : 'none';
    }

    // ── Update badge ───────────────────────────────────────
    function updateBadge(count) {
        _unreadCount = count;
        const badge = document.getElementById('notifBadge');
        if (!badge) return;
        if (count > 0) {
            badge.textContent = count > 99 ? '99+' : count;
            badge.classList.remove('hidden');
        } else {
            badge.classList.add('hidden');
        }
    }

    // ── Update category counts ─────────────────────────────
    function updateCatCounts(counts) {
        for (const [cat, cnt] of Object.entries(counts)) {
            const el = document.getElementById(`notif-cat-count-${cat}`);
            if (el) el.textContent = cnt > 0 ? cnt : '';
        }
    }

    // ── Load notifications ─────────────────────────────────
    async function load(reset = false) {
        if (_loading) return;
        _loading = true;
        if (reset) { _offset = 0; _notifications = []; _hasMore = true; }

        try {
            const url = `/api/notifications?limit=20&offset=${_offset}&category=${_activeCategory}`;
            const data = await apiFetch(url);
            if (reset) {
                _notifications = data.notifications;
            } else {
                _notifications = [..._notifications, ...data.notifications];
            }
            _offset = _notifications.length;
            _hasMore = data.has_more;
            updateBadge(data.unread_count);
            updateCatCounts(data.category_counts || {});
            renderList();
        } catch (err) {
            const list = document.getElementById('notifList');
            if (list && reset) {
                list.innerHTML = `<div class="notif-empty"><div class="notif-empty-icon">⚠️</div><p>Failed to load. <button onclick="NotifCenter.reload()" style="color:var(--teal);background:none;border:none;cursor:pointer;font-weight:600;">Retry</button></p></div>`;
            }
        } finally {
            _loading = false;
        }
    }

    // ── Load unread count only (for badge on non-dashboard pages) ──
    async function loadCount() {
        try {
            const data = await apiFetch('/api/notifications/unread-count');
            updateBadge(data.count);
        } catch {}
    }

    // ── Load category preferences ──────────────────────────
    async function loadCatPrefs() {
        const container = document.getElementById('notifCatPrefs');
        if (!container) return;
        try {
            const prefs = await apiFetch('/api/notifications/preferences');
            const user = (typeof getUser === 'function') ? getUser() : null;
            const isAdmin = user?.role === 'admin';
            const cats = ['jobs', 'payments', 'messages', 'system'];
            if (isAdmin) cats.push('admin');
            container.innerHTML = cats.map(cat => `
                <div class="notif-pref-row">
                    <div class="notif-pref-label">${CATEGORIES.find(c=>c.id===cat)?.icon} ${cat.charAt(0).toUpperCase()+cat.slice(1)}</div>
                    <label class="notif-toggle">
                        <input type="checkbox" ${prefs[cat]?.in_app !== false ? 'checked' : ''}
                               onchange="NotifCenter.saveCatPref('${cat}',this.checked)">
                        <span class="notif-toggle-slider"></span>
                    </label>
                </div>`).join('');
        } catch {}
    }

    // ── Socket.io setup ────────────────────────────────────
    function connectSocket() {
        const token = (typeof getToken === 'function') ? getToken() : null;
        if (!token || typeof io === 'undefined') {
            // Fallback: poll every 30s
            _pollTimer = setInterval(loadCount, 30000);
            return;
        }
        try {
            _socket = io({ auth: { token }, reconnectionDelay: 1000, reconnectionDelayMax: 10000 });

            _socket.on('notification:new', (notif) => {
                // Prepend to list
                const enriched = { ...notif, is_read: false, category: guessCategory(notif.eventType || notif.event_type), created_at: new Date().toISOString() };
                _notifications.unshift(enriched);
                updateBadge(_unreadCount + 1);
                renderList();

                // Ring bell
                const bell = document.getElementById('notifBell');
                if (bell) { bell.classList.add('ringing'); setTimeout(() => bell.classList.remove('ringing'), 600); }

                // Sound
                if (_soundEnabled) playSound();

                // Desktop notification
                if (_desktopEnabled) showDesktopNotif(notif.title, notif.message);

                // Animate first item
                const firstItem = document.querySelector('.notif-item');
                if (firstItem) firstItem.classList.add('new-arrival');
            });

            _socket.on('disconnect', () => {
                if (!_pollTimer) _pollTimer = setInterval(loadCount, 30000);
            });
            _socket.on('connect', () => {
                if (_pollTimer) { clearInterval(_pollTimer); _pollTimer = null; }
            });
        } catch (e) {
            _pollTimer = setInterval(loadCount, 30000);
        }
    }

    function guessCategory(eventType) {
        const map = {
            proposal_accepted:'jobs', work_submitted:'jobs', milestone_overdue:'jobs', new_proposal:'jobs',
            payment_released:'payments', withdrawal_approved:'payments', withdrawal_rejected:'payments',
            referral_reward:'payments', topup_confirmed:'payments',
            new_message:'messages',
            kyc_approved:'system', kyc_rejected:'system', contract_signed:'system',
            contract_completed:'system', dispute_raised:'system', dispute_resolved:'system',
            admin_action:'admin', suspension:'admin', ban:'admin', platform_update:'admin',
        };
        return map[eventType] || 'system';
    }

    // ── Sound ──────────────────────────────────────────────
    function playSound() {
        try {
            const audio = new Audio('/sounds/notification.mp3');
            audio.volume = 0.4;
            audio.play().catch(() => {});
        } catch {}
    }

    // ── Desktop notification ───────────────────────────────
    function showDesktopNotif(title, body) {
        if (!('Notification' in window) || Notification.permission !== 'granted') return;
        if (!document.hidden) return; // only when tab is not active
        try {
            new Notification(title, { body: (body || '').substring(0, 80), icon: '/favicon.ico' });
        } catch {}
    }

    // ── Public API ─────────────────────────────────────────
    window.NotifCenter = {
        init() {
            // Inject panel HTML into body
            if (!document.getElementById('notifPanel')) {
                const div = document.createElement('div');
                div.innerHTML = buildPanel();
                document.body.appendChild(div.firstElementChild);
            }

            // Wire up bell click
            const bell = document.getElementById('notifBell');
            if (bell) {
                bell.style.cursor = 'pointer';
                bell.setAttribute('aria-label', 'Notifications');
                bell.setAttribute('role', 'button');
                bell.setAttribute('tabindex', '0');
                bell.onclick = () => this.toggle();
                bell.onkeydown = (e) => { if (e.key === 'Enter' || e.key === ' ') this.toggle(); };
            }

            // Category filter clicks
            document.addEventListener('click', (e) => {
                const btn = e.target.closest('.notif-cat-btn');
                if (btn) {
                    _activeCategory = btn.dataset.cat;
                    sessionStorage.setItem('notif_cat', _activeCategory);
                    document.querySelectorAll('.notif-cat-btn').forEach(b => b.classList.toggle('active', b.dataset.cat === _activeCategory));
                    renderList();
                }
                // Close panel on outside click
                const panel = document.getElementById('notifPanel');
                if (panel && !panel.classList.contains('hidden')) {
                    if (!panel.contains(e.target) && !document.getElementById('notifBell')?.contains(e.target)) {
                        panel.classList.add('hidden');
                    }
                }
            });

            // Load initial count
            loadCount();

            // Connect socket
            connectSocket();

            // Refresh timestamps every minute
            setInterval(() => {
                document.querySelectorAll('.notif-item-time').forEach((el, i) => {
                    if (_notifications[i]) el.textContent = relativeTime(_notifications[i].created_at);
                });
            }, 60000);
        },

        toggle() {
            const panel = document.getElementById('notifPanel');
            if (!panel) return;
            const isHidden = panel.classList.contains('hidden');
            panel.classList.toggle('hidden');
            if (isHidden) {
                load(true);
                // Focus first item for accessibility
                setTimeout(() => {
                    const first = panel.querySelector('.notif-item, button');
                    if (first) first.focus();
                }, 100);
            }
        },

        reload() { load(true); },
        loadMore() { if (_hasMore && !_loading) load(false); },

        async markRead(id, e) {
            if (e) e.stopPropagation();
            try {
                await apiFetch(`/api/notifications/${id}/read`, { method: 'PATCH' });
                const n = _notifications.find(x => x.id === id);
                if (n) { n.is_read = true; updateBadge(Math.max(0, _unreadCount - 1)); renderList(); }
            } catch {}
        },

        async markUnread(id, e) {
            if (e) e.stopPropagation();
            try {
                await apiFetch(`/api/notifications/${id}/unread`, { method: 'PATCH' });
                const n = _notifications.find(x => x.id === id);
                if (n) { n.is_read = false; updateBadge(_unreadCount + 1); renderList(); }
            } catch {}
        },

        async markAllRead() {
            try {
                await apiFetch('/api/notifications/mark-all-read', { method: 'PATCH' });
                _notifications.forEach(n => n.is_read = true);
                updateBadge(0);
                renderList();
                if (typeof toast === 'function') toast('All notifications marked as read', 'success');
            } catch {}
        },

        async clearAll() {
            if (!confirm('Clear all notifications? This cannot be undone.')) return;
            try {
                await apiFetch('/api/notifications/clear-all', { method: 'DELETE' });
                _notifications = [];
                _offset = 0;
                _hasMore = false;
                updateBadge(0);
                renderList();
                if (typeof toast === 'function') toast('Notifications cleared', 'success');
            } catch {}
        },

        clickNotif(id, eventType) {
            this.markRead(id, null);
            const url = NAV_MAP[eventType];
            if (url) {
                const panel = document.getElementById('notifPanel');
                if (panel) panel.classList.add('hidden');
                // If same page, just switch tab
                if (url.startsWith('/dashboard.html#') && window.location.pathname.includes('dashboard')) {
                    const tab = url.split('#')[1];
                    if (typeof showTab === 'function') showTab(tab);
                } else {
                    window.location.href = url;
                }
            }
        },

        togglePrefs() {
            _prefsOpen = !_prefsOpen;
            const prefs = document.getElementById('notifPrefs');
            if (prefs) {
                prefs.classList.toggle('open', _prefsOpen);
                if (_prefsOpen) loadCatPrefs();
            }
        },

        toggleSound(enabled) {
            _soundEnabled = enabled;
            localStorage.setItem('notif_sound', enabled);
        },

        toggleDesktop(enabled) {
            _desktopEnabled = enabled;
            localStorage.setItem('notif_desktop', enabled);
            if (enabled && 'Notification' in window && Notification.permission === 'default') {
                Notification.requestPermission().then(perm => {
                    if (perm === 'denied') {
                        _desktopEnabled = false;
                        localStorage.setItem('notif_desktop', false);
                        const toggle = document.getElementById('notifDesktopToggle');
                        if (toggle) toggle.checked = false;
                        if (typeof toast === 'function') toast('Desktop notifications blocked by browser', 'error');
                    }
                });
            }
        },

        async saveCatPref(category, enabled) {
            try {
                await apiFetch('/api/notifications/preferences', {
                    method: 'PUT',
                    body: JSON.stringify({ category, in_app_enabled: enabled, email_enabled: enabled })
                });
            } catch {}
        }
    };

    // ── Auto-init when DOM ready ───────────────────────────
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => {
            if (typeof getToken === 'function' && getToken()) NotifCenter.init();
        });
    } else {
        if (typeof getToken === 'function' && getToken()) NotifCenter.init();
    }
})();
