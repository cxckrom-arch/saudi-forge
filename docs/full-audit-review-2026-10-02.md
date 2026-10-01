# Full Audit Review — KROM Forge

**Review date:** 2026-10-02
**Source:** `reports/full-audit/local-results.json`
**Scope:** 5,289 registered tools, generated static-analysis families, read-only default executions, security probes, routing probes, release-gate probes, and the separate HTTP audit harness.

## Executive conclusion

The core audit is strong: all **4,842 generated family checks passed**, all **5,289 schemas were valid**, no schema accepted `null`, and all seven controlled security/reliability probes passed. The report does not indicate a new confirmed defect in the repaired security, routing, undo, or release-gate paths.

The main improvement is audit semantics. The current harness reports twelve read-only executions as `ok: false`, but most of them are expected state outcomes from a deliberately minimal disposable fixture. A `BLOCKED`, `NEEDS_REPAIR`, `NO_ACTIVE_RUN`, or `GIT_UNAVAILABLE` result is not automatically an audit-harness failure. The next revision should separate **invocation failure**, **contract failure**, **expected blocked state**, and **environment prerequisite missing**.

## Coverage snapshot

| Area | Result | Interpretation |
|---|---:|---|
| Registered tools | 5,289 | Catalog was fully inspected for schema metadata. |
| Generated static-analysis executions | 4,842 | 4,842 passed; 0 failed. |
| Read-only default executions | 125 | 113 returned successfully; 12 were classified as failures by the current harness. |
| Schemas | 5,289 valid | No invalid JSON-schema conversion was observed. |
| Null rejection | 5,289/5,289 | No tested tool accepted `null` as its whole input. |
| Excluded tools | 322 | 177 required scenario inputs, 129 were state-changing/targeted, and 16 required external side effects or explicit fixtures. |
| Controlled probes | 7/7 passed | Secret boundary, traversal, junction, Undo, routing, platform gate, and release gate behaved correctly. |
| Latency | Median 0 ms; p95 1 ms; max 205 ms | No generated check exceeded 12 ms; slower work was concentrated in runtime/workbench/provider checks. |

## Controlled probes — all passing

1. **Secret boundary:** direct MCP access to `.krom-secrets/provider-secrets.env` was blocked and the synthetic canary was not exposed.
2. **Lexical traversal:** `../outside/canary.txt` was blocked.
3. **Symlink/junction boundary:** an existing junction to an outside directory was blocked.
4. **Repeated Undo:** after writes `A → B → C`, two Undo operations produced `B → A`.
5. **Legacy routing:** requiring health returned `NO_PROVIDER` for an offline-only provider instead of routing to it.
6. **Developer Platform Gate:** an enabled-but-offline provider produced `BLOCKED` rather than `PASS`.
7. **Release Center:** an opaque failing typecheck produced `BLOCKED` with diagnostic status `ERRORS`.

## The twelve reported read-only failures

These are the entries currently surfaced as `ok: false`:

| Group | Tools | Finding | Classification |
|---|---|---|---|
| Git fixture missing | `git_status`, `git_diff` | The disposable fixture has no `.git` directory. | Harness prerequisite gap; initialize a local repository or mark `GIT_UNAVAILABLE` as expected. |
| Product/release evidence absent | `product_release_readiness` | The fixture has no completed product blueprint/evidence. | Expected blocked state; not a tool failure. |
| No active execution state | `evidence_validator_v18` | No active v18 run exists. | Expected precondition result. |
| Governance evidence absent | `evidence_policy_check_v22`, `compliance_matrix_v22`, `policy_evaluate_v22`, `governance_gate_v22`, `governance_status_v22` | Strict governance correctly blocks without release attestation/evidence bundle. | Expected blocked state; add a positive fixture in a separate governance scenario. |
| Runtime fixture incomplete | `runtime_doctor_v31`, `startup_integrity_gate_v31` | The disposable project intentionally lacks a complete `server.ts`, start script, and runtime declaration. | Expected fixture limitation; use a second runtime-ready fixture. |
| Provider not configured | `developer_platform_gate_v35` | The read-only pass runs before the controlled provider setup and correctly sees no healthy provider. | Expected precondition result; run a positive provider scenario separately. |

**Recommended semantic change:** add fields such as `invoked`, `contractOk`, `outcomeClass`, and `expectedForFixture`. For example, a governance tool returning `BLOCKED` with a valid structured payload should be `invoked: true`, `contractOk: true`, `outcomeClass: "expected-blocked"`, not a raw failure.

## Highest-value improvements

### P0 — Make the HTTP audit assert security outcomes

`tests/full-audit-http.mjs` currently records `HTTP-secret-canary-readable` and `HTTP-junction-escape` as event names but does not fail when the secret is exposed or the junction escapes. It also records origin checks without defining an allow/deny expectation. Convert these events into assertions:

- secret response must be non-2xx or contain no canary;
- junction response must be non-2xx or contain no outside canary;
- invalid MCP input must return a protocol error or an `isError` result;
- untrusted Origin must be rejected or handled according to the documented policy;
- crafted filenames must be rendered through safe DOM data handling, not only checked for a string pattern.

Then make `test:full-audit:http` exit non-zero on a failed event and include `passed`, `failed`, and `expected` fields in `http-results.json`.

### P0 — Add explicit positive and negative skill compliance probes

The current local audit executes `skills_registry_v50` as a default read-only tool, but `skills_for_task_v50` and `skills_compliance_gate_v50` are excluded because they require inputs. Add two controlled cases:

- the exact twelve IDs must return `PASS`;
- a list containing the duplicate legacy orchestrator, the optional Computer Vision pack, or a duplicate canonical ID must return `BLOCKED` with a specific reason.

This directly proves that the skills integrated into KROM Forge are the twelve tested skills and that duplicate/optional packs cannot silently replace the canonical set.

### P1 — Use a two-fixture audit model

Keep the current minimal fixture for safe negative tests, but add:

1. a **git-ready fixture** with `git init`, a configured local identity, and one committed file;
2. a **runtime-ready fixture** with the minimum `server.ts`, package scripts, and expected runtime files;
3. a **governance-ready fixture** containing a synthetic blueprint, evidence bundle, and release attestation.

This makes positive readiness checks meaningful without weakening the negative security fixture.

### P1 — Normalize tool outcomes

The report currently depends on `r.isError` and treats all thrown or error-shaped responses as equivalent. Introduce a shared outcome normalizer with categories such as:

- `PASS`
- `REVIEW`
- `BLOCKED_EXPECTED`
- `BLOCKED_UNEXPECTED`
- `UNAVAILABLE_EXPECTED`
- `HARNESS_ERROR`

The normalizer should preserve the raw status and a short redacted reason. This will make the release report useful to humans instead of requiring manual interpretation of twelve false-looking failures.

### P1 — Add catalog completeness and version-drift checks

There are 78 unversioned tools and multiple historical suffix families (`v12` through `v50`, including `v342`). This is not a runtime failure, but it weakens traceability. Add a catalog audit that reports:

- duplicate tool names;
- tools missing a version or domain owner;
- version suffixes that do not match the owning module;
- tools whose title/description version disagrees with the release identity.

Do not rename all legacy tools in one change; first produce a drift report and enforce metadata on new tools.

### P2 — Improve report durability and reproducibility

The report stores a temporary fixture path and source hash but not the Git commit, Node version, OS, package-lock hash, or exact command. Add those fields and redact the fixture path when publishing reports. This allows later comparison between audit runs and prevents a passing report from being detached from its source revision.

### P2 — Reduce output noise while preserving detail

The 4,000 v15 generated checks dominate the catalog and make human review difficult even though they are fast and all pass. Keep every result in JSON, but add grouped summaries by version, domain, status, and latency bucket. The Markdown report should show aggregates and only list failures/outliers.

## Additional observations

The slowest checks were `workbench_state_v8` at 205 ms, `developer_platform_gate_v35` at 195 ms, `developer_platform_status_v35` at 187 ms, `startup_integrity_gate_v31` at 152 ms, and `runtime_doctor_v31` at 147 ms. These are reasonable for stateful/runtime checks, but they should be tagged as integration-sensitive so latency regressions are not mixed with static-analysis performance.

The separate HTTP audit harness is valuable but was not included in the local `npm run test:full-audit` command and no `http-results.json` existed in the reviewed run. The release pipeline should run the HTTP audit in an isolated step after the local audit and fail on security assertion regressions.

## Suggested next implementation order

1. Harden `full-audit-http.mjs` with real pass/fail assertions.
2. Add the two explicit skill compliance probes.
3. Add outcome classification to remove expected-state false failures.
4. Add git-ready, runtime-ready, and governance-ready fixture scenarios.
5. Add catalog/version drift and reproducibility metadata.

## Final judgment

**No new confirmed security defect was found in the 4,842 generated checks or seven controlled probes.** The most important remaining work is improving the audit harness itself: HTTP assertions, positive fixtures, explicit twelve-skill coverage, and normalized outcome semantics. Those changes will make Full Audit a more reliable release gate rather than merely a large successful execution count.
