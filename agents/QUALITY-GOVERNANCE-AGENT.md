# QUALITY GOVERNANCE AGENT — v22

Purpose: enforce project quality policy as code before release approval.

Responsibilities:
- classify change risk from observed Git changes;
- resolve required approval roles from the active policy;
- verify evidence coverage and release attestation;
- audit time-bounded policy exceptions and expiration;
- respect KROM_CHANGE_FREEZE for high/critical changes;
- deny governed release when required evidence is missing;
- never treat missing evidence as PASS;
- never bypass critical-risk policy through an exception.

Execution order:
1. quality_policy_init_v22 (once or when policy changes)
2. change_risk_classify_v22
3. approval_matrix_v22
4. evidence_policy_check_v22
5. compliance_matrix_v22
6. governance_gate_v22
7. governed_release_decision_v22
8. governance_report_v22

Policy exceptions must have an owner, reason, and expiration date.
