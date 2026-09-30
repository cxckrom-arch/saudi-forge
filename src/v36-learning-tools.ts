import fs from "node:fs/promises";
import * as z from "zod/v4";

type ResultFn = (text: string) => any;
type ErrorResultFn = (error: unknown) => any;

export function registerV36LearningTools(
  server: any,
  deps: {
    smartContextFile: string;
    learningMemoryFile: string;
    decisionLedgerFile: string;
    result: ResultFn;
    errorResult: ErrorResultFn;
    readLearningMemory: () => Promise<any[]>;
    writeLearningMemory: (rows: any[]) => Promise<void>;
    taskTypeOf: (task: string) => string;
    clampConfidence: (value: number) => number;
    summarizeLessons: (...args: any[]) => any;
    kromStatePath: (file: string) => Promise<string>;
    assessDecisionConfidence: (...args: any[]) => any;
    buildSmartContext: (...args: any[]) => Promise<any>;
    decideExecutionStrategy: (...args: any[]) => any;
    readRuntimeHistory: () => Promise<any[]>;
    chooseAgentForTask: (...args: any[]) => any;
  }
) {
  const {
    smartContextFile,
    learningMemoryFile,
    decisionLedgerFile,
    result,
    errorResult,
    readLearningMemory,
    writeLearningMemory,
    taskTypeOf,
    clampConfidence,
    summarizeLessons,
    kromStatePath,
    assessDecisionConfidence,
    buildSmartContext,
    decideExecutionStrategy,
    readRuntimeHistory,
    chooseAgentForTask
  } = deps;

  // =========================================================
  // v3.6 SELF-IMPROVING MEMORY + CONFIDENCE TOOLS
  // =========================================================

  server.registerTool(
    "learning_memory_record",
    {
      title: "Engineering Learning Memory Recorder",
      description: "Store an evidence-backed engineering lesson from a completed or failed attempt so future routing and repair decisions can reuse proven patterns without pretending unverified guesses are learned facts.",
      inputSchema: z.object({
        task: z.string().min(3),
        outcome: z.enum(["success","failed","partial","blocked"]),
        lesson: z.string().min(5),
        evidence: z.array(z.string()).default([]),
        agent: z.string().optional(),
        strategy: z.string().optional(),
        tags: z.array(z.string()).default([]),
        failureFingerprint: z.string().optional(),
        source: z.enum(["runtime","manual","repair","release"]).default("runtime"),
        confidence: z.number().min(0).max(100).default(70)
      }),
      annotations: { readOnlyHint: false, openWorldHint: false }
    },
    async (args) => {
      try {
        const rows=await readLearningMemory();
        const record:any={id:`L${Date.now()}`,at:new Date().toISOString(),taskType:taskTypeOf(args.task),task:args.task,agent:args.agent,strategy:args.strategy,outcome:args.outcome,evidence:args.evidence,failureFingerprint:args.failureFingerprint,lesson:args.lesson,tags:[...new Set((args.tags as string[]).map((x:string)=>x.toLowerCase()))],confidence:clampConfidence(args.confidence),source:args.source};
        if (record.outcome==="success" && record.evidence.length===0) return result(JSON.stringify({status:"REJECTED",reason:"A successful learned pattern requires evidence."},null,2));
        rows.push(record); await writeLearningMemory(rows);
        return result(JSON.stringify({status:"OK",record,memoryFile:`.krom/${learningMemoryFile}`},null,2));
      } catch(error){ return errorResult(error); }
    }
  );

  server.registerTool(
    "learning_memory_recall",
    {
      title: "Engineering Learning Memory Recall",
      description: "Recall prior successful and failed patterns relevant to the current task type, prioritizing evidence-backed high-confidence lessons.",
      inputSchema: z.object({ task: z.string().min(3), limit: z.number().int().min(1).max(30).default(10) }),
      annotations: { readOnlyHint: true, openWorldHint: false }
    },
    async ({task,limit}) => {
      try {
        const rows=await readLearningMemory();
        const type=taskTypeOf(task);
        const scored=rows.map(r=>({r,score:(r.taskType===type?40:0)+(r.outcome==="success"?20:r.outcome==="failed"?10:5)+r.confidence/5+(r.tags.some(t=>task.toLowerCase().includes(t))?20:0)})).sort((a,b)=>b.score-a.score).slice(0,limit).map(x=>x.r);
        return result(JSON.stringify({status:"OK",taskType:type,lessons:scored,summary:summarizeLessons(rows,task),rule:"Treat lessons as prior evidence, not as permission to skip current-project inspection or verification."},null,2));
      } catch(error){ return errorResult(error); }
    }
  );

  server.registerTool(
    "decision_confidence",
    {
      title: "Decision Confidence Scoring",
      description: "Score engineering decision confidence from current context, evidence, unresolved gaps, risk, and prior outcomes. Low confidence blocks broad or irreversible action.",
      inputSchema: z.object({
        task: z.string().min(3),
        evidence: z.array(z.string()).default([]),
        unresolvedGaps: z.number().int().min(0).default(0),
        highRisk: z.boolean().default(false)
      }),
      annotations: { readOnlyHint: true, openWorldHint: false }
    },
    async ({task,evidence,unresolvedGaps,highRisk}) => {
      try {
        let bundle:any=null;
        try { bundle=JSON.parse(await fs.readFile(await kromStatePath(smartContextFile),"utf8")); } catch {}
        const memory=await readLearningMemory();
        const type=taskTypeOf(task);
        const priorSuccesses=memory.filter(r=>r.taskType===type&&r.outcome==="success"&&r.confidence>=70).length;
        const priorFailures=memory.filter(r=>r.taskType===type&&r.outcome==="failed"&&r.confidence>=70).length;
        const assessment=assessDecisionConfidence({contextFiles:bundle?.selected.length||0,evidence,unresolvedGaps,priorSuccesses,priorFailures,highRisk});
        return result(JSON.stringify({status:"OK",taskType:type,assessment,prior:{successes:priorSuccesses,failures:priorFailures},rule:"Confidence never replaces tests. LOW confidence forbids broad or irreversible changes."},null,2));
      } catch(error){ return errorResult(error); }
    }
  );

  server.registerTool(
    "adaptive_strategy_advisor",
    {
      title: "Adaptive Strategy Advisor",
      description: "Combine Smart Context, historical engineering lessons, runtime failures, and confidence scoring into a recommended next strategy without automatically trusting prior patterns.",
      inputSchema: z.object({ task: z.string().min(3) }),
      annotations: { readOnlyHint: false, openWorldHint: false }
    },
    async ({task}) => {
      try {
        let bundle:any=null;
        try { bundle=JSON.parse(await fs.readFile(await kromStatePath(smartContextFile),"utf8")); } catch {}
        if (!bundle || bundle.query!==task) bundle=await buildSmartContext(task,30,120000,false);
        const strategy=decideExecutionStrategy(task,bundle);
        const history=await readRuntimeHistory();
        const memory=await readLearningMemory();
        const type=taskTypeOf(task);
        const learned=memory.filter(r=>r.taskType===type).sort((a,b)=>b.confidence-a.confidence).slice(0,12);
        const failedAgents=new Map<string,number>();
        for (const h of history.filter(x=>x.task===task&&x.outcome==="failed")) failedAgents.set(h.selectedAgent,(failedAgents.get(h.selectedAgent)||0)+1);
        const evidence=[`context:${bundle.selected.length}`,`risk:${strategy.risk}`,`mode:${strategy.mode}`];
        const confidence=assessDecisionConfidence({contextFiles:bundle.selected.length,evidence,unresolvedGaps:bundle.omittedHighRisk.length,priorSuccesses:learned.filter(x=>x.outcome==="success").length,priorFailures:learned.filter(x=>x.outcome==="failed").length,highRisk:strategy.risk==="HIGH"});
        const route=chooseAgentForTask(task,strategy,history);
        const avoid=[...failedAgents.entries()].filter(([,n])=>n>=2).map(([agent])=>agent);
        const advice={
          mode:strategy.mode,risk:strategy.risk,selectedAgent:avoid.includes(route.selectedAgent)?route.alternatives.find(a=>!avoid.includes(a.agent))?.agent||route.selectedAgent:route.selectedAgent,
          avoidAgents:avoid,confidence,
          provenPatterns:learned.filter(x=>x.outcome==="success"&&x.confidence>=70).slice(0,5).map(x=>x.lesson),
          failureWarnings:learned.filter(x=>x.outcome==="failed"&&x.confidence>=70).slice(0,5).map(x=>x.lesson),
          nextSteps:confidence.band==="LOW"?["Inspect missing context","Narrow target files","Collect direct evidence before editing"]:["Apply narrow evidence-backed change","Run regression scope","Record outcome back into learning memory"]
        };
        const ledgerPath=await kromStatePath(decisionLedgerFile);
        let ledger:any[]=[]; try { ledger=JSON.parse(await fs.readFile(ledgerPath,"utf8")); } catch {}
        ledger.push({at:new Date().toISOString(),task,advice}); await fs.writeFile(ledgerPath,JSON.stringify(ledger.slice(-500),null,2),"utf8");
        return result(JSON.stringify({status:"OK",advice,ledgerFile:`.krom/${decisionLedgerFile}`},null,2));
      } catch(error){ return errorResult(error); }
    }
  );

  server.registerTool(
    "learning_memory_status",
    {
      title: "Self-Improving Memory Status",
      description: "Show what KROM has learned, success/failure ratios by task type, and low-confidence lessons that should not influence execution strongly.",
      inputSchema: z.object({}),
      annotations: { readOnlyHint: true, openWorldHint: false }
    },
    async () => {
      try {
        const rows=await readLearningMemory();
        const groups:any={};
        for (const r of rows){ const g=groups[r.taskType] ||= {total:0,success:0,failed:0,partial:0,blocked:0,avgConfidence:0,sum:0}; g.total++; g[r.outcome]++; g.sum+=r.confidence; g.avgConfidence=Math.round(g.sum/g.total); }
        return result(JSON.stringify({status:"OK",total:rows.length,byTaskType:groups,recent:rows.slice(-20),lowConfidence:rows.filter(r=>r.confidence<55).slice(-20),rule:"Low-confidence lessons are advisory only and must not drive autonomous edits."},null,2));
      } catch(error){ return errorResult(error); }
    }
  );



}
