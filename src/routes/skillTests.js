const express = require('express');
const router = express.Router();
const { db } = require('../config/db');
const { authenticate } = require('../middleware/auth');

// Minimal skill test questions (in production these come from a DB table)
const SAMPLE_QUESTIONS = {
    default: [
        { q: 'What does HTML stand for?', options: ['HyperText Markup Language', 'High Tech Modern Language', 'Home Tool Markup Language'], answer: 0 },
        { q: 'Which is a JavaScript framework?', options: ['Django', 'React', 'Laravel'], answer: 1 },
        { q: 'What does CSS stand for?', options: ['Cascading Style Sheets', 'Computer Style Sheets', 'Creative Style System'], answer: 0 },
    ]
};

// POST /api/skill-tests/:skillId/start
router.post('/:skillId/start', authenticate, async (req, res) => {
    const questions = SAMPLE_QUESTIONS.default.map(q => ({ q: q.q, options: q.options }));
    res.json({ attempt_id: `${req.user.id}_${req.params.skillId}_${Date.now()}`, questions, skill_id: req.params.skillId });
});

// POST /api/skill-tests/:attemptId/submit
router.post('/:attemptId/submit', authenticate, async (req, res) => {
    const { answers, skill_id } = req.body;
    const questions = SAMPLE_QUESTIONS.default;
    let correct = 0;
    (answers || []).forEach((ans, i) => { if (questions[i] && ans === questions[i].answer) correct++; });
    const passed = correct >= Math.ceil(questions.length * 0.7);

    if (passed && skill_id) {
        await db.query('INSERT IGNORE INTO skill_badges (skill_id, user_id) VALUES (?, ?)', [skill_id, req.user.id]);
    }
    res.json({ passed, score: `${correct}/${questions.length}`, badge_awarded: passed });
});

// GET /api/skill-badges/:userId
router.get('/badges/:userId', async (req, res) => {
    const [badges] = await db.query(
        `SELECT sb.*, s.name as skill_name FROM skill_badges sb
         JOIN skills s ON sb.skill_id = s.id WHERE sb.user_id = ?`,
        [req.params.userId]
    );
    res.json(badges);
});

module.exports = router;
