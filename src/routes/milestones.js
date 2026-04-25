const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { db } = require('../config/db');
const { authenticate } = require('../middleware/auth');
const { enqueueNotification } = require('../modules/notification/notificationService');

// Multer for delivery uploads
const deliveryDir = path.join(__dirname, '../../uploads/deliveries');
if (!fs.existsSync(deliveryDir)) fs.mkdirSync(deliveryDir, { recursive: true });
const deliveryStorage = multer.diskStorage({
    destination: (req, file, cb) => cb(null, deliveryDir),
    filename: (req, file, cb) => cb(null, `${Date.now()}-${file.originalname.replace(/\s+/g, '_')}`)
});
const uploadDelivery = multer({ storage: deliveryStorage, limits: { fileSize: 50 * 1024 * 1024, files: 5 } });

// POST /api/milestones — create milestone
router.post('/', authenticate, async (req, res) => {
    const { contract_id, title, amount, due_date } = req.body;
    try {
        const [existing] = await db.query('SELECT COUNT(*) as cnt FROM milestones WHERE contract_id = ?', [contract_id]);
        if (existing[0].cnt >= 10) return res.status(422).json({ error: 'VALIDATION_ERROR', fields: { milestones: 'Maximum 10 milestones per contract' } });
        const [result] = await db.query(
            'INSERT INTO milestones (contract_id, title, amount, due_date) VALUES (?, ?, ?, ?)',
            [contract_id, title, amount, due_date || null]
        );
        res.status(201).json({ success: true, milestone_id: result.insertId });
    } catch (err) {
        res.status(500).json({ error: 'SERVER_ERROR', message: err.message });
    }
});

// GET /api/milestones/contract/:contractId
router.get('/contract/:contractId', authenticate, async (req, res) => {
    const [milestones] = await db.query('SELECT * FROM milestones WHERE contract_id = ? ORDER BY id ASC', [req.params.contractId]);
    res.json(milestones);
});

// PUT /api/milestones/:id/approve — client approves milestone and auto-releases payment
router.put('/:id/approve', authenticate, async (req, res) => {
    const [[ms]] = await db.query('SELECT * FROM milestones WHERE id = ?', [req.params.id]);
    if (!ms) return res.status(404).json({ error: 'NOT_FOUND' });

    const [[contract]] = await db.query('SELECT * FROM contracts WHERE id = ?', [ms.contract_id]);
    if (!contract) return res.status(404).json({ error: 'CONTRACT_NOT_FOUND' });

    // Only client can approve
    if (req.user.id !== contract.client_id) {
        return res.status(403).json({ error: 'FORBIDDEN', message: 'Only the client can approve milestones' });
    }

    if (ms.status === 'released') return res.status(400).json({ error: 'ALREADY_RELEASED' });

    await db.query("UPDATE milestones SET status = 'approved' WHERE id = ?", [req.params.id]);

    await enqueueNotification(contract.freelancer_id, 'milestone_approved', {
        title: '✅ Milestone Approved',
        message: `Milestone "${ms.title}" has been approved. Payment will be released shortly.`
    });

    res.json({ success: true, message: 'Milestone approved. Use /api/escrow/release-milestone to release payment.' });
});

// PUT /api/milestones/:id/submit — freelancer submits milestone
router.put('/:id/submit', authenticate, async (req, res) => {
    await db.query("UPDATE milestones SET status = 'submitted' WHERE id = ?", [req.params.id]);
    const [[ms]] = await db.query('SELECT * FROM milestones WHERE id = ?', [req.params.id]);
    const [[contract]] = await db.query('SELECT * FROM contracts WHERE id = ?', [ms.contract_id]);
    await enqueueNotification(contract.client_id, 'milestone_submitted', {
        title: '📋 Milestone Submitted',
        message: `Freelancer submitted milestone "${ms.title}" for your review.`
    });
    res.json({ success: true });
});

// POST /api/milestones/:id/deliver — freelancer submits work
router.post('/:id/deliver', authenticate, uploadDelivery.array('files', 5), async (req, res) => {
    try {
        const [[ms]] = await db.query('SELECT * FROM milestones WHERE id = ?', [req.params.id]);
        if (!ms) return res.status(404).json({ error: 'NOT_FOUND' });

        const [[contract]] = await db.query('SELECT * FROM contracts WHERE id = ?', [ms.contract_id]);
        if (!contract) return res.status(404).json({ error: 'CONTRACT_NOT_FOUND' });
        if (req.user.id !== contract.freelancer_id) return res.status(403).json({ error: 'FORBIDDEN' });

        const files = (req.files || []).map(f => ({
            filename: f.originalname,
            url: `/uploads/deliveries/${f.filename}`,
            size: f.size
        }));

        const [result] = await db.query(
            'INSERT INTO deliveries (milestone_id, contract_id, freelancer_id, message, files) VALUES (?, ?, ?, ?, ?)',
            [ms.id, contract.id, req.user.id, req.body.message || null, JSON.stringify(files)]
        );

        await db.query("UPDATE milestones SET status = 'submitted' WHERE id = ?", [ms.id]);

        const [[freelancer]] = await db.query('SELECT full_name FROM users WHERE id = ?', [req.user.id]);
        await enqueueNotification(contract.client_id, 'work_submitted', {
            title: '📦 Work Submitted',
            message: `${freelancer.full_name} submitted work for milestone "${ms.title}"`
        });

        res.status(201).json({ success: true, delivery_id: result.insertId });
    } catch (err) {
        res.status(500).json({ error: 'SERVER_ERROR', message: err.message });
    }
});

// GET /api/milestones/:id/deliveries
router.get('/:id/deliveries', authenticate, async (req, res) => {
    try {
        const [deliveries] = await db.query(
            `SELECT d.*, u.full_name as freelancer_name FROM deliveries d
             JOIN users u ON d.freelancer_id = u.id
             WHERE d.milestone_id = ? ORDER BY d.created_at DESC`,
            [req.params.id]
        );
        res.json(deliveries);
    } catch (err) {
        res.status(500).json({ error: 'SERVER_ERROR', message: err.message });
    }
});

module.exports = router;
