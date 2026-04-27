const express = require('express');
const router = express.Router();
const { db } = require('../config/db');
const { authenticate, requireAdmin } = require('../middleware/auth');
const { enqueueNotification } = require('../modules/notification/notificationService');
const { sendEmail } = require('../utils/emailService');

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
    const { reason, duration_days } = req.body; // duration_days: null = permanent suspension
    try {
        const [[user]] = await db.query('SELECT id, full_name, email FROM users WHERE id = ?', [req.params.id]);
        if (!user) return res.status(404).json({ error: 'USER_NOT_FOUND' });

        const suspendedUntil = duration_days
            ? new Date(Date.now() + parseInt(duration_days) * 24 * 60 * 60 * 1000)
            : null;

        await db.query(
            'UPDATE users SET is_suspended = 1, suspension_reason = ?, suspended_until = ?, suspended_at = NOW() WHERE id = ?',
            [reason || 'Violation of platform terms', suspendedUntil, req.params.id]
        );

        // In-app notification
        await enqueueNotification(req.params.id, 'account_suspended', {
            title: '⚠️ Account Suspended',
            message: `Your account has been suspended. Reason: ${reason || 'Violation of platform terms'}.${suspendedUntil ? ` Suspension ends: ${suspendedUntil.toLocaleDateString()}.` : ' Contact support to appeal.'}`
        }).catch(() => {});

        // Email notification
        const durationText = duration_days
            ? `Your account will be automatically reactivated on <strong>${suspendedUntil.toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}</strong>.`
            : `This suspension is <strong>indefinite</strong>. Please contact support to appeal.`;

        sendEmail({
            to: user.email,
            toName: user.full_name,
            subject: '⚠️ Your Ethio Gigs account has been suspended',
            html: `<div style="font-family:Inter,sans-serif;max-width:480px;margin:0 auto;padding:32px;background:#f8fafc;border-radius:12px;">
              <h1 style="color:#1E3A8A;">Ethio<span style="color:#14B8A6;">Gigs</span></h1>
              <div style="background:#fff;border-radius:10px;padding:28px;border:1px solid #e2e8f0;">
                <h2 style="color:#dc2626;">⚠️ Account Suspended</h2>
                <p>Hi ${user.full_name},</p>
                <p>Your Ethio Gigs account has been <strong>suspended</strong> and you will not be able to log in during this period.</p>
                <div style="background:#fee2e2;border-radius:8px;padding:16px;margin:16px 0;">
                  <strong>Reason:</strong><br/>${reason || 'Violation of platform terms'}
                </div>
                <p>${durationText}</p>
                <p style="color:#64748b;font-size:0.88rem;">If you believe this is a mistake, please contact our support team.</p>
              </div>
              <p style="color:#94a3b8;font-size:0.78rem;text-align:center;margin-top:16px;">© 2026 Ethio Gigs</p>
            </div>`
        }).catch(() => {});

        res.json({ success: true, suspended_until: suspendedUntil });
    } catch (err) { res.status(500).json({ error: 'SERVER_ERROR', message: err.message }); }
});

// PUT /api/admin/users/:id/unsuspend
router.put('/users/:id/unsuspend', async (req, res) => {
    try {
        const [[user]] = await db.query('SELECT id, full_name, email FROM users WHERE id = ?', [req.params.id]);
        if (!user) return res.status(404).json({ error: 'USER_NOT_FOUND' });
        await db.query('UPDATE users SET is_suspended = 0, suspension_reason = NULL, suspended_until = NULL WHERE id = ?', [req.params.id]);

        await enqueueNotification(req.params.id, 'account_reactivated', {
            title: '✅ Account Reactivated',
            message: 'Your account suspension has been lifted. You can now log in and use Ethio Gigs normally.'
        }).catch(() => {});

        sendEmail({
            to: user.email,
            toName: user.full_name,
            subject: '✅ Your Ethio Gigs account has been reactivated',
            html: `<div style="font-family:Inter,sans-serif;max-width:480px;margin:0 auto;padding:32px;background:#f8fafc;border-radius:12px;">
              <h1 style="color:#1E3A8A;">Ethio<span style="color:#14B8A6;">Gigs</span></h1>
              <div style="background:#fff;border-radius:10px;padding:28px;border:1px solid #e2e8f0;">
                <h2 style="color:#16a34a;">✅ Account Reactivated</h2>
                <p>Hi ${user.full_name}, your account has been reactivated. You can now log in normally.</p>
                <a href="${process.env.APP_URL || 'https://habeshagigs.up.railway.app'}/login.html" style="display:inline-block;background:#1E3A8A;color:#fff;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:700;margin-top:12px;">Log In Now</a>
              </div>
            </div>`
        }).catch(() => {});

        res.json({ success: true });
    } catch (err) { res.status(500).json({ error: 'SERVER_ERROR', message: err.message }); }
});

// DELETE /api/admin/users/:id — permanently delete a user account
router.delete('/users/:id', async (req, res) => {
    try {
        const [[user]] = await db.query('SELECT id, full_name, email, role FROM users WHERE id = ?', [req.params.id]);
        if (!user) return res.status(404).json({ error: 'USER_NOT_FOUND' });
        if (user.role === 'admin') return res.status(403).json({ error: 'FORBIDDEN', message: 'Cannot delete admin accounts' });

        // Soft delete: anonymize personal data, preserve transaction history
        // Does NOT ban — they can re-register with the same email
        const anonymizedEmail = `deleted_${req.params.id}_${Date.now()}@deleted.ethiogigs`;
        await db.query(
            `UPDATE users SET
                full_name = '[Deleted User]',
                email = ?,
                phone = NULL,
                password_hash = '',
                google_id = NULL,
                otp_code = NULL,
                otp_expires = NULL,
                reset_token = NULL,
                reset_token_expires = NULL,
                referral_code = NULL
             WHERE id = ?`,
            [anonymizedEmail, req.params.id]
        );

        // Also wipe freelancer profile personal data if exists
        await db.query(
            `UPDATE freelancer_profiles SET
                title = NULL, bio = NULL, bio_am = NULL,
                profile_photo_url = NULL, cover_photo_url = NULL, video_intro_url = NULL
             WHERE id = ?`,
            [req.params.id]
        ).catch(() => {});

        // Send deletion email before anonymizing
        sendEmail({
            to: user.email,
            toName: user.full_name,
            subject: 'Your Ethio Gigs account has been deleted',
            html: `<div style="font-family:Inter,sans-serif;max-width:480px;margin:0 auto;padding:32px;background:#f8fafc;border-radius:12px;">
              <h1 style="color:#1E3A8A;">Ethio<span style="color:#14B8A6;">Gigs</span></h1>
              <div style="background:#fff;border-radius:10px;padding:28px;border:1px solid #e2e8f0;">
                <h2 style="color:#dc2626;">Account Deleted</h2>
                <p>Hi ${user.full_name},</p>
                <p>Your Ethio Gigs account has been permanently deleted by our admin team. All personal data has been removed.</p>
                <p style="color:#64748b;font-size:0.88rem;">If you believe this was a mistake, please contact support immediately.</p>
              </div>
            </div>`
        }).catch(() => {});

        console.log(`🗑️ Admin #${req.user.id} deleted user #${req.params.id} (${user.email})`);
        res.json({ success: true, message: `Account for ${user.full_name} has been deleted` });
    } catch (err) { res.status(500).json({ error: 'SERVER_ERROR', message: err.message }); }
});

// POST /api/admin/users/:id/reset-kyc — reset KYC for testing
router.post('/users/:id/reset-kyc', async (req, res) => {
    try {
        await db.query(
            "UPDATE users SET kyc_status = 'none', is_verified = 0, kyc_selfie_url = NULL, live_verify_token = NULL, live_verify_expires = NULL WHERE id = ?",
            [req.params.id]
        );
        await db.query(
            "UPDATE kyc_submissions SET status = 'rejected', rejection_reason = 'Reset by admin for testing' WHERE user_id = ?",
            [req.params.id]
        );
        res.json({ success: true, message: 'KYC reset. User can resubmit.' });
    } catch (err) {
        res.status(500).json({ error: 'SERVER_ERROR', message: err.message });
    }
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

// GET /api/admin/withdrawals — pending withdrawal requests (excludes user-cancelled)
router.get('/withdrawals', async (req, res) => {
    try {
        const [withdrawals] = await db.query(
            `SELECT t.id, t.user_id, t.amount, t.method, t.status, t.gateway_ref, t.created_at,
                    u.full_name, u.email, u.role
             FROM transactions t
             JOIN users u ON t.user_id = u.id
             WHERE t.type = 'withdrawal'
               AND t.status = 'pending'
               AND (t.gateway_ref IS NULL OR t.gateway_ref NOT LIKE '%Cancelled by user%')
             ORDER BY t.created_at ASC`
        );
        res.json(withdrawals);
    } catch (err) {
        res.status(500).json({ error: 'SERVER_ERROR', message: err.message });
    }
});

// GET /api/admin/withdrawals/history — processed withdrawals (excludes user-cancelled ones)
router.get('/withdrawals/history', async (req, res) => {
    try {
        const [withdrawals] = await db.query(
            `SELECT t.id, t.user_id, t.amount, t.method, t.status, t.gateway_ref, t.created_at,
                    u.full_name, u.email
             FROM transactions t
             JOIN users u ON t.user_id = u.id
             WHERE t.type = 'withdrawal'
               AND t.status IN ('completed', 'pending')
               AND (t.gateway_ref IS NULL OR t.gateway_ref NOT LIKE '%Cancelled by user%')
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

// GET /api/admin/revenue — platform revenue dashboard
router.get('/revenue', async (req, res) => {
    try {
        // Total fees collected (platform_fee from contracts)
        const [[totalFees]] = await db.query(
            "SELECT COALESCE(SUM(platform_fee),0) as total FROM contracts WHERE status = 'completed'"
        );
        // Monthly breakdown (last 6 months)
        const [monthly] = await db.query(
            `SELECT DATE_FORMAT(completed_at,'%Y-%m') as month,
                    COUNT(*) as contracts,
                    COALESCE(SUM(platform_fee),0) as fees,
                    COALESCE(SUM(total_amount),0) as volume
             FROM contracts
             WHERE status = 'completed' AND completed_at >= DATE_SUB(NOW(), INTERVAL 6 MONTH)
             GROUP BY month ORDER BY month ASC`
        );
        // Top earners (freelancers by completed contract value)
        const [topFreelancers] = await db.query(
            `SELECT u.id, u.full_name, u.email,
                    COUNT(c.id) as contracts,
                    COALESCE(SUM(c.total_amount),0) as total_earned
             FROM contracts c
             JOIN users u ON c.freelancer_id = u.id
             WHERE c.status = 'completed'
             GROUP BY u.id ORDER BY total_earned DESC LIMIT 10`
        );
        // Top clients (by spend)
        const [topClients] = await db.query(
            `SELECT u.id, u.full_name, u.email,
                    COUNT(c.id) as contracts,
                    COALESCE(SUM(c.total_amount),0) as total_spent
             FROM contracts c
             JOIN users u ON c.client_id = u.id
             WHERE c.status = 'completed'
             GROUP BY u.id ORDER BY total_spent DESC LIMIT 10`
        );
        // Subscription revenue
        const [[subRevenue]] = await db.query(
            "SELECT COALESCE(SUM(amount_paid),0) as total FROM subscriptions WHERE status IN ('active','expired','cancelled')"
        );
        // Promoted jobs revenue
        const [[promoRevenue]] = await db.query(
            "SELECT COALESCE(SUM(amount_paid),0) as total FROM promoted_jobs"
        );

        res.json({
            total_platform_fees: totalFees.total,
            subscription_revenue: subRevenue.total,
            promotion_revenue: promoRevenue.total,
            total_revenue: parseFloat(totalFees.total) + parseFloat(subRevenue.total) + parseFloat(promoRevenue.total),
            monthly_breakdown: monthly,
            top_freelancers: topFreelancers,
            top_clients: topClients
        });
    } catch (err) {
        res.status(500).json({ error: 'SERVER_ERROR', message: err.message });
    }
});

// GET /api/admin/audit — admin action audit log
router.get('/audit', async (req, res) => {
    try {
        const [logs] = await db.query(
            `SELECT al.*, u.full_name as admin_name, u.email as admin_email
             FROM admin_audit_log al
             JOIN users u ON al.admin_id = u.id
             ORDER BY al.created_at DESC LIMIT 200`
        );
        res.json(logs);
    } catch (err) {
        // Table might not exist yet
        res.json([]);
    }
});

// POST /api/admin/users/bulk — bulk actions on multiple users
router.post('/users/bulk', async (req, res) => {
    const { user_ids, action, reason } = req.body;
    if (!user_ids || !Array.isArray(user_ids) || user_ids.length === 0) {
        return res.status(422).json({ error: 'VALIDATION_ERROR', message: 'user_ids array required' });
    }
    if (!['suspend', 'unsuspend', 'ban', 'unban'].includes(action)) {
        return res.status(422).json({ error: 'INVALID_ACTION' });
    }
    // Prevent acting on admin accounts
    const [admins] = await db.query(
        `SELECT id FROM users WHERE id IN (${user_ids.map(() => '?').join(',')}) AND role = 'admin'`,
        user_ids
    );
    const adminIds = new Set(admins.map(a => a.id));
    const safeIds = user_ids.filter(id => !adminIds.has(id));
    if (!safeIds.length) return res.status(403).json({ error: 'FORBIDDEN', message: 'Cannot act on admin accounts' });

    try {
        const placeholders = safeIds.map(() => '?').join(',');
        if (action === 'suspend') {
            await db.query(
                `UPDATE users SET is_suspended = 1, suspension_reason = ?, suspended_at = NOW() WHERE id IN (${placeholders})`,
                [reason || 'Bulk action by admin', ...safeIds]
            );
        } else if (action === 'unsuspend') {
            await db.query(
                `UPDATE users SET is_suspended = 0, suspension_reason = NULL, suspended_until = NULL WHERE id IN (${placeholders})`,
                safeIds
            );
        } else if (action === 'ban') {
            await db.query(`UPDATE users SET is_banned = 1 WHERE id IN (${placeholders})`, safeIds);
        } else if (action === 'unban') {
            await db.query(`UPDATE users SET is_banned = 0, is_suspended = 0 WHERE id IN (${placeholders})`, safeIds);
        }

        // Log the bulk action
        await db.query(
            `INSERT INTO admin_audit_log (admin_id, action, target_type, target_ids, reason) VALUES (?, ?, 'users', ?, ?)`,
            [req.user.id, action, JSON.stringify(safeIds), reason || null]
        ).catch(() => {}); // table may not exist yet

        res.json({ success: true, affected: safeIds.length, skipped_admins: adminIds.size });
    } catch (err) {
        res.status(500).json({ error: 'SERVER_ERROR', message: err.message });
    }
});

module.exports = router;
