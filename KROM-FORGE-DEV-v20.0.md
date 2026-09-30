# KROM FORGE DEV v20.0 — Self-Healing Architecture & Migration Engine

v20 extends the verified/refactoring stack with architecture drift detection and guarded migration workflows.

## New MCP tools

1. `architecture_drift_scan_v20`
2. `breaking_change_forecast_v20`
3. `migration_compatibility_matrix_v20`
4. `safe_migration_plan_v20`
5. `migration_preflight_gate_v20`
6. `repair_proposal_engine_v20`
7. `schema_compatibility_gate_v20`
8. `api_compatibility_gate_v20`
9. `migration_execution_contract_v20`
10. `post_migration_verify_v20`
11. `rollforward_rollback_plan_v20`
12. `self_healing_status_v20`

## Safety model

- Destructive database rollback is never automatic.
- Migration execution is dry-run by default.
- Only package.json scripts explicitly related to migration/schema/database are eligible for execution.
- Explicit approval is required for non-dry-run migration execution.
- High-risk migrations can be blocked when checkpoint/isolation requirements are missing.
- Verification requires schema/API gates, type checking/tests when configured, and `git diff --check`.

## State

Artifacts are stored in `.krom/v20-self-healing/`.

## Recommended flow

Architecture Drift → Breaking Change Forecast → Compatibility Matrix → Safe Migration Plan → Preflight Gate → Checkpoint → Execution Contract → Post-Migration Verify → Verified Executor Receipt → Release Gate.
