"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.requireAPIKey = requireAPIKey;
// Bonus: security middleware. Rejects requests without a valid `x-api-key` header.
const node_crypto_1 = require("node:crypto");
const API_KEY = process.env['API_KEY'] ?? 'secret-key-123';
// Constant-time comparison, so response timing cannot leak the key.
function keysMatch(provided, expected) {
    const a = Buffer.from(provided);
    const b = Buffer.from(expected);
    return a.length === b.length && (0, node_crypto_1.timingSafeEqual)(a, b);
}
function requireAPIKey(req, res, next) {
    const provided = req.header('x-api-key');
    if (provided === undefined || !keysMatch(provided, API_KEY)) {
        res.status(401).json({
            error: 'Unauthorized',
            message: 'A valid x-api-key header is required',
        });
        return;
    }
    next();
}
//# sourceMappingURL=requireAPIKey.js.map