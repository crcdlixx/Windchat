const express = require('express');
const bcrypt = require('bcryptjs');
const fs = require('fs');
const path = require('path');
const multer = require('multer');
const { pool } = require('../db/pool');
const { authenticateToken } = require('../middleware/auth');
const { uploadFile, getFileObject, getLocalFilePath, STORAGE_TYPE } = require('../services/fileStorage');
const logger = require('../utils/logger');
const {
    AVATAR_PREFIX,
    normalizeAvatarUrl,
    normalizeDisplayName,
} = require('./profileValidation');

const router = express.Router();

const AVATAR_MIME_TYPES = new Set(['image/png', 'image/jpeg', 'image/gif', 'image/webp']);
const avatarUpload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 2 * 1024 * 1024 },
});

function uploadAvatar(req, res, next) {
    avatarUpload.single('avatar')(req, res, (err) => {
        if (!err) return next();

        if (err instanceof multer.MulterError && err.code === 'LIMIT_FILE_SIZE') {
            return res.status(413).json({ error: 'Avatar image is too large' });
        }

        logger.error('Avatar upload parsing failed', err);
        return res.status(400).json({ error: 'Invalid avatar upload' });
    });
}

function validateAvatarKey(req, res, next) {
    if (!req.params.key || req.params.key !== path.basename(req.params.key)) {
        return res.status(400).json({ error: 'Invalid avatar key' });
    }
    next();
}

async function getProfile(userId) {
    const result = await pool.query(
        'SELECT id, username, display_name, avatar_url, role, created_at, last_seen, email, email_verified, totp_enabled FROM users WHERE id=$1',
        [userId]
    );
    return result.rows[0] || null;
}

// Get current user profile
router.get('/me', authenticateToken, async (req, res) => {
    const profile = await getProfile(req.user.id);
    if (!profile) return res.status(404).json({ error: 'User not found' });
    res.json(profile);
});

// Update profile
router.patch('/me', authenticateToken, async (req, res) => {
    let displayName;
    let avatarUrl;
    try {
        displayName = normalizeDisplayName(req.body.display_name);
        avatarUrl = normalizeAvatarUrl(req.body.avatar_url);
    } catch (err) {
        return res.status(400).json({ error: err.message });
    }

    const fields = [];
    const values = [];
    let idx = 1;

    if (displayName !== undefined) {
        fields.push(`display_name=$${idx++}`);
        values.push(displayName);
    }
    if (avatarUrl !== undefined) {
        fields.push(`avatar_url=$${idx++}`);
        values.push(avatarUrl);
    }

    if (fields.length === 0) return res.status(400).json({ error: 'No fields to update' });
    values.push(req.user.id);

    await pool.query(`UPDATE users SET ${fields.join(', ')} WHERE id=$${idx}`, values);

    const profile = await getProfile(req.user.id);
    if (!profile) return res.status(404).json({ error: 'User not found' });
    res.json(profile);
});

// Change password
router.patch('/me/password', authenticateToken, async (req, res) => {
    const { current_password, new_password } = req.body;
    if (!current_password || !new_password) {
        return res.status(400).json({ error: 'Both current and new password required' });
    }
    if (new_password.length < 8) {
        return res.status(400).json({ error: 'New password must be at least 8 characters' });
    }

    try {
        const result = await pool.query('SELECT password_hash FROM users WHERE id=$1', [req.user.id]);
        const user = result.rows[0];
        if (!user) return res.status(404).json({ error: 'User not found' });

        const valid = await bcrypt.compare(current_password, user.password_hash);
        if (!valid) return res.status(401).json({ error: 'Current password is incorrect' });

        const newHash = await bcrypt.hash(new_password, 12);
        await pool.query('UPDATE users SET password_hash=$1 WHERE id=$2', [newHash, req.user.id]);
        await pool.query('DELETE FROM refresh_tokens WHERE user_id=$1', [req.user.id]);

        res.json({ ok: true });
    } catch (err) {
        res.status(500).json({ error: 'Failed to change password' });
    }
});

// Search users
router.get('/search', authenticateToken, async (req, res) => {
    const { q } = req.query;
    if (!q || q.length < 2) return res.status(400).json({ error: 'Query too short' });

    const result = await pool.query(
        `SELECT id, username, display_name, avatar_url, last_seen
         FROM users WHERE username ILIKE $1 AND is_banned=false LIMIT 20`,
        [`%${q}%`]
    );
    res.json(result.rows);
});

// Upload current user avatar
router.post('/me/avatar', authenticateToken, uploadAvatar, async (req, res) => {
    if (!req.file) return res.status(400).json({ error: 'No avatar uploaded' });
    if (!AVATAR_MIME_TYPES.has(req.file.mimetype)) {
        return res.status(400).json({ error: 'Avatar must be a PNG, JPEG, GIF, or WebP image' });
    }

    try {
        const key = await uploadFile(req.file.buffer, req.file.originalname || 'avatar', req.file.mimetype);
        const avatarUrl = `${AVATAR_PREFIX}${encodeURIComponent(key)}`;
        await pool.query('UPDATE users SET avatar_url=$1 WHERE id=$2', [avatarUrl, req.user.id]);

        const profile = await getProfile(req.user.id);
        if (!profile) return res.status(404).json({ error: 'User not found' });
        res.json(profile);
    } catch (err) {
        logger.error('Avatar upload failed', err);
        res.status(500).json({ error: 'Avatar upload failed' });
    }
});

// Serve public user avatars
router.get('/avatar/:key', validateAvatarKey, async (req, res) => {
    res.setHeader('Cache-Control', 'public, max-age=86400');

    if (STORAGE_TYPE === 'local') {
        const filePath = getLocalFilePath(req.params.key);
        if (!fs.existsSync(filePath)) return res.status(404).json({ error: 'Avatar not found' });
        return res.sendFile(filePath);
    }

    try {
        const file = await getFileObject(req.params.key);
        if (file.contentType) res.setHeader('Content-Type', file.contentType);
        if (file.contentLength) res.setHeader('Content-Length', file.contentLength);
        file.body.pipe(res);
    } catch (err) {
        logger.error('Failed to stream avatar', err);
        res.status(404).json({ error: 'Avatar not found' });
    }
});

// Get user by id
router.get('/:id', authenticateToken, async (req, res) => {
    const result = await pool.query(
        'SELECT id, username, display_name, avatar_url, last_seen FROM users WHERE id=$1 AND is_banned=false',
        [req.params.id]
    );
    if (!result.rows[0]) return res.status(404).json({ error: 'User not found' });
    res.json(result.rows[0]);
});

module.exports = router;
