import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  ADDITIONAL_SPECIALIST_SKILL_REGISTRY,
  CORE_TESTED_SKILL_REGISTRY,
  KROM_FORGE_SKILL_REGISTRY,
  requiredSkillsForTask,
  routeSpecialistTask
} from "../src/skill-compliance-tools.js";

describe("KROM Forge specialist skill pack", () => {
  it("contains twelve core and twelve additional unique skills", () => {
    assert.equal(CORE_TESTED_SKILL_REGISTRY.length, 12);
    assert.equal(ADDITIONAL_SPECIALIST_SKILL_REGISTRY.length, 12);
    assert.equal(KROM_FORGE_SKILL_REGISTRY.length, 24);
    assert.equal(new Set(KROM_FORGE_SKILL_REGISTRY.map((skill) => skill.id)).size, 24);
  });

  it("keeps engineering, orchestration, and release baselines for every task", () => {
    const selected = requiredSkillsForTask("review a camera wall");
    const ids = selected.map((skill) => skill.id);
    assert.ok(ids.includes("ksa-safety-board-engineering"));
    assert.ok(ids.includes("ksa-safety-board-orchestrator-v3"));
    assert.ok(ids.includes("production-engineering-release-guardian"));
    assert.ok(ids.includes("ksa-vision-command-center-uiux"));
  });

  it("routes specialist ownership and dependencies without embedding skill contents", () => {
    const route = routeSpecialistTask("Supabase migration with RLS and rollback");
    const ids = route.selected.map((skill) => skill.id);
    assert.ok(ids.includes("ksa-database-schema-migration-architect"));
    assert.ok(ids.includes("ksa-auth-rbac-rls-security-engineer"));
    assert.ok(route.selected.every((skill) => skill.implementationOwner && skill.reviewRole && skill.handoff.length > 0));
  });
});
