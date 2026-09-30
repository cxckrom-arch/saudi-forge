# KSA FORGE v37.0.0

## Foundation hardening

- Aligned package and KROM configuration versions to 37.0.0.
- Added deterministic `build` and `verify` scripts.
- Normalized `.gitignore` for dependencies, secrets, local runtime state, backups, and generated audit output.
- Removed tracked `node_modules`, local backups, automation runtime state, and generated full-audit artifacts from the repository.
- Preserved MCP, IDE, runtime, agents, tests, and release evidence.

## Next engineering work

- Decompose the monolithic `server.ts` into bounded MCP, API, provider, IDE, security, and runtime modules.
- Add release-gate CI around typecheck, unit tests, and integration tests.
- Expand security regression tests for filesystem boundaries, origins, provider credentials, and MCP tool authorization.
