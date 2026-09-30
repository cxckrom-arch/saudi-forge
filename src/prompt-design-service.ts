import path from "node:path";

export type PromptLanguage = "ar" | "en" | "bilingual";
export type PromptMode = "build" | "fix" | "upgrade" | "audit" | "ui" | "architecture" | "full";
export type AutonomyLevel = "guided" | "strong" | "autonomous";

export function sanitizePromptName(name: string) {
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

export function promptLanguageHeader(language: PromptLanguage) {
  if (language === "ar") {
    return "اكتب جميع المخرجات التوضيحية باللغة العربية، مع إبقاء أسماء التقنيات والأوامر البرمجية بصيغتها الأصلية.";
  }

  if (language === "bilingual") {
    return "Use Arabic for operator-facing explanations and English for code, identifiers, commands, technical standards, and file names when clearer.";
  }

  return "Use clear technical English for all implementation notes and outputs.";
}

export function autonomyProtocol(level: AutonomyLevel) {
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

export function modeInstructions(mode: PromptMode) {
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

export function verificationBlock() {
  return `## VERIFICATION GATE
Before declaring completion, inspect available package scripts and run the applicable checks, preferably in this order:
1. typecheck
2. lint
3. tests
4. build

Also verify the exact user flow that was changed. Report PASS / FAIL / SKIPPED with evidence. A missing script is SKIPPED, not PASS. Do not claim success when a critical check fails.`;
}

export function antiFakeBlock() {
  return `## IMPLEMENTATION INTEGRITY
- Do not create fake buttons, fake API responses, or placeholder success states.
- Do not claim code, tables, routes, migrations, environment variables, or integrations exist unless verified.
- Do not weaken authentication, authorization, RLS, validation, or security controls just to make an error disappear.
- Preserve existing user data and working features.
- Prefer small, reversible, reviewable changes.
- Keep secrets out of client code and source control.`;
}

export function formatList(title: string, items?: string[]) {
  const filtered = (items || []).map((x) => x.trim()).filter(Boolean);
  if (!filtered.length) return "";
  return `## ${title}
${filtered.map((x) => `- ${x}`).join("\n")}`;
}

export function generatePrompt(input: {
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

export function scorePrompt(prompt: string) {
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

export function uiStyleDirection(style: UIStyle) {
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

export function uiDensityRules(density: UIDensity) {
  if (density === "compact") return "Use compact enterprise spacing while preserving touch targets and readability. Prefer efficient tables, filters, and dense information blocks.";
  if (density === "spacious") return "Use generous spacing, larger section rhythm, and calm layouts. Preserve information density through hierarchy rather than oversized empty areas.";
  return "Use balanced spacing suitable for daily professional use: neither cramped nor oversized.";
}

export function uiPlatformRules(platform: UIPlatform) {
  const rules: Record<UIPlatform, string> = {
    web: "Optimize for modern desktop/laptop browsers while remaining usable down to tablet widths.",
    mobile: "Design mobile-first for 360–430px widths, safe areas, touch input, virtual keyboard behavior, and bottom navigation where appropriate.",
    desktop: "Optimize for desktop application workflows, keyboard navigation, resizable panels, data density, and persistent navigation.",
    responsive: "Design responsively across 375px, 768px, 1024px, 1440px and wide screens. Recompose layouts instead of merely shrinking them."
  };
  return rules[platform];
}

export function uiDesignDirectorBlock(input?: {
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

export function designTokenPreset(style: UIStyle, density: UIDensity) {
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

export function scoreUIDesignText(textInput: string) {
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

export function visualDesignerMandate(input?: {
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

export function visualReviewScore(content: string) {
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
