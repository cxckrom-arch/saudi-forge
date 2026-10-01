---
name: ksa-safety-board-dashboard-analytics
description: Dashboard, KPI, analytics, visualization, and operational-intelligence skill for KSA SAFETY BOARD. Use when designing or auditing executive/operational HSE dashboards, KPI systems, leading and lagging indicators, drilldowns, trends, comparisons, risk heatmaps, compliance views, management-review analytics, or real-time operational status.
---

# KSA SAFETY BOARD Dashboard & Analytics Architect

Design decision-grade HSE dashboards. A dashboard is not decoration: every number must answer a management or operational question and be traceable to real KSA SAFETY BOARD data.

## Data-first KPI discipline

Never design a KPI before identifying its source table/API/RPC, formula, time period, scope, filters, permission scope, and drilldown target. Never use fake numbers, fabricated records, or a misleading zero after data retrieval fails.

Every KPI must have this contract:

- **Name**
- **Business meaning**
- **Source**
- **Calculation/formula**
- **Time range**
- **Documented status thresholds**
- **Filters and permission scope**
- **Drilldown target**
- **Empty behavior**
- **Error behavior and freshness**

Support count, percentage, rate, ratio, average, duration, trend, compliance percentage, overdue percentage, severity distribution, and risk distribution KPIs.

Keep leading indicators visibly distinct from lagging indicators. Leading examples include observations, inspection completion, training completion, PTW compliance, critical-control verification, CAPA on-time closure, near-miss reporting, preventive actions, MOC reviews, and alert acknowledgement. Lagging examples include incidents, LTI, MTC, FAC, property damage, environmental events, NCR, and repeat findings.

## Dashboard audiences and hierarchy

### Executive dashboard

Design concise senior-management views that prioritize critical/overdue CAPA, incidents, near misses, critical risks, PTW, equipment due, inspection compliance, fire alarms/faults, emergency readiness, contractor issues, environmental issues, and objective status.

### Operational dashboard

Design for HSE teams: actions due today, active permits, open incidents/NCR, inspection tasks, equipment defects, fire faults, handover items, escalations, and current alerts.

State the audience and decision purpose before choosing cards or charts.

## Dimensions and comparisons

Support appropriate filtering by factory, plant, department, area, date, month, quarter, year, severity, status, source, owner, contractor, and equipment. Support Today, last 7 days, month, previous month, quarter, year, and custom ranges.

Where meaningful, show current period, previous period, absolute delta, percentage change, target, variance, status, and trend. Never invent red/yellow/green thresholds; use documented business definitions.

## Drilldown integrity

Every summary must connect to underlying records. For example, clicking `Overdue CAPA = 12` opens an Action Center filtered to those exact 12 records. No dead KPI cards or charts. Preserve filters, date range, permission scope, and query evidence through the drilldown.

## Chart selection

Use charts only when they answer a question:

- **Line:** time trends.
- **Bar:** category comparison.
- **Stacked bar:** status or severity breakdown.
- **Donut:** small, simple distributions only.
- **Heatmap:** risk/event density with an explanation of the dimension.
- **Risk Matrix:** likelihood × severity.

Every chart needs title, period, labels, units, source/freshness where useful, and empty/error behavior. Avoid decorative charts.

## Analytical states and integrity

Support Loading, Empty, Partial Data, Error, Permission Restricted, and Stale Data states. Distinguish:

- `0 records` from `Data unavailable`;
- `No events` from `No permission`;
- `No records` from `Failed retrieval`.

Show data freshness and partial coverage rather than silently presenting incomplete results.

## Domain analytics

Support real persisted analytics for:

- **Risk:** initial vs residual risk, critical/high counts, overdue reviews, control effectiveness, critical-control failures, recurring hazards, and plant/department comparison.
- **Incident:** type, severity, department/factory/month, root-cause category, repeat events, closure duration, and CAPA completion.
- **NCR:** open/overdue/closed/critical, department/cause, repeated non-conformance, and average closure time.
- **CAPA:** open, in progress, pending verification, overdue, closed, failed effectiveness, owner performance, and closure duration.
- **Training:** completion, attendance, competency, expiring certifications/authorizations, and department gaps.
- **Contractors:** approved/blocked, expired documentation, induction, scorecard, and violations.
- **Environmental:** significant aspects, exceedances, monitoring due, measurements, license expiry, and compliance.
- **Fire/Emergency:** alarms, faults, offline devices, inspection due, blocked exits, muster performance, evacuation time, and response trends.
- **Vision:** alerts, confirmed violations, false-positive percentage, PPE, zones, cameras, plants, time trends, and high-risk areas.

## Management review and targets

Generate reproducible, governed analytical inputs for Management Review, Objectives, Compliance, CAPA, Risk, Training, Emergency, Contractors, Industrial Hygiene, and MOC. Snapshot definitions, source periods, filters, permissions, and calculation versions so results can be reproduced.

Where a KPI has a target, show actual, target, variance, status, and trend. Define threshold ownership and versioning; do not change thresholds silently.

## Shared UI and responsive system

Prefer reusable components:

`KpiCard, TrendIndicator, AnalyticsFilterBar, DrilldownCard, ChartCard, RiskHeatmap, RiskMatrix, InsightPanel, ComparisonCard, DataFreshnessBadge`.

Mobile dashboards must prioritize critical alerts, overdue actions, current operations, and compact KPIs. Do not blindly compress desktop dashboards.

Dashboard report print must use a white canvas, include filters/date range/timestamp/logo and KPI definitions where needed, keep charts readable, and exclude application navigation.

## Performance and data architecture

Avoid dozens of independent dashboard queries. Prefer aggregated snapshot APIs/RPCs where appropriate, while preserving permission scope and traceability. Audit query count, indexes, expensive aggregations, date filtering, pagination, and safe caching. Do not trade data correctness or authorization for speed.

## Required dashboard specification

For every dashboard, provide:

### Audience
Who uses it.

### Decision Purpose
What decision or operational question it supports.

### KPIs
Names, definitions, types, thresholds, freshness, and states.

### Formula and Data Source
Exact calculation, table/API/RPC, scope, and permission.

### Filters
Dimensions, date ranges, comparison behavior, and persistence.

### Charts
Chart type, question answered, labels, units, and empty/error states.

### Drilldowns
Destination record view, preserved filters, and access rules.

### Alerts
Criticality, acknowledgement, ownership, and escalation.

### Layout
Executive or operational hierarchy and component arrangement.

### Mobile
Prioritized content and responsive transformations.

### Print
White-canvas report behavior, metadata, timestamp, and chart readability.

### Performance
Query strategy, indexes, aggregation, freshness, and caching.

### Permissions
Who can see each KPI, record, drilldown, and export.

A dashboard is complete only when its metrics are real, formulas are documented, errors are truthful, drilldowns work, permissions are enforced, mobile and print behavior are usable, and performance is verified.
