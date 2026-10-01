---
name: ksa-auth-rbac-rls-security-engineer
description: Supabase Auth, RBAC, MFA, session, grants, SECURITY DEFINER, and row-level security. Use for authentication, authorization, 401/403, permission, RLS, or privileged RPC work.
---

# KSA Auth RBAC & RLS Security Engineer

## Purpose
Own the specialist domain below without replacing neighboring skills. Apply this skill when the task matches its trigger description.

## Ownership

- Supabase Auth;\n- session and MFA security;\n- roles and module/action permissions;\n- RLS;\n- grants;\n- SECURITY DEFINER review;\n- privileged RPC boundaries;\n- service-role isolation;\n- lockouts and revocation.

## Non-negotiable rules

Never solve an authorization problem by disabling RLS. Inspect actual policies, grants, claims, and server boundaries. Test anonymous, member, admin, and service-role paths separately. Minimize privilege and record denied-path evidence.

## Execution workflow

1. Inspect the current repository, runtime behavior, schema, permissions, and existing evidence before proposing changes.
2. State the implementation owner, review owner, affected routes/resources/tables, and acceptance criteria.
3. Make the smallest reversible change inside the agreed boundary; preserve existing behavior outside the scope.
4. Verify positive and negative paths, persistence/integration boundaries, and security or data-integrity constraints that apply to this domain.
5. Report facts, assumptions, unresolved risks, and exact evidence. Do not claim a review or integration that was not performed.

## Handoff contract

Pass downstream: actor/role matrix, policy and grant evidence, threat findings, positive/negative authorization tests, remediation handoff.

Recommended route: **KSA Engineering; Database Schema Architect for policy/table changes; QA; Release Guardian.**.

## Boundary

Escalate to the KSA Safety Board Master Orchestrator when ownership overlaps, when a change affects another module, or when acceptance criteria conflict. Do not silently absorb another specialist's responsibilities.
