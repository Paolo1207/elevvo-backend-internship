"use strict";
// Small wrapper around native fetch: timeout, status check and safe JSON parsing.
// It returns `unknown` on purpose, so callers must validate the data before using it.
Object.defineProperty(exports, "__esModule", { value: true });
exports.NetworkError = void 0;
exports.fetchJson = fetchJson;
class NetworkError extends Error {
    url;
    status;
    constructor(message, url, status, options) {
        super(message, options);
        this.url = url;
        this.status = status;
        this.name = 'NetworkError';
    }
}
exports.NetworkError = NetworkError;
// fetch() wraps the real reason (DNS failure, refused connection...) in `cause`.
function rootMessage(error) {
    if (error instanceof Error) {
        return error.cause === undefined ? error.message : rootMessage(error.cause);
    }
    return String(error);
}
async function fetchJson(url, timeoutMs = 5000) {
    let response;
    try {
        response = await fetch(url, {
            headers: { Accept: 'application/json' },
            signal: AbortSignal.timeout(timeoutMs),
        });
    }
    catch (cause) {
        const isTimeout = cause instanceof Error && cause.name === 'TimeoutError';
        const detail = isTimeout ? `timed out after ${timeoutMs}ms` : rootMessage(cause);
        throw new NetworkError(`Network failure: ${detail}`, url, undefined, { cause });
    }
    if (!response.ok) {
        throw new NetworkError(`HTTP ${response.status} ${response.statusText}`.trim(), url, response.status);
    }
    try {
        const body = await response.json();
        return body;
    }
    catch (cause) {
        throw new NetworkError('Response was not valid JSON', url, response.status, { cause });
    }
}
//# sourceMappingURL=http.js.map