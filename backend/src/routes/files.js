const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const jwt = require('jsonwebtoken');
const { authenticateToken } = require('../middleware/auth');
const { uploadFile, getFileObject, getLocalFilePath, STORAGE_TYPE } = require('../services/fileStorage');
const { pool } = require('../db/pool');
const logger = require('../utils/logger');

const router = express.Router();
const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: parseInt(process.env.MAX_FILE_SIZE_MB || 50) * 1024 * 1024 },
});

function uploadSingleFile(req, res, next) {
    upload.single('file')(req, res, (err) => {
        if (!err) return next();

        if (err instanceof multer.MulterError && err.code === 'LIMIT_FILE_SIZE') {
            return res.status(413).json({ error: 'File is too large' });
        }

        logger.error('File upload parsing failed', err);
        return res.status(400).json({ error: 'Invalid file upload' });
    });
}

function validateFileKey(req, res, next) {
    if (!req.params.key || req.params.key !== path.basename(req.params.key)) {
        return res.status(400).json({ error: 'Invalid file key' });
    }
    next();
}

function createLocalFileToken(userId, key) {
    return jwt.sign(
        { purpose: 'file_download', userId, key },
        process.env.JWT_SECRET,
        { expiresIn: '5m' }
    );
}

function createFileToken(userId, key) {
    return jwt.sign(
        { purpose: 'file_download', userId, key },
        process.env.JWT_SECRET,
        { expiresIn: '5m' }
    );
}

async function canAccessFile(userId, key) {
    const result = await pool.query(
        `SELECT 1
         FROM messages m
         LEFT JOIN conversations c ON c.id=m.conversation_id
         LEFT JOIN group_members gm ON gm.group_id=m.group_id AND gm.user_id=$1
         LEFT JOIN groups g ON g.id=m.group_id
         WHERE m.file_ref=$2
           AND m.is_deleted=false
           AND m.expires_at > NOW()
           AND (
             (m.conversation_id IS NOT NULL AND (c.user_a=$1 OR c.user_b=$1))
             OR
             (m.group_id IS NOT NULL AND gm.user_id IS NOT NULL AND g.is_dissolved=false)
           )
         LIMIT 1`,
        [userId, key]
    );

    return result.rowCount > 0;
}

function authenticateFileRequest(req, res, next) {
    const queryToken = req.query.token;
    if (queryToken) {
        try {
            const payload = jwt.verify(queryToken, process.env.JWT_SECRET);
            if (payload.purpose === 'file_download' && payload.key === req.params.key) {
                req.user = { id: payload.userId };
                return next();
            }
        } catch {
            return res.status(403).json({ error: 'Invalid or expired file token' });
        }
        return res.status(403).json({ error: 'Invalid file token' });
    }

    return authenticateToken(req, res, next);
}

// Upload file (returns file_ref key)
router.post('/upload', authenticateToken, uploadSingleFile, async (req, res) => {
    if (!req.file) return res.status(400).json({ error: 'No file uploaded' });

    try {
        const key = await uploadFile(req.file.buffer, req.file.originalname, req.file.mimetype);
        res.json({ key, name: req.file.originalname, size: req.file.size, mime: req.file.mimetype });
    } catch (err) {
        logger.error('File upload failed', err);
        res.status(500).json({ error: 'File upload failed' });
    }
});

// Get signed/proxied URL for a file
router.get('/url/:key', authenticateToken, validateFileKey, async (req, res) => {
    try {
        if (!(await canAccessFile(req.user.id, req.params.key))) {
            return res.status(403).json({ error: 'File access denied' });
        }

        const token = createFileToken(req.user.id, req.params.key);
        return res.json({ url: `/api/files/${encodeURIComponent(req.params.key)}?token=${encodeURIComponent(token)}` });
    } catch (err) {
        logger.error('Failed to create file URL', err);
        res.status(500).json({ error: 'Failed to create file URL' });
    }
});

// Serve local files
router.get('/:key', validateFileKey, authenticateFileRequest, async (req, res) => {
    if (!(await canAccessFile(req.user.id, req.params.key))) {
        return res.status(403).json({ error: 'File access denied' });
    }

    if (STORAGE_TYPE === 'local') {
        const filePath = getLocalFilePath(req.params.key);
        if (!fs.existsSync(filePath)) return res.status(404).json({ error: 'File not found' });
        return res.sendFile(filePath);
    }

    try {
        const file = await getFileObject(req.params.key);
        if (file.contentType) res.setHeader('Content-Type', file.contentType);
        if (file.contentLength) res.setHeader('Content-Length', file.contentLength);
        if (file.contentDisposition) res.setHeader('Content-Disposition', file.contentDisposition);
        file.body.pipe(res);
    } catch (err) {
        logger.error('Failed to stream file', err);
        res.status(404).json({ error: 'File not found' });
    }
});

module.exports = router;
