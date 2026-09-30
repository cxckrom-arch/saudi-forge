# KROM FORGE DEV v3.5 — Adaptive Agent Runtime

v3.5 adds an adaptive execution runtime on top of Smart Context, Code Intelligence, Precision Execution, Live Browser Vision, and Autonomous Repair.

## New tools
- `task_decomposition_graph` — converts a large task into dependency-aware execution nodes with an owner and verification gates.
- `task_graph_update` — moves nodes through pending/ready/in_progress/verified/blocked and requires evidence for verification.
- `adaptive_agent_route` — selects the best agent for the current subtask and penalizes a route that already failed.
- `runtime_outcome` — records success/failure/partial/blocked outcomes for future routing decisions.
- `adaptive_runtime_status` — shows active graph and recent routing decisions.

## Execution rule
Do not execute a dependent node before its prerequisites are verified. Do not repeat the same failed agent strategy twice without new evidence or a changed root-cause hypothesis.

## Recommended flow
Prompt → Smart Context → Task Graph → Adaptive Agent Route → Implementation → Evidence → Graph Update → Regression → Browser/Visual Verification → Repair Loop → Release Gate.
