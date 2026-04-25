const express = require('express');
const router = express.Router();
const { db } = require('../config/db');
const { authenticate, requireKYC, requireVerified } = require('../middleware/auth');
const { enqueueNotification } = require('../modules/notification/notificationService');
const { calculateFee } = require('../utils/feeCalculator');

// POST /api/proposals — freelancer submits a proposal (must be email-verified)
router.post('/', authenticate, requireVerified, async (req, res) => {
    const { job_id, cover_letter, bid_amount, delivery_days } = req.body;
    if (!job_id) return res.status(422).json({ error: 'VALIDATION_ERROR', fields: { job_id: 'Required' } });
    try {
        // Check if freelancer already submitted a proposal for this job
        const [[existing]] = await db.query(
            'SELECT id, edit_count, status FROM proposals WHERE job_id = ? AND freelancer_id = ?',
            [job_id, req.user.id]
        );
        if (existing) {
            return res.status(409).json({
                error: 'ALREADY_SUBMITTED',
                message: 'You already submitted a proposal for this job. You can edit it up to 3 times.',
                proposal_id: existing.id,
                edit_count: existing.edit_count
            });
        }
        const [result] = await db.query(
            'INSERT INTO proposals (job_id, freelancer_id, cover_letter, bid_amount, delivery_days) VALUES (?, ?, ?, ?, ?)',
            [job_id, req.user.id, cover_letter || '', bid_amount || 0, delivery_days || 1]
        );
        const [[job]] = await db.query('SELECT client_id, title FROM jobs WHERE id = ?', [job_id]);
        if (job) {
            await enqueueNotification(job.client_id, 'proposal_received', {
                title: '📩 New Proposal',
                message: `A freelancer applied to your job: "${job.title}"`
            });
        }
        res.status(201).json({ success: true, proposal_id: result.insertId });
    } catch (err) {
        res.status(500).json({ error: 'SERVER_ERROR', message: err.message });
    }
});

// PUT /api/proposals/:id/edit — freelancer edits their proposal (max 3 times)
router.put('/:id/edit', authenticate, async (req, res) => {
    const { cover_letter, bid_amount, delivery_days } = req.body;
    try {
        const [[proposal]] = await db.query(
            'SELECT * FROM proposals WHERE id = ? AND freelancer_id = ?',
            [req.params.id, req.user.id]
        );
        if (!proposal) return res.status(404).json({ error: 'NOT_FOUND' });
        if (proposal.status !== 'pending') return res.status(400).json({ error: 'CANNOT_EDIT', message: 'Can only edit pending proposals' });
        if (proposal.edit_count >= 3) return res.status(400).json({ error: 'EDIT_LIMIT_REACHED', message: 'You can only edit a proposal 3 times' });

        await db.query(
            'UPDATE proposals SET cover_letter = ?, bid_amount = ?, delivery_days = ?, edit_count = edit_count + 1 WHERE id = ?',
            [cover_letter, bid_amount, delivery_days, req.params.id]
        );
        res.json({ success: true, edits_remaining: 2 - proposal.edit_count });
    } catch (err) {
        res.status(500).json({ error: 'SERVER_ERROR', message: err.message });
    }
});

// GET /api/proposals/my — freelancer's own submitted proposals
router.get('/my', authenticate, async (req, res) => {
    try {
        const [proposals] = await db.query(
            `SELECT p.id, p.job_id, p.cover_letter, p.bid_amount, p.delivery_days,
                    p.status, p.created_at, p.edit_count, p.contract_id,
                    j.title as job_title, j.budget_min, j.budget_max, j.project_type,
                    u.full_name as client_name
             FROM proposals p
             JOIN jobs j ON p.job_id = j.id
             JOIN users u ON j.client_id = u.id
             WHERE p.freelancer_id = ?
             ORDER BY p.created_at DESC`,
            [req.user.id]
        );
        res.json(proposals);
    } catch (err) {
        res.status(500).json({ error: 'SERVER_ERROR', message: err.message });
    }
});
router.get('/job/:jobId', authenticate, async (req, res) => {
    try {
        const [proposals] = await db.query(
            `SELECT p.id, p.job_id, p.freelancer_id, p.cover_letter, p.bid_amount,
                    p.delivery_days, p.status, p.created_at,
                    u.full_name as freelancer_name,
                    fp.avg_rating, fp.reputation_level, fp.title as freelancer_title
             FROM proposals p
             JOIN users u ON p.freelancer_id = u.id
             LEFT JOIN freelancer_profiles fp ON u.id = fp.id
             WHERE p.job_id = ? ORDER BY p.id DESC`,
            [req.params.jobId]
        );
        res.json(proposals);
    } catch (err) {
        res.status(500).json({ error: 'SERVER_ERROR', message: err.message });
    }
});

// PUT /api/proposals/:id/status — client accepts/rejects (KYC required to accept)
router.put('/:id/status', authenticate, async (req, res) => {
    const { status } = req.body;
    if (!['accepted', 'rejected', 'shortlisted'].includes(status)) {
        return res.status(422).json({ error: 'INVALID_STATUS' });
    }
    try {
        // KYC required to accept (hire) a freelancer
        if (status === 'accepted') {
            const [[client]] = await db.query('SELECT kyc_status, is_verified, is_banned, is_suspended, wallet_balance FROM users WHERE id = ?', [req.user.id]);
            if (!client) return res.status(404).json({ error: 'USER_NOT_FOUND' });
            if (client.is_banned || client.is_suspended) return res.status(403).json({ error: 'ACCOUNT_BANNED' });
            if (!client.is_verified) {
                return res.status(403).json({
                    error: 'EMAIL_VERIFICATION_REQUIRED',
                    message: 'Please verify your email address before hiring a freelancer.'
                });
            }
            if (client.kyc_status !== 'approved') {
                return res.status(403).json({
                    error: 'KYC_REQUIRED',
                    message: client.kyc_status === 'pending'
                        ? 'Your identity verification is under review. You cannot hire until approved.'
                        : 'You must complete identity verification before hiring a freelancer. Go to your profile to submit your ID.',
                    kyc_status: client.kyc_status
                });
            }
        }

        await db.query('UPDATE proposals SET status = ? WHERE id = ?', [status, req.params.id]);
        const [[proposal]] = await db.query('SELECT * FROM proposals WHERE id = ?', [req.params.id]);
        if (!proposal) return res.status(404).json({ error: 'NOT_FOUND' });

        const [[job]] = await db.query('SELECT * FROM jobs WHERE id = ?', [proposal.job_id]);

        // Auto-create contract and REQUIRE escrow deposit when proposal is accepted
        let contract_id = null;
        let escrow_funded = false;
        if (status === 'accepted' && job) {
            // Verify client owns this job
            if (job.client_id !== req.user.id) {
                return res.status(403).json({ error: 'FORBIDDEN', message: 'You do not own this job' });
            }

            // Check if contract already exists
            const [[existingContract]] = await db.query(
                'SELECT id FROM contracts WHERE job_id = ? AND freelancer_id = ?',
                [proposal.job_id, proposal.freelancer_id]
            );

            if (!existingContract) {
                const bidAmount = parseFloat(proposal.bid_amount);
                const { fee } = calculateFee(bidAmount);
                const totalRequired = bidAmount + fee;

                // Check client wallet balance — must have enough for full escrow
                const [[clientWallet]] = await db.query('SELECT wallet_balance FROM users WHERE id = ?', [req.user.id]);
                if (parseFloat(clientWallet.wallet_balance) < totalRequired) {
                    // Revert proposal status
                    await db.query('UPDATE proposals SET status = "pending" WHERE id = ?', [req.params.id]);
                    return res.status(400).json({
                        error: 'INSUFFICIENT_BALANCE',
                        message: `You need ${totalRequired.toFixed(2)} ETB in your wallet to hire this freelancer (${bidAmount.toFixed(2)} ETB + ${fee.toFixed(2)} ETB platform fee). Please top up your wallet first.`,
                        required: totalRequired,
                        fee,
                        current_balance: parseFloat(clientWallet.wallet_balance)
                    });
                }

                // Create contract
                const [contractResult] = await db.query(
                    `INSERT INTO contracts (job_id, client_id, freelancer_id, total_amount, platform_fee, escrow_balance, escrow_status, status)
                     VALUES (?, ?, ?, ?, ?, ?, 'funded', 'active')`,
                    [proposal.job_id, job.client_id, proposal.freelancer_id, bidAmount, fee, bidAmount]
                );
                contract_id = contractResult.insertId;

                // Deduct from client wallet immediately
                await db.query('UPDATE users SET wallet_balance = wallet_balance - ? WHERE id = ?', [totalRequired, req.user.id]);
                await db.query(
                    'INSERT INTO transactions (contract_id, user_id, type, amount, method, status) VALUES (?, ?, "escrow_fund", ?, "wallet", "completed")',
                    [contract_id, req.user.id, totalRequired]
                );

                escrow_funded = true;
                await db.query("UPDATE jobs SET status = 'in_progress' WHERE id = ?", [proposal.job_id]);
                await db.query('UPDATE proposals SET contract_id = ? WHERE id = ?', [contract_id, req.params.id]);
            } else {
                contract_id = existingContract.id;
            }
        }

        // Notify freelancer
        await enqueueNotification(proposal.freelancer_id, `proposal_${status}`, {
            title: status === 'accepted' ? '🎉 Proposal Accepted!' : `Proposal ${status}`,
            message: status === 'accepted'
                ? `Your proposal for "${job?.title}" was accepted! Escrow has been funded. Go to your contracts to get started.`
                : `Your proposal for "${job?.title}" was ${status}`
        });

        res.json({ success: true, contract_id, escrow_funded });
    } catch (err) {
        res.status(500).json({ error: 'SERVER_ERROR', message: err.message });
    }
});

// POST /api/proposals/invite — client invites a freelancer to apply to a job
router.post('/invite', authenticate, async (req, res) => {
    const { job_id, freelancer_id, message } = req.body;
    if (!job_id || !freelancer_id) return res.status(422).json({ error: 'VALIDATION_ERROR', fields: { general: 'job_id and freelancer_id required' } });
    try {
        const [[job]] = await db.query('SELECT * FROM jobs WHERE id = ? AND client_id = ?', [job_id, req.user.id]);
        if (!job) return res.status(404).json({ error: 'JOB_NOT_FOUND' });

        const [[freelancer]] = await db.query('SELECT id, full_name FROM users WHERE id = ? AND role = "freelancer"', [freelancer_id]);
        if (!freelancer) return res.status(404).json({ error: 'FREELANCER_NOT_FOUND' });

        await enqueueNotification(freelancer_id, 'job_invite', {
            title: '📨 Job Invitation',
            title_am: '📨 የሥራ ግብዣ',
            message: message || `You've been invited to apply to: "${job.title}". Check it out and submit a proposal!`,
            message_am: `ለ "${job.title}" እንዲያመለክቱ ተጋብዘዋል። ይመልከቱ እና ሀሳብ ያስገቡ!`
        });

        res.json({ success: true, message: `Invitation sent to ${freelancer.full_name}` });
    } catch (err) {
        res.status(500).json({ error: 'SERVER_ERROR', message: err.message });
    }
});

module.exports = router;
