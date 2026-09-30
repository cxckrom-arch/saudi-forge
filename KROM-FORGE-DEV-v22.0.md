# KROM FORGE DEV v22.0 — Autonomous Quality Governance & Policy Engine

v22 adds policy-as-code governance above the v21 verified release evidence layer.

## New tools
1. `quality_policy_init_v22`
2. `change_risk_classify_v22`
3. `approval_matrix_v22`
4. `policy_exception_request_v22`
5. `exception_expiry_audit_v22`
6. `evidence_policy_check_v22`
7. `compliance_matrix_v22`
8. `policy_evaluate_v22`
9. `change_freeze_check_v22`
10. `policy_diff_v22`
11. `governance_gate_v22`
12. `governed_release_decision_v22`
13. `governance_report_v22`
14. `governance_status_v22`

## State
Artifacts are written under `.krom/v22-governance/`.

## Governance principles
- Missing evidence is never treated as PASS.
- Critical-risk exceptions are denied by default.
- Exceptions are time-bounded and owner-attributed.
- High/critical changes can be blocked by `KROM_CHANGE_FREEZE=true`.
- Final governed release requires both v22 governance PASS and v21 release attestation.
