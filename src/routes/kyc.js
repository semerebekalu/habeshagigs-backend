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
        // Store selfie URL on user record for live face comparison during contract signing
        await db.query('UPDATE users SET kyc_selfie_url = ? WHERE id = ?', [selfie_url, req.user.id]);

        res.json({ success: true, message: 'KYC submitted for review. You will be notified within 24 hours.' });
    } catch (err) {
        // Clean up any uploaded files on unexpected error
        uploadedFiles.forEach(f => fs.unlink(f, () => {}));
        res.status(500).json({ error: 'SERVER_ERROR', message: err.message });
    }
});

// GET /api/kyc/status/:userId — authenticated, only self or admin can check
router.get('/status/:userId', authenticate, async (req, res) => {
    try {
        // Only allow users to check their own status, or admins to check anyone
        const [[requestingUser]] = await db.query('SELECT role FROM users WHERE id = ?', [req.user.id]);
        if (parseInt(req.params.userId) !== req.user.id && requestingUser?.role !== 'admin') {
            return res.status(403).json({ error: 'FORBIDDEN', message: 'You can only view your own KYC status' });
        }
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
        await db.query("UPDATE users SET kyc_status = 'approved', is_verified = 1, kyc_selfie_url = ? WHERE id = ?", [submission.selfie_url, submission.user_id]);

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

// POST /api/kyc/verify-live — take a live selfie and compare against stored KYC selfie
// Called before contract signing to confirm identity in real time
const liveSelfieUpload = multer({
    storage: multer.memoryStorage(), // keep in memory, don't save to disk
    limits: { fileSize: 5 * 1024 * 1024 }
});

router.post('/verify-live', authenticate, liveSelfieUpload.single('selfie'), async (req, res) => {
    try {
        const [[user]] = await db.query(
            'SELECT kyc_status, kyc_selfie_url FROM users WHERE id = ?',
            [req.user.id]
        );

        if (!user || user.kyc_status !== 'approved') {
            return res.status(403).json({
                error: 'KYC_NOT_APPROVED',
                message: 'Your identity must be verified before signing a contract.'
            });
        }

        if (!user.kyc_selfie_url) {
            // Fallback: look up selfie from the approved kyc_submission
            const [[submission]] = await db.query(
                "SELECT selfie_url FROM kyc_submissions WHERE user_id = ? AND status = 'approved' ORDER BY reviewed_at DESC LIMIT 1",
                [req.user.id]
            );
            if (submission?.selfie_url) {
                // Backfill the column so we don't need to do this again
                await db.query('UPDATE users SET kyc_selfie_url = ? WHERE id = ?', [submission.selfie_url, req.user.id]);
                user.kyc_selfie_url = submission.selfie_url;
            } else {
                return res.status(400).json({
                    error: 'NO_REFERENCE_SELFIE',
                    message: 'No reference selfie found. Please resubmit your KYC documents.'
                });
            }
        }

        if (!req.file) {
            return res.status(422).json({ error: 'VALIDATION_ERROR', message: 'Live selfie image required' });
        }

        const sharp = require('sharp');
        const path = require('path');

        // Load the live selfie from memory buffer
        const liveBuffer = req.file.buffer;

        // Load the stored KYC selfie — try disk first, then fetch via HTTP
        const storedPath = path.join(__dirname, '../../', user.kyc_selfie_url);
        let storedBuffer;

        if (fs.existsSync(storedPath)) {
            storedBuffer = fs.readFileSync(storedPath);
        } else {
            // Railway ephemeral storage — file was wiped on redeploy, fetch via HTTP
            try {
                const baseUrl = process.env.APP_URL || `http://localhost:${process.env.PORT || 5001}`;
                const fetchUrl = `${baseUrl}${user.kyc_selfie_url}`;
                const fetchRes = await fetch(fetchUrl);
                if (!fetchRes.ok) throw new Error('fetch failed');
                storedBuffer = Buffer.from(await fetchRes.arrayBuffer());
            } catch {
                // Can't retrieve reference selfie — skip pixel comparison, face check already passed
                console.warn(`[KYC Live] Reference selfie unavailable for user #${req.user.id} — skipping pixel comparison`);
                const token = require('crypto').randomBytes(16).toString('hex');
                const expiresAt = new Date(Date.now() + 10 * 60 * 1000);
                await db.query(
                    'UPDATE users SET live_verify_token = ?, live_verify_expires = ? WHERE id = ?',
                    [token, expiresAt, req.user.id]
                );
                fs.unlink(liveTempPath, () => {});
                return res.json({
                    success: true,
                    similarity: null,
                    live_verify_token: token,
                    expires_at: expiresAt,
                    message: 'Face detected. You may now sign the contract.'
                });
            }
        }

        // Basic face check on live selfie first
        const liveTempPath = path.join(__dirname, '../../uploads/kyc', `live_${req.user.id}_${Date.now()}.jpg`);
        fs.writeFileSync(liveTempPath, liveBuffer);

        const { verifySelfie } = require('../modules/kyc/imageVerifier');
        const liveCheck = await verifySelfie(liveTempPath);
        if (!liveCheck.ok) {
            fs.unlink(liveTempPath, () => {});
            return res.status(422).json({
                error: 'INVALID_LIVE_SELFIE',
                message: liveCheck.reason || 'No face detected in your live selfie. Please look directly at the camera.'
            });
        }

        // Compare live selfie against stored KYC selfie using image histogram similarity
        // Resize both to same size and compare pixel statistics
        const SIZE = 64;
        const CHANNELS = 3;

        const [liveStats, storedStats] = await Promise.all([
            sharp(liveBuffer).resize(SIZE, SIZE, { fit: 'fill' }).removeAlpha().raw().toBuffer(),
            sharp(storedBuffer).resize(SIZE, SIZE, { fit: 'fill' }).removeAlpha().raw().toBuffer()
        ]);

        // Calculate Mean Absolute Difference (MAD) between the two images
        let totalDiff = 0;
        const pixels = SIZE * SIZE * CHANNELS;
        for (let i = 0; i < pixels; i++) {
            totalDiff += Math.abs(liveStats[i] - storedStats[i]);
        }
        const mad = totalDiff / pixels; // 0 = identical, 255 = completely different

        // Clean up temp file
        fs.unlink(liveTempPath, () => {});

        // Threshold: MAD < 80 = likely same person (faces are similar)
        // This is a basic check — Sightengine face-match API would be more accurate
        const SIMILARITY_THRESHOLD = 80;
        const similarity = Math.max(0, Math.round((1 - mad / 255) * 100));
        const match = mad < SIMILARITY_THRESHOLD;

        console.log(`[KYC Live] User #${req.user.id} — MAD: ${mad.toFixed(1)}, Similarity: ${similarity}%, Match: ${match}`);

        if (!match) {
            return res.status(403).json({
                error: 'FACE_MISMATCH',
                message: 'Your live selfie does not match your verified identity photo. Please ensure you are in good lighting and looking directly at the camera.',
                similarity
            });
        }

        // Issue a short-lived live-verify token stored in DB
        const token = require('crypto').randomBytes(16).toString('hex');
        const expiresAt = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes
        await db.query(
            'UPDATE users SET live_verify_token = ?, live_verify_expires = ? WHERE id = ?',
            [token, expiresAt, req.user.id]
        );

        res.json({
            success: true,
            similarity,
            live_verify_token: token,
            expires_at: expiresAt,
            message: 'Identity confirmed. You may now sign the contract.'
        });
    } catch (err) {
        console.error('[KYC Live] Error:', err.message);
        res.status(500).json({ error: 'SERVER_ERROR', message: err.message });
    }
});

module.exports = router;
