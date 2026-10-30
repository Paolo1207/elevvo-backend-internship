"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.runDataEngine = runDataEngine;
// The async data engine: queries every source at the same time with Promise.allSettled,
// so one failing endpoint never stops the others.
const http_1 = require("./http");
const sources_1 = require("./sources");
async function loadSource(source) {
    const raw = await (0, http_1.fetchJson)(source.url);
    return source.map(raw);
}
// Turns a settled result into data. On failure: record the error, log it, return an empty array.
function settle(source, result, errors, quiet) {
    if (result.status === 'fulfilled') {
        return result.value;
    }
    const reason = result.reason;
    const message = reason instanceof Error ? reason.message : String(reason);
    errors.push({ source: source.name, url: source.url, message });
    if (!quiet) {
        console.warn(`[engine] "${source.name}" failed: ${message}`);
    }
    return [];
}
async function runDataEngine(options = {}) {
    const quiet = options.quiet ?? false;
    const demoSources = options.simulateFailures ? sources_1.demoFailureSources : [];
    const started = performance.now();
    // Everything starts at once. allSettled never rejects, whatever happens inside.
    const [coreResults, demoResults] = await Promise.all([
        Promise.allSettled([
            loadSource(sources_1.usersSource),
            loadSource(sources_1.postsSource),
            loadSource(sources_1.todosSource),
        ]),
        Promise.allSettled(demoSources.map((source) => loadSource(source))),
    ]);
    const [usersResult, postsResult, todosResult] = coreResults;
    const errors = [];
    const users = settle(sources_1.usersSource, usersResult, errors, quiet);
    const posts = settle(sources_1.postsSource, postsResult, errors, quiet);
    const todos = settle(sources_1.todosSource, todosResult, errors, quiet);
    demoResults.forEach((result, index) => {
        const source = demoSources[index];
        if (source !== undefined) {
            settle(source, result, errors, quiet);
        }
    });
    return {
        users,
        posts,
        todos,
        errors,
        durationMs: performance.now() - started,
    };
}
//# sourceMappingURL=engine.js.map