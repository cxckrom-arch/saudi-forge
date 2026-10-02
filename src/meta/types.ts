export type SkillStatus = "ACTIVE" | "EXPERIMENTAL" | "DEPRECATED" | "QUARANTINED" | "BLOCKED";
export type SecurityLevel = "low" | "medium" | "high" | "critical";
export type AutonomyMode = "OBSERVE" | "SUGGEST" | "AUTO_SAFE" | "CONTROLLED_AUTONOMOUS";
export type AuditOutcome = "PASS" | "REVIEW" | "BLOCKED_EXPECTED" | "BLOCKED_UNEXPECTED" | "UNAVAILABLE_EXPECTED" | "HARNESS_ERROR";

export type SkillRecord = {
  id: string; name: string; version: string; ownerDomain: string; status: SkillStatus;
  source: "local" | "curated" | "external"; hash: string; installedAt?: string; updatedAt?: string;
  canonical: boolean; dependencies: string[]; securityLevel: SecurityLevel;
  lastValidation?: string; lastSecurityScan?: string; description?: string;
};

export type Finding = { code: string; severity: "info" | "low" | "medium" | "high" | "critical"; message: string; path?: string; line?: number; redacted?: boolean };
export type ValidationReport = { valid: boolean; errors: string[]; warnings: string[]; securityFindings: Finding[]; conflicts: string[]; checkedAt: string };
export type NormalizedAuditResult = { invoked: boolean; contractOk: boolean; outcomeClass: AuditOutcome; expectedForFixture: boolean; rawStatus?: string; redactedReason?: string; evidence?: Record<string, unknown> };
export type RepairPlan = { changeId: string; mode: AutonomyMode; findingConfidence: number; repairConfidence: number; regressionRisk: "LOW" | "MEDIUM" | "HIGH"; securityImpact: SecurityLevel; filesAffected: string[]; tests: string[]; rollbackTarget?: string; allowed: boolean; blockers: string[] };
