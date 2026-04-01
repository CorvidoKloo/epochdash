const express = require('express');
const path = require('path');
const cors = require('cors');
const fs = require('fs');
const { DB } = require('./src/database');

// Ensure upload directories exist ONLY if not running on Vercel (serverless uses S3)
if (!process.env.VERCEL) {
    const uploadsDir = path.join(__dirname, 'uploads', 'screenshots');
    if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });
}

require('dotenv').config();
const db = new DB(process.env.DATABASE_URL || 'postgres://localhost:5432/epochdash');
db.connect().catch(e => {
    console.error('Failed to connect to database', e);
});

// Create Express app
const app = express();
app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// Serve dashboard static files
app.use(express.static(path.join(__dirname, 'dashboard')));

// Serve uploaded screenshots
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// API routes
app.use('/api/auth', require('./src/routes/auth')(db));
app.use('/api/users', require('./src/routes/users')(db));
app.use('/api/projects', require('./src/routes/projects')(db));
app.use('/api/timer', require('./src/routes/timer')(db));
app.use('/api/time-entries', require('./src/routes/time-entries')(db));
app.use('/api/screenshots', require('./src/routes/screenshots')(db));
app.use('/api/reports', require('./src/routes/reports')(db));
app.use('/api/settings', require('./src/routes/settings')(db));

// SPA fallback — serve index.html for non-API routes
app.get('*', (req, res) => {
    if (req.path.startsWith('/api/')) {
        return res.status(404).json({ error: 'Endpoint not found' });
    }
    res.sendFile(path.join(__dirname, 'dashboard', 'index.html'));
});

// Error handler
app.use((err, req, res, next) => {
    console.error('Server error:', err);
    res.status(500).json({ error: 'Internal server error' });
});

const PORT = process.env.PORT || 3847;
if (!process.env.VERCEL) {
    app.listen(PORT, '0.0.0.0', () => {
        console.log(`
╔══════════════════════════════════════════════╗
║          Epoch Dash Server v1.0         ║
║──────────────────────────────────────────────║
║  Dashboard:  http://localhost:${PORT}           ║
║  API:        http://localhost:${PORT}/api       ║
║                                              ║
║  Default Admin Login:                        ║
║    Email:    admin@epochdash.local          ║
║    Password: admin123                        ║
╚══════════════════════════════════════════════╝
        `);
    });
}

module.exports = app;
