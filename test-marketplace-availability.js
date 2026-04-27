/**
 * Test script for Marketplace Search and Availability Calendar
 * Run with: node test-marketplace-availability.js
 */

const http = require('http');

const BASE_URL = process.env.BASE_URL || 'http://localhost:3000';

// Helper to make HTTP requests
function request(method, path, body = null, token = null) {
    return new Promise((resolve, reject) => {
        const url = new URL(path, BASE_URL);
        const options = {
            method,
            hostname: url.hostname,
            port: url.port,
            path: url.pathname + url.search,
            headers: {
                'Content-Type': 'application/json',
            }
        };

        if (token) {
            options.headers['Authorization'] = `Bearer ${token}`;
        }

        const req = http.request(options, (res) => {
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
    console.log('\n=== Testing Marketplace Search ===\n');

    // Test 1: Basic search without filters
    console.log('Test 1: Basic marketplace search (no filters)');
    const result1 = await request('GET', '/api/marketplace');
    console.log(`Status: ${result1.status}`);
    console.log(`Results: ${Array.isArray(result1.data) ? result1.data.length : 0} freelancers`);
    if (result1.status === 200 && result1.data.length > 0) {
        console.log('Sample result:', JSON.stringify(result1.data[0], null, 2));
        console.log('✅ PASS: Basic search works\n');
    } else {
        console.log('⚠️  WARNING: No freelancers found or error\n');
    }

    // Test 2: Search with price filter
    console.log('Test 2: Search with price range filter (min_rate=10, max_rate=50)');
    const result2 = await request('GET', '/api/marketplace?min_rate=10&max_rate=50');
    console.log(`Status: ${result2.status}`);
    console.log(`Results: ${Array.isArray(result2.data) ? result2.data.length : 0} freelancers`);
    if (result2.status === 200) {
        const allInRange = result2.data.every(f => f.hourly_rate >= 10 && f.hourly_rate <= 50);
        console.log(`All results in range: ${allInRange}`);
        console.log(allInRange ? '✅ PASS: Price filter works\n' : '❌ FAIL: Price filter not working\n');
    } else {
        console.log('❌ FAIL: Request failed\n');
    }

    // Test 3: Search with rating filter
    console.log('Test 3: Search with minimum rating filter (min_rating=4.0)');
    const result3 = await request('GET', '/api/marketplace?min_rating=4.0');
    console.log(`Status: ${result3.status}`);
    console.log(`Results: ${Array.isArray(result3.data) ? result3.data.length : 0} freelancers`);
    if (result3.status === 200) {
        const allHighRated = result3.data.every(f => f.avg_rating >= 4.0);
        console.log(`All results rated >= 4.0: ${allHighRated}`);
        console.log(allHighRated ? '✅ PASS: Rating filter works\n' : '❌ FAIL: Rating filter not working\n');
    } else {
        console.log('❌ FAIL: Request failed\n');
    }

    // Test 4: Search with verified filter
    console.log('Test 4: Search for verified freelancers only');
    const result4 = await request('GET', '/api/marketplace?verified=true');
    console.log(`Status: ${result4.status}`);
    console.log(`Results: ${Array.isArray(result4.data) ? result4.data.length : 0} freelancers`);
    if (result4.status === 200) {
        const allVerified = result4.data.every(f => f.is_verified === 1);
        console.log(`All results verified: ${allVerified}`);
        console.log(allVerified ? '✅ PASS: Verified filter works\n' : '❌ FAIL: Verified filter not working\n');
    } else {
        console.log('❌ FAIL: Request failed\n');
    }

    // Test 5: Search with keyword
    console.log('Test 5: Keyword search (keyword=developer)');
    const result5 = await request('GET', '/api/marketplace?keyword=developer');
    console.log(`Status: ${result5.status}`);
    console.log(`Results: ${Array.isArray(result5.data) ? result5.data.length : 0} freelancers`);
    console.log(result5.status === 200 ? '✅ PASS: Keyword search works\n' : '❌ FAIL: Keyword search failed\n');

    // Test 6: Search with location
    console.log('Test 6: Location search (location=Addis)');
    const result6 = await request('GET', '/api/marketplace?location=Addis');
    console.log(`Status: ${result6.status}`);
    console.log(`Results: ${Array.isArray(result6.data) ? result6.data.length : 0} freelancers`);
    console.log(result6.status === 200 ? '✅ PASS: Location search works\n' : '❌ FAIL: Location search failed\n');

    // Test 7: Combined filters
    console.log('Test 7: Combined filters (min_rate=15, min_rating=3.5, verified=true)');
    const result7 = await request('GET', '/api/marketplace?min_rate=15&min_rating=3.5&verified=true');
    console.log(`Status: ${result7.status}`);
    console.log(`Results: ${Array.isArray(result7.data) ? result7.data.length : 0} freelancers`);
    console.log(result7.status === 200 ? '✅ PASS: Combined filters work\n' : '❌ FAIL: Combined filters failed\n');
}

async function testAvailabilityCalendar() {
    console.log('\n=== Testing Availability Calendar ===\n');
    console.log('⚠️  Note: These tests require authentication. You need to:');
    console.log('1. Register/login as a freelancer');
    console.log('2. Get the JWT token');
    console.log('3. Set TOKEN environment variable: TOKEN=your_jwt_token node test-marketplace-availability.js\n');

    const token = process.env.TOKEN;
    const userId = process.env.USER_ID || '1'; // Default to user ID 1

    if (!token) {
        console.log('❌ SKIP: No TOKEN provided. Set TOKEN environment variable to test.\n');
        return;
    }

    // Test 1: Set availability for multiple dates
    console.log('Test 1: Set availability for multiple dates');
    const dates = [
        { date: '2026-05-01', is_available: true },
        { date: '2026-05-02', is_available: true },
        { date: '2026-05-03', is_available: false },
        { date: '2026-05-04', is_available: true },
        { date: '2026-05-05', is_available: false }
    ];
    const result1 = await request('PUT', `/api/users/${userId}/availability`, { dates }, token);
    console.log(`Status: ${result1.status}`);
    console.log(`Response:`, result1.data);
    console.log(result1.status === 200 ? '✅ PASS: Set availability works\n' : '❌ FAIL: Set availability failed\n');

    // Test 2: Get availability for date range
    console.log('Test 2: Get availability for date range');
    const result2 = await request('GET', `/api/users/${userId}/availability?start_date=2026-05-01&end_date=2026-05-05`, null, token);
    console.log(`Status: ${result2.status}`);
    console.log(`Results: ${Array.isArray(result2.data) ? result2.data.length : 0} dates`);
    if (result2.status === 200 && result2.data.length > 0) {
        console.log('Sample:', JSON.stringify(result2.data.slice(0, 3), null, 2));
        console.log('✅ PASS: Get availability works\n');
    } else {
        console.log('❌ FAIL: Get availability failed\n');
    }

    // Test 3: Update existing availability
    console.log('Test 3: Update existing availability (change 2026-05-03 to available)');
    const result3 = await request('PUT', `/api/users/${userId}/availability`, {
        dates: [{ date: '2026-05-03', is_available: true }]
    }, token);
    console.log(`Status: ${result3.status}`);
    console.log(`Response:`, result3.data);
    console.log(result3.status === 200 ? '✅ PASS: Update availability works\n' : '❌ FAIL: Update availability failed\n');

    // Test 4: Verify update
    console.log('Test 4: Verify the update');
    const result4 = await request('GET', `/api/users/${userId}/availability?start_date=2026-05-03&end_date=2026-05-03`, null, token);
    console.log(`Status: ${result4.status}`);
    if (result4.status === 200 && result4.data.length > 0) {
        const isAvailable = result4.data[0].is_available === 1;
        console.log(`Date 2026-05-03 is_available: ${isAvailable}`);
        console.log(isAvailable ? '✅ PASS: Update verified\n' : '❌ FAIL: Update not reflected\n');
    } else {
        console.log('❌ FAIL: Verification failed\n');
    }

    // Test 5: Invalid date format
    console.log('Test 5: Invalid date format (should fail)');
    const result5 = await request('PUT', `/api/users/${userId}/availability`, {
        dates: [{ date: '05-01-2026', is_available: true }]
    }, token);
    console.log(`Status: ${result5.status}`);
    console.log(`Response:`, result5.data);
    console.log(result5.status === 422 ? '✅ PASS: Invalid format rejected\n' : '❌ FAIL: Should reject invalid format\n');

    // Test 6: Get all availability (no date filter)
    console.log('Test 6: Get all availability (no date filter)');
    const result6 = await request('GET', `/api/users/${userId}/availability`, null, token);
    console.log(`Status: ${result6.status}`);
    console.log(`Total dates: ${Array.isArray(result6.data) ? result6.data.length : 0}`);
    console.log(result6.status === 200 ? '✅ PASS: Get all availability works\n' : '❌ FAIL: Get all availability failed\n');
}

async function runTests() {
    console.log('╔════════════════════════════════════════════════════════════╗');
    console.log('║  Marketplace Search & Availability Calendar Test Suite    ║');
    console.log('╚════════════════════════════════════════════════════════════╝');

    try {
        await testMarketplaceSearch();
        await testAvailabilityCalendar();

        console.log('\n╔════════════════════════════════════════════════════════════╗');
        console.log('║  Test Suite Complete                                       ║');
        console.log('╚════════════════════════════════════════════════════════════╝\n');
    } catch (error) {
        console.error('\n❌ Test suite error:', error.message);
        process.exit(1);
    }
}

// Run tests
runTests();
