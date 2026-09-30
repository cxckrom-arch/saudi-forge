# KROM FORGE DEV v3.7 — Engineering Autopilot

v3.7 adds a resumable engineering autopilot above the existing Smart Context, Adaptive Runtime, Live Browser Vision, Repair Loop, Code Intelligence, Visual Designer, and Release Gates.

## New tools
- `engineering_autopilot_start`: creates pre-change checkpoint, smart context, strategy, task graph and persistent run state.
- `autopilot_checkpoint`: snapshots project text/code files before risky changes.
- `autopilot_quality_watchdog`: converts quality evidence and blockers into the next phase: execute, verify, repair, release, or blocked.
- `autopilot_rollback`: restores checkpointed files after a confirmed regression.
- `engineering_autopilot_status`: exposes the persisted state so a run can resume after restart.

## Safety and precision rules
- No release from confidence alone; verification evidence is still required.
- A release candidate requires quality >= 90 and zero blockers before the release gate.
- Checkpoints are stored under `.krom/autopilot-checkpoints/`.
- State and history are stored under `.krom/autopilot-state.json` and `.krom/autopilot-history.json`.
- Blind retry loops remain prohibited; repeated failure should trigger deeper diagnosis or rollback.

## Recommended flow
`engineering_autopilot_start` → execute READY graph nodes → `autopilot_quality_watchdog` → browser/visual/regression verification → repair if needed → release gate → record learning memory.
