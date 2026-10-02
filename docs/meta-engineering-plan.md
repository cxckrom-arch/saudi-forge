# Saudi Forge Meta Engineering Upgrade

## Scope

This upgrade adds a governed meta-engineering layer to the existing Saudi Forge platform. It does not rewrite the historical v1–v50 catalog, existing provider/runtime controls, or the passing filesystem and release probes.

## Gap matrix

| Requirement | Existing capability | Gap | Action |
|---|---|---|---|
| Skill factory | Existing skill registry and manual packages | No governed package generator | Add draft-only `skill_create_v51` with safe metadata, resources, and security level |
| Skill validator | `quick_validate.py` outside runtime | No MCP-native structured validator | Add frontmatter, size, references, scripts, path, secret, URL, and conflict checks |
| Skill discovery | No trusted discovery boundary | No cached/search/deep-dive workflow | Add explicit GitHub discovery with source metadata and no auto-install |
| Canonical registry | 24 fixed entries | No version/hash/status lifecycle | Add versioned manifest view, content hashes, status, dependencies, and validation timestamps |
| Compliance gate | v50 duplicate/unknown checks | Historical assumptions and no statuses/hash/dependency checks | Add current-registry compliance gate without a twelve-skill ceiling |
| Capability gaps | Routing only | No failure-history and capability-gap analysis | Add deterministic gap analyzer using skills, tool catalog, and recorded failures |
| Skill supply-chain security | Secret/path protections | No skill-package security scan | Add quarantine/block findings for dangerous scripts, secrets, URLs, traversal, and encoded payloads |
| AppSec and secure code | Existing security tools | No structured threat/SAST result model | Add bounded static pattern scan and STRIDE-style threat model output |
| MCP contract security | Full audit schema checks | No reusable per-tool classification/fuzz contract | Add schema/null/missing/oversize/path contract audit and structured failures |
| Audit clarity | Raw booleans and reports | No normalized PASS/REVIEW/BLOCKED_EXPECTED model | Add normalized outcome model with invocation/contract/outcome metadata |
| Autonomous repair | Existing repair/autopilot services | No explicit risk policy/ledger/rollback gate | Add plan-only repair governance, confidence scoring, risk boundaries, and change ledger |
| Self-evolution | Learning memory and routing history | No bounded improvement proposal | Add one-batch-at-a-time proposals with before/after evidence requirements |
| Observability | Provider reliability and v11 metrics | No meta-system snapshot/catalog drift | Add metrics snapshot, tool drift report, configured SLO view, and reproducible audit metadata |
| Release governance | Multiple release gates | No single meta release gate | Add ordered gate aggregator that blocks security and integrity failures |
| Admin/control UX | Existing server-rendered IDE | No meta control-center route | Add a compact `/meta` evidence dashboard backed by read-only meta status APIs |

## Architecture

`src/meta/` is split by responsibility:

- `types.ts` — shared contracts, statuses, modes, and evidence models.
- `registry.ts` — current registry loading, hashes, versions, dependencies, and duplicate/ownership checks.
- `skill-factory.ts` — draft package generation and safe naming/path rules.
- `skill-validator.ts` — package validation and security findings.
- `discovery.ts` — explicit trusted-source lookup and deep-dive metadata; never installs.
- `security.ts` — supply-chain, SAST, threat-model, secret, and MCP contract probes.
- `audit.ts` — normalized outcomes and reproducible audit metadata.
- `autonomy.ts` — mode boundaries, repair plans, confidence, rollback, change ledger, and improvement proposals.
- `observability.ts` — counters, SLO configuration, catalog drift, and operational snapshots.
- `release.ts` — ordered release gate aggregation.
- `tools.ts` — thin MCP registration only; no business logic.

All writes are constrained to `.krom/meta/` or draft paths beneath the configured project root. Canonical activation, high-risk repair, credential handling, migrations, security-gate changes, and release promotion remain gated and are never automatic.

## Modes

New installations default to `OBSERVE`. `SUGGEST` may create plans and draft packages. `AUTO_SAFE` may only apply bounded, reproducible low-risk repairs with tests and rollback. `CONTROLLED_AUTONOMOUS` still requires security, diff, release, and verification gates for every batch.

## Acceptance evidence

The implementation must preserve the seven existing security probes, add positive/negative skill factory and compliance tests, normalize expected blocked fixture outcomes, produce a catalog drift report, and make the release gate fail closed on secrets, traversal, junction escape, auth bypass, quarantined skills, failed required tests, or unavailable rollback.
