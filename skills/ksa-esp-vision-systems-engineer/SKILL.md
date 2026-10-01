---
name: ksa-esp-vision-systems-engineer
description: Vision infrastructure and ESP integration skill for KSA SAFETY BOARD. Use when engineering or auditing cameras, edge devices, RTSP/WebRTC/HLS gateways, NVR/VMS integrations, provisioning, telemetry, stream health, device authentication, facility topology, or real-time vision event transport.
---

# KSA ESP Vision Systems Engineer

Engineer the real industrial infrastructure behind KSA SAFETY BOARD Safety Vision. Do not design generic dashboards and never make unavailable camera, stream, or device capabilities appear functional.

## Inspect first

Before changing ESP/Vision, inspect current routes and Vision pages, APIs and Vercel rewrites, Supabase tables, Edge Functions, Realtime channels, camera/device/alert/recording/settings schemas, audit logs, restricted zones, facility maps, and deployment configuration. Verify every claimed capability from source and runtime.

Document the chain:

`Camera/Sensor → ESP/Edge Device → Network → Stream/Telemetry Gateway → Vision Processing → Safety Event → Alert → HSE Workflow`

## Camera and device model

Verify actual schema before adding fields. Camera metadata may include ID, bilingual name, plant/building/floor/area/zone, physical or map location, IP/MAC, type, manufacturer/model/serial, resolution/FPS/codec/firmware, RTSP or gateway reference, NVR/VMS channel, recording and analytics state, last seen, and health. Support types such as fixed bullet, dome, PTZ, thermal, dual-spectrum, indoor/outdoor, mobile, and edge-AI camera without assuming identical analytics.

Distinguish **network reachable**, **video stream healthy**, and **AI analytics healthy**. Standard camera states: Online, Offline, Warning, Degraded, Maintenance, Disabled, Unknown.

Edge devices may require ID, type, hardware, firmware, MAC/IP, site/zone, camera associations, authentication/provisioning state, heartbeat, health, CPU, memory, temperature, storage, power, and network strength. Lifecycle: Registered, Provisioning, Active, Degraded, Offline, Maintenance, Revoked, Retired.

## Provisioning and security

Use device identity, signed enrollment, registration tokens, token/key/certificate rotation, revocation, reprovisioning, and site assignment. Use server-side secret storage, short-lived access, signed stream URLs, and device-specific credentials. Never hardcode shared credentials, expose raw RTSP/camera passwords to browser JavaScript, or log secrets.

For an `esp-devices` Edge Function, audit authentication, device identity, request signature, replay protection, rate limits, validation, ownership, timestamp tolerance, logging, and safe errors.

## Streams, recordings, and gateways

Track RTSP endpoint, transport, authentication, codec, main/substream, reconnect state, and health. Browsers generally cannot play RTSP directly; use an actual WebRTC, HLS/LL-HLS, or secure proxy/transcoder gateway. Do not claim that an RTSP URL alone provides browser playback.

For NVR/VMS, verify server, channel, recording state, retention, playback reference, and event-to-recording linkage. Distinguish recording metadata from actual stored video. Recording metadata can include camera, start/end/duration, event, storage reference, retention expiry, clip availability, thumbnail, and export status. Support default retention, critical-event override, legal hold where required, automatic expiry, and auditability.

## Resilience and telemetry

Implement or verify exponential reconnect, stale-device detection, bounded offline buffering, duplicate prevention, replay/sequence IDs, and timestamp reconciliation. Track device time, server-received time, and processing time; prefer NTP synchronization and never order events solely by browser time.

Use telemetry deliberately: heartbeat, CPU, RAM, temperature, storage, network quality, stream health, AI service health, uptime, dropped frames, packet loss, latency, last frame, and reconnect count. Avoid storing high-frequency telemetry without a retention strategy. Use Realtime for heartbeat, state, safety alerts, or acknowledgement where it adds operational value; never send raw video over Supabase Realtime.

Integrate cameras/devices with factory, building, floor, area, zone, and floor-plan X/Y or geospatial position. Explicitly handle offline camera/device, unavailable stream/NVR/processor, degraded network, authentication failure, clock drift, full storage, and stale heartbeat.

## API, database, and observability

Vision infrastructure APIs must validate method, auth, authorization, payload schema, and return structured JSON—not HTML. Inspect actual production tables such as `vision_devices`, `vision_cameras`, `vision_recordings`, `vision_settings`, and `vision_audit_logs`; never invent schema.

Capture safe diagnostics for device/camera errors, reconnects, processing failures, API failures, and ingestion failures. Never log camera passwords, secret tokens, or private stream credentials.

## Review output

Use this structure: **Current Architecture; Camera Layer; Device Layer; Network Layer; Stream Layer; Processing Layer; API Layer; Database Layer; Security; Reliability; Gaps; Recommended Fix; Verification.**

Build the ESP layer as real infrastructure: no fake connectivity, no assumed browser-ready RTSP, no exposed credentials, and explicit failure/recovery behavior.
