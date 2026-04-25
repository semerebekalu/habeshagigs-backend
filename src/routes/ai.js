const express = require('express');
const router = express.Router();
const { authenticate } = require('../middleware/auth');

/**
 * POST /api/translate
 * Inline Amharic ↔ English translation for messages (Requirement 5.4)
 */
router.post('/translate', authenticate, async (req, res) => {
    const { text, target_lang } = req.body; // target_lang: 'en' | 'am'
    if (!text) return res.status(422).json({ error: 'VALIDATION_ERROR', message: 'text is required' });

    const HF_TOKEN = process.env.HF_TOKEN || '';
    const isToEnglish = target_lang === 'en' || !target_lang;
    const prompt = isToEnglish
        ? `Translate the following Amharic text to English. Return only the translation, nothing else:\n\n${text}`
        : `Translate the following English text to Amharic. Return only the translation, nothing else:\n\n${text}`;

    if (HF_TOKEN) {
        try {
            const response = await fetch(
                'https://api-inference.huggingface.co/models/mistralai/Mistral-7B-Instruct-v0.1',
                {
                    method: 'POST',
                    headers: { 'Authorization': `Bearer ${HF_TOKEN}`, 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        inputs: `<s>[INST] ${prompt} [/INST]`,
                        parameters: { max_new_tokens: 200, temperature: 0.3, return_full_text: false }
                    })
                }
            );
            if (response.ok) {
                const data = await response.json();
                const translated = Array.isArray(data) ? data[0]?.generated_text : data?.generated_text;
                if (translated && translated.trim().length > 0) {
                    return res.json({ translated: translated.trim(), source_lang: isToEnglish ? 'am' : 'en', target_lang: isToEnglish ? 'en' : 'am' });
                }
            }
        } catch {}
    }

    // Fallback: return original with note
    res.json({ translated: text, source_lang: isToEnglish ? 'am' : 'en', target_lang: isToEnglish ? 'en' : 'am', note: 'Translation unavailable. Add HF_TOKEN to .env for AI translation.' });
});

/**
 * POST /api/ai/generate-job
 * Uses Hugging Face free Inference API (no billing required).
 * Falls back to a smart template-based generator if the API is unavailable.
 */
router.post('/generate-job', authenticate, async (req, res) => {
    const { title, project_type, budget_min, budget_max } = req.body;
    if (!title) return res.status(422).json({ error: 'VALIDATION_ERROR', message: 'Job title is required' });

    const budgetText = budget_min && budget_max
        ? `Budget: ${budget_min}–${budget_max} ETB. `
        : '';
    const typeText = project_type === 'hourly' ? 'This is an hourly project. ' : 'This is a fixed-price project. ';

    // Try Hugging Face free API first
    const HF_TOKEN = process.env.HF_TOKEN || '';
    const prompt = `Write a professional freelance job description for: "${title}". ${typeText}${budgetText}Include: what the client needs, required skills, deliverables, and what makes a good candidate. Keep it under 200 words. Be specific and professional.`;

    if (HF_TOKEN) {
        try {
            const response = await fetch(
                'https://api-inference.huggingface.co/models/mistralai/Mistral-7B-Instruct-v0.1',
                {
                    method: 'POST',
                    headers: {
                        'Authorization': `Bearer ${HF_TOKEN}`,
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({
                        inputs: `<s>[INST] ${prompt} [/INST]`,
                        parameters: { max_new_tokens: 300, temperature: 0.7, return_full_text: false }
                    })
                }
            );
            if (response.ok) {
                const data = await response.json();
                const text = Array.isArray(data) ? data[0]?.generated_text : data?.generated_text;
                if (text && text.trim().length > 50) {
                    return res.json({ description: text.trim() });
                }
            }
        } catch {}
    }

    // Smart template-based fallback (always works, no API needed)
    const description = generateSmartDescription(title, project_type, budget_min, budget_max);
    res.json({ description, note: 'Generated using smart templates. Add HF_TOKEN to .env for AI generation.' });
});

function generateSmartDescription(title, projectType, budgetMin, budgetMax) {
    const titleLower = title.toLowerCase();
    const budget = budgetMin && budgetMax ? `\n\n**Budget:** ${budgetMin}–${budgetMax} ETB` : '';
    const type = projectType === 'hourly' ? 'hourly basis' : 'fixed price';

    // Detect category from title keywords
    if (titleLower.includes('logo') || titleLower.includes('design') || titleLower.includes('brand')) {
        return `We are looking for a talented graphic designer to create a professional ${title}.\n\n**What we need:**\n- Original, creative design concepts\n- Multiple revision rounds until satisfaction\n- Final files in all required formats (AI, EPS, PNG, PDF)\n\n**Requirements:**\n- Proven portfolio of similar work\n- Strong understanding of brand identity\n- Ability to deliver on time\n\n**Deliverables:**\n- 3 initial concepts\n- Unlimited revisions\n- Final source files\n\nThis is a ${type} project.${budget}`;
    }
    if (titleLower.includes('web') || titleLower.includes('website') || titleLower.includes('react') || titleLower.includes('app') || titleLower.includes('develop')) {
        return `We are seeking an experienced developer to build ${title}.\n\n**What we need:**\n- Clean, responsive, and modern implementation\n- Well-structured and documented code\n- Cross-browser and mobile compatibility\n\n**Requirements:**\n- Proven experience with relevant technologies\n- Strong problem-solving skills\n- Good communication throughout the project\n\n**Deliverables:**\n- Fully functional application\n- Source code with documentation\n- Deployment assistance\n\nThis is a ${type} project.${budget}`;
    }
    if (titleLower.includes('translat') || titleLower.includes('amharic') || titleLower.includes('english')) {
        return `We need a professional translator for ${title}.\n\n**What we need:**\n- Accurate, natural-sounding translation\n- Cultural adaptation where appropriate\n- Proofreading and quality check\n\n**Requirements:**\n- Native or near-native proficiency in both languages\n- Experience with similar translation projects\n- Attention to detail\n\n**Deliverables:**\n- Translated document in original format\n- Glossary of key terms\n\nThis is a ${type} project.${budget}`;
    }
    if (titleLower.includes('video') || titleLower.includes('edit') || titleLower.includes('motion')) {
        return `We are looking for a skilled video editor for ${title}.\n\n**What we need:**\n- Professional editing with smooth transitions\n- Color grading and audio mixing\n- Motion graphics if required\n\n**Requirements:**\n- Portfolio of previous video work\n- Proficiency in Premiere Pro, DaVinci Resolve, or similar\n- Ability to meet deadlines\n\n**Deliverables:**\n- Final video in HD/4K\n- Project source files\n\nThis is a ${type} project.${budget}`;
    }
    if (titleLower.includes('writ') || titleLower.includes('content') || titleLower.includes('blog') || titleLower.includes('article')) {
        return `We need a talented writer for ${title}.\n\n**What we need:**\n- Well-researched, engaging content\n- SEO-optimized writing\n- Original work with no plagiarism\n\n**Requirements:**\n- Strong writing portfolio\n- Ability to match our brand voice\n- Timely delivery\n\n**Deliverables:**\n- Final content in Word/Google Doc format\n- SEO meta description\n- Plagiarism report\n\nThis is a ${type} project.${budget}`;
    }

    // Generic fallback
    return `We are looking for a skilled professional to help with: **${title}**.\n\n**What we need:**\n- High-quality work delivered on time\n- Clear communication throughout the project\n- Professional approach and attention to detail\n\n**Requirements:**\n- Relevant experience and portfolio\n- Strong communication skills\n- Ability to understand and meet project requirements\n\n**Deliverables:**\n- Completed work as discussed\n- Any source files or documentation\n- Post-delivery support\n\nPlease include your relevant experience and estimated timeline in your proposal. This is a ${type} project.${budget}`;
}

module.exports = router;
