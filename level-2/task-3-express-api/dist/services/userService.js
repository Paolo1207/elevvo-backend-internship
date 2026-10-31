"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.userService = exports.UserService = exports.EmailTakenError = void 0;
class EmailTakenError extends Error {
    constructor(email) {
        super(`A user with email "${email}" already exists`);
        this.name = 'EmailTakenError';
    }
}
exports.EmailTakenError = EmailTakenError;
class UserService {
    users = [
        { id: 1, name: 'Ada Lovelace', email: 'ada@example.com', createdAt: new Date().toISOString() },
        { id: 2, name: 'Alan Turing', email: 'alan@example.com', createdAt: new Date().toISOString() },
    ];
    nextId = 3;
    getAll() {
        return [...this.users];
    }
    getById(id) {
        return this.users.find((user) => user.id === id);
    }
    create(input) {
        this.assertEmailFree(input.email);
        const user = {
            id: this.nextId++,
            name: input.name,
            email: input.email,
            createdAt: new Date().toISOString(),
        };
        this.users.push(user);
        return user;
    }
    update(id, input) {
        const user = this.getById(id);
        if (user === undefined) {
            return undefined;
        }
        if (input.email !== undefined && input.email !== user.email) {
            this.assertEmailFree(input.email);
        }
        if (input.name !== undefined)
            user.name = input.name;
        if (input.email !== undefined)
            user.email = input.email;
        return user;
    }
    delete(id) {
        const index = this.users.findIndex((user) => user.id === id);
        if (index === -1) {
            return false;
        }
        this.users.splice(index, 1);
        return true;
    }
    assertEmailFree(email) {
        const taken = this.users.some((user) => user.email.toLowerCase() === email.toLowerCase());
        if (taken) {
            throw new EmailTakenError(email);
        }
    }
}
exports.UserService = UserService;
// One shared instance acts as our in-memory "database".
exports.userService = new UserService();
//# sourceMappingURL=userService.js.map