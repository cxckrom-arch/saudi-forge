import fs from "node:fs/promises";
import path from "node:path";
import * as z from "zod/v4";

export function registerV16V20Tools(server: any, deps: any) {
  const {
    result,
    errorResult,
    projectRoot: PROJECT_ROOT,
    v160StateDir: V160_STATE_DIR,
    v170StateDir: V170_STATE_DIR,
    v160CapabilityGraph,
    v160ComposeWorkflow,
    v160DomainHealth,
    v160LoadCatalog,
    v160RecordUsage,
    v160RiskPolicy,
    v160Route,
    v160Search,
    v160UsageTelemetry,
    v170Compile,
    v170Gate,
    v170Optimize,
    v170Record,
    v170Replan,
    v170Telemetry,
    v180Compare,
    v180FalsePassScan,
    v180InvariantGate,
    v180RecordReceipt,
    v180ReleaseGate,
    v180SafeResume,
    v180Start,
    v180Status,
    v180StepBegin,
    v180ValidateEvidence,
    v190ApplyGuard,
    v190Checkpoint,
    v190DeadCodeAudit,
    v190DependencyGraph,
    v190DependencyRiskMap,
    v190DependencyUpgradePlan,
    v190DuplicateAudit,
    v190RefactorPlan,
    v190RegressionPlan,
    v190RollbackPlan,
    v190Status,
    v190Verify,
    v200ApiCompatibilityGate,
    v200ArchitectureDriftScan,
    v200BreakingChangeForecast,
    v200MigrationCompatibilityMatrix,
    v200MigrationExecutionContract,
    v200MigrationPreflight,
    v200PostMigrationVerify,
    v200RepairProposal,
    v200RollforwardRollbackPlan,
    v200SafeMigrationPlan,
    v200SchemaCompatibilityGate,
    v200SelfHealingStatus
  } = deps;

// ===== v16.0 INTELLIGENT TOOL ROUTER REGISTRATION =====
  server.registerTool("tool_search_v16",{title:"Tool Search v16",description:"Search and rank the 5000-tool catalog for a task.",inputSchema:z.object({query:z.string(),limit:z.number().int().min(1).max(50).default(12),domain:z.string().optional(),maxRisk:z.enum(["LOW","MEDIUM","HIGH"]).default("HIGH")}),annotations:{readOnlyHint:true,openWorldHint:false}},async({query,limit,domain,maxRisk})=>{try{return result(JSON.stringify(await v160Search(query,limit,domain,maxRisk),null,2));}catch(e){return errorResult(e);}});
  server.registerTool("intelligent_tool_router_v16",{title:"Intelligent Tool Router v16",description:"Select a small evidence-oriented tool set for a task instead of exposing thousands of choices.",inputSchema:z.object({task:z.string(),maxTools:z.number().int().min(1).max(12).default(6),allowHighRisk:z.boolean().default(false)}),annotations:{readOnlyHint:true,openWorldHint:false}},async({task,maxTools,allowHighRisk})=>{try{return result(JSON.stringify(await v160Route(task,maxTools,allowHighRisk),null,2));}catch(e){return errorResult(e);}});
  server.registerTool("capability_graph_v16",{title:"Capability Graph v16",description:"Create a recommended dependency-aware capability sequence for a task.",inputSchema:z.object({task:z.string()}),annotations:{readOnlyHint:true,openWorldHint:false}},async({task})=>{try{return result(JSON.stringify(await v160CapabilityGraph(task),null,2));}catch(e){return errorResult(e);}});
  server.registerTool("workflow_compose_v16",{title:"Workflow Composer v16",description:"Compose a bounded execution workflow around selected capabilities and verification gates.",inputSchema:z.object({task:z.string(),strict:z.boolean().default(true)}),annotations:{readOnlyHint:true,openWorldHint:false}},async({task,strict})=>{try{return result(JSON.stringify(await v160ComposeWorkflow(task,strict),null,2));}catch(e){return errorResult(e);}});
  server.registerTool("tool_risk_policy_v16",{title:"Tool Risk Policy v16",description:"Assess proposed tools and determine checkpoint/evidence requirements.",inputSchema:z.object({tools:z.array(z.string()).min(1).max(50)}),annotations:{readOnlyHint:true,openWorldHint:false}},async({tools})=>{try{return result(JSON.stringify(await v160RiskPolicy(tools),null,2));}catch(e){return errorResult(e);}});
  server.registerTool("tool_usage_record_v16",{title:"Tool Usage Record v16",description:"Record evidence-backed tool outcomes for routing telemetry.",inputSchema:z.object({tool:z.string(),outcome:z.enum(["success","failure","blocked"]),task:z.string().optional(),evidence:z.string().optional()}),annotations:{readOnlyHint:false,openWorldHint:false}},async(args)=>{try{return result(JSON.stringify(await v160RecordUsage(args.tool,args.outcome,args.task,args.evidence),null,2));}catch(e){return errorResult(e);}});
  server.registerTool("tool_usage_telemetry_v16",{title:"Tool Usage Telemetry v16",description:"Summarize recent success, failure, and blocked tool outcomes without exposing secrets.",inputSchema:z.object({limit:z.number().int().min(1).max(1000).default(100)}),annotations:{readOnlyHint:true,openWorldHint:false}},async({limit})=>{try{return result(JSON.stringify(await v160UsageTelemetry(limit),null,2));}catch(e){return errorResult(e);}});
  server.registerTool("domain_health_v16",{title:"Capability Domain Health v16",description:"Summarize catalog coverage and risk distribution by domain.",inputSchema:z.object({}),annotations:{readOnlyHint:true,openWorldHint:false}},async()=>{try{return result(JSON.stringify(await v160DomainHealth(),null,2));}catch(e){return errorResult(e);}});
  server.registerTool("execution_recipe_v16",{title:"Execution Recipe v16",description:"Generate a compact actionable recipe using routing, risk policy, and verification gates.",inputSchema:z.object({task:z.string()}),annotations:{readOnlyHint:true,openWorldHint:false}},async({task})=>{try{const route=await v160Route(task,6,false);const risk=await v160RiskPolicy(route.selected.map((x:any)=>x.name));const workflow=await v160ComposeWorkflow(task,true);return result(JSON.stringify({task,route,risk,workflow},null,2));}catch(e){return errorResult(e);}});
  server.registerTool("router_status_v16",{title:"Router Status v16",description:"Validate catalog availability and v16 router readiness.",inputSchema:z.object({}),annotations:{readOnlyHint:true,openWorldHint:false}},async()=>{try{const c=await v160LoadCatalog();return result(JSON.stringify({version:"16.0.0",catalogTools:c.tools.length,catalogVersion:c.version,ready:c.tools.length>=4000,stateDir:path.relative(PROJECT_ROOT,V160_STATE_DIR)},null,2));}catch(e){return errorResult(e);}});
  // ===== END v16.0 TOOL ROUTER REGISTRATION =====

  // ===== v17.0 ADAPTIVE WORKFLOW COMPILER REGISTRATION =====
  server.registerTool("workflow_compile_v17",{title:"Workflow Compiler v17",description:"Compile a prompt into a bounded evidence-driven execution workflow.",inputSchema:z.object({task:z.string(),strict:z.boolean().default(true)}),annotations:{readOnlyHint:true,openWorldHint:false}},async({task,strict})=>{try{return result(JSON.stringify(await v170Compile(task,strict),null,2));}catch(e){return errorResult(e);}});
  server.registerTool("workflow_optimize_v17",{title:"Workflow Optimizer v17",description:"Reduce redundant tool usage and estimate workflow risk cost.",inputSchema:z.object({task:z.string()}),annotations:{readOnlyHint:true,openWorldHint:false}},async({task})=>{try{return result(JSON.stringify(await v170Optimize(task),null,2));}catch(e){return errorResult(e);}});
  server.registerTool("workflow_replan_v17",{title:"Adaptive Workflow Replanner v17",description:"Rebuild a workflow after a failed step using alternate capabilities.",inputSchema:z.object({task:z.string(),failedStep:z.string(),failure:z.string()}),annotations:{readOnlyHint:true,openWorldHint:false}},async({task,failedStep,failure})=>{try{return result(JSON.stringify(await v170Replan(task,failedStep,failure),null,2));}catch(e){return errorResult(e);}});
  server.registerTool("workflow_gate_v17",{title:"Workflow Safety Gate v17",description:"Validate a compiled workflow before execution.",inputSchema:z.object({task:z.string()}),annotations:{readOnlyHint:true,openWorldHint:false}},async({task})=>{try{return result(JSON.stringify(await v170Gate(task),null,2));}catch(e){return errorResult(e);}});
  server.registerTool("workflow_outcome_record_v17",{title:"Workflow Outcome Record v17",description:"Record evidence-backed workflow outcomes for adaptive optimization.",inputSchema:z.object({task:z.string(),status:z.enum(["success","failure","blocked"]),details:z.string().optional()}),annotations:{readOnlyHint:false,openWorldHint:false}},async({task,status,details})=>{try{return result(JSON.stringify(await v170Record(task,status,details),null,2));}catch(e){return errorResult(e);}});
  server.registerTool("workflow_telemetry_v17",{title:"Workflow Telemetry v17",description:"Summarize workflow success/failure history.",inputSchema:z.object({}),annotations:{readOnlyHint:true,openWorldHint:false}},async()=>{try{return result(JSON.stringify(await v170Telemetry(),null,2));}catch(e){return errorResult(e);}});
  server.registerTool("minimal_toolset_v17",{title:"Minimal Toolset Selector v17",description:"Return the smallest practical toolset for a task.",inputSchema:z.object({task:z.string(),maxTools:z.number().int().min(2).max(12).default(6)}),annotations:{readOnlyHint:true,openWorldHint:false}},async({task,maxTools})=>{try{const r:any=await v160Route(task,maxTools,false);return result(JSON.stringify({task,tools:(r.selected||[]).slice(0,maxTools),principle:"minimum sufficient capability set"},null,2));}catch(e){return errorResult(e);}});
  server.registerTool("workflow_evidence_map_v17",{title:"Workflow Evidence Map v17",description:"Map every workflow step to required verification evidence.",inputSchema:z.object({task:z.string()}),annotations:{readOnlyHint:true,openWorldHint:false}},async({task})=>{try{const p:any=await v170Compile(task,true);return result(JSON.stringify({task,evidence:p.steps.map((s:any)=>({step:s.id,tool:s.tool,required:s.verification}))},null,2));}catch(e){return errorResult(e);}});
  server.registerTool("workflow_checkpoint_plan_v17",{title:"Workflow Checkpoint Plan v17",description:"Determine where checkpoints are needed before risky changes.",inputSchema:z.object({task:z.string()}),annotations:{readOnlyHint:true,openWorldHint:false}},async({task})=>{try{const p:any=await v170Compile(task,true);return result(JSON.stringify({task,checkpoints:p.steps.filter((s:any)=>s.risk==='HIGH'||s.risk==='MEDIUM').map((s:any)=>({before:s.id,tool:s.tool,risk:s.risk}))},null,2));}catch(e){return errorResult(e);}});
  server.registerTool("workflow_status_v17",{title:"Adaptive Workflow Status v17",description:"Read the latest compiled workflow and runtime telemetry.",inputSchema:z.object({}),annotations:{readOnlyHint:true,openWorldHint:false}},async()=>{try{let latest:any=null;try{latest=JSON.parse(await fs.readFile(path.join(V170_STATE_DIR,'latest-plan.json'),'utf8'));}catch{}return result(JSON.stringify({version:'17.0.0',latest,telemetry:await v170Telemetry()},null,2));}catch(e){return errorResult(e);}});
  // ===== END v17.0 REGISTRATION =====

  // ===== v18.0 VERIFIED AUTONOMOUS EXECUTOR REGISTRATION =====
  server.registerTool("verified_execution_start_v18",{title:"Verified Execution Start v18",description:"Compile a workflow into a receipt-backed execution run where every passing step requires evidence.",inputSchema:z.object({task:z.string().min(3),strict:z.boolean().default(true)}),annotations:{readOnlyHint:false,openWorldHint:false}},async({task,strict})=>{try{return result(JSON.stringify(await v180Start(task,strict),null,2));}catch(e){return errorResult(e);}});
  server.registerTool("execution_step_begin_v18",{title:"Execution Step Begin v18",description:"Start a workflow step only after its verified dependencies have passed.",inputSchema:z.object({stepId:z.string()}),annotations:{readOnlyHint:false,openWorldHint:false}},async({stepId})=>{try{return result(JSON.stringify(await v180StepBegin(stepId),null,2));}catch(e){return errorResult(e);}});
  server.registerTool("execution_receipt_v18",{title:"Execution Receipt v18",description:"Record the actual result and evidence for a step. PASS is rejected when evidence is empty.",inputSchema:z.object({stepId:z.string(),status:z.enum(["passed","failed","blocked"]),actual:z.string().default(""),evidence:z.array(z.string()).default([])}),annotations:{readOnlyHint:false,openWorldHint:false}},async({stepId,status,actual,evidence})=>{try{return result(JSON.stringify(await v180RecordReceipt(stepId,status,actual,evidence),null,2));}catch(e){return errorResult(e);}});
  server.registerTool("evidence_validator_v18",{title:"Evidence Validator v18",description:"Validate execution receipts and flag missing or suspicious evidence.",inputSchema:z.object({stepId:z.string().optional()}),annotations:{readOnlyHint:true,openWorldHint:false}},async({stepId})=>{try{return result(JSON.stringify(await v180ValidateEvidence(stepId),null,2));}catch(e){return errorResult(e);}});
  server.registerTool("outcome_comparator_v18",{title:"Outcome Comparator v18",description:"Compare expected and actual outcomes using exact, contains, regex, or nonempty verification.",inputSchema:z.object({expected:z.string(),actual:z.string(),mode:z.enum(["exact","contains","regex","nonempty"]).default("contains")}),annotations:{readOnlyHint:true,openWorldHint:false}},async({expected,actual,mode})=>{try{return result(JSON.stringify(await v180Compare(expected,actual,mode),null,2));}catch(e){return errorResult(e);}});
  server.registerTool("false_pass_detector_v18",{title:"False PASS Detector v18",description:"Detect steps marked PASS whose evidence contains failure signals or no evidence.",inputSchema:z.object({}),annotations:{readOnlyHint:false,openWorldHint:false}},async()=>{try{return result(JSON.stringify(await v180FalsePassScan(),null,2));}catch(e){return errorResult(e);}});
  server.registerTool("safe_resume_v18",{title:"Safe Resume v18",description:"Resume an interrupted execution from the first unverified step without skipping failures.",inputSchema:z.object({}),annotations:{readOnlyHint:true,openWorldHint:false}},async()=>{try{return result(JSON.stringify(await v180SafeResume(),null,2));}catch(e){return errorResult(e);}});
  server.registerTool("execution_invariant_gate_v18",{title:"Execution Invariant Gate v18",description:"Enforce evidence validity, false-pass protection, and high-risk verification before release.",inputSchema:z.object({}),annotations:{readOnlyHint:false,openWorldHint:false}},async()=>{try{return result(JSON.stringify(await v180InvariantGate(),null,2));}catch(e){return errorResult(e);}});
  server.registerTool("verified_release_gate_v18",{title:"Verified Release Gate v18",description:"Mark a run complete only when every step has passed with valid evidence and invariants hold.",inputSchema:z.object({}),annotations:{readOnlyHint:false,openWorldHint:false}},async()=>{try{return result(JSON.stringify(await v180ReleaseGate(),null,2));}catch(e){return errorResult(e);}});
  server.registerTool("verified_execution_status_v18",{title:"Verified Execution Status v18",description:"Show verified run progress, receipt counts, quality signals, and safe resume point.",inputSchema:z.object({}),annotations:{readOnlyHint:true,openWorldHint:false}},async()=>{try{return result(JSON.stringify(await v180Status(),null,2));}catch(e){return errorResult(e);}});
  // ===== END v18.0 REGISTRATION =====

  // ===== v19.0 AUTONOMOUS REFACTORING & DEPENDENCY INTELLIGENCE REGISTRATION =====
  server.registerTool("refactor_dependency_graph_v19",{title:"Refactor Dependency Graph v19",description:"Map dependency hotspots and blast-radius risk before structural changes.",inputSchema:z.object({refresh:z.boolean().default(false)}),annotations:{readOnlyHint:true,openWorldHint:false}},async({refresh})=>{try{return result(JSON.stringify(await v190DependencyGraph(refresh),null,2));}catch(e){return errorResult(e);}});
  server.registerTool("refactor_plan_v19",{title:"Safe Refactor Plan v19",description:"Create a dependency-aware staged refactor plan for explicit target files.",inputSchema:z.object({files:z.array(z.string()).min(1).max(100),goal:z.string().min(3)}),annotations:{readOnlyHint:true,openWorldHint:false}},async({files,goal})=>{try{return result(JSON.stringify(await v190RefactorPlan(files,goal),null,2));}catch(e){return errorResult(e);}});
  server.registerTool("dead_code_audit_v19",{title:"Dead Code Audit v19",description:"Find likely unreferenced code candidates without deleting anything.",inputSchema:z.object({maxFiles:z.number().int().min(50).max(5000).default(2500)}),annotations:{readOnlyHint:true,openWorldHint:false}},async({maxFiles})=>{try{return result(JSON.stringify(await v190DeadCodeAudit(maxFiles),null,2));}catch(e){return errorResult(e);}});
  server.registerTool("duplicate_logic_audit_v19",{title:"Duplicate Logic Audit v19",description:"Find heuristic duplicate implementation candidates for consolidation review.",inputSchema:z.object({maxFiles:z.number().int().min(50).max(3000).default(1500)}),annotations:{readOnlyHint:true,openWorldHint:false}},async({maxFiles})=>{try{return result(JSON.stringify(await v190DuplicateAudit(maxFiles),null,2));}catch(e){return errorResult(e);}});
  server.registerTool("dependency_upgrade_plan_v19",{title:"Dependency Upgrade Plan v19",description:"Build a risk-aware dependency upgrade plan without changing versions.",inputSchema:z.object({}),annotations:{readOnlyHint:true,openWorldHint:false}},async()=>{try{return result(JSON.stringify(await v190DependencyUpgradePlan(),null,2));}catch(e){return errorResult(e);}});
  server.registerTool("dependency_risk_map_v19",{title:"Dependency Risk Map v19",description:"Classify dependency upgrade risk and required verification gates.",inputSchema:z.object({}),annotations:{readOnlyHint:true,openWorldHint:false}},async()=>{try{return result(JSON.stringify(await v190DependencyRiskMap(),null,2));}catch(e){return errorResult(e);}});
  server.registerTool("safe_refactor_checkpoint_v19",{title:"Safe Refactor Checkpoint v19",description:"Capture Git status and diff evidence before a structural change.",inputSchema:z.object({label:z.string().default("refactor-checkpoint")}),annotations:{readOnlyHint:false,openWorldHint:false}},async({label})=>{try{return result(JSON.stringify(await v190Checkpoint(label),null,2));}catch(e){return errorResult(e);}});
  server.registerTool("refactor_apply_guard_v19",{title:"Refactor Apply Guard v19",description:"Assess blast radius and require checkpoint/regression evidence for high-risk targets.",inputSchema:z.object({files:z.array(z.string()).min(1).max(100)}),annotations:{readOnlyHint:true,openWorldHint:false}},async({files})=>{try{return result(JSON.stringify(await v190ApplyGuard(files),null,2));}catch(e){return errorResult(e);}});
  server.registerTool("refactor_regression_plan_v19",{title:"Refactor Regression Plan v19",description:"Compute impacted files and verification scope after a refactor.",inputSchema:z.object({files:z.array(z.string()).min(1).max(100)}),annotations:{readOnlyHint:true,openWorldHint:false}},async({files})=>{try{return result(JSON.stringify(await v190RegressionPlan(files),null,2));}catch(e){return errorResult(e);}});
  server.registerTool("refactor_verify_v19",{title:"Refactor Verify v19",description:"Run configured typecheck/tests and Git diff whitespace validation after a refactor.",inputSchema:z.object({files:z.array(z.string()).default([])}),annotations:{readOnlyHint:false,openWorldHint:false}},async({files})=>{try{return result(JSON.stringify(await v190Verify(files),null,2));}catch(e){return errorResult(e);}});
  server.registerTool("refactor_rollback_plan_v19",{title:"Refactor Rollback Plan v19",description:"Produce a non-destructive rollback plan using Git/checkpoint evidence.",inputSchema:z.object({}),annotations:{readOnlyHint:true,openWorldHint:false}},async()=>{try{return result(JSON.stringify(await v190RollbackPlan(),null,2));}catch(e){return errorResult(e);}});
  server.registerTool("refactor_status_v19",{title:"Refactor Intelligence Status v19",description:"List v19 refactor analysis and verification artifacts.",inputSchema:z.object({}),annotations:{readOnlyHint:true,openWorldHint:false}},async()=>{try{return result(JSON.stringify(await v190Status(),null,2));}catch(e){return errorResult(e);}});


  // =========================================================
  // v20.0 SELF-HEALING ARCHITECTURE & MIGRATION ENGINE
  // =========================================================
  server.registerTool("architecture_drift_scan_v20",{title:"Architecture Drift Scan v20",description:"Detect structural drift, shared-core hotspots, route/config sprawl and architecture pressure before changes.",inputSchema:z.object({}),annotations:{readOnlyHint:true,openWorldHint:false}},async()=>{try{return result(JSON.stringify(await v200ArchitectureDriftScan(),null,2));}catch(e){return errorResult(e);}});
  server.registerTool("breaking_change_forecast_v20",{title:"Breaking Change Forecast v20",description:"Forecast blast radius and compatibility risk for proposed file changes.",inputSchema:z.object({files:z.array(z.string()).min(1).max(100)}),annotations:{readOnlyHint:true,openWorldHint:false}},async({files})=>{try{return result(JSON.stringify(await v200BreakingChangeForecast(files),null,2));}catch(e){return errorResult(e);}});
  server.registerTool("migration_compatibility_matrix_v20",{title:"Migration Compatibility Matrix v20",description:"Map database, API, and UI compatibility requirements for migrations.",inputSchema:z.object({}),annotations:{readOnlyHint:true,openWorldHint:false}},async()=>{try{return result(JSON.stringify(await v200MigrationCompatibilityMatrix(),null,2));}catch(e){return errorResult(e);}});
  server.registerTool("safe_migration_plan_v20",{title:"Safe Migration Plan v20",description:"Create an expand-migrate-contract plan with verification and rollback guardrails.",inputSchema:z.object({goal:z.string().min(3),files:z.array(z.string()).default([])}),annotations:{readOnlyHint:true,openWorldHint:false}},async({goal,files})=>{try{return result(JSON.stringify(await v200SafeMigrationPlan(goal,files),null,2));}catch(e){return errorResult(e);}});
  server.registerTool("migration_preflight_gate_v20",{title:"Migration Preflight Gate v20",description:"Block high-risk migrations when checkpoint, isolation, or evidence prerequisites are missing.",inputSchema:z.object({files:z.array(z.string()).default([])}),annotations:{readOnlyHint:true,openWorldHint:false}},async({files})=>{try{return result(JSON.stringify(await v200MigrationPreflight(files),null,2));}catch(e){return errorResult(e);}});
  server.registerTool("repair_proposal_engine_v20",{title:"Repair Proposal Engine v20",description:"Generate evidence-oriented repair proposals from deterministic symptoms and optional impacted files.",inputSchema:z.object({symptoms:z.array(z.string()).min(1).max(100),files:z.array(z.string()).default([])}),annotations:{readOnlyHint:true,openWorldHint:false}},async({symptoms,files})=>{try{return result(JSON.stringify(await v200RepairProposal(symptoms,files),null,2));}catch(e){return errorResult(e);}});
  server.registerTool("schema_compatibility_gate_v20",{title:"Schema Compatibility Gate v20",description:"Detect destructive or tightening schema patterns that require explicit migration review.",inputSchema:z.object({}),annotations:{readOnlyHint:true,openWorldHint:false}},async()=>{try{return result(JSON.stringify(await v200SchemaCompatibilityGate(),null,2));}catch(e){return errorResult(e);}});
  server.registerTool("api_compatibility_gate_v20",{title:"API Compatibility Gate v20",description:"Review API/client code for compatibility pressure and schema-coupling risks.",inputSchema:z.object({}),annotations:{readOnlyHint:true,openWorldHint:false}},async()=>{try{return result(JSON.stringify(await v200ApiCompatibilityGate(),null,2));}catch(e){return errorResult(e);}});
  server.registerTool("migration_execution_contract_v20",{title:"Migration Execution Contract v20",description:"Run only an explicitly declared migration/database package script after preflight; dry-run by default and explicit approval required for execution.",inputSchema:z.object({script:z.string().min(1),dryRun:z.boolean().default(true),approved:z.boolean().default(false)}),annotations:{readOnlyHint:false,destructiveHint:true,openWorldHint:false}},async({script,dryRun,approved})=>{try{return result(JSON.stringify(await v200MigrationExecutionContract(script,dryRun,approved),null,2));}catch(e){return errorResult(e);}});
  server.registerTool("post_migration_verify_v20",{title:"Post Migration Verify v20",description:"Verify schema/API compatibility, typecheck, tests, and diff integrity after a migration.",inputSchema:z.object({}),annotations:{readOnlyHint:false,openWorldHint:false}},async()=>{try{return result(JSON.stringify(await v200PostMigrationVerify(),null,2));}catch(e){return errorResult(e);}});
  server.registerTool("rollforward_rollback_plan_v20",{title:"Rollforward Rollback Plan v20",description:"Create a safe rollforward/rollback strategy anchored to current Git state without destructive automatic data rollback.",inputSchema:z.object({goal:z.string().min(3)}),annotations:{readOnlyHint:true,openWorldHint:false}},async({goal})=>{try{return result(JSON.stringify(await v200RollforwardRollbackPlan(goal),null,2));}catch(e){return errorResult(e);}});
  server.registerTool("self_healing_status_v20",{title:"Self Healing Status v20",description:"Show v20 architecture, migration preflight, and verification status with generated artifacts.",inputSchema:z.object({}),annotations:{readOnlyHint:true,openWorldHint:false}},async()=>{try{return result(JSON.stringify(await v200SelfHealingStatus(),null,2));}catch(e){return errorResult(e);}});
  
}
