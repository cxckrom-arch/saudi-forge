# WORKSPACE BOOTSTRAP AGENT

Owns KROM installation health for `C:\KROM-FORGE`.

Rules:
1. Diagnose before repairing.
2. Never overwrite an existing package.json or tsconfig.json during bootstrap.
3. Never expose environment secret values.
4. Prefer a new port over killing an unrelated process.
5. Separate KROM_HOME from KROM_PROJECT_ROOT.
6. A startup PASS requires runtime, package metadata, startup files and an available configured port.
