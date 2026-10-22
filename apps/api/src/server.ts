
import { createServer } from 'node:http';
import { createApp } from './app.js';
import { getEnv } from './config/env.js';
import { connectDatabase } from './db/connect.js';
import { closeWorkflowExecutionsQueue } from './queues/workflow-executions.js';

const env = getEnv();

await connectDatabase(env.MONGODB_URI);

const app = createApp(env);
const server = createServer(app);

server.listen(env.API_PORT, () => {
  console.info(`Qorvexa API listening on port ${env.API_PORT}`);
});

let shuttingDown = false;

async function shutdown(signal: string): Promise<void> {
  if (shuttingDown) return;
  shuttingDown = true;

  console.info(`Received ${signal}; shutting down Qorvexa API`);

  const forceExitTimer = setTimeout(() => {
    console.error('Graceful shutdown timed out');
    process.exit(1);
  }, 10_000);

  forceExitTimer.unref();

  try {
    await new Promise<void>((resolve, reject) => {
      server.close((error) => {
        if (error) reject(error);
        else resolve();
      });
    });

    await closeWorkflowExecutionsQueue();
    clearTimeout(forceExitTimer);
    process.exitCode = 0;
  } catch (error) {
    console.error('Error during API shutdown', error);
    process.exitCode = 1;
  }
}

process.on('SIGINT', () => void shutdown('SIGINT'));
process.on('SIGTERM', () => void shutdown('SIGTERM'));
