# KROM FORGE DEV v3.9 — Predictive Engineering & Change Simulation

v3.9 adds a pre-change engineering layer that forecasts likely blast radius and regression risk before files are modified.

## New MCP tools

### `change_simulation`
Builds a predictive change model from the Code Intelligence dependency graph and Smart Context. It resolves target files, dependencies, dependents, affected routes, data/config files, unresolved imports, verification steps, and rollback requirements.

### `risk_forecast`
Scores likely regression categories: dependency regression, routing/UI regression, data/security regression, build/config regression, and unknown-import risk.

### `preflight_gate`
Blocks editing when target resolution, rollback checkpoint, verification coverage, or high-risk data/config safeguards are insufficient.

### `change_plan`
Turns the simulation into staged implementation phases with targeted verification after each stage.

### `preflight_status`
Shows the latest simulation and recent preflight decisions for auditability and resume workflows.

## Autopilot integration
`engineering_autopilot_start` now creates a checkpoint, council session, smart context, strategy, change simulation, and preflight assessment before returning executable task-graph nodes.

If the preflight gate is blocked, no READY execution nodes are returned.

## Persistent state
- `.krom/change-simulation.json`
- `.krom/preflight-history.json`

## Safety rule
If implementation touches files outside the simulated affected scope, rerun `change_simulation` before continuing.
