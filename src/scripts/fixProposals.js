require('dotenv').config();
const mysql = require('mysql2/promise');

async function fix() {
    const db = await mysql.createConnection({
        host: process.env.DB_HOST || 'localhost',
        user: process.env.DB_USER || 'root',
        password: process.env.DB_PASSWORD || '',
        database: process.env.DB_NAME || 'habeshangigs'
    });

    // Fix proposals status enum
    await db.query("ALTER TABLE proposals MODIFY COLUMN status ENUM('pending','shortlisted','accepted','rejected') DEFAULT 'pending'");
    console.log('✅ Fixed proposals status ENUM');

    // Fix gigs - set freelancer_id from existing data if possible
    await db.query("UPDATE gigs SET status = 'active' WHERE status IS NULL");
    console.log('✅ Fixed gigs status defaults');

    await db.end();
    console.log('🎉 Done');
}

fix().catch(err => { console.error('❌', err.message); process.exit(1); });
