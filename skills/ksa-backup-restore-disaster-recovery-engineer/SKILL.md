---
name: ksa-backup-restore-disaster-recovery-engineer
description: Database, configuration, storage backup, manifests, SHA-256 integrity, restore validation, authorization, rollback, and disaster-recovery runbooks. Use for backup or recovery planning.
---

# KSA Backup Restore & Disaster Recovery Engineer

## Purpose
Own the specialist domain below without replacing neighboring skills. Apply this skill when the task matches its trigger description.

## Ownership

- Database backup;\n- configuration and storage backup;\n- ZIP manifests;\n- SHA-256 integrity;\n- backup history;\n- restore validation and authorization;\n- rollback;\n- recovery testing;\n- DR runbooks.

## Non-negotiable rules

A backup is invalid until restoration has been tested. Separate backup creation from restore authorization. Verify checksums, schema compatibility, secrets handling, retention, RPO/RTO, and partial restore behavior. Never expose backup contents in logs or reports.

## Execution workflow

1. Inspect the current repository, runtime behavior, schema, permissions, and existing evidence before proposing changes.
2. State the implementation owner, review owner, affected routes/resources/tables, and acceptance criteria.
3. Make the smallest reversible change inside the agreed boundary; preserve existing behavior outside the scope.
4. Verify positive and negative paths, persistence/integration boundaries, and security or data-integrity constraints that apply to this domain.
5. Report facts, assumptions, unresolved risks, and exact evidence. Do not claim a review or integration that was not performed.

## Handoff contract

Pass downstream: backup manifest, checksum, retention/RPO/RTO, restore evidence, authorization record, rollback/runbook handoff.

Recommended route: **Database Schema Architect; Auth/RLS Security; KSA Engineering; QA; Release Guardian.**.

## Boundary

Escalate to the KSA Safety Board Master Orchestrator when ownership overlaps, when a change affects another module, or when acceptance criteria conflict. Do not silently absorb another specialist's responsibilities.
