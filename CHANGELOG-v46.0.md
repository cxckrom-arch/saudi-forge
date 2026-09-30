# KSA FORGE v46.0.0

## Release objective

V46 improves Developer Platform reliability when an AI provider is unavailable, rate-limited, misconfigured, or temporarily failing.

## Changes

- Added bounded Smart Failover to Developer Platform chat.
- Reuses the existing adaptive route ranking and healthy candidate list.
- Tries the selected provider first, then up to two additional healthy candidates.
- Continues after provider HTTP errors, timeouts, empty responses, and missing model/profile conditions.
- Records per-attempt provider, model, status, HTTP status, latency, and sanitized error evidence.
- Redacts credential-like tokens from persisted failure messages.
- Exposes `failoverUsed` and `attempts` in the developer-chat response.
- Added regression coverage where the primary provider returns HTTP 429 and the backup provider succeeds.
- Added V46 automation aliases while retaining V45 through V36 compatibility aliases.
- Bumped centralized release identity, package metadata, KROM config, CI, README, and integration contracts to 46.0.0.

## Reliability contract

Failover is bounded to three routed providers per request. KSA Forge does not loop indefinitely and does not retry providers outside the enabled healthy route candidates.

## Verification

V46 requires TypeScript validation, unit tests, server startup, IDE readiness, MCP integration, automation execution, origin rejection, full project scan, and compatibility checks for legacy aliases.
