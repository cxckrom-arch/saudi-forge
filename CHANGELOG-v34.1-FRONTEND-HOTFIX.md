# KROM FORGE DEV v34.1 Frontend Hotfix

- Replaced legacy IDE title/banner `KROM FORGE DEV v8` with `KROM FORGE DEV v34.1`.
- Hardened AI Control Center loader.
- Loader waits for DOM readiness.
- Status/health are fetched together with no-store caching.
- Visible error state replaces indefinite `loading`.
- Provider cards render enabled, disabled, online and offline states.
- Model selector uses event listeners instead of fragile inline string quoting.
- No API keys are embedded in frontend code.
