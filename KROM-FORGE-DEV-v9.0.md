# KROM FORGE DEV v9.0
## Engineering Operations Workbench

v9.0 extends the AI coding workbench with operational tooling required for long-running engineering sessions.

### New MCP tools
1. `runtime_process_manager_v9`
2. `test_explorer_v9`
3. `debug_log_center_v9`
4. `api_inspector_v9`
5. `database_panel_v9`
6. `env_secrets_manager_v9`
7. `extension_sdk_v9`
8. `workspace_profile_v9`
9. `dependency_doctor_v9`
10. `project_health_dashboard_v9`
11. `release_center_v9`

### Recommended flow
Prompt → Product Blueprint → Smart Context → Council → Preflight → Autopilot → IDE/Editor → Managed Runtime → Diagnostics/Test Explorer → API/DB/Env checks → Browser/Visual/Security → Health Dashboard → Release Center → Final Release Gate.

### Runtime process policy
Only scripts already declared in `package.json` can be launched through the managed runtime. This keeps execution bounded and inspectable.

### Secret policy
The environment panel returns variable names and whether they are present. Secret values are always shown as `[REDACTED]`.
