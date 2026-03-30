const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');
const bcrypt = require('bcryptjs');

class DB {
    constructor(dbPath) {
        const dir = path.dirname(dbPath);
        if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

        this.db = new Database(dbPath);
        this.db.pragma('journal_mode = WAL');
        this.db.pragma('foreign_keys = ON');
        this.initialize();
    }

    initialize() {
        this.db.exec(`
            CREATE TABLE IF NOT EXISTS users (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                email TEXT UNIQUE NOT NULL,
                password_hash TEXT NOT NULL,
                name TEXT NOT NULL,
                role TEXT DEFAULT 'user' CHECK(role IN ('admin', 'user')),
                is_active INTEGER DEFAULT 1,
                avatar_color TEXT DEFAULT '#3B82F6',
                created_at TEXT DEFAULT (datetime('now'))
            );

            CREATE TABLE IF NOT EXISTS projects (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                name TEXT NOT NULL,
                color TEXT DEFAULT '#3B82F6',
                description TEXT DEFAULT '',
                is_archived INTEGER DEFAULT 0,
                created_by INTEGER REFERENCES users(id),
                created_at TEXT DEFAULT (datetime('now'))
            );

            CREATE TABLE IF NOT EXISTS project_members (
                project_id INTEGER REFERENCES projects(id) ON DELETE CASCADE,
                user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
                PRIMARY KEY (project_id, user_id)
            );

            CREATE TABLE IF NOT EXISTS tasks (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                project_id INTEGER REFERENCES projects(id) ON DELETE CASCADE,
                name TEXT NOT NULL,
                created_at TEXT DEFAULT (datetime('now'))
            );

            CREATE TABLE IF NOT EXISTS time_entries (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id INTEGER NOT NULL REFERENCES users(id),
                project_id INTEGER REFERENCES projects(id),
                task_id INTEGER REFERENCES tasks(id),
                description TEXT DEFAULT '',
                start_time TEXT NOT NULL,
                end_time TEXT,
                duration INTEGER DEFAULT 0,
                is_running INTEGER DEFAULT 0,
                created_at TEXT DEFAULT (datetime('now'))
            );

            CREATE TABLE IF NOT EXISTS screenshots (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                time_entry_id INTEGER REFERENCES time_entries(id) ON DELETE SET NULL,
                user_id INTEGER NOT NULL REFERENCES users(id),
                filename TEXT NOT NULL,
                thumbnail TEXT,
                captured_at TEXT DEFAULT (datetime('now'))
            );

            CREATE TABLE IF NOT EXISTS settings (
                key TEXT PRIMARY KEY,
                value TEXT NOT NULL
            );

            CREATE INDEX IF NOT EXISTS idx_time_entries_user ON time_entries(user_id);
            CREATE INDEX IF NOT EXISTS idx_time_entries_dates ON time_entries(start_time, end_time);
            CREATE INDEX IF NOT EXISTS idx_screenshots_user ON screenshots(user_id);
            CREATE INDEX IF NOT EXISTS idx_screenshots_entry ON screenshots(time_entry_id);
        `);

        // Default settings
        const defaults = {
            screenshots_enabled: 'true',
            screenshot_interval: '5',
            screenshot_blur: 'false',
            screenshot_quality: 'medium',
            idle_threshold: '5',
            notify_users: 'true'
        };

        const insert = this.db.prepare('INSERT OR IGNORE INTO settings (key, value) VALUES (?, ?)');
        for (const [k, v] of Object.entries(defaults)) {
            insert.run(k, v);
        }

        // Create default admin if no users
        const count = this.db.prepare('SELECT COUNT(*) as c FROM users').get();
        if (count.c === 0) {
            const hash = bcrypt.hashSync('admin123', 10);
            this.db.prepare(
                'INSERT INTO users (email, password_hash, name, role, avatar_color) VALUES (?, ?, ?, ?, ?)'
            ).run('admin@timetracker.local', hash, 'Admin', 'admin', '#8B5CF6');
            console.log('✅ Default admin created: admin@timetracker.local / admin123');
        }
    }

    // ── Users ──
    createUser(email, passwordHash, name, role = 'user') {
        const colors = ['#3B82F6','#8B5CF6','#EC4899','#10B981','#F59E0B','#EF4444','#06B6D4'];
        const color = colors[Math.floor(Math.random() * colors.length)];
        return this.db.prepare(
            'INSERT INTO users (email, password_hash, name, role, avatar_color) VALUES (?, ?, ?, ?, ?)'
        ).run(email, passwordHash, name, role, color);
    }

    getUserByEmail(email) {
        return this.db.prepare('SELECT * FROM users WHERE email = ?').get(email);
    }

    getUserById(id) {
        return this.db.prepare('SELECT id, email, name, role, is_active, avatar_color, created_at FROM users WHERE id = ?').get(id);
    }

    getUsers() {
        return this.db.prepare('SELECT id, email, name, role, is_active, avatar_color, created_at FROM users ORDER BY created_at DESC').all();
    }

    updateUser(id, fields) {
        const sets = [];
        const vals = [];
        for (const [k, v] of Object.entries(fields)) {
            if (['name', 'email', 'role', 'is_active', 'avatar_color'].includes(k)) {
                sets.push(`${k} = ?`);
                vals.push(v);
            }
        }
        if (sets.length === 0) return null;
        vals.push(id);
        return this.db.prepare(`UPDATE users SET ${sets.join(', ')} WHERE id = ?`).run(...vals);
    }

    updateUserPassword(id, hash) {
        return this.db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(hash, id);
    }

    // ── Projects ──
    createProject(name, color, description, createdBy) {
        return this.db.prepare(
            'INSERT INTO projects (name, color, description, created_by) VALUES (?, ?, ?, ?)'
        ).run(name, color || '#3B82F6', description || '', createdBy);
    }

    getProjects(includeArchived = false) {
        const where = includeArchived ? '' : 'WHERE is_archived = 0';
        return this.db.prepare(`SELECT * FROM projects ${where} ORDER BY created_at DESC`).all();
    }

    getProject(id) {
        return this.db.prepare('SELECT * FROM projects WHERE id = ?').get(id);
    }

    updateProject(id, fields) {
        const sets = [];
        const vals = [];
        for (const [k, v] of Object.entries(fields)) {
            if (['name', 'color', 'description', 'is_archived'].includes(k)) {
                sets.push(`${k} = ?`);
                vals.push(v);
            }
        }
        if (sets.length === 0) return null;
        vals.push(id);
        return this.db.prepare(`UPDATE projects SET ${sets.join(', ')} WHERE id = ?`).run(...vals);
    }

    addProjectMember(projectId, userId) {
        return this.db.prepare('INSERT OR IGNORE INTO project_members (project_id, user_id) VALUES (?, ?)').run(projectId, userId);
    }

    removeProjectMember(projectId, userId) {
        return this.db.prepare('DELETE FROM project_members WHERE project_id = ? AND user_id = ?').run(projectId, userId);
    }

    getProjectMembers(projectId) {
        return this.db.prepare(`
            SELECT u.id, u.name, u.email, u.avatar_color
            FROM project_members pm JOIN users u ON pm.user_id = u.id
            WHERE pm.project_id = ?
        `).all(projectId);
    }

    getUserProjects(userId) {
        return this.db.prepare(`
            SELECT p.* FROM projects p
            LEFT JOIN project_members pm ON p.id = pm.project_id
            WHERE (pm.user_id = ? OR p.created_by = ?) AND p.is_archived = 0
            GROUP BY p.id ORDER BY p.name
        `).all(userId, userId);
    }

    // ── Tasks ──
    createTask(projectId, name) {
        return this.db.prepare('INSERT INTO tasks (project_id, name) VALUES (?, ?)').run(projectId, name);
    }

    getTasks(projectId) {
        return this.db.prepare('SELECT * FROM tasks WHERE project_id = ? ORDER BY name').all(projectId);
    }

    deleteTask(id) {
        return this.db.prepare('DELETE FROM tasks WHERE id = ?').run(id);
    }

    // ── Time Entries ──
    createTimeEntry(userId, projectId, taskId, description, startTime) {
        return this.db.prepare(
            'INSERT INTO time_entries (user_id, project_id, task_id, description, start_time, is_running) VALUES (?, ?, ?, ?, ?, 1)'
        ).run(userId, projectId || null, taskId || null, description || '', startTime);
    }

    stopTimeEntry(id, endTime, duration) {
        return this.db.prepare(
            'UPDATE time_entries SET end_time = ?, duration = ?, is_running = 0 WHERE id = ?'
        ).run(endTime, duration, id);
    }

    getRunningEntry(userId) {
        return this.db.prepare(
            'SELECT te.*, p.name as project_name, p.color as project_color FROM time_entries te LEFT JOIN projects p ON te.project_id = p.id WHERE te.user_id = ? AND te.is_running = 1'
        ).get(userId);
    }

    getTimeEntries(userId, from, to, projectId, isAdmin = false) {
        let sql = `
            SELECT te.*, p.name as project_name, p.color as project_color,
                   t.name as task_name, u.name as user_name, u.avatar_color
            FROM time_entries te
            LEFT JOIN projects p ON te.project_id = p.id
            LEFT JOIN tasks t ON te.task_id = t.id
            LEFT JOIN users u ON te.user_id = u.id
            WHERE te.is_running = 0
        `;
        const params = [];

        if (!isAdmin) {
            sql += ' AND te.user_id = ?';
            params.push(userId);
        }
        if (from) { sql += ' AND te.start_time >= ?'; params.push(from); }
        if (to) { sql += ' AND te.start_time <= ?'; params.push(to); }
        if (projectId) { sql += ' AND te.project_id = ?'; params.push(projectId); }

        sql += ' ORDER BY te.start_time DESC LIMIT 500';
        return this.db.prepare(sql).all(...params);
    }

    deleteTimeEntry(id, userId, isAdmin = false) {
        if (isAdmin) {
            return this.db.prepare('DELETE FROM time_entries WHERE id = ?').run(id);
        }
        return this.db.prepare('DELETE FROM time_entries WHERE id = ? AND user_id = ?').run(id, userId);
    }

    updateTimeEntry(id, fields, userId, isAdmin = false) {
        const sets = [];
        const vals = [];
        for (const [k, v] of Object.entries(fields)) {
            if (['project_id', 'task_id', 'description', 'start_time', 'end_time', 'duration'].includes(k)) {
                sets.push(`${k} = ?`);
                vals.push(v);
            }
        }
        if (sets.length === 0) return null;
        if (isAdmin) {
            vals.push(id);
            return this.db.prepare(`UPDATE time_entries SET ${sets.join(', ')} WHERE id = ?`).run(...vals);
        }
        vals.push(id, userId);
        return this.db.prepare(`UPDATE time_entries SET ${sets.join(', ')} WHERE id = ? AND user_id = ?`).run(...vals);
    }

    // ── Screenshots ──
    createScreenshot(timeEntryId, userId, filename, thumbnail) {
        return this.db.prepare(
            'INSERT INTO screenshots (time_entry_id, user_id, filename, thumbnail) VALUES (?, ?, ?, ?)'
        ).run(timeEntryId, userId, filename, thumbnail || null);
    }

    getScreenshots(userId, date, isAdmin = false) {
        let sql = `
            SELECT s.*, u.name as user_name, u.avatar_color,
                   p.name as project_name, p.color as project_color
            FROM screenshots s
            LEFT JOIN users u ON s.user_id = u.id
            LEFT JOIN time_entries te ON s.time_entry_id = te.id
            LEFT JOIN projects p ON te.project_id = p.id
            WHERE 1=1
        `;
        const params = [];

        if (!isAdmin) {
            sql += ' AND s.user_id = ?';
            params.push(userId);
        }
        if (date) {
            sql += ' AND DATE(s.captured_at) = DATE(?)';
            params.push(date);
        }

        sql += ' ORDER BY s.captured_at DESC LIMIT 200';
        return this.db.prepare(sql).all(...params);
    }

    deleteScreenshot(id, userId, isAdmin = false) {
        const screenshot = this.db.prepare('SELECT * FROM screenshots WHERE id = ?').get(id);
        if (!screenshot) return null;
        if (!isAdmin && screenshot.user_id !== userId) return null;
        this.db.prepare('DELETE FROM screenshots WHERE id = ?').run(id);
        return screenshot;
    }

    // ── Reports ──
    getReportByProject(userId, from, to, isAdmin = false) {
        let sql = `
            SELECT p.id, p.name, p.color, SUM(te.duration) as total_seconds, COUNT(te.id) as entry_count
            FROM time_entries te
            LEFT JOIN projects p ON te.project_id = p.id
            WHERE te.is_running = 0
        `;
        const params = [];
        if (!isAdmin) { sql += ' AND te.user_id = ?'; params.push(userId); }
        if (from) { sql += ' AND te.start_time >= ?'; params.push(from); }
        if (to) { sql += ' AND te.start_time <= ?'; params.push(to); }
        sql += ' GROUP BY te.project_id ORDER BY total_seconds DESC';
        return this.db.prepare(sql).all(...params);
    }

    getReportByDay(userId, from, to, isAdmin = false) {
        let sql = `
            SELECT DATE(te.start_time) as date, SUM(te.duration) as total_seconds, COUNT(te.id) as entry_count
            FROM time_entries te
            WHERE te.is_running = 0
        `;
        const params = [];
        if (!isAdmin) { sql += ' AND te.user_id = ?'; params.push(userId); }
        if (from) { sql += ' AND te.start_time >= ?'; params.push(from); }
        if (to) { sql += ' AND te.start_time <= ?'; params.push(to); }
        sql += ' GROUP BY DATE(te.start_time) ORDER BY date ASC';
        return this.db.prepare(sql).all(...params);
    }

    getReportByUser(from, to) {
        let sql = `
            SELECT u.id, u.name, u.avatar_color, SUM(te.duration) as total_seconds, COUNT(te.id) as entry_count
            FROM time_entries te
            JOIN users u ON te.user_id = u.id
            WHERE te.is_running = 0
        `;
        const params = [];
        if (from) { sql += ' AND te.start_time >= ?'; params.push(from); }
        if (to) { sql += ' AND te.start_time <= ?'; params.push(to); }
        sql += ' GROUP BY te.user_id ORDER BY total_seconds DESC';
        return this.db.prepare(sql).all(...params);
    }

    // ── Settings ──
    getSettings() {
        const rows = this.db.prepare('SELECT * FROM settings').all();
        const obj = {};
        for (const r of rows) obj[r.key] = r.value;
        return obj;
    }

    updateSetting(key, value) {
        return this.db.prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)').run(key, String(value));
    }
}

module.exports = { DB };
