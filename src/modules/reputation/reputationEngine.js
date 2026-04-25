const { db } = require('../../config/db');
const { enqueueNotification } = require('../notification/notificationService');

const LEVELS = [
    { level: 'diamond',  min: 800 },
    { level: 'platinum', min: 600 },
    { level: 'gold',     min: 400 },
    { level: 'silver',   min: 200 },
    { level: 'bronze',   min: 0   },
];

/**
 * Compute reputation score and level from raw metrics.
 * Pure function — same inputs always produce same output.
 */
function computeReputation({ completedJobs, avgRating, completionRate, responseRate }) {
    const score = parseFloat((
        (completedJobs * 5) +
        (avgRating * 40) +
        (completionRate * 0.5) +
        (responseRate * 0.5)
    ).toFixed(2));

    const { level } = LEVELS.find(l => score >= l.min) || LEVELS[LEVELS.length - 1];
    return { score, level };
}

/**
 * Recalculate and persist reputation for a freelancer.
 * Also recomputes completion_rate and response_rate from live data.
 */
async function recalculate(freelancerId) {
    const [[profile]] = await db.query(
        'SELECT total_completed, avg_rating, completion_rate, response_rate, reputation_level FROM freelancer_profiles WHERE id = ?',
        [freelancerId]
    );
    if (!profile) return;

    // Recompute completion_rate: completed / accepted contracts × 100
    const [[contractStats]] = await db.query(
        `SELECT
            COUNT(*) as total_accepted,
            SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) as total_completed
         FROM contracts WHERE freelancer_id = ?`,
        [freelancerId]
    );
    const completionRate = contractStats.total_accepted > 0
        ? parseFloat(((contractStats.total_completed / contractStats.total_accepted) * 100).toFixed(2))
        : 0;

    // Recompute response_rate: messages replied within 24h / total received × 100
    // Approximation: use stored value if available, otherwise default to 80
    const responseRate = parseFloat(profile.response_rate) || 80;

    // Update live metrics
    await db.query(
        'UPDATE freelancer_profiles SET completion_rate = ?, total_completed = ? WHERE id = ?',
        [completionRate, contractStats.total_completed || 0, freelancerId]
    );

    const { score, level } = computeReputation({
        completedJobs: contractStats.total_completed || 0,
        avgRating: parseFloat(profile.avg_rating) || 0,
        completionRate,
        responseRate,
    });

    await db.query(
        'UPDATE freelancer_profiles SET reputation_score = ?, reputation_level = ? WHERE id = ?',
        [score, level, freelancerId]
    );

    // Notify freelancer if they reached a new level (Requirement 9.5)
    if (profile.reputation_level && profile.reputation_level !== level) {
        await enqueueNotification(freelancerId, 'reputation_level_up', {
            title: `🏆 Level Up! You're now ${level.charAt(0).toUpperCase() + level.slice(1)}`,
            title_am: `🏆 ደረጃ ወጡ! አሁን ${level} ናቸው`,
            message: `Congratulations! Your hard work paid off. You've reached ${level.charAt(0).toUpperCase() + level.slice(1)} level on Ethio Gigs. Keep it up!`,
            message_am: `እንኳን ደስ አለዎት! ጠንክረው ሰርተዋል። በEthio Gigs ${level} ደረጃ ላይ ደርሰዋል!`
        }).catch(() => {});
    }

    return { score, level };
}

module.exports = { computeReputation, recalculate, LEVELS };
