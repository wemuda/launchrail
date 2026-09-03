# ADR registry

The index of every architecture decision record in this repository. Read this first: it tells you which decisions are live, which have been superseded, and which four ADRs a newcomer should read to understand the current system.

An ADR records a decision and the context it was made in — not documentation of the current system. The live picture below, and the code, describe the present; never take a record alone as evidence that something still looks as described ([ADR-0031](0031-adr-registry-and-reading-contract.md)).

Superseded ADRs are **never deleted** — they are historical records and other documents link to them. Each one's `## Status` line names its successor, and this table mirrors that.

## Index

| ADR | Title | Status |
| --- | --- | --- |
| [0001](0001-provisional-implementation-stack.md) | Implementation stack (TypeScript, Node ≥ 22, ESM, pnpm) | Accepted |
| [0002](0002-conventional-commits.md) | Conventional Commits | Accepted |
| [0003](0003-plugin-subscription-via-project-settings.md) | Plugin subscription via project settings | **Superseded by 0019** |
| [0004](0004-browser-testing-module.md) | Browser-testing module (Playwright, evidence bundles) | Accepted |
| [0005](0005-ralph-two-frontends-one-policy.md) | Ralph: two frontends, one policy, verification-gated | Accepted — amended by 0010, 0018, 0022, 0032; extended by 0021 |
| [0006](0006-sync-engine.md) | Sync engine: checksum-gated safe subset, in-CLI migrations, eject | Accepted |
| [0007](0007-mit-license.md) | MIT license, generated output unencumbered | Accepted |
| [0008](0008-release-automation.md) | Release automation via release-please, one toolchain version | Accepted |
| [0009](0009-launch-orchestrator-skill.md) | The `launch` orchestrator skill | Accepted — amended by 0018, 0029, 0033 |
| [0010](0010-ralph-field-revision.md) | Ralph field revision (deterministic edges, deferrals, supervision) | Accepted — amends 0005; amended by 0022, 0032 |
| [0011](0011-init-installs-plugin-via-claude-cli.md) | Init installs plugins via the `claude` CLI | **Superseded by 0019** |
| [0012](0012-init-wires-imports-into-existing-claude-md.md) | Init wires imports into an existing CLAUDE.md | Accepted |
| [0013](0013-existing-project-alignment.md) | Adopting existing projects: `origin` and the alignment on-ramp | Accepted |
| [0014](0014-start-feature-conductor.md) | The `start-feature` conductor | **Superseded by 0018** |
| [0015](0015-discovery-research-stage.md) | Discovery research: a divergent stage before the grill | Accepted |
| [0016](0016-design-validation-fidelity-ladder.md) | Design validation fidelity ladder | Accepted — amended by 0023, 0024 |
| [0017](0017-implementation-loop-provider.md) | Implementation loop as a provider | **Superseded by 0020** |
| [0018](0018-implement-front-door.md) | One front door for implementation (`/launch-implement`) | Accepted — supersedes 0014; amended by 0019, 0020 |
| [0019](0019-vendor-skills-retire-plugin.md) | Skills as managed files; marketplace plugin retired | Accepted — supersedes 0003, 0011; partially superseded by 0020 |
| [0020](0020-independent-skill-set.md) | Launchrail owns its complete skill set | Accepted — supersedes 0017 and the vendoring half of 0019 |
| [0021](0021-ralph-unattended-permission-guard.md) | Ralph's unattended-launch permission guard | Accepted — extends 0005 |
| [0022](0022-ralph-campaign-revision.md) | Ralph campaign revision (one engine, integration target, merge gate) | Accepted — amends 0005, 0010; amended by 0026, 0027, 0032 |
| [0023](0023-remove-project-mode.md) | Init asks only what the user can answer; project modes removed | Accepted — amends 0016 |
| [0024](0024-design-handoff-onramp.md) | The design handoff on-ramp (`launch-design-handoff`) | Accepted — amends 0016 |
| [0025](0025-spec-home-follows-tracker.md) | The spec's home follows the configured tracker | Accepted — amends the stage-7 contract in `workflow.md` |
| [0026](0026-ralph-default-consolidation.md) | Ralph default integration target: consolidate by default | Accepted — amends 0022; amended by 0028 |
| [0027](0027-ralph-gate-ci-wait-repoll.md) | Ralph merge gate: re-poll a still-running CI in place instead of rebuilding | **Superseded by 0032** |
| [0028](0028-hosted-session-designated-branch-target.md) | Hosted-session Ralph runs target the session's designated branch | Accepted — amends 0026; amended by 0032 |
| [0029](0029-planning-interaction-contract.md) | Planning interaction contract: decision budget, build-safe stopping, phase legibility | Accepted — amends the stage contract in `workflow.md`; amends 0009 |
| [0030](0030-ralph-ci-wait-cheap-watcher.md) | Ralph merge gate: the CI wait rides on cheap read-only watchers | **Superseded by 0032** |
| [0031](0031-adr-registry-and-reading-contract.md) | Consuming repos: seeded ADR registry and scoped reading contract | Accepted |
| [0032](0032-ralph-lean-local-gate-loop.md) | Ralph lean loop: local landing under a fast gate, continuous persistence, checkpointed full gate | Accepted — amends 0005, 0010, 0022, 0028; supersedes 0027, 0030; extended by 0033 |
| [0033](0033-loop-readiness.md) | Loop readiness: doctor's warn-only readiness lines and the `launch-loop-readiness` skill | Accepted — extends 0032; amends 0009 |

## The live picture

How the accepted decisions compose into the current system:

- **Skill distribution — read 0019 + 0020.** Every workflow skill is Launchrail's own, `launch-` prefixed, and ships as **managed files** written into consuming repos' `.claude/skills/` by `init`/`sync`. There is no Claude Code plugin, no marketplace, no `claude` CLI install, and no vendored upstream snapshot. The plugin era (0003 → 0011) and the vendored-snapshot half of 0019 are closed chapters.
- **The rail — read 0009 (as amended by 0018), then 0029, 0015, 0016, 0013, 0024, 0025.** `/launch` is the planning conductor; `/launch-implement` is the build front door; the normative stage contract lives in the `launch` skill's `workflow.md`, not in any ADR. 0029 is the planning interaction contract: labeled uncertainties with only `decide-now` reaching the human, three-question rounds, a ~six-decision session budget, build-safe stopping instead of frontier exhaustion, prototype authority, decisions-only wayfinding — and the legibility layer (six phases over the stages, the rail banner at every transition, Locked/Provisional/Deferred/Next-command summaries). 0015 added the discovery stage and renumbered the rail — stage numbers in ADRs 0009 and 0013 predate that renumber. 0016 gives design validation its fidelity ladder (0023 removed the project modes that once calibrated it); 0013 gives existing projects the alignment on-ramp; 0024 gives designs returning from Claude Design their on-ramp (`launch-design-handoff`), committing handoff packages under `docs/design/`; 0025 makes the stage-7 spec live on the tracker (a `spec`-labeled issue) rather than a `docs/specs/` file, except in local mode.
- **The implementation loop — read 0005, 0010, 0018, 0021, 0022, 0026, 0028, 0032, 0033.** Ralph is *the* loop (the provider seam of 0017 was removed by 0020). Two frontends share one policy, but since 0022 the workflow is the engine for every multi-ticket run (skill-mode orchestration is a declared exception; the skill supervises either way). Each run declares one integration target: since 0026 a multi-ticket run **consolidates by default** onto a front-door-named integration branch (default branch untouched, released by one offered PR), and trunk — per-ticket lands straight onto the default branch — is an explicit opt-in; since 0028 a hosted session pinned to a designated working branch consolidates onto that branch — the pin re-targets the run, it never changes the engine. Since 0032 the loop is **lean**: implementers push their `ralph/<n>-*` branch from the first commit on (a lost container costs minutes, not a build; a relaunch adopts pushed branches and can skip re-proving a `knownGreen` base) and hand off at a green fast gate; the loop lands each branch itself — a local squash-merge onto the base under `launchrail verify --fast`, one land at a time, pushed — with the full `verify` at checkpoints every few lands (one bounded repair when red) and at release; there is no per-ticket PR and no CI wait anywhere in the loop — cloud CI runs once, on the offered release PR. 0027 and 0030 (the CI-wait re-poll and its watchers) are closed chapters. 0033 makes the repository's side of that speed visible and fixable: `doctor` reports warn-only `ralph …` readiness lines (fast gate, CI triggers, journeys, hosted setup, commands), and the optional stage-0 skill `launch-loop-readiness` measures the gates and tunes the repo — never gating the rail. Every run ends with the where-it-lives recap. Completion is gated on the full `launchrail verify`; the user-typed hard gate lives on `/launch-implement`; the permission guard warns on unattended launches in interactive modes.
- **The engine — read 0006, plus 0012 and 0004.** Sync is a checksum-gated safe subset with in-CLI migrations and eject-as-lockfile-state. Init additively wires imports into project-owned `CLAUDE.md` (0012) and the additive-merge model for `.claude/settings.json` established in 0003 survives its supersession — 0021 reuses it for hook registration. 0004 is the browser-testing module. Since 0031 the seeded surface also carries each consuming repo's own ADR registry (`docs/adr/README.md`, prefilled from existing records on adoption); the index-first, area-scoped, code-over-record reading contract rides the managed instructions, and doctor checks ADR numbering and index coverage.
- **Repo meta — 0001 (stack), 0002 (commits), 0007 (license), 0008 (releases).**

New here? Read **0020, 0019, 0018, 0006** — that covers the skill system, distribution, the conductors, and the write-safety engine. Everything else is depth.

## Maintaining this registry

- New ADRs take the next number and use [0000-template.md](0000-template.md).
- When an ADR supersedes or amends an earlier one, update the earlier ADR's `## Status` line **and this table in the same commit**. A superseded ADR's status names its successor and, in one sentence, what (if anything) survives.
- Never delete or renumber an ADR; other ADRs, docs, code comments, and migration descriptions reference them by number.
