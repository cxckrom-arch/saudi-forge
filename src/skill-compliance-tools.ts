import * as z from "zod/v4";

export const KROM_FORGE_SKILL_REGISTRY = [
  { id: "ksa-safety-board-engineering", role: "engineering", keywords: ["code", "api", "database", "supabase", "security"] },
  { id: "ksa-safety-board-uiux-design", role: "uiux", keywords: ["ui", "ux", "form", "dashboard", "rtl"] },
  { id: "ksa-esp-vision-systems-engineer", role: "vision-infrastructure", keywords: ["camera", "rtsp", "nvr", "stream", "edge"] },
  { id: "ksa-vision-command-center-uiux", role: "vision-uiux", keywords: ["camera wall", "alert", "heatmap", "vision dashboard"] },
  { id: "ksa-vision-reliability-security-auditor", role: "vision-audit", keywords: ["reliability", "retention", "rls", "false positive", "privacy"] },
  { id: "ksa-safety-board-print-document-architect", role: "print-documents", keywords: ["print", "pdf", "certificate", "report", "qr"] },
  { id: "ksa-safety-board-dashboard-analytics", role: "analytics", keywords: ["kpi", "analytics", "trend", "heatmap", "dashboard"] },
  { id: "ksa-safety-board-hse-automation-workflow", role: "automation", keywords: ["workflow", "schedule", "notification", "escalation", "automation"] },
  { id: "ksa-safety-board-orchestrator-v3", role: "orchestration", keywords: ["orchestrate", "cross-module", "release", "plan"] },
  { id: "enterprise-hse-platform-engineer", role: "hse-platform", keywords: ["hse", "ehs", "incident", "capa", "permit"] },
  { id: "elite-product-uiux-designer", role: "product-design", keywords: ["product", "saas", "mobile", "responsive", "design system"] },
  { id: "production-engineering-release-guardian", role: "release-qa", keywords: ["test", "build", "deploy", "production", "release"] }
] as const;

export function requiredSkillsForTask(task: string) {
  const query = task.toLowerCase();
  const selected = KROM_FORGE_SKILL_REGISTRY.filter((skill) => skill.keywords.some((keyword) => query.includes(keyword)));
  const baseline = [KROM_FORGE_SKILL_REGISTRY[0], KROM_FORGE_SKILL_REGISTRY[8], KROM_FORGE_SKILL_REGISTRY[11]];
  return [...new Map([...baseline, ...selected].map((skill) => [skill.id, skill])).values()];
}

export function registerSkillComplianceTools(server: any, result: (text: string) => any, errorResult: (error: unknown) => any) {
  server.registerTool("skills_registry_v50", {
    title: "KROM Forge Skills Registry",
    description: "List the canonical twelve KSA Safety Board skills used by KROM Forge orchestration.",
    inputSchema: z.object({}),
    annotations: { readOnlyHint: true, openWorldHint: false }
  }, async () => result(JSON.stringify({ version: "50.0.0", count: KROM_FORGE_SKILL_REGISTRY.length, skills: KROM_FORGE_SKILL_REGISTRY, rule: "The canonical registry contains exactly twelve skills; optional specialist packs must not replace or duplicate them." }, null, 2)));

  server.registerTool("skills_for_task_v50", {
    title: "Skills for Task v50",
    description: "Select the minimum relevant KROM Forge skill set for a task while retaining engineering, orchestration, and release safety baselines.",
    inputSchema: z.object({ task: z.string().min(3) }),
    annotations: { readOnlyHint: true, openWorldHint: false }
  }, async ({ task }: { task: string }) => result(JSON.stringify({ status: "OK", task, selected: requiredSkillsForTask(task), selectedCount: requiredSkillsForTask(task).length }, null, 2)));

  server.registerTool("skills_compliance_gate_v50", {
    title: "Skills Compliance Gate v50",
    description: "Verify a supplied skill list contains the canonical twelve unique skills and no duplicate orchestrator identity.",
    inputSchema: z.object({ skillIds: z.array(z.string()).min(1) }),
    annotations: { readOnlyHint: true, openWorldHint: false }
  }, async ({ skillIds }: { skillIds: string[] }) => {
    try {
      const canonical = new Set(KROM_FORGE_SKILL_REGISTRY.map((skill) => skill.id));
      const duplicates = skillIds.filter((id, index) => skillIds.indexOf(id) !== index);
      const missing = [...canonical].filter((id) => !skillIds.includes(id));
      const unknown = skillIds.filter((id) => !canonical.has(id as typeof KROM_FORGE_SKILL_REGISTRY[number]["id"]));
      const blockers = [
        ...(missing.length ? [`missing canonical skills: ${missing.join(", ")}`] : []),
        ...(duplicates.length ? [`duplicate skill ids: ${[...new Set(duplicates)].join(", ")}`] : []),
        ...(unknown.length ? [`unknown skill ids: ${[...new Set(unknown)].join(", ")}`] : [])
      ];
      return result(JSON.stringify({ status: blockers.length ? "BLOCKED" : "PASS", count: skillIds.length, canonicalCount: canonical.size, blockers }, null, 2));
    } catch (error) { return errorResult(error); }
  });
}
