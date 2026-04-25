const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { db } = require('../config/db');
const { authenticate } = require('../middleware/auth');

// File upload for chat attachments (25 MB limit per requirement 5.3)
const chatUploadDir = path.join(__dirname, '../../uploads/chat');
if (!fs.existsSync(chatUploadDir)) fs.mkdirSync(chatUploadDir, { recursive: true });
const chatStorage = multer.diskStorage({
    destination: (req, file, cb) => cb(null, chatUploadDir),
    filename: (req, file, cb) => cb(null, `${Date.now()}-${file.originalname.replace(/\s+/g, '_')}`)
});
const uploadChatFile = multer({
    storage: chatStorage,
    limits: { fileSize: 25 * 1024 * 1024 }, // 25 MB
    fileFilter: (req, file, cb) => {
        const allowed = ['image/jpeg', 'image/png', 'image/gif', 'image/webp',
            'application/pdf', 'application/msword',
            'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
            'application/vnd.ms-excel',
            'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
            'audio/mpeg', 'audio/wav', 'audio/ogg', 'audio/webm'];
        if (allowed.includes(file.mimetype)) cb(null, true);
        else cb(new Error('FILE_TYPE_NOT_ALLOWED'));
    }
});

// GET /api/chat/conversations/:userId
router.get('/conversations/:userId', authenticate, async (req, res) => {
    try {
        const [convs] = await db.query(
            `SELECT c.*,
                u1.full_name as participant_a_name,
                u2.full_name as participant_b_name,
                (SELECT content FROM messages WHERE conversation_id = c.id ORDER BY created_at DESC LIMIT 1) as last_message,
                (SELECT created_at FROM messages WHERE conversation_id = c.id ORDER BY created_at DESC LIMIT 1) as last_message_time
             FROM conversations c
             JOIN users u1 ON c.participant_a = u1.id
             JOIN users u2 ON c.participant_b = u2.id
             WHERE c.participant_a = ? OR c.participant_b = ?
             ORDER BY last_message_time DESC`,
            [req.params.userId, req.params.userId]
        );
        res.json(convs);
    } catch (err) {
        res.status(500).json({ error: 'SERVER_ERROR', message: err.message });
    }
});

// GET /api/chat/messages/:conversationId
router.get('/messages/:conversationId', authenticate, async (req, res) => {
    try {
        const [messages] = await db.query(
            `SELECT m.*, u.full_name as sender_name FROM messages m
             JOIN users u ON m.sender_id = u.id
             WHERE m.conversation_id = ? ORDER BY m.created_at ASC`,
            [req.params.conversationId]
        );
        res.json(messages);
    } catch (err) {
        res.status(500).json({ error: 'SERVER_ERROR', message: err.message });
    }
});

// POST /api/chat/messages
router.post('/messages', authenticate, async (req, res) => {
    const { conversation_id, content, content_type, file_url } = req.body;
    if (!conversation_id || !content) return res.status(422).json({ error: 'VALIDATION_ERROR' });
    const [result] = await db.query(
        'INSERT INTO messages (conversation_id, sender_id, content, content_type, file_url) VALUES (?, ?, ?, ?, ?)',
        [conversation_id, req.user.id, content, content_type || 'text', file_url || null]
    );
    res.status(201).json({ success: true, message_id: result.insertId });
});

// POST /api/chat/upload — upload a file attachment (25 MB max)
router.post('/upload', authenticate, uploadChatFile.single('file'), async (req, res) => {
    if (!req.file) return res.status(422).json({ error: 'NO_FILE' });
    const fileUrl = `/uploads/chat/${req.file.filename}`;
    const contentType = req.file.mimetype.startsWith('image/') ? 'image'
        : req.file.mimetype.startsWith('audio/') ? 'voice'
        : 'document';
    res.json({ success: true, file_url: fileUrl, content_type: contentType, filename: req.file.originalname, size: req.file.size });
});

// Error handler for file size exceeded
router.use((err, req, res, next) => {
    if (err.code === 'LIMIT_FILE_SIZE') return res.status(413).json({ error: 'FILE_TOO_LARGE', message: 'File must be under 25 MB' });
    if (err.message === 'FILE_TYPE_NOT_ALLOWED') return res.status(422).json({ error: 'FILE_TYPE_NOT_ALLOWED' });
    next(err);
});

// POST /api/chat/report/:messageId
router.post('/report/:messageId', authenticate, async (req, res) => {
    await db.query('UPDATE messages SET is_reported = 1 WHERE id = ?', [req.params.messageId]);
    res.json({ success: true });
});

// POST /api/chat/conversations/start — get or create a 1:1 conversation
router.post('/conversations/start', authenticate, async (req, res) => {
    const { other_user_id } = req.body;
    if (!other_user_id) return res.status(422).json({ error: 'VALIDATION_ERROR' });
    try {
        // Check if conversation already exists
        const [[existing]] = await db.query(
            `SELECT id FROM conversations WHERE
             (participant_a = ? AND participant_b = ?) OR
             (participant_a = ? AND participant_b = ?) LIMIT 1`,
            [req.user.id, other_user_id, other_user_id, req.user.id]
        );
        if (existing) return res.json({ conversation_id: existing.id });
        // Create new
        const [result] = await db.query(
            'INSERT INTO conversations (participant_a, participant_b) VALUES (?, ?)',
            [req.user.id, other_user_id]
        );
        res.json({ conversation_id: result.insertId });
    } catch (err) {
        res.status(500).json({ error: 'SERVER_ERROR', message: err.message });
    }
});

module.exports = router;
