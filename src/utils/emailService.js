const nodemailer = require('nodemailer');

function createTransporter() {
    return nodemailer.createTransport({
        host: process.env.SMTP_HOST || 'smtp-relay.brevo.com',
        port: parseInt(process.env.SMTP_PORT || '587', 10),
        secure: false,
        auth: {
            user: process.env.SMTP_USER,
            pass: process.env.SMTP_PASS
        },
        tls: {
            rejectUnauthorized: false
        }
    });
}

function getFrom() {
    return process.env.SMTP_FROM || `Ethio Gigs <${process.env.SMTP_USER}>`;
}

async function sendOTP(to, otp, name) {
    const transporter = createTransporter();
    console.log(`📧 Sending OTP to ${to} via ${process.env.SMTP_HOST}:${process.env.SMTP_PORT} as ${process.env.SMTP_USER}`);
    try {
        const info = await transporter.sendMail({
            from: getFrom(),
            to,
            subject: '🔐 Your Ethio Gigs Verification Code',
            html: `
            <div style="font-family:Inter,sans-serif;max-width:480px;margin:0 auto;padding:32px;background:#f8fafc;border-radius:12px;">
              <div style="text-align:center;margin-bottom:24px;">
                <h1 style="color:#1E3A8A;font-size:1.8rem;margin:0;">Ethio<span style="color:#14B8A6;">Gigs</span></h1>
              </div>
              <div style="background:#fff;border-radius:10px;padding:28px;border:1px solid #e2e8f0;">
                <h2 style="color:#1e293b;margin-top:0;">Verify your account</h2>
                <p style="color:#64748b;">Hi ${name}, use the code below to verify your Ethio Gigs account:</p>
                <div style="text-align:center;margin:24px 0;">
                  <span style="font-size:2.5rem;font-weight:800;letter-spacing:8px;color:#1E3A8A;background:#eff6ff;padding:16px 24px;border-radius:8px;">${otp}</span>
                </div>
                <p style="color:#64748b;font-size:0.88rem;">This code expires in <strong>10 minutes</strong>. Do not share it with anyone.</p>
              </div>
              <p style="color:#94a3b8;font-size:0.78rem;text-align:center;margin-top:16px;">© 2026 Ethio Gigs. Ethiopia's Freelance Marketplace.</p>
            </div>`
        });
        console.log(`✅ OTP email sent to ${to} — messageId: ${info.messageId}`);
    } catch (err) {
        console.error(`❌ OTP email failed to ${to}:`, err.message);
        throw err;
    }
}

async function sendPasswordReset(to, resetLink, name) {
    const transporter = createTransporter();
    console.log(`📧 Sending password reset to ${to}`);
    try {
        const info = await transporter.sendMail({
            from: getFrom(),
            to,
            subject: '🔑 Reset your Ethio Gigs password',
            html: `
            <div style="font-family:Inter,sans-serif;max-width:480px;margin:0 auto;padding:32px;background:#f8fafc;border-radius:12px;">
              <div style="text-align:center;margin-bottom:24px;">
                <h1 style="color:#1E3A8A;font-size:1.8rem;margin:0;">Ethio<span style="color:#14B8A6;">Gigs</span></h1>
              </div>
              <div style="background:#fff;border-radius:10px;padding:28px;border:1px solid #e2e8f0;">
                <h2 style="color:#1e293b;margin-top:0;">Reset your password</h2>
                <p style="color:#64748b;">Hi ${name}, click the button below to reset your password. This link expires in <strong>30 minutes</strong>.</p>
                <div style="text-align:center;margin:24px 0;">
                  <a href="${resetLink}" style="background:#1E3A8A;color:#fff;padding:14px 28px;border-radius:8px;text-decoration:none;font-weight:700;font-size:1rem;">Reset Password</a>
                </div>
                <p style="color:#94a3b8;font-size:0.82rem;">If you didn't request this, ignore this email. Your password won't change.</p>
              </div>
            </div>`
        });
        console.log(`✅ Password reset email sent to ${to} — messageId: ${info.messageId}`);
    } catch (err) {
        console.error(`❌ Password reset email failed to ${to}:`, err.message);
        throw err;
    }
}

module.exports = { sendOTP, sendPasswordReset };
