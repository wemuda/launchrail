# Agent operating contract — hello-launchrail

This file is the vendor-neutral contract for any coding agent working in this repository.

## Project purpose

TODO: One paragraph on what this project is, who it serves, and what it is not.

## Canonical context

1. [docs/vision.md](docs/vision.md) — product vision and non-goals
2. [docs/adr/](docs/adr/) — accepted architecture decisions
3. [docs/specs/](docs/specs/) — approved specifications

## Commands

```bash
npm test
```

## Commit conventions

Conventional Commits: `type(scope): summary` — types `feat`, `fix`, `docs`, `chore`, `refactor`, `test`, `build`, `ci`.

## Workflow rules

- Do not silently change scope; surface deviations from the spec or ADRs.
- If implementation invalidates an artifact (vision, spec, ADR, design note), update that artifact in the same change.
- Meaningful decisions become lightweight ADRs in `docs/adr/` using [docs/adr/0000-template.md](docs/adr/0000-template.md).

## Definition of done

- The change matches the relevant spec or ADR, or updates it.
- Deterministic checks pass (`npm test`).
- Evidence over assertion: "done" requires passing checks, not agent say-so.
