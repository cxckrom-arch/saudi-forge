# KSA FORGE v39.0.0

## Release objective

V39 continues decomposition of the original monolithic server without changing public MCP/IDE behavior.

## Changes

- Extracted AI Control HTTP routes to `src/ai-control-routes.ts`.
- Extracted Automation/Tool HTTP routes to `src/automation-http-routes.ts`.
- Fixed the IDE brand badge to use centralized release identity instead of stale `v36`.
- Added V39 MCP automation aliases while retaining V38, V37 and V36 aliases.
- Bumped package, lockfile, KROM config and centralized release identity to 39.0.0.
- Renamed CI workflow to `V39 Verify`.
- Integration evidence now writes to `reports/v39-integration.json`.

## Verification

V39 release requires:
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

`server.ts` remains the main composition root and still contains legacy provider/business logic and large UI-generation sections. Further extraction can continue in V40 without blocking V39 operation.
