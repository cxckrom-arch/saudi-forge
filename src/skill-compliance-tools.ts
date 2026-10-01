import * as z from "zod/v4";

export type KromForgeSkill = {
  id: string;
  role: string;
  keywords: string[];
  responsibility: string;
  triggers: string[];
  implementationOwner: string;
  reviewRole: string;
  dependencies: string[];
  handoff: string[];
};

const core = (id: string, role: string, keywords: string[], responsibility: string): KromForgeSkill => ({
  id, role, keywords, responsibility,
  triggers: keywords,
  implementationOwner: id,
  reviewRole: "production-engineering-release-guardian",
  dependencies: ["ksa-safety-board-orchestrator-v3"],
  handoff: ["acceptance criteria", "changed files", "verification evidence", "unresolved risks"]
});

export const CORE_TESTED_SKILL_REGISTRY: readonly KromForgeSkill[] = [
  core("ksa-safety-board-engineering", "engineering", ["code", "api", "database", "supabase", "security"], "React/TypeScript implementation, APIs, persistence, integrations, and secure production fixes."),
  core("ksa-safety-board-uiux-design", "uiux", ["ui", "ux", "form", "dashboard", "rtl"], "KSA Safety Board information architecture, design system, workflows, responsive and RTL/LTR UI."),
  core("ksa-esp-vision-systems-engineer", "vision-infrastructure", ["camera", "rtsp", "nvr", "stream", "edge"], "ESP/edge devices, gateways, telemetry, recordings, topology, and stream health."),
  core("ksa-vision-command-center-uiux", "vision-uiux", ["camera wall", "alert", "heatmap", "vision dashboard"], "Safety Vision monitoring, camera wall, alert center, maps, recordings, and analytics UX."),
  core("ksa-vision-reliability-security-auditor", "vision-audit", ["reliability", "retention", "rls", "false positive", "privacy"], "Vision security, privacy, retention, reliability, performance, and production audit."),
  core("ksa-safety-board-print-document-architect", "print-documents", ["print", "pdf", "certificate", "report", "qr"], "Official HSE print, PDF, certificate, QR, badge, and document-template architecture."),
  core("ksa-safety-board-dashboard-analytics", "analytics", ["kpi", "analytics", "trend", "heatmap", "dashboard"], "KPI definitions, analytics integrity, trends, comparisons, drilldowns, and data freshness."),
  core("ksa-safety-board-hse-automation-workflow", "automation", ["workflow", "schedule", "notification", "escalation", "automation"], "HSE schedules, reminders, escalation, outbox, retries, idempotency, and automation observability."),
  core("ksa-safety-board-orchestrator-v3", "orchestration", ["orchestrate", "cross-module", "release", "plan"], "Cross-module specialist selection, ownership, handoffs, evidence gates, and release coordination."),
  core("enterprise-hse-platform-engineer", "hse-platform", ["hse", "ehs", "incident", "capa", "permit"], "HSE/EHS lifecycle, terminology, governance, approvals, and operational domain integrity."),
  core("elite-product-uiux-designer", "product-design", ["product", "saas", "mobile", "responsive", "design system"], "Visual refinement, typography, interaction polish, accessibility, and enterprise product consistency."),
  core("production-engineering-release-guardian", "release-qa", ["test", "build", "deploy", "production", "release"], "Typecheck, build, lint/tests, security, runtime verification, deployment, rollback, and release approval.")
];

const additional = (entry: Omit<KromForgeSkill, "reviewRole"> & { reviewRole?: string }): KromForgeSkill => ({
  ...entry,
  reviewRole: entry.reviewRole ?? "production-engineering-release-guardian"
});

export const ADDITIONAL_SPECIALIST_SKILL_REGISTRY: readonly KromForgeSkill[] = [
  additional({ id: "ksa-database-schema-migration-architect", role: "database-schema", keywords: ["postgres", "postgresql", "schema", "migration", "ddl", "index", "foreign key", "schema drift"], responsibility: "PostgreSQL/Supabase schema, migration, drift, compatibility, integrity, and rollback ownership.", triggers: ["schema change", "database migration", "supabase table", "data integrity"], implementationOwner: "ksa-database-schema-migration-architect", dependencies: ["ksa-safety-board-orchestrator-v3"], handoff: ["schema snapshot", "DDL and rollback", "compatibility evidence", "integrity checks"] }),
  additional({ id: "ksa-auth-rbac-rls-security-engineer", role: "auth-rbac-rls", keywords: ["auth", "authentication", "authorization", "rbac", "rls", "mfa", "403", "permission", "security definer"], responsibility: "Supabase Auth, MFA, RBAC, RLS, grants, privileged RPC, session, and service-role security.", triggers: ["login", "403", "401", "permission denied", "RLS policy", "MFA"], implementationOwner: "ksa-auth-rbac-rls-security-engineer", dependencies: ["ksa-safety-board-orchestrator-v3", "ksa-database-schema-migration-architect"], handoff: ["actor matrix", "policy evidence", "denied-path tests", "security findings"] }),
  additional({ id: "ksa-integration-notification-engineer", role: "integration-notifications", keywords: ["email", "whatsapp", "teams", "webhook", "outbox", "retry", "notification", "delivery"], responsibility: "Notification providers, outbox, retries, throttling, templates, health, secrets, and signature verification.", triggers: ["notification integration", "webhook", "delivery status", "provider health"], implementationOwner: "ksa-integration-notification-engineer", dependencies: ["ksa-safety-board-hse-automation-workflow", "ksa-safety-board-engineering"], handoff: ["event contract", "provider matrix", "retry policy", "delivery evidence"] }),
  additional({ id: "ksa-realtime-collaboration-engineer", role: "realtime-collaboration", keywords: ["realtime", "webrtc", "meeting", "ptt", "presence", "broadcast", "signaling", "live chat"], responsibility: "Live meetings, PTT, WebRTC signaling, Supabase Realtime, presence, channels, heartbeat, and reconnect.", triggers: ["live meeting", "PTT radio", "presence", "realtime channel", "WebRTC"], implementationOwner: "ksa-realtime-collaboration-engineer", dependencies: ["ksa-safety-board-engineering", "ksa-auth-rbac-rls-security-engineer"], handoff: ["channel model", "authorization matrix", "state machine", "reconnect evidence"] }),
  additional({ id: "ksa-mobile-pwa-offline-field-engineer", role: "mobile-offline", keywords: ["mobile", "pwa", "offline", "field", "qr", "gps", "camera capture", "sync conflict"], responsibility: "Mobile field UX, PWA/offline queue, device capture, retries, synchronization, stale data, and conflicts.", triggers: ["offline workflow", "field inspection", "mobile field", "QR scan", "background sync"], implementationOwner: "ksa-mobile-pwa-offline-field-engineer", dependencies: ["ksa-safety-board-uiux-design", "enterprise-hse-platform-engineer", "ksa-safety-board-engineering"], handoff: ["offline state model", "queue schema", "conflict policy", "mobile evidence"] }),
  additional({ id: "ksa-qa-e2e-test-automation-engineer", role: "qa-e2e", keywords: ["e2e", "end to end", "qa", "regression", "playwright", "test automation", "route test"], responsibility: "Reusable route, auth, permission, CRUD, API, print, QR, mobile, RTL, realtime, and regression automation.", triggers: ["E2E tests", "production readiness", "regression test", "browser test"], implementationOwner: "ksa-safety-board-engineering", reviewRole: "ksa-qa-e2e-test-automation-engineer", dependencies: ["ksa-safety-board-orchestrator-v3"], handoff: ["test scope", "fixture strategy", "failure evidence", "release recommendation"] }),
  additional({ id: "ksa-performance-observability-sre-engineer", role: "performance-sre", keywords: ["performance", "latency", "observability", "sre", "metrics", "tracing", "vercel logs", "slow query"], responsibility: "Measured frontend/API/database performance, logs, tracing, metrics, request IDs, health, alerts, and diagnostics.", triggers: ["slow route", "slow query", "runtime errors", "performance incident", "observability"], implementationOwner: "ksa-performance-observability-sre-engineer", dependencies: ["ksa-safety-board-engineering"], handoff: ["baseline", "bottleneck evidence", "before-after metrics", "alert recommendation"] }),
  additional({ id: "ksa-backup-restore-disaster-recovery-engineer", role: "backup-dr", keywords: ["backup", "restore", "disaster recovery", "DR", "RPO", "RTO", "checksum", "rollback"], responsibility: "Database/configuration/storage backups, integrity manifests, restore validation, authorization, rollback, and DR runbooks.", triggers: ["backup plan", "restore test", "disaster recovery", "recovery runbook"], implementationOwner: "ksa-backup-restore-disaster-recovery-engineer", dependencies: ["ksa-database-schema-migration-architect", "ksa-auth-rbac-rls-security-engineer"], handoff: ["manifest", "checksum", "RPO/RTO", "restore evidence", "runbook"] }),
  additional({ id: "ksa-document-intelligence-ocr-import-engineer", role: "document-import", keywords: ["ocr", "import", "xlsx", "csv", "json import", "field mapping", "duplicate rows", "rejected rows"], responsibility: "OCR and structured document import, mappings, validation, duplicate detection, preview, rejected rows, and normalization.", triggers: ["OCR import", "bulk import", "XLSX import", "CSV validation", "document parsing"], implementationOwner: "ksa-document-intelligence-ocr-import-engineer", dependencies: ["ksa-database-schema-migration-architect", "ksa-safety-board-engineering"], handoff: ["mapping rules", "validation report", "accepted/rejected counts", "retry/rollback plan"] }),
  additional({ id: "ksa-ai-hse-assistant-rag-engineer", role: "ai-hse-rag", keywords: ["AI assistant", "RAG", "retrieval", "embedding", "knowledge base", "citation", "prompt injection", "HSE assistant"], responsibility: "Permission-scoped HSE RAG, grounding, citations, prompt-injection defense, provider runtime, and AI audit logs.", triggers: ["HSE Assistant", "knowledge documents", "RAG", "AI recommendation", "AI audit"], implementationOwner: "ksa-ai-hse-assistant-rag-engineer", dependencies: ["enterprise-hse-platform-engineer", "ksa-auth-rbac-rls-security-engineer", "ksa-safety-board-engineering"], handoff: ["source scope", "retrieval contract", "safety evaluation", "authorization evidence", "model audit"] }),
  additional({ id: "ksa-accessibility-rtl-i18n-engineer", role: "accessibility-i18n", keywords: ["accessibility", "wcag", "rtl", "ltr", "arabic", "urdu", "i18n", "keyboard", "screen reader"], responsibility: "Arabic/English/Urdu localization, RTL/LTR, WCAG, keyboard/focus, screen readers, and locale-aware formatting.", triggers: ["RTL review", "accessibility audit", "Arabic UI", "translation", "WCAG"], implementationOwner: "ksa-accessibility-rtl-i18n-engineer", dependencies: ["ksa-safety-board-uiux-design", "elite-product-uiux-designer"], handoff: ["locale matrix", "accessibility findings", "RTL evidence", "translation coverage"] }),
  additional({ id: "ksa-data-exchange-etl-reporting-engineer", role: "data-exchange-etl", keywords: ["ETL", "export", "data exchange", "batch", "reconciliation", "CSV export", "XLSX export", "dataset"], responsibility: "Structured import/export, batch pipelines, scheduled exports, reconciliation, normalization, large datasets, and auditability.", triggers: ["ETL pipeline", "scheduled export", "data reconciliation", "large export"], implementationOwner: "ksa-data-exchange-etl-reporting-engineer", dependencies: ["ksa-database-schema-migration-architect", "ksa-safety-board-hse-automation-workflow", "ksa-safety-board-engineering"], handoff: ["data contract", "pipeline stages", "reconciliation report", "batch checkpoints", "export audit"] })
];

export const KROM_FORGE_SKILL_REGISTRY: readonly KromForgeSkill[] = [...CORE_TESTED_SKILL_REGISTRY, ...ADDITIONAL_SPECIALIST_SKILL_REGISTRY];

export function requiredSkillsForTask(task: string) {
  const query = task.toLowerCase();
  const selected = KROM_FORGE_SKILL_REGISTRY.filter((skill) => skill.keywords.some((keyword) => query.includes(keyword)));
  const baseline = [
    CORE_TESTED_SKILL_REGISTRY.find((skill) => skill.id === "ksa-safety-board-engineering")!,
    CORE_TESTED_SKILL_REGISTRY.find((skill) => skill.id === "ksa-safety-board-orchestrator-v3")!,
    CORE_TESTED_SKILL_REGISTRY.find((skill) => skill.id === "production-engineering-release-guardian")!
  ];
  return [...new Map([...baseline, ...selected].map((skill) => [skill.id, skill])).values()];
}

export function routeSpecialistTask(task: string) {
  const selected = requiredSkillsForTask(task);
  return {
    status: "OK",
    task,
    selected: selected.map((skill) => ({
      id: skill.id,
      role: skill.role,
      responsibility: skill.responsibility,
      implementationOwner: skill.implementationOwner,
      reviewRole: skill.reviewRole,
      dependencies: skill.dependencies,
      handoff: skill.handoff
    })),
    rule: "Use one implementation owner; specialists provide input or review unless explicitly assigned ownership."
  };
}

export function registerSkillComplianceTools(server: any, result: (text: string) => any, errorResult: (error: unknown) => any) {
  server.registerTool("skills_registry_v50", {
    title: "KROM Forge Skills Registry",
    description: "List the twelve core tested skills and twelve additional KSA Safety Board specialist skills registered for orchestration.",
    inputSchema: z.object({}),
    annotations: { readOnlyHint: true, openWorldHint: false }
  }, async () => result(JSON.stringify({ version: "50.0.0", count: KROM_FORGE_SKILL_REGISTRY.length, coreCount: CORE_TESTED_SKILL_REGISTRY.length, additionalCount: ADDITIONAL_SPECIALIST_SKILL_REGISTRY.length, skills: KROM_FORGE_SKILL_REGISTRY, rule: "Core skills remain stable; additional specialists are modular and must be loaded from their current SKILL.md when selected." }, null, 2)));

  server.registerTool("skills_for_task_v50", {
    title: "Skills for Task v50",
    description: "Select the minimum relevant KROM Forge skill set for a task while retaining engineering, orchestration, and release safety baselines.",
    inputSchema: z.object({ task: z.string().min(3) }),
    annotations: { readOnlyHint: true, openWorldHint: false }
  }, async ({ task }: { task: string }) => result(JSON.stringify({ ...routeSpecialistTask(task), selectedCount: requiredSkillsForTask(task).length }, null, 2)));

  server.registerTool("skill_route_v50", {
    title: "KROM Forge Specialist Route v50",
    description: "Return specialist ownership, dependencies, review role, and handoff requirements for a task.",
    inputSchema: z.object({ task: z.string().min(3) }),
    annotations: { readOnlyHint: true, openWorldHint: false }
  }, async ({ task }: { task: string }) => result(JSON.stringify(routeSpecialistTask(task), null, 2)));

  server.registerTool("skills_compliance_gate_v50", {
    title: "Skills Compliance Gate v50",
    description: "Verify a supplied skill list contains all core and additional registered specialist skills without duplicates or unknown IDs.",
    inputSchema: z.object({ skillIds: z.array(z.string()).min(1) }),
    annotations: { readOnlyHint: true, openWorldHint: false }
  }, async ({ skillIds }: { skillIds: string[] }) => {
    try {
      const canonical = new Set(KROM_FORGE_SKILL_REGISTRY.map((skill) => skill.id));
      const duplicates = skillIds.filter((id, index) => skillIds.indexOf(id) !== index);
      const missing = [...canonical].filter((id) => !skillIds.includes(id));
      const unknown = skillIds.filter((id) => !canonical.has(id));
      const blockers = [
        ...(missing.length ? [`missing registered skills: ${missing.join(", ")}`] : []),
        ...(duplicates.length ? [`duplicate skill ids: ${[...new Set(duplicates)].join(", ")}`] : []),
        ...(unknown.length ? [`unknown skill ids: ${[...new Set(unknown)].join(", ")}`] : [])
      ];
      return result(JSON.stringify({ status: blockers.length ? "BLOCKED" : "PASS", count: skillIds.length, canonicalCount: canonical.size, coreCount: CORE_TESTED_SKILL_REGISTRY.length, additionalCount: ADDITIONAL_SPECIALIST_SKILL_REGISTRY.length, blockers }, null, 2));
    } catch (error) { return errorResult(error); }
  });
}
