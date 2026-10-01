---
name: ksa-safety-board-hse-automation-workflow
description: Automation, workflow, notification, scheduling, and event-driven engineering skill for KSA SAFETY BOARD. Use when designing or implementing scheduled jobs, HSE reminders, escalations, notification routing, automated CAPA, due-date monitoring, monthly reports, inspections, licenses, equipment, fire systems, MOC, critical controls, training, contractor expiry, environmental monitoring, or governed workflow orchestration.
---

# KSA SAFETY BOARD HSE Automation & Workflow Engineer

Turn repetitive HSE work into controlled, auditable automation without automating away human responsibility. Every automation must be traceable, idempotent, permission-aware, observable, recoverable, and safe to retry. Never hide failures, bypass approvals, or silently alter historical HSE records.

## Automation contract

Before implementing any automation, define:

- **Trigger:** event, schedule, condition, threshold, reminder, approval, generation, or synchronization;
- **Conditions:** exact data predicates, time zone, scope, and permissions;
- **Action:** records, assignments, status changes, notifications, or workflow transitions;
- **Owner:** responsible person/system and backup;
- **Notification:** recipients, channels, template, throttling, and language;
- **Escalation:** thresholds, matrix, next owner, and persisted history;
- **Audit:** run, actor/system identity, source, action, and result;
- **Retry:** transient vs permanent error, backoff, maximum attempts, and idempotency key;
- **Failure handling:** dead-letter/failure state, alerting, manual retry, and rollback/manual intervention.

Never allow an automation to create duplicates when executed twice. Use unique event keys, processed markers, source IDs, period keys, idempotency keys, and database constraints.

## Scheduled jobs and cron

For every cron define path, schedule, timezone, authentication, idempotency, lock/concurrency, retries, audit record, and monitoring. Never create unauthenticated sensitive cron endpoints or expose service/provider/cron secrets. Batch due-item scans and avoid repeatedly scanning entire tables or N+1 queries. Where justified, index status, due date, expiry date, owner, source, and `created_at`.

Daily jobs may scan overdue CAPA, expiring permits, equipment due, fire inspections, licenses, training, and environmental monitoring. Monthly jobs may generate HSE reports, work plans, objective reviews, and compliance reviews—but must preserve immutable historical snapshots.

## Retry and failure architecture

Retry only transient failures with bounded exponential backoff. Persist job/source/error/attempt count/timestamp/status/next retry. Do not retry permanent validation or authorization failures forever.

Use an observable dead-letter/failure state with authorized manual Retry. Every run logs automation ID, rule, trigger, source record, start/end, status, actions, error, and retry information. The admin view should show successful, failed, pending, retrying, last run, next scheduled run, pending notifications, and failed notifications.

## Notification outbox

Use a controlled outbox lifecycle:

`Pending → Claimed → Processing → Sent`

or:

`Failed → Retry`

Support In-App, Email, WhatsApp, and Teams only where connected and authorized. A notification rule defines event, severity, recipients, channel, template, throttling, and escalation. Avoid notification spam through aggregation, cooldowns, deduplication, and persisted delivery status.

## Escalation and CAPA

Persist an escalation matrix. Example: overdue CAPA → owner notification → supervisor after threshold → HSE Manager → escalation history. Possible governed CAPA sources include Incident, NCR, Inspection, Risk, Audit, Vision, Critical Control, and environmental exceedance. Automation may suggest or create CAPA where approved, but must never automatically close CAPA.

## Governed HSE workflows

- **Incident:** notify HSE → assign investigator → investigation → RCA reminder → CAPA monitoring → verification → safety learning.
- **NCR:** assign owner → set due date → reminders → overdue escalation → verification → closure.
- **Inspection:** schedule → generate tasks → assign inspector → reminder → overdue escalation → observation → CAPA when required.
- **Equipment:** monitor inspection/maintenance/certificate/defect/authorization due dates; notify or block status only when governance permits.
- **Licenses:** monitor employee licenses, authorizations, certificates, contractor documents, and facility licenses. Use configured thresholds such as 90/60/30/7 days; never hardcode them when settings exist.
- **Training:** track expiry, refresher, missing competency, attendance, and qualification gaps.
- **Fire:** device fault → HSE Event → notification → maintenance action; pump inspection due → task; blocked exit → Critical Action.
- **Emergency:** activation → response notification → timeline → muster → missing persons → close workflow. Never automate “All Clear” without responsible human authorization.
- **MOC:** stage changes may trigger review, risk assessment, training, PTW/LOTO check, PSSR, and overdue escalation; never bypass approvals.
- **Critical controls:** Effective → record; Degraded → action; Failed → critical CAPA plus escalation.
- **Environmental:** monitoring due → reminder; exceedance → event/action/notification; license expiry → renewal escalation.
- **Safety learning:** publish → recipients → acknowledgement → reminder → overdue acknowledgement → management decision → effectiveness review.

## Historical reporting and plans

Monthly report automation must capture a snapshot, calculate metrics, create Draft/Generated report, notify reviewer, preserve an immutable snapshot, and permit approved printing. Never silently regenerate historical numbers.

Monthly plans create tasks from active templates, assign primary/backup, set due dates, prevent duplicates, and notify assignees. Objective automation may detect review due, missed target, at-risk status, or overdue update, then notify the owner/management review.

## General workflow model

Prefer a governed engine:

`Event → Rule → Condition → Action → Notification → Audit`

Avoid one-off cron logic for every module when a shared model can safely handle the use case. Do not allow arbitrary executable code through a UI rule builder. A rule builder may expose name, module, trigger, conditions, action, owner, priority, channel, escalation, active state, start, and end.

## Permissions and manual override

Automation must not bypass normal authorization or business governance. Controlled server/system privileges must preserve source, actor/system identity, audit, ownership, and approval boundaries. Critical workflows need a human override that records actor, reason, date, before, and after. Never expose service-role, provider, or cron secrets; validate server-side.

## Admin center and test mode

A recommended administration route is `/admin/automation-center` with Overview, Rules, Scheduled Jobs, Event Rules, Notification Outbox, Failures, Run History, and Settings.

Before activating important automation, support a dry-run/test mode that shows matching records, actions that would occur, and notifications that would be created. Dry run must make no production changes.

## Quality gate

Before enabling an automation verify:

- trigger, rule, conditions, source scope, and timezone;
- no duplicate generation and safe retries;
- permissions, ownership, and approval boundaries;
- notification recipients/channel/template/throttling;
- audit records and failure/dead-letter handling;
- rollback or manual intervention;
- dry-run results;
- production monitoring, last/next run visibility, and operator alerting.

An automation is complete only when it is observable, idempotent, permission-safe, tested against duplicate and failure scenarios, and preserves human responsibility for consequential HSE decisions.
