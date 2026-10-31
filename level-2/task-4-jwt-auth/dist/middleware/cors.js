"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.strictCors = exports.CorsOriginError = void 0;
// Bonus: strict CORS. Browsers may only call this API from origins on the allow-list.
const cors_1 = __importDefault(require("cors"));
const config_1 = require("../config");
class CorsOriginError extends Error {
    constructor(origin) {
        super(`Origin "${origin}" is not allowed by CORS policy`);
        this.name = 'CorsOriginError';
    }
}
exports.CorsOriginError = CorsOriginError;
exports.strictCors = (0, cors_1.default)({
    origin(origin, callback) {
        // Requests with no Origin header come from non-browser clients (Postman, cURL, servers).
        // CORS only protects browsers, so those are allowed through.
        if (origin === undefined || config_1.config.allowedOrigins.includes(origin)) {
            callback(null, true);
            return;
        }
        callback(new CorsOriginError(origin));
    },
    methods: ['GET', 'POST', 'PUT', 'DELETE'],
    allowedHeaders: ['Content-Type', 'Authorization'],
    maxAge: 600,
});
//# sourceMappingURL=cors.js.map