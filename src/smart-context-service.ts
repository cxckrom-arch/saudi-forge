import fs from "node:fs/promises";
import path from "node:path";
import type { CodeIntelNode } from "./code-intelligence-service.js";

export type ContextCandidate = {
  file: string;
  score: number;
  reasons: string[];
  kind: string;
  routes: string[];
  dependents: number;
  dependencies: number;
};

export type SmartContextBundle = {
  version: 1;
  generatedAt: string;
  query: string;
  selected: ContextCandidate[];
  omittedHighRisk: ContextCandidate[];
  tokenBudgetChars: number;
  estimatedChars: number;
  changedFiles: string[];
  memorySummary: { stack: string[]; conventions: string[]; designRules: string[]; recentDecisions: unknown[] } | null;
};

export function createSmartContextService(options:{
  projectRoot:string;
  smartContextFile?:string;
  readProjectMemory:()=>Promise<any>;
  readExecutionManifest:()=>Promise<any>;
  readCodeIntelligenceGraph:()=>Promise<any>;
  buildCodeIntelligenceGraph:(...args:any[])=>Promise<any>;
  dependencyReach:(...args:any[])=>any;
  kromStatePath:(file:string)=>Promise<string>;
}) {
  const {
    projectRoot,
    smartContextFile="smart-context.json",
    readProjectMemory,
    readExecutionManifest,
    readCodeIntelligenceGraph,
    buildCodeIntelligenceGraph,
    dependencyReach,
    kromStatePath
  }=options;

// KROM v3.4 SMART CONTEXT + DECISION ENGINE
// =========================================================

function normalizeRel(file: string) {
  return file.replace(/\\/g, "/");
}

function taskTerms(input: string) {
  const stop = new Set(["this","that","with","from","into","when","then","have","will","your","make","build","fix","update","add","remove","the","and","for","are","you","على","من","في","الى","إلى","هذا","هذه","مع","ثم","بعد","قبل","اضف","أضف","عدل","طور","تطوير","اصلح","إصلاح","اصلاح"]);
  return [...new Set((input.toLowerCase().match(/[\p{L}\p{N}_./:-]{3,}/gu) || []).filter(x => !stop.has(x)))].slice(0, 80);
}

function scoreContextNode(node: CodeIntelNode, queryTerms: string[], changedFiles: string[]) {
  const hay = `${node.file} ${node.kind} ${node.symbols.join(" ")} ${node.exports.join(" ")} ${node.routes.join(" ")}`.toLowerCase();
  let score = 0;
  const reasons: string[] = [];
  const hits = queryTerms.filter(t => hay.includes(t));
  if (hits.length) { score += Math.min(42, hits.length * 7); reasons.push(`query:${hits.slice(0,6).join(",")}`); }
  if (changedFiles.includes(node.file)) { score += 24; reasons.push("changed-file"); }
  if (node.kind === "route-or-page") { score += 7; reasons.push("route/page"); }
  if (node.kind === "ui-component") score += 4;
  if (node.importedBy.length >= 8) { score += 12; reasons.push("shared-hotspot"); }
  else if (node.importedBy.length >= 3) { score += 6; reasons.push("shared"); }
  if (node.kind === "data" || node.kind === "config") { score += 5; reasons.push(node.kind); }
  return { score, reasons };
}

async function buildSmartContext(query: string, maxFiles = 30, maxChars = 120000, refreshGraph = false): Promise<SmartContextBundle> {
  const graph = refreshGraph ? await buildCodeIntelligenceGraph() : (await readCodeIntelligenceGraph()) || await buildCodeIntelligenceGraph();
  const manifest = await readExecutionManifest();
  const changedFiles = (manifest?.changedFiles || []).map(normalizeRel);
  const terms = taskTerms(query);
  const primary: ContextCandidate[] = (Object.values(graph.nodes) as CodeIntelNode[]).map(node => {
    const s = scoreContextNode(node, terms, changedFiles);
    return { file: node.file, score: s.score, reasons: s.reasons, kind: node.kind, routes: node.routes, dependents: node.importedBy.length, dependencies: node.imports.length };
  }).filter(x => x.score > 0).sort((a,b) => b.score - a.score || b.dependents - a.dependents);

  // Expand around the strongest matches so callers receive local dependencies and dependents, not isolated snippets.
  const seedFiles = primary.slice(0, Math.min(8, maxFiles)).map(x => x.file);
  const expanded = dependencyReach(graph, seedFiles, "dependencies", 2).all.concat(dependencyReach(graph, seedFiles, "dependents", 2).all);
  const candidates = new Map<string, ContextCandidate>();
  for (const item of primary) candidates.set(item.file, item);
  for (const file of expanded) {
    if (candidates.has(file)) continue;
    const node = graph.nodes[file];
    if (!node) continue;
    candidates.set(file, { file, score: 16, reasons: ["graph-neighbor"], kind: node.kind, routes: node.routes, dependents: node.importedBy.length, dependencies: node.imports.length });
  }
  const ranked = [...candidates.values()].sort((a,b) => b.score - a.score || b.dependents - a.dependents);

  let used = 0;
  const selected: ContextCandidate[] = [];
  const omittedHighRisk: ContextCandidate[] = [];
  for (const item of ranked) {
    if (selected.length >= maxFiles) break;
    let size = 0;
    try { size = (await fs.stat(path.join(projectRoot, item.file))).size; } catch { size = 0; }
    const cost = Math.min(size, 30000);
    if (used + cost > maxChars) {
      if (item.dependents >= 5 || item.kind === "data" || item.kind === "config") omittedHighRisk.push(item);
      continue;
    }
    selected.push(item);
    used += cost;
  }

  let memorySummary: SmartContextBundle["memorySummary"] = null;
  try {
    const m = await readProjectMemory();
    memorySummary = { stack: m.stack.slice(-20), conventions: m.conventions.slice(-20), designRules: m.designRules.slice(-20), recentDecisions: m.decisions.slice(-12) };
  } catch {}

  const bundle: SmartContextBundle = {
    version: 1,
    generatedAt: new Date().toISOString(),
    query,
    selected,
    omittedHighRisk,
    tokenBudgetChars: maxChars,
    estimatedChars: used,
    changedFiles,
    memorySummary
  };
  await fs.writeFile(await kromStatePath(smartContextFile), JSON.stringify(bundle, null, 2), "utf8");
  return bundle;
}

function decideExecutionStrategy(prompt: string, bundle: SmartContextBundle) {
  const q = prompt.toLowerCase();
  const uiHeavy = /(ui|ux|واجهة|تصميم|responsive|rtl|css|tailwind|component|dashboard)/i.test(prompt);
  const dataHeavy = /(supabase|database|db|sql|migration|rls|policy|schema|جدول|قاعدة)/i.test(prompt);
  const deployHeavy = /(deploy|vercel|production|ci|cd|نشر|فيرسل)/i.test(prompt);
  const bugFix = /(fix|bug|error|issue|broken|خطأ|اصلح|إصلاح|اصلاح)/i.test(prompt);
  const broad = /(full|entire|all|complete|platform|system|كامل|جميع|منصة|نظام)/i.test(prompt) || bundle.selected.length > 18;
  const highRisk = bundle.selected.filter(x => x.dependents >= 8 || x.kind === "data" || x.kind === "config");
  const agents = ["Code Intelligence", "Developer", "QA"];
  if (broad) agents.unshift("Architect");
  if (uiHeavy) agents.splice(agents.length - 1, 0, "UI/UX", "Visual Designer", "Live Browser Vision");
  if (dataHeavy) agents.splice(agents.length - 1, 0, "Database/Security");
  if (deployHeavy) agents.push("DevOps");
  if (bugFix) agents.splice(agents.indexOf("Developer") + 1, 0, "Autonomous Repair");
  const uniqueAgents = [...new Set(agents)];
  const risk = highRisk.length >= 4 || broad && dataHeavy ? "HIGH" : highRisk.length || broad ? "MEDIUM" : "LOW";
  return {
    mode: bugFix ? "REPAIR" : broad ? "MULTI_PHASE_BUILD" : "FOCUSED_CHANGE",
    risk,
    agents: uniqueAgents,
    mandatoryBeforeEdit: ["smart_context_build", "impact_analysis"],
    mandatoryAfterEdit: ["regression_scope", ...(uiHeavy ? ["live_browser_vision", "visual_review"] : []), "release_gate_v31"],
    highRiskFiles: highRisk.slice(0, 15).map(x => x.file),
    rules: [
      "Use the selected context first; expand only when evidence shows missing dependencies.",
      "For shared/data/config files, run impact_analysis before patching.",
      "Prefer the smallest reversible change that satisfies the requirement.",
      "Never mark DONE from code inspection alone; require executable evidence from the relevant gates."
    ]
  };
}



// =========================================================


  return {
    smartContextFile,
    taskTerms,
    scoreContextNode,
    buildSmartContext,
    decideExecutionStrategy
  };
}
