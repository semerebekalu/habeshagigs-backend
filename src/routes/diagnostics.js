const express = require('express');
const router = express.Router();
const { db } = require('../config/db');

// GET /api/diagnostics/tables - Check if required tables exist
router.get('/tables', async (req, res) => {
    try {
        const tables = ['subscriptions', 'referrals', 'users', 'skills'];
        const results = {};
        
        for (const table of tables) {
            const [rows] = await db.query(`SHOW TABLES LIKE '${table}'`);
            results[table] = rows.length > 0 ? 'EXISTS' : 'MISSING';
            
            // If skills table exists, count rows
            if (table === 'skills' && rows.length > 0) {
                const [[{count}]] = await db.query('SELECT COUNT(*) as count FROM skills');
                results['skills_count'] = count;
            }
        }
        
        // Check if users table has referral columns
        try {
            const [cols] = await db.query("SHOW COLUMNS FROM users LIKE 'referral_code'");
            results['users.referral_code'] = cols.length > 0 ? 'EXISTS' : 'MISSING';
            
            const [cols2] = await db.query("SHOW COLUMNS FROM users LIKE 'referred_by'");
            results['users.referred_by'] = cols2.length > 0 ? 'EXISTS' : 'MISSING';
        } catch (err) {
            results['users_columns'] = 'ERROR: ' + err.message;
        }
        
        res.json({ status: 'ok', tables: results });
    } catch (err) {
        res.status(500).json({ error: 'DATABASE_ERROR', message: err.message });
    }
});

// GET /api/diagnostics/skills-test - Test skills query directly
router.get('/skills-test', async (req, res) => {
    try {
        const [skills] = await db.query('SELECT id, name, category FROM skills LIMIT 10');
        res.json({ status: 'ok', count: skills.length, sample: skills });
    } catch (err) {
        res.status(500).json({ error: 'DATABASE_ERROR', message: err.message, stack: err.stack });
    }
});

module.exports = router;
