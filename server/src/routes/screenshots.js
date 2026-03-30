const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { v4: uuidv4 } = require('uuid');
const { authMiddleware } = require('../middleware/auth');

module.exports = function(db) {
    const router = express.Router();
    router.use(authMiddleware);

    // Configure multer storage
    const storage = multer.diskStorage({
        destination: (req, file, cb) => {
            const date = new Date().toISOString().split('T')[0];
            const dir = path.join(__dirname, '..', '..', 'uploads', 'screenshots', date);
            if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
            cb(null, dir);
        },
        filename: (req, file, cb) => {
            const ext = path.extname(file.originalname) || '.jpg';
            cb(null, `${uuidv4()}${ext}`);
        }
    });

    const upload = multer({
        storage,
        limits: { fileSize: 10 * 1024 * 1024 }, // 10MB
        fileFilter: (req, file, cb) => {
            const allowed = ['.jpg', '.jpeg', '.png', '.webp'];
            const ext = path.extname(file.originalname).toLowerCase();
            cb(null, allowed.includes(ext));
        }
    });

    // POST /api/screenshots/upload
    router.post('/upload', upload.fields([
        { name: 'screenshot', maxCount: 1 },
        { name: 'thumbnail', maxCount: 1 }
    ]), (req, res) => {
        try {
            const { time_entry_id } = req.body;
            if (!req.files || !req.files.screenshot) {
                return res.status(400).json({ error: 'Screenshot file is required' });
            }

            const screenshotFile = req.files.screenshot[0];
            const date = new Date().toISOString().split('T')[0];
            const screenshotPath = `screenshots/${date}/${screenshotFile.filename}`;

            let thumbnailPath = null;
            if (req.files.thumbnail) {
                thumbnailPath = `screenshots/${date}/${req.files.thumbnail[0].filename}`;
            }

            const result = db.createScreenshot(
                time_entry_id ? parseInt(time_entry_id) : null,
                req.user.id,
                screenshotPath,
                thumbnailPath
            );

            res.status(201).json({
                id: result.lastInsertRowid,
                filename: screenshotPath,
                thumbnail: thumbnailPath
            });
        } catch (err) {
            console.error('Screenshot upload error:', err);
            res.status(500).json({ error: 'Failed to upload screenshot' });
        }
    });

    // POST /api/screenshots/upload-base64 (alternative for Electron client)
    router.post('/upload-base64', (req, res) => {
        try {
            const { time_entry_id, image, thumbnail: thumbData } = req.body;
            if (!image) {
                return res.status(400).json({ error: 'Image data is required' });
            }

            const date = new Date().toISOString().split('T')[0];
            const dir = path.join(__dirname, '..', '..', 'uploads', 'screenshots', date);
            if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

            // Save main screenshot
            const filename = `${uuidv4()}.jpg`;
            const buffer = Buffer.from(image.replace(/^data:image\/\w+;base64,/, ''), 'base64');
            fs.writeFileSync(path.join(dir, filename), buffer);
            const screenshotPath = `screenshots/${date}/${filename}`;

            // Save thumbnail
            let thumbnailPath = null;
            if (thumbData) {
                const thumbName = `thumb_${filename}`;
                const thumbBuffer = Buffer.from(thumbData.replace(/^data:image\/\w+;base64,/, ''), 'base64');
                fs.writeFileSync(path.join(dir, thumbName), thumbBuffer);
                thumbnailPath = `screenshots/${date}/${thumbName}`;
            }

            const result = db.createScreenshot(
                time_entry_id ? parseInt(time_entry_id) : null,
                req.user.id,
                screenshotPath,
                thumbnailPath
            );

            res.status(201).json({
                id: result.lastInsertRowid,
                filename: screenshotPath,
                thumbnail: thumbnailPath
            });
        } catch (err) {
            console.error('Screenshot upload error:', err);
            res.status(500).json({ error: 'Failed to upload screenshot' });
        }
    });

    // GET /api/screenshots
    router.get('/', (req, res) => {
        try {
            const { date, user_id } = req.query;
            const isAdmin = req.user.role === 'admin';
            const screenshots = db.getScreenshots(
                user_id && isAdmin ? parseInt(user_id) : req.user.id,
                date,
                isAdmin && !user_id
            );
            res.json(screenshots);
        } catch (err) {
            res.status(500).json({ error: 'Failed to fetch screenshots' });
        }
    });

    // GET /api/screenshots/:id/image
    router.get('/:id/image', (req, res) => {
        try {
            const screenshots = db.db.prepare('SELECT * FROM screenshots WHERE id = ?').get(parseInt(req.params.id));
            if (!screenshots) return res.status(404).json({ error: 'Screenshot not found' });

            const isAdmin = req.user.role === 'admin';
            if (!isAdmin && screenshots.user_id !== req.user.id) {
                return res.status(403).json({ error: 'Access denied' });
            }

            const filePath = path.join(__dirname, '..', '..', 'uploads', screenshots.filename);
            if (!fs.existsSync(filePath)) return res.status(404).json({ error: 'File not found' });

            res.sendFile(filePath);
        } catch (err) {
            res.status(500).json({ error: 'Failed to serve screenshot' });
        }
    });

    // DELETE /api/screenshots/:id
    router.delete('/:id', (req, res) => {
        try {
            const isAdmin = req.user.role === 'admin';
            const screenshot = db.deleteScreenshot(parseInt(req.params.id), req.user.id, isAdmin);
            if (!screenshot) return res.status(404).json({ error: 'Screenshot not found' });

            // Delete files
            const mainPath = path.join(__dirname, '..', '..', 'uploads', screenshot.filename);
            if (fs.existsSync(mainPath)) fs.unlinkSync(mainPath);
            if (screenshot.thumbnail) {
                const thumbPath = path.join(__dirname, '..', '..', 'uploads', screenshot.thumbnail);
                if (fs.existsSync(thumbPath)) fs.unlinkSync(thumbPath);
            }

            res.json({ success: true });
        } catch (err) {
            res.status(500).json({ error: 'Failed to delete screenshot' });
        }
    });

    return router;
};
