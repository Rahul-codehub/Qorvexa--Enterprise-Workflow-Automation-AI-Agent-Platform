# Decision Log

This file records meaningful implementation decisions. Each entry states the choice, rationale, and consequence so that the project remains explainable as modules are added.

## 2026-10-17 — Project foundation

### Use a dependency-free static web application for the initial prototype

**Decision:** Build the first demonstrable dashboard in plain HTML, CSS, and JavaScript rather than introducing a framework and backend before the product behavior is understood.

**Why:** The starting repository was empty. A static implementation creates a fast, inspectable visual baseline with no installation or build requirement.

**Consequences:** Browser state is temporary and metrics are representative, not production data. This is an explicitly scoped prototype, not completion of the backend, AI, queue, security, or persistence requirements in the master brief.

### Model the platform as an enterprise operations dashboard

**Decision:** Present the product as “Qorvexa,” combining workflow visibility, agent activity, approval work, metrics, and recent events.

**Why:** It gives the capstone a cohesive user-facing narrative while leaving clear seams for later workflow, approval, monitoring, and AI modules.

**Consequences:** The present data is seeded and client-side. It must be replaced by organization-scoped API data before a production claim can be made.

### Keep demo interactions visible and contained

**Decision:** Put the initial workflow creation, run simulation, approval resolution, and feedback logic in `app.js`.

**Why:** The behaviors are easy to demonstrate and explain from one source file during the UI-prototype stage.

**Consequences:** Reloading resets state; there are no durable executions, audit records, authorization checks, retries, or human-approval resume path yet.

## 2026-10-18 — Responsive and interaction hardening

### Remove navigation that cannot reach a real destination

**Decision:** Keep sidebar navigation only for implemented in-page destinations and replace the unused help destination with the support section.

**Why:** A visible navigation control should never lead to a missing fragment or imply an unavailable module.

**Consequences:** Future page/route additions must be added to navigation only when implemented and linked to a real route or section.

### Use stacked mobile workflow records instead of horizontal scrolling

**Decision:** At narrow widths, hide the desktop table header and render each workflow as a stacked record with explicit labels for last run and success rate.

**Why:** Horizontal scrolling makes the core operational information harder to inspect on phones and violated the mobile usability requirement.

**Consequences:** The compact mobile view prioritizes workflow name, status, run time, success rate, and one clear run action over a desktop-table appearance.

### Centralize transient UI feedback

**Decision:** Use `showToast()` for successful actions and `setFormMessage()` for inline validation and form confirmation.

**Why:** Users need immediate, consistent confirmation or correction when interacting with workflows, approvals, and support.

**Consequences:** The next application phase should replace this local mechanism with API error contracts, persisted notifications, and accessible loading states.

### Keep the support form local until a secure delivery channel exists

**Decision:** Validate the custom support form in the browser and show clear success/error feedback without sending a network request.

**Why:** There is no API, email provider, authentication boundary, or data-retention policy in the current prototype. Pretending that a message was delivered would be misleading.

**Consequences:** The interface demonstrates the validation UX only. A later backend implementation must define authenticated submission, rate limits, storage/retention, notifications, and safe error handling before making it a live support channel.

### Prefer an SVG favicon and existing vector-like visuals over raster assets

**Decision:** Add a tiny local SVG favicon and retain CSS/inline-SVG dashboard visuals.

**Why:** The repository has no raster image assets; adding a compressed raster format would increase rather than reduce asset weight.

**Consequences:** There are currently no images requiring compression. Any future uploaded or marketing images should be resized, compressed, and served in modern formats with explicit dimensions.

### Maintain implementation documentation with every module change

**Decision:** Treat updates to `Flow.md` and `Decisions.md` as part of each future feature change.

**Why:** The project needs to be understandable to its developer, evaluator, and future contributors, particularly as the static prototype becomes a multi-service system.

**Consequences:** Every change should document responsibility boundaries, data/control flow, validation, persistence/authentication effects, tests, rationale, and known limitations. No feature should be described as production-ready unless those boundaries are implemented and verified.

## 2026-10-18 — Production-oriented foundation

### Introduce a monorepo with explicit control-plane boundaries

**Decision:** Create separate web, API, worker, AI-service, and shared-contract packages using npm workspaces.

**Why:** The platform needs distinct trust boundaries: the browser cannot authorize itself, the API should not run background executions, and the AI component must not receive arbitrary action authority.

**Consequences:** The local project now requires Node dependencies and, for full startup, MongoDB and Redis. The original static dashboard remains only as a visual reference until it is replaced by authenticated API-backed pages.

### Start graph validation in a shared, side-effect-free package

**Decision:** Define workflow node/edge/status schemas and baseline graph rules in `@qorvexa/shared`.

**Why:** The API, worker, and UI must agree on workflow contracts, while graph validation needs isolated unit coverage without network services.

**Consequences:** The current validator intentionally covers only structural baseline rules. Node configuration, reachability, conditions, cycles, and publish-time rules will be added incrementally rather than claimed prematurely.

### Use a visibly labeled deterministic AI mock first

**Decision:** The FastAPI service accepts only bounded classify/extract/summarize tasks and returns a provider label of `mock` until a real provider adapter is implemented.

**Why:** This makes the platform usable without a paid key and avoids the misleading claim that generated fallback output came from a real model.

**Consequences:** No Groq call exists yet; a provider integration must include configuration, timeout, output-schema validation, logs, and tests before it is enabled.

### Require database/queue infrastructure instead of faking durability

**Decision:** Configure MongoDB and Redis through Docker Compose, and leave service startup verification pending while Docker is unavailable.

**Why:** Workflow execution, retries, approvals, and audit trails require durable state. An in-memory substitute would not satisfy those claims.

**Consequences:** API/worker runtime checks remain blocked in this environment. The implementation status records this explicitly, and the next development environment must run the Compose services before those modules are marked verified.

## 2026-10-18 — Free-tier internet deployment

### Keep stateful services managed and host stateless services on one free VM

**Decision:** Use MongoDB Atlas Free for durable database state, Upstash Redis Free for the queue, Vercel Hobby for the web UI, and one Oracle Always Free VM for API, worker, AI service, and HTTPS edge.

**Why:** This keeps the always-running BullMQ worker off serverless/free services that suspend or cannot reliably maintain a worker process, while avoiding public database and Redis containers.

**Consequences:** The deployment has free-tier caps and requires multiple accounts. It is appropriate for a capstone demonstration but must not be described as a high-availability production deployment.

### Terminate public traffic at Caddy only

**Decision:** Publish only ports 80/443 from Caddy and keep API/AI ports internal to Docker.

**Why:** Browser clients require HTTPS and the API must not expose its internal services or infrastructure connections publicly.

**Consequences:** A resolvable public hostname is required for automatic TLS. The guide uses a free Duck DNS subdomain; a paid custom domain remains optional.

## 2026-10-18 — Product rebrand

### Adopt Qorvexa as the product identity

**Decision:** Rename the product and internal workspace scope to **Qorvexa**.

**Why:** Qorvexa is the selected coined brand for the enterprise workflow and AI-agent platform.

**Consequences:** UI text, metadata, API/AI identifiers, deployment settings, documentation, and package names now use Qorvexa. A real custom domain and support mailbox must be registered before the displayed `support@qorvexa.com` address can receive messages.
