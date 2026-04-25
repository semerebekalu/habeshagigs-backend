const express = require('express');
const router = express.Router();
const { db } = require('../config/db');
const { authenticate } = require('../middleware/auth');

// GET /api/notifications/:userId
router.get('/:userId', authenticate, async (req, res) => {
    // Users can only fetch their own notifications
    const userId = req.user.id;
    const [notifications] = await db.query(
        'SELECT * FROM notifications WHERE user_id = ? ORDER BY created_at DESC LIMIT 50',
        [userId]
    );
    const unreadCount = notifications.filter(n => n.is_read === 0).length;
    res.json({ unreadCount, notifications });
});

// POST /api/notifications/read/:id
router.post('/read/:id', authenticate, async (req, res) => {
    await db.query('UPDATE notifications SET is_read = 1 WHERE id = ? AND user_id = ?', [req.params.id, req.user.id]);
    res.json({ success: true });
});

// POST /api/notifications/read-all
router.post('/read-all', authenticate, async (req, res) => {
    await db.query('UPDATE notifications SET is_read = 1 WHERE user_id = ?', [req.user.id]);
    res.json({ success: true });
});

// PUT /api/notifications/preferences
router.put('/preferences', authenticate, async (req, res) => {
    const { event_type, in_app_enabled, email_enabled } = req.body;
    await db.query(
        `INSERT INTO notification_preferences (user_id, event_type, in_app_enabled, email_enabled)
         VALUES (?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE in_app_enabled = ?, email_enabled = ?`,
        [req.user.id, event_type, in_app_enabled, email_enabled, in_app_enabled, email_enabled]
    );
    res.json({ success: true });
});

module.exports = router;
