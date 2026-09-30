# KROM FORGE DEV v3.0 — Autonomous UI & Engineering Engine

v3.0 upgrades KROM from a collection of engineering tools into a gated execution system.

## New tools

### master_orchestrator
Creates the multi-agent route for a user prompt and defines the lifecycle from inspection to DONE.

### project_memory
Persists project-local stack, conventions, design rules, architectural decisions, and resolved issues in `.krom/project-memory.json`.

### requirement_traceability
Builds a live matrix from the Precision Execution manifest so every requirement has status and evidence.

### browser_test
Runs an existing browser/E2E npm script such as Playwright or Cypress. It never returns a fake PASS when no runner exists.

### screenshot_visual_inspector
Consumes observations from real screenshots across viewports, scores visual quality, detects critical issues such as overflow/overlap/broken RTL, and sends precise remediation back to the developer.

### release_gate_v3
Runs available build/typecheck/lint/test gates, optional browser gate, and requirement verification. DONE is forbidden when the gate fails.

## Recommended autonomous flow

1. `master_orchestrator`
2. `project_memory` → get
3. `start_precise_execution`
4. inspect/search/read
5. `requirement_traceability`
6. UI Design Director when UI is in scope
7. implementation via write/patch
8. tests/typecheck/build
9. `browser_test` for real flows
10. `screenshot_visual_inspector` using fresh screenshot observations
11. `visual_review`
12. `execution_audit`
13. `release_gate_v3`
14. repeat failed steps until PASS

## Key quality rule
The system must distinguish VERIFIED, FAIL, BLOCKED, and NOT_CONFIGURED. Missing evidence must never be presented as success.
