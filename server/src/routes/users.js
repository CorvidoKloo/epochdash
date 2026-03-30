const express = require('express');
const bcrypt = require('bcryptjs');
const { authMiddleware, adminMiddleware } = require('../middleware/auth');

module.exports = function(db) {
    const router = express.Router();
    router.use(authMiddleware);

    // GET /api/users — list all users (admin only)
    router.get('/', adminMiddleware, (req, res) => {
        try {
            const users = db.getUsers();
            res.json(users);
        } catch (err) {
            res.status(500).json({ error: 'Failed to fetch users' });
        }
    });

    // GET /api/users/:id
    router.get('/:id', adminMiddleware, (req, res) => {
        const user = db.getUserById(parseInt(req.params.id));
        if (!user) return res.status(404).json({ error: 'User not found' });
        res.json(user);
    });

    // PUT /api/users/:id — update user (admin only)
    router.put('/:id', adminMiddleware, (req, res) => {
        try {
            const id = parseInt(req.params.id);
            const { name, email, role, is_active, password } = req.body;

            const fields = {};
            if (name) fields.name = name;
            if (email) fields.email = email;
            if (role) fields.role = role;
            if (is_active !== undefined) fields.is_active = is_active ? 1 : 0;

            if (Object.keys(fields).length > 0) {
                db.updateUser(id, fields);
            }
            if (password) {
                const hash = bcrypt.hashSync(password, 10);
                db.updateUserPassword(id, hash);
            }

            const user = db.getUserById(id);
            res.json(user);
        } catch (err) {
            console.error('Update user error:', err);
            res.status(500).json({ error: 'Failed to update user' });
        }
    });

    // DELETE /api/users/:id — deactivate user (admin only)
    router.delete('/:id', adminMiddleware, (req, res) => {
        try {
            const id = parseInt(req.params.id);
            if (id === req.user.id) {
                return res.status(400).json({ error: 'Cannot deactivate yourself' });
            }
            db.updateUser(id, { is_active: 0 });
            res.json({ success: true });
        } catch (err) {
            res.status(500).json({ error: 'Failed to deactivate user' });
        }
    });

    return router;
};
