const express = require('express');
const router = express.Router();
const PDFDocument = require('pdfkit');
const { db } = require('../config/db');
const { authenticate } = require('../middleware/auth');

// GET /api/invoices/:contractId — supports both Bearer token and ?token= query param
router.get('/:contractId', async (req, res) => {
    // Accept token from Authorization header OR query string (for direct link downloads)
    let token = null;
    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith('Bearer ')) {
        token = authHeader.split(' ')[1];
    } else if (req.query.token) {
        token = req.query.token;
    }

    if (!token) return res.status(401).json({ error: 'TOKEN_MISSING' });

    try {
        const jwt = require('jsonwebtoken');
        const decoded = jwt.verify(token, process.env.JWT_SECRET || 'ethiogigs_jwt_secret_2026');
        const userId = decoded.id;

        const [[contract]] = await db.query(
            `SELECT c.*, u1.full_name as client_name, u1.email as client_email,
                    u2.full_name as freelancer_name, u2.email as freelancer_email,
                    j.title as job_title
             FROM contracts c
             JOIN users u1 ON c.client_id = u1.id
             JOIN users u2 ON c.freelancer_id = u2.id
             LEFT JOIN jobs j ON c.job_id = j.id
             WHERE c.id = ? AND (c.client_id = ? OR c.freelancer_id = ?)`,
            [req.params.contractId, userId, userId]
        );
        if (!contract) return res.status(404).json({ error: 'CONTRACT_NOT_FOUND' });

        // Fetch milestones for line items
        const [milestones] = await db.query(
            'SELECT title, amount, status FROM milestones WHERE contract_id = ? ORDER BY id ASC',
            [req.params.contractId]
        );

        const doc = new PDFDocument({ margin: 50 });
        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `attachment; filename=invoice-${contract.id}.pdf`);
        doc.pipe(res);

        // Header
        doc.fontSize(24).fillColor('#1E3A8A').text('ETHIO GIGS', 50, 50);
        doc.fontSize(10).fillColor('#64748B').text("Ethiopia's Freelance Marketplace", 50, 80);
        doc.moveTo(50, 100).lineTo(550, 100).strokeColor('#E2E8F0').stroke();

        // Invoice title
        doc.fontSize(18).fillColor('#1E293B').text('INVOICE', 400, 50);
        doc.fontSize(10).fillColor('#64748B')
            .text(`Invoice #: INV-${String(contract.id).padStart(6, '0')}`, 400, 75)
            .text(`Date: ${new Date().toLocaleDateString()}`, 400, 90);

        // Parties
        doc.fontSize(12).fillColor('#1E293B').text('Bill From:', 50, 120);
        doc.fontSize(10).fillColor('#64748B')
            .text(contract.freelancer_name || 'Freelancer', 50, 138)
            .text(contract.freelancer_email || '', 50, 153);

        doc.fontSize(12).fillColor('#1E293B').text('Bill To:', 300, 120);
        doc.fontSize(10).fillColor('#64748B')
            .text(contract.client_name || 'Client', 300, 138)
            .text(contract.client_email || '', 300, 153);

        doc.moveTo(50, 185).lineTo(550, 185).strokeColor('#E2E8F0').stroke();

        // Table header
        doc.fontSize(10).fillColor('#64748B')
            .text('Description', 50, 200)
            .text('Status', 320, 200)
            .text('Amount', 450, 200);
        doc.moveTo(50, 215).lineTo(550, 215).strokeColor('#E2E8F0').stroke();

        // Line items — milestones if available, otherwise single line
        let yPos = 230;
        const totalAmount = parseFloat(contract.total_amount || 0);
        const platformFee = parseFloat(contract.platform_fee || 0);

        if (milestones.length > 0) {
            for (const ms of milestones) {
                const msStatus = ms.status === 'released' ? '✓ Paid' : ms.status === 'approved' ? 'Approved' : ms.status === 'submitted' ? 'In Review' : 'Pending';
                doc.fontSize(10).fillColor('#1E293B')
                    .text(ms.title || 'Milestone', 50, yPos, { width: 260 })
                    .fillColor('#64748B').text(msStatus, 320, yPos)
                    .fillColor('#1E293B').text(`${parseFloat(ms.amount || 0).toFixed(2)} ETB`, 450, yPos);
                yPos += 22;
                if (yPos > 650) { doc.addPage(); yPos = 50; }
            }
        } else {
            doc.fontSize(11).fillColor('#1E293B')
                .text(contract.job_title || 'Freelance Service', 50, yPos)
                .text('—', 320, yPos)
                .text(`${totalAmount.toFixed(2)} ETB`, 450, yPos);
            yPos += 22;
        }

        yPos += 8;
        doc.moveTo(50, yPos).lineTo(550, yPos).strokeColor('#E2E8F0').stroke();
        yPos += 12;

        if (platformFee > 0) {
            doc.fontSize(10).fillColor('#64748B')
                .text('Platform Fee (10%)', 50, yPos)
                .text('', 320, yPos)
                .text(`-${platformFee.toFixed(2)} ETB`, 450, yPos);
            yPos += 20;
        }

        doc.moveTo(50, yPos).lineTo(550, yPos).strokeColor('#E2E8F0').stroke();
        yPos += 12;

        doc.fontSize(13).fillColor('#1E3A8A')
            .text('Total', 50, yPos)
            .text(`${totalAmount.toFixed(2)} ETB`, 450, yPos);
        yPos += 30;

        // Contract status
        doc.fontSize(10).fillColor('#64748B')
            .text(`Contract Status: ${contract.status}`, 50, yPos)
            .text(`Contract ID: #${contract.id}`, 50, yPos + 15)
            .text(`Signed: ${contract.client_signed && contract.freelancer_signed ? 'Yes — both parties' : 'Pending'}`, 50, yPos + 30);

        // Footer
        doc.fontSize(9).fillColor('#94A3B8')
            .text('Thank you for using Ethio Gigs. This is an auto-generated invoice.', 50, 700, { align: 'center', width: 500 });

        doc.end();
    } catch (err) {
        if (err.name === 'JsonWebTokenError' || err.name === 'TokenExpiredError') {
            return res.status(401).json({ error: 'TOKEN_INVALID' });
        }
        res.status(500).json({ error: 'SERVER_ERROR', message: err.message });
    }
});

module.exports = router;
