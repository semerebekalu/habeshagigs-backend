const { db } = require('../../config/db');

let _io = null;
function setIo(io) { _io = io; }

/**
 * Enqueue a notification for a user, respecting their preferences.
 */
async function enqueueNotification(userId, eventType, { title, title_am, message, message_am }) {
    try {
        // Check preferences
        const [prefs] = await db.query(
            'SELECT in_app_enabled, email_enabled FROM notification_preferences WHERE user_id = ? AND event_type = ?',
            [userId, eventType]
        );
        const inApp = prefs.length === 0 ? true : prefs[0].in_app_enabled === 1;

        if (inApp) {
            const [result] = await db.query(
                `INSERT INTO notifications (user_id, event_type, title, title_am, message, message_am)
                 VALUES (?, ?, ?, ?, ?, ?)`,
                [userId, eventType, title, title_am || title, message, message_am || message]
            );
            if (_io) {
                _io.to(`user:${userId}`).emit('notification:new', {
                    id: result.insertId, eventType, title, message
                });
            }
        }
    } catch (err) {
        console.error('❌ Notification error:', err.message);
    }
}

module.exports = { enqueueNotification, setIo };
