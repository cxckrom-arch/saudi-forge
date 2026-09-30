# KROM FORGE DEV v3.4 — Smart Context & Decision Engine

v3.4 adds task-scoped context engineering on top of v3.3 Smart Code Intelligence.

## New tools

### smart_context_build
Builds a bounded task context using:
- task keywords and symbols
- dependency graph proximity
- reverse dependents
- routes/pages
- changed files from Precision Execution
- shared-code hotspots
- project memory
- configurable file and character budgets

It stores the latest context at `.krom/smart-context.json`.

### context_file_pack
Reads the selected context files into a bounded source pack. Large files are explicitly marked as truncated so an agent cannot safely edit unseen sections without reading them directly.

### decision_engine
Chooses an execution mode (`FOCUSED_CHANGE`, `REPAIR`, or `MULTI_PHASE_BUILD`), risk level, agent chain, mandatory pre-edit analysis, and post-edit gates from the actual task/context.

### context_gap_check
Blocks or warns before implementation when context is weak: no matching files, omitted high-risk files, unresolved local imports, or excessive missing dependency coverage.

## Recommended v3.4 flow
`User Prompt -> Smart Context -> Gap Check -> Decision Engine -> Impact Analysis -> Implement -> Regression Scope -> Live Browser/Visual checks when applicable -> Repair Loop -> Release Gate`

## Why this matters
Large codebases fail when agents either read too little and guess, or read too much and lose the important constraints. v3.4 keeps context focused and expands it through evidence rather than repository-wide dumping.
