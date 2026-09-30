# KSA FORGE v37.0.0

## Release status

Operational release gate: **PASS**

Verified on GitHub Actions with:
- clean `npm ci`
- TypeScript typecheck
- unit tests
- live server startup
- `/ide` readiness probe
- MCP initialization and tool calls
- automation integration flow
- browser-origin rejection check
- Git-aware full project scan
- Node.js 24 CI runtime

## Foundation hardening

- Aligned package, lockfile, KROM config, server identity, IDE title, and runtime banners to 37.0.0.
- Added deterministic `build` and `verify` scripts.
- Added GitHub Actions verification for pushes and pull requests.
- Added a live MCP/IDE integration gate.
- Updated CI to current GitHub Actions and Node.js 24.
- Normalized `.gitignore`.
- Removed tracked `node_modules`, local backups, automation runtime state, and generated full-audit artifacts.
- Replaced the placeholder README with install, run, verification, security, and architecture guidance.

## Architecture

- Extracted project filesystem/security helpers to `src/project-context.ts`.
- Extracted package/process execution to `src/package-runner.ts`.
- Added regression coverage for path traversal and ignored local/secret directories.
- Added V37 MCP automation tool names while retaining V36 aliases for backward compatibility.

## Security

- Local server remains bound to `127.0.0.1` by default.
- Project paths remain constrained to `KROM_PROJECT_ROOT`.
- Symlinks and secret directories are excluded from project walking.
- Automation dispatch remains allowlisted and schema validated.
- Repository spot-check found no common API-key/private-key signatures in indexed code.
- GitHub push protection should remain enabled.

## Known non-blocking technical debt

- `server.ts` remains a large composition root and should continue to be decomposed in later releases.
- GitHub's native secret-scanning dashboard must be reviewed directly in GitHub for complete provider-side secret-scan evidence.
