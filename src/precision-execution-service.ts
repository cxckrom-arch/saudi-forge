import fs from "node:fs/promises";
import path from "node:path";

export const EXECUTION_DIR = ".krom-execution";
export const EXECUTION_FILE = "current-task.json";

export type ExecutionRequirement = {
  id: string;
  text: string;
  status: "pending" | "in_progress" | "verified" | "blocked";
  evidence?: string[];
  notes?: string;
};

export type ExecutionManifest = {
  version: 1;
  taskId: string;
  prompt: string;
  createdAt: string;
  updatedAt: string;
  requirements: ExecutionRequirement[];
  changedFiles: string[];
  commandEvidence: Array<{ at: string; command: string; success: boolean; summary?: string }>;
  blockers: string[];
};

export function createPrecisionExecutionService(options: {
  safePath: (relativePath: string) => string;
}) {
  const { safePath } = options;

  function extractRequirementsFromPrompt(prompt: string): string[] {
    const lines = prompt
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean);

    const candidates: string[] = [];
    const bullet = /^(?:[-*•]|\d+[.)]|[✅☑️])\s*(.+)$/;
    const imperative = /^(?:أضف|اضف|أنشئ|انشئ|اصلح|أصلح|طور|طوّر|اجعل|اربط|نفذ|نفّذ|احذف|حافظ|تأكد|تاكد|اختبر|صمم|build|add|create|fix|implement|make|ensure|connect|integrate|remove|preserve|test|design)\b/i;

    for (const line of lines) {
      const match = line.match(bullet);
      const value = (match?.[1] || line).trim();
      if (match || imperative.test(value)) {
        if (value.length >= 4 && value.length <= 500) candidates.push(value);
      }
    }

    const unique = [...new Set(candidates)];
    if (!unique.length) unique.push(prompt.trim());
    return unique.slice(0, 120);
  }

  async function executionManifestPath() {
    const dir = safePath(EXECUTION_DIR);
    await fs.mkdir(dir, { recursive: true });
    return path.join(dir, EXECUTION_FILE);
  }

  async function readExecutionManifest(): Promise<ExecutionManifest | null> {
    try {
      const file = await executionManifestPath();
      return JSON.parse(await fs.readFile(file, "utf8"));
    } catch {
      return null;
    }
  }

  async function writeExecutionManifest(manifest: ExecutionManifest) {
    manifest.updatedAt = new Date().toISOString();
    const file = await executionManifestPath();
    await fs.writeFile(file, JSON.stringify(manifest, null, 2), "utf8");
  }

  async function recordChangedFile(relativePath: string) {
    const manifest = await readExecutionManifest();
    if (!manifest) return;
    const normalized = relativePath.replace(/\\/g, "/");
    if (!manifest.changedFiles.includes(normalized)) manifest.changedFiles.push(normalized);
    await writeExecutionManifest(manifest);
  }

  async function recordCommandEvidence(command: string, success: boolean, summary?: string) {
    const manifest = await readExecutionManifest();
    if (!manifest) return;
    manifest.commandEvidence.push({ at: new Date().toISOString(), command, success, summary });
    manifest.commandEvidence = manifest.commandEvidence.slice(-100);
    await writeExecutionManifest(manifest);
  }

  function precisionProtocol(prompt: string, requirements: ExecutionRequirement[]) {
    return `# KROM PRECISION EXECUTION CONTRACT

## ORIGINAL USER PROMPT
${prompt}

## NON-NEGOTIABLE REQUIREMENTS
${requirements.map((r) => `- [${r.id}] ${r.text}`).join("\n")}

## EXECUTION RULES
1. Treat every requirement above as a contractual acceptance criterion, not a suggestion.
2. Inspect the actual project before editing. Do not infer file locations, APIs, routes, schemas, or components without evidence.
3. Trace dependencies/callers before changing shared code. Preserve unrelated working behavior and existing user data.
4. Implement requirements in the real codebase. No mock buttons, fake success states, placeholder integrations, or claims without evidence.
5. After each meaningful implementation step, update requirement status using update_execution_requirement.
6. Mark a requirement VERIFIED only when you can cite concrete evidence: file/symbol changed, command result, test, or observed user flow.
7. If a requirement is ambiguous, choose the safest reversible interpretation consistent with the existing product instead of silently dropping it.
8. If an implementation fails, diagnose root cause, fix it, and continue. Do not remove required functionality just to make build/tests pass.
9. Before completion, call execution_audit. If it returns FAIL, continue implementation until all unblocked requirements are verified and quality gates have no unresolved critical failure.
10. Final response must map each requirement to its evidence and explicitly list any genuine external blocker.

## REQUIRED TOOL FLOW
start_precise_execution → inspect/search/read → write/patch → tests/build/typecheck/lint as applicable → update_execution_requirement → execution_audit.

Do not declare completion merely because code was written. Completion requires verified behavior.`;
  }

  return {
    extractRequirementsFromPrompt,
    executionManifestPath,
    readExecutionManifest,
    writeExecutionManifest,
    recordChangedFile,
    recordCommandEvidence,
    precisionProtocol
  };
}
