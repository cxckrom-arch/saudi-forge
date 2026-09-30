import fs from "node:fs/promises";
import * as z from "zod/v4";

type ResultFn = (text: string) => any;
type ErrorResultFn = (error: unknown) => any;

export function registerV39PredictiveTools(
  server: any,
  deps: {
    preflightHistoryFile: string;
    result: ResultFn;
    errorResult: ErrorResultFn;
    buildChangeSimulation: (...args: any[]) => Promise<any>;
    readChangeSimulation: () => Promise<any>;
    forecastChangeRisk: (simulation: any) => any;
    evaluatePreflight: (...args: any[]) => Promise<any>;
    appendPreflightHistory: (entry: any) => Promise<void>;
    kromStatePath: (file: string) => Promise<string>;
  }
) {
  const {
    preflightHistoryFile,
    result,
    errorResult,
    buildChangeSimulation,
    readChangeSimulation,
    forecastChangeRisk,
    evaluatePreflight,
    appendPreflightHistory,
    kromStatePath
  } = deps;

  // =========================================================
  // v3.9 PREDICTIVE ENGINEERING + CHANGE SIMULATION TOOLS
  // =========================================================
  server.registerTool(
    "change_simulation",
    {
      title:"Predictive Change Simulation",
      description:"Simulate the blast radius of a proposed change before editing. Resolves target files, dependencies, dependents, affected routes, data/config risk, verification plan, and rollback requirements.",
      inputSchema:z.object({task:z.string().min(5),targetFiles:z.array(z.string()).default([]),depth:z.number().int().min(1).max(4).default(2)}),
      annotations:{readOnlyHint:false,openWorldHint:false}
    },
    async ({task,targetFiles,depth})=>{try{const sim=await buildChangeSimulation(task,targetFiles,depth);return result(JSON.stringify({status:"OK",simulation:sim,rule:"Treat this as a forecast, not proof. Re-run impact analysis if actual edited scope expands."},null,2));}catch(error){return errorResult(error);}}
  );

  server.registerTool(
    "risk_forecast",
    {
      title:"Change Risk Forecast",
      description:"Forecast likely regression categories from the latest or a newly generated change simulation and recommend targeted controls before implementation.",
      inputSchema:z.object({task:z.string().optional(),targetFiles:z.array(z.string()).default([])}),
      annotations:{readOnlyHint:true,openWorldHint:false}
    },
    async ({task,targetFiles})=>{try{let sim=await readChangeSimulation();if(task)sim=await buildChangeSimulation(task,targetFiles,2);if(!sim)return result(JSON.stringify({status:"NO_SIMULATION",nextAction:"Run change_simulation first."},null,2));return result(JSON.stringify({status:"OK",simulationId:sim.id,forecast:forecastChangeRisk(sim)},null,2));}catch(error){return errorResult(error);}}
  );

  server.registerTool(
    "preflight_gate",
    {
      title:"Predictive Preflight Gate",
      description:"Block risky edits before they begin when rollback, target resolution, verification coverage, database safety, or change-scope evidence is insufficient.",
      inputSchema:z.object({task:z.string().optional(),targetFiles:z.array(z.string()).default([]),requireCheckpoint:z.boolean().default(true)}),
      annotations:{readOnlyHint:false,openWorldHint:false}
    },
    async ({task,targetFiles,requireCheckpoint})=>{try{let sim=await readChangeSimulation();if(task)sim=await buildChangeSimulation(task,targetFiles,2);if(!sim)return result(JSON.stringify({status:"NO_SIMULATION",nextAction:"Run change_simulation first."},null,2));const gate=await evaluatePreflight(sim,requireCheckpoint);await appendPreflightHistory({type:"gate",simulationId:sim.id,gate});return result(JSON.stringify(gate,null,2));}catch(error){return errorResult(error);}}
  );

  server.registerTool(
    "change_plan",
    {
      title:"Predictive Change Plan",
      description:"Generate a staged, evidence-driven implementation plan from the latest simulation, ordered to minimize blast radius and preserve rollback options.",
      inputSchema:z.object({}),
      annotations:{readOnlyHint:true,openWorldHint:false}
    },
    async ()=>{try{const sim=await readChangeSimulation();if(!sim)return result(JSON.stringify({status:"NO_SIMULATION",nextAction:"Run change_simulation first."},null,2));const stages:any[]=[];const targets=sim.targetFiles;const data=targets.filter(f=>sim.dataFiles.includes(f));const config=targets.filter(f=>sim.configFiles.includes(f));const ui=targets.filter(f=>/tsx|jsx|vue|svelte|css|scss/i.test(f));const core=targets.filter(f=>!data.includes(f)&&!config.includes(f)&&!ui.includes(f));if(core.length)stages.push({stage:stages.length+1,name:"Core implementation",files:core,verify:["typecheck","targeted tests"]});if(data.length)stages.push({stage:stages.length+1,name:"Data/security changes",files:data,verify:["migration validation","RLS/security review","data integrity checks"]});if(ui.length)stages.push({stage:stages.length+1,name:"UI integration",files:ui,verify:["responsive browser test","visual review","accessibility smoke check"]});if(config.length)stages.push({stage:stages.length+1,name:"Configuration/build",files:config,verify:["clean production build","runtime startup"]});stages.push({stage:stages.length+1,name:"Regression verification",files:sim.dependents.slice(0,50),verify:sim.verificationPlan});return result(JSON.stringify({status:"OK",simulationId:sim.id,risk:sim.risk,stages,rollbackPlan:sim.rollbackPlan,scopeRule:"If implementation touches files outside affectedFiles, pause and rerun change_simulation before continuing."},null,2));}catch(error){return errorResult(error);}}
  );

  server.registerTool(
    "preflight_status",
    {
      title:"Preflight History Status",
      description:"Show the latest change simulation and recent preflight decisions for auditability and resumable engineering work.",
      inputSchema:z.object({}),
      annotations:{readOnlyHint:true,openWorldHint:false}
    },
    async ()=>{try{const sim=await readChangeSimulation();let hist:any[]=[];try{hist=JSON.parse(await fs.readFile(await kromStatePath(preflightHistoryFile),"utf8"));}catch{}return result(JSON.stringify({status:"OK",latestSimulation:sim,recentPreflight:hist.slice(-30),rules:["Simulation is predictive, not proof","High-risk edits require checkpoint and verification plan","Scope expansion requires a new simulation","Release still requires normal test/browser/security gates"]},null,2));}catch(error){return errorResult(error);}}
  );



}
