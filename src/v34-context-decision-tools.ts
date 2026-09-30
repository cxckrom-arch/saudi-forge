import fs from "node:fs/promises";
import path from "node:path";
import * as z from "zod/v4";

type ResultFn = (text: string) => any;
type ErrorResultFn = (error: unknown) => any;

export function registerV34ContextDecisionTools(
  server: any,
  deps: {
    projectRoot: string;
    smartContextFile: string;
    result: ResultFn;
    errorResult: ErrorResultFn;
    buildSmartContext: (...args: any[]) => Promise<any>;
    kromStatePath: (file: string) => Promise<string>;
    decideExecutionStrategy: (...args: any[]) => any;
    readCodeIntelligenceGraph: () => Promise<any>;
    buildCodeIntelligenceGraph: (...args: any[]) => Promise<any>;
  }
) {
  const {
    projectRoot,
    smartContextFile,
    result,
    errorResult,
    buildSmartContext,
    kromStatePath,
    decideExecutionStrategy,
    readCodeIntelligenceGraph,
    buildCodeIntelligenceGraph
  } = deps;

  // =========================================================
  // v3.4 SMART CONTEXT + DECISION ENGINE TOOLS
  // =========================================================

  server.registerTool(
    "smart_context_build",
    {
      title: "Smart Context Builder",
      description: "Build a compact, evidence-based project context for the current task using query relevance, code dependencies, changed files, shared hotspots, routes, project memory, and a bounded context budget.",
      inputSchema: z.object({
        task: z.string().min(3),
        maxFiles: z.number().int().min(5).max(100).default(30),
        maxChars: z.number().int().min(20000).max(500000).default(120000),
        refreshGraph: z.boolean().default(false)
      }),
      annotations: { readOnlyHint: false, openWorldHint: false }
    },
    async ({ task, maxFiles, maxChars, refreshGraph }) => {
      try {
        const bundle = await buildSmartContext(task, maxFiles, maxChars, refreshGraph);
        return result(JSON.stringify({
          status: "OK",
          generatedAt: bundle.generatedAt,
          selectedFiles: bundle.selected,
          omittedHighRisk: bundle.omittedHighRisk,
          estimatedChars: bundle.estimatedChars,
          budgetChars: bundle.tokenBudgetChars,
          changedFiles: bundle.changedFiles,
          memorySummary: bundle.memorySummary,
          contextFile: `.krom/${smartContextFile}`,
          rule: "Inspect selected files first. Do not broaden context blindly; expand through Code Intelligence only when a missing dependency is evidenced."
        }, null, 2));
      } catch (error) { return errorResult(error); }
    }
  );

  server.registerTool(
    "context_file_pack",
    {
      title: "Context File Pack",
      description: "Read the currently selected Smart Context files into a bounded evidence pack with per-file truncation. Designed to feed implementation agents only the relevant source instead of the whole repository.",
      inputSchema: z.object({
        perFileChars: z.number().int().min(1000).max(30000).default(10000),
        maxTotalChars: z.number().int().min(5000).max(250000).default(80000)
      }),
      annotations: { readOnlyHint: true, openWorldHint: false }
    },
    async ({ perFileChars, maxTotalChars }) => {
      try {
        let bundle: any = null;
        try { bundle = JSON.parse(await fs.readFile(await kromStatePath(smartContextFile), "utf8")); } catch {}
        if (!bundle) return result(JSON.stringify({ status: "NO_CONTEXT", nextStep: "Run smart_context_build first." }, null, 2));
        const files: Array<{ file: string; kind: string; score: number; truncated: boolean; content: string }> = [];
        let total = 0;
        for (const item of bundle.selected) {
          if (total >= maxTotalChars) break;
          let content = "";
          try { content = await fs.readFile(path.join(projectRoot, item.file), "utf8"); } catch { continue; }
          const limit = Math.min(perFileChars, maxTotalChars - total);
          const sliced = content.slice(0, Math.max(0, limit));
          files.push({ file: item.file, kind: item.kind, score: item.score, truncated: sliced.length < content.length, content: sliced });
          total += sliced.length;
        }
        return result(JSON.stringify({ status: "OK", query: bundle.query, totalChars: total, files, warning: "Truncated files must be read directly before editing any omitted section." }, null, 2));
      } catch (error) { return errorResult(error); }
    }
  );

  server.registerTool(
    "decision_engine",
    {
      title: "Engineering Decision Engine",
      description: "Choose a task-specific execution mode, agent route, risk level, mandatory pre-change analysis, and post-change verification using Smart Context evidence rather than a fixed workflow.",
      inputSchema: z.object({
        task: z.string().min(3),
        rebuildContext: z.boolean().default(true)
      }),
      annotations: { readOnlyHint: false, openWorldHint: false }
    },
    async ({ task, rebuildContext }) => {
      try {
        let bundle: any = null;
        if (!rebuildContext) {
          try { bundle = JSON.parse(await fs.readFile(await kromStatePath(smartContextFile), "utf8")); } catch {}
        }
        if (!bundle || bundle.query !== task) bundle = await buildSmartContext(task, 30, 120000, false);
        const strategy = decideExecutionStrategy(task, bundle);
        return result(JSON.stringify({
          task,
          strategy,
          context: { selectedFiles: bundle.selected.map(x => x.file), omittedHighRisk: bundle.omittedHighRisk.map(x => x.file), estimatedChars: bundle.estimatedChars },
          executionOrder: [
            "Read project memory and smart context",
            "Run impact analysis for shared/high-risk targets",
            "Implement a narrow change",
            "Build regression scope from actual changed files",
            "Run targeted checks and browser/visual checks when UI is affected",
            "Run release gate and repair failures before DONE"
          ]
        }, null, 2));
      } catch (error) { return errorResult(error); }
    }
  );

  server.registerTool(
    "context_gap_check",
    {
      title: "Context Gap Check",
      description: "Detect likely missing context before implementation by checking unresolved imports, omitted high-risk files, empty task matches, and dependency-neighbor coverage.",
      inputSchema: z.object({}),
      annotations: { readOnlyHint: true, openWorldHint: false }
    },
    async () => {
      try {
        let bundle: any = null;
        try { bundle = JSON.parse(await fs.readFile(await kromStatePath(smartContextFile), "utf8")); } catch {}
        if (!bundle) return result(JSON.stringify({ status: "NO_CONTEXT", nextStep: "Run smart_context_build first." }, null, 2));
        const graph = (await readCodeIntelligenceGraph()) || await buildCodeIntelligenceGraph();
        const selected = new Set<string>((bundle.selected as any[]).map((x: any) => String(x.file)));
        const missingNeighbors = new Set<string>();
        for (const file of selected) {
          const node = graph.nodes[file];
          if (!node) continue;
          for (const dep of node.imports) if (!selected.has(dep)) missingNeighbors.add(dep);
        }
        const gaps = [] as Array<{ severity: string; issue: string; files?: string[] }>;
        if (!bundle.selected.length) gaps.push({ severity: "critical", issue: "No files matched the task context." });
        if (bundle.omittedHighRisk.length) gaps.push({ severity: "major", issue: "High-risk relevant files were omitted by the context budget.", files: bundle.omittedHighRisk.map(x => x.file) });
        if (missingNeighbors.size > 12) gaps.push({ severity: "minor", issue: "Many direct dependencies are outside the selected context; inspect only those needed by the target symbols.", files: [...missingNeighbors].slice(0, 25) });
        if (graph.unresolvedImports.length) gaps.push({ severity: "minor", issue: "Code Intelligence has unresolved local imports; path aliases or generated modules may need configuration review.", files: graph.unresolvedImports.slice(0, 20).map(x => `${x.from} -> ${x.specifier}`) });
        return result(JSON.stringify({ status: gaps.some(x => x.severity === "critical") ? "BLOCKED" : gaps.length ? "REVIEW" : "READY", gaps, selectedCount: bundle.selected.length, rule: "Resolve critical context gaps before editing. Major gaps require explicit inspection before touching related high-risk files." }, null, 2));
      } catch (error) { return errorResult(error); }
    }
  );






}
