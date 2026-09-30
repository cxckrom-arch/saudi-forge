# KSA FORGE v38.0.0

## Release objective

V38 continues the safe decomposition of the original monolithic server while preserving MCP and IDE behavior.

## Changes

- Centralized release identity in `src/release-info.ts`.
- Extracted MCP automation registration to `src/automation-tools.ts`.
- Added `connected_tools_v38`, `automation_status_v38`, `automation_save_v38`, `automation_run_v38`, and `automation_cancel_v38`.
- Retained V37 and V36 aliases for backward compatibility.
- Extracted loopback-first host/origin policy to `src/network-policy.ts`.
- Added regression coverage for local network policy.
- Continued using `src/project-context.ts` and `src/package-runner.ts` for filesystem and process boundaries.
- Bumped package, lockfile, KROM config, runtime server identity, and documentation to 38.0.0.

## Verification gate

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
