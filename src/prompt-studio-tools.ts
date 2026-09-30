import fs from "node:fs/promises";
import path from "node:path";
import * as z from "zod/v4";

type ResultFn = (text: string) => any;
type ErrorResultFn = (error: unknown) => any;

export function registerPromptStudioTools(
  server: any,
  deps: {
    projectRoot: string;
    promptLibraryDir: string;
    result: ResultFn;
    errorResult: ErrorResultFn;
    generatePrompt: (...args: any[]) => any;
    scorePrompt: (...args: any[]) => any;
    uiDesignDirectorBlock: (...args: any[]) => any;
    designTokenPreset: (...args: any[]) => any;
    scoreUIDesignText: (...args: any[]) => any;
    sanitizePromptName: (name: string) => string;
    safePath: (relativePath: string) => string;
    readPackageJson: () => Promise<any>;
    detectPackageManager: () => Promise<any>;
  }
) {
  const {
    projectRoot,
    promptLibraryDir,
    result,
    errorResult,
    generatePrompt,
    scorePrompt,
    uiDesignDirectorBlock,
    designTokenPreset,
    scoreUIDesignText,
    sanitizePromptName,
    safePath,
    readPackageJson,
    detectPackageManager
  } = deps;

  // =========================================================
  // PROMPT STUDIO — BUILD PROMPT
  // =========================================================

  server.registerTool(
    "build_prompt",
    {
      title: "Build Professional Prompt",
      description:
        "Generate a structured implementation prompt for software agents with requirements, constraints, autonomy rules and verification gates.",
      inputSchema: z.object({
        goal: z.string().min(10),
        projectType: z.string().default("Software Project"),
        mode: z.enum(["build", "fix", "upgrade", "audit", "ui", "architecture", "full"]).default("full"),
        language: z.enum(["ar", "en", "bilingual"]).default("bilingual"),
        autonomy: z.enum(["guided", "strong", "autonomous"]).default("autonomous"),
        stack: z.array(z.string()).default([]),
        requirements: z.array(z.string()).default([]),
        constraints: z.array(z.string()).default([]),
        deliverables: z.array(z.string()).default([]),
        context: z.string().default(""),
        includeVerification: z.boolean().default(true),
        uiStyle: z.enum(["premium", "industrial", "minimal", "glass", "dashboard", "mobile", "editorial", "futuristic"]).default("premium"),
        uiDensity: z.enum(["compact", "comfortable", "spacious"]).default("comfortable"),
        uiPlatform: z.enum(["web", "mobile", "desktop", "responsive"]).default("responsive"),
        rtl: z.boolean().default(true),
        brand: z.string().default(""),
        designReferences: z.array(z.string()).default([]),
        saveAs: z.string().optional()
      }),
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: false
      }
    },
    async (input) => {
      try {
        const prompt = generatePrompt(input as any);
        let savedTo: string | null = null;

        if (input.saveAs) {
          const name = sanitizePromptName(input.saveAs);
          const relative = path.join(promptLibraryDir, `${name}.md`);
          const target = safePath(relative);
          await fs.mkdir(path.dirname(target), { recursive: true });
          await fs.writeFile(target, prompt, "utf8");
          savedTo = relative;
        }

        return result(JSON.stringify({ prompt, savedTo }, null, 2));
      } catch (error) {
        return errorResult(error);
      }
    }
  );

  // =========================================================
  // PROMPT STUDIO — IMPROVE PROMPT
  // =========================================================

  server.registerTool(
    "improve_prompt",
    {
      title: "Improve Existing Prompt",
      description:
        "Wrap an existing rough prompt in a stronger execution contract while preserving the user's original requirements.",
      inputSchema: z.object({
        draft: z.string().min(5),
        mode: z.enum(["build", "fix", "upgrade", "audit", "ui", "architecture", "full"]).default("full"),
        language: z.enum(["ar", "en", "bilingual"]).default("bilingual"),
        autonomy: z.enum(["guided", "strong", "autonomous"]).default("autonomous"),
        extraConstraints: z.array(z.string()).default([]),
        includeVerification: z.boolean().default(true),
        uiStyle: z.enum(["premium", "industrial", "minimal", "glass", "dashboard", "mobile", "editorial", "futuristic"]).default("premium"),
        uiDensity: z.enum(["compact", "comfortable", "spacious"]).default("comfortable"),
        uiPlatform: z.enum(["web", "mobile", "desktop", "responsive"]).default("responsive")
      }),
      annotations: {
        readOnlyHint: true,
        openWorldHint: false
      }
    },
    async ({ draft, mode, language, autonomy, extraConstraints, includeVerification, uiStyle, uiDensity, uiPlatform }) => {
      try {
        const improved = generatePrompt({
          goal: "Execute the user's original request below completely and accurately without dropping any requirement.",
          projectType: "Existing Project",
          mode,
          language,
          autonomy,
          context: `ORIGINAL USER PROMPT — PRESERVE ALL REQUIREMENTS:

${draft}`,
          requirements: [
            "Treat every explicit requirement in the original prompt as binding unless technically impossible or unsafe.",
            "Do not silently simplify scope.",
            "If requirements conflict, prefer the most recent and most specific instruction."
          ],
          constraints: extraConstraints,
          deliverables: [
            "Implemented result in the real project",
            "Verification evidence",
            "Concise summary of changed files and remaining blockers"
          ],
          includeVerification,
          uiStyle,
          uiDensity,
          uiPlatform,
          rtl: true
        });

        return result(improved);
      } catch (error) {
        return errorResult(error);
      }
    }
  );

  // =========================================================
  // PROMPT STUDIO — PROJECT-AWARE PROMPT
  // =========================================================

  server.registerTool(
    "prompt_from_project",
    {
      title: "Build Prompt From Current Project",
      description:
        "Inspect the current project metadata and generate a context-aware implementation prompt grounded in the detected stack and scripts.",
      inputSchema: z.object({
        goal: z.string().min(10),
        mode: z.enum(["build", "fix", "upgrade", "audit", "ui", "architecture", "full"]).default("full"),
        language: z.enum(["ar", "en", "bilingual"]).default("bilingual"),
        autonomy: z.enum(["guided", "strong", "autonomous"]).default("autonomous"),
        requirements: z.array(z.string()).default([]),
        constraints: z.array(z.string()).default([]),
        deliverables: z.array(z.string()).default([]),
        uiStyle: z.enum(["premium", "industrial", "minimal", "glass", "dashboard", "mobile", "editorial", "futuristic"]).default("premium"),
        uiDensity: z.enum(["compact", "comfortable", "spacious"]).default("comfortable"),
        uiPlatform: z.enum(["web", "mobile", "desktop", "responsive"]).default("responsive"),
        rtl: z.boolean().default(true),
        brand: z.string().default(""),
        designReferences: z.array(z.string()).default([])
      }),
      annotations: {
        readOnlyHint: true,
        openWorldHint: false
      }
    },
    async (input) => {
      try {
        const pkg = await readPackageJson();
        const manager = await detectPackageManager();
        const root = await fs.readdir(projectRoot, { withFileTypes: true });
        const deps = {
          ...(pkg?.dependencies || {}),
          ...(pkg?.devDependencies || {})
        };
        const detected = [
          deps.react ? "React" : null,
          deps.next ? "Next.js" : null,
          deps.vite ? "Vite" : null,
          deps.typescript || await exists(path.join(projectRoot, "tsconfig.json")) ? "TypeScript" : null,
          deps.electron ? "Electron" : null,
          deps['@supabase/supabase-js'] ? "Supabase" : null,
          deps.tailwindcss ? "Tailwind CSS" : null
        ].filter(Boolean) as string[];

        const context = [
          `Project root: ${projectRoot}`,
          `Project name: ${pkg?.name || "unknown"}`,
          `Package manager: ${manager}`,
          `Detected stack: ${detected.join(", ") || "not confidently detected"}`,
          `Available scripts: ${Object.keys(pkg?.scripts || {}).join(", ") || "none detected"}`,
          `Root entries: ${root.slice(0, 40).map((x) => x.name).join(", ")}`
        ].join("\n");

        const prompt = generatePrompt({
          ...input,
          projectType: pkg?.name || "Current Project",
          stack: detected,
          context,
          includeVerification: true
        } as any);

        return result(prompt);
      } catch (error) {
        return errorResult(error);
      }
    }
  );


  // =========================================================
  // UI DESIGN DIRECTOR — DESIGN PROMPT
  // =========================================================

  server.registerTool(
    "design_ui_prompt",
    {
      title: "Design Beautiful UI Prompt",
      description:
        "Generate a high-fidelity UI/UX implementation prompt with visual direction, responsive composition, RTL, interaction states, accessibility and anti-generic design rules.",
      inputSchema: z.object({
        goal: z.string().min(5),
        product: z.string().default("Application"),
        style: z.enum(["premium", "industrial", "minimal", "glass", "dashboard", "mobile", "editorial", "futuristic"]).default("premium"),
        density: z.enum(["compact", "comfortable", "spacious"]).default("comfortable"),
        platform: z.enum(["web", "mobile", "desktop", "responsive"]).default("responsive"),
        rtl: z.boolean().default(true),
        brand: z.string().default(""),
        references: z.array(z.string()).default([]),
        screens: z.array(z.string()).default([]),
        requirements: z.array(z.string()).default([]),
        stack: z.array(z.string()).default([]),
        saveAs: z.string().optional()
      }),
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false }
    },
    async (input) => {
      try {
        const prompt = generatePrompt({
          goal: input.goal,
          projectType: input.product,
          mode: "ui",
          language: "bilingual",
          autonomy: "autonomous",
          stack: input.stack,
          requirements: [
            ...input.requirements,
            ...(input.screens.length ? [`Required screens/areas: ${input.screens.join(", ")}`] : [])
          ],
          constraints: [
            "Do not deliver a generic starter-template look.",
            "Do not sacrifice usability for decoration.",
            "Preserve existing working product behavior while upgrading presentation."
          ],
          deliverables: [
            "Implemented production UI in the real project",
            "Reusable design-system primitives/tokens",
            "Responsive and RTL verification",
            "Visual QA evidence and remaining blockers"
          ],
          includeVerification: true,
          uiStyle: input.style,
          uiDensity: input.density,
          uiPlatform: input.platform,
          rtl: input.rtl,
          brand: input.brand,
          designReferences: input.references
        });

        let savedTo: string | null = null;
        if (input.saveAs) {
          const name = sanitizePromptName(input.saveAs);
          const relative = path.join(promptLibraryDir, `${name}.md`);
          const target = safePath(relative);
          await fs.mkdir(path.dirname(target), { recursive: true });
          await fs.writeFile(target, prompt, "utf8");
          savedTo = relative;
        }
        return result(JSON.stringify({ prompt, savedTo }, null, 2));
      } catch (error) {
        return errorResult(error);
      }
    }
  );

  // =========================================================
  // UI DESIGN DIRECTOR — DESIGN SYSTEM
  // =========================================================

  server.registerTool(
    "generate_design_system",
    {
      title: "Generate UI Design System",
      description:
        "Generate a coherent token foundation and implementation rules for a polished application UI.",
      inputSchema: z.object({
        style: z.enum(["premium", "industrial", "minimal", "glass", "dashboard", "mobile", "editorial", "futuristic"]).default("premium"),
        density: z.enum(["compact", "comfortable", "spacious"]).default("comfortable"),
        platform: z.enum(["web", "mobile", "desktop", "responsive"]).default("responsive"),
        rtl: z.boolean().default(true),
        brand: z.string().default("")
      }),
      annotations: { readOnlyHint: true, openWorldHint: false }
    },
    async ({ style, density, platform, rtl, brand }) => {
      try {
        const tokens = designTokenPreset(style, density);
        return result(JSON.stringify({
          tokens,
          direction: uiDesignDirectorBlock({ style, density, platform, rtl, brand }),
          cssVariablesExample: `:root {\n  --radius-sm: ${tokens.radius.sm}px;\n  --radius-md: ${tokens.radius.md}px;\n  --radius-lg: ${tokens.radius.lg}px;\n  --space-sm: ${tokens.space.sm}px;\n  --space-md: ${tokens.space.md}px;\n  --space-lg: ${tokens.space.lg}px;\n  --motion-fast: ${tokens.motion.fast};\n  --motion-normal: ${tokens.motion.normal};\n}`
        }, null, 2));
      } catch (error) {
        return errorResult(error);
      }
    }
  );

  // =========================================================
  // UI DESIGN DIRECTOR — REVIEW
  // =========================================================

  server.registerTool(
    "ui_design_quality_check",
    {
      title: "UI Design Quality Check",
      description:
        "Score a UI implementation brief or source snippet against responsive, design-system, accessibility, RTL, interaction-state and visual-hierarchy requirements.",
      inputSchema: z.object({
        content: z.string().min(5)
      }),
      annotations: { readOnlyHint: true, openWorldHint: false }
    },
    async ({ content }) => {
      try {
        const assessment = scoreUIDesignText(content);
        const grade = assessment.score >= 90 ? "EXCELLENT" : assessment.score >= 75 ? "STRONG" : assessment.score >= 55 ? "NEEDS_IMPROVEMENT" : "WEAK";
        return result(JSON.stringify({
          score: assessment.score,
          grade,
          checks: assessment.checks,
          missing: assessment.missing,
          recommendation: assessment.missing.length
            ? `Strengthen these UI dimensions before completion: ${assessment.missing.join(", ")}.`
            : "UI specification covers the core quality dimensions. Verify the rendered result visually before completion."
        }, null, 2));
      } catch (error) {
        return errorResult(error);
      }
    }
  );

  // =========================================================
  // PROMPT STUDIO — QUALITY CHECK
  // =========================================================

  server.registerTool(
    "prompt_quality_check",
    {
      title: "Prompt Quality Check",
      description:
        "Score a software-development prompt for execution quality and identify missing prompt components.",
      inputSchema: z.object({
        prompt: z.string().min(5)
      }),
      annotations: {
        readOnlyHint: true,
        openWorldHint: false
      }
    },
    async ({ prompt }) => {
      try {
        const assessment = scorePrompt(prompt);
        const missing = assessment.checks.filter((x) => !x.ok).map((x) => x.label);
        const grade = assessment.score >= 90 ? "EXCELLENT" : assessment.score >= 75 ? "STRONG" : assessment.score >= 55 ? "NEEDS_IMPROVEMENT" : "WEAK";

        return result(JSON.stringify({
          score: assessment.score,
          grade,
          checks: assessment.checks,
          missing,
          recommendation: missing.length
            ? `Add or strengthen: ${missing.join(", ")}.`
            : "Prompt has the core components required for reliable software-agent execution."
        }, null, 2));
      } catch (error) {
        return errorResult(error);
      }
    }
  );

  // =========================================================
  // PROMPT STUDIO — LIBRARY
  // =========================================================

  server.registerTool(
    "prompt_library",
    {
      title: "Prompt Library",
      description:
        "List, read, save or delete reusable prompts stored under .krom-prompts in the current project.",
      inputSchema: z.object({
        action: z.enum(["list", "get", "save", "delete"]),
        name: z.string().optional(),
        content: z.string().optional()
      }),
      annotations: {
        readOnlyHint: false,
        destructiveHint: true,
        idempotentHint: false,
        openWorldHint: false
      }
    },
    async ({ action, name, content }) => {
      try {
        const dir = safePath(promptLibraryDir);
        await fs.mkdir(dir, { recursive: true });

        if (action === "list") {
          const entries = await fs.readdir(dir, { withFileTypes: true });
          const prompts = entries
            .filter((x) => x.isFile() && x.name.endsWith(".md"))
            .map((x) => x.name.replace(/\.md$/, ""))
            .sort();
          return result(JSON.stringify({ prompts }, null, 2));
        }

        if (!name) {
          throw new Error("name is required for get/save/delete.");
        }

        const safeName = sanitizePromptName(name);
        const relative = path.join(promptLibraryDir, `${safeName}.md`);
        const target = safePath(relative);

        if (action === "get") {
          return result(await fs.readFile(target, "utf8"));
        }

        if (action === "save") {
          if (!content?.trim()) throw new Error("content is required for save.");
          const backup = await backupFile(target);
          await fs.writeFile(target, content, "utf8");
          return result(JSON.stringify({ success: true, file: relative, backup: backup ? path.relative(projectRoot, backup) : null }, null, 2));
        }

        if (!(await exists(target))) {
          throw new Error(`Prompt not found: ${safeName}`);
        }
        const backup = await backupFile(target);
        await fs.unlink(target);
        return result(JSON.stringify({ success: true, deleted: relative, backup: backup ? path.relative(projectRoot, backup) : null }, null, 2));
      } catch (error) {
        return errorResult(error);
      }
    }
  );



}
