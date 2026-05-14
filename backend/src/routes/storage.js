const express = require('express');
const { pool } = require('../db/pool');
const { authenticateToken } = require('../middleware/auth');

const router = express.Router();

// Get my persistent storage
router.get('/', authenticateToken, async (req, res) => {
    const result = await pool.query(
        'SELECT content, updated_at FROM user_storage WHERE user_id=$1',
        [req.user.id]
    );
    res.json(result.rows[0] || { content: '', updated_at: null });
});

// Save/update persistent storage (dynamic limit from server settings)
router.put('/', authenticateToken, async (req, res) => {
    const { content } = req.body;
    if (typeof content !== 'string') return res.status(400).json({ error: 'content must be a string' });

    const setting = await pool.query("SELECT value FROM server_settings WHERE key='max_storage_kb'");
    const maxKb = parseInt(setting.rows[0]?.value) || 1024;
    const maxBytes = maxKb * 1024;

    if (Buffer.byteLength(content, 'utf8') > maxBytes) {
        return res.status(413).json({ error: `Content exceeds ${maxKb}KB limit` });
    }

    await pool.query(
        `INSERT INTO user_storage (user_id, content, updated_at)
         VALUES ($1, $2, NOW())
         ON CONFLICT (user_id) DO UPDATE SET content=$2, updated_at=NOW()`,
        [req.user.id, content]
    );
    res.json({ ok: true, bytes: Buffer.byteLength(content, 'utf8') });
});

module.exports = router;
