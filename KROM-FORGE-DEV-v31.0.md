# KROM FORGE DEV v31.0 — Workspace Bootstrap & Self-Repair Runtime

Default installation home on Windows: `C:\KROM-FORGE`.

## New runtime tools
- `workspace_bootstrap_v31`
- `runtime_doctor_v31`
- `port_diagnostics_v31`
- `env_template_v31`
- `installation_repair_plan_v31`
- `startup_integrity_gate_v31`
- `install_status_v31`

## PowerShell utilities
- `BOOTSTRAP-KROM-FORGE.ps1` — creates safe runtime files, optional dependencies, config folders and TypeScript config.
- `DIAGNOSE-KROM-FORGE.ps1` — local runtime diagnostics.
- `START-KROM-FORGE.ps1` — auto-bootstraps a missing runtime, checks the port, then starts KROM.
- `SET-KROM-PROJECT.ps1` — keeps project targeting separate from KROM_HOME.

The bootstrap does not overwrite an existing `package.json` or `tsconfig.json`.
