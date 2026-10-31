"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.register = register;
exports.login = login;
const authService_1 = require("../services/authService");
function isRecord(value) {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}
async function register(req, res) {
    const body = req.body;
    const errors = [];
    let username = '';
    let password = '';
    if (!isRecord(body)) {
        res.status(400).json({ error: 'Validation Failed', details: ['Request body must be a JSON object'] });
        return;
    }
    if (typeof body['username'] !== 'string' || !/^[a-zA-Z0-9_]{3,30}$/.test(body['username'])) {
        errors.push('"username" must be 3-30 characters: letters, numbers or underscore');
    }
    else {
        username = body['username'];
    }
    // bcrypt only uses the first 72 bytes, so longer passwords are rejected.
    if (typeof body['password'] !== 'string' ||
        body['password'].length < 8 ||
        Buffer.byteLength(body['password']) > 72) {
        errors.push('"password" must be at least 8 characters (72 bytes maximum)');
    }
    else {
        password = body['password'];
    }
    if (errors.length > 0) {
        res.status(400).json({ error: 'Validation Failed', details: errors });
        return;
    }
    try {
        // Role is always USER here. Clients can never pick their own role (prevents privilege escalation).
        const user = await (0, authService_1.registerUser)(username, password, 'USER');
        res.status(201).json({ data: user });
    }
    catch (error) {
        if (error instanceof authService_1.UsernameTakenError) {
            res.status(409).json({ error: 'Conflict', message: error.message });
            return;
        }
        throw error;
    }
}
async function login(req, res) {
    const body = req.body;
    if (!isRecord(body) || typeof body['username'] !== 'string' || typeof body['password'] !== 'string') {
        res.status(400).json({ error: 'Bad Request', message: '"username" and "password" are required' });
        return;
    }
    const user = await (0, authService_1.verifyCredentials)(body['username'], body['password']);
    if (user === undefined) {
        // One generic message for both "no such user" and "wrong password".
        res.status(401).json({ error: 'Unauthorized', message: 'Invalid username or password' });
        return;
    }
    const token = (0, authService_1.signToken)(user);
    res.status(200).json({
        message: 'Login successful',
        tokenType: 'Bearer',
        expiresIn: '1h',
        token,
        user,
    });
}
//# sourceMappingURL=authController.js.map