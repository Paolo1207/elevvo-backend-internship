"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.mapArray = mapArray;
exports.mapUser = mapUser;
exports.mapPost = mapPost;
exports.mapTodo = mapTodo;
function isObject(value) {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}
function asObject(value, label) {
    if (!isObject(value)) {
        throw new Error(`Expected ${label} to be an object`);
    }
    return value;
}
function readString(obj, key) {
    const value = obj[key];
    if (typeof value !== 'string') {
        throw new Error(`Expected "${key}" to be a string`);
    }
    return value;
}
function readNumber(obj, key) {
    const value = obj[key];
    if (typeof value !== 'number') {
        throw new Error(`Expected "${key}" to be a number`);
    }
    return value;
}
function readBoolean(obj, key) {
    const value = obj[key];
    if (typeof value !== 'boolean') {
        throw new Error(`Expected "${key}" to be a boolean`);
    }
    return value;
}
function readObject(obj, key) {
    return asObject(obj[key], `"${key}"`);
}
function mapArray(raw, mapItem) {
    if (!Array.isArray(raw)) {
        throw new Error('Expected the response to be a JSON array');
    }
    const items = raw;
    return items.map((item) => mapItem(item));
}
function mapUser(raw) {
    const obj = asObject(raw, 'user');
    const address = readObject(obj, 'address');
    const company = readObject(obj, 'company');
    return {
        id: readNumber(obj, 'id'),
        name: readString(obj, 'name'),
        username: readString(obj, 'username'),
        email: readString(obj, 'email'),
        city: readString(address, 'city'),
        company: readString(company, 'name'),
    };
}
function mapPost(raw) {
    const obj = asObject(raw, 'post');
    return {
        id: readNumber(obj, 'id'),
        userId: readNumber(obj, 'userId'),
        title: readString(obj, 'title'),
        body: readString(obj, 'body'),
    };
}
function mapTodo(raw) {
    const obj = asObject(raw, 'todo');
    return {
        id: readNumber(obj, 'id'),
        userId: readNumber(obj, 'userId'),
        title: readString(obj, 'title'),
        completed: readBoolean(obj, 'completed'),
    };
}
//# sourceMappingURL=mappers.js.map