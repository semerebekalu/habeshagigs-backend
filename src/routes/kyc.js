const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { db } = require('../config/db');
const { authenticate, requireAdmin } = require('../middleware/auth');
const { enqueueNotification } = require('../modules/notification/notificationService');
const { verifySelfie, verifyIdDocument } = require('../modules/kyc/imageVerifier');

// File upload config for KYC docs
const kycStorage = multer.diskStorage({
    destination: (req, file, cb) => {
        const dir = path.join(__dirname, '../../uploads/kyc');
        if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
        cb(null, dir);
    },
    filename: (req, file, cb) => {
        cb(null, `${Date.now()}-${req.user?.id || 'user'}-${file.fieldname}${path.extname(file.originalname)}`);
    }
});
const kycUpload = multer({ storage: kycStorage, limits: { fileSize: 10 * 1024 * 1024 } });

// POST /api/kyc/submit — supports both file upload and URL-based submission
router.post('/submit', authenticate, kycUpload.fields([
    { name: 'id_document', maxCount: 1 },
    { name: 'selfie', maxCount: 1 }
]), async (req, res) => {
    const uploadedFiles = [];
    try {
        // Accept either uploaded files or URLs passed in body
        const idFile = req.files?.id_document?.[0];
        const selfieFile = req.files?.selfie?.[0];

        const id_document_url = idFile
            ? `/uploads/kyc/${idFile.filename}`
            : req.body.id_document_url;
        const selfie_url = selfieFile
            ? `/uploads/kyc/${selfieFile.filename}`
            : req.body.selfie_url;

        if (!id_document_url || !selfie_url) {
            return res.status(422).json({ error: 'VALIDATION_ERROR', message: 'ID document and selfie are required' });
        }

        // --- On-the-spot image verification ---
        if (idFile) {
            uploadedFiles.push(idFile.path);
            const idCheck = await verifyIdDocument(idFile.path);
            if (!idCheck.ok) {
                fs.unlink(idFile.path, () => {});
                if (selfieFile) fs.unlink(selfieFile.path, () => {});
                return res.status(422).json({
                    error: 'INVALID_ID_DOCUMENT',
                    message: idCheck.reason || 'The uploaded ID document could not be verified. Please upload a clear photo of your ID card or passport.'
                });
            }
        }

        if (selfieFile) {
            uploadedFiles.push(selfieFile.path);
            const selfieCheck = await verifySelfie(selfieFile.path);
            if (!selfieCheck.ok) {
                fs.unlink(selfieFile.path, () => {});
                if (idFile) fs.unlink(idFile.path, () => {});
                return res.status(422).json({
                    error: 'INVALID_SELFIE',
                    message: selfieCheck.reason || 'No face detected in your selfie. Please take a clear photo of your face.'
                });
            }
        }
        // --- End image verification ---

        // Cancel any previous pending submission
        await db.query("UPDATE kyc_submissions SET status = 'rejected', rejection_reason = 'Superseded by new submission' WHERE user_id = ? AND status = 'pending'", [req.user.id]);

        await db.query(
            'INSERT INTO kyc_submissions (user_id, id_document_url, selfie_url) VALUES (?, ?, ?)',
            [req.user.id, id_document_url, selfie_url]
        );
        await db.query("UPDATE users SET kyc_status = 'pending' WHERE id = ?", [req.user.id]);

        res.json({ success: true, message: 'KYC submitted for review. You will be notified within 24 hours.' });
    } catch (err) {
        // Clean up any uploaded files on unexpected error
        uploadedFiles.forEach(f => fs.unlink(f, () => {}));
        res.status(500).json({ error: 'SERVER_ERROR', message: err.message });
    }
});

// GET /api/kyc/status/:userId — public endpoint, no auth required
router.get('/status/:userId', async (req, res) => {
    try {
        const [[user]] = await db.query('SELECT kyc_status, is_verified FROM users WHERE id = ?', [req.params.userId]);
        res.json(user || { kyc_status: 'none', is_verified: 0 });
    } catch (err) {
        res.json({ kyc_status: 'none', is_verified: 0 });
    }
});

// POST /api/kyc/review/:id (admin)
router.post('/review/:id', authenticate, requireAdmin, async (req, res) => {
    const { decision, rejection_reason } = req.body;
    const [[submission]] = await db.query('SELECT * FROM kyc_submissions WHERE id = ?', [req.params.id]);
    if (!submission) return res.status(404).json({ error: 'NOT_FOUND' });

    if (decision === 'approved') {
        await db.query("UPDATE kyc_submissions SET status = 'approved', reviewed_by = ?, reviewed_at = NOW() WHERE id = ?", [req.user.id, req.params.id]);
        await db.query("UPDATE users SET kyc_status = 'approved', is_verified = 1 WHERE id = ?", [submission.user_id]);

        // Fetch user role for personalised message
        const [[targetUser]] = await db.query('SELECT role, full_name FROM users WHERE id = ?', [submission.user_id]);
        const roleMsg = targetUser?.role === 'freelancer'
            ? 'Clients can now see your verified badge on your profile and search results.'
            : 'You can now hire freelancers with full platform trust.';

        await enqueueNotification(submission.user_id, 'kyc_approved', {
            title: '✅ Identity Verified!',
            title_am: '✅ ማንነትዎ ተረጋግጧል!',
            message: `Congratulations ${targetUser?.full_name || ''}! Your identity has been verified. ${roleMsg} Your verified badge is now live.`,
            message_am: `እንኳን ደስ አለዎት! ማንነትዎ ተረጋግጧል። የተረጋገጠ ምልክትዎ አሁን ንቁ ነው።`
        });
    } else {
        await db.query("UPDATE kyc_submissions SET status = 'rejected', rejection_reason = ?, reviewed_by = ?, reviewed_at = NOW() WHERE id = ?", [rejection_reason, req.user.id, req.params.id]);
        await db.query("UPDATE users SET kyc_status = 'rejected' WHERE id = ?", [submission.user_id]);

        await enqueueNotification(submission.user_id, 'kyc_rejected', {
            title: '❌ Verification Unsuccessful',
            title_am: '❌ ማረጋገጫ አልተሳካም',
            message: `Your identity verification was not approved. Reason: ${rejection_reason || 'Documents were unclear or invalid.'}. Please visit the verification page to resubmit.`,
            message_am: `የማንነት ማረጋገጫዎ አልተፈቀደም። ምክንያት: ${rejection_reason || 'ሰነዶቹ ግልጽ አልነበሩም።'}. እባክዎ ዳግም ያስገቡ።`
        });
    }
    res.json({ success: true });
});

module.exports = router;
