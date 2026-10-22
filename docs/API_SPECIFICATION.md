# API Specification (Foundation)

All application endpoints will live below `/api/v1`. API responses use `{ "error": { "code", "message", "details?" } }` for failures.

## Available now

| Method | Path | Purpose |
| --- | --- | --- |
| `GET` | `/api/v1` | API identity/version. |
| `GET` | `/api/v1/health` | Service/database readiness; returns `503` while MongoDB is unavailable. |
| `POST` | `/api/v1/workflows/validate` | Validate a workflow graph contract. Returns `200` when valid, `422` with actionable graph errors otherwise. |

### Validate graph request

```json
{
  "nodes": [{ "id": "start", "type": "manualTrigger", "label": "Start", "config": {} }],
  "edges": []
}
```

The current foundation requires exactly one trigger and at least one `end` node, forbids self-links, duplicate node IDs, and links to absent nodes. Reachability/configuration/cycle validation is planned for the workflow-management slice.

## Planned endpoint groups

`auth`, `organizations`, `memberships`, `workflows`, `workflow-versions`, `executions`, `node-executions`, `approvals`, `integrations`, `notifications`, and `audit-events`.
