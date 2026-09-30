# KSA FORGE v45.0.0

## Release objective

V45 extracts AI Control orchestration from the monolithic server while preserving existing MCP, IDE, provider, and routing behavior.

## Changes

- Added `src/ai-control-service.ts` for AI control status, provider enable/priority updates, quick model selection, route previews, and runtime banner audits.
- Continued using `src/secret-manager.ts`, `src/provider-service.ts`, `src/provider-routing.ts`, and `src/adaptive-model-service.ts` as lower-level provider layers.
- Added V45 MCP automation aliases while retaining V44 through V36 aliases.
- Bumped package, lockfile, KROM config, runtime identity, CI workflow, and integration evidence to 45.0.0.

## Verification

Release requires clean install, TypeScript PASS, unit tests PASS, live server startup, IDE readiness, MCP integration, automation flow, origin rejection, Git/project scan contract, provider/secret regressions, and backward compatibility aliases.

## Remaining technical debt

The largest remaining blocks in `server.ts` are MCP tool-registration groups and legacy UI-generation sections.

## Post-release hardening

- Centralized AI Control release identity on `APP_VERSION` / `APP_DISPLAY_VERSION`.
- Removed stale visible IDE banners from legacy UI generators.
- Changed runtime banner audit to inspect visible UI banners instead of historical comments.
- Separated workspace `version` (release) from `schemaVersion` (internal state contract).
- Updated provider and secret-management API responses to expose the current release while preserving module schema versions.
- Prevented adaptive route metadata from overriding the current release version.
- Added regression coverage for release consistency, workspace version contracts, visible legacy banners, provider/secret version contracts, and route-preview version precedence.

- Refactored MCP registration architecture so `server.ts` contains zero direct `server.registerTool(...)` declarations.
- Extracted v16–v20 (54 tools), v21–v25 (63 tools), and v26–v31 (64 tools) into dedicated registration modules with catalog regression guards.
- Added a composition-root regression gate that prevents future inline MCP tool registration drift.
