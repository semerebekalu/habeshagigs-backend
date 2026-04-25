const express = require('express');
const router = express.Router();
const { db } = require('../config/db');

// GET /api/contract-templates
router.get('/', async (req, res) => {
    try {
        const [templates] = await db.query('SELECT * FROM contract_templates ORDER BY id ASC');
        res.json(templates);
    } catch (err) {
        res.status(500).json({ error: 'SERVER_ERROR', message: err.message });
    }
});

// GET /api/contract-templates/:id
router.get('/:id', async (req, res) => {
    try {
        const [[template]] = await db.query('SELECT * FROM contract_templates WHERE id = ?', [req.params.id]);
        if (!template) return res.status(404).json({ error: 'NOT_FOUND' });
        res.json(template);
    } catch (err) {
        res.status(500).json({ error: 'SERVER_ERROR', message: err.message });
    }
});

module.exports = router;
