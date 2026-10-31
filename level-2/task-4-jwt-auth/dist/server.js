"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const app_1 = require("./app");
const config_1 = require("./config");
const authService_1 = require("./services/authService");
async function main() {
    // Create the demo accounts (hashing takes a moment, so finish before accepting requests).
    await (0, authService_1.seedDemoUsers)();
    (0, app_1.createApp)().listen(config_1.config.port, () => {
        console.log(`Server running on http://localhost:${config_1.config.port}`);
        console.log('Demo accounts: admin / Admin@12345 (ADMIN)   alice / Alice@12345 (USER)');
        console.log(`Allowed CORS origins: ${config_1.config.allowedOrigins.join(', ')}`);
    });
}
main().catch((error) => {
    console.error('Failed to start server:', error);
    process.exitCode = 1;
});
//# sourceMappingURL=server.js.map