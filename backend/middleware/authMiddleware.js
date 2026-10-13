const jwt = require('jsonwebtoken');
const pool = require('../services/mysqlService');
const JWT_SECRET = 'supersecret_dataintel_key';

module.exports = async function (req, res, next) {
    const token = req.header('x-auth-token');

    if (!token) {
        return res.status(401).json({ msg: 'No token, authorization denied' });
    }

    try {
        const decoded = jwt.verify(token, JWT_SECRET);
        const [users] = await pool.query('SELECT id, username FROM users WHERE id = ?', [decoded.id]);
        if (!users || users.length === 0) {
            return res.status(401).json({ msg: 'Session expired or user not found. Please log in again.' });
        }
        req.user = users[0];
        next();
    } catch (err) {
        res.status(401).json({ msg: 'Token is not valid' });
    }
};
