# KROM Forge — Skills Integration and Defect Fixes

## Registered specialist skills

KROM Forge now registers **12 tested core skills plus 12 additional independent KSA Safety Board specialists**. The additional pack owns database migrations, Auth/RBAC/RLS, notifications, realtime collaboration, offline field workflows, QA/E2E automation, performance/SRE, backup/DR, OCR/import, AI HSE/RAG, accessibility/RTL/i18n, and ETL/data exchange.

The Master Orchestrator stores only routing metadata—responsibility, trigger, implementation owner, review role, dependencies, and handoff requirements—and loads the selected specialist's current `SKILL.md` when needed. The duplicate legacy orchestrator and separate computer-vision specialist remain optional and are not registered in this pack.

The MCP tools are:

- `skills_registry_v50` — returns the 24 registered identities and classes.
- `skills_for_task_v50` — selects the minimum task route while retaining engineering, orchestration, and release baselines.
- `skill_route_v50` — returns ownership, dependencies, review role, and handoff requirements.
- `skills_compliance_gate_v50` — rejects missing, duplicate, or unknown registered skill IDs.

## Fixed defects

- Direct MCP and IDE reads of `.krom-secrets`, non-example `.env` files, and private-key extensions are blocked.
- Existing symlink/junction components are rejected by project path resolution.
- Repeated Undo now walks backward through active edit history instead of applying the same edit twice.
- Release Center blocks failed package checks even when stderr has no parseable diagnostic lines.
- Legacy provider routing returns `NO_PROVIDER` when health is required and no provider is healthy.
- Developer Platform Gate requires a live healthy provider, not merely an enabled profile.
- Full audit has a reproducible `npm run test:full-audit` command and now asserts the 24-skill registry, duplicate rejection, specialist routing, and the original security/release probes.
