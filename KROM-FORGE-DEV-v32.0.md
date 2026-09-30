# KROM FORGE DEV v32.0 — Model & Provider Orchestrator

Default home: `C:\KROM-FORGE`.

## Added
- Provider profiles for Ollama, GPT4All, OpenAI-compatible, and custom endpoints.
- Secret-safe configuration: profiles persist only the environment variable name, never the API key value.
- Provider health checks and model discovery.
- Per-task routing policies: coding, planning, general, design.
- Health-aware fallback chain.
- Model selection stored in `.krom/v32-providers/`.

## Default local profiles
- Ollama: `http://127.0.0.1:11434` (enabled)
- GPT4All: `http://127.0.0.1:4891` (disabled until enabled)

## State
`C:\KROM-FORGE\.krom\v32-providers\`
