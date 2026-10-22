import { Router } from 'express';
import { workflowGraphSchema, validateWorkflowGraph } from '@qorvexa/shared';

export const workflowValidationRouter = Router();

workflowValidationRouter.post('/', (request, response) => {
  const graph = workflowGraphSchema.parse(request.body);
  const result = validateWorkflowGraph(graph);
  response.status(result.valid ? 200 : 422).json(result);
});
