const express = require('express');
const { authMiddleware } = require('../middleware/auth');

module.exports = function(db) {
    const router = express.Router();
    router.use(authMiddleware);

    // GET /api/time-entries
    router.get('/', async (req, res) => {
        try {
            const { from, to, project_id } = req.query;
            const isAdmin = req.user.role === 'admin';
            const entries = await db.getTimeEntries(req.user.id, from, to, project_id, isAdmin);
            res.json(entries);
        } catch (err) {
            res.status(500).json({ error: 'Failed to fetch time entries' });
        }
    });

    // POST /api/time-entries (manual entry)
    router.post('/', async (req, res) => {
        try {
            const { project_id, task_id, description, start_time, end_time } = req.body;
            if (!start_time || !end_time) {
                return res.status(400).json({ error: 'start_time and end_time are required' });
            }

            const start = new Date(start_time);
            const end = new Date(end_time);
            const duration = Math.round((end - start) / 1000);
            if (duration <= 0) {
                return res.status(400).json({ error: 'end_time must be after start_time' });
            }

            const result = await db.createTimeEntry(req.user.id, project_id, task_id, description, start_time);
            const id = result.id;
            await db.stopTimeEntry(id, end_time, duration);

            res.status(201).json({ id, start_time, end_time, duration });
        } catch (err) {
            console.error('Create entry error:', err);
            res.status(500).json({ error: 'Failed to create time entry' });
        }
    });

    // PUT /api/time-entries/:id
    router.put('/:id', async (req, res) => {
        try {
            const id = parseInt(req.params.id);
            const isAdmin = req.user.role === 'admin';
            const fields = {};

            if (req.body.project_id !== undefined) fields.project_id = req.body.project_id;
            if (req.body.task_id !== undefined) fields.task_id = req.body.task_id;
            if (req.body.description !== undefined) fields.description = req.body.description;
            if (req.body.start_time) fields.start_time = req.body.start_time;
            if (req.body.end_time) fields.end_time = req.body.end_time;

            // Recalculate duration if times changed
            if (fields.start_time || fields.end_time) {
                const s = new Date(fields.start_time || req.body.original_start);
                const e = new Date(fields.end_time || req.body.original_end);
                fields.duration = Math.round((e - s) / 1000);
            }

            await db.updateTimeEntry(id, fields, req.user.id, isAdmin);
            res.json({ success: true });
        } catch (err) {
            res.status(500).json({ error: 'Failed to update time entry' });
        }
    });

    // DELETE /api/time-entries/:id
    router.delete('/:id', async (req, res) => {
        try {
            const id = parseInt(req.params.id);
            const isAdmin = req.user.role === 'admin';
            await db.deleteTimeEntry(id, req.user.id, isAdmin);
            res.json({ success: true });
        } catch (err) {
            res.status(500).json({ error: 'Failed to delete time entry' });
        }
    });

    return router;
};
