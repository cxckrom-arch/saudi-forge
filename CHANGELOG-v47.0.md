# KSA FORGE v47.0.0

## Release objective

V47 reduces repeated latency and request waste when a routed AI provider is unhealthy.

## Changes

- Added a per-provider circuit breaker to Developer Platform chat.
- Opens a provider circuit after two consecutive request failures.
- Keeps the circuit open for 60 seconds before allowing another attempt.
- Skips open circuits and continues through healthy Smart Route alternatives.
- Clears circuit state immediately after a successful provider response.
- Exposes provider circuit state through Developer Platform status.
- Records circuit-open skips in failover attempt telemetry.
- Keeps V46 Smart Failover bounded to routed healthy candidates.
- Added regression coverage proving that the third request skips a provider after two failures.
- Added V47 automation aliases while preserving V46 through V36 compatibility.
- Bumped release identity, package metadata, lockfile, KROM config, CI workflow, README, and integration contracts to 47.0.0.

## Verification contract

V47 requires TypeScript validation, unit tests, server startup, IDE readiness, MCP integration, automation execution, network-origin rejection, provider failover coverage, circuit breaker coverage, and legacy alias compatibility.
