const express = require('express');
const router = express.Router();
const { db } = require('../config/db');

// GET /api/skills/search — search skills by name (for autocomplete)
router.get('/search', async (req, res) => {
    const { q } = req.query;
    if (!q || q.length < 2) {
        return res.json([]);
    }
    
    try {
        const [skills] = await db.query(
            'SELECT DISTINCT name, MIN(id) as id, category FROM skills WHERE name LIKE ? GROUP BY name, category LIMIT 20',
            [`%${q}%`]
        );
        res.json(skills);
    } catch (err) {
        console.error('Skills search error:', err);
        res.status(500).json({ error: 'SERVER_ERROR', message: err.message });
    }
});

// GET /api/skills — get all skills (simple, no caching)
router.get('/', async (req, res) => {
    try {
        const [skills] = await db.query('SELECT DISTINCT name, MIN(id) as id, category FROM skills GROUP BY name, category LIMIT 200');
        res.json(skills);
    } catch (err) {
        console.error('Skills endpoint error:', err);
        res.status(500).json({ error: 'SERVER_ERROR', message: err.message });
    }
});

module.exports = router;
