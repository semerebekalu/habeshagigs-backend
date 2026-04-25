/**
 * In-memory IP-based rate limiter — no Redis or extra packages needed.
 * Works per-route with configurable window and max requests.
 */

const store = new Map(); // key -> { count, resetAt }

/**
 * Creates a rate limiter middleware.
 * @param {object} options
 * @param {number} options.windowMs   - Time window in milliseconds
 * @param {number} options.max        - Max requests per window per IP
 * @param {string} options.message    - Error message when limit exceeded
 */
function rateLimiter({ windowMs = 60_000, max = 10, message = 'Too many requests. Please try again later.' } = {}) {
    return (req, res, next) => {
        // Use X-Forwarded-For for Railway/proxy environments, fall back to socket IP
        const ip = (req.headers['x-forwarded-for'] || req.socket.remoteAddress || 'unknown')
            .split(',')[0].trim();

        const key = `${req.path}:${ip}`;
        const now = Date.now();
        const entry = store.get(key);

        if (!entry || now > entry.resetAt) {
            // New window
            store.set(key, { count: 1, resetAt: now + windowMs });
            return next();
        }

        entry.count++;

        if (entry.count > max) {
            const retryAfter = Math.ceil((entry.resetAt - now) / 1000);
            res.setHeader('Retry-After', retryAfter);
            return res.status(429).json({
                error: 'RATE_LIMIT_EXCEEDED',
                message,
                retry_after_seconds: retryAfter
            });
        }

        next();
    };
}

// Clean up expired entries every 5 minutes to prevent memory leak
setInterval(() => {
    const now = Date.now();
    for (const [key, entry] of store.entries()) {
        if (now > entry.resetAt) store.delete(key);
    }
}, 5 * 60_000);

module.exports = { rateLimiter };
