const express = require('express');
const bcrypt = require('bcryptjs');
const { pool } = require('../db/pool');
const { authenticateToken } = require('../middleware/auth');

const router = express.Router();

// Get current user profile
router.get('/me', authenticateToken, async (req, res) => {
    const result = await pool.query(
        'SELECT id, username, display_name, avatar_url, role, created_at, last_seen, email, email_verified, totp_enabled FROM users WHERE id=$1',
        [req.user.id]
    );
    if (!result.rows[0]) return res.status(404).json({ error: 'User not found' });
    res.json(result.rows[0]);
});

// Update profile
router.patch('/me', authenticateToken, async (req, res) => {
    const { display_name, avatar_url } = req.body;
    const fields = [];
    const values = [];
    let idx = 1;

    if (display_name !== undefined) {
        if (typeof display_name !== 'string' || display_name.length > 64) {
            return res.status(400).json({ error: 'Invalid display_name' });
        }
        fields.push(`display_name=$${idx++}`);
        values.push(display_name);
    }
    if (avatar_url !== undefined) {
        fields.push(`avatar_url=$${idx++}`);
        values.push(avatar_url);
    }

    if (fields.length === 0) return res.status(400).json({ error: 'No fields to update' });
    values.push(req.user.id);

    const result = await pool.query(
        `UPDATE users SET ${fields.join(', ')} WHERE id=$${idx} RETURNING id, username, display_name, avatar_url`,
        values
    );
    res.json(result.rows[0]);
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
