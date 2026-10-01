# KROM Forge — Skills Integration and Defect Fixes

## Canonical tested skills

KROM Forge now registers the exact twelve KSA Safety Board skills as a canonical pack. The duplicate legacy orchestrator and the separate computer-vision specialist are explicitly optional and are not counted as part of the tested twelve.

The MCP tools are:

- `skills_registry_v50`
- `skills_for_task_v50`
- `skills_compliance_gate_v50`

## Fixed defects

- Direct MCP and IDE reads of `.krom-secrets`, non-example `.env` files, and private-key extensions are blocked.
- Existing symlink/junction components are rejected by project path resolution.
- Repeated Undo now walks backward through active edit history instead of applying the same edit twice.
- Release Center blocks failed package checks even when stderr has no parseable diagnostic lines.
- Legacy provider routing returns `NO_PROVIDER` when health is required and no provider is healthy.
- Developer Platform Gate requires a live healthy provider, not merely an enabled profile.
- Full audit has a reproducible `npm run test:full-audit` command and asserts the secure behavior.
