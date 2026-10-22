import 'dotenv/config';

import mongoose from 'mongoose';
import { Queue } from 'bullmq';
import { Redis } from 'ioredis';
import { WorkerExecution } from './models/execution.js';

const MONGODB_URI =
  process.env.MONGODB_URI ??
  'mongodb://127.0.0.1:27017/qorvexa_integration_test';

const REDIS_URL = process.env.REDIS_URL ?? 'redis://127.0.0.1:6379';
const QUEUE_NAME = 'qorvexa-execution-test';

const graph = {
  nodes: [
    {
      id: 'trigger-1',
      type: 'manualTrigger',
      label: 'Manual Trigger',
      config: {}
    },
    {
      id: 'action-1',
      type: 'action',
      label: 'Set Test Result',
      config: {
        operation: 'set',
        key: 'testResult',
        value: 'Qorvexa worker OK'
      }
    },
    {
      id: 'end-1',
      type: 'end',
      label: 'End',
      config: {}
    }
  ],
  edges: [
    { id: 'edge-1', source: 'trigger-1', target: 'action-1' },
    { id: 'edge-2', source: 'action-1', target: 'end-1' }
  ]
};

async function main() {
  const redis = new Redis(REDIS_URL, { maxRetriesPerRequest: null });
  const queue = new Queue(QUEUE_NAME, { connection: redis });

  try {
    await mongoose.connect(MONGODB_URI);

    const waiting = await queue.getWaitingCount();
    const active = await queue.getActiveCount();

    if (waiting > 0 || active > 0) {
      throw new Error(
        `Test queue is not empty: waiting=${waiting}, active=${active}.`
      );
    }

    const execution = await WorkerExecution.create({
      organizationId: new mongoose.Types.ObjectId(),
      workflowId: new mongoose.Types.ObjectId(),
      workflowVersion: 1,
      workflowSnapshot: graph,
      triggeredBy: new mongoose.Types.ObjectId(),
      status: 'queued',
      input: {},
      steps: [],
      queuedAt: new Date()
    });

    const executionId = String(execution._id);

    try {
      await queue.add(
        'execute-workflow',
        { executionId },
        { jobId: executionId }
      );
    } catch (error) {
      await WorkerExecution.deleteOne({
        _id: execution._id,
        status: 'queued'
      });
      throw error;
    }

    console.log('Test execution created and queued.');
    console.log(`Execution ID: ${executionId}`);
    console.log(`Queue: ${QUEUE_NAME}`);
    console.log(`Database: ${mongoose.connection.name}`);
  } finally {
    await queue.close();
    await redis.quit();
    await mongoose.disconnect();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
