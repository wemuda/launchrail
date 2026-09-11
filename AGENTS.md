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
- Meaningful decisions become ADRs in `docs/adr/`, named `YYYY-MM-DD-short-slug.md` (the decision date, then a slug unique in the directory; the slug is the handle other documents use — there is no sequence number to claim, so parallel branches never collide), using [docs/adr/0000-template.md](docs/adr/0000-template.md). Records from before this scheme keep their `NNNN-` names and are referenced by number. ADRs for meaningful decisions, not every dependency. The registry index [docs/adr/README.md](docs/adr/README.md) tracks each ADR's live status; its table is generated — run `launchrail adr index` (or `node packages/cli/dist/index.js adr index` in this repo) after adding or re-statusing a record, and commit it in the same commit. A new ADR declares what it supersedes, amends, or extends in its own Status line; the index derives the reverse links, so an amended ADR is not edited. A superseded ADR's Status line is still rewritten to name its successor; superseded ADRs are never deleted ([adr-date-slug-identifiers](docs/adr/2026-09-11-adr-date-slug-identifiers.md)). Read the index first and open only area-relevant ADRs: an ADR records a decision, not the current system ([ADR-0031](docs/adr/0031-adr-registry-and-reading-contract.md)).
- **The workflow skills are Launchrail's own complete set** ([ADR-0020](docs/adr/0020-independent-skill-set.md)): every stage owner is a `launch-*` skill under `packages/cli/assets/skills/launchrail/`, written to the rail's artifact contract. Several absorb methodology and text from [Matt Pocock's skills](https://github.com/mattpocock/skills) under its MIT license — derived files carry a derivation note, and `packages/cli/assets/skills/NOTICE.md` reproduces the license. Upstream is monitored as inspiration: improvements worth having are translated into our skills, never re-vendored.
- Compose the runtime tools the workflow *drives* (Claude Design, Playwright) rather than reimplementing them; own the skills the workflow *is*.
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
