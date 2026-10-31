// Bonus: strict CORS. Browsers may only call this API from origins on the allow-list.
import cors from 'cors';
import { config } from '../config';

export class CorsOriginError extends Error {
  constructor(origin: string) {
    super(`Origin "${origin}" is not allowed by CORS policy`);
    this.name = 'CorsOriginError';
  }
}

export const strictCors = cors({
  origin(origin, callback) {
    // Requests with no Origin header come from non-browser clients (Postman, cURL, servers).
    // CORS only protects browsers, so those are allowed through.
    if (origin === undefined || config.allowedOrigins.includes(origin)) {
      callback(null, true);
      return;
    }
    callback(new CorsOriginError(origin));
  },
  methods: ['GET', 'POST', 'PUT', 'DELETE'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  maxAge: 600,
});