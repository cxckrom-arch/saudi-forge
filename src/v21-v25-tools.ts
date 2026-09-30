import path from "node:path";
import * as z from "zod/v4";

export function registerV21V25Tools(server: any, deps: any) {
  const {
    result,
    errorResult,
    v210ArtifactIntegrity,
    v210CanaryReadiness,
    v210ChangeProvenance,
    v210ContractVerification,
    v210EvidenceBundle,
    v210FinalReleaseAttestation,
    v210FlakyTestDetector,
    v210RegressionReplayPlan,
    v210ReleaseIntelligenceStatus,
    v210ReleasePolicy,
    v210ReleaseRiskScore,
    v210TestImpactIntelligence,
    v210VisualBaselineGovernance,
    v220ApprovalMatrix,
    v220ChangeFreezeCheck,
    v220ChangeRiskClassify,
    v220ComplianceMatrix,
    v220EvidencePolicyCheck,
    v220ExceptionExpiryAudit,
    v220ExceptionRequest,
    v220GovernanceGate,
    v220GovernanceReport,
    v220GovernanceStatus,
    v220PolicyDiff,
    v220PolicyEvaluate,
    v220QualityPolicyInit,
    v220ReleaseDecision,
    v230AdrGenerate,
    v230ArchitectureFitness,
    v230BoundaryEnforcement,
    v230DebtBudget,
    v230DebtInventory,
    v230DependencyHealth,
    v230EvolutionDecision,
    v230EvolutionRoadmap,
    v230FitnessGate,
    v230HotspotForecast,
    v230RefactorRoi,
    v230Status,
    v240BuildGraph,
    v240ContextPack,
    v240GraphPath,
    v240HiddenDependencies,
    v240ImpactQuery,
    v240KnowledgeGate,
    v240Refresh,
    v240RiskExplain,
    v240RouteApiDataTrace,
    v240SemanticRelations,
    v240Status,
    v240TestCoverageLinker,
    v250AccessibilityByDesign,
    v250ComponentConsistency,
    v250DesignChangePlan,
    v250DesignGate,
    v250DesignQualityScore,
    v250DesignTokenAudit,
    v250InteractionStateAudit,
    v250LayoutDiagnostics,
    v250ResponsiveRtl,
    v250Status,
    v250UxFlowAnalysis,
    v250VisualRegressionPolicy
  } = deps;

// ===== v21.0 AUTONOMOUS VERIFICATION & RELEASE INTELLIGENCE =====
  server.registerTool("test_impact_intelligence_v21",{title:"Test Impact Intelligence v21",description:"Map changed files to impacted code and targeted tests using the project dependency graph.",inputSchema:z.object({files:z.array(z.string()).default([])}),annotations:{readOnlyHint:true,openWorldHint:false}},async({files})=>{try{return result(JSON.stringify(await v210TestImpactIntelligence(files),null,2));}catch(e){return errorResult(e);}});
  server.registerTool("flaky_test_detector_v21",{title:"Flaky Test Detector v21",description:"Statically identify test patterns that can contribute to flakiness; does not claim confirmed flakiness without runtime evidence.",inputSchema:z.object({}),annotations:{readOnlyHint:true,openWorldHint:false}},async()=>{try{return result(JSON.stringify(await v210FlakyTestDetector(),null,2));}catch(e){return errorResult(e);}});
  server.registerTool("contract_verification_v21",{title:"Contract Verification v21",description:"Assess API/schema contract-test evidence and compatibility surfaces.",inputSchema:z.object({}),annotations:{readOnlyHint:true,openWorldHint:false}},async()=>{try{return result(JSON.stringify(await v210ContractVerification(),null,2));}catch(e){return errorResult(e);}});
  server.registerTool("visual_baseline_governance_v21",{title:"Visual Baseline Governance v21",description:"Audit visual baseline evidence and viewport governance for regression reviews.",inputSchema:z.object({}),annotations:{readOnlyHint:true,openWorldHint:false}},async()=>{try{return result(JSON.stringify(await v210VisualBaselineGovernance(),null,2));}catch(e){return errorResult(e);}});
  server.registerTool("release_risk_score_v21",{title:"Release Risk Score v21",description:"Compute an evidence-based release risk score from changed files, sensitive surfaces, and test impact.",inputSchema:z.object({}),annotations:{readOnlyHint:true,openWorldHint:false}},async()=>{try{return result(JSON.stringify(await v210ReleaseRiskScore(),null,2));}catch(e){return errorResult(e);}});
  server.registerTool("canary_readiness_v21",{title:"Canary Readiness v21",description:"Assess whether a change has the minimum evidence for a controlled canary rollout.",inputSchema:z.object({}),annotations:{readOnlyHint:true,openWorldHint:false}},async()=>{try{return result(JSON.stringify(await v210CanaryReadiness(),null,2));}catch(e){return errorResult(e);}});
  server.registerTool("change_provenance_v21",{title:"Change Provenance v21",description:"Capture Git HEAD, branch, changed files, and diff statistics as release provenance.",inputSchema:z.object({}),annotations:{readOnlyHint:true,openWorldHint:false}},async()=>{try{return result(JSON.stringify(await v210ChangeProvenance(),null,2));}catch(e){return errorResult(e);}});
  server.registerTool("evidence_bundle_v21",{title:"Evidence Bundle v21",description:"Generate a release evidence bundle from observed project state without inventing pass results.",inputSchema:z.object({}),annotations:{readOnlyHint:false,openWorldHint:false}},async()=>{try{return result(JSON.stringify(await v210EvidenceBundle(),null,2));}catch(e){return errorResult(e);}});
  server.registerTool("regression_replay_plan_v21",{title:"Regression Replay Plan v21",description:"Build a targeted regression replay plan from changed files and configured project scripts.",inputSchema:z.object({}),annotations:{readOnlyHint:true,openWorldHint:false}},async()=>{try{return result(JSON.stringify(await v210RegressionReplayPlan(),null,2));}catch(e){return errorResult(e);}});
  server.registerTool("artifact_integrity_v21",{title:"Artifact Integrity v21",description:"Record package metadata and lockfile evidence used to identify the release artifact inputs.",inputSchema:z.object({}),annotations:{readOnlyHint:true,openWorldHint:false}},async()=>{try{return result(JSON.stringify(await v210ArtifactIntegrity(),null,2));}catch(e){return errorResult(e);}});
  server.registerTool("release_policy_v21",{title:"Release Policy v21",description:"Generate evidence requirements for the current release risk profile.",inputSchema:z.object({}),annotations:{readOnlyHint:true,openWorldHint:false}},async()=>{try{return result(JSON.stringify(await v210ReleasePolicy(),null,2));}catch(e){return errorResult(e);}});
  server.registerTool("final_release_attestation_v21",{title:"Final Release Attestation v21",description:"Attest release readiness only when required evidence is present; otherwise return explicit blockers.",inputSchema:z.object({}),annotations:{readOnlyHint:false,openWorldHint:false}},async()=>{try{return result(JSON.stringify(await v210FinalReleaseAttestation(),null,2));}catch(e){return errorResult(e);}});
  server.registerTool("release_intelligence_status_v21",{title:"Release Intelligence Status v21",description:"Show v21 release intelligence artifacts, risk state, and attestation status.",inputSchema:z.object({}),annotations:{readOnlyHint:true,openWorldHint:false}},async()=>{try{return result(JSON.stringify(await v210ReleaseIntelligenceStatus(),null,2));}catch(e){return errorResult(e);}});
  // ===== END v21.0 REGISTRATION =====

  // ===== v22.0 AUTONOMOUS QUALITY GOVERNANCE & POLICY ENGINE =====
  server.registerTool("quality_policy_init_v22",{title:"Quality Policy Init v22",description:"Initialize or update project quality-governance thresholds and approval classes.",inputSchema:z.object({mode:z.enum(["balanced","strict","maximum"]).default("strict")}),annotations:{readOnlyHint:false,openWorldHint:false}},async({mode})=>{try{return result(JSON.stringify(await v220QualityPolicyInit(mode),null,2));}catch(e){return errorResult(e);}});
  server.registerTool("change_risk_classify_v22",{title:"Change Risk Classifier v22",description:"Classify current or supplied changed files into LOW/MEDIUM/HIGH/CRITICAL governance risk.",inputSchema:z.object({files:z.array(z.string()).default([])}),annotations:{readOnlyHint:true,openWorldHint:false}},async({files})=>{try{return result(JSON.stringify(await v220ChangeRiskClassify(files),null,2));}catch(e){return errorResult(e);}});
  server.registerTool("approval_matrix_v22",{title:"Approval Matrix v22",description:"Resolve required approval roles and checkpoint requirements for a change risk class.",inputSchema:z.object({files:z.array(z.string()).default([])}),annotations:{readOnlyHint:true,openWorldHint:false}},async({files})=>{try{return result(JSON.stringify(await v220ApprovalMatrix(files),null,2));}catch(e){return errorResult(e);}});
  server.registerTool("policy_exception_request_v22",{title:"Policy Exception Request v22",description:"Create a time-bounded, owner-attributed governance exception; critical-risk exceptions are denied by default.",inputSchema:z.object({policyKey:z.string().min(1),reason:z.string().min(3),owner:z.string().min(1),days:z.number().int().min(1).max(30).default(7)}),annotations:{readOnlyHint:false,openWorldHint:false}},async(input)=>{try{return result(JSON.stringify(await v220ExceptionRequest(input),null,2));}catch(e){return errorResult(e);}});
  server.registerTool("exception_expiry_audit_v22",{title:"Exception Expiry Audit v22",description:"Expire time-bounded policy exceptions and list active versus expired exceptions.",inputSchema:z.object({}),annotations:{readOnlyHint:false,openWorldHint:false}},async()=>{try{return result(JSON.stringify(await v220ExceptionExpiryAudit(),null,2));}catch(e){return errorResult(e);}});
  server.registerTool("evidence_policy_check_v22",{title:"Evidence Policy Check v22",description:"Check recorded release evidence against configured minimum evidence coverage.",inputSchema:z.object({}),annotations:{readOnlyHint:true,openWorldHint:false}},async()=>{try{return result(JSON.stringify(await v220EvidencePolicyCheck(),null,2));}catch(e){return errorResult(e);}});
  server.registerTool("compliance_matrix_v22",{title:"Compliance Matrix v22",description:"Build a governance compliance matrix from evidence, release attestation, migration preflight, and release risk.",inputSchema:z.object({}),annotations:{readOnlyHint:true,openWorldHint:false}},async()=>{try{return result(JSON.stringify(await v220ComplianceMatrix(),null,2));}catch(e){return errorResult(e);}});
  server.registerTool("policy_evaluate_v22",{title:"Policy Evaluate v22",description:"Evaluate change risk, approvals, evidence, exceptions, and configured project policy.",inputSchema:z.object({files:z.array(z.string()).default([])}),annotations:{readOnlyHint:true,openWorldHint:false}},async({files})=>{try{return result(JSON.stringify(await v220PolicyEvaluate(files),null,2));}catch(e){return errorResult(e);}});
  server.registerTool("change_freeze_check_v22",{title:"Change Freeze Check v22",description:"Respect KROM_CHANGE_FREEZE and block high/critical changes while freeze is enabled.",inputSchema:z.object({}),annotations:{readOnlyHint:true,openWorldHint:false}},async()=>{try{return result(JSON.stringify(await v220ChangeFreezeCheck(),null,2));}catch(e){return errorResult(e);}});
  server.registerTool("policy_diff_v22",{title:"Policy Diff v22",description:"Show active policy version, mode, thresholds, and protected surfaces.",inputSchema:z.object({}),annotations:{readOnlyHint:true,openWorldHint:false}},async()=>{try{return result(JSON.stringify(await v220PolicyDiff(),null,2));}catch(e){return errorResult(e);}});
  server.registerTool("governance_gate_v22",{title:"Governance Gate v22",description:"Run the final quality-governance gate before release approval.",inputSchema:z.object({}),annotations:{readOnlyHint:true,openWorldHint:false}},async()=>{try{return result(JSON.stringify(await v220GovernanceGate(),null,2));}catch(e){return errorResult(e);}});
  server.registerTool("governed_release_decision_v22",{title:"Governed Release Decision v22",description:"Approve, deny, or require review based on governance gate plus recorded v21 release attestation.",inputSchema:z.object({}),annotations:{readOnlyHint:false,openWorldHint:false}},async()=>{try{return result(JSON.stringify(await v220ReleaseDecision(),null,2));}catch(e){return errorResult(e);}});
  server.registerTool("governance_report_v22",{title:"Governance Report v22",description:"Generate an auditable governance summary without inventing evidence.",inputSchema:z.object({}),annotations:{readOnlyHint:false,openWorldHint:false}},async()=>{try{return result(JSON.stringify(await v220GovernanceReport(),null,2));}catch(e){return errorResult(e);}});
  server.registerTool("governance_status_v22",{title:"Governance Status v22",description:"Show v22 policy, gate, release-decision, and governance artifact status.",inputSchema:z.object({}),annotations:{readOnlyHint:true,openWorldHint:false}},async()=>{try{return result(JSON.stringify(await v220GovernanceStatus(),null,2));}catch(e){return errorResult(e);}});
  // ===== END v22.0 REGISTRATION =====


  // ===== v23.0 ARCHITECTURE EVOLUTION REGISTRATION =====
  server.registerTool("architecture_fitness_v23",{title:"Architecture Fitness v23",description:"Measure architecture fitness and structural risk signals from the current codebase.",inputSchema:z.object({}),annotations:{readOnlyHint:true,openWorldHint:false}},async()=>{try{return result(JSON.stringify(await v230ArchitectureFitness(),null,2));}catch(e){return errorResult(e);}});
  server.registerTool("technical_debt_inventory_v23",{title:"Technical Debt Inventory v23",description:"Inventory explicit and implicit technical-debt signals such as TODO, FIXME, HACK, ts-ignore, eslint-disable, and any usage.",inputSchema:z.object({}),annotations:{readOnlyHint:true,openWorldHint:false}},async()=>{try{return result(JSON.stringify(await v230DebtInventory(),null,2));}catch(e){return errorResult(e);}});
  server.registerTool("hotspot_forecast_v23",{title:"Hotspot Forecast v23",description:"Forecast change hotspots using Git churn plus recorded technical-debt signals.",inputSchema:z.object({}),annotations:{readOnlyHint:true,openWorldHint:false}},async()=>{try{return result(JSON.stringify(await v230HotspotForecast(),null,2));}catch(e){return errorResult(e);}});
  server.registerTool("module_boundary_enforcement_v23",{title:"Module Boundary Enforcement v23",description:"Detect deep cross-boundary imports and risky module coupling patterns.",inputSchema:z.object({}),annotations:{readOnlyHint:true,openWorldHint:false}},async()=>{try{return result(JSON.stringify(await v230BoundaryEnforcement(),null,2));}catch(e){return errorResult(e);}});
  server.registerTool("dependency_health_v23",{title:"Dependency Health v23",description:"Review dependency declaration health without claiming external vulnerability data.",inputSchema:z.object({}),annotations:{readOnlyHint:true,openWorldHint:false}},async()=>{try{return result(JSON.stringify(await v230DependencyHealth(),null,2));}catch(e){return errorResult(e);}});
  server.registerTool("refactor_roi_v23",{title:"Refactor ROI v23",description:"Rank refactor candidates from churn, architecture fitness, and technical-debt evidence.",inputSchema:z.object({}),annotations:{readOnlyHint:true,openWorldHint:false}},async()=>{try{return result(JSON.stringify(await v230RefactorRoi(),null,2));}catch(e){return errorResult(e);}});
  server.registerTool("adr_generate_v23",{title:"ADR Generator v23",description:"Create an Architecture Decision Record under docs/adr with explicit context, decision, and consequences.",inputSchema:z.object({title:z.string().min(3),context:z.string().min(3),decision:z.string().min(3),consequences:z.array(z.string()).default([])}),annotations:{readOnlyHint:false,openWorldHint:false}},async(input)=>{try{return result(JSON.stringify(await v230AdrGenerate(input),null,2));}catch(e){return errorResult(e);}});
  server.registerTool("architecture_evolution_roadmap_v23",{title:"Architecture Evolution Roadmap v23",description:"Generate an evidence-based phased roadmap for architecture stabilization and debt retirement.",inputSchema:z.object({}),annotations:{readOnlyHint:false,openWorldHint:false}},async()=>{try{return result(JSON.stringify(await v230EvolutionRoadmap(),null,2));}catch(e){return errorResult(e);}});
  server.registerTool("technical_debt_budget_v23",{title:"Technical Debt Budget v23",description:"Enforce configurable limits for weighted debt, large modules, and boundary violations.",inputSchema:z.object({maxWeightedDebt:z.number().int().min(0).default(100),maxLargeModules:z.number().int().min(0).default(10),maxBoundaryViolations:z.number().int().min(0).default(20)}),annotations:{readOnlyHint:true,openWorldHint:false}},async(input)=>{try{return result(JSON.stringify(await v230DebtBudget(input),null,2));}catch(e){return errorResult(e);}});
  server.registerTool("architecture_fitness_gate_v23",{title:"Architecture Fitness Gate v23",description:"Block architecture evolution when structural fitness, dependency health, or boundary conditions are unacceptable.",inputSchema:z.object({}),annotations:{readOnlyHint:true,openWorldHint:false}},async()=>{try{return result(JSON.stringify(await v230FitnessGate(),null,2));}catch(e){return errorResult(e);}});
  server.registerTool("architecture_evolution_decision_v23",{title:"Architecture Evolution Decision v23",description:"Combine v22 governance with v23 architecture fitness for a controlled evolution decision.",inputSchema:z.object({}),annotations:{readOnlyHint:false,openWorldHint:false}},async()=>{try{return result(JSON.stringify(await v230EvolutionDecision(),null,2));}catch(e){return errorResult(e);}});
  server.registerTool("architecture_evolution_status_v23",{title:"Architecture Evolution Status v23",description:"Show generated v23 artifacts and the latest architecture-evolution decision.",inputSchema:z.object({}),annotations:{readOnlyHint:true,openWorldHint:false}},async()=>{try{return result(JSON.stringify(await v230Status(),null,2));}catch(e){return errorResult(e);}});
  // ===== END v23.0 REGISTRATION =====

  // ===== v24.0 KNOWLEDGE GRAPH & CHANGE INTELLIGENCE REGISTRATION =====
  server.registerTool("knowledge_graph_build_v24",{title:"Knowledge Graph Build v24",description:"Build a project knowledge graph spanning files, imports, API calls, database-table references, symbols, and test nodes.",inputSchema:z.object({force:z.boolean().default(false)}),annotations:{readOnlyHint:false,openWorldHint:false}},async({force})=>{try{return result(JSON.stringify(await v240BuildGraph(force),null,2));}catch(e){return errorResult(e);}});
  server.registerTool("semantic_relation_scan_v24",{title:"Semantic Relation Scan v24",description:"Extract semantic relations such as API calls, database usage, and test-to-code links from the knowledge graph.",inputSchema:z.object({}),annotations:{readOnlyHint:true,openWorldHint:false}},async()=>{try{return result(JSON.stringify(await v240SemanticRelations(),null,2));}catch(e){return errorResult(e);}});
  server.registerTool("hidden_dependency_scan_v24",{title:"Hidden Dependency Scan v24",description:"Identify shared API and data dependencies with high fan-out that can create hidden change impact.",inputSchema:z.object({}),annotations:{readOnlyHint:true,openWorldHint:false}},async()=>{try{return result(JSON.stringify(await v240HiddenDependencies(),null,2));}catch(e){return errorResult(e);}});
  server.registerTool("change_impact_query_v24",{title:"Change Impact Query v24",description:"Calculate transitive change impact, blast-radius levels, and likely regression tests for selected files.",inputSchema:z.object({files:z.array(z.string()).min(1)}),annotations:{readOnlyHint:true,openWorldHint:false}},async({files})=>{try{return result(JSON.stringify(await v240ImpactQuery(files),null,2));}catch(e){return errorResult(e);}});
  server.registerTool("route_api_data_trace_v24",{title:"Route API Data Trace v24",description:"Trace product surfaces and routes to API calls and Supabase/database table usage.",inputSchema:z.object({}),annotations:{readOnlyHint:true,openWorldHint:false}},async()=>{try{return result(JSON.stringify(await v240RouteApiDataTrace(),null,2));}catch(e){return errorResult(e);}});
  server.registerTool("test_coverage_linker_v24",{title:"Test Coverage Linker v24",description:"Link test files to code nodes and identify high-centrality modules with no obvious linked tests.",inputSchema:z.object({}),annotations:{readOnlyHint:true,openWorldHint:false}},async()=>{try{return result(JSON.stringify(await v240TestCoverageLinker(),null,2));}catch(e){return errorResult(e);}});
  server.registerTool("knowledge_graph_path_v24",{title:"Knowledge Graph Path v24",description:"Find an import/dependency path between two project files.",inputSchema:z.object({from:z.string().min(1),to:z.string().min(1)}),annotations:{readOnlyHint:true,openWorldHint:false}},async({from,to})=>{try{return result(JSON.stringify(await v240GraphPath(from,to),null,2));}catch(e){return errorResult(e);}});
  server.registerTool("knowledge_context_pack_v24",{title:"Knowledge Context Pack v24",description:"Select a compact, high-value context set for a task using graph centrality, task terms, and optional change impact.",inputSchema:z.object({task:z.string().min(3),files:z.array(z.string()).default([])}),annotations:{readOnlyHint:false,openWorldHint:false}},async({task,files})=>{try{return result(JSON.stringify(await v240ContextPack(task,files),null,2));}catch(e){return errorResult(e);}});
  server.registerTool("change_risk_explain_v24",{title:"Change Risk Explain v24",description:"Explain change risk using transitive impact, centrality, shared API/data dependencies, and linked test evidence.",inputSchema:z.object({files:z.array(z.string()).min(1)}),annotations:{readOnlyHint:true,openWorldHint:false}},async({files})=>{try{return result(JSON.stringify(await v240RiskExplain(files),null,2));}catch(e){return errorResult(e);}});
  server.registerTool("knowledge_graph_refresh_v24",{title:"Knowledge Graph Refresh v24",description:"Rebuild the project knowledge graph after meaningful codebase changes.",inputSchema:z.object({}),annotations:{readOnlyHint:false,openWorldHint:false}},async()=>{try{return result(JSON.stringify(await v240Refresh(),null,2));}catch(e){return errorResult(e);}});
  server.registerTool("knowledge_gate_v24",{title:"Knowledge Gate v24",description:"Block risky changes when the knowledge graph shows a very large blast radius or high-centrality code without linked test evidence.",inputSchema:z.object({files:z.array(z.string()).default([])}),annotations:{readOnlyHint:true,openWorldHint:false}},async({files})=>{try{return result(JSON.stringify(await v240KnowledgeGate(files),null,2));}catch(e){return errorResult(e);}});
  server.registerTool("knowledge_intelligence_status_v24",{title:"Knowledge Intelligence Status v24",description:"Show v24 knowledge-graph artifacts, graph size, and the latest knowledge gate result.",inputSchema:z.object({}),annotations:{readOnlyHint:true,openWorldHint:false}},async()=>{try{return result(JSON.stringify(await v240Status(),null,2));}catch(e){return errorResult(e);}});
  // ===== END v24.0 REGISTRATION =====

  // ===== v25.0 DESIGN-TO-CODE & UX INTELLIGENCE REGISTRATION =====
  server.registerTool("design_token_audit_v25",{title:"Design Token Audit v25",description:"Audit recurring raw colors, spacing and sizing values and recommend design-token consolidation.",inputSchema:z.object({}),annotations:{readOnlyHint:true,openWorldHint:false}},async()=>{try{return result(JSON.stringify(await v250DesignTokenAudit(),null,2));}catch(e){return errorResult(e);}});
  server.registerTool("component_consistency_v25",{title:"Component Consistency v25",description:"Detect inconsistent raw controls, inline styles and arbitrary styling patterns across UI components.",inputSchema:z.object({}),annotations:{readOnlyHint:true,openWorldHint:false}},async()=>{try{return result(JSON.stringify(await v250ComponentConsistency(),null,2));}catch(e){return errorResult(e);}});
  server.registerTool("layout_diagnostics_v25",{title:"Layout Diagnostics v25",description:"Detect brittle large fixed widths, excessive absolute positioning and responsive layout risks.",inputSchema:z.object({}),annotations:{readOnlyHint:true,openWorldHint:false}},async()=>{try{return result(JSON.stringify(await v250LayoutDiagnostics(),null,2));}catch(e){return errorResult(e);}});
  server.registerTool("ux_flow_analysis_v25",{title:"UX Flow Analysis v25",description:"Analyze routes, UI nodes and likely flow gaps using the project knowledge graph.",inputSchema:z.object({}),annotations:{readOnlyHint:true,openWorldHint:false}},async()=>{try{return result(JSON.stringify(await v250UxFlowAnalysis(),null,2));}catch(e){return errorResult(e);}});
  server.registerTool("responsive_rtl_intelligence_v25",{title:"Responsive RTL Intelligence v25",description:"Audit responsive signals and RTL/direction awareness across UI files.",inputSchema:z.object({}),annotations:{readOnlyHint:true,openWorldHint:false}},async()=>{try{return result(JSON.stringify(await v250ResponsiveRtl(),null,2));}catch(e){return errorResult(e);}});
  server.registerTool("accessibility_by_design_v25",{title:"Accessibility by Design v25",description:"Static accessibility heuristics for missing image alt text, clickable non-buttons and unlabeled icon buttons.",inputSchema:z.object({}),annotations:{readOnlyHint:true,openWorldHint:false}},async()=>{try{return result(JSON.stringify(await v250AccessibilityByDesign(),null,2));}catch(e){return errorResult(e);}});
  server.registerTool("interaction_state_audit_v25",{title:"Interaction State Audit v25",description:"Audit substantial UI modules for loading, empty, error, disabled and success-state coverage.",inputSchema:z.object({}),annotations:{readOnlyHint:true,openWorldHint:false}},async()=>{try{return result(JSON.stringify(await v250InteractionStateAudit(),null,2));}catch(e){return errorResult(e);}});
  server.registerTool("visual_regression_policy_v25",{title:"Visual Regression Policy v25",description:"Define viewport and visual-diff governance using existing screenshot baselines when available.",inputSchema:z.object({}),annotations:{readOnlyHint:false,openWorldHint:false}},async()=>{try{return result(JSON.stringify(await v250VisualRegressionPolicy(),null,2));}catch(e){return errorResult(e);}});
  server.registerTool("design_quality_score_v25",{title:"Design Quality Score v25",description:"Aggregate UI consistency, responsive, accessibility and interaction-state evidence into a design quality score.",inputSchema:z.object({}),annotations:{readOnlyHint:false,openWorldHint:false}},async()=>{try{return result(JSON.stringify(await v250DesignQualityScore(),null,2));}catch(e){return errorResult(e);}});
  server.registerTool("design_change_plan_v25",{title:"Design Change Plan v25",description:"Generate a phased design-system, responsive, accessibility and visual-verification plan for selected changes.",inputSchema:z.object({files:z.array(z.string()).default([])}),annotations:{readOnlyHint:false,openWorldHint:false}},async({files})=>{try{return result(JSON.stringify(await v250DesignChangePlan(files),null,2));}catch(e){return errorResult(e);}});
  server.registerTool("design_gate_v25",{title:"Design Gate v25",description:"Block UI release when design quality, knowledge-graph risk or visual-baseline requirements are not satisfied.",inputSchema:z.object({files:z.array(z.string()).default([])}),annotations:{readOnlyHint:false,openWorldHint:false}},async({files})=>{try{return result(JSON.stringify(await v250DesignGate(files),null,2));}catch(e){return errorResult(e);}});
  server.registerTool("design_intelligence_status_v25",{title:"Design Intelligence Status v25",description:"Show v25 design intelligence artifacts and latest quality/gate state.",inputSchema:z.object({}),annotations:{readOnlyHint:true,openWorldHint:false}},async()=>{try{return result(JSON.stringify(await v250Status(),null,2));}catch(e){return errorResult(e);}});
  // ===== END v25.0 REGISTRATION =====


  
}
