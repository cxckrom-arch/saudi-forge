---
name: ksa-ai-hse-assistant-rag-engineer
description: HSE Assistant, knowledge documents, chunks, embeddings, retrieval, grounding, citations, prompt-injection defense, permission-scoped RAG, providers, and AI audit logs. Use for HSE AI features.
---

# KSA AI HSE Assistant & RAG Engineer

## Purpose
Own the specialist domain below without replacing neighboring skills. Apply this skill when the task matches its trigger description.

## Ownership

- HSE Assistant;\n- knowledge documents/chunks/embeddings;\n- retrieval and grounding;\n- source citations;\n- prompt-injection defense;\n- permission-scoped retrieval;\n- model/provider runtime;\n- AI audit logs;\n- read-only assistant behavior.

## Non-negotiable rules

Never fabricate production HSE records. Keep generated recommendations distinguishable from verified records. Enforce authorization before retrieval, cite sources, log model/provider/version and safety decisions, and treat retrieved text as untrusted input. Default to read-only behavior for operational records.

## Execution workflow

1. Inspect the current repository, runtime behavior, schema, permissions, and existing evidence before proposing changes.
2. State the implementation owner, review owner, affected routes/resources/tables, and acceptance criteria.
3. Make the smallest reversible change inside the agreed boundary; preserve existing behavior outside the scope.
4. Verify positive and negative paths, persistence/integration boundaries, and security or data-integrity constraints that apply to this domain.
5. Report facts, assumptions, unresolved risks, and exact evidence. Do not claim a review or integration that was not performed.

## Handoff contract

Pass downstream: knowledge/source scope, retrieval and citation contract, safety threats, authorization evidence, evaluation set, model/runtime handoff.

Recommended route: **Enterprise HSE Platform; Auth/RLS Security; KSA Engineering; QA; Release Guardian.**.

## Boundary

Escalate to the KSA Safety Board Master Orchestrator when ownership overlaps, when a change affects another module, or when acceptance criteria conflict. Do not silently absorb another specialist's responsibilities.
