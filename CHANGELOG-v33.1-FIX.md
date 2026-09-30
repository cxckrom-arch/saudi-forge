# KROM FORGE DEV v33.1 Runtime Fix

- Moved the v28 App Evolution function block to top-level scope so v29 can call it.
- Fixed cross-feature regression scope to reuse v19 regression planning instead of a nonexistent v330RegressionScope symbol.
- Updated Zod v4 record usage to `z.record(z.string(), z.any())`.
- Fixed PowerShell diagnostic script collision with the read-only `$HOME` variable by using `$kromHome`.
- Updated runtime banner and package/server version to 33.1.0.
