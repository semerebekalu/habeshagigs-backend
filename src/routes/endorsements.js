const express = require('express');
const router = express.Router();
const { db } = require('../config/db');
const { authenticate } = require('../middleware/auth');
const { enqueueNotification } = require('../modules/notification/notificationService');

// POST /api/endorsements
router.post('/', authenticate, async (req, res) => {
    const { freelancer_id, skill_id, contract_id } = req.body;
    if (!freelancer_id || !skill_id) return res.status(422).json({ error: 'VALIDATION_ERROR', fields: { skill_id: 'Required' } });
    if (req.user.id === parseInt(freelancer_id)) return res.status(400).json({ error: 'CANNOT_ENDORSE_SELF' });

    try {
        await db.query(
            'INSERT INTO skill_endorsements (freelancer_id, endorser_id, skill_id, contract_id) VALUES (?, ?, ?, ?)',
            [freelancer_id, req.user.id, skill_id, contract_id || null]
        );

        const [[skill]] = await db.query('SELECT name FROM skills WHERE id = ?', [skill_id]);
        await enqueueNotification(parseInt(freelancer_id), 'skill_endorsed', {
            title: '👍 Skill Endorsed',
            message: `${req.user.full_name || 'Someone'} endorsed you for ${skill?.name || 'a skill'}`
        });

        res.status(201).json({ success: true });
    } catch (err) {
        if (err.code === 'ER_DUP_ENTRY') return res.status(409).json({ error: 'ALREADY_ENDORSED' });
        res.status(500).json({ error: 'SERVER_ERROR', message: err.message });
    }
});

// GET /api/endorsements/:freelancerId
router.get('/:freelancerId', async (req, res) => {
    try {
        const [rows] = await db.query(
            `SELECT se.skill_id, s.name as skill_name, COUNT(*) as count,
                JSON_ARRAYAGG(JSON_OBJECT('id', u.id, 'name', u.full_name)) as endorsers
             FROM skill_endorsements se
             JOIN skills s ON se.skill_id = s.id
             JOIN users u ON se.endorser_id = u.id
             WHERE se.freelancer_id = ?
             GROUP BY se.skill_id, s.name
             ORDER BY count DESC`,
            [req.params.freelancerId]
        );
        res.json(rows);
    } catch (err) {
        res.status(500).json({ error: 'SERVER_ERROR', message: err.message });
    }
});

module.exports = router;
