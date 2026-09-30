export type PackageScriptResult = {
  available?: boolean;
  status?: string;
  success?: boolean;
  stdout?: string;
  stderr?: string;
  message?: string;
};

export function parseDiagnostics(text: string, normalizeRel: (value: string) => string) {
  const out: any[] = [];
  const lines = text.split(/\r?\n/);
  const ts = /^(.+?)\((\d+),(\d+)\):\s*(error|warning)\s*([A-Z]*\d+)?:?\s*(.*)$/i;
  const eslint = /^(.+?):(\d+):(\d+)\s+(.+?)\s+(error|warning)\s+([\w@\-/]+)?$/i;

  for (const line of lines) {
    let match = line.match(ts);
    if (match) {
      out.push({
        file: normalizeRel(match[1]),
        line: Number(match[2]),
        column: Number(match[3]),
        severity: match[4].toLowerCase(),
        code: match[5] || null,
        message: match[6]
      });
      continue;
    }

    match = line.match(eslint);
    if (match) {
      out.push({
        file: normalizeRel(match[1]),
        line: Number(match[2]),
        column: Number(match[3]),
        message: match[4],
        severity: match[5].toLowerCase(),
        code: match[6] || null
      });
    }
  }

  return out.slice(0, 1000);
}

export function createDiagnosticsService(options: {
  runPackageScript: (candidateNames: string[]) => Promise<PackageScriptResult>;
  writeJson: (file: string, value: any) => Promise<any>;
  diagnosticsFile: string;
  normalizeRel: (value: string) => string;
}) {
  const { runPackageScript, writeJson, diagnosticsFile, normalizeRel } = options;

  async function diagnostics() {
    const checks: any[] = [];
    const typecheck = await runPackageScript(["typecheck", "check:types", "types"]);
    checks.push({ name: "typecheck", ...typecheck });

    const lint = await runPackageScript(["lint"]);
    checks.push({ name: "lint", ...lint });

    const diagnostics: any[] = [];
    for (const check of checks) {
      const blob = [check.stdout, check.stderr, check.message].filter(Boolean).join("\n");
      for (const diagnostic of parseDiagnostics(blob, normalizeRel)) {
        diagnostics.push({ ...diagnostic, source: check.name });
      }
    }

    const byFile: Record<string, any[]> = {};
    for (const diagnostic of diagnostics) {
      (byFile[diagnostic.file] ??= []).push(diagnostic);
    }

    const payload = {
      at: new Date().toISOString(),
      status: checks.some((check) => check.available !== false && check.success === false)
        ? "ERRORS"
        : diagnostics.some((diagnostic) => diagnostic.severity === "error")
          ? "ERRORS"
          : diagnostics.length
            ? "WARNINGS"
            : checks.every((check) => check.available === false)
              ? "SKIPPED"
              : "CLEAN",
      checks: checks.map((check) => ({
        name: check.name,
        status: check.status ?? (check.success ? "PASS" : "FAIL"),
        available: check.available ?? true,
        success: check.success ?? null
      })),
      count: diagnostics.length,
      byFile,
      diagnostics
    };

    await writeJson(diagnosticsFile, payload);
    return payload;
  }

  return { diagnostics };
}
