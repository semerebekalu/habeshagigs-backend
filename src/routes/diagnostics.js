const express = require('express');
const router = express.Router();
const { db } = require('../config/db');

// GET /api/diagnostics/tables - Check if required tables exist
router.get('/tables', async (req, res) => {
    try {
        const tables = ['subscriptions', 'referrals', 'users'];
        const results = {};
        
        for (const table of tables) {
            const [rows] = await db.query(`SHOW TABLES LIKE '${table}'`);
            results[table] = rows.length > 0 ? 'EXISTS' : 'MISSING';
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

module.exports = router;
