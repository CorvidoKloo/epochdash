const express = require('express');
const bcrypt = require('bcryptjs');
const { generateToken } = require('../middleware/auth');
const { authMiddleware, adminMiddleware } = require('../middleware/auth');

module.exports = function(db) {
    const router = express.Router();

    // POST /api/auth/login
    router.post('/login', async (req, res) => {
        try {
            const { email, password } = req.body;
            if (!email || !password) {
                return res.status(400).json({ error: 'Email and password are required' });
            }

            const user = await db.getUserByEmail(email);
            if (!user) {
                return res.status(401).json({ error: 'Invalid credentials' });
            }
            if (!user.is_active) {
                return res.status(403).json({ error: 'Account is deactivated' });
            }

            const valid = bcrypt.compareSync(password, user.password_hash);
            if (!valid) {
                return res.status(401).json({ error: 'Invalid credentials' });
            }

            const token = generateToken(user);
            res.json({
                token,
                user: {
                    id: user.id,
                    email: user.email,
                    name: user.name,
                    role: user.role,
                    avatar_color: user.avatar_color
                }
            });
        } catch (err) {
            console.error('Login error:', err);
            res.status(500).json({ error: 'Login failed' });
        }
    });

    // POST /api/auth/register (admin only)
    router.post('/register', authMiddleware, adminMiddleware, async (req, res) => {
        try {
            const { email, password, name, role } = req.body;
            if (!email || !password || !name) {
                return res.status(400).json({ error: 'Email, password, and name are required' });
            }

            const existing = await db.getUserByEmail(email);
            if (existing) {
                return res.status(409).json({ error: 'Email already exists' });
            }

            const hash = bcrypt.hashSync(password, 10);
            const user = await db.createUser(email, hash, name, role || 'user');

            res.status(201).json(user);
        } catch (err) {
            console.error('Register error:', err);
            res.status(500).json({ error: 'Registration failed' });
        }
    });

    // GET /api/auth/me
    router.get('/me', authMiddleware, async (req, res) => {
        const user = await db.getUserById(req.user.id);
        if (!user) return res.status(404).json({ error: 'User not found' });
        res.json(user);
    });

    return router;
};
