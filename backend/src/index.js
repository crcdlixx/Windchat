require('dotenv').config();
const express = require('express');
const http = require('http');
const cors = require('cors');
const helmet = require('helmet');
const { setupWebSocket } = require('./ws/server');
const { pool, testConnection } = require('./db/pool');
const { startCleanupJob } = require('./jobs/cleanup');
const { verifyIntegrity } = require('./utils/integrityCheck');
const logger = require('./utils/logger');

const authRoutes = require('./routes/auth');
const userRoutes = require('./routes/users');
const groupRoutes = require('./routes/groups');
const conversationRoutes = require('./routes/conversations');
const messageRoutes = require('./routes/messages');
const storageRoutes = require('./routes/storage');
const adminRoutes = require('./routes/admin');
const keysRoutes = require('./routes/keys');
const fileRoutes = require('./routes/files');

const app = express();
const server = http.createServer(app);

// 信任 nginx 反向代理传来的 X-Forwarded-For
app.set('trust proxy', 1);

app.use(helmet({
    contentSecurityPolicy: {
        directives: {
            defaultSrc: ["'self'"],
            scriptSrc: ["'self'", "https://challenges.cloudflare.com"],
            styleSrc: ["'self'", "'unsafe-inline'"],
            imgSrc: ["'self'", "data:", "blob:"],
            connectSrc: ["'self'", "ws:", "wss:"],
            frameSrc: ["https://challenges.cloudflare.com"],
        }
    }
}));

app.use(cors({
    origin: process.env.CORS_ORIGIN || '*',
    credentials: true,
}));

app.use(express.json({ limit: '10mb' }));

// Routes
app.use('/auth', authRoutes);
app.use('/users', userRoutes);
app.use('/groups', groupRoutes);
app.use('/conversations', conversationRoutes);
app.use('/messages', messageRoutes);
app.use('/storage', storageRoutes);
app.use('/admin', adminRoutes);
app.use('/keys', keysRoutes);
app.use('/files', fileRoutes);

// Health + integrity check
app.get('/health', async (req, res) => {
    const integrity = await verifyIntegrity();
    res.json({
        status: 'ok',
        integrity: integrity.valid ? 'verified' : 'TAMPERED',
        hash: integrity.current,
    });
});

app.get('/integrity', async (req, res) => {
    const integrity = await verifyIntegrity();
    res.json(integrity);
});

// WebSocket
setupWebSocket(server);

const PORT = process.env.PORT || 4000;

async function start() {
    await testConnection();
    startCleanupJob();

    if (process.env.NODE_ENV === 'production') {
        const integrity = await verifyIntegrity();
        if (!integrity.valid) {
            logger.error('Source integrity check FAILED. Server may have been tampered with!', integrity);
        } else {
            logger.info('Source integrity verified.', { hash: integrity.current });
        }
    }

    server.listen(PORT, () => {
        logger.info(`WindChat backend listening on port ${PORT}`);
    });
}

start().catch(err => {
    logger.error('Failed to start server', err);
    process.exit(1);
});
