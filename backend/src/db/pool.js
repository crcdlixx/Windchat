const { Pool } = require('pg');
const logger = require('../utils/logger');

const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    max: 20,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 5000,
});

pool.on('error', (err) => {
    logger.error('Unexpected DB pool error', err);
});

async function testConnection() {
    const client = await pool.connect();
    try {
        await client.query('SELECT 1');
        logger.info('Database connection established');
    } finally {
        client.release();
    }
}

module.exports = { pool, testConnection };
