# KSA FORGE DEV v47

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
- `src/automation-tools.ts` — versioned MCP automation registration with legacy aliases
- `src/automation-http-routes.ts` — automation/tool HTTP routes
- `src/ai-control-routes.ts` — AI provider/control HTTP routes
- `src/developer-routes.ts` — developer status/chat/scan/preview routes
- `src/workspace-routes.ts` — workspace state, file, history, and chat routes
- `src/diagnostics-service.ts` — typecheck/lint diagnostics aggregation
- `src/provider-store.ts` — provider profile storage, credential headers, and model discovery helpers
- `src/provider-service.ts` — provider upsert, health, discovery, and model selection operations
- `src/provider-routing.ts` — routing policy, task classification, health-aware provider selection, and fallback plan
- `src/adaptive-model-service.ts` — benchmark history, reliability scoring, smart routing, fallback chains, and route explainability
- `src/secret-manager.ts` — local provider secret loading, persistence, validation, provider credential actions, and secret-file isolation
- `src/ai-control-service.ts` — AI control status, provider enable/priority control, quick model selection, route preview, and runtime audit
- `src/developer-platform-service.ts` — v35 developer chat, routed provider calls, project scan, preview state, and platform status
- `src/predictive-engineering-service.ts` — v3.9 change simulation, preflight checks, risk forecasting, and predictive engineering state
- `src/learning-memory-service.ts` — v3.6 evidence-backed learning memory, task classification, and confidence scoring
- `src/code-intelligence-service.ts` — v3.3 source graph, dependency reach, symbol/import analysis, and impact risk
- `src/smart-context-service.ts` — v3.4 bounded project context selection and execution-strategy decisions
- `src/repair-service.ts` — v3.2 repair-cycle state, findings, fingerprints, and likely-source localization
- `src/developer-platform-ui.ts` — isolated developer-platform HTML renderer
- `src/model-control-tools.ts` — v32–v35 MCP registration layer for provider/model/AI/developer tools
- `src/network-policy.ts` — loopback-first host/origin policy
- `src/release-info.ts` — centralized release identity
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

## V46 reliability upgrade

Developer chat now uses bounded smart failover. The highest-ranked healthy provider is tried first; on request failure, KSA Forge can move through up to two additional healthy routed candidates. Attempt metadata is retained for diagnostics without persisting credentials.

## V47 provider resilience

Developer chat now includes a per-provider circuit breaker on top of V46 Smart Failover. Two consecutive request failures temporarily open that provider circuit for 60 seconds, so subsequent requests skip the unhealthy provider and continue through healthy routed alternatives without wasting another request timeout. Circuit state is exposed in Developer Platform status for diagnostics.

## Version

Current release line: **47.0.0**

### Modular MCP registration architecture

V45 hardening removed direct `server.registerTool(...)` declarations from `server.ts`. Tool families are registered through dedicated modules, including core project tools, precision execution, Prompt Studio, visual design, v3.x runtime families, capability expansion, v16–v20, v21–v25, v26–v31, and model-control tools. A regression test fails if inline MCP registrations return to the composition root.

<!-- vercel-redeploy: build-fix-2026-09-30 -->
