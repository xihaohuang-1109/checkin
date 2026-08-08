import express from 'express';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import session from 'express-session';
import path from 'path';
import { getEnv } from './config/env';
import { errorHandler } from './middleware/errorHandler';
import authRoutes from './routes/auth';
import publicRoutes from './routes/public';
import adminRoutes from './routes/admin';

export function createApp() {
  const env = getEnv();
  const app = express();

  // Trust proxy for rate limiting behind reverse proxy
  app.set('trust proxy', 1);

  // Skip ngrok browser warning interstitial
  app.use((_req, res, next) => {
    res.setHeader('ngrok-skip-browser-warning', 'true');
    next();
  });

  // CORS
  app.use(cors({
    origin: true,
    credentials: true,
  }));

  // Body parsing
  app.use(express.json({ limit: '1mb' }));
  app.use(cookieParser());

  // Session
  app.use(session({
    secret: env.SESSION_SECRET,
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      sameSite: 'lax',
      secure: env.PUBLIC_BASE_URL.startsWith('https'),
      maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
    },
  }));

  // Routes
  app.use('/api/auth', authRoutes);
  app.use('/api', publicRoutes);
  app.use('/api/admin', adminRoutes);

  // Serve static client build
  const clientDist = path.resolve(__dirname, '../../client/dist');
  app.use(express.static(clientDist));

  // SPA fallback: serve index.html for all non-API routes
  app.get(/^\/(?!api\/).*/, (_req, res) => {
    res.sendFile(path.join(clientDist, 'index.html'));
  });

  // Error handler
  app.use(errorHandler);

  return app;
}