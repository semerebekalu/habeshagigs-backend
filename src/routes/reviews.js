const express = require('express');
const router = express.Router();
const { db } = require('../config/db');
const { authenticate } = require('../middleware/auth');
const { recalculate } = require('../modules/reputation/reputationEngine');
const { enqueueNotification } = require('../modules/notification/notificationService');

// POST /api/reviews
router.post('/', authenticate, async (req, res) => {
    const { contract_id, reviewee_id, rating, comment } = req.body;
    if (!rating || rating < 1 || rating > 5) return res.status(422).json({ error: 'VALIDATION_ERROR', fields: { rating: 'Rating must be between 1 and 5' } });
    try {
        await db.query(
            'INSERT INTO reviews (contract_id, reviewer_id, reviewee_id, rating, comment) VALUES (?, ?, ?, ?, ?)',
            [contract_id, req.user.id, reviewee_id, rating, comment]
        );
        // Update avg_rating and recalculate reputation
        const [ratings] = await db.query('SELECT AVG(rating) as avg FROM reviews WHERE reviewee_id = ?', [reviewee_id]);
        const avg = parseFloat(ratings[0].avg).toFixed(2);
        await db.query('UPDATE freelancer_profiles SET avg_rating = ? WHERE id = ?', [avg, reviewee_id]);
        await recalculate(reviewee_id);

        await enqueueNotification(reviewee_id, 'review_received', {
            title: '⭐ New Review',
            message: `You received a ${rating}-star review`
        });
        res.status(201).json({ success: true });
    } catch (err) {
        res.status(500).json({ error: 'SERVER_ERROR', message: err.message });
    }
});

module.exports = router;
