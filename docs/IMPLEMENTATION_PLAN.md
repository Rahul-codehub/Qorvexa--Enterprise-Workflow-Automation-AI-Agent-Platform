# Implementation Plan

## Phase 0 — Assessment and planning

- [x] Assess the initial static prototype.
- [x] Define monorepo and service boundaries.
- [x] Create architecture, data, API, security, status, flow, and decision documentation.

## Phase 1 — Foundation

- [x] Configure npm workspaces and TypeScript packages.
- [x] Add Next.js, Express, BullMQ worker, FastAPI mock-service foundations.
- [x] Add Docker Compose for MongoDB and Redis and an environment template.
- [x] Add API health and shared workflow-graph validation endpoints.
- [ ] Verify service startup against MongoDB/Redis (blocked locally: Docker unavailable).

## Phase 2 — Auth and organizations

- [ ] User, organization, and membership schemas/indexes.
- [ ] Password hashing, access/refresh sessions, route middleware.
- [ ] Permission matrix and tenant-isolation tests.

## Phase 3 — Workflow management

- [ ] Draft CRUD, archive/duplicate, immutable published versions.
- [ ] Graph validation: reachability, conditions, terminal nodes, config requirements.
- [ ] Workflow list/detail APIs and UI.

## Phase 4 — Visual builder

- [ ] React Flow editor, palette, node configuration, save/publish/run controls.
- [ ] Graph and node validation feedback.

## Phase 5 — Execution engine and worker

- [ ] Durable execution/node records and state machine.
- [ ] Transform, condition, manual trigger, end nodes.
- [ ] Queue consistency strategy, retries/backoff, idempotency, recovery.

## Phase 6 — AI service

- [x] Explicit mock provider boundary.
- [ ] Provider abstraction, timeout/retry policy, output-schema enforcement.
- [ ] AI node integration and tests.

## Phase 7 — Approvals and integrations

- [ ] Durable pause/resume approvals, authorization, deadline policy, audit events.
- [ ] Internal notification and secure HTTP integration adapters.

## Phase 8–10 — Monitoring, validation, documentation

- [ ] Live metrics, logs, notifications, filters, audit views.
- [ ] Unit/integration/end-to-end coverage and CI.
- [ ] Demo data, deployment guide, final security review.
