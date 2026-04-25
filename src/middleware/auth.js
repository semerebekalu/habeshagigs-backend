const jwt = require('jsonwebtoken');
const { isTokenRevoked } = require('../config/redis');
const { db } = require('../config/db');

const JWT_SECRET = process.env.JWT_SECRET || 'ethiogigs_jwt_secret_2026';

async function authenticate(req, res, next) {
    const header = req.headers.authorization;
    if (!header || !header.startsWith('Bearer ')) {
        return res.status(401).json({ error: 'TOKEN_MISSING' });
    }
    const token = header.split(' ')[1];
    try {
        const revoked = await isTokenRevoked(token);
        if (revoked) return res.status(401).json({ error: 'TOKEN_REVOKED' });
        const decoded = jwt.verify(token, JWT_SECRET);
        req.user = decoded;
        next();
    } catch (err) {
        return res.status(401).json({ error: 'TOKEN_EXPIRED' });
    }
}

async function requireAdmin(req, res, next) {
    // First check JWT claim (fast path)
    if (!req.user) return res.status(403).json({ error: 'FORBIDDEN', message: 'Admin access required.' });
    if (req.user.role === 'admin') return next();
    // JWT might be stale — verify against DB
    try {
        const [[user]] = await db.query('SELECT role FROM users WHERE id = ?', [req.user.id]);
        if (user && user.role === 'admin') return next();
    } catch {}
    return res.status(403).json({ error: 'FORBIDDEN', message: 'Admin access required. Please log out and log back in.' });
}

/**
 * Blocks the request if the user has not completed KYC verification.
 * Used on sensitive actions like contract signing, hiring, and payments.
 */
async function requireKYC(req, res, next) {
    try {
        const [[user]] = await db.query('SELECT kyc_status, is_verified, is_suspended, is_banned FROM users WHERE id = ?', [req.user.id]);
        if (!user) return res.status(403).json({ error: 'USER_NOT_FOUND' });
        if (user.is_banned) return res.status(403).json({ error: 'ACCOUNT_BANNED', message: 'Your account has been suspended.' });
        if (user.is_suspended) return res.status(403).json({ error: 'ACCOUNT_SUSPENDED', message: 'Your account is temporarily suspended.' });
        if (!user.is_verified) {
            return res.status(403).json({
                error: 'EMAIL_VERIFICATION_REQUIRED',
                message: 'Please verify your email address before proceeding.'
            });
        }
        if (user.kyc_status !== 'approved') {
            return res.status(403).json({
                error: 'KYC_REQUIRED',
                message: user.kyc_status === 'pending'
                    ? 'Your identity verification is under review. You will be notified once approved.'
                    : user.kyc_status === 'rejected'
                    ? 'Your identity verification was rejected. Please resubmit your documents.'
                    : 'You must complete identity verification before this action. Please go to your profile and submit your ID and selfie.',
                kyc_status: user.kyc_status
            });
        }
        next();
    } catch (err) {
        return res.status(500).json({ error: 'SERVER_ERROR', message: err.message });
    }
}

/**
 * Requires email verification only (lighter gate for non-financial actions).
 */
async function requireVerified(req, res, next) {
    try {
        const [[user]] = await db.query('SELECT is_verified, is_banned, is_suspended FROM users WHERE id = ?', [req.user.id]);
        if (!user) return res.status(403).json({ error: 'USER_NOT_FOUND' });
        if (user.is_banned) return res.status(403).json({ error: 'ACCOUNT_BANNED' });
        if (user.is_suspended) return res.status(403).json({ error: 'ACCOUNT_SUSPENDED' });
        if (!user.is_verified) {
            return res.status(403).json({
                error: 'EMAIL_VERIFICATION_REQUIRED',
                message: 'Please verify your email address before proceeding.'
            });
        }
        next();
    } catch (err) {
        return res.status(500).json({ error: 'SERVER_ERROR', message: err.message });
    }
}

module.exports = { authenticate, requireAdmin, requireKYC, requireVerified, JWT_SECRET };
