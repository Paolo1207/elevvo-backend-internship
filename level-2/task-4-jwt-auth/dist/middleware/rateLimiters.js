"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.loginLimiter = void 0;
// Bonus: brute-force protection. Max 5 login requests per 15 minutes per IP address.
const express_rate_limit_1 = require("express-rate-limit");
const config_1 = require("../config");
exports.loginLimiter = (0, express_rate_limit_1.rateLimit)({
    windowMs: config_1.config.loginRateLimit.windowMs,
    limit: config_1.config.loginRateLimit.max,
    standardHeaders: 'draft-7', // sends RateLimit-* headers so clients know their budget
    legacyHeaders: false,
    message: {
        error: 'Too Many Requests',
        message: 'Too many login attempts. Please try again in 15 minutes.',
    },
});
//# sourceMappingURL=rateLimiters.js.map