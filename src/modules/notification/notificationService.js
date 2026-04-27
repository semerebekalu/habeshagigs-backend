const { db } = require('../../config/db');

let _io = null;
function setIo(io) { _io = io; }

const APP_URL = process.env.APP_URL || 'https://habeshagigs.up.railway.app';

// Email templates for key events
const EMAIL_TEMPLATES = {
    contract_signed: (data) => ({
        subject: '✍️ Contract Fully Signed — Work Can Begin!',
        html: emailWrap(`
            <h2 style="color:#1e293b;margin-top:0;">✍️ Contract Fully Signed</h2>
            <p>Hi ${data.name},</p>
            <p>Both parties have signed the contract. A project group chat has been created and work can now begin!</p>
            <div style="text-align:center;margin:24px 0;">
              <a href="${APP_URL}/contract.html?id=${data.contract_id}" style="background:#1E3A8A;color:#fff;padding:14px 28px;border-radius:8px;text-decoration:none;font-weight:700;">View Contract</a>
            </div>`)
    }),
    payment_released: (data) => ({
        subject: '💰 Payment Released to Your Wallet',
        html: emailWrap(`
            <h2 style="color:#1e293b;margin-top:0;">💰 Payment Released</h2>
            <p>Hi ${data.name},</p>
            <p>${data.message}</p>
            <div style="text-align:center;margin:24px 0;">
              <a href="${APP_URL}/dashboard.html" style="background:#1E3A8A;color:#fff;padding:14px 28px;border-radius:8px;text-decoration:none;font-weight:700;">View Wallet</a>
            </div>`)
    }),
    contract_completed: (data) => ({
        subject: '🎉 Contract Completed!',
        html: emailWrap(`
            <h2 style="color:#1e293b;margin-top:0;">🎉 Contract Completed</h2>
            <p>Hi ${data.name},</p>
            <p>${data.message}</p>
            <div style="text-align:center;margin:24px 0;">
              <a href="${APP_URL}/dashboard.html" style="background:#1E3A8A;color:#fff;padding:14px 28px;border-radius:8px;text-decoration:none;font-weight:700;">View Dashboard</a>
            </div>`)
    }),
    dispute_raised: (data) => ({
        subject: '⚠️ Dispute Raised on Your Contract',
        html: emailWrap(`
            <h2 style="color:#dc2626;margin-top:0;">⚠️ Dispute Raised</h2>
            <p>Hi ${data.name},</p>
            <p>${data.message}</p>
            <p style="color:#64748b;font-size:0.88rem;">Escrow funds are frozen until our team resolves the dispute. You will be notified of the outcome.</p>
            <div style="text-align:center;margin:24px 0;">
              <a href="${APP_URL}/dashboard.html" style="background:#dc2626;color:#fff;padding:14px 28px;border-radius:8px;text-decoration:none;font-weight:700;">View Dispute</a>
            </div>`)
    }),
    dispute_resolved: (data) => ({
        subject: '✅ Dispute Resolved',
        html: emailWrap(`
            <h2 style="color:#16a34a;margin-top:0;">✅ Dispute Resolved</h2>
            <p>Hi ${data.name},</p>
            <p>${data.message}</p>
            <div style="text-align:center;margin:24px 0;">
              <a href="${APP_URL}/dashboard.html" style="background:#1E3A8A;color:#fff;padding:14px 28px;border-radius:8px;text-decoration:none;font-weight:700;">View Dashboard</a>
            </div>`)
    }),
    proposal_accepted: (data) => ({
        subject: '🎉 Your Proposal Was Accepted!',
        html: emailWrap(`
            <h2 style="color:#1e293b;margin-top:0;">🎉 Proposal Accepted</h2>
            <p>Hi ${data.name},</p>
            <p>${data.message}</p>
            <div style="text-align:center;margin:24px 0;">
              <a href="${APP_URL}/dashboard.html" style="background:#1E3A8A;color:#fff;padding:14px 28px;border-radius:8px;text-decoration:none;font-weight:700;">View Contract</a>
            </div>`)
    }),
    work_submitted: (data) => ({
        subject: '📦 Freelancer Submitted Work for Review',
        html: emailWrap(`
            <h2 style="color:#1e293b;margin-top:0;">📦 Work Submitted</h2>
            <p>Hi ${data.name},</p>
            <p>${data.message}</p>
            <p style="color:#64748b;font-size:0.88rem;">Please review and approve or request revisions within 5 business days.</p>
            <div style="text-align:center;margin:24px 0;">
              <a href="${APP_URL}/dashboard.html" style="background:#1E3A8A;color:#fff;padding:14px 28px;border-radius:8px;text-decoration:none;font-weight:700;">Review Delivery</a>
            </div>`)
    }),
    milestone_approved: (data) => ({
        subject: '✅ Milestone Approved — Payment Coming',
        html: emailWrap(`
            <h2 style="color:#16a34a;margin-top:0;">✅ Milestone Approved</h2>
            <p>Hi ${data.name},</p>
            <p>${data.message}</p>
            <div style="text-align:center;margin:24px 0;">
              <a href="${APP_URL}/dashboard.html" style="background:#1E3A8A;color:#fff;padding:14px 28px;border-radius:8px;text-decoration:none;font-weight:700;">View Contract</a>
            </div>`)
    }),
    kyc_approved: (data) => ({
        subject: '✅ Your Identity Has Been Verified!',
        html: emailWrap(`
            <h2 style="color:#16a34a;margin-top:0;">✅ Identity Verified</h2>
            <p>Hi ${data.name},</p>
            <p>${data.message}</p>
            <div style="text-align:center;margin:24px 0;">
              <a href="${APP_URL}/dashboard.html" style="background:#1E3A8A;color:#fff;padding:14px 28px;border-radius:8px;text-decoration:none;font-weight:700;">Go to Dashboard</a>
            </div>`)
    }),
    kyc_rejected: (data) => ({
        subject: '❌ Identity Verification Unsuccessful',
        html: emailWrap(`
            <h2 style="color:#dc2626;margin-top:0;">❌ Verification Unsuccessful</h2>
            <p>Hi ${data.name},</p>
            <p>${data.message}</p>
            <div style="text-align:center;margin:24px 0;">
              <a href="${APP_URL}/verify.html" style="background:#1E3A8A;color:#fff;padding:14px 28px;border-radius:8px;text-decoration:none;font-weight:700;">Resubmit Documents</a>
            </div>`)
    }),
    withdrawal_approved: (data) => ({
        subject: '✅ Withdrawal Approved',
        html: emailWrap(`
            <h2 style="color:#16a34a;margin-top:0;">✅ Withdrawal Approved</h2>
            <p>Hi ${data.name},</p>
            <p>${data.message}</p>`)
    }),
    withdrawal_rejected: (data) => ({
        subject: '❌ Withdrawal Rejected — Funds Returned',
        html: emailWrap(`
            <h2 style="color:#dc2626;margin-top:0;">❌ Withdrawal Rejected</h2>
            <p>Hi ${data.name},</p>
            <p>${data.message}</p>
            <div style="text-align:center;margin:24px 0;">
              <a href="${APP_URL}/dashboard.html" style="background:#1E3A8A;color:#fff;padding:14px 28px;border-radius:8px;text-decoration:none;font-weight:700;">View Wallet</a>
            </div>`)
    }),
    referral_reward: (data) => ({
        subject: '🎁 You Earned a Referral Reward!',
        html: emailWrap(`
            <h2 style="color:#1e293b;margin-top:0;">🎁 Referral Reward</h2>
            <p>Hi ${data.name},</p>
            <p>${data.message}</p>
            <div style="text-align:center;margin:24px 0;">
              <a href="${APP_URL}/dashboard.html" style="background:#1E3A8A;color:#fff;padding:14px 28px;border-radius:8px;text-decoration:none;font-weight:700;">View Wallet</a>
            </div>`)
    })
};

// Events that always get email (regardless of preferences)
const ALWAYS_EMAIL = new Set([
    'contract_signed', 'payment_released', 'contract_completed',
    'dispute_raised', 'dispute_resolved', 'kyc_approved', 'kyc_rejected',
    'withdrawal_approved', 'withdrawal_rejected'
]);

function emailWrap(content) {
    return `<div style="font-family:Inter,sans-serif;max-width:520px;margin:0 auto;padding:32px;background:#f8fafc;border-radius:12px;">
      <div style="text-align:center;margin-bottom:24px;">
        <h1 style="color:#1E3A8A;font-size:1.8rem;margin:0;">Ethio<span style="color:#14B8A6;">Gigs</span></h1>
      </div>
      <div style="background:#fff;border-radius:10px;padding:28px;border:1px solid #e2e8f0;">
        ${content}
      </div>
      <p style="color:#94a3b8;font-size:0.78rem;text-align:center;margin-top:16px;">© 2026 Ethio Gigs. Ethiopia's Freelance Marketplace.</p>
    </div>`;
}

/**
 * Enqueue a notification for a user — sends in-app and email as appropriate.
 */
async function enqueueNotification(userId, eventType, { title, title_am, message, message_am }) {
    try {
        // Check preferences
        const [prefs] = await db.query(
            'SELECT in_app_enabled, email_enabled FROM notification_preferences WHERE user_id = ? AND event_type = ?',
            [userId, eventType]
        );
        const inApp = prefs.length === 0 ? true : prefs[0].in_app_enabled === 1;
        const emailPref = prefs.length === 0 ? true : prefs[0].email_enabled === 1;

        // In-app notification
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

        // Email notification — send for key events or if user has email enabled
        const shouldEmail = ALWAYS_EMAIL.has(eventType) || emailPref;
        if (shouldEmail && EMAIL_TEMPLATES[eventType]) {
            // Get user email and name
            const [[user]] = await db.query('SELECT email, full_name FROM users WHERE id = ?', [userId]);
            if (user && user.email && !user.email.includes('@deleted.ethiogigs')) {
                const template = EMAIL_TEMPLATES[eventType]({
                    name: user.full_name,
                    message,
                    title,
                    userId
                });
                const { sendEmail } = require('../../utils/emailService');
                sendEmail({
                    to: user.email,
                    toName: user.full_name,
                    subject: template.subject,
                    html: template.html
                }).catch(err => console.error(`❌ Email notification failed [${eventType}] to ${user.email}:`, err.message));
            }
        }
    } catch (err) {
        console.error('❌ Notification error:', err.message);
    }
}

module.exports = { enqueueNotification, setIo };
