# KROM FORGE DEV v9.0 — Engineering Operations Workbench

Major multi-batch upgrade over v8.0.

## Added
- Runtime Process Manager for declared package scripts.
- IDE Test Explorer inventory.
- Debug & Log Center for KROM-managed processes.
- API Inspector for client calls and route handlers.
- Database Panel for SQL/Supabase inventory.
- Environment & Secrets Manager with mandatory redaction.
- Local Extension SDK manifest scaffolding.
- Persistent Workspace Profiles.
- Dependency Doctor.
- Project Health Dashboard.
- Release Center aggregation.

## Safety / correctness rules
- Arbitrary shell strings are not accepted by Runtime Process Manager.
- Secrets are never returned; only key names and presence status are exposed.
- Extensions are scaffolded but never automatically executed.
- Release Center does not replace deeper browser/security/product gates.
