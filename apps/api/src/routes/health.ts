import { Router } from 'express';
import mongoose from 'mongoose';

export const healthRouter = Router();

healthRouter.get('/', (_request, response) => {
  const database = mongoose.connection.readyState === 1 ? 'connected' : 'unavailable';
  response.status(database === 'connected' ? 200 : 503).json({ service: 'api', status: database === 'connected' ? 'ok' : 'degraded', database });
});
