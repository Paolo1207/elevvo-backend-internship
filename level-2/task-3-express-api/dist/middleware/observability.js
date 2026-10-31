"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.observability = observability;
function observability(req, res, next) {
    const timestamp = new Date().toISOString();
    const start = process.hrtime.bigint();
    // 'finish' fires once the response has been sent, so the duration covers the whole pipeline.
    res.on('finish', () => {
        const durationMs = Number(process.hrtime.bigint() - start) / 1_000_000;
        console.log(`[${timestamp}] ${req.method} ${req.originalUrl} -> ${res.statusCode} ${durationMs.toFixed(2)}ms`);
    });
    next();
}
//# sourceMappingURL=observability.js.map