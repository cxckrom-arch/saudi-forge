import fs from "node:fs/promises";
import type { ProviderProfile } from "./provider-store.js";

export type TaskClass = "coding" | "planning" | "design" | "general";

export function classifyTask(task: string): TaskClass {
  const q = task.toLowerCase();
  if (/ui|ux|design|css|tailwind|responsive|rtl|واجهة|تصميم/.test(q)) return "design";
  if (/architect|plan|schema|migration|architecture|خطة|معمار/.test(q)) return "planning";
  if (/code|bug|fix|typescript|react|function|component|برمج|صلح|كود/.test(q)) return "coding";
  return "general";
}

export function createProviderRouting(options: {
  routingFile: string;
  ensure: () => Promise<void>;
  readProfiles: () => Promise<ProviderProfile[]>;
  providerHealth: (input: { providerId?: string }) => Promise<any>;
  writeState: (name: string, data: any) => Promise<any>;
  kromHome: string;
  profilesFile: string;
}) {
  const { routingFile, ensure, readProfiles, providerHealth, writeState, kromHome, profilesFile } = options;

  async function readPolicy() {
    try { return JSON.parse(await fs.readFile(routingFile, "utf8")); }
    catch { return {}; }
  }

  async function routingPolicy(input: {
    codingProvider?: string; codingModel?: string;
    planningProvider?: string; planningModel?: string;
    generalProvider?: string; generalModel?: string;
    designProvider?: string; designModel?: string;
  }) {
    await ensure();
    const current = await readPolicy();
    const policy = {
      version: "32.1.0",
      updatedAt: new Date().toISOString(),
      routes: {
        ...(current.routes || {}),
        coding: {
          providerId: input.codingProvider || current.routes?.coding?.providerId,
          model: input.codingModel || current.routes?.coding?.model
        },
        planning: {
          providerId: input.planningProvider || current.routes?.planning?.providerId,
          model: input.planningModel || current.routes?.planning?.model
        },
        general: {
          providerId: input.generalProvider || current.routes?.general?.providerId,
          model: input.generalModel || current.routes?.general?.model
        },
        design: {
          providerId: input.designProvider || current.routes?.design?.providerId,
          model: input.designModel || current.routes?.design?.model
        }
      }
    };
    await fs.writeFile(routingFile, JSON.stringify(policy, null, 2), "utf8");
    return writeState("routing-policy-status.json", { status: "SAVED", ...policy });
  }

  async function modelRoute(input: { task: string; requireHealthy?: boolean }) {
    const profiles = await readProfiles();
    const policy = await readPolicy();
    const route = classifyTask(input.task);
    const configured = policy.routes?.[route];

    let candidate =
      profiles.find((p) => p.enabled && p.id === configured?.providerId) ||
      profiles.filter((p) => p.enabled).sort((a, b) => a.priority - b.priority)[0];

    if (candidate && input.requireHealthy !== false) {
      const health = await providerHealth({ providerId: candidate.id });
      if (!health.results?.[0]?.ok) {
        const all = await providerHealth({});
        const ok = all.results?.find((item: any) => item.ok);
        if (ok) candidate = profiles.find((p) => p.id === ok.providerId);
      }
    }

    return writeState("last-route.json", {
      version: "32.1.0",
      status: candidate ? "ROUTED" : "NO_PROVIDER",
      taskClass: route,
      providerId: candidate?.id || null,
      provider: candidate?.name || null,
      model:
        configured?.providerId === candidate?.id && configured?.model
          ? configured.model
          : candidate?.defaultModel || null,
      healthChecked: input.requireHealthy !== false,
      reason: configured?.providerId
        ? "matched routing policy"
        : "selected enabled provider by priority"
    });
  }

  async function fallbackPlan() {
    const profiles = (await readProfiles())
      .filter((p) => p.enabled)
      .sort((a, b) => a.priority - b.priority);
    const health = await providerHealth({});
    const byId = new Map((health.results || []).map((item: any) => [item.providerId, item]));

    return writeState("fallback-plan.json", {
      version: "32.1.0",
      status: "READY",
      chain: profiles.map((p, index) => ({
        order: index + 1,
        providerId: p.id,
        model: p.defaultModel || null,
        healthy: !!(byId.get(p.id) as any)?.ok,
        priority: p.priority
      })),
      rule: "Prefer the configured route; fall back only to an enabled provider that passes the health check."
    });
  }

  async function status() {
    await ensure();
    const profiles = await readProfiles();
    const routing = await readPolicy();
    return {
      version: "32.1.0",
      status: "READY",
      kromHome,
      profileCount: profiles.length,
      enabledProviders: profiles.filter((p) => p.enabled).length,
      profilesFile,
      routingFile,
      routing
    };
  }

  return { readPolicy, routingPolicy, modelRoute, fallbackPlan, status };
}
