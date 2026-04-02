/* ═══════════════════════════════════════════════
   Epoch Dash — Dashboard Application
   SPA Router, API Client, and All Views
   ═══════════════════════════════════════════════ */

// ── API Client ──
const API = {
    base: window.location.origin + '/api',
    token: localStorage.getItem('tt_token'),

    async request(method, path, body) {
        const opts = {
            method,
            headers: { 'Content-Type': 'application/json' }
        };
        if (this.token) opts.headers['Authorization'] = `Bearer ${this.token}`;
        if (body) opts.body = JSON.stringify(body);

        const res = await fetch(`${this.base}${path}`, opts);
        if (res.status === 401) { App.logout(); throw new Error('Session expired'); }
        const data = res.headers.get('content-type')?.includes('json') ? await res.json() : await res.text();
        if (!res.ok) throw new Error(data.error || 'Request failed');
        return data;
    },

    get(path) { return this.request('GET', path); },
    post(path, body) { return this.request('POST', path, body); },
    put(path, body) { return this.request('PUT', path, body); },
    del(path) { return this.request('DELETE', path); }
};

// ── Utility Functions ──
function formatDuration(seconds) {
    if (!seconds || seconds < 0) seconds = 0;
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = seconds % 60;
    return `${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`;
}

function formatHours(seconds) {
    if (!seconds) return '0h';
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    if (h === 0) return `${m}m`;
    return m > 0 ? `${h}h ${m}m` : `${h}h`;
}

function formatDate(iso) {
    if (!iso) return '';
    const d = new Date(iso);
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function formatTime(iso) {
    if (!iso) return '';
    const d = new Date(iso);
    return d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
}

function formatDateTime(iso) {
    if (!iso) return '';
    return `${formatDate(iso)} ${formatTime(iso)}`;
}

function todayISO() {
    const d = new Date();
    return d.toISOString().split('T')[0];
}

function weekAgoISO() {
    const d = new Date();
    d.setDate(d.getDate() - 7);
    return d.toISOString().split('T')[0];
}

function monthAgoISO() {
    const d = new Date();
    d.setMonth(d.getMonth() - 1);
    return d.toISOString().split('T')[0];
}

function escapeHtml(str) {
    if (!str) return '';
    return str.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

// ── Toast Notifications ──
function showToast(msg, type = 'info') {
    const container = document.getElementById('toast-container');
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    const icons = { success: '✓', error: '✕', info: 'ℹ' };
    toast.innerHTML = `<span>${icons[type] || ''}</span> ${escapeHtml(msg)}`;
    container.appendChild(toast);
    setTimeout(() => { toast.style.opacity = '0'; toast.style.transform = 'translateX(40px)'; setTimeout(() => toast.remove(), 300); }, 3500);
}

// ── Modal ──
function openModal(title, bodyHtml) {
    document.getElementById('modal-title').textContent = title;
    document.getElementById('modal-body').innerHTML = bodyHtml;
    document.getElementById('modal-overlay').classList.add('active');
}

function closeModal() {
    document.getElementById('modal-overlay').classList.remove('active');
}

// ── Lightbox ──
function openLightbox(src, info) {
    const lb = document.getElementById('lightbox');
    document.getElementById('lightbox-img').src = src;
    document.getElementById('lightbox-info').textContent = info || '';
    lb.classList.add('active');
}

function closeLightbox() {
    document.getElementById('lightbox').classList.remove('active');
    document.getElementById('lightbox-img').src = '';
}

// ═══════════════════════════════════════
// APP — Main Application
// ═══════════════════════════════════════
const App = {
    user: null,
    currentPage: null,
    timerInterval: null,
    timerStartTime: null,
    runningEntry: null,
    projects: [],

    init() {
        this.token = localStorage.getItem('tt_token');
        const userStr = localStorage.getItem('tt_user');
        if (!this.token || !userStr) { window.location.href = '/login.html'; return; }

        try { this.user = JSON.parse(userStr); } catch { this.logout(); return; }
        API.token = this.token;

        // Set admin visibility
        if (this.user.role === 'admin') document.body.classList.add('is-admin');

        // Update user info in sidebar
        document.getElementById('user-name').textContent = this.user.name;
        document.getElementById('user-role').textContent = this.user.role;
        const avatar = document.getElementById('user-avatar');
        avatar.textContent = this.user.name.charAt(0).toUpperCase();
        avatar.style.background = this.user.avatar_color || '#7c3aed';

        // Event listeners
        document.getElementById('logout-btn').addEventListener('click', () => this.logout());
        document.getElementById('modal-close').addEventListener('click', closeModal);
        document.getElementById('modal-overlay').addEventListener('click', (e) => { if (e.target.id === 'modal-overlay') closeModal(); });
        document.getElementById('lightbox-close').addEventListener('click', closeLightbox);
        document.getElementById('lightbox').addEventListener('click', (e) => { if (e.target.id === 'lightbox') closeLightbox(); });

        // Nav click handlers
        document.querySelectorAll('.nav-item').forEach(item => {
            item.addEventListener('click', (e) => {
                e.preventDefault();
                const page = item.dataset.page;
                if (page) window.location.hash = `#/${page}`;
            });
        });

        // Route handling
        window.addEventListener('hashchange', () => this.route());
        this.loadProjects();
        this.route();
    },

    async loadProjects() {
        try { this.projects = await API.get('/projects'); } catch(e) { this.projects = []; }
    },

    route() {
        const hash = window.location.hash.replace('#/', '') || 'dashboard';
        this.currentPage = hash;

        // Update active nav
        document.querySelectorAll('.nav-item').forEach(n => {
            n.classList.toggle('active', n.dataset.page === hash);
        });

        // Clear timer interval when leaving timer page
        if (hash !== 'timer' && this.timerInterval) {
            // keep it running, just don't update display
        }

        const content = document.getElementById('content-wrapper');
        const views = { dashboard: DashboardView, timer: TimerView, entries: EntriesView, screenshots: ScreenshotsView, projects: ProjectsView, reports: ReportsView, users: UsersView, settings: SettingsView };

        if (views[hash]) {
            views[hash].render(content);
        } else {
            content.innerHTML = '<div class="empty-state"><h3>Page Not Found</h3></div>';
        }
    },

    logout() {
        localStorage.removeItem('tt_token');
        localStorage.removeItem('tt_user');
        window.location.href = '/login.html';
    }
};

// ═══════════════════════════════════════
// DASHBOARD OVERVIEW VIEW
// ═══════════════════════════════════════
const DashboardView = {
    async render(container) {
        const greeting = this.getGreeting();
        const userName = App.user?.name || 'there';

        container.innerHTML = `
            <div class="welcome-banner">
                <h2>${greeting}, ${escapeHtml(userName)} 👋</h2>
                <p>Here's how your week is shaping up</p>
                <div class="welcome-quick-actions">
                    <button class="btn btn-primary" id="dash-start-timer" onclick="window.location.hash='#/timer'">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16"><polygon points="5 3 19 12 5 21 5 3" fill="currentColor" stroke="none"/></svg>
                        Start Timer
                    </button>
                    <button class="btn btn-secondary" id="dash-add-entry" onclick="DashboardView.openManualEntry()">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
                        Add Manual Entry
                    </button>
                    <button class="btn btn-secondary" onclick="window.location.hash='#/reports'">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16"><line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/></svg>
                        View Reports
                    </button>
                </div>
            </div>

            <div class="stat-grid" id="dash-stats">
                <div class="stat-card">
                    <div class="stat-icon blue"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg></div>
                    <div><div class="stat-value" id="dash-total-hours">--</div><div class="stat-label">Hours This Week</div></div>
                </div>
                <div class="stat-card">
                    <div class="stat-icon green"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg></div>
                    <div><div class="stat-value" id="dash-total-entries">--</div><div class="stat-label">Entries This Week</div></div>
                </div>
                <div class="stat-card">
                    <div class="stat-icon purple"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/></svg></div>
                    <div><div class="stat-value" id="dash-total-projects">--</div><div class="stat-label">Active Projects</div></div>
                </div>
                <div class="stat-card">
                    <div class="stat-icon orange"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z"/></svg></div>
                    <div><div class="stat-value" id="dash-avg-day">--</div><div class="stat-label">Avg / Day</div></div>
                </div>
            </div>

            <div class="dashboard-grid">
                <div class="dashboard-main">
                    <div class="card">
                        <div class="card-header">
                            <h3 class="card-title">📊 Weekly Activity</h3>
                            <span class="streak-badge" id="dash-streak">🔥 0 day streak</span>
                        </div>
                        <div class="heatmap-labels" id="heatmap-labels"></div>
                        <div class="heatmap-grid" id="heatmap-grid"></div>
                        <div style="margin-top:16px; display:flex; align-items:center; gap:8px; justify-content:flex-end">
                            <span style="font-size:11px; color:var(--text-muted)">Less</span>
                            <div style="width:14px;height:14px;border-radius:3px;background:var(--bg-surface)"></div>
                            <div style="width:14px;height:14px;border-radius:3px;background:rgba(0,212,255,0.15)"></div>
                            <div style="width:14px;height:14px;border-radius:3px;background:rgba(0,212,255,0.3)"></div>
                            <div style="width:14px;height:14px;border-radius:3px;background:rgba(0,212,255,0.5)"></div>
                            <div style="width:14px;height:14px;border-radius:3px;background:rgba(0,212,255,0.7)"></div>
                            <span style="font-size:11px; color:var(--text-muted)">More</span>
                        </div>
                    </div>

                    <div class="card">
                        <div class="card-header">
                            <h3 class="card-title">⚡ Recent Activity</h3>
                        </div>
                        <ul class="activity-feed" id="dash-activity-feed">
                            <li class="activity-item"><div class="activity-body"><div class="activity-text" style="color:var(--text-muted)">Loading activity...</div></div></li>
                        </ul>
                    </div>
                </div>

                <div class="dashboard-aside">
                    <div class="card">
                        <div class="card-header">
                            <h3 class="card-title">👥 Team</h3>
                        </div>
                        <ul class="team-online-list" id="dash-team-list">
                            <li class="team-member-item"><div class="team-member-info"><div class="team-member-name" style="color:var(--text-muted)">Loading...</div></div></li>
                        </ul>
                    </div>

                    <div class="card">
                        <div class="card-header">
                            <h3 class="card-title">🎯 Weekly Goals</h3>
                        </div>
                        <div id="dash-goals"></div>
                    </div>
                </div>
            </div>
        `;

        this.loadData();
    },

    getGreeting() {
        const h = new Date().getHours();
        if (h < 12) return 'Good morning';
        if (h < 17) return 'Good afternoon';
        return 'Good evening';
    },

    async loadData() {
        try {
            const from = weekAgoISO();
            const to = todayISO() + 'T23:59:59';

            const [reports, entries, users] = await Promise.all([
                API.get(`/reports?from=${from}&to=${to}`),
                API.get(`/time-entries?from=${from}&to=${to}`),
                App.user.role === 'admin' ? API.get('/users') : Promise.resolve([])
            ]);

            // Stats
            const totalSec = reports.summary?.total_seconds || 0;
            const totalEntries = reports.summary?.total_entries || 0;
            const projectCount = reports.by_project?.length || 0;
            const daysWithData = reports.by_day?.length || 1;
            const avgPerDay = Math.round(totalSec / Math.max(daysWithData, 1));

            document.getElementById('dash-total-hours').textContent = formatHours(totalSec);
            document.getElementById('dash-total-entries').textContent = totalEntries;
            document.getElementById('dash-total-projects').textContent = projectCount;
            document.getElementById('dash-avg-day').textContent = formatHours(avgPerDay);

            // Heatmap
            this.renderHeatmap(reports.by_day || []);

            // Streak
            const streak = this.calcStreak(reports.by_day || []);
            document.getElementById('dash-streak').textContent = `🔥 ${streak} day streak`;

            // Activity feed
            this.renderActivity(entries);

            // Team
            this.renderTeam(users);

            // Goals
            this.renderGoals(totalSec);

        } catch (err) {
            console.error('Dashboard load error:', err);
        }
    },

    renderHeatmap(byDay) {
        const grid = document.getElementById('heatmap-grid');
        const labels = document.getElementById('heatmap-labels');
        const dayNames = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

        // Build day map
        const dayMap = {};
        byDay.forEach(d => { dayMap[d.date] = d.total_seconds; });

        const maxSec = Math.max(...byDay.map(d => d.total_seconds || 0), 1);
        const cells = [];
        const labelEls = [];

        for (let i = 6; i >= 0; i--) {
            const d = new Date();
            d.setDate(d.getDate() - i);
            const key = d.toISOString().split('T')[0];
            const sec = dayMap[key] || 0;

            let level = 0;
            if (sec > 0) level = Math.min(4, Math.ceil((sec / maxSec) * 4));

            const hours = (sec / 3600).toFixed(1);
            cells.push(`<div class="heatmap-cell level-${level}" title="${dayNames[d.getDay() === 0 ? 6 : d.getDay() - 1]} · ${hours}h"></div>`);
            labelEls.push(`<div class="heatmap-label">${dayNames[d.getDay() === 0 ? 6 : d.getDay() - 1]}</div>`);
        }

        grid.innerHTML = cells.join('');
        labels.innerHTML = labelEls.join('');
    },

    calcStreak(byDay) {
        if (!byDay.length) return 0;
        const dates = new Set(byDay.map(d => d.date));
        let streak = 0;
        const d = new Date();
        while (true) {
            const key = d.toISOString().split('T')[0];
            if (dates.has(key)) { streak++; d.setDate(d.getDate() - 1); }
            else break;
        }
        return streak;
    },

    renderActivity(entries) {
        const feed = document.getElementById('dash-activity-feed');
        if (!entries || entries.length === 0) {
            feed.innerHTML = `<li class="activity-item"><div class="activity-body"><div class="activity-text" style="color:var(--text-muted)">No activity this week. Start tracking!</div></div></li>`;
            return;
        }

        const recent = entries.slice(0, 8);
        feed.innerHTML = recent.map(e => {
            const proj = e.project_name ? `<strong>${escapeHtml(e.project_name)}</strong>` : '<em>No Project</em>';
            const dur = formatHours(e.duration);
            const desc = e.description ? ` — ${escapeHtml(e.description)}` : '';
            const timeAgo = this.timeAgo(e.end_time || e.start_time);

            return `
                <li class="activity-item">
                    <div class="activity-icon timer">⏱️</div>
                    <div class="activity-body">
                        <div class="activity-text"><strong>${escapeHtml(e.user_name || 'You')}</strong> tracked <span class="duration-badge">${dur}</span> on ${proj}${desc}</div>
                        <div class="activity-time">${timeAgo}</div>
                    </div>
                </li>
            `;
        }).join('');
    },

    timeAgo(iso) {
        if (!iso) return '';
        const diff = (Date.now() - new Date(iso).getTime()) / 1000;
        if (diff < 60) return 'just now';
        if (diff < 3600) return `${Math.floor(diff/60)}m ago`;
        if (diff < 86400) return `${Math.floor(diff/3600)}h ago`;
        return `${Math.floor(diff/86400)}d ago`;
    },

    renderTeam(users) {
        const list = document.getElementById('dash-team-list');

        if (!users || users.length === 0) {
            // Show just self
            const u = App.user;
            list.innerHTML = `
                <li class="team-member-item">
                    <div class="team-avatar-wrap">
                        <div class="user-badge-avatar" style="background:${u.avatar_color || '#7c3aed'}">${u.name.charAt(0).toUpperCase()}</div>
                        <div class="online-dot active"></div>
                    </div>
                    <div class="team-member-info">
                        <div class="team-member-name">${escapeHtml(u.name)} (You)</div>
                        <div class="team-member-status tracking">● Online</div>
                    </div>
                </li>
            `;
            return;
        }

        list.innerHTML = users.filter(u => u.is_active).map(u => {
            const isYou = u.id === App.user.id;
            const statusClass = isYou ? 'active' : 'offline';
            const statusText = isYou ? '<span class="team-member-status tracking">● Online</span>' : '<span class="team-member-status">Last seen today</span>';

            return `
                <li class="team-member-item">
                    <div class="team-avatar-wrap">
                        <div class="user-badge-avatar" style="background:${u.avatar_color || '#7c3aed'}">${u.name.charAt(0).toUpperCase()}</div>
                        <div class="online-dot ${statusClass}"></div>
                    </div>
                    <div class="team-member-info">
                        <div class="team-member-name">${escapeHtml(u.name)}${isYou ? ' (You)' : ''}</div>
                        ${statusText}
                    </div>
                </li>
            `;
        }).join('');
    },

    renderGoals(totalSec) {
        const goalsEl = document.getElementById('dash-goals');
        const weeklyGoalHours = 40;
        const dailyGoalHours = 8;
        const weeklyGoalSec = weeklyGoalHours * 3600;
        const dailyGoalSec = dailyGoalHours * 3600;

        const weekPct = Math.min(100, Math.round((totalSec / weeklyGoalSec) * 100));
        const todayPct = Math.min(100, Math.round((totalSec / 7 / dailyGoalSec) * 100));

        goalsEl.innerHTML = `
            <div class="goal-card">
                <div class="goal-header">
                    <span class="goal-label">Weekly Target</span>
                    <span class="goal-value">${formatHours(totalSec)} / ${weeklyGoalHours}h</span>
                </div>
                <div class="progress-bar"><div class="progress-fill" style="width:${weekPct}%"></div></div>
            </div>
            <div class="goal-card">
                <div class="goal-header">
                    <span class="goal-label">Daily Average</span>
                    <span class="goal-value">${formatHours(Math.round(totalSec/7))} / ${dailyGoalHours}h</span>
                </div>
                <div class="progress-bar"><div class="progress-fill" style="width:${todayPct}%"></div></div>
            </div>
        `;
    },

    openManualEntry() {
        const projectOpts = App.projects.map(p => `<option value="${p.id}">${escapeHtml(p.name)}</option>`).join('');

        openModal('Add Manual Time Entry', `
            <form id="manual-entry-form" class="manual-entry-form">
                <div class="form-group">
                    <label class="form-label">Project</label>
                    <select class="form-select" id="me-project">
                        <option value="">No Project</option>
                        ${projectOpts}
                    </select>
                </div>
                <div class="form-group">
                    <label class="form-label">Date</label>
                    <input class="form-input" type="date" id="me-date" value="${todayISO()}">
                </div>
                <div class="form-group">
                    <label class="form-label">Start Time</label>
                    <input class="form-input" type="time" id="me-start" value="09:00">
                </div>
                <div class="form-group">
                    <label class="form-label">End Time</label>
                    <input class="form-input" type="time" id="me-end" value="17:00">
                </div>
                <div class="form-group full-width">
                    <label class="form-label">Description</label>
                    <input class="form-input" type="text" id="me-desc" placeholder="What did you work on?">
                </div>
                <div class="form-group full-width" style="text-align:right">
                    <button type="submit" class="btn btn-primary">Save Entry</button>
                </div>
            </form>
        `);

        document.getElementById('manual-entry-form').addEventListener('submit', async (e) => {
            e.preventDefault();
            const date = document.getElementById('me-date').value;
            const start = document.getElementById('me-start').value;
            const end = document.getElementById('me-end').value;
            const project_id = document.getElementById('me-project').value || null;
            const description = document.getElementById('me-desc').value;

            try {
                await API.post('/time-entries', {
                    project_id: project_id ? parseInt(project_id) : null,
                    description,
                    start_time: `${date}T${start}:00`,
                    end_time: `${date}T${end}:00`
                });
                closeModal();
                showToast('Time entry added!', 'success');
                DashboardView.render(document.getElementById('content-wrapper'));
            } catch (err) {
                showToast(err.message, 'error');
            }
        });
    }
};

// ═══════════════════════════════════════
// TIMER VIEW
// ═══════════════════════════════════════
const TimerView = {
    async render(container) {
        const projects = App.projects;
        const projectOpts = projects.map(p => `<option value="${p.id}">${escapeHtml(p.name)}</option>`).join('');

        container.innerHTML = `
            <div class="page-header">
                <div><h1 class="page-title">Timer</h1><p class="page-subtitle">Track your time</p></div>
            </div>
            <div class="card">
                <div class="timer-display-container">
                    <div class="timer-display" id="timer-display">00:00:00</div>
                    <div class="timer-project-label" id="timer-project-label" style="display:none">
                        <span class="timer-project-dot" id="timer-project-dot"></span>
                        <span id="timer-project-name"></span>
                    </div>
                    <div class="timer-controls">
                        <button class="timer-btn start" id="timer-start-btn" title="Start Timer">
                            <svg viewBox="0 0 24 24" fill="currentColor" stroke="none"><polygon points="5 3 19 12 5 21 5 3"/></svg>
                        </button>
                        <button class="timer-btn stop" id="timer-stop-btn" title="Stop Timer" style="display:none">
                            <svg viewBox="0 0 24 24" fill="currentColor" stroke="none"><rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/></svg>
                        </button>
                    </div>
                    <div class="timer-inputs">
                        <select class="timer-select" id="timer-project">
                            <option value="">No Project</option>
                            ${projectOpts}
                        </select>
                        <input class="timer-input-desc" type="text" id="timer-desc" placeholder="What are you working on?">
                    </div>
                </div>
            </div>
            <div style="margin-top:28px">
                <div class="card-header"><h3 class="card-title">Today's Entries</h3></div>
                <div id="today-entries-list"></div>
            </div>
        `;

        // Bind events
        document.getElementById('timer-start-btn').addEventListener('click', () => this.startTimer());
        document.getElementById('timer-stop-btn').addEventListener('click', () => this.stopTimer());

        // Check running timer
        await this.checkStatus();
        this.loadTodayEntries();
    },

    async checkStatus() {
        try {
            const data = await API.get('/timer/status');
            if (data.running) {
                App.runningEntry = data.running;
                App.timerStartTime = new Date(data.running.start_time);
                this.showRunning(data.running);
                this.startTick();
            }
        } catch(e) { console.error('Timer status error:', e); }
    },

    showRunning(entry) {
        document.getElementById('timer-start-btn').style.display = 'none';
        document.getElementById('timer-stop-btn').style.display = 'flex';
        document.getElementById('timer-display').classList.add('running');

        if (entry.project_name) {
            const label = document.getElementById('timer-project-label');
            label.style.display = 'flex';
            document.getElementById('timer-project-dot').style.background = entry.project_color || '#3B82F6';
            document.getElementById('timer-project-name').textContent = entry.project_name;
        }

        // Disable inputs while running
        document.getElementById('timer-project').disabled = true;
        document.getElementById('timer-desc').disabled = true;
        if (entry.project_id) document.getElementById('timer-project').value = entry.project_id;
        if (entry.description) document.getElementById('timer-desc').value = entry.description;
    },

    startTick() {
        if (App.timerInterval) clearInterval(App.timerInterval);
        App.timerInterval = setInterval(() => {
            if (!App.timerStartTime) return;
            const elapsed = Math.floor((Date.now() - App.timerStartTime.getTime()) / 1000);
            const display = document.getElementById('timer-display');
            if (display) display.textContent = formatDuration(elapsed);
        }, 1000);
    },

    async startTimer() {
        try {
            const project_id = document.getElementById('timer-project').value || null;
            const description = document.getElementById('timer-desc').value || '';
            const data = await API.post('/timer/start', { project_id, description });
            App.runningEntry = data.entry;
            App.timerStartTime = new Date(data.entry.start_time);
            this.showRunning(data.entry);
            this.startTick();
            showToast('Timer started', 'success');
        } catch(e) {
            showToast(e.message, 'error');
        }
    },

    async stopTimer() {
        try {
            const data = await API.post('/timer/stop');
            if (App.timerInterval) clearInterval(App.timerInterval);
            App.timerInterval = null;
            App.timerStartTime = null;
            App.runningEntry = null;

            document.getElementById('timer-start-btn').style.display = 'flex';
            document.getElementById('timer-stop-btn').style.display = 'none';
            document.getElementById('timer-display').classList.remove('running');
            document.getElementById('timer-display').textContent = '00:00:00';
            document.getElementById('timer-project-label').style.display = 'none';
            document.getElementById('timer-project').disabled = false;
            document.getElementById('timer-desc').disabled = false;
            document.getElementById('timer-desc').value = '';

            showToast(`Tracked ${formatHours(data.duration)}`, 'success');
            this.loadTodayEntries();
        } catch(e) {
            showToast(e.message, 'error');
        }
    },

    async loadTodayEntries() {
        try {
            const today = todayISO();
            const entries = await API.get(`/time-entries?from=${today}T00:00:00&to=${today}T23:59:59`);
            const el = document.getElementById('today-entries-list');
            if (!el) return;

            if (entries.length === 0) {
                el.innerHTML = '<div class="empty-state"><p>No entries today. Start the timer to begin tracking!</p></div>';
                return;
            }

            const totalSeconds = entries.reduce((s, e) => s + (e.duration || 0), 0);
            let html = `<div style="margin-bottom:16px;display:flex;align-items:center;gap:12px">
                <span class="duration-badge" style="font-size:15px">${formatDuration(totalSeconds)}</span>
                <span style="color:var(--text-muted);font-size:13px">total today</span>
            </div>`;
            html += '<div class="data-table-wrapper"><table class="data-table"><thead><tr><th>Project</th><th>Description</th><th>Time</th><th>Duration</th><th></th></tr></thead><tbody>';

            for (const e of entries) {
                html += `<tr>
                    <td><span class="project-dot" style="background:${e.project_color || '#555'}"></span>${escapeHtml(e.project_name || 'No Project')}</td>
                    <td style="color:var(--text-secondary)">${escapeHtml(e.description) || '—'}</td>
                    <td style="font-size:13px;color:var(--text-muted);white-space:nowrap">${formatTime(e.start_time)} – ${formatTime(e.end_time)}</td>
                    <td><span class="duration-badge">${formatDuration(e.duration)}</span></td>
                    <td><button class="btn btn-ghost btn-icon" onclick="TimerView.deleteEntry(${e.id})" title="Delete">✕</button></td>
                </tr>`;
            }
            html += '</tbody></table></div>';
            el.innerHTML = html;
        } catch(e) { console.error(e); }
    },

    async deleteEntry(id) {
        if (!confirm('Delete this time entry?')) return;
        try {
            await API.del(`/time-entries/${id}`);
            showToast('Entry deleted', 'info');
            this.loadTodayEntries();
        } catch(e) { showToast(e.message, 'error'); }
    }
};

// ═══════════════════════════════════════
// TIME ENTRIES VIEW
// ═══════════════════════════════════════
const EntriesView = {
    async render(container) {
        const weekAgo = weekAgoISO();
        const today = todayISO();
        container.innerHTML = `
            <div class="page-header">
                <div><h1 class="page-title">Time Entries</h1><p class="page-subtitle">Review all tracked time</p></div>
                <button class="btn btn-secondary" onclick="EntriesView.exportCSV()">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
                    Export CSV
                </button>
            </div>
            <div class="filter-bar">
                <input type="date" class="form-input" id="entries-from" value="${weekAgo}">
                <span style="color:var(--text-muted)">to</span>
                <input type="date" class="form-input" id="entries-to" value="${today}">
                <button class="btn btn-primary btn-sm" onclick="EntriesView.load()">Filter</button>
            </div>
            <div id="entries-table"></div>
        `;
        this.load();
    },

    async load() {
        const from = document.getElementById('entries-from').value;
        const to = document.getElementById('entries-to').value;
        try {
            const entries = await API.get(`/time-entries?from=${from}T00:00:00&to=${to}T23:59:59`);
            const el = document.getElementById('entries-table');
            if (entries.length === 0) {
                el.innerHTML = '<div class="empty-state"><h3>No entries found</h3><p>Adjust the date range or start tracking time.</p></div>';
                return;
            }

            const total = entries.reduce((s, e) => s + (e.duration || 0), 0);
            const isAdmin = App.user.role === 'admin';
            let html = `<div class="stat-grid" style="margin-bottom:20px">
                <div class="stat-card"><div class="stat-icon blue"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg></div><div><div class="stat-value">${formatHours(total)}</div><div class="stat-label">Total Time</div></div></div>
                <div class="stat-card"><div class="stat-icon purple"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/></svg></div><div><div class="stat-value">${entries.length}</div><div class="stat-label">Entries</div></div></div>
            </div>`;

            html += '<div class="data-table-wrapper"><table class="data-table"><thead><tr>';
            if (isAdmin) html += '<th>User</th>';
            html += '<th>Project</th><th>Description</th><th>Date</th><th>Time</th><th>Duration</th><th></th></tr></thead><tbody>';

            for (const e of entries) {
                html += '<tr>';
                if (isAdmin) {
                    html += `<td><span class="user-badge"><span class="user-badge-avatar" style="background:${e.avatar_color || '#7c3aed'}">${(e.user_name||'?')[0]}</span>${escapeHtml(e.user_name)}</span></td>`;
                }
                html += `
                    <td><span class="project-dot" style="background:${e.project_color || '#555'}"></span>${escapeHtml(e.project_name || 'No Project')}</td>
                    <td style="color:var(--text-secondary);max-width:200px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${escapeHtml(e.description) || '—'}</td>
                    <td style="white-space:nowrap;font-size:13px">${formatDate(e.start_time)}</td>
                    <td style="white-space:nowrap;font-size:13px;color:var(--text-muted)">${formatTime(e.start_time)} – ${formatTime(e.end_time)}</td>
                    <td><span class="duration-badge">${formatDuration(e.duration)}</span></td>
                    <td><button class="btn btn-ghost btn-icon" onclick="EntriesView.deleteEntry(${e.id})" title="Delete">✕</button></td>
                </tr>`;
            }
            html += '</tbody></table></div>';
            el.innerHTML = html;
        } catch(e) { showToast(e.message, 'error'); }
    },

    async deleteEntry(id) {
        if (!confirm('Delete this time entry?')) return;
        try { await API.del(`/time-entries/${id}`); showToast('Deleted', 'info'); this.load(); } catch(e) { showToast(e.message, 'error'); }
    },

    exportCSV() {
        const from = document.getElementById('entries-from').value;
        const to = document.getElementById('entries-to').value;
        window.open(`${API.base}/reports/export?from=${from}T00:00:00&to=${to}T23:59:59`, '_blank');
    }
};

// ═══════════════════════════════════════
// SCREENSHOTS VIEW
// ═══════════════════════════════════════
const ScreenshotsView = {
    async render(container) {
        const today = todayISO();
        container.innerHTML = `
            <div class="page-header">
                <div><h1 class="page-title">Screenshots</h1><p class="page-subtitle">Captured screen activity</p></div>
            </div>
            <div class="filter-bar">
                <input type="date" class="form-input" id="screenshots-date" value="${today}">
                <button class="btn btn-primary btn-sm" onclick="ScreenshotsView.load()">View</button>
            </div>
            <div id="screenshots-grid"></div>
        `;
        this.load();
    },

    async load() {
        const date = document.getElementById('screenshots-date').value;
        try {
            const screenshots = await API.get(`/screenshots?date=${date}`);
            const el = document.getElementById('screenshots-grid');

            if (screenshots.length === 0) {
                el.innerHTML = '<div class="empty-state"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg><h3>No Screenshots</h3><p>No screenshots were captured on this date.</p></div>';
                return;
            }

            let html = '<div class="screenshot-grid">';
            for (const s of screenshots) {
                const thumbSrc = `/api/screenshots/${s.id}/image`;
                const fullSrc = `/api/screenshots/${s.id}/image`;
                html += `
                    <div class="screenshot-card" onclick="openLightbox('${fullSrc}', '${escapeHtml(s.user_name || '')} — ${formatDateTime(s.captured_at)}')">
                        <img class="screenshot-img" src="${thumbSrc}" alt="Screenshot" loading="lazy" onerror="this.src='data:image/svg+xml,<svg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 300 180%22><rect fill=%22%231a1a30%22 width=%22300%22 height=%22180%22/><text x=%22150%22 y=%2290%22 fill=%22%234a4a6a%22 text-anchor=%22middle%22 font-size=%2214%22>No Preview</text></svg>'">
                        <div class="screenshot-meta">
                            <span class="screenshot-time">${formatTime(s.captured_at)}</span>
                            <span class="screenshot-user">${escapeHtml(s.user_name || '')}</span>
                        </div>
                        <button class="screenshot-delete" onclick="event.stopPropagation();ScreenshotsView.deleteScreenshot(${s.id})" title="Delete">✕</button>
                    </div>
                `;
            }
            html += '</div>';
            el.innerHTML = html;
        } catch(e) { showToast(e.message, 'error'); }
    },

    async deleteScreenshot(id) {
        if (!confirm('Delete this screenshot?')) return;
        try { await API.del(`/screenshots/${id}`); showToast('Screenshot deleted', 'info'); this.load(); } catch(e) { showToast(e.message, 'error'); }
    }
};

// ═══════════════════════════════════════
// PROJECTS VIEW
// ═══════════════════════════════════════
const ProjectsView = {
    async render(container) {
        container.innerHTML = `
            <div class="page-header">
                <div><h1 class="page-title">Projects</h1><p class="page-subtitle">Organize your work</p></div>
                <button class="btn btn-primary" onclick="ProjectsView.showCreate()">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
                    New Project
                </button>
            </div>
            <div id="projects-grid" class="card-grid"></div>
        `;
        this.load();
    },

    async load() {
        try {
            const projects = await API.get('/projects');
            App.projects = projects;
            const el = document.getElementById('projects-grid');

            if (projects.length === 0) {
                el.innerHTML = '<div class="empty-state"><h3>No Projects Yet</h3><p>Create a project to start organizing your time.</p></div>';
                return;
            }

            let html = '';
            for (const p of projects) {
                html += `
                    <div class="project-card" style="cursor:pointer" onclick="ProjectsView.showEdit(${p.id})">
                        <div style="position:absolute;top:0;left:0;right:0;height:3px;background:${p.color || '#3B82F6'}"></div>
                        <div class="project-card-name">${escapeHtml(p.name)}</div>
                        <div class="project-card-desc">${escapeHtml(p.description) || 'No description'}</div>
                        <div class="project-card-stats">
                            <span class="project-card-stat">
                                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/></svg>
                                ${p.member_count || 0} members
                            </span>
                        </div>
                        ${p.members && p.members.length > 0 ? `
                        <div class="project-members-row">
                            <div class="member-avatar-stack">
                                ${p.members.slice(0,5).map(m => `<div class="user-badge-avatar" style="background:${m.avatar_color || '#7c3aed'}" title="${escapeHtml(m.name)}">${m.name[0]}</div>`).join('')}
                            </div>
                        </div>` : ''}
                    </div>
                `;
            }
            el.innerHTML = html;
        } catch(e) { showToast(e.message, 'error'); }
    },

    showCreate() {
        const colors = ['#3B82F6','#8B5CF6','#EC4899','#10B981','#F59E0B','#EF4444','#06B6D4','#F97316'];
        const colorBtns = colors.map(c => `<button type="button" class="color-btn selected-check" style="background:${c}" data-color="${c}" onclick="document.querySelectorAll('.color-btn').forEach(b=>b.classList.remove('selected'));this.classList.add('selected');document.getElementById('project-color').value='${c}'"></button>`).join('');

        openModal('New Project', `
            <form id="create-project-form">
                <div class="form-group"><label class="form-label">Project Name</label><input class="form-input" id="project-name" required placeholder="My Project"></div>
                <div class="form-group"><label class="form-label">Description</label><textarea class="form-textarea" id="project-description" placeholder="Optional description"></textarea></div>
                <div class="form-group"><label class="form-label">Color</label><div class="color-options">${colorBtns}</div><input type="hidden" id="project-color" value="#3B82F6"></div>
                <button type="submit" class="btn btn-primary" style="width:100%;margin-top:8px">Create Project</button>
            </form>
        `);
        document.querySelector('.color-btn').classList.add('selected');
        document.getElementById('create-project-form').addEventListener('submit', async (e) => {
            e.preventDefault();
            try {
                await API.post('/projects', {
                    name: document.getElementById('project-name').value,
                    description: document.getElementById('project-description').value,
                    color: document.getElementById('project-color').value
                });
                closeModal();
                showToast('Project created', 'success');
                this.load();
            } catch(err) { showToast(err.message, 'error'); }
        });
    },

    async showEdit(id) {
        try {
            const project = App.projects.find(p => p.id === id);
            if (!project) return;

            openModal('Edit Project', `
                <form id="edit-project-form">
                    <div class="form-group"><label class="form-label">Project Name</label><input class="form-input" id="edit-project-name" value="${escapeHtml(project.name)}" required></div>
                    <div class="form-group"><label class="form-label">Description</label><textarea class="form-textarea" id="edit-project-description">${escapeHtml(project.description || '')}</textarea></div>
                    <div class="btn-group" style="margin-top:16px">
                        <button type="submit" class="btn btn-primary" style="flex:1">Save Changes</button>
                        ${App.user.role === 'admin' ? `<button type="button" class="btn btn-danger" onclick="ProjectsView.archiveProject(${id})">Archive</button>` : ''}
                    </div>
                </form>
            `);
            document.getElementById('edit-project-form').addEventListener('submit', async (e) => {
                e.preventDefault();
                try {
                    await API.put(`/projects/${id}`, {
                        name: document.getElementById('edit-project-name').value,
                        description: document.getElementById('edit-project-description').value
                    });
                    closeModal();
                    showToast('Project updated', 'success');
                    this.load();
                    App.loadProjects();
                } catch(err) { showToast(err.message, 'error'); }
            });
        } catch(e) { showToast(e.message, 'error'); }
    },

    async archiveProject(id) {
        if (!confirm('Archive this project? It will be hidden from views.')) return;
        try { await API.del(`/projects/${id}`); closeModal(); showToast('Project archived', 'info'); this.load(); App.loadProjects(); } catch(e) { showToast(e.message, 'error'); }
    }
};

// ═══════════════════════════════════════
// REPORTS VIEW
// ═══════════════════════════════════════
const ReportsView = {
    barChart: null,
    pieChart: null,

    async render(container) {
        const weekAgo = weekAgoISO();
        const today = todayISO();
        container.innerHTML = `
            <div class="page-header">
                <div><h1 class="page-title">Reports</h1><p class="page-subtitle">Analyze time data</p></div>
            </div>
            <div class="filter-bar">
                <input type="date" class="form-input" id="report-from" value="${weekAgo}">
                <span style="color:var(--text-muted)">to</span>
                <input type="date" class="form-input" id="report-to" value="${today}">
                <button class="btn btn-primary btn-sm" onclick="ReportsView.load()">Generate</button>
            </div>
            <div class="stat-grid" id="report-stats"></div>
            <div class="charts-grid">
                <div class="card"><div class="card-header"><h3 class="card-title">Hours by Day</h3></div><div class="chart-container"><canvas id="chart-daily"></canvas></div></div>
                <div class="card"><div class="card-header"><h3 class="card-title">By Project</h3></div><div class="chart-container"><canvas id="chart-projects"></canvas></div></div>
            </div>
            ${App.user.role === 'admin' ? '<div class="card" style="margin-top:20px"><div class="card-header"><h3 class="card-title">Team Activity</h3></div><div id="report-team-table"></div></div>' : ''}
        `;
        this.load();
    },

    async load() {
        try {
            const from = document.getElementById('report-from').value;
            const to = document.getElementById('report-to').value;
            const data = await API.get(`/reports?from=${from}T00:00:00&to=${to}T23:59:59`);

            // Stats
            document.getElementById('report-stats').innerHTML = `
                <div class="stat-card"><div class="stat-icon blue"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg></div><div><div class="stat-value">${data.summary.total_hours}h</div><div class="stat-label">Total Hours</div></div></div>
                <div class="stat-card"><div class="stat-icon green"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg></div><div><div class="stat-value">${data.summary.total_entries}</div><div class="stat-label">Entries</div></div></div>
                <div class="stat-card"><div class="stat-icon purple"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/></svg></div><div><div class="stat-value">${data.by_project.length}</div><div class="stat-label">Projects</div></div></div>
            `;

            // Bar chart — daily
            if (this.barChart) this.barChart.destroy();
            const dailyCtx = document.getElementById('chart-daily');
            if (dailyCtx) {
                this.barChart = new Chart(dailyCtx, {
                    type: 'bar',
                    data: {
                        labels: data.by_day.map(d => { const dt = new Date(d.date + 'T12:00:00'); return dt.toLocaleDateString('en-US', {weekday:'short', month:'short', day:'numeric'}); }),
                        datasets: [{
                            label: 'Hours',
                            data: data.by_day.map(d => Math.round(d.total_seconds / 36) / 100),
                            backgroundColor: 'rgba(0, 212, 255, 0.4)',
                            borderColor: '#00d4ff',
                            borderWidth: 1,
                            borderRadius: 6,
                            borderSkipped: false
                        }]
                    },
                    options: {
                        responsive: true, maintainAspectRatio: false,
                        plugins: { legend: { display: false } },
                        scales: {
                            x: { grid: { color: 'rgba(255,255,255,0.04)' }, ticks: { color: '#64748b', font: { size: 11 } } },
                            y: { grid: { color: 'rgba(255,255,255,0.04)' }, ticks: { color: '#64748b', font: { size: 11 } }, beginAtZero: true }
                        }
                    }
                });
            }

            // Pie chart — by project
            if (this.pieChart) this.pieChart.destroy();
            const pieCtx = document.getElementById('chart-projects');
            if (pieCtx && data.by_project.length > 0) {
                this.pieChart = new Chart(pieCtx, {
                    type: 'doughnut',
                    data: {
                        labels: data.by_project.map(p => p.name || 'No Project'),
                        datasets: [{
                            data: data.by_project.map(p => Math.round(p.total_seconds / 36) / 100),
                            backgroundColor: data.by_project.map(p => p.color || '#555'),
                            borderWidth: 0,
                            spacing: 2
                        }]
                    },
                    options: {
                        responsive: true, maintainAspectRatio: false,
                        cutout: '65%',
                        plugins: {
                            legend: { position: 'bottom', labels: { color: '#94a3b8', padding: 12, font: { size: 12 } } }
                        }
                    }
                });
            }

            // Team table (admin)
            if (App.user.role === 'admin' && data.by_user.length > 0) {
                const teamEl = document.getElementById('report-team-table');
                if (teamEl) {
                    let html = '<div class="data-table-wrapper"><table class="data-table"><thead><tr><th>User</th><th>Entries</th><th>Total Time</th></tr></thead><tbody>';
                    for (const u of data.by_user) {
                        html += `<tr>
                            <td><span class="user-badge"><span class="user-badge-avatar" style="background:${u.avatar_color || '#7c3aed'}">${(u.name||'?')[0]}</span>${escapeHtml(u.name)}</span></td>
                            <td>${u.entry_count}</td>
                            <td><span class="duration-badge">${formatHours(u.total_seconds)}</span></td>
                        </tr>`;
                    }
                    html += '</tbody></table></div>';
                    teamEl.innerHTML = html;
                }
            }
        } catch(e) { showToast(e.message, 'error'); }
    }
};

// ═══════════════════════════════════════
// USERS VIEW (admin)
// ═══════════════════════════════════════
const UsersView = {
    async render(container) {
        if (App.user.role !== 'admin') { container.innerHTML = '<div class="empty-state"><h3>Access Denied</h3></div>'; return; }

        container.innerHTML = `
            <div class="page-header">
                <div><h1 class="page-title">Users</h1><p class="page-subtitle">Manage team members</p></div>
                <button class="btn btn-primary" onclick="UsersView.showCreate()">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
                    Add User
                </button>
            </div>
            <div id="users-table"></div>
        `;
        this.load();
    },

    async load() {
        try {
            const users = await API.get('/users');
            const el = document.getElementById('users-table');

            let html = '<div class="data-table-wrapper"><table class="data-table"><thead><tr><th>User</th><th>Email</th><th>Role</th><th>Status</th><th>Actions</th></tr></thead><tbody>';
            for (const u of users) {
                const statusClass = u.is_active ? 'color:var(--color-accent)' : 'color:var(--color-danger)';
                html += `<tr>
                    <td><span class="user-badge"><span class="user-badge-avatar" style="background:${u.avatar_color || '#7c3aed'}">${u.name[0]}</span>${escapeHtml(u.name)}</span></td>
                    <td style="color:var(--text-secondary)">${escapeHtml(u.email)}</td>
                    <td><span style="text-transform:capitalize;font-size:13px;padding:3px 10px;border-radius:6px;background:${u.role === 'admin' ? 'var(--color-secondary-dim)' : 'var(--bg-surface)'};color:${u.role === 'admin' ? 'var(--color-secondary)' : 'var(--text-secondary)'}">${u.role}</span></td>
                    <td><span style="${statusClass};font-size:13px">${u.is_active ? '● Active' : '● Inactive'}</span></td>
                    <td>
                        <div class="btn-group">
                            <button class="btn btn-ghost btn-sm" onclick="UsersView.showEdit(${u.id})">Edit</button>
                            ${u.id !== App.user.id ? `<button class="btn btn-ghost btn-sm" style="color:var(--color-danger)" onclick="UsersView.deactivate(${u.id})">Deactivate</button>` : ''}
                        </div>
                    </td>
                </tr>`;
            }
            html += '</tbody></table></div>';
            el.innerHTML = html;
        } catch(e) { showToast(e.message, 'error'); }
    },

    showCreate() {
        openModal('Add New User', `
            <form id="create-user-form">
                <div class="form-group"><label class="form-label">Full Name</label><input class="form-input" id="new-user-name" required placeholder="John Doe"></div>
                <div class="form-group"><label class="form-label">Email</label><input class="form-input" type="email" id="new-user-email" required placeholder="john@company.com"></div>
                <div class="form-group"><label class="form-label">Password</label><input class="form-input" type="password" id="new-user-password" required placeholder="Min 6 characters" minlength="6"></div>
                <div class="form-group"><label class="form-label">Role</label><select class="form-select" id="new-user-role"><option value="user">User</option><option value="admin">Admin</option></select></div>
                <button type="submit" class="btn btn-primary" style="width:100%;margin-top:8px">Create User</button>
            </form>
        `);
        document.getElementById('create-user-form').addEventListener('submit', async (e) => {
            e.preventDefault();
            try {
                await API.post('/auth/register', {
                    name: document.getElementById('new-user-name').value,
                    email: document.getElementById('new-user-email').value,
                    password: document.getElementById('new-user-password').value,
                    role: document.getElementById('new-user-role').value
                });
                closeModal();
                showToast('User created', 'success');
                this.load();
            } catch(err) { showToast(err.message, 'error'); }
        });
    },

    async showEdit(id) {
        try {
            const user = await API.get(`/users/${id}`);
            openModal('Edit User', `
                <form id="edit-user-form">
                    <div class="form-group"><label class="form-label">Full Name</label><input class="form-input" id="edit-user-name" value="${escapeHtml(user.name)}" required></div>
                    <div class="form-group"><label class="form-label">Email</label><input class="form-input" type="email" id="edit-user-email" value="${escapeHtml(user.email)}" required></div>
                    <div class="form-group"><label class="form-label">New Password (leave blank to keep)</label><input class="form-input" type="password" id="edit-user-password" placeholder="••••••••"></div>
                    <div class="form-group"><label class="form-label">Role</label><select class="form-select" id="edit-user-role"><option value="user" ${user.role==='user'?'selected':''}>User</option><option value="admin" ${user.role==='admin'?'selected':''}>Admin</option></select></div>
                    <button type="submit" class="btn btn-primary" style="width:100%;margin-top:8px">Save Changes</button>
                </form>
            `);
            document.getElementById('edit-user-form').addEventListener('submit', async (e) => {
                e.preventDefault();
                const body = {
                    name: document.getElementById('edit-user-name').value,
                    email: document.getElementById('edit-user-email').value,
                    role: document.getElementById('edit-user-role').value
                };
                const pw = document.getElementById('edit-user-password').value;
                if (pw) body.password = pw;
                try { await API.put(`/users/${id}`, body); closeModal(); showToast('User updated', 'success'); this.load(); } catch(err) { showToast(err.message, 'error'); }
            });
        } catch(e) { showToast(e.message, 'error'); }
    },

    async deactivate(id) {
        if (!confirm('Deactivate this user?')) return;
        try { await API.del(`/users/${id}`); showToast('User deactivated', 'info'); this.load(); } catch(e) { showToast(e.message, 'error'); }
    }
};

// ═══════════════════════════════════════
// SETTINGS VIEW (admin)
// ═══════════════════════════════════════
const SettingsView = {
    async render(container) {
        if (App.user.role !== 'admin') { container.innerHTML = '<div class="empty-state"><h3>Access Denied</h3><p>Only admins can access settings.</p></div>'; return; }

        container.innerHTML = `
            <div class="page-header">
                <div><h1 class="page-title">Settings</h1><p class="page-subtitle">Configure screenshot capture & app behavior</p></div>
            </div>
            <div id="settings-content"><div class="page-loading"><div class="spinner"></div></div></div>
        `;
        this.load();
    },

    async load() {
        try {
            const settings = await API.get('/settings');
            const el = document.getElementById('settings-content');

            el.innerHTML = `
                <div class="settings-section">
                    <h3 class="settings-section-title">📸 Screenshot Capture</h3>
                    <p class="settings-section-desc">Configure how the desktop client captures screenshots while the timer is running.</p>

                    <div class="toggle-wrapper">
                        <div class="toggle-label-group"><span class="toggle-label">Screenshots Enabled</span><span class="toggle-desc">Capture screenshots from desktop clients</span></div>
                        <label class="toggle"><input type="checkbox" id="set-screenshots-enabled" ${settings.screenshots_enabled === 'true' ? 'checked' : ''}><span class="toggle-slider"></span></label>
                    </div>

                    <div class="toggle-wrapper">
                        <div class="toggle-label-group"><span class="toggle-label">Blur Screenshots</span><span class="toggle-desc">Apply blur filter for privacy</span></div>
                        <label class="toggle"><input type="checkbox" id="set-screenshot-blur" ${settings.screenshot_blur === 'true' ? 'checked' : ''}><span class="toggle-slider"></span></label>
                    </div>

                    <div class="toggle-wrapper">
                        <div class="toggle-label-group"><span class="toggle-label">Notify Users</span><span class="toggle-desc">Show notification when screenshots are active</span></div>
                        <label class="toggle"><input type="checkbox" id="set-notify-users" ${settings.notify_users === 'true' ? 'checked' : ''}><span class="toggle-slider"></span></label>
                    </div>

                    <div style="margin-top:24px">
                        <div class="form-row">
                            <div class="form-group">
                                <label class="form-label">Screenshot Interval</label>
                                <select class="form-select" id="set-screenshot-interval">
                                    <option value="1" ${settings.screenshot_interval==='1'?'selected':''}>Every 1 minute</option>
                                    <option value="2" ${settings.screenshot_interval==='2'?'selected':''}>Every 2 minutes</option>
                                    <option value="3" ${settings.screenshot_interval==='3'?'selected':''}>Every 3 minutes</option>
                                    <option value="5" ${settings.screenshot_interval==='5'?'selected':''}>Every 5 minutes</option>
                                    <option value="10" ${settings.screenshot_interval==='10'?'selected':''}>Every 10 minutes</option>
                                    <option value="15" ${settings.screenshot_interval==='15'?'selected':''}>Every 15 minutes</option>
                                </select>
                            </div>
                            <div class="form-group">
                                <label class="form-label">Screenshot Quality</label>
                                <select class="form-select" id="set-screenshot-quality">
                                    <option value="low" ${settings.screenshot_quality==='low'?'selected':''}>Low (blurred)</option>
                                    <option value="medium" ${settings.screenshot_quality==='medium'?'selected':''}>Medium</option>
                                    <option value="high" ${settings.screenshot_quality==='high'?'selected':''}>High</option>
                                </select>
                            </div>
                        </div>
                    </div>
                </div>

                <div class="settings-section">
                    <h3 class="settings-section-title">⏸️ Idle Detection</h3>
                    <p class="settings-section-desc">Configure when to pause tracking due to inactivity.</p>
                    <div class="form-group">
                        <label class="form-label">Idle Threshold (minutes)</label>
                        <select class="form-select" id="set-idle-threshold">
                            <option value="1" ${settings.idle_threshold==='1'?'selected':''}>1 minute</option>
                            <option value="3" ${settings.idle_threshold==='3'?'selected':''}>3 minutes</option>
                            <option value="5" ${settings.idle_threshold==='5'?'selected':''}>5 minutes</option>
                            <option value="10" ${settings.idle_threshold==='10'?'selected':''}>10 minutes</option>
                            <option value="15" ${settings.idle_threshold==='15'?'selected':''}>15 minutes</option>
                            <option value="30" ${settings.idle_threshold==='30'?'selected':''}>30 minutes</option>
                        </select>
                    </div>
                </div>

                <button class="btn btn-primary" onclick="SettingsView.save()" style="margin-top:8px">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16"><path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/><polyline points="17 21 17 13 7 13 7 21"/><polyline points="7 3 7 8 15 8"/></svg>
                    Save Settings
                </button>
            `;
        } catch(e) { showToast(e.message, 'error'); }
    },

    async save() {
        try {
            await API.put('/settings', {
                screenshots_enabled: document.getElementById('set-screenshots-enabled').checked ? 'true' : 'false',
                screenshot_blur: document.getElementById('set-screenshot-blur').checked ? 'true' : 'false',
                notify_users: document.getElementById('set-notify-users').checked ? 'true' : 'false',
                screenshot_interval: document.getElementById('set-screenshot-interval').value,
                screenshot_quality: document.getElementById('set-screenshot-quality').value,
                idle_threshold: document.getElementById('set-idle-threshold').value
            });
            showToast('Settings saved successfully', 'success');
        } catch(e) { showToast(e.message, 'error'); }
    }
};

// ── Initialize App ──
document.addEventListener('DOMContentLoaded', () => App.init());
