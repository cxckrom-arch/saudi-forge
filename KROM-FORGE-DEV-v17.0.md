# KROM FORGE DEV v17.0 — Adaptive Workflow Compiler

v17.0 turns tool routing into a bounded execution compiler. It converts a task into a compact, dependency-aware workflow with risk controls, evidence requirements, checkpoints, adaptive replanning, and telemetry.

## New capabilities

- `workflow_compile_v17` — compiles a prompt into ordered execution steps.
- `workflow_optimize_v17` — removes redundant capability overlap and estimates workflow risk cost.
- `workflow_replan_v17` — replaces a failed step with an alternative capability path.
- `workflow_gate_v17` — validates workflow safety before execution.
- `workflow_outcome_record_v17` — records evidence-backed outcomes.
- `workflow_telemetry_v17` — summarizes workflow history and success rate.
- `minimal_toolset_v17` — selects the smallest practical capability set.
- `workflow_evidence_map_v17` — maps each step to required evidence.
- `workflow_checkpoint_plan_v17` — places checkpoints before risky changes.
- `workflow_status_v17` — reads the latest workflow and telemetry.

State is stored under `.krom/v17-workflows/`.

## Execution model

Prompt → Tool Search → Workflow Compile → Optimize → Safety Gate → Execute → Evidence → Replan on Failure → Verification → Release
