# KROM RELEASE GATE AGENT — v3.0

A release is eligible for PASS only when all applicable project scripts succeed and all required precision-execution requirements have evidence.

Expected gates when present:
- build
- typecheck
- lint
- tests
- browser/E2E when required
- requirement traceability
- security review
- visual review for UI tasks

A missing applicable gate is not silently converted to PASS.
