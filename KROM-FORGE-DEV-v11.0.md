# KROM FORGE DEV v11.0 — Autonomous Delivery & Reliability Platform

v11.0 extends the v10 Software Factory with production delivery and reliability controls.

## New capabilities
- Observability Center: detects telemetry/logging instrumentation and defines safe signal requirements.
- Failure Replay: creates deterministic incident reproduction plans with privacy constraints.
- Resilience Lab: plans bounded failure experiments for local/staging environments.
- Contract Test Planner: prepares frontend/backend API contract verification.
- Feature Flag Manager: stores explicit rollout metadata without silently changing application behavior.
- Deployment Strategy: rolling, canary, or blue-green rollout planning.
- Rollback Automation Plan: anchors rollback planning to the current Git commit and avoids destructive DB rollback.
- SLO Release Gate: evaluates supplied availability, latency, and error-rate measurements.
- Dependency Risk Monitor: checks reproducibility/pinning risks without inventing vulnerability claims.
- Data Integrity Guard: scans SQL migrations for destructive patterns.
- Production Readiness Review: aggregates v10 factory, project health, release, observability, dependency, data-integrity, and SLO evidence.

## Recommended flow
Spec -> Architecture -> Build -> Verify -> Reliability Review -> Deployment Strategy -> SLO Gate -> Production Readiness -> Controlled Deployment.

Production mutations are not performed automatically by these v11 planning/gating tools.
