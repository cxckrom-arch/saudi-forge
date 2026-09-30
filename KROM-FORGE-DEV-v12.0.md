# KROM FORGE DEV v12.0 — MEGA 100 Expansion

v12.0 adds 100 independent engineering capability tools on top of v11.0. Each tool can scan the current project and write a structured report under `.krom/v12-batches/`.

## Mega controls

- `mega_100_status_v12` — reports readiness and how many v12 reports have been generated.
- `mega_100_audit_v12` — runs all 100 capabilities, or selected categories.

## Categories

- **architecture** — 10 capabilities
- **code_quality** — 10 capabilities
- **ui_ux** — 10 capabilities
- **testing** — 10 capabilities
- **api_data** — 10 capabilities
- **security** — 10 capabilities
- **performance** — 10 capabilities
- **devops** — 10 capabilities
- **product** — 10 capabilities
- **ai_agent** — 10 capabilities

## All 100 capabilities

1. `domain_boundary_mapper_v12` — **Domain Boundary Mapper**: Map domain boundaries and cross-domain imports
2. `circular_dependency_radar_v12` — **Circular Dependency Radar**: Identify import patterns that may form circular dependencies
3. `coupling_heatmap_v12` — **Coupling Heatmap**: Rank highly connected source files and shared modules
4. `module_ownership_map_v12` — **Module Ownership Map**: Produce ownership hints for major project modules
5. `route_dependency_map_v12` — **Route Dependency Map**: Map route/page files to their direct dependencies
6. `state_flow_mapper_v12` — **State Flow Mapper**: Inventory state-management patterns and stateful hotspots
7. `event_flow_mapper_v12` — **Event Flow Mapper**: Inventory event handlers, emitters and messaging paths
8. `config_drift_detector_v12` — **Config Drift Detector**: Compare configuration surfaces and detect duplicated settings
9. `architecture_decision_recorder_v12` — **Architecture Decision Recorder**: Generate ADR candidates from project structure and recent decisions
10. `shared_core_guard_v12` — **Shared Core Guard**: Identify central shared files whose changes need stricter impact analysis
11. `duplicate_logic_detector_v12` — **Duplicate Logic Detector**: Find repeated code signatures and duplicated logic candidates
12. `complexity_radar_v12` — **Complexity Radar**: Locate files with dense branching and complexity indicators
13. `function_size_auditor_v12` — **Function Size Auditor**: Flag source files likely to contain oversized functions
14. `naming_consistency_auditor_v12` — **Naming Consistency Auditor**: Review common identifier and file naming consistency
15. `error_handling_auditor_v12` — **Error Handling Auditor**: Review try/catch, error boundaries and user-facing error paths
16. `async_safety_auditor_v12` — **Async Safety Auditor**: Review async/await, promises and cleanup-risk patterns
17. `type_safety_auditor_v12` — **Type Safety Auditor**: Locate weak typing patterns and unsafe casts
18. `null_safety_auditor_v12` — **Null Safety Auditor**: Locate nullability and optional access hotspots
19. `import_hygiene_auditor_v12` — **Import Hygiene Auditor**: Review broad, deep and duplicate import patterns
20. `refactor_opportunity_finder_v12` — **Refactor Opportunity Finder**: Find high-value refactor candidates from size and coupling signals
21. `component_reuse_auditor_v12` — **Component Reuse Auditor**: Identify reusable UI primitives and duplication candidates
22. `design_consistency_auditor_v12` — **Design Consistency Auditor**: Review style-token and utility-class consistency
23. `responsive_layout_auditor_v12` — **Responsive Layout Auditor**: Review responsive breakpoints and overflow-risk patterns
24. `rtl_layout_auditor_v12` — **RTL Layout Auditor**: Review RTL/LTR readiness and directional assumptions
25. `accessibility_surface_auditor_v12` — **Accessibility Surface Auditor**: Review semantic labels, focus and image alt coverage
26. `form_experience_auditor_v12` — **Form Experience Auditor**: Review form validation, labels and submission states
27. `data_table_experience_auditor_v12` — **Data Table Experience Auditor**: Review table density, paging, sorting and responsive handling
28. `loading_state_auditor_v12` — **Loading State Auditor**: Review loading/skeleton/progress coverage
29. `empty_error_state_auditor_v12` — **Empty & Error State Auditor**: Review empty, error and retry user experiences
30. `navigation_experience_auditor_v12` — **Navigation Experience Auditor**: Review sidebar, breadcrumb and route navigation consistency
31. `unit_test_gap_analyzer_v12` — **Unit Test Gap Analyzer**: Compare source surfaces against unit-test presence
32. `integration_test_gap_analyzer_v12` — **Integration Test Gap Analyzer**: Identify integration boundaries lacking explicit tests
33. `e2e_test_gap_analyzer_v12` — **E2E Test Gap Analyzer**: Review critical routes and flows against E2E coverage
34. `flaky_test_risk_auditor_v12` — **Flaky Test Risk Auditor**: Locate timing and nondeterminism patterns in tests
35. `fixture_quality_auditor_v12` — **Fixture Quality Auditor**: Review test fixture organization and reuse
36. `test_data_guard_v12` — **Test Data Guard**: Review test-data isolation and production-data leakage risks
37. `boundary_case_generator_v12` — **Boundary Case Generator**: Generate boundary and negative-case targets from validation surfaces
38. `permission_test_matrix_v12` — **Permission Test Matrix**: Map permission-sensitive surfaces to required tests
39. `regression_matrix_builder_v12` — **Regression Matrix Builder**: Build regression targets from shared modules and changed surfaces
40. `coverage_strategy_planner_v12` — **Coverage Strategy Planner**: Produce a pragmatic unit/integration/E2E coverage plan
41. `api_contract_auditor_v12` — **API Contract Auditor**: Review API request/response and client/server contract surfaces
42. `endpoint_inventory_builder_v12` — **Endpoint Inventory Builder**: Inventory API route and endpoint definitions
43. `input_validation_auditor_v12` — **Input Validation Auditor**: Review server/client validation coverage
44. `auth_boundary_auditor_v12` — **Auth Boundary Auditor**: Review authentication boundaries around sensitive endpoints
45. `rate_limit_readiness_auditor_v12` — **Rate Limit Readiness Auditor**: Review externally exposed endpoints for rate-limit readiness
46. `cache_strategy_auditor_v12` — **Cache Strategy Auditor**: Review cache usage and invalidation signals
47. `query_efficiency_auditor_v12` — **Query Efficiency Auditor**: Review query shapes and unbounded data access
48. `index_readiness_auditor_v12` — **Index Readiness Auditor**: Review schema/migrations for likely indexing needs
49. `migration_safety_auditor_v12` — **Migration Safety Auditor**: Review migrations for destructive or risky operations
50. `rls_policy_auditor_v12` — **RLS Policy Auditor**: Review Supabase/Postgres RLS policy surfaces
51. `secret_exposure_auditor_v12` — **Secret Exposure Auditor**: Locate secret-like assignments without revealing values
52. `xss_surface_auditor_v12` — **XSS Surface Auditor**: Review raw HTML and unsafe rendering surfaces
53. `csrf_readiness_auditor_v12` — **CSRF Readiness Auditor**: Review state-changing web endpoints for CSRF posture
54. `injection_surface_auditor_v12` — **Injection Surface Auditor**: Review dynamic SQL/command construction surfaces
55. `file_upload_security_auditor_v12` — **File Upload Security Auditor**: Review file validation, size and MIME restrictions
56. `authorization_auditor_v12` — **Authorization Auditor**: Review permission checks around sensitive actions
57. `session_security_auditor_v12` — **Session Security Auditor**: Review session/cookie configuration surfaces
58. `cors_headers_auditor_v12` — **CORS & Headers Auditor**: Review CORS and HTTP security header configuration
59. `audit_log_coverage_auditor_v12` — **Audit Log Coverage Auditor**: Review whether sensitive mutations generate audit evidence
60. `supply_chain_guard_v12` — **Supply Chain Guard**: Review package and install-script risk indicators
61. `bundle_weight_auditor_v12` — **Bundle Weight Auditor**: Review bundle-heavy imports and large frontend files
62. `lazy_loading_auditor_v12` — **Lazy Loading Auditor**: Review code splitting and lazy route/component opportunities
63. `render_efficiency_auditor_v12` — **Render Efficiency Auditor**: Review React render hotspots and derived state patterns
64. `memoization_auditor_v12` — **Memoization Auditor**: Review expensive computation and memoization opportunities
65. `network_request_auditor_v12` — **Network Request Auditor**: Review request duplication, polling and waterfall risks
66. `image_asset_auditor_v12` — **Image Asset Auditor**: Review large/unoptimized image references and loading hints
67. `database_performance_auditor_v12` — **Database Performance Auditor**: Review query/pagination/index patterns affecting DB performance
68. `pagination_auditor_v12` — **Pagination Auditor**: Review large-list pagination and infinite-load readiness
69. `cache_efficiency_auditor_v12` — **Cache Efficiency Auditor**: Review query and HTTP cache patterns
70. `memory_leak_risk_auditor_v12` — **Memory Leak Risk Auditor**: Review listeners, timers and cleanup patterns
71. `ci_typecheck_guard_v12` — **CI Typecheck Guard**: Review whether CI enforces type checking
72. `ci_test_guard_v12` — **CI Test Guard**: Review whether CI enforces test execution
73. `artifact_integrity_guard_v12` — **Artifact Integrity Guard**: Review build-artifact and checksum practices
74. `container_readiness_auditor_v12` — **Container Readiness Auditor**: Review Docker/container configuration surfaces
75. `environment_parity_auditor_v12` — **Environment Parity Auditor**: Review local/staging/production configuration parity
76. `release_process_auditor_v12` — **Release Process Auditor**: Review tagging, changelog and release automation
77. `deployment_health_auditor_v12` — **Deployment Health Auditor**: Review deployment health checks and readiness signals
78. `rollback_readiness_auditor_v12` — **Rollback Readiness Auditor**: Review rollback metadata and deployment reversibility
79. `observability_pipeline_auditor_v12` — **Observability Pipeline Auditor**: Review logs, metrics and tracing surfaces
80. `backup_restore_auditor_v12` — **Backup & Restore Auditor**: Review backup, restore and integrity verification surfaces
81. `feature_gap_analyzer_v12` — **Feature Gap Analyzer**: Compare requested product surfaces to implementation evidence
82. `acceptance_criteria_auditor_v12` — **Acceptance Criteria Auditor**: Review whether features have explicit verifiable completion criteria
83. `persona_flow_mapper_v12` — **Persona Flow Mapper**: Map role/persona-specific product flows
84. `onboarding_flow_auditor_v12` — **Onboarding Flow Auditor**: Review first-use, setup and empty-account experience
85. `product_empty_state_auditor_v12` — **Product Empty State Auditor**: Review empty states for actionable next steps
86. `permission_matrix_builder_v12` — **Permission Matrix Builder**: Build role-to-action matrix from permission signals
87. `notification_flow_auditor_v12` — **Notification Flow Auditor**: Review notification triggers, channels and read state
88. `search_discovery_auditor_v12` — **Search & Discovery Auditor**: Review global/local search and filtering capabilities
89. `export_reporting_auditor_v12` — **Export & Reporting Auditor**: Review export, print and reporting capabilities
90. `localization_readiness_auditor_v12` — **Localization Readiness Auditor**: Review i18n, RTL and hard-coded copy readiness
91. `prompt_quality_engine_v12` — **Prompt Quality Engine**: Evaluate prompt structure, constraints and acceptance evidence
92. `tool_selection_auditor_v12` — **Tool Selection Auditor**: Review whether agent tools map clearly to task types
93. `context_budget_planner_v12` — **Context Budget Planner**: Plan focused context packs and prevent unnecessary context expansion
94. `model_routing_policy_v12` — **Model Routing Policy**: Define routing policy by task complexity and modality
95. `hallucination_guard_v12` — **Hallucination Guard**: Require evidence for claims about project state and test success
96. `evidence_gate_engine_v12` — **Evidence Gate Engine**: Enforce evidence requirements before marking work complete
97. `agent_handoff_auditor_v12` — **Agent Handoff Auditor**: Review task handoff contracts between specialized agents
98. `retry_policy_engine_v12` — **Retry Policy Engine**: Define bounded retry/escalation rules for failing automated tasks
99. `cost_guard_engine_v12` — **Cost Guard Engine**: Track execution-cost metadata and prevent wasteful repeated analysis
100. `autonomy_guard_engine_v12` — **Autonomy Guard Engine**: Define safe boundaries for autonomous execution and destructive actions

## Recommended execution order

1. Run `mega_100_status_v12`.
2. Run targeted categories first for the current task.
3. For a full repository review, run `mega_100_audit_v12`.
4. Review HIGH-risk reports before modifying shared code.
5. Feed findings into Smart Context, Impact Analysis, Autopilot and the Release Gate.

## Safety and evidence rules

- Static findings are signals, not proof of a bug.
- Do not mark an issue fixed without runtime, test or code evidence.
- Do not disable tests, type checking, RLS or security controls to obtain a pass.
- Re-run relevant capability reports after significant changes.
