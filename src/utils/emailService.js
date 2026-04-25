const fetch = require('node-fetch');

// Use Brevo HTTP API (avoids SMTP port blocking on Railway)
// Falls back to nodemailer SMTP if BREVO_API_KEY not set
async function sendEmail({ to, toName, subject, html }) {
    const apiKey = process.env.BREVO_API_KEY;

    if (apiKey) {
        // Brevo HTTP API — port 443, never blocked
        const response = await fetch('https://api.brevo.com/v3/smtp/email', {
            method: 'POST',
            headers: {
                'accept': 'application/json',
                'api-key': apiKey,
                'content-type': 'application/json'
            },
            body: JSON.stringify({
                sender: { name: 'Ethio Gigs', email: process.env.SMTP_USER || 'a94931001@smtp-brevo.com' },
                to: [{ email: to, name: toName || to }],
                subject,
                htmlContent: html
            })
        });

        const data = await response.json();
        if (!response.ok) {
            throw new Error(`Brevo API error: ${JSON.stringify(data)}`);
        }
        console.log(`✅ Email sent to ${to} via Brevo API — messageId: ${data.messageId}`);
        return data;
    }

    // Fallback: nodemailer SMTP
    const nodemailer = require('nodemailer');
    const port = parseInt(process.env.SMTP_PORT || '587', 10);
    const transporter = nodemailer.createTransport({
        host: process.env.SMTP_HOST || 'smtp-relay.brevo.com',
        port,
        secure: port === 465,
        auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
        tls: { rejectUnauthorized: false },
        connectionTimeout: 10000,
        socketTimeout: 15000
    });
    const info = await transporter.sendMail({
        from: process.env.SMTP_FROM || `Ethio Gigs <${process.env.SMTP_USER}>`,
        to,
        subject,
        html
    });
    console.log(`✅ Email sent to ${to} via SMTP — messageId: ${info.messageId}`);
    return info;
}

async function sendOTP(to, otp, name) {
    console.log(`📧 Sending OTP to ${to}`);
    try {
        await sendEmail({
            to,
            toName: name,
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
    } catch (err) {
        console.error(`❌ OTP email failed to ${to}:`, err.message);
        throw err;
    }
}

async function sendPasswordReset(to, resetLink, name) {
    console.log(`📧 Sending password reset to ${to}`);
    try {
        await sendEmail({
            to,
            toName: name,
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
    } catch (err) {
        console.error(`❌ Password reset email failed to ${to}:`, err.message);
        throw err;
    }
}

module.exports = { sendOTP, sendPasswordReset };
