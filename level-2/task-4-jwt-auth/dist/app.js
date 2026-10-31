"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.createApp = createApp;
const express_1 = __importDefault(require("express"));
const helmet_1 = __importDefault(require("helmet"));
const cors_1 = require("./middleware/cors");
const errorHandlers_1 = require("./middleware/errorHandlers");
const authRoutes_1 = __importDefault(require("./routes/authRoutes"));
const protectedRoutes_1 = __importDefault(require("./routes/protectedRoutes"));
function createApp() {
    const app = (0, express_1.default)();
    // Remove the "X-Powered-By: Express" header that advertises the framework.
    app.disable('x-powered-by');
    // Security headers (CSP, HSTS, X-Content-Type-Options, X-Frame-Options and more).
    app.use((0, helmet_1.default)());
    app.use(cors_1.strictCors);
    // Small body limit blocks oversized payloads.
    app.use(express_1.default.json({ limit: '10kb' }));
    app.get('/health', (_req, res) => {
        res.status(200).json({ status: 'ok', timestamp: new Date().toISOString() });
    });
    app.use('/api/auth', authRoutes_1.default);
    app.use('/api', protectedRoutes_1.default);
    app.use(errorHandlers_1.notFound);
    app.use(errorHandlers_1.errorHandler);
    return app;
}
//# sourceMappingURL=app.js.map