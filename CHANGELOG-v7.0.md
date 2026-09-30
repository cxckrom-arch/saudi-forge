# v7.0 Visual IDE + AI Workspace

- Added local `/ide` Visual IDE shell.
- Added unified workspace-state endpoint `/ide/api/state`.
- Added 11 new MCP tools for layout, problems, selector, preview, Git, tasks, command palette, themes, snapshots and visual IDE gate.
- Added real project Explorer metadata, diagnostics, Git status and KROM execution stream to the UI.
- Preserved mutation safety by keeping code writes behind MCP tools instead of exposing arbitrary browser write endpoints.
