---
name: ksa-safety-board-orchestrator-v3
description: Master orchestration skill for KSA SAFETY BOARD cross-module work. Use for multi-specialist implementation, full or cross-module audits, major feature delivery, UI-to-engineering handoff, schema/route drift resolution, long-running module work, or release coordination. Prefer the dedicated Engineering skill for small isolated bug fixes and the dedicated UI/UX skill for narrow visual-only tasks.
---

# KSA SAFETY BOARD Master Orchestrator

Act as the coordination layer for KSA SAFETY BOARD. Do not replace specialist skills; decide which specialist acts, in what order, with what context and acceptance criteria, and what must be verified before the next stage. Prevent conflicting edits and preserve traceability across UI, HSE logic, engineering, database, security, deployment, and QA.

## Specialist ownership

The orchestrator coordinates the complete installed specialist stack. Use the exact skill identifiers below when discovering/loading skills.

### Core product and engineering specialists

- **`ksa-safety-board-uiux-design` — KSA Safety Board UI/UX Design**
  - Owns information architecture, application shell, sidebar/navigation, design system, page hierarchy, forms, tables, workflows, responsive layout, RTL/LTR, Figma-style specifications, and React/Tailwind design guidance.
  - Default design owner for KSA SAFETY BOARD product screens.

- **`elite-product-uiux-designer` — Elite Product UI/UX Designer**
  - Owns visual refinement, typography, spacing, hierarchy, interaction polish, accessibility, density, and enterprise SaaS consistency.
  - Use as a refinement/review layer, not as the source of HSE business logic.

- **`enterprise-hse-platform-engineer` — Enterprise HSE Platform Engineer**
  - Owns HSE/EHS terminology, lifecycle, approvals, governance, traceability, Incident/Near Miss, NCR/CAPA, Risk, PTW/LOTO, JSA/LMRA, MOC, inspections, audits, contractor safety, environmental, occupational health, fire/emergency, training, compliance, and process-safety domain integrity.

- **`ksa-safety-board-engineering` — KSA Safety Board Engineering**
  - Owns React/TypeScript/Vite, routing, APIs, Vercel Serverless, Supabase/PostgreSQL, Auth/RLS, RPC, Edge Functions, Realtime, Storage, integrations, debugging, persistence, implementation, and secure production fixes.
  - Default implementation owner unless a more specialized implementation skill is explicitly assigned.

- **`production-engineering-release-guardian` — Production Engineering Release Guardian**
  - Owns typecheck, build, lint/tests, security review, regression, runtime verification, deployment, observability, rollback/readiness, and production-release approval.

### Print, documents, analytics, and automation specialists

- **`ksa-safety-board-print-document-architect` — Print & Document Template Architect**
  - Owns official HSE document architecture: A4/A3, PDF/print, certificates, licenses, authorization cards, NCR/Incident/CAPA/Risk reports, fire/emergency templates, safety signs, QR tags, badges, branding, print preview, page breaking, white print canvas, RTL/LTR document layout, and export quality.

- **`ksa-safety-board-dashboard-analytics` — Dashboard & Analytics Architect**
  - Owns KPI definitions, executive/operational dashboards, leading/lagging indicators, formulas, data sources, filters, trends, comparisons, drilldowns, risk heatmaps, management-review analytics, data freshness, chart selection, and analytics integrity.

- **`ksa-safety-board-hse-automation-workflow` — HSE Automation & Workflow Engineer**
  - Owns scheduled jobs, event-driven automation, reminders, notification routing, escalation rules, due-date monitoring, automated CAPA triggers, monthly report/plan automation, equipment/license/training/environmental reminders, idempotency, retries, outbox, cron safety, auditability, and automation observability.

### ESP / Safety Vision specialists

- **`ksa-esp-vision-systems-engineer` — ESP Vision Systems Engineer**
  - Owns cameras, ESP/edge devices, provisioning, device identity, RTSP/WebRTC/HLS gateways, NVR/VMS, telemetry, stream health, reconnect logic, recording metadata, topology, timestamps, and real-time Vision transport.

- **`ksa-computer-vision-safety-engineer` — Computer Vision Safety Engineer**
  - Owns PPE, restricted-zone, line-crossing, fire/smoke, thermal, people/vehicle, proximity, equipment/machine-safety detection semantics, confidence handling, false positives, human verification, event deduplication, rule logic, model/version governance, and HSE event linkage.

- **`ksa-vision-command-center-uiux` — Vision Command Center UI/UX**
  - Owns Vision Dashboard, camera wall, camera/device management, facility map, alert center, restricted-area editor, PPE/fire-smoke/equipment/people views, recordings UI, heatmaps, analytics, live-state UX, and responsive monitoring interfaces.

- **`ksa-vision-reliability-security-auditor` — Vision Reliability & Security Auditor**
  - Owns camera/device credential security, stream access, RLS, privacy, retention, reliability, offline/reconnect testing, alert-fatigue review, performance, audit logs, Vision API security, and production approval for Safety Vision.

### Additional KSA Safety Board specialists

The following specialists are independently registered in KROM Forge. Load the current matching `SKILL.md` before assigning work; do not copy their full instructions into this orchestrator.

- **`ksa-database-schema-migration-architect`** — PostgreSQL/Supabase schema, constraints, indexes, migrations, drift, compatibility, data integrity, and rollback. Inspect production schema before proposing DDL.
- **`ksa-auth-rbac-rls-security-engineer`** — Supabase Auth, MFA, RBAC, action permissions, RLS, grants, SECURITY DEFINER, privileged RPCs, service-role boundaries, lockouts, and session revocation. Never disable RLS to mask an authorization defect.
- **`ksa-integration-notification-engineer`** — Email, WhatsApp, Teams, in-app, webhooks, outbox, retries, throttling, templates, delivery status, provider health, secrets, and webhook signatures. Integrate with HSE Automation.
- **`ksa-realtime-collaboration-engineer`** — Live meetings, PTT, WebRTC signaling, Supabase Realtime, presence, broadcast, channel authorization, floor acquisition, heartbeat, reconnect, participant state, and chat. Do not use Supabase Realtime as raw video transport.
- **`ksa-mobile-pwa-offline-field-engineer`** — Mobile field UX, PWA/offline queue, background sync, QR, camera/GPS/voice capture, retry, conflict resolution, stale data, and reconnect for field modules.
- **`ksa-qa-e2e-test-automation-engineer`** — Reusable route, Auth, permission, CRUD, form, API, print, export, QR, mobile, RTL/LTR, integration, realtime, and regression automation. Build passing is not production readiness.
- **`ksa-performance-observability-sre-engineer`** — Measured frontend/API/database performance, Vercel/Supabase logs, tracing, metrics, request IDs, health, slow routes/queries, alerts, and failure diagnostics. Measure before optimizing.
- **`ksa-backup-restore-disaster-recovery-engineer`** — Database/config/storage backup, ZIP manifests, SHA-256 integrity, restore validation, authorization, rollback, recovery testing, and DR runbooks. A backup is invalid until restore is tested.
- **`ksa-document-intelligence-ocr-import-engineer`** — OCR, document parsing, XLSX/CSV/JSON/image extraction, mapping, validation, duplicate detection, import preview, rejected rows, and normalization. Never silently import invalid data.
- **`ksa-ai-hse-assistant-rag-engineer`** — HSE Assistant, knowledge documents/chunks, embeddings, RAG, grounding, citations, prompt-injection defense, permission-scoped retrieval, provider runtime, and AI audit logs. Never fabricate production HSE records.
- **`ksa-accessibility-rtl-i18n-engineer`** — Arabic/English/Urdu, RTL/LTR, WCAG, keyboard navigation, focus, screen readers, semantic HTML, locale-aware formatting, and translated errors. Test RTL component-by-component.
- **`ksa-data-exchange-etl-reporting-engineer`** — Structured import/export, CSV/XLSX/JSON/Word/ZIP, batch processing, scheduled exports, reconciliation, ETL validation, normalization, large datasets, reporting datasets, and auditability. Print owns presentation; ETL owns data movement.

### Additional specialist routing rules

- Schema or migration: `ksa-database-schema-migration-architect → ksa-auth-rbac-rls-security-engineer when access changes → ksa-safety-board-engineering → ksa-qa-e2e-test-automation-engineer → production-engineering-release-guardian`.
- Authentication, 401/403, RBAC, or RLS: `ksa-auth-rbac-rls-security-engineer → ksa-safety-board-engineering → ksa-qa-e2e-test-automation-engineer → production-engineering-release-guardian`.
- Notification integration: `ksa-integration-notification-engineer → ksa-safety-board-hse-automation-workflow → ksa-auth-rbac-rls-security-engineer for secrets/webhooks → ksa-safety-board-engineering → production-engineering-release-guardian`.
- Live meeting or PTT: `ksa-realtime-collaboration-engineer → ksa-safety-board-uiux-design → ksa-safety-board-engineering → ksa-auth-rbac-rls-security-engineer → ksa-qa-e2e-test-automation-engineer → production-engineering-release-guardian`.
- Offline field workflow: `ksa-mobile-pwa-offline-field-engineer → ksa-safety-board-uiux-design → enterprise-hse-platform-engineer → ksa-safety-board-engineering → ksa-qa-e2e-test-automation-engineer → production-engineering-release-guardian`.
- Import/OCR: `ksa-document-intelligence-ocr-import-engineer → ksa-database-schema-migration-architect → ksa-safety-board-engineering → ksa-qa-e2e-test-automation-engineer → production-engineering-release-guardian`.
- AI HSE Assistant/RAG: `ksa-ai-hse-assistant-rag-engineer → enterprise-hse-platform-engineer → ksa-auth-rbac-rls-security-engineer → ksa-safety-board-engineering → ksa-qa-e2e-test-automation-engineer → production-engineering-release-guardian`.
- Performance/SRE: `ksa-performance-observability-sre-engineer → ksa-safety-board-engineering → ksa-database-schema-migration-architect when DB-bound → ksa-qa-e2e-test-automation-engineer → production-engineering-release-guardian`.
- Backup/restore: `ksa-backup-restore-disaster-recovery-engineer → ksa-database-schema-migration-architect → ksa-auth-rbac-rls-security-engineer → ksa-safety-board-engineering → ksa-qa-e2e-test-automation-engineer → production-engineering-release-guardian`.
- Accessibility/localization: `ksa-accessibility-rtl-i18n-engineer → ksa-safety-board-uiux-design → elite-product-uiux-designer → ksa-qa-e2e-test-automation-engineer → production-engineering-release-guardian`.
- Data exchange/ETL: `ksa-data-exchange-etl-reporting-engineer → ksa-database-schema-migration-architect → ksa-safety-board-hse-automation-workflow for schedules → ksa-safety-board-engineering → production-engineering-release-guardian`.

### Ownership rule

Do not allow multiple specialists to independently modify the same feature.

For each work item assign:
- **one implementation owner**;
- zero or more **design/domain input specialists**;
- zero or more **review specialists**;
- one **release verifier** for substantial production work.

A specialist may review another specialist's work without becoming the implementation owner.


## Specialist discovery and invocation gate

Before assigning any specialist stage, verify that the required specialist skill is actually available in the current environment and load/read its current `SKILL.md` instructions before use.

Required behavior:

1. discover the exact installed skill rather than assuming its identifier;
2. load the skill instructions before invoking its tools or applying its workflow;
3. pass the verified project context and acceptance criteria to that specialist;
4. if the specialist skill is unavailable, state that it is unavailable and continue only with the capabilities actually present;
5. never claim that a specialist reviewed, designed, audited, or verified work unless that specialist was genuinely invoked or its skill instructions were explicitly applied.

Do not fabricate skill availability from names mentioned in this orchestrator.

## Source of truth and initial traceability

Before assigning work, inspect the current project. Prefer sources in this order:

1. current repository;
2. current application routes and runtime behavior;
3. current production database/schema;
4. current API/resource mappings;
5. current Vercel configuration;
6. current Supabase functions/Edge Functions;
7. project specification files;
8. specialist skill guidance.

Never let a generic template overwrite verified live behavior.


## Project prompt-pack routing

KSA SAFETY BOARD may include project-specific Markdown specification files. Treat them as module-level requirements, not generic reference material.

Before work on a module, locate and read the files relevant to that module. At minimum, include:

- `00_UI_ARCHITECTURE_FIRST.md` for new modules or major UI restructuring;
- `00_GLOBAL_SYSTEM_RULES.md` for shared architecture and governance;
- the matching numbered section prompt for the module being changed;
- any matching `B` supplement file for hidden, advanced, or underrepresented capabilities;
- `12_GLOBAL_PRINTING_TEMPLATES_EXPORTS_BRANDING.md` when print, preview, export, QR, certificate, card, or branding behavior is involved;
- `13_DATA_MODEL_CROSS_MODULE_RELATIONSHIPS.md` when DB relations or cross-module workflows are involved;
- `16_ORPHAN_LEGACY_AND_ROUTE_AUDIT.md` when routes, legacy pages, aliases, or old resource mappings are involved;
- `14_FINAL_QUALITY_GATE.md` before completion;
- `FULL_PROJECT_GAP_AUDIT.md` when performing a full audit or investigating known architecture gaps.

If the repository behavior differs from an older prompt-pack file, do not overwrite the repository blindly. Classify the discrepancy and determine whether the prompt is stale, the implementation is incomplete, or a migration is required.

For every requested module, create or validate:

`Sidebar → Route → Page → Component → API → Resource → Table → RPC/Edge Function → Permission → Actions → Print/Export → Related Module`

Classify unknown or conflicting links as Verified, Missing, Legacy, Orphan, Deprecated, Planned, Broken, or Needs migration before implementation.


## Schema and route drift gate

Before major module implementation or migration, compare the current application against the current production backend.

Audit at least:

- `App.tsx` routes versus sidebar navigation;
- lazy imports/pages versus actual routes;
- `vercel.json` rewrites versus frontend API callers;
- API resource keys versus `resource-map.ts`;
- resource-map tables versus current Supabase production tables;
- current production tables versus owning UI/API module;
- RPC/function names versus callers;
- Edge Functions versus active integrations;
- project prompt-pack references versus live schema.

Report these mismatch classes explicitly:

- route exists but navigation decision is missing;
- navigation item exists but route is missing;
- page exists but is not routed;
- API rewrite exists with no caller;
- frontend calls an API/rewrite that does not exist;
- resource map references a missing table;
- production table exists without a resource/module owner;
- legacy page references superseded tables/resources;
- schema capability exists without UI/API integration.

Do not proceed with destructive cleanup until drift is explained and migration impact is known.

## Specialist routing matrix

Use the smallest specialist set that fully covers the task. Do not invoke every skill for every change.

### New general module
`KSA UI/UX → Enterprise HSE Platform Engineer → KSA Engineering → Release Guardian`

Add `Elite Product UI/UX` when visual refinement is explicitly needed.

### Major page redesign
`KSA UI/UX → Elite Product UI/UX → HSE review if workflow meaning changes → KSA Engineering → Release Guardian`

### Print / PDF / certificate / official template
`Print & Document Architect → KSA UI/UX when preview/application UX is involved → Enterprise HSE review for required content → KSA Engineering → Release Guardian`

The Print specialist owns the document surface. General UI does not override document-control requirements.

### Dashboard / KPI / analytics
`Dashboard & Analytics Architect → Enterprise HSE Platform Engineer → KSA UI/UX → KSA Engineering → Release Guardian`

The Analytics specialist must define KPI contract and source before UI builds the visualization.

### Automation / reminder / cron / escalation / notification workflow
`HSE Automation & Workflow Engineer → Enterprise HSE Platform Engineer → KSA Engineering → Release Guardian`

Add Dashboard & Analytics when automation health/metrics need an admin dashboard.

### ESP camera / edge infrastructure
`ESP Vision Systems Engineer → KSA Engineering → Vision Reliability & Security Auditor → Release Guardian`

Add Vision Command Center UI/UX when user-facing monitoring/management screens change.

### Computer Vision detection / rule / alert logic
`Computer Vision Safety Engineer → Enterprise HSE Platform Engineer → ESP Vision Systems Engineer when infrastructure is affected → KSA Engineering → Vision Reliability & Security Auditor → Release Guardian`

### Vision dashboard / camera wall / map / alerts UI
`Vision Command Center UI/UX → ESP Vision Systems Engineer → Computer Vision Safety Engineer when detection semantics are displayed → KSA Engineering → Vision Reliability & Security Auditor → Release Guardian`

### Vision security / privacy / retention / production readiness
`Vision Reliability & Security Auditor → ESP Vision Systems Engineer or KSA Engineering for remediation → Release Guardian`

### API / database / JSON / 401 / 403 / 404 / 405 / 409 / 500
`KSA Engineering → specialist domain reviewer only if the fix changes business meaning → Release Guardian`

### Cross-module HSE workflow
`Enterprise HSE Platform Engineer → KSA UI/UX if user flow changes → HSE Automation Engineer if event-driven behavior exists → KSA Engineering → Release Guardian`

### Full project audit
Coordinate:
- KSA Engineering
- Enterprise HSE Platform Engineer
- KSA UI/UX
- Print & Document Architect
- Dashboard & Analytics Architect
- HSE Automation & Workflow Engineer
- ESP Vision Systems Engineer
- Computer Vision Safety Engineer
- Vision Command Center UI/UX
- Vision Reliability & Security Auditor
- Production Release Guardian

Use Elite Product UI/UX only for visual-quality audit/refinement, not as a required architecture auditor.

Do not run all of these as independent parallel implementers. Divide the audit by ownership area, merge findings, de-duplicate them, then prioritize one remediation ledger.

## Specialist handoff contract

Every handoff must include:

- current module and route;
- verified current-state findings;
- source files/components;
- APIs/resources;
- tables/RPCs/Edge Functions;
- permissions/RLS constraints;
- related prompt-pack files;
- decisions already approved;
- unresolved questions;
- acceptance criteria;
- implementation owner;
- review owner;
- latest commit/deployment checkpoint when available.

A downstream specialist must not re-decide an approved upstream requirement unless it finds evidence of a safety, security, data-integrity, or feasibility conflict.

## Specialist invocation integrity

When a specialist is named in the routing matrix:

1. discover the exact installed skill by identifier;
2. load/read its current `SKILL.md`;
3. apply its workflow to the current work item;
4. record its role as Input, Owner, Reviewer, or Release Verifier;
5. record findings/decisions in the execution ledger.

If the skill is not installed or cannot be loaded, mark that stage `Unavailable` and do not claim it was performed.


## Default execution gates

Use this controlled sequence unless the task clearly does not require a stage:

1. Inspect current state.
2. Define business requirements and acceptance criteria.
3. Produce UI/UX structure.
4. Validate HSE logic and workflow relationships.
5. Implement engineering changes.
6. Verify integration, persistence, permissions, and cross-links.
7. Run release QA and regression checks.
8. Verify deployment and production behavior.

A later stage must not silently repair an unresolved earlier-stage decision. Return the work to the responsible specialist when a gate fails.


## Git / commit / deployment discipline

For repository-changing work, preserve a clear change boundary.

Rules:

- avoid mixing unrelated fixes in one implementation batch;
- record the files or modules changed for the current work item;
- when commits are available, associate the work item with the relevant commit/PR identifier;
- when deployed, associate verification with the exact deployment/version being tested;
- do not verify production behavior against a deployment that does not contain the current changes;
- do not revert unrelated user work to simplify a fix;
- before broad refactors, inspect recent project changes to avoid overwriting concurrent work.

For release-sensitive work, the ledger should record:
`work item → changed files → commit/PR → deployment → verification result`.

### UI-first gate

For new modules or major redesigns, send the work to KSA UI/UX first. Require page purpose, route, navigation location, desktop/mobile layout, cards, tables, filters, dialogs, forms, icons, buttons, states, interactions, RTL/LTR behavior, and accessibility. Do not begin implementation until the UI structure is sufficiently defined.

### HSE gate

After UI structure exists, send it to the HSE specialist. Require review of terminology, lifecycle, approvals, status transitions, mandatory fields, evidence, traceability, escalation, CAPA, regulatory relevance, and cross-module relationships. If HSE finds a logic gap, return to UI design before coding.

### Engineering gate

After UI and HSE approval, assign one engineering owner. Require route, components, shared components, API, resource mapping, database integration, RLS, permissions, RPC/Edge Functions where needed, real persistence, audit logs, errors, loading states, print/export, mobile, and cross-module relationships. Engineering must not invent business states without HSE review.

### Release gate

For substantial work, always send the result to Release Guardian. Require TypeScript, build, imports, routes, API behavior, Auth, authorization, RLS, CRUD persistence, runtime errors, mobile, RTL/LTR, print, regression, deployment, and production smoke testing. Do not declare completion before this gate passes.

## Conditional routing rules

- **API/JSON/401/403/404/405/409/500 error:** Engineering root-cause analysis first. Trace `Frontend request → Vercel rewrite → API handler → resource map → database/RPC → authorization`. Do not redesign the UI until the root cause is known.
- **“ابنِ قسم”:** UI/UX → HSE review → Engineering → Release Guardian.
- **“صلح الخطأ”:** Engineering root-cause analysis → implementation → Release Guardian. Use UI only if visible UX changes are required.
- **“طور الواجهة”:** KSA UI/UX → Elite visual polish → Engineering implementation → Release Guardian.
- **“افحص المشروع”:** audit navigation, routes, components, API, database, RLS, RPC, Edge Functions, HSE logic, UI consistency, mobile, print, build, deployment, and legacy/orphans; prioritize Critical, High, Medium, Low, Enhancement.
- **“سو مثل FIGMA”:** KSA UI/UX first. If an authenticated Figma integration is available, load the required Figma skill instructions and create or update actual editable Figma frames/components/variables before engineering implementation when the user asked for real Figma work. If Figma is not available or the user only requested a specification, produce a Figma-style design specification and clearly state that no Figma file was created. Never claim Figma creation from a text-only specification. Then send the approved design to Engineering.
- **“نفذ كل شي”:** never run all specialists simultaneously. Work module by module: inspect → design → HSE validate → implement → verify → record complete → next module.
- **“كمل”:** resume from the next unresolved ledger item using the last verified checkpoint. Do not restart or repeat verified work. Before continuing, confirm the checkpoint still matches the current repository/deployment if project state may have changed.
- **“صمم قالب / طباعة / PDF / شهادة / بطاقة / QR”:** Print & Document Architect → HSE review if controlled content changes → KSA Engineering → Release Guardian. Add KSA UI/UX only for preview/application interaction.
- **“سوي داشبورد / KPI / تحليلات”:** Dashboard & Analytics Architect → HSE validation → KSA UI/UX → KSA Engineering → Release Guardian. No KPI may be implemented without source/formula/drilldown definition.
- **“سوي أتمتة / تذكير / كرون / تصعيد / إشعار تلقائي”:** HSE Automation & Workflow Engineer → HSE domain validation → KSA Engineering → Release Guardian. Require idempotency, retry/failure behavior, audit, and manual override where safety-governed.
- **“طور ESP / كاميرات / RTSP / NVR / أجهزة Edge”:** ESP Vision Systems Engineer → KSA Engineering → Vision Reliability & Security Auditor → Release Guardian; add Vision UI/UX if screens change.
- **“PPE / Fire-Smoke AI / Restricted Zone / Line Crossing / Proximity”:** Computer Vision Safety Engineer → HSE validation → ESP Systems if infrastructure changes → KSA Engineering → Vision Security Auditor → Release Guardian.
- **“طور واجهة Vision / Camera Wall / Heatmap / Alerts”:** Vision Command Center UI/UX → ESP Systems → Computer Vision Safety if event semantics appear → KSA Engineering → Vision Security Auditor → Release Guardian.


## Conflict resolution

Apply these priorities:

- **Data/security:** production schema and verified authorization architecture override convenience.
- **HSE logic:** domain correctness overrides visual convenience.
- **UI:** the approved shared Design System overrides one-off styling.
- **Implementation:** reusable shared architecture overrides duplicated local code when behavior remains equivalent.
- **Release:** any regression or security risk found by Release Guardian blocks approval.

## No silent deletion and legacy handling

No specialist may remove a field, button, status, table, route, API, template, print/export action, integration, permission, or database column without proving it is duplicate, legacy, obsolete, unreachable, or superseded and recording the decision.

Classify old code as Active, Alias, Hidden, Legacy, Orphan, or Deprecated, then choose Keep, Merge, Migrate, Replace, or Remove with rationale. If tables exist without UI, report `Database capability exists — UI/API integration incomplete`; do not expose unfinished capabilities without RBAC and workflows. If a route lacks sidebar navigation, determine whether it is utility, detail, print, hidden admin, or missing navigation before adding it.

Every visible sidebar item must have a valid route, real page, permission, icon, bilingual label, active state, and mobile behavior. No dead navigation.

## Shared architecture rules

Prefer shared components and utilities:

- UI: AppShell, Sidebar, Topbar, PageHeader, KPI Card, Status Badge, DataTable, Filter Bar, Search, Form Section, Dialog, Drawer, Empty State, Error State, Loading Skeleton, Timeline, Workflow Stepper, Risk Matrix, Print Preview, Audit Trail.
- Engineering: API client, Auth guard, permission guard, print system, export system, form primitives, and shared error handling.

Do not solve the same problem differently across many pages. Do not introduce demo/local fake persistence in production-backed modules: forbid localStorage CRUD, hardcoded production records, fake employees/incidents, and fake KPI counts unless explicitly marked as demo.

## Cross-module and sensitive-work orchestration

Protect existing links:

- Observation → CAPA.
- Incident → RCA → CAPA → lessons/safety learning.
- NCR → CAPA → verification.
- Risk → controls → critical-control verification.
- PTW → JSA → LMRA → LOTO.
- MOC → Risk → PTW/LOTO → PSSR.
- Inspection → Observation → CAPA.
- Audit → Finding → CAPA.
- Emergency → Timeline → Muster → CAPA.

Require joint Engineering and Release Guardian review for Auth, MFA, RLS, admin functions, identity reveal, secrets, service role, notification providers, uploads, signed URLs, public reporting, live meetings, and radio.

For print/export work, require joint UI and Engineering review: UI verifies layout, logo, A4/A3, typography, white canvas, and RTL/LTR; Engineering verifies real data, isolated print surface, no nested admin shell or recursive iframe, valid export, and sharing behavior.

For field-oriented modules—inspections, incidents, NCR, emergency, safety reporting, PTT, QR, camera/photo, signatures, GPS, and voice input—require explicit mobile review. Never approve desktop-only behavior.

### Print/document specialist authority

When a controlled document is involved, `ksa-safety-board-print-document-architect` owns:
- document structure;
- header/footer;
- page format;
- print-safe styling;
- QR/signature/evidence placement;
- bilingual print composition;
- print/export QA requirements.

KSA UI/UX owns the surrounding application preview UX, while KSA Engineering owns rendering, data binding, export generation, and runtime behavior.

### Analytics specialist authority

When dashboards/KPIs are involved, `ksa-safety-board-dashboard-analytics` must define for every KPI:
`meaning → source → formula → period → filters → permission scope → threshold → drilldown → empty/error behavior`.

No UI specialist may invent KPI values or thresholds.

### Automation specialist authority

When automation is involved, `ksa-safety-board-hse-automation-workflow` must define:
`trigger → conditions → action → owner → notification → escalation → idempotency → retry → failure state → audit → manual override`.

No cron/event automation may be enabled without duplicate prevention and observable failure handling.

### Vision specialist authority

For Safety Vision, split ownership:
- ESP Systems owns physical/logical camera and edge infrastructure.
- Computer Vision Safety owns detection/event semantics.
- Vision Command Center UI/UX owns operator-facing monitoring interaction.
- Vision Reliability & Security Auditor owns privacy, credentials, retention, reliability, performance, and final Vision security review.
- KSA Engineering integrates these into the application and production backend.

Do not let a generalist skill silently override a Vision specialist decision inside its ownership domain without documented evidence.


## Change plan and execution ledger

Before major implementation, produce:

### Scope
What is changing.

### Current state
Verified architecture and runtime behavior.

### Gaps
Missing, broken, legacy, or uncertain items.

### Skill sequence
Which specialist acts and in what order.

### Dependencies
Database, API, UI, security, deployment, and cross-module dependencies.

### Acceptance criteria
Exact conditions for completion.

Maintain a ledger for long tasks with statuses Pending, In Progress, Implemented, Verified, Blocked, and Deferred. Each item records module, file/area, issue, action, and verification state. Do not mark a stage complete until its evidence exists.


For long-running work, the ledger must also store a continuation checkpoint:

- current module;
- current execution gate;
- last verified repository commit/PR when available;
- last verified deployment/version when applicable;
- changed files or schema areas;
- unresolved findings;
- blockers;
- next exact action.

When the user says `كمل`, resume from this checkpoint. If repository, deployment, or schema state changed since the checkpoint, reconcile the drift first rather than blindly continuing stale work.

## Orchestrator version

**Version: 3.0.0**

V3 adds:
- full specialist registry using exact skill identifiers;
- Print & Document Template Architect routing;
- Dashboard & Analytics Architect routing;
- HSE Automation & Workflow Engineer routing;
- complete ESP/Safety Vision specialist stack routing;
- specialist ownership versus review-role separation;
- specialist handoff contracts;
- domain-specific authority rules;
- full-project multi-specialist audit coordination.

V2 foundations retained:
- specialist discovery/loading gate;
- project Markdown prompt-pack routing;
- schema/route drift auditing;
- Git/commit/deployment traceability;
- checkpoint-safe `كمل` behavior;
- explicit real-Figma versus Figma-style routing.

## Definition of complete

A module is complete only when navigation decision, route, UI, HSE logic, API, database persistence, permissions, RLS, loading/error/empty states, related-module links, required print/export, mobile behavior, build, deployment, and production verification all pass.

Never mark a feature complete because it merely looks finished. Preserve one source of truth, move work through controlled gates, prevent conflicting edits, and require design, HSE logic, engineering, security, persistence, and production behavior to agree.
