const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { v4: uuidv4 } = require('uuid');
const crypto = require('crypto');
const { pool } = require('../db/pool');
const rateLimit = require('express-rate-limit');
const { verifyTurnstile } = require('../middleware/turnstile');
const { authenticateToken } = require('../middleware/auth');

const router = express.Router();

const authLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 10,
    message: { error: 'Too many auth attempts, please try again later' },
});

function generateTokens(user) {
    const accessToken = jwt.sign(
        { id: user.id, username: user.username, role: user.role },
        process.env.JWT_SECRET,
        { expiresIn: '15m' }
    );
    const refreshToken = jwt.sign(
        { id: user.id, type: 'refresh' },
        process.env.JWT_REFRESH_SECRET,
        { expiresIn: '7d' }
    );
    return { accessToken, refreshToken };
}

async function getAuthSettings() {
    const result = await pool.query(
        "SELECT key, value FROM server_settings WHERE key IN ('registration_open', 'maintenance_mode')"
    );
    return Object.fromEntries(result.rows.map(row => [row.key, row.value]));
}

// Public config (Turnstile site key, etc.)
router.get('/config', async (req, res) => {
    res.json({
        turnstile_site_key: process.env.TURNSTILE_SITE_KEY || null,
    });
});

// Register
router.post('/register', authLimiter, verifyTurnstile, async (req, res) => {
    const { username, password, display_name, identity_key, signed_prekey, one_time_prekeys } = req.body;

    if (!username || !password || !identity_key || !signed_prekey) {
        return res.status(400).json({ error: 'Missing required fields' });
    }
    if (!/^[a-zA-Z0-9_]{3,32}$/.test(username)) {
        return res.status(400).json({ error: 'Username must be 3-32 alphanumeric characters or underscores' });
    }
    if (password.length < 8) {
        return res.status(400).json({ error: 'Password must be at least 8 characters' });
    }

    try {
        const settings = await getAuthSettings();
        if (settings.maintenance_mode === 'true') {
            return res.status(503).json({ error: 'Server is in maintenance mode', code: 'maintenance_mode' });
        }
        if (settings.registration_open === 'false') {
            return res.status(403).json({ error: 'Registration is currently closed' });
        }

        const passwordHash = await bcrypt.hash(password, 12);
        const client = await pool.connect();
        try {
            await client.query('BEGIN');

            const userResult = await client.query(
                `INSERT INTO users (username, password_hash, display_name, identity_key, signed_prekey)
                 VALUES ($1, $2, $3, $4, $5) RETURNING id, username, role, created_at`,
                [username, passwordHash, display_name || username, identity_key, JSON.stringify(signed_prekey)]
            );
            const user = userResult.rows[0];

            await client.query(
                'INSERT INTO user_storage (user_id, content) VALUES ($1, $2)',
                [user.id, '']
            );

            if (Array.isArray(one_time_prekeys) && one_time_prekeys.length > 0) {
                for (const otk of one_time_prekeys) {
                    await client.query(
                        'INSERT INTO one_time_prekeys (user_id, key_id, public_key) VALUES ($1, $2, $3)',
                        [user.id, otk.key_id, otk.public_key]
                    );
                }
            }

            await client.query('COMMIT');

            const tokens = generateTokens(user);
            const refreshHash = crypto.createHash('sha256').update(tokens.refreshToken).digest('hex');
            await pool.query(
                'INSERT INTO refresh_tokens (user_id, token_hash, expires_at) VALUES ($1, $2, NOW() + INTERVAL \'7 days\')',
                [user.id, refreshHash]
            );

            res.status(201).json({ user: { id: user.id, username: user.username, role: user.role }, ...tokens });
        } catch (innerErr) {
            await client.query('ROLLBACK');
            throw innerErr;
        } finally {
            client.release();
        }
    } catch (err) {
        if (err.code === '23505') {
            return res.status(409).json({ error: 'Username already taken' });
        }
        res.status(500).json({ error: 'Registration failed' });
    }
});

// Login (with TOTP challenge support)
router.post('/login', authLimiter, verifyTurnstile, async (req, res) => {
    const { username, password, totp_code } = req.body;
    if (!username || !password) {
        return res.status(400).json({ error: 'Username and password required' });
    }

    try {
        const result = await pool.query(
            'SELECT id, username, password_hash, role, is_banned, ban_reason, totp_enabled, totp_secret FROM users WHERE username=$1',
            [username]
        );
        const user = result.rows[0];
        if (!user) return res.status(401).json({ error: 'Invalid credentials' });
        if (user.is_banned) return res.status(403).json({ error: `Account banned: ${user.ban_reason || 'No reason given'}` });

        const valid = await bcrypt.compare(password, user.password_hash);
        if (!valid) return res.status(401).json({ error: 'Invalid credentials' });

        const settings = await getAuthSettings();
        if (
            settings.maintenance_mode === 'true' &&
            user.role !== 'admin' &&
            user.role !== 'superadmin'
        ) {
            return res.status(503).json({ error: 'Server is in maintenance mode', code: 'maintenance_mode' });
        }

        // TOTP challenge
        if (user.totp_enabled) {
            if (!totp_code) {
                const challengeToken = jwt.sign(
                    { id: user.id, purpose: 'totp_challenge' },
                    process.env.JWT_SECRET,
                    { expiresIn: '5m' }
                );
                return res.json({ requires_totp: true, challenge_token: challengeToken });
            }
            // Validate inline TOTP
            const OTPAuth = require('otpauth');
            const totp = new OTPAuth.TOTP({
                secret: OTPAuth.Secret.fromBase32(user.totp_secret),
                digits: 6,
                period: 30,
            });
            const delta = totp.validate({ token: totp_code, window: 1 });
            if (delta === null) {
                return res.status(401).json({ error: 'Invalid TOTP code' });
            }
        }

        await pool.query('UPDATE users SET last_seen=NOW() WHERE id=$1', [user.id]);

        const tokens = generateTokens(user);
        const refreshHash = crypto.createHash('sha256').update(tokens.refreshToken).digest('hex');
        await pool.query(
            'INSERT INTO refresh_tokens (user_id, token_hash, expires_at) VALUES ($1, $2, NOW() + INTERVAL \'7 days\')',
            [user.id, refreshHash]
        );

        res.json({ user: { id: user.id, username: user.username, role: user.role }, ...tokens });
    } catch (err) {
        res.status(500).json({ error: 'Login failed' });
    }
});

// TOTP challenge completion (separate endpoint for 2-step login)
router.post('/totp-challenge', async (req, res) => {
    const { challenge_token, totp_code } = req.body;
    if (!challenge_token || !totp_code) {
        return res.status(400).json({ error: 'Challenge token and TOTP code required' });
    }

    try {
        const payload = jwt.verify(challenge_token, process.env.JWT_SECRET);
        if (payload.purpose !== 'totp_challenge') {
            return res.status(403).json({ error: 'Invalid challenge token' });
        }

        const result = await pool.query(
            'SELECT id, username, role, totp_secret, totp_enabled FROM users WHERE id=$1',
            [payload.id]
        );
        const user = result.rows[0];
        if (!user || !user.totp_enabled) {
            return res.status(403).json({ error: 'Invalid challenge' });
        }

        const OTPAuth = require('otpauth');
        const totp = new OTPAuth.TOTP({
            secret: OTPAuth.Secret.fromBase32(user.totp_secret),
            digits: 6,
            period: 30,
        });
        const delta = totp.validate({ token: totp_code, window: 1 });
        if (delta === null) {
            return res.status(401).json({ error: 'Invalid TOTP code' });
        }

        await pool.query('UPDATE users SET last_seen=NOW() WHERE id=$1', [user.id]);

        const tokens = generateTokens(user);
        const refreshHash = crypto.createHash('sha256').update(tokens.refreshToken).digest('hex');
        await pool.query(
            'INSERT INTO refresh_tokens (user_id, token_hash, expires_at) VALUES ($1, $2, NOW() + INTERVAL \'7 days\')',
            [user.id, refreshHash]
        );

        res.json({ user: { id: user.id, username: user.username, role: user.role }, ...tokens });
    } catch {
        res.status(403).json({ error: 'Invalid or expired challenge token' });
    }
});

// TOTP setup
router.post('/totp/setup', authenticateToken, async (req, res) => {
    try {
        const OTPAuth = require('otpauth');
        const secret = new OTPAuth.Secret();
        const totp = new OTPAuth.TOTP({
            issuer: 'WindChat',
            label: req.user.username,
            secret: secret,
            digits: 6,
            period: 30,
        });

        await pool.query('UPDATE users SET totp_secret=$1 WHERE id=$2', [secret.base32, req.user.id]);

        res.json({ secret: secret.base32, uri: totp.toString() });
    } catch {
        res.status(500).json({ error: 'Failed to setup TOTP' });
    }
});

// TOTP verify (confirm setup)
router.post('/totp/verify', authenticateToken, async (req, res) => {
    const { code } = req.body;
    if (!code) return res.status(400).json({ error: 'Code required' });

    try {
        const result = await pool.query('SELECT totp_secret FROM users WHERE id=$1', [req.user.id]);
        const user = result.rows[0];
        if (!user || !user.totp_secret) return res.status(400).json({ error: 'TOTP not set up' });

        const OTPAuth = require('otpauth');
        const totp = new OTPAuth.TOTP({
            secret: OTPAuth.Secret.fromBase32(user.totp_secret),
            digits: 6,
            period: 30,
        });
        const delta = totp.validate({ token: code, window: 1 });
        if (delta === null) return res.status(401).json({ error: 'Invalid code' });

        await pool.query('UPDATE users SET totp_enabled=true WHERE id=$1', [req.user.id]);
        await pool.query(
            'INSERT INTO audit_log (actor_id, action, target_type, target_id) VALUES ($1,$2,$3,$4)',
            [req.user.id, 'enable_totp', 'user', req.user.id]
        );

        res.json({ ok: true });
    } catch {
        res.status(500).json({ error: 'Verification failed' });
    }
});

// TOTP disable
router.post('/totp/disable', authenticateToken, async (req, res) => {
    const { password, code } = req.body;
    if (!password || !code) return res.status(400).json({ error: 'Password and code required' });

    try {
        const setting = await pool.query("SELECT value FROM server_settings WHERE key='require_totp'");
        if (setting.rows[0]?.value === 'true') {
            return res.status(403).json({ error: 'TOTP is required by server policy', code: 'totp_required' });
        }

        const result = await pool.query('SELECT password_hash, totp_secret, totp_enabled FROM users WHERE id=$1', [req.user.id]);
        const user = result.rows[0];
        if (!user || !user.totp_enabled) return res.status(400).json({ error: 'TOTP not enabled' });

        const validPw = await bcrypt.compare(password, user.password_hash);
        if (!validPw) return res.status(401).json({ error: 'Invalid password' });

        const OTPAuth = require('otpauth');
        const totp = new OTPAuth.TOTP({
            secret: OTPAuth.Secret.fromBase32(user.totp_secret),
            digits: 6,
            period: 30,
        });
        const delta = totp.validate({ token: code, window: 1 });
        if (delta === null) return res.status(401).json({ error: 'Invalid TOTP code' });

        await pool.query('UPDATE users SET totp_enabled=false, totp_secret=NULL WHERE id=$1', [req.user.id]);
        await pool.query(
            'INSERT INTO audit_log (actor_id, action, target_type, target_id) VALUES ($1,$2,$3,$4)',
            [req.user.id, 'disable_totp', 'user', req.user.id]
        );

        res.json({ ok: true });
    } catch {
        res.status(500).json({ error: 'Failed to disable TOTP' });
    }
});

// Email verification - send code
router.post('/send-verification', authenticateToken, async (req, res) => {
    const { email } = req.body;
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        return res.status(400).json({ error: 'Invalid email address' });
    }

    try {
        const recent = await pool.query(
            "SELECT COUNT(*) FROM email_verification_codes WHERE user_id=$1 AND created_at > NOW() - INTERVAL '1 hour'",
            [req.user.id]
        );
        if (parseInt(recent.rows[0].count) >= 3) {
            return res.status(429).json({ error: 'Too many verification attempts' });
        }

        const code = String(Math.floor(100000 + Math.random() * 900000));
        await pool.query(
            "INSERT INTO email_verification_codes (user_id, email, code, expires_at) VALUES ($1, $2, $3, NOW() + INTERVAL '10 minutes')",
            [req.user.id, email, code]
        );

        const { sendVerificationEmail } = require('../services/email');
        const sent = await sendVerificationEmail(email, code);
        if (!sent) return res.status(500).json({ error: 'Failed to send email' });

        res.json({ ok: true });
    } catch {
        res.status(500).json({ error: 'Failed to send verification' });
    }
});

// Email verification - verify code
router.post('/verify-email', authenticateToken, async (req, res) => {
    const { code } = req.body;
    if (!code) return res.status(400).json({ error: 'Code required' });

    try {
        const result = await pool.query(
            "SELECT id, email FROM email_verification_codes WHERE user_id=$1 AND code=$2 AND used=false AND expires_at > NOW() ORDER BY created_at DESC LIMIT 1",
            [req.user.id, code]
        );
        if (!result.rows[0]) return res.status(400).json({ error: 'Invalid or expired code' });

        const row = result.rows[0];
        await pool.query('UPDATE email_verification_codes SET used=true WHERE id=$1', [row.id]);
        await pool.query('UPDATE users SET email=$1, email_verified=true WHERE id=$2', [row.email, req.user.id]);
        await pool.query(
            'INSERT INTO audit_log (actor_id, action, target_type, target_id, details) VALUES ($1,$2,$3,$4,$5)',
            [req.user.id, 'verify_email', 'user', req.user.id, JSON.stringify({ email: row.email })]
        );

        res.json({ ok: true, email: row.email });
    } catch {
        res.status(500).json({ error: 'Verification failed' });
    }
});

// Refresh token
router.post('/refresh', async (req, res) => {
    const { refreshToken } = req.body;
    if (!refreshToken) return res.status(400).json({ error: 'Refresh token required' });

    try {
        const payload = jwt.verify(refreshToken, process.env.JWT_REFRESH_SECRET);
        const tokenHash = crypto.createHash('sha256').update(refreshToken).digest('hex');

        const stored = await pool.query(
            'SELECT * FROM refresh_tokens WHERE token_hash=$1 AND expires_at > NOW()',
            [tokenHash]
        );
        if (!stored.rows[0]) return res.status(403).json({ error: 'Invalid refresh token' });

        const userResult = await pool.query(
            'SELECT id, username, role, is_banned FROM users WHERE id=$1',
            [payload.id]
        );
        const user = userResult.rows[0];
        if (!user || user.is_banned) return res.status(403).json({ error: 'User not found or banned' });

        await pool.query('DELETE FROM refresh_tokens WHERE token_hash=$1', [tokenHash]);

        const tokens = generateTokens(user);
        const newHash = crypto.createHash('sha256').update(tokens.refreshToken).digest('hex');
        await pool.query(
            'INSERT INTO refresh_tokens (user_id, token_hash, expires_at) VALUES ($1, $2, NOW() + INTERVAL \'7 days\')',
            [user.id, newHash]
        );

        res.json(tokens);
    } catch {
        res.status(403).json({ error: 'Invalid or expired refresh token' });
    }
});

// Logout
router.post('/logout', async (req, res) => {
    const { refreshToken } = req.body;
    if (refreshToken) {
        const tokenHash = crypto.createHash('sha256').update(refreshToken).digest('hex');
        await pool.query('DELETE FROM refresh_tokens WHERE token_hash=$1', [tokenHash]);
    }
    res.json({ ok: true });
});

module.exports = router;
