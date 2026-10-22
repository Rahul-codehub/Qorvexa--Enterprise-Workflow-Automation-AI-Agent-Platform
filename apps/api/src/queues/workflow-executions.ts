
import { Queue } from 'bullmq';
import { Redis } from 'ioredis';
import { getEnv } from '../config/env.js';

export const WORKFLOW_EXECUTIONS_QUEUE =
  process.env.WORKFLOW_EXECUTIONS_QUEUE?.trim() || 'workflow-executions';

export function createWorkflowExecutionsQueue(redisUrl: string) {
  const connection = new Redis(redisUrl, {
    maxRetriesPerRequest: null
  });

  const queue = new Queue(WORKFLOW_EXECUTIONS_QUEUE, {
    connection,
    defaultJobOptions: {
      attempts: 3,
      backoff: {
        type: 'exponential',
        delay: 1000
      },
      removeOnComplete: 1000,
      removeOnFail: 5000
    }
  });

      let closePromise: Promise<void> | undefined;

  return {
    queue,

    async close(): Promise<void> {
      if (closePromise) {
        return closePromise;
      }

      closePromise = (async () => {
        await queue.close();

        if (connection.status !== 'end') {
          await connection.quit();
        }
      })();

      return closePromise;
    }
  };
}

const env = getEnv();
const workflowExecutions = createWorkflowExecutionsQueue(env.REDIS_URL);

export const workflowExecutionsQueue = workflowExecutions.queue;

export async function closeWorkflowExecutionsQueue(): Promise<void> {
  await workflowExecutions.close();
}
