# KROM FORGE DEV v4.0 — Autonomous Product Engineering Core

v4.0 adds a product-level engineering layer above code execution.

## New tools
- `product_blueprint`
- `acceptance_contract_generate`
- `feature_completeness_matrix`
- `product_gap_detector`
- `product_release_readiness`

## Why it matters
Earlier versions could inspect, plan, repair and verify code. v4.0 adds an explicit model of the product itself: actors, requested features, product surfaces, quality bars and acceptance evidence.

The system can now flag common false-completion patterns such as UI-only capabilities, features with no integration evidence, and critical functionality with no targeted tests.

## Recommended pipeline
Prompt → Product Blueprint → Acceptance Contract → Feature Matrix → Gap Detection → Smart Context → Council → Change Simulation → Preflight → Autopilot → Browser/Visual/Security/Regression → Product Readiness → Release Gate.
