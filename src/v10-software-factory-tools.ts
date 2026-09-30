import * as z from "zod/v4";

type ResultFn = (text: string) => any;
type ErrorResultFn = (error: unknown) => any;

export function registerV10SoftwareFactoryTools(
  server: any,
  deps: {
    specFile: string;
    archFile: string;
    migrationFile: string;
    e2eFile: string;
    visualRegressionFile: string;
    releaseNotesFile: string;
    cicdFile: string;
    qualityBudgetFile: string;
    result: ResultFn;
    errorResult: ErrorResultFn;
    v100SpecPipeline: (...args: any[]) => Promise<any>;
    v100ArchitectureGraph: () => Promise<any>;
    v100MigrationPlanner: (...args: any[]) => Promise<any>;
    v100E2EScenarios: (...args: any[]) => Promise<any>;
    v100VisualRegression: (...args: any[]) => Promise<any>;
    v100ReleaseNotes: (...args: any[]) => Promise<any>;
    v100CicdOrchestrator: () => Promise<any>;
    v100QualityBudget: (...args: any[]) => Promise<any>;
    v100TelemetryRecord: (...args: any[]) => Promise<any>;
    v100Blueprint: (...args: any[]) => Promise<any>;
    v100FactoryStatus: () => Promise<any>;
  }
) {
  const {
    specFile,
    archFile,
    migrationFile,
    e2eFile,
    visualRegressionFile,
    releaseNotesFile,
    cicdFile,
    qualityBudgetFile,
    result,
    errorResult,
    v100SpecPipeline,
    v100ArchitectureGraph,
    v100MigrationPlanner,
    v100E2EScenarios,
    v100VisualRegression,
    v100ReleaseNotes,
    v100CicdOrchestrator,
    v100QualityBudget,
    v100TelemetryRecord,
    v100Blueprint,
    v100FactoryStatus
  } = deps;

// ===== v10.0 Autonomous Software Factory =====
  server.registerTool(
    "spec_to_code_pipeline_v10",
    {title:"Spec-to-Code Pipeline v10",description:"Convert a product goal into a gated engineering specification and execution phases before implementation.",inputSchema:z.object({goal:z.string().min(3),constraints:z.array(z.string()).default([])}),annotations:{readOnlyHint:false,openWorldHint:false}},
    async({goal,constraints})=>{try{return result(JSON.stringify({status:"OK",spec:await v100SpecPipeline(goal,constraints),file:`.krom/${specFile}`},null,2));}catch(error){return errorResult(error);}}
  );

  server.registerTool(
    "architecture_graph_v10",
    {title:"Architecture Graph v10",description:"Build a project architecture graph from source modules, imports, routes/pages/components and API surfaces.",inputSchema:z.object({}),annotations:{readOnlyHint:false,openWorldHint:false}},
    async()=>{try{return result(JSON.stringify({status:"OK",graph:await v100ArchitectureGraph(),file:`.krom/${archFile}`},null,2));}catch(error){return errorResult(error);}}
  );

  server.registerTool(
    "migration_planner_v10",
    {title:"Migration Planner v10",description:"Prepare a safe additive database/application migration plan with RLS, rollback and verification requirements.",inputSchema:z.object({target:z.string().min(2)}),annotations:{readOnlyHint:false,openWorldHint:false}},
    async({target})=>{try{return result(JSON.stringify({status:"OK",plan:await v100MigrationPlanner(target),file:`.krom/${migrationFile}`},null,2));}catch(error){return errorResult(error);}}
  );

  server.registerTool(
    "e2e_scenario_generator_v10",
    {title:"E2E Scenario Generator v10",description:"Generate acceptance-focused end-to-end scenarios for happy path, validation, permissions/errors and responsive behavior.",inputSchema:z.object({feature:z.string().min(2)}),annotations:{readOnlyHint:false,openWorldHint:false}},
    async({feature})=>{try{return result(JSON.stringify({status:"OK",...(await v100E2EScenarios(feature)),file:`.krom/${e2eFile}`},null,2));}catch(error){return errorResult(error);}}
  );

  server.registerTool(
    "visual_regression_manager_v10",
    {title:"Visual Regression Manager v10",description:"Manage visual regression policy, routes and viewport baselines for browser verification.",inputSchema:z.object({routes:z.array(z.string()).default([])}),annotations:{readOnlyHint:false,openWorldHint:false}},
    async({routes})=>{try{return result(JSON.stringify({status:"OK",...(await v100VisualRegression(routes)),file:`.krom/${visualRegressionFile}`},null,2));}catch(error){return errorResult(error);}}
  );

  server.registerTool(
    "release_notes_generator_v10",
    {title:"Release Notes Generator v10",description:"Generate evidence-oriented release notes from the latest Git change set without inventing changes.",inputSchema:z.object({version:z.string().min(1)}),annotations:{readOnlyHint:false,openWorldHint:false}},
    async({version})=>{try{return result(JSON.stringify({status:"OK",notes:await v100ReleaseNotes(version),file:`.krom/${releaseNotesFile}`},null,2));}catch(error){return errorResult(error);}}
  );

  server.registerTool(
    "cicd_orchestrator_v10",
    {title:"CI/CD Orchestrator v10",description:"Inspect project scripts and deployment signals and produce a gated CI/CD execution model.",inputSchema:z.object({}),annotations:{readOnlyHint:false,openWorldHint:false}},
    async()=>{try{return result(JSON.stringify({status:"OK",pipeline:await v100CicdOrchestrator(),file:`.krom/${cicdFile}`},null,2));}catch(error){return errorResult(error);}}
  );

  server.registerTool(
    "quality_budget_v10",
    {title:"Quality Budget v10",description:"Define measurable engineering quality budgets for compiler, lint, tests, security, visual quality, bundle size, accessibility and product completeness.",inputSchema:z.object({maxBundleKb:z.number().int().positive().optional(),minAccessibilityScore:z.number().min(0).max(100).optional(),minProductCompleteness:z.number().min(0).max(100).optional()}),annotations:{readOnlyHint:false,openWorldHint:false}},
    async(input)=>{try{return result(JSON.stringify({status:"OK",budget:await v100QualityBudget(input),file:`.krom/${qualityBudgetFile}`},null,2));}catch(error){return errorResult(error);}}
  );

  server.registerTool(
    "engineering_telemetry_v10",
    {title:"Engineering Telemetry v10",description:"Record non-secret engineering metrics such as task duration, test counts, model cost estimates or token usage supplied by the caller.",inputSchema:z.object({kind:z.string(),metric:z.string(),value:z.number(),meta:z.record(z.string(),z.any()).default({})}),annotations:{readOnlyHint:false,openWorldHint:false}},
    async({kind,metric,value,meta})=>{try{return result(JSON.stringify(await v100TelemetryRecord(kind,metric,value,meta),null,2));}catch(error){return errorResult(error);}}
  );

  server.registerTool(
    "project_blueprints_v10",
    {title:"Project Blueprints v10",description:"Create, list or read reusable local project blueprints with required artifacts and quality gates.",inputSchema:z.object({action:z.enum(["list","create","get"]).default("list"),id:z.string().optional(),description:z.string().optional()}),annotations:{readOnlyHint:false,openWorldHint:false}},
    async({action,id,description})=>{try{return result(JSON.stringify(await v100Blueprint(action,id,description),null,2));}catch(error){return errorResult(error);}}
  );

  server.registerTool(
    "software_factory_status_v10",
    {title:"Software Factory Status v10",description:"Summarize whether the v10 specification, architecture, E2E, CI/CD and quality-budget artifacts are ready for autonomous execution.",inputSchema:z.object({}),annotations:{readOnlyHint:true,openWorldHint:false}},
    async()=>{try{return result(JSON.stringify(await v100FactoryStatus(),null,2));}catch(error){return errorResult(error);}}
  );


  
}
