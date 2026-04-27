const express = require('express');
const router = express.Router();
const { db } = require('../config/db');
const { computeMatchScore } = require('../modules/match/matchScore');

// Simple Redis cache helper — fails gracefully if Redis is down
let _redisClient = null;
let _redisConnecting = false;

async function getRedis() {
    if (_redisClient) return _redisClient;
    if (_redisConnecting) return null; // Don't wait if already connecting
    
    try {
        _redisConnecting = true;
        const redis = require('redis');
        const client = redis.createClient({ 
            url: process.env.REDIS_URL || 'redis://localhost:6379',
            socket: {
                connectTimeout: 2000, // 2 second timeout
                reconnectStrategy: () => false // Don't auto-reconnect
            }
        });
        client.on('error', () => { _redisClient = null; });
        await client.connect();
        _redisClient = client;
        _redisConnecting = false;
    } catch { 
        _redisClient = null; 
        _redisConnecting = false;
    }
    return _redisClient;
}

async function cacheGet(key) {
    try { 
        const r = await Promise.race([
            getRedis(),
            new Promise(resolve => setTimeout(() => resolve(null), 1000)) // 1 second timeout
        ]);
        return r ? JSON.parse(await r.get(key)) : null; 
    } catch { return null; }
}

async function cacheSet(key, value, ttlSeconds = 300) {
    try { 
        const r = await Promise.race([
            getRedis(),
            new Promise(resolve => setTimeout(() => resolve(null), 1000)) // 1 second timeout
        ]);
        if (r) await r.set(key, JSON.stringify(value), { EX: ttlSeconds }); 
    } catch {}
}

async function cacheDel(key) {
    try { 
        const r = await Promise.race([
            getRedis(),
            new Promise(resolve => setTimeout(() => resolve(null), 1000)) // 1 second timeout
        ]);
        if (r) await r.del(key); 
    } catch {}
}

// GET /api/marketplace
router.get('/', async (req, res) => {
    const { keyword, skill_id, min_rate, max_rate, min_rating, verified, location } = req.query;
    try {
        // Build cache key from query params
        const cacheKey = `marketplace:${JSON.stringify(req.query)}`;
        const cached = await cacheGet(cacheKey);
        if (cached) return res.json(cached);

        let sql = `
            SELECT u.id, u.full_name, u.is_verified, fp.title, fp.hourly_rate, fp.avg_rating,
                   fp.reputation_level, fp.completion_rate, fp.response_rate, fp.avg_response_time_hrs,
                   fp.location,
                   GROUP_CONCAT(DISTINCT s.name SEPARATOR ',') as top_skills
            FROM users u
            JOIN freelancer_profiles fp ON u.id = fp.id
            LEFT JOIN freelancer_skills fs ON u.id = fs.freelancer_id
            LEFT JOIN skills s ON fs.skill_id = s.id
            WHERE u.role = 'freelancer' AND u.is_banned = 0 AND u.is_suspended = 0
        `;
        const params = [];
        if (keyword) { sql += ' AND (u.full_name LIKE ? OR fp.title LIKE ? OR fp.bio LIKE ?)'; params.push(`%${keyword}%`, `%${keyword}%`, `%${keyword}%`); }
        if (min_rate) { sql += ' AND fp.hourly_rate >= ?'; params.push(parseFloat(min_rate)); }
        if (max_rate) { sql += ' AND fp.hourly_rate <= ?'; params.push(parseFloat(max_rate)); }
        if (min_rating) { sql += ' AND fp.avg_rating >= ?'; params.push(parseFloat(min_rating)); }
        if (verified === 'true') { sql += ' AND u.is_verified = 1'; }
        if (skill_id) {
            sql += ' AND u.id IN (SELECT freelancer_id FROM freelancer_skills WHERE skill_id = ?)';
            params.push(parseInt(skill_id));
        }
        if (location) {
            sql += ' AND fp.location LIKE ?';
            params.push(`%${location}%`);
        }
        sql += ' GROUP BY u.id ORDER BY fp.avg_rating DESC, fp.total_completed DESC LIMIT 50';
        const [freelancers] = await db.query(sql, params);

        for (const f of freelancers) {
            const hrs = parseFloat(f.avg_response_time_hrs) || 0;
            if (hrs > 0 && hrs < 1) f.response_time_label = 'Responds in under an hour';
            else if (hrs >= 1 && hrs < 24) f.response_time_label = `Responds in ~${Math.round(hrs)}h`;
            else if (hrs >= 24) f.response_time_label = 'Responds within a day';
            else f.response_time_label = null;
        }

        // Cache for 3 minutes (short TTL so new freelancers appear quickly)
        await cacheSet(cacheKey, freelancers, 180);
        res.json(freelancers);
    } catch (err) {
        res.status(500).json({ error: 'SERVER_ERROR', message: err.message });
    }
});

// GET /api/match/job/:jobId — mounted at /api/match, path is /job/:jobId
router.get('/job/:jobId', async (req, res) => {
    try {
        const cacheKey = `match:job:${req.params.jobId}`;
        const cached = await cacheGet(cacheKey);
        if (cached) return res.json(cached);

        const [[job]] = await db.query('SELECT * FROM jobs WHERE id = ?', [req.params.jobId]);
        if (!job) return res.status(404).json({ error: 'JOB_NOT_FOUND' });

        const [jobSkills] = await db.query('SELECT skill_id FROM job_skills WHERE job_id = ?', [job.id]);
        const jobSkillIds = jobSkills.map(s => s.skill_id);

        // Single query — fetch all freelancers with their skills using GROUP_CONCAT
        const [freelancers] = await db.query(`
            SELECT u.id, u.full_name, u.is_verified,
                   fp.hourly_rate, fp.avg_rating, fp.avg_response_time_hrs,
                   fp.reputation_level, fp.title,
                   GROUP_CONCAT(fs.skill_id) as skill_ids
            FROM users u
            JOIN freelancer_profiles fp ON u.id = fp.id
            LEFT JOIN freelancer_skills fs ON u.id = fs.freelancer_id
            WHERE u.role = 'freelancer' AND u.is_banned = 0 AND u.is_suspended = 0
            GROUP BY u.id
        `);

        const scored = freelancers.map(f => {
            const skillIds = f.skill_ids ? f.skill_ids.split(',').map(Number) : [];
            const score = computeMatchScore(
                { budget_min: job.budget_min, budget_max: job.budget_max, skillIds: jobSkillIds },
                { avg_rating: f.avg_rating, hourly_rate: f.hourly_rate, avg_response_time_hrs: f.avg_response_time_hrs, skillIds }
            );
            return { ...f, skill_ids: undefined, match_score: score };
        });

        const top10 = scored.sort((a, b) => b.match_score - a.match_score).slice(0, 10);

        // Cache for 5 minutes (Requirement 8.2 — return within 5 seconds)
        await cacheSet(cacheKey, top10, 300);
        res.json(top10);
    } catch (err) {
        res.status(500).json({ error: 'SERVER_ERROR', message: err.message });
    }
});

// GET /api/skills — all skills for dropdowns
router.get('/skills', async (req, res) => {
    try {
        // Try cache first
        try {
            const cached = await cacheGet('skills:all');
            if (cached) return res.json(cached);
        } catch (cacheErr) {
            // Cache error, continue without cache
            console.log('Cache error, fetching from DB:', cacheErr.message);
        }
        
        // Get distinct skills (in case of duplicates from multiple migrations)
        const [skills] = await db.query('SELECT DISTINCT name, MIN(id) as id, category FROM skills GROUP BY name, category LIMIT 200');
        
        // Try to cache, but don't fail if cache fails
        try {
            await cacheSet('skills:all', skills, 3600); // cache 1 hour
        } catch (cacheErr) {
            console.log('Failed to cache skills:', cacheErr.message);
        }
        
        res.json(skills);
    } catch (err) {
        console.error('Skills endpoint error:', err);
        res.status(500).json({ error: 'SERVER_ERROR', message: err.message });
    }
});

// GET /api/skills/trending — top 10 most in-demand skills, refreshed weekly
router.get('/skills/trending', async (req, res) => {
    try {
        const cached = await cacheGet('skills:trending');
        if (cached) return res.json(cached);
        const [trending] = await db.query(`
            SELECT s.id, s.name, s.category, COUNT(js.job_id) as demand
            FROM skills s
            JOIN job_skills js ON s.id = js.skill_id
            JOIN jobs j ON js.job_id = j.id
            WHERE j.created_at >= DATE_SUB(NOW(), INTERVAL 30 DAY)
            GROUP BY s.id ORDER BY demand DESC LIMIT 10
        `);
        await cacheSet('skills:trending', trending, 7 * 24 * 3600); // cache 1 week
        res.json(trending);
    } catch (err) {
        res.status(500).json({ error: 'SERVER_ERROR', message: err.message });
    }
});

// Invalidate match cache when a freelancer profile is updated (called from users route)
async function invalidateMatchCache(freelancerId) {
    await cacheDel(`match:freelancer:${freelancerId}`);
}

module.exports = router;
