import fs from "node:fs/promises";
import path from "node:path";

export type ProviderKind = "ollama" | "gpt4all" | "openai-compatible" | "gemini" | "custom";

export type ProviderProfile = {
  id: string;
  name: string;
  kind: ProviderKind;
  baseUrl: string;
  apiKeyEnv?: string;
  defaultModel?: string;
  enabled: boolean;
  priority: number;
  timeoutMs: number;
  headers?: Record<string, string>;
};

export function createProviderStore(options: {
  stateDir: string;
  profilesFile: string;
  exists: (target: string) => Promise<boolean>;
  env?: NodeJS.ProcessEnv;
}) {
  const { stateDir, profilesFile, exists, env = process.env } = options;

  async function ensure() {
    await fs.mkdir(stateDir, { recursive: true });
  }

  function normalizeBase(baseUrl: string) {
    return String(baseUrl || "").trim().replace(/\/+$/, "");
  }

  function safeId(value: string) {
    return String(value || "")
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9_-]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 64);
  }

  function defaultProfiles(): ProviderProfile[] {
    return [
      {
        id: "ollama-local",
        name: "Ollama Local",
        kind: "ollama",
        baseUrl: "http://127.0.0.1:11434",
        enabled: true,
        priority: 10,
        timeoutMs: 5000
      },
      {
        id: "gpt4all-local",
        name: "GPT4All Local",
        kind: "gpt4all",
        baseUrl: "http://127.0.0.1:4891",
        enabled: false,
        priority: 20,
        timeoutMs: 5000
      },
      {
        id: "gemini-google",
        name: "Google Gemini",
        kind: "gemini",
        baseUrl: "https://generativelanguage.googleapis.com/v1beta/openai",
        apiKeyEnv: "GEMINI_API_KEY",
        enabled: false,
        priority: 30,
        timeoutMs: 12000
      }
    ];
  }

  async function readProfiles(): Promise<ProviderProfile[]> {
    await ensure();
    if (!(await exists(profilesFile))) {
      const defaults = defaultProfiles();
      await fs.writeFile(
        profilesFile,
        JSON.stringify({ version: "32.1.0", profiles: defaults }, null, 2),
        "utf8"
      );
      return defaults;
    }

    try {
      const parsed = JSON.parse(await fs.readFile(profilesFile, "utf8"));
      return Array.isArray(parsed) ? parsed : parsed.profiles || [];
    } catch {
      return [];
    }
  }

  async function saveProfiles(profiles: ProviderProfile[]) {
    await ensure();
    await fs.writeFile(
      profilesFile,
      JSON.stringify(
        {
          version: "32.1.0",
          updatedAt: new Date().toISOString(),
          profiles
        },
        null,
        2
      ),
      "utf8"
    );
  }

  function authHeaders(profile: ProviderProfile) {
    const headers: Record<string, string> = { accept: "application/json" };
    if (profile.apiKeyEnv) {
      const value = env[profile.apiKeyEnv];
      if (value) headers.authorization = `Bearer ${value}`;
    }

    for (const [key, value] of Object.entries(profile.headers || {})) {
      if (!/authorization|api[-_]?key/i.test(key)) headers[key] = value;
    }

    return headers;
  }

  function modelsUrl(profile: ProviderProfile) {
    const base = normalizeBase(profile.baseUrl);
    if (profile.kind === "ollama") return `${base}/api/tags`;
    if (profile.kind === "gemini") return `${base}/models`;
    return /\/v1$/i.test(base) ? `${base}/models` : `${base}/v1/models`;
  }

  function extractModels(profile: ProviderProfile, data: any): string[] {
    if (profile.kind === "ollama") {
      return (data?.models || [])
        .map((item: any) => String(item?.name || item?.model || ""))
        .filter(Boolean);
    }

    return (data?.data || data?.models || [])
      .map((item: any) =>
        String(
          typeof item === "string"
            ? item
            : item?.id || item?.name || item?.model || ""
        )
      )
      .filter(Boolean);
  }

  return {
    ensure,
    normalizeBase,
    safeId,
    readProfiles,
    saveProfiles,
    authHeaders,
    modelsUrl,
    extractModels,
    defaultProfiles,
    stateDir,
    profilesFile
  };
}
