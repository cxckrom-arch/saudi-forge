import fs from "node:fs/promises";
import path from "node:path";
import { APP_VERSION } from "./release-info.js";

export type ProviderReliabilityEventType =
  | "REQUEST_PASS"
  | "REQUEST_FAIL"
  | "FAILOVER"
  | "CIRCUIT_OPEN"
  | "CIRCUIT_SKIP"
  | "RECOVERY_PROBE_PASS"
  | "RECOVERY_PROBE_FAIL";

export type ProviderReliabilityEvent = {
  at: string;
  providerId: string;
  provider?: string | null;
  model?: string | null;
  type: ProviderReliabilityEventType;
  latencyMs?: number | null;
  httpStatus?: number | null;
  error?: string | null;
};

type LedgerFile = {
  version: string;
  updatedAt: string;
  events: ProviderReliabilityEvent[];
};

export function createProviderReliabilityLedger(options: {
  directory: string;
  filename?: string;
  now?: () => number;
  maxEvents?: number;
}) {
  const now = options.now || (() => Date.now());
  const maxEvents = Math.max(50, Math.min(5000, Number(options.maxEvents || 500)));
  const file = path.join(options.directory, options.filename || "provider-reliability.json");
  let writes: Promise<void> = Promise.resolve();

  async function ensure() {
    await fs.mkdir(options.directory, { recursive: true });
  }

  async function read(): Promise<LedgerFile> {
    await ensure();
    try {
      const parsed = JSON.parse(await fs.readFile(file, "utf8"));
      return {
        version: APP_VERSION,
        updatedAt: String(parsed.updatedAt || new Date(now()).toISOString()),
        events: Array.isArray(parsed.events) ? parsed.events.slice(-maxEvents) : []
      };
    } catch (error: any) {
      if (error?.code !== "ENOENT" && error?.name !== "SyntaxError") throw error;
      return { version: APP_VERSION, updatedAt: new Date(now()).toISOString(), events: [] };
    }
  }

  async function write(data: LedgerFile) {
    await ensure();
    const payload = JSON.stringify({
      version: APP_VERSION,
      updatedAt: new Date(now()).toISOString(),
      events: data.events.slice(-maxEvents)
    }, null, 2);
    const task = writes.then(async () => {
      const temp = file + ".tmp";
      await fs.writeFile(temp, payload, "utf8");
      await fs.rename(temp, file);
    });
    writes = task.catch(() => {});
    await task;
  }

  async function record(event: Omit<ProviderReliabilityEvent, "at"> & { at?: string }) {
    const current = await read();
    const entry: ProviderReliabilityEvent = {
      at: event.at || new Date(now()).toISOString(),
      providerId: String(event.providerId),
      provider: event.provider ?? null,
      model: event.model ?? null,
      type: event.type,
      latencyMs: Number.isFinite(event.latencyMs) ? Number(event.latencyMs) : null,
      httpStatus: Number.isFinite(event.httpStatus) ? Number(event.httpStatus) : null,
      error: event.error ? String(event.error).slice(0, 300) : null
    };
    current.events.push(entry);
    await write(current);
    return entry;
  }

  async function summary() {
    const current = await read();
    const providers = new Map<string, ProviderReliabilityEvent[]>();
    for (const event of current.events) {
      const bucket = providers.get(event.providerId) || [];
      bucket.push(event);
      providers.set(event.providerId, bucket);
    }

    const rows = [...providers.entries()].map(([providerId, events]) => {
      const requestEvents = events.filter(x => x.type === "REQUEST_PASS" || x.type === "REQUEST_FAIL");
      const passes = requestEvents.filter(x => x.type === "REQUEST_PASS");
      const failures = requestEvents.filter(x => x.type === "REQUEST_FAIL");
      const latencies = passes.map(x => Number(x.latencyMs || 0)).filter(x => x > 0);
      const latest = events[events.length - 1];
      return {
        providerId,
        provider: [...events].reverse().find(x => x.provider)?.provider || null,
        requests: requestEvents.length,
        passes: passes.length,
        failures: failures.length,
        successRatePct: requestEvents.length ? Math.round((passes.length / requestEvents.length) * 100) : null,
        avgLatencyMs: latencies.length ? Math.round(latencies.reduce((a, b) => a + b, 0) / latencies.length) : null,
        failovers: events.filter(x => x.type === "FAILOVER").length,
        circuitOpens: events.filter(x => x.type === "CIRCUIT_OPEN").length,
        recoveries: events.filter(x => x.type === "RECOVERY_PROBE_PASS").length,
        lastEvent: latest?.type || null,
        lastEventAt: latest?.at || null
      };
    }).sort((a, b) =>
      (b.successRatePct ?? -1) - (a.successRatePct ?? -1) ||
      (a.avgLatencyMs ?? Number.MAX_SAFE_INTEGER) - (b.avgLatencyMs ?? Number.MAX_SAFE_INTEGER)
    );

    return {
      version: APP_VERSION,
      status: rows.length ? "READY" : "NO_HISTORY",
      file,
      eventCount: current.events.length,
      providers: rows
    };
  }

  async function recent(limit = 50) {
    const current = await read();
    return current.events.slice(-Math.max(1, Math.min(200, Number(limit || 50)))).reverse();
  }

  return { file, read, record, summary, recent };
}
