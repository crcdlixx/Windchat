const cron = require('node-cron');
const { pool } = require('../db/pool');
const { deleteFile } = require('../services/fileStorage');
const logger = require('../utils/logger');

function startCleanupJob() {
    // Run every minute: delete expired messages and their files
    cron.schedule('* * * * *', async () => {
        try {
            // Get expired messages with file refs
            const fileMessages = await pool.query(
                `SELECT id, file_ref FROM messages
                 WHERE expires_at <= NOW() AND is_deleted=false AND file_ref IS NOT NULL`
            );

            for (const msg of fileMessages.rows) {
                try {
                    await deleteFile(msg.file_ref);
                } catch (e) {
                    logger.warn(`Failed to delete file ${msg.file_ref}`, e.message);
                }
            }

            // Mark all expired messages as deleted
            const result = await pool.query(
                `UPDATE messages SET is_deleted=true WHERE expires_at <= NOW() AND is_deleted=false`
            );

            if (result.rowCount > 0) {
                logger.info(`Cleanup: marked ${result.rowCount} expired messages as deleted`);
            }

            // Delete expired temporary groups
            const expiredGroups = await pool.query(
                `UPDATE groups SET is_dissolved=true WHERE is_temporary=true AND expires_at <= NOW() AND is_dissolved=false RETURNING id`
            );
            if (expiredGroups.rowCount > 0) {
                logger.info(`Cleanup: dissolved ${expiredGroups.rowCount} temporary groups`);
            }

            // Purge old refresh tokens
            await pool.query('DELETE FROM refresh_tokens WHERE expires_at <= NOW()');

            // Purge used one-time prekeys older than 30 days
            await pool.query(`DELETE FROM one_time_prekeys WHERE used=true AND created_at < NOW() - INTERVAL '30 days'`);

        } catch (err) {
            logger.error('Cleanup job error', err);
        }
    });

    logger.info('Message cleanup job started');
}

module.exports = { startCleanupJob };
