# KROM FORGE DEV v18.0 — Verified Autonomous Executor

## Added
- Receipt-backed verified execution runs.
- Evidence-required PASS policy.
- Outcome comparator with exact/contains/regex/nonempty modes.
- False-PASS detector for contradictory evidence.
- Safe resume from the first unverified or failed step.
- Invariant gate for evidence, false-pass protection, and high-risk steps.
- Final verified release gate.
- Persistent run state under `.krom/v18-verified-execution/`.

## New MCP tools
1. `verified_execution_start_v18`
2. `execution_step_begin_v18`
3. `execution_receipt_v18`
4. `evidence_validator_v18`
5. `outcome_comparator_v18`
6. `false_pass_detector_v18`
7. `safe_resume_v18`
8. `execution_invariant_gate_v18`
9. `verified_release_gate_v18`
10. `verified_execution_status_v18`

The core rule in v18 is: a step is not complete because an agent says it is complete. It is complete only after evidence is attached and the execution gates accept it.
