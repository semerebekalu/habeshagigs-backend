const express = require('express');
const router = express.Router();
const { db } = require('../config/db');
const { authenticate } = require('../middleware/auth');
const { recalculate } = require('../modules/reputation/reputationEngine');
const { enqueueNotification } = require('../modules/notification/notificationService');

// POST /api/reviews
router.post('/', authenticate, async (req, res) => {
    const { contract_id, reviewee_id, rating, comment } = req.body;

    if (!contract_id || !reviewee_id) {
        return res.status(422).json({ error: 'VALIDATION_ERROR', message: 'contract_id and reviewee_id are required' });
    }
    if (!rating || rating < 1 || rating > 5) {
        return res.status(422).json({ error: 'VALIDATION_ERROR', fields: { rating: 'Rating must be between 1 and 5' } });
    }
    if (comment && comment.length > 1000) {
        return res.status(422).json({ error: 'VALIDATION_ERROR', fields: { comment: 'Comment must be under 1000 characters' } });
    }

    try {
        // Contract must exist and be completed
        const [[contract]] = await db.query('SELECT * FROM contracts WHERE id = ?', [contract_id]);
        if (!contract) return res.status(404).json({ error: 'CONTRACT_NOT_FOUND' });

        if (contract.status !== 'completed') {
            return res.status(400).json({
                error: 'CONTRACT_NOT_COMPLETED',
                message: 'Reviews can only be submitted after a contract is completed.'
            });
        }

        // Reviewer must be a participant
        const isClient = req.user.id === contract.client_id;
        const isFreelancer = req.user.id === contract.freelancer_id;
        if (!isClient && !isFreelancer) {
            return res.status(403).json({ error: 'FORBIDDEN', message: 'Only contract participants can leave reviews' });
        }

        // Reviewee must be the other participant
        const validReviewee = isClient
            ? parseInt(reviewee_id) === contract.freelancer_id
            : parseInt(reviewee_id) === contract.client_id;
        if (!validReviewee) {
            return res.status(400).json({ error: 'INVALID_REVIEWEE', message: 'You can only review the other party in this contract' });
        }

        // One review per reviewer per contract
        const [[existing]] = await db.query(
            'SELECT id FROM reviews WHERE contract_id = ? AND reviewer_id = ?',
            [contract_id, req.user.id]
        );
        if (existing) {
            return res.status(409).json({
                error: 'REVIEW_ALREADY_SUBMITTED',
                message: 'You have already submitted a review for this contract'
            });
        }

        // Reviews must be submitted within 30 days of completion
        if (contract.completed_at) {
            const daysSinceCompletion = (Date.now() - new Date(contract.completed_at).getTime()) / (1000 * 60 * 60 * 24);
            if (daysSinceCompletion > 30) {
                return res.status(400).json({
                    error: 'REVIEW_WINDOW_EXPIRED',
                    message: 'Reviews must be submitted within 30 days of contract completion'
                });
            }
        }

        await db.query(
            'INSERT INTO reviews (contract_id, reviewer_id, reviewee_id, rating, comment) VALUES (?, ?, ?, ?, ?)',
            [contract_id, req.user.id, reviewee_id, rating, comment || null]
        );

        // Update avg_rating on freelancer profile (only freelancers have profiles)
        const [[reviewee]] = await db.query('SELECT role FROM users WHERE id = ?', [reviewee_id]);
        if (reviewee?.role === 'freelancer') {
            const [[{ avg }]] = await db.query('SELECT AVG(rating) as avg FROM reviews WHERE reviewee_id = ?', [reviewee_id]);
            await db.query('UPDATE freelancer_profiles SET avg_rating = ? WHERE id = ?', [parseFloat(avg).toFixed(2), reviewee_id]);
            await recalculate(reviewee_id).catch(() => {});
        }

        await enqueueNotification(reviewee_id, 'review_received', {
            title: '⭐ New Review',
            message: `You received a ${rating}-star review for contract #${contract_id}`
        }).catch(() => {});

        res.status(201).json({ success: true });
    } catch (err) {
        res.status(500).json({ error: 'SERVER_ERROR', message: err.message });
    }
});

// GET /api/reviews/user/:userId — get all reviews for a user
router.get('/user/:userId', async (req, res) => {
    try {
        const [reviews] = await db.query(
            `SELECT r.id, r.rating, r.comment, r.created_at,
                    u.full_name as reviewer_name, u.id as reviewer_id,
                    j.title as job_title
             FROM reviews r
             JOIN users u ON r.reviewer_id = u.id
             LEFT JOIN contracts c ON r.contract_id = c.id
             LEFT JOIN jobs j ON c.job_id = j.id
             WHERE r.reviewee_id = ?
             ORDER BY r.created_at DESC`,
            [req.params.userId]
        );
        const [[{ avg, total }]] = await db.query(
            'SELECT AVG(rating) as avg, COUNT(*) as total FROM reviews WHERE reviewee_id = ?',
            [req.params.userId]
        );
        res.json({ reviews, avg_rating: avg ? parseFloat(avg).toFixed(2) : null, total_reviews: total });
    } catch (err) {
        res.status(500).json({ error: 'SERVER_ERROR', message: err.message });
    }
});

// GET /api/reviews/contract/:contractId — check review status for a contract
router.get('/contract/:contractId', authenticate, async (req, res) => {
    try {
        const [reviews] = await db.query(
            'SELECT reviewer_id, reviewee_id, rating, comment, created_at FROM reviews WHERE contract_id = ?',
            [req.params.contractId]
        );
        const myReview = reviews.find(r => r.reviewer_id === req.user.id);
        res.json({ reviews, my_review: myReview || null, can_review: !myReview });
    } catch (err) {
        res.status(500).json({ error: 'SERVER_ERROR', message: err.message });
    }
});

module.exports = router;
