# Qorvexa — Enterprise Workflow Automation & AI Agent Platform

Qorvexa is being built as a modular enterprise workflow control plane: Next.js web UI, Express API, BullMQ worker, MongoDB/Redis infrastructure, and a bounded FastAPI AI service.

## Current phase

Phase 0 and the code foundation of Phase 1 are complete. The system is **not** yet a finished workflow platform: authentication, persistence models, execution engine, approvals, and the visual builder are still pending. Read [implementation status](docs/IMPLEMENTATION_STATUS.md) for exact verification and blockers.

## Repository layout

```text
apps/web          Next.js control-plane UI
apps/api          Express API and security boundary
apps/worker       BullMQ background worker
apps/ai-service   FastAPI bounded AI task service
packages/shared   Cross-service workflow contracts
docs/             Architecture, plan, API, database, security, status
```

## Local setup

1. Copy `.env.example` to `.env` and replace both JWT secrets with long random values.
2. Start MongoDB and Redis with `docker compose up -d`.
3. Run `npm install`.
4. Start the API, web app, worker, and AI service in separate terminals:

```powershell
npm run dev:api
npm run dev:web
npm run dev:worker
cd apps/ai-service; uvicorn app.main:app --reload --port 8000
```

The project path currently contains `&`, which Windows `cmd` can misparse inside npm-generated executable paths. Moving the project to a path without `&` is recommended before routine npm script use; see the status document.

## Documentation

- [Architecture](docs/ARCHITECTURE.md)
- [Implementation plan](docs/IMPLEMENTATION_PLAN.md)
- [Database design](docs/DATABASE_DESIGN.md)
- [API specification](docs/API_SPECIFICATION.md)
- [Security baseline](docs/SECURITY.md)
- [Implementation status](docs/IMPLEMENTATION_STATUS.md)
- [Module flows](Flow.md)
- [Decision log](Decisions.md)
