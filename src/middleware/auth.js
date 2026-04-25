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
 * Used on sensitive actions like contract signing.
 */
async function requireKYC(req, res, next) {
    try {
        const [[user]] = await db.query('SELECT kyc_status, is_verified FROM users WHERE id = ?', [req.user.id]);
        if (!user || user.kyc_status !== 'approved' || !user.is_verified) {
            return res.status(403).json({
                error: 'KYC_REQUIRED',
                message: 'You must complete identity verification before signing a contract. Please go to your profile and submit your ID and selfie.'
            });
        }
        next();
    } catch (err) {
        return res.status(500).json({ error: 'SERVER_ERROR', message: err.message });
    }
}

module.exports = { authenticate, requireAdmin, requireKYC, JWT_SECRET };
