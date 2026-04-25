const express = require('express');
const router = express.Router();
const { db } = require('../config/db');
const { authenticate } = require('../middleware/auth');
const { enqueueNotification } = require('../modules/notification/notificationService');

// POST /api/jobs
router.post('/', authenticate, async (req, res) => {
    const { title, description, budget_min, budget_max, project_type, deadline, skill_ids, looking_for_team, team_size } = req.body;
    if (!title) return res.status(422).json({ error: 'VALIDATION_ERROR', fields: { title: 'Required' } });
    try {
        const [result] = await db.query(
            'INSERT INTO jobs (client_id, title, description, budget_min, budget_max, project_type, deadline, looking_for_team, team_size) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
            [req.user.id, title, description, budget_min || 0, budget_max || 0, project_type || 'fixed', deadline || null, looking_for_team ? 1 : 0, team_size || 1]
        );
        const jobId = result.insertId;
        if (skill_ids && skill_ids.length) {
            for (const sid of skill_ids) {
                await db.query('INSERT IGNORE INTO job_skills (job_id, skill_id) VALUES (?, ?)', [jobId, sid]);
            }
        }
        res.status(201).json({ success: true, job_id: jobId });

        // Trigger job alerts asynchronously
        setImmediate(async () => {
            try {
                const [alerts] = await db.query(
                    `SELECT DISTINCT ja.freelancer_id FROM job_alerts ja
                     LEFT JOIN job_skills js ON js.job_id = ?
                     WHERE ja.is_active = 1
                       AND (ja.skill_id IS NULL OR ja.skill_id = js.skill_id)
                       AND (ja.category IS NULL OR ja.category = ?)
                       AND (ja.min_budget = 0 OR ja.min_budget <= ?)`,
                    [jobId, null, budget_max || 0]
                );
                for (const alert of alerts) {
                    await enqueueNotification(alert.freelancer_id, 'job_alert', {
                        title: '🔔 New Job Alert',
                        message: `A new job matching your alert was posted: "${title}"`
                    });
                }
            } catch {}
        });
    } catch (err) {
        res.status(500).json({ error: 'SERVER_ERROR', message: err.message });
    }
});

// GET /api/jobs
router.get('/', async (req, res) => {
    const { status, client_id, keyword, project_type, budget_min, budget_max } = req.query;
    let sql = `SELECT j.*, u.full_name as client_name,
                      (j.is_promoted = 1 AND (j.promoted_until IS NULL OR j.promoted_until > NOW())) as is_active_promoted
               FROM jobs j JOIN users u ON j.client_id = u.id WHERE 1=1`;
    const params = [];
    if (status) { sql += ' AND j.status = ?'; params.push(status); }
    if (client_id) { sql += ' AND j.client_id = ?'; params.push(client_id); }
    if (keyword) { sql += ' AND (j.title LIKE ? OR j.description LIKE ?)'; params.push(`%${keyword}%`, `%${keyword}%`); }
    if (project_type) { sql += ' AND j.project_type = ?'; params.push(project_type); }
    if (budget_min) { sql += ' AND j.budget_max >= ?'; params.push(budget_min); }
    if (budget_max) { sql += ' AND j.budget_min <= ?'; params.push(budget_max); }
    // Promoted jobs first, then by recency
    sql += ' ORDER BY is_active_promoted DESC, j.id DESC';
    const [jobs] = await db.query(sql, params);
    res.json(jobs);
});

// GET /api/jobs/:id
router.get('/:id', async (req, res) => {
    const [[job]] = await db.query('SELECT j.*, u.full_name as client_name FROM jobs j JOIN users u ON j.client_id = u.id WHERE j.id = ?', [req.params.id]);
    if (!job) return res.status(404).json({ error: 'JOB_NOT_FOUND' });
    const [skills] = await db.query('SELECT s.* FROM skills s JOIN job_skills js ON s.id = js.skill_id WHERE js.job_id = ?', [job.id]);
    job.skills = skills;
    res.json(job);
});

// PUT /api/jobs/:id
router.put('/:id', authenticate, async (req, res) => {
    const { title, description, budget_min, budget_max, status, deadline } = req.body;
    await db.query(
        'UPDATE jobs SET title = COALESCE(?, title), description = COALESCE(?, description), budget_min = COALESCE(?, budget_min), budget_max = COALESCE(?, budget_max), status = COALESCE(?, status), deadline = COALESCE(?, deadline) WHERE id = ? AND client_id = ?',
        [title, description, budget_min, budget_max, status, deadline, req.params.id, req.user.id]
    );
    res.json({ success: true });
});

// POST /api/jobs/:id/promote — pay to boost a job to the top of listings
router.post('/:id/promote', authenticate, async (req, res) => {
    const { days = 7 } = req.body;
    if (days < 1 || days > 30) return res.status(422).json({ error: 'VALIDATION_ERROR', message: 'Days must be 1–30' });

    const PROMOTE_COST_PER_DAY = 20; // 20 ETB/day
    const totalCost = PROMOTE_COST_PER_DAY * days;

    try {
        const [[job]] = await db.query('SELECT * FROM jobs WHERE id = ? AND client_id = ?', [req.params.id, req.user.id]);
        if (!job) return res.status(404).json({ error: 'JOB_NOT_FOUND' });

        const [[user]] = await db.query('SELECT wallet_balance FROM users WHERE id = ?', [req.user.id]);
        if (parseFloat(user.wallet_balance) < totalCost) {
            return res.status(400).json({
                error: 'INSUFFICIENT_BALANCE',
                message: `Promoting for ${days} day(s) costs ${totalCost} ETB. Top up your wallet first.`,
                required: totalCost,
                current_balance: parseFloat(user.wallet_balance)
            });
        }

        const promotedUntil = new Date();
        promotedUntil.setDate(promotedUntil.getDate() + days);

        await db.query('UPDATE users SET wallet_balance = wallet_balance - ? WHERE id = ?', [totalCost, req.user.id]);
        await db.query('UPDATE jobs SET is_promoted = 1, promoted_until = ? WHERE id = ?', [promotedUntil, req.params.id]);
        await db.query(
            'INSERT INTO promoted_jobs (job_id, client_id, promoted_until, amount_paid) VALUES (?, ?, ?, ?)',
            [req.params.id, req.user.id, promotedUntil, totalCost]
        );
        await db.query(
            "INSERT INTO transactions (user_id, type, amount, method, status) VALUES (?, 'fee', ?, 'wallet', 'completed')",
            [req.user.id, totalCost]
        );

        res.json({
            success: true,
            promoted_until: promotedUntil,
            amount_paid: totalCost,
            message: `Job promoted for ${days} day(s) — it will appear at the top of listings until ${promotedUntil.toLocaleDateString()}`
        });
    } catch (err) {
        res.status(500).json({ error: 'SERVER_ERROR', message: err.message });
    }
});

// DELETE /api/jobs/:id
router.delete('/:id', authenticate, async (req, res) => {
    await db.query("UPDATE jobs SET status = 'cancelled' WHERE id = ? AND client_id = ?", [req.params.id, req.user.id]);
    res.json({ success: true });
});

module.exports = router;
