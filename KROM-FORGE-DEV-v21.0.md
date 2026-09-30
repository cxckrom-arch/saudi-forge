# KROM FORGE DEV v21.0 — Autonomous Verification & Release Intelligence

v21 adds an evidence-first release verification layer on top of the v18 verified executor, v19 refactoring intelligence, and v20 self-healing migration engine.

## New capabilities

- Test impact intelligence from Git changes and the code dependency graph.
- Static flaky-test risk detection with explicit uncertainty.
- API/schema contract verification evidence checks.
- Visual baseline governance for responsive regression review.
- Release risk scoring from change scope, sensitive surfaces, and test coverage evidence.
- Canary readiness checks.
- Change provenance capture (HEAD, branch, changed files, diff stats).
- Release evidence bundle generation.
- Regression replay planning.
- Artifact/package input integrity recording.
- Dynamic release evidence policy.
- Final release attestation that refuses to claim readiness when evidence is missing.
- Release intelligence status reporting.

## State directory

`.krom/v21-release-intelligence/`

## Design rule

v21 never treats missing evidence as PASS. It records observed evidence and explicitly withholds attestation if required proof is absent.
