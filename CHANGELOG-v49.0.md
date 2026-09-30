# KSA FORGE v49.0.0

## Release objective

V49 adds durable provider reliability evidence so routing and diagnostics can use historical behavior instead of only in-memory state.

## Changes

- Added `src/provider-reliability-ledger.ts`.
- Persists bounded provider reliability events under the Developer Platform state directory.
- Records request pass/fail, failover usage, circuit opens/skips, and recovery probe results.
- Computes per-provider success rate, request counts, failures, average successful latency, failovers, circuit opens, recoveries, and last event.
- Keeps event history bounded and survives process restart.
- Exposes provider reliability summary through Developer Platform status.
- Added direct persistence and aggregation regression tests.
- Added V49 automation aliases while preserving V48 through V36 compatibility.
- Bumped release identity, package metadata, lockfile, KROM config, CI workflow, README, and integration contracts to 49.0.0.

## Verification contract

V49 requires TypeScript validation, unit tests, reliability-ledger persistence tests, Smart Failover tests, Circuit Breaker tests, Half-Open Recovery tests, server startup, IDE readiness, MCP integration, automation execution, origin rejection, and legacy alias compatibility.
