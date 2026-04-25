const express = require('express');
const router = express.Router();
const { db } = require('../config/db');
const { authenticate } = require('../middleware/auth');

// POST /api/group-chats — create group (client hires a team)
router.post('/', authenticate, async (req, res) => {
    const { name, member_ids, contract_id } = req.body;
    if (!name) return res.status(422).json({ error: 'VALIDATION_ERROR', message: 'Group name required' });
    try {
        const [result] = await db.query(
            'INSERT INTO group_chats (name, contract_id, created_by) VALUES (?, ?, ?)',
            [name, contract_id || null, req.user.id]
        );
        const groupId = result.insertId;
        // Add creator
        await db.query('INSERT INTO group_chat_members (group_id, user_id) VALUES (?, ?)', [groupId, req.user.id]);
        // Add members
        if (member_ids && member_ids.length) {
            for (const uid of member_ids) {
                await db.query('INSERT IGNORE INTO group_chat_members (group_id, user_id) VALUES (?, ?)', [groupId, uid]);
            }
        }
        res.status(201).json({ success: true, group_id: groupId });
    } catch (err) {
        res.status(500).json({ error: 'SERVER_ERROR', message: err.message });
    }
});

// GET /api/group-chats — list my groups
router.get('/', authenticate, async (req, res) => {
    try {
        const [groups] = await db.query(
            `SELECT gc.*, u.full_name as creator_name,
                (SELECT COUNT(*) FROM group_chat_members WHERE group_id = gc.id) as member_count,
                (SELECT content FROM group_messages WHERE group_id = gc.id ORDER BY created_at DESC LIMIT 1) as last_message
             FROM group_chats gc
             JOIN group_chat_members gcm ON gc.id = gcm.group_id
             JOIN users u ON gc.created_by = u.id
             WHERE gcm.user_id = ?
             ORDER BY gc.created_at DESC`,
            [req.user.id]
        );
        res.json(groups);
    } catch (err) {
        res.status(500).json({ error: 'SERVER_ERROR', message: err.message });
    }
});

// GET /api/group-chats/:id — get group with members
router.get('/:id', authenticate, async (req, res) => {
    try {
        const [[group]] = await db.query('SELECT * FROM group_chats WHERE id = ?', [req.params.id]);
        if (!group) return res.status(404).json({ error: 'NOT_FOUND' });
        const [members] = await db.query(
            `SELECT u.id, u.full_name, u.role, u.is_verified FROM group_chat_members gcm
             JOIN users u ON gcm.user_id = u.id WHERE gcm.group_id = ?`,
            [req.params.id]
        );
        group.members = members;
        res.json(group);
    } catch (err) {
        res.status(500).json({ error: 'SERVER_ERROR', message: err.message });
    }
});

// GET /api/group-chats/:id/messages
router.get('/:id/messages', authenticate, async (req, res) => {
    try {
        const [messages] = await db.query(
            `SELECT gm.*, u.full_name as sender_name FROM group_messages gm
             JOIN users u ON gm.sender_id = u.id
             WHERE gm.group_id = ? ORDER BY gm.created_at ASC`,
            [req.params.id]
        );
        res.json(messages);
    } catch (err) {
        res.status(500).json({ error: 'SERVER_ERROR', message: err.message });
    }
});

// POST /api/group-chats/:id/messages
router.post('/:id/messages', authenticate, async (req, res) => {
    const { content, content_type } = req.body;
    if (!content) return res.status(422).json({ error: 'VALIDATION_ERROR' });
    try {
        const [result] = await db.query(
            'INSERT INTO group_messages (group_id, sender_id, content, content_type) VALUES (?, ?, ?, ?)',
            [req.params.id, req.user.id, content, content_type || 'text']
        );
        res.status(201).json({ success: true, message_id: result.insertId });
    } catch (err) {
        res.status(500).json({ error: 'SERVER_ERROR', message: err.message });
    }
});

// POST /api/group-chats/:id/members — add member
router.post('/:id/members', authenticate, async (req, res) => {
    const { user_id } = req.body;
    try {
        await db.query('INSERT IGNORE INTO group_chat_members (group_id, user_id) VALUES (?, ?)', [req.params.id, user_id]);
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: 'SERVER_ERROR', message: err.message });
    }
});

module.exports = router;
