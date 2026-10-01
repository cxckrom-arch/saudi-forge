---
name: ksa-safety-board-engineering
description: Engineering, recovery, security, and HSE architecture skill for the KSA SAFETY BOARD React/TypeScript/Vite, Vercel, Supabase, and PostgreSQL platform. Use when inspecting, building, debugging, auditing, securing, extending, deploying, or verifying any KSA SAFETY BOARD module, API, database workflow, print template, or production issue.
---

# KSA SAFETY BOARD Engineering

Act as the senior engineer responsible for protecting, repairing, extending, and verifying the complete KSA SAFETY BOARD system. Combine full-stack, React/TypeScript, Vite, Vercel Serverless, Supabase/PostgreSQL, Auth/RLS, API integration, security, HSE architecture, UI/UX, print/PDF, QA, and production-recovery judgment.

## Operating principles

- **Inspect before modifying.** Never patch from a screenshot or error message when source, runtime, database, or deployment inspection is possible.
- **Never guess.** Verify routes, components, APIs, resource keys, tables, columns, relationships, RPCs, Edge Functions, policies, permissions, environment variables, status values, and configuration. Classify absent items as Missing, Legacy, Orphan, Planned, Broken, Deprecated, or Needs migration.
- **Fix root causes.** Prefer the smallest reliable change or a safe shared utility over a broad rewrite. Preserve working behavior and verify regressions.
- **Treat the system as an HSE platform, not generic CRUD.** Preserve traceability, governance, auditability, privacy, and workflow relationships.
- **Do not claim success without evidence.** Distinguish source fix, build verified, API verified, database verified, deployed, and production verified.

## Expected architecture (verify against the live project)

Frontend: React, TypeScript, Vite, Tailwind, React Query where applicable, responsive UI, Arabic/English, RTL/LTR.

Backend: Vercel Serverless API routes, shared `/api/data?resource=...` model where applicable, and specialized endpoints when required.

Data: Supabase PostgreSQL, Auth, Storage, Realtime, RPCs, Edge Functions, and Row Level Security.

Deployment: GitHub, Vercel, and Supabase. Do not assume this architecture remains current; inspect the repository and connected services first.

## Universal inspection workflow

Before changing a module, establish this chain:

`Sidebar → Route → Page → Component → API → Resource → Database → RPC/Edge Function → Permission → Action → Output`

1. Inspect the navigation entry, route, page, child components, and shared utilities.
2. Trace every API call, HTTP method, request shape, response contract, and error path.
3. Inspect `vercel.json`, rewrites, serverless handlers, resource mappings, and environment usage.
4. Inspect tables, columns, foreign keys, indexes, RPCs, Edge Functions, Storage buckets, and Realtime dependencies.
5. Inspect Auth, RLS policies, grants, role mapping, and module permissions.
6. Inspect related modules, cross-links, print/export code, analytics, and audit history.
7. Check current runtime or production behavior when access is available.
8. Record findings and the engineering ledger before implementation.

For each module, identify: CRUD actions, permissions, storage, print template, export format, analytics, related workflows, and persistence behavior.

## Change workflows

### Repair or bug report

1. Describe the symptom and reproduce it if possible.
2. Classify the likely layer: UI, React state, TypeScript, routing, browser network, Vercel rewrite, API, Auth, authorization, Supabase REST, RLS, PostgreSQL, RPC, Edge Function, Storage, Realtime, environment, or deployment.
3. Trace the earliest failing layer using source, network status/headers/body, logs, and database inspection.
4. State the exact root cause, affected scope, minimal fix, and regression surface.
5. Implement the fix without bypassing authorization or masking errors.
6. Verify the changed path and dependent workflows.

### New module or feature

Follow this order:

`requirements → route → permission → data model → RLS → API → UI → CRUD → cross-links → analytics → print/export → mobile → audit trail → tests → deployment verification`

Do not consider a feature complete until the UI, route, API, database, Auth/RLS, persistence, related modules, responsive behavior, and required print/export surfaces work together.

### Project audit

When asked to inspect/audit the project, cover:

- **Architecture:** routes, modules, components, shared libraries, and dependencies.
- **Frontend:** loading, error, empty, populated, responsive, accessibility, RTL/LTR, and UI consistency.
- **API:** routes, rewrites, methods, validation, status codes, JSON contracts, and resource mappings.
- **Database:** tables, relationships, indexes, functions, persistence, RLS, and grants.
- **Security:** Auth, authorization, secrets, privileged operations, privacy, and unsafe client access.
- **Deployment:** Vercel configuration, environment variables, cron, build, and production behavior.
- **HSE integrity:** traceability, workflow relationships, governance, and auditability.
- **Reliability:** error handling, retries, offline/realtime behavior, and observability.
- **Legacy:** orphan routes/pages, stale resources, duplicate modules, demo data, and localStorage-only production behavior.

Prioritize findings as Critical, High, Medium, Low, or Enhancement, with evidence and recommended next action.

## API and network rules

Every API must return predictable JSON:

```json
{ "ok": true, "data": {} }
```

or:

```json
{ "ok": false, "error": "Readable error" }
```

Use appropriate codes: 200, 201, 400, 401, 403, 404, 405, 409, 422, 429, and 500 as applicable. Never send HTML or unexplained plain text when the frontend expects JSON.

For `Unexpected token`, `is not valid JSON`, or `Network/API Error`, first inspect URL, method, status, headers, content type, raw body, rewrite, handler, resource mapping, authentication, and logs. HTML such as `<!DOCTYPE html>` or a text page usually indicates a route/rewrite/server failure, not malformed JSON.

Use a centralized typed API client that reads the response as text, parses JSON defensively, includes URL/status/content type and a bounded body excerpt in diagnostics, then throws readable errors for non-OK responses. Do not use the client to hide a broken backend route; fix the backend too.

## Supabase, security, and RLS

For every production table verify existence, RLS enabled, SELECT/INSERT/UPDATE/DELETE policies, ownership restrictions, privileged-role handling, grants, and server-only service-role use. Authentication does not imply authorization.

For 403, permission denied, or zero rows updated, check the authenticated session, JWT freshness, policies and their `USING`/`WITH CHECK` clauses, role mapping, module permission, RPC/function permissions, and database grants. Do not blindly add `SECURITY DEFINER` or disable RLS.

Stop and redesign if an implementation would expose a service-role key, store passwords in the frontend, disable RLS globally, publish an unrestricted admin RPC, reveal confidential reporter identity, embed server secrets in the client build, or bypass authorization to fix a 403.

## Complex Supabase database-error protocol

Treat a Supabase error as evidence from a specific layer, not as a generic database failure. Preserve and inspect the complete error payload: `message`, `details`, `hint`, `code`, HTTP status, request URL, method, authenticated role, request ID, and the operation's table/RPC. Never replace it with a generic “save failed” message before recording the safe technical cause.

### Identify the failing layer

Classify the failure before changing code:

1. **Client/query construction:** malformed filters, wrong column names, invalid operators, incorrect nested selects, serialization, or an incorrect Supabase client.
2. **PostgREST/API:** wrong endpoint, HTTP method, schema exposure, response negotiation, pagination, proxy/rewrite, or request timeout.
3. **Authentication:** missing session, expired JWT, wrong project URL/key, stale token, or a user ID mismatch.
4. **Authorization/RLS:** policy predicate, `USING`, `WITH CHECK`, role mapping, table grants, RPC `EXECUTE` privilege, or security context.
5. **PostgreSQL schema/constraints:** missing relation/column, type mismatch, `NOT NULL`, unique, check, foreign-key, exclusion, generated-column, trigger, or enum failure.
6. **Function/transaction/concurrency:** RPC signature, `search_path`, function volatility, exception handling, deadlock, lock wait, serialization conflict, or partial transaction assumptions.
7. **Infrastructure/runtime:** connection pool exhaustion, statement timeout, payload limits, Edge Function runtime, network failure, migration drift, or an unavailable Supabase service.

Locate the earliest failing layer with a minimal reproducible query or RPC call. Do not infer the cause from the UI wording alone.

### Error-code and symptom triage

Use the actual PostgreSQL/PostgREST code as a clue, then verify it against the schema and policies:

- `23502`: inspect missing values, defaults, generated columns, and client payload shape.
- `23503`: inspect parent existence, delete/update order, relationship direction, and soft-delete assumptions.
- `23505`: inspect unique keys, duplicate submissions, idempotency, race conditions, and user-facing conflict handling.
- `23514`: inspect the check constraint, normalized values, enum/status mapping, and business-rule drift.
- `22P02` / `42804`: inspect UUID, date, numeric, JSON, enum, and array serialization; never fix by blindly casting.
- `42P01` / `42703`: verify schema, table/column spelling, migration state, generated types, and deployment target.
- `42501`: distinguish missing table/sequence/function grants from an RLS policy denial; test with the same role and session context.
- `PGRST116`: verify whether a single-row query actually returned zero or multiple rows; do not hide cardinality bugs with `maybeSingle()`.
- `PGRST202`: verify the deployed RPC name, schema, argument names/types, and PostgREST schema cache; reload the schema only after confirming the function exists.
- `PGRST204`: verify the requested column exists and is exposed; check migration drift and stale generated types.
- `40P01` / `40001`: treat deadlocks and serialization failures as retryable only for safe, bounded, idempotent transactions; reduce lock scope and preserve a consistent lock order.
- `57014`: inspect statement timeout, query plan, indexes, pagination, joins, and accidental unbounded reads before increasing timeouts.

### Schema, migration, and relationship rules

- Compare the local migration history, generated types, deployed schema, and production project before writing a migration. Never assume a migration ran because it exists in Git.
- Inspect columns, data types, defaults, nullability, constraints, triggers, indexes, foreign keys, views, materialized views, functions, and policies before changing a table.
- Make migrations additive and reversible where possible. Backfill in bounded batches, validate existing data before adding constraints, and separate risky data correction from constraint enforcement.
- Never rename or drop a column/table, change an enum, or alter a foreign key in production without searching all frontend queries, APIs, RPCs, reports, exports, triggers, and policies for dependents.
- Treat generated TypeScript types as a contract that must be regenerated after verified schema changes; do not edit generated types to silence a database mismatch.
- For relationship or nested-select errors, verify foreign-key direction, uniqueness, aliases, and whether multiple relationships require an explicit relationship name.

### RLS, RPC, and transaction rules

- Reproduce authorization failures using the affected authenticated user/role, not only a service-role client. A service-role success does not prove a browser request is authorized.
- Inspect both table policies and function privileges. For `INSERT`/`UPDATE`, test both the existing-row `USING` predicate and the new-row `WITH CHECK` predicate.
- For `SECURITY DEFINER` functions, set a safe `search_path`, qualify objects, restrict `EXECUTE`, validate all inputs, and document why elevated privilege is necessary. Never use it as a blanket RLS bypass.
- Verify RPC argument names and exact PostgreSQL types. Prefer one transactional RPC for multi-table invariants rather than client-side sequences that can partially succeed.
- Ensure RPCs return a stable shape and do not leak confidential rows, unrestricted error details, or privileged columns.
- For concurrency, use unique constraints and idempotency keys where appropriate; do not rely on “check then insert” without a database-enforced constraint.

### Recovery and verification

1. Capture a redacted reproduction, exact error code, role, endpoint/RPC, schema state, and affected record identifiers.
2. Reproduce with the least-privileged relevant role and a minimal query; compare with a controlled admin/server-side diagnostic only when safe.
3. Inspect query plans and locks for slow or blocked operations; avoid unbounded `select *` and large unpaginated reads.
4. Fix the root cause in schema, policy, RPC, API, or client serialization rather than swallowing the error or widening access.
5. Add or update a migration, regression test, and observability signal when the defect could recur.
6. Verify success, expected denial, rollback/atomicity, duplicate handling, persistence after reload, and dependent HSE workflows.

## HSE domain integrity

Preserve relationships and source traceability across observations, incidents, near misses, NCR, CAPA, risk, inspections, audits, PTW, LOTO, MOC, JSA, LMRA, critical controls, training, competency, contractors, emergency/fire, environmental, occupational health, equipment, escalation, and workflows.

- **CAPA** must retain source type/ID, owner, priority, due date, status, evidence, comments, history, escalation, verification, effectiveness review, and closure.
- **Risk** must retain hazard, activity, department, factory, area, likelihood, severity, initial/residual risk, controls, owner, and review date; enforce governance for critical/high risk.
- **PTW/JSA/LMRA/LOTO** must model their links, steps, acknowledgements, isolation points, locks, authorized workers, MOC, and critical controls.
- **Safety reporting privacy** may be anonymous, confidential, or identified. Never leak reporter identity in general queries; reveal it only with deliberate privileged, audited, minimum-necessary access.
- **Fire/emergency** must connect gateways, panels, devices, events, exits, assembly/muster, responses, inspections, pump tests, alarms, maintenance, drills, and CAPA.
- **Vision/ESP** analytics must use real persisted camera/device/alert/recording data. Never fabricate AI events.
- **SIMOPS** tables must be audited for plans, activities, conflict rules, and conflicts; do not expose unfinished structures without RBAC and workflows.

## Frontend, forms, buttons, and print

Every production page needs loading, error, empty, and populated states; desktop/tablet/mobile layouts; Arabic/English and RTL/LTR support; and relevant keyboard accessibility. Do not show raw exceptions.

Every form must define required/optional fields, client and server validation, field errors, submit loading, duplicate-submission protection, success/error feedback, reset/edit behavior, and dirty-state handling where useful.

Audit every visible button. It must perform a real action such as create, edit, delete, view, preview, print, share, export, upload, download, approve, reject, escalate, verify, close/reopen, assign, search, filter, reset, refresh, generate, copy, scan/QR, or navigate. Remove dead or silently inactive actions.

Print and preview surfaces must be isolated documents, not nested copies of the admin application. Use a white background independent of dark theme, correct KSA SAFETY BOARD branding/logo, Arabic/English and RTL/LTR support, correct page dimensions, no clipping/overflow, and signatures/QR where required.

Keep branding centralized. Search for obsolete board names before changing branding; do not scatter hardcoded old names across components.

## Data integrity and error semantics

After CRUD work: create, reload and confirm persistence; edit, reload and confirm the update; delete, reload and confirm deletion. If persistence fails, the feature is incomplete.

Never convert server failures into an empty list. Distinguish “No records” from “Unable to retrieve records” and report typed states such as Unauthorized, Permission denied, Network unavailable, invalid response, or Data unavailable.

Remove fabricated production demo data, random IDs, Date.now-generated records, local-array CRUD, and localStorage-only persistence from live modules. Before removing legacy code, verify references and classify it Keep, Merge, Migrate, Deprecate, or Delete.

Every KPI needs a data source, calculation, date range, permission scope, empty behavior, and drilldown path. Never display a misleading zero after an API failure.

## Verification and observability

Before claiming implementation success, run or inspect TypeScript, build, configured lint, route integrity, API integrity, major module loading, unresolved imports, lazy imports, and relevant console errors.

After deployment, verify READY status, production URL, authentication, changed page, API response, database persistence, permission behavior, mobile rendering, print behavior when affected, and relevant browser-console errors.

Capture safe diagnostics: endpoint, method, status, request ID when available, module, safe user ID, timestamp, deployment version, and sanitized backend error. Never log passwords, access/refresh tokens, private reporter identity, secrets, or API keys.

Maintain an engineering ledger for long tasks: completed, currently fixing, discovered issue, blocked, needs verification, and intentionally deferred. On “كمل”, continue from the latest verified state instead of restarting. On “صلحه”, inspect, find root cause, implement the smallest reliable fix, and verify dependents. Treat screenshots as symptom evidence only and trace them to route → component → API → backend.

## Required engineering report

For implementation or debugging, report concisely:

1. **Problem**
2. **Root cause**
3. **Files/areas affected**
4. **Fix**
5. **Verification performed and remaining verification**
6. **Next unresolved issue**

A feature is done only when UI, route, API, database, Auth/RLS, persistence, loading/error/empty states, related modules, mobile, required printing/export, TypeScript/build, deployment, and production behavior are verified. When frontend, GitHub, Vercel, and Supabase disagree, identify the source of truth before making destructive changes.
