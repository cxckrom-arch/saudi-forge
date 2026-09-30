import fs from "node:fs/promises";

export function createPredictiveEngineeringService(options:{
  kromStatePath:(file:string)=>Promise<string>;
  readCodeIntelligenceGraph:()=>Promise<any>;
  buildCodeIntelligenceGraph:(...args:any[])=>Promise<any>;
  buildSmartContext:(...args:any[])=>Promise<any>;
  dependencyReach:(...args:any[])=>any;
  riskForImpact:(...args:any[])=>any;
  normalizeRel:(value:string)=>string;
  readAutopilotState:()=>Promise<any>;
  decideExecutionStrategy:(...args:any[])=>any;
}) {
  const {
    kromStatePath,
    readCodeIntelligenceGraph,
    buildCodeIntelligenceGraph,
    buildSmartContext,
    dependencyReach,
    riskForImpact,
    normalizeRel,
    readAutopilotState,
    decideExecutionStrategy
  }=options;

// KROM v3.9 PREDICTIVE ENGINEERING + CHANGE SIMULATION
// =========================================================
const CHANGE_SIMULATION_FILE = "change-simulation.json";
const PREFLIGHT_HISTORY_FILE = "preflight-history.json";

type ChangeSimulation = {
  version: 1;
  id: string;
  generatedAt: string;
  task: string;
  targetFiles: string[];
  affectedFiles: string[];
  affectedRoutes: string[];
  dependencies: string[];
  dependents: string[];
  dataFiles: string[];
  configFiles: string[];
  risk: { score: number; level: "LOW"|"MEDIUM"|"HIGH"; reasons: string[] };
  verificationPlan: string[];
  rollbackPlan: string[];
  unresolvedImports: Array<{from:string;specifier:string}>;
};

async function appendPreflightHistory(event:any){
  const fp=await kromStatePath(PREFLIGHT_HISTORY_FILE); let rows:any[]=[];
  try { rows=JSON.parse(await fs.readFile(fp,"utf8")); } catch {}
  rows.push({at:new Date().toISOString(),...event});
  await fs.writeFile(fp,JSON.stringify(rows.slice(-1000),null,2),"utf8");
}

function uniqueStrings(items:string[]){ return [...new Set(items.filter(Boolean))]; }

async function buildChangeSimulation(task:string,targetFiles:string[],depth=2): Promise<ChangeSimulation> {
  let graph=await readCodeIntelligenceGraph();
  if (!graph) graph=await buildCodeIntelligenceGraph();
  const known=new Set(Object.keys(graph.nodes));
  const normalized=uniqueStrings(targetFiles.map(normalizeRel)).filter(f=>known.has(f));
  let targets=normalized;
  if (!targets.length) {
    const ctx=await buildSmartContext(task,20,80000,false);
    targets=ctx.selected.map(x=>x.file).filter(f=>known.has(f)).slice(0,12);
  }
  const depReach=dependencyReach(graph,targets,"dependencies",Math.max(1,Math.min(depth,4)));
  const dependentReach=dependencyReach(graph,targets,"dependents",Math.max(1,Math.min(depth,4)));
  const affected=uniqueStrings([...targets,...depReach.all,...dependentReach.all]);
  const nodes=affected.map(f=>graph!.nodes[f]).filter(Boolean);
  const routes=uniqueStrings(nodes.flatMap(n=>n.routes));
  const dataFiles=affected.filter(f=>graph!.nodes[f]?.kind==="data");
  const configFiles=affected.filter(f=>graph!.nodes[f]?.kind==="config");
  const sharedTargets=targets.filter(f=>(graph!.nodes[f]?.importedBy.length||0)>=5);
  const unresolved=graph.unresolvedImports.filter(x=>affected.includes(x.from)).slice(0,100);
  const base=riskForImpact(targets,dependentReach.all,routes,dataFiles.length>0,configFiles.length>0);
  let score=base.score + Math.min(20,sharedTargets.length*5) + Math.min(15,unresolved.length*3);
  score=Math.min(100,score);
  const level: "LOW"|"MEDIUM"|"HIGH" = score>=65?"HIGH":score>=30?"MEDIUM":"LOW";
  const reasons:string[]=[];
  if (dependentReach.all.length) reasons.push(`${dependentReach.all.length} dependent files may be affected.`);
  if (routes.length) reasons.push(`${routes.length} application routes are in the blast radius.`);
  if (sharedTargets.length) reasons.push(`Shared/high-dependency targets: ${sharedTargets.join(", ")}.`);
  if (dataFiles.length) reasons.push(`Data/database files are affected: ${dataFiles.slice(0,8).join(", ")}.`);
  if (configFiles.length) reasons.push(`Build/runtime configuration may be affected.`);
  if (unresolved.length) reasons.push(`${unresolved.length} unresolved local imports exist inside the predicted scope.`);
  if (!reasons.length) reasons.push("Change appears localized based on the current dependency graph.");
  const verificationPlan=uniqueStrings([
    "Run typecheck/build for the project.",
    targets.some(f=>/test|spec|__tests__/i.test(f))?"Run the directly affected tests.":"Run regression tests for affected dependents.",
    routes.length?`Exercise affected routes: ${routes.slice(0,12).join(", ")}.`:"Run targeted functional verification for the changed feature.",
    affected.some(f=>/tsx|jsx|vue|svelte|css|scss/i.test(f))?"Run live browser + responsive visual verification.":"",
    dataFiles.length?"Validate database migrations/RLS/data integrity before release.":"",
    configFiles.length?"Re-run clean production build from configuration baseline.":""
  ]);
  const rollbackPlan=[
    "Create an Autopilot checkpoint before editing target files.",
    "Record changed files and verification evidence after each phase.",
    level==="HIGH"?"Use a narrow staged change; rollback immediately on confirmed regression.":"Keep rollback checkpoint until release gate passes."
  ];
  const sim:ChangeSimulation={version:1,id:`SIM-${Date.now()}`,generatedAt:new Date().toISOString(),task,targetFiles:targets,affectedFiles:affected,affectedRoutes:routes,dependencies:depReach.all,dependents:dependentReach.all,dataFiles,configFiles,risk:{score,level,reasons},verificationPlan,rollbackPlan,unresolvedImports:unresolved};
  await fs.writeFile(await kromStatePath(CHANGE_SIMULATION_FILE),JSON.stringify(sim,null,2),"utf8");
  return sim;
}

async function readChangeSimulation(): Promise<ChangeSimulation|null>{
  try { return JSON.parse(await fs.readFile(await kromStatePath(CHANGE_SIMULATION_FILE),"utf8")); } catch { return null; }
}

async function evaluatePreflight(sim:ChangeSimulation, requireCheckpoint=true){
  const blockers:string[]=[]; const warnings:string[]=[]; const evidence:string[]=[];
  const autopilot=await readAutopilotState();
  if (!sim.targetFiles.length) blockers.push("No concrete target files were resolved from the task.");
  if (requireCheckpoint && !autopilot?.checkpointId) blockers.push("No rollback checkpoint is active.");
  else if (autopilot?.checkpointId) evidence.push(`checkpoint:${autopilot.checkpointId}`);
  if (sim.risk.level==="HIGH" && sim.verificationPlan.length<3) blockers.push("High-risk change has an insufficient verification plan.");
  if (sim.dataFiles.length && !sim.verificationPlan.some(x=>/database|migration|rls/i.test(x))) blockers.push("Database/data changes lack a database verification step.");
  if (sim.configFiles.length) warnings.push("Configuration files are in scope; validate a clean production build.");
  if (sim.unresolvedImports.length) warnings.push(`${sim.unresolvedImports.length} unresolved imports exist in the predicted blast radius.`);
  if (sim.dependents.length>=15) warnings.push("Large dependent blast radius; prefer staged implementation and targeted regression checks.");
  if (sim.affectedRoutes.length) evidence.push(`routes:${sim.affectedRoutes.length}`);
  evidence.push(`risk:${sim.risk.level}:${sim.risk.score}`);
  const status=blockers.length?"BLOCKED":warnings.length?"PASS_WITH_WARNINGS":"PASS";
  return {status,blockers,warnings,evidence,simulationId:sim.id,rule:status==="BLOCKED"?"Do not edit until blockers are resolved.":"Proceed only within the simulated scope and re-run impact analysis if scope expands."};
}

function forecastChangeRisk(sim:ChangeSimulation){
  const categories=[
    {name:"dependency-regression",score:Math.min(100,sim.dependents.length*6+(sim.risk.level==="HIGH"?20:0))},
    {name:"routing-ui-regression",score:Math.min(100,sim.affectedRoutes.length*10+(sim.affectedFiles.some(f=>/tsx|jsx|vue|svelte|css|scss/i.test(f))?20:0))},
    {name:"data-security-regression",score:Math.min(100,sim.dataFiles.length*25+(sim.dataFiles.some(f=>/rls|policy|auth|migration|supabase/i.test(f))?30:0))},
    {name:"build-config-regression",score:Math.min(100,sim.configFiles.length*25)},
    {name:"unknown-import-risk",score:Math.min(100,sim.unresolvedImports.length*15)}
  ].map(x=>({...x,level:x.score>=65?"HIGH":x.score>=30?"MEDIUM":"LOW"}));
  const top=[...categories].sort((a,b)=>b.score-a.score);
  return {overall:sim.risk,categories:top,highestRisk:top[0],recommendedControls:uniqueStrings([
    sim.risk.level==="HIGH"?"Split the change into smaller verified phases.":"Use focused edits and verify immediately.",
    sim.dependents.length?"Run regression tests covering dependent files/components.":"",
    sim.affectedRoutes.length?"Exercise all affected routes in live browser verification.":"",
    sim.dataFiles.length?"Review schema/RLS/migrations with Security + QA before release.":"",
    sim.configFiles.length?"Validate clean install/build and runtime startup.":""
  ])};
}

const RUNTIME_HISTORY_FILE = "adaptive-runtime-history.json";

async function readRuntimeHistory(): Promise<any[]> {
  try { return JSON.parse(await fs.readFile(await kromStatePath(RUNTIME_HISTORY_FILE), "utf8")); }
  catch { return []; }
}

async function writeRuntimeHistory(items: any[]) {
  await fs.writeFile(await kromStatePath(RUNTIME_HISTORY_FILE), JSON.stringify(items.slice(-250), null, 2), "utf8");
}

function chooseAgentForTask(task: string, strategy: any, history: any[]) {
  const q = task.toLowerCase();
  const failed = history.filter(h => h.task === task && h.outcome === "failed");
  const failedAgents = new Set(failed.map(x => x.selectedAgent));
  const candidates: Array<{agent:string; score:number; reasons:string[]}> = [];
  const add=(agent:string, score:number, reason:string)=>{
    let c=candidates.find(x=>x.agent===agent);
    if(!c){c={agent,score:0,reasons:[]}; candidates.push(c)}
    c.score += score; c.reasons.push(reason);
  };
  add("Developer", 20, "default implementation owner");
  if (/(architecture|architect|refactor|structure|معمار|هيكل)/i.test(task) || strategy.mode === "MULTI_PHASE_BUILD") add("Architect", 40, "architecture or broad-build signal");
  if (/(ui|ux|design|واجهة|تصميم|responsive|rtl|css|tailwind)/i.test(task)) add("UI/UX", 45, "visual/interface signal");
  if (/(visual|screenshot|spacing|layout|pixel|بصري|تنسيق)/i.test(task)) add("Visual Designer", 55, "visual quality signal");
  if (/(test|qa|regression|اختبار|تحقق)/i.test(task)) add("QA", 45, "verification signal");
  if (/(security|rls|policy|auth|permission|أمان|صلاحيات)/i.test(task)) add("Database/Security", 55, "security/data-access signal");
  if (/(database|supabase|sql|schema|migration|قاعدة|جدول)/i.test(task)) add("Database/Security", 45, "database signal");
  if (/(deploy|vercel|ci|cd|production|نشر)/i.test(task)) add("DevOps", 55, "deployment signal");
  if (/(error|bug|fix|broken|خطأ|اصلح|إصلاح|اصلاح)/i.test(task)) add("Autonomous Repair", 35, "repair signal");
  if (/(browser|console|network|e2e|متصفح)/i.test(task)) add("Live Browser Vision", 50, "browser evidence signal");
  for (const c of candidates) if (failedAgents.has(c.agent)) { c.score -= 35; c.reasons.push("penalty: same agent previously failed this task"); }
  candidates.sort((a,b)=>b.score-a.score);
  const selected=candidates[0];
  return { selectedAgent:selected.agent, score:selected.score, reason:selected.reasons.join("; "), alternatives:candidates.slice(1,4) };
}

function buildTaskGraph(task: string, strategy: any): any {
  const ui = strategy.agents.includes("UI/UX");
  const db = strategy.agents.includes("Database/Security");
  const deploy = strategy.agents.includes("DevOps");
  const broad = strategy.mode === "MULTI_PHASE_BUILD";
  const nodes: any[] = [];
  const push=(title:string, objective:string, agent:string, dependsOn:string[], verification:string[])=>{
    const id=`T${String(nodes.length+1).padStart(3,"0")}`;
    nodes.push({id,title,objective,agent,dependsOn,verification,status:dependsOn.length?"pending":"ready"});
    return id;
  };
  const t1=push("Context and impact", "Confirm relevant files, dependencies, memory, and blast radius before changing code.", "Code Intelligence", [], ["smart_context_build", "context_gap_check", "impact_analysis"]);
  let prev=t1;
  if (broad) prev=push("Architecture decision", "Define boundaries and implementation sequence without unnecessary rewrites.", "Architect", [prev], ["decision_engine"]);
  if (ui) prev=push("UI/UX direction", "Define visual hierarchy, responsive behavior, RTL, states, and reusable design rules.", "UI/UX", [prev], ["design_ui_prompt", "generate_design_system"]);
  if (db) prev=push("Data and permission contract", "Validate schema, migrations, RLS/permissions, and data integrity before integration.", "Database/Security", [prev], ["impact_analysis"]);
  prev=push("Implementation", "Implement the smallest complete change that satisfies the task and preserves existing behavior.", "Developer", [prev], ["run_typecheck", "run_tests"]);
  const qa=push("Targeted regression", "Test changed and impacted surfaces using the actual change graph.", "QA", [prev], ["regression_scope", "run_tests", "run_typecheck"]);
  let verify=qa;
  if (ui) verify=push("Live UI verification", "Verify real routes at representative viewports and inspect console/network/layout evidence.", "Live Browser Vision", [qa], ["live_browser_vision", "visual_review"]);
  if (deploy) verify=push("Deployment readiness", "Validate production build/deploy constraints and environment assumptions.", "DevOps", [verify], ["run_build"]);
  push("Release gate", "Approve only when requirements and executable evidence are complete.", "Release Gate", [verify], ["release_gate_v31", "execution_audit"]);
  return {version:1,generatedAt:new Date().toISOString(),task,strategy,nodes};
}




// =========================================================


  return {
    changeSimulationFile: CHANGE_SIMULATION_FILE,
    preflightHistoryFile: PREFLIGHT_HISTORY_FILE,
    runtimeHistoryFile: RUNTIME_HISTORY_FILE,
    appendPreflightHistory,
    buildChangeSimulation,
    readChangeSimulation,
    evaluatePreflight,
    forecastChangeRisk,
    readRuntimeHistory,
    writeRuntimeHistory,
    chooseAgentForTask,
    buildTaskGraph
  };
}
