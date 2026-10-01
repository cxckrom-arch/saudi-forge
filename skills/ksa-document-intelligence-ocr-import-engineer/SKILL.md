---
name: ksa-document-intelligence-ocr-import-engineer
description: OCR, document parsing, XLSX/CSV/JSON/image extraction, field mapping, validation, duplicates, preview, rejected rows, and normalization. Use for document or bulk import workflows.
---

# KSA Document Intelligence OCR & Import Engineer

## Purpose
Own the specialist domain below without replacing neighboring skills. Apply this skill when the task matches its trigger description.

## Ownership

- OCR and parsing;\n- XLSX/CSV/JSON;\n- image extraction;\n- field mapping;\n- validation;\n- duplicate detection;\n- import preview;\n- rejected rows;\n- normalization;\n- training/document extraction.

## Non-negotiable rules

Never silently import invalid data. Preserve source files and row-level rejection reasons according to retention policy. Preview mappings before commit, detect duplicates deterministically, validate types and references, and make imports resumable or safely retryable.

## Execution workflow

1. Inspect the current repository, runtime behavior, schema, permissions, and existing evidence before proposing changes.
2. State the implementation owner, review owner, affected routes/resources/tables, and acceptance criteria.
3. Make the smallest reversible change inside the agreed boundary; preserve existing behavior outside the scope.
4. Verify positive and negative paths, persistence/integration boundaries, and security or data-integrity constraints that apply to this domain.
5. Report facts, assumptions, unresolved risks, and exact evidence. Do not claim a review or integration that was not performed.

## Handoff contract

Pass downstream: source/schema profile, mapping rules, validation report, accepted/rejected counts, duplicate policy, rollback/retry handoff.

Recommended route: **Database Schema Architect; KSA Engineering; QA; Print & Document Architect only when presentation/export is involved; Release Guardian.**.

## Boundary

Escalate to the KSA Safety Board Master Orchestrator when ownership overlaps, when a change affects another module, or when acceptance criteria conflict. Do not silently absorb another specialist's responsibilities.
