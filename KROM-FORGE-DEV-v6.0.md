# KROM FORGE DEV v6.0 — Developer IDE Core

v6.0 converts the engineering MCP into an IDE-oriented execution layer while preserving all v5.0 product, security, browser, repair, memory, council, predictive and release capabilities.

## New IDE tools

- `lsp_diagnostics_v6` — normalize TypeScript/lint diagnostics into file/line markers.
- `error_markers_v6` — editor-gutter style marker feed.
- `smart_file_explorer_v6` — indexed explorer with hotspots, routes, tests and file sizes.
- `workspace_search_v6` — ranked project search for filenames and source content.
- `diff_editor_v6` — structured per-file git diff with add/remove counts.
- `terminal_manager_v6` — list and execute declared package scripts without arbitrary shell evaluation.
- `plugin_manager_v6` — local KROM plugin metadata registry and enablement state.
- `mcp_manager_v6` — discover MCP configuration signals while redacting secret values.
- `refactor_planner_v6` — blast-radius-aware structural change plan.
- `execution_stream_v6` — Codex-style public execution status without exposing hidden reasoning.
- `ide_workspace_v6` — consolidated workspace model.
- `ide_release_gate_v6` — diagnostics/task pre-release gate before runtime release verification.

## Recommended workflow

`Prompt → Product Blueprint → Smart Context → Code Intelligence → IDE Workspace → Diagnostics → Council/Simulation/Preflight → Autopilot → Error Markers/Diff → Browser/Visual/Security → Repair → IDE Release Gate → Runtime Release Gate`

## Safety rules

The terminal manager executes only package scripts declared by the current project. Plugin Manager stores metadata only and does not download or execute third-party code. MCP Manager redacts environment values. IDE Release Gate does not replace browser, security, database, product-readiness, or deployment verification.
