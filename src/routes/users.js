const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { db } = require('../config/db');
const { authenticate } = require('../middleware/auth');
const { calculateResponseTime } = require('../modules/messaging/responseTimeCalculator');

// Multer for video uploads
const videoDir = path.join(__dirname, '../../uploads/videos');
if (!fs.existsSync(videoDir)) fs.mkdirSync(videoDir, { recursive: true });
const videoStorage = multer.diskStorage({
    destination: (req, file, cb) => cb(null, videoDir),
    filename: (req, file, cb) => cb(null, `${Date.now()}-${file.originalname.replace(/\s+/g, '_')}`)
});
const uploadVideo = multer({ storage: videoStorage, limits: { fileSize: 100 * 1024 * 1024 } });

// GET /api/users/search — find user by email (for starting conversations)
router.get('/search', authenticate, async (req, res) => {
    const { email, username } = req.query;
    try {
        let user = null;
        if (username) {
            const [[found]] = await db.query(
                'SELECT id, full_name, email, role, username, is_verified FROM users WHERE username = ? AND is_banned = 0',
                [username.toLowerCase().replace('@', '')]
            );
            user = found;
        } else if (email) {
            const [[found]] = await db.query(
                'SELECT id, full_name, email, role, username, is_verified FROM users WHERE email = ? AND is_banned = 0',
                [email]
            );
            user = found;
        }
        if (!user) return res.status(404).json({ error: 'USER_NOT_FOUND' });
        res.json(user);
    } catch (err) {
        res.status(500).json({ error: 'SERVER_ERROR', message: err.message });
    }
});

// GET /api/users/check-username/:username — check if username is available
router.get('/check-username/:username', async (req, res) => {
    const username = req.params.username.toLowerCase().trim();
    if (!/^[a-z0-9_]{3,30}$/.test(username)) {
        return res.json({ available: false, error: 'Username must be 3-30 characters, letters, numbers and underscores only' });
    }
    const [[existing]] = await db.query('SELECT id FROM users WHERE username = ?', [username]);
    res.json({ available: !existing, username });
});

// PUT /api/users/:id/username — set or update username
router.put('/:id/username', authenticate, async (req, res) => {
    if (req.user.id !== parseInt(req.params.id)) return res.status(403).json({ error: 'FORBIDDEN' });
    const { username } = req.body;
    if (!username) return res.status(422).json({ error: 'VALIDATION_ERROR', message: 'Username required' });

    const clean = username.toLowerCase().trim().replace('@', '');
    if (!/^[a-z0-9_]{3,30}$/.test(clean)) {
        return res.status(422).json({ error: 'INVALID_USERNAME', message: 'Username must be 3-30 characters, letters, numbers and underscores only' });
    }
    try {
        const [[existing]] = await db.query('SELECT id FROM users WHERE username = ? AND id != ?', [clean, req.user.id]);
        if (existing) return res.status(409).json({ error: 'USERNAME_TAKEN', message: 'This username is already taken' });
        await db.query('UPDATE users SET username = ? WHERE id = ?', [clean, req.user.id]);
        res.json({ success: true, username: clean });
    } catch (err) {
        res.status(500).json({ error: 'SERVER_ERROR', message: err.message });
    }
});
router.get('/:id', async (req, res) => {
    try {
        const [[user]] = await db.query('SELECT id, full_name, email, role, username, is_verified, created_at FROM users WHERE id = ?', [req.params.id]);
        if (!user) return res.status(404).json({ error: 'USER_NOT_FOUND' });
        if (user.role === 'freelancer') {
            const [[profile]] = await db.query('SELECT * FROM freelancer_profiles WHERE id = ?', [user.id]);
            const [skills] = await db.query(
                `SELECT s.id, s.name, fs.proficiency FROM skills s
                 JOIN freelancer_skills fs ON s.id = fs.skill_id WHERE fs.freelancer_id = ?`,
                [user.id]
            );
            const [portfolio] = await db.query('SELECT * FROM portfolio_items WHERE freelancer_id = ? ORDER BY created_at DESC', [user.id]);
            // Endorsements per skill
            const [endorsements] = await db.query(
                `SELECT se.skill_id, COUNT(*) as count FROM skill_endorsements se WHERE se.freelancer_id = ? GROUP BY se.skill_id`,
                [user.id]
            ).catch(() => [[]]);
            const endorseMap = {};
            for (const e of endorsements) endorseMap[e.skill_id] = e.count;
            for (const s of skills) s.endorsement_count = endorseMap[s.id] || 0;
            user.profile = profile || {};
            user.skills = skills;
            user.portfolio = portfolio;
        }
        res.json(user);
    } catch (err) {
        res.status(500).json({ error: 'SERVER_ERROR', message: err.message });
    }
});

// PUT /api/users/:id/profile
router.put('/:id/profile', authenticate, async (req, res) => {
    if (req.user.id !== parseInt(req.params.id)) return res.status(403).json({ error: 'FORBIDDEN' });
    const { title, bio, bio_am, hourly_rate, availability_status, language_pref } = req.body;
    if (bio && bio.length > 1000) return res.status(422).json({ error: 'VALIDATION_ERROR', fields: { bio: 'Bio must be ≤ 1000 characters' } });
    try {
        if (req.user.active_role === 'freelancer') {
            await db.query(
                'UPDATE freelancer_profiles SET title = ?, bio = ?, bio_am = ?, hourly_rate = ?, availability_status = ? WHERE id = ?',
                [title, bio, bio_am, hourly_rate, availability_status, req.user.id]
            );
            // Invalidate match cache for this freelancer (Requirement 8.5)
            setImmediate(() => {
                require('../modules/reputation/reputationEngine').recalculate(req.user.id).catch(() => {});
            });
        }
        if (language_pref) {
            await db.query('UPDATE users SET language_pref = ? WHERE id = ?', [language_pref, req.user.id]);
        }
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: 'SERVER_ERROR', message: err.message });
    }
});

// POST /api/users/:id/skills
router.post('/:id/skills', authenticate, async (req, res) => {
    if (req.user.id !== parseInt(req.params.id)) return res.status(403).json({ error: 'FORBIDDEN' });
    const { skill_id, proficiency } = req.body;
    try {
        const [existing] = await db.query('SELECT COUNT(*) as cnt FROM freelancer_skills WHERE freelancer_id = ?', [req.user.id]);
        if (existing[0].cnt >= 20) return res.status(422).json({ error: 'VALIDATION_ERROR', fields: { skills: 'Maximum 20 skills allowed' } });
        await db.query('INSERT INTO freelancer_skills (freelancer_id, skill_id, proficiency) VALUES (?, ?, ?)', [req.user.id, skill_id, proficiency || 'beginner']);
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: 'SERVER_ERROR', message: err.message });
    }
});

// DELETE /api/users/:id/skills/:skillId
router.delete('/:id/skills/:skillId', authenticate, async (req, res) => {
    if (req.user.id !== parseInt(req.params.id)) return res.status(403).json({ error: 'FORBIDDEN' });
    await db.query('DELETE FROM freelancer_skills WHERE freelancer_id = ? AND skill_id = ?', [req.user.id, req.params.skillId]);
    res.json({ success: true });
});

// POST /api/users/:id/portfolio
router.post('/:id/portfolio', authenticate, async (req, res) => {
    if (req.user.id !== parseInt(req.params.id)) return res.status(403).json({ error: 'FORBIDDEN' });
    const { title, description, item_type, url } = req.body;
    try {
        const [existing] = await db.query('SELECT COUNT(*) as cnt FROM portfolio_items WHERE freelancer_id = ?', [req.user.id]);
        if (existing[0].cnt >= 30) return res.status(422).json({ error: 'VALIDATION_ERROR', fields: { portfolio: 'Maximum 30 items allowed' } });
        await db.query('INSERT INTO portfolio_items (freelancer_id, title, description, item_type, url) VALUES (?, ?, ?, ?, ?)', [req.user.id, title, description, item_type, url]);
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: 'SERVER_ERROR', message: err.message });
    }
});

// DELETE /api/users/:id/portfolio/:itemId
router.delete('/:id/portfolio/:itemId', authenticate, async (req, res) => {
    if (req.user.id !== parseInt(req.params.id)) return res.status(403).json({ error: 'FORBIDDEN' });
    await db.query('DELETE FROM portfolio_items WHERE id = ? AND freelancer_id = ?', [req.params.itemId, req.user.id]);
    res.json({ success: true });
});

// POST /api/users/favorites/:targetId
router.post('/favorites/:targetId', authenticate, async (req, res) => {
    try {
        await db.query('INSERT IGNORE INTO user_favorites (user_id, target_id) VALUES (?, ?)', [req.user.id, req.params.targetId]);
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: 'SERVER_ERROR', message: err.message });
    }
});

// DELETE /api/users/favorites/:targetId
router.delete('/favorites/:targetId', authenticate, async (req, res) => {
    await db.query('DELETE FROM user_favorites WHERE user_id = ? AND target_id = ?', [req.user.id, req.params.targetId]);
    res.json({ success: true });
});

// GET /api/users/favorites
router.get('/favorites', authenticate, async (req, res) => {
    const [favorites] = await db.query(
        `SELECT u.id, u.full_name, u.email, fp.title, fp.hourly_rate, fp.avg_rating, fp.reputation_level
         FROM user_favorites uf
         JOIN users u ON uf.target_id = u.id
         LEFT JOIN freelancer_profiles fp ON u.id = fp.id
         WHERE uf.user_id = ?`,
        [req.user.id]
    );
    res.json(favorites);
});

// GET /api/users/:id/reviews
router.get('/:id/reviews', async (req, res) => {
    const [reviews] = await db.query(
        `SELECT r.*, u.full_name as reviewer_name FROM reviews r
         JOIN users u ON r.reviewer_id = u.id
         WHERE r.reviewee_id = ? ORDER BY r.created_at DESC`,
        [req.params.id]
    );
    res.json(reviews);
});

// GET /api/users/:id/response-time
router.get('/:id/response-time', async (req, res) => {
    const result = await calculateResponseTime(parseInt(req.params.id));
    res.json(result);
});

// POST /api/users/:id/video-intro
router.post('/:id/video-intro', authenticate, uploadVideo.single('video'), async (req, res) => {
    if (req.user.id !== parseInt(req.params.id)) return res.status(403).json({ error: 'FORBIDDEN' });
    if (!req.file) return res.status(422).json({ error: 'NO_FILE' });
    const url = `/uploads/videos/${req.file.filename}`;
    try {
        await db.query('UPDATE freelancer_profiles SET video_intro_url = ? WHERE id = ?', [url, req.user.id]);
        res.json({ success: true, url });
    } catch (err) {
        res.status(500).json({ error: 'SERVER_ERROR', message: err.message });
    }
});

// POST /api/users/:id/avatar — upload profile photo
const avatarStorage = multer.diskStorage({
    destination: (req, file, cb) => {
        const dir = path.join(__dirname, '../../uploads/avatars');
        if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
        cb(null, dir);
    },
    filename: (req, file, cb) => cb(null, `${Date.now()}-${req.user?.id}${path.extname(file.originalname)}`)
});
const uploadAvatar = multer({ storage: avatarStorage, limits: { fileSize: 5 * 1024 * 1024 } });

router.post('/:id/avatar', authenticate, uploadAvatar.single('avatar'), async (req, res) => {
    if (req.user.id !== parseInt(req.params.id)) return res.status(403).json({ error: 'FORBIDDEN' });
    if (!req.file) return res.status(422).json({ error: 'NO_FILE' });
    const url = `/uploads/avatars/${req.file.filename}`;
    try {
        await db.query('UPDATE freelancer_profiles SET profile_photo_url = ? WHERE id = ?', [url, req.user.id]);
        res.json({ success: true, url });
    } catch (err) {
        res.status(500).json({ error: 'SERVER_ERROR', message: err.message });
    }
});

// POST /api/users/:id/cover — upload cover photo
const coverStorage = multer.diskStorage({
    destination: (req, file, cb) => {
        const dir = path.join(__dirname, '../../uploads/covers');
        if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
        cb(null, dir);
    },
    filename: (req, file, cb) => cb(null, `${Date.now()}-${req.user?.id}${path.extname(file.originalname)}`)
});
const uploadCover = multer({ storage: coverStorage, limits: { fileSize: 10 * 1024 * 1024 } });

router.post('/:id/cover', authenticate, uploadCover.single('cover'), async (req, res) => {
    if (req.user.id !== parseInt(req.params.id)) return res.status(403).json({ error: 'FORBIDDEN' });
    if (!req.file) return res.status(422).json({ error: 'NO_FILE' });
    const url = `/uploads/covers/${req.file.filename}`;
    try {
        await db.query('UPDATE freelancer_profiles SET cover_photo_url = ? WHERE id = ?', [url, req.user.id]);
        res.json({ success: true, url });
    } catch (err) {
        res.status(500).json({ error: 'SERVER_ERROR', message: err.message });
    }
});

module.exports = router;
