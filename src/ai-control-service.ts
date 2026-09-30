import fs from "node:fs/promises";
import path from "node:path";
import type { ProviderProfile } from "./provider-store.js";
import type { TaskClass } from "./provider-routing.js";

export function createAiControlService(options: {
  stateDir: string;
  kromHome: string;
  projectRoot: string;
  port: number;
  routingFile: string;
  profiles: () => Promise<any>;
  reliability: (input: { providerId?: string }) => Promise<any>;
  readProfiles: () => Promise<ProviderProfile[]>;
  saveProfiles: (profiles: ProviderProfile[]) => Promise<void>;
  selectModel: (input: { providerId: string; model: string }) => Promise<any>;
  routingPolicy: (input: any) => Promise<any>;
  routeExplain: (input: { task: string }) => Promise<any>;
  env?: NodeJS.ProcessEnv;
}) {
  const {
    stateDir,
    kromHome,
    projectRoot,
    port,
    routingFile,
    profiles,
    reliability,
    readProfiles,
    saveProfiles,
    selectModel,
    routingPolicy,
    routeExplain,
    env = process.env
  } = options;

  async function ensure() {
    await fs.mkdir(stateDir, { recursive: true });
  }

  async function write(name: string, data: any) {
    await ensure();
    const out = { generatedAt: new Date().toISOString(), ...data };
    await fs.writeFile(path.join(stateDir, name), JSON.stringify(out, null, 2), "utf8");
    return out;
  }

  async function controlStatus() {
    const providerState: any = await profiles();
    let routing: any = null;
    try {
      routing = JSON.parse(await fs.readFile(routingFile, "utf8"));
    } catch {}

    const reliabilityState: any = await reliability({});
    return {
      version: "34.5.0",
      status: "READY",
      activeVersion: "34.4.0",
      kromHome,
      projectRoot,
      providers: providerState.profiles || [],
      routing: routing?.routes || {},
      reliability: reliabilityState.providers || [],
      endpoints: {
        ide: `http://127.0.0.1:${port}/ide`,
        mcp: `http://127.0.0.1:${port}/mcp`
      }
    };
  }

  async function providerControl(input: {
    providerId: string;
    enabled?: boolean;
    priority?: number;
  }) {
    const providerList = await readProfiles();
    const index = providerList.findIndex((provider) => provider.id === input.providerId);
    if (index < 0) throw new Error(`Unknown provider: ${input.providerId}`);

    if (typeof input.enabled === "boolean") {
      providerList[index].enabled = input.enabled;
    }
    if (Number.isFinite(input.priority)) {
      providerList[index].priority = Math.max(
        1,
        Math.min(999, Number(input.priority))
      );
    }

    await saveProfiles(providerList);
    return write("provider-control.json", {
      version: "34.5.0",
      status: "SAVED",
      provider: {
        ...providerList[index],
        credentialConfigured: providerList[index].apiKeyEnv
          ? !!env[providerList[index].apiKeyEnv as string]
          : true
      }
    });
  }

  async function quickSelect(input: {
    providerId: string;
    model: string;
    taskClass?: TaskClass;
  }) {
    const selected = await selectModel({
      providerId: input.providerId,
      model: input.model
    });

    if (input.taskClass) {
      const key = input.taskClass;
      const patch: any = {};
      patch[`${key}Provider`] = input.providerId;
      patch[`${key}Model`] = input.model;
      await routingPolicy(patch);
    }

    return write("quick-select.json", {
      version: "34.5.0",
      status: "SAVED",
      providerId: input.providerId,
      model: input.model,
      taskClass: input.taskClass || null,
      selected
    });
  }

  async function routePreview(input: { task: string; preferLocal?: boolean }) {
    const explained: any = await routeExplain({ task: input.task });
    return write("route-preview.json", {
      version: "34.5.0",
      ...explained,
      preferLocal: !!input.preferLocal
    });
  }

  async function runtimeBannerAudit() {
    const source = await fs
      .readFile(path.join(kromHome, "server.ts"), "utf8")
      .catch(() => "");
    const legacy = [
      ...source.matchAll(/KROM FORGE DEV v(\d+(?:\.\d+)?)/g)
    ].map((match) => match[0]);
    const unique = [...new Set(legacy)];

    return write("runtime-banner-audit.json", {
      version: "34.5.0",
      status: unique.some((item) => !item.includes("v34.2")) ? "REVIEW" : "PASS",
      activeBanner: "KROM FORGE DEV v34.5 - AI CONTROL CENTER",
      legacyMentions: unique.filter((item) => !item.includes("v34.2"))
    });
  }

  async function status() {
    const control = await controlStatus();
    const banner = await runtimeBannerAudit();
    return {
      version: "34.5.0",
      status: "READY",
      providers: control.providers.length,
      routing: control.routing,
      legacyBannerReview: banner.status === "REVIEW",
      stateDir
    };
  }

  return {
    ensure,
    write,
    controlStatus,
    providerControl,
    quickSelect,
    routePreview,
    runtimeBannerAudit,
    status
  };
}
