"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.config = void 0;
// Central configuration. Secrets come from environment variables, never from source code.
const DEV_SECRET = 'dev-only-secret-change-me-before-deploying';
const jwtSecret = process.env['JWT_SECRET'] ?? DEV_SECRET;
if (jwtSecret === DEV_SECRET) {
    console.warn('[config] JWT_SECRET is not set, using an insecure development secret.');
}
exports.config = {
    port: Number(process.env['PORT'] ?? 3000),
    jwtSecret,
    // Token lifetime. Short-lived tokens limit the damage if one is stolen.
    jwtExpiresIn: '1h',
    // bcrypt cost factor: each +1 doubles the hashing time.
    bcryptRounds: Number(process.env['BCRYPT_ROUNDS'] ?? 12),
    // Strict CORS: only these origins may call the API from a browser.
    allowedOrigins: (process.env['ALLOWED_ORIGINS'] ?? 'http://localhost:5173,http://localhost:3001')
        .split(',')
        .map((origin) => origin.trim())
        .filter((origin) => origin !== ''),
    loginRateLimit: {
        windowMs: 15 * 60 * 1000,
        max: 5,
    },
};
//# sourceMappingURL=index.js.map