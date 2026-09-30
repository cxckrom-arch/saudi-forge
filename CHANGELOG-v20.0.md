# CHANGELOG v20.0

## Added
- Architecture drift scanner.
- Breaking-change forecasting for target files.
- Database/API/UI migration compatibility matrix.
- Expand-migrate-contract planning.
- Migration preflight gate.
- Evidence-oriented repair proposals.
- Schema compatibility gate for destructive/tightening SQL patterns.
- API compatibility heuristic gate.
- Guarded migration package-script execution contract (dry-run default, explicit approval required).
- Post-migration verification.
- Rollforward/rollback planning anchored to Git state.
- Self-healing/migration status aggregation.

## Verification
- v20 tool names are unique.
- TypeScript check shows no v20-local errors after filtering the already-known missing external dependencies (`@modelcontextprotocol/*`, `zod`, Node typings).
