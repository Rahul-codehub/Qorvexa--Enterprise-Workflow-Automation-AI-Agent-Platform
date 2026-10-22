import cors from 'cors';
import express from 'express';
import rateLimit from 'express-rate-limit';
import helmet from 'helmet';
import type { Env } from './config/env.js';
import { errorHandler } from './middleware/error-handler.js';
import { healthRouter } from './routes/health.js';
import { workflowValidationRouter } from './routes/workflow-validation.js';
import { authRouter } from './routes/auth.js';
import { workflowsRouter } from './routes/workflows.js';
import { requireAuth } from './middleware/require-auth.js';

export function createApp(env: Env) {
  const app = express();
  app.disable('x-powered-by');
  app.use(helmet());
  app.use(cors({ origin: env.WEB_ORIGIN, methods: ['GET', 'POST', 'PATCH', 'DELETE'], credentials: true }));
  app.use(express.json({ limit: '256kb' }));
  app.use(rateLimit({ windowMs: 60_000, limit: 120, standardHeaders: 'draft-8', legacyHeaders: false }));
  app.get('/api/v1', (_request, response) => response.json({ service: 'Qorvexa API', version: 'v1' }));
  app.use('/api/v1/health', healthRouter);
  app.use('/api/v1/auth', authRouter(env));
  app.use('/api/v1/workflows/validate', workflowValidationRouter);
  app.use('/api/v1/workflows', requireAuth(env), workflowsRouter);
  app.use(errorHandler);
  return app;
}
