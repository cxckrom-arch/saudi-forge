import * as z from "zod/v4";

type ResultFn = (text: string) => any;
type ErrorResultFn = (error: unknown) => any;

export function registerPrecisionExecutionTools(
  server: any,
  deps: {
    result: ResultFn;
    errorResult: ErrorResultFn;
    extractRequirementsFromPrompt: (prompt: string) => string[];
    precisionProtocol: (prompt: string, requirements: any[]) => string;
    readExecutionManifest: () => Promise<any>;
    writeExecutionManifest: (manifest: any) => Promise<void>;
    runPackageScript: (...args: any[]) => Promise<any>;
    recordCommandEvidence: (command: string, success: boolean, summary?: string) => Promise<void>;
    executionDir: string;
    executionFile: string;
  }
) {
  const {
    result,
    errorResult,
    extractRequirementsFromPrompt,
    precisionProtocol,
    readExecutionManifest,
    writeExecutionManifest,
    runPackageScript,
    recordCommandEvidence,
    executionDir,
    executionFile
  } = deps;

  // =========================================================
  // PRECISION EXECUTION — START
  // =========================================================

  server.registerTool(
    "start_precise_execution",
    {
      title: "Start Precise Prompt Execution",
      description:
        "Convert a user prompt into a persistent requirement manifest and strict execution contract. Use this before implementing substantial user requests.",
      inputSchema: z.object({
        prompt: z.string().min(3),
        requirements: z.array(z.string().min(1)).optional()
      }),
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: false
      }
    },
    async ({ prompt, requirements: explicitRequirements }) => {
      try {
        const requirementTexts = explicitRequirements?.length
          ? explicitRequirements.map((x) => x.trim()).filter(Boolean)
          : extractRequirementsFromPrompt(prompt);

        const now = new Date().toISOString();
        const manifest: any = {
          version: 1,
          taskId: `krom-${Date.now()}`,
          prompt,
          createdAt: now,
          updatedAt: now,
          requirements: requirementTexts.map((text, index) => ({
            id: `R${String(index + 1).padStart(3, "0")}`,
            text,
            status: "pending"
          })),
          changedFiles: [],
          commandEvidence: [],
          blockers: []
        };

        await writeExecutionManifest(manifest);

        return result(JSON.stringify({
          success: true,
          taskId: manifest.taskId,
          requirementCount: manifest.requirements.length,
          manifestPath: `${executionDir}/${executionFile}`,
          requirements: manifest.requirements,
          executionContract: precisionProtocol(prompt, manifest.requirements)
        }, null, 2));
      } catch (error) {
        return errorResult(error);
      }
    }
  );

  // =========================================================
  // PRECISION EXECUTION — UPDATE REQUIREMENT
  // =========================================================

  server.registerTool(
    "update_execution_requirement",
    {
      title: "Update Execution Requirement",
      description:
        "Update one requirement in the active precision-execution manifest. VERIFIED requires concrete evidence.",
      inputSchema: z.object({
        id: z.string().min(1),
        status: z.enum(["pending", "in_progress", "verified", "blocked"]),
        evidence: z.array(z.string().min(1)).default([]),
        notes: z.string().optional()
      }),
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false
      }
    },
    async ({ id, status, evidence, notes }) => {
      try {
        const manifest = await readExecutionManifest();
        if (!manifest) throw new Error("No active execution manifest. Call start_precise_execution first.");
        const req = manifest.requirements.find((r) => r.id === id);
        if (!req) throw new Error(`Unknown requirement id: ${id}`);
        if (status === "verified" && evidence.length === 0) {
          throw new Error("A requirement cannot be marked verified without concrete evidence.");
        }
        req.status = status;
        req.evidence = evidence;
        req.notes = notes;
        await writeExecutionManifest(manifest);
        return result(JSON.stringify({ success: true, requirement: req }, null, 2));
      } catch (error) {
        return errorResult(error);
      }
    }
  );

  // =========================================================
  // PRECISION EXECUTION — STATUS
  // =========================================================

  server.registerTool(
    "execution_status",
    {
      title: "Execution Status",
      description: "Show current prompt requirements, completion status, changed files and command evidence.",
      inputSchema: z.object({}),
      annotations: { readOnlyHint: true, openWorldHint: false }
    },
    async () => {
      try {
        const manifest = await readExecutionManifest();
        if (!manifest) return result(JSON.stringify({ active: false }, null, 2));
        const counts = manifest.requirements.reduce((acc: any, req) => {
          acc[req.status] = (acc[req.status] || 0) + 1;
          return acc;
        }, {});
        return result(JSON.stringify({ active: true, ...manifest, counts }, null, 2));
      } catch (error) {
        return errorResult(error);
      }
    }
  );

  // =========================================================
  // PRECISION EXECUTION — AUDIT
  // =========================================================

  server.registerTool(
    "execution_audit",
    {
      title: "Final Precision Execution Audit",
      description:
        "Audit the active prompt against every requirement and project quality gates. Returns FAIL until all non-blocked requirements have verified evidence and critical checks pass.",
      inputSchema: z.object({ runQualityGates: z.boolean().default(true) }),
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        openWorldHint: false
      }
    },
    async ({ runQualityGates }) => {
      try {
        const manifest = await readExecutionManifest();
        if (!manifest) throw new Error("No active execution manifest. Call start_precise_execution first.");

        let gates: any = null;
        if (runQualityGates) {
          const build = await runPackageScript(["build"]);
          const tests = await runPackageScript(["test", "test:ci"]);
          const lint = await runPackageScript(["lint"]);
          const typecheck = await runPackageScript(["typecheck", "type-check", "check:types", "check"]);
          gates = { build, tests, lint, typecheck };
          for (const [name, check] of Object.entries(gates) as any) {
            if (check.available) await recordCommandEvidence(`quality:${name}`, check.status === "PASS", check.status);
          }
        }

        const unverified = manifest.requirements.filter((r) => r.status !== "verified" && r.status !== "blocked");
        const blocked = manifest.requirements.filter((r) => r.status === "blocked");
        const gateFailures = gates
          ? Object.entries(gates).filter(([, c]: any) => c.available && c.status === "FAIL").map(([name]) => name)
          : [];

        const verdict = unverified.length === 0 && gateFailures.length === 0
          ? (blocked.length ? "PASS_WITH_BLOCKERS" : "PASS")
          : "FAIL";

        return result(JSON.stringify({
          verdict,
          taskId: manifest.taskId,
          requirementsTotal: manifest.requirements.length,
          verified: manifest.requirements.filter((r) => r.status === "verified").length,
          unverified,
          blocked,
          changedFiles: manifest.changedFiles,
          qualityGates: gates,
          gateFailures,
          instruction: verdict === "FAIL"
            ? "DO NOT STOP. Continue implementation/fixes, add evidence, update requirements, and rerun execution_audit."
            : "Execution contract satisfied. Report evidence requirement-by-requirement."
        }, null, 2));
      } catch (error) {
        return errorResult(error);
      }
    }
  );



}
