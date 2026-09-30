# KROM FORGE DEV v33.0 — Adaptive Multi-Model Intelligence

Adds live provider benchmarking, historical reliability, smart task-aware routing, adaptive fallback, route explainability, and evidence-based quality benchmark planning.

## Key rules
- Availability/latency are measured from real provider endpoints.
- Answer-quality scores are never fabricated. Use `quality_benchmark_plan_v33` to define an evidence-based comparison.
- API keys are referenced through environment-variable names only.
- Gemini remains supported through the OpenAI-compatible Gemini endpoint configured in v32.1.

## New MCP tools
- `provider_benchmark_v33`
- `provider_reliability_v33`
- `smart_model_route_v33`
- `adaptive_fallback_v33`
- `route_explain_v33`
- `quality_benchmark_plan_v33`
- `model_intelligence_status_v33`

State is stored under `C:\KROM-FORGE\.krom\v33-model-intelligence` by default.
