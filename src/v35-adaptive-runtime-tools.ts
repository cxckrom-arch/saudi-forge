import fs from "node:fs/promises";
import * as z from "zod/v4";

type ResultFn = (text: string) => any;
type ErrorResultFn = (error: unknown) => any;

export function registerV35AdaptiveRuntimeTools(
  server: any,
  deps: {
    smartContextFile: string;
    taskGraphFile: string;
    result: ResultFn;
    errorResult: ErrorResultFn;
    kromStatePath: (file: string) => Promise<string>;
    buildSmartContext: (...args: any[]) => Promise<any>;
    decideExecutionStrategy: (...args: any[]) => any;
    buildTaskGraph: (...args: any[]) => any;
    readRuntimeHistory: () => Promise<any[]>;
    writeRuntimeHistory: (history: any[]) => Promise<void>;
    chooseAgentForTask: (...args: any[]) => any;
  }
) {
  const {
    smartContextFile,
    taskGraphFile,
    result,
    errorResult,
    kromStatePath,
    buildSmartContext,
    decideExecutionStrategy,
    buildTaskGraph,
    readRuntimeHistory,
    writeRuntimeHistory,
    chooseAgentForTask
  } = deps;

  // =========================================================
  // v3.5 ADAPTIVE AGENT RUNTIME + TASK GRAPH TOOLS
  // =========================================================

  server.registerTool(
    "task_decomposition_graph",
    {
      title: "Task Decomposition Graph",
      description: "Decompose a large prompt into an ordered dependency graph with owners and executable verification gates. Persists the graph under .krom/task-graph.json.",
      inputSchema: z.object({ task: z.string().min(3), rebuildContext: z.boolean().default(true) }),
      annotations: { readOnlyHint: false, openWorldHint: false }
    },
    async ({ task, rebuildContext }) => {
      try {
        let bundle: any = null;
        if (!rebuildContext) { try { bundle = JSON.parse(await fs.readFile(await kromStatePath(smartContextFile), "utf8")); } catch {} }
        if (!bundle || bundle.query !== task) bundle = await buildSmartContext(task, 30, 120000, false);
        const strategy = decideExecutionStrategy(task, bundle);
        const graph = buildany(task, strategy);
        await fs.writeFile(await kromStatePath(taskGraphFile), JSON.stringify(graph, null, 2), "utf8");
        return result(JSON.stringify({ status: "OK", graphFile: `.krom/${taskGraphFile}`, strategy, nodes: graph.nodes, rule: "Execute only READY nodes. A dependent node cannot become READY until every dependency is VERIFIED." }, null, 2));
      } catch (error) { return errorResult(error); }
    }
  );

  server.registerTool(
    "task_graph_update",
    {
      title: "Task Graph Update",
      description: "Update one task-graph node with evidence-aware status and automatically unlock dependent nodes only after verified prerequisites.",
      inputSchema: z.object({
        nodeId: z.string().min(2),
        status: z.enum(["pending","ready","in_progress","verified","blocked"]),
        evidence: z.array(z.string()).default([])
      }),
      annotations: { readOnlyHint: false, openWorldHint: false }
    },
    async ({ nodeId, status, evidence }) => {
      try {
        const fp = await kromStatePath(taskGraphFile);
        const graph: any = JSON.parse(await fs.readFile(fp, "utf8"));
        const node = graph.nodes.find(n => n.id === nodeId);
        if (!node) return result(JSON.stringify({status:"NOT_FOUND",nodeId},null,2));
        if (status === "verified" && evidence.length === 0) return result(JSON.stringify({status:"REJECTED",reason:"Verified requires evidence."},null,2));
        node.status = status;
        for (const n of graph.nodes) {
          if (n.status === "pending" && n.dependsOn.every(id => graph.nodes.find(x=>x.id===id)?.status === "verified")) n.status = "ready";
        }
        await fs.writeFile(fp, JSON.stringify(graph, null, 2), "utf8");
        return result(JSON.stringify({status:"OK",node,ready:graph.nodes.filter(n=>n.status==="ready").map(n=>({id:n.id,title:n.title,agent:n.agent}))},null,2));
      } catch (error) { return errorResult(error); }
    }
  );

  server.registerTool(
    "adaptive_agent_route",
    {
      title: "Adaptive Agent Router",
      description: "Choose the strongest agent for the current subtask using task semantics, execution strategy, and prior failed attempts. Penalizes repeating a failed agent path.",
      inputSchema: z.object({ task: z.string().min(3), recordDecision: z.boolean().default(true) }),
      annotations: { readOnlyHint: false, openWorldHint: false }
    },
    async ({ task, recordDecision }) => {
      try {
        let bundle: any = null;
        try { bundle = JSON.parse(await fs.readFile(await kromStatePath(smartContextFile), "utf8")); } catch {}
        if (!bundle) bundle = await buildSmartContext(task, 30, 120000, false);
        const strategy = decideExecutionStrategy(task, bundle);
        const history = await readRuntimeHistory();
        const choice = chooseAgentForTask(task, strategy, history);
        if (recordDecision) {
          history.push({at:new Date().toISOString(),task,selectedAgent:choice.selectedAgent,reason:choice.reason,evidence:[`mode:${strategy.mode}`,`risk:${strategy.risk}`,`context:${bundle.selected.length} files`]});
          await writeRuntimeHistory(history);
        }
        return result(JSON.stringify({status:"OK",strategy,choice,rule:"If the selected route fails, record the outcome and rerun adaptive_agent_route before repeating the same approach."},null,2));
      } catch (error) { return errorResult(error); }
    }
  );

  server.registerTool(
    "runtime_outcome",
    {
      title: "Runtime Outcome Recorder",
      description: "Record success/failure for an adaptive agent decision so future routing can avoid repeatedly selecting an unsuccessful path.",
      inputSchema: z.object({ task: z.string().min(3), agent: z.string().min(2), outcome: z.enum(["success","failed","partial","blocked"]), evidence: z.array(z.string()).default([]), failureFingerprint: z.string().optional() }),
      annotations: { readOnlyHint: false, openWorldHint: false }
    },
    async ({ task, agent, outcome, evidence, failureFingerprint }) => {
      try {
        const history=await readRuntimeHistory();
        history.push({at:new Date().toISOString(),task,selectedAgent:agent,reason:"runtime outcome",evidence,outcome,failureFingerprint});
        await writeRuntimeHistory(history);
        const sameFailures=history.filter(x=>x.task===task && x.selectedAgent===agent && x.outcome==="failed").length;
        return result(JSON.stringify({status:"OK",sameAgentFailures:sameFailures,nextStep:sameFailures>=2?"Do not repeat the same agent strategy without new evidence; reroute or broaden root-cause analysis.":"Continue according to task graph."},null,2));
      } catch(error){ return errorResult(error); }
    }
  );

  server.registerTool(
    "adaptive_runtime_status",
    {
      title: "Adaptive Runtime Status",
      description: "Show the active task graph, ready/blocked work, and recent adaptive routing outcomes.",
      inputSchema: z.object({}),
      annotations: { readOnlyHint: true, openWorldHint: false }
    },
    async () => {
      try {
        let graph: any=null;
        try { graph=JSON.parse(await fs.readFile(await kromStatePath(taskGraphFile),"utf8")); } catch {}
        const history=await readRuntimeHistory();
        return result(JSON.stringify({status:"OK",taskGraph:graph?{task:graph.task,nodes:graph.nodes,ready:graph.nodes.filter(n=>n.status==="ready").map(n=>n.id),blocked:graph.nodes.filter(n=>n.status==="blocked").map(n=>n.id)}:null,recentDecisions:history.slice(-20)},null,2));
      } catch(error){ return errorResult(error); }
    }
  );



}
