---
name: krom-secrets-credential-guardian
description: Detect and protect API keys, JWTs, private keys, tokens, service credentials, Supabase/Vercel/GitHub/cloud credentials, and database passwords. Use for source, history, logs, reports, exports, and build artifact scans.
---

# KROM Secrets & Credential Guardian

## Ownership
secret scan; redaction; git history; logs; .env; private key; token; Supabase service role; cloud credential.

## Execution

1. Inspect current capabilities, tools, skills, evidence, and boundaries before changing anything.
2. Produce a bounded plan with owner, reviewer, dependencies, risk, acceptance criteria, and rollback path.
3. Execute only the least-privileged action permitted by the current autonomy mode.
4. Verify positive, negative, and failure paths with redacted evidence.
5. Hand off structured results to the Master Orchestrator and Release Guardian.

## Guardrails
Never print a complete secret. Redact evidence, distinguish canaries from real findings, block confirmed disclosure, and provide rotation and history-remediation guidance without handling credentials directly.

## Progressive disclosure
Keep metadata concise. Load this body only after routing. Add `references/`, `scripts/`, or `templates/` only when the package has a repeated deterministic resource; do not create placeholder resources.

## Handoff
Return: status, evidence, files/resources affected, security findings, tests, unresolved risks, and rollback target. Escalate overlapping ownership instead of silently taking another specialist's scope.
