# Launchrail roadmap

> Living document — the public answer to "what exists, what's in progress, what's missing." Update it in the same commit as the work it describes.

## Current status

Phases 1–3 are implemented. `launchrail init` and `launchrail doctor` work on blank and existing repositories (interview or `--yes`, `--dry-run`, idempotent re-runs, checksum-tracked lockfile). The Claude plugin carries the core workflow — `vision-creation` and `design-validation` skills, a stage-by-stage workflow doc composing Matt Pocock's grill/research/spec skills, and plugin subscription via a project-scoped `.claude/settings.json` declaration (ADR-0003) — plus `browser-smoke`. `launchrail add browser-testing` seeds the browser-testing module (Playwright baseline, semantic scripts, smoke-journey contract, ADR-0004) with `launchrail verify` and `launchrail smoke` as the verification surface. 61 tests, including integration tests against temporary git repositories. Nothing is published to npm.

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

- [ ] Integrate the Wemuda-provided Ralph skill (supplied, not written from scratch)
- [ ] Integrate the Wemuda-provided campaign workflow script
- [ ] Completion contract, max iterations, blocker reports
- [ ] Verification-gated completion and release evidence summary

## Phase 5 — Sync engine

**Goal:** an older project receives new skills and renamed capabilities without losing local product knowledge.

- [ ] `status` — drift and available updates
- [ ] `diff` — preview upstream changes
- [ ] `sync` — three-way merge (or safe initial subset) and generated-section updates
- [ ] Versioned, ordered, idempotent, dry-runnable migrations
- [ ] Upstream dependency compatibility tracking (e.g. Matt Pocock skills rename map)
- [ ] `eject` / vendor mode

## Phase 6 — Open-source readiness

- [ ] License selection
- [ ] Public docs, installation guide, example project
- [ ] Contribution guide and security policy
- [ ] Release automation and changelog (enabled by Conventional Commits)
- [ ] Brand due diligence (GitHub/npm/domain/trademark checks on the name)
- [ ] Dogfood case study on a real Wemuda project

## Landed

- [x] 2026-08-04 — Monorepo scaffold: pnpm workspace, `@wemuda/launchrail` CLI stub (full command surface registered), Claude plugin skeleton + marketplace manifest, ADR template, ADR-0001 (provisional stack)
- [x] 2026-08-04 — Conventional Commits adopted for this repo and planned as an init interview question (ADR-0002)
- [x] 2026-08-04 — Phase 1 complete: `init` (interview/defaults, dry-run, idempotent, never overwrites seeded files) and `doctor` (manifest/lockfile validation, managed-file drift detection, Matt Pocock setup detection) with fixture + temp-git-repo integration tests
- [x] 2026-08-04 — Roadmap refined: compose Matt Pocock's `grill-with-docs` and research skills instead of custom ones; dropped `release-verification` and `launchrail-status`; Ralph phase (Wemuda-provided skill + workflow) moved ahead of the sync engine
- [x] 2026-08-04 — Phase 2 complete: `vision-creation` and `design-validation` skills, `docs/workflow.md` stage contract composing upstream skills (grill fed by vision, research fed by grill constraints), and plugin subscription via an additive, idempotent `.claude/settings.json` merge in `init` with a matching `doctor` check (ADR-0003)
- [x] 2026-08-04 — Phase 3 complete: `add browser-testing` (Playwright config + E2E baseline + smoke-journey contract + `scripts/{setup,dev,verify,smoke,doctor}.mjs`, comment-preserving manifest update), `verify` (deterministic gate, empty contract fails), `smoke` (evidence bundle scaffolding under `artifacts/verification/<run-id>/`), doctor module checks, and the `browser-smoke` skill (ADR-0004)
