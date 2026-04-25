const express = require('express');
const router = express.Router();
const { db } = require('../config/db');
const { authenticate, requireAdmin } = require('../middleware/auth');
const { enqueueNotification } = require('../modules/notification/notificationService');

// POST /api/disputes
router.post('/', authenticate, async (req, res) => {
    const { contract_id, reason } = req.body;
    try {
        const [[contract]] = await db.query('SELECT * FROM contracts WHERE id = ?', [contract_id]);
        if (!contract) return res.status(404).json({ error: 'CONTRACT_NOT_FOUND' });

        await db.query('INSERT INTO disputes (contract_id, raised_by, reason) VALUES (?, ?, ?)', [contract_id, req.user.id, reason]);
        await db.query("UPDATE contracts SET status = 'disputed', escrow_status = 'frozen' WHERE id = ?", [contract_id]);

        await enqueueNotification(contract.client_id, 'dispute_raised', { title: '⚠️ Dispute Raised', message: `A dispute was raised on contract #${contract_id}` });
        await enqueueNotification(contract.freelancer_id, 'dispute_raised', { title: '⚠️ Dispute Raised', message: `A dispute was raised on contract #${contract_id}` });

        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: 'SERVER_ERROR', message: err.message });
    }
});

// GET /api/disputes/my — disputes for the logged-in user
router.get('/my', authenticate, async (req, res) => {
    const [disputes] = await db.query(
        `SELECT d.*, 
            c.total_amount, c.escrow_balance, c.escrow_status,
            u.full_name as raised_by_name,
            j.title as job_title
         FROM disputes d
         JOIN contracts c ON d.contract_id = c.id
         JOIN users u ON d.raised_by = u.id
         LEFT JOIN jobs j ON c.job_id = j.id
         WHERE c.client_id = ? OR c.freelancer_id = ?
         ORDER BY d.created_at DESC`,
        [req.user.id, req.user.id]
    );
    res.json(disputes);
});

// GET /api/disputes/:id
router.get('/:id', authenticate, async (req, res) => {
    const [[dispute]] = await db.query('SELECT * FROM disputes WHERE id = ?', [req.params.id]);
    if (!dispute) return res.status(404).json({ error: 'NOT_FOUND' });
    res.json(dispute);
});

// PUT /api/disputes/:id/resolve (admin)
router.put('/:id/resolve', authenticate, requireAdmin, async (req, res) => {
    const { resolution, release_to } = req.body; // release_to: 'client' | 'freelancer'
    const [[dispute]] = await db.query('SELECT * FROM disputes WHERE id = ?', [req.params.id]);
    if (!dispute) return res.status(404).json({ error: 'NOT_FOUND' });

    await db.query("UPDATE disputes SET status = 'resolved', resolution = ?, resolved_by = ?, resolved_at = NOW() WHERE id = ?", [resolution, req.user.id, req.params.id]);
    await db.query("UPDATE contracts SET status = 'completed', escrow_status = 'released' WHERE id = ?", [dispute.contract_id]);

    const [[contract]] = await db.query('SELECT * FROM contracts WHERE id = ?', [dispute.contract_id]);
    const amount = parseFloat(contract.escrow_balance);
    const recipientId = release_to === 'freelancer' ? contract.freelancer_id : contract.client_id;
    await db.query('UPDATE users SET wallet_balance = wallet_balance + ? WHERE id = ?', [amount, recipientId]);
    await db.query('UPDATE contracts SET escrow_balance = 0 WHERE id = ?', [dispute.contract_id]);

    await enqueueNotification(contract.client_id, 'dispute_resolved', { title: '✅ Dispute Resolved', message: resolution });
    await enqueueNotification(contract.freelancer_id, 'dispute_resolved', { title: '✅ Dispute Resolved', message: resolution });

    res.json({ success: true });
});

module.exports = router;
