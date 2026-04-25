const express = require('express');
const router = express.Router();
const { db } = require('../config/db');
const { authenticate } = require('../middleware/auth');

// GET /api/academy/certifications
router.get('/certifications', async (req, res) => {
    const [certs] = await db.query(
        `SELECT c.*, s.name as skill_name FROM certifications c
         LEFT JOIN skills s ON c.skill_id = s.id ORDER BY c.id DESC`
    );
    res.json(certs);
});

// POST /api/academy/certifications/:id/enroll
router.post('/certifications/:id/enroll', authenticate, async (req, res) => {
    const [[cert]] = await db.query('SELECT * FROM certifications WHERE id = ?', [req.params.id]);
    if (!cert) return res.status(404).json({ error: 'NOT_FOUND' });
    res.json({ success: true, message: 'Enrolled successfully. Complete the course to earn your badge.' });
});

// POST /api/academy/certifications/:id/complete
router.post('/certifications/:id/complete', authenticate, async (req, res) => {
    const [[cert]] = await db.query('SELECT * FROM certifications WHERE id = ?', [req.params.id]);
    if (!cert) return res.status(404).json({ error: 'NOT_FOUND' });
    try {
        await db.query('INSERT INTO user_certifications (user_id, certification_id) VALUES (?, ?)', [req.user.id, req.params.id]);
        if (cert.skill_id) {
            await db.query('INSERT IGNORE INTO skill_badges (skill_id, user_id) VALUES (?, ?)', [cert.skill_id, req.user.id]);
        }
        res.json({ success: true, message: 'Certification complete! Badge awarded to your profile.' });
    } catch (err) {
        res.status(500).json({ error: 'SERVER_ERROR', message: err.message });
    }
});

// GET /api/academy/resources
router.get('/resources', async (req, res) => {
    const { skill_id, free } = req.query;
    let sql = 'SELECT c.*, s.name as skill_name FROM certifications c LEFT JOIN skills s ON c.skill_id = s.id WHERE 1=1';
    const params = [];
    if (skill_id) { sql += ' AND c.skill_id = ?'; params.push(skill_id); }
    if (free === 'true') { sql += ' AND c.price = 0'; }
    const [resources] = await db.query(sql, params);
    res.json(resources);
});

module.exports = router;
