
import 'dotenv/config';

import { Worker } from 'bullmq';
import { Redis } from 'ioredis';
import mongoose from 'mongoose';
import { z } from 'zod';
import {
  validateWorkflowGraph,
  workflowGraphSchema
} from '@qorvexa/shared';

import { WorkerExecution } from './models/execution.js';
import {
  executeWorkflowGraph,
  WorkflowExecutionError
} from './engine.js';

const config = z
  .object({
    MONGODB_URI: z.string().min(1),
    REDIS_URL: z.string().min(1),
    QUEUE_NAME: z.string().min(1).default('workflow-executions')
  })
  .parse(process.env);

const redis = new Redis(config.REDIS_URL, {
  maxRetriesPerRequest: null
});

type ExecutionJob = {
  executionId: string;
};

const worker = new Worker<ExecutionJob>(
  config.QUEUE_NAME,
  async (job) => {
    const { executionId } = job.data;

    if (!mongoose.connection.readyState) {
      await mongoose.connect(config.MONGODB_URI);
    }

    // Atomically claim only queued executions.
    const execution = await WorkerExecution.findOneAndUpdate(
      {
        _id: executionId,
        status: 'queued'
      },
      {
        $set: {
          status: 'running',
          startedAt: new Date(),
          completedAt: null,
          error: null
        }
      },
      { new: true }
    );

    // Avoid processing an execution that another worker claimed
    // or that is no longer queued.
    if (!execution) {
      console.log(
        `[worker] Skipping execution ${executionId}: not queued or not found.`
      );
      return;
    }

    try {
      const parsed = workflowGraphSchema.safeParse(
        execution.workflowSnapshot
      );

      if (!parsed.success) {
        throw new WorkflowExecutionError(
          `Invalid workflow snapshot: ${parsed.error.issues
            .map((issue) => issue.message)
            .join('; ')}`
        );
      }

      const validation = validateWorkflowGraph(parsed.data);

      if (!validation.valid) {
        throw new WorkflowExecutionError(
          `Invalid workflow graph: ${validation.errors.join('; ')}`
        );
      }

      // Persist initial step states before executing the graph.
      const initialSteps = parsed.data.nodes.map((node) => ({
        nodeId: node.id,
        nodeType: node.type,
        status: 'pending',
        input: {},
        output: null,
        error: null,
        startedAt: null,
        completedAt: null
      }));

      await WorkerExecution.updateOne(
        { _id: execution._id, status: 'running' },
        { $set: { steps: initialSteps } }
      );

      const result = await executeWorkflowGraph(
        parsed.data,
        execution.input ?? {}
      );

      // Save completed step results and final output.
      await WorkerExecution.updateOne(
        { _id: execution._id, status: 'running' },
        {
          $set: {
            steps: result.steps,
            output: result.output,
            status: 'completed',
            error: null,
            completedAt: new Date()
          }
        }
      );

      console.log(`[worker] Execution ${executionId} completed.`);
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : 'Unknown workflow execution error.';

      const failedNodeId =
        error instanceof WorkflowExecutionError
          ? error.nodeId
          : undefined;

      const failedAt = new Date();

      // Mark the failing node when the engine identifies it.
      if (failedNodeId) {
        await WorkerExecution.updateOne(
          {
            _id: execution._id,
            status: 'running',
            'steps.nodeId': failedNodeId
          },
          {
            $set: {
              'steps.$.status': 'failed',
              'steps.$.error': message,
              'steps.$.completedAt': failedAt
            }
          }
        );
      }

      await WorkerExecution.updateOne(
        { _id: execution._id, status: 'running' },
        {
          $set: {
            status: 'failed',
            error: message,
            completedAt: failedAt
          }
        }
      );

      console.error(
        `[worker] Execution ${executionId} failed: ${message}`
      );

      // The execution record is the source of truth for failure.
      // Do not throw here: the job should not be retried after its
      // execution record has already been marked failed.
    }
  },
  {
    connection: redis,
    concurrency: 5
  }
);

worker.on('ready', () => {
  console.log(`[worker] Listening on queue "${config.QUEUE_NAME}".`);
});

worker.on('error', (error) => {
  console.error('[worker] Worker error:', error);
});

async function shutdown(signal: string) {
  console.log(`[worker] Received ${signal}; shutting down...`);

  try {
    await worker.close();
    await mongoose.disconnect();
    await redis.quit();
    console.log('[worker] Shutdown complete.');
  } catch (error) {
    console.error('[worker] Shutdown error:', error);
    process.exitCode = 1;
  }
}

process.once('SIGINT', () => {
  void shutdown('SIGINT');
});

process.once('SIGTERM', () => {
  void shutdown('SIGTERM');
});
