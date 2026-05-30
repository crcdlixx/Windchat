const express = require('express');
const bcrypt = require('bcryptjs');
const { pool } = require('../db/pool');
const { authenticateToken, requireAdmin, requireSuperAdmin } = require('../middleware/auth');
const { verifyIntegrity } = require('../utils/integrityCheck');

const router = express.Router();

router.use(authenticateToken, requireAdmin);

// Server stats
router.get('/stats', async (req, res) => {
    const [users, groups, messages, storage] = await Promise.all([
        pool.query('SELECT COUNT(*) FROM users'),
        pool.query('SELECT COUNT(*) FROM groups WHERE is_dissolved=false'),
        pool.query('SELECT COUNT(*) FROM messages WHERE is_deleted=false AND expires_at > NOW()'),
        pool.query('SELECT SUM(octet_length(content)) as total FROM user_storage'),
    ]);
    const integrity = await verifyIntegrity();
    res.json({
        users: parseInt(users.rows[0].count),
        groups: parseInt(groups.rows[0].count),
        active_messages: parseInt(messages.rows[0].count),
        storage_bytes: parseInt(storage.rows[0].total) || 0,
        integrity,
    });
});

// List users
router.get('/users', async (req, res) => {
    const { q, page } = req.query;
    const offset = (parseInt(page) - 1 || 0) * 50;
    const result = await pool.query(
        `SELECT id, username, display_name, avatar_url, role, is_banned, ban_reason, created_at, last_seen
         FROM users ${q ? 'WHERE username ILIKE $3' : ''}
         ORDER BY created_at DESC LIMIT 50 OFFSET $1`,
        q ? [offset, 50, `%${q}%`] : [offset]
    );
    res.json(result.rows);
});

// Ban/unban user
router.post('/users/:id/ban', async (req, res) => {
    const { reason } = req.body;
    await pool.query('UPDATE users SET is_banned=true, ban_reason=$1 WHERE id=$2', [reason || '', req.params.id]);
    await pool.query(
        'INSERT INTO audit_log (actor_id, action, target_type, target_id, details) VALUES ($1,$2,$3,$4,$5)',
        [req.user.id, 'ban_user', 'user', req.params.id, JSON.stringify({ reason })]
    );
    res.json({ ok: true });
});

router.post('/users/:id/unban', async (req, res) => {
    await pool.query('UPDATE users SET is_banned=false, ban_reason=NULL WHERE id=$1', [req.params.id]);
    await pool.query(
        'INSERT INTO audit_log (actor_id, action, target_type, target_id) VALUES ($1,$2,$3,$4)',
        [req.user.id, 'unban_user', 'user', req.params.id]
    );
    res.json({ ok: true });
});

// Set user role (superadmin only)
router.post('/users/:id/role', requireSuperAdmin, async (req, res) => {
    const { role } = req.body;
    if (!['user', 'admin', 'superadmin'].includes(role)) {
        return res.status(400).json({ error: 'Invalid role' });
    }
    await pool.query('UPDATE users SET role=$1 WHERE id=$2', [role, req.params.id]);
    await pool.query(
        'INSERT INTO audit_log (actor_id, action, target_type, target_id, details) VALUES ($1,$2,$3,$4,$5)',
        [req.user.id, 'set_role', 'user', req.params.id, JSON.stringify({ role })]
    );
    res.json({ ok: true });
});

// Delete user
router.delete('/users/:id', requireSuperAdmin, async (req, res) => {
    await pool.query('DELETE FROM users WHERE id=$1', [req.params.id]);
    res.json({ ok: true });
});

// Server settings
router.get('/settings', async (req, res) => {
    const result = await pool.query('SELECT key, value FROM server_settings ORDER BY key');
    const settings = {};
    result.rows.forEach(r => settings[r.key] = r.value);
    res.json(settings);
});

router.patch('/settings', async (req, res) => {
    const allowed = [
        'registration_open', 'max_file_size_mb', 'default_message_ttl_seconds',
        'max_message_ttl_seconds', 'server_name', 'maintenance_mode',
        'max_storage_kb', 'require_email', 'require_totp'
    ];
    const updates = req.body;
    for (const key of Object.keys(updates)) {
        if (!allowed.includes(key)) continue;
        await pool.query(
            'INSERT INTO server_settings (key, value, updated_at) VALUES ($1,$2,NOW()) ON CONFLICT (key) DO UPDATE SET value=$2, updated_at=NOW()',
            [key, String(updates[key])]
        );
    }
    res.json({ ok: true });
});

// Audit log
router.get('/audit', async (req, res) => {
    const result = await pool.query(
        `SELECT al.*, u.username as actor_username
         FROM audit_log al LEFT JOIN users u ON al.actor_id=u.id
         ORDER BY al.created_at DESC LIMIT 100`
    );
    res.json(result.rows);
});

// Groups management
router.get('/groups', async (req, res) => {
    const result = await pool.query(
        `SELECT g.id, g.name, g.type, g.is_temporary, g.is_dissolved, g.created_at,
                u.username as owner_username,
                (SELECT COUNT(*) FROM group_members WHERE group_id=g.id) as member_count
         FROM groups g JOIN users u ON g.owner_id=u.id
         ORDER BY g.created_at DESC LIMIT 100`
    );
    res.json(result.rows);
});

router.delete('/groups/:id', requireSuperAdmin, async (req, res) => {
    await pool.query('UPDATE groups SET is_dissolved=true WHERE id=$1', [req.params.id]);
    res.json({ ok: true });
});

module.exports = router;
