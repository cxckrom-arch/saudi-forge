# KROM FORGE DEV v34.5 — Provider API Routes Fix

Fixes the Provider Management 404 `Not Found` issue.

Added Fastify POST routes:
- `/ide/api/ai-control/credential`
- `/ide/api/ai-control/toggle`
- `/ide/api/ai-control/test`
- `/ide/api/ai-control/default`

These routes connect the existing v34.2 provider-management functions to the v34.4 server-rendered control center. API key values are accepted only for persistence in `.krom-secrets/provider-secrets.env` and are never returned by these routes.
