# KSA FORGE v40.0.0

## Release objective

V40 continues safe modularization of the HTTP surface while preserving MCP and IDE behavior.

## Changes

- Extracted Developer Platform routes to `src/developer-routes.ts`.
- Extracted Workspace/File/History/Chat routes to `src/workspace-routes.ts`.
- Retained previously extracted AI Control, Automation HTTP, Automation MCP, network, project context, package runner, runtime, and release modules.
- Added V40 MCP automation aliases while retaining V39, V38, V37 and V36 aliases.
- Bumped package, lockfile, KROM config and centralized release identity to 40.0.0.
- Renamed CI workflow to `V40 Verify`.
- Integration evidence now writes to `reports/v40-integration.json`.

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
- backward compatibility aliases PASS

## Remaining technical debt

`server.ts` remains large because provider logic, diagnostics, tool registrations, and UI generation are still embedded. Further decomposition should target provider services, diagnostics, and MCP tool groups.
