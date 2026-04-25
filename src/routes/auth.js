const express = require('express');
const router = express.Router();
const bcrypt = require('bcrypt');
const crypto = require('crypto');
const { db } = require('../config/db');
const { revokeToken } = require('../config/redis');
const { signToken } = require('../utils/jwt');
const { authenticate } = require('../middleware/auth');
const { enqueueNotification } = require('../modules/notification/notificationService');

// POST /api/auth/register
router.post('/register', async (req, res) => {
    const { name, email, phone, password, role } = req.body;
    if (!name || !email || !password || !role) {
        return res.status(422).json({ error: 'VALIDATION_ERROR', fields: { general: 'name, email, password, role required' } });
    }
    try {
        const [existing] = await db.query('SELECT id FROM users WHERE email = ? OR (phone IS NOT NULL AND phone = ?)', [email, phone || null]);
        if (existing.length > 0) return res.status(409).json({ error: 'EMAIL_ALREADY_REGISTERED' });

        const hash = await bcrypt.hash(password, 10);
        const activeRole = role === 'admin' ? 'client' : role;
        const [result] = await db.query(
            'INSERT INTO users (full_name, email, phone, password_hash, role, active_role, is_verified, kyc_status) VALUES (?, ?, ?, ?, ?, ?, 0, "none")',
            [name, email, phone || null, hash, role, activeRole]
        );
        const userId = result.insertId;
        if (role === 'freelancer') {
            await db.query('INSERT INTO freelancer_profiles (id) VALUES (?)', [userId]);
        }
        const token = signToken({ id: userId, role, active_role: activeRole });
        res.status(201).json({ success: true, token, user: { id: userId, name, email, role, active_role: activeRole, is_verified: 0, kyc_status: 'none' } });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'SERVER_ERROR', message: err.message });
    }
});

// POST /api/auth/login
router.post('/login', async (req, res) => {
    const { email, password } = req.body;
    if (!email || !password) return res.status(422).json({ error: 'VALIDATION_ERROR' });
    try {
        const [[user]] = await db.query('SELECT * FROM users WHERE email = ?', [email]);
        if (!user) return res.status(401).json({ error: 'INVALID_CREDENTIALS' });
        if (user.is_banned) return res.status(403).json({ error: 'ACCOUNT_BANNED' });
        if (user.locked_until && new Date(user.locked_until) > new Date()) {
            return res.status(423).json({ error: 'ACCOUNT_LOCKED', unlockAt: user.locked_until });
        }

        const match = await bcrypt.compare(password, user.password_hash);
        if (!match) {
            const attempts = (user.failed_login_attempts || 0) + 1;
            if (attempts >= 5) {
                const lockUntil = new Date(Date.now() + 15 * 60 * 1000);
                await db.query('UPDATE users SET failed_login_attempts = ?, locked_until = ? WHERE id = ?', [attempts, lockUntil, user.id]);
                // Notify user of account lockout (Requirement 1.6)
                await enqueueNotification(user.id, 'account_locked', {
                    title: '🔒 Account Temporarily Locked',
                    title_am: '🔒 መለያ ጊዜያዊ ተቆልፏል',
                    message: `Your account has been locked for 15 minutes due to 5 consecutive failed login attempts. It will unlock at ${lockUntil.toLocaleTimeString()}.`,
                    message_am: `5 ተከታታይ ያልተሳካ የመግቢያ ሙከራዎች ምክንያት መለያዎ ለ15 ደቂቃ ተቆልፏል።`
                }).catch(() => {});
                return res.status(423).json({ error: 'ACCOUNT_LOCKED', unlockAt: lockUntil });
            }
            await db.query('UPDATE users SET failed_login_attempts = ? WHERE id = ?', [attempts, user.id]);
            return res.status(401).json({ error: 'INVALID_CREDENTIALS' });
        }

        await db.query('UPDATE users SET failed_login_attempts = 0, locked_until = NULL WHERE id = ?', [user.id]);
        const token = signToken({ id: user.id, role: user.role, active_role: user.active_role });

        // Run fraud check asynchronously (don't block login)
        setImmediate(() => {
            require('../modules/fraud/fraudDetector').analyzeUser(user.id).catch(() => {});
        });

        res.json({ success: true, token, user: { id: user.id, name: user.full_name, email: user.email, role: user.role, active_role: user.active_role, wallet_balance: user.wallet_balance, is_verified: user.is_verified, kyc_status: user.kyc_status, username: user.username } });
    } catch (err) {
        res.status(500).json({ error: 'SERVER_ERROR', message: err.message });
    }
});

// POST /api/auth/logout
router.post('/logout', authenticate, async (req, res) => {
    const token = req.headers.authorization.split(' ')[1];
    await revokeToken(token, 7 * 24 * 3600);
    res.json({ success: true });
});

// POST /api/auth/switch-role
router.post('/switch-role', authenticate, async (req, res) => {
    const { role } = req.body;
    if (!['freelancer', 'client'].includes(role)) return res.status(422).json({ error: 'INVALID_ROLE' });
    await db.query('UPDATE users SET active_role = ? WHERE id = ?', [role, req.user.id]);
    const token = signToken({ id: req.user.id, role: req.user.role, active_role: role });
    res.json({ success: true, token, active_role: role });
});

// POST /api/auth/forgot-password
router.post('/forgot-password', async (req, res) => {
    const { email } = req.body;
    const [[user]] = await db.query('SELECT id FROM users WHERE email = ?', [email]);
    if (!user) return res.json({ success: true }); // don't reveal existence
    const token = crypto.randomBytes(32).toString('hex');
    const expires = new Date(Date.now() + 30 * 60 * 1000);
    await db.query('UPDATE users SET password_hash = password_hash WHERE id = ?', [user.id]); // placeholder
    // In production: store token in a reset_tokens table and email it
    console.log(`🔑 Password reset token for ${email}: ${token} (expires ${expires})`);
    res.json({ success: true, message: 'Reset link sent if email exists' });
});

module.exports = router;
