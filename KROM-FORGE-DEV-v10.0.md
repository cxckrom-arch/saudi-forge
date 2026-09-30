# KROM FORGE DEV v10.0 — Autonomous Software Factory

v10.0 adds a product-to-release software factory layer on top of the existing IDE, Autopilot, visual, browser, security, database, regression, and release systems.

## New tools

- `spec_to_code_pipeline_v10` — converts a product goal into gated engineering phases and acceptance requirements.
- `architecture_graph_v10` — builds a source/import architecture graph from the current project.
- `migration_planner_v10` — creates a safe additive migration plan with RLS and rollback requirements.
- `e2e_scenario_generator_v10` — creates acceptance-oriented E2E scenarios including mobile/responsive checks.
- `visual_regression_manager_v10` — manages visual-regression routes, viewports, and baseline policy.
- `release_notes_generator_v10` — derives release-note evidence from the latest Git change set.
- `cicd_orchestrator_v10` — inspects package scripts/deployment signals and creates a gated CI/CD model.
- `quality_budget_v10` — stores measurable quality thresholds for compiler, lint, tests, security, visual quality, accessibility, bundle size, and product completeness.
- `engineering_telemetry_v10` — records caller-supplied non-secret engineering metrics.
- `project_blueprints_v10` — creates reusable local project blueprints under `.krom/blueprints`.
- `software_factory_status_v10` — reports whether the main v10 factory artifacts are ready.

## Recommended factory flow

1. `spec_to_code_pipeline_v10`
2. `architecture_graph_v10`
3. `project_blueprints_v10` when a reusable pattern is useful
4. `migration_planner_v10` for schema/data changes
5. `e2e_scenario_generator_v10`
6. `quality_budget_v10`
7. Existing Smart Context / Council / Simulation / Autopilot execution
8. Existing browser, visual, security, regression and product-readiness gates
9. `visual_regression_manager_v10`
10. `cicd_orchestrator_v10`
11. `release_notes_generator_v10`
12. Existing Release Center and final release gate

v10.0 does not claim that a generated plan, scenario, or graph is a substitute for real verification. Release evidence must still come from actual build, test, browser, security, database, and product checks.
