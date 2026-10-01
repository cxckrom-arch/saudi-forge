# KROM Forge — KSA Safety Board Specialist Skills

This directory defines the KROM Forge specialist pack: **12 tested core skills plus 12 additional independent specialists** from the KSA Safety Board expansion.

- `manifest.json` is the source of truth for identity, class, and counts.
- `src/skill-compliance-tools.ts` exposes registry, task routing, specialist ownership, and compliance-gate tools through MCP.
- The Master Orchestrator stores routing metadata only; it loads the selected specialist's current `SKILL.md` when needed.
- Additional specialists remain modular and do not replace core engineering, orchestration, or release-safety baselines.
- The legacy orchestrator archive and the separate computer-vision specialist remain optional and are not registered in this pack.
- Skill selection always keeps engineering, orchestration, and release/QA baselines even when a task is narrow.

The integration does not execute skill instructions as code. It validates identity, uniqueness, task relevance, owner/reviewer metadata, dependencies, handoff requirements, and release-safety coverage before orchestration.
