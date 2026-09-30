import path from "node:path";
import * as z from "zod/v4";

type ResultFn = (text: string) => any;
type ErrorResultFn = (error: unknown) => any;

export function registerV33CodeIntelligenceTools(
  server: any,
  deps: {
    result: ResultFn;
    errorResult: ErrorResultFn;
    buildCodeIntelligenceGraph: (...args: any[]) => Promise<any>;
    readCodeIntelligenceGraph: () => Promise<any>;
    dependencyReach: (...args: any[]) => any;
    riskForImpact: (...args: any[]) => any;
    normalizeRel: (value: string) => string;
    readExecutionManifest: () => Promise<any>;
    codeIntelFile: string;
  }
) {
  const {
    result,
    errorResult,
    buildCodeIntelligenceGraph,
    readCodeIntelligenceGraph,
    dependencyReach,
    riskForImpact,
    normalizeRel,
    readExecutionManifest,
    codeIntelFile: CODE_INTEL_FILE
  } = deps;

  // =========================================================
  // v3.3 SMART CODE INTELLIGENCE TOOLS
  // =========================================================

  server.registerTool(
    "code_intelligence_scan",
    {
      title: "Smart Code Intelligence Scan",
      description: "Build a project-level dependency and symbol graph from real source files. Maps local imports, reverse dependents, exported symbols, routes, file roles, and unresolved local imports before broad changes.",
      inputSchema: z.object({ maxFiles: z.number().int().min(100).max(6000).default(3000) }),
      annotations: { readOnlyHint: false, openWorldHint: false }
    },
    async ({ maxFiles }) => {
      try {
        const graph = await buildCodeIntelligenceGraph(maxFiles);
        const hotspots = Object.values(graph.nodes)
          .map(n => ({ file: n.file, dependents: n.importedBy.length, dependencies: n.imports.length, routes: n.routes, kind: n.kind }))
          .sort((a,b) => b.dependents - a.dependents)
          .slice(0, 20);
        return result(JSON.stringify({ generatedAt: graph.generatedAt, stats: graph.stats, unresolvedImports: graph.unresolvedImports.slice(0, 50), hotspots, graphFile: `.krom/${CODE_INTEL_FILE}`, rule: "Run impact_analysis before modifying shared/high-dependency files." }, null, 2));
      } catch (error) { return errorResult(error); }
    }
  );

  server.registerTool(
    "impact_analysis",
    {
      title: "Pre-Change Impact Analysis",
      description: "Analyze blast radius before editing files or symbols. Returns direct/indirect dependents, dependencies, routes, tests, data/config sensitivity, risk score, and a concrete regression verification scope.",
      inputSchema: z.object({
        files: z.array(z.string()).default([]),
        symbol: z.string().optional(),
        depth: z.number().int().min(1).max(6).default(3),
        refreshGraph: z.boolean().default(false)
      }),
      annotations: { readOnlyHint: true, openWorldHint: false }
    },
    async ({ files, symbol, depth, refreshGraph }) => {
      try {
        const graph = refreshGraph ? await buildCodeIntelligenceGraph() : (await readCodeIntelligenceGraph()) || await buildCodeIntelligenceGraph();
        const normalized: string[] = (files as string[]).map(normalizeRel).filter((f: string) => Boolean(graph.nodes[f]));
        if (symbol) {
          for (const n of Object.values(graph.nodes)) {
            if (n.symbols.includes(symbol) || n.exports.includes(symbol)) normalized.push(n.file);
          }
        }
        const starts: string[] = [...new Set<string>(normalized)];
        if (!starts.length) return result(JSON.stringify({ status: "NO_MATCH", message: "No matching project files/symbols found. Run code_intelligence_scan and provide paths relative to project root." }, null, 2));
        const dependentReach = dependencyReach(graph, starts, "dependents", depth);
        const dependencyReachResult = dependencyReach(graph, starts, "dependencies", Math.min(depth, 2));
        const affected = [...new Set([...starts, ...dependentReach.all])];
        const affectedNodes = affected.map(f => graph.nodes[f]).filter(Boolean);
        const routes = [...new Set(affectedNodes.flatMap(n => n.routes))];
        const tests = affected.filter(f => /(?:test|spec|__tests__)/i.test(f));
        const dataFiles = affected.filter(f => graph.nodes[f]?.kind === "data");
        const configFiles = affected.filter(f => graph.nodes[f]?.kind === "config");
        const risk = riskForImpact(starts, dependentReach.all, routes, dataFiles.length > 0, configFiles.length > 0);
        return result(JSON.stringify({
          status: "OK",
          targets: starts,
          risk,
          directDependents: starts.flatMap(f => graph.nodes[f]?.importedBy || []).filter((x,i,a) => a.indexOf(x)===i),
          indirectDependents: dependentReach,
          dependencies: dependencyReachResult,
          affectedRoutes: routes,
          relatedTests: tests,
          dataSensitiveFiles: dataFiles,
          configSensitiveFiles: configFiles,
          verificationScope: {
            always: ["typecheck", "relevant tests", "build when shared/runtime code changes"],
            browser: routes.length ? routes : "Run impacted user flows when UI/routes are affected",
            data: dataFiles.length ? "Verify migrations/RLS/query contracts and preserve existing data" : null
          },
          changeRule: risk.level === "HIGH" ? "Use small reversible patches; verify direct dependents first, then impacted routes, then full gate." : "Patch narrowly and verify listed dependents before release."
        }, null, 2));
      } catch (error) { return errorResult(error); }
    }
  );

  server.registerTool(
    "symbol_intelligence",
    {
      title: "Symbol Intelligence",
      description: "Find where a symbol is declared/exported and which files depend on those declarations. Useful before renaming, moving, or changing shared functions/components/types.",
      inputSchema: z.object({ symbol: z.string().min(1), refreshGraph: z.boolean().default(false) }),
      annotations: { readOnlyHint: true, openWorldHint: false }
    },
    async ({ symbol, refreshGraph }) => {
      try {
        const graph = refreshGraph ? await buildCodeIntelligenceGraph() : (await readCodeIntelligenceGraph()) || await buildCodeIntelligenceGraph();
        const matches = Object.values(graph.nodes).filter(n => n.symbols.includes(symbol) || n.exports.includes(symbol));
        return result(JSON.stringify({ symbol, declarations: matches.map(n => ({ file: n.file, exported: n.exports.includes(symbol), kind: n.kind, directDependents: n.importedBy, routes: n.routes })), count: matches.length }, null, 2));
      } catch (error) { return errorResult(error); }
    }
  );

  server.registerTool(
    "regression_scope",
    {
      title: "Regression Scope Builder",
      description: "Use changed files from the precision execution manifest to compute what should be retested before completion, including impacted routes and dependent source areas.",
      inputSchema: z.object({ depth: z.number().int().min(1).max(5).default(3), refreshGraph: z.boolean().default(true) }),
      annotations: { readOnlyHint: false, openWorldHint: false }
    },
    async ({ depth, refreshGraph }) => {
      try {
        const manifest = await readExecutionManifest();
        const changed = manifest?.changedFiles || [];
        if (!changed.length) return result(JSON.stringify({ status: "NO_CHANGED_FILES", nextStep: "Start precision execution and modify files before building regression scope." }, null, 2));
        const graph = refreshGraph ? await buildCodeIntelligenceGraph() : (await readCodeIntelligenceGraph()) || await buildCodeIntelligenceGraph();
        const starts = changed.map(normalizeRel).filter(f => graph.nodes[f]);
        const reach = dependencyReach(graph, starts, "dependents", depth);
        const impacted = [...new Set([...starts, ...reach.all])];
        const routes = [...new Set(impacted.flatMap(f => graph.nodes[f]?.routes || []))];
        const likelyTests = Object.values(graph.nodes).filter(n => n.kind === "test" && (n.imports.some(i => impacted.includes(i)) || impacted.some(i => n.file.includes(path.posix.basename(i).replace(/\.[^.]+$/, ""))))).map(n => n.file);
        return result(JSON.stringify({ status: "OK", changedFiles: changed, graphMatchedChangedFiles: starts, impactedFiles: impacted, impactedRoutes: routes, likelyTests, recommendedOrder: ["targeted tests", "typecheck", "impacted browser flows", "build", "release gate"], warning: starts.length < changed.length ? "Some changed files are not represented in the current source graph (assets/generated/non-code files may be expected)." : null }, null, 2));
      } catch (error) { return errorResult(error); }
    }
  );



}
