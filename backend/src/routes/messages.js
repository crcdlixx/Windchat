const express = require('express');
const { pool } = require('../db/pool');
const { authenticateToken } = require('../middleware/auth');

const router = express.Router();

const MAX_TTL = parseInt(process.env.MAX_MESSAGE_TTL_HOURS || 24) * 3600;

// Get messages for a conversation (DM)
router.get('/conversation/:id', authenticateToken, async (req, res) => {
    const conv = await pool.query(
        'SELECT * FROM conversations WHERE id=$1 AND (user_a=$2 OR user_b=$2)',
        [req.params.id, req.user.id]
    );
    if (!conv.rows[0]) return res.status(403).json({ error: 'Access denied' });

    const { before, limit } = req.query;
    const lim = Math.min(parseInt(limit) || 50, 100);

    const result = await pool.query(
        `SELECT m.id, m.sender_id, m.encrypted_payload, m.message_type, m.file_ref,
                m.ttl_seconds, m.expires_at, m.created_at,
                u.username as sender_username, u.display_name as sender_display_name
         FROM messages m JOIN users u ON m.sender_id=u.id
         WHERE m.conversation_id=$1 AND m.is_deleted=false AND m.expires_at > NOW()
         ${before ? 'AND m.created_at < $3' : ''}
         ORDER BY m.created_at DESC LIMIT $2`,
        before ? [req.params.id, lim, before] : [req.params.id, lim]
    );
    res.json(result.rows.reverse());
});

// Get messages for a group
router.get('/group/:id', authenticateToken, async (req, res) => {
    const member = await pool.query(
        'SELECT role FROM group_members WHERE group_id=$1 AND user_id=$2',
        [req.params.id, req.user.id]
    );
    if (!member.rows[0]) return res.status(403).json({ error: 'Not a member' });

    const { before, limit } = req.query;
    const lim = Math.min(parseInt(limit) || 50, 100);

    const result = await pool.query(
        `SELECT m.id, m.sender_id, m.encrypted_payload, m.message_type, m.file_ref,
                m.ttl_seconds, m.expires_at, m.created_at,
                u.username as sender_username, u.display_name as sender_display_name
         FROM messages m JOIN users u ON m.sender_id=u.id
         WHERE m.group_id=$1 AND m.is_deleted=false AND m.expires_at > NOW()
         ${before ? 'AND m.created_at < $3' : ''}
         ORDER BY m.created_at DESC LIMIT $2`,
        before ? [req.params.id, lim, before] : [req.params.id, lim]
    );
    res.json(result.rows.reverse());
});

// Delete a message (sender or group owner/admin)
router.delete('/:id', authenticateToken, async (req, res) => {
    const msg = await pool.query('SELECT * FROM messages WHERE id=$1', [req.params.id]);
    if (!msg.rows[0]) return res.status(404).json({ error: 'Message not found' });
    const m = msg.rows[0];

    if (m.sender_id === req.user.id) {
        await pool.query('UPDATE messages SET is_deleted=true WHERE id=$1', [m.id]);
        return res.json({ ok: true });
    }

    // Allow group owner/moderator
    if (m.group_id) {
        const member = await pool.query(
            'SELECT role FROM group_members WHERE group_id=$1 AND user_id=$2',
            [m.group_id, req.user.id]
        );
        if (['owner', 'moderator'].includes(member.rows[0]?.role)) {
            await pool.query('UPDATE messages SET is_deleted=true WHERE id=$1', [m.id]);
            return res.json({ ok: true });
        }
    }

    res.status(403).json({ error: 'Permission denied' });
});

module.exports = router;
