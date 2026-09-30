# KROM FORGE DEV v8.0 — Full AI Coding Workbench

v8.0 turns the Visual IDE shell into an interactive coding workbench while preserving the existing MCP safety/verification layers.

## New v8 tools

- `workbench_state_v8` — unified Workbench state.
- `editor_open_file_v8` — open a project text file and persist the active tab.
- `editor_save_file_v8` — save with backup + edit history.
- `apply_patch_v8` — deterministic text replacement with backup/history.
- `edit_history_v8` — list, undo, or redo recent edits.
- `editor_problems_v8` — live diagnostics suitable for editor markers.
- `ai_file_context_v8` — persist instructions tied to the active file; it does not pretend to run a model.
- `terminal_script_v8` — run only package.json scripts, not arbitrary shell strings.
- `git_commit_v8` — stage explicitly selected files and commit with an explicit message.
- `workbench_gate_v8` — Workbench-level readiness gate before deeper release gates.

## Visual Workbench

Open:

`http://127.0.0.1:<PORT>/ide`

The Workbench includes:

- Project Explorer
- Multi-tab editor state
- Monaco Editor loaded from jsDelivr when internet access is available
- Plain-text editor fallback when Monaco cannot be loaded
- Save / Undo / Redo
- Problems panel
- Preview iframe
- Execution stream
- AI context panel bound to the current file
- Terminal/output panel

## Safety / integrity rules

- All editor paths are resolved through `safePath`, so files outside `KROM_PROJECT_ROOT` are blocked.
- Saves create backups and edit-history records.
- `apply_patch_v8` refuses to apply when the exact search text is absent.
- `terminal_script_v8` only runs declared package.json scripts.
- `git_commit_v8` requires explicit files and a commit message; it does not stage the entire repository implicitly.
- v8 does not replace Product, Security, Browser, Regression, or Release Gates.
