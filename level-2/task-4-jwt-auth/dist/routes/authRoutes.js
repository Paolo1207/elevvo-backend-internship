"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const authController_1 = require("../controllers/authController");
const rateLimiters_1 = require("../middleware/rateLimiters");
const router = (0, express_1.Router)();
router.post('/register', authController_1.register);
router.post('/login', rateLimiters_1.loginLimiter, authController_1.login);
exports.default = router;
//# sourceMappingURL=authRoutes.js.map