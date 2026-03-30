const express = require('express');
const { authMiddleware } = require('../middleware/auth');

module.exports = function(db) {
    const router = express.Router();
    router.use(authMiddleware);

    // GET /api/reports
    router.get('/', async (req, res) => {
        try {
            const { from, to, type, user_id } = req.query;
            const isAdmin = req.user.role === 'admin';
            const targetUser = isAdmin && user_id ? parseInt(user_id) : req.user.id;

            const byProject = await db.getReportByProject(targetUser, from, to, isAdmin && !user_id);
            const byDay = await db.getReportByDay(targetUser, from, to, isAdmin && !user_id);

            let byUser = [];
            if (isAdmin) {
                byUser = await db.getReportByUser(from, to);
            }

            // Calculate totals
            const totalSeconds = byProject.reduce((sum, p) => sum + (p.total_seconds || 0), 0);
            const totalEntries = byProject.reduce((sum, p) => sum + (p.entry_count || 0), 0);

            res.json({
                summary: {
                    total_seconds: totalSeconds,
                    total_entries: totalEntries,
                    total_hours: Math.round(totalSeconds / 36) / 100
                },
                by_project: byProject,
                by_day: byDay,
                by_user: byUser
            });
        } catch (err) {
            console.error('Report error:', err);
            res.status(500).json({ error: 'Failed to generate report' });
        }
    });

    // GET /api/reports/export
    router.get('/export', async (req, res) => {
        try {
            const { from, to } = req.query;
            const isAdmin = req.user.role === 'admin';
            const entries = await db.getTimeEntries(req.user.id, from, to, null, isAdmin);

            // Generate CSV
            const headers = ['Date', 'User', 'Project', 'Task', 'Description', 'Start Time', 'End Time', 'Duration (hours)'];
            const rows = entries.map(e => [
                e.start_time ? e.start_time.split('T')[0] : '',
                e.user_name || '',
                e.project_name || 'No Project',
                e.task_name || '',
                (e.description || '').replace(/"/g, '""'),
                e.start_time || '',
                e.end_time || '',
                (e.duration / 3600).toFixed(2)
            ]);

            const csv = [headers.join(','), ...rows.map(r => r.map(c => `"${c}"`).join(','))].join('\n');

            res.setHeader('Content-Type', 'text/csv');
            res.setHeader('Content-Disposition', `attachment; filename=timetracker-export-${new Date().toISOString().split('T')[0]}.csv`);
            res.send(csv);
        } catch (err) {
            res.status(500).json({ error: 'Failed to export report' });
        }
    });

    return router;
};
