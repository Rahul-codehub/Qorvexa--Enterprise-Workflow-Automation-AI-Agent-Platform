# Architecture

Qorvexa is a modular monorepo. The control plane is intentionally separate from execution and AI processing.

```text
Next.js web --> Express API --> MongoDB
                   |   |
                   |   +--> BullMQ --> Redis --> worker --> approved actions
                   |
                   +--> FastAPI AI service (validated, bounded task results)
```

## Services

| Component | Responsibility | Must not do |
| --- | --- | --- |
| `apps/web` | UI, protected routes, workflow editor, operator experience | Authorize itself or execute workflow actions. |
| `apps/api` | Auth, RBAC, tenant checks, workflow CRUD/versioning, validation, persistence, queue publication | Execute AI prompts or long-running jobs in request handlers. |
| `apps/worker` | Load durable execution state and perform deterministic node scheduling/retries | Trust raw job payloads or bypass execution state. |
| `apps/ai-service` | Return schema-validated classification, extraction, or summary results | Access MongoDB, secrets, unrelated tenant data, or integrations. |
| `packages/shared` | Shared schemas, status enums, graph validation contracts | Contain network/database side effects. |

## Trust boundaries

- The API derives organization and role from authenticated server-side context; it never trusts client-supplied role or organization IDs.
- The worker reloads execution/version data and uses idempotency keys before an external side effect.
- AI output is untrusted structured data until validated by the API/engine against the node contract.
- Secrets remain server-side and are excluded from API responses, exports, and logs.

## Current foundation

Implemented: package boundaries, health/graph-validation API routes, shared graph contracts, a BullMQ worker boundary, and a deterministic labeled AI mock. Persistence, auth, worker execution, and page modules are not implemented yet; see `IMPLEMENTATION_STATUS.md`.
