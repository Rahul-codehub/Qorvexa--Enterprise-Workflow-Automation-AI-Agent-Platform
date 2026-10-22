
import { test } from "node:test";
import assert from "node:assert/strict";

import {
  validateWorkflowGraph,
  workflowGraphSchema,
} from "../dist/index.js";

const validGraph = {
  nodes: [
    { id: "trigger-1", type: "manualTrigger", label: "Start" },
    { id: "end-1", type: "end", label: "Finish" },
  ],
  edges: [
    { id: "edge-1", source: "trigger-1", target: "end-1" },
  ],
};

test("accepts a valid workflow graph", () => {
  const parsed = workflowGraphSchema.safeParse(validGraph);

  assert.equal(parsed.success, true);

  if (parsed.success) {
    assert.deepEqual(validateWorkflowGraph(parsed.data), {
      valid: true,
      errors: [],
    });
  }
});

test("rejects duplicate node IDs", () => {
  const graph = {
    nodes: [
      { id: "trigger-1", type: "manualTrigger", label: "Start" },
      { id: "trigger-1", type: "action", label: "Duplicate" },
      { id: "end-1", type: "end", label: "Finish" },
    ],
    edges: [],
  };

  const result = validateWorkflowGraph(graph);

  assert.equal(result.valid, false);
  assert.ok(result.errors.some((error) => error.includes("Duplicate node id")));
});

test("reports connections to missing nodes", () => {
  const graph = {
    nodes: validGraph.nodes,
    edges: [{ source: "missing-source", target: "missing-target" }],
  };

  const result = validateWorkflowGraph(graph);

  assert.equal(result.valid, false);
  assert.ok(result.errors.some((error) => error.includes("source node")));
  assert.ok(result.errors.some((error) => error.includes("target node")));
});

test("rejects self-referencing connections", () => {
  const graph = {
    nodes: validGraph.nodes,
    edges: [{ source: "trigger-1", target: "trigger-1" }],
  };

  const result = validateWorkflowGraph(graph);

  assert.equal(result.valid, false);
  assert.ok(result.errors.some((error) => error.includes("itself")));
});

test("requires a trigger and an end node", () => {
  const graph = {
    nodes: [{ id: "action-1", type: "action", label: "Action" }],
    edges: [],
  };

  const result = validateWorkflowGraph(graph);

  assert.equal(result.valid, false);
  assert.ok(result.errors.some((error) => error.includes("manualTrigger")));
  assert.ok(result.errors.some((error) => error.includes("end node")));
});

test("rejects an empty workflow at schema level", () => {
  const result = workflowGraphSchema.safeParse({
    nodes: [],
    edges: [],
  });

  assert.equal(result.success, false);
});
