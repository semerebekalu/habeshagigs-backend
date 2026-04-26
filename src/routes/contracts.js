const express = require('express');
const router = express.Router();
const { db } = require('../config/db');
const { authenticate, requireKYC } = require('../middleware/auth');

// POST /api/contracts/create-from-proposal — create contract from accepted proposal
router.post('/create-from-proposal', authenticate, async (req, res) => {
    const { proposal_id } = req.body;
    if (!proposal_id) return res.status(422).json({ error: 'VALIDATION_ERROR', message: 'proposal_id required' });
    try {
        const [[proposal]] = await db.query('SELECT * FROM proposals WHERE id = ?', [proposal_id]);
        if (!proposal) return res.status(404).json({ error: 'PROPOSAL_NOT_FOUND' });
        if (proposal.status !== 'accepted') return res.status(400).json({ error: 'PROPOSAL_NOT_ACCEPTED' });

        // Check if contract already exists
        if (proposal.contract_id) {
            return res.json({ contract_id: proposal.contract_id });
        }

        const [[existingContract]] = await db.query(
            'SELECT id FROM contracts WHERE job_id = ? AND freelancer_id = ?',
            [proposal.job_id, proposal.freelancer_id]
        );
        if (existingContract) {
            await db.query('UPDATE proposals SET contract_id = ? WHERE id = ?', [existingContract.id, proposal_id]);
            return res.json({ contract_id: existingContract.id });
        }

        const [[job]] = await db.query('SELECT * FROM jobs WHERE id = ?', [proposal.job_id]);
        if (!job) return res.status(404).json({ error: 'JOB_NOT_FOUND' });

        const [result] = await db.query(
            `INSERT INTO contracts (job_id, client_id, freelancer_id, total_amount, platform_fee, escrow_balance, escrow_status, status)
             VALUES (?, ?, ?, ?, 0, 0, 'unfunded', 'active')`,
            [proposal.job_id, job.client_id, proposal.freelancer_id, proposal.bid_amount]
        );
        const contract_id = result.insertId;
        await db.query('UPDATE proposals SET contract_id = ? WHERE id = ?', [contract_id, proposal_id]);
        await db.query("UPDATE jobs SET status = 'in_progress' WHERE id = ?", [proposal.job_id]);

        res.json({ contract_id });
    } catch (err) {
        res.status(500).json({ error: 'SERVER_ERROR', message: err.message });
    }
});

// GET /api/contracts/:contractId/progress
router.get('/:contractId/progress', authenticate, async (req, res) => {
    try {
        const [[contract]] = await db.query(
            'SELECT * FROM contracts WHERE id = ?',
            [req.params.contractId]
        );
        if (!contract) return res.status(404).json({ error: 'NOT_FOUND' });

        // Only participants can view
        if (req.user.id !== contract.client_id && req.user.id !== contract.freelancer_id) {
            return res.status(403).json({ error: 'FORBIDDEN' });
        }

        const [milestones] = await db.query(
            'SELECT * FROM milestones WHERE contract_id = ? ORDER BY id ASC',
            [req.params.contractId]
        );

        // Attach latest delivery to each milestone
        for (const ms of milestones) {
            const [[delivery]] = await db.query(
                'SELECT * FROM deliveries WHERE milestone_id = ? ORDER BY created_at DESC LIMIT 1',
                [ms.id]
            );
            ms.delivery = delivery || null;
        }

        const total = milestones.length;
        const completed = milestones.filter(m => m.status === 'released' || m.status === 'approved').length;
        const progress_percent = total > 0 ? Math.round((completed / total) * 100) : 0;

        res.json({
            contract,
            milestones,
            progress_percent,
            total_milestones: total,
            completed_milestones: completed
        });
    } catch (err) {
        res.status(500).json({ error: 'SERVER_ERROR', message: err.message });
    }
});

// GET /api/contracts — list contracts for current user
router.get('/', authenticate, async (req, res) => {
    try {
        const [contracts] = await db.query(
            `SELECT c.*, 
                j.title as job_title,
                cl.full_name as client_name,
                fl.full_name as freelancer_name
             FROM contracts c
             LEFT JOIN jobs j ON c.job_id = j.id
             LEFT JOIN users cl ON c.client_id = cl.id
             LEFT JOIN users fl ON c.freelancer_id = fl.id
             WHERE c.client_id = ? OR c.freelancer_id = ?
             ORDER BY c.id DESC`,
            [req.user.id, req.user.id]
        );
        res.json(contracts);
    } catch (err) {
        res.status(500).json({ error: 'SERVER_ERROR', message: err.message });
    }
});

// POST /api/contracts/:id/sign — digital signature (requires KYC + live selfie verification)
router.post('/:id/sign', authenticate, requireKYC, async (req, res) => {
    const { signature, live_verify_token } = req.body;
    if (!signature) return res.status(422).json({ error: 'VALIDATION_ERROR', message: 'Signature required' });

    // Require live selfie token
    if (!live_verify_token) {
        return res.status(403).json({
            error: 'LIVE_VERIFY_REQUIRED',
            message: 'You must complete a live selfie check before signing. Please take a live selfie to confirm your identity.'
        });
    }

    try {
        // Validate the live verify token
        const [[user]] = await db.query(
            'SELECT live_verify_token, live_verify_expires FROM users WHERE id = ?',
            [req.user.id]
        );
        if (!user?.live_verify_token || user.live_verify_token !== live_verify_token) {
            return res.status(403).json({
                error: 'INVALID_LIVE_TOKEN',
                message: 'Invalid or expired live verification. Please take a new live selfie.'
            });
        }
        if (new Date(user.live_verify_expires) < new Date()) {
            return res.status(403).json({
                error: 'LIVE_TOKEN_EXPIRED',
                message: 'Your live verification has expired (10 minutes). Please take a new live selfie.'
            });
        }

        // Consume the token — one-time use
        await db.query('UPDATE users SET live_verify_token = NULL, live_verify_expires = NULL WHERE id = ?', [req.user.id]);
        const [[contract]] = await db.query('SELECT * FROM contracts WHERE id = ?', [req.params.id]);
        if (!contract) return res.status(404).json({ error: 'NOT_FOUND' });

        const isClient = req.user.id === contract.client_id;
        const isFreelancer = req.user.id === contract.freelancer_id;
        if (!isClient && !isFreelancer) return res.status(403).json({ error: 'FORBIDDEN' });

        if (isClient) {
            await db.query(
                'UPDATE contracts SET client_signed = 1, client_signed_at = NOW(), client_signature = ? WHERE id = ?',
                [signature, req.params.id]
            );
        } else {
            await db.query(
                'UPDATE contracts SET freelancer_signed = 1, freelancer_signed_at = NOW(), freelancer_signature = ? WHERE id = ?',
                [signature, req.params.id]
            );
        }

        // Check if both signed
        const [[updated]] = await db.query('SELECT * FROM contracts WHERE id = ?', [req.params.id]);
        const bothSigned = updated.client_signed && updated.freelancer_signed;

        if (bothSigned) {
            // Auto-create group chat for the contract
            const { enqueueNotification } = require('../modules/notification/notificationService');
            try {
                const [[job]] = await db.query('SELECT title FROM jobs WHERE id = ?', [updated.job_id]);
                const groupName = job ? `${job.title} — Project Chat` : `Contract #${updated.id} Chat`;
                const [groupResult] = await db.query(
                    'INSERT INTO group_chats (name, contract_id, created_by) VALUES (?, ?, ?)',
                    [groupName, updated.id, updated.client_id]
                );
                const groupId = groupResult.insertId;
                // Add both parties
                await db.query('INSERT IGNORE INTO group_chat_members (group_id, user_id) VALUES (?, ?)', [groupId, updated.client_id]);
                await db.query('INSERT IGNORE INTO group_chat_members (group_id, user_id) VALUES (?, ?)', [groupId, updated.freelancer_id]);
                // Link group to contract
                await db.query('UPDATE contracts SET group_chat_id = ? WHERE id = ?', [groupId, req.params.id]);
                // Send welcome message
                await db.query(
                    'INSERT INTO group_messages (group_id, sender_id, content) VALUES (?, ?, ?)',
                    [groupId, updated.client_id, `🎉 Contract signed by both parties! This is your project discussion channel. Good luck with the project!`]
                );
            } catch (e) { console.error('Group chat creation error:', e.message); }

            await enqueueNotification(contract.client_id, 'contract_signed', {
                title: '✍️ Contract Fully Signed',
                message: 'Both parties have signed. A project group chat has been created. Work can now begin!'
            });
            await enqueueNotification(contract.freelancer_id, 'contract_signed', {
                title: '✍️ Contract Fully Signed',
                message: 'Both parties have signed. Check your group chat to start collaborating!'
            });
        } else {
            // Notify the other party to sign
            const otherPartyId = isClient ? contract.freelancer_id : contract.client_id;
            const { enqueueNotification } = require('../modules/notification/notificationService');
            await enqueueNotification(otherPartyId, 'contract_awaiting_signature', {
                title: '✍️ Contract Awaiting Your Signature',
                message: `${isClient ? 'The client' : 'The freelancer'} has signed the contract. Please review and sign to begin work.`
            });
        }

        res.json({ success: true, both_signed: bothSigned });
    } catch (err) {
        res.status(500).json({ error: 'SERVER_ERROR', message: err.message });
    }
});

module.exports = router;
