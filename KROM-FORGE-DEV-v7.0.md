# KROM FORGE DEV v7.0 — Visual IDE + AI Workspace

v7.0 adds a browser-based Visual IDE shell on top of the existing MCP engineering runtime.

## New workspace
- Open `/ide` on the local KROM server.
- Explorer, Problems, Tasks, Git, Preview metadata and Execution Stream are shown from real project state.
- The browser shell is intentionally read-only for code mutation; edits remain behind MCP tools and safety gates.

## New MCP tools
- `visual_ide_workspace_v7`
- `panel_layout_v7`
- `problems_panel_v7`
- `agent_model_selector_v7`
- `preview_session_v7`
- `git_panel_v7`
- `task_board_panel_v7`
- `command_palette_v7`
- `ui_theme_v7`
- `workspace_snapshot_v7`
- `visual_ide_gate_v7`

## Runtime flow
Prompt → Smart Context → Council → Preflight → Autopilot → IDE Workspace → Diagnostics → Preview/Browser → Visual Review → Repair → Release Gates.

## Safety/accuracy rules
- The Visual IDE does not claim model/provider availability unless the connected runtime verifies it.
- Preview configuration is metadata until Live Browser Vision actually verifies the URL.
- Browser UI never bypasses MCP permission, diagnostics, preflight, regression or release gates.
- Problems are parsed from real typecheck/lint output; unparsed output is not represented as clean proof.
