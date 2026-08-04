# Launchrail roadmap

> Living document — the public answer to "what exists, what's in progress, what's missing." Update it in the same commit as the work it describes.

## Current status

Freshly scaffolded monorepo. The `launchrail` CLI runs (help/version, all commands registered) but no command is implemented yet; the Claude plugin contains no skills yet. Nothing is published to npm.

## Phase 1 — `init` + `doctor`

**Goal:** `npx @wemuda/launchrail init && npx @wemuda/launchrail doctor` works on a blank repo and a realistic existing repo without destroying local files.

- [ ] `.launchrail.yml` manifest schema and the ownership model (managed / seeded / project-owned)
- [ ] `.launchrail-lock.json` lockfile (versions, checksums, applied migrations)
- [ ] Safe file writer: dry-run, checksum tracking, idempotent re-runs
- [ ] New/existing repository detection (package manager, stack, git remote, existing agent files)
- [ ] Init interview: project mode (spike / standard MVP / high-rigor), issue tracker, Conventional Commits (ADR-0002), test commands
- [ ] Seed `AGENTS.md` + `CLAUDE.md` arrangement without overwriting existing content; chosen conventions (commit format, commands, definition of done) are written into the seeded `AGENTS.md`
- [ ] Seed ADR conventions (`docs/adr/` + template)
- [ ] Matt Pocock skills installation guidance and setup detection
- [ ] `doctor`: baseline repository and environment checks
- [ ] Fixture and integration tests against temporary git repositories

## Phase 2 — Core workflow plugin

**Goal:** a fresh project can move from idea to an approved MVP spec through committed artifacts.

- [ ] `vision-creation` skill
- [ ] `complexity-grill` skill
- [ ] `technical-landscape` research skill
- [ ] `design-validation` skill (spec → Claude Design → revised spec → handoff)
- [ ] `release-verification` skill
- [ ] `launchrail-status` skill (current stage, missing artifacts, next workflow)
- [ ] Plugin installation through a project-scoped declaration

## Phase 3 — Browser-testing module

**Goal:** an agent can start an example app in a fresh environment, complete a defined journey, and produce a traceable evidence bundle.

- [ ] Playwright detection/installation and E2E baseline
- [ ] Standard semantic commands: setup / dev / verify / smoke / doctor
- [ ] Agentic `browser-smoke` skill and smoke-journey contract
- [ ] Evidence bundle format (summary, traces, screenshots, console/network logs)
- [ ] Local, CI, and cloud (fresh clone) support

## Phase 4 — Sync engine

**Goal:** an older project receives new skills and renamed capabilities without losing local product knowledge.

- [ ] `status` — drift and available updates
- [ ] `diff` — preview upstream changes
- [ ] `sync` — three-way merge (or safe initial subset) and generated-section updates
- [ ] Versioned, ordered, idempotent, dry-runnable migrations
- [ ] Upstream dependency compatibility tracking (e.g. Matt Pocock skills rename map)
- [ ] `eject` / vendor mode

## Phase 5 — Ralph release orchestration

**Goal:** Ralph implements a small example MVP and cannot declare success while required verification fails.

- [ ] `ralph-release` skill: bounded campaign from approved tickets
- [ ] Completion contract, max iterations, blocker reports
- [ ] Verification-gated completion and release evidence summary

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
