"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.notFound = notFound;
exports.errorHandler = errorHandler;
const cors_1 = require("./cors");
function notFound(req, res) {
    res.status(404).json({ error: 'Not Found', message: `Route ${req.method} ${req.originalUrl} does not exist` });
}
function errorHandler(error, _req, res, _next) {
    if (error instanceof cors_1.CorsOriginError) {
        res.status(403).json({ error: 'Forbidden', message: error.message });
        return;
    }
    if (error instanceof SyntaxError && 'body' in error) {
        res.status(400).json({ error: 'Bad Request', message: 'Request body is not valid JSON' });
        return;
    }
    // Details go to the server log only, never to the client.
    console.error('Unhandled error:', error);
    res.status(500).json({ error: 'Internal Server Error' });
}
//# sourceMappingURL=errorHandlers.js.map