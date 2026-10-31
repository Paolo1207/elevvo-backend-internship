"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
// Combines all resource routers under /api.
const express_1 = require("express");
const userRoutes_1 = __importDefault(require("./userRoutes"));
const router = (0, express_1.Router)();
router.use('/users', userRoutes_1.default);
exports.default = router;
//# sourceMappingURL=index.js.map