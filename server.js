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
app.use('/api/skills',        require('./src/routes/skills')); // Dedicated skills route (must be before marketplace)
app.use('/api/marketplace',   require('./src/routes/marketplace'));
app.use('/api/match',         require('./src/routes/marketplace'));
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
app.use('/api/subscriptions', require('./src/routes/subscriptions').router);
app.use('/api/referrals',     require('./src/routes/referrals').router);
app.use('/api/diagnostics',   require('./src/routes/diagnostics'));

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
        "UPDATE proposals SET cover_letter = proposal_text WHERE cover_letter IS NULL AND proposal_text IS NOT NULL",
        "ALTER TABLE users ADD COLUMN IF NOT EXISTS otp_code VARCHAR(10) NULL",
        "ALTER TABLE users ADD COLUMN IF NOT EXISTS otp_expires DATETIME NULL",
        "ALTER TABLE users ADD COLUMN IF NOT EXISTS reset_token VARCHAR(100) NULL",
        "ALTER TABLE users ADD COLUMN IF NOT EXISTS reset_token_expires DATETIME NULL"
    ];
    const results = await Promise.allSettled(fixes.map(sql =>
        db.query(sql).then(() => ({ ok: true, sql: sql.substring(0, 60) }))
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
            // Only emit to the RECIPIENT — sender already has the message via optimistic UI
            io.to(`user:${recipientId}`).emit('chat:receive', msg);
            // Also emit back to sender's OTHER sessions (e.g. multiple tabs) but not the sending socket
            socket.to(`user:${socket.userId}`).emit('chat:receive', msg);

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
// Run async without blocking server start
setImmediate(async () => {
    // Wait 3s for DB pool to be ready
    await new Promise(r => setTimeout(r, 3000));
    try {
        const { db: dbConn } = require('./src/config/db');

        // For older MySQL that doesn't support IF NOT EXISTS in ALTER TABLE,
        // we check if the column exists first, then add it if missing
        async function addColumnIfMissing(table, column, definition) {
            try {
                const [rows] = await dbConn.query(
                    `SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS 
                     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ?`,
                    [table, column]
                );
                if (rows.length === 0) {
                    await dbConn.query(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
                    console.log(`✅ Added column: ${table}.${column}`);
                } else {
                    console.log(`✔  Column exists: ${table}.${column}`);
                }
            } catch (e) {
                console.error(`⚠️  Failed to add ${table}.${column}: ${e.message}`);
            }
        }

        // Fix transactions type enum
        try {
            await dbConn.query("ALTER TABLE transactions MODIFY COLUMN type ENUM('escrow_fund','milestone_release','full_release','withdrawal','refund','fee','topup') NOT NULL");
            console.log('✅ transactions.type enum updated');
        } catch (e) {
            console.log('✔  transactions.type already up to date');
        }

        await addColumnIfMissing('transactions', 'gateway_ref', 'VARCHAR(255) NULL');
        await addColumnIfMissing('users', 'otp_code', 'VARCHAR(10) NULL');
        await addColumnIfMissing('users', 'otp_expires', 'DATETIME NULL');
        await addColumnIfMissing('users', 'reset_token', 'VARCHAR(100) NULL');
        await addColumnIfMissing('users', 'reset_token_expires', 'DATETIME NULL');
        await addColumnIfMissing('users', 'suspension_reason', 'TEXT NULL');
        await addColumnIfMissing('users', 'suspended_until', 'DATETIME NULL');
        await addColumnIfMissing('users', 'suspended_at', 'DATETIME NULL');
        await addColumnIfMissing('disputes', 'evidence_files', 'JSON NULL');
        await addColumnIfMissing('disputes', 'evidence_note', 'TEXT NULL');
        await addColumnIfMissing('users', 'referral_code', 'VARCHAR(20) NULL');
        await addColumnIfMissing('users', 'referred_by', 'INT NULL');
        await addColumnIfMissing('users', 'kyc_selfie_url', 'VARCHAR(500) NULL');
        await addColumnIfMissing('users', 'live_verify_token', 'VARCHAR(64) NULL');
        await addColumnIfMissing('users', 'live_verify_expires', 'DATETIME NULL');
        await addColumnIfMissing('jobs', 'is_promoted', 'TINYINT(1) DEFAULT 0');
        await addColumnIfMissing('jobs', 'promoted_until', 'DATETIME NULL');
        await addColumnIfMissing('jobs', 'looking_for_team', 'TINYINT(1) DEFAULT 0');
        await addColumnIfMissing('jobs', 'team_size', 'INT DEFAULT 1');

        // Proposal columns
        await addColumnIfMissing('proposals', 'edit_count', 'INT DEFAULT 0');
        await addColumnIfMissing('proposals', 'contract_id', 'INT NULL');
        await addColumnIfMissing('proposals', 'proposal_text', 'TEXT NULL');

        // Contract signature columns
        await addColumnIfMissing('contracts', 'client_signed', 'TINYINT(1) DEFAULT 0');
        await addColumnIfMissing('contracts', 'freelancer_signed', 'TINYINT(1) DEFAULT 0');
        await addColumnIfMissing('contracts', 'client_signed_at', 'DATETIME NULL');
        await addColumnIfMissing('contracts', 'freelancer_signed_at', 'DATETIME NULL');
        await addColumnIfMissing('contracts', 'client_signature', 'TEXT NULL');
        await addColumnIfMissing('contracts', 'freelancer_signature', 'TEXT NULL');
        await addColumnIfMissing('contracts', 'terms', 'TEXT NULL');
        await addColumnIfMissing('contracts', 'group_chat_id', 'INT NULL');

        // Freelancer profile columns
        await addColumnIfMissing('freelancer_profiles', 'cover_photo_url', 'VARCHAR(500) NULL');
        await addColumnIfMissing('freelancer_profiles', 'video_intro_url', 'VARCHAR(500) NULL');
        await addColumnIfMissing('freelancer_profiles', 'reputation_level', "VARCHAR(20) DEFAULT 'bronze'");
        await addColumnIfMissing('freelancer_profiles', 'reputation_score', 'DECIMAL(5,2) DEFAULT 0');
        await addColumnIfMissing('freelancer_profiles', 'total_completed', 'INT DEFAULT 0');
        await addColumnIfMissing('freelancer_profiles', 'avg_rating', 'DECIMAL(3,2) DEFAULT 0');

        // Users extra columns
        await addColumnIfMissing('users', 'username', 'VARCHAR(50) NULL');
        await addColumnIfMissing('users', 'fraud_score', 'INT DEFAULT 0');
        await addColumnIfMissing('users', 'last_fraud_check', 'DATETIME NULL');

        // Admin audit log table
        try {
            await dbConn.query(`CREATE TABLE IF NOT EXISTS admin_audit_log (
                id INT PRIMARY KEY AUTO_INCREMENT,
                admin_id INT NOT NULL,
                action VARCHAR(50) NOT NULL,
                target_type VARCHAR(30) DEFAULT 'users',
                target_ids JSON NULL,
                reason TEXT NULL,
                created_at DATETIME DEFAULT NOW()
            )`);
        } catch (e) { console.log('audit log table already exists'); }

        console.log('✅ Startup schema checks complete');
    } catch (e) {
        console.error('❌ Startup schema error:', e.message);
    }
});

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

// Auto-unsuspend users whose suspension period has expired — runs every 15 minutes
cron.schedule('*/15 * * * *', async () => {
    try {
        const { db } = require('./src/config/db');
        const [expired] = await db.query(
            "SELECT id, full_name, email FROM users WHERE is_suspended = 1 AND suspended_until IS NOT NULL AND suspended_until <= NOW()"
        );
        for (const u of expired) {
            await db.query(
                "UPDATE users SET is_suspended = 0, suspension_reason = NULL, suspended_until = NULL WHERE id = ?",
                [u.id]
            );
            // Send reactivation email
            const { sendEmail } = require('./src/utils/emailService');
            sendEmail({
                to: u.email,
                toName: u.full_name,
                subject: '✅ Your Ethio Gigs account has been reactivated',
                html: `<div style="font-family:Inter,sans-serif;max-width:480px;margin:0 auto;padding:32px;background:#f8fafc;border-radius:12px;">
                  <h1 style="color:#1E3A8A;">Ethio<span style="color:#14B8A6;">Gigs</span></h1>
                  <div style="background:#fff;border-radius:10px;padding:28px;border:1px solid #e2e8f0;">
                    <h2 style="color:#16a34a;">✅ Account Reactivated</h2>
                    <p>Hi ${u.full_name},</p>
                    <p>Your account suspension period has ended and your account is now fully active. You can log in and use Ethio Gigs normally.</p>
                    <a href="${process.env.APP_URL || 'https://habeshagigs.up.railway.app'}/login.html" style="display:inline-block;background:#1E3A8A;color:#fff;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:700;margin-top:12px;">Log In Now</a>
                  </div>
                </div>`
            }).catch(() => {});
            console.log(`✅ Auto-unsuspended user #${u.id} (${u.email})`);
        }
        if (expired.length > 0) console.log(`🔄 Auto-unsuspend: ${expired.length} user(s) reactivated`);
    } catch (err) {
        console.error('❌ Auto-unsuspend cron error:', err.message);
    }
});
console.log('🔄 Auto-unsuspend cron scheduled (every 15 minutes)');
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

// Overdue milestone check — runs daily at 8am
cron.schedule('0 8 * * *', async () => {
    try {
        const { db } = require('./src/config/db');
        const { enqueueNotification } = require('./src/modules/notification/notificationService');
        const [overdue] = await db.query(
            `SELECT m.id, m.title, m.due_date, m.contract_id,
                    c.client_id, c.freelancer_id,
                    j.title as job_title
             FROM milestones m
             JOIN contracts c ON m.contract_id = c.id
             LEFT JOIN jobs j ON c.job_id = j.id
             WHERE m.due_date < CURDATE()
               AND m.status NOT IN ('released', 'approved')
               AND c.status = 'active'`
        );
        for (const ms of overdue) {
            const daysOverdue = Math.floor((Date.now() - new Date(ms.due_date).getTime()) / (1000 * 60 * 60 * 24));
            const msg = `Milestone "${ms.title}" is ${daysOverdue} day(s) overdue.`;
            await enqueueNotification(ms.freelancer_id, 'milestone_overdue', {
                title: '⏰ Overdue Milestone',
                message: msg + ' Please submit your work as soon as possible.'
            }).catch(() => {});
            await enqueueNotification(ms.client_id, 'milestone_overdue', {
                title: '⏰ Overdue Milestone',
                message: msg + ' You may raise a dispute if work is not delivered.'
            }).catch(() => {});
        }
        if (overdue.length > 0) console.log(`⏰ Overdue milestone alerts sent: ${overdue.length}`);
    } catch (err) {
        console.error('❌ Overdue milestone cron error:', err.message);
    }
});
console.log('⏰ Overdue milestone check scheduled (daily 8am)');

// ── Start ────────────────────────────────────────────────────
const PORT = process.env.PORT || 5001;
server.listen(PORT, '0.0.0.0', () => {
    console.log(`🚀 Ethio Gigs server running on http://localhost:${PORT}`);
});
