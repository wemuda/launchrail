# Agent operating contract — hello-launchrail

This file is the vendor-neutral contract for any coding agent working in this repository.

## Project purpose

TODO: One paragraph on what this project is, who it serves, and what it is not.

## Canonical context

1. [docs/vision.md](docs/vision.md) — product vision and non-goals
2. [docs/adr/](docs/adr/) — accepted architecture decisions
3. approved specifications — `spec`-labelled issues on the project tracker (see [docs/agents/issue-tracker.md](docs/agents/issue-tracker.md))

## Commands

```bash
npm test
```

## Workflow rules

- Ask, don't guess. On product decisions, data-model or schema changes, security-relevant behaviour, or anything genuinely ambiguous, stop and ask rather than guessing — a wrong guess on these costs more than the question.
- Do not silently change scope; surface deviations from the spec or ADRs.
- If implementation invalidates an artifact (vision, spec, ADR, design note), update that artifact in the same change.
- Meaningful decisions become lightweight ADRs in `docs/adr/` using [docs/adr/0000-template.md](docs/adr/0000-template.md).

## Definition of done

- The change matches the relevant spec or ADR, or updates it.
- Deterministic checks pass (`npm test`).
- Behaviour-bearing changes are proven in the running app, not only by green unit tests — capability is not the same as done.
- Report honest status: say what you verified and to what depth; never imply complete when it is not.
- Evidence over assertion: "done" requires passing checks, not agent say-so.
