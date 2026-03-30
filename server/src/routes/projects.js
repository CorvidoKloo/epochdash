const express = require('express');
const { authMiddleware, adminMiddleware } = require('../middleware/auth');

module.exports = function(db) {
    const router = express.Router();
    router.use(authMiddleware);

    // GET /api/projects
    router.get('/', (req, res) => {
        try {
            const isAdmin = req.user.role === 'admin';
            const projects = isAdmin ? db.getProjects() : db.getUserProjects(req.user.id);
            // Attach member count
            const result = projects.map(p => {
                const members = db.getProjectMembers(p.id);
                return { ...p, member_count: members.length, members };
            });
            res.json(result);
        } catch (err) {
            res.status(500).json({ error: 'Failed to fetch projects' });
        }
    });

    // POST /api/projects
    router.post('/', (req, res) => {
        try {
            const { name, color, description, member_ids } = req.body;
            if (!name) return res.status(400).json({ error: 'Project name is required' });

            const result = db.createProject(name, color, description, req.user.id);
            const projectId = result.lastInsertRowid;

            // Add creator as member
            db.addProjectMember(projectId, req.user.id);

            // Add additional members
            if (member_ids && Array.isArray(member_ids)) {
                for (const uid of member_ids) {
                    db.addProjectMember(projectId, uid);
                }
            }

            const project = db.getProject(projectId);
            const members = db.getProjectMembers(projectId);
            res.status(201).json({ ...project, members, member_count: members.length });
        } catch (err) {
            console.error('Create project error:', err);
            res.status(500).json({ error: 'Failed to create project' });
        }
    });

    // PUT /api/projects/:id
    router.put('/:id', (req, res) => {
        try {
            const id = parseInt(req.params.id);
            const { name, color, description, is_archived, member_ids } = req.body;

            db.updateProject(id, { name, color, description, is_archived });

            // Update members if provided
            if (member_ids && Array.isArray(member_ids)) {
                const current = db.getProjectMembers(id).map(m => m.id);
                // Remove members not in new list
                for (const uid of current) {
                    if (!member_ids.includes(uid)) db.removeProjectMember(id, uid);
                }
                // Add new members
                for (const uid of member_ids) {
                    db.addProjectMember(id, uid);
                }
            }

            const project = db.getProject(id);
            const members = db.getProjectMembers(id);
            res.json({ ...project, members, member_count: members.length });
        } catch (err) {
            res.status(500).json({ error: 'Failed to update project' });
        }
    });

    // DELETE /api/projects/:id (archive)
    router.delete('/:id', adminMiddleware, (req, res) => {
        try {
            db.updateProject(parseInt(req.params.id), { is_archived: 1 });
            res.json({ success: true });
        } catch (err) {
            res.status(500).json({ error: 'Failed to archive project' });
        }
    });

    // GET /api/projects/:id/tasks
    router.get('/:id/tasks', (req, res) => {
        const tasks = db.getTasks(parseInt(req.params.id));
        res.json(tasks);
    });

    // POST /api/projects/:id/tasks
    router.post('/:id/tasks', (req, res) => {
        try {
            const { name } = req.body;
            if (!name) return res.status(400).json({ error: 'Task name is required' });
            const result = db.createTask(parseInt(req.params.id), name);
            res.status(201).json({ id: result.lastInsertRowid, name, project_id: parseInt(req.params.id) });
        } catch (err) {
            res.status(500).json({ error: 'Failed to create task' });
        }
    });

    // DELETE /api/projects/:projectId/tasks/:taskId
    router.delete('/:projectId/tasks/:taskId', (req, res) => {
        db.deleteTask(parseInt(req.params.taskId));
        res.json({ success: true });
    });

    return router;
};
