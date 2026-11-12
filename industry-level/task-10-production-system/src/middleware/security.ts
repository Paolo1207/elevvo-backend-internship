// Security headers (Helmet) and a strict CORS allow-list.
import cors from 'cors';
import helmet from 'helmet';
import { config } from '../lib/config';

export class CorsOriginError extends Error {
  constructor(origin: string) {
    super(`Origin "${origin}" is not allowed by the CORS policy`);
    this.name = 'CorsOriginError';
  }
}

// CSP, HSTS, X-Content-Type-Options, X-Frame-Options and more. This is a JSON API, so the default policy is fine.
export const securityHeaders = helmet();

export const strictCors = cors({
  origin(origin, callback) {
    // No Origin header = not a browser (curl, Postman, another server). CORS only protects browsers.
    if (origin === undefined || config.allowedOrigins.includes(origin)) {
      callback(null, true);
      return;
    }
    callback(new CorsOriginError(origin));
  },
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  exposedHeaders: ['X-Cache', 'X-Embedding-Cache', 'X-Search-Time', 'RateLimit', 'RateLimit-Policy'],
  maxAge: 600,
});
