# Agent operating contract — Launchrail toolchain

This file is the vendor-neutral contract for any coding agent working in this repository.

## What this repository is

The Launchrail **toolchain monorepo**: the `@wemuda/launchrail` CLI, the Claude Code plugin, templates, and migrations that initialize *other* repositories and keep them current. Code written here runs inside and against other people's repos — that asymmetry drives most conventions below.

## Core domain concepts

- **Ownership classes.** Every file Launchrail touches in a consuming project is *managed* (Launchrail may replace it), *seeded* (created once, then project-owned), or *project-owned* (never touched). No feature may blur these lines.
- **Manifest and lockfile.** Consuming projects carry `.launchrail.yml` (configuration) and `.launchrail-lock.json` (versions, checksums, applied migrations). The lockfile is committed.
- **Migrations.** Structural changes ship as ordered, idempotent, dry-runnable migration steps with IDs like `2026-08-add-agents-canonical`.

## Safety rules (non-negotiable)

- Never write to a consuming repo without dry-run support and checksum awareness.
- Sync and init must be idempotent — re-running must not duplicate blocks or destroy local work.
- Never overwrite seeded or project-owned files.
- Failed migrations stop, report, and leave the repository recoverable.
- No secrets in manifest, lockfile, or templates.

## Conventions

- TypeScript, Node ≥ 22, ESM only. pnpm workspace under `packages/*`.
- Meaningful decisions become ADRs in `docs/adr/`, numbered `NNNN-short-title.md`, using [docs/adr/0000-template.md](docs/adr/0000-template.md). ADRs for meaningful decisions, not every dependency.
- Prefer composing upstream tools ([Matt Pocock skills](https://github.com/mattpocock/skills), Claude Design, Playwright, Ralph Wiggum plugin) over reimplementing or mirroring them.
- Stay lightweight: no empty directories, no ceremony ahead of need, no speculative abstraction.
- File-manipulation logic gets snapshot/fixture tests; CLI behavior gets integration tests against temporary Git repositories.

## Commit conventions

- Conventional Commits ([ADR-0002](docs/adr/0002-conventional-commits.md)): `type(scope): summary` — types `feat`, `fix`, `docs`, `chore`, `refactor`, `test`, `build`, `ci`; scope is a package or area (`cli`, `plugin`, `adr`) when it adds clarity.

## Commands

```bash
pnpm install      # setup
pnpm build        # build all packages
pnpm test         # run all tests (once a test runner is added)
```

## Definition of done

- The change matches the relevant ADR, or updates it.
- Build passes; tests pass once they exist for the touched area.
- Anything that writes files in a consuming repo has dry-run coverage.
- Evidence over assertion: "done" requires passing checks, not agent say-so.
