const express = require('express');
const router = express.Router();
const { db } = require('../config/db');
const { authenticate } = require('../middleware/auth');

// POST /api/job-alerts
router.post('/', authenticate, async (req, res) => {
    const { skill_id, category, min_budget } = req.body;
    try {
        const [result] = await db.query(
            'INSERT INTO job_alerts (freelancer_id, skill_id, category, min_budget) VALUES (?, ?, ?, ?)',
            [req.user.id, skill_id || null, category || null, min_budget || 0]
        );
        res.status(201).json({ success: true, id: result.insertId });
    } catch (err) {
        res.status(500).json({ error: 'SERVER_ERROR', message: err.message });
    }
});

// GET /api/job-alerts
router.get('/', authenticate, async (req, res) => {
    try {
        const [alerts] = await db.query(
            `SELECT ja.*, s.name as skill_name FROM job_alerts ja
             LEFT JOIN skills s ON ja.skill_id = s.id
             WHERE ja.freelancer_id = ? AND ja.is_active = 1
             ORDER BY ja.created_at DESC`,
            [req.user.id]
        );
        res.json(alerts);
    } catch (err) {
        res.status(500).json({ error: 'SERVER_ERROR', message: err.message });
    }
});

// DELETE /api/job-alerts/:id
router.delete('/:id', authenticate, async (req, res) => {
    await db.query('UPDATE job_alerts SET is_active = 0 WHERE id = ? AND freelancer_id = ?', [req.params.id, req.user.id]);
    res.json({ success: true });
});

module.exports = router;
