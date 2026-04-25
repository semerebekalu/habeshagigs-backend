const mysql = require('mysql2');
require('dotenv').config();

let poolConfig;

// Railway provides MYSQL_URL — support both URL and individual vars
if (process.env.MYSQL_URL) {
    poolConfig = { uri: process.env.MYSQL_URL, waitForConnections: true, connectionLimit: 10, queueLimit: 0 };
} else {
    poolConfig = {
        host: process.env.DB_HOST || '127.0.0.1',
        port: process.env.DB_PORT || 3306,
        user: process.env.DB_USER || 'root',
        password: process.env.DB_PASSWORD || '',
        database: process.env.DB_NAME || 'habeshangigs',
        waitForConnections: true,
        connectionLimit: 10,
        queueLimit: 0
    };
}

const pool = mysql.createPool(poolConfig);
const promisePool = pool.promise();

pool.getConnection((err, connection) => {
    if (err) {
        console.error('❌ MySQL connection error:', err.message);
    } else {
        console.log('✅ MySQL pool connected');
        connection.release();
    }
});

module.exports = { pool, db: promisePool };
