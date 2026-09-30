# KSA FORGE v41.0.0

## Release objective

V41 continues decomposition of diagnostics and AI provider infrastructure while preserving public MCP/IDE behavior.

## Changes

- Extracted diagnostics parsing and aggregation to `src/diagnostics-service.ts`.
- Extracted provider profile storage, normalization, credential-header filtering, model URL construction, and model extraction to `src/provider-store.ts`.
- Added regression coverage for provider credential boundaries and provider model URLs.
- Retained custom provider support.
- Added V41 MCP automation aliases while retaining V40, V39, V38, V37 and V36 aliases.
- Bumped package, lockfile, KROM config and centralized release identity to 41.0.0.
- Renamed CI workflow to `V41 Verify`.
- Integration evidence now writes to `reports/v41-integration.json`.

## Verification

Release requires:
- clean npm install
- TypeScript PASS
- unit tests PASS
- server startup PASS
- /ide readiness PASS
- MCP integration PASS
- automation flow PASS
- origin rejection PASS
- Git/project scan contract PASS
- provider regression tests PASS
- backward compatibility aliases PASS

## Remaining technical debt

`server.ts` remains large because advanced provider orchestration, diagnostics consumers, MCP tool groups, and large UI-generation sections are still embedded. Future releases can continue extracting these areas incrementally.
