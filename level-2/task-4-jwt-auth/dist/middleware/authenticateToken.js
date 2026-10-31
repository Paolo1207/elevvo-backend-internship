"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.authenticateToken = authenticateToken;
const authService_1 = require("../services/authService");
function authenticateToken(req, res, next) {
    const header = req.header('authorization');
    const [scheme, token] = header?.split(' ') ?? [];
    if (scheme !== 'Bearer' || token === undefined || token === '') {
        res.status(401).json({
            error: 'Unauthorized',
            message: 'Missing token. Send the header "Authorization: Bearer <token>"',
        });
        return;
    }
    try {
        req.user = (0, authService_1.verifyToken)(token);
        next();
    }
    catch (error) {
        const expired = error instanceof Error && error.name === 'TokenExpiredError';
        res.status(401).json({
            error: 'Unauthorized',
            message: expired ? 'Token has expired, please log in again' : 'Invalid token',
        });
    }
}
//# sourceMappingURL=authenticateToken.js.map