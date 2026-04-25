const express = require('express');
const router = express.Router();
const { db } = require('../config/db');
const { authenticate } = require('../middleware/auth');

// POST /api/gigs
router.post('/', authenticate, async (req, res) => {
    const { title, description, packages } = req.body;
    if (!title) return res.status(422).json({ error: 'VALIDATION_ERROR', fields: { title: 'Required' } });
    try {
        // Try with freelancer_id first, fall back to without if column doesn't exist
        let gigId;
        try {
            const [result] = await db.query(
                'INSERT INTO gigs (freelancer_id, title, description, status) VALUES (?, ?, ?, "active")',
                [req.user.id, title, description]
            );
            gigId = result.insertId;
        } catch (colErr) {
            // Old schema without freelancer_id
            const [result] = await db.query(
                'INSERT INTO gigs (title, description) VALUES (?, ?)',
                [title, description]
            );
            gigId = result.insertId;
            // Try to add freelancer_id after insert
            await db.query('UPDATE gigs SET freelancer_id = ? WHERE id = ?', [req.user.id, gigId]).catch(() => {});
        }
        if (packages && packages.length) {
            for (const pkg of packages.slice(0, 3)) {
                await db.query(
                    'INSERT INTO gig_packages (gig_id, package_type, title, description, price, delivery_days, deliverables) VALUES (?, ?, ?, ?, ?, ?, ?)',
                    [gigId, pkg.package_type, pkg.title, pkg.description, pkg.price, pkg.delivery_days, JSON.stringify(pkg.deliverables || [])]
                );
            }
        }
        res.status(201).json({ success: true, gig_id: gigId });
    } catch (err) {
        res.status(500).json({ error: 'SERVER_ERROR', message: err.message });
    }
});

// GET /api/gigs/my — freelancer's own gigs
router.get('/my', authenticate, async (req, res) => {
    try {
        const [gigs] = await db.query(
            `SELECT g.id, g.title, g.description, g.status, g.created_at,
                    COUNT(gp.id) as package_count,
                    MIN(gp.price) as min_price, MAX(gp.price) as max_price
             FROM gigs g
             LEFT JOIN gig_packages gp ON g.id = gp.gig_id
             WHERE g.freelancer_id = ? AND g.status != 'deleted'
             GROUP BY g.id ORDER BY g.created_at DESC`,
            [req.user.id]
        );
        res.json(gigs);
    } catch (err) {
        res.status(500).json({ error: 'SERVER_ERROR', message: err.message });
    }
});

// GET /api/gigs/:id
router.get('/:id', async (req, res) => {
    const [[gig]] = await db.query('SELECT g.*, u.full_name as freelancer_name FROM gigs g JOIN users u ON g.freelancer_id = u.id WHERE g.id = ?', [req.params.id]);
    if (!gig) return res.status(404).json({ error: 'GIG_NOT_FOUND' });
    const [packages] = await db.query('SELECT * FROM gig_packages WHERE gig_id = ?', [gig.id]);
    gig.packages = packages;
    res.json(gig);
});

// PUT /api/gigs/:id
router.put('/:id', authenticate, async (req, res) => {
    const { title, description, status } = req.body;
    await db.query(
        'UPDATE gigs SET title = COALESCE(?, title), description = COALESCE(?, description), status = COALESCE(?, status) WHERE id = ? AND freelancer_id = ?',
        [title, description, status, req.params.id, req.user.id]
    );
    res.json({ success: true });
});

module.exports = router;
