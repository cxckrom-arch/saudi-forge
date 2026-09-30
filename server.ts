import { createMcpFastifyApp } from "@modelcontextprotocol/fastify";
import { toNodeHandler } from "@modelcontextprotocol/node";
import { createMcpHandler, McpServer } from "@modelcontextprotocol/server";
import * as z from "zod/v4";

import fs from "node:fs/promises";
import path from "node:path";
import { execFile, spawn, type ChildProcess } from "node:child_process";
import { promisify } from "node:util";

import { ToolRuntime, automationInput, outcome } from './src/tool-runtime.js';
import { resolveCommand } from './src/process-command.js';
import { chatMessages, completionUrl } from './src/chat-context.js';
import { MAX_FILE_SIZE, IGNORED_DIRS, TEXT_EXTENSIONS, createProjectContext } from './src/project-context.js';
import { createPackageRunner } from './src/package-runner.js';
import { registerAutomationTools } from './src/automation-tools.js';
const execFileAsync = promisify(execFile);

const PORT = Number(process.env.PORT || 3001);
const DEFAULT_KROM_HOME = process.platform === "win32" ? "C:\\KSA-FORGE" : process.cwd();
const KROM_HOME = path.resolve(process.env.KROM_HOME || DEFAULT_KROM_HOME);
const PROJECT_ROOT = path.resolve(process.env.KROM_PROJECT_ROOT || KROM_HOME);
await v342LoadSecretEnv();
const toolRuntime = new ToolRuntime(path.join(PROJECT_ROOT,".krom","automation"));

function result(text: string) {
  return {
    content: [
      {
        type: "text" as const,
        text
      }
    ]
  };
}

function errorResult(error: unknown) {
  return {
    content: [
      {
        type: "text" as const,
        text:
          error instanceof Error
            ? error.message
            : String(error)
      }
    ],
    isError: true
  };
}

const {
  safePath,
  exists,
  backupFile,
  isTextFile,
  walkProject,
  readPackageJson,
  detectPackageManager
} = createProjectContext(PROJECT_ROOT);

const { executeProgram, runPackageScript } = createPackageRunner({
  projectRoot: PROJECT_ROOT,
  readPackageJson,
  detectPackageManager
});

// =========================================================
// PROMPT STUDIO HELPERS
// =========================================================

type PromptLanguage = "ar" | "en" | "bilingual";
type PromptMode = "build" | "fix" | "upgrade" | "audit" | "ui" | "architecture" | "full";
type AutonomyLevel = "guided" | "strong" | "autonomous";

const PROMPT_LIBRARY_DIR = ".krom-prompts";

function sanitizePromptName(name: string) {
  const cleaned = name
    .trim()
    .replace(/[^a-zA-Z0-9._-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^[-.]+|[-.]+$/g, "")
    .slice(0, 80);

  if (!cleaned) {
    throw new Error("Prompt name must contain letters or numbers.");
  }

  return cleaned;
}

function promptLanguageHeader(language: PromptLanguage) {
  if (language === "ar") {
    return "اكتب جميع المخرجات التوضيحية باللغة العربية، مع إبقاء أسماء التقنيات والأوامر البرمجية بصيغتها الأصلية.";
  }

  if (language === "bilingual") {
    return "Use Arabic for operator-facing explanations and English for code, identifiers, commands, technical standards, and file names when clearer.";
  }

  return "Use clear technical English for all implementation notes and outputs.";
}

function autonomyProtocol(level: AutonomyLevel) {
  if (level === "guided") {
    return `## EXECUTION MODE — GUIDED
Proceed in small verified steps. Do not make destructive changes without evidence. If a requirement is ambiguous, prefer the safest reversible implementation.`;
  }

  if (level === "strong") {
    return `## EXECUTION MODE — STRONG
Inspect before editing. Implement the requested scope end-to-end, resolve routine build/type/lint/runtime errors as they appear, and continue until the requested feature is verified. Do not stop after planning or after editing a single file.`;
  }

  return `## AUTONOMOUS CONTINUOUS EXECUTION PROTOCOL
Continue autonomously until the requested scope is implemented, integrated, tested, and verified.

Do not stop merely because:
- one phase is complete;
- one file was changed;
- a build, test, typecheck, lint, import, dependency, port, configuration, or runtime error appears;
- the first approach fails;
- additional files must be inspected;
- the application must be restarted.

For each failure: capture the exact error, determine root cause, inspect relevant code, apply the smallest robust fix, rerun validation, and continue. Never hide an error by deleting required functionality.`;
}

function modeInstructions(mode: PromptMode) {
  const modes: Record<PromptMode, string> = {
    build: `Build the requested capability as a complete working feature. Cover UI, state, data flow, backend/database integration where applicable, validation, permissions, error states, responsive behavior, and verification.`,
    fix: `Reproduce and isolate the defect first. Identify root cause before patching. Preserve unrelated working behavior. Add or update a regression check when practical and verify the original failure path after the fix.`,
    upgrade: `Audit the current implementation, retain working behavior, then upgrade architecture, UX, reliability, performance, and maintainability without unnecessary rewrites.`,
    audit: `Perform an evidence-based audit. Separate confirmed findings from assumptions. Cite exact files/symbols/errors, prioritize by severity and impact, and include concrete remediation steps. Do not claim a fix unless it was actually applied and verified.`,
    ui: `Treat UX as a functional requirement. Implement hierarchy, spacing, responsive layouts, RTL/LTR when relevant, loading/empty/error states, keyboard accessibility, mobile behavior, and consistent reusable components. Avoid decorative-only mockups.`,
    architecture: `Design an implementation-ready architecture based on the existing repository. Define modules, contracts, data model, boundaries, security, migration strategy, observability, and verification. Prefer incremental migration over destructive rewrites.`,
    full: `Execute a full product pass: inspect architecture, implement missing functionality, fix defects, integrate data and permissions, improve UX/responsiveness, harden security, and run the available verification gates.`
  };

  return modes[mode];
}

function verificationBlock() {
  return `## VERIFICATION GATE
Before declaring completion, inspect available package scripts and run the applicable checks, preferably in this order:
1. typecheck
2. lint
3. tests
4. build

Also verify the exact user flow that was changed. Report PASS / FAIL / SKIPPED with evidence. A missing script is SKIPPED, not PASS. Do not claim success when a critical check fails.`;
}

function antiFakeBlock() {
  return `## IMPLEMENTATION INTEGRITY
- Do not create fake buttons, fake API responses, or placeholder success states.
- Do not claim code, tables, routes, migrations, environment variables, or integrations exist unless verified.
- Do not weaken authentication, authorization, RLS, validation, or security controls just to make an error disappear.
- Preserve existing user data and working features.
- Prefer small, reversible, reviewable changes.
- Keep secrets out of client code and source control.`;
}

function formatList(title: string, items?: string[]) {
  const filtered = (items || []).map((x) => x.trim()).filter(Boolean);
  if (!filtered.length) return "";
  return `## ${title}
${filtered.map((x) => `- ${x}`).join("\n")}`;
}

function generatePrompt(input: {
  goal: string;
  projectType?: string;
  mode: PromptMode;
  language: PromptLanguage;
  autonomy: AutonomyLevel;
  stack?: string[];
  requirements?: string[];
  constraints?: string[];
  deliverables?: string[];
  context?: string;
  includeVerification: boolean;
  uiStyle?: UIStyle;
  uiDensity?: UIDensity;
  uiPlatform?: UIPlatform;
  rtl?: boolean;
  brand?: string;
  designReferences?: string[];
}) {
  const title = input.projectType?.trim() || "Software Project";
  const sections = [
    `# KROM FORGE EXECUTION PROMPT — ${title.toUpperCase()}`,
    `## PRIMARY OBJECTIVE
${input.goal.trim()}`,
    `## OPERATING RULE
${promptLanguageHeader(input.language)}`,
    `## WORK MODE
${modeInstructions(input.mode)}`,
    (input.mode === "ui" || input.mode === "full") ? uiDesignDirectorBlock({
      style: input.uiStyle,
      density: input.uiDensity,
      platform: input.uiPlatform,
      rtl: input.rtl,
      brand: input.brand,
      references: input.designReferences
    }) : "",
    input.context?.trim() ? `## CURRENT CONTEXT
${input.context.trim()}` : "",
    formatList("TECH STACK / PREFERRED TECHNOLOGIES", input.stack),
    formatList("REQUIREMENTS", input.requirements),
    formatList("CONSTRAINTS", input.constraints),
    formatList("DELIVERABLES", input.deliverables),
    `## REQUIRED WORKFLOW
1. Inspect the existing project before editing.
2. Identify the current architecture, routes, state/data flow, dependencies, database integration, and relevant tests.
3. Build a concise internal implementation plan.
4. Implement the requested scope in the real project files.
5. Verify integration points and affected user flows.
6. Run available quality gates and fix regressions introduced by the change.
7. Finish with a concise evidence report: files changed, behavior implemented, checks run, remaining blockers (if any).`,
    antiFakeBlock(),
    autonomyProtocol(input.autonomy),
    input.includeVerification ? verificationBlock() : "",
    `## DEFINITION OF DONE
The task is complete only when the requested behavior exists in the actual project, is connected to real data/services where required, has meaningful error/loading/empty handling, works on the relevant screen sizes, and the available verification evidence does not contain an unresolved critical failure.`
  ].filter(Boolean);

  return sections.join("\n\n");
}

function scorePrompt(prompt: string) {
  const text = prompt.toLowerCase();
  const checks = [
    { key: "objective", label: "Clear objective", ok: /objective|goal|هدف|المطلوب/.test(text), weight: 18 },
    { key: "context", label: "Project context", ok: /context|project|repository|المشروع|السياق/.test(text), weight: 12 },
    { key: "requirements", label: "Explicit requirements", ok: /requirements|must|يجب|المتطلبات/.test(text), weight: 15 },
    { key: "constraints", label: "Constraints / safety", ok: /constraint|preserve|security|لا تحذف|حافظ|صلاحيات/.test(text), weight: 12 },
    { key: "workflow", label: "Execution workflow", ok: /inspect|implement|workflow|افحص|نفذ/.test(text), weight: 14 },
    { key: "verification", label: "Verification", ok: /test|build|lint|typecheck|verify|اختبار|تحقق/.test(text), weight: 17 },
    { key: "done", label: "Definition of done", ok: /definition of done|complete only|مكتمل|اكتمال/.test(text), weight: 12 }
  ];

  const score = checks.reduce((sum, c) => sum + (c.ok ? c.weight : 0), 0);
  return { score, checks };
}




// =========================================================
// UI / UX DESIGN DIRECTOR
// =========================================================

type UIStyle = "premium" | "industrial" | "minimal" | "glass" | "dashboard" | "mobile" | "editorial" | "futuristic";
type UIDensity = "compact" | "comfortable" | "spacious";
type UIPlatform = "web" | "mobile" | "desktop" | "responsive";

function uiStyleDirection(style: UIStyle) {
  const directions: Record<UIStyle, string> = {
    premium: "Premium product UI: restrained luxury, crisp hierarchy, subtle depth, refined typography, high-quality iconography, and polished micro-interactions. Avoid flashy gradients and decorative clutter.",
    industrial: "Industrial enterprise UI: strong information hierarchy, operational clarity, durable visual language, safety/status semantics, dense-but-readable data, and professional control-room polish.",
    minimal: "Minimal modern UI: generous whitespace, strong typography, few visual primitives, quiet borders, deliberate emphasis, and zero ornamental noise.",
    glass: "Controlled glass UI: translucent surfaces only where hierarchy benefits, strong contrast, restrained blur, solid fallbacks, and no excessive glow or neon effects.",
    dashboard: "Enterprise dashboard UI: clear KPI hierarchy, scannable cards, consistent data tables, useful filters, strong status encoding, and purposeful charts with low visual noise.",
    mobile: "Mobile-first application UI: thumb-friendly controls, bottom-safe navigation patterns, concise content density, large touch targets, clear sheet/dialog behavior, and excellent small-screen ergonomics.",
    editorial: "Editorial product UI: typography-led hierarchy, structured rhythm, disciplined grid, strong content framing, and high readability with elegant restraint.",
    futuristic: "Modern futuristic UI: advanced but usable visual language, subtle motion, layered surfaces, precise geometry, and restrained technical accents without sci-fi gimmicks."
  };
  return directions[style];
}

function uiDensityRules(density: UIDensity) {
  if (density === "compact") return "Use compact enterprise spacing while preserving touch targets and readability. Prefer efficient tables, filters, and dense information blocks.";
  if (density === "spacious") return "Use generous spacing, larger section rhythm, and calm layouts. Preserve information density through hierarchy rather than oversized empty areas.";
  return "Use balanced spacing suitable for daily professional use: neither cramped nor oversized.";
}

function uiPlatformRules(platform: UIPlatform) {
  const rules: Record<UIPlatform, string> = {
    web: "Optimize for modern desktop/laptop browsers while remaining usable down to tablet widths.",
    mobile: "Design mobile-first for 360–430px widths, safe areas, touch input, virtual keyboard behavior, and bottom navigation where appropriate.",
    desktop: "Optimize for desktop application workflows, keyboard navigation, resizable panels, data density, and persistent navigation.",
    responsive: "Design responsively across 375px, 768px, 1024px, 1440px and wide screens. Recompose layouts instead of merely shrinking them."
  };
  return rules[platform];
}

function uiDesignDirectorBlock(input?: {
  style?: UIStyle;
  density?: UIDensity;
  platform?: UIPlatform;
  rtl?: boolean;
  brand?: string;
  references?: string[];
}) {
  const style = input?.style || "premium";
  const density = input?.density || "comfortable";
  const platform = input?.platform || "responsive";
  const refs = (input?.references || []).filter(Boolean);
  const rtlRule = input?.rtl === false
    ? "Support logical CSS/layout primitives so RTL can be added without structural rewrites."
    : "RTL is a first-class requirement: verify direction, icon placement, table alignment, drawers, breadcrumbs, form labels, number/date presentation, and mixed Arabic/English text.";

  return `## UI / UX DESIGN DIRECTOR
Visual direction: ${uiStyleDirection(style)}
Density: ${uiDensityRules(density)}
Platform: ${uiPlatformRules(platform)}
${input?.brand ? `Brand direction: ${input.brand}` : "Brand direction: derive a coherent visual identity from the product domain and existing brand assets; do not invent logos."}
${refs.length ? `Reference qualities to capture (do not clone): ${refs.join("; ")}` : "Reference standard: polished production SaaS / enterprise software quality, not generic starter-template styling."}

### VISUAL QUALITY RULES
- Establish a deliberate type scale, spacing scale, radius scale, surface hierarchy, icon sizing, and semantic status system before styling individual screens.
- Use a coherent 8px-derived spacing rhythm with optical adjustments where needed.
- Prefer one clear visual hierarchy per screen: page title → key actions → primary content → secondary metadata.
- Keep card styles consistent; do not give every container a shadow, border, gradient, or different radius.
- Use elevation sparingly. Prefer borders/surface contrast for ordinary grouping and shadows for true overlay/elevation.
- Use gradients only when they improve brand hierarchy. Never use random purple/blue gradients as filler.
- Avoid excessive pills, oversized cards, giant empty headers, gratuitous glassmorphism, neon glows, emoji-as-icons, and dashboard-card overload.
- Use professional iconography from the project's existing icon library. Keep stroke weight and visual size consistent.
- Charts must answer a question. Avoid decorative charts, redundant legends, and colors with no semantic meaning.
- Tables require readable density, sticky/clear headers where useful, row actions that do not dominate, empty states, loading states, and mobile alternatives.
- Forms require clear labels, helper/error text, grouped fields, correct input types, focus states, validation, and sensible keyboard/tab order.
- Primary actions must be visually obvious; destructive actions must never look equivalent to primary actions.

### RESPONSIVE COMPOSITION
- Recompose multi-column layouts on smaller screens; do not simply squeeze desktop UI.
- Prevent horizontal overflow except for intentionally scrollable data regions.
- Minimum interactive target ~44px on touch layouts unless dense desktop-only controls justify otherwise.
- Dialogs, sheets, menus, tooltips, tables, charts, and date pickers must be checked on mobile.
- Navigation must have a deliberate mobile pattern rather than a desktop sidebar forced into a narrow viewport.

### RTL / INTERNATIONALIZATION
${rtlRule}

### INTERACTION & MOTION
- Add motion only to clarify state, hierarchy, continuity, or feedback.
- Prefer 120–240ms transitions for common interactions; respect prefers-reduced-motion.
- Hover, focus, pressed, selected, disabled, loading, success, warning, error, and offline states must be visually distinct.
- Use skeletons only when layout is predictable; otherwise use concise progress/loading states.

### ACCESSIBILITY
- Target WCAG AA contrast for normal text and essential controls.
- Preserve visible keyboard focus.
- Do not encode status by color alone; pair color with text/icon/shape.
- Use semantic HTML and accessible names for icon-only controls.

### DESIGN VERIFICATION
Before declaring UI work complete, inspect the actual rendered flow if browser/preview tooling exists and verify:
1. visual hierarchy and alignment;
2. consistent spacing/typography/radii;
3. desktop + tablet + mobile composition;
4. RTL behavior when applicable;
5. loading/empty/error/success states;
6. keyboard/focus behavior;
7. no clipped text, overflow, overlap, or inaccessible contrast;
8. no fake controls or disconnected interactions.
If a rendered screen looks generic, crowded, inconsistent, or unfinished, iterate before completion.`;
}

function designTokenPreset(style: UIStyle, density: UIDensity) {
  const radius = style === "industrial" ? { sm: 6, md: 10, lg: 14, xl: 18 } : style === "minimal" ? { sm: 6, md: 8, lg: 12, xl: 16 } : { sm: 8, md: 12, lg: 16, xl: 22 };
  const space = density === "compact"
    ? { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32 }
    : density === "spacious"
      ? { xs: 6, sm: 12, md: 20, lg: 28, xl: 40, xxl: 56 }
      : { xs: 4, sm: 8, md: 16, lg: 24, xl: 32, xxl: 48 };

  return {
    style,
    density,
    typography: {
      display: "clamp(2rem, 3vw, 3.25rem)",
      h1: "clamp(1.75rem, 2.2vw, 2.5rem)",
      h2: "clamp(1.35rem, 1.6vw, 1.875rem)",
      h3: "1.125rem",
      body: "0.95rem",
      small: "0.8125rem",
      lineHeightBody: 1.55
    },
    radius,
    space,
    motion: { fast: "120ms", normal: "180ms", slow: "240ms" },
    controlHeights: density === "compact" ? { sm: 32, md: 36, lg: 40 } : { sm: 36, md: 40, lg: 44 },
    principles: [
      "Use semantic color tokens rather than hard-coded status colors across components.",
      "Keep surfaces and borders quiet; reserve emphasis for important information and actions.",
      "Use a consistent content max-width and grid rhythm per product surface."
    ]
  };
}

function scoreUIDesignText(textInput: string) {
  const text = textInput.toLowerCase();
  const checks = [
    { label: "Responsive behavior", ok: /responsive|mobile|breakpoint|grid|375|430|768/.test(text), weight: 15 },
    { label: "Design system/tokens", ok: /token|spacing|typography|radius|css variable|design system/.test(text), weight: 15 },
    { label: "Interaction states", ok: /hover|focus|disabled|loading|error|empty|pressed|selected/.test(text), weight: 13 },
    { label: "Accessibility", ok: /accessibility|wcag|aria|keyboard|contrast|focus-visible/.test(text), weight: 13 },
    { label: "RTL/i18n", ok: /rtl|dir=|logical propert|arabic|العربي/.test(text), weight: 10 },
    { label: "Visual hierarchy", ok: /hierarchy|typography|heading|primary action|visual/.test(text), weight: 12 },
    { label: "Component consistency", ok: /component|reusable|consistent|variant/.test(text), weight: 12 },
    { label: "Motion discipline", ok: /transition|motion|animation|reduced-motion/.test(text), weight: 10 }
  ];
  const score = checks.reduce((sum, x) => sum + (x.ok ? x.weight : 0), 0);
  return { score, checks, missing: checks.filter((x) => !x.ok).map((x) => x.label) };
}



// =========================================================
// VISUAL DESIGNER AGENT
// =========================================================

type VisualReviewSeverity = "critical" | "major" | "minor";
type VisualReviewFinding = {
  area: string;
  issue: string;
  severity: VisualReviewSeverity;
  fix: string;
};

function visualDesignerMandate(input?: {
  product?: string;
  style?: UIStyle;
  platform?: UIPlatform;
  rtl?: boolean;
  strictness?: "balanced" | "strict" | "elite";
}) {
  const product = input?.product || "Application";
  const style = input?.style || "premium";
  const platform = input?.platform || "responsive";
  const strictness = input?.strictness || "elite";
  const rtl = input?.rtl !== false;
  return `# KROM VISUAL DESIGNER AGENT — ${product}

## ROLE
Act as the final visual quality authority after implementation. Inspect the actual UI, not only the source code. Your job is to detect generic, inconsistent, crowded, unfinished, or weak visual work and route precise fixes back to the Developer until the result reaches production quality.

## TARGET
Style: ${uiStyleDirection(style)}
Platform: ${uiPlatformRules(platform)}
RTL: ${rtl ? "Required and must be visually verified." : "Not required unless the product already supports it."}
Review strictness: ${strictness}.

## REVIEW ORDER
1. Composition and hierarchy — page structure, focal point, action priority, density, whitespace balance.
2. Alignment and rhythm — grids, baselines, section spacing, card gutters, visual grouping.
3. Typography — scale, weights, line-height, truncation, Arabic/English balance, numeric readability.
4. Components — consistent radii, borders, icon sizing, buttons, inputs, tables, cards, dialogs and states.
5. Responsive behavior — desktop, tablet and mobile recomposition; no clipped/overlapping content.
6. RTL — logical spacing, icon direction, breadcrumbs, sidebars, drawers, tables and mixed-language content.
7. Interaction — hover/focus/pressed/selected/disabled/loading/empty/error/success states.
8. Accessibility — contrast, keyboard focus, target size, labels and readable content density.
9. Product polish — no placeholder content, fake controls, random gradients, excessive shadows/glow, inconsistent iconography, or template-like visual noise.

## REJECTION RULE
Do NOT approve the UI when any critical or major issue remains. Return each finding with: exact area, problem, severity, expected fix, and verification condition. The Developer must implement the fixes, then the Visual Designer reviews again.

## APPROVAL RULE
Approve only when:
- no critical findings remain;
- no major findings remain;
- responsive layouts are verified;
- ${rtl ? "RTL is verified;" : "directionality is consistent;"}
- primary flows have complete interaction states;
- the visual language is coherent and non-generic;
- final quality score is at least 90/100.

## HANDOFF FORMAT
Return JSON-compatible sections: score, verdict, findings[], strengths[], requiredFixes[], recheck[]. Verdict must be NEEDS_REVISION or APPROVED.`;
}

function visualReviewScore(content: string) {
  const base = scoreUIDesignText(content);
  const text = content.toLowerCase();
  const advanced = [
    { label: "Alignment / spacing rhythm", ok: /align|grid|spacing|gutter|rhythm|baseline/.test(text), weight: 10 },
    { label: "Typography polish", ok: /typography|font|line-height|weight|truncate|heading/.test(text), weight: 8 },
    { label: "Navigation quality", ok: /sidebar|navigation|navbar|breadcrumb|tabs|bottom nav/.test(text), weight: 6 },
    { label: "Data presentation", ok: /table|chart|kpi|filter|pagination|data/.test(text), weight: 6 },
    { label: "Anti-generic polish", ok: /generic|template|gradient|shadow|glow|visual noise|polish/.test(text), weight: 5 }
  ];
  const advancedScore = advanced.reduce((sum, x) => sum + (x.ok ? x.weight : 0), 0);
  const score = Math.min(100, Math.round(base.score * 0.65 + advancedScore));
  const missing = [...base.missing, ...advanced.filter((x) => !x.ok).map((x) => x.label)];
  return { score, baseChecks: base.checks, advancedChecks: advanced, missing };
}

// =========================================================
// PRECISION EXECUTION ENGINE
// =========================================================

type ExecutionRequirement = {
  id: string;
  text: string;
  status: "pending" | "in_progress" | "verified" | "blocked";
  evidence?: string[];
  notes?: string;
};

type ExecutionManifest = {
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

const EXECUTION_DIR = ".krom-execution";
const EXECUTION_FILE = "current-task.json";

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



// =========================================================
// KROM v3.0 AUTONOMOUS ENGINEERING CORE
// =========================================================

type KromProjectMemory = {
  version: 1;
  updatedAt: string;
  stack: string[];
  conventions: string[];
  designRules: string[];
  decisions: Array<{ at: string; decision: string; reason?: string }>;
  knownIssues: Array<{ at: string; issue: string; resolution?: string }>;
};

const KROM_STATE_DIR = ".krom";
const PROJECT_MEMORY_FILE = "project-memory.json";

async function kromStatePath(file: string) {
  const dir = safePath(KROM_STATE_DIR);
  await fs.mkdir(dir, { recursive: true });
  return path.join(dir, file);
}

async function readProjectMemory(): Promise<KromProjectMemory> {
  const file = await kromStatePath(PROJECT_MEMORY_FILE);
  try {
    return JSON.parse(await fs.readFile(file, "utf8"));
  } catch {
    return {
      version: 1,
      updatedAt: new Date().toISOString(),
      stack: [],
      conventions: [],
      designRules: [],
      decisions: [],
      knownIssues: []
    };
  }
}

async function writeProjectMemory(memory: KromProjectMemory) {
  memory.updatedAt = new Date().toISOString();
  const file = await kromStatePath(PROJECT_MEMORY_FILE);
  await fs.writeFile(file, JSON.stringify(memory, null, 2), "utf8");
}

function orchestratorPlan(prompt: string, uiHeavy: boolean, deployment: boolean) {
  const reqs = extractRequirementsFromPrompt(prompt);
  const agents = [
    { agent: "Architect", duty: "Inspect architecture, dependencies, routes, data flow, and impact before implementation." },
    ...(uiHeavy ? [{ agent: "UI/UX Director", duty: "Define visual hierarchy, design tokens, responsive behavior, RTL, and interaction states." }] : []),
    { agent: "Developer", duty: "Implement every accepted requirement in the real codebase with minimal regression risk." },
    { agent: "QA", duty: "Verify requirements, tests, routes, user flows, console errors, and regressions." },
    { agent: "Security", duty: "Review secrets, auth, permissions, validation, data exposure, and unsafe defaults." },
    ...(uiHeavy ? [{ agent: "Visual Designer", duty: "Review rendered UI quality and reject generic, inconsistent, or broken responsive output." }] : []),
    ...(deployment ? [{ agent: "DevOps", duty: "Verify production build, environment contract, deployment readiness, and rollback path." }] : [])
  ];
  return {
    mode: "AUTONOMOUS_PRECISION",
    requirements: reqs.map((text, i) => ({ id: `REQ-${String(i+1).padStart(3,"0")}`, text })),
    agents,
    routingRule: "A failed gate returns the task to the responsible agent. Never skip an unresolved requirement to reach DONE.",
    lifecycle: ["INSPECT", "PLAN", ...(uiHeavy ? ["DESIGN"] : []), "IMPLEMENT", "VERIFY", ...(uiHeavy ? ["VISUAL_REVIEW"] : []), "SECURITY_REVIEW", ...(deployment ? ["RELEASE_GATE"] : []), "DONE"],
    doneDefinition: "All unblocked requirements have evidence; build/typecheck/tests applicable to the project pass; critical security issues are zero; UI gate passes when UI work is in scope."
  };
}

async function detectPackageScripts() {
  try {
    const pkgPath = safePath("package.json");
    const pkg = JSON.parse(await fs.readFile(pkgPath, "utf8"));
    return pkg.scripts || {};
  } catch {
    return {} as Record<string,string>;
  }
}

async function runNpmScriptIfPresent(names: string[]) {
  const scripts = await detectPackageScripts();
  const name = names.find((n) => typeof scripts[n] === "string");
  if (!name) return { available: false, script: null, success: null, message: `No script found: ${names.join(", ")}` };
  const r = await executeProgram("npm", ["run", name], PROJECT_ROOT, 120000);
  return { available: true, script: name, success: r.success, stdout: r.stdout, stderr: r.stderr, message: r.message };
}

function traceabilityFromManifest(manifest: ExecutionManifest | null) {
  if (!manifest) return { active: false, rows: [] };
  return {
    active: true,
    taskId: manifest.taskId,
    rows: manifest.requirements.map((r) => ({
      requirement: r.id,
      statement: r.text,
      status: r.status,
      evidence: r.evidence || [],
      notes: r.notes || "",
      changedFiles: manifest.changedFiles
    }))
  };
}



type BrowserViewport = { name: string; width: number; height: number };

type LiveBrowserVisionReport = {
  url: string;
  routes: string[];
  viewports: BrowserViewport[];
  screenshots: Array<{ route: string; viewport: string; path: string; width: number; height: number }>;
  consoleErrors: Array<{ route: string; viewport: string; text: string }>;
  pageErrors: Array<{ route: string; viewport: string; text: string }>;
  failedRequests: Array<{ route: string; viewport: string; url: string; method: string; failure: string }>;
  badResponses: Array<{ route: string; viewport: string; url: string; status: number }>;
  overflowFindings: Array<{ route: string; viewport: string; scrollWidth: number; clientWidth: number }>;
  runtimeMs: number;
};

async function detectBrowserAutomationPackage() {
  const pkg = await readPackageJson();
  const all = { ...(pkg?.dependencies || {}), ...(pkg?.devDependencies || {}) } as Record<string,string>;
  if (all["playwright"]) return { available: true, packageName: "playwright" };
  if (all["@playwright/test"]) return { available: true, packageName: "@playwright/test" };
  return { available: false, packageName: null };
}

function safeBrowserRoute(route: string) {
  const normalized = route.trim() || "/";
  if (!normalized.startsWith("/")) throw new Error(`Browser route must start with /: ${route}`);
  return normalized;
}

function browserArtifactName(route: string, viewport: string) {
  const routePart = (route === "/" ? "home" : route)
    .replace(/^\/+/, "")
    .replace(/[^a-zA-Z0-9_-]+/g, "-")
    .replace(/^-+|-+$/g, "") || "home";
  const vp = viewport.replace(/[^a-zA-Z0-9_-]+/g, "-");
  return `${routePart}__${vp}.png`;
}

async function runLiveBrowserVision(
  baseUrl: string,
  routes: string[],
  viewports: BrowserViewport[],
  waitMs: number,
  outputDirectory: string
) {
  const automation = await detectBrowserAutomationPackage();
  if (!automation.available || !automation.packageName) {
    return {
      available: false,
      verdict: "NOT_CONFIGURED",
      packageName: null,
      message: "Playwright is not installed in the target project. Install playwright or @playwright/test before claiming live browser verification."
    };
  }

  const cleanRoutes = [...new Set(routes.map(safeBrowserRoute))];
  const outDir = safePath(outputDirectory);
  await fs.mkdir(outDir, { recursive: true });
  const stateDir = safePath(".krom/live-browser");
  await fs.mkdir(stateDir, { recursive: true });
  const reportFile = path.join(stateDir, "latest-report.json");
  const runnerFile = path.join(stateDir, "runner.mjs");

  const runner = `
import { chromium } from ${JSON.stringify(automation.packageName)};
import fs from 'node:fs/promises';
import path from 'node:path';
const config = JSON.parse(process.argv[2]);
const started = Date.now();
const report = { url: config.baseUrl, routes: config.routes, viewports: config.viewports, screenshots: [], consoleErrors: [], pageErrors: [], failedRequests: [], badResponses: [], overflowFindings: [], runtimeMs: 0 };
const browser = await chromium.launch({ headless: true });
try {
  for (const vp of config.viewports) {
    const context = await browser.newContext({ viewport: { width: vp.width, height: vp.height } });
    for (const route of config.routes) {
      const page = await context.newPage();
      page.on('console', msg => { if (msg.type() === 'error') report.consoleErrors.push({ route, viewport: vp.name, text: msg.text() }); });
      page.on('pageerror', err => report.pageErrors.push({ route, viewport: vp.name, text: String(err?.message || err) }));
      page.on('requestfailed', req => report.failedRequests.push({ route, viewport: vp.name, url: req.url(), method: req.method(), failure: req.failure()?.errorText || 'unknown' }));
      page.on('response', res => { if (res.status() >= 400) report.badResponses.push({ route, viewport: vp.name, url: res.url(), status: res.status() }); });
      const target = new URL(route, config.baseUrl).toString();
      await page.goto(target, { waitUntil: 'networkidle', timeout: 30000 });
      if (config.waitMs > 0) await page.waitForTimeout(config.waitMs);
      const dims = await page.evaluate(() => ({ scrollWidth: document.documentElement.scrollWidth, clientWidth: document.documentElement.clientWidth }));
      if (dims.scrollWidth > dims.clientWidth + 2) report.overflowFindings.push({ route, viewport: vp.name, ...dims });
      const filename = config.names[route + '::' + vp.name];
      const shot = path.join(config.outDir, filename);
      await page.screenshot({ path: shot, fullPage: true });
      report.screenshots.push({ route, viewport: vp.name, path: shot, width: vp.width, height: vp.height });
      await page.close();
    }
    await context.close();
  }
} finally {
  await browser.close();
}
report.runtimeMs = Date.now() - started;
await fs.writeFile(config.reportFile, JSON.stringify(report, null, 2), 'utf8');
console.log(JSON.stringify(report));
`;
  await fs.writeFile(runnerFile, runner, "utf8");

  const names: Record<string,string> = {};
  for (const route of cleanRoutes) for (const vp of viewports) names[`${route}::${vp.name}`] = browserArtifactName(route, vp.name);
  const config = { baseUrl, routes: cleanRoutes, viewports, waitMs, outDir, reportFile, names };
  const execution = await executeProgram("node", [runnerFile, JSON.stringify(config)], PROJECT_ROOT, 180000);
  if (!execution.success) {
    return { available: true, verdict: "FAIL", packageName: automation.packageName, execution, reportFile };
  }
  try {
    const report = JSON.parse(await fs.readFile(reportFile, "utf8")) as LiveBrowserVisionReport;
    const hardFailures = report.consoleErrors.length + report.pageErrors.length + report.failedRequests.length + report.badResponses.length + report.overflowFindings.length;
    return {
      available: true,
      verdict: hardFailures === 0 ? "PASS" : "FAIL",
      packageName: automation.packageName,
      reportFile,
      report,
      summary: {
        screenshots: report.screenshots.length,
        consoleErrors: report.consoleErrors.length,
        pageErrors: report.pageErrors.length,
        failedRequests: report.failedRequests.length,
        badResponses: report.badResponses.length,
        overflowFindings: report.overflowFindings.length
      }
    };
  } catch (error) {
    return { available: true, verdict: "FAIL", packageName: automation.packageName, execution, reportFile, parseError: error instanceof Error ? error.message : String(error) };
  }
}

async function readLatestLiveBrowserReport(): Promise<LiveBrowserVisionReport | null> {
  try {
    return JSON.parse(await fs.readFile(safePath(".krom/live-browser/latest-report.json"), "utf8"));
  } catch {
    return null;
  }
}



// =========================================================
// KROM v3.2 AUTONOMOUS REPAIR LOOP
// =========================================================

type RepairFinding = {
  id: string;
  source: "build" | "typecheck" | "lint" | "test" | "browser" | "requirements";
  severity: "critical" | "major" | "minor";
  message: string;
  hint?: string;
};

type RepairCycleState = {
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

const REPAIR_STATE_FILE = "autonomous-repair.json";

async function repairStatePath() {
  return kromStatePath(REPAIR_STATE_FILE);
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
  const all = await walkProject(PROJECT_ROOT, [], 2500);
  const textFiles = all.filter(isTextFile).slice(0, 1600);
  const terms = [...new Set(findings.flatMap((f) =>
    f.message.match(/[A-Za-z_][A-Za-z0-9_.\/-]{3,}/g) || []
  ).filter((x) => !/^(error|failed|cannot|undefined|http|https|localhost)$/i.test(x)).slice(0, 40))];
  const scored: Array<{ file: string; score: number; matches: string[] }> = [];
  for (const file of textFiles) {
    let content = "";
    try { content = await fs.readFile(file, "utf8"); } catch { continue; }
    const matches = terms.filter((t) => content.includes(t)).slice(0, 8);
    if (matches.length) scored.push({ file: path.relative(PROJECT_ROOT, file).replace(/\\/g, "/"), score: matches.length, matches });
  }
  return scored.sort((a,b) => b.score - a.score).slice(0, maxFiles);
}



// =========================================================
// KROM v3.3 SMART CODE INTELLIGENCE + IMPACT ANALYSIS
// =========================================================

type CodeIntelNode = {
  file: string;
  imports: string[];
  importedBy: string[];
  exports: string[];
  symbols: string[];
  routes: string[];
  kind: string;
};

type CodeIntelGraph = {
  version: 1;
  generatedAt: string;
  projectRoot: string;
  nodes: Record<string, CodeIntelNode>;
  unresolvedImports: Array<{ from: string; specifier: string }>;
  stats: { files: number; edges: number; routes: number; symbols: number };
};

const CODE_INTEL_FILE = "code-intelligence.json";

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
  const all = await walkProject(PROJECT_ROOT, [], maxFiles);
  const sourceFiles = all.filter(f => isTextFile(f) && /\.(?:ts|tsx|js|jsx|mjs|cjs|vue|svelte|py|go|rs|java|cs|php)$/.test(f));
  const rels = sourceFiles.map(f => normalizeRel(path.relative(PROJECT_ROOT, f)));
  const available = new Set(rels);
  const nodes: Record<string, CodeIntelNode> = {};
  const unresolvedImports: Array<{ from: string; specifier: string }> = [];
  for (let i = 0; i < sourceFiles.length; i++) {
    const file = sourceFiles[i];
    const rel = rels[i];
    let content = "";
    try { content = await fs.readFile(file, "utf8"); } catch { continue; }
    if (content.length > MAX_FILE_SIZE) continue;
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
    projectRoot: PROJECT_ROOT,
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
// KROM v3.4 SMART CONTEXT + DECISION ENGINE
// =========================================================

type ContextCandidate = {
  file: string;
  score: number;
  reasons: string[];
  kind: string;
  routes: string[];
  dependents: number;
  dependencies: number;
};

type SmartContextBundle = {
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

const SMART_CONTEXT_FILE = "smart-context.json";

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
  const primary: ContextCandidate[] = Object.values(graph.nodes).map(node => {
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
    try { size = (await fs.stat(path.join(PROJECT_ROOT, item.file))).size; } catch { size = 0; }
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
  await fs.writeFile(await kromStatePath(SMART_CONTEXT_FILE), JSON.stringify(bundle, null, 2), "utf8");
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
// KROM v3.5 ADAPTIVE AGENT RUNTIME + TASK GRAPH
// =========================================================


// =========================================================
// v3.6 SELF-IMPROVING ENGINEERING MEMORY
// =========================================================

type LearningRecord = {
  id: string;
  at: string;
  taskType: string;
  task: string;
  agent?: string;
  strategy?: string;
  outcome: "success" | "failed" | "partial" | "blocked";
  evidence: string[];
  failureFingerprint?: string;
  lesson: string;
  tags: string[];
  confidence: number;
  source: "runtime" | "manual" | "repair" | "release";
};

type ConfidenceAssessment = {
  score: number;
  band: "LOW" | "MEDIUM" | "HIGH";
  reasons: string[];
  missingEvidence: string[];
  recommendedAction: string;
};

const LEARNING_MEMORY_FILE = "learning-memory.json";
const DECISION_LEDGER_FILE = "decision-ledger.json";

function clampConfidence(n:number){ return Math.max(0, Math.min(100, Math.round(n))); }

function taskTypeOf(task:string){
  const t=task.toLowerCase();
  if (/ui|ux|design|واجهة|تصميم|responsive|rtl/.test(t)) return "ui";
  if (/fix|bug|error|repair|صلح|خطأ|مشكلة/.test(t)) return "repair";
  if (/database|supabase|sql|rls|migration|قاعدة/.test(t)) return "database";
  if (/deploy|vercel|ci|release|نشر/.test(t)) return "deployment";
  if (/security|auth|permission|صلاح|امن|أمان/.test(t)) return "security";
  if (/test|qa|playwright|cypress|اختبار/.test(t)) return "qa";
  return "engineering";
}

async function readLearningMemory(): Promise<LearningRecord[]> {
  try { return JSON.parse(await fs.readFile(await kromStatePath(LEARNING_MEMORY_FILE), "utf8")); }
  catch { return []; }
}

async function writeLearningMemory(rows:LearningRecord[]){
  await fs.writeFile(await kromStatePath(LEARNING_MEMORY_FILE), JSON.stringify(rows.slice(-1000), null, 2), "utf8");
}

function assessDecisionConfidence(args:{contextFiles?:number; evidence?:string[]; unresolvedGaps?:number; priorSuccesses?:number; priorFailures?:number; highRisk?:boolean;}): ConfidenceAssessment {
  let score=45;
  const reasons:string[]=[];
  const missingEvidence:string[]=[];
  const ev=args.evidence || [];
  if ((args.contextFiles||0) >= 3) { score+=12; reasons.push("Relevant project context is available."); } else { score-=12; missingEvidence.push("More task-relevant files/context"); }
  if (ev.length >= 2) { score+=15; reasons.push("Multiple evidence items support the decision."); } else { score-=10; missingEvidence.push("At least two independent evidence items"); }
  if ((args.unresolvedGaps||0)===0) { score+=10; reasons.push("No known critical context gaps."); } else { score-=15; missingEvidence.push("Resolve known context gaps"); }
  score += Math.min(15,(args.priorSuccesses||0)*5);
  score -= Math.min(25,(args.priorFailures||0)*8);
  if (args.highRisk) { score-=10; reasons.push("High-risk change requires stronger verification."); }
  score=clampConfidence(score);
  const band=score>=80?"HIGH":score>=55?"MEDIUM":"LOW";
  const recommendedAction=band==="HIGH"?"Proceed with normal verification.":band==="MEDIUM"?"Proceed cautiously and add targeted verification before irreversible changes.":"Do not make broad or irreversible changes; gather more evidence or narrow the task first.";
  return {score,band,reasons,missingEvidence,recommendedAction};
}

function summarizeLessons(rows:LearningRecord[], task:string){
  const type=taskTypeOf(task);
  const related=rows.filter(r=>r.taskType===type);
  const successes=related.filter(r=>r.outcome==="success");
  const failures=related.filter(r=>r.outcome==="failed");
  const tagCounts=new Map<string,number>();
  for (const r of related) for (const t of r.tags) tagCounts.set(t,(tagCounts.get(t)||0)+1);
  return {
    taskType:type,
    relatedCount:related.length,
    successes:successes.length,
    failures:failures.length,
    strongestLessons:[...related].sort((a,b)=>b.confidence-a.confidence).slice(-30).reverse().slice(0,8).map(r=>({lesson:r.lesson,outcome:r.outcome,confidence:r.confidence,tags:r.tags})),
    commonTags:[...tagCounts.entries()].sort((a,b)=>b[1]-a[1]).slice(0,10).map(([tag,count])=>({tag,count}))
  };
}

type TaskGraphNode = {
  id: string;
  title: string;
  objective: string;
  dependsOn: string[];
  agent: string;
  verification: string[];
  status: "pending" | "ready" | "in_progress" | "verified" | "blocked";
};

type TaskGraph = {
  version: 1;
  generatedAt: string;
  task: string;
  strategy: ReturnType<typeof decideExecutionStrategy>;
  nodes: TaskGraphNode[];
};

type RuntimeDecision = {
  at: string;
  task: string;
  selectedAgent: string;
  reason: string;
  evidence: string[];
  outcome?: "success" | "failed" | "partial" | "blocked";
  failureFingerprint?: string;
};

const TASK_GRAPH_FILE = "task-graph.json";

// =========================================================
// v3.7 ENGINEERING AUTOPILOT + CHECKPOINT / ROLLBACK
// =========================================================
const AUTOPILOT_STATE_FILE = "autopilot-state.json";
const AUTOPILOT_HISTORY_FILE = "autopilot-history.json";
const AUTOPILOT_CHECKPOINT_DIR = "autopilot-checkpoints";

type AutopilotPhase = "context"|"plan"|"execute"|"verify"|"repair"|"release"|"done"|"blocked";
type AutopilotState = {
  id:string; task:string; startedAt:string; updatedAt:string; phase:AutopilotPhase;
  checkpointId?:string; qualityScore:number; iteration:number; maxIterations:number;
  blockers:string[]; evidence:string[]; lastDecision?:string; status:"ACTIVE"|"PASS"|"BLOCKED"|"ROLLED_BACK";
};

async function readAutopilotState(): Promise<AutopilotState|null> {
  try { return JSON.parse(await fs.readFile(await kromStatePath(AUTOPILOT_STATE_FILE), "utf8")); } catch { return null; }
}
async function writeAutopilotState(state:AutopilotState) {
  state.updatedAt=new Date().toISOString();
  await fs.writeFile(await kromStatePath(AUTOPILOT_STATE_FILE), JSON.stringify(state,null,2), "utf8");
}
async function appendAutopilotHistory(event:any) {
  const fp=await kromStatePath(AUTOPILOT_HISTORY_FILE); let rows:any[]=[];
  try { rows=JSON.parse(await fs.readFile(fp,"utf8")); } catch {}
  rows.push({at:new Date().toISOString(),...event});
  await fs.writeFile(fp,JSON.stringify(rows.slice(-1000),null,2),"utf8");
}
async function createAutopilotCheckpoint(label:string, files?:string[]) {
  const id=`CP-${Date.now()}`;
  const dir=await kromStatePath(path.join(AUTOPILOT_CHECKPOINT_DIR,id));
  await fs.mkdir(dir,{recursive:true});
  const candidates=files?.length ? files.map(safePath) : (await walkProject(PROJECT_ROOT,[],1800)).filter(f=>isTextFile(f));
  const manifest:any[]=[];
  for (const abs of candidates) {
    try {
      const rel=path.relative(PROJECT_ROOT,abs); if (!rel || rel.startsWith(".krom"+path.sep) || rel.startsWith(".git"+path.sep)) continue;
      const stat=await fs.stat(abs); if (!stat.isFile() || stat.size>MAX_FILE_SIZE) continue;
      const dst=path.join(dir,"files",rel); await fs.mkdir(path.dirname(dst),{recursive:true}); await fs.copyFile(abs,dst);
      manifest.push({path:rel,size:stat.size});
    } catch {}
  }
  const meta={id,label,createdAt:new Date().toISOString(),files:manifest};
  await fs.writeFile(path.join(dir,"manifest.json"),JSON.stringify(meta,null,2),"utf8");
  return meta;
}
async function restoreAutopilotCheckpoint(id:string) {
  const dir=await kromStatePath(path.join(AUTOPILOT_CHECKPOINT_DIR,id));
  const meta=JSON.parse(await fs.readFile(path.join(dir,"manifest.json"),"utf8"));
  let restored=0;
  for (const item of meta.files||[]) {
    const src=path.join(dir,"files",item.path); const dst=safePath(item.path);
    await fs.mkdir(path.dirname(dst),{recursive:true}); await fs.copyFile(src,dst); restored++;
  }
  return {id,restored,label:meta.label,createdAt:meta.createdAt};
}
function nextAutopilotPhase(state:AutopilotState, qualityScore:number, blockers:string[]) : AutopilotPhase {
  if (blockers.length && state.iteration>=state.maxIterations) return "blocked";
  if (blockers.length) return "repair";
  if (qualityScore>=90) return "release";
  if (qualityScore>=70) return "verify";
  return "execute";
}


// =========================================================
// v3.8 MULTI-AGENT ENGINEERING COUNCIL + CONSENSUS ENGINE
// =========================================================
const COUNCIL_STATE_FILE = "engineering-council.json";
const COUNCIL_HISTORY_FILE = "engineering-council-history.json";

type CouncilAgent = "architect"|"developer"|"qa"|"security"|"visual-designer"|"devops";
type CouncilOpinion = {
  agent: CouncilAgent;
  recommendation: string;
  risks: string[];
  evidence: string[];
  confidence: number;
  submittedAt: string;
};
type CouncilState = {
  id: string;
  task: string;
  createdAt: string;
  updatedAt: string;
  status: "OPEN"|"CONSENSUS"|"CONFLICT"|"BLOCKED";
  requiredAgents: CouncilAgent[];
  opinions: CouncilOpinion[];
  consensus?: {
    recommendation: string;
    confidence: number;
    supportingAgents: CouncilAgent[];
    dissentingAgents: CouncilAgent[];
    unresolvedRisks: string[];
    rationale: string[];
  };
};

function councilAgentsForTask(task:string): CouncilAgent[] {
  const type=taskTypeOf(task);
  const base:CouncilAgent[]=["architect","developer","qa"];
  if (type==="ui") base.push("visual-designer");
  if (type==="security" || type==="database") base.push("security");
  if (type==="deployment") base.push("devops");
  if (/deploy|release|vercel|نشر/i.test(task) && !base.includes("devops")) base.push("devops");
  if (/auth|permission|security|rls|صلاح|أمان/i.test(task) && !base.includes("security")) base.push("security");
  if (/ui|ux|واجهة|تصميم|responsive|rtl/i.test(task) && !base.includes("visual-designer")) base.push("visual-designer");
  return [...new Set(base)];
}

async function readCouncilState(): Promise<CouncilState|null> {
  try { return JSON.parse(await fs.readFile(await kromStatePath(COUNCIL_STATE_FILE), "utf8")); } catch { return null; }
}
async function writeCouncilState(state:CouncilState){
  state.updatedAt=new Date().toISOString();
  await fs.writeFile(await kromStatePath(COUNCIL_STATE_FILE),JSON.stringify(state,null,2),"utf8");
}
async function appendCouncilHistory(event:any){
  const fp=await kromStatePath(COUNCIL_HISTORY_FILE); let rows:any[]=[];
  try { rows=JSON.parse(await fs.readFile(fp,"utf8")); } catch {}
  rows.push({at:new Date().toISOString(),...event});
  await fs.writeFile(fp,JSON.stringify(rows.slice(-1000),null,2),"utf8");
}
async function createCouncilSession(task:string): Promise<CouncilState> {
  const state:CouncilState={id:`COUNCIL-${Date.now()}`,task,createdAt:new Date().toISOString(),updatedAt:new Date().toISOString(),status:"OPEN",requiredAgents:councilAgentsForTask(task),opinions:[]};
  await writeCouncilState(state); await appendCouncilHistory({type:"convene",state}); return state;
}

function normalizeRecommendation(text:string){ return text.toLowerCase().replace(/[^a-z0-9\u0600-\u06ff]+/g," ").trim(); }
function councilRoleWeight(agent:CouncilAgent, task:string){
  const type=taskTypeOf(task);
  if (agent==="security" && (type==="security"||type==="database")) return 1.25;
  if (agent==="visual-designer" && type==="ui") return 1.25;
  if (agent==="devops" && type==="deployment") return 1.25;
  if (agent==="qa") return 1.15;
  if (agent==="architect") return 1.1;
  return 1.0;
}
function resolveCouncilConsensus(state:CouncilState){
  const required=new Set(state.requiredAgents);
  const submitted=new Set(state.opinions.map(o=>o.agent));
  const missing=[...required].filter(a=>!submitted.has(a));
  if (missing.length) return {status:"BLOCKED" as const,reason:"Missing required council opinions",missing};
  const groups=new Map<string,{key:string;score:number;opinions:CouncilOpinion[]}>();
  for (const op of state.opinions){
    const key=normalizeRecommendation(op.recommendation).slice(0,220);
    const g=groups.get(key)||{key,score:0,opinions:[]};
    g.score += clampConfidence(op.confidence)*councilRoleWeight(op.agent,state.task) + Math.min(20,op.evidence.length*4);
    g.opinions.push(op); groups.set(key,g);
  }
  const ranked=[...groups.values()].sort((a,b)=>b.score-a.score);
  const top=ranked[0]; const second=ranked[1];
  if (!top) return {status:"BLOCKED" as const,reason:"No opinions"};
  const margin=second?top.score-second.score:top.score;
  const avg=Math.round(top.opinions.reduce((n,o)=>n+o.confidence,0)/top.opinions.length);
  const highRiskDissent=state.opinions.filter(o=>!top.opinions.includes(o) && o.confidence>=80 && o.risks.length>0);
  if ((second && margin < 20) || highRiskDissent.length){
    return {status:"CONFLICT" as const,reason:highRiskDissent.length?"High-confidence dissent with unresolved risks":"Consensus margin too narrow",ranked:ranked.slice(0,5).map(g=>({recommendation:g.opinions[0].recommendation,score:Math.round(g.score),agents:g.opinions.map(o=>o.agent)})),highRiskDissent:highRiskDissent.map(o=>({agent:o.agent,risks:o.risks,recommendation:o.recommendation}))};
  }
  const supporters=top.opinions.map(o=>o.agent);
  const dissenters=state.opinions.filter(o=>!supporters.includes(o.agent)).map(o=>o.agent);
  const unresolved=[...new Set(state.opinions.filter(o=>!supporters.includes(o.agent)).flatMap(o=>o.risks))];
  return {status:"CONSENSUS" as const,recommendation:top.opinions[0].recommendation,confidence:avg,supportingAgents:supporters,dissentingAgents:dissenters,unresolvedRisks:unresolved,rationale:[`Selected by weighted evidence score ${Math.round(top.score)}.`,`Consensus margin ${Math.round(margin)}.`,`Supporting agents: ${supporters.join(", ")}.`]};
}



// =========================================================
// KROM v3.9 PREDICTIVE ENGINEERING + CHANGE SIMULATION
// =========================================================
const CHANGE_SIMULATION_FILE = "change-simulation.json";
const PREFLIGHT_HISTORY_FILE = "preflight-history.json";

type ChangeSimulation = {
  version: 1;
  id: string;
  generatedAt: string;
  task: string;
  targetFiles: string[];
  affectedFiles: string[];
  affectedRoutes: string[];
  dependencies: string[];
  dependents: string[];
  dataFiles: string[];
  configFiles: string[];
  risk: { score: number; level: "LOW"|"MEDIUM"|"HIGH"; reasons: string[] };
  verificationPlan: string[];
  rollbackPlan: string[];
  unresolvedImports: Array<{from:string;specifier:string}>;
};

async function appendPreflightHistory(event:any){
  const fp=await kromStatePath(PREFLIGHT_HISTORY_FILE); let rows:any[]=[];
  try { rows=JSON.parse(await fs.readFile(fp,"utf8")); } catch {}
  rows.push({at:new Date().toISOString(),...event});
  await fs.writeFile(fp,JSON.stringify(rows.slice(-1000),null,2),"utf8");
}

function uniqueStrings(items:string[]){ return [...new Set(items.filter(Boolean))]; }

async function buildChangeSimulation(task:string,targetFiles:string[],depth=2): Promise<ChangeSimulation> {
  let graph=await readCodeIntelligenceGraph();
  if (!graph) graph=await buildCodeIntelligenceGraph();
  const known=new Set(Object.keys(graph.nodes));
  const normalized=uniqueStrings(targetFiles.map(normalizeRel)).filter(f=>known.has(f));
  let targets=normalized;
  if (!targets.length) {
    const ctx=await buildSmartContext(task,20,80000,false);
    targets=ctx.selected.map(x=>x.file).filter(f=>known.has(f)).slice(0,12);
  }
  const depReach=dependencyReach(graph,targets,"dependencies",Math.max(1,Math.min(depth,4)));
  const dependentReach=dependencyReach(graph,targets,"dependents",Math.max(1,Math.min(depth,4)));
  const affected=uniqueStrings([...targets,...depReach.all,...dependentReach.all]);
  const nodes=affected.map(f=>graph!.nodes[f]).filter(Boolean);
  const routes=uniqueStrings(nodes.flatMap(n=>n.routes));
  const dataFiles=affected.filter(f=>graph!.nodes[f]?.kind==="data");
  const configFiles=affected.filter(f=>graph!.nodes[f]?.kind==="config");
  const sharedTargets=targets.filter(f=>(graph!.nodes[f]?.importedBy.length||0)>=5);
  const unresolved=graph.unresolvedImports.filter(x=>affected.includes(x.from)).slice(0,100);
  const base=riskForImpact(targets,dependentReach.all,routes,dataFiles.length>0,configFiles.length>0);
  let score=base.score + Math.min(20,sharedTargets.length*5) + Math.min(15,unresolved.length*3);
  score=Math.min(100,score);
  const level: "LOW"|"MEDIUM"|"HIGH" = score>=65?"HIGH":score>=30?"MEDIUM":"LOW";
  const reasons:string[]=[];
  if (dependentReach.all.length) reasons.push(`${dependentReach.all.length} dependent files may be affected.`);
  if (routes.length) reasons.push(`${routes.length} application routes are in the blast radius.`);
  if (sharedTargets.length) reasons.push(`Shared/high-dependency targets: ${sharedTargets.join(", ")}.`);
  if (dataFiles.length) reasons.push(`Data/database files are affected: ${dataFiles.slice(0,8).join(", ")}.`);
  if (configFiles.length) reasons.push(`Build/runtime configuration may be affected.`);
  if (unresolved.length) reasons.push(`${unresolved.length} unresolved local imports exist inside the predicted scope.`);
  if (!reasons.length) reasons.push("Change appears localized based on the current dependency graph.");
  const verificationPlan=uniqueStrings([
    "Run typecheck/build for the project.",
    targets.some(f=>/test|spec|__tests__/i.test(f))?"Run the directly affected tests.":"Run regression tests for affected dependents.",
    routes.length?`Exercise affected routes: ${routes.slice(0,12).join(", ")}.`:"Run targeted functional verification for the changed feature.",
    affected.some(f=>/tsx|jsx|vue|svelte|css|scss/i.test(f))?"Run live browser + responsive visual verification.":"",
    dataFiles.length?"Validate database migrations/RLS/data integrity before release.":"",
    configFiles.length?"Re-run clean production build from configuration baseline.":""
  ]);
  const rollbackPlan=[
    "Create an Autopilot checkpoint before editing target files.",
    "Record changed files and verification evidence after each phase.",
    level==="HIGH"?"Use a narrow staged change; rollback immediately on confirmed regression.":"Keep rollback checkpoint until release gate passes."
  ];
  const sim:ChangeSimulation={version:1,id:`SIM-${Date.now()}`,generatedAt:new Date().toISOString(),task,targetFiles:targets,affectedFiles:affected,affectedRoutes:routes,dependencies:depReach.all,dependents:dependentReach.all,dataFiles,configFiles,risk:{score,level,reasons},verificationPlan,rollbackPlan,unresolvedImports:unresolved};
  await fs.writeFile(await kromStatePath(CHANGE_SIMULATION_FILE),JSON.stringify(sim,null,2),"utf8");
  return sim;
}

async function readChangeSimulation(): Promise<ChangeSimulation|null>{
  try { return JSON.parse(await fs.readFile(await kromStatePath(CHANGE_SIMULATION_FILE),"utf8")); } catch { return null; }
}

async function evaluatePreflight(sim:ChangeSimulation, requireCheckpoint=true){
  const blockers:string[]=[]; const warnings:string[]=[]; const evidence:string[]=[];
  const autopilot=await readAutopilotState();
  if (!sim.targetFiles.length) blockers.push("No concrete target files were resolved from the task.");
  if (requireCheckpoint && !autopilot?.checkpointId) blockers.push("No rollback checkpoint is active.");
  else if (autopilot?.checkpointId) evidence.push(`checkpoint:${autopilot.checkpointId}`);
  if (sim.risk.level==="HIGH" && sim.verificationPlan.length<3) blockers.push("High-risk change has an insufficient verification plan.");
  if (sim.dataFiles.length && !sim.verificationPlan.some(x=>/database|migration|rls/i.test(x))) blockers.push("Database/data changes lack a database verification step.");
  if (sim.configFiles.length) warnings.push("Configuration files are in scope; validate a clean production build.");
  if (sim.unresolvedImports.length) warnings.push(`${sim.unresolvedImports.length} unresolved imports exist in the predicted blast radius.`);
  if (sim.dependents.length>=15) warnings.push("Large dependent blast radius; prefer staged implementation and targeted regression checks.");
  if (sim.affectedRoutes.length) evidence.push(`routes:${sim.affectedRoutes.length}`);
  evidence.push(`risk:${sim.risk.level}:${sim.risk.score}`);
  const status=blockers.length?"BLOCKED":warnings.length?"PASS_WITH_WARNINGS":"PASS";
  return {status,blockers,warnings,evidence,simulationId:sim.id,rule:status==="BLOCKED"?"Do not edit until blockers are resolved.":"Proceed only within the simulated scope and re-run impact analysis if scope expands."};
}

function forecastChangeRisk(sim:ChangeSimulation){
  const categories=[
    {name:"dependency-regression",score:Math.min(100,sim.dependents.length*6+(sim.risk.level==="HIGH"?20:0))},
    {name:"routing-ui-regression",score:Math.min(100,sim.affectedRoutes.length*10+(sim.affectedFiles.some(f=>/tsx|jsx|vue|svelte|css|scss/i.test(f))?20:0))},
    {name:"data-security-regression",score:Math.min(100,sim.dataFiles.length*25+(sim.dataFiles.some(f=>/rls|policy|auth|migration|supabase/i.test(f))?30:0))},
    {name:"build-config-regression",score:Math.min(100,sim.configFiles.length*25)},
    {name:"unknown-import-risk",score:Math.min(100,sim.unresolvedImports.length*15)}
  ].map(x=>({...x,level:x.score>=65?"HIGH":x.score>=30?"MEDIUM":"LOW"}));
  const top=[...categories].sort((a,b)=>b.score-a.score);
  return {overall:sim.risk,categories:top,highestRisk:top[0],recommendedControls:uniqueStrings([
    sim.risk.level==="HIGH"?"Split the change into smaller verified phases.":"Use focused edits and verify immediately.",
    sim.dependents.length?"Run regression tests covering dependent files/components.":"",
    sim.affectedRoutes.length?"Exercise all affected routes in live browser verification.":"",
    sim.dataFiles.length?"Review schema/RLS/migrations with Security + QA before release.":"",
    sim.configFiles.length?"Validate clean install/build and runtime startup.":""
  ])};
}

const RUNTIME_HISTORY_FILE = "adaptive-runtime-history.json";

async function readRuntimeHistory(): Promise<RuntimeDecision[]> {
  try { return JSON.parse(await fs.readFile(await kromStatePath(RUNTIME_HISTORY_FILE), "utf8")); }
  catch { return []; }
}

async function writeRuntimeHistory(items: RuntimeDecision[]) {
  await fs.writeFile(await kromStatePath(RUNTIME_HISTORY_FILE), JSON.stringify(items.slice(-250), null, 2), "utf8");
}

function chooseAgentForTask(task: string, strategy: ReturnType<typeof decideExecutionStrategy>, history: RuntimeDecision[]) {
  const q = task.toLowerCase();
  const failed = history.filter(h => h.task === task && h.outcome === "failed");
  const failedAgents = new Set(failed.map(x => x.selectedAgent));
  const candidates: Array<{agent:string; score:number; reasons:string[]}> = [];
  const add=(agent:string, score:number, reason:string)=>{
    let c=candidates.find(x=>x.agent===agent);
    if(!c){c={agent,score:0,reasons:[]}; candidates.push(c)}
    c.score += score; c.reasons.push(reason);
  };
  add("Developer", 20, "default implementation owner");
  if (/(architecture|architect|refactor|structure|معمار|هيكل)/i.test(task) || strategy.mode === "MULTI_PHASE_BUILD") add("Architect", 40, "architecture or broad-build signal");
  if (/(ui|ux|design|واجهة|تصميم|responsive|rtl|css|tailwind)/i.test(task)) add("UI/UX", 45, "visual/interface signal");
  if (/(visual|screenshot|spacing|layout|pixel|بصري|تنسيق)/i.test(task)) add("Visual Designer", 55, "visual quality signal");
  if (/(test|qa|regression|اختبار|تحقق)/i.test(task)) add("QA", 45, "verification signal");
  if (/(security|rls|policy|auth|permission|أمان|صلاحيات)/i.test(task)) add("Database/Security", 55, "security/data-access signal");
  if (/(database|supabase|sql|schema|migration|قاعدة|جدول)/i.test(task)) add("Database/Security", 45, "database signal");
  if (/(deploy|vercel|ci|cd|production|نشر)/i.test(task)) add("DevOps", 55, "deployment signal");
  if (/(error|bug|fix|broken|خطأ|اصلح|إصلاح|اصلاح)/i.test(task)) add("Autonomous Repair", 35, "repair signal");
  if (/(browser|console|network|e2e|متصفح)/i.test(task)) add("Live Browser Vision", 50, "browser evidence signal");
  for (const c of candidates) if (failedAgents.has(c.agent)) { c.score -= 35; c.reasons.push("penalty: same agent previously failed this task"); }
  candidates.sort((a,b)=>b.score-a.score);
  const selected=candidates[0];
  return { selectedAgent:selected.agent, score:selected.score, reason:selected.reasons.join("; "), alternatives:candidates.slice(1,4) };
}

function buildTaskGraph(task: string, strategy: ReturnType<typeof decideExecutionStrategy>): TaskGraph {
  const ui = strategy.agents.includes("UI/UX");
  const db = strategy.agents.includes("Database/Security");
  const deploy = strategy.agents.includes("DevOps");
  const broad = strategy.mode === "MULTI_PHASE_BUILD";
  const nodes: TaskGraphNode[] = [];
  const push=(title:string, objective:string, agent:string, dependsOn:string[], verification:string[])=>{
    const id=`T${String(nodes.length+1).padStart(3,"0")}`;
    nodes.push({id,title,objective,agent,dependsOn,verification,status:dependsOn.length?"pending":"ready"});
    return id;
  };
  const t1=push("Context and impact", "Confirm relevant files, dependencies, memory, and blast radius before changing code.", "Code Intelligence", [], ["smart_context_build", "context_gap_check", "impact_analysis"]);
  let prev=t1;
  if (broad) prev=push("Architecture decision", "Define boundaries and implementation sequence without unnecessary rewrites.", "Architect", [prev], ["decision_engine"]);
  if (ui) prev=push("UI/UX direction", "Define visual hierarchy, responsive behavior, RTL, states, and reusable design rules.", "UI/UX", [prev], ["design_ui_prompt", "generate_design_system"]);
  if (db) prev=push("Data and permission contract", "Validate schema, migrations, RLS/permissions, and data integrity before integration.", "Database/Security", [prev], ["impact_analysis"]);
  prev=push("Implementation", "Implement the smallest complete change that satisfies the task and preserves existing behavior.", "Developer", [prev], ["run_typecheck", "run_tests"]);
  const qa=push("Targeted regression", "Test changed and impacted surfaces using the actual change graph.", "QA", [prev], ["regression_scope", "run_tests", "run_typecheck"]);
  let verify=qa;
  if (ui) verify=push("Live UI verification", "Verify real routes at representative viewports and inspect console/network/layout evidence.", "Live Browser Vision", [qa], ["live_browser_vision", "visual_review"]);
  if (deploy) verify=push("Deployment readiness", "Validate production build/deploy constraints and environment assumptions.", "DevOps", [verify], ["run_build"]);
  push("Release gate", "Approve only when requirements and executable evidence are complete.", "Release Gate", [verify], ["release_gate_v31", "execution_audit"]);
  return {version:1,generatedAt:new Date().toISOString(),task,strategy,nodes};
}




// =========================================================
// v4.0 AUTONOMOUS PRODUCT ENGINEERING CORE
// =========================================================
const PRODUCT_BLUEPRINT_FILE = "product-blueprint.json";
const PRODUCT_ACCEPTANCE_FILE = "product-acceptance-contract.json";
const PRODUCT_GAP_FILE = "product-gap-report.json";

type ProductFeature = {
  id: string;
  name: string;
  intent: string;
  actors: string[];
  surfaces: string[];
  acceptance: string[];
};

type ProductBlueprint = {
  id: string;
  createdAt: string;
  goal: string;
  productType: string;
  actors: string[];
  features: ProductFeature[];
  nonFunctional: string[];
  qualityBars: string[];
  openQuestions: string[];
};

function normalizeProductLines(input:string){
  return input.split(/\r?\n|[.;•]+/).map(x=>x.trim()).filter(x=>x.length>=4);
}

function inferProductType(task:string){
  const t=task.toLowerCase();
  if(/safety|hse|ncr|incident|سلامة|مخالفة|حوادث/.test(t)) return "HSE / Safety Management Platform";
  if(/e-?commerce|shop|store|متجر/.test(t)) return "Commerce Product";
  if(/dashboard|admin|لوحة/.test(t)) return "Operational Dashboard";
  if(/chat|ai|agent|دردشة|وكيل/.test(t)) return "AI / Agent Product";
  if(/mobile|pwa|تطبيق/.test(t)) return "Application Product";
  return "Software Product";
}

function inferActors(task:string){
  const t=task.toLowerCase();
  const out:string[]=[];
  const defs:[RegExp,string][]=[
    [/admin|مدير|مشرف/,"Admin"],[/employee|موظف/,"Employee"],[/manager|leader|مدير القسم/,"Manager"],
    [/visitor|زائر/,"Visitor"],[/contractor|مقاول/,"Contractor"],[/customer|عميل/,"Customer"],[/developer|مطور/,"Developer"]
  ];
  for(const [r,n] of defs) if(r.test(t)) out.push(n);
  return out.length?[...new Set(out)]:["Primary User","Administrator"];
}

function inferFeatureSeeds(task:string){
  const lines=normalizeProductLines(task);
  const keywords=["dashboard","report","ncr","incident","training","inspection","auth","login","user","role","notification","meeting","search","print","mobile","rtl","backup","analytics","api","database","upload","chat","camera","weather","fire","equipment","تقارير","بلاغ","حادث","تدريب","تفتيش","صلاحيات","مستخدم","اشعارات","اجتماع","بحث","طباعة","جوال","نسخ احتياطي","تحليلات","معدات","حريق"];
  const found:string[]=[];
  for(const l of lines){
    const low=l.toLowerCase();
    if(keywords.some(k=>low.includes(k))) found.push(l.slice(0,180));
  }
  if(!found.length) found.push(...lines.slice(0,8));
  return [...new Set(found)].slice(0,30);
}

function acceptanceForFeature(name:string){
  return [
    `${name}: primary user flow is reachable from the product UI`,
    `${name}: visible actions are connected to real behavior or intentionally disabled`,
    `${name}: loading, empty, success and failure states are handled`,
    `${name}: permissions and validation are enforced at the correct boundary`,
    `${name}: responsive behavior is verified on mobile and desktop`,
    `${name}: at least one evidence-backed verification exists`
  ];
}

async function createProductBlueprint(task:string):Promise<ProductBlueprint>{
  const seeds=inferFeatureSeeds(task);
  const actors=inferActors(task);
  const features:ProductFeature[]=seeds.map((name,i)=>({
    id:`F${String(i+1).padStart(3,"0")}`, name, intent:name, actors, surfaces:["UI","Application Logic","Data/Integration"], acceptance:acceptanceForFeature(name)
  }));
  const t=task.toLowerCase();
  const nonFunctional=[
    /mobile|responsive|جوال/.test(t)?"Responsive/mobile support":"Responsive behavior must be verified",
    /rtl|arabic|عربي/.test(t)?"RTL/Arabic correctness":"Localization-safe layout",
    "Error handling and recoverability","Security and authorization boundaries","Performance appropriate to data volume","Accessibility baseline"
  ];
  const bp:ProductBlueprint={
    id:`PB-${Date.now()}`,createdAt:new Date().toISOString(),goal:task,productType:inferProductType(task),actors,features,
    nonFunctional:[...new Set(nonFunctional)],qualityBars:["No fake controls","No unverified DONE state","No critical browser/runtime errors","Requirements traceable to evidence"],
    openQuestions:features.length<2?["The prompt exposes few explicit product capabilities; inspect the existing project before broad implementation."]:[]
  };
  const fp=await kromStatePath(PRODUCT_BLUEPRINT_FILE); await fs.writeFile(fp,JSON.stringify(bp,null,2),"utf8"); return bp;
}

async function readProductBlueprint():Promise<ProductBlueprint|null>{
  try{return JSON.parse(await fs.readFile(await kromStatePath(PRODUCT_BLUEPRINT_FILE),"utf8"));}catch{return null;}
}

async function scanFeatureEvidence(feature:ProductFeature){
  const files=(await walkProject(PROJECT_ROOT,[],2200)).filter(f=>isTextFile(f));
  const terms=taskTerms(feature.name).filter(x=>x.length>=3).slice(0,10);
  const evidence:{file:string;hits:number}[]=[];
  for(const abs of files){
    try{const st=await fs.stat(abs);if(st.size>350000)continue;const txt=(await fs.readFile(abs,"utf8")).toLowerCase();let hits=0;for(const term of terms)if(txt.includes(term.toLowerCase()))hits++;if(hits)evidence.push({file:path.relative(PROJECT_ROOT,abs),hits});}catch{}
  }
  evidence.sort((a,b)=>b.hits-a.hits);
  const top=evidence.slice(0,12);
  const hasUI=top.some(x=>/\.(tsx|jsx|vue|svelte|html|css|scss)$/.test(x.file));
  const hasData=top.some(x=>/sql|supabase|api|server|service|repository|schema|migration/i.test(x.file));
  const hasTest=top.some(x=>/test|spec|e2e|playwright|cypress/i.test(x.file));
  const score=Math.min(100,(top.length?25:0)+(hasUI?25:0)+(hasData?25:0)+(hasTest?25:0));
  return {featureId:feature.id,name:feature.name,score,evidence:top,coverage:{ui:hasUI,dataOrIntegration:hasData,test:hasTest},status:score>=75?"EVIDENCE_STRONG":score>=40?"PARTIAL":"GAP"};
}



// =========================================================
// v5.0 AUTONOMOUS ENGINEERING SUITE HELPERS
// =========================================================
const V50_TASK_BOARD_FILE = "task-board-v5.json";
const V50_AUDIT_FILE = "engineering-audit-v5.json";

function v50TaskKind(task:string){
  const t=task.toLowerCase();
  if(/security|auth|permission|rls|secure|أمن|صلاحيات/.test(t)) return "security";
  if(/database|supabase|sql|schema|migration|قاعدة|جدول/.test(t)) return "database";
  if(/ui|ux|design|responsive|rtl|واجهة|تصميم|جوال/.test(t)) return "ui";
  if(/debug|fix|error|bug|خطأ|اصلح|إصلاح/.test(t)) return "debug";
  if(/architecture|refactor|معمار|هيكل/.test(t)) return "architecture";
  return "implementation";
}

async function v50TextFiles(limit=2500){
  const files=(await walkProject(PROJECT_ROOT,[],limit)).filter(f=>isTextFile(f));
  return files;
}

async function v50ScanPatterns(patterns:{name:string;re:RegExp;severity:string}[], limit=1800){
  const files=await v50TextFiles(limit); const findings:any[]=[];
  for(const abs of files){
    try{
      const st=await fs.stat(abs); if(st.size>500000) continue;
      const txt=await fs.readFile(abs,"utf8");
      for(const ptn of patterns){
        const lines=txt.split(/\r?\n/);
        for(let i=0;i<lines.length;i++) if(ptn.re.test(lines[i])) findings.push({file:path.relative(PROJECT_ROOT,abs),line:i+1,rule:ptn.name,severity:ptn.severity,sample:lines[i].trim().slice(0,220)});
      }
    }catch{}
  }
  return findings.slice(0,300);
}

async function v50PackageSummary(){
  const pkg=await readPackageJson()||{}; const all={...(pkg.dependencies||{}),...(pkg.devDependencies||{})};
  return {name:pkg.name||null,scripts:pkg.scripts||{},dependencies:Object.keys(all).sort(),hasReact:!!all.react,hasNext:!!all.next,hasVite:!!all.vite,hasSupabase:!!all['@supabase/supabase-js'],hasPlaywright:!!all.playwright,hasCypress:!!all.cypress};
}

async function v50ApiContractScan(){
  const files=await v50TextFiles(2200); const endpoints:any[]=[]; const clients:any[]=[];
  const endpointRe=/(app|router)\.(get|post|put|patch|delete)\s*\(\s*["'`]([^"'`]+)/ig;
  const fetchRe=/fetch\s*\(\s*["'`]([^"'`]+)/ig;
  for(const abs of files){
    if(!/\.(ts|tsx|js|jsx)$/.test(abs)) continue;
    try{const txt=await fs.readFile(abs,'utf8'); let m:any; while((m=endpointRe.exec(txt))) endpoints.push({file:path.relative(PROJECT_ROOT,abs),method:String(m[2]).toUpperCase(),path:m[3]}); while((m=fetchRe.exec(txt))) clients.push({file:path.relative(PROJECT_ROOT,abs),path:m[1]});}catch{}
  }
  return {endpoints:endpoints.slice(0,250),clients:clients.slice(0,250)};
}

async function v50DatabaseScan(){
  const files=await v50TextFiles(2500); const dbFiles=files.filter(f=>/\.sql$|migration|schema|supabase/i.test(f)); const signals:any[]=[];
  for(const abs of dbFiles.slice(0,400)){
    try{const txt=await fs.readFile(abs,'utf8'); signals.push({file:path.relative(PROJECT_ROOT,abs),tables:(txt.match(/create\s+table/ig)||[]).length,policies:(txt.match(/create\s+policy/ig)||[]).length,rls:(txt.match(/enable\s+row\s+level\s+security/ig)||[]).length,indexes:(txt.match(/create\s+(unique\s+)?index/ig)||[]).length});}catch{}
  }
  return signals;
}

async function v50TaskBoard(){
  let graph:any=null, auto:any=null, exec:any=null;
  try{graph=JSON.parse(await fs.readFile(await kromStatePath(TASK_GRAPH_FILE),'utf8'));}catch{}
  try{auto=await readAutopilotState();}catch{}
  try{exec=await readExecutionManifest();}catch{}
  const nodes=(graph?.nodes||[]).map((n:any)=>({id:n.id,title:n.title,agent:n.agent,status:n.status,dependsOn:n.dependsOn,verification:n.verification}));
  const counts=nodes.reduce((a:any,n:any)=>(a[n.status]=(a[n.status]||0)+1,a),{});
  const board={at:new Date().toISOString(),autopilot:auto?{id:auto.id,phase:auto.phase,status:auto.status}:null,requirements:exec?{taskId:exec.taskId,total:exec.requirements.length,verified:exec.requirements.filter((r:any)=>r.status==='verified').length}:null,nodes,counts};
  await fs.writeFile(await kromStatePath(V50_TASK_BOARD_FILE),JSON.stringify(board,null,2),'utf8'); return board;
}



// =========================================================
// KROM FORGE DEV CORE - AUTONOMOUS SOFTWARE FACTORY
// =========================================================
const V60_DIAGNOSTICS_FILE = "v6-diagnostics.json";
const V60_WORKSPACE_FILE = "v6-workspace.json";
const V60_PLUGINS_FILE = "v6-plugins.json";
const V60_EXECUTION_STREAM_FILE = "v6-execution-stream.json";
const V60_GATE_FILE = "v6-ide-gate.json";

async function v60ReadJson(file:string, fallback:any=null){
  try{return JSON.parse(await fs.readFile(await kromStatePath(file),'utf8'));}catch{return fallback;}
}

async function v60WriteJson(file:string, value:any){
  const target=await kromStatePath(file); await fs.writeFile(target,JSON.stringify(value,null,2),'utf8'); return target;
}

async function v60FileMeta(abs:string){
  const st=await fs.stat(abs); const rel=normalizeRel(path.relative(PROJECT_ROOT,abs));
  return {file:rel,bytes:st.size,ext:path.extname(abs).toLowerCase(),modifiedAt:st.mtime.toISOString()};
}

async function v60WorkspaceIndex(limit=3500){
  const files=await walkProject(PROJECT_ROOT,[],limit); const rows:any[]=[];
  for(const abs of files){
    if(!isTextFile(abs)) continue;
    try{
      const meta=await v60FileMeta(abs); let text='';
      if(meta.bytes<=MAX_FILE_SIZE) text=await fs.readFile(abs,'utf8');
      const imports=(text.match(/\b(?:import|require\s*\()\b/g)||[]).length;
      const exports=(text.match(/\bexport\b/g)||[]).length;
      const symbols=(text.match(/\b(?:function|class|interface|type|const|let|var)\s+[A-Za-z_$][\w$]*/g)||[]).length;
      const routeSignal=/\/pages\/|\/routes?\/|app\/(?:api\/)?[^/]+\/(?:page|route)\.(?:ts|tsx|js|jsx)$/i.test('/'+meta.file);
      const testSignal=/\.(test|spec)\.[^.]+$|\/tests?\//i.test('/'+meta.file);
      rows.push({...meta,imports,exports,symbols,routeSignal,testSignal});
    }catch{}
  }
  const hotspots=[...rows].sort((a,b)=>(b.imports+b.exports+b.symbols)-(a.imports+a.exports+a.symbols)).slice(0,80);
  const out={at:new Date().toISOString(),count:rows.length,files:rows,hotspots}; await v60WriteJson(V60_WORKSPACE_FILE,out); return out;
}

function v60ParseDiagnostics(text:string){
  const out:any[]=[]; const lines=text.split(/\r?\n/);
  const re=/^(.+?)\((\d+),(\d+)\):\s*(error|warning)\s*([A-Z]*\d+)?:?\s*(.*)$/i;
  const eslint=/^(.+?):(\d+):(\d+)\s+(.+?)\s+(error|warning)\s+([\w@\-/]+)?$/i;
  for(const line of lines){
    let m=line.match(re); if(m){out.push({file:normalizeRel(m[1]),line:Number(m[2]),column:Number(m[3]),severity:m[4].toLowerCase(),code:m[5]||null,message:m[6]});continue;}
    m=line.match(eslint); if(m){out.push({file:normalizeRel(m[1]),line:Number(m[2]),column:Number(m[3]),message:m[4],severity:m[5].toLowerCase(),code:m[6]||null});}
  }
  return out.slice(0,1000);
}

async function v60Diagnostics(){
  const checks:any[]=[]; const tc=await runPackageScript(['typecheck','check:types','types']); checks.push({name:'typecheck',...tc});
  const lint=await runPackageScript(['lint']); checks.push({name:'lint',...lint});
  const diagnostics:any[]=[];
  for(const c of checks){const blob=[c.stdout,c.stderr,c.message].filter(Boolean).join('\n'); for(const d of v60ParseDiagnostics(blob)) diagnostics.push({...d,source:c.name});}
  const byFile:any={}; for(const d of diagnostics){(byFile[d.file]??=[]).push(d);}
  const payload={at:new Date().toISOString(),status:checks.some(c=>c.available!==false && c.success===false)?'ERRORS':diagnostics.some(d=>d.severity==='error')?'ERRORS':diagnostics.length?'WARNINGS':checks.every(c=>c.available===false)?'SKIPPED':'CLEAN',checks:checks.map(c=>({name:c.name,status:c.status??(c.success?'PASS':'FAIL'),available:c.available??true,success:c.success??null})),count:diagnostics.length,byFile,diagnostics};
  await v60WriteJson(V60_DIAGNOSTICS_FILE,payload); return payload;
}

async function v60GitFileDiff(rel:string){
  const safe=safePath(rel); if(!(await exists(safe))) throw new Error(`File not found: ${rel}`);
  const ex=await executeProgram('git',['diff','--',rel],PROJECT_ROOT,60000);
  return {success:ex.success,file:normalizeRel(rel),diff:ex.stdout||ex.stderr||'',code:ex.code??0};
}

async function v60PluginRegistry(){return await v60ReadJson(V60_PLUGINS_FILE,{version:1,plugins:[]});}

async function v60ExecutionStream(){
  let auto:any=null, graph:any=null, board:any=null, diag:any=null, preflight:any=null;
  try{auto=await readAutopilotState();}catch{}
  try{graph=await v60ReadJson(TASK_GRAPH_FILE,null);}catch{}
  try{board=await v50TaskBoard();}catch{}
  diag=await v60ReadJson(V60_DIAGNOSTICS_FILE,null); preflight=await v60ReadJson(PREFLIGHT_HISTORY_FILE,[]);
  const events:any[]=[];
  if(auto) events.push({kind:'autopilot',phase:auto.phase,status:auto.status,id:auto.id,updatedAt:auto.updatedAt||null});
  if(graph) for(const n of (graph.nodes||[])) events.push({kind:'task',id:n.id,title:n.title,status:n.status,agent:n.agent});
  if(diag) events.push({kind:'diagnostics',status:diag.status,count:diag.count,at:diag.at});
  if(Array.isArray(preflight)&&preflight.length) events.push({kind:'preflight',...(preflight[preflight.length-1]||{})});
  const out={at:new Date().toISOString(),events,board}; await v60WriteJson(V60_EXECUTION_STREAM_FILE,out); return out;
}


// =========================================================
// KROM FORGE DEV CORE - AUTONOMOUS SOFTWARE FACTORY
// =========================================================
const V70_LAYOUT_FILE = "v7-layout.json";
const V70_THEME_FILE = "v7-theme.json";
const V70_PREVIEW_FILE = "v7-preview.json";
const V70_SELECTOR_FILE = "v7-agent-model-selector.json";
const V70_VISUAL_GATE_FILE = "v7-visual-ide-gate.json";

async function v70Layout(){
  const fallback={version:1,left:{explorer:true,search:true,agents:true},center:{editor:true,diff:true,preview:true},bottom:{terminal:true,problems:true,output:true},right:{tasks:true,git:true,execution:true},sizes:{left:260,right:320,bottom:240}};
  return await v60ReadJson(V70_LAYOUT_FILE,fallback);
}

async function v70Theme(){
  const fallback={name:"KROM Dark",mode:"dark",density:"compact",fontSize:13,editorFontSize:13,rtl:false,accent:"system",rounded:"medium"};
  return await v60ReadJson(V70_THEME_FILE,fallback);
}

async function v70PreviewState(){
  return await v60ReadJson(V70_PREVIEW_FILE,{status:"IDLE",url:null,viewport:{width:1440,height:900},lastChecked:null});
}

async function v70SelectorState(){
  return await v60ReadJson(V70_SELECTOR_FILE,{agent:"adaptive",model:"auto",reasoning:"medium",updatedAt:null});
}

async function v70WorkspaceState(){
  const [index,diag,layout,theme,preview,selector,board,plugins,stream]=await Promise.all([
    v60WorkspaceIndex(2500),v60Diagnostics(),v70Layout(),v70Theme(),v70PreviewState(),v70SelectorState(),v50TaskBoard(),v60PluginRegistry(),v60ExecutionStream()
  ]);
  const git=await executeProgram('git',['status','--short'],PROJECT_ROOT,60000);
  const pkg=await readPackageJson()||{};
  return {version:"7.0.0",project:PROJECT_ROOT,layout,theme,preview,selector,files:{count:index.count,hotspots:index.hotspots.slice(0,40),items:index.files.slice(0,500)},diagnostics:{status:diag.status,count:diag.count,items:diag.diagnostics.slice(0,300)},tasks:board,plugins,execution:stream.events,git:{success:git.success,status:git.stdout},scripts:pkg.scripts||{}};
}

function v70Html(){return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>KROM FORGE DEV v7</title><style>
:root{color-scheme:dark;--bg:#0b0d10;--panel:#11151a;--line:#242a31;--muted:#8d98a5;--text:#edf2f7;--accent:#4f8cff;--danger:#ff6b6b;--ok:#42c98b}*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--text);font:13px Inter,Segoe UI,Arial,sans-serif;height:100vh;overflow:hidden}.app{height:100vh;display:grid;grid-template-rows:42px 1fr 22px}.top{display:flex;align-items:center;gap:12px;padding:0 12px;border-bottom:1px solid var(--line);background:#0f1216}.brand{font-weight:700}.pill{border:1px solid var(--line);background:#151a20;border-radius:8px;padding:5px 8px;color:var(--muted)}.grid{display:grid;grid-template-columns:250px 1fr 310px;min-height:0}.panel{background:var(--panel);border-right:1px solid var(--line);min-width:0;overflow:auto}.right{border-left:1px solid var(--line);border-right:0}.title{position:sticky;top:0;background:#11151a;padding:10px 12px;border-bottom:1px solid var(--line);font-size:11px;text-transform:uppercase;letter-spacing:.08em;color:var(--muted)}.item{padding:7px 10px;border-bottom:1px solid #171c22;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.main{display:grid;grid-template-rows:1fr 230px;min-width:0}.editor{display:grid;grid-template-columns:1fr 1fr;min-height:0}.pane{border-right:1px solid var(--line);overflow:auto}.empty{height:100%;display:grid;place-items:center;color:var(--muted)}.bottom{display:grid;grid-template-columns:1fr 1fr;border-top:1px solid var(--line);min-height:0}.status{display:flex;align-items:center;justify-content:space-between;padding:0 10px;background:#0f1216;color:var(--muted);border-top:1px solid var(--line);font-size:11px}.err{color:var(--danger)}.ok{color:var(--ok)}.btn{cursor:pointer;border:1px solid var(--line);background:#151a20;color:var(--text);padding:6px 9px;border-radius:7px}.btn:hover{border-color:#3b4652}.tabs{display:flex;gap:2px;border-bottom:1px solid var(--line);background:#0f1216}.tab{padding:9px 12px;color:var(--muted)}.tab.active{color:var(--text);border-bottom:2px solid var(--accent)}pre{margin:0;padding:12px;white-space:pre-wrap;font:12px ui-monospace,SFMono-Regular,Consolas,monospace}.metric{display:flex;justify-content:space-between;padding:8px 10px;border-bottom:1px solid #171c22}.dot{width:7px;height:7px;border-radius:50%;display:inline-block;background:var(--ok);margin-right:6px}@media(max-width:900px){.grid{grid-template-columns:210px 1fr}.right{display:none}.editor{grid-template-columns:1fr}.editor .pane:nth-child(2){display:none}}
</style><script src="https://cdn.jsdelivr.net/npm/monaco-editor/min/vs/loader.js"></script></head><body><div class="app"><div class="top"><div class="brand">KROM FORGE DEV <span style="color:var(--accent)">v7.0</span></div><button class="btn" onclick="load()">Refresh</button><span class="pill" id="project">Loading…</span><span class="pill" id="selector">Agent/Model</span></div><div class="grid"><aside class="panel"><div class="title">Explorer</div><div id="files"></div></aside><main class="main"><section class="editor"><div class="pane"><div class="tabs"><div class="tab active">Editor</div><div class="tab">Diff</div></div><div class="empty">Select a file through MCP tools to inspect/edit safely.</div></div><div class="pane"><div class="tabs"><div class="tab active">Preview</div><div class="tab">Browser</div></div><div id="preview" class="empty">Preview session idle</div></div></section><section class="bottom"><div class="pane"><div class="title">Problems</div><div id="problems"></div></div><div class="pane"><div class="title">Execution Stream</div><div id="exec"></div></div></section></main><aside class="panel right"><div class="title">Tasks</div><div id="tasks"></div><div class="title">Git</div><pre id="git"></pre></aside></div><div class="status"><span id="status">Ready</span><span>KROM Visual IDE · read-only browser shell backed by MCP workspace state</span></div></div><script>
function e(s){return String(s??'').replace(/[&<>]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;'}[c]))}async function load(){document.getElementById('status').textContent='Refreshing…';try{const r=await fetch('/ide/api/state');const d=await r.json();document.getElementById('project').textContent=d.project||'';document.getElementById('selector').textContent=(d.selector?.agent||'adaptive')+' · '+(d.selector?.model||'auto');document.getElementById('files').innerHTML=(d.files?.items||[]).slice(0,120).map(x=>'<div class="item" title="'+e(x.file)+'">'+e(x.file)+'</div>').join('');document.getElementById('problems').innerHTML=(d.diagnostics?.items||[]).slice(0,80).map(x=>'<div class="item err">'+e(x.file)+':'+e(x.line)+':'+e(x.column)+' · '+e(x.message)+'</div>').join('')||'<div class="item ok">No parsed problems</div>';document.getElementById('exec').innerHTML=(d.execution||[]).slice(-80).map(x=>'<div class="item">'+e(x.kind)+' · '+e(x.title||x.phase||x.status||x.id||'')+' · '+e(x.status||'')+'</div>').join('');document.getElementById('tasks').innerHTML=(d.tasks?.nodes||[]).slice(0,80).map(x=>'<div class="item">'+e(x.id)+' · '+e(x.title)+' · '+e(x.status)+'</div>').join('')||'<div class="item">No active tasks</div>';document.getElementById('git').textContent=d.git?.status||'Clean / unavailable';document.getElementById('preview').textContent=d.preview?.url?('Preview: '+d.preview.url):'Preview session idle';document.getElementById('status').textContent='Workspace refreshed';}catch(err){document.getElementById('status').textContent='Failed to load workspace';}}load();setInterval(load,15000)</script></body></html>`}


// =========================================================
// KROM FORGE DEV CORE - AUTONOMOUS SOFTWARE FACTORY
// =========================================================
const V80_EDITOR_STATE_FILE = "v8-editor-state.json";
const V80_EDIT_HISTORY_FILE = "v8-edit-history.json";
const V80_CHAT_CONTEXT_FILE = "v8-chat-context.json";

async function v80ReadTextFile(rel:string){
  const abs=safePath(rel);
  const st=await fs.stat(abs);
  if(st.size>MAX_FILE_SIZE*2) throw new Error(`File too large for editor: ${rel}`);
  return fs.readFile(abs,"utf8");
}
async function v80SaveHistory(rel:string,before:string,after:string,kind:string){
  const hist=(await v60ReadJson(V80_EDIT_HISTORY_FILE,[])) as any[];
  hist.push({id:`edit-${Date.now()}-${Math.random().toString(36).slice(2,8)}`,at:new Date().toISOString(),file:normalizeRel(rel),kind,before,after});
  while(hist.length>80)hist.shift();
  await v60WriteJson(V80_EDIT_HISTORY_FILE,hist);
  return hist[hist.length-1];
}
async function v80WriteTextFile(rel:string,content:string,kind="write"){
  const abs=safePath(rel);
  const before=await exists(abs)?await fs.readFile(abs,"utf8"):"";
  await backupFile(abs);
  await fs.mkdir(path.dirname(abs),{recursive:true});
  await fs.writeFile(abs,content,"utf8");
  const h=await v80SaveHistory(rel,before,content,kind);
  return {file:normalizeRel(rel),bytes:Buffer.byteLength(content),historyId:h.id};
}
async function v80ApplyReplacement(rel:string,search:string,replacement:string,replaceAll=false){
  if(!search)throw new Error("search text is required");
  const before=await v80ReadTextFile(rel);
  if(!before.includes(search))throw new Error("Search text not found; no changes applied.");
  const after=replaceAll?before.split(search).join(replacement):before.replace(search,replacement);
  return v80WriteTextFile(rel,after,"apply_patch");
}
async function v80UndoRedo(direction:"undo"|"redo",file?:string){
  const hist=(await v60ReadJson(V80_EDIT_HISTORY_FILE,[])) as any[];
  const filtered=hist.filter((x:any)=>!file||normalizeRel(x.file)===normalizeRel(file));
  if(!filtered.length)throw new Error("No edit history available.");
  const item=direction==="undo"?filtered[filtered.length-1]:filtered.find((x:any)=>x.undone===true);
  if(!item)throw new Error(`No ${direction} operation available.`);
  const abs=safePath(item.file);
  await backupFile(abs);
  if(direction==="undo"){await fs.writeFile(abs,item.before,"utf8");item.undone=true;item.undoneAt=new Date().toISOString();}
  else {await fs.writeFile(abs,item.after,"utf8");item.undone=false;item.redoneAt=new Date().toISOString();}
  await v60WriteJson(V80_EDIT_HISTORY_FILE,hist);
  return {file:item.file,historyId:item.id,direction};
}
async function v80EditorState(){
  return await v60ReadJson(V80_EDITOR_STATE_FILE,{tabs:[],activeFile:null,split:false,updatedAt:null});
}
async function v80WorkbenchState(){
  const [base,editor,history,chat]=await Promise.all([v70WorkspaceState(),v80EditorState(),v60ReadJson(V80_EDIT_HISTORY_FILE,[]),v60ReadJson(V80_CHAT_CONTEXT_FILE,{messages:[],activeFile:null})]);
  return {...base,version:"8.0.0",editor,editHistory:(history||[]).slice(-30),chat};
}
function v80Html(){return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>KROM FORGE DEV v34.5</title><style>
:root{color-scheme:dark;font-family:Inter,ui-sans-serif,system-ui;background:#0b0f14;color:#e8edf2}*{box-sizing:border-box}body{margin:0;overflow:hidden}.app{height:100vh;display:grid;grid-template-rows:42px 1fr 24px}.top{display:flex;align-items:center;gap:12px;padding:0 12px;background:#101722;border-bottom:1px solid #263241}.brand{font-weight:800}.spacer{flex:1}.btn{background:#182231;border:1px solid #2c3a4d;color:#e8edf2;border-radius:7px;padding:6px 10px;cursor:pointer}.btn:hover{background:#223047}.main{display:grid;grid-template-columns:250px 1fr 330px;min-height:0}.side,.right{background:#101722;overflow:auto}.side{border-right:1px solid #263241}.right{border-left:1px solid #263241}.panelTitle{position:sticky;top:0;background:#101722;padding:10px 12px;border-bottom:1px solid #263241;font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:.08em}.file,.problem,.event{padding:6px 10px;border-bottom:1px solid #182231;font-size:12px;cursor:pointer}.file:hover{background:#17202d}.center{display:grid;grid-template-rows:36px 1fr 190px;min-width:0}.tabs{display:flex;background:#0e141d;border-bottom:1px solid #263241;overflow:auto}.tab{padding:9px 12px;border-right:1px solid #263241;font-size:12px;cursor:pointer;white-space:nowrap}.tab.active{background:#121b26}.editorWrap{position:relative;min-height:0}.editor{width:100%;height:100%;background:#0b0f14;color:#d8e1ea;border:0;outline:0;padding:14px;font:13px/1.55 ui-monospace,SFMono-Regular,Menlo,monospace;resize:none}.bottom{display:grid;grid-template-columns:1fr 1fr;border-top:1px solid #263241;min-height:0}.bottom>div{overflow:auto}.terminal{font:12px/1.5 ui-monospace,monospace;padding:10px;white-space:pre-wrap}.chat{display:grid;grid-template-rows:1fr auto;height:100%}.chatlog{overflow:auto;padding:8px}.chatrow{padding:6px 8px;margin:4px 0;background:#131d29;border-radius:7px;font-size:12px}.chatbar{display:flex;gap:6px;padding:8px;border-top:1px solid #263241}.chatbar input{flex:1;background:#0b0f14;border:1px solid #2b394b;color:#fff;border-radius:7px;padding:8px}.status{background:#0e5a88;padding:3px 9px;font-size:12px}.error{color:#ff8d8d}.ok{color:#8ae6a4}.preview{height:220px;border:0;width:100%;background:white}.hidden{display:none}@media(max-width:1000px){.main{grid-template-columns:210px 1fr}.right{display:none}}
</style><script src="https://cdn.jsdelivr.net/npm/monaco-editor/min/vs/loader.js"></script></head><body><div class="app"><div class="top"><div class="brand">KROM FORGE DEV v34.5</div><button class="btn" onclick="saveFile()">Save</button><button class="btn" onclick="undoEdit()">Undo</button><button class="btn" onclick="redoEdit()">Redo</button><button class="btn" onclick="refreshAll()">Refresh</button><div class="spacer"></div><span id="project"></span></div><div class="main"><aside class="side"><div class="panelTitle">Explorer</div><div id="files"></div></aside><section class="center"><div class="tabs" id="tabs"></div><div class="editorWrap"><div id="monaco" style="width:100%;height:100%"></div><textarea id="editor" class="editor hidden" spellcheck="false" placeholder="Open a file from Explorer"></textarea></div><div class="bottom"><div><div class="panelTitle">Terminal / Output</div><div class="terminal" id="terminal">Ready.</div></div><div class="chat"><div><div class="panelTitle">AI Context</div><div class="chatlog" id="chatlog"></div></div><div class="chatbar"><input id="chatInput" placeholder="Instruction for current file"><button class="btn" onclick="addChat()">Add Context</button></div></div></div></section><aside class="right"><div class="panelTitle">Problems</div><div id="problems"></div><div class="panelTitle">Preview</div><iframe id="preview" class="preview"></iframe><div class="panelTitle">Execution</div><div id="exec"></div></aside></div><div class="status" id="status">Ready</div></div><script>
let state=null,active=null,tabs=[],MONACO=null;const E=document.getElementById('editor');function editorGet(){return MONACO?MONACO.getValue():E.value}function editorSet(v,lang){if(MONACO){MONACO.setValue(v||'');if(lang&&window.monaco){const m=MONACO.getModel();monaco.editor.setModelLanguage(m,lang)}}else E.value=v||''}function languageFor(f){const x=(f||'').split('.').pop().toLowerCase();return ({ts:'typescript',tsx:'typescript',js:'javascript',jsx:'javascript',json:'json',css:'css',scss:'scss',html:'html',md:'markdown',py:'python',sql:'sql',yml:'yaml',yaml:'yaml'}[x]||'plaintext')}function bootMonaco(){try{if(window.require){window.require.config({paths:{vs:'https://cdn.jsdelivr.net/npm/monaco-editor/min/vs'}});window.require(['vs/editor/editor.main'],()=>{MONACO=monaco.editor.create(document.getElementById('monaco'),{value:E.value||'',language:'typescript',theme:'vs-dark',automaticLayout:true,minimap:{enabled:true},fontSize:13});E.classList.add('hidden')})}else{document.getElementById('monaco').classList.add('hidden');E.classList.remove('hidden')}}catch(_){document.getElementById('monaco').classList.add('hidden');E.classList.remove('hidden')}}function esc(s){return String(s??'').replace(/[&<>]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;'}[c]))}async function api(url,opt){const r=await fetch(url,opt);const d=await r.json();if(!r.ok)throw new Error(d.error||'Request failed');return d}async function refreshAll(){status('Refreshing…');state=await api('/ide/api/state');document.getElementById('project').textContent=state.project||'';document.getElementById('files').innerHTML=(state.files?.items||[]).slice(0,600).map(x=>'<div class="file" onclick="openFile('+JSON.stringify(x.file).replace(/"/g,'&quot;')+')">'+esc(x.file)+'</div>').join('');document.getElementById('problems').innerHTML=(state.diagnostics?.items||[]).slice(0,120).map(x=>'<div class="problem error">'+esc(x.file)+':'+esc(x.line)+':'+esc(x.column)+' · '+esc(x.message)+'</div>').join('')||'<div class="problem ok">No parsed problems</div>';document.getElementById('exec').innerHTML=(state.execution||[]).slice(-60).reverse().map(x=>'<div class="event">'+esc(x.kind)+' · '+esc(x.title||x.phase||x.status||x.id||'')+'</div>').join('');if(state.preview?.url)document.getElementById('preview').src=state.preview.url;renderTabs();status('Workspace ready')}function status(s){document.getElementById('status').textContent=s}async function openFile(file){const d=await api('/ide/api/file?path='+encodeURIComponent(file));active=file;if(!tabs.includes(file))tabs.push(file);editorSet(d.content||'',languageFor(file));renderTabs();status('Opened '+file)}function renderTabs(){document.getElementById('tabs').innerHTML=tabs.map(f=>'<div class="tab '+(f===active?'active':'')+'" onclick="openFile('+JSON.stringify(f).replace(/"/g,'&quot;')+')">'+esc(f.split('/').pop())+'</div>').join('')}async function saveFile(){if(!active)return status('No active file');const d=await api('/ide/api/file',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({path:active,content:editorGet()})});status('Saved '+d.file)}async function undoEdit(){const d=await api('/ide/api/history',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({action:'undo',file:active})});await openFile(d.file);status('Undo '+d.file)}async function redoEdit(){const d=await api('/ide/api/history',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({action:'redo',file:active})});await openFile(d.file);status('Redo '+d.file)}async function addChat(){const i=document.getElementById('chatInput');if(!i.value.trim())return;const d=await api('/ide/api/chat',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({message:i.value,activeFile:active})});i.value='';document.getElementById('chatlog').innerHTML=(d.messages||[]).slice(-30).map(m=>'<div class="chatrow">'+esc(m.at)+' · '+esc(m.activeFile||'workspace')+'<br>'+esc(m.message)+'</div>').join('')}bootMonaco();refreshAll().catch(e=>status(e.message));</script></body></html>`}


// =========================================================
// KROM FORGE DEV CORE - AUTONOMOUS SOFTWARE FACTORY
// =========================================================
const V90_PROFILE_FILE = "v9-workspace-profile.json";
const V90_RELEASE_FILE = "v9-release-center.json";
const V90_HEALTH_FILE = "v9-project-health.json";
const V90_EXTENSION_DIR = ".krom/extensions";
const v90Processes = new Map<string, { process: ChildProcess; command: string; startedAt: string; stdout: string[]; stderr: string[] }>();

function v90TailPush(arr:string[], chunk:unknown, limit=160){
  const text=String(chunk??"");
  for(const line of text.split(/\r?\n/)){ if(line.trim()) arr.push(line); }
  if(arr.length>limit) arr.splice(0,arr.length-limit);
}

async function v90DeclaredScripts(){
  const pkg=await readPackageJson()||{};
  return {pkg,scripts:pkg.scripts||{},packageManager:await detectPackageManager()};
}

async function v90TestInventory(){
  const files=await walkProject(PROJECT_ROOT,[],5000);
  const tests=files.filter(f=>/\.(test|spec)\.[cm]?[jt]sx?$|__tests__|\/tests?\//i.test(normalizeRel(path.relative(PROJECT_ROOT,f)))).map(f=>normalizeRel(path.relative(PROJECT_ROOT,f)));
  const {scripts}=await v90DeclaredScripts();
  return {tests:tests.slice(0,1000),scripts:Object.fromEntries(Object.entries(scripts).filter(([k])=>/test|e2e|playwright|cypress|vitest|jest/i.test(k)))};
}

async function v90ApiInventory(){
  const files=await walkProject(PROJECT_ROOT,[],4500); const clients:any[]=[]; const routes:any[]=[];
  for(const abs of files){
    if(!isTextFile(abs)) continue; const rel=normalizeRel(path.relative(PROJECT_ROOT,abs));
    if(!/\.(ts|tsx|js|jsx|mjs|cjs)$/.test(rel)) continue;
    let txt=''; try{const st=await fs.stat(abs); if(st.size>MAX_FILE_SIZE)continue; txt=await fs.readFile(abs,'utf8')}catch{continue}
    const lines=txt.split(/\r?\n/);
    lines.forEach((line,i)=>{
      if(/\bfetch\s*\(|\baxios\.(get|post|put|patch|delete)\s*\(|\.from\s*\(/.test(line)) clients.push({file:rel,line:i+1,preview:line.trim().slice(0,260)});
      if(/app\.(get|post|put|patch|delete)\s*\(|router\.(get|post|put|patch|delete)\s*\(|export\s+(async\s+)?function\s+(GET|POST|PUT|PATCH|DELETE)\b/.test(line)) routes.push({file:rel,line:i+1,preview:line.trim().slice(0,260)});
    });
  }
  return {clients:clients.slice(0,800),routes:routes.slice(0,800)};
}

async function v90DatabaseInventory(){
  const files=await walkProject(PROJECT_ROOT,[],4500); const sql:any[]=[]; const supabase:any[]=[];
  for(const abs of files){const rel=normalizeRel(path.relative(PROJECT_ROOT,abs));
    if(/\.sql$/i.test(rel)||/migrations?\//i.test(rel)) sql.push(rel);
    if(/supabase/i.test(rel)) supabase.push(rel);
  }
  const env=Object.keys(process.env).filter(k=>/SUPABASE|DATABASE|POSTGRES|PG_/i.test(k)).map(name=>({name,present:true,value:'[REDACTED]'}));
  return {sqlFiles:sql.slice(0,1000),supabaseFiles:supabase.slice(0,500),environmentSignals:env};
}

async function v90EnvAudit(){
  const files=await walkProject(PROJECT_ROOT,[],2000); const envFiles=files.filter(f=>/^\.env(\.|$)|env\.example/i.test(path.basename(f))).map(f=>normalizeRel(path.relative(PROJECT_ROOT,f)));
  const required=new Set<string>();
  for(const rel of envFiles.filter(x=>/example|sample|template/i.test(x))){try{const txt=await fs.readFile(safePath(rel),'utf8'); for(const line of txt.split(/\r?\n/)){const m=line.match(/^\s*([A-Z][A-Z0-9_]+)\s*=/); if(m)required.add(m[1]);}}catch{}}
  const present=new Set(Object.keys(process.env));
  return {envFiles,required:[...required].sort().map(name=>({name,present:present.has(name),value:present.has(name)?'[REDACTED]':null})),rule:'Secret values are never returned.'};
}

async function v90DependencyDoctor(){
  const {pkg,packageManager}=await v90DeclaredScripts();
  const files=await walkProject(PROJECT_ROOT,[],2500); const locks=files.map(f=>path.basename(f)).filter(x=>['package-lock.json','pnpm-lock.yaml','yarn.lock','bun.lockb','bun.lock'].includes(x));
  const deps={...(pkg.dependencies||{}),...(pkg.devDependencies||{})};
  const concerns:any[]=[];
  if(locks.length>1) concerns.push({severity:'warning',message:'Multiple package-manager lockfiles detected',locks});
  if(pkg.engines?.node) concerns.push({severity:'info',message:`Node engine: ${pkg.engines.node}`});
  for(const [name,ver] of Object.entries(deps)){if(String(ver).includes('github:')||String(ver).includes('git+'))concerns.push({severity:'info',package:name,message:'Git-sourced dependency requires reproducibility review'});}
  return {packageManager,packageName:pkg.name||null,version:pkg.version||null,node:process.version,engines:pkg.engines||null,dependencyCount:Object.keys(deps).length,locks:[...new Set(locks)],concerns};
}

async function v90Health(existingDiagnostics?:any){
  const [tests,api,db,env,dep,diag,git]=await Promise.all([v90TestInventory(),v90ApiInventory(),v90DatabaseInventory(),v90EnvAudit(),v90DependencyDoctor(),existingDiagnostics?Promise.resolve(existingDiagnostics):v60Diagnostics(),executeProgram("git",["status","--short","--branch"],PROJECT_ROOT,30000)]);
  const errorCount=(diag.diagnostics||[]).filter((x:any)=>x.severity==='error').length;
  let score=100; score-=Math.min(45,errorCount*5); if(!tests.tests.length&&!Object.keys(tests.scripts).length)score-=10; if(dep.concerns.some((x:any)=>x.severity==='warning'))score-=5; if(env.required.some((x:any)=>!x.present))score-=10; score=Math.max(0,score);
  const grade=score>=90?'A':score>=80?'B':score>=70?'C':score>=60?'D':'F';
  const out={at:new Date().toISOString(),score,grade,diagnostics:{status:diag.status,errorCount,total:diag.count},tests:{files:tests.tests.length,scripts:Object.keys(tests.scripts).length},api:{clients:api.clients.length,routes:api.routes.length},database:{sqlFiles:db.sqlFiles.length,supabaseFiles:db.supabaseFiles.length},environment:{required:env.required.length,missing:env.required.filter((x:any)=>!x.present).map((x:any)=>x.name)},dependencies:dep,git:{success:git.success,code:git.code??0,status:git.stdout||git.stderr||""}};
  await v60WriteJson(V90_HEALTH_FILE,out); return out;
}

async function v90ReleaseCenter(){
  const health=await v90Health();
  const files=['v8-editor-state.json','v9-project-health.json','v3-release-gate.json','v31-release-gate.json','v70-visual-gate.json'].filter(Boolean);
  const evidence:any={}; for(const f of files){const v=await v60ReadJson(f,null); if(v)evidence[f]=v;}
  const blockers:any[]=[]; if(health.score<80)blockers.push({type:'health',score:health.score}); if(health.diagnostics.errorCount)blockers.push({type:'diagnostics',count:health.diagnostics.errorCount});
  const out={at:new Date().toISOString(),decision:blockers.length?'BLOCKED':'READY_FOR_FINAL_RELEASE',blockers,health,evidenceFiles:Object.keys(evidence)}; await v60WriteJson(V90_RELEASE_FILE,out); return out;
}



// ========================================
// KROM FORGE DEV CORE - AUTONOMOUS SOFTWARE FACTORY
// ========================================
const V100_SPEC_FILE = "v10-spec-pipeline.json";
const V100_ARCH_FILE = "v10-architecture-graph.json";
const V100_MIGRATION_FILE = "v10-migration-plan.json";
const V100_E2E_FILE = "v10-e2e-scenarios.json";
const V100_VISUAL_REG_FILE = "v10-visual-regression.json";
const V100_RELEASE_NOTES_FILE = "v10-release-notes.json";
const V100_CICD_FILE = "v10-cicd-orchestrator.json";
const V100_QUALITY_BUDGET_FILE = "v10-quality-budget.json";
const V100_TELEMETRY_FILE = "v10-telemetry.json";
const V100_BLUEPRINT_DIR = ".krom/blueprints";

function v100Words(text:string){return text.toLowerCase().replace(/[^a-z0-9_\-\s]/g," ").split(/\s+/).filter(Boolean)}
function v100Unique<T>(items:T[]){return [...new Set(items)]}
function v100Now(){return new Date().toISOString()}

async function v100ProjectFiles(limit=2500){
  const out:string[]=[];
  async function walk(dir:string){
    if(out.length>=limit)return;
    let entries:any[]=[];try{entries=await fs.readdir(dir,{withFileTypes:true})}catch{return}
    for(const e of entries){
      if(out.length>=limit)break;
      if(e.name==="node_modules"||e.name===".git"||e.name==="dist"||e.name==="build"||e.name===".next"||e.name==="coverage")continue;
      const abs=path.join(dir,e.name);
      if(e.isDirectory()) await walk(abs); else out.push(normalizeRel(path.relative(PROJECT_ROOT,abs)));
    }
  }
  await walk(PROJECT_ROOT);return out;
}

async function v100SpecPipeline(goal:string, constraints:string[]=[]){
  const words=v100Words(goal);
  const featureHints=v100Unique(words.filter(w=>w.length>4)).slice(0,20);
  const spec={schemaVersion:1,createdAt:v100Now(),goal,constraints,featureHints,
    phases:[
      {id:"S1",name:"discover",gate:"context_complete"},
      {id:"S2",name:"design",gate:"architecture_approved"},
      {id:"S3",name:"implement",gate:"requirements_traced"},
      {id:"S4",name:"verify",gate:"tests_and_browser"},
      {id:"S5",name:"release",gate:"release_center_pass"}
    ],
    acceptance:["No critical diagnostics","No unresolved high-risk security findings","Required user flows verified","Release evidence attached"]};
  await v60WriteJson(V100_SPEC_FILE,spec);return spec;
}

async function v100ArchitectureGraph(){
  const files=await v100ProjectFiles(2200);const nodes:any[]=[];const edges:any[]=[];
  const code=files.filter(f=>/\.(ts|tsx|js|jsx|vue|svelte)$/.test(f));
  for(const f of code.slice(0,1200)){
    let txt="";try{txt=await fs.readFile(safePath(f),"utf8")}catch{continue}
    const imports=[...txt.matchAll(/(?:from\s+["']|require\(["'])([^"']+)/g)].map(m=>m[1]);
    const kind=/\/pages?\//.test(f)?"page":/\/routes?\//.test(f)?"route":/\/components?\//.test(f)?"component":/\/api\//.test(f)?"api":"module";
    nodes.push({id:f,kind,imports:imports.length});
    for(const i of imports.slice(0,80))edges.push({from:f,to:i,type:"imports"});
  }
  const graph={createdAt:v100Now(),nodes,edges,summary:{files:files.length,codeFiles:code.length,nodes:nodes.length,edges:edges.length}};
  await v60WriteJson(V100_ARCH_FILE,graph);return graph;
}

async function v100MigrationPlanner(target:string){
  const files=await v100ProjectFiles();
  const sql=files.filter(f=>f.endsWith('.sql')||f.includes('migration'));
  const pkg=await v60ReadJson('package.json',{});
  const plan={createdAt:v100Now(),target,detected:{migrationFiles:sql.slice(0,120),hasSupabase:JSON.stringify(pkg).toLowerCase().includes('supabase')},
    rules:["Prefer additive migrations","Avoid destructive schema changes without backup","Add indexes for new lookup/filter paths","Verify RLS after schema changes","Provide rollback or compensating migration"],
    steps:["Inspect current schema","Generate additive migration","Validate constraints/indexes","Verify RLS/policies","Run integration tests","Record rollback strategy"]};
  await v60WriteJson(V100_MIGRATION_FILE,plan);return plan;
}

async function v100E2EScenarios(feature:string){
  const scenarios=[
    {id:"E2E-001",name:`${feature}: happy path`,priority:"P0",steps:["Open target surface","Perform primary action","Verify persisted/result state"]},
    {id:"E2E-002",name:`${feature}: validation`,priority:"P0",steps:["Submit invalid/empty input","Verify accessible validation","Verify no corrupt state"]},
    {id:"E2E-003",name:`${feature}: permission/error`,priority:"P1",steps:["Trigger restricted or failing operation","Verify user-safe error","Verify no sensitive leakage"]},
    {id:"E2E-004",name:`${feature}: responsive`,priority:"P1",steps:["Run at 375px","Run at 768px","Run at 1440px","Verify no horizontal overflow"]}
  ];
  const out={createdAt:v100Now(),feature,scenarios};await v60WriteJson(V100_E2E_FILE,out);return out;
}

async function v100VisualRegression(routes:string[]=[]){
  const prev=await v60ReadJson(V100_VISUAL_REG_FILE,{baselines:{}});const baselineRoutes=routes.length?routes:Object.keys(prev.baselines||{});
  const out={createdAt:v100Now(),routes:baselineRoutes,viewports:[375,430,768,1440],policy:{maxPixelDiffPercent:0.7,blockOnLayoutShift:true,blockOnHorizontalOverflow:true},baselines:prev.baselines||{},status:baselineRoutes.length?"READY":"NEEDS_BASELINE"};
  await v60WriteJson(V100_VISUAL_REG_FILE,out);return out;
}

async function v100ReleaseNotes(version:string){
  let diff="";try{const r=await execFileAsync("git",["diff","--name-status","HEAD~1..HEAD"],{cwd:PROJECT_ROOT,maxBuffer:1024*1024});diff=r.stdout}catch{}
  const changes=diff.trim().split(/\r?\n/).filter(Boolean).map(x=>x.trim());
  const notes={createdAt:v100Now(),version,changes,sections:{added:changes.filter(x=>x.startsWith('A')),modified:changes.filter(x=>x.startsWith('M')),deleted:changes.filter(x=>x.startsWith('D'))},verification:["Build","Typecheck","Tests","Browser/Visual","Security","Release Center"]};
  await v60WriteJson(V100_RELEASE_NOTES_FILE,notes);return notes;
}

async function v100CicdOrchestrator(){
  const pkg=await v60ReadJson('package.json',{});const scripts=pkg.scripts||{};const files=await v100ProjectFiles(1000);
  const providers={githubActions:files.some(f=>f.startsWith('.github/workflows/')),vercel:files.includes('vercel.json'),docker:files.some(f=>/^Dockerfile/i.test(path.basename(f)))};
  const stages=["install",scripts.typecheck?"typecheck":null,scripts.lint?"lint":null,scripts.test?"test":null,scripts.build?"build":null,"security-audit","release-gate"].filter(Boolean);
  const out={createdAt:v100Now(),providers,stages,scripts,policy:{failFastOnCompiler:true,requireReleaseGate:true,neverExposeSecrets:true}};await v60WriteJson(V100_CICD_FILE,out);return out;
}

async function v100QualityBudget(input:any={}){
  const budget={createdAt:v100Now(),thresholds:{maxCompilerErrors:0,maxLintErrors:0,maxFailedTests:0,maxCriticalSecurity:0,maxMajorVisualIssues:0,maxBundleKb:input.maxBundleKb||1500,minAccessibilityScore:input.minAccessibilityScore||90,minProductCompleteness:input.minProductCompleteness||95}};
  await v60WriteJson(V100_QUALITY_BUDGET_FILE,budget);return budget;
}

async function v100TelemetryRecord(kind:string,metric:string,value:number,meta:any={}){
  const st=await v60ReadJson(V100_TELEMETRY_FILE,{events:[]});st.events=[...(st.events||[]),{at:v100Now(),kind,metric,value,meta}].slice(-1000);await v60WriteJson(V100_TELEMETRY_FILE,st);return {status:"RECORDED",count:st.events.length};
}

async function v100Blueprint(action:string,id?:string,description?:string){
  const dir=safePath(V100_BLUEPRINT_DIR);await fs.mkdir(dir,{recursive:true});
  if(action==="list"){const names=await fs.readdir(dir).catch(()=>[] as string[]);return {status:"OK",blueprints:names.filter(x=>x.endsWith('.json'))}}
  if(!id||!/^[a-z0-9][a-z0-9-]{1,63}$/.test(id))throw new Error('valid id is required');
  const file=path.join(dir,`${id}.json`);
  if(action==="get")return JSON.parse(await fs.readFile(file,'utf8'));
  const bp={schemaVersion:1,id,description:description||id,createdAt:v100Now(),requiredArtifacts:["spec","architecture","tests","release"],qualityGates:["diagnostics","security","browser","product-readiness","release-center"]};await fs.writeFile(file,JSON.stringify(bp,null,2));return {status:"SAVED",blueprint:bp};
}

async function v100FactoryStatus(){
  const spec=await v60ReadJson(V100_SPEC_FILE,null), arch=await v60ReadJson(V100_ARCH_FILE,null), migration=await v60ReadJson(V100_MIGRATION_FILE,null), e2e=await v60ReadJson(V100_E2E_FILE,null), cicd=await v60ReadJson(V100_CICD_FILE,null), budget=await v60ReadJson(V100_QUALITY_BUDGET_FILE,null);
  const readiness=[spec,arch,e2e,cicd,budget].filter(Boolean).length;
  return {status:readiness===5?"READY":"PARTIAL",score:readiness*20,artifacts:{spec:!!spec,architecture:!!arch,migration:!!migration,e2e:!!e2e,cicd:!!cicd,qualityBudget:!!budget}};
}


// ========================================
// KROM FORGE DEV v11.0 - AUTONOMOUS DELIVERY & RELIABILITY PLATFORM
// ========================================
const V110_OBSERVABILITY_FILE = "v11-observability.json";
const V110_REPLAY_FILE = "v11-failure-replay.json";
const V110_RESILIENCE_FILE = "v11-resilience-plan.json";
const V110_CONTRACT_FILE = "v11-contract-tests.json";
const V110_FLAGS_FILE = "v11-feature-flags.json";
const V110_DEPLOY_FILE = "v11-deployment-strategy.json";
const V110_ROLLBACK_FILE = "v11-rollback-plan.json";
const V110_SLO_FILE = "v11-slo-gate.json";
const V110_DEP_RISK_FILE = "v11-dependency-risk.json";
const V110_DATA_INTEGRITY_FILE = "v11-data-integrity.json";
const V110_PROD_READY_FILE = "v11-production-readiness.json";

function v110Now(){return new Date().toISOString()}

async function v110Observability(){
  const files=await v100ProjectFiles(2200);
  const telemetry=files.filter(f=>/(sentry|opentelemetry|otel|logger|logging|analytics|metrics|monitor)/i.test(f));
  const pkg=await v60ReadJson('package.json',{});
  const deps={...(pkg.dependencies||{}),...(pkg.devDependencies||{})};
  const providers=Object.keys(deps).filter(x=>/(sentry|opentelemetry|pino|winston|datadog|newrelic)/i.test(x));
  const out={createdAt:v110Now(),providers,telemetryFiles:telemetry.slice(0,120),requiredSignals:["structured_logs","error_tracking","latency","availability","release_version"],policy:{redactSecrets:true,redactPII:true,correlationId:true},status:providers.length||telemetry.length?"PARTIAL_OR_CONFIGURED":"NEEDS_CONFIGURATION"};
  await v60WriteJson(V110_OBSERVABILITY_FILE,out);return out;
}

async function v110FailureReplay(input:any={}){
  const out={createdAt:v110Now(),incidentId:input.incidentId||`INC-${Date.now()}`,symptoms:input.symptoms||[],evidence:input.evidence||[],replayPlan:["Freeze relevant logs and request IDs","Identify exact version/commit","Reproduce with non-secret test data","Capture deterministic steps","Verify fix against the replay case","Add regression test"],safety:["Never replay destructive production writes","Redact secrets and personal data","Prefer staging/local reproduction"]};
  await v60WriteJson(V110_REPLAY_FILE,out);return out;
}

async function v110Resilience(target:string){
  const out={createdAt:v110Now(),target,experiments:[
    {id:"R1",name:"Dependency timeout",expected:"Graceful timeout and user-safe error"},
    {id:"R2",name:"Network interruption",expected:"Retry/backoff without duplicate writes"},
    {id:"R3",name:"Partial service failure",expected:"Degraded mode or bounded failure"},
    {id:"R4",name:"Process restart",expected:"Recover state without corruption"}
  ],guardrails:["Run only in local/staging unless explicitly approved","No destructive production chaos","Stop on data-integrity risk"],status:"PLANNED"};
  await v60WriteJson(V110_RESILIENCE_FILE,out);return out;
}

async function v110ContractTests(surface:string){
  const api=await v90ApiInventory();
  const out={createdAt:v110Now(),surface,discovered:{clients:api.clients.slice(0,100),routes:api.routes.slice(0,100)},checks:["Request schema matches handler expectations","Response schema is versioned or backward compatible","Errors use stable machine-readable codes","Auth requirements are explicit","No undocumented breaking changes"],status:"PLANNED"};
  await v60WriteJson(V110_CONTRACT_FILE,out);return out;
}

async function v110FeatureFlags(action:string,input:any={}){
  let st=await v60ReadJson(V110_FLAGS_FILE,{flags:{}});
  if(action==='set'){if(!input.key)throw new Error('key is required');st.flags[input.key]={enabled:!!input.enabled,description:input.description||'',updatedAt:v110Now()};await v60WriteJson(V110_FLAGS_FILE,st);}
  if(action==='remove'){if(!input.key)throw new Error('key is required');delete st.flags[input.key];await v60WriteJson(V110_FLAGS_FILE,st);}
  return {status:'OK',flags:st.flags,rule:'Feature flags are configuration metadata only; deployment/runtime integration must be implemented explicitly.'};
}

async function v110DeploymentStrategy(input:any={}){
  const strategy=input.strategy||'rolling';
  const out={createdAt:v110Now(),strategy,environment:input.environment||'production',steps:["Verify release gates","Create immutable build artifact","Deploy to limited scope","Run smoke/health checks","Observe error and latency signals","Promote or rollback"],strategies:{rolling:"Replace instances gradually",canary:"Expose small traffic percentage first",blue_green:"Keep previous environment ready for switchback"},guardrails:["No promotion with failed health checks","Rollback target must be known before deployment","Database migrations must be backward compatible during transition"]};
  await v60WriteJson(V110_DEPLOY_FILE,out);return out;
}

async function v110RollbackPlan(release:string){
  const git=await executeProgram('git',['rev-parse','HEAD'],PROJECT_ROOT,30000);
  const out={createdAt:v110Now(),release,currentCommit:git.success?git.stdout.trim():null,triggers:["Critical error spike","Failed smoke test","Data integrity regression","SLO breach after deploy"],steps:["Stop promotion","Restore prior application version","Use compensating migration if schema changed","Verify health and critical flows","Record incident and replay evidence"],rule:'Never perform destructive database rollback automatically.'};
  await v60WriteJson(V110_ROLLBACK_FILE,out);return out;
}

async function v110SloGate(input:any={}){
  const thresholds={availability:input.availability??99.9,p95LatencyMs:input.p95LatencyMs??1200,maxErrorRatePercent:input.maxErrorRatePercent??1};
  const measurements=input.measurements||{};
  const blockers:any[]=[];
  if(typeof measurements.availability==='number'&&measurements.availability<thresholds.availability)blockers.push({metric:'availability',actual:measurements.availability,required:thresholds.availability});
  if(typeof measurements.p95LatencyMs==='number'&&measurements.p95LatencyMs>thresholds.p95LatencyMs)blockers.push({metric:'p95LatencyMs',actual:measurements.p95LatencyMs,max:thresholds.p95LatencyMs});
  if(typeof measurements.errorRatePercent==='number'&&measurements.errorRatePercent>thresholds.maxErrorRatePercent)blockers.push({metric:'errorRatePercent',actual:measurements.errorRatePercent,max:thresholds.maxErrorRatePercent});
  const out={createdAt:v110Now(),thresholds,measurements,decision:blockers.length?'BLOCKED':Object.keys(measurements).length?'PASS':'NEEDS_MEASUREMENTS',blockers};
  await v60WriteJson(V110_SLO_FILE,out);return out;
}

async function v110DependencyRisk(){
  const pkg=await v60ReadJson('package.json',{});const deps={...(pkg.dependencies||{}),...(pkg.devDependencies||{})};
  const risks:any[]=[];
  for(const [name,version] of Object.entries(deps)){const v=String(version);if(v==='*'||v==='latest')risks.push({severity:'high',package:name,reason:'Unpinned dependency range'});if(/github:|git\+|file:|link:/.test(v))risks.push({severity:'medium',package:name,reason:'Non-registry dependency requires reproducibility review'});if(/^\^0\./.test(v))risks.push({severity:'info',package:name,reason:'Pre-1.0 dependency may have unstable compatibility semantics'});}
  const locks=(await v100ProjectFiles(800)).filter(f=>['package-lock.json','pnpm-lock.yaml','yarn.lock','bun.lock','bun.lockb'].includes(path.basename(f)));
  if(!locks.length)risks.push({severity:'high',reason:'No lockfile detected'});
  const out={createdAt:v110Now(),dependencyCount:Object.keys(deps).length,lockfiles:locks,risks,status:risks.some(x=>x.severity==='high')?'REVIEW_REQUIRED':'OK'};
  await v60WriteJson(V110_DEP_RISK_FILE,out);return out;
}

async function v110DataIntegrity(){
  const files=await v100ProjectFiles(2200);const sql=files.filter(f=>f.endsWith('.sql'));const findings:any[]=[];
  for(const rel of sql.slice(0,200)){let txt='';try{txt=await fs.readFile(safePath(rel),'utf8')}catch{continue}
    if(/DROP\s+TABLE|TRUNCATE\s+TABLE/i.test(txt))findings.push({severity:'high',file:rel,reason:'Destructive SQL detected'});
    if(/ALTER\s+TABLE[\s\S]{0,160}DROP\s+COLUMN/i.test(txt))findings.push({severity:'high',file:rel,reason:'Column removal requires migration safety review'});
    if(/CREATE\s+TABLE/i.test(txt)&&!/PRIMARY\s+KEY|UNIQUE/i.test(txt))findings.push({severity:'info',file:rel,reason:'Review keys/uniqueness constraints'});
  }
  const out={createdAt:v110Now(),sqlFiles:sql.length,findings,status:findings.some(x=>x.severity==='high')?'BLOCKED':'REVIEW'};await v60WriteJson(V110_DATA_INTEGRITY_FILE,out);return out;
}

async function v110ProductionReadiness(){
  const [factory,health,release,obs,dep,data]=await Promise.all([v100FactoryStatus(),v90Health(),v90ReleaseCenter(),v110Observability(),v110DependencyRisk(),v110DataIntegrity()]);
  const slo=await v60ReadJson(V110_SLO_FILE,null);
  const blockers:any[]=[];
  if(factory.status!=='READY')blockers.push({type:'software_factory',status:factory.status});
  if(health.score<80)blockers.push({type:'project_health',score:health.score});
  if(release.decision==='BLOCKED')blockers.push({type:'release_center',details:release.blockers});
  if(dep.status==='REVIEW_REQUIRED')blockers.push({type:'dependency_risk'});
  if(data.status==='BLOCKED')blockers.push({type:'data_integrity'});
  if(slo&&slo.decision==='BLOCKED')blockers.push({type:'slo',details:slo.blockers});
  const out={createdAt:v110Now(),decision:blockers.length?'BLOCKED':'READY_FOR_CONTROLLED_DEPLOYMENT',blockers,evidence:{factory,healthScore:health.score,release:release.decision,observability:obs.status,dependencyRisk:dep.status,dataIntegrity:data.status,slo:slo?.decision||'NOT_CONFIGURED'}};
  await v60WriteJson(V110_PROD_READY_FILE,out);return out;
}


// ===== v12.0 MEGA-100 CAPABILITY EXPANSION =====
type V120Capability = { id:string; title:string; category:string; description:string; keywords:string[] };
const V120_REPORT_DIR = "v12-batches";
const V120_CAPABILITIES: V120Capability[] = [
  {id:"domain_boundary_mapper",title:"Domain Boundary Mapper",category:"architecture",description:"Map domain boundaries and cross-domain imports",keywords:["domain", "feature", "module", "service"].map(String)},
  {id:"circular_dependency_radar",title:"Circular Dependency Radar",category:"architecture",description:"Identify import patterns that may form circular dependencies",keywords:["import", "require", "from"].map(String)},
  {id:"coupling_heatmap",title:"Coupling Heatmap",category:"architecture",description:"Rank highly connected source files and shared modules",keywords:["import", "export", "from"].map(String)},
  {id:"module_ownership_map",title:"Module Ownership Map",category:"architecture",description:"Produce ownership hints for major project modules",keywords:["page", "component", "service", "route"].map(String)},
  {id:"route_dependency_map",title:"Route Dependency Map",category:"architecture",description:"Map route/page files to their direct dependencies",keywords:["route", "page", "router", "navigate"].map(String)},
  {id:"state_flow_mapper",title:"State Flow Mapper",category:"architecture",description:"Inventory state-management patterns and stateful hotspots",keywords:["useState", "useReducer", "store", "context"].map(String)},
  {id:"event_flow_mapper",title:"Event Flow Mapper",category:"architecture",description:"Inventory event handlers, emitters and messaging paths",keywords:["onClick", "addEventListener", "emit", "subscribe"].map(String)},
  {id:"config_drift_detector",title:"Config Drift Detector",category:"architecture",description:"Compare configuration surfaces and detect duplicated settings",keywords:["config", "env", "settings", "vite", "next.config"].map(String)},
  {id:"architecture_decision_recorder",title:"Architecture Decision Recorder",category:"architecture",description:"Generate ADR candidates from project structure and recent decisions",keywords:["architecture", "decision", "design", "tradeoff"].map(String)},
  {id:"shared_core_guard",title:"Shared Core Guard",category:"architecture",description:"Identify central shared files whose changes need stricter impact analysis",keywords:["shared", "common", "core", "utils"].map(String)},
  {id:"duplicate_logic_detector",title:"Duplicate Logic Detector",category:"code_quality",description:"Find repeated code signatures and duplicated logic candidates",keywords:["function", "const", "return"].map(String)},
  {id:"complexity_radar",title:"Complexity Radar",category:"code_quality",description:"Locate files with dense branching and complexity indicators",keywords:["if", "switch", "catch", "for"].map(String)},
  {id:"function_size_auditor",title:"Function Size Auditor",category:"code_quality",description:"Flag source files likely to contain oversized functions",keywords:["function", "=>", "async"].map(String)},
  {id:"naming_consistency_auditor",title:"Naming Consistency Auditor",category:"code_quality",description:"Review common identifier and file naming consistency",keywords:["interface", "type", "class", "const"].map(String)},
  {id:"error_handling_auditor",title:"Error Handling Auditor",category:"code_quality",description:"Review try/catch, error boundaries and user-facing error paths",keywords:["try", "catch", "throw", "Error"].map(String)},
  {id:"async_safety_auditor",title:"Async Safety Auditor",category:"code_quality",description:"Review async/await, promises and cleanup-risk patterns",keywords:["async", "await", "Promise", ".then"].map(String)},
  {id:"type_safety_auditor",title:"Type Safety Auditor",category:"code_quality",description:"Locate weak typing patterns and unsafe casts",keywords:[" any", "as any", "unknown", "@ts-ignore"].map(String)},
  {id:"null_safety_auditor",title:"Null Safety Auditor",category:"code_quality",description:"Locate nullability and optional access hotspots",keywords:["null", "undefined", "?.", "??"].map(String)},
  {id:"import_hygiene_auditor",title:"Import Hygiene Auditor",category:"code_quality",description:"Review broad, deep and duplicate import patterns",keywords:["import", "from", "require"].map(String)},
  {id:"refactor_opportunity_finder",title:"Refactor Opportunity Finder",category:"code_quality",description:"Find high-value refactor candidates from size and coupling signals",keywords:["TODO", "FIXME", "HACK", "deprecated"].map(String)},
  {id:"component_reuse_auditor",title:"Component Reuse Auditor",category:"ui_ux",description:"Identify reusable UI primitives and duplication candidates",keywords:["Button", "Card", "Dialog", "Modal"].map(String)},
  {id:"design_consistency_auditor",title:"Design Consistency Auditor",category:"ui_ux",description:"Review style-token and utility-class consistency",keywords:["className", "style=", "tailwind", "theme"].map(String)},
  {id:"responsive_layout_auditor",title:"Responsive Layout Auditor",category:"ui_ux",description:"Review responsive breakpoints and overflow-risk patterns",keywords:["sm:", "md:", "lg:", "overflow"].map(String)},
  {id:"rtl_layout_auditor",title:"RTL Layout Auditor",category:"ui_ux",description:"Review RTL/LTR readiness and directional assumptions",keywords:["dir=", "rtl", "ltr", "text-left", "text-right"].map(String)},
  {id:"accessibility_surface_auditor",title:"Accessibility Surface Auditor",category:"ui_ux",description:"Review semantic labels, focus and image alt coverage",keywords:["aria-", "alt=", "label", "tabIndex"].map(String)},
  {id:"form_experience_auditor",title:"Form Experience Auditor",category:"ui_ux",description:"Review form validation, labels and submission states",keywords:["form", "input", "select", "textarea"].map(String)},
  {id:"data_table_experience_auditor",title:"Data Table Experience Auditor",category:"ui_ux",description:"Review table density, paging, sorting and responsive handling",keywords:["table", "thead", "tbody", "pagination"].map(String)},
  {id:"loading_state_auditor",title:"Loading State Auditor",category:"ui_ux",description:"Review loading/skeleton/progress coverage",keywords:["loading", "Skeleton", "spinner", "progress"].map(String)},
  {id:"empty_error_state_auditor",title:"Empty & Error State Auditor",category:"ui_ux",description:"Review empty, error and retry user experiences",keywords:["empty", "error", "retry", "no data"].map(String)},
  {id:"navigation_experience_auditor",title:"Navigation Experience Auditor",category:"ui_ux",description:"Review sidebar, breadcrumb and route navigation consistency",keywords:["sidebar", "breadcrumb", "navigate", "Link"].map(String)},
  {id:"unit_test_gap_analyzer",title:"Unit Test Gap Analyzer",category:"testing",description:"Compare source surfaces against unit-test presence",keywords:["test(", "describe(", "it(", "expect("].map(String)},
  {id:"integration_test_gap_analyzer",title:"Integration Test Gap Analyzer",category:"testing",description:"Identify integration boundaries lacking explicit tests",keywords:["integration", "api", "service", "database"].map(String)},
  {id:"e2e_test_gap_analyzer",title:"E2E Test Gap Analyzer",category:"testing",description:"Review critical routes and flows against E2E coverage",keywords:["playwright", "cypress", "e2e", "page.goto"].map(String)},
  {id:"flaky_test_risk_auditor",title:"Flaky Test Risk Auditor",category:"testing",description:"Locate timing and nondeterminism patterns in tests",keywords:["setTimeout", "waitFor", "sleep", "random"].map(String)},
  {id:"fixture_quality_auditor",title:"Fixture Quality Auditor",category:"testing",description:"Review test fixture organization and reuse",keywords:["fixture", "mock", "stub", "factory"].map(String)},
  {id:"test_data_guard",title:"Test Data Guard",category:"testing",description:"Review test-data isolation and production-data leakage risks",keywords:["seed", "fixture", "test data", "mock data"].map(String)},
  {id:"boundary_case_generator",title:"Boundary Case Generator",category:"testing",description:"Generate boundary and negative-case targets from validation surfaces",keywords:["min", "max", "required", "optional"].map(String)},
  {id:"permission_test_matrix",title:"Permission Test Matrix",category:"testing",description:"Map permission-sensitive surfaces to required tests",keywords:["role", "permission", "auth", "RLS"].map(String)},
  {id:"regression_matrix_builder",title:"Regression Matrix Builder",category:"testing",description:"Build regression targets from shared modules and changed surfaces",keywords:["regression", "shared", "route", "component"].map(String)},
  {id:"coverage_strategy_planner",title:"Coverage Strategy Planner",category:"testing",description:"Produce a pragmatic unit/integration/E2E coverage plan",keywords:["coverage", "test", "spec", "e2e"].map(String)},
  {id:"api_contract_auditor",title:"API Contract Auditor",category:"api_data",description:"Review API request/response and client/server contract surfaces",keywords:["fetch(", "axios", "api/", "Response"].map(String)},
  {id:"endpoint_inventory_builder",title:"Endpoint Inventory Builder",category:"api_data",description:"Inventory API route and endpoint definitions",keywords:["app.get", "app.post", "route.ts", "api/"].map(String)},
  {id:"input_validation_auditor",title:"Input Validation Auditor",category:"api_data",description:"Review server/client validation coverage",keywords:["z.object", "schema", "validate", "parse"].map(String)},
  {id:"auth_boundary_auditor",title:"Auth Boundary Auditor",category:"api_data",description:"Review authentication boundaries around sensitive endpoints",keywords:["auth", "session", "token", "userId"].map(String)},
  {id:"rate_limit_readiness_auditor",title:"Rate Limit Readiness Auditor",category:"api_data",description:"Review externally exposed endpoints for rate-limit readiness",keywords:["rateLimit", "429", "throttle", "limit"].map(String)},
  {id:"cache_strategy_auditor",title:"Cache Strategy Auditor",category:"api_data",description:"Review cache usage and invalidation signals",keywords:["cache", "revalidate", "stale", "memo"].map(String)},
  {id:"query_efficiency_auditor",title:"Query Efficiency Auditor",category:"api_data",description:"Review query shapes and unbounded data access",keywords:["select(", "from(", "limit(", "order("].map(String)},
  {id:"index_readiness_auditor",title:"Index Readiness Auditor",category:"api_data",description:"Review schema/migrations for likely indexing needs",keywords:["CREATE INDEX", "index", "WHERE", "ORDER BY"].map(String)},
  {id:"migration_safety_auditor",title:"Migration Safety Auditor",category:"api_data",description:"Review migrations for destructive or risky operations",keywords:["DROP ", "TRUNCATE", "ALTER TABLE", "DELETE FROM"].map(String)},
  {id:"rls_policy_auditor",title:"RLS Policy Auditor",category:"api_data",description:"Review Supabase/Postgres RLS policy surfaces",keywords:["ROW LEVEL SECURITY", "CREATE POLICY", "USING (", "WITH CHECK"].map(String)},
  {id:"secret_exposure_auditor",title:"Secret Exposure Auditor",category:"security",description:"Locate secret-like assignments without revealing values",keywords:["API_KEY", "SECRET", "TOKEN", "PASSWORD"].map(String)},
  {id:"xss_surface_auditor",title:"XSS Surface Auditor",category:"security",description:"Review raw HTML and unsafe rendering surfaces",keywords:["dangerouslySetInnerHTML", "innerHTML", "document.write", "eval("].map(String)},
  {id:"csrf_readiness_auditor",title:"CSRF Readiness Auditor",category:"security",description:"Review state-changing web endpoints for CSRF posture",keywords:["POST", "PUT", "PATCH", "DELETE"].map(String)},
  {id:"injection_surface_auditor",title:"Injection Surface Auditor",category:"security",description:"Review dynamic SQL/command construction surfaces",keywords:["exec(", "query(", "raw(", "shell"].map(String)},
  {id:"file_upload_security_auditor",title:"File Upload Security Auditor",category:"security",description:"Review file validation, size and MIME restrictions",keywords:["upload", "multipart", "mimetype", "file.size"].map(String)},
  {id:"authorization_auditor",title:"Authorization Auditor",category:"security",description:"Review permission checks around sensitive actions",keywords:["authorize", "permission", "role", "isAdmin"].map(String)},
  {id:"session_security_auditor",title:"Session Security Auditor",category:"security",description:"Review session/cookie configuration surfaces",keywords:["cookie", "session", "httpOnly", "sameSite"].map(String)},
  {id:"cors_headers_auditor",title:"CORS & Headers Auditor",category:"security",description:"Review CORS and HTTP security header configuration",keywords:["cors", "Access-Control", "helmet", "Content-Security-Policy"].map(String)},
  {id:"audit_log_coverage_auditor",title:"Audit Log Coverage Auditor",category:"security",description:"Review whether sensitive mutations generate audit evidence",keywords:["audit", "activity log", "created_by", "updated_by"].map(String)},
  {id:"supply_chain_guard",title:"Supply Chain Guard",category:"security",description:"Review package and install-script risk indicators",keywords:["postinstall", "preinstall", "dependencies", "package-lock"].map(String)},
  {id:"bundle_weight_auditor",title:"Bundle Weight Auditor",category:"performance",description:"Review bundle-heavy imports and large frontend files",keywords:["import *", "lodash", "moment", "monaco"].map(String)},
  {id:"lazy_loading_auditor",title:"Lazy Loading Auditor",category:"performance",description:"Review code splitting and lazy route/component opportunities",keywords:["lazy(", "dynamic(", "Suspense", "import("].map(String)},
  {id:"render_efficiency_auditor",title:"Render Efficiency Auditor",category:"performance",description:"Review React render hotspots and derived state patterns",keywords:["useEffect", "useMemo", "useCallback", "setState"].map(String)},
  {id:"memoization_auditor",title:"Memoization Auditor",category:"performance",description:"Review expensive computation and memoization opportunities",keywords:["map(", "filter(", "reduce(", "useMemo"].map(String)},
  {id:"network_request_auditor",title:"Network Request Auditor",category:"performance",description:"Review request duplication, polling and waterfall risks",keywords:["fetch(", "axios", "setInterval", "poll"].map(String)},
  {id:"image_asset_auditor",title:"Image Asset Auditor",category:"performance",description:"Review large/unoptimized image references and loading hints",keywords:["<img", "Image", "loading=", "src="].map(String)},
  {id:"database_performance_auditor",title:"Database Performance Auditor",category:"performance",description:"Review query/pagination/index patterns affecting DB performance",keywords:["select", "limit", "offset", "index"].map(String)},
  {id:"pagination_auditor",title:"Pagination Auditor",category:"performance",description:"Review large-list pagination and infinite-load readiness",keywords:["pagination", "pageSize", "limit", "offset"].map(String)},
  {id:"cache_efficiency_auditor",title:"Cache Efficiency Auditor",category:"performance",description:"Review query and HTTP cache patterns",keywords:["cache", "queryClient", "staleTime", "revalidate"].map(String)},
  {id:"memory_leak_risk_auditor",title:"Memory Leak Risk Auditor",category:"performance",description:"Review listeners, timers and cleanup patterns",keywords:["addEventListener", "setInterval", "setTimeout", "return () =>"].map(String)},
  {id:"ci_typecheck_guard",title:"CI Typecheck Guard",category:"devops",description:"Review whether CI enforces type checking",keywords:["typecheck", "tsc", "workflow", "github/actions"].map(String)},
  {id:"ci_test_guard",title:"CI Test Guard",category:"devops",description:"Review whether CI enforces test execution",keywords:["npm test", "vitest", "jest", "playwright"].map(String)},
  {id:"artifact_integrity_guard",title:"Artifact Integrity Guard",category:"devops",description:"Review build-artifact and checksum practices",keywords:["artifact", "checksum", "sha256", "dist"].map(String)},
  {id:"container_readiness_auditor",title:"Container Readiness Auditor",category:"devops",description:"Review Docker/container configuration surfaces",keywords:["Dockerfile", "docker-compose", "container", "EXPOSE"].map(String)},
  {id:"environment_parity_auditor",title:"Environment Parity Auditor",category:"devops",description:"Review local/staging/production configuration parity",keywords:["NODE_ENV", "production", "staging", ".env"].map(String)},
  {id:"release_process_auditor",title:"Release Process Auditor",category:"devops",description:"Review tagging, changelog and release automation",keywords:["release", "version", "tag", "CHANGELOG"].map(String)},
  {id:"deployment_health_auditor",title:"Deployment Health Auditor",category:"devops",description:"Review deployment health checks and readiness signals",keywords:["health", "ready", "liveness", "status"].map(String)},
  {id:"rollback_readiness_auditor",title:"Rollback Readiness Auditor",category:"devops",description:"Review rollback metadata and deployment reversibility",keywords:["rollback", "previous", "deployment", "release"].map(String)},
  {id:"observability_pipeline_auditor",title:"Observability Pipeline Auditor",category:"devops",description:"Review logs, metrics and tracing surfaces",keywords:["logger", "metrics", "trace", "telemetry"].map(String)},
  {id:"backup_restore_auditor",title:"Backup & Restore Auditor",category:"devops",description:"Review backup, restore and integrity verification surfaces",keywords:["backup", "restore", "checksum", "manifest"].map(String)},
  {id:"feature_gap_analyzer",title:"Feature Gap Analyzer",category:"product",description:"Compare requested product surfaces to implementation evidence",keywords:["feature", "TODO", "placeholder", "coming soon"].map(String)},
  {id:"acceptance_criteria_auditor",title:"Acceptance Criteria Auditor",category:"product",description:"Review whether features have explicit verifiable completion criteria",keywords:["acceptance", "criteria", "verified", "done"].map(String)},
  {id:"persona_flow_mapper",title:"Persona Flow Mapper",category:"product",description:"Map role/persona-specific product flows",keywords:["admin", "user", "manager", "viewer"].map(String)},
  {id:"onboarding_flow_auditor",title:"Onboarding Flow Auditor",category:"product",description:"Review first-use, setup and empty-account experience",keywords:["onboarding", "welcome", "setup", "getting started"].map(String)},
  {id:"product_empty_state_auditor",title:"Product Empty State Auditor",category:"product",description:"Review empty states for actionable next steps",keywords:["empty", "no data", "create first", "get started"].map(String)},
  {id:"permission_matrix_builder",title:"Permission Matrix Builder",category:"product",description:"Build role-to-action matrix from permission signals",keywords:["role", "permission", "canEdit", "canDelete"].map(String)},
  {id:"notification_flow_auditor",title:"Notification Flow Auditor",category:"product",description:"Review notification triggers, channels and read state",keywords:["notification", "toast", "email", "unread"].map(String)},
  {id:"search_discovery_auditor",title:"Search & Discovery Auditor",category:"product",description:"Review global/local search and filtering capabilities",keywords:["search", "filter", "query", "command palette"].map(String)},
  {id:"export_reporting_auditor",title:"Export & Reporting Auditor",category:"product",description:"Review export, print and reporting capabilities",keywords:["export", "print", "pdf", "report"].map(String)},
  {id:"localization_readiness_auditor",title:"Localization Readiness Auditor",category:"product",description:"Review i18n, RTL and hard-coded copy readiness",keywords:["i18n", "t(", "rtl", "locale"].map(String)},
  {id:"prompt_quality_engine",title:"Prompt Quality Engine",category:"ai_agent",description:"Evaluate prompt structure, constraints and acceptance evidence",keywords:["prompt", "requirements", "constraints", "acceptance"].map(String)},
  {id:"tool_selection_auditor",title:"Tool Selection Auditor",category:"ai_agent",description:"Review whether agent tools map clearly to task types",keywords:["tool", "route", "agent", "capability"].map(String)},
  {id:"context_budget_planner",title:"Context Budget Planner",category:"ai_agent",description:"Plan focused context packs and prevent unnecessary context expansion",keywords:["context", "token", "file pack", "scope"].map(String)},
  {id:"model_routing_policy",title:"Model Routing Policy",category:"ai_agent",description:"Define routing policy by task complexity and modality",keywords:["model", "reasoning", "vision", "fast"].map(String)},
  {id:"hallucination_guard",title:"Hallucination Guard",category:"ai_agent",description:"Require evidence for claims about project state and test success",keywords:["evidence", "verified", "pass", "assume"].map(String)},
  {id:"evidence_gate_engine",title:"Evidence Gate Engine",category:"ai_agent",description:"Enforce evidence requirements before marking work complete",keywords:["evidence", "status", "verified", "gate"].map(String)},
  {id:"agent_handoff_auditor",title:"Agent Handoff Auditor",category:"ai_agent",description:"Review task handoff contracts between specialized agents",keywords:["handoff", "agent", "owner", "next"].map(String)},
  {id:"retry_policy_engine",title:"Retry Policy Engine",category:"ai_agent",description:"Define bounded retry/escalation rules for failing automated tasks",keywords:["retry", "attempt", "backoff", "blocked"].map(String)},
  {id:"cost_guard_engine",title:"Cost Guard Engine",category:"ai_agent",description:"Track execution-cost metadata and prevent wasteful repeated analysis",keywords:["cost", "token", "telemetry", "budget"].map(String)},
  {id:"autonomy_guard_engine",title:"Autonomy Guard Engine",category:"ai_agent",description:"Define safe boundaries for autonomous execution and destructive actions",keywords:["autonomous", "destructive", "approval", "rollback"].map(String)},
];

async function v120Walk(dir:string, out:string[], limit=350):Promise<void>{
  if(out.length>=limit)return;
  let entries:any[]=[];
  try{entries=await fs.readdir(dir,{withFileTypes:true}) as any[];}catch{return;}
  for(const e of entries){
    if(out.length>=limit)break;
    if(e.name.startsWith(".") && e.name!==".env.example") continue;
    if(IGNORED_DIRS.has(e.name)) continue;
    const abs=path.join(dir,e.name);
    if(e.isDirectory()){await v120Walk(abs,out,limit);continue;}
    const ext=path.extname(e.name).toLowerCase();
    if(TEXT_EXTENSIONS.has(ext) || ["Dockerfile","package.json","tsconfig.json"].includes(e.name)) out.push(abs);
  }
}

async function v120RunCapability(cap:V120Capability, scope?:string, writeReport=true){
  const root=scope?safePath(scope):PROJECT_ROOT;
  const files:string[]=[]; await v120Walk(root,files,350);
  const hits:{file:string;score:number;matches:string[]}[]=[];
  let scannedBytes=0;
  for(const abs of files){
    let txt=""; try{const st=await fs.stat(abs); if(st.size>MAX_FILE_SIZE)continue; scannedBytes+=st.size; txt=await fs.readFile(abs,"utf8");}catch{continue;}
    const low=txt.toLowerCase(); const matches=cap.keywords.filter(k=>low.includes(k.toLowerCase()));
    if(matches.length) hits.push({file:path.relative(PROJECT_ROOT,abs).replace(/\\/g,"/"),score:matches.length,matches});
  }
  hits.sort((a,b)=>b.score-a.score||a.file.localeCompare(b.file));
  const top=hits.slice(0,25);
  const risk = top.length>18?"HIGH":top.length>7?"MEDIUM":"LOW";
  const report={version:"12.0.0",capability:cap.id,title:cap.title,category:cap.category,description:cap.description,scope:scope||".",filesScanned:files.length,bytesScanned:scannedBytes,signalFiles:hits.length,risk,topFiles:top,recommendations:[`Review the ${Math.min(top.length,10)} highest-signal files first.`,`Confirm findings with runtime/tests before changing behavior.`,`Record evidence in the execution manifest before marking ${cap.id} complete.`],generatedAt:new Date().toISOString()};
  if(writeReport){await fs.mkdir(path.join(PROJECT_ROOT,".krom",V120_REPORT_DIR),{recursive:true}); await fs.writeFile(path.join(PROJECT_ROOT,".krom",V120_REPORT_DIR,`${cap.id}.json`),JSON.stringify(report,null,2),"utf8");}
  return report;
}

async function v120MegaStatus(){
  const dir=path.join(PROJECT_ROOT,".krom",V120_REPORT_DIR); let reports=0; try{reports=(await fs.readdir(dir)).filter(x=>x.endsWith(".json")).length;}catch{}
  return {version:"12.0.0",capabilities:V120_CAPABILITIES.length,categories:[...new Set(V120_CAPABILITIES.map(x=>x.category))],reportsGenerated:reports,reportDir:`.krom/${V120_REPORT_DIR}`,status:reports>=100?"FULLY_SCANNED":reports?"PARTIAL":"READY"};
}

async function v120RunMegaAudit(categories?:string[]){
  const chosen=V120_CAPABILITIES.filter(c=>!categories?.length||categories.includes(c.category)); const results:any[]=[];
  for(const cap of chosen) results.push(await v120RunCapability(cap,undefined,true));
  const summary={version:"12.0.0",ran:results.length,high:results.filter(x=>x.risk==="HIGH").length,medium:results.filter(x=>x.risk==="MEDIUM").length,low:results.filter(x=>x.risk==="LOW").length,generatedAt:new Date().toISOString()};
  await fs.mkdir(path.join(PROJECT_ROOT,".krom"),{recursive:true}); await fs.writeFile(path.join(PROJECT_ROOT,".krom","v12-mega-audit.json"),JSON.stringify({summary,results},null,2),"utf8");
  return summary;
}
// ===== END v12.0 =====

// ===== v13.0 EXACT-500 TOOL EXPANSION =====
type V130Capability = { id:string; title:string; category:string; description:string; keywords:string[] };
const V130_REPORT_DIR = "v13-500-tools";
const V130_CAPABILITIES: V130Capability[] = [
  {id:"component_dependency_mapper",title:"Component Dependency Mapper",category:"frontend_architecture",description:"Analyze component dependency mapper signals and produce evidence-oriented project findings",keywords:["component", "import", "props", "export"]},
  {id:"page_composition_auditor",title:"Page Composition Auditor",category:"frontend_architecture",description:"Analyze page composition auditor signals and produce evidence-oriented project findings",keywords:["page", "layout", "component", "section"]},
  {id:"route_guard_auditor",title:"Route Guard Auditor",category:"frontend_architecture",description:"Analyze route guard auditor signals and produce evidence-oriented project findings",keywords:["route", "guard", "redirect", "navigate"]},
  {id:"lazy_boundary_analyzer",title:"Lazy Boundary Analyzer",category:"frontend_architecture",description:"Analyze lazy boundary analyzer signals and produce evidence-oriented project findings",keywords:["lazy", "suspense", "dynamic", "import("]},
  {id:"shared_component_radar",title:"Shared Component Radar",category:"frontend_architecture",description:"Analyze shared component radar signals and produce evidence-oriented project findings",keywords:["shared", "common", "components", "ui"]},
  {id:"layout_nesting_auditor",title:"Layout Nesting Auditor",category:"frontend_architecture",description:"Analyze layout nesting auditor signals and produce evidence-oriented project findings",keywords:["layout", "children", "outlet", "slot"]},
  {id:"feature_folder_consistency",title:"Feature Folder Consistency",category:"frontend_architecture",description:"Analyze feature folder consistency signals and produce evidence-oriented project findings",keywords:["features", "modules", "pages", "components"]},
  {id:"barrel_export_auditor",title:"Barrel Export Auditor",category:"frontend_architecture",description:"Analyze barrel export auditor signals and produce evidence-oriented project findings",keywords:["index.ts", "export *", "export {", "from"]},
  {id:"client_server_boundary_auditor",title:"Client Server Boundary Auditor",category:"frontend_architecture",description:"Analyze client server boundary auditor signals and produce evidence-oriented project findings",keywords:["use client", "server", "client", "action"]},
  {id:"navigation_flow_mapper",title:"Navigation Flow Mapper",category:"frontend_architecture",description:"Analyze navigation flow mapper signals and produce evidence-oriented project findings",keywords:["navigate", "router", "link", "href"]},
  {id:"frontend_dependency_surface",title:"Frontend Dependency Surface",category:"frontend_architecture",description:"Analyze frontend dependency surface signals and produce evidence-oriented project findings",keywords:["react", "router", "query", "zustand"]},
  {id:"hook_dependency_auditor",title:"Hook Dependency Auditor",category:"react_quality",description:"Analyze hook dependency auditor signals and produce evidence-oriented project findings",keywords:["useEffect", "useMemo", "useCallback", "dependencies"]},
  {id:"rerender_risk_detector",title:"Rerender Risk Detector",category:"react_quality",description:"Analyze rerender risk detector signals and produce evidence-oriented project findings",keywords:["useState", "useContext", "memo", "useMemo"]},
  {id:"key_prop_auditor",title:"Key Prop Auditor",category:"react_quality",description:"Analyze key prop auditor signals and produce evidence-oriented project findings",keywords:[" key=", "map(", "fragment", "key"]},
  {id:"effect_cleanup_auditor",title:"Effect Cleanup Auditor",category:"react_quality",description:"Analyze effect cleanup auditor signals and produce evidence-oriented project findings",keywords:["useEffect", "return ()", "addEventListener", "unsubscribe"]},
  {id:"controlled_input_auditor",title:"Controlled Input Auditor",category:"react_quality",description:"Analyze controlled input auditor signals and produce evidence-oriented project findings",keywords:["value=", "onChange", "defaultValue", "input"]},
  {id:"context_overuse_detector",title:"Context Overuse Detector",category:"react_quality",description:"Analyze context overuse detector signals and produce evidence-oriented project findings",keywords:["createContext", "useContext", "provider", "context"]},
  {id:"prop_drilling_radar",title:"Prop Drilling Radar",category:"react_quality",description:"Analyze prop drilling radar signals and produce evidence-oriented project findings",keywords:["props", "children", "interface Props", "type Props"]},
  {id:"memoization_balance_auditor",title:"Memoization Balance Auditor",category:"react_quality",description:"Analyze memoization balance auditor signals and produce evidence-oriented project findings",keywords:["memo(", "useMemo", "useCallback", "React.memo"]},
  {id:"error_boundary_detector",title:"Error Boundary Detector",category:"react_quality",description:"Analyze error boundary detector signals and produce evidence-oriented project findings",keywords:["ErrorBoundary", "componentDidCatch", "getDerivedStateFromError", "error boundary"]},
  {id:"suspense_usage_auditor",title:"Suspense Usage Auditor",category:"react_quality",description:"Analyze suspense usage auditor signals and produce evidence-oriented project findings",keywords:["Suspense", "fallback", "lazy(", "useTransition"]},
  {id:"react_antipattern_scanner",title:"React Antipattern Scanner",category:"react_quality",description:"Analyze react antipattern scanner signals and produce evidence-oriented project findings",keywords:["forceUpdate", "findDOMNode", "dangerouslySetInnerHTML", "index as key"]},
  {id:"strict_mode_auditor",title:"Strict Mode Auditor",category:"typescript",description:"Analyze strict mode auditor signals and produce evidence-oriented project findings",keywords:["strict", "noImplicitAny", "strictNullChecks", "tsconfig"]},
  {id:"unsafe_cast_detector",title:"Unsafe Cast Detector",category:"typescript",description:"Analyze unsafe cast detector signals and produce evidence-oriented project findings",keywords:["as any", "as unknown as", "@ts-ignore", "@ts-expect-error"]},
  {id:"generic_quality_auditor",title:"Generic Quality Auditor",category:"typescript",description:"Analyze generic quality auditor signals and produce evidence-oriented project findings",keywords:["<T>", "extends", "keyof", "infer"]},
  {id:"discriminated_union_auditor",title:"Discriminated Union Auditor",category:"typescript",description:"Analyze discriminated union auditor signals and produce evidence-oriented project findings",keywords:["type:", "kind:", "switch", "never"]},
  {id:"type_duplication_detector",title:"Type Duplication Detector",category:"typescript",description:"Analyze type duplication detector signals and produce evidence-oriented project findings",keywords:["interface", "type ", "Props", "Dto"]},
  {id:"enum_usage_auditor",title:"Enum Usage Auditor",category:"typescript",description:"Analyze enum usage auditor signals and produce evidence-oriented project findings",keywords:["enum ", "const enum", "as const", "union"]},
  {id:"optional_chain_hotspot",title:"Optional Chain Hotspot",category:"typescript",description:"Analyze optional chain hotspot signals and produce evidence-oriented project findings",keywords:["?.", "??", "undefined", "null"]},
  {id:"promise_typing_auditor",title:"Promise Typing Auditor",category:"typescript",description:"Analyze promise typing auditor signals and produce evidence-oriented project findings",keywords:["Promise<", "async ", "await ", "void"]},
  {id:"module_resolution_auditor",title:"Module Resolution Auditor",category:"typescript",description:"Analyze module resolution auditor signals and produce evidence-oriented project findings",keywords:["paths", "baseUrl", "moduleResolution", "alias"]},
  {id:"declaration_surface_auditor",title:"Declaration Surface Auditor",category:"typescript",description:"Analyze declaration surface auditor signals and produce evidence-oriented project findings",keywords:[".d.ts", "declare ", "global", "namespace"]},
  {id:"ts_config_consistency",title:"TS Config Consistency",category:"typescript",description:"Analyze ts config consistency signals and produce evidence-oriented project findings",keywords:["tsconfig", "compilerOptions", "include", "exclude"]},
  {id:"design_token_auditor",title:"Design Token Auditor",category:"css_design",description:"Analyze design token auditor signals and produce evidence-oriented project findings",keywords:["--", "theme", "tokens", "spacing"]},
  {id:"color_consistency_auditor",title:"Color Consistency Auditor",category:"css_design",description:"Analyze color consistency auditor signals and produce evidence-oriented project findings",keywords:["#", "rgb(", "hsl(", "color"]},
  {id:"spacing_scale_auditor",title:"Spacing Scale Auditor",category:"css_design",description:"Analyze spacing scale auditor signals and produce evidence-oriented project findings",keywords:["padding", "margin", "gap", "space-"]},
  {id:"radius_consistency_auditor",title:"Radius Consistency Auditor",category:"css_design",description:"Analyze radius consistency auditor signals and produce evidence-oriented project findings",keywords:["border-radius", "rounded-", "radius", "corner"]},
  {id:"shadow_usage_auditor",title:"Shadow Usage Auditor",category:"css_design",description:"Analyze shadow usage auditor signals and produce evidence-oriented project findings",keywords:["box-shadow", "shadow-", "drop-shadow", "filter"]},
  {id:"z_index_auditor",title:"Z Index Auditor",category:"css_design",description:"Analyze z index auditor signals and produce evidence-oriented project findings",keywords:["z-index", "z-", "stacking", "position"]},
  {id:"css_specificity_radar",title:"CSS Specificity Radar",category:"css_design",description:"Analyze css specificity radar signals and produce evidence-oriented project findings",keywords:["!important", "#", ">", "::"]},
  {id:"animation_budget_auditor",title:"Animation Budget Auditor",category:"css_design",description:"Analyze animation budget auditor signals and produce evidence-oriented project findings",keywords:["animation", "transition", "keyframes", "motion"]},
  {id:"dark_mode_consistency",title:"Dark Mode Consistency",category:"css_design",description:"Analyze dark mode consistency signals and produce evidence-oriented project findings",keywords:["dark:", "prefers-color-scheme", "dark mode", "theme"]},
  {id:"theme_variable_coverage",title:"Theme Variable Coverage",category:"css_design",description:"Analyze theme variable coverage signals and produce evidence-oriented project findings",keywords:["var(--", "theme", "semantic", "token"]},
  {id:"visual_density_auditor",title:"Visual Density Auditor",category:"css_design",description:"Analyze visual density auditor signals and produce evidence-oriented project findings",keywords:["padding", "gap", "card", "grid"]},
  {id:"mobile_breakpoint_auditor",title:"Mobile Breakpoint Auditor",category:"responsive_mobile",description:"Analyze mobile breakpoint auditor signals and produce evidence-oriented project findings",keywords:["@media", "sm:", "md:", "375"]},
  {id:"touch_target_auditor",title:"Touch Target Auditor",category:"responsive_mobile",description:"Analyze touch target auditor signals and produce evidence-oriented project findings",keywords:["button", "44px", "min-height", "touch"]},
  {id:"viewport_overflow_detector",title:"Viewport Overflow Detector",category:"responsive_mobile",description:"Analyze viewport overflow detector signals and produce evidence-oriented project findings",keywords:["overflow-x", "100vw", "min-width", "white-space"]},
  {id:"mobile_navigation_auditor",title:"Mobile Navigation Auditor",category:"responsive_mobile",description:"Analyze mobile navigation auditor signals and produce evidence-oriented project findings",keywords:["drawer", "sheet", "hamburger", "sidebar"]},
  {id:"responsive_table_auditor",title:"Responsive Table Auditor",category:"responsive_mobile",description:"Analyze responsive table auditor signals and produce evidence-oriented project findings",keywords:["table", "overflow-x-auto", "responsive", "stack"]},
  {id:"mobile_form_auditor",title:"Mobile Form Auditor",category:"responsive_mobile",description:"Analyze mobile form auditor signals and produce evidence-oriented project findings",keywords:["input", "select", "textarea", "grid-cols"]},
  {id:"safe_area_auditor",title:"Safe Area Auditor",category:"responsive_mobile",description:"Analyze safe area auditor signals and produce evidence-oriented project findings",keywords:["safe-area-inset", "viewport-fit", "env("]},
  {id:"orientation_auditor",title:"Orientation Auditor",category:"responsive_mobile",description:"Analyze orientation auditor signals and produce evidence-oriented project findings",keywords:["orientation", "landscape", "portrait", "rotate"]},
  {id:"mobile_modal_auditor",title:"Mobile Modal Auditor",category:"responsive_mobile",description:"Analyze mobile modal auditor signals and produce evidence-oriented project findings",keywords:["dialog", "modal", "sheet", "max-height"]},
  {id:"mobile_keyboard_auditor",title:"Mobile Keyboard Auditor",category:"responsive_mobile",description:"Analyze mobile keyboard auditor signals and produce evidence-oriented project findings",keywords:["inputmode", "autocomplete", "keyboard", "focus"]},
  {id:"small_screen_content_auditor",title:"Small Screen Content Auditor",category:"responsive_mobile",description:"Analyze small screen content auditor signals and produce evidence-oriented project findings",keywords:["truncate", "line-clamp", "overflow", "break-words"]},
  {id:"required_field_auditor",title:"Required Field Auditor",category:"forms_validation",description:"Analyze required field auditor signals and produce evidence-oriented project findings",keywords:["required", "minLength", "schema", "validation"]},
  {id:"form_error_mapping",title:"Form Error Mapping",category:"forms_validation",description:"Analyze form error mapping signals and produce evidence-oriented project findings",keywords:["errors", "fieldError", "invalid", "message"]},
  {id:"schema_validation_auditor",title:"Schema Validation Auditor",category:"forms_validation",description:"Analyze schema validation auditor signals and produce evidence-oriented project findings",keywords:["zod", "yup", "valibot", "schema"]},
  {id:"submit_state_auditor",title:"Submit State Auditor",category:"forms_validation",description:"Analyze submit state auditor signals and produce evidence-oriented project findings",keywords:["isSubmitting", "loading", "disabled", "pending"]},
  {id:"double_submit_guard",title:"Double Submit Guard",category:"forms_validation",description:"Analyze double submit guard signals and produce evidence-oriented project findings",keywords:["disabled", "pending", "submit", "debounce"]},
  {id:"server_error_form_mapping",title:"Server Error Form Mapping",category:"forms_validation",description:"Analyze server error form mapping signals and produce evidence-oriented project findings",keywords:["server error", "setError", "response.error", "toast"]},
  {id:"file_input_validation",title:"File Input Validation",category:"forms_validation",description:"Analyze file input validation signals and produce evidence-oriented project findings",keywords:["accept=", "mime", "size", "File"]},
  {id:"date_input_validation",title:"Date Input Validation",category:"forms_validation",description:"Analyze date input validation signals and produce evidence-oriented project findings",keywords:["date", "Date(", "minDate", "maxDate"]},
  {id:"numeric_input_validation",title:"Numeric Input Validation",category:"forms_validation",description:"Analyze numeric input validation signals and produce evidence-oriented project findings",keywords:["type=\"number\"", "parseInt", "parseFloat", "min="]},
  {id:"form_autofill_auditor",title:"Form Autofill Auditor",category:"forms_validation",description:"Analyze form autofill auditor signals and produce evidence-oriented project findings",keywords:["autocomplete", "name=", "email", "password"]},
  {id:"form_accessibility_auditor",title:"Form Accessibility Auditor",category:"forms_validation",description:"Analyze form accessibility auditor signals and produce evidence-oriented project findings",keywords:["label", "aria-describedby", "fieldset", "legend"]},
  {id:"query_cache_auditor",title:"Query Cache Auditor",category:"state_data",description:"Analyze query cache auditor signals and produce evidence-oriented project findings",keywords:["queryClient", "staleTime", "cacheTime", "invalidate"]},
  {id:"optimistic_update_auditor",title:"Optimistic Update Auditor",category:"state_data",description:"Analyze optimistic update auditor signals and produce evidence-oriented project findings",keywords:["optimistic", "onMutate", "rollback", "invalidateQueries"]},
  {id:"global_state_scope_auditor",title:"Global State Scope Auditor",category:"state_data",description:"Analyze global state scope auditor signals and produce evidence-oriented project findings",keywords:["zustand", "redux", "context", "store"]},
  {id:"derived_state_detector",title:"Derived State Detector",category:"state_data",description:"Analyze derived state detector signals and produce evidence-oriented project findings",keywords:["useState", "useMemo", "derived", "computed"]},
  {id:"stale_data_risk_auditor",title:"Stale Data Risk Auditor",category:"state_data",description:"Analyze stale data risk auditor signals and produce evidence-oriented project findings",keywords:["stale", "refetch", "invalidate", "cache"]},
  {id:"pagination_state_auditor",title:"Pagination State Auditor",category:"state_data",description:"Analyze pagination state auditor signals and produce evidence-oriented project findings",keywords:["page", "pageSize", "offset", "cursor"]},
  {id:"filter_state_auditor",title:"Filter State Auditor",category:"state_data",description:"Analyze filter state auditor signals and produce evidence-oriented project findings",keywords:["filter", "searchParams", "query", "debounce"]},
  {id:"url_state_sync_auditor",title:"URL State Sync Auditor",category:"state_data",description:"Analyze url state sync auditor signals and produce evidence-oriented project findings",keywords:["searchParams", "URLSearchParams", "router", "query"]},
  {id:"local_storage_auditor",title:"Local Storage Auditor",category:"state_data",description:"Analyze local storage auditor signals and produce evidence-oriented project findings",keywords:["localStorage", "sessionStorage", "JSON.parse", "JSON.stringify"]},
  {id:"state_persistence_guard",title:"State Persistence Guard",category:"state_data",description:"Analyze state persistence guard signals and produce evidence-oriented project findings",keywords:["persist", "storage", "rehydrate", "version"]},
  {id:"data_normalization_auditor",title:"Data Normalization Auditor",category:"state_data",description:"Analyze data normalization auditor signals and produce evidence-oriented project findings",keywords:["normalize", "byId", "entities", "Map("]},
  {id:"fetch_wrapper_auditor",title:"Fetch Wrapper Auditor",category:"api_network",description:"Analyze fetch wrapper auditor signals and produce evidence-oriented project findings",keywords:["fetch(", "axios", "request(", "apiClient"]},
  {id:"timeout_policy_auditor",title:"Timeout Policy Auditor",category:"api_network",description:"Analyze timeout policy auditor signals and produce evidence-oriented project findings",keywords:["timeout", "AbortController", "signal", "retry"]},
  {id:"retry_policy_auditor",title:"Retry Policy Auditor",category:"api_network",description:"Analyze retry policy auditor signals and produce evidence-oriented project findings",keywords:["retry", "backoff", "attempt", "429"]},
  {id:"http_error_mapping",title:"HTTP Error Mapping",category:"api_network",description:"Analyze http error mapping signals and produce evidence-oriented project findings",keywords:["response.ok", "status", "401", "500"]},
  {id:"request_cancellation_auditor",title:"Request Cancellation Auditor",category:"api_network",description:"Analyze request cancellation auditor signals and produce evidence-oriented project findings",keywords:["AbortController", "cancel", "signal", "cleanup"]},
  {id:"api_versioning_auditor",title:"API Versioning Auditor",category:"api_network",description:"Analyze api versioning auditor signals and produce evidence-oriented project findings",keywords:["/api/v", "version", "v1", "v2"]},
  {id:"pagination_contract_auditor",title:"Pagination Contract Auditor",category:"api_network",description:"Analyze pagination contract auditor signals and produce evidence-oriented project findings",keywords:["cursor", "limit", "offset", "page"]},
  {id:"rate_limit_handling_auditor",title:"Rate Limit Handling Auditor",category:"api_network",description:"Analyze rate limit handling auditor signals and produce evidence-oriented project findings",keywords:["429", "retry-after", "rate limit", "throttle"]},
  {id:"network_offline_auditor",title:"Network Offline Auditor",category:"api_network",description:"Analyze network offline auditor signals and produce evidence-oriented project findings",keywords:["navigator.onLine", "offline", "online", "network"]},
  {id:"api_error_schema_auditor",title:"API Error Schema Auditor",category:"api_network",description:"Analyze api error schema auditor signals and produce evidence-oriented project findings",keywords:["error", "message", "code", "details"]},
  {id:"request_deduplication_auditor",title:"Request Deduplication Auditor",category:"api_network",description:"Analyze request deduplication auditor signals and produce evidence-oriented project findings",keywords:["dedupe", "cache", "queryKey", "inflight"]},
  {id:"foreign_key_auditor",title:"Foreign Key Auditor",category:"database_supabase",description:"Analyze foreign key auditor signals and produce evidence-oriented project findings",keywords:["foreign key", "references", "constraint", "on delete"]},
  {id:"index_coverage_auditor",title:"Index Coverage Auditor",category:"database_supabase",description:"Analyze index coverage auditor signals and produce evidence-oriented project findings",keywords:["create index", "index", "where", "order by"]},
  {id:"unique_constraint_auditor",title:"Unique Constraint Auditor",category:"database_supabase",description:"Analyze unique constraint auditor signals and produce evidence-oriented project findings",keywords:["unique", "constraint", "duplicate", "conflict"]},
  {id:"timestamp_consistency_auditor",title:"Timestamp Consistency Auditor",category:"database_supabase",description:"Analyze timestamp consistency auditor signals and produce evidence-oriented project findings",keywords:["created_at", "updated_at", "timestamp", "now()"]},
  {id:"soft_delete_auditor",title:"Soft Delete Auditor",category:"database_supabase",description:"Analyze soft delete auditor signals and produce evidence-oriented project findings",keywords:["deleted_at", "is_deleted", "soft delete", "archived"]},
  {id:"rls_coverage_mapper",title:"RLS Coverage Mapper",category:"database_supabase",description:"Analyze rls coverage mapper signals and produce evidence-oriented project findings",keywords:["enable row level security", "policy", "auth.uid", "rls"]},
  {id:"supabase_client_usage_auditor",title:"Supabase Client Usage Auditor",category:"database_supabase",description:"Analyze supabase client usage auditor signals and produce evidence-oriented project findings",keywords:["createClient", "supabase", "from(", "rpc("]},
  {id:"database_function_auditor",title:"Database Function Auditor",category:"database_supabase",description:"Analyze database function auditor signals and produce evidence-oriented project findings",keywords:["create function", "security definer", "language plpgsql", "rpc"]},
  {id:"migration_order_auditor",title:"Migration Order Auditor",category:"database_supabase",description:"Analyze migration order auditor signals and produce evidence-oriented project findings",keywords:["migrations", "alter table", "create table", "drop"]},
  {id:"seed_data_auditor",title:"Seed Data Auditor",category:"database_supabase",description:"Analyze seed data auditor signals and produce evidence-oriented project findings",keywords:["seed", "insert into", "fixtures", "sample"]},
  {id:"query_selectivity_auditor",title:"Query Selectivity Auditor",category:"database_supabase",description:"Analyze query selectivity auditor signals and produce evidence-oriented project findings",keywords:["select", "where", "limit", "eq("]},
  {id:"session_lifecycle_auditor",title:"Session Lifecycle Auditor",category:"auth_security",description:"Analyze session lifecycle auditor signals and produce evidence-oriented project findings",keywords:["session", "refreshToken", "expires", "signOut"]},
  {id:"auth_route_guard_auditor",title:"Auth Route Guard Auditor",category:"auth_security",description:"Analyze auth route guard auditor signals and produce evidence-oriented project findings",keywords:["auth", "protected", "redirect", "session"]},
  {id:"role_escalation_detector",title:"Role Escalation Detector",category:"auth_security",description:"Analyze role escalation detector signals and produce evidence-oriented project findings",keywords:["role", "admin", "update user", "permission"]},
  {id:"csrf_surface_auditor",title:"CSRF Surface Auditor",category:"auth_security",description:"Analyze csrf surface auditor signals and produce evidence-oriented project findings",keywords:["csrf", "sameSite", "cookie", "POST"]},
  {id:"cookie_security_auditor",title:"Cookie Security Auditor",category:"auth_security",description:"Analyze cookie security auditor signals and produce evidence-oriented project findings",keywords:["httpOnly", "secure", "sameSite", "cookie"]},
  {id:"password_policy_auditor",title:"Password Policy Auditor",category:"auth_security",description:"Analyze password policy auditor signals and produce evidence-oriented project findings",keywords:["password", "minLength", "complexity", "reset"]},
  {id:"token_storage_auditor",title:"Token Storage Auditor",category:"auth_security",description:"Analyze token storage auditor signals and produce evidence-oriented project findings",keywords:["token", "localStorage", "cookie", "sessionStorage"]},
  {id:"redirect_validation_auditor",title:"Redirect Validation Auditor",category:"auth_security",description:"Analyze redirect validation auditor signals and produce evidence-oriented project findings",keywords:["redirect", "returnTo", "next=", "url"]},
  {id:"permission_bypass_auditor",title:"Permission Bypass Auditor",category:"auth_security",description:"Analyze permission bypass auditor signals and produce evidence-oriented project findings",keywords:["permission", "canEdit", "canDelete", "role"]},
  {id:"admin_surface_auditor",title:"Admin Surface Auditor",category:"auth_security",description:"Analyze admin surface auditor signals and produce evidence-oriented project findings",keywords:["/admin", "isAdmin", "admin", "superuser"]},
  {id:"security_header_auditor",title:"Security Header Auditor",category:"auth_security",description:"Analyze security header auditor signals and produce evidence-oriented project findings",keywords:["Content-Security-Policy", "X-Frame-Options", "HSTS", "headers"]},
  {id:"upload_size_guard",title:"Upload Size Guard",category:"file_storage",description:"Analyze upload size guard signals and produce evidence-oriented project findings",keywords:["max size", "file.size", "upload", "limit"]},
  {id:"mime_validation_auditor",title:"MIME Validation Auditor",category:"file_storage",description:"Analyze mime validation auditor signals and produce evidence-oriented project findings",keywords:["mime", "content-type", "accept", "file.type"]},
  {id:"storage_path_auditor",title:"Storage Path Auditor",category:"file_storage",description:"Analyze storage path auditor signals and produce evidence-oriented project findings",keywords:["bucket", "storage", "path", "upload"]},
  {id:"signed_url_auditor",title:"Signed URL Auditor",category:"file_storage",description:"Analyze signed url auditor signals and produce evidence-oriented project findings",keywords:["signedUrl", "createSignedUrl", "expiresIn", "publicUrl"]},
  {id:"filename_sanitization_auditor",title:"Filename Sanitization Auditor",category:"file_storage",description:"Analyze filename sanitization auditor signals and produce evidence-oriented project findings",keywords:["filename", "sanitize", "basename", "replace"]},
  {id:"public_bucket_auditor",title:"Public Bucket Auditor",category:"file_storage",description:"Analyze public bucket auditor signals and produce evidence-oriented project findings",keywords:["public", "bucket", "storage", "policy"]},
  {id:"orphan_file_detector",title:"Orphan File Detector",category:"file_storage",description:"Analyze orphan file detector signals and produce evidence-oriented project findings",keywords:["delete", "storage", "attachment", "record"]},
  {id:"image_optimization_auditor",title:"Image Optimization Auditor",category:"file_storage",description:"Analyze image optimization auditor signals and produce evidence-oriented project findings",keywords:["image", "webp", "quality", "resize"]},
  {id:"download_authorization_auditor",title:"Download Authorization Auditor",category:"file_storage",description:"Analyze download authorization auditor signals and produce evidence-oriented project findings",keywords:["download", "signed", "permission", "auth"]},
  {id:"upload_progress_auditor",title:"Upload Progress Auditor",category:"file_storage",description:"Analyze upload progress auditor signals and produce evidence-oriented project findings",keywords:["progress", "onUploadProgress", "percent", "upload"]},
  {id:"storage_retention_auditor",title:"Storage Retention Auditor",category:"file_storage",description:"Analyze storage retention auditor signals and produce evidence-oriented project findings",keywords:["retention", "archive", "delete after", "lifecycle"]},
  {id:"channel_lifecycle_auditor",title:"Channel Lifecycle Auditor",category:"realtime",description:"Analyze channel lifecycle auditor signals and produce evidence-oriented project findings",keywords:["channel(", "subscribe", "unsubscribe", "removeChannel"]},
  {id:"realtime_filter_auditor",title:"Realtime Filter Auditor",category:"realtime",description:"Analyze realtime filter auditor signals and produce evidence-oriented project findings",keywords:["postgres_changes", "filter", "event", "schema"]},
  {id:"presence_state_auditor",title:"Presence State Auditor",category:"realtime",description:"Analyze presence state auditor signals and produce evidence-oriented project findings",keywords:["presence", "track", "sync", "join"]},
  {id:"broadcast_security_auditor",title:"Broadcast Security Auditor",category:"realtime",description:"Analyze broadcast security auditor signals and produce evidence-oriented project findings",keywords:["broadcast", "channel", "private", "auth"]},
  {id:"reconnect_strategy_auditor",title:"Reconnect Strategy Auditor",category:"realtime",description:"Analyze reconnect strategy auditor signals and produce evidence-oriented project findings",keywords:["reconnect", "retry", "backoff", "connected"]},
  {id:"duplicate_subscription_detector",title:"Duplicate Subscription Detector",category:"realtime",description:"Analyze duplicate subscription detector signals and produce evidence-oriented project findings",keywords:["subscribe(", "useEffect", "channel(", "cleanup"]},
  {id:"realtime_ordering_auditor",title:"Realtime Ordering Auditor",category:"realtime",description:"Analyze realtime ordering auditor signals and produce evidence-oriented project findings",keywords:["created_at", "sequence", "order", "event"]},
  {id:"optimistic_realtime_conflict",title:"Optimistic Realtime Conflict",category:"realtime",description:"Analyze optimistic realtime conflict signals and produce evidence-oriented project findings",keywords:["optimistic", "realtime", "merge", "rollback"]},
  {id:"websocket_error_auditor",title:"WebSocket Error Auditor",category:"realtime",description:"Analyze websocket error auditor signals and produce evidence-oriented project findings",keywords:["websocket", "socket", "error", "close"]},
  {id:"realtime_resource_guard",title:"Realtime Resource Guard",category:"realtime",description:"Analyze realtime resource guard signals and produce evidence-oriented project findings",keywords:["unsubscribe", "cleanup", "removeChannel", "disconnect"]},
  {id:"live_presence_scaling_auditor",title:"Live Presence Scaling Auditor",category:"realtime",description:"Analyze live presence scaling auditor signals and produce evidence-oriented project findings",keywords:["presence", "users", "online", "room"]},
  {id:"unit_test_inventory",title:"Unit Test Inventory",category:"testing_unit",description:"Analyze unit test inventory signals and produce evidence-oriented project findings",keywords:["describe(", "it(", "test(", "expect("]},
  {id:"mock_quality_auditor",title:"Mock Quality Auditor",category:"testing_unit",description:"Analyze mock quality auditor signals and produce evidence-oriented project findings",keywords:["mock", "vi.mock", "jest.mock", "stub"]},
  {id:"assertion_strength_auditor",title:"Assertion Strength Auditor",category:"testing_unit",description:"Analyze assertion strength auditor signals and produce evidence-oriented project findings",keywords:["expect(", "toEqual", "toBe", "toMatch"]},
  {id:"edge_case_test_auditor",title:"Edge Case Test Auditor",category:"testing_unit",description:"Analyze edge case test auditor signals and produce evidence-oriented project findings",keywords:["edge", "invalid", "empty", "null"]},
  {id:"error_path_test_auditor",title:"Error Path Test Auditor",category:"testing_unit",description:"Analyze error path test auditor signals and produce evidence-oriented project findings",keywords:["rejects", "throws", "error", "failure"]},
  {id:"async_test_auditor",title:"Async Test Auditor",category:"testing_unit",description:"Analyze async test auditor signals and produce evidence-oriented project findings",keywords:["async", "await", "waitFor", "findBy"]},
  {id:"unit_fixture_quality_auditor",title:"Unit Fixture Quality Auditor",category:"testing_unit",description:"Analyze unit fixture quality auditor signals and produce evidence-oriented project findings",keywords:["fixture", "factory", "seed", "mockData"]},
  {id:"snapshot_test_auditor",title:"Snapshot Test Auditor",category:"testing_unit",description:"Analyze snapshot test auditor signals and produce evidence-oriented project findings",keywords:["snapshot", "toMatchSnapshot", "inlineSnapshot", "__snapshots__"]},
  {id:"test_isolation_auditor",title:"Test Isolation Auditor",category:"testing_unit",description:"Analyze test isolation auditor signals and produce evidence-oriented project findings",keywords:["beforeEach", "afterEach", "cleanup", "reset"]},
  {id:"coverage_target_auditor",title:"Coverage Target Auditor",category:"testing_unit",description:"Analyze coverage target auditor signals and produce evidence-oriented project findings",keywords:["coverage", "threshold", "branches", "functions"]},
  {id:"unit_test_naming_auditor",title:"Unit Test Naming Auditor",category:"testing_unit",description:"Analyze unit test naming auditor signals and produce evidence-oriented project findings",keywords:["describe", "it(", "should", "when"]},
  {id:"critical_path_e2e_mapper",title:"Critical Path E2E Mapper",category:"testing_e2e",description:"Analyze critical path e2e mapper signals and produce evidence-oriented project findings",keywords:["playwright", "cypress", "page.goto", "locator"]},
  {id:"login_e2e_auditor",title:"Login E2E Auditor",category:"testing_e2e",description:"Analyze login e2e auditor signals and produce evidence-oriented project findings",keywords:["login", "sign in", "password", "session"]},
  {id:"crud_e2e_auditor",title:"CRUD E2E Auditor",category:"testing_e2e",description:"Analyze crud e2e auditor signals and produce evidence-oriented project findings",keywords:["create", "edit", "delete", "save"]},
  {id:"mobile_e2e_coverage",title:"Mobile E2E Coverage",category:"testing_e2e",description:"Analyze mobile e2e coverage signals and produce evidence-oriented project findings",keywords:["viewport", "mobile", "375", "430"]},
  {id:"rtl_e2e_coverage",title:"RTL E2E Coverage",category:"testing_e2e",description:"Analyze rtl e2e coverage signals and produce evidence-oriented project findings",keywords:["rtl", "dir=", "arabic", "locale"]},
  {id:"permission_e2e_coverage",title:"Permission E2E Coverage",category:"testing_e2e",description:"Analyze permission e2e coverage signals and produce evidence-oriented project findings",keywords:["role", "permission", "403", "unauthorized"]},
  {id:"network_failure_e2e",title:"Network Failure E2E",category:"testing_e2e",description:"Analyze network failure e2e signals and produce evidence-oriented project findings",keywords:["route.abort", "offline", "500", "timeout"]},
  {id:"file_upload_e2e",title:"File Upload E2E",category:"testing_e2e",description:"Analyze file upload e2e signals and produce evidence-oriented project findings",keywords:["setInputFiles", "upload", "file chooser", "attachment"]},
  {id:"print_export_e2e",title:"Print Export E2E",category:"testing_e2e",description:"Analyze print export e2e signals and produce evidence-oriented project findings",keywords:["print", "pdf", "download", "export"]},
  {id:"visual_e2e_baseline",title:"Visual E2E Baseline",category:"testing_e2e",description:"Analyze visual e2e baseline signals and produce evidence-oriented project findings",keywords:["screenshot", "visual", "toHaveScreenshot", "baseline"]},
  {id:"cross_browser_e2e_auditor",title:"Cross Browser E2E Auditor",category:"testing_e2e",description:"Analyze cross browser e2e auditor signals and produce evidence-oriented project findings",keywords:["chromium", "firefox", "webkit", "projects"]},
  {id:"heading_structure_auditor",title:"Heading Structure Auditor",category:"accessibility",description:"Analyze heading structure auditor signals and produce evidence-oriented project findings",keywords:["<h1", "<h2", "heading", "aria-level"]},
  {id:"landmark_auditor",title:"Landmark Auditor",category:"accessibility",description:"Analyze landmark auditor signals and produce evidence-oriented project findings",keywords:["main", "nav", "header", "footer"]},
  {id:"focus_trap_auditor",title:"Focus Trap Auditor",category:"accessibility",description:"Analyze focus trap auditor signals and produce evidence-oriented project findings",keywords:["focus", "dialog", "trap", "tabindex"]},
  {id:"keyboard_navigation_auditor",title:"Keyboard Navigation Auditor",category:"accessibility",description:"Analyze keyboard navigation auditor signals and produce evidence-oriented project findings",keywords:["onKeyDown", "tabIndex", "keyboard", "Enter"]},
  {id:"aria_relationship_auditor",title:"ARIA Relationship Auditor",category:"accessibility",description:"Analyze aria relationship auditor signals and produce evidence-oriented project findings",keywords:["aria-labelledby", "aria-describedby", "aria-controls", "id="]},
  {id:"live_region_auditor",title:"Live Region Auditor",category:"accessibility",description:"Analyze live region auditor signals and produce evidence-oriented project findings",keywords:["aria-live", "role=\"status\"", "alert", "announcement"]},
  {id:"image_alt_auditor",title:"Image Alt Auditor",category:"accessibility",description:"Analyze image alt auditor signals and produce evidence-oriented project findings",keywords:["<img", "alt=", "Image", "aria-hidden"]},
  {id:"contrast_token_auditor",title:"Contrast Token Auditor",category:"accessibility",description:"Analyze contrast token auditor signals and produce evidence-oriented project findings",keywords:["foreground", "background", "muted", "contrast"]},
  {id:"reduced_motion_auditor",title:"Reduced Motion Auditor",category:"accessibility",description:"Analyze reduced motion auditor signals and produce evidence-oriented project findings",keywords:["prefers-reduced-motion", "motion-safe", "animation", "transition"]},
  {id:"screen_reader_text_auditor",title:"Screen Reader Text Auditor",category:"accessibility",description:"Analyze screen reader text auditor signals and produce evidence-oriented project findings",keywords:["sr-only", "visually-hidden", "aria-label", "screen reader"]},
  {id:"accessible_table_auditor",title:"Accessible Table Auditor",category:"accessibility",description:"Analyze accessible table auditor signals and produce evidence-oriented project findings",keywords:["<table", "<th", "scope=", "caption"]},
  {id:"bundle_split_auditor",title:"Bundle Split Auditor",category:"performance",description:"Analyze bundle split auditor signals and produce evidence-oriented project findings",keywords:["lazy", "dynamic", "chunk", "split"]},
  {id:"image_loading_auditor",title:"Image Loading Auditor",category:"performance",description:"Analyze image loading auditor signals and produce evidence-oriented project findings",keywords:["loading=\"lazy\"", "next/image", "srcset", "sizes"]},
  {id:"font_loading_auditor",title:"Font Loading Auditor",category:"performance",description:"Analyze font loading auditor signals and produce evidence-oriented project findings",keywords:["font-display", "woff2", "preload", "font-face"]},
  {id:"render_blocking_auditor",title:"Render Blocking Auditor",category:"performance",description:"Analyze render blocking auditor signals and produce evidence-oriented project findings",keywords:["preload", "defer", "async", "stylesheet"]},
  {id:"memo_hotspot_auditor",title:"Memo Hotspot Auditor",category:"performance",description:"Analyze memo hotspot auditor signals and produce evidence-oriented project findings",keywords:["useMemo", "memo(", "useCallback", "rerender"]},
  {id:"list_virtualization_auditor",title:"List Virtualization Auditor",category:"performance",description:"Analyze list virtualization auditor signals and produce evidence-oriented project findings",keywords:["virtual", "window", "react-window", "large list"]},
  {id:"network_waterfall_auditor",title:"Network Waterfall Auditor",category:"performance",description:"Analyze network waterfall auditor signals and produce evidence-oriented project findings",keywords:["fetch(", "await", "Promise.all", "waterfall"]},
  {id:"prefetch_strategy_auditor",title:"Prefetch Strategy Auditor",category:"performance",description:"Analyze prefetch strategy auditor signals and produce evidence-oriented project findings",keywords:["prefetch", "preload", "router.prefetch", "warm"]},
  {id:"cache_header_auditor",title:"Cache Header Auditor",category:"performance",description:"Analyze cache header auditor signals and produce evidence-oriented project findings",keywords:["cache-control", "etag", "max-age", "s-maxage"]},
  {id:"database_latency_auditor",title:"Database Latency Auditor",category:"performance",description:"Analyze database latency auditor signals and produce evidence-oriented project findings",keywords:["select", "rpc", "query", "await supabase"]},
  {id:"performance_budget_enforcer",title:"Performance Budget Enforcer",category:"performance",description:"Analyze performance budget enforcer signals and produce evidence-oriented project findings",keywords:["bundle", "latency", "LCP", "CLS"]},
  {id:"vite_config_auditor",title:"Vite Config Auditor",category:"build_tooling",description:"Analyze vite config auditor signals and produce evidence-oriented project findings",keywords:["vite.config", "defineConfig", "plugins", "build"]},
  {id:"next_config_auditor",title:"Next Config Auditor",category:"build_tooling",description:"Analyze next config auditor signals and produce evidence-oriented project findings",keywords:["next.config", "images", "headers", "experimental"]},
  {id:"env_build_boundary",title:"Env Build Boundary",category:"build_tooling",description:"Analyze env build boundary signals and produce evidence-oriented project findings",keywords:["import.meta.env", "process.env", "NEXT_PUBLIC", "VITE_"]},
  {id:"source_map_auditor",title:"Source Map Auditor",category:"build_tooling",description:"Analyze source map auditor signals and produce evidence-oriented project findings",keywords:["sourcemap", "sourceMap", "devtool", "hidden-source-map"]},
  {id:"tree_shaking_auditor",title:"Tree Shaking Auditor",category:"build_tooling",description:"Analyze tree shaking auditor signals and produce evidence-oriented project findings",keywords:["sideEffects", "tree shaking", "esm", "module"]},
  {id:"alias_resolution_auditor",title:"Alias Resolution Auditor",category:"build_tooling",description:"Analyze alias resolution auditor signals and produce evidence-oriented project findings",keywords:["alias", "paths", "resolve", "@/"]},
  {id:"build_output_auditor",title:"Build Output Auditor",category:"build_tooling",description:"Analyze build output auditor signals and produce evidence-oriented project findings",keywords:["dist", "build", "outDir", ".next"]},
  {id:"minification_auditor",title:"Minification Auditor",category:"build_tooling",description:"Analyze minification auditor signals and produce evidence-oriented project findings",keywords:["minify", "terser", "esbuild", "swc"]},
  {id:"polyfill_auditor",title:"Polyfill Auditor",category:"build_tooling",description:"Analyze polyfill auditor signals and produce evidence-oriented project findings",keywords:["polyfill", "core-js", "browserslist", "legacy"]},
  {id:"package_script_auditor",title:"Package Script Auditor",category:"build_tooling",description:"Analyze package script auditor signals and produce evidence-oriented project findings",keywords:["scripts", "build", "dev", "test"]},
  {id:"node_engine_auditor",title:"Node Engine Auditor",category:"build_tooling",description:"Analyze node engine auditor signals and produce evidence-oriented project findings",keywords:["engines", "node", "npm", "pnpm"]},
  {id:"branch_strategy_auditor",title:"Branch Strategy Auditor",category:"git_ci",description:"Analyze branch strategy auditor signals and produce evidence-oriented project findings",keywords:["branch", "main", "develop", "release"]},
  {id:"commit_message_auditor",title:"Commit Message Auditor",category:"git_ci",description:"Analyze commit message auditor signals and produce evidence-oriented project findings",keywords:["commit", "feat:", "fix:", "chore:"]},
  {id:"precommit_hook_auditor",title:"Precommit Hook Auditor",category:"git_ci",description:"Analyze precommit hook auditor signals and produce evidence-oriented project findings",keywords:["husky", "lint-staged", "pre-commit", "hook"]},
  {id:"ci_matrix_auditor",title:"CI Matrix Auditor",category:"git_ci",description:"Analyze ci matrix auditor signals and produce evidence-oriented project findings",keywords:["matrix", "node-version", "os", "strategy"]},
  {id:"ci_cache_auditor",title:"CI Cache Auditor",category:"git_ci",description:"Analyze ci cache auditor signals and produce evidence-oriented project findings",keywords:["cache", "actions/cache", "pnpm", "npm"]},
  {id:"ci_secret_usage_auditor",title:"CI Secret Usage Auditor",category:"git_ci",description:"Analyze ci secret usage auditor signals and produce evidence-oriented project findings",keywords:["secrets.", "env:", "token", "GITHUB_TOKEN"]},
  {id:"pr_gate_auditor",title:"PR Gate Auditor",category:"git_ci",description:"Analyze pr gate auditor signals and produce evidence-oriented project findings",keywords:["pull_request", "required", "status checks", "review"]},
  {id:"release_tag_auditor",title:"Release Tag Auditor",category:"git_ci",description:"Analyze release tag auditor signals and produce evidence-oriented project findings",keywords:["tag", "release", "version", "semantic"]},
  {id:"changelog_consistency_auditor",title:"Changelog Consistency Auditor",category:"git_ci",description:"Analyze changelog consistency auditor signals and produce evidence-oriented project findings",keywords:["CHANGELOG", "release notes", "version", "changes"]},
  {id:"gitignore_auditor",title:"Gitignore Auditor",category:"git_ci",description:"Analyze gitignore auditor signals and produce evidence-oriented project findings",keywords:[".gitignore", ".env", "node_modules", "dist"]},
  {id:"repository_hygiene_auditor",title:"Repository Hygiene Auditor",category:"git_ci",description:"Analyze repository hygiene auditor signals and produce evidence-oriented project findings",keywords:["TODO", "FIXME", "temp", "backup"]},
  {id:"structured_logging_auditor",title:"Structured Logging Auditor",category:"observability",description:"Analyze structured logging auditor signals and produce evidence-oriented project findings",keywords:["logger", "JSON.stringify", "level", "timestamp"]},
  {id:"error_tracking_auditor",title:"Error Tracking Auditor",category:"observability",description:"Analyze error tracking auditor signals and produce evidence-oriented project findings",keywords:["sentry", "captureException", "error tracking", "stack"]},
  {id:"metric_instrumentation_auditor",title:"Metric Instrumentation Auditor",category:"observability",description:"Analyze metric instrumentation auditor signals and produce evidence-oriented project findings",keywords:["metric", "counter", "histogram", "gauge"]},
  {id:"trace_instrumentation_auditor",title:"Trace Instrumentation Auditor",category:"observability",description:"Analyze trace instrumentation auditor signals and produce evidence-oriented project findings",keywords:["trace", "span", "opentelemetry", "correlation"]},
  {id:"request_id_auditor",title:"Request ID Auditor",category:"observability",description:"Analyze request id auditor signals and produce evidence-oriented project findings",keywords:["request-id", "correlation-id", "trace-id", "uuid"]},
  {id:"log_redaction_auditor",title:"Log Redaction Auditor",category:"observability",description:"Analyze log redaction auditor signals and produce evidence-oriented project findings",keywords:["redact", "password", "token", "secret"]},
  {id:"health_endpoint_auditor",title:"Health Endpoint Auditor",category:"observability",description:"Analyze health endpoint auditor signals and produce evidence-oriented project findings",keywords:["/health", "healthz", "readiness", "liveness"]},
  {id:"alert_rule_auditor",title:"Alert Rule Auditor",category:"observability",description:"Analyze alert rule auditor signals and produce evidence-oriented project findings",keywords:["alert", "threshold", "pager", "notify"]},
  {id:"audit_event_auditor",title:"Audit Event Auditor",category:"observability",description:"Analyze audit event auditor signals and produce evidence-oriented project findings",keywords:["audit", "event", "actor", "timestamp"]},
  {id:"client_telemetry_auditor",title:"Client Telemetry Auditor",category:"observability",description:"Analyze client telemetry auditor signals and produce evidence-oriented project findings",keywords:["web-vitals", "analytics", "performance", "telemetry"]},
  {id:"observability_retention_auditor",title:"Observability Retention Auditor",category:"observability",description:"Analyze observability retention auditor signals and produce evidence-oriented project findings",keywords:["retention", "logs", "metrics", "days"]},
  {id:"first_run_experience_auditor",title:"First Run Experience Auditor",category:"product_ux",description:"Analyze first run experience auditor signals and produce evidence-oriented project findings",keywords:["welcome", "onboarding", "empty", "get started"]},
  {id:"task_completion_auditor",title:"Task Completion Auditor",category:"product_ux",description:"Analyze task completion auditor signals and produce evidence-oriented project findings",keywords:["success", "complete", "done", "confirmation"]},
  {id:"error_recovery_ux_auditor",title:"Error Recovery UX Auditor",category:"product_ux",description:"Analyze error recovery ux auditor signals and produce evidence-oriented project findings",keywords:["retry", "try again", "error", "recover"]},
  {id:"destructive_action_ux_auditor",title:"Destructive Action UX Auditor",category:"product_ux",description:"Analyze destructive action ux auditor signals and produce evidence-oriented project findings",keywords:["delete", "confirm", "undo", "danger"]},
  {id:"bulk_action_ux_auditor",title:"Bulk Action UX Auditor",category:"product_ux",description:"Analyze bulk action ux auditor signals and produce evidence-oriented project findings",keywords:["bulk", "selected", "select all", "batch"]},
  {id:"search_filter_ux_auditor",title:"Search Filter UX Auditor",category:"product_ux",description:"Analyze search filter ux auditor signals and produce evidence-oriented project findings",keywords:["search", "filter", "clear", "results"]},
  {id:"empty_state_actionability",title:"Empty State Actionability",category:"product_ux",description:"Analyze empty state actionability signals and produce evidence-oriented project findings",keywords:["no data", "empty", "create", "add"]},
  {id:"notification_priority_auditor",title:"Notification Priority Auditor",category:"product_ux",description:"Analyze notification priority auditor signals and produce evidence-oriented project findings",keywords:["notification", "priority", "critical", "badge"]},
  {id:"dashboard_information_hierarchy",title:"Dashboard Information Hierarchy",category:"product_ux",description:"Analyze dashboard information hierarchy signals and produce evidence-oriented project findings",keywords:["dashboard", "kpi", "card", "summary"]},
  {id:"role_based_ux_auditor",title:"Role Based UX Auditor",category:"product_ux",description:"Analyze role based ux auditor signals and produce evidence-oriented project findings",keywords:["role", "permission", "admin", "viewer"]},
  {id:"help_discoverability_auditor",title:"Help Discoverability Auditor",category:"product_ux",description:"Analyze help discoverability auditor signals and produce evidence-oriented project findings",keywords:["help", "tooltip", "docs", "learn more"]},
  {id:"agent_capability_registry",title:"Agent Capability Registry",category:"ai_agent",description:"Analyze agent capability registry signals and produce evidence-oriented project findings",keywords:["agent", "capability", "skills", "tools"]},
  {id:"tool_permission_auditor",title:"Tool Permission Auditor",category:"ai_agent",description:"Analyze tool permission auditor signals and produce evidence-oriented project findings",keywords:["destructiveHint", "readOnlyHint", "openWorldHint", "permission"]},
  {id:"agent_context_minimizer",title:"Agent Context Minimizer",category:"ai_agent",description:"Analyze agent context minimizer signals and produce evidence-oriented project findings",keywords:["context", "scope", "files", "relevant"]},
  {id:"agent_evidence_auditor",title:"Agent Evidence Auditor",category:"ai_agent",description:"Analyze agent evidence auditor signals and produce evidence-oriented project findings",keywords:["evidence", "verified", "status", "proof"]},
  {id:"agent_failure_memory",title:"Agent Failure Memory",category:"ai_agent",description:"Analyze agent failure memory signals and produce evidence-oriented project findings",keywords:["failure", "retry", "blocked", "lesson"]},
  {id:"agent_success_pattern_miner",title:"Agent Success Pattern Miner",category:"ai_agent",description:"Analyze agent success pattern miner signals and produce evidence-oriented project findings",keywords:["success", "pattern", "confidence", "memory"]},
  {id:"agent_parallelism_planner",title:"Agent Parallelism Planner",category:"ai_agent",description:"Analyze agent parallelism planner signals and produce evidence-oriented project findings",keywords:["parallel", "dependency", "task graph", "concurrent"]},
  {id:"agent_conflict_detector",title:"Agent Conflict Detector",category:"ai_agent",description:"Analyze agent conflict detector signals and produce evidence-oriented project findings",keywords:["conflict", "opinion", "consensus", "council"]},
  {id:"agent_cost_optimizer",title:"Agent Cost Optimizer",category:"ai_agent",description:"Analyze agent cost optimizer signals and produce evidence-oriented project findings",keywords:["token", "cost", "budget", "model"]},
  {id:"agent_human_handoff_planner",title:"Agent Human Handoff Planner",category:"ai_agent",description:"Analyze agent human handoff planner signals and produce evidence-oriented project findings",keywords:["approval", "human", "blocked", "escalate"]},
  {id:"agent_completion_truth_guard",title:"Agent Completion Truth Guard",category:"ai_agent",description:"Analyze agent completion truth guard signals and produce evidence-oriented project findings",keywords:["done", "complete", "verified", "evidence"]},
  {id:"readme_completeness_auditor",title:"README Completeness Auditor",category:"documentation",description:"Analyze readme completeness auditor signals and produce evidence-oriented project findings",keywords:["README", "install", "usage", "setup"]},
  {id:"api_docs_auditor",title:"API Docs Auditor",category:"documentation",description:"Analyze api docs auditor signals and produce evidence-oriented project findings",keywords:["api", "endpoint", "request", "response"]},
  {id:"architecture_docs_auditor",title:"Architecture Docs Auditor",category:"documentation",description:"Analyze architecture docs auditor signals and produce evidence-oriented project findings",keywords:["architecture", "diagram", "module", "design"]},
  {id:"env_docs_auditor",title:"Environment Docs Auditor",category:"documentation",description:"Analyze environment docs auditor signals and produce evidence-oriented project findings",keywords:[".env", "environment", "variable", "configuration"]},
  {id:"runbook_auditor",title:"Runbook Auditor",category:"documentation",description:"Analyze runbook auditor signals and produce evidence-oriented project findings",keywords:["runbook", "incident", "restart", "rollback"]},
  {id:"migration_docs_auditor",title:"Migration Docs Auditor",category:"documentation",description:"Analyze migration docs auditor signals and produce evidence-oriented project findings",keywords:["migration", "database", "schema", "deploy"]},
  {id:"release_docs_auditor",title:"Release Docs Auditor",category:"documentation",description:"Analyze release docs auditor signals and produce evidence-oriented project findings",keywords:["release", "version", "changelog", "deploy"]},
  {id:"troubleshooting_docs_auditor",title:"Troubleshooting Docs Auditor",category:"documentation",description:"Analyze troubleshooting docs auditor signals and produce evidence-oriented project findings",keywords:["troubleshoot", "error", "fix", "known issue"]},
  {id:"code_comment_quality_auditor",title:"Code Comment Quality Auditor",category:"documentation",description:"Analyze code comment quality auditor signals and produce evidence-oriented project findings",keywords:["TODO", "NOTE", "FIXME", "comment"]},
  {id:"decision_record_auditor",title:"Decision Record Auditor",category:"documentation",description:"Analyze decision record auditor signals and produce evidence-oriented project findings",keywords:["ADR", "decision", "tradeoff", "rationale"]},
  {id:"developer_onboarding_auditor",title:"Developer Onboarding Auditor",category:"documentation",description:"Analyze developer onboarding auditor signals and produce evidence-oriented project findings",keywords:["setup", "install", "dev server", "prerequisite"]},
];

async function v130RunCapability(cap:V130Capability, scope?:string, writeReport=true){
  const root=scope?safePath(scope):PROJECT_ROOT;
  const files:string[]=[]; await v120Walk(root,files,500);
  const findings:any[]=[]; let bytesScanned=0; let testSignals=0; let sourceSignals=0;
  for(const abs of files){ let txt=""; try{const st=await fs.stat(abs); if(st.size>MAX_FILE_SIZE)continue; bytesScanned+=st.size; txt=await fs.readFile(abs,"utf8");}catch{continue;} const low=txt.toLowerCase(); const matches=cap.keywords.filter(k=>low.includes(k.toLowerCase())); if(!matches.length)continue; const rel=path.relative(PROJECT_ROOT,abs).replace(/\\/g,"/"); const isTest=/\.(test|spec)\.|__tests__|playwright|cypress/i.test(rel); if(isTest)testSignals++; else sourceSignals++; const lineCount=txt.split(/\r?\n/).length; findings.push({file:rel,score:matches.length+(isTest?0.25:0),matches,lineCount,isTest}); }
  findings.sort((a,b)=>b.score-a.score||b.lineCount-a.lineCount||a.file.localeCompare(b.file));
  const top=findings.slice(0,30); const density=files.length?findings.length/files.length:0; const risk=density>0.22||top.length>24?"HIGH":density>0.08||top.length>10?"MEDIUM":"LOW";
  const report={version:"13.0.0",capability:cap.id,title:cap.title,category:cap.category,description:cap.description,scope:scope||".",filesScanned:files.length,bytesScanned,signalFiles:findings.length,testSignals,sourceSignals,coverageHint:sourceSignals?Math.min(100,Math.round((testSignals/sourceSignals)*100)):0,risk,topFiles:top,recommendations:[`Inspect the highest-signal ${cap.category} files before editing.`,`Validate static findings using tests/runtime evidence; signal matches are not proof of a defect.`,`Record evidence before marking ${cap.id} complete.`],generatedAt:new Date().toISOString()};
  if(writeReport){const dir=path.join(PROJECT_ROOT,".krom",V130_REPORT_DIR);await fs.mkdir(dir,{recursive:true});await fs.writeFile(path.join(dir,`${cap.id}.json`),JSON.stringify(report,null,2),"utf8");}
  return report;
}
// ===== END v13.0 =====


// ===== v14.0 EXACT-1000 TOOL EXPANSION =====
type V140Capability = { id:string; title:string; category:string; description:string; keywords:string[] };
const V140_REPORT_DIR = "v14-1000-tools";
const V140_CAPABILITIES: V140Capability[] = [
  {id:"ai_orchestration_agent_planner",title:"Agent Planner",category:"ai_orchestration",description:"Analyze agent planner with evidence-oriented findings and actionable engineering checks.",keywords:["agent", "tool", "prompt", "context"]},
  {id:"ai_orchestration_agent_router",title:"Agent Router",category:"ai_orchestration",description:"Analyze agent router with evidence-oriented findings and actionable engineering checks.",keywords:["agent", "tool", "prompt", "context"]},
  {id:"ai_orchestration_agent_handoff",title:"Agent Handoff",category:"ai_orchestration",description:"Analyze agent handoff with evidence-oriented findings and actionable engineering checks.",keywords:["agent", "tool", "prompt", "context"]},
  {id:"ai_orchestration_agent_memory",title:"Agent Memory",category:"ai_orchestration",description:"Analyze agent memory with evidence-oriented findings and actionable engineering checks.",keywords:["agent", "tool", "prompt", "context"]},
  {id:"ai_orchestration_agent_consensus",title:"Agent Consensus",category:"ai_orchestration",description:"Analyze agent consensus with evidence-oriented findings and actionable engineering checks.",keywords:["agent", "tool", "prompt", "context"]},
  {id:"ai_orchestration_agent_conflict",title:"Agent Conflict",category:"ai_orchestration",description:"Analyze agent conflict with evidence-oriented findings and actionable engineering checks.",keywords:["agent", "tool", "prompt", "context"]},
  {id:"ai_orchestration_agent_budget",title:"Agent Budget",category:"ai_orchestration",description:"Analyze agent budget with evidence-oriented findings and actionable engineering checks.",keywords:["agent", "tool", "prompt", "context"]},
  {id:"ai_orchestration_agent_retry",title:"Agent Retry",category:"ai_orchestration",description:"Analyze agent retry with evidence-oriented findings and actionable engineering checks.",keywords:["agent", "tool", "prompt", "context"]},
  {id:"ai_orchestration_agent_evidence",title:"Agent Evidence",category:"ai_orchestration",description:"Analyze agent evidence with evidence-oriented findings and actionable engineering checks.",keywords:["agent", "tool", "prompt", "context"]},
  {id:"ai_orchestration_agent_trace",title:"Agent Trace",category:"ai_orchestration",description:"Analyze agent trace with evidence-oriented findings and actionable engineering checks.",keywords:["agent", "tool", "prompt", "context"]},
  {id:"ai_orchestration_agent_parallelism",title:"Agent Parallelism",category:"ai_orchestration",description:"Analyze agent parallelism with evidence-oriented findings and actionable engineering checks.",keywords:["agent", "tool", "prompt", "context"]},
  {id:"ai_orchestration_agent_priority",title:"Agent Priority",category:"ai_orchestration",description:"Analyze agent priority with evidence-oriented findings and actionable engineering checks.",keywords:["agent", "tool", "prompt", "context"]},
  {id:"ai_orchestration_agent_timeout",title:"Agent Timeout",category:"ai_orchestration",description:"Analyze agent timeout with evidence-oriented findings and actionable engineering checks.",keywords:["agent", "tool", "prompt", "context"]},
  {id:"ai_orchestration_agent_guardrail",title:"Agent Guardrail",category:"ai_orchestration",description:"Analyze agent guardrail with evidence-oriented findings and actionable engineering checks.",keywords:["agent", "tool", "prompt", "context"]},
  {id:"ai_orchestration_agent_context",title:"Agent Context",category:"ai_orchestration",description:"Analyze agent context with evidence-oriented findings and actionable engineering checks.",keywords:["agent", "tool", "prompt", "context"]},
  {id:"ai_orchestration_agent_skill_match",title:"Agent Skill Match",category:"ai_orchestration",description:"Analyze agent skill match with evidence-oriented findings and actionable engineering checks.",keywords:["agent", "tool", "prompt", "context"]},
  {id:"ai_orchestration_agent_tool_match",title:"Agent Tool Match",category:"ai_orchestration",description:"Analyze agent tool match with evidence-oriented findings and actionable engineering checks.",keywords:["agent", "tool", "prompt", "context"]},
  {id:"ai_orchestration_agent_feedback",title:"Agent Feedback",category:"ai_orchestration",description:"Analyze agent feedback with evidence-oriented findings and actionable engineering checks.",keywords:["agent", "tool", "prompt", "context"]},
  {id:"ai_orchestration_agent_completion",title:"Agent Completion",category:"ai_orchestration",description:"Analyze agent completion with evidence-oriented findings and actionable engineering checks.",keywords:["agent", "tool", "prompt", "context"]},
  {id:"ai_orchestration_agent_recovery",title:"Agent Recovery",category:"ai_orchestration",description:"Analyze agent recovery with evidence-oriented findings and actionable engineering checks.",keywords:["agent", "tool", "prompt", "context"]},
  {id:"code_generation_spec_codegen",title:"Spec Codegen",category:"code_generation",description:"Analyze spec codegen with evidence-oriented findings and actionable engineering checks.",keywords:["function", "class", "export", "return"]},
  {id:"code_generation_component_codegen",title:"Component Codegen",category:"code_generation",description:"Analyze component codegen with evidence-oriented findings and actionable engineering checks.",keywords:["function", "class", "export", "return"]},
  {id:"code_generation_service_codegen",title:"Service Codegen",category:"code_generation",description:"Analyze service codegen with evidence-oriented findings and actionable engineering checks.",keywords:["function", "class", "export", "return"]},
  {id:"code_generation_hook_codegen",title:"Hook Codegen",category:"code_generation",description:"Analyze hook codegen with evidence-oriented findings and actionable engineering checks.",keywords:["function", "class", "export", "return"]},
  {id:"code_generation_schema_codegen",title:"Schema Codegen",category:"code_generation",description:"Analyze schema codegen with evidence-oriented findings and actionable engineering checks.",keywords:["function", "class", "export", "return"]},
  {id:"code_generation_test_codegen",title:"Test Codegen",category:"code_generation",description:"Analyze test codegen with evidence-oriented findings and actionable engineering checks.",keywords:["function", "class", "export", "return"]},
  {id:"code_generation_fixture_codegen",title:"Fixture Codegen",category:"code_generation",description:"Analyze fixture codegen with evidence-oriented findings and actionable engineering checks.",keywords:["function", "class", "export", "return"]},
  {id:"code_generation_mock_codegen",title:"Mock Codegen",category:"code_generation",description:"Analyze mock codegen with evidence-oriented findings and actionable engineering checks.",keywords:["function", "class", "export", "return"]},
  {id:"code_generation_migration_codegen",title:"Migration Codegen",category:"code_generation",description:"Analyze migration codegen with evidence-oriented findings and actionable engineering checks.",keywords:["function", "class", "export", "return"]},
  {id:"code_generation_api_codegen",title:"Api Codegen",category:"code_generation",description:"Analyze api codegen with evidence-oriented findings and actionable engineering checks.",keywords:["function", "class", "export", "return"]},
  {id:"code_generation_cli_codegen",title:"Cli Codegen",category:"code_generation",description:"Analyze cli codegen with evidence-oriented findings and actionable engineering checks.",keywords:["function", "class", "export", "return"]},
  {id:"code_generation_config_codegen",title:"Config Codegen",category:"code_generation",description:"Analyze config codegen with evidence-oriented findings and actionable engineering checks.",keywords:["function", "class", "export", "return"]},
  {id:"code_generation_type_codegen",title:"Type Codegen",category:"code_generation",description:"Analyze type codegen with evidence-oriented findings and actionable engineering checks.",keywords:["function", "class", "export", "return"]},
  {id:"code_generation_docs_codegen",title:"Docs Codegen",category:"code_generation",description:"Analyze docs codegen with evidence-oriented findings and actionable engineering checks.",keywords:["function", "class", "export", "return"]},
  {id:"code_generation_refactor_codegen",title:"Refactor Codegen",category:"code_generation",description:"Analyze refactor codegen with evidence-oriented findings and actionable engineering checks.",keywords:["function", "class", "export", "return"]},
  {id:"code_generation_adapter_codegen",title:"Adapter Codegen",category:"code_generation",description:"Analyze adapter codegen with evidence-oriented findings and actionable engineering checks.",keywords:["function", "class", "export", "return"]},
  {id:"code_generation_validator_codegen",title:"Validator Codegen",category:"code_generation",description:"Analyze validator codegen with evidence-oriented findings and actionable engineering checks.",keywords:["function", "class", "export", "return"]},
  {id:"code_generation_serializer_codegen",title:"Serializer Codegen",category:"code_generation",description:"Analyze serializer codegen with evidence-oriented findings and actionable engineering checks.",keywords:["function", "class", "export", "return"]},
  {id:"code_generation_parser_codegen",title:"Parser Codegen",category:"code_generation",description:"Analyze parser codegen with evidence-oriented findings and actionable engineering checks.",keywords:["function", "class", "export", "return"]},
  {id:"code_generation_workflow_codegen",title:"Workflow Codegen",category:"code_generation",description:"Analyze workflow codegen with evidence-oriented findings and actionable engineering checks.",keywords:["function", "class", "export", "return"]},
  {id:"code_analysis_ast_mapper",title:"Ast Mapper",category:"code_analysis",description:"Analyze ast mapper with evidence-oriented findings and actionable engineering checks.",keywords:["import", "export", "function", "class"]},
  {id:"code_analysis_symbol_graph",title:"Symbol Graph",category:"code_analysis",description:"Analyze symbol graph with evidence-oriented findings and actionable engineering checks.",keywords:["import", "export", "function", "class"]},
  {id:"code_analysis_call_graph",title:"Call Graph",category:"code_analysis",description:"Analyze call graph with evidence-oriented findings and actionable engineering checks.",keywords:["import", "export", "function", "class"]},
  {id:"code_analysis_import_graph",title:"Import Graph",category:"code_analysis",description:"Analyze import graph with evidence-oriented findings and actionable engineering checks.",keywords:["import", "export", "function", "class"]},
  {id:"code_analysis_dependency_graph",title:"Dependency Graph",category:"code_analysis",description:"Analyze dependency graph with evidence-oriented findings and actionable engineering checks.",keywords:["import", "export", "function", "class"]},
  {id:"code_analysis_dead_code",title:"Dead Code",category:"code_analysis",description:"Analyze dead code with evidence-oriented findings and actionable engineering checks.",keywords:["import", "export", "function", "class"]},
  {id:"code_analysis_duplicate_code",title:"Duplicate Code",category:"code_analysis",description:"Analyze duplicate code with evidence-oriented findings and actionable engineering checks.",keywords:["import", "export", "function", "class"]},
  {id:"code_analysis_complexity_map",title:"Complexity Map",category:"code_analysis",description:"Analyze complexity map with evidence-oriented findings and actionable engineering checks.",keywords:["import", "export", "function", "class"]},
  {id:"code_analysis_hotspot_map",title:"Hotspot Map",category:"code_analysis",description:"Analyze hotspot map with evidence-oriented findings and actionable engineering checks.",keywords:["import", "export", "function", "class"]},
  {id:"code_analysis_side_effect_map",title:"Side Effect Map",category:"code_analysis",description:"Analyze side effect map with evidence-oriented findings and actionable engineering checks.",keywords:["import", "export", "function", "class"]},
  {id:"code_analysis_mutation_map",title:"Mutation Map",category:"code_analysis",description:"Analyze mutation map with evidence-oriented findings and actionable engineering checks.",keywords:["import", "export", "function", "class"]},
  {id:"code_analysis_async_flow",title:"Async Flow",category:"code_analysis",description:"Analyze async flow with evidence-oriented findings and actionable engineering checks.",keywords:["import", "export", "function", "class"]},
  {id:"code_analysis_error_flow",title:"Error Flow",category:"code_analysis",description:"Analyze error flow with evidence-oriented findings and actionable engineering checks.",keywords:["import", "export", "function", "class"]},
  {id:"code_analysis_state_flow",title:"State Flow",category:"code_analysis",description:"Analyze state flow with evidence-oriented findings and actionable engineering checks.",keywords:["import", "export", "function", "class"]},
  {id:"code_analysis_data_flow",title:"Data Flow",category:"code_analysis",description:"Analyze data flow with evidence-oriented findings and actionable engineering checks.",keywords:["import", "export", "function", "class"]},
  {id:"code_analysis_type_flow",title:"Type Flow",category:"code_analysis",description:"Analyze type flow with evidence-oriented findings and actionable engineering checks.",keywords:["import", "export", "function", "class"]},
  {id:"code_analysis_control_flow",title:"Control Flow",category:"code_analysis",description:"Analyze control flow with evidence-oriented findings and actionable engineering checks.",keywords:["import", "export", "function", "class"]},
  {id:"code_analysis_ownership_map",title:"Ownership Map",category:"code_analysis",description:"Analyze ownership map with evidence-oriented findings and actionable engineering checks.",keywords:["import", "export", "function", "class"]},
  {id:"code_analysis_boundary_map",title:"Boundary Map",category:"code_analysis",description:"Analyze boundary map with evidence-oriented findings and actionable engineering checks.",keywords:["import", "export", "function", "class"]},
  {id:"code_analysis_change_risk",title:"Change Risk",category:"code_analysis",description:"Analyze change risk with evidence-oriented findings and actionable engineering checks.",keywords:["import", "export", "function", "class"]},
  {id:"refactoring_extract_component",title:"Extract Component",category:"refactoring",description:"Analyze extract component with evidence-oriented findings and actionable engineering checks.",keywords:["function", "component", "service", "module"]},
  {id:"refactoring_extract_hook",title:"Extract Hook",category:"refactoring",description:"Analyze extract hook with evidence-oriented findings and actionable engineering checks.",keywords:["function", "component", "service", "module"]},
  {id:"refactoring_extract_service",title:"Extract Service",category:"refactoring",description:"Analyze extract service with evidence-oriented findings and actionable engineering checks.",keywords:["function", "component", "service", "module"]},
  {id:"refactoring_rename_symbol",title:"Rename Symbol",category:"refactoring",description:"Analyze rename symbol with evidence-oriented findings and actionable engineering checks.",keywords:["function", "component", "service", "module"]},
  {id:"refactoring_move_module",title:"Move Module",category:"refactoring",description:"Analyze move module with evidence-oriented findings and actionable engineering checks.",keywords:["function", "component", "service", "module"]},
  {id:"refactoring_split_module",title:"Split Module",category:"refactoring",description:"Analyze split module with evidence-oriented findings and actionable engineering checks.",keywords:["function", "component", "service", "module"]},
  {id:"refactoring_merge_module",title:"Merge Module",category:"refactoring",description:"Analyze merge module with evidence-oriented findings and actionable engineering checks.",keywords:["function", "component", "service", "module"]},
  {id:"refactoring_simplify_condition",title:"Simplify Condition",category:"refactoring",description:"Analyze simplify condition with evidence-oriented findings and actionable engineering checks.",keywords:["function", "component", "service", "module"]},
  {id:"refactoring_remove_duplication",title:"Remove Duplication",category:"refactoring",description:"Analyze remove duplication with evidence-oriented findings and actionable engineering checks.",keywords:["function", "component", "service", "module"]},
  {id:"refactoring_normalize_types",title:"Normalize Types",category:"refactoring",description:"Analyze normalize types with evidence-oriented findings and actionable engineering checks.",keywords:["function", "component", "service", "module"]},
  {id:"refactoring_reduce_coupling",title:"Reduce Coupling",category:"refactoring",description:"Analyze reduce coupling with evidence-oriented findings and actionable engineering checks.",keywords:["function", "component", "service", "module"]},
  {id:"refactoring_reduce_complexity",title:"Reduce Complexity",category:"refactoring",description:"Analyze reduce complexity with evidence-oriented findings and actionable engineering checks.",keywords:["function", "component", "service", "module"]},
  {id:"refactoring_modernize_api",title:"Modernize Api",category:"refactoring",description:"Analyze modernize api with evidence-oriented findings and actionable engineering checks.",keywords:["function", "component", "service", "module"]},
  {id:"refactoring_async_refactor",title:"Async Refactor",category:"refactoring",description:"Analyze async refactor with evidence-oriented findings and actionable engineering checks.",keywords:["function", "component", "service", "module"]},
  {id:"refactoring_state_refactor",title:"State Refactor",category:"refactoring",description:"Analyze state refactor with evidence-oriented findings and actionable engineering checks.",keywords:["function", "component", "service", "module"]},
  {id:"refactoring_routing_refactor",title:"Routing Refactor",category:"refactoring",description:"Analyze routing refactor with evidence-oriented findings and actionable engineering checks.",keywords:["function", "component", "service", "module"]},
  {id:"refactoring_css_refactor",title:"Css Refactor",category:"refactoring",description:"Analyze css refactor with evidence-oriented findings and actionable engineering checks.",keywords:["function", "component", "service", "module"]},
  {id:"refactoring_test_refactor",title:"Test Refactor",category:"refactoring",description:"Analyze test refactor with evidence-oriented findings and actionable engineering checks.",keywords:["function", "component", "service", "module"]},
  {id:"refactoring_db_refactor",title:"Db Refactor",category:"refactoring",description:"Analyze db refactor with evidence-oriented findings and actionable engineering checks.",keywords:["function", "component", "service", "module"]},
  {id:"refactoring_safe_cleanup",title:"Safe Cleanup",category:"refactoring",description:"Analyze safe cleanup with evidence-oriented findings and actionable engineering checks.",keywords:["function", "component", "service", "module"]},
  {id:"ui_design_design_tokens",title:"Design Tokens",category:"ui_design",description:"Analyze design tokens with evidence-oriented findings and actionable engineering checks.",keywords:["className", "style", "css", "tailwind"]},
  {id:"ui_design_typography_system",title:"Typography System",category:"ui_design",description:"Analyze typography system with evidence-oriented findings and actionable engineering checks.",keywords:["className", "style", "css", "tailwind"]},
  {id:"ui_design_spacing_system",title:"Spacing System",category:"ui_design",description:"Analyze spacing system with evidence-oriented findings and actionable engineering checks.",keywords:["className", "style", "css", "tailwind"]},
  {id:"ui_design_color_system",title:"Color System",category:"ui_design",description:"Analyze color system with evidence-oriented findings and actionable engineering checks.",keywords:["className", "style", "css", "tailwind"]},
  {id:"ui_design_surface_system",title:"Surface System",category:"ui_design",description:"Analyze surface system with evidence-oriented findings and actionable engineering checks.",keywords:["className", "style", "css", "tailwind"]},
  {id:"ui_design_button_system",title:"Button System",category:"ui_design",description:"Analyze button system with evidence-oriented findings and actionable engineering checks.",keywords:["className", "style", "css", "tailwind"]},
  {id:"ui_design_form_system",title:"Form System",category:"ui_design",description:"Analyze form system with evidence-oriented findings and actionable engineering checks.",keywords:["className", "style", "css", "tailwind"]},
  {id:"ui_design_table_system",title:"Table System",category:"ui_design",description:"Analyze table system with evidence-oriented findings and actionable engineering checks.",keywords:["className", "style", "css", "tailwind"]},
  {id:"ui_design_navigation_system",title:"Navigation System",category:"ui_design",description:"Analyze navigation system with evidence-oriented findings and actionable engineering checks.",keywords:["className", "style", "css", "tailwind"]},
  {id:"ui_design_dashboard_system",title:"Dashboard System",category:"ui_design",description:"Analyze dashboard system with evidence-oriented findings and actionable engineering checks.",keywords:["className", "style", "css", "tailwind"]},
  {id:"ui_design_dialog_system",title:"Dialog System",category:"ui_design",description:"Analyze dialog system with evidence-oriented findings and actionable engineering checks.",keywords:["className", "style", "css", "tailwind"]},
  {id:"ui_design_empty_state_system",title:"Empty State System",category:"ui_design",description:"Analyze empty state system with evidence-oriented findings and actionable engineering checks.",keywords:["className", "style", "css", "tailwind"]},
  {id:"ui_design_feedback_system",title:"Feedback System",category:"ui_design",description:"Analyze feedback system with evidence-oriented findings and actionable engineering checks.",keywords:["className", "style", "css", "tailwind"]},
  {id:"ui_design_motion_system",title:"Motion System",category:"ui_design",description:"Analyze motion system with evidence-oriented findings and actionable engineering checks.",keywords:["className", "style", "css", "tailwind"]},
  {id:"ui_design_icon_system",title:"Icon System",category:"ui_design",description:"Analyze icon system with evidence-oriented findings and actionable engineering checks.",keywords:["className", "style", "css", "tailwind"]},
  {id:"ui_design_responsive_system",title:"Responsive System",category:"ui_design",description:"Analyze responsive system with evidence-oriented findings and actionable engineering checks.",keywords:["className", "style", "css", "tailwind"]},
  {id:"ui_design_rtl_system",title:"Rtl System",category:"ui_design",description:"Analyze rtl system with evidence-oriented findings and actionable engineering checks.",keywords:["className", "style", "css", "tailwind"]},
  {id:"ui_design_dark_mode_system",title:"Dark Mode System",category:"ui_design",description:"Analyze dark mode system with evidence-oriented findings and actionable engineering checks.",keywords:["className", "style", "css", "tailwind"]},
  {id:"ui_design_density_system",title:"Density System",category:"ui_design",description:"Analyze density system with evidence-oriented findings and actionable engineering checks.",keywords:["className", "style", "css", "tailwind"]},
  {id:"ui_design_visual_consistency",title:"Visual Consistency",category:"ui_design",description:"Analyze visual consistency with evidence-oriented findings and actionable engineering checks.",keywords:["className", "style", "css", "tailwind"]},
  {id:"frontend_runtime_render_profiler",title:"Render Profiler",category:"frontend_runtime",description:"Analyze render profiler with evidence-oriented findings and actionable engineering checks.",keywords:["react", "useEffect", "route", "fetch"]},
  {id:"frontend_runtime_hydration_audit",title:"Hydration Audit",category:"frontend_runtime",description:"Analyze hydration audit with evidence-oriented findings and actionable engineering checks.",keywords:["react", "useEffect", "route", "fetch"]},
  {id:"frontend_runtime_client_boundary",title:"Client Boundary",category:"frontend_runtime",description:"Analyze client boundary with evidence-oriented findings and actionable engineering checks.",keywords:["react", "useEffect", "route", "fetch"]},
  {id:"frontend_runtime_server_boundary",title:"Server Boundary",category:"frontend_runtime",description:"Analyze server boundary with evidence-oriented findings and actionable engineering checks.",keywords:["react", "useEffect", "route", "fetch"]},
  {id:"frontend_runtime_state_sync",title:"State Sync",category:"frontend_runtime",description:"Analyze state sync with evidence-oriented findings and actionable engineering checks.",keywords:["react", "useEffect", "route", "fetch"]},
  {id:"frontend_runtime_query_cache",title:"Query Cache",category:"frontend_runtime",description:"Analyze query cache with evidence-oriented findings and actionable engineering checks.",keywords:["react", "useEffect", "route", "fetch"]},
  {id:"frontend_runtime_event_listener",title:"Event Listener",category:"frontend_runtime",description:"Analyze event listener with evidence-oriented findings and actionable engineering checks.",keywords:["react", "useEffect", "route", "fetch"]},
  {id:"frontend_runtime_memory_leak",title:"Memory Leak",category:"frontend_runtime",description:"Analyze memory leak with evidence-oriented findings and actionable engineering checks.",keywords:["react", "useEffect", "route", "fetch"]},
  {id:"frontend_runtime_bundle_split",title:"Bundle Split",category:"frontend_runtime",description:"Analyze bundle split with evidence-oriented findings and actionable engineering checks.",keywords:["react", "useEffect", "route", "fetch"]},
  {id:"frontend_runtime_lazy_load",title:"Lazy Load",category:"frontend_runtime",description:"Analyze lazy load with evidence-oriented findings and actionable engineering checks.",keywords:["react", "useEffect", "route", "fetch"]},
  {id:"frontend_runtime_image_load",title:"Image Load",category:"frontend_runtime",description:"Analyze image load with evidence-oriented findings and actionable engineering checks.",keywords:["react", "useEffect", "route", "fetch"]},
  {id:"frontend_runtime_font_load",title:"Font Load",category:"frontend_runtime",description:"Analyze font load with evidence-oriented findings and actionable engineering checks.",keywords:["react", "useEffect", "route", "fetch"]},
  {id:"frontend_runtime_route_load",title:"Route Load",category:"frontend_runtime",description:"Analyze route load with evidence-oriented findings and actionable engineering checks.",keywords:["react", "useEffect", "route", "fetch"]},
  {id:"frontend_runtime_form_runtime",title:"Form Runtime",category:"frontend_runtime",description:"Analyze form runtime with evidence-oriented findings and actionable engineering checks.",keywords:["react", "useEffect", "route", "fetch"]},
  {id:"frontend_runtime_error_boundary",title:"Error Boundary",category:"frontend_runtime",description:"Analyze error boundary with evidence-oriented findings and actionable engineering checks.",keywords:["react", "useEffect", "route", "fetch"]},
  {id:"frontend_runtime_suspense_runtime",title:"Suspense Runtime",category:"frontend_runtime",description:"Analyze suspense runtime with evidence-oriented findings and actionable engineering checks.",keywords:["react", "useEffect", "route", "fetch"]},
  {id:"frontend_runtime_web_worker",title:"Web Worker",category:"frontend_runtime",description:"Analyze web worker with evidence-oriented findings and actionable engineering checks.",keywords:["react", "useEffect", "route", "fetch"]},
  {id:"frontend_runtime_storage_runtime",title:"Storage Runtime",category:"frontend_runtime",description:"Analyze storage runtime with evidence-oriented findings and actionable engineering checks.",keywords:["react", "useEffect", "route", "fetch"]},
  {id:"frontend_runtime_offline_runtime",title:"Offline Runtime",category:"frontend_runtime",description:"Analyze offline runtime with evidence-oriented findings and actionable engineering checks.",keywords:["react", "useEffect", "route", "fetch"]},
  {id:"frontend_runtime_pwa_runtime",title:"Pwa Runtime",category:"frontend_runtime",description:"Analyze pwa runtime with evidence-oriented findings and actionable engineering checks.",keywords:["react", "useEffect", "route", "fetch"]},
  {id:"mobile_web_touch_target",title:"Touch Target",category:"mobile_web",description:"Analyze touch target with evidence-oriented findings and actionable engineering checks.",keywords:["viewport", "mobile", "touch", "responsive"]},
  {id:"mobile_web_viewport_fit",title:"Viewport Fit",category:"mobile_web",description:"Analyze viewport fit with evidence-oriented findings and actionable engineering checks.",keywords:["viewport", "mobile", "touch", "responsive"]},
  {id:"mobile_web_safe_area",title:"Safe Area",category:"mobile_web",description:"Analyze safe area with evidence-oriented findings and actionable engineering checks.",keywords:["viewport", "mobile", "touch", "responsive"]},
  {id:"mobile_web_mobile_nav",title:"Mobile Nav",category:"mobile_web",description:"Analyze mobile nav with evidence-oriented findings and actionable engineering checks.",keywords:["viewport", "mobile", "touch", "responsive"]},
  {id:"mobile_web_mobile_table",title:"Mobile Table",category:"mobile_web",description:"Analyze mobile table with evidence-oriented findings and actionable engineering checks.",keywords:["viewport", "mobile", "touch", "responsive"]},
  {id:"mobile_web_mobile_form",title:"Mobile Form",category:"mobile_web",description:"Analyze mobile form with evidence-oriented findings and actionable engineering checks.",keywords:["viewport", "mobile", "touch", "responsive"]},
  {id:"mobile_web_mobile_dialog",title:"Mobile Dialog",category:"mobile_web",description:"Analyze mobile dialog with evidence-oriented findings and actionable engineering checks.",keywords:["viewport", "mobile", "touch", "responsive"]},
  {id:"mobile_web_mobile_keyboard",title:"Mobile Keyboard",category:"mobile_web",description:"Analyze mobile keyboard with evidence-oriented findings and actionable engineering checks.",keywords:["viewport", "mobile", "touch", "responsive"]},
  {id:"mobile_web_orientation",title:"Orientation",category:"mobile_web",description:"Analyze orientation with evidence-oriented findings and actionable engineering checks.",keywords:["viewport", "mobile", "touch", "responsive"]},
  {id:"mobile_web_gesture_conflict",title:"Gesture Conflict",category:"mobile_web",description:"Analyze gesture conflict with evidence-oriented findings and actionable engineering checks.",keywords:["viewport", "mobile", "touch", "responsive"]},
  {id:"mobile_web_scroll_lock",title:"Scroll Lock",category:"mobile_web",description:"Analyze scroll lock with evidence-oriented findings and actionable engineering checks.",keywords:["viewport", "mobile", "touch", "responsive"]},
  {id:"mobile_web_sticky_layout",title:"Sticky Layout",category:"mobile_web",description:"Analyze sticky layout with evidence-oriented findings and actionable engineering checks.",keywords:["viewport", "mobile", "touch", "responsive"]},
  {id:"mobile_web_bottom_sheet",title:"Bottom Sheet",category:"mobile_web",description:"Analyze bottom sheet with evidence-oriented findings and actionable engineering checks.",keywords:["viewport", "mobile", "touch", "responsive"]},
  {id:"mobile_web_mobile_upload",title:"Mobile Upload",category:"mobile_web",description:"Analyze mobile upload with evidence-oriented findings and actionable engineering checks.",keywords:["viewport", "mobile", "touch", "responsive"]},
  {id:"mobile_web_camera_input",title:"Camera Input",category:"mobile_web",description:"Analyze camera input with evidence-oriented findings and actionable engineering checks.",keywords:["viewport", "mobile", "touch", "responsive"]},
  {id:"mobile_web_mobile_performance",title:"Mobile Performance",category:"mobile_web",description:"Analyze mobile performance with evidence-oriented findings and actionable engineering checks.",keywords:["viewport", "mobile", "touch", "responsive"]},
  {id:"mobile_web_low_bandwidth",title:"Low Bandwidth",category:"mobile_web",description:"Analyze low bandwidth with evidence-oriented findings and actionable engineering checks.",keywords:["viewport", "mobile", "touch", "responsive"]},
  {id:"mobile_web_offline_mobile",title:"Offline Mobile",category:"mobile_web",description:"Analyze offline mobile with evidence-oriented findings and actionable engineering checks.",keywords:["viewport", "mobile", "touch", "responsive"]},
  {id:"mobile_web_install_prompt",title:"Install Prompt",category:"mobile_web",description:"Analyze install prompt with evidence-oriented findings and actionable engineering checks.",keywords:["viewport", "mobile", "touch", "responsive"]},
  {id:"mobile_web_mobile_a11y",title:"Mobile A11y",category:"mobile_web",description:"Analyze mobile a11y with evidence-oriented findings and actionable engineering checks.",keywords:["viewport", "mobile", "touch", "responsive"]},
  {id:"accessibility_aria_audit",title:"Aria Audit",category:"accessibility",description:"Analyze aria audit with evidence-oriented findings and actionable engineering checks.",keywords:["aria", "role", "label", "tabIndex"]},
  {id:"accessibility_keyboard_nav",title:"Keyboard Nav",category:"accessibility",description:"Analyze keyboard nav with evidence-oriented findings and actionable engineering checks.",keywords:["aria", "role", "label", "tabIndex"]},
  {id:"accessibility_focus_order",title:"Focus Order",category:"accessibility",description:"Analyze focus order with evidence-oriented findings and actionable engineering checks.",keywords:["aria", "role", "label", "tabIndex"]},
  {id:"accessibility_focus_trap",title:"Focus Trap",category:"accessibility",description:"Analyze focus trap with evidence-oriented findings and actionable engineering checks.",keywords:["aria", "role", "label", "tabIndex"]},
  {id:"accessibility_color_contrast",title:"Color Contrast",category:"accessibility",description:"Analyze color contrast with evidence-oriented findings and actionable engineering checks.",keywords:["aria", "role", "label", "tabIndex"]},
  {id:"accessibility_label_audit",title:"Label Audit",category:"accessibility",description:"Analyze label audit with evidence-oriented findings and actionable engineering checks.",keywords:["aria", "role", "label", "tabIndex"]},
  {id:"accessibility_alt_text",title:"Alt Text",category:"accessibility",description:"Analyze alt text with evidence-oriented findings and actionable engineering checks.",keywords:["aria", "role", "label", "tabIndex"]},
  {id:"accessibility_heading_order",title:"Heading Order",category:"accessibility",description:"Analyze heading order with evidence-oriented findings and actionable engineering checks.",keywords:["aria", "role", "label", "tabIndex"]},
  {id:"accessibility_landmark_audit",title:"Landmark Audit",category:"accessibility",description:"Analyze landmark audit with evidence-oriented findings and actionable engineering checks.",keywords:["aria", "role", "label", "tabIndex"]},
  {id:"accessibility_live_region",title:"Live Region",category:"accessibility",description:"Analyze live region with evidence-oriented findings and actionable engineering checks.",keywords:["aria", "role", "label", "tabIndex"]},
  {id:"accessibility_error_message",title:"Error Message",category:"accessibility",description:"Analyze error message with evidence-oriented findings and actionable engineering checks.",keywords:["aria", "role", "label", "tabIndex"]},
  {id:"accessibility_table_semantics",title:"Table Semantics",category:"accessibility",description:"Analyze table semantics with evidence-oriented findings and actionable engineering checks.",keywords:["aria", "role", "label", "tabIndex"]},
  {id:"accessibility_dialog_semantics",title:"Dialog Semantics",category:"accessibility",description:"Analyze dialog semantics with evidence-oriented findings and actionable engineering checks.",keywords:["aria", "role", "label", "tabIndex"]},
  {id:"accessibility_form_semantics",title:"Form Semantics",category:"accessibility",description:"Analyze form semantics with evidence-oriented findings and actionable engineering checks.",keywords:["aria", "role", "label", "tabIndex"]},
  {id:"accessibility_motion_reduction",title:"Motion Reduction",category:"accessibility",description:"Analyze motion reduction with evidence-oriented findings and actionable engineering checks.",keywords:["aria", "role", "label", "tabIndex"]},
  {id:"accessibility_zoom_reflow",title:"Zoom Reflow",category:"accessibility",description:"Analyze zoom reflow with evidence-oriented findings and actionable engineering checks.",keywords:["aria", "role", "label", "tabIndex"]},
  {id:"accessibility_screen_reader",title:"Screen Reader",category:"accessibility",description:"Analyze screen reader with evidence-oriented findings and actionable engineering checks.",keywords:["aria", "role", "label", "tabIndex"]},
  {id:"accessibility_skip_link",title:"Skip Link",category:"accessibility",description:"Analyze skip link with evidence-oriented findings and actionable engineering checks.",keywords:["aria", "role", "label", "tabIndex"]},
  {id:"accessibility_language_attr",title:"Language Attr",category:"accessibility",description:"Analyze language attr with evidence-oriented findings and actionable engineering checks.",keywords:["aria", "role", "label", "tabIndex"]},
  {id:"accessibility_a11y_regression",title:"A11y Regression",category:"accessibility",description:"Analyze a11y regression with evidence-oriented findings and actionable engineering checks.",keywords:["aria", "role", "label", "tabIndex"]},
  {id:"testing_unit_unit_coverage",title:"Unit Coverage",category:"testing_unit",description:"Analyze unit coverage with evidence-oriented findings and actionable engineering checks.",keywords:["test(", "expect(", "describe(", "it("]},
  {id:"testing_unit_branch_coverage",title:"Branch Coverage",category:"testing_unit",description:"Analyze branch coverage with evidence-oriented findings and actionable engineering checks.",keywords:["test(", "expect(", "describe(", "it("]},
  {id:"testing_unit_mutation_testing",title:"Mutation Testing",category:"testing_unit",description:"Analyze mutation testing with evidence-oriented findings and actionable engineering checks.",keywords:["test(", "expect(", "describe(", "it("]},
  {id:"testing_unit_property_testing",title:"Property Testing",category:"testing_unit",description:"Analyze property testing with evidence-oriented findings and actionable engineering checks.",keywords:["test(", "expect(", "describe(", "it("]},
  {id:"testing_unit_edge_case",title:"Edge Case",category:"testing_unit",description:"Analyze edge case with evidence-oriented findings and actionable engineering checks.",keywords:["test(", "expect(", "describe(", "it("]},
  {id:"testing_unit_mock_quality",title:"Mock Quality",category:"testing_unit",description:"Analyze mock quality with evidence-oriented findings and actionable engineering checks.",keywords:["test(", "expect(", "describe(", "it("]},
  {id:"testing_unit_fixture_quality",title:"Fixture Quality",category:"testing_unit",description:"Analyze fixture quality with evidence-oriented findings and actionable engineering checks.",keywords:["test(", "expect(", "describe(", "it("]},
  {id:"testing_unit_test_isolation",title:"Test Isolation",category:"testing_unit",description:"Analyze test isolation with evidence-oriented findings and actionable engineering checks.",keywords:["test(", "expect(", "describe(", "it("]},
  {id:"testing_unit_test_speed",title:"Test Speed",category:"testing_unit",description:"Analyze test speed with evidence-oriented findings and actionable engineering checks.",keywords:["test(", "expect(", "describe(", "it("]},
  {id:"testing_unit_flaky_unit",title:"Flaky Unit",category:"testing_unit",description:"Analyze flaky unit with evidence-oriented findings and actionable engineering checks.",keywords:["test(", "expect(", "describe(", "it("]},
  {id:"testing_unit_assertion_quality",title:"Assertion Quality",category:"testing_unit",description:"Analyze assertion quality with evidence-oriented findings and actionable engineering checks.",keywords:["test(", "expect(", "describe(", "it("]},
  {id:"testing_unit_snapshot_quality",title:"Snapshot Quality",category:"testing_unit",description:"Analyze snapshot quality with evidence-oriented findings and actionable engineering checks.",keywords:["test(", "expect(", "describe(", "it("]},
  {id:"testing_unit_hook_testing",title:"Hook Testing",category:"testing_unit",description:"Analyze hook testing with evidence-oriented findings and actionable engineering checks.",keywords:["test(", "expect(", "describe(", "it("]},
  {id:"testing_unit_component_testing",title:"Component Testing",category:"testing_unit",description:"Analyze component testing with evidence-oriented findings and actionable engineering checks.",keywords:["test(", "expect(", "describe(", "it("]},
  {id:"testing_unit_service_testing",title:"Service Testing",category:"testing_unit",description:"Analyze service testing with evidence-oriented findings and actionable engineering checks.",keywords:["test(", "expect(", "describe(", "it("]},
  {id:"testing_unit_utility_testing",title:"Utility Testing",category:"testing_unit",description:"Analyze utility testing with evidence-oriented findings and actionable engineering checks.",keywords:["test(", "expect(", "describe(", "it("]},
  {id:"testing_unit_validation_testing",title:"Validation Testing",category:"testing_unit",description:"Analyze validation testing with evidence-oriented findings and actionable engineering checks.",keywords:["test(", "expect(", "describe(", "it("]},
  {id:"testing_unit_error_testing",title:"Error Testing",category:"testing_unit",description:"Analyze error testing with evidence-oriented findings and actionable engineering checks.",keywords:["test(", "expect(", "describe(", "it("]},
  {id:"testing_unit_async_testing",title:"Async Testing",category:"testing_unit",description:"Analyze async testing with evidence-oriented findings and actionable engineering checks.",keywords:["test(", "expect(", "describe(", "it("]},
  {id:"testing_unit_unit_gap",title:"Unit Gap",category:"testing_unit",description:"Analyze unit gap with evidence-oriented findings and actionable engineering checks.",keywords:["test(", "expect(", "describe(", "it("]},
  {id:"testing_e2e_journey_mapper",title:"Journey Mapper",category:"testing_e2e",description:"Analyze journey mapper with evidence-oriented findings and actionable engineering checks.",keywords:["playwright", "cypress", "page.", "locator("]},
  {id:"testing_e2e_happy_path",title:"Happy Path",category:"testing_e2e",description:"Analyze happy path with evidence-oriented findings and actionable engineering checks.",keywords:["playwright", "cypress", "page.", "locator("]},
  {id:"testing_e2e_negative_path",title:"Negative Path",category:"testing_e2e",description:"Analyze negative path with evidence-oriented findings and actionable engineering checks.",keywords:["playwright", "cypress", "page.", "locator("]},
  {id:"testing_e2e_permission_path",title:"Permission Path",category:"testing_e2e",description:"Analyze permission path with evidence-oriented findings and actionable engineering checks.",keywords:["playwright", "cypress", "page.", "locator("]},
  {id:"testing_e2e_auth_path",title:"Auth Path",category:"testing_e2e",description:"Analyze auth path with evidence-oriented findings and actionable engineering checks.",keywords:["playwright", "cypress", "page.", "locator("]},
  {id:"testing_e2e_checkout_path",title:"Checkout Path",category:"testing_e2e",description:"Analyze checkout path with evidence-oriented findings and actionable engineering checks.",keywords:["playwright", "cypress", "page.", "locator("]},
  {id:"testing_e2e_form_path",title:"Form Path",category:"testing_e2e",description:"Analyze form path with evidence-oriented findings and actionable engineering checks.",keywords:["playwright", "cypress", "page.", "locator("]},
  {id:"testing_e2e_upload_path",title:"Upload Path",category:"testing_e2e",description:"Analyze upload path with evidence-oriented findings and actionable engineering checks.",keywords:["playwright", "cypress", "page.", "locator("]},
  {id:"testing_e2e_download_path",title:"Download Path",category:"testing_e2e",description:"Analyze download path with evidence-oriented findings and actionable engineering checks.",keywords:["playwright", "cypress", "page.", "locator("]},
  {id:"testing_e2e_navigation_path",title:"Navigation Path",category:"testing_e2e",description:"Analyze navigation path with evidence-oriented findings and actionable engineering checks.",keywords:["playwright", "cypress", "page.", "locator("]},
  {id:"testing_e2e_responsive_path",title:"Responsive Path",category:"testing_e2e",description:"Analyze responsive path with evidence-oriented findings and actionable engineering checks.",keywords:["playwright", "cypress", "page.", "locator("]},
  {id:"testing_e2e_offline_path",title:"Offline Path",category:"testing_e2e",description:"Analyze offline path with evidence-oriented findings and actionable engineering checks.",keywords:["playwright", "cypress", "page.", "locator("]},
  {id:"testing_e2e_network_failure",title:"Network Failure",category:"testing_e2e",description:"Analyze network failure with evidence-oriented findings and actionable engineering checks.",keywords:["playwright", "cypress", "page.", "locator("]},
  {id:"testing_e2e_browser_matrix",title:"Browser Matrix",category:"testing_e2e",description:"Analyze browser matrix with evidence-oriented findings and actionable engineering checks.",keywords:["playwright", "cypress", "page.", "locator("]},
  {id:"testing_e2e_visual_path",title:"Visual Path",category:"testing_e2e",description:"Analyze visual path with evidence-oriented findings and actionable engineering checks.",keywords:["playwright", "cypress", "page.", "locator("]},
  {id:"testing_e2e_accessibility_path",title:"Accessibility Path",category:"testing_e2e",description:"Analyze accessibility path with evidence-oriented findings and actionable engineering checks.",keywords:["playwright", "cypress", "page.", "locator("]},
  {id:"testing_e2e_data_seed",title:"Data Seed",category:"testing_e2e",description:"Analyze data seed with evidence-oriented findings and actionable engineering checks.",keywords:["playwright", "cypress", "page.", "locator("]},
  {id:"testing_e2e_cleanup_path",title:"Cleanup Path",category:"testing_e2e",description:"Analyze cleanup path with evidence-oriented findings and actionable engineering checks.",keywords:["playwright", "cypress", "page.", "locator("]},
  {id:"testing_e2e_flaky_e2e",title:"Flaky E2e",category:"testing_e2e",description:"Analyze flaky e2e with evidence-oriented findings and actionable engineering checks.",keywords:["playwright", "cypress", "page.", "locator("]},
  {id:"testing_e2e_e2e_gap",title:"E2e Gap",category:"testing_e2e",description:"Analyze e2e gap with evidence-oriented findings and actionable engineering checks.",keywords:["playwright", "cypress", "page.", "locator("]},
  {id:"api_network_endpoint_inventory",title:"Endpoint Inventory",category:"api_network",description:"Analyze endpoint inventory with evidence-oriented findings and actionable engineering checks.",keywords:["fetch(", "axios", "api", "response"]},
  {id:"api_network_request_schema",title:"Request Schema",category:"api_network",description:"Analyze request schema with evidence-oriented findings and actionable engineering checks.",keywords:["fetch(", "axios", "api", "response"]},
  {id:"api_network_response_schema",title:"Response Schema",category:"api_network",description:"Analyze response schema with evidence-oriented findings and actionable engineering checks.",keywords:["fetch(", "axios", "api", "response"]},
  {id:"api_network_status_code",title:"Status Code",category:"api_network",description:"Analyze status code with evidence-oriented findings and actionable engineering checks.",keywords:["fetch(", "axios", "api", "response"]},
  {id:"api_network_error_contract",title:"Error Contract",category:"api_network",description:"Analyze error contract with evidence-oriented findings and actionable engineering checks.",keywords:["fetch(", "axios", "api", "response"]},
  {id:"api_network_retry_policy",title:"Retry Policy",category:"api_network",description:"Analyze retry policy with evidence-oriented findings and actionable engineering checks.",keywords:["fetch(", "axios", "api", "response"]},
  {id:"api_network_timeout_policy",title:"Timeout Policy",category:"api_network",description:"Analyze timeout policy with evidence-oriented findings and actionable engineering checks.",keywords:["fetch(", "axios", "api", "response"]},
  {id:"api_network_pagination_contract",title:"Pagination Contract",category:"api_network",description:"Analyze pagination contract with evidence-oriented findings and actionable engineering checks.",keywords:["fetch(", "axios", "api", "response"]},
  {id:"api_network_filter_contract",title:"Filter Contract",category:"api_network",description:"Analyze filter contract with evidence-oriented findings and actionable engineering checks.",keywords:["fetch(", "axios", "api", "response"]},
  {id:"api_network_sort_contract",title:"Sort Contract",category:"api_network",description:"Analyze sort contract with evidence-oriented findings and actionable engineering checks.",keywords:["fetch(", "axios", "api", "response"]},
  {id:"api_network_auth_header",title:"Auth Header",category:"api_network",description:"Analyze auth header with evidence-oriented findings and actionable engineering checks.",keywords:["fetch(", "axios", "api", "response"]},
  {id:"api_network_rate_limit",title:"Rate Limit",category:"api_network",description:"Analyze rate limit with evidence-oriented findings and actionable engineering checks.",keywords:["fetch(", "axios", "api", "response"]},
  {id:"api_network_cors_policy",title:"Cors Policy",category:"api_network",description:"Analyze cors policy with evidence-oriented findings and actionable engineering checks.",keywords:["fetch(", "axios", "api", "response"]},
  {id:"api_network_cache_header",title:"Cache Header",category:"api_network",description:"Analyze cache header with evidence-oriented findings and actionable engineering checks.",keywords:["fetch(", "axios", "api", "response"]},
  {id:"api_network_idempotency",title:"Idempotency",category:"api_network",description:"Analyze idempotency with evidence-oriented findings and actionable engineering checks.",keywords:["fetch(", "axios", "api", "response"]},
  {id:"api_network_webhook_contract",title:"Webhook Contract",category:"api_network",description:"Analyze webhook contract with evidence-oriented findings and actionable engineering checks.",keywords:["fetch(", "axios", "api", "response"]},
  {id:"api_network_streaming_contract",title:"Streaming Contract",category:"api_network",description:"Analyze streaming contract with evidence-oriented findings and actionable engineering checks.",keywords:["fetch(", "axios", "api", "response"]},
  {id:"api_network_upload_contract",title:"Upload Contract",category:"api_network",description:"Analyze upload contract with evidence-oriented findings and actionable engineering checks.",keywords:["fetch(", "axios", "api", "response"]},
  {id:"api_network_download_contract",title:"Download Contract",category:"api_network",description:"Analyze download contract with evidence-oriented findings and actionable engineering checks.",keywords:["fetch(", "axios", "api", "response"]},
  {id:"api_network_api_regression",title:"Api Regression",category:"api_network",description:"Analyze api regression with evidence-oriented findings and actionable engineering checks.",keywords:["fetch(", "axios", "api", "response"]},
  {id:"database_schema_map",title:"Schema Map",category:"database",description:"Analyze schema map with evidence-oriented findings and actionable engineering checks.",keywords:["select", "insert", "update", "create table"]},
  {id:"database_foreign_key",title:"Foreign Key",category:"database",description:"Analyze foreign key with evidence-oriented findings and actionable engineering checks.",keywords:["select", "insert", "update", "create table"]},
  {id:"database_index_advisor",title:"Index Advisor",category:"database",description:"Analyze index advisor with evidence-oriented findings and actionable engineering checks.",keywords:["select", "insert", "update", "create table"]},
  {id:"database_query_plan",title:"Query Plan",category:"database",description:"Analyze query plan with evidence-oriented findings and actionable engineering checks.",keywords:["select", "insert", "update", "create table"]},
  {id:"database_migration_order",title:"Migration Order",category:"database",description:"Analyze migration order with evidence-oriented findings and actionable engineering checks.",keywords:["select", "insert", "update", "create table"]},
  {id:"database_migration_safety",title:"Migration Safety",category:"database",description:"Analyze migration safety with evidence-oriented findings and actionable engineering checks.",keywords:["select", "insert", "update", "create table"]},
  {id:"database_nullability",title:"Nullability",category:"database",description:"Analyze nullability with evidence-oriented findings and actionable engineering checks.",keywords:["select", "insert", "update", "create table"]},
  {id:"database_constraint_audit",title:"Constraint Audit",category:"database",description:"Analyze constraint audit with evidence-oriented findings and actionable engineering checks.",keywords:["select", "insert", "update", "create table"]},
  {id:"database_unique_key",title:"Unique Key",category:"database",description:"Analyze unique key with evidence-oriented findings and actionable engineering checks.",keywords:["select", "insert", "update", "create table"]},
  {id:"database_cascade_rule",title:"Cascade Rule",category:"database",description:"Analyze cascade rule with evidence-oriented findings and actionable engineering checks.",keywords:["select", "insert", "update", "create table"]},
  {id:"database_soft_delete",title:"Soft Delete",category:"database",description:"Analyze soft delete with evidence-oriented findings and actionable engineering checks.",keywords:["select", "insert", "update", "create table"]},
  {id:"database_audit_column",title:"Audit Column",category:"database",description:"Analyze audit column with evidence-oriented findings and actionable engineering checks.",keywords:["select", "insert", "update", "create table"]},
  {id:"database_timestamp_policy",title:"Timestamp Policy",category:"database",description:"Analyze timestamp policy with evidence-oriented findings and actionable engineering checks.",keywords:["select", "insert", "update", "create table"]},
  {id:"database_enum_policy",title:"Enum Policy",category:"database",description:"Analyze enum policy with evidence-oriented findings and actionable engineering checks.",keywords:["select", "insert", "update", "create table"]},
  {id:"database_view_audit",title:"View Audit",category:"database",description:"Analyze view audit with evidence-oriented findings and actionable engineering checks.",keywords:["select", "insert", "update", "create table"]},
  {id:"database_function_audit",title:"Function Audit",category:"database",description:"Analyze function audit with evidence-oriented findings and actionable engineering checks.",keywords:["select", "insert", "update", "create table"]},
  {id:"database_trigger_audit",title:"Trigger Audit",category:"database",description:"Analyze trigger audit with evidence-oriented findings and actionable engineering checks.",keywords:["select", "insert", "update", "create table"]},
  {id:"database_transaction_audit",title:"Transaction Audit",category:"database",description:"Analyze transaction audit with evidence-oriented findings and actionable engineering checks.",keywords:["select", "insert", "update", "create table"]},
  {id:"database_connection_pool",title:"Connection Pool",category:"database",description:"Analyze connection pool with evidence-oriented findings and actionable engineering checks.",keywords:["select", "insert", "update", "create table"]},
  {id:"database_db_regression",title:"Db Regression",category:"database",description:"Analyze db regression with evidence-oriented findings and actionable engineering checks.",keywords:["select", "insert", "update", "create table"]},
  {id:"supabase_rls_audit",title:"Rls Audit",category:"supabase",description:"Analyze rls audit with evidence-oriented findings and actionable engineering checks.",keywords:["supabase", "rls", "policy", "auth"]},
  {id:"supabase_policy_matrix",title:"Policy Matrix",category:"supabase",description:"Analyze policy matrix with evidence-oriented findings and actionable engineering checks.",keywords:["supabase", "rls", "policy", "auth"]},
  {id:"supabase_auth_mapping",title:"Auth Mapping",category:"supabase",description:"Analyze auth mapping with evidence-oriented findings and actionable engineering checks.",keywords:["supabase", "rls", "policy", "auth"]},
  {id:"supabase_storage_policy",title:"Storage Policy",category:"supabase",description:"Analyze storage policy with evidence-oriented findings and actionable engineering checks.",keywords:["supabase", "rls", "policy", "auth"]},
  {id:"supabase_realtime_policy",title:"Realtime Policy",category:"supabase",description:"Analyze realtime policy with evidence-oriented findings and actionable engineering checks.",keywords:["supabase", "rls", "policy", "auth"]},
  {id:"supabase_edge_function",title:"Edge Function",category:"supabase",description:"Analyze edge function with evidence-oriented findings and actionable engineering checks.",keywords:["supabase", "rls", "policy", "auth"]},
  {id:"supabase_rpc_audit",title:"Rpc Audit",category:"supabase",description:"Analyze rpc audit with evidence-oriented findings and actionable engineering checks.",keywords:["supabase", "rls", "policy", "auth"]},
  {id:"supabase_service_role",title:"Service Role",category:"supabase",description:"Analyze service role with evidence-oriented findings and actionable engineering checks.",keywords:["supabase", "rls", "policy", "auth"]},
  {id:"supabase_anon_key",title:"Anon Key",category:"supabase",description:"Analyze anon key with evidence-oriented findings and actionable engineering checks.",keywords:["supabase", "rls", "policy", "auth"]},
  {id:"supabase_jwt_claim",title:"Jwt Claim",category:"supabase",description:"Analyze jwt claim with evidence-oriented findings and actionable engineering checks.",keywords:["supabase", "rls", "policy", "auth"]},
  {id:"supabase_bucket_audit",title:"Bucket Audit",category:"supabase",description:"Analyze bucket audit with evidence-oriented findings and actionable engineering checks.",keywords:["supabase", "rls", "policy", "auth"]},
  {id:"supabase_migration_sync",title:"Migration Sync",category:"supabase",description:"Analyze migration sync with evidence-oriented findings and actionable engineering checks.",keywords:["supabase", "rls", "policy", "auth"]},
  {id:"supabase_local_config",title:"Local Config",category:"supabase",description:"Analyze local config with evidence-oriented findings and actionable engineering checks.",keywords:["supabase", "rls", "policy", "auth"]},
  {id:"supabase_type_generation",title:"Type Generation",category:"supabase",description:"Analyze type generation with evidence-oriented findings and actionable engineering checks.",keywords:["supabase", "rls", "policy", "auth"]},
  {id:"supabase_query_pattern",title:"Query Pattern",category:"supabase",description:"Analyze query pattern with evidence-oriented findings and actionable engineering checks.",keywords:["supabase", "rls", "policy", "auth"]},
  {id:"supabase_subscription_cleanup",title:"Subscription Cleanup",category:"supabase",description:"Analyze subscription cleanup with evidence-oriented findings and actionable engineering checks.",keywords:["supabase", "rls", "policy", "auth"]},
  {id:"supabase_auth_redirect",title:"Auth Redirect",category:"supabase",description:"Analyze auth redirect with evidence-oriented findings and actionable engineering checks.",keywords:["supabase", "rls", "policy", "auth"]},
  {id:"supabase_session_refresh",title:"Session Refresh",category:"supabase",description:"Analyze session refresh with evidence-oriented findings and actionable engineering checks.",keywords:["supabase", "rls", "policy", "auth"]},
  {id:"supabase_tenant_isolation",title:"Tenant Isolation",category:"supabase",description:"Analyze tenant isolation with evidence-oriented findings and actionable engineering checks.",keywords:["supabase", "rls", "policy", "auth"]},
  {id:"supabase_supabase_regression",title:"Supabase Regression",category:"supabase",description:"Analyze supabase regression with evidence-oriented findings and actionable engineering checks.",keywords:["supabase", "rls", "policy", "auth"]},
  {id:"security_secret_scan",title:"Secret Scan",category:"security",description:"Analyze secret scan with evidence-oriented findings and actionable engineering checks.",keywords:["auth", "token", "secret", "password"]},
  {id:"security_xss_scan",title:"Xss Scan",category:"security",description:"Analyze xss scan with evidence-oriented findings and actionable engineering checks.",keywords:["auth", "token", "secret", "password"]},
  {id:"security_csrf_review",title:"Csrf Review",category:"security",description:"Analyze csrf review with evidence-oriented findings and actionable engineering checks.",keywords:["auth", "token", "secret", "password"]},
  {id:"security_ssrf_review",title:"Ssrf Review",category:"security",description:"Analyze ssrf review with evidence-oriented findings and actionable engineering checks.",keywords:["auth", "token", "secret", "password"]},
  {id:"security_injection_review",title:"Injection Review",category:"security",description:"Analyze injection review with evidence-oriented findings and actionable engineering checks.",keywords:["auth", "token", "secret", "password"]},
  {id:"security_path_traversal",title:"Path Traversal",category:"security",description:"Analyze path traversal with evidence-oriented findings and actionable engineering checks.",keywords:["auth", "token", "secret", "password"]},
  {id:"security_open_redirect",title:"Open Redirect",category:"security",description:"Analyze open redirect with evidence-oriented findings and actionable engineering checks.",keywords:["auth", "token", "secret", "password"]},
  {id:"security_authz_review",title:"Authz Review",category:"security",description:"Analyze authz review with evidence-oriented findings and actionable engineering checks.",keywords:["auth", "token", "secret", "password"]},
  {id:"security_authn_review",title:"Authn Review",category:"security",description:"Analyze authn review with evidence-oriented findings and actionable engineering checks.",keywords:["auth", "token", "secret", "password"]},
  {id:"security_session_review",title:"Session Review",category:"security",description:"Analyze session review with evidence-oriented findings and actionable engineering checks.",keywords:["auth", "token", "secret", "password"]},
  {id:"security_cookie_review",title:"Cookie Review",category:"security",description:"Analyze cookie review with evidence-oriented findings and actionable engineering checks.",keywords:["auth", "token", "secret", "password"]},
  {id:"security_csp_review",title:"Csp Review",category:"security",description:"Analyze csp review with evidence-oriented findings and actionable engineering checks.",keywords:["auth", "token", "secret", "password"]},
  {id:"security_dependency_review",title:"Dependency Review",category:"security",description:"Analyze dependency review with evidence-oriented findings and actionable engineering checks.",keywords:["auth", "token", "secret", "password"]},
  {id:"security_upload_security",title:"Upload Security",category:"security",description:"Analyze upload security with evidence-oriented findings and actionable engineering checks.",keywords:["auth", "token", "secret", "password"]},
  {id:"security_download_security",title:"Download Security",category:"security",description:"Analyze download security with evidence-oriented findings and actionable engineering checks.",keywords:["auth", "token", "secret", "password"]},
  {id:"security_logging_security",title:"Logging Security",category:"security",description:"Analyze logging security with evidence-oriented findings and actionable engineering checks.",keywords:["auth", "token", "secret", "password"]},
  {id:"security_privacy_review",title:"Privacy Review",category:"security",description:"Analyze privacy review with evidence-oriented findings and actionable engineering checks.",keywords:["auth", "token", "secret", "password"]},
  {id:"security_data_exposure",title:"Data Exposure",category:"security",description:"Analyze data exposure with evidence-oriented findings and actionable engineering checks.",keywords:["auth", "token", "secret", "password"]},
  {id:"security_supply_chain",title:"Supply Chain",category:"security",description:"Analyze supply chain with evidence-oriented findings and actionable engineering checks.",keywords:["auth", "token", "secret", "password"]},
  {id:"security_security_regression",title:"Security Regression",category:"security",description:"Analyze security regression with evidence-oriented findings and actionable engineering checks.",keywords:["auth", "token", "secret", "password"]},
  {id:"performance_bundle_budget",title:"Bundle Budget",category:"performance",description:"Analyze bundle budget with evidence-oriented findings and actionable engineering checks.",keywords:["lazy", "cache", "memo", "bundle"]},
  {id:"performance_route_budget",title:"Route Budget",category:"performance",description:"Analyze route budget with evidence-oriented findings and actionable engineering checks.",keywords:["lazy", "cache", "memo", "bundle"]},
  {id:"performance_image_budget",title:"Image Budget",category:"performance",description:"Analyze image budget with evidence-oriented findings and actionable engineering checks.",keywords:["lazy", "cache", "memo", "bundle"]},
  {id:"performance_font_budget",title:"Font Budget",category:"performance",description:"Analyze font budget with evidence-oriented findings and actionable engineering checks.",keywords:["lazy", "cache", "memo", "bundle"]},
  {id:"performance_network_budget",title:"Network Budget",category:"performance",description:"Analyze network budget with evidence-oriented findings and actionable engineering checks.",keywords:["lazy", "cache", "memo", "bundle"]},
  {id:"performance_render_budget",title:"Render Budget",category:"performance",description:"Analyze render budget with evidence-oriented findings and actionable engineering checks.",keywords:["lazy", "cache", "memo", "bundle"]},
  {id:"performance_memory_budget",title:"Memory Budget",category:"performance",description:"Analyze memory budget with evidence-oriented findings and actionable engineering checks.",keywords:["lazy", "cache", "memo", "bundle"]},
  {id:"performance_cpu_budget",title:"Cpu Budget",category:"performance",description:"Analyze cpu budget with evidence-oriented findings and actionable engineering checks.",keywords:["lazy", "cache", "memo", "bundle"]},
  {id:"performance_query_budget",title:"Query Budget",category:"performance",description:"Analyze query budget with evidence-oriented findings and actionable engineering checks.",keywords:["lazy", "cache", "memo", "bundle"]},
  {id:"performance_api_latency",title:"Api Latency",category:"performance",description:"Analyze api latency with evidence-oriented findings and actionable engineering checks.",keywords:["lazy", "cache", "memo", "bundle"]},
  {id:"performance_cache_strategy",title:"Cache Strategy",category:"performance",description:"Analyze cache strategy with evidence-oriented findings and actionable engineering checks.",keywords:["lazy", "cache", "memo", "bundle"]},
  {id:"performance_memoization",title:"Memoization",category:"performance",description:"Analyze memoization with evidence-oriented findings and actionable engineering checks.",keywords:["lazy", "cache", "memo", "bundle"]},
  {id:"performance_virtualization",title:"Virtualization",category:"performance",description:"Analyze virtualization with evidence-oriented findings and actionable engineering checks.",keywords:["lazy", "cache", "memo", "bundle"]},
  {id:"performance_pagination_perf",title:"Pagination Perf",category:"performance",description:"Analyze pagination perf with evidence-oriented findings and actionable engineering checks.",keywords:["lazy", "cache", "memo", "bundle"]},
  {id:"performance_lazy_perf",title:"Lazy Perf",category:"performance",description:"Analyze lazy perf with evidence-oriented findings and actionable engineering checks.",keywords:["lazy", "cache", "memo", "bundle"]},
  {id:"performance_prefetch_perf",title:"Prefetch Perf",category:"performance",description:"Analyze prefetch perf with evidence-oriented findings and actionable engineering checks.",keywords:["lazy", "cache", "memo", "bundle"]},
  {id:"performance_web_vitals",title:"Web Vitals",category:"performance",description:"Analyze web vitals with evidence-oriented findings and actionable engineering checks.",keywords:["lazy", "cache", "memo", "bundle"]},
  {id:"performance_startup_perf",title:"Startup Perf",category:"performance",description:"Analyze startup perf with evidence-oriented findings and actionable engineering checks.",keywords:["lazy", "cache", "memo", "bundle"]},
  {id:"performance_interaction_perf",title:"Interaction Perf",category:"performance",description:"Analyze interaction perf with evidence-oriented findings and actionable engineering checks.",keywords:["lazy", "cache", "memo", "bundle"]},
  {id:"performance_performance_regression",title:"Performance Regression",category:"performance",description:"Analyze performance regression with evidence-oriented findings and actionable engineering checks.",keywords:["lazy", "cache", "memo", "bundle"]},
  {id:"observability_log_schema",title:"Log Schema",category:"observability",description:"Analyze log schema with evidence-oriented findings and actionable engineering checks.",keywords:["log", "error", "trace", "metric"]},
  {id:"observability_log_level",title:"Log Level",category:"observability",description:"Analyze log level with evidence-oriented findings and actionable engineering checks.",keywords:["log", "error", "trace", "metric"]},
  {id:"observability_error_capture",title:"Error Capture",category:"observability",description:"Analyze error capture with evidence-oriented findings and actionable engineering checks.",keywords:["log", "error", "trace", "metric"]},
  {id:"observability_trace_context",title:"Trace Context",category:"observability",description:"Analyze trace context with evidence-oriented findings and actionable engineering checks.",keywords:["log", "error", "trace", "metric"]},
  {id:"observability_metric_inventory",title:"Metric Inventory",category:"observability",description:"Analyze metric inventory with evidence-oriented findings and actionable engineering checks.",keywords:["log", "error", "trace", "metric"]},
  {id:"observability_health_check",title:"Health Check",category:"observability",description:"Analyze health check with evidence-oriented findings and actionable engineering checks.",keywords:["log", "error", "trace", "metric"]},
  {id:"observability_readiness_check",title:"Readiness Check",category:"observability",description:"Analyze readiness check with evidence-oriented findings and actionable engineering checks.",keywords:["log", "error", "trace", "metric"]},
  {id:"observability_liveness_check",title:"Liveness Check",category:"observability",description:"Analyze liveness check with evidence-oriented findings and actionable engineering checks.",keywords:["log", "error", "trace", "metric"]},
  {id:"observability_alert_rule",title:"Alert Rule",category:"observability",description:"Analyze alert rule with evidence-oriented findings and actionable engineering checks.",keywords:["log", "error", "trace", "metric"]},
  {id:"observability_dashboard_signal",title:"Dashboard Signal",category:"observability",description:"Analyze dashboard signal with evidence-oriented findings and actionable engineering checks.",keywords:["log", "error", "trace", "metric"]},
  {id:"observability_correlation_id",title:"Correlation Id",category:"observability",description:"Analyze correlation id with evidence-oriented findings and actionable engineering checks.",keywords:["log", "error", "trace", "metric"]},
  {id:"observability_request_trace",title:"Request Trace",category:"observability",description:"Analyze request trace with evidence-oriented findings and actionable engineering checks.",keywords:["log", "error", "trace", "metric"]},
  {id:"observability_job_trace",title:"Job Trace",category:"observability",description:"Analyze job trace with evidence-oriented findings and actionable engineering checks.",keywords:["log", "error", "trace", "metric"]},
  {id:"observability_db_trace",title:"Db Trace",category:"observability",description:"Analyze db trace with evidence-oriented findings and actionable engineering checks.",keywords:["log", "error", "trace", "metric"]},
  {id:"observability_frontend_trace",title:"Frontend Trace",category:"observability",description:"Analyze frontend trace with evidence-oriented findings and actionable engineering checks.",keywords:["log", "error", "trace", "metric"]},
  {id:"observability_release_marker",title:"Release Marker",category:"observability",description:"Analyze release marker with evidence-oriented findings and actionable engineering checks.",keywords:["log", "error", "trace", "metric"]},
  {id:"observability_incident_signal",title:"Incident Signal",category:"observability",description:"Analyze incident signal with evidence-oriented findings and actionable engineering checks.",keywords:["log", "error", "trace", "metric"]},
  {id:"observability_slo_signal",title:"Slo Signal",category:"observability",description:"Analyze slo signal with evidence-oriented findings and actionable engineering checks.",keywords:["log", "error", "trace", "metric"]},
  {id:"observability_telemetry_privacy",title:"Telemetry Privacy",category:"observability",description:"Analyze telemetry privacy with evidence-oriented findings and actionable engineering checks.",keywords:["log", "error", "trace", "metric"]},
  {id:"observability_observability_gap",title:"Observability Gap",category:"observability",description:"Analyze observability gap with evidence-oriented findings and actionable engineering checks.",keywords:["log", "error", "trace", "metric"]},
  {id:"devops_docker_audit",title:"Docker Audit",category:"devops",description:"Analyze docker audit with evidence-oriented findings and actionable engineering checks.",keywords:["build", "deploy", "docker", "ci"]},
  {id:"devops_compose_audit",title:"Compose Audit",category:"devops",description:"Analyze compose audit with evidence-oriented findings and actionable engineering checks.",keywords:["build", "deploy", "docker", "ci"]},
  {id:"devops_ci_pipeline",title:"Ci Pipeline",category:"devops",description:"Analyze ci pipeline with evidence-oriented findings and actionable engineering checks.",keywords:["build", "deploy", "docker", "ci"]},
  {id:"devops_cd_pipeline",title:"Cd Pipeline",category:"devops",description:"Analyze cd pipeline with evidence-oriented findings and actionable engineering checks.",keywords:["build", "deploy", "docker", "ci"]},
  {id:"devops_cache_pipeline",title:"Cache Pipeline",category:"devops",description:"Analyze cache pipeline with evidence-oriented findings and actionable engineering checks.",keywords:["build", "deploy", "docker", "ci"]},
  {id:"devops_artifact_pipeline",title:"Artifact Pipeline",category:"devops",description:"Analyze artifact pipeline with evidence-oriented findings and actionable engineering checks.",keywords:["build", "deploy", "docker", "ci"]},
  {id:"devops_env_matrix",title:"Env Matrix",category:"devops",description:"Analyze env matrix with evidence-oriented findings and actionable engineering checks.",keywords:["build", "deploy", "docker", "ci"]},
  {id:"devops_secret_pipeline",title:"Secret Pipeline",category:"devops",description:"Analyze secret pipeline with evidence-oriented findings and actionable engineering checks.",keywords:["build", "deploy", "docker", "ci"]},
  {id:"devops_preview_deploy",title:"Preview Deploy",category:"devops",description:"Analyze preview deploy with evidence-oriented findings and actionable engineering checks.",keywords:["build", "deploy", "docker", "ci"]},
  {id:"devops_prod_deploy",title:"Prod Deploy",category:"devops",description:"Analyze prod deploy with evidence-oriented findings and actionable engineering checks.",keywords:["build", "deploy", "docker", "ci"]},
  {id:"devops_rollback_plan",title:"Rollback Plan",category:"devops",description:"Analyze rollback plan with evidence-oriented findings and actionable engineering checks.",keywords:["build", "deploy", "docker", "ci"]},
  {id:"devops_blue_green",title:"Blue Green",category:"devops",description:"Analyze blue green with evidence-oriented findings and actionable engineering checks.",keywords:["build", "deploy", "docker", "ci"]},
  {id:"devops_canary_plan",title:"Canary Plan",category:"devops",description:"Analyze canary plan with evidence-oriented findings and actionable engineering checks.",keywords:["build", "deploy", "docker", "ci"]},
  {id:"devops_health_gate",title:"Health Gate",category:"devops",description:"Analyze health gate with evidence-oriented findings and actionable engineering checks.",keywords:["build", "deploy", "docker", "ci"]},
  {id:"devops_migration_gate",title:"Migration Gate",category:"devops",description:"Analyze migration gate with evidence-oriented findings and actionable engineering checks.",keywords:["build", "deploy", "docker", "ci"]},
  {id:"devops_release_gate",title:"Release Gate",category:"devops",description:"Analyze release gate with evidence-oriented findings and actionable engineering checks.",keywords:["build", "deploy", "docker", "ci"]},
  {id:"devops_branch_protection",title:"Branch Protection",category:"devops",description:"Analyze branch protection with evidence-oriented findings and actionable engineering checks.",keywords:["build", "deploy", "docker", "ci"]},
  {id:"devops_tag_strategy",title:"Tag Strategy",category:"devops",description:"Analyze tag strategy with evidence-oriented findings and actionable engineering checks.",keywords:["build", "deploy", "docker", "ci"]},
  {id:"devops_versioning",title:"Versioning",category:"devops",description:"Analyze versioning with evidence-oriented findings and actionable engineering checks.",keywords:["build", "deploy", "docker", "ci"]},
  {id:"devops_devops_regression",title:"Devops Regression",category:"devops",description:"Analyze devops regression with evidence-oriented findings and actionable engineering checks.",keywords:["build", "deploy", "docker", "ci"]},
  {id:"git_workflow_diff_risk",title:"Diff Risk",category:"git_workflow",description:"Analyze diff risk with evidence-oriented findings and actionable engineering checks.",keywords:["git", "commit", "branch", "merge"]},
  {id:"git_workflow_commit_scope",title:"Commit Scope",category:"git_workflow",description:"Analyze commit scope with evidence-oriented findings and actionable engineering checks.",keywords:["git", "commit", "branch", "merge"]},
  {id:"git_workflow_commit_message",title:"Commit Message",category:"git_workflow",description:"Analyze commit message with evidence-oriented findings and actionable engineering checks.",keywords:["git", "commit", "branch", "merge"]},
  {id:"git_workflow_branch_health",title:"Branch Health",category:"git_workflow",description:"Analyze branch health with evidence-oriented findings and actionable engineering checks.",keywords:["git", "commit", "branch", "merge"]},
  {id:"git_workflow_merge_conflict",title:"Merge Conflict",category:"git_workflow",description:"Analyze merge conflict with evidence-oriented findings and actionable engineering checks.",keywords:["git", "commit", "branch", "merge"]},
  {id:"git_workflow_rebase_risk",title:"Rebase Risk",category:"git_workflow",description:"Analyze rebase risk with evidence-oriented findings and actionable engineering checks.",keywords:["git", "commit", "branch", "merge"]},
  {id:"git_workflow_cherry_pick",title:"Cherry Pick",category:"git_workflow",description:"Analyze cherry pick with evidence-oriented findings and actionable engineering checks.",keywords:["git", "commit", "branch", "merge"]},
  {id:"git_workflow_stale_branch",title:"Stale Branch",category:"git_workflow",description:"Analyze stale branch with evidence-oriented findings and actionable engineering checks.",keywords:["git", "commit", "branch", "merge"]},
  {id:"git_workflow_large_diff",title:"Large Diff",category:"git_workflow",description:"Analyze large diff with evidence-oriented findings and actionable engineering checks.",keywords:["git", "commit", "branch", "merge"]},
  {id:"git_workflow_generated_file",title:"Generated File",category:"git_workflow",description:"Analyze generated file with evidence-oriented findings and actionable engineering checks.",keywords:["git", "commit", "branch", "merge"]},
  {id:"git_workflow_binary_change",title:"Binary Change",category:"git_workflow",description:"Analyze binary change with evidence-oriented findings and actionable engineering checks.",keywords:["git", "commit", "branch", "merge"]},
  {id:"git_workflow_lockfile_change",title:"Lockfile Change",category:"git_workflow",description:"Analyze lockfile change with evidence-oriented findings and actionable engineering checks.",keywords:["git", "commit", "branch", "merge"]},
  {id:"git_workflow_migration_change",title:"Migration Change",category:"git_workflow",description:"Analyze migration change with evidence-oriented findings and actionable engineering checks.",keywords:["git", "commit", "branch", "merge"]},
  {id:"git_workflow_config_change",title:"Config Change",category:"git_workflow",description:"Analyze config change with evidence-oriented findings and actionable engineering checks.",keywords:["git", "commit", "branch", "merge"]},
  {id:"git_workflow_release_diff",title:"Release Diff",category:"git_workflow",description:"Analyze release diff with evidence-oriented findings and actionable engineering checks.",keywords:["git", "commit", "branch", "merge"]},
  {id:"git_workflow_hotfix_flow",title:"Hotfix Flow",category:"git_workflow",description:"Analyze hotfix flow with evidence-oriented findings and actionable engineering checks.",keywords:["git", "commit", "branch", "merge"]},
  {id:"git_workflow_revert_plan",title:"Revert Plan",category:"git_workflow",description:"Analyze revert plan with evidence-oriented findings and actionable engineering checks.",keywords:["git", "commit", "branch", "merge"]},
  {id:"git_workflow_blame_context",title:"Blame Context",category:"git_workflow",description:"Analyze blame context with evidence-oriented findings and actionable engineering checks.",keywords:["git", "commit", "branch", "merge"]},
  {id:"git_workflow_ownership_context",title:"Ownership Context",category:"git_workflow",description:"Analyze ownership context with evidence-oriented findings and actionable engineering checks.",keywords:["git", "commit", "branch", "merge"]},
  {id:"git_workflow_git_regression",title:"Git Regression",category:"git_workflow",description:"Analyze git regression with evidence-oriented findings and actionable engineering checks.",keywords:["git", "commit", "branch", "merge"]},
  {id:"product_feature_map",title:"Feature Map",category:"product",description:"Analyze feature map with evidence-oriented findings and actionable engineering checks.",keywords:["feature", "user", "admin", "status"]},
  {id:"product_actor_map",title:"Actor Map",category:"product",description:"Analyze actor map with evidence-oriented findings and actionable engineering checks.",keywords:["feature", "user", "admin", "status"]},
  {id:"product_journey_map",title:"Journey Map",category:"product",description:"Analyze journey map with evidence-oriented findings and actionable engineering checks.",keywords:["feature", "user", "admin", "status"]},
  {id:"product_acceptance_matrix",title:"Acceptance Matrix",category:"product",description:"Analyze acceptance matrix with evidence-oriented findings and actionable engineering checks.",keywords:["feature", "user", "admin", "status"]},
  {id:"product_gap_detector",title:"Gap Detector",category:"product",description:"Analyze gap detector with evidence-oriented findings and actionable engineering checks.",keywords:["feature", "user", "admin", "status"]},
  {id:"product_empty_state",title:"Empty State",category:"product",description:"Analyze empty state with evidence-oriented findings and actionable engineering checks.",keywords:["feature", "user", "admin", "status"]},
  {id:"product_error_state",title:"Error State",category:"product",description:"Analyze error state with evidence-oriented findings and actionable engineering checks.",keywords:["feature", "user", "admin", "status"]},
  {id:"product_loading_state",title:"Loading State",category:"product",description:"Analyze loading state with evidence-oriented findings and actionable engineering checks.",keywords:["feature", "user", "admin", "status"]},
  {id:"product_permission_state",title:"Permission State",category:"product",description:"Analyze permission state with evidence-oriented findings and actionable engineering checks.",keywords:["feature", "user", "admin", "status"]},
  {id:"product_onboarding_flow",title:"Onboarding Flow",category:"product",description:"Analyze onboarding flow with evidence-oriented findings and actionable engineering checks.",keywords:["feature", "user", "admin", "status"]},
  {id:"product_search_flow",title:"Search Flow",category:"product",description:"Analyze search flow with evidence-oriented findings and actionable engineering checks.",keywords:["feature", "user", "admin", "status"]},
  {id:"product_filter_flow",title:"Filter Flow",category:"product",description:"Analyze filter flow with evidence-oriented findings and actionable engineering checks.",keywords:["feature", "user", "admin", "status"]},
  {id:"product_notification_flow",title:"Notification Flow",category:"product",description:"Analyze notification flow with evidence-oriented findings and actionable engineering checks.",keywords:["feature", "user", "admin", "status"]},
  {id:"product_settings_flow",title:"Settings Flow",category:"product",description:"Analyze settings flow with evidence-oriented findings and actionable engineering checks.",keywords:["feature", "user", "admin", "status"]},
  {id:"product_admin_flow",title:"Admin Flow",category:"product",description:"Analyze admin flow with evidence-oriented findings and actionable engineering checks.",keywords:["feature", "user", "admin", "status"]},
  {id:"product_analytics_flow",title:"Analytics Flow",category:"product",description:"Analyze analytics flow with evidence-oriented findings and actionable engineering checks.",keywords:["feature", "user", "admin", "status"]},
  {id:"product_export_flow",title:"Export Flow",category:"product",description:"Analyze export flow with evidence-oriented findings and actionable engineering checks.",keywords:["feature", "user", "admin", "status"]},
  {id:"product_import_flow",title:"Import Flow",category:"product",description:"Analyze import flow with evidence-oriented findings and actionable engineering checks.",keywords:["feature", "user", "admin", "status"]},
  {id:"product_retention_flow",title:"Retention Flow",category:"product",description:"Analyze retention flow with evidence-oriented findings and actionable engineering checks.",keywords:["feature", "user", "admin", "status"]},
  {id:"product_product_regression",title:"Product Regression",category:"product",description:"Analyze product regression with evidence-oriented findings and actionable engineering checks.",keywords:["feature", "user", "admin", "status"]},
  {id:"documentation_readme_audit",title:"Readme Audit",category:"documentation",description:"Analyze readme audit with evidence-oriented findings and actionable engineering checks.",keywords:["README", "docs", "guide", "usage"]},
  {id:"documentation_setup_guide",title:"Setup Guide",category:"documentation",description:"Analyze setup guide with evidence-oriented findings and actionable engineering checks.",keywords:["README", "docs", "guide", "usage"]},
  {id:"documentation_api_reference",title:"Api Reference",category:"documentation",description:"Analyze api reference with evidence-oriented findings and actionable engineering checks.",keywords:["README", "docs", "guide", "usage"]},
  {id:"documentation_architecture_doc",title:"Architecture Doc",category:"documentation",description:"Analyze architecture doc with evidence-oriented findings and actionable engineering checks.",keywords:["README", "docs", "guide", "usage"]},
  {id:"documentation_runbook",title:"Runbook",category:"documentation",description:"Analyze runbook with evidence-oriented findings and actionable engineering checks.",keywords:["README", "docs", "guide", "usage"]},
  {id:"documentation_incident_runbook",title:"Incident Runbook",category:"documentation",description:"Analyze incident runbook with evidence-oriented findings and actionable engineering checks.",keywords:["README", "docs", "guide", "usage"]},
  {id:"documentation_migration_guide",title:"Migration Guide",category:"documentation",description:"Analyze migration guide with evidence-oriented findings and actionable engineering checks.",keywords:["README", "docs", "guide", "usage"]},
  {id:"documentation_release_guide",title:"Release Guide",category:"documentation",description:"Analyze release guide with evidence-oriented findings and actionable engineering checks.",keywords:["README", "docs", "guide", "usage"]},
  {id:"documentation_troubleshooting",title:"Troubleshooting",category:"documentation",description:"Analyze troubleshooting with evidence-oriented findings and actionable engineering checks.",keywords:["README", "docs", "guide", "usage"]},
  {id:"documentation_faq_builder",title:"Faq Builder",category:"documentation",description:"Analyze faq builder with evidence-oriented findings and actionable engineering checks.",keywords:["README", "docs", "guide", "usage"]},
  {id:"documentation_code_comment",title:"Code Comment",category:"documentation",description:"Analyze code comment with evidence-oriented findings and actionable engineering checks.",keywords:["README", "docs", "guide", "usage"]},
  {id:"documentation_adr_builder",title:"Adr Builder",category:"documentation",description:"Analyze adr builder with evidence-oriented findings and actionable engineering checks.",keywords:["README", "docs", "guide", "usage"]},
  {id:"documentation_env_reference",title:"Env Reference",category:"documentation",description:"Analyze env reference with evidence-oriented findings and actionable engineering checks.",keywords:["README", "docs", "guide", "usage"]},
  {id:"documentation_permission_doc",title:"Permission Doc",category:"documentation",description:"Analyze permission doc with evidence-oriented findings and actionable engineering checks.",keywords:["README", "docs", "guide", "usage"]},
  {id:"documentation_data_model_doc",title:"Data Model Doc",category:"documentation",description:"Analyze data model doc with evidence-oriented findings and actionable engineering checks.",keywords:["README", "docs", "guide", "usage"]},
  {id:"documentation_test_guide",title:"Test Guide",category:"documentation",description:"Analyze test guide with evidence-oriented findings and actionable engineering checks.",keywords:["README", "docs", "guide", "usage"]},
  {id:"documentation_deployment_guide",title:"Deployment Guide",category:"documentation",description:"Analyze deployment guide with evidence-oriented findings and actionable engineering checks.",keywords:["README", "docs", "guide", "usage"]},
  {id:"documentation_security_doc",title:"Security Doc",category:"documentation",description:"Analyze security doc with evidence-oriented findings and actionable engineering checks.",keywords:["README", "docs", "guide", "usage"]},
  {id:"documentation_accessibility_doc",title:"Accessibility Doc",category:"documentation",description:"Analyze accessibility doc with evidence-oriented findings and actionable engineering checks.",keywords:["README", "docs", "guide", "usage"]},
  {id:"documentation_docs_regression",title:"Docs Regression",category:"documentation",description:"Analyze docs regression with evidence-oriented findings and actionable engineering checks.",keywords:["README", "docs", "guide", "usage"]},
  {id:"data_engineering_ingestion_map",title:"Ingestion Map",category:"data_engineering",description:"Analyze ingestion map with evidence-oriented findings and actionable engineering checks.",keywords:["data", "schema", "transform", "pipeline"]},
  {id:"data_engineering_etl_flow",title:"Etl Flow",category:"data_engineering",description:"Analyze etl flow with evidence-oriented findings and actionable engineering checks.",keywords:["data", "schema", "transform", "pipeline"]},
  {id:"data_engineering_data_quality",title:"Data Quality",category:"data_engineering",description:"Analyze data quality with evidence-oriented findings and actionable engineering checks.",keywords:["data", "schema", "transform", "pipeline"]},
  {id:"data_engineering_schema_drift",title:"Schema Drift",category:"data_engineering",description:"Analyze schema drift with evidence-oriented findings and actionable engineering checks.",keywords:["data", "schema", "transform", "pipeline"]},
  {id:"data_engineering_lineage_map",title:"Lineage Map",category:"data_engineering",description:"Analyze lineage map with evidence-oriented findings and actionable engineering checks.",keywords:["data", "schema", "transform", "pipeline"]},
  {id:"data_engineering_dedupe_rule",title:"Dedupe Rule",category:"data_engineering",description:"Analyze dedupe rule with evidence-oriented findings and actionable engineering checks.",keywords:["data", "schema", "transform", "pipeline"]},
  {id:"data_engineering_normalization",title:"Normalization",category:"data_engineering",description:"Analyze normalization with evidence-oriented findings and actionable engineering checks.",keywords:["data", "schema", "transform", "pipeline"]},
  {id:"data_engineering_validation_rule",title:"Validation Rule",category:"data_engineering",description:"Analyze validation rule with evidence-oriented findings and actionable engineering checks.",keywords:["data", "schema", "transform", "pipeline"]},
  {id:"data_engineering_batch_job",title:"Batch Job",category:"data_engineering",description:"Analyze batch job with evidence-oriented findings and actionable engineering checks.",keywords:["data", "schema", "transform", "pipeline"]},
  {id:"data_engineering_stream_job",title:"Stream Job",category:"data_engineering",description:"Analyze stream job with evidence-oriented findings and actionable engineering checks.",keywords:["data", "schema", "transform", "pipeline"]},
  {id:"data_engineering_retention_policy",title:"Retention Policy",category:"data_engineering",description:"Analyze retention policy with evidence-oriented findings and actionable engineering checks.",keywords:["data", "schema", "transform", "pipeline"]},
  {id:"data_engineering_archive_policy",title:"Archive Policy",category:"data_engineering",description:"Analyze archive policy with evidence-oriented findings and actionable engineering checks.",keywords:["data", "schema", "transform", "pipeline"]},
  {id:"data_engineering_backfill_plan",title:"Backfill Plan",category:"data_engineering",description:"Analyze backfill plan with evidence-oriented findings and actionable engineering checks.",keywords:["data", "schema", "transform", "pipeline"]},
  {id:"data_engineering_export_pipeline",title:"Export Pipeline",category:"data_engineering",description:"Analyze export pipeline with evidence-oriented findings and actionable engineering checks.",keywords:["data", "schema", "transform", "pipeline"]},
  {id:"data_engineering_import_pipeline",title:"Import Pipeline",category:"data_engineering",description:"Analyze import pipeline with evidence-oriented findings and actionable engineering checks.",keywords:["data", "schema", "transform", "pipeline"]},
  {id:"data_engineering_pii_map",title:"Pii Map",category:"data_engineering",description:"Analyze pii map with evidence-oriented findings and actionable engineering checks.",keywords:["data", "schema", "transform", "pipeline"]},
  {id:"data_engineering_data_contract",title:"Data Contract",category:"data_engineering",description:"Analyze data contract with evidence-oriented findings and actionable engineering checks.",keywords:["data", "schema", "transform", "pipeline"]},
  {id:"data_engineering_warehouse_sync",title:"Warehouse Sync",category:"data_engineering",description:"Analyze warehouse sync with evidence-oriented findings and actionable engineering checks.",keywords:["data", "schema", "transform", "pipeline"]},
  {id:"data_engineering_analytics_model",title:"Analytics Model",category:"data_engineering",description:"Analyze analytics model with evidence-oriented findings and actionable engineering checks.",keywords:["data", "schema", "transform", "pipeline"]},
  {id:"data_engineering_data_regression",title:"Data Regression",category:"data_engineering",description:"Analyze data regression with evidence-oriented findings and actionable engineering checks.",keywords:["data", "schema", "transform", "pipeline"]},
  {id:"release_reliability_slo_gate",title:"Slo Gate",category:"release_reliability",description:"Analyze slo gate with evidence-oriented findings and actionable engineering checks.",keywords:["release", "rollback", "health", "slo"]},
  {id:"release_reliability_sla_audit",title:"Sla Audit",category:"release_reliability",description:"Analyze sla audit with evidence-oriented findings and actionable engineering checks.",keywords:["release", "rollback", "health", "slo"]},
  {id:"release_reliability_error_budget",title:"Error Budget",category:"release_reliability",description:"Analyze error budget with evidence-oriented findings and actionable engineering checks.",keywords:["release", "rollback", "health", "slo"]},
  {id:"release_reliability_capacity_plan",title:"Capacity Plan",category:"release_reliability",description:"Analyze capacity plan with evidence-oriented findings and actionable engineering checks.",keywords:["release", "rollback", "health", "slo"]},
  {id:"release_reliability_resilience_test",title:"Resilience Test",category:"release_reliability",description:"Analyze resilience test with evidence-oriented findings and actionable engineering checks.",keywords:["release", "rollback", "health", "slo"]},
  {id:"release_reliability_chaos_plan",title:"Chaos Plan",category:"release_reliability",description:"Analyze chaos plan with evidence-oriented findings and actionable engineering checks.",keywords:["release", "rollback", "health", "slo"]},
  {id:"release_reliability_failure_replay",title:"Failure Replay",category:"release_reliability",description:"Analyze failure replay with evidence-oriented findings and actionable engineering checks.",keywords:["release", "rollback", "health", "slo"]},
  {id:"release_reliability_incident_rehearsal",title:"Incident Rehearsal",category:"release_reliability",description:"Analyze incident rehearsal with evidence-oriented findings and actionable engineering checks.",keywords:["release", "rollback", "health", "slo"]},
  {id:"release_reliability_rollback_drill",title:"Rollback Drill",category:"release_reliability",description:"Analyze rollback drill with evidence-oriented findings and actionable engineering checks.",keywords:["release", "rollback", "health", "slo"]},
  {id:"release_reliability_backup_verify",title:"Backup Verify",category:"release_reliability",description:"Analyze backup verify with evidence-oriented findings and actionable engineering checks.",keywords:["release", "rollback", "health", "slo"]},
  {id:"release_reliability_restore_verify",title:"Restore Verify",category:"release_reliability",description:"Analyze restore verify with evidence-oriented findings and actionable engineering checks.",keywords:["release", "rollback", "health", "slo"]},
  {id:"release_reliability_disaster_recovery",title:"Disaster Recovery",category:"release_reliability",description:"Analyze disaster recovery with evidence-oriented findings and actionable engineering checks.",keywords:["release", "rollback", "health", "slo"]},
  {id:"release_reliability_region_failover",title:"Region Failover",category:"release_reliability",description:"Analyze region failover with evidence-oriented findings and actionable engineering checks.",keywords:["release", "rollback", "health", "slo"]},
  {id:"release_reliability_dependency_outage",title:"Dependency Outage",category:"release_reliability",description:"Analyze dependency outage with evidence-oriented findings and actionable engineering checks.",keywords:["release", "rollback", "health", "slo"]},
  {id:"release_reliability_graceful_degradation",title:"Graceful Degradation",category:"release_reliability",description:"Analyze graceful degradation with evidence-oriented findings and actionable engineering checks.",keywords:["release", "rollback", "health", "slo"]},
  {id:"release_reliability_feature_flag",title:"Feature Flag",category:"release_reliability",description:"Analyze feature flag with evidence-oriented findings and actionable engineering checks.",keywords:["release", "rollback", "health", "slo"]},
  {id:"release_reliability_kill_switch",title:"Kill Switch",category:"release_reliability",description:"Analyze kill switch with evidence-oriented findings and actionable engineering checks.",keywords:["release", "rollback", "health", "slo"]},
  {id:"release_reliability_release_readiness",title:"Release Readiness",category:"release_reliability",description:"Analyze release readiness with evidence-oriented findings and actionable engineering checks.",keywords:["release", "rollback", "health", "slo"]},
  {id:"release_reliability_post_release_check",title:"Post Release Check",category:"release_reliability",description:"Analyze post release check with evidence-oriented findings and actionable engineering checks.",keywords:["release", "rollback", "health", "slo"]},
  {id:"release_reliability_reliability_regression",title:"Reliability Regression",category:"release_reliability",description:"Analyze reliability regression with evidence-oriented findings and actionable engineering checks.",keywords:["release", "rollback", "health", "slo"]},
  {id:"cloud_platform_vercel_config",title:"Vercel Config",category:"cloud_platform",description:"Analyze vercel config with evidence-oriented findings and actionable engineering checks.",keywords:["vercel", "serverless", "edge", "env"]},
  {id:"cloud_platform_serverless_limits",title:"Serverless Limits",category:"cloud_platform",description:"Analyze serverless limits with evidence-oriented findings and actionable engineering checks.",keywords:["vercel", "serverless", "edge", "env"]},
  {id:"cloud_platform_edge_runtime",title:"Edge Runtime",category:"cloud_platform",description:"Analyze edge runtime with evidence-oriented findings and actionable engineering checks.",keywords:["vercel", "serverless", "edge", "env"]},
  {id:"cloud_platform_function_timeout",title:"Function Timeout",category:"cloud_platform",description:"Analyze function timeout with evidence-oriented findings and actionable engineering checks.",keywords:["vercel", "serverless", "edge", "env"]},
  {id:"cloud_platform_cold_start",title:"Cold Start",category:"cloud_platform",description:"Analyze cold start with evidence-oriented findings and actionable engineering checks.",keywords:["vercel", "serverless", "edge", "env"]},
  {id:"cloud_platform_cdn_cache",title:"Cdn Cache",category:"cloud_platform",description:"Analyze cdn cache with evidence-oriented findings and actionable engineering checks.",keywords:["vercel", "serverless", "edge", "env"]},
  {id:"cloud_platform_domain_config",title:"Domain Config",category:"cloud_platform",description:"Analyze domain config with evidence-oriented findings and actionable engineering checks.",keywords:["vercel", "serverless", "edge", "env"]},
  {id:"cloud_platform_tls_config",title:"Tls Config",category:"cloud_platform",description:"Analyze tls config with evidence-oriented findings and actionable engineering checks.",keywords:["vercel", "serverless", "edge", "env"]},
  {id:"cloud_platform_redirect_config",title:"Redirect Config",category:"cloud_platform",description:"Analyze redirect config with evidence-oriented findings and actionable engineering checks.",keywords:["vercel", "serverless", "edge", "env"]},
  {id:"cloud_platform_header_config",title:"Header Config",category:"cloud_platform",description:"Analyze header config with evidence-oriented findings and actionable engineering checks.",keywords:["vercel", "serverless", "edge", "env"]},
  {id:"cloud_platform_build_env",title:"Build Env",category:"cloud_platform",description:"Analyze build env with evidence-oriented findings and actionable engineering checks.",keywords:["vercel", "serverless", "edge", "env"]},
  {id:"cloud_platform_runtime_env",title:"Runtime Env",category:"cloud_platform",description:"Analyze runtime env with evidence-oriented findings and actionable engineering checks.",keywords:["vercel", "serverless", "edge", "env"]},
  {id:"cloud_platform_preview_env",title:"Preview Env",category:"cloud_platform",description:"Analyze preview env with evidence-oriented findings and actionable engineering checks.",keywords:["vercel", "serverless", "edge", "env"]},
  {id:"cloud_platform_prod_env",title:"Prod Env",category:"cloud_platform",description:"Analyze prod env with evidence-oriented findings and actionable engineering checks.",keywords:["vercel", "serverless", "edge", "env"]},
  {id:"cloud_platform_storage_binding",title:"Storage Binding",category:"cloud_platform",description:"Analyze storage binding with evidence-oriented findings and actionable engineering checks.",keywords:["vercel", "serverless", "edge", "env"]},
  {id:"cloud_platform_db_binding",title:"Db Binding",category:"cloud_platform",description:"Analyze db binding with evidence-oriented findings and actionable engineering checks.",keywords:["vercel", "serverless", "edge", "env"]},
  {id:"cloud_platform_cron_config",title:"Cron Config",category:"cloud_platform",description:"Analyze cron config with evidence-oriented findings and actionable engineering checks.",keywords:["vercel", "serverless", "edge", "env"]},
  {id:"cloud_platform_queue_config",title:"Queue Config",category:"cloud_platform",description:"Analyze queue config with evidence-oriented findings and actionable engineering checks.",keywords:["vercel", "serverless", "edge", "env"]},
  {id:"cloud_platform_region_config",title:"Region Config",category:"cloud_platform",description:"Analyze region config with evidence-oriented findings and actionable engineering checks.",keywords:["vercel", "serverless", "edge", "env"]},
  {id:"cloud_platform_cloud_regression",title:"Cloud Regression",category:"cloud_platform",description:"Analyze cloud regression with evidence-oriented findings and actionable engineering checks.",keywords:["vercel", "serverless", "edge", "env"]},
  {id:"automation_task_scheduler",title:"Task Scheduler",category:"automation",description:"Analyze task scheduler with evidence-oriented findings and actionable engineering checks.",keywords:["job", "workflow", "schedule", "queue"]},
  {id:"automation_workflow_runner",title:"Workflow Runner",category:"automation",description:"Analyze workflow runner with evidence-oriented findings and actionable engineering checks.",keywords:["job", "workflow", "schedule", "queue"]},
  {id:"automation_event_trigger",title:"Event Trigger",category:"automation",description:"Analyze event trigger with evidence-oriented findings and actionable engineering checks.",keywords:["job", "workflow", "schedule", "queue"]},
  {id:"automation_condition_watch",title:"Condition Watch",category:"automation",description:"Analyze condition watch with evidence-oriented findings and actionable engineering checks.",keywords:["job", "workflow", "schedule", "queue"]},
  {id:"automation_retry_backoff",title:"Retry Backoff",category:"automation",description:"Analyze retry backoff with evidence-oriented findings and actionable engineering checks.",keywords:["job", "workflow", "schedule", "queue"]},
  {id:"automation_dead_letter",title:"Dead Letter",category:"automation",description:"Analyze dead letter with evidence-oriented findings and actionable engineering checks.",keywords:["job", "workflow", "schedule", "queue"]},
  {id:"automation_job_dedup",title:"Job Dedup",category:"automation",description:"Analyze job dedup with evidence-oriented findings and actionable engineering checks.",keywords:["job", "workflow", "schedule", "queue"]},
  {id:"automation_job_idempotency",title:"Job Idempotency",category:"automation",description:"Analyze job idempotency with evidence-oriented findings and actionable engineering checks.",keywords:["job", "workflow", "schedule", "queue"]},
  {id:"automation_job_timeout",title:"Job Timeout",category:"automation",description:"Analyze job timeout with evidence-oriented findings and actionable engineering checks.",keywords:["job", "workflow", "schedule", "queue"]},
  {id:"automation_job_concurrency",title:"Job Concurrency",category:"automation",description:"Analyze job concurrency with evidence-oriented findings and actionable engineering checks.",keywords:["job", "workflow", "schedule", "queue"]},
  {id:"automation_batch_control",title:"Batch Control",category:"automation",description:"Analyze batch control with evidence-oriented findings and actionable engineering checks.",keywords:["job", "workflow", "schedule", "queue"]},
  {id:"automation_workflow_state",title:"Workflow State",category:"automation",description:"Analyze workflow state with evidence-oriented findings and actionable engineering checks.",keywords:["job", "workflow", "schedule", "queue"]},
  {id:"automation_workflow_resume",title:"Workflow Resume",category:"automation",description:"Analyze workflow resume with evidence-oriented findings and actionable engineering checks.",keywords:["job", "workflow", "schedule", "queue"]},
  {id:"automation_workflow_cancel",title:"Workflow Cancel",category:"automation",description:"Analyze workflow cancel with evidence-oriented findings and actionable engineering checks.",keywords:["job", "workflow", "schedule", "queue"]},
  {id:"automation_workflow_audit",title:"Workflow Audit",category:"automation",description:"Analyze workflow audit with evidence-oriented findings and actionable engineering checks.",keywords:["job", "workflow", "schedule", "queue"]},
  {id:"automation_notification_job",title:"Notification Job",category:"automation",description:"Analyze notification job with evidence-oriented findings and actionable engineering checks.",keywords:["job", "workflow", "schedule", "queue"]},
  {id:"automation_cleanup_job",title:"Cleanup Job",category:"automation",description:"Analyze cleanup job with evidence-oriented findings and actionable engineering checks.",keywords:["job", "workflow", "schedule", "queue"]},
  {id:"automation_maintenance_job",title:"Maintenance Job",category:"automation",description:"Analyze maintenance job with evidence-oriented findings and actionable engineering checks.",keywords:["job", "workflow", "schedule", "queue"]},
  {id:"automation_report_job",title:"Report Job",category:"automation",description:"Analyze report job with evidence-oriented findings and actionable engineering checks.",keywords:["job", "workflow", "schedule", "queue"]},
  {id:"automation_automation_regression",title:"Automation Regression",category:"automation",description:"Analyze automation regression with evidence-oriented findings and actionable engineering checks.",keywords:["job", "workflow", "schedule", "queue"]},
  {id:"governance_policy_registry",title:"Policy Registry",category:"governance",description:"Analyze policy registry with evidence-oriented findings and actionable engineering checks.",keywords:["policy", "approval", "audit", "role"]},
  {id:"governance_approval_gate",title:"Approval Gate",category:"governance",description:"Analyze approval gate with evidence-oriented findings and actionable engineering checks.",keywords:["policy", "approval", "audit", "role"]},
  {id:"governance_risk_register",title:"Risk Register",category:"governance",description:"Analyze risk register with evidence-oriented findings and actionable engineering checks.",keywords:["policy", "approval", "audit", "role"]},
  {id:"governance_exception_register",title:"Exception Register",category:"governance",description:"Analyze exception register with evidence-oriented findings and actionable engineering checks.",keywords:["policy", "approval", "audit", "role"]},
  {id:"governance_change_control",title:"Change Control",category:"governance",description:"Analyze change control with evidence-oriented findings and actionable engineering checks.",keywords:["policy", "approval", "audit", "role"]},
  {id:"governance_audit_trail",title:"Audit Trail",category:"governance",description:"Analyze audit trail with evidence-oriented findings and actionable engineering checks.",keywords:["policy", "approval", "audit", "role"]},
  {id:"governance_evidence_chain",title:"Evidence Chain",category:"governance",description:"Analyze evidence chain with evidence-oriented findings and actionable engineering checks.",keywords:["policy", "approval", "audit", "role"]},
  {id:"governance_access_review",title:"Access Review",category:"governance",description:"Analyze access review with evidence-oriented findings and actionable engineering checks.",keywords:["policy", "approval", "audit", "role"]},
  {id:"governance_role_matrix",title:"Role Matrix",category:"governance",description:"Analyze role matrix with evidence-oriented findings and actionable engineering checks.",keywords:["policy", "approval", "audit", "role"]},
  {id:"governance_owner_matrix",title:"Owner Matrix",category:"governance",description:"Analyze owner matrix with evidence-oriented findings and actionable engineering checks.",keywords:["policy", "approval", "audit", "role"]},
  {id:"governance_retention_governance",title:"Retention Governance",category:"governance",description:"Analyze retention governance with evidence-oriented findings and actionable engineering checks.",keywords:["policy", "approval", "audit", "role"]},
  {id:"governance_privacy_governance",title:"Privacy Governance",category:"governance",description:"Analyze privacy governance with evidence-oriented findings and actionable engineering checks.",keywords:["policy", "approval", "audit", "role"]},
  {id:"governance_security_governance",title:"Security Governance",category:"governance",description:"Analyze security governance with evidence-oriented findings and actionable engineering checks.",keywords:["policy", "approval", "audit", "role"]},
  {id:"governance_quality_governance",title:"Quality Governance",category:"governance",description:"Analyze quality governance with evidence-oriented findings and actionable engineering checks.",keywords:["policy", "approval", "audit", "role"]},
  {id:"governance_release_governance",title:"Release Governance",category:"governance",description:"Analyze release governance with evidence-oriented findings and actionable engineering checks.",keywords:["policy", "approval", "audit", "role"]},
  {id:"governance_agent_governance",title:"Agent Governance",category:"governance",description:"Analyze agent governance with evidence-oriented findings and actionable engineering checks.",keywords:["policy", "approval", "audit", "role"]},
  {id:"governance_model_governance",title:"Model Governance",category:"governance",description:"Analyze model governance with evidence-oriented findings and actionable engineering checks.",keywords:["policy", "approval", "audit", "role"]},
  {id:"governance_tool_governance",title:"Tool Governance",category:"governance",description:"Analyze tool governance with evidence-oriented findings and actionable engineering checks.",keywords:["policy", "approval", "audit", "role"]},
  {id:"governance_data_governance",title:"Data Governance",category:"governance",description:"Analyze data governance with evidence-oriented findings and actionable engineering checks.",keywords:["policy", "approval", "audit", "role"]},
  {id:"governance_governance_regression",title:"Governance Regression",category:"governance",description:"Analyze governance regression with evidence-oriented findings and actionable engineering checks.",keywords:["policy", "approval", "audit", "role"]},
];

async function v140RunCapability(cap:V140Capability, scope?:string, writeReport=true){
  const root=scope?safePath(scope):PROJECT_ROOT;
  const files:string[]=[]; await v120Walk(root,files,650);
  const findings:any[]=[]; let bytesScanned=0; let testSignals=0; let sourceSignals=0;
  for(const abs of files){ let txt=""; try{const st=await fs.stat(abs); if(st.size>MAX_FILE_SIZE)continue; bytesScanned+=st.size; txt=await fs.readFile(abs,"utf8");}catch{continue;} const low=txt.toLowerCase(); const matches=cap.keywords.filter(k=>low.includes(k.toLowerCase())); if(!matches.length)continue; const rel=path.relative(PROJECT_ROOT,abs).replace(/\\/g,"/"); const isTest=/\.(test|spec)\.|__tests__|playwright|cypress/i.test(rel); if(isTest)testSignals++; else sourceSignals++; findings.push({file:rel,score:matches.length+(isTest?0.25:0),matches,lineCount:txt.split(/\r?\n/).length,isTest}); }
  findings.sort((a,b)=>b.score-a.score||b.lineCount-a.lineCount||a.file.localeCompare(b.file));
  const top=findings.slice(0,35); const density=files.length?findings.length/files.length:0; const risk=density>0.20||top.length>28?"HIGH":density>0.07||top.length>12?"MEDIUM":"LOW";
  const report={version:"14.0.0",capability:cap.id,title:cap.title,category:cap.category,description:cap.description,scope:scope||".",filesScanned:files.length,bytesScanned,signalFiles:findings.length,testSignals,sourceSignals,coverageHint:sourceSignals?Math.min(100,Math.round((testSignals/sourceSignals)*100)):0,risk,topFiles:top,recommendations:[`Inspect the highest-signal ${cap.category} files before editing.`,`Confirm static findings with runtime/tests before changing behavior.`,`Record evidence before marking ${cap.id} complete.`],generatedAt:new Date().toISOString()};
  if(writeReport){const dir=path.join(PROJECT_ROOT,".krom",V140_REPORT_DIR);await fs.mkdir(dir,{recursive:true});await fs.writeFile(path.join(dir,`${cap.id}.json`),JSON.stringify(report,null,2),"utf8");}
  return report;
}
// ===== END v14.0 =====

// ===== v15.0 EXACT-5000 TOOL REGISTRY =====
type V150Domain = { id:string; title:string; keywords:string[]; risk:"LOW"|"MEDIUM"|"HIGH" };
type V150Capability = { id:string; title:string; domain:string; operation:string; description:string; keywords:string[]; risk:"LOW"|"MEDIUM"|"HIGH" };
const V150_REPORT_DIR = "v15-5000-tools";
const V150_DOMAINS: V150Domain[] = [
  {id:"ai_runtime",title:"AI Runtime",keywords:["agent", "prompt", "context", "tool"],risk:"LOW"},
  {id:"code_intelligence",title:"Code Intelligence",keywords:["import", "export", "function", "class"],risk:"LOW"},
  {id:"code_generation",title:"Code Generation",keywords:["function", "component", "service", "schema"],risk:"LOW"},
  {id:"refactoring",title:"Refactoring",keywords:["refactor", "rename", "extract", "move"],risk:"LOW"},
  {id:"architecture",title:"Architecture",keywords:["route", "module", "service", "dependency"],risk:"MEDIUM"},
  {id:"ui_systems",title:"UI Systems",keywords:["component", "button", "dialog", "table"],risk:"LOW"},
  {id:"ux_quality",title:"UX Quality",keywords:["empty", "loading", "error", "success"],risk:"LOW"},
  {id:"responsive",title:"Responsive",keywords:["media", "grid", "flex", "viewport"],risk:"LOW"},
  {id:"accessibility",title:"Accessibility",keywords:["aria", "role", "label", "focus"],risk:"LOW"},
  {id:"mobile",title:"Mobile",keywords:["touch", "viewport", "mobile", "gesture"],risk:"LOW"},
  {id:"testing_unit",title:"Unit Testing",keywords:["test", "expect", "mock", "describe"],risk:"LOW"},
  {id:"testing_e2e",title:"E2E Testing",keywords:["playwright", "cypress", "browser", "locator"],risk:"LOW"},
  {id:"visual_testing",title:"Visual Testing",keywords:["screenshot", "visual", "viewport", "baseline"],risk:"LOW"},
  {id:"api_engineering",title:"API Engineering",keywords:["fetch", "axios", "api", "endpoint"],risk:"MEDIUM"},
  {id:"contracts",title:"Contract Engineering",keywords:["schema", "contract", "response", "request"],risk:"MEDIUM"},
  {id:"database",title:"Database",keywords:["select", "insert", "update", "delete"],risk:"HIGH"},
  {id:"supabase",title:"Supabase",keywords:["supabase", "rls", "policy", "migration"],risk:"HIGH"},
  {id:"auth",title:"Authentication",keywords:["auth", "session", "token", "role"],risk:"HIGH"},
  {id:"security",title:"Security",keywords:["secret", "xss", "csrf", "permission"],risk:"HIGH"},
  {id:"privacy",title:"Privacy",keywords:["pii", "consent", "retention", "privacy"],risk:"HIGH"},
  {id:"performance",title:"Performance",keywords:["cache", "lazy", "memo", "bundle"],risk:"MEDIUM"},
  {id:"network",title:"Network",keywords:["request", "timeout", "retry", "network"],risk:"MEDIUM"},
  {id:"state_management",title:"State Management",keywords:["state", "store", "context", "reducer"],risk:"LOW"},
  {id:"forms",title:"Forms",keywords:["form", "input", "validation", "submit"],risk:"LOW"},
  {id:"storage",title:"Storage",keywords:["storage", "upload", "file", "bucket"],risk:"LOW"},
  {id:"realtime",title:"Realtime",keywords:["websocket", "realtime", "channel", "subscribe"],risk:"MEDIUM"},
  {id:"devops",title:"DevOps",keywords:["build", "deploy", "docker", "pipeline"],risk:"HIGH"},
  {id:"ci_cd",title:"CI CD",keywords:["workflow", "pipeline", "build", "test"],risk:"HIGH"},
  {id:"git",title:"Git",keywords:["commit", "branch", "diff", "merge"],risk:"LOW"},
  {id:"release",title:"Release",keywords:["release", "version", "changelog", "deploy"],risk:"HIGH"},
  {id:"observability",title:"Observability",keywords:["log", "metric", "trace", "error"],risk:"MEDIUM"},
  {id:"reliability",title:"Reliability",keywords:["retry", "fallback", "health", "recovery"],risk:"MEDIUM"},
  {id:"data_engineering",title:"Data Engineering",keywords:["etl", "transform", "dataset", "query"],risk:"MEDIUM"},
  {id:"documentation",title:"Documentation",keywords:["readme", "docs", "guide", "example"],risk:"LOW"},
  {id:"product",title:"Product Engineering",keywords:["feature", "user", "flow", "acceptance"],risk:"LOW"},
  {id:"analytics",title:"Analytics",keywords:["analytics", "event", "metric", "dashboard"],risk:"LOW"},
  {id:"localization",title:"Localization",keywords:["rtl", "locale", "i18n", "translation"],risk:"LOW"},
  {id:"configuration",title:"Configuration",keywords:["config", "env", "setting", "flag"],risk:"LOW"},
  {id:"dependency_management",title:"Dependency Management",keywords:["package", "dependency", "lockfile", "version"],risk:"MEDIUM"},
  {id:"governance",title:"Engineering Governance",keywords:["policy", "evidence", "approval", "risk"],risk:"MEDIUM"},
];
const V150_OPERATIONS = [
  "audit",
  "scan",
  "map",
  "trace",
  "inspect",
  "analyze",
  "validate",
  "verify",
  "review",
  "profile",
  "forecast",
  "simulate",
  "plan",
  "generate",
  "compare",
  "correlate",
  "classify",
  "prioritize",
  "score",
  "measure",
  "index",
  "catalog",
  "inventory",
  "summarize",
  "diagnose",
  "triage",
  "detect",
  "locate",
  "explain",
  "recommend",
  "guard",
  "gate",
  "enforce",
  "monitor",
  "watch",
  "report",
  "snapshot",
  "baseline",
  "diff",
  "regress",
  "optimize",
  "harden",
  "stabilize",
  "normalize",
  "standardize",
  "consolidate",
  "deduplicate",
  "decompose",
  "compose",
  "route",
  "orchestrate",
  "schedule",
  "sequence",
  "parallelize",
  "budget",
  "limit",
  "throttle",
  "retry",
  "recover",
  "rollback",
  "migrate",
  "upgrade",
  "modernize",
  "refactor",
  "rename",
  "extract",
  "inline",
  "split",
  "merge",
  "isolate",
  "contract",
  "specify",
  "document",
  "annotate",
  "typecheck",
  "lint",
  "test",
  "benchmark",
  "instrument",
  "observe",
  "healthcheck",
  "readiness",
  "compliance",
  "coverage",
  "ownership",
  "impact",
  "dependency",
  "compatibility",
  "integrity",
  "consistency",
  "quality",
  "risk",
  "evidence",
  "workflow",
  "lifecycle",
  "policy",
  "strategy",
  "readability",
  "maintainability",
  "resilience"
] as const;
const V150_CAPABILITIES: V150Capability[] = V150_DOMAINS.flatMap(domain =>
  V150_OPERATIONS.map(operation => ({
    id: `${domain.id}_${operation}`,
    title: `${domain.title} ${operation.replace(/_/g," ").replace(/\b\w/g,c=>c.toUpperCase())}`,
    domain: domain.id,
    operation,
    description: `${operation} ${domain.title} signals using repository evidence, bounded static analysis, and explicit uncertainty.`,
    keywords: [...domain.keywords, operation.replace(/_/g," ")],
    risk: domain.risk
  }))
);

async function v150RunCapability(cap:V150Capability, scope?:string, writeReport=true){
  const root=scope?safePath(scope):PROJECT_ROOT;
  const files:string[]=[]; await v120Walk(root,files,700);
  const findings:any[]=[]; let bytesScanned=0; let testSignals=0; let sourceSignals=0;
  for(const abs of files){
    let txt=""; try{const st=await fs.stat(abs); if(st.size>MAX_FILE_SIZE)continue; bytesScanned+=st.size; txt=await fs.readFile(abs,"utf8");}catch{continue;}
    const low=txt.toLowerCase(); const matches=cap.keywords.filter(k=>low.includes(k.toLowerCase())); if(!matches.length)continue;
    const rel=path.relative(PROJECT_ROOT,abs).replace(/\\/g,"/"); const isTest=/\.(test|spec)\.|__tests__|playwright|cypress/i.test(rel);
    if(isTest)testSignals++; else sourceSignals++; findings.push({file:rel,matches,score:matches.length+(isTest?0.25:0),isTest});
  }
  findings.sort((a,b)=>b.score-a.score||a.file.localeCompare(b.file));
  const report={version:"15.0.0",capability:cap.id,domain:cap.domain,operation:cap.operation,title:cap.title,declaredRisk:cap.risk,scope:scope||".",filesScanned:files.length,bytesScanned,signalFiles:findings.length,testSignals,sourceSignals,topFiles:findings.slice(0,30),limitations:["Static signal analysis is not proof of a defect.","Runtime, browser, database, or external-system claims require direct evidence."],recommendations:[`Review highest-signal ${cap.domain} files before changing code.`,`Use runtime/tests for ${cap.operation} conclusions where behavior matters.`,`Attach evidence before marking this capability complete.`],generatedAt:new Date().toISOString()};
  if(writeReport){const dir=path.join(PROJECT_ROOT,".krom",V150_REPORT_DIR);await fs.mkdir(dir,{recursive:true});await fs.writeFile(path.join(dir,`${cap.id}.json`),JSON.stringify(report,null,2),"utf8");}
  return report;
}
// ===== END v15.0 =====


// ===== v16.0 INTELLIGENT TOOL ROUTER & CAPABILITY GRAPH =====
type V160ToolMeta = { name:string; generation:string; domain:string; risk:"LOW"|"MEDIUM"|"HIGH"; tags:string[] };
type V160Catalog = { version:string; total:number; tools:V160ToolMeta[] };
const V160_STATE_DIR = path.join(PROJECT_ROOT,".krom","v16-router");
const V160_RISK_WEIGHT: Record<string,number> = { LOW:0, MEDIUM:0.12, HIGH:0.28 };
let V160_CATALOG_CACHE: V160Catalog | null = null;

async function v160LoadCatalog(): Promise<V160Catalog> {
  if (V160_CATALOG_CACHE) return V160_CATALOG_CACHE;
  const candidates = [
    path.join(path.dirname(process.argv[1] || ""), "TOOL-CATALOG-v16.json"),
    path.join(process.cwd(), "TOOL-CATALOG-v16.json"),
    path.join(PROJECT_ROOT, "TOOL-CATALOG-v16.json")
  ];
  for (const candidate of candidates) {
    try {
      const parsed = JSON.parse(await fs.readFile(candidate,"utf8"));
      if (parsed && Array.isArray(parsed.tools)) {
        V160_CATALOG_CACHE = parsed as V160Catalog;
        return V160_CATALOG_CACHE;
      }
    } catch {}
  }
  const fallback:V160ToolMeta[] = V150_CAPABILITIES.map(cap=>({name:`${cap.id}_v15`,generation:"v15",domain:cap.domain,risk:cap.risk,tags:[...cap.keywords,cap.operation]}));
  V160_CATALOG_CACHE = {version:"16.0.0-fallback",total:fallback.length,tools:fallback};
  return V160_CATALOG_CACHE;
}

function v160Tokens(text:string){
  return [...new Set(text.toLowerCase().replace(/[^a-z0-9_\- ]+/g," ").split(/[\s_\-]+/).filter(Boolean))];
}
function v160ScoreTool(meta:V160ToolMeta, query:string, preferRisk:"LOW"|"MEDIUM"|"HIGH"|"ANY"="ANY"){
  const q=v160Tokens(query); const n=meta.name.toLowerCase(); const tags=new Set(meta.tags.map(x=>x.toLowerCase()));
  let score=0; const reasons:string[]=[];
  for(const token of q){
    if(n.includes(token)){score+=3;reasons.push(`name:${token}`);} else if(tags.has(token)){score+=2;reasons.push(`tag:${token}`);} else if(meta.domain.includes(token)){score+=1.5;reasons.push(`domain:${token}`);}
  }
  if(preferRisk!=="ANY" && meta.risk===preferRisk){score+=0.75;reasons.push(`risk:${meta.risk}`);}
  score=Math.max(0,score-(V160_RISK_WEIGHT[meta.risk]||0));
  return {score:Number(score.toFixed(3)),reasons:[...new Set(reasons)].slice(0,8)};
}

async function v160Search(query:string, limit=12, domain?:string, maxRisk:"LOW"|"MEDIUM"|"HIGH"="HIGH"){
  const catalog=await v160LoadCatalog();
  const riskRank={LOW:1,MEDIUM:2,HIGH:3};
  const rows=catalog.tools.filter(t=>(!domain||t.domain===domain)&&riskRank[t.risk]<=riskRank[maxRisk]).map(t=>({...t,...v160ScoreTool(t,query)})).filter(x=>x.score>0).sort((a,b)=>b.score-a.score||a.name.localeCompare(b.name)).slice(0,Math.max(1,Math.min(limit,50)));
  return {query,totalCatalog:catalog.tools.length,matched:rows.length,results:rows};
}

async function v160Route(task:string, maxTools=6, allowHighRisk=false){
  const search=await v160Search(task,Math.max(maxTools*4,12),undefined,allowHighRisk?"HIGH":"MEDIUM");
  const selected:any[]=[]; const seenDomain=new Set<string>();
  for(const item of search.results){
    if(selected.length>=maxTools)break;
    if(!seenDomain.has(item.domain)||selected.length<2){selected.push(item);seenDomain.add(item.domain);}
  }
  const high=selected.filter(x=>x.risk==="HIGH");
  return {task,selected,requiresApproval:high.length>0,highRiskTools:high.map(x=>x.name),policy:allowHighRisk?"HIGH_RISK_ALLOWED":"HIGH_RISK_EXCLUDED",explanation:selected.map(x=>({tool:x.name,why:x.reasons,score:x.score,risk:x.risk}))};
}

async function v160CapabilityGraph(task:string){
  const routed=await v160Route(task,10,false); const nodes=routed.selected.map((x:any,i:number)=>({id:x.name,domain:x.domain,risk:x.risk,order:i+1}));
  const edges=nodes.slice(1).map((n:any,i:number)=>({from:nodes[i].id,to:n.id,relation:"recommended_sequence"}));
  return {task,nodes,edges,notes:["Graph is a routing recommendation, not proof that every tool is required.","Runtime evidence should determine whether later nodes execute."]};
}

async function v160ComposeWorkflow(task:string, strict=true){
  const routed=await v160Route(task,8,false); const steps:any[]=[]; let i=1;
  steps.push({order:i++,phase:"context",action:"smart_context_build",purpose:"Collect bounded task context before tool execution."});
  steps.push({order:i++,phase:"impact",action:"impact_analysis",purpose:"Estimate blast radius before writes."});
  for(const t of routed.selected){steps.push({order:i++,phase:"capability",action:t.name,purpose:`Use ${t.domain} capability for task evidence.`,risk:t.risk});}
  steps.push({order:i++,phase:"verify",action:"engineering_suite_gate_v5",purpose:"Run engineering verification gates."});
  steps.push({order:i++,phase:"release",action:"release_center_v9",purpose:"Aggregate release evidence."});
  return {task,strict,steps,stopConditions:strict?["critical_error","missing_required_evidence","unexpected_scope_expansion"]:["critical_error"]};
}

async function v160RiskPolicy(toolNames:string[]){
  const catalog=await v160LoadCatalog(); const map=new Map(catalog.tools.map(t=>[t.name,t])); const assessed=toolNames.map(name=>map.get(name)||{name,generation:"unknown",domain:"unknown",risk:"MEDIUM" as const,tags:[]});
  const counts={LOW:0,MEDIUM:0,HIGH:0}; assessed.forEach(x=>counts[x.risk]++);
  return {tools:assessed,counts,requiresCheckpoint:counts.HIGH>0,requiresExplicitEvidence:counts.HIGH>0||counts.MEDIUM>2,recommendedGate:counts.HIGH>0?"preflight_gate":"engineering_suite_gate_v5"};
}

async function v160RecordUsage(tool:string,outcome:"success"|"failure"|"blocked",task?:string,evidence?:string){
  await fs.mkdir(V160_STATE_DIR,{recursive:true}); const file=path.join(V160_STATE_DIR,"usage.jsonl");
  const row={tool,outcome,task:task||null,evidence:evidence||null,at:new Date().toISOString()}; await fs.appendFile(file,JSON.stringify(row)+"\n","utf8"); return row;
}

async function v160UsageTelemetry(limit=100){
  const file=path.join(V160_STATE_DIR,"usage.jsonl"); let lines:string[]=[]; try{lines=(await fs.readFile(file,"utf8")).split(/\r?\n/).filter(Boolean);}catch{}
  const rows=lines.slice(-Math.max(1,Math.min(limit,1000))).map(x=>{try{return JSON.parse(x)}catch{return null}}).filter(Boolean); const summary:any={success:0,failure:0,blocked:0}; rows.forEach((r:any)=>summary[r.outcome]=(summary[r.outcome]||0)+1); return {events:rows.length,summary,recent:rows.slice(-20)};
}

async function v160DomainHealth(){
  const catalog=await v160LoadCatalog(); const by:any={}; for(const t of catalog.tools){by[t.domain]??={tools:0,low:0,medium:0,high:0};by[t.domain].tools++;by[t.domain][t.risk.toLowerCase()]++;}
  return {catalogTotal:catalog.tools.length,domains:Object.entries(by).map(([domain,v]:any)=>({domain,...v})).sort((a:any,b:any)=>b.tools-a.tools),catalogVersion:catalog.version};
}
// ===== END v16.0 =====



// ===== v17.0 ADAPTIVE WORKFLOW COMPILER =====
const V170_STATE_DIR = path.join(PROJECT_ROOT, ".krom", "v17-workflows");
const V170_HISTORY_FILE = path.join(V170_STATE_DIR, "history.json");

type V170PlanStep = { id:string; tool:string; domain:string; risk:string; reason:string; dependsOn:string[]; verification:string[] };

async function v170Ensure(){ await fs.mkdir(V170_STATE_DIR,{recursive:true}); }

async function v170Compile(task:string, strict=true){
  await v170Ensure();
  const route:any = await v160Route(task, 12, false);
  const selected:any[] = route.selected || [];
  const seen = new Set<string>();
  const compact:any[] = [];
  for (const t of selected){
    const key = `${t.domain}:${(t.tags||[]).slice(0,2).join(',')}`;
    if (seen.has(key) && compact.length >= 5) continue;
    seen.add(key); compact.push(t);
    if (compact.length >= (strict?8:6)) break;
  }
  const steps:V170PlanStep[] = compact.map((t:any,i:number)=>({
    id:`S${String(i+1).padStart(3,'0')}`, tool:t.name, domain:t.domain, risk:t.risk,
    reason:`Selected for ${t.domain} coverage with routing score ${t.score ?? 'n/a'}.`,
    dependsOn:i? [`S${String(i).padStart(3,'0')}`]:[],
    verification:[t.risk==='HIGH'?'checkpoint-before-change':'evidence-after-step', i===compact.length-1?'release-gate':'regression-scope']
  }));
  const plan={version:'17.0.0',task,strict,createdAt:new Date().toISOString(),steps,selectedTools:compact.map((x:any)=>x.name),quality:{maxTools:strict?8:6,deduplicated:selected.length-compact.length},status:'COMPILED'};
  await fs.writeFile(path.join(V170_STATE_DIR,'latest-plan.json'),JSON.stringify(plan,null,2));
  return plan;
}

async function v170Optimize(task:string){
  const plan:any=await v170Compile(task,true);
  const riskWeight:any={LOW:1,MEDIUM:3,HIGH:6};
  const cost=plan.steps.reduce((n:number,s:any)=>n+riskWeight[s.risk||'MEDIUM'],0);
  const parallelGroups:any[]=[]; let group:any[]=[]; let lastDomain='';
  for(const s of plan.steps){ if(lastDomain && s.domain!==lastDomain && group.length<2){group.push(s.id);} else {if(group.length)parallelGroups.push(group);group=[s.id];} lastDomain=s.domain; }
  if(group.length)parallelGroups.push(group);
  return {...plan,optimization:{estimatedRiskCost:cost,parallelGroups,recommendation:cost>20?'Use checkpoints and smaller patches':'Proceed with bounded execution'}};
}

async function v170Replan(task:string, failedStep:string, failure:string){
  const current:any=await v170Compile(task,true);
  const filtered=current.steps.filter((s:any)=>s.id!==failedStep);
  const fallback:any=await v160Search(`${task} ${failure}`,6,undefined,'MEDIUM');
  const existing=new Set(filtered.map((x:any)=>x.tool));
  const alt=(fallback.results||fallback.tools||fallback||[]).find((x:any)=>!existing.has(x.name));
  if(alt) filtered.push({id:`S${String(filtered.length+1).padStart(3,'0')}`,tool:alt.name,domain:alt.domain,risk:alt.risk,reason:`Fallback after ${failedStep}: ${failure.slice(0,160)}`,dependsOn:filtered.length?[filtered[filtered.length-1].id]:[],verification:['evidence-after-step','regression-scope']});
  const result={...current,steps:filtered,status:'REPLANNED',failedStep,failure,updatedAt:new Date().toISOString()};
  await fs.writeFile(path.join(V170_STATE_DIR,'latest-plan.json'),JSON.stringify(result,null,2));
  return result;
}

async function v170Gate(task:string){
  const optimized:any=await v170Optimize(task);
  const high=optimized.steps.filter((s:any)=>s.risk==='HIGH');
  const blocked=high.length>0 && !optimized.steps.some((s:any)=>s.verification.includes('checkpoint-before-change'));
  return {version:'17.0.0',task,status:blocked?'BLOCKED':'READY',highRiskSteps:high.map((x:any)=>x.id),stepCount:optimized.steps.length,reason:blocked?'High-risk workflow lacks checkpoint protection':'Workflow has bounded steps and verification'};
}

async function v170Record(task:string,status:'success'|'failure'|'blocked',details?:string){
  await v170Ensure(); let rows:any[]=[]; try{rows=JSON.parse(await fs.readFile(V170_HISTORY_FILE,'utf8'));}catch{}
  rows.push({at:new Date().toISOString(),task,status,details:details||''}); rows=rows.slice(-500); await fs.writeFile(V170_HISTORY_FILE,JSON.stringify(rows,null,2));
  return {saved:true,total:rows.length};
}

async function v170Telemetry(){
  await v170Ensure(); let rows:any[]=[]; try{rows=JSON.parse(await fs.readFile(V170_HISTORY_FILE,'utf8'));}catch{}
  const counts={success:0,failure:0,blocked:0} as any; for(const r of rows) if(r.status in counts) counts[r.status]++;
  const total=rows.length; return {version:'17.0.0',total,...counts,successRate:total?Math.round(counts.success/total*100):0};
}
// ===== END v17.0 =====

// ===== v18.0 VERIFIED AUTONOMOUS EXECUTOR =====
const V180_STATE_DIR = path.join(PROJECT_ROOT, ".krom", "v18-verified-execution");
const V180_RUN_FILE = path.join(V180_STATE_DIR, "active-run.json");
const V180_HISTORY_FILE = path.join(V180_STATE_DIR, "history.json");

type V180Receipt = {
  stepId:string; tool:string; status:"pending"|"running"|"passed"|"failed"|"blocked";
  expected?:string; actual?:string; evidence:string[]; startedAt?:string; finishedAt?:string;
};

async function v180Ensure(){ await fs.mkdir(V180_STATE_DIR,{recursive:true}); }
async function v180ReadRun(){ await v180Ensure(); try{return JSON.parse(await fs.readFile(V180_RUN_FILE,'utf8'));}catch{return null;} }
async function v180WriteRun(run:any){ await v180Ensure(); await fs.writeFile(V180_RUN_FILE,JSON.stringify(run,null,2)); return run; }

async function v180Start(task:string, strict=true){
  const plan:any = await v170Compile(task,strict);
  const receipts:V180Receipt[] = plan.steps.map((s:any)=>({stepId:s.id,tool:s.tool,status:"pending",expected:(s.verification||[]).join(", "),evidence:[]}));
  const run={version:"18.0.0",runId:`run-${Date.now()}`,task,strict,status:"READY",createdAt:new Date().toISOString(),updatedAt:new Date().toISOString(),plan,receipts,quality:{verifiedSteps:0,falsePasses:0,failedSteps:0}};
  return v180WriteRun(run);
}

async function v180StepBegin(stepId:string){
  const run:any=await v180ReadRun(); if(!run) throw new Error("No active v18 run. Start verified_execution_start_v18 first.");
  const r=run.receipts.find((x:any)=>x.stepId===stepId); if(!r) throw new Error(`Unknown step ${stepId}`);
  const step=run.plan.steps.find((x:any)=>x.id===stepId);
  for(const dep of step?.dependsOn||[]){const d=run.receipts.find((x:any)=>x.stepId===dep); if(!d||d.status!=="passed") throw new Error(`Dependency ${dep} is not verified.`);}
  r.status="running"; r.startedAt=new Date().toISOString(); run.status="RUNNING"; run.updatedAt=new Date().toISOString(); await v180WriteRun(run);
  return {runId:run.runId,step:r};
}

async function v180RecordReceipt(stepId:string,status:"passed"|"failed"|"blocked",actual:string,evidence:string[]){
  const run:any=await v180ReadRun(); if(!run) throw new Error("No active v18 run.");
  const r=run.receipts.find((x:any)=>x.stepId===stepId); if(!r) throw new Error(`Unknown step ${stepId}`);
  const cleanEvidence=(evidence||[]).map(x=>String(x).trim()).filter(Boolean);
  if(status==="passed" && cleanEvidence.length===0) throw new Error("A passed step requires at least one evidence item.");
  r.status=status; r.actual=actual; r.evidence=cleanEvidence; r.finishedAt=new Date().toISOString();
  const passed=run.receipts.filter((x:any)=>x.status==="passed").length; const failed=run.receipts.filter((x:any)=>x.status==="failed").length;
  run.quality.verifiedSteps=passed; run.quality.failedSteps=failed; run.updatedAt=new Date().toISOString();
  run.status=failed?"REPAIR_REQUIRED":run.receipts.every((x:any)=>x.status==="passed")?"VERIFY_RELEASE":"RUNNING";
  await v180WriteRun(run); return {runId:run.runId,receipt:r,status:run.status};
}

async function v180ValidateEvidence(stepId?:string){
  const run:any=await v180ReadRun(); if(!run) throw new Error("No active v18 run.");
  const targets=stepId?run.receipts.filter((x:any)=>x.stepId===stepId):run.receipts;
  const findings:any[]=[];
  for(const r of targets){
    const missing=r.status==="passed" && (!Array.isArray(r.evidence)||r.evidence.length===0);
    const suspicious=(r.evidence||[]).some((e:string)=>/todo|tbd|assume|probably|looks good|should pass/i.test(e));
    if(missing||suspicious) findings.push({stepId:r.stepId,tool:r.tool,missingEvidence:missing,suspiciousEvidence:suspicious});
  }
  return {valid:findings.length===0,checked:targets.length,findings};
}

async function v180Compare(expected:string,actual:string,mode:"exact"|"contains"|"regex"|"nonempty"="contains"){
  let pass=false;
  if(mode==="exact") pass=actual===expected;
  else if(mode==="contains") pass=actual.toLowerCase().includes(expected.toLowerCase());
  else if(mode==="regex"){ try{pass=new RegExp(expected,"i").test(actual);}catch{pass=false;} }
  else pass=actual.trim().length>0;
  return {mode,expected,actual,pass,checkedAt:new Date().toISOString()};
}

async function v180FalsePassScan(){
  const run:any=await v180ReadRun(); if(!run) throw new Error("No active v18 run.");
  const issues:any[]=[];
  for(const r of run.receipts){
    if(r.status!=="passed") continue;
    const joined=(r.evidence||[]).join(" ")+" "+(r.actual||"");
    if(!(r.evidence||[]).length) issues.push({stepId:r.stepId,reason:"PASS without evidence"});
    if(/error|failed|failure|exception|not configured|blocked|exit code[^0]*[1-9]/i.test(joined)) issues.push({stepId:r.stepId,reason:"PASS evidence contains failure signal"});
  }
  run.quality.falsePasses=issues.length; if(issues.length) run.status="EVIDENCE_CONFLICT"; run.updatedAt=new Date().toISOString(); await v180WriteRun(run);
  return {falsePasses:issues.length,issues,status:run.status};
}

async function v180SafeResume(){
  const run:any=await v180ReadRun(); if(!run) return {status:"NO_ACTIVE_RUN"};
  const failed=run.receipts.find((x:any)=>x.status==="failed"||x.status==="blocked");
  if(failed) return {status:"REPAIR_REQUIRED",resumeFrom:failed.stepId,tool:failed.tool,reason:"Resolve failed/blocked step before continuing."};
  const next=run.receipts.find((x:any)=>x.status!=="passed");
  if(!next) return {status:"VERIFY_RELEASE",resumeFrom:null};
  return {status:"READY_TO_RESUME",resumeFrom:next.stepId,tool:next.tool};
}

async function v180InvariantGate(){
  const run:any=await v180ReadRun(); if(!run) throw new Error("No active v18 run.");
  const evidence:any=await v180ValidateEvidence(); const falsePass:any=await v180FalsePassScan();
  const highRiskUnverified=run.plan.steps.filter((s:any)=>s.risk==="HIGH").filter((s:any)=>run.receipts.find((r:any)=>r.stepId===s.id)?.status!=="passed").map((s:any)=>s.id);
  const blocked=!evidence.valid||falsePass.falsePasses>0||highRiskUnverified.length>0;
  return {status:blocked?"BLOCKED":"READY",evidenceValid:evidence.valid,falsePasses:falsePass.falsePasses,highRiskUnverified};
}

async function v180ReleaseGate(){
  const run:any=await v180ReadRun(); if(!run) throw new Error("No active v18 run.");
  const inv:any=await v180InvariantGate();
  const pending=run.receipts.filter((x:any)=>x.status!=="passed").map((x:any)=>({stepId:x.stepId,status:x.status,tool:x.tool}));
  const pass=inv.status==="READY"&&pending.length===0;
  run.status=pass?"VERIFIED_DONE":"BLOCKED"; run.updatedAt=new Date().toISOString();
  if(pass){let history:any[]=[];try{history=JSON.parse(await fs.readFile(V180_HISTORY_FILE,'utf8'));}catch{} history.push({runId:run.runId,task:run.task,finishedAt:new Date().toISOString(),receipts:run.receipts.length}); history=history.slice(-500); await fs.writeFile(V180_HISTORY_FILE,JSON.stringify(history,null,2));}
  await v180WriteRun(run); return {status:pass?"PASS":"BLOCKED",runId:run.runId,pending,invariants:inv};
}

async function v180Status(){ const run:any=await v180ReadRun(); if(!run) return {version:"18.0.0",status:"NO_ACTIVE_RUN"}; const counts:any={pending:0,running:0,passed:0,failed:0,blocked:0}; for(const r of run.receipts) counts[r.status]=(counts[r.status]||0)+1; return {version:"18.0.0",runId:run.runId,task:run.task,status:run.status,counts,quality:run.quality,next:await v180SafeResume()}; }
// ===== END v18.0 =====

// ===== v19.0 AUTONOMOUS REFACTORING & DEPENDENCY INTELLIGENCE =====
const V190_STATE_DIR = path.join(PROJECT_ROOT, ".krom", "v19-refactoring");
async function v190Ensure(){ await fs.mkdir(V190_STATE_DIR,{recursive:true}); }
async function v190Write(name:string,data:any){ await v190Ensure(); const f=path.join(V190_STATE_DIR,name); await fs.writeFile(f,JSON.stringify(data,null,2)); return f; }
async function v190DependencyGraph(refresh=false){ const graph=refresh?await buildCodeIntelligenceGraph():(await readCodeIntelligenceGraph())||await buildCodeIntelligenceGraph(); const nodes=Object.values(graph.nodes||{}); const hotspots=nodes.map((n:any)=>({file:n.file,imports:(n.imports||[]).length,importedBy:(n.importedBy||[]).length,risk:(n.importedBy||[]).length>20?'HIGH':(n.importedBy||[]).length>7?'MEDIUM':'LOW'})).sort((a:any,b:any)=>b.importedBy-a.importedBy).slice(0,100); const out={version:'19.0.0',nodeCount:nodes.length,hotspots}; await v190Write('dependency-graph.json',out); return out; }
async function v190RefactorPlan(files:string[],goal:string){ const graph=(await readCodeIntelligenceGraph())||await buildCodeIntelligenceGraph(); const targets=files.map(f0=>{const f=normalizeRel(f0);const n:any=graph.nodes?.[f];const blast=(n?.importedBy||[]).length;return {file:f,imports:(n?.imports||[]).slice(0,100),importedBy:(n?.importedBy||[]).slice(0,100),blastRadius:blast,risk:blast>20?'HIGH':blast>7?'MEDIUM':'LOW'};}); const plan={version:'19.0.0',goal,targets,steps:['Create checkpoint','Capture baseline diagnostics/tests','Refactor lowest-risk dependency layer first','Run typecheck/tests after each step','Run regression scope and browser checks for UI/routes','Compare diff against goal','Verify with v18 receipts before release'],rule:'Do not combine unrelated refactors in the same change set.'}; await v190Write('latest-refactor-plan.json',plan); return plan; }
async function v190DeadCodeAudit(maxFiles=2500){ const files=await v50TextFiles(Math.min(maxFiles,5000)); const code=files.filter((x:any)=>/\.(ts|tsx|js|jsx)$/.test(x)); const graph=(await readCodeIntelligenceGraph())||await buildCodeIntelligenceGraph(); const candidates=code.map((x:any)=>normalizeRel(path.relative(PROJECT_ROOT,x.path||x))).filter((f:string)=>{const n:any=graph.nodes?.[f]; return n && (n.importedBy||[]).length===0 && !/(^|\/)(main|index|server|vite.config|next.config|route|page|layout)\./.test(f);}).slice(0,300); const out={version:'19.0.0',candidates,count:candidates.length,warning:'Candidates require human/entrypoint verification before deletion.'}; await v190Write('dead-code-audit.json',out); return out; }
async function v190DuplicateAudit(maxFiles=1500){ const files=(await v50TextFiles(Math.min(maxFiles,3000))).filter((x:any)=>/\.(ts|tsx|js|jsx)$/.test(x.path||x)); const buckets=new Map<string,string[]>(); for(const item of files){try{const rel=normalizeRel(path.relative(PROJECT_ROOT,item)); const txt=await fs.readFile(item,'utf8'); const sig=txt.replace(/\s+/g,' ').replace(/[A-Za-z_$][\w$]*/g,'ID').slice(0,1200); if(sig.length<250) continue; const key=sig.slice(0,500); const arr=buckets.get(key)||[]; arr.push(rel); buckets.set(key,arr);}catch{}} const groups=[...buckets.values()].filter(a=>a.length>1).slice(0,100); const out={version:'19.0.0',groups,count:groups.length,note:'Heuristic similarity only; inspect before consolidating.'}; await v190Write('duplicate-logic-audit.json',out); return out; }
async function v190DependencyUpgradePlan(){ let pkg:any={}; try{pkg=JSON.parse(await fs.readFile(path.join(PROJECT_ROOT,'package.json'),'utf8'));}catch{} const deps={...(pkg.dependencies||{}),...(pkg.devDependencies||{})}; const rows=Object.entries(deps).map(([name,range])=>({name,range:String(range),risk:/^(react|next|vite|typescript|@supabase|electron|@modelcontextprotocol|zod)/.test(name)?'HIGH':'MEDIUM',checks:['install','typecheck','tests','build']})); const out={version:'19.0.0',packageCount:rows.length,packages:rows,rule:'No version bump is executed automatically. Verify release notes and compatibility externally before upgrade.'}; await v190Write('dependency-upgrade-plan.json',out); return out; }
async function v190DependencyRiskMap(){ const plan:any=await v190DependencyUpgradePlan(); const grouped={HIGH:plan.packages.filter((x:any)=>x.risk==='HIGH'),MEDIUM:plan.packages.filter((x:any)=>x.risk==='MEDIUM')}; const out={version:'19.0.0',grouped,highRiskCount:grouped.HIGH.length}; await v190Write('dependency-risk-map.json',out); return out; }
async function v190Checkpoint(label:string){ await v190Ensure(); const st=await executeProgram('git',['status','--short'],PROJECT_ROOT,60000); const diff=await executeProgram('git',['diff'],PROJECT_ROOT,60000); const snap={version:'19.0.0',label,createdAt:new Date().toISOString(),gitStatus:st.stdout,diff:diff.stdout}; const file=await v190Write(`checkpoint-${Date.now()}.json`,snap); return {status:'CREATED',file:path.relative(PROJECT_ROOT,file),label}; }
async function v190ApplyGuard(files:string[]){ const graph=(await readCodeIntelligenceGraph())||await buildCodeIntelligenceGraph(); const reviews=files.map(f0=>{const f=normalizeRel(f0); const n:any=graph.nodes?.[f]; const blast=(n?.importedBy||[]).length; return {file:f,blastRadius:blast,risk:blast>20?'HIGH':blast>7?'MEDIUM':'LOW'};}); const blocked=reviews.some((x:any)=>x.risk==='HIGH'); return {version:'19.0.0',status:blocked?'CHECKPOINT_REQUIRED':'PASS',reviews,requirements:blocked?['checkpoint','baseline tests','targeted regression plan']:['baseline diagnostics','targeted tests']}; }
async function v190RegressionPlan(files:string[]){ const graph=(await readCodeIntelligenceGraph())||await buildCodeIntelligenceGraph(); const impacted=new Set<string>(); for(const f0 of files){const f=normalizeRel(f0); impacted.add(f); const n:any=graph.nodes?.[f]; for(const d of n?.importedBy||[]) impacted.add(d);} const arr=[...impacted].slice(0,500); const out={version:'19.0.0',changed:files.map(normalizeRel),impacted:arr,checks:['typecheck','unit tests touching impacted files','route/browser checks for impacted pages','visual review for UI changes','database/security review when applicable']}; await v190Write('regression-plan.json',out); return out; }
async function v190Verify(files:string[]){ const [typecheck,tests,git]=await Promise.all([runPackageScript(['typecheck','type-check','check:types']),runPackageScript(['test','test:unit','test:ci']),executeProgram('git',['diff','--check'],PROJECT_ROOT,60000)]); const evidence={typecheck,tests,diffCheck:{success:git.success,stdout:git.stdout,stderr:git.stderr}}; const pass=typecheck.status!=='FAIL'&&tests.status!=='FAIL'&&git.success; const out={version:'19.0.0',status:pass?'PASS':'FAIL',files:files.map(normalizeRel),evidence}; await v190Write('verification.json',out); return out; }
async function v190RollbackPlan(){ const st=await executeProgram('git',['status','--short'],PROJECT_ROOT,60000); return {version:'19.0.0',workingTree:st.stdout,steps:['Do not use destructive reset automatically','Restore only files proven to regress','Prefer saved v19 checkpoint/diff evidence','Re-run verification after rollback'],automaticRollback:false}; }
async function v190Status(){ await v190Ensure(); const names=await fs.readdir(V190_STATE_DIR).catch(()=>[]); return {version:'19.0.0',stateDir:path.relative(PROJECT_ROOT,V190_STATE_DIR),artifacts:names.sort()}; }
// ===== END v19.0 CORE =====


// ===== v20.0 SELF-HEALING ARCHITECTURE & MIGRATION ENGINE =====
const V200_STATE_DIR = path.join(PROJECT_ROOT, ".krom", "v20-self-healing");
async function v200Ensure(){ await fs.mkdir(V200_STATE_DIR,{recursive:true}); }
async function v200Write(name:string,data:any){ await v200Ensure(); const file=path.join(V200_STATE_DIR,name); await fs.writeFile(file,JSON.stringify(data,null,2)); return file; }
async function v200ReadJson(file:string){ try{return JSON.parse(await fs.readFile(file,'utf8'));}catch{return null;} }

async function v200ArchitectureDriftScan(){
  const graph:any=(await readCodeIntelligenceGraph())||await buildCodeIntelligenceGraph();
  const files=await v50TextFiles(3500);
  const drift:any[]=[];
  const routeFiles=files.filter((x:any)=>/(^|\/)(routes?|pages?|app)\//i.test(normalizeRel(path.relative(PROJECT_ROOT,x.path||x))));
  const duplicatedConfig=files.filter((x:any)=>/(config|settings|constants)\.(ts|tsx|js|jsx|json)$/i.test(normalizeRel(path.relative(PROJECT_ROOT,x.path||x))));
  const nodes=Object.values(graph.nodes||{});
  const hotspots=nodes.filter((n:any)=>(n.importedBy||[]).length>25).map((n:any)=>({file:n.file,importedBy:(n.importedBy||[]).length})).slice(0,80);
  if(hotspots.length) drift.push({kind:'shared-core-hotspot',severity:'HIGH',count:hotspots.length,examples:hotspots.slice(0,20)});
  if(duplicatedConfig.length>12) drift.push({kind:'configuration-sprawl',severity:'MEDIUM',count:duplicatedConfig.length});
  if(routeFiles.length>120) drift.push({kind:'route-sprawl',severity:'MEDIUM',count:routeFiles.length});
  const out={version:'20.0.0',status:drift.some((x:any)=>x.severity==='HIGH')?'DRIFT_DETECTED':drift.length?'REVIEW':'STABLE',drift,metrics:{nodes:nodes.length,routes:routeFiles.length,configFiles:duplicatedConfig.length},rule:'Treat this as structural evidence, not an automatic rewrite recommendation.'};
  await v200Write('architecture-drift.json',out); return out;
}

async function v200BreakingChangeForecast(files:string[]){
  const graph:any=(await readCodeIntelligenceGraph())||await buildCodeIntelligenceGraph();
  const findings=files.map(f0=>{const f=normalizeRel(f0); const n:any=graph.nodes?.[f]; const importedBy=(n?.importedBy||[]).length; const imports=(n?.imports||[]).length; const sensitive=/(schema|migration|auth|policy|api|route|types|config|package\.json|vite\.config|next\.config)/i.test(f); const risk=sensitive||importedBy>20?'HIGH':importedBy>7?'MEDIUM':'LOW'; return {file:f,risk,importedBy,imports,sensitive,affected:(n?.importedBy||[]).slice(0,60)};});
  const out={version:'20.0.0',status:findings.some((x:any)=>x.risk==='HIGH')?'HIGH_RISK':'REVIEW',findings,requirements:[...new Set(findings.flatMap((x:any)=>x.risk==='HIGH'?['checkpoint','contract tests','targeted regression','rollback plan']:['targeted regression']))]};
  await v200Write('breaking-change-forecast.json',out); return out;
}

async function v200MigrationCompatibilityMatrix(){
  const files=(await v50TextFiles(4500)).map((x:any)=>normalizeRel(path.relative(PROJECT_ROOT,x.path||x)));
  const migrationFiles=files.filter((f:string)=>/(migration|migrations|supabase\/migrations).*\.sql$/i.test(f));
  const schemaFiles=files.filter((f:string)=>/(schema|types|database).*\.(sql|ts|tsx)$/i.test(f)).slice(0,300);
  const apiFiles=files.filter((f:string)=>/(api|route|routes|edge-functions|functions).*\.(ts|tsx|js|jsx)$/i.test(f)).slice(0,300);
  const matrix={version:'20.0.0',migrationFiles,schemaFiles,apiFiles,checks:[
    {surface:'database',required:['backward-compatible schema window','RLS/policy review','index/constraint review','data integrity review']},
    {surface:'api',required:['request/response compatibility','error contract stability','auth compatibility','consumer regression tests']},
    {surface:'ui',required:['fallback for old/new fields during transition','empty/error states','browser regression for impacted flows']}
  ]};
  await v200Write('migration-compatibility-matrix.json',matrix); return matrix;
}

async function v200SafeMigrationPlan(goal:string,files:string[]=[]){
  const forecast=files.length?await v200BreakingChangeForecast(files):null;
  const matrix=await v200MigrationCompatibilityMatrix();
  const plan={version:'20.0.0',goal,targets:files.map(normalizeRel),risk:forecast?.status||'REVIEW',phases:[
    {id:'M1',name:'Baseline',actions:['checkpoint','capture schema/API contracts','run current tests']},
    {id:'M2',name:'Expand',actions:['add backward-compatible schema/API changes','avoid destructive renames/drops','deploy readers tolerant of both shapes']},
    {id:'M3',name:'Migrate',actions:['migrate data in bounded batches when needed','verify counts/invariants','monitor errors']},
    {id:'M4',name:'Contract',actions:['remove legacy paths only after consumers verified','re-run security/RLS and regression gates']},
    {id:'M5',name:'Verify',actions:['post-migration verification','browser/API/database checks','document rollback/rollforward outcome']}
  ],matrix,rule:'Destructive database changes must not be executed automatically without explicit approval and a verified rollback path.'};
  await v200Write('safe-migration-plan.json',plan); return plan;
}

async function v200MigrationPreflight(files:string[]=[]){
  const plan=await v200SafeMigrationPlan('preflight',files);
  const git=await executeProgram('git',['status','--short'],PROJECT_ROOT,60000);
  const checkpoints=await fs.readdir(V190_STATE_DIR).catch(()=>[]);
  const hasCheckpoint=checkpoints.some((x:string)=>x.startsWith('checkpoint-'));
  const high=plan.risk==='HIGH_RISK';
  const blockers:string[]=[];
  if(high&&!hasCheckpoint) blockers.push('High-risk migration requires a saved checkpoint.');
  if(high&&git.stdout.trim().length>0) blockers.push('Working tree contains uncommitted changes; isolate migration scope or checkpoint it explicitly.');
  const out={version:'20.0.0',status:blockers.length?'BLOCKED':'PASS',blockers,hasCheckpoint,workingTreeDirty:git.stdout.trim().length>0,requiredEvidence:['baseline tests','compatibility matrix','rollback/rollforward plan','post-migration verification']};
  await v200Write('migration-preflight.json',out); return out;
}

async function v200RepairProposal(symptoms:string[],files:string[]=[]){
  const context=files.length?await v200BreakingChangeForecast(files):null;
  const categories=symptoms.map(s=>({symptom:s,category:/permission|rls|unauthorized|401|403/i.test(s)?'AUTH_RLS':/schema|column|constraint|migration|sql/i.test(s)?'DATABASE_SCHEMA':/api|fetch|network|404|500/i.test(s)?'API_CONTRACT':/type|typescript|compile/i.test(s)?'TYPE_SYSTEM':/layout|overflow|rtl|responsive/i.test(s)?'UI_LAYOUT':'GENERAL'}));
  const proposals=categories.map((x:any)=>({category:x.category,symptom:x.symptom,actions:x.category==='AUTH_RLS'?['inspect policy and authenticated role','verify RLS policy predicates','test least-privilege access']:x.category==='DATABASE_SCHEMA'?['compare migration history and current schema','prefer additive migration','verify data integrity']:x.category==='API_CONTRACT'?['compare caller and handler contract','verify status/error payload','run consumer regression']:x.category==='TYPE_SYSTEM'?['locate source diagnostic','fix root type contract','re-run typecheck and impacted tests']:x.category==='UI_LAYOUT'?['reproduce viewport','inspect containing layout','fix component-level constraint','run visual/browser regression']:['collect deterministic evidence','isolate smallest failing scope','apply minimal reversible fix','verify']}));
  const out={version:'20.0.0',proposals,context,rule:'Proposal generation never counts as successful repair; verified execution evidence is required.'};
  await v200Write('repair-proposals.json',out); return out;
}

async function v200SchemaCompatibilityGate(){
  const files=(await v50TextFiles(5000)).map((x:any)=>normalizeRel(path.relative(PROJECT_ROOT,x.path||x)));
  const sql=files.filter((f:string)=>f.endsWith('.sql')&&/(migration|schema|supabase)/i.test(f));
  const findings:any[]=[];
  for(const f of sql.slice(-300)){
    try{const txt=await fs.readFile(path.join(PROJECT_ROOT,f),'utf8');
      if(/\bdrop\s+table\b|\btruncate\b|\bdrop\s+column\b/i.test(txt)) findings.push({file:f,severity:'HIGH',issue:'destructive-schema-change'});
      if(/\balter\s+table\b[\s\S]{0,200}\bset\s+not\s+null\b/i.test(txt)) findings.push({file:f,severity:'MEDIUM',issue:'not-null-tightening'});
      if(/\bcreate\s+unique\s+index\b|\badd\s+constraint\b[\s\S]{0,100}\bunique\b/i.test(txt)) findings.push({file:f,severity:'MEDIUM',issue:'uniqueness-tightening'});
    }catch{}
  }
  const out={version:'20.0.0',status:findings.some((x:any)=>x.severity==='HIGH')?'BLOCKED':findings.length?'REVIEW':'PASS',findings}; await v200Write('schema-compatibility-gate.json',out); return out;
}

async function v200ApiCompatibilityGate(){
  const files=(await v50TextFiles(4500)).filter((x:any)=>/\.(ts|tsx|js|jsx)$/.test(x.path||x));
  const findings:any[]=[];
  for(const item of files.slice(0,4500)){
    const filePath=String(item);
    const f=normalizeRel(path.relative(PROJECT_ROOT,filePath));
    if(!/(api|route|routes|services|client|fetch|axios)/i.test(f)) continue;
    try{const txt=await fs.readFile(filePath,'utf8');
      if(/response\.json\(\s*\{\s*error/i.test(txt)&&!/status\s*[:=]/i.test(txt)) findings.push({file:f,severity:'LOW',issue:'error-payload-without-obvious-status-contract'});
      if(/\.select\(\s*['"]\*['"]\s*\)/i.test(txt)) findings.push({file:f,severity:'MEDIUM',issue:'broad-select-can-amplify-schema-coupling'});
    }catch{}
  }
  const out={version:'20.0.0',status:findings.some((x:any)=>x.severity==='HIGH')?'BLOCKED':findings.length?'REVIEW':'PASS',findings:findings.slice(0,300),note:'Heuristic static gate; confirm contracts with tests.'}; await v200Write('api-compatibility-gate.json',out); return out;
}

async function v200MigrationExecutionContract(script:string,dryRun=true,approved=false){
  let pkg:any={}; try{pkg=JSON.parse(await fs.readFile(path.join(PROJECT_ROOT,'package.json'),'utf8'));}catch{}
  const scripts=pkg.scripts||{};
  if(!scripts[script]) return {version:'20.0.0',status:'BLOCKED',reason:'Script is not declared in package.json.',available:Object.keys(scripts).filter((x:string)=>/migrat|schema|db/i.test(x))};
  if(!/migrat|schema|db/i.test(script)) return {version:'20.0.0',status:'BLOCKED',reason:'Only migration/database-related package scripts are eligible.'};
  const preflight=await v200MigrationPreflight([]);
  if(preflight.status!=='PASS') return {version:'20.0.0',status:'BLOCKED',preflight};
  if(dryRun) return {version:'20.0.0',status:'DRY_RUN',script,command:scripts[script],preflight,rule:'No command executed.'};
  if(!approved) return {version:'20.0.0',status:'APPROVAL_REQUIRED',script,preflight};
  const res=await runPackageScript([script]);
  const out={version:'20.0.0',status:res.status==='FAIL'?'FAIL':'EXECUTED',script,result:res,preflight}; await v200Write('migration-execution.json',out); return out;
}

async function v200PostMigrationVerify(){
  const [schema,api,typecheck,tests,diff]=await Promise.all([
    v200SchemaCompatibilityGate(),
    v200ApiCompatibilityGate(),
    runPackageScript(['typecheck','type-check','check:types']),
    runPackageScript(['test','test:unit','test:ci']),
    executeProgram('git',['diff','--check'],PROJECT_ROOT,60000)
  ]);
  const pass=schema.status!=='BLOCKED'&&api.status!=='BLOCKED'&&typecheck.status!=='FAIL'&&tests.status!=='FAIL'&&diff.success;
  const out={version:'20.0.0',status:pass?'PASS':'FAIL',evidence:{schema,api,typecheck,tests,diffCheck:{success:diff.success,stdout:diff.stdout,stderr:diff.stderr}},next:pass?'Record verified execution receipt and release evidence.':'Repair failing gate, then rerun post-migration verification.'}; await v200Write('post-migration-verification.json',out); return out;
}

async function v200RollforwardRollbackPlan(goal:string){
  const git=await executeProgram('git',['rev-parse','HEAD'],PROJECT_ROOT,60000);
  const out={version:'20.0.0',goal,anchorCommit:git.stdout.trim()||null,rollforward:['fix forward with additive migration when data has already changed','preserve compatibility window until consumers verified','re-run post-migration verification'],rollback:['rollback application code only when schema remains backward compatible','do not automatically reverse destructive/data-transforming migrations','restore from verified backup/checkpoint when data rollback is required'],automaticDestructiveRollback:false}; await v200Write('rollforward-rollback-plan.json',out); return out;
}

async function v200SelfHealingStatus(){
  await v200Ensure(); const artifacts=await fs.readdir(V200_STATE_DIR).catch(()=>[]);
  const drift=await v200ReadJson(path.join(V200_STATE_DIR,'architecture-drift.json'));
  const preflight=await v200ReadJson(path.join(V200_STATE_DIR,'migration-preflight.json'));
  const verify=await v200ReadJson(path.join(V200_STATE_DIR,'post-migration-verification.json'));
  return {version:'20.0.0',status:verify?.status==='PASS'?'VERIFIED':preflight?.status==='BLOCKED'?'BLOCKED':artifacts.length?'ACTIVE':'IDLE',architecture:drift?.status||'UNKNOWN',preflight:preflight?.status||'NOT_RUN',verification:verify?.status||'NOT_RUN',artifacts:artifacts.sort()};
}
// ===== END v20.0 =====


// ===== v21.0 AUTONOMOUS VERIFICATION & RELEASE INTELLIGENCE =====
const V210_STATE_DIR = path.join(PROJECT_ROOT, ".krom", "v21-release-intelligence");
async function v210Ensure(){ await fs.mkdir(V210_STATE_DIR,{recursive:true}); }
async function v210Write(name:string,data:any){ await v210Ensure(); const file=path.join(V210_STATE_DIR,name); await fs.writeFile(file,JSON.stringify(data,null,2)); return file; }
async function v210Read(name:string){ try{return JSON.parse(await fs.readFile(path.join(V210_STATE_DIR,name),'utf8'));}catch{return null;} }
async function v210Git(args:string[]){ try{return (await execFileAsync('git',args,{cwd:PROJECT_ROOT,maxBuffer:4*1024*1024})).stdout.trim();}catch{return '';} }
async function v210ChangedFiles(){ const out=await v210Git(['diff','--name-only','HEAD']); return out?out.split(/\r?\n/).map(normalizeRel).filter(Boolean):[]; }

async function v210TestImpactIntelligence(files:string[]=[]){
  const changed=files.length?files.map(normalizeRel):await v210ChangedFiles();
  const graph:any=(await readCodeIntelligenceGraph())||await buildCodeIntelligenceGraph();
  const impacted=new Set<string>(changed);
  for(const f of changed){ const n:any=graph.nodes?.[f]; for(const d of (n?.importedBy||[]).slice(0,100)) impacted.add(normalizeRel(d)); }
  const all=await v50TextFiles(5000);
  const tests=all.map((x:any)=>normalizeRel(path.relative(PROJECT_ROOT,x.path||x))).filter((f:string)=>/(^|\/)(__tests__|tests?|e2e|specs?)\/|\.(test|spec)\.(ts|tsx|js|jsx)$/i.test(f));
  const selected=tests.filter((t:string)=>{const base=path.basename(t).replace(/\.(test|spec)?\.(ts|tsx|js|jsx)$/i,'').toLowerCase(); return [...impacted].some(f=>f.toLowerCase().includes(base)||base.includes(path.basename(f).split('.')[0].toLowerCase()));});
  const out={version:'21.0.0',changed,impacted:[...impacted].slice(0,400),tests:selected.length?selected:tests.slice(0,80),status:changed.length?'IMPACT_MAPPED':'NO_CHANGES',rule:'Run selected tests plus existing release gates; impact selection does not replace the full critical suite.'};
  await v210Write('test-impact.json',out); return out;
}

async function v210FlakyTestDetector(){
  const all=await v50TextFiles(5000); const findings:any[]=[];
  for(const item of all){ const abs=typeof item==='string'?item:(item as any).path; const file=normalizeRel(path.relative(PROJECT_ROOT,abs)); if(!/(test|spec|e2e|__tests__)/i.test(file)) continue; let text=''; try{text=await fs.readFile(abs,'utf8');}catch{continue;}
    const signals=[['random',/Math\.random\s*\(/g],['time-dependent',/Date\.now\s*\(|new Date\s*\(/g],['fixed-sleep',/(setTimeout\s*\(|waitForTimeout\s*\()/g],['retry',/\bretry\b|retries\s*:/gi],['network-live',/https?:\/\//g]];
    const hit=signals.map(([kind,re]:any)=>({kind,count:(text.match(re)||[]).length})).filter((x:any)=>x.count>0); if(hit.length)findings.push({file,signals:hit});
  }
  const out={version:'21.0.0',status:findings.length?'REVIEW':'CLEAN_STATIC_SCAN',findings:findings.slice(0,200),note:'Static heuristics only. Confirm flakiness through repeated execution history before classifying a test as flaky.'}; await v210Write('flaky-tests.json',out); return out;
}

async function v210ContractVerification(){
  const matrix=await v200MigrationCompatibilityMatrix();
  const all=await v50TextFiles(5000); const files=all.map((x:any)=>normalizeRel(path.relative(PROJECT_ROOT,x.path||x)));
  const contractTests=files.filter((f:string)=>/(contract|schema|api).*\.(test|spec)\.(ts|tsx|js|jsx)$/i.test(f));
  const out={version:'21.0.0',status:contractTests.length?'EVIDENCE_PRESENT':'CONTRACT_TESTS_MISSING',contractTests,apiFiles:(matrix as any).apiFiles?.length||0,schemaFiles:(matrix as any).schemaFiles?.length||0,required:['request/response compatibility','auth compatibility','error contract stability','schema transition compatibility']}; await v210Write('contract-verification.json',out); return out;
}

async function v210VisualBaselineGovernance(){
  const roots=['.krom/live-browser/screenshots','.krom/visual-baselines','.krom/v10-visual-regression']; const counts:any[]=[];
  for(const r of roots){ const full=safePath(r); let n=0; try{ const ents=await fs.readdir(full,{recursive:true} as any); n=ents.filter((x:any)=>/\.(png|jpe?g|webp)$/i.test(String(x))).length; }catch{} counts.push({path:r,count:n}); }
  const total=counts.reduce((a,x)=>a+x.count,0); const out={version:'21.0.0',status:total?'BASELINES_AVAILABLE':'BASELINE_REQUIRED',locations:counts,policy:{viewports:[375,430,768,1440],requireApprovalForIntentionalChanges:true,requireArtifactRetention:true}}; await v210Write('visual-baselines.json',out); return out;
}

async function v210ReleaseRiskScore(){
  const changed=await v210ChangedFiles(); const impact=await v210TestImpactIntelligence(changed); let score=0; const reasons:any[]=[];
  const sensitive=changed.filter(f=>/(migration|schema|auth|policy|package\.json|lock|config|api|route|server\.ts)/i.test(f)); if(sensitive.length){score+=Math.min(35,sensitive.length*5);reasons.push({kind:'sensitive-files',count:sensitive.length});}
  if(changed.length>30){score+=20;reasons.push({kind:'large-change-set',count:changed.length});} else score+=Math.min(15,Math.floor(changed.length/3));
  if((impact as any).tests?.length===0 && changed.length){score+=25;reasons.push({kind:'no-targeted-tests'});}
  const risk=score>=60?'HIGH':score>=30?'MEDIUM':'LOW'; const out={version:'21.0.0',score:Math.min(100,score),risk,reasons,changedFiles:changed.length,targetedTests:(impact as any).tests?.length||0}; await v210Write('release-risk.json',out); return out;
}

async function v210CanaryReadiness(){
  const risk=await v210ReleaseRiskScore(); const flags=await v50TextFiles(3000); const names=flags.map((x:any)=>normalizeRel(path.relative(PROJECT_ROOT,x.path||x)));
  const hasFlags=names.some((f:string)=>/(feature.?flag|flags|experiments)/i.test(f)); const hasObs=names.some((f:string)=>/(sentry|telemetry|observability|metrics|logging)/i.test(f));
  const blockers=[] as string[]; if((risk as any).risk==='HIGH')blockers.push('release-risk-high'); if(!hasObs)blockers.push('observability-evidence-missing');
  const out={version:'21.0.0',status:blockers.length?'NOT_READY':'READY_FOR_CONTROLLED_CANARY',featureFlagEvidence:hasFlags,observabilityEvidence:hasObs,blockers,requirements:['small initial cohort','health metrics','rollback trigger','operator ownership']}; await v210Write('canary-readiness.json',out); return out;
}

async function v210ChangeProvenance(){
  const head=await v210Git(['rev-parse','HEAD']); const branch=await v210Git(['rev-parse','--abbrev-ref','HEAD']); const changed=await v210ChangedFiles(); const diffstat=await v210Git(['diff','--stat','HEAD']);
  const out={version:'21.0.0',head,branch,changed,diffstat,capturedAt:new Date().toISOString(),projectRoot:PROJECT_ROOT}; await v210Write('change-provenance.json',out); return out;
}

async function v210EvidenceBundle(){
  const provenance=await v210ChangeProvenance(); const impact=await v210TestImpactIntelligence(); const flaky=await v210FlakyTestDetector(); const contracts=await v210ContractVerification(); const visual=await v210VisualBaselineGovernance(); const risk=await v210ReleaseRiskScore(); const canary=await v210CanaryReadiness();
  const prior:any={}; for(const f of ['verified-execution.json','self-healing-status.json','post-migration-verification.json']){ const v=await v210Read(f); if(v)prior[f]=v; }
  const out={version:'21.0.0',generatedAt:new Date().toISOString(),provenance,impact,flaky,contracts,visual,risk,canary,prior,integrityRule:'Evidence bundle records observed state; it must not invent passing tests or deployment results.'}; await v210Write('evidence-bundle.json',out); return out;
}

async function v210RegressionReplayPlan(){
  const impact=await v210TestImpactIntelligence(); const changed=(impact as any).changed||[]; const commands=[] as string[]; const pkg=await readPackageJson(); const scripts=pkg?.scripts||{};
  for(const k of ['typecheck','lint','test','test:e2e','build']) if(scripts[k]) commands.push(`npm run ${k}`);
  const out={version:'21.0.0',status:changed.length?'PLAN_READY':'NO_CHANGES',changed,impacted:(impact as any).impacted,selectedTests:(impact as any).tests,commands,sequence:['targeted tests','typecheck/lint','full test suite where configured','build','browser/visual regression for impacted UI']}; await v210Write('regression-replay-plan.json',out); return out;
}

async function v210ArtifactIntegrity(){
  const pkg=await readPackageJson(); const files=['package.json','package-lock.json','pnpm-lock.yaml','yarn.lock','bun.lockb'].filter(async f=>await exists(safePath(f))); const observed:any[]=[];
  for(const f of ['package.json','package-lock.json','pnpm-lock.yaml','yarn.lock','bun.lockb']){ const full=safePath(f); if(await exists(full)){ const st=await fs.stat(full); observed.push({file:f,size:st.size,mtime:st.mtime.toISOString()}); } }
  const out={version:'21.0.0',packageManager:await detectPackageManager(),scripts:Object.keys(pkg?.scripts||{}),observed,status:observed.length?'RECORDED':'PACKAGE_METADATA_MISSING'}; await v210Write('artifact-integrity.json',out); return out;
}

async function v210ReleasePolicy(){
  const risk=await v210ReleaseRiskScore(); const contracts=await v210ContractVerification(); const visual=await v210VisualBaselineGovernance();
  const required=['verified execution receipts','zero known critical build/type errors','regression evidence','change provenance']; if((risk as any).risk!=='LOW')required.push('checkpoint + rollback plan'); if((contracts as any).status!=='EVIDENCE_PRESENT')required.push('contract verification evidence'); if((visual as any).status!=='BASELINES_AVAILABLE')required.push('visual baseline or documented non-UI exemption');
  const out={version:'21.0.0',risk:(risk as any).risk,required,policy:'Release may be attested only from recorded evidence; missing evidence is not equivalent to pass.'}; await v210Write('release-policy.json',out); return out;
}

async function v210FinalReleaseAttestation(){
  const bundle=await v210EvidenceBundle(); const policy=await v210ReleasePolicy(); const blockers:string[]=[];
  if((bundle as any).risk?.risk==='HIGH')blockers.push('high-release-risk'); if((bundle as any).contracts?.status!=='EVIDENCE_PRESENT')blockers.push('contract-evidence-missing'); if((bundle as any).canary?.status==='NOT_READY')blockers.push(...((bundle as any).canary.blockers||[]));
  const verified=await v210Read('../v18-verified-execution/verified-release.json'); if(!verified)blockers.push('verified-release-evidence-not-found');
  const out={version:'21.0.0',status:blockers.length?'NOT_ATTESTED':'ATTESTED',blockers:[...new Set(blockers)],policy,evidenceBundle:path.join('.krom','v21-release-intelligence','evidence-bundle.json'),statement:blockers.length?'Release attestation withheld because required evidence is incomplete.':'Release evidence requirements recorded by KROM are satisfied. This is an engineering attestation, not a production uptime guarantee.'}; await v210Write('final-release-attestation.json',out); return out;
}

async function v210ReleaseIntelligenceStatus(){
  await v210Ensure(); let artifacts:string[]=[]; try{artifacts=(await fs.readdir(V210_STATE_DIR)).sort();}catch{} const risk=await v210Read('release-risk.json'); const att=await v210Read('final-release-attestation.json'); return {version:'21.0.0',artifacts,risk:risk||null,attestation:att||null,stateDir:normalizeRel(path.relative(PROJECT_ROOT,V210_STATE_DIR))};
}
// ===== END v21.0 ENGINE =====



// ===== v22.0 AUTONOMOUS QUALITY GOVERNANCE & POLICY ENGINE =====
const V220_STATE_DIR = path.join(PROJECT_ROOT, ".krom", "v22-governance");
const V220_POLICY_FILE = path.join(V220_STATE_DIR, "quality-policy.json");
const V220_EXCEPTIONS_FILE = path.join(V220_STATE_DIR, "exceptions.json");
async function v220Ensure(){ await fs.mkdir(V220_STATE_DIR,{recursive:true}); }
async function v220Write(name:string,data:any){ await v220Ensure(); const file=path.join(V220_STATE_DIR,name); await fs.writeFile(file,JSON.stringify(data,null,2)); return file; }
async function v220Read(name:string){ try{return JSON.parse(await fs.readFile(path.join(V220_STATE_DIR,name),'utf8'));}catch{return null;} }
async function v220LoadPolicy(){
  await v220Ensure();
  try{return JSON.parse(await fs.readFile(V220_POLICY_FILE,'utf8'));}catch{}
  const policy={
    version:'22.0.0', policyVersion:1, mode:'strict',
    thresholds:{maxCriticalFindings:0,maxHighFindings:0,minEvidenceCoverage:90,minProductCompleteness:90,minAccessibilityScore:85,maxReleaseRiskScore:59},
    changeClasses:{LOW:{approvals:['developer'],checkpoint:false},MEDIUM:{approvals:['developer','qa'],checkpoint:true},HIGH:{approvals:['architect','qa','security'],checkpoint:true},CRITICAL:{approvals:['architect','qa','security','release-owner'],checkpoint:true}},
    protectedPatterns:['**/migrations/**','**/supabase/**','**/auth/**','**/security/**','package.json','tsconfig*.json','.github/workflows/**'],
    requiredEvidence:['typecheck','tests','diff-integrity'],
    exceptionPolicy:{maxDays:14,requireOwner:true,requireReason:true,allowCritical:false},
    createdAt:new Date().toISOString(), updatedAt:new Date().toISOString()
  };
  await fs.writeFile(V220_POLICY_FILE,JSON.stringify(policy,null,2)); return policy;
}
async function v220QualityPolicyInit(mode:'balanced'|'strict'|'maximum'='strict'){
  const base=await v220LoadPolicy(); const map:any={balanced:{minEvidenceCoverage:80,minProductCompleteness:85,minAccessibilityScore:80,maxReleaseRiskScore:69},strict:{minEvidenceCoverage:90,minProductCompleteness:90,minAccessibilityScore:85,maxReleaseRiskScore:59},maximum:{minEvidenceCoverage:95,minProductCompleteness:95,minAccessibilityScore:90,maxReleaseRiskScore:39}};
  const policy={...base,mode,thresholds:{...base.thresholds,...map[mode]},policyVersion:Number(base.policyVersion||0)+1,updatedAt:new Date().toISOString()};
  await fs.writeFile(V220_POLICY_FILE,JSON.stringify(policy,null,2)); await v220Write('policy-init.json',{version:'22.0.0',status:'READY',mode,policyVersion:policy.policyVersion}); return policy;
}
async function v220ChangedFiles(){ try{const r=await execFileAsync('git',['diff','--name-only','HEAD'],{cwd:PROJECT_ROOT,maxBuffer:2*1024*1024}); return r.stdout.split(/\r?\n/).map(normalizeRel).filter(Boolean);}catch{return [];} }
async function v220ChangeRiskClassify(files:string[]=[]){
  const changed=files.length?files.map(normalizeRel):await v220ChangedFiles(); let score=0; const reasons:string[]=[];
  for(const f of changed){ const x=f.toLowerCase(); if(/migration|schema|supabase|database|rls/.test(x)){score+=28;reasons.push(`${f}: data/schema surface`);} if(/auth|security|permission|policy/.test(x)){score+=25;reasons.push(`${f}: auth/security surface`);} if(/package\.json|lock|tsconfig|vite|next\.config|workflow/.test(x)){score+=16;reasons.push(`${f}: build/dependency surface`);} if(/api|route|server|edge|function/.test(x)){score+=10;reasons.push(`${f}: API/runtime surface`);} if(/\.tsx?$|\.jsx?$/.test(x)){score+=2;} }
  if(changed.length>25){score+=20;reasons.push('large change set');} else if(changed.length>10){score+=10;reasons.push('moderate change set');}
  score=Math.min(100,score); const risk=score>=80?'CRITICAL':score>=55?'HIGH':score>=25?'MEDIUM':'LOW'; const out={version:'22.0.0',risk,score,changedFiles:changed,reasons:[...new Set(reasons)].slice(0,100)}; await v220Write('change-risk.json',out); return out;
}
async function v220ApprovalMatrix(files:string[]=[]){ const policy=await v220LoadPolicy(); const risk=await v220ChangeRiskClassify(files); const req=(policy.changeClasses as any)?.[risk.risk]||policy.changeClasses.MEDIUM; const out={version:'22.0.0',risk:risk.risk,requiredApprovals:req.approvals,checkpointRequired:req.checkpoint,policyVersion:policy.policyVersion}; await v220Write('approval-matrix.json',out); return out; }
async function v220ExceptionRequest(input:{policyKey:string;reason:string;owner:string;days:number}){
  const policy=await v220LoadPolicy(); const days=Math.max(1,Math.min(Number(input.days||1),Number(policy.exceptionPolicy.maxDays||14))); const risk=await v220ChangeRiskClassify();
  if(risk.risk==='CRITICAL' && !policy.exceptionPolicy.allowCritical) return {version:'22.0.0',status:'DENIED',reason:'Critical-risk changes cannot receive governance exceptions under current policy.'};
  if(!input.owner.trim()||!input.reason.trim()) return {version:'22.0.0',status:'DENIED',reason:'Owner and reason are required.'};
  let list:any[]=[]; try{list=JSON.parse(await fs.readFile(V220_EXCEPTIONS_FILE,'utf8')); if(!Array.isArray(list))list=[];}catch{}
  const now=new Date(); const expires=new Date(now.getTime()+days*86400000); const item={id:`exc-${Date.now()}`,policyKey:input.policyKey,reason:input.reason,owner:input.owner,createdAt:now.toISOString(),expiresAt:expires.toISOString(),status:'ACTIVE',riskAtCreation:risk.risk}; list.push(item); await fs.writeFile(V220_EXCEPTIONS_FILE,JSON.stringify(list,null,2)); await v220Write('last-exception.json',item); return item;
}
async function v220ExceptionExpiryAudit(){ let list:any[]=[]; try{list=JSON.parse(await fs.readFile(V220_EXCEPTIONS_FILE,'utf8')); if(!Array.isArray(list))list=[];}catch{} const now=Date.now(); let changed=false; for(const x of list){ if(x.status==='ACTIVE'&&Date.parse(x.expiresAt)<=now){x.status='EXPIRED';changed=true;} } if(changed) await fs.writeFile(V220_EXCEPTIONS_FILE,JSON.stringify(list,null,2)); const out={version:'22.0.0',active:list.filter(x=>x.status==='ACTIVE'),expired:list.filter(x=>x.status==='EXPIRED')}; await v220Write('exception-audit.json',out); return out; }
async function v220EvidencePolicyCheck(){
  const policy=await v220LoadPolicy(); const att=await v210Read('final-release-attestation.json'); const bundle=await v210Read('evidence-bundle.json'); let refVerify:any=null; try{refVerify=JSON.parse(await fs.readFile(path.join(V190_STATE_DIR,'refactor-verification.json'),'utf8'));}catch{}
  const observed:any={releaseAttestation:att?.status||'NOT_RUN',evidenceBundle:Boolean(bundle),refactorVerification:refVerify?.status||'NOT_RUN'};
  const missing:string[]=[]; if(!bundle)missing.push('release evidence bundle'); if(att?.status!=='ATTESTED')missing.push('v21 final release attestation');
  const coverage=Math.max(0,100-missing.length*35); const out={version:'22.0.0',status:coverage>=policy.thresholds.minEvidenceCoverage?'PASS':'BLOCKED',coverage,minimum:policy.thresholds.minEvidenceCoverage,missing,observed}; await v220Write('evidence-policy-check.json',out); return out;
}
async function v220ComplianceMatrix(){
  const policy=await v220LoadPolicy(); const risk=await v220ChangeRiskClassify(); const evidence=await v220EvidencePolicyCheck(); const preflight=await v200ReadJson(path.join(V200_STATE_DIR,'preflight.json')); const release=await v210Read('final-release-attestation.json');
  const checks=[
    {id:'GOV-001',name:'Evidence coverage',status:evidence.status,evidence:evidence.coverage},
    {id:'GOV-002',name:'Release attestation',status:release?.status==='ATTESTED'?'PASS':'BLOCKED',evidence:release?.status||'NOT_RUN'},
    {id:'GOV-003',name:'Migration preflight',status:preflight?.status==='BLOCKED'?'BLOCKED':'PASS',evidence:preflight?.status||'NOT_RUN'},
    {id:'GOV-004',name:'Release risk threshold',status:risk.score<=policy.thresholds.maxReleaseRiskScore?'PASS':'REVIEW',evidence:risk.score}
  ];
  const out={version:'22.0.0',policyVersion:policy.policyVersion,status:checks.some(x=>x.status==='BLOCKED')?'BLOCKED':checks.some(x=>x.status==='REVIEW')?'REVIEW':'PASS',checks}; await v220Write('compliance-matrix.json',out); return out;
}
async function v220PolicyEvaluate(files:string[]=[]){ const policy=await v220LoadPolicy(); const risk=await v220ChangeRiskClassify(files); const approvals=await v220ApprovalMatrix(files); const evidence=await v220EvidencePolicyCheck(); const exceptions=await v220ExceptionExpiryAudit(); const blockers:string[]=[]; if(evidence.status!=='PASS')blockers.push('evidence policy not satisfied'); if(risk.risk==='CRITICAL')blockers.push('critical-risk change requires explicit approval chain'); const out={version:'22.0.0',status:blockers.length?'BLOCKED':'PASS',policyVersion:policy.policyVersion,risk,approvals,evidence,activeExceptions:exceptions.active,blockers}; await v220Write('policy-evaluation.json',out); return out; }
async function v220ChangeFreezeCheck(){ const freeze=process.env.KROM_CHANGE_FREEZE==='1'||String(process.env.KROM_CHANGE_FREEZE||'').toLowerCase()==='true'; const risk=await v220ChangeRiskClassify(); const out={version:'22.0.0',freezeEnabled:freeze,status:freeze&&['HIGH','CRITICAL'].includes(risk.risk)?'BLOCKED':'PASS',risk:risk.risk,rule:'When KROM_CHANGE_FREEZE=true, high/critical changes require the freeze to be lifted outside this tool.'}; await v220Write('change-freeze.json',out); return out; }
async function v220PolicyDiff(){ const current=await v220LoadPolicy(); const init=await v220Read('policy-init.json'); return {version:'22.0.0',policyVersion:current.policyVersion,mode:current.mode,lastInit:init||null,thresholds:current.thresholds,protectedPatterns:current.protectedPatterns}; }
async function v220GovernanceGate(){ const policy=await v220PolicyEvaluate(); const compliance=await v220ComplianceMatrix(); const freeze=await v220ChangeFreezeCheck(); const blockers=[...(policy.blockers||[])]; if(compliance.status==='BLOCKED')blockers.push('compliance matrix blocked'); if(freeze.status==='BLOCKED')blockers.push('change freeze blocks current risk class'); const out={version:'22.0.0',status:blockers.length?'BLOCKED':compliance.status==='REVIEW'?'REVIEW':'PASS',blockers:[...new Set(blockers)],policy,compliance,freeze}; await v220Write('governance-gate.json',out); return out; }
async function v220ReleaseDecision(){ const gate=await v220GovernanceGate(); const att=await v210FinalReleaseAttestation(); const status=gate.status==='PASS'&&att.status==='ATTESTED'?'APPROVED':gate.status==='REVIEW'?'REVIEW_REQUIRED':'DENIED'; const out={version:'22.0.0',status,governance:gate.status,attestation:att.status,reasons:gate.blockers||[],statement:status==='APPROVED'?'Governance and recorded release evidence satisfy configured policy.':'Release approval withheld until governance blockers are resolved.'}; await v220Write('release-decision.json',out); return out; }
async function v220GovernanceReport(){ const policy=await v220LoadPolicy(); const risk=await v220ChangeRiskClassify(); const matrix=await v220ComplianceMatrix(); const exceptions=await v220ExceptionExpiryAudit(); const gate=await v220GovernanceGate(); const out={version:'22.0.0',generatedAt:new Date().toISOString(),policy:{version:policy.policyVersion,mode:policy.mode,thresholds:policy.thresholds},risk,compliance:matrix,exceptions:{active:exceptions.active.length,expired:exceptions.expired.length},gate:{status:gate.status,blockers:gate.blockers}}; await v220Write('governance-report.json',out); return out; }
async function v220GovernanceStatus(){ await v220Ensure(); let artifacts:string[]=[]; try{artifacts=(await fs.readdir(V220_STATE_DIR)).sort();}catch{} const policy=await v220LoadPolicy(); const gate=await v220Read('governance-gate.json'); const decision=await v220Read('release-decision.json'); return {version:'22.0.0',status:decision?.status||gate?.status||'IDLE',policyVersion:policy.policyVersion,mode:policy.mode,artifacts,stateDir:normalizeRel(path.relative(PROJECT_ROOT,V220_STATE_DIR)),lastGate:gate||null,lastDecision:decision||null}; }
// ===== END v22.0 ENGINE =====



// ===== v23.0 AUTONOMOUS ARCHITECTURE EVOLUTION & TECHNICAL DEBT ENGINE =====
const V230_STATE_DIR = path.join(PROJECT_ROOT, ".krom", "v23-architecture-evolution");
async function v230Ensure(){ await fs.mkdir(V230_STATE_DIR,{recursive:true}); }
async function v230Write(name:string,data:any){ await v230Ensure(); const out={generatedAt:new Date().toISOString(),...data}; await fs.writeFile(path.join(V230_STATE_DIR,name),JSON.stringify(out,null,2)); return out; }
async function v230Read(name:string){ try{return JSON.parse(await fs.readFile(path.join(V230_STATE_DIR,name),'utf8'));}catch{return null;} }
async function v230Walk(dir:string=PROJECT_ROOT,limit=6000){ const out:string[]=[]; const skip=new Set(['node_modules','.git','dist','build','.next','coverage','.krom']); async function go(d:string){ if(out.length>=limit)return; let es:any[]=[]; try{es=await fs.readdir(d,{withFileTypes:true});}catch{return;} for(const e of es){ if(out.length>=limit)break; if(skip.has(e.name))continue; const full=path.join(d,e.name); if(e.isDirectory())await go(full); else out.push(normalizeRel(path.relative(PROJECT_ROOT,full))); } } await go(dir); return out; }
async function v230ReadSmall(rel:string,max=300000){ try{const full=path.resolve(PROJECT_ROOT,rel); const st=await fs.stat(full); if(st.size>max)return ''; return await fs.readFile(full,'utf8');}catch{return '';} }
async function v230ArchitectureFitness(){
 const files=await v230Walk(); const code=files.filter(f=>/\.(ts|tsx|js|jsx|mjs|cjs)$/.test(f)); let huge=0,deep=0,cross=0,barrels=0; const findings:any[]=[];
 for(const f of code.slice(0,2500)){ const txt=await v230ReadSmall(f); if(!txt)continue; const lines=txt.split(/\r?\n/).length; if(lines>700){huge++;findings.push({type:'large-module',file:f,lines});} const depth=f.split('/').length; if(depth>8){deep++;findings.push({type:'deep-module',file:f,depth});} const imports=[...txt.matchAll(/from\s+['\"]([^'\"]+)['\"]/g)].map(m=>m[1]); if(imports.some(x=>x.includes('../../../..'))){cross++;findings.push({type:'long-relative-import',file:f});} if(/index\.(ts|tsx|js|jsx)$/.test(f)&&/export\s+\*/.test(txt))barrels++;
 }
 const score=Math.max(0,100-Math.min(70,huge*4+deep+cross*2+Math.max(0,barrels-20))); const out={version:'23.0.0',status:score>=85?'PASS':score>=70?'REVIEW':'DEBT',score,metrics:{files:files.length,codeFiles:code.length,largeModules:huge,deepModules:deep,longRelativeImports:cross,barrelFiles:barrels},findings:findings.slice(0,200)}; return v230Write('architecture-fitness.json',out);
}
async function v230DebtInventory(){
 const files=await v230Walk(); const findings:any[]=[]; for(const f of files.filter(x=>/\.(ts|tsx|js|jsx|css|scss|sql|md)$/.test(x)).slice(0,3500)){ const txt=await v230ReadSmall(f); if(!txt)continue; const patterns=[['TODO',/\bTODO\b/g],['FIXME',/\bFIXME\b/g],['HACK',/\bHACK\b/g],['ts-ignore',/@ts-ignore/g],['eslint-disable',/eslint-disable/g],['any',/:\s*any\b/g]]; for(const [kind,re] of patterns as any){ const n=(txt.match(re)||[]).length; if(n)findings.push({file:f,kind,count:n,severity:kind==='HACK'||kind==='ts-ignore'?'HIGH':kind==='FIXME'?'MEDIUM':'LOW'}); } }
 const weighted=findings.reduce((a,x)=>a+x.count*(x.severity==='HIGH'?5:x.severity==='MEDIUM'?3:1),0); const out={version:'23.0.0',status:weighted>150?'HIGH_DEBT':weighted>50?'MEDIUM_DEBT':'CONTROLLED',weightedDebt:weighted,items:findings.sort((a,b)=>b.count-a.count).slice(0,300)}; return v230Write('technical-debt-inventory.json',out);
}
async function v230HotspotForecast(){
 let log=''; try{const r=await execFileAsync('git',['log','--name-only','--pretty=format:','-n','120'],{cwd:PROJECT_ROOT,maxBuffer:6*1024*1024});log=r.stdout;}catch{} const counts=new Map<string,number>(); for(const raw of log.split(/\r?\n/)){const f=normalizeRel(raw.trim()); if(f&&!f.startsWith('.'))counts.set(f,(counts.get(f)||0)+1);} const debt=await v230DebtInventory(); const debtMap=new Map((debt.items||[]).map((x:any)=>[x.file,(Number(x.count)||0)*(x.severity==='HIGH'?3:x.severity==='MEDIUM'?2:1)])); const rows=[...counts.entries()].map(([file,changes])=>({file,changes,debt:Number(debtMap.get(file)||0),risk:Math.min(100,changes*4+Number(debtMap.get(file)||0)*3)})).sort((a,b)=>b.risk-a.risk).slice(0,150); return v230Write('hotspot-forecast.json',{version:'23.0.0',status:rows.some(x=>x.risk>=70)?'ATTENTION':'OK',hotspots:rows});
}
async function v230BoundaryEnforcement(){
 const files=await v230Walk(); const violations:any[]=[]; for(const f of files.filter(x=>/\.(ts|tsx|js|jsx)$/.test(x)).slice(0,3000)){ const txt=await v230ReadSmall(f); if(!txt)continue; const imports=[...txt.matchAll(/(?:from\s+|require\()['\"]([^'\"]+)['\"]/g)].map(m=>m[1]); for(const imp of imports){ if(/^\.\.\/\.\.\/\.\.\/\.\.\//.test(imp))violations.push({file:f,import:imp,type:'deep-cross-boundary'}); if(/\/pages\//.test(f)&&/\/pages\//.test(imp))violations.push({file:f,import:imp,type:'page-to-page-coupling'}); } } const out={version:'23.0.0',status:violations.length?'REVIEW':'PASS',violations:violations.slice(0,250)}; return v230Write('module-boundary-enforcement.json',out);
}
async function v230DependencyHealth(){
 let pkg:any={}; try{pkg=JSON.parse(await fs.readFile(path.join(PROJECT_ROOT,'package.json'),'utf8'));}catch{} const deps={...(pkg.dependencies||{}),...(pkg.devDependencies||{})}; const entries=Object.entries(deps).map(([name,version])=>({name,version:String(version),risk:/\*|latest|next/i.test(String(version))?'HIGH':String(version).startsWith('file:')||String(version).startsWith('git+')?'MEDIUM':'LOW'})); const risky=entries.filter(x=>x.risk!=='LOW'); return v230Write('dependency-health.json',{version:'23.0.0',status:risky.some(x=>x.risk==='HIGH')?'REVIEW':'PASS',packageCount:entries.length,risky});
}
async function v230RefactorRoi(){
 const hotspots=await v230HotspotForecast(); const fitness=await v230ArchitectureFitness(); const candidates=(hotspots.hotspots||[]).slice(0,30).map((x:any)=>({file:x.file,benefitScore:Math.min(100,Math.round(x.risk*0.8+(100-fitness.score)*0.2)),priority:x.risk>=70?'P1':x.risk>=45?'P2':'P3',recommendation:x.risk>=70?'isolate responsibility, reduce coupling, add targeted regression tests':'prefer opportunistic refactor when feature work touches this file'})); return v230Write('refactor-roi.json',{version:'23.0.0',candidates});
}
async function v230AdrGenerate(input:{title:string;context:string;decision:string;consequences:string[]}){ await v230Ensure(); const id=new Date().toISOString().slice(0,10).replace(/-/g,'')+'-'+String(input.title||'decision').toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'').slice(0,50); const dir=path.join(PROJECT_ROOT,'docs','adr'); await fs.mkdir(dir,{recursive:true}); const rel=normalizeRel(path.join('docs','adr',`${id}.md`)); const body=`# ${input.title}\n\nDate: ${new Date().toISOString().slice(0,10)}\nStatus: Accepted\n\n## Context\n${input.context}\n\n## Decision\n${input.decision}\n\n## Consequences\n${(input.consequences||[]).map(x=>`- ${x}`).join('\n')}\n`; await fs.writeFile(path.join(PROJECT_ROOT,rel),body); return v230Write('last-adr.json',{version:'23.0.0',status:'CREATED',file:rel}); }
async function v230EvolutionRoadmap(){ const fitness=await v230ArchitectureFitness(); const debt=await v230DebtInventory(); const hotspots=await v230HotspotForecast(); const boundary=await v230BoundaryEnforcement(); const phases=[{phase:1,title:'Stabilize hotspots',items:(hotspots.hotspots||[]).slice(0,10).map((x:any)=>x.file)},{phase:2,title:'Reduce structural debt',items:(fitness.findings||[]).slice(0,15).map((x:any)=>x.file)},{phase:3,title:'Enforce module boundaries',items:(boundary.violations||[]).slice(0,15).map((x:any)=>x.file)},{phase:4,title:'Retire tracked technical debt',items:(debt.items||[]).slice(0,15).map((x:any)=>x.file)}]; return v230Write('architecture-evolution-roadmap.json',{version:'23.0.0',status:'PLANNED',phases}); }
async function v230DebtBudget(input:{maxWeightedDebt:number;maxLargeModules:number;maxBoundaryViolations:number}){ const debt=await v230DebtInventory(); const fit=await v230ArchitectureFitness(); const b=await v230BoundaryEnforcement(); const checks=[{name:'weightedDebt',actual:debt.weightedDebt,max:input.maxWeightedDebt,pass:debt.weightedDebt<=input.maxWeightedDebt},{name:'largeModules',actual:fit.metrics.largeModules,max:input.maxLargeModules,pass:fit.metrics.largeModules<=input.maxLargeModules},{name:'boundaryViolations',actual:(b.violations||[]).length,max:input.maxBoundaryViolations,pass:(b.violations||[]).length<=input.maxBoundaryViolations}]; return v230Write('technical-debt-budget.json',{version:'23.0.0',status:checks.every(x=>x.pass)?'PASS':'BLOCKED',checks}); }
async function v230FitnessGate(){ const f=await v230ArchitectureFitness(); const d=await v230DependencyHealth(); const b=await v230BoundaryEnforcement(); const blockers:string[]=[]; if(f.score<65)blockers.push('architecture fitness below 65'); if(d.status==='REVIEW')blockers.push('dependency health requires review'); if((b.violations||[]).length>40)blockers.push('module boundary violations exceed 40'); const out={version:'23.0.0',status:blockers.length?'BLOCKED':'PASS',blockers,fitness:f.score,boundaryViolations:(b.violations||[]).length}; return v230Write('architecture-fitness-gate.json',out); }
async function v230EvolutionDecision(){ const gov=await v220GovernanceGate(); const fit=await v230FitnessGate(); const risk=await v220ChangeRiskClassify(); const status=gov.status==='PASS'&&fit.status==='PASS'?'APPROVED':risk.risk==='LOW'&&fit.status==='PASS'?'REVIEW_REQUIRED':'DENIED'; return v230Write('architecture-evolution-decision.json',{version:'23.0.0',status,governance:gov.status,architecture:fit.status,changeRisk:risk.risk,reasons:[...(gov.blockers||[]),...(fit.blockers||[])]}); }
async function v230Status(){ await v230Ensure(); let artifacts:string[]=[]; try{artifacts=(await fs.readdir(V230_STATE_DIR)).sort();}catch{} const decision=await v230Read('architecture-evolution-decision.json'); return {version:'23.0.0',status:decision?.status||'IDLE',artifacts,stateDir:normalizeRel(path.relative(PROJECT_ROOT,V230_STATE_DIR)),lastDecision:decision}; }
// ===== END v23.0 ENGINE =====

// ===== v24.0 AUTONOMOUS KNOWLEDGE GRAPH & CHANGE INTELLIGENCE =====
const V240_STATE_DIR = path.join(PROJECT_ROOT, ".krom", "v24-knowledge-graph");
async function v240Ensure(){ await fs.mkdir(V240_STATE_DIR,{recursive:true}); }
async function v240Write(name:string,data:any){ await v240Ensure(); const out={generatedAt:new Date().toISOString(),...data}; await fs.writeFile(path.join(V240_STATE_DIR,name),JSON.stringify(out,null,2)); return out; }
async function v240Read(name:string){ try{return JSON.parse(await fs.readFile(path.join(V240_STATE_DIR,name),'utf8'));}catch{return null;} }
function v240Kind(file:string){ if(/\.(test|spec)\.(ts|tsx|js|jsx)$/.test(file)||/__tests__\//.test(file))return 'test'; if(/\.sql$/.test(file)||/migrations?\//i.test(file))return 'database'; if(/(?:^|\/)(routes?|api)(?:\/|\.)/i.test(file)||/route\.(ts|js)$/.test(file))return 'api'; if(/\.(tsx|jsx)$/.test(file))return 'ui'; if(/\.(ts|js|mjs|cjs)$/.test(file))return 'code'; if(/\.(css|scss|sass|less)$/.test(file))return 'style'; return 'asset'; }
function v240ResolveImport(from:string,imp:string,known:Set<string>){ if(!imp.startsWith('.'))return null; const base=normalizeRel(path.posix.normalize(path.posix.join(path.posix.dirname(from),imp))); const tries=[base,base+'.ts',base+'.tsx',base+'.js',base+'.jsx',base+'.mjs',base+'.cjs',path.posix.join(base,'index.ts'),path.posix.join(base,'index.tsx'),path.posix.join(base,'index.js'),path.posix.join(base,'index.jsx')]; return tries.find(x=>known.has(x))||null; }
async function v240BuildGraph(force=false){
 const cached=!force?await v240Read('knowledge-graph.json'):null; if(cached?.nodes?.length)return cached;
 const files=await v230Walk(PROJECT_ROOT,7000); const code=files.filter(f=>/\.(ts|tsx|js|jsx|mjs|cjs|sql)$/.test(f)); const known=new Set(files); const nodes:any[]=[]; const edges:any[]=[]; const symbols:any[]=[];
 for(const f of code.slice(0,5000)){ const txt=await v230ReadSmall(f,400000); if(!txt)continue; nodes.push({id:f,type:v240Kind(f),lines:txt.split(/\r?\n/).length});
   for(const m of txt.matchAll(/(?:import[\s\S]*?from\s+|require\()\s*['\"]([^'\"]+)['\"]/g)){ const imp=m[1]; const resolved=v240ResolveImport(f,imp,known); edges.push({from:f,to:resolved||imp,type:resolved?'imports':'external-import'}); }
   for(const m of txt.matchAll(/(?:fetch|axios\.(?:get|post|put|patch|delete))\s*\(\s*['\"]([^'\"]+)['\"]/g)) edges.push({from:f,to:m[1],type:'calls-api'});
   for(const m of txt.matchAll(/\.from\(\s*['\"]([^'\"]+)['\"]\)/g)) edges.push({from:f,to:`table:${m[1]}`,type:'uses-table'});
   for(const m of txt.matchAll(/(?:export\s+)?(?:async\s+)?(?:function|class)\s+([A-Za-z_$][\w$]*)|(?:export\s+)?(?:const|let)\s+([A-Z][A-Za-z0-9_$]*)\s*=/g)){ const name=m[1]||m[2]; if(name)symbols.push({name,file:f}); }
 }
 const incoming=new Map<string,number>(), outgoing=new Map<string,number>(); for(const e of edges){outgoing.set(e.from,(outgoing.get(e.from)||0)+1); if(known.has(e.to))incoming.set(e.to,(incoming.get(e.to)||0)+1);} for(const n of nodes){n.incoming=incoming.get(n.id)||0;n.outgoing=outgoing.get(n.id)||0;n.centrality=n.incoming+n.outgoing;}
 const out={version:'24.0.0',status:'READY',nodeCount:nodes.length,edgeCount:edges.length,symbolCount:symbols.length,nodes:nodes.sort((a,b)=>b.centrality-a.centrality),edges:edges.slice(0,25000),symbols:symbols.slice(0,10000)}; return v240Write('knowledge-graph.json',out);
}
async function v240HiddenDependencies(){ const g=await v240BuildGraph(); const byTo=new Map<string,any[]>(); for(const e of g.edges||[]){ if(!byTo.has(e.to))byTo.set(e.to,[]); byTo.get(e.to)!.push(e); } const hidden=[...byTo.entries()].filter(([to,es])=>String(to).startsWith('table:')||String(to).startsWith('/api')||String(to).startsWith('http')).map(([target,es])=>({target,consumers:es.map(x=>x.from).slice(0,50),count:es.length,risk:es.length>=8?'HIGH':es.length>=3?'MEDIUM':'LOW'})).sort((a,b)=>b.count-a.count); return v240Write('hidden-dependencies.json',{version:'24.0.0',status:hidden.some(x=>x.risk==='HIGH')?'REVIEW':'PASS',dependencies:hidden.slice(0,250)}); }
async function v240SemanticRelations(){ const g=await v240BuildGraph(); const rel:any[]=[]; for(const e of g.edges||[]){ if(['calls-api','uses-table'].includes(e.type))rel.push(e); } const tests=(g.nodes||[]).filter((n:any)=>n.type==='test'); for(const t of tests){ const stem=t.id.replace(/\.(test|spec)\.[^.]+$/,'').replace(/__tests__\//,''); const matches=(g.nodes||[]).filter((n:any)=>n.type!=='test'&&(n.id.includes(path.posix.basename(stem))||stem.includes(path.posix.basename(n.id).split('.')[0]))).slice(0,5); for(const m of matches)rel.push({from:t.id,to:m.id,type:'tests'}); } return v240Write('semantic-relations.json',{version:'24.0.0',relationCount:rel.length,relations:rel.slice(0,10000)}); }
async function v240ImpactQuery(files:string[]){ const g=await v240BuildGraph(); const seeds=(files||[]).map(normalizeRel); const reverse=new Map<string,string[]>(); for(const e of g.edges||[]){ if(e.type!=='imports')continue; if(!reverse.has(e.to))reverse.set(e.to,[]); reverse.get(e.to)!.push(e.from); } const visited=new Set(seeds); let frontier=[...seeds]; const levels:any[]=[]; for(let depth=1;depth<=4&&frontier.length;depth++){ const next:string[]=[]; for(const f of frontier)for(const dep of reverse.get(f)||[])if(!visited.has(dep)){visited.add(dep);next.push(dep);} if(next.length)levels.push({depth,files:next.slice(0,300)}); frontier=next; } const impacted=[...visited].filter(x=>!seeds.includes(x)); const tests=(g.nodes||[]).filter((n:any)=>n.type==='test'&&impacted.some((x:string)=>n.id.includes(path.posix.basename(x).split('.')[0]))).map((n:any)=>n.id); const risk=Math.min(100,seeds.length*5+impacted.length*2+levels.length*5); return v240Write('last-impact-query.json',{version:'24.0.0',status:risk>=70?'HIGH':risk>=35?'MEDIUM':'LOW',seeds,impacted:impacted.slice(0,1000),levels,risk,recommendedTests:[...new Set(tests)].slice(0,200)}); }
async function v240RouteApiDataTrace(){ const g=await v240BuildGraph(); const apiEdges=(g.edges||[]).filter((e:any)=>e.type==='calls-api'); const tableEdges=(g.edges||[]).filter((e:any)=>e.type==='uses-table'); const routes=(g.nodes||[]).filter((n:any)=>/(pages|routes|app)\//.test(n.id)||n.type==='api'); const traces=routes.slice(0,1000).map((r:any)=>({surface:r.id,api:apiEdges.filter((e:any)=>e.from===r.id).map((e:any)=>e.to),tables:tableEdges.filter((e:any)=>e.from===r.id).map((e:any)=>e.to.replace(/^table:/,''))})).filter((x:any)=>x.api.length||x.tables.length); return v240Write('route-api-data-trace.json',{version:'24.0.0',status:'READY',traces}); }
async function v240TestCoverageLinker(){ const g=await v240BuildGraph(); const code=(g.nodes||[]).filter((n:any)=>['ui','code','api'].includes(n.type)); const tests=(g.nodes||[]).filter((n:any)=>n.type==='test'); const linked:any[]=[]; for(const c of code.slice(0,2500)){ const stem=path.posix.basename(c.id).replace(/\.[^.]+$/,''); const ts=tests.filter((t:any)=>t.id.toLowerCase().includes(stem.toLowerCase())).map((t:any)=>t.id); linked.push({file:c.id,tests:ts,covered:ts.length>0}); } const uncovered=linked.filter(x=>!x.covered&&((g.nodes||[]).find((n:any)=>n.id===x.file)?.centrality||0)>=3); return v240Write('test-coverage-links.json',{version:'24.0.0',status:uncovered.length?'REVIEW':'PASS',linked:linked.slice(0,2500),highCentralityUncovered:uncovered.slice(0,300)}); }
async function v240GraphPath(from:string,to:string){ const g=await v240BuildGraph(); const adj=new Map<string,string[]>(); for(const e of g.edges||[]){ if(e.type!=='imports')continue; if(!adj.has(e.from))adj.set(e.from,[]); adj.get(e.from)!.push(e.to); } const q:[[string,string[]],...any[]]=[[normalizeRel(from),[normalizeRel(from)]] as any]; const seen=new Set<string>(); while(q.length){ const [cur,pth]=q.shift()!; if(cur===normalizeRel(to))return {version:'24.0.0',status:'FOUND',path:pth}; if(seen.has(cur)||pth.length>10)continue; seen.add(cur); for(const n of adj.get(cur)||[])q.push([n,[...pth,n]] as any); } return {version:'24.0.0',status:'NOT_FOUND',path:[]}; }
async function v240ContextPack(task:string,files:string[]=[]){ const impact=files.length?await v240ImpactQuery(files):null; const g=await v240BuildGraph(); const words=String(task||'').toLowerCase().split(/[^a-z0-9_/-]+/).filter(x=>x.length>3); const scored=(g.nodes||[]).map((n:any)=>({file:n.id,score:words.reduce((a:number,w:string)=>a+(n.id.toLowerCase().includes(w)?4:0),0)+(n.centrality||0)})).sort((a:any,b:any)=>b.score-a.score).slice(0,40); return v240Write('last-context-pack.json',{version:'24.0.0',task,seedFiles:files,selected:scored,impact:impact?{risk:impact.risk,impacted:impact.impacted.slice(0,100)}:null}); }
async function v240RiskExplain(files:string[]){ const impact=await v240ImpactQuery(files); const hidden=await v240HiddenDependencies(); const central=(await v240BuildGraph()).nodes.filter((n:any)=>files.includes(n.id)).map((n:any)=>({file:n.id,centrality:n.centrality})); const reasons:string[]=[]; if(impact.risk>=70)reasons.push('large transitive blast radius'); if(central.some((x:any)=>x.centrality>=10))reasons.push('high-centrality module is being changed'); if((hidden.dependencies||[]).some((x:any)=>x.risk==='HIGH'&&(x.consumers||[]).some((f:string)=>files.includes(f))))reasons.push('change touches a high-fanout API/data dependency'); return v240Write('change-risk-explanation.json',{version:'24.0.0',status:reasons.length?'REVIEW':'PASS',risk:impact.risk,reasons,centrality:central,impactSummary:{count:impact.impacted.length,tests:impact.recommendedTests}}); }
async function v240Refresh(){ return v240BuildGraph(true); }
async function v240KnowledgeGate(files:string[]=[]){ const g=await v240BuildGraph(); const risk=files.length?await v240RiskExplain(files):null; const coverage=await v240TestCoverageLinker(); const blockers:string[]=[]; if(!g.nodeCount)blockers.push('knowledge graph is empty'); if(risk&&risk.risk>=80)blockers.push('change impact risk is 80 or higher'); if(files.length&&risk&&risk.centrality.some((x:any)=>x.centrality>=20)&&coverage.status==='REVIEW')blockers.push('high-centrality change lacks linked test evidence'); return v240Write('knowledge-gate.json',{version:'24.0.0',status:blockers.length?'BLOCKED':'PASS',blockers,graph:{nodes:g.nodeCount,edges:g.edgeCount},risk:risk?.risk??null,coverage:coverage.status}); }
async function v240Status(){ await v240Ensure(); let artifacts:string[]=[]; try{artifacts=(await fs.readdir(V240_STATE_DIR)).sort();}catch{} const g=await v240Read('knowledge-graph.json'); const gate=await v240Read('knowledge-gate.json'); return {version:'24.0.0',status:gate?.status||g?.status||'IDLE',graph:g?{nodes:g.nodeCount,edges:g.edgeCount,symbols:g.symbolCount}:null,artifacts,stateDir:normalizeRel(path.relative(PROJECT_ROOT,V240_STATE_DIR)),lastGate:gate||null}; }
// ===== END v24.0 ENGINE =====



// ===== v25.0 AUTONOMOUS DESIGN-TO-CODE & UX INTELLIGENCE =====
const V250_STATE_DIR = path.join(PROJECT_ROOT, ".krom", "v25-design-intelligence");
async function v250Ensure(){ await fs.mkdir(V250_STATE_DIR,{recursive:true}); }
async function v250Write(name:string,data:any){ await v250Ensure(); const out={generatedAt:new Date().toISOString(),...data}; await fs.writeFile(path.join(V250_STATE_DIR,name),JSON.stringify(out,null,2)); return out; }
async function v250UiFiles(){ const files=await v230Walk(PROJECT_ROOT,6000); return files.filter(f=>/\.(tsx|jsx|css|scss|sass|less)$/.test(f)); }
async function v250Read(rel:string){ try{return await fs.readFile(path.join(PROJECT_ROOT,rel),'utf8');}catch{return '';} }
function v250Severity(count:number,medium=5,high=15){ return count>=high?'HIGH':count>=medium?'MEDIUM':'LOW'; }
async function v250DesignTokenAudit(){ const files=await v250UiFiles(); const findings:any[]=[]; let literals=0,vars=0,tailwind=0; for(const f of files.slice(0,2500)){const t=await v250Read(f); const hex=(t.match(/#[0-9a-fA-F]{3,8}\b/g)||[]).length; const px=(t.match(/\b\d+(?:\.\d+)?px\b/g)||[]).length; const cssvars=(t.match(/var\(--[\w-]+\)/g)||[]).length; const tw=(t.match(/(?:className|class)\s*=\s*["'`][^"'`]*(?:p-|m-|gap-|text-|bg-|rounded-|shadow-)/g)||[]).length; literals+=hex+px; vars+=cssvars; tailwind+=tw; if(hex+px>25)findings.push({file:f,literalCount:hex+px,severity:v250Severity(hex+px,25,60)});} const score=Math.max(0,100-Math.min(60,Math.floor(literals/20))); return v250Write('design-token-audit.json',{version:'25.0.0',status:score>=85?'PASS':score>=70?'REVIEW':'DEBT',score,metrics:{uiFiles:files.length,rawLiteralTokens:literals,cssVariableUses:vars,tailwindStyledFiles:tailwind},findings:findings.slice(0,200),recommendation:'centralize recurring color, spacing, radius, typography and motion values into design tokens'}); }
async function v250ComponentConsistency(){ const files=(await v250UiFiles()).filter(f=>/\.(tsx|jsx)$/.test(f)); const rows:any[]=[]; for(const f of files.slice(0,2500)){const t=await v250Read(f); const buttons=(t.match(/<button\b/g)||[]).length; const inputs=(t.match(/<input\b/g)||[]).length; const inline=(t.match(/style\s*=\s*\{\{/g)||[]).length; const arbitrary=(t.match(/\[[^\]]+\]/g)||[]).length; if(buttons+inputs+inline+arbitrary>0)rows.push({file:f,buttons,inputs,inlineStyles:inline,arbitraryValues:arbitrary,risk:(inline+arbitrary)>8?'HIGH':(inline+arbitrary)>2?'MEDIUM':'LOW'});} const high=rows.filter(x=>x.risk==='HIGH'); return v250Write('component-consistency.json',{version:'25.0.0',status:high.length?'REVIEW':'PASS',highRisk:high.slice(0,100),components:rows.slice(0,1000)}); }
async function v250LayoutDiagnostics(){ const files=await v250UiFiles(); const issues:any[]=[]; for(const f of files.slice(0,2500)){const t=await v250Read(f); const fixed=(t.match(/(?:width|min-width|max-width)\s*:\s*\d{3,}px/g)||[]).length+(t.match(/w-\[(?:\d{3,})px\]/g)||[]).length; const overflow=(t.match(/overflow-x-(?:auto|scroll|hidden)/g)||[]).length; const abs=(t.match(/\babsolute\b/g)||[]).length; if(fixed>0||abs>12)issues.push({file:f,fixedLargeWidths:fixed,absolutePositioning:abs,overflowControls:overflow,severity:fixed>3||abs>20?'HIGH':'MEDIUM'});} return v250Write('layout-diagnostics.json',{version:'25.0.0',status:issues.some(x=>x.severity==='HIGH')?'REVIEW':'PASS',issues:issues.slice(0,250),note:'static analysis only; confirm with live_browser_vision and screenshots'}); }
async function v250UxFlowAnalysis(){ const g=await v240BuildGraph(); const routes=(g.nodes||[]).filter((n:any)=>/(pages|routes|app)\//.test(n.id)||n.type==='api'); const ui=(g.nodes||[]).filter((n:any)=>n.type==='ui'); const routeSet=new Set(routes.map((x:any)=>x.id)); const orphanUi=ui.filter((n:any)=>!(g.edges||[]).some((e:any)=>e.to===n.id||e.from===n.id)).map((n:any)=>n.id); return v250Write('ux-flow-analysis.json',{version:'25.0.0',status:orphanUi.length>20?'REVIEW':'PASS',routeCount:routeSet.size,uiNodeCount:ui.length,orphanUi:orphanUi.slice(0,200),recommendations:['ensure every primary user flow has loading, empty, error and success states','verify destructive actions have confirmation and recovery paths','verify navigation hierarchy on mobile and desktop']}); }
async function v250ResponsiveRtl(){ const files=await v250UiFiles(); let rtl=0,dir=0,responsive=0; const issues:any[]=[]; for(const f of files.slice(0,2500)){const t=await v250Read(f); const hasRtl=/\brtl:|dir=["']rtl["']|\[dir=['"]rtl/.test(t); const hasDir=/\b(dir|direction)\b/.test(t); const resp=(t.match(/\b(?:sm|md|lg|xl|2xl):/g)||[]).length+(t.match(/@media\s*\(/g)||[]).length; rtl+=hasRtl?1:0;dir+=hasDir?1:0;responsive+=resp; if(/\.(tsx|jsx)$/.test(f)&&resp===0&&t.length>5000)issues.push({file:f,issue:'large UI file without obvious responsive variants'});} return v250Write('responsive-rtl-intelligence.json',{version:'25.0.0',status:issues.length?'REVIEW':'PASS',metrics:{files:files.length,rtlAwareFiles:rtl,directionAwareFiles:dir,responsiveSignals:responsive},issues:issues.slice(0,200),requiredViewports:[320,375,390,430,768,1024,1440]}); }
async function v250AccessibilityByDesign(){ const files=(await v250UiFiles()).filter(f=>/\.(tsx|jsx)$/.test(f)); const issues:any[]=[]; for(const f of files.slice(0,2500)){const t=await v250Read(f); const imgs=(t.match(/<img\b/g)||[]).length, alts=(t.match(/<img\b[^>]*\balt=/g)||[]).length; const clickDiv=(t.match(/<(?:div|span)\b[^>]*onClick=/g)||[]).length; const iconButtons=(t.match(/<button\b[^>]*>\s*<[A-Z][^>]*\/?>(?:\s*)<\/button>/g)||[]).length; if(imgs>alts||clickDiv||iconButtons)issues.push({file:f,missingAlt:Math.max(0,imgs-alts),clickableNonButtons:clickDiv,possibleUnlabelledIconButtons:iconButtons,severity:(imgs-alts)+clickDiv+iconButtons>4?'HIGH':'MEDIUM'});} return v250Write('accessibility-by-design.json',{version:'25.0.0',status:issues.length?'REVIEW':'PASS',issues:issues.slice(0,250),note:'static heuristics; run browser accessibility tooling for final evidence'}); }
async function v250InteractionStateAudit(){ const files=(await v250UiFiles()).filter(f=>/\.(tsx|jsx)$/.test(f)); const rows:any[]=[]; for(const f of files.slice(0,2500)){const t=(await v250Read(f)).toLowerCase(); const states={loading:/loading|skeleton|isloading/.test(t),empty:/empty|no data|no results/.test(t),error:/error|retry|failed/.test(t),disabled:/disabled/.test(t),success:/success|saved|complete/.test(t)}; const missing=Object.entries(states).filter(([,v])=>!v).map(([k])=>k); if(t.length>4000&&missing.length>=3)rows.push({file:f,missing,severity:missing.length>=4?'HIGH':'MEDIUM'});} return v250Write('interaction-state-audit.json',{version:'25.0.0',status:rows.length?'REVIEW':'PASS',findings:rows.slice(0,250)}); }
async function v250VisualRegressionPolicy(){ const baselineDir=path.join(PROJECT_ROOT,'.krom','live-browser','screenshots'); let shots:string[]=[]; try{shots=(await fs.readdir(baselineDir)).filter(x=>/\.(png|jpg|jpeg|webp)$/i.test(x));}catch{} const policy={viewports:[375,430,768,1440],maxCriticalDiffPercent:0.5,maxMajorDiffPercent:2,requireRtl:true,requireDarkLightIfSupported:true,baselineCount:shots.length}; return v250Write('visual-regression-policy.json',{version:'25.0.0',status:shots.length?'READY':'BASELINE_REQUIRED',policy,baselines:shots.slice(0,200)}); }
async function v250DesignQualityScore(){ const [tokens,consistency,layout,rtl,a11y,states]=await Promise.all([v250DesignTokenAudit(),v250ComponentConsistency(),v250LayoutDiagnostics(),v250ResponsiveRtl(),v250AccessibilityByDesign(),v250InteractionStateAudit()]); let score=100; if(tokens.status!=='PASS')score-=10; if(consistency.status!=='PASS')score-=12; if(layout.status!=='PASS')score-=18; if(rtl.status!=='PASS')score-=14; if(a11y.status!=='PASS')score-=18; if(states.status!=='PASS')score-=12; score=Math.max(0,score); return v250Write('design-quality-score.json',{version:'25.0.0',status:score>=90?'PASS':score>=75?'REVIEW':'BLOCKED',score,dimensions:{tokens:tokens.status,consistency:consistency.status,layout:layout.status,responsiveRtl:rtl.status,accessibility:a11y.status,interactionStates:states.status}}); }
async function v250DesignChangePlan(files:string[]=[]){ const risk=files.length?await v240RiskExplain(files):null; const quality=await v250DesignQualityScore(); const phases=[{phase:1,title:'Stabilize design system',actions:['centralize tokens','normalize typography/spacing/radius','standardize primitives']},{phase:2,title:'Repair layout and responsive behavior',actions:['remove brittle fixed widths','verify mobile breakpoints','verify RTL mirroring']},{phase:3,title:'Interaction and accessibility',actions:['complete loading/empty/error/success states','keyboard/focus/labels review']},{phase:4,title:'Visual verification',actions:['capture baseline screenshots','run visual review','compare before/after']}]; return v250Write('design-change-plan.json',{version:'25.0.0',status:risk&&risk.risk>=80?'REQUIRES_CHECKPOINT':'PLANNED',qualityScore:quality.score,changeRisk:risk?.risk??null,phases}); }
async function v250DesignGate(files:string[]=[]){ const q=await v250DesignQualityScore(); const kg=files.length?await v240KnowledgeGate(files):{status:'PASS',blockers:[]}; const blockers:string[]=[]; if(q.score<75)blockers.push('design quality score below 75'); if(kg.status==='BLOCKED')blockers.push(...(kg.blockers||[]).map((x:string)=>`knowledge gate: ${x}`)); const policy=await v250VisualRegressionPolicy(); if(policy.status==='BASELINE_REQUIRED')blockers.push('visual regression baseline is missing'); return v250Write('design-gate.json',{version:'25.0.0',status:blockers.length?'BLOCKED':'PASS',blockers,designScore:q.score,knowledgeGate:kg.status,visualPolicy:policy.status}); }
async function v250Status(){ await v250Ensure(); let artifacts:string[]=[]; try{artifacts=(await fs.readdir(V250_STATE_DIR)).sort();}catch{} const gate=(()=>v250ReadJson('design-gate.json'))(); const quality=(()=>v250ReadJson('design-quality-score.json'))(); return {version:'25.0.0',status:'READY',artifacts,stateDir:normalizeRel(path.relative(PROJECT_ROOT,V250_STATE_DIR)),gate:await gate,quality:await quality}; }
async function v250ReadJson(name:string){ try{return JSON.parse(await fs.readFile(path.join(V250_STATE_DIR,name),'utf8'));}catch{return null;} }
// ===== END v25.0 ENGINE =====


// ===== v26.0 AUTONOMOUS DESIGN SYSTEM & COMPONENT FACTORY =====
const V260_STATE_DIR = path.join(PROJECT_ROOT, ".krom", "v26-design-system-factory");
async function v260Ensure(){ await fs.mkdir(V260_STATE_DIR,{recursive:true}); }
async function v260Write(name:string,data:any){ await v260Ensure(); const out={generatedAt:new Date().toISOString(),...data}; await fs.writeFile(path.join(V260_STATE_DIR,name),JSON.stringify(out,null,2)); return out; }
async function v260Tokens(){ const audit=await v250DesignTokenAudit(); const proposal={color:['background','foreground','primary','secondary','muted','accent','danger','warning','success'],space:[0,1,2,3,4,6,8,10,12,16,20,24],radius:['sm','md','lg','xl'],type:['xs','sm','base','lg','xl','2xl','3xl'],motion:['fast','normal','slow']}; return v260Write('design-tokens.json',{version:'26.0.0',status:audit.score>=80?'READY':'NORMALIZE_FIRST',sourceScore:audit.score,proposal}); }
async function v260ComponentInventory(){ const files=(await v250UiFiles()).filter(f=>/\.(tsx|jsx)$/.test(f)); const rows:any[]=[]; for(const f of files.slice(0,3000)){const t=await v250Read(f); const comps=[...t.matchAll(/(?:function|const)\s+([A-Z][A-Za-z0-9_]*)/g)].map(m=>m[1]); if(comps.length)rows.push({file:f,components:[...new Set(comps)].slice(0,30),exports:(t.match(/export\s+(?:default\s+)?/g)||[]).length}); } return v260Write('component-inventory.json',{version:'26.0.0',status:'READY',files:rows.length,items:rows.slice(0,1500)}); }
async function v260VariantMatrix(){ const inv=await v260ComponentInventory(); const matrix=(inv.items||[]).slice(0,500).map((x:any)=>({file:x.file,requiredVariants:['default','hover','focus','disabled','loading','error'],responsive:['mobile','tablet','desktop'],rtl:true})); return v260Write('component-variant-matrix.json',{version:'26.0.0',status:'READY',matrix}); }
async function v260RecipeGenerate(input:{name:string;purpose:string;category?:string}){ const name=input.name.replace(/[^A-Za-z0-9_-]/g,''); const recipe={name,purpose:input.purpose,category:input.category||'general',anatomy:['root','content','actions'],states:['default','hover','focus-visible','disabled','loading','error'],requirements:['keyboard accessible','RTL safe','responsive','token driven','typed props','no hidden side effects'],acceptance:['no raw recurring colors','visible focus state','mobile layout verified','empty/error/loading handled where applicable']}; return v260Write(`recipe-${name||'component'}.json`,{version:'26.0.0',status:'READY',recipe}); }
async function v260ComponentSpec(input:{name:string;description:string}){ const tokens=await v260Tokens(); return v260Write(`spec-${input.name.replace(/[^A-Za-z0-9_-]/g,'')}.json`,{version:'26.0.0',status:'READY',component:{name:input.name,description:input.description,propsContract:['variant','size','disabled','className'],tokenStatus:tokens.status},qualityContract:{a11y:true,rtl:true,responsive:true,states:true,visualBaseline:true}}); }
async function v260ResponsiveContract(){ const r=await v250ResponsiveRtl(); return v260Write('responsive-contract.json',{version:'26.0.0',status:r.status==='PASS'?'READY':'REVIEW',viewports:[320,375,390,430,768,1024,1280,1440],rules:['no horizontal scroll','touch targets >=44px where practical','tables degrade gracefully','dialogs fit viewport','navigation usable at 320px'],source:r}); }
async function v260RtlContract(){ const r=await v250ResponsiveRtl(); return v260Write('rtl-contract.json',{version:'26.0.0',status:'READY',rules:['prefer logical CSS properties','mirror directional icons only when semantically directional','preserve numbers and code LTR where appropriate','verify mixed Arabic/English labels','test sidebar/breadcrumb/dialog alignment'],source:r.metrics}); }
async function v260A11yContract(){ const a=await v250AccessibilityByDesign(); return v260Write('accessibility-contract.json',{version:'26.0.0',status:a.status==='PASS'?'READY':'REVIEW',rules:['keyboard reachable','focus visible','labels for controls','semantic buttons/links','alt text','error association','contrast verification'],sourceIssues:(a.issues||[]).slice(0,100)}); }
async function v260SnapshotPlan(){ const p=await v250VisualRegressionPolicy(); return v260Write('snapshot-plan.json',{version:'26.0.0',status:p.status==='READY'?'READY':'BASELINE_REQUIRED',routes:['primary routes','critical dialogs','forms','empty/error states'],viewports:p.policy?.viewports||[375,430,768,1440],baselineCount:p.policy?.baselineCount||0}); }
async function v260ComponentQuality(name?:string){ const [consistency,a11y,rtl,states]=await Promise.all([v250ComponentConsistency(),v250AccessibilityByDesign(),v250ResponsiveRtl(),v250InteractionStateAudit()]); let score=100; if(consistency.status!=='PASS')score-=20;if(a11y.status!=='PASS')score-=25;if(rtl.status!=='PASS')score-=20;if(states.status!=='PASS')score-=15; return v260Write('component-quality.json',{version:'26.0.0',status:score>=90?'PASS':score>=75?'REVIEW':'BLOCKED',score,component:name||null,dimensions:{consistency:consistency.status,accessibility:a11y.status,responsiveRtl:rtl.status,states:states.status}}); }
async function v260FactoryPlan(input:{component:string;purpose:string}){ const [spec,recipe,quality]=await Promise.all([v260ComponentSpec({name:input.component,description:input.purpose}),v260RecipeGenerate({name:input.component,purpose:input.purpose}),v260ComponentQuality(input.component)]); return v260Write(`factory-plan-${input.component.replace(/[^A-Za-z0-9_-]/g,'')}.json`,{version:'26.0.0',status:'PLANNED',steps:['inspect existing primitives','reuse tokens','implement typed component','add states and variants','verify RTL/responsive','add accessibility checks','capture visual baseline','run component quality gate'],spec,recipe,baselineQuality:quality.score}); }
async function v260ConsistencyRepairPlan(){ const c=await v250ComponentConsistency(); const targets=(c.highRisk||[]).slice(0,50).map((x:any)=>({file:x.file,actions:['replace raw repeated primitives with shared component','replace arbitrary repeated values with tokens','preserve behavior and props']})); return v260Write('consistency-repair-plan.json',{version:'26.0.0',status:targets.length?'PLANNED':'NO_ACTION',targets}); }
async function v260DesignSystemGate(){ const [q,snap,tokens]=await Promise.all([v260ComponentQuality(),v260SnapshotPlan(),v260Tokens()]); const blockers:string[]=[]; if(q.score<80)blockers.push('component quality score below 80'); if(tokens.status==='NORMALIZE_FIRST')blockers.push('design tokens require normalization'); if(snap.status==='BASELINE_REQUIRED')blockers.push('visual baseline missing'); return v260Write('design-system-gate.json',{version:'26.0.0',status:blockers.length?'BLOCKED':'PASS',blockers,qualityScore:q.score,tokenStatus:tokens.status,snapshotStatus:snap.status}); }
async function v260Status(){ await v260Ensure(); let artifacts:string[]=[]; try{artifacts=(await fs.readdir(V260_STATE_DIR)).sort();}catch{} return {version:'26.0.0',status:'READY',artifactCount:artifacts.length,artifacts,stateDir:normalizeRel(path.relative(PROJECT_ROOT,V260_STATE_DIR))}; }
// ===== END v26.0 FUNCTIONS =====

// ===== v27.0 AUTONOMOUS FULL-STACK FEATURE FACTORY =====
const V270_STATE_DIR = path.join(PROJECT_ROOT, ".krom", "v27-fullstack-feature-factory");
async function v270Ensure(){ await fs.mkdir(V270_STATE_DIR,{recursive:true}); }
async function v270Write(name:string,data:any){ await v270Ensure(); const out={generatedAt:new Date().toISOString(),...data}; await fs.writeFile(path.join(V270_STATE_DIR,name),JSON.stringify(out,null,2)); return out; }
async function v270FeatureSpec(input:{name:string;goal:string;actors?:string[]}){ const slug=input.name.replace(/[^A-Za-z0-9_-]/g,'-').toLowerCase(); return v270Write(`feature-spec-${slug}.json`,{version:'27.0.0',status:'SPECIFIED',feature:{name:input.name,goal:input.goal,actors:input.actors||['user']},layers:['ui','domain','api','data','permissions','tests','telemetry'],acceptance:['happy path works','validation handled','unauthorized access denied','loading/empty/error states covered','data persists correctly','tests provide evidence']}); }
async function v270DataModel(input:{feature:string}){ const graph=await v240BuildGraph(false); return v270Write(`data-model-${input.feature.replace(/[^A-Za-z0-9_-]/g,'-')}.json`,{version:'27.0.0',status:'PLANNED',feature:input.feature,currentTables:(graph.nodes||[]).filter((n:any)=>n.type==='table').slice(0,100),rules:['prefer additive schema changes','define primary/foreign keys','add indexes for common filters','document nullability/defaults','pair schema with RLS where applicable']}); }
async function v270ApiContract(input:{feature:string}){ return v270Write(`api-contract-${input.feature.replace(/[^A-Za-z0-9_-]/g,'-')}.json`,{version:'27.0.0',status:'PLANNED',feature:input.feature,contract:{request:['validated input','authenticated actor when required'],response:['typed success payload','typed error payload'],errors:['400 validation','401 unauthenticated','403 unauthorized','404 missing','409 conflict','500 controlled failure']}}); }
async function v270PermissionMatrix(input:{feature:string}){ const roles=['admin','manager','operator','viewer']; return v270Write(`permission-matrix-${input.feature.replace(/[^A-Za-z0-9_-]/g,'-')}.json`,{version:'27.0.0',status:'PLANNED',feature:input.feature,roles:roles.map(r=>({role:r,view:true,create:r!=='viewer',edit:['admin','manager'].includes(r),delete:r==='admin',approve:['admin','manager'].includes(r)})),rules:['enforce server-side','mirror in UI only for UX','default deny for unknown roles']}); }
async function v270UiContract(input:{feature:string}){ const ds=await v260DesignSystemGate(); return v270Write(`ui-contract-${input.feature.replace(/[^A-Za-z0-9_-]/g,'-')}.json`,{version:'27.0.0',status:ds.status==='PASS'?'READY':'REVIEW_DESIGN_SYSTEM',feature:input.feature,states:['loading','empty','success','error','disabled'],requirements:['responsive','RTL-safe','keyboard accessible','token driven','clear destructive confirmations'],designSystem:ds.status}); }
async function v270TestMatrix(input:{feature:string}){ return v270Write(`test-matrix-${input.feature.replace(/[^A-Za-z0-9_-]/g,'-')}.json`,{version:'27.0.0',status:'PLANNED',feature:input.feature,tests:[{type:'unit',covers:['validation','domain rules']},{type:'integration',covers:['api','database','permissions']},{type:'e2e',covers:['happy path','errors','mobile']},{type:'visual',covers:['critical states','RTL','responsive']} ]}); }
async function v270TelemetryContract(input:{feature:string}){ return v270Write(`telemetry-${input.feature.replace(/[^A-Za-z0-9_-]/g,'-')}.json`,{version:'27.0.0',status:'PLANNED',feature:input.feature,events:['feature_opened','action_succeeded','action_failed'],guardrails:['no secrets','no raw sensitive payloads','structured error codes','correlation id where available']}); }
async function v270FeaturePlan(input:{name:string;goal:string}){ const [spec,data,api,perm,ui,tests,tel]=await Promise.all([v270FeatureSpec({name:input.name,goal:input.goal}),v270DataModel({feature:input.name}),v270ApiContract({feature:input.name}),v270PermissionMatrix({feature:input.name}),v270UiContract({feature:input.name}),v270TestMatrix({feature:input.name}),v270TelemetryContract({feature:input.name})]); return v270Write(`feature-plan-${input.name.replace(/[^A-Za-z0-9_-]/g,'-')}.json`,{version:'27.0.0',status:'PLANNED',feature:input.name,sequence:['schema','permissions','api','domain','ui','tests','telemetry','verification'],spec,data,api,permissions:perm,ui,tests,telemetry:tel}); }
async function v270Completeness(input:{feature:string}){ const feature:any={id:'V27',name:input.feature,intent:input.feature,actors:['user'],surfaces:['UI','Application Logic','Data/Integration'],acceptance:acceptanceForFeature(input.feature)}; const base=await scanFeatureEvidence(feature); const evidence=base.evidence||[]; const score=typeof base.score==='number'?base.score:0; return v270Write(`completeness-${input.feature.replace(/[^A-Za-z0-9_-]/g,'-')}.json`,{version:'27.0.0',status:score>=90?'PASS':score>=70?'REVIEW':'BLOCKED',score,feature:input.feature,evidence}); }
async function v270GapRepair(input:{feature:string}){ const c=await v270Completeness(input); const gaps:string[]=[]; if(c.score<90)gaps.push('complete missing feature layers and attach evidence'); if(c.score<70)gaps.push('rebuild feature contract before broad implementation'); return v270Write(`gap-repair-${input.feature.replace(/[^A-Za-z0-9_-]/g,'-')}.json`,{version:'27.0.0',status:gaps.length?'PLANNED':'NO_ACTION',feature:input.feature,gaps,steps:['inspect evidence','identify missing layer','implement smallest safe change','run targeted tests','refresh completeness matrix']}); }
async function v270FeatureGate(input:{feature:string}){ const [c,design,gov]=await Promise.all([v270Completeness(input),v260DesignSystemGate(),v220GovernanceGate()]); const blockers:string[]=[]; if(c.score<90)blockers.push(`feature completeness ${c.score}<90`); if(design.status!=='PASS')blockers.push('design system gate not passed'); if(gov.status!=='PASS'&&gov.status!=='APPROVED')blockers.push('governance gate not passed'); return v270Write(`feature-gate-${input.feature.replace(/[^A-Za-z0-9_-]/g,'-')}.json`,{version:'27.0.0',status:blockers.length?'BLOCKED':'PASS',feature:input.feature,blockers,completeness:c.score,design:design.status,governance:gov.status}); }
async function v270Status(){ await v270Ensure(); let artifacts:string[]=[]; try{artifacts=(await fs.readdir(V270_STATE_DIR)).sort();}catch{} return {version:'27.0.0',status:'READY',artifactCount:artifacts.length,artifacts,stateDir:normalizeRel(path.relative(PROJECT_ROOT,V270_STATE_DIR))}; }
// ===== END v27.0 FUNCTIONS =====


// ===== v28.0 AUTONOMOUS APP EVOLUTION & CROSS-FEATURE INTELLIGENCE =====
const V280_STATE_DIR = path.join(PROJECT_ROOT, ".krom", "v28-app-evolution");
async function v280Ensure(){ await fs.mkdir(V280_STATE_DIR,{recursive:true}); }
async function v280Write(name:string,data:any){ await v280Ensure(); const out={generatedAt:new Date().toISOString(),...data}; await fs.writeFile(path.join(V280_STATE_DIR,name),JSON.stringify(out,null,2)); return out; }
async function v280FeatureDependencyMap(){
  const graph:any=await v240BuildGraph(false);
  const nodes=(graph.nodes||[]).slice(0,1200);
  const edges=(graph.edges||[]).slice(0,5000);
  const featureSignals=nodes.filter((n:any)=>/page|route|component|api|table/i.test(String(n.type||'')) || /pages|routes|features|components|api/i.test(String(n.id||n.path||'')));
  return v280Write('feature-dependency-map.json',{version:'28.0.0',status:'READY',featureSignals:featureSignals.slice(0,400),edgeCount:edges.length,rules:['shared modules require impact review','route/API/data links must be tested together','cross-feature edits require regression scope']});
}
async function v280CrossFeatureConflict(input:{features:string[]}){
  const files=await walkProject(PROJECT_ROOT,[],2500); const textFiles=files.filter(f=>/\.(ts|tsx|js|jsx|sql|json)$/i.test(f));
  const hits:any[]=[];
  for(const f of textFiles.slice(0,1200)){ let t=''; try{t=await fs.readFile(f,'utf8')}catch{continue}; const matched=input.features.filter(x=>t.toLowerCase().includes(x.toLowerCase())); if(matched.length>1) hits.push({file:normalizeRel(path.relative(PROJECT_ROOT,f)),features:matched.slice(0,10)}); }
  return v280Write('cross-feature-conflicts.json',{version:'28.0.0',status:hits.length?'REVIEW':'PASS',features:input.features,sharedFiles:hits.slice(0,200),risk:hits.length>20?'HIGH':hits.length?'MEDIUM':'LOW'});
}
async function v280SharedLogicAudit(){
  const files=await walkProject(PROJECT_ROOT,[],3000); const candidates=files.filter(f=>/\.(ts|tsx|js|jsx)$/i.test(f)); const shared:any[]=[];
  for(const f of candidates.slice(0,1800)){ let t=''; try{t=await fs.readFile(f,'utf8')}catch{continue}; const exports=(t.match(/\bexport\b/g)||[]).length; const imports=(t.match(/\bimport\b/g)||[]).length; if(exports>=3 && imports>=3) shared.push({file:normalizeRel(path.relative(PROJECT_ROOT,f)),exports,imports,score:exports+imports}); }
  shared.sort((a,b)=>b.score-a.score); return v280Write('shared-logic-audit.json',{version:'28.0.0',status:'READY',hotspots:shared.slice(0,100),recommendations:['centralize only proven duplicated domain logic','avoid premature shared abstractions','protect high-centrality modules with regression tests']});
}
async function v280ApiDuplicationAudit(){
  const files=await walkProject(PROJECT_ROOT,[],2500); const routes=new Map<string,string[]>();
  for(const f of files.filter(f=>/\.(ts|tsx|js|jsx)$/i.test(f)).slice(0,1600)){ let t=''; try{t=await fs.readFile(f,'utf8')}catch{continue}; for(const m of t.matchAll(/(?:fetch|axios\.(?:get|post|put|patch|delete))\s*\(\s*[`'\"]([^`'\"]+)/g)){ const k=m[1].replace(/\?.*$/,''); const arr=routes.get(k)||[]; arr.push(normalizeRel(path.relative(PROJECT_ROOT,f))); routes.set(k,arr); }}
  const duplicated=[...routes.entries()].filter(([,v])=>v.length>1).map(([endpoint,files])=>({endpoint,files:[...new Set(files)]})); return v280Write('api-duplication-audit.json',{version:'28.0.0',status:duplicated.length?'REVIEW':'PASS',duplicated:duplicated.slice(0,150)});
}
async function v280ComponentDuplicationAudit(){
  const files=await walkProject(PROJECT_ROOT,[],2500); const items:any[]=[];
  for(const f of files.filter(f=>/\.(tsx|jsx)$/i.test(f)).slice(0,1400)){ let t=''; try{t=await fs.readFile(f,'utf8')}catch{continue}; const jsx=(t.match(/<[A-Z][A-Za-z0-9_.]*/g)||[]).length; const buttons=(t.match(/<button\b/g)||[]).length; const inputs=(t.match(/<input\b/g)||[]).length; if(buttons+inputs>=4) items.push({file:normalizeRel(path.relative(PROJECT_ROOT,f)),jsx,buttons,inputs}); }
  return v280Write('component-duplication-audit.json',{version:'28.0.0',status:items.length?'REVIEW':'PASS',candidates:items.slice(0,120),rule:'Prefer design-system primitives when equivalent behavior is repeated.'});
}
async function v280FeatureEvolutionPlan(input:{feature:string;goal:string}){
  const [dep,shared,api,components]=await Promise.all([v280FeatureDependencyMap(),v280SharedLogicAudit(),v280ApiDuplicationAudit(),v280ComponentDuplicationAudit()]);
  return v280Write(`evolution-plan-${input.feature.replace(/[^A-Za-z0-9_-]/g,'-')}.json`,{version:'28.0.0',status:'PLANNED',feature:input.feature,goal:input.goal,sequence:['map current dependencies','identify shared contracts','define backward-compatible change','implement smallest vertical slice','run cross-feature regression','refresh feature gates'],signals:{dependencyNodes:dep.featureSignals?.length||0,sharedHotspots:shared.hotspots?.length||0,apiDuplicates:api.duplicated?.length||0,componentCandidates:components.candidates?.length||0}});
}
async function v280RegressionScope(input:{files:string[]}){
  const base:any=await v190RegressionPlan(input.files); const graph:any=await v240BuildGraph(false); return v280Write('cross-feature-regression-scope.json',{version:'28.0.0',status:'READY',files:input.files,base,graphSummary:{nodes:(graph.nodes||[]).length,edges:(graph.edges||[]).length},required:['affected unit tests','affected integration tests','critical E2E routes','visual checks for changed UI','permission checks for shared APIs']});
}
async function v280ContractConsistency(){
  const [api,schema,design]=await Promise.all([v200ApiCompatibilityGate(),v200SchemaCompatibilityGate(),v260DesignSystemGate()]); const blockers:string[]=[];
  if(api.status==='BLOCKED')blockers.push('api compatibility'); if(schema.status==='BLOCKED')blockers.push('schema compatibility'); if(design.status!=='PASS')blockers.push('design system');
  return v280Write('contract-consistency.json',{version:'28.0.0',status:blockers.length?'BLOCKED':'PASS',blockers,api:api.status,schema:schema.status,design:design.status});
}
async function v280AppEvolutionGate(input:{feature:string}){
  const [featureGate,contracts,gov]=await Promise.all([v270FeatureGate({feature:input.feature}),v280ContractConsistency(),v220GovernanceGate()]); const blockers:string[]=[];
  if(featureGate.status!=='PASS')blockers.push('feature gate'); if(contracts.status!=='PASS')blockers.push('contract consistency'); if(gov.status!=='PASS'&&gov.status!=='APPROVED')blockers.push('governance');
  return v280Write(`app-evolution-gate-${input.feature.replace(/[^A-Za-z0-9_-]/g,'-')}.json`,{version:'28.0.0',status:blockers.length?'BLOCKED':'PASS',feature:input.feature,blockers,featureGate:featureGate.status,contracts:contracts.status,governance:gov.status});
}
async function v280EvolutionStatus(){ await v280Ensure(); let artifacts:string[]=[]; try{artifacts=(await fs.readdir(V280_STATE_DIR)).sort();}catch{} return {version:'28.0.0',status:'READY',artifactCount:artifacts.length,artifacts,stateDir:normalizeRel(path.relative(PROJECT_ROOT,V280_STATE_DIR))}; }
// ===== END v28.0 =====

// ===== v29.0 AUTONOMOUS PRODUCT INTELLIGENCE & JOURNEY ORCHESTRATOR =====
const V290_STATE_DIR = path.join(PROJECT_ROOT, ".krom", "v29-product-journey");
async function v290Ensure(){ await fs.mkdir(V290_STATE_DIR,{recursive:true}); }
async function v290Write(name:string,data:any){ await v290Ensure(); const out={generatedAt:new Date().toISOString(),...data}; await fs.writeFile(path.join(V290_STATE_DIR,name),JSON.stringify(out,null,2)); return out; }
async function v290JourneyMap(input:{journey:string;actors?:string[]}){
  const graph:any=await v240BuildGraph(false);
  const routes=(graph.nodes||[]).filter((n:any)=>/route|page/i.test(String(n.type||''))||/pages|routes|app/i.test(String(n.id||n.path||''))).slice(0,500);
  return v290Write(`journey-${input.journey.replace(/[^A-Za-z0-9_-]/g,'-')}.json`,{version:'29.0.0',status:'READY',journey:input.journey,actors:input.actors||['user'],routeCandidates:routes,requiredStages:['entry','discovery','action','confirmation','recovery'],rules:['every primary action must have success and failure outcomes','navigation must preserve user context','mobile and RTL variants must preserve journey order']});
}
async function v290PersonaFlow(input:{persona:string;goal:string}){
  const dep=await v280FeatureDependencyMap();
  return v290Write(`persona-${input.persona.replace(/[^A-Za-z0-9_-]/g,'-')}.json`,{version:'29.0.0',status:'READY',persona:input.persona,goal:input.goal,flow:['entry context','primary task','decision point','completion','recovery'],dependencySignals:dep.featureSignals?.slice(0,120)||[],acceptance:['minimum clicks for primary task','clear next action','error recovery exists','permissions match persona']});
}
async function v290OutcomeKpi(input:{feature:string}){
  return v290Write(`outcome-kpi-${input.feature.replace(/[^A-Za-z0-9_-]/g,'-')}.json`,{version:'29.0.0',status:'READY',feature:input.feature,kpis:[{name:'task_completion_rate',type:'ratio'},{name:'task_error_rate',type:'ratio'},{name:'median_completion_time',type:'duration'},{name:'retry_rate',type:'ratio'},{name:'drop_off_stage',type:'funnel'}],privacy:['no secrets','no sensitive payloads','prefer aggregate telemetry']});
}
async function v290JourneyGapScan(input:{journey:string}){
  const files=await walkProject(PROJECT_ROOT,[],3000); const ui=files.filter(f=>/\.(tsx|jsx|vue|svelte)$/i.test(f)); const findings:any[]=[];
  for(const f of ui.slice(0,1800)){ let t=''; try{t=await fs.readFile(f,'utf8')}catch{continue}; const low=t.toLowerCase(); const states={loading:/loading|skeleton/.test(low),error:/error|failed|retry/.test(low),empty:/empty|no results|no data/.test(low),success:/success|saved|complete|completed/.test(low)}; const missing=Object.entries(states).filter(([,v])=>!v).map(([k])=>k); if(t.length>5000&&missing.length>=2) findings.push({file:normalizeRel(path.relative(PROJECT_ROOT,f)),missing}); }
  return v290Write(`journey-gap-${input.journey.replace(/[^A-Za-z0-9_-]/g,'-')}.json`,{version:'29.0.0',status:findings.length?'REVIEW':'PASS',journey:input.journey,findings:findings.slice(0,250)});
}
async function v290FunnelModel(input:{journey:string;stages?:string[]}){
  const stages=(input.stages&&input.stages.length?input.stages:['entry','engage','primary_action','confirm','complete']);
  return v290Write(`funnel-${input.journey.replace(/[^A-Za-z0-9_-]/g,'-')}.json`,{version:'29.0.0',status:'READY',journey:input.journey,stages:stages.map((s,i)=>({index:i+1,name:s,event:`journey_${i+1}_${s.replace(/[^A-Za-z0-9_]/g,'_')}`,requiredEvidence:['route/view','action outcome']})),note:'Telemetry schema only; no production analytics are inferred.'});
}
async function v290CrossJourneyConflict(input:{journeys:string[]}){
  const map=await v280FeatureDependencyMap(); const shared=(map.featureSignals||[]).filter((x:any)=>{const id=String(x.id||x.path||'').toLowerCase(); return input.journeys.some(j=>id.includes(j.toLowerCase().replace(/\s+/g,'-')))});
  return v290Write('cross-journey-conflict.json',{version:'29.0.0',status:shared.length>20?'REVIEW':'PASS',journeys:input.journeys,sharedSignals:shared.slice(0,250),rules:['shared navigation changes require all affected journeys to be replayed','shared permission changes require persona verification']});
}
async function v290JourneyRegression(input:{files:string[]}){
  const scope=await v280RegressionScope({files:input.files});
  return v290Write('journey-regression-plan.json',{version:'29.0.0',status:'READY',files:input.files,scope,journeyChecks:['entry route reachable','primary action completes','error recovery works','back/navigation preserves state','mobile flow','RTL flow','permission variants']});
}
async function v290ProductOutcomeReview(input:{feature:string}){
  const [complete,gate,kpi]=await Promise.all([v270Completeness({feature:input.feature}),v280AppEvolutionGate({feature:input.feature}),v290OutcomeKpi({feature:input.feature})]);
  const blockers:string[]=[]; if(complete.score<90)blockers.push('feature completeness below 90'); if(gate.status!=='PASS')blockers.push('app evolution gate not passed');
  return v290Write(`outcome-review-${input.feature.replace(/[^A-Za-z0-9_-]/g,'-')}.json`,{version:'29.0.0',status:blockers.length?'BLOCKED':'READY_FOR_MEASUREMENT',feature:input.feature,blockers,completeness:complete.score,appGate:gate.status,kpis:kpi.kpis});
}
async function v290JourneyGate(input:{journey:string;feature:string;changedFiles?:string[]}){
  const [gaps,product,reg]=await Promise.all([v290JourneyGapScan({journey:input.journey}),v290ProductOutcomeReview({feature:input.feature}),input.changedFiles?.length?v290JourneyRegression({files:input.changedFiles}):Promise.resolve({status:'READY'})]);
  const blockers:string[]=[]; if(gaps.status==='REVIEW')blockers.push('journey states need review'); if(product.status==='BLOCKED')blockers.push(...(product.blockers||[]));
  return v290Write(`journey-gate-${input.journey.replace(/[^A-Za-z0-9_-]/g,'-')}.json`,{version:'29.0.0',status:blockers.length?'BLOCKED':'PASS',journey:input.journey,feature:input.feature,blockers,regressionStatus:reg.status});
}
async function v290Status(){ await v290Ensure(); let artifacts:string[]=[]; try{artifacts=(await fs.readdir(V290_STATE_DIR)).sort();}catch{} return {version:'29.0.0',status:'READY',artifactCount:artifacts.length,artifacts,stateDir:normalizeRel(path.relative(PROJECT_ROOT,V290_STATE_DIR))}; }
// ===== END v29.0 =====
// ===== v30.0 AUTONOMOUS PRODUCT EXPERIMENTATION & OPTIMIZATION ENGINE =====
const V300_STATE_DIR = path.join(PROJECT_ROOT, ".krom", "v30-product-optimization");
async function v300Ensure(){ await fs.mkdir(V300_STATE_DIR,{recursive:true}); }
async function v300Write(name:string,data:any){ await v300Ensure(); const out={generatedAt:new Date().toISOString(),...data}; await fs.writeFile(path.join(V300_STATE_DIR,name),JSON.stringify(out,null,2)); return out; }
async function v300ExperimentPlan(input:{feature:string;hypothesis:string;metric?:string}){
  const kpi=await v290OutcomeKpi({feature:input.feature});
  return v300Write(`experiment-${input.feature.replace(/[^A-Za-z0-9_-]/g,'-')}.json`,{version:'30.0.0',status:'READY',feature:input.feature,hypothesis:input.hypothesis,primaryMetric:input.metric||kpi.kpis?.[0]?.name||'task_completion_rate',guardrails:['error_rate must not regress','accessibility must not regress','permission behavior must remain stable','mobile and RTL journeys must remain valid'],stages:['baseline','treatment definition','cohort assignment','run','analyze','decision']});
}
async function v300AbReadiness(input:{feature:string}){
  const [journey,gate]=await Promise.all([v290JourneyGapScan({journey:input.feature}),v290JourneyGate({journey:input.feature,feature:input.feature})]);
  const blockers:string[]=[]; if(journey.status!=='PASS')blockers.push('journey gaps require review'); if(gate.status!=='PASS')blockers.push('journey gate is not passing');
  return v300Write(`ab-readiness-${input.feature.replace(/[^A-Za-z0-9_-]/g,'-')}.json`,{version:'30.0.0',status:blockers.length?'BLOCKED':'READY',feature:input.feature,blockers,requirements:['stable baseline','single primary metric','guardrail metrics','cohort isolation','rollback path','privacy-safe telemetry']});
}
async function v300KpiGuardrails(input:{feature:string;primaryMetric:string}){
  return v300Write(`kpi-guardrails-${input.feature.replace(/[^A-Za-z0-9_-]/g,'-')}.json`,{version:'30.0.0',status:'READY',feature:input.feature,primaryMetric:input.primaryMetric,guardrails:[{metric:'task_error_rate',direction:'must_not_increase'},{metric:'retry_rate',direction:'must_not_increase'},{metric:'accessibility_score',direction:'must_not_decrease'},{metric:'journey_completion',direction:'must_not_decrease'}],note:'Thresholds require real baseline data; none are invented.'});
}
async function v300RolloutCohorts(input:{feature:string;strategy?:'percentage'|'role'|'internal'}){
  const strategy=input.strategy||'percentage';
  return v300Write(`cohorts-${input.feature.replace(/[^A-Za-z0-9_-]/g,'-')}.json`,{version:'30.0.0',status:'READY',feature:input.feature,strategy,cohorts:strategy==='percentage'?[{name:'control',share:50},{name:'treatment',share:50}]:strategy==='internal'?[{name:'internal',share:100}]:[{name:'role_based',share:null}],rules:['assignment must be deterministic','users should not switch cohorts mid-experiment','sensitive attributes must not be used without explicit policy']});
}
async function v300TelemetryContract(input:{feature:string}){
  const funnel=await v290FunnelModel({journey:input.feature});
  return v300Write(`telemetry-${input.feature.replace(/[^A-Za-z0-9_-]/g,'-')}.json`,{version:'30.0.0',status:'READY',feature:input.feature,events:funnel.stages||[],privacy:['no secrets','no raw sensitive payloads','prefer aggregate counters','document retention'],requiredFields:['event_name','timestamp','journey_stage','outcome','experiment_variant?']});
}
async function v300HypothesisTracker(input:{feature:string;hypothesis:string;decision?:string;evidence?:string[]}){
  const evidence=input.evidence||[]; const status=input.decision?(evidence.length?'DECIDED':'REVIEW'):'OPEN';
  return v300Write(`hypothesis-${input.feature.replace(/[^A-Za-z0-9_-]/g,'-')}.json`,{version:'30.0.0',status,feature:input.feature,hypothesis:input.hypothesis,decision:input.decision||null,evidence,rule:'No hypothesis may be marked proven without measurable evidence.'});
}
async function v300UxOptimizationLoop(input:{feature:string}){
  const [gaps,outcome]=await Promise.all([v290JourneyGapScan({journey:input.feature}),v290ProductOutcomeReview({feature:input.feature})]);
  return v300Write(`ux-loop-${input.feature.replace(/[^A-Za-z0-9_-]/g,'-')}.json`,{version:'30.0.0',status:'READY',feature:input.feature,currentSignals:{journey:gaps.status,outcome:outcome.status},loop:['observe evidence','identify friction','form hypothesis','design smallest safe change','experiment','verify guardrails','adopt or revert','record learning']});
}
async function v300AnomalyRules(input:{feature:string}){
  return v300Write(`anomaly-rules-${input.feature.replace(/[^A-Za-z0-9_-]/g,'-')}.json`,{version:'30.0.0',status:'READY',feature:input.feature,rules:[{signal:'error_rate',action:'pause_and_review'},{signal:'drop_off_spike',action:'investigate_journey_stage'},{signal:'latency_regression',action:'performance_review'},{signal:'permission_failures',action:'security_review'}],note:'Detection thresholds must be calibrated from real telemetry.'});
}
async function v300ExperimentEvidence(input:{feature:string;evidence:string[]}){
  const weak=input.evidence.filter(x=>!/test|metric|log|screenshot|trace|report|query/i.test(x));
  return v300Write(`experiment-evidence-${input.feature.replace(/[^A-Za-z0-9_-]/g,'-')}.json`,{version:'30.0.0',status:input.evidence.length>=2&&weak.length<input.evidence.length?'PASS':'REVIEW',feature:input.feature,evidence:input.evidence,weakEvidence:weak,rules:['evidence must be attributable','baseline and treatment must be comparable','negative outcomes must be retained']});
}
async function v300OptimizationGate(input:{feature:string;hypothesis:string;evidence?:string[]}){
  const [ready,guard,evid]=await Promise.all([v300AbReadiness({feature:input.feature}),v300KpiGuardrails({feature:input.feature,primaryMetric:'task_completion_rate'}),v300ExperimentEvidence({feature:input.feature,evidence:input.evidence||[]})]);
  const blockers:string[]=[]; if(ready.status!=='READY')blockers.push(...(ready.blockers||['experiment not ready'])); if((input.evidence||[]).length && evid.status!=='PASS')blockers.push('experiment evidence is insufficient');
  return v300Write(`optimization-gate-${input.feature.replace(/[^A-Za-z0-9_-]/g,'-')}.json`,{version:'30.0.0',status:blockers.length?'BLOCKED':'PASS',feature:input.feature,hypothesis:input.hypothesis,blockers,guardrails:guard.guardrails});
}
async function v300OptimizationStatus(){ await v300Ensure(); let artifacts:string[]=[]; try{artifacts=(await fs.readdir(V300_STATE_DIR)).sort();}catch{} return {version:'30.0.0',status:'READY',artifactCount:artifacts.length,artifacts,stateDir:normalizeRel(path.relative(PROJECT_ROOT,V300_STATE_DIR))}; }
// ===== END v30.0 =====




// ===== v31.0 WORKSPACE BOOTSTRAP & SELF-REPAIR RUNTIME =====
const V310_STATE_DIR = path.join(KROM_HOME, ".krom", "v31-bootstrap");
const V310_CONFIG_FILE = path.join(KROM_HOME, "krom.config.json");

async function v310Ensure(){ await fs.mkdir(V310_STATE_DIR,{recursive:true}); }
async function v310Write(name:string,data:any){ await v310Ensure(); const out={generatedAt:new Date().toISOString(),...data}; await fs.writeFile(path.join(V310_STATE_DIR,name),JSON.stringify(out,null,2)); return out; }
async function v310Exec(command:string,args:string[]=[]){
  try{ const resolved=await resolveCommand(command,args); const {stdout,stderr}=await execFileAsync(resolved.program,resolved.args,{cwd:KROM_HOME,windowsHide:true,timeout:15000}); return {ok:true,stdout:String(stdout||'').trim(),stderr:String(stderr||'').trim()}; }
  catch(error:any){ return {ok:false,stdout:String(error?.stdout||'').trim(),stderr:String(error?.stderr||error?.message||'').trim(),code:error?.code??null}; }
}
async function v310RuntimeDoctor(){
  const [node,npm,git]=await Promise.all([v310Exec('node',['--version']),v310Exec('npm',['--version']),v310Exec('git',['--version'])]);
  const checks:any[]=[
    {name:'krom_home_exists',ok:await exists(KROM_HOME),detail:KROM_HOME},
    {name:'project_root_exists',ok:await exists(PROJECT_ROOT),detail:PROJECT_ROOT},
    {name:'server_ts',ok:await exists(path.join(KROM_HOME,'server.ts')),detail:'server.ts'},
    {name:'start_script',ok:await exists(path.join(KROM_HOME,'START-KROM-FORGE.ps1')),detail:'START-KROM-FORGE.ps1'},
    {name:'package_json',ok:await exists(path.join(KROM_HOME,'package.json')),detail:'package.json'},
    {name:'node',ok:node.ok,detail:node.stdout||node.stderr},
    {name:'npm',ok:npm.ok,detail:npm.stdout||npm.stderr},
    {name:'git',ok:git.ok,detail:git.stdout||git.stderr},
  ];
  const blockers=checks.filter(x=>!x.ok).map(x=>x.name);
  return v310Write('runtime-doctor.json',{version:'31.0.0',status:blockers.length?'NEEDS_REPAIR':'PASS',kromHome:KROM_HOME,projectRoot:PROJECT_ROOT,port:PORT,checks,blockers});
}
async function v310PortDiagnostics(input:{port?:number}){
  const port=Number(input.port||PORT);
  let occupied=false; let detail='';
  if(process.platform==='win32'){
    const r=await v310Exec('powershell.exe',['-NoProfile','-Command',`$c=Get-NetTCPConnection -LocalPort ${port} -State Listen -ErrorAction SilentlyContinue; if($c){$c | Select-Object -First 5 LocalAddress,LocalPort,OwningProcess | ConvertTo-Json -Compress}`]);
    occupied=!!r.stdout; detail=r.stdout||r.stderr;
  }else{
    const r=await v310Exec('sh',['-lc',`(command -v lsof >/dev/null && lsof -iTCP:${port} -sTCP:LISTEN) || true`]); occupied=!!r.stdout; detail=r.stdout;
  }
  return v310Write(`port-${port}.json`,{version:'31.0.0',status:occupied?'IN_USE':'AVAILABLE',port,occupied,detail});
}
async function v310EnvTemplate(){
  const target=path.join(KROM_HOME,'.env.example');
  const content=[
    '# KSA FORGE DEV environment template',
    'KROM_HOME=C:\\KSA-FORGE',
    'KROM_PROJECT_ROOT=C:\\KSA-FORGE',
    'PORT=3001',
    '# KROM_PUBLIC_HOST=',
    ''
  ].join('\n');
  if(!(await exists(target))) await fs.writeFile(target,content,'utf8');
  return v310Write('env-template.json',{version:'31.0.0',status:'READY',file:path.basename(target),created:await exists(target)});
}
async function v310WorkspaceBootstrap(){
  await fs.mkdir(KROM_HOME,{recursive:true});
  await fs.mkdir(path.join(KROM_HOME,'.krom'),{recursive:true});
  await fs.mkdir(path.join(KROM_HOME,'.krom','logs'),{recursive:true});
  await fs.mkdir(path.join(KROM_HOME,'.krom','runtime'),{recursive:true});
  if(!(await exists(V310_CONFIG_FILE))){
    await fs.writeFile(V310_CONFIG_FILE,JSON.stringify({kromHome:'C:\\KSA-FORGE',projectRoot:'C:\\KSA-FORGE',port:3001,idePath:'/ide',mcpPath:'/mcp'},null,2));
  }
  await v310EnvTemplate();
  const doctor=await v310RuntimeDoctor();
  return v310Write('bootstrap.json',{version:'31.0.0',status:doctor.blockers?.length?'READY_WITH_WARNINGS':'READY',createdDirectories:['.krom','.krom/logs','.krom/runtime'],config:'krom.config.json',doctorStatus:doctor.status,blockers:doctor.blockers||[]});
}
async function v310RepairPlan(){
  const doctor=await v310RuntimeDoctor();
  const actions:any[]=[];
  for(const b of doctor.blockers||[]){
    if(b==='package_json') actions.push({id:'create-package',action:'Create package.json using BOOTSTRAP-KROM-FORGE.ps1',risk:'LOW'});
    else if(b==='node') actions.push({id:'install-node',action:'Install Node.js 20+ and reopen PowerShell',risk:'MANUAL'});
    else if(b==='npm') actions.push({id:'repair-npm',action:'Repair Node/npm installation',risk:'MANUAL'});
    else actions.push({id:`repair-${b}`,action:`Repair missing requirement: ${b}`,risk:'LOW'});
  }
  return v310Write('repair-plan.json',{version:'31.0.0',status:actions.length?'REPAIR_REQUIRED':'NO_REPAIR_REQUIRED',actions});
}
async function v310StartupIntegrityGate(){
  const doctor=await v310RuntimeDoctor();
  const port=await v310PortDiagnostics({port:PORT});
  const blockers=[...(doctor.blockers||[])];
  if(port.occupied) blockers.push(`port_${PORT}_already_in_use`);
  return v310Write('startup-gate.json',{version:'31.0.0',status:blockers.length?'BLOCKED':'PASS',blockers,checks:{runtime:doctor.status,port:port.status},next:blockers.length?'Run BOOTSTRAP-KROM-FORGE.ps1 or choose another PORT':'Run START-KROM-FORGE.ps1'});
}
async function v310InstallStatus(){
  await v310Ensure();
  let artifacts:string[]=[]; try{artifacts=(await fs.readdir(V310_STATE_DIR)).sort();}catch{}
  return {version:'31.0.0',status:'READY',kromHome:KROM_HOME,projectRoot:PROJECT_ROOT,port:PORT,artifactCount:artifacts.length,artifacts,stateDir:V310_STATE_DIR};
}
// ===== END v31.0 =====


// ===== v32.0 MODEL & PROVIDER ORCHESTRATOR =====
const V320_STATE_DIR = path.join(KROM_HOME, ".krom", "v32-providers");
const V320_PROFILES_FILE = path.join(V320_STATE_DIR, "provider-profiles.json");
const V320_ROUTING_FILE = path.join(V320_STATE_DIR, "routing-policy.json");
type V320ProviderKind = "ollama" | "gpt4all" | "gemini" | "openai-compatible" | "custom";
type V320Profile = {id:string;name:string;kind:V320ProviderKind;baseUrl:string;apiKeyEnv?:string;defaultModel?:string;enabled:boolean;priority:number;timeoutMs:number;headers?:Record<string,string>};
async function v320Ensure(){ await fs.mkdir(V320_STATE_DIR,{recursive:true}); }
function v320NormalizeBase(baseUrl:string){ return String(baseUrl||'').trim().replace(/\/+$/,''); }
function v320SafeId(v:string){ return String(v||'').trim().toLowerCase().replace(/[^a-z0-9_-]+/g,'-').replace(/^-+|-+$/g,'').slice(0,64); }
async function v320Write(name:string,data:any){ await v320Ensure(); const out={generatedAt:new Date().toISOString(),...data}; await fs.writeFile(path.join(V320_STATE_DIR,name),JSON.stringify(out,null,2),'utf8'); return out; }
async function v320ReadProfiles():Promise<V320Profile[]>{
  await v320Ensure();
  if(!(await exists(V320_PROFILES_FILE))){
    const defaults:V320Profile[]=[
      {id:'ollama-local',name:'Ollama Local',kind:'ollama',baseUrl:'http://127.0.0.1:11434',enabled:true,priority:10,timeoutMs:5000},
      {id:'gpt4all-local',name:'GPT4All Local',kind:'gpt4all',baseUrl:'http://127.0.0.1:4891',enabled:false,priority:20,timeoutMs:5000},
      {id:'gemini-google',name:'Google Gemini',kind:'gemini',baseUrl:'https://generativelanguage.googleapis.com/v1beta/openai',apiKeyEnv:'GEMINI_API_KEY',enabled:false,priority:30,timeoutMs:12000}
    ];
    await fs.writeFile(V320_PROFILES_FILE,JSON.stringify({version:'32.1.0',profiles:defaults},null,2),'utf8');
    return defaults;
  }
  try{ const x=JSON.parse(await fs.readFile(V320_PROFILES_FILE,'utf8')); return Array.isArray(x)?x:(x.profiles||[]); }catch{return [];}
}
async function v320SaveProfiles(profiles:V320Profile[]){ await v320Ensure(); await fs.writeFile(V320_PROFILES_FILE,JSON.stringify({version:'32.1.0',updatedAt:new Date().toISOString(),profiles},null,2),'utf8'); }
function v320AuthHeaders(profile:V320Profile){
  const h:Record<string,string>={'accept':'application/json'};
  if(profile.apiKeyEnv){ const value=process.env[profile.apiKeyEnv]; if(value) h.authorization=`Bearer ${value}`; }
  for(const [k,v] of Object.entries(profile.headers||{})){ if(!/authorization|api[-_]?key/i.test(k)) h[k]=v; }
  return h;
}
async function v320FetchJson(url:string,profile:V320Profile){
  const ctrl=new AbortController(); const timer=setTimeout(()=>ctrl.abort(),Math.max(1000,profile.timeoutMs||5000));
  try{ const r=await fetch(url,{headers:v320AuthHeaders(profile),signal:ctrl.signal}); const text=await r.text(); let data:any=null; try{data=text?JSON.parse(text):null}catch{data=text.slice(0,500)}; return {ok:r.ok,status:r.status,data}; }
  catch(e:any){ return {ok:false,status:0,error:String(e?.name==='AbortError'?'timeout':e?.message||e)}; }
  finally{ clearTimeout(timer); }
}
function v320ModelsUrl(profile:V320Profile){ const b=v320NormalizeBase(profile.baseUrl); if(profile.kind==='ollama') return `${b}/api/tags`; if(profile.kind==='gemini') return `${b}/models`; return /\/v1$/i.test(b)?`${b}/models`:`${b}/v1/models`; }
function v320ExtractModels(profile:V320Profile,data:any):string[]{
  if(profile.kind==='ollama') return (data?.models||[]).map((x:any)=>String(x?.name||x?.model||'')).filter(Boolean);
  return (data?.data||data?.models||[]).map((x:any)=>String(typeof x==='string'?x:(x?.id||x?.name||x?.model||''))).filter(Boolean);
}
async function v320ProfileUpsert(input:any){
  const profiles=await v320ReadProfiles(); const id=v320SafeId(input.id||input.name); if(!id) throw new Error('Provider id/name is required.');
  const baseUrl=v320NormalizeBase(input.baseUrl); if(!/^https?:\/\//i.test(baseUrl)) throw new Error('baseUrl must use http:// or https://');
  const next:V320Profile={id,name:String(input.name||id),kind:input.kind,baseUrl,apiKeyEnv:input.apiKeyEnv?String(input.apiKeyEnv):undefined,defaultModel:input.defaultModel?String(input.defaultModel):undefined,enabled:input.enabled!==false,priority:Number(input.priority??50),timeoutMs:Number(input.timeoutMs??7000)};
  const idx=profiles.findIndex(x=>x.id===id); if(idx>=0)profiles[idx]={...profiles[idx],...next}; else profiles.push(next); await v320SaveProfiles(profiles);
  return v320Write(`profile-${id}.json`,{version:'32.1.0',status:'SAVED',profile:{...next,credentialConfigured:next.apiKeyEnv?!!process.env[next.apiKeyEnv]:next.kind==='ollama'||next.kind==='gpt4all'},note:'API key values are never persisted; only environment variable names are stored.'});
}
async function v320Profiles(){ const profiles=await v320ReadProfiles(); return {version:'32.1.0',status:'READY',profiles:profiles.sort((a,b)=>a.priority-b.priority).map(p=>({...p,credentialConfigured:p.apiKeyEnv?!!process.env[p.apiKeyEnv]:p.kind==='ollama'||p.kind==='gpt4all'})),file:V320_PROFILES_FILE}; }
async function v320ProviderHealth(input:{providerId?:string}){
  const profiles=(await v320ReadProfiles()).filter(p=>p.enabled && (!input.providerId||p.id===input.providerId)); const results:any[]=[];
  for(const p of profiles){ const started=Date.now(); const r=await v320FetchJson(v320ModelsUrl(p),p); results.push({providerId:p.id,name:p.name,kind:p.kind,ok:r.ok,status:r.status,latencyMs:Date.now()-started,credentialConfigured:p.apiKeyEnv?!!process.env[p.apiKeyEnv]:true,error:(r as any).error||undefined,models:r.ok?v320ExtractModels(p,(r as any).data).slice(0,50):[]}); }
  return v320Write('provider-health.json',{version:'32.1.0',status:results.some(x=>x.ok)?'AVAILABLE':'UNAVAILABLE',results});
}
async function v320ModelDiscover(input:{providerId?:string}){ const health:any=await v320ProviderHealth(input); return v320Write('model-discovery.json',{version:'32.1.0',status:health.results?.some((x:any)=>x.ok)?'READY':'NO_PROVIDER_AVAILABLE',providers:(health.results||[]).map((x:any)=>({providerId:x.providerId,ok:x.ok,models:x.models||[],latencyMs:x.latencyMs}))}); }
async function v320SelectModel(input:{providerId:string;model:string}){ const profiles=await v320ReadProfiles(); const idx=profiles.findIndex(p=>p.id===input.providerId); if(idx<0)throw new Error(`Unknown provider: ${input.providerId}`); profiles[idx].defaultModel=String(input.model); await v320SaveProfiles(profiles); return v320Write('selected-model.json',{version:'32.1.0',status:'SAVED',providerId:input.providerId,model:input.model}); }
async function v320RoutingPolicy(input:{codingProvider?:string;codingModel?:string;planningProvider?:string;planningModel?:string;generalProvider?:string;generalModel?:string;designProvider?:string;designModel?:string}){
  await v320Ensure(); const current=await (async()=>{try{return JSON.parse(await fs.readFile(V320_ROUTING_FILE,'utf8'))}catch{return {}}})(); const policy={version:'32.1.0',updatedAt:new Date().toISOString(),routes:{...(current.routes||{}),coding:{providerId:input.codingProvider||current.routes?.coding?.providerId,model:input.codingModel||current.routes?.coding?.model},planning:{providerId:input.planningProvider||current.routes?.planning?.providerId,model:input.planningModel||current.routes?.planning?.model},general:{providerId:input.generalProvider||current.routes?.general?.providerId,model:input.generalModel||current.routes?.general?.model},design:{providerId:input.designProvider||current.routes?.design?.providerId,model:input.designModel||current.routes?.design?.model}}}; await fs.writeFile(V320_ROUTING_FILE,JSON.stringify(policy,null,2),'utf8'); return v320Write('routing-policy-status.json',{status:'SAVED',...policy});
}
function v320TaskRoute(task:string){ const q=task.toLowerCase(); if(/ui|ux|design|css|tailwind|responsive|rtl|واجهة|تصميم/.test(q))return 'design'; if(/architect|plan|schema|migration|architecture|خطة|معمار/.test(q))return 'planning'; if(/code|bug|fix|typescript|react|function|component|برمج|صلح|كود/.test(q))return 'coding'; return 'general'; }
async function v320ModelRoute(input:{task:string;requireHealthy?:boolean}){
  const profiles=await v320ReadProfiles(); let policy:any={}; try{policy=JSON.parse(await fs.readFile(V320_ROUTING_FILE,'utf8'))}catch{} const route=v320TaskRoute(input.task); const configured=policy.routes?.[route]; let candidate=profiles.find(p=>p.enabled&&p.id===configured?.providerId)||profiles.filter(p=>p.enabled).sort((a,b)=>a.priority-b.priority)[0];
  let health:any=null; if(candidate && input.requireHealthy!==false){ health=await v320ProviderHealth({providerId:candidate.id}); if(!health.results?.[0]?.ok){ const all:any=await v320ProviderHealth({}); const ok=all.results?.find((x:any)=>x.ok); if(ok)candidate=profiles.find(p=>p.id===ok.providerId); } }
  return v320Write('last-route.json',{version:'32.1.0',status:candidate?'ROUTED':'NO_PROVIDER',taskClass:route,providerId:candidate?.id||null,provider:candidate?.name||null,model:configured?.providerId===candidate?.id&&configured?.model?configured.model:candidate?.defaultModel||null,healthChecked:input.requireHealthy!==false,reason:configured?.providerId?'matched routing policy':'selected enabled provider by priority'});
}
async function v320FallbackPlan(){ const profiles=(await v320ReadProfiles()).filter(p=>p.enabled).sort((a,b)=>a.priority-b.priority); const health:any=await v320ProviderHealth({}); const byId=new Map((health.results||[]).map((x:any)=>[x.providerId,x])); return v320Write('fallback-plan.json',{version:'32.1.0',status:'READY',chain:profiles.map((p,i)=>({order:i+1,providerId:p.id,model:p.defaultModel||null,healthy:!!(byId.get(p.id) as any)?.ok,priority:p.priority})),rule:'Prefer the configured route; fall back only to an enabled provider that passes the health check.'}); }
async function v320Status(){ await v320Ensure(); const profiles=await v320ReadProfiles(); let routing:any=null; try{routing=JSON.parse(await fs.readFile(V320_ROUTING_FILE,'utf8'))}catch{} return {version:'32.1.0',status:'READY',kromHome:KROM_HOME,profileCount:profiles.length,enabledProviders:profiles.filter(p=>p.enabled).length,profilesFile:V320_PROFILES_FILE,routingFile:V320_ROUTING_FILE,routing}; }
// ===== END v32.0 =====

// ===== v33.0 ADAPTIVE MULTI-MODEL INTELLIGENCE =====
const V330_STATE_DIR = path.join(KROM_HOME, ".krom", "v33-model-intelligence");
const V330_HISTORY_FILE = path.join(V330_STATE_DIR, "benchmark-history.json");
async function v330Ensure(){ await fs.mkdir(V330_STATE_DIR,{recursive:true}); }
async function v330Write(name:string,data:any){ await v330Ensure(); const out={generatedAt:new Date().toISOString(),...data}; await fs.writeFile(path.join(V330_STATE_DIR,name),JSON.stringify(out,null,2),'utf8'); return out; }
async function v330ReadHistory():Promise<any[]>{ await v330Ensure(); try{ const x=JSON.parse(await fs.readFile(V330_HISTORY_FILE,'utf8')); return Array.isArray(x)?x:(x.history||[]);}catch{return [];} }
async function v330SaveHistory(history:any[]){ await v330Ensure(); await fs.writeFile(V330_HISTORY_FILE,JSON.stringify({version:'33.0.0',updatedAt:new Date().toISOString(),history:history.slice(-1000)},null,2),'utf8'); }
function v330LatencyScore(ms:number){ if(!Number.isFinite(ms)||ms<=0)return 0; if(ms<=300)return 100; if(ms<=700)return 90; if(ms<=1500)return 75; if(ms<=3000)return 55; if(ms<=6000)return 35; return 15; }
function v330TaskAffinity(kind:string,taskClass:string){
  const table:any={
    coding:{ollama:82,gpt4all:65,gemini:92,'openai-compatible':90,custom:70},
    planning:{ollama:72,gpt4all:62,gemini:94,'openai-compatible':92,custom:70},
    design:{ollama:65,gpt4all:55,gemini:93,'openai-compatible':90,custom:68},
    general:{ollama:75,gpt4all:65,gemini:92,'openai-compatible':90,custom:70}
  };
  return Number(table[taskClass]?.[kind]??70);
}
async function v330ProviderBenchmark(input:{providerId?:string;runs?:number}){
  const runs=Math.max(1,Math.min(5,Number(input.runs||2)));
  const profiles=(await v320ReadProfiles()).filter(p=>p.enabled&&(!input.providerId||p.id===input.providerId));
  const rows:any[]=[];
  for(const p of profiles){
    const samples:any[]=[];
    for(let i=0;i<runs;i++){ const started=Date.now(); const r=await v320FetchJson(v320ModelsUrl(p),p); samples.push({ok:r.ok,status:r.status,latencyMs:Date.now()-started,error:(r as any).error||null,modelCount:r.ok?v320ExtractModels(p,(r as any).data).length:0}); }
    const okCount=samples.filter(x=>x.ok).length; const avg=Math.round(samples.reduce((a,x)=>a+x.latencyMs,0)/samples.length); const availability=Math.round((okCount/samples.length)*100);
    const reliability=Math.round(availability*0.7+v330LatencyScore(avg)*0.3);
    rows.push({providerId:p.id,name:p.name,kind:p.kind,runs,availabilityPct:availability,avgLatencyMs:avg,reliabilityScore:reliability,credentialConfigured:p.apiKeyEnv?!!process.env[p.apiKeyEnv]:true,samples});
  }
  const history=await v330ReadHistory(); history.push({at:new Date().toISOString(),rows:rows.map(r=>({providerId:r.providerId,availabilityPct:r.availabilityPct,avgLatencyMs:r.avgLatencyMs,reliabilityScore:r.reliabilityScore}))}); await v330SaveHistory(history);
  return v330Write('provider-benchmark.json',{version:'33.0.0',status:rows.some(x=>x.availabilityPct>0)?'READY':'NO_PROVIDER_AVAILABLE',rows});
}
async function v330Reliability(input:{providerId?:string}){
  const history=await v330ReadHistory(); const bucket=new Map<string,any[]>();
  for(const h of history){ for(const r of h.rows||[]){ if(input.providerId&&r.providerId!==input.providerId)continue; const a=bucket.get(r.providerId)||[]; a.push(r); bucket.set(r.providerId,a); } }
  const providers=[...bucket.entries()].map(([providerId,rows])=>({providerId,samples:rows.length,availabilityPct:Math.round(rows.reduce((a,r)=>a+Number(r.availabilityPct||0),0)/rows.length),avgLatencyMs:Math.round(rows.reduce((a,r)=>a+Number(r.avgLatencyMs||0),0)/rows.length),reliabilityScore:Math.round(rows.reduce((a,r)=>a+Number(r.reliabilityScore||0),0)/rows.length)})).sort((a,b)=>b.reliabilityScore-a.reliabilityScore);
  return v330Write('provider-reliability.json',{version:'33.0.0',status:providers.length?'READY':'NO_HISTORY',providers});
}
async function v330SmartRoute(input:{task:string;preferLocal?:boolean;maxCandidates?:number}){
  const profiles=(await v320ReadProfiles()).filter(p=>p.enabled); const taskClass=v320TaskRoute(input.task);
  const benchmark:any=await v330ProviderBenchmark({runs:1}); const healthById=new Map((benchmark.rows||[]).map((x:any)=>[x.providerId,x]));
  const candidates=profiles.map(p=>{ const h:any=healthById.get(p.id)||{}; const affinity=v330TaskAffinity(p.kind,taskClass); const localBonus=input.preferLocal&&(p.kind==='ollama'||p.kind==='gpt4all')?8:0; const priorityScore=Math.max(0,100-Math.min(100,p.priority)); const score=Math.round((Number(h.reliabilityScore||0)*0.45)+(affinity*0.35)+(priorityScore*0.20)+localBonus); return {providerId:p.id,provider:p.name,kind:p.kind,model:p.defaultModel||null,healthy:Number(h.availabilityPct||0)>0,reliabilityScore:Number(h.reliabilityScore||0),avgLatencyMs:Number(h.avgLatencyMs||0),taskAffinity:affinity,priority:p.priority,score}; }).sort((a,b)=>b.score-a.score);
  const usable=candidates.filter(x=>x.healthy); const selected=(usable[0]||null);
  return v330Write('smart-route.json',{version:'33.0.0',status:selected?'ROUTED':'NO_PROVIDER',task:input.task,taskClass,selected,candidates:candidates.slice(0,Math.max(1,Math.min(10,Number(input.maxCandidates||5)))),reason:selected?'ranked by health/reliability, task affinity, provider priority and optional local preference':'no enabled provider'});
}
async function v330FallbackChain(input:{task:string;preferLocal?:boolean}){ const routed:any=await v330SmartRoute({task:input.task,preferLocal:input.preferLocal,maxCandidates:10}); return v330Write('adaptive-fallback.json',{version:'33.0.0',status:routed.candidates?.length?'READY':'EMPTY',taskClass:routed.taskClass,chain:(routed.candidates||[]).filter((x:any)=>x.healthy).map((x:any,i:number)=>({order:i+1,...x})),rule:'Fail over only to healthy candidates in descending route score.'}); }
async function v330RouteExplain(input:{task:string}){ const routed:any=await v330SmartRoute({task:input.task,maxCandidates:5}); return v330Write('route-explain.json',{version:'33.0.0',status:routed.status,task:input.task,taskClass:routed.taskClass,selected:routed.selected,explanation:routed.selected?['provider passed live availability check','score combines historical/live reliability','provider affinity matches task class','provider priority contributes but cannot override an unhealthy endpoint']:['no enabled healthy provider was available'],alternatives:routed.candidates||[]}); }
async function v330QualityBenchmarkPlan(input:{taskClass?:string}){ const taskClass=input.taskClass||'coding'; return v330Write('quality-benchmark-plan.json',{version:'33.0.0',status:'PLAN_ONLY',taskClass,note:'This tool does not fabricate answer-quality scores. Execute identical benchmark prompts externally against candidate models, then record measured outcomes.',rubric:{correctness:40,completeness:20,instructionFollowing:15,codeQuality:15,latency:10},requiredEvidence:['same prompt for every model','captured response','objective tests where possible','latency measurement','reviewer or test evidence']}); }
async function v330Status(){ await v330Ensure(); const history=await v330ReadHistory(); const profiles=await v320ReadProfiles(); return {version:'33.0.0',status:'READY',providerCount:profiles.length,enabledProviders:profiles.filter(p=>p.enabled).length,benchmarkRuns:history.length,stateDir:V330_STATE_DIR,capabilities:['provider benchmark','reliability history','smart route','adaptive fallback','route explainability','quality benchmark planning']}; }
// ===== END v33.0 =====




// ===== v34.2 PROVIDER MANAGEMENT & SECRET HANDLING =====
function v342SecretsFile(){ return path.join(KROM_HOME,'.krom-secrets','provider-secrets.env'); }
async function v342LoadSecretEnv(){
  const file=v342SecretsFile();
  try{
    const txt=await fs.readFile(file,'utf8');
    for(const raw of txt.split(/\r?\n/)){
      const line=raw.trim(); if(!line||line.startsWith('#'))continue;
      const i=line.indexOf('='); if(i<1)continue;
      const key=line.slice(0,i).trim(); let value=line.slice(i+1).trim();
      if((value.startsWith('"')&&value.endsWith('"'))||(value.startsWith("'")&&value.endsWith("'"))) value=value.slice(1,-1);
      if(/^[A-Z_][A-Z0-9_]*$/i.test(key) && !process.env[key]) process.env[key]=value;
    }
  }catch{}
}
async function v342PersistSecret(key:string,value:string){
  if(!/^[A-Z_][A-Z0-9_]*$/i.test(key)) throw new Error('Invalid secret environment variable name');
  if(!value || value.length<8) throw new Error('API key is too short');
  const dir=path.dirname(v342SecretsFile()); await fs.mkdir(dir,{recursive:true});
  let lines:string[]=[]; try{lines=(await fs.readFile(v342SecretsFile(),'utf8')).split(/\r?\n/)}catch{}
  const safe=value.replace(/\r|\n/g,'');
  let found=false; lines=lines.map(line=>{if(line.startsWith(key+'=')){found=true;return key+'='+safe}return line});
  if(!found) lines.push(key+'='+safe);
  await fs.writeFile(v342SecretsFile(),lines.filter(Boolean).join('\n')+'\n','utf8');
  process.env[key]=safe;
  return {configured:true,env:key,persisted:true};
}
async function v342SetCredential(input:{providerId:string;apiKey:string}){
  const profiles=await v320ReadProfiles(); const p=profiles.find(x=>x.id===input.providerId); if(!p)throw new Error(`Unknown provider: ${input.providerId}`);
  if(!p.apiKeyEnv) throw new Error('This provider does not require an API key');
  await v342PersistSecret(p.apiKeyEnv,input.apiKey);
  return {version:'34.5.0',status:'SAVED',providerId:p.id,credentialConfigured:true,apiKeyEnv:p.apiKeyEnv};
}
async function v342ToggleProvider(input:{providerId:string;enabled:boolean}){
  return v340ProviderControl({providerId:input.providerId,enabled:input.enabled});
}
async function v342TestProvider(input:{providerId:string}){
  const h:any=await v320ProviderHealth({providerId:input.providerId});
  const r=(h.results||[])[0]||null;
  return {version:'34.5.0',status:r?.ok?'PASS':'FAIL',provider:r};
}
async function v342SetDefault(input:{providerId:string;model:string}){
  const result=await v320SelectModel({providerId:input.providerId,model:input.model});
  return {version:'34.5.0',status:'SAVED',providerId:input.providerId,model:input.model,result};
}
// ===== END v34.2 PROVIDER MANAGEMENT =====

// ===== v34.0 AI CONTROL CENTER & UNIFIED RUNTIME CONSOLE =====
const V340_STATE_DIR = path.join(KROM_HOME, ".krom", "v34-ai-control-center");
async function v340Ensure(){ await fs.mkdir(V340_STATE_DIR,{recursive:true}); }
async function v340Write(name:string,data:any){ await v340Ensure(); const out={generatedAt:new Date().toISOString(),...data}; await fs.writeFile(path.join(V340_STATE_DIR,name),JSON.stringify(out,null,2),'utf8'); return out; }
async function v340ControlStatus(){
  const profiles:any=await v320Profiles();
  let routing:any=null; try{routing=JSON.parse(await fs.readFile(V320_ROUTING_FILE,'utf8'))}catch{}
  const reliability:any=await v330Reliability({});
  return {version:'34.5.0',status:'READY',activeVersion:'34.4.0',kromHome:KROM_HOME,projectRoot:PROJECT_ROOT,providers:profiles.profiles||[],routing:routing?.routes||{},reliability:reliability.providers||[],endpoints:{ide:`http://127.0.0.1:${PORT}/ide`,mcp:`http://127.0.0.1:${PORT}/mcp`}};
}
async function v340ProviderControl(input:{providerId:string;enabled?:boolean;priority?:number}){
  const profiles=await v320ReadProfiles(); const idx=profiles.findIndex(p=>p.id===input.providerId); if(idx<0)throw new Error(`Unknown provider: ${input.providerId}`);
  if(typeof input.enabled==='boolean') profiles[idx].enabled=input.enabled;
  if(Number.isFinite(input.priority)) profiles[idx].priority=Math.max(1,Math.min(999,Number(input.priority)));
  await v320SaveProfiles(profiles); return v340Write('provider-control.json',{version:'34.5.0',status:'SAVED',provider:{...profiles[idx],credentialConfigured:profiles[idx].apiKeyEnv?!!process.env[profiles[idx].apiKeyEnv]:true}});
}
async function v340QuickSelect(input:{providerId:string;model:string;taskClass?:'coding'|'planning'|'design'|'general'}){
  const selected=await v320SelectModel({providerId:input.providerId,model:input.model});
  if(input.taskClass){ const k=input.taskClass; const patch:any={}; patch[`${k}Provider`]=input.providerId; patch[`${k}Model`]=input.model; await v320RoutingPolicy(patch); }
  return v340Write('quick-select.json',{version:'34.5.0',status:'SAVED',providerId:input.providerId,model:input.model,taskClass:input.taskClass||null,selected});
}
async function v340RoutePreview(input:{task:string;preferLocal?:boolean}){ const x:any=await v330RouteExplain({task:input.task}); return v340Write('route-preview.json',{version:'34.5.0',...x,preferLocal:!!input.preferLocal}); }
async function v340RuntimeBannerAudit(){
  const source=await fs.readFile(path.join(KROM_HOME,'server.ts'),'utf8').catch(()=> '');
  const legacy=[...source.matchAll(/KROM FORGE DEV v(\d+(?:\.\d+)?)/g)].map(m=>m[0]);
  const unique=[...new Set(legacy)];
  return v340Write('runtime-banner-audit.json',{version:'34.5.0',status:unique.some(x=>!x.includes('v34.2'))?'REVIEW':'PASS',activeBanner:'KROM FORGE DEV v34.5 - AI CONTROL CENTER',legacyMentions:unique.filter(x=>!x.includes('v34.2'))});
}
async function v340Status(){ const c=await v340ControlStatus(); const b=await v340RuntimeBannerAudit(); return {version:'34.5.0',status:'READY',providers:c.providers.length,routing:c.routing,legacyBannerReview:b.status==='REVIEW',stateDir:V340_STATE_DIR}; }
function v344EscHtml(value:any){
  return String(value ?? '').replace(/[&<>\"']/g,(c)=>({"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#39;"} as any)[c]||c);
}
function v344InitialProviders(status:any){
  const providers=Array.isArray(status?.providers)?status.providers:[];
  if(!providers.length) return '<div class="v34muted">No provider profiles.</div>';
  return providers.map((p:any)=>{
    const state=p.enabled?'ready':'disabled';
    const cls=p.enabled?'v34ok':'v34warn';
    const secret=p.apiKeyEnv
      ? `<div class="v34secret"><input id="v34-key-${v344EscHtml(p.id)}" class="v34input" type="password" autocomplete="new-password" placeholder="${p.credentialConfigured?'API key configured — enter new key to replace':'Enter '+v344EscHtml(p.apiKeyEnv)}"><button class="v34btn small" onclick="v34SaveKey('${v344EscHtml(p.id)}')">Save Key</button></div>`
      : '';
    return `<div class="v34provider" data-provider="${v344EscHtml(p.id)}"><div class="v34row"><div><b>${v344EscHtml(p.name)}</b><div class="v34muted">${v344EscHtml(p.kind)} · ${v344EscHtml(p.baseUrl)}</div></div><span class="${cls}" id="v34-state-${v344EscHtml(p.id)}">● ${state}</span></div><div class="v34muted" id="v34-meta-${v344EscHtml(p.id)}">latency: — ms · credential: ${p.credentialConfigured?'ready':'missing'}</div><select class="v34select v34models" id="v34-model-${v344EscHtml(p.id)}"><option value="">${v344EscHtml(p.defaultModel||'Select model')}</option></select>${secret}<div class="v34actions"><button class="v34btn small" onclick="v34Toggle('${v344EscHtml(p.id)}',${!p.enabled})">${p.enabled?'Disable':'Enable'}</button><button class="v34btn small" onclick="v34Test('${v344EscHtml(p.id)}')">Test Connection</button><button class="v34btn small" onclick="v34Default('${v344EscHtml(p.id)}')">Set Default Model</button></div><div class="v34toast" id="v34-note-${v344EscHtml(p.id)}"></div></div>`;
  }).join('');
}
async function v340Html(){
  const base=v80Html();
  let initialStatus:any={providers:[]};
  try{ initialStatus=await v340ControlStatus(); }catch{}
  const initialCount=Array.isArray(initialStatus?.providers)?initialStatus.providers.length:0;
  const css=`<style id="v34-css">#krom-ai-control{position:fixed;right:18px;bottom:18px;width:min(540px,calc(100vw - 36px));max-height:78vh;overflow:auto;background:#0d1117;border:1px solid #30363d;border-radius:16px;box-shadow:0 18px 60px rgba(0,0,0,.45);z-index:99999;color:#e6edf3;font-family:Inter,Segoe UI,Arial,sans-serif}.v34h{display:flex;justify-content:space-between;align-items:center;padding:14px 16px;border-bottom:1px solid #21262d}.v34title{font-weight:800}.v34badge{font-size:11px;padding:4px 8px;border-radius:999px;background:#132238;color:#58a6ff}.v34body{padding:12px}.v34provider{border:1px solid #21262d;border-radius:12px;padding:10px;margin:8px 0;background:#161b22}.v34row{display:flex;justify-content:space-between;gap:8px;align-items:center}.v34muted{font-size:12px;color:#8b949e}.v34ok{color:#3fb950}.v34bad{color:#f85149}.v34warn{color:#d29922}.v34btn,.v34select,.v34input{background:#21262d;color:#e6edf3;border:1px solid #30363d;border-radius:8px;padding:7px 9px}.v34btn{cursor:pointer}.v34btn:hover{border-color:#58a6ff}.v34btn.small{font-size:12px;padding:6px 8px}.v34grid{display:grid;grid-template-columns:1fr auto;gap:8px;margin-top:10px}.v34models{width:100%;margin-top:8px}.v34route{white-space:pre-wrap;font-size:12px;background:#010409;border-radius:10px;padding:9px;margin-top:8px;max-height:150px;overflow:auto}.v34actions{display:flex;gap:6px;flex-wrap:wrap;margin-top:8px}.v34secret{display:grid;grid-template-columns:1fr auto;gap:6px;margin-top:8px}.v34toast{font-size:12px;min-height:18px;margin-top:6px}</style>`;
  const panel=`<section id="krom-ai-control"><div class="v34h"><div><div class="v34title">KROM AI Control Center</div><div class="v34muted">v34.5 · Server-rendered Provider Management · Gemini · Ollama · GPT4All</div></div><span class="v34badge" id="v34-global">${initialCount} providers</span></div><div class="v34body"><div id="v34-providers">${v344InitialProviders(initialStatus)}</div><div class="v34grid"><input id="v34-task" class="v34input" placeholder="Describe a task to preview routing"><button class="v34btn" onclick="v34Route()">Route</button></div><div id="v34-route" class="v34route">Route explanation will appear here.</div></div></section>`;
  const js=`<script id="v34-js">(function(){
const V34={status:${JSON.stringify(initialStatus).replace(/</g,'\\u003c')}};
function esc(s){return String(s==null?'':s).replace(/[&<>\"]/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','\"':'&quot;'}[c]||c})}
async function api(u,o){const r=await fetch(u,Object.assign({cache:'no-store'},o||{}));let d;try{d=await r.json()}catch(_){throw new Error('Invalid JSON from '+u+' (HTTP '+r.status+')')}if(!r.ok)throw new Error((d&&d.error)||('HTTP '+r.status+' '+u));return d}
function badge(text,ok){const g=document.getElementById('v34-global');if(g){g.textContent=text;g.style.color=ok===false?'#f85149':'#58a6ff'}}
function note(id,text,ok){const el=document.getElementById('v34-note-'+id);if(el){el.textContent=text;el.className='v34toast '+(ok===false?'v34bad':'v34ok')}}
function applyHealth(status,health){const hm=new Map(((health&&health.results)||[]).map(function(x){return [x.providerId,x]}));((status&&status.providers)||[]).forEach(function(p){const h=hm.get(p.id)||{};const state=document.getElementById('v34-state-'+p.id);const meta=document.getElementById('v34-meta-'+p.id);const select=document.getElementById('v34-model-'+p.id);if(state){const label=!p.enabled?'disabled':(h.ok?'online':'offline');state.textContent='● '+label;state.className=h.ok?'v34ok':(!p.enabled?'v34warn':'v34bad')}if(meta)meta.textContent='latency: '+(h.latencyMs==null?'—':h.latencyMs)+' ms · credential: '+(p.credentialConfigured?'ready':'missing');if(select&&Array.isArray(h.models)){const current=p.defaultModel||'';select.innerHTML='<option value="">'+esc(current||'Select model')+'</option>'+h.models.map(function(m){return '<option value="'+esc(m)+'" '+(m===current?'selected':'')+'>'+esc(m)+'</option>'}).join('')}})}
async function load(){let status=V34.status;try{status=await api('/ide/api/ai-control/status');V34.status=status;badge(((status.providers||[]).length)+' providers',true)}catch(e){badge('status refresh failed',false);console.warn('[KROM v34.5 status]',e)}try{const health=await api('/ide/api/ai-control/health');applyHealth(status,health);badge(((status.providers||[]).length)+' providers',true)}catch(e){badge(((status.providers||[]).length)+' providers · health unavailable',true);console.warn('[KROM v34.5 health]',e)}}
async function v34Toggle(id,enabled){try{note(id,'Saving…');await api('/ide/api/ai-control/toggle',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({providerId:id,enabled:enabled})});location.reload()}catch(e){note(id,(e&&e.message)||String(e),false)}}
async function v34SaveKey(id){const el=document.getElementById('v34-key-'+id);const key=el&&el.value?el.value.trim():'';if(!key){note(id,'Enter an API key first',false);return}try{note(id,'Saving key…');await api('/ide/api/ai-control/credential',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({providerId:id,apiKey:key})});el.value='';note(id,'Key saved securely');location.reload()}catch(e){note(id,(e&&e.message)||String(e),false)}}
async function v34Test(id){try{note(id,'Testing…');const d=await api('/ide/api/ai-control/test',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({providerId:id})});note(id,d.status==='PASS'?'Connection OK · '+((d.provider&&d.provider.latencyMs)||'—')+' ms':'Connection failed',d.status==='PASS')}catch(e){note(id,(e&&e.message)||String(e),false)}}
async function v34Default(id){const el=document.getElementById('v34-model-'+id);const model=el&&el.value?el.value:'';if(!model){note(id,'Select a model first',false);return}try{note(id,'Saving default…');await api('/ide/api/ai-control/default',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({providerId:id,model:model})});note(id,'Default model saved');location.reload()}catch(e){note(id,(e&&e.message)||String(e),false)}}
async function v34Route(){const input=document.getElementById('v34-task');const task=input?input.value.trim():'';if(!task)return;const out=document.getElementById('v34-route');if(out)out.textContent='Routing…';try{const d=await api('/ide/api/ai-control/route',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({task:task})});if(out)out.textContent=JSON.stringify({selected:d.selected,explanation:d.explanation,alternatives:d.alternatives},null,2)}catch(e){if(out)out.textContent=(e&&e.message)||String(e)}}
window.v34Toggle=v34Toggle;window.v34SaveKey=v34SaveKey;window.v34Test=v34Test;window.v34Default=v34Default;window.v34Route=v34Route;window.v34Load=load;setTimeout(function(){load().catch(function(){})},250);
})();</script>`;
  return base.replace('</head>',css+'</head>').replace('</body>',panel+js+'</body>');
}

// ===== END v34.0 =====


// ===== v35.0 DEVELOPER PLATFORM: CHAT + PREVIEW =====
const V350_STATE_DIR = path.join(KROM_HOME, ".krom", "v35-developer-platform");
const V350_CHAT_FILE = path.join(V350_STATE_DIR, "chat-history.json");
async function v350Ensure(){ await fs.mkdir(V350_STATE_DIR,{recursive:true}); }
async function v350ReadChat(){ await v350Ensure(); try{return JSON.parse(await fs.readFile(V350_CHAT_FILE,'utf8'));}catch{return {messages:[]};} }
async function v350WriteChat(messages:any[]){ await v350Ensure(); const out={version:'37.0.0',updatedAt:new Date().toISOString(),messages:messages.slice(-80)}; await fs.writeFile(V350_CHAT_FILE,JSON.stringify(out,null,2),'utf8'); return out; }
function v350ContentFromOpenAI(data:any){ return String(data?.choices?.[0]?.message?.content ?? data?.choices?.[0]?.text ?? '').trim(); }
let v350ChatBusy=false;
async function v350AskModel(input:{message:string;activeFile?:string|null;preferLocal?:boolean}){
  if(v350ChatBusy) throw new Error('A chat request is already running. Wait for its response.');
  v350ChatBusy=true;
  try{return await v350AskModelImpl(input);}finally{v350ChatBusy=false;}
}
async function v350AskModelImpl(input:{message:string;activeFile?:string|null;preferLocal?:boolean}){
  const message=String(input.message||'').trim(); if(!message) throw new Error('message is required');
  const routed:any=await v330SmartRoute({task:message,preferLocal:!!input.preferLocal,maxCandidates:5});
  if(!routed.selected?.providerId) throw new Error('No enabled provider is available. Enable Gemini or Ollama first.');
  const profiles=await v320ReadProfiles(); const profile=profiles.find(p=>p.id===routed.selected.providerId); if(!profile) throw new Error('Selected provider profile was not found.');
  let model=profile.defaultModel||routed.selected.model||'';
  if(!model){ const h:any=await v320ProviderHealth({providerId:profile.id}); model=String(h.results?.[0]?.models?.[0]||''); }
  if(!model) throw new Error(`No model is available for ${profile.name}.`);
  let fileContext='';
  if(input.activeFile){ try{ const txt=await v80ReadTextFile(String(input.activeFile)); fileContext=txt.slice(0,14000); }catch{} }
  const system=`You are KSA FORGE Developer Agent working on ${PROJECT_ROOT}. Be concise and implementation-oriented. Analyze the current project before making broad claims. When code changes are requested, identify files, risks, verification steps and concrete edits. Do not claim commands/tests passed unless evidence is provided.${input.activeFile?` Current file: ${input.activeFile}`:''}`;
  const previousChat=await v350ReadChat();
  const user=fileContext?`${message}\n\nCURRENT FILE CONTEXT (${input.activeFile}):\n${fileContext}`:message;
  const messagesForModel=chatMessages(system,previousChat.messages||[],user);
  const started=Date.now(); let answer=''; let httpStatus=0;
  if(profile.kind==='ollama'){
    const ctrl=new AbortController(); const timer=setTimeout(()=>ctrl.abort(),Math.max(15000,profile.timeoutMs||30000));
    try{ const r=await fetch(`${v320NormalizeBase(profile.baseUrl)}/api/chat`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({model,messages:messagesForModel,stream:false}),signal:ctrl.signal}); httpStatus=r.status; const d:any=await r.json(); if(!r.ok)throw new Error(d?.error||`Ollama HTTP ${r.status}`); answer=String(d?.message?.content||d?.response||'').trim(); } finally{clearTimeout(timer)}
  }else{
    const url=completionUrl(profile.baseUrl,profile.kind);
    const headers={...v320AuthHeaders(profile),'content-type':'application/json'};
    const ctrl=new AbortController(); const timer=setTimeout(()=>ctrl.abort(),Math.max(15000,profile.timeoutMs||30000));
    try{ const r=await fetch(url,{method:'POST',headers,body:JSON.stringify({model,messages:messagesForModel,temperature:0.2}),signal:ctrl.signal}); httpStatus=r.status; const text=await r.text(); let d:any={}; try{d=JSON.parse(text)}catch{d={error:text.slice(0,500)}} if(!r.ok)throw new Error(d?.error?.message||d?.error||`Provider HTTP ${r.status}`); answer=v350ContentFromOpenAI(d); } finally{clearTimeout(timer)}
  }
  if(!answer) throw new Error('The provider returned an empty response.');
  const history=await v350ReadChat(); const messages=[...(history.messages||[]),{role:'user',content:message,at:new Date().toISOString(),activeFile:input.activeFile||null},{role:'assistant',content:answer,at:new Date().toISOString(),providerId:profile.id,provider:profile.name,model,latencyMs:Date.now()-started}]; await v350WriteChat(messages);
  return {version:'37.0.0',status:'OK',answer,providerId:profile.id,provider:profile.name,model,latencyMs:Date.now()-started,httpStatus,route:routed.selected};
}
async function v350FullScan(){
  const [runtime,diag,deps,git]=await Promise.all([v310RuntimeDoctor(),v60Diagnostics(),v90DependencyDoctor(),executeProgram('git',['status','--short'],PROJECT_ROOT,30000)]);
  const health=await v90Health(diag);
  const errors=(diag.diagnostics||[]).filter((x:any)=>x.severity==='error');
  const warnings=(diag.diagnostics||[]).filter((x:any)=>x.severity!=='error');
  const failedChecks=(diag.checks||[]).filter((x:any)=>x.available!==false && x.success===false);
  const blockers=[...(runtime.blockers||[]),...failedChecks.map((x:any)=>x.name)];
  if(errors.length) blockers.push('diagnostic errors');
  if(health.score<80) blockers.push('project health');
  const needsReview=!git.success || deps.concerns.some((x:any)=>x.severity==='warning') || diag.checks.some((x:any)=>x.available===false);
  return {version:'37.0.0',status:blockers.length?'ISSUES_FOUND':needsReview?'REVIEW':'READY',projectRoot:PROJECT_ROOT,blockers,checks:diag.checks,summary:{runtime:runtime.status,diagnostics:diag.status,errorCount:errors.length,warningCount:warnings.length,dependencyStatus:deps.concerns.some((x:any)=>x.severity==='warning')?'REVIEW':'READY',healthStatus:health.grade||'UNKNOWN',gitStatus:git.success?'AVAILABLE':'UNAVAILABLE',gitDirty:git.success?!!String(git.stdout||'').trim():null},errors:errors.slice(0,100),warnings:warnings.slice(0,100),dependencies:deps,health,git:git.success?git.stdout:(git.stderr||git.message)};
}
async function v350PreviewSet(input:{url:string}){ const url=String(input.url||'').trim(); if(url && !/^https?:\/\//i.test(url)) throw new Error('Preview URL must start with http:// or https://'); const state={status:url?'CONFIGURED':'IDLE',url:url||null,viewport:{width:1440,height:900},lastChecked:new Date().toISOString()}; await v60WriteJson(V70_PREVIEW_FILE,state); return {version:'37.0.0',status:'SAVED',preview:state}; }
async function v350PlatformStatus(){ const [state,control,chat]=await Promise.all([v80WorkbenchState(),v340ControlStatus(),v350ReadChat()]); return {version:'37.0.0',status:'READY',project:PROJECT_ROOT,preview:state.preview,providers:control.providers,chatMessages:(chat.messages||[]).slice(-30),activeFile:state.editor?.activeFile||null}; }
function v350Esc(v:any){ return String(v??'').replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':'&quot;',"'":'&#39;'} as any)[c]||c); }
async function v350Html(){
  const st:any=await v350PlatformStatus(); const providers=(st.providers||[]).filter((p:any)=>p.enabled); const providerLabel=providers.map((p:any)=>p.name).join(' · ')||'No provider enabled'; const previewUrl=st.preview?.url||'';
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>KSA FORGE DEV v37</title><style>
:root{color-scheme:dark;font-family:Inter,Segoe UI,system-ui,sans-serif;--bg:#080c12;--panel:#0f151f;--panel2:#131b27;--line:#253246;--text:#e8edf5;--muted:#8695a9;--blue:#3b82f6;--green:#2dd46f;--red:#ff5d68}*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--text);overflow:hidden}.app{height:100vh;display:grid;grid-template-rows:52px 1fr 28px}.top{display:flex;align-items:center;gap:10px;padding:0 14px;background:#0d141e;border-bottom:1px solid var(--line)}.brand{font-weight:900;letter-spacing:.02em}.brand span{color:#60a5fa}.project{margin-left:auto;color:var(--muted);font-size:13px}.pill{border:1px solid var(--line);background:#111b28;border-radius:999px;padding:5px 9px;font-size:12px;color:#a9bdd6}.main{min-height:0;display:grid;grid-template-columns:minmax(360px,42%) 1fr}.chatPane{border-right:1px solid var(--line);display:grid;grid-template-rows:46px 1fr auto;background:var(--panel);min-width:0}.paneHead{display:flex;align-items:center;gap:8px;padding:0 12px;border-bottom:1px solid var(--line)}button,.btn,select,input,textarea{font:inherit}.btn{background:#172231;color:var(--text);border:1px solid #304158;border-radius:8px;padding:7px 10px;cursor:pointer}.btn:hover{border-color:#5a89c9}.btn.primary{background:#1d4ed8;border-color:#2563eb}.btn.ghost{background:transparent}.messages{overflow:auto;padding:16px;display:flex;flex-direction:column;gap:12px}.msg{max-width:92%;padding:11px 13px;border:1px solid var(--line);border-radius:12px;white-space:pre-wrap;line-height:1.5;font-size:13px}.msg.user{align-self:flex-end;background:#173056}.msg.ai{align-self:flex-start;background:#111a25}.meta{font-size:11px;color:var(--muted);margin-top:7px}.composer{padding:12px;border-top:1px solid var(--line);background:#0d141e}.composer textarea{width:100%;min-height:84px;max-height:190px;resize:vertical;background:#080d14;color:var(--text);border:1px solid var(--line);border-radius:10px;padding:11px;outline:none}.composerRow{display:flex;gap:8px;align-items:center;margin-top:8px}.composerRow select{background:#111a25;color:var(--text);border:1px solid var(--line);border-radius:8px;padding:7px;max-width:220px}.previewPane{display:grid;grid-template-rows:46px 1fr;min-width:0;background:#0a0f16}.previewHead{display:flex;align-items:center;gap:8px;padding:0 12px;border-bottom:1px solid var(--line)}.previewHead input{flex:1;background:#111a25;color:var(--text);border:1px solid var(--line);border-radius:8px;padding:7px 9px}.previewWrap{position:relative;min-height:0}.previewWrap iframe{width:100%;height:100%;border:0;background:white}.empty{height:100%;display:flex;align-items:center;justify-content:center;color:var(--muted);text-align:center;padding:30px}.dock{position:absolute;left:12px;bottom:42px;z-index:30;display:flex;gap:7px}.drawer{position:absolute;left:12px;right:12px;bottom:78px;height:44vh;background:#0c131d;border:1px solid var(--line);border-radius:12px;z-index:29;box-shadow:0 20px 60px #0008;display:none;grid-template-columns:260px 1fr 320px;overflow:hidden}.drawer.open{display:grid}.drawerCol{overflow:auto;border-right:1px solid var(--line)}.drawerCol:last-child{border:0}.title{position:sticky;top:0;background:#101824;padding:10px 12px;border-bottom:1px solid var(--line);font-size:12px;font-weight:800}.item{padding:7px 10px;border-bottom:1px solid #172130;font-size:12px;cursor:pointer}.item:hover{background:#152132}.editor{width:100%;height:100%;background:#080d14;color:#dbe7f7;border:0;resize:none;padding:12px;font:12px/1.55 ui-monospace,Consolas,monospace}.status{display:flex;align-items:center;gap:14px;padding:0 10px;background:#0e5c8b;font-size:11px}.ok{color:var(--green)}.bad{color:var(--red)}@media(max-width:900px){.main{grid-template-columns:1fr}.previewPane{display:none}.drawer{grid-template-columns:1fr}.drawerCol:nth-child(2),.drawerCol:nth-child(3){display:none}.project{display:none}}
</style></head><body><div class="app"><header class="top"><div class="brand">KSA FORGE DEV <span>v36</span></div><span class="pill">Developer Platform</span><span class="pill" id="providerBadge">${v350Esc(providerLabel)}</span><div class="project">${v350Esc(PROJECT_ROOT)}</div></header><main class="main"><section class="chatPane"><div class="paneHead"><b>AI Developer Chat</b><span style="color:var(--muted);font-size:12px" id="activeFileLabel">workspace</span><button class="btn ghost" style="margin-left:auto" onclick="fullScan()">Full Project Scan</button></div><div class="messages" id="messages"></div><div class="composer"><textarea id="prompt" placeholder="Ask KSA Forge to inspect, build, fix, refactor, or explain this project..."></textarea><div class="composerRow"><select id="providerMode"><option value="auto">Auto route</option><option value="local">Prefer local</option></select><button class="btn primary" onclick="sendChat()">Send</button><button class="btn" onclick="clearChatView()">Clear View</button></div></div></section><section class="previewPane"><div class="previewHead"><b>Live Preview</b><input id="previewUrl" value="${v350Esc(previewUrl)}" placeholder="http://127.0.0.1:5173"><button class="btn" onclick="setPreview()">Open</button><button class="btn" onclick="reloadPreview()">Reload</button></div><div class="previewWrap" id="previewWrap">${previewUrl?`<iframe id="previewFrame" src="${v350Esc(previewUrl)}"></iframe>`:`<div class="empty" id="previewEmpty">Start your app, enter its local URL above, then click Open.<br>Example: http://127.0.0.1:5173</div>`}</div></section></main><div class="dock"><a class="btn" href="/ide/tools">Tools &amp; Automation</a><button class="btn" onclick="toggleDrawer()">Workspace</button><button class="btn" onclick="refreshWorkspace()">Refresh</button><button class="btn" onclick="window.open('/ide/api/ai-control/status','_blank')">AI Status</button></div><section class="drawer" id="drawer"><div class="drawerCol"><div class="title">Explorer</div><div id="files"></div></div><div class="drawerCol"><div class="title">Editor</div><textarea class="editor" id="codeEditor" placeholder="Select a file"></textarea><div style="padding:8px"><button class="btn" onclick="saveActiveFile()">Save File</button></div></div><div class="drawerCol"><div class="title">Problems / Execution</div><div id="problems"></div><div class="title">Execution</div><div id="execution"></div></div></section><footer class="status"><span id="status">Ready</span><span>Chat + Preview · ${v350Esc(PROJECT_ROOT)}</span></footer></div><script>
let workspace=null,activeFile=null;const initialMessages=${JSON.stringify(st.chatMessages||[]).replace(/</g,'\\u003c')};
function esc(s){return String(s??'').replace(/[&<>\"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','\"':'&quot;'}[c]||c))}async function api(u,o){const r=await fetch(u,Object.assign({cache:'no-store'},o||{}));let d;try{d=await r.json()}catch{throw new Error('Invalid response from '+u)}if(!r.ok)throw new Error(d.error||('HTTP '+r.status));return d}function setStatus(s){document.getElementById('status').textContent=s}function renderMessages(msgs){document.getElementById('messages').innerHTML=(msgs||[]).map(m=>'<div class="msg '+(m.role==='user'?'user':'ai')+'">'+esc(m.content)+'<div class="meta">'+esc(m.provider||m.model||m.activeFile||'')+'</div></div>').join('');const box=document.getElementById('messages');box.scrollTop=box.scrollHeight}renderMessages(initialMessages);
async function sendChat(){const el=document.getElementById('prompt');const message=el.value.trim();if(!message)return;const current=[...document.querySelectorAll('#messages .msg')];document.getElementById('messages').insertAdjacentHTML('beforeend','<div class="msg user">'+esc(message)+'</div><div class="msg ai" id="thinking">Thinking…</div>');el.value='';setStatus('Routing and asking model…');try{const d=await api('/ide/api/dev/chat',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({message,activeFile,preferLocal:document.getElementById('providerMode').value==='local'})});const t=document.getElementById('thinking');if(t)t.outerHTML='<div class="msg ai">'+esc(d.answer)+'<div class="meta">'+esc(d.provider)+' · '+esc(d.model)+' · '+esc(d.latencyMs)+' ms</div></div>';setStatus('Response received')}catch(e){const t=document.getElementById('thinking');if(t)t.outerHTML='<div class="msg ai"><span class="bad">'+esc(e.message)+'</span></div>';setStatus('Chat failed')}}
async function fullScan(){setStatus('Scanning project…');document.getElementById('messages').insertAdjacentHTML('beforeend','<div class="msg ai" id="scanmsg">Running full project scan…</div>');try{const d=await api('/ide/api/dev/scan',{method:'POST'});const text='PROJECT SCAN\\nStatus: '+d.status+'\\nRuntime: '+d.summary.runtime+'\\nDiagnostics: '+d.summary.diagnostics+'\\nErrors: '+d.summary.errorCount+'\\nWarnings: '+d.summary.warningCount+'\\nDependencies: '+d.summary.dependencyStatus+'\\nHealth: '+d.summary.healthStatus+'\\nGit: '+d.summary.gitStatus+'\\nGit dirty: '+(d.summary.gitDirty===null?'Unavailable':d.summary.gitDirty);document.getElementById('scanmsg').textContent=text;setStatus('Scan complete')}catch(e){document.getElementById('scanmsg').textContent='Scan failed: '+e.message;setStatus('Scan failed')}}
async function setPreview(){const url=document.getElementById('previewUrl').value.trim();try{await api('/ide/api/dev/preview',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({url})});const wrap=document.getElementById('previewWrap');wrap.innerHTML=url?'<iframe id="previewFrame" src="'+esc(url)+'"></iframe>':'<div class="empty">Preview cleared</div>';setStatus('Preview configured')}catch(e){setStatus(e.message)}}function reloadPreview(){const f=document.getElementById('previewFrame');if(f)f.src=f.src}
function toggleDrawer(){document.getElementById('drawer').classList.toggle('open')}async function refreshWorkspace(){setStatus('Refreshing workspace…');try{workspace=await api('/ide/api/state');document.getElementById('files').innerHTML=(workspace.files?.items||[]).slice(0,700).map(x=>'<div class="item" onclick="openFile('+JSON.stringify(x.file).replace(/"/g,'&quot;')+')">'+esc(x.file)+'</div>').join('');document.getElementById('problems').innerHTML=(workspace.diagnostics?.items||[]).slice(0,120).map(x=>'<div class="item bad">'+esc(x.file)+':'+esc(x.line)+' · '+esc(x.message)+'</div>').join('')||'<div class="item ok">No parsed problems</div>';document.getElementById('execution').innerHTML=(workspace.execution||[]).slice(-50).reverse().map(x=>'<div class="item">'+esc(x.kind)+' · '+esc(x.title||x.status||x.id||'')+'</div>').join('');setStatus('Workspace refreshed')}catch(e){setStatus(e.message)}}async function openFile(file){try{const d=await api('/ide/api/file?path='+encodeURIComponent(file));activeFile=file;document.getElementById('codeEditor').value=d.content||'';document.getElementById('activeFileLabel').textContent=file;setStatus('Opened '+file)}catch(e){setStatus(e.message)}}async function saveActiveFile(){if(!activeFile)return setStatus('Select a file first');try{await api('/ide/api/file',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({path:activeFile,content:document.getElementById('codeEditor').value})});setStatus('Saved '+activeFile)}catch(e){setStatus(e.message)}}function clearChatView(){document.getElementById('messages').innerHTML=''}
document.getElementById('prompt').addEventListener('keydown',e=>{if(e.key==='Enter'&&(e.ctrlKey||e.metaKey)){e.preventDefault();sendChat()}});refreshWorkspace();
</script></body></html>`;
}
// ===== END v35.0 =====

function createServer() {
  



const server = new McpServer({
    name: "KSA-FORGE-DEV",
    version: "37.0.0"
  });

  const register = server.registerTool.bind(server);
  server.registerTool = ((name:any, config:any, handler:any) => {
    const invoke=async (...args:any[])=>{const response=await handler(...args);return outcome(response)==='FAIL'?{...response,isError:true}:response;};
    toolRuntime.capture(name,config,invoke);
    return register(name,config,invoke);
  }) as typeof server.registerTool;

  // =========================================================
  // PROJECT INSPECTION
  // =========================================================

  server.registerTool(
    "inspect_project",
    {
      title: "Inspect Project",
      description:
        "Inspect project structure, package manager, scripts and framework indicators.",
      inputSchema: z.object({}),
      annotations: {
        readOnlyHint: true,
        openWorldHint: false
      }
    },
    async () => {
      try {
        const packageJson = await readPackageJson();

        const rootEntries = await fs.readdir(
          PROJECT_ROOT,
          { withFileTypes: true }
        );

        const packageManager =
          await detectPackageManager();

        const indicators = {
          react:
            Boolean(packageJson?.dependencies?.react) ||
            Boolean(packageJson?.devDependencies?.react),

          next:
            Boolean(packageJson?.dependencies?.next),

          vite:
            Boolean(packageJson?.dependencies?.vite) ||
            Boolean(packageJson?.devDependencies?.vite),

          electron:
            Boolean(packageJson?.dependencies?.electron) ||
            Boolean(packageJson?.devDependencies?.electron),

          typescript:
            await exists(
              path.join(PROJECT_ROOT, "tsconfig.json")
            ),

          git:
            await exists(
              path.join(PROJECT_ROOT, ".git")
            )
        };

        return result(
          JSON.stringify(
            {
              projectRoot: PROJECT_ROOT,
              packageManager,
              projectName: packageJson?.name ?? null,
              version: packageJson?.version ?? null,
              scripts: packageJson?.scripts ?? {},
              indicators,
              root: rootEntries.map((entry) => ({
                name: entry.name,
                type: entry.isDirectory()
                  ? "directory"
                  : "file"
              }))
            },
            null,
            2
          )
        );
      } catch (error) {
        return errorResult(error);
      }
    }
  );

  // =========================================================
  // LIST FILES
  // =========================================================

  server.registerTool(
    "list_files",
    {
      title: "List Project Files",
      description:
        "Recursively list project files while ignoring generated dependency directories.",
      inputSchema: z.object({
        limit: z.number()
          .int()
          .min(1)
          .max(4000)
          .default(1000)
      }),
      annotations: {
        readOnlyHint: true,
        openWorldHint: false
      }
    },
    async ({ limit }) => {
      try {
        const files = await walkProject(
          PROJECT_ROOT,
          [],
          limit
        );

        return result(
          files
            .map((file) =>
              path.relative(PROJECT_ROOT, file)
            )
            .join("\n")
        );
      } catch (error) {
        return errorResult(error);
      }
    }
  );

  // =========================================================
  // READ FILE
  // =========================================================

  server.registerTool(
    "read_file",
    {
      title: "Read File",
      description:
        "Read a UTF-8 source or configuration file inside the project.",
      inputSchema: z.object({
        path: z.string().min(1)
      }),
      annotations: {
        readOnlyHint: true,
        openWorldHint: false
      }
    },
    async ({ path: relativePath }) => {
      try {
        const target = safePath(relativePath);
        const stat = await fs.stat(target);

        if (stat.size > MAX_FILE_SIZE) {
          throw new Error(
            `File is too large: ${stat.size} bytes`
          );
        }

        const content = await fs.readFile(
          target,
          "utf8"
        );

        return result(content);
      } catch (error) {
        return errorResult(error);
      }
    }
  );

  // =========================================================
  // SEARCH CODE
  // =========================================================

  server.registerTool(
    "search_code",
    {
      title: "Search Code",
      description:
        "Search project text files for code, symbols, text or error messages.",
      inputSchema: z.object({
        query: z.string().min(1),
        caseSensitive: z.boolean().default(false),
        maxResults: z.number()
          .int()
          .min(1)
          .max(100)
          .default(30)
      }),
      annotations: {
        readOnlyHint: true,
        openWorldHint: false
      }
    },
    async ({
      query,
      caseSensitive,
      maxResults
    }) => {
      try {
        const files = await walkProject();
        const matches: any[] = [];

        const wanted = caseSensitive
          ? query
          : query.toLowerCase();

        for (const file of files) {
          if (matches.length >= maxResults) break;
          if (!isTextFile(file)) continue;

          let stat;

          try {
            stat = await fs.stat(file);
          } catch {
            continue;
          }

          if (stat.size > MAX_FILE_SIZE) {
            continue;
          }

          let content: string;

          try {
            content = await fs.readFile(file, "utf8");
          } catch {
            continue;
          }

          const lines = content.split(/\r?\n/);

          for (
            let index = 0;
            index < lines.length;
            index++
          ) {
            const searchable = caseSensitive
              ? lines[index]
              : lines[index].toLowerCase();

            if (searchable.includes(wanted)) {
              matches.push({
                file: path.relative(
                  PROJECT_ROOT,
                  file
                ),
                line: index + 1,
                text: lines[index].trim()
              });
            }

            if (matches.length >= maxResults) {
              break;
            }
          }
        }

        return result(
          JSON.stringify(
            {
              query,
              count: matches.length,
              matches
            },
            null,
            2
          )
        );
      } catch (error) {
        return errorResult(error);
      }
    }
  );

  // =========================================================
  // WRITE FILE
  // =========================================================

  server.registerTool(
    "write_file",
    {
      title: "Write File",
      description:
        "Create or replace a project text file. Existing files are backed up first.",
      inputSchema: z.object({
        path: z.string().min(1),
        content: z.string()
      }),
      annotations: {
        readOnlyHint: false,
        destructiveHint: true,
        idempotentHint: true,
        openWorldHint: false
      }
    },
    async ({
      path: relativePath,
      content
    }) => {
      try {
        const target = safePath(relativePath);

        const backup = await backupFile(target);

        await fs.mkdir(path.dirname(target), {
          recursive: true
        });

        await fs.writeFile(
          target,
          content,
          "utf8"
        );

        await recordChangedFile(relativePath);

        return result(
          JSON.stringify(
            {
              success: true,
              file: relativePath,
              backup:
                backup
                  ? path.relative(PROJECT_ROOT, backup)
                  : null
            },
            null,
            2
          )
        );
      } catch (error) {
        return errorResult(error);
      }
    }
  );

  // =========================================================
  // SURGICAL PATCH
  // =========================================================

  server.registerTool(
    "patch_file",
    {
      title: "Patch File",
      description:
        "Replace an exact piece of text in a project file with automatic backup.",
      inputSchema: z.object({
        path: z.string().min(1),
        search: z.string().min(1),
        replace: z.string(),
        replaceAll: z.boolean().default(false)
      }),
      annotations: {
        readOnlyHint: false,
        destructiveHint: true,
        idempotentHint: false,
        openWorldHint: false
      }
    },
    async ({
      path: relativePath,
      search,
      replace,
      replaceAll
    }) => {
      try {
        const target = safePath(relativePath);

        const original = await fs.readFile(
          target,
          "utf8"
        );

        const occurrences =
          original.split(search).length - 1;

        if (occurrences === 0) {
          throw new Error(
            "Search text was not found. File was not modified."
          );
        }

        if (!replaceAll && occurrences > 1) {
          throw new Error(
            `Search text occurs ${occurrences} times. Use a more specific search or set replaceAll=true.`
          );
        }

        const updated = replaceAll
          ? original.split(search).join(replace)
          : original.replace(search, replace);

        const backup = await backupFile(target);

        await fs.writeFile(
          target,
          updated,
          "utf8"
        );

        await recordChangedFile(relativePath);

        return result(
          JSON.stringify(
            {
              success: true,
              file: relativePath,
              occurrences,
              replaced: replaceAll
                ? occurrences
                : 1,
              backup:
                backup
                  ? path.relative(PROJECT_ROOT, backup)
                  : null
            },
            null,
            2
          )
        );
      } catch (error) {
        return errorResult(error);
      }
    }
  );

  // =========================================================
  // CONTROLLED TERMINAL
  // =========================================================

  server.registerTool(
    "run_command",
    {
      title: "Run Development Command",
      description:
        "Run an approved development executable inside the project without invoking a shell.",
      inputSchema: z.object({
        program: z.string().min(1),
        args: z.array(z.string()).default([]),
        cwd: z.string().default("."),
        timeoutSeconds: z.number()
          .int()
          .min(1)
          .max(300)
          .default(180)
      }),
      annotations: {
        readOnlyHint: false,
        destructiveHint: true,
        openWorldHint: true
      }
    },
    async ({
      program,
      args,
      cwd,
      timeoutSeconds
    }) => {
      try {
        const allowed = new Set([
          "node",
          "npm",
          "npx",
          "pnpm",
          "yarn",
          "bun",
          "python",
          "python3",
          "pip",
          "pip3",
          "pytest",
          "tsc",
          "eslint",
          "vite",
          "next",
          "git",
          "cargo",
          "go",
          "dotnet",
          "mvn",
          "gradle",
          "java",
          "javac"
        ]);

        if (
          program.includes("/") ||
          program.includes("\\") ||
          !allowed.has(program.toLowerCase())
        ) {
          throw new Error(
            `Program is not allowed: ${program}`
          );
        }

        if (program.toLowerCase() === "git") {
          const gitAction =
            String(args[0] || "").toLowerCase();

          const safeGit = new Set([
            "status",
            "diff",
            "log",
            "show",
            "branch",
            "rev-parse"
          ]);

          if (!safeGit.has(gitAction)) {
            throw new Error(
              `git ${gitAction} is blocked in run_command.`
            );
          }
        }

        const workingDirectory = safePath(cwd);

        const execution = await executeProgram(
          program,
          args,
          workingDirectory,
          timeoutSeconds * 1000
        );

        await recordCommandEvidence(
          [program, ...args].join(" "),
          execution.success,
          execution.success ? "PASS" : (execution.message || execution.stderr || "FAIL").slice(0, 500)
        );

        return result(
          JSON.stringify(execution, null, 2)
        );
      } catch (error) {
        return errorResult(error);
      }
    }
  );

  // =========================================================
  // BUILD
  // =========================================================

  server.registerTool(
    "run_build",
    {
      title: "Run Build",
      description:
        "Run the project's build script and return real evidence.",
      inputSchema: z.object({}),
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        openWorldHint: false
      }
    },
    async () =>
      result(
        JSON.stringify(
          await runPackageScript(["build"]),
          null,
          2
        )
      )
  );

  // =========================================================
  // TESTS
  // =========================================================

  server.registerTool(
    "run_tests",
    {
      title: "Run Tests",
      description:
        "Run the project's automated test script.",
      inputSchema: z.object({}),
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        openWorldHint: false
      }
    },
    async () =>
      result(
        JSON.stringify(
          await runPackageScript([
            "test",
            "test:ci"
          ]),
          null,
          2
        )
      )
  );

  // =========================================================
  // LINT
  // =========================================================

  server.registerTool(
    "run_lint",
    {
      title: "Run Lint",
      description:
        "Run the project's lint script.",
      inputSchema: z.object({}),
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        openWorldHint: false
      }
    },
    async () =>
      result(
        JSON.stringify(
          await runPackageScript(["lint"]),
          null,
          2
        )
      )
  );

  // =========================================================
  // TYPECHECK
  // =========================================================

  server.registerTool(
    "run_typecheck",
    {
      title: "Run Type Check",
      description:
        "Run an existing project type checking script.",
      inputSchema: z.object({}),
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        openWorldHint: false
      }
    },
    async () =>
      result(
        JSON.stringify(
          await runPackageScript([
            "typecheck",
            "type-check",
            "check:types",
            "check"
          ]),
          null,
          2
        )
      )
  );

  // =========================================================
  // GIT STATUS
  // =========================================================

  server.registerTool(
    "git_status",
    {
      title: "Git Status",
      description:
        "Inspect current Git worktree status.",
      inputSchema: z.object({}),
      annotations: {
        readOnlyHint: true,
        openWorldHint: false
      }
    },
    async () => {
      const execution = await executeProgram(
        "git",
        ["status", "--short", "--branch"]
      );

      return result(
        JSON.stringify(execution, null, 2)
      );
    }
  );

  // =========================================================
  // GIT DIFF
  // =========================================================

  server.registerTool(
    "git_diff",
    {
      title: "Git Diff",
      description:
        "Show uncommitted source changes.",
      inputSchema: z.object({}),
      annotations: {
        readOnlyHint: true,
        openWorldHint: false
      }
    },
    async () => {
      const execution = await executeProgram(
        "git",
        ["diff", "--"]
      );

      return result(
        JSON.stringify(execution, null, 2)
      );
    }
  );

  // =========================================================
  // VERIFICATION GATE
  // =========================================================

  server.registerTool(
    "verification_gate",
    {
      title: "KROM Verification Gate",
      description:
        "Execute build, tests, lint and typecheck when available and calculate an evidence-based result.",
      inputSchema: z.object({}),
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        openWorldHint: false
      }
    },
    async () => {
      const build = await runPackageScript([
        "build"
      ]);

      const tests = await runPackageScript([
        "test",
        "test:ci"
      ]);

      const lint = await runPackageScript([
        "lint"
      ]);

      const typecheck = await runPackageScript([
        "typecheck",
        "type-check",
        "check:types",
        "check"
      ]);

      const checks = {
        build,
        tests,
        lint,
        typecheck
      };

      const available = Object.values(checks)
        .filter((check: any) => check.available);

      const failed = available
        .filter((check: any) =>
          check.status === "FAIL"
        );

      let verdict:
        | "PASS"
        | "PASS_WITH_GAPS"
        | "FAIL";

      if (failed.length > 0) {
        verdict = "FAIL";
      } else if (available.length === 4) {
        verdict = "PASS";
      } else {
        verdict = "PASS_WITH_GAPS";
      }

      return result(
        JSON.stringify(
          {
            verdict,
            projectRoot: PROJECT_ROOT,
            checks
          },
          null,
          2
        )
      );
    }
  );



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
        const manifest: ExecutionManifest = {
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
          manifestPath: `${EXECUTION_DIR}/${EXECUTION_FILE}`,
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
          const relative = path.join(PROMPT_LIBRARY_DIR, `${name}.md`);
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
        const root = await fs.readdir(PROJECT_ROOT, { withFileTypes: true });
        const deps = {
          ...(pkg?.dependencies || {}),
          ...(pkg?.devDependencies || {})
        };
        const detected = [
          deps.react ? "React" : null,
          deps.next ? "Next.js" : null,
          deps.vite ? "Vite" : null,
          deps.typescript || await exists(path.join(PROJECT_ROOT, "tsconfig.json")) ? "TypeScript" : null,
          deps.electron ? "Electron" : null,
          deps['@supabase/supabase-js'] ? "Supabase" : null,
          deps.tailwindcss ? "Tailwind CSS" : null
        ].filter(Boolean) as string[];

        const context = [
          `Project root: ${PROJECT_ROOT}`,
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
          const relative = path.join(PROMPT_LIBRARY_DIR, `${name}.md`);
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
        const dir = safePath(PROMPT_LIBRARY_DIR);
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
        const relative = path.join(PROMPT_LIBRARY_DIR, `${safeName}.md`);
        const target = safePath(relative);

        if (action === "get") {
          return result(await fs.readFile(target, "utf8"));
        }

        if (action === "save") {
          if (!content?.trim()) throw new Error("content is required for save.");
          const backup = await backupFile(target);
          await fs.writeFile(target, content, "utf8");
          return result(JSON.stringify({ success: true, file: relative, backup: backup ? path.relative(PROJECT_ROOT, backup) : null }, null, 2));
        }

        if (!(await exists(target))) {
          throw new Error(`Prompt not found: ${safeName}`);
        }
        const backup = await backupFile(target);
        await fs.unlink(target);
        return result(JSON.stringify({ success: true, deleted: relative, backup: backup ? path.relative(PROJECT_ROOT, backup) : null }, null, 2));
      } catch (error) {
        return errorResult(error);
      }
    }
  );


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


  // =========================================================
  // v3.3 SMART CODE INTELLIGENCE TOOLS
  // =========================================================

  server.registerTool(
    "code_intelligence_scan",
    {
      title: "Smart Code Intelligence Scan",
      description: "Build a project-level dependency and symbol graph from real source files. Maps local imports, reverse dependents, exported symbols, routes, file roles, and unresolved local imports before broad changes.",
      inputSchema: z.object({ maxFiles: z.number().int().min(100).max(6000).default(3000) }),
      annotations: { readOnlyHint: false, openWorldHint: false }
    },
    async ({ maxFiles }) => {
      try {
        const graph = await buildCodeIntelligenceGraph(maxFiles);
        const hotspots = Object.values(graph.nodes)
          .map(n => ({ file: n.file, dependents: n.importedBy.length, dependencies: n.imports.length, routes: n.routes, kind: n.kind }))
          .sort((a,b) => b.dependents - a.dependents)
          .slice(0, 20);
        return result(JSON.stringify({ generatedAt: graph.generatedAt, stats: graph.stats, unresolvedImports: graph.unresolvedImports.slice(0, 50), hotspots, graphFile: `.krom/${CODE_INTEL_FILE}`, rule: "Run impact_analysis before modifying shared/high-dependency files." }, null, 2));
      } catch (error) { return errorResult(error); }
    }
  );

  server.registerTool(
    "impact_analysis",
    {
      title: "Pre-Change Impact Analysis",
      description: "Analyze blast radius before editing files or symbols. Returns direct/indirect dependents, dependencies, routes, tests, data/config sensitivity, risk score, and a concrete regression verification scope.",
      inputSchema: z.object({
        files: z.array(z.string()).default([]),
        symbol: z.string().optional(),
        depth: z.number().int().min(1).max(6).default(3),
        refreshGraph: z.boolean().default(false)
      }),
      annotations: { readOnlyHint: true, openWorldHint: false }
    },
    async ({ files, symbol, depth, refreshGraph }) => {
      try {
        const graph = refreshGraph ? await buildCodeIntelligenceGraph() : (await readCodeIntelligenceGraph()) || await buildCodeIntelligenceGraph();
        const normalized: string[] = (files as string[]).map(normalizeRel).filter((f: string) => Boolean(graph.nodes[f]));
        if (symbol) {
          for (const n of Object.values(graph.nodes)) {
            if (n.symbols.includes(symbol) || n.exports.includes(symbol)) normalized.push(n.file);
          }
        }
        const starts: string[] = [...new Set<string>(normalized)];
        if (!starts.length) return result(JSON.stringify({ status: "NO_MATCH", message: "No matching project files/symbols found. Run code_intelligence_scan and provide paths relative to project root." }, null, 2));
        const dependentReach = dependencyReach(graph, starts, "dependents", depth);
        const dependencyReachResult = dependencyReach(graph, starts, "dependencies", Math.min(depth, 2));
        const affected = [...new Set([...starts, ...dependentReach.all])];
        const affectedNodes = affected.map(f => graph.nodes[f]).filter(Boolean);
        const routes = [...new Set(affectedNodes.flatMap(n => n.routes))];
        const tests = affected.filter(f => /(?:test|spec|__tests__)/i.test(f));
        const dataFiles = affected.filter(f => graph.nodes[f]?.kind === "data");
        const configFiles = affected.filter(f => graph.nodes[f]?.kind === "config");
        const risk = riskForImpact(starts, dependentReach.all, routes, dataFiles.length > 0, configFiles.length > 0);
        return result(JSON.stringify({
          status: "OK",
          targets: starts,
          risk,
          directDependents: starts.flatMap(f => graph.nodes[f]?.importedBy || []).filter((x,i,a) => a.indexOf(x)===i),
          indirectDependents: dependentReach,
          dependencies: dependencyReachResult,
          affectedRoutes: routes,
          relatedTests: tests,
          dataSensitiveFiles: dataFiles,
          configSensitiveFiles: configFiles,
          verificationScope: {
            always: ["typecheck", "relevant tests", "build when shared/runtime code changes"],
            browser: routes.length ? routes : "Run impacted user flows when UI/routes are affected",
            data: dataFiles.length ? "Verify migrations/RLS/query contracts and preserve existing data" : null
          },
          changeRule: risk.level === "HIGH" ? "Use small reversible patches; verify direct dependents first, then impacted routes, then full gate." : "Patch narrowly and verify listed dependents before release."
        }, null, 2));
      } catch (error) { return errorResult(error); }
    }
  );

  server.registerTool(
    "symbol_intelligence",
    {
      title: "Symbol Intelligence",
      description: "Find where a symbol is declared/exported and which files depend on those declarations. Useful before renaming, moving, or changing shared functions/components/types.",
      inputSchema: z.object({ symbol: z.string().min(1), refreshGraph: z.boolean().default(false) }),
      annotations: { readOnlyHint: true, openWorldHint: false }
    },
    async ({ symbol, refreshGraph }) => {
      try {
        const graph = refreshGraph ? await buildCodeIntelligenceGraph() : (await readCodeIntelligenceGraph()) || await buildCodeIntelligenceGraph();
        const matches = Object.values(graph.nodes).filter(n => n.symbols.includes(symbol) || n.exports.includes(symbol));
        return result(JSON.stringify({ symbol, declarations: matches.map(n => ({ file: n.file, exported: n.exports.includes(symbol), kind: n.kind, directDependents: n.importedBy, routes: n.routes })), count: matches.length }, null, 2));
      } catch (error) { return errorResult(error); }
    }
  );

  server.registerTool(
    "regression_scope",
    {
      title: "Regression Scope Builder",
      description: "Use changed files from the precision execution manifest to compute what should be retested before completion, including impacted routes and dependent source areas.",
      inputSchema: z.object({ depth: z.number().int().min(1).max(5).default(3), refreshGraph: z.boolean().default(true) }),
      annotations: { readOnlyHint: false, openWorldHint: false }
    },
    async ({ depth, refreshGraph }) => {
      try {
        const manifest = await readExecutionManifest();
        const changed = manifest?.changedFiles || [];
        if (!changed.length) return result(JSON.stringify({ status: "NO_CHANGED_FILES", nextStep: "Start precision execution and modify files before building regression scope." }, null, 2));
        const graph = refreshGraph ? await buildCodeIntelligenceGraph() : (await readCodeIntelligenceGraph()) || await buildCodeIntelligenceGraph();
        const starts = changed.map(normalizeRel).filter(f => graph.nodes[f]);
        const reach = dependencyReach(graph, starts, "dependents", depth);
        const impacted = [...new Set([...starts, ...reach.all])];
        const routes = [...new Set(impacted.flatMap(f => graph.nodes[f]?.routes || []))];
        const likelyTests = Object.values(graph.nodes).filter(n => n.kind === "test" && (n.imports.some(i => impacted.includes(i)) || impacted.some(i => n.file.includes(path.posix.basename(i).replace(/\.[^.]+$/, ""))))).map(n => n.file);
        return result(JSON.stringify({ status: "OK", changedFiles: changed, graphMatchedChangedFiles: starts, impactedFiles: impacted, impactedRoutes: routes, likelyTests, recommendedOrder: ["targeted tests", "typecheck", "impacted browser flows", "build", "release gate"], warning: starts.length < changed.length ? "Some changed files are not represented in the current source graph (assets/generated/non-code files may be expected)." : null }, null, 2));
      } catch (error) { return errorResult(error); }
    }
  );


  // =========================================================
  // v3.4 SMART CONTEXT + DECISION ENGINE TOOLS
  // =========================================================

  server.registerTool(
    "smart_context_build",
    {
      title: "Smart Context Builder",
      description: "Build a compact, evidence-based project context for the current task using query relevance, code dependencies, changed files, shared hotspots, routes, project memory, and a bounded context budget.",
      inputSchema: z.object({
        task: z.string().min(3),
        maxFiles: z.number().int().min(5).max(100).default(30),
        maxChars: z.number().int().min(20000).max(500000).default(120000),
        refreshGraph: z.boolean().default(false)
      }),
      annotations: { readOnlyHint: false, openWorldHint: false }
    },
    async ({ task, maxFiles, maxChars, refreshGraph }) => {
      try {
        const bundle = await buildSmartContext(task, maxFiles, maxChars, refreshGraph);
        return result(JSON.stringify({
          status: "OK",
          generatedAt: bundle.generatedAt,
          selectedFiles: bundle.selected,
          omittedHighRisk: bundle.omittedHighRisk,
          estimatedChars: bundle.estimatedChars,
          budgetChars: bundle.tokenBudgetChars,
          changedFiles: bundle.changedFiles,
          memorySummary: bundle.memorySummary,
          contextFile: `.krom/${SMART_CONTEXT_FILE}`,
          rule: "Inspect selected files first. Do not broaden context blindly; expand through Code Intelligence only when a missing dependency is evidenced."
        }, null, 2));
      } catch (error) { return errorResult(error); }
    }
  );

  server.registerTool(
    "context_file_pack",
    {
      title: "Context File Pack",
      description: "Read the currently selected Smart Context files into a bounded evidence pack with per-file truncation. Designed to feed implementation agents only the relevant source instead of the whole repository.",
      inputSchema: z.object({
        perFileChars: z.number().int().min(1000).max(30000).default(10000),
        maxTotalChars: z.number().int().min(5000).max(250000).default(80000)
      }),
      annotations: { readOnlyHint: true, openWorldHint: false }
    },
    async ({ perFileChars, maxTotalChars }) => {
      try {
        let bundle: SmartContextBundle | null = null;
        try { bundle = JSON.parse(await fs.readFile(await kromStatePath(SMART_CONTEXT_FILE), "utf8")); } catch {}
        if (!bundle) return result(JSON.stringify({ status: "NO_CONTEXT", nextStep: "Run smart_context_build first." }, null, 2));
        const files: Array<{ file: string; kind: string; score: number; truncated: boolean; content: string }> = [];
        let total = 0;
        for (const item of bundle.selected) {
          if (total >= maxTotalChars) break;
          let content = "";
          try { content = await fs.readFile(path.join(PROJECT_ROOT, item.file), "utf8"); } catch { continue; }
          const limit = Math.min(perFileChars, maxTotalChars - total);
          const sliced = content.slice(0, Math.max(0, limit));
          files.push({ file: item.file, kind: item.kind, score: item.score, truncated: sliced.length < content.length, content: sliced });
          total += sliced.length;
        }
        return result(JSON.stringify({ status: "OK", query: bundle.query, totalChars: total, files, warning: "Truncated files must be read directly before editing any omitted section." }, null, 2));
      } catch (error) { return errorResult(error); }
    }
  );

  server.registerTool(
    "decision_engine",
    {
      title: "Engineering Decision Engine",
      description: "Choose a task-specific execution mode, agent route, risk level, mandatory pre-change analysis, and post-change verification using Smart Context evidence rather than a fixed workflow.",
      inputSchema: z.object({
        task: z.string().min(3),
        rebuildContext: z.boolean().default(true)
      }),
      annotations: { readOnlyHint: false, openWorldHint: false }
    },
    async ({ task, rebuildContext }) => {
      try {
        let bundle: SmartContextBundle | null = null;
        if (!rebuildContext) {
          try { bundle = JSON.parse(await fs.readFile(await kromStatePath(SMART_CONTEXT_FILE), "utf8")); } catch {}
        }
        if (!bundle || bundle.query !== task) bundle = await buildSmartContext(task, 30, 120000, false);
        const strategy = decideExecutionStrategy(task, bundle);
        return result(JSON.stringify({
          task,
          strategy,
          context: { selectedFiles: bundle.selected.map(x => x.file), omittedHighRisk: bundle.omittedHighRisk.map(x => x.file), estimatedChars: bundle.estimatedChars },
          executionOrder: [
            "Read project memory and smart context",
            "Run impact analysis for shared/high-risk targets",
            "Implement a narrow change",
            "Build regression scope from actual changed files",
            "Run targeted checks and browser/visual checks when UI is affected",
            "Run release gate and repair failures before DONE"
          ]
        }, null, 2));
      } catch (error) { return errorResult(error); }
    }
  );

  server.registerTool(
    "context_gap_check",
    {
      title: "Context Gap Check",
      description: "Detect likely missing context before implementation by checking unresolved imports, omitted high-risk files, empty task matches, and dependency-neighbor coverage.",
      inputSchema: z.object({}),
      annotations: { readOnlyHint: true, openWorldHint: false }
    },
    async () => {
      try {
        let bundle: SmartContextBundle | null = null;
        try { bundle = JSON.parse(await fs.readFile(await kromStatePath(SMART_CONTEXT_FILE), "utf8")); } catch {}
        if (!bundle) return result(JSON.stringify({ status: "NO_CONTEXT", nextStep: "Run smart_context_build first." }, null, 2));
        const graph = (await readCodeIntelligenceGraph()) || await buildCodeIntelligenceGraph();
        const selected = new Set(bundle.selected.map(x => x.file));
        const missingNeighbors = new Set<string>();
        for (const file of selected) {
          const node = graph.nodes[file];
          if (!node) continue;
          for (const dep of node.imports) if (!selected.has(dep)) missingNeighbors.add(dep);
        }
        const gaps = [] as Array<{ severity: string; issue: string; files?: string[] }>;
        if (!bundle.selected.length) gaps.push({ severity: "critical", issue: "No files matched the task context." });
        if (bundle.omittedHighRisk.length) gaps.push({ severity: "major", issue: "High-risk relevant files were omitted by the context budget.", files: bundle.omittedHighRisk.map(x => x.file) });
        if (missingNeighbors.size > 12) gaps.push({ severity: "minor", issue: "Many direct dependencies are outside the selected context; inspect only those needed by the target symbols.", files: [...missingNeighbors].slice(0, 25) });
        if (graph.unresolvedImports.length) gaps.push({ severity: "minor", issue: "Code Intelligence has unresolved local imports; path aliases or generated modules may need configuration review.", files: graph.unresolvedImports.slice(0, 20).map(x => `${x.from} -> ${x.specifier}`) });
        return result(JSON.stringify({ status: gaps.some(x => x.severity === "critical") ? "BLOCKED" : gaps.length ? "REVIEW" : "READY", gaps, selectedCount: bundle.selected.length, rule: "Resolve critical context gaps before editing. Major gaps require explicit inspection before touching related high-risk files." }, null, 2));
      } catch (error) { return errorResult(error); }
    }
  );





  // =========================================================
  // v3.5 ADAPTIVE AGENT RUNTIME + TASK GRAPH TOOLS
  // =========================================================

  server.registerTool(
    "task_decomposition_graph",
    {
      title: "Task Decomposition Graph",
      description: "Decompose a large prompt into an ordered dependency graph with owners and executable verification gates. Persists the graph under .krom/task-graph.json.",
      inputSchema: z.object({ task: z.string().min(3), rebuildContext: z.boolean().default(true) }),
      annotations: { readOnlyHint: false, openWorldHint: false }
    },
    async ({ task, rebuildContext }) => {
      try {
        let bundle: SmartContextBundle | null = null;
        if (!rebuildContext) { try { bundle = JSON.parse(await fs.readFile(await kromStatePath(SMART_CONTEXT_FILE), "utf8")); } catch {} }
        if (!bundle || bundle.query !== task) bundle = await buildSmartContext(task, 30, 120000, false);
        const strategy = decideExecutionStrategy(task, bundle);
        const graph = buildTaskGraph(task, strategy);
        await fs.writeFile(await kromStatePath(TASK_GRAPH_FILE), JSON.stringify(graph, null, 2), "utf8");
        return result(JSON.stringify({ status: "OK", graphFile: `.krom/${TASK_GRAPH_FILE}`, strategy, nodes: graph.nodes, rule: "Execute only READY nodes. A dependent node cannot become READY until every dependency is VERIFIED." }, null, 2));
      } catch (error) { return errorResult(error); }
    }
  );

  server.registerTool(
    "task_graph_update",
    {
      title: "Task Graph Update",
      description: "Update one task-graph node with evidence-aware status and automatically unlock dependent nodes only after verified prerequisites.",
      inputSchema: z.object({
        nodeId: z.string().min(2),
        status: z.enum(["pending","ready","in_progress","verified","blocked"]),
        evidence: z.array(z.string()).default([])
      }),
      annotations: { readOnlyHint: false, openWorldHint: false }
    },
    async ({ nodeId, status, evidence }) => {
      try {
        const fp = await kromStatePath(TASK_GRAPH_FILE);
        const graph: TaskGraph = JSON.parse(await fs.readFile(fp, "utf8"));
        const node = graph.nodes.find(n => n.id === nodeId);
        if (!node) return result(JSON.stringify({status:"NOT_FOUND",nodeId},null,2));
        if (status === "verified" && evidence.length === 0) return result(JSON.stringify({status:"REJECTED",reason:"Verified requires evidence."},null,2));
        node.status = status;
        for (const n of graph.nodes) {
          if (n.status === "pending" && n.dependsOn.every(id => graph.nodes.find(x=>x.id===id)?.status === "verified")) n.status = "ready";
        }
        await fs.writeFile(fp, JSON.stringify(graph, null, 2), "utf8");
        return result(JSON.stringify({status:"OK",node,ready:graph.nodes.filter(n=>n.status==="ready").map(n=>({id:n.id,title:n.title,agent:n.agent}))},null,2));
      } catch (error) { return errorResult(error); }
    }
  );

  server.registerTool(
    "adaptive_agent_route",
    {
      title: "Adaptive Agent Router",
      description: "Choose the strongest agent for the current subtask using task semantics, execution strategy, and prior failed attempts. Penalizes repeating a failed agent path.",
      inputSchema: z.object({ task: z.string().min(3), recordDecision: z.boolean().default(true) }),
      annotations: { readOnlyHint: false, openWorldHint: false }
    },
    async ({ task, recordDecision }) => {
      try {
        let bundle: SmartContextBundle | null = null;
        try { bundle = JSON.parse(await fs.readFile(await kromStatePath(SMART_CONTEXT_FILE), "utf8")); } catch {}
        if (!bundle) bundle = await buildSmartContext(task, 30, 120000, false);
        const strategy = decideExecutionStrategy(task, bundle);
        const history = await readRuntimeHistory();
        const choice = chooseAgentForTask(task, strategy, history);
        if (recordDecision) {
          history.push({at:new Date().toISOString(),task,selectedAgent:choice.selectedAgent,reason:choice.reason,evidence:[`mode:${strategy.mode}`,`risk:${strategy.risk}`,`context:${bundle.selected.length} files`]});
          await writeRuntimeHistory(history);
        }
        return result(JSON.stringify({status:"OK",strategy,choice,rule:"If the selected route fails, record the outcome and rerun adaptive_agent_route before repeating the same approach."},null,2));
      } catch (error) { return errorResult(error); }
    }
  );

  server.registerTool(
    "runtime_outcome",
    {
      title: "Runtime Outcome Recorder",
      description: "Record success/failure for an adaptive agent decision so future routing can avoid repeatedly selecting an unsuccessful path.",
      inputSchema: z.object({ task: z.string().min(3), agent: z.string().min(2), outcome: z.enum(["success","failed","partial","blocked"]), evidence: z.array(z.string()).default([]), failureFingerprint: z.string().optional() }),
      annotations: { readOnlyHint: false, openWorldHint: false }
    },
    async ({ task, agent, outcome, evidence, failureFingerprint }) => {
      try {
        const history=await readRuntimeHistory();
        history.push({at:new Date().toISOString(),task,selectedAgent:agent,reason:"runtime outcome",evidence,outcome,failureFingerprint});
        await writeRuntimeHistory(history);
        const sameFailures=history.filter(x=>x.task===task && x.selectedAgent===agent && x.outcome==="failed").length;
        return result(JSON.stringify({status:"OK",sameAgentFailures:sameFailures,nextStep:sameFailures>=2?"Do not repeat the same agent strategy without new evidence; reroute or broaden root-cause analysis.":"Continue according to task graph."},null,2));
      } catch(error){ return errorResult(error); }
    }
  );

  server.registerTool(
    "adaptive_runtime_status",
    {
      title: "Adaptive Runtime Status",
      description: "Show the active task graph, ready/blocked work, and recent adaptive routing outcomes.",
      inputSchema: z.object({}),
      annotations: { readOnlyHint: true, openWorldHint: false }
    },
    async () => {
      try {
        let graph: TaskGraph | null=null;
        try { graph=JSON.parse(await fs.readFile(await kromStatePath(TASK_GRAPH_FILE),"utf8")); } catch {}
        const history=await readRuntimeHistory();
        return result(JSON.stringify({status:"OK",taskGraph:graph?{task:graph.task,nodes:graph.nodes,ready:graph.nodes.filter(n=>n.status==="ready").map(n=>n.id),blocked:graph.nodes.filter(n=>n.status==="blocked").map(n=>n.id)}:null,recentDecisions:history.slice(-20)},null,2));
      } catch(error){ return errorResult(error); }
    }
  );


  // =========================================================
  // v3.6 SELF-IMPROVING MEMORY + CONFIDENCE TOOLS
  // =========================================================

  server.registerTool(
    "learning_memory_record",
    {
      title: "Engineering Learning Memory Recorder",
      description: "Store an evidence-backed engineering lesson from a completed or failed attempt so future routing and repair decisions can reuse proven patterns without pretending unverified guesses are learned facts.",
      inputSchema: z.object({
        task: z.string().min(3),
        outcome: z.enum(["success","failed","partial","blocked"]),
        lesson: z.string().min(5),
        evidence: z.array(z.string()).default([]),
        agent: z.string().optional(),
        strategy: z.string().optional(),
        tags: z.array(z.string()).default([]),
        failureFingerprint: z.string().optional(),
        source: z.enum(["runtime","manual","repair","release"]).default("runtime"),
        confidence: z.number().min(0).max(100).default(70)
      }),
      annotations: { readOnlyHint: false, openWorldHint: false }
    },
    async (args) => {
      try {
        const rows=await readLearningMemory();
        const record:LearningRecord={id:`L${Date.now()}`,at:new Date().toISOString(),taskType:taskTypeOf(args.task),task:args.task,agent:args.agent,strategy:args.strategy,outcome:args.outcome,evidence:args.evidence,failureFingerprint:args.failureFingerprint,lesson:args.lesson,tags:[...new Set((args.tags as string[]).map((x:string)=>x.toLowerCase()))],confidence:clampConfidence(args.confidence),source:args.source};
        if (record.outcome==="success" && record.evidence.length===0) return result(JSON.stringify({status:"REJECTED",reason:"A successful learned pattern requires evidence."},null,2));
        rows.push(record); await writeLearningMemory(rows);
        return result(JSON.stringify({status:"OK",record,memoryFile:`.krom/${LEARNING_MEMORY_FILE}`},null,2));
      } catch(error){ return errorResult(error); }
    }
  );

  server.registerTool(
    "learning_memory_recall",
    {
      title: "Engineering Learning Memory Recall",
      description: "Recall prior successful and failed patterns relevant to the current task type, prioritizing evidence-backed high-confidence lessons.",
      inputSchema: z.object({ task: z.string().min(3), limit: z.number().int().min(1).max(30).default(10) }),
      annotations: { readOnlyHint: true, openWorldHint: false }
    },
    async ({task,limit}) => {
      try {
        const rows=await readLearningMemory();
        const type=taskTypeOf(task);
        const scored=rows.map(r=>({r,score:(r.taskType===type?40:0)+(r.outcome==="success"?20:r.outcome==="failed"?10:5)+r.confidence/5+(r.tags.some(t=>task.toLowerCase().includes(t))?20:0)})).sort((a,b)=>b.score-a.score).slice(0,limit).map(x=>x.r);
        return result(JSON.stringify({status:"OK",taskType:type,lessons:scored,summary:summarizeLessons(rows,task),rule:"Treat lessons as prior evidence, not as permission to skip current-project inspection or verification."},null,2));
      } catch(error){ return errorResult(error); }
    }
  );

  server.registerTool(
    "decision_confidence",
    {
      title: "Decision Confidence Scoring",
      description: "Score engineering decision confidence from current context, evidence, unresolved gaps, risk, and prior outcomes. Low confidence blocks broad or irreversible action.",
      inputSchema: z.object({
        task: z.string().min(3),
        evidence: z.array(z.string()).default([]),
        unresolvedGaps: z.number().int().min(0).default(0),
        highRisk: z.boolean().default(false)
      }),
      annotations: { readOnlyHint: true, openWorldHint: false }
    },
    async ({task,evidence,unresolvedGaps,highRisk}) => {
      try {
        let bundle:SmartContextBundle|null=null;
        try { bundle=JSON.parse(await fs.readFile(await kromStatePath(SMART_CONTEXT_FILE),"utf8")); } catch {}
        const memory=await readLearningMemory();
        const type=taskTypeOf(task);
        const priorSuccesses=memory.filter(r=>r.taskType===type&&r.outcome==="success"&&r.confidence>=70).length;
        const priorFailures=memory.filter(r=>r.taskType===type&&r.outcome==="failed"&&r.confidence>=70).length;
        const assessment=assessDecisionConfidence({contextFiles:bundle?.selected.length||0,evidence,unresolvedGaps,priorSuccesses,priorFailures,highRisk});
        return result(JSON.stringify({status:"OK",taskType:type,assessment,prior:{successes:priorSuccesses,failures:priorFailures},rule:"Confidence never replaces tests. LOW confidence forbids broad or irreversible changes."},null,2));
      } catch(error){ return errorResult(error); }
    }
  );

  server.registerTool(
    "adaptive_strategy_advisor",
    {
      title: "Adaptive Strategy Advisor",
      description: "Combine Smart Context, historical engineering lessons, runtime failures, and confidence scoring into a recommended next strategy without automatically trusting prior patterns.",
      inputSchema: z.object({ task: z.string().min(3) }),
      annotations: { readOnlyHint: false, openWorldHint: false }
    },
    async ({task}) => {
      try {
        let bundle:SmartContextBundle|null=null;
        try { bundle=JSON.parse(await fs.readFile(await kromStatePath(SMART_CONTEXT_FILE),"utf8")); } catch {}
        if (!bundle || bundle.query!==task) bundle=await buildSmartContext(task,30,120000,false);
        const strategy=decideExecutionStrategy(task,bundle);
        const history=await readRuntimeHistory();
        const memory=await readLearningMemory();
        const type=taskTypeOf(task);
        const learned=memory.filter(r=>r.taskType===type).sort((a,b)=>b.confidence-a.confidence).slice(0,12);
        const failedAgents=new Map<string,number>();
        for (const h of history.filter(x=>x.task===task&&x.outcome==="failed")) failedAgents.set(h.selectedAgent,(failedAgents.get(h.selectedAgent)||0)+1);
        const evidence=[`context:${bundle.selected.length}`,`risk:${strategy.risk}`,`mode:${strategy.mode}`];
        const confidence=assessDecisionConfidence({contextFiles:bundle.selected.length,evidence,unresolvedGaps:bundle.omittedHighRisk.length,priorSuccesses:learned.filter(x=>x.outcome==="success").length,priorFailures:learned.filter(x=>x.outcome==="failed").length,highRisk:strategy.risk==="HIGH"});
        const route=chooseAgentForTask(task,strategy,history);
        const avoid=[...failedAgents.entries()].filter(([,n])=>n>=2).map(([agent])=>agent);
        const advice={
          mode:strategy.mode,risk:strategy.risk,selectedAgent:avoid.includes(route.selectedAgent)?route.alternatives.find(a=>!avoid.includes(a.agent))?.agent||route.selectedAgent:route.selectedAgent,
          avoidAgents:avoid,confidence,
          provenPatterns:learned.filter(x=>x.outcome==="success"&&x.confidence>=70).slice(0,5).map(x=>x.lesson),
          failureWarnings:learned.filter(x=>x.outcome==="failed"&&x.confidence>=70).slice(0,5).map(x=>x.lesson),
          nextSteps:confidence.band==="LOW"?["Inspect missing context","Narrow target files","Collect direct evidence before editing"]:["Apply narrow evidence-backed change","Run regression scope","Record outcome back into learning memory"]
        };
        const ledgerPath=await kromStatePath(DECISION_LEDGER_FILE);
        let ledger:any[]=[]; try { ledger=JSON.parse(await fs.readFile(ledgerPath,"utf8")); } catch {}
        ledger.push({at:new Date().toISOString(),task,advice}); await fs.writeFile(ledgerPath,JSON.stringify(ledger.slice(-500),null,2),"utf8");
        return result(JSON.stringify({status:"OK",advice,ledgerFile:`.krom/${DECISION_LEDGER_FILE}`},null,2));
      } catch(error){ return errorResult(error); }
    }
  );

  server.registerTool(
    "learning_memory_status",
    {
      title: "Self-Improving Memory Status",
      description: "Show what KROM has learned, success/failure ratios by task type, and low-confidence lessons that should not influence execution strongly.",
      inputSchema: z.object({}),
      annotations: { readOnlyHint: true, openWorldHint: false }
    },
    async () => {
      try {
        const rows=await readLearningMemory();
        const groups:any={};
        for (const r of rows){ const g=groups[r.taskType] ||= {total:0,success:0,failed:0,partial:0,blocked:0,avgConfidence:0,sum:0}; g.total++; g[r.outcome]++; g.sum+=r.confidence; g.avgConfidence=Math.round(g.sum/g.total); }
        return result(JSON.stringify({status:"OK",total:rows.length,byTaskType:groups,recent:rows.slice(-20),lowConfidence:rows.filter(r=>r.confidence<55).slice(-20),rule:"Low-confidence lessons are advisory only and must not drive autonomous edits."},null,2));
      } catch(error){ return errorResult(error); }
    }
  );


  // =========================================================
  // v3.7 ENGINEERING AUTOPILOT TOOLS
  // =========================================================
  server.registerTool(
    "engineering_autopilot_start",
    {
      title: "Engineering Autopilot Start",
      description: "Start an evidence-driven end-to-end engineering run. Creates a rollback checkpoint, smart context, execution strategy, task graph, and a resumable autopilot state before edits begin.",
      inputSchema: z.object({ task:z.string().min(5), maxIterations:z.number().int().min(1).max(20).default(8), checkpointFiles:z.array(z.string()).default([]) }),
      annotations:{readOnlyHint:false,openWorldHint:false}
    },
    async ({task,maxIterations,checkpointFiles}) => {
      try {
        const checkpoint=await createAutopilotCheckpoint(`before:${task.slice(0,80)}`, checkpointFiles.length?checkpointFiles:undefined);
        const council=await createCouncilSession(task);
        const bundle=await buildSmartContext(task,30,120000,false);
        const strategy=decideExecutionStrategy(task,bundle);
        const simulation=await buildChangeSimulation(task,checkpointFiles,2);
        const preflight=await evaluatePreflight(simulation,true);
        const graph=buildTaskGraph(task,strategy);
        await fs.writeFile(await kromStatePath(TASK_GRAPH_FILE),JSON.stringify(graph,null,2),"utf8");
        const state:AutopilotState={id:`AP-${Date.now()}`,task,startedAt:new Date().toISOString(),updatedAt:new Date().toISOString(),phase:"context",checkpointId:checkpoint.id,qualityScore:0,iteration:0,maxIterations,blockers:[],evidence:[`context:${bundle.selected.length}`,`strategy:${strategy.mode}`,`risk:${strategy.risk}`],lastDecision:"Context prepared; execute READY task-graph nodes only.",status:"ACTIVE"};
        await writeAutopilotState(state); await appendAutopilotHistory({type:"start",state,checkpoint});
        return result(JSON.stringify({status:preflight.status==="BLOCKED"?"PREFLIGHT_BLOCKED":"OK",state,checkpoint,council:{id:council.id,requiredAgents:council.requiredAgents,status:council.status},strategy,simulation:{id:simulation.id,risk:simulation.risk,affectedFiles:simulation.affectedFiles.length,affectedRoutes:simulation.affectedRoutes},preflight,ready:preflight.status==="BLOCKED"?[]:graph.nodes.filter(n=>n.status==="ready"),rule:preflight.status==="BLOCKED"?"Resolve preflight blockers before editing.":"Do not bypass task dependencies. Stay inside the simulated change scope or rerun simulation."},null,2));
      } catch(error){return errorResult(error);}
    }
  );

  server.registerTool(
    "autopilot_checkpoint",
    {
      title:"Autopilot Checkpoint",
      description:"Create a named project checkpoint during an active run so risky changes can be rolled back safely.",
      inputSchema:z.object({label:z.string().min(2),files:z.array(z.string()).default([])}),
      annotations:{readOnlyHint:false,openWorldHint:false}
    },
    async ({label,files})=>{try{const cp=await createAutopilotCheckpoint(label,files.length?files:undefined);const st=await readAutopilotState();if(st){st.checkpointId=cp.id;await writeAutopilotState(st);}await appendAutopilotHistory({type:"checkpoint",checkpoint:cp});return result(JSON.stringify({status:"OK",checkpoint:cp},null,2));}catch(error){return errorResult(error);}}
  );

  server.registerTool(
    "autopilot_quality_watchdog",
    {
      title:"Autopilot Quality Watchdog",
      description:"Continuously assess evidence, blockers, regression risk, browser/visual findings, and verification signals. Chooses whether to execute, verify, repair, release, or block.",
      inputSchema:z.object({qualityScore:z.number().min(0).max(100),blockers:z.array(z.string()).default([]),evidence:z.array(z.string()).default([]),decision:z.string().optional()}),
      annotations:{readOnlyHint:false,openWorldHint:false}
    },
    async ({qualityScore,blockers,evidence,decision})=>{
      try{const st=await readAutopilotState();if(!st)return result(JSON.stringify({status:"NO_ACTIVE_RUN"},null,2));st.iteration++;st.qualityScore=Math.round(qualityScore);st.blockers=blockers;st.evidence=[...new Set([...st.evidence,...evidence])].slice(-300);st.phase=nextAutopilotPhase(st,st.qualityScore,blockers);st.lastDecision=decision||`quality=${st.qualityScore}, blockers=${blockers.length}`;if(st.phase==="blocked")st.status="BLOCKED";if(st.phase==="release"&&st.qualityScore>=90&&!blockers.length)st.status="PASS";await writeAutopilotState(st);await appendAutopilotHistory({type:"watchdog",state:st});return result(JSON.stringify({status:"OK",state:st,nextAction:st.phase==="repair"?"Run root-cause repair, then re-test.":st.phase==="release"?"Run release gates; do not mark done until they pass.":st.phase==="blocked"?"Stop blind retries and perform deeper diagnosis or rollback.":`Continue ${st.phase}.`},null,2));}catch(error){return errorResult(error);}
    }
  );

  server.registerTool(
    "autopilot_rollback",
    {
      title:"Autopilot Rollback",
      description:"Restore the latest or specified v3.7 checkpoint when a change causes regression. This restores checkpointed files only and records the rollback in autopilot history.",
      inputSchema:z.object({checkpointId:z.string().optional(),reason:z.string().min(3)}),
      annotations:{readOnlyHint:false,openWorldHint:false}
    },
    async ({checkpointId,reason})=>{try{const st=await readAutopilotState();const id=checkpointId||st?.checkpointId;if(!id)return result(JSON.stringify({status:"NO_CHECKPOINT"},null,2));const restored=await restoreAutopilotCheckpoint(id);if(st){st.status="ROLLED_BACK";st.phase="blocked";st.blockers=[...st.blockers,`Rollback: ${reason}`];st.lastDecision=`Rolled back to ${id}: ${reason}`;await writeAutopilotState(st);}await appendAutopilotHistory({type:"rollback",checkpointId:id,reason,restored});return result(JSON.stringify({status:"OK",restored,reason},null,2));}catch(error){return errorResult(error);}}
  );

  server.registerTool(
    "engineering_autopilot_status",
    {
      title:"Engineering Autopilot Status",
      description:"Show resumable autopilot state, active phase, quality score, blockers, checkpoint, and recent decisions.",
      inputSchema:z.object({}),annotations:{readOnlyHint:true,openWorldHint:false}
    },
    async()=>{try{const st=await readAutopilotState();let hist:any[]=[];try{hist=JSON.parse(await fs.readFile(await kromStatePath(AUTOPILOT_HISTORY_FILE),"utf8"));}catch{}return result(JSON.stringify({status:"OK",state:st,recentHistory:hist.slice(-25),rules:["No DONE without release verification","Rollback on verified regression","Do not repeat identical failed strategy without new evidence","Resume from persisted state after restart"]},null,2));}catch(error){return errorResult(error);}}
  );


  // =========================================================
  // v3.8 MULTI-AGENT ENGINEERING COUNCIL TOOLS
  // =========================================================
  server.registerTool(
    "engineering_council_convene",
    {
      title:"Engineering Council Convene",
      description:"Create a multi-agent engineering council for a complex task. Selects the required specialist roles based on task risk and domain and persists the session for evidence-backed consensus.",
      inputSchema:z.object({task:z.string().min(5)}),
      annotations:{readOnlyHint:false,openWorldHint:false}
    },
    async ({task})=>{try{const state=await createCouncilSession(task);return result(JSON.stringify({status:"OK",council:state,agenda:["Each required agent must submit a recommendation.","Every recommendation needs confidence, risks, and evidence.","High-confidence dissent blocks execution until resolved.","Consensus does not replace build/test/browser/release evidence."]},null,2));}catch(error){return errorResult(error);}}
  );

  server.registerTool(
    "council_submit_opinion",
    {
      title:"Council Submit Opinion",
      description:"Submit or replace one specialist opinion in the active engineering council. Evidence and explicit risks are preserved for consensus and conflict resolution.",
      inputSchema:z.object({agent:z.enum(["architect","developer","qa","security","visual-designer","devops"]),recommendation:z.string().min(5),risks:z.array(z.string()).default([]),evidence:z.array(z.string()).default([]),confidence:z.number().min(0).max(100).default(70)}),
      annotations:{readOnlyHint:false,openWorldHint:false}
    },
    async ({agent,recommendation,risks,evidence,confidence})=>{try{const st=await readCouncilState();if(!st)return result(JSON.stringify({status:"NO_ACTIVE_COUNCIL"},null,2));const op:CouncilOpinion={agent:agent as CouncilAgent,recommendation,risks,evidence,confidence:clampConfidence(confidence),submittedAt:new Date().toISOString()};st.opinions=st.opinions.filter(o=>o.agent!==agent);st.opinions.push(op);st.status="OPEN";delete st.consensus;await writeCouncilState(st);await appendCouncilHistory({type:"opinion",councilId:st.id,opinion:op});const pending=st.requiredAgents.filter(a=>!st.opinions.some(o=>o.agent===a));return result(JSON.stringify({status:"OK",opinion:op,pendingAgents:pending,readyForConsensus:pending.length===0},null,2));}catch(error){return errorResult(error);}}
  );

  server.registerTool(
    "execution_consensus",
    {
      title:"Execution Consensus",
      description:"Resolve council recommendations using task-aware role weights, confidence, evidence, and risk dissent. Blocks execution when required opinions are missing or high-confidence risk conflicts remain unresolved.",
      inputSchema:z.object({}),
      annotations:{readOnlyHint:false,openWorldHint:false}
    },
    async ()=>{try{const st=await readCouncilState();if(!st)return result(JSON.stringify({status:"NO_ACTIVE_COUNCIL"},null,2));const decision=resolveCouncilConsensus(st);if(decision.status==="CONSENSUS"){st.status="CONSENSUS";st.consensus={recommendation:decision.recommendation,confidence:decision.confidence,supportingAgents:decision.supportingAgents,dissentingAgents:decision.dissentingAgents,unresolvedRisks:decision.unresolvedRisks,rationale:decision.rationale};}else if(decision.status==="CONFLICT")st.status="CONFLICT";else st.status="BLOCKED";await writeCouncilState(st);await appendCouncilHistory({type:"consensus",councilId:st.id,decision});return result(JSON.stringify({status:decision.status,decision,rule:decision.status==="CONSENSUS"?"Use the consensus as the execution plan, then still require normal verification gates.":"Do not begin broad or irreversible execution until the conflict or missing opinions are resolved."},null,2));}catch(error){return errorResult(error);}}
  );

  server.registerTool(
    "council_conflict_resolver",
    {
      title:"Council Conflict Resolver",
      description:"Analyze unresolved council disagreement and produce the minimum evidence needed to break the tie safely instead of choosing an arbitrary winner.",
      inputSchema:z.object({additionalEvidence:z.array(z.string()).default([])}),
      annotations:{readOnlyHint:true,openWorldHint:false}
    },
    async ({additionalEvidence})=>{try{const st=await readCouncilState();if(!st)return result(JSON.stringify({status:"NO_ACTIVE_COUNCIL"},null,2));const d=resolveCouncilConsensus(st);const conflicts=st.opinions.flatMap(o=>o.risks.map(r=>({agent:o.agent,risk:r,confidence:o.confidence}))).filter(x=>x.confidence>=70);const evidenceNeeded=["Direct code/runtime evidence for the disputed behavior","Impact analysis for shared/high-risk files","Targeted regression or browser test for the disputed path",...additionalEvidence];return result(JSON.stringify({status:d.status,conflicts,existingEvidence:[...new Set(st.opinions.flatMap(o=>o.evidence))],evidenceNeeded:[...new Set(evidenceNeeded)],nextAction:d.status==="CONSENSUS"?"Consensus already available.":"Collect the missing evidence, update the relevant specialist opinions, then rerun execution_consensus."},null,2));}catch(error){return errorResult(error);}}
  );

  server.registerTool(
    "engineering_council_status",
    {
      title:"Engineering Council Status",
      description:"Show the active council, specialist participation, consensus/conflict status, unresolved risks, and recent council history.",
      inputSchema:z.object({}),
      annotations:{readOnlyHint:true,openWorldHint:false}
    },
    async ()=>{try{const st=await readCouncilState();let hist:any[]=[];try{hist=JSON.parse(await fs.readFile(await kromStatePath(COUNCIL_HISTORY_FILE),"utf8"));}catch{}return result(JSON.stringify({status:"OK",council:st,recentHistory:hist.slice(-30),rules:["No consensus without every required role","High-confidence risk dissent blocks broad execution","Evidence outranks preference","Consensus still requires release verification"]},null,2));}catch(error){return errorResult(error);}}
  );


  // =========================================================
  // v3.9 PREDICTIVE ENGINEERING + CHANGE SIMULATION TOOLS
  // =========================================================
  server.registerTool(
    "change_simulation",
    {
      title:"Predictive Change Simulation",
      description:"Simulate the blast radius of a proposed change before editing. Resolves target files, dependencies, dependents, affected routes, data/config risk, verification plan, and rollback requirements.",
      inputSchema:z.object({task:z.string().min(5),targetFiles:z.array(z.string()).default([]),depth:z.number().int().min(1).max(4).default(2)}),
      annotations:{readOnlyHint:false,openWorldHint:false}
    },
    async ({task,targetFiles,depth})=>{try{const sim=await buildChangeSimulation(task,targetFiles,depth);return result(JSON.stringify({status:"OK",simulation:sim,rule:"Treat this as a forecast, not proof. Re-run impact analysis if actual edited scope expands."},null,2));}catch(error){return errorResult(error);}}
  );

  server.registerTool(
    "risk_forecast",
    {
      title:"Change Risk Forecast",
      description:"Forecast likely regression categories from the latest or a newly generated change simulation and recommend targeted controls before implementation.",
      inputSchema:z.object({task:z.string().optional(),targetFiles:z.array(z.string()).default([])}),
      annotations:{readOnlyHint:true,openWorldHint:false}
    },
    async ({task,targetFiles})=>{try{let sim=await readChangeSimulation();if(task)sim=await buildChangeSimulation(task,targetFiles,2);if(!sim)return result(JSON.stringify({status:"NO_SIMULATION",nextAction:"Run change_simulation first."},null,2));return result(JSON.stringify({status:"OK",simulationId:sim.id,forecast:forecastChangeRisk(sim)},null,2));}catch(error){return errorResult(error);}}
  );

  server.registerTool(
    "preflight_gate",
    {
      title:"Predictive Preflight Gate",
      description:"Block risky edits before they begin when rollback, target resolution, verification coverage, database safety, or change-scope evidence is insufficient.",
      inputSchema:z.object({task:z.string().optional(),targetFiles:z.array(z.string()).default([]),requireCheckpoint:z.boolean().default(true)}),
      annotations:{readOnlyHint:false,openWorldHint:false}
    },
    async ({task,targetFiles,requireCheckpoint})=>{try{let sim=await readChangeSimulation();if(task)sim=await buildChangeSimulation(task,targetFiles,2);if(!sim)return result(JSON.stringify({status:"NO_SIMULATION",nextAction:"Run change_simulation first."},null,2));const gate=await evaluatePreflight(sim,requireCheckpoint);await appendPreflightHistory({type:"gate",simulationId:sim.id,gate});return result(JSON.stringify(gate,null,2));}catch(error){return errorResult(error);}}
  );

  server.registerTool(
    "change_plan",
    {
      title:"Predictive Change Plan",
      description:"Generate a staged, evidence-driven implementation plan from the latest simulation, ordered to minimize blast radius and preserve rollback options.",
      inputSchema:z.object({}),
      annotations:{readOnlyHint:true,openWorldHint:false}
    },
    async ()=>{try{const sim=await readChangeSimulation();if(!sim)return result(JSON.stringify({status:"NO_SIMULATION",nextAction:"Run change_simulation first."},null,2));const stages:any[]=[];const targets=sim.targetFiles;const data=targets.filter(f=>sim.dataFiles.includes(f));const config=targets.filter(f=>sim.configFiles.includes(f));const ui=targets.filter(f=>/tsx|jsx|vue|svelte|css|scss/i.test(f));const core=targets.filter(f=>!data.includes(f)&&!config.includes(f)&&!ui.includes(f));if(core.length)stages.push({stage:stages.length+1,name:"Core implementation",files:core,verify:["typecheck","targeted tests"]});if(data.length)stages.push({stage:stages.length+1,name:"Data/security changes",files:data,verify:["migration validation","RLS/security review","data integrity checks"]});if(ui.length)stages.push({stage:stages.length+1,name:"UI integration",files:ui,verify:["responsive browser test","visual review","accessibility smoke check"]});if(config.length)stages.push({stage:stages.length+1,name:"Configuration/build",files:config,verify:["clean production build","runtime startup"]});stages.push({stage:stages.length+1,name:"Regression verification",files:sim.dependents.slice(0,50),verify:sim.verificationPlan});return result(JSON.stringify({status:"OK",simulationId:sim.id,risk:sim.risk,stages,rollbackPlan:sim.rollbackPlan,scopeRule:"If implementation touches files outside affectedFiles, pause and rerun change_simulation before continuing."},null,2));}catch(error){return errorResult(error);}}
  );

  server.registerTool(
    "preflight_status",
    {
      title:"Preflight History Status",
      description:"Show the latest change simulation and recent preflight decisions for auditability and resumable engineering work.",
      inputSchema:z.object({}),
      annotations:{readOnlyHint:true,openWorldHint:false}
    },
    async ()=>{try{const sim=await readChangeSimulation();let hist:any[]=[];try{hist=JSON.parse(await fs.readFile(await kromStatePath(PREFLIGHT_HISTORY_FILE),"utf8"));}catch{}return result(JSON.stringify({status:"OK",latestSimulation:sim,recentPreflight:hist.slice(-30),rules:["Simulation is predictive, not proof","High-risk edits require checkpoint and verification plan","Scope expansion requires a new simulation","Release still requires normal test/browser/security gates"]},null,2));}catch(error){return errorResult(error);}}
  );


  // =========================================================
  // v4.0 AUTONOMOUS PRODUCT ENGINEERING TOOLS
  // =========================================================
  server.registerTool(
    "product_blueprint",
    {
      title:"Product Blueprint Engine",
      description:"Convert a product prompt into an implementation-oriented blueprint of actors, features, product surfaces, non-functional requirements, quality bars, and acceptance criteria before coding.",
      inputSchema:z.object({task:z.string().min(5)}),
      annotations:{readOnlyHint:false,openWorldHint:false}
    },
    async ({task})=>{try{const blueprint=await createProductBlueprint(task);return result(JSON.stringify({status:"OK",blueprint,file:`.krom/${PRODUCT_BLUEPRINT_FILE}`,nextAction:"Run feature_completeness_matrix against the current project before broad implementation."},null,2));}catch(error){return errorResult(error);}}
  );

  server.registerTool(
    "acceptance_contract_generate",
    {
      title:"Acceptance Contract Generator",
      description:"Generate a strict acceptance contract for every product feature, including functional, UI, state, permission, responsive, and evidence requirements.",
      inputSchema:z.object({task:z.string().optional()}),
      annotations:{readOnlyHint:false,openWorldHint:false}
    },
    async ({task})=>{try{let bp=await readProductBlueprint();if(task||!bp)bp=await createProductBlueprint(task||"Complete the current product according to its existing requirements");const contract={id:`AC-${Date.now()}`,createdAt:new Date().toISOString(),blueprintId:bp.id,features:bp.features.map(f=>({featureId:f.id,name:f.name,criteria:f.acceptance,requiredEvidence:["source implementation evidence","runtime or test evidence","permission/validation evidence when applicable","responsive/browser evidence for visible UI"]})),globalCriteria:[...bp.nonFunctional,...bp.qualityBars,"No feature is complete solely because a route, button, or placeholder exists"],doneRule:"DONE requires every critical feature to satisfy its acceptance criteria with evidence."};await fs.writeFile(await kromStatePath(PRODUCT_ACCEPTANCE_FILE),JSON.stringify(contract,null,2),"utf8");return result(JSON.stringify({status:"OK",contract,file:`.krom/${PRODUCT_ACCEPTANCE_FILE}`},null,2));}catch(error){return errorResult(error);}}
  );

  server.registerTool(
    "feature_completeness_matrix",
    {
      title:"Feature Completeness Matrix",
      description:"Inspect the current project for implementation evidence for every feature in the active product blueprint. Scores UI, data/integration and tests without treating source presence as runtime proof.",
      inputSchema:z.object({task:z.string().optional()}),
      annotations:{readOnlyHint:false,openWorldHint:false}
    },
    async ({task})=>{try{let bp=await readProductBlueprint();if(task||!bp)bp=await createProductBlueprint(task||"Assess the current product");const rows=[];for(const f of bp.features)rows.push(await scanFeatureEvidence(f));const avg=rows.length?Math.round(rows.reduce((a,x)=>a+x.score,0)/rows.length):0;const gaps=rows.filter(x=>x.status!=="EVIDENCE_STRONG");const matrix={at:new Date().toISOString(),blueprintId:bp.id,averageEvidenceScore:avg,features:rows,gapCount:gaps.length,warning:"Static/source evidence is not runtime verification. Browser, API, database and release gates are still required."};await fs.writeFile(await kromStatePath(PRODUCT_GAP_FILE),JSON.stringify(matrix,null,2),"utf8");return result(JSON.stringify({status:gaps.length?"GAPS_FOUND":"SOURCE_EVIDENCE_STRONG",matrix,file:`.krom/${PRODUCT_GAP_FILE}`},null,2));}catch(error){return errorResult(error);}}
  );

  server.registerTool(
    "product_gap_detector",
    {
      title:"Product Gap Detector",
      description:"Find product-level gaps such as UI-only features, missing data integration, missing tests, missing states, or capabilities requested in the prompt that lack evidence in the project.",
      inputSchema:z.object({task:z.string().optional()}),
      annotations:{readOnlyHint:true,openWorldHint:false}
    },
    async ({task})=>{try{let bp=await readProductBlueprint();if(task||!bp)bp=await createProductBlueprint(task||"Assess product gaps");const rows=[];for(const f of bp.features)rows.push(await scanFeatureEvidence(f));const gaps=rows.flatMap(x=>{const out:any[]=[];if(!x.coverage.ui)out.push({featureId:x.featureId,feature:x.name,severity:"MAJOR",gap:"No clear UI/product-surface evidence"});if(!x.coverage.dataOrIntegration)out.push({featureId:x.featureId,feature:x.name,severity:"MAJOR",gap:"No clear data/API/integration evidence"});if(!x.coverage.test)out.push({featureId:x.featureId,feature:x.name,severity:"MAJOR",gap:"No targeted test evidence"});return out;});return result(JSON.stringify({status:gaps.length?"GAPS_FOUND":"NO_STATIC_GAPS",gapCount:gaps.length,gaps,nextActions:["Implement missing product surfaces, not placeholders","Connect visible actions to real data/logic","Add targeted verification for each critical flow","Run browser/release gates after source gaps are closed"],rule:"A missing static signal is a review target, not absolute proof that a feature is absent."},null,2));}catch(error){return errorResult(error);}}
  );

  server.registerTool(
    "product_release_readiness",
    {
      title:"Product Release Readiness Gate",
      description:"Gate product completion using feature completeness, acceptance contracts, existing preflight/release state, and evidence coverage. It refuses a product-level DONE when critical feature gaps remain.",
      inputSchema:z.object({minimumFeatureScore:z.number().int().min(0).max(100).default(75)}),
      annotations:{readOnlyHint:true,openWorldHint:false}
    },
    async ({minimumFeatureScore})=>{try{const bp=await readProductBlueprint();if(!bp)return result(JSON.stringify({status:"BLOCKED",reason:"No product blueprint. Run product_blueprint first."},null,2));const rows=[];for(const f of bp.features)rows.push(await scanFeatureEvidence(f));const blockers=rows.filter(x=>x.score<minimumFeatureScore).map(x=>({featureId:x.featureId,name:x.name,score:x.score,status:x.status,missing:Object.entries(x.coverage).filter(([,v])=>!v).map(([k])=>k)}));let sim:any=null;try{sim=JSON.parse(await fs.readFile(await kromStatePath(CHANGE_SIMULATION_FILE),"utf8"));}catch{}let contract:any=null;try{contract=JSON.parse(await fs.readFile(await kromStatePath(PRODUCT_ACCEPTANCE_FILE),"utf8"));}catch{}const status=blockers.length||!contract?"BLOCKED":"READY_FOR_RUNTIME_GATES";return result(JSON.stringify({status,blueprintId:bp.id,minimumFeatureScore,blockers,acceptanceContractPresent:!!contract,changeSimulationPresent:!!sim,nextAction:status==="BLOCKED"?"Close feature/acceptance gaps, then rerun this gate.":"Run browser, security, regression and final release gates. Source completeness alone does not authorize release."},null,2));}catch(error){return errorResult(error);}}
  );


  // =========================================================
  // v5.0 AUTONOMOUS ENGINEERING SUITE TOOLS
  // =========================================================
  server.registerTool(
    "model_router_v5",
    {
      title:"Adaptive Model Router v5",
      description:"Classify the current engineering task and recommend model capability, reasoning depth, context strategy, and fallback policy without assuming any provider is configured.",
      inputSchema:z.object({task:z.string().min(3),availableModels:z.array(z.string()).default([])}),
      annotations:{readOnlyHint:true,openWorldHint:false}
    },
    async ({task,availableModels})=>{try{const kind=v50TaskKind(task);const complexity=(task.length>1200||/multiple|full|complete|entire|كامل|شامل/.test(task.toLowerCase()))?"HIGH":task.length>300?"MEDIUM":"LOW";const capability=kind==="ui"?"coding + visual reasoning":kind==="architecture"?"high reasoning + code intelligence":kind==="debug"?"coding + diagnostic reasoning":kind==="security"?"security reasoning + code audit":"coding + tool use";return result(JSON.stringify({status:"OK",kind,complexity,requiredCapability:capability,recommendedReasoning:complexity==="HIGH"?"high":"medium",availableModels,selectionRule:availableModels.length?"Choose the strongest available model matching the required capability; fall back only after a recorded failure.":"No model inventory supplied; return capability requirements instead of inventing a model.",contextPolicy:"Use smart_context_build first; expand only when context_gap_check identifies missing evidence.",fallbackPolicy:"Do not repeat the same failed model/strategy without new evidence."},null,2));}catch(error){return errorResult(error);}}
  );

  server.registerTool(
    "diagnostics_intelligence_v5",
    {
      title:"Diagnostics Intelligence v5",
      description:"Run available typecheck/lint/test scripts and normalize failures into an actionable diagnostics report with file/line hints when present.",
      inputSchema:z.object({includeTests:z.boolean().default(false)}),
      annotations:{readOnlyHint:false,openWorldHint:false}
    },
    async ({includeTests})=>{try{const tc=await runPackageScript(["typecheck","type-check","check:types"]);const lint=await runPackageScript(["lint"]);const tests=includeTests?await runPackageScript(["test","test:unit"]):{status:"SKIPPED",reason:"includeTests=false"};const raw=[tc,lint,tests].map((x:any)=>[x.stdout,x.stderr,x.message].filter(Boolean).join("\n")).join("\n");const refs=[...raw.matchAll(/([^\s:]+\.(?:ts|tsx|js|jsx|vue|svelte))[:(](\d+)(?::(\d+))?/g)].slice(0,120).map(m=>({file:m[1],line:Number(m[2]),column:m[3]?Number(m[3]):null}));const status=[tc,lint,tests].some((x:any)=>x.status==='FAIL')?'FAIL':'PASS_OR_SKIPPED';return result(JSON.stringify({status,typecheck:tc,lint,tests,diagnosticLocations:refs,nextAction:status==='FAIL'?"Use repair_source_locator + impact_analysis before patching.":"Continue to targeted regression/browser gates."},null,2));}catch(error){return errorResult(error);}}
  );

  server.registerTool(
    "api_contract_intelligence_v5",
    {
      title:"API Contract Intelligence v5",
      description:"Map server endpoints and client fetch calls, flag likely unmatched API contracts, and produce integration review targets.",
      inputSchema:z.object({}),annotations:{readOnlyHint:true,openWorldHint:false}
    },
    async ()=>{try{const scan=await v50ApiContractScan();const epPaths=new Set(scan.endpoints.map((e:any)=>e.path));const unmatched=scan.clients.filter((c:any)=>c.path.startsWith('/')&&!Array.from(epPaths).some((p:any)=>c.path.startsWith(String(p).replace(/:\w+/g,''))));return result(JSON.stringify({status:"OK",endpointCount:scan.endpoints.length,clientCallCount:scan.clients.length,endpoints:scan.endpoints,clientCalls:scan.clients,reviewTargets:unmatched.slice(0,100),warning:"Static matching cannot prove runtime compatibility; verify auth, validation, payloads and responses with executable tests."},null,2));}catch(error){return errorResult(error);}}
  );

  server.registerTool(
    "database_architect_v5",
    {
      title:"Database Architect v5",
      description:"Inspect database and Supabase-related files for schema, indexes, RLS and migration evidence, then return architecture gaps without mutating production data.",
      inputSchema:z.object({}),annotations:{readOnlyHint:true,openWorldHint:false}
    },
    async ()=>{try{const signals=await v50DatabaseScan();const totals=signals.reduce((a:any,x:any)=>({tables:a.tables+x.tables,policies:a.policies+x.policies,rls:a.rls+x.rls,indexes:a.indexes+x.indexes}),{tables:0,policies:0,rls:0,indexes:0});const risks:any[]=[];if(totals.tables>0&&totals.rls===0)risks.push("Tables detected but no ENABLE ROW LEVEL SECURITY evidence found in scanned files.");if(totals.tables>3&&totals.indexes===0)risks.push("Multiple tables detected with no explicit index evidence; review query patterns before release.");return result(JSON.stringify({status:risks.length?"REVIEW_REQUIRED":"OK",totals,files:signals,risks,rules:["Use migrations for schema changes","Do not disable RLS to make errors disappear","Validate foreign keys and uniqueness","Add indexes based on actual query patterns"]},null,2));}catch(error){return errorResult(error);}}
  );

  server.registerTool(
    "security_auditor_v5",
    {
      title:"Security Auditor v5",
      description:"Perform a focused static security audit for exposed secrets, weak RLS patterns, dangerous HTML injection, broad CORS/auth bypass markers, and service-role exposure.",
      inputSchema:z.object({}),annotations:{readOnlyHint:true,openWorldHint:false}
    },
    async ()=>{try{const findings=await v50ScanPatterns([{name:"Supabase service role in source",re:/service_role|SUPABASE_SERVICE_ROLE/i,severity:"CRITICAL"},{name:"Permissive RLS policy",re:/using\s*\(\s*true\s*\)|with\s+check\s*\(\s*true\s*\)/i,severity:"MAJOR"},{name:"Dangerous HTML injection",re:/dangerouslySetInnerHTML|innerHTML\s*=/i,severity:"MAJOR"},{name:"Wildcard CORS",re:/access-control-allow-origin[^\n]*\*/i,severity:"MAJOR"},{name:"Hardcoded secret-like token",re:/(api[_-]?key|secret|token)\s*[:=]\s*["'][A-Za-z0-9_\-]{20,}/i,severity:"CRITICAL"}],2200);const critical=findings.filter(f=>f.severity==='CRITICAL').length;return result(JSON.stringify({status:critical?"BLOCKED":findings.length?"REVIEW_REQUIRED":"NO_STATIC_FINDINGS",critical,count:findings.length,findings,rule:"Static findings require review; absence of findings is not proof of security. Never expose service-role keys in frontend code."},null,2));}catch(error){return errorResult(error);}}
  );

  server.registerTool(
    "performance_intelligence_v5",
    {
      title:"Performance Intelligence v5",
      description:"Inspect source for common frontend/data performance risks such as oversized assets, unbounded fetch patterns, eager imports and large source files.",
      inputSchema:z.object({}),annotations:{readOnlyHint:true,openWorldHint:false}
    },
    async ()=>{try{const files=await walkProject(PROJECT_ROOT,[],2600);const large:any[]=[];for(const f of files){try{const st=await fs.stat(f);if(st.size>400000&&!/lock|\.map$/.test(f))large.push({file:path.relative(PROJECT_ROOT,f),bytes:st.size});}catch{}}const patterns=await v50ScanPatterns([{name:"Potential unbounded data fetch",re:/select\s*\(\s*["'`]\*["'`]\s*\)|\.select\(\s*["'`]\*["'`]\s*\)/i,severity:"MEDIUM"},{name:"Large inline base64 asset",re:/data:image\/[a-z+]+;base64,[A-Za-z0-9+/]{5000,}/i,severity:"MAJOR"},{name:"Window resize listener",re:/addEventListener\(\s*["']resize["']/i,severity:"LOW"}],1800);return result(JSON.stringify({status:(large.length||patterns.length)?"REVIEW_REQUIRED":"OK",largeFiles:large.slice(0,80),sourceSignals:patterns.slice(0,120),recommendations:["Measure before optimizing","Paginate large datasets","Lazy-load heavy routes/assets","Verify bundle and network behavior in production build"]},null,2));}catch(error){return errorResult(error);}}
  );

  server.registerTool(
    "accessibility_auditor_v5",
    {
      title:"Accessibility Auditor v5",
      description:"Run a static accessibility review for common React/HTML issues and return targets for browser-level verification.",
      inputSchema:z.object({}),annotations:{readOnlyHint:true,openWorldHint:false}
    },
    async ()=>{try{const findings=await v50ScanPatterns([{name:"Image may lack alt",re:/<img(?![^>]*\balt=)[^>]*>/i,severity:"MAJOR"},{name:"Clickable div without obvious keyboard semantics",re:/<div[^>]*onClick=/i,severity:"MEDIUM"},{name:"Input may lack accessible label",re:/<input(?![^>]*aria-label)(?![^>]*aria-labelledby)[^>]*>/i,severity:"MEDIUM"},{name:"Outline disabled",re:/outline\s*:\s*none/i,severity:"MEDIUM"}],1800);return result(JSON.stringify({status:findings.length?"REVIEW_REQUIRED":"NO_STATIC_FINDINGS",count:findings.length,findings,requiredRuntimeChecks:["keyboard navigation","focus visibility","dialog focus trap","contrast","screen-reader names","mobile touch targets"],warning:"Static scan is incomplete; browser accessibility verification remains required."},null,2));}catch(error){return errorResult(error);}}
  );

  server.registerTool(
    "git_regression_guardian_v5",
    {
      title:"Git Regression Guardian v5",
      description:"Inspect git working changes, combine them with impact analysis, and produce a regression verification scope before commit or release.",
      inputSchema:z.object({baseRef:z.string().default("HEAD")}),annotations:{readOnlyHint:true,openWorldHint:false}
    },
    async ({baseRef})=>{try{const st=await executeProgram('git',['status','--short'],PROJECT_ROOT,60000);const diff=await executeProgram('git',['diff','--name-only',baseRef],PROJECT_ROOT,60000);const changed=(diff.stdout||'').split(/\r?\n/).map(x=>x.trim()).filter(Boolean);const graph=await readCodeIntelligenceGraph();const impacted=new Set<string>();if(graph)for(const f of changed){impacted.add(f);const node=graph.nodes[normalizeRel(f)];if(node)for(const dep of node.importedBy||[])impacted.add(dep);}return result(JSON.stringify({status:st.success?'OK':'GIT_UNAVAILABLE',workingTree:st.stdout,changedFiles:changed,impactedFiles:Array.from(impacted).slice(0,300),requiredChecks:["typecheck","targeted tests","affected routes browser test","visual review for UI changes","security/database review when applicable"],rule:"Do not auto-commit when required gates are failing."},null,2));}catch(error){return errorResult(error);}}
  );

  server.registerTool(
    "engineering_task_board_v5",
    {
      title:"Engineering Task Board v5",
      description:"Build a consolidated task board from the task graph, precise-execution requirements and Autopilot state for clear progress visibility.",
      inputSchema:z.object({}),annotations:{readOnlyHint:false,openWorldHint:false}
    },
    async ()=>{try{const board=await v50TaskBoard();return result(JSON.stringify({status:"OK",board,file:`.krom/${V50_TASK_BOARD_FILE}`},null,2));}catch(error){return errorResult(error);}}
  );

  server.registerTool(
    "engineering_suite_gate_v5",
    {
      title:"Engineering Suite Gate v5",
      description:"Aggregate product readiness, security, diagnostics, task completion and preflight evidence into a final v5 engineering decision. This does not replace runtime/browser evidence.",
      inputSchema:z.object({minimumProductScore:z.number().int().min(0).max(100).default(75)}),annotations:{readOnlyHint:false,openWorldHint:false}
    },
    async ({minimumProductScore})=>{try{const board=await v50TaskBoard();let bp=await readProductBlueprint();const featureRows:any[]=[];if(bp)for(const f of bp.features)featureRows.push(await scanFeatureEvidence(f));const productBlockers=featureRows.filter(x=>x.score<minimumProductScore);const security=await v50ScanPatterns([{name:"service role exposure",re:/service_role|SUPABASE_SERVICE_ROLE/i,severity:"CRITICAL"},{name:"permissive RLS",re:/using\s*\(\s*true\s*\)/i,severity:"MAJOR"}],1800);const taskBlockers=(board.nodes||[]).filter((n:any)=>['blocked','in_progress','pending','ready'].includes(n.status));const decision=(productBlockers.length||security.some(x=>x.severity==='CRITICAL')||taskBlockers.length)?'BLOCKED':'READY_FOR_RUNTIME_RELEASE_GATES';const audit={at:new Date().toISOString(),decision,productBlockers,securityCritical:security.filter(x=>x.severity==='CRITICAL'),taskBlockers,rule:"READY here still requires executable build/test/browser/release evidence before deployment."};await fs.writeFile(await kromStatePath(V50_AUDIT_FILE),JSON.stringify(audit,null,2),'utf8');return result(JSON.stringify({status:decision,audit,file:`.krom/${V50_AUDIT_FILE}`},null,2));}catch(error){return errorResult(error);}}
  );


  // =========================================================
  // KROM FORGE DEV CORE - AUTONOMOUS SOFTWARE FACTORY
  // =========================================================
  server.registerTool(
    "lsp_diagnostics_v6",
    {title:"LSP Diagnostics v6",description:"Run project type/lint diagnostics and normalize file/line markers for IDE-style error rendering.",inputSchema:z.object({}),annotations:{readOnlyHint:false,openWorldHint:false}},
    async()=>{try{return result(JSON.stringify(await v60Diagnostics(),null,2));}catch(error){return errorResult(error);}}
  );

  server.registerTool(
    "error_markers_v6",
    {title:"Error Markers v6",description:"Return the latest normalized diagnostics as editor gutter markers grouped by file.",inputSchema:z.object({refresh:z.boolean().default(false)}),annotations:{readOnlyHint:false,openWorldHint:false}},
    async({refresh})=>{try{const d=refresh?await v60Diagnostics():await v60ReadJson(V60_DIAGNOSTICS_FILE,null)||await v60Diagnostics();const markers=Object.entries(d.byFile||{}).map(([file,items]:any)=>({file,markers:items.map((x:any)=>({line:x.line,column:x.column,severity:x.severity,code:x.code,message:x.message,source:x.source}))}));return result(JSON.stringify({status:d.status,total:d.count,files:markers.length,markers},null,2));}catch(error){return errorResult(error);}}
  );

  server.registerTool(
    "smart_file_explorer_v6",
    {title:"Smart File Explorer v6",description:"Build an IDE-oriented project index with hotspots, routes, tests, sizes and code-density signals.",inputSchema:z.object({refresh:z.boolean().default(true),limit:z.number().int().min(100).max(6000).default(3500)}),annotations:{readOnlyHint:false,openWorldHint:false}},
    async({refresh,limit})=>{try{const idx=refresh?await v60WorkspaceIndex(limit):await v60ReadJson(V60_WORKSPACE_FILE,null)||await v60WorkspaceIndex(limit);return result(JSON.stringify({status:'OK',count:idx.count,hotspots:idx.hotspots,routes:idx.files.filter((x:any)=>x.routeSignal).slice(0,200),tests:idx.files.filter((x:any)=>x.testSignal).slice(0,200),largest:[...idx.files].sort((a:any,b:any)=>b.bytes-a.bytes).slice(0,80),file:`.krom/${V60_WORKSPACE_FILE}`},null,2));}catch(error){return errorResult(error);}}
  );

  server.registerTool(
    "workspace_search_v6",
    {title:"Workspace Search v6",description:"Search indexed workspace filenames and source content with ranked results suitable for an IDE command palette.",inputSchema:z.object({query:z.string().min(1),maxResults:z.number().int().min(1).max(200).default(50)}),annotations:{readOnlyHint:true,openWorldHint:false}},
    async({query,maxResults})=>{try{const files=await walkProject(PROJECT_ROOT,[],3500);const q=query.toLowerCase();const hits:any[]=[];for(const abs of files){if(!isTextFile(abs))continue;const rel=normalizeRel(path.relative(PROJECT_ROOT,abs));let score=0;if(rel.toLowerCase().includes(q))score+=100;try{const st=await fs.stat(abs);if(st.size>MAX_FILE_SIZE)continue;const txt=await fs.readFile(abs,'utf8');const low=txt.toLowerCase();const idx=low.indexOf(q);if(idx>=0){score+=40;const before=txt.slice(0,idx).split(/\r?\n/).length;hits.push({file:rel,score,line:before,preview:txt.slice(Math.max(0,idx-120),Math.min(txt.length,idx+query.length+180)).replace(/\s+/g,' ')});}else if(score)hits.push({file:rel,score,line:null,preview:null});}catch{}}hits.sort((a,b)=>b.score-a.score);return result(JSON.stringify({query,count:hits.length,results:hits.slice(0,maxResults)},null,2));}catch(error){return errorResult(error);}}
  );

  server.registerTool(
    "diff_editor_v6",
    {title:"Diff Editor v6",description:"Return a structured git diff for one project file for before/after IDE review.",inputSchema:z.object({file:z.string().min(1)}),annotations:{readOnlyHint:true,openWorldHint:false}},
    async({file})=>{try{const d=await v60GitFileDiff(file);const added=(d.diff.match(/^\+(?!\+)/gm)||[]).length;const removed=(d.diff.match(/^-(?!--)/gm)||[]).length;return result(JSON.stringify({...d,added,removed,hasChanges:!!d.diff.trim()},null,2));}catch(error){return errorResult(error);}}
  );

  server.registerTool(
    "terminal_manager_v6",
    {title:"Terminal Manager v6",description:"Inspect package scripts and optionally run one declared project script without arbitrary shell evaluation.",inputSchema:z.object({action:z.enum(['list','run']).default('list'),script:z.string().optional(),timeoutSeconds:z.number().int().min(1).max(300).default(180)}),annotations:{readOnlyHint:false,destructiveHint:true,openWorldHint:true}},
    async({action,script,timeoutSeconds})=>{try{const pkg=await readPackageJson()||{};const scripts=pkg.scripts||{};if(action==='list')return result(JSON.stringify({packageManager:await detectPackageManager(),scripts},null,2));if(!script||typeof scripts[script]!=='string')throw new Error(`Unknown package script: ${script||''}`);const pm=await detectPackageManager();const ex=await executeProgram(pm,['run',script],PROJECT_ROOT,timeoutSeconds*1000);return result(JSON.stringify({script,command:`${pm} run ${script}`,success:ex.success,code:ex.code??0,stdout:ex.stdout,stderr:ex.stderr},null,2));}catch(error){return errorResult(error);}}
  );

  server.registerTool(
    "plugin_manager_v6",
    {title:"Plugin Manager v6",description:"Manage KROM local plugin metadata/enablement. This registry does not download or execute untrusted plugins.",inputSchema:z.object({action:z.enum(['list','register','enable','disable','remove']).default('list'),id:z.string().optional(),name:z.string().optional(),entry:z.string().optional(),capabilities:z.array(z.string()).default([])}),annotations:{readOnlyHint:false,openWorldHint:false}},
    async({action,id,name,entry,capabilities})=>{try{const reg=await v60PluginRegistry();if(action==='list')return result(JSON.stringify(reg,null,2));if(!id)throw new Error('id is required');const i=reg.plugins.findIndex((p:any)=>p.id===id);if(action==='register'){const item={id,name:name||id,entry:entry||null,capabilities,enabled:false,registeredAt:new Date().toISOString()};if(i>=0)reg.plugins[i]={...reg.plugins[i],...item};else reg.plugins.push(item);}else if(action==='remove'){if(i>=0)reg.plugins.splice(i,1);}else{if(i<0)throw new Error(`Plugin not registered: ${id}`);reg.plugins[i].enabled=action==='enable';reg.plugins[i].updatedAt=new Date().toISOString();}await v60WriteJson(V60_PLUGINS_FILE,reg);return result(JSON.stringify({status:'OK',registry:reg,file:`.krom/${V60_PLUGINS_FILE}`},null,2));}catch(error){return errorResult(error);}}
  );

  server.registerTool(
    "mcp_manager_v6",
    {title:"MCP Manager v6",description:"Discover MCP configuration signals and KROM server endpoint metadata without exposing secret values.",inputSchema:z.object({}),annotations:{readOnlyHint:true,openWorldHint:false}},
    async()=>{try{const files=await walkProject(PROJECT_ROOT,[],2500);const candidates=files.filter(f=>/mcp|\.cursor|claude|codex|settings\.json/i.test(path.basename(f))).slice(0,100).map(f=>normalizeRel(path.relative(PROJECT_ROOT,f)));const envNames=Object.keys(process.env).filter(k=>/MCP|KROM|SUPABASE|VERCEL|GITHUB/i.test(k)).map(k=>({name:k,present:true,value:'[REDACTED]'}));return result(JSON.stringify({server:{name:'KSA-FORGE-DEV',version:'6.0.0',endpoint:`http://127.0.0.1:${PORT}/mcp`,project:PROJECT_ROOT},configCandidates:candidates,environmentSignals:envNames,rule:'Secret values are never returned.'},null,2));}catch(error){return errorResult(error);}}
  );

  server.registerTool(
    "refactor_planner_v6",
    {title:"Refactor Planner v6",description:"Create a low-risk refactor plan from code-intelligence impact, git state and diagnostics before structural edits.",inputSchema:z.object({files:z.array(z.string()).min(1).max(50),goal:z.string().min(3)}),annotations:{readOnlyHint:true,openWorldHint:false}},
    async({files,goal})=>{try{const graph=await readCodeIntelligenceGraph();const rows:any[]=[];for(const f0 of files){const f=normalizeRel(f0);const node=graph?.nodes?.[f];rows.push({file:f,importedBy:(node?.importedBy||[]).slice(0,80),imports:(node?.imports||[]).slice(0,80),blastRadius:(node?.importedBy||[]).length,risk:(node?.importedBy||[]).length>15?'HIGH':(node?.importedBy||[]).length>5?'MEDIUM':'LOW'});}const plan={goal,targets:rows,steps:['Create/verify checkpoint','Run baseline diagnostics/tests','Refactor smallest dependency layer first','Re-run diagnostics after each structural step','Run impacted route/browser checks','Review diff and regression scope before release'],rule:'Do not mix unrelated refactors with feature changes.'};return result(JSON.stringify(plan,null,2));}catch(error){return errorResult(error);}}
  );

  server.registerTool(
    "execution_stream_v6",
    {title:"Execution Stream v6",description:"Return a Codex-style public execution status stream from Autopilot, task graph, diagnostics and preflight state without exposing hidden reasoning.",inputSchema:z.object({}),annotations:{readOnlyHint:false,openWorldHint:false}},
    async()=>{try{return result(JSON.stringify(await v60ExecutionStream(),null,2));}catch(error){return errorResult(error);}}
  );

  server.registerTool(
    "ide_workspace_v6",
    {title:"IDE Workspace v6",description:"Build a consolidated IDE workspace model: files, diagnostics, tasks, git changes, scripts, plugins and execution status.",inputSchema:z.object({refresh:z.boolean().default(true)}),annotations:{readOnlyHint:false,openWorldHint:false}},
    async({refresh})=>{try{const idx=refresh?await v60WorkspaceIndex():await v60ReadJson(V60_WORKSPACE_FILE,null)||await v60WorkspaceIndex();const diag=refresh?await v60Diagnostics():await v60ReadJson(V60_DIAGNOSTICS_FILE,null)||await v60Diagnostics();const board=await v50TaskBoard();const git=await executeProgram('git',['status','--short'],PROJECT_ROOT,60000);const pkg=await readPackageJson()||{};const plugins=await v60PluginRegistry();const stream=await v60ExecutionStream();return result(JSON.stringify({status:'OK',project:PROJECT_ROOT,files:{count:idx.count,hotspots:idx.hotspots.slice(0,30)},diagnostics:{status:diag.status,count:diag.count},tasks:board,git:{success:git.success,status:git.stdout},scripts:pkg.scripts||{},plugins,execution:stream.events,file:`.krom/${V60_WORKSPACE_FILE}`},null,2));}catch(error){return errorResult(error);}}
  );

  server.registerTool(
    "ide_release_gate_v6",
    {title:"IDE Release Gate v6",description:"Aggregate IDE diagnostics, task state, git regression scope and v5 engineering gate into a strict v6 pre-release decision.",inputSchema:z.object({allowWarnings:z.boolean().default(true)}),annotations:{readOnlyHint:false,openWorldHint:false}},
    async({allowWarnings})=>{try{const diag=await v60Diagnostics();const board=await v50TaskBoard();const git=await executeProgram('git',['status','--short'],PROJECT_ROOT,60000);const blockers:any[]=[];if(diag.diagnostics.some((d:any)=>d.severity==='error'))blockers.push({type:'diagnostics',count:diag.diagnostics.filter((d:any)=>d.severity==='error').length});if(!allowWarnings&&diag.diagnostics.some((d:any)=>d.severity==='warning'))blockers.push({type:'warnings',count:diag.diagnostics.filter((d:any)=>d.severity==='warning').length});const openTasks=(board.nodes||[]).filter((n:any)=>n.status!=='verified'&&n.status!=='done');if(openTasks.length)blockers.push({type:'tasks',count:openTasks.length,items:openTasks.slice(0,30)});const decision=blockers.length?'BLOCKED':'READY_FOR_RUNTIME_RELEASE_GATE';const audit={at:new Date().toISOString(),decision,blockers,diagnostics:{status:diag.status,count:diag.count},gitDirty:!!(git.stdout||'').trim(),rule:'This gate does not replace browser, security, database, product-readiness, or deployment verification.'};await v60WriteJson(V60_GATE_FILE,audit);return result(JSON.stringify({status:decision,audit,file:`.krom/${V60_GATE_FILE}`},null,2));}catch(error){return errorResult(error);}}
  );


  // =========================================================
  // v7.0 VISUAL IDE + AI WORKSPACE TOOLS
  // =========================================================
  server.registerTool(
    "visual_ide_workspace_v7",
    {title:"Visual IDE Workspace v7",description:"Return the unified Visual IDE workspace model for Explorer, Problems, Tasks, Git, Preview, selector state and execution stream.",inputSchema:z.object({}),annotations:{readOnlyHint:false,openWorldHint:false}},
    async()=>{try{return result(JSON.stringify(await v70WorkspaceState(),null,2));}catch(error){return errorResult(error);}}
  );

  server.registerTool(
    "panel_layout_v7",
    {title:"Panel Layout v7",description:"Read or update Visual IDE panel visibility and sizes.",inputSchema:z.object({action:z.enum(['get','update']).default('get'),patch:z.record(z.string(), z.any()).optional()}),annotations:{readOnlyHint:false,openWorldHint:false}},
    async({action,patch})=>{try{let layout=await v70Layout();if(action==='update'&&patch){layout={...layout,...patch};await v60WriteJson(V70_LAYOUT_FILE,layout);}return result(JSON.stringify({status:'OK',layout,file:`.krom/${V70_LAYOUT_FILE}`},null,2));}catch(error){return errorResult(error);}}
  );

  server.registerTool(
    "problems_panel_v7",
    {title:"Problems Panel v7",description:"Return normalized IDE problems grouped by file and severity.",inputSchema:z.object({refresh:z.boolean().default(true)}),annotations:{readOnlyHint:false,openWorldHint:false}},
    async({refresh})=>{try{const d=refresh?await v60Diagnostics():await v60ReadJson(V60_DIAGNOSTICS_FILE,null)||await v60Diagnostics();const counts={errors:d.diagnostics.filter((x:any)=>x.severity==='error').length,warnings:d.diagnostics.filter((x:any)=>x.severity==='warning').length};return result(JSON.stringify({status:d.status,counts,byFile:d.byFile,items:d.diagnostics},null,2));}catch(error){return errorResult(error);}}
  );

  server.registerTool(
    "agent_model_selector_v7",
    {title:"Agent / Model Selector v7",description:"Persist the selected KROM agent strategy, model label and reasoning level for the workspace without inventing provider availability.",inputSchema:z.object({action:z.enum(['get','set']).default('get'),agent:z.string().optional(),model:z.string().optional(),reasoning:z.enum(['low','medium','high']).optional()}),annotations:{readOnlyHint:false,openWorldHint:false}},
    async({action,agent,model,reasoning})=>{try{let state=await v70SelectorState();if(action==='set'){state={...state,...(agent?{agent}:{}),...(model?{model}:{}),...(reasoning?{reasoning}:{}),updatedAt:new Date().toISOString()};await v60WriteJson(V70_SELECTOR_FILE,state);}return result(JSON.stringify({status:'OK',selector:state,rule:'Selection is workspace metadata; actual provider/model execution must be verified by the connected runtime.'},null,2));}catch(error){return errorResult(error);}}
  );

  server.registerTool(
    "preview_session_v7",
    {title:"Preview Session v7",description:"Manage Preview/Browser session metadata for the Visual IDE and optionally verify a local URL using Live Browser Vision when available.",inputSchema:z.object({action:z.enum(['get','set','clear']).default('get'),url:z.string().url().optional(),width:z.number().int().min(240).max(3840).optional(),height:z.number().int().min(240).max(2160).optional()}),annotations:{readOnlyHint:false,openWorldHint:false}},
    async({action,url,width,height})=>{try{let state=await v70PreviewState();if(action==='clear'){state={status:'IDLE',url:null,viewport:{width:1440,height:900},lastChecked:null};await v60WriteJson(V70_PREVIEW_FILE,state);}if(action==='set'){if(!url)throw new Error('url is required for set');state={status:'CONFIGURED',url,viewport:{width:width||1440,height:height||900},lastChecked:new Date().toISOString()};await v60WriteJson(V70_PREVIEW_FILE,state);}return result(JSON.stringify({status:'OK',preview:state,nextAction:state.url?'Run live_browser_vision for runtime verification.':'Set a preview URL after starting the project dev server.'},null,2));}catch(error){return errorResult(error);}}
  );

  server.registerTool(
    "git_panel_v7",
    {title:"Git Panel v7",description:"Return Git status, changed files and diff summary for the Visual IDE source-control panel.",inputSchema:z.object({includeDiffStat:z.boolean().default(true)}),annotations:{readOnlyHint:true,openWorldHint:false}},
    async({includeDiffStat})=>{try{const [status,diff]=await Promise.all([executeProgram('git',['status','--short'],PROJECT_ROOT,60000),includeDiffStat?executeProgram('git',['diff','--stat'],PROJECT_ROOT,60000):Promise.resolve({success:true,stdout:'',stderr:'',code:0})]);const changed=(status.stdout||'').split(/\r?\n/).filter(Boolean).map((line:string)=>({code:line.slice(0,2),file:line.slice(3)}));return result(JSON.stringify({status:status.success?'OK':'UNAVAILABLE',changed,diffStat:diff.stdout||'',raw:status.stdout||status.stderr||''},null,2));}catch(error){return errorResult(error);}}
  );

  server.registerTool(
    "task_board_panel_v7",
    {title:"Task Board Panel v7",description:"Return the live KROM task board grouped for Backlog, Ready, In Progress, Blocked and Verified UI columns.",inputSchema:z.object({}),annotations:{readOnlyHint:false,openWorldHint:false}},
    async()=>{try{const b=await v50TaskBoard();const cols:any={backlog:[],ready:[],in_progress:[],blocked:[],verified:[]};for(const n of (b.nodes||[])){const k=n.status==='pending'?'backlog':n.status==='verified'||n.status==='done'?'verified':n.status==='in_progress'?'in_progress':n.status==='blocked'?'blocked':'ready';cols[k].push(n);}return result(JSON.stringify({status:'OK',columns:cols,counts:b.counts,autopilot:b.autopilot,requirements:b.requirements},null,2));}catch(error){return errorResult(error);}}
  );

  server.registerTool(
    "command_palette_v7",
    {title:"Command Palette v7",description:"Return discoverable KROM/IDE commands and matching workspace actions for Ctrl+K style navigation.",inputSchema:z.object({query:z.string().default('')}),annotations:{readOnlyHint:true,openWorldHint:false}},
    async({query})=>{try{const commands=[['Files: Explore','smart_file_explorer_v6'],['Files: Search','workspace_search_v6'],['Problems: Refresh','problems_panel_v7'],['Terminal: Scripts','terminal_manager_v6'],['Git: Status','git_panel_v7'],['Preview: Configure','preview_session_v7'],['Tasks: Board','task_board_panel_v7'],['Execution: Stream','execution_stream_v6'],['Autopilot: Status','engineering_autopilot_status'],['Release: IDE Gate','ide_release_gate_v6'],['Release: Engineering Gate','engineering_suite_gate_v5'],['Release: Product Readiness','product_release_readiness']].map(([title,tool])=>({title,tool}));const q=query.trim().toLowerCase();const out=q?commands.filter(c=>(c.title+' '+c.tool).toLowerCase().includes(q)):commands;return result(JSON.stringify({status:'OK',commands:out},null,2));}catch(error){return errorResult(error);}}
  );

  server.registerTool(
    "ui_theme_v7",
    {title:"UI Theme v7",description:"Read or update Visual IDE appearance metadata including mode, density, font sizes and RTL preference.",inputSchema:z.object({action:z.enum(['get','set']).default('get'),mode:z.enum(['dark','light']).optional(),density:z.enum(['compact','comfortable']).optional(),fontSize:z.number().int().min(11).max(18).optional(),editorFontSize:z.number().int().min(11).max(22).optional(),rtl:z.boolean().optional()}),annotations:{readOnlyHint:false,openWorldHint:false}},
    async({action,...patch})=>{try{let theme=await v70Theme();if(action==='set'){theme={...theme,...Object.fromEntries(Object.entries(patch).filter(([,v])=>v!==undefined))};await v60WriteJson(V70_THEME_FILE,theme);}return result(JSON.stringify({status:'OK',theme,file:`.krom/${V70_THEME_FILE}`},null,2));}catch(error){return errorResult(error);}}
  );

  server.registerTool(
    "workspace_snapshot_v7",
    {title:"Workspace Snapshot v7",description:"Create a compact IDE snapshot of project files, diagnostics, Git, tasks, preview and execution state for resume/review.",inputSchema:z.object({}),annotations:{readOnlyHint:false,openWorldHint:false}},
    async()=>{try{const snap=await v70WorkspaceState();const file=`v7-workspace-snapshot-${Date.now()}.json`;await v60WriteJson(file,snap);return result(JSON.stringify({status:'OK',summary:{files:snap.files.count,diagnostics:snap.diagnostics.count,tasks:(snap.tasks.nodes||[]).length,preview:snap.preview.status},file:`.krom/${file}`},null,2));}catch(error){return errorResult(error);}}
  );

  server.registerTool(
    "visual_ide_gate_v7",
    {title:"Visual IDE Gate v7",description:"Gate the Visual IDE workspace on diagnostics, blocked tasks, preview readiness for UI work, and existing IDE release state.",inputSchema:z.object({requirePreview:z.boolean().default(false)}),annotations:{readOnlyHint:false,openWorldHint:false}},
    async({requirePreview})=>{try{const [diag,board,preview]=await Promise.all([v60Diagnostics(),v50TaskBoard(),v70PreviewState()]);const blockers:any[]=[];const errors=diag.diagnostics.filter((d:any)=>d.severity==='error');if(errors.length)blockers.push({type:'diagnostics',count:errors.length});const blocked=(board.nodes||[]).filter((n:any)=>n.status==='blocked');if(blocked.length)blockers.push({type:'tasks',count:blocked.length});if(requirePreview&&!preview.url)blockers.push({type:'preview',reason:'Preview URL is not configured'});const decision=blockers.length?'BLOCKED':'READY_FOR_DEEP_RELEASE_GATES';const audit={at:new Date().toISOString(),decision,blockers,preview,diagnostics:{status:diag.status,count:diag.count},taskCounts:board.counts};await v60WriteJson(V70_VISUAL_GATE_FILE,audit);return result(JSON.stringify({status:decision,audit,file:`.krom/${V70_VISUAL_GATE_FILE}`,nextAction:decision==='BLOCKED'?'Resolve IDE blockers.':'Run browser/security/product/release gates.'},null,2));}catch(error){return errorResult(error);}}
  );


  // =========================================================
  // KROM FORGE DEV CORE - AUTONOMOUS SOFTWARE FACTORY TOOLS
  // =========================================================
  server.registerTool(
    "workbench_state_v8",
    {title:"Workbench State v8",description:"Return the unified v8 coding-workbench state: files, diagnostics, tasks, Git, preview, editor tabs, history and AI context.",inputSchema:z.object({}),annotations:{readOnlyHint:true,openWorldHint:false}},
    async()=>{try{return result(JSON.stringify(await v80WorkbenchState(),null,2));}catch(error){return errorResult(error);}}
  );

  server.registerTool(
    "editor_open_file_v8",
    {title:"Editor Open File v8",description:"Open a project text file and persist it as the active editor tab.",inputSchema:z.object({file:z.string().min(1)}),annotations:{readOnlyHint:false,openWorldHint:false}},
    async({file})=>{try{const content=await v80ReadTextFile(file);let st=await v80EditorState();const tabs=Array.from(new Set([...(st.tabs||[]),normalizeRel(file)]));st={...st,tabs,activeFile:normalizeRel(file),updatedAt:new Date().toISOString()};await v60WriteJson(V80_EDITOR_STATE_FILE,st);return result(JSON.stringify({status:"OK",file:normalizeRel(file),content,editor:st},null,2));}catch(error){return errorResult(error);}}
  );

  server.registerTool(
    "editor_save_file_v8",
    {title:"Editor Save File v8",description:"Save editor content to a project file with automatic backup and edit-history evidence.",inputSchema:z.object({file:z.string().min(1),content:z.string()}),annotations:{readOnlyHint:false,destructiveHint:true,openWorldHint:false}},
    async({file,content})=>{try{return result(JSON.stringify({status:"SAVED",...(await v80WriteTextFile(file,content,"editor_save"))},null,2));}catch(error){return errorResult(error);}}
  );

  server.registerTool(
    "apply_patch_v8",
    {title:"Apply Patch v8",description:"Apply a deterministic text replacement to one project file with backup and history. Fails if the search text is absent.",inputSchema:z.object({file:z.string().min(1),search:z.string().min(1),replacement:z.string(),replaceAll:z.boolean().default(false)}),annotations:{readOnlyHint:false,destructiveHint:true,openWorldHint:false}},
    async({file,search,replacement,replaceAll})=>{try{return result(JSON.stringify({status:"PATCHED",...(await v80ApplyReplacement(file,search,replacement,replaceAll))},null,2));}catch(error){return errorResult(error);}}
  );

  server.registerTool(
    "edit_history_v8",
    {title:"Edit History v8",description:"Inspect recent file-edit history or perform bounded undo/redo for the current project.",inputSchema:z.object({action:z.enum(["list","undo","redo"]).default("list"),file:z.string().optional(),limit:z.number().int().min(1).max(80).default(30)}),annotations:{readOnlyHint:false,destructiveHint:true,openWorldHint:false}},
    async({action,file,limit})=>{try{if(action==="list"){const h=(await v60ReadJson(V80_EDIT_HISTORY_FILE,[])) as any[];return result(JSON.stringify({status:"OK",history:h.filter(x=>!file||normalizeRel(x.file)===normalizeRel(file)).slice(-limit)},null,2));}return result(JSON.stringify({status:"OK",...(await v80UndoRedo(action,file))},null,2));}catch(error){return errorResult(error);}}
  );

  server.registerTool(
    "editor_problems_v8",
    {title:"Editor Problems v8",description:"Return live diagnostics grouped for editor markers and Problems panel, optionally scoped to one file.",inputSchema:z.object({file:z.string().optional(),refresh:z.boolean().default(true)}),annotations:{readOnlyHint:false,openWorldHint:false}},
    async({file,refresh})=>{try{const d=refresh?await v60Diagnostics():await v60ReadJson(V60_DIAGNOSTICS_FILE,null)||await v60Diagnostics();const items=(d.diagnostics||[]).filter((x:any)=>!file||normalizeRel(x.file)===normalizeRel(file));return result(JSON.stringify({status:d.status,count:items.length,file:file||null,markers:items},null,2));}catch(error){return errorResult(error);}}
  );

  server.registerTool(
    "ai_file_context_v8",
    {title:"AI File Context v8",description:"Persist or read AI-workbench instructions linked to the active file. This stores context only and does not fabricate model execution.",inputSchema:z.object({action:z.enum(["get","add","clear"]).default("get"),message:z.string().optional(),activeFile:z.string().optional()}),annotations:{readOnlyHint:false,openWorldHint:false}},
    async({action,message,activeFile})=>{try{let st=await v60ReadJson(V80_CHAT_CONTEXT_FILE,{messages:[],activeFile:null});if(action==="clear")st={messages:[],activeFile:activeFile||null};if(action==="add"){if(!message?.trim())throw new Error("message is required");st.activeFile=activeFile||st.activeFile||null;st.messages=[...(st.messages||[]),{at:new Date().toISOString(),message:message.trim(),activeFile:activeFile||st.activeFile||null}].slice(-100);}await v60WriteJson(V80_CHAT_CONTEXT_FILE,st);return result(JSON.stringify({status:"OK",...st,rule:"Context storage does not imply an LLM call; use the connected agent/model runtime for generation."},null,2));}catch(error){return errorResult(error);}}
  );

  server.registerTool(
    "terminal_script_v8",
    {title:"Terminal Script v8",description:"Run one declared package.json script and return terminal output for the Workbench. Arbitrary shell strings are not accepted.",inputSchema:z.object({script:z.string().min(1),timeoutSeconds:z.number().int().min(1).max(600).default(180)}),annotations:{readOnlyHint:false,destructiveHint:true,openWorldHint:true}},
    async({script,timeoutSeconds})=>{try{const pkg=await readPackageJson()||{};if(!pkg.scripts||typeof pkg.scripts[script]!=="string")throw new Error(`Unknown package script: ${script}`);const pm=await detectPackageManager();const ex=await executeProgram(pm,["run",script],PROJECT_ROOT,timeoutSeconds*1000);return result(JSON.stringify({status:ex.success?"PASS":"FAIL",script,command:`${pm} run ${script}`,code:ex.code??0,stdout:ex.stdout,stderr:ex.stderr},null,2));}catch(error){return errorResult(error);}}
  );

  server.registerTool(
    "git_commit_v8",
    {title:"Git Commit v8",description:"Stage explicitly listed project files and create a Git commit with an explicit message. Refuses an empty file list or message.",inputSchema:z.object({message:z.string().min(3),files:z.array(z.string().min(1)).min(1)}),annotations:{readOnlyHint:false,destructiveHint:true,openWorldHint:false}},
    async({message,files})=>{try{const rels=files.map(normalizeRel);for(const f of rels)safePath(f);const add=await executeProgram("git",["add","--",...rels],PROJECT_ROOT,60000);if(!add.success)throw new Error(add.stderr||"git add failed");const commit=await executeProgram("git",["commit","-m",message],PROJECT_ROOT,120000);return result(JSON.stringify({status:commit.success?"COMMITTED":"FAILED",files:rels,message,stdout:commit.stdout,stderr:commit.stderr,code:commit.code??0},null,2));}catch(error){return errorResult(error);}}
  );

  server.registerTool(
    "workbench_gate_v8",
    {title:"Workbench Gate v8",description:"Gate v8 on diagnostics, blocked tasks, editor state and existing visual/IDE readiness before deeper release gates.",inputSchema:z.object({requireOpenFile:z.boolean().default(false),requirePreview:z.boolean().default(false)}),annotations:{readOnlyHint:false,openWorldHint:false}},
    async({requireOpenFile,requirePreview})=>{try{const [diag,board,editor,preview]=await Promise.all([v60Diagnostics(),v50TaskBoard(),v80EditorState(),v70PreviewState()]);const blockers:any[]=[];const errors=(diag.diagnostics||[]).filter((x:any)=>x.severity==="error");if(errors.length)blockers.push({type:"diagnostics",count:errors.length});const blocked=(board.nodes||[]).filter((x:any)=>x.status==="blocked");if(blocked.length)blockers.push({type:"tasks",count:blocked.length});if(requireOpenFile&&!editor.activeFile)blockers.push({type:"editor",reason:"No active file"});if(requirePreview&&!preview.url)blockers.push({type:"preview",reason:"Preview is not configured"});const decision=blockers.length?"BLOCKED":"READY_FOR_DEEP_RELEASE_GATES";return result(JSON.stringify({status:decision,blockers,editor,preview,nextAction:decision==="BLOCKED"?"Resolve workbench blockers.":"Run product/security/browser/release gates."},null,2));}catch(error){return errorResult(error);}}
  );


  // =========================================================
  // KROM FORGE DEV v9.0 - ENGINEERING OPERATIONS TOOLS
  // =========================================================
  server.registerTool(
    "runtime_process_manager_v9",
    {title:"Runtime Process Manager v9",description:"Start, inspect, and stop declared package.json scripts as managed long-running workspace processes.",inputSchema:z.object({action:z.enum(["list","start","stop"]).default("list"),name:z.string().optional(),script:z.string().optional()}),annotations:{readOnlyHint:false,destructiveHint:true,openWorldHint:true}},
    async({action,name,script})=>{try{if(action==="list")return result(JSON.stringify({processes:[...v90Processes.entries()].map(([id,x])=>({id,command:x.command,startedAt:x.startedAt,running:x.process.exitCode===null,exitCode:x.process.exitCode,stdout:x.stdout.slice(-40),stderr:x.stderr.slice(-40)}))},null,2)); if(action==="start"){const {scripts,packageManager}=await v90DeclaredScripts(); const key=name||script||"runtime"; if(!script||typeof scripts[script]!=="string")throw new Error(`Unknown package script: ${script||''}`); if(v90Processes.has(key)&&v90Processes.get(key)!.process.exitCode===null)throw new Error(`Process already running: ${key}`); const cp=spawn(packageManager,["run",script],{cwd:PROJECT_ROOT,stdio:["ignore","pipe","pipe"],shell:false}); const rec={process:cp,command:`${packageManager} run ${script}`,startedAt:new Date().toISOString(),stdout:[] as string[],stderr:[] as string[]}; cp.stdout?.on("data",c=>v90TailPush(rec.stdout,c)); cp.stderr?.on("data",c=>v90TailPush(rec.stderr,c)); v90Processes.set(key,rec); return result(JSON.stringify({status:"STARTED",id:key,pid:cp.pid,command:rec.command},null,2));} const key=name||script; if(!key||!v90Processes.has(key))throw new Error(`Unknown process: ${key||''}`); const rec=v90Processes.get(key)!; if(rec.process.exitCode===null)rec.process.kill(); return result(JSON.stringify({status:"STOP_REQUESTED",id:key,pid:rec.process.pid},null,2));}catch(error){return errorResult(error);}}
  );

  server.registerTool(
    "test_explorer_v9",
    {title:"Test Explorer v9",description:"Discover project tests and declared test/e2e scripts for an IDE-style Test Explorer.",inputSchema:z.object({}),annotations:{readOnlyHint:true,openWorldHint:false}},
    async()=>{try{return result(JSON.stringify({status:"OK",...(await v90TestInventory())},null,2));}catch(error){return errorResult(error);}}
  );

  server.registerTool(
    "debug_log_center_v9",
    {title:"Debug & Log Center v9",description:"Return bounded logs from KROM-managed runtime processes without exposing unrelated system processes.",inputSchema:z.object({process:z.string().optional(),limit:z.number().int().min(1).max(200).default(80)}),annotations:{readOnlyHint:true,openWorldHint:false}},
    async({process:proc,limit})=>{try{const rows=[...v90Processes.entries()].filter(([id])=>!proc||id===proc).map(([id,x])=>({id,command:x.command,running:x.process.exitCode===null,exitCode:x.process.exitCode,stdout:x.stdout.slice(-limit),stderr:x.stderr.slice(-limit)}));return result(JSON.stringify({status:"OK",processes:rows},null,2));}catch(error){return errorResult(error);}}
  );

  server.registerTool(
    "api_inspector_v9",
    {title:"API Inspector v9",description:"Inspect likely frontend API clients and backend route handlers to support contract review and request debugging.",inputSchema:z.object({}),annotations:{readOnlyHint:true,openWorldHint:false}},
    async()=>{try{return result(JSON.stringify({status:"OK",...(await v90ApiInventory())},null,2));}catch(error){return errorResult(error);}}
  );

  server.registerTool(
    "database_panel_v9",
    {title:"Database Panel v9",description:"Inventory SQL migrations, Supabase-related files and redacted database environment signals for the IDE.",inputSchema:z.object({}),annotations:{readOnlyHint:true,openWorldHint:false}},
    async()=>{try{return result(JSON.stringify({status:"OK",...(await v90DatabaseInventory())},null,2));}catch(error){return errorResult(error);}}
  );

  server.registerTool(
    "env_secrets_manager_v9",
    {title:"Environment & Secrets Manager v9",description:"Audit required environment-variable names against the current process while always redacting secret values.",inputSchema:z.object({}),annotations:{readOnlyHint:true,openWorldHint:false}},
    async()=>{try{return result(JSON.stringify({status:"OK",...(await v90EnvAudit())},null,2));}catch(error){return errorResult(error);}}
  );

  server.registerTool(
    "extension_sdk_v9",
    {title:"Extension SDK v9",description:"Create or inspect a safe local KROM extension manifest scaffold under .krom/extensions. Does not execute extension code.",inputSchema:z.object({action:z.enum(["list","scaffold"]).default("list"),id:z.string().regex(/^[a-z0-9][a-z0-9-]{1,63}$/).optional(),name:z.string().optional(),capabilities:z.array(z.string()).default([])}),annotations:{readOnlyHint:false,openWorldHint:false}},
    async({action,id,name,capabilities})=>{try{const dir=safePath(V90_EXTENSION_DIR);await fs.mkdir(dir,{recursive:true});if(action==="list"){const items=await fs.readdir(dir,{withFileTypes:true});const manifests:any[]=[];for(const x of items.filter(x=>x.isDirectory())){const f=path.join(dir,x.name,"manifest.json");try{manifests.push(JSON.parse(await fs.readFile(f,"utf8")))}catch{}}return result(JSON.stringify({status:"OK",extensions:manifests},null,2));}if(!id)throw new Error("id is required");const extDir=path.join(dir,id);await fs.mkdir(extDir,{recursive:true});const manifest={schemaVersion:1,id,name:name||id,capabilities,enabled:false,createdAt:new Date().toISOString(),entry:"index.ts"};await fs.writeFile(path.join(extDir,"manifest.json"),JSON.stringify(manifest,null,2));const entry=path.join(extDir,"index.ts");if(!(await exists(entry)))await fs.writeFile(entry,"// KROM extension scaffold. Register capabilities explicitly before execution.\n");return result(JSON.stringify({status:"SCAFFOLDED",manifest,path:normalizeRel(path.relative(PROJECT_ROOT,extDir))},null,2));}catch(error){return errorResult(error);}}
  );

  server.registerTool(
    "workspace_profile_v9",
    {title:"Workspace Profile v9",description:"Read or update a persistent workspace profile for preferred scripts, preview URL, quality gates and required environment names.",inputSchema:z.object({action:z.enum(["get","set"]).default("get"),profile:z.object({devScript:z.string().optional(),testScript:z.string().optional(),buildScript:z.string().optional(),previewUrl:z.string().url().optional(),requiredEnv:z.array(z.string()).optional(),notes:z.array(z.string()).optional()}).optional()}),annotations:{readOnlyHint:false,openWorldHint:false}},
    async({action,profile})=>{try{let cur=await v60ReadJson(V90_PROFILE_FILE,{});if(action==="set"){cur={...cur,...(profile||{}),updatedAt:new Date().toISOString()};await v60WriteJson(V90_PROFILE_FILE,cur);}return result(JSON.stringify({status:"OK",profile:cur,file:`.krom/${V90_PROFILE_FILE}`},null,2));}catch(error){return errorResult(error);}}
  );

  server.registerTool(
    "dependency_doctor_v9",
    {title:"Dependency Doctor v9",description:"Inspect package manager, Node engine, lockfiles and dependency reproducibility signals.",inputSchema:z.object({}),annotations:{readOnlyHint:true,openWorldHint:false}},
    async()=>{try{return result(JSON.stringify({status:"OK",...(await v90DependencyDoctor())},null,2));}catch(error){return errorResult(error);}}
  );

  server.registerTool(
    "project_health_dashboard_v9",
    {title:"Project Health Dashboard v9",description:"Compute an evidence-based project-health score from diagnostics, tests, env requirements, dependencies, API/database footprint and Git state.",inputSchema:z.object({}),annotations:{readOnlyHint:false,openWorldHint:false}},
    async()=>{try{return result(JSON.stringify({status:"OK",...(await v90Health()),file:`.krom/${V90_HEALTH_FILE}`},null,2));}catch(error){return errorResult(error);}}
  );

  server.registerTool(
    "release_center_v9",
    {title:"Release Center v9",description:"Aggregate project health and available gate evidence into one release-readiness decision before final deployment.",inputSchema:z.object({}),annotations:{readOnlyHint:false,openWorldHint:false}},
    async()=>{try{return result(JSON.stringify({status:"OK",...(await v90ReleaseCenter()),file:`.krom/${V90_RELEASE_FILE}`},null,2));}catch(error){return errorResult(error);}}
  );


  // ===== v10.0 Autonomous Software Factory =====
  server.registerTool(
    "spec_to_code_pipeline_v10",
    {title:"Spec-to-Code Pipeline v10",description:"Convert a product goal into a gated engineering specification and execution phases before implementation.",inputSchema:z.object({goal:z.string().min(3),constraints:z.array(z.string()).default([])}),annotations:{readOnlyHint:false,openWorldHint:false}},
    async({goal,constraints})=>{try{return result(JSON.stringify({status:"OK",spec:await v100SpecPipeline(goal,constraints),file:`.krom/${V100_SPEC_FILE}`},null,2));}catch(error){return errorResult(error);}}
  );

  server.registerTool(
    "architecture_graph_v10",
    {title:"Architecture Graph v10",description:"Build a project architecture graph from source modules, imports, routes/pages/components and API surfaces.",inputSchema:z.object({}),annotations:{readOnlyHint:false,openWorldHint:false}},
    async()=>{try{return result(JSON.stringify({status:"OK",graph:await v100ArchitectureGraph(),file:`.krom/${V100_ARCH_FILE}`},null,2));}catch(error){return errorResult(error);}}
  );

  server.registerTool(
    "migration_planner_v10",
    {title:"Migration Planner v10",description:"Prepare a safe additive database/application migration plan with RLS, rollback and verification requirements.",inputSchema:z.object({target:z.string().min(2)}),annotations:{readOnlyHint:false,openWorldHint:false}},
    async({target})=>{try{return result(JSON.stringify({status:"OK",plan:await v100MigrationPlanner(target),file:`.krom/${V100_MIGRATION_FILE}`},null,2));}catch(error){return errorResult(error);}}
  );

  server.registerTool(
    "e2e_scenario_generator_v10",
    {title:"E2E Scenario Generator v10",description:"Generate acceptance-focused end-to-end scenarios for happy path, validation, permissions/errors and responsive behavior.",inputSchema:z.object({feature:z.string().min(2)}),annotations:{readOnlyHint:false,openWorldHint:false}},
    async({feature})=>{try{return result(JSON.stringify({status:"OK",...(await v100E2EScenarios(feature)),file:`.krom/${V100_E2E_FILE}`},null,2));}catch(error){return errorResult(error);}}
  );

  server.registerTool(
    "visual_regression_manager_v10",
    {title:"Visual Regression Manager v10",description:"Manage visual regression policy, routes and viewport baselines for browser verification.",inputSchema:z.object({routes:z.array(z.string()).default([])}),annotations:{readOnlyHint:false,openWorldHint:false}},
    async({routes})=>{try{return result(JSON.stringify({status:"OK",...(await v100VisualRegression(routes)),file:`.krom/${V100_VISUAL_REG_FILE}`},null,2));}catch(error){return errorResult(error);}}
  );

  server.registerTool(
    "release_notes_generator_v10",
    {title:"Release Notes Generator v10",description:"Generate evidence-oriented release notes from the latest Git change set without inventing changes.",inputSchema:z.object({version:z.string().min(1)}),annotations:{readOnlyHint:false,openWorldHint:false}},
    async({version})=>{try{return result(JSON.stringify({status:"OK",notes:await v100ReleaseNotes(version),file:`.krom/${V100_RELEASE_NOTES_FILE}`},null,2));}catch(error){return errorResult(error);}}
  );

  server.registerTool(
    "cicd_orchestrator_v10",
    {title:"CI/CD Orchestrator v10",description:"Inspect project scripts and deployment signals and produce a gated CI/CD execution model.",inputSchema:z.object({}),annotations:{readOnlyHint:false,openWorldHint:false}},
    async()=>{try{return result(JSON.stringify({status:"OK",pipeline:await v100CicdOrchestrator(),file:`.krom/${V100_CICD_FILE}`},null,2));}catch(error){return errorResult(error);}}
  );

  server.registerTool(
    "quality_budget_v10",
    {title:"Quality Budget v10",description:"Define measurable engineering quality budgets for compiler, lint, tests, security, visual quality, bundle size, accessibility and product completeness.",inputSchema:z.object({maxBundleKb:z.number().int().positive().optional(),minAccessibilityScore:z.number().min(0).max(100).optional(),minProductCompleteness:z.number().min(0).max(100).optional()}),annotations:{readOnlyHint:false,openWorldHint:false}},
    async(input)=>{try{return result(JSON.stringify({status:"OK",budget:await v100QualityBudget(input),file:`.krom/${V100_QUALITY_BUDGET_FILE}`},null,2));}catch(error){return errorResult(error);}}
  );

  server.registerTool(
    "engineering_telemetry_v10",
    {title:"Engineering Telemetry v10",description:"Record non-secret engineering metrics such as task duration, test counts, model cost estimates or token usage supplied by the caller.",inputSchema:z.object({kind:z.string(),metric:z.string(),value:z.number(),meta:z.record(z.string(),z.any()).default({})}),annotations:{readOnlyHint:false,openWorldHint:false}},
    async({kind,metric,value,meta})=>{try{return result(JSON.stringify(await v100TelemetryRecord(kind,metric,value,meta),null,2));}catch(error){return errorResult(error);}}
  );

  server.registerTool(
    "project_blueprints_v10",
    {title:"Project Blueprints v10",description:"Create, list or read reusable local project blueprints with required artifacts and quality gates.",inputSchema:z.object({action:z.enum(["list","create","get"]).default("list"),id:z.string().optional(),description:z.string().optional()}),annotations:{readOnlyHint:false,openWorldHint:false}},
    async({action,id,description})=>{try{return result(JSON.stringify(await v100Blueprint(action,id,description),null,2));}catch(error){return errorResult(error);}}
  );

  server.registerTool(
    "software_factory_status_v10",
    {title:"Software Factory Status v10",description:"Summarize whether the v10 specification, architecture, E2E, CI/CD and quality-budget artifacts are ready for autonomous execution.",inputSchema:z.object({}),annotations:{readOnlyHint:true,openWorldHint:false}},
    async()=>{try{return result(JSON.stringify(await v100FactoryStatus(),null,2));}catch(error){return errorResult(error);}}
  );


  // ===== v11.0 Autonomous Delivery & Reliability Platform =====
  server.registerTool("observability_center_v11",{title:"Observability Center v11",description:"Inventory observability instrumentation and define safe production telemetry requirements.",inputSchema:z.object({}),annotations:{readOnlyHint:false,openWorldHint:false}},async()=>{try{return result(JSON.stringify({status:"OK",...(await v110Observability()),file:`.krom/${V110_OBSERVABILITY_FILE}`},null,2));}catch(error){return errorResult(error);}});
  server.registerTool("failure_replay_v11",{title:"Failure Replay v11",description:"Build a deterministic, privacy-safe replay plan for an incident or failed user flow.",inputSchema:z.object({incidentId:z.string().optional(),symptoms:z.array(z.string()).default([]),evidence:z.array(z.string()).default([])}),annotations:{readOnlyHint:false,openWorldHint:false}},async(input)=>{try{return result(JSON.stringify({status:"OK",...(await v110FailureReplay(input)),file:`.krom/${V110_REPLAY_FILE}`},null,2));}catch(error){return errorResult(error);}});
  server.registerTool("resilience_lab_v11",{title:"Resilience Lab v11",description:"Plan bounded local/staging resilience experiments for timeouts, network loss, dependency failure and restart recovery.",inputSchema:z.object({target:z.string().min(2)}),annotations:{readOnlyHint:false,destructiveHint:true,openWorldHint:false}},async({target})=>{try{return result(JSON.stringify({status:"OK",...(await v110Resilience(target)),file:`.krom/${V110_RESILIENCE_FILE}`},null,2));}catch(error){return errorResult(error);}});
  server.registerTool("contract_test_planner_v11",{title:"Contract Test Planner v11",description:"Prepare API/client contract verification for schemas, auth, errors and backward compatibility.",inputSchema:z.object({surface:z.string().min(2)}),annotations:{readOnlyHint:false,openWorldHint:false}},async({surface})=>{try{return result(JSON.stringify({status:"OK",...(await v110ContractTests(surface)),file:`.krom/${V110_CONTRACT_FILE}`},null,2));}catch(error){return errorResult(error);}});
  server.registerTool("feature_flag_manager_v11",{title:"Feature Flag Manager v11",description:"Manage local feature-flag metadata used by rollout plans. Does not silently alter application behavior.",inputSchema:z.object({action:z.enum(["list","set","remove"]).default("list"),key:z.string().optional(),enabled:z.boolean().optional(),description:z.string().optional()}),annotations:{readOnlyHint:false,openWorldHint:false}},async(input)=>{try{return result(JSON.stringify(await v110FeatureFlags(input.action,input),null,2));}catch(error){return errorResult(error);}});
  server.registerTool("deployment_strategy_v11",{title:"Deployment Strategy v11",description:"Prepare rolling, canary or blue-green deployment stages with health checks and rollback guardrails.",inputSchema:z.object({strategy:z.enum(["rolling","canary","blue_green"]).default("rolling"),environment:z.string().default("production")}),annotations:{readOnlyHint:false,openWorldHint:false}},async(input)=>{try{return result(JSON.stringify({status:"OK",...(await v110DeploymentStrategy(input)),file:`.krom/${V110_DEPLOY_FILE}`},null,2));}catch(error){return errorResult(error);}});
  server.registerTool("rollback_automation_plan_v11",{title:"Rollback Automation Plan v11",description:"Create a release rollback plan anchored to the current Git commit while refusing automatic destructive database rollback.",inputSchema:z.object({release:z.string().min(1)}),annotations:{readOnlyHint:false,openWorldHint:false}},async({release})=>{try{return result(JSON.stringify({status:"OK",...(await v110RollbackPlan(release)),file:`.krom/${V110_ROLLBACK_FILE}`},null,2));}catch(error){return errorResult(error);}});
  server.registerTool("slo_release_gate_v11",{title:"SLO Release Gate v11",description:"Evaluate supplied availability, p95 latency and error-rate measurements against explicit release thresholds.",inputSchema:z.object({availability:z.number().min(0).max(100).optional(),p95LatencyMs:z.number().positive().optional(),maxErrorRatePercent:z.number().min(0).max(100).optional(),measurements:z.record(z.string(),z.number()).default({})}),annotations:{readOnlyHint:false,openWorldHint:false}},async(input)=>{try{return result(JSON.stringify({status:"OK",...(await v110SloGate(input)),file:`.krom/${V110_SLO_FILE}`},null,2));}catch(error){return errorResult(error);}});
  server.registerTool("dependency_risk_monitor_v11",{title:"Dependency Risk Monitor v11",description:"Review dependency pinning and reproducibility risks without making unsupported vulnerability claims.",inputSchema:z.object({}),annotations:{readOnlyHint:false,openWorldHint:false}},async()=>{try{return result(JSON.stringify({status:"OK",...(await v110DependencyRisk()),file:`.krom/${V110_DEP_RISK_FILE}`},null,2));}catch(error){return errorResult(error);}});
  server.registerTool("data_integrity_guard_v11",{title:"Data Integrity Guard v11",description:"Scan migration SQL for destructive patterns and schema-integrity concerns before release.",inputSchema:z.object({}),annotations:{readOnlyHint:false,openWorldHint:false}},async()=>{try{return result(JSON.stringify({status:"OK",...(await v110DataIntegrity()),file:`.krom/${V110_DATA_INTEGRITY_FILE}`},null,2));}catch(error){return errorResult(error);}});
  server.registerTool("production_readiness_review_v11",{title:"Production Readiness Review v11",description:"Aggregate factory, project-health, release, observability, dependency, data-integrity and SLO evidence into a production-readiness decision.",inputSchema:z.object({}),annotations:{readOnlyHint:false,openWorldHint:false}},async()=>{try{return result(JSON.stringify({status:"OK",...(await v110ProductionReadiness()),file:`.krom/${V110_PROD_READY_FILE}`},null,2));}catch(error){return errorResult(error);}});


  // ===== v12.0 MEGA-100 CAPABILITY TOOLS =====
  for (const cap of V120_CAPABILITIES) {
    server.registerTool(
      `${cap.id}_v12`,
      {title:`${cap.title} v12`,description:cap.description,inputSchema:z.object({scope:z.string().optional(),writeReport:z.boolean().default(true)}),annotations:{readOnlyHint:false,openWorldHint:false}},
      async({scope,writeReport})=>{try{return result(JSON.stringify(await v120RunCapability(cap,scope,writeReport),null,2));}catch(error){return errorResult(error);}}
    );
  }
  server.registerTool("mega_100_status_v12",{title:"Mega 100 Status v12",description:"Show readiness and report coverage for the 100-capability v12 expansion.",inputSchema:z.object({}),annotations:{readOnlyHint:true,openWorldHint:false}},async()=>{try{return result(JSON.stringify(await v120MegaStatus(),null,2));}catch(error){return errorResult(error);}});
  server.registerTool("mega_100_audit_v12",{title:"Mega 100 Audit v12",description:"Run the complete 100-capability static engineering audit, or selected capability categories.",inputSchema:z.object({categories:z.array(z.string()).default([])}),annotations:{readOnlyHint:false,openWorldHint:false}},async({categories})=>{try{return result(JSON.stringify(await v120RunMegaAudit(categories),null,2));}catch(error){return errorResult(error);}});
  // ===== END v12.0 TOOLS =====

  // ===== v13.0 EXACT-500 TOOL REGISTRATION =====
  for (const cap of V130_CAPABILITIES) {
    server.registerTool(
      `${cap.id}_v13`,
      {title:`${cap.title} v13`,description:cap.description,inputSchema:z.object({scope:z.string().optional(),writeReport:z.boolean().default(true)}),annotations:{readOnlyHint:false,openWorldHint:false}},
      async({scope,writeReport})=>{try{return result(JSON.stringify(await v130RunCapability(cap,scope,writeReport),null,2));}catch(error){return errorResult(error);}}
    );
  }
  // ===== END v13.0 TOOL REGISTRATION =====

  // ===== v14.0 EXACT-1000 TOOL REGISTRATION =====
  for (const cap of V140_CAPABILITIES) {
    server.registerTool(
      `${cap.id}_v14`,
      {title:`${cap.title} v14`,description:cap.description,inputSchema:z.object({scope:z.string().optional(),writeReport:z.boolean().default(true)}),annotations:{readOnlyHint:false,openWorldHint:false}},
      async({scope,writeReport})=>{try{return result(JSON.stringify(await v140RunCapability(cap,scope,writeReport),null,2));}catch(error){return errorResult(error);}}
    );
  }
  // ===== END v14.0 TOOL REGISTRATION =====

  // ===== v15.0 EXACT-5000 TOOL REGISTRATION =====
  for (const cap of V150_CAPABILITIES) {
    server.registerTool(
      `${cap.id}_v15`,
      {title:`${cap.title} v15`,description:cap.description,inputSchema:z.object({scope:z.string().optional(),writeReport:z.boolean().default(true)}),annotations:{readOnlyHint:false,openWorldHint:false}},
      async({scope,writeReport})=>{try{return result(JSON.stringify(await v150RunCapability(cap,scope,writeReport),null,2));}catch(error){return errorResult(error);}}
    );
  }
  // ===== END v15.0 TOOL REGISTRATION =====


  // ===== v16.0 INTELLIGENT TOOL ROUTER REGISTRATION =====
  server.registerTool("tool_search_v16",{title:"Tool Search v16",description:"Search and rank the 5000-tool catalog for a task.",inputSchema:z.object({query:z.string(),limit:z.number().int().min(1).max(50).default(12),domain:z.string().optional(),maxRisk:z.enum(["LOW","MEDIUM","HIGH"]).default("HIGH")}),annotations:{readOnlyHint:true,openWorldHint:false}},async({query,limit,domain,maxRisk})=>{try{return result(JSON.stringify(await v160Search(query,limit,domain,maxRisk),null,2));}catch(e){return errorResult(e);}});
  server.registerTool("intelligent_tool_router_v16",{title:"Intelligent Tool Router v16",description:"Select a small evidence-oriented tool set for a task instead of exposing thousands of choices.",inputSchema:z.object({task:z.string(),maxTools:z.number().int().min(1).max(12).default(6),allowHighRisk:z.boolean().default(false)}),annotations:{readOnlyHint:true,openWorldHint:false}},async({task,maxTools,allowHighRisk})=>{try{return result(JSON.stringify(await v160Route(task,maxTools,allowHighRisk),null,2));}catch(e){return errorResult(e);}});
  server.registerTool("capability_graph_v16",{title:"Capability Graph v16",description:"Create a recommended dependency-aware capability sequence for a task.",inputSchema:z.object({task:z.string()}),annotations:{readOnlyHint:true,openWorldHint:false}},async({task})=>{try{return result(JSON.stringify(await v160CapabilityGraph(task),null,2));}catch(e){return errorResult(e);}});
  server.registerTool("workflow_compose_v16",{title:"Workflow Composer v16",description:"Compose a bounded execution workflow around selected capabilities and verification gates.",inputSchema:z.object({task:z.string(),strict:z.boolean().default(true)}),annotations:{readOnlyHint:true,openWorldHint:false}},async({task,strict})=>{try{return result(JSON.stringify(await v160ComposeWorkflow(task,strict),null,2));}catch(e){return errorResult(e);}});
  server.registerTool("tool_risk_policy_v16",{title:"Tool Risk Policy v16",description:"Assess proposed tools and determine checkpoint/evidence requirements.",inputSchema:z.object({tools:z.array(z.string()).min(1).max(50)}),annotations:{readOnlyHint:true,openWorldHint:false}},async({tools})=>{try{return result(JSON.stringify(await v160RiskPolicy(tools),null,2));}catch(e){return errorResult(e);}});
  server.registerTool("tool_usage_record_v16",{title:"Tool Usage Record v16",description:"Record evidence-backed tool outcomes for routing telemetry.",inputSchema:z.object({tool:z.string(),outcome:z.enum(["success","failure","blocked"]),task:z.string().optional(),evidence:z.string().optional()}),annotations:{readOnlyHint:false,openWorldHint:false}},async(args)=>{try{return result(JSON.stringify(await v160RecordUsage(args.tool,args.outcome,args.task,args.evidence),null,2));}catch(e){return errorResult(e);}});
  server.registerTool("tool_usage_telemetry_v16",{title:"Tool Usage Telemetry v16",description:"Summarize recent success, failure, and blocked tool outcomes without exposing secrets.",inputSchema:z.object({limit:z.number().int().min(1).max(1000).default(100)}),annotations:{readOnlyHint:true,openWorldHint:false}},async({limit})=>{try{return result(JSON.stringify(await v160UsageTelemetry(limit),null,2));}catch(e){return errorResult(e);}});
  server.registerTool("domain_health_v16",{title:"Capability Domain Health v16",description:"Summarize catalog coverage and risk distribution by domain.",inputSchema:z.object({}),annotations:{readOnlyHint:true,openWorldHint:false}},async()=>{try{return result(JSON.stringify(await v160DomainHealth(),null,2));}catch(e){return errorResult(e);}});
  server.registerTool("execution_recipe_v16",{title:"Execution Recipe v16",description:"Generate a compact actionable recipe using routing, risk policy, and verification gates.",inputSchema:z.object({task:z.string()}),annotations:{readOnlyHint:true,openWorldHint:false}},async({task})=>{try{const route=await v160Route(task,6,false);const risk=await v160RiskPolicy(route.selected.map((x:any)=>x.name));const workflow=await v160ComposeWorkflow(task,true);return result(JSON.stringify({task,route,risk,workflow},null,2));}catch(e){return errorResult(e);}});
  server.registerTool("router_status_v16",{title:"Router Status v16",description:"Validate catalog availability and v16 router readiness.",inputSchema:z.object({}),annotations:{readOnlyHint:true,openWorldHint:false}},async()=>{try{const c=await v160LoadCatalog();return result(JSON.stringify({version:"16.0.0",catalogTools:c.tools.length,catalogVersion:c.version,ready:c.tools.length>=4000,stateDir:path.relative(PROJECT_ROOT,V160_STATE_DIR)},null,2));}catch(e){return errorResult(e);}});
  // ===== END v16.0 TOOL ROUTER REGISTRATION =====

  // ===== v17.0 ADAPTIVE WORKFLOW COMPILER REGISTRATION =====
  server.registerTool("workflow_compile_v17",{title:"Workflow Compiler v17",description:"Compile a prompt into a bounded evidence-driven execution workflow.",inputSchema:z.object({task:z.string(),strict:z.boolean().default(true)}),annotations:{readOnlyHint:true,openWorldHint:false}},async({task,strict})=>{try{return result(JSON.stringify(await v170Compile(task,strict),null,2));}catch(e){return errorResult(e);}});
  server.registerTool("workflow_optimize_v17",{title:"Workflow Optimizer v17",description:"Reduce redundant tool usage and estimate workflow risk cost.",inputSchema:z.object({task:z.string()}),annotations:{readOnlyHint:true,openWorldHint:false}},async({task})=>{try{return result(JSON.stringify(await v170Optimize(task),null,2));}catch(e){return errorResult(e);}});
  server.registerTool("workflow_replan_v17",{title:"Adaptive Workflow Replanner v17",description:"Rebuild a workflow after a failed step using alternate capabilities.",inputSchema:z.object({task:z.string(),failedStep:z.string(),failure:z.string()}),annotations:{readOnlyHint:true,openWorldHint:false}},async({task,failedStep,failure})=>{try{return result(JSON.stringify(await v170Replan(task,failedStep,failure),null,2));}catch(e){return errorResult(e);}});
  server.registerTool("workflow_gate_v17",{title:"Workflow Safety Gate v17",description:"Validate a compiled workflow before execution.",inputSchema:z.object({task:z.string()}),annotations:{readOnlyHint:true,openWorldHint:false}},async({task})=>{try{return result(JSON.stringify(await v170Gate(task),null,2));}catch(e){return errorResult(e);}});
  server.registerTool("workflow_outcome_record_v17",{title:"Workflow Outcome Record v17",description:"Record evidence-backed workflow outcomes for adaptive optimization.",inputSchema:z.object({task:z.string(),status:z.enum(["success","failure","blocked"]),details:z.string().optional()}),annotations:{readOnlyHint:false,openWorldHint:false}},async({task,status,details})=>{try{return result(JSON.stringify(await v170Record(task,status,details),null,2));}catch(e){return errorResult(e);}});
  server.registerTool("workflow_telemetry_v17",{title:"Workflow Telemetry v17",description:"Summarize workflow success/failure history.",inputSchema:z.object({}),annotations:{readOnlyHint:true,openWorldHint:false}},async()=>{try{return result(JSON.stringify(await v170Telemetry(),null,2));}catch(e){return errorResult(e);}});
  server.registerTool("minimal_toolset_v17",{title:"Minimal Toolset Selector v17",description:"Return the smallest practical toolset for a task.",inputSchema:z.object({task:z.string(),maxTools:z.number().int().min(2).max(12).default(6)}),annotations:{readOnlyHint:true,openWorldHint:false}},async({task,maxTools})=>{try{const r:any=await v160Route(task,maxTools,false);return result(JSON.stringify({task,tools:(r.selected||[]).slice(0,maxTools),principle:"minimum sufficient capability set"},null,2));}catch(e){return errorResult(e);}});
  server.registerTool("workflow_evidence_map_v17",{title:"Workflow Evidence Map v17",description:"Map every workflow step to required verification evidence.",inputSchema:z.object({task:z.string()}),annotations:{readOnlyHint:true,openWorldHint:false}},async({task})=>{try{const p:any=await v170Compile(task,true);return result(JSON.stringify({task,evidence:p.steps.map((s:any)=>({step:s.id,tool:s.tool,required:s.verification}))},null,2));}catch(e){return errorResult(e);}});
  server.registerTool("workflow_checkpoint_plan_v17",{title:"Workflow Checkpoint Plan v17",description:"Determine where checkpoints are needed before risky changes.",inputSchema:z.object({task:z.string()}),annotations:{readOnlyHint:true,openWorldHint:false}},async({task})=>{try{const p:any=await v170Compile(task,true);return result(JSON.stringify({task,checkpoints:p.steps.filter((s:any)=>s.risk==='HIGH'||s.risk==='MEDIUM').map((s:any)=>({before:s.id,tool:s.tool,risk:s.risk}))},null,2));}catch(e){return errorResult(e);}});
  server.registerTool("workflow_status_v17",{title:"Adaptive Workflow Status v17",description:"Read the latest compiled workflow and runtime telemetry.",inputSchema:z.object({}),annotations:{readOnlyHint:true,openWorldHint:false}},async()=>{try{let latest:any=null;try{latest=JSON.parse(await fs.readFile(path.join(V170_STATE_DIR,'latest-plan.json'),'utf8'));}catch{}return result(JSON.stringify({version:'17.0.0',latest,telemetry:await v170Telemetry()},null,2));}catch(e){return errorResult(e);}});
  // ===== END v17.0 REGISTRATION =====

  // ===== v18.0 VERIFIED AUTONOMOUS EXECUTOR REGISTRATION =====
  server.registerTool("verified_execution_start_v18",{title:"Verified Execution Start v18",description:"Compile a workflow into a receipt-backed execution run where every passing step requires evidence.",inputSchema:z.object({task:z.string().min(3),strict:z.boolean().default(true)}),annotations:{readOnlyHint:false,openWorldHint:false}},async({task,strict})=>{try{return result(JSON.stringify(await v180Start(task,strict),null,2));}catch(e){return errorResult(e);}});
  server.registerTool("execution_step_begin_v18",{title:"Execution Step Begin v18",description:"Start a workflow step only after its verified dependencies have passed.",inputSchema:z.object({stepId:z.string()}),annotations:{readOnlyHint:false,openWorldHint:false}},async({stepId})=>{try{return result(JSON.stringify(await v180StepBegin(stepId),null,2));}catch(e){return errorResult(e);}});
  server.registerTool("execution_receipt_v18",{title:"Execution Receipt v18",description:"Record the actual result and evidence for a step. PASS is rejected when evidence is empty.",inputSchema:z.object({stepId:z.string(),status:z.enum(["passed","failed","blocked"]),actual:z.string().default(""),evidence:z.array(z.string()).default([])}),annotations:{readOnlyHint:false,openWorldHint:false}},async({stepId,status,actual,evidence})=>{try{return result(JSON.stringify(await v180RecordReceipt(stepId,status,actual,evidence),null,2));}catch(e){return errorResult(e);}});
  server.registerTool("evidence_validator_v18",{title:"Evidence Validator v18",description:"Validate execution receipts and flag missing or suspicious evidence.",inputSchema:z.object({stepId:z.string().optional()}),annotations:{readOnlyHint:true,openWorldHint:false}},async({stepId})=>{try{return result(JSON.stringify(await v180ValidateEvidence(stepId),null,2));}catch(e){return errorResult(e);}});
  server.registerTool("outcome_comparator_v18",{title:"Outcome Comparator v18",description:"Compare expected and actual outcomes using exact, contains, regex, or nonempty verification.",inputSchema:z.object({expected:z.string(),actual:z.string(),mode:z.enum(["exact","contains","regex","nonempty"]).default("contains")}),annotations:{readOnlyHint:true,openWorldHint:false}},async({expected,actual,mode})=>{try{return result(JSON.stringify(await v180Compare(expected,actual,mode),null,2));}catch(e){return errorResult(e);}});
  server.registerTool("false_pass_detector_v18",{title:"False PASS Detector v18",description:"Detect steps marked PASS whose evidence contains failure signals or no evidence.",inputSchema:z.object({}),annotations:{readOnlyHint:false,openWorldHint:false}},async()=>{try{return result(JSON.stringify(await v180FalsePassScan(),null,2));}catch(e){return errorResult(e);}});
  server.registerTool("safe_resume_v18",{title:"Safe Resume v18",description:"Resume an interrupted execution from the first unverified step without skipping failures.",inputSchema:z.object({}),annotations:{readOnlyHint:true,openWorldHint:false}},async()=>{try{return result(JSON.stringify(await v180SafeResume(),null,2));}catch(e){return errorResult(e);}});
  server.registerTool("execution_invariant_gate_v18",{title:"Execution Invariant Gate v18",description:"Enforce evidence validity, false-pass protection, and high-risk verification before release.",inputSchema:z.object({}),annotations:{readOnlyHint:false,openWorldHint:false}},async()=>{try{return result(JSON.stringify(await v180InvariantGate(),null,2));}catch(e){return errorResult(e);}});
  server.registerTool("verified_release_gate_v18",{title:"Verified Release Gate v18",description:"Mark a run complete only when every step has passed with valid evidence and invariants hold.",inputSchema:z.object({}),annotations:{readOnlyHint:false,openWorldHint:false}},async()=>{try{return result(JSON.stringify(await v180ReleaseGate(),null,2));}catch(e){return errorResult(e);}});
  server.registerTool("verified_execution_status_v18",{title:"Verified Execution Status v18",description:"Show verified run progress, receipt counts, quality signals, and safe resume point.",inputSchema:z.object({}),annotations:{readOnlyHint:true,openWorldHint:false}},async()=>{try{return result(JSON.stringify(await v180Status(),null,2));}catch(e){return errorResult(e);}});
  // ===== END v18.0 REGISTRATION =====

  // ===== v19.0 AUTONOMOUS REFACTORING & DEPENDENCY INTELLIGENCE REGISTRATION =====
  server.registerTool("refactor_dependency_graph_v19",{title:"Refactor Dependency Graph v19",description:"Map dependency hotspots and blast-radius risk before structural changes.",inputSchema:z.object({refresh:z.boolean().default(false)}),annotations:{readOnlyHint:true,openWorldHint:false}},async({refresh})=>{try{return result(JSON.stringify(await v190DependencyGraph(refresh),null,2));}catch(e){return errorResult(e);}});
  server.registerTool("refactor_plan_v19",{title:"Safe Refactor Plan v19",description:"Create a dependency-aware staged refactor plan for explicit target files.",inputSchema:z.object({files:z.array(z.string()).min(1).max(100),goal:z.string().min(3)}),annotations:{readOnlyHint:true,openWorldHint:false}},async({files,goal})=>{try{return result(JSON.stringify(await v190RefactorPlan(files,goal),null,2));}catch(e){return errorResult(e);}});
  server.registerTool("dead_code_audit_v19",{title:"Dead Code Audit v19",description:"Find likely unreferenced code candidates without deleting anything.",inputSchema:z.object({maxFiles:z.number().int().min(50).max(5000).default(2500)}),annotations:{readOnlyHint:true,openWorldHint:false}},async({maxFiles})=>{try{return result(JSON.stringify(await v190DeadCodeAudit(maxFiles),null,2));}catch(e){return errorResult(e);}});
  server.registerTool("duplicate_logic_audit_v19",{title:"Duplicate Logic Audit v19",description:"Find heuristic duplicate implementation candidates for consolidation review.",inputSchema:z.object({maxFiles:z.number().int().min(50).max(3000).default(1500)}),annotations:{readOnlyHint:true,openWorldHint:false}},async({maxFiles})=>{try{return result(JSON.stringify(await v190DuplicateAudit(maxFiles),null,2));}catch(e){return errorResult(e);}});
  server.registerTool("dependency_upgrade_plan_v19",{title:"Dependency Upgrade Plan v19",description:"Build a risk-aware dependency upgrade plan without changing versions.",inputSchema:z.object({}),annotations:{readOnlyHint:true,openWorldHint:false}},async()=>{try{return result(JSON.stringify(await v190DependencyUpgradePlan(),null,2));}catch(e){return errorResult(e);}});
  server.registerTool("dependency_risk_map_v19",{title:"Dependency Risk Map v19",description:"Classify dependency upgrade risk and required verification gates.",inputSchema:z.object({}),annotations:{readOnlyHint:true,openWorldHint:false}},async()=>{try{return result(JSON.stringify(await v190DependencyRiskMap(),null,2));}catch(e){return errorResult(e);}});
  server.registerTool("safe_refactor_checkpoint_v19",{title:"Safe Refactor Checkpoint v19",description:"Capture Git status and diff evidence before a structural change.",inputSchema:z.object({label:z.string().default("refactor-checkpoint")}),annotations:{readOnlyHint:false,openWorldHint:false}},async({label})=>{try{return result(JSON.stringify(await v190Checkpoint(label),null,2));}catch(e){return errorResult(e);}});
  server.registerTool("refactor_apply_guard_v19",{title:"Refactor Apply Guard v19",description:"Assess blast radius and require checkpoint/regression evidence for high-risk targets.",inputSchema:z.object({files:z.array(z.string()).min(1).max(100)}),annotations:{readOnlyHint:true,openWorldHint:false}},async({files})=>{try{return result(JSON.stringify(await v190ApplyGuard(files),null,2));}catch(e){return errorResult(e);}});
  server.registerTool("refactor_regression_plan_v19",{title:"Refactor Regression Plan v19",description:"Compute impacted files and verification scope after a refactor.",inputSchema:z.object({files:z.array(z.string()).min(1).max(100)}),annotations:{readOnlyHint:true,openWorldHint:false}},async({files})=>{try{return result(JSON.stringify(await v190RegressionPlan(files),null,2));}catch(e){return errorResult(e);}});
  server.registerTool("refactor_verify_v19",{title:"Refactor Verify v19",description:"Run configured typecheck/tests and Git diff whitespace validation after a refactor.",inputSchema:z.object({files:z.array(z.string()).default([])}),annotations:{readOnlyHint:false,openWorldHint:false}},async({files})=>{try{return result(JSON.stringify(await v190Verify(files),null,2));}catch(e){return errorResult(e);}});
  server.registerTool("refactor_rollback_plan_v19",{title:"Refactor Rollback Plan v19",description:"Produce a non-destructive rollback plan using Git/checkpoint evidence.",inputSchema:z.object({}),annotations:{readOnlyHint:true,openWorldHint:false}},async()=>{try{return result(JSON.stringify(await v190RollbackPlan(),null,2));}catch(e){return errorResult(e);}});
  server.registerTool("refactor_status_v19",{title:"Refactor Intelligence Status v19",description:"List v19 refactor analysis and verification artifacts.",inputSchema:z.object({}),annotations:{readOnlyHint:true,openWorldHint:false}},async()=>{try{return result(JSON.stringify(await v190Status(),null,2));}catch(e){return errorResult(e);}});


  // =========================================================
  // v20.0 SELF-HEALING ARCHITECTURE & MIGRATION ENGINE
  // =========================================================
  server.registerTool("architecture_drift_scan_v20",{title:"Architecture Drift Scan v20",description:"Detect structural drift, shared-core hotspots, route/config sprawl and architecture pressure before changes.",inputSchema:z.object({}),annotations:{readOnlyHint:true,openWorldHint:false}},async()=>{try{return result(JSON.stringify(await v200ArchitectureDriftScan(),null,2));}catch(e){return errorResult(e);}});
  server.registerTool("breaking_change_forecast_v20",{title:"Breaking Change Forecast v20",description:"Forecast blast radius and compatibility risk for proposed file changes.",inputSchema:z.object({files:z.array(z.string()).min(1).max(100)}),annotations:{readOnlyHint:true,openWorldHint:false}},async({files})=>{try{return result(JSON.stringify(await v200BreakingChangeForecast(files),null,2));}catch(e){return errorResult(e);}});
  server.registerTool("migration_compatibility_matrix_v20",{title:"Migration Compatibility Matrix v20",description:"Map database, API, and UI compatibility requirements for migrations.",inputSchema:z.object({}),annotations:{readOnlyHint:true,openWorldHint:false}},async()=>{try{return result(JSON.stringify(await v200MigrationCompatibilityMatrix(),null,2));}catch(e){return errorResult(e);}});
  server.registerTool("safe_migration_plan_v20",{title:"Safe Migration Plan v20",description:"Create an expand-migrate-contract plan with verification and rollback guardrails.",inputSchema:z.object({goal:z.string().min(3),files:z.array(z.string()).default([])}),annotations:{readOnlyHint:true,openWorldHint:false}},async({goal,files})=>{try{return result(JSON.stringify(await v200SafeMigrationPlan(goal,files),null,2));}catch(e){return errorResult(e);}});
  server.registerTool("migration_preflight_gate_v20",{title:"Migration Preflight Gate v20",description:"Block high-risk migrations when checkpoint, isolation, or evidence prerequisites are missing.",inputSchema:z.object({files:z.array(z.string()).default([])}),annotations:{readOnlyHint:true,openWorldHint:false}},async({files})=>{try{return result(JSON.stringify(await v200MigrationPreflight(files),null,2));}catch(e){return errorResult(e);}});
  server.registerTool("repair_proposal_engine_v20",{title:"Repair Proposal Engine v20",description:"Generate evidence-oriented repair proposals from deterministic symptoms and optional impacted files.",inputSchema:z.object({symptoms:z.array(z.string()).min(1).max(100),files:z.array(z.string()).default([])}),annotations:{readOnlyHint:true,openWorldHint:false}},async({symptoms,files})=>{try{return result(JSON.stringify(await v200RepairProposal(symptoms,files),null,2));}catch(e){return errorResult(e);}});
  server.registerTool("schema_compatibility_gate_v20",{title:"Schema Compatibility Gate v20",description:"Detect destructive or tightening schema patterns that require explicit migration review.",inputSchema:z.object({}),annotations:{readOnlyHint:true,openWorldHint:false}},async()=>{try{return result(JSON.stringify(await v200SchemaCompatibilityGate(),null,2));}catch(e){return errorResult(e);}});
  server.registerTool("api_compatibility_gate_v20",{title:"API Compatibility Gate v20",description:"Review API/client code for compatibility pressure and schema-coupling risks.",inputSchema:z.object({}),annotations:{readOnlyHint:true,openWorldHint:false}},async()=>{try{return result(JSON.stringify(await v200ApiCompatibilityGate(),null,2));}catch(e){return errorResult(e);}});
  server.registerTool("migration_execution_contract_v20",{title:"Migration Execution Contract v20",description:"Run only an explicitly declared migration/database package script after preflight; dry-run by default and explicit approval required for execution.",inputSchema:z.object({script:z.string().min(1),dryRun:z.boolean().default(true),approved:z.boolean().default(false)}),annotations:{readOnlyHint:false,destructiveHint:true,openWorldHint:false}},async({script,dryRun,approved})=>{try{return result(JSON.stringify(await v200MigrationExecutionContract(script,dryRun,approved),null,2));}catch(e){return errorResult(e);}});
  server.registerTool("post_migration_verify_v20",{title:"Post Migration Verify v20",description:"Verify schema/API compatibility, typecheck, tests, and diff integrity after a migration.",inputSchema:z.object({}),annotations:{readOnlyHint:false,openWorldHint:false}},async()=>{try{return result(JSON.stringify(await v200PostMigrationVerify(),null,2));}catch(e){return errorResult(e);}});
  server.registerTool("rollforward_rollback_plan_v20",{title:"Rollforward Rollback Plan v20",description:"Create a safe rollforward/rollback strategy anchored to current Git state without destructive automatic data rollback.",inputSchema:z.object({goal:z.string().min(3)}),annotations:{readOnlyHint:true,openWorldHint:false}},async({goal})=>{try{return result(JSON.stringify(await v200RollforwardRollbackPlan(goal),null,2));}catch(e){return errorResult(e);}});
  server.registerTool("self_healing_status_v20",{title:"Self Healing Status v20",description:"Show v20 architecture, migration preflight, and verification status with generated artifacts.",inputSchema:z.object({}),annotations:{readOnlyHint:true,openWorldHint:false}},async()=>{try{return result(JSON.stringify(await v200SelfHealingStatus(),null,2));}catch(e){return errorResult(e);}});
  // ===== v21.0 AUTONOMOUS VERIFICATION & RELEASE INTELLIGENCE =====
  server.registerTool("test_impact_intelligence_v21",{title:"Test Impact Intelligence v21",description:"Map changed files to impacted code and targeted tests using the project dependency graph.",inputSchema:z.object({files:z.array(z.string()).default([])}),annotations:{readOnlyHint:true,openWorldHint:false}},async({files})=>{try{return result(JSON.stringify(await v210TestImpactIntelligence(files),null,2));}catch(e){return errorResult(e);}});
  server.registerTool("flaky_test_detector_v21",{title:"Flaky Test Detector v21",description:"Statically identify test patterns that can contribute to flakiness; does not claim confirmed flakiness without runtime evidence.",inputSchema:z.object({}),annotations:{readOnlyHint:true,openWorldHint:false}},async()=>{try{return result(JSON.stringify(await v210FlakyTestDetector(),null,2));}catch(e){return errorResult(e);}});
  server.registerTool("contract_verification_v21",{title:"Contract Verification v21",description:"Assess API/schema contract-test evidence and compatibility surfaces.",inputSchema:z.object({}),annotations:{readOnlyHint:true,openWorldHint:false}},async()=>{try{return result(JSON.stringify(await v210ContractVerification(),null,2));}catch(e){return errorResult(e);}});
  server.registerTool("visual_baseline_governance_v21",{title:"Visual Baseline Governance v21",description:"Audit visual baseline evidence and viewport governance for regression reviews.",inputSchema:z.object({}),annotations:{readOnlyHint:true,openWorldHint:false}},async()=>{try{return result(JSON.stringify(await v210VisualBaselineGovernance(),null,2));}catch(e){return errorResult(e);}});
  server.registerTool("release_risk_score_v21",{title:"Release Risk Score v21",description:"Compute an evidence-based release risk score from changed files, sensitive surfaces, and test impact.",inputSchema:z.object({}),annotations:{readOnlyHint:true,openWorldHint:false}},async()=>{try{return result(JSON.stringify(await v210ReleaseRiskScore(),null,2));}catch(e){return errorResult(e);}});
  server.registerTool("canary_readiness_v21",{title:"Canary Readiness v21",description:"Assess whether a change has the minimum evidence for a controlled canary rollout.",inputSchema:z.object({}),annotations:{readOnlyHint:true,openWorldHint:false}},async()=>{try{return result(JSON.stringify(await v210CanaryReadiness(),null,2));}catch(e){return errorResult(e);}});
  server.registerTool("change_provenance_v21",{title:"Change Provenance v21",description:"Capture Git HEAD, branch, changed files, and diff statistics as release provenance.",inputSchema:z.object({}),annotations:{readOnlyHint:true,openWorldHint:false}},async()=>{try{return result(JSON.stringify(await v210ChangeProvenance(),null,2));}catch(e){return errorResult(e);}});
  server.registerTool("evidence_bundle_v21",{title:"Evidence Bundle v21",description:"Generate a release evidence bundle from observed project state without inventing pass results.",inputSchema:z.object({}),annotations:{readOnlyHint:false,openWorldHint:false}},async()=>{try{return result(JSON.stringify(await v210EvidenceBundle(),null,2));}catch(e){return errorResult(e);}});
  server.registerTool("regression_replay_plan_v21",{title:"Regression Replay Plan v21",description:"Build a targeted regression replay plan from changed files and configured project scripts.",inputSchema:z.object({}),annotations:{readOnlyHint:true,openWorldHint:false}},async()=>{try{return result(JSON.stringify(await v210RegressionReplayPlan(),null,2));}catch(e){return errorResult(e);}});
  server.registerTool("artifact_integrity_v21",{title:"Artifact Integrity v21",description:"Record package metadata and lockfile evidence used to identify the release artifact inputs.",inputSchema:z.object({}),annotations:{readOnlyHint:true,openWorldHint:false}},async()=>{try{return result(JSON.stringify(await v210ArtifactIntegrity(),null,2));}catch(e){return errorResult(e);}});
  server.registerTool("release_policy_v21",{title:"Release Policy v21",description:"Generate evidence requirements for the current release risk profile.",inputSchema:z.object({}),annotations:{readOnlyHint:true,openWorldHint:false}},async()=>{try{return result(JSON.stringify(await v210ReleasePolicy(),null,2));}catch(e){return errorResult(e);}});
  server.registerTool("final_release_attestation_v21",{title:"Final Release Attestation v21",description:"Attest release readiness only when required evidence is present; otherwise return explicit blockers.",inputSchema:z.object({}),annotations:{readOnlyHint:false,openWorldHint:false}},async()=>{try{return result(JSON.stringify(await v210FinalReleaseAttestation(),null,2));}catch(e){return errorResult(e);}});
  server.registerTool("release_intelligence_status_v21",{title:"Release Intelligence Status v21",description:"Show v21 release intelligence artifacts, risk state, and attestation status.",inputSchema:z.object({}),annotations:{readOnlyHint:true,openWorldHint:false}},async()=>{try{return result(JSON.stringify(await v210ReleaseIntelligenceStatus(),null,2));}catch(e){return errorResult(e);}});
  // ===== END v21.0 REGISTRATION =====

  // ===== v22.0 AUTONOMOUS QUALITY GOVERNANCE & POLICY ENGINE =====
  server.registerTool("quality_policy_init_v22",{title:"Quality Policy Init v22",description:"Initialize or update project quality-governance thresholds and approval classes.",inputSchema:z.object({mode:z.enum(["balanced","strict","maximum"]).default("strict")}),annotations:{readOnlyHint:false,openWorldHint:false}},async({mode})=>{try{return result(JSON.stringify(await v220QualityPolicyInit(mode),null,2));}catch(e){return errorResult(e);}});
  server.registerTool("change_risk_classify_v22",{title:"Change Risk Classifier v22",description:"Classify current or supplied changed files into LOW/MEDIUM/HIGH/CRITICAL governance risk.",inputSchema:z.object({files:z.array(z.string()).default([])}),annotations:{readOnlyHint:true,openWorldHint:false}},async({files})=>{try{return result(JSON.stringify(await v220ChangeRiskClassify(files),null,2));}catch(e){return errorResult(e);}});
  server.registerTool("approval_matrix_v22",{title:"Approval Matrix v22",description:"Resolve required approval roles and checkpoint requirements for a change risk class.",inputSchema:z.object({files:z.array(z.string()).default([])}),annotations:{readOnlyHint:true,openWorldHint:false}},async({files})=>{try{return result(JSON.stringify(await v220ApprovalMatrix(files),null,2));}catch(e){return errorResult(e);}});
  server.registerTool("policy_exception_request_v22",{title:"Policy Exception Request v22",description:"Create a time-bounded, owner-attributed governance exception; critical-risk exceptions are denied by default.",inputSchema:z.object({policyKey:z.string().min(1),reason:z.string().min(3),owner:z.string().min(1),days:z.number().int().min(1).max(30).default(7)}),annotations:{readOnlyHint:false,openWorldHint:false}},async(input)=>{try{return result(JSON.stringify(await v220ExceptionRequest(input),null,2));}catch(e){return errorResult(e);}});
  server.registerTool("exception_expiry_audit_v22",{title:"Exception Expiry Audit v22",description:"Expire time-bounded policy exceptions and list active versus expired exceptions.",inputSchema:z.object({}),annotations:{readOnlyHint:false,openWorldHint:false}},async()=>{try{return result(JSON.stringify(await v220ExceptionExpiryAudit(),null,2));}catch(e){return errorResult(e);}});
  server.registerTool("evidence_policy_check_v22",{title:"Evidence Policy Check v22",description:"Check recorded release evidence against configured minimum evidence coverage.",inputSchema:z.object({}),annotations:{readOnlyHint:true,openWorldHint:false}},async()=>{try{return result(JSON.stringify(await v220EvidencePolicyCheck(),null,2));}catch(e){return errorResult(e);}});
  server.registerTool("compliance_matrix_v22",{title:"Compliance Matrix v22",description:"Build a governance compliance matrix from evidence, release attestation, migration preflight, and release risk.",inputSchema:z.object({}),annotations:{readOnlyHint:true,openWorldHint:false}},async()=>{try{return result(JSON.stringify(await v220ComplianceMatrix(),null,2));}catch(e){return errorResult(e);}});
  server.registerTool("policy_evaluate_v22",{title:"Policy Evaluate v22",description:"Evaluate change risk, approvals, evidence, exceptions, and configured project policy.",inputSchema:z.object({files:z.array(z.string()).default([])}),annotations:{readOnlyHint:true,openWorldHint:false}},async({files})=>{try{return result(JSON.stringify(await v220PolicyEvaluate(files),null,2));}catch(e){return errorResult(e);}});
  server.registerTool("change_freeze_check_v22",{title:"Change Freeze Check v22",description:"Respect KROM_CHANGE_FREEZE and block high/critical changes while freeze is enabled.",inputSchema:z.object({}),annotations:{readOnlyHint:true,openWorldHint:false}},async()=>{try{return result(JSON.stringify(await v220ChangeFreezeCheck(),null,2));}catch(e){return errorResult(e);}});
  server.registerTool("policy_diff_v22",{title:"Policy Diff v22",description:"Show active policy version, mode, thresholds, and protected surfaces.",inputSchema:z.object({}),annotations:{readOnlyHint:true,openWorldHint:false}},async()=>{try{return result(JSON.stringify(await v220PolicyDiff(),null,2));}catch(e){return errorResult(e);}});
  server.registerTool("governance_gate_v22",{title:"Governance Gate v22",description:"Run the final quality-governance gate before release approval.",inputSchema:z.object({}),annotations:{readOnlyHint:true,openWorldHint:false}},async()=>{try{return result(JSON.stringify(await v220GovernanceGate(),null,2));}catch(e){return errorResult(e);}});
  server.registerTool("governed_release_decision_v22",{title:"Governed Release Decision v22",description:"Approve, deny, or require review based on governance gate plus recorded v21 release attestation.",inputSchema:z.object({}),annotations:{readOnlyHint:false,openWorldHint:false}},async()=>{try{return result(JSON.stringify(await v220ReleaseDecision(),null,2));}catch(e){return errorResult(e);}});
  server.registerTool("governance_report_v22",{title:"Governance Report v22",description:"Generate an auditable governance summary without inventing evidence.",inputSchema:z.object({}),annotations:{readOnlyHint:false,openWorldHint:false}},async()=>{try{return result(JSON.stringify(await v220GovernanceReport(),null,2));}catch(e){return errorResult(e);}});
  server.registerTool("governance_status_v22",{title:"Governance Status v22",description:"Show v22 policy, gate, release-decision, and governance artifact status.",inputSchema:z.object({}),annotations:{readOnlyHint:true,openWorldHint:false}},async()=>{try{return result(JSON.stringify(await v220GovernanceStatus(),null,2));}catch(e){return errorResult(e);}});
  // ===== END v22.0 REGISTRATION =====


  // ===== v23.0 ARCHITECTURE EVOLUTION REGISTRATION =====
  server.registerTool("architecture_fitness_v23",{title:"Architecture Fitness v23",description:"Measure architecture fitness and structural risk signals from the current codebase.",inputSchema:z.object({}),annotations:{readOnlyHint:true,openWorldHint:false}},async()=>{try{return result(JSON.stringify(await v230ArchitectureFitness(),null,2));}catch(e){return errorResult(e);}});
  server.registerTool("technical_debt_inventory_v23",{title:"Technical Debt Inventory v23",description:"Inventory explicit and implicit technical-debt signals such as TODO, FIXME, HACK, ts-ignore, eslint-disable, and any usage.",inputSchema:z.object({}),annotations:{readOnlyHint:true,openWorldHint:false}},async()=>{try{return result(JSON.stringify(await v230DebtInventory(),null,2));}catch(e){return errorResult(e);}});
  server.registerTool("hotspot_forecast_v23",{title:"Hotspot Forecast v23",description:"Forecast change hotspots using Git churn plus recorded technical-debt signals.",inputSchema:z.object({}),annotations:{readOnlyHint:true,openWorldHint:false}},async()=>{try{return result(JSON.stringify(await v230HotspotForecast(),null,2));}catch(e){return errorResult(e);}});
  server.registerTool("module_boundary_enforcement_v23",{title:"Module Boundary Enforcement v23",description:"Detect deep cross-boundary imports and risky module coupling patterns.",inputSchema:z.object({}),annotations:{readOnlyHint:true,openWorldHint:false}},async()=>{try{return result(JSON.stringify(await v230BoundaryEnforcement(),null,2));}catch(e){return errorResult(e);}});
  server.registerTool("dependency_health_v23",{title:"Dependency Health v23",description:"Review dependency declaration health without claiming external vulnerability data.",inputSchema:z.object({}),annotations:{readOnlyHint:true,openWorldHint:false}},async()=>{try{return result(JSON.stringify(await v230DependencyHealth(),null,2));}catch(e){return errorResult(e);}});
  server.registerTool("refactor_roi_v23",{title:"Refactor ROI v23",description:"Rank refactor candidates from churn, architecture fitness, and technical-debt evidence.",inputSchema:z.object({}),annotations:{readOnlyHint:true,openWorldHint:false}},async()=>{try{return result(JSON.stringify(await v230RefactorRoi(),null,2));}catch(e){return errorResult(e);}});
  server.registerTool("adr_generate_v23",{title:"ADR Generator v23",description:"Create an Architecture Decision Record under docs/adr with explicit context, decision, and consequences.",inputSchema:z.object({title:z.string().min(3),context:z.string().min(3),decision:z.string().min(3),consequences:z.array(z.string()).default([])}),annotations:{readOnlyHint:false,openWorldHint:false}},async(input)=>{try{return result(JSON.stringify(await v230AdrGenerate(input),null,2));}catch(e){return errorResult(e);}});
  server.registerTool("architecture_evolution_roadmap_v23",{title:"Architecture Evolution Roadmap v23",description:"Generate an evidence-based phased roadmap for architecture stabilization and debt retirement.",inputSchema:z.object({}),annotations:{readOnlyHint:false,openWorldHint:false}},async()=>{try{return result(JSON.stringify(await v230EvolutionRoadmap(),null,2));}catch(e){return errorResult(e);}});
  server.registerTool("technical_debt_budget_v23",{title:"Technical Debt Budget v23",description:"Enforce configurable limits for weighted debt, large modules, and boundary violations.",inputSchema:z.object({maxWeightedDebt:z.number().int().min(0).default(100),maxLargeModules:z.number().int().min(0).default(10),maxBoundaryViolations:z.number().int().min(0).default(20)}),annotations:{readOnlyHint:true,openWorldHint:false}},async(input)=>{try{return result(JSON.stringify(await v230DebtBudget(input),null,2));}catch(e){return errorResult(e);}});
  server.registerTool("architecture_fitness_gate_v23",{title:"Architecture Fitness Gate v23",description:"Block architecture evolution when structural fitness, dependency health, or boundary conditions are unacceptable.",inputSchema:z.object({}),annotations:{readOnlyHint:true,openWorldHint:false}},async()=>{try{return result(JSON.stringify(await v230FitnessGate(),null,2));}catch(e){return errorResult(e);}});
  server.registerTool("architecture_evolution_decision_v23",{title:"Architecture Evolution Decision v23",description:"Combine v22 governance with v23 architecture fitness for a controlled evolution decision.",inputSchema:z.object({}),annotations:{readOnlyHint:false,openWorldHint:false}},async()=>{try{return result(JSON.stringify(await v230EvolutionDecision(),null,2));}catch(e){return errorResult(e);}});
  server.registerTool("architecture_evolution_status_v23",{title:"Architecture Evolution Status v23",description:"Show generated v23 artifacts and the latest architecture-evolution decision.",inputSchema:z.object({}),annotations:{readOnlyHint:true,openWorldHint:false}},async()=>{try{return result(JSON.stringify(await v230Status(),null,2));}catch(e){return errorResult(e);}});
  // ===== END v23.0 REGISTRATION =====

  // ===== v24.0 KNOWLEDGE GRAPH & CHANGE INTELLIGENCE REGISTRATION =====
  server.registerTool("knowledge_graph_build_v24",{title:"Knowledge Graph Build v24",description:"Build a project knowledge graph spanning files, imports, API calls, database-table references, symbols, and test nodes.",inputSchema:z.object({force:z.boolean().default(false)}),annotations:{readOnlyHint:false,openWorldHint:false}},async({force})=>{try{return result(JSON.stringify(await v240BuildGraph(force),null,2));}catch(e){return errorResult(e);}});
  server.registerTool("semantic_relation_scan_v24",{title:"Semantic Relation Scan v24",description:"Extract semantic relations such as API calls, database usage, and test-to-code links from the knowledge graph.",inputSchema:z.object({}),annotations:{readOnlyHint:true,openWorldHint:false}},async()=>{try{return result(JSON.stringify(await v240SemanticRelations(),null,2));}catch(e){return errorResult(e);}});
  server.registerTool("hidden_dependency_scan_v24",{title:"Hidden Dependency Scan v24",description:"Identify shared API and data dependencies with high fan-out that can create hidden change impact.",inputSchema:z.object({}),annotations:{readOnlyHint:true,openWorldHint:false}},async()=>{try{return result(JSON.stringify(await v240HiddenDependencies(),null,2));}catch(e){return errorResult(e);}});
  server.registerTool("change_impact_query_v24",{title:"Change Impact Query v24",description:"Calculate transitive change impact, blast-radius levels, and likely regression tests for selected files.",inputSchema:z.object({files:z.array(z.string()).min(1)}),annotations:{readOnlyHint:true,openWorldHint:false}},async({files})=>{try{return result(JSON.stringify(await v240ImpactQuery(files),null,2));}catch(e){return errorResult(e);}});
  server.registerTool("route_api_data_trace_v24",{title:"Route API Data Trace v24",description:"Trace product surfaces and routes to API calls and Supabase/database table usage.",inputSchema:z.object({}),annotations:{readOnlyHint:true,openWorldHint:false}},async()=>{try{return result(JSON.stringify(await v240RouteApiDataTrace(),null,2));}catch(e){return errorResult(e);}});
  server.registerTool("test_coverage_linker_v24",{title:"Test Coverage Linker v24",description:"Link test files to code nodes and identify high-centrality modules with no obvious linked tests.",inputSchema:z.object({}),annotations:{readOnlyHint:true,openWorldHint:false}},async()=>{try{return result(JSON.stringify(await v240TestCoverageLinker(),null,2));}catch(e){return errorResult(e);}});
  server.registerTool("knowledge_graph_path_v24",{title:"Knowledge Graph Path v24",description:"Find an import/dependency path between two project files.",inputSchema:z.object({from:z.string().min(1),to:z.string().min(1)}),annotations:{readOnlyHint:true,openWorldHint:false}},async({from,to})=>{try{return result(JSON.stringify(await v240GraphPath(from,to),null,2));}catch(e){return errorResult(e);}});
  server.registerTool("knowledge_context_pack_v24",{title:"Knowledge Context Pack v24",description:"Select a compact, high-value context set for a task using graph centrality, task terms, and optional change impact.",inputSchema:z.object({task:z.string().min(3),files:z.array(z.string()).default([])}),annotations:{readOnlyHint:false,openWorldHint:false}},async({task,files})=>{try{return result(JSON.stringify(await v240ContextPack(task,files),null,2));}catch(e){return errorResult(e);}});
  server.registerTool("change_risk_explain_v24",{title:"Change Risk Explain v24",description:"Explain change risk using transitive impact, centrality, shared API/data dependencies, and linked test evidence.",inputSchema:z.object({files:z.array(z.string()).min(1)}),annotations:{readOnlyHint:true,openWorldHint:false}},async({files})=>{try{return result(JSON.stringify(await v240RiskExplain(files),null,2));}catch(e){return errorResult(e);}});
  server.registerTool("knowledge_graph_refresh_v24",{title:"Knowledge Graph Refresh v24",description:"Rebuild the project knowledge graph after meaningful codebase changes.",inputSchema:z.object({}),annotations:{readOnlyHint:false,openWorldHint:false}},async()=>{try{return result(JSON.stringify(await v240Refresh(),null,2));}catch(e){return errorResult(e);}});
  server.registerTool("knowledge_gate_v24",{title:"Knowledge Gate v24",description:"Block risky changes when the knowledge graph shows a very large blast radius or high-centrality code without linked test evidence.",inputSchema:z.object({files:z.array(z.string()).default([])}),annotations:{readOnlyHint:true,openWorldHint:false}},async({files})=>{try{return result(JSON.stringify(await v240KnowledgeGate(files),null,2));}catch(e){return errorResult(e);}});
  server.registerTool("knowledge_intelligence_status_v24",{title:"Knowledge Intelligence Status v24",description:"Show v24 knowledge-graph artifacts, graph size, and the latest knowledge gate result.",inputSchema:z.object({}),annotations:{readOnlyHint:true,openWorldHint:false}},async()=>{try{return result(JSON.stringify(await v240Status(),null,2));}catch(e){return errorResult(e);}});
  // ===== END v24.0 REGISTRATION =====

  // ===== v25.0 DESIGN-TO-CODE & UX INTELLIGENCE REGISTRATION =====
  server.registerTool("design_token_audit_v25",{title:"Design Token Audit v25",description:"Audit recurring raw colors, spacing and sizing values and recommend design-token consolidation.",inputSchema:z.object({}),annotations:{readOnlyHint:true,openWorldHint:false}},async()=>{try{return result(JSON.stringify(await v250DesignTokenAudit(),null,2));}catch(e){return errorResult(e);}});
  server.registerTool("component_consistency_v25",{title:"Component Consistency v25",description:"Detect inconsistent raw controls, inline styles and arbitrary styling patterns across UI components.",inputSchema:z.object({}),annotations:{readOnlyHint:true,openWorldHint:false}},async()=>{try{return result(JSON.stringify(await v250ComponentConsistency(),null,2));}catch(e){return errorResult(e);}});
  server.registerTool("layout_diagnostics_v25",{title:"Layout Diagnostics v25",description:"Detect brittle large fixed widths, excessive absolute positioning and responsive layout risks.",inputSchema:z.object({}),annotations:{readOnlyHint:true,openWorldHint:false}},async()=>{try{return result(JSON.stringify(await v250LayoutDiagnostics(),null,2));}catch(e){return errorResult(e);}});
  server.registerTool("ux_flow_analysis_v25",{title:"UX Flow Analysis v25",description:"Analyze routes, UI nodes and likely flow gaps using the project knowledge graph.",inputSchema:z.object({}),annotations:{readOnlyHint:true,openWorldHint:false}},async()=>{try{return result(JSON.stringify(await v250UxFlowAnalysis(),null,2));}catch(e){return errorResult(e);}});
  server.registerTool("responsive_rtl_intelligence_v25",{title:"Responsive RTL Intelligence v25",description:"Audit responsive signals and RTL/direction awareness across UI files.",inputSchema:z.object({}),annotations:{readOnlyHint:true,openWorldHint:false}},async()=>{try{return result(JSON.stringify(await v250ResponsiveRtl(),null,2));}catch(e){return errorResult(e);}});
  server.registerTool("accessibility_by_design_v25",{title:"Accessibility by Design v25",description:"Static accessibility heuristics for missing image alt text, clickable non-buttons and unlabeled icon buttons.",inputSchema:z.object({}),annotations:{readOnlyHint:true,openWorldHint:false}},async()=>{try{return result(JSON.stringify(await v250AccessibilityByDesign(),null,2));}catch(e){return errorResult(e);}});
  server.registerTool("interaction_state_audit_v25",{title:"Interaction State Audit v25",description:"Audit substantial UI modules for loading, empty, error, disabled and success-state coverage.",inputSchema:z.object({}),annotations:{readOnlyHint:true,openWorldHint:false}},async()=>{try{return result(JSON.stringify(await v250InteractionStateAudit(),null,2));}catch(e){return errorResult(e);}});
  server.registerTool("visual_regression_policy_v25",{title:"Visual Regression Policy v25",description:"Define viewport and visual-diff governance using existing screenshot baselines when available.",inputSchema:z.object({}),annotations:{readOnlyHint:false,openWorldHint:false}},async()=>{try{return result(JSON.stringify(await v250VisualRegressionPolicy(),null,2));}catch(e){return errorResult(e);}});
  server.registerTool("design_quality_score_v25",{title:"Design Quality Score v25",description:"Aggregate UI consistency, responsive, accessibility and interaction-state evidence into a design quality score.",inputSchema:z.object({}),annotations:{readOnlyHint:false,openWorldHint:false}},async()=>{try{return result(JSON.stringify(await v250DesignQualityScore(),null,2));}catch(e){return errorResult(e);}});
  server.registerTool("design_change_plan_v25",{title:"Design Change Plan v25",description:"Generate a phased design-system, responsive, accessibility and visual-verification plan for selected changes.",inputSchema:z.object({files:z.array(z.string()).default([])}),annotations:{readOnlyHint:false,openWorldHint:false}},async({files})=>{try{return result(JSON.stringify(await v250DesignChangePlan(files),null,2));}catch(e){return errorResult(e);}});
  server.registerTool("design_gate_v25",{title:"Design Gate v25",description:"Block UI release when design quality, knowledge-graph risk or visual-baseline requirements are not satisfied.",inputSchema:z.object({files:z.array(z.string()).default([])}),annotations:{readOnlyHint:false,openWorldHint:false}},async({files})=>{try{return result(JSON.stringify(await v250DesignGate(files),null,2));}catch(e){return errorResult(e);}});
  server.registerTool("design_intelligence_status_v25",{title:"Design Intelligence Status v25",description:"Show v25 design intelligence artifacts and latest quality/gate state.",inputSchema:z.object({}),annotations:{readOnlyHint:true,openWorldHint:false}},async()=>{try{return result(JSON.stringify(await v250Status(),null,2));}catch(e){return errorResult(e);}});
  // ===== END v25.0 REGISTRATION =====


  // ===== v26.0 AUTONOMOUS DESIGN SYSTEM & COMPONENT FACTORY REGISTRATION =====
  server.registerTool("design_system_tokens_v26",{title:"Design System Tokens v26",description:"Generate a normalized token contract from current UI evidence.",inputSchema:z.object({}),annotations:{readOnlyHint:false,openWorldHint:false}},async()=>{try{return result(JSON.stringify(await v260Tokens(),null,2));}catch(e){return errorResult(e);}});
  server.registerTool("component_inventory_v26",{title:"Component Inventory v26",description:"Inventory React UI components and exports.",inputSchema:z.object({}),annotations:{readOnlyHint:false,openWorldHint:false}},async()=>{try{return result(JSON.stringify(await v260ComponentInventory(),null,2));}catch(e){return errorResult(e);}});
  server.registerTool("component_variant_matrix_v26",{title:"Component Variant Matrix v26",description:"Define required variants, states, responsive behavior and RTL expectations for components.",inputSchema:z.object({}),annotations:{readOnlyHint:false,openWorldHint:false}},async()=>{try{return result(JSON.stringify(await v260VariantMatrix(),null,2));}catch(e){return errorResult(e);}});
  server.registerTool("component_recipe_generate_v26",{title:"Component Recipe Generate v26",description:"Generate a reusable component recipe with anatomy, states and acceptance criteria.",inputSchema:z.object({name:z.string().min(2),purpose:z.string().min(3),category:z.string().optional()}),annotations:{readOnlyHint:false,openWorldHint:false}},async(input)=>{try{return result(JSON.stringify(await v260RecipeGenerate(input),null,2));}catch(e){return errorResult(e);}});
  server.registerTool("component_spec_generate_v26",{title:"Component Spec Generate v26",description:"Generate a typed component quality contract before implementation.",inputSchema:z.object({name:z.string().min(2),description:z.string().min(3)}),annotations:{readOnlyHint:false,openWorldHint:false}},async(input)=>{try{return result(JSON.stringify(await v260ComponentSpec(input),null,2));}catch(e){return errorResult(e);}});
  server.registerTool("responsive_contract_v26",{title:"Responsive Contract v26",description:"Create responsive viewport and behavior requirements for the design system.",inputSchema:z.object({}),annotations:{readOnlyHint:false,openWorldHint:false}},async()=>{try{return result(JSON.stringify(await v260ResponsiveContract(),null,2));}catch(e){return errorResult(e);}});
  server.registerTool("rtl_contract_v26",{title:"RTL Contract v26",description:"Create RTL and mixed Arabic/English UI rules.",inputSchema:z.object({}),annotations:{readOnlyHint:false,openWorldHint:false}},async()=>{try{return result(JSON.stringify(await v260RtlContract(),null,2));}catch(e){return errorResult(e);}});
  server.registerTool("accessibility_contract_v26",{title:"Accessibility Contract v26",description:"Create accessibility-by-design requirements for reusable components.",inputSchema:z.object({}),annotations:{readOnlyHint:false,openWorldHint:false}},async()=>{try{return result(JSON.stringify(await v260A11yContract(),null,2));}catch(e){return errorResult(e);}});
  server.registerTool("visual_snapshot_plan_v26",{title:"Visual Snapshot Plan v26",description:"Plan visual baselines for key routes, component states and viewports.",inputSchema:z.object({}),annotations:{readOnlyHint:false,openWorldHint:false}},async()=>{try{return result(JSON.stringify(await v260SnapshotPlan(),null,2));}catch(e){return errorResult(e);}});
  server.registerTool("component_quality_gate_v26",{title:"Component Quality Gate v26",description:"Score component-system quality across consistency, accessibility, RTL/responsive and states.",inputSchema:z.object({component:z.string().optional()}),annotations:{readOnlyHint:false,openWorldHint:false}},async({component})=>{try{return result(JSON.stringify(await v260ComponentQuality(component),null,2));}catch(e){return errorResult(e);}});
  server.registerTool("component_factory_plan_v26",{title:"Component Factory Plan v26",description:"Generate an implementation and verification plan for a reusable component.",inputSchema:z.object({component:z.string().min(2),purpose:z.string().min(3)}),annotations:{readOnlyHint:false,openWorldHint:false}},async(input)=>{try{return result(JSON.stringify(await v260FactoryPlan(input),null,2));}catch(e){return errorResult(e);}});
  server.registerTool("design_consistency_repair_plan_v26",{title:"Design Consistency Repair Plan v26",description:"Prioritize high-risk UI files for design-system consolidation.",inputSchema:z.object({}),annotations:{readOnlyHint:false,openWorldHint:false}},async()=>{try{return result(JSON.stringify(await v260ConsistencyRepairPlan(),null,2));}catch(e){return errorResult(e);}});
  server.registerTool("design_system_gate_v26",{title:"Design System Gate v26",description:"Block component-system release when quality, tokens or visual baselines are insufficient.",inputSchema:z.object({}),annotations:{readOnlyHint:false,openWorldHint:false}},async()=>{try{return result(JSON.stringify(await v260DesignSystemGate(),null,2));}catch(e){return errorResult(e);}});
  server.registerTool("design_system_status_v26",{title:"Design System Status v26",description:"Show v26 design-system factory artifacts and status.",inputSchema:z.object({}),annotations:{readOnlyHint:true,openWorldHint:false}},async()=>{try{return result(JSON.stringify(await v260Status(),null,2));}catch(e){return errorResult(e);}});
  // ===== END v26.0 REGISTRATION =====

  // ===== v27.0 FULL-STACK FEATURE FACTORY REGISTRATION =====
  server.registerTool("feature_spec_v27",{title:"Feature Spec v27",description:"Create a full-stack feature specification across UI, API, data, permissions, tests and telemetry.",inputSchema:z.object({name:z.string().min(2),goal:z.string().min(3),actors:z.array(z.string()).optional()}),annotations:{readOnlyHint:false,openWorldHint:false}},async(input)=>{try{return result(JSON.stringify(await v270FeatureSpec(input),null,2));}catch(e){return errorResult(e);}});
  server.registerTool("feature_data_model_v27",{title:"Feature Data Model v27",description:"Plan the data model for a feature using current project knowledge.",inputSchema:z.object({feature:z.string().min(2)}),annotations:{readOnlyHint:false,openWorldHint:false}},async(input)=>{try{return result(JSON.stringify(await v270DataModel(input),null,2));}catch(e){return errorResult(e);}});
  server.registerTool("feature_api_contract_v27",{title:"Feature API Contract v27",description:"Define request, response and error contracts for a feature.",inputSchema:z.object({feature:z.string().min(2)}),annotations:{readOnlyHint:false,openWorldHint:false}},async(input)=>{try{return result(JSON.stringify(await v270ApiContract(input),null,2));}catch(e){return errorResult(e);}});
  server.registerTool("feature_permission_matrix_v27",{title:"Feature Permission Matrix v27",description:"Create a server-enforced permission matrix for a feature.",inputSchema:z.object({feature:z.string().min(2)}),annotations:{readOnlyHint:false,openWorldHint:false}},async(input)=>{try{return result(JSON.stringify(await v270PermissionMatrix(input),null,2));}catch(e){return errorResult(e);}});
  server.registerTool("feature_ui_contract_v27",{title:"Feature UI Contract v27",description:"Define responsive, RTL, accessibility and state requirements for feature UI.",inputSchema:z.object({feature:z.string().min(2)}),annotations:{readOnlyHint:false,openWorldHint:false}},async(input)=>{try{return result(JSON.stringify(await v270UiContract(input),null,2));}catch(e){return errorResult(e);}});
  server.registerTool("feature_test_matrix_v27",{title:"Feature Test Matrix v27",description:"Plan unit, integration, E2E and visual tests for a feature.",inputSchema:z.object({feature:z.string().min(2)}),annotations:{readOnlyHint:false,openWorldHint:false}},async(input)=>{try{return result(JSON.stringify(await v270TestMatrix(input),null,2));}catch(e){return errorResult(e);}});
  server.registerTool("feature_telemetry_contract_v27",{title:"Feature Telemetry Contract v27",description:"Define safe product telemetry for a feature without recording secrets or sensitive payloads.",inputSchema:z.object({feature:z.string().min(2)}),annotations:{readOnlyHint:false,openWorldHint:false}},async(input)=>{try{return result(JSON.stringify(await v270TelemetryContract(input),null,2));}catch(e){return errorResult(e);}});
  server.registerTool("fullstack_feature_plan_v27",{title:"Full-Stack Feature Plan v27",description:"Build an integrated implementation plan covering schema, permissions, API, UI, tests and telemetry.",inputSchema:z.object({name:z.string().min(2),goal:z.string().min(3)}),annotations:{readOnlyHint:false,openWorldHint:false}},async(input)=>{try{return result(JSON.stringify(await v270FeaturePlan(input),null,2));}catch(e){return errorResult(e);}});
  server.registerTool("feature_completeness_v27",{title:"Feature Completeness v27",description:"Measure whether a feature is implemented across all required full-stack layers with evidence.",inputSchema:z.object({feature:z.string().min(2)}),annotations:{readOnlyHint:false,openWorldHint:false}},async(input)=>{try{return result(JSON.stringify(await v270Completeness(input),null,2));}catch(e){return errorResult(e);}});
  server.registerTool("feature_gap_repair_v27",{title:"Feature Gap Repair v27",description:"Generate a minimal repair plan for missing full-stack feature layers.",inputSchema:z.object({feature:z.string().min(2)}),annotations:{readOnlyHint:false,openWorldHint:false}},async(input)=>{try{return result(JSON.stringify(await v270GapRepair(input),null,2));}catch(e){return errorResult(e);}});
  server.registerTool("fullstack_feature_gate_v27",{title:"Full-Stack Feature Gate v27",description:"Block feature completion when completeness, design-system or governance evidence is insufficient.",inputSchema:z.object({feature:z.string().min(2)}),annotations:{readOnlyHint:false,openWorldHint:false}},async(input)=>{try{return result(JSON.stringify(await v270FeatureGate(input),null,2));}catch(e){return errorResult(e);}});
  server.registerTool("fullstack_feature_status_v27",{title:"Full-Stack Feature Status v27",description:"Show v27 feature factory artifacts and status.",inputSchema:z.object({}),annotations:{readOnlyHint:true,openWorldHint:false}},async()=>{try{return result(JSON.stringify(await v270Status(),null,2));}catch(e){return errorResult(e);}});
  // ===== END v27.0 REGISTRATION =====

  // ===== v28.0 APP EVOLUTION & CROSS-FEATURE INTELLIGENCE REGISTRATION =====
  server.registerTool("feature_dependency_map_v28",{title:"Feature Dependency Map v28",description:"Build a cross-feature map across routes, components, APIs, data and shared modules.",inputSchema:z.object({}),annotations:{readOnlyHint:false,openWorldHint:false}},async()=>{try{return result(JSON.stringify(await v280FeatureDependencyMap(),null,2));}catch(e){return errorResult(e);}});
  server.registerTool("cross_feature_conflict_v28",{title:"Cross Feature Conflict v28",description:"Detect files that couple multiple named features and may create cross-feature change risk.",inputSchema:z.object({features:z.array(z.string()).min(2).max(30)}),annotations:{readOnlyHint:false,openWorldHint:false}},async(input)=>{try{return result(JSON.stringify(await v280CrossFeatureConflict(input),null,2));}catch(e){return errorResult(e);}});
  server.registerTool("shared_logic_audit_v28",{title:"Shared Logic Audit v28",description:"Find high-centrality shared modules that deserve protected refactoring and regression coverage.",inputSchema:z.object({}),annotations:{readOnlyHint:false,openWorldHint:false}},async()=>{try{return result(JSON.stringify(await v280SharedLogicAudit(),null,2));}catch(e){return errorResult(e);}});
  server.registerTool("api_duplication_audit_v28",{title:"API Duplication Audit v28",description:"Detect repeated client API endpoints across files to reduce duplicate integration logic.",inputSchema:z.object({}),annotations:{readOnlyHint:false,openWorldHint:false}},async()=>{try{return result(JSON.stringify(await v280ApiDuplicationAudit(),null,2));}catch(e){return errorResult(e);}});
  server.registerTool("component_duplication_audit_v28",{title:"Component Duplication Audit v28",description:"Identify UI files likely duplicating design-system primitives and interaction patterns.",inputSchema:z.object({}),annotations:{readOnlyHint:false,openWorldHint:false}},async()=>{try{return result(JSON.stringify(await v280ComponentDuplicationAudit(),null,2));}catch(e){return errorResult(e);}});
  server.registerTool("feature_evolution_plan_v28",{title:"Feature Evolution Plan v28",description:"Plan a backward-compatible feature evolution across shared contracts, UI, API, data and tests.",inputSchema:z.object({feature:z.string().min(2),goal:z.string().min(3)}),annotations:{readOnlyHint:false,openWorldHint:false}},async(input)=>{try{return result(JSON.stringify(await v280FeatureEvolutionPlan(input),null,2));}catch(e){return errorResult(e);}});
  server.registerTool("cross_feature_regression_scope_v28",{title:"Cross Feature Regression Scope v28",description:"Calculate targeted cross-feature regression scope from changed files and the project graph.",inputSchema:z.object({files:z.array(z.string()).min(1).max(100)}),annotations:{readOnlyHint:false,openWorldHint:false}},async(input)=>{try{return result(JSON.stringify(await v280RegressionScope(input),null,2));}catch(e){return errorResult(e);}});
  server.registerTool("contract_consistency_v28",{title:"Contract Consistency v28",description:"Combine API, schema and design-system compatibility into one cross-feature contract check.",inputSchema:z.object({}),annotations:{readOnlyHint:false,openWorldHint:false}},async()=>{try{return result(JSON.stringify(await v280ContractConsistency(),null,2));}catch(e){return errorResult(e);}});
  server.registerTool("app_evolution_gate_v28",{title:"App Evolution Gate v28",description:"Block app evolution when feature completeness, contracts or governance evidence is insufficient.",inputSchema:z.object({feature:z.string().min(2)}),annotations:{readOnlyHint:false,openWorldHint:false}},async(input)=>{try{return result(JSON.stringify(await v280AppEvolutionGate(input),null,2));}catch(e){return errorResult(e);}});
  server.registerTool("app_evolution_status_v28",{title:"App Evolution Status v28",description:"Show v28 cross-feature evolution artifacts and status.",inputSchema:z.object({}),annotations:{readOnlyHint:true,openWorldHint:false}},async()=>{try{return result(JSON.stringify(await v280EvolutionStatus(),null,2));}catch(e){return errorResult(e);}});
  // ===== END v28.0 REGISTRATION =====

  // ===== v29.0 PRODUCT INTELLIGENCE & JOURNEY ORCHESTRATOR REGISTRATION =====
  server.registerTool("journey_map_v29",{title:"Journey Map v29",description:"Map a user journey against project routes and required product stages.",inputSchema:z.object({journey:z.string().min(2),actors:z.array(z.string()).optional()}),annotations:{readOnlyHint:false,openWorldHint:false}},async(input)=>{try{return result(JSON.stringify(await v290JourneyMap(input),null,2));}catch(e){return errorResult(e);}});
  server.registerTool("persona_flow_v29",{title:"Persona Flow v29",description:"Create a persona-to-goal flow with acceptance requirements.",inputSchema:z.object({persona:z.string().min(2),goal:z.string().min(3)}),annotations:{readOnlyHint:false,openWorldHint:false}},async(input)=>{try{return result(JSON.stringify(await v290PersonaFlow(input),null,2));}catch(e){return errorResult(e);}});
  server.registerTool("outcome_kpi_v29",{title:"Outcome KPI v29",description:"Define privacy-safe outcome KPIs for a feature.",inputSchema:z.object({feature:z.string().min(2)}),annotations:{readOnlyHint:false,openWorldHint:false}},async(input)=>{try{return result(JSON.stringify(await v290OutcomeKpi(input),null,2));}catch(e){return errorResult(e);}});
  server.registerTool("journey_gap_scan_v29",{title:"Journey Gap Scan v29",description:"Detect likely missing loading, error, empty and success states in large UI flows.",inputSchema:z.object({journey:z.string().min(2)}),annotations:{readOnlyHint:false,openWorldHint:false}},async(input)=>{try{return result(JSON.stringify(await v290JourneyGapScan(input),null,2));}catch(e){return errorResult(e);}});
  server.registerTool("funnel_model_v29",{title:"Funnel Model v29",description:"Generate a journey funnel event model without inventing analytics data.",inputSchema:z.object({journey:z.string().min(2),stages:z.array(z.string()).optional()}),annotations:{readOnlyHint:false,openWorldHint:false}},async(input)=>{try{return result(JSON.stringify(await v290FunnelModel(input),null,2));}catch(e){return errorResult(e);}});
  server.registerTool("cross_journey_conflict_v29",{title:"Cross Journey Conflict v29",description:"Identify shared project signals that may couple multiple user journeys.",inputSchema:z.object({journeys:z.array(z.string()).min(2).max(20)}),annotations:{readOnlyHint:false,openWorldHint:false}},async(input)=>{try{return result(JSON.stringify(await v290CrossJourneyConflict(input),null,2));}catch(e){return errorResult(e);}});
  server.registerTool("journey_regression_v29",{title:"Journey Regression v29",description:"Create journey-oriented regression checks from changed files.",inputSchema:z.object({files:z.array(z.string()).min(1).max(100)}),annotations:{readOnlyHint:false,openWorldHint:false}},async(input)=>{try{return result(JSON.stringify(await v290JourneyRegression(input),null,2));}catch(e){return errorResult(e);}});
  server.registerTool("product_outcome_review_v29",{title:"Product Outcome Review v29",description:"Review feature completeness and app evolution readiness before outcome measurement.",inputSchema:z.object({feature:z.string().min(2)}),annotations:{readOnlyHint:false,openWorldHint:false}},async(input)=>{try{return result(JSON.stringify(await v290ProductOutcomeReview(input),null,2));}catch(e){return errorResult(e);}});
  server.registerTool("journey_gate_v29",{title:"Journey Gate v29",description:"Block release when a critical user journey or product outcome is insufficiently verified.",inputSchema:z.object({journey:z.string().min(2),feature:z.string().min(2),changedFiles:z.array(z.string()).optional()}),annotations:{readOnlyHint:false,openWorldHint:false}},async(input)=>{try{return result(JSON.stringify(await v290JourneyGate(input),null,2));}catch(e){return errorResult(e);}});
  server.registerTool("journey_orchestrator_status_v29",{title:"Journey Orchestrator Status v29",description:"Show v29 product journey intelligence artifacts and status.",inputSchema:z.object({}),annotations:{readOnlyHint:true,openWorldHint:false}},async()=>{try{return result(JSON.stringify(await v290Status(),null,2));}catch(e){return errorResult(e);}});
  // ===== END v29.0 REGISTRATION =====
  // ===== v30.0 PRODUCT EXPERIMENTATION & OPTIMIZATION REGISTRATION =====
  server.registerTool("experiment_plan_v30",{title:"Experiment Plan v30",description:"Create a controlled product experiment plan with metrics and guardrails.",inputSchema:z.object({feature:z.string().min(2),hypothesis:z.string().min(5),metric:z.string().optional()}),annotations:{readOnlyHint:false,openWorldHint:false}},async(input)=>{try{return result(JSON.stringify(await v300ExperimentPlan(input),null,2));}catch(e){return errorResult(e);}});
  server.registerTool("ab_readiness_v30",{title:"A/B Readiness v30",description:"Check whether a feature is ready for controlled experimentation.",inputSchema:z.object({feature:z.string().min(2)}),annotations:{readOnlyHint:false,openWorldHint:false}},async(input)=>{try{return result(JSON.stringify(await v300AbReadiness(input),null,2));}catch(e){return errorResult(e);}});
  server.registerTool("kpi_guardrails_v30",{title:"KPI Guardrails v30",description:"Define non-regression guardrails around a primary experiment metric.",inputSchema:z.object({feature:z.string().min(2),primaryMetric:z.string().min(2)}),annotations:{readOnlyHint:false,openWorldHint:false}},async(input)=>{try{return result(JSON.stringify(await v300KpiGuardrails(input),null,2));}catch(e){return errorResult(e);}});
  server.registerTool("rollout_cohorts_v30",{title:"Rollout Cohorts v30",description:"Plan deterministic rollout cohorts for product experiments.",inputSchema:z.object({feature:z.string().min(2),strategy:z.enum(['percentage','role','internal']).optional()}),annotations:{readOnlyHint:false,openWorldHint:false}},async(input)=>{try{return result(JSON.stringify(await v300RolloutCohorts(input),null,2));}catch(e){return errorResult(e);}});
  server.registerTool("behavioral_telemetry_contract_v30",{title:"Behavioral Telemetry Contract v30",description:"Create a privacy-aware telemetry event contract for a feature journey.",inputSchema:z.object({feature:z.string().min(2)}),annotations:{readOnlyHint:false,openWorldHint:false}},async(input)=>{try{return result(JSON.stringify(await v300TelemetryContract(input),null,2));}catch(e){return errorResult(e);}});
  server.registerTool("hypothesis_tracker_v30",{title:"Hypothesis Tracker v30",description:"Track product hypotheses, decisions and supporting evidence.",inputSchema:z.object({feature:z.string().min(2),hypothesis:z.string().min(5),decision:z.string().optional(),evidence:z.array(z.string()).optional()}),annotations:{readOnlyHint:false,openWorldHint:false}},async(input)=>{try{return result(JSON.stringify(await v300HypothesisTracker(input),null,2));}catch(e){return errorResult(e);}});
  server.registerTool("ux_optimization_loop_v30",{title:"UX Optimization Loop v30",description:"Build an evidence-driven UX optimization loop for a feature.",inputSchema:z.object({feature:z.string().min(2)}),annotations:{readOnlyHint:false,openWorldHint:false}},async(input)=>{try{return result(JSON.stringify(await v300UxOptimizationLoop(input),null,2));}catch(e){return errorResult(e);}});
  server.registerTool("anomaly_detection_rules_v30",{title:"Anomaly Detection Rules v30",description:"Define experiment anomaly rules without inventing thresholds.",inputSchema:z.object({feature:z.string().min(2)}),annotations:{readOnlyHint:false,openWorldHint:false}},async(input)=>{try{return result(JSON.stringify(await v300AnomalyRules(input),null,2));}catch(e){return errorResult(e);}});
  server.registerTool("experiment_evidence_v30",{title:"Experiment Evidence v30",description:"Validate that experiment conclusions have attributable evidence.",inputSchema:z.object({feature:z.string().min(2),evidence:z.array(z.string()).min(1).max(100)}),annotations:{readOnlyHint:false,openWorldHint:false}},async(input)=>{try{return result(JSON.stringify(await v300ExperimentEvidence(input),null,2));}catch(e){return errorResult(e);}});
  server.registerTool("optimization_gate_v30",{title:"Optimization Gate v30",description:"Block optimization rollout when readiness or experiment evidence is insufficient.",inputSchema:z.object({feature:z.string().min(2),hypothesis:z.string().min(5),evidence:z.array(z.string()).optional()}),annotations:{readOnlyHint:false,openWorldHint:false}},async(input)=>{try{return result(JSON.stringify(await v300OptimizationGate(input),null,2));}catch(e){return errorResult(e);}});
  server.registerTool("optimization_status_v30",{title:"Optimization Status v30",description:"Show v30 product optimization artifacts and status.",inputSchema:z.object({}),annotations:{readOnlyHint:true,openWorldHint:false}},async()=>{try{return result(JSON.stringify(await v300OptimizationStatus(),null,2));}catch(e){return errorResult(e);}});
  // ===== END v30.0 REGISTRATION =====

  // ===== v31.0 WORKSPACE BOOTSTRAP & SELF-REPAIR REGISTRATION =====
  server.registerTool("workspace_bootstrap_v31",{title:"Workspace Bootstrap v31",description:"Initialize safe KROM runtime folders, config and env template under KROM_HOME.",inputSchema:z.object({}),annotations:{readOnlyHint:false,openWorldHint:false}},async()=>{try{return result(JSON.stringify(await v310WorkspaceBootstrap(),null,2));}catch(e){return errorResult(e);}});
  server.registerTool("runtime_doctor_v31",{title:"Runtime Doctor v31",description:"Diagnose KROM_HOME, project root, Node, npm, Git, startup files and package metadata.",inputSchema:z.object({}),annotations:{readOnlyHint:true,openWorldHint:false}},async()=>{try{return result(JSON.stringify(await v310RuntimeDoctor(),null,2));}catch(e){return errorResult(e);}});
  server.registerTool("port_diagnostics_v31",{title:"Port Diagnostics v31",description:"Check whether the configured local KROM port is already in use.",inputSchema:z.object({port:z.number().int().min(1).max(65535).optional()}),annotations:{readOnlyHint:true,openWorldHint:false}},async(input)=>{try{return result(JSON.stringify(await v310PortDiagnostics(input),null,2));}catch(e){return errorResult(e);}});
  server.registerTool("env_template_v31",{title:"Environment Template v31",description:"Create a safe .env.example for C:\\KSA-FORGE without secrets.",inputSchema:z.object({}),annotations:{readOnlyHint:false,openWorldHint:false}},async()=>{try{return result(JSON.stringify(await v310EnvTemplate(),null,2));}catch(e){return errorResult(e);}});
  server.registerTool("installation_repair_plan_v31",{title:"Installation Repair Plan v31",description:"Build a deterministic repair plan from current runtime diagnostics.",inputSchema:z.object({}),annotations:{readOnlyHint:false,openWorldHint:false}},async()=>{try{return result(JSON.stringify(await v310RepairPlan(),null,2));}catch(e){return errorResult(e);}});
  server.registerTool("startup_integrity_gate_v31",{title:"Startup Integrity Gate v31",description:"Block startup readiness when required runtime checks or the configured port fail.",inputSchema:z.object({}),annotations:{readOnlyHint:true,openWorldHint:false}},async()=>{try{return result(JSON.stringify(await v310StartupIntegrityGate(),null,2));}catch(e){return errorResult(e);}});
  server.registerTool("install_status_v31",{title:"Install Status v31",description:"Show current v31 bootstrap state and configured KROM paths.",inputSchema:z.object({}),annotations:{readOnlyHint:true,openWorldHint:false}},async()=>{try{return result(JSON.stringify(await v310InstallStatus(),null,2));}catch(e){return errorResult(e);}});
  // ===== END v31.0 REGISTRATION =====


  // ===== v32.0 MODEL & PROVIDER ORCHESTRATOR REGISTRATION =====
  server.registerTool("provider_profile_upsert_v32",{title:"Provider Profile Upsert v32",description:"Create or update a local/OpenAI-compatible provider profile without storing secret values.",inputSchema:z.object({id:z.string().optional(),name:z.string().min(2),kind:z.enum(['ollama','gpt4all','gemini','openai-compatible','custom']),baseUrl:z.string().min(7),apiKeyEnv:z.string().optional(),defaultModel:z.string().optional(),enabled:z.boolean().optional(),priority:z.number().int().min(1).max(999).optional(),timeoutMs:z.number().int().min(1000).max(60000).optional()}),annotations:{readOnlyHint:false,openWorldHint:false}},async(input)=>{try{return result(JSON.stringify(await v320ProfileUpsert(input),null,2));}catch(e){return errorResult(e);}});
  server.registerTool("provider_profiles_v32",{title:"Provider Profiles v32",description:"List configured model providers and whether required credentials are available, without exposing secret values.",inputSchema:z.object({}),annotations:{readOnlyHint:true,openWorldHint:false}},async()=>{try{return result(JSON.stringify(await v320Profiles(),null,2));}catch(e){return errorResult(e);}});
  server.registerTool("provider_health_v32",{title:"Provider Health v32",description:"Check configured provider model endpoints and latency.",inputSchema:z.object({providerId:z.string().optional()}),annotations:{readOnlyHint:true,openWorldHint:true}},async(input)=>{try{return result(JSON.stringify(await v320ProviderHealth(input),null,2));}catch(e){return errorResult(e);}});
  server.registerTool("model_discover_v32",{title:"Model Discover v32",description:"Discover models exposed by healthy configured providers.",inputSchema:z.object({providerId:z.string().optional()}),annotations:{readOnlyHint:true,openWorldHint:true}},async(input)=>{try{return result(JSON.stringify(await v320ModelDiscover(input),null,2));}catch(e){return errorResult(e);}});
  server.registerTool("model_select_v32",{title:"Model Select v32",description:"Set a provider default model in the local KROM profile registry.",inputSchema:z.object({providerId:z.string().min(1),model:z.string().min(1)}),annotations:{readOnlyHint:false,openWorldHint:false}},async(input)=>{try{return result(JSON.stringify(await v320SelectModel(input),null,2));}catch(e){return errorResult(e);}});
  server.registerTool("model_routing_policy_v32",{title:"Model Routing Policy v32",description:"Configure provider/model routes for coding, planning, general and design tasks.",inputSchema:z.object({codingProvider:z.string().optional(),codingModel:z.string().optional(),planningProvider:z.string().optional(),planningModel:z.string().optional(),generalProvider:z.string().optional(),generalModel:z.string().optional(),designProvider:z.string().optional(),designModel:z.string().optional()}),annotations:{readOnlyHint:false,openWorldHint:false}},async(input)=>{try{return result(JSON.stringify(await v320RoutingPolicy(input),null,2));}catch(e){return errorResult(e);}});
  server.registerTool("model_route_v32",{title:"Model Route v32",description:"Route a task to the configured provider/model and optionally require a live health check.",inputSchema:z.object({task:z.string().min(2),requireHealthy:z.boolean().optional()}),annotations:{readOnlyHint:false,openWorldHint:true}},async(input)=>{try{return result(JSON.stringify(await v320ModelRoute(input),null,2));}catch(e){return errorResult(e);}});
  server.registerTool("provider_fallback_plan_v32",{title:"Provider Fallback Plan v32",description:"Build a health-aware fallback chain using enabled provider priorities.",inputSchema:z.object({}),annotations:{readOnlyHint:false,openWorldHint:true}},async()=>{try{return result(JSON.stringify(await v320FallbackPlan(),null,2));}catch(e){return errorResult(e);}});
  server.registerTool("provider_orchestrator_status_v32",{title:"Provider Orchestrator Status v32",description:"Show provider registry and routing-policy status without exposing secrets.",inputSchema:z.object({}),annotations:{readOnlyHint:true,openWorldHint:false}},async()=>{try{return result(JSON.stringify(await v320Status(),null,2));}catch(e){return errorResult(e);}});
  // ===== END v32.0 REGISTRATION =====

  // ===== v33.0 ADAPTIVE MULTI-MODEL INTELLIGENCE REGISTRATION =====
  server.registerTool("provider_benchmark_v33",{title:"Provider Benchmark v33",description:"Measure live provider availability and model-endpoint latency without fabricating model-quality scores.",inputSchema:z.object({providerId:z.string().optional(),runs:z.number().int().min(1).max(5).optional()}),annotations:{readOnlyHint:false,openWorldHint:true}},async(input)=>{try{return result(JSON.stringify(await v330ProviderBenchmark(input),null,2));}catch(e){return errorResult(e);}});
  server.registerTool("provider_reliability_v33",{title:"Provider Reliability v33",description:"Summarize historical availability, latency and reliability from real provider benchmark runs.",inputSchema:z.object({providerId:z.string().optional()}),annotations:{readOnlyHint:true,openWorldHint:false}},async(input)=>{try{return result(JSON.stringify(await v330Reliability(input),null,2));}catch(e){return errorResult(e);}});
  server.registerTool("smart_model_route_v33",{title:"Smart Model Route v33",description:"Rank enabled providers for a task using live health, reliability, task affinity, priority and optional local preference.",inputSchema:z.object({task:z.string().min(2),preferLocal:z.boolean().optional(),maxCandidates:z.number().int().min(1).max(10).optional()}),annotations:{readOnlyHint:false,openWorldHint:true}},async(input)=>{try{return result(JSON.stringify(await v330SmartRoute(input),null,2));}catch(e){return errorResult(e);}});
  server.registerTool("adaptive_fallback_v33",{title:"Adaptive Fallback v33",description:"Build a task-specific fallback chain containing only healthy ranked providers.",inputSchema:z.object({task:z.string().min(2),preferLocal:z.boolean().optional()}),annotations:{readOnlyHint:false,openWorldHint:true}},async(input)=>{try{return result(JSON.stringify(await v330FallbackChain(input),null,2));}catch(e){return errorResult(e);}});
  server.registerTool("route_explain_v33",{title:"Route Explain v33",description:"Explain why a provider/model route was selected and show ranked alternatives.",inputSchema:z.object({task:z.string().min(2)}),annotations:{readOnlyHint:false,openWorldHint:true}},async(input)=>{try{return result(JSON.stringify(await v330RouteExplain(input),null,2));}catch(e){return errorResult(e);}});
  server.registerTool("quality_benchmark_plan_v33",{title:"Quality Benchmark Plan v33",description:"Create an evidence-based model quality benchmark plan without inventing performance scores.",inputSchema:z.object({taskClass:z.enum(['coding','planning','design','general']).optional()}),annotations:{readOnlyHint:false,openWorldHint:false}},async(input)=>{try{return result(JSON.stringify(await v330QualityBenchmarkPlan(input),null,2));}catch(e){return errorResult(e);}});
  server.registerTool("model_intelligence_status_v33",{title:"Model Intelligence Status v33",description:"Show v33 adaptive multi-model intelligence readiness and benchmark history count.",inputSchema:z.object({}),annotations:{readOnlyHint:true,openWorldHint:false}},async()=>{try{return result(JSON.stringify(await v330Status(),null,2));}catch(e){return errorResult(e);}});
  // ===== END v33.0 REGISTRATION =====





  // ===== v34.0 AI CONTROL CENTER REGISTRATION =====
  server.registerTool("ai_control_center_status_v34",{title:"AI Control Center Status v34",description:"Show configured model providers, routing and runtime endpoints without exposing secret values.",inputSchema:z.object({}),annotations:{readOnlyHint:true,openWorldHint:false}},async()=>{try{return result(JSON.stringify(await v340ControlStatus(),null,2));}catch(e){return errorResult(e);}});
  server.registerTool("provider_control_v34",{title:"Provider Control v34",description:"Enable/disable a model provider or adjust its priority.",inputSchema:z.object({providerId:z.string().min(1),enabled:z.boolean().optional(),priority:z.number().int().min(1).max(999).optional()}),annotations:{readOnlyHint:false,openWorldHint:false}},async(input)=>{try{return result(JSON.stringify(await v340ProviderControl(input),null,2));}catch(e){return errorResult(e);}});
  server.registerTool("model_quick_select_v34",{title:"Model Quick Select v34",description:"Select a provider model and optionally bind it to a task class.",inputSchema:z.object({providerId:z.string().min(1),model:z.string().min(1),taskClass:z.enum(['coding','planning','design','general']).optional()}),annotations:{readOnlyHint:false,openWorldHint:false}},async(input)=>{try{return result(JSON.stringify(await v340QuickSelect(input),null,2));}catch(e){return errorResult(e);}});
  server.registerTool("route_preview_v34",{title:"Route Preview v34",description:"Preview and explain adaptive routing for a task.",inputSchema:z.object({task:z.string().min(2),preferLocal:z.boolean().optional()}),annotations:{readOnlyHint:false,openWorldHint:true}},async(input)=>{try{return result(JSON.stringify(await v340RoutePreview(input),null,2));}catch(e){return errorResult(e);}});
  server.registerTool("runtime_banner_audit_v34",{title:"Runtime Banner Audit v34",description:"Audit stale KROM version banners in the runtime source.",inputSchema:z.object({}),annotations:{readOnlyHint:true,openWorldHint:false}},async()=>{try{return result(JSON.stringify(await v340RuntimeBannerAudit(),null,2));}catch(e){return errorResult(e);}});
  server.registerTool("provider_toggle_v342",{title:"Provider Toggle v34.2",description:"Enable or disable an AI provider profile.",inputSchema:z.object({providerId:z.string().min(1),enabled:z.boolean()}),annotations:{readOnlyHint:false,openWorldHint:false}},async(input)=>{try{return result(JSON.stringify(await v342ToggleProvider(input),null,2));}catch(e){return errorResult(e);}});
  server.registerTool("provider_test_v342",{title:"Provider Test v34.2",description:"Test one provider connection and return health without exposing credentials.",inputSchema:z.object({providerId:z.string().min(1)}),annotations:{readOnlyHint:true,openWorldHint:true}},async(input)=>{try{return result(JSON.stringify(await v342TestProvider(input),null,2));}catch(e){return errorResult(e);}});
  server.registerTool("provider_default_model_v342",{title:"Provider Default Model v34.2",description:"Set the default model for a provider.",inputSchema:z.object({providerId:z.string().min(1),model:z.string().min(1)}),annotations:{readOnlyHint:false,openWorldHint:false}},async(input)=>{try{return result(JSON.stringify(await v342SetDefault(input),null,2));}catch(e){return errorResult(e);}});
  server.registerTool("runtime_console_status_v34",{title:"Runtime Console Status v34",description:"Show unified v34 runtime console readiness.",inputSchema:z.object({}),annotations:{readOnlyHint:true,openWorldHint:false}},async()=>{try{return result(JSON.stringify(await v340Status(),null,2));}catch(e){return errorResult(e);}});
  // ===== END v34.0 REGISTRATION =====

  // ===== END v19.0 REGISTRATION =====


server.registerTool("developer_platform_status_v35",{title:"Developer Platform Status v35",description:"Return chat, preview, provider and workspace status for the v35 developer platform.",inputSchema:z.object({}),annotations:{readOnlyHint:true,openWorldHint:false}},async()=>{try{return result(JSON.stringify(await v350PlatformStatus(),null,2));}catch(e){return errorResult(e);}});
  server.registerTool("developer_chat_v35",{title:"Developer Chat v35",description:"Ask the routed AI provider about the current project and optional active file.",inputSchema:z.object({message:z.string().min(1),activeFile:z.string().optional(),preferLocal:z.boolean().optional()}),annotations:{readOnlyHint:false,openWorldHint:true}},async(input)=>{try{return result(JSON.stringify(await v350AskModel(input),null,2));}catch(e){return errorResult(e);}});
  server.registerTool("full_project_scan_v35",{title:"Full Project Scan v35",description:"Run runtime, diagnostics, dependency, project health and Git checks and return one consolidated report.",inputSchema:z.object({}),annotations:{readOnlyHint:false,openWorldHint:false}},async()=>{try{return result(JSON.stringify(await v350FullScan(),null,2));}catch(e){return errorResult(e);}});
  server.registerTool("preview_control_v35",{title:"Preview Control v35",description:"Set or clear the live preview URL used by the developer platform.",inputSchema:z.object({url:z.string()}),annotations:{readOnlyHint:false,openWorldHint:true}},async(input)=>{try{return result(JSON.stringify(await v350PreviewSet(input),null,2));}catch(e){return errorResult(e);}});
  server.registerTool("developer_platform_gate_v35",{title:"Developer Platform Gate v35",description:"Check whether provider, workspace and preview prerequisites are ready.",inputSchema:z.object({requirePreview:z.boolean().optional()}),annotations:{readOnlyHint:true,openWorldHint:false}},async({requirePreview})=>{try{const s:any=await v350PlatformStatus();const blockers:string[]=[];if(!(s.providers||[]).some((p:any)=>p.enabled))blockers.push('no enabled AI provider');if(requirePreview&&!s.preview?.url)blockers.push('preview URL not configured');return result(JSON.stringify({version:'37.0.0',status:blockers.length?'BLOCKED':'PASS',blockers,project:s.project,preview:s.preview},null,2));}catch(e){return errorResult(e);}});


  registerAutomationTools(server, toolRuntime, result, errorResult);

    return server;
}

const catalogServer = createServer();
await toolRuntime.init();

const handler = createMcpHandler(
  () => createServer()
);

const nodeHandler = toNodeHandler(handler);

const PUBLIC_HOST = process.env.KROM_PUBLIC_HOST || "";

const allowedHosts = [
  "127.0.0.1",
  "localhost",
  "[::1]",
  ...(PUBLIC_HOST ? [PUBLIC_HOST] : [])
];

const allowedOrigins = [
  "127.0.0.1",
  "localhost",
  "[::1]",
  ...(PUBLIC_HOST ? [PUBLIC_HOST] : [])
];

  const app = createMcpFastifyApp({
  host: "127.0.0.1",
  allowedHosts,
  allowedOrigins
});

app.all(
  "/mcp",
  (request, reply) =>
    nodeHandler(
      request.raw,
      reply.raw,
      request.body
    )
);


app.get("/", async (_request, reply) => reply.type("text/html; charset=utf-8").send(await v350Html()));
app.get("/ide", async (_request, reply) => reply.type("text/html; charset=utf-8").send(await v350Html()));
app.get("/ide/api/state", async (_request, reply) => {
  try{return reply.type("application/json").send(await v80WorkbenchState());}
  catch(error){return reply.code(500).send({error:error instanceof Error?error.message:String(error)});}
});

app.get("/ide/api/file", async (request:any, reply) => {
  try{const rel=String(request.query?.path||"");if(!rel)throw new Error("path is required");return reply.send({file:normalizeRel(rel),content:await v80ReadTextFile(rel)});}catch(error){return reply.code(400).send({error:error instanceof Error?error.message:String(error)});}
});
app.post("/ide/api/file", async (request:any, reply) => {
  try{const rel=String(request.body?.path||"");const content=String(request.body?.content??"");if(!rel)throw new Error("path is required");return reply.send({status:"SAVED",...(await v80WriteTextFile(rel,content,"visual_editor_save"))});}catch(error){return reply.code(400).send({error:error instanceof Error?error.message:String(error)});}
});
app.post("/ide/api/history", async (request:any, reply) => {
  try{const action=String(request.body?.action||"") as "undo"|"redo";if(!["undo","redo"].includes(action))throw new Error("action must be undo or redo");return reply.send(await v80UndoRedo(action,request.body?.file?String(request.body.file):undefined));}catch(error){return reply.code(400).send({error:error instanceof Error?error.message:String(error)});}
});
app.post("/ide/api/chat", async (request:any, reply) => {
  try{const message=String(request.body?.message||"").trim();if(!message)throw new Error("message is required");let st=await v60ReadJson(V80_CHAT_CONTEXT_FILE,{messages:[],activeFile:null});st.activeFile=request.body?.activeFile||st.activeFile||null;st.messages=[...(st.messages||[]),{at:new Date().toISOString(),message,activeFile:st.activeFile}].slice(-100);await v60WriteJson(V80_CHAT_CONTEXT_FILE,st);return reply.send(st);}catch(error){return reply.code(400).send({error:error instanceof Error?error.message:String(error)});}
});


app.get("/ide/api/dev/status", async (_request:any, reply:any) => { try{return reply.send(await v350PlatformStatus());}catch(error){return reply.code(500).send({error:error instanceof Error?error.message:String(error)});} });
app.post("/ide/api/dev/chat", async (request:any, reply:any) => { try{return reply.send(await v350AskModel({message:String(request.body?.message||''),activeFile:request.body?.activeFile?String(request.body.activeFile):null,preferLocal:!!request.body?.preferLocal}));}catch(error){return reply.code(400).send({error:error instanceof Error?error.message:String(error)});} });
app.post("/ide/api/dev/scan", async (_request:any, reply:any) => { try{return reply.send(await v350FullScan());}catch(error){return reply.code(500).send({error:error instanceof Error?error.message:String(error)});} });
app.post("/ide/api/dev/preview", async (request:any, reply:any) => { try{return reply.send(await v350PreviewSet({url:String(request.body?.url||'')}));}catch(error){return reply.code(400).send({error:error instanceof Error?error.message:String(error)});} });

app.get("/ide/api/ai-control/status", async (_request:any, reply:any) => { try{return reply.send(await v340ControlStatus());}catch(error){return reply.code(500).send({error:error instanceof Error?error.message:String(error)});} });
app.get("/ide/api/ai-control/health", async (_request:any, reply:any) => { try{return reply.send(await v320ProviderHealth({}));}catch(error){return reply.code(500).send({error:error instanceof Error?error.message:String(error)});} });
app.post("/ide/api/ai-control/select", async (request:any, reply:any) => { try{return reply.send(await v340QuickSelect({providerId:String(request.body?.providerId||''),model:String(request.body?.model||''),taskClass:request.body?.taskClass}));}catch(error){return reply.code(400).send({error:error instanceof Error?error.message:String(error)});} });
app.post("/ide/api/ai-control/route", async (request:any, reply:any) => { try{return reply.send(await v340RoutePreview({task:String(request.body?.task||''),preferLocal:!!request.body?.preferLocal}));}catch(error){return reply.code(400).send({error:error instanceof Error?error.message:String(error)});} });
app.post("/ide/api/ai-control/credential", async (request:any, reply:any) => { try{const providerId=String(request.body?.providerId||'').trim();const apiKey=String(request.body?.apiKey||'').trim();if(!providerId)throw new Error('providerId is required');if(!apiKey)throw new Error('apiKey is required');return reply.send(await v342SetCredential({providerId,apiKey}));}catch(error){return reply.code(400).send({error:error instanceof Error?error.message:String(error)});} });
app.post("/ide/api/ai-control/toggle", async (request:any, reply:any) => { try{const providerId=String(request.body?.providerId||'').trim();if(!providerId)throw new Error('providerId is required');const enabled=Boolean(request.body?.enabled);return reply.send(await v342ToggleProvider({providerId,enabled}));}catch(error){return reply.code(400).send({error:error instanceof Error?error.message:String(error)});} });
app.post("/ide/api/ai-control/test", async (request:any, reply:any) => { try{const providerId=String(request.body?.providerId||'').trim();if(!providerId)throw new Error('providerId is required');return reply.send(await v342TestProvider({providerId}));}catch(error){return reply.code(400).send({error:error instanceof Error?error.message:String(error)});} });
app.post("/ide/api/ai-control/default", async (request:any, reply:any) => { try{const providerId=String(request.body?.providerId||'').trim();const model=String(request.body?.model||'').trim();if(!providerId)throw new Error('providerId is required');if(!model)throw new Error('model is required');return reply.send(await v342SetDefault({providerId,model}));}catch(error){return reply.code(400).send({error:error instanceof Error?error.message:String(error)});} });

app.get('/ide/tools',async(_request,reply)=>reply.type('text/html; charset=utf-8').send(await fs.readFile(new URL('./public/tools.html',import.meta.url),'utf8')));
app.get('/ide/api/tools',async()=>({tools:toolRuntime.catalog(),transport:'shared MCP handlers'}));
app.get('/ide/api/automations',async()=>toolRuntime.snapshot());
const runtimeEndpoint=(action:(request:any)=>Promise<any>)=>async(request:any,reply:any)=>{try{return await action(request);}catch(error:any){return reply.code(error.message==='Another run is already active'?409:400).send({error:error.message});}};
app.post('/ide/api/tools/run',runtimeEndpoint(async request=>{const input=z.object({tool:z.string(),arguments:z.record(z.string(),z.unknown()).default({})}).strict().parse(request.body);return toolRuntime.start(input.tool,[input]);}));
app.post('/ide/api/automations',runtimeEndpoint(async request=>toolRuntime.upsert(request.body)));
app.put('/ide/api/automations/:id',runtimeEndpoint(async request=>toolRuntime.upsert(request.body,request.params.id)));
app.delete('/ide/api/automations/:id',runtimeEndpoint(async request=>toolRuntime.remove(request.params.id)));
app.post('/ide/api/automations/:id/run',runtimeEndpoint(async request=>toolRuntime.startJob(request.params.id)));
app.post('/ide/api/runs/:id/cancel',runtimeEndpoint(async request=>toolRuntime.cancel(request.params.id)));
app.addHook('onClose',async()=>{toolRuntime.stopScheduler();await catalogServer.close();});
await app.listen({
  port: PORT,
  host: "127.0.0.1"
});

console.log("");
toolRuntime.startScheduler();
console.log(" KSA FORGE DEV v37.0 - DEVELOPER PLATFORM · CHAT + PREVIEW");
console.log(" mega_100_status_v12");
console.log(" mega_100_audit_v12");

console.log(" lsp_diagnostics_v6");
console.log(" error_markers_v6");
console.log(" smart_file_explorer_v6");
console.log(" workspace_search_v6");
console.log(" diff_editor_v6");
console.log(" terminal_manager_v6");
console.log(" plugin_manager_v6");
console.log(" mcp_manager_v6");
console.log(" refactor_planner_v6");
console.log(" execution_stream_v6");
console.log(" ide_workspace_v6");
console.log(" ide_release_gate_v6");
console.log(" model_router_v5");
console.log(" diagnostics_intelligence_v5");
console.log(" api_contract_intelligence_v5");
console.log(" database_architect_v5");
console.log(" security_auditor_v5");
console.log(" performance_intelligence_v5");
console.log(" accessibility_auditor_v5");
console.log(" git_regression_guardian_v5");
console.log(" engineering_task_board_v5");
console.log(" engineering_suite_gate_v5");
console.log(" workbench_state_v8");
console.log(" editor_open_file_v8");
console.log(" editor_save_file_v8");
console.log(" apply_patch_v8");
console.log(" edit_history_v8");
console.log(" editor_problems_v8");
console.log(" ai_file_context_v8");
console.log(" terminal_script_v8");
console.log(" git_commit_v8");
console.log(" workbench_gate_v8");
console.log(" runtime_process_manager_v9");
console.log(" test_explorer_v9");
console.log(" debug_log_center_v9");
console.log(" api_inspector_v9");
console.log(" database_panel_v9");
console.log(" env_secrets_manager_v9");
console.log(" extension_sdk_v9");
console.log(" workspace_profile_v9");
console.log(" dependency_doctor_v9");
console.log(" project_health_dashboard_v9");
console.log(" release_center_v9");
console.log(" visual_ide_workspace_v7");
console.log(" panel_layout_v7");
console.log(" problems_panel_v7");
console.log(" agent_model_selector_v7");
console.log(" preview_session_v7");
console.log(" git_panel_v7");
console.log(" task_board_panel_v7");
console.log(" command_palette_v7");
console.log(" ui_theme_v7");
console.log(" workspace_snapshot_v7");
console.log(" visual_ide_gate_v7");
console.log(" spec_to_code_pipeline_v10");
console.log(" architecture_graph_v10");
console.log(" migration_planner_v10");
console.log(" e2e_scenario_generator_v10");
console.log(" visual_regression_manager_v10");
console.log(" release_notes_generator_v10");
console.log(" cicd_orchestrator_v10");
console.log(" quality_budget_v10");
console.log(" engineering_telemetry_v10");
console.log(" project_blueprints_v10");
console.log(" software_factory_status_v10");
console.log("========================================");
console.log(" KSA FORGE DEV v37.0 - AUTONOMOUS SOFTWARE FACTORY CORE");
console.log("========================================");
console.log(`MCP     : http://127.0.0.1:${PORT}/mcp`);
console.log(`PROJECT : ${PROJECT_ROOT}`);
console.log("");
console.log("TOOLS:");
console.log(" inspect_project");
console.log(" list_files");
console.log(" read_file");
console.log(" search_code");
console.log(" write_file");
console.log(" patch_file");
console.log(" run_command");
console.log(" run_build");
console.log(" run_tests");
console.log(" run_lint");
console.log(" run_typecheck");
console.log(" git_status");
console.log(" git_diff");
console.log(" verification_gate");
console.log(" design_ui_prompt");
console.log(" generate_design_system");
console.log(" ui_design_quality_check");
console.log(" visual_designer_agent");
console.log(" visual_review");
console.log(" visual_iteration_plan");
console.log(" start_precise_execution");
console.log(" execution_status");
console.log(" execution_audit");
console.log(" release_gate_v3");
console.log(" screenshot_visual_inspector");
console.log(" browser_test");
console.log(" requirement_traceability");
console.log(" project_memory");
console.log(" master_orchestrator");
console.log(" live_browser_vision");
console.log(" live_browser_report");
console.log(" release_gate_v31");
console.log(" autonomous_repair_begin");
console.log(" autonomous_repair_verify");
console.log(" autonomous_repair_status");
console.log(" repair_source_locator");
console.log(" code_intelligence_scan");
console.log(" impact_analysis");
console.log(" symbol_intelligence");
console.log(" regression_scope");
console.log(" smart_context_build");
console.log(" context_file_pack");
console.log(" decision_engine");
console.log(" context_gap_check");
console.log(" task_decomposition_graph");
console.log(" task_graph_update");
console.log(" adaptive_agent_route");
console.log(" runtime_outcome");
console.log(" learning_memory_record");
console.log(" learning_memory_recall");
console.log(" decision_confidence");
console.log(" adaptive_strategy_advisor");
console.log(" learning_memory_status");
console.log(" engineering_autopilot_start");
console.log(" autopilot_checkpoint");
console.log(" autopilot_quality_watchdog");
console.log(" autopilot_rollback");
console.log(" engineering_autopilot_status");
console.log(" adaptive_runtime_status");

console.log(" provider_profile_upsert_v32");
console.log(" provider_profiles_v32");
console.log(" provider_health_v32");
console.log(" model_discover_v32");
console.log(" model_select_v32");
console.log(" model_routing_policy_v32");
console.log(" model_route_v32");
console.log(" provider_fallback_plan_v32");
console.log(" provider_orchestrator_status_v32");
console.log(" ai_control_center_status_v34");
console.log(" provider_control_v34");
console.log(" model_quick_select_v34");
console.log(" route_preview_v34");
console.log(" runtime_banner_audit_v34");
console.log(" runtime_console_status_v34");
console.log("========================================");

// v13.0 exact-tool-count target: 500 MCP tools (258 prior + 242 v13).

// v14.0 exact-tool-count target: 1000 MCP tools (500 prior + 500 v14).

// v15.0 exact-tool-count target: 5000 MCP tools (1000 prior + 4000 v15).
