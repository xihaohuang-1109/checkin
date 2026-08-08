import { Request, Response, NextFunction } from 'express';
import { getEnv } from '../config/env';
import crypto from 'crypto';

/**
 * Simple CSRF protection for admin POST routes:
 * Requires a custom header X-CSRF-Token to match a cookie value.
 */
export function csrfProtection(req: Request, res: Response, next: NextFunction): void {
  // Only apply to mutating methods on admin routes
  if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) {
    next();
    return;
  }

  const cookieToken = req.cookies?.['csrf-token'];
  const headerToken = req.headers['x-csrf-token'] as string | undefined;

  if (!cookieToken || !headerToken || cookieToken !== headerToken) {
    res.status(403).json({ error: 'CSRF validation failed' });
    return;
  }

  next();
}

export function setCsrfCookie(req: Request, res: Response): void {
  const env = getEnv();
  const token = crypto.randomBytes(32).toString('hex');
  res.cookie('csrf-token', token, {
    httpOnly: false, // client needs to read it
    sameSite: 'lax',
    secure: env.PUBLIC_BASE_URL.startsWith('https'),
    maxAge: 24 * 60 * 60 * 1000, // 24h
  });
}