
import { z } from "zod";

/**
 * Supported workflow node types.
 */
export const workflowNodeTypeSchema = z.enum([
  "manualTrigger",
  "action",
  "condition",
  "ai",
  "approval",
  "end",
]);

/**
 * Schema for a single workflow node.
 */
export const workflowNodeSchema = z
  .object({
    id: z.string().trim().min(1).max(120),
    type: workflowNodeTypeSchema,
    label: z.string().trim().min(1).max(160),
    config: z.record(z.unknown()).default({}),
    position: z
      .object({
        x: z.number().finite(),
        y: z.number().finite(),
      })
      .optional(),
  })
  .strict();

/**
 * Schema for a connection between two workflow nodes.
 */
export const workflowEdgeSchema = z
  .object({
    id: z.string().trim().min(1).max(160).optional(),
    source: z.string().trim().min(1).max(120),
    target: z.string().trim().min(1).max(120),
    label: z.string().trim().max(160).optional(),
    sourceHandle: z.string().trim().max(120).nullable().optional(),
    targetHandle: z.string().trim().max(120).nullable().optional(),
  })
  .strict();

/**
 * Schema for an entire workflow graph.
 */
export const workflowGraphSchema = z
  .object({
    nodes: z.array(workflowNodeSchema).min(1).max(200),
    edges: z.array(workflowEdgeSchema).max(500),
  })
  .strict();

/**
 * TypeScript types inferred from the schemas.
 */
export type WorkflowNodeType = z.infer<
  typeof workflowNodeTypeSchema
>;

export type WorkflowNode = z.infer<
  typeof workflowNodeSchema
>;

export type WorkflowEdge = z.infer<
  typeof workflowEdgeSchema
>;

export type WorkflowGraph = z.infer<
  typeof workflowGraphSchema
>;

export interface WorkflowGraphValidationResult {
  valid: boolean;
  errors: string[];
}

/**
 * Validates relationships between workflow nodes.
 */
export function validateWorkflowGraph(
  graph: WorkflowGraph
): WorkflowGraphValidationResult {
  const errors: string[] = [];
  const nodeIds = new Set<string>();
  const edgeIds = new Set<string>();

  let triggerCount = 0;
  let endCount = 0;

  // Validate node identifiers and required node types.
  for (const node of graph.nodes) {
    if (nodeIds.has(node.id)) {
      errors.push(`Duplicate node id: "${node.id}".`);
    } else {
      nodeIds.add(node.id);
    }

    if (node.type === "manualTrigger") {
      triggerCount++;
    }

    if (node.type === "end") {
      endCount++;
    }
  }

  if (triggerCount !== 1) {
    errors.push(
      `A workflow must contain exactly one manualTrigger node; found ${triggerCount}.`
    );
  }

  if (endCount < 1) {
    errors.push("A workflow must contain at least one end node.");
  }

  // Validate edge identifiers and node references.
  for (const edge of graph.edges) {
    if (edge.id) {
      if (edgeIds.has(edge.id)) {
        errors.push(`Duplicate edge id: "${edge.id}".`);
      }

      edgeIds.add(edge.id);
    }

    if (edge.source === edge.target) {
      errors.push(
        `Edge from "${edge.source}" to itself is not allowed.`
      );
    }

    if (!nodeIds.has(edge.source)) {
      errors.push(
        `Edge source node "${edge.source}" does not exist.`
      );
    }

    if (!nodeIds.has(edge.target)) {
      errors.push(
        `Edge target node "${edge.target}" does not exist.`
      );
    }
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}
