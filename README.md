# KSA FORGE DEV v37

Local-first MCP developer platform with an integrated IDE surface, project inspection tools, automation runtime, model-provider routing, diagnostics, and verification gates.

## Requirements

- Node.js 20 or newer
- npm
- Windows PowerShell for the included bootstrap/start scripts
- Git when Git-aware tools are needed

## Install

```powershell
cd C:\KSA-FORGE
npm ci
```

## Run

```powershell
npm start
```

Default local endpoints:

- IDE: `http://127.0.0.1:3001/ide`
- MCP: `http://127.0.0.1:3001/mcp`

The server binds to loopback by default. `KROM_PUBLIC_HOST` may extend host/origin allowlists, but the listener remains local unless the runtime code is intentionally changed.

## Verification

```powershell
npm run verify
```

This runs TypeScript validation and unit tests.

For a running server:

```powershell
npm run test:integration
```

GitHub Actions also performs a live MCP/IDE integration check on pushes and pull requests to `main`.

## Local configuration

Primary configuration:

- `krom.config.json`
- `.mcp.json`

Local secrets belong under `.krom-secrets/` or environment variables and must never be committed.

Ignored local/generated data includes:

- `node_modules/`
- `.krom-secrets/`
- `.krom-backups/`
- `.krom/automation/`
- generated full-audit output

## Architecture

The V37 modularization has started with:

- `src/project-context.ts` — safe project paths, file walking, package-manager detection, local backup helpers
- `src/package-runner.ts` — shell-free package/script execution
- `src/tool-runtime.ts` — bounded automation runner and persisted execution evidence
- `src/process-command.ts` — executable resolution
- `src/chat-context.ts` — chat context shaping/provider URL helpers

`server.ts` remains the main composition root and is being decomposed incrementally to preserve compatibility.

## Security defaults

- Project file access is constrained to `KROM_PROJECT_ROOT`.
- Symbolic links are skipped by the project walker.
- Local secret directories are excluded from project scans.
- The MCP/IDE server binds to `127.0.0.1` by default.
- Browser host/origin allowlists default to loopback.
- Automation execution uses a tool allowlist and Zod input validation.
- Repository push protection should remain enabled.

## Version

Current release line: **37.0.0**
