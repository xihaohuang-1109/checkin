import rateLimit from 'express-rate-limit';

export const publicSubmitLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 10, // max 10 submissions per IP per minute
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests, please try again later.' },
  keyGenerator: (req) => {
    return req.ip || req.socket.remoteAddress || 'unknown';
  },
});