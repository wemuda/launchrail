# ADR-0009: A single orchestrator skill fronts the workflow

## Status
Accepted — amended by [ADR-0018](0018-implement-front-door.md): `launch` absorbed feature sizing (from the retired `start-feature`), slimmed to routing, and `workflow.md` became the single normative contract. The skill is invoked `/launch` and ships as a managed file since [ADR-0019](0019-vendor-skills-retire-plugin.md). Stage numbers in this ADR predate the [ADR-0015](0015-discovery-research-stage.md) renumber — the canonical stage map is the `launch` skill's `workflow.md`. Amended by [ADR-0029](0029-planning-interaction-contract.md): the conductor also renders the six-phase view and the rail banner at every orientation, routing, and transition. Amended by [ADR-0033](0033-loop-readiness.md): stage 0 gains an optional, never-gating readiness pass (`launch-loop-readiness`) that tunes a repository for the implementation loop.

## Context
The core workflow is a chain of stages ([plugins/launchrail/docs/workflow.md](../../plugins/launchrail/docs/workflow.md)): vision, visual exploration, complexity grill, technical research, ADRs, spec, design validation, tickets, then implementation and verification. Each stage is already owned by exactly one tool — a Launchrail skill, an upstream Matt Pocock skill, or a CLI command. But a user in a consuming project has no single place to begin: they must know the stage order, remember which artifact gates which stage, and invoke the right skill by name. Newcomers stall, and it is easy to skip a stage or run one out of order. We want one entry point a user can invoke without knowing the map — one that figures out where the project is and does the next thing — while a user who *does* know the map can use the same entry point to jump straight to a stage.

## Decision
Add a `launch` skill to the plugin that acts as the loop's conductor, not a stage:

- It **detects the frontier** by reading committed artifacts (and `.launchrail.yml` / `npx @wemuda/launchrail status`), stage by stage, and drives the first stage that isn't done.
- It **routes to each stage's existing owner** — invoking the Launchrail skill, naming the upstream skill, or pointing at the CLI command — and never reimplements a stage.
- It accepts a **stage keyword** (`vision`, `deep-research`, `design-validation`, …) as a direct jump.
- When a signal is ambiguous (a template-only vision, several specs, a possibly-deliberate skip) it **asks the user** rather than assume done or not-done.
- Detection is **read-only**; every write stays inside the stage owner it routes to. It **never starts Ralph** unprompted, honoring that campaign's user-invoked-only contract.

## Alternatives considered
- **No orchestrator — keep the workflow doc as the only map.** Rejected: it puts the whole burden of stage order and artifact-gating on the user, the exact friction the toolchain exists to remove.
- **Teach the CLI to drive the workflow (`launchrail next`).** Rejected: the stages are Claude Code skills and conversations, not deterministic file writes; the CLI owns idempotent file operations, not interviews and design exploration. Detection may lean on `status`, but driving belongs in a skill.
- **One mega-skill that inlines every stage.** Rejected outright: it would duplicate `vision-creation`, `design-validation`, and the upstream Matt Pocock skills, violating the no-duplicate-skills rule and guaranteeing drift.

## Consequences
- Easier: one command to start or continue; newcomers need not memorize the map; the jump keywords give people who know it a fast path.
- Harder: the stage map now lives in two places — `docs/workflow.md` and this skill — and they must stay in sync. The skill points at the doc as the contract to keep the duplication shallow.
- Constrained: the orchestrator may only detect and route. Any real stage work added later belongs in a stage owner, not here.

## Revisit when
- The stage list or the artifacts that gate stages change (update the skill and `docs/workflow.md` together).
- Detection wants signals the CLI already computes (`detect.ts`) — expose a machine-readable `status` the skill consumes instead of re-deriving them.
- A second orchestration entry (e.g. a `commands/` slash command) is introduced and this skill would otherwise duplicate it.
