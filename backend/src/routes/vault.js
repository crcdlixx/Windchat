const express = require('express');
const { pool } = require('../db/pool');
const { authenticateToken } = require('../middleware/auth');

const router = express.Router();

router.get('/', authenticateToken, async (req, res) => {
    const result = await pool.query(
        'SELECT vault, updated_at FROM user_vaults WHERE user_id=$1',
        [req.user.id]
    );
    res.json(result.rows[0] || { vault: null, updated_at: null });
});

router.put('/', authenticateToken, async (req, res) => {
    const { vault } = req.body;
    if (typeof vault !== 'object' || vault === null || Array.isArray(vault)) {
        return res.status(400).json({ error: 'vault must be an object' });
    }

    const serialized = JSON.stringify(vault);
    if (Buffer.byteLength(serialized, 'utf8') > 10 * 1024 * 1024) {
        return res.status(413).json({ error: 'Vault is too large' });
    }

    await pool.query(
        `INSERT INTO user_vaults (user_id, vault, updated_at)
         VALUES ($1, $2, NOW())
         ON CONFLICT (user_id) DO UPDATE SET vault=$2, updated_at=NOW()`,
        [req.user.id, serialized]
    );

    res.json({ ok: true });
});

module.exports = router;
