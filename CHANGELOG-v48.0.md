# KSA FORGE v48.0.0

## Release objective

V48 improves provider recovery after the V47 circuit breaker opens.

## Changes

- Added a HALF_OPEN recovery phase after circuit cooldown expiry.
- Performs a live provider health probe before returning an unhealthy provider to the request path.
- Passing recovery probes close the circuit and restore the provider immediately.
- Failed recovery probes reopen the circuit for another cooldown window.
- Exposes circuit phase, last probe timestamp, cooldown remaining time, and last error in Developer Platform status.
- Records RECOVERED telemetry when a provider returns successfully after a half-open probe.
- Keeps V46 Smart Failover and V47 Circuit Breaker behavior intact.
- Added deterministic recovery tests using an injectable clock.
- Added V48 automation aliases while preserving V47 through V36 compatibility.
- Bumped release identity, package metadata, lockfile, KROM config, CI workflow, README, and integration contracts to 48.0.0.

## Verification contract

V48 requires TypeScript validation, unit tests, provider failover tests, circuit-breaker tests, half-open recovery tests, server startup, IDE readiness, MCP integration, automation execution, origin rejection, and legacy alias compatibility.
