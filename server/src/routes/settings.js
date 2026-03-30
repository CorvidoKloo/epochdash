const express = require('express');
const { authMiddleware, adminMiddleware } = require('../middleware/auth');

module.exports = function(db) {
    const router = express.Router();
    router.use(authMiddleware);

    // GET /api/settings
    router.get('/', (req, res) => {
        try {
            const settings = db.getSettings();
            res.json(settings);
        } catch (err) {
            res.status(500).json({ error: 'Failed to fetch settings' });
        }
    });

    // PUT /api/settings
    router.put('/', adminMiddleware, (req, res) => {
        try {
            const allowedKeys = [
                'screenshots_enabled',
                'screenshot_interval',
                'screenshot_blur',
                'screenshot_quality',
                'idle_threshold',
                'notify_users'
            ];

            for (const [key, value] of Object.entries(req.body)) {
                if (allowedKeys.includes(key)) {
                    db.updateSetting(key, value);
                }
            }

            const settings = db.getSettings();
            res.json(settings);
        } catch (err) {
            res.status(500).json({ error: 'Failed to update settings' });
        }
    });

    return router;
};
