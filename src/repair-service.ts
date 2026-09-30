import fs from "node:fs/promises";
import path from "node:path";

export type RepairFinding = {
  id: string;
  source: "build" | "typecheck" | "lint" | "test" | "browser" | "requirements";
  severity: "critical" | "major" | "minor";
  message: string;
  hint?: string;
};

export type RepairCycleState = {
  version: 1;
  cycleId: string;
  createdAt: string;
  updatedAt: string;
  maxIterations: number;
  iteration: number;
  status: "ACTIVE" | "PASS" | "BLOCKED" | "MAX_ITERATIONS";
  lastFingerprint: string;
  repeatedFingerprintCount: number;
  findings: RepairFinding[];
  history: Array<{
    iteration: number;
    at: string;
    fingerprint: string;
    findingCount: number;
    changedFiles: string[];
    verdict: string;
  }>;
};

export function createRepairService(options:{
  projectRoot:string;
  repairStateFile?:string;
  kromStatePath:(file:string)=>Promise<string>;
  runNpmScriptIfPresent:(...args:any[])=>Promise<any>;
  readLatestLiveBrowserReport:()=>Promise<any>;
  readExecutionManifest:()=>Promise<any>;
  walkProject:(...args:any[])=>Promise<string[]>;
  isTextFile:(file:string)=>boolean;
}) {
  const {
    projectRoot,
    repairStateFile="autonomous-repair.json",
    kromStatePath,
    runNpmScriptIfPresent,
    readLatestLiveBrowserReport,
    readExecutionManifest,
    walkProject,
    isTextFile
  }=options;

// KROM v3.2 AUTONOMOUS REPAIR LOOP
// =========================================================



async function repairStatePath() {
  return kromStatePath(repairStateFile);
}

async function readRepairState(): Promise<RepairCycleState | null> {
  try {
    return JSON.parse(await fs.readFile(await repairStatePath(), "utf8"));
  } catch {
    return null;
  }
}

async function writeRepairState(state: RepairCycleState) {
  state.updatedAt = new Date().toISOString();
  await fs.writeFile(await repairStatePath(), JSON.stringify(state, null, 2), "utf8");
}

function shortHash(input: string) {
  let h = 2166136261;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0).toString(16).padStart(8, "0");
}

function linesFromFailure(text: string, max = 18) {
  return String(text || "")
    .split(/\r?\n/)
    .map((x) => x.trim())
    .filter(Boolean)
    .filter((x) => /error|failed|cannot|not found|undefined|permission|timeout|overflow|4\d\d|5\d\d/i.test(x))
    .slice(0, max);
}

async function collectRepairFindings(requireLiveBrowser: boolean): Promise<{ findings: RepairFinding[]; gates: any }> {
  const [build, typecheck, lint, tests] = await Promise.all([
    runNpmScriptIfPresent(["build"]),
    runNpmScriptIfPresent(["typecheck", "type-check", "check:types"]),
    runNpmScriptIfPresent(["lint"]),
    runNpmScriptIfPresent(["test", "test:unit"])
  ]);
  const findings: RepairFinding[] = [];
  const addCommand = (source: RepairFinding["source"], gate: any) => {
    if (!gate?.available || gate.success === true) return;
    const raw = `${gate.stderr || ""}\n${gate.stdout || ""}`;
    const lines = linesFromFailure(raw);
    if (!lines.length) lines.push(gate.message || `${source} failed`);
    lines.forEach((message, i) => findings.push({
      id: `${source.toUpperCase()}-${String(i + 1).padStart(3, "0")}`,
      source,
      severity: source === "build" || source === "typecheck" ? "critical" : "major",
      message
    }));
  };
  addCommand("build", build);
  addCommand("typecheck", typecheck);
  addCommand("lint", lint);
  addCommand("test", tests);

  const manifest = await readExecutionManifest();
  if (manifest) {
    const pending = manifest.requirements.filter((r) => r.status !== "verified" && r.status !== "blocked");
    pending.forEach((r, i) => findings.push({
      id: `REQ-${String(i + 1).padStart(3, "0")}`,
      source: "requirements",
      severity: "major",
      message: `${r.id}: ${r.text}`,
      hint: "Implement or provide concrete evidence before marking verified."
    }));
  }

  const live = requireLiveBrowser ? await readLatestLiveBrowserReport() : null;
  if (requireLiveBrowser && !live) {
    findings.push({ id: "BROWSER-001", source: "browser", severity: "major", message: "Live Browser Vision evidence is missing.", hint: "Run live_browser_vision after starting the app." });
  } else if (live) {
    let n = 1;
    for (const x of live.pageErrors) findings.push({ id: `BROWSER-${String(n++).padStart(3,"0")}`, source: "browser", severity: "critical", message: `${x.viewport} ${x.route}: ${x.text}` });
    for (const x of live.consoleErrors) findings.push({ id: `BROWSER-${String(n++).padStart(3,"0")}`, source: "browser", severity: "major", message: `${x.viewport} ${x.route}: console ${x.text}` });
    for (const x of live.failedRequests) findings.push({ id: `BROWSER-${String(n++).padStart(3,"0")}`, source: "browser", severity: "major", message: `${x.viewport} ${x.route}: ${x.method} ${x.url} failed (${x.failure})` });
    for (const x of live.badResponses) findings.push({ id: `BROWSER-${String(n++).padStart(3,"0")}`, source: "browser", severity: x.status >= 500 ? "critical" : "major", message: `${x.viewport} ${x.route}: HTTP ${x.status} ${x.url}` });
    for (const x of live.overflowFindings) findings.push({ id: `BROWSER-${String(n++).padStart(3,"0")}`, source: "browser", severity: "major", message: `${x.viewport} ${x.route}: horizontal overflow ${x.scrollWidth}px > ${x.clientWidth}px`, hint: "Inspect layout width/min-width/grid/flex/table overflow rules." });
  }

  return { findings, gates: { build, typecheck, lint, tests, liveBrowserAvailable: Boolean(live) } };
}

function repairFingerprint(findings: RepairFinding[]) {
  const normalized = findings.map((f) => `${f.source}|${f.severity}|${f.message.replace(/\d+/g, "#")}`).sort().join("\n");
  return shortHash(normalized);
}

async function locateLikelyFiles(findings: RepairFinding[], maxFiles = 12) {
  const all = await walkProject(projectRoot, [], 2500);
  const textFiles = all.filter(isTextFile).slice(0, 1600);
  const terms = [...new Set(findings.flatMap((f) =>
    f.message.match(/[A-Za-z_][A-Za-z0-9_.\/-]{3,}/g) || []
  ).filter((x) => !/^(error|failed|cannot|undefined|http|https|localhost)$/i.test(x)).slice(0, 40))];
  const scored: Array<{ file: string; score: number; matches: string[] }> = [];
  for (const file of textFiles) {
    let content = "";
    try { content = await fs.readFile(file, "utf8"); } catch { continue; }
    const matches = terms.filter((t) => content.includes(t)).slice(0, 8);
    if (matches.length) scored.push({ file: path.relative(projectRoot, file).replace(/\\/g, "/"), score: matches.length, matches });
  }
  return scored.sort((a,b) => b.score - a.score).slice(0, maxFiles);
}



// =========================================================


  return {
    repairStateFile,
    repairStatePath,
    readRepairState,
    writeRepairState,
    shortHash,
    collectRepairFindings,
    repairFingerprint,
    locateLikelyFiles
  };
}
