import fs from "node:fs/promises";
import { lstatSync } from "node:fs";
import path from "node:path";

export const MAX_FILE_SIZE = 1024 * 1024;

export const IGNORED_DIRS = new Set([
  "node_modules",
  ".git",
  "dist",
  "build",
  ".next",
  ".nuxt",
  "coverage",
  ".turbo",
  ".cache",
  ".krom-backups",
  "release",
  ".krom-secrets"
]);

export const TEXT_EXTENSIONS = new Set([
  ".ts", ".tsx", ".js", ".jsx",
  ".mjs", ".cjs",
  ".json",
  ".html", ".css", ".scss", ".sass", ".less",
  ".md", ".txt",
  ".py",
  ".java",
  ".cs",
  ".go",
  ".rs",
  ".php",
  ".vue",
  ".svelte",
  ".sql",
  ".yaml", ".yml",
  ".toml",
  ".xml",
  ".env.example"
]);

const PROTECTED_ROOT_NAMES = new Set([".krom-secrets"]);
const PROTECTED_EXTENSIONS = new Set([".pem", ".key", ".p12", ".pfx"]);

export function isSensitiveProjectPath(input: string) {
  const normalized = input.replaceAll("\\", "/").replace(/^\.\//, "");
  const segments = normalized.split("/").filter(Boolean);
  const base = segments.at(-1)?.toLowerCase() ?? "";
  return PROTECTED_ROOT_NAMES.has(segments[0] ?? "") ||
    (base.startsWith(".env") && base !== ".env.example") ||
    PROTECTED_EXTENSIONS.has(path.extname(base));
}

export function createProjectContext(projectRoot: string) {
  const root = path.resolve(projectRoot);

  function safePath(input = ".") {
    const resolved = path.resolve(root, input);
    if (resolved !== root && !resolved.startsWith(root + path.sep)) {
      throw new Error(`Access outside KROM_PROJECT_ROOT is blocked: ${input}`);
    }
    const relative = path.relative(root, resolved);
    let cursor = root;
    for (const segment of relative ? relative.split(path.sep) : []) {
      cursor = path.join(cursor, segment);
      try {
        if (lstatSync(cursor).isSymbolicLink()) {
          throw new Error(`Symbolic-link paths are blocked inside KROM_PROJECT_ROOT: ${input}`);
        }
      } catch (error: any) {
        if (error?.code === "ENOENT") continue;
        throw error;
      }
    }
    return resolved;
  }

  async function exists(target: string) {
    try {
      await fs.access(target);
      return true;
    } catch {
      return false;
    }
  }

  async function backupFile(filePath: string) {
    if (!(await exists(filePath))) return null;
    const relative = path.relative(root, filePath);
    const stamp = new Date().toISOString().replace(/[:.]/g, "-");
    const backupPath = path.join(root, ".krom-backups", stamp, relative);
    await fs.mkdir(path.dirname(backupPath), { recursive: true });
    await fs.copyFile(filePath, backupPath);
    return backupPath;
  }

  function isTextFile(filePath: string) {
    const base = path.basename(filePath).toLowerCase();
    if (base === "dockerfile" || base === "makefile" || base === ".gitignore" || base === ".npmrc") {
      return true;
    }
    return TEXT_EXTENSIONS.has(path.extname(filePath).toLowerCase());
  }

  async function walkProject(directory = root, output: string[] = [], limit = 4000): Promise<string[]> {
    if (output.length >= limit) return output;
    const entries = await fs.readdir(directory, { withFileTypes: true });
    for (const entry of entries) {
      if (output.length >= limit) break;
      if (entry.isSymbolicLink()) continue;
      if (entry.isDirectory() && IGNORED_DIRS.has(entry.name)) continue;
      const full = path.join(directory, entry.name);
      if (entry.isDirectory()) await walkProject(full, output, limit);
      else output.push(full);
    }
    return output;
  }

  async function readPackageJson(): Promise<any | null> {
    try {
      return JSON.parse(await fs.readFile(path.join(root, "package.json"), "utf8"));
    } catch {
      return null;
    }
  }

  async function detectPackageManager() {
    const pkg = await readPackageJson();
    if (pkg?.packageManager) {
      const name = String(pkg.packageManager).split("@")[0];
      if (["npm", "pnpm", "yarn", "bun"].includes(name)) return name;
    }
    if (await exists(path.join(root, "pnpm-lock.yaml"))) return "pnpm";
    if (await exists(path.join(root, "yarn.lock"))) return "yarn";
    if (await exists(path.join(root, "bun.lockb")) || await exists(path.join(root, "bun.lock"))) return "bun";
    return "npm";
  }

  return { root, safePath, exists, backupFile, isTextFile, walkProject, readPackageJson, detectPackageManager, isSensitiveProjectPath };
}
