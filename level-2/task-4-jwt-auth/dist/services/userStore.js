"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.toPublicUser = toPublicUser;
exports.findByUsername = findByUsername;
exports.findById = findById;
exports.listUsers = listUsers;
exports.addUser = addUser;
const users = [];
let nextId = 1;
function toPublicUser(user) {
    return { id: user.id, username: user.username, role: user.role, createdAt: user.createdAt };
}
function findByUsername(username) {
    const wanted = username.toLowerCase();
    return users.find((user) => user.username.toLowerCase() === wanted);
}
function findById(id) {
    return users.find((user) => user.id === id);
}
function listUsers() {
    return users.map(toPublicUser);
}
function addUser(username, passwordHash, role) {
    const user = {
        id: nextId++,
        username,
        passwordHash,
        role,
        createdAt: new Date().toISOString(),
    };
    users.push(user);
    return user;
}
//# sourceMappingURL=userStore.js.map