import * as z from "zod/v4";

type ResultFn = (text: string) => any;
type ErrorResultFn = (error: unknown) => any;

export function registerV3CoreTools(
  server: any,
  deps: {
    result: ResultFn;
    errorResult: ErrorResultFn;
    orchestratorPlan: (...args: any[]) => any;
    readProjectMemory: () => Promise<any>;
    writeProjectMemory: (memory: any) => Promise<void>;
    traceabilityFromManifest: (manifest: any) => any;
    readExecutionManifest: () => Promise<any>;
    runNpmScriptIfPresent: (...args: any[]) => Promise<any>;
    recordCommandEvidence: (...args: any[]) => Promise<any>;
    visualReviewScore: (...args: any[]) => any;
  }
) {
  const {
    result,
    errorResult,
    orchestratorPlan,
    readProjectMemory,
    writeProjectMemory,
    traceabilityFromManifest,
    readExecutionManifest,
    runNpmScriptIfPresent,
    recordCommandEvidence,
    visualReviewScore
  } = deps;

  // =========================================================
  // v3.0 MASTER ORCHESTRATION / MEMORY / TRACEABILITY / GATES
  // =========================================================

  server.registerTool(
    "master_orchestrator",
    {
      title: "KROM Master Orchestrator",
      description: "Turn a user request into an autonomous multi-agent engineering route with strict gates and no skipped requirements.",
      inputSchema: z.object({
        prompt: z.string().min(3),
        uiHeavy: z.boolean().default(true),
        deployment: z.boolean().default(false)
      }),
      annotations: { readOnlyHint: true, openWorldHint: false }
    },
    async ({ prompt, uiHeavy, deployment }) => {
      try { return result(JSON.stringify(orchestratorPlan(prompt, uiHeavy, deployment), null, 2)); }
      catch (error) { return errorResult(error); }
    }
  );

  server.registerTool(
    "project_memory",
    {
      title: "Project Memory",
      description: "Read or update persistent project-local engineering memory so agents preserve stack, conventions, design rules, decisions, and resolved issues across tasks.",
      inputSchema: z.object({
        action: z.enum(["get", "add_stack", "add_convention", "add_design_rule", "add_decision", "add_issue"]),
        value: z.string().optional(),
        reason: z.string().optional(),
        resolution: z.string().optional()
      }),
      annotations: { readOnlyHint: false, openWorldHint: false }
    },
    async ({ action, value, reason, resolution }) => {
      try {
        const memory = await readProjectMemory();
        if (action !== "get" && !value) throw new Error("value is required for update actions");
        if (action === "add_stack" && value && !memory.stack.includes(value)) memory.stack.push(value);
        if (action === "add_convention" && value && !memory.conventions.includes(value)) memory.conventions.push(value);
        if (action === "add_design_rule" && value && !memory.designRules.includes(value)) memory.designRules.push(value);
        if (action === "add_decision" && value) memory.decisions.push({ at: new Date().toISOString(), decision: value, reason });
        if (action === "add_issue" && value) memory.knownIssues.push({ at: new Date().toISOString(), issue: value, resolution });
        if (action !== "get") await writeProjectMemory(memory);
        return result(JSON.stringify(memory, null, 2));
      } catch (error) { return errorResult(error); }
    }
  );

  server.registerTool(
    "requirement_traceability",
    {
      title: "Requirement Traceability Matrix",
      description: "Map every active requirement to its implementation status and evidence so no prompt requirement is silently dropped.",
      inputSchema: z.object({}),
      annotations: { readOnlyHint: true, openWorldHint: false }
    },
    async () => {
      try { return result(JSON.stringify(traceabilityFromManifest(await readExecutionManifest()), null, 2)); }
      catch (error) { return errorResult(error); }
    }
  );

  server.registerTool(
    "browser_test",
    {
      title: "Browser / E2E Test Runner",
      description: "Run an existing project browser/E2E script when available. Never fabricates a browser pass; if no runner exists it reports the missing capability and the exact next setup requirement.",
      inputSchema: z.object({
        preferredScript: z.string().optional()
      }),
      annotations: { readOnlyHint: false, openWorldHint: false }
    },
    async ({ preferredScript }) => {
      try {
        const names = preferredScript ? [preferredScript] : ["test:e2e", "e2e", "test:playwright", "playwright", "test:browser"];
        const evidence = await runNpmScriptIfPresent(names);
        if (evidence.available) await recordCommandEvidence(`npm run ${evidence.script}`, Boolean(evidence.success), evidence.success ? "Browser/E2E PASS" : "Browser/E2E FAIL");
        return result(JSON.stringify({
          ...evidence,
          verdict: evidence.available ? (evidence.success ? "PASS" : "FAIL") : "NOT_CONFIGURED",
          nextStep: evidence.available ? (evidence.success ? "Continue to visual/release gates." : "Fix the failing browser flow and rerun browser_test.") : "Add Playwright/Cypress or a project-specific E2E npm script; do not claim browser verification until a real runner executes."
        }, null, 2));
      } catch (error) { return errorResult(error); }
    }
  );

  server.registerTool(
    "screenshot_visual_inspector",
    {
      title: "Screenshot Visual Inspector",
      description: "Evaluate structured observations from real screenshots across viewports and turn them into a strict visual pass/fail remediation list. Requires actual screenshot observations; does not pretend to see unavailable images.",
      inputSchema: z.object({
        screenshots: z.array(z.object({
          path: z.string().min(1),
          viewport: z.string().min(1),
          observations: z.string().min(3)
        })).min(1),
        targetScore: z.number().min(70).max(100).default(90)
      }),
      annotations: { readOnlyHint: true, openWorldHint: false }
    },
    async ({ screenshots, targetScore }) => {
      try {
        const combined = screenshots.map((x) => `${x.viewport}: ${x.observations}`).join("\n");
        const audit = visualReviewScore(combined);
        const criticalPatterns = /overlap|overflow|cut off|clipped|unreadable|broken rtl|horizontal scroll|console error|blank/i;
        const critical = screenshots.filter((x) => criticalPatterns.test(x.observations));
        const verdict = audit.score >= targetScore && critical.length === 0 ? "PASS" : "FAIL";
        return result(JSON.stringify({
          verdict,
          score: audit.score,
          targetScore,
          screenshots,
          criticalFindings: critical.map((x) => ({ path: x.path, viewport: x.viewport, observations: x.observations })),
          missingDimensions: audit.missing,
          requiredFixes: [...critical.map((x) => `Fix critical visual defect at ${x.viewport}: ${x.observations}`), ...audit.missing.map((m) => `Improve and re-verify ${m}.`)],
          nextStep: verdict === "PASS" ? "Visual screenshot gate passed." : "Return fixes to Developer/UI agent, capture fresh screenshots, and rerun this inspector."
        }, null, 2));
      } catch (error) { return errorResult(error); }
    }
  );

  server.registerTool(
    "release_gate_v3",
    {
      title: "KROM v3 Release Gate",
      description: "Run available build/typecheck/lint/test/browser gates and combine them with requirement evidence. A missing applicable gate is reported, never converted into a fake pass.",
      inputSchema: z.object({
        requireBrowser: z.boolean().default(false),
        requireAllRequirementsVerified: z.boolean().default(true)
      }),
      annotations: { readOnlyHint: false, openWorldHint: false }
    },
    async ({ requireBrowser, requireAllRequirementsVerified }) => {
      try {
        const [build, typecheck, lint, tests] = await Promise.all([
          runNpmScriptIfPresent(["build"]),
          runNpmScriptIfPresent(["typecheck", "type-check", "check:types"]),
          runNpmScriptIfPresent(["lint"]),
          runNpmScriptIfPresent(["test", "test:unit"])
        ]);
        const browser = requireBrowser ? await runNpmScriptIfPresent(["test:e2e", "e2e", "test:playwright", "playwright", "test:browser"]) : { available: false, script: null, success: null, message: "Browser gate not required" };
        const manifest = await readExecutionManifest();
        const unverified = manifest ? manifest.requirements.filter((r) => r.status !== "verified" && r.status !== "blocked") : [];
        const requiredChecks = [build, typecheck, lint, tests].filter((x) => x.available);
        const technicalPass = requiredChecks.every((x) => x.success === true) && (!requireBrowser || (browser.available && browser.success === true));
        const requirementPass = !requireAllRequirementsVerified || Boolean(manifest && unverified.length === 0);
        const verdict = technicalPass && requirementPass ? "PASS" : "FAIL";
        return result(JSON.stringify({
          verdict,
          gates: { build, typecheck, lint, tests, browser },
          requirements: manifest ? { total: manifest.requirements.length, unverified: unverified.map((r) => ({ id: r.id, text: r.text, status: r.status })) } : { total: 0, warning: "No precision-execution manifest found." },
          rule: "DONE is forbidden when verdict=FAIL.",
          nextStep: verdict === "PASS" ? "Release gate passed." : "Fix failed gates or verify remaining requirements, then rerun release_gate_v3."
        }, null, 2));
      } catch (error) { return errorResult(error); }
    }
  );



}
