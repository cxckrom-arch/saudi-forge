# KROM FORGE DEV v30.0 — C:\KROM-FORGE default-path patch

- Default KROM home changed to `C:\KROM-FORGE`.
- Default project root is now `KROM_HOME` unless `KROM_PROJECT_ROOT` is explicitly set.
- Launcher no longer hard-codes `C:\ABDULKAREM-AI-X-MODEL`.
- Launcher no longer hard-codes an old ngrok public host.
- Added fallback to the extracted script directory if `C:\KROM-FORGE` does not exist.
- Added `SET-KROM-PROJECT.ps1` for changing the target repository without editing source files.
- Added `krom.config.json` documenting the Windows defaults.
