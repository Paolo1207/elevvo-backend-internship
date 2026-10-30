"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.demoFailureSources = exports.todosSource = exports.postsSource = exports.usersSource = void 0;
// The public API endpoints the engine queries (JSONPlaceholder).
const mappers_1 = require("./mappers");
const BASE_URL = 'https://jsonplaceholder.typicode.com';
exports.usersSource = {
    name: 'users',
    url: `${BASE_URL}/users`,
    map: (raw) => (0, mappers_1.mapArray)(raw, mappers_1.mapUser),
};
exports.postsSource = {
    name: 'posts',
    url: `${BASE_URL}/posts`,
    map: (raw) => (0, mappers_1.mapArray)(raw, mappers_1.mapPost),
};
exports.todosSource = {
    name: 'todos',
    url: `${BASE_URL}/todos`,
    map: (raw) => (0, mappers_1.mapArray)(raw, mappers_1.mapTodo),
};
// Deliberately broken sources, used only to demonstrate error isolation.
exports.demoFailureSources = [
    {
        name: 'missing-endpoint (demo: HTTP 404)',
        url: `${BASE_URL}/this-route-does-not-exist`,
        map: (raw) => (0, mappers_1.mapArray)(raw, mappers_1.mapPost),
    },
    {
        name: 'unreachable-host (demo: network failure)',
        // The .invalid top-level domain is reserved and can never resolve.
        url: 'https://this-host-does-not-exist.invalid/posts',
        map: (raw) => (0, mappers_1.mapArray)(raw, mappers_1.mapPost),
    },
];
//# sourceMappingURL=sources.js.map