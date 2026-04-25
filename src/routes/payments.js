const express = require('express');
const router = express.Router();
const { db } = require('../config/db');
const { authenticate, requireAdmin, requireKYC } = require('../middleware/auth');
const { calculateFee } = require('../utils/feeCalculator');
const { enqueueNotification } = require('../modules/notification/notificationService');
const { recalculate: recalculateReputation } = require('../modules/reputation/reputationEngine');
const { processReferralReward } = require('./referrals');

// POST /api/payments/initiate — fund escrow (KYC required)
router.post('/initiate', authenticate, requireKYC, async (req, res) => {
    const { contract_id, amount, method } = req.body;
    if (!contract_id || !amount) return res.status(422).json({ error: 'VALIDATION_ERROR' });
    try {
        const [[contract]] = await db.query('SELECT * FROM contracts WHERE id = ? AND client_id = ?', [contract_id, req.user.id]);
        if (!contract) return res.status(404).json({ error: 'CONTRACT_NOT_FOUND' });
        if (contract.escrow_status === 'funded') return res.status(409).json({ error: 'ESCROW_ALREADY_FUNDED' });

        const { fee, net } = calculateFee(parseFloat(amount));
        const total = parseFloat(amount) + fee;

        const [[user]] = await db.query('SELECT wallet_balance FROM users WHERE id = ?', [req.user.id]);
        if (parseFloat(user.wallet_balance) < total) return res.status(400).json({ error: 'INSUFFICIENT_BALANCE' });

        await db.query('UPDATE users SET wallet_balance = wallet_balance - ? WHERE id = ?', [total, req.user.id]);
        await db.query('UPDATE contracts SET escrow_balance = ?, escrow_status = "funded", platform_fee = ? WHERE id = ?', [parseFloat(amount), fee, contract_id]);
        await db.query('INSERT INTO transactions (contract_id, user_id, type, amount, method, status) VALUES (?, ?, "escrow_fund", ?, ?, "completed")', [contract_id, req.user.id, total, method || 'wallet']);

        // Fraud check after payment
        setImmediate(() => {
            require('../modules/fraud/fraudDetector').analyzeUser(req.user.id).catch(() => {});
        });

        res.json({ success: true, fee, net, total });
    } catch (err) {
        res.status(500).json({ error: 'SERVER_ERROR', message: err.message });
    }
});

// POST /api/escrow/release-milestone
router.post('/release-milestone', authenticate, async (req, res) => {
    const { milestone_id } = req.body;
    try {
        const [[ms]] = await db.query('SELECT * FROM milestones WHERE id = ?', [milestone_id]);
        if (!ms) return res.status(404).json({ error: 'MILESTONE_NOT_FOUND' });
        if (ms.status === 'released') return res.status(400).json({ error: 'MILESTONE_ALREADY_RELEASED' });
        if (ms.status !== 'approved' && ms.status !== 'submitted') {
            return res.status(400).json({ error: 'MILESTONE_NOT_APPROVED', message: 'Milestone must be approved before releasing payment' });
        }

        const [[contract]] = await db.query('SELECT * FROM contracts WHERE id = ?', [ms.contract_id]);
        if (!contract) return res.status(404).json({ error: 'CONTRACT_NOT_FOUND' });

        // Only the client can release milestone payment
        if (req.user.id !== contract.client_id) {
            return res.status(403).json({ error: 'FORBIDDEN', message: 'Only the client can release milestone payments' });
        }

        if (contract.escrow_status === 'frozen') return res.status(403).json({ error: 'ESCROW_FROZEN_DISPUTE' });

        const gross = parseFloat(ms.amount);
        if (parseFloat(contract.escrow_balance) < gross) {
            return res.status(400).json({ error: 'INSUFFICIENT_ESCROW', message: 'Not enough escrow balance for this milestone' });
        }

        // Deduct platform commission (10%)
        const { fee, net } = calculateFee(gross);

        await db.query('UPDATE users SET wallet_balance = wallet_balance + ? WHERE id = ?', [net, contract.freelancer_id]);
        await db.query('UPDATE contracts SET escrow_balance = escrow_balance - ?, platform_fee = platform_fee + ? WHERE id = ?', [gross, fee, contract.id]);
        await db.query("UPDATE milestones SET status = 'released', released_at = NOW() WHERE id = ?", [milestone_id]);
        await db.query(
            'INSERT INTO transactions (contract_id, user_id, type, amount, method, status) VALUES (?, ?, "milestone_release", ?, "wallet", "completed")',
            [contract.id, contract.freelancer_id, net]
        );

        // Check if all milestones are now released — auto-complete contract
        const [[{ total, released }]] = await db.query(
            `SELECT COUNT(*) as total, SUM(status = 'released') as released FROM milestones WHERE contract_id = ?`,
            [contract.id]
        );
        let contractCompleted = false;
        if (total > 0 && parseInt(released) === parseInt(total)) {
            await db.query(
                "UPDATE contracts SET escrow_status = 'released', status = 'completed', completed_at = NOW() WHERE id = ?",
                [contract.id]
            );
            await db.query('UPDATE freelancer_profiles SET total_completed = total_completed + 1 WHERE id = ?', [contract.freelancer_id]);
            const { recalculate } = require('../modules/reputation/reputationEngine');
            setImmediate(() => recalculate(contract.freelancer_id).catch(() => {}));
            contractCompleted = true;

            // Process referral rewards for both parties
            setImmediate(() => {
                processReferralReward(contract.freelancer_id).catch(() => {});
                processReferralReward(contract.client_id).catch(() => {});
            });

            await enqueueNotification(contract.freelancer_id, 'contract_completed', {
                title: '🎉 Contract Completed!',
                message: `All milestones released. Contract #${contract.id} is now complete.`
            }).catch(() => {});
            await enqueueNotification(contract.client_id, 'contract_completed', {
                title: '🎉 Contract Completed!',
                message: `All milestones have been paid. Contract #${contract.id} is now complete.`
            }).catch(() => {});
        }

        await enqueueNotification(contract.freelancer_id, 'payment_released', {
            title: '💰 Milestone Payment Released',
            message: `${net.toFixed(2)} ETB released for milestone "${ms.title}" (${fee.toFixed(2)} ETB platform fee deducted)`
        }).catch(() => {});

        res.json({
            success: true,
            gross,
            fee,
            net,
            contract_completed: contractCompleted,
            message: `${net.toFixed(2)} ETB released to freelancer (${fee.toFixed(2)} ETB platform fee)`
        });
    } catch (err) {
        res.status(500).json({ error: 'SERVER_ERROR', message: err.message });
    }
});

// POST /api/escrow/release-full
router.post('/release-full', authenticate, async (req, res) => {
    const { contract_id } = req.body;
    try {
        const [[contract]] = await db.query('SELECT * FROM contracts WHERE id = ? AND client_id = ?', [contract_id, req.user.id]);
        if (!contract) return res.status(404).json({ error: 'CONTRACT_NOT_FOUND' });
        if (contract.escrow_status === 'frozen') return res.status(403).json({ error: 'ESCROW_FROZEN_DISPUTE' });
        if (contract.status === 'completed') return res.status(400).json({ error: 'CONTRACT_ALREADY_COMPLETED' });

        const gross = parseFloat(contract.escrow_balance);
        if (gross <= 0) return res.status(400).json({ error: 'NO_ESCROW_BALANCE', message: 'No escrow balance to release' });

        // Deduct platform commission (10%)
        const { fee, net } = calculateFee(gross);

        await db.query('UPDATE users SET wallet_balance = wallet_balance + ? WHERE id = ?', [net, contract.freelancer_id]);
        await db.query(
            'UPDATE contracts SET escrow_balance = 0, escrow_status = "released", status = "completed", completed_at = NOW(), platform_fee = platform_fee + ? WHERE id = ?',
            [fee, contract_id]
        );
        await db.query(
            'INSERT INTO transactions (contract_id, user_id, type, amount, method, status) VALUES (?, ?, "full_release", ?, "wallet", "completed")',
            [contract_id, contract.freelancer_id, net]
        );

        // Mark any remaining milestones as released
        await db.query("UPDATE milestones SET status = 'released', released_at = NOW() WHERE contract_id = ? AND status != 'released'", [contract_id]);

        await db.query('UPDATE freelancer_profiles SET total_completed = total_completed + 1 WHERE id = ?', [contract.freelancer_id]);
        setImmediate(() => recalculateReputation(contract.freelancer_id).catch(() => {}));

        await enqueueNotification(contract.freelancer_id, 'payment_released', {
            title: '💰 Full Payment Released',
            message: `Contract completed! ${net.toFixed(2)} ETB released to your wallet (${fee.toFixed(2)} ETB platform fee deducted).`
        }).catch(() => {});
        await enqueueNotification(contract.client_id, 'contract_completed', {
            title: '✅ Contract Completed',
            message: `You released full payment of ${net.toFixed(2)} ETB. Contract is now complete.`
        }).catch(() => {});

        res.json({ success: true, gross, fee, net, message: `${net.toFixed(2)} ETB released to freelancer` });
    } catch (err) {
        res.status(500).json({ error: 'SERVER_ERROR', message: err.message });
    }
});

// POST /api/escrow/refund (admin only)
router.post('/refund', authenticate, requireAdmin, async (req, res) => {
    const { contract_id } = req.body;
    const [[contract]] = await db.query('SELECT * FROM contracts WHERE id = ?', [contract_id]);
    if (!contract) return res.status(404).json({ error: 'CONTRACT_NOT_FOUND' });
    const amount = parseFloat(contract.escrow_balance);
    await db.query('UPDATE users SET wallet_balance = wallet_balance + ? WHERE id = ?', [amount, contract.client_id]);
    await db.query('UPDATE contracts SET escrow_balance = 0, escrow_status = "refunded" WHERE id = ?', [contract_id]);
    await db.query('INSERT INTO transactions (contract_id, user_id, type, amount, method, status) VALUES (?, ?, "refund", ?, "wallet", "completed")', [contract_id, contract.client_id, amount]);
    res.json({ success: true });
});

// POST /api/payments/webhook — payment gateway callback handler
router.post('/webhook', async (req, res) => {
    const { provider, transaction_id, status, amount, reference } = req.body;
    // Verify webhook signature in production (provider-specific)
    try {
        const [[tx]] = await db.query(
            'SELECT * FROM transactions WHERE id = ? OR (method = ? AND amount = ?)',
            [transaction_id, provider, parseFloat(amount)]
        );

        if (!tx) {
            // New top-up from gateway — find pending transaction by reference
            const [[pendingTx]] = await db.query(
                "SELECT * FROM transactions WHERE status = 'pending' AND method = ? ORDER BY created_at DESC LIMIT 1",
                [provider]
            );
            if (pendingTx && status === 'success') {
                await db.query("UPDATE transactions SET status = 'completed' WHERE id = ?", [pendingTx.id]);
                await db.query('UPDATE users SET wallet_balance = wallet_balance + ? WHERE id = ?', [parseFloat(pendingTx.amount), pendingTx.user_id]);
                await enqueueNotification(pendingTx.user_id, 'payment_received', {
                    title: '💳 Payment Received',
                    message: `${parseFloat(pendingTx.amount).toFixed(2)} ETB added to your wallet via ${provider}`
                });
            }
            return res.json({ received: true });
        }

        if (status === 'success' || status === 'completed') {
            await db.query("UPDATE transactions SET status = 'completed' WHERE id = ?", [tx.id]);
            // If this was an escrow fund transaction, mark contract as funded
            if (tx.type === 'escrow_fund' && tx.contract_id) {
                await db.query("UPDATE contracts SET escrow_status = 'funded' WHERE id = ? AND escrow_status = 'unfunded'", [tx.contract_id]);
            }
            // Credit wallet for top-ups
            if (tx.type === 'topup') {
                await db.query('UPDATE users SET wallet_balance = wallet_balance + ? WHERE id = ?', [parseFloat(tx.amount), tx.user_id]);
            }
            await enqueueNotification(tx.user_id, 'payment_received', {
                title: '✅ Payment Confirmed',
                message: `Payment of ${parseFloat(tx.amount).toFixed(2)} ETB via ${provider} was successful`
            });
        } else if (status === 'failed') {
            await db.query("UPDATE transactions SET status = 'failed' WHERE id = ?", [tx.id]);
            await enqueueNotification(tx.user_id, 'payment_failed', {
                title: '❌ Payment Failed',
                message: `Your payment of ${parseFloat(tx.amount).toFixed(2)} ETB via ${provider} failed. Escrow funds have not been released.`
            });
        }

        res.json({ received: true });
    } catch (err) {
        console.error('Webhook error:', err.message);
        res.status(500).json({ error: 'WEBHOOK_ERROR' });
    }
});

// POST /api/payments/topup — simulate wallet top-up
router.post('/topup', authenticate, async (req, res) => {
    const { amount, method, phone_number } = req.body;
    if (!amount || parseFloat(amount) <= 0) return res.status(422).json({ error: 'VALIDATION_ERROR', fields: { amount: 'Must be greater than 0' } });
    if (!method) return res.status(422).json({ error: 'VALIDATION_ERROR', fields: { method: 'Required' } });
    try {
        await db.query('UPDATE users SET wallet_balance = wallet_balance + ? WHERE id = ?', [parseFloat(amount), req.user.id]);
        await db.query(
            'INSERT INTO transactions (user_id, type, amount, method, status) VALUES (?, "topup", ?, ?, "completed")',
            [req.user.id, parseFloat(amount), method]
        );
        const [[user]] = await db.query('SELECT wallet_balance FROM users WHERE id = ?', [req.user.id]);
        res.json({ success: true, new_balance: user.wallet_balance, message: `${amount} ETB added via ${method}` });
    } catch (err) {
        res.status(500).json({ error: 'SERVER_ERROR', message: err.message });
    }
});

// GET /api/payments/history
router.get('/history', authenticate, async (req, res) => {
    const [txs] = await db.query('SELECT * FROM transactions WHERE user_id = ? ORDER BY created_at DESC', [req.user.id]);
    res.json(txs);
});

// POST /api/wallet/withdraw/:id/cancel — user cancels their own pending withdrawal
router.post('/wallet/withdraw/:id/cancel', authenticate, async (req, res) => {
    try {
        const [[tx]] = await db.query(
            "SELECT * FROM transactions WHERE id = ? AND user_id = ? AND type = 'withdrawal' AND status = 'pending'",
            [req.params.id, req.user.id]
        );
        if (!tx) return res.status(404).json({ error: 'NOT_FOUND', message: 'Pending withdrawal not found' });

        // Refund back to wallet
        await db.query('UPDATE users SET wallet_balance = wallet_balance + ? WHERE id = ?', [parseFloat(tx.amount), req.user.id]);
        await db.query("UPDATE transactions SET status = 'failed', gateway_ref = CONCAT(COALESCE(gateway_ref,''), ' | Cancelled by user') WHERE id = ?", [tx.id]);

        const [[user]] = await db.query('SELECT wallet_balance FROM users WHERE id = ?', [req.user.id]);
        res.json({ success: true, new_balance: user.wallet_balance });
    } catch (err) {
        res.status(500).json({ error: 'SERVER_ERROR', message: err.message });
    }
});

// GET /api/wallet/balance
router.get('/wallet/balance', authenticate, async (req, res) => {
    const [[user]] = await db.query('SELECT wallet_balance FROM users WHERE id = ?', [req.user.id]);
    res.json({ balance: user.wallet_balance });
});

// POST /api/wallet/withdraw
router.post('/wallet/withdraw', authenticate, async (req, res) => {
    const { amount, method, account_number } = req.body;
    if (!amount || parseFloat(amount) <= 0) return res.status(422).json({ error: 'VALIDATION_ERROR', fields: { amount: 'Must be greater than 0' } });
    if (!method) return res.status(422).json({ error: 'VALIDATION_ERROR', fields: { method: 'Required' } });

    try {
        const [[user]] = await db.query('SELECT wallet_balance FROM users WHERE id = ?', [req.user.id]);
        if (parseFloat(user.wallet_balance) < parseFloat(amount)) {
            return res.status(400).json({ error: 'INSUFFICIENT_BALANCE' });
        }

        // Reserve funds immediately
        await db.query('UPDATE users SET wallet_balance = wallet_balance - ? WHERE id = ?', [parseFloat(amount), req.user.id]);

        // Store account info in gateway_ref (avoids needing extra migration)
        const accountNote = account_number ? `Account: ${account_number}` : null;
        const [result] = await db.query(
            'INSERT INTO transactions (user_id, type, amount, method, status, gateway_ref) VALUES (?, "withdrawal", ?, ?, "pending", ?)',
            [req.user.id, parseFloat(amount), method, accountNote]
        );

        // Notify admins
        const [admins] = await db.query("SELECT id FROM users WHERE role = 'admin'");
        for (const admin of admins) {
            await enqueueNotification(admin.id, 'withdrawal_pending', {
                title: '💸 Withdrawal Request',
                message: `User #${req.user.id} requested ${parseFloat(amount).toFixed(2)} ETB via ${method}`
            }).catch(() => {});
        }

        res.json({
            success: true,
            transaction_id: result.insertId,
            message: 'Withdrawal request submitted. Pending admin approval. Funds will arrive within 3 business days.'
        });
    } catch (err) {
        res.status(500).json({ error: 'SERVER_ERROR', message: err.message });
    }
});

module.exports = router;
