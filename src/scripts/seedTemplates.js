require('dotenv').config();
const mysql = require('mysql2/promise');

const templates = [
    {
        name: 'Logo Design',
        category: 'Design',
        icon: '🎨',
        description: 'Professional logo design with multiple concepts, revisions, and final file delivery in all formats.',
        estimated_days: 7,
        price_range_min: 1500,
        price_range_max: 15000,
        default_milestones: JSON.stringify([
            { title: 'Initial Concepts (3 options)', percent: 30 },
            { title: 'Revisions & Refinement', percent: 40 },
            { title: 'Final Files Delivery', percent: 30 }
        ]),
        default_deliverables: JSON.stringify(['AI/EPS source files', 'PNG (transparent)', 'JPG', 'PDF', 'Brand guidelines'])
    },
    {
        name: 'Web Development',
        category: 'Development',
        icon: '💻',
        description: 'Full website development from design to deployment including responsive layout and CMS integration.',
        estimated_days: 30,
        price_range_min: 10000,
        price_range_max: 150000,
        default_milestones: JSON.stringify([
            { title: 'Design Mockups & Approval', percent: 20 },
            { title: 'Frontend Development', percent: 30 },
            { title: 'Backend & Database', percent: 30 },
            { title: 'Testing & Deployment', percent: 20 }
        ]),
        default_deliverables: JSON.stringify(['Source code (GitHub)', 'Deployed website', 'Admin panel access', 'Documentation', '30-day support'])
    },
    {
        name: 'Mobile App',
        category: 'Development',
        icon: '📱',
        description: 'Native or cross-platform mobile application for iOS and/or Android with full feature set.',
        estimated_days: 60,
        price_range_min: 30000,
        price_range_max: 500000,
        default_milestones: JSON.stringify([
            { title: 'UI/UX Design & Wireframes', percent: 15 },
            { title: 'Core Features Development', percent: 40 },
            { title: 'API Integration & Testing', percent: 30 },
            { title: 'App Store Submission', percent: 15 }
        ]),
        default_deliverables: JSON.stringify(['Source code', 'APK/IPA file', 'App Store listing', 'API documentation', 'User manual'])
    },
    {
        name: 'Translation',
        category: 'Writing',
        icon: '🌐',
        description: 'Professional document translation with native-level accuracy and cultural adaptation.',
        estimated_days: 5,
        price_range_min: 500,
        price_range_max: 10000,
        default_milestones: JSON.stringify([
            { title: 'First Draft Translation', percent: 60 },
            { title: 'Proofreading & Final Delivery', percent: 40 }
        ]),
        default_deliverables: JSON.stringify(['Translated document (Word/PDF)', 'Glossary of terms', 'Certificate of translation (if needed)'])
    },
    {
        name: 'Video Editing',
        category: 'Video',
        icon: '🎬',
        description: 'Professional video editing with color grading, sound design, motion graphics, and export in multiple formats.',
        estimated_days: 10,
        price_range_min: 2000,
        price_range_max: 50000,
        default_milestones: JSON.stringify([
            { title: 'Rough Cut Review', percent: 40 },
            { title: 'Color Grade & Sound Mix', percent: 35 },
            { title: 'Final Export & Delivery', percent: 25 }
        ]),
        default_deliverables: JSON.stringify(['Final video (MP4 1080p)', '4K version (if applicable)', 'Project file', 'Thumbnail design'])
    },
    {
        name: 'Content Writing',
        category: 'Writing',
        icon: '✍️',
        description: 'SEO-optimized articles, blog posts, or website copy written by native-level writers.',
        estimated_days: 7,
        price_range_min: 300,
        price_range_max: 5000,
        default_milestones: JSON.stringify([
            { title: 'Outline & Topic Approval', percent: 20 },
            { title: 'First Draft', percent: 50 },
            { title: 'Revisions & Final Delivery', percent: 30 }
        ]),
        default_deliverables: JSON.stringify(['Word/Google Doc', 'SEO meta description', 'Image suggestions', 'Plagiarism report'])
    },
    {
        name: 'UI/UX Design',
        category: 'Design',
        icon: '🖌️',
        description: 'Complete UI/UX design including user research, wireframes, prototypes, and design system.',
        estimated_days: 21,
        price_range_min: 8000,
        price_range_max: 80000,
        default_milestones: JSON.stringify([
            { title: 'User Research & Wireframes', percent: 25 },
            { title: 'High-Fidelity Mockups', percent: 40 },
            { title: 'Interactive Prototype', percent: 20 },
            { title: 'Design System & Handoff', percent: 15 }
        ]),
        default_deliverables: JSON.stringify(['Figma/XD source file', 'Interactive prototype link', 'Design system', 'Developer handoff notes', 'Asset exports'])
    },
    {
        name: 'Social Media Management',
        category: 'Marketing',
        icon: '📣',
        description: 'Monthly social media management including content creation, scheduling, and analytics reporting.',
        estimated_days: 30,
        price_range_min: 3000,
        price_range_max: 30000,
        default_milestones: JSON.stringify([
            { title: 'Strategy & Content Calendar', percent: 25 },
            { title: 'Week 1-2 Content & Posting', percent: 35 },
            { title: 'Week 3-4 + Monthly Report', percent: 40 }
        ]),
        default_deliverables: JSON.stringify(['Content calendar', '20+ posts/month', 'Graphic designs', 'Monthly analytics report', 'Hashtag strategy'])
    }
];

async function seed() {
    const db = await mysql.createConnection({
        host: process.env.DB_HOST || 'localhost',
        user: process.env.DB_USER || 'root',
        password: process.env.DB_PASSWORD || '',
        database: process.env.DB_NAME || 'habeshangigs',
        multipleStatements: true
    });

    // Check if already seeded
    const [[{ cnt }]] = await db.query('SELECT COUNT(*) as cnt FROM contract_templates');
    if (cnt > 0) {
        console.log('✅ Templates already seeded. Skipping.');
        await db.end();
        return;
    }

    for (const t of templates) {
        await db.query(
            `INSERT INTO contract_templates (name, category, icon, description, estimated_days, price_range_min, price_range_max, default_milestones, default_deliverables)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [t.name, t.category, t.icon, t.description, t.estimated_days, t.price_range_min, t.price_range_max, t.default_milestones, t.default_deliverables]
        );
        console.log(`✅ Seeded: ${t.name}`);
    }

    await db.end();
    console.log('\n🎉 Templates seeded successfully!');
}

seed().catch(err => {
    console.error('❌ Seed error:', err.message);
    process.exit(1);
});
