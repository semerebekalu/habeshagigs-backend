const express = require('express');
const router = express.Router();
const bcrypt = require('bcrypt');
const crypto = require('crypto');
const { db } = require('../config/db');
const { revokeToken } = require('../config/redis');
const { signToken } = require('../utils/jwt');
const { authenticate } = require('../middleware/auth');
const { rateLimiter } = require('../middleware/rateLimiter');
const { enqueueNotification } = require('../modules/notification/notificationService');
const { sendOTP, sendPasswordReset } = require('../utils/emailService');

function generateOTP() {
    return Math.floor(100000 + Math.random() * 900000).toString();
}

// Rate limiters
const loginLimiter     = rateLimiter({ windowMs: 15 * 60_000, max: 10, message: 'Too many login attempts. Please wait 15 minutes.' });
const otpLimiter       = rateLimiter({ windowMs: 10 * 60_000, max: 5,  message: 'Too many OTP requests. Please wait 10 minutes.' });
const registerLimiter  = rateLimiter({ windowMs: 60 * 60_000, max: 5,  message: 'Too many registrations from this IP. Please try again later.' });
const forgotLimiter    = rateLimiter({ windowMs: 60 * 60_000, max: 5,  message: 'Too many password reset requests. Please wait an hour.' });

// POST /api/auth/register
router.post('/register', registerLimiter, async (req, res) => {
    const { name, email, phone, password, role } = req.body;

    // Validate required fields — phone is now mandatory
    if (!name || !email || !phone || !password || !role) {
        return res.status(422).json({
            error: 'VALIDATION_ERROR',
            fields: { general: 'Full name, email, phone, password and role are all required' }
        });
    }

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        return res.status(422).json({ error: 'VALIDATION_ERROR', fields: { email: 'Please enter a valid email address' } });
    }

    if (password.length < 8) {
        return res.status(422).json({ error: 'VALIDATION_ERROR', fields: { password: 'Password must be at least 8 characters' } });
    }

    try {
        // Ensure OTP columns exist (safe to run multiple times)
        await db.query("ALTER TABLE users ADD COLUMN IF NOT EXISTS otp_code VARCHAR(10) NULL").catch(() => {});
        await db.query("ALTER TABLE users ADD COLUMN IF NOT EXISTS otp_expires DATETIME NULL").catch(() => {});
        await db.query("ALTER TABLE users ADD COLUMN IF NOT EXISTS reset_token VARCHAR(100) NULL").catch(() => {});
        await db.query("ALTER TABLE users ADD COLUMN IF NOT EXISTS reset_token_expires DATETIME NULL").catch(() => {});

        const [existing] = await db.query(
            'SELECT id FROM users WHERE email = ? OR phone = ?',
            [email, phone]
        );
        if (existing.length > 0) {
            return res.status(409).json({ error: 'EMAIL_ALREADY_REGISTERED', message: 'An account with this email or phone already exists.' });
        }

        const hash = await bcrypt.hash(password, 10);
        const activeRole = role === 'admin' ? 'client' : role;
        const otp = generateOTP();
        const otpExpires = new Date(Date.now() + 10 * 60 * 1000);

        const [result] = await db.query(
            `INSERT INTO users (full_name, email, phone, password_hash, role, active_role, is_verified, kyc_status, otp_code, otp_expires)
             VALUES (?, ?, ?, ?, ?, ?, 0, 'none', ?, ?)`,
            [name, email, phone, hash, role, activeRole, otp, otpExpires]
        );
        const userId = result.insertId;

        if (role === 'freelancer') {
            await db.query('INSERT INTO freelancer_profiles (id) VALUES (?)', [userId]);
        }

        try {
            await sendOTP(email, otp, name);
        } catch (emailErr) {
            console.error('Email send failed:', emailErr.message);
            console.log(`OTP for ${email}: ${otp}`);
        }

        const token = signToken({ id: userId, role, active_role: activeRole });
        res.status(201).json({
            success: true,
            token,
            user: { id: userId, name, email, role, active_role: activeRole, is_verified: 0, kyc_status: 'none' },
            message: `Verification code sent to ${email}.`
        });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'SERVER_ERROR', message: err.message });
    }
});

// POST /api/auth/verify-otp
router.post('/verify-otp', otpLimiter, async (req, res) => {
    const { email, otp } = req.body;
    if (!email || !otp) return res.status(422).json({ error: 'VALIDATION_ERROR', message: 'Email and OTP required' });
    try {
        const [[user]] = await db.query('SELECT * FROM users WHERE email = ?', [email]);
        if (!user) return res.status(404).json({ error: 'USER_NOT_FOUND' });
        if (user.is_verified) return res.json({ success: true, message: 'Already verified' });

        if (!user.otp_code || user.otp_code !== otp) {
            return res.status(400).json({ error: 'INVALID_OTP', message: 'Invalid verification code' });
        }
        if (new Date(user.otp_expires) < new Date()) {
            return res.status(400).json({ error: 'OTP_EXPIRED', message: 'Verification code has expired. Please request a new one.' });
        }

        await db.query('UPDATE users SET is_verified = 1, otp_code = NULL, otp_expires = NULL WHERE id = ?', [user.id]);
        res.json({ success: true, message: 'Account verified successfully!' });
    } catch (err) {
        res.status(500).json({ error: 'SERVER_ERROR', message: err.message });
    }
});

// POST /api/auth/resend-otp
router.post('/resend-otp', otpLimiter, async (req, res) => {
    const { email } = req.body;
    if (!email) return res.status(422).json({ error: 'VALIDATION_ERROR' });
    try {
        const [[user]] = await db.query('SELECT * FROM users WHERE email = ?', [email]);
        if (!user) return res.status(404).json({ error: 'USER_NOT_FOUND' });
        if (user.is_verified) return res.json({ success: true, message: 'Already verified' });

        const otp = generateOTP();
        const otpExpires = new Date(Date.now() + 10 * 60 * 1000);
        await db.query('UPDATE users SET otp_code = ?, otp_expires = ? WHERE id = ?', [otp, otpExpires, user.id]);

        try {
            await sendOTP(email, otp, user.full_name);
        } catch (e) {
            console.log(`Resend OTP for ${email}: ${otp}`);
        }

        res.json({ success: true, message: 'New verification code sent to your email.' });
    } catch (err) {
        res.status(500).json({ error: 'SERVER_ERROR', message: err.message });
    }
});

// POST /api/auth/login
router.post('/login', loginLimiter, async (req, res) => {
    const { email, password } = req.body;
    if (!email || !password) return res.status(422).json({ error: 'VALIDATION_ERROR' });
    try {
        const [[user]] = await db.query('SELECT * FROM users WHERE email = ?', [email]);
        if (!user) return res.status(401).json({ error: 'INVALID_CREDENTIALS', message: 'Invalid email or password' });
        if (user.is_banned) return res.status(403).json({ error: 'ACCOUNT_BANNED', message: 'Your account has been permanently suspended. Contact support.' });

        // Check suspension — also auto-lift if duration has expired
        if (user.is_suspended) {
            if (user.suspended_until && new Date(user.suspended_until) <= new Date()) {
                // Auto-lift expired suspension
                await db.query('UPDATE users SET is_suspended = 0, suspension_reason = NULL, suspended_until = NULL WHERE id = ?', [user.id]);
            } else {
                const untilText = user.suspended_until
                    ? ` until ${new Date(user.suspended_until).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}`
                    : '';
                const reason = user.suspension_reason ? ` Reason: ${user.suspension_reason}.` : '';
                return res.status(403).json({
                    error: 'ACCOUNT_SUSPENDED',
                    message: `Your account is suspended${untilText}.${reason} Contact support to appeal.`,
                    suspended_until: user.suspended_until
                });
            }
        }
        if (user.locked_until && new Date(user.locked_until) > new Date()) {
            return res.status(423).json({ error: 'ACCOUNT_LOCKED', message: 'Account locked for 15 minutes due to too many failed attempts.', unlockAt: user.locked_until });
        }

        const match = await bcrypt.compare(password, user.password_hash);
        if (!match) {
            const attempts = (user.failed_login_attempts || 0) + 1;
            if (attempts >= 5) {
                const lockUntil = new Date(Date.now() + 15 * 60 * 1000);
                await db.query('UPDATE users SET failed_login_attempts = ?, locked_until = ? WHERE id = ?', [attempts, lockUntil, user.id]);
                await enqueueNotification(user.id, 'account_locked', {
                    title: '🔒 Account Temporarily Locked',
                    message: `Your account has been locked for 15 minutes due to 5 failed login attempts.`
                }).catch(() => {});
                return res.status(423).json({ error: 'ACCOUNT_LOCKED', message: 'Account locked for 15 minutes.', unlockAt: lockUntil });
            }
            await db.query('UPDATE users SET failed_login_attempts = ? WHERE id = ?', [attempts, user.id]);
            return res.status(401).json({ error: 'INVALID_CREDENTIALS', message: 'Invalid email or password' });
        }

        await db.query('UPDATE users SET failed_login_attempts = 0, locked_until = NULL WHERE id = ?', [user.id]);
        const token = signToken({ id: user.id, role: user.role, active_role: user.active_role });

        setImmediate(() => {
            require('../modules/fraud/fraudDetector').analyzeUser(user.id).catch(() => {});
        });

        res.json({
            success: true,
            token,
            user: { id: user.id, name: user.full_name, email: user.email, role: user.role, active_role: user.active_role, wallet_balance: user.wallet_balance, is_verified: user.is_verified, kyc_status: user.kyc_status, username: user.username },
            needs_verification: !user.is_verified
        });
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
router.post('/forgot-password', forgotLimiter, async (req, res) => {
    const { email } = req.body;
    if (!email) return res.status(422).json({ error: 'VALIDATION_ERROR', message: 'Email required' });
    try {
        const [[user]] = await db.query('SELECT id, full_name FROM users WHERE email = ?', [email]);
        if (!user) return res.json({ success: true, message: 'If that email exists, a reset link has been sent.' });

        const token = crypto.randomBytes(32).toString('hex');
        const expires = new Date(Date.now() + 30 * 60 * 1000);

        // Store reset token
        await db.query(
            'UPDATE users SET reset_token = ?, reset_token_expires = ? WHERE id = ?',
            [token, expires, user.id]
        );

        const baseUrl = process.env.APP_URL || 'https://habeshagigs.up.railway.app';
        const resetLink = `${baseUrl}/reset-password.html?token=${token}&email=${encodeURIComponent(email)}`;

        try {
            await sendPasswordReset(email, resetLink, user.full_name);
        } catch (e) {
            console.log(`Reset link for ${email}: ${resetLink}`);
        }

        res.json({ success: true, message: 'Password reset link sent to your email.' });
    } catch (err) {
        res.status(500).json({ error: 'SERVER_ERROR', message: err.message });
    }
});

// POST /api/auth/reset-password
router.post('/reset-password', async (req, res) => {
    const { email, token, new_password } = req.body;
    if (!email || !token || !new_password) {
        return res.status(422).json({ error: 'VALIDATION_ERROR', message: 'Email, token and new password required' });
    }
    if (new_password.length < 8) {
        return res.status(422).json({ error: 'VALIDATION_ERROR', message: 'Password must be at least 8 characters' });
    }
    try {
        const [[user]] = await db.query(
            'SELECT * FROM users WHERE email = ? AND reset_token = ?',
            [email, token]
        );
        if (!user) return res.status(400).json({ error: 'INVALID_TOKEN', message: 'Invalid or expired reset link.' });
        if (new Date(user.reset_token_expires) < new Date()) {
            return res.status(400).json({ error: 'RESET_TOKEN_EXPIRED', message: 'Reset link has expired. Please request a new one.' });
        }

        const hash = await bcrypt.hash(new_password, 10);
        await db.query(
            'UPDATE users SET password_hash = ?, reset_token = NULL, reset_token_expires = NULL WHERE id = ?',
            [hash, user.id]
        );

        res.json({ success: true, message: 'Password reset successfully. You can now log in.' });
    } catch (err) {
        res.status(500).json({ error: 'SERVER_ERROR', message: err.message });
    }
});

module.exports = router;
