const express = require('express');
const { authMiddleware } = require('../middleware/auth');

module.exports = function(db) {
    const router = express.Router();
    router.use(authMiddleware);

    // POST /api/timer/start
    router.post('/start', async (req, res) => {
        try {
            // Check for existing running entry
            const running = await db.getRunningEntry(req.user.id);
            if (running) {
                return res.status(409).json({ error: 'Timer already running', entry: running });
            }

            const { project_id, task_id, description } = req.body;
            const startTime = new Date().toISOString();
            const result = await db.createTimeEntry(req.user.id, project_id, task_id, description, startTime);

            const entry = await db.getRunningEntry(req.user.id);
            // Fetch settings for client
            const settings = await db.getSettings();
            res.json({ entry, settings });
        } catch (err) {
            console.error('Timer start error:', err);
            res.status(500).json({ error: 'Failed to start timer' });
        }
    });

    // POST /api/timer/stop
    router.post('/stop', async (req, res) => {
        try {
            const running = await db.getRunningEntry(req.user.id);
            if (!running) {
                return res.status(404).json({ error: 'No running timer' });
            }

            const endTime = new Date().toISOString();
            const start = new Date(running.start_time);
            const end = new Date(endTime);
            const duration = Math.round((end - start) / 1000);

            await db.stopTimeEntry(running.id, endTime, duration);

            res.json({
                id: running.id,
                start_time: running.start_time,
                end_time: endTime,
                duration,
                project_name: running.project_name,
                project_color: running.project_color
            });
        } catch (err) {
            console.error('Timer stop error:', err);
            res.status(500).json({ error: 'Failed to stop timer' });
        }
    });

    // GET /api/timer/status
    router.get('/status', async (req, res) => {
        try {
            const running = await db.getRunningEntry(req.user.id);
            const settings = await db.getSettings();
            res.json({ running: running || null, settings });
        } catch (err) {
            res.status(500).json({ error: 'Failed to get timer status' });
        }
    });

    // Temporary debug route - confirm if Env Vars are loaded
    router.get('/debug-env', async (req, res) => {
        const keys = ['EPC_S3_KEY_ID', 'EPC_S3_SECRET', 'EPC_S3_REGION', 'EPC_S3_BUCKET', 'EPC_S3_ENDPOINT'];
        const status = {};
        keys.forEach(k => {
            const val = process.env[k];
            status[k] = val ? `present (${val.length} chars) - starts with: ${val.substring(0, 3)}...` : 'absent';
        });
        res.json(status);
    });

    return router;
};
