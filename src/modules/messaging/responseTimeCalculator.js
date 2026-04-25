const { db } = require('../../config/db');

/**
 * Calculate average response time for a user.
 * Looks at messages received and the first reply within 24h.
 */
async function calculateResponseTime(userId) {
    try {
        // Get conversations where user is a participant
        const [convs] = await db.query(
            'SELECT id FROM conversations WHERE participant_a = ? OR participant_b = ?',
            [userId, userId]
        );
        if (!convs.length) return { avg_hours: null, label: 'New to platform' };

        const convIds = convs.map(c => c.id);
        const placeholders = convIds.map(() => '?').join(',');

        // Get messages received by user (not sent by user)
        const [received] = await db.query(
            `SELECT m.id, m.conversation_id, m.created_at
             FROM messages m
             WHERE m.conversation_id IN (${placeholders})
               AND m.sender_id != ?
             ORDER BY m.created_at ASC`,
            [...convIds, userId]
        );

        if (!received.length) return { avg_hours: null, label: 'New to platform' };

        const responseTimes = [];

        for (const msg of received) {
            // Find first reply by user after this message within 24h
            const [[reply]] = await db.query(
                `SELECT created_at FROM messages
                 WHERE conversation_id = ?
                   AND sender_id = ?
                   AND created_at > ?
                   AND created_at <= DATE_ADD(?, INTERVAL 24 HOUR)
                 ORDER BY created_at ASC LIMIT 1`,
                [msg.conversation_id, userId, msg.created_at, msg.created_at]
            );
            if (reply) {
                const diffMs = new Date(reply.created_at) - new Date(msg.created_at);
                responseTimes.push(diffMs / (1000 * 60 * 60)); // hours
            }
        }

        if (!responseTimes.length) return { avg_hours: null, label: 'Response time unknown' };

        const avg = responseTimes.reduce((a, b) => a + b, 0) / responseTimes.length;
        let label;
        if (avg < 1) label = 'Typically responds in under an hour';
        else if (avg < 3) label = `Typically responds in ${Math.round(avg)} hours`;
        else if (avg < 24) label = `Typically responds in ${Math.round(avg)} hours`;
        else label = 'Typically responds within a day';

        return { avg_hours: parseFloat(avg.toFixed(1)), label };
    } catch {
        return { avg_hours: null, label: 'Response time unknown' };
    }
}

module.exports = { calculateResponseTime };
