import * as z from "zod/v4";

type ResultFn = (text: string) => any;
type ErrorResultFn = (error: unknown) => any;

export function registerV31BrowserTools(
  server: any,
  deps: {
    result: ResultFn;
    errorResult: ErrorResultFn;
    runLiveBrowserVision: (...args: any[]) => Promise<any>;
    readLatestLiveBrowserReport: () => Promise<any>;
  }
) {
  const { result, errorResult, runLiveBrowserVision, readLatestLiveBrowserReport } = deps;

  // =========================================================
  // v3.1 LIVE BROWSER VISION / REAL RENDER VERIFICATION
  // =========================================================

  server.registerTool(
    "live_browser_vision",
    {
      title: "Live Browser Vision",
      description: "Open the running application in a real headless Chromium browser, capture screenshots across routes/viewports, and collect console errors, page errors, failed requests, HTTP 4xx/5xx responses, and horizontal-overflow defects. Requires Playwright in the target project and never fabricates a pass.",
      inputSchema: z.object({
        url: z.string().url(),
        routes: z.array(z.string()).default(["/"]),
        viewports: z.array(z.object({
          name: z.string().min(1),
          width: z.number().int().min(240).max(3840),
          height: z.number().int().min(320).max(2160)
        })).default([
          { name: "mobile-375", width: 375, height: 812 },
          { name: "mobile-430", width: 430, height: 932 },
          { name: "tablet-768", width: 768, height: 1024 },
          { name: "desktop-1440", width: 1440, height: 1000 }
        ]),
        waitMs: z.number().int().min(0).max(10000).default(500),
        outputDirectory: z.string().default(".krom/live-browser/screenshots")
      }),
      annotations: { readOnlyHint: false, openWorldHint: false }
    },
    async ({ url, routes, viewports, waitMs, outputDirectory }) => {
      try {
        const evidence = await runLiveBrowserVision(url, routes, viewports, waitMs, outputDirectory);
        if (evidence.available) await recordCommandEvidence("live_browser_vision", evidence.verdict === "PASS", `Live browser verdict: ${evidence.verdict}`);
        return result(JSON.stringify({
          ...evidence,
          rule: "A rendered UI is not verified unless real browser evidence exists. Any console/page/network/HTTP/overflow failure must be fixed and the screenshots recaptured.",
          nextStep: evidence.verdict === "PASS" ? "Send the captured screenshots to the visual-design review, then run the release gate." : "Return failures to Developer/UI agents, fix root causes, rerun live_browser_vision, and do not mark UI work done."
        }, null, 2));
      } catch (error) { return errorResult(error); }
    }
  );

  server.registerTool(
    "live_browser_report",
    {
      title: "Latest Live Browser Report",
      description: "Read the latest real-browser report and convert runtime/browser defects into an ordered engineering remediation plan.",
      inputSchema: z.object({}),
      annotations: { readOnlyHint: true, openWorldHint: false }
    },
    async () => {
      try {
        const report = await readLatestLiveBrowserReport();
        if (!report) return result(JSON.stringify({ available: false, verdict: "NO_REPORT", nextStep: "Run live_browser_vision first." }, null, 2));
        const fixes = [
          ...report.pageErrors.map((x) => ({ severity: "critical", owner: "Developer", issue: `${x.viewport} ${x.route}: ${x.text}` })),
          ...report.consoleErrors.map((x) => ({ severity: "major", owner: "Developer", issue: `${x.viewport} ${x.route}: console ${x.text}` })),
          ...report.failedRequests.map((x) => ({ severity: "major", owner: "Developer", issue: `${x.viewport} ${x.route}: ${x.method} ${x.url} failed (${x.failure})` })),
          ...report.badResponses.map((x) => ({ severity: x.status >= 500 ? "critical" : "major", owner: "Developer", issue: `${x.viewport} ${x.route}: HTTP ${x.status} ${x.url}` })),
          ...report.overflowFindings.map((x) => ({ severity: "major", owner: "UI/UX + Developer", issue: `${x.viewport} ${x.route}: horizontal overflow ${x.scrollWidth}px > ${x.clientWidth}px` }))
        ];
        return result(JSON.stringify({
          available: true,
          verdict: fixes.length === 0 ? "PASS" : "NEEDS_FIXES",
          screenshots: report.screenshots,
          fixes,
          handoff: fixes.length ? "Developer fixes runtime/network issues; UI/UX fixes responsive overflow; Visual Designer reviews fresh screenshots after rerun." : "Proceed to Visual Designer and release gate."
        }, null, 2));
      } catch (error) { return errorResult(error); }
    }
  );

  server.registerTool(
    "release_gate_v31",
    {
      title: "KROM v3.1 Release Gate",
      description: "Strict final release gate that combines build/typecheck/lint/tests, requirement traceability, and real Live Browser Vision evidence. UI-heavy releases cannot pass when live browser evidence is absent or contains runtime/network/overflow defects.",
      inputSchema: z.object({
        requireLiveBrowser: z.boolean().default(true),
        requireAllRequirementsVerified: z.boolean().default(true)
      }),
      annotations: { readOnlyHint: false, openWorldHint: false }
    },
    async ({ requireLiveBrowser, requireAllRequirementsVerified }) => {
      try {
        const [build, typecheck, lint, tests] = await Promise.all([
          runNpmScriptIfPresent(["build"]),
          runNpmScriptIfPresent(["typecheck", "type-check", "check:types"]),
          runNpmScriptIfPresent(["lint"]),
          runNpmScriptIfPresent(["test", "test:unit"])
        ]);
        const manifest = await readExecutionManifest();
        const unverified = manifest ? manifest.requirements.filter((r) => r.status !== "verified" && r.status !== "blocked") : [];
        const liveReport = await readLatestLiveBrowserReport();
        const liveDefects = liveReport ? liveReport.consoleErrors.length + liveReport.pageErrors.length + liveReport.failedRequests.length + liveReport.badResponses.length + liveReport.overflowFindings.length : null;
        const livePass = !requireLiveBrowser || Boolean(liveReport && liveDefects === 0);
        const technicalChecks = [build, typecheck, lint, tests].filter((x) => x.available);
        const technicalPass = technicalChecks.every((x) => x.success === true);
        const requirementPass = !requireAllRequirementsVerified || Boolean(manifest && unverified.length === 0);
        const verdict = technicalPass && requirementPass && livePass ? "PASS" : "FAIL";
        return result(JSON.stringify({
          verdict,
          gates: { build, typecheck, lint, tests, liveBrowser: { required: requireLiveBrowser, available: Boolean(liveReport), defects: liveDefects, pass: livePass } },
          requirements: manifest ? { total: manifest.requirements.length, unverified: unverified.map((r) => ({ id: r.id, text: r.text, status: r.status })) } : { total: 0, warning: "No precision-execution manifest found." },
          releaseRule: "DONE/DEPLOY is forbidden while verdict=FAIL. For UI work, a successful build alone is insufficient; real browser evidence must be clean.",
          nextStep: verdict === "PASS" ? "v3.1 release gate passed." : "Fix failed technical/requirement/live-browser gates, recapture browser evidence, and rerun release_gate_v31."
        }, null, 2));
      } catch (error) { return errorResult(error); }
    }
  );



}
