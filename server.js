require('dotenv').config();
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: '*' } });

// ── Middleware ──────────────────────────────────────────────
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// ── Routes ──────────────────────────────────────────────────
app.use('/api/auth',          require('./src/routes/auth'));
app.use('/api/users',         require('./src/routes/users'));
app.use('/api/jobs',          require('./src/routes/jobs'));
app.use('/api/gigs',          require('./src/routes/gigs'));
app.use('/api/proposals',     require('./src/routes/proposals'));
app.use('/api/payments',      require('./src/routes/payments'));
app.use('/api/escrow',        require('./src/routes/payments'));   // same router, escrow sub-paths
app.use('/api/wallet',        require('./src/routes/payments'));   // same router, wallet sub-paths
app.use('/api/notifications', require('./src/routes/notifications'));
app.use('/api/kyc',           require('./src/routes/kyc'));
app.use('/api/disputes',      require('./src/routes/disputes'));
app.use('/api/reviews',       require('./src/routes/reviews'));
app.use('/api/chat',          require('./src/routes/chat'));
app.use('/api/marketplace',   require('./src/routes/marketplace'));
app.use('/api/match',         require('./src/routes/marketplace'));
app.use('/api/skills',        require('./src/routes/marketplace'));
app.use('/api/admin',         require('./src/routes/admin'));
app.use('/api/i18n',          require('./src/routes/i18n'));
app.use('/api/invoices',      require('./src/routes/invoices'));
app.use('/api/milestones',    require('./src/routes/milestones'));
app.use('/api/academy',       require('./src/routes/academy'));
app.use('/api/skill-tests',   require('./src/routes/skillTests'));
app.use('/api/skill-badges',  require('./src/routes/skillTests'));
app.use('/api/reputation',    require('./src/routes/reputation'));
app.use('/api/contract-templates', require('./src/routes/contractTemplates'));
app.use('/api/contracts',     require('./src/routes/contracts'));
app.use('/api/deliveries',    require('./src/routes/deliveries'));
app.use('/api/endorsements',  require('./src/routes/endorsements'));
app.use('/api/job-alerts',    require('./src/routes/jobAlerts'));
app.use('/api/teams',         require('./src/routes/teams'));
app.use('/api/ai',            require('./src/routes/ai'));
app.use('/api/translate',     require('./src/routes/ai'));
app.use('/api/group-chats',   require('./src/routes/groupChats'));

// ── Static frontend ─────────────────────────────────────────
app.use(express.static(path.join(__dirname, 'public'), {
    etag: false,
    lastModified: false,
    setHeaders: (res, filePath) => {
        if (filePath.endsWith('.html')) {
            res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
            res.setHeader('Pragma', 'no-cache');
            res.setHeader('Expires', '0');
            res.setHeader('Surrogate-Control', 'no-store');
        } else if (filePath.endsWith('.js') || filePath.endsWith('.css')) {
            res.setHeader('Cache-Control', 'no-cache');
        }
    }
}));
app.get('/{*path}', (req, res) => {
    if (!req.path.startsWith('/api')) {
        res.sendFile(path.join(__dirname, 'public', 'index.html'));
    }
});

// ── Username profile shortlink ───────────────────────────────
app.get('/u/:username', async (req, res) => {
    res.redirect(`/profile.html?username=${req.params.username}`);
});
app.get('/api/ping', (req, res) => res.json({ status: 'Ethio Gigs API is online 🚀' }));

// ── One-time DB fix (safe to call multiple times) ────────────
app.get('/api/fix-schema', async (req, res) => {
    const { db } = require('./src/config/db');
    const fixes = [
        "ALTER TABLE proposals MODIFY COLUMN status ENUM('pending','shortlisted','accepted','rejected') DEFAULT 'pending'",
        "ALTER TABLE gigs ADD COLUMN IF NOT EXISTS freelancer_id INT NULL",
        "ALTER TABLE gigs ADD COLUMN IF NOT EXISTS status ENUM('active','paused','deleted') DEFAULT 'active'",
        "ALTER TABLE gigs ADD COLUMN IF NOT EXISTS created_at DATETIME DEFAULT NOW()",
        "UPDATE gigs SET status = 'active' WHERE status IS NULL",
        "ALTER TABLE proposals ADD COLUMN IF NOT EXISTS cover_letter TEXT NULL",
        "ALTER TABLE proposals ADD COLUMN IF NOT EXISTS delivery_days INT DEFAULT 1",
        "UPDATE proposals SET cover_letter = proposal_text WHERE cover_letter IS NULL AND proposal_text IS NOT NULL"
    ];
    const results = await Promise.allSettled(fixes.map(sql =>
        db.query(sql).then(() => ({ ok: true, sql: sql.substring(0, 40) }))
    ));
    res.json({ done: true, results: results.map(r => r.status === 'fulfilled' ? r.value : { ok: false, err: r.reason?.message }) });
});

// ── Error handler ───────────────────────────────────────────
const { errorHandler } = require('./src/middleware/errorHandler');
app.use(errorHandler);

// ── Socket.io ───────────────────────────────────────────────
const { setIo } = require('./src/modules/notification/notificationService');
setIo(io);

io.use((socket, next) => {
    const token = socket.handshake.auth?.token;
    if (!token) return next(new Error('AUTH_REQUIRED'));
    try {
        const jwt = require('jsonwebtoken');
        const decoded = jwt.verify(token, process.env.JWT_SECRET || 'ethiogigs_jwt_secret_2026');
        socket.userId = decoded.id;
        next();
    } catch {
        next(new Error('TOKEN_INVALID'));
    }
});

io.on('connection', (socket) => {
    socket.join(`user:${socket.userId}`);

    socket.on('chat:send', async (data) => {
        const { conversation_id, content, content_type, file_url } = data;
        try {
            const { db } = require('./src/config/db');
            const [result] = await db.query(
                'INSERT INTO messages (conversation_id, sender_id, content, content_type, file_url) VALUES (?, ?, ?, ?, ?)',
                [conversation_id, socket.userId, content, content_type || 'text', file_url || null]
            );
            const [[conv]] = await db.query('SELECT * FROM conversations WHERE id = ?', [conversation_id]);
            const recipientId = conv.participant_a === socket.userId ? conv.participant_b : conv.participant_a;
            const [[sender]] = await db.query('SELECT full_name FROM users WHERE id = ?', [socket.userId]);
            const msg = {
                id: result.insertId, conversation_id, sender_id: socket.userId,
                sender_name: sender?.full_name, content, content_type: content_type || 'text',
                file_url: file_url || null, created_at: new Date(), is_read: 0
            };
            io.to(`user:${recipientId}`).emit('chat:receive', msg);
            socket.emit('chat:receive', msg);

            // Notify recipient if offline (not in any socket room for their user)
            const recipientSockets = await io.in(`user:${recipientId}`).fetchSockets();
            if (recipientSockets.length === 0) {
                const { enqueueNotification } = require('./src/modules/notification/notificationService');
                await enqueueNotification(recipientId, 'new_message', {
                    title: `💬 New message from ${sender?.full_name || 'Someone'}`,
                    message: content_type === 'text' ? content.substring(0, 100) : `Sent a ${content_type || 'file'}`
                }).catch(() => {});
            }
        } catch (err) {
            socket.emit('chat:error', { message: err.message });
        }
    });

    socket.on('chat:typing', (data) => {
        io.to(`user:${data.recipient_id}`).emit('chat:typing', { sender_id: socket.userId, conversation_id: data.conversation_id });
    });

    socket.on('chat:read', async (data) => {
        const { conversation_id } = data;
        try {
            const { db } = require('./src/config/db');
            // Mark all unread messages in this conversation as read (except own)
            await db.query(
                'UPDATE messages SET is_read = 1 WHERE conversation_id = ? AND sender_id != ? AND is_read = 0',
                [conversation_id, socket.userId]
            );
            const [[conv]] = await db.query('SELECT * FROM conversations WHERE id = ?', [conversation_id]);
            if (conv) {
                const partnerId = conv.participant_a === socket.userId ? conv.participant_b : conv.participant_a;
                // Notify the sender their messages were read
                io.to(`user:${partnerId}`).emit('chat:read', { conversation_id, read_by: socket.userId });
            }
        } catch {}
    });

    // Group chat events
    socket.on('group:join', (groupId) => {
        socket.join(`group:${groupId}`);
    });

    socket.on('group:send', async (data) => {
        const { group_id, content, content_type } = data;
        try {
            const { db } = require('./src/config/db');
            const [result] = await db.query(
                'INSERT INTO group_messages (group_id, sender_id, content, content_type) VALUES (?, ?, ?, ?)',
                [group_id, socket.userId, content, content_type || 'text']
            );
            const [[sender]] = await db.query('SELECT full_name FROM users WHERE id = ?', [socket.userId]);
            const msg = { id: result.insertId, group_id, sender_id: socket.userId, sender_name: sender?.full_name, content, content_type: content_type || 'text', created_at: new Date() };
            io.to(`group:${group_id}`).emit('group:receive', msg);
        } catch (err) {
            socket.emit('chat:error', { message: err.message });
        }
    });

    socket.on('group:typing', (data) => {
        socket.to(`group:${data.group_id}`).emit('group:typing', { sender_id: socket.userId });
    });

    socket.on('disconnect', () => {});
});

// ── Auto-run pending migrations on startup ───────────────
(async () => {
    try {
        const { db: dbConn } = require('./src/config/db');
        const safeAlters = [
            "ALTER TABLE transactions MODIFY COLUMN type ENUM('escrow_fund','milestone_release','full_release','withdrawal','refund','fee','topup') NOT NULL",
            "ALTER TABLE transactions ADD COLUMN IF NOT EXISTS gateway_ref VARCHAR(255) NULL",
            "ALTER TABLE users ADD COLUMN IF NOT EXISTS otp_code VARCHAR(10) NULL",
            "ALTER TABLE users ADD COLUMN IF NOT EXISTS otp_expires DATETIME NULL",
            "ALTER TABLE users ADD COLUMN IF NOT EXISTS reset_token VARCHAR(100) NULL",
            "ALTER TABLE users ADD COLUMN IF NOT EXISTS reset_token_expires DATETIME NULL"
        ];
        for (const sql of safeAlters) {
            await dbConn.query(sql).catch(() => {}); // ignore if already applied
        }
    } catch {}
})();

// ── Cron jobs ────────────────────────────────────────────────
const { startNoProposalCron } = require('./src/modules/jobs/noProposalCron');
startNoProposalCron();

// Match score refresh — runs daily at 3am (Requirement 8.5)
const cron = require('node-cron');
cron.schedule('0 3 * * *', async () => {
    try {
        const { db } = require('./src/config/db');
        // Refresh match scores for freelancers with recent activity
        const [freelancers] = await db.query(
            `SELECT DISTINCT fp.id FROM freelancer_profiles fp
             JOIN users u ON fp.id = u.id
             WHERE u.is_banned = 0 AND (
                 fp.updated_at >= DATE_SUB(NOW(), INTERVAL 24 HOUR)
                 OR fp.id IN (SELECT reviewee_id FROM reviews WHERE created_at >= DATE_SUB(NOW(), INTERVAL 24 HOUR))
             )`
        );
        console.log(`🔄 Match score refresh: updated ${freelancers.length} freelancers`);
    } catch (err) {
        console.error('❌ Match score refresh error:', err.message);
    }
});
console.log('🔄 Match score refresh scheduled (daily 3am)');

// Daily fraud scan — runs at 2am
cron.schedule('0 2 * * *', async () => {    try {
        const { db } = require('./src/config/db');
        const { analyzeUser } = require('./src/modules/fraud/fraudDetector');
        // Scan users with recent activity
        const [users] = await db.query(
            `SELECT DISTINCT user_id FROM transactions
             WHERE created_at >= DATE_SUB(NOW(), INTERVAL 24 HOUR)
             UNION
             SELECT DISTINCT freelancer_id FROM proposals
             WHERE created_at >= DATE_SUB(NOW(), INTERVAL 24 HOUR)`
        );
        let flagCount = 0;
        for (const u of users) {
            const result = await analyzeUser(u.user_id || u.freelancer_id).catch(() => ({ flags: [] }));
            if (result.flags.length > 0) flagCount++;
        }
        console.log(`🔍 Daily fraud scan: checked ${users.length} users, flagged ${flagCount}`);
    } catch (err) {
        console.error('❌ Fraud scan cron error:', err.message);
    }
});
console.log('🔍 Daily fraud scan scheduled (2am)');

// ── Start ────────────────────────────────────────────────────
const PORT = process.env.PORT || 5001;
server.listen(PORT, '0.0.0.0', () => {
    console.log(`🚀 Ethio Gigs server running on http://localhost:${PORT}`);
});
