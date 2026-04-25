const express = require('express');
const router = express.Router();
const crypto = require('crypto');
const { db } = require('../config/db');
const { authenticate } = require('../middleware/auth');
const { enqueueNotification } = require('../modules/notification/notificationService');

const REFERRAL_REWARD = 50; // ETB credited to referrer when referred user completes first contract

// Generate a unique referral code for a user
async function getOrCreateReferralCode(userId) {
    const [[user]] = await db.query('SELECT referral_code FROM users WHERE id = ?', [userId]);
    if (user.referral_code) return user.referral_code;

    // Generate a short unique code: first 8 chars of sha256(userId + timestamp)
    const code = crypto.createHash('sha256')
        .update(`${userId}-${Date.now()}`)
        .digest('hex')
        .substring(0, 8)
        .toUpperCase();

    await db.query('UPDATE users SET referral_code = ? WHERE id = ?', [code, userId]);
    return code;
}

// GET /api/referrals/my — get referral code and stats
router.get('/my', authenticate, async (req, res) => {
    try {
        const code = await getOrCreateReferralCode(req.user.id);
        const baseUrl = process.env.APP_URL || 'https://habeshagigs.up.railway.app';

        const [referrals] = await db.query(
            `SELECT r.*, u.full_name as referred_name, u.created_at as joined_at
             FROM referrals r
             JOIN users u ON r.referred_id = u.id
             WHERE r.referrer_id = ?
             ORDER BY r.created_at DESC`,
            [req.user.id]
        );

        const totalEarned = referrals
            .filter(r => r.rewarded)
            .reduce((sum, r) => sum + parseFloat(r.reward_amount), 0);

        res.json({
            referral_code: code,
            referral_link: `${baseUrl}/register.html?ref=${code}`,
            total_referrals: referrals.length,
            rewarded_referrals: referrals.filter(r => r.rewarded).length,
            total_earned: totalEarned,
            reward_per_referral: REFERRAL_REWARD,
            referrals
        });
    } catch (err) {
        res.status(500).json({ error: 'SERVER_ERROR', message: err.message });
    }
});

// POST /api/referrals/apply — apply a referral code during registration
// Called internally after user registers with ?ref= param
router.post('/apply', async (req, res) => {
    const { referred_id, referral_code } = req.body;
    if (!referred_id || !referral_code) {
        return res.status(422).json({ error: 'VALIDATION_ERROR' });
    }
    try {
        // Find referrer
        const [[referrer]] = await db.query(
            'SELECT id FROM users WHERE referral_code = ? AND id != ?',
            [referral_code.toUpperCase(), referred_id]
        );
        if (!referrer) return res.status(404).json({ error: 'INVALID_CODE', message: 'Invalid referral code' });

        // Check not already referred
        const [[existing]] = await db.query('SELECT id FROM referrals WHERE referred_id = ?', [referred_id]);
        if (existing) return res.json({ success: true, message: 'Already applied' });

        await db.query(
            'INSERT INTO referrals (referrer_id, referred_id, referral_code, reward_amount) VALUES (?, ?, ?, ?)',
            [referrer.id, referred_id, referral_code.toUpperCase(), REFERRAL_REWARD]
        );
        await db.query('UPDATE users SET referred_by = ? WHERE id = ?', [referrer.id, referred_id]);

        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: 'SERVER_ERROR', message: err.message });
    }
});

// Internal function — called when a referred user completes their first contract
async function processReferralReward(userId) {
    try {
        const [[referral]] = await db.query(
            'SELECT * FROM referrals WHERE referred_id = ? AND rewarded = 0',
            [userId]
        );
        if (!referral) return;

        // Check if this is their first completed contract
        const [[{ cnt }]] = await db.query(
            "SELECT COUNT(*) as cnt FROM contracts WHERE (client_id = ? OR freelancer_id = ?) AND status = 'completed'",
            [userId, userId]
        );
        if (cnt < 1) return;

        // Credit referrer
        await db.query('UPDATE users SET wallet_balance = wallet_balance + ? WHERE id = ?', [referral.reward_amount, referral.referrer_id]);
        await db.query('UPDATE referrals SET rewarded = 1, rewarded_at = NOW() WHERE id = ?', [referral.id]);
        await db.query(
            "INSERT INTO transactions (user_id, type, amount, method, status) VALUES (?, 'topup', ?, 'referral', 'completed')",
            [referral.referrer_id, referral.reward_amount]
        );

        await enqueueNotification(referral.referrer_id, 'referral_reward', {
            title: '🎁 Referral Reward!',
            message: `You earned ${referral.reward_amount} ETB — your referred user just completed their first contract!`
        }).catch(() => {});
    } catch (err) {
        console.error('Referral reward error:', err.message);
    }
}

module.exports = { router, processReferralReward };
