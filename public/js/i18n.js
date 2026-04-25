// ── i18n / Language toggle ─────────────────────────────────
let currentLang = localStorage.getItem('eg_lang') || 'en';
let strings = {};

async function loadStrings(lang) {
    try {
        const res = await fetch(`/api/i18n/${lang}`);
        strings = await res.json();
        applyStrings();
        localStorage.setItem('eg_lang', lang);
        currentLang = lang;
        const btn = document.getElementById('langToggle');
        if (btn) btn.textContent = lang === 'am' ? '🇬🇧 English' : '🇪🇹 አማርኛ';
        document.documentElement.lang = lang;
    } catch {}
}

function t(key) {
    const parts = key.split('.');
    let val = strings;
    for (const p of parts) { val = val?.[p]; }
    return val || key;
}

function applyStrings() {
    document.querySelectorAll('[data-i18n]').forEach(el => {
        const key = el.getAttribute('data-i18n');
        el.textContent = t(key);
    });
    document.querySelectorAll('[data-i18n-placeholder]').forEach(el => {
        el.placeholder = t(el.getAttribute('data-i18n-placeholder'));
    });
}

document.getElementById('langToggle')?.addEventListener('click', () => {
    loadStrings(currentLang === 'en' ? 'am' : 'en');
});

loadStrings(currentLang);
