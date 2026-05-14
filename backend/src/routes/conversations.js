const express = require('express');
const { pool } = require('../db/pool');
const { authenticateToken } = require('../middleware/auth');

const router = express.Router();

// Get or create DM conversation
router.post('/', authenticateToken, async (req, res) => {
    const { user_id } = req.body;
    if (!user_id || user_id === req.user.id) {
        return res.status(400).json({ error: 'Invalid user_id' });
    }

    const [userA, userB] = [req.user.id, user_id].sort();

    const existing = await pool.query(
        'SELECT * FROM conversations WHERE user_a=$1 AND user_b=$2',
        [userA, userB]
    );
    if (existing.rows[0]) return res.json(existing.rows[0]);

    const result = await pool.query(
        'INSERT INTO conversations (user_a, user_b) VALUES ($1,$2) RETURNING *',
        [userA, userB]
    );
    res.status(201).json(result.rows[0]);
});

// List my conversations
router.get('/', authenticateToken, async (req, res) => {
    const result = await pool.query(
        `SELECT c.id, c.message_ttl_seconds, c.created_at,
                u.id as partner_id, u.username as partner_username,
                u.display_name as partner_display_name, u.avatar_url as partner_avatar,
                u.last_seen as partner_last_seen
         FROM conversations c
         JOIN users u ON (CASE WHEN c.user_a=$1 THEN c.user_b ELSE c.user_a END) = u.id
         WHERE c.user_a=$1 OR c.user_b=$1
         ORDER BY c.created_at DESC`,
        [req.user.id]
    );
    res.json(result.rows);
});

// Update TTL for conversation
router.patch('/:id/ttl', authenticateToken, async (req, res) => {
    const { message_ttl_seconds } = req.body;
    const ttl = Math.min(Math.max(parseInt(message_ttl_seconds) || 3600, 1), 86400);

    const conv = await pool.query(
        'SELECT * FROM conversations WHERE id=$1 AND (user_a=$2 OR user_b=$2)',
        [req.params.id, req.user.id]
    );
    if (!conv.rows[0]) return res.status(404).json({ error: 'Conversation not found' });

    await pool.query('UPDATE conversations SET message_ttl_seconds=$1 WHERE id=$2', [ttl, req.params.id]);
    res.json({ ok: true, message_ttl_seconds: ttl });
});

module.exports = router;
