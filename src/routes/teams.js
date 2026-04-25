const express = require('express');
const router = express.Router();
const { db } = require('../config/db');
const { authenticate } = require('../middleware/auth');

// POST /api/teams
router.post('/', authenticate, async (req, res) => {
    const { name, description } = req.body;
    if (!name) return res.status(422).json({ error: 'VALIDATION_ERROR', fields: { name: 'Required' } });
    try {
        const [result] = await db.query(
            'INSERT INTO teams (name, description, owner_id) VALUES (?, ?, ?)',
            [name, description || null, req.user.id]
        );
        // Add owner as member
        await db.query(
            'INSERT INTO team_members (team_id, user_id, role) VALUES (?, ?, "owner")',
            [result.insertId, req.user.id]
        );
        res.status(201).json({ success: true, team_id: result.insertId });
    } catch (err) {
        res.status(500).json({ error: 'SERVER_ERROR', message: err.message });
    }
});

// GET /api/teams/my
router.get('/my', authenticate, async (req, res) => {
    try {
        const [teams] = await db.query(
            `SELECT t.*, tm.role FROM teams t
             JOIN team_members tm ON t.id = tm.team_id
             WHERE tm.user_id = ?
             ORDER BY t.created_at DESC`,
            [req.user.id]
        );
        res.json(teams);
    } catch (err) {
        res.status(500).json({ error: 'SERVER_ERROR', message: err.message });
    }
});

// GET /api/teams/:id
router.get('/:id', async (req, res) => {
    try {
        const [[team]] = await db.query('SELECT * FROM teams WHERE id = ?', [req.params.id]);
        if (!team) return res.status(404).json({ error: 'NOT_FOUND' });
        const [members] = await db.query(
            `SELECT u.id, u.full_name, u.email, tm.role, tm.joined_at
             FROM team_members tm JOIN users u ON tm.user_id = u.id
             WHERE tm.team_id = ?`,
            [req.params.id]
        );
        team.members = members;
        res.json(team);
    } catch (err) {
        res.status(500).json({ error: 'SERVER_ERROR', message: err.message });
    }
});

// POST /api/teams/:id/members — invite by email
router.post('/:id/members', authenticate, async (req, res) => {
    const { email } = req.body;
    try {
        const [[team]] = await db.query('SELECT * FROM teams WHERE id = ? AND owner_id = ?', [req.params.id, req.user.id]);
        if (!team) return res.status(403).json({ error: 'FORBIDDEN' });
        const [[user]] = await db.query('SELECT id FROM users WHERE email = ?', [email]);
        if (!user) return res.status(404).json({ error: 'USER_NOT_FOUND' });
        await db.query(
            'INSERT IGNORE INTO team_members (team_id, user_id, role) VALUES (?, ?, "member")',
            [req.params.id, user.id]
        );
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: 'SERVER_ERROR', message: err.message });
    }
});

// DELETE /api/teams/:id/members/:userId
router.delete('/:id/members/:userId', authenticate, async (req, res) => {
    try {
        const [[team]] = await db.query('SELECT * FROM teams WHERE id = ? AND owner_id = ?', [req.params.id, req.user.id]);
        if (!team) return res.status(403).json({ error: 'FORBIDDEN' });
        await db.query('DELETE FROM team_members WHERE team_id = ? AND user_id = ?', [req.params.id, req.params.userId]);
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: 'SERVER_ERROR', message: err.message });
    }
});

module.exports = router;
