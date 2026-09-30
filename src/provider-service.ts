import type { ProviderProfile } from "./provider-store.js";
import { APP_VERSION } from "./release-info.js";

type ProviderStore = {
  normalizeBase(baseUrl: string): string;
  safeId(value: string): string;
  readProfiles(): Promise<ProviderProfile[]>;
  saveProfiles(profiles: ProviderProfile[]): Promise<void>;
  authHeaders(profile: ProviderProfile): Record<string, string>;
  modelsUrl(profile: ProviderProfile): string;
  extractModels(profile: ProviderProfile, data: any): string[];
};

export function createProviderService(options: {
  store: ProviderStore;
  writeState: (name: string, data: any) => Promise<any>;
  profilesFile: string;
  env?: NodeJS.ProcessEnv;
  fetchImpl?: typeof fetch;
}) {
  const {
    store,
    writeState,
    profilesFile,
    env = process.env,
    fetchImpl = fetch
  } = options;

  async function fetchJson(url: string, profile: ProviderProfile) {
    const controller = new AbortController();
    const timer = setTimeout(
      () => controller.abort(),
      Math.max(1000, profile.timeoutMs || 5000)
    );

    try {
      const response = await fetchImpl(url, {
        headers: store.authHeaders(profile),
        signal: controller.signal
      });
      const text = await response.text();
      let data: any = null;
      try {
        data = text ? JSON.parse(text) : null;
      } catch {
        data = text.slice(0, 500);
      }
      return { ok: response.ok, status: response.status, data };
    } catch (error: any) {
      return {
        ok: false,
        status: 0,
        error: String(
          error?.name === "AbortError"
            ? "timeout"
            : error?.message || error
        )
      };
    } finally {
      clearTimeout(timer);
    }
  }

  async function profileUpsert(input: any) {
    const profiles = await store.readProfiles();
    const id = store.safeId(input.id || input.name);
    if (!id) throw new Error("Provider id/name is required.");

    const baseUrl = store.normalizeBase(input.baseUrl);
    if (!/^https?:\/\//i.test(baseUrl)) {
      throw new Error("baseUrl must use http:// or https://");
    }

    const next: ProviderProfile = {
      id,
      name: String(input.name || id),
      kind: input.kind,
      baseUrl,
      apiKeyEnv: input.apiKeyEnv ? String(input.apiKeyEnv) : undefined,
      defaultModel: input.defaultModel ? String(input.defaultModel) : undefined,
      enabled: input.enabled !== false,
      priority: Number(input.priority ?? 50),
      timeoutMs: Number(input.timeoutMs ?? 7000)
    };

    const index = profiles.findIndex((item) => item.id === id);
    if (index >= 0) profiles[index] = { ...profiles[index], ...next };
    else profiles.push(next);

    await store.saveProfiles(profiles);

    return writeState(`profile-${id}.json`, {
      version: APP_VERSION,
      schemaVersion: "32.1.0",
      status: "SAVED",
      profile: {
        ...next,
        credentialConfigured: next.apiKeyEnv
          ? !!env[next.apiKeyEnv]
          : next.kind === "ollama" || next.kind === "gpt4all"
      },
      note: "API key values are never persisted; only environment variable names are stored."
    });
  }

  async function profiles() {
    const profiles = await store.readProfiles();
    return {
      version: APP_VERSION,
      schemaVersion: "32.1.0",
      status: "READY",
      profiles: profiles
        .sort((a, b) => a.priority - b.priority)
        .map((profile) => ({
          ...profile,
          credentialConfigured: profile.apiKeyEnv
            ? !!env[profile.apiKeyEnv]
            : profile.kind === "ollama" || profile.kind === "gpt4all"
        })),
      file: profilesFile
    };
  }

  async function providerHealth(input: { providerId?: string }) {
    const profiles = (await store.readProfiles()).filter(
      (profile) =>
        profile.enabled &&
        (!input.providerId || profile.id === input.providerId)
    );

    const results: any[] = [];
    for (const profile of profiles) {
      const started = Date.now();
      const response = await fetchJson(store.modelsUrl(profile), profile);
      results.push({
        providerId: profile.id,
        name: profile.name,
        kind: profile.kind,
        ok: response.ok,
        status: response.status,
        latencyMs: Date.now() - started,
        credentialConfigured: profile.apiKeyEnv
          ? !!env[profile.apiKeyEnv]
          : true,
        error: (response as any).error || undefined,
        models: response.ok
          ? store.extractModels(profile, (response as any).data).slice(0, 50)
          : []
      });
    }

    return writeState("provider-health.json", {
      version: APP_VERSION,
      schemaVersion: "32.1.0",
      status: results.some((item) => item.ok) ? "AVAILABLE" : "UNAVAILABLE",
      results
    });
  }

  async function modelDiscover(input: { providerId?: string }) {
    const health: any = await providerHealth(input);
    return writeState("model-discovery.json", {
      version: APP_VERSION,
      schemaVersion: "32.1.0",
      status: health.results?.some((item: any) => item.ok)
        ? "READY"
        : "NO_PROVIDER_AVAILABLE",
      providers: (health.results || []).map((item: any) => ({
        providerId: item.providerId,
        ok: item.ok,
        models: item.models || [],
        latencyMs: item.latencyMs
      }))
    });
  }

  async function selectModel(input: { providerId: string; model: string }) {
    const profiles = await store.readProfiles();
    const index = profiles.findIndex((profile) => profile.id === input.providerId);
    if (index < 0) throw new Error(`Unknown provider: ${input.providerId}`);

    profiles[index].defaultModel = String(input.model);
    await store.saveProfiles(profiles);

    return writeState("selected-model.json", {
      version: APP_VERSION,
      schemaVersion: "32.1.0",
      status: "SAVED",
      providerId: input.providerId,
      model: input.model
    });
  }

  return {
    fetchJson,
    profileUpsert,
    profiles,
    providerHealth,
    modelDiscover,
    selectModel
  };
}
