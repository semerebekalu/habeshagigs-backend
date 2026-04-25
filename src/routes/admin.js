const express = require('express');
const router = express.Router();
const { db } = require('../config/db');
const { authenticate, requireAdmin } = require('../middleware/auth');
const { enqueueNotification } = require('../modules/notification/notificationService');

router.use(authenticate, requireAdmin);

// GET /api/admin/stats
router.get('/stats', async (req, res) => {
    const [[users]] = await db.query('SELECT COUNT(*) as total FROM users WHERE is_banned = 0');
    const [[jobs]] = await db.query("SELECT COUNT(*) as total FROM jobs WHERE status = 'open'");
    const [[txVol]] = await db.query("SELECT COALESCE(SUM(amount),0) as total FROM transactions WHERE status = 'completed'");
    const [[disputes]] = await db.query('SELECT COUNT(*) as total FROM disputes');
    const [[resolved]] = await db.query("SELECT COUNT(*) as total FROM disputes WHERE status = 'resolved'");
    const [[pendingWithdrawals]] = await db.query("SELECT COUNT(*) as total FROM transactions WHERE type = 'withdrawal' AND status = 'pending'");
    const [[pendingWithdrawalVol]] = await db.query("SELECT COALESCE(SUM(amount),0) as total FROM transactions WHERE type = 'withdrawal' AND status = 'pending'");
    res.json({
        total_users: users.total,
        active_jobs: jobs.total,
        transaction_volume: txVol.total,
        dispute_resolution_rate: disputes.total > 0 ? ((resolved.total / disputes.total) * 100).toFixed(1) + '%' : '0%',
        pending_withdrawals: pendingWithdrawals.total,
        pending_withdrawal_volume: pendingWithdrawalVol.total
    });
});

// GET /api/admin/users
router.get('/users', async (req, res) => {
    const { search } = req.query;
    let sql = 'SELECT id, full_name, email, role, kyc_status, is_verified, is_suspended, is_banned, created_at FROM users WHERE 1=1';
    const params = [];
    if (search) { sql += ' AND (full_name LIKE ? OR email LIKE ?)'; params.push(`%${search}%`, `%${search}%`); }
    sql += ' ORDER BY created_at DESC LIMIT 100';
    const [users] = await db.query(sql, params);
    res.json(users);
});

// PUT /api/admin/users/:id/suspend
router.put('/users/:id/suspend', async (req, res) => {
    try {
        const [[user]] = await db.query('SELECT id FROM users WHERE id = ?', [req.params.id]);
        if (!user) return res.status(404).json({ error: 'USER_NOT_FOUND' });
        await db.query('UPDATE users SET is_suspended = 1 WHERE id = ?', [req.params.id]);
        res.json({ success: true });
    } catch (err) { res.status(500).json({ error: 'SERVER_ERROR', message: err.message }); }
});

// PUT /api/admin/users/:id/unsuspend
router.put('/users/:id/unsuspend', async (req, res) => {
    try {
        const [[user]] = await db.query('SELECT id FROM users WHERE id = ?', [req.params.id]);
        if (!user) return res.status(404).json({ error: 'USER_NOT_FOUND' });
        await db.query('UPDATE users SET is_suspended = 0 WHERE id = ?', [req.params.id]);
        res.json({ success: true });
    } catch (err) { res.status(500).json({ error: 'SERVER_ERROR', message: err.message }); }
});

// PUT /api/admin/users/:id/ban
router.put('/users/:id/ban', async (req, res) => {
    try {
        const [[user]] = await db.query('SELECT id FROM users WHERE id = ?', [req.params.id]);
        if (!user) return res.status(404).json({ error: 'USER_NOT_FOUND' });
        await db.query('UPDATE users SET is_banned = 1 WHERE id = ?', [req.params.id]);
        res.json({ success: true });
    } catch (err) { res.status(500).json({ error: 'SERVER_ERROR', message: err.message }); }
});

// PUT /api/admin/users/:id/unban
router.put('/users/:id/unban', async (req, res) => {
    try {
        const [[user]] = await db.query('SELECT id FROM users WHERE id = ?', [req.params.id]);
        if (!user) return res.status(404).json({ error: 'USER_NOT_FOUND' });
        await db.query('UPDATE users SET is_banned = 0, is_suspended = 0 WHERE id = ?', [req.params.id]);
        res.json({ success: true });
    } catch (err) { res.status(500).json({ error: 'SERVER_ERROR', message: err.message }); }
});

// GET /api/admin/kyc
router.get('/kyc', async (req, res) => {
    const [submissions] = await db.query(
        `SELECT k.*, u.full_name, u.email, u.role FROM kyc_submissions k
         JOIN users u ON k.user_id = u.id WHERE k.status = 'pending' ORDER BY k.submitted_at ASC`
    );
    res.json(submissions);
});

// GET /api/admin/disputes
router.get('/disputes', async (req, res) => {
    const [disputes] = await db.query(
        `SELECT d.*, u.full_name as raised_by_name FROM disputes d
         JOIN users u ON d.raised_by = u.id ORDER BY d.created_at DESC`
    );
    res.json(disputes);
});

// GET /api/admin/escrow
router.get('/escrow', async (req, res) => {
    const [contracts] = await db.query(
        `SELECT c.*, u1.full_name as client_name, u2.full_name as freelancer_name
         FROM contracts c
         JOIN users u1 ON c.client_id = u1.id
         JOIN users u2 ON c.freelancer_id = u2.id
         ORDER BY c.created_at DESC`
    );
    res.json(contracts);
});

// POST /api/admin/announcements
router.post('/announcements', async (req, res) => {
    const { title, message, target, user_id } = req.body;
    // target: 'all' | 'freelancers' | 'clients' | 'user'
    if (!title || !message) return res.status(422).json({ error: 'VALIDATION_ERROR', message: 'Title and message required' });
    try {
        let users = [];
        if (user_id) {
            users = [{ id: parseInt(user_id) }];
        } else if (target === 'freelancers') {
            [users] = await db.query("SELECT id FROM users WHERE role = 'freelancer' AND is_banned = 0");
        } else if (target === 'clients') {
            [users] = await db.query("SELECT id FROM users WHERE role = 'client' AND is_banned = 0");
        } else {
            // 'all' or default
            [users] = await db.query('SELECT id FROM users WHERE is_banned = 0');
        }
        for (const u of users) {
            await enqueueNotification(u.id, 'announcement', { title, message });
        }
        res.json({ success: true, sent_to: users.length });
    } catch (err) {
        res.status(500).json({ error: 'SERVER_ERROR', message: err.message });
    }
});

// GET /api/admin/moderation — reported content queue (Requirement 13.4)
router.get('/moderation', async (req, res) => {
    try {
        const [reportedMessages] = await db.query(
            `SELECT m.id, 'message' as type, m.content, m.sender_id, u.full_name as reporter_name, m.created_at
             FROM messages m JOIN users u ON m.sender_id = u.id
             WHERE m.is_reported = 1 ORDER BY m.created_at DESC LIMIT 50`
        );
        res.json({ reported_messages: reportedMessages });
    } catch (err) {
        res.status(500).json({ error: 'SERVER_ERROR', message: err.message });
    }
});

// PUT /api/admin/moderation/message/:id — remove or warn (Requirement 13.4)
router.put('/moderation/message/:id', async (req, res) => {
    const { action } = req.body; // 'remove' | 'warn' | 'dismiss'
    try {
        if (action === 'remove') {
            await db.query("UPDATE messages SET content = '[Message removed by admin]', is_reported = 0 WHERE id = ?", [req.params.id]);
        } else {
            await db.query('UPDATE messages SET is_reported = 0 WHERE id = ?', [req.params.id]);
        }
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: 'SERVER_ERROR', message: err.message });
    }
});

// ── Withdrawal approval endpoints ──────────────────────────

// GET /api/admin/withdrawals — pending withdrawal requests
router.get('/withdrawals', async (req, res) => {
    try {
        const [withdrawals] = await db.query(
            `SELECT t.id, t.user_id, t.amount, t.method, t.status, t.gateway_ref, t.created_at,
                    u.full_name, u.email, u.role
             FROM transactions t
             JOIN users u ON t.user_id = u.id
             WHERE t.type = 'withdrawal' AND t.status = 'pending'
             ORDER BY t.created_at ASC`
        );
        res.json(withdrawals);
    } catch (err) {
        res.status(500).json({ error: 'SERVER_ERROR', message: err.message });
    }
});

// GET /api/admin/withdrawals/history — all processed withdrawals
router.get('/withdrawals/history', async (req, res) => {
    try {
        const [withdrawals] = await db.query(
            `SELECT t.id, t.user_id, t.amount, t.method, t.status, t.gateway_ref, t.created_at,
                    u.full_name, u.email
             FROM transactions t
             JOIN users u ON t.user_id = u.id
             WHERE t.type = 'withdrawal'
             ORDER BY t.created_at DESC LIMIT 100`
        );
        res.json(withdrawals);
    } catch (err) {
        res.status(500).json({ error: 'SERVER_ERROR', message: err.message });
    }
});

// PUT /api/admin/withdrawals/:id/approve
router.put('/withdrawals/:id/approve', async (req, res) => {
    try {
        const [[tx]] = await db.query("SELECT * FROM transactions WHERE id = ? AND type = 'withdrawal' AND status = 'pending'", [req.params.id]);
        if (!tx) return res.status(404).json({ error: 'NOT_FOUND' });

        await db.query(
            "UPDATE transactions SET status = 'completed' WHERE id = ?",
            [req.params.id]
        );

        await enqueueNotification(tx.user_id, 'withdrawal_approved', {
            title: '✅ Withdrawal Approved',
            title_am: '✅ ገንዘብ ማውጣት ፀድቋል',
            message: `Your withdrawal of ${parseFloat(tx.amount).toFixed(2)} ETB via ${tx.method} has been approved and is being processed. Funds will arrive within 3 business days.`,
            message_am: `${parseFloat(tx.amount).toFixed(2)} ብር ማውጣትዎ ፀድቋል። ገንዘቡ በ3 የሥራ ቀናት ውስጥ ይደርሳል።`
        });

        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: 'SERVER_ERROR', message: err.message });
    }
});

// PUT /api/admin/withdrawals/:id/reject
router.put('/withdrawals/:id/reject', async (req, res) => {
    const { reason } = req.body;
    try {
        const [[tx]] = await db.query("SELECT * FROM transactions WHERE id = ? AND type = 'withdrawal' AND status = 'pending'", [req.params.id]);
        if (!tx) return res.status(404).json({ error: 'NOT_FOUND' });

        // Refund the reserved amount back to user wallet
        await db.query('UPDATE users SET wallet_balance = wallet_balance + ? WHERE id = ?', [parseFloat(tx.amount), tx.user_id]);
        await db.query(
            "UPDATE transactions SET status = 'failed', gateway_ref = CONCAT(COALESCE(gateway_ref,''), ' | Rejected: ', ?) WHERE id = ?",
            [reason || 'Rejected by admin', req.params.id]
        );

        await enqueueNotification(tx.user_id, 'withdrawal_rejected', {
            title: '❌ Withdrawal Rejected',
            title_am: '❌ ገንዘብ ማውጣት ውድቅ ሆኗል',
            message: `Your withdrawal of ${parseFloat(tx.amount).toFixed(2)} ETB was rejected. Reason: ${reason || 'Please contact support.'}. The amount has been returned to your wallet.`,
            message_am: `${parseFloat(tx.amount).toFixed(2)} ብር ማውጣትዎ ውድቅ ሆኗል። ምክንያት: ${reason || 'ድጋፍን ያነጋግሩ።'}. ገንዘቡ ወደ ዋሌትዎ ተመልሷል።`
        });

        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: 'SERVER_ERROR', message: err.message });
    }
});

// GET /api/admin/fraud — get all unresolved fraud flags
router.get('/fraud', async (req, res) => {
    try {
        const [flags] = await db.query(
            `SELECT ff.*, u.full_name, u.email, u.role, u.fraud_score, u.is_banned, u.is_suspended
             FROM fraud_flags ff
             JOIN users u ON ff.user_id = u.id
             WHERE ff.is_resolved = 0
             ORDER BY FIELD(ff.severity,'critical','high','medium','low'), ff.created_at DESC`
        );
        res.json(flags);
    } catch (err) {
        res.status(500).json({ error: 'SERVER_ERROR', message: err.message });
    }
});

// GET /api/admin/fraud/stats
router.get('/fraud/stats', async (req, res) => {
    try {
        const [[total]] = await db.query('SELECT COUNT(*) as cnt FROM fraud_flags WHERE is_resolved = 0');
        const [[high]] = await db.query("SELECT COUNT(*) as cnt FROM fraud_flags WHERE severity IN ('high','critical') AND is_resolved = 0");
        const [[resolved]] = await db.query('SELECT COUNT(*) as cnt FROM fraud_flags WHERE is_resolved = 1');
        const [[flaggedUsers]] = await db.query('SELECT COUNT(DISTINCT user_id) as cnt FROM fraud_flags WHERE is_resolved = 0');
        res.json({ total: total.cnt, high_severity: high.cnt, resolved: resolved.cnt, flagged_users: flaggedUsers.cnt });
    } catch (err) {
        res.status(500).json({ error: 'SERVER_ERROR', message: err.message });
    }
});

// PUT /api/admin/fraud/:id/resolve
router.put('/fraud/:id/resolve', async (req, res) => {
    await db.query('UPDATE fraud_flags SET is_resolved = 1, resolved_by = ? WHERE id = ?', [req.user.id, req.params.id]);
    res.json({ success: true });
});

// POST /api/admin/fraud/scan/:userId — manually trigger fraud scan
router.post('/fraud/scan/:userId', async (req, res) => {
    try {
        const { analyzeUser } = require('../modules/fraud/fraudDetector');
        const result = await analyzeUser(parseInt(req.params.userId));
        res.json({ success: true, ...result });
    } catch (err) {
        res.status(500).json({ error: 'SERVER_ERROR', message: err.message });
    }
});

module.exports = router;
