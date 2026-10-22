
import {
  type WorkflowGraph,
  type WorkflowNode,
  validateWorkflowGraph,
  workflowGraphSchema
} from '@qorvexa/shared';

export interface WorkflowStepResult {
  nodeId: string;
  nodeType: string;
  status: 'completed';
  input: Record<string, unknown>;
  output: unknown;
  error: null;
  startedAt: Date;
  completedAt: Date;
}

export interface WorkflowRunResult {
  output: Record<string, unknown>;
  steps: WorkflowStepResult[];
}

export class WorkflowExecutionError extends Error {
  constructor(
    message: string,
    public readonly nodeId?: string
  ) {
    super(message);
    this.name = 'WorkflowExecutionError';
  }
}

export async function executeWorkflowGraph(
  snapshot: unknown,
  initialInput: Record<string, unknown>
): Promise<WorkflowRunResult> {
  const parsed = workflowGraphSchema.safeParse(snapshot);

  if (!parsed.success) {
    throw new WorkflowExecutionError(
      `Invalid workflow snapshot: ${parsed.error.issues
        .map((issue) => issue.message)
        .join('; ')}`
    );
  }

  const graph: WorkflowGraph = parsed.data;
  const validation = validateWorkflowGraph(graph);

  if (!validation.valid) {
    throw new WorkflowExecutionError(
      `Invalid workflow graph: ${validation.errors.join('; ')}`
    );
  }

  const nodes = new Map(graph.nodes.map((node) => [node.id, node]));
  const outgoing = new Map<string, string[]>();

  for (const edge of graph.edges) {
    const targets = outgoing.get(edge.source) ?? [];
    targets.push(edge.target);
    outgoing.set(edge.source, targets);
  }

  const trigger = graph.nodes.find((node) => node.type === 'manualTrigger');

  if (!trigger) {
    throw new WorkflowExecutionError('Manual trigger node is missing.');
  }

  const context: Record<string, unknown> = { ...initialInput };
  const steps: WorkflowStepResult[] = [];
  const visited = new Set<string>();
  let current: WorkflowNode | undefined = trigger;

  while (current) {
    if (visited.has(current.id)) {
      throw new WorkflowExecutionError(
        `Cycle detected at node "${current.id}".`,
        current.id
      );
    }

    visited.add(current.id);
    const startedAt = new Date();
    const stepInput = { ...context };
    let stepOutput: unknown;

    try {
      switch (current.type) {
        case 'manualTrigger':
          stepOutput = { ...context };
          break;

        case 'action': {
          const operation = current.config.operation;
          const key = current.config.key;

          if (operation !== 'set') {
            throw new WorkflowExecutionError(
              'Unsupported action operation. Supported operation: "set".',
              current.id
            );
          }

          if (typeof key !== 'string' || key.trim().length === 0) {
            throw new WorkflowExecutionError(
              'The set action requires a non-empty config.key.',
              current.id
            );
          }

          context[key] = current.config.value;
          stepOutput = { ...context };
          break;
        }

        case 'end':
          stepOutput = { ...context };
          break;

        default:
          throw new WorkflowExecutionError(
            `Node type "${current.type}" is not supported by this worker yet.`,
            current.id
          );
      }
    } catch (error) {
      if (error instanceof WorkflowExecutionError) throw error;

      throw new WorkflowExecutionError(
        error instanceof Error ? error.message : 'Unknown node execution error.',
        current.id
      );
    }

    const completedAt = new Date();

    steps.push({
      nodeId: current.id,
      nodeType: current.type,
      status: 'completed',
      input: stepInput,
      output: stepOutput,
      error: null,
      startedAt,
      completedAt
    });

    if (current.type === 'end') {
      if (visited.size !== graph.nodes.length) {
        const unreachable = graph.nodes
          .filter((node) => !visited.has(node.id))
          .map((node) => node.id);

        throw new WorkflowExecutionError(
          `Workflow contains nodes not reached from the trigger: ${unreachable.join(', ')}.`
        );
      }

      return { output: { ...context }, steps };
    }

    const targets = outgoing.get(current.id) ?? [];

    if (targets.length !== 1) {
      throw new WorkflowExecutionError(
        `Node "${current.id}" must have exactly one outgoing edge in this prototype runner; found ${targets.length}.`,
        current.id
      );
    }

    current = nodes.get(targets[0]);
  }

  throw new WorkflowExecutionError(
    'Workflow ended without reaching an end node.'
  );
}
