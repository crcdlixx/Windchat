const express = require('express');
const bcrypt = require('bcryptjs');
const { pool } = require('../db/pool');
const { authenticateToken } = require('../middleware/auth');

const router = express.Router();

async function isGroupMember(groupId, userId) {
    const r = await pool.query('SELECT role FROM group_members WHERE group_id=$1 AND user_id=$2', [groupId, userId]);
    return r.rows[0] || null;
}

// Create group
router.post('/', authenticateToken, async (req, res) => {
    const { name, description, type, password, is_temporary, duration_hours, message_ttl_seconds } = req.body;
    if (!name || name.length > 128) return res.status(400).json({ error: 'Invalid group name' });

    const groupType = type || 'private';
    if (!['public', 'password', 'private'].includes(groupType)) {
        return res.status(400).json({ error: 'Invalid type' });
    }
    if (groupType === 'password' && !password) {
        return res.status(400).json({ error: 'Password required for password-protected group' });
    }

    let expiresAt = null;
    if (is_temporary) {
        const hours = Math.min(Math.max(parseInt(duration_hours) || 24, 1), 720);
        expiresAt = new Date(Date.now() + hours * 3600 * 1000);
    }

    const ttl = Math.min(Math.max(parseInt(message_ttl_seconds) || 3600, 1), 86400);
    const passwordHash = groupType === 'password' ? await bcrypt.hash(password, 10) : null;

    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        const groupResult = await client.query(
            `INSERT INTO groups (name, description, owner_id, type, password_hash, is_temporary, expires_at, message_ttl_seconds)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
            [name, description || '', req.user.id, groupType, passwordHash, !!is_temporary, expiresAt, ttl]
        );
        const group = groupResult.rows[0];
        await client.query(
            'INSERT INTO group_members (group_id, user_id, role) VALUES ($1,$2,$3)',
            [group.id, req.user.id, 'owner']
        );
        await client.query('COMMIT');
        res.status(201).json(group);
    } catch (e) {
        await client.query('ROLLBACK');
        res.status(500).json({ error: 'Failed to create group' });
    } finally {
        client.release();
    }
});

// List my groups
router.get('/', authenticateToken, async (req, res) => {
    const result = await pool.query(
        `SELECT g.id, g.name, g.description, g.type, g.is_temporary, g.expires_at,
                g.message_ttl_seconds, g.is_dissolved, gm.role
         FROM groups g JOIN group_members gm ON g.id=gm.group_id
         WHERE gm.user_id=$1 AND g.is_dissolved=false
         ORDER BY g.created_at DESC`,
        [req.user.id]
    );
    res.json(result.rows);
});

// Search public groups
router.get('/public', authenticateToken, async (req, res) => {
    const { q } = req.query;
    const result = await pool.query(
        `SELECT id, name, description, type, is_temporary, expires_at,
                (SELECT COUNT(*) FROM group_members WHERE group_id=g.id) as member_count
         FROM groups g
         WHERE type IN ('public','password') AND is_dissolved=false AND (expires_at IS NULL OR expires_at > NOW())
         ${q ? "AND name ILIKE $1" : ""}
         ORDER BY member_count DESC LIMIT 50`,
        q ? [`%${q}%`] : []
    );
    res.json(result.rows);
});

// Get group info
router.get('/:id', authenticateToken, async (req, res) => {
    const member = await isGroupMember(req.params.id, req.user.id);
    const result = await pool.query(
        `SELECT g.*, (SELECT COUNT(*) FROM group_members WHERE group_id=g.id) as member_count
         FROM groups g WHERE g.id=$1`,
        [req.params.id]
    );
    if (!result.rows[0]) return res.status(404).json({ error: 'Group not found' });
    const group = result.rows[0];

    if (!member && group.type === 'private') {
        return res.status(403).json({ error: 'Access denied' });
    }
    delete group.password_hash;
    res.json({ ...group, my_role: member?.role || null });
});

// Join group
router.post('/:id/join', authenticateToken, async (req, res) => {
    const { password } = req.body;
    const groupResult = await pool.query('SELECT * FROM groups WHERE id=$1', [req.params.id]);
    const group = groupResult.rows[0];
    if (!group) return res.status(404).json({ error: 'Group not found' });
    if (group.is_dissolved) return res.status(410).json({ error: 'Group is dissolved' });
    if (group.type === 'private') return res.status(403).json({ error: 'This group is private' });
    if (group.type === 'password') {
        if (!password) return res.status(400).json({ error: 'Password required' });
        const ok = await bcrypt.compare(password, group.password_hash);
        if (!ok) return res.status(403).json({ error: 'Wrong password' });
    }

    await pool.query(
        'INSERT INTO group_members (group_id, user_id) VALUES ($1,$2) ON CONFLICT DO NOTHING',
        [group.id, req.user.id]
    );
    res.json({ ok: true });
});

// Group members list
router.get('/:id/members', authenticateToken, async (req, res) => {
    const member = await isGroupMember(req.params.id, req.user.id);
    if (!member) return res.status(403).json({ error: 'Not a member' });

    const result = await pool.query(
        `SELECT u.id, u.username, u.display_name, u.avatar_url, u.last_seen, gm.role, gm.is_muted, gm.muted_until
         FROM group_members gm JOIN users u ON gm.user_id=u.id
         WHERE gm.group_id=$1 ORDER BY gm.role DESC, u.username`,
        [req.params.id]
    );
    res.json(result.rows);
});

// Invite member (owner/moderator)
router.post('/:id/invite', authenticateToken, async (req, res) => {
    const member = await isGroupMember(req.params.id, req.user.id);
    if (!member || !['owner', 'moderator'].includes(member.role)) {
        return res.status(403).json({ error: 'Permission denied' });
    }
    const { user_id } = req.body;
    await pool.query(
        'INSERT INTO group_members (group_id, user_id) VALUES ($1,$2) ON CONFLICT DO NOTHING',
        [req.params.id, user_id]
    );
    res.json({ ok: true });
});

// Kick member (owner/moderator)
router.delete('/:id/members/:userId', authenticateToken, async (req, res) => {
    const member = await isGroupMember(req.params.id, req.user.id);
    if (!member || !['owner', 'moderator'].includes(member.role)) {
        return res.status(403).json({ error: 'Permission denied' });
    }
    const target = await isGroupMember(req.params.id, req.params.userId);
    if (target?.role === 'owner') return res.status(403).json({ error: 'Cannot kick owner' });

    await pool.query('DELETE FROM group_members WHERE group_id=$1 AND user_id=$2', [req.params.id, req.params.userId]);
    res.json({ ok: true });
});

// Mute member
router.post('/:id/members/:userId/mute', authenticateToken, async (req, res) => {
    const member = await isGroupMember(req.params.id, req.user.id);
    if (!member || !['owner', 'moderator'].includes(member.role)) {
        return res.status(403).json({ error: 'Permission denied' });
    }
    const { duration_minutes } = req.body;
    const mutedUntil = duration_minutes
        ? new Date(Date.now() + parseInt(duration_minutes) * 60 * 1000)
        : null;

    await pool.query(
        'UPDATE group_members SET is_muted=true, muted_until=$1 WHERE group_id=$2 AND user_id=$3',
        [mutedUntil, req.params.id, req.params.userId]
    );
    res.json({ ok: true });
});

// Clear all messages (owner only)
router.delete('/:id/messages', authenticateToken, async (req, res) => {
    const member = await isGroupMember(req.params.id, req.user.id);
    if (!member || member.role !== 'owner') return res.status(403).json({ error: 'Owner only' });

    await pool.query(
        'UPDATE messages SET is_deleted=true WHERE group_id=$1',
        [req.params.id]
    );
    res.json({ ok: true });
});

// Dissolve group (owner only)
router.delete('/:id', authenticateToken, async (req, res) => {
    const member = await isGroupMember(req.params.id, req.user.id);
    if (!member || member.role !== 'owner') return res.status(403).json({ error: 'Owner only' });

    await pool.query('UPDATE groups SET is_dissolved=true WHERE id=$1', [req.params.id]);
    res.json({ ok: true });
});

// Update group settings (owner only)
router.patch('/:id', authenticateToken, async (req, res) => {
    const member = await isGroupMember(req.params.id, req.user.id);
    if (!member || member.role !== 'owner') return res.status(403).json({ error: 'Owner only' });

    const { name, description, type, password, message_ttl_seconds } = req.body;
    const fields = [];
    const values = [];
    let idx = 1;

    if (name) { fields.push(`name=$${idx++}`); values.push(name); }
    if (description !== undefined) { fields.push(`description=$${idx++}`); values.push(description); }
    if (type && ['public','password','private'].includes(type)) {
        fields.push(`type=$${idx++}`); values.push(type);
        if (type === 'password' && password) {
            const h = await bcrypt.hash(password, 10);
            fields.push(`password_hash=$${idx++}`); values.push(h);
        }
    }
    if (message_ttl_seconds) {
        const ttl = Math.min(Math.max(parseInt(message_ttl_seconds), 1), 86400);
        fields.push(`message_ttl_seconds=$${idx++}`); values.push(ttl);
    }

    if (!fields.length) return res.status(400).json({ error: 'No fields' });
    values.push(req.params.id);
    const r = await pool.query(`UPDATE groups SET ${fields.join(',')} WHERE id=$${idx} RETURNING *`, values);
    delete r.rows[0].password_hash;
    res.json(r.rows[0]);
});

module.exports = router;
