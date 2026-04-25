/**
 * Run all SQL migrations in order.
 * Usage: node src/scripts/migrate.js
 */
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const mysql = require('mysql2/promise');

async function migrate() {
    const db = await mysql.createConnection({
        host: process.env.DB_HOST || 'localhost',
        user: process.env.DB_USER || 'root',
        password: process.env.DB_PASSWORD || '',
        database: process.env.DB_NAME || 'habeshangigs',
        multipleStatements: true
    });

    const migrationsDir = path.join(__dirname, '../migrations');
    const files = fs.readdirSync(migrationsDir).filter(f => f.endsWith('.sql')).sort();

    for (const file of files) {
        const sql = fs.readFileSync(path.join(migrationsDir, file), 'utf8');
        try {
            await db.query(sql);
            console.log(`✅ Ran: ${file}`);
        } catch (err) {
            console.error(`❌ Failed: ${file} — ${err.message}`);
        }
    }

    await db.end();
    console.log('\n🎉 All migrations complete.');
}

migrate().catch(err => {
    console.error('❌ Migration error:', err.message);
    process.exit(1);
});
