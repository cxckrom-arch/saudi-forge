# KSA FORGE v42.0.0

## Release objective

V42 moves operational provider logic out of the monolithic server while preserving existing MCP and IDE behavior.

## Changes

- Extracted provider upsert, profile listing, health checks, model discovery, model selection, and provider fetch behavior to `src/provider-service.ts`.
- Continued using `src/provider-store.ts` for provider profile persistence, credential-header filtering, normalization, and model URL helpers.
- Kept existing provider routing/orchestration contracts compatible.
- Added V42 MCP automation aliases while retaining V41 through V36 aliases.
- Bumped package, lockfile, KROM config and centralized release identity to 42.0.0.
- Renamed CI workflow to `V42 Verify`.
- Integration evidence now writes to `reports/v42-integration.json`.

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

`server.ts` still contains provider routing policy, adaptive model intelligence, MCP tool groups, and large UI-generation blocks. These are the next extraction targets.
