/**
 * KYC Image Verifier
 * Analyses uploaded selfie and ID document images on the spot.
 * 
 * Strategy (layered):
 *  1. Basic sanity — valid image, min dimensions, not blank/solid colour
 *  2. If SIGHTENGINE_API_USER + SIGHTENGINE_API_SECRET are set → call Sightengine
 *     (free tier: 500 ops/month) for face detection on selfie and document detection on ID
 *  3. If no API keys → fall back to heuristic checks only (still catches corrupt/blank/wrong-format files)
 */

const sharp = require('sharp');
const fetch = require('node-fetch');
const fs = require('fs');

const SIGHTENGINE_USER = process.env.SIGHTENGINE_API_USER;
const SIGHTENGINE_SECRET = process.env.SIGHTENGINE_API_SECRET;
const USE_API = !!(SIGHTENGINE_USER && SIGHTENGINE_SECRET);

// Minimum image dimensions to be considered valid
const MIN_WIDTH = 100;
const MIN_HEIGHT = 100;

/**
 * Checks basic image validity using sharp metadata.
 * Returns { ok, reason }
 */
async function basicImageCheck(filePath) {
    try {
        const meta = await sharp(filePath).metadata();

        if (!meta || !meta.format) {
            return { ok: false, reason: 'File does not appear to be a valid image.' };
        }

        const allowed = ['jpeg', 'jpg', 'png', 'webp', 'heif', 'heic'];
        if (!allowed.includes(meta.format)) {
            return { ok: false, reason: `Unsupported image format: ${meta.format}. Please upload a JPEG or PNG.` };
        }

        if (meta.width < MIN_WIDTH || meta.height < MIN_HEIGHT) {
            return { ok: false, reason: `Image is too small (${meta.width}x${meta.height}). Please upload a clearer, higher-resolution image.` };
        }

        // Check if image is mostly a single colour (blank/solid) — indicates a placeholder or corrupt scan
        const { dominant } = await sharp(filePath)
            .resize(50, 50, { fit: 'fill' })
            .toColorspace('srgb')
            .stats();

        // If all channels have very low standard deviation → solid colour image
        const stats = await sharp(filePath).resize(50, 50).stats();
        const avgStdDev = stats.channels.reduce((sum, ch) => sum + ch.stdev, 0) / stats.channels.length;
        if (avgStdDev < 8) {
            return { ok: false, reason: 'Image appears to be blank or a solid colour. Please upload a real photo.' };
        }

        return { ok: true };
    } catch (err) {
        return { ok: false, reason: 'Could not read the image file. Please upload a valid photo.' };
    }
}

/**
 * Calls Sightengine API to detect faces in a selfie image.
 * Returns { ok, reason, faceCount }
 */
async function checkFaceViaSightengine(filePath) {
    try {
        const FormData = require('form-data');
        const form = new FormData();
        form.append('media', fs.createReadStream(filePath));
        form.append('models', 'face');
        form.append('api_user', SIGHTENGINE_USER);
        form.append('api_secret', SIGHTENGINE_SECRET);

        const response = await fetch('https://api.sightengine.com/1.0/check.json', {
            method: 'POST',
            body: form,
            timeout: 10000
        });

        const data = await response.json();

        if (data.status !== 'success') {
            // API error — fail open (don't block user due to API issues)
            console.warn('[KYC] Sightengine API error:', data.error);
            return { ok: true, apiError: true };
        }

        const faceCount = data.faces?.length || 0;

        if (faceCount === 0) {
            return { ok: false, reason: 'No face detected in your selfie. Please take a clear photo of your face looking directly at the camera.', faceCount };
        }

        if (faceCount > 1) {
            return { ok: false, reason: 'Multiple faces detected. Your selfie must show only your face.', faceCount };
        }

        return { ok: true, faceCount };
    } catch (err) {
        console.warn('[KYC] Sightengine face check failed:', err.message);
        return { ok: true, apiError: true }; // fail open on network errors
    }
}

/**
 * Calls Sightengine to check if image contains a document/ID card.
 * Returns { ok, reason }
 */
async function checkIdDocumentViaSightengine(filePath) {
    try {
        const FormData = require('form-data');
        const form = new FormData();
        form.append('media', fs.createReadStream(filePath));
        form.append('models', 'id-document');
        form.append('api_user', SIGHTENGINE_USER);
        form.append('api_secret', SIGHTENGINE_SECRET);

        const response = await fetch('https://api.sightengine.com/1.0/check.json', {
            method: 'POST',
            body: form,
            timeout: 10000
        });

        const data = await response.json();

        if (data.status !== 'success') {
            console.warn('[KYC] Sightengine ID check error:', data.error);
            return { ok: true, apiError: true };
        }

        // Sightengine returns id_document.found: true/false
        const found = data.id_document?.found;
        if (found === false) {
            return { ok: false, reason: 'No ID document detected in the uploaded image. Please upload a clear photo of your national ID, passport, or driver\'s license.' };
        }

        return { ok: true };
    } catch (err) {
        console.warn('[KYC] Sightengine ID check failed:', err.message);
        return { ok: true, apiError: true };
    }
}

/**
 * Heuristic face check (no API) — uses image statistics to guess if a selfie is plausible.
 * Not as accurate as ML but catches obvious non-photos (screenshots, logos, blank images).
 */
async function heuristicSelfieCheck(filePath) {
    try {
        const meta = await sharp(filePath).metadata();

        // Selfies are typically portrait or near-square
        const ratio = meta.width / meta.height;
        if (ratio > 3 || ratio < 0.2) {
            return { ok: false, reason: 'Your selfie has an unusual aspect ratio. Please upload a standard portrait photo of your face.' };
        }

        // Check colour variance — a real face photo has moderate variance
        const stats = await sharp(filePath).resize(100, 100).stats();
        const avgStdDev = stats.channels.reduce((sum, ch) => sum + ch.stdev, 0) / stats.channels.length;

        if (avgStdDev < 15) {
            return { ok: false, reason: 'Your selfie appears to be blank or a solid colour. Please take a real photo of your face.' };
        }

        return { ok: true };
    } catch (err) {
        return { ok: false, reason: 'Could not analyse the selfie image.' };
    }
}

/**
 * Heuristic ID document check — checks aspect ratio and image properties typical of ID cards.
 */
async function heuristicIdCheck(filePath) {
    try {
        const meta = await sharp(filePath).metadata();

        // ID cards are typically landscape (wider than tall), passports are portrait
        // We accept both but reject very unusual ratios
        const ratio = meta.width / meta.height;
        if (ratio > 5 || ratio < 0.15) {
            return { ok: false, reason: 'Your ID document image has an unusual shape. Please upload a clear, flat photo of your ID card or passport.' };
        }

        // Minimum size for a readable ID
        if (meta.width < 200 || meta.height < 120) {
            return { ok: false, reason: 'Your ID document image is too small to read. Please upload a higher resolution photo.' };
        }

        const stats = await sharp(filePath).resize(100, 100).stats();
        const avgStdDev = stats.channels.reduce((sum, ch) => sum + ch.stdev, 0) / stats.channels.length;

        if (avgStdDev < 10) {
            return { ok: false, reason: 'Your ID document image appears blank. Please upload a clear photo of your ID.' };
        }

        return { ok: true };
    } catch (err) {
        return { ok: false, reason: 'Could not analyse the ID document image.' };
    }
}

/**
 * Main export: verifies a selfie image.
 * @param {string} filePath - absolute path to the uploaded selfie
 * @returns {{ ok: boolean, reason?: string }}
 */
async function verifySelfie(filePath) {
    const basic = await basicImageCheck(filePath);
    if (!basic.ok) return basic;

    if (USE_API) {
        return checkFaceViaSightengine(filePath);
    }
    return heuristicSelfieCheck(filePath);
}

/**
 * Main export: verifies an ID document image.
 * @param {string} filePath - absolute path to the uploaded ID document
 * @returns {{ ok: boolean, reason?: string }}
 */
async function verifyIdDocument(filePath) {
    const basic = await basicImageCheck(filePath);
    if (!basic.ok) return basic;

    if (USE_API) {
        return checkIdDocumentViaSightengine(filePath);
    }
    return heuristicIdCheck(filePath);
}

module.exports = { verifySelfie, verifyIdDocument, USE_API };
