import fs from "node:fs/promises";
import path from "node:path";
import * as z from "zod/v4";

type ResultFn = (text: string) => any;
type ErrorResultFn = (error: unknown) => any;

export function registerCoreProjectTools(
  server: any,
  deps: {
    projectRoot: string;
    maxFileSize: number;
    result: ResultFn;
    errorResult: ErrorResultFn;
    safePath: (relativePath: string) => string;
    exists: (target: string) => Promise<boolean>;
    backupFile: (target: string) => Promise<any>;
    walkProject: (...args: any[]) => Promise<string[]>;
    readPackageJson: () => Promise<any>;
    detectPackageManager: () => Promise<any>;
    isTextFile: (file: string) => boolean;
    executeProgram: (...args: any[]) => Promise<any>;
    runPackageScript: (...args: any[]) => Promise<any>;
    recordChangedFile: (relativePath: string) => Promise<void>;
    recordCommandEvidence: (command: string, success: boolean, summary?: string) => Promise<void>;
  }
) {
  const {
    projectRoot: PROJECT_ROOT,
    maxFileSize: MAX_FILE_SIZE,
    result,
    errorResult,
    safePath,
    exists,
    backupFile,
    walkProject,
    readPackageJson,
    detectPackageManager,
    isTextFile,
    executeProgram,
    runPackageScript,
    recordChangedFile,
    recordCommandEvidence
  } = deps;

  // =========================================================
  // PROJECT INSPECTION
  // =========================================================

  server.registerTool(
    "inspect_project",
    {
      title: "Inspect Project",
      description:
        "Inspect project structure, package manager, scripts and framework indicators.",
      inputSchema: z.object({}),
      annotations: {
        readOnlyHint: true,
        openWorldHint: false
      }
    },
    async () => {
      try {
        const packageJson = await readPackageJson();

        const rootEntries = await fs.readdir(
          PROJECT_ROOT,
          { withFileTypes: true }
        );

        const packageManager =
          await detectPackageManager();

        const indicators = {
          react:
            Boolean(packageJson?.dependencies?.react) ||
            Boolean(packageJson?.devDependencies?.react),

          next:
            Boolean(packageJson?.dependencies?.next),

          vite:
            Boolean(packageJson?.dependencies?.vite) ||
            Boolean(packageJson?.devDependencies?.vite),

          electron:
            Boolean(packageJson?.dependencies?.electron) ||
            Boolean(packageJson?.devDependencies?.electron),

          typescript:
            await exists(
              path.join(PROJECT_ROOT, "tsconfig.json")
            ),

          git:
            await exists(
              path.join(PROJECT_ROOT, ".git")
            )
        };

        return result(
          JSON.stringify(
            {
              projectRoot: PROJECT_ROOT,
              packageManager,
              projectName: packageJson?.name ?? null,
              version: packageJson?.version ?? null,
              scripts: packageJson?.scripts ?? {},
              indicators,
              root: rootEntries.map((entry) => ({
                name: entry.name,
                type: entry.isDirectory()
                  ? "directory"
                  : "file"
              }))
            },
            null,
            2
          )
        );
      } catch (error) {
        return errorResult(error);
      }
    }
  );

  // =========================================================
  // LIST FILES
  // =========================================================

  server.registerTool(
    "list_files",
    {
      title: "List Project Files",
      description:
        "Recursively list project files while ignoring generated dependency directories.",
      inputSchema: z.object({
        limit: z.number()
          .int()
          .min(1)
          .max(4000)
          .default(1000)
      }),
      annotations: {
        readOnlyHint: true,
        openWorldHint: false
      }
    },
    async ({ limit }) => {
      try {
        const files = await walkProject(
          PROJECT_ROOT,
          [],
          limit
        );

        return result(
          files
            .map((file) =>
              path.relative(PROJECT_ROOT, file)
            )
            .join("\n")
        );
      } catch (error) {
        return errorResult(error);
      }
    }
  );

  // =========================================================
  // READ FILE
  // =========================================================

  server.registerTool(
    "read_file",
    {
      title: "Read File",
      description:
        "Read a UTF-8 source or configuration file inside the project.",
      inputSchema: z.object({
        path: z.string().min(1)
      }),
      annotations: {
        readOnlyHint: true,
        openWorldHint: false
      }
    },
    async ({ path: relativePath }) => {
      try {
        const target = safePath(relativePath);
        const stat = await fs.stat(target);

        if (stat.size > MAX_FILE_SIZE) {
          throw new Error(
            `File is too large: ${stat.size} bytes`
          );
        }

        const content = await fs.readFile(
          target,
          "utf8"
        );

        return result(content);
      } catch (error) {
        return errorResult(error);
      }
    }
  );

  // =========================================================
  // SEARCH CODE
  // =========================================================

  server.registerTool(
    "search_code",
    {
      title: "Search Code",
      description:
        "Search project text files for code, symbols, text or error messages.",
      inputSchema: z.object({
        query: z.string().min(1),
        caseSensitive: z.boolean().default(false),
        maxResults: z.number()
          .int()
          .min(1)
          .max(100)
          .default(30)
      }),
      annotations: {
        readOnlyHint: true,
        openWorldHint: false
      }
    },
    async ({
      query,
      caseSensitive,
      maxResults
    }) => {
      try {
        const files = await walkProject();
        const matches: any[] = [];

        const wanted = caseSensitive
          ? query
          : query.toLowerCase();

        for (const file of files) {
          if (matches.length >= maxResults) break;
          if (!isTextFile(file)) continue;

          let stat;

          try {
            stat = await fs.stat(file);
          } catch {
            continue;
          }

          if (stat.size > MAX_FILE_SIZE) {
            continue;
          }

          let content: string;

          try {
            content = await fs.readFile(file, "utf8");
          } catch {
            continue;
          }

          const lines = content.split(/\r?\n/);

          for (
            let index = 0;
            index < lines.length;
            index++
          ) {
            const searchable = caseSensitive
              ? lines[index]
              : lines[index].toLowerCase();

            if (searchable.includes(wanted)) {
              matches.push({
                file: path.relative(
                  PROJECT_ROOT,
                  file
                ),
                line: index + 1,
                text: lines[index].trim()
              });
            }

            if (matches.length >= maxResults) {
              break;
            }
          }
        }

        return result(
          JSON.stringify(
            {
              query,
              count: matches.length,
              matches
            },
            null,
            2
          )
        );
      } catch (error) {
        return errorResult(error);
      }
    }
  );

  // =========================================================
  // WRITE FILE
  // =========================================================

  server.registerTool(
    "write_file",
    {
      title: "Write File",
      description:
        "Create or replace a project text file. Existing files are backed up first.",
      inputSchema: z.object({
        path: z.string().min(1),
        content: z.string()
      }),
      annotations: {
        readOnlyHint: false,
        destructiveHint: true,
        idempotentHint: true,
        openWorldHint: false
      }
    },
    async ({
      path: relativePath,
      content
    }) => {
      try {
        const target = safePath(relativePath);

        const backup = await backupFile(target);

        await fs.mkdir(path.dirname(target), {
          recursive: true
        });

        await fs.writeFile(
          target,
          content,
          "utf8"
        );

        await recordChangedFile(relativePath);

        return result(
          JSON.stringify(
            {
              success: true,
              file: relativePath,
              backup:
                backup
                  ? path.relative(PROJECT_ROOT, backup)
                  : null
            },
            null,
            2
          )
        );
      } catch (error) {
        return errorResult(error);
      }
    }
  );

  // =========================================================
  // SURGICAL PATCH
  // =========================================================

  server.registerTool(
    "patch_file",
    {
      title: "Patch File",
      description:
        "Replace an exact piece of text in a project file with automatic backup.",
      inputSchema: z.object({
        path: z.string().min(1),
        search: z.string().min(1),
        replace: z.string(),
        replaceAll: z.boolean().default(false)
      }),
      annotations: {
        readOnlyHint: false,
        destructiveHint: true,
        idempotentHint: false,
        openWorldHint: false
      }
    },
    async ({
      path: relativePath,
      search,
      replace,
      replaceAll
    }) => {
      try {
        const target = safePath(relativePath);

        const original = await fs.readFile(
          target,
          "utf8"
        );

        const occurrences =
          original.split(search).length - 1;

        if (occurrences === 0) {
          throw new Error(
            "Search text was not found. File was not modified."
          );
        }

        if (!replaceAll && occurrences > 1) {
          throw new Error(
            `Search text occurs ${occurrences} times. Use a more specific search or set replaceAll=true.`
          );
        }

        const updated = replaceAll
          ? original.split(search).join(replace)
          : original.replace(search, replace);

        const backup = await backupFile(target);

        await fs.writeFile(
          target,
          updated,
          "utf8"
        );

        await recordChangedFile(relativePath);

        return result(
          JSON.stringify(
            {
              success: true,
              file: relativePath,
              occurrences,
              replaced: replaceAll
                ? occurrences
                : 1,
              backup:
                backup
                  ? path.relative(PROJECT_ROOT, backup)
                  : null
            },
            null,
            2
          )
        );
      } catch (error) {
        return errorResult(error);
      }
    }
  );

  // =========================================================
  // CONTROLLED TERMINAL
  // =========================================================

  server.registerTool(
    "run_command",
    {
      title: "Run Development Command",
      description:
        "Run an approved development executable inside the project without invoking a shell.",
      inputSchema: z.object({
        program: z.string().min(1),
        args: z.array(z.string()).default([]),
        cwd: z.string().default("."),
        timeoutSeconds: z.number()
          .int()
          .min(1)
          .max(300)
          .default(180)
      }),
      annotations: {
        readOnlyHint: false,
        destructiveHint: true,
        openWorldHint: true
      }
    },
    async ({
      program,
      args,
      cwd,
      timeoutSeconds
    }) => {
      try {
        const allowed = new Set([
          "node",
          "npm",
          "npx",
          "pnpm",
          "yarn",
          "bun",
          "python",
          "python3",
          "pip",
          "pip3",
          "pytest",
          "tsc",
          "eslint",
          "vite",
          "next",
          "git",
          "cargo",
          "go",
          "dotnet",
          "mvn",
          "gradle",
          "java",
          "javac"
        ]);

        if (
          program.includes("/") ||
          program.includes("\\") ||
          !allowed.has(program.toLowerCase())
        ) {
          throw new Error(
            `Program is not allowed: ${program}`
          );
        }

        if (program.toLowerCase() === "git") {
          const gitAction =
            String(args[0] || "").toLowerCase();

          const safeGit = new Set([
            "status",
            "diff",
            "log",
            "show",
            "branch",
            "rev-parse"
          ]);

          if (!safeGit.has(gitAction)) {
            throw new Error(
              `git ${gitAction} is blocked in run_command.`
            );
          }
        }

        const workingDirectory = safePath(cwd);

        const execution = await executeProgram(
          program,
          args,
          workingDirectory,
          timeoutSeconds * 1000
        );

        await recordCommandEvidence(
          [program, ...args].join(" "),
          execution.success,
          execution.success ? "PASS" : (execution.message || execution.stderr || "FAIL").slice(0, 500)
        );

        return result(
          JSON.stringify(execution, null, 2)
        );
      } catch (error) {
        return errorResult(error);
      }
    }
  );

  // =========================================================
  // BUILD
  // =========================================================

  server.registerTool(
    "run_build",
    {
      title: "Run Build",
      description:
        "Run the project's build script and return real evidence.",
      inputSchema: z.object({}),
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        openWorldHint: false
      }
    },
    async () =>
      result(
        JSON.stringify(
          await runPackageScript(["build"]),
          null,
          2
        )
      )
  );

  // =========================================================
  // TESTS
  // =========================================================

  server.registerTool(
    "run_tests",
    {
      title: "Run Tests",
      description:
        "Run the project's automated test script.",
      inputSchema: z.object({}),
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        openWorldHint: false
      }
    },
    async () =>
      result(
        JSON.stringify(
          await runPackageScript([
            "test",
            "test:ci"
          ]),
          null,
          2
        )
      )
  );

  // =========================================================
  // LINT
  // =========================================================

  server.registerTool(
    "run_lint",
    {
      title: "Run Lint",
      description:
        "Run the project's lint script.",
      inputSchema: z.object({}),
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        openWorldHint: false
      }
    },
    async () =>
      result(
        JSON.stringify(
          await runPackageScript(["lint"]),
          null,
          2
        )
      )
  );

  // =========================================================
  // TYPECHECK
  // =========================================================

  server.registerTool(
    "run_typecheck",
    {
      title: "Run Type Check",
      description:
        "Run an existing project type checking script.",
      inputSchema: z.object({}),
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        openWorldHint: false
      }
    },
    async () =>
      result(
        JSON.stringify(
          await runPackageScript([
            "typecheck",
            "type-check",
            "check:types",
            "check"
          ]),
          null,
          2
        )
      )
  );

  // =========================================================
  // GIT STATUS
  // =========================================================

  server.registerTool(
    "git_status",
    {
      title: "Git Status",
      description:
        "Inspect current Git worktree status.",
      inputSchema: z.object({}),
      annotations: {
        readOnlyHint: true,
        openWorldHint: false
      }
    },
    async () => {
      const execution = await executeProgram(
        "git",
        ["status", "--short", "--branch"]
      );

      return result(
        JSON.stringify(execution, null, 2)
      );
    }
  );

  // =========================================================
  // GIT DIFF
  // =========================================================

  server.registerTool(
    "git_diff",
    {
      title: "Git Diff",
      description:
        "Show uncommitted source changes.",
      inputSchema: z.object({}),
      annotations: {
        readOnlyHint: true,
        openWorldHint: false
      }
    },
    async () => {
      const execution = await executeProgram(
        "git",
        ["diff", "--"]
      );

      return result(
        JSON.stringify(execution, null, 2)
      );
    }
  );

  // =========================================================
  // VERIFICATION GATE
  // =========================================================

  server.registerTool(
    "verification_gate",
    {
      title: "KROM Verification Gate",
      description:
        "Execute build, tests, lint and typecheck when available and calculate an evidence-based result.",
      inputSchema: z.object({}),
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        openWorldHint: false
      }
    },
    async () => {
      const build = await runPackageScript([
        "build"
      ]);

      const tests = await runPackageScript([
        "test",
        "test:ci"
      ]);

      const lint = await runPackageScript([
        "lint"
      ]);

      const typecheck = await runPackageScript([
        "typecheck",
        "type-check",
        "check:types",
        "check"
      ]);

      const checks = {
        build,
        tests,
        lint,
        typecheck
      };

      const available = Object.values(checks)
        .filter((check: any) => check.available);

      const failed = available
        .filter((check: any) =>
          check.status === "FAIL"
        );

      let verdict:
        | "PASS"
        | "PASS_WITH_GAPS"
        | "FAIL";

      if (failed.length > 0) {
        verdict = "FAIL";
      } else if (available.length === 4) {
        verdict = "PASS";
      } else {
        verdict = "PASS_WITH_GAPS";
      }

      return result(
        JSON.stringify(
          {
            verdict,
            projectRoot: PROJECT_ROOT,
            checks
          },
          null,
          2
        )
      );
    }
  );




}
