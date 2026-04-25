/**
 * Seed script — creates the default admin account.
 * Run once: node src/scripts/seedAdmin.js
 */
require('dotenv').config();
const bcrypt = require('bcrypt');
const mysql = require('mysql2/promise');

const ADMIN_EMAIL = 'admin@ethiogigs.com';
const ADMIN_PASSWORD = 'Admin@2026';
const ADMIN_NAME = 'Ethio Gigs Admin';

async function seed() {
    const db = await mysql.createConnection({
        host: process.env.DB_HOST || 'localhost',
        user: process.env.DB_USER || 'root',
        password: process.env.DB_PASSWORD || '',
        database: process.env.DB_NAME || 'habeshangigs'
    });

    const [existing] = await db.query('SELECT id FROM users WHERE email = ?', [ADMIN_EMAIL]);
    if (existing.length > 0) {
        console.log('✅ Admin account already exists.');
        await db.end();
        return;
    }

    const hash = await bcrypt.hash(ADMIN_PASSWORD, 10);
    const [result] = await db.query(
        `INSERT INTO users (full_name, email, password_hash, role, active_role, is_verified, kyc_status)
         VALUES (?, ?, ?, 'admin', 'client', 1, 'approved')`,
        [ADMIN_NAME, ADMIN_EMAIL, hash]
    );

    console.log('');
    console.log('🎉 Admin account created successfully!');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('  Email    : admin@ethiogigs.com');
    console.log('  Password : Admin@2026');
    console.log('  User ID  :', result.insertId);
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('');

    await db.end();
}

seed().catch(err => {
    console.error('❌ Seed failed:', err.message);
    process.exit(1);
});
