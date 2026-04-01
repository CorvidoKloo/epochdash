const express = require('express');
const multer = require('multer');
const path = require('path');
const { v4: uuidv4 } = require('uuid');
const { authMiddleware } = require('../middleware/auth');
const { S3Client, PutObjectCommand, DeleteObjectCommand, GetObjectCommand } = require('@aws-sdk/client-s3');
const { getSignedUrl } = require('@aws-sdk/s3-request-presigner');
require('dotenv').config();

// S3 Configuration
const s3Config = {
    region: process.env.AWS_REGION || 'us-east-1',
    credentials: {
        accessKeyId: process.env.AWS_ACCESS_KEY_ID || 'dummy',
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY || 'dummy'
    }
};
if (process.env.AWS_ENDPOINT) {
    s3Config.endpoint = process.env.AWS_ENDPOINT;
    s3Config.forcePathStyle = process.env.AWS_FORCE_PATH_STYLE === 'true';
}

const s3 = new S3Client(s3Config);
const BUCKET_NAME = process.env.AWS_S3_BUCKET || 'epochdash-screenshots';

module.exports = function(db) {
    const router = express.Router();
    router.use(authMiddleware);

    // Configure multer using memory storage since we send to S3
    const upload = multer({
        storage: multer.memoryStorage(),
        limits: { fileSize: 10 * 1024 * 1024 }, // 10MB
        fileFilter: (req, file, cb) => {
            const allowed = ['.jpg', '.jpeg', '.png', '.webp'];
            const ext = path.extname(file.originalname).toLowerCase();
            cb(null, allowed.includes(ext));
        }
    });

    const uploadToS3 = async (key, buffer, contentType) => {
        const command = new PutObjectCommand({
            Bucket: BUCKET_NAME,
            Key: key,
            Body: buffer,
            ContentType: contentType
        });
        await s3.send(command);
        return key;
    };

    // POST /api/screenshots/upload
    router.post('/upload', upload.fields([
        { name: 'screenshot', maxCount: 1 },
        { name: 'thumbnail', maxCount: 1 }
    ]), async (req, res) => {
        try {
            const { time_entry_id } = req.body;
            if (!req.files || !req.files.screenshot) {
                return res.status(400).json({ error: 'Screenshot file is required' });
            }

            const screenshotFile = req.files.screenshot[0];
            const date = new Date().toISOString().split('T')[0];
            const ext = path.extname(screenshotFile.originalname) || '.jpg';
            const basename = uuidv4();
            
            const screenshotPath = `screenshots/${date}/${basename}${ext}`;
            await uploadToS3(screenshotPath, screenshotFile.buffer, screenshotFile.mimetype);

            let thumbnailPath = null;
            if (req.files.thumbnail) {
                const thumbFile = req.files.thumbnail[0];
                const thumbExt = path.extname(thumbFile.originalname) || '.jpg';
                thumbnailPath = `screenshots/${date}/thumb_${basename}${thumbExt}`;
                await uploadToS3(thumbnailPath, thumbFile.buffer, thumbFile.mimetype);
            }

            const result = await db.createScreenshot(
                time_entry_id ? parseInt(time_entry_id) : null,
                req.user.id,
                screenshotPath,
                thumbnailPath
            );

            res.status(201).json({
                id: result.id,
                filename: screenshotPath,
                thumbnail: thumbnailPath
            });
        } catch (err) {
            console.error('Screenshot S3 upload error:', err);
            res.status(500).json({ error: 'Failed to upload screenshot to S3' });
        }
    });

    // POST /api/screenshots/upload-base64
    router.post('/upload-base64', async (req, res) => {
        try {
            const { time_entry_id, image, thumbnail: thumbData } = req.body;
            if (!image) {
                return res.status(400).json({ error: 'Image data is required' });
            }

            const date = new Date().toISOString().split('T')[0];
            const basename = uuidv4();
            const filename = `${basename}.jpg`;
            
            const buffer = Buffer.from(image.replace(/^data:image\/\w+;base64,/, ''), 'base64');
            const screenshotPath = `screenshots/${date}/${filename}`;
            await uploadToS3(screenshotPath, buffer, 'image/jpeg');

            let thumbnailPath = null;
            if (thumbData) {
                const thumbName = `thumb_${filename}`;
                const thumbBuffer = Buffer.from(thumbData.replace(/^data:image\/\w+;base64,/, ''), 'base64');
                thumbnailPath = `screenshots/${date}/${thumbName}`;
                await uploadToS3(thumbnailPath, thumbBuffer, 'image/jpeg');
            }

            const result = await db.createScreenshot(
                time_entry_id ? parseInt(time_entry_id) : null,
                req.user.id,
                screenshotPath,
                thumbnailPath
            );

            res.status(201).json({
                id: result.id,
                filename: screenshotPath,
                thumbnail: thumbnailPath
            });
        } catch (err) {
            console.error('Screenshot S3 base64 upload error:', err);
            res.status(500).json({ error: 'Failed to upload screenshot to S3', details: err.message, stack: err.stack, region: process.env.AWS_REGION, bucket: process.env.AWS_S3_BUCKET });
        }
    });

    // GET /api/screenshots
    router.get('/', async (req, res) => {
        try {
            const { date, user_id } = req.query;
            const isAdmin = req.user.role === 'admin';
            const screenshots = await db.getScreenshots(
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
    // Redirects to a presigned S3 url or generates one and streams it
    router.get('/:id/image', async (req, res) => {
        try {
            const screenshots = await db.getScreenshotById(parseInt(req.params.id));
            if (!screenshots) return res.status(404).json({ error: 'Screenshot not found' });

            const isAdmin = req.user.role === 'admin';
            if (!isAdmin && screenshots.user_id !== req.user.id) {
                return res.status(403).json({ error: 'Access denied' });
            }

            const command = new GetObjectCommand({
                Bucket: BUCKET_NAME,
                Key: screenshots.filename
            });

            const url = await getSignedUrl(s3, command, { expiresIn: 3600 });
            res.redirect(url);
        } catch (err) {
            console.error('S3 retrieve error:', err);
            res.status(500).json({ error: 'Failed to serve screenshot' });
        }
    });

    // DELETE /api/screenshots/:id
    router.delete('/:id', async (req, res) => {
        try {
            const isAdmin = req.user.role === 'admin';
            const screenshot = await db.deleteScreenshot(parseInt(req.params.id), req.user.id, isAdmin);
            if (!screenshot) return res.status(404).json({ error: 'Screenshot not found' });

            // Delete from S3
            const delMain = new DeleteObjectCommand({ Bucket: BUCKET_NAME, Key: screenshot.filename });
            await s3.send(delMain).catch(e => console.error("S3 Cleanup error:", e));

            if (screenshot.thumbnail) {
                const delThumb = new DeleteObjectCommand({ Bucket: BUCKET_NAME, Key: screenshot.thumbnail });
                await s3.send(delThumb).catch(e => console.error("S3 Cleanup error:", e));
            }

            res.json({ success: true });
        } catch (err) {
            console.error('Delete S3 screenshot error:', err);
            res.status(500).json({ error: 'Failed to delete screenshot' });
        }
    });

    return router;
};
