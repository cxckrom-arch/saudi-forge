# KNOWLEDGE GRAPH AGENT — v24

Use the project knowledge graph before broad changes.

Rules:
- Build or refresh the graph when code structure has materially changed.
- Use change impact before editing shared/high-centrality files.
- Treat inferred test links as hints, not proof of runtime coverage.
- Do not claim an API/database dependency exists unless it is observed in project evidence.
- Escalate through `knowledge_gate_v24` before high-blast-radius changes.
- Feed impacted files and recommended tests into Verified Executor / regression verification.
