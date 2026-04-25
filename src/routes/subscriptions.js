const express = require('express');
const router = express.Router();
const { db } = require('../config/db');
const { authenticate } = require('../middleware/auth');
const { enqueueNotification } = require('../modules/notification/notificationService');

// Tier definitions
const TIERS = {
    free: {
        name: 'Free',
        price: 0,
        proposals_per_month: 5,
        featured_in_search: false,
        verified_badge_boost: false,
        commission_rate: 0.10, // 10%
        description: 'Basic access — 5 proposals/month'
    },
    pro: {
        name: 'Pro',
        price: 299, // ETB/month
        proposals_per_month: 30,
        featured_in_search: true,
        verified_badge_boost: false,
        commission_rate: 0.08, // 8% reduced fee
        description: '30 proposals/month, featured in search, 8% commission'
    },
    elite: {
        name: 'Elite',
        price: 699, // ETB/month
        proposals_per_month: -1, // unlimited
        featured_in_search: true,
        verified_badge_boost: true,
        commission_rate: 0.05, // 5% reduced fee
        description: 'Unlimited proposals, top search placement, 5% commission'
    }
};

// GET /api/subscriptions/tiers — public, returns tier info
router.get('/tiers', (req, res) => {
    res.json(TIERS);
});

// GET /api/subscriptions/my — get current user's subscription
router.get('/my', authenticate, async (req, res) => {
    try {
        const [[sub]] = await db.query(
            "SELECT * FROM subscriptions WHERE user_id = ? AND status = 'active' ORDER BY expires_at DESC LIMIT 1",
            [req.user.id]
        );

        // Auto-expire if past expiry
        if (sub && sub.expires_at && new Date(sub.expires_at) < new Date()) {
            await db.query("UPDATE subscriptions SET status = 'expired' WHERE id = ?", [sub.id]);
            return res.json({ tier: 'free', expires_at: null, ...TIERS.free });
        }

        const tier = sub?.tier || 'free';
        res.json({
            tier,
            expires_at: sub?.expires_at || null,
            started_at: sub?.started_at || null,
            ...TIERS[tier]
        });
    } catch (err) {
        res.status(500).json({ error: 'SERVER_ERROR', message: err.message });
    }
});

// POST /api/subscriptions/upgrade — purchase a subscription tier
router.post('/upgrade', authenticate, async (req, res) => {
    const { tier, months = 1 } = req.body;
    if (!TIERS[tier] || tier === 'free') {
        return res.status(422).json({ error: 'INVALID_TIER', message: 'Choose pro or elite' });
    }
    if (months < 1 || months > 12) {
        return res.status(422).json({ error: 'INVALID_MONTHS', message: 'Months must be between 1 and 12' });
    }

    try {
        const totalCost = TIERS[tier].price * months;

        const [[user]] = await db.query('SELECT wallet_balance FROM users WHERE id = ?', [req.user.id]);
        if (parseFloat(user.wallet_balance) < totalCost) {
            return res.status(400).json({
                error: 'INSUFFICIENT_BALANCE',
                message: `You need ${totalCost} ETB to subscribe to ${TIERS[tier].name} for ${months} month(s). Top up your wallet first.`,
                required: totalCost,
                current_balance: parseFloat(user.wallet_balance)
            });
        }

        // Cancel any existing active subscription
        await db.query(
            "UPDATE subscriptions SET status = 'cancelled' WHERE user_id = ? AND status = 'active'",
            [req.user.id]
        );

        const expiresAt = new Date();
        expiresAt.setMonth(expiresAt.getMonth() + months);

        // Deduct from wallet
        await db.query('UPDATE users SET wallet_balance = wallet_balance - ? WHERE id = ?', [totalCost, req.user.id]);

        // Create subscription
        await db.query(
            "INSERT INTO subscriptions (user_id, tier, expires_at, status, amount_paid) VALUES (?, ?, ?, 'active', ?)",
            [req.user.id, tier, expiresAt, totalCost]
        );

        // Log transaction
        await db.query(
            "INSERT INTO transactions (user_id, type, amount, method, status) VALUES (?, 'fee', ?, 'wallet', 'completed')",
            [req.user.id, totalCost]
        );

        await enqueueNotification(req.user.id, 'subscription_activated', {
            title: `🎉 ${TIERS[tier].name} Plan Activated!`,
            message: `Your ${TIERS[tier].name} subscription is active until ${expiresAt.toLocaleDateString()}. Enjoy ${TIERS[tier].description}.`
        }).catch(() => {});

        res.json({
            success: true,
            tier,
            expires_at: expiresAt,
            amount_paid: totalCost,
            message: `${TIERS[tier].name} plan activated for ${months} month(s)`
        });
    } catch (err) {
        res.status(500).json({ error: 'SERVER_ERROR', message: err.message });
    }
});

// POST /api/subscriptions/cancel
router.post('/cancel', authenticate, async (req, res) => {
    try {
        await db.query(
            "UPDATE subscriptions SET status = 'cancelled' WHERE user_id = ? AND status = 'active'",
            [req.user.id]
        );
        res.json({ success: true, message: 'Subscription cancelled. You will revert to the Free plan.' });
    } catch (err) {
        res.status(500).json({ error: 'SERVER_ERROR', message: err.message });
    }
});

module.exports = { router, TIERS };
