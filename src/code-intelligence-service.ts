import fs from "node:fs/promises";
import path from "node:path";

export type CodeIntelNode = {
  file: string;
  imports: string[];
  importedBy: string[];
  exports: string[];
  symbols: string[];
  routes: string[];
  kind: string;
};

export type CodeIntelGraph = {
  version: 1;
  generatedAt: string;
  projectRoot: string;
  nodes: Record<string, CodeIntelNode>;
  unresolvedImports: Array<{ from: string; specifier: string }>;
  stats: { files: number; edges: number; routes: number; symbols: number };
};

export function createCodeIntelligenceService(options:{
  projectRoot:string;
  maxFileSize:number;
  codeIntelFile?:string;
  walkProject:(...args:any[])=>Promise<string[]>;
  isTextFile:(file:string)=>boolean;
  kromStatePath:(file:string)=>Promise<string>;
}) {
  const {
    projectRoot,
    maxFileSize,
    codeIntelFile="code-intelligence.json",
    walkProject,
    isTextFile,
    kromStatePath
  }=options;

// KROM v3.3 SMART CODE INTELLIGENCE + IMPACT ANALYSIS
// =========================================================



function normalizeRel(file: string) {
  return file.replace(/\\/g, "/");
}

function classifyCodeFile(rel: string) {
  const x = rel.toLowerCase();
  if (/routes?|pages?|app\//.test(x)) return "route-or-page";
  if (/components?\//.test(x) || /\.tsx$|\.vue$|\.svelte$/.test(x)) return "ui-component";
  if (/services?|api|client|server/.test(x)) return "service";
  if (/store|state|context|provider/.test(x)) return "state";
  if (/test|spec|__tests__/.test(x)) return "test";
  if (/schema|migration|sql|supabase|database|db/.test(x)) return "data";
  if (/config|vite|next\.config|tsconfig|eslint|tailwind/.test(x)) return "config";
  return "source";
}

function extractCodeFacts(content: string, rel: string) {
  const importSpecs: string[] = [];
  const importPatterns = [
    /(?:import|export)\s+(?:[^"']*?\s+from\s+)?["']([^"']+)["']/g,
    /require\(\s*["']([^"']+)["']\s*\)/g,
    /import\(\s*["']([^"']+)["']\s*\)/g
  ];
  for (const re of importPatterns) {
    let m: RegExpExecArray | null;
    while ((m = re.exec(content))) importSpecs.push(m[1]);
  }
  const exports = new Set<string>();
  const symbols = new Set<string>();
  const symbolPatterns = [
    /(?:export\s+)?(?:async\s+)?function\s+([A-Za-z_$][\w$]*)/g,
    /(?:export\s+)?(?:const|let|var|class|interface|type|enum)\s+([A-Za-z_$][\w$]*)/g
  ];
  for (const re of symbolPatterns) {
    let m: RegExpExecArray | null;
    while ((m = re.exec(content))) symbols.add(m[1]);
  }
  const exportPatterns = [
    /export\s+(?:default\s+)?(?:async\s+)?(?:function|class|const|let|var|interface|type|enum)?\s*([A-Za-z_$][\w$]*)?/g,
    /export\s*\{([^}]+)\}/g
  ];
  for (const re of exportPatterns) {
    let m: RegExpExecArray | null;
    while ((m = re.exec(content))) {
      if (m[1]) m[1].split(",").map(x => x.trim().split(/\s+as\s+/i)[1] || x.trim().split(/\s+as\s+/i)[0]).filter(Boolean).forEach(x => exports.add(x));
    }
  }
  const routes = new Set<string>();
  const routePatterns = [
    /(?:path|route|href|to)\s*[:=]\s*["'`]([^"'`]+)["'`]/g,
    /(?:app|router)\.(?:get|post|put|patch|delete|use)\(\s*["'`]([^"'`]+)["'`]/g
  ];
  for (const re of routePatterns) {
    let m: RegExpExecArray | null;
    while ((m = re.exec(content))) if (m[1].startsWith("/")) routes.add(m[1]);
  }
  if (/^(?:src\/)?app\//.test(rel)) {
    const parts = rel.split("/");
    const idx = parts.indexOf("app");
    const routeParts = parts.slice(idx + 1, -1).filter(x => !/^\(.+\)$/.test(x) && !/^@/.test(x));
    if (routeParts.length) routes.add("/" + routeParts.join("/").replace(/\[([^\]]+)\]/g, ":$1"));
  }
  return { importSpecs: [...new Set(importSpecs)], exports: [...exports].filter(Boolean), symbols: [...symbols], routes: [...routes] };
}

async function resolveLocalImport(fromRel: string, specifier: string, available: Set<string>) {
  if (!specifier.startsWith(".") && !specifier.startsWith("@/")) return null;
  const fromDir = path.posix.dirname(fromRel);
  let base = specifier.startsWith("@/") ? `src/${specifier.slice(2)}` : path.posix.normalize(path.posix.join(fromDir, specifier));
  base = base.replace(/^\.\//, "");
  const candidates = [
    base,
    ...[".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs", ".vue", ".svelte", ".json"].map(ext => base + ext),
    ...["index.ts", "index.tsx", "index.js", "index.jsx", "index.vue", "index.svelte"].map(x => `${base}/${x}`)
  ];
  return candidates.find(x => available.has(normalizeRel(x))) || null;
}

async function buildCodeIntelligenceGraph(maxFiles = 3000): Promise<CodeIntelGraph> {
  const all = await walkProject(projectRoot, [], maxFiles);
  const sourceFiles = all.filter(f => isTextFile(f) && /\.(?:ts|tsx|js|jsx|mjs|cjs|vue|svelte|py|go|rs|java|cs|php)$/.test(f));
  const rels = sourceFiles.map(f => normalizeRel(path.relative(projectRoot, f)));
  const available = new Set(rels);
  const nodes: Record<string, CodeIntelNode> = {};
  const unresolvedImports: Array<{ from: string; specifier: string }> = [];
  for (let i = 0; i < sourceFiles.length; i++) {
    const file = sourceFiles[i];
    const rel = rels[i];
    let content = "";
    try { content = await fs.readFile(file, "utf8"); } catch { continue; }
    if (content.length > maxFileSize) continue;
    const facts = extractCodeFacts(content, rel);
    const imports: string[] = [];
    for (const spec of facts.importSpecs) {
      const resolved = await resolveLocalImport(rel, spec, available);
      if (resolved) imports.push(resolved);
      else if (spec.startsWith(".") || spec.startsWith("@/")) unresolvedImports.push({ from: rel, specifier: spec });
    }
    nodes[rel] = { file: rel, imports: [...new Set(imports)], importedBy: [], exports: facts.exports, symbols: facts.symbols, routes: facts.routes, kind: classifyCodeFile(rel) };
  }
  let edges = 0;
  for (const node of Object.values(nodes)) {
    for (const dep of node.imports) {
      edges++;
      if (nodes[dep] && !nodes[dep].importedBy.includes(node.file)) nodes[dep].importedBy.push(node.file);
    }
  }
  const graph: CodeIntelGraph = {
    version: 1,
    generatedAt: new Date().toISOString(),
    projectRoot: projectRoot,
    nodes,
    unresolvedImports,
    stats: {
      files: Object.keys(nodes).length,
      edges,
      routes: Object.values(nodes).reduce((n, x) => n + x.routes.length, 0),
      symbols: Object.values(nodes).reduce((n, x) => n + x.symbols.length, 0)
    }
  };
  await fs.writeFile(await kromStatePath(CODE_INTEL_FILE), JSON.stringify(graph, null, 2), "utf8");
  return graph;
}

async function readCodeIntelligenceGraph(): Promise<CodeIntelGraph | null> {
  try { return JSON.parse(await fs.readFile(await kromStatePath(CODE_INTEL_FILE), "utf8")); } catch { return null; }
}

function dependencyReach(graph: CodeIntelGraph, starts: string[], direction: "dependents" | "dependencies", depth: number) {
  const seen = new Set(starts.filter(x => graph.nodes[x]));
  let frontier = [...seen];
  const levels: Array<{ depth: number; files: string[] }> = [];
  for (let d = 1; d <= depth; d++) {
    const next = new Set<string>();
    for (const f of frontier) {
      const node = graph.nodes[f];
      if (!node) continue;
      const neighbors = direction === "dependents" ? node.importedBy : node.imports;
      for (const n of neighbors) if (!seen.has(n) && graph.nodes[n]) next.add(n);
    }
    if (!next.size) break;
    for (const x of next) seen.add(x);
    frontier = [...next];
    levels.push({ depth: d, files: frontier });
  }
  return { all: [...seen].filter(x => !starts.includes(x)), levels };
}

function riskForImpact(files: string[], dependents: string[], routes: string[], hasData: boolean, hasConfig: boolean) {
  let score = Math.min(100, files.length * 5 + dependents.length * 4 + routes.length * 6 + (hasData ? 18 : 0) + (hasConfig ? 12 : 0));
  const level = score >= 65 ? "HIGH" : score >= 30 ? "MEDIUM" : "LOW";
  return { score, level };
}



// =========================================================


  return {
    codeIntelFile,
    normalizeRel,
    classifyCodeFile,
    extractCodeFacts,
    buildCodeIntelligenceGraph,
    readCodeIntelligenceGraph,
    dependencyReach,
    riskForImpact
  };
}
