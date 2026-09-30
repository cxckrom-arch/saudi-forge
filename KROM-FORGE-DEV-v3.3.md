# KROM FORGE DEV v3.3 — Smart Code Intelligence

v3.3 adds pre-change code intelligence and regression impact analysis on top of v3.2 Autonomous Repair Loop.

## New tools

### code_intelligence_scan
Builds a real source graph from the current project:
- local imports
- reverse dependents
- symbols and exports
- route hints
- file role classification
- unresolved local imports
- dependency hotspots

The graph is saved to `.krom/code-intelligence.json`.

### impact_analysis
Run this before changing shared files or symbols. It returns:
- direct dependents
- indirect dependents by depth
- upstream dependencies
- affected routes
- related tests
- data/config sensitivity
- LOW / MEDIUM / HIGH risk score
- recommended verification scope

### symbol_intelligence
Finds files declaring/exporting a symbol and shows the direct files that depend on those declarations.

### regression_scope
Uses changed files recorded by Precision Execution and computes the project areas, routes, and tests that should be reverified before release.

## Recommended autonomous flow

1. `master_orchestrator`
2. `start_precise_execution`
3. `code_intelligence_scan`
4. `impact_analysis` before editing shared code
5. implement using `patch_file` / `write_file`
6. `regression_scope`
7. `run_typecheck` / tests / build
8. `live_browser_vision` for UI work
9. `autonomous_repair_begin` when failures remain
10. `autonomous_repair_verify`
11. `release_gate_v31`

## Safety rule

Do not perform a broad rewrite of a high-impact file before reviewing its dependents. High-risk changes should use small reversible patches and verify direct dependents first.
