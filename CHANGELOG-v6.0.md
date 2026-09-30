# v6.0 — Developer IDE Core

## Added
- IDE diagnostics feed and editor error markers.
- Smart file explorer and workspace search.
- Structured diff editor.
- Controlled package-script terminal manager.
- Local plugin registry and MCP discovery manager.
- Refactor planner using code intelligence blast radius.
- Public execution stream for UI rendering.
- Consolidated IDE workspace state.
- Strict IDE release gate.

## Validation
- 102 registered MCP tools, 102 unique tool names.
- v6.0-specific tools: 12.
- TypeScript verification found no new v6.0 symbol/type errors after correction.
- Remaining compiler failures are caused by missing dependencies in the recovered compact package (`@modelcontextprotocol/*`, `zod`, Node typings) plus the pre-existing module/top-level-await configuration.
