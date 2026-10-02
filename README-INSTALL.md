# KSA FORGE DEV v36 — Tools & Automation

Start with `npm start`, then open `http://127.0.0.1:3001/ide/tools`. See [AUTOMATION-v36.md](AUTOMATION-v36.md) for MCP setup, scheduling, execution results, and verification.

---

# KSA FORGE DEV v35.0 — AI Control Center

Install to `C:\KSA-FORGE`, then run:

```powershell
cd C:\KSA-FORGE
Set-ExecutionPolicy -Scope Process -ExecutionPolicy Bypass -Force
Get-ChildItem "C:\KSA-FORGE" -Recurse -File | Unblock-File
npm install
npm run typecheck
.\START-SAUDI-FORGE.ps1
```

Open `http://127.0.0.1:3001/ide`. The AI Control Center is embedded in the IDE.

---

# KSA FORGE DEV v31.0 — Installation

Canonical Windows path: `C:\KSA-FORGE`

```powershell
cd C:\KSA-FORGE
.\BOOTSTRAP-SAUDI-FORGE.ps1 -InstallDependencies
.\START-SAUDI-FORGE.ps1
```

Diagnostics:

```powershell
.\DIAGNOSE-SAUDI-FORGE.ps1
```

Use another project without moving KSA Forge:

```powershell
.\START-SAUDI-FORGE.ps1 -ProjectRoot "C:\PATH\TO\PROJECT"
```

IDE: `http://127.0.0.1:3001/ide`  
MCP: `http://127.0.0.1:3001/mcp`

---

# SAUDI FORGE DEV v27.0

Current layer: Autonomous Full-Stack Feature Factory.

## SAUDI FORGE DEV v21.0

Includes Autonomous Verification & Release Intelligence.

## v14.0 — EXACT 1000 TOOLS

This package contains exactly 1000 registered MCP tools at runtime (500 prior + 500 v14).

# SAUDI FORGE DEV v13.0 — 500 Tools

This package contains exactly **500 unique MCP tools**.

# SAUDI FORGE TITAN v4

## New MCP tools

- project_map
- generate_project_spec
- architect_project
- create_full_platform
- create_feature
- analyze_error
- auto_repair
- project_memory
- dependency_audit
- security_scan
- release_certification

Plus all v3 tools.

## Install

Open PowerShell in the extracted bundle:

```powershell
Set-ExecutionPolicy -Scope Process Bypass
.\INSTALL-KROM-TITAN-v4.ps1
```

The installer backs up the current KROM configuration and automatically restores it if `npm run check` fails.

## Start

```powershell
cd C:\SAUDI-FORGE
$env:KROM_PROJECT_ROOT="C:\SAUDI-FORGE"
$env:KROM_HOME="C:\SAUDI-FORGE"
$env:PORT="3001"
npm run dev
```

## Recommended first calls

1. `krom_prompt_health`
2. `project_map`
3. `project_memory` with action=`list`
4. `dependency_audit`
5. `security_scan`
6. `release_certification`

## Important

`create_full_platform` and `create_feature` create persistent execution work orders. They do not falsely claim code exists. The AI host should then inspect, write/patch code, run tests and certify evidence.

## Prompt Studio v2.2

SAUDI FORGE DEV now includes a dedicated prompt-engineering toolset:

- `build_prompt` — create a structured professional software prompt.
- `improve_prompt` — upgrade a rough prompt without dropping original requirements.
- `prompt_from_project` — inspect the active project and generate a stack-aware prompt.
- `prompt_quality_check` — score a prompt for objective, context, requirements, constraints, workflow, verification and definition-of-done coverage.
- `prompt_library` — save, list, read and delete reusable prompts under `.krom-prompts/`.

### Recommended workflow

1. Call `prompt_from_project` when the prompt targets the current repository.
2. Call `prompt_quality_check` on important prompts.
3. Use `improve_prompt` if the score is weak or if the original request is unstructured.
4. Save approved prompts with `prompt_library`.

See `PROMPT-STUDIO.md` for examples.

## v2.3 Precision Execution
For implementation prompts, call `start_precise_execution` first and `execution_audit` before completion. See `PRECISION-EXECUTION.md`.

## v2.4 UI Design Director

This package includes Prompt Studio + Precision Execution + UI/UX Design Director.
See `UI-DESIGN-DIRECTOR-v2.4.md` for usage.

## v2.5 Visual Designer workflow

For UI tasks use this sequence:

1. `design_ui_prompt`
2. `start_precise_execution`
3. implement the UI
4. `visual_designer_agent`
5. `visual_review`
6. if revision is required: `visual_iteration_plan` and apply fixes
7. repeat `visual_review` until approved
8. `execution_audit`

The default visual approval gate is 90/100 with no unresolved major/critical visual issues.

## v3.0 Autonomous Engineering Tools
After starting the MCP server, use `master_orchestrator` for substantial tasks, then `start_precise_execution`. For UI work use the UI Design Director + Visual Designer flow. Use `browser_test` only for real configured E2E scripts, and finish with `execution_audit` plus `release_gate_v3`.

Persistent KROM state is stored inside the target project under `.krom/` and `.krom-execution/`.


## v3.1 Live Browser Vision
For real rendered UI verification, install Playwright in the target project:

```powershell
npm install -D playwright
npx playwright install chromium
```

Then start the target application and call `live_browser_vision` with its local URL (for example `http://127.0.0.1:5173`). After fixes, run `release_gate_v31`.


## v3.2 Autonomous Repair
Use `autonomous_repair_begin`, fix the reported root causes, then call `autonomous_repair_verify` until PASS. The loop stops on repeated fingerprints or max iterations rather than retrying forever.

## v3.3 Smart Code Intelligence

After connecting the MCP server, run `code_intelligence_scan` once for a project. Before modifying a shared file/component/service, run `impact_analysis`. After implementation, run `regression_scope` before the normal browser and release gates.

## v3.4 Smart Context & Decision Engine
For a new task, prefer this order:
1. `smart_context_build`
2. `context_gap_check`
3. `decision_engine`
4. `impact_analysis` for shared/high-risk files
5. implement changes
6. `regression_scope`
7. relevant browser/visual/repair checks
8. `release_gate_v31`

This keeps model context focused and prevents broad edits based on filename guesses.

## v3.5 Adaptive Agent Runtime
New MCP tools: `task_decomposition_graph`, `task_graph_update`, `adaptive_agent_route`, `runtime_outcome`, `adaptive_runtime_status`.

## v3.6 Self-Improving Engineering Memory

New MCP tools:
- learning_memory_record
- learning_memory_recall
- decision_confidence
- adaptive_strategy_advisor
- learning_memory_status

State files are stored under `.krom/` in the target project. Use `adaptive_strategy_advisor` before broad work and record verified outcomes with `learning_memory_record` after completion.

## v3.8 Engineering Council
New persisted files under `.krom/`:
- `engineering-council.json`
- `engineering-council-history.json`

The v3.8 council tools are registered in `server.ts` and require the same MCP/Zod/Node dependencies as the existing server.

## v3.9 Predictive Engineering
For broad or risky edits, prefer this sequence:
1. `change_simulation`
2. `risk_forecast`
3. `preflight_gate`
4. `change_plan`
5. implementation + existing regression/browser/visual verification
6. release gate

`engineering_autopilot_start` performs the simulation and preflight automatically.


# v5.0 Autonomous Engineering Suite

New v5 tools:
- model_router_v5
- diagnostics_intelligence_v5
- api_contract_intelligence_v5
- database_architect_v5
- security_auditor_v5
- performance_intelligence_v5
- accessibility_auditor_v5
- git_regression_guardian_v5
- engineering_task_board_v5
- engineering_suite_gate_v5

See `SAUDI-FORGE-DEV-v5.0.md`.


## v6.0 Developer IDE Core

New IDE tools include live diagnostics, error markers, smart file explorer, workspace search, diff editor, controlled package-script terminal execution, plugin/MCP metadata management, refactor planning, execution stream, consolidated workspace state, and IDE release gate.

For full TypeScript validation install the project's original dependencies, including MCP SDK, Zod and Node typings.


## v7.0 Visual IDE
After KROM starts, open:

```text
http://127.0.0.1:<PORT>/ide
```

The Visual IDE reads real workspace state from `/ide/api/state`. Code mutation remains behind MCP tools and gates.

## v8.0 Full AI Coding Workbench

After starting SAUDI FORGE DEV, open:

```text
http://127.0.0.1:<PORT>/ide
```

v8 adds a working editor shell with Explorer, Monaco (when CDN access is available), local fallback editor, Save, Undo/Redo, Problems, Preview, Execution Stream, active-file AI context, package-script terminal execution and explicit-file Git commit tooling.

Recommended flow:

1. `workbench_state_v8`
2. `editor_open_file_v8`
3. `impact_analysis` for shared/high-risk code
4. `apply_patch_v8` or `editor_save_file_v8`
5. `editor_problems_v8`
6. `regression_scope`
7. Browser / Visual / Security gates as applicable
8. `workbench_gate_v8`
9. Deep release gates before deployment

## v9.0 Engineering Operations Workbench

New tools include managed runtime processes, Test Explorer, logs, API/DB panels, environment audit, extension scaffolding, dependency doctor, project health and Release Center.

For full type checking, ensure the original project dependencies are installed, including the MCP SDK, Zod and Node type definitions required by `server.ts`.

## v10.0 Autonomous Software Factory

After the existing installation is working, v10 tools are automatically exposed by the MCP server. Recommended first run for a new feature:

1. `spec_to_code_pipeline_v10`
2. `architecture_graph_v10`
3. `quality_budget_v10`
4. existing Autopilot / Council / Smart Context flow
5. `e2e_scenario_generator_v10`
6. `cicd_orchestrator_v10`
7. `release_notes_generator_v10`
8. existing Release Center + release gates

For database changes, run `migration_planner_v10` before implementation.

## v11.0 Reliability and Delivery

New tools include Observability Center, Failure Replay, Resilience Lab, Contract Test Planner, Feature Flags, Deployment Strategy, Rollback Plan, SLO Gate, Dependency Risk Monitor, Data Integrity Guard, and Production Readiness Review.

Recommended final sequence:
`software_factory_status_v10 -> production_readiness_review_v11 -> deployment_strategy_v11 -> slo_release_gate_v11`


## v12.0 MEGA 100 Expansion

Use `mega_100_status_v12` to confirm the layer is available. Run `mega_100_audit_v12` for a complete static engineering audit or pass selected categories for a focused review. Individual capability tools are listed in `SAUDI-FORGE-DEV-v12.0.md`. Reports are stored under `.krom/v12-batches/`.

## v15.0 — 5000-tool registry
This build adds 4000 generated MCP capabilities on top of the 1000-tool v14 baseline.
The new tools are generated from 40 engineering domains x 100 operations and registered individually at startup.
See `TOOL-MANIFEST-v15.0.json` and `VALIDATION-v15.0.txt`.


## v16.0 Intelligent Tool Router
Use `router_status_v16` first, then `intelligent_tool_router_v16` or `execution_recipe_v16` for broad tasks. The router indexes the 5000-tool catalog and returns a small ranked set instead of flooding the agent with all tools.


## v17.0 Adaptive Workflow Compiler
See `SAUDI-FORGE-DEV-v17.0.md`.

## v18.0 Verified Autonomous Executor
v18 adds receipt-backed execution and false-PASS protection. For long tasks, start with `verified_execution_start_v18`, record every step through `execution_receipt_v18`, and finish only after `verified_release_gate_v18` returns PASS.


## v20.0 add-on
Self-Healing Architecture & Migration Engine is included. See SAUDI-FORGE-DEV-v20.0.md.

## v22 Quality Governance

After starting SAUDI FORGE DEV, initialize governance once with `quality_policy_init_v22`, then use `governance_gate_v22` before a governed release decision. Set `KROM_CHANGE_FREEZE=true` to block high/critical changes during a freeze window.

## v23.0 Architecture Evolution

New architecture/debt reports are written to `.krom/v23-architecture-evolution/`.
Use `architecture_evolution_decision_v23` only after reviewing the v22 governance result and v23 fitness findings.

## Default Windows location

This build is configured for `C:\SAUDI-FORGE`. `START-SAUDI-FORGE.ps1` sets `KROM_HOME` to that path and uses it as `KROM_PROJECT_ROOT` unless you already supplied a different `KROM_PROJECT_ROOT`. The launcher falls back to its own extracted folder if `C:\SAUDI-FORGE` does not exist.

To target another repository for the current PowerShell session:

```powershell
.\SET-KROM-PROJECT.ps1 -ProjectPath "C:\path\to\project"
.\START-SAUDI-FORGE.ps1
```

## v32 Model & Provider Orchestrator
Provider configuration is stored under `C:\SAUDI-FORGE\.krom\v32-providers`. API key values are never stored in provider profiles; configure only the environment-variable name. Default local endpoints are Ollama `http://127.0.0.1:11434` and GPT4All `http://127.0.0.1:4891`.


## v33 Adaptive Multi-Model Intelligence
After bootstrap/start, use `provider_benchmark_v33` to measure endpoint health/latency, then `smart_model_route_v33` to select a provider for the task. Use `route_explain_v33` to inspect the routing decision. Gemini remains available through the `gemini-google` provider profile from v32.1.
