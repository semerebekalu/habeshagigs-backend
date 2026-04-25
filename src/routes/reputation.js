const express = require('express');
const router = express.Router();
const { db } = require('../config/db');

// GET /api/reputation/:freelancerId
router.get('/:freelancerId', async (req, res) => {
    try {
        const [[profile]] = await db.query(
            `SELECT fp.*, u.full_name, u.is_verified
             FROM freelancer_profiles fp
             JOIN users u ON fp.id = u.id
             WHERE fp.id = ?`,
            [req.params.freelancerId]
        );
        if (!profile) return res.status(404).json({ error: 'NOT_FOUND' });

        const [reviews] = await db.query(
            `SELECT r.*, u.full_name as reviewer_name FROM reviews r
             JOIN users u ON r.reviewer_id = u.id
             WHERE r.reviewee_id = ? ORDER BY r.created_at DESC`,
            [req.params.freelancerId]
        );

        const [badges] = await db.query(
            `SELECT sb.*, s.name as skill_name FROM skill_badges sb
             JOIN skills s ON sb.skill_id = s.id WHERE sb.user_id = ?`,
            [req.params.freelancerId]
        );

        res.json({
            level: profile.reputation_level,
            score: profile.reputation_score,
            avg_rating: profile.avg_rating,
            completion_rate: profile.completion_rate,
            response_rate: profile.response_rate,
            total_completed: profile.total_completed,
            satisfaction_score: profile.avg_rating,
            reviews,
            badges
        });
    } catch (err) {
        res.status(500).json({ error: 'SERVER_ERROR', message: err.message });
    }
});

module.exports = router;
