const express = require('express');
const { authMiddleware } = require('../middleware/auth');

module.exports = function(db) {
    const router = express.Router();
    router.use(authMiddleware);

    // POST /api/timer/start
    router.post('/start', (req, res) => {
        try {
            // Check for existing running entry
            const running = db.getRunningEntry(req.user.id);
            if (running) {
                return res.status(409).json({ error: 'Timer already running', entry: running });
            }

            const { project_id, task_id, description } = req.body;
            const startTime = new Date().toISOString();
            const result = db.createTimeEntry(req.user.id, project_id, task_id, description, startTime);

            const entry = db.getRunningEntry(req.user.id);
            // Fetch settings for client
            const settings = db.getSettings();
            res.json({ entry, settings });
        } catch (err) {
            console.error('Timer start error:', err);
            res.status(500).json({ error: 'Failed to start timer' });
        }
    });

    // POST /api/timer/stop
    router.post('/stop', (req, res) => {
        try {
            const running = db.getRunningEntry(req.user.id);
            if (!running) {
                return res.status(404).json({ error: 'No running timer' });
            }

            const endTime = new Date().toISOString();
            const start = new Date(running.start_time);
            const end = new Date(endTime);
            const duration = Math.round((end - start) / 1000);

            db.stopTimeEntry(running.id, endTime, duration);

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
    router.get('/status', (req, res) => {
        try {
            const running = db.getRunningEntry(req.user.id);
            const settings = db.getSettings();
            res.json({ running: running || null, settings });
        } catch (err) {
            res.status(500).json({ error: 'Failed to get timer status' });
        }
    });

    return router;
};
