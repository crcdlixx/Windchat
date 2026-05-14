const express = require('express');
const { pool } = require('../db/pool');
const { authenticateToken } = require('../middleware/auth');

const router = express.Router();

function isCompleteSignalBundle(identityKey, signedPrekey) {
    return Boolean(
        identityKey &&
        signedPrekey?.public_key &&
        signedPrekey?.signature &&
        signedPrekey?.registration_id
    );
}

function parseSignedPrekey(value) {
    try {
        return typeof value === 'string' ? JSON.parse(value) : value;
    } catch {
        return null;
    }
}

// Check whether the current user's server-side Signal public bundle is complete.
router.get('/me/status', authenticateToken, async (req, res) => {
    const result = await pool.query(
        'SELECT identity_key, signed_prekey FROM users WHERE id=$1',
        [req.user.id]
    );
    const row = result.rows[0];
    const signedPrekey = parseSignedPrekey(row?.signed_prekey);
    res.json({ complete: isCompleteSignalBundle(row?.identity_key, signedPrekey) });
});

// Get public prekey bundle for a user (for E2E session setup)
router.get('/:userId/bundle', authenticateToken, async (req, res) => {
    const client = await pool.connect();
    try {
        const userResult = await client.query(
            'SELECT id, username, identity_key, signed_prekey FROM users WHERE id=$1',
            [req.params.userId]
        );
        if (!userResult.rows[0]) return res.status(404).json({ error: 'User not found' });
        const user = userResult.rows[0];
        const signedPrekey = parseSignedPrekey(user.signed_prekey);
        if (!isCompleteSignalBundle(user.identity_key, signedPrekey)) {
            return res.status(409).json({
                error: 'Recipient Signal keys are outdated. Ask them to sign in again to refresh their keys.',
                code: 'recipient_signal_keys_outdated',
            });
        }

        // Grab one one-time prekey and mark it used
        const otkResult = await client.query(
            `SELECT id, key_id, public_key FROM one_time_prekeys
             WHERE user_id=$1 AND used=false LIMIT 1`,
            [user.id]
        );
        const otk = otkResult.rows[0] || null;
        if (otk) {
            await client.query('UPDATE one_time_prekeys SET used=true WHERE id=$1', [otk.id]);
        }

        res.json({
            user_id: user.id,
            username: user.username,
            identity_key: user.identity_key,
            signed_prekey: signedPrekey,
            registration_id: signedPrekey.registration_id,
            one_time_prekey: otk ? { key_id: otk.key_id, public_key: otk.public_key } : null,
        });
    } finally {
        client.release();
    }
});

// Replace this device's public Signal identity bundle.
router.put('/identity', authenticateToken, async (req, res) => {
    const { identity_key, signed_prekey, one_time_prekeys } = req.body;
    if (!identity_key || !signed_prekey?.public_key || !signed_prekey?.signature || !signed_prekey?.registration_id) {
        return res.status(400).json({ error: 'complete Signal identity bundle required' });
    }

    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        await client.query(
            'UPDATE users SET identity_key=$1, signed_prekey=$2 WHERE id=$3',
            [identity_key, JSON.stringify(signed_prekey), req.user.id]
        );
        await client.query('DELETE FROM one_time_prekeys WHERE user_id=$1', [req.user.id]);

        if (Array.isArray(one_time_prekeys)) {
            for (const otk of one_time_prekeys) {
                await client.query(
                    'INSERT INTO one_time_prekeys (user_id, key_id, public_key) VALUES ($1, $2, $3) ON CONFLICT DO NOTHING',
                    [req.user.id, otk.key_id, otk.public_key]
                );
            }
        }

        await client.query('COMMIT');
        res.json({ ok: true, count: Array.isArray(one_time_prekeys) ? one_time_prekeys.length : 0 });
    } catch (err) {
        await client.query('ROLLBACK');
        throw err;
    } finally {
        client.release();
    }
});

// Upload new one-time prekeys
router.post('/prekeys', authenticateToken, async (req, res) => {
    const { one_time_prekeys } = req.body;
    if (!Array.isArray(one_time_prekeys) || one_time_prekeys.length === 0) {
        return res.status(400).json({ error: 'one_time_prekeys array required' });
    }

    const client = await pool.connect();
    try {
        for (const otk of one_time_prekeys) {
            await client.query(
                'INSERT INTO one_time_prekeys (user_id, key_id, public_key) VALUES ($1, $2, $3) ON CONFLICT DO NOTHING',
                [req.user.id, otk.key_id, otk.public_key]
            );
        }
        res.json({ ok: true, count: one_time_prekeys.length });
    } finally {
        client.release();
    }
});

// Update signed prekey
router.put('/signed-prekey', authenticateToken, async (req, res) => {
    const { signed_prekey } = req.body;
    if (!signed_prekey) return res.status(400).json({ error: 'signed_prekey required' });

    await pool.query('UPDATE users SET signed_prekey=$1 WHERE id=$2', [
        JSON.stringify(signed_prekey),
        req.user.id,
    ]);
    res.json({ ok: true });
});

module.exports = router;
