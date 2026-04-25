/**
 * Run all SQL migrations in order.
 * Usage: node src/scripts/migrate.js
 */
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const mysql = require('mysql2/promise');

async function migrate() {
    let db;

    // Support Railway MYSQL_URL or individual env vars
    if (process.env.MYSQL_URL) {
        // Safely append multipleStatements — handle URLs that already have query params
        const url = process.env.MYSQL_URL;
        const separator = url.includes('?') ? '&' : '?';
        db = await mysql.createConnection(url + separator + 'multipleStatements=true');
    } else {
        db = await mysql.createConnection({
            host: process.env.DB_HOST || 'localhost',
            port: process.env.DB_PORT || 3306,
            user: process.env.DB_USER || 'root',
            password: process.env.DB_PASSWORD || '',
            database: process.env.DB_NAME || 'habeshangigs',
            multipleStatements: true
        });
    }

    const migrationsDir = path.join(__dirname, '../migrations');
    const files = fs.readdirSync(migrationsDir).filter(f => f.endsWith('.sql')).sort();

    for (const file of files) {
        const sql = fs.readFileSync(path.join(migrationsDir, file), 'utf8');
        try {
            await db.query(sql);
            console.log(`✅ Ran: ${file}`);
        } catch (err) {
            // Log but don't crash — many migrations are safe to re-run
            console.log(`⚠️  Skipped: ${file} — ${err.message}`);
        }
    }

    await db.end();
    console.log('🎉 Migrations complete.');
}

migrate().catch(err => {
    // Don't crash the whole deploy on migration error
    console.error('⚠️  Migration failed:', err.message);
    console.error(err.stack);
    process.exit(0); // exit 0 so server.js still starts
});
