const cron = require('node-cron');
const { db } = require('../../config/db');
const { enqueueNotification } = require('../notification/notificationService');

// Runs daily at 9am — notifies clients whose jobs have no proposals after 7 days
function startNoProposalCron() {
    cron.schedule('0 9 * * *', async () => {
        try {
            const [jobs] = await db.query(`
                SELECT j.id, j.client_id, j.title
                FROM jobs j
                WHERE j.status = 'open'
                  AND j.no_proposal_notified = 0
                  AND j.created_at <= DATE_SUB(NOW(), INTERVAL 7 DAY)
                  AND (SELECT COUNT(*) FROM proposals p WHERE p.job_id = j.id) = 0
            `);
            for (const job of jobs) {
                await enqueueNotification(job.client_id, 'no_proposals_7days', {
                    title: '💡 No proposals yet',
                    message: `Your job "${job.title}" has no proposals after 7 days. Consider adjusting your budget or required skills.`
                });
                await db.query('UPDATE jobs SET no_proposal_notified = 1 WHERE id = ?', [job.id]);
            }
            if (jobs.length) console.log(`✅ Sent no-proposal nudge to ${jobs.length} clients`);
        } catch (err) {
            console.error('❌ No-proposal cron error:', err.message);
        }
    });
    console.log('⏰ No-proposal cron job scheduled (daily 9am)');
}

module.exports = { startNoProposalCron };
