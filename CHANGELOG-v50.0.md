# KSA FORGE v50.0.0

## Release objective

V50 closes the loop between observed provider behavior and Smart Route decisions.

## Changes

- Smart Route now consumes the persisted V49 provider reliability ledger.
- Candidate scoring combines live provider health, persisted request success rate, persisted successful latency, task affinity, provider priority, and optional local preference.
- Historical reliability is confidence-weighted by sample size so small histories cannot dominate route selection.
- Live health remains a hard eligibility gate: historical success cannot rescue a provider that is currently unavailable.
- Route output now exposes historical request count, historical success rate, historical latency, and the calculated historical score for each candidate.
- Route explanations now distinguish live health from persisted reliability evidence.
- Added regression coverage showing a historically reliable provider can outrank a nominally higher-priority but flaky provider.
- Added V50 automation aliases while preserving V49 through V36 compatibility.
- Bumped release identity, package metadata, lockfile, KROM config, CI workflow, README, and integration contracts to 50.0.0.

## Verification contract

V50 requires TypeScript validation, unit tests, reliability-aware routing tests, provider ledger persistence tests, Smart Failover, Circuit Breaker, Half-Open Recovery, server startup, IDE readiness, MCP integration, automation execution, origin rejection, and legacy alias compatibility.
