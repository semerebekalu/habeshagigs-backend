const redis = require('redis');
require('dotenv').config();

let client = null;
let connected = false;

async function init() {
    try {
        client = redis.createClient({ url: process.env.REDIS_URL || 'redis://localhost:6379' });
        client.on('error', () => { connected = false; });
        await client.connect();
        connected = true;
        console.log('✅ Redis connected');
    } catch {
        console.warn('⚠️  Redis unavailable — token revocation disabled (OK for development)');
        client = null;
        connected = false;
    }
}

async function revokeToken(token, ttlSeconds) {
    if (!connected || !client) return;
    try { await client.set(`revoked:${token}`, '1', { EX: ttlSeconds }); } catch {}
}

async function isTokenRevoked(token) {
    if (!connected || !client) return false;
    try {
        const val = await client.get(`revoked:${token}`);
        return val !== null;
    } catch { return false; }
}

init();

module.exports = { revokeToken, isTokenRevoked };
