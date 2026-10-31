"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.notFound = notFound;
exports.errorHandler = errorHandler;
// Runs when no route matched.
function notFound(req, res) {
    res.status(404).json({ error: 'Not Found', message: `Route ${req.method} ${req.originalUrl} does not exist` });
}
// Runs when something throws, including malformed JSON bodies from express.json().
function errorHandler(error, _req, res, _next) {
    if (error instanceof SyntaxError && 'body' in error) {
        res.status(400).json({ error: 'Bad Request', message: 'Request body is not valid JSON' });
        return;
    }
    console.error('Unhandled error:', error);
    res.status(500).json({ error: 'Internal Server Error' });
}
//# sourceMappingURL=errorHandlers.js.map