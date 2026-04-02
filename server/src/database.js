const { Pool } = require('pg');
const bcrypt = require('bcryptjs');

class DB {
    constructor(connectionString) {
        const url = connectionString || process.env.DATABASE_URL;
        
        const poolConfig = {
            connectionString: url,
        };

        // Add SSL config if running in production/Vercel or if it's a remote URL
        if (url && url.includes('supabase.com')) {
            poolConfig.ssl = { rejectUnauthorized: false };
        }

        this.pool = new Pool(poolConfig);
        
        this.pool.on('error', (err) => {
            console.error('Unexpected error on idle client', err);
        });
    }

    async connect() {
        await this.initialize();
        return this;
    }

    async initialize() {
        if (this.initialized) return;

        try {
            // Check if users table exists first (fastest check)
            const tableCheck = await this.pool.query(`
                SELECT EXISTS (
                    SELECT FROM information_schema.tables 
                    WHERE table_name = 'users'
                );
            `);
            
            if (tableCheck.rows[0].exists) {
                this.initialized = true;
                return;
            }

            console.log('🏗️ Initializing database schema...');
            const client = await this.pool.connect();
            try {
                await client.query('BEGIN');
                
                await client.query(`
                    CREATE TABLE IF NOT EXISTS users (
                        id SERIAL PRIMARY KEY,
                        email TEXT UNIQUE NOT NULL,
                        password_hash TEXT NOT NULL,
                        name TEXT NOT NULL,
                        role TEXT DEFAULT 'user' CHECK(role IN ('admin', 'user')),
                        is_active INTEGER DEFAULT 1,
                        avatar_color TEXT DEFAULT '#3B82F6',
                        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
                    );

                    CREATE TABLE IF NOT EXISTS projects (
                        id SERIAL PRIMARY KEY,
                        name TEXT NOT NULL,
                        color TEXT DEFAULT '#3B82F6',
                        description TEXT DEFAULT '',
                        is_archived INTEGER DEFAULT 0,
                        created_by INTEGER REFERENCES users(id),
                        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
                    );

                    CREATE TABLE IF NOT EXISTS project_members (
                        project_id INTEGER REFERENCES projects(id) ON DELETE CASCADE,
                        user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
                        PRIMARY KEY (project_id, user_id)
                    );

                    CREATE TABLE IF NOT EXISTS tasks (
                        id SERIAL PRIMARY KEY,
                        project_id INTEGER REFERENCES projects(id) ON DELETE CASCADE,
                        name TEXT NOT NULL,
                        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
                    );

                    CREATE TABLE IF NOT EXISTS time_entries (
                        id SERIAL PRIMARY KEY,
                        user_id INTEGER NOT NULL REFERENCES users(id),
                        project_id INTEGER REFERENCES projects(id),
                        task_id INTEGER REFERENCES tasks(id),
                        description TEXT DEFAULT '',
                        start_time TIMESTAMP WITH TIME ZONE NOT NULL,
                        end_time TIMESTAMP WITH TIME ZONE,
                        duration INTEGER DEFAULT 0,
                        is_running INTEGER DEFAULT 0,
                        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
                    );

                    CREATE TABLE IF NOT EXISTS screenshots (
                        id SERIAL PRIMARY KEY,
                        time_entry_id INTEGER REFERENCES time_entries(id) ON DELETE SET NULL,
                        user_id INTEGER NOT NULL REFERENCES users(id),
                        filename TEXT NOT NULL,
                        thumbnail TEXT,
                        captured_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
                    );

                    CREATE TABLE IF NOT EXISTS settings (
                        key TEXT PRIMARY KEY,
                        value TEXT NOT NULL
                    );

                    CREATE INDEX IF NOT EXISTS idx_time_entries_user ON time_entries(user_id);
                    CREATE INDEX IF NOT EXISTS idx_time_entries_dates ON time_entries(start_time, end_time);
                    CREATE INDEX IF NOT EXISTS idx_screenshots_user ON screenshots(user_id);
                    CREATE INDEX IF NOT EXISTS idx_screenshots_entry ON screenshots(time_entry_id);
                    CREATE UNIQUE INDEX IF NOT EXISTS idx_single_running_timer ON time_entries(user_id) WHERE is_running = 1;
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

                for (const [k, v] of Object.entries(defaults)) {
                    await client.query(
                        'INSERT INTO settings (key, value) VALUES ($1, $2) ON CONFLICT (key) DO NOTHING',
                        [k, v]
                    );
                }

                // Create default admin if no users
                const { rows } = await client.query('SELECT COUNT(*) as count FROM users');
                if (parseInt(rows[0].count) === 0) {
                    const hash = bcrypt.hashSync('admin123', 10);
                    await client.query(
                        'INSERT INTO users (email, password_hash, name, role, avatar_color) VALUES ($1, $2, $3, $4, $5)',
                        ['admin@epochdash.local', hash, 'Admin', 'admin', '#8B5CF6']
                    );
                    console.log('✅ Default admin created: admin@epochdash.local / admin123');
                }

                await client.query('COMMIT');
                this.initialized = true;
            } catch (e) {
                await client.query('ROLLBACK');
                throw e;
            } finally {
                client.release();
            }
        } catch (e) {
            console.error('Database initialization error:', e);
            throw e;
        }
    }

    // ── Users ──
    async createUser(email, passwordHash, name, role = 'user') {
        const colors = ['#3B82F6','#8B5CF6','#EC4899','#10B981','#F59E0B','#EF4444','#06B6D4'];
        const color = colors[Math.floor(Math.random() * colors.length)];
        const result = await this.pool.query(
            'INSERT INTO users (email, password_hash, name, role, avatar_color) VALUES ($1, $2, $3, $4, $5) RETURNING *',
            [email, passwordHash, name, role, color]
        );
        return result.rows[0];
    }

    async getUserByEmail(email) {
        const result = await this.pool.query('SELECT * FROM users WHERE email = $1', [email]);
        return result.rows[0];
    }

    async getUserById(id) {
        const result = await this.pool.query(
            'SELECT id, email, name, role, is_active, avatar_color, created_at FROM users WHERE id = $1',
            [id]
        );
        return result.rows[0];
    }

    async getUsers() {
        const result = await this.pool.query(
            'SELECT id, email, name, role, is_active, avatar_color, created_at FROM users ORDER BY created_at DESC'
        );
        return result.rows;
    }

    async updateUser(id, fields) {
        const sets = [];
        const vals = [];
        let i = 1;
        for (const [k, v] of Object.entries(fields)) {
            if (['name', 'email', 'role', 'is_active', 'avatar_color'].includes(k)) {
                sets.push(`${k} = $${i++}`);
                vals.push(v);
            }
        }
        if (sets.length === 0) return null;
        vals.push(id);
        const result = await this.pool.query(
            `UPDATE users SET ${sets.join(', ')} WHERE id = $${i} RETURNING *`,
            vals
        );
        return result.rows[0];
    }

    async updateUserPassword(id, hash) {
        await this.pool.query('UPDATE users SET password_hash = $1 WHERE id = $2', [hash, id]);
    }

    // ── Projects ──
    async createProject(name, color, description, createdBy) {
        const result = await this.pool.query(
            'INSERT INTO projects (name, color, description, created_by) VALUES ($1, $2, $3, $4) RETURNING *',
            [name, color || '#3B82F6', description || '', createdBy]
        );
        return result.rows[0];
    }

    async getProjects(includeArchived = false) {
        const where = includeArchived ? '' : 'WHERE is_archived = 0';
        const result = await this.pool.query(`SELECT * FROM projects ${where} ORDER BY created_at DESC`);
        return result.rows;
    }

    async getProject(id) {
        const result = await this.pool.query('SELECT * FROM projects WHERE id = $1', [id]);
        return result.rows[0];
    }

    async updateProject(id, fields) {
        const sets = [];
        const vals = [];
        let i = 1;
        for (const [k, v] of Object.entries(fields)) {
            if (['name', 'color', 'description', 'is_archived'].includes(k)) {
                sets.push(`${k} = $${i++}`);
                vals.push(v);
            }
        }
        if (sets.length === 0) return null;
        vals.push(id);
        const result = await this.pool.query(
            `UPDATE projects SET ${sets.join(', ')} WHERE id = $${i} RETURNING *`,
            vals
        );
        return result.rows[0];
    }

    async addProjectMember(projectId, userId) {
        await this.pool.query(
            'INSERT INTO project_members (project_id, user_id) VALUES ($1, $2) ON CONFLICT DO NOTHING',
            [projectId, userId]
        );
    }

    async removeProjectMember(projectId, userId) {
        await this.pool.query('DELETE FROM project_members WHERE project_id = $1 AND user_id = $2', [projectId, userId]);
    }

    async getProjectMembers(projectId) {
        const result = await this.pool.query(`
            SELECT u.id, u.name, u.email, u.avatar_color
            FROM project_members pm JOIN users u ON pm.user_id = u.id
            WHERE pm.project_id = $1
        `, [projectId]);
        return result.rows;
    }

    async getUserProjects(userId) {
        const result = await this.pool.query(`
            SELECT DISTINCT p.* FROM projects p
            LEFT JOIN project_members pm ON p.id = pm.project_id
            WHERE (pm.user_id = $1 OR p.created_by = $2) AND p.is_archived = 0
            ORDER BY p.name
        `, [userId, userId]);
        return result.rows;
    }

    // ── Tasks ──
    async createTask(projectId, name) {
        const result = await this.pool.query(
            'INSERT INTO tasks (project_id, name) VALUES ($1, $2) RETURNING *',
            [projectId, name]
        );
        return result.rows[0];
    }

    async getTasks(projectId) {
        const result = await this.pool.query('SELECT * FROM tasks WHERE project_id = $1 ORDER BY name', [projectId]);
        return result.rows;
    }

    async deleteTask(id) {
        await this.pool.query('DELETE FROM tasks WHERE id = $1', [id]);
    }

    // ── Time Entries ──
    async createTimeEntry(userId, projectId, taskId, description, startTime) {
        const result = await this.pool.query(
            'INSERT INTO time_entries (user_id, project_id, task_id, description, start_time, is_running) VALUES ($1, $2, $3, $4, $5, 1) RETURNING *',
            [userId, projectId || null, taskId || null, description || '', startTime]
        );
        return result.rows[0];
    }

    async stopTimeEntry(id, endTime, duration) {
        await this.pool.query(
            'UPDATE time_entries SET end_time = $1, duration = $2, is_running = 0 WHERE id = $3',
            [endTime, duration, id]
        );
    }

    async getRunningEntry(userId) {
        const result = await this.pool.query(`
            SELECT te.*, p.name as project_name, p.color as project_color
            FROM time_entries te LEFT JOIN projects p ON te.project_id = p.id
            WHERE te.user_id = $1 AND te.is_running = 1
        `, [userId]);
        return result.rows[0];
    }

    async getTimeEntries(userId, from, to, projectId, isAdmin = false) {
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
        let i = 1;

        if (!isAdmin) {
            sql += ` AND te.user_id = $${i++}`;
            params.push(userId);
        }
        if (from) { sql += ` AND te.start_time >= $${i++}`; params.push(from); }
        if (to) { sql += ` AND te.start_time <= $${i++}`; params.push(to); }
        if (projectId) { sql += ` AND te.project_id = $${i++}`; params.push(projectId); }

        sql += ' ORDER BY te.start_time DESC LIMIT 500';
        const result = await this.pool.query(sql, params);
        return result.rows;
    }

    async deleteTimeEntry(id, userId, isAdmin = false) {
        if (isAdmin) {
            await this.pool.query('DELETE FROM time_entries WHERE id = $1', [id]);
        } else {
            await this.pool.query('DELETE FROM time_entries WHERE id = $1 AND user_id = $2', [id, userId]);
        }
    }

    async updateTimeEntry(id, fields, userId, isAdmin = false) {
        const sets = [];
        const vals = [];
        let i = 1;

        for (const [k, v] of Object.entries(fields)) {
            if (['project_id', 'task_id', 'description', 'start_time', 'end_time', 'duration'].includes(k)) {
                sets.push(`${k} = $${i++}`);
                vals.push(v);
            }
        }
        if (sets.length === 0) return null;
        
        let sql = `UPDATE time_entries SET ${sets.join(', ')} WHERE id = $${i++}`;
        vals.push(id);
        
        if (!isAdmin) {
            sql += ` AND user_id = $${i}`;
            vals.push(userId);
        }
        sql += ' RETURNING *';

        const result = await this.pool.query(sql, vals);
        return result.rows[0];
    }

    // ── Screenshots ──
    async createScreenshot(timeEntryId, userId, filename, thumbnail) {
        const result = await this.pool.query(
            'INSERT INTO screenshots (time_entry_id, user_id, filename, thumbnail) VALUES ($1, $2, $3, $4) RETURNING *',
            [timeEntryId, userId, filename, thumbnail || null]
        );
        return result.rows[0];
    }

    async getScreenshots(userId, date, isAdmin = false) {
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
        let i = 1;

        if (!isAdmin) {
            sql += ` AND s.user_id = $${i++}`;
            params.push(userId);
        }
        if (date) {
            sql += ` AND DATE(s.captured_at) = DATE($${i++})`;
            params.push(date);
        }

        sql += ' ORDER BY s.captured_at DESC LIMIT 200';
        const result = await this.pool.query(sql, params);
        return result.rows;
    }

    async getScreenshotById(id) {
        const result = await this.pool.query('SELECT * FROM screenshots WHERE id = $1', [id]);
        return result.rows[0];
    }

    async deleteScreenshot(id, userId, isAdmin = false) {
        const screenshot = await this.getScreenshotById(id);
        if (!screenshot) return null;
        if (!isAdmin && screenshot.user_id !== userId) return null;
        await this.pool.query('DELETE FROM screenshots WHERE id = $1', [id]);
        return screenshot;
    }

    // ── Reports ──
    async getReportByProject(userId, from, to, isAdmin = false) {
        let sql = `
            SELECT p.id, p.name, p.color, COALESCE(SUM(te.duration), 0) as total_seconds, COUNT(te.id) as entry_count
            FROM time_entries te
            LEFT JOIN projects p ON te.project_id = p.id
            WHERE te.is_running = 0
        `;
        const params = [];
        let i = 1;
        if (!isAdmin) { sql += ` AND te.user_id = $${i++}`; params.push(userId); }
        if (from) { sql += ` AND te.start_time >= $${i++}`; params.push(from); }
        if (to) { sql += ` AND te.start_time <= $${i++}`; params.push(to); }
        sql += ' GROUP BY p.id, p.name, p.color ORDER BY total_seconds DESC';
        const result = await this.pool.query(sql, params);
        return result.rows;
    }

    async getReportByDay(userId, from, to, isAdmin = false) {
        let sql = `
            SELECT DATE(te.start_time) as date, COALESCE(SUM(te.duration), 0) as total_seconds, COUNT(te.id) as entry_count
            FROM time_entries te
            WHERE te.is_running = 0
        `;
        const params = [];
        let i = 1;
        if (!isAdmin) { sql += ` AND te.user_id = $${i++}`; params.push(userId); }
        if (from) { sql += ` AND te.start_time >= $${i++}`; params.push(from); }
        if (to) { sql += ` AND te.start_time <= $${i++}`; params.push(to); }
        sql += ' GROUP BY DATE(te.start_time) ORDER BY date ASC';
        const result = await this.pool.query(sql, params);
        return result.rows;
    }

    async getReportByUser(from, to) {
        let sql = `
            SELECT u.id, u.name, u.avatar_color, COALESCE(SUM(te.duration), 0) as total_seconds, COUNT(te.id) as entry_count
            FROM time_entries te
            JOIN users u ON te.user_id = u.id
            WHERE te.is_running = 0
        `;
        const params = [];
        let i = 1;
        if (from) { sql += ` AND te.start_time >= $${i++}`; params.push(from); }
        if (to) { sql += ` AND te.start_time <= $${i++}`; params.push(to); }
        sql += ' GROUP BY u.id, u.name, u.avatar_color ORDER BY total_seconds DESC';
        const result = await this.pool.query(sql, params);
        return result.rows;
    }

    // ── Settings ──
    async getSettings() {
        const result = await this.pool.query('SELECT * FROM settings');
        const obj = {};
        for (const r of result.rows) obj[r.key] = r.value;
        return obj;
    }

    async updateSetting(key, value) {
        await this.pool.query(
            'INSERT INTO settings (key, value) VALUES ($1, $2) ON CONFLICT(key) DO UPDATE SET value = excluded.value',
            [key, String(value)]
        );
    }
}

module.exports = { DB };
