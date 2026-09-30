import fs from "node:fs/promises";
import path from "node:path";
import type { ProviderProfile } from "./provider-store.js";

export function createSecretManager(options: {
  kromHome: string;
  readProfiles: () => Promise<ProviderProfile[]>;
  providerHealth: (input: { providerId?: string }) => Promise<any>;
  selectModel: (input: { providerId: string; model: string }) => Promise<any>;
  providerControl: (input: { providerId: string; enabled?: boolean; priority?: number }) => Promise<any>;
  env?: NodeJS.ProcessEnv;
}) {
  const {
    kromHome,
    readProfiles,
    providerHealth,
    selectModel,
    providerControl,
    env = process.env
  } = options;

  function secretsFile() {
    return path.join(kromHome, ".krom-secrets", "provider-secrets.env");
  }

  async function loadSecretEnv() {
    const file = secretsFile();
    try {
      const text = await fs.readFile(file, "utf8");
      for (const raw of text.split(/\r?\n/)) {
        const line = raw.trim();
        if (!line || line.startsWith("#")) continue;
        const index = line.indexOf("=");
        if (index < 1) continue;

        const key = line.slice(0, index).trim();
        let value = line.slice(index + 1).trim();
        if (
          (value.startsWith('"') && value.endsWith('"')) ||
          (value.startsWith("'") && value.endsWith("'"))
        ) {
          value = value.slice(1, -1);
        }

        if (/^[A-Z_][A-Z0-9_]*$/i.test(key) && !env[key]) {
          env[key] = value;
        }
      }
    } catch {}
  }

  async function persistSecret(key: string, value: string) {
    if (!/^[A-Z_][A-Z0-9_]*$/i.test(key)) {
      throw new Error("Invalid secret environment variable name");
    }
    if (!value || value.length < 8) {
      throw new Error("API key is too short");
    }

    const file = secretsFile();
    const dir = path.dirname(file);
    await fs.mkdir(dir, { recursive: true });

    let lines: string[] = [];
    try {
      lines = (await fs.readFile(file, "utf8")).split(/\r?\n/);
    } catch {}

    const safe = value.replace(/\r|\n/g, "");
    let found = false;
    lines = lines.map((line) => {
      if (line.startsWith(key + "=")) {
        found = true;
        return key + "=" + safe;
      }
      return line;
    });
    if (!found) lines.push(key + "=" + safe);

    await fs.writeFile(file, lines.filter(Boolean).join("\n") + "\n", "utf8");
    env[key] = safe;

    return { configured: true, env: key, persisted: true };
  }

  async function setCredential(input: { providerId: string; apiKey: string }) {
    const profiles = await readProfiles();
    const profile = profiles.find((item) => item.id === input.providerId);
    if (!profile) throw new Error(`Unknown provider: ${input.providerId}`);
    if (!profile.apiKeyEnv) throw new Error("This provider does not require an API key");

    await persistSecret(profile.apiKeyEnv, input.apiKey);
    return {
      version: "34.5.0",
      status: "SAVED",
      providerId: profile.id,
      credentialConfigured: true,
      apiKeyEnv: profile.apiKeyEnv
    };
  }

  async function toggleProvider(input: { providerId: string; enabled: boolean }) {
    return providerControl({ providerId: input.providerId, enabled: input.enabled });
  }

  async function testProvider(input: { providerId: string }) {
    const health = await providerHealth({ providerId: input.providerId });
    const provider = (health.results || [])[0] || null;
    return {
      version: "34.5.0",
      status: provider?.ok ? "PASS" : "FAIL",
      provider
    };
  }

  async function setDefault(input: { providerId: string; model: string }) {
    const result = await selectModel(input);
    return {
      version: "34.5.0",
      status: "SAVED",
      providerId: input.providerId,
      model: input.model,
      result
    };
  }

  return {
    secretsFile,
    loadSecretEnv,
    persistSecret,
    setCredential,
    toggleProvider,
    testProvider,
    setDefault
  };
}
