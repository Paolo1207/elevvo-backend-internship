"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
// Private routes. authenticateToken protects them all; authorizeRole narrows who may enter.
const express_1 = require("express");
const authenticateToken_1 = require("../middleware/authenticateToken");
const authorizeRole_1 = require("../middleware/authorizeRole");
const userStore_1 = require("../services/userStore");
const router = (0, express_1.Router)();
// Any logged-in user (USER or ADMIN).
router.get('/profile', authenticateToken_1.authenticateToken, (req, res) => {
    const user = req.user === undefined ? undefined : (0, userStore_1.findById)(req.user.id);
    if (user === undefined) {
        res.status(404).json({ error: 'Not Found', message: 'User no longer exists' });
        return;
    }
    res.status(200).json({ data: (0, userStore_1.toPublicUser)(user) });
});
// ADMIN only.
router.get('/admin/users', authenticateToken_1.authenticateToken, (0, authorizeRole_1.authorizeRole)('ADMIN'), (_req, res) => {
    const users = (0, userStore_1.listUsers)();
    res.status(200).json({ count: users.length, data: users });
});
// ADMIN or USER, shows how to allow several roles.
router.get('/dashboard', authenticateToken_1.authenticateToken, (0, authorizeRole_1.authorizeRole)('USER', 'ADMIN'), (req, res) => {
    res.status(200).json({ message: `Welcome to the dashboard, ${req.user?.username ?? 'unknown'}` });
});
exports.default = router;
//# sourceMappingURL=protectedRoutes.js.map