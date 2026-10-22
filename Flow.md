# Qorvexa Flow and Module Guide

**Last updated:** 2026-10-18  
**Current implementation:** dependency-free, single-page browser prototype  
**Product target:** Enterprise Workflow Automation & AI Agent Platform

This document describes what exists in the repository today and how the modules interact. It deliberately distinguishes client-side demo behavior from the production architecture described in the project brief.

## 1. Current repository structure

```text
Enterprise Workflow Automation & AI Agent Platform/
├── index.html     # Semantic dashboard markup, modal, support form, metadata
├── styles.css     # Design system, layout, responsive behavior, component states
├── app.js         # In-memory state, rendering, validation, interactions
├── favicon.svg    # Lightweight brand favicon
├── Flow.md        # This module and execution-flow guide
├── Decisions.md   # Architectural and UX decisions
└── README.md      # Project overview and startup instructions
```

## 2. Module map

| Module | Current responsibility | Source of truth | Current limitation |
| --- | --- | --- |
| Dashboard shell | Renders the sidebar, header, metric cards, panels, and support area. | `index.html` | Metrics are seeded, not database-derived. |
| Navigation | Moves to real dashboard sections; collapses into a mobile drawer. | `index.html`, `app.js`, `styles.css` | No route-based pages or authorization yet. |
| Workflow list | Renders workflows and allows a user to simulate starting a workflow. | `workflows[]` in `app.js` | State disappears on browser reload. |
| Workflow creation | Opens a modal, validates the name, adds a workflow/activity record, and announces success. | `workflowForm` listener in `app.js` | Does not save drafts, versions, or a graph. |
| Agent activity | Displays seeded agent status and scrolls to the agent panel. | `index.html`, `app.js` | No AI service or live task orchestration. |
| Approval queue | Marks an item resolved and synchronizes both approval counts. | approval button listeners in `app.js` | No durable approval, identity check, or resume mechanism. |
| Support form | Validates name, email, and message; provides inline success/error feedback. | `supportForm` listener in `app.js` | Does not submit to a server or email provider. |
| Feedback system | Uses inline form messages for validation and a toast for completed actions. | `setFormMessage()` and `showToast()` in `app.js` | Messages are not persisted or centralized. |
| Responsive layout | Uses grids on desktop and stacked workflow rows/drawer navigation on mobile. | `styles.css` | Requires browser/device QA before production release. |

## 3. Application startup

```text
Browser opens index.html
        |
        +--> Loads favicon.svg, Google Fonts, and styles.css
        |        |
        |        +--> CSS establishes desktop grids and mobile breakpoints
        |
        +--> Loads app.js after the HTML markup
                 |
                 +--> Creates seeded workflows[] and activities[]
                 +--> Resolves required DOM elements
                 +--> renderWorkflows() fills #workflowRows
                 +--> renderActivity() fills #activityList
                 +--> Registers event listeners for forms, navigation, buttons, and modal
```

## 4. Interaction flows

### 4.1 Create workflow

```text
Create workflow button
        |
        +--> openModal() exposes #workflowModal and focuses name input
        |
User submits workflow form
        |
        +--> Prevent page reload
        +--> Trim and validate name (minimum 3 characters)
        |       |
        |       +--> Invalid: show inline error and keep modal open
        |
        +--> Read selected template
        +--> Insert workflow into workflows[] and activity into activities[]
        +--> Re-render list and activity panel
        +--> Reset/close modal and show success toast
```

### 4.2 Simulate workflow run

```text
User selects “Run” / row action
        |
        +--> Delegated #workflowRows click handler finds data-index
        +--> Set selected workflow to Running and last run to Just now
        +--> renderWorkflows()
        +--> Show success toast
```

### 4.3 Resolve approval

```text
User selects Review or Resolve
        |
        +--> Mark nearest .attention-item as .resolved
        +--> Disable button and change its label to Resolved
        +--> Count unresolved items
        +--> Update dashboard and navigation approval badges
        +--> Show success toast
```

### 4.4 Submit support request

```text
User submits support form
        |
        +--> Validate non-trivial name, email syntax, and 10-character message
        |       |
        |       +--> Invalid: inline error message
        |
        +--> Valid: reset form, show inline confirmation, show toast
```

### 4.5 Mobile navigation and layout

```text
Viewport <= 760px
        |
        +--> Sidebar is translated off-screen
        +--> Menu button toggles .sidebar.open and aria-expanded
        +--> Selecting a navigation item, clicking outside, or Escape closes it
        +--> Workflow records become stacked rows (not a horizontally scrollable table)
        +--> Panels/forms use a single-column layout where necessary
```

## 5. Current state model

`app.js` has two mutable arrays:

```text
workflows[]  = name, icon, tone, status, statusClass, lastRun, success
activities[] = icon, tone, title, detail, time
```

All current changes are local to the browser. Render functions rebuild their respective DOM areas from these arrays. Reloading the page restores the seeded data.

## 6. Accessibility and usability behavior

- Every visible form field has a label; placeholder text is not used as a label.
- Workflow and support form feedback is announced through live regions.
- Modal semantics use `role="dialog"`, `aria-modal`, a labelled title, keyboard Escape handling, and initial focus.
- The mobile menu exposes its open state through `aria-expanded`.
- Logo, phone, and email use functional links (`#overview`, `tel:`, and `mailto:`).
- Navigation only contains destinations that exist in the page.

## 7. Production target flow (not implemented yet)

```text
Web UI --> authenticated /api/v1 request --> workflow service
  ^              |                         |
  |              +--> authorization         +--> MongoDB execution record
  |                                                   |
  +-------- status / notifications <------------------+--> BullMQ / Redis worker
                                                                  |
                                                                  +--> deterministic graph executor
                                                                  +--> approval service
                                                                  +--> bounded AI service
                                                                  +--> approved integrations
```

The future backend owns authorization, tenant isolation, workflow versions, graph validation, durable executions, retries, audit logs, approvals, and integration safety. The Python AI service returns schema-validated, bounded results only; it must not directly execute workflow actions or access unrelated tenant data.

## 8. Documentation maintenance rule

For every future module change, update this file in the same change set with:

1. New or changed files and their responsibilities.
2. Data/control flow, validation, and user-visible states.
3. Persistence, authorization, and external-service boundaries.
4. Known limitations and test coverage.

Record the corresponding rationale and trade-offs in `Decisions.md`.

## 9. Foundation architecture flow — 2026-10-18

The repository now contains the first production-oriented service boundaries in addition to the original static prototype:

```text
Next.js control-plane UI
        |
        +--> Express /api/v1
        |       +--> validates requests through @qorvexa/shared contracts
        |       +--> will enforce authentication and organization ownership
        |       +--> will persist MongoDB records before publishing work
        |
        +--> BullMQ worker
        |       +--> will reload durable execution/version state
        |       +--> will run deterministic nodes, retries, and approval pauses
        |
        +--> FastAPI AI service
                +--> accepts bounded classify/extract/summarize requests
                +--> returns an explicitly labelled mock result today
                +--> never receives database or action authority
```

### Foundation modules

| Module | Current behavior | Next responsibility |
| --- | --- | --- |
| `packages/shared` | Defines graph/node/status schemas and checks trigger/end/edge validity. | Add node-specific configuration, reachability, cycle, and condition validation. |
| `apps/api` | Secures JSON/CORS/rate limit boundaries and exposes health/graph validation. | Add persistence, auth, RBAC, tenant repositories, and workflow endpoints. |
| `apps/worker` | Connects to the workflow queue and logs received execution IDs. | Load persistent executions and run the deterministic state machine. |
| `apps/ai-service` | Offers a bounded mock provider with max input size and labeled output. | Add provider abstraction and validated AI-node integration. |
| `apps/web` | Presents an intentionally unconnected control-plane shell and local SVG favicon. | Add protected routes and API-backed dashboard/workflow pages. |

Full phase status and verified commands are maintained in `docs/IMPLEMENTATION_STATUS.md`.

**Foundation verification:** the shared/API/worker/web TypeScript packages compile, the Next.js production build completes, and the FastAPI module passes Python compilation. HTTP route execution remains an environment check because this sandbox blocks loopback requests and Docker is unavailable.

## 11. Brand identity — 2026-10-18

The product name is **Qorvexa**. The name is applied consistently to browser metadata, UI copy, API/AI service identity, npm workspace scope (`@qorvexa/*`), deployment variables, and project documentation. The current support email is a presentation placeholder until the `qorvexa.com` domain is registered and configured.

## 10. Free-tier deployment flow — 2026-10-18

```text
Vercel-hosted browser UI
        |
        | HTTPS + exact CORS origin
        v
Caddy on Oracle Always Free VM
        |
        +--> API container --> MongoDB Atlas (TLS)
        |                  --> Upstash Redis (TLS)
        +--> Worker container --> Upstash Redis (TLS)
        +--> AI container (private Docker network only)
```

Only Caddy publishes ports 80 and 443. The API, worker, AI service, MongoDB, and Redis are never exposed as direct public services. The detailed runbook is `docs/DEPLOYMENT_FREE_TIER.md`; it also records free-tier capacity and current-feature limitations.
