# Launchrail roadmap

> Living document — the public answer to "what exists, what's in progress, what's missing." Update it in the same commit as the work it describes.

## Current status

Phases 1–5 are implemented (phase 4's end-to-end dogfood run is still open). `launchrail init` and `launchrail doctor` work on blank and existing repositories (interview or `--yes`, `--dry-run`, idempotent re-runs, checksum-tracked lockfile). The Claude plugin carries the core workflow — `vision-creation` and `design-validation` skills, a stage-by-stage workflow doc composing Matt Pocock's grill/research/spec skills, and plugin subscription via a project-scoped `.claude/settings.json` declaration (ADR-0003) — plus `browser-smoke`. `launchrail add browser-testing` seeds the browser-testing module (Playwright baseline, semantic scripts, smoke-journey contract, ADR-0004) with `launchrail verify` and `launchrail smoke` as the verification surface. `launchrail add ralph` installs the Ralph campaign: the `ralph`/`ralph-implement`/`resolving-merge-conflicts` skills in the plugin plus a managed `.claude/workflows/ralph.js` workflow, verification-gated end to end (ADR-0005). The sync engine (ADR-0006) keeps older projects current: `status`, `diff`, and `sync` share the safe writer's plan, migrations are ordered and idempotent, and `eject` provides vendor mode — the managed Ralph workflow receives updates through it. 118 tests, including integration tests against temporary git repositories. Nothing is published to npm.

## Phase 1 — `init` + `doctor`

**Goal:** `npx @wemuda/launchrail init && npx @wemuda/launchrail doctor` works on a blank repo and a realistic existing repo without destroying local files.

- [x] `.launchrail.yml` manifest schema and the ownership model (managed / seeded / project-owned)
- [x] `.launchrail-lock.json` lockfile (versions, checksums, applied migrations)
- [x] Safe file writer: dry-run, checksum tracking, idempotent re-runs
- [x] New/existing repository detection (package manager, stack, git remote, existing agent files)
- [x] Init interview: project mode (spike / standard MVP / high-rigor), issue tracker, Conventional Commits (ADR-0002), test commands
- [x] Seed `AGENTS.md` + `CLAUDE.md` arrangement without overwriting existing content; chosen conventions (commit format, commands, definition of done) are written into the seeded `AGENTS.md`
- [x] Seed ADR conventions (`docs/adr/` + template)
- [x] Matt Pocock skills installation guidance and setup detection
- [x] `doctor`: baseline repository and environment checks
- [x] Fixture and integration tests against temporary git repositories

## Phase 2 — Core workflow plugin

**Goal:** a fresh project can move from idea to an approved MVP spec through committed artifacts. Launchrail composes Matt Pocock's skills wherever one already covers a stage — no duplicate skills.

- [x] `vision-creation` skill
- [x] Complexity grill: reference and integrate Matt Pocock's `grill-with-docs` (setup guidance + workflow docs, no custom skill)
- [x] Technical research: reference and integrate Matt Pocock's research skill, fed by the project's grill constraints
- [x] `design-validation` skill (spec → Claude Design → revised spec → handoff)
- [x] Plugin installation through a project-scoped declaration (`.claude/settings.json`, ADR-0003)

## Phase 3 — Browser-testing module

**Goal:** an agent can start an example app in a fresh environment, complete a defined journey, and produce a traceable evidence bundle.

- [x] Playwright detection/installation and E2E baseline ([ADR-0004](docs/adr/0004-browser-testing-module.md))
- [x] Standard semantic commands: setup / dev / verify / smoke / doctor
- [x] Agentic `browser-smoke` skill and smoke-journey contract
- [x] Evidence bundle format (summary, traces, screenshots, console/network logs)
- [x] Local, CI, and cloud (fresh clone) support

## Phase 4 — Ralph release orchestration

**Goal:** Ralph implements a small example MVP and cannot declare success while required verification fails.

- [x] Integrate the Wemuda-provided Ralph skill (supplied, not written from scratch) — adapted as the plugin's `ralph` orchestrator skill plus the named contracts it dispatches to (`ralph-implement`, `resolving-merge-conflicts`)
- [x] Integrate the Wemuda-provided campaign workflow script — `launchrail add ralph` installs `.claude/workflows/ralph.js` as a managed file; policy overrides via workflow args, config discovered at run time (ADR-0005)
- [x] Completion contract, max iterations, blocker reports — per-ticket contract in `ralph-implement`; retry-once-then-park with `needs-info` + failure history; `maxRounds` backstop; stuck tickets reported with their blockers
- [x] Verification-gated completion and release evidence summary — `launchrail verify` gates preflight, every ticket, and campaign close-out (plus browser-smoke evidence when the module is enabled); a red or empty gate refuses to start, a red final gate reports "unverified"
- [ ] Dogfood: run a Ralph campaign against a small example MVP end to end

## Phase 5 — Sync engine

**Goal:** an older project receives new skills and renamed capabilities without losing local product knowledge.

- [x] `status` — drift, available updates, pending migrations, upstream advisories
- [x] `diff` — preview upstream changes as unified diffs
- [x] `sync` — safe initial subset ([ADR-0006](docs/adr/0006-sync-engine.md)): checksum-gated managed updates, conflicts keep local edits; generated content updates whole-file via `.launchrail/CLAUDE.generated.md` (true three-way merge deferred until base content is stored)
- [x] Versioned, ordered, idempotent, dry-runnable migrations (in-CLI registry, recorded in the lockfile, failure leaves the repo recoverable)
- [x] Upstream dependency compatibility tracking — advisory rename registry scanned against project docs (registry empty until the first real upstream rename)
- [x] `eject` / vendor mode (`eject <file|module>`, `eject --all`; ejected paths are never written again)

## Phase 6 — Open-source readiness

- [x] License selection — MIT, generated output unencumbered ([ADR-0007](docs/adr/0007-mit-license.md))
- [ ] Public docs, installation guide, example project
- [x] Contribution guide and security policy — [CONTRIBUTING.md](CONTRIBUTING.md), [SECURITY.md](SECURITY.md) (private vulnerability reporting, Launchrail-specific vulnerability classes)
- [x] Release automation and changelog (enabled by Conventional Commits) — CI + release-please, one toolchain version, provenance-attested npm publish ([ADR-0008](docs/adr/0008-release-automation.md), [docs/releasing.md](docs/releasing.md))
- [x] Brand due diligence (GitHub/npm/domain/trademark checks on the name) — findings and pre-launch actions in [docs/brand-due-diligence.md](docs/brand-due-diligence.md)
- [ ] Dogfood case study on a real Wemuda project

## Landed

- [x] 2026-08-04 — Monorepo scaffold: pnpm workspace, `@wemuda/launchrail` CLI stub (full command surface registered), Claude plugin skeleton + marketplace manifest, ADR template, ADR-0001 (provisional stack)
- [x] 2026-08-04 — Conventional Commits adopted for this repo and planned as an init interview question (ADR-0002)
- [x] 2026-08-04 — Phase 1 complete: `init` (interview/defaults, dry-run, idempotent, never overwrites seeded files) and `doctor` (manifest/lockfile validation, managed-file drift detection, Matt Pocock setup detection) with fixture + temp-git-repo integration tests
- [x] 2026-08-04 — Roadmap refined: compose Matt Pocock's `grill-with-docs` and research skills instead of custom ones; dropped `release-verification` and `launchrail-status`; Ralph phase (Wemuda-provided skill + workflow) moved ahead of the sync engine
- [x] 2026-08-04 — Phase 2 complete: `vision-creation` and `design-validation` skills, `docs/workflow.md` stage contract composing upstream skills (grill fed by vision, research fed by grill constraints), and plugin subscription via an additive, idempotent `.claude/settings.json` merge in `init` with a matching `doctor` check (ADR-0003)
- [x] 2026-08-04 — Phase 3 complete: `add browser-testing` (Playwright config + E2E baseline + smoke-journey contract + `scripts/{setup,dev,verify,smoke,doctor}.mjs`, comment-preserving manifest update), `verify` (deterministic gate, empty contract fails), `smoke` (evidence bundle scaffolding under `artifacts/verification/<run-id>/`), doctor module checks, and the `browser-smoke` skill (ADR-0004)
- [x] 2026-08-04 — Phase 4 complete: Ralph release orchestration integrated from the Wemuda handoff as two frontends over one policy (ADR-0005) — `ralph`, `ralph-implement`, and `resolving-merge-conflicts` skills in the plugin; `launchrail add ralph` installing a managed, environment-agnostic `.claude/workflows/ralph.js`; doctor checks; verification-gated completion with release evidence summary
- [x] 2026-08-04 — Phase 5 complete: sync engine (ADR-0006) — `status`/`diff`/`sync` sharing the safe writer's plan, in-CLI migration registry (first migration: `2026-08-plugin-declaration`) with recovery on failure and init stamping, upstream rename advisories, `eject`/vendor mode via an `ejected` lockfile class, and a `doctor` pending-migrations check
