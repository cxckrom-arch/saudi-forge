import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { KROM_FORGE_SKILL_REGISTRY, requiredSkillsForTask } from "../src/skill-compliance-tools.js";

describe("KROM Forge canonical tested skill pack", () => {
  it("contains exactly twelve unique skills", () => {
    assert.equal(KROM_FORGE_SKILL_REGISTRY.length, 12);
    assert.equal(new Set(KROM_FORGE_SKILL_REGISTRY.map((skill) => skill.id)).size, 12);
  });

  it("keeps engineering, orchestration, and release baselines for every task", () => {
    const selected = requiredSkillsForTask("review a camera wall");
    const ids = selected.map((skill) => skill.id);
    assert.ok(ids.includes("ksa-safety-board-engineering"));
    assert.ok(ids.includes("ksa-safety-board-orchestrator-v3"));
    assert.ok(ids.includes("production-engineering-release-guardian"));
    assert.ok(ids.includes("ksa-vision-command-center-uiux"));
  });
});
