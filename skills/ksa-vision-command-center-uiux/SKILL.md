---
name: ksa-vision-command-center-uiux
description: Industrial command-center UI/UX skill for KSA SAFETY BOARD Safety Vision. Use when designing or reviewing Vision dashboards, camera walls, camera/device management, facility maps, alerts, rules, restricted areas, heatmaps, PPE, fire/smoke, recordings, analytics, settings, or Vision audit-log interfaces.
---

# KSA Vision Command Center UI/UX

Design a professional industrial monitoring interface with high information density without clutter. Live safety status comes first; critical alerts outrank decoration. Never make unavailable functionality appear functional.

## Visual and navigation system

Use an industrial, operational, technical, modern enterprise style. Avoid gaming UI, cyberpunk/neon, excessive glassmorphism, unnecessary animation, and constant flashing. Use the shared KSA design system, semantic status colors plus text/icons, accessible contrast, dark monitoring surfaces, and white print/report outputs.

Organize navigation for Vision Dashboard, Live Camera Wall, Cameras, ESP Devices, Facility Map, Safety Rules, Events, Alerts, Analytics, Heatmaps, PPE, Restricted Areas, Fire/Smoke, People/Vehicles, Equipment Monitoring, Recordings, Settings, and Vision Audit Log. Inspect actual permissions and routes before adding items.

## Dashboard and camera wall

Dashboard hierarchy: operational health (cameras online/offline, edge devices, active alerts), safety alerts (critical/high/PPE/restricted/fire-smoke), operations (camera/device health and recent alerts), then analytics (plant trends and false-positive rate). Use real data and truthful loading/error/empty states.

Support camera-wall layouts 1×1, 2×2, 3×3, and 4×4. Each tile shows camera name, area, health, recording indicator, AI state, and alert indicator. On click, open focus view. Clearly distinguish Live, Offline, Warning, Stream Error, Maintenance, and Disabled. Never show a fake black frame as live.

Focus view may contain stream, metadata, recent events, active rules, camera health, zone overlays, and settings navigation. Use small status pulse/dot, timestamps, and updating badges only.

## Alerts, map, and rule tools

Alert tables/cards show timestamp, thumbnail, camera, plant, zone, violation type, confidence, severity, and status. Actions: Acknowledge, Review, Resolve, False Positive, Open Source Event—with permissions and confirmation where consequential.

Facility map/floor plan shows camera markers, edge devices, risk/restricted areas, and marker states Online, Offline, Warning, Active Alert. Restricted-area editor supports polygon, rectangle, and line crossing with camera selection, drawing, point editing, delete, severity, schedule, and save.

Heatmap includes floor plan, intensity, timeframe, category/severity filters, and an explanation of what density means. PPE view can show helmet, vest, shoes, glasses, gloves, and harness counts/share/trend/source. Fire/smoke view prioritizes active alert, camera, zone, confidence, thermal/optical type, acknowledgement, and emergency link.

## Management and analytics

Device list: name, ID, type, site, status, last seen, firmware, temperature, and network. Detail drawer: health, telemetry, associated cameras, provisioning, errors, and audit events.

Camera management: directory, add/edit, health details, stream configuration, and analytics configuration. Use sections/tabs for complex configuration, not one giant form.

Rule builder sections: Target (camera/zone), Detection, Conditions (threshold/schedule), Severity, Notification, HSE Automation, and Status. Analytics should answer questions such as alert trend, alerts by plant/category, false-positive rate, and top affected zones.

Recordings browser supports camera/date/start-end/duration/related event/availability filtering. Do not show Play if a real stream or clip is unavailable.

## Responsive and output format

Desktop: multi-panel monitoring. Tablet: two-column command views. Mobile: priority alerts and single-camera focus; never squeeze a 16-camera wall into a phone. Preserve RTL/LTR and touch targets. Dark mode must retain contrast.

For every Vision screen specification, return: **Frame; Grid; Navigation; Header; KPIs; Main Panels; Components; Icons; States; Interactions; Responsive Rules.** If Figma tools exist, create editable frames/components rather than flat screenshots.

## Quality gate

Verify critical alerts visually outrank analytics, unavailable streams are truthful, every action has an interaction and permission, loading/error/empty states exist, mobile is intentional, RTL/LTR works, and print/report surfaces remain isolated and white.
