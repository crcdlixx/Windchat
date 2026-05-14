const jwt = require('jsonwebtoken');
const { pool } = require('../db/pool');

const COMPLIANCE_EXEMPTIONS = new Set([
    'GET /users/me',
    'POST /auth/logout',
    'POST /auth/send-verification',
    'POST /auth/verify-email',
    'POST /auth/totp/setup',
    'POST /auth/totp/verify',
]);

async function getSettings(keys) {
    const result = await pool.query(
        'SELECT key, value FROM server_settings WHERE key = ANY($1)',
        [keys]
    );
    return Object.fromEntries(result.rows.map(row => [row.key, row.value]));
}

async function enforceAccountSettings(req, res, next) {
    const settings = await getSettings(['maintenance_mode', 'require_email', 'require_totp']);

    if (
        settings.maintenance_mode === 'true' &&
        req.user.role !== 'admin' &&
        req.user.role !== 'superadmin'
    ) {
        return res.status(503).json({ error: 'Server is in maintenance mode', code: 'maintenance_mode' });
    }

    const routeKey = `${req.method} ${req.baseUrl}${req.path}`;
    if (COMPLIANCE_EXEMPTIONS.has(routeKey)) {
        return next();
    }

    if (settings.require_email !== 'true' && settings.require_totp !== 'true') {
        return next();
    }

    const result = await pool.query(
        'SELECT email_verified, totp_enabled FROM users WHERE id=$1',
        [req.user.id]
    );
    const user = result.rows[0];
    if (!user) return res.status(404).json({ error: 'User not found' });

    if (settings.require_email === 'true' && !user.email_verified) {
        return res.status(403).json({ error: 'Email verification required', code: 'email_required' });
    }

    if (settings.require_totp === 'true' && !user.totp_enabled) {
        return res.status(403).json({ error: 'TOTP setup required', code: 'totp_required' });
    }

    next();
}

function authenticateToken(req, res, next) {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];

    if (!token) return res.status(401).json({ error: 'Access token required' });

    jwt.verify(token, process.env.JWT_SECRET, (err, user) => {
        if (err) return res.status(403).json({ error: 'Invalid or expired token' });
        req.user = user;
        enforceAccountSettings(req, res, next).catch(() => {
            res.status(500).json({ error: 'Failed to verify account requirements' });
        });
    });
}

function requireAdmin(req, res, next) {
    if (!req.user || (req.user.role !== 'admin' && req.user.role !== 'superadmin')) {
        return res.status(403).json({ error: 'Admin access required' });
    }
    next();
}

function requireSuperAdmin(req, res, next) {
    if (!req.user || req.user.role !== 'superadmin') {
        return res.status(403).json({ error: 'Superadmin access required' });
    }
    next();
}

module.exports = { authenticateToken, requireAdmin, requireSuperAdmin };
