import * as z from "zod/v4";

type ResultFn = (text: string) => any;
type ErrorResultFn = (error: unknown) => any;

export function registerV32RepairTools(
  server: any,
  deps: {
    result: ResultFn;
    errorResult: ErrorResultFn;
    collectRepairFindings: (...args: any[]) => Promise<any>;
    repairFingerprint: (...args: any[]) => any;
    readRepairState: () => Promise<any>;
    writeRepairState: (state: any) => Promise<void>;
    locateLikelyFiles: (...args: any[]) => Promise<any>;
  }
) {
  const {
    result,
    errorResult,
    collectRepairFindings,
    repairFingerprint,
    readRepairState,
    writeRepairState,
    locateLikelyFiles
  } = deps;

  // =========================================================
  // v3.2 AUTONOMOUS REPAIR LOOP TOOLS
  // =========================================================

  server.registerTool(
    "autonomous_repair_begin",
    {
      title: "Begin Autonomous Repair Cycle",
      description: "Create a bounded repair cycle from actual build/typecheck/lint/test/browser/requirement failures. Produces an evidence-based repair packet and likely source files; never fabricates a fix or loops without limits.",
      inputSchema: z.object({
        maxIterations: z.number().int().min(1).max(12).default(5),
        requireLiveBrowser: z.boolean().default(true)
      }),
      annotations: { readOnlyHint: false, openWorldHint: false }
    },
    async ({ maxIterations, requireLiveBrowser }) => {
      try {
        const collected = await collectRepairFindings(requireLiveBrowser);
        const fingerprint = repairFingerprint(collected.findings);
        const likelyFiles = await locateLikelyFiles(collected.findings);
        const now = new Date().toISOString();
        const state: RepairCycleState = {
          version: 1,
          cycleId: `repair-${Date.now()}`,
          createdAt: now,
          updatedAt: now,
          maxIterations,
          iteration: 1,
          status: collected.findings.length ? "ACTIVE" : "PASS",
          lastFingerprint: fingerprint,
          repeatedFingerprintCount: 0,
          findings: collected.findings,
          history: [{ iteration: 1, at: now, fingerprint, findingCount: collected.findings.length, changedFiles: (await readExecutionManifest())?.changedFiles || [], verdict: collected.findings.length ? "NEEDS_REPAIR" : "PASS" }]
        };
        await writeRepairState(state);
        return result(JSON.stringify({
          cycleId: state.cycleId,
          verdict: state.status,
          iteration: state.iteration,
          maxIterations,
          findings: state.findings,
          likelyFiles,
          gates: collected.gates,
          repairProtocol: [
            "Fix root causes, not symptoms or disabled checks.",
            "Prefer the smallest reversible patch that satisfies the requirement.",
            "Do not delete required functionality to make a gate pass.",
            "After edits, run autonomous_repair_verify.",
            "If the same fingerprint repeats twice, stop broad retries and inspect architecture/dependency assumptions."
          ],
          nextStep: state.status === "PASS" ? "No current repair findings. Run release_gate_v31." : "Inspect likely files, implement fixes with write_file/patch_file, then call autonomous_repair_verify."
        }, null, 2));
      } catch (error) { return errorResult(error); }
    }
  );

  server.registerTool(
    "autonomous_repair_verify",
    {
      title: "Verify Autonomous Repair Iteration",
      description: "Re-run evidence gates after a repair attempt, compare failure fingerprints, detect stalled repair loops, and decide whether to continue, escalate, or pass.",
      inputSchema: z.object({
        requireLiveBrowser: z.boolean().default(true)
      }),
      annotations: { readOnlyHint: false, openWorldHint: false }
    },
    async ({ requireLiveBrowser }) => {
      try {
        const state = await readRepairState();
        if (!state) return result(JSON.stringify({ status: "NO_ACTIVE_CYCLE", nextStep: "Run autonomous_repair_begin first." }, null, 2));
        const collected = await collectRepairFindings(requireLiveBrowser);
        const fingerprint = repairFingerprint(collected.findings);
        const repeated = collected.findings.length > 0 && fingerprint === state.lastFingerprint ? state.repeatedFingerprintCount + 1 : 0;
        const iteration = state.iteration + 1;
        let status: RepairCycleState["status"] = collected.findings.length === 0 ? "PASS" : "ACTIVE";
        if (status !== "PASS" && repeated >= 2) status = "BLOCKED";
        if (status !== "PASS" && iteration >= state.maxIterations) status = "MAX_ITERATIONS";
        state.iteration = iteration;
        state.status = status;
        state.lastFingerprint = fingerprint;
        state.repeatedFingerprintCount = repeated;
        state.findings = collected.findings;
        state.history.push({ iteration, at: new Date().toISOString(), fingerprint, findingCount: collected.findings.length, changedFiles: (await readExecutionManifest())?.changedFiles || [], verdict: status });
        state.history = state.history.slice(-30);
        await writeRepairState(state);
        const likelyFiles = await locateLikelyFiles(collected.findings);
        return result(JSON.stringify({
          cycleId: state.cycleId,
          status,
          iteration,
          maxIterations: state.maxIterations,
          repeatedFingerprintCount: repeated,
          findings: collected.findings,
          likelyFiles,
          gates: collected.gates,
          nextStep: status === "PASS"
            ? "Repair cycle passed. Run release_gate_v31 before declaring DONE."
            : status === "BLOCKED"
              ? "The same failure set repeated. Stop blind retries; inspect architecture, dependencies, configuration, and the exact failing files before another patch."
              : status === "MAX_ITERATIONS"
                ? "Safety limit reached. Do not continue automatic retries; report unresolved findings and require a new repair cycle after root-cause review."
                : "Apply the next minimal root-cause fix, then call autonomous_repair_verify again."
        }, null, 2));
      } catch (error) { return errorResult(error); }
    }
  );

  server.registerTool(
    "autonomous_repair_status",
    {
      title: "Autonomous Repair Status",
      description: "Read the current repair cycle, iteration history, failure fingerprint stability, and unresolved findings.",
      inputSchema: z.object({}),
      annotations: { readOnlyHint: true, openWorldHint: false }
    },
    async () => {
      try {
        const state = await readRepairState();
        return result(JSON.stringify(state || { status: "NO_ACTIVE_CYCLE" }, null, 2));
      } catch (error) { return errorResult(error); }
    }
  );

  server.registerTool(
    "repair_source_locator",
    {
      title: "Repair Source Locator",
      description: "Map current repair findings to likely project files using conservative source-text evidence, helping the Developer inspect the right files before editing.",
      inputSchema: z.object({ maxFiles: z.number().int().min(1).max(30).default(12) }),
      annotations: { readOnlyHint: true, openWorldHint: false }
    },
    async ({ maxFiles }) => {
      try {
        const state = await readRepairState();
        if (!state) return result(JSON.stringify({ status: "NO_ACTIVE_CYCLE" }, null, 2));
        return result(JSON.stringify({ cycleId: state.cycleId, findings: state.findings, likelyFiles: await locateLikelyFiles(state.findings, maxFiles) }, null, 2));
      } catch (error) { return errorResult(error); }
    }
  );



}
