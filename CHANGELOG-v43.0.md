# KSA FORGE v43.0.0

## Release objective

V43 extracts provider routing and adaptive model intelligence from the monolithic server while preserving existing MCP and IDE behavior.

## Changes

- Added `src/provider-routing.ts` for routing policy persistence, task classification, health-aware provider selection, fallback planning, and provider status.
- Added `src/adaptive-model-service.ts` for benchmark history, latency scoring, reliability aggregation, smart routing, fallback chains, route explainability, and quality benchmark planning.
- Added deterministic regression coverage for task classification, latency scoring, and provider affinity.
- Added V43 MCP automation aliases while retaining V42 through V36 aliases.
- Bumped package, lockfile, KROM config, runtime identity, CI workflow, and integration evidence to 43.0.0.

## Verification

Release requires:
- clean npm install
- TypeScript PASS
- unit tests PASS
- live server startup PASS
- /ide readiness PASS
- MCP integration PASS
- automation flow PASS
- origin rejection PASS
- Git/project scan contract PASS
- adaptive routing regression tests PASS
- backward compatibility aliases PASS

## Remaining technical debt

`server.ts` still contains AI control orchestration, secret management, large MCP tool-registration groups, and large UI-generation sections. These remain future extraction targets.
