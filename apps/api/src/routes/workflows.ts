
import { Router } from 'express';
import { z } from 'zod';

import {
  workflowGraphSchema,
  validateWorkflowGraph
} from '@qorvexa/shared';

import { Execution } from '../models/execution.js';
import { Workflow } from '../models/workflow.js';
import { requireRole } from '../middleware/require-role.js';
import { workflowExecutionsQueue } from '../queues/workflow-executions.js';

// -----------------------------------------------------------------------------
// Validation schemas
// -----------------------------------------------------------------------------

const createSchema = z.object({
  name: z.string().trim().min(3).max(120),
  description: z.string().trim().max(500).optional(),
  graph: workflowGraphSchema
}).strict();

const executionInputSchema = z.object({
  input: z.record(z.string(), z.unknown()).default({})
}).strict();

const updateSchema = z.object({
  name: z.string().trim().min(3).max(120).optional(),
  description: z.string().trim().max(500).optional(),
  graph: workflowGraphSchema.optional()
}).strict().refine(
  (data) => Object.keys(data).length > 0,
  { message: 'At least one field must be provided.' }
);

const workflowIdSchema = z.string().regex(/^[a-f\d]{24}$/i);

// -----------------------------------------------------------------------------
// Router
// -----------------------------------------------------------------------------

export const workflowsRouter = Router();

// -----------------------------------------------------------------------------
// GET /
// List workflows belonging to the authenticated user's organization.
// -----------------------------------------------------------------------------

workflowsRouter.get('/', async (_request, response, next) => {
  try {
    const principal = response.locals.principal;

    const workflows = await Workflow.find({
      organizationId: principal.organizationId
    })
      .sort({ updatedAt: -1 })
      .lean();

    return response.json({
      data: workflows.map((workflow) => ({
        ...workflow,
        id: String(workflow._id),
        _id: undefined
      }))
    });
  } catch (error) {
    return next(error);
  }
});

// -----------------------------------------------------------------------------
// GET /:id
// Retrieve a workflow within the authenticated user's organization.
// -----------------------------------------------------------------------------

workflowsRouter.get('/:id', async (request, response, next) => {
  try {
    const parsedId = workflowIdSchema.safeParse(request.params.id);

    if (!parsedId.success) {
      return response.status(400).json({
        error: {
          code: 'INVALID_WORKFLOW_ID',
          message: 'Workflow ID is invalid.'
        }
      });
    }

    const principal = response.locals.principal;

    const workflow = await Workflow.findOne({
      _id: parsedId.data,
      organizationId: principal.organizationId
    }).lean();

    if (!workflow) {
      return response.status(404).json({
        error: {
          code: 'WORKFLOW_NOT_FOUND',
          message: 'Workflow was not found.'
        }
      });
    }

    return response.json({
      data: {
        ...workflow,
        id: String(workflow._id),
        _id: undefined
      }
    });
  } catch (error) {
    return next(error);
  }
});

// -----------------------------------------------------------------------------
// POST /
// Create a workflow. Only owners and admins may create workflows.
// -----------------------------------------------------------------------------

workflowsRouter.post(
  '/',
  requireRole('owner', 'admin'),
  async (request, response, next) => {
    try {
      const input = createSchema.parse(request.body);
      const check = validateWorkflowGraph(input.graph);

      if (!check.valid) {
        return response.status(422).json({
          error: {
            code: 'INVALID_GRAPH',
            message: 'Workflow graph cannot be saved.',
            details: check.errors
          }
        });
      }

      const principal = response.locals.principal;

      const workflow = await Workflow.create({
        ...input,
        organizationId: principal.organizationId,
        createdBy: principal.sub
      });

      return response.status(201).json({
        data: {
          ...workflow.toObject(),
          id: String(workflow._id),
          _id: undefined
        }
      });
    } catch (error) {
      return next(error);
    }
  }
);

// -----------------------------------------------------------------------------
// PATCH /:id
// Update a workflow. Only owners and admins may update workflows.
// -----------------------------------------------------------------------------

workflowsRouter.patch(
  '/:id',
  requireRole('owner', 'admin'),
  async (request, response, next) => {
    try {
      const parsedId = workflowIdSchema.safeParse(request.params.id);

      if (!parsedId.success) {
        return response.status(400).json({
          error: {
            code: 'INVALID_WORKFLOW_ID',
            message: 'Workflow ID is invalid.'
          }
        });
      }

      const input = updateSchema.parse(request.body);

      if (input.graph) {
        const check = validateWorkflowGraph(input.graph);

        if (!check.valid) {
          return response.status(422).json({
            error: {
              code: 'INVALID_GRAPH',
              message: 'Workflow graph cannot be saved.',
              details: check.errors
            }
          });
        }
      }

      const principal = response.locals.principal;

      const workflow = await Workflow.findOneAndUpdate(
        {
          _id: parsedId.data,
          organizationId: principal.organizationId
        },
        {
          $set: input,
          $inc: { version: 1 }
        },
        {
          new: true,
          runValidators: true
        }
      ).lean();

      if (!workflow) {
        return response.status(404).json({
          error: {
            code: 'WORKFLOW_NOT_FOUND',
            message: 'Workflow was not found.'
          }
        });
      }

      return response.json({
        data: {
          ...workflow,
          id: String(workflow._id),
          _id: undefined
        }
      });
    } catch (error) {
      return next(error);
    }
  }
);

// -----------------------------------------------------------------------------
// POST /:id/publish
// Publish a valid draft workflow.
// -----------------------------------------------------------------------------

workflowsRouter.post(
  '/:id/publish',
  requireRole('owner', 'admin'),
  async (request, response, next) => {
    try {
      const parsedId = workflowIdSchema.safeParse(request.params.id);

      if (!parsedId.success) {
        return response.status(400).json({
          error: {
            code: 'INVALID_WORKFLOW_ID',
            message: 'Workflow ID is invalid.'
          }
        });
      }

      const principal = response.locals.principal;

      const workflow = await Workflow.findOne({
        _id: parsedId.data,
        organizationId: principal.organizationId
      }).lean();

      if (!workflow) {
        return response.status(404).json({
          error: {
            code: 'WORKFLOW_NOT_FOUND',
            message: 'Workflow was not found.'
          }
        });
      }

      if (workflow.status !== 'draft') {
        return response.status(409).json({
          error: {
            code: 'INVALID_WORKFLOW_STATUS',
            message: 'Only draft workflows can be published.'
          }
        });
      }

      const parsedGraph = workflowGraphSchema.safeParse(workflow.graph);

      if (!parsedGraph.success) {
        return response.status(422).json({
          error: {
            code: 'INVALID_GRAPH',
            message: 'Workflow graph is invalid.',
            details: parsedGraph.error.flatten()
          }
        });
      }

      const check = validateWorkflowGraph(parsedGraph.data);

      if (!check.valid) {
        return response.status(422).json({
          error: {
            code: 'INVALID_GRAPH',
            message: 'Workflow graph cannot be published.',
            details: check.errors
          }
        });
      }

      // Atomically publish only if the workflow is still a draft.
      const publishedWorkflow = await Workflow.findOneAndUpdate(
        {
          _id: parsedId.data,
          organizationId: principal.organizationId,
          status: 'draft'
        },
        {
          $set: { status: 'published' },
          $inc: { version: 1 }
        },
        {
          new: true,
          runValidators: true
        }
      ).lean();

      if (!publishedWorkflow) {
        return response.status(409).json({
          error: {
            code: 'INVALID_WORKFLOW_STATUS',
            message: 'Only draft workflows can be published.'
          }
        });
      }

      return response.json({
        data: {
          id: String(publishedWorkflow._id),
          name: publishedWorkflow.name,
          status: publishedWorkflow.status,
          version: publishedWorkflow.version,
          organizationId: String(publishedWorkflow.organizationId)
        }
      });
    } catch (error) {
      return next(error);
    }
  }
);

// -----------------------------------------------------------------------------
// POST /:id/archive
// Archive a published workflow.
// -----------------------------------------------------------------------------

workflowsRouter.post(
  '/:id/archive',
  requireRole('owner', 'admin'),
  async (request, response, next) => {
    try {
      const parsedId = workflowIdSchema.safeParse(request.params.id);

      if (!parsedId.success) {
        return response.status(400).json({
          error: {
            code: 'INVALID_WORKFLOW_ID',
            message: 'Workflow ID is invalid.'
          }
        });
      }

      const principal = response.locals.principal;

      // Atomically archive only a published workflow belonging
      // to the authenticated user's organization.
      const workflow = await Workflow.findOneAndUpdate(
        {
          _id: parsedId.data,
          organizationId: principal.organizationId,
          status: 'published'
        },
        {
          $set: { status: 'archived' },
          $inc: { version: 1 }
        },
        {
          new: true,
          runValidators: true
        }
      ).lean();

      if (workflow) {
        return response.json({
          data: {
            id: String(workflow._id),
            name: workflow.name,
            status: workflow.status,
            version: workflow.version,
            organizationId: String(workflow.organizationId)
          }
        });
      }

      // Distinguish a missing/cross-organization workflow from
      // an existing workflow in an invalid state.
      const existingWorkflow = await Workflow.findOne({
        _id: parsedId.data,
        organizationId: principal.organizationId
      })
        .select({ status: 1 })
        .lean();

      if (!existingWorkflow) {
        return response.status(404).json({
          error: {
            code: 'WORKFLOW_NOT_FOUND',
            message: 'Workflow was not found.'
          }
        });
      }

      return response.status(409).json({
        error: {
          code: 'INVALID_WORKFLOW_STATUS',
          message: 'Only published workflows can be archived.'
        }
      });
    } catch (error) {
      return next(error);
    }
  }
);

// -----------------------------------------------------------------------------
// POST /:id/execute
// Queue execution of a published workflow.
// -----------------------------------------------------------------------------

workflowsRouter.post(
  '/:id/execute',
  async (request, response, next) => {
    try {
      const parsedId = workflowIdSchema.safeParse(request.params.id);

      if (!parsedId.success) {
        return response.status(400).json({
          error: {
            code: 'INVALID_WORKFLOW_ID',
            message: 'Workflow ID is invalid.'
          }
        });
      }

      const parsedInput = executionInputSchema.safeParse(
        request.body ?? {}
      );

      if (!parsedInput.success) {
        return response.status(400).json({
          error: {
            code: 'VALIDATION_ERROR',
            message: 'Execution input must be a valid object.',
            details: parsedInput.error.flatten()
          }
        });
      }

      const principal = response.locals.principal;

      const workflow = await Workflow.findOne({
        _id: parsedId.data,
        organizationId: principal.organizationId
      }).lean();

      if (!workflow) {
        return response.status(404).json({
          error: {
            code: 'WORKFLOW_NOT_FOUND',
            message: 'Workflow was not found.'
          }
        });
      }

      if (workflow.status !== 'published') {
        return response.status(409).json({
          error: {
            code: 'WORKFLOW_NOT_PUBLISHED',
            message: 'Only published workflows can be executed.'
          }
        });
      }

      const execution = await Execution.create({
        organizationId: workflow.organizationId,
        workflowId: workflow._id,
        workflowVersion: workflow.version,
        workflowSnapshot: workflow.graph,
        triggeredBy: principal.sub,
        status: 'queued',
        input: parsedInput.data.input,
        queuedAt: new Date()
      });

      const executionId = String(execution._id);

      try {
        await workflowExecutionsQueue.add(
          'execute-workflow',
          { executionId },
          { jobId: executionId }
        );
      } catch (queueError) {
        // Preserve the original queue error if this update also fails.
        try {
          await Execution.updateOne(
            {
              _id: execution._id,
              status: 'queued'
            },
            {
              $set: {
                status: 'failed',
                error: 'The execution could not be added to the queue.',
                completedAt: new Date()
              }
            }
          );
        } catch (updateError) {
          console.error(
            'Failed to mark execution as failed after queue error.',
            { executionId, updateError }
          );
        }

        return next(queueError);
      }

      return response.status(202).json({
        data: {
          id: executionId,
          workflowId: String(workflow._id),
          workflowVersion: workflow.version,
          status: 'queued',
          queuedAt: execution.queuedAt
        }
      });
    } catch (error) {
      return next(error);
    }
  }
);

// -----------------------------------------------------------------------------
// GET /:id/executions
// List recent executions for a workflow in the authenticated organization.
// -----------------------------------------------------------------------------

workflowsRouter.get(
  '/:id/executions',
  async (request, response, next) => {
    try {
      const parsedWorkflowId = workflowIdSchema.safeParse(
        request.params.id,
      );

      if (!parsedWorkflowId.success) {
        return response.status(400).json({
          error: {
            code: 'INVALID_WORKFLOW_ID',
            message: 'Workflow ID is invalid.',
          },
        });
      }

      const parsedLimit = z.coerce
        .number()
        .int()
        .min(1)
        .max(50)
        .safeParse(request.query.limit ?? '20');

      if (!parsedLimit.success) {
        return response.status(400).json({
          error: {
            code: 'INVALID_LIMIT',
            message: 'Limit must be an integer between 1 and 50.',
          },
        });
      }

      const principal = response.locals.principal;

      const workflow = await Workflow.findOne({
        _id: parsedWorkflowId.data,
        organizationId: principal.organizationId,
      })
        .select({ _id: 1 })
        .lean();

      if (!workflow) {
        return response.status(404).json({
          error: {
            code: 'WORKFLOW_NOT_FOUND',
            message: 'Workflow was not found.',
          },
        });
      }

      const executions = await Execution.find({
        workflowId: workflow._id,
        organizationId: principal.organizationId,
      })
        .sort({ createdAt: -1, _id: -1 })
        .limit(parsedLimit.data + 1)
        .select(
          'workflowId workflowVersion status error queuedAt startedAt completedAt createdAt steps.nodeId',
        )
        .lean();

      const hasMore = executions.length > parsedLimit.data;
      const items = executions
        .slice(0, parsedLimit.data)
        .map((execution) => ({
          id: String(execution._id),
          workflowId: String(execution.workflowId),
          workflowVersion: execution.workflowVersion,
          status: execution.status,
          error: execution.error,
          queuedAt: execution.queuedAt,
          startedAt: execution.startedAt,
          completedAt: execution.completedAt,
          createdAt: execution.createdAt,
          durationMs:
            execution.startedAt && execution.completedAt
              ? Math.max(
                0,
                execution.completedAt.getTime() -
                execution.startedAt.getTime(),
              )
              : null,
          stepCount: execution.steps?.length ?? 0,
        }));

      return response.json({
        data: items,
        pagination: {
          limit: parsedLimit.data,
          hasMore,
        },
      });
    } catch (error) {
      return next(error);
    }
  },
);

/**
 * GET /:id/executions/:executionId
 * Retrieve execution status and persisted results within the
 * authenticated user's organization.
 */
workflowsRouter.get(
  '/:id/executions/:executionId',
  async (request, response, next) => {
    try {
      const parsedWorkflowId = workflowIdSchema.safeParse(
        request.params.id
      );
      const parsedExecutionId = workflowIdSchema.safeParse(
        request.params.executionId
      );

      if (!parsedWorkflowId.success || !parsedExecutionId.success) {
        return response.status(400).json({
          error: {
            code: 'INVALID_ID',
            message: 'Workflow ID or execution ID is invalid.'
          }
        });
      }

      const principal = response.locals.principal;

      // Enforce tenant isolation directly in the database query.
      const execution = await Execution.findOne({
        _id: parsedExecutionId.data,
        workflowId: parsedWorkflowId.data,
        organizationId: principal.organizationId
      })
        .select(
          'workflowId workflowVersion status input output steps error queuedAt startedAt completedAt createdAt updatedAt'
        )
        .lean();

      if (!execution) {
        return response.status(404).json({
          error: {
            code: 'EXECUTION_NOT_FOUND',
            message: 'Execution was not found.'
          }
        });
      }

      return response.json({
        data: {
          id: String(execution._id),
          workflowId: String(execution.workflowId),
          workflowVersion: execution.workflowVersion,
          status: execution.status,
          input: execution.input,
          output: execution.output,
          steps: execution.steps,
          error: execution.error,
          queuedAt: execution.queuedAt,
          startedAt: execution.startedAt,
          completedAt: execution.completedAt,
          createdAt: execution.createdAt,
          updatedAt: execution.updatedAt
        }
      });
    } catch (error) {
      return next(error);
    }
  }
);


// -----------------------------------------------------------------------------
// DELETE /:id
// Delete a workflow. Only owners and admins may delete workflows.
// -----------------------------------------------------------------------------

workflowsRouter.delete(
  '/:id',
  requireRole('owner', 'admin'),
  async (request, response, next) => {
    try {
      const parsedId = workflowIdSchema.safeParse(request.params.id);

      if (!parsedId.success) {
        return response.status(400).json({
          error: {
            code: 'INVALID_WORKFLOW_ID',
            message: 'Workflow ID is invalid.'
          }
        });
      }

      const principal = response.locals.principal;

      const workflow = await Workflow.findOneAndDelete({
        _id: parsedId.data,
        organizationId: principal.organizationId
      });

      if (!workflow) {
        return response.status(404).json({
          error: {
            code: 'WORKFLOW_NOT_FOUND',
            message: 'Workflow was not found.'
          }
        });
      }

      return response.status(204).send();
    } catch (error) {
      return next(error);
    }
  }
);
