# KROM FORGE DEV v2.3

## Added
- Precision Execution Engine.
- Persistent Execution Manifest in `.krom-execution/current-task.json`.
- `start_precise_execution`.
- `update_execution_requirement`.
- `execution_status`.
- `execution_audit`.
- Automatic changed-file tracking from `write_file` and `patch_file`.
- Automatic command evidence tracking from `run_command`.
- Evidence requirement before a task item can be marked verified.
- Final requirement-by-requirement audit with quality gates.

## Behavior
The agent is instructed not to finish a substantial implementation after merely editing code. It must reconcile the original prompt against tracked requirements and provide evidence for completion.
