import fs from "node:fs/promises";
import * as z from "zod/v4";

type ResultFn = (text: string) => any;
type ErrorResultFn = (error: unknown) => any;

export function registerV37AutopilotTools(
  server: any,
  deps: {
    taskGraphFile: string;
    autopilotHistoryFile: string;
    result: ResultFn;
    errorResult: ErrorResultFn;
    createAutopilotCheckpoint: (...args: any[]) => Promise<any>;
    createCouncilSession: (...args: any[]) => Promise<any>;
    buildSmartContext: (...args: any[]) => Promise<any>;
    decideExecutionStrategy: (...args: any[]) => any;
    buildChangeSimulation: (...args: any[]) => Promise<any>;
    evaluatePreflight: (...args: any[]) => Promise<any>;
    buildTaskGraph: (...args: any[]) => any;
    kromStatePath: (file: string) => Promise<string>;
    writeAutopilotState: (state: any) => Promise<void>;
    appendAutopilotHistory: (entry: any) => Promise<void>;
    readAutopilotState: () => Promise<any>;
    nextAutopilotPhase: (...args: any[]) => any;
    restoreAutopilotCheckpoint: (...args: any[]) => Promise<any>;
  }
) {
  const {
    taskGraphFile,
    autopilotHistoryFile,
    result,
    errorResult,
    createAutopilotCheckpoint,
    createCouncilSession,
    buildSmartContext,
    decideExecutionStrategy,
    buildChangeSimulation,
    evaluatePreflight,
    buildTaskGraph,
    kromStatePath,
    writeAutopilotState,
    appendAutopilotHistory,
    readAutopilotState,
    nextAutopilotPhase,
    restoreAutopilotCheckpoint
  } = deps;

  // =========================================================
  // v3.7 ENGINEERING AUTOPILOT TOOLS
  // =========================================================
  server.registerTool(
    "engineering_autopilot_start",
    {
      title: "Engineering Autopilot Start",
      description: "Start an evidence-driven end-to-end engineering run. Creates a rollback checkpoint, smart context, execution strategy, task graph, and a resumable autopilot state before edits begin.",
      inputSchema: z.object({ task:z.string().min(5), maxIterations:z.number().int().min(1).max(20).default(8), checkpointFiles:z.array(z.string()).default([]) }),
      annotations:{readOnlyHint:false,openWorldHint:false}
    },
    async ({task,maxIterations,checkpointFiles}) => {
      try {
        const checkpoint=await createAutopilotCheckpoint(`before:${task.slice(0,80)}`, checkpointFiles.length?checkpointFiles:undefined);
        const council=await createCouncilSession(task);
        const bundle=await buildSmartContext(task,30,120000,false);
        const strategy=decideExecutionStrategy(task,bundle);
        const simulation=await buildChangeSimulation(task,checkpointFiles,2);
        const preflight=await evaluatePreflight(simulation,true);
        const graph=buildTaskGraph(task,strategy);
        await fs.writeFile(await kromStatePath(taskGraphFile),JSON.stringify(graph,null,2),"utf8");
        const state:any={id:`AP-${Date.now()}`,task,startedAt:new Date().toISOString(),updatedAt:new Date().toISOString(),phase:"context",checkpointId:checkpoint.id,qualityScore:0,iteration:0,maxIterations,blockers:[],evidence:[`context:${bundle.selected.length}`,`strategy:${strategy.mode}`,`risk:${strategy.risk}`],lastDecision:"Context prepared; execute READY task-graph nodes only.",status:"ACTIVE"};
        await writeany(state); await appendAutopilotHistory({type:"start",state,checkpoint});
        return result(JSON.stringify({status:preflight.status==="BLOCKED"?"PREFLIGHT_BLOCKED":"OK",state,checkpoint,council:{id:council.id,requiredAgents:council.requiredAgents,status:council.status},strategy,simulation:{id:simulation.id,risk:simulation.risk,affectedFiles:simulation.affectedFiles.length,affectedRoutes:simulation.affectedRoutes},preflight,ready:preflight.status==="BLOCKED"?[]:graph.nodes.filter(n=>n.status==="ready"),rule:preflight.status==="BLOCKED"?"Resolve preflight blockers before editing.":"Do not bypass task dependencies. Stay inside the simulated change scope or rerun simulation."},null,2));
      } catch(error){return errorResult(error);}
    }
  );

  server.registerTool(
    "autopilot_checkpoint",
    {
      title:"Autopilot Checkpoint",
      description:"Create a named project checkpoint during an active run so risky changes can be rolled back safely.",
      inputSchema:z.object({label:z.string().min(2),files:z.array(z.string()).default([])}),
      annotations:{readOnlyHint:false,openWorldHint:false}
    },
    async ({label,files})=>{try{const cp=await createAutopilotCheckpoint(label,files.length?files:undefined);const st=await readany();if(st){st.checkpointId=cp.id;await writeany(st);}await appendAutopilotHistory({type:"checkpoint",checkpoint:cp});return result(JSON.stringify({status:"OK",checkpoint:cp},null,2));}catch(error){return errorResult(error);}}
  );

  server.registerTool(
    "autopilot_quality_watchdog",
    {
      title:"Autopilot Quality Watchdog",
      description:"Continuously assess evidence, blockers, regression risk, browser/visual findings, and verification signals. Chooses whether to execute, verify, repair, release, or block.",
      inputSchema:z.object({qualityScore:z.number().min(0).max(100),blockers:z.array(z.string()).default([]),evidence:z.array(z.string()).default([]),decision:z.string().optional()}),
      annotations:{readOnlyHint:false,openWorldHint:false}
    },
    async ({qualityScore,blockers,evidence,decision})=>{
      try{const st=await readany();if(!st)return result(JSON.stringify({status:"NO_ACTIVE_RUN"},null,2));st.iteration++;st.qualityScore=Math.round(qualityScore);st.blockers=blockers;st.evidence=[...new Set([...st.evidence,...evidence])].slice(-300);st.phase=nextAutopilotPhase(st,st.qualityScore,blockers);st.lastDecision=decision||`quality=${st.qualityScore}, blockers=${blockers.length}`;if(st.phase==="blocked")st.status="BLOCKED";if(st.phase==="release"&&st.qualityScore>=90&&!blockers.length)st.status="PASS";await writeany(st);await appendAutopilotHistory({type:"watchdog",state:st});return result(JSON.stringify({status:"OK",state:st,nextAction:st.phase==="repair"?"Run root-cause repair, then re-test.":st.phase==="release"?"Run release gates; do not mark done until they pass.":st.phase==="blocked"?"Stop blind retries and perform deeper diagnosis or rollback.":`Continue ${st.phase}.`},null,2));}catch(error){return errorResult(error);}
    }
  );

  server.registerTool(
    "autopilot_rollback",
    {
      title:"Autopilot Rollback",
      description:"Restore the latest or specified v3.7 checkpoint when a change causes regression. This restores checkpointed files only and records the rollback in autopilot history.",
      inputSchema:z.object({checkpointId:z.string().optional(),reason:z.string().min(3)}),
      annotations:{readOnlyHint:false,openWorldHint:false}
    },
    async ({checkpointId,reason})=>{try{const st=await readany();const id=checkpointId||st?.checkpointId;if(!id)return result(JSON.stringify({status:"NO_CHECKPOINT"},null,2));const restored=await restoreAutopilotCheckpoint(id);if(st){st.status="ROLLED_BACK";st.phase="blocked";st.blockers=[...st.blockers,`Rollback: ${reason}`];st.lastDecision=`Rolled back to ${id}: ${reason}`;await writeany(st);}await appendAutopilotHistory({type:"rollback",checkpointId:id,reason,restored});return result(JSON.stringify({status:"OK",restored,reason},null,2));}catch(error){return errorResult(error);}}
  );

  server.registerTool(
    "engineering_autopilot_status",
    {
      title:"Engineering Autopilot Status",
      description:"Show resumable autopilot state, active phase, quality score, blockers, checkpoint, and recent decisions.",
      inputSchema:z.object({}),annotations:{readOnlyHint:true,openWorldHint:false}
    },
    async()=>{try{const st=await readany();let hist:any[]=[];try{hist=JSON.parse(await fs.readFile(await kromStatePath(autopilotHistoryFile),"utf8"));}catch{}return result(JSON.stringify({status:"OK",state:st,recentHistory:hist.slice(-25),rules:["No DONE without release verification","Rollback on verified regression","Do not repeat identical failed strategy without new evidence","Resume from persisted state after restart"]},null,2));}catch(error){return errorResult(error);}}
  );



}
