import type { RequestHandler } from 'express';
import type { Env } from '../config/env.js';
import { verifyAccessToken } from '../auth/crypto.js';

export function requireAuth(env: Env): RequestHandler {
  return (request, response, next) => {
    const token = request.header('authorization')?.replace(/^Bearer\s+/i, '');
    const principal = token ? verifyAccessToken(token, env.JWT_ACCESS_SECRET) : null;
    if (!principal) return response.status(401).json({ error: { code: 'UNAUTHENTICATED', message: 'Sign in is required.' } });
    response.locals.principal = principal;
    next();
  };
}
