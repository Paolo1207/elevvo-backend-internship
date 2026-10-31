"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.authorizeRole = authorizeRole;
function authorizeRole(...allowedRoles) {
    return (req, res, next) => {
        if (req.user === undefined) {
            res.status(401).json({ error: 'Unauthorized', message: 'Authentication required' });
            return;
        }
        if (!allowedRoles.includes(req.user.role)) {
            // 403 = we know who you are, but you are not allowed here.
            res.status(403).json({
                error: 'Forbidden',
                message: `This route requires one of these roles: ${allowedRoles.join(', ')}`,
            });
            return;
        }
        next();
    };
}
//# sourceMappingURL=authorizeRole.js.map