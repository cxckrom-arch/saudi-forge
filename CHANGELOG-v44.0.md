# KSA FORGE v44.0.0

## Release objective

V44 extracts provider secret management from the monolithic server while preserving existing MCP, IDE, and provider behavior.

## Changes

- Added `src/secret-manager.ts` for provider secret-file location, environment loading, persistence, validation, credential updates, provider testing, toggling, and default-model actions.
- Moved secret initialization to occur after the secret manager is created, eliminating block-scope initialization hazards.
- Added regression tests for invalid secret names, minimum secret length, CR/LF stripping, environment assignment, and persisted file format.
- Added V44 MCP automation aliases while retaining V43 through V36 aliases.
- Bumped package, lockfile, KROM config, runtime identity, CI workflow, and integration evidence to 44.0.0.

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
- secret-manager regression tests PASS
- backward compatibility aliases PASS

## Remaining technical debt

`server.ts` still contains AI Control orchestration, large MCP tool-registration groups, and large UI-generation sections. These are the next extraction targets.
