import * as z from "zod/v4";

export function registerV26V31Tools(server: any, deps: any) {
  const {
    result,
    errorResult,
    v260A11yContract,
    v260ComponentInventory,
    v260ComponentQuality,
    v260ComponentSpec,
    v260ConsistencyRepairPlan,
    v260DesignSystemGate,
    v260FactoryPlan,
    v260RecipeGenerate,
    v260ResponsiveContract,
    v260RtlContract,
    v260SnapshotPlan,
    v260Status,
    v260Tokens,
    v260VariantMatrix,
    v270ApiContract,
    v270Completeness,
    v270DataModel,
    v270FeatureGate,
    v270FeaturePlan,
    v270FeatureSpec,
    v270GapRepair,
    v270PermissionMatrix,
    v270Status,
    v270TelemetryContract,
    v270TestMatrix,
    v270UiContract,
    v280ApiDuplicationAudit,
    v280AppEvolutionGate,
    v280ComponentDuplicationAudit,
    v280ContractConsistency,
    v280CrossFeatureConflict,
    v280EvolutionStatus,
    v280FeatureDependencyMap,
    v280FeatureEvolutionPlan,
    v280RegressionScope,
    v280SharedLogicAudit,
    v290CrossJourneyConflict,
    v290FunnelModel,
    v290JourneyGapScan,
    v290JourneyGate,
    v290JourneyMap,
    v290JourneyRegression,
    v290OutcomeKpi,
    v290PersonaFlow,
    v290ProductOutcomeReview,
    v290Status,
    v300AbReadiness,
    v300AnomalyRules,
    v300ExperimentEvidence,
    v300ExperimentPlan,
    v300HypothesisTracker,
    v300KpiGuardrails,
    v300OptimizationGate,
    v300OptimizationStatus,
    v300RolloutCohorts,
    v300TelemetryContract,
    v300UxOptimizationLoop,
    v310EnvTemplate,
    v310InstallStatus,
    v310PortDiagnostics,
    v310RepairPlan,
    v310RuntimeDoctor,
    v310StartupIntegrityGate,
    v310WorkspaceBootstrap
  } = deps;

// ===== v26.0 AUTONOMOUS DESIGN SYSTEM & COMPONENT FACTORY REGISTRATION =====
  server.registerTool("design_system_tokens_v26",{title:"Design System Tokens v26",description:"Generate a normalized token contract from current UI evidence.",inputSchema:z.object({}),annotations:{readOnlyHint:false,openWorldHint:false}},async()=>{try{return result(JSON.stringify(await v260Tokens(),null,2));}catch(e){return errorResult(e);}});
  server.registerTool("component_inventory_v26",{title:"Component Inventory v26",description:"Inventory React UI components and exports.",inputSchema:z.object({}),annotations:{readOnlyHint:false,openWorldHint:false}},async()=>{try{return result(JSON.stringify(await v260ComponentInventory(),null,2));}catch(e){return errorResult(e);}});
  server.registerTool("component_variant_matrix_v26",{title:"Component Variant Matrix v26",description:"Define required variants, states, responsive behavior and RTL expectations for components.",inputSchema:z.object({}),annotations:{readOnlyHint:false,openWorldHint:false}},async()=>{try{return result(JSON.stringify(await v260VariantMatrix(),null,2));}catch(e){return errorResult(e);}});
  server.registerTool("component_recipe_generate_v26",{title:"Component Recipe Generate v26",description:"Generate a reusable component recipe with anatomy, states and acceptance criteria.",inputSchema:z.object({name:z.string().min(2),purpose:z.string().min(3),category:z.string().optional()}),annotations:{readOnlyHint:false,openWorldHint:false}},async(input)=>{try{return result(JSON.stringify(await v260RecipeGenerate(input),null,2));}catch(e){return errorResult(e);}});
  server.registerTool("component_spec_generate_v26",{title:"Component Spec Generate v26",description:"Generate a typed component quality contract before implementation.",inputSchema:z.object({name:z.string().min(2),description:z.string().min(3)}),annotations:{readOnlyHint:false,openWorldHint:false}},async(input)=>{try{return result(JSON.stringify(await v260ComponentSpec(input),null,2));}catch(e){return errorResult(e);}});
  server.registerTool("responsive_contract_v26",{title:"Responsive Contract v26",description:"Create responsive viewport and behavior requirements for the design system.",inputSchema:z.object({}),annotations:{readOnlyHint:false,openWorldHint:false}},async()=>{try{return result(JSON.stringify(await v260ResponsiveContract(),null,2));}catch(e){return errorResult(e);}});
  server.registerTool("rtl_contract_v26",{title:"RTL Contract v26",description:"Create RTL and mixed Arabic/English UI rules.",inputSchema:z.object({}),annotations:{readOnlyHint:false,openWorldHint:false}},async()=>{try{return result(JSON.stringify(await v260RtlContract(),null,2));}catch(e){return errorResult(e);}});
  server.registerTool("accessibility_contract_v26",{title:"Accessibility Contract v26",description:"Create accessibility-by-design requirements for reusable components.",inputSchema:z.object({}),annotations:{readOnlyHint:false,openWorldHint:false}},async()=>{try{return result(JSON.stringify(await v260A11yContract(),null,2));}catch(e){return errorResult(e);}});
  server.registerTool("visual_snapshot_plan_v26",{title:"Visual Snapshot Plan v26",description:"Plan visual baselines for key routes, component states and viewports.",inputSchema:z.object({}),annotations:{readOnlyHint:false,openWorldHint:false}},async()=>{try{return result(JSON.stringify(await v260SnapshotPlan(),null,2));}catch(e){return errorResult(e);}});
  server.registerTool("component_quality_gate_v26",{title:"Component Quality Gate v26",description:"Score component-system quality across consistency, accessibility, RTL/responsive and states.",inputSchema:z.object({component:z.string().optional()}),annotations:{readOnlyHint:false,openWorldHint:false}},async({component})=>{try{return result(JSON.stringify(await v260ComponentQuality(component),null,2));}catch(e){return errorResult(e);}});
  server.registerTool("component_factory_plan_v26",{title:"Component Factory Plan v26",description:"Generate an implementation and verification plan for a reusable component.",inputSchema:z.object({component:z.string().min(2),purpose:z.string().min(3)}),annotations:{readOnlyHint:false,openWorldHint:false}},async(input)=>{try{return result(JSON.stringify(await v260FactoryPlan(input),null,2));}catch(e){return errorResult(e);}});
  server.registerTool("design_consistency_repair_plan_v26",{title:"Design Consistency Repair Plan v26",description:"Prioritize high-risk UI files for design-system consolidation.",inputSchema:z.object({}),annotations:{readOnlyHint:false,openWorldHint:false}},async()=>{try{return result(JSON.stringify(await v260ConsistencyRepairPlan(),null,2));}catch(e){return errorResult(e);}});
  server.registerTool("design_system_gate_v26",{title:"Design System Gate v26",description:"Block component-system release when quality, tokens or visual baselines are insufficient.",inputSchema:z.object({}),annotations:{readOnlyHint:false,openWorldHint:false}},async()=>{try{return result(JSON.stringify(await v260DesignSystemGate(),null,2));}catch(e){return errorResult(e);}});
  server.registerTool("design_system_status_v26",{title:"Design System Status v26",description:"Show v26 design-system factory artifacts and status.",inputSchema:z.object({}),annotations:{readOnlyHint:true,openWorldHint:false}},async()=>{try{return result(JSON.stringify(await v260Status(),null,2));}catch(e){return errorResult(e);}});
  // ===== END v26.0 REGISTRATION =====

  // ===== v27.0 FULL-STACK FEATURE FACTORY REGISTRATION =====
  server.registerTool("feature_spec_v27",{title:"Feature Spec v27",description:"Create a full-stack feature specification across UI, API, data, permissions, tests and telemetry.",inputSchema:z.object({name:z.string().min(2),goal:z.string().min(3),actors:z.array(z.string()).optional()}),annotations:{readOnlyHint:false,openWorldHint:false}},async(input)=>{try{return result(JSON.stringify(await v270FeatureSpec(input),null,2));}catch(e){return errorResult(e);}});
  server.registerTool("feature_data_model_v27",{title:"Feature Data Model v27",description:"Plan the data model for a feature using current project knowledge.",inputSchema:z.object({feature:z.string().min(2)}),annotations:{readOnlyHint:false,openWorldHint:false}},async(input)=>{try{return result(JSON.stringify(await v270DataModel(input),null,2));}catch(e){return errorResult(e);}});
  server.registerTool("feature_api_contract_v27",{title:"Feature API Contract v27",description:"Define request, response and error contracts for a feature.",inputSchema:z.object({feature:z.string().min(2)}),annotations:{readOnlyHint:false,openWorldHint:false}},async(input)=>{try{return result(JSON.stringify(await v270ApiContract(input),null,2));}catch(e){return errorResult(e);}});
  server.registerTool("feature_permission_matrix_v27",{title:"Feature Permission Matrix v27",description:"Create a server-enforced permission matrix for a feature.",inputSchema:z.object({feature:z.string().min(2)}),annotations:{readOnlyHint:false,openWorldHint:false}},async(input)=>{try{return result(JSON.stringify(await v270PermissionMatrix(input),null,2));}catch(e){return errorResult(e);}});
  server.registerTool("feature_ui_contract_v27",{title:"Feature UI Contract v27",description:"Define responsive, RTL, accessibility and state requirements for feature UI.",inputSchema:z.object({feature:z.string().min(2)}),annotations:{readOnlyHint:false,openWorldHint:false}},async(input)=>{try{return result(JSON.stringify(await v270UiContract(input),null,2));}catch(e){return errorResult(e);}});
  server.registerTool("feature_test_matrix_v27",{title:"Feature Test Matrix v27",description:"Plan unit, integration, E2E and visual tests for a feature.",inputSchema:z.object({feature:z.string().min(2)}),annotations:{readOnlyHint:false,openWorldHint:false}},async(input)=>{try{return result(JSON.stringify(await v270TestMatrix(input),null,2));}catch(e){return errorResult(e);}});
  server.registerTool("feature_telemetry_contract_v27",{title:"Feature Telemetry Contract v27",description:"Define safe product telemetry for a feature without recording secrets or sensitive payloads.",inputSchema:z.object({feature:z.string().min(2)}),annotations:{readOnlyHint:false,openWorldHint:false}},async(input)=>{try{return result(JSON.stringify(await v270TelemetryContract(input),null,2));}catch(e){return errorResult(e);}});
  server.registerTool("fullstack_feature_plan_v27",{title:"Full-Stack Feature Plan v27",description:"Build an integrated implementation plan covering schema, permissions, API, UI, tests and telemetry.",inputSchema:z.object({name:z.string().min(2),goal:z.string().min(3)}),annotations:{readOnlyHint:false,openWorldHint:false}},async(input)=>{try{return result(JSON.stringify(await v270FeaturePlan(input),null,2));}catch(e){return errorResult(e);}});
  server.registerTool("feature_completeness_v27",{title:"Feature Completeness v27",description:"Measure whether a feature is implemented across all required full-stack layers with evidence.",inputSchema:z.object({feature:z.string().min(2)}),annotations:{readOnlyHint:false,openWorldHint:false}},async(input)=>{try{return result(JSON.stringify(await v270Completeness(input),null,2));}catch(e){return errorResult(e);}});
  server.registerTool("feature_gap_repair_v27",{title:"Feature Gap Repair v27",description:"Generate a minimal repair plan for missing full-stack feature layers.",inputSchema:z.object({feature:z.string().min(2)}),annotations:{readOnlyHint:false,openWorldHint:false}},async(input)=>{try{return result(JSON.stringify(await v270GapRepair(input),null,2));}catch(e){return errorResult(e);}});
  server.registerTool("fullstack_feature_gate_v27",{title:"Full-Stack Feature Gate v27",description:"Block feature completion when completeness, design-system or governance evidence is insufficient.",inputSchema:z.object({feature:z.string().min(2)}),annotations:{readOnlyHint:false,openWorldHint:false}},async(input)=>{try{return result(JSON.stringify(await v270FeatureGate(input),null,2));}catch(e){return errorResult(e);}});
  server.registerTool("fullstack_feature_status_v27",{title:"Full-Stack Feature Status v27",description:"Show v27 feature factory artifacts and status.",inputSchema:z.object({}),annotations:{readOnlyHint:true,openWorldHint:false}},async()=>{try{return result(JSON.stringify(await v270Status(),null,2));}catch(e){return errorResult(e);}});
  // ===== END v27.0 REGISTRATION =====

  // ===== v28.0 APP EVOLUTION & CROSS-FEATURE INTELLIGENCE REGISTRATION =====
  server.registerTool("feature_dependency_map_v28",{title:"Feature Dependency Map v28",description:"Build a cross-feature map across routes, components, APIs, data and shared modules.",inputSchema:z.object({}),annotations:{readOnlyHint:false,openWorldHint:false}},async()=>{try{return result(JSON.stringify(await v280FeatureDependencyMap(),null,2));}catch(e){return errorResult(e);}});
  server.registerTool("cross_feature_conflict_v28",{title:"Cross Feature Conflict v28",description:"Detect files that couple multiple named features and may create cross-feature change risk.",inputSchema:z.object({features:z.array(z.string()).min(2).max(30)}),annotations:{readOnlyHint:false,openWorldHint:false}},async(input)=>{try{return result(JSON.stringify(await v280CrossFeatureConflict(input),null,2));}catch(e){return errorResult(e);}});
  server.registerTool("shared_logic_audit_v28",{title:"Shared Logic Audit v28",description:"Find high-centrality shared modules that deserve protected refactoring and regression coverage.",inputSchema:z.object({}),annotations:{readOnlyHint:false,openWorldHint:false}},async()=>{try{return result(JSON.stringify(await v280SharedLogicAudit(),null,2));}catch(e){return errorResult(e);}});
  server.registerTool("api_duplication_audit_v28",{title:"API Duplication Audit v28",description:"Detect repeated client API endpoints across files to reduce duplicate integration logic.",inputSchema:z.object({}),annotations:{readOnlyHint:false,openWorldHint:false}},async()=>{try{return result(JSON.stringify(await v280ApiDuplicationAudit(),null,2));}catch(e){return errorResult(e);}});
  server.registerTool("component_duplication_audit_v28",{title:"Component Duplication Audit v28",description:"Identify UI files likely duplicating design-system primitives and interaction patterns.",inputSchema:z.object({}),annotations:{readOnlyHint:false,openWorldHint:false}},async()=>{try{return result(JSON.stringify(await v280ComponentDuplicationAudit(),null,2));}catch(e){return errorResult(e);}});
  server.registerTool("feature_evolution_plan_v28",{title:"Feature Evolution Plan v28",description:"Plan a backward-compatible feature evolution across shared contracts, UI, API, data and tests.",inputSchema:z.object({feature:z.string().min(2),goal:z.string().min(3)}),annotations:{readOnlyHint:false,openWorldHint:false}},async(input)=>{try{return result(JSON.stringify(await v280FeatureEvolutionPlan(input),null,2));}catch(e){return errorResult(e);}});
  server.registerTool("cross_feature_regression_scope_v28",{title:"Cross Feature Regression Scope v28",description:"Calculate targeted cross-feature regression scope from changed files and the project graph.",inputSchema:z.object({files:z.array(z.string()).min(1).max(100)}),annotations:{readOnlyHint:false,openWorldHint:false}},async(input)=>{try{return result(JSON.stringify(await v280RegressionScope(input),null,2));}catch(e){return errorResult(e);}});
  server.registerTool("contract_consistency_v28",{title:"Contract Consistency v28",description:"Combine API, schema and design-system compatibility into one cross-feature contract check.",inputSchema:z.object({}),annotations:{readOnlyHint:false,openWorldHint:false}},async()=>{try{return result(JSON.stringify(await v280ContractConsistency(),null,2));}catch(e){return errorResult(e);}});
  server.registerTool("app_evolution_gate_v28",{title:"App Evolution Gate v28",description:"Block app evolution when feature completeness, contracts or governance evidence is insufficient.",inputSchema:z.object({feature:z.string().min(2)}),annotations:{readOnlyHint:false,openWorldHint:false}},async(input)=>{try{return result(JSON.stringify(await v280AppEvolutionGate(input),null,2));}catch(e){return errorResult(e);}});
  server.registerTool("app_evolution_status_v28",{title:"App Evolution Status v28",description:"Show v28 cross-feature evolution artifacts and status.",inputSchema:z.object({}),annotations:{readOnlyHint:true,openWorldHint:false}},async()=>{try{return result(JSON.stringify(await v280EvolutionStatus(),null,2));}catch(e){return errorResult(e);}});
  // ===== END v28.0 REGISTRATION =====

  // ===== v29.0 PRODUCT INTELLIGENCE & JOURNEY ORCHESTRATOR REGISTRATION =====
  server.registerTool("journey_map_v29",{title:"Journey Map v29",description:"Map a user journey against project routes and required product stages.",inputSchema:z.object({journey:z.string().min(2),actors:z.array(z.string()).optional()}),annotations:{readOnlyHint:false,openWorldHint:false}},async(input)=>{try{return result(JSON.stringify(await v290JourneyMap(input),null,2));}catch(e){return errorResult(e);}});
  server.registerTool("persona_flow_v29",{title:"Persona Flow v29",description:"Create a persona-to-goal flow with acceptance requirements.",inputSchema:z.object({persona:z.string().min(2),goal:z.string().min(3)}),annotations:{readOnlyHint:false,openWorldHint:false}},async(input)=>{try{return result(JSON.stringify(await v290PersonaFlow(input),null,2));}catch(e){return errorResult(e);}});
  server.registerTool("outcome_kpi_v29",{title:"Outcome KPI v29",description:"Define privacy-safe outcome KPIs for a feature.",inputSchema:z.object({feature:z.string().min(2)}),annotations:{readOnlyHint:false,openWorldHint:false}},async(input)=>{try{return result(JSON.stringify(await v290OutcomeKpi(input),null,2));}catch(e){return errorResult(e);}});
  server.registerTool("journey_gap_scan_v29",{title:"Journey Gap Scan v29",description:"Detect likely missing loading, error, empty and success states in large UI flows.",inputSchema:z.object({journey:z.string().min(2)}),annotations:{readOnlyHint:false,openWorldHint:false}},async(input)=>{try{return result(JSON.stringify(await v290JourneyGapScan(input),null,2));}catch(e){return errorResult(e);}});
  server.registerTool("funnel_model_v29",{title:"Funnel Model v29",description:"Generate a journey funnel event model without inventing analytics data.",inputSchema:z.object({journey:z.string().min(2),stages:z.array(z.string()).optional()}),annotations:{readOnlyHint:false,openWorldHint:false}},async(input)=>{try{return result(JSON.stringify(await v290FunnelModel(input),null,2));}catch(e){return errorResult(e);}});
  server.registerTool("cross_journey_conflict_v29",{title:"Cross Journey Conflict v29",description:"Identify shared project signals that may couple multiple user journeys.",inputSchema:z.object({journeys:z.array(z.string()).min(2).max(20)}),annotations:{readOnlyHint:false,openWorldHint:false}},async(input)=>{try{return result(JSON.stringify(await v290CrossJourneyConflict(input),null,2));}catch(e){return errorResult(e);}});
  server.registerTool("journey_regression_v29",{title:"Journey Regression v29",description:"Create journey-oriented regression checks from changed files.",inputSchema:z.object({files:z.array(z.string()).min(1).max(100)}),annotations:{readOnlyHint:false,openWorldHint:false}},async(input)=>{try{return result(JSON.stringify(await v290JourneyRegression(input),null,2));}catch(e){return errorResult(e);}});
  server.registerTool("product_outcome_review_v29",{title:"Product Outcome Review v29",description:"Review feature completeness and app evolution readiness before outcome measurement.",inputSchema:z.object({feature:z.string().min(2)}),annotations:{readOnlyHint:false,openWorldHint:false}},async(input)=>{try{return result(JSON.stringify(await v290ProductOutcomeReview(input),null,2));}catch(e){return errorResult(e);}});
  server.registerTool("journey_gate_v29",{title:"Journey Gate v29",description:"Block release when a critical user journey or product outcome is insufficiently verified.",inputSchema:z.object({journey:z.string().min(2),feature:z.string().min(2),changedFiles:z.array(z.string()).optional()}),annotations:{readOnlyHint:false,openWorldHint:false}},async(input)=>{try{return result(JSON.stringify(await v290JourneyGate(input),null,2));}catch(e){return errorResult(e);}});
  server.registerTool("journey_orchestrator_status_v29",{title:"Journey Orchestrator Status v29",description:"Show v29 product journey intelligence artifacts and status.",inputSchema:z.object({}),annotations:{readOnlyHint:true,openWorldHint:false}},async()=>{try{return result(JSON.stringify(await v290Status(),null,2));}catch(e){return errorResult(e);}});
  // ===== END v29.0 REGISTRATION =====
  // ===== v30.0 PRODUCT EXPERIMENTATION & OPTIMIZATION REGISTRATION =====
  server.registerTool("experiment_plan_v30",{title:"Experiment Plan v30",description:"Create a controlled product experiment plan with metrics and guardrails.",inputSchema:z.object({feature:z.string().min(2),hypothesis:z.string().min(5),metric:z.string().optional()}),annotations:{readOnlyHint:false,openWorldHint:false}},async(input)=>{try{return result(JSON.stringify(await v300ExperimentPlan(input),null,2));}catch(e){return errorResult(e);}});
  server.registerTool("ab_readiness_v30",{title:"A/B Readiness v30",description:"Check whether a feature is ready for controlled experimentation.",inputSchema:z.object({feature:z.string().min(2)}),annotations:{readOnlyHint:false,openWorldHint:false}},async(input)=>{try{return result(JSON.stringify(await v300AbReadiness(input),null,2));}catch(e){return errorResult(e);}});
  server.registerTool("kpi_guardrails_v30",{title:"KPI Guardrails v30",description:"Define non-regression guardrails around a primary experiment metric.",inputSchema:z.object({feature:z.string().min(2),primaryMetric:z.string().min(2)}),annotations:{readOnlyHint:false,openWorldHint:false}},async(input)=>{try{return result(JSON.stringify(await v300KpiGuardrails(input),null,2));}catch(e){return errorResult(e);}});
  server.registerTool("rollout_cohorts_v30",{title:"Rollout Cohorts v30",description:"Plan deterministic rollout cohorts for product experiments.",inputSchema:z.object({feature:z.string().min(2),strategy:z.enum(['percentage','role','internal']).optional()}),annotations:{readOnlyHint:false,openWorldHint:false}},async(input)=>{try{return result(JSON.stringify(await v300RolloutCohorts(input),null,2));}catch(e){return errorResult(e);}});
  server.registerTool("behavioral_telemetry_contract_v30",{title:"Behavioral Telemetry Contract v30",description:"Create a privacy-aware telemetry event contract for a feature journey.",inputSchema:z.object({feature:z.string().min(2)}),annotations:{readOnlyHint:false,openWorldHint:false}},async(input)=>{try{return result(JSON.stringify(await v300TelemetryContract(input),null,2));}catch(e){return errorResult(e);}});
  server.registerTool("hypothesis_tracker_v30",{title:"Hypothesis Tracker v30",description:"Track product hypotheses, decisions and supporting evidence.",inputSchema:z.object({feature:z.string().min(2),hypothesis:z.string().min(5),decision:z.string().optional(),evidence:z.array(z.string()).optional()}),annotations:{readOnlyHint:false,openWorldHint:false}},async(input)=>{try{return result(JSON.stringify(await v300HypothesisTracker(input),null,2));}catch(e){return errorResult(e);}});
  server.registerTool("ux_optimization_loop_v30",{title:"UX Optimization Loop v30",description:"Build an evidence-driven UX optimization loop for a feature.",inputSchema:z.object({feature:z.string().min(2)}),annotations:{readOnlyHint:false,openWorldHint:false}},async(input)=>{try{return result(JSON.stringify(await v300UxOptimizationLoop(input),null,2));}catch(e){return errorResult(e);}});
  server.registerTool("anomaly_detection_rules_v30",{title:"Anomaly Detection Rules v30",description:"Define experiment anomaly rules without inventing thresholds.",inputSchema:z.object({feature:z.string().min(2)}),annotations:{readOnlyHint:false,openWorldHint:false}},async(input)=>{try{return result(JSON.stringify(await v300AnomalyRules(input),null,2));}catch(e){return errorResult(e);}});
  server.registerTool("experiment_evidence_v30",{title:"Experiment Evidence v30",description:"Validate that experiment conclusions have attributable evidence.",inputSchema:z.object({feature:z.string().min(2),evidence:z.array(z.string()).min(1).max(100)}),annotations:{readOnlyHint:false,openWorldHint:false}},async(input)=>{try{return result(JSON.stringify(await v300ExperimentEvidence(input),null,2));}catch(e){return errorResult(e);}});
  server.registerTool("optimization_gate_v30",{title:"Optimization Gate v30",description:"Block optimization rollout when readiness or experiment evidence is insufficient.",inputSchema:z.object({feature:z.string().min(2),hypothesis:z.string().min(5),evidence:z.array(z.string()).optional()}),annotations:{readOnlyHint:false,openWorldHint:false}},async(input)=>{try{return result(JSON.stringify(await v300OptimizationGate(input),null,2));}catch(e){return errorResult(e);}});
  server.registerTool("optimization_status_v30",{title:"Optimization Status v30",description:"Show v30 product optimization artifacts and status.",inputSchema:z.object({}),annotations:{readOnlyHint:true,openWorldHint:false}},async()=>{try{return result(JSON.stringify(await v300OptimizationStatus(),null,2));}catch(e){return errorResult(e);}});
  // ===== END v30.0 REGISTRATION =====

  // ===== v31.0 WORKSPACE BOOTSTRAP & SELF-REPAIR REGISTRATION =====
  server.registerTool("workspace_bootstrap_v31",{title:"Workspace Bootstrap v31",description:"Initialize safe KROM runtime folders, config and env template under KROM_HOME.",inputSchema:z.object({}),annotations:{readOnlyHint:false,openWorldHint:false}},async()=>{try{return result(JSON.stringify(await v310WorkspaceBootstrap(),null,2));}catch(e){return errorResult(e);}});
  server.registerTool("runtime_doctor_v31",{title:"Runtime Doctor v31",description:"Diagnose KROM_HOME, project root, Node, npm, Git, startup files and package metadata.",inputSchema:z.object({}),annotations:{readOnlyHint:true,openWorldHint:false}},async()=>{try{return result(JSON.stringify(await v310RuntimeDoctor(),null,2));}catch(e){return errorResult(e);}});
  server.registerTool("port_diagnostics_v31",{title:"Port Diagnostics v31",description:"Check whether the configured local KROM port is already in use.",inputSchema:z.object({port:z.number().int().min(1).max(65535).optional()}),annotations:{readOnlyHint:true,openWorldHint:false}},async(input)=>{try{return result(JSON.stringify(await v310PortDiagnostics(input),null,2));}catch(e){return errorResult(e);}});
  server.registerTool("env_template_v31",{title:"Environment Template v31",description:"Create a safe .env.example for C:\\KSA-FORGE without secrets.",inputSchema:z.object({}),annotations:{readOnlyHint:false,openWorldHint:false}},async()=>{try{return result(JSON.stringify(await v310EnvTemplate(),null,2));}catch(e){return errorResult(e);}});
  server.registerTool("installation_repair_plan_v31",{title:"Installation Repair Plan v31",description:"Build a deterministic repair plan from current runtime diagnostics.",inputSchema:z.object({}),annotations:{readOnlyHint:false,openWorldHint:false}},async()=>{try{return result(JSON.stringify(await v310RepairPlan(),null,2));}catch(e){return errorResult(e);}});
  server.registerTool("startup_integrity_gate_v31",{title:"Startup Integrity Gate v31",description:"Block startup readiness when required runtime checks or the configured port fail.",inputSchema:z.object({}),annotations:{readOnlyHint:true,openWorldHint:false}},async()=>{try{return result(JSON.stringify(await v310StartupIntegrityGate(),null,2));}catch(e){return errorResult(e);}});
  server.registerTool("install_status_v31",{title:"Install Status v31",description:"Show current v31 bootstrap state and configured KROM paths.",inputSchema:z.object({}),annotations:{readOnlyHint:true,openWorldHint:false}},async()=>{try{return result(JSON.stringify(await v310InstallStatus(),null,2));}catch(e){return errorResult(e);}});
  // ===== END v31.0 REGISTRATION =====


  
}
