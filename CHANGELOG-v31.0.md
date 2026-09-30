# v31.0

Added Workspace Bootstrap & Self-Repair Runtime for the canonical Windows home `C:\KROM-FORGE`.

- Self-bootstrap of missing runtime metadata.
- Node/npm/Git diagnostics.
- Port collision diagnosis.
- Safe `.env.example` generation without secrets.
- Runtime repair plan.
- Startup integrity gate.
- Auto-bootstrap from `START-KROM-FORGE.ps1` when package metadata or node_modules are missing.
