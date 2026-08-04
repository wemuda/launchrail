# Contributing to Launchrail

Thanks for considering a contribution. Launchrail is a toolchain that runs inside *other people's repositories* — that asymmetry shapes every convention below. The full operating contract (also binding for coding agents) is [AGENTS.md](AGENTS.md); this guide is the human-facing summary plus the practical workflow.

## Setup

Requires Node ≥ 22 and [pnpm](https://pnpm.io).

```bash
pnpm install
pnpm build          # build all packages
pnpm test           # run all tests
pnpm --filter @wemuda/launchrail exec launchrail --help
```

The repo is a pnpm workspace: the CLI lives in `packages/cli`, the Claude Code plugin in `plugins/launchrail`.

## The rules that are not negotiable

Launchrail writes files into consuming projects. Any change touching that path must preserve:

- **The ownership model.** Every file Launchrail touches is *managed* (replaceable on sync), *seeded* (created once, then project-owned), or *project-owned* (never touched). No feature may blur these classes.
- **Dry-run and checksums.** Never write to a consuming repo without dry-run support and checksum awareness.
- **Idempotency.** Re-running `init` or `sync` must not duplicate blocks or destroy local work.
- **Seeded and project-owned files are never overwritten.**
- **Failed migrations stop, report, and leave the repository recoverable.**
- **No secrets** in the manifest, lockfile, or templates.

A pull request that violates one of these will be declined regardless of how useful the feature is; redesign it inside the constraints instead.

## Making changes

1. **Discuss first for anything structural.** Open an issue before large changes. Meaningful decisions become ADRs in [docs/adr/](docs/adr/) (numbered `NNNN-short-title.md`, using the [template](docs/adr/0000-template.md)) — ADRs for meaningful decisions, not every dependency.
2. **Write tests with the change.** File-manipulation logic gets snapshot/fixture tests; CLI behavior gets integration tests against temporary Git repositories (see `packages/cli/tests/` for the pattern). Anything that writes files in a consuming repo needs dry-run coverage.
3. **Keep [ROADMAP.md](ROADMAP.md) true.** It's a living document — update it in the same commit that changes what exists, what's in progress, or what's missing.
4. **Stay lightweight.** Prefer composing upstream tools over reimplementing them. No empty directories, no ceremony ahead of need, no speculative abstraction.

## Commits

[Conventional Commits](https://www.conventionalcommits.org/) ([ADR-0002](docs/adr/0002-conventional-commits.md)): `type(scope): summary` with types `feat`, `fix`, `docs`, `chore`, `refactor`, `test`, `build`, `ci`. Scope is a package or area (`cli`, `plugin`, `adr`) when it adds clarity. Release automation parses these ([ADR-0008](docs/adr/0008-release-automation.md)) — a mis-typed commit produces a wrong changelog entry, so it matters.

## Pull requests

- Target `master`. CI must pass (build + tests on Node 22).
- Keep PRs focused; separate refactors from behavior changes.
- The definition of done: the change matches the relevant ADR (or updates it), build and tests pass, file-writing behavior has dry-run coverage, and the roadmap still tells the truth. Evidence over assertion.

## Security issues

Do **not** open a public issue for vulnerabilities — see [SECURITY.md](SECURITY.md).
