import { Router } from 'express';
import { login, register } from '../controllers/authController';
import { loginLimiter } from '../middleware/rateLimiters';

const router = Router();

router.post('/register', register);
router.post('/login', loginLimiter, login);

export default router;