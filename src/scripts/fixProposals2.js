require('dotenv').config();
const { db } = require('../config/db');

async function fix() {
    try {
        const sql = "ALTER TABLE proposals MODIFY COLUMN status ENUM('pending','shortlisted','accepted','rejected') DEFAULT 'pending'";
        await db.query(sql);
        console.log('Fixed proposals status ENUM');
    } catch(e) {
        console.log('proposals fix:', e.message);
    }
    try {
        await db.query("UPDATE gigs SET status = 'active' WHERE status IS NULL");
        console.log('Fixed gigs status');
    } catch(e) {
        console.log('gigs fix:', e.message);
    }
    process.exit(0);
}

setTimeout(fix, 500);
