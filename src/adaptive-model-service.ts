import fs from "node:fs/promises";
import path from "node:path";
import type { ProviderProfile } from "./provider-store.js";
import type { TaskClass } from "./provider-routing.js";

export function latencyScore(ms: number) {
  if (!Number.isFinite(ms) || ms <= 0) return 0;
  if (ms <= 300) return 100;
  if (ms <= 700) return 90;
  if (ms <= 1500) return 75;
  if (ms <= 3000) return 55;
  if (ms <= 6000) return 35;
  return 15;
}

export function taskAffinity(kind: string, taskClass: TaskClass) {
  const table: Record<TaskClass, Record<string, number>> = {
    coding: { ollama: 82, gpt4all: 65, gemini: 92, "openai-compatible": 90, custom: 70 },
    planning: { ollama: 72, gpt4all: 62, gemini: 94, "openai-compatible": 92, custom: 70 },
    design: { ollama: 65, gpt4all: 55, gemini: 93, "openai-compatible": 90, custom: 68 },
    general: { ollama: 75, gpt4all: 65, gemini: 92, "openai-compatible": 90, custom: 70 }
  };
  return Number(table[taskClass]?.[kind] ?? 70);
}

export function createAdaptiveModelService(options: {
  stateDir: string;
  historyFile: string;
  readProfiles: () => Promise<ProviderProfile[]>;
  fetchJson: (url: string, profile: ProviderProfile) => Promise<any>;
  modelsUrl: (profile: ProviderProfile) => string;
  extractModels: (profile: ProviderProfile, data: any) => string[];
  classifyTask: (task: string) => TaskClass;
  env?: NodeJS.ProcessEnv;
}) {
  const {
    stateDir,
    historyFile,
    readProfiles,
    fetchJson,
    modelsUrl,
    extractModels,
    classifyTask,
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

  async function readHistory(): Promise<any[]> {
    await ensure();
    try {
      const parsed = JSON.parse(await fs.readFile(historyFile, "utf8"));
      return Array.isArray(parsed) ? parsed : parsed.history || [];
    } catch {
      return [];
    }
  }

  async function saveHistory(history: any[]) {
    await ensure();
    await fs.writeFile(
      historyFile,
      JSON.stringify(
        {
          version: "33.0.0",
          updatedAt: new Date().toISOString(),
          history: history.slice(-1000)
        },
        null,
        2
      ),
      "utf8"
    );
  }

  async function providerBenchmark(input: { providerId?: string; runs?: number }) {
    const runs = Math.max(1, Math.min(5, Number(input.runs || 2)));
    const profiles = (await readProfiles()).filter(
      (p) => p.enabled && (!input.providerId || p.id === input.providerId)
    );
    const rows: any[] = [];

    for (const profile of profiles) {
      const samples: any[] = [];
      for (let i = 0; i < runs; i++) {
        const started = Date.now();
        const response = await fetchJson(modelsUrl(profile), profile);
        samples.push({
          ok: response.ok,
          status: response.status,
          latencyMs: Date.now() - started,
          error: response.error || null,
          modelCount: response.ok ? extractModels(profile, response.data).length : 0
        });
      }

      const okCount = samples.filter((x) => x.ok).length;
      const avg = Math.round(samples.reduce((sum, x) => sum + x.latencyMs, 0) / samples.length);
      const availability = Math.round((okCount / samples.length) * 100);
      const reliability = Math.round(availability * 0.7 + latencyScore(avg) * 0.3);

      rows.push({
        providerId: profile.id,
        name: profile.name,
        kind: profile.kind,
        runs,
        availabilityPct: availability,
        avgLatencyMs: avg,
        reliabilityScore: reliability,
        credentialConfigured: profile.apiKeyEnv ? !!env[profile.apiKeyEnv] : true,
        samples
      });
    }

    const history = await readHistory();
    history.push({
      at: new Date().toISOString(),
      rows: rows.map((row) => ({
        providerId: row.providerId,
        availabilityPct: row.availabilityPct,
        avgLatencyMs: row.avgLatencyMs,
        reliabilityScore: row.reliabilityScore
      }))
    });
    await saveHistory(history);

    return write("provider-benchmark.json", {
      version: "33.0.0",
      status: rows.some((x) => x.availabilityPct > 0) ? "READY" : "NO_PROVIDER_AVAILABLE",
      rows
    });
  }

  async function reliability(input: { providerId?: string }) {
    const history = await readHistory();
    const bucket = new Map<string, any[]>();

    for (const entry of history) {
      for (const row of entry.rows || []) {
        if (input.providerId && row.providerId !== input.providerId) continue;
        const items = bucket.get(row.providerId) || [];
        items.push(row);
        bucket.set(row.providerId, items);
      }
    }

    const providers = [...bucket.entries()]
      .map(([providerId, rows]) => ({
        providerId,
        samples: rows.length,
        availabilityPct: Math.round(rows.reduce((sum, row) => sum + Number(row.availabilityPct || 0), 0) / rows.length),
        avgLatencyMs: Math.round(rows.reduce((sum, row) => sum + Number(row.avgLatencyMs || 0), 0) / rows.length),
        reliabilityScore: Math.round(rows.reduce((sum, row) => sum + Number(row.reliabilityScore || 0), 0) / rows.length)
      }))
      .sort((a, b) => b.reliabilityScore - a.reliabilityScore);

    return write("provider-reliability.json", {
      version: "33.0.0",
      status: providers.length ? "READY" : "NO_HISTORY",
      providers
    });
  }

  async function smartRoute(input: { task: string; preferLocal?: boolean; maxCandidates?: number }) {
    const profiles = (await readProfiles()).filter((p) => p.enabled);
    const taskClass = classifyTask(input.task);
    const benchmark: any = await providerBenchmark({ runs: 1 });
    const healthById = new Map((benchmark.rows || []).map((x: any) => [x.providerId, x]));

    const candidates = profiles
      .map((profile) => {
        const health: any = healthById.get(profile.id) || {};
        const affinity = taskAffinity(profile.kind, taskClass);
        const localBonus =
          input.preferLocal && (profile.kind === "ollama" || profile.kind === "gpt4all") ? 8 : 0;
        const priorityScore = Math.max(0, 100 - Math.min(100, profile.priority));
        const score = Math.round(
          Number(health.reliabilityScore || 0) * 0.45 +
          affinity * 0.35 +
          priorityScore * 0.2 +
          localBonus
        );

        return {
          providerId: profile.id,
          provider: profile.name,
          kind: profile.kind,
          model: profile.defaultModel || null,
          healthy: Number(health.availabilityPct || 0) > 0,
          reliabilityScore: Number(health.reliabilityScore || 0),
          avgLatencyMs: Number(health.avgLatencyMs || 0),
          taskAffinity: affinity,
          priority: profile.priority,
          score
        };
      })
      .sort((a, b) => b.score - a.score);

    const selected = candidates.filter((x) => x.healthy)[0] || null;

    return write("smart-route.json", {
      version: "33.0.0",
      status: selected ? "ROUTED" : "NO_PROVIDER",
      task: input.task,
      taskClass,
      selected,
      candidates: candidates.slice(0, Math.max(1, Math.min(10, Number(input.maxCandidates || 5)))),
      reason: selected
        ? "ranked by health/reliability, task affinity, provider priority and optional local preference"
        : "no enabled provider"
    });
  }

  async function fallbackChain(input: { task: string; preferLocal?: boolean }) {
    const routed: any = await smartRoute({
      task: input.task,
      preferLocal: input.preferLocal,
      maxCandidates: 10
    });

    return write("adaptive-fallback.json", {
      version: "33.0.0",
      status: routed.candidates?.length ? "READY" : "EMPTY",
      taskClass: routed.taskClass,
      chain: (routed.candidates || [])
        .filter((x: any) => x.healthy)
        .map((x: any, index: number) => ({ order: index + 1, ...x })),
      rule: "Fail over only to healthy candidates in descending route score."
    });
  }

  async function routeExplain(input: { task: string }) {
    const routed: any = await smartRoute({ task: input.task, maxCandidates: 5 });
    return write("route-explain.json", {
      version: "33.0.0",
      status: routed.status,
      task: input.task,
      taskClass: routed.taskClass,
      selected: routed.selected,
      explanation: routed.selected
        ? [
            "provider passed live availability check",
            "score combines historical/live reliability",
            "provider affinity matches task class",
            "provider priority contributes but cannot override an unhealthy endpoint"
          ]
        : ["no enabled healthy provider was available"],
      alternatives: routed.candidates || []
    });
  }

  async function qualityBenchmarkPlan(input: { taskClass?: string }) {
    const taskClass = input.taskClass || "coding";
    return write("quality-benchmark-plan.json", {
      version: "33.0.0",
      status: "PLAN_ONLY",
      taskClass,
      note: "This tool does not fabricate answer-quality scores. Execute identical benchmark prompts externally against candidate models, then record measured outcomes.",
      rubric: {
        correctness: 40,
        completeness: 20,
        instructionFollowing: 15,
        codeQuality: 15,
        latency: 10
      },
      requiredEvidence: [
        "same prompt for every model",
        "captured response",
        "objective tests where possible",
        "latency measurement",
        "reviewer or test evidence"
      ]
    });
  }

  async function status() {
    await ensure();
    const history = await readHistory();
    const profiles = await readProfiles();
    return {
      version: "33.0.0",
      status: "READY",
      providerCount: profiles.length,
      enabledProviders: profiles.filter((p) => p.enabled).length,
      benchmarkRuns: history.length,
      stateDir,
      capabilities: [
        "provider benchmark",
        "reliability history",
        "smart route",
        "adaptive fallback",
        "route explainability",
        "quality benchmark planning"
      ]
    };
  }

  return {
    write,
    readHistory,
    saveHistory,
    providerBenchmark,
    reliability,
    smartRoute,
    fallbackChain,
    routeExplain,
    qualityBenchmarkPlan,
    status
  };
}
