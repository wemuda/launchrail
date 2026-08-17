# ADR registry

The index of every architecture decision record in this repository. Read this first: it tells you which decisions are live, which have been superseded, and which four ADRs a newcomer should read to understand the current system.

Superseded ADRs are **never deleted** — they are historical records and other documents link to them. Each one's `## Status` line names its successor, and this table mirrors that.

## Index

| ADR | Title | Status |
| --- | --- | --- |
| [0001](0001-provisional-implementation-stack.md) | Implementation stack (TypeScript, Node ≥ 22, ESM, pnpm) | Accepted |
| [0002](0002-conventional-commits.md) | Conventional Commits | Accepted |
| [0003](0003-plugin-subscription-via-project-settings.md) | Plugin subscription via project settings | **Superseded by 0019** |
| [0004](0004-browser-testing-module.md) | Browser-testing module (Playwright, evidence bundles) | Accepted |
| [0005](0005-ralph-two-frontends-one-policy.md) | Ralph: two frontends, one policy, verification-gated | Accepted — amended by 0010, 0018, 0022; extended by 0021 |
| [0006](0006-sync-engine.md) | Sync engine: checksum-gated safe subset, in-CLI migrations, eject | Accepted |
| [0007](0007-mit-license.md) | MIT license, generated output unencumbered | Accepted |
| [0008](0008-release-automation.md) | Release automation via release-please, one toolchain version | Accepted |
| [0009](0009-launch-orchestrator-skill.md) | The `launch` orchestrator skill | Accepted — amended by 0018 |
| [0010](0010-ralph-field-revision.md) | Ralph field revision (deterministic edges, deferrals, supervision) | Accepted — amends 0005; amended by 0022 |
| [0011](0011-init-installs-plugin-via-claude-cli.md) | Init installs plugins via the `claude` CLI | **Superseded by 0019** |
| [0012](0012-init-wires-imports-into-existing-claude-md.md) | Init wires imports into an existing CLAUDE.md | Accepted |
| [0013](0013-existing-project-alignment.md) | Adopting existing projects: `origin` and the alignment on-ramp | Accepted |
| [0014](0014-start-feature-conductor.md) | The `start-feature` conductor | **Superseded by 0018** |
| [0015](0015-discovery-research-stage.md) | Discovery research: a divergent stage before the grill | Accepted |
| [0016](0016-design-validation-fidelity-ladder.md) | Design validation fidelity ladder | Accepted |
| [0017](0017-implementation-loop-provider.md) | Implementation loop as a provider | **Superseded by 0020** |
| [0018](0018-implement-front-door.md) | One front door for implementation (`/launch-implement`) | Accepted — supersedes 0014; amended by 0019, 0020 |
| [0019](0019-vendor-skills-retire-plugin.md) | Skills as managed files; marketplace plugin retired | Accepted — supersedes 0003, 0011; partially superseded by 0020 |
| [0020](0020-independent-skill-set.md) | Launchrail owns its complete skill set | Accepted — supersedes 0017 and the vendoring half of 0019 |
| [0021](0021-ralph-unattended-permission-guard.md) | Ralph's unattended-launch permission guard | Accepted — extends 0005 |
| [0022](0022-ralph-campaign-revision.md) | Ralph campaign revision (one engine, integration target, merge gate) | Accepted — amends 0005, 0010 |

## The live picture

How the accepted decisions compose into the current system:

- **Skill distribution — read 0019 + 0020.** Every workflow skill is Launchrail's own, `launch-` prefixed, and ships as **managed files** written into consuming repos' `.claude/skills/` by `init`/`sync`. There is no Claude Code plugin, no marketplace, no `claude` CLI install, and no vendored upstream snapshot. The plugin era (0003 → 0011) and the vendored-snapshot half of 0019 are closed chapters.
- **The rail — read 0009 (as amended by 0018), then 0015, 0016, 0013.** `/launch` is the planning conductor; `/launch-implement` is the build front door; the normative stage contract lives in the `launch` skill's `workflow.md`, not in any ADR. 0015 added the discovery stage and renumbered the rail — stage numbers in ADRs 0009 and 0013 predate that renumber. 0016 gives design validation its fidelity ladder; 0013 gives existing projects the alignment on-ramp.
- **The implementation loop — read 0005, 0010, 0018, 0021, 0022.** Ralph is *the* loop (the provider seam of 0017 was removed by 0020). Two frontends share one policy, but since 0022 the workflow is the engine for every multi-ticket run (skill-mode orchestration is a declared exception; the skill supervises either way). Each run declares one integration target — trunk or a consolidation branch — implementers hand off at PR-open with the loop owning the merge gate, and every run ends with the where-it-lives recap. Completion is gated on `launchrail verify`; the user-typed hard gate lives on `/launch-implement`; the permission guard warns on unattended launches in interactive modes.
- **The engine — read 0006, plus 0012 and 0004.** Sync is a checksum-gated safe subset with in-CLI migrations and eject-as-lockfile-state. Init additively wires imports into project-owned `CLAUDE.md` (0012) and the additive-merge model for `.claude/settings.json` established in 0003 survives its supersession — 0021 reuses it for hook registration. 0004 is the browser-testing module.
- **Repo meta — 0001 (stack), 0002 (commits), 0007 (license), 0008 (releases).**

New here? Read **0020, 0019, 0018, 0006** — that covers the skill system, distribution, the conductors, and the write-safety engine. Everything else is depth.

## Maintaining this registry

- New ADRs take the next number and use [0000-template.md](0000-template.md).
- When an ADR supersedes or amends an earlier one, update the earlier ADR's `## Status` line **and this table in the same commit**. A superseded ADR's status names its successor and, in one sentence, what (if anything) survives.
- Never delete or renumber an ADR; other ADRs, docs, code comments, and migration descriptions reference them by number.
