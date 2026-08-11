# Launchrail roadmap

> Living document — the forward-looking answer to "what's next, what's deliberately deferred." Shipped history lives in [CHANGELOG.md](CHANGELOG.md); update this file in the same commit as the work that changes what's planned.

## Where things stand

The toolchain is built and stable. The whole surface works and is covered by 164 tests, including integration tests against temporary Git repositories:

- **`init` + `doctor`** initialize blank and existing repositories (interview or `--yes`, dry-run, idempotent re-runs, checksum-tracked lockfile), install the workflow plugin roster via the `claude` CLI when present ([ADR-0011](docs/adr/0011-init-installs-plugin-via-claude-cli.md)), and hand off into Claude Code. Adopting a mid-development project is first-class ([ADR-0012](docs/adr/0012-init-wires-imports-into-existing-claude-md.md), [ADR-0013](docs/adr/0013-existing-project-alignment.md)).
- **The workflow plugin** carries the `launch` and `start-feature` conductors ([ADR-0009](docs/adr/0009-launch-orchestrator-skill.md), [ADR-0014](docs/adr/0014-start-feature-conductor.md)), the `vision-creation`, `design-validation`, and `project-alignment` skills, and a stage-by-stage workflow doc that composes Matt Pocock's grill/research/spec skills. Subscription is a project-scoped `.claude/settings.json` declaration ([ADR-0003](docs/adr/0003-plugin-subscription-via-project-settings.md)).
- **Browser testing** (`add browser-testing`, [ADR-0004](docs/adr/0004-browser-testing-module.md)) seeds a Playwright baseline, semantic scripts, and the `browser-smoke` evidence bundle, with `verify` and `smoke` as the verification surface.
- **The Ralph loop** (`add ralph`, [ADR-0005](docs/adr/0005-ralph-two-frontends-one-policy.md), field-revised by [ADR-0010](docs/adr/0010-ralph-field-revision.md)) is verification-gated end to end and has run for real against a Wemuda project.
- **The sync engine** ([ADR-0006](docs/adr/0006-sync-engine.md)) keeps older projects current: `status`, `diff`, and `sync` share the safe writer's plan, migrations are ordered and idempotent, and `eject` provides vendor mode.
- **Release automation** ([ADR-0008](docs/adr/0008-release-automation.md)) is live — Conventional Commits, release-please, lockstep CLI/plugin versions, generated changelog.

## Open before the npm launch

- **Dogfood case study on a real project.** The committed [`hello-launchrail`](examples/hello-launchrail) example and the [getting-started guide](docs/getting-started.md) are the groundwork; the case study needs the toolchain run against a real product, not this repo. It doubles as the primary public evidence at announcement.
- **Flip on the npm publish.** Register/verify the `wemuda` npm org and add the `NPM_TOKEN` secret; the publish job is already wired and skips cleanly until then ([docs/releasing.md](docs/releasing.md)).

## Candidate directions

> Unscheduled and uncommitted — real gaps and expansion ideas kept here so they get weighed deliberately instead of forgotten. Each graduates into real work (or an ADR that rejects it) only when a real project demands it.

- **Close the promotion loop.** The updatability model promises "reusable lessons are deliberately promoted upstream," but today that is a habit, not a mechanism. Candidate: a documented promotion path (a CONTRIBUTING recipe, or eventually a `launchrail promote` helper) for lifting a project-grown skill or convention into the toolchain.
- **True three-way merge for generated content.** `sync` updates generated content whole-file; storing base content in the lockfile would enable real three-way merges (explicitly deferred in [ADR-0006](docs/adr/0006-sync-engine.md)).
- **Upstream compatibility watch.** The rename-advisory registry is empty while Matt Pocock's skills keep evolving. A scheduled CI job that diffs upstream skill names and contracts against `plugins/launchrail/docs/workflow.md` would catch drift before consuming projects do.
- **Command-surface audit.** Nine commands with adjacent diagnostics (`status` vs `doctor`, `verify` vs `smoke`) — confirm each earns its place or fold overlapping ones before the CLI surface hardens further.
- **Editor/vendor breadth.** AGENTS.md is vendor-neutral but the plugin is Claude Code–only. Decide deliberately whether other agent runtimes are a goal or a non-goal, and record the answer as an ADR either way.
