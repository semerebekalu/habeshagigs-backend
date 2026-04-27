// Quick test script for referral and subscription endpoints
const API_URL = process.env.API_URL || 'http://localhost:5001/api';

async function testEndpoints() {
    console.log('🧪 Testing Referral & Subscription Endpoints\n');
    
    // Test 1: Get subscription tiers (public endpoint)
    console.log('1️⃣ Testing GET /subscriptions/tiers (public)');
    try {
        const res = await fetch(`${API_URL}/subscriptions/tiers`);
        const data = await res.json();
        console.log('✅ Tiers endpoint works:', Object.keys(data));
    } catch (err) {
        console.log('❌ Tiers endpoint failed:', err.message);
    }
    
    // Test 2: Check if routes are registered
    console.log('\n2️⃣ Checking route registration in server.js');
    const fs = require('fs');
    const serverContent = fs.readFileSync('./server.js', 'utf8');
    
    const hasSubscriptions = serverContent.includes("require('./src/routes/subscriptions')");
    const hasReferrals = serverContent.includes("require('./src/routes/referrals')");
    
    console.log('Subscriptions route registered:', hasSubscriptions ? '✅' : '❌');
    console.log('Referrals route registered:', hasReferrals ? '✅' : '❌');
    
    // Test 3: Check if .router is exported correctly
    console.log('\n3️⃣ Checking module exports');
    try {
        const subsModule = require('./src/routes/subscriptions');
        const refsModule = require('./src/routes/referrals');
        console.log('Subscriptions exports:', Object.keys(subsModule));
        console.log('Referrals exports:', Object.keys(refsModule));
    } catch (err) {
        console.log('❌ Module import failed:', err.message);
    }
    
    // Test 4: Check database tables
    console.log('\n4️⃣ Checking database tables');
    try {
        const { db } = require('./src/config/db');
        const [tables] = await db.query("SHOW TABLES LIKE 'subscriptions'");
        console.log('subscriptions table exists:', tables.length > 0 ? '✅' : '❌');
        
        const [tables2] = await db.query("SHOW TABLES LIKE 'referrals'");
        console.log('referrals table exists:', tables2.length > 0 ? '✅' : '❌');
        
        const [cols] = await db.query("SHOW COLUMNS FROM users LIKE 'referral_code'");
        console.log('users.referral_code column exists:', cols.length > 0 ? '✅' : '❌');
        
        await db.end();
    } catch (err) {
        console.log('❌ Database check failed:', err.message);
    }
}

testEndpoints().catch(console.error);
