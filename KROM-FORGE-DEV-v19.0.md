# KROM FORGE DEV v19.0 — Autonomous Refactoring & Dependency Intelligence

v19 adds dependency-aware structural change controls on top of the verified executor.

## New capabilities
- dependency hotspot graph and blast-radius risk
- staged refactor planning
- dead-code candidate audit (non-destructive)
- duplicate-logic heuristic audit
- dependency upgrade/risk planning without automatic version changes
- safe checkpoint evidence
- apply guard for high-impact targets
- impacted regression planning
- post-refactor verification
- non-destructive rollback planning

State is stored under `.krom/v19-refactoring/`.

All destructive actions remain outside these analysis tools. Deletion, package version upgrades, and destructive Git resets are not performed automatically.
