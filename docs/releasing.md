# Releasing Launchrail

Releases are automated by [release-please](https://github.com/googleapis/release-please) ([ADR-0008](adr/0008-release-automation.md)). Day to day, nobody "cuts a release" — you merge one.

## How it works

1. Conventional Commits land on `master` (via PRs). CI runs build + tests on each.
2. The Release workflow maintains a **release PR** ("chore(master): release X.Y.Z") containing the version bump — root `package.json`, `packages/cli/package.json`, and the plugin manifest move in lockstep — plus the generated `CHANGELOG.md` entry compiled from `feat:`/`fix:` commits since the last release.
3. **Merging the release PR** (squash) tags `vX.Y.Z`, creates the GitHub release, and triggers the publish job: `pnpm build`, then `npm publish --provenance --access public` for `@wemuda/launchrail`.
4. If the `NPM_TOKEN` secret is absent, the publish step skips with a notice — tags and changelog still happen. This is the expected state until npm launch.

Version semantics while pre-1.0: `fix:` bumps patch, `feat:` bumps minor, breaking changes bump minor (`bump-minor-pre-major`). The first release is pinned to **0.1.0** (`initial-version`) — without it release-please defaults a first release to 1.0.0. Going 1.0 is a deliberate act: remove the pin's effect with a `Release-As: 1.0.0` commit when the roadmap says so.

## One-time setup (before the first public release)

- [ ] Repository settings → Actions → General: allow GitHub Actions to **create and approve pull requests** (release-please needs this to open the release PR).
- [ ] Register/verify the `wemuda` npm org and create a granular automation token with publish rights for `@wemuda/launchrail` (see [brand due diligence](brand-due-diligence.md) for the naming findings).
- [ ] Add the token as the `NPM_TOKEN` repository secret.
- [ ] Merge the first release PR; verify the package appears on npm with a provenance badge.

## Manual interventions

- **Force a specific version:** add `Release-As: X.Y.Z` to a commit body on `master`.
- **A commit was mistyped** (e.g. a feature labelled `chore`): it's missing from the changelog — edit the release PR body/changelog before merging, or land an empty `feat:`/`fix:` commit with the right message.
- **Re-run a failed publish:** re-run the Release workflow's `publish` job from the Actions tab; `npm publish` of an already-published version fails safely.
