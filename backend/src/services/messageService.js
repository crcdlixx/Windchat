const { pool } = require('../db/pool');

async function saveMessage({ conversation_id, group_id, sender_id, encrypted_payload, message_type, file_ref, ttl_seconds, expires_at }) {
    const result = await pool.query(
        `INSERT INTO messages (conversation_id, group_id, sender_id, encrypted_payload, message_type, file_ref, ttl_seconds, expires_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id, created_at`,
        [conversation_id || null, group_id || null, sender_id, encrypted_payload, message_type, file_ref || null, ttl_seconds, expires_at]
    );
    return result.rows[0];
}

module.exports = { saveMessage };
