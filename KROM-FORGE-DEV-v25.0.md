# KROM FORGE DEV v25.0 — Autonomous Design-to-Code & UX Intelligence

v25 adds a design-intelligence layer on top of the existing knowledge graph and verified engineering pipeline.

## New tools
- design_token_audit_v25
- component_consistency_v25
- layout_diagnostics_v25
- ux_flow_analysis_v25
- responsive_rtl_intelligence_v25
- accessibility_by_design_v25
- interaction_state_audit_v25
- visual_regression_policy_v25
- design_quality_score_v25
- design_change_plan_v25
- design_gate_v25
- design_intelligence_status_v25

## Workflow
Prompt → Knowledge Graph → UI/UX audits → Design Quality Score → Design Change Plan → Browser/Visual Verification → Design Gate → Release Governance.

## State
Reports are stored under `.krom/v25-design-intelligence/`.

## Notes
Static audits are heuristics. Final UI acceptance should include live-browser and screenshot evidence. v25 deliberately blocks a design release when required visual baselines are missing.
