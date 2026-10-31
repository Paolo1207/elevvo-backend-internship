"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const app_1 = require("./app");
const PORT = Number(process.env['PORT'] ?? 3000);
(0, app_1.createApp)().listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
    console.log('Send the header  x-api-key: secret-key-123  to use /api routes');
});
//# sourceMappingURL=server.js.map