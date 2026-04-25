const mysql = require('mysql2');
require('dotenv').config();

const pool = mysql.createPool({
    host: process.env.DB_HOST || '127.0.0.1',
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'habeshangigs',
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0
});

const promisePool = pool.promise();

pool.getConnection((err, connection) => {
    if (err) {
        console.error('❌ MySQL pool connection error:', err.message);
    } else {
        console.log('✅ MySQL pool connected to', process.env.DB_NAME || 'habeshangigs');
        connection.release();
    }
});

module.exports = { pool, db: promisePool };
