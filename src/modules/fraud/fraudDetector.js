const { db } = require('../../config/db');
const { enqueueNotification } = require('../notification/notificationService');

/**
 * Run fraud analysis on a user and flag suspicious patterns.
 * Called after: registration, login, payment, review submission.
 */
async function analyzeUser(userId) {
    try {
        const [[user]] = await db.query(
            'SELECT * FROM users WHERE id = ?', [userId]
        );
        if (!user) return;

        const flags = [];

        // 1. Multiple failed logins (brute force)
        if (user.failed_login_attempts >= 3) {
            flags.push({
                type: 'multiple_failed_logins',
                severity: user.failed_login_attempts >= 5 ? 'high' : 'medium',
                description: `${user.failed_login_attempts} consecutive failed login attempts`
            });
        }

        // 2. Rapid transactions (payment fraud)
        const [recentTx] = await db.query(
            `SELECT COUNT(*) as cnt FROM transactions
             WHERE user_id = ? AND created_at >= DATE_SUB(NOW(), INTERVAL 1 HOUR)
             AND status = 'completed'`,
            [userId]
        );
        if (recentTx[0].cnt >= 5) {
            flags.push({
                type: 'rapid_transactions',
                severity: 'high',
                description: `${recentTx[0].cnt} transactions in the last hour`
            });
        }

        // 3. Multiple failed transactions (payment anomaly)
        const [failedTx] = await db.query(
            `SELECT COUNT(*) as cnt FROM transactions
             WHERE user_id = ? AND status = 'failed'
             AND created_at >= DATE_SUB(NOW(), INTERVAL 24 HOUR)`,
            [userId]
        );
        if (failedTx[0].cnt >= 3) {
            flags.push({
                type: 'multiple_failed_payments',
                severity: 'medium',
                description: `${failedTx[0].cnt} failed payment attempts in 24 hours`
            });
        }

        // 4. Suspicious review pattern (many 5-star reviews in short time)
        const [recentReviews] = await db.query(
            `SELECT COUNT(*) as cnt FROM reviews
             WHERE reviewee_id = ? AND rating = 5
             AND created_at >= DATE_SUB(NOW(), INTERVAL 24 HOUR)`,
            [userId]
        );
        if (recentReviews[0].cnt >= 5) {
            flags.push({
                type: 'suspicious_reviews',
                severity: 'medium',
                description: `${recentReviews[0].cnt} 5-star reviews received in 24 hours — possible fake reviews`
            });
        }

        // 5. Unverified user with high transaction volume
        if (!user.is_verified) {
            const [txVol] = await db.query(
                `SELECT COALESCE(SUM(amount), 0) as total FROM transactions
                 WHERE user_id = ? AND status = 'completed'`,
                [userId]
            );
            if (parseFloat(txVol[0].total) > 50000) {
                flags.push({
                    type: 'unverified_high_volume',
                    severity: 'high',
                    description: `Unverified account with ${parseFloat(txVol[0].total).toFixed(0)} ETB in transactions`
                });
            }
        }

        // 6. Account created very recently with immediate high activity
        const accountAgeDays = (Date.now() - new Date(user.created_at).getTime()) / (1000 * 60 * 60 * 24);
        if (accountAgeDays < 1) {
            const [activityCount] = await db.query(
                `SELECT COUNT(*) as cnt FROM proposals WHERE freelancer_id = ?
                 AND created_at >= DATE_SUB(NOW(), INTERVAL 1 HOUR)`,
                [userId]
            );
            if (activityCount[0].cnt >= 10) {
                flags.push({
                    type: 'new_account_spam',
                    severity: 'high',
                    description: `New account (< 1 day old) submitted ${activityCount[0].cnt} proposals in 1 hour`
                });
            }
        }

        // Calculate fraud score
        const scoreMap = { low: 10, medium: 25, high: 50, critical: 100 };
        const fraudScore = flags.reduce((sum, f) => sum + (scoreMap[f.severity] || 10), 0);

        // Save flags to DB
        for (const flag of flags) {
            // Check if this flag type already exists and is unresolved
            const [[existing]] = await db.query(
                'SELECT id FROM fraud_flags WHERE user_id = ? AND flag_type = ? AND is_resolved = 0',
                [userId, flag.type]
            );
            if (!existing) {
                await db.query(
                    'INSERT INTO fraud_flags (user_id, flag_type, severity, description) VALUES (?, ?, ?, ?)',
                    [userId, flag.type, flag.severity, flag.description]
                );
            }
        }

        // Update user fraud score
        if (flags.length > 0) {
            await db.query(
                'UPDATE users SET fraud_score = ?, last_fraud_check = NOW() WHERE id = ?',
                [Math.min(fraudScore, 100), userId]
            );

            // Alert admins for high severity
            const highFlags = flags.filter(f => f.severity === 'high' || f.severity === 'critical');
            if (highFlags.length > 0) {
                const [admins] = await db.query("SELECT id FROM users WHERE role = 'admin'");
                for (const admin of admins) {
                    await enqueueNotification(admin.id, 'fraud_alert', {
                        title: '🚨 Fraud Alert',
                        message: `User #${userId} flagged: ${highFlags.map(f => f.type).join(', ')}`
                    });
                }
            }
        } else {
            await db.query('UPDATE users SET last_fraud_check = NOW() WHERE id = ?', [userId]);
        }

        return { flags, fraudScore };
    } catch (err) {
        console.error('Fraud detection error:', err.message);
        return { flags: [], fraudScore: 0 };
    }
}

module.exports = { analyzeUser };
