"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getUsers = getUsers;
exports.getUser = getUser;
exports.createUser = createUser;
exports.updateUser = updateUser;
exports.deleteUser = deleteUser;
const userService_1 = require("../services/userService");
function parseId(raw) {
    const id = Number(raw);
    return Number.isInteger(id) && id > 0 ? id : undefined;
}
function isRecord(value) {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}
function isValidEmail(value) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}
// Returns a typed object, or a list of validation problems.
function validateUserBody(body, requireAll) {
    const errors = [];
    const data = {};
    if (!isRecord(body)) {
        return { data, errors: ['Request body must be a JSON object'] };
    }
    const { name, email } = body;
    if (name === undefined) {
        if (requireAll)
            errors.push('"name" is required');
    }
    else if (typeof name !== 'string' || name.trim() === '') {
        errors.push('"name" must be a non-empty string');
    }
    else {
        data.name = name.trim();
    }
    if (email === undefined) {
        if (requireAll)
            errors.push('"email" is required');
    }
    else if (typeof email !== 'string' || !isValidEmail(email)) {
        errors.push('"email" must be a valid email address');
    }
    else {
        data.email = email.trim();
    }
    if (!requireAll && errors.length === 0 && Object.keys(data).length === 0) {
        errors.push('Provide at least one of "name" or "email"');
    }
    return { data, errors };
}
function getUsers(_req, res) {
    const users = userService_1.userService.getAll();
    res.status(200).json({ count: users.length, data: users });
}
function getUser(req, res) {
    const id = parseId(req.params['id']);
    if (id === undefined) {
        res.status(400).json({ error: 'Bad Request', message: 'User id must be a positive integer' });
        return;
    }
    const user = userService_1.userService.getById(id);
    if (user === undefined) {
        res.status(404).json({ error: 'Not Found', message: `User ${id} not found` });
        return;
    }
    res.status(200).json({ data: user });
}
function createUser(req, res) {
    const { data, errors } = validateUserBody(req.body, true);
    if (errors.length > 0) {
        res.status(400).json({ error: 'Validation Failed', details: errors });
        return;
    }
    try {
        const user = userService_1.userService.create(data);
        res.status(201).json({ data: user });
    }
    catch (error) {
        if (error instanceof userService_1.EmailTakenError) {
            res.status(409).json({ error: 'Conflict', message: error.message });
            return;
        }
        throw error;
    }
}
function updateUser(req, res) {
    const id = parseId(req.params['id']);
    if (id === undefined) {
        res.status(400).json({ error: 'Bad Request', message: 'User id must be a positive integer' });
        return;
    }
    const { data, errors } = validateUserBody(req.body, false);
    if (errors.length > 0) {
        res.status(400).json({ error: 'Validation Failed', details: errors });
        return;
    }
    try {
        const user = userService_1.userService.update(id, data);
        if (user === undefined) {
            res.status(404).json({ error: 'Not Found', message: `User ${id} not found` });
            return;
        }
        res.status(200).json({ data: user });
    }
    catch (error) {
        if (error instanceof userService_1.EmailTakenError) {
            res.status(409).json({ error: 'Conflict', message: error.message });
            return;
        }
        throw error;
    }
}
function deleteUser(req, res) {
    const id = parseId(req.params['id']);
    if (id === undefined) {
        res.status(400).json({ error: 'Bad Request', message: 'User id must be a positive integer' });
        return;
    }
    if (!userService_1.userService.delete(id)) {
        res.status(404).json({ error: 'Not Found', message: `User ${id} not found` });
        return;
    }
    res.status(204).send();
}
//# sourceMappingURL=userController.js.map