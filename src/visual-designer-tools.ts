import * as z from "zod/v4";

type ResultFn = (text: string) => any;
type ErrorResultFn = (error: unknown) => any;

export function registerVisualDesignerTools(
  server: any,
  deps: {
    result: ResultFn;
    errorResult: ErrorResultFn;
    visualDesignerMandate: (...args: any[]) => any;
    visualReviewScore: (...args: any[]) => any;
  }
) {
  const { result, errorResult, visualDesignerMandate, visualReviewScore } = deps;

  // =========================================================
  // VISUAL DESIGNER AGENT
  // =========================================================

  server.registerTool(
    "visual_designer_agent",
    {
      title: "Visual Designer Agent",
      description:
        "Create a strict visual-review mandate that reviews implemented UI and routes precise fixes back to the developer until production-quality standards are met.",
      inputSchema: z.object({
        product: z.string().default("Application"),
        style: z.enum(["premium", "industrial", "minimal", "glass", "dashboard", "mobile", "editorial", "futuristic"]).default("premium"),
        platform: z.enum(["web", "mobile", "desktop", "responsive"]).default("responsive"),
        rtl: z.boolean().default(true),
        strictness: z.enum(["balanced", "strict", "elite"]).default("elite")
      }),
      annotations: { readOnlyHint: true, openWorldHint: false }
    },
    async (input) => {
      try {
        return result(visualDesignerMandate(input));
      } catch (error) {
        return errorResult(error);
      }
    }
  );

  server.registerTool(
    "visual_review",
    {
      title: "Visual UI Review",
      description:
        "Score rendered-UI observations, screenshot notes, implementation evidence, or source summaries and produce a strict revision/approval decision with concrete fixes.",
      inputSchema: z.object({
        content: z.string().min(10),
        targetScore: z.number().min(70).max(100).default(90),
        strict: z.boolean().default(true)
      }),
      annotations: { readOnlyHint: true, openWorldHint: false }
    },
    async ({ content, targetScore, strict }) => {
      try {
        const a = visualReviewScore(content);
        const verdict = a.score >= targetScore && (!strict || a.missing.length === 0) ? "APPROVED" : "NEEDS_REVISION";
        return result(JSON.stringify({
          score: a.score,
          targetScore,
          verdict,
          missingDimensions: a.missing,
          checks: [...a.baseChecks, ...a.advancedChecks],
          requiredFixes: a.missing.map((label, i) => ({
            id: `V${String(i + 1).padStart(3, "0")}`,
            area: label,
            severity: i < 2 ? "major" : "minor",
            action: `Improve and verify ${label.toLowerCase()} in the actual rendered interface.`
          })),
          nextStep: verdict === "APPROVED"
            ? "Visual gate passed. Continue to the final execution audit."
            : "Return these findings to the Developer, implement them, then run visual_review again before completion."
        }, null, 2));
      } catch (error) {
        return errorResult(error);
      }
    }
  );

  server.registerTool(
    "visual_iteration_plan",
    {
      title: "Visual Iteration Plan",
      description:
        "Turn visual-review findings into an ordered developer remediation plan with verification checkpoints.",
      inputSchema: z.object({
        findings: z.array(z.string()).min(1),
        product: z.string().default("Application"),
        preserveBehavior: z.boolean().default(true)
      }),
      annotations: { readOnlyHint: true, openWorldHint: false }
    },
    async ({ findings, product, preserveBehavior }) => {
      try {
        const steps = findings.map((finding, index) => ({
          order: index + 1,
          finding,
          developerAction: `Implement a focused visual correction for: ${finding}`,
          verification: `Re-open the affected ${product} screen at desktop and mobile widths and confirm the finding is no longer present.`
        }));
        return result(JSON.stringify({
          product,
          preserveBehavior,
          rule: preserveBehavior ? "Do not break or remove working behavior while applying visual fixes." : "Visual restructuring is allowed if required.",
          steps,
          finalGate: "Run visual_review again. Do not close the task until verdict=APPROVED and execution_audit also passes."
        }, null, 2));
      } catch (error) {
        return errorResult(error);
      }
    }
  );



}
