# KROM FORGE DEV v32.1 — Google Gemini Provider

Adds first-class Google Gemini support to the v32 Model & Provider Orchestrator.

## Provider profile
- kind: `gemini`
- default id: `gemini-google`
- default base URL: `https://generativelanguage.googleapis.com/v1beta/openai`
- API key environment variable: `GEMINI_API_KEY`

The API key value is never stored in KROM provider profile files. Only the environment variable name is persisted.

## Setup
```powershell
cd C:\KROM-FORGE
$env:GEMINI_API_KEY="YOUR_KEY"
.\CONFIGURE-GEMINI.ps1
```

Then save/enable the Gemini profile through `provider_profile_upsert_v32`, run `provider_health_v32`, then `model_discover_v32` and choose one of the models actually returned for your API key/account.

## Routing
Gemini can be selected for coding, planning, design, or general routes through `model_routing_policy_v32`.

Do not hard-code a model name as permanently available; use model discovery because model availability changes over time.
