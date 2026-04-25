const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { db } = require('../config/db');
const { authenticate, requireAdmin } = require('../middleware/auth');
const { enqueueNotification } = require('../modules/notification/notificationService');

// File upload for dispute evidence
const evidenceDir = path.join(__dirname, '../../uploads/disputes');
if (!fs.existsSync(evidenceDir)) fs.mkdirSync(evidenceDir, { recursive: true });

const evidenceStorage = multer.diskStorage({
    destination: (req, file, cb) => cb(null, evidenceDir),
    filename: (req, file, cb) => cb(null, `${Date.now()}-${req.user?.id}-${file.originalname.replace(/\s+/g, '_')}`)
});
const uploadEvidence = multer({
    storage: evidenceStorage,
    limits: { fileSize: 20 * 1024 * 1024, files: 5 }, // 20MB per file, max 5
    fileFilter: (req, file, cb) => {
        const allowed = /jpeg|jpg|png|gif|pdf|doc|docx|mp4|mov|zip/;
        const ext = path.extname(file.originalname).toLowerCase().replace('.', '');
        if (allowed.test(ext)) return cb(null, true);
        cb(new Error('Invalid file type. Allowed: images, PDF, documents, video, zip'));
    }
});

// POST /api/disputes — raise a dispute with optional evidence
router.post('/', authenticate, uploadEvidence.array('evidence', 5), async (req, res) => {
    const { contract_id, reason, evidence_note } = req.body;
    if (!contract_id || !reason || reason.trim().length < 20) {
        return res.status(422).json({
            error: 'VALIDATION_ERROR',
            message: 'Contract ID and a detailed reason (min 20 characters) are required'
        });
    }
    try {
        const [[contract]] = await db.query('SELECT * FROM contracts WHERE id = ?', [contract_id]);
        if (!contract) return res.status(404).json({ error: 'CONTRACT_NOT_FOUND' });

        // Only contract participants can raise a dispute
        if (req.user.id !== contract.client_id && req.user.id !== contract.freelancer_id) {
            return res.status(403).json({ error: 'FORBIDDEN', message: 'Only contract participants can raise a dispute' });
        }

        // Can't raise a dispute on an already disputed or completed contract
        if (contract.status === 'disputed') {
            return res.status(409).json({ error: 'DISPUTE_ALREADY_EXISTS', message: 'A dispute is already open for this contract' });
        }
        if (contract.status === 'completed') {
            return res.status(400).json({ error: 'CONTRACT_COMPLETED', message: 'Cannot raise a dispute on a completed contract' });
        }

        // Process uploaded evidence files
        const evidenceFiles = (req.files || []).map(f => ({
            filename: f.originalname,
            url: `/uploads/disputes/${f.filename}`,
            size: f.size,
            mimetype: f.mimetype
        }));

        const [result] = await db.query(
            'INSERT INTO disputes (contract_id, raised_by, reason, evidence_files, evidence_note) VALUES (?, ?, ?, ?, ?)',
            [contract_id, req.user.id, reason.trim(), JSON.stringify(evidenceFiles), evidence_note || null]
        );
        await db.query("UPDATE contracts SET status = 'disputed', escrow_status = 'frozen' WHERE id = ?", [contract_id]);

        // Notify both parties
        const [[raiser]] = await db.query('SELECT full_name FROM users WHERE id = ?', [req.user.id]);
        await enqueueNotification(contract.client_id, 'dispute_raised', {
            title: '⚠️ Dispute Raised',
            message: `${raiser.full_name} raised a dispute on contract #${contract_id}. Escrow is frozen pending resolution.`
        }).catch(() => {});
        await enqueueNotification(contract.freelancer_id, 'dispute_raised', {
            title: '⚠️ Dispute Raised',
            message: `${raiser.full_name} raised a dispute on contract #${contract_id}. Escrow is frozen pending resolution.`
        }).catch(() => {});

        res.json({ success: true, dispute_id: result.insertId, evidence_count: evidenceFiles.length });
    } catch (err) {
        res.status(500).json({ error: 'SERVER_ERROR', message: err.message });
    }
});

// POST /api/disputes/:id/evidence — add more evidence to an existing dispute
router.post('/:id/evidence', authenticate, uploadEvidence.array('evidence', 5), async (req, res) => {
    try {
        const [[dispute]] = await db.query('SELECT * FROM disputes WHERE id = ?', [req.params.id]);
        if (!dispute) return res.status(404).json({ error: 'NOT_FOUND' });
        if (dispute.status === 'resolved') return res.status(400).json({ error: 'DISPUTE_RESOLVED', message: 'Cannot add evidence to a resolved dispute' });

        const [[contract]] = await db.query('SELECT * FROM contracts WHERE id = ?', [dispute.contract_id]);
        if (req.user.id !== contract.client_id && req.user.id !== contract.freelancer_id) {
            return res.status(403).json({ error: 'FORBIDDEN' });
        }

        const newFiles = (req.files || []).map(f => ({
            filename: f.originalname,
            url: `/uploads/disputes/${f.filename}`,
            size: f.size,
            mimetype: f.mimetype,
            uploaded_by: req.user.id
        }));

        // Merge with existing evidence
        let existing = [];
        try { existing = JSON.parse(dispute.evidence_files || '[]'); } catch {}
        const merged = [...existing, ...newFiles];

        await db.query('UPDATE disputes SET evidence_files = ? WHERE id = ?', [JSON.stringify(merged), req.params.id]);

        res.json({ success: true, total_evidence: merged.length });
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

// PUT /api/disputes/:id/resolve (admin only)
router.put('/:id/resolve', authenticate, requireAdmin, async (req, res) => {
    const { resolution, release_to } = req.body;
    if (!resolution || !release_to) {
        return res.status(422).json({ error: 'VALIDATION_ERROR', message: 'Resolution text and release_to (client|freelancer) are required' });
    }
    const [[dispute]] = await db.query('SELECT * FROM disputes WHERE id = ?', [req.params.id]);
    if (!dispute) return res.status(404).json({ error: 'NOT_FOUND' });
    if (dispute.status === 'resolved') return res.status(400).json({ error: 'ALREADY_RESOLVED' });

    await db.query(
        "UPDATE disputes SET status = 'resolved', resolution = ?, resolved_by = ?, resolved_at = NOW() WHERE id = ?",
        [resolution, req.user.id, req.params.id]
    );
    await db.query("UPDATE contracts SET status = 'completed', escrow_status = 'released' WHERE id = ?", [dispute.contract_id]);

    const [[contract]] = await db.query('SELECT * FROM contracts WHERE id = ?', [dispute.contract_id]);
    const amount = parseFloat(contract.escrow_balance);
    const recipientId = release_to === 'freelancer' ? contract.freelancer_id : contract.client_id;
    await db.query('UPDATE users SET wallet_balance = wallet_balance + ? WHERE id = ?', [amount, recipientId]);
    await db.query('UPDATE contracts SET escrow_balance = 0 WHERE id = ?', [dispute.contract_id]);

    await enqueueNotification(contract.client_id, 'dispute_resolved', {
        title: '✅ Dispute Resolved',
        message: `Dispute resolved: ${resolution}. Funds released to ${release_to}.`
    }).catch(() => {});
    await enqueueNotification(contract.freelancer_id, 'dispute_resolved', {
        title: '✅ Dispute Resolved',
        message: `Dispute resolved: ${resolution}. Funds released to ${release_to}.`
    }).catch(() => {});

    res.json({ success: true });
});

module.exports = router;
