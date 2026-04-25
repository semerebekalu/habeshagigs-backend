/**
 * Fix auto-verified accounts — resets is_verified=0 for users
 * who were never approved through KYC.
 * Run once: node src/scripts/fixVerification.js
 */
require('dotenv').config();
const mysql = require('mysql2/promise');

async function fix() {
    const db = await mysql.createConnection({
        host: process.env.DB_HOST || 'localhost',
        user: process.env.DB_USER || 'root',
        password: process.env.DB_PASSWORD || '',
        database: process.env.DB_NAME || 'habeshangigs'
    });

    // Reset is_verified for users who have no approved KYC submission
    // but keep admin accounts verified
    const [result] = await db.query(`
        UPDATE users
        SET is_verified = 0, kyc_status = 'none'
        WHERE role != 'admin'
          AND is_verified = 1
          AND id NOT IN (
              SELECT user_id FROM kyc_submissions WHERE status = 'approved'
          )
    `);

    console.log(`✅ Reset ${result.affectedRows} auto-verified account(s) to unverified.`);
    console.log('   Admin accounts and KYC-approved accounts were left untouched.');
    await db.end();
}

fix().catch(err => { console.error('❌ Error:', err.message); process.exit(1); });
