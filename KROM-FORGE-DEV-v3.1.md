# KROM FORGE DEV v3.1 — LIVE BROWSER VISION

This release extends v3.0 with real rendered-browser verification.

## New tools
- `live_browser_vision` — launches headless Chromium through an installed Playwright package, visits routes, captures full-page screenshots, checks browser console/page errors, failed network requests, HTTP 4xx/5xx responses, and horizontal overflow.
- `live_browser_report` — converts the latest browser evidence into an ordered remediation handoff.
- `release_gate_v31` — requires clean technical gates, requirement evidence, and (by default) clean live-browser evidence before UI-heavy work can be considered releasable.

## Default viewport matrix
- 375×812 mobile
- 430×932 mobile
- 768×1024 tablet
- 1440×1000 desktop

## Required setup in the target project
Install Playwright or @playwright/test in the project. Example:

```powershell
npm install -D playwright
npx playwright install chromium
```

KROM intentionally reports `NOT_CONFIGURED` if no supported browser automation package is installed. It does not fake browser verification.

## Recommended autonomous flow
Prompt → Master Orchestrator → Precision Execution → UI Design Director → Developer → Live Browser Vision → Browser Report → Visual Designer → Fix Loop → Release Gate v3.1 → DONE

## Evidence files
The most recent report is stored under `.krom/live-browser/latest-report.json`. Screenshots default to `.krom/live-browser/screenshots/`.
