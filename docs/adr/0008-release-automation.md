# ADR-0008: Release automation via release-please, one version for the whole toolchain

## Status
Accepted

## Context
Open-source readiness requires automated releases and a changelog, and ADR-0002 adopted Conventional Commits explicitly to enable them. The repo ships two artifacts that must not drift apart: the `@wemuda/launchrail` npm package and the Claude Code plugin (versioned in `plugins/launchrail/.claude-plugin/plugin.json`). Consuming projects record toolchain versions in their lockfile, so a single coherent version is simpler to reason about than per-artifact versions. Releases must stay reviewable — this toolchain writes into other people's repositories, so an unreviewed auto-publish on every push is the wrong risk posture.

## Decision
1. **[release-please](https://github.com/googleapis/release-please)** (manifest mode, GitHub Action) drives releases: it parses Conventional Commits on `master`, maintains a release PR with the version bump and `CHANGELOG.md`, and merging that PR tags the release. Humans review the release PR; nothing publishes on ordinary pushes.
2. **One version for the whole toolchain.** The root `package.json` is the version of record; release-please's `extra-files` bumps `packages/cli/package.json` and the plugin manifest in lockstep. Tags are plain `vX.Y.Z`.
3. **npm publish happens in CI** after a release is created: build, then `npm publish --provenance --access public` for `packages/cli`. Until the `NPM_TOKEN` secret is configured the publish step no-ops with a notice, so releases (tag + changelog) work before npm launch.
4. `bump-minor-pre-major` — while pre-1.0, breaking changes bump the minor version.
5. CI (build + tests on Node 22, Ubuntu) runs on every PR and push to `master`; the release PR gets the same gate.

## Alternatives considered
- **semantic-release** — publishes directly from CI on every qualifying push; no human review point before a version exists, and the changelog lives only in generated releases. Wrong posture for a tool that edits other repos.
- **Changesets** — good monorepo ergonomics but versioning is driven by hand-written changeset files, duplicating what Conventional Commits (ADR-0002) already encode.
- **Independent versions per package** — release-please supports it, but the plugin and CLI evolve together and the lockfile stamps one toolchain version; independent versions add matrix-compatibility questions nobody has asked yet.

## Consequences
- Easier: changelog and versioning are free-riding on the commit convention; releases are a reviewable PR merge; provenance-attested npm packages.
- Constrained: commit types must be accurate (a `feat` mislabelled `chore` is invisible in the changelog); the GitHub repo must allow Actions to create pull requests; squash-merging the release PR is required for release-please's bookkeeping.
- The plugin has no separate release lifecycle — acceptable until real demand appears.

## Revisit when
- The plugin needs releases decoupled from the CLI (e.g. marketplace distribution cadence).
- npm trusted publishing (OIDC without long-lived tokens) becomes available for the org — replace `NPM_TOKEN` with it.
- Release cadence or monorepo growth makes per-package versioning worth its complexity.
