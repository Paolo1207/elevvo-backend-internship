"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.createApp = createApp;
// Builds the Express app. Kept separate from server.ts so it is easy to test.
const express_1 = __importDefault(require("express"));
const errorHandlers_1 = require("./middleware/errorHandlers");
const observability_1 = require("./middleware/observability");
const requireAPIKey_1 = require("./middleware/requireAPIKey");
const routes_1 = __importDefault(require("./routes"));
function createApp() {
    const app = (0, express_1.default)();
    // Order matters: log everything first, then parse JSON, then route.
    app.use(observability_1.observability);
    app.use(express_1.default.json());
    // Public endpoint, no API key needed.
    app.get('/health', (_req, res) => {
        res.status(200).json({ status: 'ok', timestamp: new Date().toISOString() });
    });
    // Everything under /api needs a valid x-api-key header.
    app.use('/api', requireAPIKey_1.requireAPIKey, routes_1.default);
    app.use(errorHandlers_1.notFound);
    app.use(errorHandlers_1.errorHandler);
    return app;
}
//# sourceMappingURL=app.js.map