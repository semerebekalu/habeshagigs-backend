const jwt = require('jsonwebtoken');
const { JWT_SECRET } = require('../middleware/auth');

function signToken(payload, expiresIn = '7d') {
    return jwt.sign(payload, JWT_SECRET, { expiresIn });
}

function decodeToken(token) {
    return jwt.decode(token);
}

module.exports = { signToken, decodeToken };
