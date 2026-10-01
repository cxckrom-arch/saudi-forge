# Release and Module Verification Checklist

Use this as a risk-based checklist, not a requirement to run every item for every small change. Mark each item **PASS**, **FAIL**, **NOT TESTED**, or **N/A** and retain concrete evidence. For N/A or NOT TESTED, give a reason. Never turn missing evidence into PASS.

## Project inspection inventory

- Stack/framework, package manager, dependencies, scripts, type/lint/build settings.
- Environment-variable names/configuration (never print secret values).
- Frontend routes/modules/state/shared components; backend routes/services.
- Authentication, authorization, object scope, database schema/migrations, storage.
- Tests, deployment/Docker, runtime logs, health checks, Git branch/dirty files/recent changes.
- Known failures, risks, critical user journeys, data invariants, source of truth.

## Feature and module matrix

| Area | Verify |
|---|---|
| Data | Correct model/source of truth; constraints; transactions; persistence after refresh; safe migration |
| API | Method/path/payload/response/error contract; validation; pagination/filtering/sorting; no mutation over GET |
| Authentication | Signed-in/out behavior; session/token expiry, logout/invalidation; secure production flow |
| Permissions | Server-side permission and object-level scope; direct unauthorized API request rejected |
| Workflow | Valid lifecycle transitions succeed; invalid transitions fail server-side |
| UI | Loading, disabled/duplicate submit, validation, success/error, empty state, edit/cancel/unsaved changes |
| Audit/notifications | Required events recorded; notifications go only to intended recipients |
| Uploads | Type/MIME/extension/size/name/path checks; protected retrieval; persistence and backup |
| Search/data scale | Partial/exact, Arabic/English where relevant, no results, backend filtering, pagination |
| Responsive/RTL/print | Actual viewport inspection; nav/forms/tables/dialogs; Arabic direction and spacing; print preview when relevant |
| Tests | Unit, integration, negative/security, critical E2E, build/type/lint as available |

A critical failed item means the module is not complete. Any item skipped because tools, access, credentials, or fixtures are unavailable remains NOT TESTED/BLOCKED.

## Security and reliability audit

- No credentials/secrets in frontend, repository, logs, or error responses; required environment variables fail fast at startup.
- Sensitive permissions are backend-enforced; check object-level authorization and tenant/site/ownership isolation.
- Validate inputs and file uploads; review SQL injection, XSS, CSRF where applicable, CORS, cookies, rate limiting, dependency advisories.
- Never swallow errors or return success without completing the operation. Keep production APIs connected to real behavior, not stale mocks.
- Make retryable operations idempotent; background jobs need retry/failure handling and structured logs.
- Review query count/N+1, indexes, repeated requests, large payloads/bundles, and caching behavior if introduced.
- Include request/correlation IDs and actionable logs without passwords, tokens, or secrets. Health/readiness endpoints disclose no secrets and reflect critical dependencies.

## Runtime and release evidence

Capture actual evidence for relevant gates:

1. **Build:** install/typecheck/lint/tests/build commands and exit results.
2. **Runtime:** app startup, critical DB/dependency connectivity, auth, routes, APIs, primary flows.
3. **Persistence:** create/update, refresh/reopen, and confirm durable state; check related transactional/audit records.
4. **Security:** permission/negative tests and applicable configuration review.
5. **Regression:** original defect no longer reproducible; neighboring flows still work.
6. **Deployment:** migration command/order, readiness and startup dependencies, persistent volumes where applicable.
7. **Recovery:** database and uploaded-file backup coverage, retention, and a restore procedure/test on a safe environment.
8. **Rollback:** current and target versions, rollback point, migration compatibility, data/file implications.
9. **Operations:** structured logs, health/readiness, alert/monitor plan for critical services.

Do not claim READY if a critical gate lacks positive evidence. Backups without a restore test are incomplete evidence. For production data changes, require an approved plan and backup before destructive actions.

## Post-fix proof

- Re-run the original failing reproduction and retain the outcome.
- Run focused tests for the fix, then relevant neighboring actions, permissions, views, and print/export workflows.
- Inspect application logs, browser console, failed network resources, status/method/payload, duplicate requests, and user-visible error handling where applicable.
- State what could not be verified and why.
