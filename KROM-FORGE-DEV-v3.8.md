# KROM FORGE DEV v3.8 — Multi-Agent Engineering Council

v3.8 adds an evidence-driven engineering council on top of the v3.7 Autopilot.

## New tools
- `engineering_council_convene`
- `council_submit_opinion`
- `execution_consensus`
- `council_conflict_resolver`
- `engineering_council_status`

## Core behavior
The council selects required roles from Architect, Developer, QA, Security, Visual Designer, and DevOps according to task domain and risk.

Each specialist submits:
- recommendation
- risks
- evidence
- confidence score

The consensus engine uses task-aware role weighting and evidence instead of simple voting. Missing required roles block consensus. High-confidence dissent with unresolved risk creates a conflict and requires additional evidence before execution.

## Autopilot integration
`engineering_autopilot_start` now creates a council session automatically. Complex execution should resolve council consensus before broad or irreversible changes.

## State files
- `.krom/engineering-council.json`
- `.krom/engineering-council-history.json`

## Recommended pipeline
Prompt → Smart Context → Engineering Council → Execution Consensus → Impact Analysis → Task Graph → Adaptive Agent Runtime → Checkpoint → Implement → QA/Browser/Visual/Security → Autonomous Repair → Release Gate → Learning Memory.
