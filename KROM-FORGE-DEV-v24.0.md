# KROM FORGE DEV v24.0 — Autonomous Knowledge Graph & Change Intelligence

v24 adds a persistent project knowledge graph on top of the architecture, governance, verification, and release layers already present in KROM FORGE DEV.

## New capabilities

1. `knowledge_graph_build_v24` — builds file/import/API/table/symbol/test graph.
2. `semantic_relation_scan_v24` — derives API, data, and test semantic relationships.
3. `hidden_dependency_scan_v24` — identifies high-fanout API/data dependencies.
4. `change_impact_query_v24` — calculates transitive blast radius and likely regression tests.
5. `route_api_data_trace_v24` — traces product surfaces to APIs and database tables.
6. `test_coverage_linker_v24` — links tests to code and flags high-centrality unlinked modules.
7. `knowledge_graph_path_v24` — finds dependency paths between files.
8. `knowledge_context_pack_v24` — builds compact task context from graph centrality and task terms.
9. `change_risk_explain_v24` — explains change risk from impact, centrality, shared dependencies, and tests.
10. `knowledge_graph_refresh_v24` — refreshes the graph after meaningful codebase changes.
11. `knowledge_gate_v24` — blocks very high-risk/high-centrality changes when evidence is insufficient.
12. `knowledge_intelligence_status_v24` — reports graph and gate state.

## State

Artifacts are stored under `.krom/v24-knowledge-graph/`.

## Recommended flow

Prompt → Knowledge Graph → Context Pack → Change Impact → Knowledge Gate → Existing v19-v23 execution/refactor/governance/release pipeline.
