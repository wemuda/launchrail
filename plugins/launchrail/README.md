# Launchrail Claude Code plugin

Skills, commands, agents, and hooks that consuming projects subscribe to via the Launchrail marketplace. Consuming projects declare the plugin in `.claude/settings.json` — `launchrail init` sets this up (see ADR-0003).

## Skills

Start with [`launch`](skills/launch/SKILL.md) — the one entry point that detects where a project sits in the loop and routes to the stage skills below. The rest own individual stages.

| Skill | Purpose |
|---|---|
| [`launch`](skills/launch/SKILL.md) | The loop conductor: detect the project's current stage and run or route to the stage that owns the next step; jump straight to a stage by name (e.g. `deep-research`). Composes the skills below — never duplicates them ([ADR-0009](../../docs/adr/0009-launch-orchestrator-skill.md)) |
| [`project-alignment`](skills/project-alignment/SKILL.md) | The on-ramp for adopting an existing codebase (`origin: existing`): inventory what's there, infer a draft vision from the code, interview only the gaps, detect the existing design system, then hand to the loop ([ADR-0013](../../docs/adr/0013-existing-project-alignment.md)) |
| [`vision-creation`](skills/vision-creation/SKILL.md) | Turn an idea into broad product intent, assumptions, and non-goals (`docs/vision.md`) |
| [`design-validation`](skills/design-validation/SKILL.md) | Coordinate spec → Claude Design → revised spec → handoff |
| [`browser-smoke`](skills/browser-smoke/SKILL.md) | Drive the app through defined smoke journeys and capture a traceable evidence bundle (pairs with `launchrail add browser-testing`) |
| [`ralph`](skills/ralph/SKILL.md) | Orchestrate a bounded Ralph implementation campaign — fresh-context implementers over the ticket frontier, remote-verified merges, verification-gated completion (pairs with `launchrail add ralph`; user-invoked only) |
| [`ralph-implement`](skills/ralph-implement/SKILL.md) | The per-ticket implementation contract Ralph dispatches name: TDD, the `verify` gate, browser smoke, self-review, conventional commits |
| [`resolving-merge-conflicts`](skills/resolving-merge-conflicts/SKILL.md) | Resolve conflicts without losing either side's behavior — the protocol for parallel implementers landing against a moving base |

The same campaign also exists as a deterministic workflow: `launchrail add ralph` installs a managed `.claude/workflows/ralph.js` for wide or long runs (ADR-0005). The skill and the workflow share one policy block — change one, change both.

## Workflow

[docs/workflow.md](docs/workflow.md) is the stage-by-stage contract from idea to validated MVP spec: which tool owns each stage and what committed artifact it leaves behind.

Stages that upstream skills already cover are composed, not duplicated — all from [Matt Pocock's `skills`](https://github.com/mattpocock/skills) repository:

- **Complexity grill** → Matt Pocock's `grill-with-docs`
- **Technical research** → Matt Pocock's research skill, fed by the project's grill constraints
- **Spec and tickets** → Matt Pocock's `wayfinder`, `to-spec`, `to-tickets`
