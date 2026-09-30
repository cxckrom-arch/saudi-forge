import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { resolveCommand } from "./process-command.js";

const execFileAsync = promisify(execFile);

type PackageReader = () => Promise<any | null>;
type ManagerDetector = () => Promise<string>;

export function createPackageRunner(options: {
  projectRoot: string;
  readPackageJson: PackageReader;
  detectPackageManager: ManagerDetector;
}) {
  const { projectRoot, readPackageJson, detectPackageManager } = options;

  async function executeProgram(
    program: string,
    args: string[],
    cwd = projectRoot,
    timeout = 180000
  ) {
    try {
      const resolvedCommand = await resolveCommand(program, args);
      const execution = await execFileAsync(
        resolvedCommand.program,
        resolvedCommand.args,
        {
          cwd,
          timeout,
          windowsHide: true,
          maxBuffer: 10 * 1024 * 1024,
          encoding: "utf8"
        } as any
      );

      return {
        success: true,
        program,
        args,
        stdout: String(execution.stdout || ""),
        stderr: String(execution.stderr || "")
      };
    } catch (error: any) {
      return {
        success: false,
        program,
        args,
        stdout: String(error?.stdout || ""),
        stderr: String(error?.stderr || ""),
        message: error?.message || String(error),
        code: error?.code ?? null
      };
    }
  }

  async function runPackageScript(candidateNames: string[]) {
    const pkg = await readPackageJson();
    const scripts = pkg?.scripts || {};
    const scriptName = candidateNames.find(
      (name) => typeof scripts[name] === "string"
    );

    if (!scriptName) {
      return {
        available: false,
        status: "SKIPPED",
        reason: `No script found: ${candidateNames.join(", ")}`
      };
    }

    const manager = await detectPackageManager();
    const execution = await executeProgram(
      manager,
      ["run", scriptName],
      projectRoot,
      300000
    );

    return {
      available: true,
      status: execution.success ? "PASS" : "FAIL",
      packageManager: manager,
      script: scriptName,
      ...execution
    };
  }

  return { executeProgram, runPackageScript };
}
