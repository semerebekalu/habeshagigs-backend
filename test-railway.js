/**
 * Railway Deployment Test Script
 * Tests the deployed endpoints on Railway
 */

const https = require('https');

const RAILWAY_URL = process.env.RAILWAY_URL || 'https://habeshagigs.up.railway.app';

// Helper to make HTTPS requests
function request(method, path, body = null, token = null) {
    return new Promise((resolve, reject) => {
        const url = new URL(path, RAILWAY_URL);
        const options = {
            method,
            hostname: url.hostname,
            port: url.port || 443,
            path: url.pathname + url.search,
            headers: {
                'Content-Type': 'application/json',
            }
        };

        if (token) {
            options.headers['Authorization'] = `Bearer ${token}`;
        }

        const req = https.request(options, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => {
                try {
                    const parsed = JSON.parse(data);
                    resolve({ status: res.statusCode, data: parsed });
                } catch {
                    resolve({ status: res.statusCode, data });
                }
            });
        });

        req.on('error', reject);
        if (body) req.write(JSON.stringify(body));
        req.end();
    });
}

async function testMarketplaceSearch() {
    console.log('\n╔════════════════════════════════════════════════════════════╗');
    console.log('║  Testing Marketplace Search on Railway                    ║');
    console.log('╚════════════════════════════════════════════════════════════╝\n');
    console.log(`URL: ${RAILWAY_URL}\n`);

    // Test 1: Basic search
    console.log('Test 1: Basic marketplace search');
    try {
        const result = await request('GET', '/api/marketplace');
        console.log(`Status: ${result.status}`);
        if (result.status === 200) {
            console.log(`Results: ${Array.isArray(result.data) ? result.data.length : 0} freelancers`);
            if (result.data.length > 0) {
                console.log('Sample freelancer:', {
                    name: result.data[0].full_name,
                    title: result.data[0].title,
                    rate: result.data[0].hourly_rate,
                    rating: result.data[0].avg_rating,
                    verified: result.data[0].is_verified === 1
                });
            }
            console.log('✅ PASS\n');
        } else {
            console.log('❌ FAIL:', result.data);
            console.log();
        }
    } catch (err) {
        console.log('❌ ERROR:', err.message);
        console.log();
    }

    // Test 2: Price filter
    console.log('Test 2: Price range filter (min_rate=10, max_rate=50)');
    try {
        const result = await request('GET', '/api/marketplace?min_rate=10&max_rate=50');
        console.log(`Status: ${result.status}`);
        if (result.status === 200) {
            console.log(`Results: ${Array.isArray(result.data) ? result.data.length : 0} freelancers`);
            const allInRange = result.data.every(f => f.hourly_rate >= 10 && f.hourly_rate <= 50);
            console.log(`All in price range: ${allInRange}`);
            console.log(allInRange ? '✅ PASS\n' : '❌ FAIL: Some results out of range\n');
        } else {
            console.log('❌ FAIL:', result.data);
            console.log();
        }
    } catch (err) {
        console.log('❌ ERROR:', err.message);
        console.log();
    }

    // Test 3: Rating filter
    console.log('Test 3: Minimum rating filter (min_rating=4.0)');
    try {
        const result = await request('GET', '/api/marketplace?min_rating=4.0');
        console.log(`Status: ${result.status}`);
        if (result.status === 200) {
            console.log(`Results: ${Array.isArray(result.data) ? result.data.length : 0} freelancers`);
            const allHighRated = result.data.every(f => f.avg_rating >= 4.0);
            console.log(`All rated >= 4.0: ${allHighRated}`);
            console.log(allHighRated ? '✅ PASS\n' : '❌ FAIL: Some results below 4.0\n');
        } else {
            console.log('❌ FAIL:', result.data);
            console.log();
        }
    } catch (err) {
        console.log('❌ ERROR:', err.message);
        console.log();
    }

    // Test 4: Verified filter
    console.log('Test 4: Verified freelancers only');
    try {
        const result = await request('GET', '/api/marketplace?verified=true');
        console.log(`Status: ${result.status}`);
        if (result.status === 200) {
            console.log(`Results: ${Array.isArray(result.data) ? result.data.length : 0} freelancers`);
            const allVerified = result.data.every(f => f.is_verified === 1);
            console.log(`All verified: ${allVerified}`);
            console.log(allVerified ? '✅ PASS\n' : '❌ FAIL: Some unverified results\n');
        } else {
            console.log('❌ FAIL:', result.data);
            console.log();
        }
    } catch (err) {
        console.log('❌ ERROR:', err.message);
        console.log();
    }

    // Test 5: Keyword search
    console.log('Test 5: Keyword search (keyword=developer)');
    try {
        const result = await request('GET', '/api/marketplace?keyword=developer');
        console.log(`Status: ${result.status}`);
        if (result.status === 200) {
            console.log(`Results: ${Array.isArray(result.data) ? result.data.length : 0} freelancers`);
            console.log('✅ PASS\n');
        } else {
            console.log('❌ FAIL:', result.data);
            console.log();
        }
    } catch (err) {
        console.log('❌ ERROR:', err.message);
        console.log();
    }

    // Test 6: Combined filters
    console.log('Test 6: Combined filters (min_rate=15, min_rating=3.5, verified=true)');
    try {
        const result = await request('GET', '/api/marketplace?min_rate=15&min_rating=3.5&verified=true');
        console.log(`Status: ${result.status}`);
        if (result.status === 200) {
            console.log(`Results: ${Array.isArray(result.data) ? result.data.length : 0} freelancers`);
            console.log('✅ PASS\n');
        } else {
            console.log('❌ FAIL:', result.data);
            console.log();
        }
    } catch (err) {
        console.log('❌ ERROR:', err.message);
        console.log();
    }
}

async function testAvailabilityCalendar() {
    console.log('\n╔════════════════════════════════════════════════════════════╗');
    console.log('║  Testing Availability Calendar on Railway                 ║');
    console.log('╚════════════════════════════════════════════════════════════╝\n');

    const token = process.env.TOKEN;
    const userId = process.env.USER_ID || '1';

    if (!token) {
        console.log('⚠️  SKIP: No TOKEN provided.\n');
        console.log('To test availability calendar:');
        console.log('1. Login to get JWT token:');
        console.log(`   curl -X POST ${RAILWAY_URL}/api/auth/login \\`);
        console.log('     -H "Content-Type: application/json" \\');
        console.log('     -d \'{"email": "your@email.com", "password": "yourpassword"}\'\n');
        console.log('2. Run this script with token:');
        console.log('   TOKEN=your_jwt_token USER_ID=your_user_id node test-railway.js\n');
        return;
    }

    // Test 1: Set availability
    console.log('Test 1: Set availability for multiple dates');
    try {
        const dates = [
            { date: '2026-05-01', is_available: true },
            { date: '2026-05-02', is_available: true },
            { date: '2026-05-03', is_available: false }
        ];
        const result = await request('PUT', `/api/users/${userId}/availability`, { dates }, token);
        console.log(`Status: ${result.status}`);
        console.log('Response:', result.data);
        console.log(result.status === 200 ? '✅ PASS\n' : '❌ FAIL\n');
    } catch (err) {
        console.log('❌ ERROR:', err.message);
        console.log();
    }

    // Test 2: Get availability
    console.log('Test 2: Get availability for date range');
    try {
        const result = await request('GET', `/api/users/${userId}/availability?start_date=2026-05-01&end_date=2026-05-05`);
        console.log(`Status: ${result.status}`);
        if (result.status === 200) {
            console.log(`Results: ${Array.isArray(result.data) ? result.data.length : 0} dates`);
            if (result.data.length > 0) {
                console.log('Sample:', result.data.slice(0, 3));
            }
            console.log('✅ PASS\n');
        } else {
            console.log('❌ FAIL:', result.data);
            console.log();
        }
    } catch (err) {
        console.log('❌ ERROR:', err.message);
        console.log();
    }

    // Test 3: Invalid date format
    console.log('Test 3: Invalid date format (should fail with 422)');
    try {
        const result = await request('PUT', `/api/users/${userId}/availability`, {
            dates: [{ date: '05-01-2026', is_available: true }]
        }, token);
        console.log(`Status: ${result.status}`);
        console.log('Response:', result.data);
        console.log(result.status === 422 ? '✅ PASS (correctly rejected)\n' : '❌ FAIL (should reject invalid format)\n');
    } catch (err) {
        console.log('❌ ERROR:', err.message);
        console.log();
    }
}

async function runTests() {
    console.log('\n╔════════════════════════════════════════════════════════════╗');
    console.log('║  Railway Deployment Test Suite                            ║');
    console.log('╚════════════════════════════════════════════════════════════╝');
    console.log(`\nTesting: ${RAILWAY_URL}`);
    console.log(`Time: ${new Date().toISOString()}\n`);

    try {
        await testMarketplaceSearch();
        await testAvailabilityCalendar();

        console.log('\n╔════════════════════════════════════════════════════════════╗');
        console.log('║  Test Suite Complete                                       ║');
        console.log('╚════════════════════════════════════════════════════════════╝\n');
        
        console.log('Next steps:');
        console.log('1. Review test results above');
        console.log('2. Check Railway logs for any errors: railway logs');
        console.log('3. Verify database migration: Check availability_calendar table');
        console.log('4. Test from frontend application\n');
    } catch (error) {
        console.error('\n❌ Test suite error:', error.message);
        console.error('\nTroubleshooting:');
        console.error('1. Check if Railway deployment is complete');
        console.error('2. Verify database is running');
        console.error('3. Check Railway logs: railway logs');
        console.error('4. Ensure migration was run: railway run npm run migrate\n');
        process.exit(1);
    }
}

// Run tests
runTests();
