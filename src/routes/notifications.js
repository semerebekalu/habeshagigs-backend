const express = require('express');
const router = express.Router();
const { db } = require('../config/db');
const { authenticate } = require('../middleware/auth');

// ── Category → event_type mapping ──────────────────────────
const CATEGORY_MAP = {
    jobs:     ['proposal_accepted', 'milestone_overdue', 'work_submitted', 'new_proposal'],
    payments: ['payment_released', 'withdrawal_approved', 'withdrawal_rejected', 'referral_reward', 'topup_confirmed'],
    messages: ['new_message'],
    system:   ['kyc_approved', 'kyc_rejected', 'contract_signed', 'contract_completed', 'dispute_raised', 'dispute_resolved'],
    admin:    ['admin_action', 'suspension', 'ban', 'platform_update']
};

function eventToCategory(eventType) {
    for (const [cat, types] of Object.entries(CATEGORY_MAP)) {
        if (types.includes(eventType)) return cat;
    }
    return 'system';
}

// GET /api/notifications — paginated, filterable
router.get('/', authenticate, async (req, res) => {
    try {
        const userId = req.user.id;
        const limit  = Math.min(parseInt(req.query.limit)  || 20, 50);
        const offset = parseInt(req.query.offset) || 0;
        const category = req.query.category; // all | jobs | payments | messages | system | admin

        let whereClause = 'WHERE n.user_id = ?';
        const params = [userId];

        if (category && category !== 'all' && CATEGORY_MAP[category]) {
            const placeholders = CATEGORY_MAP[category].map(() => '?').join(',');
            whereClause += ` AND n.event_type IN (${placeholders})`;
            params.push(...CATEGORY_MAP[category]);
        }

        const [notifications] = await db.query(
            `SELECT n.id, n.event_type, n.title, n.title_am, n.message, n.message_am,
                    n.is_read, n.created_at
             FROM notifications n
             ${whereClause}
             ORDER BY n.created_at DESC
             LIMIT ? OFFSET ?`,
            [...params, limit, offset]
        );

        // Unread count (always total, not filtered)
        const [[{ unread_count }]] = await db.query(
            'SELECT COUNT(*) as unread_count FROM notifications WHERE user_id = ? AND is_read = 0',
            [userId]
        );

        // Counts per category
        const [catCounts] = await db.query(
            'SELECT event_type, COUNT(*) as cnt FROM notifications WHERE user_id = ? GROUP BY event_type',
            [userId]
        );
        const categoryCounts = { all: 0, jobs: 0, payments: 0, messages: 0, system: 0, admin: 0 };
        for (const row of catCounts) {
            const cat = eventToCategory(row.event_type);
            categoryCounts[cat] = (categoryCounts[cat] || 0) + row.cnt;
            categoryCounts.all += row.cnt;
        }

        res.json({
            notifications: notifications.map(n => ({
                ...n,
                category: eventToCategory(n.event_type),
                is_read: n.is_read === 1
            })),
            unread_count,
            category_counts: categoryCounts,
            has_more: notifications.length === limit
        });
    } catch (err) {
        console.error('GET /notifications error:', err);
        res.status(500).json({ error: 'SERVER_ERROR', message: err.message });
    }
});

// GET /api/notifications/unread-count
router.get('/unread-count', authenticate, async (req, res) => {
    try {
        const [[{ count }]] = await db.query(
            'SELECT COUNT(*) as count FROM notifications WHERE user_id = ? AND is_read = 0',
            [req.user.id]
        );
        res.json({ count });
    } catch (err) {
        res.status(500).json({ error: 'SERVER_ERROR', message: err.message });
    }
});

// GET /api/notifications/preferences
router.get('/preferences', authenticate, async (req, res) => {
    try {
        const [prefs] = await db.query(
            'SELECT event_type, in_app_enabled, email_enabled FROM notification_preferences WHERE user_id = ?',
            [req.user.id]
        );
        // Build category-level preferences
        const result = {};
        for (const [cat, types] of Object.entries(CATEGORY_MAP)) {
            const catPrefs = prefs.filter(p => types.includes(p.event_type));
            // Category is enabled if any of its event types are enabled (or no prefs set = default on)
            result[cat] = {
                in_app: catPrefs.length === 0 ? true : catPrefs.some(p => p.in_app_enabled === 1),
                email:  catPrefs.length === 0 ? true : catPrefs.some(p => p.email_enabled === 1)
            };
        }
        res.json(result);
    } catch (err) {
        res.status(500).json({ error: 'SERVER_ERROR', message: err.message });
    }
});

// PUT /api/notifications/preferences
router.put('/preferences', authenticate, async (req, res) => {
    try {
        const { category, in_app_enabled, email_enabled } = req.body;
        const eventTypes = CATEGORY_MAP[category];
        if (!eventTypes) return res.status(400).json({ error: 'INVALID_CATEGORY' });

        for (const eventType of eventTypes) {
            await db.query(
                `INSERT INTO notification_preferences (user_id, event_type, in_app_enabled, email_enabled)
                 VALUES (?, ?, ?, ?)
                 ON DUPLICATE KEY UPDATE in_app_enabled = ?, email_enabled = ?`,
                [req.user.id, eventType, in_app_enabled ? 1 : 0, email_enabled ? 1 : 0,
                 in_app_enabled ? 1 : 0, email_enabled ? 1 : 0]
            );
        }
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: 'SERVER_ERROR', message: err.message });
    }
});

// PATCH /api/notifications/:id/read
router.patch('/:id/read', authenticate, async (req, res) => {
    try {
        await db.query(
            'UPDATE notifications SET is_read = 1 WHERE id = ? AND user_id = ?',
            [req.params.id, req.user.id]
        );
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: 'SERVER_ERROR', message: err.message });
    }
});

// PATCH /api/notifications/:id/unread
router.patch('/:id/unread', authenticate, async (req, res) => {
    try {
        await db.query(
            'UPDATE notifications SET is_read = 0 WHERE id = ? AND user_id = ?',
            [req.params.id, req.user.id]
        );
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: 'SERVER_ERROR', message: err.message });
    }
});

// PATCH /api/notifications/mark-all-read
router.patch('/mark-all-read', authenticate, async (req, res) => {
    try {
        await db.query(
            'UPDATE notifications SET is_read = 1 WHERE user_id = ?',
            [req.user.id]
        );
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: 'SERVER_ERROR', message: err.message });
    }
});

// DELETE /api/notifications/clear-all
router.delete('/clear-all', authenticate, async (req, res) => {
    try {
        await db.query('DELETE FROM notifications WHERE user_id = ?', [req.user.id]);
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: 'SERVER_ERROR', message: err.message });
    }
});

// Legacy routes (keep for backward compat)
router.get('/:userId', authenticate, async (req, res) => {
    const userId = req.user.id;
    const [notifications] = await db.query(
        'SELECT * FROM notifications WHERE user_id = ? ORDER BY created_at DESC LIMIT 50',
        [userId]
    );
    const unreadCount = notifications.filter(n => n.is_read === 0).length;
    res.json({ unreadCount, notifications });
});
router.post('/read/:id', authenticate, async (req, res) => {
    await db.query('UPDATE notifications SET is_read = 1 WHERE id = ? AND user_id = ?', [req.params.id, req.user.id]);
    res.json({ success: true });
});
router.post('/read-all', authenticate, async (req, res) => {
    await db.query('UPDATE notifications SET is_read = 1 WHERE user_id = ?', [req.user.id]);
    res.json({ success: true });
});

module.exports = router;
