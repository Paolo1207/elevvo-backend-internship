"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.UsernameTakenError = void 0;
exports.registerUser = registerUser;
exports.verifyCredentials = verifyCredentials;
exports.signToken = signToken;
exports.verifyToken = verifyToken;
exports.seedDemoUsers = seedDemoUsers;
// AUTH SERVICE: password hashing, credential checking and JWT creation/verification.
const bcrypt_1 = __importDefault(require("bcrypt"));
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
const config_1 = require("../config");
const userStore_1 = require("./userStore");
class UsernameTakenError extends Error {
    constructor(username) {
        super(`Username "${username}" is already taken`);
        this.name = 'UsernameTakenError';
    }
}
exports.UsernameTakenError = UsernameTakenError;
// Used when the username does not exist, so a failed login takes about as long as a real one.
// Without this, response timing would reveal which usernames exist.
let dummyHash;
async function getDummyHash() {
    dummyHash ??= await bcrypt_1.default.hash('not-a-real-password', config_1.config.bcryptRounds);
    return dummyHash;
}
async function registerUser(username, password, role) {
    if ((0, userStore_1.findByUsername)(username) !== undefined) {
        throw new UsernameTakenError(username);
    }
    // bcrypt generates a random salt and embeds it in the hash. Only the hash is stored.
    const passwordHash = await bcrypt_1.default.hash(password, config_1.config.bcryptRounds);
    return (0, userStore_1.toPublicUser)((0, userStore_1.addUser)(username, passwordHash, role));
}
// Returns the user if the credentials are valid, otherwise undefined (never says which part was wrong).
async function verifyCredentials(username, password) {
    const user = (0, userStore_1.findByUsername)(username);
    const hashToCheck = user?.passwordHash ?? (await getDummyHash());
    const passwordOk = await bcrypt_1.default.compare(password, hashToCheck);
    if (user === undefined || !passwordOk) {
        return undefined;
    }
    return (0, userStore_1.toPublicUser)(user);
}
function signToken(user) {
    return jsonwebtoken_1.default.sign({ username: user.username, role: user.role }, config_1.config.jwtSecret, {
        algorithm: 'HS256',
        expiresIn: config_1.config.jwtExpiresIn,
        subject: String(user.id),
    });
}
function isRole(value) {
    return value === 'USER' || value === 'ADMIN';
}
// Returns the identity inside a valid token, or throws (bad signature, expired, wrong shape...).
function verifyToken(token) {
    // Pin the algorithm so a forged token cannot choose a weaker one (such as "none").
    const payload = jsonwebtoken_1.default.verify(token, config_1.config.jwtSecret, { algorithms: ['HS256'] });
    if (typeof payload === 'string') {
        throw new Error('Unexpected token payload');
    }
    const id = Number(payload.sub);
    const { username, role } = payload;
    if (!Number.isInteger(id) || typeof username !== 'string' || !isRole(role)) {
        throw new Error('Token is missing required claims');
    }
    return { id, username, role };
}
// Creates the demo accounts used for testing. Passwords are hashed like any other.
async function seedDemoUsers() {
    await registerUser('admin', 'Admin@12345', 'ADMIN');
    await registerUser('alice', 'Alice@12345', 'USER');
}
//# sourceMappingURL=authService.js.map