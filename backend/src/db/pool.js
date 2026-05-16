const { Pool } = require('pg');
const logger = require('../utils/logger');

const dbConfig = process.env.DATABASE_URL
    ? { connectionString: process.env.DATABASE_URL }
    : {
        host: process.env.DB_HOST || process.env.PGHOST || 'localhost',
        port: parseInt(process.env.DB_PORT || process.env.PGPORT || '5432', 10),
        database: process.env.DB_NAME || process.env.PGDATABASE || process.env.POSTGRES_DB || 'windchat',
        user: process.env.DB_USER || process.env.PGUSER || process.env.POSTGRES_USER || 'windchat',
        password: process.env.DB_PASSWORD || process.env.PGPASSWORD || process.env.POSTGRES_PASSWORD,
    };

const pool = new Pool({
    ...dbConfig,
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
