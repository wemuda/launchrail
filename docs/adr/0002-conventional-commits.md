# ADR-0002: Conventional Commits — for this repo and as an init option

## Status
Accepted

## Context
The toolchain needs a consistent commit history to enable the changelog and release automation planned for open-source readiness. Separately, Launchrail's whole premise is seeding working conventions into consuming projects, and commit format is a cheap, high-leverage convention for agent-driven repositories: agents follow explicit written rules reliably, and downstream tooling (changelogs, semantic releases) can build on the result.

## Decision
1. This repository uses [Conventional Commits](https://www.conventionalcommits.org/) for every commit: `type(scope): summary`, with types `feat`, `fix`, `docs`, `chore`, `refactor`, `test`, `build`, `ci`. Scope is a package or area (`cli`, `plugin`, `adr`, …) when it adds clarity.
2. `launchrail init` will ask whether the consuming project adopts Conventional Commits (default yes, respecting any existing convention detected in the repo's history). When adopted:
   - The choice is recorded in `.launchrail.yml`.
   - The seeded `AGENTS.md` gets a commit-conventions section, so every coding agent in that project follows the format from day one.
   - Enforcement tooling (commitlint or similar) remains optional — a later module, never a default dependency.

## Alternatives considered
- **Freeform commit messages** — no changelog automation; agent-written history drifts into inconsistency.
- **Enforcement-first (husky + commitlint by default)** — heavier footprint in consuming projects; convention-by-instruction already works well with agents, and tooling can be added when violations actually occur.

## Consequences
- Easier: automated changelogs and releases, scannable history, one deterministic instruction reused here and in every initialized project.
- Constrained: contributors must follow the format; `init` gains one more interview question.

## Revisit when
- Violations become frequent enough that enforcement tooling should ship by default.
- A consuming project's established convention conflicts — init must respect existing conventions rather than fight them.
