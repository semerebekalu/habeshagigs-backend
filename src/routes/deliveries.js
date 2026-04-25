const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { db } = require('../config/db');
const { authenticate } = require('../middleware/auth');
const { enqueueNotification } = require('../modules/notification/notificationService');

// Ensure upload dir exists
const uploadDir = path.join(__dirname, '../../uploads/deliveries');
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });

const storage = multer.diskStorage({
    destination: (req, file, cb) => cb(null, uploadDir),
    filename: (req, file, cb) => cb(null, `${Date.now()}-${file.originalname.replace(/\s+/g, '_')}`)
});
const upload = multer({ storage, limits: { fileSize: 50 * 1024 * 1024, files: 5 } });

// PUT /api/deliveries/:id/approve
router.put('/:id/approve', authenticate, async (req, res) => {
    try {
        const [[delivery]] = await db.query('SELECT * FROM deliveries WHERE id = ?', [req.params.id]);
        if (!delivery) return res.status(404).json({ error: 'NOT_FOUND' });

        await db.query("UPDATE deliveries SET status = 'approved' WHERE id = ?", [req.params.id]);
        await db.query("UPDATE milestones SET status = 'approved' WHERE id = ?", [delivery.milestone_id]);

        await enqueueNotification(delivery.freelancer_id, 'delivery_approved', {
            title: '✅ Work Approved',
            message: 'Your delivery was approved! You can now request payment.'
        });

        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: 'SERVER_ERROR', message: err.message });
    }
});

// PUT /api/deliveries/:id/request-revision
router.put('/:id/request-revision', authenticate, async (req, res) => {
    const { feedback } = req.body;
    try {
        const [[delivery]] = await db.query('SELECT * FROM deliveries WHERE id = ?', [req.params.id]);
        if (!delivery) return res.status(404).json({ error: 'NOT_FOUND' });

        await db.query("UPDATE deliveries SET status = 'revision_requested', feedback = ? WHERE id = ?", [feedback, req.params.id]);
        await db.query("UPDATE milestones SET status = 'active' WHERE id = ?", [delivery.milestone_id]);

        await enqueueNotification(delivery.freelancer_id, 'revision_requested', {
            title: '🔄 Revision Requested',
            message: feedback || 'The client has requested a revision on your delivery.'
        });

        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: 'SERVER_ERROR', message: err.message });
    }
});

module.exports = router;
