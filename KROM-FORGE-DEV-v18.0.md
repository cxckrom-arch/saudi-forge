# KROM FORGE DEV v18.0 — Verified Autonomous Executor

v18 adds a verification-first runtime on top of the v17 Adaptive Workflow Compiler.

## Execution model

`Prompt → Workflow Compile → Step Begin → Tool Execution → Receipt → Evidence Validation → False-PASS Scan → Safe Resume/Repair → Invariant Gate → Verified Release`

## Execution receipts
Each workflow step has a persistent receipt with:
- step id
- selected tool
- expected verification
- actual outcome
- evidence list
- status
- timestamps

A step cannot be recorded as `passed` with an empty evidence list.

## False-PASS protection
`false_pass_detector_v18` flags a receipt marked PASS when its evidence or actual output still contains failure signals such as errors, blocked states, exceptions, or non-zero exit-code language.

## Safe resume
`safe_resume_v18` does not skip over failed or blocked steps. After restart it returns the first safe resume point.

## Persistent state
- `.krom/v18-verified-execution/active-run.json`
- `.krom/v18-verified-execution/history.json`

## Release invariant
`verified_release_gate_v18` returns PASS only when:
1. Every workflow step is passed.
2. Every passed step has evidence.
3. No false-PASS conflict exists.
4. High-risk workflow steps are verified.
