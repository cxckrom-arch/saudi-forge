# KROM FORGE DEV v3.2 — Autonomous Repair Loop

v3.2 adds a bounded evidence-driven repair loop on top of v3.1 Live Browser Vision.

## New tools
- `autonomous_repair_begin`: collects real failures from build/typecheck/lint/tests, requirements, and Live Browser Vision.
- `repair_source_locator`: maps failure tokens to likely source files so the developer inspects before editing.
- `autonomous_repair_verify`: reruns gates, compares failure fingerprints, and decides PASS / ACTIVE / BLOCKED / MAX_ITERATIONS.
- `autonomous_repair_status`: exposes repair history and unresolved findings.

## Safety against fake progress
The loop has a configurable maximum iteration count. Repeated identical failure fingerprints trigger BLOCKED instead of infinite retrying. PASS is only produced when current evidence has no unresolved findings; final completion still requires `release_gate_v31`.

## Recommended flow
Prompt → Precision Execution → Developer → Live Browser Vision → Autonomous Repair Begin → Inspect/Patch → Repair Verify → repeat if ACTIVE → Visual Review → Release Gate v3.1 → DONE.
