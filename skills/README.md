# KROM Forge — Tested KSA Safety Board Skills

This directory defines the **canonical twelve-skill pack tested with KROM Forge**.

- `manifest.json` is the source of truth for identity and count.
- `src/skill-compliance-tools.ts` exposes registry, task selection, and compliance-gate tools through MCP.
- The legacy orchestrator archive and the separate computer-vision specialist remain optional and are not counted in the canonical pack.
- Skill selection always keeps engineering, orchestration, and release/QA baselines even when a task is narrow.

The integration does not execute skill archive content. It validates identity, uniqueness, task relevance, and release-safety coverage before orchestration.
