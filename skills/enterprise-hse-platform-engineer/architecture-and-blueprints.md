# Architecture & Module Blueprints

Use these concise templates before substantial implementation. Scale depth to scope; mark decisions as confirmed, proposed, or unresolved. Keep project-specific reports in the project workspace, not in the skill directory.

## Project inventory (existing projects)

Inspect before editing:

- Framework, package scripts, dependencies, folder structure and Git state.
- Routes/pages, shared UI/components and existing modules.
- Database schema, migrations, constraints, persistence and backups.
- Authentication, session/account lifecycle, authorization and permission checks.
- API contracts, validation, integrations and error handling.
- Tests, build/runtime scripts, environment/configuration, deployment and storage.

Classify each relevant area as **healthy / incomplete / broken / duplicate / missing / high-risk**. Never expose secrets in reports. Preserve sound architecture and data; plan migrations and compatibility when changing schemas.

## Architecture report

Before large changes, define:

1. Goal, users, scope, non-goals, constraints, assumptions and external requirements.
2. System/deployment architecture and trust boundaries.
3. Module map, ownership and cross-module flows.
4. Shared domain entities, ER relationships, identifiers and data lifecycle.
5. Database/schema and migration plan, constraints, indexes and transaction boundaries.
6. API map: routes, request/response schemas, auth, permission, pagination/filtering, errors, idempotency.
7. UI route map and reusable record-detail/list/form patterns.
8. RBAC matrix and any record/site/department-level scope rules.
9. Workflows/state machines, transition guards, validations and side effects.
10. Notifications, audit events, attachments/storage, printing and integrations.
11. Security/privacy, operational backup/restore, deployment and observability approach.
12. Test strategy, rollout/migration plan, risks and acceptance criteria.

## Module blueprint

For every substantial module, answer:

- **Objective:** What operational problem does it solve? What is out of scope?
- **Personas:** Who reports, owns, reviews, approves, verifies, administers, and views?
- **Pages:** Dashboard/queue, register, create/edit, detail, review/approval, settings/reports as relevant.
- **Records and fields:** Source of truth, required/optional fields, validation, references, evidence and retention.
- **Workflow/state machine:** States, legal transitions, guards, permissions, validation, side effects, notification and audit event for each transition.
- **Responsibilities/permissions:** Who can view/create/edit/assign/review/approve/reject/verify/close/reopen/archive? Are there separation-of-duties constraints?
- **Actions:** When an action is generated, ownership, priority, due date, evidence, verification, effectiveness, overdue/escalation and reopening.
- **Reports/KPIs:** Name, definition, numerator/denominator, filters, time basis, source fields, freshness and owner. Never hardcode production metrics.
- **Integrations:** Related shared entities/modules and lifecycle handoffs.
- **Mobile/print:** Field workflow, accessibility, connectivity assumptions, printable official record.
- **Edge cases:** Duplicate report, reassignment, rejected approval, overdue/suspended permit, reopened action, missing evidence, concurrent edits, archival and deletion.

## Data and workflow design rules

- Use explicit relational links and shared entities; avoid per-module duplicates of people, department, location, assets, documents, or actions.
- Give records stable IDs and lifecycle timestamps/actors (created/updated and relevant status/approval/verification events). Audit consequential changes with actor, time, entity/record, event, previous/new value where appropriate, and request context where available.
- Use database PK/FK/unique/check constraints, indexes, transactions, normalized relations and deliberate soft-delete/archive policy. Protect sensitive data at rest/in transit using the environment's supported controls; minimize access and retention.
- Model workflow transitions explicitly, not as free-text statuses. Enforce rules server-side and record an immutable or tamper-evident audit history according to system needs.
- Use a central Action model for follow-up generated from any source module. Example lifecycle: Open → Assigned → In Progress → Pending Verification → Closed; Overdue is preferably derived from due date and non-closed state (or explicitly modeled with consistent transition semantics); Reopened is auditable.
- Separate evidence attachment metadata from binary storage; authorize upload/download, validate file type/size, and avoid public exposure by default.
- Standardize API error shape, e.g. `{ "error": { "code": "PERMISSION_DENIED", "message": "You do not have permission to perform this action.", "details": {} } }` without leaking sensitive details.

## UX and platform defaults

Design an enterprise industrial safety command center: professional, operational, information-dense, easy to scan. Reuse consistent list/detail/form/workflow patterns. Major record detail may use Overview, Details, Risk, Actions, Evidence, Attachments, Comments, Approvals, Timeline, History, and Audit tabs as applicable.

Support desktop, laptop, tablet, and mobile. For large tables, adapt to prioritized columns, expandable rows, or mobile cards; keep primary actions accessible. Support Arabic RTL and English LTR via translation dictionaries, logical CSS properties, and locale-aware formatting; test mixed Arabic/English content.

For a new self-hostable standalone app without a user-selected stack, use the main skill's default stack only if compatible with the platform and project constraints. Keep adapters for storage/integrations where useful; do not impose vendor-specific hosting without explicit user choice. Real authentication and server-enforced RBAC are required; never ship fake login.

## Print design

Provide reusable print layouts, typically A4, with company/logo, report identifier, generated date/by, footer and page numbers. Force print-safe light colors and readable contrast regardless of UI dark mode. Select templates as appropriate: safety report, NCR/CAPA, incident investigation, risk assessment/JSA/JHA, inspection, audit, PTW, training/toolbox talk, fire inspection, emergency drill, meeting minutes.
