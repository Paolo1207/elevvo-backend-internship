// Bonus: brute-force protection. Max 5 login requests per 15 minutes per IP address.
import { rateLimit } from 'express-rate-limit';
import { config } from '../config';

export const loginLimiter = rateLimit({
  windowMs: config.loginRateLimit.windowMs,
  limit: config.loginRateLimit.max,
  standardHeaders: 'draft-7', // sends RateLimit-* headers so clients know their budget
  legacyHeaders: false,
  message: {
    error: 'Too Many Requests',
    message: 'Too many login attempts. Please try again in 15 minutes.',
  },
});