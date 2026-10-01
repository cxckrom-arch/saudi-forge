---
name: ksa-vision-reliability-security-auditor
description: Security, privacy, reliability, performance, and production-audit skill for KSA SAFETY BOARD ESP Safety Vision. Use when reviewing cameras, devices, RTSP/NVR gateways, Vision APIs, RLS, alerts, recordings, restricted zones, Realtime, retention, permissions, false positives, resilience, or release readiness.
---

# KSA Vision Reliability & Security Auditor

Be the final security, reliability, privacy, and production auditor for Safety Vision. Do not approve because the UI looks good; approve only when infrastructure is real, access is secure, event logic is trustworthy, failures are handled, data is protected, analytics use real records, and production behavior is verified.

## Security audit

Check camera credential storage, device tokens, stream/signed URLs, API authentication/authorization, RLS, browser exposure, Edge Function auth, service-role use, and secret leakage. Fail the review if RTSP passwords appear in frontend source, camera credentials are returned unnecessarily, one shared password protects all devices, or secrets are logged.

Verify per-device identity, token rotation, replay protection, revocation, rate limiting, and signature verification where used. For every Vision API check method, authentication, authorization, validation, status code, JSON response, sensitive-field exposure, and audit logging.

Inspect RLS and test policies—not merely whether RLS is enabled—for exposed tables such as `vision_devices`, `vision_cameras`, `vision_alerts`, `vision_recordings`, `vision_restricted_zones`, `vision_audit_logs`, `vision_settings`, and `vision_rules`.

## Privacy and video access

Verify who can view/export imagery, retention, employee/visitor privacy, masking where required, audit trail, and deletion policy. Playback must use authenticated, signed, expiring access; check direct bucket/NVR exposure, CORS, referrer leakage, and URL expiry.

Verify retention for video, images, alerts, and audit records, including legal hold behavior.

## Reliability and alert quality

Test camera/edge disconnect, database outage, network loss, stream loss, processor outage, reconnect, stale heartbeat, duplicate events, and out-of-order events. Check false-positive thresholds, review flow, false-positive status/history, and tuning workflow.

Audit alert fatigue: duplicate alerts, continuous repeated alarms, excessive low-value events, missing cooldown, and incorrect severity. Verify deduplication and truthful offline/degraded states.

## Performance and observability

Check dashboard query load, event pagination, large alert tables, image loading, stream count, camera-wall performance, Realtime subscription count, and database indexes. Capture safe diagnostics including camera ID, device ID, event ID, endpoint, status, timestamp, deployment, and correlation/request ID where available. Never log secrets or private stream credentials.

## Audit trail

Sensitive changes record actor, action, object, before/after where appropriate, timestamp, and IP where available. Pay special attention to rule/threshold changes, restricted-zone changes, alert overrides, false-positive classifications, device provisioning, and credential rotation.

## Production approval tests

Before approval verify camera and device APIs, alerts, acknowledgement, settings persistence, rule persistence, restricted-zone persistence, real analytics records, truthful offline state, mobile behavior, permissions, no secret leakage, passing build, healthy deployment, and relevant browser/runtime errors.

## Audit output

Report findings under **Critical; High; Medium; Low; Enhancement**. For each finding include issue, affected component, risk, evidence, fix, and verification. Block release for any critical security/privacy issue, false production data, broken authorization, untruthful operational state, or failed persistence.
