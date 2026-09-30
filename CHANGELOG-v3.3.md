# CHANGELOG — KROM FORGE DEV v3.3

## Added
- Smart Code Intelligence graph
- Import/dependent mapping
- Symbol/export discovery
- Route impact hints
- `code_intelligence_scan`
- `impact_analysis`
- `symbol_intelligence`
- `regression_scope`
- CODE INTELLIGENCE AGENT
- persisted `.krom/code-intelligence.json`

## Integration
v3.3 sits before edits and after edits:

`Prompt -> Precision Contract -> Code Intelligence -> Impact Analysis -> Edit -> Regression Scope -> Tests/Browser -> Repair Loop -> Release Gate`

## Verification
TypeScript validation found no new implementation/type errors after the v3.3 changes. The recovered package still lacks original dependencies such as MCP SDK, Zod, and Node typings, so full project compilation cannot be completed from this reduced archive alone.
