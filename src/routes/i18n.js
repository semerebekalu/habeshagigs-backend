const express = require('express');
const router = express.Router();
const en = require('../i18n/en.json');
const am = require('../i18n/am.json');

router.get('/:lang', (req, res) => {
    const lang = req.params.lang;
    if (lang === 'am') return res.json(am);
    return res.json(en);
});

module.exports = router;
