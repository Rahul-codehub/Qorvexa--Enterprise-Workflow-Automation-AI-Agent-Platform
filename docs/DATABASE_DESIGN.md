# Database Design

MongoDB is the durable source of truth. Every tenant-scoped collection carries `organizationId` and queries must filter by it in repositories.

| Collection | Key fields | Required indexes |
| --- | --- | --- |
| `users` | email, password hash, status | unique normalized email |
| `organizations` | name, slug, owner | unique slug |
| `organizationMemberships` | organizationId, userId, role | unique `(organizationId, userId)` |
| `workflows` | organizationId, name, draft graph, state | `(organizationId, updatedAt)` |
| `workflowVersions` | organizationId, workflowId, version, immutable graph | unique `(workflowId, version)` |
| `workflowExecutions` | organizationId, workflow/version IDs, status, trigger, idempotency key | `(organizationId, createdAt)`, `(workflowId, createdAt)`, unique scoped idempotency key |
| `nodeExecutions` | executionId, nodeId, status, attempts, I/O references | unique `(executionId, nodeId, attempt)` |
| `approvalRequests` | organizationId, executionId, nodeId, status, approver data | `(organizationId, status, createdAt)` |
| `integrations` | organizationId, type, encrypted credentials, enabled state | `(organizationId, type)` |
| `notifications` | organizationId, userId, event key, read state | `(userId, readAt, createdAt)` |
| `auditEvents` | organizationId, actor, action, target, metadata | `(organizationId, createdAt)` |

Execution payloads and long logs are separate records; they are never appended indefinitely to a workflow document. Credentials are encrypted at rest and omitted from normal serialized responses.
