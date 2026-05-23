const WebSocket = require('ws');
const jwt = require('jsonwebtoken');
const { pool } = require('../db/pool');
const { saveMessage } = require('../services/messageService');
const logger = require('../utils/logger');

// Map: userId -> Set<WebSocket>
const userConnections = new Map();

function getUserConnections(userId) {
    return userConnections.get(userId) || new Set();
}

function broadcast(userIds, payload) {
    const data = JSON.stringify(payload);
    for (const uid of userIds) {
        for (const ws of getUserConnections(uid)) {
            if (ws.readyState === WebSocket.OPEN) {
                ws.send(data);
            }
        }
    }
}

function parsePayload(payload) {
    try {
        return JSON.parse(payload);
    } catch {
        return null;
    }
}

function isSignalPayload(payload) {
    const env = parsePayload(payload);
    return env?.protocol === 'signal' && env?.v === 3 && env?.signal;
}

function isGroupPayload(payload) {
    const env = parsePayload(payload);
    return env?.protocol === 'windchat-group-aes-gcm' && env?.v === 3 && env?.ct && env?.iv;
}

function validateMessageShape({ conversation_id, group_id, encrypted_payload, message_type, file_ref }) {
    if (!encrypted_payload || typeof encrypted_payload !== 'string') {
        return 'encrypted_payload required';
    }

    if (conversation_id && group_id) {
        return 'Only one message target is allowed';
    }

    const type = message_type || 'text';
    if (!['text', 'file', 'image'].includes(type)) {
        return 'Invalid message type';
    }

    if (type === 'text' && file_ref) {
        return 'Text messages cannot include file_ref';
    }

    if ((type === 'file' || type === 'image') && !file_ref) {
        return 'file_ref required for attachment messages';
    }

    if (conversation_id) {
        if (!isSignalPayload(encrypted_payload)) {
            return 'Signal encrypted payload required for direct messages';
        }
    }

    if (group_id && !isGroupPayload(encrypted_payload)) {
        return 'Group encrypted payload required';
    }

    return null;
}

async function verifyRealtimeAccess(user) {
    const result = await pool.query(
        `SELECT u.email_verified, u.totp_enabled, s.key, s.value
         FROM users u
         LEFT JOIN server_settings s ON s.key IN ('maintenance_mode', 'require_email', 'require_totp')
         WHERE u.id=$1`,
        [user.id]
    );

    if (result.rows.length === 0) return 'User not found';

    const first = result.rows[0];
    const settings = Object.fromEntries(result.rows.map(row => [row.key, row.value]).filter(([key]) => key));

    if (
        settings.maintenance_mode === 'true' &&
        user.role !== 'admin' &&
        user.role !== 'superadmin'
    ) {
        return 'Server is in maintenance mode';
    }

    if (settings.require_email === 'true' && !first.email_verified) {
        return 'Email verification required';
    }

    if (settings.require_totp === 'true' && !first.totp_enabled) {
        return 'TOTP setup required';
    }

    return null;
}

function setupWebSocket(server) {
    const wss = new WebSocket.Server({ server, path: '/ws' });

    wss.on('connection', async (ws, req) => {
        // Auth via query param ?token=...
        const url = new URL(req.url, 'http://localhost');
        const token = url.searchParams.get('token');

        let user;
        try {
            user = jwt.verify(token, process.env.JWT_SECRET);
        } catch {
            ws.close(4001, 'Unauthorized');
            return;
        }

        const accessError = await verifyRealtimeAccess(user);
        if (accessError) {
            ws.close(4003, accessError);
            return;
        }

        // Register connection
        if (!userConnections.has(user.id)) userConnections.set(user.id, new Set());
        userConnections.get(user.id).add(ws);

        logger.info(`WS connected: ${user.username}`);

        // Update last_seen
        await pool.query('UPDATE users SET last_seen=NOW() WHERE id=$1', [user.id]);

        ws.on('message', async (raw) => {
            let msg;
            try {
                msg = JSON.parse(raw);
            } catch {
                ws.send(JSON.stringify({ type: 'error', error: 'Invalid JSON' }));
                return;
            }

            try {
                await handleMessage(user, msg, ws);
            } catch (err) {
                logger.error('WS message error', err);
                ws.send(JSON.stringify({ type: 'error', error: 'Server error' }));
            }
        });

        ws.on('close', () => {
            const conns = userConnections.get(user.id);
            if (conns) {
                conns.delete(ws);
                if (conns.size === 0) userConnections.delete(user.id);
            }
            logger.info(`WS disconnected: ${user.username}`);
        });

        ws.send(JSON.stringify({ type: 'connected', userId: user.id }));
    });

    return wss;
}

async function handleMessage(user, msg, ws) {
    switch (msg.type) {
        case 'message:send': {
            await handleSendMessage(user, msg, ws);
            break;
        }
        case 'message:delete': {
            await handleDeleteMessage(user, msg);
            break;
        }
        case 'typing:start':
        case 'typing:stop': {
            await handleTyping(user, msg);
            break;
        }
        case 'ping': {
            ws.send(JSON.stringify({ type: 'pong' }));
            break;
        }
        default:
            ws.send(JSON.stringify({ type: 'error', error: `Unknown type: ${msg.type}` }));
    }
}

async function handleSendMessage(user, msg, ws) {
    const { conversation_id, group_id, encrypted_payload, message_type, file_ref, ttl_seconds } = msg;

    const validationError = validateMessageShape({ conversation_id, group_id, encrypted_payload, message_type, file_ref });
    if (validationError) {
        ws.send(JSON.stringify({ type: 'error', error: validationError }));
        return;
    }

    // Validate target & membership
    let targetUserIds = [];
    let effectiveTtl = 3600;

    if (conversation_id) {
        const conv = await pool.query(
            'SELECT * FROM conversations WHERE id=$1 AND (user_a=$2 OR user_b=$2)',
            [conversation_id, user.id]
        );
        if (!conv.rows[0]) {
            ws.send(JSON.stringify({ type: 'error', error: 'Conversation not found' }));
            return;
        }
        const c = conv.rows[0];
        effectiveTtl = Math.min(ttl_seconds || c.message_ttl_seconds, parseInt(process.env.MAX_MESSAGE_TTL_HOURS || 24) * 3600);
        targetUserIds = [c.user_a, c.user_b];
    } else if (group_id) {
        const member = await pool.query(
            'SELECT gm.role, gm.is_muted, gm.muted_until, g.message_ttl_seconds, g.is_dissolved FROM group_members gm JOIN groups g ON gm.group_id=g.id WHERE gm.group_id=$1 AND gm.user_id=$2',
            [group_id, user.id]
        );
        if (!member.rows[0]) {
            ws.send(JSON.stringify({ type: 'error', error: 'Not a member' }));
            return;
        }
        const m = member.rows[0];
        if (m.is_dissolved) {
            ws.send(JSON.stringify({ type: 'error', error: 'Group is dissolved' }));
            return;
        }
        if (m.is_muted && (!m.muted_until || m.muted_until > new Date())) {
            ws.send(JSON.stringify({ type: 'error', error: 'You are muted' }));
            return;
        }
        effectiveTtl = Math.min(ttl_seconds || m.message_ttl_seconds, parseInt(process.env.MAX_MESSAGE_TTL_HOURS || 24) * 3600);

        const members = await pool.query('SELECT user_id FROM group_members WHERE group_id=$1', [group_id]);
        targetUserIds = members.rows.map(r => r.user_id);
    } else {
        ws.send(JSON.stringify({ type: 'error', error: 'conversation_id or group_id required' }));
        return;
    }

    const expiresAt = new Date(Date.now() + effectiveTtl * 1000);
    const saved = await saveMessage({
        conversation_id,
        group_id,
        sender_id: user.id,
        encrypted_payload,
        message_type: message_type || 'text',
        file_ref,
        ttl_seconds: effectiveTtl,
        expires_at: expiresAt,
    });

    const outbound = {
        type: 'message:new',
        message: {
            id: saved.id,
            sender_id: user.id,
            sender_username: user.username,
            conversation_id,
            group_id,
            encrypted_payload,
            message_type: message_type || 'text',
            file_ref,
            ttl_seconds: effectiveTtl,
            expires_at: expiresAt,
            created_at: saved.created_at,
        },
    };

    broadcast(targetUserIds, outbound);
}

async function handleDeleteMessage(user, msg) {
    const { message_id } = msg;
    const msgRow = await pool.query('SELECT * FROM messages WHERE id=$1', [message_id]);
    if (!msgRow.rows[0]) return;
    const m = msgRow.rows[0];

    let canDelete = m.sender_id === user.id;
    if (!canDelete && m.group_id) {
        const member = await pool.query(
            'SELECT role FROM group_members WHERE group_id=$1 AND user_id=$2',
            [m.group_id, user.id]
        );
        canDelete = ['owner', 'moderator'].includes(member.rows[0]?.role);
    }

    if (!canDelete) return;
    await pool.query('UPDATE messages SET is_deleted=true WHERE id=$1', [message_id]);

    let targetUserIds = [];
    if (m.conversation_id) {
        const conv = await pool.query('SELECT user_a, user_b FROM conversations WHERE id=$1', [m.conversation_id]);
        targetUserIds = [conv.rows[0]?.user_a, conv.rows[0]?.user_b].filter(Boolean);
    } else if (m.group_id) {
        const members = await pool.query('SELECT user_id FROM group_members WHERE group_id=$1', [m.group_id]);
        targetUserIds = members.rows.map(r => r.user_id);
    }

    broadcast(targetUserIds, { type: 'message:deleted', message_id });
}

async function handleTyping(user, msg) {
    const { conversation_id, group_id } = msg;
    let targetUserIds = [];

    if (conversation_id) {
        const conv = await pool.query(
            'SELECT user_a, user_b FROM conversations WHERE id=$1 AND (user_a=$2 OR user_b=$2)',
            [conversation_id, user.id]
        );
        if (conv.rows[0]) targetUserIds = [conv.rows[0].user_a, conv.rows[0].user_b].filter(id => id !== user.id);
    } else if (group_id) {
        const member = await pool.query(
            'SELECT 1 FROM group_members gm JOIN groups g ON gm.group_id=g.id WHERE gm.group_id=$1 AND gm.user_id=$2 AND g.is_dissolved=false',
            [group_id, user.id]
        );
        if (member.rows[0]) {
            const members = await pool.query('SELECT user_id FROM group_members WHERE group_id=$1', [group_id]);
            targetUserIds = members.rows.map(r => r.user_id).filter(id => id !== user.id);
        }
    }

    if (targetUserIds.length === 0) return;

    broadcast(targetUserIds, {
        type: msg.type,
        user_id: user.id,
        username: user.username,
        conversation_id,
        group_id,
    });
}

module.exports = { setupWebSocket, broadcast, getUserConnections };
