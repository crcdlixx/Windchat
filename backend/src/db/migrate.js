const fs = require('fs');
const path = require('path');
const { pool } = require('./pool');

const migrationsDir = path.resolve(__dirname, '../../db/migrations');

async function ensureMigrationsTable(client) {
    await client.query(`
        CREATE TABLE IF NOT EXISTS schema_migrations (
            filename TEXT PRIMARY KEY,
            applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
    `);
}

async function runMigration(client, filename) {
    const fullPath = path.join(migrationsDir, filename);
    const sql = fs.readFileSync(fullPath, 'utf8');

    await client.query('BEGIN');
    try {
        await client.query(sql);
        await client.query(
            'INSERT INTO schema_migrations (filename) VALUES ($1) ON CONFLICT (filename) DO NOTHING',
            [filename]
        );
        await client.query('COMMIT');
        console.log(`Applied migration: ${filename}`);
    } catch (err) {
        await client.query('ROLLBACK');
        throw err;
    }
}

async function migrate() {
    if (!fs.existsSync(migrationsDir)) {
        throw new Error(`Migrations directory not found: ${migrationsDir}`);
    }

    const files = fs.readdirSync(migrationsDir)
        .filter(file => file.endsWith('.sql'))
        .sort();

    const client = await pool.connect();
    try {
        await ensureMigrationsTable(client);

        for (const file of files) {
            const applied = await client.query(
                'SELECT 1 FROM schema_migrations WHERE filename=$1',
                [file]
            );
            if (applied.rows.length > 0) {
                console.log(`Skipping migration: ${file}`);
                continue;
            }
            await runMigration(client, file);
        }
    } finally {
        client.release();
    }
}

migrate()
    .then(async () => {
        await pool.end();
        console.log('Database migrations complete');
    })
    .catch(async (err) => {
        console.error('Database migration failed');
        console.error(err);
        await pool.end();
        process.exit(1);
    });
